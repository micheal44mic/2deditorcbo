(function registerDocumentAssetCache(namespace) {
  const DB_NAME = "cbo-editor-asset-cache";
  const DB_VERSION = 1;
  const ASSETS_STORE = "assets";
  const MEDIA_URL_FIELDS = Object.freeze(["src", "previewSrc", "posterSrc", "canvasPreviewSrc"]);

  let dbPromise = null;
  const objectUrlsByAssetId = new Map();

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !(value instanceof Blob));
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

  function createId(prefix = "asset") {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function normalizeUrl(value) {
    return String(value || "").trim();
  }

  function hasScheme(value) {
    return /^[a-z][a-z0-9+.-]*:/i.test(value);
  }

  function getAbsoluteSourceKey(src) {
    const value = normalizeUrl(src);

    if (!value) {
      return "";
    }

    if (value.startsWith("data:")) {
      return `data:${hashString(value)}:${value.length}`;
    }

    if (value.startsWith("blob:")) {
      return value;
    }

    try {
      return new URL(value, document.baseURI).href;
    } catch (error) {
      return value;
    }
  }

  function shouldCacheUrl(src) {
    const value = normalizeUrl(src);

    if (!value || value.startsWith("#") || value.startsWith("cbo-asset:")) {
      return false;
    }

    if (/^(javascript|mailto|tel):/i.test(value)) {
      return false;
    }

    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("//")) {
      return true;
    }

    if (/^https?:/i.test(value)) {
      return true;
    }

    return !hasScheme(value);
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

        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          const store = db.createObjectStore(ASSETS_STORE, { keyPath: "id" });

          store.createIndex("sourceKey", "sourceKey", { unique: false });
          store.createIndex("sessionId", "sessionId", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("Unable to open document asset cache"));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("Document asset cache is blocked"));
      };
    });

    return dbPromise;
  }

  async function getAsset(id) {
    const normalizedId = String(id || "").trim();

    if (!normalizedId) {
      return null;
    }

    const db = await openDb();
    const transaction = db.transaction(ASSETS_STORE, "readonly");

    return requestToPromise(transaction.objectStore(ASSETS_STORE).get(normalizedId));
  }

  async function getAssetBySourceKey(sourceKey) {
    const normalizedSourceKey = String(sourceKey || "").trim();

    if (!normalizedSourceKey) {
      return null;
    }

    const db = await openDb();
    const transaction = db.transaction(ASSETS_STORE, "readonly");

    return requestToPromise(transaction.objectStore(ASSETS_STORE).index("sourceKey").get(normalizedSourceKey));
  }

  function createAssetManifest(record, originalSrc = "") {
    if (!record?.id) {
      return null;
    }

    return {
      cachedAt: record.updatedAt || record.createdAt || "",
      id: record.id,
      kind: record.kind || "",
      name: record.name || "",
      originalSrc: originalSrc || record.source || "",
      size: Math.max(0, Math.round(Number(record.size) || Number(record.blob?.size) || 0)),
      type: record.type || record.blob?.type || "",
    };
  }

  async function writeAssetRecord(record) {
    const db = await openDb();
    const transaction = db.transaction(ASSETS_STORE, "readwrite");

    transaction.objectStore(ASSETS_STORE).put(record);
    await transactionDone(transaction);
    return record;
  }

  async function cacheBlob(blob, options = {}) {
    if (!(blob instanceof Blob)) {
      return null;
    }

    await namespace.requestPersistentStorage?.({
      source: options.source || "document-asset-cache",
    });

    const sourceKey = String(options.sourceKey || "").trim();
    const existing = sourceKey ? await getAssetBySourceKey(sourceKey).catch(() => null) : null;
    const now = new Date().toISOString();
    const record = {
      blob,
      createdAt: existing?.createdAt || now,
      field: String(options.field || ""),
      id: existing?.id || options.id || createId(`asset-${hashString(sourceKey || options.name || now)}`),
      kind: String(options.kind || existing?.kind || ""),
      name: String(options.name || existing?.name || ""),
      sessionId: String(options.sessionId || existing?.sessionId || ""),
      size: Math.max(0, Math.round(Number(blob.size) || 0)),
      source: String(options.originalSrc || options.src || existing?.source || ""),
      sourceKey,
      type: String(blob.type || options.type || existing?.type || "application/octet-stream"),
      updatedAt: now,
    };

    await writeAssetRecord(record);
    return createAssetManifest(record, options.originalSrc || options.src || record.source);
  }

  async function fetchBlobFromUrl(src) {
    const response = await fetch(src);

    if (!response?.ok && response?.status !== 0) {
      throw new Error(`Unable to cache asset: ${response.status}`);
    }

    return response.blob();
  }

  async function cacheUrl(src, options = {}) {
    const originalSrc = normalizeUrl(src);

    if (!shouldCacheUrl(originalSrc)) {
      return null;
    }

    const sourceKey = getAbsoluteSourceKey(originalSrc);
    const existing = await getAssetBySourceKey(sourceKey).catch(() => null);

    if (existing?.blob) {
      const refreshed = {
        ...existing,
        sessionId: String(options.sessionId || existing.sessionId || ""),
        updatedAt: new Date().toISOString(),
      };

      await writeAssetRecord(refreshed);
      return createAssetManifest(refreshed, originalSrc);
    }

    const blob = await fetchBlobFromUrl(originalSrc);

    return cacheBlob(blob, {
      ...options,
      originalSrc,
      sourceKey,
      src: originalSrc,
      type: blob.type || options.type,
    });
  }

  function setCachedAssetRef(target, field, manifest, group = "") {
    if (!target || !manifest?.id) {
      return;
    }

    target.cachedAssets = isObject(target.cachedAssets) ? target.cachedAssets : {};

    if (group) {
      target.cachedAssets[group] = isObject(target.cachedAssets[group]) ? target.cachedAssets[group] : {};
      target.cachedAssets[group][field] = manifest;
      return;
    }

    target.cachedAssets[field] = manifest;
  }

  function getCachedAssetRef(target, field, group = "") {
    return group ? target?.cachedAssets?.[group]?.[field] : target?.cachedAssets?.[field];
  }

  function getOriginalSourceRef(target, field, group = "") {
    return group ? target?.originalSources?.[group]?.[field] : target?.originalSources?.[field];
  }

  async function cacheMediaField(media, field, options = {}, group = "") {
    const sourceHost = group ? media?.[group] : media;
    const src = normalizeUrl(sourceHost?.[field]);

    if (!src) {
      return null;
    }

    const existingRef = getCachedAssetRef(media, field, group);
    const originalRef = getOriginalSourceRef(media, field, group);

    if (
      existingRef?.id &&
      (
        src.startsWith("blob:") ||
        src === existingRef.originalSrc ||
        originalRef === existingRef.originalSrc
      )
    ) {
      return existingRef;
    }

    try {
      const manifest = await cacheUrl(src, {
        field: group ? `${group}.${field}` : field,
        kind: media?.kind || "",
        name: media?.name || "",
        sessionId: options.sessionId,
        source: options.source || "ai-workspace-cache",
      });

      if (manifest) {
        setCachedAssetRef(media, field, manifest, group);
      }

      return manifest;
    } catch (error) {
      console.warn?.("[CBO asset cache] Asset non salvato in cache.", error);
      return null;
    }
  }

  async function prepareGeneratedMedia(media, options = {}) {
    if (!isObject(media)) {
      return media;
    }

    for (const field of MEDIA_URL_FIELDS) {
      await cacheMediaField(media, field, options);
    }

    for (const group of ["variants", "posters"]) {
      if (!isObject(media[group])) {
        continue;
      }

      for (const field of Object.keys(media[group])) {
        await cacheMediaField(media, field, options, group);
      }
    }

    return media;
  }

  async function prepareAiWorkspace(workspace, options = {}) {
    const nextWorkspace = cloneValue(workspace || {});
    const boards = Array.isArray(nextWorkspace.boards)
      ? nextWorkspace.boards
      : Array.isArray(nextWorkspace.spaceBoards)
        ? nextWorkspace.spaceBoards
        : [];

    for (const board of boards) {
      if (board?.generatedMedia) {
        await prepareGeneratedMedia(board.generatedMedia, options);
      }
    }

    nextWorkspace.assetCacheVersion = 1;
    return nextWorkspace;
  }

  async function resolveCachedAssetUrl(ref) {
    const assetId = String(ref?.id || "").trim();

    if (!assetId) {
      return "";
    }

    if (objectUrlsByAssetId.has(assetId)) {
      return objectUrlsByAssetId.get(assetId);
    }

    const record = await getAsset(assetId).catch(() => null);

    if (!record?.blob) {
      return "";
    }

    const objectUrl = URL.createObjectURL(record.blob);

    objectUrlsByAssetId.set(assetId, objectUrl);
    return objectUrl;
  }

  async function hydrateMediaField(media, field, group = "") {
    const ref = group ? media?.cachedAssets?.[group]?.[field] : media?.cachedAssets?.[field];
    const objectUrl = await resolveCachedAssetUrl(ref);

    if (!objectUrl) {
      return false;
    }

    const sourceHost = group ? media?.[group] : media;

    if (!sourceHost) {
      return false;
    }

    media.originalSources = isObject(media.originalSources) ? media.originalSources : {};

    if (group) {
      media.originalSources[group] = isObject(media.originalSources[group]) ? media.originalSources[group] : {};
      media.originalSources[group][field] = sourceHost[field] || ref.originalSrc || "";
    } else {
      media.originalSources[field] = sourceHost[field] || ref.originalSrc || "";
    }

    sourceHost[field] = objectUrl;
    return true;
  }

  async function hydrateGeneratedMedia(media) {
    if (!isObject(media) || !isObject(media.cachedAssets)) {
      return media;
    }

    for (const field of MEDIA_URL_FIELDS) {
      await hydrateMediaField(media, field);
    }

    for (const group of ["variants", "posters"]) {
      if (!isObject(media[group]) || !isObject(media.cachedAssets[group])) {
        continue;
      }

      for (const field of Object.keys(media.cachedAssets[group])) {
        await hydrateMediaField(media, field, group);
      }
    }

    return media;
  }

  async function hydrateAiWorkspace(workspace) {
    const nextWorkspace = cloneValue(workspace || {});
    const boards = Array.isArray(nextWorkspace.boards)
      ? nextWorkspace.boards
      : Array.isArray(nextWorkspace.spaceBoards)
        ? nextWorkspace.spaceBoards
        : [];

    for (const board of boards) {
      if (board?.generatedMedia) {
        await hydrateGeneratedMedia(board.generatedMedia);
      }
    }

    return nextWorkspace;
  }

  function revokeObjectUrls() {
    for (const objectUrl of objectUrlsByAssetId.values()) {
      URL.revokeObjectURL(objectUrl);
    }

    objectUrlsByAssetId.clear();
  }

  async function clear() {
    const db = await openDb();
    const transaction = db.transaction(ASSETS_STORE, "readwrite");

    transaction.objectStore(ASSETS_STORE).clear();
    await transactionDone(transaction);
    revokeObjectUrls();
  }

  namespace.documentAssetCache = {
    cacheBlob,
    cacheUrl,
    clear,
    hydrateAiWorkspace,
    prepareAiWorkspace,
    revokeObjectUrls,
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", revokeObjectUrls);
  }
})(window.CBO = window.CBO || {});
