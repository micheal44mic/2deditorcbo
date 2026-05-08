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

  assert.match(source, /beginRasterTileHistory\?\.\(layerId, strokeRect/);
  assert.match(source, /commitRasterTileHistory\?\.\(tileHistory,/);
  assert.match(source, /activeStrokeTilePatchRects/);
  assert.match(source, /includeStrokeTilePatchRect\(rect\)/);
  assert.match(source, /getActiveStrokeTilePatchRects\(\)/);
  assert.match(source, /tilePatchRects: activeStrokeTilePatchRects/);
  assert.match(source, /historyMode = hasTileHistory[\s\S]*"tile-before-after"/);
  assert.match(source, /tileHistory[\s\S]*this\.createHistorySnapshot\(target, strokeRect, "before-stroke"\)/);
  assert.match(source, /this\.createHistorySnapshot\(target, strokeRect, "before-stroke"\)/);
  assert.match(source, /dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /deleteHistorySnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /let afterSnapshot = null/);
  assert.match(source, /let entry = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /afterSnapshot = this\.createHistorySnapshot\(redoTarget, beforeSnapshot\.rect, "after-stroke"\)/);
  assert.match(source, /entry\.after = afterSnapshot/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.doesNotMatch(source, /const afterSnapshot = this\.createHistorySnapshot\(target, beforeSnapshot\.rect, "after-stroke"\)/);
});

test("brush stroke history records memory policy and disables redo for huge strokes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /const STROKE_MEMORY_POLICY = Object\.freeze/);
  assert.match(source, /createStrokeMemoryReport\(/);
  assert.match(source, /namespace\.rasterResourceManager\?\.recordStrokeMemory\?\.\(report\)/);
  assert.match(source, /historyMode === "gpu-before-no-redo"/);
  assert.match(source, /memoryPolicy: memoryReport/);
  assert.match(source, /this\.documentRenderer\?\.evictRasterScratchCachesForPolicy\?\.\(memoryReport,/);
  assert.match(source, /source: "brush-bake"/);
  assert.match(source, /this\.documentRenderer\?\.deleteActiveStrokeScratchTarget\?\.\(\)/);
  assert.match(source, /this\.documentRenderer\?\.compactInactivePaintTargets\?\.\(/);
  assert.match(source, /source: "brush-bake-compact-inactive"/);
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
  assert.match(source, /const activeStrokeTilePatchRects = this\.getActiveStrokeTilePatchRects\(\)/);
  assert.match(source, /getRasterTargetsForPaintRect\?\.\(layerId, finalStrokeBufferRect/);
  assert.match(source, /source: "brush-eraser-target"/);
  assert.match(source, /ensureRasterTargetsForPaintRect\?\.\(layerId, finalStrokeBufferRect/);
  assert.match(source, /source: "brush-stroke-target"/);
  assert.match(source, /tilePatchRects: activeStrokeTilePatchRects/);
  assert.match(source, /const documentTarget = this\.getDocumentDrawTarget\(layerId\)/);
  assert.match(source, /const target = this\.getDocumentDrawTarget\(this\.strokeTargetLayerId \|\| ""\)/);
  assert.match(source, /paintTargets\.forEach\(\(item\) =>/);
  assert.match(source, /const localBakeX = Math\.round\(bakeRect\.x - targetRect\.x\)/);
  assert.match(source, /gl\.viewport\(localBakeX, paintTarget\.height - \(localBakeY \+ bakeRect\.height\), bakeRect\.width, bakeRect\.height\)/);
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
    pruneRasterHistoryGpuHotBudget(options) {
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

  assert.match(brushSource, /const BRUSH_HISTORY_BATCH_IDLE_MS = 1000/);
  assert.match(brushSource, /window\.addEventListener\("cbo:before-raster-history-capture", this\.handleBeforeRasterHistoryCapture\)/);
  assert.match(brushSource, /handleBeforeRasterHistoryCapture\(event\)/);
  assert.match(brushSource, /this\.flushPendingBrushHistory\(\{\s*source: source \? `brush-before-\$\{source\}` : "brush-before-raster-history",\s*\}\)/);
  assert.match(rendererSource, /new CustomEvent\("cbo:before-raster-history-capture"/);
  assert.match(rendererSource, /source: options\.source \|\| options\.label \|\| "raster-tile-history"/);
});
