const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("right sidebar exposes a manual save button next to share", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "css", "right-sidebar.css"), "utf8");

  assert.match(source, /right-sidebar-primary-actions/);
  assert.match(source, /data-manual-save/);
  assert.match(source, /data-manual-save[\s\S]*<svg\b/);
  assert.match(source, /documentSaveSystem/);
  assert.match(source, /saveSystem\.saveNow\(\{ source: "manual-save" \}\)/);
  assert.match(source, /saveButton\?\.addEventListener\("click"/);
  assert.match(css, /\.right-sidebar-save-button/);
  assert.match(css, /\.right-sidebar-primary-actions/);
});

test("right sidebar shows layer controls for the selection tool", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "css", "right-sidebar.css"), "utf8");

  assert.match(source, /data-layer-sidebar/);
  assert.match(source, /data-layer-align-placeholder/);
  assert.match(source, /data-layer-align-axis="x" data-layer-align-position="start"/);
  assert.match(source, /data-layer-align-axis="x" data-layer-align-position="center"/);
  assert.match(source, /data-layer-align-axis="x" data-layer-align-position="end"/);
  assert.match(source, /data-layer-align-axis="y" data-layer-align-position="start"/);
  assert.match(source, /data-layer-align-axis="y" data-layer-align-position="center"/);
  assert.match(source, /data-layer-align-axis="y" data-layer-align-position="end"/);
  assert.match(source, /const layerAlignButtons = panel\.querySelectorAll\("\[data-layer-align-axis\]\[data-layer-align-position\]"\)/);
  assert.match(source, /function alignActiveLayerToDocument\(axisValue, positionValue\)/);
  assert.match(source, /function alignRasterLayerToDocument\(layer, axis, position\)/);
  assert.match(source, /function alignVectorTextLayerToDocument\(layer, axis, position\)/);
  assert.match(source, /renderer\.getRasterContentBounds\(layer\.id\)/);
  assert.match(source, /renderer\.commitRasterTransform\(\{/);
  assert.match(source, /engine\.loadOpenTypeFont\(fontUrl\)/);
  assert.match(source, /source: "layer-sidebar-align"/);
  assert.match(source, /layerAlignButtons\.forEach\(\(button\) => \{/);
  assert.match(source, /data-layer-opacity/);
  assert.match(source, /data-layer-blend-outline/);
  assert.match(source, /function shouldShowLayerSettings\(activeTool = currentToolName\)/);
  assert.match(source, /const activeLayer = getActiveLayer\(\);/);
  assert.match(source, /activeTool === "selection" && !isVectorTextLayer\(activeLayer\) && isLayerSidebarEligible\(activeLayer\)/);
  assert.match(source, /function shouldShowTextSettings\(activeTool = currentToolName\)/);
  assert.match(source, /activeTool === "text" \|\| activeTool === "type" \|\| Boolean\(getActiveTextLayer\(\)\)/);
  assert.match(source, /function ensureActiveTextLayerForTransform\(source = "text-transform-select"\)/);
  assert.match(source, /textTransformModeButtons\.forEach\(\(button\) => \{[\s\S]*const layer = ensureActiveTextLayerForTransform\(\);[\s\S]*setTextTransformMode\("none"\);[\s\S]*return;/);
  assert.match(source, /new CustomEvent\("cbo:text-transform-edit-request", \{[\s\S]*layerId: layer\.id,/);
  assert.match(source, /data-text-transform-actions hidden/);
  assert.match(source, /data-text-transform-modify>Modify<\/button>/);
  assert.match(source, /textTransformRangeField\.hidden = isDistort/);
  assert.match(source, /if \(layer\.envelopeGrid\) \{[\s\S]*return layer;/);
  assert.match(source, /if \(mode === "distort"\) \{[\s\S]*initEnvelopeForActiveTextLayer\(\);/);
  assert.match(source, /textTransformModify\?\.addEventListener\("click"[\s\S]*editTextDistort\(layer\)/);
  assert.match(source, /textTransformModify\?\.addEventListener\("click"/);
  assert.match(source, /normalized === "rect select"/);
  assert.match(source, /normalized === "lasso select"/);
  assert.match(source, /syncRightSidebarPanels\(activeTool\)/);
  assert.match(css, /\.layer-sidebar-align-placeholder/);
  assert.match(css, /--layer-sidebar-range-progress/);
});

test("layers panel serializes layers without resetting opacity", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layers-panel.js"), "utf8");
  const serializeBody = source.match(
    /function serializeLayerEntry\(entry, inheritedArtboardId = ""\) \{([\s\S]*?)\n  function syncLayerModelFromDom/,
  )?.[1] || "";

  assert.match(source, /function normalizeLayerOpacity\(value, fallback = 1\)/);
  assert.doesNotMatch(serializeBody, /\.filter\(\(\[key\]\) => !\[[^\]]*"opacity"/);
  assert.match(serializeBody, /opacity: normalizeLayerOpacity\(existingEntry\?\.opacity\)/);
});

test("layers panel keeps artboard metadata stable after cross-artboard drag", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layers-panel.js"), "utf8");

  assert.match(source, /function serializeLayerEntry\(entry, inheritedArtboardId = ""\)/);
  assert.match(source, /const artboardGroupId = type === "group"/);
  assert.match(source, /serialized\.artboardId = resolvedArtboardId/);
  assert.match(source, /\.map\(\(childEntry\) => serializeLayerEntry\(childEntry, resolvedArtboardId\)\)/);
});

test("mobile layers button toggles the layers drawer", () => {
  const sidebarSource = fs.readFileSync(path.join(repoRoot, "js", "sidebar.js"), "utf8");
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");

  assert.match(sidebarSource, /window\.CBO\.toggleDrawerPanel = function toggleDrawerPanel/);
  assert.match(sidebarSource, /isDrawerOpen\(\) && getActiveDrawerPanel\(\) === panelName/);
  assert.match(sidebarSource, /setDrawerOpen\(false\)/);
  assert.match(topToolbarSource, /window\.CBO\.toggleDrawerPanel\("layers"\)/);
});

test("layers panel has mobile-sized touch controls and long-press context menu", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "layers-panel.js"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "css", "layers-panel.css"), "utf8");
  const layoutCss = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(source, /const layerTouchLongPressDelay = 520/);
  assert.match(source, /const layerTouchDragAutoScrollZone = 54/);
  assert.match(source, /function beginLayerLongPress\(row, event\)/);
  assert.match(source, /function isLayerTouchDragHandleTarget\(target\)/);
  assert.match(source, /function scrollLayerDrawerDuringTouchDrag\(event\)/);
  assert.match(source, /data-layer-drag-handle/);
  assert.match(source, /return event\.pointerType === "touch"/);
  assert.match(source, /const isTouchDragHandle = isTouchPointer && isLayerTouchDragHandleTarget\(target\)/);
  assert.match(source, /if \(!isTouchDragHandle\) \{\s*beginLayerLongPress\(row, event\);\s*return;\s*\}/);
  assert.match(source, /scrollLayerDrawerDuringTouchDrag\(event\)/);
  assert.match(source, /openLayerContextMenu\(state\.row, \{\s*clientX: state\.clientX,\s*clientY: state\.clientY,\s*\}\)/);
  assert.match(css, /@media \(max-width: 900px\), \(pointer: coarse\)/);
  assert.match(css, /\.layer-row \{\s*min-height: 46px;\s*height: 46px;/);
  assert.match(css, /\.layer-icon-stack \{\s*width: 40px;\s*height: 40px;\s*flex-basis: 40px;[\s\S]*touch-action: none;/);
  assert.match(css, /\.layer-icon-stack:active \{\s*background: rgba\(255, 255, 255, 0\.08\);/);
  assert.match(css, /\.layer-action \{\s*width: 38px;\s*height: 38px;/);
  assert.match(css, /\.layer-context-menu-item \{\s*height: 44px;/);
  assert.match(layoutCss, /--left-drawer-width: min\(336px, calc\(100vw - var\(--left-rail-width\) - 10px\)\)/);
});

test("layer sidebar blend menu persists blend mode metadata", () => {
  const indexSource = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const blendModesSource = fs.readFileSync(path.join(repoRoot, "js", "blend-modes.js"), "utf8");
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");
  const dragScrollSource = fs.readFileSync(path.join(repoRoot, "js", "drag-scroll.js"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "css", "right-sidebar.css"), "utf8");

  assert.match(indexSource, /<script src="\.\/js\/blend-modes\.js"><\/script>\s*<script src="\.\/js\/document\/document-bounds\.js"><\/script>/);
  assert.match(blendModesSource, /supportedModes = Object\.freeze\(\[/);
  assert.match(source, /label: "Normal"/);
  assert.match(source, /label: "Exclusion"/);
  assert.doesNotMatch(source, /label: "Linear Dodge \(Add\)"/);
  assert.doesNotMatch(source, /label: "Luminosity"/);
  assert.match(source, /blendModeApi\.supportedModes/);
  assert.match(source, /function populateLayerBlendModes\(\)/);
  assert.match(source, /document\.createElement\("button"\)/);
  assert.match(source, /option\.dataset\.layerBlendMode = mode\.key/);
  assert.match(source, /option\.type = "button"/);
  assert.match(source, /option\.addEventListener\("pointerdown"/);
  assert.match(source, /\{ blendMode: mode\.key \}/);
  assert.match(source, /source,\s*\}\)/);
  assert.match(dragScrollSource, /\.layer-sidebar-blend-outline/);
  assert.match(css, /\.layer-sidebar-blend-word-list/);
  assert.match(css, /\.layer-sidebar-blend-divider/);
  assert.match(css, /\.layer-sidebar-blend-word\.is-selected/);
});

test("closing the text transformation panel clears the active transform controls", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");

  assert.match(source, /return activeButton\?\.dataset\.textTransformMode \|\| "none"/);
  assert.match(source, /const nextMode = mode === "arch" \|\| mode === "flag" \|\| mode === "distort" \? mode : "none"/);
  assert.match(source, /setTextTransformMode\("none"\)/);
  assert.match(source, /textTransformAmountInput\.value = "0"/);
});
