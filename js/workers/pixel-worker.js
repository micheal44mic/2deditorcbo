const FILL_COVERAGE_MAX = 255;
const FILL_EDGE_AA_RADIUS = 1;
const MAX_FILL_TOLERANCE = 255;

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

function createSparseSource(payload = {}) {
  const tileSize = Math.max(1, Math.round(Number(payload.tileSize) || 1));
  const tileMap = new Map();

  if (!Array.isArray(payload.sparseTiles)) {
    return null;
  }

  payload.sparseTiles.forEach((tile) => {
    if (!tile?.pixelsBuffer) {
      return;
    }

    const x = Math.round(Number(tile.x) || 0);
    const y = Math.round(Number(tile.y) || 0);
    const width = Math.max(1, Math.round(Number(tile.width) || 1));
    const height = Math.max(1, Math.round(Number(tile.height) || 1));
    const tx = Number.isFinite(tile.tx) ? Math.round(tile.tx) : Math.floor(x / tileSize);
    const ty = Number.isFinite(tile.ty) ? Math.round(tile.ty) : Math.floor(y / tileSize);
    const pixels = new Uint8Array(tile.pixelsBuffer);

    if (pixels.byteLength !== width * height * 4) {
      return;
    }

    tileMap.set(`${tx}:${ty}`, {
      height,
      pixels,
      width,
      x,
      y,
    });
  });

  return tileMap.size > 0
    ? {
        tileMap,
        tileSize,
      }
    : null;
}

function getSparsePixelOffset(source, documentX, documentY) {
  const x = Math.floor(documentX);
  const y = Math.floor(documentY);
  const tx = Math.floor(x / source.tileSize);
  const ty = Math.floor(y / source.tileSize);
  const tile = source.tileMap.get(`${tx}:${ty}`);

  if (!tile) {
    return null;
  }

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

function runColorFill(payload = {}) {
  const width = Math.max(1, Math.round(Number(payload.width) || 1));
  const height = Math.max(1, Math.round(Number(payload.height) || 1));
  const seedX = Math.floor(Number(payload.seedX) || 0);
  const seedY = Math.floor(Number(payload.seedY) || 0);
  const tolerance = clamp(payload.tolerance, 0, MAX_FILL_TOLERANCE);
  const sourceEmpty = payload.sourceEmpty === true;
  const sourceSparse = payload.sourceSparse === true;
  const pixels = sourceEmpty || sourceSparse ? null : new Uint8Array(payload.pixelsBuffer);
  const sparseSource = sourceSparse ? createSparseSource(payload) : null;

  if (
    (!sourceEmpty && !sourceSparse && pixels.byteLength !== width * height * 4) ||
    (sourceSparse && !sparseSource) ||
    seedX < 0 ||
    seedY < 0 ||
    seedX >= width ||
    seedY >= height
  ) {
    return null;
  }

  const fillResult = sourceEmpty
    ? createEmptySourceFillMask(width, height)
    : sourceSparse
      ? floodFillMaskSparse(
          sparseSource,
          width,
          height,
          seedX,
          seedY,
          tolerance,
          Math.round(Number(payload.originX) || 0),
          Math.round(Number(payload.originY) || 0),
        )
      : floodFillMaskDense(pixels, width, height, seedX, seedY, tolerance);

  if (!fillResult) {
    return null;
  }

  const coverageRadius = getDilationRadius(tolerance);
  const coverageMask = createFillCoverageMask(
    fillResult.mask,
    width,
    height,
    fillResult.bounds,
    coverageRadius,
  );

  return {
    bounds: fillResult.bounds,
    coverageMaskBuffer: coverageMask.buffer,
    filledCount: fillResult.filledCount,
    maskBuffer: fillResult.mask.buffer,
    stackBytes: fillResult.stackBytes,
  };
}

self.onmessage = (event) => {
  const message = event.data || {};

  try {
    if (message.type === "color-fill") {
      const result = runColorFill(message.payload);
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

    self.postMessage({
      error: `Unknown pixel worker operation: ${message.type}`,
      id: message.id,
      ok: false,
    });
  } catch (error) {
    self.postMessage({
      error: error?.message || String(error),
      id: message.id,
      ok: false,
    });
  }
};
