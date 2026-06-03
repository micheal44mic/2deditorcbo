const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

const brushEngineModulePaths = [
  ["js", "brush-engine-shader-grain.js"],
  ["js", "brush-engine-target-gpu.js"],
  ["js", "brush-engine-history.js"],
  ["js", "brush-engine-sampler.js"],
  ["js", "brush-engine-stroke-input.js"],
  ["js", "brush-engine.js"],
];

function readBrushEngineSources() {
  return brushEngineModulePaths
    .map((parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8"))
    .join("\n");
}

function loadBrushEngine() {
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
          toggle() {},
        },
      },
      querySelector: () => null,
    },
    navigator: {},
    window,
  });

  vm.runInContext(readBrushEngineSources(), context);

  return context.window.CBO.BrushEngine;
}

function createSpacingEngine({
  dpr = 1,
  multiplier = 1,
  radius = 33,
  spacing = 0.18,
  zoom = 1,
} = {}) {
  const BrushEngine = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.activeStrokeSpacingMultiplier = multiplier;
  engine.brushState = {
    radius,
    spacing,
    spacingJitter: 0,
    shapeCount: 1,
    shapeCountJitter: 0,
    shapeScatter: 0,
  };
  engine.camera = { zoom };
  engine.currentStrokeTool = "brush";
  engine.dpr = dpr;
  engine.isDrawing = true;
  engine.largeBlendFinalQualityReplay = false;
  engine.strokeRandomState = { seed: 1 };
  engine.strokeTotalLength = null;

  return engine;
}

test("small projected brushes cap only the automatic adaptive spacing multiplier", () => {
  const engine = createSpacingEngine({
    dpr: 1,
    multiplier: 3,
    radius: 33,
    spacing: 0.18,
    zoom: 0.35,
  });

  const cap = engine.getSmallBrushAdaptiveSpacingCap();

  assert.ok(cap > 1);
  assert.ok(cap < 1.12);
  assert.equal(engine.getActiveAdaptiveSpacingMultiplier(), cap);
  assert.ok(engine.getStampSpacing() <= 33 * 0.18 * 1.12);
});

test("full-size brush previews keep the existing adaptive spacing behavior", () => {
  const engine = createSpacingEngine({
    dpr: 1,
    multiplier: 2.5,
    radius: 33,
    spacing: 0.18,
    zoom: 1,
  });

  assert.equal(engine.getSmallBrushAdaptiveSpacingCap(), Infinity);
  assert.equal(engine.getActiveAdaptiveSpacingMultiplier(), 2.5);
  assert.equal(engine.getStampSpacing(), 33 * 0.18 * 2.5);
});
