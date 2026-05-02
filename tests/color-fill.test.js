const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("color drop is wired to the Procreate-style fill module", () => {
  const indexSource = readRepoFile("index.html");
  const colorDropSource = readRepoFile("js", "color-drop.js");
  const imageRasterizerIndex = indexSource.indexOf("./js/images/image-rasterizer.js");
  const colorFillIndex = indexSource.indexOf("./js/color-fill.js");
  const editorCanvasIndex = indexSource.indexOf("./js/editor-canvas.js");
  const appIndex = indexSource.indexOf("./js/app.js");

  assert.ok(imageRasterizerIndex > 0);
  assert.ok(colorFillIndex > imageRasterizerIndex);
  assert.ok(editorCanvasIndex > colorFillIndex);
  assert.ok(appIndex > editorCanvasIndex);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.beginDropDrag\?\.\(\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.dropColorAt\?\.\(dropX, dropY, color\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.endDropDrag\?\.\(\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.cancelDropDrag\?\.\(\)/);
});

test("color fill uses active layer pixels unless a reference layer is set", () => {
  const source = readRepoFile("js", "color-fill.js");

  assert.match(source, /function setReferenceLayerId\(layerId, options = \{\}\)/);
  assert.match(source, /function clearReferenceLayerId\(options = \{\}\)/);
  assert.match(source, /function getExistingRasterTarget\(layerId\)/);
  assert.match(source, /function getReferenceTarget\(writeTarget\)/);
  assert.match(source, /const referenceTarget = getReferenceTarget\(target\)/);
  assert.match(source, /const referenceFramebuffer = referenceTarget\.framebuffer/);
  assert.match(source, /return null;/);
  assert.doesNotMatch(source, /updatePreviewCacheIfNeeded/);
  assert.doesNotMatch(source, /previewFramebuffer/);
  assert.doesNotMatch(source, /ensureActivePaintLayer\?\.\(\{ source: "color-fill" \}\)/);
  assert.match(source, /new Int32Array\(pixelCount\)/);
  assert.match(source, /function getDilationRadius\(tolerance\)/);
  assert.match(source, /if \(normalizedTolerance < 16\) \{/);
  assert.match(source, /function dilateMask\(mask, width, height, bounds, radius = 1\)/);
  assert.match(source, /getDilationRadius\(tolerance\)/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, dirtyRect, "color-fill-before"\)/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, dirtyRect, "color-fill-after"\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\(layerId, beforeSnapshot/);
  assert.match(source, /gl\.texSubImage2D\(/);
  assert.match(source, /brushEngine\.screenToDocumentSpace\(clientX, clientY\)/);
});

test("color fill exposes a top-center threshold range styled like quick brush controls", () => {
  const source = readRepoFile("js", "color-fill.js");
  const cssSource = readRepoFile("css", "color-drop.css");

  assert.match(source, /DEFAULT_FILL_TOLERANCE = 48/);
  assert.match(source, /className = "bottom-toolbar color-fill-threshold-toolbar"/);
  assert.match(source, /type="range" min="0" max="\$\{MAX_FILL_TOLERANCE\}" step="1"/);
  assert.match(source, /setTolerance\(thresholdInput\.value\)/);
  assert.match(cssSource, /\.color-fill-threshold-toolbar/);
  assert.match(cssSource, /left: calc\(var\(--left-panel-width\) \+ \(\(100vw - var\(--left-panel-width\) - var\(--right-panel-width\)\) \/ 2\)\)/);
  assert.match(cssSource, /--color-fill-threshold-progress/);
});

test("layers panel exposes a right-click reference layer action", () => {
  const source = readRepoFile("js", "layers-panel.js");
  const cssSource = readRepoFile("css", "layers-panel.css");

  assert.match(source, /panel\.addEventListener\("contextmenu"/);
  assert.match(source, /data-layer-context-action="reference"/);
  assert.match(source, /SET AS REFERENCE/);
  assert.match(source, /REMOVE REFERENCE/);
  assert.match(source, /window\.CBO\.colorFill\.setReferenceLayerId\(layerId, \{ source \}\)/);
  assert.match(source, /window\.CBO\.colorFill\.clearReferenceLayerId\(\{ source \}\)/);
  assert.match(source, /classList\.toggle\("reference-layer"/);
  assert.match(source, /cbo:color-fill-reference-change/);
  assert.match(cssSource, /\.layer-row\.reference-layer \.layer-info::after/);
  assert.match(cssSource, /\.layer-context-menu/);
});
