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
  assert.match(source, /estimateEntryRasterDuplicateBytes\(selectedEntries\)/);
});

test("layers panel blocks new raster layers when the layer memory cap is exceeded", () => {
  const source = readRepoFile("js", "layers-panel.js");
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(source, /function showLayerLimitToast\(message = "You can't create new layers"\)/);
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*toast\.hidden = true;[\s\S]*\}, 1000\)/);
  assert.match(source, /window\.CBO\.getRasterLayerCreationBudget\?\.\(\{/);
  assert.match(source, /source: "layers-panel-new-layer"/);
  assert.match(source, /source: "layers-panel-copy"/);
  assert.match(source, /function estimateEntryRasterDuplicateBytes\(entries\)/);
  assert.match(source, /if \(!allowNewRasterLayers\(\{[\s\S]*return;[\s\S]*\}/);
  assert.match(cssSource, /\.cbo-layer-limit-toast/);
});

test("layers panel releases raster memory when clearing the last paint layer", () => {
  const source = readRepoFile("js", "layers-panel.js");

  assert.match(source, /function clearLayerContents\(rows, options = \{\}\)/);
  assert.match(source, /function releaseDeletedDocumentHistory\(source = "layers-panel-delete-all-content-layers"\)/);
  assert.match(source, /renderer\?\.clearLayer\?\.?\(layerId, options\)/);
  assert.match(source, /window\.CBO\.documentHistory\?\.clear\?\.\(\)/);
  assert.match(source, /renderer\?\.pruneOrphanRasterTargets\?\.\(\)/);
  assert.match(source, /releaseRaster: true/);
  assert.match(source, /source: "layers-panel-delete-last-content-layer"/);
  assert.match(source, /syncLayerModelFromDom\([\s\S]*isDeletingAllContent \? "delete-all-content-layers" : "delete"/);
  assert.match(source, /isDeletingAllContent \? \{ history: false \} : \{\}/);
});

test("layers panel exposes a visible merge layers action", () => {
  const html = readRepoFile("index.html");
  const source = readRepoFile("js", "layers-panel.js");
  const cssSource = readRepoFile("css", "drawer.css");

  assert.match(html, /drawer-merge-layer-button/);
  assert.match(html, /data-tooltip="MERGE LAYERS"/);
  assert.match(source, /const mergeLayerButton = document\.querySelector\("\.drawer-merge-layer-button"\)/);
  assert.match(source, /function mergeLayersFromHeaderButton\(\)/);
  assert.match(source, /source: "layers-panel-header-merge-down"/);
  assert.match(source, /source: "layers-panel-header-merge-selected"/);
  assert.match(cssSource, /drawer-merge-layer-button/);
});
