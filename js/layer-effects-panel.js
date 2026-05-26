window.CBO = window.CBO || {};

(function registerLayerEffectsPanel(namespace) {
  const MAX_GAUSSIAN_BLUR_RADIUS = 200;
  const MAX_MOTION_BLUR_DISTANCE = 300;
  const MAX_FIELD_BLUR_RADIUS = 200;
  const MAX_FIELD_BLUR_PINS = 8;
  const FIELD_BLUR_TAP_TIMEOUT_MS = 360;
  const FIELD_BLUR_TAP_MOVE_TOLERANCE = 12;
  const FIELD_BLUR_PREVIEW_DEBOUNCE_MS = 90;
  const MAX_RADIAL_BLUR_AMOUNT = 200;
  const MAX_GRAIN_AMOUNT = 100;
  const MAX_GRAIN_SCALE = 100;
  const DEFAULT_GRAIN_SCALE = 42;
  const MAX_NOISE_AMOUNT = 100;
  const MAX_NOISE_SCALE = 100;
  const DEFAULT_NOISE_SCALE = 1;
  const MAX_THRESHOLD_VALUE = 255;
  const DEFAULT_COLOR_OVERLAY_COLOR = "#FFFFFF";
  const MAX_LAYER_STROKE_SIZE = 64;
  const DEFAULT_LAYER_STROKE_SIZE = 8;
  const MOBILE_LAYER_EFFECTS_BACK_ICON = `
    <svg class="lucide lucide-arrow-left-icon lucide-arrow-left" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  `;
  const DEFAULT_THRESHOLD_VALUE = 128;
  const RASTERIZABLE_EFFECT_TYPES = Object.freeze([
    "curves",
    "gaussian-blur",
    "motion-blur",
    "field-blur",
    "radial-blur",
    "noise",
    "grain",
    "threshold",
    "color-overlay",
    "stroke",
  ]);
  const EFFECT_GROUPS = Object.freeze([
    {
      label: "Style",
      items: Object.freeze([
        { implemented: true, icon: "color", label: "Color Overlay", mobile: false, type: "color-overlay" },
        { implemented: true, icon: "stroke", label: "Stroke", mobile: false, type: "stroke" },
      ]),
    },
    {
      label: "Blur",
      items: Object.freeze([
        { implemented: true, icon: "blur", label: "Gaussian Blur", type: "gaussian-blur" },
        { implemented: true, icon: "motion", label: "Motion Blur", type: "motion-blur" },
        { implemented: true, icon: "field", label: "Field Blur", type: "field-blur" },
        { implemented: true, icon: "radial", label: "Radial Blur", type: "radial-blur" },
      ]),
    },
    {
      label: "Color",
      items: Object.freeze([
        { implemented: true, icon: "curves", label: "Curves", mobile: false, type: "curves" },
        { implemented: false, icon: "levels", label: "Levels", type: "levels" },
        { implemented: true, icon: "threshold", label: "Threshold", type: "threshold" },
        { implemented: false, icon: "hue", label: "Hue/Saturation", type: "hue-saturation" },
      ]),
    },
    {
      label: "Texture",
      items: Object.freeze([
        { implemented: true, icon: "noise", label: "Noise", type: "noise" },
        { implemented: true, icon: "grain", label: "Grain", type: "grain" },
        { implemented: false, icon: "halftone", label: "Halftone", type: "halftone" },
        { implemented: false, icon: "pixelate", label: "Pixelate", type: "pixelate" },
      ]),
    },
    {
      label: "Light",
      items: Object.freeze([
        { implemented: false, icon: "bloom", label: "Bloom", type: "bloom" },
        { implemented: false, icon: "glow", label: "Glow", type: "glow" },
        { implemented: false, icon: "vignette", label: "Vignette", type: "vignette" },
      ]),
    },
  ]);

  function clamp(value, min, max) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  }

  function normalizeAngle(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return ((number % 360) + 360) % 360;
  }

  function getDisplayAngle(value) {
    return Math.round(normalizeAngle(value)) % 360;
  }

  function normalizePercent(value, fallback = 50) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
  }

  function normalizeThresholdValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_THRESHOLD_VALUE, number)) : DEFAULT_THRESHOLD_VALUE;
  }

  function normalizeUnitOpacity(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }

  function normalizeLayerStrokeSize(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_LAYER_STROKE_SIZE, number)) : 0;
  }

  function normalizeHexColor(value, fallback = DEFAULT_COLOR_OVERLAY_COLOR) {
    const raw = String(value || "").trim();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
        .toUpperCase()}`;
    }

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toUpperCase()}`;
    }

    return fallback;
  }

  function getSelectedOverlayColor() {
    return normalizeHexColor(namespace.selectedColor || namespace.brushSettings?.color || DEFAULT_COLOR_OVERLAY_COLOR);
  }

  function getCurvesEngine() {
    return namespace.CurvesEngine || null;
  }

  function createDefaultCurvesPoints() {
    const engine = getCurvesEngine();

    return engine?.createDefaultPointsByChannel?.() || {
      b: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      g: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      r: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      rgb: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
    };
  }

  function normalizeCurvesPoints(pointsByChannel = {}) {
    const engine = getCurvesEngine();

    return engine?.normalizePointsByChannel?.(pointsByChannel) || createDefaultCurvesPoints();
  }

  function hasMeaningfulCurves(pointsByChannel = {}) {
    const engine = getCurvesEngine();

    return engine?.hasMeaningfulCurves?.(pointsByChannel) === true;
  }

  function getRendererDocumentSize() {
    const renderer = namespace.documentRenderer;

    return {
      height: Math.max(1, Number(renderer?.height) || 4000),
      width: Math.max(1, Number(renderer?.width) || 4000),
    };
  }

  function getLayerEffectCenterPoint(layer) {
    const renderer = namespace.documentRenderer;
    const { height, width } = getRendererDocumentSize();
    const contentBounds = layer?.id
      ? renderer?.getRasterContentBounds?.(layer.id, {
          padCells: 0,
          padding: 0,
          sampleCols: 256,
          sampleRows: 256,
        })
      : null;

    if (
      contentBounds &&
      Number.isFinite(contentBounds.x) &&
      Number.isFinite(contentBounds.y) &&
      Number.isFinite(contentBounds.width) &&
      Number.isFinite(contentBounds.height) &&
      contentBounds.width > 0 &&
      contentBounds.height > 0
    ) {
      return {
        x: clamp(contentBounds.x + contentBounds.width * 0.5, 0, width),
        y: clamp(contentBounds.y + contentBounds.height * 0.5, 0, height),
      };
    }

    return {
      x: width * 0.5,
      y: height * 0.5,
    };
  }

  function getLayerEffectCenterPercent(layer) {
    const { height, width } = getRendererDocumentSize();
    const center = getLayerEffectCenterPoint(layer);

    return {
      centerX: clamp((center.x / width) * 100, 0, 100),
      centerY: clamp((center.y / height) * 100, 0, 100),
    };
  }

  function findLayerEffect(layer, type, legacyKey = "") {
    const effects = layer?.effects;

    return Array.isArray(effects)
      ? effects.find((item) => item && item.type === type && item.enabled !== false)
      : effects?.[legacyKey];
  }

  function normalizeRadialBlurMode(value) {
    return String(value || "").trim().toLowerCase() === "zoom" ? "zoom" : "spin";
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function getEffectDefinition(type) {
    for (const group of EFFECT_GROUPS) {
      const item = group.items.find((effect) => effect.type === type);

      if (item) {
        return item;
      }
    }

    return null;
  }

  function isImplementedEffect(type) {
    return getEffectDefinition(type)?.implemented === true;
  }

  function getEffectIconMarkup(icon) {
    const pathsByIcon = {
      bloom: '<circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 4.9 2.1 2.1" /><path d="m17 17 2.1 2.1" /><path d="m19.1 4.9-2.1 2.1" /><path d="m7 17-2.1 2.1" />',
      blur: '<circle cx="12" cy="12" r="1" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="9" />',
      color: '<path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-1.6a1.4 1.4 0 0 0-1.1 2.27l.25.32A2.75 2.75 0 0 1 14.37 22H12Z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="10.5" cy="6.5" r="1" /><circle cx="15.5" cy="7.5" r="1" /><circle cx="17.5" cy="12" r="1" />',
      curves: '<path d="M4 19c5 0 4-14 9-14 4 0 3 14 7 14" /><path d="M4 19h16" /><path d="M4 5v14" />',
      field: '<circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M2 12h2" /><path d="M20 12h2" />',
      glow: '<path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><circle cx="12" cy="12" r="4" />',
      grain: '<circle cx="7" cy="7" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="11" cy="12" r="1" /><circle cx="18" cy="14" r="1" /><circle cx="6" cy="17" r="1" />',
      halftone: '<circle cx="6" cy="6" r="2" /><circle cx="14" cy="5" r="1.5" /><circle cx="20" cy="8" r="1" /><circle cx="9" cy="14" r="1.5" /><circle cx="17" cy="16" r="2" /><circle cx="5" cy="20" r="1" />',
      hue: '<circle cx="12" cy="12" r="8" /><path d="M12 4v16" /><path d="M4 12h16" />',
      levels: '<path d="M4 19h16" /><path d="M6 19V9" /><path d="M12 19V5" /><path d="M18 19v-7" />',
      motion: '<path d="M4 8h9" /><path d="M4 12h16" /><path d="M4 16h9" /><path d="m16 8 4 4-4 4" />',
      noise: '<path d="M4 7h1" /><path d="M9 7h1" /><path d="M14 7h1" /><path d="M19 7h1" /><path d="M6 12h1" /><path d="M11 12h1" /><path d="M16 12h1" /><path d="M4 17h1" /><path d="M9 17h1" /><path d="M14 17h1" /><path d="M19 17h1" />',
      pixelate: '<path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h6v6h-6z" />',
      radial: '<circle cx="12" cy="12" r="8" /><path d="M12 4v4" /><path d="M12 16v4" /><path d="M4 12h4" /><path d="M16 12h4" />',
      stroke: '<rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 9h6v6H9z" />',
      threshold: '<path d="M4 19h16" /><path d="M4 5h16" /><path d="M12 5v14" /><path d="M8 9h8" /><path d="M8 15h8" />',
      vignette: '<rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="12" cy="12" r="4" />',
    };

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${pathsByIcon[icon] || pathsByIcon.blur}
      </svg>
    `;
  }

  function getImplementedEffectItems() {
    return EFFECT_GROUPS
      .flatMap((group) => group.items)
      .filter((effect) => effect.implemented === true && effect.mobile !== false);
  }

  function getMobileLayerEffectsToolbarMarkup() {
    return `
      <nav class="bottom-toolbar mobile-layer-effects-toolbar" aria-label="Adjustment effects toolbar" data-mobile-layer-effects-toolbar hidden>
        <button class="tool-button mobile-context-back-button mobile-layer-effects-back-button" type="button" aria-label="BACK" aria-pressed="false" data-tooltip="BACK" data-mobile-layer-effects-back>
          ${MOBILE_LAYER_EFFECTS_BACK_ICON}
        </button>
        ${getImplementedEffectItems().map((effect) => `
          <button
            class="tool-button mobile-layer-effect-button"
            type="button"
            aria-label="${effect.label}"
            aria-pressed="false"
            data-tooltip="${effect.label}"
            data-mobile-layer-effect-trigger="${effect.type}"
          >
            ${getEffectIconMarkup(effect.icon)}
          </button>
        `).join("")}
      </nav>
    `;
  }

  function getMobileEffectRangeMarkup(label, value, max, dataName, options = {}) {
    const min = Number.isFinite(options.min) ? options.min : 0;
    const step = Number.isFinite(options.step) ? options.step : 1;
    const suffix = options.suffix || "";

    return `
      <label class="mobile-layer-effect-range-field">
        <span class="mobile-layer-effect-control-header">
          <span class="mobile-layer-effect-label">${label}</span>
          <output class="mobile-layer-effect-value" data-mobile-layer-effect-value="${dataName}">${value}${suffix}</output>
        </span>
        <input
          class="mobile-layer-effect-range"
          type="range"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${value}"
          aria-label="${label}"
          data-mobile-layer-effect-input="${dataName}"
        />
      </label>
    `;
  }

  function getMobileLayerEffectsPanelMarkup() {
    return `
      <section class="mobile-layer-effects-panel" aria-label="Adjustment effect values" data-mobile-layer-effects-panel hidden>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="gaussian-blur" hidden>
          ${getMobileEffectRangeMarkup("Radius", 0, MAX_GAUSSIAN_BLUR_RADIUS, "gaussian-radius", { suffix: "px" })}
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="gaussian-blur">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="motion-blur" hidden>
          ${getMobileEffectRangeMarkup("Distance", 0, MAX_MOTION_BLUR_DISTANCE, "motion-distance", { suffix: "px" })}
          ${getMobileEffectRangeMarkup("Angle", 0, 360, "motion-angle")}
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="motion-blur">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="field-blur" hidden>
          ${getMobileEffectRangeMarkup("Blur", 0, MAX_FIELD_BLUR_RADIUS, "field-blur", { suffix: "px" })}
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="field-blur">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="radial-blur" hidden>
          <div class="mobile-layer-effect-segment-row" role="group" aria-label="Radial blur mode">
            <button class="mobile-layer-effect-segment active" type="button" aria-pressed="true" data-mobile-radial-mode="spin">Spin</button>
            <button class="mobile-layer-effect-segment" type="button" aria-pressed="false" data-mobile-radial-mode="zoom">Zoom</button>
          </div>
          ${getMobileEffectRangeMarkup("Amount", 0, MAX_RADIAL_BLUR_AMOUNT, "radial-amount")}
          ${getMobileEffectRangeMarkup("Center X", 50, 100, "radial-center-x", { suffix: "%" })}
          ${getMobileEffectRangeMarkup("Center Y", 50, 100, "radial-center-y", { suffix: "%" })}
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="radial-blur">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="grain" hidden>
          ${getMobileEffectRangeMarkup("Amount", 0, MAX_GRAIN_AMOUNT, "grain-amount", { suffix: "%" })}
          ${getMobileEffectRangeMarkup("Scale", DEFAULT_GRAIN_SCALE, MAX_GRAIN_SCALE, "grain-scale", { min: 1, suffix: "%" })}
          <button class="mobile-layer-effect-toggle active" type="button" aria-pressed="true" data-mobile-grain-monochrome>Mono</button>
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="grain">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="noise" hidden>
          ${getMobileEffectRangeMarkup("Amount", 0, MAX_NOISE_AMOUNT, "noise-amount", { suffix: "%" })}
          ${getMobileEffectRangeMarkup("Scale", DEFAULT_NOISE_SCALE, MAX_NOISE_SCALE, "noise-scale", { min: 1, suffix: "%" })}
          <button class="mobile-layer-effect-toggle active" type="button" aria-pressed="true" data-mobile-noise-monochrome>Mono</button>
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="noise">Reset</button>
        </div>
        <div class="mobile-layer-effects-section" data-mobile-layer-effects-editor="threshold" hidden>
          ${getMobileEffectRangeMarkup("Level", DEFAULT_THRESHOLD_VALUE, MAX_THRESHOLD_VALUE, "threshold-level")}
          <button class="mobile-layer-effect-reset" type="button" data-mobile-layer-effect-reset="threshold">Reset</button>
        </div>
      </section>
    `;
  }

  function getAdjustmentEffectGroups() {
    return EFFECT_GROUPS.filter((group) => group.label !== "Style");
  }

  function getStyleEffectGroups() {
    return EFFECT_GROUPS.filter((group) => group.label === "Style");
  }

  function getEffectPickerMarkup(effectGroups = getAdjustmentEffectGroups()) {
    return effectGroups.map((group) => `
      <section class="layer-effects-menu-group" data-layer-effects-menu-group>
        <div class="layer-effects-menu-title">${group.label}</div>
        <div class="layer-effects-menu-options">
          ${group.items.map((effect) => `
            <button
              class="layer-effect-option"
              type="button"
              data-effect-label="${effect.label.toLowerCase()}"
              data-layer-effect-option="${effect.type}"
              aria-disabled="false"
            >
              <span class="layer-effect-option-icon">${getEffectIconMarkup(effect.icon)}</span>
              <span class="layer-effect-option-label">${effect.label}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");
  }

  function getAdjustmentControlMarkup(label, value, input = "range") {
    if (input === "checkbox") {
      return `
        <label class="layer-effects-check-row">
          <span class="layer-effects-label">${label}</span>
          <input class="layer-effects-check" type="checkbox" ${value ? "checked" : ""} disabled />
        </label>
      `;
    }

    return `
      <label class="layer-effects-control-row">
        <span class="layer-effects-label">${label}</span>
        <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="${value}" disabled />
      </label>
    `;
  }

  function getCurvesEditorMarkup() {
    return `
      <div class="layer-effects-tabs" aria-label="Curve channel">
        <button class="layer-effects-tab active" type="button" data-curves-channel="rgb">RGB</button>
        <button class="layer-effects-tab" type="button" data-curves-channel="r">R</button>
        <button class="layer-effects-tab" type="button" data-curves-channel="g">G</button>
        <button class="layer-effects-tab" type="button" data-curves-channel="b">B</button>
      </div>
      <div class="layer-effects-curve-box" data-curves-graph>
        <svg viewBox="0 0 255 255" fill="none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" data-curves-svg>
          <rect class="curves-graph-surface" x="0" y="0" width="255" height="255" />
          <path class="curves-grid curves-grid-minor" d="M0 31.875H255M0 95.625H255M0 159.375H255M0 223.125H255M31.875 0V255M95.625 0V255M159.375 0V255M223.125 0V255" />
          <path class="curves-grid curves-grid-major" d="M0 63.75H255M0 127.5H255M0 191.25H255M63.75 0V255M127.5 0V255M191.25 0V255" />
          <path class="curves-baseline" d="M0 255L255 0" />
          <path class="curves-overlay curves-overlay-r" data-curves-overlay="r" />
          <path class="curves-overlay curves-overlay-g" data-curves-overlay="g" />
          <path class="curves-overlay curves-overlay-b" data-curves-overlay="b" />
          <path class="curve-line" data-curves-line />
          <g data-curves-points></g>
        </svg>
      </div>
      <div class="curves-point-controls">
        <label class="curves-point-field">
          <span class="layer-effects-label">Input</span>
          <input class="curves-number-input" type="number" min="0" max="255" step="1" value="0" inputmode="numeric" data-curves-input />
        </label>
        <label class="curves-point-field">
          <span class="layer-effects-label">Output</span>
          <input class="curves-number-input" type="number" min="0" max="255" step="1" value="0" inputmode="numeric" data-curves-output />
        </label>
      </div>
      <div class="layer-effects-actions curves-actions">
        <button class="layer-effects-icon-button" type="button" aria-label="Reset current curve" data-curves-reset-channel>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button class="layer-effects-icon-button" type="button" aria-label="Reset all curves" data-curves-reset-all>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
    `;
  }

  function getEffectEditorMarkup(effect) {
    if (
      effect.type === "gaussian-blur" ||
      effect.type === "motion-blur" ||
      effect.type === "field-blur" ||
      effect.type === "radial-blur" ||
      effect.type === "grain" ||
      effect.type === "noise" ||
      effect.type === "threshold" ||
      effect.type === "color-overlay" ||
      effect.type === "stroke"
    ) {
      return "";
    }

    const controlsByType = {
      bloom: [
        getAdjustmentControlMarkup("Threshold", 72),
        getAdjustmentControlMarkup("Radius", 28),
        getAdjustmentControlMarkup("Intensity", 34),
      ],
      glow: [
        getAdjustmentControlMarkup("Radius", 18),
        getAdjustmentControlMarkup("Intensity", 40),
        getAdjustmentControlMarkup("Spread", 24),
      ],
      halftone: [
        getAdjustmentControlMarkup("Size", 34),
        getAdjustmentControlMarkup("Angle", 45),
        getAdjustmentControlMarkup("Contrast", 62),
      ],
      "hue-saturation": [
        getAdjustmentControlMarkup("Hue", 50),
        getAdjustmentControlMarkup("Saturation", 50),
        getAdjustmentControlMarkup("Lightness", 50),
      ],
      levels: [
        getAdjustmentControlMarkup("Shadows", 8),
        getAdjustmentControlMarkup("Midtones", 50),
        getAdjustmentControlMarkup("Highlights", 92),
      ],
      "motion-blur": [
        getAdjustmentControlMarkup("Distance", 26),
        getAdjustmentControlMarkup("Angle", 38),
      ],
      pixelate: [
        getAdjustmentControlMarkup("Size", 18),
      ],
      threshold: [
        getAdjustmentControlMarkup("Level", DEFAULT_THRESHOLD_VALUE),
      ],
      vignette: [
        getAdjustmentControlMarkup("Amount", 35),
        getAdjustmentControlMarkup("Size", 68),
        getAdjustmentControlMarkup("Feather", 44),
      ],
    };

    return `
      <section class="layer-effects-section layer-effects-disabled-editor" aria-label="${effect.label}" data-layer-effects-editor="${effect.type}" hidden>
        ${effect.type === "curves" ? getCurvesEditorMarkup() : (controlsByType[effect.type] || []).join("")}
      </section>
    `;
  }

  function getEffectEditorsMarkup() {
    return EFFECT_GROUPS
      .flatMap((group) => group.items)
      .map((effect) => getEffectEditorMarkup(effect))
      .join("");
  }

  function getGaussianBlurRadius(layer) {
    const effects = layer?.effects;
    const effect = Array.isArray(effects)
      ? effects.find((item) => item && item.type === "gaussian-blur" && item.enabled !== false)
      : effects?.gaussianBlur;
    const radius = Number(effect?.radius);

    return Number.isFinite(radius) ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius)) : 0;
  }

  function getMotionBlur(layer) {
    const effects = layer?.effects;
    const effect = Array.isArray(effects)
      ? effects.find((item) => item && item.type === "motion-blur" && item.enabled !== false)
      : effects?.motionBlur;
    const distance = Number(effect?.distance);

    return {
      angle: normalizeAngle(effect?.angle),
      distance: Number.isFinite(distance) ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance)) : 0,
    };
  }

  function normalizeFieldBlurPin(pin) {
    const x = Number(pin?.x);
    const y = Number(pin?.y);
    const blur = Number(pin?.blur);
    const nextPin = {
      blur: Number.isFinite(blur) ? Math.max(0, Math.min(MAX_FIELD_BLUR_RADIUS, blur)) : 0,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };

    if (typeof pin?.id === "string" && pin.id.trim()) {
      nextPin.id = pin.id;
    }

    return nextPin;
  }

  function normalizeFieldBlurPins(pins) {
    return Array.isArray(pins)
      ? pins
          .filter(Boolean)
          .slice(0, MAX_FIELD_BLUR_PINS)
          .map((pin) => normalizeFieldBlurPin(pin))
      : [];
  }

  function hasFieldBlurAmount(pins) {
    return normalizeFieldBlurPins(pins).some((pin) => pin.blur > 0);
  }

  function getFieldBlur(layer) {
    const effects = layer?.effects;
    const effect = Array.isArray(effects)
      ? effects.find((item) => item && item.type === "field-blur" && item.enabled !== false)
      : effects?.fieldBlur;

    return {
      pins: normalizeFieldBlurPins(effect?.pins),
    };
  }

  function getRadialBlur(layer, options = {}) {
    const effect = findLayerEffect(layer, "radial-blur", "radialBlur");
    const amount = Number(effect?.amount);
    const centerFallback = effect?.center;
    const defaultCenter = effect
      ? { centerX: 50, centerY: 50 }
      : (options.defaultToLayerCenter === true
        ? getLayerEffectCenterPercent(layer)
        : { centerX: 50, centerY: 50 });

    return {
      amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount)) : 0,
      centerX: normalizePercent(effect?.centerX ?? centerFallback, defaultCenter.centerX),
      centerY: normalizePercent(effect?.centerY ?? centerFallback, defaultCenter.centerY),
      mode: normalizeRadialBlurMode(effect?.mode),
    };
  }

  function getGrain(layer) {
    const effect = findLayerEffect(layer, "grain", "grain");
    const amount = Number(effect?.amount);
    const scale = Number(effect?.scale);
    const seed = Number(effect?.seed);

    return {
      amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_GRAIN_AMOUNT, amount)) : 0,
      scale: Number.isFinite(scale) ? Math.max(1, Math.min(MAX_GRAIN_SCALE, scale)) : DEFAULT_GRAIN_SCALE,
      monochrome: effect ? effect.monochrome !== false : true,
      seed: Number.isFinite(seed) ? seed : 0,
    };
  }

  function getNoise(layer) {
    const effect = findLayerEffect(layer, "noise", "noise");
    const amount = Number(effect?.amount);
    const scale = Number(effect?.scale);
    const seed = Number(effect?.seed);

    return {
      amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_NOISE_AMOUNT, amount)) : 0,
      scale: Number.isFinite(scale) ? Math.max(1, Math.min(MAX_NOISE_SCALE, scale)) : DEFAULT_NOISE_SCALE,
      monochrome: effect ? effect.monochrome !== false : true,
      seed: Number.isFinite(seed) ? seed : 0,
    };
  }

  function getThreshold(layer) {
    const effect = findLayerEffect(layer, "threshold", "threshold");

    return {
      enabled: Boolean(effect && effect.enabled !== false),
      threshold: normalizeThresholdValue(effect?.threshold ?? effect?.level),
    };
  }

  function getCurves(layer) {
    const effect = findLayerEffect(layer, "curves", "curves");

    return {
      enabled: effect?.enabled !== false,
      points: normalizeCurvesPoints(effect?.points || effect?.curves),
    };
  }

  function getColorOverlay(layer) {
    const effect = findLayerEffect(layer, "color-overlay", "colorOverlay");
    const opacity = normalizeUnitOpacity(effect?.opacity);

    return {
      color: normalizeHexColor(effect?.color || effect?.hex || getSelectedOverlayColor()),
      enabled: Boolean(effect && effect.enabled !== false && opacity > 0),
      opacity,
    };
  }

  function getStroke(layer) {
    const effect = findLayerEffect(layer, "stroke", "stroke");
    const opacity = normalizeUnitOpacity(effect?.opacity);
    const size = normalizeLayerStrokeSize(effect?.size ?? effect?.width);

    return {
      color: normalizeHexColor(effect?.color || effect?.hex || getSelectedOverlayColor()),
      enabled: Boolean(effect && effect.enabled !== false && opacity > 0 && size > 0),
      opacity,
      position: "outside",
      size,
    };
  }

  function createEffectSeed(type, layerId) {
    const text = `${type}:${layerId || ""}`;
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return ((hash >>> 0) % 100000) / 100;
  }

  function createGrainSeed(layerId) {
    return createEffectSeed("grain", layerId);
  }

  function createNoiseSeed(layerId) {
    return createEffectSeed("noise", layerId);
  }

  function getNextEffects(layer, radius) {
    const nextRadius = clamp(radius, 0, MAX_GAUSSIAN_BLUR_RADIUS);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "gaussian-blur")
      .map((effect) => cloneValue(effect));

    if (nextRadius > 0) {
      effects.push({
        type: "gaussian-blur",
        enabled: true,
        radius: nextRadius,
      });
    }

    return effects;
  }

  function getNextMotionBlurEffects(layer, distance, angle) {
    const nextDistance = clamp(distance, 0, MAX_MOTION_BLUR_DISTANCE);
    const nextAngle = normalizeAngle(angle);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "motion-blur")
      .map((effect) => cloneValue(effect));

    if (nextDistance > 0) {
      effects.push({
        type: "motion-blur",
        enabled: true,
        distance: nextDistance,
        angle: nextAngle,
      });
    }

    return effects;
  }

  function getNextFieldBlurEffects(layer, pins) {
    const nextPins = normalizeFieldBlurPins(pins);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "field-blur")
      .map((effect) => cloneValue(effect));

    if (hasFieldBlurAmount(nextPins)) {
      effects.push({
        type: "field-blur",
        enabled: true,
        pins: nextPins,
      });
    }

    return effects;
  }

  function getNextRadialBlurEffects(layer, amount, centerX, centerY, mode = "spin") {
    const nextAmount = clamp(amount, 0, MAX_RADIAL_BLUR_AMOUNT);
    const defaultCenter = getLayerEffectCenterPercent(layer);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "radial-blur")
      .map((effect) => cloneValue(effect));

    if (nextAmount > 0) {
      effects.push({
        type: "radial-blur",
        enabled: true,
        amount: nextAmount,
        centerX: normalizePercent(centerX, defaultCenter.centerX),
        centerY: normalizePercent(centerY, defaultCenter.centerY),
        mode: normalizeRadialBlurMode(mode),
      });
    }

    return effects;
  }

  function getNextGrainEffects(layer, amount, scale, monochrome) {
    const nextAmount = clamp(amount, 0, MAX_GRAIN_AMOUNT);
    const nextScale = clamp(scale, 1, MAX_GRAIN_SCALE);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const existingGrain = existingEffects.find((effect) => effect && effect.type === "grain");
    const existingSeed = Number(existingGrain?.seed);
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "grain")
      .map((effect) => cloneValue(effect));

    if (nextAmount > 0) {
      effects.push({
        type: "grain",
        enabled: true,
        amount: nextAmount,
        scale: nextScale,
        monochrome: monochrome !== false,
        seed: Number.isFinite(existingSeed) ? existingSeed : createGrainSeed(layer?.id),
      });
    }

    return effects;
  }

  function getNextNoiseEffects(layer, amount, scale, monochrome) {
    const nextAmount = clamp(amount, 0, MAX_NOISE_AMOUNT);
    const nextScale = clamp(scale, 1, MAX_NOISE_SCALE);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const existingNoise = existingEffects.find((effect) => effect && effect.type === "noise");
    const existingSeed = Number(existingNoise?.seed);
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "noise")
      .map((effect) => cloneValue(effect));

    if (nextAmount > 0) {
      effects.push({
        type: "noise",
        enabled: true,
        amount: nextAmount,
        scale: nextScale,
        monochrome: monochrome !== false,
        seed: Number.isFinite(existingSeed) ? existingSeed : createNoiseSeed(layer?.id),
      });
    }

    return effects;
  }

  function getNextThresholdEffects(layer, threshold, enabled = true) {
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "threshold")
      .map((effect) => cloneValue(effect));

    if (enabled !== false) {
      effects.push({
        type: "threshold",
        enabled: true,
        threshold: normalizeThresholdValue(threshold),
      });
    }

    return effects;
  }

  function getNextCurvesEffects(layer, pointsByChannel, enabled = true) {
    const nextPoints = normalizeCurvesPoints(pointsByChannel);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "curves")
      .map((effect) => cloneValue(effect));

    if (enabled !== false && hasMeaningfulCurves(nextPoints)) {
      effects.push({
        type: "curves",
        enabled: true,
        points: nextPoints,
      });
    }

    return effects;
  }

  function getNextColorOverlayEffects(layer, color, opacity, enabled = true) {
    const nextColor = normalizeHexColor(color);
    const nextOpacity = normalizeUnitOpacity(opacity);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "color-overlay")
      .map((effect) => cloneValue(effect));

    if (enabled !== false && nextOpacity > 0) {
      effects.push({
        type: "color-overlay",
        enabled: true,
        color: nextColor,
        opacity: nextOpacity,
      });
    }

    return effects;
  }

  function getNextStrokeEffects(layer, size, color, opacity, enabled = true) {
    const nextSize = normalizeLayerStrokeSize(size);
    const nextColor = normalizeHexColor(color);
    const nextOpacity = normalizeUnitOpacity(opacity);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "stroke")
      .map((effect) => cloneValue(effect));

    if (enabled !== false && nextSize > 0 && nextOpacity > 0) {
      effects.push({
        type: "stroke",
        enabled: true,
        color: nextColor,
        opacity: nextOpacity,
        position: "outside",
        size: nextSize,
      });
    }

    return effects;
  }

  function isRenderableEffect(effect) {
    if (!effect || effect.enabled === false || !RASTERIZABLE_EFFECT_TYPES.includes(effect.type)) {
      return false;
    }

    if (effect.type === "gaussian-blur") {
      return getGaussianBlurRadius({ effects: [effect] }) > 0;
    }

    if (effect.type === "motion-blur") {
      return getMotionBlur({ effects: [effect] }).distance > 0;
    }

    if (effect.type === "field-blur") {
      return hasFieldBlurAmount(getFieldBlur({ effects: [effect] }).pins);
    }

    if (effect.type === "radial-blur") {
      return getRadialBlur({ effects: [effect] }).amount > 0;
    }

    if (effect.type === "grain") {
      return getGrain({ effects: [effect] }).amount > 0;
    }

    if (effect.type === "noise") {
      return getNoise({ effects: [effect] }).amount > 0;
    }

    if (effect.type === "threshold") {
      return getThreshold({ effects: [effect] }).enabled;
    }

    if (effect.type === "curves") {
      return hasMeaningfulCurves(getCurves({ effects: [effect] }).points);
    }

    if (effect.type === "color-overlay") {
      return getColorOverlay({ effects: [effect] }).enabled;
    }

    if (effect.type === "stroke") {
      return getStroke({ effects: [effect] }).enabled;
    }

    return false;
  }

  function getRenderableEffects(layer) {
    return Array.isArray(layer?.effects)
      ? layer.effects.filter(isRenderableEffect)
      : [];
  }

  function getEffectsAfterRasterize(layer) {
    return Array.isArray(layer?.effects)
      ? layer.effects
          .filter((effect) => effect && !RASTERIZABLE_EFFECT_TYPES.includes(effect.type))
          .map((effect) => cloneValue(effect))
      : [];
  }

  function isBlurEligibleLayer(layer) {
    return Boolean(
      layer &&
      layer.locked !== true &&
      layer.type !== "group" &&
      layer.type !== "background" &&
      layer.id !== "background",
    );
  }

  function getLayerStateSnapshot(layerModel) {
    if (!layerModel || typeof layerModel.getEntries !== "function") {
      return null;
    }

    return {
      activeLayerId: layerModel.activeLayerId || null,
      entries: layerModel.getEntries(),
    };
  }

  namespace.getLayerGaussianBlurRadius = getGaussianBlurRadius;
  namespace.getLayerEffectCenterPoint = getLayerEffectCenterPoint;
  namespace.getLayerEffectCenterPercent = getLayerEffectCenterPercent;
  namespace.getLayerMotionBlur = getMotionBlur;
  namespace.getLayerFieldBlur = getFieldBlur;
  namespace.getLayerRadialBlur = getRadialBlur;
  namespace.getLayerGrain = getGrain;
  namespace.getLayerNoise = getNoise;
  namespace.getLayerThreshold = getThreshold;
  namespace.getLayerCurves = getCurves;
  namespace.getLayerColorOverlay = getColorOverlay;
  namespace.getLayerStroke = getStroke;

  namespace.hasRasterizableLayerEffects = function hasRasterizableLayerEffects(layerOrId) {
    const layer = typeof layerOrId === "string"
      ? namespace.documentLayerModel?.findEntryById?.(layerOrId)
      : layerOrId;

    return isBlurEligibleLayer(layer) && getRenderableEffects(layer).length > 0;
  };

  function updateLayerEffectsPatch(layerModel, layerId, patch, updateOptions) {
    return layerModel.updateLayer(layerId, patch, updateOptions);
  }

  function requestLayerEffectsDraw() {
    namespace.documentRenderer?.requestDraw?.();
  }

  namespace.setLayerGaussianBlurRadius = function setLayerGaussianBlurRadius(layerId, radius, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextRadius = clamp(radius, 0, MAX_GAUSSIAN_BLUR_RADIUS);
    const updateOptions = {
      historyGroup: options.historyGroup || `gaussian-blur-${layerId}`,
      source: options.source || "layer-effects-gaussian-blur",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextEffects(layer, nextRadius),
      },
      updateOptions,
      {
        effect: "gaussian-blur",
        radius: nextRadius,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("gaussian-blur", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerMotionBlur = function setLayerMotionBlur(layerId, distance, angle, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextDistance = clamp(distance, 0, MAX_MOTION_BLUR_DISTANCE);
    const nextAngle = normalizeAngle(angle);
    const updateOptions = {
      historyGroup: options.historyGroup || `motion-blur-${layerId}`,
      source: options.source || "layer-effects-motion-blur",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextMotionBlurEffects(layer, nextDistance, nextAngle),
      },
      updateOptions,
      {
        angle: nextAngle,
        distance: nextDistance,
        effect: "motion-blur",
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("motion-blur", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerFieldBlurPins = function setLayerFieldBlurPins(layerId, pins, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextPins = normalizeFieldBlurPins(pins);
    const updateOptions = {
      historyGroup: options.historyGroup || `field-blur-${layerId}`,
      source: options.source || "layer-effects-field-blur",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextFieldBlurEffects(layer, nextPins),
      },
      updateOptions,
      {
        effect: "field-blur",
        maxPinBlur: nextPins.reduce((max, pin) => Math.max(max, Number(pin.blur) || 0), 0),
        pinCount: nextPins.length,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("field-blur", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerRadialBlur = function setLayerRadialBlur(
    layerId,
    amount,
    centerX,
    centerY,
    mode = "spin",
    options = {},
  ) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);
    const updateMode = mode && typeof mode === "object" ? "spin" : mode;
    const updateOptionsSource = mode && typeof mode === "object" ? mode : options;

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextAmount = clamp(amount, 0, MAX_RADIAL_BLUR_AMOUNT);
    const nextMode = normalizeRadialBlurMode(updateMode);
    const nextEffects = getNextRadialBlurEffects(layer, nextAmount, centerX, centerY, nextMode);
    const nextRadialBlur = nextEffects.find((effect) => effect && effect.type === "radial-blur") || null;
    const updateOptions = {
      historyGroup: updateOptionsSource.historyGroup || `radial-blur-${layerId}`,
      source: updateOptionsSource.source || "layer-effects-radial-blur",
    };

    if (updateOptionsSource.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: nextEffects,
      },
      updateOptions,
      {
        amount: nextAmount,
        centerX: nextRadialBlur?.centerX,
        centerY: nextRadialBlur?.centerY,
        effect: "radial-blur",
        mode: nextMode,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("radial-blur", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerGrain = function setLayerGrain(layerId, amount, scale, monochrome, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextAmount = clamp(amount, 0, MAX_GRAIN_AMOUNT);
    const nextScale = clamp(scale, 1, MAX_GRAIN_SCALE);
    const nextMonochrome = monochrome !== false;
    const updateOptions = {
      historyGroup: options.historyGroup || `grain-${layerId}`,
      source: options.source || "layer-effects-grain",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextGrainEffects(layer, nextAmount, nextScale, nextMonochrome),
      },
      updateOptions,
      {
        amount: nextAmount,
        effect: "grain",
        monochrome: nextMonochrome,
        scale: nextScale,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("grain", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerNoise = function setLayerNoise(layerId, amount, scale, monochrome, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextAmount = clamp(amount, 0, MAX_NOISE_AMOUNT);
    const nextScale = clamp(scale, 1, MAX_NOISE_SCALE);
    const nextMonochrome = monochrome !== false;
    const updateOptions = {
      historyGroup: options.historyGroup || `noise-${layerId}`,
      source: options.source || "layer-effects-noise",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextNoiseEffects(layer, nextAmount, nextScale, nextMonochrome),
      },
      updateOptions,
      {
        amount: nextAmount,
        effect: "noise",
        monochrome: nextMonochrome,
        scale: nextScale,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("noise", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerThreshold = function setLayerThreshold(layerId, threshold, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextThreshold = normalizeThresholdValue(threshold);
    const updateOptions = {
      historyGroup: options.historyGroup || `threshold-${layerId}`,
      source: options.source || "layer-effects-threshold",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextThresholdEffects(layer, nextThreshold, options.enabled),
      },
      updateOptions,
      {
        effect: "threshold",
        enabled: options.enabled !== false,
        threshold: nextThreshold,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("threshold", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerCurves = function setLayerCurves(layerId, pointsByChannel, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextPoints = normalizeCurvesPoints(pointsByChannel);
    const updateOptions = {
      historyGroup: options.historyGroup || `curves-${layerId}`,
      source: options.source || "layer-effects-curves",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextCurvesEffects(layer, nextPoints, options.enabled),
      },
      updateOptions,
      {
        effect: "curves",
        enabled: options.enabled !== false,
        meaningful: hasMeaningfulCurves(nextPoints),
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("curves", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerColorOverlay = function setLayerColorOverlay(layerId, color, opacity = 1, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextColor = normalizeHexColor(color);
    const nextOpacity = normalizeUnitOpacity(opacity);
    const updateOptions = {
      historyGroup: options.historyGroup || `color-overlay-${layerId}`,
      source: options.source || "layer-style-color-overlay",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextColorOverlayEffects(layer, nextColor, nextOpacity, options.enabled),
      },
      updateOptions,
      {
        color: nextColor,
        effect: "color-overlay",
        enabled: options.enabled !== false && nextOpacity > 0,
        opacity: nextOpacity,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("color-overlay", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  namespace.setLayerStroke = function setLayerStroke(layerId, size, color, opacity = 1, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const nextSize = normalizeLayerStrokeSize(size);
    const nextColor = normalizeHexColor(color);
    const nextOpacity = normalizeUnitOpacity(opacity);
    const updateOptions = {
      historyGroup: options.historyGroup || `stroke-${layerId}`,
      source: options.source || "layer-style-stroke",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = updateLayerEffectsPatch(
      layerModel,
      layerId,
      {
        effects: getNextStrokeEffects(layer, nextSize, nextColor, nextOpacity, options.enabled),
      },
      updateOptions,
      {
        color: nextColor,
        effect: "stroke",
        enabled: options.enabled !== false && nextSize > 0 && nextOpacity > 0,
        opacity: nextOpacity,
        position: "outside",
        size: nextSize,
      },
    );

    if (didUpdate) {
      requestLayerEffectsDraw("stroke", layerId, updateOptions.source);
    }

    return didUpdate;
  };

  function createLayerEffectsRasterizeHistoryEntry(options = {}) {
    const {
      afterPreferSparse = false,
      afterState,
      beforeSnapshot,
      beforePreferSparse = false,
      beforeState,
      history,
      layerId,
      layerModel,
      renderer,
      rasterizeEffects,
    } = options;

    if (!history || !layerModel || !renderer || !layerId || !beforeState || !afterState) {
      return null;
    }

    const before = cloneValue(beforeState);
    const after = cloneValue(afterState);
    const effectsForRedo = Array.isArray(rasterizeEffects)
      ? cloneValue(rasterizeEffects)
      : null;

    return {
      type: "custom",
      afterActiveLayerId: after.activeLayerId,
      afterEntries: after.entries,
      beforeSnapshot,
      beforeActiveLayerId: before.activeLayerId,
      beforeEntries: before.entries,
      layerId,
      source: "layer-effects-rasterize",
      undo() {
        const didRestoreState = history.restoreLayerState(layerModel, before, {
          source: "history-undo-layer-effects-rasterize",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
          preferSparse: beforePreferSparse,
          replaceSparse: beforePreferSparse,
          source: "history-undo-layer-effects-rasterize",
        }) !== false;

        namespace.brushEngine?.requestDraw?.();
        return didRestorePixels;
      },
      redo() {
        const didRestoreBeforeState = history.restoreLayerState(layerModel, before, {
          source: "history-redo-layer-effects-rasterize-prepare",
        });

        if (!didRestoreBeforeState) {
          return false;
        }

        const didRestoreBeforePixels = renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
          preferSparse: beforePreferSparse,
          replaceSparse: beforePreferSparse,
          source: "history-redo-layer-effects-rasterize-prepare",
        }) !== false;

        if (!didRestoreBeforePixels) {
          return false;
        }

        const redoLayer = layerModel.findEntryById?.(layerId);
        const layerForRedo = effectsForRedo
          ? { ...redoLayer, effects: cloneValue(effectsForRedo) }
          : redoLayer;
        const redoResult = renderer.rasterizeLayerEffects?.(layerForRedo, {
          captureAfterSnapshot: false,
          captureBeforeSnapshot: false,
          emit: false,
          source: "history-redo-layer-effects-rasterize",
        });

        if (!redoResult) {
          return false;
        }

        renderer.deleteRasterSnapshot?.(redoResult.beforeSnapshot);
        renderer.deleteRasterSnapshot?.(redoResult.afterSnapshot);

        const didRestoreAfterState = history.restoreLayerState(layerModel, after, {
          source: "history-redo-layer-effects-rasterize",
        });

        if (!didRestoreAfterState) {
          history.restoreLayerState(layerModel, before, {
            source: "history-redo-layer-effects-rasterize-rollback",
          });
          renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
            preferSparse: beforePreferSparse,
            replaceSparse: beforePreferSparse,
            source: "history-redo-layer-effects-rasterize-rollback",
          });
          namespace.brushEngine?.requestDraw?.();
          return false;
        }

        if (afterPreferSparse) {
          renderer.sparsifyRasterizedImageLayer?.(layerId, {
            emit: false,
            source: "history-redo-layer-effects-rasterize-retile",
          });
        }

        namespace.brushEngine?.requestDraw?.();
        return true;
      },
      destroy() {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
      },
    };
  }

  namespace.createLayerEffectsRasterizeHistoryEntry = createLayerEffectsRasterizeHistoryEntry;

  namespace.rasterizeLayerEffects = function rasterizeLayerEffects(layerId, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const history = namespace.documentHistory;
    const activeLayerId = layerId || layerModel?.activeLayerId;
    const layer = activeLayerId ? layerModel?.findEntryById?.(activeLayerId) : null;

    if (!namespace.hasRasterizableLayerEffects(layer) || !renderer?.rasterizeLayerEffects) {
      return false;
    }

    history?.flushLayerState?.(layerModel);

    const beforeState = options.beforeState
      ? cloneValue(options.beforeState)
      : history?.getLayerSnapshot?.(layerModel) || null;
    const rasterizeEffects = getRenderableEffects(layer);
    const layerForRasterize = {
      ...layer,
      effects: cloneValue(rasterizeEffects),
    };
    const snapshots = renderer.rasterizeLayerEffects(layerForRasterize, {
      captureAfterSnapshot: false,
      emit: false,
      source: "layer-effects-rasterize",
    });

    if (!snapshots) {
      return false;
    }

    const rasterizedImageLayer = layer.type === "image";
    const redoRasterizeEffects = cloneValue(rasterizeEffects);
    const rasterizedLayerPatch = {
      effects: getEffectsAfterRasterize(layer),
    };

    if (rasterizedImageLayer) {
      rasterizedLayerPatch.type = "paint";
    }

    const didUpdateLayer = layerModel.updateLayer(layer.id, rasterizedLayerPatch, {
      history: false,
      source: "layer-effects-rasterize",
    });

    if (!didUpdateLayer) {
      renderer.restoreRasterSnapshot?.(layer.id, snapshots.beforeSnapshot, {
        emit: false,
        preferSparse: snapshots.beforePreferSparse,
        source: "layer-effects-rasterize-rollback",
      });
      renderer.deleteRasterSnapshot?.(snapshots.beforeSnapshot);
      return false;
    }

    if (rasterizedImageLayer) {
      const sparseTarget = renderer.sparsifyRasterizedImageLayer?.(layer.id, {
        emit: false,
        source: "layer-effects-rasterize-retile",
      });

      if (renderer.isSparseRasterTarget?.(sparseTarget)) {
        snapshots.afterPreferSparse = true;
      }
    }

    const afterState = history?.getLayerSnapshot?.(layerModel) || null;
    const historyEntry = createLayerEffectsRasterizeHistoryEntry({
      afterPreferSparse: snapshots.afterPreferSparse,
      afterState,
      beforeSnapshot: snapshots.beforeSnapshot,
      beforePreferSparse: snapshots.beforePreferSparse,
      beforeState,
      history,
      layerId: layer.id,
      layerModel,
      renderer,
      rasterizeEffects: redoRasterizeEffects,
    });

    if (historyEntry) {
      history.push(historyEntry);
    } else {
      renderer.deleteRasterSnapshot?.(snapshots.beforeSnapshot);
    }

    if (typeof renderer.commitVisualDirtyChange === "function") {
      renderer.commitVisualDirtyChange({
        layerId: layer.id,
        maxDirtyRects: 96,
        preserveDirtyRects: Array.isArray(snapshots.previewDirtyRects) && snapshots.previewDirtyRects.length > 0,
        rect: snapshots.previewDirtyRects?.length ? null : snapshots.targetRect || null,
        rects: snapshots.previewDirtyRects || null,
        source: "layer-effects-rasterize",
      });
    } else {
      renderer.emitContentChange?.({
        layerId: layer.id,
        maxDirtyRects: 96,
        preserveDirtyRects: Array.isArray(snapshots.previewDirtyRects) && snapshots.previewDirtyRects.length > 0,
        rect: snapshots.previewDirtyRects?.length ? null : snapshots.targetRect || null,
        rects: snapshots.previewDirtyRects || null,
        source: "layer-effects-rasterize",
      });
    }
    renderer.requestDraw?.();
    window.dispatchEvent(new CustomEvent("cbo:layer-effects-rasterized", {
      detail: {
        layerId: layer.id,
        rasterizedLayerType: rasterizedLayerPatch.type || layer.type,
        source: "layer-effects-rasterize",
      },
    }));

    return true;
  };

  namespace.rasterizeActiveLayerEffects = (options = {}) => namespace.rasterizeLayerEffects(null, options);

  namespace.initLayerEffectsPanel = function initLayerEffectsPanel() {
    const adjustmentButton = document.querySelector(".vertical-adjustment-layer-button");
    const layerStyleButton = document.querySelector(".vertical-layer-style-button");
    const button = adjustmentButton || layerStyleButton;
    const mobileLauncherButton = document.querySelector(".mobile-adjustment-layer-button");

    if ((!button && !mobileLauncherButton) || document.querySelector("[data-layer-effects-panel]")) {
      return;
    }

    const panel = document.createElement("div");

    panel.className = "layer-effects-popover";
    panel.hidden = true;
    panel.dataset.layerEffectsPanel = "";
    panel.innerHTML = `
      <div class="layer-effects-picker" data-layer-effects-picker>
        <div class="layer-effects-header">
          <div class="layer-effects-heading">
            <span class="layer-effects-title">Effects</span>
            <span class="layer-effects-target" data-layer-effects-picker-target>Layer</span>
          </div>
          <button class="layer-effects-icon-button" type="button" aria-label="Close effects" data-layer-effects-panel-close>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <label class="layer-effects-search">
          <input class="layer-effects-search-input" type="search" placeholder="Search effects" aria-label="Search effects" data-layer-effects-search />
        </label>
        <div class="layer-effects-menu" data-layer-effects-menu>
          ${getEffectPickerMarkup()}
        </div>
      </div>
      <div class="layer-effects-detail" data-layer-effects-detail hidden>
        <div class="layer-effects-header">
          <button class="layer-effects-icon-button layer-effects-back-button" type="button" aria-label="Back to effects" data-layer-effects-back>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div class="layer-effects-heading">
            <span class="layer-effects-title" data-layer-effects-title>Effect</span>
            <span class="layer-effects-target" data-layer-effects-target>Layer</span>
          </div>
          <div class="layer-effects-header-actions">
            <button class="layer-effects-icon-button" type="button" aria-label="Apply effect" data-layer-effects-accept>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button class="layer-effects-icon-button" type="button" aria-label="Cancel effects" data-layer-effects-close>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div class="layer-effects-detail-body">
          <section class="layer-effects-section" aria-label="Color overlay" data-layer-effects-editor="color-overlay" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Color Overlay</span>
              <output class="layer-effects-value layer-effects-color-value" data-layer-color-overlay-hex>#FFFFFF</output>
            </div>
            <label class="layer-effects-color-row">
              <span class="layer-effects-color-swatch" data-layer-color-overlay-swatch>
                <input class="layer-effects-color-input" type="color" value="#FFFFFF" aria-label="Color overlay color" data-layer-color-overlay-input />
              </span>
              <span class="layer-effects-label">Color</span>
            </label>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Opacity</span>
              <output class="layer-effects-value" data-layer-color-overlay-opacity-value>100%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="100" aria-label="Color overlay opacity" data-layer-color-overlay-opacity-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset color overlay" data-layer-color-overlay-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Stroke" data-layer-effects-editor="stroke" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Size</span>
              <output class="layer-effects-value" data-layer-stroke-size-value>8 px</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="64" step="1" value="8" aria-label="Stroke size" data-layer-stroke-size-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Stroke</span>
              <output class="layer-effects-value layer-effects-color-value" data-layer-stroke-hex>#FFFFFF</output>
            </div>
            <label class="layer-effects-color-row">
              <span class="layer-effects-color-swatch" data-layer-stroke-swatch>
                <input class="layer-effects-color-input" type="color" value="#FFFFFF" aria-label="Stroke color" data-layer-stroke-color-input />
              </span>
              <span class="layer-effects-label">Color</span>
            </label>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Opacity</span>
              <output class="layer-effects-value" data-layer-stroke-opacity-value>100%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="100" aria-label="Stroke opacity" data-layer-stroke-opacity-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset stroke" data-layer-stroke-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Gaussian blur" data-layer-effects-editor="gaussian-blur" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Gaussian Blur</span>
              <output class="layer-effects-value" data-layer-blur-value>0 px</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="200" step="1" value="0" aria-label="Gaussian blur radius" data-layer-blur-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset gaussian blur" data-layer-blur-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Motion blur" data-layer-effects-editor="motion-blur" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Distance</span>
              <output class="layer-effects-value" data-layer-motion-distance-value>0 px</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="300" step="1" value="0" aria-label="Motion blur distance" data-layer-motion-distance-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Angle</span>
              <output class="layer-effects-value" data-layer-motion-angle-value>0 deg</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="359" step="1" value="0" aria-label="Motion blur angle" data-layer-motion-angle-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset motion blur" data-layer-motion-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Field blur" data-layer-effects-editor="field-blur" hidden>
            <div class="field-blur-pin-list" data-field-blur-pin-list></div>
            <p class="field-blur-guide" data-field-blur-guide>
              <span>Double-click/tap canvas: add pin</span>
              <span>Drag pin: move</span>
              <span>Triple-click/tap pin: remove</span>
            </p>
          </section>
          <section class="layer-effects-section" aria-label="Radial blur" data-layer-effects-editor="radial-blur" hidden>
            <div class="layer-effects-mode-toggle" role="group" aria-label="Radial blur mode">
              <button class="layer-effects-mode-button active" type="button" data-layer-radial-mode-button="spin">Spin</button>
              <button class="layer-effects-mode-button" type="button" data-layer-radial-mode-button="zoom">Zoom</button>
            </div>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Amount</span>
              <output class="layer-effects-value" data-layer-radial-amount-value>0</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="200" step="1" value="0" aria-label="Radial blur amount" data-layer-radial-amount-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Center X</span>
              <output class="layer-effects-value" data-layer-radial-center-x-value>50%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="50" aria-label="Radial blur center X" data-layer-radial-center-x-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Center Y</span>
              <output class="layer-effects-value" data-layer-radial-center-y-value>50%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="50" aria-label="Radial blur center Y" data-layer-radial-center-y-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset radial blur" data-layer-radial-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Grain" data-layer-effects-editor="grain" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Amount</span>
              <output class="layer-effects-value" data-layer-grain-amount-value>0%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="0" aria-label="Grain amount" data-layer-grain-amount-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Scale</span>
              <output class="layer-effects-value" data-layer-grain-scale-value>42%</output>
            </div>
            <input class="layer-effects-range" type="range" min="1" max="100" step="1" value="42" aria-label="Grain scale" data-layer-grain-scale-input />
            <label class="layer-effects-check-row">
              <span class="layer-effects-label">Monochrome</span>
              <input class="layer-effects-check" type="checkbox" checked data-layer-grain-monochrome-input />
            </label>
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset grain" data-layer-grain-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Noise" data-layer-effects-editor="noise" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Amount</span>
              <output class="layer-effects-value" data-layer-noise-amount-value>0%</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="0" aria-label="Noise amount" data-layer-noise-amount-input />
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Scale</span>
              <output class="layer-effects-value" data-layer-noise-scale-value>1%</output>
            </div>
            <input class="layer-effects-range" type="range" min="1" max="100" step="1" value="1" aria-label="Noise scale" data-layer-noise-scale-input />
            <label class="layer-effects-check-row">
              <span class="layer-effects-label">Monochrome</span>
              <input class="layer-effects-check" type="checkbox" checked data-layer-noise-monochrome-input />
            </label>
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset noise" data-layer-noise-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          <section class="layer-effects-section" aria-label="Threshold" data-layer-effects-editor="threshold" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Level</span>
              <output class="layer-effects-value" data-layer-threshold-value>128</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="255" step="1" value="128" aria-label="Threshold level" data-layer-threshold-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset threshold" data-layer-threshold-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          ${getEffectEditorsMarkup()}
        </div>
      </div>
    `;

    const editorPage = document.querySelector(".editor-page");
    const toolbarDock = document.querySelector(".toolbar-dock");
    const mainToolsToolbar = toolbarDock?.querySelector("[data-main-tools-toolbar]") ||
      toolbarDock?.querySelector(".bottom-toolbar:not(.history-toolbar)");
    let mobileLayerEffectsToolbar = toolbarDock?.querySelector("[data-mobile-layer-effects-toolbar]");
    let mobileLayerEffectsPanel = document.querySelector("[data-mobile-layer-effects-panel]");

    mainToolsToolbar?.classList.add("main-tools-toolbar");
    mainToolsToolbar?.setAttribute("data-main-tools-toolbar", "");

    if (toolbarDock && !mobileLayerEffectsToolbar) {
      const template = document.createElement("template");

      template.innerHTML = getMobileLayerEffectsToolbarMarkup().trim();
      mobileLayerEffectsToolbar = template.content.firstElementChild;
      toolbarDock.insertBefore(mobileLayerEffectsToolbar, toolbarDock.querySelector(".history-toolbar"));
    }

    if (editorPage && !mobileLayerEffectsPanel) {
      const template = document.createElement("template");

      template.innerHTML = getMobileLayerEffectsPanelMarkup().trim();
      mobileLayerEffectsPanel = template.content.firstElementChild;
      editorPage.appendChild(mobileLayerEffectsPanel);
    }

    const title = panel.querySelector("[data-layer-effects-title]");
    const targetName = panel.querySelector("[data-layer-effects-target]");
    const pickerTargetName = panel.querySelector("[data-layer-effects-picker-target]");
    const picker = panel.querySelector("[data-layer-effects-picker]");
    const detail = panel.querySelector("[data-layer-effects-detail]");
    const menu = panel.querySelector("[data-layer-effects-menu]");
    const searchInput = panel.querySelector("[data-layer-effects-search]");
    const effectEditors = panel.querySelectorAll("[data-layer-effects-editor]");
    const backButton = panel.querySelector("[data-layer-effects-back]");
    const colorOverlayInput = panel.querySelector("[data-layer-color-overlay-input]");
    const colorOverlaySwatch = panel.querySelector("[data-layer-color-overlay-swatch]");
    const colorOverlayHex = panel.querySelector("[data-layer-color-overlay-hex]");
    const colorOverlayOpacityInput = panel.querySelector("[data-layer-color-overlay-opacity-input]");
    const colorOverlayOpacityValue = panel.querySelector("[data-layer-color-overlay-opacity-value]");
    const strokeSizeInput = panel.querySelector("[data-layer-stroke-size-input]");
    const strokeSizeValue = panel.querySelector("[data-layer-stroke-size-value]");
    const strokeColorInput = panel.querySelector("[data-layer-stroke-color-input]");
    const strokeSwatch = panel.querySelector("[data-layer-stroke-swatch]");
    const strokeHex = panel.querySelector("[data-layer-stroke-hex]");
    const strokeOpacityInput = panel.querySelector("[data-layer-stroke-opacity-input]");
    const strokeOpacityValue = panel.querySelector("[data-layer-stroke-opacity-value]");
    const blurInput = panel.querySelector("[data-layer-blur-input]");
    const blurValue = panel.querySelector("[data-layer-blur-value]");
    const motionDistanceInput = panel.querySelector("[data-layer-motion-distance-input]");
    const motionDistanceValue = panel.querySelector("[data-layer-motion-distance-value]");
    const motionAngleInput = panel.querySelector("[data-layer-motion-angle-input]");
    const motionAngleValue = panel.querySelector("[data-layer-motion-angle-value]");
    const fieldBlurPinList = panel.querySelector("[data-field-blur-pin-list]");
    const radialAmountInput = panel.querySelector("[data-layer-radial-amount-input]");
    const radialAmountValue = panel.querySelector("[data-layer-radial-amount-value]");
    const radialCenterXInput = panel.querySelector("[data-layer-radial-center-x-input]");
    const radialCenterXValue = panel.querySelector("[data-layer-radial-center-x-value]");
    const radialCenterYInput = panel.querySelector("[data-layer-radial-center-y-input]");
    const radialCenterYValue = panel.querySelector("[data-layer-radial-center-y-value]");
    const radialModeButtons = panel.querySelectorAll("[data-layer-radial-mode-button]");
    const grainAmountInput = panel.querySelector("[data-layer-grain-amount-input]");
    const grainAmountValue = panel.querySelector("[data-layer-grain-amount-value]");
    const grainScaleInput = panel.querySelector("[data-layer-grain-scale-input]");
    const grainScaleValue = panel.querySelector("[data-layer-grain-scale-value]");
    const grainMonochromeInput = panel.querySelector("[data-layer-grain-monochrome-input]");
    const noiseAmountInput = panel.querySelector("[data-layer-noise-amount-input]");
    const noiseAmountValue = panel.querySelector("[data-layer-noise-amount-value]");
    const noiseScaleInput = panel.querySelector("[data-layer-noise-scale-input]");
    const noiseScaleValue = panel.querySelector("[data-layer-noise-scale-value]");
    const noiseMonochromeInput = panel.querySelector("[data-layer-noise-monochrome-input]");
    const thresholdInput = panel.querySelector("[data-layer-threshold-input]");
    const thresholdValue = panel.querySelector("[data-layer-threshold-value]");
    const curvesGraph = panel.querySelector("[data-curves-graph]");
    const curvesSvg = panel.querySelector("[data-curves-svg]");
    const curvesLine = panel.querySelector("[data-curves-line]");
    const curvesPointsGroup = panel.querySelector("[data-curves-points]");
    const curvesChannelButtons = panel.querySelectorAll("[data-curves-channel]");
    const curvesOverlayPaths = panel.querySelectorAll("[data-curves-overlay]");
    const curvesInput = panel.querySelector("[data-curves-input]");
    const curvesOutput = panel.querySelector("[data-curves-output]");
    const curvesResetChannelButton = panel.querySelector("[data-curves-reset-channel]");
    const curvesResetAllButton = panel.querySelector("[data-curves-reset-all]");
    const acceptButton = panel.querySelector("[data-layer-effects-accept]");
    const colorOverlayResetButton = panel.querySelector("[data-layer-color-overlay-reset]");
    const strokeResetButton = panel.querySelector("[data-layer-stroke-reset]");
    const resetButton = panel.querySelector("[data-layer-blur-reset]");
    const motionResetButton = panel.querySelector("[data-layer-motion-reset]");
    const radialResetButton = panel.querySelector("[data-layer-radial-reset]");
    const grainResetButton = panel.querySelector("[data-layer-grain-reset]");
    const noiseResetButton = panel.querySelector("[data-layer-noise-reset]");
    const thresholdResetButton = panel.querySelector("[data-layer-threshold-reset]");
    const closeButton = panel.querySelector("[data-layer-effects-close]");
    const panelCloseButton = panel.querySelector("[data-layer-effects-panel-close]");
    const mobileLayerEffectsBackButton = mobileLayerEffectsToolbar?.querySelector("[data-mobile-layer-effects-back]");
    const mobileLayerEffectButtons = mobileLayerEffectsToolbar?.querySelectorAll("[data-mobile-layer-effect-trigger]") || [];
    const mobileLayerEffectSections = mobileLayerEffectsPanel?.querySelectorAll("[data-mobile-layer-effects-editor]") || [];
    const mobileLayerEffectInputs = mobileLayerEffectsPanel?.querySelectorAll("[data-mobile-layer-effect-input]") || [];
    const mobileLayerEffectValues = mobileLayerEffectsPanel?.querySelectorAll("[data-mobile-layer-effect-value]") || [];
    const mobileLayerEffectResets = mobileLayerEffectsPanel?.querySelectorAll("[data-mobile-layer-effect-reset]") || [];
    const mobileRadialModeButtons = mobileLayerEffectsPanel?.querySelectorAll("[data-mobile-radial-mode]") || [];
    const mobileGrainMonochromeButton = mobileLayerEffectsPanel?.querySelector("[data-mobile-grain-monochrome]");
    const mobileNoiseMonochromeButton = mobileLayerEffectsPanel?.querySelector("[data-mobile-noise-monochrome]");
    let activeEffectType = "";
    let activeMobileEffectType = "";
    let fieldBlurDrag = null;
    let fieldBlurPointerTap = null;
    let fieldBlurTapSequence = null;
    let fieldBlurTapTimer = 0;
    let activeFieldBlurPinId = "";
    let activeCurvesChannel = "rgb";
    let activeCurvesPointId = "black";
    let curvesDrag = null;
    let fieldBlurOverlay = null;
    let fieldBlurPinIdSequence = 0;
    let fieldBlurPreviewTimer = 0;
    let fieldBlurPins = [];
    let mobileLayerEffectsSession = null;
    let pendingLayerEffectPreview = null;
    let pendingLayerEffectPreviewFrame = 0;
    let previewSession = null;
    let activeDesktopButton = button;

    document.body.append(panel);

    function setRadialModeButtonState(mode) {
      const nextMode = normalizeRadialBlurMode(mode);

      radialModeButtons.forEach((modeButton) => {
        const isActive = modeButton.dataset.layerRadialModeButton === nextMode;

        modeButton.classList.toggle("active", isActive);
        modeButton.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function getSelectedRadialMode() {
      const activeModeButton = Array.from(radialModeButtons)
        .find((modeButton) => modeButton.classList.contains("active"));

      return normalizeRadialBlurMode(activeModeButton?.dataset.layerRadialModeButton);
    }

    function getCurvesChannelColor(channel) {
      return {
        b: "#7aa6ff",
        g: "#80d690",
        r: "#ff7f7f",
        rgb: "#f6f7fb",
      }[channel] || "#f6f7fb";
    }

    function getCurvesPoints(layer = getActiveLayer()) {
      return normalizeCurvesPoints(getCurves(layer).points);
    }

    function getCurvesChannelPoints(pointsByChannel, channel = activeCurvesChannel) {
      return normalizeCurvesPoints(pointsByChannel)[channel] || createDefaultCurvesPoints()[channel];
    }

    function getActiveCurvesPoint(points) {
      const normalized = getCurvesEngine()?.normalizePoints?.(points) || points || [];

      return normalized.find((point) => point.id === activeCurvesPointId) || normalized[0] || null;
    }

    function getCurvesGraphRect() {
      const rect = curvesSvg?.getBoundingClientRect?.() || curvesGraph?.getBoundingClientRect?.();

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return rect;
    }

    function screenToCurvesPoint(clientX, clientY) {
      const rect = getCurvesGraphRect();

      if (!rect) {
        return { x: 0, y: 0 };
      }

      return {
        x: clamp(((clientX - rect.left) / rect.width) * 255, 0, 255),
        y: clamp((1 - (clientY - rect.top) / rect.height) * 255, 0, 255),
      };
    }

    function getCurvesPointScreenPosition(point) {
      const rect = getCurvesGraphRect();
      const width = Math.max(1, rect?.width || 1);
      const height = Math.max(1, rect?.height || 1);

      return {
        x: (point.x / 255) * width,
        y: (1 - point.y / 255) * height,
      };
    }

    function findCurvesPointNearEvent(event, points) {
      const rect = getCurvesGraphRect();

      if (!rect) {
        return null;
      }

      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const hitRadius = 12;

      return points.find((point) => {
        const screen = getCurvesPointScreenPosition(point);

        return Math.hypot(screen.x - px, screen.y - py) <= hitRadius;
      }) || null;
    }

    function setCurvesChannel(channel) {
      const nextChannel = ["rgb", "r", "g", "b"].includes(channel) ? channel : "rgb";

      activeCurvesChannel = nextChannel;
      activeCurvesPointId = getCurvesChannelPoints(getCurvesPoints(), nextChannel)[0]?.id || "black";
      renderCurvesEditor();
    }

    function setActiveCurvesPoint(pointId) {
      activeCurvesPointId = pointId || activeCurvesPointId;
      renderCurvesEditor();
    }

    function updateCurvesPointControls(point, isEnabled) {
      const enabled = Boolean(isEnabled && point);

      if (curvesInput) {
        curvesInput.disabled = !enabled;
        curvesInput.value = point ? String(Math.round(point.x)) : "0";
      }

      if (curvesOutput) {
        curvesOutput.disabled = !enabled;
        curvesOutput.value = point ? String(Math.round(point.y)) : "0";
      }
    }

    function renderCurvesEditor() {
      if (activeEffectType !== "curves" || !curvesLine || !curvesPointsGroup) {
        return;
      }

      const layer = getActiveLayer();
      const isEligible = isBlurEligibleLayer(layer);
      const pointsByChannel = isEligible ? getCurvesPoints(layer) : createDefaultCurvesPoints();
      const engine = getCurvesEngine();
      const activePoints = getCurvesChannelPoints(pointsByChannel);
      const activePoint = getActiveCurvesPoint(activePoints);

      if (activePoint && activePoint.id !== activeCurvesPointId) {
        activeCurvesPointId = activePoint.id;
      }

      curvesChannelButtons.forEach((button) => {
        const isActive = button.dataset.curvesChannel === activeCurvesChannel;

        button.disabled = !isEligible;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      curvesOverlayPaths.forEach((path) => {
        const channel = path.dataset.curvesOverlay;
        const channelPoints = getCurvesChannelPoints(pointsByChannel, channel);

        path.hidden = channel === activeCurvesChannel;
        path.setAttribute("d", engine?.buildSvgPath?.(channelPoints) || "");
        path.style.stroke = getCurvesChannelColor(channel);
      });

      curvesLine.setAttribute("d", engine?.buildSvgPath?.(activePoints) || "");
      curvesLine.style.stroke = getCurvesChannelColor(activeCurvesChannel);
      curvesPointsGroup.innerHTML = activePoints.map((point) => {
        const isActive = point.id === activeCurvesPointId;

        return `
          <circle
            class="curves-point${isActive ? " active" : ""}${point.endpoint ? " endpoint" : ""}"
            cx="${point.x}"
            cy="${255 - point.y}"
            r="${isActive ? 5.6 : 4.6}"
            data-curves-point="${point.id}"
            vector-effect="non-scaling-stroke"
          />
        `;
      }).join("");

      updateCurvesPointControls(activePoint, isEligible);

      if (curvesResetChannelButton) {
        curvesResetChannelButton.disabled = !isEligible || !hasMeaningfulCurves({
          ...createDefaultCurvesPoints(),
          [activeCurvesChannel]: activePoints,
        });
      }

      if (curvesResetAllButton) {
        curvesResetAllButton.disabled = !isEligible || !hasMeaningfulCurves(pointsByChannel);
      }
    }

    function applyCurvesPoints(pointsByChannel, options = {}) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return false;
      }

      const normalized = normalizeCurvesPoints(pointsByChannel);
      const didUpdate = namespace.setLayerCurves?.(layer.id, normalized, {
        history: false,
        source: options.source || "layer-effects-preview",
      }) === true;

      renderCurvesEditor();
      return didUpdate;
    }

    function updateActiveCurvesChannelPoints(update) {
      const pointsByChannel = getCurvesPoints();
      const currentPoints = getCurvesChannelPoints(pointsByChannel);
      const nextPoints = typeof update === "function" ? update(currentPoints) : currentPoints;

      return applyCurvesPoints({
        ...pointsByChannel,
        [activeCurvesChannel]: nextPoints,
      });
    }

    function moveActiveCurvesPoint(x, y) {
      const engine = getCurvesEngine();

      if (!engine?.movePoint) {
        return;
      }

      updateActiveCurvesChannelPoints((points) =>
        engine.movePoint(points, activeCurvesPointId, x, y),
      );
    }

    function resetCurvesChannel(channel = activeCurvesChannel) {
      const pointsByChannel = getCurvesPoints();

      activeCurvesPointId = "black";
      applyCurvesPoints({
        ...pointsByChannel,
        [channel]: getCurvesEngine()?.identityPoints?.() || createDefaultCurvesPoints()[channel],
      });
    }

    function resetAllCurves() {
      activeCurvesPointId = "black";
      applyCurvesPoints(createDefaultCurvesPoints(), {
        source: "layer-effects-preview",
      });
    }

    function commitCurvesNumberInput() {
      const x = Number(curvesInput?.value);
      const y = Number(curvesOutput?.value);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        renderCurvesEditor();
        return;
      }

      moveActiveCurvesPoint(x, y);
    }

    function deleteActiveCurvesPoint() {
      const engine = getCurvesEngine();

      if (!engine?.deletePoint || !activeCurvesPointId) {
        return;
      }

      updateActiveCurvesChannelPoints((points) => {
        const nextPoints = engine.deletePoint(points, activeCurvesPointId);

        activeCurvesPointId = nextPoints[0]?.id || "black";
        return nextPoints;
      });
    }

    function getLayerModel() {
      return namespace.documentLayerModel;
    }

    function getActiveLayer() {
      const layerModel = getLayerModel();

      return layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
    }

    function cancelPendingLayerEffectPreviewFrame() {
      if (!pendingLayerEffectPreviewFrame) {
        return;
      }

      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(pendingLayerEffectPreviewFrame);
      } else if (typeof window.clearTimeout === "function") {
        window.clearTimeout(pendingLayerEffectPreviewFrame);
      }

      pendingLayerEffectPreviewFrame = 0;
    }

    function flushPendingLayerEffectPreview() {
      const pending = pendingLayerEffectPreview;

      if (!pending) {
        cancelPendingLayerEffectPreviewFrame();
        return false;
      }

      cancelPendingLayerEffectPreviewFrame();
      pendingLayerEffectPreview = null;

      return pending.apply?.() === true;
    }

    function cancelPendingLayerEffectPreview() {
      if (!pendingLayerEffectPreview) {
        cancelPendingLayerEffectPreviewFrame();
        return false;
      }

      cancelPendingLayerEffectPreviewFrame();
      pendingLayerEffectPreview = null;
      return true;
    }

    function queueLayerEffectPreview(effect, layerId, apply) {
      pendingLayerEffectPreview = {
        apply,
        effect,
        layerId,
      };

      if (pendingLayerEffectPreviewFrame) {
        return true;
      }

      const flush = () => {
        pendingLayerEffectPreviewFrame = 0;
        flushPendingLayerEffectPreview();
      };

      if (typeof window.requestAnimationFrame === "function") {
        pendingLayerEffectPreviewFrame = window.requestAnimationFrame(flush);
      } else if (typeof window.setTimeout === "function") {
        pendingLayerEffectPreviewFrame = window.setTimeout(flush, 16);
      } else {
        flush();
      }

      return true;
    }

    function getDefaultFieldBlurPoint() {
      return getLayerEffectCenterPoint(getActiveLayer());
    }

    function isMobileLayerEffectsViewport() {
      return window.matchMedia?.("(max-width: 900px)")?.matches === true;
    }

    function getMobileLayerEffectInput(name) {
      return mobileLayerEffectsPanel?.querySelector(`[data-mobile-layer-effect-input="${name}"]`) || null;
    }

    function getMobileLayerEffectValue(name) {
      return mobileLayerEffectsPanel?.querySelector(`[data-mobile-layer-effect-value="${name}"]`) || null;
    }

    function getMobileLayerEffectSuffix(name) {
      const suffixByName = {
        "field-blur": "px",
        "gaussian-radius": "px",
        "grain-amount": "%",
        "grain-scale": "%",
        "motion-distance": "px",
        "noise-amount": "%",
        "noise-scale": "%",
        "radial-center-x": "%",
        "radial-center-y": "%",
      };

      return suffixByName[name] || "";
    }

    function updateMobileLayerEffectRangeProgress(input) {
      if (!input) {
        return;
      }

      const min = Number(input.min) || 0;
      const max = Number(input.max) || 100;
      const value = clamp(input.value, min, max);
      const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

      input.style.setProperty("--mobile-layer-effect-range-progress", `${progress}%`);
    }

    function setMobileLayerEffectControl(name, value) {
      const input = getMobileLayerEffectInput(name);
      const output = getMobileLayerEffectValue(name);
      const nextValue = Math.round(Number(value) || 0);
      const suffix = getMobileLayerEffectSuffix(name);

      if (input && document.activeElement !== input) {
        input.value = String(nextValue);
      }

      if (output) {
        output.textContent = `${nextValue}${suffix}`;
      }

      updateMobileLayerEffectRangeProgress(input);
    }

    function setMobileRadialModeButtonState(mode) {
      const nextMode = normalizeRadialBlurMode(mode);

      mobileRadialModeButtons.forEach((modeButton) => {
        const isActive = modeButton.dataset.mobileRadialMode === nextMode;

        modeButton.classList.toggle("active", isActive);
        modeButton.setAttribute("aria-pressed", String(isActive));
      });
    }

    function getSelectedMobileRadialMode() {
      const activeModeButton = Array.from(mobileRadialModeButtons)
        .find((modeButton) => modeButton.classList.contains("active"));

      return normalizeRadialBlurMode(activeModeButton?.dataset.mobileRadialMode);
    }

    function setMobileGrainMonochromeState(isMonochrome) {
      if (!mobileGrainMonochromeButton) {
        return;
      }

      mobileGrainMonochromeButton.classList.toggle("active", isMonochrome);
      mobileGrainMonochromeButton.setAttribute("aria-pressed", String(isMonochrome));
    }

    function isMobileGrainMonochromeEnabled() {
      return mobileGrainMonochromeButton?.getAttribute("aria-pressed") !== "false";
    }

    function setMobileNoiseMonochromeState(isMonochrome) {
      if (!mobileNoiseMonochromeButton) {
        return;
      }

      mobileNoiseMonochromeButton.classList.toggle("active", isMonochrome);
      mobileNoiseMonochromeButton.setAttribute("aria-pressed", String(isMonochrome));
    }

    function isMobileNoiseMonochromeEnabled() {
      return mobileNoiseMonochromeButton?.getAttribute("aria-pressed") !== "false";
    }

    function closeMobileLayerEffectsPanel() {
      if (activeMobileEffectType === "field-blur") {
        deactivateFieldBlurUi();
        activeEffectType = "";
      }

      activeMobileEffectType = "";

      if (mobileLayerEffectsPanel) {
        mobileLayerEffectsPanel.hidden = true;
        delete mobileLayerEffectsPanel.dataset.activeEffect;
      }

      mobileLayerEffectSections.forEach((section) => {
        section.hidden = true;
      });

      mobileLayerEffectButtons.forEach((effectButton) => {
        effectButton.classList.remove("active");
        effectButton.setAttribute("aria-pressed", "false");
      });
    }

    function showMobileLayerEffectsToolbar(isVisible) {
      if (!mobileLayerEffectsToolbar || !toolbarDock) {
        return;
      }

      const shouldShow = Boolean(isVisible);

      mobileLayerEffectsToolbar.hidden = !shouldShow;
      toolbarDock.classList.toggle("mobile-layer-effects-active", shouldShow);

      if (!shouldShow) {
        finalizeMobileLayerEffectsSession();
        closeMobileLayerEffectsPanel();
      }
    }

    function activateMainSelectionTool(source = "mobile-layer-effects-back") {
      const selectionButton = mainToolsToolbar?.querySelector('[data-tool][data-toolset-primary="selection"], [data-tool][data-tool-mode="selection"]') ||
        toolbarDock?.querySelector('[data-tool][data-toolset-primary="selection"], [data-tool][data-tool-mode="selection"]');

      if (selectionButton) {
        selectionButton.click();
        return;
      }

      window.dispatchEvent(new CustomEvent("cbo:tool-change", {
        detail: {
          label: "SELECTION",
          source,
          toolMode: "selection",
        },
      }));
    }

    function returnFromMobileLayerEffectsToolbar() {
      showMobileLayerEffectsToolbar(false);
      activateMainSelectionTool("mobile-layer-effects-back");
    }

    function getMobileFieldBlurPins(layer, blur) {
      const nextBlur = clamp(blur, 0, MAX_FIELD_BLUR_RADIUS);
      const currentPins = getFieldBlur(layer).pins;

      if (nextBlur <= 0) {
        return [];
      }

      if (currentPins.length > 0) {
        return currentPins.map((pin) => ({
          ...pin,
          blur: nextBlur,
        }));
      }

      const point = getLayerEffectCenterPoint(layer);

      return [{
        blur: nextBlur,
        id: "mobile-field-blur-pin",
        x: point.x,
        y: point.y,
      }];
    }

    function getMobileLayerEffectsHistoryGroup(layerId) {
      return `mobile-layer-effects-${layerId}`;
    }

    function startMobileLayerEffectsSession() {
      const layerModel = getLayerModel();
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer) || !layerModel) {
        return null;
      }

      if (mobileLayerEffectsSession?.layerId === layer.id) {
        return mobileLayerEffectsSession;
      }

      if (mobileLayerEffectsSession?.layerId && mobileLayerEffectsSession.layerId !== layer.id) {
        finalizeMobileLayerEffectsSession();
      }

      mobileLayerEffectsSession = {
        beforeState: namespace.documentHistory?.getLayerSnapshot?.(layerModel) ||
          getLayerStateSnapshot(layerModel),
        layerId: layer.id,
      };

      return mobileLayerEffectsSession;
    }

    function recordMobileLayerEffectsMetadata(session) {
      const layerModel = getLayerModel();
      const history = namespace.documentHistory;

      if (!session?.beforeState || !layerModel || !history?.recordLayerStateChange) {
        return false;
      }

      const didRecord = history.recordLayerStateChange(layerModel, session.beforeState, {
        historyGroup: getMobileLayerEffectsHistoryGroup(session.layerId),
        source: "mobile-layer-effects-finalize",
      });

      if (didRecord) {
        history.flushLayerState?.(layerModel);
      }

      return didRecord;
    }

    function flushMobileFieldBlurPins() {
      if (activeMobileEffectType !== "field-blur" && activeEffectType !== "field-blur") {
        return false;
      }

      const layerModel = getLayerModel();
      const layer = mobileLayerEffectsSession?.layerId
        ? layerModel?.findEntryById?.(mobileLayerEffectsSession.layerId)
        : getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        return false;
      }

      clearFieldBlurPreviewTimer();

      return namespace.setLayerFieldBlurPins(layer.id, normalizeFieldBlurPins(fieldBlurPins), {
        history: false,
        source: "mobile-layer-effects-field-blur-preview",
      });
    }

    function finalizeMobileLayerEffectsSession() {
      const session = mobileLayerEffectsSession;

      if (!session) {
        return false;
      }

      flushPendingLayerEffectPreview();
      flushMobileFieldBlurPins();

      const layerModel = getLayerModel();
      const layer = layerModel?.findEntryById?.(session.layerId) || null;
      const shouldRasterize = namespace.hasRasterizableLayerEffects?.(layer) === true;

      mobileLayerEffectsSession = null;

      if (!layer) {
        return false;
      }

      if (shouldRasterize && namespace.rasterizeLayerEffects?.(session.layerId, {
        beforeState: session.beforeState,
      }) === true) {
        return true;
      }

      return recordMobileLayerEffectsMetadata(session);
    }

    function syncMobileLayerEffectsControls() {
      const layer = getActiveLayer();
      const isEligible = isBlurEligibleLayer(layer);
      const radius = isEligible ? getGaussianBlurRadius(layer) : 0;
      const motionBlur = isEligible ? getMotionBlur(layer) : { angle: 0, distance: 0 };
      const fieldBlur = isEligible ? getFieldBlur(layer) : { pins: [] };
      const activeFieldBlurPin = activeMobileEffectType === "field-blur"
        ? fieldBlurPins.find((pin) => pin.id === activeFieldBlurPinId) || fieldBlurPins[0] || null
        : null;
      const fieldBlurAmount = activeFieldBlurPin
        ? activeFieldBlurPin.blur
        : (fieldBlur.pins.length
          ? Math.max(...fieldBlur.pins.map((pin) => clamp(pin.blur, 0, MAX_FIELD_BLUR_RADIUS)))
          : 0);
      const radialBlur = isEligible
        ? getRadialBlur(layer, { defaultToLayerCenter: activeMobileEffectType === "radial-blur" })
        : { amount: 0, centerX: 50, centerY: 50, mode: "spin" };
      const grain = isEligible
        ? getGrain(layer)
        : { amount: 0, scale: DEFAULT_GRAIN_SCALE, monochrome: true };
      const noise = isEligible
        ? getNoise(layer)
        : { amount: 0, scale: DEFAULT_NOISE_SCALE, monochrome: true };
      const threshold = isEligible
        ? getThreshold(layer)
        : { enabled: false, threshold: DEFAULT_THRESHOLD_VALUE };

      mobileLayerEffectButtons.forEach((effectButton) => {
        const isActive = effectButton.dataset.mobileLayerEffectTrigger === activeMobileEffectType;

        effectButton.disabled = !isEligible;
        effectButton.classList.toggle("active", isActive);
        effectButton.setAttribute("aria-pressed", String(isActive));
      });

      mobileLayerEffectInputs.forEach((input) => {
        input.disabled = !isEligible;
        updateMobileLayerEffectRangeProgress(input);
      });

      mobileLayerEffectResets.forEach((reset) => {
        reset.disabled = !isEligible;
      });

      mobileRadialModeButtons.forEach((modeButton) => {
        modeButton.disabled = !isEligible;
      });

      if (mobileGrainMonochromeButton) {
        mobileGrainMonochromeButton.disabled = !isEligible;
      }

      if (mobileNoiseMonochromeButton) {
        mobileNoiseMonochromeButton.disabled = !isEligible;
      }

      setMobileLayerEffectControl("gaussian-radius", radius);
      setMobileLayerEffectControl("motion-distance", motionBlur.distance);
      setMobileLayerEffectControl("motion-angle", getDisplayAngle(motionBlur.angle));
      setMobileLayerEffectControl("field-blur", fieldBlurAmount);
      setMobileLayerEffectControl("radial-amount", radialBlur.amount);
      setMobileLayerEffectControl("radial-center-x", radialBlur.centerX);
      setMobileLayerEffectControl("radial-center-y", radialBlur.centerY);
      setMobileRadialModeButtonState(radialBlur.mode);
      setMobileLayerEffectControl("grain-amount", grain.amount);
      setMobileLayerEffectControl("grain-scale", grain.scale);
      setMobileGrainMonochromeState(grain.monochrome);
      setMobileLayerEffectControl("noise-amount", noise.amount);
      setMobileLayerEffectControl("noise-scale", noise.scale);
      setMobileNoiseMonochromeState(noise.monochrome);
      setMobileLayerEffectControl("threshold-level", threshold.threshold);

      mobileLayerEffectsPanel?.classList.toggle("disabled", !isEligible);
    }

    function openMobileLayerEffectPanel(effectType) {
      const definition = getEffectDefinition(effectType);

      if (!definition?.implemented || !isBlurEligibleLayer(getActiveLayer())) {
        syncMobileLayerEffectsControls();
        return;
      }

      startMobileLayerEffectsSession();

      const isAlreadyOpen = !mobileLayerEffectsPanel?.hidden && activeMobileEffectType === effectType;

      if (isAlreadyOpen) {
        closeMobileLayerEffectsPanel();
        return;
      }

      if (activeMobileEffectType === "field-blur" && effectType !== "field-blur") {
        flushMobileFieldBlurPins();
        deactivateFieldBlurUi();
        activeEffectType = "";
      }

      activeMobileEffectType = effectType;

      if (mobileLayerEffectsPanel) {
        mobileLayerEffectsPanel.hidden = false;
        mobileLayerEffectsPanel.dataset.activeEffect = effectType;
      }

      mobileLayerEffectSections.forEach((section) => {
        section.hidden = section.dataset.mobileLayerEffectsEditor !== effectType;
      });

      if (effectType === "field-blur") {
        activeEffectType = "field-blur";
        activateFieldBlurUi();
      }

      syncMobileLayerEffectsControls();
    }

    function applyMobileLayerEffectValue(name, value) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncMobileLayerEffectsControls();
        return;
      }

      startMobileLayerEffectsSession();

      if (name === "gaussian-radius") {
        const nextValue = clamp(value, 0, MAX_GAUSSIAN_BLUR_RADIUS);

        queueLayerEffectPreview(
          "gaussian-blur",
          layer.id,
          () => namespace.setLayerGaussianBlurRadius(layer.id, nextValue, {
            history: false,
            source: "mobile-layer-effects-gaussian-blur",
          }),
          {
            control: name,
            radius: nextValue,
            source: "mobile",
          },
        );
      } else if (name === "motion-distance" || name === "motion-angle") {
        const nextDistance = clamp(getMobileLayerEffectInput("motion-distance")?.value, 0, MAX_MOTION_BLUR_DISTANCE);
        const nextAngle = normalizeAngle(getMobileLayerEffectInput("motion-angle")?.value);

        queueLayerEffectPreview(
          "motion-blur",
          layer.id,
          () => namespace.setLayerMotionBlur(
            layer.id,
            nextDistance,
            nextAngle,
            {
              history: false,
              source: "mobile-layer-effects-motion-blur",
            },
          ),
          {
            angle: nextAngle,
            control: name,
            distance: nextDistance,
            source: "mobile",
          },
        );
      } else if (name === "field-blur") {
        if (activeMobileEffectType === "field-blur") {
          ensureFieldBlurPins();

          const pinId = activeFieldBlurPinId || fieldBlurPins[0]?.id || "";

          if (pinId) {
            setFieldBlurPinBlur(pinId, value, { flush: true });
            syncMobileLayerEffectsControls();
            return;
          }
        }

        const nextPins = getMobileFieldBlurPins(layer, value);

        queueLayerEffectPreview(
          "field-blur",
          layer.id,
          () => namespace.setLayerFieldBlurPins(
            layer.id,
            nextPins,
            {
              history: false,
              source: "mobile-layer-effects-field-blur",
            },
          ),
          {
            control: name,
            pinCount: nextPins.length,
            source: "mobile",
          },
        );
      } else if (name === "radial-amount" || name === "radial-center-x" || name === "radial-center-y") {
        const nextAmount = clamp(getMobileLayerEffectInput("radial-amount")?.value, 0, MAX_RADIAL_BLUR_AMOUNT);
        const nextCenterX = normalizePercent(getMobileLayerEffectInput("radial-center-x")?.value);
        const nextCenterY = normalizePercent(getMobileLayerEffectInput("radial-center-y")?.value);
        const nextMode = getSelectedMobileRadialMode();

        queueLayerEffectPreview(
          "radial-blur",
          layer.id,
          () => namespace.setLayerRadialBlur(
            layer.id,
            nextAmount,
            nextCenterX,
            nextCenterY,
            nextMode,
            {
              history: false,
              source: "mobile-layer-effects-radial-blur",
            },
          ),
          {
            amount: nextAmount,
            centerX: nextCenterX,
            centerY: nextCenterY,
            control: name,
            mode: nextMode,
            source: "mobile",
          },
        );
      } else if (name === "grain-amount" || name === "grain-scale") {
        const nextAmount = clamp(getMobileLayerEffectInput("grain-amount")?.value, 0, MAX_GRAIN_AMOUNT);
        const nextScale = clamp(getMobileLayerEffectInput("grain-scale")?.value, 1, MAX_GRAIN_SCALE);
        const nextMonochrome = isMobileGrainMonochromeEnabled();

        queueLayerEffectPreview(
          "grain",
          layer.id,
          () => namespace.setLayerGrain(
            layer.id,
            nextAmount,
            nextScale,
            nextMonochrome,
            {
              history: false,
              source: "mobile-layer-effects-grain",
            },
          ),
          {
            amount: nextAmount,
            control: name,
            monochrome: nextMonochrome,
            scale: nextScale,
            source: "mobile",
          },
        );
      } else if (name === "noise-amount" || name === "noise-scale") {
        const nextAmount = clamp(getMobileLayerEffectInput("noise-amount")?.value, 0, MAX_NOISE_AMOUNT);
        const nextScale = clamp(getMobileLayerEffectInput("noise-scale")?.value, 1, MAX_NOISE_SCALE);
        const nextMonochrome = isMobileNoiseMonochromeEnabled();

        queueLayerEffectPreview(
          "noise",
          layer.id,
          () => namespace.setLayerNoise(
            layer.id,
            nextAmount,
            nextScale,
            nextMonochrome,
            {
              history: false,
              source: "mobile-layer-effects-noise",
            },
          ),
          {
            amount: nextAmount,
            control: name,
            monochrome: nextMonochrome,
            scale: nextScale,
            source: "mobile",
          },
        );
      } else if (name === "threshold-level") {
        const nextThreshold = normalizeThresholdValue(value);

        queueLayerEffectPreview(
          "threshold",
          layer.id,
          () => namespace.setLayerThreshold(layer.id, nextThreshold, {
            history: false,
            source: "mobile-layer-effects-threshold",
          }),
          {
            control: name,
            source: "mobile",
            threshold: nextThreshold,
          },
        );
      }

      syncMobileLayerEffectsControls();
    }

    function resetMobileLayerEffect(effectType) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncMobileLayerEffectsControls();
        return;
      }

      startMobileLayerEffectsSession();
      cancelPendingLayerEffectPreview();

      if (effectType === "gaussian-blur") {
        namespace.setLayerGaussianBlurRadius(layer.id, 0, {
          history: false,
          source: "mobile-layer-effects-reset",
        });
      } else if (effectType === "motion-blur") {
        namespace.setLayerMotionBlur(layer.id, 0, getMobileLayerEffectInput("motion-angle")?.value, {
          history: false,
          source: "mobile-layer-effects-reset",
        });
      } else if (effectType === "field-blur") {
        namespace.setLayerFieldBlurPins(layer.id, [], {
          history: false,
          source: "mobile-layer-effects-reset",
        });
      } else if (effectType === "radial-blur") {
        namespace.setLayerRadialBlur(
          layer.id,
          0,
          getMobileLayerEffectInput("radial-center-x")?.value,
          getMobileLayerEffectInput("radial-center-y")?.value,
          getSelectedMobileRadialMode(),
          {
            history: false,
            source: "mobile-layer-effects-reset",
          },
        );
      } else if (effectType === "grain") {
        namespace.setLayerGrain(layer.id, 0, DEFAULT_GRAIN_SCALE, true, {
          history: false,
          source: "mobile-layer-effects-reset",
        });
      } else if (effectType === "noise") {
        namespace.setLayerNoise(layer.id, 0, DEFAULT_NOISE_SCALE, true, {
          history: false,
          source: "mobile-layer-effects-reset",
        });
      } else if (effectType === "threshold") {
        namespace.setLayerThreshold(layer.id, DEFAULT_THRESHOLD_VALUE, {
          enabled: false,
          history: false,
          source: "mobile-layer-effects-reset",
        });
      }

      syncMobileLayerEffectsControls();
    }

    function createFieldBlurPin(point = getDefaultFieldBlurPoint(), blur = 0, id = "") {
      fieldBlurPinIdSequence += 1;
      const fallbackPoint = getDefaultFieldBlurPoint();

      return {
        blur: clamp(blur, 0, MAX_FIELD_BLUR_RADIUS),
        id: typeof id === "string" && id.trim() ? id : `field-blur-pin-${fieldBlurPinIdSequence}`,
        x: Number.isFinite(point?.x) ? point.x : fallbackPoint.x,
        y: Number.isFinite(point?.y) ? point.y : fallbackPoint.y,
      };
    }

    function syncFieldBlurPinsFromLayer(layer) {
      const fieldBlur = getFieldBlur(layer);

      if (fieldBlur.pins.length === 0) {
        return false;
      }

      fieldBlurPins = fieldBlur.pins.map((pin) =>
        createFieldBlurPin({ x: pin.x, y: pin.y }, pin.blur, pin.id),
      );
      activeFieldBlurPinId = fieldBlurPins[0]?.id || "";

      return true;
    }

    function clientToFieldBlurPoint(clientX, clientY) {
      const stage = document.querySelector(".editor-stage");
      const renderer = namespace.documentRenderer;
      const brushEngine = namespace.brushEngine;
      const brushPoint = brushEngine?.screenToDocumentSpace?.(clientX, clientY);
      const width = Math.max(1, Number(renderer?.width) || 4000);
      const height = Math.max(1, Number(renderer?.height) || 4000);

      if (brushPoint) {
        return {
          x: clamp(brushPoint.docX, 0, width),
          y: clamp(brushPoint.docY, 0, height),
        };
      }

      const rect = stage?.getBoundingClientRect?.();
      const x = rect ? clientX - rect.left : width * 0.5;
      const y = rect ? clientY - rect.top : height * 0.5;

      return {
        x: clamp(x, 0, width),
        y: clamp(y, 0, height),
      };
    }

    function documentToFieldBlurStagePoint(pin) {
      const brushEngine = namespace.brushEngine;
      const camera = brushEngine?.camera || { x: 0, y: 0, zoom: 1 };
      const dpr = Math.max(0.0001, Number(brushEngine?.dpr) || window.devicePixelRatio || 1);
      const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

      return {
        x: ((pin.x || 0) * zoom + (camera.x || 0)) / dpr,
        y: ((pin.y || 0) * zoom + (camera.y || 0)) / dpr,
      };
    }

    function ensureFieldBlurPins() {
      if (fieldBlurPins.length === 0) {
        if (syncFieldBlurPinsFromLayer(getActiveLayer())) {
          return;
        }

        const pin = createFieldBlurPin(getDefaultFieldBlurPoint(), 0);

        fieldBlurPins = [pin];
        activeFieldBlurPinId = pin.id;
      } else if (!fieldBlurPins.some((pin) => pin.id === activeFieldBlurPinId)) {
        activeFieldBlurPinId = fieldBlurPins[0]?.id || "";
      }
    }

    function renderFieldBlurPins() {
      if (!fieldBlurOverlay || activeEffectType !== "field-blur") {
        return;
      }

      fieldBlurOverlay.innerHTML = fieldBlurPins.map((pin) => {
        const point = documentToFieldBlurStagePoint(pin);
        const progress = clamp(pin.blur / MAX_FIELD_BLUR_RADIUS, 0, 1);
        const isActive = pin.id === activeFieldBlurPinId;

        return `
          <button
            class="field-blur-pin${isActive ? " active" : ""}"
            type="button"
            aria-label="Field blur pin"
            data-field-blur-pin="${pin.id}"
            style="left: ${point.x}px; top: ${point.y}px; --field-blur-degrees: ${Math.round(progress * 360)}deg;"
          >
            <span class="field-blur-pin-ring" aria-hidden="true"></span>
            <span class="field-blur-pin-core" aria-hidden="true"></span>
          </button>
        `;
      }).join("");
    }

    function renderFieldBlurPinControls() {
      if (!fieldBlurPinList) {
        return;
      }

      if (fieldBlurPins.length === 0) {
        fieldBlurPinList.innerHTML = "";
        return;
      }

      fieldBlurPinList.innerHTML = fieldBlurPins.map((pin, index) => `
        <div class="field-blur-pin-control${pin.id === activeFieldBlurPinId ? " active" : ""}" data-field-blur-pin-control="${pin.id}">
          <div class="field-blur-control-header">
            <span class="layer-effects-label">Pin ${index + 1}</span>
            <label class="field-blur-number brush-studio-setting-value">
              <input
                class="field-blur-number-input brush-studio-setting-value-input"
                type="number"
                min="0"
                max="${MAX_FIELD_BLUR_RADIUS}"
                step="1"
                value="${Math.round(pin.blur)}"
                inputmode="numeric"
                aria-label="Field blur pin ${index + 1} value"
                data-field-blur-pin-number="${pin.id}"
              />
              <span class="field-blur-number-unit brush-studio-setting-value-unit">px</span>
            </label>
          </div>
          <input
            class="layer-effects-range"
            type="range"
            min="0"
            max="${MAX_FIELD_BLUR_RADIUS}"
            step="1"
            value="${pin.blur}"
            aria-label="Field blur pin ${index + 1}"
            data-field-blur-pin-input="${pin.id}"
          />
        </div>
      `).join("");
    }

    function syncFieldBlurUi() {
      if (activeEffectType !== "field-blur") {
        return;
      }

      renderFieldBlurPins();
      renderFieldBlurPinControls();
    }

    function setActiveFieldBlurPin(pinId) {
      activeFieldBlurPinId = pinId;
      syncFieldBlurUi();
      syncMobileLayerEffectsControls();
    }

    function focusFieldBlurPinControl(pinId) {
      const pin = fieldBlurPins.find((candidate) => candidate.id === pinId);

      if (!pin) {
        return;
      }

      activeFieldBlurPinId = pinId;
      renderFieldBlurPins();
      updateFieldBlurPinControlValue(pinId, pin.blur);
    }

    function syncFieldBlurAcceptState() {
      if (activeEffectType !== "field-blur") {
        return;
      }

      acceptButton.disabled = !isBlurEligibleLayer(getActiveLayer()) || !hasFieldBlurAmount(fieldBlurPins);
    }

    function clearFieldBlurPreviewTimer() {
      if (!fieldBlurPreviewTimer) {
        return;
      }

      window.clearTimeout?.(fieldBlurPreviewTimer);
      fieldBlurPreviewTimer = 0;
    }

    function flushFieldBlurPreview() {
      clearFieldBlurPreviewTimer();

      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextPins = normalizeFieldBlurPins(fieldBlurPins);
      const currentPins = getFieldBlur(layer).pins;

      if (!hasFieldBlurAmount(nextPins) && !hasFieldBlurAmount(currentPins)) {
        return;
      }

      namespace.setLayerFieldBlurPins(layer.id, nextPins, {
        history: false,
        source: "layer-effects-preview",
      });
    }

    function scheduleFieldBlurPreview() {
      clearFieldBlurPreviewTimer();

      if (typeof window.setTimeout !== "function") {
        flushFieldBlurPreview();
        return;
      }

      fieldBlurPreviewTimer = window.setTimeout(() => {
        fieldBlurPreviewTimer = 0;
        flushFieldBlurPreview();
      }, FIELD_BLUR_PREVIEW_DEBOUNCE_MS);
    }

    function addFieldBlurPin(point) {
      if (fieldBlurPins.length >= MAX_FIELD_BLUR_PINS) {
        return;
      }

      const pin = createFieldBlurPin(point, 0);

      fieldBlurPins = [...fieldBlurPins, pin];
      setActiveFieldBlurPin(pin.id);
      scheduleFieldBlurPreview();
      syncFieldBlurAcceptState();
    }

    function removeFieldBlurPin(pinId) {
      fieldBlurPins = fieldBlurPins.filter((pin) => pin.id !== pinId);
      activeFieldBlurPinId = fieldBlurPins[0]?.id || "";
      syncFieldBlurUi();
      scheduleFieldBlurPreview();
      syncFieldBlurAcceptState();
      syncMobileLayerEffectsControls();
    }

    function clearFieldBlurTapTimer() {
      if (fieldBlurTapTimer) {
        window.clearTimeout(fieldBlurTapTimer);
        fieldBlurTapTimer = 0;
      }
    }

    function resetFieldBlurTapSequence() {
      clearFieldBlurTapTimer();
      fieldBlurTapSequence = null;
    }

    function queueFieldBlurTapReset() {
      clearFieldBlurTapTimer();

      fieldBlurTapTimer = window.setTimeout(() => {
        fieldBlurTapTimer = 0;
        fieldBlurTapSequence = null;
      }, FIELD_BLUR_TAP_TIMEOUT_MS);
    }

    function handleFieldBlurTap(pinId, point) {
      const targetKey = pinId ? `pin:${pinId}` : "canvas";
      const now = Date.now();
      const isSameSequence = fieldBlurTapSequence &&
        fieldBlurTapSequence.targetKey === targetKey &&
        now - fieldBlurTapSequence.time <= FIELD_BLUR_TAP_TIMEOUT_MS;
      const count = isSameSequence ? fieldBlurTapSequence.count + 1 : 1;

      fieldBlurTapSequence = {
        count,
        targetKey,
        time: now,
      };

      if (pinId && count >= 3) {
        removeFieldBlurPin(pinId);
        resetFieldBlurTapSequence();
        return;
      }

      if (!pinId && count === 2) {
        addFieldBlurPin(point);
        resetFieldBlurTapSequence();
        return;
      }

      queueFieldBlurTapReset();
    }

    function markFieldBlurPointerTapMoved(event) {
      if (!fieldBlurPointerTap || fieldBlurPointerTap.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - fieldBlurPointerTap.clientX;
      const dy = event.clientY - fieldBlurPointerTap.clientY;

      if (Math.hypot(dx, dy) > FIELD_BLUR_TAP_MOVE_TOLERANCE) {
        fieldBlurPointerTap.moved = true;

        if (fieldBlurDrag?.pointerId === event.pointerId) {
          fieldBlurDrag.moved = true;
        }
      }
    }

    function moveFieldBlurPin(pinId, point) {
      fieldBlurPins = fieldBlurPins.map((pin) =>
        pin.id === pinId ? { ...pin, x: point.x, y: point.y } : pin,
      );
      activeFieldBlurPinId = pinId;
      renderFieldBlurPins();
      scheduleFieldBlurPreview();
      syncFieldBlurAcceptState();
      syncMobileLayerEffectsControls();
    }

    function updateFieldBlurPinControlValue(pinId, blur) {
      const nextValue = String(Math.round(blur));

      fieldBlurPinList.querySelectorAll("[data-field-blur-pin-control]").forEach((control) => {
        const isActive = control.dataset.fieldBlurPinControl === pinId;

        control.classList.toggle("active", isActive);
      });
      fieldBlurPinList.querySelectorAll("[data-field-blur-pin-input]").forEach((input) => {
        if (input.dataset.fieldBlurPinInput === pinId) {
          input.value = String(blur);
        }
      });
      fieldBlurPinList.querySelectorAll("[data-field-blur-pin-number]").forEach((input) => {
        if (input.dataset.fieldBlurPinNumber === pinId && document.activeElement !== input) {
          input.value = nextValue;
        }
      });
    }

    function setFieldBlurPinBlur(pinId, blur, options = {}) {
      const nextBlur = clamp(blur, 0, MAX_FIELD_BLUR_RADIUS);

      fieldBlurPins = fieldBlurPins.map((pin) =>
        pin.id === pinId ? { ...pin, blur: nextBlur } : pin,
      );
      activeFieldBlurPinId = pinId;
      renderFieldBlurPins();
      updateFieldBlurPinControlValue(pinId, nextBlur);
      if (options.flush === true) {
        flushFieldBlurPreview();
      } else {
        scheduleFieldBlurPreview();
      }
      syncFieldBlurAcceptState();
      syncMobileLayerEffectsControls();
    }

    function commitFieldBlurPinInput(input) {
      const pinId = input?.dataset.fieldBlurPinInput || input?.dataset.fieldBlurPinNumber || "";

      if (!pinId) {
        return;
      }

      const nextBlur = clamp(input.value, 0, MAX_FIELD_BLUR_RADIUS);

      input.value = String(Math.round(nextBlur));
      setFieldBlurPinBlur(pinId, nextBlur, { flush: true });
    }

    function handleFieldBlurOverlayWheel(event) {
      if (activeEffectType !== "field-blur") {
        return;
      }

      const brushEngine = namespace.brushEngine;

      if (typeof brushEngine?.handleWheel === "function") {
        event.stopPropagation();
        brushEngine.handleWheel(event);
      }
    }

    function handleFieldBlurOverlayPointerDown(event) {
      if (activeEffectType !== "field-blur") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.button !== 0) {
        return;
      }

      const pinElement = event.target?.closest?.("[data-field-blur-pin]");
      const pinId = pinElement?.dataset.fieldBlurPin || "";
      fieldBlurPointerTap = {
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        pinId,
        pointerId: event.pointerId,
      };

      if (event.altKey && pinId) {
        removeFieldBlurPin(pinId);
        fieldBlurPointerTap = null;
        return;
      }

      if (pinId) {
        setActiveFieldBlurPin(pinId);
        fieldBlurDrag = {
          moved: false,
          pinId,
          pointerId: event.pointerId,
        };
        fieldBlurOverlay?.setPointerCapture?.(event.pointerId);
        return;
      }
    }

    function handleFieldBlurOverlayPointerMove(event) {
      markFieldBlurPointerTapMoved(event);

      if (activeEffectType !== "field-blur" || !fieldBlurDrag || fieldBlurDrag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      moveFieldBlurPin(fieldBlurDrag.pinId, clientToFieldBlurPoint(event.clientX, event.clientY));
    }

    function stopFieldBlurDrag(event, options = {}) {
      if (activeEffectType !== "field-blur") {
        return;
      }

      const tap = fieldBlurPointerTap?.pointerId === event.pointerId ? fieldBlurPointerTap : null;
      const drag = fieldBlurDrag?.pointerId === event.pointerId ? fieldBlurDrag : null;

      if (!tap && !drag) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (drag) {
        fieldBlurOverlay?.releasePointerCapture?.(event.pointerId);
        fieldBlurDrag = null;
      }

      if (tap && options.cancel !== true && !tap.moved && drag?.moved !== true) {
        handleFieldBlurTap(tap.pinId, clientToFieldBlurPoint(event.clientX, event.clientY));
      }

      if (tap) {
        fieldBlurPointerTap = null;
      }
    }

    function ensureFieldBlurOverlay() {
      const stage = document.querySelector(".editor-stage");

      if (!stage) {
        return null;
      }

      if (!fieldBlurOverlay || !fieldBlurOverlay.isConnected) {
        fieldBlurOverlay = document.createElement("div");
        fieldBlurOverlay.className = "field-blur-pin-overlay";
        fieldBlurOverlay.setAttribute("data-field-blur-pin-overlay", "");
        fieldBlurOverlay.addEventListener("pointerdown", handleFieldBlurOverlayPointerDown);
        fieldBlurOverlay.addEventListener("pointermove", handleFieldBlurOverlayPointerMove);
        fieldBlurOverlay.addEventListener("pointerup", stopFieldBlurDrag);
        fieldBlurOverlay.addEventListener("pointercancel", (event) => stopFieldBlurDrag(event, { cancel: true }));
        fieldBlurOverlay.addEventListener("wheel", handleFieldBlurOverlayWheel, { passive: false });
        stage.append(fieldBlurOverlay);
      }

      return fieldBlurOverlay;
    }

    function activateFieldBlurUi() {
      if (!isBlurEligibleLayer(getActiveLayer())) {
        return;
      }

      ensureFieldBlurPins();
      ensureFieldBlurOverlay();
      syncFieldBlurUi();
    }

    function deactivateFieldBlurUi() {
      if (fieldBlurOverlay) {
        fieldBlurOverlay.remove();
        fieldBlurOverlay = null;
      }

      fieldBlurDrag = null;
      fieldBlurPointerTap = null;
      resetFieldBlurTapSequence();
      clearFieldBlurPreviewTimer();
      activeFieldBlurPinId = "";
      fieldBlurPins = [];
    }

    function startPreviewSession(effectType) {
      const layerModel = getLayerModel();
      const layer = getActiveLayer();
      const effect = getEffectDefinition(effectType);

      previewSession = effect?.implemented && isBlurEligibleLayer(layer)
        ? {
            beforeState: namespace.documentHistory?.getLayerSnapshot?.(layerModel) ||
              getLayerStateSnapshot(layerModel),
            effectType,
            effects: Array.isArray(layer.effects) ? cloneValue(layer.effects) : [],
            layerId: layer.id,
          }
        : null;
    }

    function restorePreviewSession() {
      const layerModel = getLayerModel();
      const session = previewSession;

      cancelPendingLayerEffectPreview();
      if (!session?.layerId || !layerModel?.updateLayer) {
        previewSession = null;
        return false;
      }

      const layer = layerModel.findEntryById?.(session.layerId);

      if (!layer) {
        previewSession = null;
        return false;
      }

      const didRestore = layerModel.updateLayer(session.layerId, {
        effects: cloneValue(session.effects),
      }, {
        history: false,
        source: "layer-effects-cancel",
      });

      if (didRestore) {
        namespace.documentRenderer?.requestDraw?.();
      }

      previewSession = null;
      return didRestore;
    }

    function commitPreviewSessionMetadata() {
      const session = previewSession;
      const layerModel = getLayerModel();
      const history = namespace.documentHistory;

      previewSession = null;

      if (!session?.beforeState || !layerModel) {
        requestLayerEffectsDraw();
        return true;
      }

      if (!history?.recordLayerStateChange) {
        requestLayerEffectsDraw();
        return true;
      }

      const didRecord = history.recordLayerStateChange(layerModel, session.beforeState, {
        historyGroup: `${session.effectType || "layer-style"}-${session.layerId}`,
        source: "layer-effects-metadata-commit",
      });

      history.flushLayerState?.(layerModel);
      requestLayerEffectsDraw();
      return didRecord !== false;
    }

    function isRasterizableEffectType(effectType) {
      return RASTERIZABLE_EFFECT_TYPES.includes(effectType);
    }

    function setEffectView(effectType = "") {
      const definition = getEffectDefinition(effectType);
      const isEditor = Boolean(definition);
      const isImplemented = isImplementedEffect(effectType);
      const wasFieldBlur = activeEffectType === "field-blur";

      activeEffectType = isEditor ? effectType : "";
      picker.hidden = isEditor;
      detail.hidden = !isEditor;
      effectEditors.forEach((editor) => {
        editor.hidden = editor.dataset.layerEffectsEditor !== activeEffectType;
      });
      title.textContent = isEditor ? definition.label : "Effects";
      closeButton.setAttribute("aria-label", isEditor ? "Cancel effect" : "Close effects");
      acceptButton.setAttribute(
        "aria-label",
        isEditor
          ? (isImplemented ? `Apply ${definition.label}` : `${definition.label} unavailable`)
          : "Apply effect",
      );
      panel.dataset.activeEffect = activeEffectType;

      if (activeEffectType === "field-blur") {
        activateFieldBlurUi();
      } else if (wasFieldBlur) {
        deactivateFieldBlurUi();
      }

      if (activeEffectType === "curves") {
        renderCurvesEditor();
      }
    }

    function showEffectPicker(options = {}) {
      if (options.cancel !== false) {
        restorePreviewSession();
      } else {
        previewSession = null;
      }

      setEffectView("");
      syncControls();
      searchInput?.focus?.({ preventScroll: true });
    }

    function openEffectEditor(effectType) {
      const definition = getEffectDefinition(effectType);

      if (!definition) {
        return;
      }

      restorePreviewSession();
      setEffectView(effectType);
      startPreviewSession(effectType);
      syncControls();
      if (effectType === "gaussian-blur") {
        blurInput?.focus?.({ preventScroll: true });
      } else if (effectType === "motion-blur") {
        motionDistanceInput?.focus?.({ preventScroll: true });
      } else if (effectType === "field-blur") {
        fieldBlurPinList?.querySelector?.("[data-field-blur-pin-input]")?.focus?.({ preventScroll: true });
      } else if (effectType === "radial-blur") {
        radialAmountInput?.focus?.({ preventScroll: true });
      } else if (effectType === "grain") {
        grainAmountInput?.focus?.({ preventScroll: true });
      } else if (effectType === "noise") {
        noiseAmountInput?.focus?.({ preventScroll: true });
      } else if (effectType === "threshold") {
        const threshold = getThreshold(getActiveLayer());

        if (!threshold.enabled) {
          thresholdInput.value = String(DEFAULT_THRESHOLD_VALUE);
          applyThreshold(DEFAULT_THRESHOLD_VALUE);
        }

        thresholdInput?.focus?.({ preventScroll: true });
      } else if (effectType === "curves") {
        renderCurvesEditor();
        curvesInput?.focus?.({ preventScroll: true });
      } else if (effectType === "color-overlay") {
        const colorOverlay = getColorOverlay(getActiveLayer());
        const nextColor = colorOverlay.enabled ? colorOverlay.color : getSelectedOverlayColor();
        const nextOpacity = colorOverlay.enabled ? Math.round(colorOverlay.opacity * 100) : 100;

        colorOverlayInput.value = nextColor;
        colorOverlayOpacityInput.value = String(nextOpacity);
        if (!colorOverlay.enabled) {
          applyColorOverlay(nextColor, nextOpacity);
        }
        colorOverlayInput?.focus?.({ preventScroll: true });
      } else if (effectType === "stroke") {
        const stroke = getStroke(getActiveLayer());
        const nextSize = stroke.enabled ? stroke.size : DEFAULT_LAYER_STROKE_SIZE;
        const nextColor = stroke.enabled ? stroke.color : getSelectedOverlayColor();
        const nextOpacity = stroke.enabled ? Math.round(stroke.opacity * 100) : 100;

        strokeSizeInput.value = String(nextSize);
        strokeColorInput.value = nextColor;
        strokeOpacityInput.value = String(nextOpacity);
        if (!stroke.enabled) {
          applyStroke(nextSize, nextColor, nextOpacity);
        }
        strokeSizeInput?.focus?.({ preventScroll: true });
      }
    }

    function closePanel(options = {}) {
      const shouldCancel = options.cancel !== false;

      if (shouldCancel) {
        restorePreviewSession();
      } else {
        flushPendingLayerEffectPreview();
        previewSession = null;
      }

      setEffectView("");
      panel.hidden = true;
      [adjustmentButton, layerStyleButton].forEach((panelButton) => {
        panelButton?.classList.remove("active");
        panelButton?.setAttribute("aria-pressed", "false");
      });
    }

    function setOpen(isOpen, options = {}) {
      if (!isOpen) {
        closePanel({ cancel: true });
        return;
      }

      activeDesktopButton = options.trigger || activeDesktopButton || button;
      previewSession = null;
      setEffectView("");
      panel.hidden = false;
      [adjustmentButton, layerStyleButton].forEach((panelButton) => {
        const isActiveButton = panelButton === activeDesktopButton;

        panelButton?.classList.toggle("active", isActiveButton);
        panelButton?.setAttribute("aria-pressed", String(isActiveButton));
      });

      syncControls();
      positionPanel();
    }

    function positionPanel() {
      if (panel.hidden) {
        return;
      }

      const anchorButton = activeDesktopButton || button;

      if (!anchorButton) {
        return;
      }

      const buttonRect = anchorButton.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 12;
      const left = Math.max(12, buttonRect.left - panelRect.width - gap);
      const top = Math.min(
        Math.max(12, buttonRect.top - 8),
        window.innerHeight - panelRect.height - 12,
      );

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    function syncControls() {
      const layer = getActiveLayer();
      const isEligible = isBlurEligibleLayer(layer);
      const radius = isEligible ? getGaussianBlurRadius(layer) : 0;
      const motionBlur = isEligible ? getMotionBlur(layer) : { angle: 0, distance: 0 };
      const fieldBlur = isEligible ? getFieldBlur(layer) : { pins: [] };
      const radialBlur = isEligible
        ? getRadialBlur(layer, { defaultToLayerCenter: activeEffectType === "radial-blur" })
        : { amount: 0, centerX: 50, centerY: 50, mode: "spin" };
      const grain = isEligible
        ? getGrain(layer)
        : { amount: 0, scale: DEFAULT_GRAIN_SCALE, monochrome: true, seed: 0 };
      const noise = isEligible
        ? getNoise(layer)
        : { amount: 0, scale: DEFAULT_NOISE_SCALE, monochrome: true, seed: 0 };
      const threshold = isEligible
        ? getThreshold(layer)
        : { enabled: false, threshold: DEFAULT_THRESHOLD_VALUE };
      const curves = isEligible
        ? getCurves(layer)
        : { enabled: false, points: createDefaultCurvesPoints() };
      const colorOverlay = isEligible
        ? getColorOverlay(layer)
        : { color: DEFAULT_COLOR_OVERLAY_COLOR, enabled: false, opacity: 1 };
      const stroke = isEligible
        ? getStroke(layer)
        : { color: DEFAULT_COLOR_OVERLAY_COLOR, enabled: false, opacity: 1, position: "outside", size: 0 };
      const hasActiveFieldBlur = hasFieldBlurAmount(
        activeEffectType === "field-blur" ? fieldBlurPins : fieldBlur.pins,
      );
      const hasActiveCurves = hasMeaningfulCurves(curves.points);

      const layerName = isEligible ? layer.name || "Layer" : "No layer";

      targetName.textContent = layerName;
      pickerTargetName.textContent = layerName;
      menu.querySelectorAll("[data-layer-effect-option]").forEach((option) => {
        const definition = getEffectDefinition(option.dataset.layerEffectOption);
        const isEnabled = Boolean(definition && isEligible);

        option.disabled = !isEnabled;
        option.setAttribute("aria-disabled", isEnabled ? "false" : "true");
      });
      blurInput.disabled = !isEligible;
      colorOverlayInput.disabled = !isEligible;
      colorOverlayOpacityInput.disabled = !isEligible;
      strokeSizeInput.disabled = !isEligible;
      strokeColorInput.disabled = !isEligible;
      strokeOpacityInput.disabled = !isEligible;
      motionDistanceInput.disabled = !isEligible;
      motionAngleInput.disabled = !isEligible;
      radialAmountInput.disabled = !isEligible;
      radialCenterXInput.disabled = !isEligible;
      radialCenterYInput.disabled = !isEligible;
      grainAmountInput.disabled = !isEligible;
      grainScaleInput.disabled = !isEligible;
      grainMonochromeInput.disabled = !isEligible;
      noiseAmountInput.disabled = !isEligible;
      noiseScaleInput.disabled = !isEligible;
      noiseMonochromeInput.disabled = !isEligible;
      thresholdInput.disabled = !isEligible;
      if (curvesInput) {
        curvesInput.disabled = !isEligible;
      }
      if (curvesOutput) {
        curvesOutput.disabled = !isEligible;
      }
      fieldBlurPinList.querySelectorAll("[data-field-blur-pin-input]").forEach((input) => {
        input.disabled = !isEligible;
      });
      radialModeButtons.forEach((modeButton) => {
        modeButton.disabled = !isEligible;
      });
      acceptButton.disabled = !isEligible ||
        !isImplementedEffect(activeEffectType) ||
        (activeEffectType === "gaussian-blur" && radius <= 0) ||
        (activeEffectType === "motion-blur" && motionBlur.distance <= 0) ||
        (activeEffectType === "field-blur" && !hasActiveFieldBlur) ||
        (activeEffectType === "radial-blur" && radialBlur.amount <= 0) ||
        (activeEffectType === "grain" && grain.amount <= 0) ||
        (activeEffectType === "noise" && noise.amount <= 0) ||
        (activeEffectType === "threshold" && !threshold.enabled) ||
        (activeEffectType === "curves" && !hasActiveCurves) ||
        (activeEffectType === "color-overlay" && !colorOverlay.enabled) ||
        (activeEffectType === "stroke" && !stroke.enabled);
      colorOverlayResetButton.disabled = !isEligible || !colorOverlay.enabled;
      strokeResetButton.disabled = !isEligible || !stroke.enabled;
      resetButton.disabled = !isEligible || radius <= 0;
      motionResetButton.disabled = !isEligible || motionBlur.distance <= 0;
      radialResetButton.disabled = !isEligible || radialBlur.amount <= 0;
      grainResetButton.disabled = !isEligible || grain.amount <= 0;
      noiseResetButton.disabled = !isEligible || noise.amount <= 0;
      thresholdResetButton.disabled = !isEligible || !threshold.enabled;
      blurInput.value = String(radius);
      blurValue.textContent = `${Math.round(radius)} px`;
      motionDistanceInput.value = String(motionBlur.distance);
      motionDistanceValue.textContent = `${Math.round(motionBlur.distance)} px`;
      motionAngleInput.value = String(getDisplayAngle(motionBlur.angle));
      motionAngleValue.textContent = `${getDisplayAngle(motionBlur.angle)} deg`;
      radialAmountInput.value = String(radialBlur.amount);
      radialAmountValue.textContent = String(Math.round(radialBlur.amount));
      radialCenterXInput.value = String(radialBlur.centerX);
      radialCenterXValue.textContent = `${Math.round(radialBlur.centerX)}%`;
      radialCenterYInput.value = String(radialBlur.centerY);
      radialCenterYValue.textContent = `${Math.round(radialBlur.centerY)}%`;
      setRadialModeButtonState(radialBlur.mode);
      grainAmountInput.value = String(grain.amount);
      grainAmountValue.textContent = `${Math.round(grain.amount)}%`;
      grainScaleInput.value = String(grain.scale);
      grainScaleValue.textContent = `${Math.round(grain.scale)}%`;
      grainMonochromeInput.checked = grain.monochrome;
      noiseAmountInput.value = String(noise.amount);
      noiseAmountValue.textContent = `${Math.round(noise.amount)}%`;
      noiseScaleInput.value = String(noise.scale);
      noiseScaleValue.textContent = `${Math.round(noise.scale)}%`;
      noiseMonochromeInput.checked = noise.monochrome;
      thresholdInput.value = String(threshold.threshold);
      thresholdValue.textContent = String(Math.round(threshold.threshold));
      colorOverlayInput.value = colorOverlay.color;
      colorOverlayHex.textContent = colorOverlay.color;
      colorOverlaySwatch.style.setProperty("--layer-effect-color", colorOverlay.color);
      colorOverlayOpacityInput.value = String(Math.round(colorOverlay.opacity * 100));
      colorOverlayOpacityValue.textContent = `${Math.round(colorOverlay.opacity * 100)}%`;
      strokeSizeInput.value = String(stroke.size);
      strokeSizeValue.textContent = `${Math.round(stroke.size)} px`;
      strokeColorInput.value = stroke.color;
      strokeHex.textContent = stroke.color;
      strokeSwatch.style.setProperty("--layer-effect-color", stroke.color);
      strokeOpacityInput.value = String(Math.round(stroke.opacity * 100));
      strokeOpacityValue.textContent = `${Math.round(stroke.opacity * 100)}%`;
      syncFieldBlurUi();
      renderCurvesEditor();
      panel.classList.toggle("disabled", !isEligible);
    }

    function applyColorOverlay(color = colorOverlayInput?.value, opacityPercent = colorOverlayOpacityInput?.value) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextColor = normalizeHexColor(color);
      const nextOpacityPercent = clamp(opacityPercent, 0, 100);
      const nextOpacity = normalizeUnitOpacity(nextOpacityPercent / 100);

      colorOverlayInput.value = nextColor;
      colorOverlayHex.textContent = nextColor;
      colorOverlaySwatch.style.setProperty("--layer-effect-color", nextColor);
      colorOverlayOpacityValue.textContent = `${Math.round(nextOpacityPercent)}%`;
      queueLayerEffectPreview(
        "color-overlay",
        layer.id,
        () => namespace.setLayerColorOverlay(layer.id, nextColor, nextOpacity, {
          history: false,
          source: "layer-style-preview",
        }),
      );
    }

    function clearColorOverlay() {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextColor = getSelectedOverlayColor();

      colorOverlayInput.value = nextColor;
      colorOverlayHex.textContent = nextColor;
      colorOverlaySwatch.style.setProperty("--layer-effect-color", nextColor);
      colorOverlayOpacityInput.value = "100";
      colorOverlayOpacityValue.textContent = "100%";
      queueLayerEffectPreview(
        "color-overlay",
        layer.id,
        () => namespace.setLayerColorOverlay(layer.id, nextColor, 0, {
          enabled: false,
          history: false,
          source: "layer-style-preview",
        }),
      );
    }

    function applyStroke(
      size = strokeSizeInput?.value,
      color = strokeColorInput?.value,
      opacityPercent = strokeOpacityInput?.value,
    ) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextSize = normalizeLayerStrokeSize(size);
      const nextColor = normalizeHexColor(color);
      const nextOpacityPercent = clamp(opacityPercent, 0, 100);
      const nextOpacity = normalizeUnitOpacity(nextOpacityPercent / 100);

      strokeSizeInput.value = String(nextSize);
      strokeSizeValue.textContent = `${Math.round(nextSize)} px`;
      strokeColorInput.value = nextColor;
      strokeHex.textContent = nextColor;
      strokeSwatch.style.setProperty("--layer-effect-color", nextColor);
      strokeOpacityValue.textContent = `${Math.round(nextOpacityPercent)}%`;
      queueLayerEffectPreview(
        "stroke",
        layer.id,
        () => namespace.setLayerStroke(layer.id, nextSize, nextColor, nextOpacity, {
          history: false,
          source: "layer-style-preview",
        }),
      );
    }

    function clearStroke() {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextColor = getSelectedOverlayColor();

      strokeSizeInput.value = String(DEFAULT_LAYER_STROKE_SIZE);
      strokeSizeValue.textContent = `${DEFAULT_LAYER_STROKE_SIZE} px`;
      strokeColorInput.value = nextColor;
      strokeHex.textContent = nextColor;
      strokeSwatch.style.setProperty("--layer-effect-color", nextColor);
      strokeOpacityInput.value = "100";
      strokeOpacityValue.textContent = "100%";
      queueLayerEffectPreview(
        "stroke",
        layer.id,
        () => namespace.setLayerStroke(layer.id, 0, nextColor, 0, {
          enabled: false,
          history: false,
          source: "layer-style-preview",
        }),
      );
    }

    function applyRadius(radius) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextRadius = clamp(radius, 0, MAX_GAUSSIAN_BLUR_RADIUS);

      blurValue.textContent = `${Math.round(nextRadius)} px`;
      queueLayerEffectPreview(
        "gaussian-blur",
        layer.id,
        () => namespace.setLayerGaussianBlurRadius(layer.id, nextRadius, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function applyMotionBlur(distance, angle = motionAngleInput?.value) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextDistance = clamp(distance, 0, MAX_MOTION_BLUR_DISTANCE);
      const nextAngle = normalizeAngle(angle);
      const currentMotionBlur = getMotionBlur(layer);

      motionDistanceValue.textContent = `${Math.round(nextDistance)} px`;
      motionAngleValue.textContent = `${getDisplayAngle(nextAngle)} deg`;
      if (nextDistance <= 0 && currentMotionBlur.distance <= 0) {
        return;
      }

      queueLayerEffectPreview(
        "motion-blur",
        layer.id,
        () => namespace.setLayerMotionBlur(layer.id, nextDistance, nextAngle, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function applyRadialBlur(
      amount,
      centerX = radialCenterXInput?.value,
      centerY = radialCenterYInput?.value,
      mode = getSelectedRadialMode(),
    ) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextAmount = clamp(amount, 0, MAX_RADIAL_BLUR_AMOUNT);
      const nextCenterX = normalizePercent(centerX);
      const nextCenterY = normalizePercent(centerY);
      const nextMode = normalizeRadialBlurMode(mode);
      const currentRadialBlur = getRadialBlur(layer);

      radialAmountValue.textContent = String(Math.round(nextAmount));
      radialCenterXValue.textContent = `${Math.round(nextCenterX)}%`;
      radialCenterYValue.textContent = `${Math.round(nextCenterY)}%`;
      if (nextAmount <= 0 && currentRadialBlur.amount <= 0) {
        return;
      }

      setRadialModeButtonState(nextMode);
      queueLayerEffectPreview(
        "radial-blur",
        layer.id,
        () => namespace.setLayerRadialBlur(layer.id, nextAmount, nextCenterX, nextCenterY, nextMode, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function applyGrain(
      amount,
      scale = grainScaleInput?.value,
      monochrome = grainMonochromeInput?.checked,
    ) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextAmount = clamp(amount, 0, MAX_GRAIN_AMOUNT);
      const nextScale = clamp(scale, 1, MAX_GRAIN_SCALE);
      const nextMonochrome = monochrome !== false;
      const currentGrain = getGrain(layer);

      grainAmountValue.textContent = `${Math.round(nextAmount)}%`;
      grainScaleValue.textContent = `${Math.round(nextScale)}%`;
      if (nextAmount <= 0 && currentGrain.amount <= 0) {
        return;
      }

      queueLayerEffectPreview(
        "grain",
        layer.id,
        () => namespace.setLayerGrain(layer.id, nextAmount, nextScale, nextMonochrome, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function applyNoise(
      amount,
      scale = noiseScaleInput?.value,
      monochrome = noiseMonochromeInput?.checked,
    ) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextAmount = clamp(amount, 0, MAX_NOISE_AMOUNT);
      const nextScale = clamp(scale, 1, MAX_NOISE_SCALE);
      const nextMonochrome = monochrome !== false;
      const currentNoise = getNoise(layer);

      noiseAmountValue.textContent = `${Math.round(nextAmount)}%`;
      noiseScaleValue.textContent = `${Math.round(nextScale)}%`;
      if (nextAmount <= 0 && currentNoise.amount <= 0) {
        return;
      }

      queueLayerEffectPreview(
        "noise",
        layer.id,
        () => namespace.setLayerNoise(layer.id, nextAmount, nextScale, nextMonochrome, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function applyThreshold(threshold) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextThreshold = normalizeThresholdValue(threshold);

      thresholdValue.textContent = String(Math.round(nextThreshold));
      queueLayerEffectPreview(
        "threshold",
        layer.id,
        () => namespace.setLayerThreshold(layer.id, nextThreshold, {
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function clearThreshold() {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      thresholdInput.value = String(DEFAULT_THRESHOLD_VALUE);
      thresholdValue.textContent = String(DEFAULT_THRESHOLD_VALUE);
      queueLayerEffectPreview(
        "threshold",
        layer.id,
        () => namespace.setLayerThreshold(layer.id, DEFAULT_THRESHOLD_VALUE, {
          enabled: false,
          history: false,
          source: "layer-effects-preview",
        }),
      );
    }

    function filterEffectMenu() {
      const query = String(searchInput?.value || "").trim().toLowerCase();

      menu.querySelectorAll("[data-layer-effects-menu-group]").forEach((group) => {
        let hasVisibleOption = false;

        group.querySelectorAll("[data-layer-effect-option]").forEach((option) => {
          const label = option.dataset.effectLabel || "";
          const isVisible = !query || label.includes(query);

          option.hidden = !isVisible;
          hasVisibleOption = hasVisibleOption || isVisible;
        });

        group.hidden = !hasVisibleOption;
      });
    }

    function renderEffectMenu(effectGroups = getAdjustmentEffectGroups()) {
      menu.innerHTML = getEffectPickerMarkup(effectGroups);
      filterEffectMenu();
      syncControls();
    }

    function handleLayerChange(event) {
      const layer = getActiveLayer();

      if (mobileLayerEffectsSession?.layerId && layer?.id !== mobileLayerEffectsSession.layerId) {
        finalizeMobileLayerEffectsSession();
        closeMobileLayerEffectsPanel();
      }

      if (mobileLayerEffectsToolbar && !mobileLayerEffectsToolbar.hidden) {
        syncMobileLayerEffectsControls();
      }

      if (panel.hidden) {
        return;
      }

      const activeLayer = getActiveLayer();

      if (previewSession?.layerId && activeLayer?.id !== previewSession.layerId) {
        showEffectPicker({ cancel: true });
        return;
      }

      if (activeEffectType === "field-blur" && event?.detail?.source === "layer-effects-preview") {
        renderFieldBlurPins();
        syncFieldBlurAcceptState();
        return;
      }

      syncControls();
    }

    function handleMobileLayerEffectsBeforeHistory(event) {
      const action = String(event.detail?.action || "").trim().toLowerCase();

      if ((action === "undo" || action === "redo") && mobileLayerEffectsSession) {
        finalizeMobileLayerEffectsSession();
        closeMobileLayerEffectsPanel();
      }
    }

    function handleMobileLayerEffectsToolChange(event) {
      const label = String(event.detail?.label || "").trim().toUpperCase();
      const toolMode = String(event.detail?.toolMode || "").trim().toLowerCase();
      const isAdjustmentLayer = label === "ADJUSTMENT LAYER" || toolMode === "adjustments";
      const shouldShow = isAdjustmentLayer && isMobileLayerEffectsViewport();

      showMobileLayerEffectsToolbar(shouldShow);

      if (shouldShow) {
        closePanel({ cancel: true });
        syncMobileLayerEffectsControls();
      }
    }

    mobileLayerEffectButtons.forEach((effectButton) => {
      effectButton.addEventListener("click", () => {
        openMobileLayerEffectPanel(effectButton.dataset.mobileLayerEffectTrigger);
      });
    });

    mobileLayerEffectsBackButton?.addEventListener("click", returnFromMobileLayerEffectsToolbar);

    mobileLayerEffectInputs.forEach((input) => {
      input.addEventListener("input", () => {
        updateMobileLayerEffectRangeProgress(input);
        applyMobileLayerEffectValue(input.dataset.mobileLayerEffectInput, input.value);
      });
    });

    mobileRadialModeButtons.forEach((modeButton) => {
      modeButton.addEventListener("click", () => {
        setMobileRadialModeButtonState(modeButton.dataset.mobileRadialMode);
        applyMobileLayerEffectValue("radial-amount", getMobileLayerEffectInput("radial-amount")?.value);
      });
    });

    mobileGrainMonochromeButton?.addEventListener("click", () => {
      const isMonochrome = mobileGrainMonochromeButton.getAttribute("aria-pressed") !== "true";

      setMobileGrainMonochromeState(isMonochrome);
      applyMobileLayerEffectValue("grain-amount", getMobileLayerEffectInput("grain-amount")?.value);
    });

    mobileNoiseMonochromeButton?.addEventListener("click", () => {
      const isMonochrome = mobileNoiseMonochromeButton.getAttribute("aria-pressed") !== "true";

      setMobileNoiseMonochromeState(isMonochrome);
      applyMobileLayerEffectValue("noise-amount", getMobileLayerEffectInput("noise-amount")?.value);
    });

    mobileLayerEffectResets.forEach((reset) => {
      reset.addEventListener("click", () => {
        resetMobileLayerEffect(reset.dataset.mobileLayerEffectReset);
      });
    });

    adjustmentButton?.addEventListener("click", (event) => {
      event.preventDefault();
      activeDesktopButton = adjustmentButton;
      if (searchInput) {
        searchInput.value = "";
      }
      renderEffectMenu(getAdjustmentEffectGroups());
      setOpen(panel.hidden, { trigger: adjustmentButton });
    });

    layerStyleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      activeDesktopButton = layerStyleButton;
      if (searchInput) {
        searchInput.value = "";
      }
      renderEffectMenu(getStyleEffectGroups());
      setOpen(true, { trigger: layerStyleButton });
      positionPanel();
    });

    backButton.addEventListener("click", () => {
      showEffectPicker({ cancel: true });
    });

    menu.addEventListener("click", (event) => {
      const option = event.target?.closest?.("[data-layer-effect-option]");

      if (!option || option.disabled) {
        return;
      }

      openEffectEditor(option.dataset.layerEffectOption);
    });

    searchInput?.addEventListener("input", filterEffectMenu);

    colorOverlayInput.addEventListener("input", () => {
      applyColorOverlay(colorOverlayInput.value, colorOverlayOpacityInput.value);
    });

    colorOverlayOpacityInput.addEventListener("input", () => {
      applyColorOverlay(colorOverlayInput.value, colorOverlayOpacityInput.value);
    });

    colorOverlayResetButton.addEventListener("click", () => {
      clearColorOverlay();
    });

    strokeSizeInput.addEventListener("input", () => {
      applyStroke(strokeSizeInput.value, strokeColorInput.value, strokeOpacityInput.value);
    });

    strokeColorInput.addEventListener("input", () => {
      applyStroke(strokeSizeInput.value, strokeColorInput.value, strokeOpacityInput.value);
    });

    strokeOpacityInput.addEventListener("input", () => {
      applyStroke(strokeSizeInput.value, strokeColorInput.value, strokeOpacityInput.value);
    });

    strokeResetButton.addEventListener("click", () => {
      clearStroke();
    });

    blurInput.addEventListener("input", () => {
      applyRadius(blurInput.value);
    });

    resetButton.addEventListener("click", () => {
      blurInput.value = "0";
      applyRadius(0);
    });

    motionDistanceInput.addEventListener("input", () => {
      applyMotionBlur(motionDistanceInput.value, motionAngleInput.value);
    });

    motionAngleInput.addEventListener("input", () => {
      applyMotionBlur(motionDistanceInput.value, motionAngleInput.value);
    });

    motionResetButton.addEventListener("click", () => {
      motionDistanceInput.value = "0";
      applyMotionBlur(0, motionAngleInput.value);
    });

    radialAmountInput.addEventListener("input", () => {
      applyRadialBlur(
        radialAmountInput.value,
        radialCenterXInput.value,
        radialCenterYInput.value,
        getSelectedRadialMode(),
      );
    });

    radialCenterXInput.addEventListener("input", () => {
      applyRadialBlur(
        radialAmountInput.value,
        radialCenterXInput.value,
        radialCenterYInput.value,
        getSelectedRadialMode(),
      );
    });

    radialCenterYInput.addEventListener("input", () => {
      applyRadialBlur(
        radialAmountInput.value,
        radialCenterXInput.value,
        radialCenterYInput.value,
        getSelectedRadialMode(),
      );
    });

    radialModeButtons.forEach((modeButton) => {
      modeButton.addEventListener("click", () => {
        const nextMode = normalizeRadialBlurMode(modeButton.dataset.layerRadialModeButton);

        setRadialModeButtonState(nextMode);
        applyRadialBlur(
          radialAmountInput.value,
          radialCenterXInput.value,
          radialCenterYInput.value,
          nextMode,
        );
      });
    });

    radialResetButton.addEventListener("click", () => {
      radialAmountInput.value = "0";
      applyRadialBlur(0, radialCenterXInput.value, radialCenterYInput.value, getSelectedRadialMode());
    });

    grainAmountInput.addEventListener("input", () => {
      applyGrain(grainAmountInput.value, grainScaleInput.value, grainMonochromeInput.checked);
    });

    grainScaleInput.addEventListener("input", () => {
      applyGrain(grainAmountInput.value, grainScaleInput.value, grainMonochromeInput.checked);
    });

    grainMonochromeInput.addEventListener("change", () => {
      applyGrain(grainAmountInput.value, grainScaleInput.value, grainMonochromeInput.checked);
    });

    grainResetButton.addEventListener("click", () => {
      grainAmountInput.value = "0";
      grainScaleInput.value = String(DEFAULT_GRAIN_SCALE);
      grainMonochromeInput.checked = true;
      applyGrain(0, DEFAULT_GRAIN_SCALE, true);
    });

    noiseAmountInput.addEventListener("input", () => {
      applyNoise(noiseAmountInput.value, noiseScaleInput.value, noiseMonochromeInput.checked);
    });

    noiseScaleInput.addEventListener("input", () => {
      applyNoise(noiseAmountInput.value, noiseScaleInput.value, noiseMonochromeInput.checked);
    });

    noiseMonochromeInput.addEventListener("change", () => {
      applyNoise(noiseAmountInput.value, noiseScaleInput.value, noiseMonochromeInput.checked);
    });

    noiseResetButton.addEventListener("click", () => {
      noiseAmountInput.value = "0";
      noiseScaleInput.value = String(DEFAULT_NOISE_SCALE);
      noiseMonochromeInput.checked = true;
      applyNoise(0, DEFAULT_NOISE_SCALE, true);
    });

    thresholdInput.addEventListener("input", () => {
      applyThreshold(thresholdInput.value);
    });

    thresholdResetButton.addEventListener("click", () => {
      clearThreshold();
    });

    curvesChannelButtons.forEach((channelButton) => {
      channelButton.addEventListener("click", () => {
        setCurvesChannel(channelButton.dataset.curvesChannel);
      });
    });

    curvesGraph?.addEventListener("contextmenu", (event) => {
      if (activeEffectType !== "curves") {
        return;
      }

      event.preventDefault();
    });

    curvesGraph?.addEventListener("pointerdown", (event) => {
      if (activeEffectType !== "curves" || !isBlurEligibleLayer(getActiveLayer())) {
        return;
      }

      const engine = getCurvesEngine();
      const pointsByChannel = getCurvesPoints();
      const channelPoints = getCurvesChannelPoints(pointsByChannel);
      const hitPoint = findCurvesPointNearEvent(event, channelPoints);

      event.preventDefault();
      event.stopPropagation();

      if (event.button === 2) {
        if (hitPoint && !hitPoint.endpoint && engine?.deletePoint) {
          activeCurvesPointId = hitPoint.id;
          deleteActiveCurvesPoint();
        }
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (hitPoint) {
        activeCurvesPointId = hitPoint.id;
      } else if (engine?.addPoint) {
        const point = screenToCurvesPoint(event.clientX, event.clientY);
        const result = engine.addPoint(channelPoints, point.x, point.y);

        activeCurvesPointId = result.selectedId;
        applyCurvesPoints({
          ...pointsByChannel,
          [activeCurvesChannel]: result.points,
        });
      }

      curvesDrag = {
        pointerId: event.pointerId,
      };
      curvesGraph.setPointerCapture?.(event.pointerId);
      renderCurvesEditor();
    });

    curvesGraph?.addEventListener("pointermove", (event) => {
      if (activeEffectType !== "curves" || !curvesDrag || curvesDrag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const point = screenToCurvesPoint(event.clientX, event.clientY);

      moveActiveCurvesPoint(point.x, point.y);
    });

    const stopCurvesDrag = (event) => {
      if (!curvesDrag || curvesDrag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      curvesGraph?.releasePointerCapture?.(event.pointerId);
      curvesDrag = null;
      syncControls();
    };

    curvesGraph?.addEventListener("pointerup", stopCurvesDrag);
    curvesGraph?.addEventListener("pointercancel", stopCurvesDrag);

    curvesInput?.addEventListener("input", () => {
      if (curvesInput.value !== "" && curvesOutput?.value !== "") {
        commitCurvesNumberInput();
      }
    });

    curvesOutput?.addEventListener("input", () => {
      if (curvesOutput.value !== "" && curvesInput?.value !== "") {
        commitCurvesNumberInput();
      }
    });

    curvesResetChannelButton?.addEventListener("click", () => {
      resetCurvesChannel();
    });

    curvesResetAllButton?.addEventListener("click", () => {
      resetAllCurves();
    });

    fieldBlurPinList.addEventListener("click", (event) => {
      const valueControl = event.target?.closest?.("[data-field-blur-pin-input], [data-field-blur-pin-number], .field-blur-number");
      const control = event.target?.closest?.("[data-field-blur-pin-control]");
      const valuePinId = valueControl?.dataset.fieldBlurPinInput ||
        valueControl?.dataset.fieldBlurPinNumber ||
        valueControl?.querySelector?.("[data-field-blur-pin-number]")?.dataset.fieldBlurPinNumber ||
        "";
      const pinId = valuePinId || control?.dataset.fieldBlurPinControl || "";

      if (!pinId) {
        return;
      }

      if (valueControl) {
        focusFieldBlurPinControl(pinId);
        return;
      }

      setActiveFieldBlurPin(pinId);
    });

    fieldBlurPinList.addEventListener("input", (event) => {
      const input = event.target?.closest?.("[data-field-blur-pin-input], [data-field-blur-pin-number]");
      const pinId = input?.dataset.fieldBlurPinInput || input?.dataset.fieldBlurPinNumber || "";

      if (pinId && input.value !== "") {
        setFieldBlurPinBlur(pinId, input.value);
      }
    });

    fieldBlurPinList.addEventListener("change", (event) => {
      const input = event.target?.closest?.("[data-field-blur-pin-input], [data-field-blur-pin-number]");

      if (input) {
        commitFieldBlurPinInput(input);
      }
    });

    fieldBlurPinList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const input = event.target?.closest?.("[data-field-blur-pin-number]");

      if (input) {
        event.preventDefault();
        commitFieldBlurPinInput(input);
        input.blur?.();
      }
    });

    acceptButton.addEventListener("click", () => {
      if (acceptButton.disabled) {
        return;
      }

      if (activeEffectType === "field-blur") {
        flushFieldBlurPreview();
      } else {
        flushPendingLayerEffectPreview();
      }

      const didCommit = isRasterizableEffectType(activeEffectType)
        ? namespace.rasterizeActiveLayerEffects?.({
            beforeState: previewSession?.beforeState || null,
          }) === true
        : commitPreviewSessionMetadata();

      if (didCommit) {
        closePanel({ cancel: false });
      } else {
        syncControls();
      }
    });

    closeButton.addEventListener("click", () => {
      closePanel({ cancel: true });
    });

    panelCloseButton.addEventListener("click", () => {
      closePanel({ cancel: true });
    });

    document.addEventListener("pointerdown", (event) => {
      if (
        panel.hidden ||
        event.target instanceof Node && (
          panel.contains(event.target) ||
          adjustmentButton?.contains(event.target) ||
          layerStyleButton?.contains(event.target) ||
          (activeEffectType === "field-blur" && event.target.closest?.(".editor-stage"))
        )
      ) {
        return;
      }

      closePanel({ cancel: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePanel({ cancel: true });
        return;
      }

      if (
        activeEffectType === "curves" &&
        (event.key === "Delete" || event.key === "Backspace") &&
        event.target instanceof Node &&
        panel.contains(event.target)
      ) {
        const isTyping =
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          event.target.isContentEditable;

        if (!isTyping) {
          event.preventDefault();
          deleteActiveCurvesPoint();
        }
      }
    });

    window.addEventListener("resize", positionPanel);
    window.addEventListener("resize", () => {
      if (!isMobileLayerEffectsViewport()) {
        showMobileLayerEffectsToolbar(false);
      }
    });
    window.addEventListener("resize", renderFieldBlurPins);
    window.addEventListener("cbo:camera-change", renderFieldBlurPins);
    window.addEventListener("cbo:before-history-action", handleMobileLayerEffectsBeforeHistory);
    window.addEventListener("cbo:tool-change", handleMobileLayerEffectsToolChange);
    window.addEventListener("cbo:document-layers-change", handleLayerChange);
    window.addEventListener("cbo:layer-effects-rasterized", handleLayerChange);
    setEffectView("");
    filterEffectMenu();
    syncControls();
  };
})(window.CBO = window.CBO || {});
