const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("rect area selection is loaded and wired to the side toolbar", () => {
  const indexSource = readRepoFile("index.html");
  const appSource = readRepoFile("js", "app.js");
  const toolbarSource = readRepoFile("js", "vertical-toolbar.js");
  const selectionSource = readRepoFile("js", "area-selection-tool.js");
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(indexSource, /js\/area-selection-tool\.js/);
  assert.match(appSource, /initAreaSelectionTool\?\.\(\)/);
  assert.match(toolbarSource, /data-tool-mode="selection-rect"/);
  assert.match(selectionSource, /const RECT_TOOL_MODE = "selection-rect"/);
  assert.match(selectionSource, /const MIN_SELECTION_SIZE = 3/);
  assert.match(selectionSource, /namespace\.areaSelection = \{/);
  assert.match(selectionSource, /function getDocumentScreenRect\(\)/);
  assert.match(selectionSource, /--area-document-width/);
  assert.match(selectionSource, /overlay\.append\(shadeTop, shadeRight, shadeBottom, shadeLeft, outline\)/);
  assert.match(selectionSource, /host\?\.appendChild\(overlay\)/);
  assert.match(layoutSource, /\.editor-area-selection-overlay/);
  assert.match(layoutSource, /position: absolute/);
  assert.match(layoutSource, /z-index: 3/);
  assert.match(layoutSource, /\.editor-area-selection-shade/);
  assert.match(layoutSource, /var\(--area-document-x, 0px\)/);
  assert.match(layoutSource, /background: rgba\(24, 160, 251, 0\.11\)/);
  assert.match(layoutSource, /\.editor-area-selection-outline/);
  assert.match(layoutSource, /linear-gradient\(90deg, #18a0fb 0 50%, rgba\(245, 251, 255, 0\.95\) 50% 100%\)/);
  assert.match(layoutSource, /cbo-area-selection-march/);
});

test("brush and fill constrain raster edits to an active area selection", () => {
  const brushSource = readRepoFile("js", "brush-engine.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");
  const fillSource = readRepoFile("js", "color-fill.js");
  const smudgeSource = readRepoFile("js", "smudge-engine.js");

  assert.match(brushSource, /const selectionRect = namespace\.areaSelection\?\.hasSelection\?\.\(\)/);
  assert.match(brushSource, /const effectiveStrokeRect = selectionRect/);
  assert.match(brushSource, /getActiveStrokeTilePatchRects\(effectiveStrokeRect\)/);
  assert.match(brushSource, /ensureRasterTargetsForPaintRect\?\.\(layerId, effectiveStrokeRect/);
  assert.match(brushSource, /beginRasterTileHistory\?\.\(layerId, effectiveStrokeRect/);
  assert.match(brushSource, /activeStrokeClipRect: namespace\.areaSelection\?\.hasSelection\?\.\(\)/);
  assert.match(rendererSource, /const activeStrokeHasClip = Boolean\(options\.activeStrokeClipRect && activeStrokeRect\)/);
  assert.match(rendererSource, /withActiveStrokeClip\(\(\) => \{/);
  assert.match(rendererSource, /uniform vec4 u_maskClipRect/);
  assert.match(rendererSource, /let currentMaskClipRect = null/);
  assert.match(rendererSource, /currentMaskClipRect = activeStrokeClipRect \|\| null/);
  assert.match(rendererSource, /isActiveStrokeLayer && activeStrokeMode !== "eraser" && !activeStrokeClipRect/);
  assert.match(brushSource, /gl\.enable\(gl\.SCISSOR_TEST\)/);
  assert.match(smudgeSource, /getActiveAreaSelectionRect\(\) \{/);
  assert.match(smudgeSource, /namespace\.areaSelection\?\.hasSelection\?\.\(\)/);
  assert.match(smudgeSource, /bounds = this\.clipBoundsToAreaSelection\(bounds\)/);
  assert.match(fillSource, /namespace\.areaSelection\.isPointInside\?\.\(seedX, seedY\)/);
  assert.match(fillSource, /dirtyRect = intersectRects\(dirtyRect, selectionRect\)/);
});

test("delete and escape shortcuts operate on the active area selection", () => {
  const selectionSource = readRepoFile("js", "area-selection-tool.js");

  assert.match(selectionSource, /function deleteSelectionPixels\(\)/);
  assert.match(selectionSource, /beginRasterTileHistory\?\.\(layerId, rect,/);
  assert.match(selectionSource, /key === "Escape"/);
  assert.match(selectionSource, /key === "Escape"[\s\S]*event\.stopPropagation\(\);[\s\S]*clear\(\{ source: "area-selection-escape" \}\);[\s\S]*if \(isEditableTarget\(event\.target\)\)/);
  assert.match(selectionSource, /event\.key !== "Delete" && event\.key !== "Backspace"/);
});
