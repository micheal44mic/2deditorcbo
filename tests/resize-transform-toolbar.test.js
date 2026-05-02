const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("resize tool exposes the top transform mode toolbar", () => {
  const resizeButtonSource = fs.readFileSync(path.join(repoRoot, "js", "resize-button.js"), "utf8");
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const topToolbarCss = fs.readFileSync(path.join(repoRoot, "css", "top-toolbar.css"), "utf8");
  const toolbarStart = topToolbarSource.indexOf('<nav class="bottom-toolbar transform-mode-toolbar"');
  const toolbarEnd = topToolbarSource.indexOf('<div class="brush-quick-controls"', toolbarStart);
  const transformToolbarMarkup = topToolbarSource.slice(toolbarStart, toolbarEnd);

  assert.match(resizeButtonSource, /data-tool-mode="resize"/);
  assert.match(topToolbarSource, /data-transform-mode-toolbar/);
  assert.match(topToolbarSource, /lucide-scaling/);
  assert.match(topToolbarSource, /M12 3H5a2 2 0 0 0-2 2v14/);
  assert.match(topToolbarSource, /FREE TRANSFORM/);
  assert.match(topToolbarSource, /PERSPECTIVE DISTORTION/);
  assert.doesNotMatch(topToolbarSource, /FREE DISTORTION/);
  assert.doesNotMatch(topToolbarSource, /free-distort/);
  assert.match(topToolbarSource, /allowedTransformModes = new Set\(\["free", "perspective"\]\)/);
  assert.match(topToolbarSource, /data-raster-transform-action="cancel"/);
  assert.match(topToolbarSource, /data-raster-transform-action="accept"/);
  assert.match(topToolbarSource, /cbo:raster-transform-action/);
  assert.match(topToolbarSource, /cbo:raster-transform-state-change/);
  assert.doesNotMatch(topToolbarSource, /TRASFORMAZIONE LIBERA/);
  assert.doesNotMatch(topToolbarSource, /DISTORSIONE PROSPETTICA/);
  assert.doesNotMatch(topToolbarSource, /DISTORSIONE LIBERA/);
  assert.doesNotMatch(transformToolbarMarkup, /<span>/);
  assert.match(topToolbarSource, /cbo:transform-mode-change/);
  assert.match(topToolbarSource, /label === "RESIZE" \|\| toolMode === "resize"/);
  assert.match(topToolbarCss, /\.transform-mode-toolbar/);
  assert.match(topToolbarCss, /left: calc\(var\(--left-panel-width\)/);
  assert.match(topToolbarCss, /transform: translateX\(-50%\)/);
  assert.match(topToolbarCss, /width: 37px/);
  assert.match(topToolbarCss, /\.transform-action-button/);
});
