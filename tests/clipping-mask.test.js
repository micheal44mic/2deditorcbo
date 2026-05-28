const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

const documentRendererModulePaths = [
  ["js", "document", "document-renderer-shaders.js"],
  ["js", "document", "document-renderer-raster-targets.js"],
  ["js", "document", "document-renderer-history-snapshots.js"],
  ["js", "document", "document-renderer-webgl-programs.js"],
  ["js", "document", "document-renderer-viewport-culling.js"],
  ["js", "document", "document-renderer-layer-effects.js"],
  ["js", "document", "document-renderer-compositing.js"],
  ["js", "document", "document-renderer.js"],
];

function readDocumentRendererSources() {
  return documentRendererModulePaths.map((parts) => readRepoFile(...parts)).join("\n");
}

function loadDocumentLayerModel() {
  const source = readRepoFile("js", "document", "document-layer-model.js");
  const window = {
    CBO: {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Event,
    EventTarget,
    Number,
    Object,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO.DocumentLayerModel;
}

test("document layer model preserves clipping mask metadata", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      { id: "paint-clipped", name: "Texture", type: "paint", clippingMask: true },
      { id: "paint-base", name: "Base", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  assert.equal(model.findEntryById("paint-clipped").clippingMask, true);
  assert.equal(model.findEntryById("paint-base").clippingMask, false);
  assert.equal(model.getEntries()[0].clippingMask, true);

  model.setEntries(model.getEntries(), { history: false, source: "test-clipping-mask-preserve" });

  assert.equal(model.findEntryById("paint-clipped").clippingMask, true);
});

test("layers panel exposes clipping mask context action and row indicator", () => {
  const source = readRepoFile("js", "layers-panel.js");
  const cssSource = readRepoFile("css", "layers-panel.css");

  assert.match(source, /data-layer-context-action="clipping-mask"/);
  assert.match(source, /CREATE CLIPPING MASK/);
  assert.match(source, /RELEASE CLIPPING MASK/);
  assert.match(source, /function isClippingMaskAllowed\(layerId\)/);
  assert.match(source, /function toggleClippingMask\(layerId\)/);
  assert.match(source, /clippingMask: shouldClip/);
  assert.match(source, /source: "layers-panel-clipping-mask"/);
  assert.doesNotMatch(source, /historyGroup: `clipping-mask-\$\{layerId\}`/);
  assert.match(source, /getClippingMaskIndicator\(\)/);
  assert.match(source, /classList\.toggle\("clipping-mask", isClipping\)/);
  assert.match(source, /updateLayerDescription\(layerRow\)/);
  assert.match(cssSource, /\.layer-clipping-indicator/);
  assert.match(cssSource, /\.layer-row\.clipping-mask \.layer-clipping-indicator/);
});

test("document renderer composites clipping masks from the layer below", () => {
  const source = readDocumentRendererSources();
  const canUsePreviewCacheBody = source.match(/const canUsePreviewCache = Boolean\(([\s\S]*?)\n      \);/)?.[1] || "";

  assert.match(source, /uniform sampler2D u_clipTexture;/);
  assert.match(source, /uniform float u_clipMode;/);
  assert.match(source, /uniform vec2 u_drawOrigin;/);
  assert.match(source, /sampleClipAlpha\(globalDocPixel\)/);
  assert.match(source, /getOrderedLayersBottomToTop\(\)/);
  assert.match(source, /const orderedLayers = this\.getOrderedLayersBottomToTop\(\)/);
  assert.match(source, /const hasClippingMasks = orderedLayers\.some\(\(layer\) => layer\?\.clippingMask === true\)/);
  assert.doesNotMatch(canUsePreviewCacheBody, /!hasClippingMasks/);
  assert.doesNotMatch(source, /hasClippingMasksInLayerStack/);
  assert.doesNotMatch(source, /disablePreviewCacheForClippingMasks/);
  assert.match(source, /const activeStrokeUsesClippingMask = Boolean/);
  assert.match(source, /const needsClipBaseTexture = \(layer\) => Boolean/);
  assert.match(source, /pendingClipBaseLayer\?\.id && needsClipBaseTexture\(pendingClipBaseLayer\)/);
  assert.match(source, /const activeStrokeIsClipBaseLayer = Boolean/);
  assert.match(source, /let currentClipBase = null/);
  assert.match(source, /const clipBase = isClippingLayer \? currentClipBase : null/);
  assert.match(source, /isValidClipBaseLayer\(layer\)/);
  assert.match(source, /createClipBaseForLayer\(layer, target, visible = true, options = \{\}\)/);
  assert.match(source, /getClipBaseOrigin\(clipBase\)/);
  assert.match(source, /forceSingleTexture: Boolean\(eraserMaskTexture \|\| isClippingLayer\)/);
  assert.match(source, /source: isClippingLayer \? "canvas-clipping-layer" : "canvas-sparse-layer"/);
  assert.match(source, /shouldRebindArtboardAfterTargetResolve/);
  assert.match(source, /bindArtboardProgram\(\);/);
  assert.match(source, /for \(const renderResult of this\.getLayerRenderResults\(layer, renderTarget, viewportLayerRenderOptions\)\)/);
  assert.match(source, /const layerRect = this\.getArtboardDragVisualRect\(layer, renderResult\?\.rect \|\| null, renderTarget\)/);
  assert.match(source, /drawBlendTexture\(layerTexture, opacity, layerRect, clipBase, blendModeId\)/);
  assert.match(source, /drawBlendTexture\(\s*options\.activeStrokeTexture,\s*opacity,\s*activeStrokeRect,\s*clipBase,/);
  assert.match(source, /drawTexture\(texture, opacity, rect, clipBase\)/);
  assert.match(source, /drawBlendTexture\(layerTexture, opacity, (?:this\.getLayerBlendModeId\(layer\)|blendModeId), renderResult\.rect, clipBase\)/);
  assert.match(source, /source: isClippingLayer \? "preview-cache-clipping-layer" : "preview-cache-sparse-layer"/);
  assert.match(source, /source: "preview-cache-clip-base"/);
  assert.match(source, /currentClipBase = this\.createClipBaseForLayer\(layer, mergedTarget, layer\.visible !== false, \{[\s\S]*transformPreview: transformPreviewForClipBase/);
});

test("document renderer treats image upload metadata as visual for clipping masks", () => {
  const source = readDocumentRendererSources();
  const nonVisualBody = source.match(/const nonVisualSources = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";

  assert.doesNotMatch(nonVisualBody, /"image-upload-metadata"/);
  assert.match(source, /forceVisualSources/);
  assert.match(source, /"image-upload-metadata"/);
  assert.match(source, /"layers-panel-clipping-mask"/);
  assert.match(source, /source === "layers-panel-clipping-mask"[\s\S]*this\.deletePreviewCache\(\)/);
  assert.match(source, /hasLayerPendingRasterContent/);
  assert.match(source, /hasLayerRenderableOrPendingRasterContent/);
});

test("document renderer samples transform preview clipping bases without scratch targets", () => {
  const source = readDocumentRendererSources();

  assert.match(source, /uniform mat3 u_clipDestToSourceUv;/);
  assert.match(source, /uniform vec4 u_clipSourceUvRect;/);
  assert.match(source, /float sampleClipAlpha\(vec2 documentPixel\)/);
  assert.match(source, /u_clipMode > 1\.5/);
  assert.match(source, /getClipBaseTransformSampling\(clipBase\)/);
  assert.match(source, /hasClipBaseSamplingTexture\(clipBase\)/);
  assert.match(source, /setClipBaseUniforms\(uniforms, clipBase = null, options = \{\}\)/);
  assert.match(source, /transformPreview: options\.transformPreview \|\| null/);
  assert.match(source, /transformPreview: transformPreviewForClipBase/);
  assert.match(source, /drawRasterTransformPreview\(opacity, clipBase, (?:this\.getLayerBlendModeId\(layer\)|blendModeId)\)/);
  assert.match(source, /options\.clipBase/);
  assert.doesNotMatch(source, /visualClipBaseTarget/);
});
