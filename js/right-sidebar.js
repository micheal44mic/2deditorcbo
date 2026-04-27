window.CBO = window.CBO || {};

window.CBO.initRightSidebar = function initRightSidebar() {
  const panel = document.querySelector(".right-panel");

  if (!panel || panel.dataset.rightSidebarReady === "true") {
    return;
  }

  panel.dataset.rightSidebarReady = "true";

  const collapsePlusIcon = `
    <svg class="text-sidebar-collapse-svg lucide lucide-plus-icon lucide-plus" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  `;
  const collapseMinusIcon = `
    <svg class="text-sidebar-collapse-svg lucide lucide-minus-icon lucide-minus" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  `;
  const textTransformModes = ["CUSTOM", "DISTORT", "CIRCLE", "ANGLE", "ARCH", "RISE", "WAVE", "FLAG"];
  const parametricTransformModes = ["ARCH", "WAVE", "FLAG", "ANGLE", "RISE", "CIRCLE"];
  const transformButtons = textTransformModes
    .map((mode) => `
      <button class="text-sidebar-transform-choice" type="button" aria-pressed="false" data-text-transform-mode="${mode}">
        ${mode}
      </button>
    `)
    .join("");

  panel.innerHTML = `
    <div class="right-sidebar-content">
      <div class="right-sidebar-actions right-sidebar-section" aria-label="User actions">
        <button class="right-sidebar-avatar" type="button" aria-label="User profile" data-tooltip="PROFILE">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button class="right-sidebar-share-button" type="button" data-tooltip="SHARE">SHARE</button>
      </div>
      <label class="right-sidebar-project-field right-sidebar-section">
        <span class="right-sidebar-project-label">Project name</span>
        <span class="right-sidebar-project-input-wrap">
          <input class="right-sidebar-project-input" type="text" aria-label="Project name" placeholder="Untitled" autocomplete="off" spellcheck="false" />
        </span>
      </label>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text content" data-text-panel data-text-content-panel hidden>
        <div class="text-sidebar-header">
          <h2 class="text-sidebar-title">TEXT CONTENT</h2>
        </div>
        <label class="text-sidebar-field text-sidebar-text-field">
          <input class="text-sidebar-text-input" type="text" autocomplete="off" spellcheck="false" data-text-content />
        </label>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text layer" data-text-panel data-text-layer-panel hidden>
        <div class="text-sidebar-header">
          <h2 class="text-sidebar-title">LAYER</h2>
        </div>
        <label class="text-sidebar-control">
          <span class="text-sidebar-control-header">
            <span class="text-sidebar-control-label">OPACITY</span>
            <span class="text-sidebar-control-value" data-text-opacity-value>100%</span>
          </span>
          <input class="text-sidebar-range" type="range" min="0" max="100" step="1" aria-label="Text layer opacity" data-text-opacity />
        </label>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text colors" data-text-panel data-text-colors-panel hidden>
        <div class="text-sidebar-header">
          <h2 class="text-sidebar-title">TEXT COLORS</h2>
        </div>
        <div class="text-sidebar-color-row text-sidebar-color-row-wide">
          <label class="text-sidebar-color-swatch" aria-label="Fill color" data-text-color-swatch>
            <input class="text-sidebar-native-color" type="color" data-text-color-picker />
          </label>
          <input class="text-sidebar-hex-input" type="text" value="#E4E2E4" maxlength="7" spellcheck="false" aria-label="Text hex color" data-text-color-hex />
          <span class="text-sidebar-color-opacity">100%</span>
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text border" data-text-panel data-text-border-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="false" aria-pressed="false" data-text-border-toggle>
          <span class="text-sidebar-title">BORDER</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-border-icon>${collapsePlusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-border-body hidden>
          <div class="text-sidebar-color-row text-sidebar-color-row-wide">
            <label class="text-sidebar-color-swatch" aria-label="Border color" data-text-border-color-swatch>
              <input class="text-sidebar-native-color" type="color" data-text-border-color-picker />
            </label>
            <input class="text-sidebar-hex-input" type="text" value="#000000" maxlength="7" spellcheck="false" aria-label="Border hex color" data-text-border-color-hex />
            <span class="text-sidebar-color-opacity">100%</span>
          </div>
          <label class="text-sidebar-control">
            <span class="text-sidebar-control-header">
              <span class="text-sidebar-control-label">BORDER WEIGHT</span>
              <span class="text-sidebar-control-value" data-text-border-width-value>5.00</span>
            </span>
            <input class="text-sidebar-range" type="range" min="0" max="20" step="0.5" aria-label="Border weight" data-text-border-width />
          </label>
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Drop shadow" data-text-panel data-text-shadow-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="false" aria-pressed="false" data-text-shadow-toggle>
          <span class="text-sidebar-title">DROP SHADOW</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-shadow-icon>${collapsePlusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-shadow-body hidden>
          <label class="text-sidebar-toggle">
            <span class="text-sidebar-toggle-label">SOLID 3D BLOCK</span>
            <button class="text-sidebar-toggle-button" type="button" aria-pressed="true" data-text-shadow-solid>
              <span class="text-sidebar-toggle-knob"></span>
            </button>
          </label>
          <div class="text-sidebar-color-row text-sidebar-color-row-wide">
            <label class="text-sidebar-color-swatch" aria-label="Shadow color" data-text-shadow-color-swatch>
              <input class="text-sidebar-native-color" type="color" data-text-shadow-color-picker />
            </label>
            <input class="text-sidebar-hex-input" type="text" value="#DB1A5A" maxlength="7" spellcheck="false" aria-label="Shadow hex color" data-text-shadow-color-hex />
            <span class="text-sidebar-color-opacity">100%</span>
          </div>
          <label class="text-sidebar-control">
            <span class="text-sidebar-control-header">
              <span class="text-sidebar-control-label">OFFSET</span>
              <span class="text-sidebar-control-value" data-text-shadow-offset-value>25</span>
            </span>
            <input class="text-sidebar-range" type="range" min="0" max="100" step="1" aria-label="Shadow offset" data-text-shadow-offset />
          </label>
          <label class="text-sidebar-control">
            <span class="text-sidebar-control-header">
              <span class="text-sidebar-control-label">ANGLE</span>
              <span class="text-sidebar-control-value" data-text-shadow-angle-value>45 deg</span>
            </span>
            <input class="text-sidebar-range" type="range" min="0" max="360" step="1" aria-label="Shadow angle" data-text-shadow-angle />
          </label>
          <label class="text-sidebar-control" data-text-shadow-blur-control>
            <span class="text-sidebar-control-header">
              <span class="text-sidebar-control-label">BLUR AMOUNT</span>
              <span class="text-sidebar-control-value" data-text-shadow-blur-value>0</span>
            </span>
            <input class="text-sidebar-range" type="range" min="0" max="50" step="1" aria-label="Shadow blur" data-text-shadow-blur />
          </label>
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text style" data-text-panel data-text-style-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="true" aria-pressed="true" data-text-style-toggle>
          <span class="text-sidebar-title">TEXT STYLE</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-style-icon>${collapseMinusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-style-body>
          <label class="text-sidebar-field">
            <span class="text-sidebar-field-label">FONT</span>
            <select class="text-sidebar-select" data-text-font>
              <option value="roboto">Roboto Black</option>
              <option value="oswald">Oswald Bold</option>
            </select>
          </label>
          <div class="text-sidebar-grid">
            <label class="text-sidebar-field">
              <span class="text-sidebar-field-label">SIZE</span>
              <input class="text-sidebar-number" type="number" min="48" max="260" step="1" data-text-size aria-label="Text size" />
            </label>
            <label class="text-sidebar-field">
              <span class="text-sidebar-field-label">WEIGHT</span>
              <select class="text-sidebar-select" data-text-weight>
                <option value="900">Black</option>
                <option value="700">Bold</option>
                <option value="400">Regular</option>
              </select>
            </label>
          </div>
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text transformation" data-text-panel data-text-transformation-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="false" aria-pressed="false" data-text-transformation-toggle>
          <span class="text-sidebar-title">TRANSFORMATION</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-transformation-icon>${collapsePlusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-transformation-body hidden>
          <div class="text-sidebar-transform-grid" role="group" aria-label="Text transformation mode">
            ${transformButtons}
          </div>
          <div class="text-sidebar-amount-controls" data-text-transform-amount-controls hidden>
            <label class="text-sidebar-control">
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-control-label">AMOUNT</span>
                <span class="text-sidebar-control-value" data-text-transform-amount-value>50%</span>
              </span>
              <input class="text-sidebar-range" type="range" min="-100" max="100" step="1" aria-label="Transformation amount" data-text-transform-amount />
            </label>
          </div>
          <button class="text-sidebar-wide-button" type="button" data-text-transform-reset hidden>RESET GABBIA</button>
        </div>
      </section>
      <section class="smudge-sidebar right-sidebar-section" aria-label="Smudge settings" data-smudge-sidebar hidden>
        <div class="smudge-sidebar-header">
          <h2 class="smudge-sidebar-title">SMUDGE</h2>
          <button class="smudge-sidebar-reset" type="button" data-smudge-reset>RESET</button>
        </div>
        <div class="smudge-sidebar-controls" data-smudge-controls></div>
        <label class="smudge-sidebar-toggle">
          <span class="smudge-sidebar-toggle-label">PRESSURE</span>
          <button class="smudge-sidebar-toggle-button" type="button" aria-pressed="true" data-smudge-pressure>
            <span class="smudge-sidebar-toggle-knob"></span>
          </button>
        </label>
      </section>
    </div>
  `;

  const projectInput = panel.querySelector(".right-sidebar-project-input");
  const textPanels = Array.from(panel.querySelectorAll("[data-text-panel]"));
  const textContentInput = panel.querySelector("[data-text-content]");
  const textOpacityInput = panel.querySelector("[data-text-opacity]");
  const textOpacityValue = panel.querySelector("[data-text-opacity-value]");
  const textColorSwatch = panel.querySelector("[data-text-color-swatch]");
  const textColorPicker = panel.querySelector("[data-text-color-picker]");
  const textColorHexInput = panel.querySelector("[data-text-color-hex]");
  const textBorderToggle = panel.querySelector("[data-text-border-toggle]");
  const textBorderIcon = panel.querySelector("[data-text-border-icon]");
  const textBorderBody = panel.querySelector("[data-text-border-body]");
  const textBorderColorSwatch = panel.querySelector("[data-text-border-color-swatch]");
  const textBorderColorPicker = panel.querySelector("[data-text-border-color-picker]");
  const textBorderColorHexInput = panel.querySelector("[data-text-border-color-hex]");
  const textBorderWidthInput = panel.querySelector("[data-text-border-width]");
  const textBorderWidthValue = panel.querySelector("[data-text-border-width-value]");
  const textShadowToggle = panel.querySelector("[data-text-shadow-toggle]");
  const textShadowIcon = panel.querySelector("[data-text-shadow-icon]");
  const textShadowBody = panel.querySelector("[data-text-shadow-body]");
  const textShadowSolidButton = panel.querySelector("[data-text-shadow-solid]");
  const textShadowColorSwatch = panel.querySelector("[data-text-shadow-color-swatch]");
  const textShadowColorPicker = panel.querySelector("[data-text-shadow-color-picker]");
  const textShadowColorHexInput = panel.querySelector("[data-text-shadow-color-hex]");
  const textShadowOffsetInput = panel.querySelector("[data-text-shadow-offset]");
  const textShadowOffsetValue = panel.querySelector("[data-text-shadow-offset-value]");
  const textShadowAngleInput = panel.querySelector("[data-text-shadow-angle]");
  const textShadowAngleValue = panel.querySelector("[data-text-shadow-angle-value]");
  const textShadowBlurInput = panel.querySelector("[data-text-shadow-blur]");
  const textShadowBlurControl = panel.querySelector("[data-text-shadow-blur-control]");
  const textShadowBlurValue = panel.querySelector("[data-text-shadow-blur-value]");
  const textStyleToggle = panel.querySelector("[data-text-style-toggle]");
  const textStyleIcon = panel.querySelector("[data-text-style-icon]");
  const textStyleBody = panel.querySelector("[data-text-style-body]");
  const textFontSelect = panel.querySelector("[data-text-font]");
  const textWeightSelect = panel.querySelector("[data-text-weight]");
  const textSizeInput = panel.querySelector("[data-text-size]");
  const textTransformationToggle = panel.querySelector("[data-text-transformation-toggle]");
  const textTransformationIcon = panel.querySelector("[data-text-transformation-icon]");
  const textTransformationBody = panel.querySelector("[data-text-transformation-body]");
  const textTransformModeButtons = Array.from(panel.querySelectorAll("[data-text-transform-mode]"));
  const textTransformAmountControls = panel.querySelector("[data-text-transform-amount-controls]");
  const textTransformAmountInput = panel.querySelector("[data-text-transform-amount]");
  const textTransformAmountValue = panel.querySelector("[data-text-transform-amount-value]");
  const textTransformResetButton = panel.querySelector("[data-text-transform-reset]");
  const smudgeSidebar = panel.querySelector("[data-smudge-sidebar]");
  const smudgeControls = panel.querySelector("[data-smudge-controls]");
  const smudgeReset = panel.querySelector("[data-smudge-reset]");
  const pressureButton = panel.querySelector("[data-smudge-pressure]");
  const storageKey = "cbo-project-name";
  const fallbackSmudgeSettings = {
    radius: 34,
    opacity: 0.78,
    hardness: 0.35,
    spacing: 0.03,
    drag: 0.92,
    pressureAffectsStrength: true,
  };
  const smudgeControlDefs = [
    { key: "radius", label: "SIZE", min: 1, max: 120, step: 1, unit: "PX", fromDisplay: (value) => value, toDisplay: (value) => Math.round(value) },
    { key: "opacity", label: "OPACITY", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "hardness", label: "HARDNESS", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "spacing", label: "SPACING", min: 1, max: 12, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "drag", label: "DRAG", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
  ];
  const smudgeControlElements = new Map();
  let currentToolMode = "";
  let isTextBorderOpen = true;
  let isTextShadowOpen = true;
  let isTextStyleOpen = true;
  let isTextTransformationOpen = false;

  if (projectInput) {
    projectInput.value = window.localStorage.getItem(storageKey) || "";
    projectInput.addEventListener("input", () => {
      window.localStorage.setItem(storageKey, projectInput.value);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function normalizeHexInput(value) {
    const trimmed = String(value || "").trim();
    const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex
        .split("")
        .map((character) => character + character)
        .join("")
        .toUpperCase()}`;
    }

    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return null;
    }

    return `#${hex.toUpperCase()}`;
  }

  function getLayerModel() {
    return window.CBO.documentLayerModel || null;
  }

  function getActiveTextLayer() {
    const layer = getLayerModel()?.getActiveLayer?.();

    return layer?.type === "text" ? layer : null;
  }

  function normalizeTextMode(warp = {}) {
    const mode = String(warp.mode || "").trim().toUpperCase();

    if (textTransformModes.includes(mode)) {
      return mode;
    }

    return warp.enabled === true ? "DISTORT" : "CUSTOM";
  }

  function isTextContextVisible() {
    return currentToolMode === "text" && Boolean(getActiveTextLayer());
  }

  function getTextLayerPatch(updater) {
    const layer = getActiveTextLayer();

    if (!layer) {
      return null;
    }

    return typeof updater === "function" ? updater(layer) : updater;
  }

  function updateActiveTextLayer(updater, source = "text-sidebar") {
    const layer = getActiveTextLayer();
    const patch = getTextLayerPatch(updater);

    if (!layer || !patch) {
      return;
    }

    getLayerModel()?.updateLayer?.(layer.id, patch, { source });
  }

  function updateRangeProgress(input, min, max, variableName = "--text-sidebar-range-progress") {
    if (!input) {
      return;
    }

    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty(variableName, `${progress}%`);
  }

  function showTextSettings(isVisible) {
    textPanels.forEach((section) => {
      section.hidden = !isVisible;
    });
  }

  function setCollapseState(toggle, body, icon, isOpen) {
    if (body) {
      body.hidden = !isOpen;
    }

    if (toggle) {
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-pressed", String(isOpen));
      toggle.classList.toggle("active", isOpen);
    }

    if (icon) {
      icon.innerHTML = isOpen ? collapseMinusIcon : collapsePlusIcon;
    }
  }

  function getFontFamily(fontKey) {
    return fontKey === "oswald"
      ? "Oswald, Arial, sans-serif"
      : "Roboto Black, Roboto, Inter, Arial, sans-serif";
  }

  function getFontWeight(fontKey, fallbackWeight) {
    if (Number.isFinite(Number(fallbackWeight))) {
      return Number(fallbackWeight);
    }

    return fontKey === "oswald" ? 700 : 900;
  }

  function setTextBorderOpen(isOpen) {
    isTextBorderOpen = isOpen;
    setCollapseState(textBorderToggle, textBorderBody, textBorderIcon, isTextBorderOpen);
  }

  function setTextShadowOpen(isOpen) {
    isTextShadowOpen = isOpen;
    setCollapseState(textShadowToggle, textShadowBody, textShadowIcon, isTextShadowOpen);
  }

  function setTextStyleOpen(isOpen) {
    isTextStyleOpen = isOpen;
    setCollapseState(textStyleToggle, textStyleBody, textStyleIcon, isTextStyleOpen);
  }

  function setTextTransformationOpen(isOpen) {
    const mode = normalizeTextMode(getActiveTextLayer()?.warp);

    isTextTransformationOpen = isOpen;
    window.CBO.textTransformationActive = isTextTransformationOpen && mode === "DISTORT";
    setCollapseState(
      textTransformationToggle,
      textTransformationBody,
      textTransformationIcon,
      isTextTransformationOpen,
    );
    window.dispatchEvent(
      new CustomEvent("cbo:text-transformation-mode-change", {
        detail: { active: window.CBO.textTransformationActive },
      }),
    );
    window.CBO.brushEngine?.draw?.();
  }

  function resetTextBorder() {
    updateActiveTextLayer((layer) => ({
      style: {
        ...(layer.style || {}),
        strokeColor: [0, 0, 0, 1],
        strokeWidth: 0,
      },
    }), "text-border-reset");
  }

  function resetTextShadow() {
    updateActiveTextLayer((layer) => ({
      shadow: {
        ...(layer.shadow || {}),
        solid: true,
        color: window.CBO.hexToUnitRgba?.("#DB1A5A", [0.859, 0.102, 0.353, 1]) || [0.859, 0.102, 0.353, 1],
        offset: 0,
        angle: 45,
        blur: 0,
      },
    }), "text-shadow-reset");
  }

  function resetTextStyle() {
    updateActiveTextLayer((layer) => ({
      font: {
        ...(layer.font || {}),
        key: "roboto",
        family: getFontFamily("roboto"),
        size: 163,
        weight: 900,
        style: "normal",
      },
    }), "text-style-reset");
  }

  function resetTextTransformation() {
    updateActiveTextLayer(() => ({
      warp: {
        enabled: false,
        mode: "CUSTOM",
        amount: 0.5,
      },
    }), "text-transform-collapse-reset");
    window.CBO.textTransformationActive = false;
    window.CBO.brushEngine?.draw?.();
  }

  function syncShadowControls(shadow) {
    const isSolid = shadow.solid !== false;

    if (textShadowSolidButton) {
      textShadowSolidButton.classList.toggle("active", isSolid);
      textShadowSolidButton.setAttribute("aria-pressed", String(isSolid));
    }

    if (textShadowBlurInput) {
      textShadowBlurInput.disabled = isSolid;
      textShadowBlurInput.classList.toggle("text-sidebar-control-disabled", isSolid);
    }

    textShadowBlurControl?.classList.toggle("text-sidebar-control-disabled", isSolid);
  }

  function syncTextControls() {
    const layer = getActiveTextLayer();
    const shouldShowTextContext = isTextContextVisible();

    showTextSettings(shouldShowTextContext);

    if (!layer || !shouldShowTextContext) {
      if (isTextTransformationOpen) {
        setTextTransformationOpen(false);
      }
      return;
    }

    const opacity = clamp(Math.round((Number(layer.opacity) || 0) * 100), 0, 100);
    const fillHex = window.CBO.unitRgbaToHex?.(layer.style?.fillColor, "#E4E2E4") || "#E4E2E4";
    const borderHex = window.CBO.unitRgbaToHex?.(layer.style?.strokeColor, "#000000") || "#000000";
    const shadowHex = window.CBO.unitRgbaToHex?.(layer.shadow?.color, "#DB1A5A") || "#DB1A5A";
    const borderWidth = clamp(layer.style?.strokeWidth ?? 0, 0, 20);
    const shadow = {
      solid: layer.shadow?.solid !== false,
      offset: clamp(layer.shadow?.offset ?? 0, 0, 100),
      angle: clamp(layer.shadow?.angle ?? 0, 0, 360),
      blur: clamp(layer.shadow?.blur ?? 0, 0, 50),
    };
    const mode = normalizeTextMode(layer.warp);
    const amount = Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0.5;
    const amountPercent = Math.round(amount * 100);
    const fontKey = ["roboto", "oswald"].includes(layer.font?.key) ? layer.font.key : "roboto";
    const fontWeight = String(getFontWeight(fontKey, layer.font?.weight));

    if (textContentInput && document.activeElement !== textContentInput) {
      textContentInput.value = layer.text || "";
    }

    if (textOpacityInput) {
      textOpacityInput.value = String(opacity);
      updateRangeProgress(textOpacityInput, 0, 100);
    }

    if (textOpacityValue) {
      textOpacityValue.textContent = `${opacity}%`;
    }

    if (textColorSwatch) {
      textColorSwatch.style.setProperty("--text-sidebar-color", fillHex);
    }

    if (textColorPicker && textColorPicker.value.toUpperCase() !== fillHex) {
      textColorPicker.value = fillHex;
    }

    if (textColorHexInput && document.activeElement !== textColorHexInput) {
      textColorHexInput.value = fillHex;
    }

    if (textBorderColorSwatch) {
      textBorderColorSwatch.style.setProperty("--text-sidebar-color", borderHex);
    }

    if (textBorderColorPicker && textBorderColorPicker.value.toUpperCase() !== borderHex) {
      textBorderColorPicker.value = borderHex;
    }

    if (textBorderColorHexInput && document.activeElement !== textBorderColorHexInput) {
      textBorderColorHexInput.value = borderHex;
    }

    if (textBorderWidthInput) {
      textBorderWidthInput.value = String(borderWidth);
      updateRangeProgress(textBorderWidthInput, 0, 20);
    }

    if (textBorderWidthValue) {
      textBorderWidthValue.textContent = borderWidth.toFixed(2);
    }

    if (textShadowColorSwatch) {
      textShadowColorSwatch.style.setProperty("--text-sidebar-color", shadowHex);
    }

    if (textShadowColorPicker && textShadowColorPicker.value.toUpperCase() !== shadowHex) {
      textShadowColorPicker.value = shadowHex;
    }

    if (textShadowColorHexInput && document.activeElement !== textShadowColorHexInput) {
      textShadowColorHexInput.value = shadowHex;
    }

    if (textShadowOffsetInput) {
      textShadowOffsetInput.value = String(shadow.offset);
      updateRangeProgress(textShadowOffsetInput, 0, 100);
    }

    if (textShadowOffsetValue) {
      textShadowOffsetValue.textContent = String(Math.round(shadow.offset));
    }

    if (textShadowAngleInput) {
      textShadowAngleInput.value = String(shadow.angle);
      updateRangeProgress(textShadowAngleInput, 0, 360);
    }

    if (textShadowAngleValue) {
      textShadowAngleValue.textContent = `${Math.round(shadow.angle)} deg`;
    }

    if (textShadowBlurInput) {
      textShadowBlurInput.value = String(shadow.blur);
      updateRangeProgress(textShadowBlurInput, 0, 50);
    }

    if (textShadowBlurValue) {
      textShadowBlurValue.textContent = String(Math.round(shadow.blur));
    }

    syncShadowControls(shadow);

    if (textFontSelect) {
      textFontSelect.value = fontKey;
    }

    if (textWeightSelect) {
      textWeightSelect.value = fontWeight;
    }

    if (textSizeInput && document.activeElement !== textSizeInput) {
      textSizeInput.value = String(Math.round(layer.font?.size || 163));
    }

    textTransformModeButtons.forEach((button) => {
      const isActive = button.dataset.textTransformMode === mode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (textTransformAmountControls) {
      textTransformAmountControls.hidden = !parametricTransformModes.includes(mode);
    }

    if (textTransformAmountInput) {
      textTransformAmountInput.value = String(amountPercent);
      updateRangeProgress(textTransformAmountInput, -100, 100);
    }

    if (textTransformAmountValue) {
      textTransformAmountValue.textContent = `${amountPercent}%`;
    }

    if (textTransformResetButton) {
      textTransformResetButton.hidden = mode !== "DISTORT";
    }

    window.CBO.textTransformationActive = isTextTransformationOpen && mode === "DISTORT";
  }

  function applyTextHexColor(hexColor) {
    const normalized = normalizeHexInput(hexColor);

    if (!normalized) {
      return false;
    }

    updateActiveTextLayer((layer) => ({
      style: {
        ...(layer.style || {}),
        fillColor: window.CBO.hexToUnitRgba?.(normalized, [1, 1, 1, 1]) || [1, 1, 1, 1],
      },
    }), "text-color");

    return true;
  }

  function applyTextBorderHexColor(hexColor) {
    const normalized = normalizeHexInput(hexColor);

    if (!normalized) {
      return false;
    }

    updateActiveTextLayer((layer) => ({
      style: {
        ...(layer.style || {}),
        strokeColor: window.CBO.hexToUnitRgba?.(normalized, [0, 0, 0, 1]) || [0, 0, 0, 1],
      },
    }), "text-border-color");

    return true;
  }

  function applyTextShadowHexColor(hexColor) {
    const normalized = normalizeHexInput(hexColor);

    if (!normalized) {
      return false;
    }

    updateActiveTextLayer((layer) => ({
      shadow: {
        ...(layer.shadow || {}),
        color: window.CBO.hexToUnitRgba?.(normalized, [0.859, 0.102, 0.353, 1]) || [0.859, 0.102, 0.353, 1],
      },
    }), "text-shadow-color");

    return true;
  }

  function updateTextBorderWidth(value) {
    const strokeWidth = clamp(value, 0, 20);

    updateActiveTextLayer((layer) => ({
      style: {
        ...(layer.style || {}),
        strokeWidth,
      },
    }), "text-border-width");
  }

  function updateTextShadowValue(key, value) {
    const limits = {
      offset: [0, 100],
      angle: [0, 360],
      blur: [0, 50],
    }[key] || [0, 100];

    updateActiveTextLayer((layer) => ({
      shadow: {
        ...(layer.shadow || {}),
        [key]: clamp(value, limits[0], limits[1]),
      },
    }), `text-shadow-${key}`);
  }

  function updateTextFontKey(fontKey) {
    updateActiveTextLayer((layer) => ({
      font: {
        ...(layer.font || {}),
        key: fontKey,
        family: getFontFamily(fontKey),
        weight: getFontWeight(fontKey, layer.font?.weight),
      },
    }), "text-font");
  }

  function updateTextWeight(weight) {
    const numericWeight = Number.parseInt(weight, 10);

    updateActiveTextLayer((layer) => ({
      font: {
        ...(layer.font || {}),
        weight: Number.isFinite(numericWeight) ? numericWeight : 900,
      },
    }), "text-weight");
  }

  function updateTextSize(value) {
    const size = clamp(value, 48, 260);

    updateActiveTextLayer((layer) => ({
      font: {
        ...(layer.font || {}),
        size,
      },
    }), "text-size");
  }

  function updateTextTransformMode(mode) {
    if (!textTransformModes.includes(mode)) {
      return;
    }

    updateActiveTextLayer((layer) => ({
      warp: {
        ...(layer.warp || {}),
        enabled: mode !== "CUSTOM",
        mode,
        amount: Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0.5,
      },
    }), "text-transform-mode");

    if (mode === "DISTORT") {
      setTextTransformationOpen(true);
    } else {
      window.CBO.textTransformationActive = false;
      window.CBO.brushEngine?.draw?.();
    }
  }

  function updateTextTransformAmount(value) {
    const amount = clamp(value, -100, 100) / 100;

    updateActiveTextLayer((layer) => ({
      warp: {
        ...(layer.warp || {}),
        amount,
      },
    }), "text-transform-amount");
  }

  function resetTextDistortEnvelope() {
    updateActiveTextLayer((layer) => ({
      warp: {
        enabled: true,
        mode: "DISTORT",
        amount: Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0.5,
      },
    }), "text-transform-reset");
    setTextTransformationOpen(true);
  }

  function getDefaultSmudgeSettings() {
    return {
      ...fallbackSmudgeSettings,
      ...(window.CBO.SmudgeBrushes?.wetPaint || {}),
    };
  }

  function getSmudgeSettings() {
    return {
      ...getDefaultSmudgeSettings(),
      ...(window.CBO.smudgeSettings || {}),
    };
  }

  function dispatchSmudgeSettings(settings) {
    window.CBO.smudgeSettings = { ...settings };
    window.dispatchEvent(
      new CustomEvent("cbo:paint-settings-change", {
        detail: {
          tool: "smudge",
          settings: { ...settings },
        },
      }),
    );
  }

  function updateSmudgeRangeProgress(input, min, max) {
    updateRangeProgress(input, min, max, "--smudge-sidebar-range-progress");
  }

  function syncSmudgeControls() {
    const settings = getSmudgeSettings();

    smudgeControlDefs.forEach((definition) => {
      const elements = smudgeControlElements.get(definition.key);

      if (!elements) {
        return;
      }

      const displayValue = clamp(
        definition.toDisplay(settings[definition.key]),
        definition.min,
        definition.max,
      );

      elements.input.value = String(displayValue);
      elements.value.textContent = String(Math.round(displayValue));
      updateSmudgeRangeProgress(elements.input, definition.min, definition.max);
    });

    if (pressureButton) {
      const isActive = settings.pressureAffectsStrength !== false;

      pressureButton.classList.toggle("active", isActive);
      pressureButton.setAttribute("aria-pressed", String(isActive));
    }
  }

  function updateSmudgeSetting(key, value) {
    const definition = smudgeControlDefs.find((nextDefinition) => nextDefinition.key === key);

    if (!definition) {
      return;
    }

    const settings = getSmudgeSettings();
    const displayValue = clamp(value, definition.min, definition.max);

    settings[key] = definition.fromDisplay(displayValue);
    dispatchSmudgeSettings(settings);
    syncSmudgeControls();
  }

  function createSmudgeControl(definition) {
    const control = document.createElement("label");
    const header = document.createElement("span");
    const label = document.createElement("span");
    const valueWrap = document.createElement("span");
    const value = document.createElement("span");
    const unit = document.createElement("span");
    const input = document.createElement("input");

    control.className = "smudge-sidebar-control";
    header.className = "smudge-sidebar-control-header";
    label.className = "smudge-sidebar-control-label";
    valueWrap.className = "smudge-sidebar-control-value";
    value.className = "smudge-sidebar-control-number";
    unit.className = "smudge-sidebar-control-unit";
    input.className = "smudge-sidebar-range";

    label.textContent = definition.label;
    unit.textContent = definition.unit;
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.setAttribute("aria-label", definition.label);

    input.addEventListener("input", () => {
      updateSmudgeSetting(definition.key, input.value);
    });

    valueWrap.append(value, unit);
    header.append(label, valueWrap);
    control.append(header, input);
    smudgeControlElements.set(definition.key, { input, value });

    return control;
  }

  function showSmudgeSettings(isVisible) {
    if (!smudgeSidebar) {
      return;
    }

    smudgeSidebar.hidden = !isVisible;

    if (isVisible) {
      syncSmudgeControls();
    }
  }

  function normalizeToolName(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "smudge") {
      return "smudge";
    }

    return "";
  }

  textContentInput?.addEventListener("input", () => {
    updateActiveTextLayer({
      text: textContentInput.value,
      name: textContentInput.value.trim() || "Text",
    }, "text-content");
  });

  textOpacityInput?.addEventListener("input", () => {
    const opacity = clamp(textOpacityInput.value, 0, 100) / 100;

    updateActiveTextLayer({ opacity }, "text-opacity");
    syncTextControls();
  });

  textColorPicker?.addEventListener("input", () => {
    applyTextHexColor(textColorPicker.value);
  });

  textColorHexInput?.addEventListener("input", () => {
    applyTextHexColor(textColorHexInput.value);
  });

  textColorHexInput?.addEventListener("blur", () => {
    if (!applyTextHexColor(textColorHexInput.value)) {
      syncTextControls();
    }
  });

  textBorderToggle?.addEventListener("click", () => {
    if (isTextBorderOpen) {
      resetTextBorder();
      setTextBorderOpen(false);
      syncTextControls();
      return;
    }

    setTextBorderOpen(true);
  });

  textBorderColorPicker?.addEventListener("input", () => {
    applyTextBorderHexColor(textBorderColorPicker.value);
  });

  textBorderColorHexInput?.addEventListener("input", () => {
    applyTextBorderHexColor(textBorderColorHexInput.value);
  });

  textBorderColorHexInput?.addEventListener("blur", () => {
    if (!applyTextBorderHexColor(textBorderColorHexInput.value)) {
      syncTextControls();
    }
  });

  textBorderWidthInput?.addEventListener("input", () => {
    updateTextBorderWidth(textBorderWidthInput.value);
    syncTextControls();
  });

  textShadowToggle?.addEventListener("click", () => {
    if (isTextShadowOpen) {
      resetTextShadow();
      setTextShadowOpen(false);
      syncTextControls();
      return;
    }

    setTextShadowOpen(true);
  });

  textShadowSolidButton?.addEventListener("click", () => {
    updateActiveTextLayer((layer) => ({
      shadow: {
        ...(layer.shadow || {}),
        solid: layer.shadow?.solid === false,
      },
    }), "text-shadow-solid");
    syncTextControls();
  });

  textShadowColorPicker?.addEventListener("input", () => {
    applyTextShadowHexColor(textShadowColorPicker.value);
  });

  textShadowColorHexInput?.addEventListener("input", () => {
    applyTextShadowHexColor(textShadowColorHexInput.value);
  });

  textShadowColorHexInput?.addEventListener("blur", () => {
    if (!applyTextShadowHexColor(textShadowColorHexInput.value)) {
      syncTextControls();
    }
  });

  textShadowOffsetInput?.addEventListener("input", () => {
    updateTextShadowValue("offset", textShadowOffsetInput.value);
    syncTextControls();
  });

  textShadowAngleInput?.addEventListener("input", () => {
    updateTextShadowValue("angle", textShadowAngleInput.value);
    syncTextControls();
  });

  textShadowBlurInput?.addEventListener("input", () => {
    updateTextShadowValue("blur", textShadowBlurInput.value);
    syncTextControls();
  });

  textStyleToggle?.addEventListener("click", () => {
    if (isTextStyleOpen) {
      resetTextStyle();
      setTextStyleOpen(false);
      syncTextControls();
      return;
    }

    setTextStyleOpen(true);
  });

  textFontSelect?.addEventListener("change", () => {
    updateTextFontKey(textFontSelect.value);
    syncTextControls();
  });

  textWeightSelect?.addEventListener("change", () => {
    updateTextWeight(textWeightSelect.value);
    syncTextControls();
  });

  textSizeInput?.addEventListener("input", () => {
    updateTextSize(textSizeInput.value);
  });

  textTransformationToggle?.addEventListener("click", () => {
    if (isTextTransformationOpen) {
      resetTextTransformation();
      setTextTransformationOpen(false);
      syncTextControls();
      return;
    }

    setTextTransformationOpen(true);
  });

  textTransformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      updateTextTransformMode(button.dataset.textTransformMode);
      syncTextControls();
    });
  });

  textTransformAmountInput?.addEventListener("input", () => {
    updateTextTransformAmount(textTransformAmountInput.value);
    syncTextControls();
  });

  textTransformResetButton?.addEventListener("click", () => {
    resetTextDistortEnvelope();
    syncTextControls();
  });

  smudgeControlDefs.forEach((definition) => {
    smudgeControls?.append(createSmudgeControl(definition));
  });

  pressureButton?.addEventListener("click", () => {
    const settings = getSmudgeSettings();

    settings.pressureAffectsStrength = settings.pressureAffectsStrength === false;
    dispatchSmudgeSettings(settings);
    syncSmudgeControls();
  });

  smudgeReset?.addEventListener("click", () => {
    dispatchSmudgeSettings(getDefaultSmudgeSettings());
    syncSmudgeControls();
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();

    currentToolMode = label === "TYPE" || toolMode === "text" ? "text" : "";
    if (currentToolMode !== "text" && isTextTransformationOpen) {
      setTextTransformationOpen(false);
    }
    syncTextControls();
    showSmudgeSettings(normalizeToolName(event.detail?.toolMode || event.detail?.label) === "smudge");
  });

  window.addEventListener("cbo:document-layers-change", syncTextControls);

  const activeTool = document.querySelector("[data-tool].active");
  const activeToolDetail = activeTool ? {
    label: activeTool.getAttribute("aria-label") || "",
    syncGroup: activeTool.dataset.toolSync || "",
    toolMode: activeTool.dataset.toolMode || "",
  } : {};

  currentToolMode = String(activeToolDetail.toolMode || activeToolDetail.label).toLowerCase() === "text" ||
    String(activeToolDetail.label || "").toUpperCase() === "TYPE"
    ? "text"
    : "";
  showSmudgeSettings(normalizeToolName(activeToolDetail.toolMode || activeToolDetail.label) === "smudge");
  setTextBorderOpen(true);
  setTextShadowOpen(true);
  setTextStyleOpen(true);
  setTextTransformationOpen(false);
  syncTextControls();
  syncSmudgeControls();
};
