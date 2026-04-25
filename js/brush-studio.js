window.CBO = window.CBO || {};

window.CBO.initBrushStudio = function initBrushStudio() {
  const editorPage = document.querySelector(".editor-page");
  const StrokeMath = window.CBO.StrokeMath;
  const clamp = StrokeMath.clamp;
  const clamp01 = StrokeMath.clamp01;
  const studioCategories = ["STROKE", "STABILIZATION", "BASIC"];
  const defaultBrushSettings = {
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
  };

  // Demo-only parameters parked while Brush Studio becomes the real brush engine UI.
  // const demoCategories = ["TEXTURE", "PRESSURE", "TAPER", "APPLE PENCIL"];
  // const demoParameters = {
  //   randomized: false,
  //   signedSizeOffset: 0,
  // };

  if (!editorPage || editorPage.dataset.brushStudioReady === "true") {
    return;
  }

  const existingBrushSettings = window.CBO.brushSettings || {};

  window.CBO.brushSettings = {
    ...defaultBrushSettings,
    ...existingBrushSettings,
    streamLineAmount: existingBrushSettings.streamLineAmount ?? existingBrushSettings.smoothing ?? 0,
  };

  editorPage.dataset.brushStudioReady = "true";
  editorPage.insertAdjacentHTML(
    "beforeend",
    `
      <section class="brush-studio-panel" aria-label="Brush studio" data-brush-studio hidden>
        <div class="brush-studio-column brush-studio-categories-column">
          <h2 class="brush-studio-title">BRUSH STUDIO</h2>
          <div class="brush-studio-categories" aria-label="Brush studio categories" data-brush-studio-categories></div>
        </div>
        <div class="brush-studio-column brush-studio-selection-column">
          <div class="brush-studio-settings" data-brush-studio-settings></div>
        </div>
        <div class="brush-studio-column brush-studio-drawing-column">
          <div class="brush-studio-drawing-header">
            <h2 class="brush-studio-drawing-title">DRAWING PAD</h2>
            <div class="brush-studio-drawing-actions">
              <button class="brush-studio-cancel-button" type="button">CANCEL</button>
              <button class="brush-studio-check-button" type="button" aria-label="Confirm drawing pad">
                <svg class="brush-studio-check-icon lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="brush-studio-drawing-pad" data-brush-preview-pad></div>
        </div>
      </section>
    `,
  );

  const brushStudio = editorPage.querySelector("[data-brush-studio]");
  const categoryList = editorPage.querySelector("[data-brush-studio-categories]");
  const settingsPanel = editorPage.querySelector("[data-brush-studio-settings]");
  const previewPad = editorPage.querySelector("[data-brush-preview-pad]");
  const cancelButton = editorPage.querySelector(".brush-studio-cancel-button");
  const confirmButton = editorPage.querySelector(".brush-studio-check-button");
  let selectedCategory = studioCategories[0];
  let draftBrushSettings = { ...window.CBO.brushSettings };
  let previewCanvas = null;
  let previewContext = null;
  let previewPointerId = null;
  let previewStrokeState = null;
  let previewResizeObserver = null;
  let previewAnimationFrame = 0;
  let previewSize = { width: 0, height: 0 };
  let previewUserStroke = null;

  function parseHexColor(hexColor) {
    const normalized = String(hexColor || "#ffffff").replace("#", "");

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return "#ffffff";
    }

    return `#${normalized}`;
  }

  function getPreviewRadius(pressure = 1) {
    return StrokeMath.getEffectiveRadius(draftBrushSettings, pressure);
  }

  function clearPreviewCanvas() {
    if (!previewContext) {
      return;
    }

    previewContext.clearRect(0, 0, previewSize.width, previewSize.height);
  }

  function drawPreviewDab(point, pressure = 1, opacityScale = 1) {
    if (!previewContext) {
      return;
    }

    const radius = getPreviewRadius(pressure);
    const opacity = clamp01(draftBrushSettings.opacity) * clamp01(opacityScale);

    if (opacity <= 0) {
      return;
    }

    previewContext.save();
    previewContext.globalAlpha = opacity;
    previewContext.fillStyle = parseHexColor(window.CBO.selectedColor);
    previewContext.beginPath();
    previewContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    previewContext.fill();
    previewContext.restore();
  }

  function createPreviewStrokeState(point, seed = Date.now(), pressure = 1) {
    return StrokeMath.createStrokeState(point, {
      pressure,
      seed,
      tool: "brush",
    });
  }

  function processPreviewPoint(point, pressure = 1) {
    return StrokeMath.processStrokeInput(point, previewStrokeState, draftBrushSettings, pressure);
  }

  function drawPreviewSegment(to, pressure = 1, forceFinalDab = false) {
    if (!previewStrokeState) {
      return;
    }

    StrokeMath.drawStrokeSegment({
      to,
      state: previewStrokeState,
      settings: draftBrushSettings,
      radius: getPreviewRadius(pressure),
      pressure,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: previewSize.width,
        maxY: previewSize.height,
      },
      forceFinalDab,
      drawDab: drawPreviewDab,
    });
  }

  function toPreviewPoint(event) {
    const rect = previewCanvas.getBoundingClientRect();

    return {
      x: clamp(event.clientX - rect.left, 0, previewSize.width),
      y: clamp(event.clientY - rect.top, 0, previewSize.height),
    };
  }

  function createPreviewPoint(point, pressure = 1) {
    return {
      pressure: StrokeMath.normalizePressure(pressure),
      x: previewSize.width > 0 ? clamp(point.x / previewSize.width, 0, 1) : 0,
      y: previewSize.height > 0 ? clamp(point.y / previewSize.height, 0, 1) : 0,
    };
  }

  function restorePreviewPoint(point) {
    return {
      x: clamp(point.x * previewSize.width, 0, previewSize.width),
      y: clamp(point.y * previewSize.height, 0, previewSize.height),
    };
  }

  function shouldStorePreviewPoint(point) {
    const points = previewUserStroke?.points;

    if (!points?.length) {
      return true;
    }

    const previousPoint = restorePreviewPoint(points[points.length - 1]);

    return Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) >= 0.75;
  }

  function appendPreviewPoint(point, pressure = 1) {
    if (!previewUserStroke || !shouldStorePreviewPoint(point)) {
      return;
    }

    previewUserStroke.points.push(createPreviewPoint(point, pressure));
  }

  function renderPreviewUserStroke() {
    if (
      !previewUserStroke?.points?.length ||
      !previewCanvas ||
      !previewContext ||
      previewSize.width <= 0 ||
      previewSize.height <= 0
    ) {
      return false;
    }

    const [firstPoint, ...nextPoints] = previewUserStroke.points;
    const startPoint = restorePreviewPoint(firstPoint);

    clearPreviewCanvas();
    previewStrokeState = createPreviewStrokeState(startPoint, previewUserStroke.seed, firstPoint.pressure);
    drawPreviewDab(startPoint, firstPoint.pressure);

    nextPoints.forEach((point) => {
      const strokeInput = processPreviewPoint(restorePreviewPoint(point), point.pressure);

      drawPreviewSegment(strokeInput.point, strokeInput.pressure);
    });

    previewStrokeState = null;

    return true;
  }

  function renderPreviewSample() {
    if (!previewCanvas || !previewContext || previewSize.width <= 0 || previewSize.height <= 0) {
      return;
    }

    if (renderPreviewUserStroke()) {
      return;
    }

    const padding = Math.max(30, draftBrushSettings.radius * 1.8);
    const startPoint = {
      x: padding,
      y: previewSize.height * 0.52,
    };
    const steps = 88;
    const usableWidth = Math.max(1, previewSize.width - padding * 2);
    const wave = Math.min(72, previewSize.height * 0.22);

    clearPreviewCanvas();
    previewStrokeState = createPreviewStrokeState(startPoint, 0x6d2b79f5, 1);
    drawPreviewDab(startPoint, 1);

    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      const rawPoint = {
        x: padding + usableWidth * progress,
        y:
          previewSize.height * 0.52 +
          Math.sin(progress * Math.PI * 2.2) * wave * (1 - progress * 0.15),
      };
      const strokeInput = processPreviewPoint(rawPoint, 1);

      drawPreviewSegment(strokeInput.point, strokeInput.pressure);
    }

    previewStrokeState = null;
  }

  function queuePreviewSample() {
    if (!previewCanvas || brushStudio?.hidden) {
      return;
    }

    if (previewAnimationFrame) {
      cancelAnimationFrame(previewAnimationFrame);
    }

    previewAnimationFrame = requestAnimationFrame(() => {
      previewAnimationFrame = 0;
      renderPreviewSample();
    });
  }

  function resizePreviewCanvas() {
    if (!previewCanvas || !previewPad) {
      return;
    }

    const rect = previewPad.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.max(1, Math.round(cssWidth * ratio));
    const pixelHeight = Math.max(1, Math.round(cssHeight * ratio));

    if (previewCanvas.width !== pixelWidth || previewCanvas.height !== pixelHeight) {
      previewCanvas.width = pixelWidth;
      previewCanvas.height = pixelHeight;
      previewCanvas.style.width = `${cssWidth}px`;
      previewCanvas.style.height = `${cssHeight}px`;
      previewContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      previewSize = {
        width: cssWidth,
        height: cssHeight,
      };
      queuePreviewSample();
    }
  }

  function ensurePreviewCanvas() {
    if (!previewPad || previewCanvas) {
      return;
    }

    previewCanvas = document.createElement("canvas");
    previewCanvas.className = "brush-studio-preview-canvas";
    previewCanvas.setAttribute("aria-label", "Brush preview drawing pad");
    previewCanvas.setAttribute("data-brush-preview-canvas", "");
    previewContext = previewCanvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    if (!previewContext) {
      previewCanvas = null;
      return;
    }

    previewPad.append(previewCanvas);
    previewCanvas.addEventListener("pointerdown", startPreviewStroke);
    previewCanvas.addEventListener("pointermove", movePreviewStroke);
    previewCanvas.addEventListener("pointerup", endPreviewStroke);
    previewCanvas.addEventListener("pointercancel", endPreviewStroke);
    previewCanvas.addEventListener("lostpointercapture", endPreviewStroke);
    previewResizeObserver = new ResizeObserver(resizePreviewCanvas);
    previewResizeObserver.observe(previewPad);
    resizePreviewCanvas();
    queuePreviewSample();
  }

  function destroyPreviewCanvas() {
    if (previewAnimationFrame) {
      cancelAnimationFrame(previewAnimationFrame);
      previewAnimationFrame = 0;
    }

    previewResizeObserver?.disconnect();
    previewResizeObserver = null;
    previewPointerId = null;
    previewStrokeState = null;
    previewUserStroke = null;
    previewCanvas?.remove();
    previewCanvas = null;
    previewContext = null;
    previewSize = { width: 0, height: 0 };
  }

  function startPreviewStroke(event) {
    if (!previewCanvas) {
      return;
    }

    event.preventDefault();
    const point = toPreviewPoint(event);

    previewPointerId = event.pointerId;
    previewUserStroke = {
      points: [createPreviewPoint(point, event.pressure)],
      seed: Date.now() >>> 0,
    };
    previewStrokeState = createPreviewStrokeState(point, previewUserStroke.seed, event.pressure);
    clearPreviewCanvas();
    previewCanvas.setPointerCapture(event.pointerId);
    drawPreviewDab(point, event.pressure);
  }

  function movePreviewStroke(event) {
    if (previewPointerId !== event.pointerId || !previewStrokeState) {
      return;
    }

    event.preventDefault();
    const point = toPreviewPoint(event);
    const strokeInput = processPreviewPoint(point, event.pressure);

    appendPreviewPoint(point, event.pressure);
    drawPreviewSegment(strokeInput.point, strokeInput.pressure);
  }

  function endPreviewStroke(event) {
    if (previewPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point = toPreviewPoint(event);
    const strokeInput = processPreviewPoint(point, event.pressure);

    appendPreviewPoint(point, event.pressure);
    drawPreviewSegment(strokeInput.point, strokeInput.pressure, true);

    if (previewCanvas?.hasPointerCapture(event.pointerId)) {
      previewCanvas.releasePointerCapture(event.pointerId);
    }

    previewPointerId = null;
    previewStrokeState = null;
  }

  function saveDraftBrushSettings() {
    draftBrushSettings.smoothing = draftBrushSettings.streamLineAmount;
    window.CBO.brushSettings = {
      ...window.CBO.brushSettings,
      ...draftBrushSettings,
    };

    window.dispatchEvent(
      new CustomEvent("cbo:brush-settings-change", {
        detail: {
          settings: { ...window.CBO.brushSettings },
        },
      }),
    );
  }

  function resetDraftBrushSettings() {
    draftBrushSettings = {
      ...window.CBO.brushSettings,
      streamLineAmount: window.CBO.brushSettings.streamLineAmount ?? window.CBO.brushSettings.smoothing ?? 0,
    };
  }

  function renderCategories() {
    if (!categoryList) {
      return;
    }

    categoryList.replaceChildren(
      ...studioCategories.map((categoryName) => {
        const categoryButton = document.createElement("button");
        const isActive = categoryName === selectedCategory;

        categoryButton.className = "brush-studio-category";
        categoryButton.type = "button";
        categoryButton.textContent = categoryName;
        categoryButton.setAttribute("aria-pressed", String(isActive));
        categoryButton.classList.toggle("active", isActive);
        categoryButton.addEventListener("click", () => {
          selectedCategory = categoryName;
          renderStudioContent();
        });

        return categoryButton;
      }),
    );
  }

  function createRangeSetting({ key, label, min, max, step, value, unit, toSetting, toDisplay }) {
    const setting = document.createElement("div");
    const header = document.createElement("div");
    const name = document.createElement("div");
    const valueLabel = document.createElement("label");
    const valueInput = document.createElement("input");
    const valueUnit = document.createElement("span");
    const slider = document.createElement("input");

    setting.className = "brush-studio-setting";
    header.className = "brush-studio-setting-header";
    name.className = "brush-studio-setting-name";
    valueLabel.className = "brush-studio-setting-value";
    valueInput.className = "brush-studio-setting-value-input";
    valueUnit.className = "brush-studio-setting-value-unit";
    slider.className = "brush-studio-range";
    name.textContent = label;
    valueUnit.textContent = unit;

    valueInput.type = "number";
    valueInput.min = String(min);
    valueInput.max = String(max);
    valueInput.step = String(step);
    valueInput.setAttribute("aria-label", `${label} VALUE`);
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.setAttribute("aria-label", label);

    function setValue(nextValue) {
      const displayValue = clamp(nextValue, min, max);
      const progress = ((displayValue - min) / (max - min)) * 100;

      draftBrushSettings[key] = toSetting(displayValue);
      slider.value = String(displayValue);
      valueInput.value = String(toDisplay(displayValue));
      slider.style.setProperty("--brush-studio-range-progress", `${progress}%`);
      queuePreviewSample();
    }

    slider.addEventListener("input", () => {
      setValue(slider.value);
    });
    valueInput.addEventListener("input", () => {
      if (valueInput.value.trim() === "") {
        return;
      }

      setValue(valueInput.value);
    });
    valueInput.addEventListener("blur", () => {
      setValue(valueInput.value || value);
    });
    valueInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        valueInput.blur();
      }
    });

    valueLabel.append(valueInput, valueUnit);
    header.append(name, valueLabel);
    setting.append(header, slider);
    setValue(value);

    return setting;
  }

  function renderBasicSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const sizeSetting = createRangeSetting({
      key: "radius",
      label: "SIZE",
      min: 1,
      max: 120,
      step: 1,
      value: draftBrushSettings.radius,
      unit: "PX",
      toSetting: (displayValue) => displayValue,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const opacitySetting = createRangeSetting({
      key: "opacity",
      label: "OPACITY",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(draftBrushSettings.opacity * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(selectedName, sizeSetting, opacitySetting);
  }

  function renderStrokeSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const spacingSetting = createRangeSetting({
      key: "spacing",
      label: "SPACING",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(draftBrushSettings.spacing * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const spacingJitterSetting = createRangeSetting({
      key: "spacingJitter",
      label: "SPACING JITTER",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(draftBrushSettings.spacingJitter * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const lateralJitterSetting = createRangeSetting({
      key: "jitterLateral",
      label: "JITTER LATERAL",
      min: 0,
      max: 200,
      step: 1,
      value: Math.round(draftBrushSettings.jitterLateral * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const linearJitterSetting = createRangeSetting({
      key: "jitterLinear",
      label: "JITTER LINEAR",
      min: 0,
      max: 200,
      step: 1,
      value: Math.round(draftBrushSettings.jitterLinear * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const fallOffSetting = createRangeSetting({
      key: "fallOff",
      label: "FALL OFF",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(draftBrushSettings.fallOff * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(
      selectedName,
      spacingSetting,
      spacingJitterSetting,
      lateralJitterSetting,
      linearJitterSetting,
      fallOffSetting,
    );
  }

  function renderStabilizationSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const streamLineAmountSetting = createRangeSetting({
      key: "streamLineAmount",
      label: "STREAMLINE AMOUNT",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(StrokeMath.getStreamLineAmount(draftBrushSettings) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const streamLinePressureSetting = createRangeSetting({
      key: "streamLinePressure",
      label: "STREAMLINE PRESSURE",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.streamLinePressure) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const stabilizationAmountSetting = createRangeSetting({
      key: "stabilizationAmount",
      label: "STABILIZATION AMOUNT",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.stabilizationAmount) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(
      selectedName,
      streamLineAmountSetting,
      streamLinePressureSetting,
      stabilizationAmountSetting,
    );
  }

  function renderStudioContent() {
    renderCategories();

    if (selectedCategory === "BASIC") {
      renderBasicSettings();
      return;
    }

    if (selectedCategory === "STABILIZATION") {
      renderStabilizationSettings();
      return;
    }

    renderStrokeSettings();
  }

  function openBrushStudio() {
    if (brushStudio) {
      resetDraftBrushSettings();
      renderStudioContent();
      brushStudio.hidden = false;
      ensurePreviewCanvas();
    }
  }

  function closeBrushStudio() {
    if (brushStudio) {
      destroyPreviewCanvas();
      brushStudio.hidden = true;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const studioButton = target.closest(".brushes-panel-studio-button, .brushes-gallery-studio-button");

    if (studioButton) {
      openBrushStudio();
      return;
    }

    const clickedInsideBrushStudio = event.composedPath().includes(brushStudio);

    if (brushStudio && !brushStudio.hidden && !clickedInsideBrushStudio) {
      closeBrushStudio();
    }
  });

  cancelButton?.addEventListener("click", () => {
    resetDraftBrushSettings();
    closeBrushStudio();
  });
  confirmButton?.addEventListener("click", () => {
    saveDraftBrushSettings();
    closeBrushStudio();
  });

  renderStudioContent();
};
