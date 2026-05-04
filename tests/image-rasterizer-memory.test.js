const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "images", "image-rasterizer.js"),
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
