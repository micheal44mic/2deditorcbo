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
  assert.match(source, /const thumbnail = await captureCurrentDocumentThumbnail\(\)/);
  assert.match(source, /entries: cloneValue\(entries\)/);
  assert.match(source, /activeLayerId: layerModel\.activeLayerId \|\| null/);
  assert.match(source, /const aiWorkspace = await prepareAiWorkspaceForStorage\(/);
  assert.match(source, /aiWorkspace,/);
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

test("document save system stores a home screen thumbnail with each saved project", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /const THUMBNAIL_WIDTH = 480/);
  assert.match(source, /const THUMBNAIL_HEIGHT = 270/);
  assert.match(source, /const THUMBNAIL_TYPE = "image\/webp"/);
  assert.match(source, /function getThumbnailDocumentRect\(renderer\)/);
  assert.match(source, /function getThumbnailFitCamera\(documentRect\)/);
  assert.match(source, /function createThumbnailRenderTarget\(gl\)/);
  assert.match(source, /function createCanvasFromFramebuffer\(gl, target\)/);
  assert.match(source, /async function captureCurrentDocumentThumbnail\(\)/);
  assert.match(source, /renderer\.drawToCanvas\(\{[\s\S]*framebuffer: target\.framebuffer,[\s\S]*viewportHeight: THUMBNAIL_HEIGHT,[\s\S]*viewportWidth: THUMBNAIL_WIDTH,[\s\S]*\}\)/);
  assert.match(source, /gl\.readPixels\(0, 0, width, height, gl\.RGBA, gl\.UNSIGNED_BYTE, pixels\)/);
  assert.match(source, /imageData\.data\.set\(flippedPixels\)/);
  assert.match(source, /thumbnailContext\.drawImage\(pixelsCanvas, 0, 0\)/);
  assert.match(source, /await createCanvasBlob\(thumbnailCanvas\)/);
  assert.match(source, /await blobToDataUrl\(blob\)/);
  assert.match(source, /destroyThumbnailRenderTarget\(gl, target\)/);
  assert.match(source, /namespace\.brushEngine\?\.requestDraw\?\.\(\)/);
  assert.match(source, /thumbnailDataUrl: typeof thumbnail\.dataUrl === "string" \? thumbnail\.dataUrl : ""/);
  assert.match(source, /thumbnailHeight: Math\.max\(0, Math\.round\(thumbnail\.height \|\| 0\)\)/);
  assert.match(source, /thumbnailWidth: Math\.max\(0, Math\.round\(thumbnail\.width \|\| 0\)\)/);
  assert.match(source, /thumbnail,/);
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
  const startScreenSource = readRepoFile("js", "document-start-screen.js");

  assert.match(startScreenSource, /const saveSystem = namespace\.documentSaveSystem/);
  assert.match(startScreenSource, /saveSystem\.listSummaries\(\)/);
  assert.match(startScreenSource, /saveSystem\.restore\(sessionId\)/);
  assert.match(startScreenSource, /saveSystem\.delete\?\.\(sessionId\)/);
  assert.match(startScreenSource, /clearCurrentDocument/);
  assert.match(startScreenSource, /document-start-recovery-list/);
  assert.doesNotMatch(startScreenSource, /const autosave = namespace\.documentAutosave/);
  assert.doesNotMatch(startScreenSource, /autosave\.restoreLatest\(\)/);
});
