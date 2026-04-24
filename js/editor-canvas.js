window.CBO = window.CBO || {};

window.CBO.initEditorCanvas = function initEditorCanvas() {
  const stage = document.querySelector(".editor-stage");

  if (!stage || stage.dataset.canvasReady === "true" || !window.CBO.SmudgeTool) {
    return;
  }

  stage.dataset.canvasReady = "true";

  const width = 960;
  const height = 620;
  const minZoom = 0.25;
  const maxZoom = 32;
  const zoomLevels = [0.25, 0.333333, 0.5, 0.666667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  const shell = document.createElement("div");
  const canvas = document.createElement("canvas");
  const pixelGrid = document.createElement("canvas");
  const pixelGridContext = pixelGrid.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  const undoStack = [];
  const redoStack = [];
  const historyLimit = 30;
  const existingBrushSettings = window.CBO.brushSettings || {};
  const brushSettings = {
    radius: 18,
    opacity: 0.92,
    spacing: 0.18,
    smoothing: 0,
    streamLineAmount: 0,
    streamLinePressure: 0,
    stabilizationAmount: 0,
    spacingJitter: 0,
    jitterLateral: 0,
    jitterLinear: 0,
    fallOff: 0,
    ...existingBrushSettings,
    streamLineAmount: existingBrushSettings.streamLineAmount ?? existingBrushSettings.smoothing ?? 0,
  };
  const eraserSettings = {
    radius: 24,
    opacity: 1,
    spacing: 0.12,
    smoothing: 0,
    streamLineAmount: 0,
    streamLinePressure: 0,
    stabilizationAmount: 0,
    spacingJitter: 0,
    jitterLateral: 0,
    jitterLinear: 0,
    fallOff: 0,
  };

  let CanvasKit = null;
  let surface = null;
  let skCanvas = null;
  let renderer = null;
  let smudge = null;
  let pixels = new Uint8ClampedArray(width * height * 4);
  let activeTool = getActiveTool();
  let activePointerId = null;
  let activeStrokeTool = "";
  let activePanPointerId = null;
  let lastPoint = null;
  let lastPanPoint = null;
  let strokeState = null;
  let spacePanning = false;
  let canvasView = {
    panX: 0,
    panY: 0,
    zoom: 1,
  };
  let shellLayoutOrigin = {
    left: 0,
    top: 0,
  };
  let brushPaint = null;
  let brushFillPaint = null;
  let eraserPaint = null;
  let eraserFillPaint = null;

  window.CBO.brushSettings = brushSettings;
  shell.className = "editor-canvas-shell";
  canvas.className = "editor-canvas editor-skia-paint-canvas";
  pixelGrid.className = "editor-pixel-grid";
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute("aria-label", "Canvas Skia editor");
  pixelGrid.setAttribute("aria-hidden", "true");
  shell.append(canvas);
  stage.append(shell, pixelGrid);
  stage.dataset.activeCanvasTool = activeTool;
  resetCanvasView();

  void bootCanvas();

  function normalizeToolName(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "brush" || normalized === "pencil" || normalized === "pen") {
      return "brush";
    }

    if (normalized === "smudge") {
      return "smudge";
    }

    if (normalized === "eraser") {
      return "eraser";
    }

    if (normalized === "zoom") {
      return "zoom";
    }

    if (normalized === "hand" || normalized === "handtool") {
      return "hand";
    }

    if (normalized === "selection") {
      return "selection";
    }

    return "";
  }

  function getActiveTool() {
    const activeButton = document.querySelector("[data-tool].active");

    return normalizeToolName(activeButton?.dataset.toolMode || activeButton?.getAttribute("aria-label"));
  }

  async function bootCanvas() {
    if (!window.CanvasKitInit) {
      stage.dataset.skiaStatus = "missing";
      return;
    }

    try {
      CanvasKit = await window.CanvasKitInit({
        locateFile: (file) => `./vendor/canvaskit/${file}`,
      });
      surface = makeCanvasSurface(CanvasKit, canvas);

      if (!surface) {
        stage.dataset.skiaStatus = "surface-error";
        return;
      }

      skCanvas = surface.getCanvas();
      brushPaint = new CanvasKit.Paint();
      brushFillPaint = new CanvasKit.Paint();
      eraserPaint = new CanvasKit.Paint();
      eraserFillPaint = new CanvasKit.Paint();
      renderer = createSkiaRenderer(CanvasKit, surface, width, height);
      smudge = new window.CBO.SmudgeTool(
        pixels,
        width,
        height,
        { ...window.CBO.SmudgeBrushes.wetPaint },
        renderer,
      );

      configureStrokePaint(brushPaint);
      configureFillPaint(brushFillPaint);
      configureStrokePaint(eraserPaint);
      configureFillPaint(eraserFillPaint);
      eraserPaint.setBlendMode(CanvasKit.BlendMode.Clear);
      eraserFillPaint.setBlendMode(CanvasKit.BlendMode.Clear);
      renderer.clear();
      syncPixelsFromSurface();
      bindCanvasEvents();
      stage.dataset.skiaStatus = "ready";
      stage.dataset.paintEngine = "skia";
    } catch (error) {
      stage.dataset.skiaStatus = "error";
      console.error("CanvasKit init failed", error);
    }
  }

  function makeCanvasSurface(canvasKit, canvasElement) {
    return canvasKit.MakeSWCanvasSurface(canvasElement);
  }

  function createSkiaRenderer(canvasKit, skSurface, canvasWidth, canvasHeight) {
    return {
      clear() {
        const activeCanvas = skSurface.getCanvas();

        activeCanvas.clear(canvasKit.Color4f(0, 0, 0, 0));
        skSurface.flush();
      },

      renderPixels(sourcePixels) {
        const activeCanvas = skSurface.getCanvas();

        activeCanvas.clear(canvasKit.Color4f(0, 0, 0, 0));
        activeCanvas.writePixels(
          sourcePixels,
          canvasWidth,
          canvasHeight,
          0,
          0,
          canvasKit.AlphaType.Unpremul,
          canvasKit.ColorType.RGBA_8888,
          canvasKit.ColorSpace.SRGB,
        );
        skSurface.flush();
      },
    };
  }

  function configureStrokePaint(paint) {
    paint.setAntiAlias(true);
    paint.setStyle(CanvasKit.PaintStyle.Stroke);
    paint.setStrokeCap(CanvasKit.StrokeCap.Round);
    paint.setStrokeJoin(CanvasKit.StrokeJoin.Round);
  }

  function configureFillPaint(paint) {
    paint.setAntiAlias(true);
    paint.setStyle(CanvasKit.PaintStyle.Fill);
  }

  function parseHexColor(hexColor) {
    const fallback = [1, 1, 1];
    const normalized = String(hexColor || "").replace("#", "");

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return fallback;
    }

    return [
      parseInt(normalized.slice(0, 2), 16) / 255,
      parseInt(normalized.slice(2, 4), 16) / 255,
      parseInt(normalized.slice(4, 6), 16) / 255,
    ];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function drawPixelGrid(showPixelGrid) {
    if (!pixelGridContext) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = Math.max(1, Math.ceil(window.innerWidth * ratio));
    const canvasHeight = Math.max(1, Math.ceil(window.innerHeight * ratio));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (pixelGrid.width !== canvasWidth || pixelGrid.height !== canvasHeight) {
      pixelGrid.width = canvasWidth;
      pixelGrid.height = canvasHeight;
      pixelGrid.style.width = `${viewportWidth}px`;
      pixelGrid.style.height = `${viewportHeight}px`;
    }

    pixelGridContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    pixelGridContext.clearRect(0, 0, viewportWidth, viewportHeight);
    pixelGrid.classList.toggle("active", showPixelGrid);

    if (!showPixelGrid) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    const pixelWidth = rect.width / width;
    const pixelHeight = rect.height / height;
    const left = Math.max(0, rect.left);
    const right = Math.min(viewportWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(viewportHeight, rect.bottom);

    if (right <= left || bottom <= top || pixelWidth <= 0 || pixelHeight <= 0) {
      return;
    }

    pixelGridContext.save();
    pixelGridContext.beginPath();
    pixelGridContext.strokeStyle = "rgba(255, 255, 255, 0.82)";
    pixelGridContext.lineWidth = 1;

    const firstVerticalLine =
      rect.left + Math.ceil((left - rect.left) / pixelWidth) * pixelWidth;
    const firstHorizontalLine =
      rect.top + Math.ceil((top - rect.top) / pixelHeight) * pixelHeight;

    for (let x = firstVerticalLine; x <= right; x += pixelWidth) {
      const crispX = Math.round(x) + 0.5;

      pixelGridContext.moveTo(crispX, top);
      pixelGridContext.lineTo(crispX, bottom);
    }

    for (let y = firstHorizontalLine; y <= bottom; y += pixelHeight) {
      const crispY = Math.round(y) + 0.5;

      pixelGridContext.moveTo(left, crispY);
      pixelGridContext.lineTo(right, crispY);
    }

    pixelGridContext.stroke();
    pixelGridContext.restore();
  }

  function getStageFitZoom() {
    const stageStyle = getComputedStyle(stage);
    const horizontalPadding =
      parseFloat(stageStyle.paddingLeft || "0") + parseFloat(stageStyle.paddingRight || "0");
    const verticalPadding =
      parseFloat(stageStyle.paddingTop || "0") + parseFloat(stageStyle.paddingBottom || "0");
    const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, stage.clientHeight - verticalPadding);

    return clamp(Math.min(availableWidth / width, availableHeight / height, 1), minZoom, 1);
  }

  function getCenteredPan(zoom) {
    return {
      x: (width * (1 - zoom)) / 2,
      y: (height * (1 - zoom)) / 2,
    };
  }

  function updateShellLayoutOrigin() {
    const rect = shell.getBoundingClientRect();

    shellLayoutOrigin = {
      left: rect.left - canvasView.panX,
      top: rect.top - canvasView.panY,
    };
  }

  function snapViewToPixelGrid() {
    if (canvasView.zoom < 1) {
      return;
    }

    canvasView.panX = Math.round(shellLayoutOrigin.left + canvasView.panX) - shellLayoutOrigin.left;
    canvasView.panY = Math.round(shellLayoutOrigin.top + canvasView.panY) - shellLayoutOrigin.top;
  }

  function applyCanvasView() {
    snapViewToPixelGrid();

    const screenPixelSize = canvasView.zoom;
    const showPixelGrid = screenPixelSize >= 6;

    shell.style.transform = `matrix(${canvasView.zoom}, 0, 0, ${canvasView.zoom}, ${canvasView.panX}, ${canvasView.panY})`;
    shell.style.setProperty("--canvas-zoom", String(canvasView.zoom));
    shell.classList.toggle("pixel-grid-visible", showPixelGrid);
    stage.dataset.canvasZoom = String(Math.round(canvasView.zoom * 100));
    stage.dataset.pixelGrid = showPixelGrid ? "visible" : "hidden";
    drawPixelGrid(showPixelGrid);
  }

  function getSteppedZoom(direction) {
    const epsilon = 0.000001;

    if (direction > 0) {
      return zoomLevels.find((zoom) => zoom > canvasView.zoom + epsilon) || maxZoom;
    }

    for (let index = zoomLevels.length - 1; index >= 0; index -= 1) {
      if (zoomLevels[index] < canvasView.zoom - epsilon) {
        return zoomLevels[index];
      }
    }

    return minZoom;
  }

  function setCanvasZoomAt(clientX, clientY, nextZoom) {
    nextZoom = clamp(nextZoom, minZoom, maxZoom);

    if (nextZoom === canvasView.zoom) {
      return;
    }

    updateShellLayoutOrigin();

    const rect = shell.getBoundingClientRect();
    const localX = (clientX - rect.left) / canvasView.zoom;
    const localY = (clientY - rect.top) / canvasView.zoom;

    canvasView.panX = clientX - shellLayoutOrigin.left - localX * nextZoom;
    canvasView.panY = clientY - shellLayoutOrigin.top - localY * nextZoom;
    canvasView.zoom = nextZoom;
    applyCanvasView();
  }

  function zoomCanvasAt(clientX, clientY, direction) {
    setCanvasZoomAt(clientX, clientY, getSteppedZoom(direction));
  }

  function zoomCanvasFromCenter(direction) {
    const rect = shell.getBoundingClientRect();

    zoomCanvasAt(rect.left + rect.width / 2, rect.top + rect.height / 2, direction);
  }

  function resetCanvasView() {
    updateShellLayoutOrigin();

    const fitZoom = getStageFitZoom();
    const centeredPan = getCenteredPan(fitZoom);

    canvasView = {
      panX: centeredPan.x,
      panY: centeredPan.y,
      zoom: fitZoom,
    };
    applyCanvasView();
  }

  function handleCanvasResize() {
    updateShellLayoutOrigin();
    applyCanvasView();
  }

  function shouldStartCanvasPan(event) {
    return activeTool === "hand" || event.button === 1 || spacePanning;
  }

  function startCanvasPan(event) {
    event.preventDefault();
    activePanPointerId = event.pointerId;
    lastPanPoint = {
      x: event.clientX,
      y: event.clientY,
    };
    stage.classList.add("panning");
    shell.setPointerCapture(event.pointerId);
  }

  function moveCanvasPan(event) {
    if (activePanPointerId !== event.pointerId || !lastPanPoint) {
      return;
    }

    event.preventDefault();
    canvasView.panX += event.clientX - lastPanPoint.x;
    canvasView.panY += event.clientY - lastPanPoint.y;
    lastPanPoint = {
      x: event.clientX,
      y: event.clientY,
    };
    applyCanvasView();
  }

  function endCanvasPan(event) {
    if (activePanPointerId !== event.pointerId) {
      return false;
    }

    if (shell.hasPointerCapture(event.pointerId)) {
      shell.releasePointerCapture(event.pointerId);
    }

    activePanPointerId = null;
    lastPanPoint = null;
    stage.classList.remove("panning");

    return true;
  }

  function handleCanvasWheel(event) {
    if (!event.composedPath().includes(shell) || activePointerId !== null) {
      return;
    }

    event.preventDefault();
    zoomCanvasAt(event.clientX, event.clientY, event.deltaY < 0 ? 1 : -1);
  }

  function handleCanvasKeyDown(event) {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (isTyping) {
      return;
    }

    if (event.code === "Space") {
      spacePanning = true;
      stage.classList.add("panning");
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "0") {
      event.preventDefault();
      resetCanvasView();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      zoomCanvasFromCenter(1);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "-") {
      event.preventDefault();
      zoomCanvasFromCenter(-1);
    }
  }

  function handleCanvasKeyUp(event) {
    if (event.code !== "Space") {
      return;
    }

    spacePanning = false;

    if (activePanPointerId === null) {
      stage.classList.remove("panning");
    }
  }

  function normalizePressure(pressure) {
    const nextPressure = Number(pressure);

    if (!Number.isFinite(nextPressure) || nextPressure <= 0) {
      return 1;
    }

    return clamp(nextPressure, 0.2, 2);
  }

  function getToolSettings(tool) {
    return tool === "eraser" ? eraserSettings : brushSettings;
  }

  function getPaintForTool(tool, fill = false) {
    if (tool === "eraser") {
      return fill ? eraserFillPaint : eraserPaint;
    }

    return fill ? brushFillPaint : brushPaint;
  }

  function getEffectiveRadius(settings, pressure) {
    return Math.max(0.5, settings.radius * normalizePressure(pressure));
  }

  function getStreamLineAmount(settings) {
    return clamp01(settings.streamLineAmount ?? settings.smoothing);
  }

  function getStabilizedPoint(point, state, settings) {
    const stabilization = clamp01(settings.stabilizationAmount);

    state.inputPoints.push({ ...point });

    if (state.inputPoints.length > 28) {
      state.inputPoints.shift();
    }

    if (stabilization <= 0 || state.inputPoints.length < 2) {
      return point;
    }

    const previousPoint = state.inputPoints[state.inputPoints.length - 2];
    const speed = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    const speedFactor = clamp(speed / 28, 0, 1);
    const effectiveStabilization = stabilization * (0.35 + speedFactor * 0.65);
    const windowSize = Math.min(
      state.inputPoints.length,
      2 + Math.round(effectiveStabilization * 16),
    );
    const points = state.inputPoints.slice(-windowSize);
    const average = points.reduce(
      (result, nextPoint) => ({
        x: result.x + nextPoint.x / points.length,
        y: result.y + nextPoint.y / points.length,
      }),
      { x: 0, y: 0 },
    );

    return {
      x: point.x + (average.x - point.x) * effectiveStabilization,
      y: point.y + (average.y - point.y) * effectiveStabilization,
    };
  }

  function getSmoothedPressure(pressure, state, settings) {
    const streamLinePressure = clamp01(settings.streamLinePressure);
    const nextPressure = normalizePressure(pressure);

    if (streamLinePressure <= 0) {
      state.pressure = nextPressure;
      return nextPressure;
    }

    const follow = clamp(1 - streamLinePressure * 0.92, 0.08, 1);

    state.pressure += (nextPressure - state.pressure) * follow;

    return state.pressure;
  }

  function createStrokeState(point, tool, pressure = 1) {
    const seed =
      (Date.now() ^
        Math.round(point.x * 1000) ^
        Math.round(point.y * 1000) ^
        (tool === "eraser" ? 0x9e3779b9 : 0x85ebca6b)) >>>
      0;

    return {
      distance: 0,
      inputPoints: [{ ...point }],
      lastStampPoint: { ...point },
      pressure: normalizePressure(pressure),
      seed: seed || 1,
      smoothedPoint: { ...point },
      tool,
    };
  }

  function nextRandom(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;

    return state.seed / 4294967296;
  }

  function randomSigned(state) {
    return nextRandom(state) * 2 - 1;
  }

  function processStrokeInput(point, tool, pressure = 1) {
    if (!strokeState || tool !== "brush") {
      return {
        point,
        pressure: normalizePressure(pressure),
      };
    }

    const stabilizedPoint = getStabilizedPoint(point, strokeState, brushSettings);
    const streamLineAmount = getStreamLineAmount(brushSettings);
    const nextPressure = getSmoothedPressure(pressure, strokeState, brushSettings);

    if (streamLineAmount <= 0) {
      strokeState.smoothedPoint = { ...stabilizedPoint };
      return {
        point: stabilizedPoint,
        pressure: nextPressure,
      };
    }

    const follow = clamp(1 - streamLineAmount * 0.88, 0.08, 1);

    strokeState.smoothedPoint = {
      x: strokeState.smoothedPoint.x + (stabilizedPoint.x - strokeState.smoothedPoint.x) * follow,
      y: strokeState.smoothedPoint.y + (stabilizedPoint.y - strokeState.smoothedPoint.y) * follow,
    };

    return {
      point: strokeState.smoothedPoint,
      pressure: nextPressure,
    };
  }

  function getNextStampStep(settings, radius, state) {
    const spacing = clamp01(settings.spacing);
    const spacingJitter = clamp01(settings.spacingJitter);
    const minStep = Math.max(1, radius * 0.12);
    const maxStep = Math.max(minStep, radius * 2.6);
    const baseStep = minStep + (maxStep - minStep) * spacing;
    const jitterSpan = radius * (0.35 + spacing * 1.6) * spacingJitter;

    return Math.max(minStep, baseStep + randomSigned(state) * jitterSpan);
  }

  function getFallOffScale(settings, state, radius) {
    const fallOff = clamp01(settings.fallOff);

    if (fallOff <= 0) {
      return 1;
    }

    const fadeDistance = Math.max(radius * 2, radius * (96 - fallOff * 88));

    return clamp(1 - state.distance / fadeDistance, 0, 1);
  }

  function applyStampJitter(point, tangent, settings, radius, state) {
    const lateral = clamp(settings.jitterLateral, 0, 2) * radius;
    const linear = clamp(settings.jitterLinear, 0, 2) * radius;

    if (lateral <= 0 && linear <= 0) {
      return point;
    }

    const lateralOffset = randomSigned(state) * lateral;
    const linearOffset = randomSigned(state) * linear;
    const perpendicular = {
      x: -tangent.y,
      y: tangent.x,
    };

    return {
      x: clamp(point.x + perpendicular.x * lateralOffset + tangent.x * linearOffset, 0, width - 1),
      y: clamp(point.y + perpendicular.y * lateralOffset + tangent.y * linearOffset, 0, height - 1),
    };
  }

  function toCanvasPoint(event) {
    const rect = shell.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (width / rect.width);
    const y = (event.clientY - rect.top) * (height / rect.height);

    return {
      x: Math.max(0, Math.min(width - 1, x)),
      y: Math.max(0, Math.min(height - 1, y)),
    };
  }

  function syncPixelsFromSurface() {
    if (!skCanvas || !CanvasKit) {
      return new Uint8ClampedArray(pixels);
    }

    surface.flush();

    const imageInfo = {
      width,
      height,
      colorType: CanvasKit.ColorType.RGBA_8888,
      alphaType: CanvasKit.AlphaType.Unpremul,
      colorSpace: CanvasKit.ColorSpace.SRGB,
    };
    const surfacePixels = skCanvas.readPixels(0, 0, imageInfo);

    if (!surfacePixels) {
      return new Uint8ClampedArray(pixels);
    }

    pixels.set(surfacePixels);
    smudge?.setPixels(pixels);

    return new Uint8ClampedArray(pixels);
  }

  function pushHistorySnapshot() {
    undoStack.push(syncPixelsFromSurface());

    if (undoStack.length > historyLimit) {
      undoStack.shift();
    }

    redoStack.length = 0;
  }

  function restorePixels(snapshot) {
    pixels.set(snapshot);
    renderer?.renderPixels(pixels);
    smudge?.setPixels(pixels);
  }

  function drawDab(point, tool, pressure = 1, opacityScale = 1) {
    const settings = getToolSettings(tool);
    const paint = getPaintForTool(tool, true);
    const radius = getEffectiveRadius(settings, pressure);
    const opacity = clamp01(settings.opacity) * clamp01(opacityScale);

    if (opacity <= 0) {
      return;
    }

    if (tool === "brush") {
      const [red, green, blue] = parseHexColor(window.CBO.selectedColor);
      paint.setColor(CanvasKit.Color4f(red, green, blue, opacity));
    } else {
      paint.setColor(CanvasKit.Color4f(0, 0, 0, opacity));
    }

    skCanvas.drawCircle(point.x, point.y, radius, paint);
  }

  function drawStrokeSegment(to, tool, pressure = 1) {
    if (!strokeState) {
      return;
    }

    const settings = getToolSettings(tool);
    const radius = getEffectiveRadius(settings, pressure);
    let from = strokeState.lastStampPoint;
    let deltaX = to.x - from.x;
    let deltaY = to.y - from.y;
    let distance = Math.hypot(deltaX, deltaY);

    while (distance > 0) {
      const step = getNextStampStep(settings, radius, strokeState);

      if (distance < step) {
        break;
      }

      const tangent = {
        x: deltaX / distance,
        y: deltaY / distance,
      };
      const stampPoint = {
        x: from.x + tangent.x * step,
        y: from.y + tangent.y * step,
      };

      strokeState.distance += step;
      drawDab(
        applyStampJitter(stampPoint, tangent, settings, radius, strokeState),
        tool,
        pressure,
        getFallOffScale(settings, strokeState, radius),
      );
      strokeState.lastStampPoint = stampPoint;
      from = strokeState.lastStampPoint;
      deltaX = to.x - from.x;
      deltaY = to.y - from.y;
      distance = Math.hypot(deltaX, deltaY);
    }

    surface.flush();
  }

  function startStroke(event) {
    if (!renderer) {
      return;
    }

    if (shouldStartCanvasPan(event)) {
      startCanvasPan(event);
      return;
    }

    if (activeTool === "zoom") {
      event.preventDefault();
      zoomCanvasAt(event.clientX, event.clientY, event.altKey ? -1 : 1);
      return;
    }

    if (event.button !== 0 || !["brush", "smudge", "eraser"].includes(activeTool)) {
      return;
    }

    event.preventDefault();
    activePointerId = event.pointerId;
    activeStrokeTool = activeTool;
    lastPoint = toCanvasPoint(event);
    strokeState = createStrokeState(lastPoint, activeStrokeTool, event.pressure);
    pushHistorySnapshot();
    shell.setPointerCapture(event.pointerId);

    if (activeStrokeTool === "smudge") {
      syncPixelsFromSurface();
      smudge.setBrush({ ...window.CBO.SmudgeBrushes.wetPaint });
      smudge.pointerDown(lastPoint.x, lastPoint.y, event.pressure);
      return;
    }

    drawDab(lastPoint, activeStrokeTool, event.pressure);
    surface.flush();
  }

  function moveStroke(event) {
    if (activePanPointerId === event.pointerId) {
      moveCanvasPan(event);
      return;
    }

    if (activePointerId !== event.pointerId || !lastPoint) {
      return;
    }

    event.preventDefault();
    const point = toCanvasPoint(event);

    if (activeStrokeTool === "smudge") {
      smudge.pointerMove(point.x, point.y, event.pressure);
      return;
    }

    const strokeInput = processStrokeInput(point, activeStrokeTool, event.pressure);

    drawStrokeSegment(strokeInput.point, activeStrokeTool, strokeInput.pressure);
    lastPoint = strokeInput.point;
  }

  function endStroke(event) {
    if (endCanvasPan(event)) {
      return;
    }

    if (activePointerId !== event.pointerId) {
      return;
    }

    const point = toCanvasPoint(event);

    if (activeStrokeTool === "smudge") {
      smudge.pointerUp(point.x, point.y, event.pressure);
    } else {
      const strokeInput = processStrokeInput(point, activeStrokeTool, event.pressure);

      drawStrokeSegment(strokeInput.point, activeStrokeTool, strokeInput.pressure);
      syncPixelsFromSurface();
    }

    if (shell.hasPointerCapture(event.pointerId)) {
      shell.releasePointerCapture(event.pointerId);
    }

    activePointerId = null;
    activeStrokeTool = "";
    lastPoint = null;
    strokeState = null;
  }

  function bindCanvasEvents() {
    shell.addEventListener("pointerdown", startStroke);
    shell.addEventListener("pointermove", moveStroke);
    shell.addEventListener("pointerup", endStroke);
    shell.addEventListener("pointercancel", endStroke);
    shell.addEventListener("lostpointercapture", endStroke);
    stage.addEventListener("wheel", handleCanvasWheel, { passive: false });
    window.addEventListener("resize", handleCanvasResize);
    document.addEventListener("keydown", handleCanvasKeyDown);
    document.addEventListener("keyup", handleCanvasKeyUp);
  }

  window.addEventListener("cbo:tool-change", (event) => {
    activeTool = normalizeToolName(event.detail?.toolMode || event.detail?.label);
    stage.dataset.activeCanvasTool = activeTool;
  });

  window.addEventListener("cbo:history-action", (event) => {
    const action = event.detail?.action;

    if (action === "undo" && undoStack.length) {
      redoStack.push(syncPixelsFromSurface());
      restorePixels(undoStack.pop());
      return;
    }

    if (action === "redo" && redoStack.length) {
      undoStack.push(syncPixelsFromSurface());
      restorePixels(redoStack.pop());
    }
  });

  window.addEventListener("cbo:brush-settings-change", (event) => {
    Object.assign(brushSettings, event.detail?.settings || {});
    brushSettings.streamLineAmount = brushSettings.streamLineAmount ?? brushSettings.smoothing ?? 0;
  });
};
