const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("smudge stroke history prefers first-touch tile-memento snapshots", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /this\.activeHistoryTileCapture = null/);
  assert.match(source, /beginRasterTileHistory\(layerId, bounds/);
  assert.match(source, /extendRasterTileHistory\(this\.activeHistoryTileCapture, bounds/);
  assert.match(source, /commitRasterTileHistory\?\.\(tileHistory,/);
  assert.match(source, /historyMode = hasTileHistory[\s\S]*"tile-before-after"/);
  assert.match(source, /this\.activeHistoryBeforeSnapshot = this\.createHistorySnapshot\(target, bounds, "smudge prima"\)/);
  assert.match(source, /dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateHistorySnapshot\(snapshot\)/);
  assert.match(source, /deleteHistorySnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /let after = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /after = this\.createHistorySnapshot\(redoTarget, before\.rect, "smudge dopo"\)/);
  assert.match(source, /entry\.after = after/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.match(source, /historyBytes: this\.activeHistoryTileCapture[\s\S]*this\.getSnapshotBytes\(this\.activeHistoryBeforeSnapshot\)/);
  assert.doesNotMatch(source, /const after = this\.createHistorySnapshot\(target, before\.rect, "smudge dopo"\)/);
});

test("smudge stroke history records memory policy and disables redo for huge strokes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /const STROKE_MEMORY_POLICY = Object\.freeze/);
  assert.match(source, /createStrokeMemoryReport\(/);
  assert.match(source, /namespace\.rasterResourceManager\?\.recordStrokeMemory\?\.\(report\)/);
  assert.match(source, /historyMode === "gpu-before-no-redo"/);
  assert.match(source, /memoryPolicy: memoryReport/);
  assert.match(source, /const memoryReport = this\.activeSmudgeMemoryReport/);
  assert.match(source, /this\.documentRenderer\?\.evictRasterScratchCachesForPolicy\?\.\(memoryReport,/);
  assert.match(source, /source: "smudge-stroke"/);
  assert.match(source, /this\.documentRenderer\?\.compactInactivePaintTargets\?\.\(/);
  assert.match(source, /source: "smudge-compact-inactive"/);
});

test("smudge invalidates the zoom-out preview cache while painting live", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /this\.documentRenderer\?\.invalidatePreviewCache\?\.\("smudge-live"\)/);
  assert.match(source, /this\.documentRenderer\?\.invalidatePreviewCache\?\.\("smudge-stroke"\)/);
});

test("smudge refuses empty raster layers without allocating a full target", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /showEmptySmudgeLayerToast\(message = "Nothing to smudge on this layer"\)/);
  assert.match(source, /if \(!existingTarget \|\| isEmptySparseTarget\) \{\s*this\.showEmptySmudgeLayerToast\(\);\s*return null;\s*\}/);
  assert.doesNotMatch(source, /return getRasterTarget\.call\(this\.documentRenderer, activeId\)/);
});

test("smudge samples and blits cropped targets in document-local coordinates", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /uniform vec2 u_sourceOrigin;/);
  assert.match(source, /vec2 sourceLocal = documentPosition - u_sourceOrigin;/);
  assert.match(source, /gl\.uniform2f\(uniforms\.sourceOrigin, sourceRect\.x, sourceRect\.y\)/);
  assert.match(source, /const localX = bounds\.x - targetRect\.x/);
  assert.match(source, /const y0 = target\.height - \(localY \+ bounds\.height\)/);
});

test("smudge keeps sparse layers tiled while dabbing", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /renderSparseDab\(/);
  assert.match(source, /createRasterSnapshot\?\.\(layerId, sourceBounds, "smudge source"\)/);
  assert.match(source, /ensureRasterTargetsForPaintRect\(layerId, bounds,/);
  assert.match(source, /source: "smudge-sparse-target"/);
  assert.match(source, /if \(this\.documentRenderer\?\.isSparseRasterTarget\?\.\(target\)\) \{\s*this\.includeSmudgeBounds\(bounds\);\s*this\.renderSparseDab/);
});

test("smudge clips live dabs to the active area selection before tile work", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /getActiveAreaSelectionCoverageRects\(bounds\) \{/);
  assert.match(source, /namespace\.areaSelection\?\.hasSelection\?\.\(\)/);
  assert.match(source, /namespace\.areaSelection\.getIntersectingRects\?\.\(bounds\)/);
  assert.match(source, /clipBoundsToAreaSelection\(bounds\) \{/);
  assert.match(source, /this\.getBoundsForDocumentRects\(selectionCoverageRects\)/);
  assert.match(source, /let selectionCoverageRects = this\.getActiveAreaSelectionCoverageRects\(bounds\)/);
  assert.match(source, /selectionCoverageRects\.forEach\(\(coverageRect\) => \{/);
  assert.match(source, /this\.includeSmudgeBounds\(bounds\)[\s\S]*this\.renderSparseDab\(target, cx, cy, pressure, direction, radius, bounds, stepDistance, selectionCoverageRects\)/);
});
