const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadLayerEffectsNamespace() {
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
    Number,
    Object,
    String,
    window,
  });

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
  assert.match(cssSource, /\.field-blur-guide[\s\S]*?font-style: italic;/);
});

test("layer effects panel writes gaussian blur as layer-state metadata", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layer-effects-panel.js"), "utf8");
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");

  assert.match(source, /type: "gaussian-blur"/);
  assert.match(source, /\{ implemented: true, icon: "motion", label: "Motion Blur", type: "motion-blur" \}/);
  assert.match(source, /\{ implemented: true, icon: "field", label: "Field Blur", type: "field-blur" \}/);
  assert.match(source, /\{ implemented: true, icon: "radial", label: "Radial Blur", type: "radial-blur" \}/);
  assert.match(source, /radius: nextRadius/);
  assert.match(source, /distance: nextDistance/);
  assert.match(source, /angle: nextAngle/);
  assert.match(source, /amount: nextAmount/);
  assert.match(source, /pins: nextPins/);
  assert.match(source, /centerX: normalizePercent\(centerX\)/);
  assert.match(source, /centerY: normalizePercent\(centerY\)/);
  assert.match(source, /mode: normalizeRadialBlurMode\(mode\)/);
  assert.match(source, /layerModel\.updateLayer\(layerId,/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `gaussian-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `motion-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `field-blur-\$\{layerId\}`/);
  assert.match(source, /historyGroup: updateOptionsSource\.historyGroup \|\| `radial-blur-\$\{layerId\}`/);
  assert.match(source, /namespace\.documentRenderer\?\.requestDraw\?\.\(\)/);
  assert.match(source, /layer\.type !== "background"/);
  assert.match(source, /EFFECT_GROUPS/);
  assert.match(source, /label: "Curves"/);
  assert.match(source, /label: "Noise"/);
  assert.match(source, /label: "Bloom"/);
  assert.match(source, /label: "Threshold"/);
  assert.match(source, /label: "Halftone"/);
  assert.match(source, /threshold: \[/);
  assert.match(source, /getAdjustmentControlMarkup\("Level", 50\)/);
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
  assert.match(source, /Double-click canvas: add pin/);
  assert.match(source, /Drag pin: move/);
  assert.match(source, /Alt-click pin: remove/);
  assert.match(source, /event\.altKey && pinId/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("dblclick", handleFieldBlurOverlayDoubleClick\)/);
  assert.match(source, /fieldBlurOverlay\.addEventListener\("pointermove", handleFieldBlurOverlayPointerMove\)/);
  assert.match(source, /moveFieldBlurPin\(fieldBlurDrag\.pinId, clientToFieldBlurPoint\(event\.clientX, event\.clientY\)\)/);
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
  assert.match(source, /namespace\.setLayerMotionBlur/);
  assert.match(source, /namespace\.setLayerFieldBlurPins/);
  assert.match(source, /namespace\.setLayerRadialBlur/);
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
  assert.match(topToolbarSource, /RASTERIZE EFFECTS/);
  assert.match(topToolbarSource, /cbo:layer-effects-rasterized/);
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

test("layer effects rasterizer bakes blur and clears rasterizable metadata", () => {
  const namespace = loadLayerEffectsNamespace();
  const calls = [];
  const beforeSnapshot = { framebuffer: {}, texture: {} };
  const afterSnapshot = { framebuffer: {}, texture: {} };
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
      calls.push(`bake:${inputLayer.id}:${inputLayer.effects.map((effect) => effect.type).join(",")}:${options.emit}`);
      return {
        afterSnapshot,
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
  assert.equal(history.entry.afterSnapshot, afterSnapshot);
  assert.deepEqual(history.entry.beforeEntries, beforeState.entries);
  assert.deepEqual(calls, [
    "flush:true",
    "bake:paint-main:gaussian-blur,motion-blur,field-blur,radial-blur,future-effect:false",
    "update:paint-main:1:layer-effects-rasterize:false",
    "snapshot:1",
    "push:layer-effects-rasterize",
    "content:layer-effects-rasterize:paint-main",
    "draw",
  ]);
});
