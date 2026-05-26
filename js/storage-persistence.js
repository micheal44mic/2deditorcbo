(function registerStoragePersistence(namespace) {
  let persistencePromise = null;

  function isStorageSupported() {
    return typeof navigator !== "undefined" && Boolean(navigator.storage);
  }

  async function getStorageEstimate() {
    if (!isStorageSupported() || typeof navigator.storage.estimate !== "function") {
      return {
        quota: 0,
        usage: 0,
      };
    }

    try {
      const estimate = await navigator.storage.estimate();

      return {
        quota: Math.max(0, Math.round(Number(estimate?.quota) || 0)),
        usage: Math.max(0, Math.round(Number(estimate?.usage) || 0)),
      };
    } catch (error) {
      return {
        error: error?.message || String(error),
        quota: 0,
        usage: 0,
      };
    }
  }

  async function isStoragePersisted() {
    if (!isStorageSupported() || typeof navigator.storage.persisted !== "function") {
      return false;
    }

    try {
      return await navigator.storage.persisted();
    } catch (error) {
      return false;
    }
  }

  async function requestPersistentStorage(options = {}) {
    if (persistencePromise && options.force !== true) {
      return persistencePromise;
    }

    persistencePromise = (async () => {
      const source = String(options.source || "storage-persistence").trim() || "storage-persistence";
      const supported = isStorageSupported();
      const estimate = await getStorageEstimate();
      let persisted = false;
      let granted = false;
      let errorMessage = "";

      if (supported) {
        persisted = await isStoragePersisted();

        if (!persisted && typeof navigator.storage.persist === "function") {
          try {
            granted = await navigator.storage.persist();
            persisted = granted || await isStoragePersisted();
          } catch (error) {
            errorMessage = error?.message || String(error);
          }
        }
      }

      const status = {
        error: errorMessage,
        granted,
        persisted,
        quota: estimate.quota,
        source,
        supported,
        usage: estimate.usage,
      };

      namespace.lastPersistentStorageStatus = status;

      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("cbo:persistent-storage-status", {
          detail: status,
        }));
      }

      return status;
    })();

    try {
      return await persistencePromise;
    } finally {
      if (options.force === true) {
        persistencePromise = null;
      }
    }
  }

  namespace.getPersistentStorageEstimate = getStorageEstimate;
  namespace.isStoragePersisted = isStoragePersisted;
  namespace.requestPersistentStorage = requestPersistentStorage;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      window.setTimeout(() => {
        void requestPersistentStorage({ source: "startup" });
      }, 0);
    });
  }
})(window.CBO = window.CBO || {});
