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
  assert.match(panelSource, /function openMobileBrushLibrary\(\)/);
  assert.match(panelSource, /function closeMobileBrushLibrary\(\)/);
});

test("mobile brush library keeps a two-column scrollable package and brush picker", () => {
  const panelSource = readRepoFile("js", "brushes-panel.js");
  const panelCss = readRepoFile("css", "brushes-panel.css");

  assert.match(panelSource, /New set/);
  assert.match(panelSource, /New brush/);
  assert.match(panelSource, /Import/);
  assert.doesNotMatch(panelSource, /data-mobile-brush-debug-copy/);
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

  assert.match(panelCss, /@media \(max-width: 900px\) \{[\s\S]*\.mobile-brush-library:not\(\[hidden\]\)/);
  assert.match(panelCss, /\.mobile-brush-library:not\(\[hidden\]\) \{[\s\S]*background: #181a1f/);
  assert.match(panelCss, /\.mobile-brush-library-done \{[\s\S]*color: #f05023/);
  assert.match(panelCss, /\.mobile-brush-library-layout \{[\s\S]*grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(panelCss, /\.mobile-brush-library-packages,[\s\S]*\.mobile-brush-library-brushes \{[\s\S]*overflow-y: auto/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.active \{[\s\S]*background: #f05023/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.just-selected/);
  assert.match(panelCss, /\.mobile-brush-library-brush\.has-preview \.mobile-brush-library-preview \{[\s\S]*opacity: 0\.72/);
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
