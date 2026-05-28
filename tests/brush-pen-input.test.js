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

test("brush defaults persist pencil and motion filtering controls", () => {
  const defaultsSource = readSource("js", "brush-defaults.js");
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");

  assert.match(defaultsSource, /motionFilteringAmount: 0/);
  assert.match(defaultsSource, /motionFilteringExpression: 0/);
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
  assert.match(defaultsSource, /!hasOwn\(nextOverrides, "pencilInputVersion"\)[\s\S]*nextSettings\.pencilPressureSize = 0/);
  assert.match(defaultsSource, /nextSettings\.penPressureSize = nextSettings\.pencilPressureSize/);
  assert.match(studioSource, /"PENCIL"/);
  assert.match(studioSource, /key: "pencilPressureSize"[\s\S]*label: "SIZE"/);
  assert.match(studioSource, /key: "pencilPressureFlow"[\s\S]*label: "FLOW"/);
  assert.match(studioSource, /key: "pencilTiltTrigger"[\s\S]*label: "TRIGGER"/);
  assert.match(studioSource, /key: "pencilBarrelSize"[\s\S]*label: "SIZE"/);
  assert.match(studioSource, /key: "motionFilteringAmount"[\s\S]*label: "MOTION FILTERING"/);
  assert.match(studioSource, /key: "motionFilteringExpression"[\s\S]*label: "EXPRESSION"/);
  assert.match(previewSource, /"pencilPressureFlow"/);
  assert.match(previewSource, /"motionFilteringAmount"/);
});

test("motion filtering removes lateral wobble while expression restores some motion", () => {
  const StrokeMath = loadStrokeMath();
  const points = [
    { x: 1, y: 9 },
    { x: 2, y: -8 },
    { x: 3, y: 10 },
    { x: 4, y: -9 },
    { x: 5, y: 8 },
    { x: 6, y: -10 },
  ];
  const rawState = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const filteredState = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const expressiveState = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  let rawPoint;
  let filteredPoint;
  let expressivePoint;

  points.forEach((point) => {
    rawPoint = StrokeMath.processStrokeInput(point, rawState, { motionFilteringAmount: 0 }, 1).point;
    filteredPoint = StrokeMath.processStrokeInput(point, filteredState, { motionFilteringAmount: 1 }, 1).point;
    expressivePoint = StrokeMath.processStrokeInput(
      point,
      expressiveState,
      { motionFilteringAmount: 1, motionFilteringExpression: 1 },
      1,
    ).point;
  });

  assert.ok(Math.abs(filteredPoint.y) < Math.abs(rawPoint.y));
  assert.ok(Math.abs(expressivePoint.y) > Math.abs(filteredPoint.y));
});

test("motion filtering adapts to pen mouse and touch input", () => {
  const StrokeMath = loadStrokeMath();
  const points = [
    { x: 1, y: 9, time: 16 },
    { x: 2, y: -8, time: 32 },
    { x: 3, y: 10, time: 48 },
    { x: 4, y: -9, time: 64 },
    { x: 5, y: 8, time: 80 },
    { x: 6, y: -10, time: 96 },
    { x: 7, y: 9, time: 112 },
    { x: 8, y: -8, time: 128 },
  ];
  const runStroke = (pointerType) => {
    const state = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
    let result = points[0];

    points.forEach((point) => {
      result = StrokeMath.processStrokeInput(
        point,
        state,
        { motionFilteringAmount: 1 },
        1,
        { pointerType, time: point.time },
      ).point;
    });

    return result;
  };
  const penPoint = runStroke("pen");
  const mousePoint = runStroke("mouse");
  const touchPoint = runStroke("touch");

  assert.ok(Math.abs(touchPoint.y) < Math.abs(mousePoint.y));
  assert.ok(Math.abs(mousePoint.y) < Math.abs(penPoint.y));
});

test("stabilization uses a pulled-string rope before the brush follows the cursor", () => {
  const StrokeMath = loadStrokeMath();
  const state = StrokeMath.createStrokeState({ x: 0, y: 0 }, { pressure: 1, seed: 1 });
  const settings = { stabilizationAmount: 1, radius: 18 };
  const near = StrokeMath.processStrokeInput(
    { x: 30, y: 0 },
    state,
    settings,
    1,
    { pointerType: "pen", time: 16, cameraZoom: 1, dpr: 1 },
  );
  const far = StrokeMath.processStrokeInput(
    { x: 60, y: 0 },
    state,
    settings,
    1,
    { pointerType: "pen", time: 32, cameraZoom: 1, dpr: 1 },
  );

  assert.equal(near.point.x, 0);
  assert.equal(near.stabilizationGuide.taut, false);
  assert.equal(far.stabilizationGuide.taut, true);
  assert.ok(far.point.x > 0);
  assert.ok(far.point.x < 60);
  assert.ok(Math.abs((60 - far.point.x) - far.stabilizationGuide.ropeLength) < 1e-9);
});

test("pulled-string stabilization pivots through pen corners instead of averaging them away", () => {
  const StrokeMath = loadStrokeMath();
  const points = [
    { x: 0, y: 0, time: 0 },
    { x: 30, y: 0, time: 16 },
    { x: 60, y: 0, time: 32 },
    { x: 90, y: 0, time: 48 },
    { x: 120, y: 0, time: 64 },
    { x: 120, y: 30, time: 80 },
    { x: 120, y: 60, time: 96 },
    { x: 120, y: 90, time: 112 },
    { x: 120, y: 120, time: 128 },
  ];
  const state = StrokeMath.createStrokeState(points[0], { pressure: 1, seed: 1, time: points[0].time });
  let result = { point: points[0] };

  points.slice(1).forEach((point) => {
    result = StrokeMath.processStrokeInput(
      point,
      state,
      { stabilizationAmount: 1, motionFilteringAmount: 1, radius: 18 },
      1,
      { pointerType: "pen", time: point.time, cameraZoom: 1, dpr: 1 },
    ).point;
  });

  assert.ok(result.x > 110);
  assert.ok(result.y > 70);
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
  assert.match(inputSource, /settings\.motionFilteringAmount/);
  assert.match(inputSource, /clearStabilizationGuide\?\.\(\)/);
  assert.match(samplerSource, /cbo:brush-stabilization-guide/);
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
