window.CBO = window.CBO || {};

window.CBO.initRightSidebar = function initRightSidebar() {
  const panel = document.querySelector(".right-panel");

  if (!panel || panel.dataset.rightSidebarReady === "true") {
    return;
  }

  panel.dataset.rightSidebarReady = "true";
  const textBorderPlusIcon = `
    <svg class="text-sidebar-collapse-svg lucide lucide-plus-icon lucide-plus" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  `;
  const textBorderMinusIcon = `
    <svg class="text-sidebar-collapse-svg lucide lucide-minus-icon lucide-minus" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  `;

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
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text layer" data-text-layer-panel hidden>
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
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text colors" data-text-colors-panel hidden>
        <div class="text-sidebar-header">
          <h2 class="text-sidebar-title">COLOR</h2>
        </div>
        <div class="text-sidebar-color-row">
          <button class="text-sidebar-color-swatch" type="button" aria-label="Text color" data-text-color-swatch></button>
          <input class="text-sidebar-hex-input" type="text" value="#FFFFFF" maxlength="7" spellcheck="false" aria-label="Text hex color" data-text-color-hex />
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text border" data-text-border-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="false" aria-pressed="false" data-text-border-toggle>
          <span class="text-sidebar-title">BORDER</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-border-icon>${textBorderPlusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-border-body hidden>
          <div class="text-sidebar-color-row">
            <button class="text-sidebar-color-swatch" type="button" aria-label="Border color" data-text-border-color-swatch></button>
            <input class="text-sidebar-hex-input" type="text" value="#000000" maxlength="7" spellcheck="false" aria-label="Border hex color" data-text-border-color-hex />
          </div>
          <label class="text-sidebar-field">
            <span class="text-sidebar-field-label">SIZE</span>
            <input class="text-sidebar-number" type="number" min="0" max="64" step="1" data-text-border-width aria-label="Border size" />
          </label>
        </div>
      </section>
      <section class="text-sidebar-panel right-sidebar-section" aria-label="Text transformation" data-text-transformation-panel hidden>
        <button class="text-sidebar-collapse-header" type="button" aria-expanded="false" aria-pressed="false" data-text-transformation-toggle>
          <span class="text-sidebar-title">TRANSFORMATION</span>
          <span class="text-sidebar-collapse-icon" aria-hidden="true" data-text-transformation-icon>${textBorderPlusIcon}</span>
        </button>
        <div class="text-sidebar-collapse-body" data-text-transformation-body hidden>
          <div class="text-sidebar-transform-grid" aria-hidden="true">
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
            <span class="text-sidebar-transform-square"></span>
          </div>
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
  const textPanels = Array.from(panel.querySelectorAll("[data-text-layer-panel], [data-text-colors-panel], [data-text-border-panel], [data-text-transformation-panel]"));
  const textOpacityInput = panel.querySelector("[data-text-opacity]");
  const textOpacityValue = panel.querySelector("[data-text-opacity-value]");
  const textColorSwatch = panel.querySelector("[data-text-color-swatch]");
  const textColorHexInput = panel.querySelector("[data-text-color-hex]");
  const textBorderToggle = panel.querySelector("[data-text-border-toggle]");
  const textBorderIcon = panel.querySelector("[data-text-border-icon]");
  const textBorderBody = panel.querySelector("[data-text-border-body]");
  const textBorderColorSwatch = panel.querySelector("[data-text-border-color-swatch]");
  const textBorderColorHexInput = panel.querySelector("[data-text-border-color-hex]");
  const textBorderWidthInput = panel.querySelector("[data-text-border-width]");
  const textTransformationToggle = panel.querySelector("[data-text-transformation-toggle]");
  const textTransformationIcon = panel.querySelector("[data-text-transformation-icon]");
  const textTransformationBody = panel.querySelector("[data-text-transformation-body]");
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
  let isTextBorderOpen = false;
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

  function updateTextRangeProgress(input, min, max) {
    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty("--text-sidebar-range-progress", `${progress}%`);
  }

  function showTextSettings(isVisible) {
    textPanels.forEach((section) => {
      section.hidden = !isVisible;
    });
  }

  function syncTextControls() {
    const layer = getActiveTextLayer();

    showTextSettings(isTextContextVisible());

    if (!layer || !isTextContextVisible()) {
      return;
    }

    const opacity = clamp(Math.round((Number(layer.opacity) || 0) * 100), 0, 100);
    const fillHex = window.CBO.unitRgbaToHex?.(layer.style?.fillColor, "#FFFFFF") || "#FFFFFF";
    const borderHex = window.CBO.unitRgbaToHex?.(layer.style?.strokeColor, "#000000") || "#000000";
    const borderWidth = clamp(layer.style?.strokeWidth ?? 0, 0, 64);

    if (textOpacityInput) {
      textOpacityInput.value = String(opacity);
      updateTextRangeProgress(textOpacityInput, 0, 100);
    }

    if (textOpacityValue) {
      textOpacityValue.textContent = `${opacity}%`;
    }

    if (textColorSwatch) {
      textColorSwatch.style.setProperty("--text-sidebar-color", fillHex);
    }

    if (textColorHexInput && textColorHexInput.value.toUpperCase() !== fillHex) {
      textColorHexInput.value = fillHex;
    }

    if (textBorderColorSwatch) {
      textBorderColorSwatch.style.setProperty("--text-sidebar-color", borderHex);
    }

    if (textBorderColorHexInput && textBorderColorHexInput.value.toUpperCase() !== borderHex) {
      textBorderColorHexInput.value = borderHex;
    }

    if (textBorderWidthInput) {
      textBorderWidthInput.value = String(Math.round(borderWidth));
    }
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

  function updateTextBorderWidth(value) {
    const strokeWidth = clamp(value, 0, 64);

    updateActiveTextLayer((layer) => ({
      style: {
        ...(layer.style || {}),
        strokeWidth,
      },
    }), "text-border-width");
  }

  function setTextBorderOpen(isOpen) {
    isTextBorderOpen = isOpen;

    if (textBorderBody) {
      textBorderBody.hidden = !isTextBorderOpen;
    }

    if (textBorderToggle) {
      textBorderToggle.setAttribute("aria-expanded", String(isTextBorderOpen));
      textBorderToggle.setAttribute("aria-pressed", String(isTextBorderOpen));
      textBorderToggle.classList.toggle("active", isTextBorderOpen);
    }

    if (textBorderIcon) {
      textBorderIcon.innerHTML = isTextBorderOpen ? textBorderMinusIcon : textBorderPlusIcon;
    }
  }

  function setTextTransformationOpen(isOpen) {
    isTextTransformationOpen = isOpen;

    if (textTransformationBody) {
      textTransformationBody.hidden = !isTextTransformationOpen;
    }

    if (textTransformationToggle) {
      textTransformationToggle.setAttribute("aria-expanded", String(isTextTransformationOpen));
      textTransformationToggle.setAttribute("aria-pressed", String(isTextTransformationOpen));
      textTransformationToggle.classList.toggle("active", isTextTransformationOpen);
    }

    if (textTransformationIcon) {
      textTransformationIcon.innerHTML = isTextTransformationOpen ? textBorderMinusIcon : textBorderPlusIcon;
    }
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

  function updateRangeProgress(input, min, max) {
    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty("--smudge-sidebar-range-progress", `${progress}%`);
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
      updateRangeProgress(elements.input, definition.min, definition.max);
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

  textOpacityInput?.addEventListener("input", () => {
    const opacity = clamp(textOpacityInput.value, 0, 100) / 100;

    updateActiveTextLayer({ opacity }, "text-opacity");
    syncTextControls();
  });

  textColorHexInput?.addEventListener("input", () => {
    applyTextHexColor(textColorHexInput.value);
  });

  textColorHexInput?.addEventListener("blur", () => {
    if (!applyTextHexColor(textColorHexInput.value)) {
      syncTextControls();
    }
  });

  textColorSwatch?.addEventListener("click", () => {
    textColorHexInput?.focus();
    textColorHexInput?.select();
  });

  textBorderToggle?.addEventListener("click", () => {
    setTextBorderOpen(!isTextBorderOpen);
  });

  textBorderColorHexInput?.addEventListener("input", () => {
    applyTextBorderHexColor(textBorderColorHexInput.value);
  });

  textBorderColorHexInput?.addEventListener("blur", () => {
    if (!applyTextBorderHexColor(textBorderColorHexInput.value)) {
      syncTextControls();
    }
  });

  textBorderColorSwatch?.addEventListener("click", () => {
    textBorderColorHexInput?.focus();
    textBorderColorHexInput?.select();
  });

  textBorderWidthInput?.addEventListener("input", () => {
    updateTextBorderWidth(textBorderWidthInput.value);
  });

  textTransformationToggle?.addEventListener("click", () => {
    setTextTransformationOpen(!isTextTransformationOpen);
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

  showSmudgeSettings(normalizeToolName(activeToolDetail.toolMode || activeToolDetail.label) === "smudge");
  setTextBorderOpen(false);
  setTextTransformationOpen(false);
  syncTextControls();
  syncSmudgeControls();
};
