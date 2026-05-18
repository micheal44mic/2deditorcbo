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
  assert.match(saveSource, /namespace\.documentSaveSystem = \{/);
  assert.match(sidebarSource, /const saveSystem = window\.CBO\.documentSaveSystem/);
  assert.match(sidebarSource, /saveSystem\.saveNow\(\{ source: "manual-save" \}\)/);
  assert.doesNotMatch(sidebarSource, /documentAutosave\.saveNow\(\{ source: "manual-save" \}\)/);
});

test("document save system captures the document shape without brush or smudge presets", () => {
  const source = readRepoFile("js", "document", "document-save-system.js");

  assert.match(source, /history\?\.flushLayerState\?\.\(layerModel\)/);
  assert.match(source, /entries: cloneValue\(entries\)/);
  assert.match(source, /activeLayerId: layerModel\.activeLayerId \|\| null/);
  assert.match(source, /artboards: namespace\.getDocumentArtboards\?\.\(\) \|\| \[\]/);
  assert.match(source, /selectedArtboardId:/);
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
  assert.match(source, /brushEngine\?\.flushPendingBrushHistory/);
  assert.match(source, /transformTool\?\.hasPendingTransform\?\.\(\)/);
  assert.match(source, /transformTool\.commitTransform\?\.\(\)/);
  assert.match(source, /puppetTransformTool\?\.isActive\?\.\(\)/);
  assert.match(source, /puppetTransformTool\.rasterizeActivePuppetLayer\?\.\(\)/);
  assert.match(source, /await prepareDocumentForSave\(source\)/);
});

test("start screen restores only explicit saved documents", () => {
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");

  assert.match(editorCanvasSource, /const saveSystem = window\.CBO\.documentSaveSystem/);
  assert.match(editorCanvasSource, /saveSystem\.getLatestSummary\(\)/);
  assert.match(editorCanvasSource, /saveSystem\.restoreLatest\(\)/);
  assert.doesNotMatch(editorCanvasSource, /const autosave = window\.CBO\.documentAutosave/);
  assert.doesNotMatch(editorCanvasSource, /autosave\.restoreLatest\(\)/);
});
