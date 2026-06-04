const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function readSource(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

function loadStrokeMath() {
  const context = {
    Date,
    Math,
    Number,
    Object,
    window: { CBO: {} },
  };

  vm.createContext(context);
  vm.runInContext(readSource("js", "stroke-math.js"), context);
  return context.window.CBO.StrokeMath;
}

function loadBrushDefaults() {
  const context = {
    Math,
    Number,
    Object,
    Set,
    String,
    window: { CBO: {} },
  };

  vm.createContext(context);
  vm.runInContext(readSource("js", "brush-defaults.js"), context);
  return context.window.CBO.BrushDefaults;
}

const smoothingRawPoints = Object.freeze([
  Object.freeze({ x: 0, y: 0, time: 0 }),
  Object.freeze({ x: 36, y: 15, time: 16 }),
  Object.freeze({ x: 72, y: -14, time: 32 }),
  Object.freeze({ x: 108, y: 16, time: 48 }),
  Object.freeze({ x: 144, y: -15, time: 64 }),
  Object.freeze({ x: 180, y: 15, time: 80 }),
  Object.freeze({ x: 216, y: -13, time: 96 }),
  Object.freeze({ x: 252, y: 14, time: 112 }),
]);

function getPointOnly(point) {
  return {
    x: point.x,
    y: point.y,
  };
}

function runStrokeSmoothingPath(StrokeMath, pointerType, amount, rawPoints = smoothingRawPoints) {
  const state = StrokeMath.createStrokeState(rawPoints[0], {
    pressure: 1,
    seed: 1,
    time: rawPoints[0].time,
  });
  const outputPoints = [getPointOnly(rawPoints[0])];
  const results = [];

  rawPoints.slice(1).forEach((point) => {
    const result = StrokeMath.processStrokeInput(
      point,
      state,
      {
        radius: 18,
        ropeStabilizationAmount: 0,
        strokeSmoothingAmount: amount,
      },
      1,
      { pointerType, time: point.time, cameraZoom: 1, dpr: 1 },
    );

    results.push(result);
    outputPoints.push(getPointOnly(result.point));
  });

  return {
    outputPoints,
    results,
  };
}

function getMaxPointDelta(rawPoints, outputPoints) {
  return outputPoints.reduce((maxDelta, point, index) => {
    const rawPoint = rawPoints[index];
    const delta = Math.hypot(point.x - rawPoint.x, point.y - rawPoint.y);

    return Math.max(maxDelta, delta);
  }, 0);
}

function getAbsoluteYTotal(points) {
  return points.reduce((total, point) => total + Math.abs(point.y), 0);
}

test("brush defaults persist pencil controls and expose rope plus smoothing stabilizers", () => {
  const BrushDefaults = loadBrushDefaults();
  const defaultsSource = readSource("js", "brush-defaults.js");
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");
  const normalized = BrushDefaults.createSettings({
    ropeStabilizationAmount: 0.37,
    strokeSmoothingAmount: 0.42,
    smoothing: 1,
    streamLineAmount: 1,
    streamLinePressure: 1,
    stabilizationAmount: 1,
    motionFilteringAmount: 1,
    motionFilteringExpression: 1,
  });

  assert.match(defaultsSource, /pencilInputVersion: 2/);
  assert.match(defaultsSource, /pencilPressureCurveMid: 0\.5/);
  assert.match(defaultsSource, /penPressureSize: 0/);
  assert.match(defaultsSource, /pencilPressureSize: 0/);
  assert.match(defaultsSource, /pencilPressureFlow: 0/);
  assert.match(defaultsSource, /pencilPressureBleed: 0/);
  assert.match(defaultsSource, /pencilTiltTrigger: 45/);
  assert.match(defaultsSource, /pencilTiltGradation: 0/);
  assert.match(defaultsSource, /pencilTiltSizeCompression: false/);
  assert.match(defaultsSource, /pencilBarrelRelativeToStroke: true/);
  assert.match(defaultsSource, /ropeStabilizationAmount: 0/);
  assert.match(defaultsSource, /strokeSmoothingAmount: 0/);
  assert.match(defaultsSource, /!hasOwn\(nextOverrides, "pencilInputVersion"\)[\s\S]*nextSettings\.pencilPressureSize = 0/);
  assert.match(defaultsSource, /nextSettings\.penPressureSize = nextSettings\.pencilPressureSize/);
  assert.match(studioSource, /"PENCIL"/);
  assert.match(studioSource, /key: "pencilPressureSize"[\s\S]*label: "SIZE"/);
  assert.match(studioSource, /key: "pencilPressureFlow"[\s\S]*label: "FLOW"/);
  assert.match(studioSource, /key: "pencilTiltTrigger"[\s\S]*label: "TRIGGER"/);
  assert.match(studioSource, /key: "pencilBarrelSize"[\s\S]*label: "SIZE"/);
  assert.match(studioSource, /"STABILIZATION"/);
  assert.match(studioSource, /key: "ropeStabilizationAmount"[\s\S]*label: "PULLED STRING"/);
  assert.match(studioSource, /key: "strokeSmoothingAmount"[\s\S]*label: "SMOOTHING"/);
  assert.doesNotMatch(studioSource, /key: "streamLineAmount"/);
  assert.doesNotMatch(studioSource, /key: "stabilizationAmount"/);
  assert.doesNotMatch(studioSource, /key: "motionFilteringAmount"/);
  assert.match(previewSource, /"pencilPressureFlow"/);
  assert.match(previewSource, /"ropeStabilizationAmount"/);
  assert.match(previewSource, /"strokeSmoothingAmount"/);
  assert.doesNotMatch(previewSource, /"streamLineAmount"/);
  assert.doesNotMatch(previewSource, /"stabilizationAmount"/);
  assert.doesNotMatch(previewSource, /"motionFilteringAmount"/);
  assert.equal(normalized.ropeStabilizationAmount, 0.37);
  assert.equal(normalized.strokeSmoothingAmount, 0.42);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "smoothing"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "streamLineAmount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "streamLinePressure"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "stabilizationAmount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "motionFilteringAmount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "motionFilteringExpression"), false);
});

test("stroke smoothing softens a wobbly path without copying every raw wobble", () => {
  const StrokeMath = loadStrokeMath();
  const rawPoints = [
    { x: 0, y: 0, time: 0 },
    { x: 40, y: 20, time: 16 },
    { x: 80, y: -20, time: 32 },
    { x: 120, y: 20, time: 48 },
    { x: 160, y: -20, time: 64 },
    { x: 200, y: 20, time: 80 },
  ];
  const state = StrokeMath.createStrokeState(rawPoints[0], { pressure: 1, seed: 1 });
  let result = { point: rawPoints[0] };

  rawPoints.slice(1).forEach((point) => {
    result = StrokeMath.processStrokeInput(
      point,
      state,
      { strokeSmoothingAmount: 1, radius: 18 },
      1,
      { pointerType: "pen", time: point.time, cameraZoom: 1, dpr: 1 },
    );
  });

  assert.ok(Math.abs(result.point.y) < Math.abs(rawPoints.at(-1).y));
  assert.notEqual(result.point.y, rawPoints.at(-1).y);
  assert.ok(result.point.x < rawPoints.at(-1).x);
  assert.ok(result.point.x > rawPoints.at(-2).x);
});

test("stroke smoothing amount zero leaves mouse touch and pen paths unchanged", () => {
  const StrokeMath = loadStrokeMath();
  const rawPointOnly = smoothingRawPoints.map(getPointOnly);

  ["mouse", "touch", "pen"].forEach((pointerType) => {
    const { outputPoints, results } = runStrokeSmoothingPath(StrokeMath, pointerType, 0);

    assert.deepEqual(outputPoints, rawPointOnly);
    assert.equal(results.some((result) => Object.prototype.hasOwnProperty.call(result, "stabilizationGuide")), false);
  });
});

test("stroke smoothing amount one visibly filters mouse touch and pen without pulled string", () => {
  const StrokeMath = loadStrokeMath();
  const rawYTotal = getAbsoluteYTotal(smoothingRawPoints);
  const expectations = [
    { pointerType: "mouse", minDelta: 10, maxYRatio: 0.58 },
    { pointerType: "touch", minDelta: 8, maxYRatio: 0.72 },
    { pointerType: "pen", minDelta: 3, maxYRatio: 0.88 },
  ];
  const outputsByPointer = new Map();

  expectations.forEach(({ pointerType, minDelta, maxYRatio }) => {
    const { outputPoints, results } = runStrokeSmoothingPath(StrokeMath, pointerType, 1);
    const maxDelta = getMaxPointDelta(smoothingRawPoints, outputPoints);
    const outputYTotal = getAbsoluteYTotal(outputPoints);

    outputsByPointer.set(pointerType, outputPoints);
    assert.ok(maxDelta >= minDelta, `${pointerType} smoothing should visibly move the stroke path`);
    assert.ok(outputYTotal < rawYTotal * maxYRatio, `${pointerType} smoothing should reduce lateral wobble`);
    assert.ok(outputPoints.at(-1).x > smoothingRawPoints.at(-2).x);
    assert.equal(results.some((result) => Object.prototype.hasOwnProperty.call(result, "stabilizationGuide")), false);
  });

  assert.ok(getAbsoluteYTotal(outputsByPointer.get("mouse")) < getAbsoluteYTotal(outputsByPointer.get("touch")));
  assert.ok(getAbsoluteYTotal(outputsByPointer.get("touch")) < getAbsoluteYTotal(outputsByPointer.get("pen")));
});

test("legacy brush stabilizer settings do not change stroke points without the new rope control", () => {
  const StrokeMath = loadStrokeMath();
  const state = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const point = { x: 60, y: -12 };
  const result = StrokeMath.processStrokeInput(
    point,
    state,
    {
      streamLineAmount: 1,
      streamLinePressure: 1,
      stabilizationAmount: 1,
      motionFilteringAmount: 1,
      motionFilteringExpression: 1,
      smoothing: 1,
    },
    0.42,
    { pointerType: "pen", time: 16, cameraZoom: 1, dpr: 1 },
  );

  assert.deepEqual(result.point, point);
  assert.equal(result.pressure, 0.42);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "stabilizationGuide"), false);
});

test("rope stabilizer waits for tension and follows the pulled point smoothly", () => {
  const StrokeMath = loadStrokeMath();
  const state = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const settings = { ropeStabilizationAmount: 1, radius: 18 };
  const ropeLength = StrokeMath.getRopeStabilizationLength(settings, { cameraZoom: 1, dpr: 1 });
  const near = StrokeMath.processStrokeInput(
    { x: ropeLength * 0.5, y: 0 },
    state,
    settings,
    1,
    { pointerType: "pen", time: 16, cameraZoom: 1, dpr: 1 },
  );
  const far = StrokeMath.processStrokeInput(
    { x: ropeLength + 80, y: 0 },
    state,
    settings,
    1,
    { pointerType: "pen", time: 32, cameraZoom: 1, dpr: 1 },
  );
  const pulledPointX = ropeLength + 80 - ropeLength;

  assert.equal(near.point.x, 0);
  assert.equal(near.stabilizationGuide.taut, false);
  assert.equal(far.stabilizationGuide.taut, true);
  assert.ok(far.point.x > 0);
  assert.ok(far.point.x < pulledPointX);
  assert.ok(Math.abs(far.stabilizationGuide.outputPoint.x - far.point.x) < 1e-9);
});

test("rope stabilizer smooths a wobbly pull path instead of copying it", () => {
  const StrokeMath = loadStrokeMath();
  const rawPoints = [
    { x: 0, y: 0, time: 0 },
    { x: 80, y: 24, time: 16 },
    { x: 130, y: -24, time: 32 },
    { x: 180, y: 24, time: 48 },
    { x: 230, y: -24, time: 64 },
  ];
  const state = StrokeMath.createStrokeState(rawPoints[0], { pressure: 1, seed: 1 });
  let result = { point: rawPoints[0] };

  rawPoints.slice(1).forEach((point) => {
    result = StrokeMath.processStrokeInput(
      point,
      state,
      { ropeStabilizationAmount: 1, radius: 18 },
      1,
      { pointerType: "pen", time: point.time, cameraZoom: 1, dpr: 1 },
    );
  });

  assert.ok(Math.abs(result.point.y) < Math.abs(rawPoints.at(-1).y));
  assert.notEqual(result.point.y, rawPoints.at(-1).y);
});

test("stylus release pressure and missing tilt do not inflate the final dab", () => {
  const StrokeMath = loadStrokeMath();
  const samplerSource = readSource("js", "brush-engine-sampler.js");
  const state = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const processed = StrokeMath.processStrokeInput({ x: 1, y: 1 }, state, {}, 0);

  assert.equal(StrokeMath.normalizePressure(0), 0);
  assert.equal(processed.pressure, 0);
  assert.match(samplerSource, /Number\.isFinite\(pressure\)[\s\S]*\? this\.clamp\(pressure, 0, 1\)[\s\S]*: 1/);
  assert.match(samplerSource, /rawAltitudeAngle != null && Number\.isFinite\(altitudeAngle\)/);
});

test("brush engine normalizes stylus samples and applies pencil dynamics to stamps", () => {
  const inputSource = readSource("js", "brush-engine-stroke-input.js");
  const samplerSource = readSource("js", "brush-engine-sampler.js");
  const shaderGrainSource = readSource("js", "brush-engine-shader-grain.js");
  const targetGpuSource = readSource("js", "brush-engine-target-gpu.js");

  assert.match(inputSource, /normalizePointerPressure\(event, isMouse = false\)/);
  assert.match(inputSource, /const pointerType = String\(event\?\.pointerType \|\| ""\)\.toLowerCase\(\)/);
  assert.match(inputSource, /if \(pointerType !== "pen"\) \{[\s\S]*?return 1\.0/);
  assert.match(inputSource, /createPointerTiltFromAngles\(altitudeAngle, azimuthAngle\)/);
  assert.match(samplerSource, /processStrokeSample\(rawSample\)/);
  assert.match(inputSource, /clearRopeStabilizationGuide\?\.\(\)/);
  assert.match(samplerSource, /cbo:brush-rope-stabilization-guide/);
  assert.match(inputSource, /flowScale: stamp\.flowScale \?\? 1/);
  assert.match(inputSource, /bleedScale: stamp\.bleedScale \?\? 0/);
  assert.match(samplerSource, /isPencilPointerSample\(sample\)[\s\S]*pointerType/);
  assert.match(samplerSource, /getPencilPressureCurveValue\(sample\)/);
  assert.match(samplerSource, /getPencilTiltAmount\(sample\)/);
  assert.match(samplerSource, /getPencilBarrelRollAmount\(stamp, tangent = null\)/);
  assert.match(samplerSource, /getStampSpacing\(sizeScaleOrStamp = 1\)/);
  assert.match(samplerSource, /const pressureSizeFactor = stamp \? this\.lerp\(this\.getMinSizeRatio\(\), 1, pressure\) : 1/);
  assert.match(samplerSource, /stamp\.flowScale = \(stamp\.flowScale \?\? 1\) \* this\.lerp\(1, pressure, pressureFlow\)/);
  assert.match(samplerSource, /stamp\.bleedScale = Math\.max\(stamp\.bleedScale \?\? 0, pressure \* pressureBleed\)/);
  assert.match(shaderGrainSource, /layout\(location = 12\) in float aInstanceFlowScale/);
  assert.match(shaderGrainSource, /layout\(location = 13\) in float aInstanceBleedScale/);
  assert.match(shaderGrainSource, /layout\(location = 14\) in float aInstanceSizeCompressionScale/);
  assert.match(shaderGrainSource, /float flow = clamp\(u_flow \* v_flowScale, 0\.0, 2\.0\)/);
  assert.match(targetGpuSource, /const offset = index \* 18/);
  assert.match(targetGpuSource, /instanceData\[offset \+ 16\] = stamp\.bleedScale \?\? 0/);
});
