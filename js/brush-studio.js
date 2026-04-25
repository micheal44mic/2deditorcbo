window.CBO = window.CBO || {};

window.CBO.initBrushStudio = function initBrushStudio() {
  const editorPage = document.querySelector(".editor-page");
  const StrokeMath = window.CBO.StrokeMath;
  const clamp = StrokeMath.clamp;
  const clamp01 = StrokeMath.clamp01;
  const studioCategories = ["STROKE", "STABILIZATION", "TAPER", "BASIC"];
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
    taperStart: 0,
    taperEnd: 0,
    taperLinkSizes: false,
    taperSize: 1,
    taperOpacity: 0,
    taperPressure: 0,
    taperMinDistance: 0,
    taperTip: 0.5,
    taperTipAnimation: true,
  };

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
  let previewEngine = null;
  let replayFrame = 0;

  function pushDraftToEngine() {
    if (!previewEngine) {
      return;
    }

    previewEngine.setBrushState(draftBrushSettings);

    // rAF throttle: durante il drag di uno slider arrivano decine di "input"; ne basta uno per frame.
    if (replayFrame) {
      return;
    }

    replayFrame = requestAnimationFrame(() => {
      replayFrame = 0;

      if (previewEngine && !previewEngine.isDrawing) {
        previewEngine.replayLastStroke();
      }
    });
  }

  function ensurePreviewCanvas() {
    if (!previewPad || !window.CBO.BrushEngine) {
      return;
    }

    if (previewEngine) {
      pushDraftToEngine();
      return;
    }

    previewPad.replaceChildren();
    previewCanvas = document.createElement("canvas");
    previewCanvas.className = "brush-studio-preview-canvas";
    previewPad.appendChild(previewCanvas);

    previewEngine = new window.CBO.BrushEngine(previewCanvas, {
      getSettings: () => draftBrushSettings,
      transparentBackground: true,
      singleStrokeMode: true,
      disableNavigation: true,
      documentSizeCap: 2048,
    });

    // Hook di test (read-only): permette di ispezionare lo stato dell'engine
    // dalla console o da test E2E senza richiedere setter pubblici dedicati.
    window.CBO.__brushStudioPreviewEngine = previewEngine;
  }

  function destroyPreviewCanvas() {
    if (replayFrame) {
      cancelAnimationFrame(replayFrame);
      replayFrame = 0;
    }

    previewEngine?.dispose?.();
    previewEngine = null;
    previewCanvas?.remove();
    previewCanvas = null;
    previewPad?.replaceChildren();
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
      pushDraftToEngine();
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

  function createToggleSetting({ key, label }) {
    const wrapper = document.createElement("div");
    const name = document.createElement("div");
    const toggle = document.createElement("button");
    const knob = document.createElement("span");
    const checkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const checkPath = document.createElementNS("http://www.w3.org/2000/svg", "path");

    wrapper.className = "brush-studio-toggle-setting";
    name.className = "brush-studio-setting-name";
    name.textContent = label;
    toggle.className = "brush-studio-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", label);
    knob.className = "brush-studio-toggle-knob";
    checkIcon.classList.add("brush-studio-toggle-check");
    checkIcon.setAttribute("viewBox", "0 0 24 24");
    checkIcon.setAttribute("fill", "none");
    checkIcon.setAttribute("stroke", "currentColor");
    checkIcon.setAttribute("stroke-width", "3");
    checkIcon.setAttribute("stroke-linecap", "round");
    checkIcon.setAttribute("stroke-linejoin", "round");
    checkPath.setAttribute("d", "M20 6 9 17l-5-5");

    checkIcon.appendChild(checkPath);
    knob.appendChild(checkIcon);
    toggle.appendChild(knob);

    function setActive(isActive) {
      draftBrushSettings[key] = isActive;
      toggle.classList.toggle("active", isActive);
      toggle.setAttribute("aria-pressed", String(isActive));
    }

    toggle.addEventListener("click", () => {
      const next = !draftBrushSettings[key];
      setActive(next);
      pushDraftToEngine();
    });

    setActive(Boolean(draftBrushSettings[key]));
    wrapper.append(name, toggle);

    return wrapper;
  }

  function createTaperShapePath(startFraction, endFraction, width, height) {
    // Disegna un cuneo orizzontale: i due handle definiscono dove inizia/finisce il
    // tratto "pieno". Fuori dagli handle la shape si stringe a punta verso i bordi.
    const safeWidth = Math.max(1, width);
    const midY = height / 2;
    const halfThick = Math.max(2, Math.min(height * 0.32, 12));
    const startX = clamp01(startFraction) * safeWidth;
    const endX = (1 - clamp01(endFraction)) * safeWidth;
    const leftX = Math.min(startX, endX);
    const rightX = Math.max(startX, endX);

    return [
      `M 0 ${midY}`,
      `L ${leftX} ${midY - halfThick}`,
      `L ${rightX} ${midY - halfThick}`,
      `L ${safeWidth} ${midY}`,
      `L ${rightX} ${midY + halfThick}`,
      `L ${leftX} ${midY + halfThick}`,
      "Z",
    ].join(" ");
  }

  function createTaperSlider() {
    const container = document.createElement("div");
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    const shapePath = document.createElementNS(svgNS, "path");
    const startGuide = document.createElementNS(svgNS, "line");
    const endGuide = document.createElementNS(svgNS, "line");
    const startHandle = document.createElement("button");
    const endHandle = document.createElement("button");

    container.className = "brush-studio-taper-slider";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Pressure taper");

    svg.classList.add("brush-studio-taper-shape");
    svg.setAttribute("preserveAspectRatio", "none");
    shapePath.classList.add("brush-studio-taper-shape-fill");
    startGuide.classList.add("brush-studio-taper-guide");
    endGuide.classList.add("brush-studio-taper-guide");
    svg.append(startGuide, endGuide, shapePath);

    startHandle.className = "brush-studio-taper-handle";
    startHandle.dataset.handle = "start";
    startHandle.type = "button";
    startHandle.setAttribute("aria-label", "Pressure taper start");
    endHandle.className = "brush-studio-taper-handle";
    endHandle.dataset.handle = "end";
    endHandle.type = "button";
    endHandle.setAttribute("aria-label", "Pressure taper end");

    container.append(svg, startHandle, endHandle);

    function syncHandles() {
      const start = clamp01(draftBrushSettings.taperStart);
      const end = clamp01(draftBrushSettings.taperEnd);
      const startPercent = `${start * 100}%`;
      const endPercent = `${(1 - end) * 100}%`;
      const rect = container.getBoundingClientRect();
      const width = rect.width || 200;
      const height = rect.height || 96;

      startHandle.style.left = startPercent;
      endHandle.style.left = endPercent;

      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      shapePath.setAttribute("d", createTaperShapePath(start, end, width, height));

      const midY = height / 2;
      const startX = start * width;
      const endX = (1 - end) * width;

      startGuide.setAttribute("x1", String(startX));
      startGuide.setAttribute("x2", String(startX));
      startGuide.setAttribute("y1", String(midY - height * 0.42));
      startGuide.setAttribute("y2", String(midY + height * 0.42));
      endGuide.setAttribute("x1", String(endX));
      endGuide.setAttribute("x2", String(endX));
      endGuide.setAttribute("y1", String(midY - height * 0.42));
      endGuide.setAttribute("y2", String(midY + height * 0.42));
    }

    function setHandleValue(handle, fraction) {
      const next = clamp01(fraction);

      if (handle === "start") {
        draftBrushSettings.taperStart = next;

        if (draftBrushSettings.taperLinkSizes) {
          draftBrushSettings.taperEnd = next;
        }
      } else {
        draftBrushSettings.taperEnd = next;

        if (draftBrushSettings.taperLinkSizes) {
          draftBrushSettings.taperStart = next;
        }
      }

      // Evita che gli handle si scavalchino. Con il link attivo entrambi
      // si fermano al centro (0.5) simmetrici.
      const startVal = clamp01(draftBrushSettings.taperStart);
      const endVal = clamp01(draftBrushSettings.taperEnd);

      if (startVal + endVal > 1) {
        if (draftBrushSettings.taperLinkSizes) {
          draftBrushSettings.taperStart = 0.5;
          draftBrushSettings.taperEnd = 0.5;
        } else if (handle === "start") {
          draftBrushSettings.taperStart = clamp(1 - endVal, 0, 1);
        } else {
          draftBrushSettings.taperEnd = clamp(1 - startVal, 0, 1);
        }
      }

      syncHandles();
      pushDraftToEngine();
    }

    function attachDrag(handle) {
      const which = handle.dataset.handle;
      let activePointer = null;

      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        activePointer = event.pointerId;
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener("pointermove", (event) => {
        if (activePointer !== event.pointerId) {
          return;
        }

        const rect = container.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const fraction = rect.width > 0 ? localX / rect.width : 0;
        const value = which === "start" ? fraction : 1 - fraction;

        setHandleValue(which, value);
      });

      handle.addEventListener("pointerup", (event) => {
        if (activePointer !== event.pointerId) {
          return;
        }

        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId);
        }

        activePointer = null;
      });

      handle.addEventListener("pointercancel", (event) => {
        if (activePointer !== event.pointerId) {
          return;
        }

        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId);
        }

        activePointer = null;
      });
    }

    attachDrag(startHandle);
    attachDrag(endHandle);

    // Re-sync su resize del pannello: l'SVG e' in pixel concreti.
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => syncHandles());
      observer.observe(container);
      container.dataset.taperObserver = "true";
    }

    container.refreshTaper = syncHandles;

    return container;
  }

  function renderTaperSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const taperLabel = document.createElement("div");
    const taperSlider = createTaperSlider();
    const linkToggle = createToggleSetting({
      key: "taperLinkSizes",
      label: "LINK TIP SIZES",
    });
    const sizeSetting = createRangeSetting({
      key: "taperSize",
      label: "SIZE",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.taperSize) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const opacitySetting = createRangeSetting({
      key: "taperOpacity",
      label: "OPACITY",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.taperOpacity) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const pressureSetting = createRangeSetting({
      key: "taperPressure",
      label: "PRESSURE",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.taperPressure) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const minDistanceSetting = createRangeSetting({
      key: "taperMinDistance",
      label: "MIN DISTANCE",
      min: 0,
      max: 300,
      step: 1,
      value: Math.round(clamp(draftBrushSettings.taperMinDistance, 0, 300)),
      unit: "PX",
      toSetting: (displayValue) => displayValue,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const tipSetting = createRangeSetting({
      key: "taperTip",
      label: "TIP",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.taperTip) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const tipAnimationToggle = createToggleSetting({
      key: "taperTipAnimation",
      label: "TIP ANIMATION",
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    taperLabel.className = "brush-studio-taper-label";
    taperLabel.textContent = "PRESSURE TAPER";

    settingsPanel.replaceChildren(
      selectedName,
      taperLabel,
      taperSlider,
      linkToggle,
      sizeSetting,
      opacitySetting,
      pressureSetting,
      minDistanceSetting,
      tipSetting,
      tipAnimationToggle,
    );

    // Sync iniziale ora che il container e' nel DOM e ha layout valido.
    taperSlider.refreshTaper?.();
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

    if (selectedCategory === "TAPER") {
      renderTaperSettings();
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
      pushDraftToEngine();
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
