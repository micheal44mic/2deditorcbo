(function registerDocumentSaveSystem(namespace) {
  const DB_NAME = "cbo-editor-documents";
  const DB_VERSION = 1;
  const META_STORE = "meta";
  const SESSIONS_STORE = "sessions";
  const TILES_STORE = "tiles";
  const LATEST_META_KEY = "latest";
  const PROJECTS_META_KEY = "projects";
  const PROJECT_NAME_STORAGE_KEY = namespace.documentProjectNameStorageKey || "cbo-project-name";
  const TILE_SIZE = 256;
  const DOCUMENT_SAVE_FORMAT_VERSION = 1;
  const TILE_PIXEL_FORMAT = "rgba8";
  const TILE_CODECS = Object.freeze(["zstd", "gzip", "deflate"]);
  const RAW_TILE_CODEC = "raw";
  const RASTER_LAYER_TYPES = new Set(["paint", "image"]);

  namespace.documentProjectNameStorageKey = PROJECT_NAME_STORAGE_KEY;

  let dbPromise = null;
  let isSaving = false;
  let isRestoring = false;
  let cachedTileCodec = null;
  let restoreUiDepth = 0;
  let restoreUiListenersBound = false;

  const RESTORE_OVERLAY_ID = "cbo-document-restore-overlay";
  const RESTORE_BLOCKED_EVENTS = [
    "auxclick",
    "click",
    "contextmenu",
    "dblclick",
    "keydown",
    "keyup",
    "mousedown",
    "mousemove",
    "mouseup",
    "pointercancel",
    "pointerdown",
    "pointermove",
    "pointerup",
    "touchcancel",
    "touchend",
    "touchmove",
    "touchstart",
    "wheel",
  ];
  const RESTORE_BLOCKED_EVENT_OPTIONS = { capture: true, passive: false };

  function isObject(value) {
    return Boolean(value && typeof value === "object");
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function createId(prefix = "document-save") {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openDb() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB is not available"));
    }

    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(TILES_STORE)) {
          const tileStore = db.createObjectStore(TILES_STORE, { keyPath: "key" });

          tileStore.createIndex("sessionId", "sessionId", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("Unable to open document save storage"));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("Document save storage is blocked"));
      };
    });

    return dbPromise;
  }

  async function getLatestSessionId() {
    const db = await openDb();
    const transaction = db.transaction(META_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(META_STORE).get(LATEST_META_KEY));

    return typeof record?.sessionId === "string" ? record.sessionId : "";
  }

  async function getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const db = await openDb();
    const transaction = db.transaction(SESSIONS_STORE, "readonly");

    return requestToPromise(transaction.objectStore(SESSIONS_STORE).get(sessionId));
  }

  async function getAllSessions() {
    const db = await openDb();
    const transaction = db.transaction(SESSIONS_STORE, "readonly");
    const sessions = await requestToPromise(transaction.objectStore(SESSIONS_STORE).getAll());

    return (Array.isArray(sessions) ? sessions : [])
      .filter((session) => session?.id && session?.document)
      .sort((a, b) => String(b?.savedAt || "").localeCompare(String(a?.savedAt || "")));
  }

  async function getTilesForSession(sessionId) {
    if (!sessionId) {
      return [];
    }

    const db = await openDb();
    const transaction = db.transaction(TILES_STORE, "readonly");
    const tileStore = transaction.objectStore(TILES_STORE);
    const index = tileStore.index("sessionId");

    return requestToPromise(index.getAll(IDBKeyRange.only(sessionId)));
  }

  function collectRasterLayerIds(entries, result = new Set()) {
    if (!Array.isArray(entries)) {
      return result;
    }

    for (const entry of entries) {
      if (!entry) {
        continue;
      }

      if (RASTER_LAYER_TYPES.has(entry.type) && entry.id) {
        result.add(entry.id);
      }

      collectRasterLayerIds(entry.children || [], result);
    }

    return result;
  }

  function countEntries(entries) {
    if (!Array.isArray(entries)) {
      return 0;
    }

    return entries.reduce((total, entry) => {
      if (!entry) {
        return total;
      }

      return total + 1 + countEntries(entry.children || []);
    }, 0);
  }

  function pixelsAreTransparent(pixels) {
    if (!(pixels instanceof Uint8Array) || pixels.byteLength === 0) {
      return true;
    }

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) {
        return false;
      }
    }

    return true;
  }

  function clonePixels(pixels) {
    const copy = new Uint8Array(pixels.byteLength);

    copy.set(pixels);
    return copy;
  }

  function supportsTileCodec(codec) {
    if (codec === RAW_TILE_CODEC) {
      return true;
    }

    if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") {
      return false;
    }

    try {
      new CompressionStream(codec);
      new DecompressionStream(codec);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getPreferredTileCodec() {
    if (cachedTileCodec) {
      return cachedTileCodec;
    }

    cachedTileCodec = TILE_CODECS.find((codec) => supportsTileCodec(codec)) || RAW_TILE_CODEC;

    return cachedTileCodec;
  }

  function createRawTilePayload(bytes) {
    return {
      blob: new Blob([bytes], { type: "application/octet-stream" }),
      codec: RAW_TILE_CODEC,
      rawByteLength: bytes.byteLength,
      storedByteLength: bytes.byteLength,
    };
  }

  async function createCompressedTilePayload(bytes) {
    const codec = getPreferredTileCodec();

    if (codec === RAW_TILE_CODEC) {
      return createRawTilePayload(bytes);
    }

    try {
      const compressedStream = new Blob([bytes], { type: "application/octet-stream" })
        .stream()
        .pipeThrough(new CompressionStream(codec));
      const blob = await new Response(compressedStream).blob();

      if (!blob || blob.size <= 0 || blob.size >= bytes.byteLength) {
        return createRawTilePayload(bytes);
      }

      return {
        blob,
        codec,
        rawByteLength: bytes.byteLength,
        storedByteLength: blob.size,
      };
    } catch (error) {
      return createRawTilePayload(bytes);
    }
  }

  function getTileRawByteLength(tileManifest = {}, tileRecord = {}) {
    const value = tileManifest.rawByteLength ??
      tileRecord.rawByteLength ??
      tileManifest.byteLength ??
      tileRecord.byteLength;
    const number = Number(value);

    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }

  async function decodeTileBytes(tileRecord = {}, tileManifest = {}) {
    const blob = tileRecord.bytes;

    if (!blob) {
      return null;
    }

    const codec = tileRecord.codec || tileManifest.codec || RAW_TILE_CODEC;
    const rawByteLength = getTileRawByteLength(tileManifest, tileRecord);
    let buffer;

    if (codec === RAW_TILE_CODEC) {
      buffer = await blob.arrayBuffer();
    } else {
      if (typeof DecompressionStream !== "function") {
        throw new Error(`Codec document save non disponibile per il tile: ${codec}`);
      }

      const decompressedStream = blob
        .stream()
        .pipeThrough(new DecompressionStream(codec));

      buffer = await new Response(decompressedStream).arrayBuffer();
    }

    const bytes = new Uint8Array(buffer);

    if (rawByteLength != null && bytes.byteLength !== rawByteLength) {
      throw new Error(
        `Dimensione tile document save non valida: ${bytes.byteLength} byte, attesi ${rawByteLength}.`,
      );
    }

    return bytes;
  }

  function getTileStorageSummary(tileRecords = []) {
    const codecs = {};
    let rawByteLength = 0;
    let storedByteLength = 0;

    for (const tileRecord of tileRecords) {
      const codec = tileRecord?.codec || RAW_TILE_CODEC;
      const rawBytes = Number(tileRecord?.rawByteLength ?? tileRecord?.byteLength) || 0;
      const storedBytes = Number(tileRecord?.storedByteLength ?? tileRecord?.bytes?.size ?? rawBytes) || 0;

      codecs[codec] = (codecs[codec] || 0) + 1;
      rawByteLength += Math.max(0, Math.round(rawBytes));
      storedByteLength += Math.max(0, Math.round(storedBytes));
    }

    return {
      codecs,
      format: TILE_PIXEL_FORMAT,
      rawByteLength,
      storedByteLength,
      tileSize: TILE_SIZE,
    };
  }

  function createSummary(session) {
    const document = session?.document || {};
    const project = session?.project || {};

    return {
      height: Math.max(0, Math.round(document.height || 0)),
      layerCount: Math.max(0, Math.round(session?.layerCount || 0)),
      projectName: typeof project.name === "string" ? project.name : "",
      savedAt: session?.savedAt || "",
      sessionId: session?.id || "",
      tileCount: Math.max(0, Math.round(session?.tileCount || 0)),
      width: Math.max(0, Math.round(document.width || 0)),
    };
  }

  function sortSummariesBySavedAt(summaries = []) {
    return [...summaries].sort((a, b) => String(b?.savedAt || "").localeCompare(String(a?.savedAt || "")));
  }

  function normalizeSummary(value) {
    if (!value?.sessionId) {
      return null;
    }

    return {
      height: Math.max(0, Math.round(value.height || 0)),
      layerCount: Math.max(0, Math.round(value.layerCount || 0)),
      projectName: typeof value.projectName === "string" ? value.projectName : "",
      savedAt: value.savedAt || "",
      sessionId: String(value.sessionId || ""),
      tileCount: Math.max(0, Math.round(value.tileCount || 0)),
      width: Math.max(0, Math.round(value.width || 0)),
    };
  }

  async function readProjectIndex(db) {
    const transaction = db.transaction(META_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(META_STORE).get(PROJECTS_META_KEY));
    const projects = Array.isArray(record?.projects) ? record.projects : [];

    return sortSummariesBySavedAt(projects.map(normalizeSummary).filter(Boolean));
  }

  async function writeProjectIndex(db, summaries = []) {
    const projects = sortSummariesBySavedAt(summaries.map(normalizeSummary).filter(Boolean));
    const transaction = db.transaction(META_STORE, "readwrite");

    transaction.objectStore(META_STORE).put({
      key: PROJECTS_META_KEY,
      projects,
      updatedAt: new Date().toISOString(),
    });
    await transactionDone(transaction);

    return projects;
  }

  async function upsertProjectIndex(db, session) {
    const summary = createSummary(session);
    const projects = await readProjectIndex(db);
    const nextProjects = [
      summary,
      ...projects.filter((project) => project.sessionId !== summary.sessionId),
    ];

    return writeProjectIndex(db, nextProjects);
  }

  function getCurrentDocumentSaveId() {
    return String(
      namespace.currentDocumentSaveId ||
      namespace.documentSettings?.saveId ||
      "",
    ).trim();
  }

  function setCurrentDocumentSaveId(sessionId) {
    const nextSessionId = String(sessionId || "").trim();

    namespace.currentDocumentSaveId = nextSessionId;
    namespace.documentSettings = {
      ...(namespace.documentSettings || {}),
      saveId: nextSessionId,
    };

    return nextSessionId;
  }

  function normalizeProjectName(value) {
    return String(value ?? "").trim();
  }

  function getStoredProjectName() {
    try {
      return window.localStorage?.getItem(PROJECT_NAME_STORAGE_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setStoredProjectName(name) {
    try {
      window.localStorage?.setItem(PROJECT_NAME_STORAGE_KEY, name);
    } catch (error) {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }

  function getCurrentProjectName() {
    const fromApi = typeof namespace.getDocumentProjectName === "function"
      ? namespace.getDocumentProjectName()
      : "";
    const fromInput = document.querySelector(".right-sidebar-project-input")?.value || "";

    return normalizeProjectName(fromApi || fromInput || getStoredProjectName() || namespace.documentProjectName || "");
  }

  function applyProjectName(projectName, source = "document-save-restore") {
    const name = normalizeProjectName(projectName);

    namespace.documentProjectName = name;

    if (typeof namespace.setDocumentProjectName === "function") {
      namespace.setDocumentProjectName(name, { source });
      return name;
    }

    setStoredProjectName(name);

    const input = document.querySelector(".right-sidebar-project-input");

    if (input && input.value !== name) {
      input.value = name;
    }

    window.dispatchEvent(new CustomEvent("cbo:document-project-change", {
      detail: { name, source },
    }));

    return name;
  }

  function getRestoreUiTitle(options = {}) {
    return String(options.title || "Loading saved document...").trim() || "Loading saved document...";
  }

  function getRestoreUiDetail(options = {}) {
    return String(options.detail || "Restoring artboards and layers").trim() || "Restoring artboards and layers";
  }

  function ensureDocumentRestoreOverlay() {
    let overlay = document.getElementById(RESTORE_OVERLAY_ID);

    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = RESTORE_OVERLAY_ID;
    overlay.className = "cbo-document-restore-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "assertive");
    overlay.innerHTML = [
      '<div class="cbo-document-restore-panel">',
      '  <div class="cbo-document-restore-spinner" aria-hidden="true"></div>',
      '  <p class="cbo-document-restore-title" data-document-restore-title>Loading saved document...</p>',
      '  <p class="cbo-document-restore-detail" data-document-restore-detail>Restoring artboards and layers</p>',
      "</div>",
    ].join("");
    document.body.appendChild(overlay);

    return overlay;
  }

  function blockDocumentRestoreInteraction(event) {
    if (namespace.isRestoringDocumentSave !== true && restoreUiDepth <= 0) {
      return;
    }

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  }

  function bindDocumentRestoreInteractionGuard() {
    if (restoreUiListenersBound) {
      return;
    }

    restoreUiListenersBound = true;
    RESTORE_BLOCKED_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, blockDocumentRestoreInteraction, RESTORE_BLOCKED_EVENT_OPTIONS);
    });
  }

  function unbindDocumentRestoreInteractionGuard() {
    if (!restoreUiListenersBound) {
      return;
    }

    restoreUiListenersBound = false;
    RESTORE_BLOCKED_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, blockDocumentRestoreInteraction, RESTORE_BLOCKED_EVENT_OPTIONS);
    });
  }

  function shouldShowRestoreUi(options = {}) {
    return options.showRestoreOverlay !== false && options.source !== "memory-auto-recovery";
  }

  function beginDocumentRestoreUi(options = {}) {
    if (!shouldShowRestoreUi(options)) {
      return false;
    }

    restoreUiDepth += 1;

    const overlay = ensureDocumentRestoreOverlay();
    const titleNode = overlay.querySelector("[data-document-restore-title]");
    const detailNode = overlay.querySelector("[data-document-restore-detail]");

    if (titleNode) {
      titleNode.textContent = getRestoreUiTitle(options);
    }

    if (detailNode) {
      detailNode.textContent = getRestoreUiDetail(options);
    }

    document.body?.classList.add("cbo-document-restore-active");
    overlay.hidden = false;
    bindDocumentRestoreInteractionGuard();

    return true;
  }

  function endDocumentRestoreUi(didBegin = true) {
    if (!didBegin) {
      return;
    }

    restoreUiDepth = Math.max(0, restoreUiDepth - 1);

    if (restoreUiDepth > 0) {
      return;
    }

    const overlay = document.getElementById(RESTORE_OVERLAY_ID);

    if (overlay) {
      overlay.hidden = true;
    }

    document.body?.classList.remove("cbo-document-restore-active");
    unbindDocumentRestoreInteractionGuard();
  }

  function getBoundsForRects(rects = []) {
    const bounds = (Array.isArray(rects) ? rects : [])
      .map((rect) => {
        const x = Number(rect?.x);
        const y = Number(rect?.y);
        const width = Number(rect?.width);
        const height = Number(rect?.height);

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
          return null;
        }

        return {
          bottom: y + Math.max(1, height),
          left: x,
          right: x + Math.max(1, width),
          top: y,
        };
      })
      .filter(Boolean)
      .reduce((result, rect) => {
        if (!result) {
          return { ...rect };
        }

        return {
          bottom: Math.max(result.bottom, rect.bottom),
          left: Math.min(result.left, rect.left),
          right: Math.max(result.right, rect.right),
          top: Math.min(result.top, rect.top),
        };
      }, null);

    return bounds
      ? {
          height: Math.max(1, bounds.bottom - bounds.top),
          width: Math.max(1, bounds.right - bounds.left),
          x: bounds.left,
          y: bounds.top,
        }
      : null;
  }

  function getRestoreArtboardFitRect(session) {
    return namespace.getDocumentArtboardUnionRect?.() ||
      getBoundsForRects(namespace.getDocumentArtboards?.() || []) ||
      getBoundsForRects(getSessionArtboards(session)) ||
      {
        height: Math.max(1, Math.round(session?.document?.height || namespace.documentSettings?.height || 1)),
        width: Math.max(1, Math.round(session?.document?.width || namespace.documentSettings?.width || 1)),
        x: 0,
        y: 0,
      };
  }

  function fitRestoreViewToArtboards(session, options = {}) {
    const brushEngine = namespace.brushEngine;
    const camera = brushEngine?.camera;
    const fitRect = getRestoreArtboardFitRect(session);

    if (!brushEngine || !camera || !fitRect) {
      return false;
    }

    brushEngine.resizeViewport?.();

    const dpr = Math.max(1, Number(brushEngine.dpr || window.devicePixelRatio || 1));
    const viewportWidth = Math.max(1, Math.round(Number(brushEngine.viewportWidth) || brushEngine.canvas?.width || 1));
    const viewportHeight = Math.max(1, Math.round(Number(brushEngine.viewportHeight) || brushEngine.canvas?.height || 1));
    const paddingCssPx = Number.isFinite(Number(options.paddingCssPx))
      ? Math.max(0, Number(options.paddingCssPx))
      : 56;
    const maxPadding = Math.max(0, Math.min(viewportWidth, viewportHeight) * 0.22);
    const padding = Math.min(maxPadding, paddingCssPx * dpr);
    const availableWidth = Math.max(1, viewportWidth - padding * 2);
    const availableHeight = Math.max(1, viewportHeight - padding * 2);
    const boundsWidth = Math.max(1, Number(fitRect.width) || 1);
    const boundsHeight = Math.max(1, Number(fitRect.height) || 1);
    const zoom = Math.max(0.02, Math.min(32, availableWidth / boundsWidth, availableHeight / boundsHeight));

    camera.zoom = zoom;
    camera.x = (viewportWidth - boundsWidth * zoom) * 0.5 - (Number(fitRect.x) || 0) * zoom;
    camera.y = (viewportHeight - boundsHeight * zoom) * 0.5 - (Number(fitRect.y) || 0) * zoom;
    brushEngine.userManipulatedCamera = true;

    const detail = {
      camera: { ...camera },
      dpr,
      viewportHeight,
      viewportWidth,
    };

    window.dispatchEvent(new CustomEvent("cbo:camera-change", { detail }));
    brushEngine.requestDraw?.();

    return true;
  }

  function getCurrentDocumentView() {
    const camera = namespace.brushEngine?.camera;

    if (!camera) {
      return null;
    }

    const x = Number(camera.x);
    const y = Number(camera.y);
    const zoom = Number(camera.zoom);

    if (!Number.isFinite(zoom) || zoom <= 0) {
      return null;
    }

    return {
      camera: {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        zoom,
      },
    };
  }

  function getSavedDocumentViewCamera(session) {
    const camera = session?.view?.camera;

    if (!camera) {
      return null;
    }

    const x = Number(camera.x);
    const y = Number(camera.y);
    const zoom = Number(camera.zoom);

    if (!Number.isFinite(zoom) || zoom <= 0) {
      return null;
    }

    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      zoom,
    };
  }

  function applySavedDocumentView(session, source = "document-save-restore-view") {
    const savedCamera = getSavedDocumentViewCamera(session);
    const brushEngine = namespace.brushEngine;
    const camera = brushEngine?.camera;

    if (!savedCamera || !brushEngine || !camera) {
      return false;
    }

    brushEngine.resizeViewport?.();

    camera.x = savedCamera.x;
    camera.y = savedCamera.y;
    camera.zoom = savedCamera.zoom;
    brushEngine.userManipulatedCamera = true;

    const dpr = Math.max(1, Number(brushEngine.dpr || window.devicePixelRatio || 1));
    const viewportWidth = Math.max(1, Math.round(Number(brushEngine.viewportWidth) || brushEngine.canvas?.width || 1));
    const viewportHeight = Math.max(1, Math.round(Number(brushEngine.viewportHeight) || brushEngine.canvas?.height || 1));

    window.dispatchEvent(new CustomEvent("cbo:camera-change", {
      detail: {
        camera: { ...camera },
        dpr,
        source,
        viewportHeight,
        viewportWidth,
      },
    }));
    brushEngine.requestDraw?.();

    return true;
  }

  function getSessionArtboards(session) {
    return Array.isArray(session?.document?.artboards)
      ? cloneValue(session.document.artboards)
      : [];
  }

  function restoreSessionArtboards(session, source = "document-save-restore-artboards") {
    const artboards = getSessionArtboards(session);

    namespace.resetDocumentArtboards?.({
      artboards,
      defaultSecondaryCount: 0,
      documentHeight: session.document.height,
      documentWidth: session.document.width,
      source,
    });

    namespace.ensureDocumentLayerArtboardGroups?.({
      artboards: namespace.getDocumentArtboards?.() || artboards,
      history: false,
      source: `${source}-layers`,
    });

    const selectedArtboardId = String(session?.document?.selectedArtboardId || "").trim();

    if (selectedArtboardId) {
      namespace.selectDocumentArtboard?.(selectedArtboardId, {
        emit: true,
        force: true,
        source: `${source}-selection`,
      });
    }
  }

  function syncRendererAfterRestore(source = "document-save-restore") {
    const renderer = namespace.documentRenderer;

    renderer?.syncActivePaintLayerReference?.();
    renderer?.pruneOrphanRasterTargets?.();
    renderer?.invalidatePreviewCache?.(source);
    renderer?.emitContentChange?.({ source });
    renderer?.requestDraw?.();
  }

  function emitSaveStatus(status, source) {
    window.dispatchEvent(new CustomEvent("cbo:document-save-status", {
      detail: {
        source: source || "manual-save",
        status,
      },
    }));
  }

  async function captureLayerTiles(sessionId, layerId, renderer) {
    const target = renderer.rasterTargetsByLayerId?.get?.(layerId);

    if (
      !target ||
      (
        renderer.isSparseRasterTarget?.(target) !== true &&
        (!target.framebuffer || !target.texture)
      )
    ) {
      return null;
    }

    const targetRect = renderer.getRasterTargetDocumentRect?.(target);

    if (!targetRect) {
      return null;
    }

    const tileRects = renderer.getRasterHistoryTileRects?.(targetRect, { tileSize: TILE_SIZE }) || [];

    if (tileRects.length === 0) {
      return null;
    }

    const layerRecord = {
      layerId,
      rect: { ...targetRect },
      tiles: [],
    };
    const tileRecords = [];

    for (const tile of tileRects) {
      const snapshot = renderer.createRasterSnapshot?.(layerId, tile.rect, "document-save-tile");

      if (!snapshot) {
        continue;
      }

      try {
        if (!snapshot.cpuPixels) {
          renderer.dehydrateRasterSnapshot?.(snapshot);
        }

        let pixels = snapshot.cpuPixels;

        if (pixels instanceof Uint8Array) {
          const compression = window.CBO?.HistoryCompression;

          if (compression?.isCompressedEncoding?.(snapshot.cpuPixelsEncoding)) {
            try {
              pixels = compression.decompressRgba(
                pixels,
                Number(snapshot.cpuRawBytes) || 0,
                snapshot.cpuPixelsEncoding,
              );
            } catch (error) {
              console.warn?.("[CBO document save] Decompressione RLE tile fallita.", error);
              continue;
            }
          }
        }

        if (!(pixels instanceof Uint8Array) || pixelsAreTransparent(pixels)) {
          continue;
        }

        const tileKey = `${sessionId}/${layerId}/${tile.tx}/${tile.ty}`;
        const bytes = clonePixels(pixels);
        const encoded = await createCompressedTilePayload(bytes);
        const tileManifest = {
          byteLength: encoded.rawByteLength,
          codec: encoded.codec,
          format: TILE_PIXEL_FORMAT,
          key: tileKey,
          premultipliedAlpha: true,
          rawByteLength: encoded.rawByteLength,
          rect: { ...snapshot.rect },
          storedByteLength: encoded.storedByteLength,
          tx: tile.tx,
          ty: tile.ty,
        };

        layerRecord.tiles.push(tileManifest);
        tileRecords.push({
          ...tileManifest,
          bytes: encoded.blob,
          layerId,
          sessionId,
        });
      } finally {
        renderer.deleteRasterSnapshot?.(snapshot);
      }
    }

    if (layerRecord.tiles.length === 0) {
      return null;
    }

    return {
      layerRecord,
      tileRecords,
    };
  }

  async function buildCurrentSession(options = {}) {
    const renderer = namespace.documentRenderer;
    const layerModel = namespace.documentLayerModel;
    const history = namespace.documentHistory;

    if (!renderer || !layerModel?.getEntries) {
      return null;
    }

    history?.flushLayerState?.(layerModel);

    const requestedSessionId = String(options.sessionId || "").trim();
    const sessionId = requestedSessionId || getCurrentDocumentSaveId() || createId("project");
    const entries = layerModel.getEntries();
    const projectName = getCurrentProjectName();
    const rasterLayerIds = Array.from(collectRasterLayerIds(entries));
    const rasterLayers = [];
    const tileRecords = [];

    for (const layerId of rasterLayerIds) {
      const captured = await captureLayerTiles(sessionId, layerId, renderer);

      if (!captured) {
        continue;
      }

      rasterLayers.push(captured.layerRecord);
      tileRecords.push(...captured.tileRecords);
    }

    const rasterStorage = getTileStorageSummary(tileRecords);

    return {
      session: {
        activeLayerId: layerModel.activeLayerId || null,
        document: {
          artboards: namespace.getDocumentArtboards?.() || [],
          height: Math.max(1, Math.round(renderer.height || namespace.documentSettings?.height || 1)),
          presetId: namespace.documentSettings?.presetId || "",
          requestedHeight: Math.max(1, Math.round(namespace.documentSettings?.requestedHeight || renderer.height || 1)),
          requestedWidth: Math.max(1, Math.round(namespace.documentSettings?.requestedWidth || renderer.width || 1)),
          selectedArtboardId: namespace.documentArtboardModel?.getSelectedArtboardId?.() ||
            namespace.getSelectedPreviewArtboardId?.() ||
            "",
          width: Math.max(1, Math.round(renderer.width || namespace.documentSettings?.width || 1)),
        },
        entries: cloneValue(entries),
        id: sessionId,
        layerCount: countEntries(entries),
        project: {
          name: projectName,
        },
        rasterLayers,
        rasterStorage,
        referenceLayerId: history?.getReferenceLayerId?.() || null,
        savedAt: new Date().toISOString(),
        tileCount: tileRecords.length,
        tileRawByteLength: rasterStorage.rawByteLength,
        tileStoredByteLength: rasterStorage.storedByteLength,
        version: DOCUMENT_SAVE_FORMAT_VERSION,
        view: getCurrentDocumentView(),
      },
      tileRecords,
    };
  }

  async function cleanupSessionTiles(db, sessionId, keepKeys = null) {
    const normalizedSessionId = String(sessionId || "").trim();

    if (!normalizedSessionId) {
      return;
    }

    const transaction = db.transaction(TILES_STORE, "readwrite");
    const tileStore = transaction.objectStore(TILES_STORE);
    const tileIndex = tileStore.index("sessionId");
    const request = tileIndex.openCursor(IDBKeyRange.only(normalizedSessionId));
    const keys = keepKeys instanceof Set ? keepKeys : null;

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        return;
      }

      if (!keys || !keys.has(cursor.value?.key)) {
        cursor.delete();
      }

      cursor.continue();
    };

    await transactionDone(transaction);
  }

  async function writeSession(payload) {
    if (!payload?.session) {
      return null;
    }

    const db = await openDb();
    const tileKeys = new Set((payload.tileRecords || []).map((tileRecord) => tileRecord?.key).filter(Boolean));

    const transaction = db.transaction([META_STORE, SESSIONS_STORE, TILES_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const sessionStore = transaction.objectStore(SESSIONS_STORE);
    const tileStore = transaction.objectStore(TILES_STORE);

    for (const tileRecord of payload.tileRecords || []) {
      tileStore.put(tileRecord);
    }

    sessionStore.put(payload.session);
    metaStore.put({
      key: LATEST_META_KEY,
      savedAt: payload.session.savedAt,
      sessionId: payload.session.id,
    });

    await transactionDone(transaction);
    await cleanupSessionTiles(db, payload.session.id, tileKeys);
    await upsertProjectIndex(db, payload.session);

    return payload.session;
  }

  async function prepareDocumentForSave(source = "manual-save") {
    namespace.brushEngine?.flushPendingBrushHistory?.({
      source: `${source}-flush-brush-history`,
    });

    const transformTool = namespace.rasterTransformTool;

    if (transformTool?.hasPendingTransform?.()) {
      await Promise.resolve(transformTool.commitTransform?.());
    }

    if (namespace.puppetTransformTool?.isActive?.()) {
      await Promise.resolve(namespace.puppetTransformTool.rasterizeActivePuppetLayer?.());
    }

    namespace.documentRenderer?.syncActivePaintLayerReference?.();
    namespace.documentRenderer?.pruneOrphanRasterTargets?.();
    namespace.documentRenderer?.requestDraw?.();
  }

  async function saveNow(options = {}) {
    if (isRestoring) {
      return false;
    }

    if (isSaving) {
      return false;
    }

    const source = options.source || "manual-save";

    isSaving = true;
    emitSaveStatus("saving", source);

    let finishStatus = "saved";
    let payload = null;

    try {
      await prepareDocumentForSave(source);
      payload = await buildCurrentSession({
        sessionId: options.sessionId,
      });

      if (!payload) {
        finishStatus = "skipped";
        return false;
      }

      const session = await writeSession(payload);
      const summary = createSummary(session);

      setCurrentDocumentSaveId(session.id);
      namespace.lastDocumentSave = summary;
      namespace.lastDocumentSaveError = null;
      window.dispatchEvent(new CustomEvent("cbo:document-save", {
        detail: {
          ...summary,
          source,
        },
      }));

      return true;
    } catch (error) {
      finishStatus = "failed";
      namespace.lastDocumentSaveError = {
        message: error?.message || String(error),
        name: error?.name || "",
        source,
      };
      console.warn?.("Salvataggio documento non riuscito.", error);
      return false;
    } finally {
      isSaving = false;
      emitSaveStatus(finishStatus, source);
    }
  }

  function getTileMap(tileRecords = []) {
    return new Map(tileRecords.map((record) => [record.key, record]));
  }

  async function restoreTile(layerId, layerRecord, tileManifest, tileRecord, renderer) {
    const pixels = await decodeTileBytes(tileRecord, tileManifest);

    if (!(pixels instanceof Uint8Array)) {
      return false;
    }

    const snapshot = {
      bytes: pixels.byteLength,
      cpuBytes: pixels.byteLength,
      cpuPixels: pixels,
      framebuffer: null,
      id: `document-save-restore-${layerId}-${tileManifest.tx}-${tileManifest.ty}`,
      label: "document-save-restore-tile",
      layerId,
      rect: { ...tileManifest.rect },
      state: "CPU_COLD",
      targetRect: { ...layerRecord.rect },
      texture: null,
    };

    const didRestore = renderer.restoreRasterSnapshot?.(layerId, snapshot, {
      emit: false,
      pruneTransparentTiles: false,
      releaseSnapshotGpuAfterRestore: true,
      source: "document-save-restore-tile",
    }) !== false;

    renderer.deleteRasterSnapshot?.(snapshot);
    return didRestore;
  }

  function installRestoreTarget(layerRecord, renderer) {
    const layerId = layerRecord?.layerId;

    if (!layerId) {
      return null;
    }

    const sparseTarget = renderer.createSparseRasterTarget?.(layerId, {
      clearColor: [0, 0, 0, 0],
      source: "document-save-restore-sparse-target",
      tileSize: TILE_SIZE,
    });

    if (sparseTarget && renderer.isSparseRasterTarget?.(sparseTarget) === true) {
      if (typeof renderer.installRasterTargetForLayer === "function") {
        renderer.installRasterTargetForLayer(layerId, sparseTarget, {
          emit: false,
          invalidate: false,
          source: "document-save-restore-sparse-target",
        });
      } else if (renderer.rasterTargetsByLayerId?.set) {
        const previousTarget = renderer.rasterTargetsByLayerId.get?.(layerId);

        renderer.rasterTargetsByLayerId.set(layerId, sparseTarget);
        if (previousTarget && previousTarget !== sparseTarget) {
          renderer.deleteRasterTargetObject?.(previousTarget);
        }
      }

      return sparseTarget;
    }

    const denseTarget = renderer.createRasterTargetForRect?.(layerRecord.rect, [0, 0, 0, 0]);

    if (!denseTarget) {
      return null;
    }

    renderer.replaceRasterTarget?.(layerId, denseTarget, {
      emit: false,
      source: "document-save-restore-target",
    });

    return denseTarget;
  }

  async function restoreRasterLayers(session, tileRecords) {
    const renderer = namespace.documentRenderer;

    if (!renderer) {
      return false;
    }

    const tileMap = getTileMap(tileRecords);

    for (const layerRecord of session.rasterLayers || []) {
      if (!layerRecord?.layerId || !layerRecord.rect || !Array.isArray(layerRecord.tiles)) {
        continue;
      }

      if (!installRestoreTarget(layerRecord, renderer)) {
        continue;
      }

      for (const tileManifest of layerRecord.tiles) {
        const tileRecord = tileMap.get(tileManifest.key);

        if (!tileRecord?.bytes) {
          continue;
        }

        await restoreTile(layerRecord.layerId, layerRecord, tileManifest, tileRecord, renderer);
      }
    }

    renderer.emitContentChange?.({ source: "document-save-restore" });
    renderer.requestDraw?.();

    return true;
  }

  function resetRendererForRestore(session) {
    const previousRenderer = namespace.documentRenderer;
    const canvas = previousRenderer?.gl?.canvas || document.querySelector(".editor-webgl-canvas");
    const gl = previousRenderer?.gl || null;
    const layerModel = namespace.documentLayerModel ||
      previousRenderer?.layerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (!canvas || !gl || !layerModel || !namespace.DocumentRenderer) {
      namespace.initEditorCanvas?.({
        artboards: getSessionArtboards(session),
        documentHeight: session.document.height,
        documentWidth: session.document.width,
        presetId: session.document.presetId,
      });
      return namespace.documentRenderer || null;
    }

    namespace.documentHistory?.clear?.();
    previousRenderer?.dispose?.();
    namespace.documentLayerModel = layerModel;

    const viewport = namespace.DocumentRenderer.resizeCanvasViewport(canvas, gl);
    const nextRenderer = new namespace.DocumentRenderer({
      cssArtboardPaper: true,
      documentHeight: session.document.height,
      documentWidth: session.document.width,
      gl,
      layerModel,
      presetId: session.document.presetId,
      transparentBackground: true,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });

    namespace.documentRenderer = nextRenderer;

    if (namespace.brushEngine) {
      namespace.brushEngine.documentRenderer = nextRenderer;
    }

    if (namespace.smudgeEngine) {
      namespace.smudgeEngine.documentRenderer = nextRenderer;
    }

    if (namespace.rasterTransformTool) {
      namespace.rasterTransformTool.cancelTransform?.({ keepGeometry: false });
      namespace.rasterTransformTool.documentRenderer = nextRenderer;
    }

    if (namespace.puppetTransformTool) {
      namespace.puppetTransformTool.documentRenderer = nextRenderer;
    }

    window.dispatchEvent(new CustomEvent("cbo:editor-canvas-reset", {
      detail: {
        documentHeight: nextRenderer.height,
        documentWidth: nextRenderer.width,
        source: "document-save-restore-reset",
      },
    }));

    return nextRenderer;
  }

  async function restoreSession(session, tileRecords, options = {}) {
    if (!session?.document || !Array.isArray(session.entries)) {
      return false;
    }

    const stage = document.querySelector(".editor-stage");

    if (stage?.dataset.canvasReady === "true" && options.resetRenderer !== true) {
      return false;
    }

    const previousNamespaceRestoreFlag = namespace.isRestoringDocumentSave === true;
    const didBeginRestoreUi = options.restoreUiActive === true
      ? false
      : beginDocumentRestoreUi(options);

    isRestoring = true;
    namespace.isRestoringDocumentSave = true;
    let didDeferCanvasReady = false;

    try {
      if (options.resetRenderer === true && stage?.dataset.canvasReady === "true") {
        resetRendererForRestore(session);
      } else {
        namespace.initEditorCanvas?.({
          artboards: getSessionArtboards(session),
          deferReadyEvent: true,
          documentHeight: session.document.height,
          documentWidth: session.document.width,
          presetId: session.document.presetId,
        });
        didDeferCanvasReady = Boolean(namespace.documentRenderer);
      }

      const layerModel = namespace.documentLayerModel;
      const history = namespace.documentHistory;
      const restoreLayerState = () => {
        layerModel?.setEntries?.(cloneValue(session.entries), {
          history: false,
          source: "document-save-restore",
        });
        layerModel?.setActiveLayer?.(session.activeLayerId || null, {
          history: false,
          source: "document-save-restore",
        });
        history?.restoreReferenceLayerId?.(session.referenceLayerId || null, {
          emit: true,
          source: "document-save-restore",
        });
      };

      if (typeof history?.runWithoutRecording === "function") {
        history.runWithoutRecording(restoreLayerState);
      } else {
        restoreLayerState();
      }

      restoreSessionArtboards(session);
      fitRestoreViewToArtboards(session);
      await restoreRasterLayers(session, tileRecords);

      namespace.documentSettings = {
        height: session.document.height,
        presetId: session.document.presetId || "",
        projectName: applyProjectName(session.project?.name || ""),
        requestedHeight: session.document.requestedHeight || session.document.height,
        requestedWidth: session.document.requestedWidth || session.document.width,
        saveId: session.id,
        width: session.document.width,
      };
      setCurrentDocumentSaveId(session.id);
      syncRendererAfterRestore("document-save-restore-complete");
      applySavedDocumentView(session);

      if (didDeferCanvasReady) {
        namespace.emitEditorCanvasReady?.({ source: "document-save-restore" });
        didDeferCanvasReady = false;
      }

      window.dispatchEvent(new CustomEvent("cbo:document-save-restored", {
        detail: createSummary(session),
      }));

      return true;
    } catch (error) {
      if (didDeferCanvasReady) {
        namespace.emitEditorCanvasReady?.({ source: "document-save-restore-failed" });
      }

      console.warn?.("Ripristino documento salvato non riuscito.", error);
      return false;
    } finally {
      namespace.isRestoringDocumentSave = previousNamespaceRestoreFlag;
      isRestoring = false;
      endDocumentRestoreUi(didBeginRestoreUi);
    }
  }

  async function restoreLatest(options = {}) {
    const didBeginRestoreUi = beginDocumentRestoreUi({
      ...options,
      detail: options.detail || "Preparing saved artboards",
    });

    try {
      const sessionId = await getLatestSessionId();
      const session = await getSession(sessionId);

      if (!session) {
        return false;
      }

      const tileRecords = await getTilesForSession(session.id);

      return restoreSession(session, tileRecords, {
        ...options,
        restoreUiActive: didBeginRestoreUi || options.restoreUiActive === true,
      });
    } finally {
      endDocumentRestoreUi(didBeginRestoreUi);
    }
  }

  async function restore(sessionId, options = {}) {
    const normalizedSessionId = String(sessionId || "").trim();

    if (!normalizedSessionId) {
      return false;
    }

    const didBeginRestoreUi = beginDocumentRestoreUi({
      ...options,
      detail: options.detail || "Preparing saved artboards",
    });

    try {
      const session = await getSession(normalizedSessionId);

      if (!session) {
        return false;
      }

      const tileRecords = await getTilesForSession(session.id);

      return restoreSession(session, tileRecords, {
        ...options,
        restoreUiActive: didBeginRestoreUi || options.restoreUiActive === true,
      });
    } finally {
      endDocumentRestoreUi(didBeginRestoreUi);
    }
  }

  async function getLatestSummary() {
    try {
      const sessionId = await getLatestSessionId();
      const session = await getSession(sessionId);

      return session ? createSummary(session) : null;
    } catch (error) {
      return null;
    }
  }

  async function listSummaries() {
    try {
      const db = await openDb();
      const indexedProjects = await readProjectIndex(db);

      if (indexedProjects.length > 0) {
        return indexedProjects;
      }

      const sessions = await getAllSessions();
      const summaries = sessions.map(createSummary);

      if (summaries.length > 0) {
        await writeProjectIndex(db, summaries);
      }

      return summaries;
    } catch (error) {
      namespace.lastDocumentSaveListError = {
        message: error?.message || String(error),
        name: error?.name || "",
      };
      console.warn?.("Lettura progetti salvati non riuscita.", error);
      return [];
    }
  }

  async function deleteSession(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();

    if (!normalizedSessionId) {
      return false;
    }

    const db = await openDb();

    await cleanupSessionTiles(db, normalizedSessionId);

    const latestSessionId = await getLatestSessionId();
    const deleteTransaction = db.transaction([META_STORE, SESSIONS_STORE], "readwrite");
    const metaStore = deleteTransaction.objectStore(META_STORE);

    deleteTransaction.objectStore(SESSIONS_STORE).delete(normalizedSessionId);

    if (latestSessionId === normalizedSessionId) {
      metaStore.delete(LATEST_META_KEY);
    }

    await transactionDone(deleteTransaction);

    if (getCurrentDocumentSaveId() === normalizedSessionId) {
      setCurrentDocumentSaveId("");
    }

    const sessions = await getAllSessions();
    const latestSession = sessions[0] || null;

    if (latestSession) {
      const metaTransaction = db.transaction(META_STORE, "readwrite");

      metaTransaction.objectStore(META_STORE).put({
        key: LATEST_META_KEY,
        savedAt: latestSession.savedAt,
        sessionId: latestSession.id,
      });
      await transactionDone(metaTransaction);
    }

    await writeProjectIndex(db, sessions.map(createSummary));

    return true;
  }

  function clearCurrentDocument() {
    setCurrentDocumentSaveId("");
  }

  async function clear() {
    const db = await openDb();
    const transaction = db.transaction([META_STORE, SESSIONS_STORE, TILES_STORE], "readwrite");

    transaction.objectStore(META_STORE).clear();
    transaction.objectStore(SESSIONS_STORE).clear();
    transaction.objectStore(TILES_STORE).clear();
    await transactionDone(transaction);
  }

  namespace.documentSaveSystem = {
    clear,
    clearCurrentDocument,
    delete: deleteSession,
    getLatestSummary,
    listSummaries,
    restore,
    restoreLatest,
    saveNow,
  };
})(window.CBO = window.CBO || {});
