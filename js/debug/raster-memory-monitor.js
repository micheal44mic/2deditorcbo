(function registerRasterMemoryMonitor(namespace) {
  const MIB = 1024 * 1024;
  const OVERLAY_ID = "cbo-raster-memory-overlay";
  const DEFAULT_UPDATE_HZ = 3;
  const DEFAULT_GPU_SAMPLE_EVERY = 10;

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
    rafEmaMs: null,
    rafId: 0,
    renderCountSinceUpdate: 0,
    running: false,
    stutter16: 0,
    stutter33: 0,
    updateTimer: 0,
    updateHz: DEFAULT_UPDATE_HZ,
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
    const seenObjects = new WeakSet();
    const seenBuffers = new WeakSet();
    const seenBlobs = new WeakSet();
    let rawBytes = 0;
    let blobBytes = 0;
    let canvasBytes = 0;
    let imageBitmapBytes = 0;

    const scan = (value) => {
      if (!value || typeof value !== "object") {
        return;
      }

      if (ArrayBuffer.isView?.(value)) {
        const buffer = value.buffer;

        if (buffer && !seenBuffers.has(buffer)) {
          seenBuffers.add(buffer);
          rawBytes += value.byteLength || buffer.byteLength || 0;
        }

        return;
      }

      if (isArrayBuffer(value)) {
        if (!seenBuffers.has(value)) {
          seenBuffers.add(value);
          rawBytes += value.byteLength || 0;
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

    return {
      blobBytes,
      canvasBytes,
      imageBitmapBytes,
      rawBytes,
      totalBytes: rawBytes + blobBytes + canvasBytes + imageBitmapBytes,
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

    if (!engine || typeof engine.draw !== "function" || patchedDrawMethods.has(engine)) {
      return;
    }

    const originalDraw = engine.draw;

    patchedDrawMethods.set(engine, originalDraw);

    engine.draw = function drawWithRasterMonitor(...args) {
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

  function ensureOverlay() {
    if (state.overlay?.isConnected) {
      return state.overlay;
    }

    let overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = [
        "position:fixed",
        "right:10px",
        "bottom:10px",
        "z-index:2147483647",
        "min-width:252px",
        "max-width:340px",
        "box-sizing:border-box",
        "padding:10px 12px",
        "border:1px solid rgba(255,255,255,.14)",
        "background:rgba(14,17,24,.86)",
        "color:#eef3ff",
        "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
        "letter-spacing:0",
        "white-space:pre",
        "pointer-events:none",
        "box-shadow:0 12px 30px rgba(0,0,0,.32)",
        "backdrop-filter:blur(8px)",
      ].join(";");
      document.body.appendChild(overlay);
    }

    state.overlay = overlay;
    return overlay;
  }

  function buildWarnings(memoryReport, categories, budget, cpuHistory) {
    const warnings = [];
    const totalBytes = Number(memoryReport?.totalBytes) || 0;
    const historyGpu = getGroupBytes(categories, ["history snapshots"]);
    const previewCache = categories["renderer caches"] || 0;

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
    const groups = {
      activePreviews: getGroupBytes(categories, ["active previews"]),
      cache: getGroupBytes(categories, ["renderer caches", "active previews"]),
      historyGpu: getGroupBytes(categories, ["history snapshots"]),
      layers: getGroupBytes(categories, ["persistent layer targets"]),
      scratch: getGroupBytes(categories, [
        "renderer scratch targets",
        "brush active stroke",
        "smudge active targets",
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
    patchBrushDraw();
    state.gpuTimer?.poll?.();

    const telemetry = collectRasterTelemetry();
    const overlay = ensureOverlay();
    const { budget, cpuHistory, gpu, groups, memory, performance: perf, status, warnings } = telemetry;
    const totalBytes = Number(memory.totalBytes) || 0;
    const percent = budget.criticalBytes > 0 ? clampPercent((totalBytes / budget.criticalBytes) * 100) : 0;
    const warningHeadroom = budget.warningBytes - totalBytes;
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
      `Headroom warn: ${warningHeadroom >= 0 ? formatMiB(warningHeadroom) : `-${formatMiB(-warningHeadroom)}`} MiB`,
      "Hardware VRAM: unavailable",
      "",
      `Layers: ${formatMiB(groups.layers)} MiB`,
      `Cache: ${formatMiB(groups.cache)} MiB`,
      `Scratch: ${formatMiB(groups.scratch)} MiB`,
      `History GPU: ${formatMiB(groups.historyGpu)} MiB`,
      `History CPU: ${formatMiB(cpuHistory.totalBytes)} MiB`,
      `Last trim: ${formatLastTrim()}`,
      `Warnings: ${warnings.length ? warnings.join(", ") : "none"}`,
    ];
    const text = lines.join("\n");

    if (state.lastOverlayText !== text) {
      overlay.textContent = text;
      state.lastOverlayText = text;
    }

    overlay.dataset.status = status;
    overlay.style.borderColor = status === "critical"
      ? "rgba(255,95,95,.85)"
      : status === "medium"
        ? "rgba(255,196,87,.85)"
        : status === "warning"
          ? "rgba(255,224,112,.72)"
          : "rgba(134,255,186,.35)";

    state.renderCountSinceUpdate = 0;
    state.lastStatsAt = now();
  }

  function startRasterMemoryMonitor(options = {}) {
    if (state.running) {
      showRasterMemoryOverlay(options.visible !== false);
      return collectRasterTelemetry();
    }

    state.running = true;
    state.updateHz = Math.max(1, Math.min(10, Number(options.updateHz) || DEFAULT_UPDATE_HZ));
    state.previousRafAt = 0;

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

  function stopRasterMemoryMonitor() {
    state.running = false;

    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }

    if (state.updateTimer) {
      clearInterval(state.updateTimer);
      state.updateTimer = 0;
    }

    showRasterMemoryOverlay(false);
  }

  function showRasterMemoryOverlay(visible = true) {
    const overlay = ensureOverlay();

    overlay.hidden = visible !== true;
    return overlay;
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
      level: normalizedLevel,
    };
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
  namespace.dumpRasterTelemetry = dumpRasterTelemetry;
  namespace.getRasterMemoryBudget = getBudget;
  namespace.setRasterMemoryBudget = setRasterMemoryBudget;
  namespace.showRasterMemoryOverlay = showRasterMemoryOverlay;
  namespace.startRasterMemoryMonitor = startRasterMemoryMonitor;
  namespace.stopRasterMemoryMonitor = stopRasterMemoryMonitor;
  namespace.trimRasterMemory = trimRasterMemory;
  namespace.Memory = {
    ...(namespace.Memory || {}),
    dumpTelemetry: dumpRasterTelemetry,
    getBudget,
    setBudget: setRasterMemoryBudget,
    startMonitor: startRasterMemoryMonitor,
    stopMonitor: stopRasterMemoryMonitor,
    trim: trimRasterMemory,
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => {
      startRasterMemoryMonitor({
        visible: true,
      });
    }, 0);
  });
})(window.CBO = window.CBO || {});
