const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("high quality view toggle is exposed on desktop and mobile toolbars", () => {
  const indexSource = readRepoFile("index.html");
  const toolbarCss = readRepoFile("css", "toolbar.css");
  const topToolbarSource = readRepoFile("js", "top-toolbar.js");

  const mobileLayersIndex = indexSource.indexOf("mobile-layers-button");
  const mobileHighQualityIndex = indexSource.indexOf("mobile-high-quality-view-button");
  const mobileRasterizeIndex = indexSource.indexOf("mobile-rasterize-text-button");
  const desktopLayersIndex = topToolbarSource.indexOf("top-layers-button");
  const desktopHighQualityIndex = topToolbarSource.indexOf("high-quality-view-button");
  const desktopRasterizeIndex = topToolbarSource.indexOf("top-rasterize-text-button");

  assert.match(indexSource, /mobile-high-quality-view-button[\s\S]*data-high-quality-view-toggle/);
  assert.match(indexSource, /css\/toolbar\.css\?v=high-quality-view-v1/);
  assert.match(indexSource, /js\/document\/document-renderer-shaders\.js\?v=high-quality-pyramid-v1/);
  assert.match(indexSource, /js\/document\/document-renderer-webgl-programs\.js\?v=high-quality-pyramid-v1/);
  assert.match(indexSource, /js\/document\/document-renderer-viewport-culling\.js\?v=paint-stale-mip-preview-v1/);
  assert.match(indexSource, /js\/document\/document-renderer\.js\?v=high-quality-pyramid-v1/);
  assert.ok(mobileLayersIndex >= 0);
  assert.ok(mobileHighQualityIndex > mobileLayersIndex);
  assert.ok(mobileRasterizeIndex > mobileHighQualityIndex);
  assert.match(toolbarCss, /\.mobile-high-quality-view-button/);
  assert.match(toolbarCss, /\.history-toolbar \.mobile-high-quality-view-button/);

  assert.match(topToolbarSource, /class="tool-button high-quality-view-button"[\s\S]*data-high-quality-view-toggle/);
  assert.ok(desktopLayersIndex >= 0);
  assert.ok(desktopHighQualityIndex > desktopLayersIndex);
  assert.ok(desktopRasterizeIndex > desktopHighQualityIndex);
  assert.match(topToolbarSource, /HIGH_QUALITY_VIEW_STORAGE_KEY = "cbo\.highQualityViewEnabled"/);
  assert.match(topToolbarSource, /window\.CBO\.setHighQualityViewEnabled = setHighQualityViewEnabled/);
  assert.match(topToolbarSource, /deletePreviewCache\?\.\(\)/);
  assert.match(topToolbarSource, /invalidatePreviewCache\?\.\("high-quality-view-toggle"/);
  assert.match(topToolbarSource, /new CustomEvent\("cbo:high-quality-view-change"/);
});
