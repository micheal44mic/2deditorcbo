window.CBO = window.CBO || {};

(function registerDocumentExport(namespace) {
  const PNG_MIME_TYPE = "image/png";
  const JPEG_MIME_TYPE = "image/jpeg";
  const WEBP_MIME_TYPE = "image/webp";
  const PAPER_CLEAR_COLOR = Object.freeze([247 / 255, 247 / 255, 242 / 255, 1]);
  const DEFAULT_EXPORT_NAME = "cbo-artboards";
  const DEFAULT_EXPORT_FORMAT = "png";
  const DEFAULT_EXPORT_SCALE = 1;
  const DEFAULT_RASTER_QUALITY = 0.92;
  const DEFAULT_METADATA_NAME = "m1m4.com";
  const DEFAULT_METADATA_SOURCE = "https://m1m4.com";
  const DEFAULT_METADATA_SOFTWARE = "CBOs Editor / m1m4.com";
  const MAX_EXPORT_SCALE = 4;
  const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
  const JPEG_EXIF_IDENTIFIER = "Exif\0\0";
  const JPEG_XMP_IDENTIFIER = "http://ns.adobe.com/xap/1.0/\0";
  const PNG_XMP_KEYWORD = "XML:com.adobe.xmp";
  const EXPORT_FORMATS = Object.freeze({
    jpeg: Object.freeze({
      extension: "jpg",
      key: "jpeg",
      label: "JPEG",
      mimeType: JPEG_MIME_TYPE,
      supportsTransparency: false,
    }),
    png: Object.freeze({
      extension: "png",
      key: "png",
      label: "PNG",
      mimeType: PNG_MIME_TYPE,
      supportsTransparency: true,
    }),
    webp: Object.freeze({
      extension: "webp",
      key: "webp",
      label: "WebP",
      mimeType: WEBP_MIME_TYPE,
      supportsTransparency: true,
    }),
  });

  function normalizePositiveInt(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0
      ? Math.max(1, Math.round(number))
      : fallback;
  }

  function normalizeExportScale(value, fallback = DEFAULT_EXPORT_SCALE) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return fallback;
    }

    return Math.max(1, Math.min(MAX_EXPORT_SCALE, Math.round(number)));
  }

  function normalizeExportFormat(value, fallback = DEFAULT_EXPORT_FORMAT) {
    const key = String(value || "").trim().toLowerCase();

    if (key === "jpg") {
      return "jpeg";
    }

    return EXPORT_FORMATS[key] ? key : fallback;
  }

  function getExportFormat(value) {
    return EXPORT_FORMATS[normalizeExportFormat(value)];
  }

  function normalizeRasterQuality(value, fallback = DEFAULT_RASTER_QUALITY) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return fallback;
    }

    const normalized = number > 1 ? number / 100 : number;

    return Math.max(0.01, Math.min(1, normalized));
  }

  function encodeUtf8(value) {
    return new TextEncoder().encode(String(value || ""));
  }

  function encodeAscii(value) {
    return Uint8Array.from(String(value || ""), (char) => char.charCodeAt(0) & 0x7f);
  }

  function concatUint8Arrays(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;

    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });

    return output;
  }

  function readUint32Be(bytes, offset) {
    return (
      ((bytes[offset] || 0) << 24) |
      ((bytes[offset + 1] || 0) << 16) |
      ((bytes[offset + 2] || 0) << 8) |
      (bytes[offset + 3] || 0)
    ) >>> 0;
  }

  function writeUint32Be(bytes, offset, value) {
    const number = Number(value) >>> 0;

    bytes[offset] = (number >>> 24) & 0xff;
    bytes[offset + 1] = (number >>> 16) & 0xff;
    bytes[offset + 2] = (number >>> 8) & 0xff;
    bytes[offset + 3] = number & 0xff;
  }

  function writeUint16Be(bytes, offset, value) {
    const number = Number(value) & 0xffff;

    bytes[offset] = (number >>> 8) & 0xff;
    bytes[offset + 1] = number & 0xff;
  }

  function writeUint16Le(bytes, offset, value) {
    const number = Number(value) & 0xffff;

    bytes[offset] = number & 0xff;
    bytes[offset + 1] = (number >>> 8) & 0xff;
  }

  function readUint32Le(bytes, offset) {
    return (
      (bytes[offset] || 0) |
      ((bytes[offset + 1] || 0) << 8) |
      ((bytes[offset + 2] || 0) << 16) |
      ((bytes[offset + 3] || 0) << 24)
    ) >>> 0;
  }

  function writeUint32Le(bytes, offset, value) {
    const number = Number(value) >>> 0;

    bytes[offset] = number & 0xff;
    bytes[offset + 1] = (number >>> 8) & 0xff;
    bytes[offset + 2] = (number >>> 16) & 0xff;
    bytes[offset + 3] = (number >>> 24) & 0xff;
  }

  function writeUint24Le(bytes, offset, value) {
    const number = Math.max(0, Number(value) || 0) >>> 0;

    bytes[offset] = number & 0xff;
    bytes[offset + 1] = (number >>> 8) & 0xff;
    bytes[offset + 2] = (number >>> 16) & 0xff;
  }

  const pngCrcTable = (() => {
    const table = new Uint32Array(256);

    for (let index = 0; index < 256; index += 1) {
      let crc = index;

      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }

      table[index] = crc >>> 0;
    }

    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;

    for (let index = 0; index < bytes.length; index += 1) {
      crc = pngCrcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function xmlEscape(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function normalizeMetadataKey(value) {
    return String(value || "")
      .replace(/[^\x20-\x7e]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 79);
  }

  function normalizeMetadataValue(value) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .trim();
  }

  function normalizePngTextValue(value) {
    return normalizeMetadataValue(value)
      .replace(/[^\x20-\x7e]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function encodeNullTerminatedAscii(value) {
    const text = normalizePngTextValue(value);

    return concatUint8Arrays([encodeAscii(text), Uint8Array.from([0])]);
  }

  function encodeUtf16LeNull(value) {
    const text = normalizeMetadataValue(value);
    const bytes = new Uint8Array((text.length + 1) * 2);

    for (let index = 0; index < text.length; index += 1) {
      writeUint16Le(bytes, index * 2, text.charCodeAt(index));
    }

    return bytes;
  }

  function getMetadataKeywords(metadata) {
    const rawKeywords = metadata?.Keywords || `${DEFAULT_METADATA_NAME}; CBOs Editor; export`;
    const parts = Array.isArray(rawKeywords)
      ? rawKeywords
      : String(rawKeywords).split(/[;,]+/);
    const keywords = parts
      .map((keyword) => normalizeMetadataValue(keyword))
      .filter(Boolean);

    return [...new Set(keywords)];
  }

  function normalizeArtboardRect(artboard) {
    if (!artboard) {
      return null;
    }

    return {
      height: normalizePositiveInt(artboard.height, 1),
      width: normalizePositiveInt(artboard.width, 1),
      x: Number.isFinite(Number(artboard.x)) ? Math.round(Number(artboard.x)) : 0,
      y: Number.isFinite(Number(artboard.y)) ? Math.round(Number(artboard.y)) : 0,
    };
  }

  function getDrawingArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    return Array.isArray(artboards)
      ? artboards
          .filter((artboard) => artboard && (artboard.type === "active" || artboard.type === "artboard"))
          .map((artboard, index) => ({ ...artboard, exportIndex: index, rect: normalizeArtboardRect(artboard) }))
          .filter((artboard) => artboard.rect)
      : [];
  }

  function parseArtboardIndexSpec(spec, artboardCount) {
    const indexes = new Set();
    const text = String(spec || "").trim().toLowerCase();

    if (!text || text === "all" || text === "*") {
      return text ? Array.from({ length: artboardCount }, (_, index) => index) : [];
    }

    text
      .split(/[,;\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);

        if (rangeMatch) {
          const start = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
          const end = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));

          for (let index = start; index <= end; index += 1) {
            if (index >= 1 && index <= artboardCount) {
              indexes.add(index - 1);
            }
          }

          return;
        }

        const number = Number(part);

        if (Number.isInteger(number) && number >= 1 && number <= artboardCount) {
          indexes.add(number - 1);
        }
      });

    return [...indexes].sort((a, b) => a - b);
  }

  function getSelectedExportArtboardId(options = {}) {
    return String(
      options.selectedArtboardId ||
      namespace.getSelectedDocumentArtboardId?.() ||
      namespace.getActiveDocumentArtboardId?.() ||
      "",
    ).trim();
  }

  function filterDrawingArtboards(artboards, options = {}) {
    const selection = String(options.artboardSelection || "all").trim().toLowerCase();

    if (!Array.isArray(artboards) || artboards.length === 0 || selection === "all") {
      return Array.isArray(artboards) ? artboards : [];
    }

    if (selection === "selected") {
      const selectedId = getSelectedExportArtboardId(options);

      return selectedId
        ? artboards.filter((artboard) => artboard.id === selectedId)
        : [];
    }

    if (selection === "custom") {
      const indexes = Array.isArray(options.artboardIndexes)
        ? options.artboardIndexes
            .map((index) => Number(index) - 1)
            .filter((index) => Number.isInteger(index) && index >= 0 && index < artboards.length)
        : parseArtboardIndexSpec(options.artboardSpec, artboards.length);
      const uniqueIndexes = [...new Set(indexes)].sort((a, b) => a - b);

      return uniqueIndexes.map((index) => artboards[index]).filter(Boolean);
    }

    return artboards;
  }

  function sanitizeFileNamePart(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    return cleaned || fallback;
  }

  function getExportProjectName() {
    return sanitizeFileNamePart(
      namespace.getDocumentProjectName?.() || namespace.documentProjectName || "",
      DEFAULT_EXPORT_NAME,
    );
  }

  function getArtboardFileName(artboard, index = 0, options = {}) {
    const prefix = sanitizeFileNamePart(options.projectName || getExportProjectName(), DEFAULT_EXPORT_NAME);
    const artboardName = sanitizeFileNamePart(artboard?.name || artboard?.id || `artboard-${index + 1}`, `artboard-${index + 1}`);
    const indexLabel = String(index + 1).padStart(2, "0");
    const format = getExportFormat(options.format);
    const scale = normalizeExportScale(options.scale, DEFAULT_EXPORT_SCALE);
    const scaleLabel = scale > 1 ? `@${scale}x` : "";

    return `${prefix}-${indexLabel}-${artboardName}${scaleLabel}.${format.extension}`;
  }

  function getArtboardDisplayName(artboard, index = 0) {
    return String(artboard?.name || artboard?.id || `Artboard ${index + 1}`).trim() || `Artboard ${index + 1}`;
  }

  function buildExportMetadata(artboard, options = {}) {
    const index = Number.isInteger(options.index) ? options.index : 0;
    const projectName = String(options.projectName || getExportProjectName()).trim() || DEFAULT_EXPORT_NAME;
    const artboardName = getArtboardDisplayName(artboard, index);
    const format = getExportFormat(options.format);
    const scale = normalizeExportScale(options.scale, DEFAULT_EXPORT_SCALE);
    const width = normalizePositiveInt(options.width, normalizePositiveInt(artboard?.rect?.width || artboard?.width, 1));
    const height = normalizePositiveInt(options.height, normalizePositiveInt(artboard?.rect?.height || artboard?.height, 1));
    const metadata = {
      Author: DEFAULT_METADATA_NAME,
      Copyright: DEFAULT_METADATA_NAME,
      Creator: DEFAULT_METADATA_NAME,
      Description: `Exported from ${projectName} with ${DEFAULT_METADATA_SOFTWARE}`,
      Format: format.label,
      Keywords: `${DEFAULT_METADATA_NAME}; CBOs Editor; export`,
      Name: DEFAULT_METADATA_NAME,
      Software: DEFAULT_METADATA_SOFTWARE,
      Source: DEFAULT_METADATA_SOURCE,
      Subject: `${projectName} - ${artboardName}`,
      Title: `${projectName} - ${artboardName}`,
      Website: DEFAULT_METADATA_SOURCE,
      Comment: `Artboard ${index + 1}; ${width} x ${height}; ${format.label}; ${scale}x`,
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
    };

    return Object.fromEntries(
      Object.entries(metadata)
        .map(([key, value]) => [normalizeMetadataKey(key), normalizeMetadataValue(value)])
        .filter(([key, value]) => key && value),
    );
  }

  function assertRendererReady() {
    const renderer = namespace.documentRenderer;
    const gl = renderer?.gl;

    if (!renderer || !gl || typeof renderer.drawToCanvas !== "function") {
      throw new Error("Renderer documento non pronto per esportare.");
    }

    return { gl, renderer };
  }

  function createExportRenderTarget(gl, width, height) {
    const maxSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;

    if (width > maxSize || height > maxSize) {
      throw new Error(`Artboard troppo grande per esportare (${width} x ${height}, limite ${maxSize}).`);
    }

    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();

    if (!texture || !framebuffer) {
      if (texture) {
        gl.deleteTexture(texture);
      }

      if (framebuffer) {
        gl.deleteFramebuffer(framebuffer);
      }

      throw new Error("Impossibile creare il target di export.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (!ready) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error("Target di export non valido.");
    }

    return { framebuffer, height, texture, width };
  }

  function destroyExportRenderTarget(gl, target) {
    if (!target) {
      return;
    }

    if (target.framebuffer) {
      gl.deleteFramebuffer(target.framebuffer);
    }

    if (target.texture) {
      gl.deleteTexture(target.texture);
    }
  }

  function writeFlippedPixels(sourcePixels, outputPixels, width, height, options = {}) {
    const unpremultiplyAlpha = options.unpremultiplyAlpha !== false;

    for (let y = 0; y < height; y += 1) {
      const sourceRowOffset = (height - y - 1) * width * 4;
      const outputRowOffset = y * width * 4;

      for (let x = 0; x < width; x += 1) {
        const sourceOffset = sourceRowOffset + x * 4;
        const outputOffset = outputRowOffset + x * 4;
        const alpha = sourcePixels[sourceOffset + 3];

        if (unpremultiplyAlpha && alpha > 0 && alpha < 255) {
          const scale = 255 / alpha;

          outputPixels[outputOffset] = Math.min(255, Math.round(sourcePixels[sourceOffset] * scale));
          outputPixels[outputOffset + 1] = Math.min(255, Math.round(sourcePixels[sourceOffset + 1] * scale));
          outputPixels[outputOffset + 2] = Math.min(255, Math.round(sourcePixels[sourceOffset + 2] * scale));
        } else {
          outputPixels[outputOffset] = sourcePixels[sourceOffset];
          outputPixels[outputOffset + 1] = sourcePixels[sourceOffset + 1];
          outputPixels[outputOffset + 2] = sourcePixels[sourceOffset + 2];
        }

        outputPixels[outputOffset + 3] = alpha;
      }
    }
  }

  function createCanvasFromFramebuffer(gl, target, options = {}) {
    const width = normalizePositiveInt(target?.width, 1);
    const height = normalizePositiveInt(target?.height, 1);
    const pixels = new Uint8Array(width * height * 4);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    canvas.width = width;
    canvas.height = height;

    const imageData = context.createImageData(width, height);

    writeFlippedPixels(pixels, imageData.data, width, height, options);
    context.putImageData(imageData, 0, 0);

    return canvas;
  }

  function canvasToBlob(canvas, type = PNG_MIME_TYPE, quality) {
    return new Promise((resolve) => {
      if (!canvas?.toBlob) {
        resolve(null);
        return;
      }

      canvas.toBlob((blob) => resolve(blob || null), type, quality);
    });
  }

  function createPngChunk(type, data) {
    const typeBytes = encodeAscii(type);
    const chunk = new Uint8Array(12 + data.length);

    writeUint32Be(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    writeUint32Be(chunk, 8 + data.length, crc32(concatUint8Arrays([typeBytes, data])));

    return chunk;
  }

  function createPngItxtChunk(keyword, text) {
    const keywordBytes = encodeAscii(normalizeMetadataKey(keyword));
    const textBytes = encodeUtf8(text);
    const data = concatUint8Arrays([
      keywordBytes,
      Uint8Array.from([0, 0, 0, 0, 0]),
      textBytes,
    ]);

    return createPngChunk("iTXt", data);
  }

  function createPngTextChunk(keyword, text) {
    const key = normalizeMetadataKey(keyword);
    const value = normalizePngTextValue(text);

    if (!key || !value) {
      return null;
    }

    return createPngChunk("tEXt", concatUint8Arrays([
      encodeAscii(key),
      Uint8Array.from([0]),
      encodeAscii(value),
    ]));
  }

  function createPngXmpChunk(metadata) {
    return createPngItxtChunk(PNG_XMP_KEYWORD, createXmpPacket(metadata));
  }

  function findPngMetadataInsertOffset(bytes) {
    if (
      bytes.length < PNG_SIGNATURE.length ||
      !PNG_SIGNATURE.every((value, index) => bytes[index] === value)
    ) {
      return -1;
    }

    let offset = PNG_SIGNATURE.length;
    let iendOffset = -1;

    while (offset + 12 <= bytes.length) {
      const length = readUint32Be(bytes, offset);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7],
      );

      if (offset + 12 + length > bytes.length) {
        return -1;
      }

      if (type === "IDAT") {
        return offset;
      }

      if (type === "IEND") {
        iendOffset = offset;
        break;
      }

      offset += 12 + length;
    }

    return iendOffset;
  }

  function addPngMetadata(bytes, metadata) {
    const insertOffset = findPngMetadataInsertOffset(bytes);

    if (insertOffset < 0) {
      return bytes;
    }

    const chunks = [
      createPngXmpChunk(metadata),
      ...Object.entries(metadata).flatMap(([key, value]) => [
        createPngTextChunk(key, value),
        createPngItxtChunk(key, value),
      ].filter(Boolean)),
    ].filter(Boolean);

    return concatUint8Arrays([
      bytes.subarray(0, insertOffset),
      ...chunks,
      bytes.subarray(insertOffset),
    ]);
  }

  function createXmpPacket(metadata) {
    const title = xmlEscape(metadata.Title || metadata.Name || DEFAULT_METADATA_NAME);
    const creator = xmlEscape(metadata.Creator || metadata.Author || DEFAULT_METADATA_NAME);
    const description = xmlEscape(metadata.Description || "");
    const comment = xmlEscape(metadata.Comment || metadata.Description || "");
    const rights = xmlEscape(metadata.Copyright || DEFAULT_METADATA_NAME);
    const software = xmlEscape(metadata.Software || DEFAULT_METADATA_SOFTWARE);
    const source = xmlEscape(metadata.Source || metadata.Website || DEFAULT_METADATA_SOURCE);
    const subject = getMetadataKeywords(metadata)
      .map((keyword) => `<rdf:li>${xmlEscape(keyword)}</rdf:li>`)
      .join("");

    return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
      `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">` +
      `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>` +
      `<dc:creator><rdf:Seq><rdf:li>${creator}</rdf:li></rdf:Seq></dc:creator>` +
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li></rdf:Alt></dc:description>` +
      `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${rights}</rdf:li></rdf:Alt></dc:rights>` +
      `<dc:subject><rdf:Bag>${subject}</rdf:Bag></dc:subject>` +
      `<xmp:CreatorTool>${software}</xmp:CreatorTool>` +
      `<exif:UserComment><rdf:Alt><rdf:li xml:lang="x-default">${comment}</rdf:li></rdf:Alt></exif:UserComment>` +
      `<photoshop:Source>${source}</photoshop:Source>` +
      `</rdf:Description></rdf:RDF></x:xmpmeta>` +
      `<?xpacket end="w"?>`;
  }

  function padEvenBytes(bytes) {
    return bytes.length % 2 ? concatUint8Arrays([bytes, Uint8Array.from([0])]) : bytes;
  }

  function createTiffEntry(tag, type, count, data) {
    return data && count > 0 ? { count, data, tag, type } : null;
  }

  function createTiffAsciiEntry(tag, value) {
    const text = normalizePngTextValue(value);

    return text ? createTiffEntry(tag, 2, text.length + 1, encodeNullTerminatedAscii(text)) : null;
  }

  function createTiffByteEntry(tag, data) {
    return data?.length ? createTiffEntry(tag, 1, data.length, data) : null;
  }

  function createTiffUndefinedEntry(tag, data) {
    return data?.length ? createTiffEntry(tag, 7, data.length, data) : null;
  }

  function createTiffLongEntry(tag, value) {
    const data = new Uint8Array(4);

    writeUint32Le(data, 0, value);

    return createTiffEntry(tag, 4, 1, data);
  }

  function getTiffExternalDataLength(entries) {
    return entries.reduce((total, entry) => (
      entry?.data?.length > 4 ? total + padEvenBytes(entry.data).length : total
    ), 0);
  }

  function createTiffIfd(entries, dataStartOffset, nextIfdOffset = 0) {
    const normalizedEntries = entries
      .filter(Boolean)
      .sort((left, right) => left.tag - right.tag);
    const table = new Uint8Array(2 + normalizedEntries.length * 12 + 4);
    const dataParts = [];
    let dataOffset = dataStartOffset;

    writeUint16Le(table, 0, normalizedEntries.length);

    normalizedEntries.forEach((entry, index) => {
      const offset = 2 + index * 12;

      writeUint16Le(table, offset, entry.tag);
      writeUint16Le(table, offset + 2, entry.type);
      writeUint32Le(table, offset + 4, entry.count);

      if (entry.data.length <= 4) {
        table.set(entry.data, offset + 8);
      } else {
        const storedData = padEvenBytes(entry.data);

        writeUint32Le(table, offset + 8, dataOffset);
        dataParts.push(storedData);
        dataOffset += storedData.length;
      }
    });

    writeUint32Le(table, 2 + normalizedEntries.length * 12, nextIfdOffset);

    return concatUint8Arrays([table, ...dataParts]);
  }

  function createExifUserComment(value) {
    const comment = normalizePngTextValue(value);

    return concatUint8Arrays([
      encodeAscii("ASCII\0\0\0"),
      encodeAscii(comment),
    ]);
  }

  function createExifPayload(metadata) {
    const title = metadata.Title || metadata.Name || DEFAULT_METADATA_NAME;
    const author = metadata.Author || metadata.Creator || DEFAULT_METADATA_NAME;
    const comment = metadata.Comment || metadata.Description || "";
    const copyright = metadata.Copyright || DEFAULT_METADATA_NAME;
    const software = metadata.Software || DEFAULT_METADATA_SOFTWARE;
    const subject = metadata.Subject || title;
    const keywords = getMetadataKeywords(metadata).join("; ");
    const ifd0ValueEntries = [
      createTiffAsciiEntry(0x010e, title),
      createTiffAsciiEntry(0x0131, software),
      createTiffAsciiEntry(0x013b, author),
      createTiffAsciiEntry(0x8298, copyright),
      createTiffByteEntry(0x9c9b, encodeUtf16LeNull(title)),
      createTiffByteEntry(0x9c9c, encodeUtf16LeNull(comment)),
      createTiffByteEntry(0x9c9d, encodeUtf16LeNull(author)),
      createTiffByteEntry(0x9c9e, encodeUtf16LeNull(keywords)),
      createTiffByteEntry(0x9c9f, encodeUtf16LeNull(subject)),
    ].filter(Boolean);
    const exifEntries = [
      createTiffUndefinedEntry(0x9286, createExifUserComment(comment)),
    ].filter(Boolean);
    const ifd0EntryCount = ifd0ValueEntries.length + (exifEntries.length ? 1 : 0);
    const ifd0DataStartOffset = 8 + 2 + ifd0EntryCount * 12 + 4;
    const ifd0DataLength = getTiffExternalDataLength(ifd0ValueEntries);
    const exifIfdOffset = exifEntries.length ? ifd0DataStartOffset + ifd0DataLength : 0;
    const ifd0Entries = exifIfdOffset
      ? [...ifd0ValueEntries, createTiffLongEntry(0x8769, exifIfdOffset)]
      : ifd0ValueEntries;
    const exifIfdDataStartOffset = exifIfdOffset + 2 + exifEntries.length * 12 + 4;
    const tiffHeader = new Uint8Array(8);

    tiffHeader[0] = 0x49;
    tiffHeader[1] = 0x49;
    writeUint16Le(tiffHeader, 2, 42);
    writeUint32Le(tiffHeader, 4, 8);

    return concatUint8Arrays([
      encodeAscii(JPEG_EXIF_IDENTIFIER),
      tiffHeader,
      createTiffIfd(ifd0Entries, ifd0DataStartOffset),
      ...(exifEntries.length ? [createTiffIfd(exifEntries, exifIfdDataStartOffset)] : []),
    ]);
  }

  function createJpegApp1Segment(payload) {
    if (!payload || payload.length + 2 > 0xffff) {
      return null;
    }

    const segment = new Uint8Array(4 + payload.length);

    segment[0] = 0xff;
    segment[1] = 0xe1;
    writeUint16Be(segment, 2, payload.length + 2);
    segment.set(payload, 4);

    return segment;
  }

  function addJpegMetadata(bytes, metadata) {
    if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return bytes;
    }

    const exifSegment = createJpegApp1Segment(createExifPayload(metadata));
    const xmpSegment = createJpegApp1Segment(concatUint8Arrays([
      encodeAscii(JPEG_XMP_IDENTIFIER),
      encodeUtf8(createXmpPacket(metadata)),
    ]));
    const segments = [exifSegment, xmpSegment].filter(Boolean);

    if (segments.length === 0) {
      return bytes;
    }

    return concatUint8Arrays([
      bytes.subarray(0, 2),
      ...segments,
      bytes.subarray(2),
    ]);
  }

  function createWebpChunk(type, data) {
    const chunk = new Uint8Array(8 + data.length + (data.length % 2));

    chunk.set(encodeAscii(type), 0);
    writeUint32Le(chunk, 4, data.length);
    chunk.set(data, 8);

    return chunk;
  }

  function getWebpChunkType(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function getWebpChunks(bytes) {
    const chunks = [];
    let offset = 12;

    while (offset + 8 <= bytes.length) {
      const type = getWebpChunkType(bytes, offset);
      const length = readUint32Le(bytes, offset + 4);
      const nextOffset = offset + 8 + length + (length % 2);

      if (nextOffset > bytes.length) {
        break;
      }

      chunks.push({ length, nextOffset, offset, type });
      offset = nextOffset;
    }

    return chunks;
  }

  function getWebpDimensions(bytes) {
    const chunks = getWebpChunks(bytes);

    for (const chunk of chunks) {
      const dataOffset = chunk.offset + 8;

      if (chunk.type === "VP8X" && chunk.length >= 10) {
        return {
          height: 1 + (bytes[dataOffset + 7] | (bytes[dataOffset + 8] << 8) | (bytes[dataOffset + 9] << 16)),
          width: 1 + (bytes[dataOffset + 4] | (bytes[dataOffset + 5] << 8) | (bytes[dataOffset + 6] << 16)),
        };
      }

      if (
        chunk.type === "VP8 " &&
        chunk.length >= 10 &&
        bytes[dataOffset + 3] === 0x9d &&
        bytes[dataOffset + 4] === 0x01 &&
        bytes[dataOffset + 5] === 0x2a
      ) {
        return {
          height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff,
          width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
        };
      }

      if (chunk.type === "VP8L" && chunk.length >= 5 && bytes[dataOffset] === 0x2f) {
        const bits = (
          bytes[dataOffset + 1] |
          (bytes[dataOffset + 2] << 8) |
          (bytes[dataOffset + 3] << 16) |
          (bytes[dataOffset + 4] << 24)
        ) >>> 0;

        return {
          height: ((bits >>> 14) & 0x3fff) + 1,
          width: (bits & 0x3fff) + 1,
        };
      }
    }

    return null;
  }

  function createWebpVp8xChunk(width, height, flags) {
    const data = new Uint8Array(10);

    data[0] = flags & 0xff;
    writeUint24Le(data, 4, Math.max(0, width - 1));
    writeUint24Le(data, 7, Math.max(0, height - 1));

    return createWebpChunk("VP8X", data);
  }

  function addWebpMetadata(bytes, metadata) {
    if (
      bytes.length < 12 ||
      String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF" ||
      String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== "WEBP"
    ) {
      return bytes;
    }

    const chunks = getWebpChunks(bytes);
    const xmpChunk = createWebpChunk("XMP ", encodeUtf8(createXmpPacket(metadata)));
    const vp8xChunk = chunks.find((chunk) => chunk.type === "VP8X");
    let output = bytes;

    if (vp8xChunk) {
      output = concatUint8Arrays([bytes, xmpChunk]);
      output[vp8xChunk.offset + 8] |= 0x04;
    } else {
      const dimensions = getWebpDimensions(bytes);

      if (!dimensions) {
        return bytes;
      }

      const hasAlphaChunk = chunks.some((chunk) => chunk.type === "ALPH" || chunk.type === "VP8L");
      const vp8x = createWebpVp8xChunk(dimensions.width, dimensions.height, 0x04 | (hasAlphaChunk ? 0x10 : 0));

      output = concatUint8Arrays([
        bytes.subarray(0, 12),
        vp8x,
        bytes.subarray(12),
        xmpChunk,
      ]);
    }

    writeUint32Le(output, 4, output.length - 8);

    return output;
  }

  async function applyRasterMetadata(blob, metadata, format) {
    if (!blob || !metadata || Object.keys(metadata).length === 0) {
      return blob;
    }

    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let output = bytes;

      if (format.mimeType === PNG_MIME_TYPE) {
        output = addPngMetadata(bytes, metadata);
      } else if (format.mimeType === JPEG_MIME_TYPE) {
        output = addJpegMetadata(bytes, metadata);
      } else if (format.mimeType === WEBP_MIME_TYPE) {
        output = addWebpMetadata(bytes, metadata);
      }

      return output === bytes ? blob : new Blob([output], { type: format.mimeType });
    } catch (error) {
      console.warn("Metadati export non scritti.", error);
      return blob;
    }
  }

  function downloadBlob(blob, filename) {
    if (!blob) {
      return false;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    return true;
  }

  async function exportArtboardRaster(artboard, options = {}) {
    const { gl, renderer } = assertRendererReady();
    const rect = artboard?.rect || normalizeArtboardRect(artboard);
    const format = getExportFormat(options.format);
    const includeBackground = format.supportsTransparency ? options.includeBackground === true : true;
    const quality = normalizeRasterQuality(options.quality, DEFAULT_RASTER_QUALITY);
    const scale = normalizeExportScale(options.scale, DEFAULT_EXPORT_SCALE);

    if (!rect) {
      throw new Error("Artboard non valida per export.");
    }

    const exportWidth = normalizePositiveInt(rect.width * scale, rect.width);
    const exportHeight = normalizePositiveInt(rect.height * scale, rect.height);
    const target = createExportRenderTarget(gl, exportWidth, exportHeight);

    try {
      renderer.drawToCanvas({
        allowPreviewCache: false,
        camera: { x: -rect.x * scale, y: -rect.y * scale, zoom: scale },
        clearColor: includeBackground ? PAPER_CLEAR_COLOR : null,
        framebuffer: target.framebuffer,
        skipBackgroundLayers: !includeBackground,
        transparentBackground: !includeBackground,
        viewportHeight: exportHeight,
        viewportWidth: exportWidth,
      });

      const canvas = createCanvasFromFramebuffer(gl, target, {
        unpremultiplyAlpha: !includeBackground,
      });
      const encodedBlob = canvas
        ? await canvasToBlob(canvas, format.mimeType, format.mimeType === PNG_MIME_TYPE ? undefined : quality)
        : null;
      const filename = getArtboardFileName(artboard, options.index, options);

      if (!encodedBlob) {
        throw new Error(`${format.label} non creato.`);
      }

      if (encodedBlob.type && encodedBlob.type !== format.mimeType) {
        throw new Error(`Formato ${format.label} non supportato da questo browser.`);
      }

      const metadata = buildExportMetadata(artboard, {
        ...options,
        format: format.key,
        height: exportHeight,
        scale,
        width: exportWidth,
      });
      const blob = await applyRasterMetadata(encodedBlob, metadata, format);

      if (options.download !== false) {
        downloadBlob(blob, filename);
      }

      return {
        artboardId: artboard.id || "",
        blob,
        filename,
        height: exportHeight,
        metadata,
        quality,
        scale,
        type: format.mimeType,
        width: exportWidth,
      };
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      destroyExportRenderTarget(gl, target);
      namespace.brushEngine?.requestDraw?.();
    }
  }

  async function exportArtboardPng(artboard, options = {}) {
    return exportArtboardRaster(artboard, {
      ...options,
      format: "png",
    });
  }

  async function exportDrawingArtboardsRaster(options = {}) {
    const allArtboards = getDrawingArtboards();
    const artboards = filterDrawingArtboards(allArtboards, options);
    const format = getExportFormat(options.format);
    const includeBackground = format.supportsTransparency ? options.includeBackground === true : true;
    const quality = normalizeRasterQuality(options.quality, DEFAULT_RASTER_QUALITY);
    const scale = normalizeExportScale(options.scale, DEFAULT_EXPORT_SCALE);
    const projectName = getExportProjectName();
    const results = [];

    if (artboards.length === 0) {
      return results;
    }

    window.dispatchEvent(new CustomEvent("cbo:document-export-start", {
      detail: {
        artboardCount: artboards.length,
        artboardSelection: options.artboardSelection || "all",
        format: format.key,
        includeBackground,
        quality,
        scale,
        source: options.source || "document-export",
        totalArtboardCount: allArtboards.length,
        type: format.mimeType,
      },
    }));

    for (let index = 0; index < artboards.length; index += 1) {
      const result = await exportArtboardRaster(artboards[index], {
        ...options,
        format: format.key,
        index: Number.isInteger(artboards[index].exportIndex) ? artboards[index].exportIndex : index,
        quality,
        projectName,
        scale,
      });

      results.push(result);
    }

    window.dispatchEvent(new CustomEvent("cbo:document-export-complete", {
      detail: {
        artboardCount: results.length,
        artboardSelection: options.artboardSelection || "all",
        format: format.key,
        includeBackground,
        results: results.map((result) => ({
          artboardId: result.artboardId,
          filename: result.filename,
          height: result.height,
          quality: result.quality,
          scale: result.scale,
          type: result.type,
          width: result.width,
        })),
        quality,
        scale,
        source: options.source || "document-export",
        totalArtboardCount: allArtboards.length,
        type: format.mimeType,
      },
    }));

    return results;
  }

  async function exportDrawingArtboardsPng(options = {}) {
    return exportDrawingArtboardsRaster({
      ...options,
      format: "png",
    });
  }

  namespace.documentExportSystem = {
    exportArtboardPng,
    exportArtboardRaster,
    exportDrawingArtboardsRaster,
    exportDrawingArtboardsPng,
    filterDrawingArtboards,
    getDrawingArtboards,
  };

  namespace.exportDrawingArtboardsRaster = exportDrawingArtboardsRaster;
  namespace.exportDrawingArtboardsPng = exportDrawingArtboardsPng;
})(window.CBO = window.CBO || {});
