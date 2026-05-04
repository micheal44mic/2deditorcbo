const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

test("layers panel copies raster targets when duplicating layers", () => {
  const source = readRepoFile("js", "layers-panel.js");

  assert.match(source, /function collectLayerClonePairs\(entry, pairs = \[\]\)/);
  assert.match(source, /function duplicateCopiedLayerRasterTargets\(copiedEntries\)/);
  assert.match(source, /renderer\.duplicateRasterTarget\(sourceLayerId, destinationLayerId,/);
  assert.match(source, /source: "layers-panel-copy"/);
  assert.match(source, /duplicateCopiedLayerRasterTargets\(copiedEntries\)/);
});
