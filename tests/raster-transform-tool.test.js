const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("raster transform tool is wired after the document renderer and canvas init", () => {
  const indexSource = readRepoFile("index.html");
  const appSource = readRepoFile("js", "app.js");
  const boundsIndex = indexSource.indexOf("./js/document/document-bounds.js");
  const rendererIndex = indexSource.indexOf("./js/document/document-renderer.js");
  const rasterToolIndex = indexSource.indexOf("./js/raster-transform-tool.js");
  const appIndex = indexSource.indexOf("./js/app.js");

  assert.ok(boundsIndex > 0);
  assert.ok(rendererIndex > boundsIndex);
  assert.ok(rasterToolIndex > rendererIndex);
  assert.ok(appIndex > rasterToolIndex);
  assert.match(appSource, /function initCanvasDependentTools\(\) \{[\s\S]*window\.CBO\.initRasterTransformTool\?\.\(\);/);
  assert.match(appSource, /window\.addEventListener\("cbo:editor-canvas-ready", initCanvasDependentTools\);/);
});

test("document bounds exposes shared bbox helpers", () => {
  const source = readRepoFile("js", "document", "document-bounds.js");

  assert.match(source, /namespace\.documentBounds = \{/);
  assert.match(source, /rectToBounds/);
  assert.match(source, /boundsToRect/);
  assert.match(source, /transformBounds/);
  assert.match(source, /getClampedRasterBox/);
  assert.match(source, /getUnionRect/);
  assert.match(source, /quadToBounds/);
});

test("document renderer supports raster transform preview and history commit", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");

  assert.match(source, /getRasterContentBounds\(layerId, options = \{\}\)/);
  assert.match(source, /getPuppetAlphaSamples\(target, sampleCols, sampleRows\)/);
  assert.match(source, /gl\.readPixels\(coarseRect\.x, readY, coarseRect\.width, coarseRect\.height/);
  assert.match(source, /setRasterTransformPreview\(preview = null\)/);
  assert.match(source, /u_previewCutMode/);
  assert.match(source, /if \(isRasterTransformPreviewLayer\) \{\s*setPreviewCut\(rasterTransformPreview\.sourceRect\);\s*\}\s*if \(layerTarget\?\.texture\)/);
  assert.match(source, /else if \(this\.isSparseRasterTarget\(layerTarget\)\)[\s\S]*if \(isRasterTransformPreviewLayer\) \{\s*setPreviewCut\(null\);/);
  assert.match(source, /drawTexturedQuad\(texture, quad, options = \{\}\)/);
  assert.match(source, /computeDestToSourceUvHomography\(destQuad\)/);
  assert.match(source, /drawPerspectiveTexturedQuad\(texture, quad, options = \{\}\)/);
  assert.match(source, /u_destToSourceUv/);
  assert.match(source, /commitRasterTransform\(options = \{\}\)/);
  assert.match(source, /finalizeRasterEditHistoryEntry\(layerId,/);
  assert.match(source, /beginRasterTileHistory\(layerId, dirtyRect,/);
  assert.match(source, /commitRasterTileHistory\(tileHistory,/);
  assert.match(source, /getTileBasedPreviewDirtyRects\(rects = \[\], options = \{\}\)/);
  assert.match(source, /\[sourceRect, destDirtyRect \|\| destRect\]/);
  assert.match(source, /\[currentTargetRect, nextRect\]/);
  assert.match(source, /rects: previewDirtyRects/);
  assert.match(source, /preserveDirtyRects: true/);
  assert.match(source, /"raster-transform",/);
  assert.match(source, /namespace\.documentHistory/);
  assert.doesNotMatch(source, /window\.CBO\.history/);
});

test("raster transform supports Photoshop-style warp mesh preview and commit", () => {
  const toolSource = readRepoFile("js", "raster-transform-tool.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(toolSource, /const WARP_TRANSFORM_MODE = "warp";/);
  assert.match(toolSource, /createWarpControlPointsFromQuad/);
  assert.match(toolSource, /evaluateWarpSurface/);
  assert.match(toolSource, /editor-raster-transform-warp-point/);
  assert.match(toolSource, /editor-raster-transform-warp-handle-line/);
  assert.match(toolSource, /applyWarpSurfaceDelta/);
  assert.match(toolSource, /const WARP_POINT_TOUCH_HIT_RADIUS_PX = 30;/);
  assert.match(toolSource, /getWarpPointHitAtClient\(clientX, clientY, pointerType = ""\)/);
  assert.match(toolSource, /this\.getWarpPointHitFromTarget\(event\.target\) \|\|[\s\S]*this\.getWarpPointHitAtClient\(event\.clientX, event\.clientY, event\.pointerType\)/);
  assert.match(toolSource, /warpControlPointsChanged/);
  assert.match(rendererSource, /const RASTER_WARP_MESH_COLS = 64;/);
  assert.match(rendererSource, /createRasterWarpMeshResource/);
  assert.match(rendererSource, /drawWarpTexturedMesh/);
  assert.match(rendererSource, /warpControlPoints/);
  assert.match(rendererSource, /rasterTransformPreview\.transformMode === "warp"/);
  assert.match(cssSource, /\.editor-raster-transform-warp-line/);
  assert.match(cssSource, /\.editor-raster-transform-warp-handle-line/);
  assert.match(cssSource, /\.editor-raster-transform-warp-point/);
});

test("raster transform samples snapshots linearly while resizing", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");

  assert.match(source, /setRasterTextureSampling\(texture, minFilter, magFilter = minFilter\)/);
  assert.match(source, /const textureFilter = Number\.isFinite\(options\.textureFilter\) \? options\.textureFilter : null/);
  assert.match(source, /this\.setRasterTextureSampling\(texture, textureFilter\)/);
  assert.match(source, /this\.setRasterTextureSampling\(texture, restoreTextureFilter\)/);
  assert.match(source, /textureFilter: this\.gl\?\.LINEAR/);
  assert.match(source, /textureFilter: gl\.LINEAR/);
});

test("resize tool transforms vector text as metadata instead of raster pixels", () => {
  const source = readRepoFile("js", "raster-transform-tool.js");

  assert.match(source, /function isVectorTextLayer\(layer\)/);
  assert.match(source, /layer\.type === "vector-text" \|\| layer\.type === "text" \|\| layer\.kind === "text"/);
  assert.match(source, /getVectorTextContentBounds\(layer\)/);
  assert.match(source, /getVectorTextPreviewLayer\(layer, quad = this\.currentQuad\)/);
  assert.match(source, /setVectorTextPreviewLayer\(previewLayer\)/);
  assert.match(source, /commitVectorTextTransform\(layer\)/);
  assert.match(source, /source: "vector-text-transform"/);
  assert.match(source, /this\.isVectorTextLayer\(activeLayer\)[\s\S]*return this\.commitVectorTextTransform\(activeLayer\)/);
  assert.match(source, /this\.getEffectiveTransformMode\(\) === "free" \? "scale" : "distort"/);
});

test("vector text resize hides the stale raster cache while SVG preview is active", () => {
  const transformSource = readRepoFile("js", "raster-transform-tool.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");
  const textSource = readRepoFile("js", "text", "vector-text-renderer.js");
  const previewBody = transformSource.match(/setVectorTextPreviewLayer\(layer\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(transformSource, /this\.documentRenderer\?\.setVectorTextTransformPreviewLayer\?\.\(layer\.id\)/);
  assert.match(transformSource, /this\.documentRenderer\?\.clearVectorTextTransformPreviewLayer\?\.\(this\.startVectorTextLayer\.id\)/);
  assert.doesNotMatch(previewBody, /beginInteraction/);
  assert.match(rendererSource, /vectorTextTransformPreviewLayerId/);
  assert.match(rendererSource, /setVectorTextTransformPreviewLayer\(layerId = ""\)/);
  assert.match(rendererSource, /clearVectorTextTransformPreviewLayer\(layerId = ""\)/);
  assert.match(rendererSource, /!vectorTextTransformPreviewLayerId/);
  assert.match(rendererSource, /const isVectorTextTransformPreviewLayer = vectorTextTransformPreviewLayerId === layer\.id/);
  assert.match(rendererSource, /if \(isVectorTextTransformPreviewLayer\) \{[\s\S]*?continue;/);
  assert.match(textSource, /renderer\.isVectorTextTransformPreviewLayer\?\.?\(layer\.id\)/);
  assert.match(textSource, /renderer\.clearVectorTextTransformPreviewLayer\?\.?\(layer\.id\)/);
});

test("raster transform preview coalesces pointermove updates with requestAnimationFrame", () => {
  const source = readRepoFile("js", "raster-transform-tool.js");
  const moveBody = source.match(/handlePointerMove\(event\) \{([\s\S]*?)\n    handlePointerUp\(event\)/)?.[1] || "";

  assert.match(source, /dragFrameRequest/);
  assert.match(source, /pendingDragEvent/);
  assert.match(source, /createDragEventSnapshot\(event\) \{/);
  assert.match(source, /scheduleDragUpdate\(event\) \{/);
  assert.match(source, /flushPendingDragUpdate\(\) \{/);
  assert.match(source, /cancelPendingDragUpdate\(\) \{/);
  assert.match(moveBody, /this\.scheduleDragUpdate\(event\);/);
  assert.doesNotMatch(moveBody, /this\.updateDrag\(event\);/);
  assert.match(source, /this\.pendingDragEvent = this\.createDragEventSnapshot\(event\);[\s\S]*this\.flushPendingDragUpdate\(\);/);
});

test("document renderer uses analytic anti-aliased quad edge coverage for raster transforms", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");

  assert.match(source, /const RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS = 1/);
  assert.match(source, /TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /signedDistanceToConvexQuad/);
  assert.match(source, /quadCoverage/);
  assert.match(source, /u_quadEdges\[4\]/);
  assert.match(source, /u_edgeFeatherPixels/);
  assert.match(source, /u_edgeFeatherPixels <= 0\.0/);
  assert.match(source, /fwidth\s*\(/);
  assert.match(source, /smoothstep\s*\(/);
  assert.match(source, /getRasterTransformEdgeFeatherPixels\(options = \{\}\)/);
  assert.match(source, /options\.preserveHardEdges === true/);
  assert.match(source, /const PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE = TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE/);
});

test("drawTexturedQuad draws an expanded maskable rectangle instead of hard quad triangles", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");
  const drawBody = source.match(/drawTexturedQuad\(texture, quad, options = \{\}\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(drawBody, /ensureTexturedQuadProgramInfo\(\)/);
  assert.match(drawBody, /createExpandedQuadDrawVertices\(/);
  assert.match(drawBody, /computeQuadEdgeUniformData\(quad\)/);
  assert.match(drawBody, /computeAffineDestToSourceUvMatrix\(quad\)/);
  assert.match(drawBody, /const edgeFeatherPixels = this\.getRasterTransformEdgeFeatherPixels\(options\)/);
  assert.match(drawBody, /uniform4fv\(uniforms\.quadEdges, edgeData\)/);
  assert.match(drawBody, /uniformMatrix3fv\(uniforms\.destToSourceUv, false, matrix\)/);
  assert.match(drawBody, /uniform1f\(uniforms\.edgeFeatherPixels, edgeFeatherPixels\)/);
  assert.doesNotMatch(drawBody, /ensurePuppetProgramInfo\(\)/);
});

test("drawPerspectiveTexturedQuad uses soft geometric coverage and clamps edge UVs", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");
  const drawBody = source.match(/drawPerspectiveTexturedQuad\(texture, quad, options = \{\}\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(drawBody, /createExpandedQuadDrawVertices\(/);
  assert.match(drawBody, /computeQuadEdgeUniformData\(quad\)/);
  assert.match(drawBody, /uniform4fv\(uniforms\.quadEdges, edgeData\)/);
  assert.match(source, /clamp\(unitUv, vec2\(0\.0\), vec2\(1\.0\)\)/);
  assert.doesNotMatch(source, /unitUv\.x < 0\.0 \|\| unitUv\.x > 1\.0 \|\| unitUv\.y < 0\.0 \|\| unitUv\.y > 1\.0/);
});

test("raster transform commits pad dirty rectangles for edge anti-aliasing", () => {
  const source = readRepoFile("js", "document", "document-renderer.js");

  assert.match(source, /RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING/);
  assert.match(source, /padRasterRect\(rect, padding = 0\)/);
  assert.match(source, /const destDirtyRect = this\.padRasterRect\(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING\)/);
  assert.match(source, /bounds\.getUnionRect\(sourceRect, destDirtyRect \|\| destRect\)/);
  assert.match(source, /getClampedDocumentRect\(\s*destDirtyRect \|\| destRect,\s*CROPPED_TARGET_EDGE_PADDING,/);
});

test("raster transform tool uses SVG overlay, resize/rotate activation, and history-safe commit", () => {
  const source = readRepoFile("js", "raster-transform-tool.js");
  const cssSource = readRepoFile("css", "layout.css");
  const transformBoxCss = cssSource.match(/\.editor-raster-transform-box \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(source, /document\.createElementNS\(SVG_NS/);
  assert.match(source, /class: "editor-raster-transform-overlay"/);
  assert.match(source, /class: "editor-raster-transform-guide-layer"/);
  assert.match(source, /editor-raster-transform-guide-\$\{guideName\}/);
  assert.match(source, /const SELECTION_TOOL_MODE = "selection";/);
  assert.match(source, /isResizeToolDetail\(detail = \{\}\)/);
  assert.match(source, /const ROTATE_TOOL_MODE = "rotate";/);
  assert.match(source, /function isSelectionToolDetail\(detail = \{\}\)/);
  assert.match(source, /isSelectionActive\(\) \{/);
  assert.match(source, /isOverlayActive\(\) \{/);
  assert.match(source, /this\.syncActiveToolFromToolbar\(\);/);
  assert.match(source, /syncActiveToolFromToolbar\(\) \{/);
  assert.match(source, /window\.addEventListener\("cbo:text-transform-edit-request", this\.handleTextTransformEditRequest\);/);
  assert.match(source, /handleTextTransformEditRequest\(event\) \{[\s\S]*this\.activeTool = "text-transform";[\s\S]*this\.deactivateLayer\(\);/);
  assert.match(source, /const PIXEL_TIGHT_RASTER_BOUNDS_OPTIONS = Object\.freeze\(\{/);
  assert.match(source, /padding: 0,/);
  assert.match(source, /pixelPerfect: true,/);
  assert.match(source, /const TOUCH_SELECTION_HIT_RADIUS_PX = 8;/);
  assert.match(source, /const SELECTION_MOVE_HOLD_MS = 120;/);
  assert.match(source, /selectionMoveHoldState/);
  assert.match(source, /window\.setTimeout\(\(\) => \{\s*this\.beginSelectionMoveDrag\(\);\s*\}, SELECTION_MOVE_HOLD_MS\)/);
  assert.match(source, /getSelectionHitRadius\(pointerType = ""\)/);
  assert.match(source, /function isRotateToolDetail\(detail = \{\}\)/);
  assert.match(source, /function getTransformToolMode\(detail = \{\}\)/);
  assert.match(source, /getPixelTightRasterContentBounds\(layerId\)/);
  assert.match(source, /this\.documentRenderer\?\.getRasterContentBounds\?\.\(layerId, PIXEL_TIGHT_RASTER_BOUNDS_OPTIONS\)/);
  assert.match(source, /const bounds = this\.getPixelTightRasterContentBounds\(layer\.id\)/);
  assert.match(source, /this\.documentRenderer\?\.width/);
  assert.match(source, /this\.documentRenderer\?\.height/);
  assert.match(source, /this\.documentRenderer\?\.setRasterTransformPreview\?\.\(/);
  assert.doesNotMatch(source, /function runAfterNextPaint\(callback\)/);
  assert.match(source, /const sourceSnapshot = this\.sourceSnapshot;/);
  assert.match(source, /this\.documentRenderer\?\.commitRasterTransform\?\.\(/);
  assert.doesNotMatch(source, /this\.documentRenderer\?\.clearRasterTransformPreview\?\.\(layerId\);/);
  assert.match(source, /const isVisible = !isCommitting && this\.isOverlayActive\(\) && Array\.isArray\(this\.currentQuad\);/);
  assert.match(source, /pickLayerAtClient\(clientX, clientY, options = \{\}\)/);
  assert.match(source, /if \(this\.isActive\(\) \|\| this\.hasPendingTransform\(\)\) \{\s*this\.commitTransform\(\);/);
  assert.match(source, /this\.activeTool = SELECTION_TOOL_MODE;[\s\S]*this\.activateLayer\(this\.getActiveLayer\(\), \{ selection: true \}\);/);
  assert.match(source, /this\.transformAspectLocked = namespace\.transformAspectLocked === true;/);
  assert.match(source, /this\.transformAspectLocked = detail\.transformAspectLocked === true;/);
  assert.match(source, /this\.isSelectionActive\(\) && !isSelectionToolDetail\(detail\) && this\.hasPendingTransform\(\)/);
  assert.match(source, /if \(this\.isSelectionActive\(\)\) \{\s*this\.commitTransform\(\);\s*this\.layerModel\?\.setActiveLayer\?\.\(null, \{ source: "selection-tool-escape" \}\);/);
  assert.match(source, /this\.activateLayer\(null, \{ selection: true \}\);[\s\S]*\} else \{\s*this\.cancelTransform\(\);/);
  assert.match(source, /this\.layerModel\?\.setActiveLayer\?\.\(hitLayer\.id, \{ source: "selection-tool" \}\);/);
  assert.match(source, /this\.layerModel\?\.setActiveLayer\?\.\(null, \{ source: "selection-tool" \}\);/);
  assert.match(source, /this\.activateLayer\(null, \{ selection: true \}\);/);
  assert.match(source, /pointerType: event\.pointerType,[\s\S]*selection: true,/);
  assert.match(source, /if \(this\.hasPendingTransform\(\) && !pendingMoveLayer\) \{\s*this\.commitTransform\(\);[\s\S]*hitLayer = this\.pickLayerAtClient\(event\.clientX, event\.clientY, \{/);
  assert.match(source, /beginSelectionMoveHold\(event, hitLayer\)/);
  assert.match(source, /selectionMove: true/);
  assert.match(source, /handlePointerUp\(event\) \{/);
  assert.match(source, /this\.updatePreview\(\);[\s\S]*this\.render\(\);/);
  assert.match(source, /if \(this\.isActive\(\)\) \{\s*this\.commitTransform\(\);/);
  assert.match(source, /if \(!handle && !box\) \{\s*if \(this\.hasPendingTransform\(\)\) \{\s*return;/);
  assert.match(source, /const box = this\.getBoxTarget\(event\.target\) \|\| \([\s\S]*this\.isPointInCurrentQuad\(point\)[\s\S]*\? this\.box/);
  assert.match(source, /setSvgElementVisible\(element, isVisible\)/);
  assert.match(source, /this\.svg\.classList\.toggle\("raster-selection-tool-active", this\.isSelectionActive\(\)\);/);
  assert.match(source, /setSvgElementVisible\(handle, isVisible && this\.isActive\(\) && !this\.isWarpMode\(\)\);/);
  assert.match(source, /if \(this\.isActive\(\) && !this\.isWarpMode\(\)\) \{\s*const handlePoints = this\.getHandlePoints\(points\);[\s\S]*setSvgElementVisible\(handle, true\);/);
  assert.match(source, /HANDLE_TO_CORNERS/);
  assert.match(source, /normalizeTransformMode\(mode\)/);
  assert.match(source, /getEffectiveTransformMode\(\)/);
  assert.match(source, /transformMode: effectiveTransformMode/);
  assert.match(source, /getQuadCenter\(quad = \[\]\)/);
  assert.match(source, /const ROTATION_FREE_SNAP_THRESHOLD_RADIANS = Math\.PI \/ 90;/);
  assert.match(source, /function cleanTrigValue\(value\)/);
  assert.match(source, /function getSnappedRotationAngle\(angle, options = \{\}\)/);
  assert.match(source, /function formatRotationDegrees\(radians\)/);
  assert.match(source, /rotatePointAroundCenter\(point, center, angle\)/);
  assert.match(source, /getRotatedQuad\(point, event\)/);
  assert.match(source, /handleRotationInput\(event\)/);
  assert.match(source, /cbo:raster-transform-rotation-input/);
  assert.match(source, /setRotationDegrees\(degrees\)/);
  assert.match(source, /this\.dragState\.mode === "rotate"/);
  assert.match(source, /getSnappedRotationAngle\(rawDelta, \{ force: event\.shiftKey \}\)/);
  assert.match(source, /rotationDegrees: formatRotationDegrees\(this\.currentRotationRadians\)/);
  assert.match(source, /toolMode: this\.activeTool/);
  assert.match(source, /hasPendingTransform\(\)/);
  assert.match(source, /handleRasterTransformAction\(event\)/);
  assert.match(source, /window\.addEventListener\("cbo:before-history-action", this\.handleBeforeHistoryAction\)/);
  assert.match(source, /handleBeforeHistoryAction\(event\)/);
  assert.match(source, /this\.hasPendingTransform\(\)\) \{\s*this\.commitTransform\(\);/);
  assert.match(source, /const GUIDE_PROXIMITY_PX = 3;/);
  assert.match(source, /shouldShowGuides\(\)/);
  assert.match(source, /this\.dragState\.mode === "move" \|\| this\.dragState\.mode === "scale"/);
  assert.match(source, /getSnappedMoveDelta\(dx, dy\)/);
  assert.match(source, /const snappedDelta = this\.getSnappedMoveDelta\(dx, dy\)/);
  assert.match(source, /item\.x \+ snappedDelta\.dx/);
  assert.match(source, /getSnappedScaledRect\(rect, dir, event\)/);
  assert.match(source, /return rectToQuad\(this\.getSnappedScaledRect\(\{ x, y, width, height \}, dir, event\)\)/);
  assert.match(source, /isScaleAspectLocked\(event = \{\}\)/);
  assert.match(source, /getScaleSnapCandidates\(rect, dir\)/);
  assert.match(source, /findClosestSnapCandidate\(objectPosition, guidePositions/);
  assert.match(source, /getEdgeSnappedScaledRect\(rect, dir, candidates\)/);
  assert.match(source, /getCenteredSnappedScaledRect\(rect, candidates\)/);
  assert.match(source, /getAspectSnappedScaledRect\(rect, dir, event, candidate\)/);
  assert.match(source, /if \(this\.isScaleAspectLocked\(event\)\) \{\s*return this\.getAspectSnappedScaledRect\(rect, dir, event, candidates\[0\]\);/);
  assert.match(source, /if \(event\.altKey\) \{\s*return this\.getCenteredSnappedScaledRect\(rect, candidates\);/);
  assert.doesNotMatch(source, /if \(event\.shiftKey \|\| event\.altKey\) \{\s*return rect;/);
  assert.match(source, /findClosestSnapOffset\(objectPositions, guidePositions/);
  assert.match(source, /getSnapOffsetForRect\(rect\)/);
  assert.match(source, /getActiveGuideNames\(rect, documentWidth, documentHeight\)/);
  assert.match(source, /getGuideSnapThreshold\(\)/);
  assert.match(source, /GUIDE_PROXIMITY_PX \* this\.dpr \/ this\.camera\.zoom/);
  assert.match(source, /renderGuides\(isVisible\)/);
  assert.match(source, /this\.setGuideLine\("left", left, 0, left, this\.viewportHeight\)/);
  assert.match(source, /this\.setGuideLine\("top", 0, top, this\.viewportWidth, top\)/);
  assert.match(source, /cbo:raster-transform-state-change/);
  assert.match(source, /const AXIS_ALIGNED_QUAD_EPSILON = 0\.001;/);
  assert.match(source, /function isAxisAlignedQuad\(quad = \[\]\)/);
  assert.match(source, /edgeFeatherPixels: this\.getEdgeFeatherPixelsForQuad\(this\.currentQuad\)/);
  assert.match(source, /getEdgeFeatherPixelsForQuad\(quad = this\.currentQuad\)/);
  assert.match(source, /isAxisAlignedQuad\(quad\) \? 0 : undefined/);
  assert.match(cssSource, /\.editor-raster-transform-overlay/);
  assert.match(cssSource, /\.editor-raster-transform-overlay\.raster-selection-tool-active/);
  assert.match(cssSource, /\.editor-raster-transform-guide/);
  assert.match(cssSource, /stroke: #f05022;/);
  assert.doesNotMatch(cssSource, /stroke-dasharray:\s*7 5;/);
  assert.match(cssSource, /\.editor-raster-transform-box/);
  assert.match(transformBoxCss, /fill: none;/);
  assert.doesNotMatch(transformBoxCss, /fill: rgba/);
  assert.match(cssSource, /\.editor-raster-transform-overlay\.raster-selection-tool-active \.editor-raster-transform-box \{[\s\S]*?pointer-events:\s*none;/);
  assert.match(cssSource, /\.editor-raster-transform-handle/);
});
