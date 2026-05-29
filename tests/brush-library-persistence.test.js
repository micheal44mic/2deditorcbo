const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("brush library can snapshot and restore user-created presets", () => {
  const source = readRepoFile("data", "brush-library.js");

  assert.match(source, /function createLibrarySnapshot\(options = \{\}\)/);
  assert.match(source, /format: "cbo-brush-presets"/);
  assert.match(source, /function replaceLibraryState\(payload, options = \{\}\)/);
  assert.match(source, /Object\.assign\(brushes, nextBrushes\)/);
  assert.match(source, /packages\.splice\(0, packages\.length, \.\.\.nextPackages\)/);
  assert.match(source, /new CustomEvent\("cbo:brush-library-change"/);
  assert.match(source, /createLibrarySnapshot,/);
  assert.match(source, /replaceLibraryState,/);
});

test("brush library storage persists presets in IndexedDB", () => {
  const source = readRepoFile("js", "brush-library-storage.js");

  assert.match(source, /const DB_NAME = "cbo-editor-brush-cache"/);
  assert.match(source, /db\.createObjectStore\(STORE_NAME, \{ keyPath: "id" \}\)/);
  assert.match(source, /window\.indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(source, /async function load\(\)/);
  assert.match(source, /async function save\(payload, options = \{\}\)/);
  assert.match(source, /namespace\.requestPersistentStorage\?\.\(\{[\s\S]*source: `\$\{source\}-brush-library`/);
  assert.match(source, /namespace\.BrushLibraryStorage = \{/);
});

test("brush panel restores cached presets and saves brush mutations", () => {
  const indexSource = readRepoFile("index.html");
  const panelSource = readRepoFile("js", "brushes-panel.js");

  assert.ok(
    indexSource.indexOf("./data/brush-library.js") > -1 &&
      indexSource.indexOf("./js/brush-library-storage.js") > indexSource.indexOf("./data/brush-library.js") &&
      indexSource.indexOf("./js/brush-library-storage.js") < indexSource.indexOf("./js/brushes-panel.js"),
  );
  assert.match(panelSource, /function restoreBrushLibraryFromStorage\(\)/);
  assert.match(panelSource, /BrushLibrary\.replaceLibraryState\(payload, \{[\s\S]*silent: true/);
  assert.match(panelSource, /window\.addEventListener\("cbo:brush-library-change", scheduleBrushLibraryPersistence\)/);
  assert.match(panelSource, /storage\.save\(createBrushPresetExportPayload\(\), \{[\s\S]*source/);
  assert.match(panelSource, /void initializeBrushPanelState\(\)/);
});
