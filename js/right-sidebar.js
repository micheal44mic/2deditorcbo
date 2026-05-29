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
        <div class="right-sidebar-primary-actions">
          <button class="right-sidebar-save-button" type="button" aria-label="Save document" data-tooltip="SAVE" data-manual-save>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save-icon lucide-save" aria-hidden="true">
              <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
              <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
              <path d="M7 3v4a1 1 0 0 0 1 1h7" />
            </svg>
          </button>
          <button class="right-sidebar-share-button" type="button" data-tooltip="SHARE" aria-haspopup="dialog" aria-expanded="false" aria-controls="right-sidebar-share-menu" data-share-menu-toggle>SHARE</button>
        </div>
      </div>
      <section id="right-sidebar-share-menu" class="right-sidebar-share-menu" aria-label="Share" data-share-menu hidden>
        <div class="right-sidebar-export-header">
          <h2 class="right-sidebar-export-title">Export</h2>
          <span class="right-sidebar-export-format" data-export-format-label>PNG</span>
        </div>
        <div class="right-sidebar-export-format-options" role="radiogroup" aria-label="Export format" data-export-format-group>
          <button class="right-sidebar-export-format-button active" type="button" role="radio" aria-checked="true" data-export-format-option="png">PNG</button>
          <button class="right-sidebar-export-format-button" type="button" role="radio" aria-checked="false" data-export-format-option="jpeg">JPEG</button>
          <button class="right-sidebar-export-format-button" type="button" role="radio" aria-checked="false" data-export-format-option="webp">WebP</button>
        </div>
        <div class="right-sidebar-export-artboards" aria-label="Export artboards">
          <span class="right-sidebar-export-toggle-label">Artboards</span>
          <div class="right-sidebar-export-scope-options" role="radiogroup" aria-label="Export artboards" data-export-artboard-scope-group>
            <button class="right-sidebar-export-scope-button active" type="button" role="radio" aria-checked="true" data-export-artboard-scope="all">All</button>
            <button class="right-sidebar-export-scope-button" type="button" role="radio" aria-checked="false" data-export-artboard-scope="selected">Selected</button>
            <button class="right-sidebar-export-scope-button" type="button" role="radio" aria-checked="false" data-export-artboard-scope="custom">Custom</button>
          </div>
        </div>
        <input class="right-sidebar-export-custom-artboards" type="text" inputmode="numeric" placeholder="2,4" aria-label="Custom artboards" autocomplete="off" spellcheck="false" data-export-artboard-custom hidden />
        <label class="right-sidebar-export-toggle">
          <span class="right-sidebar-export-toggle-label">Background</span>
          <button class="right-sidebar-export-background-toggle smudge-sidebar-toggle-button active" type="button" aria-label="Export with background" aria-pressed="true" data-tooltip="BACKGROUND" data-export-background-toggle>
            <span class="smudge-sidebar-toggle-knob"></span>
          </button>
        </label>
        <div class="right-sidebar-export-scale" aria-label="Export scale">
          <span class="right-sidebar-export-toggle-label">Scale</span>
          <div class="right-sidebar-export-scale-options" role="radiogroup" aria-label="Export scale" data-export-scale-group>
            <button class="right-sidebar-export-scale-button" type="button" role="radio" aria-checked="false" data-export-scale-option="1">1x</button>
            <button class="right-sidebar-export-scale-button active" type="button" role="radio" aria-checked="true" data-export-scale-option="2">2x</button>
            <button class="right-sidebar-export-scale-button" type="button" role="radio" aria-checked="false" data-export-scale-option="3">3x</button>
            <button class="right-sidebar-export-scale-button" type="button" role="radio" aria-checked="false" data-export-scale-option="4">4x</button>
          </div>
        </div>
        <label class="right-sidebar-export-quality" data-export-quality-field hidden>
          <span class="right-sidebar-export-quality-header">
            <span class="right-sidebar-export-toggle-label">Quality</span>
            <span class="right-sidebar-export-quality-value" data-export-quality-value>92%</span>
          </span>
          <input class="right-sidebar-export-quality-range" type="range" min="60" max="100" step="5" value="92" aria-label="Export quality" data-export-quality />
        </label>
        <button class="right-sidebar-export-button" type="button" data-tooltip="EXPORT ARTBOARDS" data-export-artboards>Export Artboards</button>
      </section>
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
            <textarea class="text-sidebar-textarea" rows="3" autocomplete="off" spellcheck="false" data-text-content>CBOs</textarea>
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
              <input class="text-sidebar-color-input" type="color" value="#000000" aria-label="Text color" data-text-color-input />
            </span>
            <span class="text-sidebar-color-hex" data-text-color-hex>000000</span>
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
              <button class="text-sidebar-transform-mode" type="button" aria-pressed="false" data-text-transform-mode="arch">ARCH</button>
              <button class="text-sidebar-transform-mode" type="button" aria-pressed="false" data-text-transform-mode="flag">FLAG</button>
              <button class="text-sidebar-transform-mode" type="button" aria-pressed="false" data-text-transform-mode="distort">DISTORT</button>
            </div>
            <label class="text-sidebar-range-field text-sidebar-transform-range-field" data-text-transform-range-field>
              <span class="text-sidebar-control-header">
                <span class="text-sidebar-label" data-text-transform-label>Transform</span>
              <output class="text-sidebar-value-pill" data-text-transform-value>0</output>
            </span>
              <input class="text-sidebar-range" type="range" min="-1200" max="1200" step="1" value="0" aria-label="Transformation amount" data-text-transform-amount />
            </label>
            <div class="text-sidebar-transform-actions" data-text-transform-actions hidden>
              <button class="text-sidebar-secondary-button" type="button" data-text-transform-reset>Reset</button>
              <button class="text-sidebar-primary-button" type="button" data-text-transform-modify>Modify</button>
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
      <div class="layer-sidebar" aria-label="Layer settings" data-layer-sidebar hidden>
        <section class="layer-sidebar-section" aria-label="Layer alignment">
          <div class="layer-sidebar-heading-row">
            <h2 class="layer-sidebar-title">Align</h2>
          </div>
          <div class="layer-sidebar-align-placeholder" aria-label="Layer align controls" data-layer-align-placeholder>
            <div class="layer-sidebar-align-row" role="group" aria-label="Horizontal align controls">
              <button class="layer-sidebar-align-button" type="button" aria-label="Align left" data-layer-align-axis="x" data-layer-align-position="start">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="9" height="6" x="6" y="14" rx="2" />
                  <rect width="16" height="6" x="6" y="4" rx="2" />
                  <path d="M2 2v20" />
                </svg>
              </button>
              <button class="layer-sidebar-align-button" type="button" aria-label="Align horizontal center" data-layer-align-axis="x" data-layer-align-position="center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2v20" />
                  <path d="M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4" />
                  <path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" />
                  <path d="M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1" />
                  <path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
                </svg>
              </button>
              <button class="layer-sidebar-align-button" type="button" aria-label="Align right" data-layer-align-axis="x" data-layer-align-position="end">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="16" height="6" x="2" y="4" rx="2" />
                  <rect width="9" height="6" x="9" y="14" rx="2" />
                  <path d="M22 22V2" />
                </svg>
              </button>
            </div>
            <div class="layer-sidebar-align-row" role="group" aria-label="Vertical align controls">
              <button class="layer-sidebar-align-button" type="button" aria-label="Align top" data-layer-align-axis="y" data-layer-align-position="start">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="6" height="16" x="4" y="6" rx="2" />
                  <rect width="6" height="9" x="14" y="6" rx="2" />
                  <path d="M22 2H2" />
                </svg>
              </button>
              <button class="layer-sidebar-align-button" type="button" aria-label="Align vertical center" data-layer-align-axis="y" data-layer-align-position="center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 12h20" />
                  <path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
                  <path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" />
                  <path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" />
                  <path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button class="layer-sidebar-align-button" type="button" aria-label="Align bottom" data-layer-align-axis="y" data-layer-align-position="end">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="6" height="16" x="4" y="2" rx="2" />
                  <rect width="6" height="9" x="14" y="9" rx="2" />
                  <path d="M22 22H2" />
                </svg>
              </button>
            </div>
          </div>
        </section>
        <section class="layer-sidebar-section" aria-label="Layer opacity">
          <label class="layer-sidebar-range-field">
            <span class="layer-sidebar-control-header">
              <span class="layer-sidebar-label">Opacity</span>
              <output class="layer-sidebar-value-pill" data-layer-opacity-value>100%</output>
            </span>
            <input class="layer-sidebar-range" type="range" min="0" max="100" step="1" value="100" aria-label="Layer opacity" data-layer-opacity />
          </label>
        </section>
        <section class="layer-sidebar-section" aria-label="Layer blend mode">
          <div class="layer-sidebar-heading-row">
            <h2 class="layer-sidebar-title">Blend Mode</h2>
          </div>
          <div class="layer-sidebar-blend-outline" data-layer-blend-outline>
            <button class="layer-sidebar-blend-outline-box" type="button" aria-haspopup="listbox" aria-expanded="false" data-layer-blend-toggle>
              <span data-layer-blend-selected>Normal</span>
            </button>
            <div class="layer-sidebar-blend-hover-layer" aria-hidden="true"></div>
            <div class="layer-sidebar-blend-fill-layer" aria-hidden="true"></div>
            <div class="layer-sidebar-blend-word-list" role="listbox" aria-label="Layer blend mode" data-layer-blend-list></div>
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
  const saveButton = panel.querySelector("[data-manual-save]");
  const shareButton = panel.querySelector("[data-share-menu-toggle]");
  const shareMenu = panel.querySelector("[data-share-menu]");
  const exportArtboardsButton = panel.querySelector("[data-export-artboards]");
  const exportBackgroundToggle = panel.querySelector("[data-export-background-toggle]");
  const exportFormatLabel = panel.querySelector("[data-export-format-label]");
  const exportFormatButtons = Array.from(panel.querySelectorAll("[data-export-format-option]"));
  const exportArtboardScopeButtons = Array.from(panel.querySelectorAll("[data-export-artboard-scope]"));
  const exportArtboardCustomInput = panel.querySelector("[data-export-artboard-custom]");
  const exportScaleButtons = Array.from(panel.querySelectorAll("[data-export-scale-option]"));
  const exportQualityField = panel.querySelector("[data-export-quality-field]");
  const exportQualityInput = panel.querySelector("[data-export-quality]");
  const exportQualityValue = panel.querySelector("[data-export-quality-value]");
  const rightSidebarContent = panel.querySelector(".right-sidebar-content");
  const globalSections = panel.querySelectorAll("[data-right-sidebar-global], [data-right-sidebar-project]");
  const smudgeSidebar = panel.querySelector("[data-smudge-sidebar]");
  const smudgeControls = panel.querySelector("[data-smudge-controls]");
  const smudgeReset = panel.querySelector("[data-smudge-reset]");
  const pressureButton = panel.querySelector("[data-smudge-pressure]");
  const textSidebar = panel.querySelector("[data-text-sidebar]");
  const layerSidebar = panel.querySelector("[data-layer-sidebar]");
  const layerAlignButtons = panel.querySelectorAll("[data-layer-align-axis][data-layer-align-position]");
  const layerOpacityInput = panel.querySelector("[data-layer-opacity]");
  const layerOpacityValue = panel.querySelector("[data-layer-opacity-value]");
  const layerBlendOutline = panel.querySelector("[data-layer-blend-outline]");
  const layerBlendToggle = panel.querySelector("[data-layer-blend-toggle]");
  const layerBlendSelected = panel.querySelector("[data-layer-blend-selected]");
  const layerBlendList = panel.querySelector("[data-layer-blend-list]");
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
  const textTransformRangeField = panel.querySelector("[data-text-transform-range-field]");
  const textTransformActions = panel.querySelector("[data-text-transform-actions]");
  const textTransformAmountInput = panel.querySelector("[data-text-transform-amount]");
  const textTransformValue = panel.querySelector("[data-text-transform-value]");
  const textTransformLabel = panel.querySelector("[data-text-transform-label]");
  const textTransformReset = panel.querySelector("[data-text-transform-reset]");
  const textTransformModify = panel.querySelector("[data-text-transform-modify]");
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
  const storageKey = window.CBO.documentProjectNameStorageKey || "cbo-project-name";
  const exportBackgroundStorageKey = "cbo-export-include-background";
  const exportFormatStorageKey = "cbo-export-format";
  const exportScaleStorageKey = "cbo-export-raster-scale";
  const legacyExportPngScaleStorageKey = "cbo-export-png-scale";
  const exportQualityStorageKey = "cbo-export-raster-quality";
  const exportArtboardScopeStorageKey = "cbo-export-artboard-scope";
  const exportArtboardCustomStorageKey = "cbo-export-artboard-custom";
  const exportScaleOptions = Object.freeze([1, 2, 3, 4]);
  const exportFormatOptions = Object.freeze(["png", "jpeg", "webp"]);
  const exportArtboardScopeOptions = Object.freeze(["all", "selected", "custom"]);
  const defaultExportFormat = "png";
  const defaultExportScale = 2;
  const defaultExportQuality = 92;
  const defaultExportArtboardScope = "all";
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
  const blendModeApi = window.CBO.BlendModes || {};
  const layerBlendModeOptions = Array.isArray(blendModeApi.supportedModes)
    ? blendModeApi.supportedModes.map((mode) => ({ key: mode.key, label: mode.label }))
    : [
        { key: "normal", label: "Normal" },
        { key: "multiply", label: "Multiply" },
        { key: "screen", label: "Screen" },
        { key: "overlay", label: "Overlay" },
        { key: "darken", label: "Darken" },
        { key: "lighten", label: "Lighten" },
        { key: "difference", label: "Difference" },
        { key: "exclusion", label: "Exclusion" },
      ];
  const layerBlendModeItems = layerBlendModeOptions.filter((option) => !option.divider);
  const layerBlendModeKeys = new Set(layerBlendModeItems.map((option) => option.key));
  let layerBlendModeOpen = false;
  let layerBlendModeScrollIndex = 0;

  window.CBO.documentProjectNameStorageKey = storageKey;

  function readStoredExportBackgroundEnabled() {
    try {
      const stored = window.localStorage.getItem(exportBackgroundStorageKey);

      return stored === null ? true : stored === "true";
    } catch (error) {
      return true;
    }
  }

  function writeStoredExportBackgroundEnabled(isEnabled) {
    try {
      window.localStorage.setItem(exportBackgroundStorageKey, isEnabled ? "true" : "false");
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function normalizeExportFormat(value) {
    const format = String(value || "").trim().toLowerCase();

    if (format === "jpg") {
      return "jpeg";
    }

    return exportFormatOptions.includes(format) ? format : defaultExportFormat;
  }

  function readStoredExportFormat() {
    try {
      return normalizeExportFormat(window.localStorage.getItem(exportFormatStorageKey));
    } catch (error) {
      return defaultExportFormat;
    }
  }

  function writeStoredExportFormat(format) {
    try {
      window.localStorage.setItem(exportFormatStorageKey, normalizeExportFormat(format));
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function normalizeExportArtboardScope(value) {
    const scope = String(value || "").trim().toLowerCase();

    return exportArtboardScopeOptions.includes(scope) ? scope : defaultExportArtboardScope;
  }

  function readStoredExportArtboardScope() {
    try {
      return normalizeExportArtboardScope(window.localStorage.getItem(exportArtboardScopeStorageKey));
    } catch (error) {
      return defaultExportArtboardScope;
    }
  }

  function writeStoredExportArtboardScope(scope) {
    try {
      window.localStorage.setItem(exportArtboardScopeStorageKey, normalizeExportArtboardScope(scope));
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function readStoredExportArtboardCustom() {
    try {
      return window.localStorage.getItem(exportArtboardCustomStorageKey) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStoredExportArtboardCustom(value) {
    try {
      window.localStorage.setItem(exportArtboardCustomStorageKey, String(value || ""));
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function normalizeExportScale(value) {
    const scale = Number(value);

    return exportScaleOptions.includes(scale) ? scale : defaultExportScale;
  }

  function readStoredExportScale() {
    try {
      return normalizeExportScale(
        window.localStorage.getItem(exportScaleStorageKey) ||
        window.localStorage.getItem(legacyExportPngScaleStorageKey),
      );
    } catch (error) {
      return defaultExportScale;
    }
  }

  function writeStoredExportScale(scale) {
    try {
      window.localStorage.setItem(exportScaleStorageKey, String(normalizeExportScale(scale)));
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function normalizeExportQuality(value) {
    if (value === null || value === undefined || value === "") {
      return defaultExportQuality;
    }

    const quality = Math.round(Number(value));

    return Number.isFinite(quality) && quality > 0
      ? Math.max(60, Math.min(100, quality))
      : defaultExportQuality;
  }

  function readStoredExportQuality() {
    try {
      return normalizeExportQuality(window.localStorage.getItem(exportQualityStorageKey));
    } catch (error) {
      return defaultExportQuality;
    }
  }

  function writeStoredExportQuality(quality) {
    try {
      window.localStorage.setItem(exportQualityStorageKey, String(normalizeExportQuality(quality)));
    } catch (error) {
      // Export remains usable when storage is unavailable.
    }
  }

  function readStoredProjectName() {
    try {
      return window.localStorage.getItem(storageKey) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStoredProjectName(name) {
    try {
      window.localStorage.setItem(storageKey, name);
    } catch (error) {
      // Storage can be disabled; keep the in-memory project name usable.
    }
  }

  function getDocumentProjectName() {
    return projectInput?.value || window.CBO.documentProjectName || readStoredProjectName();
  }

  function setDocumentProjectName(value, options = {}) {
    const name = String(value ?? "");

    window.CBO.documentProjectName = name;
    writeStoredProjectName(name);

    if (projectInput && projectInput.value !== name) {
      projectInput.value = name;
    }

    window.dispatchEvent(new CustomEvent("cbo:document-project-change", {
      detail: {
        name,
        source: options.source || "project-sidebar",
      },
    }));

    return name;
  }

  window.CBO.getDocumentProjectName = getDocumentProjectName;
  window.CBO.setDocumentProjectName = setDocumentProjectName;

  if (projectInput) {
    projectInput.value = readStoredProjectName();
    window.CBO.documentProjectName = projectInput.value;
    projectInput.addEventListener("input", () => {
      setDocumentProjectName(projectInput.value, { source: "project-input" });
    });
  }

  setExportBackgroundEnabled(readStoredExportBackgroundEnabled(), { persist: false });
  setExportArtboardCustom(readStoredExportArtboardCustom(), { persist: false });
  setExportArtboardScope(readStoredExportArtboardScope(), { persist: false });
  setExportScale(readStoredExportScale(), { persist: false });
  setExportQuality(readStoredExportQuality(), { persist: false });
  setExportFormat(readStoredExportFormat(), { persist: false });

  async function saveDocumentNow() {
    const saveSystem = window.CBO.documentSaveSystem;

    if (!saveButton || saveButton.disabled || !saveSystem?.saveNow) {
      return;
    }

    saveButton.disabled = true;
    saveButton.classList.add("saving", "active");
    saveButton.setAttribute("aria-busy", "true");

    try {
      const didSave = await saveSystem.saveNow({ source: "manual-save" });

      if (didSave) {
        saveButton.classList.add("saved");
        window.setTimeout(() => saveButton.classList.remove("saved"), 520);
      }
    } catch (error) {
      console.warn("Salvataggio documento non riuscito.", error);
    } finally {
      saveButton.disabled = false;
      saveButton.classList.remove("saving", "active");
      saveButton.removeAttribute("aria-busy");
    }
  }

  function isExportBackgroundEnabled() {
    return exportBackgroundToggle?.getAttribute("aria-pressed") === "true";
  }

  function setExportBackgroundEnabled(isEnabled, options = {}) {
    if (!exportBackgroundToggle) {
      return;
    }

    const nextEnabled = isEnabled === true;

    exportBackgroundToggle.setAttribute("aria-pressed", String(nextEnabled));
    exportBackgroundToggle.classList.toggle("active", nextEnabled);

    if (options.persist !== false) {
      writeStoredExportBackgroundEnabled(nextEnabled);
    }
  }

  function getExportFormat() {
    const activeButton = exportFormatButtons.find((button) => button.getAttribute("aria-checked") === "true");

    return normalizeExportFormat(activeButton?.dataset.exportFormatOption);
  }

  function setExportFormat(value, options = {}) {
    const nextFormat = normalizeExportFormat(value);

    exportFormatButtons.forEach((button) => {
      const isActive = normalizeExportFormat(button.dataset.exportFormatOption) === nextFormat;

      button.setAttribute("aria-checked", String(isActive));
      button.classList.toggle("active", isActive);
    });

    if (exportFormatLabel) {
      exportFormatLabel.textContent = nextFormat === "jpeg" ? "JPEG" : nextFormat.toUpperCase();
    }

    if (exportQualityField) {
      exportQualityField.hidden = nextFormat === "png";
    }

    if (nextFormat === "jpeg") {
      setExportBackgroundEnabled(true, { persist: false });
      if (exportBackgroundToggle) {
        exportBackgroundToggle.disabled = true;
        exportBackgroundToggle.setAttribute("aria-label", "JPEG export requires background");
      }
    } else if (exportBackgroundToggle) {
      exportBackgroundToggle.disabled = false;
      exportBackgroundToggle.setAttribute("aria-label", "Export with background");
      setExportBackgroundEnabled(readStoredExportBackgroundEnabled(), { persist: false });
    }

    if (options.persist !== false) {
      writeStoredExportFormat(nextFormat);
    }

    positionShareMenu();

    return nextFormat;
  }

  function getExportArtboardScope() {
    const activeButton = exportArtboardScopeButtons.find((button) => button.getAttribute("aria-checked") === "true");

    return normalizeExportArtboardScope(activeButton?.dataset.exportArtboardScope);
  }

  function setExportArtboardScope(value, options = {}) {
    const nextScope = normalizeExportArtboardScope(value);

    exportArtboardScopeButtons.forEach((button) => {
      const isActive = normalizeExportArtboardScope(button.dataset.exportArtboardScope) === nextScope;

      button.setAttribute("aria-checked", String(isActive));
      button.classList.toggle("active", isActive);
    });

    if (exportArtboardCustomInput) {
      exportArtboardCustomInput.hidden = nextScope !== "custom";
      exportArtboardCustomInput.disabled = nextScope !== "custom";

      if (nextScope === "custom" && options.focus === true) {
        exportArtboardCustomInput.focus();
        exportArtboardCustomInput.select?.();
      }
    }

    if (options.persist !== false) {
      writeStoredExportArtboardScope(nextScope);
    }

    positionShareMenu();

    return nextScope;
  }

  function getExportArtboardCustom() {
    return String(exportArtboardCustomInput?.value || "").trim();
  }

  function setExportArtboardCustom(value, options = {}) {
    const nextValue = String(value || "");

    if (exportArtboardCustomInput && exportArtboardCustomInput.value !== nextValue) {
      exportArtboardCustomInput.value = nextValue;
    }

    if (options.persist !== false) {
      writeStoredExportArtboardCustom(nextValue);
    }

    return nextValue;
  }

  function getExportScale() {
    const activeButton = exportScaleButtons.find((button) => button.getAttribute("aria-checked") === "true");

    return normalizeExportScale(activeButton?.dataset.exportScaleOption);
  }

  function setExportScale(value, options = {}) {
    const nextScale = normalizeExportScale(value);

    exportScaleButtons.forEach((button) => {
      const isActive = normalizeExportScale(button.dataset.exportScaleOption) === nextScale;

      button.setAttribute("aria-checked", String(isActive));
      button.classList.toggle("active", isActive);
    });

    if (options.persist !== false) {
      writeStoredExportScale(nextScale);
    }

    return nextScale;
  }

  function getExportQuality() {
    return normalizeExportQuality(exportQualityInput?.value) / 100;
  }

  function setExportQuality(value, options = {}) {
    const nextQuality = normalizeExportQuality(value);
    const progress = ((nextQuality - 60) / 40) * 100;

    if (exportQualityInput) {
      exportQualityInput.value = String(nextQuality);
      exportQualityInput.style.setProperty("--right-sidebar-export-quality-progress", `${progress}%`);
    }

    if (exportQualityValue) {
      exportQualityValue.textContent = `${nextQuality}%`;
    }

    if (options.persist !== false) {
      writeStoredExportQuality(nextQuality);
    }

    return nextQuality;
  }

  function positionShareMenu() {
    if (!shareButton || !shareMenu || shareMenu.hidden) {
      return;
    }

    const buttonRect = shareButton.getBoundingClientRect();
    const menuWidth = Math.max(1, Math.round(shareMenu.offsetWidth || 220));
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || menuWidth);
    const left = Math.max(10, Math.min(viewportWidth - menuWidth - 10, buttonRect.right - menuWidth));
    const top = Math.max(10, buttonRect.bottom + 8);

    shareMenu.style.setProperty("--right-sidebar-share-menu-left", `${Math.round(left)}px`);
    shareMenu.style.setProperty("--right-sidebar-share-menu-top", `${Math.round(top)}px`);
  }

  function setShareMenuOpen(isOpen) {
    if (!shareButton || !shareMenu) {
      return;
    }

    const shouldOpen = isOpen === true;

    shareMenu.hidden = !shouldOpen;
    shareButton.classList.toggle("active", shouldOpen);
    shareButton.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen) {
      positionShareMenu();
    }
  }

  function isShareMenuOpen() {
    return Boolean(shareMenu && !shareMenu.hidden);
  }

  async function exportDocumentArtboards() {
    const exportSystem = window.CBO.documentExportSystem;

    if (!exportArtboardsButton || exportArtboardsButton.disabled || !exportSystem?.exportDrawingArtboardsRaster) {
      return;
    }

    exportArtboardsButton.disabled = true;
    exportArtboardsButton.classList.add("exporting", "active");
    exportArtboardsButton.setAttribute("aria-busy", "true");
    exportArtboardsButton.textContent = "EXPORTING";

    try {
      await exportSystem.exportDrawingArtboardsRaster({
        artboardSelection: getExportArtboardScope(),
        artboardSpec: getExportArtboardCustom(),
        format: getExportFormat(),
        includeBackground: isExportBackgroundEnabled(),
        quality: getExportQuality(),
        scale: getExportScale(),
        source: "right-sidebar-export",
      });
    } catch (error) {
      console.warn("Export artboard non riuscito.", error);
    } finally {
      exportArtboardsButton.disabled = false;
      exportArtboardsButton.classList.remove("exporting", "active");
      exportArtboardsButton.removeAttribute("aria-busy");
      exportArtboardsButton.textContent = "Export Artboards";
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function normalizeLayerBlendMode(value) {
    if (blendModeApi.normalizeLayerBlendMode) {
      return blendModeApi.normalizeLayerBlendMode(value);
    }

    const mode = String(value || "").trim().toLowerCase();

    return layerBlendModeKeys.has(mode) ? mode : "normal";
  }

  function getLayerBlendModeLabel(mode) {
    return blendModeApi.getLayerBlendModeLabel?.(mode) ||
      layerBlendModeOptions.find((option) => option.key === mode)?.label ||
      "Normal";
  }

  function getActiveLayer() {
    const layerModel = getLayerModel();
    const activeLayer = layerModel?.findEntryById?.(layerModel.activeLayerId);

    return activeLayer || null;
  }

  function isLayerSidebarEligible(layer) {
    return Boolean(
      layer &&
      layer.locked !== true &&
      layer.type !== "group" &&
      layer.type !== "background" &&
      layer.id !== "background",
    );
  }

  function normalizeLayerAlignAxis(value) {
    const axis = String(value || "").trim().toLowerCase();

    return axis === "x" || axis === "y" ? axis : "";
  }

  function normalizeLayerAlignPosition(value) {
    const position = String(value || "").trim().toLowerCase();

    return ["start", "center", "end"].includes(position) ? position : "";
  }

  function isRasterAlignLayer(layer) {
    return layer?.type === "paint" || layer?.type === "image";
  }

  function hasFiniteRect(rect) {
    return Boolean(
      rect &&
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height) &&
        rect.width > 0 &&
        rect.height > 0,
    );
  }

  function getDocumentAlignRect() {
    const renderer = window.CBO.documentRenderer;
    const width = Number(renderer?.width || renderer?.options?.documentWidth);
    const height = Number(renderer?.height || renderer?.options?.documentHeight);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return {
      height,
      width,
      x: 0,
      y: 0,
    };
  }

  function getRectAlignCoordinate(rect, axis, position) {
    const origin = axis === "x" ? rect.x : rect.y;
    const size = axis === "x" ? rect.width : rect.height;

    if (position === "center") {
      return origin + size / 2;
    }

    if (position === "end") {
      return origin + size;
    }

    return origin;
  }

  function getLayerAlignDelta(rect, axis, position) {
    const targetRect = getDocumentAlignRect();

    if (!hasFiniteRect(rect) || !hasFiniteRect(targetRect)) {
      return null;
    }

    const desired = getRectAlignCoordinate(targetRect, axis, position);
    const current = getRectAlignCoordinate(rect, axis, position);
    const delta = desired - current;

    if (Math.abs(delta) < 0.01) {
      return null;
    }

    return {
      dx: axis === "x" ? delta : 0,
      dy: axis === "y" ? delta : 0,
    };
  }

  function rectToQuad(rect) {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
  }

  function transformTextLayerPoint(layer, point) {
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);
    const radians = (toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = point.x * scaleX;
    const y = point.y * scaleY;

    return {
      x: toFiniteNumber(layer.x, 0) + x * cos - y * sin,
      y: toFiniteNumber(layer.y, 0) + x * sin + y * cos,
    };
  }

  function getTextLayerDocumentRect(layer, font) {
    const bounds = getWarpedTextBounds(layer, font);

    if (
      !bounds ||
      !Number.isFinite(bounds.x1) ||
      !Number.isFinite(bounds.y1) ||
      !Number.isFinite(bounds.x2) ||
      !Number.isFinite(bounds.y2) ||
      bounds.x2 <= bounds.x1 ||
      bounds.y2 <= bounds.y1
    ) {
      return null;
    }

    const points = [
      transformTextLayerPoint(layer, { x: bounds.x1, y: bounds.y1 }),
      transformTextLayerPoint(layer, { x: bounds.x2, y: bounds.y1 }),
      transformTextLayerPoint(layer, { x: bounds.x2, y: bounds.y2 }),
      transformTextLayerPoint(layer, { x: bounds.x1, y: bounds.y2 }),
    ];
    const documentBounds = points.reduce(
      (next, point) => ({
        x1: Math.min(next.x1, point.x),
        y1: Math.min(next.y1, point.y),
        x2: Math.max(next.x2, point.x),
        y2: Math.max(next.y2, point.y),
      }),
      { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
    );

    return {
      height: documentBounds.y2 - documentBounds.y1,
      width: documentBounds.x2 - documentBounds.x1,
      x: documentBounds.x1,
      y: documentBounds.y1,
    };
  }

  function alignRasterLayerToDocument(layer, axis, position) {
    const renderer = window.CBO.documentRenderer;

    if (
      !renderer?.getRasterContentBounds ||
      !renderer?.createRasterSnapshot ||
      !renderer?.commitRasterTransform
    ) {
      return false;
    }

    const sourceRect = renderer.getRasterContentBounds(layer.id);
    const delta = getLayerAlignDelta(sourceRect, axis, position);

    if (!delta) {
      return false;
    }

    const sourceSnapshot = renderer.createRasterSnapshot(layer.id, sourceRect, "layer-sidebar-align-source");

    if (!sourceSnapshot?.texture) {
      renderer.deleteRasterSnapshot?.(sourceSnapshot);
      return false;
    }

    const destRect = {
      ...sourceRect,
      x: sourceRect.x + delta.dx,
      y: sourceRect.y + delta.dy,
    };

    try {
      return renderer.commitRasterTransform({
        destQuad: rectToQuad(destRect),
        layerId: layer.id,
        source: "layer-sidebar-align",
        sourceRect,
        sourceSnapshot,
        transformMode: "free",
      }) === true;
    } finally {
      renderer.deleteRasterSnapshot?.(sourceSnapshot);
    }
  }

  async function alignVectorTextLayerToDocument(layer, axis, position) {
    const layerModel = getLayerModel();
    const engine = window.CBO.VectorTextEngine;

    if (!layerModel?.updateLayer || !engine?.loadOpenTypeFont) {
      return false;
    }

    const layerId = layer.id;
    const fontUrl = layer.fontUrl || engine.DEFAULT_FONT_URL;

    try {
      const font = await engine.loadOpenTypeFont(fontUrl);
      const currentLayer = layerModel.findEntryById(layerId);

      if (!isLayerSidebarEligible(currentLayer) || !isVectorTextLayer(currentLayer)) {
        return false;
      }

      if ((currentLayer.fontUrl || engine.DEFAULT_FONT_URL) !== fontUrl) {
        return false;
      }

      const documentRect = getTextLayerDocumentRect(currentLayer, font);
      const delta = getLayerAlignDelta(documentRect, axis, position);

      if (!delta) {
        return false;
      }

      const didUpdate = layerModel.updateLayer(currentLayer.id, {
        x: toFiniteNumber(currentLayer.x, 0) + delta.dx,
        y: toFiniteNumber(currentLayer.y, 0) + delta.dy,
      }, {
        historyGroup: getLayerHistoryGroup(`align-${axis}-${position}`, currentLayer),
        source: "layer-sidebar-align",
      });

      if (didUpdate) {
        window.CBO.documentRenderer?.requestDraw?.();
      }

      return didUpdate;
    } catch (error) {
      console.warn("Impossibile allineare il layer testo al foglio.", error);
      return false;
    }
  }

  function alignActiveLayerToDocument(axisValue, positionValue) {
    const axis = normalizeLayerAlignAxis(axisValue);
    const position = normalizeLayerAlignPosition(positionValue);
    const layer = getActiveLayer();

    if (!axis || !position || !isLayerSidebarEligible(layer)) {
      return Promise.resolve(false);
    }

    if (isVectorTextLayer(layer)) {
      return alignVectorTextLayerToDocument(layer, axis, position);
    }

    if (isRasterAlignLayer(layer)) {
      return Promise.resolve(alignRasterLayerToDocument(layer, axis, position));
    }

    return Promise.resolve(false);
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

  function getLayerHistoryGroup(suffix, layer = getActiveLayer()) {
    const key = String(suffix || "").trim();

    return key && layer?.id ? `layer-${key}-${layer.id}` : "";
  }

  function getLayerHistoryOptions(suffix) {
    const historyGroup = getLayerHistoryGroup(suffix);

    return historyGroup ? { historyGroup } : {};
  }

  function bindLayerHistoryGroup(control, suffix) {
    if (!control) {
      return;
    }

    let activeGroup = "";

    control.addEventListener("focus", () => {
      activeGroup = getLayerHistoryGroup(suffix);
      window.CBO.documentHistory?.beginGroup?.(activeGroup);
    });

    control.addEventListener("blur", () => {
      window.CBO.documentHistory?.endGroup?.(activeGroup);
      activeGroup = "";
    });
  }

  function updateGlobalSectionVisibility() {
    globalSections.forEach((section) => {
      section.hidden = false;
    });
  }

  function updateLayerOpacityProgress() {
    if (!layerOpacityInput) {
      return;
    }

    const min = Number(layerOpacityInput.min) || 0;
    const max = Number(layerOpacityInput.max) || 100;
    const value = clamp(layerOpacityInput.value, min, max);
    const progress = ((value - min) / (max - min)) * 100;

    layerOpacityInput.style.setProperty("--layer-sidebar-range-progress", `${progress}%`);

    if (layerOpacityValue) {
      layerOpacityValue.textContent = `${Math.round(value)}%`;
    }
  }

  function closeLayerBlendMode() {
    layerBlendModeOpen = false;
    layerBlendOutline?.classList.remove("active");
    layerBlendToggle?.setAttribute("aria-expanded", "false");
  }

  function getLayerBlendModeIndex(mode = normalizeLayerBlendMode(getActiveLayer()?.blendMode)) {
    const index = layerBlendModeItems.findIndex((option) => option.key === normalizeLayerBlendMode(mode));

    return index >= 0 ? index : 0;
  }

  function updateLayerBlendBoxAnchor() {
    if (!layerBlendOutline || !layerBlendToggle) {
      return;
    }

    const rect = layerBlendToggle.getBoundingClientRect();

    layerBlendOutline.style.setProperty("--layer-blend-box-top", `${rect.top}px`);
    layerBlendOutline.style.setProperty("--layer-blend-box-left", `${rect.left}px`);
    layerBlendOutline.style.setProperty("--layer-blend-box-width", `${rect.width}px`);
  }

  function setLayerBlendModeOpen(isOpen) {
    if (!layerBlendOutline || !layerBlendToggle) {
      return;
    }

    layerBlendModeOpen = Boolean(isOpen);

    if (layerBlendModeOpen) {
      updateLayerBlendBoxAnchor();
    }

    layerBlendOutline.classList.toggle("active", layerBlendModeOpen);
    layerBlendToggle.setAttribute("aria-expanded", String(layerBlendModeOpen));
  }

  function syncLayerBlendMode(mode = normalizeLayerBlendMode(getActiveLayer()?.blendMode)) {
    const normalizedMode = normalizeLayerBlendMode(mode);

    layerBlendModeScrollIndex = getLayerBlendModeIndex(normalizedMode);
    layerBlendOutline?.style.setProperty("--layer-blend-scroll-index", String(layerBlendModeScrollIndex));

    if (layerBlendSelected) {
      layerBlendSelected.textContent = getLayerBlendModeLabel(normalizedMode);
    }

    layerBlendList?.querySelectorAll("[data-layer-blend-mode]").forEach((option) => {
      const isSelected = option.dataset.layerBlendMode === normalizedMode;

      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", String(isSelected));
    });
  }

  function selectLayerBlendMode(value) {
    const mode = { key: normalizeLayerBlendMode(value) };

    syncLayerBlendMode(mode.key);
    patchActiveLayer(
      { blendMode: mode.key },
      "layer-sidebar-blend-mode",
      getLayerHistoryOptions("blend-mode"),
    );
  }

  function getNextLayerBlendModeIndex(currentIndex, direction) {
    const nextIndex = Math.min(layerBlendModeItems.length - 1, Math.max(0, currentIndex + direction));

    return Number.isFinite(nextIndex) ? nextIndex : currentIndex;
  }

  function populateLayerBlendModes() {
    if (!layerBlendList) {
      return;
    }

    layerBlendList.replaceChildren();
    layerBlendOutline?.style.setProperty("--layer-blend-list-height", `${layerBlendModeItems.length * 38}px`);

    layerBlendModeOptions.forEach((mode) => {
      if (mode.divider) {
        const divider = document.createElement("div");

        divider.className = "layer-sidebar-blend-divider";
        divider.setAttribute("role", "separator");
        layerBlendList.append(divider);
        return;
      }

      const option = document.createElement("button");

      option.className = "layer-sidebar-blend-word";
      option.dataset.layerBlendMode = mode.key;
      option.type = "button";
      option.setAttribute("role", "option");
      option.textContent = mode.label;
      const chooseOption = (event) => {
        if (!layerBlendModeOpen) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (mode.key !== normalizeLayerBlendMode(getActiveLayer()?.blendMode)) {
          selectLayerBlendMode(mode.key);
        }

        closeLayerBlendMode();
      };

      option.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        chooseOption(event);
      });
      option.addEventListener("click", chooseOption);
      layerBlendList.append(option);
    });

    syncLayerBlendMode();
  }

  function patchActiveLayer(patch, source = "layer-sidebar", historyOptions = {}) {
    const layerModel = getLayerModel();
    const layer = getActiveLayer();

    if (!isLayerSidebarEligible(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const didUpdate = layerModel.updateLayer(layer.id, patch, {
      ...historyOptions,
      source,
    });

    if (didUpdate) {
      window.CBO.documentRenderer?.requestDraw?.();
    }

    return didUpdate;
  }

  const LAYER_OPACITY_COMMIT_SOURCE = "layer-sidebar-opacity";
  const LAYER_OPACITY_PREVIEW_SOURCE = "layer-sidebar-opacity-preview";
  const LAYER_OPACITY_EPSILON = 0.0005;
  const LAYER_OPACITY_KEYBOARD_COMMIT_DELAY_MS = 160;
  let layerOpacityPreviewState = null;
  let layerOpacityDrawFrame = 0;
  let layerOpacityCommitTimer = 0;
  let layerOpacityPointerActive = false;

  function normalizeLayerOpacityValue(value) {
    return Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 1));
  }

  function requestLayerOpacityPreviewDraw() {
    if (layerOpacityDrawFrame) {
      return;
    }

    const draw = () => {
      layerOpacityDrawFrame = 0;
      window.CBO.documentRenderer?.requestDraw?.();
    };

    layerOpacityDrawFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(draw)
      : window.setTimeout(draw, 16);
  }

  function beginLayerOpacityPreview(layer = getActiveLayer()) {
    const layerModel = getLayerModel();

    if (!isLayerSidebarEligible(layer) || !layerModel?.updateLayer) {
      return null;
    }

    if (layerOpacityPreviewState?.layerId === layer.id) {
      return layerOpacityPreviewState;
    }

    if (layerOpacityPreviewState) {
      commitLayerOpacityPreview();
    }

    const historyOptions = getLayerHistoryOptions("opacity");

    layerOpacityPreviewState = {
      beforeState: layerModel.captureHistoryState?.({
        ...historyOptions,
        source: LAYER_OPACITY_COMMIT_SOURCE,
      }) || null,
      historyGroup: historyOptions.historyGroup || "",
      layerId: layer.id,
      startOpacity: normalizeLayerOpacityValue(layer.opacity),
      latestOpacity: normalizeLayerOpacityValue(layer.opacity),
    };
    return layerOpacityPreviewState;
  }

  function invalidateLayerOpacityPreview(layerId) {
    const renderer = window.CBO.documentRenderer;

    renderer?.invalidatePreviewCache?.(LAYER_OPACITY_PREVIEW_SOURCE, {
      layerId,
      source: LAYER_OPACITY_PREVIEW_SOURCE,
    });
    requestLayerOpacityPreviewDraw();
  }

  function updateLayerOpacityPreview(opacity) {
    const layerModel = getLayerModel();
    const layer = getActiveLayer();
    const state = beginLayerOpacityPreview(layer);

    if (!state || !isLayerSidebarEligible(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextOpacity = normalizeLayerOpacityValue(opacity);
    const currentOpacity = normalizeLayerOpacityValue(layer.opacity);

    state.latestOpacity = nextOpacity;
    if (Math.abs(currentOpacity - nextOpacity) <= LAYER_OPACITY_EPSILON) {
      requestLayerOpacityPreviewDraw();
      return true;
    }

    const didUpdate = layerModel.updateLayer(layer.id, { opacity: nextOpacity }, {
      emit: false,
      history: false,
      source: LAYER_OPACITY_PREVIEW_SOURCE,
    });

    if (didUpdate) {
      invalidateLayerOpacityPreview(layer.id);
    }

    return didUpdate;
  }

  function clearLayerOpacityCommitTimer() {
    if (!layerOpacityCommitTimer) {
      return;
    }

    window.clearTimeout(layerOpacityCommitTimer);
    layerOpacityCommitTimer = 0;
  }

  function scheduleLayerOpacityKeyboardCommit() {
    if (layerOpacityPointerActive) {
      return;
    }

    clearLayerOpacityCommitTimer();
    layerOpacityCommitTimer = window.setTimeout(() => {
      layerOpacityCommitTimer = 0;
      commitLayerOpacityPreview();
    }, LAYER_OPACITY_KEYBOARD_COMMIT_DELAY_MS);
  }

  function commitLayerOpacityPreview() {
    const state = layerOpacityPreviewState;

    clearLayerOpacityCommitTimer();
    if (!state) {
      return false;
    }

    layerOpacityPreviewState = null;

    const layerModel = getLayerModel();
    const layer = layerModel?.findEntryById?.(state.layerId);

    if (!isLayerSidebarEligible(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const finalOpacity = normalizeLayerOpacityValue(state.latestOpacity);
    const currentOpacity = normalizeLayerOpacityValue(layer.opacity);

    if (Math.abs(currentOpacity - finalOpacity) > LAYER_OPACITY_EPSILON) {
      layerModel.updateLayer(layer.id, { opacity: finalOpacity }, {
        emit: false,
        history: false,
        source: LAYER_OPACITY_PREVIEW_SOURCE,
      });
    }

    const didChange = Math.abs(state.startOpacity - finalOpacity) > LAYER_OPACITY_EPSILON;
    let didRecordHistory = false;

    if (didChange) {
      layerModel.emitChange?.(LAYER_OPACITY_COMMIT_SOURCE, {
        changeType: "layer-opacity",
        layerId: layer.id,
      });

      didRecordHistory = layerModel.recordHistoryStateChange?.(state.beforeState, {
        historyGroup: state.historyGroup,
        source: LAYER_OPACITY_COMMIT_SOURCE,
      }) === true;
    }

    window.CBO.documentRenderer?.requestDraw?.();
    return didChange || didRecordHistory;
  }

  function clearLayerOpacityPointerInteraction() {
    layerOpacityPointerActive = false;
    window.removeEventListener("pointerup", handleLayerOpacityPointerEnd);
    window.removeEventListener("pointercancel", handleLayerOpacityPointerEnd);
  }

  function handleLayerOpacityPointerEnd() {
    clearLayerOpacityPointerInteraction();
    commitLayerOpacityPreview();
  }

  function beginLayerOpacityPointerInteraction() {
    if (layerOpacityPointerActive) {
      return;
    }

    layerOpacityPointerActive = true;
    beginLayerOpacityPreview();
    window.addEventListener("pointerup", handleLayerOpacityPointerEnd, { passive: true });
    window.addEventListener("pointercancel", handleLayerOpacityPointerEnd, { passive: true });
  }

  function syncLayerControlsFromLayer() {
    const layer = getActiveLayer();

    if (!isLayerSidebarEligible(layer)) {
      return;
    }

    if (layerOpacityInput) {
      layerOpacityInput.value = String(Math.round((Number.isFinite(layer.opacity) ? layer.opacity : 1) * 100));
      updateLayerOpacityProgress();
    }

    syncLayerBlendMode(layer.blendMode);
  }

  function showLayerSettings(isVisible) {
    if (!layerSidebar) {
      return;
    }

    const wasHidden = layerSidebar.hidden;
    const willBeHidden = !isVisible;

    layerSidebar.hidden = willBeHidden;

    if (wasHidden !== willBeHidden) {
      closeLayerBlendMode();
    }

    updateGlobalSectionVisibility();

    if (isVisible) {
      syncLayerControlsFromLayer();
    }
  }

  function shouldShowLayerSettings(activeTool = currentToolName) {
    const activeLayer = getActiveLayer();

    return activeTool === "selection" && !isVectorTextLayer(activeLayer) && isLayerSidebarEligible(activeLayer);
  }

  function syncRightSidebarPanels(activeTool = currentToolName) {
    const showLayer = shouldShowLayerSettings(activeTool);
    const showText = !showLayer && shouldShowTextSettings(activeTool);

    showLayerSettings(showLayer);
    showTextSettings(showText);
    showSmudgeSettings(activeTool === "smudge");
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

  function getTopmostTextLayer() {
    const layerModel = getLayerModel();
    const layers = layerModel?.getRenderableLayers?.() || [];

    return layers.slice().reverse().find((layer) =>
      isVectorTextLayer(layer) && layer.locked !== true
    ) || null;
  }

  function ensureActiveTextLayerForTransform(source = "text-transform-select") {
    const activeLayer = getActiveTextLayer();

    if (activeLayer) {
      return activeLayer;
    }

    const layerModel = getLayerModel();
    const fallbackLayer = getTopmostTextLayer();

    if (!layerModel || !fallbackLayer) {
      return null;
    }

    layerModel.setActiveLayer?.(fallbackLayer.id, { source });

    return layerModel.findEntryById?.(fallbackLayer.id) || fallbackLayer;
  }

  function requestTextTransformEdit(layer, source = "text-transform-mode") {
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

  function normalizeHexColor(value, fallback = "#000000") {
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
        textColorInput.value = normalizeHexColor(layer.style?.fill, "#000000");
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
      }, "text-sidebar-envelope");

      return getActiveTextLayer();
    } catch (error) {
      console.warn("Impossibile inizializzare la distorsione envelope.", error);
    }

    return null;
  }

  async function editTextDistort(layer = getActiveTextLayer()) {
    if (!layer) {
      return;
    }

    const nextLayer = layer.envelopeGrid
      ? layer
      : await initEnvelopeForActiveTextLayer();
    const editableLayer = nextLayer || getActiveTextLayer() || layer;

    requestTextTransformEdit(editableLayer);
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

    const hex = String(textColorInput.value || "#000000").replace("#", "").toUpperCase();

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

    return activeButton?.dataset.textTransformMode || "none";
  }

  function getTextTransformLabel(mode) {
    if (mode === "flag") {
      return "Flag Curve";
    }

    if (mode === "distort") {
      return "Distort Amount";
    }

    if (mode === "none") {
      return "Transform";
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
    const nextMode = mode === "arch" || mode === "flag" || mode === "distort" ? mode : "none";
    const isDistort = nextMode === "distort";

    textTransformModeButtons.forEach((button) => {
      const isActive = button.dataset.textTransformMode === nextMode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (textTransformLabel) {
      textTransformLabel.textContent = getTextTransformLabel(nextMode);
    }

    if (textTransformRangeField) {
      textTransformRangeField.hidden = isDistort;
    }

    if (textTransformActions) {
      textTransformActions.hidden = !isDistort;
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
      const activeMode = getActiveTextTransformMode();

      setTextTransformMode(activeMode === "none" ? "arch" : activeMode);
      updateTextTransformAmount();
    } else {
      setTextTransformMode("none");

      if (textTransformAmountInput) {
        textTransformAmountInput.value = "0";
      }

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
    updateGlobalSectionVisibility();

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

    if (
      normalized === "selection" ||
      normalized === "rect select" ||
      normalized === "circle select" ||
      normalized === "lasso select" ||
      normalized === "pen select"
    ) {
      return "selection";
    }

    return "";
  }

  smudgeControlDefs.forEach((definition) => {
    smudgeControls?.append(createSmudgeControl(definition));
  });
  populateLayerBlendModes();

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
  bindLayerHistoryGroup(layerOpacityInput, "opacity");
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

  layerAlignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void alignActiveLayerToDocument(button.dataset.layerAlignAxis, button.dataset.layerAlignPosition);
    });
  });

  layerOpacityInput?.addEventListener("pointerdown", () => {
    beginLayerOpacityPointerInteraction();
  });
  layerOpacityInput?.addEventListener("input", () => {
    const opacity = clamp(layerOpacityInput.value, 0, 100) / 100;

    updateLayerOpacityProgress();
    updateLayerOpacityPreview(opacity);
    scheduleLayerOpacityKeyboardCommit();
  });
  layerOpacityInput?.addEventListener("change", () => {
    commitLayerOpacityPreview();
  });
  layerOpacityInput?.addEventListener("blur", () => {
    clearLayerOpacityPointerInteraction();
    commitLayerOpacityPreview();
  });
  layerBlendToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLayerBlendModeOpen(true);
  });
  layerBlendOutline?.addEventListener(
    "wheel",
    (event) => {
      if (!layerBlendModeOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = getNextLayerBlendModeIndex(layerBlendModeScrollIndex, direction);

      if (nextIndex === layerBlendModeScrollIndex) {
        return;
      }

      selectLayerBlendMode(layerBlendModeItems[nextIndex]?.key);
    },
    { passive: false },
  );
  layerBlendToggle?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLayerBlendMode();
      layerBlendToggle.focus();
      return;
    }

    if (!layerBlendModeOpen || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = getNextLayerBlendModeIndex(layerBlendModeScrollIndex, direction);

    if (nextIndex !== layerBlendModeScrollIndex) {
      selectLayerBlendMode(layerBlendModeItems[nextIndex]?.key);
    }
  });
  rightSidebarContent?.addEventListener("scroll", () => {
    if (layerBlendModeOpen) {
      updateLayerBlendBoxAnchor();
    }

    positionShareMenu();
  });
  window.addEventListener("resize", () => {
    if (layerBlendModeOpen) {
      updateLayerBlendBoxAnchor();
    }

    positionShareMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!layerBlendModeOpen) {
      return;
    }

    const target = event.target;

    if (target instanceof Element && target.closest("[data-layer-blend-outline]")) {
      return;
    }

    closeLayerBlendMode();
  });

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
      const layer = ensureActiveTextLayerForTransform();

      if (!layer) {
        setTextTransformMode("none");
        return;
      }

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
    setTextTransformMode("none");

    if (textTransformAmountInput) {
      textTransformAmountInput.value = "0";
    }

    updateTextTransformAmount();
    void patchActiveTextLayerPreservingVisualCenter({
      envelopeGrid: null,
      warp: {
        amount: 0,
        type: "none",
      },
    }, "text-sidebar-transform-reset");
  });
  textTransformModify?.addEventListener("click", () => {
    const layer = ensureActiveTextLayerForTransform();

    if (!layer) {
      return;
    }

    setTextTransformMode("distort");
    textTransformModify.classList.add("active");
    void editTextDistort(layer).finally(() => {
      window.setTimeout(() => {
        textTransformModify.classList.remove("active");
      }, 140);
    });
  });
  textTransformModify?.addEventListener("pointercancel", () => {
    textTransformModify.classList.remove("active");
  });
  textTransformModify?.addEventListener("blur", () => {
    window.setTimeout(() => {
      textTransformModify.classList.remove("active");
    }, 140);
  });
  textTransformToggle?.addEventListener("click", () => {
    setTextTransformationOpen(textTransformToggle.getAttribute("aria-expanded") !== "true");
  });
  saveButton?.addEventListener("click", () => {
    void saveDocumentNow();
  });

  shareButton?.addEventListener("click", () => {
    setShareMenuOpen(!isShareMenuOpen());
  });

  exportBackgroundToggle?.addEventListener("click", () => {
    setExportBackgroundEnabled(!isExportBackgroundEnabled());
  });

  exportFormatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setExportFormat(button.dataset.exportFormatOption);
    });
  });

  exportArtboardScopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setExportArtboardScope(button.dataset.exportArtboardScope, { focus: true });
    });
  });

  exportArtboardCustomInput?.addEventListener("input", () => {
    setExportArtboardCustom(exportArtboardCustomInput.value);
  });

  exportScaleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setExportScale(button.dataset.exportScaleOption);
    });
  });

  exportQualityInput?.addEventListener("input", () => {
    setExportQuality(exportQualityInput.value);
  });

  exportArtboardsButton?.addEventListener("click", () => {
    void exportDocumentArtboards();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isShareMenuOpen()) {
      return;
    }

    const target = event.target;

    if (
      target instanceof Element &&
      (
        target.closest("[data-share-menu]") ||
        target.closest("[data-share-menu-toggle]")
      )
    ) {
      return;
    }

    setShareMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isShareMenuOpen()) {
      setShareMenuOpen(false);
      shareButton?.focus?.();
    }
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const activeTool = normalizeToolName(event.detail?.toolMode || event.detail?.label);

    currentToolName = activeTool;
    syncRightSidebarPanels(activeTool);
  });

  window.addEventListener("cbo:document-layers-change", () => {
    syncRightSidebarPanels();
    syncTextControlsFromLayer();
    syncLayerControlsFromLayer();
  });

  const activeToolButton = document.querySelector("[data-tool].active");
  currentToolName = normalizeToolName(activeToolButton?.dataset.toolMode || activeToolButton?.getAttribute("aria-label"));
  syncSmudgeControls();
  syncTextControls();
  syncLayerControlsFromLayer();
  syncRightSidebarPanels();
};
