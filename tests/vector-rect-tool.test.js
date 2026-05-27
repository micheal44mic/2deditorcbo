const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

test("vector rectangle tool is wired to the shape toolbar and canvas init", () => {
  const indexSource = readRepoFile("index.html");
  const appSource = readRepoFile("js", "app.js");

  assert.match(indexSource, /aria-label="SQUARE"[\s\S]*data-tool-mode="vector-rect"/);
  assert.match(indexSource, /data-toolset-option="shape"[\s\S]*data-label="SQUARE"[\s\S]*data-tool-mode="vector-rect"/);
  assert.match(indexSource, /<script src="\.\/js\/vector-rect-tool\.js"><\/script>/);
  assert.match(appSource, /window\.CBO\.initVectorRectTool\?\.\(\)/);
});

test("vector rectangle layers are lightweight, saved entries instead of raster tiles", () => {
  const toolSource = readRepoFile("js", "vector-rect-tool.js");
  const layerModelSource = readRepoFile("js", "document", "document-layer-model.js");
  const layersPanelSource = readRepoFile("js", "layers-panel.js");
  const saveSystemSource = readRepoFile("js", "document", "document-save-system.js");
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(toolSource, /const VECTOR_RECT_LAYER_TYPE = "vector-rect"/);
  assert.match(toolSource, /const DEFAULT_RECT_FILL = "#bfefff"/);
  assert.match(toolSource, /const RECT_FILL_SWATCHES = \[/);
  assert.match(toolSource, /const SELECTED_RECT_STROKE = "#f05023"/);
  assert.match(toolSource, /const DEFAULT_RECT_RADIUS = 18/);
  assert.match(toolSource, /const MIN_RECT_SIZE = 12/);
  assert.match(toolSource, /const RECT_RESIZE_HANDLE_SIZE_CSS_PX = 10/);
  assert.match(toolSource, /const RECT_ACTION_TOOLBAR_GAP_CSS_PX = 14/);
  assert.match(toolSource, /const VECTOR_RECT_MOVE_TYPE = "vector-rect"/);
  assert.match(toolSource, /const VECTOR_TEXT_LAYER_TYPE = "vector-text"/);
  assert.match(toolSource, /class="lucide lucide-move-icon lucide-move"/);
  assert.match(toolSource, /const RECT_RESIZE_HANDLES = \[/);
  assert.match(toolSource, /const STAGE_INTERACTIVE_SELECTOR = \[/);
  assert.match(toolSource, /"\[data-mockup-slot\]"/);
  assert.match(toolSource, /"\[data-artboard-action-bubble\]"/);
  assert.match(toolSource, /"\[data-vector-text-layer\]"/);
  assert.match(toolSource, /function isPointerOverStageInteractiveTarget\(event, overlay\)/);
  assert.match(toolSource, /function documentPointToLayerPoint\(layer, point\)/);
  assert.match(toolSource, /function getVectorTextApproxBounds\(layer\)/);
  assert.match(toolSource, /function isPointInVectorTextApproxBounds\(point, layer, padding = 0\)/);
  assert.match(toolSource, /function isPointerOverVectorTextLayer\(event, layer, point = null\)/);
  assert.match(toolSource, /document\.querySelector\?\.\(`\.editor-vector-text-layer\[data-layer-id="\$\{cssEscape\(layerId\)\}"\]`\)/);
  assert.match(toolSource, /isPointInVectorTextApproxBounds\(point, layer, cssPixelsToDocumentUnits\(12\)\)/);
  assert.match(toolSource, /document\.elementsFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(toolSource, /function isPointerOverDrawingArtboardLabel\(event, stage\)/);
  assert.match(toolSource, /function isPointInsideDrawingArtboard\(point\)/);
  assert.match(toolSource, /function cssPixelsToDocumentUnits\(cssPixels\)/);
  assert.match(toolSource, /function getCameraViewportOffset\(\)/);
  assert.match(toolSource, /function getFillSwatch\(fill\)/);
  assert.match(toolSource, /function getVectorRectActionToolbarMarkup\(\)/);
  assert.match(toolSource, /function debugVectorRectFill\(message, detail = \{\}\)/);
  assert.match(toolSource, /function resizeRectFromHandle\(startRect, handle, startPoint, currentPoint\)/);
  assert.match(toolSource, /brushEngine\.screenToDocumentSpace\(event\.clientX, event\.clientY\)/);
  assert.match(toolSource, /namespace\.ensureDocumentLayerArtboardGroups\?\.\(/);
  assert.match(toolSource, /type: VECTOR_RECT_LAYER_TYPE/);
  assert.match(toolSource, /fill: options\.fill \|\| DEFAULT_RECT_FILL/);
  assert.match(toolSource, /rx: Number\.isFinite\(options\.rx\) \? Math\.max\(0, options\.rx\) : DEFAULT_RECT_RADIUS/);
  assert.match(toolSource, /locked: true/);
  assert.match(toolSource, /selectable: false/);
  assert.match(toolSource, /canvasObject: true/);
  assert.match(toolSource, /vectorEffect: "non-scaling-stroke"/);
  assert.match(toolSource, /layerModel\.setEntries\(nextEntries/);
  assert.match(toolSource, /function insertRectCanvasObjectAtBottom\(entries, layer\)/);
  assert.match(toolSource, /const firstNonCanvasObjectIndex = entries\.findIndex\(\(entry\) => !isCanvasObjectEntry\(entry\)\)/);
  assert.match(toolSource, /const didInsert = insertRectCanvasObjectAtBottom\(entries, layer\)/);
  assert.match(layerModelSource, /isCanvasObjectLayerEntry\(entry\)/);
  assert.match(layerModelSource, /entry\?\.type === "vector-rect"/);
  assert.match(layerModelSource, /delete clone\.artboardId/);
  assert.match(layersPanelSource, /function isCanvasObjectLayerEntry\(entry\)/);
  assert.match(layersPanelSource, /function isLayerPanelHiddenEntry\(entry\)/);
  assert.match(layersPanelSource, /entry\?\.type === "vector-rect"/);
  assert.match(layersPanelSource, /collectLayerPanelHiddenEntries\(layerModel\.getEntries\?\.\(\) \|\| \[\]\)/);
  assert.match(layersPanelSource, /if \(isLayerPanelHiddenEntry\(entry\)\) \{\s*return null;\s*\}/);
  assert.match(layersPanelSource, /const nextEntries = \[\.\.\.looseCanvasObjectEntries, \.\.\.artboardEntries\]/);
  assert.match(toolSource, /getHitLayerAtPoint\(point, event\)/);
  assert.match(toolSource, /isPointerBlockedByPriorityLayer\(event, point\)/);
  assert.match(toolSource, /return layers\.some\(\(layer\) => isVectorTextLayerEntry\(layer\) && isPointerOverVectorTextLayer\(event, layer, point\)\)/);
  assert.doesNotMatch(toolSource, /function isSelectionToolState\(detail = \{\}\)/);
  assert.match(toolSource, /this\.canSelectExistingRects = this\.isActive/);
  assert.match(toolSource, /this\.clearSelection\("vector-rect-tool-change-clear-selection"\)/);
  assert.match(toolSource, /const canMoveHitLayer = this\.isSelectedLayerMoveArmed\(hitLayer\.id\)/);
  assert.match(toolSource, /if \(!canMoveHitLayer\) \{/);
  assert.match(toolSource, /isMobileMovePointerTarget\(event\) \{[\s\S]*if \(!this\.isSelectedLayerMoveArmed\(\)\) \{/);
  assert.doesNotMatch(toolSource, /if \(!isMobileMoveViewport\(\) \|\| !this\.isSelectedLayerMoveArmed\(\)\) \{/);
  assert.match(toolSource, /beginMoveDrag\(hitLayer, event, point\)/);
  assert.match(toolSource, /moveLayerByDelta\(state\.layerId, state\.startRect, delta\)/);
  assert.match(toolSource, /beginResizeDrag\(resizeHit\.layer, resizeHit\.handle, event, point\)/);
  assert.match(toolSource, /resizeLayerToRect\([\s\S]*state\.layerId/);
  assert.match(toolSource, /layerModel\.updateLayer\(normalizedLayerId/);
  assert.match(toolSource, /createRectTitleNode\(layer, rect/);
  assert.match(toolSource, /createRectResizeHandlesNode\(layer, rect\)/);
  assert.match(toolSource, /this\.toolbar = document\.createElement\("div"\)/);
  assert.match(toolSource, /this\.toolbar\.className = "editor-vector-rect-action-toolbar editor-ai-image-board-action-toolbar"/);
  assert.match(toolSource, /this\.toolbar\.innerHTML = getVectorRectActionToolbarMarkup\(\)/);
  assert.match(toolSource, /editor-ai-image-board-action-toolbar-items editor-vector-rect-action-toolbar-items/);
  assert.match(toolSource, /editor-ai-image-board-action-toolbar-button editor-vector-rect-fill-swatch/);
  assert.match(toolSource, /editor-ai-image-board-action-toolbar-button editor-vector-rect-move-button/);
  assert.match(toolSource, /handleToolbarClick\(event\)/);
  assert.match(toolSource, /handleToolbarPointerDown\(event\)/);
  assert.match(toolSource, /handleDocumentPointerDown\(event\)/);
  assert.match(toolSource, /clearSelection\(source = "vector-rect-clear-selection"\)/);
  assert.match(toolSource, /document\.addEventListener\("pointerdown", this\.handleDocumentPointerDown, true\)/);
  assert.match(toolSource, /this\.clearSelection\("vector-rect-document-pointer-clear-selection"\)/);
  assert.match(toolSource, /this\.clearSelection\("vector-rect-artboard-pointer-clear-selection"\)/);
  assert.match(toolSource, /setSelectedLayerFill\(fill\)/);
  assert.match(toolSource, /updateToolbar\(layers\)/);
  assert.match(toolSource, /function getRectTitleMetrics\(rect\)/);
  assert.match(toolSource, /function truncateTitleToWidth\(title, availableWidth, fontSize\)/);
  assert.match(toolSource, /style: `font-size: \$\{bounds\.fontSize\}px;`/);
  assert.match(toolSource, /text\.textContent = bounds\.displayTitle/);
  assert.match(toolSource, /getRenderableLayers\?\.\(\)/);
  assert.match(toolSource, /createSvgElement\("rect"/);
  assert.match(layoutSource, /\.editor-artboard-paper-layer \{[\s\S]*z-index: 2;/);
  assert.match(layoutSource, /\.editor-vector-rect-overlay \{[\s\S]*z-index: 1;/);
  assert.match(layoutSource, /\.editor-vector-rect-action-toolbar \{[\s\S]*z-index: 80;[\s\S]*width: max-content;[\s\S]*background: #ffffff;/);
  assert.match(layoutSource, /\.editor-vector-rect-fill-swatch \{[\s\S]*width: 32px;[\s\S]*border-radius: 10px;/);
  assert.match(layoutSource, /\.editor-vector-rect-fill-swatch-chip \{[\s\S]*width: 22px;[\s\S]*border-radius: 999px;/);
  assert.match(layoutSource, /\.editor-vector-rect-move-button \{[\s\S]*width: 32px;[\s\S]*height: 32px;/);
  assert.match(layoutSource, /\.editor-vector-rect-move-button\.is-active \{[\s\S]*color: #d94116;/);
  assert.match(layoutSource, /\.editor-vector-rect-hit-area \{[\s\S]*pointer-events: none;/);
  const connectionLayerRule = layoutSource.match(/\.editor-artboard-connection-layer\s*\{[^}]*\}/)?.[0] || "";
  assert.match(connectionLayerRule, /z-index:\s*3;/);
  assert.match(toolSource, /style: `fill: \$\{fill\};`/);
  assert.match(layoutSource, /\.editor-vector-rect-shape \{[\s\S]*stroke: #dbdbdb;/);
  assert.doesNotMatch(layoutSource.match(/\.editor-vector-rect-shape \{[\s\S]*?\}/)?.[0] || "", /fill:/);
  assert.match(layoutSource, /\.editor-vector-rect-layer\.is-selected \.editor-vector-rect-shape \{[\s\S]*stroke: #f05023;/);
  assert.match(layoutSource, /\.editor-vector-rect-title-text \{/);
  assert.match(layoutSource, /\.editor-vector-rect-resize-hit \{[\s\S]*pointer-events: none;/);
  assert.match(layoutSource, /\.editor-vector-rect-resize-handle \{[\s\S]*stroke: #f05023;[\s\S]*vector-effect: non-scaling-stroke;/);

  assert.match(layerModelSource, /if \(type === "vector-rect"\) \{\s*return "Rectangle";\s*\}/);
  assert.match(layersPanelSource, /if \(type === "vector-rect"\)/);
  assert.match(saveSystemSource, /const RASTER_LAYER_TYPES = new Set\(\["paint", "image"\]\)/);
});

test("selected vector rectangles show a white fill swatch toolbar", () => {
  const toolSource = readRepoFile("js", "vector-rect-tool.js");
  const layoutSource = readRepoFile("css", "layout.css");
  const swatchesSource = toolSource.match(/const RECT_FILL_SWATCHES = \[[\s\S]*?\];/)?.[0] || "";

  assert.match(toolSource, /this\.toolbar\.dataset\.vectorRectActionToolbar = ""/);
  assert.match(toolSource, /\(document\.body \|\| this\.stage\)\.appendChild\(this\.toolbar\)/);
  assert.match(toolSource, /getSelectedLayerDisplayRect\(layers = this\.getRenderableVectorRectLayers\(\)\)/);
  assert.match(toolSource, /getDocumentRectViewportRect\(rect\)/);
  assert.match(toolSource, /this\.toolbar\.setAttribute\("aria-hidden", "false"\)/);
  assert.match(toolSource, /this\.toolbar\.classList\.add\("is-active"\)/);
  assert.match(toolSource, /this\.toolbar\.classList\.remove\("is-active"\)/);
  assert.match(toolSource, /const layer = this\.canSelectExistingRects \? this\.getSelectedLayer\(layers\) : null/);
  assert.match(toolSource, /this\.toolbar\.style\.pointerEvents = "auto"/);
  assert.match(toolSource, /data-vector-rect-fill-swatch/);
  assert.match(toolSource, /data-vector-rect-move/);
  assert.match(toolSource, /toggleSelectedLayerMove\(\)/);
  assert.match(toolSource, /namespace\.toggleMobileObjectMoveArmed\?\.\(\{[\s\S]*type: VECTOR_RECT_MOVE_TYPE/);
  assert.equal(swatchesSource.match(/fill:/g)?.length, 4);
  assert.match(swatchesSource, /#bfefff/);
  assert.match(toolSource, /this\.setSelectedLayerFill\(swatch\.dataset\.vectorRectFill\)/);
  assert.match(toolSource, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(toolSource, /if \(normalizeFillColor\(currentLayer\?\.fill\) === swatch\.fill\.toLowerCase\(\)\)/);
  assert.match(toolSource, /debugVectorRectFill\("swatch-pointerdown"/);
  assert.match(toolSource, /debugVectorRectFill\("apply-fill"/);
  assert.match(toolSource, /source: "vector-rect-fill"/);
  assert.match(toolSource, /fill: swatch\.fill/);
  assert.match(toolSource, /if \(didUpdate\) \{[\s\S]*this\.render\(\);[\s\S]*\}/);
  assert.doesNotMatch(swatchesSource, /transparent/i);
  assert.match(layoutSource, /\.editor-vector-rect-action-toolbar \{[\s\S]*height: 40px;[\s\S]*border-radius: 14px;/);
  assert.match(layoutSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-vector-rect-action-toolbar \{[\s\S]*position: fixed;[\s\S]*bottom: calc\(var\(--cbo-mobile-floating-bottom\) \+ 28px\);[\s\S]*z-index: 9030;/);
  assert.match(layoutSource, /\.editor-vector-rect-action-toolbar \{[\s\S]*left: 50% !important;[\s\S]*top: auto !important;/);
  assert.ok(
    layoutSource.lastIndexOf("@media (hover: none), (pointer: coarse), (max-width: 900px)") >
      layoutSource.indexOf(".editor-vector-rect-action-toolbar {\n  position: absolute;"),
  );
  assert.match(layoutSource, /\.editor-vector-rect-fill-swatch\.is-active \.editor-vector-rect-fill-swatch-chip \{[\s\S]*0 0 0 2px #f05023;/);
});

test("selected vector rectangles can be resized with lightweight svg handles", () => {
  const toolSource = readRepoFile("js", "vector-rect-tool.js");
  const pointerDownSource = toolSource.match(/handlePointerDown\(event\) \{[\s\S]*?\n    getRenderableVectorRectLayers\(\)/)?.[0] || "";

  assert.match(pointerDownSource, /const resizeHit = this\.canSelectExistingRects \? this\.getResizeHandleAtPoint\(point, event\) : null/);
  assert.ok(
    pointerDownSource.indexOf("const resizeHit = this.canSelectExistingRects") <
      pointerDownSource.indexOf("const hitLayer = this.canSelectExistingRects")
  );
  assert.match(toolSource, /this\.resizePreview = \{[\s\S]*rect: resizeRectFromHandle/);
  assert.match(toolSource, /historyGroup: `vector-rect-resize-\$\{normalizedLayerId\}`/);
  assert.match(toolSource, /source: "vector-rect-resize"/);
});

test("vector rectangles sit below drawing artboards and do not hit through them", () => {
  const toolSource = readRepoFile("js", "vector-rect-tool.js");
  const layoutSource = readRepoFile("css", "layout.css");
  const pointerDownSource = toolSource.match(/handlePointerDown\(event\) \{[\s\S]*?\n    getRenderableVectorRectLayers\(\)/)?.[0] || "";

  assert.match(layoutSource, /\.editor-artboard-paper-layer \{[\s\S]*z-index: 2;/);
  assert.match(layoutSource, /\.editor-vector-rect-overlay \{[\s\S]*z-index: 1;/);
  assert.match(pointerDownSource, /isPointerOverDrawingArtboardLabel\(event, this\.stage\)/);
  assert.match(pointerDownSource, /isPointInsideDrawingArtboard\(point\)/);
  assert.ok(
    pointerDownSource.indexOf("isPointerOverDrawingArtboardLabel(event, this.stage)") <
      pointerDownSource.indexOf("const point = this.getEventDocumentPoint(event)")
  );
  assert.ok(
    pointerDownSource.indexOf("const point = this.getEventDocumentPoint(event)") <
      pointerDownSource.indexOf("isPointInsideDrawingArtboard(point)")
  );
  assert.ok(
    pointerDownSource.indexOf("isPointInsideDrawingArtboard(point)") <
      pointerDownSource.indexOf("const resizeHit = this.canSelectExistingRects")
  );
});

test("vector rectangles do not steal clicks from ai image boards above them", () => {
  const toolSource = readRepoFile("js", "vector-rect-tool.js");
  const pointerDownSource = toolSource.match(/handlePointerDown\(event\) \{[\s\S]*?\n    getRenderableVectorRectLayers\(\)/)?.[0] || "";

  assert.match(pointerDownSource, /isPointerOverStageInteractiveTarget\(event, this\.svg\)/);
  assert.ok(
    pointerDownSource.indexOf("isPointerOverStageInteractiveTarget(event, this.svg)") <
      pointerDownSource.indexOf("const point = this.getEventDocumentPoint(event)")
  );
  assert.ok(
    pointerDownSource.indexOf("const point = this.getEventDocumentPoint(event)") <
      pointerDownSource.indexOf("const hitLayer = this.canSelectExistingRects")
  );
});

test("ai image and video action toolbars sit above canvas overlays", () => {
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(layoutSource, /\.editor-space-board-layer \{[\s\S]*z-index: 8;/);
  assert.match(layoutSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \{[\s\S]*z-index: 40;/);
  assert.match(layoutSource, /\.editor-ai-image-board-action-toolbar \{[\s\S]*z-index: 80;/);
  assert.match(layoutSource, /\.editor-ai-image-board-video-mute \{[\s\S]*z-index: 80;/);
  assert.match(layoutSource, /\.editor-ai-image-board-mobile-action-toolbar \{[\s\S]*z-index: 9030;/);
});
