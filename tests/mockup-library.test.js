const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("mockup drawer exposes hoodie body 1 as a 2048 artboard starter", () => {
  const dataSource = readRepoFile("data", "categories.js");
  const drawerSource = readRepoFile("js", "drawer.js");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const artboardPreviewSource = readRepoFile("js", "artboard-preview.js");
  const layoutSource = readRepoFile("css", "layout.css");
  const svgSource = readRepoFile("assets", "mockups", "hoodie-body-1.svg");
  const addonSvgSource = readRepoFile("assets", "mockups", "hoodie-detail-1.svg");
  const assetPath = path.join(repoRoot, "assets", "mockups", "hoodie-body-1.svg");
  const addonAssetPath = path.join(repoRoot, "assets", "mockups", "hoodie-detail-1.svg");

  assert.ok(fs.existsSync(assetPath));
  assert.ok(fs.existsSync(addonAssetPath));
  assert.match(svgSource, /width="2048" height="2048" viewBox="0 0 1080 1080"/);
  assert.match(addonSvgSource, /width="2048" height="2048" viewBox="0 0 1080 1080"/);
  assert.match(dataSource, /id: "hoodie-body-1"/);
  assert.match(dataSource, /name: "hoodie body 1"/);
  assert.match(dataSource, /src: "\.\/assets\/mockups\/hoodie-body-1\.svg"/);
  assert.match(dataSource, /artboardWidth: 2048/);
  assert.match(dataSource, /artboardHeight: 2048/);
  assert.match(dataSource, /placement: \{ x: 0, y: 0, width: 2048, height: 2048 \}/);
  assert.match(dataSource, /HOODIE_BODY_1_MOCKUP,[\s\S]*window\.CBO_MOCKUP_CATEGORIES/);
  assert.match(dataSource, /id: "hoodie-detail-1"/);
  assert.match(dataSource, /name: "hoodie detail 1"/);
  assert.match(dataSource, /src: "\.\/assets\/mockups\/hoodie-detail-1\.svg"/);
  assert.match(dataSource, /window\.CBO_MOCKUP_ADDON_LIBRARY = \[[\s\S]*HOODIE_DETAIL_1_MOCKUP/);

  assert.match(drawerSource, /document\.createElement\(mockupItem \? "button" : "span"\)/);
  assert.match(drawerSource, /item\.dataset\.mockupId = categoryItem\.id/);
  assert.match(drawerSource, /placement: mockupItem\.placement \|\| null/);
  assert.match(drawerSource, /window\.CBO\.closeDrawerPanel\?\.\(\)/);
  assert.match(drawerSource, /window\.CBO\.openMockupAsset\(detail\)/);
  assert.match(drawerSource, /new CustomEvent\("cbo:open-mockup-asset", \{ detail \}\)/);

  assert.match(editorCanvasSource, /const DEFAULT_MOCKUP_ARTBOARD_SIZE = 2048/);
  assert.match(editorCanvasSource, /function focusMockupArtboardView\(artboardId, options = \{\}\)/);
  assert.match(editorCanvasSource, /window\.CBO\.focusPreviewArtboardView\(normalizedArtboardId, \{/);
  assert.doesNotMatch(editorCanvasSource, /function finalizeImportedImageLayerAsEditablePaint/);
  assert.match(editorCanvasSource, /window\.CBO\.openMockupAsset = async function openMockupAsset/);
  assert.match(editorCanvasSource, /window\.CBO\.addMockupAssetToArtboard = async function addMockupAssetToArtboard/);
  assert.match(editorCanvasSource, /window\.CBO\.initEditorCanvas\(\{[\s\S]*documentHeight: size\.height,[\s\S]*documentWidth: size\.width/);
  assert.match(editorCanvasSource, /window\.CBO\.createDocumentArtboard\?\.\(\{[\s\S]*height: size\.height,[\s\S]*width: size\.width/);
  assert.match(editorCanvasSource, /function getMockupPlacementRect\(detail = \{\}, artboardId\)/);
  assert.match(editorCanvasSource, /createMockupPlacementTarget\(imageLayer\.id, placementRect\)/);
  assert.match(editorCanvasSource, /layerModel\.createLayer\(\{[\s\S]*mockupAsset:[\s\S]*name,[\s\S]*type: "image"/);
  assert.match(editorCanvasSource, /source: "mockup-rasterize"/);
  assert.doesNotMatch(editorCanvasSource, /finalizeImportedImageLayerAsEditablePaint\(imageLayer\.id, "mockup-rasterize"\)/);

  assert.match(artboardPreviewSource, /const MOCKUP_SLOT_CENTER_OFFSET_Y = 500/);
  assert.match(artboardPreviewSource, /function fitPreviewArtboard\(artboardId\)/);
  assert.match(artboardPreviewSource, /function focusPreviewArtboardView\(artboardId, options = \{\}\)/);
  assert.match(artboardPreviewSource, /namespace\.fitPreviewArtboard = function fitPreviewArtboardFromTool/);
  assert.match(artboardPreviewSource, /namespace\.focusPreviewArtboardView = function focusPreviewArtboardViewFromTool/);
  assert.match(artboardPreviewSource, /focusPreviewArtboardView\(button\.dataset\.artboardId,/);
  assert.match(artboardPreviewSource, /button\.dataset\.mockupSlotX = String\(geometry\.docX\)/);
  assert.match(artboardPreviewSource, /button\.dataset\.mockupSlotY = String\(geometry\.docY\)/);
  assert.match(artboardPreviewSource, /target\.closest\("\[data-mockup-slot\], \[data-mockup-slot-popover\]"\)/);
  assert.match(artboardPreviewSource, /function isMockupAddonLayerEntry\(entry, artboardId, addonLibrary = getMockupAddonLibrary\(\)\)/);
  assert.match(artboardPreviewSource, /return hasBodyLayer && !hasAddonLayer/);
  assert.match(artboardPreviewSource, /slotButton\?\.remove\(\)/);
  assert.match(artboardPreviewSource, /namespace\.addMockupAssetToArtboard\(detail, \{ artboardId \}\)/);
  assert.match(artboardPreviewSource, /window\.CBO_MOCKUP_ADDON_LIBRARY/);
  assert.match(layoutSource, /\.editor-mockup-slot-button/);
  assert.match(layoutSource, /\.editor-mockup-slot-popover/);
});
