window.CBO = window.CBO || {};

(function registerBrushShapeOutlinePreview(namespace) {
  const baseSize = 200;
  const outlineBitmapSize = 1024;
  const alphaThreshold = 8;
  const maxPointerHistoryPoints = 8;
  const minDirectionalDistance = 5;
  const pointerAngleSmoothing = 0.35;
  const previewOpacity = 0.68;
  const outlineColor = [223, 227, 234, 220];
  let brushSettingsOverride = null;

  function isAndroidPerformanceMode() {
    return namespace.androidPerformanceMode === true ||
      namespace.deviceIsAndroid === true ||
      namespace.DocumentRenderer?.isAndroidLikeEnvironment?.() === true;
  }

  function loadImage(src) {
    if (!src) {
      return Promise.reject(new Error("Shape alpha source mancante."));
    }

    if (namespace.ImageCache?.load) {
      return namespace.ImageCache.load(src);
    }

    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Impossibile caricare ${src}.`));
      image.src = src;
    });
  }

  function getBrushSettings() {
    if (brushSettingsOverride) {
      return namespace.BrushDefaults?.createSettings
        ? namespace.BrushDefaults.createSettings(brushSettingsOverride)
        : { ...brushSettingsOverride };
    }

    namespace.brushSettings = namespace.BrushDefaults?.createSettings
      ? namespace.BrushDefaults.createSettings(namespace.brushSettings || {})
      : { ...(namespace.brushSettings || {}) };

    return namespace.brushSettings;
  }

  function getBrushSize(settings) {
    const radius = Number(settings?.radius);

    if (Number.isFinite(radius) && radius > 0) {
      return radius;
    }

    const size = Number(settings?.size);

    return Number.isFinite(size) && size > 0 ? size : 20;
  }

  function getShapeSource(settings) {
    return settings?.shapeAlphaSrc || namespace.BrushDefaults?.defaultShapeAlphaSrc || "";
  }

  function getPreviewScale(settings, camera) {
    const zoom = Math.max(0.0001, Number(camera?.zoom) || 1);
    const dpr = Math.max(
      0.0001,
      Number(camera?.dpr || namespace.brushEngine?.dpr || window.devicePixelRatio) || 1,
    );

    return Math.max(0.001, ((zoom / dpr) * getBrushSize(settings)) / baseSize);
  }

  function getShapeRotation(settings) {
    const rotation = Number(settings?.shapeRotation);

    if (!Number.isFinite(rotation)) {
      return 0;
    }

    return Math.min(1, Math.max(-1, rotation));
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function getShapeBaseRotation(settings) {
    const explicitRotation = Number(settings?.strokeShapeRotation ?? settings?.shapeBaseRotation);

    if (Number.isFinite(explicitRotation)) {
      return explicitRotation;
    }

    if (settings?.shapeRandomized === true) {
      return (hashString(getShapeSource(settings)) / 4294967296) * Math.PI * 2 - Math.PI;
    }

    return 0;
  }

  function getCoverage(data, offset, useAlpha) {
    if (useAlpha) {
      return data[offset + 3];
    }

    return (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
  }

  function drawImageIntoMask(sourceContext, image, settings, size, padding) {
    const imageWidth = Math.max(1, image.naturalWidth || image.width || size);
    const imageHeight = Math.max(1, image.naturalHeight || image.height || size);
    const fit = Math.min((size - padding * 2) / imageWidth, (size - padding * 2) / imageHeight);
    const drawWidth = Math.max(1, imageWidth * fit);
    const drawHeight = Math.max(1, imageHeight * fit);

    sourceContext.save();
    sourceContext.translate(size * 0.5, size * 0.5);
    sourceContext.scale(settings.shapeFlipX === true ? -1 : 1, settings.shapeFlipY === true ? -1 : 1);
    sourceContext.drawImage(image, -drawWidth * 0.5, -drawHeight * 0.5, drawWidth, drawHeight);
    sourceContext.restore();
  }

  function renderOutlineToCanvas(canvas, image, settings) {
    const size = outlineBitmapSize;
    const renderScale = size / baseSize;
    const padding = Math.max(4, Math.round(5 * renderScale));
    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const context = canvas.getContext("2d");

    if (!sourceContext || !context) {
      return;
    }

    canvas.width = size;
    canvas.height = size;
    sourceCanvas.width = size;
    sourceCanvas.height = size;
    drawImageIntoMask(sourceContext, image, settings, size, padding);

    const imageData = sourceContext.getImageData(0, 0, size, size);
    const data = imageData.data;
    let minAlpha = 255;
    let maxAlpha = 0;

    for (let offset = 3; offset < data.length; offset += 4) {
      const alpha = data[offset];

      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
    }

    const useAlpha = maxAlpha - minAlpha > alphaThreshold && minAlpha < 255 - alphaThreshold;
    const output = context.createImageData(size, size);
    const outputData = output.data;
    const outlineRadius = Math.max(1, Math.round(renderScale * 0.75));

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;

        if (getCoverage(data, offset, useAlpha) <= alphaThreshold) {
          continue;
        }

        let isEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;

        if (!isEdge) {
          for (let oy = -1; oy <= 1 && !isEdge; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
              if (ox === 0 && oy === 0) {
                continue;
              }

              const neighborOffset = ((y + oy) * size + (x + ox)) * 4;

              if (getCoverage(data, neighborOffset, useAlpha) <= alphaThreshold) {
                isEdge = true;
                break;
              }
            }
          }
        }

        if (!isEdge) {
          continue;
        }

        for (let dy = -outlineRadius; dy <= outlineRadius; dy += 1) {
          const py = y + dy;

          if (py < 0 || py >= size) {
            continue;
          }

          for (let dx = -outlineRadius; dx <= outlineRadius; dx += 1) {
            const px = x + dx;

            if (px < 0 || px >= size) {
              continue;
            }

            const outputOffset = (py * size + px) * 4;

            outputData[outputOffset] = outlineColor[0];
            outputData[outputOffset + 1] = outlineColor[1];
            outputData[outputOffset + 2] = outlineColor[2];
            outputData[outputOffset + 3] = outlineColor[3];
          }
        }
      }
    }

    context.clearRect(0, 0, size, size);
    context.putImageData(output, 0, 0);
  }

  namespace.initBrushShapeOutlinePreview = function initBrushShapeOutlinePreview() {
    if (isAndroidPerformanceMode()) {
      return;
    }

    const stage = document.querySelector(".editor-stage");

    if (!stage) {
      return;
    }

    if (stage.dataset.brushShapeOutlinePreviewReady === "true" && stage.querySelector("[data-brush-shape-outline-preview]")) {
      return;
    }

    const wrapper = document.createElement("div");
    const canvas = document.createElement("canvas");
    const svgNamespace = "http://www.w3.org/2000/svg";
    const ropePreview = document.createElementNS(svgNamespace, "svg");
    const ropeLine = document.createElementNS(svgNamespace, "line");
    const ropeBrush = document.createElementNS(svgNamespace, "circle");
    const ropeCursor = document.createElementNS(svgNamespace, "circle");
    let activeTool = false;
    let camera = {
      ...(namespace.brushEngine?.camera || { zoom: 1 }),
      dpr: Math.max(0.0001, Number(namespace.brushEngine?.dpr || window.devicePixelRatio) || 1),
    };
    let currentSource = "";
    let currentFlipX = null;
    let currentFlipY = null;
    let renderRequestId = 0;
    let pointerInsideStage = false;
    let activeStrokePointerId = null;
    const pointerHistory = [];
    let pointerAngle = 0;
    let hasStablePointerAngle = false;

    wrapper.className = "brush-shape-outline-preview";
    wrapper.dataset.brushShapeOutlinePreview = "";
    wrapper.hidden = true;
    canvas.className = "brush-shape-outline-preview-canvas";
    canvas.width = baseSize;
    canvas.height = baseSize;
    wrapper.append(canvas);
    ropePreview.classList.add("brush-rope-stabilization-preview");
    ropePreview.dataset.brushRopeStabilizationPreview = "";
    ropePreview.setAttribute("aria-hidden", "true");
    ropePreview.setAttribute("hidden", "");
    ropeLine.classList.add("brush-rope-stabilization-line");
    ropeBrush.classList.add("brush-rope-stabilization-brush");
    ropeCursor.classList.add("brush-rope-stabilization-cursor");
    ropeBrush.setAttribute("r", "4.5");
    ropeCursor.setAttribute("r", "3");
    ropePreview.append(ropeLine, ropeBrush, ropeCursor);
    stage.append(wrapper, ropePreview);
    stage.dataset.brushShapeOutlinePreviewReady = "true";

    function syncVisibility() {
      wrapper.hidden = !activeTool ||
        !pointerInsideStage ||
        activeStrokePointerId != null ||
        namespace.brushEngine?.isDrawing === true ||
        namespace.isTouchNavigationExclusive?.({ includeGuard: true }) === true;
    }

    function hideRopePreview() {
      ropePreview.setAttribute("hidden", "");
      ropePreview.classList.remove("is-taut", "is-slack");
    }

    function setRopePoint(element, point, xAttribute, yAttribute) {
      element.setAttribute(xAttribute, String(Math.round(point.x * 10) / 10));
      element.setAttribute(yAttribute, String(Math.round(point.y * 10) / 10));
    }

    function updateRopePreview(event) {
      const detail = event.detail || {};
      const brush = detail.brush;
      const cursor = detail.cursor;

      if (
        detail.active !== true ||
        !brush ||
        !cursor ||
        namespace.isTouchNavigationExclusive?.({ includeGuard: true }) === true
      ) {
        hideRopePreview();
        return;
      }

      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      ropePreview.setAttribute("viewBox", `0 0 ${width} ${height}`);
      ropePreview.setAttribute("width", String(width));
      ropePreview.setAttribute("height", String(height));
      setRopePoint(ropeLine, brush, "x1", "y1");
      setRopePoint(ropeLine, cursor, "x2", "y2");
      setRopePoint(ropeBrush, brush, "cx", "cy");
      setRopePoint(ropeCursor, cursor, "cx", "cy");
      ropePreview.classList.toggle("is-taut", detail.taut === true);
      ropePreview.classList.toggle("is-slack", detail.taut !== true);
      ropePreview.removeAttribute("hidden");
    }

    function resetPointerTracking() {
      pointerHistory.length = 0;
      hasStablePointerAngle = false;
    }

    function angleLerp(current, target, amount) {
      const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));

      return current + delta * amount;
    }

    function updatePointerAngle(x, y) {
      pointerHistory.push({ x, y });

      if (pointerHistory.length > maxPointerHistoryPoints) {
        pointerHistory.shift();
      }

      const first = pointerHistory[0];
      const deltaX = x - first.x;
      const deltaY = y - first.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < minDirectionalDistance) {
        return;
      }

      const targetAngle = Math.atan2(deltaY, deltaX);

      if (!hasStablePointerAngle) {
        pointerAngle = targetAngle;
        hasStablePointerAngle = true;
        return;
      }

      pointerAngle = angleLerp(pointerAngle, targetAngle, pointerAngleSmoothing);
    }

    function updatePointerPosition(event) {
      const rect = stage.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isInsideStage = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

      if (isInsideStage) {
        updatePointerAngle(x, y);
      } else {
        resetPointerTracking();
      }

      pointerInsideStage = isInsideStage;
      wrapper.style.transform = `translate(${x}px, ${y}px)`;
      updateTransform();
      syncVisibility();
    }

    function updateTransform() {
      const settings = getBrushSettings();
      const rotation = getShapeBaseRotation(settings) + pointerAngle * getShapeRotation(settings);

      canvas.style.opacity = String(previewOpacity);
      canvas.style.transform = `rotate(${rotation}rad) scale(${getPreviewScale(settings, camera)})`;
    }

    function isPrimaryStrokePointer(event) {
      return activeTool &&
        (event.pointerType !== "mouse" || event.button === 0) &&
        namespace.isTouchNavigationExclusive?.({ includeGuard: true }) !== true;
    }

    function beginStrokePreviewHide(event) {
      resetPointerTracking();
      updatePointerPosition(event);

      if (isPrimaryStrokePointer(event) && pointerInsideStage) {
        activeStrokePointerId = event.pointerId;
        syncVisibility();
      }
    }

    function finishStrokePreviewHide(event) {
      if (activeStrokePointerId == null || event.pointerId !== activeStrokePointerId) {
        return;
      }

      activeStrokePointerId = null;
      resetPointerTracking();
      updatePointerPosition(event);
      window.requestAnimationFrame(syncVisibility);
    }

    function cancelStrokePreviewHide() {
      pointerInsideStage = false;
      activeStrokePointerId = null;
      resetPointerTracking();
      syncVisibility();
    }

    function renderIfNeeded() {
      const settings = getBrushSettings();
      const source = getShapeSource(settings);
      const flipX = settings.shapeFlipX === true;
      const flipY = settings.shapeFlipY === true;

      updateTransform();

      if (source === currentSource && flipX === currentFlipX && flipY === currentFlipY) {
        return;
      }

      currentSource = source;
      currentFlipX = flipX;
      currentFlipY = flipY;
      renderRequestId += 1;
      const requestId = renderRequestId;

      loadImage(source)
        .then((image) => {
          if (requestId !== renderRequestId) {
            return;
          }

          renderOutlineToCanvas(canvas, image, settings);
        })
        .catch(() => {
          if (requestId === renderRequestId) {
            const context = canvas.getContext("2d");

            context?.clearRect(0, 0, canvas.width, canvas.height);
          }
        });
    }

    function isBrushPreviewTool(label, toolMode, syncGroup) {
      return label === "BRUSH" ||
        label === "ERASER" ||
        toolMode === "eraser" ||
        (toolMode === "brush" && syncGroup === "brush");
    }

    window.addEventListener("cbo:brush-settings-change", () => {
      brushSettingsOverride = null;
      renderIfNeeded();
      syncVisibility();
    });

    window.addEventListener("cbo:brush-settings-preview-change", (event) => {
      brushSettingsOverride = event.detail?.settings || null;
      renderIfNeeded();
      syncVisibility();
    });

    window.addEventListener("cbo:camera-change", (event) => {
      camera = {
        ...(event.detail?.camera || camera),
        dpr: Math.max(
          0.0001,
          Number(event.detail?.dpr || namespace.brushEngine?.dpr || camera?.dpr || window.devicePixelRatio) || 1,
        ),
      };
      updateTransform();
    });

    window.addEventListener("cbo:brush-rope-stabilization-guide", updateRopePreview);

    window.addEventListener("cbo:touch-navigation-start", () => {
      pointerInsideStage = false;
      activeStrokePointerId = null;
      resetPointerTracking();
      hideRopePreview();
      syncVisibility();
    });

    window.addEventListener("cbo:touch-navigation-end", () => {
      pointerInsideStage = false;
      activeStrokePointerId = null;
      resetPointerTracking();
      hideRopePreview();
      syncVisibility();
      window.setTimeout(syncVisibility, 430);
    });

    window.addEventListener("cbo:tool-change", (event) => {
      const label = String(event.detail?.label || "").toUpperCase();
      const toolMode = String(event.detail?.toolMode || "").toLowerCase();
      const syncGroup = String(event.detail?.syncGroup || "").toLowerCase();

      resetPointerTracking();
      activeStrokePointerId = null;
      hideRopePreview();
      activeTool = isBrushPreviewTool(label, toolMode, syncGroup);
      renderIfNeeded();
      syncVisibility();
    });

    stage.addEventListener("pointerdown", beginStrokePreviewHide, { passive: true });
    stage.addEventListener("pointermove", updatePointerPosition, { passive: true });
    stage.addEventListener("pointerup", finishStrokePreviewHide, { passive: true });
    stage.addEventListener("pointerleave", () => {
      pointerInsideStage = false;
      resetPointerTracking();
      syncVisibility();
    });
    stage.addEventListener("pointercancel", cancelStrokePreviewHide, { passive: true });
    window.addEventListener("pointerup", finishStrokePreviewHide, { passive: true });
    window.addEventListener("pointercancel", cancelStrokePreviewHide, { passive: true });

    const activeButton = document.querySelector("[data-tool].active");

    if (activeButton) {
      const label = String(activeButton.getAttribute("aria-label") || "").toUpperCase();
      const toolMode = String(activeButton.dataset.toolMode || "").toLowerCase();
      const syncGroup = String(activeButton.dataset.toolSync || "").toLowerCase();

      activeTool = isBrushPreviewTool(label, toolMode, syncGroup);
    }

    renderIfNeeded();
    syncVisibility();
  };
})(window.CBO);
