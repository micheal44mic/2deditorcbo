const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function readSource(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
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

function readBrushEngineSources() {
  return [
    ["js", "brush-engine-shader-grain.js"],
    ["js", "brush-engine-target-gpu.js"],
    ["js", "brush-engine-history.js"],
    ["js", "brush-engine-sampler.js"],
    ["js", "brush-engine-stroke-input.js"],
    ["js", "brush-engine.js"],
  ]
    .map((parts) => readSource(...parts))
    .join("\n");
}

test("brush antialiasing is a normalized brush rendering setting", () => {
  const BrushDefaults = loadBrushDefaults();
  const defaultsSource = readSource("js", "brush-defaults.js");
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");

  assert.equal(BrushDefaults.createSettings({}).antiAliasing, true);
  assert.equal(BrushDefaults.createSettings({ antiAliasing: false }).antiAliasing, false);
  assert.equal(BrushDefaults.createSettings({ antiAliasing: 0 }).antiAliasing, true);
  assert.match(defaultsSource, /antiAliasing: true/);
  assert.match(defaultsSource, /nextSettings\.antiAliasing = nextSettings\.antiAliasing !== false/);
  assert.match(studioSource, /key: "antiAliasing"[\s\S]*label: "ANTIALIAS"/);
  assert.match(previewSource, /"antiAliasing"/);
  assert.match(previewSource, /function isAntiAliasingEnabled\(settings\)/);
});

test("brush shader switches shape sampling and hard round edges when antialiasing is off", () => {
  const engineSource = readBrushEngineSources();

  assert.match(engineSource, /uniform bool u_antiAliasing/);
  assert.match(engineSource, /antiAliasing: gl\.getUniformLocation\(program, "u_antiAliasing"\)/);
  assert.match(engineSource, /isAntiAliasingEnabled\(\) \{/);
  assert.match(engineSource, /gl\.uniform1i\(brushProgramInfo\.uniforms\.antiAliasing, this\.isAntiAliasingEnabled\(\) \? 1 : 0\)/);
  assert.match(engineSource, /fwidth\(uv\) \* 0\.55/);
  assert.match(engineSource, /return \(center \+ right \+ left \+ top \+ bottom\) \/ 8\.0/);
  assert.match(engineSource, /texelFetch\(u_shapeTexture, texel, 0\)\.a/);
  assert.match(engineSource, /float aaWidth = u_antiAliasing \? fw \* 1\.35 : 0\.0/);
  assert.match(engineSource, /0\.5 \+ aaWidth/);
  assert.match(engineSource, /!\u0075_antiAliasing && effectiveHardness >= 0\.999/);
  assert.match(engineSource, /!\u0075_antiAliasing && safeHardness >= 0\.999/);
});

test("antialiasing does not override configured brush stamp spacing", () => {
  const engineSource = readBrushEngineSources();

  assert.match(engineSource, /this\.brushState\?\.adaptiveSpacingEnabled === true/);
  assert.match(engineSource, /brushSize \* effectiveSizeScale \* effectiveSpacing \* adaptiveSpacingMultiplier/);
  assert.doesNotMatch(engineSource, /isAntiAliasingEnabled\?\.\(\) !== true/);
  assert.doesNotMatch(engineSource, /getAntialiasSpacingScale/);
  assert.doesNotMatch(engineSource, /antialiasSpacingScale/);
  assert.match(engineSource, /settings\.antiAliasing !== false \? 1 : 0/);
});
