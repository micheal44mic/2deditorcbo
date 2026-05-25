const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("editor starts from a clean two-panel document shell", () => {
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const startScreenSource = readRepoFile("js", "document-start-screen.js");
  const appSource = readRepoFile("js", "app.js");
  const cssSource = readRepoFile("css", "document-start-screen.css");
  const layoutSource = readRepoFile("css", "layout.css");
  const indexSource = readRepoFile("index.html");

  assert.match(editorCanvasSource, /const EDITOR_DOCUMENT_PRESETS = Object\.freeze\(\[/);
  assert.match(editorCanvasSource, /const MOBILE_DOCUMENT_PRESET_ID = "square-2048"/);
  assert.match(editorCanvasSource, /id: "square-1024"[\s\S]*width: 1024, height: 1024/);
  assert.match(editorCanvasSource, /id: "square-4000"[\s\S]*width: 4000, height: 4000/);
  assert.match(editorCanvasSource, /id: "landscape-1920"[\s\S]*width: 1920, height: 1080/);
  assert.match(editorCanvasSource, /id: "story-1080"[\s\S]*width: 1080, height: 1920/);
  assert.match(editorCanvasSource, /function isMobileLikeDevice\(\)/);
  assert.match(editorCanvasSource, /function getDefaultDocumentPresetId\(\)/);
  assert.match(editorCanvasSource, /window\.CBO\.editorDocumentPresets = EDITOR_DOCUMENT_PRESETS/);
  assert.match(editorCanvasSource, /window\.CBO\.getDefaultEditorDocumentPresetId = getDefaultDocumentPresetId/);
  assert.match(editorCanvasSource, /window\.CBO\.getEditorDocumentPreset = getDocumentPreset/);
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
  assert.match(editorCanvasSource, /editorPage\?\.classList\.remove\("document-start-active"\)/);
  assert.match(editorCanvasSource, /documentWidth: documentSize\.width/);
  assert.match(editorCanvasSource, /enableViewportLayerCulling: true/);
  assert.match(editorCanvasSource, /function dispatchEditorCanvasReady\(documentRenderer, documentSize = \{\}, options = \{\}\)/);
  assert.match(editorCanvasSource, /window\.CBO\.emitEditorCanvasReady = function emitEditorCanvasReady/);
  assert.match(editorCanvasSource, /if \(options\.deferReadyEvent === true\)/);
  assert.doesNotMatch(editorCanvasSource, /document-start-new-project/);
  assert.doesNotMatch(editorCanvasSource, /localStorage|sessionStorage/);

  assert.match(startScreenSource, /namespace\.initEditorDocumentStart = function initEditorDocumentStart\(\)/);
  assert.match(startScreenSource, /function createDocumentStartSidebar\(\)/);
  assert.match(startScreenSource, /brand\.textContent = "M1M4\.COM"/);
  assert.match(startScreenSource, /newProjectButton\.dataset\.documentNewProject = ""/);
  assert.match(startScreenSource, /newProjectLabel\.textContent = "New Project"/);
  assert.match(startScreenSource, /allProjectsButton\.dataset\.documentAllProjects = ""/);
  assert.match(startScreenSource, /allProjectsLabel\.textContent = "All Project"/);
  assert.match(startScreenSource, /lucide-folder-dot/);
  assert.match(startScreenSource, /<circle cx="12" cy="13" r="1" \/>/);
  assert.match(startScreenSource, /templateButton\.dataset\.documentTemplate = ""/);
  assert.match(startScreenSource, /templateLabel\.textContent = "Template"/);
  assert.match(startScreenSource, /<rect width="18" height="7" x="3" y="3" rx="1" \/>/);
  assert.match(startScreenSource, /aiArchiveButton\.dataset\.documentAiArchive = ""/);
  assert.match(startScreenSource, /aiArchiveLabel\.textContent = "AI Archive"/);
  assert.match(startScreenSource, /lucide-package-open/);
  assert.match(startScreenSource, /<path d="M12 22v-9" \/>/);
  assert.match(startScreenSource, /startSidebar\.newProjectButton\.addEventListener\("click"/);
  assert.match(startScreenSource, /document-start-new-project/);
  assert.match(startScreenSource, /document-start-all-projects/);
  assert.match(startScreenSource, /document-start-template/);
  assert.match(startScreenSource, /document-start-ai-archive/);
  assert.match(startScreenSource, /layout\.className = "document-start-layout"/);
  assert.match(startScreenSource, /sidebarPanel\.className = "document-start-sidebar"/);
  assert.match(startScreenSource, /contentPanel\.className = "document-start-main"/);
  assert.match(startScreenSource, /contentHeader\.className = "document-start-main-header"/);
  assert.match(startScreenSource, /contentBody\.className = "document-start-main-body"/);
  assert.match(startScreenSource, /contentBody\.append\(startOverview\.container, startProjects\.section\)/);
  assert.match(startScreenSource, /contentPanel\.append\(contentHeader, contentBody\)/);
  assert.match(startScreenSource, /container\.className = "document-start-overview"/);
  assert.match(startScreenSource, /title\.textContent = "All Project"/);
  assert.match(startScreenSource, /subtitle\.textContent = "Create, open and organize your projects\."/);
  assert.match(startScreenSource, /newProjectButton\.dataset\.documentOverviewNewProject = ""/);
  assert.match(startScreenSource, /startOverview\.newProjectButton\.addEventListener\("click"/);
  assert.match(startScreenSource, /section\.className = "document-start-projects"/);
  assert.match(startScreenSource, /grid\.className = "document-start-project-grid"/);
  assert.match(startScreenSource, /createCard\.dataset\.documentProjectCreate = ""/);
  assert.match(startScreenSource, /createTitle\.textContent = "Create new canvas"/);
  assert.match(startScreenSource, /grid\.append\(createCard\)/);
  assert.doesNotMatch(startScreenSource, /Saved project example/);
  assert.match(startScreenSource, /startProjects\.createCard\.addEventListener\("click"/);
  assert.match(startScreenSource, /editorPage\?\.classList\.add\("document-start-active"\)/);
  assert.match(startScreenSource, /namespace\.initEditorCanvas\?\.\(\{[\s\S]*documentHeight: preset\.height,[\s\S]*documentWidth: preset\.width/);
  assert.match(startScreenSource, /startWithNoActiveLayer: true/);
  assert.match(startScreenSource, /button\.dataset\.documentPreset = preset\.id/);
  assert.match(startScreenSource, /namespace\.documentSaveSystem/);
  assert.match(startScreenSource, /saveSystem\.listSummaries\(\)/);
  assert.match(startScreenSource, /saveSystem\.restore\(sessionId\)/);
  assert.match(startScreenSource, /saveSystem\.delete\?\.\(sessionId\)/);
  assert.match(startScreenSource, /clearCurrentDocument/);

  assert.match(appSource, /window\.CBO\.initEditorDocumentStart\(\);/);
  assert.ok(
    indexSource.indexOf("./js/document/document-autosave.js") > -1 &&
      indexSource.indexOf("./js/document/document-save-system.js") > -1 &&
      indexSource.indexOf("./js/document/document-autosave.js") < indexSource.indexOf("./js/editor-canvas.js") &&
      indexSource.indexOf("./js/editor-canvas.js") < indexSource.indexOf("./js/document-start-screen.js") &&
      indexSource.indexOf("./js/document-start-screen.js") < indexSource.indexOf("./js/app.js"),
  );
  assert.ok(
    indexSource.indexOf("./css/layout.css") > -1 &&
      indexSource.indexOf("./css/document-start-screen.css") > -1 &&
      indexSource.indexOf("./css/layout.css") < indexSource.indexOf("./css/document-start-screen.css"),
  );

  assert.match(cssSource, /\.document-start-screen/);
  assert.match(cssSource, /\.document-start-layout[\s\S]*grid-template-columns: 224px minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.document-start-layout[\s\S]*gap: 5px/);
  assert.match(cssSource, /\.document-start-sidebar[\s\S]*background: #181a1f/);
  assert.match(cssSource, /\.document-start-main[\s\S]*grid-template-rows: 70px minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.document-start-main[\s\S]*background: #181a1f/);
  assert.match(cssSource, /\.document-start-main-header[\s\S]*background: #121419/);
  assert.match(cssSource, /\.document-start-main-body/);
  assert.match(cssSource, /\.document-start-overview[\s\S]*min-height: 156px/);
  assert.match(cssSource, /\.document-start-overview[\s\S]*align-content: space-between/);
  assert.match(cssSource, /\.document-start-overview-title[\s\S]*font-size: 26px/);
  assert.match(cssSource, /\.document-start-overview-command-bar[\s\S]*justify-content: space-between/);
  assert.match(cssSource, /\.document-start-overview-new-project[\s\S]*height: 32px/);
  assert.match(cssSource, /\.document-start-projects[\s\S]*padding: 20px 20px 28px/);
  assert.match(cssSource, /\.document-start-project-grid[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(220px, 280px\)\)/);
  assert.match(cssSource, /\.document-start-project-preview[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(cssSource, /\.document-start-project-card-title[\s\S]*font-size: 13px/);
  assert.doesNotMatch(cssSource, /document-start-project-saved-shape/);
  assert.match(cssSource, /\.document-start-sidebar[\s\S]*padding: 18px/);
  assert.match(cssSource, /\.document-start-brand/);
  assert.match(cssSource, /\.document-start-new-project[\s\S]*display: inline-flex/);
  assert.match(cssSource, /\.document-start-all-projects[\s\S]*display: inline-flex/);
  assert.match(cssSource, /\.document-start-template[\s\S]*display: inline-flex/);
  assert.match(cssSource, /\.document-start-ai-archive[\s\S]*display: inline-flex/);
  assert.match(cssSource, /\.document-start-new-project svg[\s\S]*width: 20px/);
  assert.match(cssSource, /\.document-start-all-projects svg[\s\S]*width: 20px/);
  assert.match(cssSource, /\.document-start-template svg[\s\S]*width: 20px/);
  assert.match(cssSource, /\.document-start-ai-archive svg[\s\S]*width: 20px/);
  assert.match(cssSource, /\.editor-page\.document-start-active[\s\S]*--left-panel-width: 0px;[\s\S]*--right-panel-width: 0px/);
  assert.match(cssSource, /\.editor-page\.document-start-active > :not\(\.editor-stage\)[\s\S]*display: none !important/);
  assert.match(cssSource, /\.editor-page\.document-start-active \.editor-stage[\s\S]*margin: 0 !important/);
  assert.match(cssSource, /\.document-start-recovery/);
  assert.match(cssSource, /\.document-start-recovery-list/);
  assert.match(cssSource, /\.document-start-recovery-delete/);
  assert.match(cssSource, /\.document-start-preset/);
  assert.doesNotMatch(layoutSource, /\.document-start-screen/);
  assert.doesNotMatch(layoutSource, /\.document-start-new-project/);
});
