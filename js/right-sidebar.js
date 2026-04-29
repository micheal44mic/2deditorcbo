window.CBO = window.CBO || {};

window.CBO.initRightSidebar = function initRightSidebar() {
  const panel = document.querySelector(".right-panel");

  if (!panel || panel.dataset.rightSidebarReady === "true") {
    return;
  }

  panel.dataset.rightSidebarReady = "true";
  panel.innerHTML = `
    <div class="right-sidebar-content">
      <div class="right-sidebar-actions right-sidebar-section" aria-label="User actions" data-right-sidebar-global>
        <button class="right-sidebar-avatar" type="button" aria-label="User profile" data-tooltip="PROFILE">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button class="right-sidebar-share-button" type="button" data-tooltip="SHARE">SHARE</button>
      </div>
      <label class="right-sidebar-project-field right-sidebar-section" data-right-sidebar-project>
        <span class="right-sidebar-project-label">Project name</span>
        <span class="right-sidebar-project-input-wrap">
          <input class="right-sidebar-project-input" type="text" aria-label="Project name" placeholder="Untitled" autocomplete="off" spellcheck="false" />
        </span>
      </label>
      <div class="text-sidebar" aria-label="Text settings" data-text-sidebar hidden>
        <section class="text-sidebar-section" aria-label="Text content">
          <div class="text-sidebar-heading-row">
            <h2 class="text-sidebar-title">Text</h2>
          </div>
          <label class="text-sidebar-text-field">
            <span class="text-sidebar-label">Content</span>
            <textarea class="text-sidebar-textarea" rows="3" autocomplete="off" spellcheck="false" data-text-content>BOIL THE OCEAN</textarea>
          </label>
        </section>
        <section class="text-sidebar-section" aria-label="Layer opacity">
          <div class="text-sidebar-heading-row">
            <h2 class="text-sidebar-title">Layer</h2>
          </div>
          <label class="text-sidebar-range-field">
            <span class="text-sidebar-control-header">
              <span class="text-sidebar-label">Opacity</span>
              <output class="text-sidebar-value-pill" data-text-opacity-value>100%</output>
            </span>
            <input class="text-sidebar-range" type="range" min="0" max="100" step="1" value="100" aria-label="Layer opacity" data-text-opacity />
          </label>
        </section>
        <section class="text-sidebar-section" aria-label="Text colors">
          <div class="text-sidebar-heading-row">
            <h2 class="text-sidebar-title">Text Colors</h2>
          </div>
          <label class="text-sidebar-color-row">
            <span class="text-sidebar-color-swatch" data-text-color-swatch>
              <input class="text-sidebar-color-input" type="color" value="#ffffff" aria-label="Text color" data-text-color-input />
            </span>
            <span class="text-sidebar-color-hex" data-text-color-hex>FFFFFF</span>
            <span class="text-sidebar-color-opacity">100%</span>
          </label>
          <button class="text-sidebar-palette-button" type="button">Browse Color Palettes</button>
        </section>
        <section class="text-sidebar-section text-sidebar-accordion-section" aria-label="Border" data-text-border-section>
          <button class="text-sidebar-accordion-header" type="button" aria-expanded="false" data-text-border-toggle>
            <span>Border</span>
            <span class="text-sidebar-heading-actions" aria-hidden="true">
              <svg class="text-sidebar-dots-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="7" cy="7" r="1.8" />
                <circle cx="17" cy="7" r="1.8" />
                <circle cx="7" cy="17" r="1.8" />
                <circle cx="17" cy="17" r="1.8" />
              </svg>
              <svg class="text-sidebar-section-icon text-sidebar-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
                <path class="text-sidebar-toggle-icon-vertical" d="M12 5v14" />
              </svg>
            </span>
          </button>
          <div class="text-sidebar-border-body" data-text-border-panel hidden>
            <label class="text-sidebar-color-row text-sidebar-border-color-row">
              <span class="text-sidebar-color-swatch text-sidebar-border-swatch" data-text-border-color-swatch>
                <input class="text-sidebar-color-input" type="color" value="#000000" aria-label="Border color" data-text-border-color-input />
              </span>
              <span class="text-sidebar-color-hex" data-text-border-color-hex>000000</span>
              <span class="text-sidebar-color-opacity">100%</span>
            </label>
            <label class="text-sidebar-range-field text-sidebar-border-weight-field">
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label">Border Weight</span>
                <output class="text-sidebar-value-pill" data-text-border-weight-value>0.00</output>
              </span>
              <input class="text-sidebar-range" type="range" min="0" max="20" step="0.01" value="0" aria-label="Border weight" data-text-border-weight />
            </label>
          </div>
        </section>
        <section class="text-sidebar-section" aria-label="Text style">
          <div class="text-sidebar-heading-row">
            <h2 class="text-sidebar-title">Text Style</h2>
            <button class="text-sidebar-icon-button" type="button" aria-label="Text style options" data-tooltip="TEXT STYLE OPTIONS">
              <svg class="text-sidebar-dots-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="7" cy="7" r="1.8" />
                <circle cx="17" cy="7" r="1.8" />
                <circle cx="7" cy="17" r="1.8" />
                <circle cx="17" cy="17" r="1.8" />
              </svg>
            </button>
          </div>
          <label class="text-sidebar-select-wrap text-sidebar-font-wrap">
            <select class="text-sidebar-select text-sidebar-font-select" aria-label="Font family" data-text-font>
              <option>Roman Shine</option>
              <option>Libre Baskerville</option>
              <option>Inter Display</option>
              <option>Georgia</option>
            </select>
            <svg class="text-sidebar-select-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </label>
          <label class="text-sidebar-select-wrap">
            <select class="text-sidebar-select" aria-label="Font style" data-text-font-style>
              <option>Regular</option>
              <option>Medium</option>
              <option>Bold</option>
              <option>Black</option>
            </select>
            <svg class="text-sidebar-select-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </label>
          <div class="text-sidebar-metrics" aria-label="Text metrics">
            <label class="text-sidebar-metric">
              <span class="text-sidebar-metric-icon">Tt</span>
              <input type="number" min="1" max="999" step="1" value="147" aria-label="Font size" />
            </label>
            <label class="text-sidebar-metric">
              <span class="text-sidebar-metric-icon">AV</span>
              <input type="number" min="-200" max="500" step="1" value="0" aria-label="Letter spacing" />
            </label>
            <label class="text-sidebar-metric">
              <span class="text-sidebar-metric-icon">A|</span>
              <input type="number" min="1" max="999" step="1" value="182" aria-label="Line height" />
            </label>
          </div>
          <div class="text-sidebar-button-grid" aria-label="Text formatting">
            <button class="text-sidebar-format-button" type="button" aria-label="Align left">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 12H3" />
                <path d="M17 18H3" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button active" type="button" aria-label="Align center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 12H7" />
                <path d="M19 18H5" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button" type="button" aria-label="Align right">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12H9" />
                <path d="M21 18H7" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button" type="button" aria-label="Uppercase">TT</button>
            <button class="text-sidebar-format-button" type="button" aria-label="Ligatures">fi</button>
            <button class="text-sidebar-format-button" type="button" aria-label="Alternate glyphs">A</button>
            <button class="text-sidebar-format-button" type="button" aria-label="More text options">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </div>
        </section>
        <section class="text-sidebar-section text-sidebar-accordion-section" aria-label="Transformation" data-text-transform-section>
          <button class="text-sidebar-accordion-header" type="button" aria-expanded="false" data-text-transform-toggle>
            <span>Transformation</span>
            <span class="text-sidebar-heading-actions" aria-hidden="true">
              <svg class="text-sidebar-section-icon text-sidebar-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
                <path class="text-sidebar-toggle-icon-vertical" d="M12 5v14" />
              </svg>
            </span>
          </button>
          <div class="text-sidebar-transform-body" data-text-transform-panel hidden>
            <div class="text-sidebar-transform-modes" role="group" aria-label="Transformation type">
              <button class="text-sidebar-transform-mode active" type="button" aria-pressed="true" data-text-transform-mode="arch">ARCH</button>
              <button class="text-sidebar-transform-mode" type="button" aria-pressed="false" data-text-transform-mode="flag">FLAG</button>
              <button class="text-sidebar-transform-mode" type="button" aria-pressed="false" data-text-transform-mode="distort">DISTORT</button>
            </div>
            <label class="text-sidebar-range-field text-sidebar-transform-range-field">
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label" data-text-transform-label>Arch Curve</span>
                <output class="text-sidebar-value-pill" data-text-transform-value>35%</output>
              </span>
              <input class="text-sidebar-range" type="range" min="0" max="100" step="1" value="35" aria-label="Transformation amount" data-text-transform-amount />
            </label>
            <div class="text-sidebar-transform-actions">
              <button class="text-sidebar-secondary-button" type="button" data-text-transform-reset>Reset</button>
              <button class="text-sidebar-primary-button" type="button" data-text-transform-confirm>Confirm</button>
            </div>
          </div>
        </section>
        <section class="text-sidebar-section text-sidebar-accordion-section" aria-label="Shadow" data-text-shadow-section>
          <button class="text-sidebar-accordion-header" type="button" aria-expanded="false" data-text-shadow-toggle>
            <span>Shadow</span>
            <span class="text-sidebar-heading-actions" aria-hidden="true">
              <svg class="text-sidebar-dots-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="7" cy="7" r="1.8" />
                <circle cx="17" cy="7" r="1.8" />
                <circle cx="7" cy="17" r="1.8" />
                <circle cx="17" cy="17" r="1.8" />
              </svg>
              <svg class="text-sidebar-section-icon text-sidebar-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
                <path class="text-sidebar-toggle-icon-vertical" d="M12 5v14" />
              </svg>
            </span>
          </button>
          <div class="text-sidebar-shadow-body" data-text-shadow-panel hidden>
            <div class="text-sidebar-shadow-mode-row">
              <span class="text-sidebar-label">Solid 3D</span>
              <button class="smudge-sidebar-toggle-button text-sidebar-shadow-solid-toggle" type="button" aria-label="Solid 3D shadow" aria-pressed="false" data-text-shadow-solid-toggle>
                <span class="smudge-sidebar-toggle-knob"></span>
              </button>
            </div>
            <label class="text-sidebar-color-row text-sidebar-shadow-color-row">
              <span class="text-sidebar-color-swatch text-sidebar-shadow-swatch" data-text-shadow-color-swatch>
                <input class="text-sidebar-color-input" type="color" value="#000000" aria-label="Shadow color" data-text-shadow-color-input />
              </span>
              <span class="text-sidebar-color-hex" data-text-shadow-color-hex>000000</span>
              <span class="text-sidebar-color-opacity">100%</span>
            </label>
            <label class="text-sidebar-range-field text-sidebar-shadow-depth-field">
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label">Shadow Depth</span>
                <output class="text-sidebar-value-pill" data-text-shadow-depth-value>24</output>
              </span>
              <input class="text-sidebar-range" type="range" min="0" max="100" step="1" value="24" aria-label="Shadow depth" data-text-shadow-depth />
            </label>
            <label class="text-sidebar-range-field text-sidebar-shadow-angle-field">
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label">Angle</span>
                <output class="text-sidebar-value-pill" data-text-shadow-angle-value>45</output>
              </span>
              <input class="text-sidebar-range" type="range" min="0" max="360" step="1" value="45" aria-label="Shadow angle" data-text-shadow-angle />
            </label>
            <label class="text-sidebar-range-field text-sidebar-shadow-blur-field" data-text-shadow-blur-field>
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label">Shadow Blur</span>
                <output class="text-sidebar-value-pill" data-text-shadow-blur-value>0.00</output>
              </span>
              <input class="text-sidebar-range" type="range" min="0" max="100" step="0.01" value="0" aria-label="Shadow blur" data-text-shadow-blur />
            </label>
          </div>
        </section>
      </div>
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
  const globalSections = panel.querySelectorAll("[data-right-sidebar-global], [data-right-sidebar-project]");
  const smudgeSidebar = panel.querySelector("[data-smudge-sidebar]");
  const smudgeControls = panel.querySelector("[data-smudge-controls]");
  const smudgeReset = panel.querySelector("[data-smudge-reset]");
  const pressureButton = panel.querySelector("[data-smudge-pressure]");
  const textSidebar = panel.querySelector("[data-text-sidebar]");
  const textOpacityInput = panel.querySelector("[data-text-opacity]");
  const textOpacityValue = panel.querySelector("[data-text-opacity-value]");
  const textColorInput = panel.querySelector("[data-text-color-input]");
  const textColorHex = panel.querySelector("[data-text-color-hex]");
  const textColorSwatch = panel.querySelector("[data-text-color-swatch]");
  const textBorderToggle = panel.querySelector("[data-text-border-toggle]");
  const textBorderPanel = panel.querySelector("[data-text-border-panel]");
  const textBorderColorInput = panel.querySelector("[data-text-border-color-input]");
  const textBorderColorHex = panel.querySelector("[data-text-border-color-hex]");
  const textBorderColorSwatch = panel.querySelector("[data-text-border-color-swatch]");
  const textBorderWeightInput = panel.querySelector("[data-text-border-weight]");
  const textBorderWeightValue = panel.querySelector("[data-text-border-weight-value]");
  const textTransformToggle = panel.querySelector("[data-text-transform-toggle]");
  const textTransformPanel = panel.querySelector("[data-text-transform-panel]");
  const textTransformModeButtons = panel.querySelectorAll("[data-text-transform-mode]");
  const textTransformAmountInput = panel.querySelector("[data-text-transform-amount]");
  const textTransformValue = panel.querySelector("[data-text-transform-value]");
  const textTransformLabel = panel.querySelector("[data-text-transform-label]");
  const textTransformReset = panel.querySelector("[data-text-transform-reset]");
  const textTransformConfirm = panel.querySelector("[data-text-transform-confirm]");
  const textShadowToggle = panel.querySelector("[data-text-shadow-toggle]");
  const textShadowPanel = panel.querySelector("[data-text-shadow-panel]");
  const textShadowSolidToggle = panel.querySelector("[data-text-shadow-solid-toggle]");
  const textShadowColorInput = panel.querySelector("[data-text-shadow-color-input]");
  const textShadowColorHex = panel.querySelector("[data-text-shadow-color-hex]");
  const textShadowColorSwatch = panel.querySelector("[data-text-shadow-color-swatch]");
  const textShadowDepthInput = panel.querySelector("[data-text-shadow-depth]");
  const textShadowDepthValue = panel.querySelector("[data-text-shadow-depth-value]");
  const textShadowAngleInput = panel.querySelector("[data-text-shadow-angle]");
  const textShadowAngleValue = panel.querySelector("[data-text-shadow-angle-value]");
  const textShadowBlurField = panel.querySelector("[data-text-shadow-blur-field]");
  const textShadowBlurInput = panel.querySelector("[data-text-shadow-blur]");
  const textShadowBlurValue = panel.querySelector("[data-text-shadow-blur-value]");
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

  if (projectInput) {
    projectInput.value = window.localStorage.getItem(storageKey) || "";
    projectInput.addEventListener("input", () => {
      window.localStorage.setItem(storageKey, projectInput.value);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
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

  function updateTextRangeProgress() {
    if (!textOpacityInput) {
      return;
    }

    const min = Number(textOpacityInput.min) || 0;
    const max = Number(textOpacityInput.max) || 100;
    const value = clamp(textOpacityInput.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    textOpacityInput.style.setProperty("--text-sidebar-range-progress", `${progress}%`);

    if (textOpacityValue) {
      textOpacityValue.textContent = `${Math.round(value)}%`;
    }
  }

  function syncTextColor() {
    if (!textColorInput) {
      return;
    }

    const hex = String(textColorInput.value || "#ffffff").replace("#", "").toUpperCase();

    if (textColorHex) {
      textColorHex.textContent = hex;
    }

    if (textColorSwatch) {
      textColorSwatch.style.background = `#${hex}`;
    }
  }

  function syncTextBorderColor() {
    if (!textBorderColorInput) {
      return;
    }

    const hex = String(textBorderColorInput.value || "#000000").replace("#", "").toUpperCase();

    if (textBorderColorHex) {
      textBorderColorHex.textContent = hex;
    }

    if (textBorderColorSwatch) {
      textBorderColorSwatch.style.background = `#${hex}`;
    }
  }

  function updateTextBorderWeight() {
    if (!textBorderWeightInput) {
      return;
    }

    const min = Number(textBorderWeightInput.min) || 0;
    const max = Number(textBorderWeightInput.max) || 20;
    const value = clamp(textBorderWeightInput.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    textBorderWeightInput.style.setProperty("--text-sidebar-range-progress", `${progress}%`);

    if (textBorderWeightValue) {
      textBorderWeightValue.textContent = value.toFixed(2);
    }
  }

  function updateTextShadowRange(input, valueElement, formatValue) {
    if (!input) {
      return;
    }

    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = clamp(input.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    input.style.setProperty("--text-sidebar-range-progress", `${progress}%`);

    if (valueElement) {
      valueElement.textContent = formatValue(value);
    }
  }

  function updateTextShadowDepth() {
    updateTextShadowRange(textShadowDepthInput, textShadowDepthValue, (value) => String(Math.round(value)));
  }

  function updateTextShadowAngle() {
    updateTextShadowRange(textShadowAngleInput, textShadowAngleValue, (value) => String(Math.round(value)));
  }

  function updateTextShadowBlur() {
    updateTextShadowRange(textShadowBlurInput, textShadowBlurValue, (value) => value.toFixed(2));
  }

  function syncTextShadowColor() {
    if (!textShadowColorInput) {
      return;
    }

    const hex = String(textShadowColorInput.value || "#000000").replace("#", "").toUpperCase();

    if (textShadowColorHex) {
      textShadowColorHex.textContent = hex;
    }

    if (textShadowColorSwatch) {
      textShadowColorSwatch.style.background = `#${hex}`;
    }
  }

  function isTextShadowSolidEnabled() {
    return textShadowSolidToggle?.getAttribute("aria-pressed") === "true";
  }

  function setTextShadowSolidMode(isEnabled) {
    if (!textShadowSolidToggle) {
      return;
    }

    textShadowSolidToggle.setAttribute("aria-pressed", String(isEnabled));
    textShadowSolidToggle.classList.toggle("active", isEnabled);

    if (textShadowBlurField) {
      textShadowBlurField.hidden = isEnabled;
    }
  }

  function syncTextShadowControls() {
    setTextShadowSolidMode(isTextShadowSolidEnabled());
    syncTextShadowColor();
    updateTextShadowDepth();
    updateTextShadowAngle();
    updateTextShadowBlur();
  }

  function getActiveTextTransformMode() {
    const activeButton = Array.from(textTransformModeButtons).find((button) =>
      button.classList.contains("active"),
    );

    return activeButton?.dataset.textTransformMode || "arch";
  }

  function getTextTransformLabel(mode) {
    if (mode === "flag") {
      return "Flag Curve";
    }

    if (mode === "distort") {
      return "Distort Amount";
    }

    return "Arch Curve";
  }

  function updateTextTransformAmount() {
    if (!textTransformAmountInput) {
      return;
    }

    const min = Number(textTransformAmountInput.min) || 0;
    const max = Number(textTransformAmountInput.max) || 100;
    const value = clamp(textTransformAmountInput.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    textTransformAmountInput.style.setProperty("--text-sidebar-range-progress", `${progress}%`);

    if (textTransformValue) {
      textTransformValue.textContent = `${Math.round(value)}%`;
    }
  }

  function setTextTransformMode(mode) {
    const nextMode = mode === "flag" || mode === "distort" ? mode : "arch";

    textTransformModeButtons.forEach((button) => {
      const isActive = button.dataset.textTransformMode === nextMode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (textTransformLabel) {
      textTransformLabel.textContent = getTextTransformLabel(nextMode);
    }
  }

  function syncTextControls() {
    updateTextRangeProgress();
    syncTextColor();
    syncTextBorderColor();
    updateTextBorderWeight();
    setTextTransformMode(getActiveTextTransformMode());
    updateTextTransformAmount();
    syncTextShadowControls();
  }

  function setTextBorderOpen(isOpen) {
    if (!textBorderToggle || !textBorderPanel) {
      return;
    }

    textBorderToggle.setAttribute("aria-expanded", String(isOpen));
    textBorderPanel.hidden = !isOpen;

    if (isOpen) {
      syncTextBorderColor();
      updateTextBorderWeight();
    }
  }

  function setTextTransformationOpen(isOpen) {
    if (!textTransformToggle || !textTransformPanel) {
      return;
    }

    textTransformToggle.setAttribute("aria-expanded", String(isOpen));
    textTransformPanel.hidden = !isOpen;

    if (isOpen) {
      setTextTransformMode(getActiveTextTransformMode());
      updateTextTransformAmount();
    }
  }

  function setTextShadowOpen(isOpen) {
    if (!textShadowToggle || !textShadowPanel) {
      return;
    }

    textShadowToggle.setAttribute("aria-expanded", String(isOpen));
    textShadowPanel.hidden = !isOpen;

    if (isOpen) {
      syncTextShadowControls();
    }
  }

  function showTextSettings(isVisible) {
    if (!textSidebar) {
      return;
    }

    textSidebar.hidden = !isVisible;
    globalSections.forEach((section) => {
      section.hidden = isVisible;
    });

    if (isVisible) {
      syncTextControls();
    }
  }

  function normalizeToolName(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "smudge") {
      return "smudge";
    }

    if (normalized === "text" || normalized === "type") {
      return "text";
    }

    return "";
  }

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

  textOpacityInput?.addEventListener("input", updateTextRangeProgress);
  textColorInput?.addEventListener("input", syncTextColor);
  textBorderColorInput?.addEventListener("input", syncTextBorderColor);
  textBorderWeightInput?.addEventListener("input", updateTextBorderWeight);
  textBorderToggle?.addEventListener("click", () => {
    setTextBorderOpen(textBorderToggle.getAttribute("aria-expanded") !== "true");
  });
  textShadowSolidToggle?.addEventListener("click", () => {
    setTextShadowSolidMode(!isTextShadowSolidEnabled());
  });
  textShadowColorInput?.addEventListener("input", syncTextShadowColor);
  textShadowDepthInput?.addEventListener("input", updateTextShadowDepth);
  textShadowAngleInput?.addEventListener("input", updateTextShadowAngle);
  textShadowBlurInput?.addEventListener("input", updateTextShadowBlur);
  textShadowToggle?.addEventListener("click", () => {
    setTextShadowOpen(textShadowToggle.getAttribute("aria-expanded") !== "true");
  });
  textTransformAmountInput?.addEventListener("input", updateTextTransformAmount);
  textTransformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTextTransformMode(button.dataset.textTransformMode);
    });
  });
  textTransformReset?.addEventListener("click", () => {
    setTextTransformMode("arch");

    if (textTransformAmountInput) {
      textTransformAmountInput.value = "35";
    }

    updateTextTransformAmount();
  });
  textTransformConfirm?.addEventListener("click", () => {
    textTransformConfirm.classList.add("active");
    window.setTimeout(() => {
      textTransformConfirm.classList.remove("active");
    }, 140);
  });
  textTransformToggle?.addEventListener("click", () => {
    setTextTransformationOpen(textTransformToggle.getAttribute("aria-expanded") !== "true");
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const activeTool = normalizeToolName(event.detail?.toolMode || event.detail?.label);

    showTextSettings(activeTool === "text");
    showSmudgeSettings(activeTool === "smudge");
  });

  syncSmudgeControls();
  syncTextControls();
};
