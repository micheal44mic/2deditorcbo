const FILL_COVERAGE_MAX = 255;
const FILL_EDGE_AA_RADIUS = 1;
const MAX_FILL_TOLERANCE = 255;
const RLE_HEADER_BYTES = 4;
const RLE_RUN_BYTES = 6;
const RLE_MAX_RUN = 0xFFFF;
const RLE_PACKET_HEADER_BYTES = 2;
const RLE_PACKET_LITERAL_FLAG = 0x8000;
const RLE_PACKET_MAX_COUNT = 0x7FFF;
const RLE_PACKET_MIN_RUN = 3;
const RLE_V2_HEADER_BYTES = 8;
const RLE_V2_MAGIC_0 = 0x52;
const RLE_V2_MAGIC_1 = 0x4C;
const RLE_V2_MAGIC_2 = 0x45;
const RLE_V2_MAGIC_3 = 0x32;
const LEGACY_RLE_ENCODING = "rle-rgba-v1";
const RLE_ENCODING = "rle-rgba-v2";
const TILE_META_STRIDE = 8;
const TILE_META_X = 0;
const TILE_META_Y = 1;
const TILE_META_WIDTH = 2;
const TILE_META_HEIGHT = 3;
const TILE_META_TX = 4;
const TILE_META_TY = 5;
const TILE_META_PIXELS_OFFSET = 6;
const TILE_META_PIXELS_LENGTH = 7;
const DEFAULT_WASM_URL = "../../wasm/pixel_core.wasm";

const wasmCoreState = {
  error: null,
  exports: null,
  initMs: 0,
  instance: null,
  lastInitMs: 0,
  promise: null,
  status: "idle",
  unavailable: false,
};

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return t * t * (3 - 2 * t);
}

function getTopDownRgbaOffset(pixelIndex, width, height) {
  const y = Math.floor(pixelIndex / width);
  const x = pixelIndex - y * width;
  const webglY = height - 1 - y;

  return (webglY * width + x) * 4;
}

function pixelsMatchTolerance(pixels, offset, red, green, blue, alpha, toleranceSq) {
  const dr = pixels[offset] - red;
  const dg = pixels[offset + 1] - green;
  const db = pixels[offset + 2] - blue;
  const da = pixels[offset + 3] - alpha;

  return dr * dr + dg * dg + db * db + da * da <= toleranceSq;
}

function isUint8Array(value) {
  return value instanceof Uint8Array;
}

function trimCompressedBytes(output, byteLength) {
  if (!isUint8Array(output)) {
    return output;
  }

  const length = Math.max(0, Math.min(output.byteLength, Math.floor(Number(byteLength) || 0)));

  if (output.byteOffset === 0 && output.byteLength === length && output.buffer?.byteLength === length) {
    return output;
  }

  return output.slice(0, length);
}

function writeRleHeader(output, rawByteLength) {
  output[0] = rawByteLength & 0xFF;
  output[1] = (rawByteLength >>> 8) & 0xFF;
  output[2] = (rawByteLength >>> 16) & 0xFF;
  output[3] = (rawByteLength >>> 24) & 0xFF;
}

function writeRlePacketHeader(output, offset, value) {
  output[offset] = value & 0xFF;
  output[offset + 1] = (value >>> 8) & 0xFF;
}

function rlePixelsMatch(rawPixels, firstIndex, secondIndex) {
  return (
    rawPixels[firstIndex] === rawPixels[secondIndex] &&
    rawPixels[firstIndex + 1] === rawPixels[secondIndex + 1] &&
    rawPixels[firstIndex + 2] === rawPixels[secondIndex + 2] &&
    rawPixels[firstIndex + 3] === rawPixels[secondIndex + 3]
  );
}

function compressRgbaV1(rawPixels) {
  if (!isUint8Array(rawPixels)) {
    return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
  }

  const rawByteLength = rawPixels.byteLength;

  if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
    return { bytes: rawPixels, encoding: null, rawByteLength };
  }

  const maxOutput = RLE_HEADER_BYTES + (rawByteLength / 4) * RLE_RUN_BYTES;
  const output = new Uint8Array(maxOutput);

  writeRleHeader(output, rawByteLength);

  let outIdx = RLE_HEADER_BYTES;
  let i = 0;

  while (i < rawByteLength) {
    const r = rawPixels[i];
    const g = rawPixels[i + 1];
    const b = rawPixels[i + 2];
    const a = rawPixels[i + 3];
    let count = 1;
    let j = i + 4;

    while (
      j < rawByteLength &&
      count < RLE_MAX_RUN &&
      rawPixels[j] === r &&
      rawPixels[j + 1] === g &&
      rawPixels[j + 2] === b &&
      rawPixels[j + 3] === a
    ) {
      count += 1;
      j += 4;
    }

    if (outIdx + RLE_RUN_BYTES > rawByteLength) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    output[outIdx] = count & 0xFF;
    output[outIdx + 1] = (count >>> 8) & 0xFF;
    output[outIdx + 2] = r;
    output[outIdx + 3] = g;
    output[outIdx + 4] = b;
    output[outIdx + 5] = a;
    outIdx += RLE_RUN_BYTES;
    i = j;
  }

  if (outIdx >= rawByteLength) {
    return { bytes: rawPixels, encoding: null, rawByteLength };
  }

  return {
    bytes: trimCompressedBytes(output, outIdx),
    encoding: LEGACY_RLE_ENCODING,
    rawByteLength,
  };
}

function compressRgbaV2(rawPixels) {
  if (!isUint8Array(rawPixels)) {
    return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
  }

  const rawByteLength = rawPixels.byteLength;

  if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
    return { bytes: rawPixels, encoding: null, rawByteLength };
  }

  const pixelCount = rawByteLength / 4;
  const maxPackets = Math.ceil(pixelCount / RLE_PACKET_MAX_COUNT);
  const output = new Uint8Array(rawByteLength + RLE_V2_HEADER_BYTES + maxPackets * RLE_PACKET_HEADER_BYTES);
  let outIdx = RLE_V2_HEADER_BYTES;
  let pixelIndex = 0;
  let literalStart = 0;
  let literalCount = 0;

  const returnRaw = () => ({ bytes: rawPixels, encoding: null, rawByteLength });

  writeRleHeader(output, rawByteLength);
  output[4] = RLE_V2_MAGIC_0;
  output[5] = RLE_V2_MAGIC_1;
  output[6] = RLE_V2_MAGIC_2;
  output[7] = RLE_V2_MAGIC_3;

  const hasCompressionBudget = (byteCount) => outIdx + byteCount < rawByteLength;

  const flushLiteral = () => {
    let remaining = literalCount;
    let start = literalStart;

    while (remaining > 0) {
      const chunk = Math.min(remaining, RLE_PACKET_MAX_COUNT);
      const sourceStart = start * 4;
      const sourceEnd = sourceStart + chunk * 4;
      const packetBytes = RLE_PACKET_HEADER_BYTES + chunk * 4;

      if (!hasCompressionBudget(packetBytes)) {
        return false;
      }

      writeRlePacketHeader(output, outIdx, RLE_PACKET_LITERAL_FLAG | chunk);
      outIdx += RLE_PACKET_HEADER_BYTES;
      output.set(rawPixels.subarray(sourceStart, sourceEnd), outIdx);
      outIdx += chunk * 4;
      start += chunk;
      remaining -= chunk;
    }

    literalStart = pixelIndex;
    literalCount = 0;
    return true;
  };

  const writeRun = (startPixel, count) => {
    let remaining = count;
    const sourceStart = startPixel * 4;

    while (remaining > 0) {
      const chunk = Math.min(remaining, RLE_PACKET_MAX_COUNT);

      if (!hasCompressionBudget(RLE_PACKET_HEADER_BYTES + 4)) {
        return false;
      }

      writeRlePacketHeader(output, outIdx, chunk);
      outIdx += RLE_PACKET_HEADER_BYTES;
      output[outIdx] = rawPixels[sourceStart];
      output[outIdx + 1] = rawPixels[sourceStart + 1];
      output[outIdx + 2] = rawPixels[sourceStart + 2];
      output[outIdx + 3] = rawPixels[sourceStart + 3];
      outIdx += 4;
      remaining -= chunk;
    }

    return true;
  };

  while (pixelIndex < pixelCount) {
    const byteIndex = pixelIndex * 4;
    let runCount = 1;

    while (
      pixelIndex + runCount < pixelCount &&
      runCount < RLE_PACKET_MAX_COUNT &&
      rlePixelsMatch(rawPixels, byteIndex, (pixelIndex + runCount) * 4)
    ) {
      runCount += 1;
    }

    if (runCount >= RLE_PACKET_MIN_RUN) {
      if (!flushLiteral() || !writeRun(pixelIndex, runCount)) {
        return returnRaw();
      }
      pixelIndex += runCount;
      literalStart = pixelIndex;
      continue;
    }

    literalCount += runCount;
    pixelIndex += runCount;

    if (literalCount >= RLE_PACKET_MAX_COUNT && !flushLiteral()) {
      return returnRaw();
    }
  }

  if (!flushLiteral() || outIdx >= rawByteLength) {
    return returnRaw();
  }

  return {
    bytes: trimCompressedBytes(output, outIdx),
    encoding: RLE_ENCODING,
    rawByteLength,
  };
}

function chooseBestCompression(rawPixels, candidates) {
  return candidates.reduce(
    (best, candidate) => {
      if (!candidate?.encoding || !(candidate.bytes instanceof Uint8Array)) {
        return best;
      }

      if (candidate.bytes.byteLength >= best.bytes.byteLength) {
        return best;
      }

      return candidate;
    },
    { bytes: rawPixels, encoding: null, rawByteLength: rawPixels?.byteLength || 0 },
  );
}

function compressRgba(rawPixels) {
  if (!isUint8Array(rawPixels)) {
    return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
  }

  const rawByteLength = rawPixels.byteLength;

  if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
    return { bytes: rawPixels, encoding: null, rawByteLength };
  }

  return chooseBestCompression(rawPixels, [
    compressRgbaV1(rawPixels),
    compressRgbaV2(rawPixels),
  ]);
}

function floorDiv(value, divisor) {
  const quotient = Math.trunc(value / divisor);
  const remainder = value % divisor;

  return remainder !== 0 && ((remainder < 0) !== (divisor < 0))
    ? quotient - 1
    : quotient;
}

function normalizeFillInput(payload = {}) {
  const width = Math.max(1, Math.round(Number(payload.width) || 1));
  const height = Math.max(1, Math.round(Number(payload.height) || 1));
  const seedX = Math.floor(Number(payload.seedX) || 0);
  const seedY = Math.floor(Number(payload.seedY) || 0);
  const tolerance = clamp(payload.tolerance, 0, MAX_FILL_TOLERANCE);
  const sourceEmpty = payload.sourceEmpty === true;
  const sourceSparse = payload.sourceSparse === true;

  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
    return null;
  }

  return {
    height,
    originX: Math.round(Number(payload.originX) || 0),
    originY: Math.round(Number(payload.originY) || 0),
    seedX,
    seedY,
    sourceEmpty,
    sourceSparse,
    tolerance,
    width,
  };
}

function floodFillMaskDense(pixels, width, height, seedX, seedY, tolerance) {
  const pixelCount = width * height;
  const seedIndex = seedY * width + seedX;
  const seedOffset = getTopDownRgbaOffset(seedIndex, width, height);
  const seedR = pixels[seedOffset];
  const seedG = pixels[seedOffset + 1];
  const seedB = pixels[seedOffset + 2];
  const seedA = pixels[seedOffset + 3];
  const toleranceSq = tolerance * tolerance;
  const mask = new Uint8Array(pixelCount);
  let stack = new Int32Array(Math.max(1, Math.min(4096, pixelCount)));
  let stackPtr = 0;
  let maxStackCapacity = stack.length;
  let filledCount = 0;
  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;

  const pushPixel = (pixelIndex) => {
    if (mask[pixelIndex] !== 0) {
      return;
    }

    if (stackPtr >= stack.length) {
      const nextLength = Math.min(pixelCount, Math.max(stack.length * 2, stackPtr + 1));
      const nextStack = new Int32Array(nextLength);

      nextStack.set(stack);
      stack = nextStack;
      maxStackCapacity = Math.max(maxStackCapacity, stack.length);
    }

    mask[pixelIndex] = 1;
    stack[stackPtr] = pixelIndex;
    stackPtr += 1;
  };

  pushPixel(seedIndex);

  while (stackPtr > 0) {
    stackPtr -= 1;

    const index = stack[stackPtr];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const offset = getTopDownRgbaOffset(index, width, height);

    if (!pixelsMatchTolerance(pixels, offset, seedR, seedG, seedB, seedA, toleranceSq)) {
      continue;
    }

    mask[index] = 2;
    filledCount += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    if (x + 1 < width && mask[index + 1] === 0) {
      pushPixel(index + 1);
    }

    if (x > 0 && mask[index - 1] === 0) {
      pushPixel(index - 1);
    }

    if (y + 1 < height && mask[index + width] === 0) {
      pushPixel(index + width);
    }

    if (y > 0 && mask[index - width] === 0) {
      pushPixel(index - width);
    }
  }

  if (filledCount <= 0) {
    return null;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = mask[index] === 2 ? 1 : 0;
  }

  return {
    bounds: { maxX, maxY, minX, minY },
    filledCount,
    mask,
    stackBytes: maxStackCapacity * Int32Array.BYTES_PER_ELEMENT,
  };
}

function createSparseSource(payload = {}) {
  const tileSize = Math.max(1, Math.round(Number(payload.tileSize) || 1));
  const rawTiles = Array.isArray(payload.sparseTiles) ? payload.sparseTiles : [];
  const tiles = [];
  let minTx = Infinity;
  let minTy = Infinity;
  let maxTx = -Infinity;
  let maxTy = -Infinity;

  rawTiles.forEach((tile) => {
    if (!tile?.pixelsBuffer) {
      return;
    }

    const x = Math.round(Number(tile.x) || 0);
    const y = Math.round(Number(tile.y) || 0);
    const width = Math.max(1, Math.round(Number(tile.width) || 1));
    const height = Math.max(1, Math.round(Number(tile.height) || 1));
    const tx = Number.isFinite(Number(tile.tx)) ? Math.round(Number(tile.tx)) : floorDiv(x, tileSize);
    const ty = Number.isFinite(Number(tile.ty)) ? Math.round(Number(tile.ty)) : floorDiv(y, tileSize);
    const pixels = new Uint8Array(tile.pixelsBuffer);

    if (pixels.byteLength !== width * height * 4) {
      return;
    }

    minTx = Math.min(minTx, tx);
    minTy = Math.min(minTy, ty);
    maxTx = Math.max(maxTx, tx);
    maxTy = Math.max(maxTy, ty);
    tiles.push({
      height,
      pixels,
      pixelsLength: pixels.byteLength,
      tx,
      ty,
      width,
      x,
      y,
    });
  });

  if (!tiles.length || !Number.isFinite(minTx) || !Number.isFinite(minTy)) {
    return null;
  }

  const lookupWidth = maxTx - minTx + 1;
  const lookupHeight = maxTy - minTy + 1;
  const tileLookup = new Int32Array(lookupWidth * lookupHeight);

  tileLookup.fill(-1);

  tiles.forEach((tile, index) => {
    const lookupX = tile.tx - minTx;
    const lookupY = tile.ty - minTy;

    if (lookupX >= 0 && lookupY >= 0 && lookupX < lookupWidth && lookupY < lookupHeight) {
      tileLookup[lookupY * lookupWidth + lookupX] = index;
    }
  });

  return {
    lookupHeight,
    lookupOriginTx: minTx,
    lookupOriginTy: minTy,
    lookupWidth,
    tileLookup,
    tileSize,
    tiles,
  };
}

function getSparseTileIndex(source, documentX, documentY) {
  const tx = floorDiv(Math.floor(documentX), source.tileSize);
  const ty = floorDiv(Math.floor(documentY), source.tileSize);
  const lookupX = tx - source.lookupOriginTx;
  const lookupY = ty - source.lookupOriginTy;

  if (lookupX < 0 || lookupY < 0 || lookupX >= source.lookupWidth || lookupY >= source.lookupHeight) {
    return -1;
  }

  return source.tileLookup[lookupY * source.lookupWidth + lookupX];
}

function getSparsePixelOffset(source, documentX, documentY) {
  const tileIndex = getSparseTileIndex(source, documentX, documentY);

  if (tileIndex < 0) {
    return null;
  }

  const tile = source.tiles[tileIndex];
  const x = Math.floor(documentX);
  const y = Math.floor(documentY);
  const localX = x - tile.x;
  const localY = y - tile.y;

  if (localX < 0 || localY < 0 || localX >= tile.width || localY >= tile.height) {
    return null;
  }

  return {
    offset: getTopDownRgbaOffset(localY * tile.width + localX, tile.width, tile.height),
    pixels: tile.pixels,
  };
}

function getSparseChannel(source, documentX, documentY, channel) {
  const pixel = getSparsePixelOffset(source, documentX, documentY);

  return pixel?.pixels && pixel.offset >= 0 ? pixel.pixels[pixel.offset + channel] : 0;
}

function sparsePixelMatchesTolerance(source, documentX, documentY, red, green, blue, alpha, toleranceSq) {
  const dr = getSparseChannel(source, documentX, documentY, 0) - red;
  const dg = getSparseChannel(source, documentX, documentY, 1) - green;
  const db = getSparseChannel(source, documentX, documentY, 2) - blue;
  const da = getSparseChannel(source, documentX, documentY, 3) - alpha;

  return dr * dr + dg * dg + db * db + da * da <= toleranceSq;
}

function floodFillMaskSparse(source, width, height, seedX, seedY, tolerance, originX = 0, originY = 0) {
  const pixelCount = width * height;
  const seedIndex = seedY * width + seedX;
  const seedDocumentX = originX + seedX;
  const seedDocumentY = originY + seedY;
  const seedR = getSparseChannel(source, seedDocumentX, seedDocumentY, 0);
  const seedG = getSparseChannel(source, seedDocumentX, seedDocumentY, 1);
  const seedB = getSparseChannel(source, seedDocumentX, seedDocumentY, 2);
  const seedA = getSparseChannel(source, seedDocumentX, seedDocumentY, 3);
  const toleranceSq = tolerance * tolerance;
  const mask = new Uint8Array(pixelCount);
  let stack = new Int32Array(Math.max(1, Math.min(4096, pixelCount)));
  let stackPtr = 0;
  let maxStackCapacity = stack.length;
  let filledCount = 0;
  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;

  const pushPixel = (pixelIndex) => {
    if (mask[pixelIndex] !== 0) {
      return;
    }

    if (stackPtr >= stack.length) {
      const nextLength = Math.min(pixelCount, Math.max(stack.length * 2, stackPtr + 1));
      const nextStack = new Int32Array(nextLength);

      nextStack.set(stack);
      stack = nextStack;
      maxStackCapacity = Math.max(maxStackCapacity, stack.length);
    }

    mask[pixelIndex] = 1;
    stack[stackPtr] = pixelIndex;
    stackPtr += 1;
  };

  pushPixel(seedIndex);

  while (stackPtr > 0) {
    stackPtr -= 1;

    const index = stack[stackPtr];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const documentX = originX + x;
    const documentY = originY + y;

    if (!sparsePixelMatchesTolerance(source, documentX, documentY, seedR, seedG, seedB, seedA, toleranceSq)) {
      continue;
    }

    mask[index] = 2;
    filledCount += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    if (x + 1 < width && mask[index + 1] === 0) {
      pushPixel(index + 1);
    }

    if (x > 0 && mask[index - 1] === 0) {
      pushPixel(index - 1);
    }

    if (y + 1 < height && mask[index + width] === 0) {
      pushPixel(index + width);
    }

    if (y > 0 && mask[index - width] === 0) {
      pushPixel(index - width);
    }
  }

  if (filledCount <= 0) {
    return null;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = mask[index] === 2 ? 1 : 0;
  }

  return {
    bounds: { maxX, maxY, minX, minY },
    filledCount,
    mask,
    stackBytes: maxStackCapacity * Int32Array.BYTES_PER_ELEMENT,
  };
}

function createEmptySourceFillMask(width, height) {
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);

  mask.fill(1);

  return {
    bounds: {
      maxX: width - 1,
      maxY: height - 1,
      minX: 0,
      minY: 0,
    },
    filledCount: pixelCount,
    mask,
    stackBytes: 0,
  };
}

function getDilationRadius(tolerance) {
  const normalizedTolerance = clamp(tolerance, 0, MAX_FILL_TOLERANCE);

  if (normalizedTolerance < 16) {
    return 0;
  }

  return 1;
}

function createFillCoverageMask(mask, width, height, bounds, radius = 0) {
  const coverageMask = new Uint8Array(mask.length);
  const coverageRadius = Math.max(0, Math.floor(radius));
  const featherRadius = FILL_EDGE_AA_RADIUS + coverageRadius;
  const maxDistance = featherRadius + 0.5;
  const searchRadius = Math.ceil(maxDistance);
  const startX = Math.max(0, bounds.minX - searchRadius);
  const endX = Math.min(width - 1, bounds.maxX + searchRadius);
  const startY = Math.max(0, bounds.minY - searchRadius);
  const endY = Math.min(height - 1, bounds.maxY + searchRadius);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const index = y * width + x;

      if (mask[index] === 1) {
        coverageMask[index] = FILL_COVERAGE_MAX;
        continue;
      }

      let nearestFilledDistanceSq = Infinity;

      for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY += 1) {
        const sampleY = y + offsetY;

        if (sampleY < 0 || sampleY >= height) {
          continue;
        }

        for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += 1) {
          const sampleX = x + offsetX;

          if (sampleX < 0 || sampleX >= width) {
            continue;
          }

          if (mask[sampleY * width + sampleX] !== 1) {
            continue;
          }

          const distanceSq = offsetX * offsetX + offsetY * offsetY;

          if (distanceSq < nearestFilledDistanceSq) {
            nearestFilledDistanceSq = distanceSq;
          }
        }
      }

      if (!Number.isFinite(nearestFilledDistanceSq)) {
        continue;
      }

      const nearestFilledDistance = Math.sqrt(nearestFilledDistanceSq);

      if (nearestFilledDistance > maxDistance) {
        continue;
      }

      const falloff = smoothstep(0.5, maxDistance, nearestFilledDistance);

      coverageMask[index] = clampByte(FILL_COVERAGE_MAX * (1 - falloff));
    }
  }

  return coverageMask;
}

function resolveWasmUrl(payload = {}) {
  const override = String(payload.wasmUrl || "").trim();
  const rawUrl = override || DEFAULT_WASM_URL;

  if (typeof URL === "function" && self?.location?.href) {
    return new URL(rawUrl, self.location.href).href;
  }

  return rawUrl;
}

async function instantiateWasmFromUrl(url) {
  if (typeof WebAssembly !== "object" || typeof fetch !== "function") {
    throw new Error("WebAssembly or fetch is unavailable in this Worker.");
  }

  const imports = { env: {} };

  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      const streamed = await WebAssembly.instantiateStreaming(fetch(url), imports);

      return streamed.instance || streamed;
    } catch (streamingError) {
      // Some servers do not serve .wasm as application/wasm. Fall back to bytes.
    }
  }

  const response = await fetch(url);

  if (!response?.ok) {
    throw new Error(`Unable to fetch pixel_core.wasm: ${response?.status || "unknown"}`);
  }

  const bytes = await response.arrayBuffer();
  const instantiated = await WebAssembly.instantiate(bytes, imports);

  return instantiated.instance || instantiated;
}

function validateWasmExports(exports) {
  const requiredFunctions = [
    "alloc",
    "free",
    "flood_fill_dense_rgba",
    "flood_fill_sparse_rgba",
  ];

  if (!exports?.memory || !(exports.memory.buffer instanceof ArrayBuffer)) {
    throw new Error("pixel_core.wasm does not export memory.");
  }

  requiredFunctions.forEach((name) => {
    if (typeof exports[name] !== "function") {
      throw new Error(`pixel_core.wasm missing export: ${name}`);
    }
  });
}

async function initWasmCore(payload = {}) {
  if (payload.disableWasm === true) {
    throw new Error("WASM disabled for this request.");
  }

  if (wasmCoreState.exports) {
    wasmCoreState.lastInitMs = 0;
    return wasmCoreState;
  }

  if (wasmCoreState.unavailable && !payload.wasmUrl) {
    throw wasmCoreState.error || new Error("WASM unavailable.");
  }

  if (!wasmCoreState.promise || payload.wasmUrl) {
    const startedAt = nowMs();
    const url = resolveWasmUrl(payload);

    wasmCoreState.status = "loading";
    wasmCoreState.lastInitMs = 0;
    wasmCoreState.promise = instantiateWasmFromUrl(url)
      .then((instance) => {
        const exports = instance.exports || {};

        validateWasmExports(exports);
        wasmCoreState.error = null;
        wasmCoreState.exports = exports;
        wasmCoreState.initMs = nowMs() - startedAt;
        wasmCoreState.instance = instance;
        wasmCoreState.lastInitMs = wasmCoreState.initMs;
        wasmCoreState.status = "ready";
        wasmCoreState.unavailable = false;

        return wasmCoreState;
      })
      .catch((error) => {
        wasmCoreState.error = error;
        wasmCoreState.exports = null;
        wasmCoreState.initMs = nowMs() - startedAt;
        wasmCoreState.instance = null;
        wasmCoreState.lastInitMs = wasmCoreState.initMs;
        wasmCoreState.status = "error";
        wasmCoreState.unavailable = !payload.wasmUrl;

        throw error;
      });
  }

  return wasmCoreState.promise;
}

function getWasmU8(exports) {
  return new Uint8Array(exports.memory.buffer);
}

function getWasmI32(exports) {
  return new Int32Array(exports.memory.buffer);
}

function wasmAlloc(exports, byteLength) {
  const size = Math.max(0, Math.round(Number(byteLength) || 0));
  const ptr = exports.alloc(size) >>> 0;

  if (size > 0 && ptr === 0) {
    throw new Error(`WASM alloc failed for ${size} bytes.`);
  }

  return ptr;
}

function wasmFree(exports, ptr, byteLength) {
  if (ptr) {
    exports.free(ptr >>> 0, Math.max(0, Math.round(Number(byteLength) || 0)) >>> 0);
  }
}

function reserveWasmStack(exports, pixelCount) {
  if (typeof exports.reserve_stack === "function") {
    const ok = exports.reserve_stack(Math.max(1, Math.round(Number(pixelCount) || 1))) | 0;

    if (ok === 0) {
      throw new Error("WASM flood stack reserve failed.");
    }
  }
}

function readWasmFillResult(exports, maskPtr, maskLength, outBoundsPtr) {
  const outIndex = outBoundsPtr >> 2;
  const out = getWasmI32(exports);
  const minX = out[outIndex];
  const minY = out[outIndex + 1];
  const maxX = out[outIndex + 2];
  const maxY = out[outIndex + 3];
  const filledCount = out[outIndex + 4];
  const stackBytes = out[outIndex + 5];
  const mask = new Uint8Array(maskLength);

  mask.set(getWasmU8(exports).subarray(maskPtr, maskPtr + maskLength));

  return {
    bounds: { maxX, maxY, minX, minY },
    filledCount,
    mask,
    stackBytes,
  };
}

function runWasmDense(exports, pixels, width, height, seedX, seedY, tolerance) {
  const pixelCount = width * height;
  const pixelsBytes = pixels.byteLength;
  const maskBytes = pixelCount;
  const outBoundsBytes = 6 * Int32Array.BYTES_PER_ELEMENT;
  let pixelsPtr = 0;
  let maskPtr = 0;
  let outBoundsPtr = 0;

  reserveWasmStack(exports, pixelCount);

  try {
    pixelsPtr = wasmAlloc(exports, pixelsBytes);
    maskPtr = wasmAlloc(exports, maskBytes);
    outBoundsPtr = wasmAlloc(exports, outBoundsBytes);
    getWasmU8(exports).set(pixels, pixelsPtr);

    const ok = exports.flood_fill_dense_rgba(
      pixelsPtr,
      width,
      height,
      seedX,
      seedY,
      tolerance,
      maskPtr,
      outBoundsPtr,
    ) | 0;

    if (ok === 0) {
      return null;
    }

    return readWasmFillResult(exports, maskPtr, maskBytes, outBoundsPtr);
  } finally {
    wasmFree(exports, outBoundsPtr, outBoundsBytes);
    wasmFree(exports, maskPtr, maskBytes);
    wasmFree(exports, pixelsPtr, pixelsBytes);
  }
}

function buildPackedSparseData(source) {
  let totalBytes = 0;

  source.tiles.forEach((tile) => {
    tile.pixelsOffset = totalBytes;
    tile.pixelsLength = tile.pixels.byteLength;
    totalBytes += tile.pixels.byteLength;
  });

  const tilePixels = new Uint8Array(totalBytes);
  const tileMeta = new Int32Array(source.tiles.length * TILE_META_STRIDE);

  source.tiles.forEach((tile, index) => {
    tilePixels.set(tile.pixels, tile.pixelsOffset);

    const metaOffset = index * TILE_META_STRIDE;

    tileMeta[metaOffset + TILE_META_X] = tile.x;
    tileMeta[metaOffset + TILE_META_Y] = tile.y;
    tileMeta[metaOffset + TILE_META_WIDTH] = tile.width;
    tileMeta[metaOffset + TILE_META_HEIGHT] = tile.height;
    tileMeta[metaOffset + TILE_META_TX] = tile.tx;
    tileMeta[metaOffset + TILE_META_TY] = tile.ty;
    tileMeta[metaOffset + TILE_META_PIXELS_OFFSET] = tile.pixelsOffset;
    tileMeta[metaOffset + TILE_META_PIXELS_LENGTH] = tile.pixelsLength;
  });

  return { tileMeta, tilePixels };
}

function runWasmSparse(exports, source, width, height, seedX, seedY, tolerance, originX, originY) {
  const pixelCount = width * height;
  const maskBytes = pixelCount;
  const outBoundsBytes = 6 * Int32Array.BYTES_PER_ELEMENT;
  const { tileMeta, tilePixels } = buildPackedSparseData(source);
  let tilePixelsPtr = 0;
  let tileMetaPtr = 0;
  let tileLookupPtr = 0;
  let maskPtr = 0;
  let outBoundsPtr = 0;

  reserveWasmStack(exports, pixelCount);

  try {
    tilePixelsPtr = wasmAlloc(exports, tilePixels.byteLength);
    tileMetaPtr = wasmAlloc(exports, tileMeta.byteLength);
    tileLookupPtr = wasmAlloc(exports, source.tileLookup.byteLength);
    maskPtr = wasmAlloc(exports, maskBytes);
    outBoundsPtr = wasmAlloc(exports, outBoundsBytes);

    getWasmU8(exports).set(tilePixels, tilePixelsPtr);
    getWasmI32(exports).set(tileMeta, tileMetaPtr >> 2);
    getWasmI32(exports).set(source.tileLookup, tileLookupPtr >> 2);

    const ok = exports.flood_fill_sparse_rgba(
      tilePixelsPtr,
      tileMetaPtr,
      source.tiles.length,
      tileLookupPtr,
      source.lookupWidth,
      source.lookupHeight,
      source.lookupOriginTx,
      source.lookupOriginTy,
      source.tileSize,
      originX,
      originY,
      width,
      height,
      seedX,
      seedY,
      tolerance,
      maskPtr,
      outBoundsPtr,
    ) | 0;

    if (ok === 0) {
      return null;
    }

    return readWasmFillResult(exports, maskPtr, maskBytes, outBoundsPtr);
  } finally {
    wasmFree(exports, outBoundsPtr, outBoundsBytes);
    wasmFree(exports, maskPtr, maskBytes);
    wasmFree(exports, tileLookupPtr, source.tileLookup.byteLength);
    wasmFree(exports, tileMetaPtr, tileMeta.byteLength);
    wasmFree(exports, tilePixelsPtr, tilePixels.byteLength);
  }
}

async function tryRunWasmFill(payload, input, pixels, sparseSource, timings) {
  if (input.sourceEmpty || payload.disableWasm === true) {
    return null;
  }

  const initStartedAt = nowMs();
  const core = await initWasmCore(payload);

  timings.wasmInitMs = core.lastInitMs || Math.max(0, nowMs() - initStartedAt);

  const wasmStartedAt = nowMs();
  const result = input.sourceSparse
    ? runWasmSparse(
        core.exports,
        sparseSource,
        input.width,
        input.height,
        input.seedX,
        input.seedY,
        input.tolerance,
        input.originX,
        input.originY,
      )
    : runWasmDense(
        core.exports,
        pixels,
        input.width,
        input.height,
        input.seedX,
        input.seedY,
        input.tolerance,
      );

  timings.wasmMs = nowMs() - wasmStartedAt;

  return result;
}

async function runColorFill(payload = {}) {
  const workerStartedAt = nowMs();
  const timings = {
    coverageMs: 0,
    jsMs: 0,
    wasmInitMs: 0,
    wasmMs: 0,
    workerMs: 0,
  };
  const input = normalizeFillInput(payload);

  if (!input) {
    return null;
  }

  const pixelCount = input.width * input.height;
  const pixels = input.sourceEmpty || input.sourceSparse
    ? null
    : new Uint8Array(payload.pixelsBuffer);
  const sparseSource = input.sourceSparse ? createSparseSource(payload) : null;

  if (
    (!input.sourceEmpty && !input.sourceSparse && pixels.byteLength !== pixelCount * 4) ||
    (input.sourceSparse && !sparseSource)
  ) {
    return null;
  }

  let fillResult = null;
  let engine = "js";
  let wasmError = "";

  try {
    fillResult = await tryRunWasmFill(payload, input, pixels, sparseSource, timings);
    if (fillResult) {
      engine = "wasm";
    }
  } catch (error) {
    wasmError = error?.message || String(error);
    engine = "js";
  }

  if (!fillResult) {
    const jsStartedAt = nowMs();

    fillResult = input.sourceEmpty
      ? createEmptySourceFillMask(input.width, input.height)
      : input.sourceSparse
        ? floodFillMaskSparse(
            sparseSource,
            input.width,
            input.height,
            input.seedX,
            input.seedY,
            input.tolerance,
            input.originX,
            input.originY,
          )
        : floodFillMaskDense(pixels, input.width, input.height, input.seedX, input.seedY, input.tolerance);
    timings.jsMs = nowMs() - jsStartedAt;
    engine = "js";
  }

  if (!fillResult) {
    timings.workerMs = nowMs() - workerStartedAt;

    return null;
  }

  const coverageStartedAt = nowMs();
  const coverageRadius = getDilationRadius(input.tolerance);
  const coverageMask = createFillCoverageMask(
    fillResult.mask,
    input.width,
    input.height,
    fillResult.bounds,
    coverageRadius,
  );

  timings.coverageMs = nowMs() - coverageStartedAt;
  timings.workerMs = nowMs() - workerStartedAt;

  return {
    bounds: fillResult.bounds,
    coverageMaskBuffer: coverageMask.buffer,
    engine,
    filledCount: fillResult.filledCount,
    maskBuffer: fillResult.mask.buffer,
    stackBytes: fillResult.stackBytes,
    timings,
    wasmError,
  };
}

async function runHistoryCompress(payload = {}) {
  const workerStartedAt = nowMs();
  const timings = {
    compressMs: 0,
    jsMs: 0,
    workerMs: 0,
  };
  const pixels = payload?.pixelsBuffer ? new Uint8Array(payload.pixelsBuffer) : null;

  if (!(pixels instanceof Uint8Array) || pixels.byteLength === 0 || pixels.byteLength % 4 !== 0) {
    timings.workerMs = nowMs() - workerStartedAt;

    return null;
  }

  const rawBytes = Math.max(0, Math.round(Number(payload.rawBytes) || pixels.byteLength));
  const compressStartedAt = nowMs();
  const result = compressRgba(pixels);

  timings.compressMs = nowMs() - compressStartedAt;
  timings.jsMs = timings.compressMs;
  timings.workerMs = nowMs() - workerStartedAt;

  if (
    !result?.encoding ||
    !(result.bytes instanceof Uint8Array) ||
    result.bytes.byteLength >= pixels.byteLength
  ) {
    return {
      compressedBuffer: null,
      compressedBytes: pixels.byteLength,
      encoding: "",
      engine: "js",
      historyId: payload.historyId || "",
      jobToken: payload.jobToken || "",
      kind: payload.kind || "",
      layerId: payload.layerId || "",
      rawBytes,
      source: payload.source || "",
      timings,
    };
  }

  return {
    compressedBuffer: result.bytes.buffer,
    compressedBytes: result.bytes.byteLength,
    encoding: result.encoding,
    engine: "js",
    historyId: payload.historyId || "",
    jobToken: payload.jobToken || "",
    kind: payload.kind || "",
    layerId: payload.layerId || "",
    rawBytes: result.rawByteLength || rawBytes,
    source: payload.source || "",
    timings,
  };
}

async function handleMessage(message = {}) {
  if (message.type === "color-fill") {
    const result = await runColorFill(message.payload || {});
    const transferList = result
      ? [result.maskBuffer, result.coverageMaskBuffer]
      : [];

    self.postMessage({
      id: message.id,
      ok: true,
      result,
    }, transferList);
    return;
  }

  if (message.type === "history-compress") {
    const result = await runHistoryCompress(message.payload || {});
    const transferList = result?.compressedBuffer ? [result.compressedBuffer] : [];

    self.postMessage({
      id: message.id,
      ok: true,
      result,
    }, transferList);
    return;
  }

  self.postMessage({
    error: `Unknown pixel worker operation: ${message.type}`,
    id: message.id,
    ok: false,
  });
}

self.onmessage = (event) => {
  const message = event.data || {};

  handleMessage(message).catch((error) => {
    self.postMessage({
      error: error?.message || String(error),
      id: message.id,
      ok: false,
    });
  });
};

self.__pixelWorkerTestHooks = Object.freeze({
  buildPackedSparseData,
  compressRgba,
  createFillCoverageMask,
  createSparseSource,
  floodFillMaskDense,
  floodFillMaskSparse,
  getSparseTileIndex,
  initWasmCore,
  runColorFill,
  runHistoryCompress,
});
