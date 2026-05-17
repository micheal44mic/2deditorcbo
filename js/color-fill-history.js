(function registerColorFillHistoryModule(namespace) {
  namespace.ColorFillModules = namespace.ColorFillModules || {};

  namespace.ColorFillModules.history = function installColorFillHistoryModule(context) {
    const {
      FILL_MEMORY_POLICY,
      applyFillToDirtyPixels,
      createDirtyRect,
      getFillCoveragePadding,
      getFillMaskMemoryBytes,
      getRasterRectBytes,
      getRectCoverage,
      getReferenceDocumentRect,
      intersectRects,
      namespace,
      offsetRect,
      parseHexColor,
      readTargetDirtyPixels,
    } = context;

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
    return renderer.recordRasterOperation(report);
  }

  function finishColorFillFromMask(context, fillResult, coverageMask) {
    const {
      activeArtboardRect,
      analysisRect,
      clipContains,
      colorHex,
      fillBounds,
      gl,
      height,
      referenceClipRect,
      referenceSource,
      renderer,
      selectionRect,
      selectionRegion,
      tolerance,
      width,
      writableLayer,
    } = context;
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
        fillBounds.width,
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

    return {
      classifyFillMemory,
      getWritableTargetsForDirtyRect,
      writeDirtyPixelsToTarget,
      pushHistoryEntry,
      recordColorFillMemory,
      finishColorFillFromMask,
    };
  };
})(window.CBO = window.CBO || {});
