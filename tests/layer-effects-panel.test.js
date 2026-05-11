const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadLayerEffectsNamespace() {
  const curvesSource = fs.readFileSync(path.join(repoRoot, "js", "curves-engine.js"), "utf8");
  const source = fs.readFileSync(path.join(repoRoot, "js", "layer-effects-panel.js"), "utf8");
  const window = {
    CBO: {},
    dispatchEvent(event) {
      this.lastEvent = event;
    },
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Uint8Array,
    window,
  });

  vm.runInContext(curvesSource, context);
  vm.runInContext(source, context);

  return context.window.CBO;
}

test("layer effects panel is loaded after the vertical toolbar", () => {
  const indexSource = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(repoRoot, "css", "layer-effects-panel.css"), "utf8");

  assert.match(indexSource, /<link rel="stylesheet" href="\.\/css\/layer-effects-panel\.css" \/>/);
  assert.match(
    indexSource,
    /<script src="\.\/js\/vertical-toolbar\.js"><\/script>\s*<script src="\.\/js\/layer-effects-panel\.js"><\/script>/,
  );
  assert.match(appSource, /window\.CBO\.initVerticalToolbar\(\);\s*window\.CBO\.initLayerEffectsPanel\?\.\(\);/);
  assert.match(cssSource, /\.layer-effects-popover[\s\S]*?overflow: hidden;/);
  assert.match(cssSource, /\.layer-effects-detail[\s\S]*?min-width: 0;/);
  assert.match(cssSource, /\.layer-effects-range[\s\S]*?max-width: 100%;/);
  assert.match(cssSource, /\.field-blur-pin-overlay[\s\S]*?pointer-events: auto;/);
  assert.match(cssSource, /\.field-blur-pin-ring[\s\S]*?conic-gradient/);
  assert.match(cssSource, /\.field-blur-control-header[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(cssSource, /\.field-blur-number[\s\S]*?background: #181a1f;/);
  assert.match(cssSource, /\.field-blur-number:focus-within[\s\S]*?background: #2c303a;/);
  assert.match(cssSource, /\.field-blur-number-input[\s\S]*?appearance: textfield;[\s\S]*?text-align: right;/);
  assert.match(cssSource, /\.field-blur-guide[\s\S]*?font-style: italic;/);
});

test("layer effects panel writes gaussian blur as layer-state metadata", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layer-effects-panel.js"), "utf8");
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");

  assert.match(source, /type: "gaussian-blur"/);
  assert.match(source, /\{ implemented: true, icon: "motion", label: "Motion Blur", type: "motion-blur" \}/);
  assert.match(source, /\{ implemented: true, icon: "field", label: "Field Blur", type: "field-blur" \}/);
  assert.match(source, /\{ implemented: true, icon: "radial", label: "Radial Blur", type: "radial-blur" \}/);
  assert.match(source, /\{ implemented: true, icon: "noise", label: "Noise", type: "noise" \}/);
  assert.match(source, /\{ implemented: true, icon: "grain", label: "Grain", type: "grain" \}/);
  assert.match(source, /\{ implemented: true, icon: "threshold", label: "Threshold", type: "threshold" \}/);
  assert.match(source, /\{ implemented: true, icon: "curves", label: "Curves", mobile: false, type: "curves" \}/);
  assert.match(source, /RASTERIZABLE_EFFECT_TYPES[\s\S]*"noise"/);
  assert.match(source, /RASTERIZABLE_EFFECT_TYPES[\s\S]*"grain"/);
  assert.match(source, /RASTERIZABLE_EFFECT_TYPES[\s\S]*"threshold"/);
  assert.match(source, /RASTERIZABLE_EFFECT_TYPES[\s\S]*"curves"/);
  assert.match(source, /radius: nextRadius/);
  assert.match(source, /distance: nextDistance/);
  assert.match(source, /angle: nextAngle/);
  assert.match(source, /amount: nextAmount/);
  assert.match(source, /pins: nextPins/);
  assert.match(source, /centerX: normalizePercent\(centerX, defaultCenter\.centerX\)/);
  assert.match(source, /centerY: normalizePercent\(centerY, defaultCenter\.centerY\)/);
  assert.match(source, /mode: normalizeRadialBlurMode\(mode\)/);
  assert.match(source, /getRasterContentBounds\?\.\(layer\.id/);
  assert.match(source, /getLayerEffectCenterPoint\(getActiveLayer\(\)\)/);
  assert.match(source, /defaultToLayerCenter: activeEffectType === "radial-blur"/);
  assert.match(source, /preferSparse: beforePreferSparse/);
  assert.match(source, /replaceSparse: beforePreferSparse/);
  assert.match(source, /captureAfterSnapshot: false/);
  assert.match(source, /history-redo-layer-effects-rasterize-retile/);
  assert.match(source, /layerModel\.updateLayer\(layerId,/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `gaussian-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `motion-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `field-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: updateOptionsSource\.historyGroup \|\| `radial-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `noise-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `grain-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `threshold-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `curves-\$\{layerId\}`/);
  assert.match(source, /namespace\.documentRenderer\?\.requestDraw\?\.\(\)/);
  assert.match(source, /layer\.type !== "background"/);
  assert.match(source, /EFFECT_GROUPS/);
  assert.match(source, /label: "Curves"/);
  assert.match(source, /label: "Noise"/);
  assert.match(source, /label: "Bloom"/);
  assert.match(source, /label: "Threshold"/);
  assert.match(source, /label: "Halftone"/);
  assert.match(source, /data-layer-effects-editor="noise"/);
  assert.match(source, /data-layer-noise-amount-input/);
  assert.match(source, /data-layer-noise-scale-input/);
  assert.match(source, /data-layer-noise-monochrome-input/);
  assert.match(source, /data-layer-effects-editor="threshold"/);
  assert.match(source, /data-layer-threshold-input/);
  assert.match(source, /data-curves-channel="rgb"/);
  assert.match(source, /data-curves-line/);
  assert.match(source, /data-curves-input/);
  assert.match(source, /data-curves-output/);
  assert.match(source, /min="0" max="255" step="1" value="128"/);
  assert.match(source, /data-layer-threshold-reset/);
  assert.match(source, /halftone: \[/);
  assert.match(source, /getAdjustmentControlMarkup\("Angle", 45\)/);
  assert.match(source, /implemented: true/);
  assert.match(source, /data-layer-effects-picker/);
  assert.match(source, /data-layer-effects-detail/);
  assert.match(source, /layer-effects-detail-body/);
  assert.match(source, /data-layer-effects-panel-close/);
  assert.match(source, /data-layer-effects-picker-target/);
  assert.match(source, /data-layer-effects-search/);
  assert.match(source, /data-layer-effect-option/);
  assert.match(source, /openEffectEditor\(option\.dataset\.layerEffectOption\)/);
  assert.match(source, /getEffectEditorsMarkup\(\)/);
  assert.match(source, /data-layer-effects-editor="\$\{effect\.type\}"/);
  assert.match(source, /const isEnabled = Boolean\(definition && isEligible\)/);
  assert.match(source, /!isImplementedEffect\(activeEffectType\)/);
  assert.match(source, /data-layer-effects-accept/);
  assert.match(source, /data-layer-effects-back/);
  assert.match(source, /data-layer-motion-distance-input/);
  assert.match(source, /data-layer-motion-angle-input/);
  assert.match(source, /data-field-blur-pin-list/);
  assert.match(source, /data-field-blur-guide/);
  assert.match(source, /data-field-blur-pin-overlay/);
  assert.match(source, /data-field-blur-pin-input/);
  assert.match(source, /data-field-blur-pin-number/);
  assert.match(source, /field-blur-number brush-studio-setting-value/);
  assert.match(source, /field-blur-number-input brush-studio-setting-value-input/);
  assert.match(source, /function focusFieldBlurPinControl\(pinId\)/);
  assert.match(source, /valueControl = event\.target\?\.closest\?\.\("\[data-field-blur-pin-input\], \[data-field-blur-pin-number\], \.field-blur-number"\)/);
  assert.match(source, /Double-click\/tap canvas: add pin/);
  assert.match(source, /Drag pin: move/);
  assert.match(source, /Triple-click\/tap pin: remove/);
  assert.match(source, /event\.altKey && pinId/);
  assert.match(source, /FIELD_BLUR_TAP_TIMEOUT_MS = 360/);
  assert.match(source, /FIELD_BLUR_TAP_MOVE_TOLERANCE = 12/);
  assert.match(source, /function handleFieldBlurTap\(pinId, point\)/);
  assert.match(source, /if \(pinId && count >= 3\) \{[\s\S]*removeFieldBlurPin\(pinId\)/);
  assert.match(source, /if \(!pinId && count === 2\) \{[\s\S]*addFieldBlurPin\(point\)/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("pointerup", stopFieldBlurDrag\)/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("pointercancel", \(event\) => stopFieldBlurDrag\(event, \{ cancel: true \}\)\)/);
  assert.doesNotMatch(source, /fieldBlurOverlay\.addEventListener\("dblclick"/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("pointermove", handleFieldBlurOverlayPointerMove\)/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("wheel", handleFieldBlurOverlayWheel, \{ passive: false \}\)/);
  assert.match(source, /brushEngine\.handleWheel\(event\)/);
  assert.match(source, /moveFieldBlurPin\(fieldBlurDrag\.pinId, clientToFieldBlurPoint\(event\.clientX, event\.clientY\)\)/);
  assert.match(source, /FIELD_BLUR_PREVIEW_DEBOUNCE_MS = 90/);
  assert.match(source, /clearFieldBlurPreviewTimer\(\)/);
  assert.match(source, /scheduleFieldBlurPreview\(\)/);
  assert.match(source, /window\.setTimeout\(\(\) =>/);
  assert.match(source, /commitFieldBlurPinInput\(input\)/);
  assert.match(source, /event\.key !== "Enter"/);
  assert.match(source, /event\?\.detail\?\.source === "layer-effects-preview"/);
  assert.match(source, /namespace\.setLayerFieldBlurPins/);
  assert.match(source, /source: "layer-effects-preview"/);
  assert.match(source, /activeEffectType === "field-blur"/);
  assert.match(source, /event\.target\.closest\?\.\("\.editor-stage"\)/);
  assert.match(source, /activeEffectType === "field-blur" && !hasActiveFieldBlur/);
  assert.match(source, /data-layer-radial-amount-input/);
  assert.match(source, /data-layer-radial-center-x-input/);
  assert.match(source, /data-layer-radial-center-y-input/);
  assert.match(source, /data-layer-radial-mode-button="spin"/);
  assert.match(source, /data-layer-radial-mode-button="zoom"/);
  assert.match(source, /data-layer-noise-amount-input/);
  assert.match(source, /data-layer-noise-scale-input/);
  assert.match(source, /data-layer-noise-monochrome-input/);
  assert.match(source, /data-layer-grain-amount-input/);
  assert.match(source, /data-layer-grain-scale-input/);
  assert.match(source, /data-layer-grain-monochrome-input/);
  assert.match(source, /data-layer-threshold-input/);
  assert.match(source, /namespace\.setLayerMotionBlur/);
  assert.match(source, /namespace\.setLayerFieldBlurPins/);
  assert.match(source, /namespace\.setLayerRadialBlur/);
  assert.match(source, /namespace\.setLayerNoise/);
  assert.match(source, /namespace\.setLayerGrain/);
  assert.match(source, /namespace\.setLayerThreshold/);
  assert.match(source, /namespace\.setLayerCurves/);
  assert.match(source, /namespace\.rasterizeActiveLayerEffects/);
  assert.match(source, /renderer\.rasterizeLayerEffects\(layer,/);
  assert.match(source, /function restorePreviewSession\(\)/);
  assert.match(source, /function showEffectPicker\(options = \{\}\)/);
  assert.match(source, /function filterEffectMenu\(\)/);
  assert.match(source, /source: "layer-effects-cancel"/);
  assert.match(source, /history: false,\s*source: "layer-effects-preview"/);
  assert.match(source, /closePanel\(\{ cancel: false \}\)/);
  assert.match(source, /closePanel\(\{ cancel: true \}\)/);
  assert.match(topToolbarSource, /hasRasterizableLayerEffects\(activeLayer\)/);
  assert.match(topToolbarSource, /window\.CBO\.rasterizeActiveLayerEffects\?\.\(\)/);
  assert.match(topToolbarSource, /window\.CBO\.rasterizeActiveImageLayer\?\.\(\)/);
  assert.match(topToolbarSource, /RASTERIZE EFFECTS/);
  assert.match(topToolbarSource, /RASTERIZE IMAGE/);
  assert.match(topToolbarSource, /cbo:layer-effects-rasterized/);
  assert.match(topToolbarSource, /cbo:image-layer-rasterized/);
});

test("mobile adjustment layer exposes implemented effects as bottom toolbar panels", () => {
  const indexSource = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(repoRoot, "js", "layer-effects-panel.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(repoRoot, "css", "layer-effects-panel.css"), "utf8");
  const toolbarCss = fs.readFileSync(path.join(repoRoot, "css", "toolbar.css"), "utf8");
  const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

  assert.match(indexSource, /class="tool-button mobile-adjustment-layer-button"[\s\S]*data-tool-mode="adjustments"/);
  assert.match(toolbarCss, /\.mobile-adjustment-layer-button[\s\S]*display: none;/);
  assert.match(toolbarCss, /\.toolbar-dock \.mobile-adjustment-layer-button \{\s*display: inline-flex;/);
  assert.match(source, /function getImplementedEffectItems\(\)/);
  assert.match(source, /effect\.implemented === true && effect\.mobile !== false/);
  assert.match(source, /data-mobile-layer-effects-toolbar/);
  assert.match(source, /data-mobile-layer-effect-trigger="\$\{effect\.type\}"/);
  assert.match(source, /data-mobile-layer-effects-panel/);
  assert.match(source, /data-mobile-layer-effects-editor="gaussian-blur"/);
  assert.match(source, /data-mobile-layer-effects-editor="motion-blur"/);
  assert.match(source, /data-mobile-layer-effects-editor="field-blur"/);
  assert.match(source, /if \(effectType === "field-blur"\) \{[\s\S]*activeEffectType = "field-blur";[\s\S]*activateFieldBlurUi\(\)/);
  assert.match(source, /if \(activeMobileEffectType === "field-blur"\) \{[\s\S]*deactivateFieldBlurUi\(\)/);
  assert.match(source, /data-mobile-layer-effects-editor="radial-blur"/);
  assert.match(source, /data-mobile-layer-effects-editor="noise"/);
  assert.match(source, /data-mobile-layer-effects-editor="grain"/);
  assert.match(source, /data-mobile-layer-effects-editor="threshold"/);
  assert.match(source, /label === "ADJUSTMENT LAYER" \|\| toolMode === "adjustments"/);
  assert.match(source, /showMobileLayerEffectsToolbar\(shouldShow\)/);
  assert.match(source, /toolbarDock\.classList\.toggle\("mobile-layer-effects-active", shouldShow\)/);
  assert.match(source, /function startMobileLayerEffectsSession\(\)/);
  assert.match(source, /function finalizeMobileLayerEffectsSession\(\)/);
  assert.match(source, /namespace\.rasterizeLayerEffects\?\.\(session\.layerId, \{[\s\S]*beforeState: session\.beforeState/);
  assert.match(source, /window\.addEventListener\("cbo:before-history-action", handleMobileLayerEffectsBeforeHistory\)/);
  assert.match(source, /openMobileLayerEffectPanel\(effectButton\.dataset\.mobileLayerEffectTrigger\)/);
  assert.match(source, /namespace\.setLayerGaussianBlurRadius\(layer\.id, value/);
  assert.match(source, /namespace\.setLayerMotionBlur\(/);
  assert.match(source, /namespace\.setLayerFieldBlurPins\(/);
  assert.match(source, /namespace\.setLayerRadialBlur\(/);
  assert.match(source, /namespace\.setLayerNoise\(/);
  assert.match(source, /namespace\.setLayerGrain\(/);
  assert.match(source, /namespace\.setLayerThreshold\(layer\.id, value/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-gaussian-blur"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-motion-blur"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-field-blur"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-radial-blur"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-noise"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-grain"/);
  assert.match(source, /history: false,[\s\S]*source: "mobile-layer-effects-threshold"/);
  assert.match(cssSource, /\.toolbar-dock\.mobile-layer-effects-active \.main-tools-toolbar \{\s*display: none;/);
  assert.match(cssSource, /\.toolbar-dock \.mobile-layer-effects-toolbar:not\(\[hidden\]\) \{\s*display: flex;/);
  assert.match(cssSource, /\.mobile-layer-effects-panel:not\(\[hidden\]\) \{[\s\S]*bottom: 88px;/);
  assert.match(cssSource, /\.field-blur-pin-overlay \{[\s\S]*touch-action: none;/);
  assert.match(cssSource, /\.field-blur-pin \{[\s\S]*width: 56px;[\s\S]*height: 56px;/);
  assert.match(appSource, /"\.mobile-layer-effects-panel"/);
});

test("gaussian blur preview writes bypass document history", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerGaussianBlurRadius(layer.id, 9, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{ type: "gaussian-blur", enabled: true, radius: 9 }]),
  );
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:gaussian-blur-paint-main",
    "draw",
  ]);
});

test("motion blur preview writes bypass document history", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerMotionBlur(layer.id, 24, -45, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{ type: "motion-blur", enabled: true, distance: 24, angle: 315 }]),
  );
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:motion-blur-paint-main",
    "draw",
  ]);
});

test("field blur preview writes bypass document history", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerFieldBlurPins(layer.id, [
    { blur: 260, x: 20, y: 30 },
    { blur: 0, x: 80, y: 90 },
  ], {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{
      type: "field-blur",
      enabled: true,
      pins: [
        { blur: 200, x: 20, y: 30 },
        { blur: 0, x: 80, y: 90 },
      ],
    }]),
  );
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:field-blur-paint-main",
    "draw",
  ]);
});

test("radial blur preview writes bypass document history", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerRadialBlur(layer.id, 32, 120, -5, "zoom", {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{ type: "radial-blur", enabled: true, amount: 32, centerX: 100, centerY: 0, mode: "zoom" }]),
  );
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:radial-blur-paint-main",
    "draw",
  ]);
});

test("grain preview writes bypass document history with a stable seed", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerGrain(layer.id, 18, 42, true, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(layer.effects.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(layer.effects[0]).filter(([key]) => key !== "seed")),
    { type: "grain", enabled: true, amount: 18, scale: 42, monochrome: true },
  );
  assert.equal(Number.isFinite(layer.effects[0].seed), true);
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:grain-paint-main",
    "draw",
  ]);

  const seed = layer.effects[0].seed;

  assert.equal(namespace.setLayerGrain(layer.id, 24, 12, false, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(layer.effects[0].seed, seed);
  assert.equal(layer.effects[0].amount, 24);
  assert.equal(layer.effects[0].scale, 12);
  assert.equal(layer.effects[0].monochrome, false);
});

test("noise preview writes bypass document history with a stable seed", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerNoise(layer.id, 18, 1, true, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(layer.effects.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(layer.effects[0]).filter(([key]) => key !== "seed")),
    { type: "noise", enabled: true, amount: 18, scale: 1, monochrome: true },
  );
  assert.equal(Number.isFinite(layer.effects[0].seed), true);
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:noise-paint-main",
    "draw",
  ]);

  const seed = layer.effects[0].seed;

  assert.equal(namespace.setLayerNoise(layer.id, 24, 120, false, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(layer.effects[0].seed, seed);
  assert.equal(layer.effects[0].amount, 24);
  assert.equal(layer.effects[0].scale, 100);
  assert.equal(layer.effects[0].monochrome, false);
});

test("threshold preview writes bypass document history and clamps level", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerThreshold(layer.id, 300, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{ type: "threshold", enabled: true, threshold: 255 }]),
  );
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:threshold-paint-main",
    "draw",
  ]);

  assert.equal(namespace.setLayerThreshold(layer.id, 128, {
    enabled: false,
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(JSON.stringify(layer.effects), JSON.stringify([]));
});

test("curves preview writes normalized point metadata and removes identity curves", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(namespace.setLayerCurves(layer.id, {
    rgb: [
      { id: "black", x: 0, y: 12, endpoint: true },
      { id: "white", x: 255, y: 242, endpoint: true },
    ],
  }, {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].type, "curves");
  assert.equal(layer.effects[0].points.rgb[0].y, 12);
  assert.equal(layer.effects[0].points.rgb[1].y, 242);
  assert.deepEqual(calls, [
    "update:paint-main:layer-effects-preview:false:curves-paint-main",
    "draw",
  ]);

  assert.equal(namespace.setLayerCurves(layer.id, namespace.CurvesEngine.createDefaultPointsByChannel(), {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(JSON.stringify(layer.effects), JSON.stringify([]));
});

test("blur effect defaults use active layer content center", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const layer = {
    id: "paint-main",
    type: "paint",
  };

  namespace.documentLayerModel = {
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${options.source}:${options.history}:${options.historyGroup}`);
      layer.effects = patch.effects;
      return true;
    },
  };
  namespace.documentRenderer = {
    height: 800,
    width: 1000,
    getRasterContentBounds(id) {
      calls.push(`bounds:${id}`);
      return { height: 100, width: 300, x: 100, y: 200 };
    },
    requestDraw() {
      calls.push("draw");
    },
  };

  assert.equal(JSON.stringify(namespace.getLayerEffectCenterPoint(layer)), JSON.stringify({ x: 250, y: 250 }));
  assert.equal(
    JSON.stringify(namespace.getLayerEffectCenterPercent(layer)),
    JSON.stringify({ centerX: 25, centerY: 31.25 }),
  );
  assert.equal(namespace.setLayerRadialBlur(layer.id, 32, undefined, undefined, "zoom", {
    history: false,
    source: "layer-effects-preview",
  }), true);
  assert.equal(
    JSON.stringify(layer.effects),
    JSON.stringify([{ type: "radial-blur", enabled: true, amount: 32, centerX: 25, centerY: 31.25, mode: "zoom" }]),
  );
  assert.deepEqual(calls, [
    "bounds:paint-main",
    "bounds:paint-main",
    "bounds:paint-main",
    "update:paint-main:layer-effects-preview:false:radial-blur-paint-main",
    "draw",
  ]);
});

test("layer effects rasterizer bakes blur and clears rasterizable metadata", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const beforeSnapshot = { framebuffer: {}, texture: {} };
  const beforeState = {
    activeLayerId: "paint-main",
    entries: [{ id: "paint-main", type: "paint" }],
  };
  const layer = {
    effects: [
      { type: "gaussian-blur", radius: 8, enabled: true },
      { type: "motion-blur", distance: 18, angle: 30, enabled: true },
      { type: "field-blur", pins: [{ blur: 40, x: 120, y: 140 }, { blur: 0, x: 220, y: 240 }], enabled: true },
      { type: "radial-blur", amount: 28, centerX: 40, centerY: 60, mode: "zoom", enabled: true },
      { type: "noise", amount: 20, scale: 1, monochrome: false, seed: 44.2, enabled: true },
      { type: "grain", amount: 18, scale: 42, monochrome: true, seed: 12.5, enabled: true },
      { type: "threshold", threshold: 128, enabled: true },
      { type: "curves", points: { rgb: [{ id: "black", x: 0, y: 20 }, { id: "white", x: 255, y: 240 }] }, enabled: true },
      { strength: 0.5, type: "future-effect" },
    ],
    id: "paint-main",
    type: "paint",
  };
  const layerModel = {
    activeLayerId: layer.id,
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch, options = {}) {
      calls.push(`update:${id}:${patch.effects.length}:${options.source}:${options.history}`);
      layer.effects = patch.effects.length > 0 ? patch.effects : undefined;
      return true;
    },
  };
  const history = {
    flushLayerState(model) {
      calls.push(`flush:${model === layerModel}`);
    },
    getLayerSnapshot() {
      calls.push(`snapshot:${Array.isArray(layer.effects) ? layer.effects.length : 0}`);
      return {
        activeLayerId: layer.id,
        entries: [{ ...layer, effects: layer.effects ? [...layer.effects] : undefined }],
      };
    },
    push(entry) {
      calls.push(`push:${entry.source}`);
      this.entry = entry;
      return true;
    },
  };
  const renderer = {
    emitContentChange(detail = {}) {
      calls.push(`content:${detail.source}:${detail.layerId}`);
    },
    rasterizeLayerEffects(inputLayer, options = {}) {
      calls.push(`bake:${inputLayer.id}:${inputLayer.effects.map((effect) => effect.type).join(",")}:${options.emit}:${options.captureAfterSnapshot}`);
      return {
        beforeSnapshot,
        layerId: inputLayer.id,
      };
    },
    requestDraw() {
      calls.push("draw");
    },
  };

  namespace.documentHistory = history;
  namespace.documentLayerModel = layerModel;
  namespace.documentRenderer = renderer;

  assert.equal(namespace.rasterizeActiveLayerEffects({ beforeState }), true);
  assert.deepEqual(layer.effects, [{ strength: 0.5, type: "future-effect" }]);
  assert.equal(history.entry.beforeSnapshot, beforeSnapshot);
  assert.equal("afterSnapshot" in history.entry, false);
  assert.deepEqual(history.entry.beforeEntries, beforeState.entries);
  assert.deepEqual(calls, [
    "flush:true",
    "bake:paint-main:gaussian-blur,motion-blur,field-blur,radial-blur,noise,grain,threshold,curves,future-effect:false:false",
    "update:paint-main:1:layer-effects-rasterize:false",
    "snapshot:1",
    "push:layer-effects-rasterize",
    "content:layer-effects-rasterize:paint-main",
    "draw",
  ]);
});

test("layer effects rasterizer turns image layers into paint layers", () => {
  const namespace = loadLayerEffectsNamespace();
  const beforeSnapshot = { framebuffer: {}, texture: {} };
  const snapshots = { beforeSnapshot, layerId: "image-1" };
  const beforeState = {
    activeLayerId: "image-1",
    entries: [{ id: "image-1", type: "image" }],
  };
  const layer = {
    effects: [{ type: "gaussian-blur", radius: 8, enabled: true }],
    id: "image-1",
    type: "image",
  };
  const layerModel = {
    activeLayerId: layer.id,
    findEntryById(id) {
      return id === layer.id ? layer : null;
    },
    updateLayer(id, patch) {
      layer.effects = patch.effects.length > 0 ? patch.effects : undefined;
      layer.type = patch.type || layer.type;
      return true;
    },
  };
  const history = {
    flushLayerState() {},
    getLayerSnapshot() {
      return {
        activeLayerId: layer.id,
        entries: [{ ...layer }],
      };
    },
    push(entry) {
      this.entry = entry;
      return true;
    },
  };
  const retileCalls = [];

  namespace.documentHistory = history;
  namespace.documentLayerModel = layerModel;
  namespace.documentRenderer = {
    emitContentChange() {},
    isSparseRasterTarget(target) {
      return target?.sparse === true;
    },
    rasterizeLayerEffects() {
      return snapshots;
    },
    sparsifyRasterizedImageLayer(layerId, options = {}) {
      retileCalls.push({
        emit: options.emit,
        layerId,
        source: options.source,
      });
      return { sparse: true };
    },
    requestDraw() {},
  };

  assert.equal(namespace.rasterizeActiveLayerEffects({ beforeState }), true);
  assert.equal(layer.type, "paint");
  assert.equal(history.entry.beforeEntries[0].type, "image");
  assert.equal(history.entry.afterEntries[0].type, "paint");
  assert.equal(snapshots.afterPreferSparse, true);
  assert.deepEqual(retileCalls, [{
    emit: false,
    layerId: "image-1",
    source: "layer-effects-rasterize-retile",
  }]);
});

test("layer effects rasterize history recomputes redo without an after snapshot", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const beforeSnapshot = { texture: {} };
  const beforeState = {
    activeLayerId: "paint-main",
    entries: [{
      id: "paint-main",
      type: "paint",
    }],
  };
  const afterState = {
    activeLayerId: "paint-main",
    entries: [{
      id: "paint-main",
      type: "paint",
    }],
  };
  let activeEntries = afterState.entries.map((entry) => ({ ...entry }));
  const layerModel = {
    findEntryById(id) {
      return activeEntries.find((entry) => entry.id === id) || null;
    },
  };
  const history = {
    restoreLayerState(model, snapshot, options = {}) {
      calls.push(`state:${options.source}:${snapshot.entries[0].effects ? "effects" : "baked"}`);
      activeEntries = snapshot.entries.map((entry) => {
        const nextEntry = { ...entry };

        if (entry.effects) {
          nextEntry.effects = entry.effects.map((effect) => ({ ...effect }));
        }

        return nextEntry;
      });
      return model === layerModel;
    },
  };
  const renderer = {
    deleteRasterSnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      calls.push(`delete:${snapshot === beforeSnapshot ? "before" : "other"}`);
    },
    rasterizeLayerEffects(layer, options = {}) {
      calls.push(`redo-bake:${layer.effects[0].type}:${options.captureBeforeSnapshot}:${options.captureAfterSnapshot}`);
      return { layerId: layer.id };
    },
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(`pixels:${options.source}:${layerId}:${snapshot === beforeSnapshot}`);
      return true;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createLayerEffectsRasterizeHistoryEntry({
    afterState,
    beforeSnapshot,
    beforeState,
    history,
    layerId: "paint-main",
    layerModel,
    renderer,
    rasterizeEffects: [{ type: "gaussian-blur", radius: 8, enabled: true }],
  });

  assert.equal(entry.afterSnapshot, undefined);
  assert.equal(entry.redo(), true);
  assert.deepEqual(activeEntries, afterState.entries);
  assert.deepEqual(calls, [
    "state:history-redo-layer-effects-rasterize-prepare:baked",
    "pixels:history-redo-layer-effects-rasterize-prepare:paint-main:true",
    "redo-bake:gaussian-blur:false:false",
    "state:history-redo-layer-effects-rasterize:baked",
    "draw",
  ]);

  entry.destroy();
  assert.equal(calls.at(-1), "delete:before");
});
