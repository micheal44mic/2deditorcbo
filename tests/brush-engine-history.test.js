const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("brush stroke history prefers tile-memento before and after snapshots", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /beginRasterTileHistory\?\.\(layerId, strokeRect/);
  assert.match(source, /commitRasterTileHistory\?\.\(tileHistory,/);
  assert.match(source, /historyMode = hasTileHistory[\s\S]*"tile-before-after"/);
  assert.match(source, /tileHistory[\s\S]*this\.createHistorySnapshot\(target, strokeRect, "before-stroke"\)/);
  assert.match(source, /this\.createHistorySnapshot\(target, strokeRect, "before-stroke"\)/);
  assert.match(source, /dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /deleteHistorySnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /let afterSnapshot = null/);
  assert.match(source, /let entry = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /afterSnapshot = this\.createHistorySnapshot\(redoTarget, beforeSnapshot\.rect, "after-stroke"\)/);
  assert.match(source, /entry\.after = afterSnapshot/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.doesNotMatch(source, /const afterSnapshot = this\.createHistorySnapshot\(target, beforeSnapshot\.rect, "after-stroke"\)/);
});

test("brush stroke history records memory policy and disables redo for huge strokes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /const STROKE_MEMORY_POLICY = Object\.freeze/);
  assert.match(source, /createStrokeMemoryReport\(/);
  assert.match(source, /namespace\.rasterResourceManager\?\.recordStrokeMemory\?\.\(report\)/);
  assert.match(source, /historyMode === "gpu-before-no-redo"/);
  assert.match(source, /memoryPolicy: memoryReport/);
  assert.match(source, /this\.documentRenderer\?\.evictRasterScratchCachesForPolicy\?\.\(memoryReport,/);
  assert.match(source, /source: "brush-bake"/);
  assert.match(source, /this\.documentRenderer\?\.deleteActiveStrokeScratchTarget\?\.\(\)/);
  assert.match(source, /this\.documentRenderer\?\.compactInactivePaintTargets\?\.\(/);
  assert.match(source, /source: "brush-bake-compact-inactive"/);
});
