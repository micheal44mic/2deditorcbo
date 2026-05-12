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
const rendererSource = fs.readFileSync(
  path.join(__dirname, "..", "js", "document", "document-renderer.js"),
  "utf8",
);

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
  assert.match(source, /window\.createImageBitmap\(blob, bitmapOptions\)/);
  assert.match(source, /assertImportOriginalWithinBudget\(headerSize, options\)/);
  assert.match(source, /reason: "image-original-pixels-over-budget"/);
  assert.match(source, /resizeWidth:\s*decodedSize\.width/);
  assert.match(source, /resizeHeight:\s*decodedSize\.height/);
  assert.match(source, /context\.drawImage\(image,\s*0,\s*0,\s*decodedSize\.width,\s*decodedSize\.height\)/);
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

test("uploaded image placement fits and centers inside the active document canvas", () => {
  assert.match(editorCanvasSource, /const fitScale = Math\.min\(1, documentWidth \/ sourceWidth, documentHeight \/ sourceHeight\)/);
  assert.match(editorCanvasSource, /const drawWidth = Math\.max\(1, Math\.min\(documentWidth, Math\.floor\(sourceWidth \* fitScale\)\)\)/);
  assert.match(editorCanvasSource, /const drawHeight = Math\.max\(1, Math\.min\(documentHeight, Math\.floor\(sourceHeight \* fitScale\)\)\)/);
  assert.match(editorCanvasSource, /x: Math\.round\(\(documentWidth - drawWidth\) \* 0\.5\)/);
  assert.match(editorCanvasSource, /y: Math\.round\(\(documentHeight - drawHeight\) \* 0\.5\)/);
  assert.match(editorCanvasSource, /drawHeight,\s*drawWidth,/);
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
  assert.match(editorCanvasSource, /const placement = await rasterizer\.placeBlob\(detail\.blob, \{ layerId: imageLayer\.id \}\)/);
  assert.match(editorCanvasSource, /imageBounds: placement\.destinationRect/);
  assert.match(editorCanvasSource, /invalidate: false/);
  assert.match(rendererSource, /const nonVisualSources = new Set\(\[/);
  assert.match(rendererSource, /changeType !== "active-layer"/);
  assert.match(rendererSource, /"active-layer"/);
  assert.match(rendererSource, /"image-rasterize"/);
  assert.match(rendererSource, /"image-upload"/);
  assert.match(rendererSource, /"raster-transform"/);
  assert.match(rendererSource, /changeType !== "active-layer" && !nonVisualSources\.has\(source\)/);
});
