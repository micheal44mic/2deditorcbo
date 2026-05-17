const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadBrushEngine() {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const window = {
    CBO: {},
    addEventListener() {},
    clearTimeout() {},
    dispatchEvent() {},
    removeEventListener() {},
    setTimeout() {
      return 1;
    },
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Date,
    Event,
    EventTarget,
    Float32Array,
    HTMLCanvasElement: class HTMLCanvasElement {},
    Image: class Image {},
    Map,
    Math,
    Number,
    Object,
    ResizeObserver: class ResizeObserver {},
    Set,
    String,
    Uint8Array,
    console,
    document: {
      body: {
        classList: {
          remove() {},
        },
      },
      querySelector: () => null,
    },
    navigator: {},
    window,
  });

  vm.runInContext(source, context);

  return {
    BrushEngine: context.window.CBO.BrushEngine,
    window: context.window,
  };
}

test("brush stroke history prefers tile-memento before and after snapshots", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /beginRasterTileHistory\?\.\(layerId, effectiveStrokeRect/);
  assert.match(source, /commitRasterTileHistory\?\.\(tileHistory,/);
  assert.match(source, /activeStrokeTilePatchRects/);
  assert.match(source, /includeStrokeTilePatchRect\(rect\)/);
  assert.match(source, /getActiveStrokeTilePatchRects\(clipRect = null\)/);
  assert.match(source, /getActiveStrokePreviewDirtyRects\(effectiveStrokeRect, tilePatchRects = null\)/);
  assert.match(source, /getTileBasedPreviewDirtyRects\(sourceRects, effectiveStrokeRect\)/);
  assert.match(source, /getPreviewDirtyTileRects\(rect, tileSize = this\.getPreviewDirtyTileSize\(\)\)/);
  assert.match(source, /strokePreviewDirtyRects/);
  assert.match(source, /lastStrokePreviewDirtyRects/);
  assert.match(source, /updateStrokePreviewDirtyRects\(effectiveStrokeRect = null, tilePatchRects = null\)/);
  assert.match(source, /getFallbackStrokePreviewDirtyRects\(effectiveStrokeRect = null\)/);
  assert.match(source, /warmPreviewCacheForStroke\(\)/);
  assert.match(source, /const previewCacheOptions = \{/);
  assert.match(source, /this\.documentRenderer\.getPreviewCacheDimensions\(previewCacheOptions\)/);
  assert.match(source, /this\.documentRenderer\.updatePreviewCacheIfNeeded\(previewCacheOptions\) === true/);
  assert.match(source, /queueActiveStrokeDirtyRegionDebug\(\)/);
  assert.match(source, /emitActiveStrokeDirtyRegionDebug\(\)/);
  assert.match(source, /const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug"/);
  assert.match(source, /live: true/);
  assert.match(source, /mode: "partial-live"/);
  assert.match(source, /tilePatchRects: activeStrokeTilePatchRects/);
  assert.match(source, /historyMode = hasTileHistory[\s\S]*"tile-before-after"/);
  assert.match(source, /tileHistory[\s\S]*this\.createHistorySnapshot\(target, effectiveStrokeRect, "before-stroke"\)/);
  assert.match(source, /this\.createHistorySnapshot\(target, effectiveStrokeRect, "before-stroke"\)/);
  assert.match(source, /dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /deleteHistorySnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /let afterSnapshot = null/);
  assert.match(source, /let entry = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /afterSnapshot = this\.createHistorySnapshot\(redoTarget, beforeSnapshot\.docRect \|\| beforeSnapshot\.rect, "after-stroke"\)/);
  assert.match(source, /entry\.after = afterSnapshot/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.match(source, /rect: beforeSnapshot\.docRect \|\| beforeSnapshot\.rect/);
  assert.doesNotMatch(source, /const afterSnapshot = this\.createHistorySnapshot\(target, beforeSnapshot\.rect, "after-stroke"\)/);
});

test("brush live stroke targets sample linearly at zoom intermediates", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const createTransparentTargetBody = source.match(
    /createTransparentRenderTarget\(label, width, height, resourceMetadata = \{\}\) \{([\s\S]*?)\n    releaseStrokeLayerTarget/,
  )?.[1] || "";

  assert.match(createTransparentTargetBody, /Sampling lineare/);
  assert.match(createTransparentTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MIN_FILTER, gl\.LINEAR\)/);
  assert.match(createTransparentTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.LINEAR\)/);
  assert.doesNotMatch(createTransparentTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.NEAREST\)/);
});

test("brush artboard clipping accepts stamps outside the primary document rect", () => {
  const { BrushEngine, window } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  window.CBO.getActiveDocumentArtboardRect = () => ({
    height: 200,
    width: 200,
    x: 1200,
    y: 0,
  });
  engine.strokeTargetLayerId = "paint-secondary";
  engine.getDocumentDrawTarget = () => ({
    height: 500,
    layerId: "paint-secondary",
    width: 500,
    x: 0,
    y: 0,
  });
  engine.getStampBounds = () => ({
    maxX: 1310,
    maxY: 110,
    minX: 1290,
    minY: 90,
  });

  assert.equal(engine.isStampCompletelyOutsideDocument({}), false);

  engine.getStampBounds = () => ({
    maxX: 1190,
    maxY: 110,
    minX: 1170,
    minY: 90,
  });

  assert.equal(engine.isStampCompletelyOutsideDocument({}), true);
});

test("brush stroke history records memory policy and disables redo for huge strokes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /const STROKE_MEMORY_POLICY = Object\.freeze/);
  assert.match(source, /createStrokeMemoryReport\(/);
  assert.match(source, /namespace\.rasterResourceManager\?\.recordStrokeMemory\?\.\(report\)/);
  assert.match(source, /historyMode === "gpu-before-no-redo"/);
  assert.match(source, /memoryPolicy: memoryReport/);
  assert.match(source, /shouldKeepPreviewCacheForDirtyBake\(previewDirtyRects/);
  assert.match(source, /deferredByInteractiveFrame/);
  assert.match(source, /skipReason[\s\S]*"interactive-frame"/);
  assert.match(source, /STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE = 0\.45/);
  assert.match(source, /this\.documentRenderer\?\.evictRasterScratchCachesForPolicy\?\.\(memoryReport,/);
  assert.match(source, /deletePreviewCache: !keepPreviewCacheForDirtyBake/);
  assert.match(source, /source: "brush-bake"/);
  assert.match(source, /this\.documentRenderer\?\.deleteActiveStrokeScratchTarget\?\.\(\)/);
  assert.match(source, /this\.documentRenderer\?\.compactInactivePaintTargets\?\.\(/);
  assert.match(source, /source: "brush-bake-compact-inactive"/);
  assert.match(source, /activateArtboardAtPoint\(documentPoint\)/);
  assert.match(source, /namespace\.selectDocumentArtboardAtPoint\?\.\(point/);
  assert.match(source, /queueStrokeTargetPrewarm\(\)/);
  assert.match(source, /prewarmStrokePaintTargets\(maxNewTiles = STROKE_TARGET_PREWARM_MAX_TILES\)/);
  assert.match(source, /namespace\.interactiveBrushPrewarmEnabled !== true/);
  assert.match(source, /namespace\.EngineGovernor\?\.mode === "interactive"/);
  assert.match(source, /prewarmRasterTargetsForPaintRect\(layerId, effectiveStrokeRect/);
});

test("brush live stroke skips mixed buildup targets for plateau and accumulation modes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /const STROKE_BUILDUP_EPSILON = 0\.001/);
  assert.match(source, /const STROKE_RENDER_MODE_PLATEAU = "plateau"/);
  assert.match(source, /const STROKE_RENDER_MODE_ACCUM = "accum"/);
  assert.match(source, /const STROKE_RENDER_MODE_MIXED = "mixed"/);
  assert.match(source, /const ANDROID_MAX_STAMPS_PER_FLUSH = 384/);
  assert.match(source, /const ANDROID_POINTER_SAMPLES_PER_FRAME = 24/);
  assert.match(source, /const ANDROID_POINTER_FRAME_BUDGET_MS = 2\.5/);
  assert.match(source, /getBrushStrokeRenderMode\(\) \{[\s\S]*return STROKE_RENDER_MODE_PLATEAU/);
  assert.match(source, /isAndroidPerformanceMode\(\) \{/);
  assert.match(source, /namespace\.androidMixedStrokeBuildup !== true/);
  assert.match(source, /return buildUp <= 0\.25 \? STROKE_RENDER_MODE_PLATEAU : STROKE_RENDER_MODE_ACCUM/);
  assert.match(source, /getStrokeScratchTextureCount\(\) \{[\s\S]*return this\.usesMixedStrokeBuildup\(\) \? 3 : 1/);
  assert.match(source, /if \(renderMode === STROKE_RENDER_MODE_MIXED\) \{[\s\S]*Stroke plateau FBO[\s\S]*Stroke accumulation FBO/);
  assert.match(source, /drawStampBatchToFramebuffer\(this\.strokeFBO, gl\.MAX, gl\.ONE, gl\.ONE\)/);
  assert.match(source, /drawStampBatchToFramebuffer\(this\.strokeFBO, gl\.FUNC_ADD, gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/);
  assert.match(source, /if \(renderMode === STROKE_RENDER_MODE_MIXED\) \{[\s\S]*this\.composeStrokeBuildUp\(flushDirtyRect\)/);
  assert.match(source, /this\.warmPreviewCacheForStroke\(\{ force: true \}\)/);
  assert.match(source, /this\.strokeRenderMode = this\.getBrushStrokeRenderMode\(\)/);
  assert.match(source, /this\.strokeRenderMode = null/);
  assert.doesNotMatch(source, /STROKE_SCRATCH_TEXTURE_COUNT/);
});

test("brush first paint stroke can defer full live target materialization", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /ensurePaintLayerForBrush\?\.\(\{ materialize: false \}\)/);
  assert.match(source, /if \(!this\.isDocumentPointInside\(documentPoint\)\) \{\s*event\.preventDefault\(\);\s*return;\s*\}/);
  assert.doesNotMatch(source, /clearActiveLayer\?\.\(\{ source: "canvas-empty-click" \}\)/);
  assert.match(source, /showEmptyEraserLayerToast\(message = "Nothing to erase on this layer"\)/);
  assert.match(source, /const existingTarget = this\.documentRenderer\?\.rasterTargetsByLayerId\?\.get\?\.\(activeId\)/);
  assert.match(source, /if \(!existingTarget \|\| isEmptySparseTarget\) \{\s*this\.showEmptyEraserLayerToast\(\);\s*return null;\s*\}/);
  assert.match(source, /const paintTargets = isEraserStroke/);
  assert.match(source, /const hasSelectionCoverage = Array\.isArray\(selectionCoverageRects\) && selectionCoverageRects\.length > 0/);
  assert.match(source, /const hasEmptySelectionCoverage = Array\.isArray\(selectionCoverageRects\) && selectionCoverageRects\.length === 0/);
  assert.match(source, /const activeStrokeTilePatchRects = hasSelectionCoverage/);
  assert.match(source, /this\.getActiveStrokeTilePatchRects\(effectiveStrokeRect\)/);
  assert.match(source, /getStrokePreviewDirtyRectsForBake\(effectiveStrokeRect, tilePatchRects = null\)/);
  assert.match(source, /this\.isAndroidDirtyRegionsDisabled\(\)/);
  assert.match(source, /const computedPreviewDirtyRects = this\.updateStrokePreviewDirtyRects\(/);
  assert.match(source, /const previewDirtyRects = this\.getStrokePreviewDirtyRectsForBake\(/);
  assert.match(source, /this\.getFallbackStrokePreviewDirtyRects\(effectiveStrokeRect\)/);
  assert.match(source, /selectionCoverageRects/);
  assert.match(source, /getRasterTargetsForPaintRect\?\.\(layerId, effectiveStrokeRect/);
  assert.match(source, /source: "brush-eraser-target"/);
  assert.match(source, /ensureRasterTargetsForPaintRect\?\.\(layerId, effectiveStrokeRect/);
  assert.match(source, /source: "brush-stroke-target"/);
  assert.match(source, /tilePatchRects: activeStrokeTilePatchRects/);
  assert.match(source, /preserveDirtyRects: true/);
  assert.match(source, /maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS/);
  assert.match(source, /rects: previewDirtyRects/);
  assert.match(source, /const documentTarget = this\.getDocumentDrawTarget\(layerId\)/);
  assert.match(source, /const target = this\.getDocumentDrawTarget\(this\.strokeTargetLayerId \|\| ""\)/);
  assert.match(source, /this\.warmPreviewCacheForStroke\(\)/);
  assert.match(source, /paintTargets\.forEach\(\(item\) =>/);
  assert.match(source, /const localBakeX = Math\.round\(bakeRect\.x - targetRect\.x\)/);
  assert.match(source, /gl\.viewport\(localBakeX, paintTarget\.height - \(localBakeY \+ bakeRect\.height\), bakeRect\.width, bakeRect\.height\)/);
});

test("brush preview dirty regions split long strokes into preview tiles", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const longStrokeRect = { x: 0, y: 20, width: 1600, height: 40 };

  engine.options = {};
  engine.documentRenderer = {
    getRasterHistoryTileSize: () => 256,
    intersectRasterHistoryRects: (a, b) => engine.intersectDocumentRects(a, b),
    unionRasterHistoryRects: (a, b) => engine.unionDocumentRects(a, b),
  };

  const dirtyRects = engine.getActiveStrokePreviewDirtyRects(longStrokeRect, [{
    patchRect: longStrokeRect,
  }]);

  assert.equal(dirtyRects.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(dirtyRects.map((rect) => rect.width))), [512, 512, 512, 64]);
  assert.deepEqual(JSON.parse(JSON.stringify(dirtyRects.map((rect) => rect.height))), [40, 40, 40, 40]);
  assert.deepEqual(JSON.parse(JSON.stringify(dirtyRects.map((rect) => rect.x))), [0, 512, 1024, 1536]);
});

test("brush flush scissor is bounded to the current stamp batch", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.brushState = {
    minSizeRatio: 1,
    size: 100,
  };
  engine.shapeTexture = null;
  engine.shapeTextureReady = false;

  const dirtyRect = engine.getStampBufferDirtyRect([
    { pressure: 1, sizeScale: 1, x: 100, y: 100 },
    { pressure: 1, sizeScale: 1, x: 250, y: 80 },
  ], {
    height: 300,
    width: 400,
    x: 0,
    y: 0,
  });
  const scissor = engine.getStrokeBufferScissor(dirtyRect, {
    height: 300,
    width: 400,
    x: 0,
    y: 0,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(dirtyRect)), {
    height: 124,
    width: 254,
    x: 48,
    y: 28,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(scissor)), {
    height: 124,
    width: 254,
    x: 48,
    y: 148,
  });
});

test("brush emits live dirty region debug while a long stroke is drawing", () => {
  const { BrushEngine, window } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const events = [];

  window.CBO.debugPreviewDirtyRegions = true;
  window.dispatchEvent = (event) => events.push(event.detail);
  engine.activeStrokeDirtyDebugFrame = 0;
  engine.activeStrokeBounds = { minX: 0, minY: 0, maxX: 1300, maxY: 80 };
  engine.activeStrokeTilePatchRects = new Map();
  engine.currentStrokeTool = "brush";
  engine.documentRenderer = {
    getRasterHistoryTileSize: () => 256,
    getRasterHistoryTileRects: (rect) => engine.getPreviewDirtyTileRects(rect, 512),
    intersectRasterHistoryRects: (a, b) => engine.intersectDocumentRects(a, b),
    unionRasterHistoryRects: (a, b) => engine.unionDocumentRects(a, b),
  };
  engine.getDocumentDrawTarget = () => ({ height: 2000, width: 2000 });
  engine.isDisposed = false;
  engine.isDrawing = true;
  engine.strokeTargetLayerId = "paint-main";

  engine.includeStrokeTilePatchRect({ x: 0, y: 0, width: 1300, height: 80 });
  engine.emitActiveStrokeDirtyRegionDebug();

  assert.equal(events.length, 1);
  assert.equal(events[0].live, true);
  assert.equal(events[0].mode, "partial-live");
  assert.equal(events[0].layerId, "paint-main");
  assert.ok(events[0].rects.length > 1);
  assert.equal(engine.strokePreviewDirtyRects.length, events[0].rects.length);
  assert.equal(engine.lastStrokePreviewDirtyRects.length, events[0].rects.length);
});

test("brush bake dirty rect fallback uses the stroke accumulator before full bounds", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const storedRect = { x: 10, y: 20, width: 30, height: 40 };
  const fallbackRect = { x: 0, y: 0, width: 100, height: 100 };

  engine.strokePreviewDirtyRects = [storedRect];
  engine.lastStrokePreviewDirtyRects = null;

  const storedFallback = engine.getFallbackStrokePreviewDirtyRects(fallbackRect);

  assert.deepEqual(JSON.parse(JSON.stringify(storedFallback)), [storedRect]);
  assert.notEqual(storedFallback[0], storedRect);

  engine.strokePreviewDirtyRects = null;
  engine.lastStrokePreviewDirtyRects = null;

  assert.deepEqual(JSON.parse(JSON.stringify(engine.getFallbackStrokePreviewDirtyRects(fallbackRect))), [fallbackRect]);
});

test("brush bake cache retention uses dirty tile coverage instead of stroke bounds", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.documentRenderer = {
    intersectRasterHistoryRects: (a, b) => engine.intersectDocumentRects(a, b),
  };
  engine.getDocumentDrawTarget = () => ({ height: 4000, width: 4000 });

  const longThinRects = [
    { x: 0, y: 0, width: 512, height: 48 },
    { x: 512, y: 1000, width: 512, height: 48 },
    { x: 1024, y: 2000, width: 512, height: 48 },
  ];
  const hugeStrokeMemory = {
    canvasSize: { height: 4000, width: 4000 },
    coverage: 0.9,
    policy: "huge",
  };

  assert.equal(engine.shouldKeepPreviewCacheForDirtyBake(longThinRects, hugeStrokeMemory), true);

  const broadDirtyRects = [
    { x: 0, y: 0, width: 4000, height: 1000 },
    { x: 0, y: 1000, width: 4000, height: 1000 },
  ];

  assert.equal(engine.shouldKeepPreviewCacheForDirtyBake(broadDirtyRects, hugeStrokeMemory), false);
});

test("eraser refuses empty raster layers without allocating a target", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  let toastCount = 0;
  let createdTarget = false;

  engine.documentRenderer = {
    getRasterTarget() {
      createdTarget = true;
      return null;
    },
    isSparseRasterTarget: (target) => target?.sparse === true,
    layerModel: {
      activeLayerId: "paint-empty",
      findEntryById: () => ({ id: "paint-empty", type: "paint" }),
    },
    rasterTargetsByLayerId: new Map(),
  };
  engine.showEmptyEraserLayerToast = () => {
    toastCount += 1;
  };

  assert.equal(engine.getActiveRasterTargetForEraser(), null);
  assert.equal(createdTarget, false);
  assert.equal(toastCount, 1);

  engine.documentRenderer.rasterTargetsByLayerId.set("paint-empty", {
    sparse: true,
    tiles: new Map(),
  });

  assert.equal(engine.getActiveRasterTargetForEraser(), null);
  assert.equal(createdTarget, false);
  assert.equal(toastCount, 2);
});

test("round brush stamp bounds stay tight while shape textures stay conservative", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.getBrushSize = () => 100;
  engine.getMinSizeRatio = () => 0.15;

  const stamp = { pressure: 1, sizeScale: 1, x: 200, y: 200 };

  engine.shapeTextureReady = false;
  engine.shapeTexture = null;
  assert.deepEqual(JSON.parse(JSON.stringify(engine.getStampBounds(stamp))), {
    minX: 148,
    minY: 148,
    maxX: 252,
    maxY: 252,
  });

  engine.shapeTextureReady = true;
  engine.shapeTexture = {};
  const shapedBounds = engine.getStampBounds(stamp);

  assert.equal(Math.round((stamp.x - shapedBounds.minX) * 1000), Math.round((100 * Math.SQRT1_2 + 2) * 1000));
});

test("brush stroke history batches tile captures until the idle commit", () => {
  const { BrushEngine, window } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const calls = [];
  const capture = {
    tileDeltas: [],
  };
  const rectA = { x: 0, y: 0, width: 10, height: 10 };
  const rectB = { x: 8, y: 8, width: 10, height: 10 };
  let cooled = false;

  window.CBO.documentHistory = {
    scheduleRasterHistoryGpuHotPrune(options) {
      cooled = options.targetGpuHotBytes === 0 && options.minProtectedEntries === 0;
      return {};
    },
    push(entry) {
      calls.push(["push", entry.source, entry.memoryPolicy?.strokeCount]);
      return true;
    },
  };
  engine.options = {
    enableHistory: true,
    historyBatchIdleMs: 1000,
  };
  engine.currentStrokeTool = "brush";
  engine.documentRenderer = {
    beginRasterTileHistory(layerId, rect, options) {
      calls.push(["begin", layerId, rect, options.source]);
      return capture;
    },
    commitRasterTileHistory(nextCapture, options) {
      calls.push(["commit", nextCapture === capture, options.source, options.lazyAfter]);
      return {
        memoryPolicy: options.memoryPolicy,
        source: options.source,
        type: "pixel",
        destroy() {},
        redo() {
          return true;
        },
        undo() {
          return true;
        },
      };
    },
    extendRasterTileHistory(nextCapture, rect, options) {
      calls.push(["extend", nextCapture === capture, rect, options.source]);
      return true;
    },
    finalizeRasterEditHistoryEntry(layerId, entry) {
      calls.push(["finalize", layerId, entry.source]);
      return entry;
    },
  };
  engine.getActiveStrokeTilePatchRects = () => [];
  engine.pendingBrushHistory = null;
  engine.pendingBrushHistoryTimer = 0;
  engine.isDisposed = false;
  engine.isFlushingBrushHistory = false;
  engine.requestDraw = () => calls.push(["draw"]);

  assert.equal(engine.prepareBatchedBrushHistory("paint-main", rectA, {
    policy: "normal",
    strokeRect: rectA,
  }), capture);
  assert.equal(engine.prepareBatchedBrushHistory("paint-main", rectB, {
    policy: "medium",
    strokeRect: rectB,
  }), capture);
  assert.equal(calls.some((call) => call[0] === "commit"), false);

  assert.equal(engine.flushPendingBrushHistory({ source: "test" }), true);
  assert.deepEqual(calls.map((call) => call[0]), ["begin", "extend", "commit", "finalize", "push", "draw"]);
  assert.deepEqual(calls.find((call) => call[0] === "commit"), ["commit", true, "brush", true]);
  assert.deepEqual(calls.find((call) => call[0] === "push"), ["push", "brush", 2]);
  assert.equal(cooled, true);
});

test("brush batch history flushes before other raster history captures", () => {
  const brushSource = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const rendererSource = fs.readFileSync(path.join(repoRoot, "js", "document", "document-renderer.js"), "utf8");

  assert.match(brushSource, /const BRUSH_HISTORY_BATCH_IDLE_MS = 300/);
  assert.match(brushSource, /window\.addEventListener\("cbo:before-raster-history-capture", this\.handleBeforeRasterHistoryCapture\)/);
  assert.match(brushSource, /handleBeforeRasterHistoryCapture\(event\)/);
  assert.match(brushSource, /this\.flushPendingBrushHistory\(\{\s*source: source \? `brush-before-\$\{source\}` : "brush-before-raster-history",\s*\}\)/);
  assert.match(rendererSource, /new CustomEvent\("cbo:before-raster-history-capture"/);
  assert.match(rendererSource, /source: options\.source \|\| options\.label \|\| "raster-tile-history"/);
});
