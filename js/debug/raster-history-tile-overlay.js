(function registerRasterHistoryTileOverlay(namespace) {
  const EVENT_NAME = "cbo:raster-history-tile-debug";
  const OVERLAY_CLASS = "cbo-raster-history-tile-overlay";
  const DEFAULT_TTL_MS = 1400;
  const MAX_ITEMS = 700;

  const state = {
    canvas: null,
    camera: null,
    ctx: null,
    dpr: 1,
    enabled: false,
    items: [],
    labels: false,
    rafId: 0,
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
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      dpr,
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
      zIndex: "80",
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

  function rectsMatch(first, second) {
    return Boolean(
      first &&
      second &&
      first.x === second.x &&
      first.y === second.y &&
      first.width === second.width &&
      first.height === second.height
    );
  }

  function getPhaseStyle(phase = "") {
    if (phase.startsWith("restore")) {
      return {
        fill: "rgba(96, 165, 250, 0.18)",
        patch: "rgba(96, 165, 250, 0.95)",
        tile: "rgba(147, 197, 253, 0.72)",
      };
    }

    if (phase === "after") {
      return {
        fill: "rgba(74, 222, 128, 0.18)",
        patch: "rgba(74, 222, 128, 0.95)",
        tile: "rgba(248, 113, 113, 0.62)",
      };
    }

    return {
      fill: "rgba(251, 191, 36, 0.16)",
      patch: "rgba(251, 191, 36, 0.95)",
      tile: "rgba(248, 113, 113, 0.72)",
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

  function drawPatchFill(ctx, rect, color) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  function insetRect(rect, amount) {
    if (!rect || amount <= 0 || rect.width <= amount * 2 || rect.height <= amount * 2) {
      return rect;
    }

    return {
      height: rect.height - amount * 2,
      width: rect.width - amount * 2,
      x: rect.x + amount,
      y: rect.y + amount,
    };
  }

  function drawLabel(ctx, item, rect, alpha) {
    if (!state.labels || !rect || rect.width < 36 || rect.height < 18) {
      return;
    }

    const label = `${item.phase} ${item.tx},${item.ty}`;

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha + 0.1);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(12, 14, 18, 0.78)";
    ctx.fillRect(rect.x + 4, rect.y + 4, Math.min(rect.width - 8, ctx.measureText(label).width + 10), 18);
    ctx.fillStyle = "rgba(245, 248, 252, 0.92)";
    ctx.fillText(label, rect.x + 9, rect.y + 7);
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
    const camera = getCamera();
    const width = canvas.width / Math.max(1, Number(window.devicePixelRatio) || 1);
    const height = canvas.height / Math.max(1, Number(window.devicePixelRatio) || 1);

    state.items = state.items.filter((item) => item.expiresAt > time);
    ctx.clearRect(0, 0, width, height);

    for (const item of state.items) {
      const remaining = Math.max(0, item.expiresAt - time);
      const alpha = Math.min(1, remaining / Math.max(1, state.ttlMs));
      const style = getPhaseStyle(item.phase);
      const tileRect = toViewportRect(item.tileRect, camera);
      const patchRect = toViewportRect(item.patchRect, camera);
      const visiblePatchRect = rectsMatch(item.tileRect, item.patchRect)
        ? insetRect(patchRect, 2)
        : patchRect;

      ctx.save();
      ctx.globalAlpha = Math.max(0.15, alpha);
      drawStrokeRect(ctx, tileRect, style.tile, 1.25, [6, 5]);
      drawPatchFill(ctx, visiblePatchRect, style.fill);
      drawStrokeRect(ctx, visiblePatchRect, style.patch, 2);
      drawLabel(ctx, item, visiblePatchRect, alpha);
      ctx.restore();
    }

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

  function handleTileDebug(event) {
    if (!state.enabled) {
      return;
    }

    const detail = event.detail || {};

    if (!detail.tileRect || !detail.patchRect) {
      return;
    }

    ensureCanvas();
    state.items.push({
      bytes: Math.max(0, Math.round(Number(detail.bytes) || 0)),
      expiresAt: now() + state.ttlMs,
      layerId: detail.layerId || "",
      patchRect: { ...detail.patchRect },
      phase: detail.phase || "tile",
      source: detail.source || "",
      tileRect: { ...detail.tileRect },
      tx: Math.round(Number(detail.tx) || 0),
      ty: Math.round(Number(detail.ty) || 0),
    });

    while (state.items.length > MAX_ITEMS) {
      state.items.shift();
    }

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
    state.ttlMs = Math.max(200, Math.min(8000, Math.round(Number(options.ttlMs) || DEFAULT_TTL_MS)));
    state.camera = namespace.brushEngine?.camera ? { ...namespace.brushEngine.camera } : state.camera;
    state.dpr = Math.max(0.0001, Number(namespace.brushEngine?.dpr || window.devicePixelRatio) || 1);
    namespace.debugRasterHistoryTiles = true;

    const canvas = ensureCanvas();

    if (canvas) {
      canvas.style.display = "block";
    }

    window.removeEventListener(EVENT_NAME, handleTileDebug);
    window.addEventListener(EVENT_NAME, handleTileDebug);
    window.addEventListener("resize", queueRender);
    window.addEventListener("cbo:camera-change", handleCameraChange);
    window.addEventListener("cbo:editor-canvas-ready", handleEditorCanvasReady);
    queueRender();

    return status();
  }

  function stop() {
    state.enabled = false;
    namespace.debugRasterHistoryTiles = false;
    state.items = [];
    window.removeEventListener(EVENT_NAME, handleTileDebug);
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

  function status() {
    return {
      enabled: state.enabled,
      itemCount: state.items.length,
      labels: state.labels,
      ttlMs: state.ttlMs,
    };
  }

  namespace.rasterHistoryTileOverlay = Object.freeze({
    clear,
    start,
    status,
    stop,
    toggle,
  });
})(window.CBO = window.CBO || {});
