(function registerEngineGovernor(namespace) {
  const OVERLAY_ID = "cbo-engine-governor-overlay";
  const OVERLAY_PANEL_ID = "cbo-engine-governor-panel";
  const MODE_INTERACTIVE = "interactive";
  const MODE_SETTLING = "settling";
  const MODE_IDLE = "idle";
  const FRAME_LIMIT = 180;
  const TARGET_FRAME_MS = 16.67;
  const INTERACTIVE_HOLD_MS = 180;
  const SETTLING_HOLD_MS = 900;
  const INTERACTIVE_CRITICAL_UPLOAD_BYTES = 64 * 1024;
  const SETTLING_UPLOAD_BYTES_PER_FRAME = 256 * 1024;
  const IDLE_UPLOAD_BYTES_PER_FRAME = 4 * 1024 * 1024;

  const instrumentedContexts = new WeakSet();
  const state = {
    currentFrame: null,
    enabled: true,
    frameId: 0,
    frames: [],
    lastActivityAt: 0,
    lastFrameTimestamp: 0,
    lastOverlayText: "",
    mode: MODE_IDLE,
    overlay: null,
    overlayExpanded: false,
    renderRafId: 0,
    uploadPumpTimer: 0,
    uploadQueue: [],
  };

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;

    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);

    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
    }

    if (value >= 1024) {
      return `${(value / 1024).toFixed(1)} KiB`;
    }

    return `${Math.round(value)} B`;
  }

  function sanitizeMode(mode) {
    const value = String(mode || "").trim().toLowerCase();

    return value === MODE_INTERACTIVE || value === MODE_SETTLING || value === MODE_IDLE
      ? value
      : MODE_IDLE;
  }

  function resolveMode() {
    const elapsed = now() - (state.lastActivityAt || 0);

    if (elapsed <= INTERACTIVE_HOLD_MS) {
      return MODE_INTERACTIVE;
    }

    if (elapsed <= SETTLING_HOLD_MS || state.uploadQueue.length > 0) {
      return MODE_SETTLING;
    }

    return MODE_IDLE;
  }

  function setMode(mode, detail = {}) {
    state.mode = sanitizeMode(mode);
    namespace.lastEngineGovernorMode = {
      detail: { ...detail },
      mode: state.mode,
      timestamp: Date.now(),
    };
    queueRenderOverlay();
    return state.mode;
  }

  function markActivity(detail = {}) {
    state.lastActivityAt = now();
    setMode(MODE_INTERACTIVE, detail);
  }

  function getUploadBudgetBytes(mode = state.mode) {
    if (mode === MODE_INTERACTIVE) {
      return 0;
    }

    if (mode === MODE_SETTLING) {
      return SETTLING_UPLOAD_BYTES_PER_FRAME;
    }

    return IDLE_UPLOAD_BYTES_PER_FRAME;
  }

  function getCurrentFrame() {
    if (!state.currentFrame) {
      return null;
    }

    return state.currentFrame;
  }

  function beginFrame(detail = {}) {
    const startedAt = now();
    const frameTimestamp = Number(detail.frameTimestamp);
    const previousTimestamp = Number(state.lastFrameTimestamp) || frameTimestamp || startedAt;
    const frameMs = Number.isFinite(frameTimestamp) && Number.isFinite(previousTimestamp)
      ? Math.max(0, frameTimestamp - previousTimestamp)
      : 0;
    const mode = detail.mode ? setMode(detail.mode, detail) : setMode(resolveMode(), detail);

    state.lastFrameTimestamp = Number.isFinite(frameTimestamp) ? frameTimestamp : startedAt;
    state.currentFrame = {
      cacheMisses: 0,
      bufferUploadedBytes: 0,
      bufferUploads: 0,
      detail: { ...detail },
      dpr: Number.isFinite(Number(detail.dpr)) ? Number(detail.dpr) : 1,
      drawCalls: 0,
      frameId: ++state.frameId,
      frameMs,
      jsMs: 0,
      mode,
      pendingUploads: state.uploadQueue.length,
      readPixelsBytes: 0,
      readPixelsCalls: 0,
      renderSubmitMs: 0,
      slow: false,
      startedAt,
      textureUploads: 0,
      uploadedBytes: 0,
      visibleTiles: 0,
    };

    return state.currentFrame;
  }

  function endFrame(extra = {}) {
    const frame = state.currentFrame;

    if (!frame) {
      return null;
    }

    Object.assign(frame, extra);
    frame.jsMs = round(now() - frame.startedAt);
    frame.renderSubmitMs = round(frame.renderSubmitMs);
    frame.frameMs = round(frame.frameMs || frame.jsMs);
    frame.slow = frame.frameMs > TARGET_FRAME_MS || frame.jsMs > TARGET_FRAME_MS;
    frame.pendingUploads = state.uploadQueue.length;

    state.frames.push({ ...frame, detail: { ...frame.detail } });
    while (state.frames.length > FRAME_LIMIT) {
      state.frames.shift();
    }

    namespace.lastEngineFrameMetrics = state.frames[state.frames.length - 1] || null;
    state.currentFrame = null;
    pumpUploadQueue();
    queueRenderOverlay();

    return namespace.lastEngineFrameMetrics;
  }

  function beginRenderSubmit(detail = {}) {
    const frame = getCurrentFrame();
    const startedAt = now();

    return function endRenderSubmit(extra = {}) {
      const elapsed = now() - startedAt;
      const activeFrame = getCurrentFrame() || frame;

      if (activeFrame) {
        activeFrame.renderSubmitMs += elapsed;
        if (Number.isFinite(Number(extra.visibleTiles))) {
          activeFrame.visibleTiles = Math.max(activeFrame.visibleTiles || 0, Number(extra.visibleTiles));
        }
        if (Number.isFinite(Number(extra.cacheMisses))) {
          activeFrame.cacheMisses += Math.max(0, Number(extra.cacheMisses));
        }
        activeFrame.renderDetail = {
          ...(activeFrame.renderDetail || {}),
          ...detail,
          ...extra,
        };
      }

      return round(elapsed);
    };
  }

  function recordDrawCall(count = 1) {
    const frame = getCurrentFrame();

    if (frame) {
      frame.drawCalls += Math.max(1, Math.round(Number(count) || 1));
    }
  }

  function recordCacheMiss(count = 1) {
    const frame = getCurrentFrame();

    if (frame) {
      frame.cacheMisses += Math.max(1, Math.round(Number(count) || 1));
    }
  }

  function recordReadPixels(bytes = 0) {
    const frame = getCurrentFrame();

    if (frame) {
      frame.readPixelsCalls += 1;
      frame.readPixelsBytes += Math.max(0, Math.round(Number(bytes) || 0));
    }
  }

  function recordTextureUpload(bytes = 0, detail = {}) {
    const frame = getCurrentFrame();
    const safeBytes = Math.max(0, Math.round(Number(bytes) || 0));

    if (frame) {
      frame.textureUploads += 1;
      frame.uploadedBytes += safeBytes;
      frame.lastUpload = {
        bytes: safeBytes,
        ...detail,
      };
    }
  }

  function recordBufferUpload(bytes = 0, detail = {}) {
    const frame = getCurrentFrame();
    const safeBytes = Math.max(0, Math.round(Number(bytes) || 0));

    if (frame) {
      frame.bufferUploads += 1;
      frame.bufferUploadedBytes += safeBytes;
      frame.lastBufferUpload = {
        bytes: safeBytes,
        ...detail,
      };
    }
  }

  function estimateBufferDataBytes(args) {
    const payload = args[1];

    if (Number.isFinite(Number(payload))) {
      return Math.max(0, Math.round(Number(payload)));
    }

    return Math.max(0, Math.round(Number(payload?.byteLength) || 0));
  }

  function estimateBufferSubDataBytes(args) {
    const payload = args[2];
    const length = Number(args[4]);

    if (Number.isFinite(length) && length > 0 && Number.isFinite(Number(payload?.BYTES_PER_ELEMENT))) {
      return Math.max(0, Math.round(length * Number(payload.BYTES_PER_ELEMENT)));
    }

    return Math.max(0, Math.round(Number(payload?.byteLength) || 0));
  }

  function estimateTexImage2DBytes(args) {
    if (args.length >= 9 && Number.isFinite(Number(args[3])) && Number.isFinite(Number(args[4]))) {
      return Math.max(0, Math.round(Number(args[3]) * Number(args[4]) * 4));
    }

    const source = args[5] || args[8] || args[6] || null;
    const width = Number(source?.width || source?.videoWidth || source?.naturalWidth || 0);
    const height = Number(source?.height || source?.videoHeight || source?.naturalHeight || 0);

    return Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, Math.round(width * height * 4)) : 0;
  }

  function estimateTexSubImage2DBytes(args) {
    if (args.length >= 9 && Number.isFinite(Number(args[4])) && Number.isFinite(Number(args[5]))) {
      return Math.max(0, Math.round(Number(args[4]) * Number(args[5]) * 4));
    }

    const source = args[6] || args[8] || null;
    const width = Number(source?.width || source?.videoWidth || source?.naturalWidth || 0);
    const height = Number(source?.height || source?.videoHeight || source?.naturalHeight || 0);

    return Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, Math.round(width * height * 4)) : 0;
  }

  function estimateReadPixelsBytes(args) {
    const width = Number(args[2]);
    const height = Number(args[3]);

    return Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, Math.round(width * height * 4)) : 0;
  }

  function wrapContextMethod(gl, name, wrapper) {
    const original = gl?.[name];

    if (typeof original !== "function") {
      return;
    }

    gl[name] = function wrappedWebGlMethod(...args) {
      return wrapper.call(this, original, args);
    };
  }

  function instrumentWebGlContext(gl) {
    if (!gl || instrumentedContexts.has(gl)) {
      return gl;
    }

    instrumentedContexts.add(gl);
    wrapContextMethod(gl, "drawArrays", function wrapDrawArrays(original, args) {
      recordDrawCall();
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "drawArraysInstanced", function wrapDrawArraysInstanced(original, args) {
      recordDrawCall();
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "drawElements", function wrapDrawElements(original, args) {
      recordDrawCall();
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "bufferData", function wrapBufferData(original, args) {
      recordBufferUpload(estimateBufferDataBytes(args), { method: "bufferData" });
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "bufferSubData", function wrapBufferSubData(original, args) {
      recordBufferUpload(estimateBufferSubDataBytes(args), { method: "bufferSubData" });
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "texImage2D", function wrapTexImage2D(original, args) {
      recordTextureUpload(estimateTexImage2DBytes(args), { method: "texImage2D" });
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "texSubImage2D", function wrapTexSubImage2D(original, args) {
      recordTextureUpload(estimateTexSubImage2DBytes(args), { method: "texSubImage2D" });
      return original.apply(this, args);
    });
    wrapContextMethod(gl, "readPixels", function wrapReadPixels(original, args) {
      recordReadPixels(estimateReadPixelsBytes(args));
      return original.apply(this, args);
    });

    return gl;
  }

  function canUpload(bytes = 0, options = {}) {
    const mode = sanitizeMode(options.mode || state.mode);
    const safeBytes = Math.max(0, Math.round(Number(bytes) || 0));
    const critical = options.critical === true;
    const frame = getCurrentFrame();
    const usedBytes = Math.max(0, Number(frame?.uploadedBytes) || 0);

    if (mode === MODE_INTERACTIVE) {
      return critical && safeBytes <= INTERACTIVE_CRITICAL_UPLOAD_BYTES;
    }

    return usedBytes + safeBytes <= getUploadBudgetBytes(mode);
  }

  function queueUpload(callback, options = {}) {
    if (typeof callback !== "function") {
      return false;
    }

    state.uploadQueue.push({
      bytes: Math.max(0, Math.round(Number(options.bytes) || 0)),
      callback,
      critical: options.critical === true,
      id: `${Date.now().toString(36)}-${state.uploadQueue.length.toString(36)}`,
      label: options.label || "upload",
      version: options.version ?? null,
    });
    scheduleUploadPump();
    queueRenderOverlay();
    return true;
  }

  function scheduleUploadPump(delayMs = 0) {
    if (state.uploadPumpTimer || typeof window === "undefined") {
      return;
    }

    const run = () => {
      state.uploadPumpTimer = 0;
      pumpUploadQueue();
    };

    state.uploadPumpTimer = window.setTimeout?.(run, Math.max(0, Math.round(delayMs))) || 0;
  }

  function pumpUploadQueue() {
    if (state.uploadQueue.length === 0) {
      return 0;
    }

    setMode(resolveMode(), { source: "upload-pump" });

    if (state.mode === MODE_INTERACTIVE) {
      scheduleUploadPump(64);
      return 0;
    }

    let count = 0;
    let usedBytes = 0;
    const budget = getUploadBudgetBytes(state.mode);

    while (state.uploadQueue.length > 0) {
      const item = state.uploadQueue[0];

      if (usedBytes + item.bytes > budget && count > 0) {
        break;
      }

      if (!canUpload(item.bytes, { critical: item.critical, mode: state.mode }) && count === 0) {
        break;
      }

      state.uploadQueue.shift();
      try {
        item.callback({
          id: item.id,
          label: item.label,
          mode: state.mode,
          version: item.version,
        });
      } catch (error) {
        console.warn?.("[CBO governor] upload task failed", error);
      }
      usedBytes += item.bytes;
      count += 1;
    }

    if (state.uploadQueue.length > 0) {
      scheduleUploadPump(state.mode === MODE_SETTLING ? 16 : 0);
    }

    return count;
  }

  function collect(options = {}) {
    const limit = Math.max(1, Math.min(FRAME_LIMIT, Math.round(Number(options.limit) || 12)));
    const recent = state.frames.slice(-limit).reverse();
    const last = recent[0] || namespace.lastEngineFrameMetrics || null;
    const slowFrames = state.frames.filter((frame) => frame.slow).length;

    return {
      enabled: state.enabled,
      frameCount: state.frames.length,
      last,
      mode: state.mode,
      recent,
      slowFrames,
      targetFrameMs: TARGET_FRAME_MS,
      uploadBudgetBytes: getUploadBudgetBytes(state.mode),
      uploadQueueLength: state.uploadQueue.length,
    };
  }

  function ensureOverlay() {
    if (state.overlay || typeof document === "undefined") {
      return state.overlay;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;
    overlay.style.cssText = [
      "position:fixed",
      "right:10px",
      "bottom:74px",
      "z-index:2147483644",
      "font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace",
      "color:#eef2ff",
      "background:rgba(13,17,23,.88)",
      "border:1px solid rgba(148,163,184,.35)",
      "border-radius:8px",
      "box-shadow:0 10px 30px rgba(0,0,0,.3)",
      "max-width:340px",
      "pointer-events:auto",
    ].join(";");
    overlay.innerHTML = `
      <button type="button" data-engine-governor-toggle style="display:flex;gap:8px;align-items:center;width:100%;padding:7px 9px;background:transparent;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer">
        <span data-engine-governor-status-dot style="width:7px;height:7px;border-radius:50%;background:#22c55e"></span>
        <span>Governor</span>
      </button>
      <pre id="${OVERLAY_PANEL_ID}" data-engine-governor-panel style="display:none;margin:0;padding:0 9px 9px;white-space:pre-wrap"></pre>
    `;
    overlay.querySelector("[data-engine-governor-toggle]")?.addEventListener("click", () => {
      state.overlayExpanded = !state.overlayExpanded;
      renderOverlay();
    });
    document.body?.appendChild(overlay);
    state.overlay = overlay;

    return overlay;
  }

  function renderOverlay() {
    const overlay = state.overlay;

    if (!overlay || overlay.hidden) {
      return;
    }

    const telemetry = collect({ limit: 1 });
    const last = telemetry.last || {};
    const lines = [
      "CBO ENGINE GOVERNOR",
      `mode: ${telemetry.mode}`,
      `frame: ${round(last.frameMs || 0)}ms js: ${round(last.jsMs || 0)}ms submit: ${round(last.renderSubmitMs || 0)}ms`,
      `drawCalls: ${last.drawCalls || 0} tiles: ${last.visibleTiles || 0}`,
      `uploads: ${last.textureUploads || 0} ${formatBytes(last.uploadedBytes || 0)} queue: ${telemetry.uploadQueueLength}`,
      `buffers: ${last.bufferUploads || 0} ${formatBytes(last.bufferUploadedBytes || 0)}`,
      `readPixels: ${last.readPixelsCalls || 0} ${formatBytes(last.readPixelsBytes || 0)}`,
      `dpr: ${round(last.dpr || 1, 2)} slow: ${telemetry.slowFrames}/${telemetry.frameCount}`,
    ];
    const text = lines.join("\n");
    const panel = overlay.querySelector("[data-engine-governor-panel]");
    const dot = overlay.querySelector("[data-engine-governor-status-dot]");

    if (panel) {
      panel.style.display = state.overlayExpanded ? "block" : "none";
      if (state.lastOverlayText !== text) {
        panel.textContent = text;
        state.lastOverlayText = text;
      }
    }

    if (dot) {
      dot.style.background = telemetry.mode === MODE_INTERACTIVE
        ? "#f97316"
        : telemetry.mode === MODE_SETTLING
          ? "#eab308"
          : "#22c55e";
    }
  }

  function queueRenderOverlay() {
    if (!state.overlay || state.renderRafId) {
      return;
    }

    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));

    state.renderRafId = requestFrame(() => {
      state.renderRafId = 0;
      renderOverlay();
    });
  }

  function show(visible = true) {
    const overlay = ensureOverlay();

    if (overlay) {
      overlay.hidden = visible !== true;
      renderOverlay();
    }

    return overlay;
  }

  function start(options = {}) {
    state.enabled = true;
    if (options.visible !== false) {
      show(true);
    }
    return collect();
  }

  function stop(options = {}) {
    state.enabled = false;
    if (options.visible === false) {
      show(false);
    }
    return collect();
  }

  function toggle(options = {}) {
    const overlay = ensureOverlay();
    const nextVisible = overlay?.hidden !== false;

    show(nextVisible);
    state.enabled = nextVisible;
    return collect();
  }

  const api = {
    beginFrame,
    beginRenderSubmit,
    canUpload,
    collect,
    endFrame,
    get mode() {
      return state.mode;
    },
    instrumentWebGlContext,
    markActivity,
    pumpUploadQueue,
    queueUpload,
    recordCacheMiss,
    recordBufferUpload,
    recordDrawCall,
    recordReadPixels,
    recordTextureUpload,
    setMode,
    show,
    start,
    stop,
    toggle,
  };

  namespace.EngineGovernor = api;
  namespace.engineGovernor = api;
  namespace.collectEngineGovernor = collect;
  namespace.startEngineGovernor = start;
  namespace.stopEngineGovernor = stop;
  namespace.toggleEngineGovernor = toggle;
})(window.CBO = window.CBO || {});
