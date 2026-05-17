(function registerPixelWorkerClient(namespace) {
  const DEFAULT_TIMEOUT_MS = 4000;
  const DEFAULT_WORKER_URL = "./js/workers/pixel-worker.js?v=android-v3.8-history-metrics";
  const HISTORY_COMPRESSION_TIMEOUT_MS = 120000;
  const HISTORY_COMPRESSION_MIN_BYTES = 128 * 1024;
  const HISTORY_COMPRESSION_ANDROID_MAX_PENDING_BYTES = 32 * 1024 * 1024;
  const HISTORY_COMPRESSION_DESKTOP_MAX_PENDING_BYTES = 128 * 1024 * 1024;
  const HISTORY_COMPRESSION_TOAST_HIDE_MS = 2200;

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

    runHistoryCompress(payload = {}, transferList = [], options = {}) {
      return this.run("history-compress", payload, transferList, options);
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

  let historyCompressionSequence = 0;
  let historyCompressionInFlight = 0;
  let historyCompressionPendingRawBytes = 0;
  let historyCompressionPumpTimer = 0;
  let historyCompressionToast = null;
  let historyCompressionToastTimer = 0;
  const historyCompressionQueue = [];

  function nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }

    return Date.now();
  }

  function getHistoryCompressionConfig() {
    const isAndroid = namespace.androidPerformanceMode === true ||
      namespace.deviceIsAndroid === true ||
      namespace.DocumentRenderer?.isAndroidLikeEnvironment?.() === true;
    const maxInFlight = Number(namespace.historyCompressionMaxInFlight);
    const maxPendingRawBytes = Number(namespace.historyCompressionMaxPendingRawBytes);
    const minBytes = Number(namespace.historyCompressionMinBytes);
    const initialDelayMs = Number(namespace.historyCompressionInitialDelayMs);

    return {
      initialDelayMs: Number.isFinite(initialDelayMs)
        ? Math.max(0, initialDelayMs)
        : (isAndroid ? 350 : 90),
      maxInFlight: Number.isFinite(maxInFlight)
        ? Math.max(1, Math.floor(maxInFlight))
        : (isAndroid ? 1 : 2),
      maxPendingRawBytes: Number.isFinite(maxPendingRawBytes)
        ? Math.max(0, Math.floor(maxPendingRawBytes))
        : (
            isAndroid
              ? HISTORY_COMPRESSION_ANDROID_MAX_PENDING_BYTES
              : HISTORY_COMPRESSION_DESKTOP_MAX_PENDING_BYTES
          ),
      minBytes: Number.isFinite(minBytes)
        ? Math.max(0, Math.floor(minBytes))
        : HISTORY_COMPRESSION_MIN_BYTES,
      timeoutMs: Math.max(
        1000,
        Number(namespace.historyCompressionTimeoutMs) || HISTORY_COMPRESSION_TIMEOUT_MS,
      ),
    };
  }

  function setHistoryCompressionStatus(status) {
    const queueStatus = {
      pendingRawBytes: historyCompressionPendingRawBytes,
      queueLength: historyCompressionQueue.length,
      status,
      timestamp: Date.now(),
    };

    namespace.lastHistoryCompressionQueue = queueStatus;

    if (!namespace.lastHistoryCompressionWorker) {
      namespace.lastHistoryCompressionWorker = queueStatus;
    }
  }

  function ensureHistoryCompressionToast() {
    if (historyCompressionToast) {
      return historyCompressionToast;
    }

    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }

    historyCompressionToast = document.getElementById?.("cbo-history-compression-toast") || null;

    if (!historyCompressionToast) {
      historyCompressionToast = document.createElement("div");
      historyCompressionToast.id = "cbo-history-compression-toast";
      historyCompressionToast.className = "cbo-layer-limit-toast cbo-history-compression-toast";
      historyCompressionToast.hidden = true;
      historyCompressionToast.setAttribute("role", "status");
      historyCompressionToast.setAttribute("aria-live", "polite");
      document.body.appendChild(historyCompressionToast);
    }

    return historyCompressionToast;
  }

  function formatHistoryMs(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return "0";
    }

    return number >= 10 ? String(Math.round(number)) : number.toFixed(1);
  }

  function getHistoryCompressionToastLabel(details = {}) {
    const timings = details.timings || {};
    const readPixelsMs = Number(details.readPixelsMs ?? timings.readPixelsMs) || 0;
    const workerMs = Number(timings.workerMs ?? timings.compressMs ?? details.workerMs) || 0;
    const roundTripMs = Number(timings.roundTripMs ?? details.roundTripMs) || 0;

    if (details.status === "queued") {
      return `History: read ${formatHistoryMs(readPixelsMs)}ms, queued`;
    }

    if (details.status === "skipped") {
      return details.reason === "queue-full"
        ? "History: RAW, queue full"
        : "History: RAW";
    }

    if (details.status === "error") {
      return "History: worker fallback";
    }

    if (details.status === "applied") {
      const ratio = Number.isFinite(Number(details.ratio))
        ? `${Number(details.ratio).toFixed(2)}x`
        : "compressed";

      return `History: read ${formatHistoryMs(readPixelsMs)}ms, worker ${formatHistoryMs(workerMs || roundTripMs)}ms, ${ratio}`;
    }

    return "History: pending";
  }

  function showHistoryCompressionToast(details = {}) {
    if (namespace.historyCompressionStatusToastEnabled === false) {
      return;
    }

    const toast = ensureHistoryCompressionToast();

    if (!toast) {
      return;
    }

    window.clearTimeout(historyCompressionToastTimer);
    toast.textContent = getHistoryCompressionToastLabel(details);
    toast.dataset.historyCompressionStatus = details.status || "pending";
    toast.hidden = false;
    historyCompressionToastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, HISTORY_COMPRESSION_TOAST_HIDE_MS);
  }

  function canApplyHistoryCompression(job, result) {
    const target = job?.target;

    return Boolean(
      target &&
      target.historyCompressionJobToken === job.jobToken &&
      target.state === "CPU_COLD" &&
      !target.texture &&
      !target.framebuffer &&
      target.cpuPixels instanceof Uint8Array &&
      target.cpuPixelsEncoding == null &&
      result?.jobToken === job.jobToken &&
      result?.compressedBuffer &&
      result?.encoding &&
      result.compressedBytes > 0 &&
      result.compressedBytes < job.rawBytes
    );
  }

  function applyHistoryCompressionResult(job, result, startedAt) {
    const target = job.target;
    const elapsedMs = nowMs() - startedAt;

    if (!canApplyHistoryCompression(job, result)) {
      if (
        target?.historyCompressionJobToken === job.jobToken &&
        target.state === "CPU_COLD" &&
        !target.texture &&
        !target.framebuffer
      ) {
        target.historyCompressionState = "raw";
      }

      namespace.lastHistoryCompressionWorker = {
        applied: false,
        engine: result?.engine || "js",
        historyId: job.historyId,
        kind: job.kind,
        layerId: job.layerId,
        pendingRawBytes: historyCompressionPendingRawBytes,
        queueLength: historyCompressionQueue.length,
        reason: "stale-or-not-smaller",
        readPixelsMs: job.readPixelsMs,
        rawBytes: job.rawBytes,
        status: "skipped",
        timings: {
          ...(result?.timings || {}),
          readPixelsMs: job.readPixelsMs,
          roundTripMs: elapsedMs,
        },
        timestamp: Date.now(),
      };
      showHistoryCompressionToast(namespace.lastHistoryCompressionWorker);
      return;
    }

    const compressedPixels = new Uint8Array(result.compressedBuffer);

    target.cpuPixels = compressedPixels;
    target.cpuPixelsEncoding = result.encoding;
    target.cpuBytes = compressedPixels.byteLength;
    target.cpuRawBytes = result.rawBytes || job.rawBytes;
    target.historyCompressionEngine = result.engine || "js";
    target.historyCompressionState = "compressed";
    target.historyCompressionTimings = {
      ...(result.timings || {}),
      readPixelsMs: job.readPixelsMs,
      roundTripMs: elapsedMs,
    };

    namespace.lastHistoryCompressionWorker = {
      applied: true,
      compressedBytes: compressedPixels.byteLength,
      engine: target.historyCompressionEngine,
      historyId: job.historyId,
      kind: job.kind,
      layerId: job.layerId,
      pendingRawBytes: historyCompressionPendingRawBytes,
      queueLength: historyCompressionQueue.length,
      readPixelsMs: job.readPixelsMs,
      rawBytes: job.rawBytes,
      ratio: compressedPixels.byteLength / Math.max(1, job.rawBytes),
      status: "applied",
      timings: target.historyCompressionTimings,
      timestamp: Date.now(),
    };
    showHistoryCompressionToast(namespace.lastHistoryCompressionWorker);
  }

  function scheduleHistoryCompressionPump(delayMs = 0) {
    if (historyCompressionPumpTimer) {
      return;
    }

    const delay = Math.max(0, Math.round(Number(delayMs) || 0));

    historyCompressionPumpTimer = window.setTimeout(() => {
      historyCompressionPumpTimer = 0;
      pumpHistoryCompressionQueue();
    }, delay);
  }

  function finishHistoryCompressionJob(job) {
    historyCompressionInFlight = Math.max(0, historyCompressionInFlight - 1);
    historyCompressionPendingRawBytes = Math.max(0, historyCompressionPendingRawBytes - job.rawBytes);
    scheduleHistoryCompressionPump();
  }

  function startHistoryCompressionJob(job, config) {
    const client = namespace.pixelWorkerClient;

    if (!client?.runHistoryCompress) {
      if (job.target?.historyCompressionJobToken === job.jobToken) {
        job.target.historyCompressionState = "raw";
      }
      finishHistoryCompressionJob(job);
      return;
    }

    const target = job.target;

    if (target?.historyCompressionJobToken !== job.jobToken) {
      finishHistoryCompressionJob(job);
      return;
    }

    target.historyCompressionState = "compressing";
    const startedAt = nowMs();
    const payload = {
      historyId: job.historyId,
      jobToken: job.jobToken,
      kind: job.kind,
      layerId: job.layerId,
      pixelsBuffer: job.pixels.buffer,
      rawBytes: job.rawBytes,
      source: job.source,
    };

    client.runHistoryCompress(payload, [job.pixels.buffer], {
      timeoutMs: config.timeoutMs,
    }).then((result) => {
      applyHistoryCompressionResult(job, result, startedAt);
    }).catch((error) => {
      if (
        target?.historyCompressionJobToken === job.jobToken &&
        target.state === "CPU_COLD" &&
        !target.texture &&
        !target.framebuffer
      ) {
        target.historyCompressionState = "raw";
      }

      namespace.lastHistoryCompressionWorker = {
        error: error?.message || String(error),
        historyId: job.historyId,
        kind: job.kind,
        layerId: job.layerId,
        pendingRawBytes: historyCompressionPendingRawBytes,
        queueLength: historyCompressionQueue.length,
        readPixelsMs: job.readPixelsMs,
        rawBytes: job.rawBytes,
        status: "error",
        timestamp: Date.now(),
      };
      showHistoryCompressionToast(namespace.lastHistoryCompressionWorker);
    }).finally(() => {
      finishHistoryCompressionJob(job);
    });
  }

  function pumpHistoryCompressionQueue() {
    const config = getHistoryCompressionConfig();

    if (namespace.lastColorFillWorker?.status === "pending") {
      scheduleHistoryCompressionPump(60);
      setHistoryCompressionStatus("pending");
      return;
    }

    while (
      historyCompressionInFlight < config.maxInFlight &&
      historyCompressionQueue.length > 0
    ) {
      const job = historyCompressionQueue.shift();

      historyCompressionInFlight += 1;
      startHistoryCompressionJob(job, config);
    }

    setHistoryCompressionStatus(historyCompressionQueue.length > 0 || historyCompressionInFlight > 0 ? "pending" : "idle");
  }

  function enqueueHistoryCompression(target, options = {}) {
    const config = getHistoryCompressionConfig();
    const pixels = target?.cpuPixels;
    const rawBytes = Math.max(0, Math.round(Number(target?.cpuRawBytes) || Number(pixels?.byteLength) || 0));

    if (
      namespace.historyCompressionWorkerEnabled === false ||
      !namespace.pixelWorkerClient?.runHistoryCompress ||
      !(pixels instanceof Uint8Array) ||
      pixels.byteLength < config.minBytes ||
      target.cpuPixelsEncoding ||
      target.historyCompressionState === "queued" ||
      target.historyCompressionState === "compressing"
    ) {
      return false;
    }

    if (historyCompressionPendingRawBytes + pixels.byteLength > config.maxPendingRawBytes) {
      target.historyCompressionState = "raw";
      namespace.lastHistoryCompressionWorker = {
        pendingRawBytes: historyCompressionPendingRawBytes,
        queueLength: historyCompressionQueue.length,
        rawBytes,
        reason: "queue-full",
        status: "skipped",
        timestamp: Date.now(),
      };
      return false;
    }

    let workerPixels = null;

    try {
      workerPixels = pixels.slice();
    } catch (error) {
      target.historyCompressionState = "raw";
      namespace.lastHistoryCompressionWorker = {
        error: error?.message || String(error),
        rawBytes,
        reason: "copy-failed",
        status: "skipped",
        timestamp: Date.now(),
      };
      return false;
    }

    const jobToken = `history-compress-${Date.now()}-${historyCompressionSequence += 1}`;
    const job = {
      historyId: options.historyId || target.id || target.snapshotId || "",
      jobToken,
      kind: options.kind || target.kind || "",
      layerId: options.layerId || target.layerId || "",
      pixels: workerPixels,
      rawBytes,
      source: options.source || target.reason || "",
      target,
      readPixelsMs: Math.max(0, Number(options.timings?.readPixelsMs) || 0),
    };

    target.historyCompressionJobToken = jobToken;
    target.historyCompressionState = "queued";
    target.historyCompressionSource = job.source;
    historyCompressionQueue.push(job);
    historyCompressionPendingRawBytes += pixels.byteLength;
    setHistoryCompressionStatus("queued");
    showHistoryCompressionToast({
      historyId: job.historyId,
      kind: job.kind,
      layerId: job.layerId,
      readPixelsMs: job.readPixelsMs,
      rawBytes,
      status: "queued",
    });
    scheduleHistoryCompressionPump(config.initialDelayMs);

    return true;
  }

  namespace.queueHistoryCompression = enqueueHistoryCompression;
  namespace.historyCompressionQueue = {
    enqueue: enqueueHistoryCompression,
    getStats() {
      return {
        inFlight: historyCompressionInFlight,
        pendingRawBytes: historyCompressionPendingRawBytes,
        queueLength: historyCompressionQueue.length,
      };
    },
  };
})(window.CBO = window.CBO || {});
