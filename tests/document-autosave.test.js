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
  assert.match(source, /const AUTOSAVE_FORMAT_VERSION = 3/);
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
  assert.match(source, /aiWorkspace: getCurrentAiWorkspace\(\)/);
  assert.match(source, /project: \{[\s\S]*name: projectName,[\s\S]*\}/);
  assert.match(source, /referenceLayerId: history\?\.getReferenceLayerId\?\.\(\) \|\| null/);
  assert.match(source, /countEntries\(entries\)/);
  assert.match(source, /renderer\.isSparseRasterTarget\?\.\(target\) !== true/);
  assert.match(source, /renderer\.getRasterTargetDocumentRect\?\.\(target\)/);
  assert.match(source, /renderer\.getRasterHistoryTileRects\?\.\(targetRect, \{ tileSize: TILE_SIZE \}\)/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, tile\.rect, "autosave-tile"\)/);
  assert.match(source, /renderer\.dehydrateRasterSnapshot\?\.\(snapshot\)/);
  assert.match(source, /pixelsAreTransparent\(pixels\)/);
  assert.match(source, /createCompressedTilePayload\(bytes\)/);
  assert.match(source, /codec: encoded\.codec/);
  assert.match(source, /rawByteLength: encoded\.rawByteLength/);
  assert.match(source, /storedByteLength: encoded\.storedByteLength/);
  assert.match(source, /rect: \{ \.\.\.targetRect \}/);
  assert.match(source, /rect: \{ \.\.\.snapshot\.rect \}/);
  assert.match(source, /version: AUTOSAVE_FORMAT_VERSION/);
  assert.match(source, /prepareArtboardConnectionsForSave\?\.\(\{[\s\S]*source: "autosave-ai-workspace"/);
  assert.doesNotMatch(source, /layerRecord\.rect = unionRects/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-content-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-layers-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:history-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("pagehide"/);
  assert.doesNotMatch(source, /window\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(source, /scheduleSave/);
  assert.doesNotMatch(source, /undoStack|redoStack/);
});

test("document autosave compresses raster tiles with raw fallback metadata", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /const TILE_PIXEL_FORMAT = "rgba8"/);
  assert.match(source, /const TILE_CODECS = Object\.freeze\(\["zstd", "gzip", "deflate"\]\)/);
  assert.match(source, /const RAW_TILE_CODEC = "raw"/);
  assert.match(source, /function supportsTileCodec\(codec\)/);
  assert.match(source, /new CompressionStream\(codec\)/);
  assert.match(source, /new DecompressionStream\(codec\)/);
  assert.match(source, /function getPreferredTileCodec\(\)/);
  assert.match(source, /function createRawTilePayload\(bytes\)/);
  assert.match(source, /async function createCompressedTilePayload\(bytes\)/);
  assert.match(source, /pipeThrough\(new CompressionStream\(codec\)\)/);
  assert.match(source, /blob\.size >= bytes\.byteLength/);
  assert.match(source, /return createRawTilePayload\(bytes\)/);
  assert.match(source, /format: TILE_PIXEL_FORMAT/);
  assert.match(source, /premultipliedAlpha: true/);
  assert.match(source, /byteLength: encoded\.rawByteLength/);
  assert.match(source, /bytes: encoded\.blob/);
  assert.match(source, /const rasterStorage = getTileStorageSummary\(tileRecords\)/);
  assert.match(source, /tileRawByteLength: rasterStorage\.rawByteLength/);
  assert.match(source, /tileStoredByteLength: rasterStorage\.storedByteLength/);
});

test("document autosave restores compressed and legacy raw tile payloads", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /function getTileRawByteLength\(tileManifest = \{\}, tileRecord = \{\}\)/);
  assert.match(source, /tileManifest\.rawByteLength[\s\S]*tileRecord\.rawByteLength[\s\S]*tileManifest\.byteLength[\s\S]*tileRecord\.byteLength/);
  assert.match(source, /async function decodeTileBytes\(tileRecord = \{\}, tileManifest = \{\}\)/);
  assert.match(source, /const codec = tileRecord\.codec \|\| tileManifest\.codec \|\| RAW_TILE_CODEC/);
  assert.match(source, /if \(codec === RAW_TILE_CODEC\) \{[\s\S]*blob\.arrayBuffer\(\)/);
  assert.match(source, /pipeThrough\(new DecompressionStream\(codec\)\)/);
  assert.match(source, /bytes\.byteLength !== rawByteLength/);
  assert.match(source, /async function restoreTile\(layerId, layerRecord, tileManifest, tileRecord, renderer\)/);
  assert.match(source, /const pixels = await decodeTileBytes\(tileRecord, tileManifest\)/);
  assert.doesNotMatch(source, /async function blobToPixels/);
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

test("document autosave can restore sessions while the start screen restores saved documents", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const startScreenSource = readRepoFile("js", "document-start-screen.js");

  assert.match(source, /async function restoreLatest\(options = \{\}\)/);
  assert.match(source, /function getSessionArtboards\(session\)/);
  assert.match(source, /function restoreSessionArtboards\(session, source = "autosave-restore-artboards"\)/);
  assert.match(source, /namespace\.initEditorCanvas\?\.\(\{[\s\S]*documentHeight: session\.document\.height,[\s\S]*documentWidth: session\.document\.width/);
  assert.match(source, /deferReadyEvent: true/);
  assert.match(source, /stage\?\.dataset\.canvasReady === "true"/);
  assert.match(source, /layerModel\?\.setEntries\?\.\(cloneValue\(session\.entries\)/);
  assert.match(source, /restoreSessionArtboards\(session\)/);
  assert.match(source, /restoreRasterLayers\(session, tileRecords\)/);
  assert.match(source, /projectName: applyProjectName\(session\.project\?\.name \|\| ""\)/);
  assert.match(source, /renderer\.createSparseRasterTarget\?\.\(layerId, \{/);
  assert.match(source, /renderer\.installRasterTargetForLayer\(layerId, sparseTarget/);
  assert.match(source, /pruneTransparentTiles: false/);
  assert.match(source, /releaseSnapshotGpuAfterRestore: true/);
  assert.match(source, /renderer\.restoreRasterSnapshot\?\.\(layerId, snapshot/);
  assert.match(source, /namespace\.emitEditorCanvasReady\?\.\(\{ source: "autosave-restore" \}\)/);
  assert.match(startScreenSource, /createDocumentRecoveryButton\(summary\)/);
  assert.match(startScreenSource, /const projectName = String\(summary\?\.projectName \|\| ""\)\.trim\(\)/);
  assert.match(startScreenSource, /saveSystem\.restore\(sessionId\)/);
  assert.match(editorCanvasSource, /window\.CBO\.emitEditorCanvasReady = function emitEditorCanvasReady/);
  assert.match(editorCanvasSource, /if \(options\.deferReadyEvent === true\)/);
});

test("document autosave captures and restores the AI workspace graph", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /const AI_WORKSPACE_FORMAT_VERSION = 1/);
  assert.match(source, /function getCurrentAiWorkspace\(\)/);
  assert.match(source, /namespace\.getArtboardConnectionBoards\(\)/);
  assert.match(source, /namespace\.getArtboardConnections\(\)/);
  assert.match(source, /boards: cloneValue/);
  assert.match(source, /connections: cloneValue/);
  assert.match(source, /function restoreSessionAiWorkspace\(session, source = "autosave-restore-ai-workspace"\)/);
  assert.match(source, /namespace\.restoreArtboardConnections\(state, \{ source \}\)/);
  assert.match(source, /namespace\.pendingArtboardConnectionRestore = \{/);
  assert.match(source, /restoreSessionAiWorkspace\(session\)/);
});

test("document restore locks the UI and fits all artboards while loading", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(source, /const RESTORE_OVERLAY_ID = "cbo-document-restore-overlay"/);
  assert.match(source, /const RESTORE_BLOCKED_EVENTS = \[/);
  assert.match(source, /function blockDocumentRestoreInteraction\(event\)/);
  assert.match(source, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(source, /function beginDocumentRestoreUi\(options = \{\}\)/);
  assert.match(source, /document\.body\?\.classList\.add\("cbo-document-restore-active"\)/);
  assert.match(source, /function fitRestoreViewToArtboards\(session, options = \{\}\)/);
  assert.match(source, /getRestoreArtboardFitRect\(session\)/);
  assert.match(source, /camera\.zoom = zoom/);
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\("cbo:camera-change", \{ detail \}\)\)/);
  assert.match(source, /fitRestoreViewToArtboards\(session\)/);
  assert.match(source, /restoreUiActive: didBeginRestoreUi \|\| options\.restoreUiActive === true/);
  assert.match(source, /endDocumentRestoreUi\(didBeginRestoreUi\)/);
  assert.match(cssSource, /\.cbo-document-restore-overlay/);
  assert.match(cssSource, /body\.cbo-document-restore-active \.editor-stage > \.editor-artboard-paper-layer/);
  assert.match(cssSource, /body\.cbo-document-restore-active \.editor-stage > \.editor-artboard-preview-layer/);
  assert.match(cssSource, /body\.cbo-document-restore-active \.editor-stage[\s\S]*pointer-events: none/);
});

test("document autosave can reset the active renderer when restoring a memory checkpoint", () => {
  const source = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /function resetRendererForRestore\(session\)/);
  assert.match(source, /previousRenderer\?\.dispose\?\.\(\)/);
  assert.match(source, /new namespace\.DocumentRenderer\(\{/);
  assert.match(source, /namespace\.brushEngine\.documentRenderer = nextRenderer/);
  assert.match(source, /namespace\.smudgeEngine\.documentRenderer = nextRenderer/);
  assert.match(source, /options\.resetRenderer === true/);
  assert.match(source, /return restoreSession\(session, tileRecords, \{/);
  assert.match(source, /restoreUiActive: didBeginRestoreUi \|\| options\.restoreUiActive === true/);
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
