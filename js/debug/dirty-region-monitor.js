(function registerDirtyRegionMonitor(namespace) {
  const OVERLAY_ID = "cbo-dirty-region-overlay";
  const OVERLAY_PANEL_ID = "cbo-dirty-region-panel";
  const DEFAULT_UPDATE_HZ = 4;

  const state = {
    lastText: "",
    overlay: null,
    overlayExpanded: false,
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

  function getDocumentPixels(renderer) {
    const width = Math.max(1, Math.round(Number(renderer?.width) || Number(namespace.documentSettings?.width) || 1));
    const height = Math.max(1, Math.round(Number(renderer?.height) || Number(namespace.documentSettings?.height) || 1));

    return {
      height,
      pixels: width * height,
      width,
    };
  }

  function collectDirtyRegionTelemetry() {
    const renderer = namespace.documentRenderer;
    const stats = renderer?.getPreviewDirtyStats?.() || renderer?.previewDirtyStats || {};
    const documentSize = getDocumentPixels(renderer);
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
      cache: {
        height: Math.max(0, Number(stats.lastCacheHeight) || Number(renderer?.previewCacheHeight) || 0),
        scale: Math.max(0, Number(stats.lastCacheScale) || Number(renderer?.previewCacheScale) || 0),
        width: Math.max(0, Number(stats.lastCacheWidth) || Number(renderer?.previewCacheWidth) || 0),
      },
      document: documentSize,
      generatedAt: new Date().toISOString(),
      hitRate: totalFrames > 0 ? partialFrames / totalFrames : 0,
      last: {
        coverage: lastFullPixels > 0 ? lastDrawnPixels / lastFullPixels : Number(stats.lastCoverage) || 1,
        mode: renderer?.previewLastDirtyMode || stats.lastMode || "n/a",
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
    const isPartial = telemetry.last.mode === "partial";
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

  function renderOverlay() {
    const telemetry = collectDirtyRegionTelemetry();
    const overlay = ensureOverlay();
    const lines = [
      "CBO DIRTY REGIONS",
      `Mode: ${telemetry.last.mode}`,
      `Reason: ${telemetry.last.reason}`,
      `Zoom: ${telemetry.zoom ? telemetry.zoom.toFixed(3) : "n/a"}`,
      "",
      `Last rect: ${formatRect(telemetry.last.rect)}`,
      `Dirty rects: ${telemetry.last.rectCount} / scissors ${telemetry.last.scissorCount}`,
      `Doc coverage: ${formatPercent(telemetry.last.rectDocumentCoverage)}`,
      `Cache redraw: ${formatPercent(telemetry.last.coverage)}`,
      `Saved last: ${formatPixels(telemetry.last.savedPixels)}`,
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

    showDirtyRegionOverlay(false);
  }

  function resetDirtyRegionStats() {
    const stats = namespace.documentRenderer?.resetPreviewDirtyStats?.() || null;

    renderOverlay();
    return stats;
  }

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

  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => {
      startDirtyRegionMonitor({
        visible: true,
      });
    }, 0);
  });
})(window.CBO = window.CBO || {});
