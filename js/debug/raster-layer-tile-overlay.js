(function registerRasterLayerTileOverlay(namespace) {
  const OVERLAY_CLASS = "cbo-raster-layer-tile-overlay";
  const BYTES_PER_PIXEL = 4;

  const state = {
    allLayers: false,
    canvas: null,
    camera: null,
    ctx: null,
    dpr: 1,
    enabled: false,
    labels: false,
    layerId: "",
    rafId: 0,
    showSummary: true,
  };

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
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

  function formatMiB(bytes) {
    return ((Math.max(0, Number(bytes) || 0)) / (1024 * 1024)).toFixed(2);
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
      zIndex: "82",
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

  function getActiveLayerId(renderer = getRenderer()) {
    return (
      state.layerId ||
      renderer?.layerModel?.activeLayerId ||
      renderer?.resolvePaintLayerId?.() ||
      renderer?.paintLayerId ||
      ""
    );
  }

  function getLayerIds(renderer = getRenderer(), options = {}) {
    if (!renderer?.rasterTargetsByLayerId) {
      return [];
    }

    if (options.allLayers === true || state.allLayers) {
      return Array.from(renderer.rasterTargetsByLayerId.keys());
    }

    const layerId = options.layerId || getActiveLayerId(renderer);

    return layerId ? [layerId] : [];
  }

  function getTargetRect(renderer, target) {
    return renderer?.getRasterTargetDocumentRect?.(target) || (
      target
        ? {
            height: Math.max(1, Math.round(target.height || renderer?.height || 1)),
            width: Math.max(1, Math.round(target.width || renderer?.width || 1)),
            x: Math.round(Number(target.x) || 0),
            y: Math.round(Number(target.y) || 0),
          }
        : null
    );
  }

  function estimateBytes(renderer, target) {
    return Number(renderer?.estimateRasterTargetBytes?.(target)) ||
      Math.max(0, Math.round(target?.width || 0)) *
        Math.max(0, Math.round(target?.height || 0)) *
        BYTES_PER_PIXEL;
  }

  function collectRows(options = {}) {
    const renderer = getRenderer();

    if (!renderer?.rasterTargetsByLayerId) {
      return [];
    }

    return getLayerIds(renderer, options).flatMap((layerId) => {
      const target = renderer.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return [];
      }

      if (renderer.isSparseRasterTarget?.(target) === true) {
        return Array.from(target.tiles?.values?.() || [])
          .map((tileTarget) => {
            const rect = getTargetRect(renderer, tileTarget);

            return rect
              ? {
                  bytes: estimateBytes(renderer, tileTarget),
                  layerId,
                  rect,
                  sparse: true,
                  state: tileTarget.state || "GPU_HOT",
                  tileKey: tileTarget.tileKey || `${tileTarget.tx}:${tileTarget.ty}`,
                  tx: Math.round(Number(tileTarget.tx) || 0),
                  ty: Math.round(Number(tileTarget.ty) || 0),
                }
              : null;
          })
          .filter(Boolean)
          .sort((first, second) =>
            first.layerId.localeCompare(second.layerId) ||
            (first.ty - second.ty) ||
            (first.tx - second.tx)
          );
      }

      const rect = getTargetRect(renderer, target);

      return rect && (target.texture || target.framebuffer || target.cpuPixels)
        ? [{
            bytes: estimateBytes(renderer, target),
            layerId,
            rect,
            sparse: false,
            state: target.state || "GPU_HOT",
            tileKey: "full",
            tx: null,
            ty: null,
          }]
        : [];
    });
  }

  function getLayerBounds(rows) {
    let bounds = null;

    rows.forEach((row) => {
      const rect = row.rect;

      if (!rect) {
        return;
      }

      if (!bounds) {
        bounds = { ...rect };
        return;
      }

      const x0 = Math.min(bounds.x, rect.x);
      const y0 = Math.min(bounds.y, rect.y);
      const x1 = Math.max(bounds.x + bounds.width, rect.x + rect.width);
      const y1 = Math.max(bounds.y + bounds.height, rect.y + rect.height);

      bounds = {
        height: y1 - y0,
        width: x1 - x0,
        x: x0,
        y: y0,
      };
    });

    return bounds;
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

  function drawLabel(ctx, row, rect) {
    if (!state.labels || !rect || rect.width < 34 || rect.height < 18) {
      return;
    }

    const label = row.sparse
      ? `${row.tx},${row.ty} ${formatMiB(row.bytes)}`
      : `full ${formatMiB(row.bytes)}`;
    const labelWidth = Math.min(Math.max(28, rect.width - 8), ctx.measureText(label).width + 10);

    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(7, 12, 18, 0.76)";
    ctx.fillRect(rect.x + 4, rect.y + 4, labelWidth, 18);
    ctx.fillStyle = row.state === "CPU_COLD" ? "rgba(253, 224, 71, 0.96)" : "rgba(224, 251, 255, 0.96)";
    ctx.fillText(label, rect.x + 9, rect.y + 7);
    ctx.restore();
  }

  function drawSummary(ctx, rows) {
    if (!state.showSummary) {
      return;
    }

    const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
    const layerCount = new Set(rows.map((row) => row.layerId)).size;
    const tileCount = rows.filter((row) => row.sparse).length;
    const fullCount = rows.length - tileCount;
    const layerLabel = state.allLayers ? `${layerCount} layers` : getActiveLayerId();
    const summary = `${layerLabel || "no layer"} | ${tileCount} tiles${fullCount ? ` + ${fullCount} full` : ""} | ${formatMiB(bytes)} MiB`;

    ctx.save();
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "top";
    const width = Math.ceil(ctx.measureText(summary).width + 18);
    ctx.fillStyle = "rgba(8, 13, 20, 0.82)";
    ctx.strokeStyle = "rgba(34, 211, 238, 0.75)";
    ctx.lineWidth = 1;
    ctx.fillRect(12, 12, width, 26);
    ctx.strokeRect(12.5, 12.5, width - 1, 25);
    ctx.fillStyle = "rgba(236, 254, 255, 0.96)";
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

    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const camera = getCamera();
    const rows = collectRows();
    const bounds = toViewportRect(getLayerBounds(rows), camera);

    ctx.clearRect(0, 0, width, height);

    rows.forEach((row) => {
      const rect = toViewportRect(row.rect, camera);

      if (!rect) {
        return;
      }

      ctx.save();
      ctx.fillStyle = row.sparse
        ? row.state === "CPU_COLD"
          ? "rgba(250, 204, 21, 0.09)"
          : "rgba(34, 211, 238, 0.10)"
        : "rgba(244, 114, 182, 0.10)";
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      drawStrokeRect(
        ctx,
        rect,
        row.sparse
          ? row.state === "CPU_COLD"
            ? "rgba(250, 204, 21, 0.86)"
            : "rgba(34, 211, 238, 0.88)"
          : "rgba(244, 114, 182, 0.88)",
        row.sparse ? 1.25 : 2,
        row.state === "CPU_COLD" ? [5, 4] : [],
      );
      drawLabel(ctx, row, rect);
      ctx.restore();
    });

    drawStrokeRect(ctx, bounds, "rgba(255, 255, 255, 0.82)", 2, [8, 5]);
    drawSummary(ctx, rows);
    queueRender();
  }

  function queueRender() {
    if (state.rafId || !state.enabled) {
      return;
    }

    state.rafId = window.requestAnimationFrame(render);
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
    state.allLayers = options.allLayers === true;
    state.labels = options.labels === true;
    state.layerId = typeof options.layerId === "string" ? options.layerId : "";
    state.showSummary = options.summary !== false;
    state.camera = namespace.brushEngine?.camera ? { ...namespace.brushEngine.camera } : state.camera;
    state.dpr = Math.max(0.0001, Number(namespace.brushEngine?.dpr || window.devicePixelRatio) || 1);

    const canvas = ensureCanvas();

    if (canvas) {
      canvas.style.display = "block";
    }

    window.addEventListener("resize", queueRender);
    window.addEventListener("cbo:camera-change", handleCameraChange);
    window.addEventListener("cbo:document-content-change", queueRender);
    window.addEventListener("cbo:editor-canvas-ready", handleEditorCanvasReady);
    window.addEventListener("cbo:history-change", queueRender);
    queueRender();

    return status();
  }

  function stop() {
    state.enabled = false;
    window.removeEventListener("resize", queueRender);
    window.removeEventListener("cbo:camera-change", handleCameraChange);
    window.removeEventListener("cbo:document-content-change", queueRender);
    window.removeEventListener("cbo:editor-canvas-ready", handleEditorCanvasReady);
    window.removeEventListener("cbo:history-change", queueRender);

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

  function toggle(options = {}) {
    return state.enabled ? stop() : start(options);
  }

  function setLayer(layerId = "") {
    state.layerId = String(layerId || "");
    state.allLayers = false;
    queueRender();
    return status();
  }

  function showAllLayers() {
    state.layerId = "";
    state.allLayers = true;
    queueRender();
    return status();
  }

  function getTiles(options = {}) {
    return collectRows(options).map((row) => ({
      ...row,
      MiB: formatMiB(row.bytes),
    }));
  }

  function status() {
    const rows = collectRows();
    const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);

    return {
      allLayers: state.allLayers,
      enabled: state.enabled,
      labels: state.labels,
      layerId: state.allLayers ? "" : getActiveLayerId(),
      MiB: formatMiB(bytes),
      tileCount: rows.filter((row) => row.sparse).length,
      totalBytes: bytes,
    };
  }

  namespace.rasterLayerTileOverlay = Object.freeze({
    getTiles,
    setLayer,
    showAllLayers,
    start,
    status,
    stop,
    toggle,
  });
})(window.CBO = window.CBO || {});
