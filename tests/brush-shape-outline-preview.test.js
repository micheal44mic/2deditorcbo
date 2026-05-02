const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("brush shape outline preview is loaded and initialized after the editor canvas", () => {
  const indexSource = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

  assert.match(indexSource, /<script src="\.\/js\/brush-engine\.js"><\/script>\s*<script src="\.\/js\/brush-shape-outline-preview\.js"><\/script>/);
  assert.match(appSource, /window\.CBO\.initEditorCanvas\(\);\s*window\.CBO\.initBrushShapeOutlinePreview\?\.\(\);/);
});

test("brush shape outline preview extracts a single alpha outline and scales like the brush", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-shape-outline-preview.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(source, /const baseSize = 200/);
  assert.match(source, /const outlineBitmapSize = 1024/);
  assert.match(source, /const maxPointerHistoryPoints = 8/);
  assert.match(source, /const minDirectionalDistance = 5/);
  assert.match(source, /const pointerAngleSmoothing = 0\.35/);
  assert.match(source, /function renderOutlineToCanvas\(canvas, image, settings\)/);
  assert.match(source, /let brushSettingsOverride = null/);
  assert.match(source, /function getShapeRotation\(settings\)/);
  assert.match(source, /function getShapeBaseRotation\(settings\)/);
  assert.match(source, /getCoverage\(data, neighborOffset, useAlpha\) <= alphaThreshold/);
  assert.match(source, /function resetPointerTracking\(\)/);
  assert.match(source, /function angleLerp\(current, target, amount\)/);
  assert.match(source, /function updatePointerAngle\(x, y\)/);
  assert.match(source, /pointerAngle = angleLerp\(pointerAngle, targetAngle, pointerAngleSmoothing\)/);
  assert.match(source, /const renderScale = size \/ baseSize/);
  assert.match(source, /const outlineRadius = Math\.max\(1, Math\.round\(renderScale \* 0\.75\)\)/);
  assert.match(source, /const rotation = getShapeBaseRotation\(settings\) \+ pointerAngle \* getShapeRotation\(settings\)/);
  assert.match(source, /canvas\.style\.transform = `rotate\(\$\{rotation\}rad\) scale\(\$\{getPreviewScale\(settings, camera\)\}\)`/);
  assert.match(source, /cbo:brush-settings-preview-change/);
  assert.match(source, /function isBrushPreviewTool\(label, toolMode, syncGroup\)/);
  assert.match(source, /label === "BRUSH" \|\|[\s\S]*label === "ERASER" \|\|[\s\S]*toolMode === "eraser" \|\|[\s\S]*\(toolMode === "brush" && syncGroup === "brush"\)/);
  assert.match(source, /activeTool = isBrushPreviewTool\(label, toolMode, syncGroup\)/);
  assert.match(source, /function updatePointerPosition\(event\)/);
  assert.match(source, /wrapper\.style\.transform = `translate\(\$\{x\}px, \$\{y\}px\)`/);
  assert.match(source, /resetPointerTracking\(\);\s*updatePointerPosition\(event\)/);
  assert.match(source, /stage\.addEventListener\("pointermove", updatePointerPosition/);
  assert.doesNotMatch(source, /shapeCount|shapeScatter|shapeCountJitter/);
  assert.match(cssSource, /\.brush-shape-outline-preview[\s\S]*width: 0;[\s\S]*height: 0;/);
  assert.match(cssSource, /\.brush-shape-outline-preview-canvas[\s\S]*top: -100px;[\s\S]*left: -100px;/);
  assert.match(cssSource, /\.brush-shape-outline-preview-canvas[\s\S]*transform-origin: center center;/);
});

test("brush studio publishes unsaved draft settings for live preview consumers", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-studio.js"), "utf8");

  assert.match(source, /new CustomEvent\("cbo:brush-settings-preview-change"/);
  assert.match(source, /settings: \{ \.\.\.draftBrushSettings \}/);
  assert.match(source, /settings: null/);
});
