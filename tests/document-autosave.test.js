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

test("document autosave can replace old sessions before writing memory checkpoints", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /async function writeSession\(payload, options = \{\}\)/);
  assert.match(source, /if \(options\.cleanupBeforeWrite === true\) \{[\s\S]*await cleanupOldSessions\(db, payload\.session\.id\)/);
  assert.match(source, /cleanupBeforeWrite: options\.cleanupBeforeWrite === true/);
  assert.match(source, /namespace\.lastDocumentAutosaveError = \{/);
});

test("document autosave keeps a memory checkpoint when persistent storage is full", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /function storeMemoryCheckpoint\(payload, detail = \{\}\)/);
  assert.match(source, /namespace\.lastDocumentMemoryCheckpoint = payload/);
  assert.match(source, /new CustomEvent\("cbo:document-memory-checkpoint"/);
  assert.match(source, /options\.memoryFallback === true && payload\?\.session/);
  assert.match(source, /return summary \? "memory" : false/);
  assert.match(source, /async function restoreMemoryCheckpoint\(options = \{\}\)/);
  assert.match(source, /restoreSession\(payload\.session, payload\.tileRecords \|\| \[\], options\)/);
  assert.match(source, /clearMemoryCheckpoint/);
});

test("document autosave captures layer structure and sparse raster content only", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /history\?\.flushLayerState\?\.\(layerModel\)/);
  assert.match(source, /const projectName = getCurrentProjectName\(\)/);
  assert.match(source, /entries: cloneValue\(entries\)/);
  assert.match(source, /activeLayerId: layerModel\.activeLayerId \|\| null/);
  assert.match(source, /project: \{[\s\S]*name: projectName,[\s\S]*\}/);
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

  assert.match(source, /async function restoreLatest\(options = \{\}\)/);
  assert.match(source, /namespace\.initEditorCanvas\?\.\(\{[\s\S]*documentHeight: session\.document\.height,[\s\S]*documentWidth: session\.document\.width/);
  assert.match(source, /stage\?\.dataset\.canvasReady === "true"/);
  assert.match(source, /layerModel\?\.setEntries\?\.\(cloneValue\(session\.entries\)/);
  assert.match(source, /restoreRasterLayers\(session, tileRecords\)/);
  assert.match(source, /projectName: applyProjectName\(session\.project\?\.name \|\| ""\)/);
  assert.match(source, /renderer\.createRasterTargetForRect\?\.\(layerRecord\.rect, \[0, 0, 0, 0\]\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\?\.\(layerId, snapshot/);
  assert.match(editorCanvasSource, /createDocumentRecoveryButton\(summary\)/);
  assert.match(editorCanvasSource, /const projectName = String\(summary\?\.projectName \|\| ""\)\.trim\(\)/);
  assert.match(editorCanvasSource, /autosave\.restoreLatest\(\)/);
});

test("document autosave can reset the active renderer when restoring a memory checkpoint", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /function resetRendererForRestore\(session\)/);
  assert.match(source, /previousRenderer\?\.dispose\?\.\(\)/);
  assert.match(source, /new namespace\.DocumentRenderer\(\{/);
  assert.match(source, /namespace\.brushEngine\.documentRenderer = nextRenderer/);
  assert.match(source, /namespace\.smudgeEngine\.documentRenderer = nextRenderer/);
  assert.match(source, /options\.resetRenderer === true/);
  assert.match(source, /return restoreSession\(session, tileRecords, options\)/);
});

test("manual document save includes project metadata from the sidebar", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");
  const sidebarSource = readRepoFile("js", "right-sidebar.js");

  assert.match(source, /const PROJECT_NAME_STORAGE_KEY = namespace\.documentProjectNameStorageKey \|\| "cbo-project-name"/);
  assert.match(source, /function getCurrentProjectName\(\)/);
  assert.match(source, /namespace\.getDocumentProjectName/);
  assert.match(source, /projectName: typeof project\.name === "string" \? project\.name : ""/);
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\("cbo:document-project-change"/);
  assert.match(sidebarSource, /window\.CBO\.getDocumentProjectName = getDocumentProjectName/);
  assert.match(sidebarSource, /window\.CBO\.setDocumentProjectName = setDocumentProjectName/);
  assert.match(sidebarSource, /setDocumentProjectName\(projectInput\.value, \{ source: "project-input" \}\)/);
});
