const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("document save system is loaded separately and owns manual project saves", () => {
  const indexSource = readRepoFile("index.html");
  const sidebarSource = readRepoFile("js", "right-sidebar.js");
  const saveSource = readRepoFile("js", "document", "document-save-system.js");

  assert.ok(
    indexSource.indexOf("./js/document/document-autosave.js") > -1 &&
      indexSource.indexOf("./js/document/document-save-system.js") > -1 &&
      indexSource.indexOf("./js/document/document-autosave.js") <
        indexSource.indexOf("./js/document/document-save-system.js") &&
      indexSource.indexOf("./js/document/document-save-system.js") <
        indexSource.indexOf("./js/editor-canvas.js"),
  );
  assert.match(saveSource, /const DB_NAME = "cbo-editor-documents"/);
  assert.match(saveSource, /const PROJECTS_META_KEY = "projects"/);
  assert.match(saveSource, /namespace\.documentSaveSystem = \{/);
  assert.match(saveSource, /listSummaries/);
  assert.match(saveSource, /restore,/);
  assert.match(saveSource, /delete: deleteSession/);
  assert.match(sidebarSource, /const saveSystem = window\.CBO\.documentSaveSystem/);
  assert.match(sidebarSource, /saveSystem\.saveNow\(\{ source: "manual-save" \}\)/);
  assert.doesNotMatch(sidebarSource, /documentAutosave\.saveNow\(\{ source: "manual-save" \}\)/);
});

test("document save system captures the document shape without brush or smudge presets", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /history\?\.flushLayerState\?\.\(layerModel\)/);
  assert.match(source, /entries: cloneValue\(entries\)/);
  assert.match(source, /activeLayerId: layerModel\.activeLayerId \|\| null/);
  assert.match(source, /aiWorkspace: getCurrentAiWorkspace\(\)/);
  assert.match(source, /artboards: namespace\.getDocumentArtboards\?\.\(\) \|\| \[\]/);
  assert.match(source, /selectedArtboardId:/);
  assert.match(source, /view: getCurrentDocumentView\(\)/);
  assert.match(source, /version: DOCUMENT_SAVE_FORMAT_VERSION/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, tile\.rect, "document-save-tile"\)/);
  assert.doesNotMatch(source, /brushSettings/);
  assert.doesNotMatch(source, /smudgeSettings/);
  assert.doesNotMatch(source, /BrushLibrary/);
  assert.doesNotMatch(source, /SmudgeBrushes/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-content-change"/);
  assert.doesNotMatch(source, /window\.addEventListener\("cbo:document-layers-change"/);
  assert.doesNotMatch(source, /scheduleSave/);
});

test("document save system prepares pending visible edits before snapshotting", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /async function prepareDocumentForSave\(source = "manual-save"\)/);
  assert.match(source, /prepareArtboardConnectionsForSave\?\.\(\{[\s\S]*source: `\$\{source\}-ai-workspace`/);
  assert.match(source, /brushEngine\?\.flushPendingBrushHistory/);
  assert.match(source, /transformTool\?\.hasPendingTransform\?\.\(\)/);
  assert.match(source, /transformTool\.commitTransform\?\.\(\)/);
  assert.match(source, /puppetTransformTool\?\.isActive\?\.\(\)/);
  assert.match(source, /puppetTransformTool\.rasterizeActivePuppetLayer\?\.\(\)/);
  assert.match(source, /await prepareDocumentForSave\(source\)/);
});

test("document save system captures and restores the AI workspace graph", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");
  const connectionsSource = readRepoFile("js", "artboard-connections.js");
  const historySource = readRepoFile("js", "artboard-connections", "state-history.js");

  assert.match(source, /const AI_WORKSPACE_FORMAT_VERSION = 1/);
  assert.match(source, /function getCurrentAiWorkspace\(\)/);
  assert.match(source, /namespace\.getArtboardConnectionBoards\(\)/);
  assert.match(source, /namespace\.getArtboardConnections\(\)/);
  assert.match(source, /boards: cloneValue/);
  assert.match(source, /connections: cloneValue/);
  assert.match(source, /function restoreSessionAiWorkspace\(session, source = "document-save-restore-ai-workspace"\)/);
  assert.match(source, /namespace\.restoreArtboardConnections\(state, \{ source \}\)/);
  assert.match(source, /namespace\.pendingArtboardConnectionRestore = \{/);
  assert.match(source, /restoreSessionAiWorkspace\(session\)/);
  assert.match(connectionsSource, /namespace\.restoreArtboardConnections = function restoreArtboardConnections/);
  assert.match(connectionsSource, /namespace\.prepareArtboardConnectionsForSave = function prepareArtboardConnectionsForSave/);
  assert.match(connectionsSource, /namespace\.pendingArtboardConnectionRestore/);
  assert.match(historySource, /function normalizeConnectionsRestoreState\(state\)/);
  assert.match(historySource, /function restoreArtboardConnectionState\(state, source = "artboard-connections-restore"\)/);
});

test("document save system keeps multiple saved projects and updates the current one", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /function getCurrentDocumentSaveId\(\)/);
  assert.match(source, /function setCurrentDocumentSaveId\(sessionId\)/);
  assert.match(source, /const requestedSessionId = String\(options\.sessionId \|\| ""\)\.trim\(\)/);
  assert.match(source, /requestedSessionId \|\| getCurrentDocumentSaveId\(\) \|\| createId\("project"\)/);
  assert.match(source, /async function getAllSessions\(\)/);
  assert.match(source, /async function readProjectIndex\(db\)/);
  assert.match(source, /async function writeProjectIndex\(db, summaries = \[\]\)/);
  assert.match(source, /async function upsertProjectIndex\(db, session\)/);
  assert.match(source, /async function listSummaries\(\)/);
  assert.match(source, /const indexedProjects = await readProjectIndex\(db\)/);
  assert.match(source, /if \(indexedProjects\.length > 0\)/);
  assert.match(source, /await upsertProjectIndex\(db, payload\.session\)/);
  assert.match(source, /sessions\.map\(createSummary\)/);
  assert.match(source, /async function restore\(sessionId, options = \{\}\)/);
  assert.match(source, /return restoreSession\(session, tileRecords/);
  assert.match(source, /async function deleteSession\(sessionId\)/);
  assert.match(source, /cleanupSessionTiles\(db, normalizedSessionId\)/);
  assert.doesNotMatch(source, /cleanupOldSessions/);
});

test("document save system restores saved view state without requiring tool state", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /function getCurrentDocumentView\(\)/);
  assert.match(source, /camera: \{[\s\S]*x: Number\.isFinite\(x\) \? x : 0,[\s\S]*zoom,[\s\S]*\}/);
  assert.match(source, /function applySavedDocumentView\(session, source = "document-save-restore-view"\)/);
  assert.match(source, /const savedCamera = getSavedDocumentViewCamera\(session\)/);
  assert.match(source, /camera\.x = savedCamera\.x/);
  assert.match(source, /camera\.y = savedCamera\.y/);
  assert.match(source, /camera\.zoom = savedCamera\.zoom/);
  assert.match(source, /new CustomEvent\("cbo:camera-change"/);
  assert.match(source, /applySavedDocumentView\(session\)/);
});

test("start screen restores only explicit saved documents", () => {
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");

  assert.match(editorCanvasSource, /const saveSystem = window\.CBO\.documentSaveSystem/);
  assert.match(editorCanvasSource, /saveSystem\.listSummaries\(\)/);
  assert.match(editorCanvasSource, /saveSystem\.restore\(sessionId\)/);
  assert.match(editorCanvasSource, /saveSystem\.delete\?\.\(sessionId\)/);
  assert.match(editorCanvasSource, /clearCurrentDocument/);
  assert.match(editorCanvasSource, /document-start-recovery-list/);
  assert.doesNotMatch(editorCanvasSource, /const autosave = window\.CBO\.documentAutosave/);
  assert.doesNotMatch(editorCanvasSource, /autosave\.restoreLatest\(\)/);
});
