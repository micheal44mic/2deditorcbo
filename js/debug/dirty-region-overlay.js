(function registerDirtyRegionOverlay(namespace) {
  const EVENT_NAME = "cbo:preview-dirty-region-debug";
  const OVERLAY_CLASS = "cbo-dirty-region-tile-overlay";
  const DEFAULT_TTL_MS = 2600;
  const MAX_ITEMS = 500;

  const state = {
    canvas: null,
    camera: null,
    ctx: null,
    dpr: 1,
    enabled: false,
    items: [],
    labels: false,
    rafId: 0,
    showSummary: true,
    ttlMs: DEFAULT_TTL_MS,
  };

  function now() {
    return performance?.now?.() || Date.now();
  }

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getCamera() {
    const camera = namespace.brushEngine?.camera || state.camera;
    const dpr = Math.max(
      0.0001,
      Number(state.dpr || namespace.brushEngine?.dpr || window.devicePixelRatio) || 1,
    );

    return {
      dpr,
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      zoom: Number(camera?.zoom) || 1,
    };
  }

  function ensureCanvas() {
    const stage = getStage();

    if (!stage) {
      return null;
    }

    if (state.canvas?.isConnected && state.canvas.parentElement === stage) {
      return state.canvas;
    }

    const canvas = document.createElement("canvas");

    canvas.className = OVERLAY_CLASS;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      display: state.enabled ? "block" : "none",
      height: "100%",
      inset: "0",
      pointerEvents: "none",
      position: "absolute",
      width: "100%",
      zIndex: "84",
    });

    stage.append(canvas);
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d");
    resizeCanvas();

    return canvas;
  }

  function resizeCanvas() {
    const canvas = state.canvas;
    const stage = getStage();

    if (!canvas || !stage) {
      return false;
    }

    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const width = Math.max(1, Math.round(stage.clientWidth || 1));
    const height = Math.max(1, Math.round(stage.clientHeight || 1));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    state.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function toViewportRect(rect, camera = getCamera()) {
    if (!rect) {
      return null;
    }

    const dpr = Math.max(0.0001, Number(camera.dpr) || 1);
    const zoom = Math.max(0.0001, Math.abs(Number(camera.zoom) || 1));

    return {
      height: (Math.max(0, Number(rect.height) || 0) * zoom) / dpr,
      width: (Math.max(0, Number(rect.width) || 0) * zoom) / dpr,
      x: ((Number(camera.x) || 0) + (Number(rect.x) || 0) * zoom) / dpr,
      y: ((Number(camera.y) || 0) + (Number(rect.y) || 0) * zoom) / dpr,
    };
  }

  function drawStrokeRect(ctx, rect, color, width = 1.5, dash = []) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeRect(
      Math.round(rect.x) + 0.5,
      Math.round(rect.y) + 0.5,
      Math.max(1, Math.round(rect.width)),
      Math.max(1, Math.round(rect.height)),
    );
    ctx.restore();
  }

  function getItemStyle(item) {
    if (item.mode === "full" || item.mode === "full-pending") {
      return {
        fill: "rgba(248, 113, 113, 0.13)",
        stroke: "rgba(248, 113, 113, 0.92)",
      };
    }

    return {
      fill: "rgba(34, 211, 238, 0.12)",
      stroke: "rgba(34, 211, 238, 0.95)",
    };
  }

  function drawLabel(ctx, item, rect, alpha) {
    if (!state.labels || !rect || rect.width < 34 || rect.height < 18) {
      return;
    }

    const label = `${item.index + 1}/${item.count} ${Math.round(item.rect.width)}x${Math.round(item.rect.height)}`;
    const labelWidth = Math.min(Math.max(30, rect.width - 8), ctx.measureText(label).width + 10);

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha + 0.1);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(7, 12, 18, 0.78)";
    ctx.fillRect(rect.x + 4, rect.y + 4, labelWidth, 18);
    ctx.fillStyle = "rgba(236, 254, 255, 0.96)";
    ctx.fillText(label, rect.x + 9, rect.y + 7);
    ctx.restore();
  }

  function drawSummary(ctx, items) {
    if (!state.showSummary) {
      return;
    }

    const latest = items[items.length - 1] || null;
    const summary = latest
      ? `dirty ${latest.mode} | ${latest.reason || "unknown"} | ${latest.count} rects`
      : "dirty overlay";

    ctx.save();
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "top";
    const width = Math.ceil(ctx.measureText(summary).width + 18);
    ctx.fillStyle = "rgba(8, 13, 20, 0.84)";
    ctx.strokeStyle = "rgba(250, 204, 21, 0.82)";
    ctx.lineWidth = 1;
    ctx.fillRect(12, 12, width, 26);
    ctx.strokeRect(12.5, 12.5, width - 1, 25);
    ctx.fillStyle = "rgba(254, 249, 195, 0.96)";
    ctx.fillText(summary, 21, 19);
    ctx.restore();
  }

  function render() {
    state.rafId = 0;

    if (!state.enabled || !resizeCanvas()) {
      return;
    }

    const ctx = state.ctx;
    const canvas = state.canvas;

    if (!ctx || !canvas) {
      return;
    }

    const time = now();
    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const camera = getCamera();

    state.items = state.items.filter((item) => item.expiresAt > time);
    ctx.clearRect(0, 0, width, height);

    for (const item of state.items) {
      const rect = toViewportRect(item.rect, camera);

      if (!rect) {
        continue;
      }

      const remaining = Math.max(0, item.expiresAt - time);
      const alpha = Math.min(1, remaining / Math.max(1, state.ttlMs));
      const style = getItemStyle(item);

      ctx.save();
      ctx.globalAlpha = Math.max(0.18, alpha);
      ctx.fillStyle = style.fill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      drawStrokeRect(ctx, rect, style.stroke, 2, item.mode === "partial" ? [] : [7, 5]);
      drawLabel(ctx, item, rect, alpha);
      ctx.restore();
    }

    drawSummary(ctx, state.items);

    if (state.items.length > 0) {
      queueRender();
    }
  }

  function queueRender() {
    if (state.rafId || !state.enabled) {
      return;
    }

    state.rafId = window.requestAnimationFrame(render);
  }

  function addDebugRects(detail = {}) {
    const rects = Array.isArray(detail.rects) ? detail.rects.filter(Boolean) : [];
    const count = rects.length;
    const expiresAt = now() + state.ttlMs;

    if (detail.live === true || (detail.mode !== "partial-live" && rects.length > 0)) {
      state.items = state.items.filter((item) => item.live !== true);
    }

    rects.forEach((rect, index) => {
      state.items.push({
        count,
        expiresAt,
        index,
        layerId: detail.layerId || "",
        live: detail.live === true,
        mode: detail.mode || "partial",
        reason: detail.reason || "",
        rect: { ...rect },
      });
    });

    while (state.items.length > MAX_ITEMS) {
      state.items.shift();
    }
  }

  function handleDirtyRegionDebug(event) {
    if (!state.enabled) {
      return;
    }

    ensureCanvas();
    addDebugRects(event.detail || {});
    queueRender();
  }

  function handleEditorCanvasReady() {
    ensureCanvas();
    queueRender();
  }

  function handleCameraChange(event) {
    const detail = event.detail || {};

    state.camera = detail.camera ? { ...detail.camera } : state.camera;
    state.dpr = Math.max(
      0.0001,
      Number(detail.dpr || namespace.brushEngine?.dpr || window.devicePixelRatio) || 1,
    );
    queueRender();
  }

  function start(options = {}) {
    state.enabled = true;
    state.labels = options.labels === true;
    state.showSummary = options.summary !== false;
    state.ttlMs = Math.max(300, Math.min(10000, Math.round(Number(options.ttlMs) || DEFAULT_TTL_MS)));
    state.camera = namespace.brushEngine?.camera ? { ...namespace.brushEngine.camera } : state.camera;
    state.dpr = Math.max(0.0001, Number(namespace.brushEngine?.dpr || window.devicePixelRatio) || 1);
    namespace.debugPreviewDirtyRegions = true;

    const canvas = ensureCanvas();

    if (canvas) {
      canvas.style.display = "block";
    }

    window.removeEventListener(EVENT_NAME, handleDirtyRegionDebug);
    window.addEventListener(EVENT_NAME, handleDirtyRegionDebug);
    window.addEventListener("resize", queueRender);
    window.addEventListener("cbo:camera-change", handleCameraChange);
    window.addEventListener("cbo:editor-canvas-ready", handleEditorCanvasReady);
    queueRender();

    return status();
  }

  function stop() {
    state.enabled = false;
    namespace.debugPreviewDirtyRegions = false;
    state.items = [];
    window.removeEventListener(EVENT_NAME, handleDirtyRegionDebug);
    window.removeEventListener("resize", queueRender);
    window.removeEventListener("cbo:camera-change", handleCameraChange);
    window.removeEventListener("cbo:editor-canvas-ready", handleEditorCanvasReady);

    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }

    state.ctx?.clearRect(0, 0, state.canvas?.width || 1, state.canvas?.height || 1);

    if (state.canvas) {
      state.canvas.style.display = "none";
    }

    return status();
  }

  function clear() {
    state.items = [];
    queueRender();
    return status();
  }

  function toggle(options = {}) {
    return state.enabled ? stop() : start(options);
  }

  function getItems() {
    return state.items.map((item) => ({
      count: item.count,
      index: item.index,
      layerId: item.layerId,
      live: item.live === true,
      mode: item.mode,
      reason: item.reason,
      rect: item.rect ? { ...item.rect } : null,
    }));
  }

  function status() {
    return {
      enabled: state.enabled,
      itemCount: state.items.length,
      labels: state.labels,
      ttlMs: state.ttlMs,
    };
  }

  const api = Object.freeze({
    clear,
    getItems,
    start,
    status,
    stop,
    toggle,
  });

  namespace.dirtyRegionOverlay = api;
  namespace.dirtyRegionsOverlay = api;
})(window.CBO = window.CBO || {});
