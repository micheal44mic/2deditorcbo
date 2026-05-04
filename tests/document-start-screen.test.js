const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("editor starts from a preset-only document chooser", () => {
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const appSource = readRepoFile("js", "app.js");
  const cssSource = readRepoFile("css", "layout.css");
  const indexSource = readRepoFile("index.html");

  assert.match(editorCanvasSource, /const EDITOR_DOCUMENT_PRESETS = Object\.freeze\(\[/);
  assert.match(editorCanvasSource, /id: "square-1024"[\s\S]*width: 1024, height: 1024/);
  assert.match(editorCanvasSource, /id: "square-4000"[\s\S]*width: 4000, height: 4000/);
  assert.match(editorCanvasSource, /id: "landscape-1920"[\s\S]*width: 1920, height: 1080/);
  assert.match(editorCanvasSource, /id: "story-1080"[\s\S]*width: 1080, height: 1920/);
  assert.match(editorCanvasSource, /window\.CBO\.initEditorDocumentStart = function initEditorDocumentStart\(\)/);
  assert.match(editorCanvasSource, /button\.dataset\.documentPreset = preset\.id/);
  assert.match(editorCanvasSource, /window\.CBO\.initEditorCanvas\(\{[\s\S]*documentHeight: preset\.height,[\s\S]*documentWidth: preset\.width/);
  assert.match(editorCanvasSource, /documentAutosave/);
  assert.match(editorCanvasSource, /autosave\.getLatestSummary\(\)/);
  assert.match(editorCanvasSource, /autosave\.restoreLatest\(\)/);
  assert.match(editorCanvasSource, /documentWidth: documentSize\.width/);
  assert.match(editorCanvasSource, /window\.dispatchEvent\(new CustomEvent\("cbo:editor-canvas-ready"/);
  assert.doesNotMatch(editorCanvasSource, /localStorage|sessionStorage/);
  assert.match(appSource, /window\.CBO\.initEditorDocumentStart\(\);/);
  assert.ok(
    indexSource.indexOf("./js/document/document-autosave.js") > -1 &&
      indexSource.indexOf("./js/document/document-autosave.js") < indexSource.indexOf("./js/editor-canvas.js"),
  );
  assert.match(cssSource, /\.document-start-screen/);
  assert.match(cssSource, /\.document-start-recovery/);
  assert.match(cssSource, /\.document-start-preset/);
});
