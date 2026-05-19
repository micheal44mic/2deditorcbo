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
  assert.match(editorCanvasSource, /const MOBILE_DOCUMENT_PRESET_ID = "square-2048"/);
  assert.match(editorCanvasSource, /id: "square-1024"[\s\S]*width: 1024, height: 1024/);
  assert.match(editorCanvasSource, /id: "square-4000"[\s\S]*width: 4000, height: 4000/);
  assert.match(editorCanvasSource, /id: "landscape-1920"[\s\S]*width: 1920, height: 1080/);
  assert.match(editorCanvasSource, /id: "story-1080"[\s\S]*width: 1080, height: 1920/);
  assert.match(editorCanvasSource, /function isMobileLikeDevice\(\)/);
  assert.match(editorCanvasSource, /function getDefaultDocumentPresetId\(\)/);
  assert.match(editorCanvasSource, /function formatEditorZoomLabel\(camera = \{\}\)/);
  assert.match(editorCanvasSource, /indicator\.dataset\.editorZoomIndicator = ""/);
  assert.match(editorCanvasSource, /addEventListener\("cbo:camera-change", handleZoomIndicatorCameraChange\)/);
  assert.match(editorCanvasSource, /maxRasterHistoryGpuHotMiB: 0/);
  assert.match(editorCanvasSource, /maxRasterHistoryMiB: 400/);
  assert.match(editorCanvasSource, /maxRasterHistoryMiB: 600/);
  assert.match(editorCanvasSource, /minRasterHistoryGpuHotEntries: 0/);
  assert.match(editorCanvasSource, /function isDocumentHistoryDisabled\(\)/);
  assert.match(editorCanvasSource, /window\.CBO\?\.androidHistoryEnabled === false/);
  assert.match(editorCanvasSource, /window\.CBO\.documentHistory = historyDisabled[\s\S]*\? null[\s\S]*: new window\.CBO\.DocumentHistory\(getRasterHistoryProfile\(\)\)/);
  assert.match(editorCanvasSource, /enableHistory: !historyDisabled/);
  assert.match(editorCanvasSource, /window\.CBO\.initEditorDocumentStart = function initEditorDocumentStart\(\)/);
  assert.match(editorCanvasSource, /button\.dataset\.documentPreset = preset\.id/);
  assert.match(editorCanvasSource, /window\.CBO\.initEditorCanvas\(\{[\s\S]*documentHeight: preset\.height,[\s\S]*documentWidth: preset\.width/);
  assert.match(editorCanvasSource, /startWithNoActiveLayer: true/);
  assert.match(editorCanvasSource, /layerModel\.setActiveLayer\(null, \{[\s\S]*source: "editor-canvas-start-clear-layer-selection"/);
  assert.match(editorCanvasSource, /documentSaveSystem/);
  assert.match(editorCanvasSource, /saveSystem\.listSummaries\(\)/);
  assert.match(editorCanvasSource, /saveSystem\.restore\(sessionId\)/);
  assert.match(editorCanvasSource, /saveSystem\.delete\?\.\(sessionId\)/);
  assert.match(editorCanvasSource, /clearCurrentDocument/);
  assert.match(editorCanvasSource, /documentWidth: documentSize\.width/);
  assert.match(editorCanvasSource, /enableViewportLayerCulling: true/);
  assert.match(editorCanvasSource, /function dispatchEditorCanvasReady\(documentRenderer, documentSize = \{\}, options = \{\}\)/);
  assert.match(editorCanvasSource, /window\.CBO\.emitEditorCanvasReady = function emitEditorCanvasReady/);
  assert.match(editorCanvasSource, /if \(options\.deferReadyEvent === true\)/);
  assert.doesNotMatch(editorCanvasSource, /localStorage|sessionStorage/);
  assert.match(appSource, /window\.CBO\.initEditorDocumentStart\(\);/);
  assert.ok(
    indexSource.indexOf("./js/document/document-autosave.js") > -1 &&
      indexSource.indexOf("./js/document/document-save-system.js") > -1 &&
      indexSource.indexOf("./js/document/document-autosave.js") < indexSource.indexOf("./js/editor-canvas.js"),
  );
  assert.match(cssSource, /\.document-start-screen/);
  assert.match(cssSource, /\.editor-zoom-indicator/);
  assert.match(cssSource, /\.document-start-recovery/);
  assert.match(cssSource, /\.document-start-recovery-list/);
  assert.match(cssSource, /\.document-start-recovery-delete/);
  assert.match(cssSource, /\.document-start-preset/);
});
