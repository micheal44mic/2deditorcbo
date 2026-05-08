const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("raster history tile debug overlay is loaded by the app", () => {
  const indexSource = readRepoFile("index.html");

  assert.match(indexSource, /js\/debug\/raster-history-tile-overlay\.js/);
});

test("raster layer tile debug overlay is loaded by the app", () => {
  const indexSource = readRepoFile("index.html");

  assert.match(indexSource, /js\/debug\/raster-layer-tile-overlay\.js/);
});

test("document renderer emits tile history debug events only behind the debug flag", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");

  assert.match(source, /intersectRasterHistoryRects\(a, b\)/);
  assert.match(source, /containsRasterHistoryRect\(container, rect\)/);
  assert.match(source, /getRasterHistoryPatchLookup\(patchRects = null, options = \{\}\)/);
  assert.match(source, /expandRasterTileHistoryDelta\(capture, delta, nextRect, options = \{\}\)/);
  assert.match(source, /emitRasterHistoryTileDebug\(detail = \{\}\)/);
  assert.match(source, /namespace\.debugRasterHistoryTiles !== true/);
  assert.match(source, /new CustomEvent\("cbo:raster-history-tile-debug"/);
  assert.match(source, /const capturePatchRect = this\.intersectRasterHistoryRects\(tileRect, captureRect\)/);
  assert.match(source, /this\.intersectRasterHistoryRects\(lookupPatchRect, capturePatchRect\)/);
  assert.match(source, /options\.tilePatchRects \|\| options\.patchRects/);
  assert.match(source, /rect: \{ \.\.\.patchRect \}/);
  assert.match(source, /this\.copyRasterSnapshotToSnapshot\(previousBefore, nextBefore\)/);
  assert.match(source, /phase: "before"/);
  assert.match(source, /phase: "before-expand"/);
  assert.match(source, /phase: "after"/);
  assert.match(source, /phase: `restore-\$\{snapshotKey\}`/);
  assert.match(source, /tileRect: tile\.tileRect \? \{ \.\.\.tile\.tileRect \} : \{ \.\.\.tile\.rect \}/);
});

test("raster history tile overlay exposes console controls", () => {
  const source = readRepoFile("js", "debug", "raster-history-tile-overlay.js");

  assert.match(source, /const EVENT_NAME = "cbo:raster-history-tile-debug"/);
  assert.match(source, /namespace\.debugRasterHistoryTiles = true/);
  assert.match(source, /namespace\.debugRasterHistoryTiles = false/);
  assert.match(source, /namespace\.rasterHistoryTileOverlay = Object\.freeze/);
  assert.match(source, /start,/);
  assert.match(source, /stop,/);
  assert.match(source, /toggle,/);
  assert.match(source, /toViewportRect\(rect, camera = getCamera\(\)\)/);
  assert.match(source, /const dpr = Math\.max\(0\.0001, Number\(camera\.dpr\) \|\| 1\)/);
  assert.match(source, /\+ \(Number\(rect\.x\) \|\| 0\) \* zoom\) \/ dpr/);
  assert.match(source, /function handleCameraChange\(event\)/);
  assert.match(source, /state\.camera = detail\.camera \? \{ \.\.\.detail\.camera \} : state\.camera/);
  assert.match(source, /window\.addEventListener\("cbo:camera-change", handleCameraChange\)/);
});

test("raster layer tile overlay exposes live sparse layer controls", () => {
  const source = readRepoFile("js", "debug", "raster-layer-tile-overlay.js");

  assert.match(source, /namespace\.rasterLayerTileOverlay = Object\.freeze/);
  assert.match(source, /function collectRows\(options = \{\}\)/);
  assert.match(source, /renderer\.isSparseRasterTarget\?\.\(target\) === true/);
  assert.match(source, /Array\.from\(target\.tiles\?\.values\?\.\(\) \|\| \[\]\)/);
  assert.match(source, /toViewportRect\(rect, camera = getCamera\(\)\)/);
  assert.match(source, /const dpr = Math\.max\(0\.0001, Number\(camera\.dpr\) \|\| 1\)/);
  assert.match(source, /function getTiles\(options = \{\}\)/);
  assert.match(source, /setLayer,/);
  assert.match(source, /showAllLayers,/);
  assert.match(source, /start,/);
  assert.match(source, /stop,/);
  assert.match(source, /toggle,/);
  assert.match(source, /window\.addEventListener\("cbo:camera-change", handleCameraChange\)/);
  assert.match(source, /window\.addEventListener\("cbo:document-content-change", queueRender\)/);
});
