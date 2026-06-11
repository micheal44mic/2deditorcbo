const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("interactive frames reuse a mipmapped proxy instead of raw live rendering", () => {
  const compositingSource = readRepoFile("js", "document", "document-renderer-compositing.js");
  const viewportCullingSource = readRepoFile("js", "document", "document-renderer-viewport-culling.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");
  const indexSource = readRepoFile("index.html");

  // Gating: il proxy interattivo entra solo quando la preview cache non e' usabile,
  // lo zoom e' sotto il 100% e c'e' un'interazione in corso.
  assert.match(compositingSource, /const useInteractiveHqProxy = Boolean\(/);
  assert.match(compositingSource, /options\.__interactiveHqPass !== true/);
  assert.match(compositingSource, /canUsePreviewCacheAtCurrentZoom &&[\s\S]*?options\.activeStrokeTexture \|\|[\s\S]*?rasterTransformPreview \|\|[\s\S]*?hasArtboardDragPreview \|\|/);
  assert.match(compositingSource, /isInteractiveHighQualityViewActive\?\.\(previewCacheOptions\) === true/);

  // Il frame interattivo viene disegnato dal proxy mipmappato come la preview cache.
  assert.match(compositingSource, /} else if \(didDrawInteractiveHqProxy\) {/);
  assert.match(compositingSource, /drawTexture\(this\.interactiveHqProxyTexture, 1, this\.getInteractiveHqProxyExactDocumentRect\(\)\)/);
  assert.match(compositingSource, /markActiveStrokeDraw\("interactive-hq-proxy"\)/);
  assert.match(compositingSource, /texture === this\.interactiveHqProxyTexture[\s\S]*?gl\.LINEAR_MIPMAP_LINEAR/);

  // Il proxy ricompone il frame col percorso live (tratto, gomma, trasformazioni)
  // e rigenera le mipmap a ogni frame interattivo.
  assert.match(viewportCullingSource, /renderInteractiveHqProxyFrame\(options = {}, dimensions = null\)/);
  assert.match(viewportCullingSource, /__interactiveHqPass: true/);
  assert.match(viewportCullingSource, /allowPreviewCache: false/);
  assert.match(viewportCullingSource, /framebuffer: this\.interactiveHqProxyFramebuffer/);
  assert.match(viewportCullingSource, /gl\.bindTexture\(gl\.TEXTURE_2D, this\.interactiveHqProxyTexture\);\s*\n\s*gl\.generateMipmap\(gl\.TEXTURE_2D\);/);
  assert.match(viewportCullingSource, /isInteractiveHighQualityViewActive\(options = {}\)/);
  assert.match(viewportCullingSource, /namespace\.interactiveHighQualityViewEnabled === false/);
  assert.match(viewportCullingSource, /deleteInteractiveHqProxyTarget\(\)/);

  // Pulizia risorse: il proxy viene liberato con la preview cache e nel dispose.
  assert.match(viewportCullingSource, /deletePreviewCache\(\) {[\s\S]*?this\.deleteInteractiveHqProxyTarget\?\.\(\);/);
  assert.match(rendererSource, /this\.interactiveHqProxyTexture = null;/);
  assert.match(rendererSource, /this\.deleteInteractiveHqProxyTarget\?\.\(\);/);

  // Cache busting dei moduli toccati.
  assert.match(indexSource, /js\/document\/document-renderer-viewport-culling\.js\?v=interactive-hq-proxy-v1/);
  assert.match(indexSource, /js\/document\/document-renderer-compositing\.js\?v=interactive-hq-proxy-v1/);
  assert.match(indexSource, /js\/document\/document-renderer\.js\?v=interactive-hq-proxy-v1/);
});
