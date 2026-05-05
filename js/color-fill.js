(function registerColorFill(namespace) {
  const DEFAULT_FILL_TOLERANCE = 48;
  const MAX_FILL_TOLERANCE = 255;
  const FILL_COVERAGE_MAX = 255;
  const FILL_EDGE_AA_RADIUS = 1;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const THRESHOLD_HIDE_DELAY_MS = 1400;
  const FILL_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });

  let fillTolerance = clamp(
    Number.isFinite(Number(namespace.colorFillTolerance))
      ? Number(namespace.colorFillTolerance)
      : DEFAULT_FILL_TOLERANCE,
    0,
    MAX_FILL_TOLERANCE,
  );
  let thresholdToolbar = null;
  let thresholdInput = null;
  let thresholdValue = null;
  let thresholdHideTimer = null;
  let referenceLayerId = String(namespace.colorFillReferenceLayerId || "").trim();

  function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  function parseHexColor(hex) {
    const value = String(hex || "#FFFFFF").trim().replace("#", "");
    const normalized = value.length === 3
      ? value.split("").map((char) => char + char).join("")
      : value.padEnd(6, "F").slice(0, 6);
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);

    return {
      a: 255,
      b: Number.isFinite(blue) ? blue : 255,
      g: Number.isFinite(green) ? green : 255,
      r: Number.isFinite(red) ? red : 255,
    };
  }

  function getRasterRectBytes(rectOrWidth, height = null) {
    const width = typeof rectOrWidth === "object"
      ? rectOrWidth?.width
      : rectOrWidth;
    const resolvedHeight = typeof rectOrWidth === "object"
      ? rectOrWidth?.height
      : height;

    return Math.max(0, Math.round(Number(width) || 0)) *
      Math.max(0, Math.round(Number(resolvedHeight) || 0)) *
      RASTER_BYTES_PER_PIXEL;
  }

  function getRectCoverage(rect, width, height) {
    const documentPixels = Math.max(0, Math.round(width || 0)) * Math.max(0, Math.round(height || 0));

    if (documentPixels <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, ((rect?.width || 0) * (rect?.height || 0)) / documentPixels));
  }

  function classifyFillMemory(renderer, estimatedPeakBytes, coverage) {
    if (typeof renderer?.classifyRasterOperationMemory === "function") {
      return renderer.classifyRasterOperationMemory(estimatedPeakBytes, coverage);
    }

    if (estimatedPeakBytes > FILL_MEMORY_POLICY.largeMaxBytes || coverage >= FILL_MEMORY_POLICY.hugeCoverage) {
      return "huge";
    }

    if (estimatedPeakBytes > FILL_MEMORY_POLICY.mediumMaxBytes) {
      return "large";
    }

    if (estimatedPeakBytes > FILL_MEMORY_POLICY.normalMaxBytes) {
      return "medium";
    }

    return "normal";
  }

  function setTolerance(value) {
    fillTolerance = Math.round(clamp(value, 0, MAX_FILL_TOLERANCE));
    namespace.colorFillTolerance = fillTolerance;
    updateThresholdToolbar();

    return fillTolerance;
  }

  function getTolerance() {
    return fillTolerance;
  }

  function updateThresholdToolbar() {
    if (!thresholdInput || !thresholdValue) {
      return;
    }

    const progress = (fillTolerance / MAX_FILL_TOLERANCE) * 100;

    thresholdInput.value = String(fillTolerance);
    thresholdInput.style.setProperty("--color-fill-threshold-progress", `${progress}%`);
    thresholdValue.textContent = String(fillTolerance);
  }

  function ensureThresholdToolbar() {
    if (thresholdToolbar) {
      return thresholdToolbar;
    }

    const host = document.querySelector(".editor-page") || document.body;

    thresholdToolbar = document.createElement("label");
    thresholdToolbar.className = "bottom-toolbar color-fill-threshold-toolbar";
    thresholdToolbar.hidden = true;
    thresholdToolbar.innerHTML = `
      <span class="color-fill-threshold-label">THRESHOLD</span>
      <input class="color-fill-threshold-range" type="range" min="0" max="${MAX_FILL_TOLERANCE}" step="1" aria-label="Color fill threshold" />
      <span class="color-fill-threshold-value"></span>
    `;

    thresholdInput = thresholdToolbar.querySelector(".color-fill-threshold-range");
    thresholdValue = thresholdToolbar.querySelector(".color-fill-threshold-value");

    thresholdInput?.addEventListener("input", () => {
      setTolerance(thresholdInput.value);
      showThresholdControl();
    });

    ["pointerdown", "pointermove", "pointerup", "click"].forEach((eventName) => {
      thresholdToolbar.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    });

    host.appendChild(thresholdToolbar);
    updateThresholdToolbar();

    return thresholdToolbar;
  }

  function showThresholdControl() {
    const toolbar = ensureThresholdToolbar();

    window.clearTimeout(thresholdHideTimer);
    toolbar.hidden = false;
    toolbar.classList.add("visible");
    updateThresholdToolbar();
  }

  function hideThresholdControl(delay = THRESHOLD_HIDE_DELAY_MS) {
    if (!thresholdToolbar) {
      return;
    }

    window.clearTimeout(thresholdHideTimer);
    thresholdHideTimer = window.setTimeout(() => {
      thresholdToolbar?.classList.remove("visible");
      if (thresholdToolbar) {
        thresholdToolbar.hidden = true;
      }
    }, Math.max(0, delay));
  }

  function beginDropDrag() {
    showThresholdControl();
  }

  function endDropDrag() {
    hideThresholdControl();
  }

  function cancelDropDrag() {
    hideThresholdControl(0);
  }

  function getReferenceLayerId() {
    return referenceLayerId;
  }

  function emitReferenceChange(source = "color-fill-reference") {
    window.dispatchEvent(new CustomEvent("cbo:color-fill-reference-change", {
      detail: {
        layerId: referenceLayerId || null,
        source,
      },
    }));
  }

  function setReferenceLayerId(layerId, options = {}) {
    const previousLayerId = referenceLayerId;
    const nextLayerId = String(layerId || "").trim();

    referenceLayerId = nextLayerId;
    namespace.colorFillReferenceLayerId = nextLayerId;

    if (previousLayerId !== nextLayerId && options.history !== false) {
      namespace.documentHistory?.recordReferenceStateChange?.(previousLayerId, nextLayerId, {
        historyGroup: options.historyGroup || "",
        source: options.source || "set-reference-layer",
      });
    }

    if (options.emit !== false) {
      emitReferenceChange(options.source || "set-reference-layer");
    }

    return referenceLayerId;
  }

  function clearReferenceLayerId(options = {}) {
    return setReferenceLayerId("", {
      ...options,
      source: options.source || "clear-reference-layer",
    });
  }

  function getWritableLayerTarget() {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;

    if (!layerModel || !renderer?.getRasterTarget) {
      return null;
    }

    const activeId = layerModel.activeLayerId;
    const activeLayer = activeId ? layerModel.findEntryById?.(activeId) : null;
    const canWriteActiveLayer =
      activeLayer &&
      activeLayer.locked !== true &&
      (activeLayer.type === "paint" || activeLayer.type === "image");

    if (canWriteActiveLayer) {
      const existingTarget = renderer.rasterTargetsByLayerId?.get?.(activeLayer.id);

      if (renderer.isCroppedRasterTarget?.(existingTarget)) {
        return renderer.materializeRasterTarget?.(activeLayer.id, {
          source: "color-fill-materialize",
        }) || renderer.getRasterTarget(activeLayer.id);
      }

      return renderer.getRasterTarget(activeLayer.id);
    }

    return null;
  }

  function getExistingRasterTarget(layerId) {
    const renderer = namespace.documentRenderer;
    const existingTarget = renderer?.rasterTargetsByLayerId?.get?.(layerId);

    if (!layerId || !existingTarget?.framebuffer || !existingTarget?.texture) {
      return null;
    }

    return {
      ...existingTarget,
      layerId,
    };
  }

  function getReferenceTarget(writeTarget) {
    const layerModel = namespace.documentLayerModel;
    const referenceId = getReferenceLayerId();

    if (!referenceId || referenceId === writeTarget.layerId) {
      return writeTarget;
    }

    const referenceLayer = layerModel?.findEntryById?.(referenceId);
    const referenceTarget = referenceLayer?.type !== "group"
      ? getExistingRasterTarget(referenceId)
      : null;

    return referenceTarget || writeTarget;
  }

  function readFramebufferPixelsTopDown(gl, framebuffer, width, height) {
    const pixels = new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    return pixels;
  }

  function getReferenceDocumentRect(referenceTarget, width, height) {
    const renderer = namespace.documentRenderer;
    const rect = renderer?.getRasterTargetDocumentRect?.(referenceTarget);

    if (rect) {
      return rect;
    }

    return {
      height,
      width,
      x: Number.isFinite(referenceTarget?.x) ? Math.round(referenceTarget.x) : 0,
      y: Number.isFinite(referenceTarget?.y) ? Math.round(referenceTarget.y) : 0,
    };
  }

  function createReferencePixelSource(gl, referenceTarget) {
    const referenceFramebuffer = referenceTarget.framebuffer;
    const width = Math.max(1, Math.round(referenceTarget.width || 1));
    const height = Math.max(1, Math.round(referenceTarget.height || 1));
    const rect = getReferenceDocumentRect(referenceTarget, width, height);
    const pixels = readFramebufferPixelsTopDown(gl, referenceFramebuffer, width, height);

    return {
      height,
      pixels,
      width,
      x: rect.x,
      y: rect.y,
    };
  }

  function getTopDownRgbaOffset(pixelIndex, width, height) {
    const y = Math.floor(pixelIndex / width);
    const x = pixelIndex - y * width;
    const webglY = height - 1 - y;

    return (webglY * width + x) * 4;
  }

  function getReferencePixelOffset(referenceSource, documentX, documentY) {
    const localX = documentX - referenceSource.x;
    const localY = documentY - referenceSource.y;

    if (
      localX < 0 ||
      localY < 0 ||
      localX >= referenceSource.width ||
      localY >= referenceSource.height
    ) {
      return -1;
    }

    return getTopDownRgbaOffset(
      localY * referenceSource.width + localX,
      referenceSource.width,
      referenceSource.height,
    );
  }

  function getReferenceChannel(referenceSource, offset, channel) {
    return offset >= 0 ? referenceSource.pixels[offset + channel] : 0;
  }

  function colorDistanceSq(referenceSource, documentX, documentY, red, green, blue, alpha) {
    const offset = getReferencePixelOffset(referenceSource, documentX, documentY);
    const dr = getReferenceChannel(referenceSource, offset, 0) - red;
    const dg = getReferenceChannel(referenceSource, offset, 1) - green;
    const db = getReferenceChannel(referenceSource, offset, 2) - blue;
    const da = getReferenceChannel(referenceSource, offset, 3) - alpha;

    return dr * dr + dg * dg + db * db + da * da;
  }

  function floodFillMask(referenceSource, width, height, seedX, seedY, tolerance) {
    const pixelCount = width * height;
    const seedIndex = seedY * width + seedX;
    const seedOffset = getReferencePixelOffset(referenceSource, seedX, seedY);
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

      if (colorDistanceSq(referenceSource, x, y, seedR, seedG, seedB, seedA) > toleranceSq) {
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
    const readY = target.height - (dirtyRect.y + dirtyRect.height);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
    gl.readPixels(
      dirtyRect.x,
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

  function applyFillToDirtyPixels(targetPixels, coverageMask, dirtyRect, documentWidth, fillColor) {
    for (let row = 0; row < dirtyRect.height; row += 1) {
      const docY = dirtyRect.y + dirtyRect.height - 1 - row;

      for (let col = 0; col < dirtyRect.width; col += 1) {
        const docX = dirtyRect.x + col;
        const coverageByte = coverageMask[docY * documentWidth + docX];

        if (coverageByte <= 0) {
          continue;
        }

        const offset = (row * dirtyRect.width + col) * 4;

        compositeFillPixelPremultiplied(targetPixels, offset, fillColor, coverageByte);
      }
    }
  }

  function writeDirtyPixelsToTarget(gl, target, dirtyRect, textureY, pixels) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      dirtyRect.x,
      textureY,
      dirtyRect.width,
      dirtyRect.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function pushHistoryEntry(renderer, layerId, dirtyRect, beforeSnapshot, memoryPolicy = null, tileHistory = null) {
    const history = namespace.documentHistory;

    if (!history?.push) {
      renderer.finalizeRasterEditHistoryEntry?.(layerId, null, {
        source: "color-fill",
      });
      renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer.deleteRasterSnapshot?.(beforeSnapshot);
      return;
    }

    if (tileHistory) {
      const tileEntry = renderer.commitRasterTileHistory?.(tileHistory, {
        label: "color-fill",
        memoryPolicy,
        redoSource: "history-redo-color-fill",
        source: "color-fill",
        type: "pixel",
        undoSource: "history-undo-color-fill",
      });
      const entry = tileEntry
        ? renderer.finalizeRasterEditHistoryEntry?.(layerId, tileEntry, {
            source: "color-fill",
          }) || tileEntry
        : null;

      if (entry) {
        history.push(entry);
      } else {
        renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      }

      return;
    }

    if (!beforeSnapshot) {
      return;
    }

    let afterSnapshot = null;
    let entry = null;
    const captureRedoSnapshot = () => {
      if (afterSnapshot?.texture) {
        return true;
      }

      afterSnapshot = renderer.createRasterSnapshot?.(layerId, dirtyRect, "color-fill-after");
      if (afterSnapshot?.texture && entry) {
        entry.after = afterSnapshot;
      }

      return Boolean(afterSnapshot?.texture);
    };

    entry = {
      type: "pixel",
      after: null,
      before: beforeSnapshot,
      layerId,
      memoryPolicy,
      rect: dirtyRect,
      source: "color-fill",
      undo: () => {
        if (!captureRedoSnapshot()) {
          return false;
        }

        return renderer.restoreRasterSnapshot(layerId, beforeSnapshot, {
          source: "history-undo-color-fill",
        });
      },
      redo: () => afterSnapshot?.texture
        ? renderer.restoreRasterSnapshot(layerId, afterSnapshot, {
            source: "history-redo-color-fill",
          })
        : false,
      destroy: () => {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    };

    entry = renderer.finalizeRasterEditHistoryEntry?.(layerId, entry, {
      source: "color-fill",
    }) || entry;

    history.push(entry);
  }

  function recordColorFillMemory(renderer, details = {}) {
    if (!renderer?.recordRasterOperation) {
      return null;
    }

    const {
      beforeSnapshot,
      coverageMask,
      dirtyRead,
      dirtyRect,
      fillResult,
      height,
      layerId,
      referenceSource,
      target,
      width,
    } = details;
    const beforeBytes = getRasterRectBytes(beforeSnapshot?.rect);
    const afterBytes = getRasterRectBytes(dirtyRect);
    const referenceBytes = referenceSource?.pixels?.byteLength || getRasterRectBytes(referenceSource || target);
    const maskBytes = fillResult?.mask?.byteLength || 0;
    const stackBytes = fillResult?.stackBytes || 0;
    const coverageMaskBytes = coverageMask?.byteLength || 0;
    const fillMaskMemoryBytes = getFillMaskMemoryBytes(fillResult, coverageMask);
    const dirtyReadBytes = dirtyRead?.pixels?.byteLength || 0;
    const scratchBytes = referenceBytes + fillMaskMemoryBytes + dirtyReadBytes;
    const historyBytes = beforeBytes + afterBytes;
    const estimatedPeakBytes = scratchBytes + historyBytes;
    const coverage = getRectCoverage(dirtyRect, width, height);
    const report = {
      afterBytes,
      beforeBytes,
      canvasSize: { height, width },
      coverage,
      estimatedPeakBytes,
      fillCoverageMaskBytes: coverageMaskBytes,
      fillMaskBytes: maskBytes,
      fillMaskMemoryBytes,
      fillStackBytes: stackBytes,
      historyBytes,
      layerId,
      operationType: "color-fill",
      persistentBytes: historyBytes,
      policy: classifyFillMemory(renderer, estimatedPeakBytes, coverage),
      reason: "color-fill",
      scratchBytes,
      source: "color-fill",
      sourceBytes: referenceBytes,
      sourceRect: renderer?.getRasterTargetDocumentRect?.(target) || {
        height,
        width,
        x: 0,
        y: 0,
      },
      targetBytes: getRasterRectBytes(dirtyRect),
      targetRect: dirtyRect,
      tool: "color-fill",
    };
    const recorded = renderer.recordRasterOperation(report);

    namespace.lastColorFillMemoryReport = recorded;

    return recorded;
  }

  function dropColorAt(clientX, clientY, colorHex, options = {}) {
    const brushEngine = namespace.brushEngine;
    const renderer = namespace.documentRenderer;
    const gl = renderer?.gl || renderer?.context;

    if (!brushEngine?.screenToDocumentSpace || !renderer?.getRasterTarget || !gl) {
      return false;
    }

    const target = getWritableLayerTarget();

    if (!target?.framebuffer || !target?.texture) {
      return false;
    }

    const point = brushEngine.screenToDocumentSpace(clientX, clientY);
    const seedX = Math.floor(point.docX);
    const seedY = Math.floor(point.docY);
    const width = Math.max(1, Math.round(target.width));
    const height = Math.max(1, Math.round(target.height));

    if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
      return false;
    }

    const tolerance = clamp(options.tolerance ?? fillTolerance, 0, MAX_FILL_TOLERANCE);
    const referenceTarget = getReferenceTarget(target);
    const referenceSource = createReferencePixelSource(gl, referenceTarget);
    const fillResult = floodFillMask(referenceSource, width, height, seedX, seedY, tolerance);

    if (!fillResult) {
      return false;
    }

    const coverageRadius = getDilationRadius(tolerance);
    const coverageMask = createFillCoverageMask(
      fillResult.mask,
      width,
      height,
      fillResult.bounds,
      coverageRadius,
    );
    const dirtyRect = createDirtyRect(
      fillResult.bounds,
      width,
      height,
      getFillCoveragePadding(tolerance),
    );

    if (dirtyRect.width <= 0 || dirtyRect.height <= 0) {
      return false;
    }

    const layerId = target.layerId;
    const tileHistory = renderer.beginRasterTileHistory?.(layerId, dirtyRect, {
      label: "color-fill",
      source: "color-fill",
    });
    const beforeSnapshot = tileHistory
      ? null
      : renderer.createRasterSnapshot?.(layerId, dirtyRect, "color-fill-before");
    const dirtyRead = readTargetDirtyPixels(gl, target, dirtyRect);
    const targetPixels = dirtyRead.pixels;

    applyFillToDirtyPixels(
      targetPixels,
      coverageMask,
      dirtyRect,
      width,
      parseHexColor(colorHex),
    );
    writeDirtyPixelsToTarget(gl, target, dirtyRect, dirtyRead.textureY, targetPixels);

    const memoryPolicy = recordColorFillMemory(renderer, {
      beforeSnapshot,
      coverageMask,
      dirtyRead,
      dirtyRect,
      fillResult,
      height,
      layerId,
      referenceSource,
      target,
      width,
    });
    pushHistoryEntry(renderer, layerId, dirtyRect, beforeSnapshot, memoryPolicy, tileHistory);
    renderer.invalidatePreviewCache?.("color-fill");
    renderer.emitContentChange?.({ layerId, source: "color-fill" });
    renderer.requestDraw?.();

    return true;
  }

  namespace.__colorFillTestHooks = Object.freeze({
    applyFillToDirtyPixels,
    compositeFillPixelPremultiplied,
    createDirtyRect,
    createFillCoverageMask,
    floodFillMask,
    getDilationRadius,
    getFillCoveragePadding,
    getFillMaskMemoryBytes,
  });

  namespace.colorFill = {
    beginDropDrag,
    cancelDropDrag,
    clearReferenceLayerId,
    dropColorAt,
    endDropDrag,
    getReferenceLayerId,
    getTolerance,
    setReferenceLayerId,
    setTolerance,
    showThresholdControl,
  };
})(window.CBO = window.CBO || {});
