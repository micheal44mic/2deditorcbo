(function registerRasterMemoryMonitor(namespace) {
  const MIB = 1024 * 1024;
  const AUTO_RECOVERY_COOLDOWN_MS = 90 * 1000;
  const AUTO_RECOVERY_CRITICAL_COOLDOWN_MS = 15 * 1000;
  const AUTO_RECOVERY_HIDE_DELAY_MS = 900;
  const AUTO_RECOVERY_LOW_GAIN_COOLDOWN_MS = 5 * 60 * 1000;
  const LAYER_GPU_WARNING_RATIO = 0.75;
  const OVERLAY_ID = "cbo-raster-memory-overlay";
  const OVERLAY_PANEL_ID = "cbo-raster-memory-panel";
  const AUTOSAVE_OVERLAY_ID = "cbo-memory-autosave-overlay";
  const DEFAULT_UPDATE_HZ = 3;
  const DEFAULT_GPU_SAMPLE_EVERY = 10;
  const MONITOR_ENABLED_STORAGE_KEY = "cbo:raster-memory-monitor-enabled";

  const patchedDrawMethods = new WeakMap();

  const state = {
    budgetOverride: null,
    cpuFrameEmaMs: null,
    defaultBudget: null,
    defaultBudgetGl: null,
    gpuTimer: null,
    lastOverlayText: "",
    lastRenderAt: 0,
    lastStatsAt: 0,
    lastTrim: null,
    overlay: null,
    overlayExpanded: false,
    rafEmaMs: null,
    rafId: 0,
    renderCountSinceUpdate: 0,
    running: false,
    stutter16: 0,
    stutter33: 0,
    updateTimer: 0,
    updateHz: DEFAULT_UPDATE_HZ,
    autoRecoveryCheckpointBlocked: false,
    autoRecoveryEnabled: true,
    autoRecoveryHideTimer: 0,
    autoRecoveryCooldownUntil: 0,
    autoRecoveryLastAt: 0,
    autoRecoveryOverlay: null,
    autoRecoveryRunning: false,
  };

  function now() {
    return performance?.now?.() || Date.now();
  }

  function bytesToMiB(bytes) {
    return bytes / MIB;
  }

  function formatMiB(bytes) {
    const value = bytesToMiB(Math.max(0, Number(bytes) || 0));

    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }

  function formatMs(value) {
    return Number.isFinite(value) ? value.toFixed(value < 10 ? 2 : 1) : "n/a";
  }

  function formatFps(value) {
    return Number.isFinite(value) && value > 0 ? value.toFixed(1) : "Idle";
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Math.round(Number(ms) || 0)));
    });
  }

  function readStoredMonitorEnabled(defaultValue = false) {
    try {
      const value = window.localStorage?.getItem?.(MONITOR_ENABLED_STORAGE_KEY);

      return value == null ? defaultValue : value !== "false";
    } catch (error) {
      return defaultValue;
    }
  }

  function writeStoredMonitorEnabled(enabled) {
    try {
      window.localStorage?.setItem?.(MONITOR_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
    } catch (error) {
      // Private browsing or storage quotas should not break the debug controls.
    }
  }

  function getStatusSeverity(status) {
    if (status === "critical") {
      return 3;
    }

    if (status === "medium") {
      return 2;
    }

    if (status === "warning") {
      return 1;
    }

    return 0;
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function getCategoryBytes(report) {
    const result = {};

    report?.rows?.forEach?.((row) => {
      const category = row?.category || "other";
      result[category] = (result[category] || 0) + (Number(row?.bytes) || 0);
    });

    return result;
  }

  function getGroupBytes(categories, names) {
    return names.reduce((sum, name) => sum + (Number(categories[name]) || 0), 0);
  }

  function getRendererInfo() {
    const gl = namespace.documentRenderer?.gl;

    if (!gl) {
      return {
        renderer: "unknown",
        vendor: "unknown",
      };
    }

    try {
      const debugInfo = gl.getExtension?.("WEBGL_debug_renderer_info");

      if (debugInfo) {
        return {
          renderer: String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "unknown"),
          vendor: String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "unknown"),
        };
      }
    } catch (error) {
      // Debug renderer info can be unavailable because of browser privacy settings.
    }

    return {
      renderer: "unavailable",
      vendor: "unavailable",
    };
  }

  function classifyDevice(rendererInfo = getRendererInfo()) {
    const renderer = `${rendererInfo.vendor || ""} ${rendererInfo.renderer || ""}`.toLowerCase();
    const memory = Number(navigator.deviceMemory) || 0;
    const touch = navigator.maxTouchPoints > 1;

    if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/.test(renderer)) {
      return "software";
    }

    if (/adreno|mali|powervr|mobile|android|apple gpu/.test(renderer) || (touch && memory > 0 && memory <= 6)) {
      return "mobile";
    }

    if (/intel|iris|uhd|integrated|apple m|apple silicon/.test(renderer) || (memory > 0 && memory <= 8)) {
      return "integrated";
    }

    if (/nvidia|geforce|rtx|gtx|quadro|amd|radeon|rx /.test(renderer)) {
      return "discrete";
    }

    return "unknown";
  }

  function createDefaultBudget() {
    const rendererInfo = getRendererInfo();
    const deviceClass = classifyDevice(rendererInfo);
    const criticalByClassMiB = {
      discrete: 1200,
      integrated: 768,
      mobile: 512,
      software: 256,
      unknown: 768,
    };
    const criticalBytes = (criticalByClassMiB[deviceClass] || criticalByClassMiB.unknown) * MIB;

    return {
      cacheGpuBytes: deviceClass === "software" ? 32 * MIB : deviceClass === "mobile" ? 64 * MIB : 128 * MIB,
      criticalBytes,
      deviceClass,
      historyCpuBytes: deviceClass === "mobile" ? 512 * MIB : 1024 * MIB,
      historyGpuBytes: deviceClass === "software" ? 0 : deviceClass === "mobile" ? 64 * MIB : 256 * MIB,
      layerGpuBytes: criticalBytes * 0.65 * LAYER_GPU_WARNING_RATIO,
      mediumBytes: criticalBytes * 0.8,
      renderer: rendererInfo.renderer,
      vendor: rendererInfo.vendor,
      warningBytes: criticalBytes * 0.65,
    };
  }

  function getBudget() {
    const gl = namespace.documentRenderer?.gl || null;

    if (!state.defaultBudget || state.defaultBudgetGl !== gl) {
      state.defaultBudget = createDefaultBudget();
      state.defaultBudgetGl = gl;
    }

    return state.budgetOverride || state.defaultBudget;
  }

  function getStatus(totalBytes, budget) {
    if (totalBytes >= budget.criticalBytes) {
      return "critical";
    }

    if (totalBytes >= budget.mediumBytes) {
      return "medium";
    }

    if (totalBytes >= budget.warningBytes) {
      return "warning";
    }

    return "ok";
  }

  function getDocumentRasterBytes() {
    const renderer = namespace.documentRenderer;
    const width = Math.max(1, Math.round(Number(renderer?.width) || Number(namespace.documentSettings?.width) || 1));
    const height = Math.max(1, Math.round(Number(renderer?.height) || Number(namespace.documentSettings?.height) || 1));

    return width * height * 4;
  }

  function getRasterLayerCreationBudget(options = {}) {
    const budget = getBudget();
    const memoryReport = options.memoryReport || namespace.collectRasterMemory?.({ log: false }) || null;
    const currentLayerBytes = Number(memoryReport?.liveLayerBytes) || 0;
    const estimatedNewBytes = Number.isFinite(Number(options.estimatedNewBytes))
      ? Math.max(0, Math.round(Number(options.estimatedNewBytes)))
      : getDocumentRasterBytes();
    const limitBytes = Math.max(0, Math.round(Number(budget.layerGpuBytes) || budget.warningBytes * LAYER_GPU_WARNING_RATIO));
    const projectedLayerBytes = currentLayerBytes + estimatedNewBytes;
    const allowed = limitBytes <= 0 || projectedLayerBytes <= limitBytes;

    return {
      allowed,
      currentLayerBytes,
      estimatedNewBytes,
      limitBytes,
      projectedLayerBytes,
      reason: allowed ? "" : "layer-gpu-budget",
      source: options.source || "layer-create",
    };
  }

  function canCreateRasterLayer(options = {}) {
    const result = getRasterLayerCreationBudget(options);

    namespace.lastRasterLayerCreationBudget = result;
    return result.allowed;
  }

  function retainedViewBytes(view) {
    if (!ArrayBuffer.isView?.(view)) {
      return 0;
    }

    return Math.max(0, Number(view.buffer?.byteLength) || Number(view.byteLength) || 0);
  }

  function isArrayBuffer(value) {
    return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
  }

  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }

  function isImageData(value) {
    return typeof ImageData !== "undefined" && value instanceof ImageData;
  }

  function isCanvas(value) {
    return (
      (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) ||
      (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas)
    );
  }

  function isImageBitmap(value) {
    return typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap;
  }

  function collectCpuHistoryMemory() {
    const history = namespace.documentHistory;
    const layerTargetBytes = Math.max(0, Math.round(
      Number(namespace.documentRenderer?.getHistoryColdRasterTargetBytes?.()) || 0,
    ));
    const layerTargetRawBytes = Math.max(layerTargetBytes, Math.round(
      Number(namespace.documentRenderer?.getHistoryColdRasterTargetRawBytes?.()) || layerTargetBytes,
    ));
    const seenObjects = new WeakSet();
    const seenBuffers = new WeakSet();
    const seenBlobs = new WeakSet();
    let rawBytes = 0;
    let blobBytes = 0;
    let canvasBytes = 0;
    let imageBitmapBytes = 0;
    let rawEquivalentBytes = 0;
    let compressedSnapshotCount = 0;
    let compressedSnapshotActualBytes = 0;
    let compressedSnapshotEquivalentBytes = 0;

    const isCompressedSnapshot = (value) => {
      return Boolean(
        value &&
          value.cpuPixels instanceof Uint8Array &&
          typeof value.cpuPixelsEncoding === "string" &&
          value.cpuPixelsEncoding.length > 0 &&
          Number.isFinite(value.cpuRawBytes) &&
          value.cpuRawBytes > value.cpuPixels.byteLength
      );
    };

    const scan = (value) => {
      if (!value || typeof value !== "object") {
        return;
      }

      if (ArrayBuffer.isView?.(value)) {
        const buffer = value.buffer;

        if (buffer && !seenBuffers.has(buffer)) {
          seenBuffers.add(buffer);
          const byteLength = retainedViewBytes(value);
          rawBytes += byteLength;
          rawEquivalentBytes += byteLength;
        }

        return;
      }

      if (isArrayBuffer(value)) {
        if (!seenBuffers.has(value)) {
          seenBuffers.add(value);
          const byteLength = value.byteLength || 0;
          rawBytes += byteLength;
          rawEquivalentBytes += byteLength;
        }

        return;
      }

      if (isBlob(value)) {
        if (!seenBlobs.has(value)) {
          seenBlobs.add(value);
          blobBytes += value.size || 0;
        }

        return;
      }

      if (isImageData(value)) {
        scan(value.data);
        return;
      }

      if (isCanvas(value)) {
        if (!seenObjects.has(value)) {
          seenObjects.add(value);
          canvasBytes += Math.max(1, value.width || 1) * Math.max(1, value.height || 1) * 4;
        }

        return;
      }

      if (isImageBitmap(value)) {
        if (!seenObjects.has(value)) {
          seenObjects.add(value);
          imageBitmapBytes += Math.max(1, value.width || 1) * Math.max(1, value.height || 1) * 4;
        }

        return;
      }

      if (seenObjects.has(value)) {
        return;
      }

      seenObjects.add(value);

      if (isCompressedSnapshot(value)) {
        const pixels = value.cpuPixels;
        const buffer = pixels.buffer;

        if (buffer && !seenBuffers.has(buffer)) {
          seenBuffers.add(buffer);
          const actual = retainedViewBytes(pixels);
          const equivalent = Number(value.cpuRawBytes) || pixels.byteLength || actual;
          rawBytes += actual;
          rawEquivalentBytes += equivalent;
          compressedSnapshotCount += 1;
          compressedSnapshotActualBytes += actual;
          compressedSnapshotEquivalentBytes += equivalent;
        }

        Object.entries(value).forEach(([key, child]) => {
          if (
            typeof child === "function" ||
            key === "cpuPixels" ||
            key === "texture" ||
            key === "framebuffer" ||
            key === "gl"
          ) {
            return;
          }

          scan(child);
        });

        return;
      }

      Object.entries(value).forEach(([key, child]) => {
        if (
          typeof child === "function" ||
          key === "texture" ||
          key === "framebuffer" ||
          key === "gl"
        ) {
          return;
        }

        scan(child);
      });
    };

    scan(history?.undoStack);
    scan(history?.redoStack);

    const totalBytes = rawBytes + blobBytes + canvasBytes + imageBitmapBytes + layerTargetBytes;
    const totalRawEquivalentBytes = rawEquivalentBytes + blobBytes + canvasBytes + imageBitmapBytes + layerTargetRawBytes;
    const compressionRatio = compressedSnapshotActualBytes > 0
      ? compressedSnapshotEquivalentBytes / compressedSnapshotActualBytes
      : 1;

    return {
      blobBytes,
      canvasBytes,
      compressedSnapshotActualBytes,
      compressedSnapshotCount,
      compressedSnapshotEquivalentBytes,
      compressionRatio,
      imageBitmapBytes,
      layerTargetBytes,
      layerTargetRawBytes,
      rawBytes,
      rawEquivalentBytes,
      totalBytes,
      totalRawEquivalentBytes,
    };
  }

  function createGpuTimer(gl, options = {}) {
    const ext = gl?.getExtension?.("EXT_disjoint_timer_query_webgl2");

    if (!gl || !ext || typeof gl.createQuery !== "function") {
      return {
        available: false,
        begin: () => false,
        end: () => {},
        poll: () => {},
        summary: () => ({ available: false, emaMs: null, lastMs: null }),
      };
    }

    const timer = {
      active: null,
      available: true,
      emaMs: null,
      frame: 0,
      lastMs: null,
      maxPending: Math.max(1, Math.round(options.maxPending || 4)),
      pending: [],
      sampleEvery: Math.max(1, Math.round(options.sampleEvery || DEFAULT_GPU_SAMPLE_EVERY)),
      begin() {
        if (
          this.active ||
          this.pending.length >= this.maxPending ||
          (this.frame++ % this.sampleEvery) !== 0
        ) {
          return false;
        }

        try {
          const query = gl.createQuery();

          if (!query) {
            return false;
          }

          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          this.active = query;
          return true;
        } catch (error) {
          this.active = null;
          this.available = false;
          return false;
        }
      },
      end() {
        if (!this.active) {
          return;
        }

        try {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          this.pending.push(this.active);
        } catch (error) {
          try {
            gl.deleteQuery(this.active);
          } catch (deleteError) {
            // Ignore cleanup errors while the context is unstable.
          }
        } finally {
          this.active = null;
        }
      },
      poll() {
        if (!this.available || !this.pending.length) {
          return;
        }

        let disjoint = false;

        try {
          disjoint = Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
        } catch (error) {
          return;
        }

        for (let index = 0; index < this.pending.length;) {
          const query = this.pending[index];
          let available = false;

          try {
            available = Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE));
          } catch (error) {
            available = false;
          }

          if (!available) {
            index += 1;
            continue;
          }

          if (!disjoint) {
            try {
              const ns = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
              const ms = ns / 1e6;

              if (Number.isFinite(ms)) {
                this.lastMs = ms;
                this.emaMs = this.emaMs == null ? ms : this.emaMs + 0.2 * (ms - this.emaMs);
              }
            } catch (error) {
              // Ignore one bad query result and keep the monitor alive.
            }
          }

          try {
            gl.deleteQuery(query);
          } catch (error) {
            // Ignore cleanup errors while the context is unstable.
          }

          this.pending.splice(index, 1);
        }
      },
      summary() {
        return {
          available: this.available,
          emaMs: this.emaMs,
          lastMs: this.lastMs,
          pending: this.pending.length,
          sampleEvery: this.sampleEvery,
        };
      },
    };

    return timer;
  }

  function ensureGpuTimer() {
    const gl = namespace.documentRenderer?.gl;

    if (!gl) {
      state.gpuTimer = null;
      return null;
    }

    if (!state.gpuTimer || state.gpuTimer.gl !== gl) {
      state.gpuTimer = createGpuTimer(gl);
      state.gpuTimer.gl = gl;
    }

    return state.gpuTimer;
  }

  function recordRenderFrame(cpuMs, timestamp) {
    state.renderCountSinceUpdate += 1;
    state.lastRenderAt = timestamp;
    state.cpuFrameEmaMs = state.cpuFrameEmaMs == null
      ? cpuMs
      : state.cpuFrameEmaMs + 0.2 * (cpuMs - state.cpuFrameEmaMs);
  }

  function patchBrushDraw() {
    const engine = namespace.brushEngine;

    if (!engine || typeof engine.draw !== "function") {
      return;
    }

    const existing = patchedDrawMethods.get(engine);

    if (existing) {
      if (engine.draw === existing.wrappedDraw) {
        return;
      }

      patchedDrawMethods.delete(engine);
    }

    const originalDraw = engine.draw;

    const wrappedDraw = function drawWithRasterMonitor(...args) {
      if (!state.running) {
        return originalDraw.apply(this, args);
      }

      const start = now();
      const gpuTimer = ensureGpuTimer();
      const timed = gpuTimer?.begin?.() || false;

      try {
        return originalDraw.apply(this, args);
      } finally {
        if (timed) {
          gpuTimer.end();
        }

        recordRenderFrame(now() - start, now());
      }
    };

    patchedDrawMethods.set(engine, {
      originalDraw,
      wrappedDraw,
    });

    engine.draw = wrappedDraw;
  }

  function unpatchBrushDraw() {
    const engine = namespace.brushEngine;
    const patched = engine ? patchedDrawMethods.get(engine) : null;

    if (!engine || !patched) {
      return;
    }

    if (engine.draw === patched.wrappedDraw) {
      engine.draw = patched.originalDraw;
    }

    patchedDrawMethods.delete(engine);
  }

  function tickRaf(timestamp) {
    if (!state.running) {
      return;
    }

    if (state.previousRafAt) {
      const dt = timestamp - state.previousRafAt;
      const alpha = 1 - Math.exp(-dt / 500);

      state.rafEmaMs = state.rafEmaMs == null ? dt : state.rafEmaMs + alpha * (dt - state.rafEmaMs);

      if (dt > 16.7) {
        state.stutter16 += 1;
      }

      if (dt > 33.3) {
        state.stutter33 += 1;
      }
    }

    state.previousRafAt = timestamp;
    state.rafId = requestAnimationFrame(tickRaf);
  }

  function ensureAutoRecoveryOverlay() {
    if (state.autoRecoveryOverlay?.isConnected) {
      return state.autoRecoveryOverlay;
    }

    let overlay = document.getElementById(AUTOSAVE_OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = AUTOSAVE_OVERLAY_ID;
      overlay.className = "cbo-memory-autosave-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "assertive");
      overlay.innerHTML = [
        '<div class="cbo-memory-autosave-panel">',
        '  <div class="cbo-memory-autosave-spinner" aria-hidden="true"></div>',
        '  <p class="cbo-memory-autosave-title" data-memory-autosave-title>Autosaving...</p>',
        '  <p class="cbo-memory-autosave-detail" data-memory-autosave-detail>Ottimizzo memoria</p>',
        "</div>",
      ].join("");
      document.body.appendChild(overlay);
    }

    state.autoRecoveryOverlay = overlay;
    return overlay;
  }

  function showAutoRecoveryOverlay(title = "Autosaving...", detail = "Ottimizzo memoria") {
    const overlay = ensureAutoRecoveryOverlay();

    if (state.autoRecoveryHideTimer) {
      clearTimeout(state.autoRecoveryHideTimer);
      state.autoRecoveryHideTimer = 0;
    }

    const titleNode = overlay.querySelector("[data-memory-autosave-title]");
    const detailNode = overlay.querySelector("[data-memory-autosave-detail]");

    if (titleNode) {
      titleNode.textContent = title;
    }

    if (detailNode) {
      detailNode.textContent = detail;
    }

    document.body.classList.add("cbo-memory-recovery-active");
    overlay.hidden = false;
    return overlay;
  }

  function hideAutoRecoveryOverlay(delayMs = 0) {
    if (state.autoRecoveryHideTimer) {
      clearTimeout(state.autoRecoveryHideTimer);
      state.autoRecoveryHideTimer = 0;
    }

    const hide = () => {
      const overlay = state.autoRecoveryOverlay;

      if (overlay) {
        overlay.hidden = true;
      }

      document.body.classList.remove("cbo-memory-recovery-active");
    };

    if (delayMs > 0) {
      state.autoRecoveryHideTimer = window.setTimeout(() => {
        state.autoRecoveryHideTimer = 0;
        hide();
      }, delayMs);
      return;
    }

    hide();
  }

  function ensureOverlay() {
    if (state.overlay?.isConnected) {
      return state.overlay;
    }

    let overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      document.body.appendChild(overlay);
    }

    overlay.removeAttribute("aria-hidden");
    overlay.style.cssText = [
      "position:fixed",
      "right:10px",
      "bottom:10px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-end",
      "box-sizing:border-box",
      "color:#eef3ff",
      "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "pointer-events:none",
    ].join(";");

    if (!overlay.querySelector("[data-raster-memory-toggle]")) {
      overlay.replaceChildren();

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.rasterMemoryToggle = "true";
      toggle.setAttribute("aria-controls", OVERLAY_PANEL_ID);
      toggle.setAttribute("aria-label", "Apri monitor prestazioni");
      toggle.title = "Apri monitor prestazioni";
      toggle.style.cssText = [
        "appearance:none",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "gap:7px",
        "min-width:64px",
        "min-height:34px",
        "box-sizing:border-box",
        "padding:7px 10px",
        "border:1px solid rgba(134,255,186,.35)",
        "border-radius:8px",
        "background:rgba(14,17,24,.9)",
        "color:#eef3ff",
        "font:600 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
        "letter-spacing:0",
        "cursor:pointer",
        "pointer-events:auto",
        "box-shadow:0 10px 24px rgba(0,0,0,.28)",
        "backdrop-filter:blur(8px)",
      ].join(";");

      const statusDot = document.createElement("span");
      statusDot.dataset.rasterMemoryStatusDot = "true";
      statusDot.style.cssText = [
        "display:block",
        "width:7px",
        "height:7px",
        "border-radius:999px",
        "background:rgba(134,255,186,.9)",
        "box-shadow:0 0 0 2px rgba(134,255,186,.12)",
        "flex:0 0 auto",
      ].join(";");

      const toggleText = document.createElement("span");
      toggleText.dataset.rasterMemoryToggleLabel = "true";
      toggleText.textContent = "Perf";

      toggle.append(statusDot, toggleText);

      const panel = document.createElement("div");
      panel.id = OVERLAY_PANEL_ID;
      panel.dataset.rasterMemoryPanel = "true";
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = [
        "min-width:252px",
        "max-width:min(340px,calc(100vw - 20px))",
        "box-sizing:border-box",
        "border:1px solid rgba(134,255,186,.35)",
        "border-radius:8px",
        "background:rgba(14,17,24,.9)",
        "color:#eef3ff",
        "box-shadow:0 12px 30px rgba(0,0,0,.32)",
        "backdrop-filter:blur(8px)",
        "overflow:hidden",
        "pointer-events:auto",
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText = [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:10px",
        "padding:8px 10px",
        "border-bottom:1px solid rgba(255,255,255,.1)",
        "font:600 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace",
        "text-transform:uppercase",
      ].join(";");

      const title = document.createElement("span");
      title.textContent = "Raster monitor";

      const headerActions = document.createElement("div");
      headerActions.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:6px",
      ].join(";");

      const power = document.createElement("button");
      power.type = "button";
      power.dataset.rasterMemoryPower = "true";
      power.setAttribute("aria-label", "Spegni monitor prestazioni");
      power.title = "Spegni monitor prestazioni";
      power.textContent = "Stop";
      power.style.cssText = [
        "appearance:none",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "height:24px",
        "min-width:42px",
        "border:1px solid rgba(255,255,255,.16)",
        "border-radius:6px",
        "background:rgba(255,255,255,.08)",
        "color:#eef3ff",
        "font:700 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
        "cursor:pointer",
        "padding:0 8px",
      ].join(";");

      const close = document.createElement("button");
      close.type = "button";
      close.dataset.rasterMemoryClose = "true";
      close.setAttribute("aria-label", "Chiudi monitor prestazioni");
      close.title = "Chiudi monitor prestazioni";
      close.textContent = "x";
      close.style.cssText = [
        "appearance:none",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "width:24px",
        "height:24px",
        "border:1px solid rgba(255,255,255,.16)",
        "border-radius:6px",
        "background:rgba(255,255,255,.08)",
        "color:#eef3ff",
        "font:700 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
        "cursor:pointer",
        "padding:0",
      ].join(";");

      const body = document.createElement("pre");
      body.dataset.rasterMemoryBody = "true";
      body.style.cssText = [
        "box-sizing:border-box",
        "margin:0",
        "padding:10px 12px",
        "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
        "letter-spacing:0",
        "white-space:pre-wrap",
        "overflow-wrap:anywhere",
      ].join(";");

      toggle.addEventListener("click", () => {
        if (!state.running) {
          setRasterMemoryMonitorEnabled(true, {
            visible: true,
          });
        }

        setOverlayExpanded(true);
        renderOverlay();
      });

      power.addEventListener("click", () => {
        setRasterMemoryMonitorEnabled(false, {
          visible: true,
        });
      });

      close.addEventListener("click", () => {
        setOverlayExpanded(false);
      });

      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          setOverlayExpanded(false);
        }
      });

      headerActions.append(power, close);
      header.append(title, headerActions);
      panel.append(header, body);
      overlay.append(toggle, panel);
    }

    state.overlay = overlay;
    syncOverlayChrome(overlay);
    return overlay;
  }

  function getStatusColor(status) {
    return status === "off"
      ? "rgba(148,163,184,.45)"
      : status === "critical"
      ? "rgba(255,95,95,.85)"
      : status === "medium"
        ? "rgba(255,196,87,.85)"
        : status === "warning"
          ? "rgba(255,224,112,.72)"
          : "rgba(134,255,186,.35)";
  }

  function syncOverlayChrome(overlay = state.overlay) {
    if (!overlay) {
      return;
    }

    const status = state.running ? overlay.dataset.status || "ok" : "off";
    const color = getStatusColor(status);
    const toggle = overlay.querySelector("[data-raster-memory-toggle]");
    const toggleLabel = overlay.querySelector("[data-raster-memory-toggle-label]");
    const panel = overlay.querySelector("[data-raster-memory-panel]");
    const dot = overlay.querySelector("[data-raster-memory-status-dot]");
    const power = overlay.querySelector("[data-raster-memory-power]");

    if (toggle) {
      toggle.hidden = state.overlayExpanded;
      toggle.setAttribute("aria-expanded", String(state.overlayExpanded));
      toggle.setAttribute("aria-label", state.running ? "Apri monitor prestazioni" : "Accendi monitor prestazioni");
      toggle.title = state.running ? "Apri monitor prestazioni" : "Accendi monitor prestazioni";
      toggle.style.borderColor = color;
    }

    if (toggleLabel) {
      toggleLabel.textContent = state.running ? "Perf" : "Perf off";
    }

    if (panel) {
      panel.hidden = !state.overlayExpanded || !state.running;
      panel.style.borderColor = color;
    }

    if (dot) {
      dot.style.background = color;
      dot.style.boxShadow = `0 0 0 2px ${color.replace(/,\s*(?:0?\.)?\d+\)$/, ",.12)")}`;
    }

    if (power) {
      power.textContent = state.running ? "Stop" : "Start";
      power.setAttribute("aria-label", state.running ? "Spegni monitor prestazioni" : "Accendi monitor prestazioni");
      power.title = state.running ? "Spegni monitor prestazioni" : "Accendi monitor prestazioni";
    }
  }

  function setOverlayExpanded(expanded) {
    state.overlayExpanded = expanded === true;
    syncOverlayChrome();
  }

  function buildWarnings(memoryReport, categories, budget, cpuHistory) {
    const warnings = [];
    const totalBytes = Number(memoryReport?.totalBytes) || 0;
    const historyGpu = Number(memoryReport?.historyGpuBytes) || getGroupBytes(categories, ["history snapshots"]);
    const liveLayers = Number(memoryReport?.liveLayerBytes) || getGroupBytes(categories, ["persistent layer targets"]);
    const previewCache = Number(memoryReport?.previewCacheBytes) || categories["renderer caches"] || 0;
    const scratchBytes = Number(memoryReport?.scratchBytes) || getGroupBytes(categories, [
      "renderer scratch targets",
      "brush active stroke",
      "liquify active targets",
      "scratch/strokeScratch",
      "scratch/effectScratch",
    ]);

    if (totalBytes >= budget.criticalBytes) {
      warnings.push("gpu budget critical");
    } else if (totalBytes >= budget.mediumBytes) {
      warnings.push("gpu budget medium");
    } else if (totalBytes >= budget.warningBytes) {
      warnings.push("gpu budget warning");
    }

    if (previewCache > budget.cacheGpuBytes) {
      warnings.push("cache over budget");
    }

    if (scratchBytes >= 128 * MIB) {
      warnings.push("scratch critical");
    } else if (scratchBytes >= 96 * MIB) {
      warnings.push("scratch high");
    }

    if (liveLayers > budget.layerGpuBytes && budget.layerGpuBytes > 0) {
      warnings.push("layers over budget");
    }

    if (historyGpu > budget.historyGpuBytes && budget.historyGpuBytes > 0) {
      warnings.push("history gpu high");
    }

    if (cpuHistory.totalBytes > budget.historyCpuBytes) {
      warnings.push("history cpu high");
    }

    return warnings;
  }

  function collectRasterTelemetry() {
    const memoryReport = namespace.collectRasterMemory?.() || {
      rows: [],
      totalBytes: 0,
      totalMiB: "0.00",
    };
    const categories = getCategoryBytes(memoryReport);
    const cpuHistory = collectCpuHistoryMemory();
    const budget = getBudget();
    const totalBytes = Number(memoryReport.totalBytes) || 0;
    const status = getStatus(totalBytes, budget);
    const gpuTimer = ensureGpuTimer();
    const gpu = gpuTimer?.summary?.() || { available: false, emaMs: null, lastMs: null };
    const rafFps = state.rafEmaMs ? 1000 / state.rafEmaMs : null;
    const currentTime = now();
    const statsElapsedMs = state.lastStatsAt ? Math.max(1, currentTime - state.lastStatsAt) : 1000 / state.updateHz;
    const renderIdle = !state.lastRenderAt || currentTime - state.lastRenderAt > 1000;
    const renderFps = renderIdle ? null : (state.renderCountSinceUpdate * 1000) / statsElapsedMs;
    const groups = memoryReport.source === "raster-resource-manager"
      ? {
          activePreviews: Number(memoryReport.transformPreviewBytes) || 0,
          cache: Number(memoryReport.previewCacheBytes) || 0,
          historyGpu: Number(memoryReport.historyGpuBytes) || 0,
          layers: Number(memoryReport.liveLayerBytes) || 0,
          scratch: Number(memoryReport.scratchBytes) || 0,
        }
      : {
          activePreviews: getGroupBytes(categories, ["active previews"]),
          cache: getGroupBytes(categories, ["renderer caches", "active previews"]),
          historyGpu: getGroupBytes(categories, ["history snapshots"]),
          layers: getGroupBytes(categories, ["persistent layer targets"]),
          scratch: getGroupBytes(categories, [
            "renderer scratch targets",
            "brush active stroke",
            "liquify active targets",
          ]),
        };
    const warnings = buildWarnings(memoryReport, categories, budget, cpuHistory);

    return {
      budget,
      categories,
      cpuHistory,
      generatedAt: new Date().toISOString(),
      gpu,
      groups,
      memory: memoryReport,
      performance: {
        cpuFrameEmaMs: state.cpuFrameEmaMs,
        rafFps,
        renderFps,
        stutter16: state.stutter16,
        stutter33: state.stutter33,
      },
      status,
      warnings,
    };
  }

  function formatLastTrim() {
    if (!state.lastTrim) {
      return "none";
    }

    const age = Math.max(0, Math.round((now() - state.lastTrim.at) / 1000));

    return `${state.lastTrim.level}, -${formatMiB(state.lastTrim.freedBytes)} MiB, ${age}s ago`;
  }

  function renderOverlay() {
    if (!state.running) {
      const overlay = state.overlay || document.getElementById(OVERLAY_ID);

      if (overlay) {
        overlay.dataset.status = "off";
        syncOverlayChrome(overlay);
      }

      return;
    }

    patchBrushDraw();
    state.gpuTimer?.poll?.();

    const telemetry = collectRasterTelemetry();
    const overlay = ensureOverlay();
    const { budget, cpuHistory, gpu, groups, memory, performance: perf, status, warnings } = telemetry;
    const totalBytes = Number(memory.totalBytes) || 0;
    const percent = budget.criticalBytes > 0 ? clampPercent((totalBytes / budget.criticalBytes) * 100) : 0;
    const warningHeadroom = budget.warningBytes - totalBytes;
    const topScratchResources = Array.isArray(memory.topScratchResourcesByBytes)
      ? memory.topScratchResourcesByBytes.slice(0, 3)
      : [];
    const latestStrokeMemory = Array.isArray(memory.strokeMemoryEvents) && memory.strokeMemoryEvents.length > 0
      ? memory.strokeMemoryEvents[0]
      : null;
    const topScratchText = topScratchResources.length > 0
      ? topScratchResources
          .map((row) => `${row.label || row.kind || "scratch"} ${row.MiB || formatMiB(row.bytes)} MiB`)
          .join(" | ")
      : "none";
    const latestStrokeText = latestStrokeMemory
      ? `rect ${latestStrokeMemory.strokeBufferRect?.width || 0}x${latestStrokeMemory.strokeBufferRect?.height || 0}, ${latestStrokeMemory.scratchMiB} MiB, repl ${latestStrokeMemory.strokeTargetReplaceCount || 0}, inc ${latestStrokeMemory.incrementalBakeCount || 0}${latestStrokeMemory.incrementalBakeSkippedReason ? `, skip ${latestStrokeMemory.incrementalBakeSkippedReason}` : ""}`
      : "none";
    const lines = [
      "CBO RASTER MONITOR",
      `Status: ${status} (${percent.toFixed(0)}% crit)`,
      `Device tier: ${budget.deviceClass}`,
      "",
      `FPS: ${formatFps(perf.renderFps)} render / ${formatFps(perf.rafFps)} rAF`,
      `CPU JS: ${formatMs(perf.cpuFrameEmaMs)} ms`,
      `GPU draw: ${gpu.available ? `${formatMs(gpu.emaMs)} ms x${gpu.sampleEvery}` : "n/a"}`,
      `Stutter: ${perf.stutter16} >16ms / ${perf.stutter33} >33ms`,
      "",
      `GPU app est: ${formatMiB(totalBytes)} MiB`,
      `GPU budget: ${formatMiB(budget.warningBytes)} warn / ${formatMiB(budget.criticalBytes)} crit`,
      `Layer cap: ${formatMiB(budget.layerGpuBytes)} MiB`,
      `Headroom warn: ${warningHeadroom >= 0 ? formatMiB(warningHeadroom) : `-${formatMiB(-warningHeadroom)}`} MiB`,
      "Hardware VRAM: unavailable",
      "",
      `Layers: ${formatMiB(groups.layers)} MiB`,
      `Cache: ${formatMiB(groups.cache)} MiB`,
      `Scratch: ${formatMiB(groups.scratch)} MiB`,
      `Scratch detail: brush ${formatMiB(memory.brushStrokeScratchBytes)} / active ${formatMiB(memory.activeStrokeScratchBytes)} / fx ${formatMiB(memory.effectScratchBytes)} MiB`,
      `Scratch top: ${topScratchText}`,
      `Last stroke: ${latestStrokeText}`,
      `History GPU: ${formatMiB(groups.historyGpu)} MiB`,
      `History CPU: ${formatMiB(cpuHistory.totalBytes)} MiB${
        cpuHistory.compressionRatio > 1.05 && cpuHistory.compressedSnapshotCount > 0
          ? ` (raw ${formatMiB(cpuHistory.totalRawEquivalentBytes)} MiB, ${cpuHistory.compressionRatio.toFixed(1)}x, ${cpuHistory.compressedSnapshotCount} snap)`
          : ""
      }`,
      `Last trim: ${formatLastTrim()}`,
      `Warnings: ${warnings.length ? warnings.join(", ") : "none"}`,
    ];
    const text = lines.join("\n");
    const body = overlay.querySelector("[data-raster-memory-body]");

    if (body && state.lastOverlayText !== text) {
      body.textContent = text;
      state.lastOverlayText = text;
    }

    overlay.dataset.status = status;
    syncOverlayChrome(overlay);

    state.renderCountSinceUpdate = 0;
    state.lastStatsAt = now();
    maybeStartAutoMemoryRecovery(telemetry);
  }

  function startRasterMemoryMonitor(options = {}) {
    if (state.running) {
      showRasterMemoryOverlay(options.visible !== false);
      renderOverlay();
      return collectRasterTelemetry();
    }

    state.running = true;
    state.updateHz = Math.max(1, Math.min(10, Number(options.updateHz) || DEFAULT_UPDATE_HZ));
    state.previousRafAt = 0;
    state.autoRecoveryEnabled = options.autoRecovery !== false;

    if (options.budget) {
      state.budgetOverride = {
        ...getBudget(),
        ...options.budget,
      };
    }

    showRasterMemoryOverlay(options.visible !== false);
    patchBrushDraw();
    ensureGpuTimer();
    state.rafId = requestAnimationFrame(tickRaf);
    renderOverlay();
    state.updateTimer = window.setInterval(renderOverlay, Math.round(1000 / state.updateHz));

    return collectRasterTelemetry();
  }

  function stopRasterMemoryMonitor(options = {}) {
    state.running = false;
    state.overlayExpanded = false;

    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }

    if (state.updateTimer) {
      clearInterval(state.updateTimer);
      state.updateTimer = 0;
    }

    unpatchBrushDraw();
    state.gpuTimer = null;
    state.previousRafAt = 0;
    state.renderCountSinceUpdate = 0;

    if (options.visible === true) {
      const overlay = showRasterMemoryOverlay(true);
      overlay.dataset.status = "off";
      syncOverlayChrome(overlay);
    } else {
      showRasterMemoryOverlay(false);
    }

    return getRasterMemoryMonitorStatus();
  }

  function showRasterMemoryOverlay(visible = true) {
    const overlay = ensureOverlay();

    overlay.hidden = visible !== true;
    syncOverlayChrome(overlay);
    return overlay;
  }

  function getRasterMemoryMonitorStatus() {
    return {
      expanded: state.overlayExpanded,
      running: state.running,
      storedEnabled: readStoredMonitorEnabled(false),
      visible: Boolean(state.overlay?.isConnected && state.overlay.hidden !== true),
    };
  }

  function setRasterMemoryMonitorEnabled(enabled = true, options = {}) {
    const shouldEnable = enabled !== false;

    if (options.persist !== false) {
      writeStoredMonitorEnabled(shouldEnable);
    }

    if (shouldEnable) {
      return startRasterMemoryMonitor({
        ...options,
        visible: options.visible !== false,
      });
    }

    return stopRasterMemoryMonitor({
      ...options,
      visible: options.visible !== false,
    });
  }

  function toggleRasterMemoryMonitor(options = {}) {
    return setRasterMemoryMonitorEnabled(!state.running, options);
  }

  function setRasterMemoryBudget(budget = {}) {
    state.budgetOverride = {
      ...getBudget(),
      ...budget,
    };

    return state.budgetOverride;
  }

  function trimRasterMemory(level = "soft", options = {}) {
    const renderer = namespace.documentRenderer;
    const before = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
    const normalizedLevel = ["soft", "medium", "critical"].includes(level) ? level : "soft";
    const deleted = [];
    let historyGpuPrune = null;

    if (!renderer) {
      return {
        freedBytes: 0,
        level: normalizedLevel,
        deleted,
        warning: "DocumentRenderer non inizializzato.",
      };
    }

    const deleteTarget = (key) => {
      const target = renderer[key];

      if (!target) {
        return;
      }

      renderer.deleteRasterTargetObject?.(target);
      renderer[key] = null;
      deleted.push(key);
    };

    const deleteBlendBackdrop = () => {
      if (!renderer.layerBlendBackdropTexture) {
        return;
      }

      renderer.deleteRasterTexture?.(renderer.layerBlendBackdropTexture);
      renderer.gl?.deleteTexture?.(renderer.layerBlendBackdropTexture);
      renderer.layerBlendBackdropTexture = null;
      renderer.layerBlendBackdropWidth = 0;
      renderer.layerBlendBackdropHeight = 0;
      deleted.push("layerBlendBackdropTexture");
    };

    deleteTarget("layerEffectScratchA");
    deleteTarget("layerEffectScratchB");

    if (!namespace.brushEngine?.isDrawing) {
      deleteTarget("activeStrokeScratchTarget");
    }

    deleteBlendBackdrop();

    if (
      renderer.rasterTransformPreview?.texture &&
      !namespace.rasterTransformTool?.sourceSnapshot &&
      !namespace.rasterTransformTool?.dragState
    ) {
      renderer.deleteRasterTexture?.(renderer.rasterTransformPreview.texture);
      renderer.gl?.deleteTexture?.(renderer.rasterTransformPreview.texture);
      renderer.rasterTransformPreview = null;
      deleted.push("rasterTransformPreview");
    }

    if (normalizedLevel === "medium" || normalizedLevel === "critical") {
      renderer.deletePreviewCache?.();
      deleted.push("previewCache");
    }

    if (normalizedLevel === "critical") {
      if (Array.isArray(namespace.documentHistory?.redoStack)) {
        namespace.documentHistory.clearStack?.(namespace.documentHistory.redoStack);
        namespace.documentHistory.emitChange?.("trim-raster-memory-critical");
        deleted.push("redoStack");
      }
    }

    if (normalizedLevel === "medium" || normalizedLevel === "critical") {
      historyGpuPrune = namespace.documentHistory?.pruneRasterHistoryGpuHotBudget?.({
        minProtectedEntries: 0,
        targetGpuHotBytes: normalizedLevel === "critical" ? 0 : 64 * MIB,
      }) || null;

      if (historyGpuPrune?.cooled?.length) {
        deleted.push("historyGpuHot");
      }
    }

    renderer.invalidatePreviewCache?.(`trim-raster-memory-${normalizedLevel}`);
    renderer.requestDraw?.();

    const after = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
    const freedBytes = Math.max(0, before - after);

    state.lastTrim = {
      at: now(),
      freedBytes,
      level: normalizedLevel,
      reason: options.reason || "manual",
    };

    renderOverlay();

    return {
      afterBytes: after,
      beforeBytes: before,
      deleted,
      freedBytes,
      historyGpuPrune,
      level: normalizedLevel,
    };
  }

  function isRasterInteractionBusy() {
    return Boolean(
      namespace.brushEngine?.isDrawing ||
      namespace.liquifyEngine?.isDragging ||
      namespace.rasterTransformTool?.dragState ||
      namespace.rasterTransformTool?.sourceSnapshot
    );
  }

  function compactPaintTargetsForAutoRecovery(status, options = {}) {
    const renderer = namespace.documentRenderer;

    if (!renderer?.compactInactivePaintTargets) {
      return null;
    }

    return renderer.compactInactivePaintTargets({
      includeActive: options.includeActive === true || !isRasterInteractionBusy(),
      maxCropCoverage: status === "critical" ? 0.95 : 0.9,
      maxTargets: status === "critical" ? 64 : 24,
      minSavingsMiB: status === "critical" ? 2 : 4,
      padding: 2,
      precise: true,
      source: "memory-auto-recovery-compact",
    });
  }

  function performSoftMemoryRecovery(reason = "memory-soft-recovery") {
    const renderer = namespace.documentRenderer;
    const beforeBytes = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
    const trim = trimRasterMemory("medium", { reason });
    const orphanPrunedCount = renderer?.pruneOrphanRasterTargets?.() || 0;
    const afterBytes = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
    const freedBytes = Math.max(0, beforeBytes - afterBytes);

    renderer?.invalidatePreviewCache?.(reason);
    renderer?.requestDraw?.();

    return {
      afterBytes,
      beforeBytes,
      freedBytes,
      orphanPrunedCount,
      trim,
    };
  }

  function getAutosaveFailureTitle() {
    const errorName = namespace.lastDocumentAutosaveError?.name || "";

    return errorName === "QuotaExceededError" ? "Storage full" : "Checkpoint failed";
  }

  async function runRasterMemoryAutoRecovery(triggerTelemetry = null) {
    const triggerStatus = triggerTelemetry?.status || "medium";
    const beforeBytes = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
    const historyBefore = {
      redoCount: namespace.documentHistory?.redoStack?.length || 0,
      undoCount: namespace.documentHistory?.undoStack?.length || 0,
    };
    let checkpointBlocked = false;
    let checkpointMode = "persistent";
    let didRestore = false;
    let saveResult = false;
    let saveSucceeded = false;
    let recovery = null;

    showAutoRecoveryOverlay("Autosaving...", "Creo un checkpoint pulito");

    try {
      const preSaveCompaction = compactPaintTargetsForAutoRecovery("critical", {
        includeActive: true,
      });
      const preSaveTrim = trimRasterMemory("medium", {
        reason: "memory-checkpoint-presave",
      });

      await sleep(80);
      saveResult = await Promise.resolve(
        namespace.documentAutosave?.saveNow?.({
          cleanupBeforeWrite: true,
          memoryFallback: true,
          source: "memory-checkpoint",
        }) || false,
      );
      checkpointMode = saveResult === "memory" ? "memory" : "persistent";
      saveSucceeded = saveResult === true || saveResult === "memory";

      if (!saveSucceeded) {
        checkpointBlocked = true;
        state.autoRecoveryCheckpointBlocked = true;
        recovery = {
          checkpointBlocked,
          preSaveCompaction,
          preSaveTrim,
          soft: performSoftMemoryRecovery("memory-checkpoint-failed-soft-trim"),
        };

        showAutoRecoveryOverlay(getAutosaveFailureTitle(), "Checkpoint automatico sospeso");
        hideAutoRecoveryOverlay(AUTO_RECOVERY_HIDE_DELAY_MS);
        state.autoRecoveryLastAt = now();
        state.autoRecoveryCooldownUntil = state.autoRecoveryLastAt + AUTO_RECOVERY_LOW_GAIN_COOLDOWN_MS;

        const afterBytes = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
        const result = {
          afterBytes,
          beforeBytes,
          checkpointBlocked,
          error: namespace.lastDocumentAutosaveError || null,
          freedBytes: Math.max(0, beforeBytes - afterBytes),
          generatedAt: new Date().toISOString(),
          recovery,
          saveSucceeded,
          triggerStatus,
        };

        namespace.lastRasterMemoryAutoRecovery = result;
        window.dispatchEvent(new CustomEvent("cbo:raster-memory-auto-recovery", {
          detail: result,
        }));

        renderOverlay();
        return result;
      }

      state.autoRecoveryCheckpointBlocked = false;
      showAutoRecoveryOverlay("Resetting canvas...", "Ricarico il documento senza undo");
      await sleep(60);

      namespace.documentHistory?.clear?.();
      const restoreOptions = {
        clearAfterRestore: true,
        resetRenderer: true,
        source: "memory-auto-recovery",
      };
      const restorePromise = checkpointMode === "memory"
        ? namespace.documentAutosave?.restoreMemoryCheckpoint?.(restoreOptions)
        : namespace.documentAutosave?.restoreLatest?.({
          resetRenderer: true,
          source: "memory-auto-recovery",
        });

      didRestore = await Promise.resolve(restorePromise || false);

      const postRestoreTrim = trimRasterMemory("critical", {
        reason: "memory-auto-recovery-post-restore",
      });

      const afterBytes = namespace.collectRasterMemory?.({ log: false })?.totalBytes || 0;
      const freedBytes = Math.max(0, beforeBytes - afterBytes);
      recovery = {
        checkpointMode,
        didRestore,
        historyBefore,
        postRestoreTrim,
        preSaveCompaction,
        preSaveTrim,
      };
      const result = {
        afterBytes,
        beforeBytes,
        checkpointMode,
        didRestore,
        freedBytes,
        generatedAt: new Date().toISOString(),
        historyBefore,
        recovery,
        saveSucceeded,
        triggerStatus,
      };

      state.autoRecoveryLastAt = now();
      state.autoRecoveryCooldownUntil = freedBytes < MIB
        ? state.autoRecoveryLastAt + AUTO_RECOVERY_LOW_GAIN_COOLDOWN_MS
        : 0;
      state.lastTrim = {
        at: now(),
        freedBytes,
        level: saveSucceeded ? "auto-critical" : "auto-medium",
        reason: "memory-auto-recovery",
      };
      namespace.lastRasterMemoryAutoRecovery = result;
      window.dispatchEvent(new CustomEvent("cbo:raster-memory-auto-recovery", {
        detail: result,
      }));

      showAutoRecoveryOverlay(
        didRestore ? "Memory reset" : "Memory cleaned",
        `-${formatMiB(freedBytes)} MiB`,
      );
      hideAutoRecoveryOverlay(AUTO_RECOVERY_HIDE_DELAY_MS);
      renderOverlay();

      return result;
    } catch (error) {
      state.autoRecoveryLastAt = now();
      state.autoRecoveryCooldownUntil = state.autoRecoveryLastAt + AUTO_RECOVERY_LOW_GAIN_COOLDOWN_MS;
      state.autoRecoveryCheckpointBlocked = true;
      console.warn?.("Recupero memoria automatico non riuscito.", error);
      showAutoRecoveryOverlay("Checkpoint failed", "Recovery automatico sospeso");
      hideAutoRecoveryOverlay(AUTO_RECOVERY_HIDE_DELAY_MS);

      return {
        beforeBytes,
        checkpointBlocked: true,
        error: error?.message || String(error),
        generatedAt: new Date().toISOString(),
        didRestore,
        recovery,
        saveSucceeded,
        triggerStatus,
      };
    } finally {
      state.autoRecoveryRunning = false;
    }
  }

  function maybeStartAutoMemoryRecovery(telemetry) {
    if (!state.autoRecoveryEnabled || state.autoRecoveryRunning || isRasterInteractionBusy()) {
      return false;
    }

    const severity = getStatusSeverity(telemetry?.status);

    if (severity < 1) {
      return false;
    }

    const elapsed = now() - (state.autoRecoveryLastAt || 0);
    const cooldown = severity >= 3 ? AUTO_RECOVERY_CRITICAL_COOLDOWN_MS : AUTO_RECOVERY_COOLDOWN_MS;

    if (state.autoRecoveryCooldownUntil && now() < state.autoRecoveryCooldownUntil) {
      return false;
    }

    if (elapsed < cooldown) {
      return false;
    }

    if (severity === 1 || state.autoRecoveryCheckpointBlocked) {
      state.autoRecoveryRunning = true;

      try {
        const soft = performSoftMemoryRecovery(
          state.autoRecoveryCheckpointBlocked
            ? "memory-checkpoint-blocked-soft-trim"
            : "memory-warning-soft-trim",
        );

        state.autoRecoveryLastAt = now();
        state.autoRecoveryCooldownUntil = soft.freedBytes < MIB
          ? state.autoRecoveryLastAt + AUTO_RECOVERY_LOW_GAIN_COOLDOWN_MS
          : 0;
        namespace.lastRasterMemoryAutoRecovery = {
          ...soft,
          generatedAt: new Date().toISOString(),
          mode: "soft",
          triggerStatus: telemetry?.status || "warning",
        };
      } finally {
        state.autoRecoveryRunning = false;
      }

      return true;
    }

    state.autoRecoveryRunning = true;
    window.setTimeout(() => {
      void runRasterMemoryAutoRecovery(telemetry);
    }, 0);

    return true;
  }

  function setRasterMemoryAutoRecovery(enabled = true) {
    state.autoRecoveryEnabled = enabled !== false;
    if (state.autoRecoveryEnabled) {
      state.autoRecoveryCheckpointBlocked = false;
      state.autoRecoveryCooldownUntil = 0;
    }

    return state.autoRecoveryEnabled;
  }

  function dumpRasterTelemetry() {
    const telemetry = collectRasterTelemetry();

    console.groupCollapsed?.("[CBO memory] Raster telemetry dump");
    console.log?.(telemetry);
    console.table?.(telemetry.memory?.summary || []);
    console.table?.(telemetry.memory?.rows || []);
    console.groupEnd?.();

    return telemetry;
  }

  namespace.collectRasterPerformance = function collectRasterPerformance() {
    const telemetry = collectRasterTelemetry();
    return telemetry.performance;
  };
  namespace.collectRasterTelemetry = collectRasterTelemetry;
  namespace.canCreateRasterLayer = canCreateRasterLayer;
  namespace.dumpRasterTelemetry = dumpRasterTelemetry;
  namespace.getRasterMemoryBudget = getBudget;
  namespace.getRasterLayerCreationBudget = getRasterLayerCreationBudget;
  namespace.getRasterMemoryMonitorStatus = getRasterMemoryMonitorStatus;
  namespace.setRasterMemoryBudget = setRasterMemoryBudget;
  namespace.setRasterMemoryAutoRecovery = setRasterMemoryAutoRecovery;
  namespace.setRasterMemoryMonitorEnabled = setRasterMemoryMonitorEnabled;
  namespace.showRasterMemoryOverlay = showRasterMemoryOverlay;
  namespace.startRasterMemoryMonitor = startRasterMemoryMonitor;
  namespace.stopRasterMemoryMonitor = stopRasterMemoryMonitor;
  namespace.toggleRasterMemoryMonitor = toggleRasterMemoryMonitor;
  namespace.trimRasterMemory = trimRasterMemory;
  namespace.runRasterMemoryAutoRecovery = runRasterMemoryAutoRecovery;
  namespace.Memory = {
    ...(namespace.Memory || {}),
    dumpTelemetry: dumpRasterTelemetry,
    canCreateLayer: canCreateRasterLayer,
    getLayerCreationBudget: getRasterLayerCreationBudget,
    getBudget,
    runAutoRecovery: runRasterMemoryAutoRecovery,
    setBudget: setRasterMemoryBudget,
    setAutoRecovery: setRasterMemoryAutoRecovery,
    setMonitorEnabled: setRasterMemoryMonitorEnabled,
    startMonitor: startRasterMemoryMonitor,
    getMonitorStatus: getRasterMemoryMonitorStatus,
    stopMonitor: stopRasterMemoryMonitor,
    toggleMonitor: toggleRasterMemoryMonitor,
    trim: trimRasterMemory,
  };
  namespace.DebugMonitors = {
    ...(namespace.DebugMonitors || {}),
    getStatus() {
      return {
        dirty: namespace.getDirtyRegionMonitorStatus?.() || null,
        raster: getRasterMemoryMonitorStatus(),
      };
    },
    start(options = {}) {
      return {
        dirty: namespace.setDirtyRegionMonitorEnabled?.(true, options) || null,
        raster: setRasterMemoryMonitorEnabled(true, options),
      };
    },
    stop(options = {}) {
      return {
        dirty: namespace.setDirtyRegionMonitorEnabled?.(false, options) || null,
        raster: setRasterMemoryMonitorEnabled(false, options),
      };
    },
    toggle(options = {}) {
      const dirtyRunning = namespace.getDirtyRegionMonitorStatus?.().running === true;

      return state.running || dirtyRunning
        ? namespace.DebugMonitors.stop(options)
        : namespace.DebugMonitors.start(options);
    },
  };

  window.addEventListener("cbo:document-autosave", () => {
    state.autoRecoveryCheckpointBlocked = false;
  });

  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => {
      if (readStoredMonitorEnabled(false)) {
        startRasterMemoryMonitor({
          visible: true,
        });
        return;
      }

      showRasterMemoryOverlay(true);
    }, 0);
  });
})(window.CBO = window.CBO || {});
