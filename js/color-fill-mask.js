(function registerColorFillMaskModule(namespace) {
  namespace.ColorFillModules = namespace.ColorFillModules || {};

  namespace.ColorFillModules.mask = function installColorFillMaskModule(context) {
    const {
      FILL_COVERAGE_MAX,
      FILL_EDGE_AA_RADIUS,
      MAX_FILL_TOLERANCE,
      clamp,
      getReferenceChannel,
      getReferenceDocumentRect,
      getReferencePixelOffset,
    } = context;

  function colorDistanceSq(referenceSource, documentX, documentY, red, green, blue, alpha) {
    const offset = getReferencePixelOffset(referenceSource, documentX, documentY);
    const dr = getReferenceChannel(referenceSource, offset, 0) - red;
    const dg = getReferenceChannel(referenceSource, offset, 1) - green;
    const db = getReferenceChannel(referenceSource, offset, 2) - blue;
    const da = getReferenceChannel(referenceSource, offset, 3) - alpha;

    return dr * dr + dg * dg + db * db + da * da;
  }

  function floodFillMask(referenceSource, width, height, seedX, seedY, tolerance, originX = 0, originY = 0, options = {}) {
    const selectionContains = typeof options.selectionContains === "function"
      ? options.selectionContains
      : null;
    const pixelCount = width * height;
    const seedIndex = seedY * width + seedX;
    const seedOffset = getReferencePixelOffset(referenceSource, originX + seedX, originY + seedY);
    const seedR = getReferenceChannel(referenceSource, seedOffset, 0);
    const seedG = getReferenceChannel(referenceSource, seedOffset, 1);
    const seedB = getReferenceChannel(referenceSource, seedOffset, 2);
    const seedA = getReferenceChannel(referenceSource, seedOffset, 3);
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

      if (selectionContains) {
        const y = Math.floor(pixelIndex / width);
        const x = pixelIndex - y * width;

        if (!selectionContains(originX + x, originY + y)) {
          return;
        }
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

      if (colorDistanceSq(referenceSource, documentX, documentY, seedR, seedG, seedB, seedA) > toleranceSq) {
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

  function dilateMask(mask, width, height, bounds, radius = 1) {
    const dilationRadius = Math.max(0, Math.floor(radius));

    if (dilationRadius <= 0) {
      return mask;
    }

    const expandedMask = new Uint8Array(mask.length);
    const startX = Math.max(0, bounds.minX);
    const endX = Math.min(width - 1, bounds.maxX);
    const startY = Math.max(0, bounds.minY);
    const endY = Math.min(height - 1, bounds.maxY);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const index = y * width + x;

        if (mask[index] !== 1) {
          continue;
        }

        expandedMask[index] = 1;

        if (x > 0) {
          expandedMask[index - 1] = 1;
        }

        if (x < width - 1) {
          expandedMask[index + 1] = 1;
        }

        if (y > 0) {
          expandedMask[index - width] = 1;
        }

        if (y < height - 1) {
          expandedMask[index + width] = 1;
        }
      }
    }

    return expandedMask;
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

  function getFillCoveragePadding(tolerance) {
    return FILL_EDGE_AA_RADIUS + getDilationRadius(tolerance);
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

  function createDirtyRect(bounds, width, height, padding = FILL_EDGE_AA_RADIUS) {
    const safePadding = Math.max(0, Math.ceil(padding));
    const x = Math.max(0, bounds.minX - safePadding);
    const y = Math.max(0, bounds.minY - safePadding);
    const right = Math.min(width - 1, bounds.maxX + safePadding);
    const bottom = Math.min(height - 1, bounds.maxY + safePadding);

    return {
      height: bottom - y + 1,
      width: right - x + 1,
      x,
      y,
    };
  }

  function readTargetDirtyPixels(gl, target, dirtyRect) {
    const pixels = new Uint8Array(dirtyRect.width * dirtyRect.height * 4);
    const targetRect = getReferenceDocumentRect(target, target.width, target.height);
    const textureX = dirtyRect.x - targetRect.x;
    const textureYTopDown = dirtyRect.y - targetRect.y;
    const readY = target.height - (textureYTopDown + dirtyRect.height);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
    gl.readPixels(
      textureX,
      readY,
      dirtyRect.width,
      dirtyRect.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    return {
      pixels,
      textureX,
      textureY: readY,
    };
  }

  function compositeFillPixelPremultiplied(targetPixels, offset, fillColor, coverageByte) {
    const coverage = clamp(coverageByte / FILL_COVERAGE_MAX, 0, 1);

    if (coverage <= 0) {
      return;
    }

    const sourceAlpha = (fillColor.a / 255) * coverage;
    const inverseSourceAlpha = 1 - sourceAlpha;
    const sourceR = (fillColor.r / 255) * sourceAlpha;
    const sourceG = (fillColor.g / 255) * sourceAlpha;
    const sourceB = (fillColor.b / 255) * sourceAlpha;
    const destR = targetPixels[offset] / 255;
    const destG = targetPixels[offset + 1] / 255;
    const destB = targetPixels[offset + 2] / 255;
    const destA = targetPixels[offset + 3] / 255;
    const outA = sourceAlpha + destA * inverseSourceAlpha;
    const outR = sourceR + destR * inverseSourceAlpha;
    const outG = sourceG + destG * inverseSourceAlpha;
    const outB = sourceB + destB * inverseSourceAlpha;

    targetPixels[offset] = clampByte(outR * 255);
    targetPixels[offset + 1] = clampByte(outG * 255);
    targetPixels[offset + 2] = clampByte(outB * 255);
    targetPixels[offset + 3] = clampByte(outA * 255);
  }

  function getFillMaskMemoryBytes(fillResult, coverageMask) {
    return (
      (fillResult?.mask?.byteLength || 0) +
      (coverageMask?.byteLength || 0) +
      (fillResult?.stackBytes || 0)
    );
  }

  function applyFillToDirtyPixels(
    targetPixels,
    coverageMask,
    dirtyRect,
    documentWidth,
    fillColor,
    maskOriginX = 0,
    maskOriginY = 0,
    maskWidth = documentWidth,
    selectionContains = null,
  ) {
    for (let row = 0; row < dirtyRect.height; row += 1) {
      const docY = dirtyRect.y + dirtyRect.height - 1 - row;

      for (let col = 0; col < dirtyRect.width; col += 1) {
        const docX = dirtyRect.x + col;
        const maskX = docX - maskOriginX;
        const maskY = docY - maskOriginY;
        const coverageByte = maskX >= 0 && maskY >= 0
          ? coverageMask[maskY * maskWidth + maskX]
          : 0;

        if (coverageByte <= 0) {
          continue;
        }

        if (selectionContains && !selectionContains(docX, docY)) {
          continue;
        }

        const offset = (row * dirtyRect.width + col) * 4;

        compositeFillPixelPremultiplied(targetPixels, offset, fillColor, coverageByte);
      }
    }
  }

    return {
      colorDistanceSq,
      floodFillMask,
      getDilationRadius,
      dilateMask,
      clampByte,
      smoothstep,
      getFillCoveragePadding,
      createFillCoverageMask,
      createDirtyRect,
      readTargetDirtyPixels,
      compositeFillPixelPremultiplied,
      getFillMaskMemoryBytes,
      applyFillToDirtyPixels,
    };
  };
})(window.CBO = window.CBO || {});
