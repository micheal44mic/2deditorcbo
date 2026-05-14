const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("brush studio exposes auto pressure as a persisted stroke setting", () => {
  const defaultsSource = fs.readFileSync(path.join(repoRoot, "js", "brush-defaults.js"), "utf8");
  const studioSource = fs.readFileSync(path.join(repoRoot, "js", "brush-studio.js"), "utf8");
  const previewSource = fs.readFileSync(path.join(repoRoot, "js", "brush-preview.js"), "utf8");

  assert.match(defaultsSource, /velocityPressureEnabled: false/);
  assert.match(defaultsSource, /nextSettings\.velocityPressureEnabled = nextSettings\.velocityPressureEnabled === true/);
  assert.match(studioSource, /key: "velocityPressureEnabled"[\s\S]*label: "AUTO PRESSURE"/);
  assert.match(previewSource, /"velocityPressureEnabled"/);
});

test("brush engine maps non-pen pointer velocity to smoothed pressure", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /const STROKE_SAMPLE_CLAMP_MIN_PADDING = 64/);
  assert.match(source, /const MAX_STAMPS_PER_FLUSH = 4096/);
  assert.match(source, /const MOBILE_MAX_STAMPS_PER_FLUSH = 1024/);
  assert.match(source, /const VELOCITY_PRESSURE_MAX_SPEED = 5/);
  assert.match(source, /const VELOCITY_PRESSURE_SMOOTHING = 0\.02/);
  assert.match(source, /clampStrokeSamplePoint\(x, y\)/);
  assert.match(source, /const point = this\.clampStrokeSamplePoint\(docX, docY\)/);
  assert.match(source, /getMaxStampsPerFlush\(\)/);
  assert.match(source, /this\.stampsBuffer\.length >= this\.getMaxStampsPerFlush\(\)/);
  assert.match(source, /uploadStampInstanceData\(instanceData\)/);
  assert.match(source, /gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, instanceData\)/);
  assert.match(source, /this\.brushState\.velocityPressureEnabled === true/);
  assert.match(source, /pointerType !== "pen"/);
  assert.match(source, /this\.currentStrokeTool !== "eraser"/);
  assert.match(source, /const speed = this\.clamp\(distance \/ deltaTime, 0, VELOCITY_PRESSURE_MAX_SPEED\)/);
  assert.match(source, /state\.pressure \+= \(targetPressure - state\.pressure\) \* VELOCITY_PRESSURE_SMOOTHING/);
  assert.match(source, /this\.initializeVelocityPressureState\(firstSample\)/);
});
