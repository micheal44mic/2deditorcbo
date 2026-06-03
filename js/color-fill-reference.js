(function registerColorFillReferenceModule(namespace) {
  namespace.ColorFillModules = namespace.ColorFillModules || {};

  namespace.ColorFillModules.reference = function installColorFillReferenceModule(context) {
    const {
      FILL_EDGE_AA_RADIUS,
      getReferenceLayerId,
      namespace,
    } = context;

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

    if (activeLayer && layerModel.requestLayerVisibleForEdit?.(activeLayer.id, {
      source: "color-fill",
    }) === false) {
      return null;
    }

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

  function isValidClippingBaseLayer(layer) {
    return Boolean(
      layer &&
      layer.visible !== false &&
      layer.type !== "group" &&
      layer.type !== "background" &&
      layer.id !== "background"
    );
  }

  function getFillClippingBaseLayer(layerId) {
    const layerModel = namespace.documentLayerModel;
    const layers = layerModel?.flattenTopToBottom?.();
    const index = Array.isArray(layers)
      ? layers.findIndex((layer) => layer?.id === layerId)
      : -1;
    const layer = index >= 0 ? layers[index] : layerModel?.findEntryById?.(layerId);

    if (!layer?.clippingMask || index < 0) {
      return null;
    }

    for (let nextIndex = index + 1; nextIndex < layers.length; nextIndex += 1) {
      const candidate = layers[nextIndex];

      if (candidate?.clippingMask === true) {
        continue;
      }

      return isValidClippingBaseLayer(candidate) ? candidate : null;
    }

    return null;
  }

  function createAlphaMaskContains(referenceSource) {
    if (referenceSource?.empty === true) {
      return () => false;
    }

    return (docX, docY) => {
      const offset = getReferencePixelOffset(
        referenceSource,
        Math.floor(docX),
        Math.floor(docY),
      );

      return getReferenceChannel(referenceSource, offset, 3) > 0;
    };
  }

  function combineContainsPredicates(...predicates) {
    const activePredicates = predicates.filter((predicate) => typeof predicate === "function");

    if (activePredicates.length === 0) {
      return null;
    }

    return (docX, docY) => activePredicates.every((predicate) => predicate(docX, docY));
  }

  function getClippingFillConstraint(gl, writableLayer, fillBounds) {
    const baseLayer = getFillClippingBaseLayer(writableLayer?.layerId);

    if (!baseLayer?.id) {
      return null;
    }

    const baseTarget = getExistingRasterTarget(baseLayer.id);

    if (!baseTarget) {
      return {
        baseLayerId: baseLayer.id,
        containsPoint: () => false,
        rect: null,
      };
    }

    const source = createReferencePixelSource(gl, baseTarget, {
      boundAnalysis: true,
      clipRect: fillBounds,
    });
    const sourceRect = source?.bounds || (
      source?.empty === true
        ? null
        : {
            height: source.height,
            width: source.width,
            x: source.x,
            y: source.y,
          }
    );
    const rect = intersectRects(fillBounds, sourceRect);

    if (!rect || source?.empty === true) {
      return {
        baseLayerId: baseLayer.id,
        containsPoint: () => false,
        rect: null,
      };
    }

    return {
      baseLayerId: baseLayer.id,
      containsPoint: createAlphaMaskContains(source),
      rect,
      source,
    };
  }

  function readFramebufferPixelsTopDown(gl, framebuffer, width, height) {
    const pixels = new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    return pixels;
  }

  function readFramebufferRectPixelsTopDown(gl, framebuffer, sourceRect, readRect) {
    const width = Math.max(1, Math.round(readRect?.width || 1));
    const height = Math.max(1, Math.round(readRect?.height || 1));
    const pixels = new Uint8Array(width * height * 4);
    const textureX = Math.max(0, Math.round(readRect.x - sourceRect.x));
    const textureYTopDown = Math.max(0, Math.round(readRect.y - sourceRect.y));
    const readY = Math.max(0, Math.round(sourceRect.height - (textureYTopDown + height)));

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.readPixels(textureX, readY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
    const clipRect = options.clipRect || null;
    let bytes = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    sparseTarget.tiles?.forEach?.((tileTarget) => {
      if (!tileTarget) {
        return;
      }

      const width = Math.max(1, Math.round(tileTarget.width || tileSize));
      const height = Math.max(1, Math.round(tileTarget.height || tileSize));
      const rect = getReferenceDocumentRect(tileTarget, width, height);
      const readRect = clipRect
        ? intersectRects(rect, clipRect)
        : rect;

      if (!readRect || readRect.width <= 0 || readRect.height <= 0) {
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

      const pixels = readRect.x === rect.x &&
        readRect.y === rect.y &&
        readRect.width === rect.width &&
        readRect.height === rect.height
        ? readFramebufferPixelsTopDown(gl, tileTarget.framebuffer, width, height)
        : readFramebufferRectPixelsTopDown(gl, tileTarget.framebuffer, rect, readRect);
      const tx = Number.isFinite(tileTarget.tx) ? Math.round(tileTarget.tx) : Math.floor(rect.x / tileSize);
      const ty = Number.isFinite(tileTarget.ty) ? Math.round(tileTarget.ty) : Math.floor(rect.y / tileSize);
      const tileSource = {
        height: readRect.height,
        pixels,
        tx,
        ty,
        width: readRect.width,
        x: readRect.x,
        y: readRect.y,
      };

      bytes += pixels.byteLength;
      minX = Math.min(minX, readRect.x);
      minY = Math.min(minY, readRect.y);
      maxX = Math.max(maxX, readRect.x + readRect.width);
      maxY = Math.max(maxY, readRect.y + readRect.height);
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
    const readRect = options.clipRect
      ? intersectRects(rect, options.clipRect)
      : rect;

    if (!readRect || readRect.width <= 0 || readRect.height <= 0) {
      return {
        bytes: 0,
        empty: true,
        height: Math.max(1, Math.round(renderer?.height || 1)),
        width: Math.max(1, Math.round(renderer?.width || 1)),
        x: 0,
        y: 0,
      };
    }

    const pixels = readRect.x === rect.x &&
      readRect.y === rect.y &&
      readRect.width === rect.width &&
      readRect.height === rect.height
      ? readFramebufferPixelsTopDown(gl, referenceFramebuffer, width, height)
      : readFramebufferRectPixelsTopDown(gl, referenceFramebuffer, rect, readRect);

    return {
      bytes: pixels.byteLength,
      height: readRect.height,
      pixels,
      width: readRect.width,
      x: readRect.x,
      y: readRect.y,
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

  function getReferenceClipRect(fillBounds, selectionRect = null) {
    const baseRect = fillBounds ? { ...fillBounds } : null;

    if (!baseRect) {
      return null;
    }

    const clippedRect = selectionRect
      ? intersectRects(baseRect, selectionRect)
      : baseRect;

    if (!clippedRect || clippedRect.width <= 0 || clippedRect.height <= 0) {
      return null;
    }

    return clippedRect;
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

    return {
      getWritableLayerInfo,
      getExistingRasterTarget,
      getReferenceTarget,
      isValidClippingBaseLayer,
      getFillClippingBaseLayer,
      createAlphaMaskContains,
      combineContainsPredicates,
      getClippingFillConstraint,
      readFramebufferPixelsTopDown,
      readFramebufferRectPixelsTopDown,
      getReferenceDocumentRect,
      createSparseReferencePixelSource,
      createReferencePixelSource,
      getTopDownRgbaOffset,
      getReferencePixelOffset,
      getReferenceChannel,
      clampRectToTarget,
      isPointInsideRect,
      getActiveFillArtboardRect,
      getReferenceClipRect,
      getFillAnalysisRect,
      offsetRect,
      intersectRects,
    };
  };
})(window.CBO = window.CBO || {});
