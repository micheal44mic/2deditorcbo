window.CBO = window.CBO || {};

window.CBO.initBrushStudio = function initBrushStudio() {
  const editorPage = document.querySelector(".editor-page");
  const StrokeMath = window.CBO.StrokeMath;
  const BrushDefaults = window.CBO.BrushDefaults;
  const clamp = StrokeMath.clamp;
  const clamp01 = StrokeMath.clamp01;
  const defaultShapeAlphaSrc = BrushDefaults.defaultShapeAlphaSrc;
  const defaultShapeAlphaName = BrushDefaults.defaultShapeAlphaName;
  const defaultGrainTextureSrc = BrushDefaults.defaultGrainTextureSrc;
  const defaultGrainTextureName = BrushDefaults.defaultGrainTextureName;
  const shapeAlphaExportSize = BrushDefaults.shapeAlphaExportSize;
  const grainTextureExportSize = BrushDefaults.grainTextureExportSize;
  const brushSizeMax = BrushDefaults.brushSizeMax || 500;
  const studioCategories = ["STROKE", "SHAPE", "GRAIN", "RENDERING", "COLOR DYNAMICS", "WET MIX", "STABILIZATION", "TAPER", "BASIC"];
  const defaultTaperMinDistance = BrushDefaults.defaultTaperMinDistance;
  const taperTipRealMin = BrushDefaults.taperTipRealMin;
  const implementedGrainBlendModes = new Set([
    "multiply",
    "darken",
    "linear-burn",
    "overlay",
    "lighten",
    "difference",
  ]);
  const grainBlendModeOptions = [
    { key: "multiply", label: "MULTIPLY" },
    { key: "darken", label: "DARKEN" },
    { key: "color-burn", label: "COLOR BURN" },
    { key: "linear-burn", label: "LINEAR BURN" },
    { key: "lighten", label: "LIGHTEN" },
    { key: "color-dodge", label: "COLOR DODGE" },
    { key: "overlay", label: "OVERLAY" },
    { key: "hard-mix", label: "HARD MIX" },
    { key: "difference", label: "DIFFERENCE" },
    { key: "subtract", label: "SUBTRACT" },
    { key: "divide", label: "DIVIDE" },
    { key: "height", label: "HEIGHT" },
    { key: "linear-height", label: "LINEAR HEIGHT" },
  ];
  const renderingModeOptions = [
    { key: "light-glaze", label: "LIGHT GLAZE" },
    { key: "uniform-glaze", label: "UNIFORM GLAZE" },
    { key: "intense-glaze", label: "INTENSE GLAZE" },
    { key: "heavy-glaze", label: "HEAVY GLAZE" },
    { key: "uniform-blending", label: "UNIFORM BLENDING" },
    { key: "intense-blending", label: "INTENSE BLENDING" },
  ];
  const burntEdgesModeOptions = [
    { key: "multiply", label: "MULTIPLY" },
    { key: "color-burn", label: "COLOR BURN" },
    { key: "linear-burn", label: "LINEAR BURN" },
  ];

  if (!editorPage || editorPage.dataset.brushStudioReady === "true") {
    return;
  }

  const existingBrushSettings = window.CBO.brushSettings || {};

  window.CBO.brushSettings = BrushDefaults.createSettings(existingBrushSettings);

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
        <div class="brush-studio-shape-editor" data-brush-shape-editor hidden>
          <input class="brush-studio-shape-input" type="file" accept="image/*" data-brush-shape-input />
          <div class="brush-studio-shape-editor-header">
            <h2 class="brush-studio-drawing-title">SHAPE ALPHA</h2>
            <div class="brush-studio-shape-editor-actions">
              <button class="brush-studio-shape-import-button" type="button" data-brush-shape-import>IMPORT</button>
              <button class="brush-studio-shape-invert-button" type="button" data-brush-shape-invert>INVERT</button>
              <button class="brush-studio-shape-cancel-button" type="button" data-brush-shape-cancel>CANCEL</button>
              <button class="brush-studio-shape-accept-button" type="button" aria-label="Accept shape alpha" data-brush-shape-accept>
                <svg class="brush-studio-check-icon lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="brush-studio-shape-editor-stage">
            <img class="brush-studio-shape-editor-image" alt="Shape alpha preview" data-brush-shape-editor-image />
          </div>
        </div>
        <div class="brush-studio-shape-editor" data-brush-grain-editor hidden>
          <input class="brush-studio-shape-input" type="file" accept="image/*" data-brush-grain-input />
          <div class="brush-studio-shape-editor-header">
            <h2 class="brush-studio-drawing-title">GRAIN TEXTURE</h2>
            <div class="brush-studio-shape-editor-actions">
              <button class="brush-studio-shape-import-button" type="button" data-brush-grain-import>IMPORT</button>
              <button class="brush-studio-shape-invert-button" type="button" data-brush-grain-invert>INVERT</button>
              <button class="brush-studio-shape-cancel-button" type="button" data-brush-grain-cancel>CANCEL</button>
              <button class="brush-studio-shape-accept-button" type="button" aria-label="Accept grain texture" data-brush-grain-accept>
                <svg class="brush-studio-check-icon lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="brush-studio-shape-editor-stage">
            <img class="brush-studio-shape-editor-image brush-studio-grain-editor-image" alt="Grain texture preview" data-brush-grain-editor-image />
          </div>
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
  const shapeEditor = editorPage.querySelector("[data-brush-shape-editor]");
  const shapeInput = editorPage.querySelector("[data-brush-shape-input]");
  const shapeImportButton = editorPage.querySelector("[data-brush-shape-import]");
  const shapeInvertButton = editorPage.querySelector("[data-brush-shape-invert]");
  const shapeCancelButton = editorPage.querySelector("[data-brush-shape-cancel]");
  const shapeAcceptButton = editorPage.querySelector("[data-brush-shape-accept]");
  const shapeEditorImage = editorPage.querySelector("[data-brush-shape-editor-image]");
  const grainEditor = editorPage.querySelector("[data-brush-grain-editor]");
  const grainInput = editorPage.querySelector("[data-brush-grain-input]");
  const grainImportButton = editorPage.querySelector("[data-brush-grain-import]");
  const grainInvertButton = editorPage.querySelector("[data-brush-grain-invert]");
  const grainCancelButton = editorPage.querySelector("[data-brush-grain-cancel]");
  const grainAcceptButton = editorPage.querySelector("[data-brush-grain-accept]");
  const grainEditorImage = editorPage.querySelector("[data-brush-grain-editor-image]");
  const selectionColumn = editorPage.querySelector(".brush-studio-selection-column");
  let selectedCategory = studioCategories[0];
  let draftBrushSettings = { ...window.CBO.brushSettings };
  let shapeEditorDraftSrc = draftBrushSettings.shapeAlphaSrc || defaultShapeAlphaSrc;
  let shapeEditorDraftName = draftBrushSettings.shapeAlphaName || defaultShapeAlphaName;
  let grainEditorDraftSrc = draftBrushSettings.grainTextureSrc || defaultGrainTextureSrc;
  let grainEditorDraftName = draftBrushSettings.grainTextureName || defaultGrainTextureName;
  let grainBlendModeScrollIndex = 0;
  let grainBlendModeOpen = false;
  let activeGrainBlendOutline = null;
  let previewCanvas = null;
  let previewDocumentRenderer = null;
  let previewEngine = null;
  let replayFrame = 0;

  function pushDraftToEngine() {
    window.dispatchEvent(
      new CustomEvent("cbo:brush-settings-preview-change", {
        detail: {
          source: "brush-studio",
          settings: { ...draftBrushSettings },
        },
      }),
    );

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
    if (!previewPad || !window.CBO.BrushEngine || !window.CBO.DocumentRenderer) {
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

    const gl = window.CBO.DocumentRenderer.createContext(previewCanvas);

    if (!gl) {
      previewCanvas.remove();
      previewCanvas = null;
      return;
    }

    try {
      const viewport = window.CBO.DocumentRenderer.resizeCanvasViewport(previewCanvas, gl);

      previewDocumentRenderer = new window.CBO.DocumentRenderer({
        gl,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        transparentBackground: true,
        documentSizeCap: 2048,
      });
      previewEngine = new window.CBO.BrushEngine(previewCanvas, {
        gl,
        documentRenderer: previewDocumentRenderer,
        getSettings: () => draftBrushSettings,
        transparentBackground: true,
        singleStrokeMode: true,
        disableNavigation: true,
        documentSizeCap: 2048,
      });
    } catch (error) {
      previewDocumentRenderer?.dispose?.();
      previewDocumentRenderer = null;
      previewCanvas.remove();
      previewCanvas = null;
      throw error;
    }

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
    previewDocumentRenderer?.dispose?.();
    previewDocumentRenderer = null;
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
          source: "brush-studio",
          persistBrushPreset: true,
          settings: { ...window.CBO.brushSettings },
        },
      }),
    );
  }

  function resetDraftBrushSettings() {
    draftBrushSettings = BrushDefaults.createSettings(window.CBO.brushSettings);
  }

  function getShapeAlphaSrc() {
    return draftBrushSettings.shapeAlphaSrc || defaultShapeAlphaSrc;
  }

  function getShapeAlphaName() {
    return draftBrushSettings.shapeAlphaName || defaultShapeAlphaName;
  }

  function getGrainTextureSrc() {
    return draftBrushSettings.grainTextureSrc || defaultGrainTextureSrc;
  }

  function getGrainTextureName() {
    return draftBrushSettings.grainTextureName || defaultGrainTextureName;
  }

  function getGrainMode() {
    return draftBrushSettings.grainMode === "moving" ? "moving" : "texturized";
  }

  function getGrainBlendMode() {
    const mode = String(draftBrushSettings.grainBlendMode || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    return implementedGrainBlendModes.has(mode) ? mode : "multiply";
  }

  function getGrainBlendModeIndex() {
    const mode = getGrainBlendMode();
    const index = grainBlendModeOptions.findIndex((option) => option.key === mode);

    return index >= 0 ? index : 0;
  }

  function createSelectedHeader({ editable = false, onEdit = openShapeEditor } = {}) {
    const header = document.createElement("div");
    const selectedName = document.createElement("div");

    header.className = "brush-studio-selected-header";
    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    header.append(selectedName);

    if (editable) {
      const editButton = document.createElement("button");

      editButton.className = "brush-studio-edit-button";
      editButton.type = "button";
      editButton.textContent = "EDIT";
      editButton.addEventListener("click", onEdit);
      header.append(editButton);
    }

    return header;
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
          closeShapeEditor();
          closeGrainEditor();
          renderStudioContent();
        });

        return categoryButton;
      }),
    );
  }

  function createRangeSetting({ key, label, min, max, step, value, unit, toSetting, toDisplay, disabled = false }) {
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

    function setDisabled(isDisabled) {
      slider.disabled = isDisabled;
      valueInput.disabled = isDisabled;
      setting.classList.toggle("disabled", isDisabled);
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
    setDisabled(disabled);
    setting.setDisabled = setDisabled;

    return setting;
  }

  function createSectionLabel(text) {
    const label = document.createElement("div");

    label.className = "brush-studio-section-label";
    label.textContent = text;

    return label;
  }

  function createPercentSetting(key, label) {
    return createRangeSetting({
      key,
      label,
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings[key]) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
  }

  function createSelectSetting({ key, label, options }) {
    const wrapper = document.createElement("label");
    const name = document.createElement("span");
    const select = document.createElement("select");
    const fallbackValue = options[0]?.key || "";
    const currentValue = String(draftBrushSettings[key] || fallbackValue);

    wrapper.className = "brush-studio-select-setting";
    name.className = "brush-studio-setting-name";
    select.className = "brush-studio-select";
    name.textContent = label;
    select.setAttribute("aria-label", label);

    options.forEach((option) => {
      const optionElement = document.createElement("option");

      optionElement.value = option.key;
      optionElement.textContent = option.label;
      select.append(optionElement);
    });

    select.value = options.some((option) => option.key === currentValue) ? currentValue : fallbackValue;
    draftBrushSettings[key] = select.value;
    select.addEventListener("change", () => {
      draftBrushSettings[key] = select.value;
      pushDraftToEngine();
    });

    wrapper.append(name, select);

    return wrapper;
  }

  function createGrainPercentSetting({ key, label, value = 1, noneAtZero = false, formatDisplay = null }) {
    const setting = document.createElement("div");
    const header = document.createElement("div");
    const name = document.createElement("div");
    const valuePill = document.createElement("span");
    const slider = document.createElement("input");

    setting.className = "brush-studio-setting";
    header.className = "brush-studio-setting-header";
    name.className = "brush-studio-setting-name";
    valuePill.className = "brush-studio-setting-value";
    slider.className = "brush-studio-range";
    name.textContent = label;

    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.setAttribute("aria-label", label);

    function setValue(nextValue) {
      const displayValue = Math.round(clamp(Number(nextValue), 0, 100));
      const progress = displayValue;

      draftBrushSettings[key] = displayValue / 100;
      slider.value = String(displayValue);
      valuePill.textContent = typeof formatDisplay === "function"
        ? formatDisplay(displayValue)
        : noneAtZero && displayValue === 0
          ? "NONE"
          : `${displayValue}%`;
      slider.style.setProperty("--brush-studio-range-progress", `${progress}%`);
      pushDraftToEngine();
    }

    slider.addEventListener("input", () => {
      setValue(slider.value);
    });

    setValue(Math.round(clamp01(value) * 100));
    header.append(name, valuePill);
    setting.append(header, slider);

    return setting;
  }

  function createGrainSignedPercentSetting({ key, label, value = 0, formatDisplay = null }) {
    const setting = document.createElement("div");
    const header = document.createElement("div");
    const name = document.createElement("div");
    const valuePill = document.createElement("span");
    const slider = document.createElement("input");

    setting.className = "brush-studio-setting";
    header.className = "brush-studio-setting-header";
    name.className = "brush-studio-setting-name";
    valuePill.className = "brush-studio-setting-value";
    slider.className = "brush-studio-range brush-studio-range-centered";
    name.textContent = label;

    slider.type = "range";
    slider.min = "-100";
    slider.max = "100";
    slider.step = "1";
    slider.setAttribute("aria-label", label);

    function setValue(nextValue) {
      const displayValue = Math.round(clamp(Number(nextValue), -100, 100));
      const progress = ((displayValue + 100) / 200) * 100;
      const start = Math.min(50, progress);
      const end = Math.max(50, progress);
      const prefix = displayValue > 0 ? "+" : "";

      draftBrushSettings[key] = displayValue / 100;
      slider.value = String(displayValue);
      valuePill.textContent = typeof formatDisplay === "function"
        ? formatDisplay(displayValue)
        : `${prefix}${displayValue}%`;
      slider.style.setProperty("--brush-studio-range-start", `${start}%`);
      slider.style.setProperty("--brush-studio-range-end", `${end}%`);
      pushDraftToEngine();
    }

    slider.addEventListener("input", () => {
      setValue(slider.value);
    });

    setValue(Number.isFinite(Number(value)) ? value : 0);
    header.append(name, valuePill);
    setting.append(header, slider);

    return setting;
  }

  function closeGrainBlendModeControl() {
    if (activeGrainBlendOutline) {
      activeGrainBlendOutline.classList.remove("active");
    }

    grainBlendModeOpen = false;
    activeGrainBlendOutline = null;
    brushStudio?.classList.remove("brush-studio-panel-blend-mode-open");
    selectionColumn?.classList.remove("brush-studio-selection-column-lock-scroll");
  }

  function createGrainBlendModeControl() {
    const wrapper = document.createElement("div");
    const label = document.createElement("div");
    const outline = document.createElement("div");
    const hoverLayer = document.createElement("div");
    const fillLayer = document.createElement("div");
    const list = document.createElement("div");
    const blendModes = grainBlendModeOptions;

    grainBlendModeScrollIndex = getGrainBlendModeIndex();

    wrapper.className = "brush-studio-grain-blend-outline";
    label.className = "brush-studio-setting-name";
    outline.className = "brush-studio-grain-blend-outline-box";
    outline.tabIndex = 0;
    hoverLayer.className = "brush-studio-grain-blend-hover-layer";
    fillLayer.className = "brush-studio-grain-blend-fill-layer";
    list.className = "brush-studio-grain-blend-word-list";
    label.textContent = "BLEND MODE";
    const options = blendModes.map((mode, index) => {
      const option = document.createElement("div");
      const isImplemented = implementedGrainBlendModes.has(mode.key);

      option.className = "brush-studio-grain-blend-word";
      option.textContent = mode.label;
      option.classList.toggle("is-disabled", !isImplemented);
      option.setAttribute("aria-disabled", String(!isImplemented));
      option.addEventListener("click", (event) => {
        if (!grainBlendModeOpen || activeGrainBlendOutline !== outline) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!isImplemented) {
          return;
        }

        if (index === grainBlendModeScrollIndex) {
          closeGrainBlendModeControl();
          return;
        }

        grainBlendModeScrollIndex = index;
        draftBrushSettings.grainBlendMode = mode.key;
        pushDraftToEngine();
        syncBlendModeUi();
      });

      return option;
    });

    list.append(...options);

    function syncBlendModeUi() {
      const selectedMode = getGrainBlendMode();

      outline.style.setProperty("--grain-blend-scroll-index", String(grainBlendModeScrollIndex));
      outline.classList.toggle("active", grainBlendModeOpen && activeGrainBlendOutline === outline);

      options.forEach((option, index) => {
        option.classList.toggle("is-selected", blendModes[index].key === selectedMode);
      });
    }

    function getNextEnabledIndex(currentIndex, direction) {
      let nextIndex = currentIndex + direction;

      while (nextIndex >= 0 && nextIndex < blendModes.length) {
        if (implementedGrainBlendModes.has(blendModes[nextIndex].key)) {
          return nextIndex;
        }

        nextIndex += direction;
      }

      return currentIndex;
    }

    function updateBlendBoxAnchor() {
      const rect = outline.getBoundingClientRect();
      const panelRect = brushStudio?.getBoundingClientRect();
      const offsetTop = panelRect ? rect.top - panelRect.top : rect.top;
      const offsetLeft = panelRect ? rect.left - panelRect.left : rect.left;

      outline.style.setProperty("--grain-blend-box-top", `${offsetTop}px`);
      outline.style.setProperty("--grain-blend-box-left", `${offsetLeft}px`);
      outline.style.setProperty("--grain-blend-box-width", `${rect.width}px`);
    }

    function setBlendModeOpen(isOpen) {
      if (!isOpen) {
        closeGrainBlendModeControl();
        syncBlendModeUi();
        return;
      }

      if (activeGrainBlendOutline && activeGrainBlendOutline !== outline) {
        closeGrainBlendModeControl();
      }

      grainBlendModeOpen = true;
      activeGrainBlendOutline = outline;
      brushStudio?.classList.add("brush-studio-panel-blend-mode-open");
      updateBlendBoxAnchor();
      syncBlendModeUi();
    }

    syncBlendModeUi();

    outline.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setBlendModeOpen(true);
    });

    outline.addEventListener(
      "wheel",
      (event) => {
        if (!grainBlendModeOpen || activeGrainBlendOutline !== outline) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const direction = event.deltaY > 0 ? 1 : -1;
        const nextIndex = getNextEnabledIndex(grainBlendModeScrollIndex, direction);

        if (nextIndex === grainBlendModeScrollIndex) {
          return;
        }

        grainBlendModeScrollIndex = nextIndex;
        draftBrushSettings.grainBlendMode = blendModes[nextIndex].key;
        pushDraftToEngine();
        syncBlendModeUi();
      },
      { passive: false },
    );

    outline.append(hoverLayer, fillLayer, list);
    wrapper.append(label, outline);

    return wrapper;
  }

  function renderShapeSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedHeader = createSelectedHeader({ editable: true });
    const alphaButton = document.createElement("button");
    const alphaHeader = document.createElement("div");
    const alphaLabel = document.createElement("span");
    const alphaName = document.createElement("span");
    const alphaPreview = document.createElement("span");
    const alphaImage = document.createElement("img");
    const inputStyle = document.createElement("div");
    const inputStyleLabel = document.createElement("div");
    const inputStyleOptions = document.createElement("div");
    const touchPropertiesLabel = document.createElement("div");
    const shapePropertiesLabel = document.createElement("div");
    const inputOptions = [
      { label: "TOUCH ONLY", active: true, disabled: false },
      { label: "AZIMUTH", active: false, disabled: true },
      { label: "AZIMUTH AND BARREL ROLL", active: false, disabled: true },
    ];
    const shapeRotation = Number(draftBrushSettings.shapeRotation);
    const rotationSetting = createGrainSignedPercentSetting({
      key: "shapeRotation",
      label: "ROTATION",
      value: Math.round(clamp(Number.isFinite(shapeRotation) ? shapeRotation : 0, -1, 1) * 100),
      formatDisplay: (displayValue) => {
        if (displayValue === -100) {
          return "INVERSE";
        }

        if (displayValue === 0) {
          return "LOCKED";
        }

        return displayValue === 100 ? "FOLLOW STROKE" : `${displayValue > 0 ? "+" : ""}${displayValue}%`;
      },
    });
    const randomizedToggle = createToggleSetting({
      key: "shapeRandomized",
      label: "RANDOMIZED",
    });
    const scatterSetting = createRangeSetting({
      key: "shapeScatter",
      label: "SCATTER",
      min: 0,
      max: 200,
      step: 1,
      value: Math.round(clamp(draftBrushSettings.shapeScatter, 0, 2) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const flipXToggle = createToggleSetting({
      key: "shapeFlipX",
      label: "FLIP X",
    });
    const flipYToggle = createToggleSetting({
      key: "shapeFlipY",
      label: "FLIP Y",
    });
    const countSetting = createRangeSetting({
      key: "shapeCount",
      label: "COUNT",
      min: 1,
      max: 16,
      step: 1,
      value: Math.round(clamp(draftBrushSettings.shapeCount ?? 1, 1, 16)),
      unit: "",
      toSetting: (displayValue) => Math.round(displayValue),
      toDisplay: (displayValue) => Math.round(displayValue),
    });
    const countJitterSetting = createRangeSetting({
      key: "shapeCountJitter",
      label: "COUNT JITTER",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(clamp01(draftBrushSettings.shapeCountJitter) * 100),
      unit: "%",
      toSetting: (displayValue) => displayValue / 100,
      toDisplay: (displayValue) => Math.round(displayValue),
    });

    alphaButton.className = "brush-studio-shape-alpha-card";
    alphaButton.type = "button";
    alphaButton.setAttribute("aria-label", "Edit shape alpha");
    alphaButton.addEventListener("click", openShapeEditor);
    alphaHeader.className = "brush-studio-shape-alpha-header";
    alphaLabel.className = "brush-studio-setting-name";
    alphaLabel.textContent = "ALPHA";
    alphaName.className = "brush-studio-shape-alpha-name";
    alphaName.textContent = getShapeAlphaName();
    alphaPreview.className = "brush-studio-shape-alpha-preview";
    alphaImage.className = "brush-studio-shape-alpha-image";
    alphaImage.alt = "Shape alpha";
    alphaImage.src = getShapeAlphaSrc();

    alphaHeader.append(alphaLabel, alphaName);
    alphaPreview.append(alphaImage);
    alphaButton.append(alphaHeader, alphaPreview);

    inputStyle.className = "brush-studio-shape-input-style";
    inputStyleLabel.className = "brush-studio-setting-name";
    inputStyleLabel.textContent = "INPUT STYLE";
    inputStyleOptions.className = "brush-studio-shape-input-options";
    inputStyleOptions.append(
      ...inputOptions.map((option) => {
        const optionButton = document.createElement("button");

        optionButton.className = "brush-studio-shape-input-option";
        optionButton.type = "button";
        optionButton.textContent = option.label;
        optionButton.disabled = option.disabled;
        optionButton.classList.toggle("active", option.active);
        optionButton.setAttribute("aria-pressed", String(option.active));

        return optionButton;
      }),
    );
    inputStyle.append(inputStyleLabel, inputStyleOptions);

    touchPropertiesLabel.className = "brush-studio-shape-section-label";
    touchPropertiesLabel.textContent = "TOUCH PROPERTIES";
    shapePropertiesLabel.className = "brush-studio-shape-section-label";
    shapePropertiesLabel.textContent = "SHAPE PROPERTIES";

    settingsPanel.replaceChildren(
      selectedHeader,
      alphaButton,
      inputStyle,
      touchPropertiesLabel,
      rotationSetting,
      shapePropertiesLabel,
      scatterSetting,
      countSetting,
      countJitterSetting,
      randomizedToggle,
      flipXToggle,
      flipYToggle,
    );
  }

  function renderGrainSettings() {
    if (!settingsPanel) {
      return;
    }

    const isGrainEnabled = draftBrushSettings.grainEnabled !== false;
    const selectedHeader = createSelectedHeader({ editable: true, onEdit: openGrainEditor });
    const enabledToggle = createToggleSetting({
      key: "grainEnabled",
      label: "GRAIN ENABLED",
      onChange: () => {
        renderGrainSettings();
      },
    });
    const grainButton = document.createElement("button");
    const grainHeader = document.createElement("div");
    const grainLabel = document.createElement("span");
    const grainName = document.createElement("span");
    const grainPreview = document.createElement("span");
    const grainImage = document.createElement("img");
    const grainModeSelector = document.createElement("div");
    const grainModeContent = document.createElement("div");
    const modeOptions = [
      { key: "moving", label: "MOVING" },
      { key: "texturized", label: "TEXTURIZED" },
    ];
    const activeMode = getGrainMode();

    grainButton.className = "brush-studio-shape-alpha-card";
    grainButton.type = "button";
    grainButton.setAttribute("aria-label", "Edit grain texture");
    grainButton.addEventListener("click", openGrainEditor);
    grainHeader.className = "brush-studio-shape-alpha-header";
    grainLabel.className = "brush-studio-setting-name";
    grainLabel.textContent = "TEXTURE";
    grainName.className = "brush-studio-shape-alpha-name";
    grainName.textContent = isGrainEnabled ? getGrainTextureName() : "NONE";
    grainPreview.className = "brush-studio-shape-alpha-preview brush-studio-grain-texture-preview";
    grainImage.className = "brush-studio-shape-alpha-image brush-studio-grain-texture-image";
    grainImage.alt = "Grain texture";
    grainImage.src = getGrainTextureSrc();
    grainButton.classList.toggle("grain-disabled", !isGrainEnabled);

    grainHeader.append(grainLabel, grainName);
    if (isGrainEnabled) {
      grainPreview.append(grainImage);
    }
    grainButton.append(grainHeader, grainPreview);
    grainModeSelector.className = "brush-studio-grain-mode-selector";
    grainModeSelector.append(
      ...modeOptions.map((option) => {
        const optionButton = document.createElement("button");
        const isActive = activeMode === option.key;

        optionButton.className = "brush-studio-grain-mode-button";
        optionButton.type = "button";
        optionButton.textContent = option.label;
        optionButton.classList.toggle("active", isActive);
        optionButton.setAttribute("aria-pressed", String(isActive));
        optionButton.addEventListener("click", () => {
          draftBrushSettings.grainMode = option.key;
          pushDraftToEngine();
          renderGrainSettings();
        });

        return optionButton;
      }),
    );

    grainModeContent.className = "brush-studio-grain-mode-content";

    if (activeMode === "texturized") {
      grainModeContent.append(
        createSectionLabel("TEXTURIZED"),
        createGrainPercentSetting({
          key: "grainTexturizedScale",
          label: "SCALE",
          value: draftBrushSettings.grainTexturizedScale,
          noneAtZero: true,
        }),
        createGrainPercentSetting({
          key: "grainTexturizedDepth",
          label: "DEPTH",
          value: draftBrushSettings.grainTexturizedDepth,
        }),
        createGrainBlendModeControl(),
        createGrainSignedPercentSetting({
          key: "grainBrightness",
          label: "BRIGHTNESS",
          value: clamp(draftBrushSettings.grainBrightness, -1, 1) * 100,
        }),
        createGrainSignedPercentSetting({
          key: "grainContrast",
          label: "CONTRAST",
          value: clamp(draftBrushSettings.grainContrast, -1, 1) * 100,
        }),
      );
    } else {
      grainModeContent.append(
        createSectionLabel("MOVING"),
        createGrainPercentSetting({
          key: "grainMovingMovement",
          label: "MOVEMENT",
          value: draftBrushSettings.grainMovingMovement,
          formatDisplay: (displayValue) => {
            if (displayValue === 0) {
              return "STAMP";
            }

            return displayValue === 100 ? "ROLLING" : `${displayValue}%`;
          },
        }),
        createGrainPercentSetting({
          key: "grainMovingScale",
          label: "SCALE",
          value: draftBrushSettings.grainMovingScale,
          formatDisplay: (displayValue) => {
            if (displayValue === 0) {
              return "NONE";
            }

            return displayValue === 100 ? "MAX" : `${displayValue}%`;
          },
        }),
        createGrainPercentSetting({
          key: "grainMovingZoom",
          label: "ZOOM",
          value: draftBrushSettings.grainMovingZoom,
          formatDisplay: (displayValue) => {
            if (displayValue === 0) {
              return "FOLLOW SIZE";
            }

            return displayValue === 100 ? "CROPPED" : `${displayValue}%`;
          },
        }),
        createGrainSignedPercentSetting({
          key: "grainMovingRotation",
          label: "ROTATION",
          value: clamp(draftBrushSettings.grainMovingRotation, -1, 1) * 100,
          formatDisplay: (displayValue) => {
            if (displayValue === -100) {
              return "INVERSE";
            }

            if (displayValue === 0) {
              return "LOCKED";
            }

            return displayValue === 100 ? "FOLLOW STROKE" : `${displayValue > 0 ? "+" : ""}${displayValue}%`;
          },
        }),
        createGrainPercentSetting({
          key: "grainMovingDepth",
          label: "DEPTH",
          value: draftBrushSettings.grainMovingDepth,
        }),
        createGrainPercentSetting({
          key: "grainMovingDepthMinimum",
          label: "DEPTH MINIMUM",
          value: draftBrushSettings.grainMovingDepthMinimum,
          noneAtZero: true,
        }),
        createGrainPercentSetting({
          key: "grainMovingDepthJitter",
          label: "DEPTH JITTER",
          value: draftBrushSettings.grainMovingDepthJitter,
          noneAtZero: true,
        }),
        createToggleSetting({
          key: "grainMovingOffsetJitter",
          label: "OFFSET JITTER",
        }),
        createGrainBlendModeControl(),
        createGrainSignedPercentSetting({
          key: "grainBrightness",
          label: "BRIGHTNESS",
          value: clamp(draftBrushSettings.grainBrightness, -1, 1) * 100,
        }),
        createGrainSignedPercentSetting({
          key: "grainContrast",
          label: "CONTRAST",
          value: clamp(draftBrushSettings.grainContrast, -1, 1) * 100,
        }),
      );
    }

    settingsPanel.replaceChildren(selectedHeader, enabledToggle, grainButton, grainModeSelector, grainModeContent);
  }

  function openShapeEditor() {
    if (!shapeEditor || !shapeEditorImage) {
      return;
    }

    closeGrainEditor();
    shapeEditorDraftSrc = getShapeAlphaSrc();
    shapeEditorDraftName = getShapeAlphaName();
    shapeEditorImage.src = shapeEditorDraftSrc;
    shapeEditor.hidden = false;
  }

  function closeShapeEditor() {
    if (shapeEditor) {
      shapeEditor.hidden = true;
    }

    if (shapeInput) {
      shapeInput.value = "";
    }
  }

  function acceptShapeEditor() {
    draftBrushSettings.shapeAlphaSrc = shapeEditorDraftSrc || defaultShapeAlphaSrc;
    draftBrushSettings.shapeAlphaName = shapeEditorDraftName || defaultShapeAlphaName;
    closeShapeEditor();
    renderShapeSettings();
    pushDraftToEngine();
  }

  function openGrainEditor() {
    if (!grainEditor || !grainEditorImage) {
      return;
    }

    closeShapeEditor();
    grainEditorDraftSrc = getGrainTextureSrc();
    grainEditorDraftName = getGrainTextureName();
    grainEditorImage.src = grainEditorDraftSrc;
    grainEditor.hidden = false;
  }

  function closeGrainEditor() {
    if (grainEditor) {
      grainEditor.hidden = true;
    }

    if (grainInput) {
      grainInput.value = "";
    }
  }

  function acceptGrainEditor() {
    draftBrushSettings.grainEnabled = true;
    draftBrushSettings.grainTextureSrc = grainEditorDraftSrc || defaultGrainTextureSrc;
    draftBrushSettings.grainTextureName = grainEditorDraftName || defaultGrainTextureName;
    draftBrushSettings.grainInvert = false;
    closeGrainEditor();
    renderGrainSettings();
    pushDraftToEngine();
  }

  function loadImageFromObjectUrl(objectUrl, label = "image") {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${label}.`));
      image.src = objectUrl;
    });
  }

  function getMaskValue({ red, green, blue, alpha, invert }) {
    const sourceAlpha = alpha / 255;
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const mask = invert ? 1 - luminance : luminance;

    return clamp(Math.round(mask * sourceAlpha * 255), 0, 255);
  }

  function createAlphaDataUrlFromImage(image) {
    const naturalWidth = Math.max(1, image.naturalWidth || image.width || shapeAlphaExportSize);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || shapeAlphaExportSize);
    const scanScale = Math.min(1, 512 / Math.max(naturalWidth, naturalHeight));
    const scanWidth = Math.max(1, Math.round(naturalWidth * scanScale));
    const scanHeight = Math.max(1, Math.round(naturalHeight * scanScale));
    const scanCanvas = document.createElement("canvas");
    const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });

    if (!scanContext) {
      throw new Error("Unable to read shape alpha image.");
    }

    scanCanvas.width = scanWidth;
    scanCanvas.height = scanHeight;
    scanContext.clearRect(0, 0, scanWidth, scanHeight);
    scanContext.drawImage(image, 0, 0, scanWidth, scanHeight);

    const scanPixels = scanContext.getImageData(0, 0, scanWidth, scanHeight).data;
    let borderLuminance = 0;
    let borderCount = 0;

    for (let y = 0; y < scanHeight; y += 1) {
      for (let x = 0; x < scanWidth; x += 1) {
        if (x !== 0 && y !== 0 && x !== scanWidth - 1 && y !== scanHeight - 1) {
          continue;
        }

        const offset = (y * scanWidth + x) * 4;
        const alpha = scanPixels[offset + 3];

        if (alpha <= 8) {
          continue;
        }

        borderLuminance +=
          (0.2126 * scanPixels[offset] + 0.7152 * scanPixels[offset + 1] + 0.0722 * scanPixels[offset + 2]) / 255;
        borderCount += 1;
      }
    }

    const invert = borderCount > 0 && borderLuminance / borderCount > 0.55;
    let minX = scanWidth;
    let minY = scanHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < scanHeight; y += 1) {
      for (let x = 0; x < scanWidth; x += 1) {
        const offset = (y * scanWidth + x) * 4;
        const mask = getMaskValue({
          red: scanPixels[offset],
          green: scanPixels[offset + 1],
          blue: scanPixels[offset + 2],
          alpha: scanPixels[offset + 3],
          invert,
        });

        if (mask <= 18) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < 0 || maxY < 0) {
      minX = 0;
      minY = 0;
      maxX = scanWidth - 1;
      maxY = scanHeight - 1;
    }

    const sourceX = minX / scanScale;
    const sourceY = minY / scanScale;
    const sourceWidth = Math.max(1, (maxX - minX + 1) / scanScale);
    const sourceHeight = Math.max(1, (maxY - minY + 1) / scanScale);
    const tempCanvas = document.createElement("canvas");
    const tempContext = tempCanvas.getContext("2d", { willReadFrequently: true });
    const outputCanvas = document.createElement("canvas");
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    const innerSize = shapeAlphaExportSize - 64;
    const drawScale = Math.min(innerSize / sourceWidth, innerSize / sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.round((shapeAlphaExportSize - drawWidth) / 2);
    const drawY = Math.round((shapeAlphaExportSize - drawHeight) / 2);

    if (!tempContext || !outputContext) {
      throw new Error("Unable to convert shape alpha image.");
    }

    tempCanvas.width = shapeAlphaExportSize;
    tempCanvas.height = shapeAlphaExportSize;
    outputCanvas.width = shapeAlphaExportSize;
    outputCanvas.height = shapeAlphaExportSize;
    tempContext.clearRect(0, 0, shapeAlphaExportSize, shapeAlphaExportSize);
    tempContext.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
    );

    const imageData = tempContext.getImageData(0, 0, shapeAlphaExportSize, shapeAlphaExportSize);
    const output = outputContext.createImageData(shapeAlphaExportSize, shapeAlphaExportSize);

    for (let index = 0; index < imageData.data.length; index += 4) {
      const mask = getMaskValue({
        red: imageData.data[index],
        green: imageData.data[index + 1],
        blue: imageData.data[index + 2],
        alpha: imageData.data[index + 3],
        invert,
      });

      output.data[index] = 255;
      output.data[index + 1] = 255;
      output.data[index + 2] = 255;
      output.data[index + 3] = mask < 9 ? 0 : mask;
    }

    outputContext.putImageData(output, 0, 0);

    return outputCanvas.toDataURL("image/png");
  }

  function createInvertedAlphaDataUrlFromImage(image) {
    const sourceWidth = Math.max(1, image.naturalWidth || image.width || shapeAlphaExportSize);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || shapeAlphaExportSize);
    const tempCanvas = document.createElement("canvas");
    const tempContext = tempCanvas.getContext("2d", { willReadFrequently: true });
    const outputCanvas = document.createElement("canvas");
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    const drawScale = Math.min(shapeAlphaExportSize / sourceWidth, shapeAlphaExportSize / sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.round((shapeAlphaExportSize - drawWidth) / 2);
    const drawY = Math.round((shapeAlphaExportSize - drawHeight) / 2);

    if (!tempContext || !outputContext) {
      throw new Error("Unable to invert shape alpha.");
    }

    tempCanvas.width = shapeAlphaExportSize;
    tempCanvas.height = shapeAlphaExportSize;
    outputCanvas.width = shapeAlphaExportSize;
    outputCanvas.height = shapeAlphaExportSize;
    tempContext.clearRect(0, 0, shapeAlphaExportSize, shapeAlphaExportSize);
    tempContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const imageData = tempContext.getImageData(0, 0, shapeAlphaExportSize, shapeAlphaExportSize);
    const output = outputContext.createImageData(shapeAlphaExportSize, shapeAlphaExportSize);

    for (let index = 0; index < imageData.data.length; index += 4) {
      output.data[index] = 255;
      output.data[index + 1] = 255;
      output.data[index + 2] = 255;
      output.data[index + 3] = 255 - imageData.data[index + 3];
    }

    outputContext.putImageData(output, 0, 0);

    return outputCanvas.toDataURL("image/png");
  }

  function getLuminanceByte(red, green, blue) {
    return clamp(Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue), 0, 255);
  }

  function createGrainDataUrlFromImage(image, { invert = false } = {}) {
    const exportSize = Math.max(1, grainTextureExportSize || 2048);
    const sourceWidth = Math.max(1, image.naturalWidth || image.width || exportSize);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || exportSize);
    const tempCanvas = document.createElement("canvas");
    const tempContext = tempCanvas.getContext("2d", { willReadFrequently: true });
    const outputCanvas = document.createElement("canvas");
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    const drawScale = Math.max(exportSize / sourceWidth, exportSize / sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * drawScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * drawScale));
    const drawX = Math.round((exportSize - drawWidth) / 2);
    const drawY = Math.round((exportSize - drawHeight) / 2);

    if (!tempContext || !outputContext) {
      throw new Error("Unable to convert grain texture.");
    }

    tempCanvas.width = exportSize;
    tempCanvas.height = exportSize;
    outputCanvas.width = exportSize;
    outputCanvas.height = exportSize;
    tempContext.clearRect(0, 0, exportSize, exportSize);
    tempContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const imageData = tempContext.getImageData(0, 0, exportSize, exportSize);
    const output = outputContext.createImageData(exportSize, exportSize);

    for (let index = 0; index < imageData.data.length; index += 4) {
      const sourceAlpha = imageData.data[index + 3] / 255;
      const luminance = getLuminanceByte(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
      const neutralLuminance = Math.round(luminance * sourceAlpha + 255 * (1 - sourceAlpha));
      const grain = invert ? 255 - neutralLuminance : neutralLuminance;

      output.data[index] = grain;
      output.data[index + 1] = grain;
      output.data[index + 2] = grain;
      output.data[index + 3] = 255;
    }

    outputContext.putImageData(output, 0, 0);

    return outputCanvas.toDataURL("image/png");
  }

  async function invertShapeAlpha() {
    if (!shapeEditorDraftSrc) {
      return;
    }

    try {
      const image = await loadImageFromObjectUrl(shapeEditorDraftSrc, "shape alpha image");

      shapeEditorDraftSrc = createInvertedAlphaDataUrlFromImage(image);

      if (shapeEditorImage) {
        shapeEditorImage.src = shapeEditorDraftSrc;
      }
    } catch (error) {
      console.warn("Unable to invert shape alpha.", error);
    }
  }

  async function importShapeAlpha(file) {
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await loadImageFromObjectUrl(objectUrl, "shape alpha image");
      const alphaSrc = createAlphaDataUrlFromImage(image);

      shapeEditorDraftSrc = alphaSrc;
      shapeEditorDraftName = (file.name || defaultShapeAlphaName).replace(/\.[^.]+$/, "").toUpperCase();

      if (shapeEditorImage) {
        shapeEditorImage.src = shapeEditorDraftSrc;
      }
    } catch (error) {
      console.warn("Unable to import shape alpha.", error);
    } finally {
      URL.revokeObjectURL(objectUrl);

      if (shapeInput) {
        shapeInput.value = "";
      }
    }
  }

  async function invertGrainTexture() {
    if (!grainEditorDraftSrc) {
      return;
    }

    try {
      const image = await loadImageFromObjectUrl(grainEditorDraftSrc, "grain texture image");
      const currentName = grainEditorDraftName || defaultGrainTextureName;

      grainEditorDraftSrc = createGrainDataUrlFromImage(image, { invert: true });
      grainEditorDraftName = currentName.endsWith(" INV") ? currentName.slice(0, -4) : `${currentName} INV`;

      if (grainEditorImage) {
        grainEditorImage.src = grainEditorDraftSrc;
      }
    } catch (error) {
      console.warn("Unable to invert grain texture.", error);
    }
  }

  async function importGrainTexture(file) {
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await loadImageFromObjectUrl(objectUrl, "grain texture image");

      grainEditorDraftSrc = createGrainDataUrlFromImage(image);
      grainEditorDraftName = (file.name || defaultGrainTextureName).replace(/\.[^.]+$/, "").toUpperCase();

      if (grainEditorImage) {
        grainEditorImage.src = grainEditorDraftSrc;
      }
    } catch (error) {
      console.warn("Unable to import grain texture.", error);
    } finally {
      URL.revokeObjectURL(objectUrl);

      if (grainInput) {
        grainInput.value = "";
      }
    }
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
      max: brushSizeMax,
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
    const pressureToggle = createToggleSetting({
      key: "velocityPressureEnabled",
      label: "AUTO PRESSURE",
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(
      selectedName,
      pressureToggle,
      spacingSetting,
      spacingJitterSetting,
      lateralJitterSetting,
      linearJitterSetting,
      fallOffSetting,
    );
  }

  function renderColorDynamicsSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const stampJitterLabel = createSectionLabel("STAMP COLOR JITTER");
    const strokeJitterLabel = createSectionLabel("STROKE COLOR JITTER");
    const stampHueSetting = createPercentSetting("stampColorHueJitter", "HUE");
    const stampSaturationSetting = createPercentSetting("stampColorSaturationJitter", "SATURATION");
    const stampLightnessSetting = createPercentSetting("stampColorLightnessJitter", "LIGHTNESS");
    const stampDarknessSetting = createPercentSetting("stampColorDarknessJitter", "DARKNESS");
    const stampSecondarySetting = createPercentSetting("stampColorSecondaryJitter", "SECONDARY COLOR");
    const strokeHueSetting = createPercentSetting("strokeColorHueJitter", "HUE");
    const strokeSaturationSetting = createPercentSetting("strokeColorSaturationJitter", "SATURATION");
    const strokeLightnessSetting = createPercentSetting("strokeColorLightnessJitter", "LIGHTNESS");
    const strokeDarknessSetting = createPercentSetting("strokeColorDarknessJitter", "DARKNESS");
    const strokeSecondarySetting = createPercentSetting("strokeColorSecondaryJitter", "SECONDARY COLOR");

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(
      selectedName,
      stampJitterLabel,
      stampHueSetting,
      stampSaturationSetting,
      stampLightnessSetting,
      stampDarknessSetting,
      stampSecondarySetting,
      strokeJitterLabel,
      strokeHueSetting,
      strokeSaturationSetting,
      strokeLightnessSetting,
      strokeDarknessSetting,
      strokeSecondarySetting,
    );
  }

  function renderRenderingSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const modeSetting = createSelectSetting({
      key: "renderingMode",
      label: "MODE",
      options: renderingModeOptions,
    });
    const flowSetting = createPercentSetting("flow", "FLOW");
    const wetEdgesSetting = createPercentSetting("wetEdges", "WET EDGES");
    const burntEdgesSetting = createPercentSetting("burntEdges", "BURNT EDGES");
    const burntEdgesModeSetting = createSelectSetting({
      key: "burntEdgesMode",
      label: "BURNT EDGES MODE",
      options: burntEdgesModeOptions,
    });
    const thresholdAmountSetting = createPercentSetting("alphaThreshold", "THRESHOLD AMOUNT");
    const thresholdToggle = createToggleSetting({
      key: "alphaThresholdEnabled",
      label: "ALPHA THRESHOLD",
      onChange: (isActive) => {
        thresholdAmountSetting.setDisabled?.(!isActive);
      },
    });

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    thresholdAmountSetting.setDisabled?.(draftBrushSettings.alphaThresholdEnabled !== true);

    settingsPanel.replaceChildren(
      selectedName,
      modeSetting,
      flowSetting,
      wetEdgesSetting,
      burntEdgesSetting,
      burntEdgesModeSetting,
      thresholdToggle,
      thresholdAmountSetting,
    );
  }

  function renderWetMixSettings() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");
    const dilutionSetting = createPercentSetting("wetDilution", "DILUTION");
    const chargeSetting = createPercentSetting("wetCharge", "CHARGE");
    const attackSetting = createPercentSetting("wetAttack", "ATTACK");
    const wetnessJitterSetting = createPercentSetting("wetnessJitter", "WETNESS JITTER");

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(
      selectedName,
      dilutionSetting,
      chargeSetting,
      attackSetting,
      wetnessJitterSetting,
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

  function createToggleSetting({ key, label, onChange }) {
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
      onChange?.(next);
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
    const isMinDistanceCustom = draftBrushSettings.taperMinDistanceEnabled === true;
    const taperTipDisplayValue = Math.round(
      clamp((clamp(draftBrushSettings.taperTip, taperTipRealMin, 1) - taperTipRealMin) / (1 - taperTipRealMin), 0, 1) * 100,
    );

    if (!isMinDistanceCustom) {
      draftBrushSettings.taperMinDistance = defaultTaperMinDistance;
    }

    const linkToggle = createToggleSetting({
      key: "taperLinkSizes",
      label: "LINK TIP SIZES",
    });
    const minDistanceToggle = createToggleSetting({
      key: "taperMinDistanceEnabled",
      label: "CUSTOM MIN DISTANCE",
      onChange: (isActive) => {
        if (!isActive) {
          draftBrushSettings.taperMinDistance = defaultTaperMinDistance;
        }

        renderTaperSettings();
      },
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
      value: Math.round(clamp(isMinDistanceCustom ? draftBrushSettings.taperMinDistance : defaultTaperMinDistance, 0, 300)),
      unit: "PX",
      toSetting: (displayValue) => displayValue,
      toDisplay: (displayValue) => Math.round(displayValue),
      disabled: !isMinDistanceCustom,
    });
    const tipSetting = createRangeSetting({
      key: "taperTip",
      label: "TIP",
      min: 0,
      max: 100,
      step: 1,
      value: taperTipDisplayValue,
      unit: "%",
      toSetting: (displayValue) => taperTipRealMin + (displayValue / 100) * (1 - taperTipRealMin),
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
      minDistanceToggle,
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

    if (selectedCategory === "SHAPE") {
      renderShapeSettings();
      return;
    }

    if (selectedCategory === "GRAIN") {
      renderGrainSettings();
      return;
    }

    if (selectedCategory === "RENDERING") {
      renderRenderingSettings();
      return;
    }

    if (selectedCategory === "COLOR DYNAMICS") {
      renderColorDynamicsSettings();
      return;
    }

    if (selectedCategory === "WET MIX") {
      renderWetMixSettings();
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
      closeGrainBlendModeControl();
      closeShapeEditor();
      closeGrainEditor();
      destroyPreviewCanvas();
      brushStudio.hidden = true;
      window.dispatchEvent(
        new CustomEvent("cbo:brush-settings-preview-change", {
          detail: {
            source: "brush-studio",
            settings: null,
          },
        }),
      );
    }
  }

  window.CBO.openBrushStudio = openBrushStudio;
  window.CBO.closeBrushStudio = closeBrushStudio;

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

    if (grainBlendModeOpen && !target.closest(".brush-studio-grain-blend-outline")) {
      closeGrainBlendModeControl();
    }

    const clickedInsideBrushStudio = event.composedPath().includes(brushStudio);

    if (brushStudio && !brushStudio.hidden && !clickedInsideBrushStudio) {
      closeBrushStudio();
    }
  });

  selectionColumn?.addEventListener(
    "wheel",
    (event) => {
      if (!grainBlendModeOpen) {
        return;
      }

      const target = event.target;

      if (target instanceof Element && target.closest(".brush-studio-grain-blend-outline-box")) {
        return;
      }

      event.preventDefault();
    },
    { capture: true, passive: false },
  );

  cancelButton?.addEventListener("click", () => {
    resetDraftBrushSettings();
    closeBrushStudio();
  });
  confirmButton?.addEventListener("click", () => {
    saveDraftBrushSettings();
    closeBrushStudio();
  });
  shapeImportButton?.addEventListener("click", () => {
    shapeInput?.click();
  });
  shapeInvertButton?.addEventListener("click", () => {
    void invertShapeAlpha();
  });
  shapeInput?.addEventListener("change", () => {
    void importShapeAlpha(shapeInput.files?.[0]);
  });
  shapeCancelButton?.addEventListener("click", closeShapeEditor);
  shapeAcceptButton?.addEventListener("click", acceptShapeEditor);
  grainImportButton?.addEventListener("click", () => {
    grainInput?.click();
  });
  grainInvertButton?.addEventListener("click", () => {
    void invertGrainTexture();
  });
  grainInput?.addEventListener("change", () => {
    void importGrainTexture(grainInput.files?.[0]);
  });
  grainCancelButton?.addEventListener("click", closeGrainEditor);
  grainAcceptButton?.addEventListener("click", acceptGrainEditor);

};
