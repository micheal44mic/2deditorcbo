const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentLayerModel() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-layer-model.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    EventTarget,
    Number,
    Object,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO.DocumentLayerModel;
}

function layerIds(layers) {
  return Array.from(layers, (layer) => layer.id);
}

test("vector text participates in the same bottom-to-top render order as raster layers", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      { id: "image-top", name: "Image Top", type: "image" },
      { id: "text-middle", name: "Text Middle", type: "vector-text", text: "Behind image" },
      { id: "paint-bottom", name: "Paint Bottom", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  assert.deepEqual(
    layerIds(model.getRenderableLayers()),
    ["background", "paint-bottom", "text-middle", "image-top"],
  );
});

test("moving vector text above an image changes only ordering, not layer type", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      { id: "text-top", name: "Text Top", type: "vector-text", text: "Above image" },
      { id: "image-middle", name: "Image Middle", type: "image" },
      { id: "paint-bottom", name: "Paint Bottom", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });
  const renderable = model.getRenderableLayers();

  assert.deepEqual(
    layerIds(renderable),
    ["background", "paint-bottom", "image-middle", "text-top"],
  );
  assert.equal(renderable.at(-1).type, "vector-text");
});

test("hidden parent groups remove cached vector text from the renderable stack", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      {
        id: "hidden-group",
        name: "Hidden Group",
        type: "group",
        visible: false,
        children: [
          { id: "hidden-text", name: "Hidden Text", type: "vector-text", text: "Hidden" },
        ],
      },
      { id: "paint-main", name: "Paint", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  assert.deepEqual(
    layerIds(model.getRenderableLayers()),
    ["background", "paint-main"],
  );
});

test("vector text renderer caches visual text into the matching WebGL layer target", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /syncTextLayerRaster\(layer, pathData, pathBounds\)/);
  assert.match(source, /renderer\.getRasterTarget\(layer\.id\)/);
  assert.match(source, /rasterizer\.placeRasterImage\(image,/);
  assert.match(source, /layerId: layer\.id/);
  assert.match(source, /getTextLayerRasterBox\(layer, pathBounds, size\)/);
  assert.match(source, /x: rasterBox\.x/);
  assert.match(source, /y: rasterBox\.y/);
  assert.doesNotMatch(source, /type:\s*"paint"[\s\S]{0,120}vector-text-cache/);
});

test("the SVG overlay no longer paints text above the composited document", () => {
  const css = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(
    css,
    /\.editor-vector-overlay \.editor-vector-solid-shadow,\s*\.editor-vector-overlay \.editor-vector-text-paint\s*\{[\s\S]*?opacity:\s*0;/,
  );
});

test("active text rasterization is debounced so drag and sliders stay responsive", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const dragMoveBody = source.match(/handleDragMove\(event\) \{([\s\S]*?)\n    handleDragEnd\(event\)/)?.[1] || "";

  assert.match(source, /ACTIVE_TEXT_RASTER_DEBOUNCE_MS/);
  assert.match(source, /queueTextLayerRasterSync\(layer, pathData, size, rasterBox, signature, delay\)/);
  assert.doesNotMatch(dragMoveBody, /scheduleContentRender\(\)/);
});

test("manual vector text rasterization uses the cropped renderer asset when available", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(source, /createRasterTextAsset\?\.\(layer, \{ size \}\)/);
  assert.match(source, /x: rasterSource\.rasterBox\.x/);
  assert.match(source, /y: rasterSource\.rasterBox\.y/);
  assert.doesNotMatch(source, /rasterizer\.placeRasterImage\(canvas,[\s\S]{0,120}x:\s*0,[\s\S]{0,80}y:\s*0/);
});

test("solid 3D text shadow uses a continuous extrusion instead of stamped copies", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const solidShadowBody = source.match(/appendSolidShadow\(group, layer, pathData, options = \{\}\) \{([\s\S]*?)\n    handlePointerDown\(event\)/)?.[1] || "";

  assert.match(source, /let solidShadowCacheKey = "";/);
  assert.match(source, /createSolidShadowExtrusionPathData\(pathData, offsetX, offsetY\)/);
  assert.match(source, /addCubicPatch\(current, controlA, controlB, next\)/);
  assert.match(source, /addQuadraticPatch\(current, control, next\)/);
  assert.match(source, /editor-vector-solid-shadow-extrusion/);
  assert.match(source, /editor-vector-solid-shadow-backface/);
  assert.match(solidShadowBody, /opacity: String\(opacity\)/);
  assert.match(solidShadowBody, /colorWithOpacity\(shadow\.color \|\| "#000000", 1\)/);
  assert.match(solidShadowBody, /"stroke-linecap": "round"/);
  assert.match(solidShadowBody, /"stroke-width": 1/);
  assert.doesNotMatch(solidShadowBody, /for \(let index = steps/);
  assert.doesNotMatch(source, /createContoursFromPathData/);
  assert.doesNotMatch(source, /tokenizePathData/);
});
