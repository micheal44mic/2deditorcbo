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
              <input class="text-sidebar-range" type="range" min="0" max="120" step="0.01" value="0" aria-label="Border weight" data-text-border-weight />
            </label>
            <div class="text-sidebar-stroke-align-field" aria-label="Border position">
              <span class="text-sidebar-label">Position</span>
              <div class="text-sidebar-stroke-align-modes" role="group" aria-label="Border position">
                <button class="text-sidebar-stroke-align-mode" type="button" aria-pressed="false" data-text-stroke-align="outer">OUT</button>
                <button class="text-sidebar-stroke-align-mode active" type="button" aria-pressed="true" data-text-stroke-align="center">META</button>
                <button class="text-sidebar-stroke-align-mode" type="button" aria-pressed="false" data-text-stroke-align="inner">IN</button>
              </div>
            </div>
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
              <option value="UnifrakturCook">UnifrakturCook</option>
              <option value="Pirata One">Pirata One</option>
              <option value="New Rocker">New Rocker</option>
              <option value="Germania One">Germania One</option>
              <option value="Libre Baskerville">Libre Baskerville</option>
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
              <input type="number" min="1" max="999" step="1" value="300" aria-label="Font size" data-text-font-size />
            </label>
            <label class="text-sidebar-metric">
              <span class="text-sidebar-metric-icon">AV</span>
              <input type="number" min="-200" max="500" step="1" value="0" aria-label="Letter spacing" data-text-letter-spacing />
            </label>
            <label class="text-sidebar-metric">
              <span class="text-sidebar-metric-icon">A|</span>
              <input type="number" min="1" max="999" step="1" value="182" aria-label="Line height" data-text-line-height />
            </label>
          </div>
          <div class="text-sidebar-button-grid" aria-label="Text formatting">
            <button class="text-sidebar-format-button" type="button" aria-label="Align left" aria-pressed="false" data-text-align="left">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 12H3" />
                <path d="M17 18H3" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button active" type="button" aria-label="Align center" aria-pressed="true" data-text-align="center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 12H7" />
                <path d="M19 18H5" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button" type="button" aria-label="Align right" aria-pressed="false" data-text-align="right">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12H9" />
                <path d="M21 18H7" />
                <path d="M21 6H3" />
              </svg>
            </button>
            <button class="text-sidebar-format-button" type="button" aria-label="Uppercase" aria-pressed="false" data-text-uppercase>TT</button>
            <button class="text-sidebar-format-button active" type="button" aria-label="Ligatures" aria-pressed="true" data-text-ligatures>fi</button>
            <button class="text-sidebar-format-button" type="button" aria-label="Alternate glyphs" aria-pressed="false" data-text-alternates>A</button>
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
              <output class="text-sidebar-value-pill" data-text-transform-value>170</output>
            </span>
              <input class="text-sidebar-range" type="range" min="-1200" max="1200" step="1" value="170" aria-label="Transformation amount" data-text-transform-amount />
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
              <input class="text-sidebar-range" type="range" min="0" max="500" step="1" value="24" aria-label="Shadow depth" data-text-shadow-depth />
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
              <input class="text-sidebar-range" type="range" min="0" max="300" step="0.01" value="0" aria-label="Shadow blur" data-text-shadow-blur />
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
  const textContentInput = panel.querySelector("[data-text-content]");
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
  const textStrokeAlignButtons = panel.querySelectorAll("[data-text-stroke-align]");
  const textTransformToggle = panel.querySelector("[data-text-transform-toggle]");
  const textTransformPanel = panel.querySelector("[data-text-transform-panel]");
  const textTransformModeButtons = panel.querySelectorAll("[data-text-transform-mode]");
  const textTransformAmountInput = panel.querySelector("[data-text-transform-amount]");
  const textTransformValue = panel.querySelector("[data-text-transform-value]");
  const textTransformLabel = panel.querySelector("[data-text-transform-label]");
  const textTransformReset = panel.querySelector("[data-text-transform-reset]");
  const textTransformConfirm = panel.querySelector("[data-text-transform-confirm]");
  const textFontSelect = panel.querySelector("[data-text-font]");
  const textFontStyleSelect = panel.querySelector("[data-text-font-style]");
  const textFontSizeInput = panel.querySelector("[data-text-font-size]");
  const textLetterSpacingInput = panel.querySelector("[data-text-letter-spacing]");
  const textLineHeightInput = panel.querySelector("[data-text-line-height]");
  const textAlignButtons = panel.querySelectorAll("[data-text-align]");
  const textUppercaseButton = panel.querySelector("[data-text-uppercase]");
  const textLigaturesButton = panel.querySelector("[data-text-ligatures]");
  const textAlternatesButton = panel.querySelector("[data-text-alternates]");
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

  let currentToolName = "";
  let isSyncingTextLayerControls = false;
  let textGeometryPatchRevision = 0;

  function isVectorTextLayer(layer) {
    return layer?.type === "vector-text" || layer?.type === "text" || layer?.kind === "text";
  }

  function getLayerModel() {
    return window.CBO.documentLayerModel || null;
  }

  function getActiveTextLayer() {
    const layerModel = getLayerModel();
    const activeLayer = layerModel?.findEntryById?.(layerModel.activeLayerId);

    return isVectorTextLayer(activeLayer) ? activeLayer : null;
  }

  function mergeTextLayerPatch(layer, patch = {}) {
    const nextPatch = { ...patch };

    if (patch.warp) {
      nextPatch.warp = {
        ...(layer.warp || {}),
        ...patch.warp,
      };
    }

    if (patch.style) {
      nextPatch.style = {
        ...(layer.style || {}),
        ...patch.style,
        shadow: {
          ...(layer.style?.shadow || {}),
          ...(patch.style.shadow || {}),
        },
      };
    }

    if (patch.textEffectState) {
      nextPatch.textEffectState = {
        ...(layer.textEffectState || {}),
      };

      Object.entries(patch.textEffectState).forEach(([key, value]) => {
        nextPatch.textEffectState[key] = value && typeof value === "object" && !Array.isArray(value)
          ? {
            ...(layer.textEffectState?.[key] || {}),
            ...value,
          }
          : value;
      });
    }

    return nextPatch;
  }

  function cloneTextValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneTextValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneTextValue(item)]),
      );
    }

    return value;
  }

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function getTextPathOptions(layer) {
    return {
      letterSpacing: layer.letterSpacing,
      ligatures: layer.ligatures,
      lineHeight: layer.lineHeight,
      textAlign: layer.textAlign,
      uppercase: layer.uppercase,
    };
  }

  function getLayerVisualCenterOffset(layer, bounds) {
    const centerX = (bounds.x1 + bounds.x2) / 2;
    const centerY = (bounds.y1 + bounds.y2) / 2;
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);
    const radians = (toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
    const scaledX = centerX * scaleX;
    const scaledY = centerY * scaleY;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: scaledX * cos - scaledY * sin,
      y: scaledX * sin + scaledY * cos,
    };
  }

  function getWarpedTextBounds(layer, font) {
    const engine = window.CBO.VectorTextEngine;
    const path = engine.createTextPath(font, layer.text, layer.fontSize, getTextPathOptions(layer));
    const bounds = path.getBoundingBox();

    if (layer.envelopeGrid) {
      engine.applyEnvelopeWarp(path, layer.envelopeGrid);
    } else {
      path.commands = engine.warpPathCommands(path.commands, bounds, layer.warp);
    }

    return path.getBoundingBox();
  }

  function getTextHistoryGroup(suffix, layer = getActiveTextLayer()) {
    const key = String(suffix || "").trim();

    return key && layer?.id ? `text-${key}-${layer.id}` : "";
  }

  function getTextHistoryOptions(suffix) {
    const historyGroup = getTextHistoryGroup(suffix);

    return historyGroup ? { historyGroup } : {};
  }

  function bindTextHistoryGroup(control, suffix) {
    if (!control) {
      return;
    }

    let activeGroup = "";

    control.addEventListener("focus", () => {
      activeGroup = getTextHistoryGroup(suffix);
      window.CBO.documentHistory?.beginGroup?.(activeGroup);
    });

    control.addEventListener("blur", () => {
      window.CBO.documentHistory?.endGroup?.(activeGroup);
      activeGroup = "";
    });
  }

  function patchActiveTextLayer(patch, source = "text-sidebar", historyOptions = {}) {
    if (isSyncingTextLayerControls) {
      return;
    }

    const layerModel = getLayerModel();
    const layer = getActiveTextLayer();

    if (!layer || !layerModel?.updateLayer) {
      return;
    }

    layerModel.updateLayer(layer.id, mergeTextLayerPatch(layer, patch), {
      ...historyOptions,
      source,
    });
  }

  function getStoredTextEffect(layer, key) {
    const value = layer?.textEffectState?.[key];

    return value && typeof value === "object" ? value : {};
  }

  function getCurrentStrokeWidth(layer) {
    return Number.isFinite(layer?.style?.strokeWidth) ? layer.style.strokeWidth : 0;
  }

  function getCurrentShadowOpacity(layer) {
    return Number.isFinite(layer?.style?.shadow?.opacity) ? layer.style.shadow.opacity : 0;
  }

  function disableTextBorderEffect() {
    const layer = getActiveTextLayer();

    if (!layer) {
      return;
    }

    const strokeWidth = getCurrentStrokeWidth(layer);
    const stored = getStoredTextEffect(layer, "border");

    patchActiveTextLayer({
      style: { strokeWidth: 0 },
      textEffectState: {
        border: {
          strokeWidth: strokeWidth > 0 ? strokeWidth : stored.strokeWidth || 7,
        },
      },
    }, "text-sidebar-border-off");
  }

  function enableTextBorderEffect() {
    const layer = getActiveTextLayer();

    if (!layer || getCurrentStrokeWidth(layer) > 0) {
      return;
    }

    const stored = getStoredTextEffect(layer, "border");
    const inputValue = textBorderWeightInput
      ? clamp(textBorderWeightInput.value, 0, 120)
      : 0;
    const strokeWidth = Number.isFinite(stored.strokeWidth) && stored.strokeWidth > 0
      ? stored.strokeWidth
      : inputValue > 0 ? inputValue : 7;

    patchActiveTextLayer({
      style: { strokeWidth },
      textEffectState: {
        border: { strokeWidth },
      },
    }, "text-sidebar-border-on");
  }

  function disableTextShadowEffect() {
    const layer = getActiveTextLayer();

    if (!layer) {
      return;
    }

    const shadow = layer.style?.shadow || {};
    const opacity = getCurrentShadowOpacity(layer);
    const stored = getStoredTextEffect(layer, "shadow");

    patchActiveTextLayer({
      style: { shadow: { opacity: 0 } },
      textEffectState: {
        shadow: {
          blur: Number.isFinite(shadow.blur) ? shadow.blur : stored.blur || 0,
          opacity: opacity > 0 ? opacity : stored.opacity || 1,
          shadowDistance: Number.isFinite(layer.shadowDistance) ? layer.shadowDistance : stored.shadowDistance || 72,
          shadowType: layer.shadowType || stored.shadowType || "drop",
        },
      },
    }, "text-sidebar-shadow-off");
  }

  function enableTextShadowEffect() {
    const layer = getActiveTextLayer();

    if (!layer || getCurrentShadowOpacity(layer) > 0) {
      return;
    }

    const stored = getStoredTextEffect(layer, "shadow");

    patchActiveTextLayer({
      shadowDistance: Number.isFinite(stored.shadowDistance) ? stored.shadowDistance : layer.shadowDistance || 72,
      shadowType: stored.shadowType || layer.shadowType || "drop",
      style: {
        shadow: {
          blur: Number.isFinite(stored.blur) ? stored.blur : layer.style?.shadow?.blur || 0,
          opacity: Number.isFinite(stored.opacity) && stored.opacity > 0 ? stored.opacity : 1,
        },
      },
    }, "text-sidebar-shadow-on");
  }

  function isTextTransformEffectActive(layer) {
    if (!layer) {
      return false;
    }

    if (layer.envelopeGrid) {
      return true;
    }

    const warpType = layer.warp?.type || "none";
    const amount = Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0;

    return warpType !== "none" && amount !== 0;
  }

  function disableTextTransformEffect() {
    const layer = getActiveTextLayer();

    if (!layer) {
      return;
    }

    const stored = getStoredTextEffect(layer, "transform");
    const nextStored = isTextTransformEffectActive(layer)
      ? {
        envelopeGrid: cloneTextValue(layer.envelopeGrid),
        warp: cloneTextValue(layer.warp || { type: "arch", amount: 170 }),
      }
      : stored;

    void patchActiveTextLayerPreservingVisualCenter({
      envelopeGrid: null,
      textEffectState: {
        transform: nextStored,
      },
      warp: {
        amount: 0,
        type: "none",
      },
    }, "text-sidebar-transform-off");
  }

  function enableTextTransformEffect() {
    const layer = getActiveTextLayer();

    if (!layer || isTextTransformEffectActive(layer)) {
      return;
    }

    const stored = getStoredTextEffect(layer, "transform");
    const inputValue = textTransformAmountInput
      ? clamp(textTransformAmountInput.value, -1200, 1200)
      : 0;
    const warp = stored.warp?.type
      ? cloneTextValue(stored.warp)
      : {
        amount: inputValue !== 0 ? inputValue : 170,
        type: "arch",
      };

    void patchActiveTextLayerPreservingVisualCenter({
      envelopeGrid: stored.envelopeGrid ? cloneTextValue(stored.envelopeGrid) : null,
      textEffectState: {
        transform: {
          envelopeGrid: stored.envelopeGrid ? cloneTextValue(stored.envelopeGrid) : null,
          warp: cloneTextValue(warp),
        },
      },
      warp,
    }, "text-sidebar-transform-on");
  }

  async function patchActiveTextLayerPreservingVisualCenter(
    patch,
    source = "text-sidebar-transform",
    historyOptions = {},
  ) {
    if (isSyncingTextLayerControls) {
      return;
    }

    const layerModel = getLayerModel();
    const layer = getActiveTextLayer();
    const engine = window.CBO.VectorTextEngine;

    if (!layer || !layerModel?.updateLayer || !engine?.loadOpenTypeFont) {
      patchActiveTextLayer(patch, source, historyOptions);
      return;
    }

    const revision = ++textGeometryPatchRevision;
    const mergedPatch = mergeTextLayerPatch(layer, patch);
    const nextLayer = {
      ...cloneTextValue(layer),
      ...cloneTextValue(mergedPatch),
    };

    try {
      const beforeFont = await engine.loadOpenTypeFont(layer.fontUrl || engine.DEFAULT_FONT_URL);
      const afterFont = nextLayer.fontUrl === layer.fontUrl
        ? beforeFont
        : await engine.loadOpenTypeFont(nextLayer.fontUrl || engine.DEFAULT_FONT_URL);

      if (revision !== textGeometryPatchRevision) {
        return;
      }

      const currentLayer = getActiveTextLayer();

      if (!currentLayer || currentLayer.id !== layer.id) {
        return;
      }

      const beforeOffset = getLayerVisualCenterOffset(layer, getWarpedTextBounds(layer, beforeFont));
      const afterOffset = getLayerVisualCenterOffset(nextLayer, getWarpedTextBounds(nextLayer, afterFont));
      const centerX = toFiniteNumber(layer.x, 0) + beforeOffset.x;
      const centerY = toFiniteNumber(layer.y, 0) + beforeOffset.y;

      layerModel.updateLayer(layer.id, {
        ...mergedPatch,
        x: centerX - afterOffset.x,
        y: centerY - afterOffset.y,
      }, {
        ...historyOptions,
        source,
      });
    } catch (error) {
      console.warn("Impossibile preservare il centro della trasformazione testo.", error);
      patchActiveTextLayer(patch, source, historyOptions);
    }
  }

  function normalizeHexColor(value, fallback = "#ffffff") {
    const color = String(value || "").trim();

    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  function getVectorFontRegistry() {
    const registry = Array.isArray(window.CBO.VECTOR_TEXT_FONTS)
      ? window.CBO.VECTOR_TEXT_FONTS.filter((font) => font?.family && font?.url)
      : [];

    if (registry.length > 0) {
      return registry;
    }

    const engine = window.CBO.VectorTextEngine;

    return [{
      family: engine?.DEFAULT_FONT_LABEL || "UnifrakturCook",
      label: engine?.DEFAULT_FONT_LABEL || "UnifrakturCook",
      style: "Bold",
      url: engine?.DEFAULT_FONT_URL || "./vendor/fonts/UnifrakturCook-Bold.ttf",
    }];
  }

  function getUniqueFontFamilies() {
    const seen = new Set();

    return getVectorFontRegistry().filter((font) => {
      if (seen.has(font.family)) {
        return false;
      }

      seen.add(font.family);
      return true;
    });
  }

  function getFontsByFamily(family) {
    const registry = getVectorFontRegistry();
    const matches = registry.filter((font) => font.family === family);

    return matches.length > 0 ? matches : registry.slice(0, 1);
  }

  function findFontRecordForLayer(layer) {
    const registry = getVectorFontRegistry();

    return registry.find((font) => font.url === layer?.fontUrl) ||
      registry.find((font) => font.family === layer?.fontFamily && font.style === layer?.fontStyle) ||
      registry[0] ||
      null;
  }

  function findFontRecordForSelection(family, style) {
    const fonts = getFontsByFamily(family);

    return fonts.find((font) => font.style === style) || fonts[0] || null;
  }

  function populateTextFontStyleOptions(family, preferredStyle) {
    if (!textFontStyleSelect) {
      return null;
    }

    const fonts = getFontsByFamily(family);
    const selectedFont = fonts.find((font) => font.style === preferredStyle) || fonts[0] || null;

    textFontStyleSelect.replaceChildren(
      ...fonts.map((font) => {
        const option = document.createElement("option");

        option.value = font.style || "Regular";
        option.textContent = font.style || "Regular";

        return option;
      }),
    );

    if (selectedFont) {
      textFontStyleSelect.value = selectedFont.style || "Regular";
    }

    return selectedFont;
  }

  function populateTextFontFamilyOptions() {
    if (!textFontSelect) {
      return;
    }

    const families = getUniqueFontFamilies();
    const currentValue = textFontSelect.value;

    textFontSelect.replaceChildren(
      ...families.map((font) => {
        const option = document.createElement("option");

        option.value = font.family;
        option.textContent = font.family;

        return option;
      }),
    );

    if (families.some((font) => font.family === currentValue)) {
      textFontSelect.value = currentValue;
    }
  }

  function syncTextFontControlsFromLayer(layer) {
    const fontRecord = findFontRecordForLayer(layer);
    const family = fontRecord?.family || layer.fontFamily || textFontSelect?.value || "UnifrakturCook";
    const style = fontRecord?.style || layer.fontStyle || textFontStyleSelect?.value || "Bold";

    populateTextFontFamilyOptions();

    if (textFontSelect) {
      textFontSelect.value = family;

      if (textFontSelect.value !== family) {
        textFontSelect.selectedIndex = 0;
      }
    }

    populateTextFontStyleOptions(textFontSelect?.value || family, style);
  }

  function patchTextFontFromControls() {
    const family = textFontSelect?.value;
    const style = textFontStyleSelect?.value;
    const fontRecord = findFontRecordForSelection(family, style);

    if (!fontRecord) {
      return;
    }

    patchActiveTextLayer({
      fontFamily: fontRecord.family,
      fontLabel: fontRecord.label || fontRecord.family,
      fontStyle: fontRecord.style || "Regular",
      fontUrl: fontRecord.url,
    }, "text-sidebar-font");
  }

  function setTextAlign(align) {
    const nextAlign = ["left", "center", "right"].includes(align) ? align : "center";

    textAlignButtons.forEach((button) => {
      const isActive = button.dataset.textAlign === nextAlign;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setTextToggleButton(button, isActive) {
    if (!button) {
      return;
    }

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  function shouldShowTextSettings(activeTool = currentToolName) {
    return activeTool === "text" || activeTool === "type" || Boolean(getActiveTextLayer());
  }

  function syncTextControlsFromLayer() {
    const layer = getActiveTextLayer();

    if (!layer) {
      return;
    }

    isSyncingTextLayerControls = true;

    try {
      if (textContentInput) {
        textContentInput.value = layer.text || "";
      }

      if (textOpacityInput) {
        textOpacityInput.value = String(Math.round((Number.isFinite(layer.opacity) ? layer.opacity : 1) * 100));
      }

      if (textColorInput) {
        textColorInput.value = normalizeHexColor(layer.style?.fill, "#ffffff");
      }

      if (textBorderColorInput) {
        textBorderColorInput.value = normalizeHexColor(layer.style?.stroke, "#000000");
      }

      if (textBorderWeightInput) {
        textBorderWeightInput.value = String(Number.isFinite(layer.style?.strokeWidth) ? layer.style.strokeWidth : 0);
      }

      setTextStrokeAlign(layer.style?.strokeAlign || "center");
      syncTextFontControlsFromLayer(layer);

      if (textFontSizeInput) {
        textFontSizeInput.value = String(Math.round(Number.isFinite(layer.fontSize) ? layer.fontSize : 300));
      }

      if (textLetterSpacingInput) {
        textLetterSpacingInput.value = String(Math.round(Number.isFinite(layer.letterSpacing) ? layer.letterSpacing : 0));
      }

      if (textLineHeightInput) {
        textLineHeightInput.value = String(Math.round(Number.isFinite(layer.lineHeight) ? layer.lineHeight : 182));
      }

      setTextAlign(layer.textAlign || "center");
      setTextToggleButton(textUppercaseButton, layer.uppercase === true);
      setTextToggleButton(textLigaturesButton, layer.ligatures !== false);
      setTextToggleButton(textAlternatesButton, layer.alternates === true);

      setTextTransformMode(layer.envelopeGrid ? "distort" : layer.warp?.type || "arch");

      if (textTransformAmountInput) {
        textTransformAmountInput.value = String(Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0);
      }

      setTextShadowSolidMode(layer.shadowType === "solid");

      if (textShadowColorInput) {
        textShadowColorInput.value = normalizeHexColor(layer.style?.shadow?.color, "#000000");
      }

      if (textShadowDepthInput) {
        textShadowDepthInput.value = String(Math.round(Number.isFinite(layer.shadowDistance) ? layer.shadowDistance : 0));
      }

      if (textShadowAngleInput) {
        textShadowAngleInput.value = String(Math.round(Number.isFinite(layer.shadowAngle) ? layer.shadowAngle : 0));
      }

      if (textShadowBlurInput) {
        textShadowBlurInput.value = String(Number.isFinite(layer.style?.shadow?.blur) ? layer.style.shadow.blur : 0);
      }

      syncTextControls();
    } finally {
      isSyncingTextLayerControls = false;
    }
  }

  async function initEnvelopeForActiveTextLayer() {
    const layer = getActiveTextLayer();
    const engine = window.CBO.VectorTextEngine;

    if (!layer || !engine?.loadOpenTypeFont) {
      return;
    }

    try {
      const font = await engine.loadOpenTypeFont(layer.fontUrl || engine.DEFAULT_FONT_URL);
      const path = engine.createTextPath(font, layer.text, layer.fontSize, getTextPathOptions(layer));
      const envelopeGrid = engine.createEnvelopeGridFromBounds(path.getBoundingBox());

      void patchActiveTextLayerPreservingVisualCenter({
        envelopeGrid,
        warp: {
          type: "none",
          amount: 0,
        },
      }, "text-sidebar-envelope");
    } catch (error) {
      console.warn("Impossibile inizializzare la distorsione envelope.", error);
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
      textTransformValue.textContent = String(Math.round(value));
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

  function setTextStrokeAlign(align) {
    const nextAlign = ["outer", "inner", "center"].includes(align) ? align : "center";

    textStrokeAlignButtons.forEach((button) => {
      const isActive = button.dataset.textStrokeAlign === nextAlign;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function syncTextControls() {
    populateTextFontFamilyOptions();
    updateTextRangeProgress();
    syncTextColor();
    syncTextBorderColor();
    updateTextBorderWeight();
    setTextTransformMode(getActiveTextTransformMode());
    updateTextTransformAmount();
    syncTextShadowControls();
  }

  function setTextBorderOpen(isOpen, options = {}) {
    if (!textBorderToggle || !textBorderPanel) {
      return;
    }

    textBorderToggle.setAttribute("aria-expanded", String(isOpen));
    textBorderPanel.hidden = !isOpen;

    if (options.updateLayer !== false) {
      if (isOpen) {
        enableTextBorderEffect();
      } else {
        disableTextBorderEffect();
      }
    }

    if (isOpen) {
      syncTextBorderColor();
      updateTextBorderWeight();
    }
  }

  function setTextTransformationOpen(isOpen, options = {}) {
    if (!textTransformToggle || !textTransformPanel) {
      return;
    }

    textTransformToggle.setAttribute("aria-expanded", String(isOpen));
    textTransformPanel.hidden = !isOpen;

    if (options.updateLayer !== false) {
      if (isOpen) {
        enableTextTransformEffect();
      } else {
        disableTextTransformEffect();
      }
    }

    if (isOpen) {
      setTextTransformMode(getActiveTextTransformMode());
      updateTextTransformAmount();
    }
  }

  function setTextShadowOpen(isOpen, options = {}) {
    if (!textShadowToggle || !textShadowPanel) {
      return;
    }

    textShadowToggle.setAttribute("aria-expanded", String(isOpen));
    textShadowPanel.hidden = !isOpen;

    if (options.updateLayer !== false) {
      if (isOpen) {
        enableTextShadowEffect();
      } else {
        disableTextShadowEffect();
      }
    }

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
      if (getActiveTextLayer()) {
        syncTextControlsFromLayer();
      } else {
        syncTextControls();
      }
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

  bindTextHistoryGroup(textContentInput, "content");
  bindTextHistoryGroup(textOpacityInput, "opacity");
  bindTextHistoryGroup(textColorInput, "fill-color");
  bindTextHistoryGroup(textBorderColorInput, "stroke-color");
  bindTextHistoryGroup(textBorderWeightInput, "stroke-width");
  bindTextHistoryGroup(textFontSizeInput, "font-size");
  bindTextHistoryGroup(textLetterSpacingInput, "letter-spacing");
  bindTextHistoryGroup(textLineHeightInput, "line-height");
  bindTextHistoryGroup(textShadowColorInput, "shadow-color");
  bindTextHistoryGroup(textShadowDepthInput, "shadow-depth");
  bindTextHistoryGroup(textShadowAngleInput, "shadow-angle");
  bindTextHistoryGroup(textShadowBlurInput, "shadow-blur");
  bindTextHistoryGroup(textTransformAmountInput, "transform-amount");

  textContentInput?.addEventListener("input", () => {
    patchActiveTextLayer(
      { text: textContentInput.value },
      "text-sidebar-content",
      getTextHistoryOptions("content"),
    );
  });
  textOpacityInput?.addEventListener("input", () => {
    updateTextRangeProgress();
    patchActiveTextLayer(
      { opacity: clamp(textOpacityInput.value, 0, 100) / 100 },
      "text-sidebar-opacity",
      getTextHistoryOptions("opacity"),
    );
  });
  textColorInput?.addEventListener("input", () => {
    syncTextColor();
    patchActiveTextLayer(
      { style: { fill: textColorInput.value } },
      "text-sidebar-fill-color",
      getTextHistoryOptions("fill-color"),
    );
  });
  textBorderColorInput?.addEventListener("input", () => {
    syncTextBorderColor();
    patchActiveTextLayer(
      { style: { stroke: textBorderColorInput.value } },
      "text-sidebar-stroke-color",
      getTextHistoryOptions("stroke-color"),
    );
  });
  textBorderWeightInput?.addEventListener("input", () => {
    updateTextBorderWeight();
    patchActiveTextLayer(
      { style: { strokeWidth: clamp(textBorderWeightInput.value, 0, 120) } },
      "text-sidebar-stroke-width",
      getTextHistoryOptions("stroke-width"),
    );
  });
  textStrokeAlignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const align = button.dataset.textStrokeAlign || "center";

      setTextStrokeAlign(align);
      patchActiveTextLayer({ style: { strokeAlign: align } });
    });
  });
  textFontSelect?.addEventListener("change", () => {
    const selectedFont = populateTextFontStyleOptions(textFontSelect.value, textFontStyleSelect?.value);

    if (selectedFont && textFontStyleSelect) {
      textFontStyleSelect.value = selectedFont.style || "Regular";
    }

    patchTextFontFromControls();
  });
  textFontStyleSelect?.addEventListener("change", () => {
    patchTextFontFromControls();
  });
  textFontSizeInput?.addEventListener("input", () => {
    patchActiveTextLayer(
      { fontSize: clamp(textFontSizeInput.value, 1, 999) },
      "text-sidebar-font-size",
      getTextHistoryOptions("font-size"),
    );
  });
  textLetterSpacingInput?.addEventListener("input", () => {
    patchActiveTextLayer(
      { letterSpacing: clamp(textLetterSpacingInput.value, -200, 500) },
      "text-sidebar-letter-spacing",
      getTextHistoryOptions("letter-spacing"),
    );
  });
  textLineHeightInput?.addEventListener("input", () => {
    patchActiveTextLayer(
      { lineHeight: clamp(textLineHeightInput.value, 1, 999) },
      "text-sidebar-line-height",
      getTextHistoryOptions("line-height"),
    );
  });
  textAlignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const align = button.dataset.textAlign || "center";

      setTextAlign(align);
      patchActiveTextLayer({ textAlign: align });
    });
  });
  textUppercaseButton?.addEventListener("click", () => {
    const isActive = textUppercaseButton.getAttribute("aria-pressed") !== "true";

    setTextToggleButton(textUppercaseButton, isActive);
    patchActiveTextLayer({ uppercase: isActive });
  });
  textLigaturesButton?.addEventListener("click", () => {
    const isActive = textLigaturesButton.getAttribute("aria-pressed") !== "true";

    setTextToggleButton(textLigaturesButton, isActive);
    patchActiveTextLayer({ ligatures: isActive });
  });
  textAlternatesButton?.addEventListener("click", () => {
    const isActive = textAlternatesButton.getAttribute("aria-pressed") !== "true";

    setTextToggleButton(textAlternatesButton, isActive);
    patchActiveTextLayer({ alternates: isActive });
  });
  textBorderToggle?.addEventListener("click", () => {
    setTextBorderOpen(textBorderToggle.getAttribute("aria-expanded") !== "true");
  });
  textShadowSolidToggle?.addEventListener("click", () => {
    const isSolid = !isTextShadowSolidEnabled();

    setTextShadowSolidMode(isSolid);
    patchActiveTextLayer({
      shadowType: isSolid ? "solid" : "drop",
      style: {
        shadow: isSolid ? { blur: 0, opacity: 1 } : { opacity: 1 },
      },
    });
  });
  textShadowColorInput?.addEventListener("input", () => {
    syncTextShadowColor();
    patchActiveTextLayer(
      { style: { shadow: { color: textShadowColorInput.value, opacity: 1 } } },
      "text-sidebar-shadow-color",
      getTextHistoryOptions("shadow-color"),
    );
  });
  textShadowDepthInput?.addEventListener("input", () => {
    updateTextShadowDepth();
    patchActiveTextLayer({
      shadowDistance: clamp(textShadowDepthInput.value, 0, 500),
      style: { shadow: { opacity: 1 } },
    }, "text-sidebar-shadow-depth", getTextHistoryOptions("shadow-depth"));
  });
  textShadowAngleInput?.addEventListener("input", () => {
    updateTextShadowAngle();
    patchActiveTextLayer({
      shadowAngle: clamp(textShadowAngleInput.value, 0, 360),
      style: { shadow: { opacity: 1 } },
    }, "text-sidebar-shadow-angle", getTextHistoryOptions("shadow-angle"));
  });
  textShadowBlurInput?.addEventListener("input", () => {
    updateTextShadowBlur();
    patchActiveTextLayer(
      { style: { shadow: { blur: clamp(textShadowBlurInput.value, 0, 300), opacity: 1 } } },
      "text-sidebar-shadow-blur",
      getTextHistoryOptions("shadow-blur"),
    );
  });
  textShadowToggle?.addEventListener("click", () => {
    setTextShadowOpen(textShadowToggle.getAttribute("aria-expanded") !== "true");
  });
  textTransformAmountInput?.addEventListener("input", () => {
    updateTextTransformAmount();
    void patchActiveTextLayerPreservingVisualCenter({
      warp: { amount: clamp(textTransformAmountInput.value, -1200, 1200) },
    }, "text-sidebar-transform-amount", getTextHistoryOptions("transform-amount"));
  });
  textTransformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.textTransformMode;

      setTextTransformMode(mode);

      if (mode === "distort") {
        void initEnvelopeForActiveTextLayer();
      } else {
        void patchActiveTextLayerPreservingVisualCenter({
          envelopeGrid: null,
          warp: {
            type: mode === "flag" ? "flag" : "arch",
          },
        });
      }
    });
  });
  textTransformReset?.addEventListener("click", () => {
    setTextTransformMode("arch");

    if (textTransformAmountInput) {
      textTransformAmountInput.value = "170";
    }

    updateTextTransformAmount();
    void patchActiveTextLayerPreservingVisualCenter({
      envelopeGrid: null,
      warp: {
        amount: 170,
        type: "arch",
      },
    });
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

    currentToolName = activeTool;
    showTextSettings(shouldShowTextSettings(activeTool));
    showSmudgeSettings(activeTool === "smudge");
  });

  window.addEventListener("cbo:document-layers-change", () => {
    showTextSettings(shouldShowTextSettings());
    syncTextControlsFromLayer();
  });

  syncSmudgeControls();
  syncTextControls();
};
