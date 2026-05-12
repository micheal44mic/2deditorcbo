(function registerDirtyRegionMonitor(namespace) {
  const EVENT_NAME = "cbo:preview-dirty-region-debug";
  const MONITOR_SCRIPT_URL = document.currentScript?.src || "";
  const OVERLAY_ID = "cbo-dirty-region-overlay";
  const OVERLAY_PANEL_ID = "cbo-dirty-region-panel";
  const DEFAULT_UPDATE_HZ = 4;

  const state = {
    lastText: "",
    lastBakeDebugEvent: null,
    lastCacheDebugEvent: null,
    lastDirtyDebugEvent: null,
    lastLiveDebugEvent: null,
    overlay: null,
    overlayLoadPromise: null,
    overlayExpanded: false,
    renderRafId: 0,
    running: false,
    updateHz: DEFAULT_UPDATE_HZ,
    updateTimer: 0,
  };

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function formatPercent(value) {
    return `${clampPercent(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
  }

  function formatPixels(value) {
    const pixels = Math.max(0, Number(value) || 0);

    if (pixels >= 1000000) {
      return `${(pixels / 1000000).toFixed(2)} MPx`;
    }

    if (pixels >= 1000) {
      return `${(pixels / 1000).toFixed(1)} KPx`;
    }

    return `${Math.round(pixels)} px`;
  }

  function formatRect(rect) {
    if (!rect) {
      return "none";
    }

    return `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  function formatAge(timestamp) {
    const elapsedMs = Math.max(0, Date.now() - Math.max(0, Number(timestamp) || 0));

    if (!timestamp) {
      return "n/a";
    }

    if (elapsedMs < 1000) {
      return "now";
    }

    if (elapsedMs < 60000) {
      return `${Math.round(elapsedMs / 1000)}s ago`;
    }

    return `${Math.round(elapsedMs / 60000)}m ago`;
  }

  function getRectArea(rect) {
    return Math.max(0, Number(rect?.width) || 0) * Math.max(0, Number(rect?.height) || 0);
  }

  function getRectListArea(rects) {
    if (!Array.isArray(rects) || rects.length === 0) {
      return 0;
    }

    const renderer = namespace.documentRenderer;

    if (typeof renderer?.getDirtyRegionRectListArea === "function") {
      return Math.max(0, Number(renderer.getDirtyRegionRectListArea(rects)) || 0);
    }

    return rects.reduce((total, rect) => total + getRectArea(rect), 0);
  }

  function unionRects(rects) {
    if (!Array.isArray(rects) || rects.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    rects.forEach((rect) => {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return;
      }

      minX = Math.min(minX, Number(rect.x) || 0);
      minY = Math.min(minY, Number(rect.y) || 0);
      maxX = Math.max(maxX, (Number(rect.x) || 0) + (Number(rect.width) || 0));
      maxY = Math.max(maxY, (Number(rect.y) || 0) + (Number(rect.height) || 0));
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
      return null;
    }

    return {
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY,
    };
  }

  function getDocumentPixels(renderer) {
    const width = Math.max(1, Math.round(Number(renderer?.width) || Number(namespace.documentSettings?.width) || 1));
    const height = Math.max(1, Math.round(Number(renderer?.height) || Number(namespace.documentSettings?.height) || 1));

    return {
      height,
      pixels: width * height,
      width,
    };
  }

  function getCacheTelemetry(renderer, stats, documentSize) {
    return {
      height: Math.max(0, Number(stats.lastCacheHeight) || Number(renderer?.previewCacheHeight) || 0),
      scale: Math.max(0, Number(stats.lastCacheScale) || Number(renderer?.previewCacheScale) || 0),
      width: Math.max(0, Number(stats.lastCacheWidth) || Number(renderer?.previewCacheWidth) || 0),
    };
  }

  function getPendingDirtyTelemetry(renderer, documentSize, cache) {
    if (!renderer?.previewCacheDirty) {
      return null;
    }

    const cacheWidth = Math.max(1, Math.round(Number(cache.width) || Number(renderer.previewCacheWidth) || documentSize.width || 1));
    const cacheHeight = Math.max(1, Math.round(Number(cache.height) || Number(renderer.previewCacheHeight) || documentSize.height || 1));
    const cacheScale = Math.max(
      0.0001,
      Number(cache.scale) || Number(renderer.previewCacheScale) || Math.min(cacheWidth / documentSize.width, cacheHeight / documentSize.height) || 1,
    );
    const cachePixels = Math.max(1, cacheWidth * cacheHeight);
    const dirtyRects = Array.isArray(renderer.previewDirtyRects)
      ? renderer.previewDirtyRects.filter(Boolean).map((rect) => ({ ...rect }))
      : [];
    const dirtyScissors = dirtyRects.length > 0 && typeof renderer.getPreviewDirtyRegionScissors === "function"
      ? renderer.getPreviewDirtyRegionScissors(
          dirtyRects,
          cacheWidth,
          cacheHeight,
          cacheScale,
          renderer.previewDirtyCompactOptions || {},
        )
      : null;
    const isPartial = Array.isArray(dirtyScissors) && dirtyScissors.length > 0;
    const drawnPixels = isPartial
      ? Math.min(cachePixels, getRectListArea(dirtyScissors))
      : cachePixels;
    const rect = dirtyRects.length > 0 ? unionRects(dirtyRects) : null;
    const rectPixels = rect ? getRectArea(rect) : 0;

    return {
      coverage: drawnPixels / cachePixels,
      mode: isPartial ? "partial" : "full",
      pending: true,
      reason: renderer.previewCacheReason || "pending",
      rect: rect ? { ...rect } : null,
      rectCount: dirtyRects.length,
      rectDocumentCoverage: documentSize.pixels > 0 ? rectPixels / documentSize.pixels : 0,
      savedPixels: Math.max(0, cachePixels - drawnPixels),
      scissorCount: isPartial ? dirtyScissors.length : 0,
    };
  }

  function collectDirtyRegionTelemetry() {
    const renderer = namespace.documentRenderer;
    const stats = renderer?.getPreviewDirtyStats?.() || renderer?.previewDirtyStats || {};
    const documentSize = getDocumentPixels(renderer);
    const cache = getCacheTelemetry(renderer, stats, documentSize);
    const pendingLast = getPendingDirtyTelemetry(renderer, documentSize, cache);
    const lastRect = renderer?.previewLastDirtyRect || stats.lastRect || null;
    const lastRectPixels = lastRect
      ? Math.max(0, Math.round(lastRect.width || 0) * Math.round(lastRect.height || 0))
      : 0;
    const totalFrames = Math.max(0, Number(stats.totalFrames) || 0);
    const partialFrames = Math.max(0, Number(stats.partialFrames) || 0);
    const fullFrames = Math.max(0, Number(stats.fullFrames) || 0);
    const lastFullPixels = Math.max(0, Number(stats.lastFullPixels) || 0);
    const lastDrawnPixels = Math.max(0, Number(stats.lastDrawnPixels) || 0);
    const totalFullPixels = Math.max(0, Number(stats.totalFullPixels) || 0);
    const totalDrawnPixels = Math.max(0, Number(stats.totalDrawnPixels) || 0);
    const totalSavedPixels = Math.max(0, Number(stats.totalSavedPixels) || 0);

    return {
      cache,
      document: documentSize,
      generatedAt: new Date().toISOString(),
      debug: {
        bake: state.lastBakeDebugEvent,
        cache: state.lastCacheDebugEvent,
        last: state.lastDirtyDebugEvent,
        live: state.lastLiveDebugEvent,
      },
      hitRate: totalFrames > 0 ? partialFrames / totalFrames : 0,
      last: pendingLast || {
        coverage: lastFullPixels > 0 ? lastDrawnPixels / lastFullPixels : Number(stats.lastCoverage) || 1,
        mode: renderer?.previewLastDirtyMode || stats.lastMode || "n/a",
        pending: false,
        reason: stats.lastReason || renderer?.previewCacheReason || "unknown",
        rect: lastRect ? { ...lastRect } : null,
        rectCount: Math.max(0, Number(stats.lastRectCount) || 0),
        rectDocumentCoverage: documentSize.pixels > 0 ? lastRectPixels / documentSize.pixels : 0,
        savedPixels: Math.max(0, Number(stats.lastSavedPixels) || 0),
        scissorCount: Math.max(0, Number(stats.lastScissorCount) || 0),
      },
      totals: {
        drawnPixels: totalDrawnPixels,
        fullFrames,
        fullPixels: totalFullPixels,
        partialFrames,
        savedPixels: totalSavedPixels,
        savedRatio: totalFullPixels > 0 ? totalSavedPixels / totalFullPixels : 0,
        totalFrames,
      },
      zoom: Number(namespace.brushEngine?.camera?.zoom) || 0,
    };
  }

  function summarizeDirtyDebugEvent(detail = {}) {
    const renderer = namespace.documentRenderer;
    const documentSize = getDocumentPixels(renderer);
    const cacheWidth = Math.max(1, Number(renderer?.previewCacheWidth) || documentSize.width || 1);
    const cacheHeight = Math.max(1, Number(renderer?.previewCacheHeight) || documentSize.height || 1);
    const cacheScale = Math.max(
      0.0001,
      Number(renderer?.previewCacheScale) || Math.min(cacheWidth / documentSize.width, cacheHeight / documentSize.height) || 1,
    );
    const rects = Array.isArray(detail.rects) ? detail.rects.filter(Boolean).map((rect) => ({ ...rect })) : [];
    const meta = detail.meta && typeof detail.meta === "object" ? { ...detail.meta } : null;
    const incomingDirtyRectsLength = Number(meta?.incomingDirtyRectsLength);
    const hasRects = rects.length > 0;
    const rectArea = getRectListArea(rects);
    const cachePixels = Math.max(1, cacheWidth * cacheHeight);
    const cacheRedrawPixels = Math.min(cachePixels, rectArea * cacheScale * cacheScale);

    return {
      ageLabel: formatAge(detail.generatedAt),
      cacheCoverage: cacheRedrawPixels / cachePixels,
      forcedFullCause: meta?.forcedFullCause || "",
      generatedAt: Math.max(0, Number(detail.generatedAt) || Date.now()),
      incomingDirtyRectsLength: Number.isFinite(incomingDirtyRectsLength) ? incomingDirtyRectsLength : null,
      layerId: detail.layerId || "",
      live: detail.live === true,
      meta,
      mode: detail.mode || "partial",
      previewCacheReady: typeof meta?.previewCacheReady === "boolean" ? meta.previewCacheReady : null,
      hasRects,
      reason: detail.reason || "unknown",
      rect: unionRects(rects),
      rectCount: rects.length,
      rectDocumentCoverage: documentSize.pixels > 0 ? rectArea / documentSize.pixels : 0,
    };
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
      "left:10px",
      "bottom:10px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-start",
      "box-sizing:border-box",
      "color:#eef3ff",
      "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "pointer-events:none",
    ].join(";");

    if (!overlay.querySelector("[data-dirty-region-toggle]")) {
      overlay.replaceChildren();

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.dirtyRegionToggle = "true";
      toggle.setAttribute("aria-controls", OVERLAY_PANEL_ID);
      toggle.setAttribute("aria-label", "Apri monitor dirty regions");
      toggle.title = "Apri monitor dirty regions";
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
        "border:1px solid rgba(118,190,255,.42)",
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

      const dot = document.createElement("span");
      dot.dataset.dirtyRegionStatusDot = "true";
      dot.style.cssText = [
        "display:block",
        "width:7px",
        "height:7px",
        "border-radius:999px",
        "background:rgba(118,190,255,.9)",
        "box-shadow:0 0 0 2px rgba(118,190,255,.12)",
        "flex:0 0 auto",
      ].join(";");

      const toggleText = document.createElement("span");
      toggleText.textContent = "Dirty";

      toggle.append(dot, toggleText);

      const panel = document.createElement("div");
      panel.id = OVERLAY_PANEL_ID;
      panel.dataset.dirtyRegionPanel = "true";
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = [
        "min-width:264px",
        "max-width:min(360px,calc(100vw - 20px))",
        "box-sizing:border-box",
        "border:1px solid rgba(118,190,255,.42)",
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
      title.textContent = "Dirty regions";

      const close = document.createElement("button");
      close.type = "button";
      close.dataset.dirtyRegionClose = "true";
      close.setAttribute("aria-label", "Chiudi monitor dirty regions");
      close.title = "Chiudi monitor dirty regions";
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
      body.dataset.dirtyRegionBody = "true";
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
        setOverlayExpanded(true);
        renderOverlay();
      });

      close.addEventListener("click", () => {
        setOverlayExpanded(false);
      });

      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          setOverlayExpanded(false);
        }
      });

      header.append(title, close);
      panel.append(header, body);
      overlay.append(toggle, panel);
    }

    state.overlay = overlay;
    syncOverlayChrome(overlay);
    return overlay;
  }

  function syncOverlayChrome(overlay = state.overlay) {
    if (!overlay) {
      return;
    }

    const telemetry = collectDirtyRegionTelemetry();
    const debugMode = telemetry.debug.last?.mode || "";
    const isPartial = telemetry.last.mode === "partial" || debugMode.includes("partial");
    const color = isPartial ? "rgba(118,190,255,.9)" : "rgba(255,224,112,.72)";
    const toggle = overlay.querySelector("[data-dirty-region-toggle]");
    const panel = overlay.querySelector("[data-dirty-region-panel]");
    const dot = overlay.querySelector("[data-dirty-region-status-dot]");

    if (toggle) {
      toggle.hidden = state.overlayExpanded;
      toggle.setAttribute("aria-expanded", String(state.overlayExpanded));
      toggle.style.borderColor = color;
    }

    if (panel) {
      panel.hidden = !state.overlayExpanded;
      panel.style.borderColor = color;
    }

    if (dot) {
      dot.style.background = color;
      dot.style.boxShadow = `0 0 0 2px ${isPartial ? "rgba(118,190,255,.12)" : "rgba(255,224,112,.12)"}`;
    }
  }

  function setOverlayExpanded(expanded) {
    state.overlayExpanded = expanded === true;
    syncOverlayChrome();
  }

  function formatDebugEvent(event) {
    if (!event) {
      return "none";
    }

    const rectStatus = event.hasRects ? "" : " / no rects";
    const causeStatus = event.forcedFullCause ? ` / ${event.forcedFullCause}` : "";

    return `${event.mode} / ${event.reason}${causeStatus}${rectStatus} (${formatAge(event.generatedAt)})`;
  }

  function renderOverlay() {
    const telemetry = collectDirtyRegionTelemetry();
    const overlay = ensureOverlay();
    const live = telemetry.debug.live;
    const bake = telemetry.debug.bake;
    const lines = [
      "CBO DIRTY REGIONS",
      `Cache ${telemetry.last.pending ? "pending" : "last"}: ${telemetry.last.mode} / ${telemetry.last.reason}`,
      `Zoom: ${telemetry.zoom ? telemetry.zoom.toFixed(3) : "n/a"}`,
      "",
      `Last rect: ${formatRect(telemetry.last.rect)}`,
      `Dirty rects: ${telemetry.last.rectCount} / scissors ${telemetry.last.scissorCount}`,
      `Doc coverage: ${formatPercent(telemetry.last.rectDocumentCoverage)}`,
      `Cache redraw: ${formatPercent(telemetry.last.coverage)}`,
      `Saved last: ${formatPixels(telemetry.last.savedPixels)}`,
      "",
      `Live stroke: ${formatDebugEvent(live)}`,
      `Live rects: ${live?.rectCount || 0}`,
      `Live doc: ${formatPercent(live?.rectDocumentCoverage || 0)}`,
      `Live cache est: ${formatPercent(live?.cacheCoverage || 0)}`,
      "",
      `Bake stroke: ${formatDebugEvent(bake)}`,
      `Bake rects: ${bake?.rectCount || 0}`,
      `Bake incoming: ${bake?.incomingDirtyRectsLength ?? "n/a"}`,
      `Bake cache est: ${bake?.hasRects ? formatPercent(bake.cacheCoverage) : "no rects"}`,
      "",
      `Cache: ${telemetry.cache.width}x${telemetry.cache.height} @${telemetry.cache.scale.toFixed(3)}`,
      `Document: ${telemetry.document.width}x${telemetry.document.height}`,
      "",
      `Frames: ${telemetry.totals.totalFrames}`,
      `Partial/full: ${telemetry.totals.partialFrames}/${telemetry.totals.fullFrames}`,
      `Partial hit: ${formatPercent(telemetry.hitRate)}`,
      `Total redraw: ${formatPixels(telemetry.totals.drawnPixels)}`,
      `Total saved: ${formatPixels(telemetry.totals.savedPixels)} (${formatPercent(telemetry.totals.savedRatio)})`,
    ];
    const text = lines.join("\n");
    const body = overlay.querySelector("[data-dirty-region-body]");

    if (body && state.lastText !== text) {
      body.textContent = text;
      state.lastText = text;
    }

    syncOverlayChrome(overlay);
  }

  function queueRenderOverlay() {
    if (!state.running || state.renderRafId) {
      return;
    }

    state.renderRafId = window.requestAnimationFrame(() => {
      state.renderRafId = 0;
      renderOverlay();
    });
  }

  function handleDirtyDebugEvent(event) {
    const summary = summarizeDirtyDebugEvent(event.detail || {});

    state.lastDirtyDebugEvent = summary;

    if (summary.live) {
      state.lastLiveDebugEvent = summary;
    } else if (summary.reason === "bake-stroke") {
      state.lastBakeDebugEvent = summary;
    } else {
      state.lastCacheDebugEvent = summary;
    }

    queueRenderOverlay();
  }

  function showDirtyRegionOverlay(visible = true) {
    const overlay = ensureOverlay();

    overlay.hidden = visible !== true;
    return overlay;
  }

  function startDirtyRegionMonitor(options = {}) {
    if (state.running) {
      showDirtyRegionOverlay(options.visible !== false);
      renderOverlay();
      return collectDirtyRegionTelemetry();
    }

    state.running = true;
    state.updateHz = Math.max(1, Math.min(12, Number(options.updateHz) || DEFAULT_UPDATE_HZ));
    window.addEventListener(EVENT_NAME, handleDirtyDebugEvent);
    showDirtyRegionOverlay(options.visible !== false);
    renderOverlay();
    state.updateTimer = window.setInterval(renderOverlay, Math.round(1000 / state.updateHz));

    return collectDirtyRegionTelemetry();
  }

  function stopDirtyRegionMonitor() {
    state.running = false;

    if (state.updateTimer) {
      clearInterval(state.updateTimer);
      state.updateTimer = 0;
    }

    window.removeEventListener(EVENT_NAME, handleDirtyDebugEvent);
    if (state.renderRafId) {
      window.cancelAnimationFrame(state.renderRafId);
      state.renderRafId = 0;
    }

    showDirtyRegionOverlay(false);
  }

  function resetDirtyRegionStats() {
    const stats = namespace.documentRenderer?.resetPreviewDirtyStats?.() || null;

    state.lastBakeDebugEvent = null;
    state.lastCacheDebugEvent = null;
    state.lastDirtyDebugEvent = null;
    state.lastLiveDebugEvent = null;
    renderOverlay();
    return stats;
  }

  function getLoadedDirtyRegionOverlayApi(fallbackApi) {
    const api = namespace.dirtyRegionOverlay;

    return api && api !== fallbackApi ? api : null;
  }

  function getDirtyRegionOverlayScriptUrl() {
    const cacheBust = `dirty-overlay-fallback-${Date.now()}`;

    try {
      return new URL(`dirty-region-overlay.js?v=${cacheBust}`, MONITOR_SCRIPT_URL || window.location.href).href;
    } catch (error) {
      return `./js/debug/dirty-region-overlay.js?v=${cacheBust}`;
    }
  }

  function loadDirtyRegionOverlayScript(fallbackApi) {
    const existingApi = getLoadedDirtyRegionOverlayApi(fallbackApi);

    if (existingApi) {
      return Promise.resolve(existingApi);
    }

    if (state.overlayLoadPromise) {
      return state.overlayLoadPromise;
    }

    state.overlayLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.async = true;
      script.src = getDirtyRegionOverlayScriptUrl();
      script.onload = () => {
        const api = getLoadedDirtyRegionOverlayApi(fallbackApi);

        state.overlayLoadPromise = null;

        if (api) {
          resolve(api);
        } else {
          reject(new Error("Dirty region overlay script loaded but did not register CBO.dirtyRegionOverlay"));
        }
      };
      script.onerror = () => {
        state.overlayLoadPromise = null;
        reject(new Error(`Unable to load dirty region overlay script: ${script.src}`));
      };
      document.head.append(script);
    });

    return state.overlayLoadPromise;
  }

  const fallbackDirtyRegionOverlay = Object.freeze({
    clear() {
      return getLoadedDirtyRegionOverlayApi(fallbackDirtyRegionOverlay)?.clear?.() || this.status();
    },
    getItems() {
      return getLoadedDirtyRegionOverlayApi(fallbackDirtyRegionOverlay)?.getItems?.() || [];
    },
    start(options = {}) {
      namespace.debugPreviewDirtyRegions = true;

      return loadDirtyRegionOverlayScript(fallbackDirtyRegionOverlay)
        .then((api) => api.start(options));
    },
    status() {
      return getLoadedDirtyRegionOverlayApi(fallbackDirtyRegionOverlay)?.status?.() || {
        enabled: namespace.debugPreviewDirtyRegions === true,
        itemCount: 0,
        labels: false,
        loading: Boolean(state.overlayLoadPromise),
        ttlMs: 0,
      };
    },
    stop() {
      const api = getLoadedDirtyRegionOverlayApi(fallbackDirtyRegionOverlay);

      if (api?.stop) {
        return api.stop();
      }

      namespace.debugPreviewDirtyRegions = false;
      return this.status();
    },
    toggle(options = {}) {
      return namespace.debugPreviewDirtyRegions === true ? this.stop() : this.start(options);
    },
  });

  namespace.collectDirtyRegionTelemetry = collectDirtyRegionTelemetry;
  namespace.showDirtyRegionOverlay = showDirtyRegionOverlay;
  namespace.startDirtyRegionMonitor = startDirtyRegionMonitor;
  namespace.stopDirtyRegionMonitor = stopDirtyRegionMonitor;
  namespace.resetDirtyRegionStats = resetDirtyRegionStats;
  namespace.DirtyRegions = {
    collect: collectDirtyRegionTelemetry,
    reset: resetDirtyRegionStats,
    show: showDirtyRegionOverlay,
    start: startDirtyRegionMonitor,
    stop: stopDirtyRegionMonitor,
  };

  if (!namespace.dirtyRegionOverlay) {
    namespace.dirtyRegionOverlay = fallbackDirtyRegionOverlay;
  }

  if (!namespace.dirtyRegionsOverlay) {
    namespace.dirtyRegionsOverlay = fallbackDirtyRegionOverlay;
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => {
      startDirtyRegionMonitor({
        visible: true,
      });
    }, 0);
  });
})(window.CBO = window.CBO || {});
