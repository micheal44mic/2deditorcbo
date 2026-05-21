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

  return {
    BrushEngine: context.window.CBO.BrushEngine,
    window: context.window,
  };
}

function makeSample(x, y, index, pressure = 1) {
  return {
    pointerType: "pen",
    pressure,
    tiltX: 0,
    tiltY: 0,
    time: index * 16,
    x,
    y,
  };
}

function makeBaseStamp(x, y, distance, seed = 1) {
  return {
    distance,
    randomSeedBeforeShape: seed,
    stamp: {
      alphaScale: 1,
      pressure: 1,
      rotation: 0,
      sizeScale: 1,
      tiltX: 0,
      tiltY: 0,
      x,
      y,
    },
    tangent: { x: 1, y: 0 },
  };
}

function makeRoughCircleSamples(centerX = 100, centerY = 100, radius = 50, count = 25) {
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    const angle = Math.PI * 2 * t;
    const wobble = index % 2 === 0 ? 2 : -2;

    return makeSample(
      centerX + Math.cos(angle) * (radius + wobble),
      centerY + Math.sin(angle) * (radius - wobble),
      index,
      0.5 + t * 0.4,
    );
  });
}

test("quick line accepts a mostly straight stroke and projects it onto a perfect line", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const samples = [
    makeSample(0, 0, 0, 0.4),
    makeSample(35, 2, 1, 0.5),
    makeSample(72, -3, 2, 0.7),
    makeSample(112, 1, 3, 0.8),
    makeSample(150, 0, 4, 0.9),
  ];

  const analysis = engine.analyzeQuickLineStroke(samples);
  const lineSamples = engine.createQuickLineSamples(samples);

  assert.equal(analysis.eligible, true);
  assert.equal(lineSamples.length, samples.length);
  assert.equal(lineSamples[0].x, 0);
  assert.equal(lineSamples[0].y, 0);
  assert.equal(lineSamples[lineSamples.length - 1].x, 150);
  assert.equal(lineSamples[lineSamples.length - 1].y, 0);
  assert.equal(lineSamples[2].pressure, 0.7);
  lineSamples.forEach((sample) => {
    assert.equal(sample.y, 0);
  });
});

test("quick line rejects a curved stroke that is not close enough to a line", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const analysis = engine.analyzeQuickLineStroke([
    makeSample(0, 0, 0),
    makeSample(50, 30, 1),
    makeSample(100, 0, 2),
  ]);

  assert.equal(analysis.eligible, false);
  assert.equal(analysis.reason, "too-wobbly");
});

test("quick line hold activation swaps the live stroke for synthetic line samples", () => {
  const { BrushEngine, window } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  let renderedSamples = null;
  let renderedBaseStamps = null;
  let drawRequests = 0;
  const baseStampState = {
    baseStamps: [
      makeBaseStamp(0, 0, 0, 10),
      makeBaseStamp(60, 0, 60, 11),
      makeBaseStamp(120, 0, 120, 12),
    ],
    pathLength: 120,
    tValues: [0, 0.5, 1],
  };

  engine.camera = { zoom: 1 };
  engine.currentStrokeTool = "brush";
  engine.incrementalStrokeBakeCount = 0;
  engine.incrementalStrokeBakedRect = null;
  engine.isDrawing = true;
  engine.pendingPointerSamples = [];
  engine.quickLineHoldTimer = 0;
  engine.quickLineState = null;
  engine.recordedStroke = [
    makeSample(0, 0, 0),
    makeSample(40, 2, 1),
    makeSample(80, -2, 2),
    makeSample(120, 0, 3),
  ];
  engine.processPendingPointerSamples = () => false;
  engine.createQuickShapeBaseStampState = () => baseStampState;
  engine.renderQuickLinePreview = (lineSamples, options = {}) => {
    renderedSamples = lineSamples;
    renderedBaseStamps = options.baseStamps;
    return true;
  };
  engine.requestDraw = () => {
    drawRequests += 1;
  };

  assert.equal(engine.tryActivateQuickLine("test"), true);
  assert.equal(engine.quickLineState.active, true);
  assert.equal(engine.recordedStroke.length, 4);
  assert.equal(renderedSamples.length, 4);
  assert.equal(renderedBaseStamps.length, baseStampState.baseStamps.length);
  assert.equal(drawRequests, 1);
  assert.equal(window.CBO.lastBrushQuickLine.status, "active");
  engine.recordedStroke.forEach((sample) => {
    assert.equal(sample.y, 0);
  });
});

test("quickshape line stretches fixed base stamps without adding new ones", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const baseStampState = {
    baseStamps: [
      makeBaseStamp(0, 0, 0, 10),
      makeBaseStamp(50, 0, 50, 11),
      makeBaseStamp(100, 0, 100, 12),
    ],
    pathLength: 100,
    tValues: [0, 0.5, 1],
  };

  const shortLine = engine.createQuickLineBaseStamps([
    makeSample(0, 0, 0),
    makeSample(100, 0, 1),
  ], baseStampState);
  const longLine = engine.createQuickLineBaseStamps([
    makeSample(0, 0, 0),
    makeSample(200, 0, 1),
  ], baseStampState);

  assert.equal(shortLine.length, 3);
  assert.equal(longLine.length, 3);
  assert.equal(shortLine[1].stamp.x, 50);
  assert.equal(longLine[1].stamp.x, 100);
  assert.equal(longLine[1].randomSeedBeforeShape, 11);
});

test("quick circle accepts a closed round stroke and projects it onto a perfect circle", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const samples = makeRoughCircleSamples();
  const analysis = engine.analyzeQuickCircleStroke(samples);
  const circleSamples = engine.createQuickCircleSamples(samples, analysis);

  assert.equal(analysis.eligible, true);
  assert.equal(analysis.shapeType, "circle");
  assert.equal(circleSamples.length, samples.length);
  circleSamples.forEach((sample) => {
    const radius = Math.hypot(sample.x - analysis.center.x, sample.y - analysis.center.y);

    assert.ok(Math.abs(radius - analysis.radius) < 1e-9);
  });
  assert.ok(Math.abs(circleSamples[0].x - circleSamples[circleSamples.length - 1].x) < 1e-9);
  assert.ok(Math.abs(circleSamples[0].y - circleSamples[circleSamples.length - 1].y) < 1e-9);
});

test("quick circle accepts an imperfect hand drawn circle", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const samples = [
    makeSample(150, 96, 0),
    makeSample(134, 133, 1),
    makeSample(109, 157, 2),
    makeSample(74, 142, 3),
    makeSample(52, 106, 4),
    makeSample(68, 63, 5),
    makeSample(104, 42, 6),
    makeSample(140, 58, 7),
    makeSample(160, 92, 8),
    makeSample(145, 111, 9),
  ];
  const analysis = engine.analyzeQuickCircleStroke(samples);

  assert.equal(analysis.eligible, true);
  assert.equal(analysis.shapeType, "circle");
});

test("quickshape recognizes and preserves ellipse", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const centerX = 300;
  const centerY = 200;
  const radiusX = 120;
  const radiusY = 45;
  const samples = Array.from({ length: 64 }, (_, index) => {
    const t = index / 63;
    const angle = Math.PI * 2 * t;

    return makeSample(
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
      index,
    );
  });

  const analysis = engine.analyzeQuickCircleStroke(samples);

  assert.equal(analysis.eligible, true);
  assert.equal(analysis.shapeType, "ellipse");
  assert.ok(analysis.radiusX > analysis.radiusY * 2);

  const synthetic = engine.createQuickCircleSamplesFromGeometry(samples, {
    ...analysis,
    sampleCount: samples.length,
    tValues: engine.getQuickShapeTValues(samples),
  });
  const bounds = engine.getQuickShapeSampleBounds(synthetic);

  assert.ok(bounds.width > bounds.height * 2);
});

test("quickshape ellipse stretches fixed base stamps without adding new ones", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  const baseStampState = {
    baseStamps: [
      makeBaseStamp(0, 0, 0, 10),
      makeBaseStamp(50, 0, 50, 11),
      makeBaseStamp(100, 0, 100, 12),
    ],
    pathLength: 100,
    tValues: [0, 0.5, 1],
  };

  const smallEllipse = engine.createQuickCircleBaseStampsFromGeometry({
    center: { x: 100, y: 100 },
    radius: 75,
    radiusX: 100,
    radiusY: 50,
    startAngle: 0,
  }, baseStampState);
  const wideEllipse = engine.createQuickCircleBaseStampsFromGeometry({
    center: { x: 100, y: 100 },
    radius: 125,
    radiusX: 200,
    radiusY: 50,
    startAngle: 0,
  }, baseStampState);

  assert.equal(smallEllipse.length, 3);
  assert.equal(wideEllipse.length, 3);
  assert.equal(smallEllipse[0].stamp.x, 200);
  assert.equal(wideEllipse[0].stamp.x, 300);
  assert.equal(wideEllipse[1].randomSeedBeforeShape, 11);
});

test("quick circle rejects open arcs", () => {
  const { BrushEngine } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);

  engine.camera = { zoom: 1 };
  const arcSamples = Array.from({ length: 12 }, (_, index) => {
    const angle = Math.PI * 1.45 * (index / 11);

    return makeSample(100 + Math.cos(angle) * 50, 100 + Math.sin(angle) * 50, index);
  });
  const analysis = engine.analyzeQuickCircleStroke(arcSamples);

  assert.equal(analysis.eligible, false);
  assert.equal(analysis.reason, "open-shape");
});

test("quick hold activation falls back to a perfect circle when the stroke is closed", () => {
  const { BrushEngine, window } = loadBrushEngine();
  const engine = Object.create(BrushEngine.prototype);
  let renderedSamples = null;

  engine.camera = { zoom: 1 };
  engine.currentStrokeTool = "brush";
  engine.incrementalStrokeBakeCount = 0;
  engine.incrementalStrokeBakedRect = null;
  engine.isDrawing = true;
  engine.pendingPointerSamples = [];
  engine.quickLineHoldTimer = 0;
  engine.quickLineState = null;
  engine.recordedStroke = makeRoughCircleSamples();
  engine.processPendingPointerSamples = () => false;
  engine.renderQuickLinePreview = (lineSamples) => {
    renderedSamples = lineSamples;
    return true;
  };
  engine.requestDraw = () => {};

  assert.equal(engine.tryActivateQuickLine("test"), true);
  assert.equal(engine.quickLineState.active, true);
  assert.equal(engine.quickLineState.shapeType, "circle");
  assert.equal(window.CBO.lastBrushQuickLine.shapeType, "circle");
  renderedSamples.forEach((sample) => {
    const radius = Math.hypot(
      sample.x - engine.quickLineState.analysis.center.x,
      sample.y - engine.quickLineState.analysis.center.y,
    );

    assert.ok(Math.abs(radius - engine.quickLineState.analysis.radius) < 1e-9);
  });
});
