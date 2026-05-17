(function registerPixelWorkerClient(namespace) {
  const DEFAULT_TIMEOUT_MS = 4000;
  const DEFAULT_WORKER_URL = "./js/workers/pixel-worker.js?v=android-v3.4-fillworker-sparse";

  class PixelWorkerClient {
    constructor(options = {}) {
      this.nextId = 1;
      this.pending = new Map();
      this.unavailable = false;
      this.worker = null;
      this.workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
    }

    getSupported() {
      return typeof Worker === "function" && this.unavailable !== true;
    }

    ensureWorker() {
      if (!this.getSupported()) {
        return null;
      }

      if (this.worker) {
        return this.worker;
      }

      try {
        this.worker = new Worker(this.workerUrl);
      } catch (error) {
        this.unavailable = true;
        namespace.lastPixelWorkerError = error;
        return null;
      }

      this.worker.onmessage = (event) => {
        const message = event.data || {};
        const pending = this.pending.get(message.id);

        if (!pending) {
          return;
        }

        this.pending.delete(message.id);
        window.clearTimeout(pending.timeoutId);

        if (message.ok === false) {
          pending.reject(new Error(message.error || "Pixel worker failed."));
          return;
        }

        pending.resolve(message.result);
      };

      this.worker.onerror = (event) => {
        this.unavailable = true;
        namespace.lastPixelWorkerError = event?.error || event?.message || event;

        this.pending.forEach((pending) => {
          window.clearTimeout(pending.timeoutId);
          pending.reject(new Error("Pixel worker unavailable."));
        });
        this.pending.clear();
        this.terminate();
      };

      return this.worker;
    }

    run(type, payload = {}, transferList = [], options = {}) {
      const worker = this.ensureWorker();

      if (!worker) {
        return Promise.reject(new Error("Pixel worker unavailable."));
      }

      const id = this.nextId;
      this.nextId += 1;

      const timeoutMs = Math.max(250, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
      const timeoutId = window.setTimeout(() => {
        const pending = this.pending.get(id);

        if (!pending) {
          return;
        }

        this.pending.delete(id);
        pending.reject(new Error(`Pixel worker timed out for ${type}.`));
      }, timeoutMs);

      const promise = new Promise((resolve, reject) => {
        this.pending.set(id, { reject, resolve, timeoutId });
      });

      try {
        worker.postMessage({ id, payload, type }, transferList);
      } catch (error) {
        this.pending.delete(id);
        window.clearTimeout(timeoutId);
        return Promise.reject(error);
      }

      return promise;
    }

    runColorFill(payload = {}, transferList = [], options = {}) {
      return this.run("color-fill", payload, transferList, options);
    }

    terminate() {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
    }
  }

  namespace.PixelWorkerClient = PixelWorkerClient;
  namespace.createPixelWorkerClient = function createPixelWorkerClient(options = {}) {
    const client = new PixelWorkerClient(options);

    namespace.pixelWorkerClient = client;

    return client;
  };
  namespace.pixelWorkerClient = namespace.pixelWorkerClient || new PixelWorkerClient();
})(window.CBO = window.CBO || {});
