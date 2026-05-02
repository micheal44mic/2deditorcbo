(function registerColorFill(namespace) {
  const DEFAULT_FILL_TOLERANCE = 48;
  const MAX_FILL_TOLERANCE = 255;
  const THRESHOLD_HIDE_DELAY_MS = 1400;

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
    const nextLayerId = String(layerId || "").trim();

    referenceLayerId = nextLayerId;
    namespace.colorFillReferenceLayerId = nextLayerId;

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

  function getTopDownRgbaOffset(pixelIndex, width, height) {
    const y = Math.floor(pixelIndex / width);
    const x = pixelIndex - y * width;
    const webglY = height - 1 - y;

    return (webglY * width + x) * 4;
  }

  function colorDistanceSq(pixels, offset, red, green, blue, alpha) {
    const dr = pixels[offset] - red;
    const dg = pixels[offset + 1] - green;
    const db = pixels[offset + 2] - blue;
    const da = pixels[offset + 3] - alpha;

    return dr * dr + dg * dg + db * db + da * da;
  }

  function floodFillMask(referencePixels, width, height, seedX, seedY, tolerance) {
    const pixelCount = width * height;
    const seedIndex = seedY * width + seedX;
    const seedOffset = getTopDownRgbaOffset(seedIndex, width, height);
    const seedR = referencePixels[seedOffset];
    const seedG = referencePixels[seedOffset + 1];
    const seedB = referencePixels[seedOffset + 2];
    const seedA = referencePixels[seedOffset + 3];
    const toleranceSq = tolerance * tolerance;
    const visited = new Uint8Array(pixelCount);
    const mask = new Uint8Array(pixelCount);
    const stack = new Int32Array(pixelCount);
    let stackPtr = 0;
    let filledCount = 0;
    let minX = seedX;
    let maxX = seedX;
    let minY = seedY;
    let maxY = seedY;

    stack[stackPtr] = seedIndex;
    stackPtr += 1;
    visited[seedIndex] = 1;

    while (stackPtr > 0) {
      stackPtr -= 1;

      const index = stack[stackPtr];
      const offset = getTopDownRgbaOffset(index, width, height);

      if (colorDistanceSq(referencePixels, offset, seedR, seedG, seedB, seedA) > toleranceSq) {
        continue;
      }

      const y = Math.floor(index / width);
      const x = index - y * width;

      mask[index] = 1;
      filledCount += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      if (x + 1 < width && visited[index + 1] === 0) {
        visited[index + 1] = 1;
        stack[stackPtr] = index + 1;
        stackPtr += 1;
      }

      if (x > 0 && visited[index - 1] === 0) {
        visited[index - 1] = 1;
        stack[stackPtr] = index - 1;
        stackPtr += 1;
      }

      if (y + 1 < height && visited[index + width] === 0) {
        visited[index + width] = 1;
        stack[stackPtr] = index + width;
        stackPtr += 1;
      }

      if (y > 0 && visited[index - width] === 0) {
        visited[index - width] = 1;
        stack[stackPtr] = index - width;
        stackPtr += 1;
      }
    }

    if (filledCount <= 0) {
      return null;
    }

    return {
      bounds: { maxX, maxY, minX, minY },
      filledCount,
      mask,
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

  function createDirtyRect(bounds, width, height) {
    const x = Math.max(0, bounds.minX - 1);
    const y = Math.max(0, bounds.minY - 1);
    const right = Math.min(width - 1, bounds.maxX + 1);
    const bottom = Math.min(height - 1, bounds.maxY + 1);

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

  function applyFillToDirtyPixels(targetPixels, expandedMask, dirtyRect, documentWidth, fillColor) {
    for (let row = 0; row < dirtyRect.height; row += 1) {
      const docY = dirtyRect.y + dirtyRect.height - 1 - row;

      for (let col = 0; col < dirtyRect.width; col += 1) {
        const docX = dirtyRect.x + col;

        if (expandedMask[docY * documentWidth + docX] !== 1) {
          continue;
        }

        const offset = (row * dirtyRect.width + col) * 4;

        targetPixels[offset] = fillColor.r;
        targetPixels[offset + 1] = fillColor.g;
        targetPixels[offset + 2] = fillColor.b;
        targetPixels[offset + 3] = fillColor.a;
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

  function pushHistoryEntry(renderer, layerId, dirtyRect, beforeSnapshot, afterSnapshot) {
    const history = namespace.documentHistory;

    if (!history?.push || !beforeSnapshot || !afterSnapshot) {
      renderer.deleteRasterSnapshot?.(beforeSnapshot);
      renderer.deleteRasterSnapshot?.(afterSnapshot);
      return;
    }

    history.push({
      type: "pixel",
      after: afterSnapshot,
      before: beforeSnapshot,
      layerId,
      rect: dirtyRect,
      source: "color-fill",
      undo: () => renderer.restoreRasterSnapshot(layerId, beforeSnapshot, {
        source: "history-undo-color-fill",
      }),
      redo: () => renderer.restoreRasterSnapshot(layerId, afterSnapshot, {
        source: "history-redo-color-fill",
      }),
      destroy: () => {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    });
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
    const referenceFramebuffer = referenceTarget.framebuffer;
    const referencePixels = readFramebufferPixelsTopDown(gl, referenceFramebuffer, width, height);
    const fillResult = floodFillMask(referencePixels, width, height, seedX, seedY, tolerance);

    if (!fillResult) {
      return false;
    }

    const expandedMask = dilateMask(
      fillResult.mask,
      width,
      height,
      fillResult.bounds,
      getDilationRadius(tolerance),
    );
    const dirtyRect = createDirtyRect(fillResult.bounds, width, height);

    if (dirtyRect.width <= 0 || dirtyRect.height <= 0) {
      return false;
    }

    const layerId = target.layerId;
    const beforeSnapshot = renderer.createRasterSnapshot?.(layerId, dirtyRect, "color-fill-before");
    const dirtyRead = readTargetDirtyPixels(gl, target, dirtyRect);
    const targetPixels = dirtyRead.pixels;

    applyFillToDirtyPixels(
      targetPixels,
      expandedMask,
      dirtyRect,
      width,
      parseHexColor(colorHex),
    );
    writeDirtyPixelsToTarget(gl, target, dirtyRect, dirtyRead.textureY, targetPixels);

    const afterSnapshot = renderer.createRasterSnapshot?.(layerId, dirtyRect, "color-fill-after");

    pushHistoryEntry(renderer, layerId, dirtyRect, beforeSnapshot, afterSnapshot);
    renderer.invalidatePreviewCache?.("color-fill");
    renderer.emitContentChange?.({ layerId, source: "color-fill" });
    renderer.requestDraw?.();

    return true;
  }

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
