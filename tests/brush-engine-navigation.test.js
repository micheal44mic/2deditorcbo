const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("temporary pan is captured from the editor stage before tool overlays", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.stage = canvas\.closest\("\.editor-stage"\)/);
  assert.match(source, /navigationTarget\.addEventListener\("pointerdown", this\.handleNavigationPointerDown, true\)/);
  assert.match(source, /handleNavigationPointerDown\(event\)/);
  assert.match(source, /this\.isTemporaryPanTrigger\(event\)/);
  assert.match(source, /this\.beginPan\(event, event\.currentTarget \|\| this\.stage \|\| this\.canvas\)/);
});

test("temporary pan owns the cursor and blocks other tool handlers while active", () => {
  const brushSource = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(repoRoot, "css", "base.css"), "utf8");

  assert.match(brushSource, /event\.__cboNavigationHandled = true/);
  assert.match(brushSource, /event\.stopPropagation\(\)/);
  assert.match(brushSource, /classList\.toggle\("cbo-canvas-pan-active", this\.isPanning\)/);
  assert.match(brushSource, /classList\.toggle\("cbo-canvas-pan-ready", !this\.isPanning && this\.isSpaceHeld\)/);
  assert.match(cssSource, /body\.cbo-canvas-pan-ready[\s\S]*cursor: grab !important/);
  assert.match(cssSource, /body\.cbo-canvas-pan-active[\s\S]*cursor: grabbing !important/);
  assert.match(cssSource, /body,[\s\S]*?\.layer-effects-popover[\s\S]*?user-select: none;/);
  assert.match(cssSource, /input,[\s\S]*?\[contenteditable="true"\] \*[\s\S]*?user-select: text;/);
});

test("preview cache is enabled without waiting for explicit camera navigation", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.userManipulatedCamera = false/);
  assert.match(source, /this\.userManipulatedCamera = true;\s*this\.requestDraw\(\);/);
  assert.doesNotMatch(source, /const allowPreviewCache = this\.userManipulatedCamera && !namespace\.smudgeEngine\?\.isDragging/);
  assert.match(source, /const allowPreviewCache = !namespace\.smudgeEngine\?\.isDragging/);
  assert.match(source, /const deferPreviewCacheUpdate = this\.isDrawing \|\| this\.isPanning \|\| this\.touchNavigationGesture \|\| namespace\.smudgeEngine\?\.isDragging/);
  assert.match(source, /this\.documentRenderer\.shouldUsePreviewCacheForCamera\(this\.camera, previewCacheDimensions\)/);
  assert.match(source, /allowPreviewCache,/);
  assert.match(source, /deferPreviewCacheUpdate,/);
});

test("two-finger touch navigation pinches and pans without continuing the brush stroke", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.activeTouchPointers = new Map\(\)/);
  assert.match(source, /this\.touchNavigationGesture = null/);
  assert.match(source, /this\.touchNavigationExclusive = false/);
  assert.match(source, /this\.touchNavigationLastActivityAt = 0/);
  assert.match(source, /const TOUCH_NAVIGATION_STALE_POINTER_MS = 900/);
  assert.match(source, /getTouchNavigationGeometry\(pointers = this\.getTouchNavigationPointers\(\)\)/);
  assert.match(source, /rememberTouchNavigationPointer\(event\)/);
  assert.match(source, /pruneStaleTouchNavigationPointers\(now = this\.getNow\(\)\)/);
  assert.match(source, /resetTouchNavigationState\(source = "touch-navigation-reset"\)/);
  assert.match(source, /getCanvasViewportPoint\(clientX, clientY\)/);
  assert.match(source, /safeClientX - rect\.left/);
  assert.match(source, /const centerViewport = this\.getCanvasViewportPoint\(centerClientX, centerClientY\)/);
  assert.match(source, /beginTouchNavigationGesture\(\)/);
  assert.match(source, /updateTouchNavigationGesture\(\)/);
  assert.match(source, /cancelActiveStrokeForTouchNavigation\(\)/);
  assert.match(source, /shouldStartTouchCanvasPan\(event, point\)/);
  assert.match(source, /!this\.isDocumentPointOnAnyArtboard\(point\)/);
  assert.match(source, /touch-empty-canvas-pan-start/);
  assert.match(source, /this\.isPanning && this\.activePanPointerId === event\.pointerId/);
  assert.match(source, /this\.clearStrokeLayer\(\)/);
  assert.match(source, /namespace\.setTouchNavigationExclusive\?\.\(true/);
  assert.match(source, /namespace\.setTouchNavigationExclusive\?\.\(false/);
  assert.match(source, /this\.touchNavigationExclusive && this\.activeTouchPointers\.size === 0/);
  assert.match(source, /this\.activeTouchPointers\.set\(event\.pointerId/);
  assert.match(source, /this\.activeTouchPointers\.size >= 2 && this\.beginTouchNavigationGesture\(\)/);
  assert.match(source, /else if \(this\.touchNavigationExclusive\)/);
  assert.match(source, /this\.markNavigationEvent\(event\)/);
  assert.match(source, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(source, /this\.touchNavigationGesture\.lastDistance/);
  assert.match(source, /const rawFactor = geometry\.distance \/ previousDistance/);
  assert.match(source, /touch-navigation-invalid-factor/);
  assert.match(source, /ANDROID_PINCH_ZOOM_STEP_MIN/);
  assert.match(source, /ANDROID_PINCH_ZOOM_STEP_MAX/);
  assert.match(source, /this\.camera\.zoom = newZoom/);
  assert.match(source, /this\.forgetTouchNavigationPointer\(event\.pointerId\)/);
  assert.match(source, /this\.activeTouchPointers\.clear\(\)/);
  assert.match(source, /handleWindowTouchNavigationPointerRelease\(event\)/);
  assert.match(source, /handleWindowTouchNavigationEnd\(event\)/);
  assert.match(source, /touch-navigation-touchend-reset/);
  assert.match(source, /window\.addEventListener\("touchend", this\.handleWindowTouchNavigationEnd, \{ passive: true \}\)/);
  assert.match(source, /this\.isDrawing \|\| this\.isPanning \|\| this\.touchNavigationGesture \|\| namespace\.smudgeEngine\?\.isDragging/);
});

test("touch navigation exposes an exclusive mobile gesture guard", () => {
  const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

  assert.match(appSource, /TOUCH_NAVIGATION_GHOST_TAP_GUARD_MS = 420/);
  assert.match(appSource, /function isTouchNavigationGuardActive\(\)/);
  assert.match(appSource, /function isTouchNavigationInteractiveTarget\(target\)/);
  assert.match(appSource, /isTouchNavigationInteractiveTarget\(event\.target\)/);
  assert.match(appSource, /namespace\.isTouchNavigationExclusive = isTouchNavigationExclusive/);
  assert.match(appSource, /namespace\.isTouchNavigationGuardActive = isTouchNavigationGuardActive/);
  assert.match(appSource, /namespace\.setTouchNavigationExclusive = setTouchNavigationExclusive/);
  assert.match(appSource, /"cbo:touch-navigation-start"/);
  assert.match(appSource, /"cbo:touch-navigation-end"/);
  assert.match(appSource, /document\.body\?\.classList\.toggle\("cbo-touch-navigation-active", nextActive\)/);
  assert.match(appSource, /event\.pointerType === "touch"[\s\S]*!isStageEvent\(event\)/);
  assert.match(appSource, /event\.stopImmediatePropagation\(\)/);
});

test("mobile pinch navigation cancels active touch tool interactions", () => {
  const areaSource = fs.readFileSync(path.join(repoRoot, "js", "area-selection-tool.js"), "utf8");
  const rasterSource = fs.readFileSync(path.join(repoRoot, "js", "raster-transform-tool.js"), "utf8");
  const puppetSource = fs.readFileSync(path.join(repoRoot, "js", "puppet-transform-tool.js"), "utf8");
  const smudgeSource = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");
  const textSource = fs.readFileSync(path.join(repoRoot, "js", "text", "vector-text-renderer.js"), "utf8");

  assert.match(areaSource, /window\.addEventListener\("cbo:touch-navigation-start", cancelActiveAreaSelectionForTouchNavigation\)/);
  assert.match(areaSource, /namespace\.isTouchNavigationExclusive\?\.\(\) \|\| !isAreaSelectionToolActive\(\)/);
  assert.match(rasterSource, /window\.addEventListener\("cbo:touch-navigation-start", this\.handleTouchNavigationStart\)/);
  assert.match(rasterSource, /namespace\.isTouchNavigationExclusive\?\.\(\) \|\| !this\.isOverlayActive\(\)/);
  assert.match(puppetSource, /window\.addEventListener\("cbo:touch-navigation-start", this\.handleTouchNavigationStart\)/);
  assert.match(puppetSource, /namespace\.isTouchNavigationExclusive\?\.\(\) \|\| !this\.isActive\(\)/);
  assert.match(smudgeSource, /window\.addEventListener\("cbo:touch-navigation-start", this\.handleTouchNavigationStart\)/);
  assert.match(smudgeSource, /namespace\.isTouchNavigationExclusive\?\.\(\) \|\|[\s\S]*this\.shouldIgnorePointer\(event\)/);
  assert.match(textSource, /window\.addEventListener\("cbo:touch-navigation-start", this\.handleTouchNavigationStart\)/);
  assert.match(textSource, /namespace\.isTouchNavigationExclusive\?\.\(\)/);
});

test("brush pointer moves are coalesced into the render frame", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const moveBody = source.match(/handlePointerMove\(event\) \{([\s\S]*?)\n    handlePointerUp\(event\)/)?.[1] || "";

  assert.match(source, /pendingPointerSamples = \[\]/);
  assert.match(source, /getCoalescedEvents/);
  assert.match(source, /enqueuePointerMoveSamples\(event\)/);
  assert.match(source, /takePointerSamplesForFrame\(options = \{\}\)/);
  assert.match(source, /processPendingPointerSamples\(options = \{\}\)/);
  assert.match(source, /const MOBILE_POINTER_SAMPLES_PER_FRAME = 48/);
  assert.match(source, /const MOBILE_POINTER_FRAME_BUDGET_MS = 4/);
  assert.match(source, /const POINTER_SAMPLE_BACKLOG_MULTIPLIER = 2/);
  assert.match(source, /getPointerFrameBudgetMs\(\)/);
  assert.match(source, /this\.processStamps\(\{ deferFlush: true \}\)/);
  assert.match(source, /this\.flushStamps\(\{ requestDraw: options\.requestDraw !== false \}\)/);
  assert.match(source, /this\.pendingPointerSamples\.unshift\(\.\.\.samples\.slice\(index \+ 1\)\)/);
  assert.match(source, /this\.pendingPointerSamples\.length > 0[\s\S]*this\.requestDraw\(\)/);
  assert.match(source, /drainAll: true/);
  assert.match(source, /const MOBILE_STROKE_SEGMENT_MIN_SAMPLES = 4/);
  assert.match(source, /getStrokeSegmentSampleCount\(segmentDistance\)/);
  assert.doesNotMatch(moveBody, /this\.processStamps\(\)/);
  assert.doesNotMatch(moveBody, /this\.flushStamps\(\)/);
});

test("camera change events are skipped when the viewport payload is unchanged", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.lastCameraChangeDetail = null/);
  assert.match(source, /createCameraChangeDetail\(\) \{/);
  assert.match(source, /hasCameraChangeDetailChanged\(detail\) \{/);
  assert.match(source, /previous\.camera\?\.x !== detail\.camera\.x/);
  assert.match(source, /previous\.camera\?\.y !== detail\.camera\.y/);
  assert.match(source, /previous\.camera\?\.zoom !== detail\.camera\.zoom/);
  assert.match(source, /previous\.dpr !== detail\.dpr/);
  assert.match(source, /previous\.viewportHeight !== detail\.viewportHeight/);
  assert.match(source, /previous\.viewportWidth !== detail\.viewportWidth/);
  assert.match(source, /if \(!this\.hasCameraChangeDetailChanged\(detail\)\) \{[\s\S]*return false/);
  assert.match(source, /this\.lastCameraChangeDetail = \{[\s\S]*camera: \{ \.\.\.detail\.camera \}/);
  assert.match(source, /this\.dispatchCameraChangeIfNeeded\(\)/);
});

test("spacebar navigation cancels native browser button and toolbar behavior", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /window\.addEventListener\("keydown", this\.handleKeyDown, true\)/);
  assert.match(source, /window\.addEventListener\("keyup", this\.handleKeyUp, true\)/);
  assert.match(source, /window\.removeEventListener\("keydown", this\.handleKeyDown, true\)/);
  assert.match(source, /window\.removeEventListener\("keyup", this\.handleKeyUp, true\)/);
  assert.match(source, /markSpacebarEvent\(event\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /if \(event\.code !== "Space" \|\| this\.isInputFocused\(\)\)/);
  assert.match(source, /if \(event\.code !== "Space" \|\| \(!this\.isSpaceHeld && this\.isInputFocused\(\)\)\)/);
});
