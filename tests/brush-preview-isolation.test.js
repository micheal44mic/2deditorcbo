const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readSource(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

test("brush studio and thumbnail previews isolate document artboard state", () => {
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");
  const rendererSource = readSource("js", "document", "document-renderer.js");
  const engineSource = readSource("js", "brush-engine.js");
  const layerModelSource = readSource("js", "document", "document-layer-model.js");

  assert.match(studioSource, /new window\.CBO\.DocumentRenderer\(\{[\s\S]*isolateDocumentArtboards: true/);
  assert.match(studioSource, /new window\.CBO\.BrushEngine\(previewCanvas, \{[\s\S]*isolateDocumentArtboards: true/);
  assert.match(studioSource, /new window\.CBO\.BrushEngine\(previewCanvas, \{[\s\S]*suppressCameraEvents: true/);
  assert.match(previewSource, /new namespace\.DocumentRenderer\(\{[\s\S]*isolateDocumentArtboards: true/);
  assert.match(previewSource, /new namespace\.BrushEngine\(canvas, \{[\s\S]*isolateDocumentArtboards: true/);
  assert.match(previewSource, /new namespace\.BrushEngine\(canvas, \{[\s\S]*suppressCameraEvents: true/);

  assert.match(rendererSource, /isolateDocumentArtboards: options\.isolateDocumentArtboards === true/);
  assert.match(rendererSource, /ignoreGlobalArtboards: this\.options\.isolateDocumentArtboards/);
  assert.match(rendererSource, /if \(this\.options\?\.isolateDocumentArtboards\) \{[\s\S]*return null;[\s\S]*const artboardId/);
  assert.match(rendererSource, /const artboardUnion = this\.options\?\.isolateDocumentArtboards[\s\S]*\? null[\s\S]*: namespace\.getDocumentArtboardUnionRect\?\.\(\)/);
  assert.match(rendererSource, /clearTarget\(target\) \{[\s\S]*this\.isSparseRasterTarget\(target\)[\s\S]*target\.tiles\.forEach\(\(tile\) => this\.deleteRasterTargetObject\(tile\)\)[\s\S]*target\.tiles\.clear\(\)/);

  assert.match(engineSource, /isolateDocumentArtboards: options\.isolateDocumentArtboards === true/);
  assert.match(engineSource, /suppressCameraEvents: options\.suppressCameraEvents === true/);
  assert.match(engineSource, /dispatchCameraChangeIfNeeded\(\) \{/);
  assert.match(engineSource, /if \(this\.options\.suppressCameraEvents\) \{[\s\S]*return false/);
  assert.match(engineSource, /new CustomEvent\("cbo:camera-change", \{ detail \}\)/);
  assert.match(engineSource, /usesIsolatedDocumentArtboards\(\) \{/);
  assert.match(engineSource, /getActiveDocumentPaintRect\(layerId = this\.strokeTargetLayerId \|\| ""\) \{[\s\S]*this\.usesIsolatedDocumentArtboards\(\)[\s\S]*return null/);
  assert.match(engineSource, /activateArtboardAtPoint\(point, source = "brush-pointer-artboard"\) \{[\s\S]*this\.usesIsolatedDocumentArtboards\(\)[\s\S]*return null/);

  assert.match(layerModelSource, /ignoreGlobalArtboards: options\.ignoreGlobalArtboards === true/);
  assert.match(layerModelSource, /if \(this\.options\?\.ignoreGlobalArtboards\) \{[\s\S]*return "";/);
});
