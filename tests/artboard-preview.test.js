const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("left rail exposes a visual artboard tool below layers", () => {
  const indexSource = readRepoFile("index.html");
  const layerButtonIndex = indexSource.indexOf('data-drawer-panel="layers"');
  const artboardButtonIndex = indexSource.indexOf("data-artboard-create");

  assert.notEqual(layerButtonIndex, -1);
  assert.notEqual(artboardButtonIndex, -1);
  assert.ok(artboardButtonIndex > layerButtonIndex);
  assert.match(indexSource, /data-tooltip="ARTBOARD"/);
  assert.match(indexSource, /class="lucide lucide-dice1-icon lucide-dice-1"/);
  assert.match(indexSource, /<script src="\.\/js\/document\/document-artboard-model\.js"><\/script>/);
  assert.match(indexSource, /<script src="\.\/js\/artboard-preview\.js"><\/script>/);
});

test("artboard preview creates non-editable 1048 x 2048 stage frames", () => {
  const source = readRepoFile("js", "artboard-preview.js");
  const cssSource = readRepoFile("css", "layout.css");
  const appSource = readRepoFile("js", "app.js");

  assert.match(source, /const PREVIEW_ARTBOARD_WIDTH = 1048/);
  assert.match(source, /const PREVIEW_ARTBOARD_HEIGHT = 2048/);
  assert.match(source, /const DEFAULT_PREVIEW_ARTBOARD_COUNT = 2/);
  assert.match(source, /namespace\.getDocumentArtboards\?\.\(\)/);
  assert.match(source, /namespace\.createDocumentArtboard\?\.\(/);
  assert.match(source, /namespace\.initArtboardPreview = function initArtboardPreview\(\)/);
  assert.match(source, /button\.addEventListener\("click", handleCreateButtonClick\)/);
  assert.match(source, /layer\.replaceChildren/);
  assert.match(cssSource, /\.editor-artboard-preview-layer[\s\S]*pointer-events: none/);
  assert.match(cssSource, /\.editor-artboard-frame/);
  assert.match(cssSource, /\.editor-artboard-paper[\s\S]*background: #f7f7f2/);
  assert.match(cssSource, /\.editor-artboard-frame[\s\S]*background: transparent/);
  assert.match(appSource, /window\.CBO\.initArtboardPreview\?\.\(\);/);
});

test("layers panel mirrors artboards as collapsed artboard groups", () => {
  const layersSource = readRepoFile("js", "layers-panel.js");
  const layerModelSource = readRepoFile("js", "document", "document-layer-model.js");
  const cssSource = readRepoFile("css", "layers-panel.css");

  assert.match(layersSource, /function ensureArtboardLayerGroups\(source = "layers-panel-artboards"\)/);
  assert.match(layersSource, /artboardGroup: true/);
  assert.match(layersSource, /window\.CBO\.getDocumentArtboards\?\.\(\)/);
  assert.match(layersSource, /window\.addEventListener\("cbo:document-artboards-change"/);
  assert.match(layersSource, /window\.addEventListener\("cbo:artboard-preview-change"/);
  assert.match(layersSource, /function getCurrentArtboardLayerEntry\(\)/);
  assert.match(layersSource, /activeArtboardChildren\.prepend\(entry\)/);
  assert.match(layersSource, /expandArtboardLayerEntry\(activeArtboardEntry\)/);
  assert.match(layersSource, /class="lucide lucide-dice1-icon lucide-dice-1"/);
  assert.match(layersSource, /layerEntry\.classList\.toggle\("collapsed", shouldCollapse\)/);
  assert.match(cssSource, /\.layer-artboard-row/);
  assert.match(layerModelSource, /entry\.artboardGroup === true/);
  assert.match(layerModelSource, /resolveInsertionArtboardId\(activeEntry, options\)/);
  assert.match(layerModelSource, /insertAtTopOfArtboard\(targetArtboardId, paintLayer\)/);
});

test("selection tool highlights the clicked artboard and its layer group only", () => {
  const previewSource = readRepoFile("js", "artboard-preview.js");
  const layersSource = readRepoFile("js", "layers-panel.js");
  const layoutSource = readRepoFile("css", "layout.css");
  const layerCssSource = readRepoFile("css", "layers-panel.css");

  assert.match(previewSource, /const SELECTION_TOOL_MODE = "selection"/);
  assert.match(previewSource, /function handleStagePointerDown\(event\)/);
  assert.match(previewSource, /cbo:artboard-selection-change/);
  assert.match(previewSource, /frame\.classList\.toggle\("is-selected", isSelected\)/);
  assert.match(previewSource, /namespace\.selectPreviewArtboard = function selectPreviewArtboard/);
  assert.match(previewSource, /namespace\.clearPreviewArtboardSelection = function clearPreviewArtboardSelection/);
  assert.match(previewSource, /namespace\.deletePreviewArtboard = function deletePreviewArtboardFromTool/);
  assert.match(previewSource, /namespace\.movePreviewArtboard = function movePreviewArtboardFromTool/);
  assert.match(previewSource, /cbo:document-artboard-selection-change/);
  assert.match(previewSource, /source: "artboard-preview-stage-empty-pointer"/);
  assert.match(layoutSource, /\.editor-artboard-frame\.is-selected/);

  assert.match(layersSource, /let selectedArtboardGroupId = ""/);
  assert.match(layersSource, /function applyArtboardGroupActivationById\(groupId, options = \{\}\)/);
  assert.match(layersSource, /function deleteSelectedArtboardGroup\(\)/);
  assert.match(layersSource, /row\.classList\.toggle\("artboard-active", isActiveArtboard\)/);
  assert.match(layersSource, /window\.addEventListener\("cbo:artboard-selection-change", handleArtboardSelectionChange\)/);
  assert.match(layersSource, /window\.CBO\.selectPreviewArtboard\?\.\(artboardId/);
  assert.match(layersSource, /window\.CBO\.clearPreviewArtboardSelection\?\.\(/);
  assert.match(layersSource, /window\.CBO\.deletePreviewArtboard\?\.\(artboardId/);
  assert.match(layersSource, /artboardId === "active-document"/);
  assert.match(layerCssSource, /\.layer-artboard-row\.artboard-active/);
});

test("preview artboards can be dragged from their title labels", () => {
  const previewSource = readRepoFile("js", "artboard-preview.js");
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(previewSource, /let artboardDragState = null/);
  assert.match(previewSource, /function getArtboardLabelAtClientPoint\(clientX, clientY\)/);
  assert.match(previewSource, /function startArtboardDrag\(event, artboard\)/);
  assert.match(previewSource, /artboard\.isPrimary === true/);
  assert.match(previewSource, /function updateArtboardDrag\(event\)/);
  assert.match(previewSource, /movePreviewArtboard\(artboardDragState\.artboardId, nextX, nextY/);
  assert.match(previewSource, /emitArtboardPreviewChange\("artboard-preview-label-drag"\)/);
  assert.match(previewSource, /stage\.addEventListener\("pointermove", updateArtboardDrag, true\)/);
  assert.match(previewSource, /function renamePreviewArtboards\(\)/);
  assert.doesNotMatch(previewSource, /artboard\.x = Math\.round\(previous\.x \+ previous\.width \+ PREVIEW_ARTBOARD_GAP\)/);
  assert.match(layoutSource, /\.editor-stage\.artboard-label-hover/);
  assert.match(layoutSource, /\.editor-stage\.artboard-dragging/);
});

test("document artboard model owns artboard records and persistence hooks", () => {
  const modelSource = readRepoFile("js", "document", "document-artboard-model.js");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const autosaveSource = readRepoFile("js", "document", "document-autosave.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");

  assert.match(modelSource, /class DocumentArtboardModel extends EventTarget/);
  assert.match(modelSource, /const PRIMARY_ARTBOARD_ID = "active-document"/);
  assert.match(modelSource, /createPrimaryArtboard/);
  assert.match(modelSource, /createSecondaryArtboard/);
  assert.match(modelSource, /window\.dispatchEvent\(new CustomEvent\("cbo:document-artboards-change"/);
  assert.match(modelSource, /window\.dispatchEvent\(new CustomEvent\("cbo:document-artboard-selection-change"/);
  assert.match(modelSource, /namespace\.getDocumentArtboards = function getDocumentArtboards/);
  assert.match(modelSource, /namespace\.moveDocumentArtboard = function moveDocumentArtboard/);
  assert.match(modelSource, /namespace\.deleteDocumentArtboard = function deleteDocumentArtboard/);
  assert.match(modelSource, /namespace\.getDocumentArtboardAtPoint = function getDocumentArtboardAtPoint/);
  assert.match(modelSource, /namespace\.selectDocumentArtboardAtPoint = function selectDocumentArtboardAtPoint/);
  assert.match(modelSource, /namespace\.getActiveDocumentArtboardRect = function getActiveDocumentArtboardRect/);
  assert.match(modelSource, /namespace\.getDocumentArtboardUnionRect = function getDocumentArtboardUnionRect/);
  assert.match(modelSource, /namespace\.getActiveDocumentArtboardCoverageRects = function getActiveDocumentArtboardCoverageRects/);

  assert.match(editorCanvasSource, /DocumentArtboardModel non caricato/);
  assert.match(editorCanvasSource, /window\.CBO\.resetDocumentArtboards\?\.\(\{/);
  assert.match(editorCanvasSource, /artboards: options\.artboards/);
  assert.match(autosaveSource, /artboards: namespace\.getDocumentArtboards\?\.\(\) \|\| \[\]/);
  assert.match(autosaveSource, /artboards: session\.document\.artboards \|\| \[\]/);
  assert.match(autosaveSource, /source: "autosave-restore-artboards"/);
  assert.match(rendererSource, /getDocumentBoundsRect\(\)/);
  assert.match(rendererSource, /namespace\.getDocumentArtboardUnionRect\?\.\(\)/);
  assert.match(rendererSource, /const documentRect = this\.getDocumentBoundsRect\(\)/);
});
