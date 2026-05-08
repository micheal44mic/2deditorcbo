(function registerDocumentAutosave(namespace) {
  const DB_NAME = "cbo-editor-autosave";
  const DB_VERSION = 1;
  const META_STORE = "meta";
  const SESSIONS_STORE = "sessions";
  const TILES_STORE = "tiles";
  const LATEST_META_KEY = "latest";
  const PROJECT_NAME_STORAGE_KEY = namespace.documentProjectNameStorageKey || "cbo-project-name";
  const TILE_SIZE = 256;
  const AUTOSAVE_FORMAT_VERSION = 2;
  const TILE_PIXEL_FORMAT = "rgba8";
  const TILE_CODECS = Object.freeze(["zstd", "gzip", "deflate"]);
  const RAW_TILE_CODEC = "raw";
  const RASTER_LAYER_TYPES = new Set(["paint", "image"]);

  namespace.documentProjectNameStorageKey = PROJECT_NAME_STORAGE_KEY;

  let dbPromise = null;
  let isSaving = false;
  let isRestoring = false;
  let cachedTileCodec = null;

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

  function createId(prefix = "autosave") {
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
        reject(request.error || new Error("Unable to open autosave storage"));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("Autosave storage is blocked"));
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
        throw new Error(`Codec autosave non disponibile per il tile: ${codec}`);
      }

      const decompressedStream = blob
        .stream()
        .pipeThrough(new DecompressionStream(codec));

      buffer = await new Response(decompressedStream).arrayBuffer();
    }

    const bytes = new Uint8Array(buffer);

    if (rawByteLength != null && bytes.byteLength !== rawByteLength) {
      throw new Error(
        `Dimensione tile autosave non valida: ${bytes.byteLength} byte, attesi ${rawByteLength}.`,
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

  function clearMemoryCheckpoint() {
    namespace.lastDocumentMemoryCheckpoint = null;
    namespace.lastDocumentMemoryCheckpointSummary = null;
  }

  function storeMemoryCheckpoint(payload, detail = {}) {
    if (!payload?.session) {
      return null;
    }

    const summary = {
      ...createSummary(payload.session),
      fallback: "memory",
      source: detail.source || "memory-checkpoint",
    };

    namespace.lastDocumentMemoryCheckpoint = payload;
    namespace.lastDocumentMemoryCheckpointSummary = summary;

    window.dispatchEvent(new CustomEvent("cbo:document-memory-checkpoint", {
      detail: summary,
    }));

    return summary;
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

  function applyProjectName(projectName, source = "autosave-restore") {
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
      const snapshot = renderer.createRasterSnapshot?.(layerId, tile.rect, "autosave-tile");

      if (!snapshot) {
        continue;
      }

      try {
        if (!snapshot.cpuPixels) {
          renderer.dehydrateRasterSnapshot?.(snapshot);
        }

        const pixels = snapshot.cpuPixels;

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

  async function buildCurrentSession() {
    const renderer = namespace.documentRenderer;
    const layerModel = namespace.documentLayerModel;
    const history = namespace.documentHistory;

    if (!renderer || !layerModel?.getEntries) {
      return null;
    }

    history?.flushLayerState?.(layerModel);

    const sessionId = createId("session");
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
          height: Math.max(1, Math.round(renderer.height || namespace.documentSettings?.height || 1)),
          presetId: namespace.documentSettings?.presetId || "",
          requestedHeight: Math.max(1, Math.round(namespace.documentSettings?.requestedHeight || renderer.height || 1)),
          requestedWidth: Math.max(1, Math.round(namespace.documentSettings?.requestedWidth || renderer.width || 1)),
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
        version: AUTOSAVE_FORMAT_VERSION,
      },
      tileRecords,
    };
  }

  async function cleanupOldSessions(db, keepSessionId) {
    const readTransaction = db.transaction([SESSIONS_STORE, TILES_STORE], "readonly");
    const sessions = await requestToPromise(readTransaction.objectStore(SESSIONS_STORE).getAll());
    const oldSessionIds = sessions
      .map((session) => session?.id)
      .filter((sessionId) => sessionId && sessionId !== keepSessionId);

    if (oldSessionIds.length === 0) {
      return;
    }

    const writeTransaction = db.transaction([SESSIONS_STORE, TILES_STORE], "readwrite");
    const sessionStore = writeTransaction.objectStore(SESSIONS_STORE);
    const tileStore = writeTransaction.objectStore(TILES_STORE);
    const tileIndex = tileStore.index("sessionId");

    oldSessionIds.forEach((sessionId) => {
      sessionStore.delete(sessionId);
      const request = tileIndex.openCursor(IDBKeyRange.only(sessionId));

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          return;
        }

        cursor.delete();
        cursor.continue();
      };
    });

    await transactionDone(writeTransaction);
  }

  async function writeSession(payload, options = {}) {
    if (!payload?.session) {
      return null;
    }

    const db = await openDb();

    if (options.cleanupBeforeWrite === true) {
      await cleanupOldSessions(db, payload.session.id);
    }

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

    if (options.cleanupBeforeWrite !== true) {
      await cleanupOldSessions(db, payload.session.id);
    }

    return payload.session;
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
      payload = await buildCurrentSession();

      if (!payload) {
        finishStatus = "skipped";
        return false;
      }

      const session = await writeSession(payload, {
        cleanupBeforeWrite: options.cleanupBeforeWrite === true,
      });
      const summary = createSummary(session);

      namespace.lastDocumentAutosave = summary;
      namespace.lastDocumentAutosaveError = null;
      window.dispatchEvent(new CustomEvent("cbo:document-autosave", {
        detail: {
          ...summary,
          source,
        },
      }));

      return true;
    } catch (error) {
      if (options.memoryFallback === true && payload?.session) {
        finishStatus = "saved";
        const summary = storeMemoryCheckpoint(payload, {
          error,
          source,
        });

        namespace.lastDocumentAutosaveError = null;
        namespace.lastDocumentAutosaveWarning = {
          fallback: "memory",
          message: error?.message || String(error),
          name: error?.name || "",
          source,
        };
        console.info?.("Autosave persistente saltato: uso un checkpoint in memoria per liberare GPU.");

        return summary ? "memory" : false;
      }

      finishStatus = "failed";
      namespace.lastDocumentAutosaveError = {
        message: error?.message || String(error),
        name: error?.name || "",
        source,
      };
      console.warn?.("Autosave documento non riuscito.", error);
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
      id: `autosave-restore-${layerId}-${tileManifest.tx}-${tileManifest.ty}`,
      label: "autosave-restore-tile",
      layerId,
      rect: { ...tileManifest.rect },
      state: "CPU_COLD",
      targetRect: { ...layerRecord.rect },
      texture: null,
    };

    const didRestore = renderer.restoreRasterSnapshot?.(layerId, snapshot, {
      emit: false,
      source: "autosave-restore-tile",
    }) !== false;

    renderer.deleteRasterSnapshot?.(snapshot);
    return didRestore;
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

      const target = renderer.createRasterTargetForRect?.(layerRecord.rect, [0, 0, 0, 0]);

      if (!target) {
        continue;
      }

      renderer.replaceRasterTarget?.(layerRecord.layerId, target, {
        emit: false,
        source: "autosave-restore-target",
      });

      for (const tileManifest of layerRecord.tiles) {
        const tileRecord = tileMap.get(tileManifest.key);

        if (!tileRecord?.bytes) {
          continue;
        }

        await restoreTile(layerRecord.layerId, layerRecord, tileManifest, tileRecord, renderer);
      }
    }

    renderer.emitContentChange?.({ source: "autosave-restore" });
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
      documentHeight: session.document.height,
      documentWidth: session.document.width,
      gl,
      layerModel,
      presetId: session.document.presetId,
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
        source: "autosave-restore-reset",
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

    isRestoring = true;

    try {
      if (options.resetRenderer === true && stage?.dataset.canvasReady === "true") {
        resetRendererForRestore(session);
      } else {
        namespace.initEditorCanvas?.({
          documentHeight: session.document.height,
          documentWidth: session.document.width,
          presetId: session.document.presetId,
        });
      }

      const layerModel = namespace.documentLayerModel;
      const history = namespace.documentHistory;

      history?.runWithoutRecording?.(() => {
        layerModel?.setEntries?.(cloneValue(session.entries), {
          history: false,
          source: "autosave-restore",
        });
        layerModel?.setActiveLayer?.(session.activeLayerId || null, {
          history: false,
          source: "autosave-restore",
        });
        history?.restoreReferenceLayerId?.(session.referenceLayerId || null, {
          emit: true,
          source: "autosave-restore",
        });
      });

      await restoreRasterLayers(session, tileRecords);

      namespace.documentSettings = {
        height: session.document.height,
        presetId: session.document.presetId || "",
        projectName: applyProjectName(session.project?.name || ""),
        requestedHeight: session.document.requestedHeight || session.document.height,
        requestedWidth: session.document.requestedWidth || session.document.width,
        width: session.document.width,
      };

      window.dispatchEvent(new CustomEvent("cbo:document-autosave-restored", {
        detail: createSummary(session),
      }));

      return true;
    } catch (error) {
      console.warn?.("Ripristino autosave non riuscito.", error);
      return false;
    } finally {
      isRestoring = false;
    }
  }

  async function restoreLatest(options = {}) {
    const sessionId = await getLatestSessionId();
    const session = await getSession(sessionId);

    if (!session) {
      return false;
    }

    const tileRecords = await getTilesForSession(session.id);

    return restoreSession(session, tileRecords, options);
  }

  async function restoreMemoryCheckpoint(options = {}) {
    const payload = namespace.lastDocumentMemoryCheckpoint;

    if (!payload?.session) {
      return false;
    }

    const didRestore = await restoreSession(payload.session, payload.tileRecords || [], options);

    if (didRestore && options.clearAfterRestore !== false) {
      clearMemoryCheckpoint();
    }

    return didRestore;
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

  async function clear() {
    const db = await openDb();
    const transaction = db.transaction([META_STORE, SESSIONS_STORE, TILES_STORE], "readwrite");

    transaction.objectStore(META_STORE).clear();
    transaction.objectStore(SESSIONS_STORE).clear();
    transaction.objectStore(TILES_STORE).clear();
    await transactionDone(transaction);
  }

  namespace.documentAutosave = {
    clear,
    clearMemoryCheckpoint,
    getLatestSummary,
    restoreMemoryCheckpoint,
    restoreLatest,
    saveNow,
  };
})(window.CBO = window.CBO || {});
