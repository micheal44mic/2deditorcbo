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

function loadVectorTextRasterizerNamespace() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    CSS: {
      escape(value) {
        return String(value);
      },
    },
  };
  const context = vm.createContext({
    Error,
    Object,
    String,
    console,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO;
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
  assert.match(source, /renderer\.rasterTargetsByLayerId\?\.get\?\.?\(layer\.id\)/);
  assert.match(source, /cached\?\.signature === signature && \(!rasterBox \|\| hasRasterTarget\)/);
  assert.match(source, /x: rasterBox\.x/);
  assert.match(source, /y: rasterBox\.y/);
  assert.match(source, /renderer\.invalidatePreviewCache\?\.\("vector-text-cache"\)/);
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

test("continuous text sidebar controls pass stable history groups", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");

  assert.match(source, /function getTextHistoryOptions\(suffix\)/);
  assert.match(source, /function patchActiveTextLayer\(patch, source = "text-sidebar", historyOptions = \{\}\)/);
  assert.match(source, /bindTextHistoryGroup\(textContentInput, "content"\)/);
  assert.match(source, /bindTextHistoryGroup\(textFontSizeInput, "font-size"\)/);
  assert.match(source, /getTextHistoryOptions\("content"\)/);
  assert.match(source, /getTextHistoryOptions\("transform-amount"\)/);
});

test("selected live text layer stays editable outside the text toolbar tool", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const css = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(source, /syncOverlayInteractivity\(\)/);
  assert.match(source, /active-text-layer-selected/);
  assert.match(source, /this\.isTextToolActive\(\) && !this\.getActiveTextLayer\(\)/);
  assert.match(
    css,
    /\.editor-vector-overlay\.text-tool-active,\s*\.editor-vector-overlay\.active-text-layer-selected\s*\{[\s\S]*?pointer-events:\s*auto;/,
  );
});

test("vector text drag and envelope edits use document history groups", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /vector-text-create-\$\{layer\.id\}/);
  assert.match(source, /namespace\.documentHistory\?\.beginGroup\?\.?\(historyGroup\)/);
  assert.match(source, /text-drag-\$\{layerId\}/);
  assert.match(source, /text-envelope-\$\{layerId\}-\$\{nodeId\}/);
  assert.match(source, /historyGroup: this\.envelopeDragState\.historyGroup/);
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

test("text rasterization uses a document-scale drop shadow filter region", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const filterBody = source.match(/createDropShadowFilter\(layer, options = \{\}\) \{([\s\S]*?)\n    createTextLayerNode/)?.[1] || "";

  assert.match(filterBody, /options\.ignoreInteraction === true/);
  assert.match(filterBody, /filterUnits: "userSpaceOnUse"/);
  assert.match(filterBody, /size\.width \* 3 \+ pad \* 2/);
  assert.match(filterBody, /size\.height \* 3 \+ pad \* 2/);
});

test("manual vector text rasterization records one custom entry for layer and pixel state", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(source, /function createRasterizeHistoryEntry\(options = \{\}\)/);
  assert.match(source, /type:\s*"custom"/);
  assert.match(source, /beforeEntries:\s*before\.entries/);
  assert.match(source, /afterEntries:\s*after\.entries/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(target, rasterSource\.rasterBox, "vector-text-rasterize"\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\?\.\(rasterLayerId, rasterSnapshot,/);
  assert.match(source, /renderer\.deleteRasterSnapshot\?\.\(rasterSnapshot\)/);
  assert.match(source, /layerModel\.setEntries\(entries, \{ history: false, source: "vector-text-rasterize" \}\)/);
  assert.match(source, /layerModel\.setActiveLayer\(rasterLayer\.id, \{ history: false, source: "vector-text-rasterize" \}\)/);
});

test("vector text rasterize history entry restores pixels and releases GPU snapshots", () => {
  const namespace = loadVectorTextRasterizerNamespace();
  const calls = [];
  const layerModel = {};
  const beforeState = {
    activeLayerId: "text-1",
    entries: [{ id: "text-1", type: "vector-text" }],
  };
  const afterState = {
    activeLayerId: "raster-1",
    entries: [{ id: "raster-1", type: "paint" }],
  };
  const rasterSnapshot = { framebuffer: {}, texture: {} };
  const history = {
    restoreLayerState(_layerModel, state, options = {}) {
      calls.push(`restore:${state.activeLayerId}:${options.source}`);
      return true;
    },
  };
  const renderer = {
    clearLayer(layerId, options = {}) {
      calls.push(`clear:${layerId}:${options.emit}`);
      return true;
    },
    deleteRasterSnapshot(snapshot) {
      calls.push(`deleteSnapshot:${snapshot === rasterSnapshot}`);
    },
    deleteRasterTarget(layerId, options = {}) {
      calls.push(`deleteTarget:${layerId}:${options.emit}`);
      return true;
    },
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(`restorePixels:${layerId}:${snapshot === rasterSnapshot}:${options.source}`);
      return true;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createVectorTextRasterizeHistoryEntry({
    afterState,
    beforeState,
    history,
    layerModel,
    rasterLayer: { id: "raster-1" },
    rasterSnapshot,
    requiresRasterSnapshot: true,
    renderer,
  });

  assert.equal(entry.undo(), true);
  assert.equal(entry.redo(), true);
  entry.destroy();

  assert.deepEqual(calls, [
    "restore:text-1:history-undo-vector-text-rasterize",
    "deleteTarget:raster-1:false",
    "draw",
    "restore:raster-1:history-redo-vector-text-rasterize",
    "clear:raster-1:false",
    "restorePixels:raster-1:true:history-redo-vector-text-rasterize",
    "draw",
    "deleteSnapshot:true",
  ]);
});

test("vector text rasterize redo rolls back the layer model if pixel restore fails", () => {
  const namespace = loadVectorTextRasterizerNamespace();
  const calls = [];
  const layerModel = {};
  const beforeState = {
    activeLayerId: "text-rollback",
    entries: [{ id: "text-rollback", type: "vector-text" }],
  };
  const afterState = {
    activeLayerId: "raster-rollback",
    entries: [{ id: "raster-rollback", type: "paint" }],
  };
  const history = {
    restoreLayerState(_layerModel, state, options = {}) {
      calls.push(`restore:${state.activeLayerId}:${options.source}`);
      return true;
    },
  };
  const renderer = {
    clearLayer(layerId, options = {}) {
      calls.push(`clear:${layerId}:${options.emit}`);
      return true;
    },
    deleteRasterSnapshot() {},
    deleteRasterTarget(layerId, options = {}) {
      calls.push(`deleteTarget:${layerId}:${options.emit}`);
      return true;
    },
    restoreRasterSnapshot(layerId) {
      calls.push(`restorePixels:${layerId}:false`);
      return false;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createVectorTextRasterizeHistoryEntry({
    afterState,
    beforeState,
    history,
    layerModel,
    rasterLayer: { id: "raster-rollback" },
    rasterSnapshot: { framebuffer: {}, texture: {} },
    requiresRasterSnapshot: true,
    renderer,
  });

  assert.equal(entry.redo(), false);
  assert.deepEqual(calls, [
    "restore:raster-rollback:history-redo-vector-text-rasterize",
    "clear:raster-rollback:false",
    "restorePixels:raster-rollback:false",
    "restore:text-rollback:history-redo-vector-text-rasterize-rollback",
    "deleteTarget:raster-rollback:false",
    "draw",
  ]);
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
