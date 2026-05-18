const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("vertical toolbar places layer style below resize", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "vertical-toolbar.js"), "utf8");
  const resizeIndex = source.indexOf("${window.CBO.createResizeButton ? window.CBO.createResizeButton() : \"\"}");
  const layerStyleIndex = source.indexOf("vertical-layer-style-button");

  assert.notEqual(resizeIndex, -1);
  assert.notEqual(layerStyleIndex, -1);
  assert.ok(layerStyleIndex > resizeIndex);
  assert.match(source, /aria-label="LAYER STYLE"/);
  assert.match(source, /data-tool-mode="layer-style"/);
  assert.match(source, /vertical-layer-style-button[\s\S]*<svg\b/);
});
