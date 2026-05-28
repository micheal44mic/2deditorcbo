const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("mobile brush library opens from an already active brush tool", () => {
  const toolbarSource = readRepoFile("js", "toolbar.js");
  const panelSource = readRepoFile("js", "brushes-panel.js");

  assert.match(toolbarSource, /function openMobileBrushLibraryFromActiveTool\(button\)/);
  assert.match(toolbarSource, /button\.classList\.contains\("active"\)/);
  assert.match(toolbarSource, /new CustomEvent\("cbo:brush-tool-reactivate"/);
  assert.match(toolbarSource, /button\.dataset\.toolSync === "brush"/);

  assert.match(panelSource, /data-mobile-brush-library/);
  assert.match(panelSource, /window\.addEventListener\("cbo:brush-tool-reactivate"/);
  assert.match(panelSource, /function openMobileBrushLibrary\(options = \{\}\)/);
  assert.match(panelSource, /function closeMobileBrushLibrary\(\)/);
});

test("mobile brush library keeps a two-column scrollable package and brush picker", () => {
  const indexSource = readRepoFile("index.html");
  const panelSource = readRepoFile("js", "brushes-panel.js");
  const panelCss = readRepoFile("css", "brushes-panel.css");

  assert.match(panelSource, /New set/);
  assert.match(panelSource, /New brush/);
  assert.match(panelSource, /Import/);
  assert.doesNotMatch(indexSource, /js\/debug\/mobile-brush-debug-console\.js/);
  assert.doesNotMatch(panelCss, /\.mobile-brush-debug-copy/);
  assert.match(panelSource, /data-mobile-brush-packages/);
  assert.match(panelSource, /data-mobile-brush-items/);
  assert.match(panelSource, /brushPackages\.map\(\(brushPackage, packageIndex\)/);
  assert.match(panelSource, /activePackage\?\.brushIds/);
  assert.match(panelSource, /previewCanvas\.dataset\.brushPreviewVariant = "mobile-gallery"/);
  assert.match(panelSource, /function queueMobileBrushPreview\(canvas, brushId\)/);
  assert.match(panelSource, /queueMobileBrushPreview\(previewCanvas, brushId\)/);
  assert.match(panelSource, /MOBILE_BRUSH_PREVIEW_SIZE = Object\.freeze/);
  assert.match(panelSource, /previewCanvas\.width = MOBILE_BRUSH_PREVIEW_SIZE\.width/);
  assert.match(panelSource, /previewCanvas\.height = MOBILE_BRUSH_PREVIEW_SIZE\.height/);
  assert.match(panelSource, /deferMobileBrushScrollIntoView/);
  assert.match(panelSource, /function syncMobileBrushSelectionState\(\)/);
  assert.match(panelSource, /button\.dataset\.mobileBrushId === selectedBrushId/);
  assert.match(panelSource, /const canSyncMobileSelection =[\s\S]*activePackageIndex === packageIndex[\s\S]*hasMobileBrushButton\(brushId\)/);
  assert.match(panelSource, /if \(canSyncMobileSelection\) \{[\s\S]*syncMobileBrushSelectionState\(\);[\s\S]*return;/);
  assert.match(panelSource, /selectBrush\(activePackageIndex, brushId\);[\s\S]*showMobileBrushSelectionFeedback\(brushId\);/);
  assert.match(panelSource, /function openMobileBrushStudio\(brushId\)/);
  assert.match(panelSource, /window\.CBO\.openBrushStudio\(\{[\s\S]*brushName: getBrushName\(brushId\)[\s\S]*source: "mobile-brush-library"/);
  assert.match(panelSource, /if \(brushId === selectedBrushId && openMobileBrushStudio\(brushId\)\) \{[\s\S]*event\.stopPropagation\(\);[\s\S]*return;/);
  assert.match(panelSource, /window\.CBO\.activeBrushName = getBrushName\(brushId\)/);

  assert.match(panelCss, /@media \(max-width: 900px\) \{[\s\S]*\.mobile-brush-library:not\(\[hidden\]\)/);
  assert.match(panelCss, /\.mobile-brush-library:not\(\[hidden\]\) \{[\s\S]*background: #181a1f/);
  assert.match(panelCss, /\.mobile-brush-library-done \{[\s\S]*color: #f05023/);
  assert.match(panelCss, /\.mobile-brush-library-layout \{[\s\S]*grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(panelCss, /\.mobile-brush-library-packages,[\s\S]*\.mobile-brush-library-brushes \{[\s\S]*overflow-y: auto/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.active \{[\s\S]*background: #f05023/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.just-selected/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.has-preview \.mobile-brush-library-preview \{[\s\S]*opacity: 0\.72/);
});

test("mobile new brush creates a base brush in the active set", () => {
  const panelSource = readRepoFile("js", "brushes-panel.js");

  assert.match(panelSource, /data-mobile-brush-create/);
  assert.match(panelSource, /const mobileBrushCreateButton = mobileBrushLibrary\?\.querySelector\("\[data-mobile-brush-create\]"\)/);
  assert.match(panelSource, /function createMobileBaseBrush\(\)/);
  assert.match(panelSource, /const activePackage = brushPackages\[activePackageIndex\][\s\S]*const createdBrush = BrushLibrary\.createBrush\(activePackage\?\.id\)/);
  assert.match(panelSource, /activePackageIndex = packageIndex;[\s\S]*selectBrush\(packageIndex, createdBrush\.id\);[\s\S]*showMobileBrushSelectionFeedback\(createdBrush\.id\);/);
  assert.match(panelSource, /mobileBrushCreateButton\?\.addEventListener\("click", createMobileBaseBrush\)/);
});

test("mobile brush studio opens as a Procreate Pocket style sheet", () => {
  const studioSource = readRepoFile("js", "brush-studio.js");
  const studioCss = readRepoFile("css", "brush-studio.css");

  assert.match(studioSource, /data-brush-studio-brush-name/);
  assert.match(studioSource, /class="brush-studio-mobile-title-text">Brush Studio/);
  assert.match(studioSource, /class="brush-studio-done-label">Done/);
  assert.match(studioSource, /data-brush-studio-settings-handle/);
  assert.match(studioSource, /function openBrushStudio\(options = \{\}\)/);
  assert.match(studioSource, /syncBrushStudioOpenContext\(options\)/);
  assert.match(studioSource, /brush-studio\.setting-change/);
  assert.match(studioSource, /setValue\(slider\.value, "slider-input"\)/);
  assert.match(studioSource, /brush-studio\.push-draft\.start/);
  assert.match(studioSource, /brush-studio\.preview-engine\.replay\.end/);
  assert.match(studioSource, /function openMobileSettingsSheet\(\{ expanded = false \} = \{\}\)/);
  assert.match(studioSource, /function closeMobileSettingsSheet\(\)/);
  assert.match(studioSource, /renderStudioContent\(\);[\s\S]*openMobileSettingsSheet\(\);/);
  assert.match(studioSource, /function startMobileSettingsDrag\(event\)/);
  assert.match(studioSource, /function moveMobileSettingsDrag\(event\)/);
  assert.match(studioSource, /function finishMobileSettingsDrag\(event\)/);
  assert.match(studioSource, /if \(deltaY > 90\) \{[\s\S]*closeMobileSettingsSheet\(\);/);

  assert.match(studioCss, /@media \(max-width: 900px\) \{[\s\S]*\.brush-studio-panel:not\(\[hidden\]\) \{/);
  assert.match(studioCss, /\.brush-studio-panel:not\(\[hidden\]\) \{[\s\S]*z-index: 10060/);
  assert.match(studioCss, /\.brush-studio-drawing-column \{[\s\S]*order: 1/);
  assert.match(studioCss, /\.brush-studio-drawing-pad \{[\s\S]*background: #f5f7fb/);
  assert.match(studioCss, /\.brush-studio-categories-column \{[\s\S]*order: 2/);
  assert.match(studioCss, /\.brush-studio-categories-column \{[\s\S]*border-radius: 28px 28px 0 0/);
  assert.match(studioCss, /\.brush-studio-categories \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(studioCss, /\.brush-studio-category\.active \{[\s\S]*background: #f05023/);
  assert.match(studioCss, /\.brush-studio-selection-column \{[\s\S]*transform: translateY\(calc\(100% \+ var\(--brush-studio-mobile-settings-offset, 0px\)\)\)/);
  assert.match(studioCss, /\.brush-studio-panel\.brush-studio-mobile-settings-open \.brush-studio-selection-column \{[\s\S]*transform: translateY\(var\(--brush-studio-mobile-settings-offset, 0px\)\)/);
  assert.match(studioCss, /\.brush-studio-mobile-settings-handle::before \{[\s\S]*background: #3a3f4b/);
  assert.match(studioCss, /\.brush-studio-panel\.brush-studio-mobile-settings-expanded \.brush-studio-selection-column \{[\s\S]*height: min\(74vh, 650px\)/);
  assert.match(studioCss, /\.brush-studio-check-button \.brush-studio-check-icon \{[\s\S]*display: none/);
  assert.doesNotMatch(studioCss, /(^|\n)\s*\.brush-studio-check-icon\s*\{[^}]*display:\s*none/);
  assert.match(studioCss, /\.brush-studio-shape-editor-header \{[\s\S]*display: grid/);
  assert.match(studioCss, /\.brush-studio-shape-editor-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) 44px/);
  assert.match(studioCss, /\.brush-studio-shape-accept-button \.brush-studio-check-icon \{[\s\S]*display: block/);
  assert.doesNotMatch(studioCss, /brush-studio-mobile-sheet-handle/);
});

test("brush studio compacts into a visible apply layout on tablet landscape", () => {
  const studioCss = readRepoFile("css", "brush-studio.css");

  assert.match(studioCss, /@media \(min-width: 901px\) and \(max-width: 1254px\),[\s\S]*\(orientation: landscape\)/);
  assert.match(studioCss, /\.brush-studio-panel:not\(\[hidden\]\) \{[\s\S]*z-index: 10070[\s\S]*grid-template-columns: minmax\(142px, 0\.78fr\) minmax\(180px, 1fr\) minmax\(236px, 1\.28fr\)/);
  assert.match(studioCss, /\.brush-studio-selection-column \{[\s\S]*position: relative[\s\S]*height: auto[\s\S]*transform: none/);
  assert.match(studioCss, /\.brush-studio-panel\.brush-studio-mobile-settings-open \.brush-studio-selection-column,[\s\S]*\.brush-studio-panel\.brush-studio-mobile-settings-expanded \.brush-studio-selection-column \{[\s\S]*height: auto[\s\S]*transform: none/);
  assert.match(studioCss, /\.brush-studio-categories-column \{[\s\S]*min-height: 0[\s\S]*max-height: none/);
  assert.match(studioCss, /\.brush-studio-done-label \{[\s\S]*display: inline/);
  assert.match(studioCss, /\.brush-studio-check-button \.brush-studio-check-icon \{[\s\S]*display: none/);
  assert.match(studioCss, /\.brush-studio-drawing-title,[\s\S]*\.brush-studio-selected-name \{[\s\S]*font-size: 18px/);
});

test("mobile brush library rows reveal attached swipe actions for share duplicate and delete", () => {
  const panelSource = readRepoFile("js", "brushes-panel.js");
  const panelCss = readRepoFile("css", "brushes-panel.css");

  assert.match(panelSource, /function handleMobileBrushSwipePointerDown\(event, row, button\)/);
  assert.match(panelSource, /function handleMobileBrushSwipePointerMove\(event\)/);
  assert.match(panelSource, /const MOBILE_BRUSH_ACTION_HANDLE_WIDTH = 44/);
  assert.match(panelSource, /function getMobileBrushSwipeMaxOffset\(row\)/);
  assert.match(panelSource, /rowWidth - handleWidth/);
  assert.match(panelSource, /if \(!moved\) \{[\s\S]*mobileBrushSwipeState = null;[\s\S]*return;[\s\S]*\}/);
  assert.match(panelSource, /brushRow\.classList\.contains\("is-actions-open"\)[\s\S]*closeMobileBrushActions\(brushRow\);[\s\S]*return;/);
  assert.match(panelSource, /function duplicateMobileBrush\(brushId\)/);
  assert.match(panelSource, /BrushLibrary\.duplicateBrush\(brushId\)/);
  assert.match(panelSource, /function deleteMobileBrush\(brushId\)/);
  assert.match(panelSource, /BrushLibrary\.deleteBrush\(brushId\)/);
  assert.match(panelSource, /shareButton\.textContent = "Share"/);
  assert.match(panelSource, /duplicateButton\.textContent = "Duplicate"/);
  assert.match(panelSource, /deleteButton\.textContent = "Delete"/);
  assert.match(panelSource, /window\.addEventListener\("pointermove", handleMobileBrushSwipePointerMove, \{ passive: false \}\)/);

  assert.match(panelCss, /\.mobile-brush-library-brush-row \{[\s\S]*--mobile-brush-action-offset: 0px/);
  assert.match(panelCss, /\.mobile-brush-library-brush-row \{[\s\S]*--mobile-brush-action-handle-width: 44px/);
  assert.match(panelCss, /\.mobile-brush-library-row-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(panelCss, /\.mobile-brush-library-row-actions \{[\s\S]*left: var\(--mobile-brush-action-handle-width\)/);
  assert.match(panelCss, /\.mobile-brush-library-row-actions \{[\s\S]*width: auto/);
  assert.match(panelCss, /\.mobile-brush-library-brush \{[\s\S]*transform: translateX\(calc\(var\(--mobile-brush-action-offset, 0px\) \* -1\)\)/);
  assert.match(panelCss, /\.mobile-brush-library-row-action-delete \{[\s\S]*background: #f05023/);
});
