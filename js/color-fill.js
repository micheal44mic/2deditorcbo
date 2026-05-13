(function registerColorFill(namespace) {
  const DEFAULT_FILL_TOLERANCE = 48;
  const MAX_FILL_TOLERANCE = 255;
  const FILL_COVERAGE_MAX = 255;
  const FILL_EDGE_AA_RADIUS = 1;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const THRESHOLD_HIDE_DELAY_MS = 5000;
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
    thresholdInput?.addEventListener("focus", showThresholdControl);
    thresholdInput?.addEventListener("blur", () => hideThresholdControl());

    thresholdToolbar.addEventListener("pointerenter", showThresholdControl);
    thresholdToolbar.addEventListener("pointerleave", () => hideThresholdControl());

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

  function isThresholdControlInteractive() {
    return Boolean(
      thresholdToolbar &&
      (
        document.activeElement === thresholdInput ||
        (typeof thresholdToolbar.matches === "function" && thresholdToolbar.matches(":hover"))
      ),
    );
  }

  function hideThresholdControl(delay = THRESHOLD_HIDE_DELAY_MS) {
    if (!thresholdToolbar) {
      return;
    }

    window.clearTimeout(thresholdHideTimer);
    thresholdHideTimer = window.setTimeout(() => {
      if (delay > 0 && isThresholdControlInteractive()) {
        hideThresholdControl();
        return;
      }

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

  function getWritableLayerInfo(options = {}) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;

    if (!layerModel || !renderer) {
      return null;
    }

    const activeId = layerModel.activeLayerId;
    const activeLayer = activeId ? layerModel.findEntryById?.(activeId) : null;
    const requestedArtboardId = String(options.artboardId || "").trim();
    const activeLayerArtboardId = activeId
      ? String(layerModel.findEntryArtboardId?.(activeId) || "").trim()
      : "";
    const activeLayerMatchesArtboard = !requestedArtboardId || activeLayerArtboardId === requestedArtboardId;
    const canWriteActiveLayer =
      activeLayer &&
      activeLayer.locked !== true &&
      activeLayerMatchesArtboard &&
      (activeLayer.type === "paint" || activeLayer.type === "image");

    if (!canWriteActiveLayer) {
      const paintLayer = layerModel.ensureActivePaintLayer?.({
        artboardId: options.artboardId,
        source: "color-fill-layer",
      });
      const ensuredLayer = paintLayer?.id ? layerModel.findEntryById?.(paintLayer.id) : null;

      if (!ensuredLayer || ensuredLayer.locked === true || ensuredLayer.type !== "paint") {
        return null;
      }

      return {
        existingTarget: renderer.rasterTargetsByLayerId?.get?.(ensuredLayer.id) || null,
        layer: ensuredLayer,
        layerId: ensuredLayer.id,
      };
    }

    return {
      existingTarget: renderer.rasterTargetsByLayerId?.get?.(activeLayer.id) || null,
      layer: activeLayer,
      layerId: activeLayer.id,
    };
  }

  function getExistingRasterTarget(layerId) {
    const renderer = namespace.documentRenderer;
    const existingTarget = renderer?.rasterTargetsByLayerId?.get?.(layerId);

    if (!layerId || !existingTarget) {
      return null;
    }

    if (renderer?.isSparseRasterTarget?.(existingTarget) === true) {
      return existingTarget.tiles?.size > 0
        ? {
            ...existingTarget,
            layerId,
          }
        : null;
    }

    if (!existingTarget.framebuffer || !existingTarget.texture) {
      return null;
    }

    return {
      ...existingTarget,
      layerId,
    };
  }

  function getReferenceTarget(writeLayerId, fallbackTarget = null) {
    const layerModel = namespace.documentLayerModel;
    const referenceId = getReferenceLayerId();

    if (!referenceId || referenceId === writeLayerId) {
      return fallbackTarget;
    }

    const referenceLayer = layerModel?.findEntryById?.(referenceId);
    const referenceTarget = referenceLayer?.type !== "group"
      ? getExistingRasterTarget(referenceId)
      : null;

    return referenceTarget || fallbackTarget;
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

  function createSparseReferencePixelSource(gl, sparseTarget, options = {}) {
    const renderer = namespace.documentRenderer;
    const tileSources = [];
    const tileMap = new Map();
    const tileSize = Math.max(1, Math.round(sparseTarget.tileSize || 256));
    let bytes = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    sparseTarget.tiles?.forEach?.((tileTarget) => {
      if (!tileTarget) {
        return;
      }

      if ((!tileTarget.framebuffer || !tileTarget.texture) && renderer?.hydrateRasterTarget) {
        renderer.hydrateRasterTarget(tileTarget, {
          kind: "paintTile",
          label: `${sparseTarget.layerId || "reference"} tile ${tileTarget.tx},${tileTarget.ty}`,
          layerId: sparseTarget.layerId || "",
          ownerId: tileTarget.ownerId || `${sparseTarget.layerId || "reference"}:${tileTarget.tx}:${tileTarget.ty}`,
          ownerType: "live",
          reason: "color-fill-reference-hydrate",
        });
      }

      if (!tileTarget.framebuffer || !tileTarget.texture) {
        return;
      }

      const width = Math.max(1, Math.round(tileTarget.width || tileSize));
      const height = Math.max(1, Math.round(tileTarget.height || tileSize));
      const rect = getReferenceDocumentRect(tileTarget, width, height);
      const pixels = readFramebufferPixelsTopDown(gl, tileTarget.framebuffer, width, height);
      const tx = Number.isFinite(tileTarget.tx) ? Math.round(tileTarget.tx) : Math.floor(rect.x / tileSize);
      const ty = Number.isFinite(tileTarget.ty) ? Math.round(tileTarget.ty) : Math.floor(rect.y / tileSize);
      const tileSource = {
        height,
        pixels,
        width,
        x: rect.x,
        y: rect.y,
      };

      bytes += pixels.byteLength;
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + width);
      maxY = Math.max(maxY, rect.y + height);
      tileSources.push(tileSource);
      tileMap.set(`${tx}:${ty}`, tileSource);
    });

    const hasBounds =
      Number.isFinite(minX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxX) &&
      Number.isFinite(maxY) &&
      maxX > minX &&
      maxY > minY;

    return {
      bounds: hasBounds
        ? {
            height: maxY - minY,
            width: maxX - minX,
            x: minX,
            y: minY,
          }
        : null,
      boundAnalysis: options.boundAnalysis === true,
      bytes,
      height: Math.max(1, Math.round(renderer?.height || sparseTarget.height || 1)),
      sparse: true,
      tileMap,
      tileSize,
      tiles: tileSources,
      width: Math.max(1, Math.round(renderer?.width || sparseTarget.width || 1)),
      x: 0,
      y: 0,
    };
  }

  function createReferencePixelSource(gl, referenceTarget, options = {}) {
    const renderer = namespace.documentRenderer;

    if (!referenceTarget) {
      return {
        bytes: 0,
        empty: true,
        height: Math.max(1, Math.round(renderer?.height || 1)),
        width: Math.max(1, Math.round(renderer?.width || 1)),
        x: 0,
        y: 0,
      };
    }

    if (renderer?.isSparseRasterTarget?.(referenceTarget) === true) {
      return createSparseReferencePixelSource(gl, referenceTarget, options);
    }

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
    if (referenceSource?.sparse === true) {
      const x = Math.floor(documentX);
      const y = Math.floor(documentY);
      const tileSize = Math.max(1, Math.round(referenceSource.tileSize || 1));
      const tx = Math.floor(x / tileSize);
      const ty = Math.floor(y / tileSize);
      const tileSource = referenceSource.tileMap?.get?.(`${tx}:${ty}`);

      if (!tileSource) {
        return null;
      }

      const localX = x - tileSource.x;
      const localY = y - tileSource.y;

      if (
        localX < 0 ||
        localY < 0 ||
        localX >= tileSource.width ||
        localY >= tileSource.height
      ) {
        return null;
      }

      return {
        offset: getTopDownRgbaOffset(
          localY * tileSource.width + localX,
          tileSource.width,
          tileSource.height,
        ),
        pixels: tileSource.pixels,
      };
    }

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
    if (referenceSource?.empty === true) {
      return 0;
    }

    if (referenceSource?.sparse === true) {
      return offset?.pixels && offset.offset >= 0 ? offset.pixels[offset.offset + channel] : 0;
    }

    return offset >= 0 ? referenceSource.pixels[offset + channel] : 0;
  }

  function clampRectToTarget(rect, targetWidth, targetHeight) {
    const x = Math.max(0, Math.min(targetWidth, Math.floor(rect?.x || 0)));
    const y = Math.max(0, Math.min(targetHeight, Math.floor(rect?.y || 0)));
    const right = Math.max(x, Math.min(targetWidth, Math.ceil((rect?.x || 0) + (rect?.width || 0))));
    const bottom = Math.max(y, Math.min(targetHeight, Math.ceil((rect?.y || 0) + (rect?.height || 0))));

    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function isPointInsideRect(x, y, rect) {
    return Boolean(
      rect &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= rect.x &&
      y >= rect.y &&
      x < rect.x + rect.width &&
      y < rect.y + rect.height
    );
  }

  function getActiveFillArtboardRect(layerId = "") {
    return namespace.getActiveDocumentArtboardRect?.({ layerId }) || null;
  }

  function getFillAnalysisRect(referenceSource, targetWidth, targetHeight, seedX, seedY, clipRect = null) {
    const fallbackRect = clipRect || {
      height: targetHeight,
      width: targetWidth,
      x: 0,
      y: 0,
    };

    if (referenceSource?.sparse !== true || referenceSource.boundAnalysis !== true || !referenceSource.bounds) {
      return isPointInsideRect(seedX, seedY, fallbackRect) ? { ...fallbackRect } : null;
    }

    const padding = Math.max(1, Math.round(referenceSource.tileSize || FILL_EDGE_AA_RADIUS));
    const sparseBoundsRect = {
      height: referenceSource.bounds.height + padding * 2,
      width: referenceSource.bounds.width + padding * 2,
      x: referenceSource.bounds.x - padding,
      y: referenceSource.bounds.y - padding,
    };
    const rect = clipRect
      ? intersectRects(sparseBoundsRect, clipRect)
      : clampRectToTarget(sparseBoundsRect, targetWidth, targetHeight);

    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      !isPointInsideRect(seedX, seedY, rect)
    ) {
      return null;
    }

    return rect;
  }

  function offsetRect(rect, offsetX, offsetY) {
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x + offsetX,
      y: rect.y + offsetY,
    };
  }

  function intersectRects(a, b) {
    if (!a || !b) {
      return null;
    }

    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);

    if (right <= x || bottom <= y) {
      return null;
    }

    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function getWritableTargetsForDirtyRect(layerId, dirtyRect, tilePatchRects = null) {
    const renderer = namespace.documentRenderer;

    if (!renderer || !layerId || !dirtyRect) {
      return [];
    }

    const paintTargets = renderer.ensureRasterTargetsForPaintRect?.(layerId, dirtyRect, {
      source: "color-fill",
      tilePatchRects,
    });

    if (Array.isArray(paintTargets) && paintTargets.length > 0) {
      return paintTargets
        .map((entry) => entry?.target || entry)
        .filter((target) => target?.framebuffer && target?.texture);
    }

    const target = renderer.ensureRasterTargetForPaintRect?.(layerId, dirtyRect, {
      source: "color-fill",
    }) || renderer.getRasterTarget?.(layerId);

    return target?.framebuffer && target?.texture ? [target] : [];
  }

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

  function writeDirtyPixelsToTarget(gl, target, dirtyRect, textureX, textureY, pixels) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      textureX,
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
    const referenceBytes = Number.isFinite(referenceSource?.bytes)
      ? Math.max(0, Math.round(referenceSource.bytes))
      : referenceSource?.pixels?.byteLength || getRasterRectBytes(referenceSource || target);
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

    if (!brushEngine?.screenToDocumentSpace || !renderer || !gl) {
      return false;
    }

    const point = brushEngine.screenToDocumentSpace(clientX, clientY);
    const pointerArtboard = namespace.selectDocumentArtboardAtPoint?.(point, {
      source: "color-fill-pointer-artboard",
    }) || null;
    const writableLayer = getWritableLayerInfo({
      artboardId: pointerArtboard?.id,
    });

    if (!writableLayer?.layerId) {
      return false;
    }

    const seedX = Math.floor(point.docX);
    const seedY = Math.floor(point.docY);
    const activeArtboardRect = getActiveFillArtboardRect(writableLayer.layerId);
    const fillBounds = activeArtboardRect || {
      height: Math.max(1, Math.round(renderer.height || writableLayer.existingTarget?.height || 1)),
      width: Math.max(1, Math.round(renderer.width || writableLayer.existingTarget?.width || 1)),
      x: 0,
      y: 0,
    };
    const width = Math.max(1, Math.round(fillBounds.width || 1));
    const height = Math.max(1, Math.round(fillBounds.height || 1));

    if (!isPointInsideRect(seedX, seedY, fillBounds)) {
      return false;
    }

    const selectionRegion = namespace.areaSelection?.hasSelection?.()
      ? namespace.areaSelection.getRegionSnapshot?.()
      : null;
    const selectionRect = selectionRegion?.getBounds?.() || (
      namespace.areaSelection?.hasSelection?.()
        ? namespace.areaSelection.getRect?.()
        : null
    );
    const selectionContains = selectionRegion
      ? (docX, docY) => selectionRegion.containsPoint?.(docX, docY) === true
      : selectionRect
        ? (docX, docY) => namespace.areaSelection.isPointInside?.(docX, docY) !== false
        : null;
    const artboardContains = activeArtboardRect
      ? (docX, docY) => isPointInsideRect(docX, docY, activeArtboardRect)
      : null;
    const clipContains = selectionContains && artboardContains
      ? (docX, docY) => selectionContains(docX, docY) && artboardContains(docX, docY)
      : selectionContains || artboardContains;

    if (clipContains && !clipContains(seedX, seedY)) {
      return false;
    }

    const tolerance = clamp(options.tolerance ?? fillTolerance, 0, MAX_FILL_TOLERANCE);
    const referenceLayerId = getReferenceLayerId();
    const referenceTarget = getReferenceTarget(writableLayer.layerId, writableLayer.existingTarget);
    const useExplicitReference = Boolean(
      referenceLayerId &&
      referenceLayerId !== writableLayer.layerId &&
      referenceTarget &&
      referenceTarget !== writableLayer.existingTarget
    );
    const referenceSource = createReferencePixelSource(gl, referenceTarget, {
      boundAnalysis: useExplicitReference,
    });
    const analysisRect = getFillAnalysisRect(referenceSource, width, height, seedX, seedY, fillBounds);

    if (!analysisRect) {
      return false;
    }

    const analysisSeedX = seedX - analysisRect.x;
    const analysisSeedY = seedY - analysisRect.y;
    const fillResult = floodFillMask(
      referenceSource,
      analysisRect.width,
      analysisRect.height,
      analysisSeedX,
      analysisSeedY,
      tolerance,
      analysisRect.x,
      analysisRect.y,
      { selectionContains: clipContains },
    );

    if (!fillResult) {
      return false;
    }

    const coverageRadius = getDilationRadius(tolerance);
    const coverageMask = createFillCoverageMask(
      fillResult.mask,
      analysisRect.width,
      analysisRect.height,
      fillResult.bounds,
      coverageRadius,
    );
    let dirtyRect = offsetRect(
      createDirtyRect(
        fillResult.bounds,
        analysisRect.width,
        analysisRect.height,
        getFillCoveragePadding(tolerance),
      ),
      analysisRect.x,
      analysisRect.y,
    );

    if (selectionRegion) {
      dirtyRect = selectionRegion.intersectBounds?.(dirtyRect) || null;
    } else if (selectionRect) {
      dirtyRect = intersectRects(dirtyRect, selectionRect);
    }

    if (activeArtboardRect) {
      dirtyRect = intersectRects(dirtyRect, activeArtboardRect);
    }

    if (!dirtyRect || dirtyRect.width <= 0 || dirtyRect.height <= 0) {
      return false;
    }

    const layerId = writableLayer.layerId;
    const tilePatchRects = selectionRegion?.getTilePatchRects?.(dirtyRect) || null;
    const writeTargets = getWritableTargetsForDirtyRect(layerId, dirtyRect, tilePatchRects);

    if (writeTargets.length === 0) {
      return false;
    }

    const tileHistory = renderer.beginRasterTileHistory?.(layerId, dirtyRect, {
      label: "color-fill",
      source: "color-fill",
      tilePatchRects,
    });
    const beforeSnapshot = tileHistory
      ? null
      : renderer.createRasterSnapshot?.(layerId, dirtyRect, "color-fill-before");
    const fillColor = parseHexColor(colorHex);
    let dirtyReadBytes = 0;

    writeTargets.forEach((writeTarget) => {
      const targetRect = getReferenceDocumentRect(writeTarget, writeTarget.width, writeTarget.height);
      const targetDirtyRect = intersectRects(dirtyRect, targetRect);

      if (!targetDirtyRect) {
        return;
      }

      const dirtyRead = readTargetDirtyPixels(gl, writeTarget, targetDirtyRect);
      const targetPixels = dirtyRead.pixels;

      dirtyReadBytes += targetPixels.byteLength;
      applyFillToDirtyPixels(
        targetPixels,
        coverageMask,
        targetDirtyRect,
        width,
        fillColor,
        analysisRect.x,
        analysisRect.y,
        analysisRect.width,
        clipContains,
      );
      writeDirtyPixelsToTarget(
        gl,
        writeTarget,
        targetDirtyRect,
        dirtyRead.textureX,
        dirtyRead.textureY,
        targetPixels,
      );
    });

    const memoryPolicy = recordColorFillMemory(renderer, {
      beforeSnapshot,
      coverageMask,
      dirtyRead: {
        pixels: {
          byteLength: dirtyReadBytes,
        },
      },
      dirtyRect,
      fillResult,
      height,
      layerId,
      referenceSource,
      target: writeTargets[0],
      width,
    });
    pushHistoryEntry(renderer, layerId, dirtyRect, beforeSnapshot, memoryPolicy, tileHistory);
    if (typeof renderer.commitVisualDirtyChange === "function") {
      renderer.commitVisualDirtyChange({
        layerId,
        rect: dirtyRect,
        source: "color-fill",
        tilePatchRects,
        usePreviewDirtyTiles: true,
      });
    } else {
      renderer.invalidatePreviewCache?.("color-fill", { layerId, rect: dirtyRect });
      renderer.emitContentChange?.({ layerId, rect: dirtyRect, source: "color-fill" });
    }
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
