const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("storage persistence helpers are loaded before persistent IndexedDB users", () => {
  const indexSource = readRepoFile("index.html");

  assert.ok(
    indexSource.indexOf("./js/storage-persistence.js") > -1 &&
      indexSource.indexOf("./js/storage-persistence.js") <
        indexSource.indexOf("./js/drawer.js"),
  );
  assert.ok(
    indexSource.indexOf("./js/document/document-asset-cache.js") > -1 &&
      indexSource.indexOf("./js/document/document-asset-cache.js") <
        indexSource.indexOf("./js/document/document-autosave.js") &&
      indexSource.indexOf("./js/document/document-asset-cache.js") <
        indexSource.indexOf("./js/document/document-save-system.js"),
  );
});

test("storage persistence requests durable browser storage", () => {
  const source = readRepoFile("js", "storage-persistence.js");

  assert.match(source, /navigator\.storage\.estimate\(\)/);
  assert.match(source, /navigator\.storage\.persisted\(\)/);
  assert.match(source, /navigator\.storage\.persist\(\)/);
  assert.match(source, /namespace\.requestPersistentStorage = requestPersistentStorage/);
  assert.match(source, /new CustomEvent\("cbo:persistent-storage-status"/);
});

test("document asset cache stores AI media blobs and hydrates cached URLs on restore", () => {
  const source = readRepoFile("js", "document", "document-asset-cache.js");
  const saveSource = readRepoFile("js", "document", "document-save-system.js");
  const autosaveSource = readRepoFile("js", "document", "document-autosave.js");

  assert.match(source, /const DB_NAME = "cbo-editor-asset-cache"/);
  assert.match(source, /db\.createObjectStore\(ASSETS_STORE, \{ keyPath: "id" \}\)/);
  assert.match(source, /store\.createIndex\("sourceKey", "sourceKey"/);
  assert.match(source, /async function cacheUrl\(src, options = \{\}\)/);
  assert.match(source, /fetchBlobFromUrl\(originalSrc\)/);
  assert.match(source, /async function prepareAiWorkspace\(workspace, options = \{\}\)/);
  assert.match(source, /await prepareGeneratedMedia\(board\.generatedMedia, options\)/);
  assert.match(source, /async function hydrateAiWorkspace\(workspace\)/);
  assert.match(source, /URL\.createObjectURL\(record\.blob\)/);
  assert.match(saveSource, /prepareAiWorkspaceForStorage/);
  assert.match(saveSource, /documentAssetCache\.prepareAiWorkspace/);
  assert.match(saveSource, /await restoreSessionAiWorkspace\(session\)/);
  assert.match(autosaveSource, /prepareAiWorkspaceForStorage/);
  assert.match(autosaveSource, /documentAssetCache\.hydrateAiWorkspace/);
});

test("uploads and document saves request persistent storage before writing blobs", () => {
  const drawerSource = readRepoFile("js", "drawer.js");
  const saveSource = readRepoFile("js", "document", "document-save-system.js");
  const autosaveSource = readRepoFile("js", "document", "document-autosave.js");

  assert.match(drawerSource, /window\.CBO\.requestPersistentStorage\?\.\(\{[\s\S]*source: "upload-cache"/);
  assert.match(saveSource, /namespace\.requestPersistentStorage\?\.\(\{[\s\S]*source: `\$\{source\}-document-save`/);
  assert.match(autosaveSource, /namespace\.requestPersistentStorage\?\.\(\{[\s\S]*source: `\$\{source\}-autosave`/);
});
