const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("document export module exports only drawing artboards as raster formats", () => {
  const indexSource = readRepoFile("index.html");
  const exportSource = readRepoFile("js", "document", "document-export.js");
  const sidebarSource = readRepoFile("js", "right-sidebar.js");

  assert.match(indexSource, /\.\/js\/document\/document-export\.js/);
  assert.ok(
    indexSource.indexOf("./js/document/document-save-system.js") <
      indexSource.indexOf("./js/document/document-export.js") &&
      indexSource.indexOf("./js/document/document-export.js") <
      indexSource.indexOf("./js/editor-canvas.js"),
  );
  assert.match(exportSource, /const PNG_MIME_TYPE = "image\/png"/);
  assert.match(exportSource, /const JPEG_MIME_TYPE = "image\/jpeg"/);
  assert.match(exportSource, /const WEBP_MIME_TYPE = "image\/webp"/);
  assert.match(exportSource, /const DEFAULT_METADATA_NAME = "m1m4\.com"/);
  assert.match(exportSource, /const DEFAULT_METADATA_SOURCE = "https:\/\/m1m4\.com"/);
  assert.match(exportSource, /const JPEG_EXIF_IDENTIFIER = "Exif\\0\\0"/);
  assert.match(exportSource, /const PNG_XMP_KEYWORD = "XML:com\.adobe\.xmp"/);
  assert.match(exportSource, /const EXPORT_FORMATS = Object\.freeze\(\{/);
  assert.match(exportSource, /function getDrawingArtboards\(\)/);
  assert.match(exportSource, /artboard\.type === "active" \|\| artboard\.type === "artboard"/);
  assert.match(exportSource, /const MAX_EXPORT_SCALE = 4/);
  assert.match(exportSource, /function normalizeExportScale\(value, fallback = DEFAULT_EXPORT_SCALE\)/);
  assert.match(exportSource, /function normalizeExportFormat\(value, fallback = DEFAULT_EXPORT_FORMAT\)/);
  assert.match(exportSource, /function normalizeRasterQuality\(value, fallback = DEFAULT_RASTER_QUALITY\)/);
  assert.match(exportSource, /function buildExportMetadata\(artboard, options = \{\}\)/);
  assert.match(exportSource, /Name: DEFAULT_METADATA_NAME/);
  assert.match(exportSource, /Copyright: DEFAULT_METADATA_NAME/);
  assert.match(exportSource, /Keywords: `\$\{DEFAULT_METADATA_NAME\}; CBOs Editor; export`/);
  assert.match(exportSource, /Source: DEFAULT_METADATA_SOURCE/);
  assert.match(exportSource, /Software: DEFAULT_METADATA_SOFTWARE/);
  assert.match(exportSource, /Subject: `\$\{projectName\} - \$\{artboardName\}`/);
  assert.match(exportSource, /function createPngTextChunk\(keyword, text\)/);
  assert.match(exportSource, /return createPngChunk\("tEXt", concatUint8Arrays\(\[/);
  assert.match(exportSource, /function createPngItxtChunk\(keyword, text\)/);
  assert.match(exportSource, /return createPngChunk\("iTXt", data\)/);
  assert.match(exportSource, /function createPngXmpChunk\(metadata\)/);
  assert.match(exportSource, /createPngItxtChunk\(PNG_XMP_KEYWORD, createXmpPacket\(metadata\)\)/);
  assert.match(exportSource, /function findPngMetadataInsertOffset\(bytes\)/);
  assert.match(exportSource, /if \(type === "IDAT"\) \{[\s\S]*return offset;/);
  assert.match(exportSource, /createPngXmpChunk\(metadata\),/);
  assert.match(exportSource, /createPngTextChunk\(key, value\),[\s\S]*createPngItxtChunk\(key, value\)/);
  assert.match(exportSource, /<dc:rights><rdf:Alt>/);
  assert.match(exportSource, /<dc:subject><rdf:Bag>/);
  assert.match(exportSource, /<exif:UserComment><rdf:Alt>/);
  assert.match(exportSource, /function createExifPayload\(metadata\)/);
  assert.match(exportSource, /createTiffAsciiEntry\(0x010e, title\)/);
  assert.match(exportSource, /createTiffByteEntry\(0x9c9b, encodeUtf16LeNull\(title\)\)/);
  assert.match(exportSource, /createTiffByteEntry\(0x9c9c, encodeUtf16LeNull\(comment\)\)/);
  assert.match(exportSource, /createTiffByteEntry\(0x9c9d, encodeUtf16LeNull\(author\)\)/);
  assert.match(exportSource, /createTiffByteEntry\(0x9c9e, encodeUtf16LeNull\(keywords\)\)/);
  assert.match(exportSource, /createTiffUndefinedEntry\(0x9286, createExifUserComment\(comment\)\)/);
  assert.match(exportSource, /function addJpegMetadata\(bytes, metadata\)/);
  assert.match(exportSource, /segment\[1\] = 0xe1/);
  assert.match(exportSource, /createJpegApp1Segment\(createExifPayload\(metadata\)\)/);
  assert.match(exportSource, /JPEG_EXIF_IDENTIFIER/);
  assert.match(exportSource, /JPEG_XMP_IDENTIFIER/);
  assert.match(exportSource, /function addWebpMetadata\(bytes, metadata\)/);
  assert.match(exportSource, /function createWebpVp8xChunk\(width, height, flags\)/);
  assert.match(exportSource, /createWebpChunk\("XMP ", encodeUtf8\(createXmpPacket\(metadata\)\)\)/);
  assert.match(exportSource, /createWebpVp8xChunk\(dimensions\.width, dimensions\.height, 0x04 \| \(hasAlphaChunk \? 0x10 : 0\)\)/);
  assert.match(exportSource, /function applyRasterMetadata\(blob, metadata, format\)/);
  assert.match(exportSource, /function parseArtboardIndexSpec\(spec, artboardCount\)/);
  assert.match(exportSource, /function filterDrawingArtboards\(artboards, options = \{\}\)/);
  assert.match(exportSource, /namespace\.getSelectedDocumentArtboardId\?\.\(\)/);
  assert.match(exportSource, /selection === "custom"[\s\S]*parseArtboardIndexSpec\(options\.artboardSpec, artboards\.length\)/);
  assert.match(exportSource, /namespace\.documentExportSystem = \{/);
  assert.match(exportSource, /exportDrawingArtboardsRaster/);
  assert.match(exportSource, /exportDrawingArtboardsPng/);
  assert.match(exportSource, /const exportWidth = normalizePositiveInt\(rect\.width \* scale, rect\.width\)/);
  assert.match(exportSource, /renderer\.drawToCanvas\(\{[\s\S]*camera: \{ x: -rect\.x \* scale, y: -rect\.y \* scale, zoom: scale \},[\s\S]*clearColor: includeBackground \? PAPER_CLEAR_COLOR : null,[\s\S]*skipBackgroundLayers: !includeBackground,[\s\S]*transparentBackground: !includeBackground,[\s\S]*viewportHeight: exportHeight,[\s\S]*viewportWidth: exportWidth,/);
  assert.match(exportSource, /gl\.readPixels\(0, 0, width, height, gl\.RGBA, gl\.UNSIGNED_BYTE, pixels\)/);
  assert.match(exportSource, /canvas\.toBlob\(\(blob\) => resolve\(blob \|\| null\), type, quality\)/);
  assert.match(exportSource, /format\.mimeType === PNG_MIME_TYPE \? undefined : quality/);
  assert.match(exportSource, /encodedBlob\.type && encodedBlob\.type !== format\.mimeType/);
  assert.match(exportSource, /const metadata = buildExportMetadata\(artboard, \{/);
  assert.match(exportSource, /const blob = await applyRasterMetadata\(encodedBlob, metadata, format\)/);
  assert.match(exportSource, /link\.download = filename/);
  assert.match(sidebarSource, /data-share-menu-toggle/);
  assert.match(sidebarSource, /data-share-menu hidden/);
  assert.match(sidebarSource, /data-export-format-option="png"/);
  assert.match(sidebarSource, /data-export-format-option="jpeg"/);
  assert.match(sidebarSource, /data-export-format-option="webp"/);
  assert.match(sidebarSource, /data-export-artboard-scope="all"/);
  assert.match(sidebarSource, /data-export-artboard-scope="selected"/);
  assert.match(sidebarSource, /data-export-artboard-scope="custom"/);
  assert.match(sidebarSource, /data-export-artboard-custom/);
  assert.match(sidebarSource, /data-export-artboards/);
  assert.match(sidebarSource, /data-export-background-toggle/);
  assert.match(sidebarSource, /data-export-scale-option="2"/);
  assert.match(sidebarSource, /data-export-quality/);
  assert.match(sidebarSource, /const exportFormatStorageKey = "cbo-export-format"/);
  assert.match(sidebarSource, /const exportScaleStorageKey = "cbo-export-raster-scale"/);
  assert.match(sidebarSource, /const legacyExportPngScaleStorageKey = "cbo-export-png-scale"/);
  assert.match(sidebarSource, /const exportQualityStorageKey = "cbo-export-raster-quality"/);
  assert.match(sidebarSource, /const exportArtboardScopeStorageKey = "cbo-export-artboard-scope"/);
  assert.match(sidebarSource, /const exportArtboardCustomStorageKey = "cbo-export-artboard-custom"/);
  assert.match(sidebarSource, /setExportFormat\(readStoredExportFormat\(\), \{ persist: false \}\)/);
  assert.match(sidebarSource, /setExportArtboardScope\(readStoredExportArtboardScope\(\), \{ persist: false \}\)/);
  assert.match(sidebarSource, /setExportScale\(readStoredExportScale\(\), \{ persist: false \}\)/);
  assert.match(sidebarSource, /setExportQuality\(readStoredExportQuality\(\), \{ persist: false \}\)/);
  assert.match(sidebarSource, /nextFormat === "jpeg"[\s\S]*setExportBackgroundEnabled\(true, \{ persist: false \}\)/);
  assert.match(sidebarSource, /setShareMenuOpen\(!isShareMenuOpen\(\)\)/);
  assert.doesNotMatch(sidebarSource, /right-sidebar-export right-sidebar-section/);
  assert.match(sidebarSource, /exportSystem\.exportDrawingArtboardsRaster\(\{[\s\S]*artboardSelection: getExportArtboardScope\(\),[\s\S]*artboardSpec: getExportArtboardCustom\(\),[\s\S]*format: getExportFormat\(\),[\s\S]*includeBackground: isExportBackgroundEnabled\(\),[\s\S]*quality: getExportQuality\(\),[\s\S]*scale: getExportScale\(\),[\s\S]*source: "right-sidebar-export"/);
});

test("document renderer supports export background controls", () => {
  const rendererSource = readRepoFile("js", "document", "document-renderer-compositing.js");

  assert.match(rendererSource, /const transparentBackground = options\.transparentBackground !== undefined/);
  assert.match(rendererSource, /const clearColor = Array\.isArray\(options\.clearColor\)/);
  assert.match(rendererSource, /if \(clearColor\) \{[\s\S]*gl\.clearColor\(clearColor\[0\], clearColor\[1\], clearColor\[2\], clearColor\[3\]\)/);
  assert.match(rendererSource, /options\.skipBackgroundLayers === true[\s\S]*layer\?\.type === "background" \|\| layer\?\.id === "background"/);
});
