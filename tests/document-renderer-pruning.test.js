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

test("document renderer exposes GPU snapshot lifecycle helpers for raster history", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createRasterSnapshot\(targetOrLayerId, rect = null, label = "raster snapshot"\)/);
  assert.match(source, /restoreRasterSnapshot\(layerId, snapshot, options = \{\}\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\)/);
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
  assert.match(source, /gl\.LINEAR_MIPMAP_LINEAR/);
  assert.match(source, /const isZoomedOut = \(camera\.zoom \|\| 1\) < 0\.99/);
  assert.match(source, /!hasActiveEraserStroke/);
  assert.match(source, /!rasterTransformPreview/);
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
  assert.match(previewCacheBody, /drawBlendTexture\(layerTexture, opacity, this\.getLayerBlendModeId\(layer\), renderResult\.rect\)/);
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
  assert.match(source, /createGaussianBlurProgramInfo\(\)/);
  assert.match(source, /createMotionBlurProgramInfo\(\)/);
  assert.match(source, /createFieldBlurProgramInfo\(\)/);
  assert.match(source, /createRadialBlurProgramInfo\(\)/);
  assert.match(source, /ensureMotionBlurProgramInfo\(\)/);
  assert.match(source, /ensureFieldBlurProgramInfo\(\)/);
  assert.match(source, /ensureRadialBlurProgramInfo\(\)/);
  assert.match(source, /ensureLayerEffectScratchTargets\(/);
  assert.match(source, /runGaussianBlurPass\(/);
  assert.match(source, /runMotionBlurPass\(/);
  assert.match(source, /runFieldBlurPass\(/);
  assert.match(source, /runRadialBlurPass\(/);
  assert.match(source, /applyGaussianBlurTexture\(sourceTexture, radius, options = \{\}\)/);
  assert.match(source, /applyMotionBlurTexture\(sourceTexture, distance, angle, options = \{\}\)/);
  assert.match(source, /applyFieldBlurTexture\(sourceTexture, pins, options = \{\}\)/);
  assert.match(source, /applyRadialBlurTexture\(\s*sourceTexture,\s*amount,\s*centerX = 50,\s*centerY = 50,\s*mode = "spin",\s*options = \{\},/);
  assert.match(source, /getLayerMotionBlur\(layer\)/);
  assert.match(source, /getLayerFieldBlur\(layer\)/);
  assert.match(source, /getLayerRadialBlur\(layer\)/);
  assert.match(source, /getLayerRenderTexture\(layer, layerTarget\)/);
  assert.match(source, /for \(const effect of layer\.effects\)/);
  assert.match(source, /u_directionTexelStep/);
  assert.match(source, /u_pins\[8\]/);
  assert.match(source, /resolveFieldBlurRadius\(v_uv\)/);
  assert.match(source, /FIELD_BLUR_SAMPLE_COUNT/);
  assert.match(source, /pinValues\[offset \+ 1\] = 1 - Math\.max\(0, Math\.min\(height, pin\.y\)\) \/ height/);
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
  assert.match(source, /centerY: 1 - normalizePercent\(centerY\) \/ 100/);
  assert.match(source, /copyTextureToRasterTarget\(sourceTexture, target, options = \{\}\)/);
  assert.match(source, /rasterizeLayerEffects\(layer, options = \{\}\)/);
  assert.match(source, /layer-effects-rasterize-before/);
  assert.match(source, /layer-effects-rasterize-after/);
  assert.match(source, /sourceTexture: layerTexture/);
  assert.match(source, /this\.deleteGaussianBlurResources\(\)/);
  assert.match(source, /this\.deleteMotionBlurResources\(\)/);
  assert.match(source, /this\.deleteFieldBlurResources\(\)/);
  assert.match(source, /this\.deleteRadialBlurResources\(\)/);
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
  assert.match(rendererSource, /sourceTexture: sourceSnapshot\.texture/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(target, null, "puppet-rasterize-after"\)/);
  assert.match(puppetToolSource, /this\.isActive\(\) && nextTool !== PUPPET_TOOL_MODE/);
  assert.match(puppetToolSource, /this\.rasterizeActivePuppetLayer\(\)/);
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
