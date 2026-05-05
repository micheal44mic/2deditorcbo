(function registerDocumentAutosave(namespace) {
  const DB_NAME = "cbo-editor-autosave";
  const DB_VERSION = 1;
  const META_STORE = "meta";
  const SESSIONS_STORE = "sessions";
  const TILES_STORE = "tiles";
  const LATEST_META_KEY = "latest";
  const PROJECT_NAME_STORAGE_KEY = namespace.documentProjectNameStorageKey || "cbo-project-name";
  const TILE_SIZE = 256;
  const RASTER_LAYER_TYPES = new Set(["paint", "image"]);

  namespace.documentProjectNameStorageKey = PROJECT_NAME_STORAGE_KEY;

  let dbPromise = null;
  let isSaving = false;
  let isRestoring = false;

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

    if (!target?.framebuffer || !target?.texture) {
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
        const tileManifest = {
          byteLength: bytes.byteLength,
          key: tileKey,
          rect: { ...snapshot.rect },
          tx: tile.tx,
          ty: tile.ty,
        };

        layerRecord.tiles.push(tileManifest);
        tileRecords.push({
          ...tileManifest,
          bytes: new Blob([bytes], { type: "application/octet-stream" }),
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
        referenceLayerId: history?.getReferenceLayerId?.() || null,
        savedAt: new Date().toISOString(),
        tileCount: tileRecords.length,
        version: 1,
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

  async function writeSession(payload) {
    if (!payload?.session) {
      return null;
    }

    const db = await openDb();
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
    await cleanupOldSessions(db, payload.session.id);

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

    try {
      const payload = await buildCurrentSession();

      if (!payload) {
        finishStatus = "skipped";
        return false;
      }

      const session = await writeSession(payload);
      const summary = createSummary(session);

      namespace.lastDocumentAutosave = summary;
      window.dispatchEvent(new CustomEvent("cbo:document-autosave", {
        detail: {
          ...summary,
          source,
        },
      }));

      return true;
    } catch (error) {
      finishStatus = "failed";
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

  async function blobToPixels(blob) {
    const buffer = await blob.arrayBuffer();

    return new Uint8Array(buffer);
  }

  async function restoreTile(layerId, layerRecord, tileManifest, tileRecord, renderer) {
    const pixels = await blobToPixels(tileRecord.bytes);
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

  async function restoreSession(session, tileRecords) {
    if (!session?.document || !Array.isArray(session.entries)) {
      return false;
    }

    const stage = document.querySelector(".editor-stage");

    if (stage?.dataset.canvasReady === "true") {
      return false;
    }

    isRestoring = true;

    try {
      namespace.initEditorCanvas?.({
        documentHeight: session.document.height,
        documentWidth: session.document.width,
        presetId: session.document.presetId,
      });

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

  async function restoreLatest() {
    const sessionId = await getLatestSessionId();
    const session = await getSession(sessionId);

    if (!session) {
      return false;
    }

    const tileRecords = await getTilesForSession(session.id);

    return restoreSession(session, tileRecords);
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
    getLatestSummary,
    restoreLatest,
    saveNow,
  };
})(window.CBO = window.CBO || {});
