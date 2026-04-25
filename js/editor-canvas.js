window.CBO = window.CBO || {};

window.CBO.initEditorCanvas = function initEditorCanvas() {
  const stage = document.querySelector(".editor-stage");

  if (
    !stage ||
    stage.dataset.canvasReady === "true" ||
    !window.CBO.StrokeMath ||
    !window.CBO.SkiaBrushTool ||
    !window.CBO.SmudgeTool
  ) {
    return;
  }

  stage.dataset.canvasReady = "true";

  const width = 1960;
  const height = 1960;
  const minZoom = 0.25;
  const maxZoom = 32;
  const zoomLevels = [0.25, 0.333333, 0.5, 0.666667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  const shell = document.createElement("div");
  const canvas = document.createElement("canvas");
  const pixelGrid = document.createElement("canvas");
  const appCenterGuides = document.createElement("div");
  const verticalAppCenterGuide = document.createElement("span");
  const horizontalAppCenterGuide = document.createElement("span");
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
  const existingSmudgeSettings = window.CBO.smudgeSettings || {};
  const smudgeSettings = {
    ...window.CBO.SmudgeBrushes.wetPaint,
    ...existingSmudgeSettings,
  };

  let CanvasKit = null;
  let surface = null;
  let skCanvas = null;
  let renderer = null;
  let smudge = null;
  let skiaBrush = null;
  let pixels = new Uint8ClampedArray(width * height * 4);
  let activeTool = getActiveTool();
  let activePointerId = null;
  let activeStrokeTool = "";
  let activeStrokeHandler = null;
  let activePanPointerId = null;
  let lastPanPoint = null;
  let resolveCanvasReady = null;
  let uploadPlacementQueue = Promise.resolve();
  let spacePanning = false;
  const canvasReady = new Promise((resolve) => {
    resolveCanvasReady = resolve;
  });
  let canvasView = {
    panX: 0,
    panY: 0,
    zoom: 1,
  };
  let shellLayoutOrigin = {
    left: 0,
    top: 0,
  };
  window.CBO.brushSettings = brushSettings;
  window.CBO.smudgeSettings = smudgeSettings;
  shell.className = "editor-canvas-shell";
  shell.style.width = `${width}px`;
  shell.style.height = `${height}px`;
  canvas.className = "editor-canvas editor-skia-paint-canvas";
  appCenterGuides.className = "editor-app-center-guides";
  verticalAppCenterGuide.className = "editor-app-center-guide vertical";
  horizontalAppCenterGuide.className = "editor-app-center-guide horizontal";
  pixelGrid.className = "editor-pixel-grid";
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute("aria-label", "Canvas Skia editor");
  appCenterGuides.setAttribute("aria-hidden", "true");
  pixelGrid.setAttribute("aria-hidden", "true");
  appCenterGuides.append(verticalAppCenterGuide, horizontalAppCenterGuide);
  shell.append(canvas);
  stage.append(shell, pixelGrid);
  document.querySelector(".editor-page")?.append(appCenterGuides);
  stage.dataset.activeCanvasTool = activeTool;
  resetCanvasView();
  requestAnimationFrame(resetCanvasView);

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
      resolveCanvasReady?.();
      resolveCanvasReady = null;
      return;
    }

    try {
      CanvasKit = await window.CanvasKitInit({
        locateFile: (file) => `./vendor/canvaskit/${file}`,
      });
      surface = makeCanvasSurface(CanvasKit, canvas);

      if (!surface) {
        stage.dataset.skiaStatus = "surface-error";
        resolveCanvasReady?.();
        resolveCanvasReady = null;
        return;
      }

      skCanvas = surface.getCanvas();
      renderer = createSkiaRenderer(CanvasKit, surface, width, height);
      smudge = new window.CBO.SmudgeTool(
        pixels,
        width,
        height,
        { ...window.CBO.SmudgeBrushes.wetPaint },
        renderer,
      );
      skiaBrush = new window.CBO.SkiaBrushTool({
        canvasKit: CanvasKit,
        skCanvas,
        surface,
        width,
        height,
        getSettings: getToolSettings,
        getColor: () => window.CBO.selectedColor,
      });
      renderer.clear();
      syncPixelsFromSurface();
      bindCanvasEvents();
      stage.dataset.skiaStatus = "ready";
      stage.dataset.paintEngine = "skia";
      resolveCanvasReady?.();
      resolveCanvasReady = null;
    } catch (error) {
      stage.dataset.skiaStatus = "error";
      resolveCanvasReady?.();
      resolveCanvasReady = null;
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
    const pageStyle = getComputedStyle(document.querySelector(".editor-page") || document.body);
    const leftPanelWidth = parseFloat(pageStyle.getPropertyValue("--left-panel-width") || "0");
    const rightPanelWidth = parseFloat(pageStyle.getPropertyValue("--right-panel-width") || "0");
    const viewportBreathingRoom = 0.86;
    const availableWidth = Math.max(
      1,
      window.innerWidth - leftPanelWidth - rightPanelWidth - horizontalPadding,
    );
    const availableHeight = Math.max(1, window.innerHeight - verticalPadding);

    return clamp(
      Math.min(availableWidth / width, availableHeight / height, 1) * viewportBreathingRoom,
      minZoom,
      1,
    );
  }

  function getCenteredPan(zoom) {
    const viewportCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };

    return {
      x: viewportCenter.x - shellLayoutOrigin.left - (width * zoom) / 2,
      y: viewportCenter.y - shellLayoutOrigin.top - (height * zoom) / 2,
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

  function getToolSettings(tool) {
    return tool === "eraser" ? eraserSettings : brushSettings;
  }

  function getSmudgeBrushSettings() {
    const settings = {
      ...window.CBO.SmudgeBrushes.wetPaint,
      ...smudgeSettings,
    };

    return {
      ...settings,
      radius: clamp(settings.radius, 1, 120),
      opacity: clamp01(settings.opacity),
      hardness: clamp01(settings.hardness),
      spacing: clamp(settings.spacing, 0.01, 0.12),
      drag: clamp01(settings.drag),
      pressureAffectsStrength: settings.pressureAffectsStrength !== false,
    };
  }

  function getStrokeHandler(tool) {
    if (tool === "smudge") {
      syncPixelsFromSurface();
      smudge.setBrush(getSmudgeBrushSettings());
      return smudge;
    }

    if (tool === "brush" || tool === "eraser") {
      skiaBrush.setTool(tool);
      return skiaBrush;
    }

    return null;
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

  function loadImageDataFromBlob(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob)) {
        reject(new Error("Upload image data is missing"));
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        try {
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;

          if (!sourceWidth || !sourceHeight) {
            reject(new Error("Upload image has no size"));
            return;
          }

          const sourceCanvas = document.createElement("canvas");
          const sourceContext = sourceCanvas.getContext("2d", {
            willReadFrequently: true,
          });

          sourceCanvas.width = sourceWidth;
          sourceCanvas.height = sourceHeight;

          if (!sourceContext) {
            reject(new Error("Unable to read upload image pixels"));
            return;
          }

          sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
          sourceContext.drawImage(image, 0, 0);
          resolve({
            data: sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data,
            height: sourceHeight,
            width: sourceWidth,
          });
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to load upload image"));
      };

      image.src = objectUrl;
    });
  }

  function blendPixel(sourceData, sourceIndex, destinationIndex) {
    const sourceAlpha = sourceData[sourceIndex + 3];

    if (sourceAlpha <= 0) {
      return;
    }

    if (sourceAlpha >= 255) {
      pixels[destinationIndex] = sourceData[sourceIndex];
      pixels[destinationIndex + 1] = sourceData[sourceIndex + 1];
      pixels[destinationIndex + 2] = sourceData[sourceIndex + 2];
      pixels[destinationIndex + 3] = 255;
      return;
    }

    const sourceOpacity = sourceAlpha / 255;
    const destinationOpacity = pixels[destinationIndex + 3] / 255;
    const outputOpacity = sourceOpacity + destinationOpacity * (1 - sourceOpacity);

    if (outputOpacity <= 0) {
      pixels[destinationIndex] = 0;
      pixels[destinationIndex + 1] = 0;
      pixels[destinationIndex + 2] = 0;
      pixels[destinationIndex + 3] = 0;
      return;
    }

    const destinationScale = destinationOpacity * (1 - sourceOpacity);

    pixels[destinationIndex] = Math.round(
      (sourceData[sourceIndex] * sourceOpacity + pixels[destinationIndex] * destinationScale) /
        outputOpacity,
    );
    pixels[destinationIndex + 1] = Math.round(
      (sourceData[sourceIndex + 1] * sourceOpacity +
        pixels[destinationIndex + 1] * destinationScale) /
        outputOpacity,
    );
    pixels[destinationIndex + 2] = Math.round(
      (sourceData[sourceIndex + 2] * sourceOpacity +
        pixels[destinationIndex + 2] * destinationScale) /
        outputOpacity,
    );
    pixels[destinationIndex + 3] = Math.round(outputOpacity * 255);
  }

  function compositeImageDataCentered(source) {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const sourceData = source.data;
    const left = Math.round((width - sourceWidth) / 2);
    const top = Math.round((height - sourceHeight) / 2);
    const sourceStartX = Math.max(0, -left);
    const sourceStartY = Math.max(0, -top);
    const sourceEndX = Math.min(sourceWidth, width - left);
    const sourceEndY = Math.min(sourceHeight, height - top);

    for (let sourceY = sourceStartY; sourceY < sourceEndY; sourceY += 1) {
      const destinationY = top + sourceY;

      for (let sourceX = sourceStartX; sourceX < sourceEndX; sourceX += 1) {
        const destinationX = left + sourceX;
        const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
        const destinationIndex = (destinationY * width + destinationX) * 4;

        blendPixel(sourceData, sourceIndex, destinationIndex);
      }
    }
  }

  async function placeUploadedImageOnCanvas(detail = {}) {
    if (!renderer) {
      await canvasReady;
    }

    if (!renderer) {
      return;
    }

    const source = await loadImageDataFromBlob(detail.blob);

    pushHistorySnapshot();
    compositeImageDataCentered(source);
    renderer.renderPixels(pixels);
    smudge?.setPixels(pixels);
  }

  function queueUploadedImagePlacement(detail = {}) {
    uploadPlacementQueue = uploadPlacementQueue
      .then(() => placeUploadedImageOnCanvas(detail))
      .catch((error) => {
        console.error("Unable to place uploaded image on canvas", error);
      });

    return uploadPlacementQueue;
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
    activeStrokeHandler = getStrokeHandler(activeStrokeTool);

    if (!activeStrokeHandler) {
      activePointerId = null;
      activeStrokeTool = "";
      return;
    }

    const point = toCanvasPoint(event);

    pushHistorySnapshot();
    shell.setPointerCapture(event.pointerId);
    activeStrokeHandler.pointerDown(point.x, point.y, event.pressure);
  }

  function moveStroke(event) {
    if (activePanPointerId === event.pointerId) {
      moveCanvasPan(event);
      return;
    }

    if (activePointerId !== event.pointerId || !activeStrokeHandler) {
      return;
    }

    event.preventDefault();
    const point = toCanvasPoint(event);

    activeStrokeHandler.pointerMove(point.x, point.y, event.pressure);
  }

  function endStroke(event) {
    if (endCanvasPan(event)) {
      return;
    }

    if (activePointerId !== event.pointerId) {
      return;
    }

    const point = toCanvasPoint(event);

    activeStrokeHandler?.pointerUp(point.x, point.y, event.pressure);

    if (activeStrokeHandler?.syncPixelsOnEnd) {
      syncPixelsFromSurface();
    }

    if (shell.hasPointerCapture(event.pointerId)) {
      shell.releasePointerCapture(event.pointerId);
    }

    activePointerId = null;
    activeStrokeTool = "";
    activeStrokeHandler = null;
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

  window.addEventListener("cbo:place-uploaded-image", (event) => {
    queueUploadedImagePlacement(event.detail);
  });

  window.CBO.placeUploadedImageOnCanvas = queueUploadedImagePlacement;

  window.addEventListener("cbo:brush-settings-change", (event) => {
    Object.assign(brushSettings, event.detail?.settings || {});
    brushSettings.streamLineAmount = brushSettings.streamLineAmount ?? brushSettings.smoothing ?? 0;
  });

  window.addEventListener("cbo:paint-settings-change", (event) => {
    const settings = event.detail?.settings || {};

    if (event.detail?.tool === "smudge") {
      Object.assign(smudgeSettings, settings);
      window.CBO.smudgeSettings = { ...smudgeSettings };
      return;
    }

    if (event.detail?.tool === "brush") {
      Object.assign(brushSettings, settings);
      brushSettings.streamLineAmount = brushSettings.streamLineAmount ?? brushSettings.smoothing ?? 0;
      window.CBO.brushSettings = { ...brushSettings };
      return;
    }

    if (event.detail?.tool === "eraser") {
      Object.assign(eraserSettings, settings);
    }
  });
};
