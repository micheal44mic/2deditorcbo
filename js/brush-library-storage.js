(function registerBrushLibraryStorage(namespace) {
  const DB_NAME = "cbo-editor-brush-cache";
  const DB_VERSION = 1;
  const STORE_NAME = "brushLibraries";
  const LOCAL_LIBRARY_ID = "local-brush-library";

  let dbPromise = null;
  let savePromise = Promise.resolve();
  let lastStatus = null;

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

  function publishStatus(status) {
    lastStatus = status;
    namespace.lastBrushLibraryStorageStatus = status;

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("cbo:brush-library-storage-status", {
        detail: status,
      }));
    }

    return status;
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

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("Unable to open brush library cache"));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("Brush library cache is blocked"));
      };
    });

    return dbPromise;
  }

  async function load() {
    try {
      const db = await openDb();
      const transaction = db.transaction(STORE_NAME, "readonly");
      const record = await requestToPromise(transaction.objectStore(STORE_NAME).get(LOCAL_LIBRARY_ID));

      publishStatus({
        loaded: Boolean(record?.payload),
        saved: false,
        source: "brush-library-load",
        updatedAt: record?.updatedAt || "",
      });

      return record?.payload || null;
    } catch (error) {
      publishStatus({
        error: error?.message || String(error),
        loaded: false,
        saved: false,
        source: "brush-library-load",
      });

      return null;
    }
  }

  async function save(payload, options = {}) {
    const source = String(options.source || "brush-library-save").trim() || "brush-library-save";

    if (!payload || typeof payload !== "object") {
      return publishStatus({
        error: "Invalid brush library payload",
        loaded: false,
        saved: false,
        source,
      });
    }

    savePromise = savePromise
      .catch(() => {})
      .then(async () => {
        await namespace.requestPersistentStorage?.({
          source: `${source}-brush-library`,
        });

        const db = await openDb();
        const updatedAt = new Date().toISOString();
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).put({
          id: LOCAL_LIBRARY_ID,
          format: payload.format || "cbo-brush-presets",
          formatVersion: payload.formatVersion || 1,
          payload,
          updatedAt,
        });
        await transactionDone(transaction);

        return publishStatus({
          loaded: false,
          saved: true,
          source,
          updatedAt,
        });
      })
      .catch((error) => publishStatus({
        error: error?.message || String(error),
        loaded: false,
        saved: false,
        source,
      }));

    return savePromise;
  }

  async function clear(options = {}) {
    const source = String(options.source || "brush-library-clear").trim() || "brush-library-clear";

    try {
      const db = await openDb();
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).delete(LOCAL_LIBRARY_ID);
      await transactionDone(transaction);

      return publishStatus({
        cleared: true,
        loaded: false,
        saved: false,
        source,
      });
    } catch (error) {
      return publishStatus({
        cleared: false,
        error: error?.message || String(error),
        loaded: false,
        saved: false,
        source,
      });
    }
  }

  namespace.BrushLibraryStorage = {
    clear,
    getLastStatus: () => lastStatus,
    load,
    save,
  };
})(window.CBO = window.CBO || {});
