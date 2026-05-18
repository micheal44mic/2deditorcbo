(function registerBrushEngineTargetGpu(namespace) {
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

  namespace.BrushEngineMixins.targetGpu = function installBrushEngineTargetGpu(BrushEngine, internals) {
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
    const MOBILE_DENSE_BRUSH_TARGET_PATCH_THRESHOLD = 48;
    const MOBILE_DENSE_BRUSH_TARGET_COVERAGE_THRESHOLD = 0.35;

    defineBrushEngineMethods(BrushEngine, {
    getRasterResourceManager() {
      return window.CBO?.rasterResourceManager || null;
    }
,

    getRasterResourceDocumentMetadata(metadata = {}) {
      const renderer = window.CBO?.documentRenderer || this.documentRenderer;

      return {
        ...metadata,
        documentHeight: metadata.documentHeight ?? renderer?.height,
        documentWidth: metadata.documentWidth ?? renderer?.width,
      };
    }
,

    nextBrushResourceOwnerId(prefix = "brush-resource") {
      this.rasterResourceIdSequence = this.rasterResourceIdSequence || 1;

      return `${prefix}-${this.rasterResourceIdSequence++}`;
    }
,

    registerBrushTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.getRasterResourceDocumentMetadata(metadata));
    }
,

    registerBrushFramebuffer(framebuffer, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerFramebuffer || !framebuffer) {
        return null;
      }

      return manager.registerFramebuffer(framebuffer, this.getRasterResourceDocumentMetadata(metadata));
    }
,

    deleteBrushTexture(textureOrId) {
      return this.getRasterResourceManager()?.deleteTexture?.(textureOrId) || false;
    }
,

    deleteBrushFramebuffer(framebufferOrId) {
      return this.getRasterResourceManager()?.deleteFramebuffer?.(framebufferOrId) || false;
    }
,

    configureGlState() {
      const gl = this.gl;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
,

    resizeViewport() {
      const gl = this.gl;
      const rect = this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, this.canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, this.canvas.clientHeight || Math.round(rect.height) || 1);
      const nextDpr = namespace.DocumentRenderer?.getPerformanceDpr?.() || Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const nextWidth = Math.max(1, Math.round(cssWidth * nextDpr));
      const nextHeight = Math.max(1, Math.round(cssHeight * nextDpr));
      const didResize =
        this.canvas.width !== nextWidth ||
        this.canvas.height !== nextHeight ||
        this.viewportWidth !== nextWidth ||
        this.viewportHeight !== nextHeight ||
        this.dpr !== nextDpr;

      if (!didResize) {
        return false;
      }

      this.dpr = nextDpr;
      this.viewportWidth = nextWidth;
      this.viewportHeight = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      gl.viewport(0, 0, nextWidth, nextHeight);

      return true;
    }
,

    getPaintTarget() {
      const target = this.documentRenderer?.getPaintTarget?.();

      if (
        !target ||
        !target.framebuffer ||
        !target.texture ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height)
      ) {
        throw new Error("BrushEngine richiede un target documento valido.");
      }

      return target;
    }
,

    getDocumentDrawTarget(layerId = "") {
      const target = this.documentRenderer?.getDocumentDrawTarget?.(layerId) || this.documentRenderer?.getPaintTarget?.();

      if (
        !target ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height)
      ) {
        throw new Error("BrushEngine richiede dimensioni documento valide.");
      }

      return target;
    }
,

    centerCamera() {
      const target = this.getDocumentDrawTarget();
      const zoom = Math.max(
        0.0001,
        Math.min(this.viewportWidth / target.width, this.viewportHeight / target.height),
      );
      const artboardWidth = target.width * zoom;
      const artboardHeight = target.height * zoom;

      this.camera.zoom = zoom;
      this.camera.x = (this.viewportWidth - artboardWidth) * 0.5;
      this.camera.y = (this.viewportHeight - artboardHeight) * 0.5;
    }
,

    createFullscreenQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      // Triangle strip in clip space: copre l'intero target FBO senza scomodare la camera.
      const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare il quad fullscreen GPU.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, buffer };
    }
,

    createTransparentRenderTarget(label, width, height, resourceMetadata = {}) {
      const gl = this.gl;
      const documentTarget = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const targetWidth = Math.max(1, Math.round(width || documentTarget.width));
      const targetHeight = Math.max(1, Math.round(height || documentTarget.height));
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetLabel = label || "Render target";

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error(`Impossibile creare ${targetLabel} in VRAM.`);
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Sampling lineare come il documento: niente gradoni grossi a zoom intermedi.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        targetWidth,
        targetHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error(`${targetLabel} incompleto: impossibile inizializzare il livello tratto.`);
      }

      gl.viewport(0, 0, targetWidth, targetHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const ownerId = resourceMetadata.ownerId || this.nextBrushResourceOwnerId("brush-stroke-target");
      const target = {
        framebuffer,
        height: targetHeight,
        id: ownerId,
        texture,
        width: targetWidth,
      };
      const textureRow = this.registerBrushTexture(texture, {
        height: targetHeight,
        kind: "strokeScratch",
        label: targetLabel,
        ownerId,
        ownerType: "scratch",
        purgeable: false,
        reason: "brush-engine",
        width: targetWidth,
        ...resourceMetadata,
      });

      this.registerBrushFramebuffer(framebuffer, {
        height: targetHeight,
        kind: "strokeScratchFramebuffer",
        label: `${targetLabel} framebuffer`,
        linkedTextureId: textureRow?.id || "",
        ownerId,
        ownerType: "scratch",
        purgeable: false,
        reason: "brush-engine",
        width: targetWidth,
        ...resourceMetadata,
      });

      return target;
    }
,

    createStrokeLayerTarget(rect = null) {
      const gl = this.gl;
      const targets = [];
      const documentTarget = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const nextRect = rect || {
        x: 0,
        y: 0,
        width: documentTarget.width,
        height: documentTarget.height,
      };

      try {
        const resourceMetadata = {
          bbox: nextRect,
          originX: nextRect.x,
          originY: nextRect.y,
          reason: "create-stroke-layer-target",
        };

        const renderMode = this.getStrokeRenderMode();

        targets.push(this.createTransparentRenderTarget("Stroke FBO", nextRect.width, nextRect.height, resourceMetadata));

        if (renderMode === STROKE_RENDER_MODE_MIXED) {
          targets.push(this.createTransparentRenderTarget("Stroke plateau FBO", nextRect.width, nextRect.height, resourceMetadata));
          targets.push(this.createTransparentRenderTarget("Stroke accumulation FBO", nextRect.width, nextRect.height, resourceMetadata));
        }
      } catch (error) {
        this.deleteStrokeTargets(targets);

        throw error;
      }

      this.strokeTexture = targets[0].texture;
      this.strokeFBO = targets[0].framebuffer;
      this.strokePlateauTexture = targets[1]?.texture || null;
      this.strokePlateauFBO = targets[1]?.framebuffer || null;
      this.strokeAccumTexture = targets[2]?.texture || null;
      this.strokeAccumFBO = targets[2]?.framebuffer || null;
      this.strokeBufferRect = { ...nextRect };
      this.strokeTargetAllocationCount += 1;
      this.updateStrokeScratchDiagnostics(nextRect, documentTarget);
      this.evictRasterScratchCachesForStrokePressure(nextRect, documentTarget, "create-stroke-layer-target");
    }
,

    usesIsolatedDocumentArtboards() {
      return this.options?.isolateDocumentArtboards === true ||
        this.documentRenderer?.options?.isolateDocumentArtboards === true;
    }
,

    getFullDocumentRect(target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const documentBounds = this.usesIsolatedDocumentArtboards()
        ? null
        : this.documentRenderer?.getDocumentBoundsRect?.();

      if (documentBounds) {
        return {
          x: Math.round(Number(documentBounds.x) || 0),
          y: Math.round(Number(documentBounds.y) || 0),
          width: Math.max(1, Math.round(Number(documentBounds.width) || 1)),
          height: Math.max(1, Math.round(Number(documentBounds.height) || 1)),
        };
      }

      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(target.width || 1)),
        height: Math.max(1, Math.round(target.height || 1)),
      };
    }
,

    getActiveDocumentPaintRect(layerId = this.strokeTargetLayerId || "") {
      if (this.usesIsolatedDocumentArtboards()) {
        return null;
      }

      return namespace.getActiveDocumentArtboardRect?.({ layerId }) || null;
    }
,

    getStrokeAllocationBounds(target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      return this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target?.layerId || "") ||
        this.getFullDocumentRect(target);
    }
,

    getRasterRectBytes(rect) {
      if (!rect) {
        return 0;
      }

      const width = Math.max(0, Math.round(rect.width || 0));
      const height = Math.max(0, Math.round(rect.height || 0));

      return width * height * RASTER_BYTES_PER_PIXEL;
    }
,

    getRasterRectCoverage(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target?.layerId || "");
      const canvasPixels = Math.max(1, Math.round(paintRect?.width || target?.width || 1)) *
        Math.max(1, Math.round(paintRect?.height || target?.height || 1));
      const rectPixels = Math.max(0, Math.round(rect?.width || 0)) *
        Math.max(0, Math.round(rect?.height || 0));

      return rectPixels / canvasPixels;
    }
,

    formatRasterMiB(bytes) {
      return (Math.max(0, Number(bytes) || 0) / RASTER_MIB).toFixed(2);
    }
,

    getStrokeScratchBytes(strokeBufferRect = this.strokeBufferRect) {
      return this.getRasterRectBytes(strokeBufferRect) * this.getStrokeScratchTextureCount();
    }
,

    resetStrokeAllocationDiagnostics() {
      this.strokeTargetAllocationCount = 0;
      this.strokeTargetReplaceCount = 0;
      this.strokeTargetReallocationCount = 0;
      this.strokeTargetPeakScratchBytes = 0;
      this.strokeTargetPeakCoverage = 0;
      this.strokeTargetLastAllocationRect = null;
      this.strokeScratchPressureEvictionCount = 0;
      this.lastStrokeScratchDiagnostics = null;
      this.incrementalStrokeBakeCount = 0;
      this.incrementalStrokeBakeBytesFreed = 0;
      this.incrementalStrokeBakePeakScratchBytes = 0;
      this.incrementalStrokeBakeLastReason = "";
      this.incrementalStrokeBakeLastRect = null;
      this.incrementalStrokeBakeSkippedReason = "";
      this.incrementalStrokeBakedRect = null;
      this.lastIncrementalStrokeBakeDecision = null;
      this.isIncrementalStrokeBakeInProgress = false;
    }
,

    updateStrokeScratchDiagnostics(rect = this.strokeBufferRect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const scratchBytes = this.getStrokeScratchBytes(rect);
      const coverage = this.getRasterRectCoverage(rect, target);

      this.strokeTargetPeakScratchBytes = Math.max(this.strokeTargetPeakScratchBytes || 0, scratchBytes);
      this.strokeTargetPeakCoverage = Math.max(this.strokeTargetPeakCoverage || 0, coverage);
      this.strokeTargetLastAllocationRect = rect ? { ...rect } : null;

      const diagnostics = {
        coverage,
        coveragePercent: Number((coverage * 100).toFixed(2)),
        hardWarnBytes: STROKE_SCRATCH_HARD_WARN_BYTES,
        hardWarnMiB: this.formatRasterMiB(STROKE_SCRATCH_HARD_WARN_BYTES),
        peakCoverage: this.strokeTargetPeakCoverage || 0,
        peakCoveragePercent: Number(((this.strokeTargetPeakCoverage || 0) * 100).toFixed(2)),
        peakScratchBytes: this.strokeTargetPeakScratchBytes || 0,
        peakScratchMiB: this.formatRasterMiB(this.strokeTargetPeakScratchBytes || 0),
        scratchBytes,
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchTextureCount: this.getStrokeScratchTextureCount(),
        softEvictBytes: STROKE_SCRATCH_SOFT_EVICT_BYTES,
        softEvictMiB: this.formatRasterMiB(STROKE_SCRATCH_SOFT_EVICT_BYTES),
        strokeBufferRect: rect ? { ...rect } : null,
        strokeScratchPressureEvictionCount: this.strokeScratchPressureEvictionCount || 0,
        ...this.getIncrementalStrokeBakeTelemetry(),
        strokeTargetAllocationCount: this.strokeTargetAllocationCount || 0,
        strokeTargetReallocationCount: this.strokeTargetReallocationCount || 0,
        strokeTargetReplaceCount: this.strokeTargetReplaceCount || 0,
      };

      this.lastStrokeScratchDiagnostics = diagnostics;
      namespace.lastBrushStrokeScratchDiagnostics = diagnostics;

      return diagnostics;
    }
,

    evictRasterScratchCachesForStrokePressure(rect = this.strokeBufferRect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || ""), reason = "brush-stroke-scratch-pressure") {
      const scratchBytes = this.getStrokeScratchBytes(rect);

      if (scratchBytes < STROKE_SCRATCH_SOFT_EVICT_BYTES) {
        return null;
      }

      this.strokeScratchPressureEvictionCount = (this.strokeScratchPressureEvictionCount || 0) + 1;
      const coverage = this.getRasterRectCoverage(rect, target);
      const scratchHardBudgetExceeded = scratchBytes >= STROKE_SCRATCH_HARD_WARN_BYTES;
      const report = {
        coverage,
        createdAt: new Date().toISOString(),
        estimatedPeakBytes: scratchBytes,
        phase: "brush-live-stroke-scratch",
        policy: scratchHardBudgetExceeded ? "huge" : "large",
        reason,
        scratchBudgetExceeded: true,
        scratchBytes,
        scratchHardBudgetExceeded,
        scratchHardWarnBytes: STROKE_SCRATCH_HARD_WARN_BYTES,
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchSoftEvictBytes: STROKE_SCRATCH_SOFT_EVICT_BYTES,
        source: "brush-engine",
        strokeBufferCoverage: coverage,
        strokeBufferRect: rect ? { ...rect } : null,
        strokeScratchDiagnostics: this.lastStrokeScratchDiagnostics || null,
        ...this.getIncrementalStrokeBakeTelemetry(),
        strokeTargetAllocationCount: this.strokeTargetAllocationCount || 0,
        strokeTargetPeakCoverage: this.strokeTargetPeakCoverage || 0,
        strokeTargetPeakScratchBytes: this.strokeTargetPeakScratchBytes || 0,
        strokeTargetReallocationCount: this.strokeTargetReallocationCount || 0,
        strokeTargetReplaceCount: this.strokeTargetReplaceCount || 0,
        tool: this.currentStrokeTool || "brush",
      };
      const eviction = this.documentRenderer?.evictRasterScratchCachesForPolicy?.(report, {
        deleteActiveStrokeScratch: true,
        deleteCompositeScratch: true,
        deleteEffectScratch: true,
        deletePreviewCache: true,
        reason,
        source: "brush-live-stroke-scratch",
      }) || null;

      if (eviction) {
        namespace.lastBrushStrokeScratchPressureEviction = eviction;
      }

      return eviction;
    }
,

    getRendererScratchPresence() {
      const renderer = this.documentRenderer || namespace.documentRenderer;
      const getTargetSize = (target) => target
        ? {
            height: Math.max(0, Math.round(target.height || 0)),
            width: Math.max(0, Math.round(target.width || 0)),
          }
        : null;
      const getTargetBytes = (target) => {
        const size = getTargetSize(target);

        return size ? size.width * size.height * RASTER_BYTES_PER_PIXEL : 0;
      };
      const activeStrokeScratchTargetBytes = getTargetBytes(renderer?.activeStrokeScratchTarget);
      const layerEffectScratchABytes = getTargetBytes(renderer?.layerEffectScratchA);
      const layerEffectScratchBBytes = getTargetBytes(renderer?.layerEffectScratchB);
      const layerEffectScratchBytes = layerEffectScratchABytes + layerEffectScratchBBytes;
      const rendererScratchDiagnostics = renderer?.getRasterScratchDiagnostics?.() || null;

      return {
        activeStrokeScratchTargetBytes,
        activeStrokeScratchTargetMiB: this.formatRasterMiB(activeStrokeScratchTargetBytes),
        activeStrokeScratchTargetPresent: Boolean(renderer?.activeStrokeScratchTarget?.texture),
        activeStrokeScratchTargetSize: getTargetSize(renderer?.activeStrokeScratchTarget),
        layerEffectScratchABytes,
        layerEffectScratchAMiB: this.formatRasterMiB(layerEffectScratchABytes),
        layerEffectScratchAPresent: Boolean(renderer?.layerEffectScratchA?.texture),
        layerEffectScratchASize: getTargetSize(renderer?.layerEffectScratchA),
        layerEffectScratchBBytes,
        layerEffectScratchBMiB: this.formatRasterMiB(layerEffectScratchBBytes),
        layerEffectScratchBPresent: Boolean(renderer?.layerEffectScratchB?.texture),
        layerEffectScratchBSize: getTargetSize(renderer?.layerEffectScratchB),
        layerEffectScratchBytes,
        layerEffectScratchMiB: this.formatRasterMiB(layerEffectScratchBytes),
        layerEffectScratchPresent: Boolean(renderer?.layerEffectScratchA?.texture || renderer?.layerEffectScratchB?.texture),
        rendererScratchDiagnostics,
      };
    }
,

    getTopScratchResources(limit = STROKE_SCRATCH_TOP_RESOURCE_LIMIT) {
      const manager = this.getRasterResourceManager();
      const normalizedLimit = Math.max(1, Math.floor(Number(limit) || STROKE_SCRATCH_TOP_RESOURCE_LIMIT));
      const rows = typeof manager?.getTopScratchResourcesByBytes === "function"
        ? manager.getTopScratchResourcesByBytes(normalizedLimit)
        : (
            typeof manager?.getTopResourcesByBytes === "function"
              ? manager.getTopResourcesByBytes(64).filter((row) => row.ownerType === "scratch").slice(0, normalizedLimit)
              : []
          );

      return rows.map((row) => ({
        bbox: row.bbox ? { ...row.bbox } : null,
        bytes: Math.max(0, Math.round(Number(row.bytes) || 0)),
        height: Math.max(0, Math.round(Number(row.height) || 0)),
        isFullCanvas: Boolean(row.isFullCanvas),
        kind: row.kind || "",
        label: row.label || "",
        MiB: row.MiB || row.estimatedMiB || this.formatRasterMiB(row.bytes),
        ownerId: row.ownerId || "",
        ownerType: row.ownerType || "",
        purgeable: Boolean(row.purgeable),
        reason: row.reason || "",
        width: Math.max(0, Math.round(Number(row.width) || 0)),
      }));
    }
,

    createStrokeScratchDiagnostics({ strokeBufferRect = this.strokeBufferRect, strokeRect = null, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || ""), scratchBytes = this.getStrokeScratchBytes(strokeBufferRect) } = {}) {
      const strokeBufferCoverage = this.getRasterRectCoverage(strokeBufferRect, target);
      const strokeCoverage = this.getRasterRectCoverage(strokeRect, target);

      return {
        ...this.getRendererScratchPresence(),
        scratchBytes,
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchTextureCount: this.getStrokeScratchTextureCount(),
        strokeScratchPressureEvictionCount: this.strokeScratchPressureEvictionCount || 0,
        ...this.getIncrementalStrokeBakeTelemetry(),
        scratchBudgetExceeded: scratchBytes >= STROKE_SCRATCH_SOFT_EVICT_BYTES,
        scratchHardBudgetExceeded: scratchBytes >= STROKE_SCRATCH_HARD_WARN_BYTES,
        softEvictMiB: this.formatRasterMiB(STROKE_SCRATCH_SOFT_EVICT_BYTES),
        hardWarnMiB: this.formatRasterMiB(STROKE_SCRATCH_HARD_WARN_BYTES),
        strokeBufferCoverage,
        strokeBufferCoveragePercent: Number((strokeBufferCoverage * 100).toFixed(2)),
        strokeBufferRect: strokeBufferRect ? { ...strokeBufferRect } : null,
        strokeCoverage,
        strokeCoveragePercent: Number((strokeCoverage * 100).toFixed(2)),
        strokeRect: strokeRect ? { ...strokeRect } : null,
        strokeTargetAllocationCount: this.strokeTargetAllocationCount || 0,
        strokeTargetPeakCoverage: this.strokeTargetPeakCoverage || 0,
        strokeTargetPeakCoveragePercent: Number(((this.strokeTargetPeakCoverage || 0) * 100).toFixed(2)),
        strokeTargetPeakScratchBytes: this.strokeTargetPeakScratchBytes || 0,
        strokeTargetPeakScratchMiB: this.formatRasterMiB(this.strokeTargetPeakScratchBytes || 0),
        strokeTargetReallocationCount: this.strokeTargetReallocationCount || 0,
        strokeTargetReplaceCount: this.strokeTargetReplaceCount || 0,
        topScratchResources: this.getTopScratchResources(),
      };
    }
,

    isBrushStrokeCropped() {
      return CROPPED_BRUSH_STROKES;
    }
,

    containsRect(container, rect) {
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

    unionRects(first, second) {
      if (!first) {
        return second ? { ...second } : null;
      }

      if (!second) {
        return { ...first };
      }

      const x = Math.min(first.x, second.x);
      const y = Math.min(first.y, second.y);
      const x2 = Math.max(first.x + first.width, second.x + second.width);
      const y2 = Math.max(first.y + first.height, second.y + second.height);

      return {
        x,
        y,
        width: x2 - x,
        height: y2 - y,
      };
    }
,

    getPaddedStrokeAllocationRect(rect, target) {
      if (!this.isBrushStrokeCropped()) {
        return this.getFullDocumentRect(target);
      }

      const quantum = this.isAndroidPerformanceMode()
        ? ANDROID_STROKE_ALLOCATION_QUANTUM
        : STROKE_ALLOCATION_QUANTUM;
      const padding = Math.max(16, Math.ceil(this.getBrushSize()));
      const bounds = this.getStrokeAllocationBounds(target);
      const minX = Math.max(bounds.x, Math.floor((rect.x - padding) / quantum) * quantum);
      const minY = Math.max(bounds.y, Math.floor((rect.y - padding) / quantum) * quantum);
      const maxX = Math.min(
        bounds.x + bounds.width,
        Math.ceil((rect.x + rect.width + padding) / quantum) * quantum,
      );
      const maxY = Math.min(
        bounds.y + bounds.height,
        Math.ceil((rect.y + rect.height + padding) / quantum) * quantum,
      );

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
,

    getFinalStrokeAllocationRect(rect, target) {
      if (!this.isBrushStrokeCropped()) {
        return this.getFullDocumentRect(target);
      }

      const padding = STROKE_FINAL_PADDING;
      const bounds = this.getStrokeAllocationBounds(target);
      const minX = Math.max(bounds.x, Math.floor(rect.x - padding));
      const minY = Math.max(bounds.y, Math.floor(rect.y - padding));
      const maxX = Math.min(bounds.x + bounds.width, Math.ceil(rect.x + rect.width + padding));
      const maxY = Math.min(bounds.y + bounds.height, Math.ceil(rect.y + rect.height + padding));

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
,

    isSameRect(first, second) {
      return Boolean(
        first &&
        second &&
        first.x === second.x &&
        first.y === second.y &&
        first.width === second.width &&
        first.height === second.height
      );
    }
,

    isMobileLargeBrushBake({
      effectiveStrokeRect = null,
      isEraserStroke = false,
      target = this.getDocumentDrawTarget(this.strokeTargetLayerId || ""),
      targetStrategy = null,
    } = {}) {
      if (isEraserStroke || this.currentStrokeTool === "eraser") {
        return false;
      }

      const isMobileLike = Boolean(
        this.documentRenderer?.isMobileLikeDevice?.() ||
        this.isMobilePerformanceMode?.() ||
        this.isAndroidPerformanceMode?.(),
      );

      if (!isMobileLike) {
        return false;
      }

      const brushSize = Math.max(0, Number(this.getBrushSize?.()) || 0);
      const coverage = this.getRasterRectCoverage(effectiveStrokeRect, target);
      const usesDenseMobileTarget = targetStrategy?.sparse === false ||
        String(targetStrategy?.mode || "").includes("dense-mobile");

      return Boolean(
        usesDenseMobileTarget ||
        brushSize >= 192 ||
        coverage >= 0.25
      );
    }
,

    shouldSkipFinalStrokeScratchCompact({
      effectiveStrokeRect = null,
      finalStrokeBufferRect = null,
      isEraserStroke = false,
      strokeRect = null,
      target = this.getDocumentDrawTarget(this.strokeTargetLayerId || ""),
      targetStrategy = null,
    } = {}) {
      if (!this.strokeBufferRect || !this.strokeTexture || !strokeRect || !finalStrokeBufferRect) {
        return false;
      }

      if (this.isSameRect(this.strokeBufferRect, finalStrokeBufferRect)) {
        return false;
      }

      if (!this.isMobileLargeBrushBake({
        effectiveStrokeRect: effectiveStrokeRect || strokeRect,
        isEraserStroke,
        target,
        targetStrategy,
      })) {
        return false;
      }

      const currentPixels = Math.max(1, Math.round(this.strokeBufferRect.width || 0)) *
        Math.max(1, Math.round(this.strokeBufferRect.height || 0));
      const finalPixels = Math.max(1, Math.round(finalStrokeBufferRect.width || 0)) *
        Math.max(1, Math.round(finalStrokeBufferRect.height || 0));
      const currentCoverage = this.getRasterRectCoverage(this.strokeBufferRect, target);
      const finalCoverage = this.getRasterRectCoverage(finalStrokeBufferRect, target);

      return Boolean(
        currentPixels > finalPixels * 1.05 ||
        currentCoverage - finalCoverage >= 0.05
      );
    }
,

    getCurrentStrokeTargets() {
      if (!this.strokeTexture || !this.strokeFBO) {
        return null;
      }

      const targets = [
        {
          texture: this.strokeTexture,
          framebuffer: this.strokeFBO,
          width: this.strokeBufferRect?.width || 1,
          height: this.strokeBufferRect?.height || 1,
        },
      ];

      if (this.strokePlateauTexture && this.strokePlateauFBO) {
        targets.push({
          texture: this.strokePlateauTexture,
          framebuffer: this.strokePlateauFBO,
          width: this.strokeBufferRect?.width || 1,
          height: this.strokeBufferRect?.height || 1,
        });
      }

      if (this.strokeAccumTexture && this.strokeAccumFBO) {
        targets.push({
          texture: this.strokeAccumTexture,
          framebuffer: this.strokeAccumFBO,
          width: this.strokeBufferRect?.width || 1,
          height: this.strokeBufferRect?.height || 1,
        });
      }

      return targets;
    }
,

    deleteStrokeTargets(targets = this.getCurrentStrokeTargets()) {
      if (!Array.isArray(targets)) {
        return;
      }

      const gl = this.gl;

      targets.forEach((target) => {
        if (target?.framebuffer) {
          this.deleteBrushFramebuffer(target.framebuffer);
          gl.deleteFramebuffer(target.framebuffer);
          target.framebuffer = null;
        }

        if (target?.texture) {
          this.deleteBrushTexture(target.texture);
          gl.deleteTexture(target.texture);
          target.texture = null;
        }
      });
    }
,

    releaseStrokeLayerTarget() {
      this.deleteStrokeTargets();
      this.strokeTexture = null;
      this.strokeFBO = null;
      this.strokePlateauTexture = null;
      this.strokePlateauFBO = null;
      this.strokeAccumTexture = null;
      this.strokeAccumFBO = null;
      this.strokeBufferRect = null;
    }
,

    copyStrokeTargetContent(previousTargets, previousRect, nextTargets, nextRect) {
      if (!previousRect || !nextRect || !Array.isArray(previousTargets) || !Array.isArray(nextTargets)) {
        return;
      }

      const intersectionX = Math.max(previousRect.x, nextRect.x);
      const intersectionY = Math.max(previousRect.y, nextRect.y);
      const intersectionMaxX = Math.min(previousRect.x + previousRect.width, nextRect.x + nextRect.width);
      const intersectionMaxY = Math.min(previousRect.y + previousRect.height, nextRect.y + nextRect.height);
      const intersectionWidth = Math.max(0, Math.round(intersectionMaxX - intersectionX));
      const intersectionHeight = Math.max(0, Math.round(intersectionMaxY - intersectionY));

      if (intersectionWidth <= 0 || intersectionHeight <= 0) {
        return;
      }

      const gl = this.gl;
      const sourceX0 = Math.round(intersectionX - previousRect.x);
      const sourceY0 = Math.round(previousRect.height - ((intersectionY - previousRect.y) + intersectionHeight));
      const destX0 = Math.round(intersectionX - nextRect.x);
      const destY0 = Math.round(nextRect.height - ((intersectionY - nextRect.y) + intersectionHeight));
      const wasScissorEnabled = typeof gl.isEnabled === "function" && gl.isEnabled(gl.SCISSOR_TEST);

      if (wasScissorEnabled) {
        gl.disable(gl.SCISSOR_TEST);
      }

      try {
        previousTargets.forEach((previous, index) => {
          const next = nextTargets[index];

          if (!previous?.framebuffer || !next?.framebuffer) {
            return;
          }

          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous.framebuffer);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, next.framebuffer);
          gl.blitFramebuffer(
            sourceX0,
            sourceY0,
            sourceX0 + intersectionWidth,
            sourceY0 + intersectionHeight,
            destX0,
            destY0,
            destX0 + intersectionWidth,
            destY0 + intersectionHeight,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
          );
        });
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        if (wasScissorEnabled) {
          gl.enable(gl.SCISSOR_TEST);
        }
      }
    }
,

    replaceStrokeLayerTarget(nextRect, previousTargets = this.getCurrentStrokeTargets(), previousRect = this.strokeBufferRect) {
      const gl = this.gl;
      const nextTargets = [];
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.stroke-target.replace", {
        nextPixels: Math.max(0, Math.round(nextRect?.width || 0)) * Math.max(0, Math.round(nextRect?.height || 0)),
        previousPixels: Math.max(0, Math.round(previousRect?.width || 0)) * Math.max(0, Math.round(previousRect?.height || 0)),
      }) : null;

      try {
      try {
        const resourceMetadata = {
          bbox: nextRect,
          bboxCoverage: this.getRasterRectCoverage(nextRect),
          originX: nextRect.x,
          originY: nextRect.y,
          reason: "replace-stroke-layer-target",
          scratchBytes: this.getStrokeScratchBytes(nextRect),
          strokeTargetReplaceCount: (this.strokeTargetReplaceCount || 0) + 1,
        };

        const renderMode = this.getStrokeRenderMode();

        nextTargets.push(this.createTransparentRenderTarget("Stroke FBO", nextRect.width, nextRect.height, resourceMetadata));

        if (renderMode === STROKE_RENDER_MODE_MIXED) {
          nextTargets.push(this.createTransparentRenderTarget("Stroke plateau FBO", nextRect.width, nextRect.height, resourceMetadata));
          nextTargets.push(this.createTransparentRenderTarget("Stroke accumulation FBO", nextRect.width, nextRect.height, resourceMetadata));
        }
      } catch (error) {
        this.deleteStrokeTargets(nextTargets);
        throw error;
      }

      this.copyStrokeTargetContent(previousTargets, previousRect, nextTargets, nextRect);
      this.deleteStrokeTargets(previousTargets);

      this.strokeTexture = nextTargets[0].texture;
      this.strokeFBO = nextTargets[0].framebuffer;
      this.strokePlateauTexture = nextTargets[1]?.texture || null;
      this.strokePlateauFBO = nextTargets[1]?.framebuffer || null;
      this.strokeAccumTexture = nextTargets[2]?.texture || null;
      this.strokeAccumFBO = nextTargets[2]?.framebuffer || null;
      this.strokeBufferRect = { ...nextRect };
      this.strokeTargetAllocationCount += 1;
      this.strokeTargetReplaceCount += 1;
      if (previousRect) {
        this.strokeTargetReallocationCount += 1;
      }
      this.updateStrokeScratchDiagnostics(nextRect);
      this.evictRasterScratchCachesForStrokePressure(nextRect, undefined, "replace-stroke-layer-target");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      } finally {
        trace?.end({
          nextHeight: Math.max(0, Math.round(nextRect?.height || 0)),
          nextWidth: Math.max(0, Math.round(nextRect?.width || 0)),
        });
      }
    }
,

    ensureStrokeLayerTargetForRect(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const requiredRect = this.isBrushStrokeCropped() ? rect : this.getFullDocumentRect(target);

      if (!requiredRect) {
        return false;
      }

      if (this.strokeBufferRect && this.containsRect(this.strokeBufferRect, requiredRect)) {
        return true;
      }

      const previousTargets = this.getCurrentStrokeTargets();
      const previousRect = this.strokeBufferRect ? { ...this.strokeBufferRect } : null;
      const unionRect = previousRect ? this.unionRects(previousRect, requiredRect) : requiredRect;
      const nextRect = this.getPaddedStrokeAllocationRect(unionRect, target);

      this.replaceStrokeLayerTarget(nextRect, previousTargets, previousRect);

      return true;
    }
,

    compactStrokeLayerTargetForRect(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      if (!rect || !this.strokeBufferRect || !this.strokeTexture) {
        return false;
      }

      const nextRect = this.getFinalStrokeAllocationRect(rect, target);

      if (this.isSameRect(this.strokeBufferRect, nextRect)) {
        return true;
      }

      this.replaceStrokeLayerTarget(
        nextRect,
        this.getCurrentStrokeTargets(),
        { ...this.strokeBufferRect },
      );

      return true;
    }
,

    uploadStampInstanceData(instanceData) {
      if (!instanceData?.byteLength || !this.brush?.instanceVBO) {
        return { allocatedBytes: 0, uploadedBytes: 0, vboCapacityBytes: 0 };
      }

      const gl = this.gl;
      const requiredBytes = Math.max(0, Math.round(instanceData.byteLength));
      const previousCapacity = Math.max(
        0,
        Math.round(Number(this.brush.instanceVBOCapacityBytes || this.brushInstanceVboCapacityBytes) || 0),
      );
      let nextCapacity = previousCapacity;
      let allocatedBytes = 0;

      if (requiredBytes > previousCapacity) {
        nextCapacity = Math.max(
          requiredBytes,
          Math.ceil(previousCapacity * 1.5),
          56 * 256,
        );
        gl.bufferData(gl.ARRAY_BUFFER, nextCapacity, gl.DYNAMIC_DRAW);
        this.brush.instanceVBOCapacityBytes = nextCapacity;
        this.brushInstanceVboCapacityBytes = nextCapacity;
        allocatedBytes = nextCapacity;
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData);

      return {
        allocatedBytes,
        uploadedBytes: requiredBytes,
        vboCapacityBytes: nextCapacity,
      };
    }
,

    flushStamps(options = {}) {
      if (this.stampsBuffer.length === 0) {
        return;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.flush-stamps", {
        bufferedStamps: this.stampsBuffer.length,
        tool: this.currentStrokeTool || "brush",
      }) : null;
      const beginFlushTrace = (name, detail = {}) => namespace.PerfTrace?.enabled
        ? namespace.PerfTrace.begin(`brush.flush-stamps.${name}`, detail)
        : null;
      let flushUsedScissor = false;

      try {
      const gl = this.gl;
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const strokeRect = this.getActiveStrokeRect();

      if (!strokeRect || !this.ensureStrokeLayerTargetForRect(strokeRect, target)) {
        this.stampsBuffer.length = 0;
        return;
      }

      const strokeBufferRect = this.strokeBufferRect || this.getFullDocumentRect(target);
      const stampCount = this.stampsBuffer.length;
      const flushDirtyRect = this.getStampBufferDirtyRect(this.stampsBuffer, strokeBufferRect);
      const flushScissor = this.getStrokeBufferScissor(flushDirtyRect, strokeBufferRect);
      flushUsedScissor = Boolean(flushScissor);
      const instanceTrace = beginFlushTrace("instance-data", {
        scissorPixels: Math.max(0, Math.round(flushScissor?.width || 0)) *
          Math.max(0, Math.round(flushScissor?.height || 0)),
        stampCount,
      });
      // 14 float per istanza: base dab + colore + dati grain Moving.
      const instanceData = this.getStampInstanceData(stampCount);
      const brushSize = this.getBrushSize();
      const fallbackColor = this.getCurrentStrokeColorRgb();
      const useShapeTexture = this.shapeTextureReady && this.shapeTexture ? 1 : 0;
      const useGrainTexture = this.isGrainEnabled();
      const brushOpacity = this.getOpacity01();
      const renderMode = this.getStrokeRenderMode();

      for (let index = 0; index < stampCount; index += 1) {
        const stamp = this.stampsBuffer[index];
        const offset = index * 14;
        const color = stamp.colorRgb || fallbackColor;

        instanceData[offset] = stamp.x;
        instanceData[offset + 1] = stamp.y;
        instanceData[offset + 2] = stamp.pressure;
        instanceData[offset + 3] = (stamp.alphaScale ?? 1) * brushOpacity;
        instanceData[offset + 4] = stamp.sizeScale ?? 1;
        instanceData[offset + 5] = stamp.rotation ?? 0;
        instanceData[offset + 6] = color[0];
        instanceData[offset + 7] = color[1];
        instanceData[offset + 8] = color[2];
        instanceData[offset + 9] = stamp.grainOffsetX ?? 0;
        instanceData[offset + 10] = stamp.grainOffsetY ?? 0;
        instanceData[offset + 11] = stamp.grainTravel ?? 0;
        instanceData[offset + 12] = stamp.grainRotation ?? 0;
        instanceData[offset + 13] = stamp.grainDepthScale ?? 1;
      }
      instanceTrace?.end({
        floatCount: instanceData.length,
      });

      gl.useProgram(this.brushProgramInfo.program);
      gl.uniform2f(this.brushProgramInfo.uniforms.docResolution, target.width, target.height);
      gl.uniform2f(this.brushProgramInfo.uniforms.targetOrigin, strokeBufferRect.x, strokeBufferRect.y);
      gl.uniform2f(this.brushProgramInfo.uniforms.targetSize, strokeBufferRect.width, strokeBufferRect.height);
      gl.uniform1f(this.brushProgramInfo.uniforms.brushSize, brushSize);
      gl.uniform1f(this.brushProgramInfo.uniforms.minSizeRatio, this.getMinSizeRatio());
      gl.uniform2f(this.brushProgramInfo.uniforms.shapeFlip, this.getShapeFlipXSign(), this.getShapeFlipYSign());
      gl.uniform1f(this.brushProgramInfo.uniforms.flow, this.getFlow());
      gl.uniform1f(this.brushProgramInfo.uniforms.hardness, this.getHardness());
      gl.uniform1f(this.brushProgramInfo.uniforms.wetEdges, this.getWetEdges());
      gl.uniform1f(this.brushProgramInfo.uniforms.burntEdges, this.getBurntEdges());
      gl.uniform1i(this.brushProgramInfo.uniforms.burntEdgesMode, this.getBurntEdgesModeId());
      gl.uniform1i(this.brushProgramInfo.uniforms.alphaThresholdEnabled, this.isAlphaThresholdEnabled() ? 1 : 0);
      gl.uniform1f(this.brushProgramInfo.uniforms.alphaThreshold, this.getAlphaThreshold());
      gl.uniform1f(this.brushProgramInfo.uniforms.useShapeTexture, useShapeTexture);
      gl.uniform1i(this.brushProgramInfo.uniforms.shapeTexture, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, useShapeTexture ? this.shapeTexture : null);
      gl.uniform1i(this.brushProgramInfo.uniforms.grainEnabled, useGrainTexture ? 1 : 0);
      gl.uniform1i(this.brushProgramInfo.uniforms.grainTexture, 2);

      if (useGrainTexture) {
        const grainMode = this.getGrainMode();
        const grainRotation = grainMode === "moving" ? 0 : this.getGrainRotationRadians();
        const cos = Math.cos(grainRotation);
        const sin = Math.sin(grainRotation);
        const rotationMatrix = this.grainRotationMatrixData || new Float32Array(4);

        rotationMatrix[0] = cos;
        rotationMatrix[1] = sin;
        rotationMatrix[2] = -sin;
        rotationMatrix[3] = cos;
        this.grainRotationMatrixData = rotationMatrix;

        gl.uniform2f(this.brushProgramInfo.uniforms.grainTexSize, this.grainImageWidth, this.grainImageHeight);
        gl.uniform1i(this.brushProgramInfo.uniforms.grainMode, grainMode === "moving" ? 1 : 0);
        gl.uniform1f(this.brushProgramInfo.uniforms.grainScale, this.getGrainScale());
        gl.uniformMatrix2fv(this.brushProgramInfo.uniforms.grainRotationMat, false, rotationMatrix);
        gl.uniform1f(this.brushProgramInfo.uniforms.grainDepth, this.getActiveGrainDepth());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainMovement, this.getGrainMovingMovement());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainZoom, this.getGrainMovingZoom());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainDepthMinimum, this.getGrainMovingDepthMinimum());
        gl.uniform1i(this.brushProgramInfo.uniforms.grainBlendMode, this.getGrainBlendModeId());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainBrightness, this.getGrainBrightness());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainContrast, this.getGrainContrast());
        gl.uniform1i(this.brushProgramInfo.uniforms.grainInvert, this.isGrainInverted() ? 1 : 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
      }

      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(this.brush.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brush.instanceVBO);
      const uploadTrace = beginFlushTrace("upload", {
        bytes: instanceData.byteLength,
        stampCount,
      });
      const uploadReport = this.uploadStampInstanceData(instanceData);
      uploadTrace?.end(uploadReport);

      const drawTrace = beginFlushTrace("draw-stamps", {
        scissor: Boolean(flushScissor),
        stampCount,
      });
      const didSetFlushScissor = this.setStrokeBufferScissor(flushScissor);
      const drawStampBatchToFramebuffer = (framebuffer, blendEquation, srcFactor, dstFactor) => {
        if (!framebuffer) {
          return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, strokeBufferRect.width, strokeBufferRect.height);
        gl.enable(gl.BLEND);
        gl.blendEquation(blendEquation);
        gl.blendFunc(srcFactor, dstFactor);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stampCount);
      };

      try {
        if (renderMode === STROKE_RENDER_MODE_PLATEAU) {
          drawStampBatchToFramebuffer(this.strokeFBO, gl.MAX, gl.ONE, gl.ONE);
        } else if (renderMode === STROKE_RENDER_MODE_ACCUM) {
          drawStampBatchToFramebuffer(this.strokeFBO, gl.FUNC_ADD, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          drawStampBatchToFramebuffer(this.strokePlateauFBO, gl.MAX, gl.ONE, gl.ONE);
          drawStampBatchToFramebuffer(this.strokeAccumFBO, gl.FUNC_ADD, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
      } finally {
        if (didSetFlushScissor) {
          gl.disable(gl.SCISSOR_TEST);
        }
      }
      drawTrace?.end({
        scissorHeight: Math.max(0, Math.round(flushScissor?.height || 0)),
        scissorWidth: Math.max(0, Math.round(flushScissor?.width || 0)),
      });

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(null);
      // Ripristina la pipeline al blending pre-moltiplicato standard.
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (renderMode === STROKE_RENDER_MODE_MIXED) {
        const composeTrace = beginFlushTrace("compose", {
          scissor: Boolean(flushScissor),
        });

        this.composeStrokeBuildUp(flushDirtyRect);

        composeTrace?.end({
          scissorHeight: Math.max(0, Math.round(flushScissor?.height || 0)),
          scissorWidth: Math.max(0, Math.round(flushScissor?.width || 0)),
        });
      }
      this.stampsBuffer.length = 0;
      this.strokeStampCount += stampCount;
      this.maybeBakeStrokeIncrementally("flush-stamps-scratch-pressure");
      if (options.requestDraw !== false) {
        this.requestDraw();
      }
      } finally {
        trace?.end({
          scissor: flushUsedScissor,
          strokeStamps: this.strokeStampCount,
        });
      }
    }
,

    composeStrokeBuildUp(dirtyRect = null) {
      const gl = this.gl;
      const target = this.strokeBufferRect || this.getFullDocumentRect();
      const { program, uniforms } = this.strokeBuildupProgramInfo;
      const scissor = this.getStrokeBufferScissor(dirtyRect, target);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokeFBO);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      const didSetScissor = this.setStrokeBufferScissor(scissor);

      try {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.strokePlateauTexture);
      gl.uniform1i(uniforms.plateauTexture, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.strokeAccumTexture);
      gl.uniform1i(uniforms.accumTexture, 1);
      gl.uniform1f(uniforms.buildUp, this.getStrokeBuildUp());

      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      } finally {
      if (didSetScissor) {
        gl.disable(gl.SCISSOR_TEST);
      }
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
,

    isIncrementalStrokeBakeEnabled() {
      if (
        this.options?.enableIncrementalStrokeBake === false ||
        this.options?.incrementalBrushBake === false ||
        namespace.enableBrushIncrementalBake === false ||
        namespace.incrementalBrushBakeEnabled === false ||
        namespace.disableIncrementalBrushBake === true
      ) {
        return false;
      }

      return STROKE_INCREMENTAL_BAKE_ENABLED;
    }
,

    isIncrementalStrokeBakeForced() {
      return Boolean(
        this.options?.experimentalIncrementalStrokeBakeUnsafe === true ||
        this.options?.experimentalIncrementalBrushBakeUnsafe === true ||
        namespace.experimentalBrushIncrementalBakeUnsafe === true ||
        namespace.experimentalIncrementalBrushBakeUnsafe === true ||
        namespace.experimentalBrushIncrementalBakeAll === true,
      );
    }
,

    getIncrementalStrokeBakeTelemetry(extra = {}) {
      return {
        incrementalBakeBytesFreed: this.incrementalStrokeBakeBytesFreed || 0,
        incrementalBakeBytesFreedMiB: this.formatRasterMiB(this.incrementalStrokeBakeBytesFreed || 0),
        incrementalBakeCount: this.incrementalStrokeBakeCount || 0,
        incrementalBakeEnabled: this.isIncrementalStrokeBakeEnabled(),
        incrementalBakeLastReason: this.incrementalStrokeBakeLastReason || "",
        incrementalBakeLastRect: this.incrementalStrokeBakeLastRect ? { ...this.incrementalStrokeBakeLastRect } : null,
        incrementalBakePeakScratchBytes: this.incrementalStrokeBakePeakScratchBytes || 0,
        incrementalBakePeakScratchMiB: this.formatRasterMiB(this.incrementalStrokeBakePeakScratchBytes || 0),
        incrementalBakeSkippedReason: this.incrementalStrokeBakeSkippedReason || "",
        incrementalBakeTriggerCoverage: Number.isFinite(Number(this.lastIncrementalStrokeBakeDecision?.coverage)) ? Number(this.lastIncrementalStrokeBakeDecision.coverage) : 0,
        incrementalBakeTriggerScratchBytes: Math.max(0, Math.round(Number(this.lastIncrementalStrokeBakeDecision?.scratchBytes) || 0)),
        incrementalBakeTriggerScratchMiB: this.formatRasterMiB(this.lastIncrementalStrokeBakeDecision?.scratchBytes || 0),
        incrementalBakedRect: this.incrementalStrokeBakedRect ? { ...this.incrementalStrokeBakedRect } : null,
        lastIncrementalBakeDecision: this.lastIncrementalStrokeBakeDecision ? { ...this.lastIncrementalStrokeBakeDecision } : null,
        ...extra,
      };
    }
,

    getIncrementalStrokeBakeSafety() {
      const forced = this.isIncrementalStrokeBakeForced();
      const buildUp = this.getStrokeBuildUp();
      const renderingMode = String(this.brushState?.renderingMode || "").trim().toLowerCase();
      const tool = this.currentStrokeTool || "brush";

      if (!this.isIncrementalStrokeBakeEnabled()) {
        return { allowed: false, buildUp, forced, reason: "disabled", renderingMode, tool };
      }

      if (this.isIncrementalStrokeBakeInProgress) {
        return { allowed: false, buildUp, forced, reason: "already-in-progress", renderingMode, tool };
      }

      if (!this.strokeTexture || !this.strokeBufferRect) {
        return { allowed: false, buildUp, forced, reason: "no-live-stroke-scratch", renderingMode, tool };
      }

      if (tool !== "brush" && tool !== "eraser") {
        return { allowed: false, buildUp, forced, reason: "unsupported-tool", renderingMode, tool };
      }

      if (this.isTaperActive() || this.strokeTotalLength != null) {
        return { allowed: false, buildUp, forced, reason: "taper-active", renderingMode, tool };
      }

      if (this.options.enableHistory && !this.canBatchBrushHistory()) {
        return { allowed: false, buildUp, forced, reason: "history-not-batched", renderingMode, tool };
      }

      if (!forced && buildUp < STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP) {
        return {
          allowed: false,
          buildUp,
          forced,
          reason: "build-up-not-associative",
          renderingMode,
          requiredBuildUp: STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP,
          tool,
        };
      }

      return { allowed: true, buildUp, forced, reason: forced ? "forced" : "safe-full-buildup", renderingMode, tool };
    }
,

    shouldIncrementallyBakeStrokeScratch(reason = "stroke-scratch-pressure") {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const scratchBytes = this.getStrokeScratchBytes(this.strokeBufferRect);
      const coverage = this.getRasterRectCoverage(this.strokeBufferRect, target);
      const triggeredByBytes = scratchBytes >= STROKE_SCRATCH_SOFT_EVICT_BYTES;
      const triggeredByCoverage = coverage >= STROKE_INCREMENTAL_BAKE_COVERAGE;
      const safety = this.getIncrementalStrokeBakeSafety();
      const deferredByInteractiveFrame = Boolean(
        this.isDrawing &&
        namespace.EngineGovernor?.mode === "interactive" &&
        scratchBytes < STROKE_SCRATCH_HARD_WARN_BYTES
      );
      const shouldBake = Boolean(
        !deferredByInteractiveFrame &&
        (triggeredByBytes || triggeredByCoverage) &&
        safety.allowed
      );
      const skipReason = shouldBake
        ? ""
        : (
            deferredByInteractiveFrame
              ? "interactive-frame"
              : (
                  triggeredByBytes || triggeredByCoverage
                    ? safety.reason
                    : "below-threshold"
                )
          );
      const decision = {
        allowed: Boolean(safety.allowed),
        buildUp: safety.buildUp,
        coverage,
        coveragePercent: Number((coverage * 100).toFixed(2)),
        deferredByInteractiveFrame,
        forced: Boolean(safety.forced),
        reason,
        renderingMode: safety.renderingMode || "",
        requiredBuildUp: safety.requiredBuildUp ?? null,
        safetyReason: safety.reason || "",
        scratchBytes,
        scratchMiB: this.formatRasterMiB(scratchBytes),
        shouldBake,
        skipReason,
        thresholdCoverage: STROKE_INCREMENTAL_BAKE_COVERAGE,
        thresholdCoveragePercent: Number((STROKE_INCREMENTAL_BAKE_COVERAGE * 100).toFixed(2)),
        thresholdScratchBytes: STROKE_SCRATCH_SOFT_EVICT_BYTES,
        thresholdScratchMiB: this.formatRasterMiB(STROKE_SCRATCH_SOFT_EVICT_BYTES),
        tool: safety.tool || this.currentStrokeTool || "brush",
        triggeredByBytes,
        triggeredByCoverage,
      };

      this.lastIncrementalStrokeBakeDecision = decision;
      this.incrementalStrokeBakeSkippedReason = skipReason;
      namespace.lastBrushIncrementalStrokeBakeDecision = decision;

      return decision;
    }
,

    maybeBakeStrokeIncrementally(reason = "stroke-scratch-pressure") {
      const decision = this.shouldIncrementallyBakeStrokeScratch(reason);

      if (!decision.shouldBake) {
        return false;
      }

      try {
        return this.bakeStrokeIncrementally({ decision, reason });
      } catch (error) {
        this.incrementalStrokeBakeSkippedReason = error?.message || "incremental-bake-error";
        console.warn?.("[CBO brush] Bake incrementale stroke saltato: mantengo scratch live.", error);
        return false;
      }
    }
,

    resetActiveStrokeSegmentAfterIncrementalBake() {
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.cancelStrokeTargetPrewarm();
    }
,

    drawStrokeTextureToPaintTargets({
      bakeRect = this.strokeBufferRect,
      hasSelectionCoverage = false,
      isEraserStroke = false,
      paintTargets = [],
      selectionCoverageRects = null,
    } = {}) {
      if (!this.strokeTexture || !bakeRect || !Array.isArray(paintTargets) || paintTargets.length === 0) {
        return 0;
      }

      const gl = this.gl;
      const { program, uniforms } = this.compositeProgramInfo;
      let drawCallCount = 0;

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      if (isEraserStroke) {
        gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.strokeTexture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.opacity, 1.0);
      gl.bindVertexArray(this.fullscreenQuad.vao);

      try {
        paintTargets.forEach((item) => {
          const paintTarget = item?.target;
          const targetRect = this.documentRenderer?.getRasterTargetDocumentRect?.(paintTarget) || { x: 0, y: 0 };
          const localBakeX = Math.round(bakeRect.x - targetRect.x);
          const localBakeY = Math.round(bakeRect.y - targetRect.y);
          const targetCoverageRects = hasSelectionCoverage
            ? selectionCoverageRects
                .map((selectionRect) => this.documentRenderer?.intersectRasterHistoryRects?.(selectionRect, targetRect) ||
                  this.intersectDocumentRects(selectionRect, targetRect))
                .filter(Boolean)
            : null;

          if (!paintTarget?.framebuffer || !paintTarget?.texture) {
            return;
          }

          gl.bindFramebuffer(gl.FRAMEBUFFER, paintTarget.framebuffer);
          gl.viewport(localBakeX, paintTarget.height - (localBakeY + bakeRect.height), bakeRect.width, bakeRect.height);

          if (hasSelectionCoverage) {
            if (!targetCoverageRects?.length) {
              return;
            }

            targetCoverageRects.forEach((selectionTargetRect) => {
              gl.enable(gl.SCISSOR_TEST);
              gl.scissor(
                selectionTargetRect.x - targetRect.x,
                paintTarget.height - ((selectionTargetRect.y - targetRect.y) + selectionTargetRect.height),
                selectionTargetRect.width,
                selectionTargetRect.height,
              );
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
              drawCallCount += 1;
            });
            gl.disable(gl.SCISSOR_TEST);
          } else {
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            drawCallCount += 1;
          }

          this.documentRenderer?.markRasterTargetDirty?.(paintTarget);
        });
      } finally {
        gl.disable(gl.SCISSOR_TEST);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      return drawCallCount;
    }
,

    getBrushBakePaintTargetStrategy({
      documentTarget = this.getDocumentDrawTarget(this.strokeTargetLayerId || ""),
      effectiveStrokeRect = null,
      isEraserStroke = false,
      tilePatchRects = null,
    } = {}) {
      const tilePatchRectCount = Array.isArray(tilePatchRects) ? tilePatchRects.length : 0;
      const coverage = this.getRasterRectCoverage(effectiveStrokeRect, documentTarget);
      const isMobileLike = Boolean(this.documentRenderer?.isMobileLikeDevice?.());
      const layerId = String(this.strokeTargetLayerId || documentTarget?.layerId || "").trim();
      const isClippingMaskBase = !isEraserStroke && this.isLayerClippingMaskBase(layerId);
      const shouldUseDenseTarget = Boolean(
        !isEraserStroke &&
        (
          isClippingMaskBase ||
          (
            isMobileLike &&
            namespace.mobileBrushDenseBakeTargets !== false &&
            (
              tilePatchRectCount >= MOBILE_DENSE_BRUSH_TARGET_PATCH_THRESHOLD ||
              coverage >= MOBILE_DENSE_BRUSH_TARGET_COVERAGE_THRESHOLD
            )
          )
        )
      );

      return {
        coverage,
        mode: isClippingMaskBase
          ? "dense-clipping-mask-base"
          : shouldUseDenseTarget
            ? "dense-mobile-large-stroke"
            : "sparse-patch",
        sparse: !shouldUseDenseTarget,
        tilePatchRectCount,
        tilePatchRects: shouldUseDenseTarget ? null : tilePatchRects,
      };
    }
,

    isLayerClippingMaskBase(layerId) {
      const normalizedLayerId = String(layerId || "").trim();

      if (!normalizedLayerId) {
        return false;
      }

      const renderer = this.documentRenderer || null;
      const layerModel = renderer?.layerModel || namespace.documentLayerModel || null;
      let orderedLayers = [];

      if (typeof renderer?.getOrderedLayersBottomToTop === "function") {
        orderedLayers = renderer.getOrderedLayersBottomToTop();
      } else if (typeof layerModel?.flattenTopToBottom === "function") {
        orderedLayers = layerModel.flattenTopToBottom().slice().reverse();
      } else if (typeof layerModel?.getEntries === "function") {
        orderedLayers = layerModel.getEntries().slice().reverse();
      }

      if (!Array.isArray(orderedLayers) || orderedLayers.length === 0) {
        return false;
      }

      let currentBaseLayer = null;

      for (const layer of orderedLayers) {
        if (layer?.clippingMask === true) {
          if (currentBaseLayer?.id === normalizedLayerId) {
            return true;
          }
          continue;
        }

        currentBaseLayer = layer &&
          layer.type !== "group" &&
          layer.type !== "background" &&
          layer.id !== "background"
          ? layer
          : null;
      }

      return false;
    }
,

    isFirstDenseBrushPaintTarget(layerId) {
      const existingTarget = layerId
        ? this.documentRenderer?.rasterTargetsByLayerId?.get?.(layerId)
        : null;
      const isEmptySparseTarget = Boolean(
        existingTarget &&
        this.documentRenderer?.isSparseRasterTarget?.(existingTarget) &&
        (!existingTarget.tiles || existingTarget.tiles.size === 0)
      );

      return !existingTarget || isEmptySparseTarget;
    }
,

    getDenseBrushPaintTargetRect(layerId, strokeBufferRect, effectiveStrokeRect, documentTarget) {
      if (!strokeBufferRect) {
        return effectiveStrokeRect;
      }

      if (this.isFirstDenseBrushPaintTarget(layerId)) {
        return this.getStrokeAllocationBounds(documentTarget);
      }

      return strokeBufferRect;
    }
,

    getEraserPaintTargetLookupRect(layerId, strokeRect) {
      if (!layerId || !strokeRect) {
        return strokeRect || null;
      }

      const target = this.documentRenderer?.rasterTargetsByLayerId?.get?.(layerId) ||
        this.documentRenderer?.getRasterTarget?.(layerId);
      const targetRect = this.documentRenderer?.getRasterTargetDocumentRect?.(target);
      const clipped = this.documentRenderer?.intersectRasterHistoryRects?.(strokeRect, targetRect) ||
        this.intersectDocumentRects(strokeRect, targetRect);

      return clipped || strokeRect;
    }
,

    bakeStrokeIncrementally({ decision = null, reason = "stroke-scratch-pressure" } = {}) {
      if (this.isIncrementalStrokeBakeInProgress) {
        return false;
      }

      const initialStrokeBufferRect = this.strokeBufferRect ? { ...this.strokeBufferRect } : null;
      const strokeRect = this.getActiveStrokeRect();
      const layerId = this.strokeTargetLayerId ||
        this.documentRenderer?.resolvePaintLayerId?.() ||
        this.getDocumentDrawTarget().layerId;
      const documentTarget = this.getDocumentDrawTarget(layerId);
      const scratchBytes = this.getStrokeScratchBytes(initialStrokeBufferRect);
      const safetyDecision = decision || this.shouldIncrementallyBakeStrokeScratch(reason);

      if (!safetyDecision.shouldBake || !this.strokeTexture || !initialStrokeBufferRect || !strokeRect || !layerId) {
        return false;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.incremental-bake", {
        coverage: safetyDecision.coverage,
        layerId,
        reason,
        scratchBytes,
        tool: this.currentStrokeTool || "brush",
      }) : null;

      this.isIncrementalStrokeBakeInProgress = true;

      try {
        const isEraserStroke = this.currentStrokeTool === "eraser";
        const selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(strokeRect);
        const hasSelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length > 0;
        const hasEmptySelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length === 0;

        if (hasEmptySelectionCoverage) {
          this.clearStrokeLayer();
          this.releaseStrokeLayerTarget();
          this.resetActiveStrokeSegmentAfterIncrementalBake();
          this.requestDraw();
          return true;
        }

        const effectiveStrokeRect = hasSelectionCoverage
          ? this.getBoundsForDocumentRects(selectionCoverageRects)
          : strokeRect;

        if (!effectiveStrokeRect) {
          return false;
        }

        const activeStrokeTilePatchRects = hasSelectionCoverage
          ? this.filterTilePatchRectsToCoverage(
              this.getActiveStrokeTilePatchRects(effectiveStrokeRect),
              selectionCoverageRects,
            )
          : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);
        const previewDirtyRects = this.getStrokePreviewDirtyRectsForBake(
          effectiveStrokeRect,
          activeStrokeTilePatchRects,
        );
        const targetStrategy = this.getBrushBakePaintTargetStrategy({
          documentTarget,
          effectiveStrokeRect,
          isEraserStroke,
          tilePatchRects: activeStrokeTilePatchRects,
        });
        const paintTargetLookupRect = isEraserStroke
          ? this.getEraserPaintTargetLookupRect(layerId, effectiveStrokeRect)
          : effectiveStrokeRect;
        const paintTargetRect = !isEraserStroke && targetStrategy.sparse === false
          ? this.getDenseBrushPaintTargetRect(layerId, initialStrokeBufferRect, effectiveStrokeRect, documentTarget)
          : effectiveStrokeRect;
        const paintTargets = isEraserStroke
          ? this.documentRenderer?.getRasterTargetsForPaintRect?.(layerId, paintTargetLookupRect, {
              retileExistingTarget: false,
              sparse: false,
              source: "brush-incremental-eraser-target",
              tilePatchRects: activeStrokeTilePatchRects,
            }) || [{
              target: this.documentRenderer?.getRasterTarget?.(layerId) || this.getPaintTarget(),
            }]
          : this.documentRenderer?.ensureRasterTargetsForPaintRect?.(layerId, paintTargetRect, {
              sparse: targetStrategy.sparse,
              source: "brush-incremental-stroke-target",
              tilePatchRects: targetStrategy.tilePatchRects,
            }) || [{
              target: this.documentRenderer?.ensureRasterTargetForPaintRect?.(layerId, paintTargetRect, {
                source: "brush-incremental-stroke-target",
              }) || this.documentRenderer?.getRasterTarget?.(layerId),
            }];
        const target = paintTargets.find((item) => item?.target?.framebuffer && item?.target?.texture)?.target || null;

        if (!target?.framebuffer || !target?.texture) {
          return false;
        }

        const memoryReport = this.createStrokeMemoryReport({
          layerId,
          phase: "brush-incremental-bake",
          strokeBufferRect: initialStrokeBufferRect,
          strokeRect: effectiveStrokeRect,
          target: documentTarget,
          tool: this.currentStrokeTool,
        });

        memoryReport.reason = `incremental bake: ${reason}`;
        memoryReport.incrementalBakeSafetyReason = safetyDecision.safetyReason || "";
        memoryReport.incrementalBakeTriggerCoverage = safetyDecision.coverage || 0;
        memoryReport.incrementalBakeTriggerScratchBytes = scratchBytes;
        memoryReport.incrementalBakeTriggerScratchMiB = this.formatRasterMiB(scratchBytes);
        memoryReport.lastIncrementalBakeDecision = { ...safetyDecision };

        const batchedTileHistory = this.options.enableHistory
          ? this.prepareBatchedBrushHistory(layerId, effectiveStrokeRect, memoryReport, activeStrokeTilePatchRects)
          : null;

        if (this.options.enableHistory && !batchedTileHistory) {
          this.incrementalStrokeBakeSkippedReason = "history-capture-failed";
          return false;
        }

        const drawCallCount = this.drawStrokeTextureToPaintTargets({
          bakeRect: initialStrokeBufferRect,
          hasSelectionCoverage,
          isEraserStroke,
          paintTargets,
          selectionCoverageRects,
        });

        if (drawCallCount <= 0) {
          this.incrementalStrokeBakeSkippedReason = "no-draw-call";
          return false;
        }

        this.incrementalStrokeBakeCount = (this.incrementalStrokeBakeCount || 0) + 1;
        this.incrementalStrokeBakeBytesFreed = (this.incrementalStrokeBakeBytesFreed || 0) + scratchBytes;
        this.incrementalStrokeBakePeakScratchBytes = Math.max(this.incrementalStrokeBakePeakScratchBytes || 0, scratchBytes);
        this.incrementalStrokeBakeLastReason = reason;
        this.incrementalStrokeBakeLastRect = { ...initialStrokeBufferRect };
        this.incrementalStrokeBakeSkippedReason = "";
        this.incrementalStrokeBakedRect = this.unionDocumentRects(this.incrementalStrokeBakedRect, effectiveStrokeRect);
        memoryReport.incrementalBakeBytesFreed = this.incrementalStrokeBakeBytesFreed || 0;
        memoryReport.incrementalBakeBytesFreedMiB = this.formatRasterMiB(this.incrementalStrokeBakeBytesFreed || 0);
        memoryReport.incrementalBakeCount = this.incrementalStrokeBakeCount || 0;
        memoryReport.incrementalBakeLastRect = this.incrementalStrokeBakeLastRect ? { ...this.incrementalStrokeBakeLastRect } : null;
        memoryReport.incrementalBakePeakScratchBytes = this.incrementalStrokeBakePeakScratchBytes || 0;
        memoryReport.incrementalBakePeakScratchMiB = this.formatRasterMiB(this.incrementalStrokeBakePeakScratchBytes || 0);
        memoryReport.incrementalBakedRect = this.incrementalStrokeBakedRect ? { ...this.incrementalStrokeBakedRect } : null;

        this.recordStrokeMemory(memoryReport);
        this.clearStrokeLayer();
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();

        const keepPreviewCacheForDirtyBake = this.shouldKeepPreviewCacheForDirtyBake(
          previewDirtyRects,
          memoryReport,
          documentTarget,
        );

        this.documentRenderer?.evictRasterScratchCachesForPolicy?.(memoryReport, {
          deleteActiveStrokeScratch: true,
          deleteEffectScratch: false,
          deletePreviewCache: !keepPreviewCacheForDirtyBake,
          source: "brush-incremental-bake",
        });

        if (typeof this.documentRenderer?.commitVisualDirtyChange === "function") {
          this.documentRenderer.commitVisualDirtyChange({
            emit: false,
            layerId,
            maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
            preserveDirtyRects: true,
            rects: previewDirtyRects,
            source: "brush-incremental-bake",
          });
        } else {
          this.documentRenderer?.invalidatePreviewCache?.("brush-incremental-bake", {
            layerId,
            maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
            preserveDirtyRects: true,
            rects: previewDirtyRects,
          });
        }

        this.resetActiveStrokeSegmentAfterIncrementalBake();
        if (this.pendingBrushHistory) {
          this.schedulePendingBrushHistoryCommit();
        }
        this.requestDraw();

        namespace.lastBrushIncrementalStrokeBake = {
          drawCallCount,
          layerId,
          memoryReport,
          reason,
          scratchBytes,
          scratchMiB: this.formatRasterMiB(scratchBytes),
          strokeBufferRect: { ...initialStrokeBufferRect },
        };

        return true;
      } finally {
        this.isIncrementalStrokeBakeInProgress = false;
        trace?.end({
          bakeCount: this.incrementalStrokeBakeCount || 0,
          scratchBytes,
        });
      }
    }
,

    bakeStroke() {
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.bake", {
        tool: this.currentStrokeTool || "brush",
      }) : null;
      const beginBakeTrace = (name, detail = {}) => namespace.PerfTrace?.enabled
        ? namespace.PerfTrace.begin(`brush.bake.${name}`, detail)
        : null;

      try {
      const setupTrace = beginBakeTrace("setup");
      const gl = this.gl;
      const layerId = this.strokeTargetLayerId ||
        this.documentRenderer?.resolvePaintLayerId?.() ||
        this.getDocumentDrawTarget().layerId;
      const isEraserStroke = this.currentStrokeTool === "eraser";
      const { program, uniforms } = this.compositeProgramInfo;
      const strokeRect = this.getActiveStrokeRect();
      if (isEraserStroke) {
        namespace.EraserZoomDebug?.log?.("eraser-bake-start", {
          layerId,
          state: namespace.EraserZoomDebug?.captureLayerState?.(layerId, { coarseOnly: true }),
          strokeRect: strokeRect ? { ...strokeRect } : null,
          strokeStamps: this.strokeStampCount,
        });
      }
      setupTrace?.end({
        hasStrokeRect: Boolean(strokeRect),
        hasStrokeTexture: Boolean(this.strokeTexture),
        layerId,
        tool: this.currentStrokeTool || "brush",
      });

      if (!this.strokeTexture || !strokeRect) {
        if (isEraserStroke) {
          namespace.EraserZoomDebug?.warn?.("eraser-bake-missing-stroke-texture-or-rect", {
            hasStrokeRect: Boolean(strokeRect),
            hasStrokeTexture: Boolean(this.strokeTexture),
            layerId,
            state: namespace.EraserZoomDebug?.captureLayerState?.(layerId, { coarseOnly: true }),
          });
        }
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        if (this.pendingBrushHistory) {
          this.schedulePendingBrushHistoryCommit();
        }
        return;
      }

      const coverageTrace = beginBakeTrace("coverage");
      const selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(strokeRect);
      const hasSelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length > 0;
      const hasEmptySelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length === 0;
      coverageTrace?.end({
        coverageRectCount: Array.isArray(selectionCoverageRects) ? selectionCoverageRects.length : 0,
        hasEmptySelectionCoverage,
        hasSelectionCoverage,
      });

      if (hasEmptySelectionCoverage) {
        if (isEraserStroke) {
          namespace.EraserZoomDebug?.warn?.("eraser-bake-empty-selection-coverage", {
            layerId,
            strokeRect: strokeRect ? { ...strokeRect } : null,
          });
        }
        this.clearStrokeLayer();
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        return;
      }

      const effectiveStrokeRect = hasSelectionCoverage
        ? this.getBoundsForDocumentRects(selectionCoverageRects)
        : strokeRect;

      if (!effectiveStrokeRect) {
        if (isEraserStroke) {
          namespace.EraserZoomDebug?.warn?.("eraser-bake-missing-effective-stroke-rect", {
            layerId,
            strokeRect: strokeRect ? { ...strokeRect } : null,
          });
        }
        this.clearStrokeLayer();
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        return;
      }

      const targetTrace = beginBakeTrace("targets");
      const documentTarget = this.getDocumentDrawTarget(layerId);
      const finalStrokeBufferRect = this.getFinalStrokeAllocationRect(strokeRect, documentTarget);
      const activeStrokeTilePatchRects = hasSelectionCoverage
        ? this.filterTilePatchRectsToCoverage(
            this.getActiveStrokeTilePatchRects(effectiveStrokeRect),
            selectionCoverageRects,
          )
        : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);
      const previewDirtyRects = this.getStrokePreviewDirtyRectsForBake(
        effectiveStrokeRect,
        activeStrokeTilePatchRects,
      );
      const targetStrategy = this.getBrushBakePaintTargetStrategy({
        documentTarget,
        effectiveStrokeRect,
        isEraserStroke,
        tilePatchRects: activeStrokeTilePatchRects,
      });
      const skipFinalScratchCompact = this.shouldSkipFinalStrokeScratchCompact({
        effectiveStrokeRect,
        finalStrokeBufferRect,
        isEraserStroke,
        strokeRect,
        target: documentTarget,
        targetStrategy,
      });
      const plannedBakeRect = skipFinalScratchCompact && this.strokeBufferRect
        ? { ...this.strokeBufferRect }
        : finalStrokeBufferRect;
      const paintTargetLookupRect = isEraserStroke
        ? this.getEraserPaintTargetLookupRect(layerId, effectiveStrokeRect)
        : effectiveStrokeRect;
      const isFirstDensePaintTarget = !isEraserStroke &&
        targetStrategy.sparse === false &&
        this.isFirstDenseBrushPaintTarget(layerId);
      const paintTargetRect = !isEraserStroke && targetStrategy.sparse === false
        ? this.getDenseBrushPaintTargetRect(layerId, plannedBakeRect, effectiveStrokeRect, documentTarget)
        : effectiveStrokeRect;
      const paintTargets = isEraserStroke
        ? this.documentRenderer?.getRasterTargetsForPaintRect?.(layerId, paintTargetLookupRect, {
            retileExistingTarget: false,
            sparse: false,
            source: "brush-eraser-target",
            tilePatchRects: activeStrokeTilePatchRects,
          }) || [{
          target: this.documentRenderer?.getRasterTarget?.(layerId) || this.getPaintTarget(),
        }]
        : this.documentRenderer?.ensureRasterTargetsForPaintRect?.(layerId, paintTargetRect, {
            sparse: targetStrategy.sparse,
            source: "brush-stroke-target",
            tilePatchRects: targetStrategy.tilePatchRects,
          }) || [{
            target: this.documentRenderer?.ensureRasterTargetForPaintRect?.(layerId, paintTargetRect, {
              source: "brush-stroke-target",
            }) || this.documentRenderer?.getRasterTarget?.(layerId),
          }];
      const target = paintTargets.find((item) => item?.target?.framebuffer && item?.target?.texture)?.target || null;
      targetTrace?.end({
        hasFinalStrokeBufferRect: Boolean(finalStrokeBufferRect),
        hasTarget: Boolean(target),
        paintTargetCount: paintTargets.length,
        previewDirtyRectCount: previewDirtyRects.length,
        skipFinalScratchCompact,
        targetStrategy: targetStrategy.mode,
        tilePatchRectCount: targetStrategy.tilePatchRectCount,
      });
      if (isEraserStroke) {
        namespace.EraserZoomDebug?.log?.("eraser-bake-targets", {
          effectiveStrokeRect: effectiveStrokeRect ? { ...effectiveStrokeRect } : null,
          finalStrokeBufferRect: finalStrokeBufferRect ? { ...finalStrokeBufferRect } : null,
          layerId,
          paintTargetLookupRect: paintTargetLookupRect ? { ...paintTargetLookupRect } : null,
          paintTargetCount: paintTargets.length,
          targets: paintTargets.map((item) =>
            namespace.EraserZoomDebug?.getTargetSummary?.(item?.target, this.documentRenderer)),
          target: namespace.EraserZoomDebug?.getTargetSummary?.(target, this.documentRenderer),
          tilePatchRectCount: targetStrategy.tilePatchRectCount,
        });
      }

      if (!target?.framebuffer || !target?.texture || !finalStrokeBufferRect) {
        if (isEraserStroke) {
          namespace.EraserZoomDebug?.warn?.("eraser-bake-no-usable-target", {
            hasFinalStrokeBufferRect: Boolean(finalStrokeBufferRect),
            layerId,
            target: namespace.EraserZoomDebug?.getTargetSummary?.(target, this.documentRenderer),
          });
        }
        this.releaseStrokeLayerTarget();
        return;
      }

      const historyPrepareTrace = beginBakeTrace("history-prepare");
      const memoryReport = this.createStrokeMemoryReport({
        layerId,
        phase: "brush-bake",
        strokeBufferRect: plannedBakeRect,
        strokeRect: effectiveStrokeRect,
        target: documentTarget,
        tool: this.currentStrokeTool,
      });
      const batchedTileHistory = this.prepareBatchedBrushHistory(
        layerId,
        effectiveStrokeRect,
        memoryReport,
        activeStrokeTilePatchRects,
      );
      const tileHistory = !batchedTileHistory && this.options.enableHistory && effectiveStrokeRect
        ? this.documentRenderer?.beginRasterTileHistory?.(layerId, effectiveStrokeRect, {
            label: "brush-stroke",
            source: this.currentStrokeTool,
            tilePatchRects: activeStrokeTilePatchRects,
          })
        : null;
      const beforeSnapshot = this.options.enableHistory && effectiveStrokeRect && !batchedTileHistory && !tileHistory
        ? this.createHistorySnapshot(target, effectiveStrokeRect, "before-stroke")
        : null;
      historyPrepareTrace?.end({
        hasBatchedTileHistory: Boolean(batchedTileHistory),
        hasBeforeSnapshot: Boolean(beforeSnapshot),
        hasTileHistory: Boolean(tileHistory),
        historyMode: memoryReport?.historyMode || "",
        policy: memoryReport?.policy || "",
      });
      if (isEraserStroke) {
        namespace.EraserZoomDebug?.log?.("eraser-bake-history-prepare", {
          hasBatchedTileHistory: Boolean(batchedTileHistory),
          hasBeforeSnapshot: Boolean(beforeSnapshot),
          hasTileHistory: Boolean(tileHistory),
          historyMode: memoryReport?.historyMode || "",
          layerId,
          policy: memoryReport?.policy || "",
        });
      }

      const preDrawTrace = beginBakeTrace("pre-draw");
      this.recordStrokeMemory(memoryReport);
      let didCompactStrokeScratch = false;

      if (!skipFinalScratchCompact) {
        didCompactStrokeScratch = this.compactStrokeLayerTargetForRect(strokeRect, documentTarget) === true;
      }

      this.warmPreviewCacheForStroke();
      preDrawTrace?.end({
        didCompactStrokeScratch,
        policy: memoryReport?.policy || "",
        skipFinalScratchCompact,
      });
      const bakeRect = this.strokeBufferRect || { ...(plannedBakeRect || strokeRect) };
      const drawTrace = beginBakeTrace("draw-targets", {
        paintTargetCount: paintTargets.length,
      });
      const drawCallCount = this.drawStrokeTextureToPaintTargets({
        bakeRect,
        hasSelectionCoverage,
        isEraserStroke,
        paintTargets,
        selectionCoverageRects,
      });
      drawTrace?.end({
        drawCallCount,
        paintTargetCount: paintTargets.length,
        selectionScissorCount: hasSelectionCoverage ? drawCallCount : 0,
      });
      if (isEraserStroke) {
        namespace.EraserZoomDebug?.log?.("eraser-bake-drawn", {
          bakeRect: bakeRect ? { ...bakeRect } : null,
          drawCallCount,
          layerId,
          paintTargetCount: paintTargets.length,
          state: namespace.EraserZoomDebug?.captureLayerState?.(layerId, { coarseOnly: true }),
        });
      }

      const historyCommitTrace = beginBakeTrace("history-commit");
      let historyCommitMode = "none";
      let pushedHistoryEntry = false;
      if (batchedTileHistory) {
        historyCommitMode = "batched-tile";
        this.schedulePendingBrushHistoryCommit();
      } else if (tileHistory) {
        historyCommitMode = "tile";
        const history = namespace.documentHistory;
        const tileEntry = this.documentRenderer?.commitRasterTileHistory?.(tileHistory, {
          label: "brush-stroke",
          lazyAfter: true,
          memoryPolicy: memoryReport,
          redoSource: `history-redo-${this.currentStrokeTool}`,
          source: this.currentStrokeTool,
          type: "pixel",
          undoSource: `history-undo-${this.currentStrokeTool}`,
        });
        const entry = tileEntry
          ? this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, tileEntry, {
              source: this.currentStrokeTool,
            }) || tileEntry
          : null;

        if (history?.push && entry) {
          history.push(entry);
          pushedHistoryEntry = true;
          this.pruneRasterHistoryForStroke(memoryReport);
        } else {
          this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
            source: this.currentStrokeTool,
          });
          this.documentRenderer?.deleteRasterTileHistoryCapture?.(tileHistory);
        }
      } else if (beforeSnapshot) {
        historyCommitMode = "snapshot";
        const history = namespace.documentHistory;
        let afterSnapshot = null;
        let entry = null;
        const redoDisabled = memoryReport.historyMode === "gpu-before-no-redo";
        const captureRedoSnapshot = () => {
          if (redoDisabled) {
            return false;
          }

          if (afterSnapshot?.texture) {
            return true;
          }

          const redoTarget = this.documentRenderer?.getRasterTarget?.(layerId);

          afterSnapshot = this.createHistorySnapshot(redoTarget, beforeSnapshot.docRect || beforeSnapshot.rect, "after-stroke");
          if (afterSnapshot?.texture && entry) {
            entry.after = afterSnapshot;
          }

          return Boolean(afterSnapshot?.texture);
        };

        if (history?.push) {
          entry = {
            type: "pixel",
            after: null,
            before: beforeSnapshot,
            memoryPolicy: memoryReport,
            layerId,
            rect: beforeSnapshot.docRect || beforeSnapshot.rect,
            source: this.currentStrokeTool,
            undo: () => {
              if (redoDisabled) {
                return this.restoreHistorySnapshot(layerId, beforeSnapshot);
              }

              if (!captureRedoSnapshot()) {
                return false;
              }

              return this.restoreHistorySnapshot(layerId, beforeSnapshot);
            },
            redo: () => afterSnapshot?.texture
              ? this.restoreHistorySnapshot(layerId, afterSnapshot)
              : false,
            destroy: () => {
              this.deleteHistorySnapshot(beforeSnapshot);
              this.deleteHistorySnapshot(afterSnapshot);
            },
          };

          entry = this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, entry, {
            source: this.currentStrokeTool,
          }) || entry;

          history.push(entry);
          pushedHistoryEntry = true;
          this.pruneRasterHistoryForStroke(memoryReport);
        } else {
          this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
            source: this.currentStrokeTool,
          });
          this.deleteHistorySnapshot(beforeSnapshot);
        }
      } else {
        this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
          source: this.currentStrokeTool,
        });
      }
      historyCommitTrace?.end({
        mode: historyCommitMode,
        pushedHistoryEntry,
      });
      if (isEraserStroke) {
        namespace.EraserZoomDebug?.log?.("eraser-bake-history-commit", {
          historyMode: historyCommitMode,
          layerId,
          pushedHistoryEntry,
        });
      }

      const cleanupTrace = beginBakeTrace("cleanup");
      this.clearStrokeLayer();
      this.releaseStrokeLayerTarget();
      this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      const keepPreviewCacheForDirtyBake = this.shouldKeepPreviewCacheForDirtyBake(
        previewDirtyRects,
        memoryReport,
        documentTarget,
      );
      this.documentRenderer?.evictRasterScratchCachesForPolicy?.(memoryReport, {
        deletePreviewCache: !keepPreviewCacheForDirtyBake,
        source: "brush-bake",
      });
      this.documentRenderer?.compactInactivePaintTargets?.({
        deleteEmptyTargets: !isEraserStroke,
        excludeLayerId: layerId,
        source: "brush-bake-compact-inactive",
      });
      cleanupTrace?.end({
        keepPreviewCacheForDirtyBake,
      });
      const dirtyTrace = beginBakeTrace("dirty");
      if (typeof this.documentRenderer?.commitVisualDirtyChange === "function") {
        this.documentRenderer.commitVisualDirtyChange({
          emit: false,
          layerId,
          maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: "bake-stroke",
        });
      } else {
        this.documentRenderer?.invalidatePreviewCache?.("bake-stroke", {
          layerId,
          maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
        });
      }
      this.requestDraw();
      dirtyTrace?.end({
        previewDirtyRectCount: previewDirtyRects.length,
      });
      if (isEraserStroke) {
        const afterState = namespace.EraserZoomDebug?.captureLayerState?.(layerId, { precise: true });
        const debugDetail = {
          after: afterState,
          historyMode: historyCommitMode,
          layerId,
          previewDirtyRectCount: previewDirtyRects.length,
          pushedHistoryEntry,
        };

        if (afterState?.contentBounds === null) {
          namespace.EraserZoomDebug?.warn?.("eraser-bake-end-content-null", debugDetail, { precise: true });
        } else {
          namespace.EraserZoomDebug?.log?.("eraser-bake-end", debugDetail, { precise: true });
        }
      }
      } finally {
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        trace?.end({
          strokeStamps: this.strokeStampCount,
          tool: this.currentStrokeTool || "brush",
        });
      }
    }
,

    clearStrokeLayer() {
      const gl = this.gl;
      const target = this.strokeBufferRect || this.getFullDocumentRect();
      const framebuffers = [this.strokeFBO, this.strokePlateauFBO, this.strokeAccumFBO];

      for (const framebuffer of framebuffers) {
        if (!framebuffer) {
          continue;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
,

    clearAllLayers() {
      this.documentRenderer?.clear();
      this.releaseStrokeLayerTarget();
      this.requestDraw();
    }
,

    startRenderLoop() {
      this.requestDraw();
    }
,

    requestDraw() {
      if (this.isDisposed || this.options.manualRender || this.frameRequest) {
        return;
      }

      this.frameRequest = requestAnimationFrame(this.renderLoop);
    }
,

    createCameraChangeDetail() {
      return {
        camera: {
          x: this.camera.x,
          y: this.camera.y,
          zoom: this.camera.zoom,
        },
        dpr: this.dpr,
        viewportHeight: this.viewportHeight,
        viewportWidth: this.viewportWidth,
      };
    }
,

    hasCameraChangeDetailChanged(detail) {
      const previous = this.lastCameraChangeDetail;

      return !previous ||
        previous.camera?.x !== detail.camera.x ||
        previous.camera?.y !== detail.camera.y ||
        previous.camera?.zoom !== detail.camera.zoom ||
        previous.dpr !== detail.dpr ||
        previous.viewportHeight !== detail.viewportHeight ||
        previous.viewportWidth !== detail.viewportWidth;
    }
,

    dispatchCameraChangeIfNeeded() {
      if (this.options.suppressCameraEvents) {
        return false;
      }

      const detail = this.createCameraChangeDetail();

      if (!this.hasCameraChangeDetailChanged(detail)) {
        return false;
      }

      this.lastCameraChangeDetail = {
        ...detail,
        camera: { ...detail.camera },
      };
      window.dispatchEvent(new CustomEvent("cbo:camera-change", { detail }));

      return true;
    }
,

    renderLoop(frameTimestamp = 0) {
      if (this.isDisposed) {
        return;
      }

      const governor = namespace.EngineGovernor;
      const frameMode = this.isDrawing || this.isPanning || this.touchNavigationGesture || namespace.smudgeEngine?.isDragging
        ? "interactive"
        : undefined;

      this.frameRequest = 0;
      governor?.beginFrame?.({
        activeStroke: this.isDrawing,
        dpr: this.dpr,
        frameTimestamp,
        mode: frameMode,
        pendingPointerSamples: Array.isArray(this.pendingPointerSamples) ? this.pendingPointerSamples.length : 0,
        source: "brush-engine",
      });

      try {
        if (this.resizeViewport() && !this.userManipulatedCamera) {
          this.centerCamera();
        }

        this.draw();
      } finally {
        governor?.endFrame?.({
          activeStroke: this.isDrawing,
          dpr: this.dpr,
        });
      }
    }
,

    draw() {
      this.processPendingPointerSamples({
        requestDraw: false,
      });
      const target = this.getDocumentDrawTarget();
      const activeStrokeLayerId = this.strokeTargetLayerId || target.layerId;
      const allowPreviewCache = !namespace.smudgeEngine?.isDragging;
      const deferPreviewCacheUpdate = this.isDrawing || this.isPanning || this.touchNavigationGesture || namespace.smudgeEngine?.isDragging;
      const endRenderSubmit = namespace.EngineGovernor?.beginRenderSubmit?.({
        activeStroke: this.isDrawing,
        allowPreviewCache,
        deferPreviewCacheUpdate,
        source: "document-renderer",
      });

      try {
      this.documentRenderer.drawToCanvas({
        allowPreviewCache,
        activeStrokeClipRect: namespace.areaSelection?.hasSelection?.()
          ? namespace.areaSelection.getRect?.()
          : null,
        activeStrokeClipRects: this.getActiveAreaSelectionCoverageRects(this.strokeBufferRect),
        activeStrokeLayerId,
        activeStrokeMode: this.currentStrokeTool === "eraser" ? "eraser" : "paint",
        activeStrokeRect: this.strokeBufferRect,
        activeStrokeSelectionMask: this.currentStrokeTool === "eraser"
          ? this.getActiveAreaSelectionMask(this.strokeBufferRect)
          : null,
        activeStrokeTexture: this.isDrawing ? this.strokeTexture : null,
        camera: this.camera,
        deferPreviewCacheUpdate,
        dpr: this.dpr,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
      });
      } finally {
        const viewportStats = this.documentRenderer?.getLastViewportCullingStats?.() || namespace.lastViewportCullingStats || null;

        endRenderSubmit?.({
          cacheMisses: allowPreviewCache && this.documentRenderer?.previewCacheDirty ? 1 : 0,
          visibleTiles: Number(viewportStats?.sparseTiles?.drawn) || 0,
        });
      }

      this.dispatchCameraChangeIfNeeded();
    }
,

    dispose() {
      const gl = this.gl;

      this.isDisposed = true;

      if (this.frameRequest) {
        cancelAnimationFrame(this.frameRequest);
        this.frameRequest = 0;
      }

      this.cancelActiveStrokeDirtyRegionDebug();
      this.cancelStrokeTargetPrewarm();

      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
      window.removeEventListener("cbo:tool-change", this.handleToolChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.removeEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.removeEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.removeEventListener("cbo:before-raster-history-capture", this.handleBeforeRasterHistoryCapture);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (!this.options.disableInput) {
        const navigationTarget = this.stage || this.canvas;

        this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
        this.canvas.removeEventListener("pointermove", this.handlePointerMove);
        this.canvas.removeEventListener("pointerup", this.handlePointerUp);
        this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
        this.canvas.removeEventListener("wheel", this.handleWheel);
        navigationTarget.removeEventListener("pointerdown", this.handleNavigationPointerDown, true);
        navigationTarget.removeEventListener("pointermove", this.handleNavigationPointerMove, true);
        navigationTarget.removeEventListener("pointerup", this.handleNavigationPointerUp, true);
        navigationTarget.removeEventListener("pointercancel", this.handleNavigationPointerCancel, true);
        navigationTarget.removeEventListener("auxclick", this.handleAuxClick, true);
        window.removeEventListener("pointerup", this.handleWindowTouchNavigationPointerRelease);
        window.removeEventListener("pointercancel", this.handleWindowTouchNavigationPointerRelease);
        window.removeEventListener("touchend", this.handleWindowTouchNavigationEnd);
        window.removeEventListener("touchcancel", this.handleWindowTouchNavigationEnd);
      }
      window.removeEventListener("keydown", this.handleKeyDown, true);
      window.removeEventListener("keyup", this.handleKeyUp, true);
      window.removeEventListener("blur", this.handleWindowBlur);
      this.canvas.style.cursor = "";
      document.body?.classList.remove("cbo-canvas-pan-active", "cbo-canvas-pan-ready");
      this.discardPendingBrushHistory();
      this.activeTouchPointers.clear();
      this.touchNavigationGesture = null;
      this.endTouchNavigationExclusive();
      if (this.emptyEraserLayerToastTimer) {
        window.clearTimeout?.(this.emptyEraserLayerToastTimer);
        this.emptyEraserLayerToastTimer = 0;
      }

      if (this.fullscreenQuad) {
        gl.deleteBuffer(this.fullscreenQuad.buffer);
        gl.deleteVertexArray(this.fullscreenQuad.vao);
        this.fullscreenQuad = null;
      }

      if (this.brush) {
        gl.deleteBuffer(this.brush.instanceVBO);
        gl.deleteBuffer(this.brush.quadVBO);
        gl.deleteVertexArray(this.brush.vao);
        this.brush = null;
      }

      this.documentRenderer = null;

      if (this.strokeFBO) {
        this.deleteBrushFramebuffer(this.strokeFBO);
        gl.deleteFramebuffer(this.strokeFBO);
        this.strokeFBO = null;
      }

      if (this.strokeTexture) {
        this.deleteBrushTexture(this.strokeTexture);
        gl.deleteTexture(this.strokeTexture);
        this.strokeTexture = null;
      }

      if (this.strokePlateauFBO) {
        this.deleteBrushFramebuffer(this.strokePlateauFBO);
        gl.deleteFramebuffer(this.strokePlateauFBO);
        this.strokePlateauFBO = null;
      }

      if (this.strokePlateauTexture) {
        this.deleteBrushTexture(this.strokePlateauTexture);
        gl.deleteTexture(this.strokePlateauTexture);
        this.strokePlateauTexture = null;
      }

      if (this.strokeAccumFBO) {
        this.deleteBrushFramebuffer(this.strokeAccumFBO);
        gl.deleteFramebuffer(this.strokeAccumFBO);
        this.strokeAccumFBO = null;
      }

      if (this.strokeAccumTexture) {
        this.deleteBrushTexture(this.strokeAccumTexture);
        gl.deleteTexture(this.strokeAccumTexture);
        this.strokeAccumTexture = null;
      }

      if (this.shapeTexture) {
        this.deleteBrushTexture(this.shapeTexture);
        gl.deleteTexture(this.shapeTexture);
        this.shapeTexture = null;
      }

      if (this.grainTexture) {
        this.deleteBrushTexture(this.grainTexture);
        gl.deleteTexture(this.grainTexture);
        this.grainTexture = null;
      }

      if (this.compositeProgramInfo?.program) {
        gl.deleteProgram(this.compositeProgramInfo.program);
        this.compositeProgramInfo = null;
      }

      if (this.strokeBuildupProgramInfo?.program) {
        gl.deleteProgram(this.strokeBuildupProgramInfo.program);
        this.strokeBuildupProgramInfo = null;
      }

      if (this.brushProgramInfo?.program) {
        gl.deleteProgram(this.brushProgramInfo.program);
        this.brushProgramInfo = null;
      }

    }

    });
  };
})(window.CBO = window.CBO || {});
