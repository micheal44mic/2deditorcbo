const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentRenderer() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    addEventListener() {},
    dispatchEvent() {},
    matchMedia: () => ({ matches: false }),
    removeEventListener() {},
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
    HTMLCanvasElement: class HTMLCanvasElement {},
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    navigator: { maxTouchPoints: 0, userAgent: "" },
    window,
  });

  vm.runInContext(source, context);

  return {
    DocumentRenderer: context.window.CBO.DocumentRenderer,
    window: context.window,
  };
}

test("pruneOrphanRasterTargets keeps current and history-referenced raster targets", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const mainTexture = {};
  const deleted = [];

  window.CBO.documentHistory = {
    redoStack: [
      {
        beforeEntries: [{ id: "history-before" }],
      },
    ],
    undoStack: [
      { layerId: "pixel-history" },
      {
        afterEntries: [
          {
            id: "group-history",
            children: [{ id: "nested-history" }],
          },
        ],
      },
    ],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    getEntries: () => [
      { id: "paint-main" },
      { id: "current-image" },
      {
        id: "current-group",
        children: [{ id: "current-child" }],
      },
    ],
  };
  renderer.paintLayerId = "paint-main";
  renderer.texture = mainTexture;
  renderer.rasterTargetsByLayerId = new Map([
    ["paint-main", { texture: mainTexture }],
    ["background", { texture: {} }],
    ["current-image", { texture: {} }],
    ["current-child", { texture: {} }],
    ["pixel-history", { texture: {} }],
    ["history-before", { texture: {} }],
    ["nested-history", { texture: {} }],
    ["orphan", { texture: {} }],
  ]);
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["orphan"]);
  assert.equal(renderer.rasterTargetsByLayerId.has("pixel-history"), true);
  assert.equal(renderer.rasterTargetsByLayerId.has("history-before"), true);
  assert.equal(renderer.rasterTargetsByLayerId.has("nested-history"), true);
});

test("pruneOrphanRasterTargets reports deleted undoable layer targets as history GPU", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const activeTexture = {};
  const historyTexture = {};
  const metadataUpdates = [];
  const deleted = [];

  window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [
      {
        beforeEntries: [{ id: "deleted-layer", type: "paint" }],
      },
    ],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    activeLayerId: "active-layer",
    findEntryById: (layerId) => {
      if (layerId === "active-layer") {
        return { id: "active-layer", type: "paint" };
      }

      return null;
    },
    flattenTopToBottom: () => [{ id: "active-layer", type: "paint" }],
    getEntries: () => [{ id: "active-layer", type: "paint" }],
  };
  renderer.paintLayerId = "deleted-layer";
  renderer.texture = historyTexture;
  renderer.framebuffer = {};
  renderer.rasterTargetsByLayerId = new Map([
    ["active-layer", { framebuffer: {}, texture: activeTexture }],
    ["deleted-layer", { framebuffer: {}, texture: historyTexture }],
    ["orphan", { framebuffer: {}, texture: {} }],
  ]);
  renderer.updateRasterTargetResourceMetadata = (target, metadata = {}) => {
    metadataUpdates.push({ layerId: metadata.layerId, metadata, target });
    return target;
  };
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["orphan"]);
  assert.equal(renderer.paintLayerId, "active-layer");
  assert.equal(renderer.texture, activeTexture);

  const activeUpdate = metadataUpdates.find((update) => update.layerId === "active-layer");
  const historyUpdate = metadataUpdates.find((update) => update.layerId === "deleted-layer");

  assert.equal(activeUpdate.metadata.ownerType, "live");
  assert.equal(historyUpdate.metadata.ownerType, "historyGpu");
  assert.equal(historyUpdate.metadata.kind, "historyLayerTarget");
  assert.equal(historyUpdate.metadata.purgeable, true);
  assert.equal(historyUpdate.metadata.reason, "history-retained-layer-target");
});

test("pruneOrphanRasterTargets releases stale paint targets after history is cleared", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const activeTexture = {};
  const staleTexture = {};
  const deleted = [];

  window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    activeLayerId: "active-layer",
    findEntryById: (layerId) => {
      if (layerId === "active-layer") {
        return { id: "active-layer", type: "paint" };
      }

      return null;
    },
    flattenTopToBottom: () => [{ id: "active-layer", type: "paint" }],
    getEntries: () => [{ id: "active-layer", type: "paint" }],
  };
  renderer.paintLayerId = "deleted-layer";
  renderer.texture = staleTexture;
  renderer.framebuffer = {};
  renderer.rasterTargetsByLayerId = new Map([
    ["active-layer", { framebuffer: {}, texture: activeTexture }],
    ["deleted-layer", { framebuffer: {}, texture: staleTexture }],
  ]);
  renderer.updateRasterTargetResourceMetadata = (target) => target;
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["deleted-layer"]);
  assert.equal(renderer.rasterTargetsByLayerId.has("deleted-layer"), false);
  assert.equal(renderer.paintLayerId, "active-layer");
  assert.equal(renderer.texture, activeTexture);
});

test("raster snapshot rectangles clamp crop bounds safely", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 80,
    width: 100,
  };
  const firstRect = renderer.getSnapshotRect(target, {
    height: 0,
    width: 500,
    x: -10,
    y: 12.6,
  });
  const secondRect = renderer.getSnapshotRect(target, {
    x: 95.2,
    y: 70.5,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(firstRect)), {
    height: 68,
    width: 100,
    x: 0,
    y: 12,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(secondRect)), {
    height: 10,
    width: 5,
    x: 95,
    y: 70,
  });
});

test("duplicateRasterTarget clones a source raster target into a new layer target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const sourceTarget = {
    clearColor: [0.1, 0.2, 0.3, 0],
    cropped: true,
    framebuffer: { id: "source-framebuffer" },
    height: 40,
    texture: { id: "source-texture" },
    width: 30,
    x: 8,
    y: 12,
  };
  const destinationTarget = {
    framebuffer: { id: "destination-framebuffer" },
    texture: { id: "destination-texture" },
  };
  const copyCalls = [];
  const replaceCalls = [];

  renderer.width = 100;
  renderer.height = 100;
  renderer.rasterTargetsByLayerId = new Map([["source-layer", sourceTarget]]);
  renderer.createRasterTarget = (clearColor, options = {}) => {
    assert.deepEqual(JSON.parse(JSON.stringify(clearColor)), sourceTarget.clearColor);
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      cropped: true,
      height: 40,
      layerId: "copy-layer",
      reason: "unit-duplicate",
      width: 30,
      x: 8,
      y: 12,
    });
    return destinationTarget;
  };
  renderer.copyRasterTargetRectToTarget = (source, rect, destination) => {
    copyCalls.push({ destination, rect, source });
    return true;
  };
  renderer.replaceRasterTarget = (layerId, target, options = {}) => {
    replaceCalls.push({ layerId, options, target });
    return true;
  };
  renderer.deleteRasterTargetObject = () => {
    throw new Error("destination target should not be deleted after a successful copy");
  };

  assert.equal(renderer.duplicateRasterTarget("source-layer", "copy-layer", {
    emit: false,
    source: "unit-duplicate",
  }), true);
  assert.equal(copyCalls[0].destination, destinationTarget);
  assert.equal(copyCalls[0].source, sourceTarget);
  assert.deepEqual(JSON.parse(JSON.stringify(copyCalls[0].rect)), {
    height: 40,
    width: 30,
    x: 8,
    y: 12,
  });
  assert.equal(replaceCalls.length, 1);
  assert.equal(replaceCalls[0].layerId, "copy-layer");
  assert.equal(replaceCalls[0].target, destinationTarget);
  assert.deepEqual(JSON.parse(JSON.stringify(replaceCalls[0].options)), {
    emit: false,
    label: "copy-layer",
    source: "unit-duplicate",
  });
});

test("puppet Rigid MLS writes translated and rotated mesh vertices", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const translated = new Float32Array(2);
  const rotated = new Float32Array(2);

  renderer.writeRigidMlsPoint(translated, 0, 10, 20, [
    { restX: 4, restY: 8, x: 14, y: 3 },
  ]);

  assert.deepEqual(Array.from(translated), [20, 15]);

  renderer.writeRigidMlsPoint(rotated, 0, 0, 1, [
    { restX: 0, restY: 0, x: 0, y: 0 },
    { restX: 1, restY: 0, x: 0, y: 1 },
  ]);

  assert.ok(Math.abs(rotated[0] - -1) < 0.00001);
  assert.ok(Math.abs(rotated[1] - 0) < 0.00001);

  const pinRotated = new Float32Array(2);

  renderer.writeRigidMlsPoint(pinRotated, 0, 1, 0, [
    { restX: 0, restY: 0, x: 0, y: 0, rotation: Math.PI / 2 },
  ]);

  assert.ok(Math.abs(pinRotated[0] - 0) < 0.00001);
  assert.ok(Math.abs(pinRotated[1] - 1) < 0.00001);
});

test("puppet rest point resolves deformed clicks back through barycentric UVs", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.puppetMeshResourcesByLayerId = new Map([
    ["paint-main", {
      indices: new Uint32Array([0, 1, 2]),
      targetHeight: 100,
      targetWidth: 100,
      vertices: new Float32Array([
        10, 10, 0, 1,
        110, 10, 1, 1,
        10, 110, 0, 0,
      ]),
    }],
  ]);

  const point = renderer.getPuppetRestPoint("paint-main", 60, 60);

  assert.ok(Math.abs(point.x - 50) < 0.00001);
  assert.ok(Math.abs(point.y - 50) < 0.00001);
});

test("puppet mesh converts cropped layer pins between document and local coordinates", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 40,
    width: 50,
    x: 100,
    y: 200,
  };
  const layer = {
    puppet: {
      pins: [{ restX: 110, restY: 210, x: 120, y: 230 }],
    },
  };
  const resource = {
    cols: 1,
    rows: 1,
    vertices: new Float32Array(16),
  };

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.updatePuppetMeshVertices(resource, layer, target);

  assert.deepEqual(Array.from(resource.vertices.slice(0, 4)), [110, 220, 0, 1]);

  renderer.puppetMeshResourcesByLayerId = new Map([
    ["image-1", {
      indices: new Uint32Array([0, 1, 2]),
      targetHeight: 40,
      targetWidth: 50,
      targetX: 100,
      targetY: 200,
      vertices: new Float32Array([
        100, 200, 0, 1,
        150, 200, 1, 1,
        100, 240, 0, 0,
      ]),
    }],
  ]);

  const restPoint = renderer.getPuppetRestPoint("image-1", 125, 220);

  assert.ok(Math.abs(restPoint.x - 125) < 0.00001);
  assert.ok(Math.abs(restPoint.y - 220) < 0.00001);
});

test("field blur maps document pins into cropped effect target coordinates", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  let captured = null;

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.getLayerEffectWriteTarget = () => ({ framebuffer: {}, texture: "field-output" });
  renderer.runFieldBlurPass = (options) => {
    captured = options;
    return true;
  };

  const result = renderer.applyFieldBlurTexture("field-source", [
    { blur: 50, x: 1600, y: 1700 },
  ], {
    height: 408,
    originX: 1500,
    originY: 1600,
    width: 508,
  });

  assert.equal(result, "field-output");
  assert.equal(captured.pins[0].x, 100);
  assert.equal(captured.pins[0].y, 100);
});

test("radial blur expands cropped effect output and keeps its document center stable", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;

  const sourceRect = { x: 100, y: 120, width: 80, height: 60 };
  const outputRect = renderer.getLayerEffectOutputRect({
    effects: [{
      amount: 100,
      centerX: 50,
      centerY: 50,
      enabled: true,
      mode: "zoom",
      type: "radial-blur",
    }],
  }, sourceRect);

  assert.ok(outputRect.x < sourceRect.x);
  assert.ok(outputRect.y < sourceRect.y);
  assert.ok(outputRect.width > sourceRect.width);
  assert.ok(outputRect.height > sourceRect.height);

  const center = renderer.resolveRadialBlurCenter(0, 100, {
    height: outputRect.height,
    outputRect,
    sourceRect,
    width: outputRect.width,
  });

  assert.ok(center.x > 0 && center.x < 1);
  assert.ok(center.y > 0 && center.y < 1);
  assert.ok(Math.abs((outputRect.x + center.x * outputRect.width) - sourceRect.x) < 0.00001);
  assert.ok(Math.abs((outputRect.y + (1 - center.y) * outputRect.height) - (sourceRect.y + sourceRect.height)) < 0.00001);
});

test("puppet deformed bounds include pixels moved outside a cropped target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 40,
    texture: {},
    width: 50,
    x: 100,
    y: 200,
  };
  const layer = {
    id: "image-1",
    puppet: {
      pins: [{ restX: 100, restY: 200, x: 80, y: 180 }],
    },
  };
  const resource = {
    cols: 1,
    rows: 1,
    vertices: new Float32Array(16),
  };

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.getPuppetGridSize = () => ({ cols: 1, rows: 1 });
  renderer.getPuppetMeshResource = () => resource;

  const bounds = renderer.getPuppetDeformedBounds(layer, target);

  assert.deepEqual(JSON.parse(JSON.stringify(bounds)), {
    height: 44,
    width: 54,
    x: 78,
    y: 178,
  });
});

test("document renderer exposes GPU snapshot lifecycle helpers for raster history", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const documentDrawTargetBody = source.match(
    /getDocumentDrawTarget\(layerId = this\.resolvePaintLayerId\(\)\) \{([\s\S]*?)\n    ensurePaintLayerForBrush/,
  )?.[1] || "";

  assert.match(source, /createRasterSnapshot\(targetOrLayerId, rect = null, label = "raster snapshot"\)/);
  assert.match(source, /dehydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /hydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /restoreRasterSnapshot\(layerId, snapshot, options = \{\}\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /const RASTER_HISTORY_TILE_SIZE = 256/);
  assert.match(source, /beginRasterTileHistory\(layerId, dirtyRect, options = \{\}\)/);
  assert.match(source, /extendRasterTileHistory\(capture, dirtyRect, options = \{\}\)/);
  assert.match(source, /commitRasterTileHistory\(capture, options = \{\}\)/);
  assert.match(source, /restoreRasterTileHistoryEntry\(entry, snapshotKey = "before", options = \{\}\)/);
  assert.match(source, /tileDeltas/);
  assert.match(source, /createRasterOperationMemoryReport\(options = \{\}\)/);
  assert.match(source, /operationType: "raster-transform"/);
  assert.match(source, /getDocumentDrawTarget\(layerId = this\.resolvePaintLayerId\(\)\)/);
  assert.match(documentDrawTargetBody, /return \{\s*cropped: false,\s*framebuffer: null,\s*height: Math\.max\(1, Math\.round\(this\.height \|\| 1\)\),/);
  assert.doesNotMatch(documentDrawTargetBody, /rasterTargetsByLayerId\.get\(layerId\)/);
  assert.match(source, /const target = this\.getDocumentDrawTarget\(\)/);
  assert.match(source, /estimatePaintTargetCropPotential\(options = \{\}\)/);
  assert.match(source, /getRasterContentBounds\(layerId,/);
  assert.match(source, /const pixelPerfect = options\.pixelPerfect === true;/);
  assert.match(source, /coarseRect = \{ x: 0, y: 0, width: targetWidth, height: targetHeight \};/);
  assert.match(source, /coarseOnly: !precise/);
  assert.match(source, /action === "crop-candidate"/);
  assert.match(source, /potentialSavingsBytes/);
  assert.match(source, /copyRasterTargetRectToTarget\(sourceTarget, docRect, destinationTarget\)/);
  assert.match(source, /compactPaintTargetToContent\(layerId, options = \{\}\)/);
  assert.match(source, /compactInactivePaintTargets\(options = \{\}\)/);
  assert.match(source, /operationType: "paint-target-compact"/);
  assert.match(source, /source: "brush-materialize"/);
  assert.match(source, /getRasterAlphaAtPoint\(targetOrLayerId, x, y\)/);
  assert.match(source, /gl\.blitFramebuffer\(/);
  assert.match(source, /gl\.deleteFramebuffer\(snapshot\.framebuffer\)/);
  assert.match(source, /gl\.deleteTexture\(snapshot\.texture\)/);
});

test("document renderer exposes mipmapped zoom-out preview cache helpers", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createPreviewCache\(\)/);
  assert.match(source, /updatePreviewCacheIfNeeded\(\)/);
  assert.match(source, /drawPreviewCacheToCanvas\(options = \{\}\)/);
  assert.doesNotMatch(source, /^\s*this\.createPreviewCache\(\);$/m);
  assert.match(source, /const didCreate = this\.createPreviewCache\(\)/);
  assert.match(source, /gl\.LINEAR_MIPMAP_LINEAR/);
  assert.match(source, /const isZoomedOut = \(camera\.zoom \|\| 1\) < 0\.99/);
  assert.match(source, /const allowPreviewCache = options\.allowPreviewCache === true/);
  assert.match(source, /allowPreviewCache &&\s*isZoomedOut/);
  assert.match(source, /!hasActiveEraserStroke/);
  assert.match(source, /!rasterTransformPreview/);
});

test("document renderer uses a procedural background texture", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createProceduralBackgroundTarget\(\)/);
  assert.match(source, /new Uint8Array\(\[255, 255, 255, 255\]\)/);
  assert.match(source, /label: "procedural background texture"/);
  assert.match(source, /bbox: \{\s*x: 0,\s*y: 0,\s*width: this\.width,\s*height: this\.height,\s*\}/);
  assert.match(source, /createBaseLayerTarget\(\) \{\s*const backgroundTarget = this\.createProceduralBackgroundTarget\(\)/);
  assert.doesNotMatch(source, /createBaseLayerTarget\(\) \{[\s\S]*?const target = this\.createRasterTarget\(\[0, 0, 0, 0\]\)/);
  assert.doesNotMatch(source, /const backgroundTarget = this\.createRasterTarget\(\[1, 1, 1, 1\]\)/);
});

test("document renderer composites supported layer blend modes in shader", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const previewCacheBody = source.match(/updatePreviewCache\(\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";
  const drawToCanvasBody = source.match(/drawToCanvas\(options = \{\}\) \{([\s\S]*?)\n    dispose\(\)/)?.[1] || "";

  assert.match(source, /LAYER_BLEND_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /uniform sampler2D u_backdropTexture/);
  assert.match(source, /vec3 applyBlendMode\(vec3 baseColor, vec3 sourceColor, int blendMode\)/);
  assert.match(source, /source\.rgb \/ sourceAlpha/);
  assert.match(source, /backdrop\.rgb \/ backdropAlpha/);
  assert.match(source, /copyCurrentFramebufferToLayerBlendBackdrop\(width, height\)/);
  assert.match(source, /gl\.copyTexSubImage2D/);
  assert.match(source, /createLayerBlendProgramInfo\(\)/);
  assert.match(source, /ensureLayerBlendProgramInfo\(\)/);
  assert.match(source, /renderLayerWithActiveStrokeTexture\(layerTexture, strokeTexture, strokeRect = null\)/);
  assert.match(previewCacheBody, /drawBlendTexture\(layerTexture, opacity, this\.getLayerBlendModeId\(layer\), renderResult\.rect, clipBase\)/);
  assert.match(drawToCanvasBody, /activeStrokeNeedsFullStack/);
  assert.match(drawToCanvasBody, /drawBlendTexture\(layerTexture, opacity, layerRect, clipBase, blendModeId\)/);
});

test("document renderer exposes non-destructive gaussian blur layer effect helpers", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const previewCacheBody = source.match(/updatePreviewCache\(\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /MOTION_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /FIELD_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /RADIAL_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /GRAIN_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /THRESHOLD_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /createGaussianBlurProgramInfo\(\)/);
  assert.match(source, /createMotionBlurProgramInfo\(\)/);
  assert.match(source, /createFieldBlurProgramInfo\(\)/);
  assert.match(source, /createRadialBlurProgramInfo\(\)/);
  assert.match(source, /createGrainProgramInfo\(\)/);
  assert.match(source, /createThresholdProgramInfo\(\)/);
  assert.match(source, /ensureMotionBlurProgramInfo\(\)/);
  assert.match(source, /ensureFieldBlurProgramInfo\(\)/);
  assert.match(source, /ensureRadialBlurProgramInfo\(\)/);
  assert.match(source, /ensureGrainProgramInfo\(\)/);
  assert.match(source, /ensureThresholdProgramInfo\(\)/);
  assert.match(source, /ensureLayerEffectScratchTargets\(/);
  assert.match(source, /runGaussianBlurPass\(/);
  assert.match(source, /runMotionBlurPass\(/);
  assert.match(source, /runFieldBlurPass\(/);
  assert.match(source, /runRadialBlurPass\(/);
  assert.match(source, /runGrainPass\(/);
  assert.match(source, /runThresholdPass\(/);
  assert.match(source, /applyGaussianBlurTexture\(sourceTexture, radius, options = \{\}\)/);
  assert.match(source, /applyMotionBlurTexture\(sourceTexture, distance, angle, options = \{\}\)/);
  assert.match(source, /applyFieldBlurTexture\(sourceTexture, pins, options = \{\}\)/);
  assert.match(source, /applyRadialBlurTexture\(\s*sourceTexture,\s*amount,\s*centerX = 50,\s*centerY = 50,\s*mode = "spin",\s*options = \{\},/);
  assert.match(source, /applyGrainTexture\(sourceTexture, grain, options = \{\}\)/);
  assert.match(source, /applyThresholdTexture\(sourceTexture, threshold, options = \{\}\)/);
  assert.match(source, /getLayerEffectOutputRect\(layer, targetRect\)/);
  assert.match(source, /getRadialBlurOutputRect\(radialBlur, outputRect, targetRect\)/);
  assert.match(source, /sourceRect: targetRect/);
  assert.match(source, /getLayerMotionBlur\(layer\)/);
  assert.match(source, /getLayerFieldBlur\(layer\)/);
  assert.match(source, /getLayerRadialBlur\(layer\)/);
  assert.match(source, /getLayerGrain\(layer\)/);
  assert.match(source, /getLayerThreshold\(layer\)/);
  assert.match(source, /getLayerRenderTexture\(layer, layerTarget\)/);
  assert.match(source, /for \(const effect of layer\.effects\)/);
  assert.match(source, /u_directionTexelStep/);
  assert.match(source, /u_pins\[8\]/);
  assert.match(source, /resolveFieldBlurRadius\(v_uv\)/);
  assert.match(source, /FIELD_BLUR_SAMPLE_COUNT/);
  assert.match(source, /pinValues\[offset \+ 1\] = 1 - pin\.y \/ height/);
  assert.match(source, /u_texelSize/);
  assert.match(source, /u_center/);
  assert.match(source, /u_mode/);
  assert.match(source, /float angleRange = amount \* 0\.0062831853;/);
  assert.match(source, /float zoomRange = amount \* 0\.0025;/);
  assert.match(source, /if \(u_mode > 0\.5\)/);
  assert.match(source, /sampleA = v_uv - radialVector \* zoomOffset/);
  assert.match(source, /vec2 rotatedClockwise/);
  assert.match(source, /sampleB = center \+ rotatedCounterClockwise/);
  assert.match(source, /Math\.cos\(angleRad\) \/ width/);
  assert.match(source, /Math\.sin\(angleRad\) \/ height/);
  assert.match(source, /centerY: resolvedCenter\.y/);
  assert.match(source, /u_monochrome/);
  assert.match(source, /vec2 documentPixel = u_origin/);
  assert.match(source, /effect\.type === "grain"/);
  assert.match(source, /u_threshold/);
  assert.match(source, /thresholdLuminance\(color\) \* 255\.0 >= level/);
  assert.match(source, /effect\.type === "threshold"/);
  assert.match(source, /copyTextureToRasterTarget\(sourceTexture, target, options = \{\}\)/);
  assert.match(source, /rasterizeLayerEffects\(layer, options = \{\}\)/);
  assert.match(source, /layer-effects-rasterize-before/);
  assert.match(source, /layer-effects-rasterize-after/);
  assert.match(source, /recordRasterOperation\(report = \{\}\)/);
  assert.match(source, /evictRasterScratchCachesForPolicy\(report = \{\}, options = \{\}\)/);
  assert.match(source, /shouldEvictRasterScratchForPolicy\(report = \{\}\)/);
  assert.match(source, /policy === "large" \|\| policy === "huge"/);
  assert.match(source, /this\.deletePreviewCache\(\)/);
  assert.match(source, /this\.deleteLayerEffectScratchTargets\(\)/);
  assert.match(source, /this\.deleteActiveStrokeScratchTarget\(\)/);
  assert.match(source, /this\.evictRasterScratchCachesForPolicy\(recorded\)/);
  assert.match(source, /operationType: "layer-effects-rasterize"/);
  assert.match(source, /scratchBytes\s*=\s*\n\s*this\.estimateRasterTargetBytes\(this\.layerEffectScratchA\)/);
  assert.match(source, /sourceTexture: layerTexture/);
  assert.doesNotMatch(source, /this\.hasPuppetLayerTransform\(layer\) \? 0 : this\.getLayerEffectPadding\(layer\)/);
  assert.match(source, /this\.deleteGaussianBlurResources\(\)/);
  assert.match(source, /this\.deleteMotionBlurResources\(\)/);
  assert.match(source, /this\.deleteFieldBlurResources\(\)/);
  assert.match(source, /this\.deleteRadialBlurResources\(\)/);
  assert.match(source, /this\.deleteGrainResources\(\)/);
  assert.match(source, /this\.deleteThresholdResources\(\)/);
  assert.match(previewCacheBody, /const renderResult = this\.getLayerRenderResult\(layer, layerTarget\)/);
  assert.match(previewCacheBody, /sourceTexture: layerTexture/);
  assert.doesNotMatch(previewCacheBody, /!hasLayerEffects/);
  assert.doesNotMatch(source, /rasterTargetsByLayerId\.set\([^)]*layerEffectScratch/);
});

test("puppet rasterize commits the deformed mesh through snapshots", () => {
  const rendererSource = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const puppetToolSource = fs.readFileSync(
    path.join(repoRoot, "js", "puppet-transform-tool.js"),
    "utf8",
  );

  assert.match(rendererSource, /rasterizePuppetLayer\(layer, options = \{\}\)/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(target, null, "puppet-rasterize-before"\)/);
  assert.match(rendererSource, /const outputRect = this\.getPuppetDeformedBounds\(layer, target\)/);
  assert.match(rendererSource, /this\.createRasterTargetForRect\(outputRect\)/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(destinationTarget, null, "puppet-rasterize-after"\)/);
  assert.match(rendererSource, /operationType: "puppet-rasterize"/);
  assert.match(rendererSource, /tool: "puppet"/);
  assert.match(rendererSource, /this\.replaceRasterTarget\(layer\.id, destinationTarget,/);
  assert.match(rendererSource, /sourceTexture: sourceSnapshot\.texture/);
  assert.match(puppetToolSource, /this\.isActive\(\) && nextTool !== PUPPET_TOOL_MODE/);
  assert.match(puppetToolSource, /this\.rasterizeActivePuppetLayer\(\)/);
  assert.match(puppetToolSource, /window\.addEventListener\("cbo:before-history-action", this\.handleBeforeHistoryAction\)/);
  assert.match(puppetToolSource, /namespace\.documentHistory\?\.flushLayerState\?\.\(this\.layerModel\)/);
  assert.match(puppetToolSource, /source: "history-undo-puppet-rasterize"/);
  assert.match(puppetToolSource, /source: "history-redo-puppet-rasterize"/);
});

test("puppet pin creation is blocked outside visible alpha", () => {
  const puppetToolSource = fs.readFileSync(
    path.join(repoRoot, "js", "puppet-transform-tool.js"),
    "utf8",
  );

  assert.match(puppetToolSource, /canCreatePinAtRestPoint\(layer, restPoint\)/);
  assert.match(puppetToolSource, /getRasterAlphaAtPoint\(\s*layer\.id,\s*restPoint\.x,\s*restPoint\.y,\s*\) > PUPPET_OVERLAY_ALPHA_THRESHOLD/);
  assert.match(puppetToolSource, /if \(!this\.canCreatePinAtRestPoint\(layer, restPoint\)\) \{\s*return;\s*\}/);
});
