const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readSource(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

const brushEngineModulePaths = [
  ["js", "brush-engine-shader-grain.js"],
  ["js", "brush-engine-target-gpu.js"],
  ["js", "brush-engine-history.js"],
  ["js", "brush-engine-sampler.js"],
  ["js", "brush-engine-stroke-input.js"],
  ["js", "brush-engine.js"],
];

function readBrushEngineSources() {
  return brushEngineModulePaths.map((segments) => readSource(...segments)).join("\n");
}

const documentRendererModulePaths = [
  ["js", "document", "document-renderer-shaders.js"],
  ["js", "document", "document-renderer-raster-targets.js"],
  ["js", "document", "document-renderer-history-snapshots.js"],
  ["js", "document", "document-renderer-webgl-programs.js"],
  ["js", "document", "document-renderer-viewport-culling.js"],
  ["js", "document", "document-renderer-layer-effects.js"],
  ["js", "document", "document-renderer-compositing.js"],
  ["js", "document", "document-renderer.js"],
];

function readDocumentRendererSources() {
  return documentRendererModulePaths.map((segments) => readSource(...segments)).join("\n");
}

test("brush studio and thumbnail previews isolate document artboard state", () => {
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");
  const rendererSource = readDocumentRendererSources();
  const engineSource = readBrushEngineSources();
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

test("brush previews use lighter mobile caps", () => {
  const studioSource = readSource("js", "brush-studio.js");
  const previewSource = readSource("js", "brush-preview.js");

  assert.match(previewSource, /function isMobilePerformanceMode\(\) \{/);
  assert.match(previewSource, /const dprCap = isMobilePerformanceMode\(\) \? 1 : maxDpr/);
  assert.match(previewSource, /if \(isMobilePerformanceMode\(\)\) \{[\s\S]*return renderToCanvas\(settings, size\)/);
  assert.match(studioSource, /function isAndroidPerformanceMode\(\) \{/);
  assert.match(studioSource, /brushStudioAndroidLitePreview === true/);
  assert.match(studioSource, /previewPad\.replaceChildren\(createAndroidLitePreviewNotice\(\)\)/);
  assert.match(studioSource, /const previewDocumentSizeCap =[\s\S]*isMobileLikeEnvironment\?\.\(\) === true \? 512 : 2048/);
  assert.match(studioSource, /documentSizeCap: previewDocumentSizeCap/);
  assert.match(studioSource, /const mobileGrainCap =[\s\S]*isMobileLikeEnvironment\?\.\(\) === true \? 1024 : grainTextureExportSize/);
  assert.match(studioSource, /const exportSize = Math\.max\(1, mobileGrainCap \|\| 2048\)/);
});

test("brush preview cache hashing avoids full data URL scans before lazy draw", () => {
  const previewSource = readSource("js", "brush-preview.js");

  assert.match(previewSource, /const largeHashStringThreshold = 512/);
  assert.match(previewSource, /function getHashValueSignature\(key, rawValue\)/);
  assert.match(previewSource, /value\.slice\(0, hashStringEdgeLength\)/);
  assert.match(previewSource, /value\.slice\(-hashStringEdgeLength\)/);
  assert.doesNotMatch(previewSource, /pendingKeys\.set\(canvas, key\);\s*ensureCanvasSize\(canvas, size\);/);
});

test("brush studio stroke replay caches path and base stamps separately from effects", () => {
  const engineSource = readSource("js", "brush-engine.js");
  const samplerSource = readSource("js", "brush-engine-sampler.js");
  const strokeInputSource = readSource("js", "brush-engine-stroke-input.js");
  const baseKeyMatch = strokeInputSource.match(
    /getReplayStrokeBaseSettingsKey\(taperTotalLength = null\) \{([\s\S]*?)\n    \}\n,/,
  );
  const expandedKeyMatch = strokeInputSource.match(
    /getReplayExpandedSettingsKey\(\) \{([\s\S]*?)\n    \}\n,/,
  );

  assert.match(engineSource, /this\.replayStrokeCache = null/);
  assert.match(samplerSource, /pushShapeStamps\(baseStamp, tangent, options = \{\}\)/);
  assert.match(samplerSource, /options\.assignColor !== false/);
  assert.match(samplerSource, /options\.includeBounds !== false/);
  assert.match(strokeInputSource, /getReplayStrokePathCache\(rawSamples\)/);
  assert.match(strokeInputSource, /buildReplayBaseStamps\(pathCache, taperTotalLength = null\)/);
  assert.match(strokeInputSource, /buildReplayExpandedStamps\(baseStamps\)/);
  assert.match(strokeInputSource, /getReplayExpandedStamps\(replayPlan\)/);
  assert.match(strokeInputSource, /renderReplayExpandedStamps\(expandedStamps\)/);
  assert.match(strokeInputSource, /baseStampsByKey: new Map\(\)/);
  assert.match(strokeInputSource, /expandedStampsByKey: new Map\(\)/);
  assert.doesNotMatch(strokeInputSource, /brush-engine\.replay-cache/);
  assert.match(strokeInputSource, /this\.renderReplayExpandedStamps\(this\.getReplayExpandedStamps\(replayPlan\)\)/);
  assert.match(strokeInputSource, /this\.invalidateReplayStrokeCache\(\)/);
  assert.ok(baseKeyMatch, "expected replay base stamp cache key helper");
  assert.ok(expandedKeyMatch, "expected replay expanded stamp cache key helper");
  assert.doesNotMatch(baseKeyMatch[1], /shape(?:Rotation|Scatter|Count|Randomized|Flip)/);
  assert.doesNotMatch(baseKeyMatch[1], /(?:stamp|stroke)Color/);
  assert.match(expandedKeyMatch[1], /shape(?:Rotation|Scatter|Count|Randomized)/);
  assert.match(expandedKeyMatch[1], /grainMoving(?:Rotation|DepthJitter|OffsetJitter)/);
  assert.doesNotMatch(expandedKeyMatch[1], /(?:stamp|stroke)Color/);
});
