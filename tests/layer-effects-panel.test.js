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

  assert.match(indexSource, /<link rel="stylesheet" href="\.\/css\/layer-effects-panel\.css" \/>/);
  assert.match(
    indexSource,
    /<script src="\.\/js\/vertical-toolbar\.js"><\/script>\s*<script src="\.\/js\/layer-effects-panel\.js"><\/script>/,
  );
  assert.match(appSource, /window\.CBO\.initVerticalToolbar\(\);\s*window\.CBO\.initLayerEffectsPanel\?\.\(\);/);
});

test("layer effects panel writes gaussian blur as layer-state metadata", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layer-effects-panel.js"), "utf8");
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");

  assert.match(source, /type: "gaussian-blur"/);
  assert.match(source, /radius: nextRadius/);
  assert.match(source, /layerModel\.updateLayer\(layerId,/);
  assert.match(source, /historyGroup: options\.historyGroup \|\| `gaussian-blur-\$\{layerId\}`/);
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

test("layer effects rasterizer bakes blur and clears only gaussian blur metadata", () => {
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
      calls.push(`bake:${inputLayer.id}:${inputLayer.effects[0].radius}:${options.emit}`);
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
    "bake:paint-main:8:false",
    "update:paint-main:1:layer-effects-rasterize:false",
    "snapshot:1",
    "push:layer-effects-rasterize",
    "content:layer-effects-rasterize:paint-main",
    "draw",
  ]);
});
