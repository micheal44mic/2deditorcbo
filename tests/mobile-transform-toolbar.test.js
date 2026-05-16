const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("mobile replaces pen tools with a resize launcher that does not activate resize", () => {
  const indexSource = readRepoFile("index.html");
  const toolbarSource = readRepoFile("js", "toolbar.js");
  const toolbarCss = readRepoFile("css", "toolbar.css");
  const launcherStart = indexSource.indexOf("data-mobile-transform-toggle");
  const launcherButtonStart = indexSource.lastIndexOf("<button", launcherStart);
  const launcherButtonEnd = indexSource.indexOf("</button>", launcherStart);
  const launcherMarkup = indexSource.slice(launcherButtonStart, launcherButtonEnd);

  assert.ok(launcherStart > 0);
  assert.match(indexSource, /class="tool-group mobile-transform-launcher-group"/);
  assert.match(indexSource, /class="tool-group mobile-pen-tool-group"/);
  assert.doesNotMatch(launcherMarkup, /data-tool(?:=|\\s|>)/);
  assert.doesNotMatch(launcherMarkup, /data-tool-mode/);
  assert.match(toolbarSource, /\[data-mobile-transform-toggle\]/);
  assert.match(toolbarSource, /toggleMobileTransformTools\(\)/);
  assert.match(toolbarSource, /window\.CBO\.transformAspectLocked = transformAspectLocked/);
  assert.match(toolbarSource, /transformAspectLocked,/);
  assert.match(toolbarSource, /mobile-transform-tools-open/);
  assert.doesNotMatch(toolbarSource, /button\.closest\("\[data-mobile-transform-tools\]"\)/);
  assert.match(toolbarCss, /\.toolbar-dock \.mobile-pen-tool-group \{\s*display: none;/);
  assert.match(toolbarCss, /\.toolbar-dock \.mobile-transform-launcher-group \{\s*display: inline-flex;/);
});

test("mobile transform sidebar exposes resize free resize rotate distortion perspective and puppet", () => {
  const resizeButtonSource = readRepoFile("js", "resize-button.js");
  const rasterTransformSource = readRepoFile("js", "raster-transform-tool.js");
  const verticalToolbarSource = readRepoFile("js", "vertical-toolbar.js");
  const verticalToolbarCss = readRepoFile("css", "vertical-toolbar.css");
  const topToolbarSource = readRepoFile("js", "top-toolbar.js");
  const topToolbarCss = readRepoFile("css", "top-toolbar.css");

  assert.match(verticalToolbarSource, /createMobileTransformTools/);
  assert.equal((resizeButtonSource.match(/class="tool-button mobile-transform-tool-button"/g) || []).length, 6);
  assert.match(resizeButtonSource, /aria-label="RESIZE"[\s\S]*data-transform-aspect-lock="true"[\s\S]*data-transform-select-mode="free"[\s\S]*data-tool-mode="resize"/);
  assert.match(resizeButtonSource, /aria-label="FREE RESIZE"[\s\S]*data-transform-aspect-lock="false"[\s\S]*data-transform-select-mode="free"[\s\S]*data-tool-mode="resize"/);
  assert.match(resizeButtonSource, /aria-label="ROTATE"[\s\S]*data-tool-mode="rotate"/);
  assert.match(resizeButtonSource, /aria-label="DISTORTION"[\s\S]*data-transform-select-mode="warp"[\s\S]*data-tool-mode="resize"/);
  assert.match(resizeButtonSource, /aria-label="PERSPECTIVE"[\s\S]*data-transform-select-mode="perspective"[\s\S]*data-tool-mode="resize"/);
  assert.match(resizeButtonSource, /aria-label="PUPPET"[\s\S]*data-tool-mode="puppet"/);
  assert.match(verticalToolbarCss, /\.right-vertical-toolbar-dock\.mobile-transform-tools-open \{\s*display: flex;/);
  assert.match(verticalToolbarCss, /\.right-vertical-toolbar > :not\(\.mobile-transform-tool-group\) \{\s*display: none;/);
  assert.match(topToolbarSource, /window\.addEventListener\("cbo:transform-mode-change"/);
  assert.match(topToolbarSource, /setTransformMode\(event\.detail\?\.mode, \{ emit: false \}\)/);
  assert.match(topToolbarSource, /mobile-transform-actions-visible/);
  assert.match(rasterTransformSource, /this\.transformAspectLocked = namespace\.transformAspectLocked === true/);
  assert.match(rasterTransformSource, /isScaleAspectLocked\(event = \{\}\)/);
  assert.match(topToolbarCss, /\.transform-mode-toolbar:not\(\.mobile-transform-actions-visible\) \{\s*display: none;/);
  assert.match(topToolbarCss, /\.transform-mode-toolbar \[data-transform-mode\],[\s\S]*\.transform-mode-toolbar \.transform-angle-control,[\s\S]*\.transform-mode-toolbar \.transform-mode-divider \{\s*display: none;/);
  assert.match(topToolbarCss, /bottom: var\(--cbo-mobile-floating-bottom\);/);
  assert.match(rasterTransformSource, /const isSameTransformTool = this\.activeTool === transformToolMode/);
  assert.match(rasterTransformSource, /if \(!wasActive \|\| !isSameTransformTool \|\| !isSameLayerActive \|\| !\(this\.sourceSnapshot \|\| this\.startVectorTextLayer\)\) \{\s*this\.activateLayer\(activeLayer\);/);
});

test("mobile layout accounts for iOS safe areas and visual viewport changes", () => {
  const indexSource = readRepoFile("index.html");
  const appSource = readRepoFile("js", "app.js");
  const baseCss = readRepoFile("css", "base.css");
  const layoutCss = readRepoFile("css", "layout.css");
  const toolbarCss = readRepoFile("css", "toolbar.css");

  assert.match(indexSource, /viewport-fit=cover/);
  assert.match(indexSource, /interactive-widget=resizes-visual/);
  assert.match(indexSource, /id="android-device-indicator"[\s\S]*>android v1\.9<\/div>/);
  assert.match(baseCss, /--cbo-safe-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(baseCss, /--cbo-visual-viewport-height: 100dvh;/);
  assert.match(baseCss, /--cbo-keyboard-inset-bottom: 0px;/);
  assert.match(baseCss, /\.android-device-indicator \{[\s\S]*top: calc\(8px \+ var\(--cbo-safe-top\)\);/);
  assert.match(baseCss, /\.android-device-indicator \{[\s\S]*pointer-events: none;/);
  assert.match(baseCss, /input:not\(\[type="range"\]\):not\(\[type="color"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*font-size: 16px;/);
  assert.match(layoutCss, /\.editor-stage \{[\s\S]*height: var\(--cbo-visual-viewport-height\);/);
  assert.match(toolbarCss, /\.toolbar-dock \{[\s\S]*bottom: var\(--cbo-mobile-dock-bottom\);/);
  assert.match(toolbarCss, /padding: 12px var\(--cbo-mobile-edge-right\) calc\(12px \+ var\(--cbo-safe-bottom\)\) var\(--cbo-mobile-edge-left\);/);
  assert.match(appSource, /function isAndroidDevice\(\)/);
  assert.match(appSource, /navigator\.userAgentData\?\.platform/);
  assert.match(appSource, /navigator\.userAgent/);
  assert.match(appSource, /androidIndicator\.hidden = !isAndroid/);
  assert.match(appSource, /cbo-device-android/);
  assert.match(appSource, /namespace\.androidPixelPerfectEnabled = false/);
  assert.match(appSource, /namespace\.pixelPerfectRenderingEnabled = false/);
  assert.match(appSource, /namespace\.androidHistoryEnabled = true/);
  assert.match(appSource, /namespace\.documentHistoryDisabled = false/);
  assert.doesNotMatch(appSource, /disableDocumentHistoryForPerformance/);
  assert.match(appSource, /window\.visualViewport/);
  assert.match(appSource, /--cbo-visual-viewport-height/);
  assert.match(appSource, /--cbo-keyboard-inset-bottom/);
  assert.match(appSource, /cbo-visual-keyboard-active/);
});
