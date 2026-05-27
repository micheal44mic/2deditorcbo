const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "images", "image-rasterizer.js"),
  "utf8",
);
const editorCanvasSource = fs.readFileSync(
  path.join(__dirname, "..", "js", "editor-canvas.js"),
  "utf8",
);
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
const rendererSource = documentRendererModulePaths
  .map((parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8"))
  .join("\n");

test("image rasterizer caps imported images before WebGL texture upload", () => {
  assert.match(source, /IMPORT_MEMORY_POLICY/);
  assert.match(source, /maxOriginalPixels:\s*4096 \* 4096/);
  assert.match(source, /maxSourceMiB:\s*16/);
  assert.match(source, /maxSourceSide:\s*4096/);
  assert.match(source, /fitImageSize\(width,\s*height,\s*options = \{\}\)/);
  assert.match(source, /readBlobImageSize\(blob\)/);
  assert.match(source, /readJpegSize\(header\)/);
  assert.match(source, /readPngSize\(header\)/);
  assert.match(source, /readWebpSize\(header\)/);
  assert.match(source, /async isSvgImageBlob\(blob\)/);
  assert.match(source, /const useHtmlImageDecode = await this\.isSvgImageBlob\(blob\)/);
  assert.match(source, /if \(window\.createImageBitmap && !useHtmlImageDecode\)/);
  assert.match(source, /window\.createImageBitmap\(blob, bitmapOptions\)/);
  assert.match(source, /assertImportOriginalWithinBudget\(headerSize, options\)/);
  assert.match(source, /reason: "image-original-pixels-over-budget"/);
  assert.match(source, /resizeWidth:\s*decodedSize\.width/);
  assert.match(source, /resizeHeight:\s*decodedSize\.height/);
  assert.match(source, /context\.drawImage\(image,\s*0,\s*0,\s*decodedSize\.width,\s*decodedSize\.height\)/);
  assert.match(source, /getImportDecodeSize\(width,\s*height,\s*options = \{\}\)/);
  assert.match(source, /options\.preserveOriginalDimensions === true/);
  assert.match(source, /return this\.getPreservedImageSize\(width,\s*height,\s*options\)/);
  assert.match(source, /report\.reason = "image-source-side-over-webgl-limit"/);
  assert.match(source, /reason:\s*resized[\s\S]*"image-preserved-original-size"[\s\S]*"image-kept-within-import-budget"/);
});

test("image import reports operation memory to raster resource manager", () => {
  assert.match(source, /createImportDecodeReport/);
  assert.match(source, /finalizeImportMemoryReport/);
  assert.match(source, /recordRasterOperation\(report\)/);
  assert.match(source, /recordRasterOperation\?\.\(report\)/);
  assert.match(source, /lastImageImportMemoryReport/);
  assert.match(source, /documentRenderer\?\.evictRasterScratchCachesForPolicy\?\.\(recorded,/);
  assert.match(source, /estimatedPeakBytes\s*=\s*sourceBytes\s*\+\s*targetBytes/);
});

test("uploaded image placement preserves source dimensions and centers on the target artboard", () => {
  assert.match(editorCanvasSource, /function resolveUploadedImageArtboardId\(layerModel\)/);
  assert.match(editorCanvasSource, /layerModel\?\.resolveInsertionArtboardId\?\.\(activeEntry\)/);
  assert.match(editorCanvasSource, /return knownArtboards\.some\(\(artboard\) => artboard\?\.id === resolvedArtboardId\)/);
  assert.match(editorCanvasSource, /UPLOAD_ORIGINAL_DIMENSION_IMPORT_OPTIONS/);
  assert.match(editorCanvasSource, /preserveOriginalDimensions: true/);
  assert.match(editorCanvasSource, /artboardId: uploadArtboardId/);
  assert.match(editorCanvasSource, /insertLayerAtTopOfArtboardEntries\(\s*entries,\s*uploadArtboardId,\s*imageLayer,/);
  assert.match(editorCanvasSource, /layerModel\.setEntries\(nextEntries, \{ activeLayerId: imageLayer\.id, source: "image-upload" \}\)/);
  assert.match(editorCanvasSource, /const artboardRect = window\.CBO\.getActiveDocumentArtboardRect\?\.\(\{\s*artboardId: options\.artboardId,\s*layerId: options\.layerId,/);
  assert.match(editorCanvasSource, /const preserveOriginalDimensions = options\.preserveOriginalDimensions === true/);
  assert.match(editorCanvasSource, /const fitScale = Math\.min\(1, documentWidth \/ sourceWidth, documentHeight \/ sourceHeight\)/);
  assert.match(editorCanvasSource, /const drawWidth = preserveOriginalDimensions[\s\S]*\? sourceWidth[\s\S]*Math\.max\(1, Math\.min\(documentWidth, Math\.floor\(sourceWidth \* fitScale\)\)\)/);
  assert.match(editorCanvasSource, /const drawHeight = preserveOriginalDimensions[\s\S]*\? sourceHeight[\s\S]*Math\.max\(1, Math\.min\(documentHeight, Math\.floor\(sourceHeight \* fitScale\)\)\)/);
  assert.match(editorCanvasSource, /const targetRect = \{[\s\S]*x: Math\.round\(artboardRect\.x \+ \(documentWidth - drawWidth\) \* 0\.5\)/);
  assert.match(editorCanvasSource, /y: Math\.round\(artboardRect\.y \+ \(documentHeight - drawHeight\) \* 0\.5\)/);
  assert.match(editorCanvasSource, /renderer\.createRasterTargetForUnclampedRect\(placementRect,/);
  assert.match(editorCanvasSource, /drawHeight,\s*drawWidth,/);
  assert.match(editorCanvasSource, /drawX: targetRect\.x - target\.x/);
  assert.match(editorCanvasSource, /drawY: targetRect\.y - target\.y/);
  assert.match(source, /const destinationWidth = Math\.max\([\s\S]*?target\.drawWidth \|\| width/);
  assert.match(source, /const destinationHeight = Math\.max\([\s\S]*?target\.drawHeight \|\| height/);
  assert.match(source, /Math\.round\(\(targetWidth - destinationWidth\) \* 0\.5\)/);
  assert.match(source, /Math\.round\(\(targetHeight - destinationHeight\) \* 0\.5\)/);
  assert.match(source, /gl\.uniform4f\(uniforms\.destinationRect, x, y, destinationWidth, destinationHeight\)/);
});

test("uploaded image placement reports dirty bounds instead of forcing a full preview redraw", () => {
  assert.match(source, /return this\.placeRasterImage\(decodedImage\.source,/);
  assert.match(source, /const destinationRect = \{/);
  assert.match(source, /rect: destinationRect/);
  assert.match(source, /return \{\s*destinationRect,/);
  assert.match(editorCanvasSource, /const placement = await rasterizer\.placeBlob\(detail\.blob, \{\s*\.\.\.UPLOAD_ORIGINAL_DIMENSION_IMPORT_OPTIONS,\s*artboardId: uploadArtboardId,\s*layerId: imageLayer\.id,/);
  assert.match(editorCanvasSource, /imageBounds: placement\.destinationRect/);
  assert.doesNotMatch(editorCanvasSource, /finalizeImportedImageLayerAsEditablePaint\(imageLayer\.id, "image-upload-auto-rasterize"\)/);
  assert.match(editorCanvasSource, /layerModel\.createLayer\(\{\s*artboardId: uploadArtboardId,[\s\S]*type: "image"/);
  assert.match(editorCanvasSource, /invalidate: false/);
  assert.match(rendererSource, /const nonVisualSources = new Set\(\[/);
  assert.match(rendererSource, /changeType !== "active-layer"/);
  assert.match(rendererSource, /"active-layer"/);
  assert.match(rendererSource, /"image-rasterize"/);
  assert.match(rendererSource, /"image-upload"/);
  assert.match(rendererSource, /"raster-transform"/);
  assert.match(rendererSource, /changeType !== "active-layer" && !nonVisualSources\.has\(source\)/);
});

test("uploaded image metadata emits visual update for clipping masks", () => {
  assert.match(editorCanvasSource, /source: "image-rasterize"/);
  assert.match(editorCanvasSource, /source: "image-upload-metadata"/);
  assert.match(editorCanvasSource, /commitVisualDirtyChange\?\.\(/);

  const metadataUpdateBlock = editorCanvasSource.match(
    /imageBounds: placement\.destinationRect,[\s\S]*?source: "image-upload-metadata",[\s\S]*?\}/,
  )?.[0] || "";

  assert.doesNotMatch(metadataUpdateBlock, /emit:\s*false/);
});
