window.CBO = window.CBO || {};

const TRANSFORM_MODE_ICONS = Object.freeze({
  freeTransform: `
    <svg class="lucide lucide-scaling-icon lucide-scaling" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M14 15H9v-5" />
      <path d="M16 3h5v5" />
      <path d="M21 3 9 15" />
    </svg>
  `,
  perspectiveDistort: `
    <svg class="transform-mode-fill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.3,2H6.7c-1.2,0-2.4,1-2.5,2.3l-1.7,13.9c-.3,2.1.9,3.8,2.5,3.8h14c1.7,0,2.8-1.8,2.5-3.8l-1.7-13.9c-.2-1.3-1.3-2.3-2.5-2.3ZM18.2,4.3l.5,5.3h-5.9V3.5c0,0,4.6,0,4.6,0,.4,0,.8.4.9.8ZM6.6,3.5h4.6v6.1h-6l.5-5.3c0-.4.4-.8.9-.8ZM4.4,18.2l.7-6.6h6.1v7.8h-5.9c-.5,0-.9-.6-.8-1.2ZM18.8,19.4h-5.8v-7.8c0,0,6,0,6,0l.7,6.6c0,.7-.3,1.2-.8,1.2Z" />
    </svg>
  `,
  warpTransform: `
    <svg class="lucide lucide-grid3x3-icon lucide-grid-3x3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  `,
  cancelTransform: `
    <svg class="lucide lucide-x-icon lucide-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  `,
  acceptTransform: `
    <svg class="lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  `,
});

const AREA_SELECTION_OPERATION_ICONS = Object.freeze({
  replace: `
    <svg class="lucide lucide-square-dashed-icon lucide-square-dashed" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M14 3h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M3 14v1" />
      <path d="M21 9v1" />
      <path d="M21 14v1" />
    </svg>
  `,
  add: `
    <svg class="lucide lucide-square-dashed-plus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M14 3h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M3 14v1" />
      <path d="M21 9v1" />
      <path d="M21 14v1" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  `,
  subtract: `
    <svg class="lucide lucide-square-dashed-minus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M14 3h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M3 14v1" />
      <path d="M21 9v1" />
      <path d="M21 14v1" />
      <path d="M8 12h8" />
    </svg>
  `,
});

const MOBILE_TEXT_PANEL_ICONS = Object.freeze({
  color: `
    <svg class="lucide lucide-palette-icon lucide-palette" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 22a10 10 0 1 1 10-10c0 3-1.5 4-3.5 4h-1.4a1.6 1.6 0 0 0-1.2 2.7 1.6 1.6 0 0 1-1.2 2.7z" />
    </svg>
  `,
  border: `
    <svg class="lucide lucide-square-dashed-icon lucide-square-dashed" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M14 3h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M3 14v1" />
      <path d="M21 9v1" />
      <path d="M21 14v1" />
    </svg>
  `,
  style: `
    <svg class="lucide lucide-type-icon lucide-type" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </svg>
  `,
  transform: `
    <svg class="lucide lucide-waves-icon lucide-waves" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 6c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" />
    </svg>
  `,
  shadow: `
    <svg class="lucide lucide-copy-icon lucide-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  `,
});

const MOBILE_TEXT_PANEL_BUTTONS = Object.freeze([
  { key: "color", label: "TEXT COLOR" },
  { key: "border", label: "BORDER" },
  { key: "style", label: "TEXT STYLE" },
  { key: "transform", label: "TRANSFORMATION" },
  { key: "shadow", label: "SHADOW" },
]);

function createMobileTextSettingsToolbar() {
  return `
    <nav class="bottom-toolbar mobile-text-settings-toolbar" aria-label="Text settings toolbar" data-mobile-text-settings-toolbar hidden>
      ${MOBILE_TEXT_PANEL_BUTTONS.map(({ key, label }) => `
        <button class="tool-button mobile-text-settings-button" type="button" aria-label="${label}" aria-pressed="false" data-tooltip="${label}" data-mobile-text-panel-trigger="${key}">
          ${MOBILE_TEXT_PANEL_ICONS[key]}
        </button>
      `).join("")}
    </nav>
  `;
}

window.CBO.initTopToolbar = function initTopToolbar() {
  const editorPage = document.querySelector(".editor-page");
  const BrushDefaults = window.CBO.BrushDefaults;
  const defaultBrushSettings = BrushDefaults.settings;
  const brushSizeMax = BrushDefaults.brushSizeMax || 500;

  if (!editorPage) {
    return;
  }

  if (document.querySelector(".top-toolbar-dock")) {
    return;
  }

  const dock = document.createElement("div");
  dock.className = "top-toolbar-dock";
  dock.setAttribute("aria-label", "Paint controls");
  dock.dataset.tooltipZone = "";
  window.CBO.brushSettings = BrushDefaults.createSettings(window.CBO.brushSettings);

  dock.innerHTML = `
    <nav class="bottom-toolbar area-selection-operation-toolbar" aria-label="Area selection operation toolbar" data-area-selection-operation-toolbar hidden>
      <button class="area-selection-operation-button active" type="button" aria-label="REPLACE SELECTION" aria-pressed="true" data-tooltip="REPLACE SELECTION 1" data-area-selection-operation="replace">
        ${AREA_SELECTION_OPERATION_ICONS.replace}
      </button>
      <button class="area-selection-operation-button" type="button" aria-label="ADD TO SELECTION" aria-pressed="false" data-tooltip="ADD TO SELECTION 2" data-area-selection-operation="add">
        ${AREA_SELECTION_OPERATION_ICONS.add}
      </button>
      <button class="area-selection-operation-button" type="button" aria-label="SUBTRACT FROM SELECTION" aria-pressed="false" data-tooltip="SUBTRACT FROM SELECTION 3" data-area-selection-operation="subtract">
        ${AREA_SELECTION_OPERATION_ICONS.subtract}
      </button>
    </nav>
    <nav class="bottom-toolbar transform-mode-toolbar" aria-label="Transform toolbar" data-transform-mode-toolbar hidden>
      <button class="transform-mode-button active" type="button" aria-label="FREE TRANSFORM" aria-pressed="true" data-tooltip="FREE TRANSFORM" data-transform-mode="free">
        ${TRANSFORM_MODE_ICONS.freeTransform}
      </button>
      <button class="transform-mode-button" type="button" aria-label="PERSPECTIVE DISTORTION" aria-pressed="false" data-tooltip="PERSPECTIVE DISTORTION" data-transform-mode="perspective">
        ${TRANSFORM_MODE_ICONS.perspectiveDistort}
      </button>
      <button class="transform-mode-button" type="button" aria-label="WARP" aria-pressed="false" data-tooltip="WARP" data-transform-mode="warp">
        ${TRANSFORM_MODE_ICONS.warpTransform}
      </button>
      <label class="transform-angle-control" data-tooltip="ROTATION ANGLE" data-transform-angle-control hidden>
        <svg class="transform-angle-icon lucide lucide-rotate-ccw-icon lucide-rotate-ccw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <input class="transform-angle-input" type="number" min="-360" max="360" step="1" value="0" aria-label="Rotation angle" autocomplete="off" data-transform-angle-input />
        <span class="transform-angle-unit" aria-hidden="true">°</span>
      </label>
      <div class="transform-mode-divider" aria-hidden="true" data-raster-transform-action-divider hidden></div>
      <button class="transform-mode-button transform-action-button transform-action-cancel" type="button" aria-label="ANNULLA TRASFORMAZIONE" data-tooltip="ANNULLA TRASFORMAZIONE" data-raster-transform-action="cancel" hidden disabled>
        ${TRANSFORM_MODE_ICONS.cancelTransform}
      </button>
      <button class="transform-mode-button transform-action-button transform-action-accept" type="button" aria-label="ACCETTA TRASFORMAZIONE" data-tooltip="ACCETTA TRASFORMAZIONE" data-raster-transform-action="accept" hidden disabled>
        ${TRANSFORM_MODE_ICONS.acceptTransform}
      </button>
    </nav>
    <nav class="bottom-toolbar text-add-toolbar" aria-label="Text toolbar" data-text-add-toolbar hidden>
      <button class="text-add-button" type="button" data-text-add-button>ADD TEXT</button>
    </nav>
    <section class="mobile-text-panel" aria-label="Mobile text settings" data-mobile-text-panel hidden>
      <div class="mobile-text-panel-section" data-mobile-text-panel-section="color" hidden>
        <label class="mobile-text-color-row">
          <span class="mobile-text-color-swatch" data-mobile-text-fill-swatch>
            <input class="mobile-text-color-input" type="color" value="#000000" aria-label="Text color" data-mobile-text-fill />
          </span>
          <span class="mobile-text-value-pill" data-mobile-text-fill-hex>000000</span>
          <span class="mobile-text-muted-value">100%</span>
        </label>
      </div>
      <div class="mobile-text-panel-section" data-mobile-text-panel-section="border" hidden>
        <label class="mobile-text-color-row">
          <span class="mobile-text-color-swatch mobile-text-border-swatch" data-mobile-text-border-swatch>
            <input class="mobile-text-color-input" type="color" value="#000000" aria-label="Border color" data-mobile-text-border-color />
          </span>
          <span class="mobile-text-value-pill" data-mobile-text-border-hex>000000</span>
          <span class="mobile-text-muted-value">100%</span>
        </label>
        <label class="mobile-text-range-field">
          <span class="mobile-text-control-header">
            <span class="mobile-text-label">Border</span>
            <output class="mobile-text-value-pill" data-mobile-text-border-weight-value>0.00</output>
          </span>
          <input class="mobile-text-range" type="range" min="0" max="120" step="0.01" value="0" aria-label="Border weight" data-mobile-text-border-weight />
        </label>
        <div class="mobile-text-segment-row" role="group" aria-label="Border position">
          <button class="mobile-text-segment-button" type="button" aria-pressed="false" data-mobile-text-stroke-align="outer">OUT</button>
          <button class="mobile-text-segment-button active" type="button" aria-pressed="true" data-mobile-text-stroke-align="center">MID</button>
          <button class="mobile-text-segment-button" type="button" aria-pressed="false" data-mobile-text-stroke-align="inner">IN</button>
        </div>
      </div>
      <div class="mobile-text-panel-section" data-mobile-text-panel-section="style" hidden>
        <textarea class="mobile-text-content-input" rows="2" autocomplete="off" spellcheck="false" aria-label="Text content" placeholder="TEXT" data-mobile-text-content></textarea>
        <div class="mobile-text-select-grid">
          <label class="mobile-text-select-wrap">
            <select class="mobile-text-select" aria-label="Font family" data-mobile-text-font></select>
          </label>
          <label class="mobile-text-select-wrap">
            <select class="mobile-text-select" aria-label="Font style" data-mobile-text-font-style></select>
          </label>
        </div>
        <div class="mobile-text-metrics" aria-label="Text metrics">
          <label class="mobile-text-metric">
            <span class="mobile-text-metric-icon">Tt</span>
            <input type="number" min="1" max="999" step="1" value="300" aria-label="Font size" data-mobile-text-font-size />
          </label>
          <label class="mobile-text-metric">
            <span class="mobile-text-metric-icon">AV</span>
            <input type="number" min="-200" max="500" step="1" value="0" aria-label="Letter spacing" data-mobile-text-letter-spacing />
          </label>
          <label class="mobile-text-metric">
            <span class="mobile-text-metric-icon">A|</span>
            <input type="number" min="1" max="999" step="1" value="182" aria-label="Line height" data-mobile-text-line-height />
          </label>
        </div>
        <div class="mobile-text-icon-grid" aria-label="Text formatting">
          <button class="mobile-text-icon-button" type="button" aria-label="Align left" aria-pressed="false" data-mobile-text-align="left">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M4 12h10" />
              <path d="M4 18h16" />
            </svg>
          </button>
          <button class="mobile-text-icon-button active" type="button" aria-label="Align center" aria-pressed="true" data-mobile-text-align="center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M7 12h10" />
              <path d="M4 18h16" />
            </svg>
          </button>
          <button class="mobile-text-icon-button" type="button" aria-label="Align right" aria-pressed="false" data-mobile-text-align="right">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M10 12h10" />
              <path d="M4 18h16" />
            </svg>
          </button>
          <button class="mobile-text-icon-button" type="button" aria-label="Uppercase" aria-pressed="false" data-mobile-text-uppercase>TT</button>
          <button class="mobile-text-icon-button active" type="button" aria-label="Ligatures" aria-pressed="true" data-mobile-text-ligatures>fi</button>
          <button class="mobile-text-icon-button" type="button" aria-label="Alternate glyphs" aria-pressed="false" data-mobile-text-alternates>A</button>
        </div>
      </div>
      <div class="mobile-text-panel-section" data-mobile-text-panel-section="transform" hidden>
        <div class="mobile-text-segment-row" role="group" aria-label="Transformation type">
          <button class="mobile-text-segment-button" type="button" aria-pressed="false" data-mobile-text-transform-mode="arch">ARCH</button>
          <button class="mobile-text-segment-button" type="button" aria-pressed="false" data-mobile-text-transform-mode="flag">FLAG</button>
          <button class="mobile-text-segment-button" type="button" aria-pressed="false" data-mobile-text-transform-mode="distort">DISTORT</button>
        </div>
        <label class="mobile-text-range-field" data-mobile-text-transform-range-field>
          <span class="mobile-text-control-header">
            <span class="mobile-text-label" data-mobile-text-transform-label>Transform</span>
            <output class="mobile-text-value-pill" data-mobile-text-transform-value>0</output>
          </span>
          <input class="mobile-text-range" type="range" min="-1200" max="1200" step="1" value="0" aria-label="Transformation amount" data-mobile-text-transform-amount />
        </label>
        <div class="mobile-text-action-row" data-mobile-text-transform-actions hidden>
          <button class="mobile-text-secondary-button" type="button" data-mobile-text-transform-reset>Reset</button>
          <button class="mobile-text-primary-button" type="button" data-mobile-text-transform-modify>Modify</button>
        </div>
      </div>
      <div class="mobile-text-panel-section" data-mobile-text-panel-section="shadow" hidden>
        <div class="mobile-text-toggle-row">
          <span class="mobile-text-label">Solid 3D</span>
          <button class="mobile-text-toggle-button" type="button" aria-label="Solid 3D shadow" aria-pressed="false" data-mobile-text-shadow-solid>
            <span></span>
          </button>
        </div>
        <label class="mobile-text-color-row">
          <span class="mobile-text-color-swatch mobile-text-shadow-swatch" data-mobile-text-shadow-swatch>
            <input class="mobile-text-color-input" type="color" value="#000000" aria-label="Shadow color" data-mobile-text-shadow-color />
          </span>
          <span class="mobile-text-value-pill" data-mobile-text-shadow-hex>000000</span>
          <span class="mobile-text-muted-value">100%</span>
        </label>
        <label class="mobile-text-range-field">
          <span class="mobile-text-control-header">
            <span class="mobile-text-label">Depth</span>
            <output class="mobile-text-value-pill" data-mobile-text-shadow-depth-value>24</output>
          </span>
          <input class="mobile-text-range" type="range" min="0" max="500" step="1" value="24" aria-label="Shadow depth" data-mobile-text-shadow-depth />
        </label>
        <label class="mobile-text-range-field">
          <span class="mobile-text-control-header">
            <span class="mobile-text-label">Angle</span>
            <output class="mobile-text-value-pill" data-mobile-text-shadow-angle-value>45</output>
          </span>
          <input class="mobile-text-range" type="range" min="0" max="360" step="1" value="45" aria-label="Shadow angle" data-mobile-text-shadow-angle />
        </label>
        <label class="mobile-text-range-field" data-mobile-text-shadow-blur-field>
          <span class="mobile-text-control-header">
            <span class="mobile-text-label">Blur</span>
            <output class="mobile-text-value-pill" data-mobile-text-shadow-blur-value>0.00</output>
          </span>
          <input class="mobile-text-range" type="range" min="0" max="300" step="0.01" value="0" aria-label="Shadow blur" data-mobile-text-shadow-blur />
        </label>
      </div>
    </section>
    <div class="brush-quick-controls" data-brush-quick-controls hidden>
      <label class="bottom-toolbar brush-quick-toolbar">
        <span class="brush-quick-label">SIZE</span>
        <input class="brush-quick-range" type="range" min="1" max="${brushSizeMax}" step="1" data-brush-quick-input="radius" aria-label="Brush size" />
        <span class="brush-quick-value" data-brush-quick-value="radius"></span>
      </label>
      <label class="bottom-toolbar brush-quick-toolbar">
        <span class="brush-quick-label">OPACITY</span>
        <input class="brush-quick-range" type="range" min="0" max="100" step="1" data-brush-quick-input="opacity" aria-label="Brush opacity" />
        <span class="brush-quick-value" data-brush-quick-value="opacity"></span>
      </label>
    </div>
    <nav class="bottom-toolbar top-history-toolbar" aria-label="History toolbar">
      <button class="tool-button" type="button" aria-label="UNDO" aria-pressed="false" data-tooltip="UNDO Ctrl+Z" data-history-action="undo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          <path d="m9 10-5 5 5 5" />
        </svg>
      </button>
      <button class="tool-button" type="button" aria-label="REDO" aria-pressed="false" data-tooltip="REDO Ctrl+Shift+Z" data-history-action="redo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 10 5 5-5 5" />
          <path d="M4 4v7a4 4 0 0 0 4 4h12" />
        </svg>
      </button>
    </nav>
    <nav class="bottom-toolbar top-layers-toolbar" aria-label="Layers toolbar">
      <button class="tool-button top-layers-button" type="button" aria-label="LAYERS" aria-pressed="false" data-tooltip="LAYERS" data-drawer-sync="layers">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
          <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
          <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
        </svg>
      </button>
      <button class="tool-button top-rasterize-text-button" type="button" aria-label="RASTERIZE" aria-pressed="false" data-tooltip="RASTERIZE TEXT" data-rasterize-text hidden>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4h6v6H4z" />
          <path d="M14 4h6v6h-6z" />
          <path d="M4 14h6v6H4z" />
          <path d="M14 14h6v6h-6z" />
          <path d="M10 12h4" />
          <path d="M12 10v4" />
        </svg>
      </button>
    </nav>
    <nav class="bottom-toolbar top-toolbar" aria-label="Paint toolbar">
      <div class="tool-group" aria-label="Brush tools">
        <button class="tool-button" type="button" aria-label="BRUSH" aria-pressed="false" data-tooltip="BRUSH" data-toolset-primary="top-brush" data-tool-sync="brush" data-tool-mode="brush" data-tool>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m11 10 3 3" />
            <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" />
            <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />
          </svg>
        </button>
        <button class="tool-button tool-menu-button" type="button" aria-label="Brush tools" aria-pressed="false" data-tooltip="Brush tools">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span class="tool-popover" aria-hidden="true">
            <span class="popover-option active" data-toolset-option="top-brush" data-label="BRUSH">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m11 10 3 3" />
                <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" />
                <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />
              </svg>
              <span class="popover-label">BRUSH</span>
              <span class="popover-key"></span>
            </span>
          </span>
        </button>
      </div>
      <button class="tool-button" type="button" aria-label="SMUDGE" aria-pressed="false" data-tooltip="SMUDGE" data-tool-sync="smudge" data-tool-mode="smudge" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 14a8 8 0 0 1-8 8" />
          <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
          <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
          <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
      <button class="tool-button" type="button" aria-label="ERASER" aria-pressed="false" data-tooltip="ERASER" data-tool-mode="eraser" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
          <path d="m5.082 11.09 8.828 8.828" />
        </svg>
      </button>
      <button class="tool-button color-picker-button" type="button" aria-label="COLOR" aria-expanded="false" data-tooltip="COLOR">
        <span class="color-picker-swatch" aria-hidden="true"></span>
      </button>
    </nav>
  `;

  editorPage.appendChild(dock);

  const textAddToolbar = dock.querySelector("[data-text-add-toolbar]");
  const mobileTextPanel = dock.querySelector("[data-mobile-text-panel]");

  if (textAddToolbar) {
    editorPage.appendChild(textAddToolbar);
  }

  if (mobileTextPanel) {
    editorPage.appendChild(mobileTextPanel);
  }

  const toolbarDock = document.querySelector(".toolbar-dock");
  const mainToolsToolbar = toolbarDock?.querySelector("[data-main-tools-toolbar]") ||
    toolbarDock?.querySelector(".bottom-toolbar:not(.history-toolbar)");
  let mobileTextToolbar = toolbarDock?.querySelector("[data-mobile-text-settings-toolbar]");

  mainToolsToolbar?.classList.add("main-tools-toolbar");
  mainToolsToolbar?.setAttribute("data-main-tools-toolbar", "");

  if (toolbarDock && !mobileTextToolbar) {
    const template = document.createElement("template");

    template.innerHTML = createMobileTextSettingsToolbar().trim();
    mobileTextToolbar = template.content.firstElementChild;
    toolbarDock.insertBefore(mobileTextToolbar, toolbarDock.querySelector(".history-toolbar"));
  }

  const layersButtons = document.querySelectorAll(".top-layers-button");
  const rasterizeTextButtons = document.querySelectorAll("[data-rasterize-text]");
  const areaSelectionOperationToolbar = dock.querySelector("[data-area-selection-operation-toolbar]");
  const areaSelectionOperationButtons = dock.querySelectorAll("[data-area-selection-operation]");
  const transformModeToolbar = dock.querySelector("[data-transform-mode-toolbar]");
  const transformModeButtons = dock.querySelectorAll("[data-transform-mode]");
  const transformAngleControl = dock.querySelector("[data-transform-angle-control]");
  const transformAngleInput = dock.querySelector("[data-transform-angle-input]");
  const rasterTransformActionDivider = dock.querySelector("[data-raster-transform-action-divider]");
  const rasterTransformActionButtons = dock.querySelectorAll("[data-raster-transform-action]");
  const textAddButton = textAddToolbar?.querySelector("[data-text-add-button]");
  const mobileTextPanelSections = mobileTextPanel?.querySelectorAll("[data-mobile-text-panel-section]") || [];
  const mobileTextPanelButtons = mobileTextToolbar?.querySelectorAll("[data-mobile-text-panel-trigger]") || [];
  const mobileTextFillInput = mobileTextPanel?.querySelector("[data-mobile-text-fill]");
  const mobileTextFillHex = mobileTextPanel?.querySelector("[data-mobile-text-fill-hex]");
  const mobileTextFillSwatch = mobileTextPanel?.querySelector("[data-mobile-text-fill-swatch]");
  const mobileTextBorderColorInput = mobileTextPanel?.querySelector("[data-mobile-text-border-color]");
  const mobileTextBorderHex = mobileTextPanel?.querySelector("[data-mobile-text-border-hex]");
  const mobileTextBorderSwatch = mobileTextPanel?.querySelector("[data-mobile-text-border-swatch]");
  const mobileTextBorderWeightInput = mobileTextPanel?.querySelector("[data-mobile-text-border-weight]");
  const mobileTextBorderWeightValue = mobileTextPanel?.querySelector("[data-mobile-text-border-weight-value]");
  const mobileTextStrokeAlignButtons = mobileTextPanel?.querySelectorAll("[data-mobile-text-stroke-align]") || [];
  const mobileTextContentInput = mobileTextPanel?.querySelector("[data-mobile-text-content]");
  const mobileTextFontSelect = mobileTextPanel?.querySelector("[data-mobile-text-font]");
  const mobileTextFontStyleSelect = mobileTextPanel?.querySelector("[data-mobile-text-font-style]");
  const mobileTextFontSizeInput = mobileTextPanel?.querySelector("[data-mobile-text-font-size]");
  const mobileTextLetterSpacingInput = mobileTextPanel?.querySelector("[data-mobile-text-letter-spacing]");
  const mobileTextLineHeightInput = mobileTextPanel?.querySelector("[data-mobile-text-line-height]");
  const mobileTextAlignButtons = mobileTextPanel?.querySelectorAll("[data-mobile-text-align]") || [];
  const mobileTextUppercaseButton = mobileTextPanel?.querySelector("[data-mobile-text-uppercase]");
  const mobileTextLigaturesButton = mobileTextPanel?.querySelector("[data-mobile-text-ligatures]");
  const mobileTextAlternatesButton = mobileTextPanel?.querySelector("[data-mobile-text-alternates]");
  const mobileTextTransformModeButtons = mobileTextPanel?.querySelectorAll("[data-mobile-text-transform-mode]") || [];
  const mobileTextTransformRangeField = mobileTextPanel?.querySelector("[data-mobile-text-transform-range-field]");
  const mobileTextTransformActions = mobileTextPanel?.querySelector("[data-mobile-text-transform-actions]");
  const mobileTextTransformAmountInput = mobileTextPanel?.querySelector("[data-mobile-text-transform-amount]");
  const mobileTextTransformValue = mobileTextPanel?.querySelector("[data-mobile-text-transform-value]");
  const mobileTextTransformLabel = mobileTextPanel?.querySelector("[data-mobile-text-transform-label]");
  const mobileTextTransformReset = mobileTextPanel?.querySelector("[data-mobile-text-transform-reset]");
  const mobileTextTransformModify = mobileTextPanel?.querySelector("[data-mobile-text-transform-modify]");
  const mobileTextShadowSolidToggle = mobileTextPanel?.querySelector("[data-mobile-text-shadow-solid]");
  const mobileTextShadowColorInput = mobileTextPanel?.querySelector("[data-mobile-text-shadow-color]");
  const mobileTextShadowHex = mobileTextPanel?.querySelector("[data-mobile-text-shadow-hex]");
  const mobileTextShadowSwatch = mobileTextPanel?.querySelector("[data-mobile-text-shadow-swatch]");
  const mobileTextShadowDepthInput = mobileTextPanel?.querySelector("[data-mobile-text-shadow-depth]");
  const mobileTextShadowDepthValue = mobileTextPanel?.querySelector("[data-mobile-text-shadow-depth-value]");
  const mobileTextShadowAngleInput = mobileTextPanel?.querySelector("[data-mobile-text-shadow-angle]");
  const mobileTextShadowAngleValue = mobileTextPanel?.querySelector("[data-mobile-text-shadow-angle-value]");
  const mobileTextShadowBlurField = mobileTextPanel?.querySelector("[data-mobile-text-shadow-blur-field]");
  const mobileTextShadowBlurInput = mobileTextPanel?.querySelector("[data-mobile-text-shadow-blur]");
  const mobileTextShadowBlurValue = mobileTextPanel?.querySelector("[data-mobile-text-shadow-blur-value]");
  const quickControls = dock.querySelector("[data-brush-quick-controls]");
  const quickInputs = dock.querySelectorAll("[data-brush-quick-input]");
  const quickValues = dock.querySelectorAll("[data-brush-quick-value]");
  let selectedTransformMode = "free";
  let selectedAreaSelectionOperation = "replace";
  let isResizeToolActive = false;
  let isRotateToolActive = false;
  let isRasterTransformPending = false;
  let isSyncingTransformAngle = false;
  let currentToolIsText = false;
  let isSyncingMobileTextControls = false;
  let textGeometryPatchRevision = 0;
  const allowedTransformModes = new Set(["free", "perspective", "warp"]);
  const allowedAreaSelectionOperations = new Set(["replace", "add", "subtract"]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function getBrushSettings() {
    window.CBO.brushSettings = BrushDefaults.createSettings(window.CBO.brushSettings);

    return window.CBO.brushSettings;
  }

  function getControlDisplayValue(key, settings = getBrushSettings()) {
    if (key === "opacity") {
      return clamp(Math.round(Number(settings.opacity ?? defaultBrushSettings.opacity) * 100), 0, 100);
    }

    return clamp(Math.round(Number(settings.radius ?? defaultBrushSettings.radius)), 1, brushSizeMax);
  }

  function updateRangeProgress(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty("--brush-quick-range-progress", `${progress}%`);
  }

  function syncQuickControls() {
    const settings = getBrushSettings();

    quickInputs.forEach((input) => {
      const key = input.dataset.brushQuickInput;
      const displayValue = getControlDisplayValue(key, settings);

      input.value = String(displayValue);
      updateRangeProgress(input);
    });

    quickValues.forEach((valueElement) => {
      const key = valueElement.dataset.brushQuickValue;
      const displayValue = getControlDisplayValue(key, settings);

      valueElement.textContent = key === "opacity" ? `${displayValue}%` : `${displayValue}px`;
    });
  }

  function dispatchBrushSettings() {
    window.dispatchEvent(
      new CustomEvent("cbo:brush-settings-change", {
        detail: {
          source: "quick-controls",
          persistBrushPreset: false,
          settings: { ...getBrushSettings() },
        },
      }),
    );
  }

  function updateBrushSetting(key, displayValue) {
    const settings = getBrushSettings();

    if (key === "opacity") {
      settings.opacity = clamp(displayValue, 0, 100) / 100;
    } else if (key === "radius") {
      settings.radius = clamp(displayValue, 1, brushSizeMax);
    }

    syncQuickControls();
    dispatchBrushSettings();
  }

  function showBrushQuickControls(isVisible) {
    if (!quickControls) {
      return;
    }

    quickControls.hidden = !isVisible;

    if (isVisible) {
      syncQuickControls();
    }
  }

  function setAreaSelectionOperation(mode, options = {}) {
    const normalizedMode = String(mode || "").trim().toLowerCase();

    if (!allowedAreaSelectionOperations.has(normalizedMode)) {
      return;
    }

    selectedAreaSelectionOperation = normalizedMode;

    areaSelectionOperationButtons.forEach((button) => {
      const isActive = button.dataset.areaSelectionOperation === selectedAreaSelectionOperation;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (options.emit !== false) {
      window.CBO.areaSelection?.setOperationMode?.(selectedAreaSelectionOperation, {
        source: options.source || "area-selection-operation-toolbar",
      });
    }
  }

  function showAreaSelectionOperationToolbar(isVisible) {
    if (!areaSelectionOperationToolbar) {
      return;
    }

    areaSelectionOperationToolbar.hidden = !isVisible;

    if (isVisible) {
      setAreaSelectionOperation(
        window.CBO.areaSelection?.getOperationMode?.() || selectedAreaSelectionOperation,
        { emit: false },
      );
    }
  }

  function setTransformMode(mode, options = {}) {
    const normalizedMode = String(mode || "").trim().toLowerCase();

    if (!allowedTransformModes.has(normalizedMode)) {
      return;
    }

    selectedTransformMode = normalizedMode;

    transformModeButtons.forEach((button) => {
      const isActive = button.dataset.transformMode === selectedTransformMode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    window.CBO.transformMode = selectedTransformMode;

    if (options.emit !== false) {
      window.dispatchEvent(
        new CustomEvent("cbo:transform-mode-change", {
          detail: {
            mode: selectedTransformMode,
            source: options.source || "transform-mode-toolbar",
          },
        }),
      );
    }
  }

  function showTransformModeToolbar(isVisible) {
    if (!transformModeToolbar) {
      return;
    }

    isResizeToolActive = Boolean(isVisible);
    transformModeToolbar.hidden = !isVisible;

    if (!isVisible) {
      isRasterTransformPending = false;
    }

    if (isVisible) {
      setTransformMode(selectedTransformMode, { emit: false });
    }

    syncRasterTransformActions();
  }

  function showTransformAngleControl(isVisible) {
    if (!transformAngleControl) {
      return;
    }

    transformAngleControl.hidden = !isVisible;
  }

  function showTextAddToolbar(isVisible) {
    if (!textAddToolbar) {
      return;
    }

    textAddToolbar.hidden = !isVisible;
  }

  function isMobileTextToolbarViewport() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true;
  }

  function getTextCreationCenter() {
    const renderer = window.CBO.documentRenderer;

    if (renderer && Number.isFinite(renderer.width) && Number.isFinite(renderer.height)) {
      return {
        x: Math.max(1, renderer.width) / 2,
        y: Math.max(1, renderer.height) / 2,
      };
    }

    return null;
  }

  function syncTransformAngleInput(degrees = 0) {
    if (!transformAngleInput) {
      return;
    }

    isSyncingTransformAngle = true;
    transformAngleInput.value = String(degrees);
    isSyncingTransformAngle = false;
  }

  function dispatchTransformAngleInput() {
    if (!transformAngleInput || isSyncingTransformAngle) {
      return;
    }

    const degrees = Number(transformAngleInput.value);

    if (!Number.isFinite(degrees)) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("cbo:raster-transform-rotation-input", {
        detail: {
          degrees,
          source: "transform-angle-control",
        },
      }),
    );
  }

  function syncRasterTransformActions() {
    const shouldShow = isResizeToolActive && isRasterTransformPending;

    transformModeToolbar?.classList.toggle("mobile-transform-actions-visible", shouldShow);

    if (rasterTransformActionDivider) {
      rasterTransformActionDivider.hidden = !shouldShow;
    }

    rasterTransformActionButtons.forEach((button) => {
      button.hidden = !shouldShow;
      button.disabled = !shouldShow;
    });
  }

  function getActiveLayer() {
    const layerModel = window.CBO.documentLayerModel;

    return layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
  }

  function isVectorTextLayer(layer) {
    return layer?.type === "vector-text" || layer?.type === "text" || layer?.kind === "text";
  }

  function getActiveTextLayer() {
    const activeLayer = getActiveLayer();

    return isVectorTextLayer(activeLayer) ? activeLayer : null;
  }

  function getTopmostTextLayer() {
    const layerModel = window.CBO.documentLayerModel;
    const layers = layerModel?.getRenderableLayers?.() || [];

    return layers.slice().reverse().find((layer) =>
      isVectorTextLayer(layer) && layer.locked !== true
    ) || null;
  }

  function ensureActiveTextLayerForTransform(source = "mobile-text-transform-select") {
    const activeLayer = getActiveTextLayer();

    if (activeLayer) {
      return activeLayer;
    }

    const layerModel = window.CBO.documentLayerModel;
    const fallbackLayer = getTopmostTextLayer();

    if (!layerModel || !fallbackLayer) {
      return null;
    }

    layerModel.setActiveLayer?.(fallbackLayer.id, { source });

    return layerModel.findEntryById?.(fallbackLayer.id) || fallbackLayer;
  }

  function requestTextTransformEdit(layer, source = "mobile-text-transform-mode") {
    if (!layer?.id) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("cbo:text-transform-edit-request", {
        detail: {
          layerId: layer.id,
          source,
        },
      }),
    );
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

  function patchActiveTextLayer(patch, source = "mobile-text-toolbar", historyOptions = {}) {
    if (isSyncingMobileTextControls) {
      return;
    }

    const layerModel = window.CBO.documentLayerModel;
    const layer = getActiveTextLayer();

    if (!layer || !layerModel?.updateLayer) {
      return;
    }

    layerModel.updateLayer(layer.id, mergeTextLayerPatch(layer, patch), {
      ...historyOptions,
      source,
    });
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

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
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

  async function patchActiveTextLayerPreservingVisualCenter(
    patch,
    source = "mobile-text-transform",
    historyOptions = {},
  ) {
    if (isSyncingMobileTextControls) {
      return;
    }

    const layerModel = window.CBO.documentLayerModel;
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
      console.warn("Impossibile preservare il centro della trasformazione testo mobile.", error);
      patchActiveTextLayer(patch, source, historyOptions);
    }
  }

  function getMobileTextHistoryGroup(suffix, layer = getActiveTextLayer()) {
    const key = String(suffix || "").trim();

    return key && layer?.id ? `mobile-text-${key}-${layer.id}` : "";
  }

  function getMobileTextHistoryOptions(suffix) {
    const historyGroup = getMobileTextHistoryGroup(suffix);

    return historyGroup ? { historyGroup } : {};
  }

  function bindMobileTextHistoryGroup(control, suffix) {
    if (!control) {
      return;
    }

    let activeGroup = "";

    control.addEventListener("focus", () => {
      activeGroup = getMobileTextHistoryGroup(suffix);
      window.CBO.documentHistory?.beginGroup?.(activeGroup);
    });

    control.addEventListener("blur", () => {
      window.CBO.documentHistory?.endGroup?.(activeGroup);
      activeGroup = "";
    });
  }

  function normalizeHexColor(value, fallback = "#000000") {
    const color = String(value || "").trim();

    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  function getStoredTextEffect(layer, key) {
    const value = layer?.textEffectState?.[key];

    return value && typeof value === "object" ? value : {};
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

  function isRasterizableImageLayer(layer) {
    return layer?.type === "image" &&
      layer.locked !== true &&
      typeof window.CBO.rasterizeActiveImageLayer === "function";
  }

  function hasRasterizableLayerEffects(layer) {
    return window.CBO.hasRasterizableLayerEffects?.(layer) === true &&
      typeof window.CBO.rasterizeActiveLayerEffects === "function";
  }

  function syncRasterizeTextButton() {
    if (!rasterizeTextButtons.length) {
      return;
    }

    const activeLayer = getActiveLayer();
    const canRasterizeText = isVectorTextLayer(activeLayer) &&
      typeof window.CBO.rasterizeActiveVectorTextLayer === "function";
    const canRasterizeEffects = !canRasterizeText && hasRasterizableLayerEffects(activeLayer);
    const canRasterizeImage = !canRasterizeText && !canRasterizeEffects && isRasterizableImageLayer(activeLayer);
    const canRasterize = canRasterizeText || canRasterizeEffects || canRasterizeImage;
    const tooltip = canRasterizeEffects
      ? "RASTERIZE EFFECTS"
      : canRasterizeImage
        ? "RASTERIZE IMAGE"
        : "RASTERIZE TEXT";

    rasterizeTextButtons.forEach((button) => {
      const isMobileToolbarButton = button.classList.contains("mobile-rasterize-text-button");

      button.hidden = !canRasterize && !isMobileToolbarButton;
      button.disabled = !canRasterize;
      button.dataset.rasterizeMode = canRasterizeEffects
        ? "effects"
        : canRasterizeImage
          ? "image"
          : "text";
      button.dataset.tooltip = tooltip;
    });
  }

  function showMobileTextToolbar(isVisible) {
    if (!mobileTextToolbar || !toolbarDock) {
      return;
    }

    const shouldShow = Boolean(isVisible);

    mobileTextToolbar.hidden = !shouldShow;
    toolbarDock.classList.toggle("mobile-text-settings-active", shouldShow);

    if (!shouldShow) {
      closeMobileTextPanel();
    }
  }

  function closeMobileTextPanel() {
    if (mobileTextPanel) {
      mobileTextPanel.hidden = true;
    }

    mobileTextPanelSections.forEach((section) => {
      section.hidden = true;
    });

    mobileTextPanelButtons.forEach((button) => {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
  }

  function updateMobileRangeProgress(input, valueElement, formatValue) {
    if (!input) {
      return;
    }

    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = clamp(input.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    input.style.setProperty("--mobile-text-range-progress", `${progress}%`);

    if (valueElement) {
      valueElement.textContent = formatValue(value);
    }
  }

  function syncMobileHexColor(input, valueElement, swatch) {
    if (!input) {
      return;
    }

    const color = normalizeHexColor(input.value, "#000000");
    const hex = color.replace("#", "").toUpperCase();

    input.value = color;

    if (valueElement) {
      valueElement.textContent = hex;
    }

    if (swatch) {
      swatch.style.background = color;
    }
  }

  function setMobileTextToggleButton(button, isActive) {
    if (!button) {
      return;
    }

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  function setMobileTextAlign(align) {
    const nextAlign = ["left", "center", "right"].includes(align) ? align : "center";

    mobileTextAlignButtons.forEach((button) => {
      const isActive = button.dataset.mobileTextAlign === nextAlign;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setMobileTextStrokeAlign(align) {
    const nextAlign = ["outer", "inner", "center"].includes(align) ? align : "center";

    mobileTextStrokeAlignButtons.forEach((button) => {
      const isActive = button.dataset.mobileTextStrokeAlign === nextAlign;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function getMobileTextTransformLabel(mode) {
    if (mode === "flag") {
      return "Flag";
    }

    if (mode === "distort") {
      return "Distort";
    }

    if (mode === "none") {
      return "Transform";
    }

    return "Arch";
  }

  function setMobileTextTransformMode(mode) {
    const nextMode = mode === "arch" || mode === "flag" || mode === "distort" ? mode : "none";
    const isDistort = nextMode === "distort";

    mobileTextTransformModeButtons.forEach((button) => {
      const isActive = button.dataset.mobileTextTransformMode === nextMode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (mobileTextTransformLabel) {
      mobileTextTransformLabel.textContent = getMobileTextTransformLabel(nextMode);
    }

    if (mobileTextTransformRangeField) {
      mobileTextTransformRangeField.hidden = isDistort;
    }

    if (mobileTextTransformActions) {
      mobileTextTransformActions.hidden = !isDistort;
    }
  }

  function getActiveMobileTextTransformMode() {
    const activeButton = Array.from(mobileTextTransformModeButtons).find((button) =>
      button.classList.contains("active"),
    );

    return activeButton?.dataset.mobileTextTransformMode || "none";
  }

  function setMobileTextShadowSolidMode(isEnabled) {
    if (!mobileTextShadowSolidToggle) {
      return;
    }

    mobileTextShadowSolidToggle.classList.toggle("active", isEnabled);
    mobileTextShadowSolidToggle.setAttribute("aria-pressed", String(isEnabled));

    if (mobileTextShadowBlurField) {
      mobileTextShadowBlurField.hidden = isEnabled;
    }
  }

  function isMobileTextShadowSolidEnabled() {
    return mobileTextShadowSolidToggle?.getAttribute("aria-pressed") === "true";
  }

  function syncMobileTextShadowControls() {
    syncMobileHexColor(mobileTextShadowColorInput, mobileTextShadowHex, mobileTextShadowSwatch);
    updateMobileRangeProgress(mobileTextShadowDepthInput, mobileTextShadowDepthValue, (value) => String(Math.round(value)));
    updateMobileRangeProgress(mobileTextShadowAngleInput, mobileTextShadowAngleValue, (value) => String(Math.round(value)));
    updateMobileRangeProgress(mobileTextShadowBlurInput, mobileTextShadowBlurValue, (value) => value.toFixed(2));
    setMobileTextShadowSolidMode(isMobileTextShadowSolidEnabled());
  }

  function populateMobileTextFontStyleOptions(family, preferredStyle) {
    if (!mobileTextFontStyleSelect) {
      return null;
    }

    const fonts = getFontsByFamily(family);
    const selectedFont = fonts.find((font) => font.style === preferredStyle) || fonts[0] || null;

    mobileTextFontStyleSelect.replaceChildren(
      ...fonts.map((font) => {
        const option = document.createElement("option");

        option.value = font.style || "Regular";
        option.textContent = font.style || "Regular";

        return option;
      }),
    );

    if (selectedFont) {
      mobileTextFontStyleSelect.value = selectedFont.style || "Regular";
    }

    return selectedFont;
  }

  function populateMobileTextFontFamilyOptions() {
    if (!mobileTextFontSelect) {
      return;
    }

    const families = getUniqueFontFamilies();
    const currentValue = mobileTextFontSelect.value;

    mobileTextFontSelect.replaceChildren(
      ...families.map((font) => {
        const option = document.createElement("option");

        option.value = font.family;
        option.textContent = font.family;

        return option;
      }),
    );

    if (families.some((font) => font.family === currentValue)) {
      mobileTextFontSelect.value = currentValue;
    }
  }

  function syncMobileTextFontControlsFromLayer(layer) {
    const fontRecord = findFontRecordForLayer(layer);
    const family = fontRecord?.family || layer.fontFamily || mobileTextFontSelect?.value || "UnifrakturCook";
    const style = fontRecord?.style || layer.fontStyle || mobileTextFontStyleSelect?.value || "Bold";

    populateMobileTextFontFamilyOptions();

    if (mobileTextFontSelect) {
      mobileTextFontSelect.value = family;

      if (mobileTextFontSelect.value !== family) {
        mobileTextFontSelect.selectedIndex = 0;
      }
    }

    populateMobileTextFontStyleOptions(mobileTextFontSelect?.value || family, style);
  }

  function patchMobileTextFontFromControls() {
    const family = mobileTextFontSelect?.value;
    const style = mobileTextFontStyleSelect?.value;
    const fontRecord = findFontRecordForSelection(family, style);

    if (!fontRecord) {
      return;
    }

    void patchActiveTextLayerPreservingVisualCenter({
      fontFamily: fontRecord.family,
      fontLabel: fontRecord.label || fontRecord.family,
      fontStyle: fontRecord.style || "Regular",
      fontUrl: fontRecord.url,
    }, "mobile-text-font");
  }

  function syncMobileTextControlsFromLayer(layer = getActiveTextLayer()) {
    if (!layer) {
      return;
    }

    isSyncingMobileTextControls = true;

    try {
      if (mobileTextContentInput) {
        mobileTextContentInput.value = layer.text || "";
      }

      if (mobileTextFillInput) {
        mobileTextFillInput.value = normalizeHexColor(layer.style?.fill, "#000000");
      }

      if (mobileTextBorderColorInput) {
        mobileTextBorderColorInput.value = normalizeHexColor(layer.style?.stroke, "#000000");
      }

      if (mobileTextBorderWeightInput) {
        mobileTextBorderWeightInput.value = String(Number.isFinite(layer.style?.strokeWidth) ? layer.style.strokeWidth : 0);
      }

      setMobileTextStrokeAlign(layer.style?.strokeAlign || "center");
      syncMobileTextFontControlsFromLayer(layer);

      if (mobileTextFontSizeInput) {
        mobileTextFontSizeInput.value = String(Math.round(Number.isFinite(layer.fontSize) ? layer.fontSize : 300));
      }

      if (mobileTextLetterSpacingInput) {
        mobileTextLetterSpacingInput.value = String(Math.round(Number.isFinite(layer.letterSpacing) ? layer.letterSpacing : 0));
      }

      if (mobileTextLineHeightInput) {
        mobileTextLineHeightInput.value = String(Math.round(Number.isFinite(layer.lineHeight) ? layer.lineHeight : 182));
      }

      setMobileTextAlign(layer.textAlign || "center");
      setMobileTextToggleButton(mobileTextUppercaseButton, layer.uppercase === true);
      setMobileTextToggleButton(mobileTextLigaturesButton, layer.ligatures !== false);
      setMobileTextToggleButton(mobileTextAlternatesButton, layer.alternates === true);
      setMobileTextTransformMode(layer.envelopeGrid ? "distort" : layer.warp?.type || "none");

      if (mobileTextTransformAmountInput) {
        mobileTextTransformAmountInput.value = String(Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0);
      }

      setMobileTextShadowSolidMode(layer.shadowType === "solid");

      if (mobileTextShadowColorInput) {
        mobileTextShadowColorInput.value = normalizeHexColor(layer.style?.shadow?.color, "#000000");
      }

      if (mobileTextShadowDepthInput) {
        mobileTextShadowDepthInput.value = String(Math.round(Number.isFinite(layer.shadowDistance) ? layer.shadowDistance : 0));
      }

      if (mobileTextShadowAngleInput) {
        mobileTextShadowAngleInput.value = String(Math.round(Number.isFinite(layer.shadowAngle) ? layer.shadowAngle : 0));
      }

      if (mobileTextShadowBlurInput) {
        mobileTextShadowBlurInput.value = String(Number.isFinite(layer.style?.shadow?.blur) ? layer.style.shadow.blur : 0);
      }

      syncMobileHexColor(mobileTextFillInput, mobileTextFillHex, mobileTextFillSwatch);
      syncMobileHexColor(mobileTextBorderColorInput, mobileTextBorderHex, mobileTextBorderSwatch);
      updateMobileRangeProgress(mobileTextBorderWeightInput, mobileTextBorderWeightValue, (value) => value.toFixed(2));
      updateMobileRangeProgress(mobileTextTransformAmountInput, mobileTextTransformValue, (value) => String(Math.round(value)));
      syncMobileTextShadowControls();
    } finally {
      isSyncingMobileTextControls = false;
    }
  }

  function enableMobileTextBorderEffect() {
    const layer = getActiveTextLayer();
    const strokeWidth = Number.isFinite(layer?.style?.strokeWidth) ? layer.style.strokeWidth : 0;

    if (!layer || strokeWidth > 0) {
      return;
    }

    const stored = getStoredTextEffect(layer, "border");
    const inputValue = mobileTextBorderWeightInput
      ? clamp(mobileTextBorderWeightInput.value, 0, 120)
      : 0;
    const nextStrokeWidth = Number.isFinite(stored.strokeWidth) && stored.strokeWidth > 0
      ? stored.strokeWidth
      : inputValue > 0 ? inputValue : 7;

    patchActiveTextLayer({
      style: { strokeWidth: nextStrokeWidth },
      textEffectState: {
        border: { strokeWidth: nextStrokeWidth },
      },
    }, "mobile-text-border-on");
  }

  function enableMobileTextShadowEffect() {
    const layer = getActiveTextLayer();
    const currentOpacity = Number.isFinite(layer?.style?.shadow?.opacity) ? layer.style.shadow.opacity : 0;

    if (!layer || currentOpacity > 0) {
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
    }, "mobile-text-shadow-on");
  }

  function enableMobileTextTransformEffect() {
    const layer = getActiveTextLayer();

    if (!layer || isTextTransformEffectActive(layer)) {
      return;
    }

    const stored = getStoredTextEffect(layer, "transform");
    const inputValue = mobileTextTransformAmountInput
      ? clamp(mobileTextTransformAmountInput.value, -1200, 1200)
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
    }, "mobile-text-transform-on");
  }

  async function initMobileEnvelopeForActiveTextLayer() {
    const layer = getActiveTextLayer();
    const engine = window.CBO.VectorTextEngine;

    if (!layer || !engine?.loadOpenTypeFont) {
      return null;
    }

    if (layer.envelopeGrid) {
      return layer;
    }

    try {
      const font = await engine.loadOpenTypeFont(layer.fontUrl || engine.DEFAULT_FONT_URL);
      const path = engine.createTextPath(font, layer.text, layer.fontSize, getTextPathOptions(layer));
      const envelopeGrid = engine.createEnvelopeGridFromBounds(path.getBoundingBox());

      await patchActiveTextLayerPreservingVisualCenter({
        envelopeGrid,
        warp: {
          type: "none",
          amount: 0,
        },
      }, "mobile-text-envelope");

      return getActiveTextLayer();
    } catch (error) {
      console.warn("Impossibile inizializzare la distorsione testo mobile.", error);
    }

    return null;
  }

  async function editMobileTextDistort(layer = getActiveTextLayer()) {
    if (!layer) {
      return;
    }

    const nextLayer = layer.envelopeGrid
      ? layer
      : await initMobileEnvelopeForActiveTextLayer();
    const editableLayer = nextLayer || getActiveTextLayer() || layer;

    requestTextTransformEdit(editableLayer);
  }

  function openMobileTextPanel(panelKey) {
    if (!mobileTextPanel || !getActiveTextLayer()) {
      return;
    }

    const key = String(panelKey || "");
    const isAlreadyOpen = !mobileTextPanel.hidden &&
      Array.from(mobileTextPanelSections).some((section) =>
        !section.hidden && section.dataset.mobileTextPanelSection === key
      );

    if (isAlreadyOpen) {
      closeMobileTextPanel();
      return;
    }

    if (key === "border") {
      enableMobileTextBorderEffect();
    } else if (key === "transform") {
      enableMobileTextTransformEffect();
    } else if (key === "shadow") {
      enableMobileTextShadowEffect();
    }

    mobileTextPanel.hidden = false;
    mobileTextPanelSections.forEach((section) => {
      section.hidden = section.dataset.mobileTextPanelSection !== key;
    });
    mobileTextPanelButtons.forEach((button) => {
      const isActive = button.dataset.mobileTextPanelTrigger === key;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    syncMobileTextControlsFromLayer();
  }

  function syncMobileTextState() {
    const activeTextLayer = getActiveTextLayer();
    const hasTextLayer = Boolean(activeTextLayer);

    showTextAddToolbar(currentToolIsText && !hasTextLayer);
    showMobileTextToolbar(currentToolIsText && hasTextLayer);

    if (currentToolIsText && hasTextLayer) {
      syncMobileTextControlsFromLayer(activeTextLayer);
    }
  }

  layersButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (window.CBO.openDrawerPanel) {
        window.CBO.openDrawerPanel("layers");
      }
    });
  });

  rasterizeTextButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }

      rasterizeTextButtons.forEach((rasterizeButton) => {
        rasterizeButton.disabled = true;
        rasterizeButton.classList.add("active");
      });

      try {
        if (button.dataset.rasterizeMode === "effects") {
          await window.CBO.rasterizeActiveLayerEffects?.();
        } else if (button.dataset.rasterizeMode === "image") {
          await window.CBO.rasterizeActiveImageLayer?.();
        } else {
          await window.CBO.rasterizeActiveVectorTextLayer?.();
        }
      } catch (error) {
        console.warn("Impossibile rasterizzare il layer attivo.", error);
      } finally {
        rasterizeTextButtons.forEach((rasterizeButton) => {
          rasterizeButton.classList.remove("active");
        });
        syncRasterizeTextButton();
      }
    });
  });

  quickInputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateBrushSetting(input.dataset.brushQuickInput, input.value);
    });
  });

  [
    [mobileTextContentInput, "content"],
    [mobileTextFillInput, "fill-color"],
    [mobileTextBorderColorInput, "stroke-color"],
    [mobileTextBorderWeightInput, "stroke-width"],
    [mobileTextFontSizeInput, "font-size"],
    [mobileTextLetterSpacingInput, "letter-spacing"],
    [mobileTextLineHeightInput, "line-height"],
    [mobileTextShadowColorInput, "shadow-color"],
    [mobileTextShadowDepthInput, "shadow-depth"],
    [mobileTextShadowAngleInput, "shadow-angle"],
    [mobileTextShadowBlurInput, "shadow-blur"],
    [mobileTextTransformAmountInput, "transform-amount"],
  ].forEach(([control, suffix]) => {
    bindMobileTextHistoryGroup(control, suffix);
  });

  mobileTextPanelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openMobileTextPanel(button.dataset.mobileTextPanelTrigger);
    });
  });

  mobileTextFillInput?.addEventListener("input", () => {
    syncMobileHexColor(mobileTextFillInput, mobileTextFillHex, mobileTextFillSwatch);
    patchActiveTextLayer(
      { style: { fill: mobileTextFillInput.value } },
      "mobile-text-fill-color",
      getMobileTextHistoryOptions("fill-color"),
    );
  });

  mobileTextBorderColorInput?.addEventListener("input", () => {
    syncMobileHexColor(mobileTextBorderColorInput, mobileTextBorderHex, mobileTextBorderSwatch);
    patchActiveTextLayer(
      { style: { stroke: mobileTextBorderColorInput.value } },
      "mobile-text-stroke-color",
      getMobileTextHistoryOptions("stroke-color"),
    );
  });

  mobileTextBorderWeightInput?.addEventListener("input", () => {
    updateMobileRangeProgress(mobileTextBorderWeightInput, mobileTextBorderWeightValue, (value) => value.toFixed(2));
    patchActiveTextLayer(
      { style: { strokeWidth: clamp(mobileTextBorderWeightInput.value, 0, 120) } },
      "mobile-text-stroke-width",
      getMobileTextHistoryOptions("stroke-width"),
    );
  });

  mobileTextStrokeAlignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const align = button.dataset.mobileTextStrokeAlign || "center";

      setMobileTextStrokeAlign(align);
      patchActiveTextLayer({ style: { strokeAlign: align } }, "mobile-text-stroke-align");
    });
  });

  mobileTextContentInput?.addEventListener("input", () => {
    patchActiveTextLayer(
      { text: mobileTextContentInput.value },
      "mobile-text-content",
      getMobileTextHistoryOptions("content"),
    );
  });

  mobileTextFontSelect?.addEventListener("change", () => {
    const selectedFont = populateMobileTextFontStyleOptions(
      mobileTextFontSelect.value,
      mobileTextFontStyleSelect?.value,
    );

    if (selectedFont && mobileTextFontStyleSelect) {
      mobileTextFontStyleSelect.value = selectedFont.style || "Regular";
    }

    patchMobileTextFontFromControls();
  });

  mobileTextFontStyleSelect?.addEventListener("change", patchMobileTextFontFromControls);

  mobileTextFontSizeInput?.addEventListener("input", () => {
    void patchActiveTextLayerPreservingVisualCenter(
      { fontSize: clamp(mobileTextFontSizeInput.value, 1, 999) },
      "mobile-text-font-size",
      getMobileTextHistoryOptions("font-size"),
    );
  });

  mobileTextLetterSpacingInput?.addEventListener("input", () => {
    void patchActiveTextLayerPreservingVisualCenter(
      { letterSpacing: clamp(mobileTextLetterSpacingInput.value, -200, 500) },
      "mobile-text-letter-spacing",
      getMobileTextHistoryOptions("letter-spacing"),
    );
  });

  mobileTextLineHeightInput?.addEventListener("input", () => {
    void patchActiveTextLayerPreservingVisualCenter(
      { lineHeight: clamp(mobileTextLineHeightInput.value, 1, 999) },
      "mobile-text-line-height",
      getMobileTextHistoryOptions("line-height"),
    );
  });

  mobileTextAlignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const align = button.dataset.mobileTextAlign || "center";

      setMobileTextAlign(align);
      patchActiveTextLayer({ textAlign: align }, "mobile-text-align");
    });
  });

  mobileTextUppercaseButton?.addEventListener("click", () => {
    const isActive = mobileTextUppercaseButton.getAttribute("aria-pressed") !== "true";

    setMobileTextToggleButton(mobileTextUppercaseButton, isActive);
    patchActiveTextLayer({ uppercase: isActive }, "mobile-text-uppercase");
  });

  mobileTextLigaturesButton?.addEventListener("click", () => {
    const isActive = mobileTextLigaturesButton.getAttribute("aria-pressed") !== "true";

    setMobileTextToggleButton(mobileTextLigaturesButton, isActive);
    patchActiveTextLayer({ ligatures: isActive }, "mobile-text-ligatures");
  });

  mobileTextAlternatesButton?.addEventListener("click", () => {
    const isActive = mobileTextAlternatesButton.getAttribute("aria-pressed") !== "true";

    setMobileTextToggleButton(mobileTextAlternatesButton, isActive);
    patchActiveTextLayer({ alternates: isActive }, "mobile-text-alternates");
  });

  mobileTextTransformAmountInput?.addEventListener("input", () => {
    updateMobileRangeProgress(mobileTextTransformAmountInput, mobileTextTransformValue, (value) => String(Math.round(value)));
    void patchActiveTextLayerPreservingVisualCenter({
      warp: { amount: clamp(mobileTextTransformAmountInput.value, -1200, 1200) },
    }, "mobile-text-transform-amount", getMobileTextHistoryOptions("transform-amount"));
  });

  mobileTextTransformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mobileTextTransformMode;
      const layer = ensureActiveTextLayerForTransform();

      if (!layer) {
        setMobileTextTransformMode("none");
        return;
      }

      setMobileTextTransformMode(mode);

      if (mode === "distort") {
        void editMobileTextDistort(layer);
      } else {
        void patchActiveTextLayerPreservingVisualCenter({
          envelopeGrid: null,
          warp: {
            type: mode === "flag" ? "flag" : "arch",
          },
        }, "mobile-text-transform-mode");
      }
    });
  });

  mobileTextTransformReset?.addEventListener("click", () => {
    const layer = getActiveTextLayer();
    const stored = layer && isTextTransformEffectActive(layer)
      ? {
        envelopeGrid: cloneTextValue(layer.envelopeGrid),
        warp: cloneTextValue(layer.warp || { type: "arch", amount: 170 }),
      }
      : getStoredTextEffect(layer, "transform");

    setMobileTextTransformMode("none");

    if (mobileTextTransformAmountInput) {
      mobileTextTransformAmountInput.value = "0";
    }

    updateMobileRangeProgress(mobileTextTransformAmountInput, mobileTextTransformValue, (value) => String(Math.round(value)));
    void patchActiveTextLayerPreservingVisualCenter({
      envelopeGrid: null,
      textEffectState: {
        transform: stored,
      },
      warp: {
        amount: 0,
        type: "none",
      },
    }, "mobile-text-transform-reset");
  });

  mobileTextTransformModify?.addEventListener("click", () => {
    const layer = ensureActiveTextLayerForTransform();

    if (!layer) {
      return;
    }

    setMobileTextTransformMode("distort");
    mobileTextTransformModify.classList.add("active");
    void editMobileTextDistort(layer).finally(() => {
      window.setTimeout(() => {
        mobileTextTransformModify.classList.remove("active");
      }, 140);
    });
  });

  mobileTextTransformModify?.addEventListener("pointercancel", () => {
    mobileTextTransformModify.classList.remove("active");
  });

  mobileTextTransformModify?.addEventListener("blur", () => {
    window.setTimeout(() => {
      mobileTextTransformModify.classList.remove("active");
    }, 140);
  });

  mobileTextShadowSolidToggle?.addEventListener("click", () => {
    const isSolid = !isMobileTextShadowSolidEnabled();

    setMobileTextShadowSolidMode(isSolid);
    patchActiveTextLayer({
      shadowType: isSolid ? "solid" : "drop",
      style: {
        shadow: isSolid ? { blur: 0, opacity: 1 } : { opacity: 1 },
      },
    }, "mobile-text-shadow-type");
  });

  mobileTextShadowColorInput?.addEventListener("input", () => {
    syncMobileHexColor(mobileTextShadowColorInput, mobileTextShadowHex, mobileTextShadowSwatch);
    patchActiveTextLayer(
      { style: { shadow: { color: mobileTextShadowColorInput.value, opacity: 1 } } },
      "mobile-text-shadow-color",
      getMobileTextHistoryOptions("shadow-color"),
    );
  });

  mobileTextShadowDepthInput?.addEventListener("input", () => {
    updateMobileRangeProgress(mobileTextShadowDepthInput, mobileTextShadowDepthValue, (value) => String(Math.round(value)));
    patchActiveTextLayer({
      shadowDistance: clamp(mobileTextShadowDepthInput.value, 0, 500),
      style: { shadow: { opacity: 1 } },
    }, "mobile-text-shadow-depth", getMobileTextHistoryOptions("shadow-depth"));
  });

  mobileTextShadowAngleInput?.addEventListener("input", () => {
    updateMobileRangeProgress(mobileTextShadowAngleInput, mobileTextShadowAngleValue, (value) => String(Math.round(value)));
    patchActiveTextLayer({
      shadowAngle: clamp(mobileTextShadowAngleInput.value, 0, 360),
      style: { shadow: { opacity: 1 } },
    }, "mobile-text-shadow-angle", getMobileTextHistoryOptions("shadow-angle"));
  });

  mobileTextShadowBlurInput?.addEventListener("input", () => {
    updateMobileRangeProgress(mobileTextShadowBlurInput, mobileTextShadowBlurValue, (value) => value.toFixed(2));
    patchActiveTextLayer(
      { style: { shadow: { blur: clamp(mobileTextShadowBlurInput.value, 0, 300), opacity: 1 } } },
      "mobile-text-shadow-blur",
      getMobileTextHistoryOptions("shadow-blur"),
    );
  });

  transformAngleInput?.addEventListener("input", dispatchTransformAngleInput);

  transformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTransformMode(button.dataset.transformMode, { source: "transform-mode-toolbar" });
    });
  });

  areaSelectionOperationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAreaSelectionOperation(button.dataset.areaSelectionOperation, {
        source: "area-selection-operation-toolbar",
      });
    });
  });

  window.addEventListener("cbo:transform-mode-change", (event) => {
    setTransformMode(event.detail?.mode, { emit: false });
  });

  window.addEventListener("cbo:area-selection-operation-change", (event) => {
    setAreaSelectionOperation(event.detail?.mode, { emit: false });
  });

  rasterTransformActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("cbo:raster-transform-action", {
          detail: {
            action: button.dataset.rasterTransformAction,
            source: "transform-mode-toolbar",
          },
        }),
      );
    });
  });

  textAddButton?.addEventListener("click", () => {
    const centerAt = getTextCreationCenter();
    const layer = window.CBO.createVectorTextLayer?.(
      centerAt ? { centerAt } : undefined,
    );

    if (layer) {
      textAddButton.classList.add("active");
      syncMobileTextState();
      window.setTimeout(() => {
        textAddButton.classList.remove("active");
      }, 140);
    }
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();
    const syncGroup = String(event.detail?.syncGroup || "").toLowerCase();
    const isBrush = label === "BRUSH" || label === "ERASER" || toolMode === "eraser" || (toolMode === "brush" && syncGroup === "brush");
    const isAreaSelection = toolMode === "selection-rect" || toolMode === "selection-circle" || toolMode === "selection-lasso";
    const isResize = label === "RESIZE" || toolMode === "resize";
    const isRotate = label === "ROTATE" || toolMode === "rotate";
    const isText = label === "TYPE" || toolMode === "text";

    isRotateToolActive = isRotate;
    currentToolIsText = isText;
    showBrushQuickControls(isBrush);

    if (isText && !isMobileTextToolbarViewport()) {
      const centerAt = getTextCreationCenter();

      window.CBO.createVectorTextLayer?.(
        centerAt ? { centerAt } : undefined,
      );
    }

    syncMobileTextState();
    showAreaSelectionOperationToolbar(isAreaSelection);
    showTransformModeToolbar(isResize || isRotate);
    showTransformAngleControl(isRotate);
  });

  window.addEventListener("cbo:raster-transform-state-change", (event) => {
    const detail = event.detail || {};

    isResizeToolActive = Boolean(event.detail?.active);
    isRotateToolActive = detail.toolMode === "rotate";
    isRasterTransformPending = Boolean(detail.pending);
    showTransformAngleControl(isRotateToolActive && detail.hasBounds === true);
    syncTransformAngleInput(detail.rotationDegrees ?? 0);
    syncRasterTransformActions();
  });

  window.addEventListener("cbo:document-layers-change", () => {
    syncRasterizeTextButton();
    syncMobileTextState();
  });
  window.addEventListener("cbo:vector-text-rasterized", () => {
    syncRasterizeTextButton();
    syncMobileTextState();
  });
  window.addEventListener("cbo:layer-effects-rasterized", syncRasterizeTextButton);
  window.addEventListener("cbo:image-layer-rasterized", syncRasterizeTextButton);
  window.addEventListener("cbo:brush-settings-change", syncQuickControls);
  setTransformMode(selectedTransformMode, { emit: false });
  setAreaSelectionOperation(selectedAreaSelectionOperation, { emit: false });
  syncRasterizeTextButton();
  syncMobileTextState();
  syncQuickControls();
};
