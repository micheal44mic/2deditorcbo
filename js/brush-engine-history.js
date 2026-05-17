(function registerBrushEngineHistory(namespace) {
  namespace.BrushEngineMixins = namespace.BrushEngineMixins || {};

  function defineBrushEngineMethods(BrushEngine, methods) {
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(BrushEngine.prototype, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  namespace.BrushEngineMixins.history = function installBrushEngineHistory(BrushEngine, internals) {
    const {
      MIN_ZOOM,
      MAX_ZOOM,
      WHEEL_ZOOM_INTENSITY,
      PINCH_ZOOM_INTENSITY,
      ANDROID_PINCH_ZOOM_STEP_MIN,
      ANDROID_PINCH_ZOOM_STEP_MAX,
      TOUCH_NAVIGATION_STALE_POINTER_MS,
      CROPPED_BRUSH_STROKES,
      STROKE_ALLOCATION_QUANTUM,
      STROKE_FINAL_PADDING,
      STROKE_SAMPLE_CLAMP_MIN_PADDING,
      STROKE_PREVIEW_DIRTY_TILE_SIZE,
      STROKE_PREVIEW_DIRTY_MAX_RECTS,
      STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE,
      STROKE_TARGET_PREWARM_MAX_TILES,
      PREVIEW_DIRTY_DEBUG_EVENT,
      ERASER_EMPTY_LAYER_TOAST_MS,
      ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS,
      MAX_STAMPS_PER_FLUSH,
      MOBILE_MAX_STAMPS_PER_FLUSH,
      ANDROID_MAX_STAMPS_PER_FLUSH,
      DESKTOP_POINTER_SAMPLES_PER_FRAME,
      MOBILE_POINTER_SAMPLES_PER_FRAME,
      ANDROID_POINTER_SAMPLES_PER_FRAME,
      DESKTOP_POINTER_FRAME_BUDGET_MS,
      MOBILE_POINTER_FRAME_BUDGET_MS,
      ANDROID_POINTER_FRAME_BUDGET_MS,
      POINTER_SAMPLE_BACKLOG_MULTIPLIER,
      DESKTOP_STROKE_SEGMENT_MIN_SAMPLES,
      MOBILE_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MAX_SAMPLES,
      ANDROID_STROKE_SEGMENT_DISTANCE_STEP,
      ANDROID_STROKE_ALLOCATION_QUANTUM,
      BRUSH_HISTORY_BATCH_IDLE_MS,
      RASTER_BYTES_PER_PIXEL,
      RASTER_MIB,
      STROKE_MEMORY_POLICY,
      STROKE_SCRATCH_SOFT_EVICT_BYTES,
      STROKE_SCRATCH_HARD_WARN_BYTES,
      STROKE_SCRATCH_TOP_RESOURCE_LIMIT,
      STROKE_INCREMENTAL_BAKE_ENABLED,
      STROKE_INCREMENTAL_BAKE_COVERAGE,
      STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP,
      VELOCITY_PRESSURE_MAX_SPEED,
      VELOCITY_PRESSURE_SMOOTHING,
      RENDERING_MODE_PRESETS,
      STROKE_BUILDUP_EPSILON,
      STROKE_RENDER_MODE_PLATEAU,
      STROKE_RENDER_MODE_ACCUM,
      STROKE_RENDER_MODE_MIXED,
      COLOR_GOLDEN_RATIO,
    } = internals;

    defineBrushEngineMethods(BrushEngine, {
    classifyStrokeMemory(estimatedPeakBytes, coverage) {
      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.largeMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.mediumMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.largeCoverage
      ) {
        return "large";
      }

      if (estimatedPeakBytes > STROKE_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }
,

    createStrokeMemoryReport({
      layerId = "",
      phase = "brush-stroke",
      strokeBufferRect = null,
      strokeRect = null,
      target = this.getDocumentDrawTarget(layerId),
      tool = this.currentStrokeTool || "brush",
    } = {}) {
      const beforeBytes = this.getRasterRectBytes(strokeRect);
      const potentialAfterBytes = beforeBytes;
      const scratchBytes = this.getStrokeScratchBytes(strokeBufferRect);
      const persistentBytes = beforeBytes + potentialAfterBytes;
      const estimatedPeakBytes = persistentBytes + scratchBytes;
      const coverage = this.getRasterRectCoverage(strokeRect, target);
      const strokeBufferCoverage = this.getRasterRectCoverage(strokeBufferRect, target);
      const scratchDiagnostics = this.createStrokeScratchDiagnostics({
        scratchBytes,
        strokeBufferRect,
        strokeRect,
        target,
      });
      const policy = this.classifyStrokeMemory(estimatedPeakBytes, Math.max(coverage, strokeBufferCoverage));
      const hasTileHistory = typeof this.documentRenderer?.beginRasterTileHistory === "function";
      const historyMode = hasTileHistory
        ? "tile-before-after"
        : (
            policy === "huge"
              ? "gpu-before-no-redo"
              : "gpu-before-lazy-after"
          );

      return {
        beforeBytes,
        canvasSize: {
          height: Math.max(1, Math.round(target?.height || 1)),
          width: Math.max(1, Math.round(target?.width || 1)),
        },
        coverage,
        estimatedPeakBytes,
        historyMode,
        layerId,
        persistentBytes,
        phase,
        policy,
        potentialAfterBytes,
        reason: historyMode === "gpu-before-no-redo"
          ? "redo snapshot disabled for very large brush stroke"
          : "brush stroke memory estimate",
        scratchBytes,
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchTextureCount: this.getStrokeScratchTextureCount(),
        strokeScratchPressureEvictionCount: this.strokeScratchPressureEvictionCount || 0,
        ...this.getIncrementalStrokeBakeTelemetry(),
        scratchBudgetExceeded: scratchBytes >= STROKE_SCRATCH_SOFT_EVICT_BYTES,
        scratchHardBudgetExceeded: scratchBytes >= STROKE_SCRATCH_HARD_WARN_BYTES,
        scratchSoftEvictBytes: STROKE_SCRATCH_SOFT_EVICT_BYTES,
        scratchHardWarnBytes: STROKE_SCRATCH_HARD_WARN_BYTES,
        source: "brush-engine",
        strokeBufferCoverage,
        strokeScratchDiagnostics: scratchDiagnostics,
        strokeTargetAllocationCount: this.strokeTargetAllocationCount || 0,
        strokeTargetPeakCoverage: this.strokeTargetPeakCoverage || 0,
        strokeTargetPeakScratchBytes: this.strokeTargetPeakScratchBytes || 0,
        strokeTargetReallocationCount: this.strokeTargetReallocationCount || 0,
        strokeTargetReplaceCount: this.strokeTargetReplaceCount || 0,
        topScratchResources: scratchDiagnostics.topScratchResources,
        ...this.getRendererScratchPresence(),
        strokeBufferRect: strokeBufferRect ? { ...strokeBufferRect } : null,
        strokeRect: strokeRect ? { ...strokeRect } : null,
        tool,
      };
    }
,

    recordStrokeMemory(report) {
      if (!report) {
        return null;
      }

      this.lastStrokeMemoryReport = report;
      namespace.lastBrushStrokeMemoryReport = report;
      const recorded = namespace.rasterResourceManager?.recordStrokeMemory?.(report) || report;

      this.documentRenderer?.evictRasterScratchCachesForPolicy?.(recorded, {
        reason: recorded?.scratchBudgetExceeded ? "stroke-scratch-budget" : "stroke-memory-policy",
        source: "brush-stroke-memory",
      });

      if (namespace.debugRasterMemoryLogs !== true && namespace.debugStrokeMemoryLogs !== true) {
        return recorded;
      }

      if (report.policy === "large" || report.policy === "huge") {
        console.warn?.("[CBO brush] Stroke memory policy", recorded);
      } else if (report.policy === "medium") {
        console.info?.("[CBO brush] Stroke memory estimate", recorded);
      }

      return recorded;
    }
,

    pruneRasterHistoryForStroke(report) {
      const history = namespace.documentHistory;

      if (!history?.pruneRasterHistoryBudget || !report || report.policy === "normal") {
        return null;
      }

      return history.pruneRasterHistoryBudget({ deferGpuHotPrune: true });
    }
,

    coolRasterHistoryGpuHotForBrush() {
      const history = namespace.documentHistory;
      const isAndroid = this.isAndroidPerformanceMode?.() === true;
      const options = {
        initialDelayMs: isAndroid ? 350 : 90,
        maxChunkMs: isAndroid ? 3 : 7,
        maxSnapshotsPerChunk: isAndroid ? 1 : 8,
        minProtectedEntries: isAndroid ? 2 : 0,
        source: "brush-stroke",
        targetGpuHotBytes: isAndroid ? 48 * RASTER_MIB : 0,
      };

      if (typeof history?.scheduleRasterHistoryGpuHotPrune === "function") {
        return history.scheduleRasterHistoryGpuHotPrune(options);
      }

      if (!history?.pruneRasterHistoryGpuHotBudget) {
        return null;
      }

      return history.pruneRasterHistoryGpuHotBudget({
        minProtectedEntries: options.minProtectedEntries,
        targetGpuHotBytes: options.targetGpuHotBytes,
      });
    }
,

    canBatchBrushHistory() {
      return Boolean(
        this.options.enableHistory &&
        this.options.historyBatchIdleMs > 0 &&
        this.documentRenderer?.beginRasterTileHistory &&
        this.documentRenderer?.extendRasterTileHistory &&
        this.documentRenderer?.commitRasterTileHistory,
      );
    }
,

    clearPendingBrushHistoryTimer() {
      if (!this.pendingBrushHistoryTimer) {
        return;
      }

      window.clearTimeout(this.pendingBrushHistoryTimer);
      this.pendingBrushHistoryTimer = 0;
    }
,

    schedulePendingBrushHistoryCommit() {
      if (!this.pendingBrushHistory || this.isDisposed) {
        return;
      }

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistoryTimer = window.setTimeout(() => {
        this.pendingBrushHistoryTimer = 0;

        if (this.isDrawing || this.isPanning) {
          this.schedulePendingBrushHistoryCommit();
          return;
        }

        this.flushPendingBrushHistory({
          source: "brush-history-idle",
        });
      }, this.options.historyBatchIdleMs);
    }
,

    isPendingBrushHistoryCompatible(layerId, source) {
      const pending = this.pendingBrushHistory;

      return Boolean(
        pending &&
        pending.layerId === layerId &&
        pending.source === source,
      );
    }
,

    getMergedBrushHistoryMemoryReport(previous, next) {
      if (!previous) {
        return next ? {
          ...next,
          phase: "brush-history-batch",
          strokeCount: 1,
        } : null;
      }

      if (!next) {
        return previous;
      }

      const policyRank = {
        normal: 0,
        medium: 1,
        large: 2,
        huge: 3,
      };
      const previousPolicy = String(previous.policy || "normal");
      const nextPolicy = String(next.policy || "normal");
      const policy = (policyRank[nextPolicy] || 0) > (policyRank[previousPolicy] || 0)
        ? nextPolicy
        : previousPolicy;

      return {
        ...previous,
        canvasSize: next.canvasSize || previous.canvasSize,
        coverage: Math.max(Number(previous.coverage) || 0, Number(next.coverage) || 0),
        estimatedPeakBytes: Math.max(
          Number(previous.estimatedPeakBytes) || 0,
          Number(next.estimatedPeakBytes) || 0,
        ),
        phase: "brush-history-batch",
        policy,
        scratchBytes: Math.max(Number(previous.scratchBytes) || 0, Number(next.scratchBytes) || 0),
        strokeCount: (Number(previous.strokeCount) || 1) + 1,
        strokeRect: this.unionRects(previous.strokeRect, next.strokeRect),
      };
    }
,

    prepareBatchedBrushHistory(layerId, strokeRect, memoryReport, tilePatchRects = this.getActiveStrokeTilePatchRects(strokeRect)) {
      if (!this.canBatchBrushHistory() || !layerId || !strokeRect) {
        return null;
      }

      const source = this.currentStrokeTool || "brush";

      if (this.pendingBrushHistory && !this.isPendingBrushHistoryCompatible(layerId, source)) {
        this.flushPendingBrushHistory({
          source: "brush-history-switch",
        });
      }

      if (!this.pendingBrushHistory) {
        const capture = this.documentRenderer.beginRasterTileHistory(layerId, strokeRect, {
          label: "brush-stroke",
          source,
          tilePatchRects,
        });

        if (!capture) {
          return null;
        }

        this.pendingBrushHistory = {
          capture,
          createdAt: Date.now(),
          layerId,
          memoryPolicy: this.getMergedBrushHistoryMemoryReport(null, memoryReport),
          source,
          strokeCount: 1,
          updatedAt: Date.now(),
        };

        return capture;
      }

      const didExtend = this.documentRenderer.extendRasterTileHistory(this.pendingBrushHistory.capture, strokeRect, {
        label: "brush-stroke",
        layerId,
        source,
        tilePatchRects,
      });

      if (!didExtend) {
        this.flushPendingBrushHistory({
          source: "brush-history-extend-failed",
        });
        return null;
      }

      this.pendingBrushHistory.memoryPolicy = this.getMergedBrushHistoryMemoryReport(
        this.pendingBrushHistory.memoryPolicy,
        memoryReport,
      );
      this.pendingBrushHistory.strokeCount += 1;
      this.pendingBrushHistory.updatedAt = Date.now();

      return this.pendingBrushHistory.capture;
    }
,

    flushPendingBrushHistory(options = {}) {
      const pending = this.pendingBrushHistory;

      if (!pending || this.isFlushingBrushHistory) {
        return false;
      }

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistory = null;
      this.isFlushingBrushHistory = true;

      try {
        const history = namespace.documentHistory;
        const tileEntry = this.documentRenderer?.commitRasterTileHistory?.(pending.capture, {
          label: "brush-stroke",
          lazyAfter: true,
          memoryPolicy: pending.memoryPolicy,
          redoSource: `history-redo-${pending.source}`,
          source: pending.source,
          type: "pixel",
          undoSource: `history-undo-${pending.source}`,
        });
        const entry = tileEntry
          ? this.documentRenderer?.finalizeRasterEditHistoryEntry?.(pending.layerId, tileEntry, {
              source: pending.source,
            }) || tileEntry
          : null;

        if (history?.push && entry) {
          history.push(entry, {
            source: options.source || "brush-history-batch",
          });
          this.pruneRasterHistoryForStroke(pending.memoryPolicy);
          this.coolRasterHistoryGpuHotForBrush();
          return true;
        }

        this.documentRenderer?.finalizeRasterEditHistoryEntry?.(pending.layerId, null, {
          source: pending.source,
        });
        this.documentRenderer?.deleteRasterTileHistoryCapture?.(pending.capture);
        return false;
      } finally {
        this.isFlushingBrushHistory = false;
        this.requestDraw();
      }
    }
,

    discardPendingBrushHistory() {
      if (!this.pendingBrushHistory) {
        return;
      }

      const pending = this.pendingBrushHistory;

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistory = null;
      this.documentRenderer?.deleteRasterTileHistoryCapture?.(pending.capture);
    }
,

    handleBeforeHistoryAction(event) {
      const action = String(event.detail?.action || "").trim().toLowerCase();

      if (action === "undo" || action === "redo") {
        this.flushPendingBrushHistory({
          source: `brush-before-${action}`,
        });
      }
    }
,

    handleBeforeRasterHistoryCapture(event) {
      const source = String(event.detail?.source || "").trim().toLowerCase();

      if (source === "brush" || source === "eraser" || source === "brush-stroke") {
        return;
      }

      this.flushPendingBrushHistory({
        source: source ? `brush-before-${source}` : "brush-before-raster-history",
      });
    }
,

    createHistorySnapshot(target, rect, label = "history snapshot") {
      if (!target?.framebuffer || !Number.isFinite(target.width) || !Number.isFinite(target.height) || !rect) {
        return null;
      }

      const targetRect = this.documentRenderer?.getRasterTargetDocumentRect?.(target) || {
        height: Math.max(1, Math.round(target.height || 1)),
        width: Math.max(1, Math.round(target.width || 1)),
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
      };
      const snapshotDocRect = this.intersectDocumentRects(rect, targetRect);

      if (!snapshotDocRect) {
        return null;
      }

      const gl = this.gl;
      const x = Math.max(0, Math.floor(snapshotDocRect.x - targetRect.x));
      const y = Math.max(0, Math.floor(snapshotDocRect.y - targetRect.y));
      const width = Math.max(1, Math.min(target.width - x, Math.ceil(snapshotDocRect.width)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil(snapshotDocRect.height)));
      const texture = gl.createTexture();

      if (!texture) {
        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.copyTexSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        x,
        target.height - (y + height),
        width,
        height,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const snapshotId = this.nextBrushResourceOwnerId("brush-history-snapshot");
      const docRect = {
        height,
        width,
        x: targetRect.x + x,
        y: targetRect.y + y,
      };
      const snapshot = {
        bytes: width * height * 4,
        docRect,
        id: snapshotId,
        label,
        layerId: this.strokeTargetLayerId || target?.layerId || "",
        rect: { x, y, width, height },
        state: "GPU_HOT",
        texture,
      };
      snapshot.dehydrateGpu = () => this.dehydrateHistorySnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateHistorySnapshot(snapshot);

      this.registerBrushTexture(texture, {
        bbox: docRect,
        height,
        kind: "historySnapshot",
        label,
        layerId: snapshot.layerId,
        originX: docRect.x,
        originY: docRect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width,
      });

      return snapshot;
    }
,

    dehydrateHistorySnapshot(snapshot) {
      if (!snapshot?.texture || snapshot.state === "CPU_COLD") {
        return snapshot?.state === "CPU_COLD";
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const framebuffer = gl.createFramebuffer();

      if (!framebuffer) {
        return false;
      }

      const pixels = new Uint8Array(width * height * 4);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, snapshot.texture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteFramebuffer(framebuffer);
          return false;
        }

        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        console.warn?.("[CBO brush] Impossibile raffreddare snapshot pennellata.", error);
        return false;
      }

      gl.deleteFramebuffer(framebuffer);
      this.deleteBrushTexture(snapshot.texture);
      gl.deleteTexture(snapshot.texture);
      snapshot.texture = null;

      const rawByteLength = pixels.byteLength;

      snapshot.bytes = snapshot.bytes || rawByteLength;
      snapshot.cpuBytes = rawByteLength;
      snapshot.cpuPixels = pixels;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = rawByteLength;
      snapshot.historyCompressionState = "raw-pending";
      snapshot.state = "CPU_COLD";
      window.CBO?.queueHistoryCompression?.(snapshot, {
        historyId: snapshot.id || "",
        kind: "brushHistorySnapshot",
        layerId: snapshot.layerId || "",
        source: snapshot.label || "brush-history-snapshot",
      });

      return true;
    }
,

    hydrateHistorySnapshot(snapshot) {
      if (!snapshot || snapshot.texture) {
        return Boolean(snapshot?.texture);
      }

      if (!(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

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
          console.warn?.("[CBO brush] Decompressione RLE snapshot fallita.", error);
          return false;
        }
      }

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);
      gl.bindTexture(gl.TEXTURE_2D, null);

      snapshot.texture = texture;
      snapshot.state = "GPU_HOT";

      this.registerBrushTexture(texture, {
        bbox: snapshot.docRect || snapshot.rect,
        height,
        kind: "historySnapshot",
        label: snapshot.label || "history snapshot",
        layerId: snapshot.layerId || "",
        originX: snapshot.docRect?.x,
        originY: snapshot.docRect?.y,
        ownerId: snapshot.id || this.nextBrushResourceOwnerId("brush-history-snapshot"),
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "history snapshot",
        state: "GPU_HOT",
        width,
      });

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;

      return true;
    }
,

    restoreHistorySnapshot(layerId, snapshot) {
      if (!layerId || !snapshot?.rect) {
        return false;
      }

      if (!snapshot.texture && !this.hydrateHistorySnapshot(snapshot)) {
        return false;
      }

      const target = this.documentRenderer?.getRasterTarget?.(layerId);

      if (!target?.framebuffer || !target?.texture) {
        return false;
      }

      const gl = this.gl;
      const rect = snapshot.rect;
      const { program, uniforms } = this.compositeProgramInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(rect.x, target.height - (rect.y + rect.height), rect.width, rect.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, snapshot.texture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.opacity, 1.0);
      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail: { layerId, source: "history-restore" },
      }));
      this.requestDraw();

      return true;
    }
,

    deleteHistorySnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      if (snapshot?.texture) {
        this.deleteBrushTexture(snapshot.texture);
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      if (snapshot?.framebuffer) {
        this.deleteBrushFramebuffer(snapshot.framebuffer);
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
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
