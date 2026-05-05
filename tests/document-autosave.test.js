const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("document autosave stores one recoverable IndexedDB session with raster tiles", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /const DB_NAME = "cbo-editor-autosave"/);
  assert.match(source, /const TILE_SIZE = 256/);
  assert.match(source, /db\.createObjectStore\(META_STORE, \{ keyPath: "key" \}\)/);
  assert.match(source, /db\.createObjectStore\(SESSIONS_STORE, \{ keyPath: "id" \}\)/);
  assert.match(source, /db\.createObjectStore\(TILES_STORE, \{ keyPath: "key" \}\)/);
  assert.match(source, /tileStore\.createIndex\("sessionId", "sessionId", \{ unique: false \}\)/);
  assert.match(source, /metaStore\.put\(\{[\s\S]*key: LATEST_META_KEY,[\s\S]*sessionId: payload\.session\.id/);
  assert.match(source, /cleanupOldSessions\(db, payload\.session\.id\)/);
});

test("document autosave captures layer structure and sparse raster content only", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /history\?\.flushLayerState\?\.\(layerModel\)/);
  assert.match(source, /entries: cloneValue\(entries\)/);
  assert.match(source, /activeLayerId: layerModel\.activeLayerId \|\| null/);
  assert.match(source, /referenceLayerId: history\?\.getReferenceLayerId\?\.\(\) \|\| null/);
  assert.match(source, /countEntries\(entries\)/);
  assert.match(source, /renderer\.getRasterTargetDocumentRect\?\.\(target\)/);
  assert.match(source, /renderer\.getRasterHistoryTileRects\?\.\(targetRect, \{ tileSize: TILE_SIZE \}\)/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, tile\.rect, "autosave-tile"\)/);
  assert.match(source, /renderer\.dehydrateRasterSnapshot\?\.\(snapshot\)/);
  assert.match(source, /pixelsAreTransparent\(pixels\)/);
  assert.match(source, /rect: \{ \.\.\.targetRect \}/);
  assert.match(source, /rect: \{ \.\.\.snapshot\.rect \}/);
  assert.doesNotMatch(source, /layerRecord\.rect = unionRects/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-content-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-layers-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:history-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("pagehide"/);
  assert.doesNotMatch(source, /window\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(source, /scheduleSave/);
  assert.doesNotMatch(source, /undoStack|redoStack/);
});

test("document save is manual-only and does not show autosaving text", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(source, /const source = options\.source \|\| "manual-save"/);
  assert.match(source, /emitSaveStatus\("saving", source\)/);
  assert.match(source, /emitSaveStatus\(finishStatus, source\)/);
  assert.doesNotMatch(source, /showAutosaveIndicator|hideAutosaveIndicator|autosaving\.\.\./);
  assert.doesNotMatch(cssSource, /\.document-autosave-indicator/);
});

test("document autosave restores the latest session before the canvas is started", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");

  assert.match(source, /async function restoreLatest\(\)/);
  assert.match(source, /namespace\.initEditorCanvas\?\.\(\{[\s\S]*documentHeight: session\.document\.height,[\s\S]*documentWidth: session\.document\.width/);
  assert.match(source, /stage\?\.dataset\.canvasReady === "true"/);
  assert.match(source, /layerModel\?\.setEntries\?\.\(cloneValue\(session\.entries\)/);
  assert.match(source, /restoreRasterLayers\(session, tileRecords\)/);
  assert.match(source, /renderer\.createRasterTargetForRect\?\.\(layerRecord\.rect, \[0, 0, 0, 0\]\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\?\.\(layerId, snapshot/);
  assert.match(editorCanvasSource, /createDocumentRecoveryButton\(summary\)/);
  assert.match(editorCanvasSource, /autosave\.restoreLatest\(\)/);
});
