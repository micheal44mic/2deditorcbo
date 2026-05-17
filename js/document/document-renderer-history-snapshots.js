(function registerHistorySnapshots(namespace) {
  namespace.DocumentRendererMixins = namespace.DocumentRendererMixins || {};

  function defineDocumentRendererMethods(DocumentRenderer, methods) {
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(DocumentRenderer.prototype, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  namespace.DocumentRendererMixins.historySnapshots = function installDocumentRendererHistorySnapshots(DocumentRenderer, internals) {
    const {
      RASTER_HISTORY_MOBILE_TILE_SIZE,
      RASTER_HISTORY_TILE_SIZE,
    } = internals;

    defineDocumentRendererMethods(DocumentRenderer, {
    estimateRasterSnapshotBytes(snapshot) {
      return this.getRasterRectBytes(snapshot?.rect || snapshot?.targetRect);
    }
,

    createEmptyRasterSnapshot(layerId, rect, label = "empty raster snapshot") {
      const docRect = this.getClampedDocumentRect(rect);

      if (!layerId || !docRect) {
        return null;
      }

      return {
        bytes: 0,
        empty: true,
        id: `empty-raster-snapshot-${this.rasterTargetIdSequence++}`,
        label,
        layerId,
        rect: { ...docRect },
        state: "EMPTY",
        targetRect: { ...docRect },
      };
    }
,

    getRasterHistoryTileSize(options = {}) {
      const fallback = this.isMobileLikeDevice?.() ? RASTER_HISTORY_MOBILE_TILE_SIZE : RASTER_HISTORY_TILE_SIZE;
      const requested = Number(options.tileSize ?? options.historyTileSize ?? fallback);

      if (!Number.isFinite(requested) || requested <= 0) {
        return fallback;
      }

      return Math.max(16, Math.min(1024, Math.round(requested)));
    }
,

    getRasterHistoryTileBounds(tx, ty, options = {}) {
      const tileSize = this.getRasterHistoryTileSize(options);
      const documentRect = this.getDocumentBoundsRect();
      const tileX = tx * tileSize;
      const tileY = ty * tileSize;

      if (options.clampToDocument === false) {
        return {
          height: tileSize,
          width: tileSize,
          x: tileX,
          y: tileY,
        };
      }

      const x0 = Math.max(documentRect.x, tileX);
      const y0 = Math.max(documentRect.y, tileY);
      const x1 = Math.min(tileX + tileSize, documentRect.x + documentRect.width);
      const y1 = Math.min(tileY + tileSize, documentRect.y + documentRect.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }
,

    emitRasterHistoryTileDebug(detail = {}) {
      if (namespace.debugRasterHistoryTiles !== true) {
        return;
      }

      const tx = Math.round(Number(detail.tx) || 0);
      const ty = Math.round(Number(detail.ty) || 0);
      const tileSize = this.getRasterHistoryTileSize({ tileSize: detail.tileSize });
      const tileRect = detail.tileRect || this.getRasterHistoryTileBounds(tx, ty, { tileSize });
      const patchRect = detail.patchRect || detail.rect || null;

      if (!tileRect || !patchRect) {
        return;
      }

      window.dispatchEvent(new CustomEvent("cbo:raster-history-tile-debug", {
        detail: {
          bytes: Math.max(0, Math.round(Number(detail.bytes) || 0)),
          layerId: detail.layerId || "",
          patchRect: { ...patchRect },
          phase: detail.phase || "tile",
          source: detail.source || "",
          tileRect: { ...tileRect },
          tileSize,
          tx,
          ty,
        },
      }));
    }
,

    getRasterHistoryTileRects(rect, options = {}) {
      const captureRect = options.clampToDocument === false
        ? this.getUnclampedDocumentRect(rect)
        : this.getClampedDocumentRect(rect);

      if (!captureRect) {
        return [];
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const startTx = Math.floor(captureRect.x / tileSize);
      const startTy = Math.floor(captureRect.y / tileSize);
      const endTx = Math.floor((captureRect.x + captureRect.width - 1) / tileSize);
      const endTy = Math.floor((captureRect.y + captureRect.height - 1) / tileSize);
      const patchLookup = this.getRasterHistoryPatchLookup(options.tilePatchRects || options.patchRects, { tileSize });
      const rects = [];

      for (let ty = startTy; ty <= endTy; ty += 1) {
        for (let tx = startTx; tx <= endTx; tx += 1) {
          const tileRect = this.getRasterHistoryTileBounds(tx, ty, {
            clampToDocument: options.clampToDocument,
            tileSize,
          });

          if (!tileRect) {
            continue;
          }

          const lookupPatchRect = patchLookup?.get(`${tx}:${ty}`) || null;
          const capturePatchRect = this.intersectRasterHistoryRects(tileRect, captureRect);
          if (patchLookup && !lookupPatchRect) {
            continue;
          }
          const patchRect = lookupPatchRect
            ? this.intersectRasterHistoryRects(lookupPatchRect, capturePatchRect)
            : capturePatchRect;

          if (!patchRect) {
            continue;
          }

          rects.push({
            patchRect: { ...patchRect },
            rect: { ...patchRect },
            tileRect: { ...tileRect },
            tx,
            ty,
          });
        }
      }

      return rects;
    }
,

    unionRasterHistoryRects(a, b) {
      if (!a) {
        return b ? { ...b } : null;
      }

      if (!b) {
        return { ...a };
      }

      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const x1 = Math.max(a.x + a.width, b.x + b.width);
      const y1 = Math.max(a.y + a.height, b.y + b.height);

      return {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }
,

    intersectRasterHistoryRects(a, b) {
      if (!a || !b) {
        return null;
      }

      const x0 = Math.max(a.x, b.x);
      const y0 = Math.max(a.y, b.y);
      const x1 = Math.min(a.x + a.width, b.x + b.width);
      const y1 = Math.min(a.y + a.height, b.y + b.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }
,

    containsRasterHistoryRect(container, rect) {
      return Boolean(
        container &&
        rect &&
        rect.x >= container.x &&
        rect.y >= container.y &&
        rect.x + rect.width <= container.x + container.width &&
        rect.y + rect.height <= container.y + container.height
      );
    }
,

    getRasterHistoryPatchLookup(patchRects = null, options = {}) {
      const items = patchRects instanceof Map
        ? Array.from(patchRects.values())
        : Array.isArray(patchRects)
          ? patchRects
          : [];

      if (items.length === 0) {
        return null;
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const lookup = new Map();

      for (const item of items) {
        const sourceRect = item?.patchRect || item?.rect || item;
        const rect = this.getClampedDocumentRect(sourceRect);

        if (!rect) {
          continue;
        }

        const startTx = Math.floor(rect.x / tileSize);
        const startTy = Math.floor(rect.y / tileSize);
        const endTx = Math.floor((rect.x + rect.width - 1) / tileSize);
        const endTy = Math.floor((rect.y + rect.height - 1) / tileSize);

        for (let ty = startTy; ty <= endTy; ty += 1) {
          for (let tx = startTx; tx <= endTx; tx += 1) {
            const tileRect = this.getRasterHistoryTileBounds(tx, ty, { tileSize });
            const patchRect = this.intersectRasterHistoryRects(tileRect, rect);

            if (!patchRect) {
              continue;
            }

            const key = `${tx}:${ty}`;
            lookup.set(key, this.unionRasterHistoryRects(lookup.get(key), patchRect));
          }
        }
      }

      return lookup.size > 0 ? lookup : null;
    }
,

    copyRasterSnapshotToSnapshot(sourceSnapshot, destSnapshot) {
      if (!sourceSnapshot || !destSnapshot) {
        return false;
      }

      if ((!sourceSnapshot.framebuffer || !sourceSnapshot.texture) && !this.hydrateRasterSnapshot(sourceSnapshot)) {
        return false;
      }

      if ((!destSnapshot.framebuffer || !destSnapshot.texture) && !this.hydrateRasterSnapshot(destSnapshot)) {
        return false;
      }

      if (!sourceSnapshot.framebuffer || !destSnapshot.framebuffer || !sourceSnapshot.rect || !destSnapshot.rect) {
        return false;
      }

      const sourceRect = sourceSnapshot.rect;
      const destRect = destSnapshot.rect;
      const destX0 = sourceRect.x - destRect.x;
      const destY0 = destRect.height - ((sourceRect.y - destRect.y) + sourceRect.height);
      const destX1 = destX0 + sourceRect.width;
      const destY1 = destY0 + sourceRect.height;

      if (
        destX0 < 0 ||
        destY0 < 0 ||
        destX1 > destRect.width ||
        destY1 > destRect.height
      ) {
        return false;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceSnapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destSnapshot.framebuffer);
      gl.blitFramebuffer(
        0,
        0,
        sourceRect.width,
        sourceRect.height,
        destX0,
        destY0,
        destX1,
        destY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

      return true;
    }
,

    expandRasterTileHistoryDelta(capture, delta, nextRect, options = {}) {
      if (!capture || !delta || !nextRect) {
        return false;
      }

      if (this.containsRasterHistoryRect(delta.rect, nextRect)) {
        return true;
      }

      const label = options.label || capture.label || options.source || "raster-tile-history";
      const layerId = delta.layerId || capture.layerId;
      const unionRect = this.unionRasterHistoryRects(delta.rect, nextRect);
      const previousBefore = delta.before;

      if (previousBefore?.empty === true) {
        const nextBefore = this.createEmptyRasterSnapshot(
          layerId,
          unionRect,
          `${label}-before-tile-${delta.tx}-${delta.ty}-expanded`,
        );

        if (!nextBefore) {
          return false;
        }

        this.deleteRasterSnapshot(previousBefore);
        this.deleteRasterSnapshot(delta.after);
        delta.after = null;
        delta.before = nextBefore;
        delta.rect = nextBefore.rect ? { ...nextBefore.rect } : { ...unionRect };

        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: nextBefore.bytes,
            layerId,
            patchRect: delta.rect,
            phase: "before-expand-empty",
            source: label,
            tileRect: delta.tileRect,
            tileSize: capture.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }

        return true;
      }

      const nextBefore = this.createRasterSnapshot(
        layerId,
        unionRect,
        `${label}-before-tile-${delta.tx}-${delta.ty}-expanded`,
      );

      if (!nextBefore?.texture && !nextBefore?.cpuPixels) {
        return false;
      }

      if (!this.copyRasterSnapshotToSnapshot(previousBefore, nextBefore)) {
        this.deleteRasterSnapshot(nextBefore);
        return false;
      }

      this.deleteRasterSnapshot(previousBefore);
      this.deleteRasterSnapshot(delta.after);
      delta.after = null;
      delta.before = nextBefore;
      delta.rect = nextBefore.rect ? { ...nextBefore.rect } : { ...unionRect };

      if (namespace.debugRasterHistoryTiles === true) {
        this.emitRasterHistoryTileDebug({
          bytes: nextBefore.bytes,
          layerId,
          patchRect: delta.rect,
          phase: "before-expand",
          source: label,
          tileRect: delta.tileRect,
          tileSize: capture.tileSize,
          tx: delta.tx,
          ty: delta.ty,
        });
      }

      return true;
    }
,

    createRasterTileHistoryBeforeSnapshot(layerId, tile, label = "raster-tile-history") {
      const target = this.rasterTargetsByLayerId.get(layerId) || this.getRasterTarget(layerId);
      const snapshotLabel = `${label}-before-tile-${tile.tx}-${tile.ty}`;

      if (this.isSparseRasterTarget(target)) {
        const tileTarget = this.getSparseRasterTile(target, tile.tx, tile.ty);

        if (tileTarget?.freshEmptyPaintTile === true && this.isTransparentRasterClearColor(target.clearColor)) {
          tileTarget.freshEmptyPaintTile = false;
          return this.createEmptyRasterSnapshot(layerId, tile.rect, snapshotLabel);
        }
      }

      return this.createRasterSnapshot(layerId, tile.rect, snapshotLabel);
    }
,

    extendRasterTileHistory(capture, dirtyRect, options = {}) {
      if (!capture || capture.destroyed === true || !Array.isArray(capture.tileDeltas)) {
        return false;
      }

      const captureRect = this.getClampedDocumentRect(dirtyRect);

      if (!captureRect) {
        return true;
      }

      const tileSize = this.getRasterHistoryTileSize({
        tileSize: capture.tileSize,
        ...options,
      });
      const existingDeltas = new Map(capture.tileDeltas.map((delta) => [`${delta.storeId}:${delta.tx}:${delta.ty}`, delta]));
      const label = options.label || capture.label || options.source || "raster-tile-history";
      const layerId = options.layerId || capture.layerId;

      for (const tile of this.getRasterHistoryTileRects(captureRect, {
        patchRects: options.patchRects,
        tilePatchRects: options.tilePatchRects,
        tileSize,
      })) {
        const storeId = `LayerPixels:${layerId}`;
        const key = `${storeId}:${tile.tx}:${tile.ty}`;
        const existingDelta = existingDeltas.get(key);

        if (existingDelta) {
          if (!this.expandRasterTileHistoryDelta(capture, existingDelta, tile.rect, { label, source: options.source })) {
            return false;
          }
          continue;
        }

        const before = this.createRasterTileHistoryBeforeSnapshot(layerId, tile, label);

        if (before?.empty !== true && !before?.texture && !before?.cpuPixels) {
          return false;
        }

        capture.tileDeltas.push({
          after: null,
          before,
          layerId,
          rect: before.rect ? { ...before.rect } : { ...tile.rect },
          storeId,
          tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
          tx: tile.tx,
          ty: tile.ty,
        });
        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: before.bytes,
            layerId,
            patchRect: before.rect ? { ...before.rect } : { ...tile.rect },
            phase: "before",
            source: label,
            tileRect: tile.tileRect || tile.rect,
            tileSize,
            tx: tile.tx,
            ty: tile.ty,
          });
        }
        existingDeltas.set(key, capture.tileDeltas[capture.tileDeltas.length - 1]);
      }

      capture.rect = this.unionRasterHistoryRects(capture.rect, captureRect);
      capture.projectionInvalidation = [{ ...capture.rect }];

      return true;
    }
,

    deleteRasterTileHistoryCapture(capture) {
      const deltas = Array.isArray(capture?.tileDeltas) ? capture.tileDeltas : [];

      for (const delta of deltas) {
        this.deleteRasterSnapshot(delta.before);
        this.deleteRasterSnapshot(delta.after);
        delta.before = null;
        delta.after = null;
      }

      if (capture) {
        capture.destroyed = true;
      }
    }
,

    beginRasterTileHistory(layerId, dirtyRect, options = {}) {
      if (!layerId || !dirtyRect) {
        return null;
      }

      if (options.silentBeforeRasterHistoryCapture !== true) {
        window.dispatchEvent(new CustomEvent("cbo:before-raster-history-capture", {
          detail: {
            layerId,
            label: options.label || "",
            source: options.source || options.label || "raster-tile-history",
          },
        }));
      }

      const target = this.rasterTargetsByLayerId.get(layerId) || this.getRasterTarget(layerId);
      const captureRect = this.getClampedDocumentRect(dirtyRect);

      if ((!this.isSparseRasterTarget(target) && (!target?.framebuffer || !target?.texture)) || !captureRect) {
        return null;
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const label = options.label || options.source || "raster-tile-history";
      const capture = {
        affectedNodes: [layerId],
        id: `raster-tile-history-${this.rasterTargetIdSequence++}`,
        label,
        layerId,
        projectionInvalidation: [{ ...captureRect }],
        rect: { ...captureRect },
        source: options.source || label,
        tileDeltas: [],
        tileSize,
        type: "raster-tile-history-capture",
      };

      if (!this.extendRasterTileHistory(capture, captureRect, {
        label,
        layerId,
        patchRects: options.patchRects,
        tilePatchRects: options.tilePatchRects,
        tileSize,
      })) {
        this.deleteRasterTileHistoryCapture(capture);
        return null;
      }

      return capture;
    }
,

    hasRasterTileHistorySnapshot(snapshot) {
      return Boolean(snapshot && (snapshot.empty === true || snapshot.texture || snapshot.framebuffer || snapshot.cpuPixels));
    }
,

    captureRasterTileHistoryAfterSnapshots(entry, options = {}) {
      if (!entry || !Array.isArray(entry.tileDeltas) || entry.tileDeltas.length === 0) {
        return false;
      }

      const label = options.label || entry.label || options.source || "raster-tile-history";
      const createdDeltas = [];

      for (const delta of entry.tileDeltas) {
        if (this.hasRasterTileHistorySnapshot(delta.after)) {
          continue;
        }

        const after = this.createRasterSnapshot(
          delta.layerId || entry.layerId,
          delta.rect,
          `${label}-after-tile-${delta.tx}-${delta.ty}`,
        );

        if (!after?.texture && !after?.cpuPixels) {
          for (const createdDelta of createdDeltas) {
            this.deleteRasterSnapshot(createdDelta.after);
            createdDelta.after = null;
          }

          entry.afterCaptureFailed = true;
          return false;
        }

        delta.after = after;
        createdDeltas.push(delta);
        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: after.bytes,
            layerId: delta.layerId || entry.layerId,
            patchRect: after.rect ? { ...after.rect } : { ...delta.rect },
            phase: "after",
            source: label,
            tileRect: delta.tileRect,
            tileSize: entry.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }
      }

      return true;
    }
,

    commitRasterTileHistory(capture, options = {}) {
      if (!capture || capture.destroyed === true || !Array.isArray(capture.tileDeltas)) {
        return null;
      }

      const label = options.label || capture.label || options.source || "raster-tile-history";
      const lazyAfter = options.lazyAfter === true;
      const renderer = this;
      const entry = {
        affectedNodes: [...capture.affectedNodes],
        id: capture.id,
        label,
        lazyAfter,
        layerId: capture.layerId,
        memoryPolicy: options.memoryPolicy || capture.memoryPolicy || null,
        projectionInvalidation: capture.projectionInvalidation.map((rect) => ({ ...rect })),
        rect: { ...capture.rect },
        source: options.source || capture.source || label,
        tileDeltas: capture.tileDeltas,
        tileSize: capture.tileSize,
        type: options.type || "tile-delta",
        undo() {
          if (this.lazyAfter && !renderer.captureRasterTileHistoryAfterSnapshots(this, {
            label,
            source: options.source || capture.source || label,
          })) {
            return false;
          }

          return renderer.restoreRasterTileHistoryEntry(this, "before", {
            releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
            source: options.undoSource || `history-undo-${this.source}`,
          });
        },
        redo() {
          return renderer.restoreRasterTileHistoryEntry(this, "after", {
            releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
            source: options.redoSource || `history-redo-${this.source}`,
          });
        },
        destroy() {
          renderer.deleteRasterTileHistoryCapture(this);
        },
      };

      if (!lazyAfter && !this.captureRasterTileHistoryAfterSnapshots(entry, {
        label,
        source: options.source || capture.source || label,
      })) {
        capture.commitFailed = true;
        return null;
      }

      capture.destroyed = true;
      return entry;
    }
,

    restoreRasterTileHistoryEntry(entry, snapshotKey = "before", options = {}) {
      const deltas = Array.isArray(entry?.tileDeltas) ? entry.tileDeltas : [];

      if (deltas.length === 0) {
        return false;
      }

      for (const delta of deltas) {
        if (!this.hasRasterTileHistorySnapshot(delta?.[snapshotKey])) {
          return false;
        }
      }

      for (const delta of deltas) {
        const layerId = delta.layerId || entry.layerId;
        const didRestore = this.restoreRasterSnapshot(layerId, delta[snapshotKey], {
          emit: false,
          releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
          source: options.source || "raster-tile-history-restore",
        });

        if (!didRestore) {
          return false;
        }

        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: delta[snapshotKey]?.bytes,
            layerId,
            patchRect: delta[snapshotKey]?.rect || delta.rect,
            phase: `restore-${snapshotKey}`,
            source: options.source || "raster-tile-history-restore",
            tileRect: delta.tileRect,
            tileSize: entry.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }
      }

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId: entry.layerId,
          preserveDirtyRects: true,
          rects: Array.isArray(entry.projectionInvalidation)
            ? entry.projectionInvalidation.map((rect) => ({ ...rect }))
            : (entry.rect ? [{ ...entry.rect }] : []),
          source: options.source || "raster-tile-history-restore",
        });
      }

      this.requestDraw();
      return true;
    }
,

    getSnapshotRect(target, rect = null) {
      if (!target || !Number.isFinite(target.width) || !Number.isFinite(target.height)) {
        return null;
      }

      if (!rect) {
        return {
          height: Math.max(1, Math.round(target.height)),
          width: Math.max(1, Math.round(target.width)),
          x: 0,
          y: 0,
        };
      }

      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const x = Math.max(0, Math.min(target.width - 1, Math.floor(rawX)));
      const y = Math.max(0, Math.min(target.height - 1, Math.floor(rawY)));
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : target.width - x;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : target.height - y;
      const width = Math.max(1, Math.min(target.width - x, Math.ceil(rawWidth)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil(rawHeight)));

      return { x, y, width, height };
    }
,

    createRasterSnapshotFromSparseTarget(sparseTarget, rect = null, label = "raster snapshot") {
      const docRect = this.getUnclampedDocumentRect(rect || this.getRasterTargetDocumentRect(sparseTarget));

      if (!this.isSparseRasterTarget(sparseTarget) || !docRect) {
        return null;
      }

      const tempTarget = this.createRasterTargetForUnclampedRect(docRect, [0, 0, 0, 0], 0, {
        layerId: sparseTarget.layerId || "",
        source: `${label}-sparse-temp`,
      });

      if (!tempTarget) {
        return null;
      }

      for (const tile of sparseTarget.tiles.values()) {
        const tileRect = this.getRasterTargetDocumentRect(tile);
        const patchRect = this.intersectRasterHistoryRects(tileRect, docRect);

        if (!patchRect) {
          continue;
        }

        if ((!tile.texture || !tile.framebuffer) && !this.hydrateRasterTarget(tile, {
          layerId: sparseTarget.layerId,
          ownerType: "live",
          reason: `${label}-sparse-hydrate`,
        })) {
          continue;
        }

        this.copyRasterTargetRectIntoTarget(tile, patchRect, tempTarget);
      }

      const snapshot = this.createRasterSnapshot(tempTarget, docRect, label);

      this.deleteRasterTargetObject(tempTarget);

      return snapshot;
    }
,

    createRasterSnapshot(targetOrLayerId, rect = null, label = "raster snapshot") {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId) || this.getRasterTarget(targetOrLayerId)
        : targetOrLayerId;

      if (this.isSparseRasterTarget(target)) {
        return this.createRasterSnapshotFromSparseTarget(target, rect, label);
      }

      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const snapshotRect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const targetRect = mappedRect?.targetRect;

      if (!target?.framebuffer || !snapshotRect || !docRect || !targetRect) {
        return null;
      }

      const layerId = typeof targetOrLayerId === "string" ? targetOrLayerId : target?.layerId || "";
      const snapshotId = `raster-snapshot-${this.rasterTargetIdSequence++}`;
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        snapshotRect.width,
        snapshotRect.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn(`Snapshot raster ${label} incompleto.`);
        return null;
      }

      const sourceX0 = snapshotRect.x;
      const sourceX1 = snapshotRect.x + snapshotRect.width;
      const sourceY0 = target.height - (snapshotRect.y + snapshotRect.height);
      const sourceY1 = target.height - snapshotRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        0,
        0,
        snapshotRect.width,
        snapshotRect.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const snapshot = {
        bytes: snapshotRect.width * snapshotRect.height * 4,
        id: snapshotId,
        framebuffer,
        label,
        layerId,
        rect: docRect,
        state: "GPU_HOT",
        targetRect,
        texture,
      };
      snapshot.dehydrateGpu = () => this.dehydrateRasterSnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateRasterSnapshot(snapshot);

      const textureRow = this.registerRasterTexture(texture, {
        bbox: docRect,
        height: snapshotRect.height,
        kind: "historySnapshot",
        label,
        layerId,
        originX: docRect.x,
        originY: docRect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width: snapshotRect.width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        height: snapshotRect.height,
        kind: "historySnapshotFramebuffer",
        label: `${label} framebuffer`,
        layerId,
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        width: snapshotRect.width,
      });

      return snapshot;
    }
,

    getRasterSnapshotDimensions(snapshot) {
      const rect = snapshot?.rect || snapshot?.targetRect || null;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      return { height, width };
    }
,

    dehydrateRasterSnapshot(snapshot) {
      if (!snapshot?.framebuffer || snapshot.state === "CPU_COLD") {
        return snapshot?.state === "CPU_COLD";
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const pixels = new Uint8Array(width * height * 4);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        console.warn?.("[CBO renderer] Impossibile raffreddare snapshot raster.", error);
        return false;
      }

      this.deleteRasterFramebuffer(snapshot.framebuffer);
      gl.deleteFramebuffer(snapshot.framebuffer);
      snapshot.framebuffer = null;

      if (snapshot.texture) {
        this.deleteRasterTexture(snapshot.texture);
        gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      const rawByteLength = pixels.byteLength;

      snapshot.bytes = snapshot.bytes || rawByteLength;
      snapshot.cpuBytes = rawByteLength;
      snapshot.cpuPixels = pixels;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = rawByteLength;
      snapshot.historyCompressionState = "raw-pending";
      snapshot.state = "CPU_COLD";
      window.CBO?.queueHistoryCompression?.(snapshot, {
        historyId: snapshot.id || snapshot.snapshotId || "",
        kind: "rasterSnapshot",
        layerId: snapshot.layerId || "",
        source: snapshot.label || "raster-snapshot-cpu-cold",
      });

      return true;
    }
,

    hydrateRasterSnapshot(snapshot, options = {}) {
      if (!snapshot || snapshot.texture || snapshot.framebuffer) {
        return Boolean(snapshot?.texture && snapshot?.framebuffer);
      }

      if (!(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      if (width <= 0 || height <= 0) {
        return false;
      }

      const compression = window.CBO?.HistoryCompression;
      let uploadPixels = snapshot.cpuPixels;

      if (snapshot.cpuPixelsEncoding) {
        if (!compression?.isCompressedEncoding?.(snapshot.cpuPixelsEncoding)) {
          return false;
        }

        try {
          uploadPixels = compression.decompressRgba(
            snapshot.cpuPixels,
            Number(snapshot.cpuRawBytes) || width * height * 4,
            snapshot.cpuPixelsEncoding,
          );
        } catch (error) {
          console.warn?.("[CBO renderer] Decompressione RLE history fallita.", error);
          return false;
        }
      }

      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      snapshot.framebuffer = framebuffer;
      snapshot.texture = texture;
      snapshot.state = "GPU_HOT";

      const layerId = snapshot.layerId || "";
      const textureRow = this.registerRasterTexture(texture, {
        bbox: snapshot.rect,
        height,
        kind: "historySnapshot",
        label: snapshot.label || "raster snapshot",
        layerId,
        originX: snapshot.rect?.x,
        originY: snapshot.rect?.y,
        ownerId: snapshot.id || this.nextRasterTargetId?.() || "raster-snapshot",
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "raster snapshot",
        state: "GPU_HOT",
        width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        height,
        kind: "historySnapshotFramebuffer",
        label: `${snapshot.label || "raster snapshot"} framebuffer`,
        layerId,
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshot.id || "",
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "raster snapshot",
        width,
      });

      if (options.retainCpuPixels !== true) {
        snapshot.cpuBytes = 0;
        snapshot.cpuPixels = null;
        snapshot.cpuPixelsEncoding = null;
        snapshot.cpuRawBytes = 0;
      } else {
        snapshot.cpuBytes = snapshot.cpuPixels.byteLength;
        snapshot.cpuRawBytes = Number(snapshot.cpuRawBytes) || width * height * 4;
      }

      return true;
    }
,

    releaseRetainedRasterSnapshotGpu(snapshot) {
      if (!snapshot || !(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const gl = this.gl;
      let didRelease = false;

      if (snapshot.framebuffer) {
        this.deleteRasterFramebuffer(snapshot.framebuffer);
        gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
        didRelease = true;
      }

      if (snapshot.texture) {
        this.deleteRasterTexture(snapshot.texture);
        gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
        didRelease = true;
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      snapshot.cpuBytes = snapshot.cpuPixels.byteLength;
      snapshot.cpuRawBytes = Number(snapshot.cpuRawBytes) || width * height * 4;
      snapshot.state = "CPU_COLD";

      return didRelease;
    }
,

    canRestoreRasterSnapshot(target, snapshot) {
      const mappedRect = this.getRasterTargetLocalRect(target, snapshot?.rect);
      const rect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const snapshotRect = snapshot?.rect;

      return Boolean(
        target?.framebuffer &&
        snapshot?.framebuffer &&
        rect &&
        docRect &&
        snapshotRect &&
        docRect.x === snapshotRect.x &&
        docRect.y === snapshotRect.y &&
        docRect.width === snapshotRect.width &&
        docRect.height === snapshotRect.height &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= target.width &&
        rect.y + rect.height <= target.height
      );
    }
,

    restoreRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !snapshot?.rect) {
        return false;
      }

      if (snapshot.empty === true) {
        return this.restoreEmptyRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options);
      }

      const needsHydrate = !snapshot.texture || !snapshot.framebuffer;
      const releaseSnapshotGpuAfterRestore = Boolean(
        options.releaseSnapshotGpuAfterRestore === true &&
        needsHydrate &&
        snapshot.cpuPixels instanceof Uint8Array
      );
      const finish = (result) => {
        if (releaseSnapshotGpuAfterRestore) {
          this.releaseRetainedRasterSnapshotGpu(snapshot);
        }

        return result;
      };

      if (needsHydrate && !this.hydrateRasterSnapshot(snapshot, {
        retainCpuPixels: releaseSnapshotGpuAfterRestore,
      })) {
        return false;
      }

      const sourceTarget = {
        framebuffer: snapshot.framebuffer,
        height: snapshot.rect.height,
        width: snapshot.rect.width,
        x: snapshot.rect.x,
        y: snapshot.rect.y,
      };
      let didRestore = false;
      const restoredTileKeys = [];

      for (const tile of this.getSparseRasterTileRects(snapshot.rect, {
        clampToDocument: false,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, {
          source: options.source || "raster-snapshot-sparse-restore",
        });
        const patchRect = this.intersectRasterHistoryRects(tile.tileRect || tile.rect, snapshot.rect);

        if (!tileTarget || !patchRect) {
          continue;
        }

        const didCopy = this.copyRasterTargetRectIntoTarget(sourceTarget, patchRect, tileTarget);

        if (didCopy) {
          didRestore = true;
          restoredTileKeys.push(tileTarget.tileKey || this.getSparseTileKey(tile.tx, tile.ty));
        }
      }

      if (!didRestore) {
        return finish(false);
      }

      const prunedCount = options.pruneTransparentTiles === false
        ? 0
        : this.pruneTransparentSparseRasterTiles(layerId, sparseTarget, restoredTileKeys);
      sparseTarget.version = (sparseTarget.version || 0) + 1;

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: snapshot.rect ? { ...snapshot.rect } : null,
          source: options.source || "raster-snapshot-sparse-restore",
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return finish(true);
    }
,

    restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options = {}) {
      const existingTarget = this.rasterTargetsByLayerId.get(layerId);

      if (
        !layerId ||
        !snapshot ||
        options.sparse === false ||
        !this.isPaintRasterLayer(layerId, existingTarget)
      ) {
        return false;
      }

      const sparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: existingTarget?.clearColor,
        tileSize: options.tileSize || existingTarget?.sparseTileSize || existingTarget?.tileSize,
      });
      const source = options.source || "raster-snapshot-sparse-restore";
      const didRestoreSparse = this.restoreRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, {
        ...options,
        emit: false,
        source,
      });

      if (!didRestoreSparse) {
        this.deleteRasterTargetObject(sparseTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);
      const previousTargetRect = this.getRasterTargetDocumentRect(previousTarget);
      const restoreDirtyRect = this.unionRasterHistoryRects(previousTargetRect, snapshot.rect);

      this.rasterTargetsByLayerId.set(layerId, sparseTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== sparseTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      this.commitVisualDirtyChange({
        emit: options.emit,
        layerId,
        rect: restoreDirtyRect || snapshot.rect,
        source,
        usePreviewDirtyTiles: true,
      });

      this.requestDraw();
      return true;
    }
,

    restoreEmptyRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !snapshot?.rect) {
        return false;
      }

      const gl = this.gl;
      const touchedTileKeys = [];
      let didTouchExistingTile = false;

      for (const tile of this.getSparseRasterTileRects(snapshot.rect, {
        clampToDocument: false,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileKey = this.getSparseTileKey(tile.tx, tile.ty);
        const tileTarget = sparseTarget.tiles.get(tileKey);
        const patchRect = this.intersectRasterHistoryRects(tile.tileRect || tile.rect, snapshot.rect);

        if (!tileTarget || !patchRect) {
          continue;
        }

        didTouchExistingTile = true;

        if (this.containsRasterHistoryRect(patchRect, tile.tileRect || tile.rect)) {
          this.deleteRasterTargetObject(tileTarget);
          sparseTarget.tiles.delete(tileKey);
          touchedTileKeys.push(tileKey);
          continue;
        }

        const mappedRect = this.getRasterTargetLocalRect(tileTarget, patchRect);
        const clearRect = mappedRect?.localRect;

        if (!tileTarget.framebuffer || !clearRect) {
          continue;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, tileTarget.framebuffer);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(clearRect.x, tileTarget.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.markRasterTargetDirty(tileTarget);
        touchedTileKeys.push(tileKey);
      }

      if (didTouchExistingTile) {
        this.pruneTransparentSparseRasterTiles(layerId, sparseTarget, touchedTileKeys);
        sparseTarget.version = (sparseTarget.version || 0) + 1;
      }

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: snapshot.rect ? { ...snapshot.rect } : null,
          source: options.source || "empty-raster-snapshot-sparse-restore",
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return true;
    }
,

    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      if (!layerId || !snapshot) {
        return false;
      }

      if (snapshot.empty === true) {
        const existingTarget = this.rasterTargetsByLayerId.get(layerId);

        if (this.isSparseRasterTarget(existingTarget)) {
          return this.restoreEmptyRasterSnapshotToSparseTarget(layerId, existingTarget, snapshot, options);
        }

        const didClear = this.clearRasterRect(layerId, snapshot.rect);

        if (options.emit !== false) {
          this.commitVisualDirtyChange({
            layerId,
            rect: snapshot.rect ? { ...snapshot.rect } : null,
            source: options.source || "empty-raster-snapshot-restore",
            usePreviewDirtyTiles: true,
          });
        }

        this.requestDraw();
        return didClear || !existingTarget;
      }

      const needsHydrate = !snapshot.texture || !snapshot.framebuffer;
      const releaseSnapshotGpuAfterRestore = Boolean(
        options.releaseSnapshotGpuAfterRestore === true &&
        needsHydrate &&
        snapshot.cpuPixels instanceof Uint8Array
      );
      const finish = (result) => {
        if (releaseSnapshotGpuAfterRestore) {
          this.releaseRetainedRasterSnapshotGpu(snapshot);
        }

        return result;
      };

      if (needsHydrate && !this.hydrateRasterSnapshot(snapshot, {
        retainCpuPixels: releaseSnapshotGpuAfterRestore,
      })) {
        return false;
      }

      let existingTarget = this.rasterTargetsByLayerId.get(layerId);
      const shouldRestoreAsSparseTarget = Boolean(
        options.sparse !== false &&
        (options.preferSparse === true || options.replaceSparse === true) &&
        this.isPaintRasterLayer(layerId, existingTarget)
      );

      if (this.needsCopyOnWriteDetach(existingTarget) && !shouldRestoreAsSparseTarget) {
        existingTarget = this.ensureWritableRasterTarget(layerId, {
          source: options.source || "raster-snapshot-copy-on-write-detach",
        }) || existingTarget;
      }

      if (this.isSparseRasterTarget(existingTarget)) {
        if (options.replaceSparse === true && shouldRestoreAsSparseTarget) {
          return finish(this.restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options));
        }

        return finish(this.restoreRasterSnapshotToSparseTarget(layerId, existingTarget, snapshot, options));
      }

      if (shouldRestoreAsSparseTarget && this.restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options)) {
        return finish(true);
      }

      let target = this.getRasterTarget(layerId);
      const snapshotTargetRect = snapshot.targetRect;
      const targetRect = this.getRasterTargetDocumentRect(target);
      const restoreDirtyRect = this.unionRasterHistoryRects(targetRect, snapshot.rect);

      if (
        snapshotTargetRect &&
        (
          targetRect.x !== snapshotTargetRect.x ||
          targetRect.y !== snapshotTargetRect.y ||
          targetRect.width !== snapshotTargetRect.width ||
          targetRect.height !== snapshotTargetRect.height
        ) &&
        snapshot.rect?.x === snapshotTargetRect.x &&
        snapshot.rect?.y === snapshotTargetRect.y &&
        snapshot.rect?.width === snapshotTargetRect.width &&
        snapshot.rect?.height === snapshotTargetRect.height
      ) {
        const nextTarget = this.createRasterTarget([0, 0, 0, 0], {
          cropped: this.isCroppedRect(snapshotTargetRect),
          height: snapshotTargetRect.height,
          width: snapshotTargetRect.width,
          x: snapshotTargetRect.x,
          y: snapshotTargetRect.y,
        });

        const gl = this.gl;

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, nextTarget.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          snapshotTargetRect.width,
          snapshotTargetRect.height,
          0,
          0,
          nextTarget.width,
          nextTarget.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        this.markRasterTargetDirty(nextTarget);
        this.replaceRasterTarget(layerId, nextTarget, {
          emit: false,
          source: options.source || "raster-snapshot-target-swap",
        });
        target = nextTarget;
      }

      if (!this.canRestoreRasterSnapshot(target, snapshot)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: options.source || "raster-snapshot-materialize",
        });
      }

      if (!this.canRestoreRasterSnapshot(target, snapshot)) {
        return finish(false);
      }

      const gl = this.gl;
      const rect = snapshot.rect;
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const localRect = mappedRect.localRect;
      const x0 = localRect.x;
      const x1 = localRect.x + localRect.width;
      const y0 = target.height - (localRect.y + localRect.height);
      const y1 = target.height - localRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(0, 0, localRect.width, localRect.height, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: restoreDirtyRect || (snapshot.rect ? { ...snapshot.rect } : null),
          source: options.source || "raster-snapshot-restore",
          usePreviewDirtyTiles: true,
        });
      }

      return finish(true);
    }
,

    deleteRasterSnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      if (snapshot?.framebuffer) {
        this.deleteRasterFramebuffer(snapshot.framebuffer);
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
      }

      if (snapshot?.texture) {
        this.deleteRasterTexture(snapshot.texture);
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;
      snapshot.state = "DELETED";
    }

    });
  };
})(window.CBO = window.CBO || {});
