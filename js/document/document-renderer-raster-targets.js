(function registerRasterTargets(namespace) {
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

  namespace.DocumentRendererMixins.rasterTargets = function installRegisterRasterTargets(DocumentRenderer, internals) {
    const {
      ANDROID_PREVIEW_CACHE_MAX_SIZE,
      ANDROID_PREVIEW_CACHE_OVERSCAN_CSS_PX,
      ANDROID_RENDER_DPR_CAP,
      ANDROID_VIEWPORT_RENDER_OVERSCAN_CSS_PX,
      ARTBOARD_FLAT_PREVIEW_MAX_SIZE,
      ARTBOARD_FRAGMENT_SHADER_SOURCE,
      ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES,
      ARTBOARD_RESIDENCY_IDLE_DELAY_MS,
      ARTBOARD_RESIDENCY_PREFETCH_CSS_PX,
      ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES,
      ARTBOARD_RESIDENCY_WARM_HOLD_MS,
      ARTBOARD_VERTEX_SHADER_SOURCE,
      CLIP_IDENTITY_UV_MATRIX,
      CROPPED_TARGET_EDGE_PADDING,
      CROPPED_TARGET_EFFECT_PADDING,
      CURVES_FRAGMENT_SHADER_SOURCE,
      DEFAULT_GRAIN_SCALE,
      DEFAULT_NOISE_SCALE,
      DEFAULT_PUPPET_GRID_COLS,
      DEFAULT_PUPPET_GRID_ROWS,
      DEFAULT_THRESHOLD_VALUE,
      DESKTOP_RENDER_DPR_CAP,
      FIELD_BLUR_FRAGMENT_SHADER_SOURCE,
      FIELD_BLUR_VERTEX_SHADER_SOURCE,
      GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE,
      GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE,
      GRAIN_FRAGMENT_SHADER_SOURCE,
      LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE,
      LAYER_COMPOSITE_VERTEX_SHADER_SOURCE,
      LOW_MEMORY_ANDROID_RENDER_DPR_CAP,
      LOW_MEMORY_MOBILE_RENDER_DPR_CAP,
      MAX_FIELD_BLUR_PINS,
      MAX_FIELD_BLUR_RADIUS,
      MAX_GAUSSIAN_BLUR_RADIUS,
      MAX_GRAIN_AMOUNT,
      MAX_GRAIN_SCALE,
      MAX_MOTION_BLUR_DISTANCE,
      MAX_NOISE_AMOUNT,
      MAX_NOISE_SCALE,
      MAX_RADIAL_BLUR_AMOUNT,
      MAX_THRESHOLD_VALUE,
      MOBILE_PREVIEW_CACHE_MAX_SIZE,
      MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX,
      MOBILE_RENDER_DPR_CAP,
      MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX,
      MOTION_BLUR_FRAGMENT_SHADER_SOURCE,
      MOTION_BLUR_VERTEX_SHADER_SOURCE,
      NOISE_FRAGMENT_SHADER_SOURCE,
      PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE,
      PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE,
      PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD,
      PREVIEW_CACHE_MAX_SIZE,
      PREVIEW_CACHE_SCOPE_DEFAULT,
      PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX,
      PREVIEW_CACHE_ZOOM_THRESHOLD,
      PREVIEW_DIRTY_DEBUG_EVENT,
      PREVIEW_DIRTY_FULL_COVERAGE_RATIO,
      PREVIEW_DIRTY_MAX_RECTS,
      PREVIEW_DIRTY_MERGE_WASTE_RATIO,
      PUPPET_FRAGMENT_SHADER_SOURCE,
      PUPPET_PIN_EPSILON,
      PUPPET_VERTEX_SHADER_SOURCE,
      RADIAL_BLUR_FRAGMENT_SHADER_SOURCE,
      RADIAL_BLUR_VERTEX_SHADER_SOURCE,
      RASTER_BYTES_PER_PIXEL,
      RASTER_HISTORY_MOBILE_TILE_SIZE,
      RASTER_HISTORY_TILE_SIZE,
      RASTER_MIB,
      RASTER_OPERATION_MEMORY_POLICY,
      RASTER_SCRATCH_HARD_WARN_BYTES,
      RASTER_SCRATCH_SOFT_EVICT_BYTES,
      RASTER_SCRATCH_TOP_RESOURCE_LIMIT,
      RASTER_TRANSFORM_ARTBOARD_TRANSFER_MIN_RATIO,
      RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING,
      RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS,
      RASTER_WARP_MESH_COLS,
      RASTER_WARP_MESH_ROWS,
      TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE,
      TEXTURED_QUAD_VERTEX_SHADER_SOURCE,
      THRESHOLD_FRAGMENT_SHADER_SOURCE,
      VIEWPORT_CULLING_DEBUG_EVENT,
      VIEWPORT_LAYER_CULL_SAFE_TYPES,
      VIEWPORT_RENDER_OVERSCAN_CSS_PX,
      WEBGL2_CONTEXT_ATTRIBUTES,
      buildPackedCurvesLut,
      createDefaultCurvesPoints,
      getCanvasPerformanceDpr,
      getCurvesEngine,
      getDefaultPreviewCacheMaxSize,
      getDefaultPreviewCacheOverscanCssPx,
      getDefaultViewportRenderOverscanCssPx,
      getNavigatorDeviceMemory,
      hasFieldBlurAmount,
      hasMeaningfulCurvesEffect,
      isAndroidDirtyRegionsDisabled,
      isAndroidFullRenderMode,
      isAndroidLikeEnvironment,
      isAndroidPerformanceMode,
      isAndroidPreviewCacheDisabled,
      isAndroidZoomOutPreviewCacheAllowed,
      isMobileLikeEnvironment,
      isPixelPerfectRenderingEnabled,
      normalizeAngle,
      normalizeCurvesEffect,
      normalizeFieldBlurPins,
      normalizeGrainAmount,
      normalizeGrainScale,
      normalizeNoiseAmount,
      normalizeNoiseScale,
      normalizePercent,
      normalizeRadialBlurMode,
      normalizeThresholdValue,
    } = internals;

    defineDocumentRendererMethods(DocumentRenderer, {
    getRasterResourceManager() {
      return namespace.rasterResourceManager || null;
    }
,

    withRasterResourceDocumentMetadata(metadata = {}) {
      return {
        ...metadata,
        documentHeight: metadata.documentHeight ?? this.height,
        documentWidth: metadata.documentWidth ?? this.width,
      };
    }
,

    registerRasterTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.withRasterResourceDocumentMetadata(metadata));
    }
,

    updateRasterTexture(textureOrId, metadataPatch = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.updateTexture || !textureOrId) {
        return null;
      }

      return manager.updateTexture(textureOrId, this.withRasterResourceDocumentMetadata(metadataPatch));
    }
,

    deleteRasterTexture(textureOrId) {
      const manager = this.getRasterResourceManager();

      if (!manager?.deleteTexture || !textureOrId) {
        return false;
      }

      return manager.deleteTexture(textureOrId);
    }
,

    registerRasterFramebuffer(framebuffer, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerFramebuffer || !framebuffer) {
        return null;
      }

      return manager.registerFramebuffer(framebuffer, this.withRasterResourceDocumentMetadata(metadata));
    }
,

    updateRasterFramebuffer(framebufferOrId, metadataPatch = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.updateFramebuffer || !framebufferOrId) {
        return null;
      }

      return manager.updateFramebuffer(framebufferOrId, this.withRasterResourceDocumentMetadata(metadataPatch));
    }
,

    deleteRasterFramebuffer(framebufferOrId) {
      const manager = this.getRasterResourceManager();

      if (!manager?.deleteFramebuffer || !framebufferOrId) {
        return false;
      }

      return manager.deleteFramebuffer(framebufferOrId);
    }
,

    markRasterResourceUsed(textureOrId) {
      return this.getRasterResourceManager()?.markUsed?.(textureOrId) || null;
    }
,

    getRasterRectBytes(rectOrWidth, height = null) {
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
,

    getRasterOperationCoverage(rectOrWidth, height = null) {
      const width = typeof rectOrWidth === "object"
        ? rectOrWidth?.width
        : rectOrWidth;
      const resolvedHeight = typeof rectOrWidth === "object"
        ? rectOrWidth?.height
        : height;
      const documentPixels = Math.max(0, Math.round(this.width || 0)) * Math.max(0, Math.round(this.height || 0));

      if (documentPixels <= 0) {
        return 0;
      }

      return Math.min(
        1,
        Math.max(0, (Math.max(0, width || 0) * Math.max(0, resolvedHeight || 0)) / documentPixels),
      );
    }
,

    classifyRasterOperationMemory(estimatedPeakBytes, coverage = 0) {
      if (
        estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.largeMaxBytes ||
        coverage >= RASTER_OPERATION_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.mediumMaxBytes) {
        return "large";
      }

      if (estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }
,

    formatRasterMiB(bytes) {
      return ((Math.max(0, Number(bytes) || 0) / RASTER_MIB)).toFixed(2);
    }
,

    getRasterOperationPolicy(report = {}) {
      const policy = String(report?.policy || "").toLowerCase();

      if (policy) {
        return policy;
      }

      return this.classifyRasterOperationMemory(
        Number(report?.estimatedPeakBytes) || 0,
        Number(report?.coverage) || 0,
      );
    }
,

    shouldEvictRasterScratchForPolicy(report = {}) {
      const policy = this.getRasterOperationPolicy(report);
      const scratchBytes = Math.max(0, Math.round(Number(report?.scratchBytes) || 0));

      return (
        policy === "large" ||
        policy === "huge" ||
        report?.scratchBudgetExceeded === true ||
        scratchBytes >= RASTER_SCRATCH_SOFT_EVICT_BYTES
      );
    }
,

    getRasterScratchDiagnostics(limit = RASTER_SCRATCH_TOP_RESOURCE_LIMIT) {
      const normalizedLimit = Math.max(1, Math.floor(Number(limit) || RASTER_SCRATCH_TOP_RESOURCE_LIMIT));
      const manager = this.getRasterResourceManager();
      const topScratchResources = typeof manager?.getTopScratchResourcesByBytes === "function"
        ? manager.getTopScratchResourcesByBytes(normalizedLimit)
        : (
            typeof manager?.getTopResourcesByBytes === "function"
              ? manager.getTopResourcesByBytes(64).filter((row) => row.ownerType === "scratch").slice(0, normalizedLimit)
              : []
          );

      return {
        activeStrokeScratchTargetPresent: Boolean(this.activeStrokeScratchTarget?.texture),
        activeStrokeScratchTargetSize: this.activeStrokeScratchTarget
          ? {
              height: Math.max(0, Math.round(this.activeStrokeScratchTarget.height || 0)),
              width: Math.max(0, Math.round(this.activeStrokeScratchTarget.width || 0)),
            }
          : null,
        layerEffectScratchAPresent: Boolean(this.layerEffectScratchA?.texture),
        layerEffectScratchASize: this.layerEffectScratchA
          ? {
              height: Math.max(0, Math.round(this.layerEffectScratchA.height || 0)),
              width: Math.max(0, Math.round(this.layerEffectScratchA.width || 0)),
            }
          : null,
        layerEffectScratchBPresent: Boolean(this.layerEffectScratchB?.texture),
        layerEffectScratchBSize: this.layerEffectScratchB
          ? {
              height: Math.max(0, Math.round(this.layerEffectScratchB.height || 0)),
              width: Math.max(0, Math.round(this.layerEffectScratchB.width || 0)),
            }
          : null,
        scratchHardWarnMiB: this.formatRasterMiB(RASTER_SCRATCH_HARD_WARN_BYTES),
        scratchSoftEvictMiB: this.formatRasterMiB(RASTER_SCRATCH_SOFT_EVICT_BYTES),
        topScratchResources: topScratchResources.map((row) => ({
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
        })),
      };
    }
,

    evictRasterScratchCachesForPolicy(report = {}, options = {}) {
      if (!this.shouldEvictRasterScratchForPolicy(report)) {
        return null;
      }

      const policy = this.getRasterOperationPolicy(report);
      const hadPreviewCache = Boolean(this.previewTexture || this.previewFramebuffer);
      const hadEffectScratch = Boolean(this.layerEffectScratchA || this.layerEffectScratchB);
      const hadCompositeScratch = Boolean(this.layerCompositeScratchA || this.layerCompositeScratchB);
      const hadActiveStrokeScratch = Boolean(this.activeStrokeScratchTarget);
      const deletePreviewCache = options.deletePreviewCache !== false;
      const deleteEffectScratch = options.deleteEffectScratch !== false;
      const deleteCompositeScratch = options.deleteCompositeScratch !== false;
      const deleteActiveStrokeScratch = options.deleteActiveStrokeScratch !== false;

      if (deletePreviewCache && hadPreviewCache) {
        this.deletePreviewCache();
      }

      if (deleteEffectScratch && hadEffectScratch) {
        this.deleteLayerEffectScratchTargets();
      }

      if (deleteCompositeScratch && hadCompositeScratch) {
        this.deleteLayerCompositeTargets();
      }

      if (deleteActiveStrokeScratch && hadActiveStrokeScratch) {
        this.deleteActiveStrokeScratchTarget();
      }

      const scratchBytes = Math.max(0, Math.round(Number(report?.scratchBytes) || 0));
      const eviction = {
        createdAt: new Date().toISOString(),
        operationType: report?.operationType || report?.phase || "",
        policy,
        reason: report?.reason || options.reason || "raster-policy",
        scratchBudgetExceeded: scratchBytes >= RASTER_SCRATCH_SOFT_EVICT_BYTES,
        scratchBytes,
        scratchDiagnostics: this.getRasterScratchDiagnostics?.() || null,
        scratchHardBudgetExceeded: scratchBytes >= RASTER_SCRATCH_HARD_WARN_BYTES,
        scratchHardWarnMiB: this.formatRasterMiB(RASTER_SCRATCH_HARD_WARN_BYTES),
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchSoftEvictMiB: this.formatRasterMiB(RASTER_SCRATCH_SOFT_EVICT_BYTES),
        source: options.source || report?.source || report?.tool || "raster-policy",
        deletedActiveStrokeScratch: deleteActiveStrokeScratch && hadActiveStrokeScratch,
        deletedCompositeScratch: deleteCompositeScratch && hadCompositeScratch,
        deletedEffectScratch: deleteEffectScratch && hadEffectScratch,
        deletedPreviewCache: deletePreviewCache && hadPreviewCache,
      };

      namespace.lastRasterScratchEviction = eviction;
      return eviction;
    }
,

    recordRasterOperation(report = {}) {
      const recorded = this.getRasterResourceManager()?.recordRasterOperation?.(
        this.withRasterResourceDocumentMetadata(report),
      ) || report;

      namespace.lastRasterOperationMemoryReport = recorded;
      this.evictRasterScratchCachesForPolicy(recorded);

      return recorded;
    }
,

    getRasterTargetResourceMetadata(target, metadata = {}) {
      const targetWidth = Math.max(1, Math.round(target?.width || 1));
      const targetHeight = Math.max(1, Math.round(target?.height || 1));
      const width = Math.max(1, Math.round(
        metadata.width ?? target?.resourceWidth ?? target?.textureWidth ?? targetWidth,
      ));
      const height = Math.max(1, Math.round(
        metadata.height ?? target?.resourceHeight ?? target?.textureHeight ?? targetHeight,
      ));
      const x = Number.isFinite(target?.x) ? Math.round(target.x) : 0;
      const y = Number.isFinite(target?.y) ? Math.round(target.y) : 0;
      const ownerId = metadata.ownerId || metadata.layerId || target?.layerId || target?.id || "";
      const bboxSource = metadata.bbox || metadata.rect || null;
      const bbox = {
        x: Number.isFinite(bboxSource?.x) ? Math.round(bboxSource.x) : x,
        y: Number.isFinite(bboxSource?.y) ? Math.round(bboxSource.y) : y,
        width: Math.max(1, Math.round(bboxSource?.width || targetWidth)),
        height: Math.max(1, Math.round(bboxSource?.height || targetHeight)),
      };

      return this.withRasterResourceDocumentMetadata({
        ...metadata,
        bbox,
        height,
        kind: metadata.kind || "layer",
        label: metadata.label || ownerId || target?.id || "raster target",
        layerId: metadata.layerId || target?.layerId || "",
        originX: x,
        originY: y,
        ownerId,
        ownerType: metadata.ownerType || "live",
        purgeable: metadata.purgeable === true,
        reason: metadata.reason || "raster-target",
        width,
      });
    }
,

    registerRasterTargetResources(target, metadata = {}) {
      if (!target) {
        return target;
      }

      const baseMetadata = this.getRasterTargetResourceMetadata(target, metadata);

      if (target.texture) {
        const textureRow = this.registerRasterTexture(target.texture, baseMetadata);
        target.textureResourceId = textureRow?.id || target.textureResourceId || "";
      }

      if (target.framebuffer) {
        const framebufferRow = this.registerRasterFramebuffer(target.framebuffer, {
          ...baseMetadata,
          kind: `${baseMetadata.kind}Framebuffer`,
          linkedTextureId: target.textureResourceId || "",
        });

        target.framebufferResourceId = framebufferRow?.id || target.framebufferResourceId || "";
      }

      return target;
    }
,

    updateRasterTargetResourceMetadata(target, metadata = {}) {
      if (!target) {
        return target;
      }

      const baseMetadata = this.getRasterTargetResourceMetadata(target, metadata);

      if (target.texture || target.textureResourceId) {
        const textureRow =
          this.updateRasterTexture(target.texture || target.textureResourceId, baseMetadata) ||
          this.registerRasterTexture(target.texture, baseMetadata);

        target.textureResourceId = textureRow?.id || target.textureResourceId || "";
      }

      if (target.framebuffer || target.framebufferResourceId) {
        const framebufferMetadata = {
          ...baseMetadata,
          kind: `${baseMetadata.kind}Framebuffer`,
          linkedTextureId: target.textureResourceId || "",
        };
        const framebufferRow =
          this.updateRasterFramebuffer(target.framebuffer || target.framebufferResourceId, framebufferMetadata) ||
          this.registerRasterFramebuffer(target.framebuffer, framebufferMetadata);

        target.framebufferResourceId = framebufferRow?.id || target.framebufferResourceId || "";
      }

      return target;
    }
,

    unregisterRasterTargetResources(target) {
      if (!target) {
        return;
      }

      if (target.framebuffer || target.framebufferResourceId) {
        this.deleteRasterFramebuffer(target.framebuffer || target.framebufferResourceId);
        target.framebufferResourceId = "";
      }

      if (target.texture || target.textureResourceId) {
        this.deleteRasterTexture(target.texture || target.textureResourceId);
        target.textureResourceId = "";
      }
    }
,

    estimateRasterTargetBytes(target) {
      if (this.isCopyOnWriteRasterTarget(target)) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.estimateRasterTargetBytes(tile);
        });

        return total;
      }

      const width = Math.max(0, Math.round(target?.width || 0));
      const height = Math.max(0, Math.round(target?.height || 0));

      return width * height * RASTER_BYTES_PER_PIXEL;
    }
,

    estimateRasterTargetDuplicateBytes(target, options = {}) {
      if (!target) {
        return 0;
      }

      return options.copyOnWrite === false
        ? this.estimateRasterTargetBytes(target)
        : 0;
    }
,

    isSparseRasterTarget(target) {
      return Boolean(target?.sparse === true && target.tiles instanceof Map);
    }
,

    isCopyOnWriteRasterTarget(target) {
      return Boolean(target?.copyOnWrite === true && target.copyOnWriteSource);
    }
,

    hasCopyOnWriteDependents(target) {
      return Math.max(0, Math.round(Number(target?.copyOnWriteRefCount) || 0)) > 0;
    }
,

    needsCopyOnWriteDetach(target) {
      return Boolean(this.isCopyOnWriteRasterTarget(target) || this.hasCopyOnWriteDependents(target));
    }
,

    getCopyOnWriteSourceTarget(target) {
      let source = target;

      while (source?.copyOnWrite === true && source.copyOnWriteSource) {
        source = source.copyOnWriteSource;
      }

      return source || target;
    }
,

    addCopyOnWriteReference(sourceTarget) {
      const source = this.getCopyOnWriteSourceTarget(sourceTarget);

      if (!source) {
        return null;
      }

      source.copyOnWriteRefCount = Math.max(0, Math.round(Number(source.copyOnWriteRefCount) || 0)) + 1;

      return source;
    }
,

    releaseCopyOnWriteReference(target) {
      if (!this.isCopyOnWriteRasterTarget(target)) {
        return;
      }

      const source = target.copyOnWriteSource;

      target.copyOnWrite = false;
      target.copyOnWriteSource = null;
      target.copyOnWriteSourceLayerId = "";
      target.framebuffer = null;
      target.texture = null;
      target.tiles = new Map();
      target.state = "DELETED";

      if (!source) {
        return;
      }

      source.copyOnWriteRefCount = Math.max(0, Math.round(Number(source.copyOnWriteRefCount) || 0) - 1);

      if (source.copyOnWriteRefCount === 0 && source.copyOnWriteDeleted === true) {
        source.copyOnWriteDeleted = false;
        this.deleteRasterTargetObject(source);
      }
    }
,

    createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      if (!sourceLayerId || !destinationLayerId) {
        return null;
      }

      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);
      const source = this.addCopyOnWriteReference(sourceTarget);

      if (!source) {
        return null;
      }

      const sourceRect = this.getRasterTargetDocumentRect(source);
      const target = {
        clearColor: Array.isArray(source.clearColor) ? [...source.clearColor] : [0, 0, 0, 0],
        copyOnWrite: true,
        copyOnWriteSource: source,
        copyOnWriteSourceLayerId: sourceLayerId,
        cropped: source.cropped === true,
        framebuffer: this.isSparseRasterTarget(source) ? null : source.framebuffer,
        height: Math.max(1, Math.round(source.height || sourceRect?.height || this.height || 1)),
        id: `raster-cow-target-${this.rasterTargetIdSequence++}`,
        layerId: destinationLayerId,
        materializedFromSparse: source.materializedFromSparse === true,
        sparse: source.sparse === true,
        sparseTileSize: source.sparseTileSize || source.tileSize,
        texture: this.isSparseRasterTarget(source) ? null : source.texture,
        tileSize: source.tileSize,
        tiles: this.isSparseRasterTarget(source) ? source.tiles : new Map(),
        version: source.version || 0,
        width: Math.max(1, Math.round(source.width || sourceRect?.width || this.width || 1)),
        x: Number.isFinite(source.x) ? Math.round(source.x) : sourceRect?.x || 0,
        y: Number.isFinite(source.y) ? Math.round(source.y) : sourceRect?.y || 0,
      };

      target.copyOnWriteReason = options.source || "copy-on-write-duplicate";

      return target;
    }
,

    cloneRasterTargetForCopyOnWrite(sourceTarget, destinationLayerId, options = {}) {
      const source = this.getCopyOnWriteSourceTarget(sourceTarget);
      const reason = options.source || "copy-on-write-detach";

      if (!source || !destinationLayerId) {
        return null;
      }

      if (this.isSparseRasterTarget(source)) {
        const destinationTarget = this.createSparseRasterTarget(destinationLayerId, {
          clearColor: source.clearColor,
          tileSize: source.tileSize,
        });
        let copiedCount = 0;

        for (const sourceTile of source.tiles.values()) {
          if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
            kind: "paintTile",
            label: `${destinationLayerId} COW tile ${sourceTile.tx},${sourceTile.ty}`,
            layerId: destinationLayerId,
            ownerId: `${destinationLayerId}:${sourceTile.tx}:${sourceTile.ty}`,
            ownerType: "live",
            reason,
          })) {
            this.deleteRasterTargetObject(destinationTarget);
            return null;
          }

          const tileRect = this.getRasterTargetDocumentRect(sourceTile);
          const destinationTile = this.ensureSparseRasterTileTarget(destinationLayerId, destinationTarget, {
            tileRect,
            tx: sourceTile.tx,
            ty: sourceTile.ty,
          }, {
            source: reason,
          });

          if (!destinationTile || !this.copyRasterTargetRectToTarget(sourceTile, tileRect, destinationTile)) {
            this.deleteRasterTargetObject(destinationTarget);
            return null;
          }

          copiedCount += 1;
        }

        if (copiedCount === 0 && source.tiles.size > 0) {
          this.deleteRasterTargetObject(destinationTarget);
          return null;
        }

        destinationTarget.layerId = destinationLayerId;
        destinationTarget.version = (source.version || 0) + 1;
        return destinationTarget;
      }

      if ((!source.texture || !source.framebuffer) && !this.hydrateRasterTarget(source, {
        kind: "layer",
        label: destinationLayerId,
        layerId: destinationLayerId,
        ownerId: destinationLayerId,
        ownerType: "live",
        reason,
      })) {
        return null;
      }

      const sourceRect = this.getRasterTargetDocumentRect(source);
      const clearColor = Array.isArray(source.clearColor) ? [...source.clearColor] : [0, 0, 0, 0];
      const destinationTarget = this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRasterTarget(source),
        height: sourceRect.height,
        layerId: destinationLayerId,
        reason,
        width: sourceRect.width,
        x: sourceRect.x,
        y: sourceRect.y,
      });

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        return null;
      }

      if (!this.copyRasterTargetRectToTarget(source, sourceRect, destinationTarget)) {
        this.deleteRasterTargetObject(destinationTarget);
        return null;
      }

      destinationTarget.layerId = destinationLayerId;
      destinationTarget.materializedFromSparse = source.materializedFromSparse === true;
      destinationTarget.sparseTileSize = source.sparseTileSize || source.tileSize;

      return destinationTarget;
    }
,

    installRasterTargetForLayer(layerId, nextTarget, options = {}) {
      if (!layerId || !nextTarget) {
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);

      nextTarget.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, nextTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = this.isSparseRasterTarget(nextTarget) ? null : nextTarget.texture;
        this.framebuffer = this.isSparseRasterTarget(nextTarget) ? null : nextTarget.framebuffer;
      }

      if (!this.isSparseRasterTarget(nextTarget) && !this.isCopyOnWriteRasterTarget(nextTarget)) {
        const nextKind =
          layerId === "background"
            ? "background"
            : this.isPaintRasterLayer(layerId, nextTarget)
              ? "paintTarget"
              : "layer";

        this.updateRasterTargetResourceMetadata(nextTarget, {
          kind: nextKind,
          label: options.label || layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.source || "install-raster-target",
        });
      }

      if (previousTarget && previousTarget !== nextTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);

      if (options.invalidate !== false || options.emit !== false) {
        this.commitVisualDirtyChange({
          emit: options.emit,
          invalidate: options.invalidate,
          layerId,
          rect: this.getRasterTargetDocumentRect(nextTarget),
          source: options.source || "install-raster-target",
          usePreviewDirtyTiles: true,
        });
      }

      return true;
    }
,

    ensureWritableRasterTarget(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return null;
      }

      if (target.state === "CPU_COLD" && (!target.texture || !target.framebuffer)) {
        this.hydrateRasterTarget(target, {
          kind: this.isSparseRasterTarget(target) ? "paintTile" : "layer",
          label: options.label || layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.source || "ensure-writable-raster-target-hydrate",
        });
      }

      if (!this.needsCopyOnWriteDetach(target)) {
        return target || null;
      }

      const nextTarget = this.cloneRasterTargetForCopyOnWrite(target, layerId, {
        source: options.source || "copy-on-write-detach",
      });

      if (!nextTarget) {
        return target;
      }

      if (!this.installRasterTargetForLayer(layerId, nextTarget, {
        emit: false,
        invalidate: false,
        label: options.label || layerId,
        source: options.source || "copy-on-write-detach",
      })) {
        this.deleteRasterTargetObject(nextTarget);
        return target;
      }

      return nextTarget;
    }
,

    createSparseRasterTarget(layerId, options = {}) {
      const tileSize = this.getRasterHistoryTileSize({
        tileSize: options.tileSize || options.liveTileSize,
      });

      return {
        clearColor: Array.isArray(options.clearColor) ? [...options.clearColor] : [0, 0, 0, 0],
        cropped: false,
        framebuffer: null,
        height: Math.max(1, Math.round(this.height || 1)),
        id: `sparse-raster-target-${this.rasterTargetIdSequence++}`,
        layerId,
        sparse: true,
        texture: null,
        tileSize,
        tiles: new Map(),
        version: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };
    }
,

    getSparseTileKey(tx, ty) {
      return `${Math.round(Number(tx) || 0)}:${Math.round(Number(ty) || 0)}`;
    }
,

    getSparseRasterTileRects(rect, options = {}) {
      return this.getRasterHistoryTileRects(rect, {
        clampToDocument: options.clampToDocument,
        patchRects: options.patchRects,
        tileSize: options.tileSize || options.liveTileSize,
        tilePatchRects: options.tilePatchRects,
      });
    }
,

    getSparseRasterTile(target, tx, ty) {
      return this.isSparseRasterTarget(target)
        ? target.tiles.get(this.getSparseTileKey(tx, ty)) || null
        : null;
    }
,

    ensureSparseRasterTileTarget(layerId, sparseTarget, tile, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !tile?.tileRect) {
        return null;
      }

      const key = this.getSparseTileKey(tile.tx, tile.ty);
      const existingTile = sparseTarget.tiles.get(key);

      if (existingTile?.framebuffer && existingTile?.texture) {
        return existingTile;
      }

      if (existingTile?.state === "CPU_COLD" && this.hydrateRasterTarget(existingTile, {
        kind: options.kind || existingTile.kind || "paintTile",
        label: options.label || `${layerId} tile ${tile.tx},${tile.ty}`,
        layerId,
        ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.source || "sparse-tile-hydrate",
      })) {
        return existingTile;
      }

      const clearColor = Array.isArray(sparseTarget.clearColor)
        ? [...sparseTarget.clearColor]
        : [0, 0, 0, 0];
      const tileRect = tile.tileRect || tile.rect;
      const tileTarget = this.createRasterTarget(clearColor, {
        cropped: true,
        height: tileRect.height,
        kind: "paintTile",
        label: `${layerId} tile ${tile.tx},${tile.ty}`,
        layerId,
        ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.source || "create-sparse-raster-tile",
        width: tileRect.width,
        x: tileRect.x,
        y: tileRect.y,
      });

      tileTarget.layerId = layerId;
      tileTarget.parentTargetId = sparseTarget.id;
      tileTarget.tileKey = key;
      tileTarget.tx = tile.tx;
      tileTarget.ty = tile.ty;
      sparseTarget.tiles.set(key, tileTarget);

      return tileTarget;
    }
,

    ensureSparseRasterTargetForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return null;
      }

      let sparseTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (!this.isSparseRasterTarget(sparseTarget)) {
        if (sparseTarget?.framebuffer || sparseTarget?.texture) {
          return null;
        }

        sparseTarget = this.createSparseRasterTarget(layerId, options);
        this.rasterTargetsByLayerId.set(layerId, sparseTarget);
      }

      const tileTargets = [];
      const maxNewTiles = Number.isFinite(Number(options.maxNewTiles))
        ? Math.max(0, Math.round(Number(options.maxNewTiles)))
        : Infinity;
      let newTileCount = 0;

      for (const tile of this.getSparseRasterTileRects(requiredRect, {
        patchRects: options.patchRects,
        tileSize: sparseTarget.tileSize,
        tilePatchRects: options.tilePatchRects,
      })) {
        const key = this.getSparseTileKey(tile.tx, tile.ty);
        const hadTile = sparseTarget.tiles.has(key);

        if (!hadTile && newTileCount >= maxNewTiles) {
          continue;
        }

        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, options);

        if (tileTarget) {
          if (!hadTile && this.isTransparentRasterClearColor(sparseTarget.clearColor)) {
            tileTarget.freshEmptyPaintTile = true;
          }

          if (!hadTile) {
            newTileCount += 1;
          }

          tileTargets.push({
            patchRect: tile.patchRect ? { ...tile.patchRect } : { ...tile.rect },
            rect: tile.rect ? { ...tile.rect } : { ...tile.patchRect },
            target: tileTarget,
            tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
            tx: tile.tx,
            ty: tile.ty,
          });
        }
      }

      if (tileTargets.length === 0) {
        return null;
      }

      sparseTarget.layerId = layerId;
      sparseTarget.version = (sparseTarget.version || 0) + 1;

      return {
        layerId,
        sparseTarget,
        targets: tileTargets,
      };
    }
,

    dehydrateRasterTarget(target, options = {}) {
      if (!target) {
        return false;
      }

      if (this.needsCopyOnWriteDetach(target)) {
        return false;
      }

      if (this.isSparseRasterTarget(target)) {
        let didCool = false;
        let totalCpuBytes = 0;
        let totalRawBytes = 0;

        target.tiles.forEach((tile) => {
          didCool = this.dehydrateRasterTarget(tile, options) || didCool;
          totalCpuBytes += Math.max(0, Math.round(Number(tile.cpuBytes) || Number(tile.cpuPixels?.byteLength) || 0));
          totalRawBytes += Math.max(0, Math.round(Number(tile.cpuRawBytes) || Number(tile.cpuBytes) || Number(tile.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(tile)));
        });
        target.state = "CPU_COLD";
        target.cpuBytes = totalCpuBytes;
        target.cpuRawBytes = totalRawBytes;

        return didCool || target.tiles.size === 0;
      }

      if (target.state === "CPU_COLD") {
        return true;
      }

      if (!target.framebuffer || !target.texture) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const pixels = new Uint8Array(width * height * RASTER_BYTES_PER_PIXEL);
      const gl = this.gl;

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer?.(gl.FRAMEBUFFER, null);
        console.warn?.("[CBO renderer] Impossibile raffreddare target raster.", error);
        return false;
      }

      this.deleteRasterFramebuffer?.(target.framebuffer || target.framebufferResourceId);
      gl.deleteFramebuffer?.(target.framebuffer);
      target.framebuffer = null;
      target.framebufferResourceId = "";

      this.deleteRasterTexture?.(target.texture || target.textureResourceId);
      gl.deleteTexture?.(target.texture);
      target.texture = null;
      target.textureResourceId = "";

      const rawByteLength = pixels.byteLength;

      target.cpuBytes = rawByteLength;
      target.cpuPixels = pixels;
      target.cpuPixelsEncoding = null;
      target.cpuRawBytes = rawByteLength;
      target.historyCompressionState = "raw-pending";
      target.state = "CPU_COLD";
      target.reason = options.reason || target.reason || "raster-target-cpu-cold";
      window.CBO?.queueHistoryCompression?.(target, {
        historyId: target.id || target.layerId || "",
        kind: target.kind || "rasterTarget",
        layerId: target.layerId || options.layerId || "",
        source: options.source || target.reason,
      });

      return true;
    }
,

    hydrateRasterTarget(target, options = {}) {
      if (!target) {
        return false;
      }

      if (this.isSparseRasterTarget(target)) {
        let didHydrate = target.tiles.size === 0;
        const layerId = options.layerId || target.layerId || "";

        target.tiles.forEach((tile) => {
          const tileOwnerId = layerId
            ? `${layerId}:${tile.tx}:${tile.ty}`
            : options.ownerId || tile.ownerId || tile.id || "";

          didHydrate = this.hydrateRasterTarget(tile, {
            ...options,
            kind: options.kind || tile.kind || "paintTile",
            label: options.label || `${layerId} tile ${tile.tx},${tile.ty}`,
            layerId,
            ownerId: tileOwnerId,
          }) || didHydrate;
        });
        target.state = "GPU_HOT";
        target.cpuBytes = 0;
        target.cpuRawBytes = 0;

        return didHydrate;
      }

      if (target.texture && target.framebuffer) {
        return true;
      }

      if (!(target.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const compression = window.CBO?.HistoryCompression;
      let uploadPixels = target.cpuPixels;

      if (target.cpuPixelsEncoding) {
        if (!compression?.isCompressedEncoding?.(target.cpuPixelsEncoding)) {
          return false;
        }

        try {
          uploadPixels = compression.decompressRgba(
            target.cpuPixels,
            Number(target.cpuRawBytes) || width * height * RASTER_BYTES_PER_PIXEL,
            target.cpuPixelsEncoding,
          );
        } catch (error) {
          console.warn?.("[CBO renderer] Decompressione RLE target raster fallita.", error);
          return false;
        }
      }

      const nextTarget = this.createRasterTarget(target.clearColor || [0, 0, 0, 0], {
        cropped: target.cropped === true,
        height,
        kind: options.kind || "layer",
        label: options.label || target.layerId || target.id || "raster target",
        layerId: options.layerId || target.layerId || "",
        ownerId: options.ownerId || options.layerId || target.layerId || target.id || "",
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.reason || "raster-target-hydrate",
        width,
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
      });
      const gl = this.gl;

      try {
        gl.bindTexture(gl.TEXTURE_2D, nextTarget.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);
        gl.bindTexture(gl.TEXTURE_2D, null);
      } catch (error) {
        gl.bindTexture?.(gl.TEXTURE_2D, null);
        this.deleteRasterTargetObject(nextTarget);
        console.warn?.("[CBO renderer] Impossibile riattivare target raster.", error);
        return false;
      }

      this.markRasterTargetDirty(nextTarget);
      Object.assign(target, nextTarget, {
        cpuBytes: 0,
        cpuPixels: null,
        cpuPixelsEncoding: null,
        cpuRawBytes: 0,
        state: "GPU_HOT",
      });

      return true;
    }
,

    isTransparentRasterClearColor(clearColor) {
      const color = Array.isArray(clearColor) ? clearColor : [0, 0, 0, 0];
      const alpha = Number(color[3]);

      return !Number.isFinite(alpha) || alpha <= 0;
    }
,

    getPreviewCacheMaxSize(options = {}) {
      const fallback = getDefaultPreviewCacheMaxSize();
      let requested = Number(options.previewCacheMaxSize);

      if (
        (!Number.isFinite(requested) || requested <= 0) &&
        options.androidZoomOutPreviewCache === true
      ) {
        requested = Number(namespace.androidZoomOutPreviewCacheMaxSize);
      }

      if (!Number.isFinite(requested) || requested <= 0) {
        requested = Number(this.options?.previewCacheMaxSize);
      }

      return Math.max(1, Math.floor(Number.isFinite(requested) && requested > 0 ? requested : fallback));
    }
,

    getPreviewCacheOverscanCssPx() {
      const fallback = getDefaultPreviewCacheOverscanCssPx();
      const requested = Number(this.options?.previewCacheOverscanCssPx ?? fallback);

      return Math.max(0, Math.floor(Number.isFinite(requested) && requested >= 0 ? requested : fallback));
    }
,

    getViewportRenderOverscanCssPx(options = {}) {
      if (Number.isFinite(Number(options.viewportRenderOverscanCssPx))) {
        return Math.max(0, Number(options.viewportRenderOverscanCssPx));
      }

      return getDefaultViewportRenderOverscanCssPx();
    }
,

    createRasterOperationMemoryReport(options = {}) {
      const beforeBytes = this.getRasterRectBytes(options.beforeRect) ||
        this.estimateRasterSnapshotBytes(options.beforeSnapshot);
      const afterBytes = this.getRasterRectBytes(options.afterRect) ||
        this.estimateRasterSnapshotBytes(options.afterSnapshot);
      const sourceBytes = Number.isFinite(Number(options.sourceBytes))
        ? Math.max(0, Math.round(Number(options.sourceBytes)))
        : this.getRasterRectBytes(options.sourceRect);
      const targetBytes = Number.isFinite(Number(options.targetBytes))
        ? Math.max(0, Math.round(Number(options.targetBytes)))
        : this.getRasterRectBytes(options.targetRect);
      const scratchBytes = Number.isFinite(Number(options.scratchBytes))
        ? Math.max(0, Math.round(Number(options.scratchBytes)))
        : 0;
      const historyBytes = beforeBytes + afterBytes;
      const persistentBytes = Number.isFinite(Number(options.persistentBytes))
        ? Math.max(0, Math.round(Number(options.persistentBytes)))
        : historyBytes;
      const estimatedPeakBytes = Number.isFinite(Number(options.estimatedPeakBytes))
        ? Math.max(0, Math.round(Number(options.estimatedPeakBytes)))
        : sourceBytes + targetBytes + scratchBytes + historyBytes;
      const coverage = Number.isFinite(Number(options.coverage))
        ? Math.min(1, Math.max(0, Number(options.coverage)))
        : this.getRasterOperationCoverage(options.targetRect || options.afterSnapshot?.rect || options.beforeSnapshot?.rect);

      return {
        afterBytes,
        beforeBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes,
        historyBytes,
        layerId: options.layerId || "",
        mode: options.mode || options.transformMode || "",
        operationType: options.operationType || "raster-operation",
        persistentBytes,
        policy: this.classifyRasterOperationMemory(estimatedPeakBytes, coverage),
        reason: options.reason || options.source || "",
        scratchBytes,
        source: options.source || "",
        sourceBytes,
        sourceRect: options.sourceRect || null,
        targetBytes,
        targetRect: options.targetRect || null,
        tool: options.tool || options.operationType || "raster-operation",
      };
    }
,

    configureDocumentSize(viewportWidth, viewportHeight) {
      const gl = this.gl;
      const policyCap = this.isMobileLikeDevice() ? 2048 : 4096;
      const hardwareCap = gl.getParameter(gl.MAX_TEXTURE_SIZE) || policyCap;
      const fixedWidth = this.options.documentWidth;
      const fixedHeight = this.options.documentHeight;

      if (fixedWidth && fixedHeight) {
        const cap = Math.max(1, hardwareCap);

        this.width = Math.max(1, Math.min(fixedWidth, cap));
        this.height = Math.max(1, Math.min(fixedHeight, cap));
        return;
      }

      const optionCap = this.options.documentSizeCap;
      const effectiveCap = optionCap ? Math.min(policyCap, optionCap) : policyCap;
      const cap = Math.max(1, Math.min(effectiveCap, hardwareCap));
      const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
      const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
      const aspect = safeViewportWidth / safeViewportHeight;

      if (aspect >= 1) {
        this.width = cap;
        this.height = Math.max(1, Math.round(cap / aspect));
      } else {
        this.height = cap;
        this.width = Math.max(1, Math.round(cap * aspect));
      }
    }
,

    isMobileLikeDevice() {
      return isMobileLikeEnvironment();
    }
,

    createProceduralBackgroundTarget() {
      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture procedurale per lo sfondo.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([247, 247, 242, 255]),
      );
      gl.bindTexture(gl.TEXTURE_2D, null);

      const target = {
        id: "background-procedural-target",
        framebuffer: null,
        texture,
        width: this.width,
        height: this.height,
        x: 0,
        y: 0,
        cropped: false,
        resourceHeight: 1,
        resourceWidth: 1,
        version: 0,
        clearColor: [247 / 255, 247 / 255, 242 / 255, 1],
        layerId: "background",
        procedural: true,
      };

      const textureRow = this.registerRasterTexture(texture, {
        bbox: {
          x: 0,
          y: 0,
          width: this.width,
          height: this.height,
        },
        height: 1,
        kind: "background",
        label: "procedural background texture",
        layerId: "background",
        ownerId: "background",
        ownerType: "live",
        purgeable: false,
        reason: "create-procedural-background-target",
        width: 1,
      });

      target.textureResourceId = textureRow?.id || "";

      return target;
    }
,

    createBaseLayerTarget() {
      const backgroundTarget = this.createProceduralBackgroundTarget();

      this.rasterTargetsByLayerId.set("background", backgroundTarget);
      this.paintLayerId = this.resolvePaintLayerId();
      this.texture = null;
      this.framebuffer = null;

      backgroundTarget.layerId = "background";
    }
,

    createRasterTarget(clearColor = [0, 0, 0, 0], options = {}) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetWidth = Math.max(1, Math.round(options.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(options.height || this.height || 1));
      const targetX = Number.isFinite(options.x) ? Math.round(options.x) : 0;
      const targetY = Number.isFinite(options.y) ? Math.round(options.y) : 0;
      const cropped = options.cropped === true ||
        targetX !== 0 ||
        targetY !== 0 ||
        targetWidth !== this.width ||
        targetHeight !== this.height;

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error("Impossibile creare il documento FBO in VRAM.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Sampling lineare: la vista resta morbida durante zoom out e zoom intermedi.
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
        throw new Error("Documento FBO incompleto: impossibile inizializzare la tela.");
      }

      const target = {
        id: `raster-target-${this.rasterTargetIdSequence++}`,
        framebuffer,
        texture,
        width: targetWidth,
        height: targetHeight,
        x: targetX,
        y: targetY,
        cropped,
        version: 0,
        clearColor,
      };

      this.registerRasterTargetResources(target, {
        kind: options.kind || options.resourceMetadata?.kind || "layer",
        label: options.label || options.resourceMetadata?.label || "raster target",
        layerId: options.layerId || options.resourceMetadata?.layerId || "",
        ownerId: options.ownerId || options.layerId || options.resourceMetadata?.ownerId || target.id,
        ownerType: options.ownerType || options.resourceMetadata?.ownerType || "live",
        purgeable: options.purgeable === true || options.resourceMetadata?.purgeable === true,
        reason: options.reason || options.source || options.resourceMetadata?.reason || "create-raster-target",
      });

      this.clearTarget(target);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return target;
    }
,

    createPaintTarget(layerId = "", options = {}) {
      const targetLayerId = layerId || options.layerId || options.resourceMetadata?.layerId || "";

      return this.createRasterTarget([0, 0, 0, 0], {
        ...options,
        layerId: targetLayerId,
        ownerId: options.ownerId || targetLayerId || options.resourceMetadata?.ownerId,
        reason: options.reason || options.source || "create-paint-target",
      });
    }
,

    createRasterTargetForRect(rect, clearColor = [0, 0, 0, 0], padding = 0) {
      const targetRect = this.getClampedDocumentRect(rect, padding);

      if (!targetRect) {
        return null;
      }

      return this.createRasterTarget(clearColor, {
        cropped: true,
        height: targetRect.height,
        width: targetRect.width,
        x: targetRect.x,
        y: targetRect.y,
      });
    }
,

    createRasterTargetForUnclampedRect(rect, clearColor = [0, 0, 0, 0], padding = 0, options = {}) {
      const targetRect = this.getUnclampedDocumentRect(rect, padding);

      if (!targetRect) {
        return null;
      }

      return this.createRasterTarget(clearColor, {
        cropped: true,
        height: targetRect.height,
        layerId: options.layerId,
        reason: options.source || "create-raster-target-for-unclamped-rect",
        width: targetRect.width,
        x: targetRect.x,
        y: targetRect.y,
      });
    }
,

    resolvePaintLayerId() {
      const activeLayer = this.layerModel?.findEntryById?.(this.layerModel.activeLayerId);

      if (activeLayer?.type === "paint") {
        return activeLayer.id;
      }

      const renderablePaintLayer = this.layerModel
        ?.flattenTopToBottom?.()
        .find((layer) => layer.type === "paint");

      return renderablePaintLayer?.id || "paint-main";
    }
,

    getClampedDocumentRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const documentRect = this.getDocumentBoundsRect();
      const pad = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
      const minX = Math.max(documentRect.x, Math.floor(rawX - pad));
      const minY = Math.max(documentRect.y, Math.floor(rawY - pad));
      const maxX = Math.min(documentRect.x + documentRect.width, Math.ceil(rawX + rawWidth + pad));
      const maxY = Math.min(documentRect.y + documentRect.height, Math.ceil(rawY + rawHeight + pad));

      if (maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
,

    getUnclampedDocumentRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const pad = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
      const minX = Math.floor(rawX - pad);
      const minY = Math.floor(rawY - pad);
      const maxX = Math.ceil(rawX + rawWidth + pad);
      const maxY = Math.ceil(rawY + rawHeight + pad);

      if (maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
,

    getRasterTargetDocumentRect(target) {
      if (!target) {
        return null;
      }

      if (this.isSparseRasterTarget(target)) {
        let rect = null;

        target.tiles.forEach((tile) => {
          const tileRect = this.getRasterTargetDocumentRect(tile);

          rect = rect ? this.unionRasterHistoryRects(rect, tileRect) : tileRect;
        });

        return rect || {
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(this.width || 1)),
          height: Math.max(1, Math.round(this.height || 1)),
        };
      }

      return {
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
        width: Math.max(1, Math.round(target.width || this.width || 1)),
        height: Math.max(1, Math.round(target.height || this.height || 1)),
      };
    }
,

    translateRasterTargetRect(target, dx = 0, dy = 0) {
      if (!target || this.isSparseRasterTarget(target)) {
        return false;
      }

      const currentRect = this.getRasterTargetDocumentRect(target);

      if (!currentRect) {
        return false;
      }

      target.x = currentRect.x + dx;
      target.y = currentRect.y + dy;
      target.cropped = true;
      this.markRasterTargetDirty(target);

      return true;
    }
,

    copyRasterTargetDocumentRectToDocumentRect(sourceTarget, sourceDocRect, destinationTarget, destinationDocRect) {
      const mapLocalRect = (target, docRect) => {
        const targetRect = this.getRasterTargetDocumentRect(target);
        const clippedDocRect = this.intersectRasterHistoryRects(docRect, targetRect);

        return clippedDocRect && targetRect
          ? {
              height: clippedDocRect.height,
              width: clippedDocRect.width,
              x: clippedDocRect.x - targetRect.x,
              y: clippedDocRect.y - targetRect.y,
            }
          : null;
      };
      const sourceRect = mapLocalRect(sourceTarget, sourceDocRect);
      const destinationRect = mapLocalRect(destinationTarget, destinationDocRect);

      if (
        !sourceTarget?.framebuffer ||
        !destinationTarget?.framebuffer ||
        !sourceRect ||
        !destinationRect ||
        sourceRect.width !== destinationRect.width ||
        sourceRect.height !== destinationRect.height
      ) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;
      const destinationX0 = destinationRect.x;
      const destinationX1 = destinationRect.x + destinationRect.width;
      const destinationY0 = destinationTarget.height - (destinationRect.y + destinationRect.height);
      const destinationY1 = destinationTarget.height - destinationRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        destinationX0,
        destinationY0,
        destinationX1,
        destinationY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }
,

    translateSparseRasterTarget(layerId, sparseTarget, dx = 0, dy = 0, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return false;
      }

      if (sparseTarget.tiles.size === 0) {
        sparseTarget.version = (sparseTarget.version || 0) + 1;
        return true;
      }

      const tileSize = this.getRasterHistoryTileSize({ tileSize: sparseTarget.tileSize });
      const nextSparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: sparseTarget.clearColor,
        tileSize,
      });
      const source = options.source || "translate-sparse-raster-target";
      let copiedCount = 0;

      for (const sourceTile of sparseTarget.tiles.values()) {
        if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
          kind: "paintTile",
          label: `${layerId} tile ${sourceTile.tx},${sourceTile.ty}`,
          layerId,
          ownerId: `${layerId}:${sourceTile.tx}:${sourceTile.ty}`,
          ownerType: "live",
          reason: source,
        })) {
          this.deleteRasterTargetObject(nextSparseTarget);
          return false;
        }

        const sourceTileRect = this.getRasterTargetDocumentRect(sourceTile);
        const shiftedTileRect = this.offsetDocumentRect(sourceTileRect, dx, dy);

        if (!sourceTileRect || !shiftedTileRect) {
          continue;
        }

      for (const tile of this.getSparseRasterTileRects(shiftedTileRect, {
        clampToDocument: false,
        tileSize,
      })) {
          const destinationPatchRect = this.intersectRasterHistoryRects(shiftedTileRect, tile.tileRect || tile.rect);
          const sourcePatchRect = destinationPatchRect
            ? {
                height: destinationPatchRect.height,
                width: destinationPatchRect.width,
                x: destinationPatchRect.x - dx,
                y: destinationPatchRect.y - dy,
              }
            : null;

          if (!destinationPatchRect || !sourcePatchRect) {
            continue;
          }

          const destinationTile = this.ensureSparseRasterTileTarget(layerId, nextSparseTarget, tile, { source });

          if (
            !destinationTile ||
            !this.copyRasterTargetDocumentRectToDocumentRect(
              sourceTile,
              sourcePatchRect,
              destinationTile,
              destinationPatchRect,
            )
          ) {
            this.deleteRasterTargetObject(nextSparseTarget);
            return false;
          }

          copiedCount += 1;
        }
      }

      if (copiedCount === 0 && sparseTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(nextSparseTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);

      nextSparseTarget.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, nextSparseTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.paintLayerId = layerId;
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== nextSparseTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      nextSparseTarget.version = (nextSparseTarget.version || 0) + 1;

      return true;
    }
,

    translateRasterTargetPlacement(layerId, dx = 0, dy = 0, options = {}) {
      const normalizedLayerId = String(layerId || "").trim();
      const deltaX = Number(dx);
      const deltaY = Number(dy);
      const safeDx = Number.isFinite(deltaX) ? Math.round(deltaX) : 0;
      const safeDy = Number.isFinite(deltaY) ? Math.round(deltaY) : 0;

      if (!normalizedLayerId || (safeDx === 0 && safeDy === 0)) {
        return false;
      }

      const source = options.source || "translate-raster-target";
      const target = this.ensureWritableRasterTarget(normalizedLayerId, {
        source,
      }) || this.rasterTargetsByLayerId.get(normalizedLayerId);

      if (!target) {
        return false;
      }

      const didTranslate = this.isSparseRasterTarget(target)
        ? this.translateSparseRasterTarget(normalizedLayerId, target, safeDx, safeDy, { source })
        : this.translateRasterTargetRect(target, safeDx, safeDy);

      if (!didTranslate) {
        return false;
      }

      if (!this.isSparseRasterTarget(this.rasterTargetsByLayerId.get(normalizedLayerId))) {
        this.updateRasterTargetResourceMetadata(target, {
          kind: normalizedLayerId === "background" ? "background" : this.isPaintRasterLayer(normalizedLayerId, target) ? "paintTarget" : "layer",
          label: normalizedLayerId,
          layerId: normalizedLayerId,
          ownerId: normalizedLayerId,
          ownerType: "live",
          purgeable: false,
          reason: source,
        });
      }

      this.deletePuppetMeshResource(normalizedLayerId);
      return true;
    }
,

    translateRasterTargetsByLayerIds(layerIds = [], dx = 0, dy = 0, options = {}) {
      const ids = Array.from(new Set((Array.isArray(layerIds) ? layerIds : [])
        .map((layerId) => String(layerId || "").trim())
        .filter(Boolean)));
      let didTranslate = false;

      ids.forEach((layerId) => {
        didTranslate = this.translateRasterTargetPlacement(layerId, dx, dy, options) || didTranslate;
      });

      return didTranslate;
    }
,

    isCroppedRasterTarget(target) {
      const rect = this.getRasterTargetDocumentRect(target);

      return Boolean(
        target &&
        rect &&
        (
          target.cropped === true ||
          rect.x !== 0 ||
          rect.y !== 0 ||
          rect.width !== this.width ||
          rect.height !== this.height
        )
      );
    }
,

    isCroppedRect(rect) {
      return Boolean(
        rect &&
        (
          rect.x !== 0 ||
          rect.y !== 0 ||
          rect.width !== this.width ||
          rect.height !== this.height
        )
      );
    }
,

    areDocumentRectsEqual(a, b) {
      return Boolean(
        a &&
        b &&
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height
      );
    }
,

    getRasterTargetLocalRect(target, docRect = null) {
      const targetRect = this.getRasterTargetDocumentRect(target);
      const requested = docRect
        ? this.getUnclampedDocumentRect(docRect)
        : targetRect;

      if (!targetRect || !requested) {
        return null;
      }

      const x0 = Math.max(targetRect.x, requested.x);
      const y0 = Math.max(targetRect.y, requested.y);
      const x1 = Math.min(targetRect.x + targetRect.width, requested.x + requested.width);
      const y1 = Math.min(targetRect.y + targetRect.height, requested.y + requested.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        docRect: {
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
        },
        localRect: {
          x: x0 - targetRect.x,
          y: y0 - targetRect.y,
          width: x1 - x0,
          height: y1 - y0,
        },
        targetRect,
      };
    }
,

    markRasterTargetDirty(targetOrPaintTarget) {
      const target = targetOrPaintTarget?.target || targetOrPaintTarget;

      if (target) {
        target.version = (target.version || 0) + 1;
        target.freshEmptyPaintTile = false;
      }

      if (targetOrPaintTarget && targetOrPaintTarget !== target) {
        targetOrPaintTarget.version = (targetOrPaintTarget.version || 0) + 1;
      }
    }
,

    clearTarget(target) {
      if (this.isSparseRasterTarget(target)) {
        target.tiles.forEach((tile) => this.deleteRasterTargetObject(tile));
        target.tiles.clear();
        target.cpuBytes = 0;
        target.cpuPixels = null;
        target.cpuPixelsEncoding = null;
        target.cpuRawBytes = 0;
        target.state = "";
        this.markRasterTargetDirty(target);
        return;
      }

      if (!target?.framebuffer) {
        return;
      }

      const gl = this.gl;
      const clearColor = Array.isArray(target.clearColor) ? target.clearColor : [0, 0, 0, 0];

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);
    }
,

    clear() {
      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => this.clearTarget(target));
      this.emitContentChange({ source: "clear-document" });
    }
,

    clearLayer(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "clear-layer-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if (
        options.releaseRaster === true &&
        layerId !== "background" &&
        this.isPaintRasterLayer(layerId, target)
      ) {
        const targetRect = this.getRasterTargetDocumentRect(target);
        const sparseTarget = this.createSparseRasterTarget(layerId, {
          clearColor: target.clearColor,
          tileSize: target.sparseTileSize || target.tileSize,
        });
        const previousTarget = this.rasterTargetsByLayerId.get(layerId);

        this.rasterTargetsByLayerId.set(layerId, sparseTarget);

        if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
          this.paintLayerId = layerId;
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
          rect: targetRect,
          source: options.source || "clear-layer-release-raster",
          usePreviewDirtyTiles: true,
        });
      } else {
        const targetRect = this.getRasterTargetDocumentRect(target);

        this.clearTarget(target);
        if (options.emit !== false) {
          this.commitVisualDirtyChange({
            layerId,
            rect: targetRect,
            source: options.source || "clear-layer",
            usePreviewDirtyTiles: true,
          });
        }
      }

      return true;
    }
,

    isTransparentPixelBuffer(pixels) {
      if (!(pixels instanceof Uint8Array)) {
        return false;
      }

      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) {
          return false;
        }
      }

      return true;
    }
,

    getRasterTargetCpuPixels(target) {
      if (!(target?.cpuPixels instanceof Uint8Array)) {
        return null;
      }

      const compression = window.CBO?.HistoryCompression;

      if (!target.cpuPixelsEncoding) {
        return target.cpuPixels;
      }

      if (!compression?.isCompressedEncoding?.(target.cpuPixelsEncoding)) {
        return null;
      }

      try {
        return compression.decompressRgba(
          target.cpuPixels,
          Number(target.cpuRawBytes) || Math.max(1, Math.round(target.width || 1)) * Math.max(1, Math.round(target.height || 1)) * RASTER_BYTES_PER_PIXEL,
          target.cpuPixelsEncoding,
        );
      } catch (error) {
        console.warn?.("[CBO renderer] Decompressione RLE target raster fallita.", error);
        return null;
      }
    }
,

    isRasterTargetFullyTransparent(target) {
      if (!target) {
        return true;
      }

      if (target.cpuPixels instanceof Uint8Array) {
        const pixels = this.getRasterTargetCpuPixels(target);

        return pixels ? this.isTransparentPixelBuffer(pixels) : false;
      }

      if (!target.framebuffer || !target.texture) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const pixels = new Uint8Array(width * height * RASTER_BYTES_PER_PIXEL);
      const gl = this.gl;
      const framebufferTarget = gl.READ_FRAMEBUFFER || gl.FRAMEBUFFER;

      try {
        gl.bindFramebuffer(framebufferTarget, target.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(framebufferTarget, null);
      } catch (error) {
        gl.bindFramebuffer?.(framebufferTarget, null);
        console.warn?.("[CBO renderer] Impossibile verificare tile raster vuoto.", error);
        return false;
      }

      return this.isTransparentPixelBuffer(pixels);
    }
,

    pruneTransparentSparseRasterTiles(layerId, sparseTarget, tileKeys = []) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return 0;
      }

      let prunedCount = 0;
      const keys = new Set(tileKeys.filter(Boolean));

      keys.forEach((key) => {
        const tileTarget = sparseTarget.tiles.get(key);

        if (!tileTarget || !this.isRasterTargetFullyTransparent(tileTarget)) {
          return;
        }

        this.deleteRasterTargetObject(tileTarget);
        sparseTarget.tiles.delete(key);
        prunedCount += 1;
      });

      if (prunedCount > 0) {
        sparseTarget.version = (sparseTarget.version || 0) + 1;
      }

      return prunedCount;
    }
,

    deleteRasterTargetObject(target) {
      if (!target) {
        return;
      }

      if (this.isCopyOnWriteRasterTarget(target)) {
        this.releaseCopyOnWriteReference(target);
        return;
      }

      if (this.hasCopyOnWriteDependents(target)) {
        target.copyOnWriteDeleted = true;
        target.layerId = "";
        return;
      }

      if (this.isSparseRasterTarget(target)) {
        target.tiles.forEach((tile) => this.deleteRasterTargetObject(tile));
        target.tiles.clear();
        target.cpuBytes = 0;
        target.cpuPixels = null;
        target.cpuPixelsEncoding = null;
        target.cpuRawBytes = 0;
        target.state = "DELETED";
        return;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        this.deleteRasterFramebuffer(target.framebuffer);
        gl.deleteFramebuffer(target.framebuffer);
        target.framebuffer = null;
      }

      if (target.texture) {
        this.deleteRasterTexture(target.texture);
        gl.deleteTexture(target.texture);
        target.texture = null;
      }

      target.framebufferResourceId = "";
      target.textureResourceId = "";
      target.cpuBytes = 0;
      target.cpuPixels = null;
      target.cpuPixelsEncoding = null;
      target.cpuRawBytes = 0;
      target.state = "DELETED";
    }
,

    replaceRasterTarget(layerId, nextTarget, options = {}) {
      if (!layerId || !nextTarget?.framebuffer || !nextTarget?.texture) {
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);
      const nextKind =
        layerId === "background"
          ? "background"
          : this.isPaintRasterLayer(layerId, nextTarget)
            ? "paintTarget"
            : "layer";

      nextTarget.layerId = layerId;
      this.updateRasterTargetResourceMetadata(nextTarget, {
        kind: nextKind,
        label: options.label || layerId,
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: options.source || "replace-raster-target",
      });

      this.rasterTargetsByLayerId.set(layerId, nextTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = nextTarget.texture;
        this.framebuffer = nextTarget.framebuffer;
      }

      if (previousTarget && previousTarget !== nextTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      if (options.invalidate !== false || options.emit !== false) {
        this.commitVisualDirtyChange({
          dirtyMergeWasteRatio: options.dirtyMergeWasteRatio,
          emit: options.emit,
          invalidate: options.invalidate,
          layerId,
          maxDirtyRects: options.maxDirtyRects,
          mergeAdjacentDirtyRects: options.mergeAdjacentDirtyRects,
          preserveDirtyRects: options.preserveDirtyRects,
          rect: options.rect || null,
          rects: options.rects || null,
          source: options.source || "replace-raster-target",
          tileDirty: options.tileDirty,
          usePreviewDirtyTiles: options.usePreviewDirtyTiles,
        });
      }

      return true;
    }
,

    materializeSparseRasterTarget(layerId, sparseTarget, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(sparseTarget);

      if (!targetRect) {
        return null;
      }

      const fullTarget = options.forceDense === true
        ? this.createRasterTarget(sparseTarget.clearColor || [0, 0, 0, 0], {
            cropped: false,
            height: this.height,
            layerId,
            source: options.source || "materialize-sparse-raster-target",
            width: this.width,
            x: 0,
            y: 0,
          })
        : this.createRasterTargetForUnclampedRect(targetRect, sparseTarget.clearColor, 0, {
            layerId,
            source: options.source || "materialize-sparse-raster-target",
          });

      if (!fullTarget) {
        return null;
      }

      fullTarget.materializedFromSparse = true;
      fullTarget.sparseTileSize = sparseTarget.tileSize;

      let didCopyAnyTile = false;

      for (const tile of sparseTarget.tiles.values()) {
        if ((!tile.texture || !tile.framebuffer) && !this.hydrateRasterTarget(tile, {
          kind: "paintTile",
          label: `${layerId} tile ${tile.tx},${tile.ty}`,
          layerId,
          ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
          ownerType: "live",
          reason: options.source || "materialize-sparse-raster-target",
        })) {
          continue;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (tileRect && this.copyRasterTargetRectIntoTarget(tile, tileRect, fullTarget)) {
          didCopyAnyTile = true;
        }
      }

      if (!didCopyAnyTile && sparseTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(fullTarget);
        return null;
      }

      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      if (!this.replaceRasterTarget(layerId, fullTarget, {
        emit: options.emit,
        invalidate: shouldInvalidate,
        source: options.source || "materialize-sparse-raster-target",
      })) {
        this.deleteRasterTargetObject(fullTarget);
        return null;
      }

      return {
        ...fullTarget,
        layerId,
      };
    }
,

    shouldRetileRasterTargetForPaint(layerId, target, options = {}) {
      return Boolean(
        options.sparse !== false &&
        options.retileExistingTarget !== false &&
        target?.framebuffer &&
        target?.texture &&
        !this.isSparseRasterTarget(target) &&
        this.isPaintRasterLayer(layerId, target) &&
        (
          target.materializedFromSparse === true ||
          options.retileMaterializedTarget === true
        )
      );
    }
,

    sparsifyRasterTarget(layerId, target = null, options = {}) {
      const sourceTarget = target || this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !sourceTarget) {
        return null;
      }

      if (this.isSparseRasterTarget(sourceTarget)) {
        return sourceTarget;
      }

      if (!sourceTarget.framebuffer || !sourceTarget.texture) {
        return null;
      }

      const currentTarget = this.rasterTargetsByLayerId.get(layerId);

      if (currentTarget && currentTarget !== sourceTarget) {
        return null;
      }

      const sourceRect = options.clampToDocument === false
        ? this.getUnclampedDocumentRect(options.rect || this.getRasterTargetDocumentRect(sourceTarget))
        : this.getClampedDocumentRect(options.rect || this.getRasterTargetDocumentRect(sourceTarget));

      if (!sourceRect) {
        return null;
      }

      const source = options.source || "sparsify-raster-target";
      const sparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: sourceTarget.clearColor,
        tileSize: options.tileSize || sourceTarget.sparseTileSize || sourceTarget.tileSize,
      });
      let didCopyAnyTile = false;

      for (const tile of this.getSparseRasterTileRects(sourceRect, {
        clampToDocument: options.clampToDocument,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, {
          ownerType: options.ownerType || "live",
          source,
        });
        const patchRect = tile.rect || tile.patchRect;

        if (!tileTarget || !patchRect) {
          this.deleteRasterTargetObject(sparseTarget);
          return null;
        }

        if (!this.copyRasterTargetRectIntoTarget(sourceTarget, patchRect, tileTarget)) {
          this.deleteRasterTargetObject(sparseTarget);
          return null;
        }

        didCopyAnyTile = true;

        if (
          options.pruneTransparentTiles !== false &&
          this.isRasterTargetFullyTransparent(tileTarget)
        ) {
          this.deleteRasterTargetObject(tileTarget);
          sparseTarget.tiles.delete(tileTarget.tileKey || this.getSparseTileKey(tile.tx, tile.ty));
        }
      }

      if (!didCopyAnyTile) {
        this.deleteRasterTargetObject(sparseTarget);
        return null;
      }

      sparseTarget.layerId = layerId;
      sparseTarget.version = (sparseTarget.version || 0) + 1;
      this.rasterTargetsByLayerId.set(layerId, sparseTarget);

      if (layerId === this.paintLayerId || sourceTarget.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      this.deleteRasterTargetObject(sourceTarget);
      this.deletePuppetMeshResource(layerId);
      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      if (shouldInvalidate || options.emit !== false) {
        this.commitVisualDirtyChange({
          emit: options.emit,
          invalidate: shouldInvalidate,
          layerId,
          rect: sourceRect,
          source,
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return sparseTarget;
    }
,

    sparsifyRasterizedImageLayer(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target || this.isSparseRasterTarget(target)) {
        return target || null;
      }

      if (!target.framebuffer || !target.texture || !this.isPaintRasterLayer(layerId, target)) {
        return target;
      }

      return this.sparsifyRasterTarget(layerId, target, {
        clampToDocument: false,
        emit: options.emit === true,
        pruneTransparentTiles: options.pruneTransparentTiles,
        source: options.source || "image-rasterize-retile",
        tileSize: options.tileSize || target.sparseTileSize || target.tileSize,
      }) || target;
    }
,

    materializeRasterTarget(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target?.texture || !target?.framebuffer) {
        if (this.isSparseRasterTarget(target)) {
          return this.materializeSparseRasterTarget(layerId, target, options) || {
            ...target,
            layerId,
          };
        }

        return this.getRasterTarget(layerId);
      }

      if (!this.isCroppedRasterTarget(target)) {
        return {
          ...target,
          layerId,
        };
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const oldBytes = this.estimateRasterTargetBytes(target);
      const newBytes = Math.max(1, Math.round(this.width || 1)) *
        Math.max(1, Math.round(this.height || 1)) *
        4;
      const fullTarget = this.createRasterTarget(target.clearColor || [0, 0, 0, 0], {
        cropped: false,
        height: this.height,
        width: this.width,
        x: 0,
        y: 0,
      });

      if (target.materializedFromSparse === true) {
        fullTarget.materializedFromSparse = true;
        fullTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

      const destQuad = [
        { x: targetRect.x, y: targetRect.y },
        { x: targetRect.x + targetRect.width, y: targetRect.y },
        { x: targetRect.x + targetRect.width, y: targetRect.y + targetRect.height },
        { x: targetRect.x, y: targetRect.y + targetRect.height },
      ];
      const didDraw = this.drawTexturedQuad(target.texture, destQuad, {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: 0,
        framebuffer: fullTarget.framebuffer,
        opacity: 1,
        viewportHeight: fullTarget.height,
        viewportWidth: fullTarget.width,
      });

      if (!didDraw) {
        this.deleteRasterTargetObject(fullTarget);
        return {
          ...target,
          layerId,
        };
      }

      this.markRasterTargetDirty(fullTarget);
      this.getRasterResourceManager()?.recordFullCanvasMaterialization?.({
        bytesAdded: Math.max(0, newBytes - oldBytes),
        layerId,
        newSize: {
          height: this.height,
          width: this.width,
        },
        oldBBox: targetRect,
        reason: options.reason || options.source || "materialize-raster-target",
        stackTag: options.stackTag || "",
        tool: options.tool || options.source || "materializeRasterTarget",
      });
      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      this.replaceRasterTarget(layerId, fullTarget, {
        emit: options.emit,
        invalidate: shouldInvalidate,
        source: options.source || "materialize-raster-target",
      });

      return {
        ...fullTarget,
        layerId,
      };
    }
,

    requestDraw() {
      if (namespace.brushEngine?.requestDraw) {
        namespace.brushEngine.requestDraw();
      } else {
        namespace.brushEngine?.draw?.();
      }
    }
,

    setRasterTransformPreview(preview = null) {
      const transformMode = String(preview?.transformMode || "free").trim().toLowerCase() || "free";
      const warpControlPoints = transformMode === "warp"
        ? this.normalizeRasterWarpControlPoints(preview?.warpControlPoints)
        : null;

      if (!preview?.layerId || !preview?.texture || !Array.isArray(preview.quad) || (transformMode === "warp" && !warpControlPoints)) {
        this.rasterTransformPreview = null;
      } else {
        this.rasterTransformPreview = {
          layerId: preview.layerId,
          edgeFeatherPixels: this.getRasterTransformEdgeFeatherPixels(preview),
          opacity: Number.isFinite(preview.opacity) ? Math.min(1, Math.max(0, preview.opacity)) : 1,
          quad: preview.quad.map((point) => ({
            x: Number.isFinite(point?.x) ? point.x : 0,
            y: Number.isFinite(point?.y) ? point.y : 0,
          })),
          sourceRect: preview.sourceRect ? { ...preview.sourceRect } : null,
          sourceUvRect: this.normalizeTextureSourceUvRect(preview.sourceUvRect),
          texture: preview.texture,
          transformMode,
          warpControlPoints,
        };

        if (preview.liveTexture !== true) {
          this.updateRasterTexture(preview.texture, {
            bbox: preview.sourceRect || null,
            height: preview.sourceRect?.height,
            kind: "transformPreview",
            label: "raster transform preview",
            layerId: preview.layerId,
            ownerId: `transform-preview-${preview.layerId}`,
            ownerType: "scratch",
            purgeable: true,
            reason: "set-raster-transform-preview",
            width: preview.sourceRect?.width,
          });
        }
      }

      this.requestDraw();
    }
,

    clearRasterTransformPreview(layerId = "") {
      if (!this.rasterTransformPreview) {
        return;
      }

      if (!layerId || this.rasterTransformPreview.layerId === layerId) {
        this.rasterTransformPreview = null;
        this.requestDraw();
      }
    }
,

    setVectorTextTransformPreviewLayer(layerId = "") {
      const nextLayerId = String(layerId || "");

      if (this.vectorTextTransformPreviewLayerId === nextLayerId) {
        return;
      }

      this.vectorTextTransformPreviewLayerId = nextLayerId;
      this.invalidatePreviewCache("vector-text-transform-preview");
      this.requestDraw();
    }
,

    clearVectorTextTransformPreviewLayer(layerId = "") {
      const currentLayerId = this.vectorTextTransformPreviewLayerId || "";

      if (!currentLayerId || (layerId && currentLayerId !== layerId)) {
        return;
      }

      this.vectorTextTransformPreviewLayerId = "";
      this.invalidatePreviewCache("vector-text-transform-preview");
      this.requestDraw();
    }
,

    isVectorTextTransformPreviewLayer(layerId = "") {
      return Boolean(layerId && this.vectorTextTransformPreviewLayerId === layerId);
    }
,

    getRasterTargetPixelContentBounds(target, options = {}) {
      if (!target) {
        return null;
      }

      const bounds = namespace.documentBounds;
      const targetWidth = Math.max(1, Math.round(target.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(target.height || this.height || 1));
      const hasGpuPixels = Boolean(target.framebuffer && target.texture);
      const hasCpuPixels = target.cpuPixels instanceof Uint8Array;
      const cpuPixels = hasCpuPixels ? this.getRasterTargetCpuPixels(target) : null;
      const sampleCols = Math.max(16, Math.min(512, Math.floor(options.sampleCols || 256)));
      const sampleRows = Math.max(16, Math.min(512, Math.floor(options.sampleRows || 256)));
      const alphaThreshold = Number.isFinite(options.alphaThreshold)
        ? Math.max(0, Math.min(255, options.alphaThreshold))
        : 2;
      const pixelPerfect = options.pixelPerfect === true;
      let coarseRect = null;

      if (!hasGpuPixels && !cpuPixels) {
        return null;
      }

      if (pixelPerfect) {
        coarseRect = { x: 0, y: 0, width: targetWidth, height: targetHeight };
      } else {
        const samples = this.getPuppetAlphaSamples(target, sampleCols, sampleRows);
        let minCol = sampleCols;
        let minRow = sampleRows;
        let maxCol = -1;
        let maxRow = -1;

        for (let row = 0; row < sampleRows; row += 1) {
          for (let col = 0; col < sampleCols; col += 1) {
            if (samples[row * sampleCols + col] > alphaThreshold) {
              minCol = Math.min(minCol, col);
              minRow = Math.min(minRow, row);
              maxCol = Math.max(maxCol, col);
              maxRow = Math.max(maxRow, row);
            }
          }
        }

        if (maxCol < 0 || maxRow < 0) {
          return null;
        }

        const padCells = Number.isFinite(options.padCells) ? Math.max(0, Math.floor(options.padCells)) : 2;
        const paddedMinCol = Math.max(0, minCol - padCells);
        const paddedMinRow = Math.max(0, minRow - padCells);
        const paddedMaxCol = Math.min(sampleCols - 1, maxCol + padCells);
        const paddedMaxRow = Math.min(sampleRows - 1, maxRow + padCells);
        const cellWidth = targetWidth / sampleCols;
        const cellHeight = targetHeight / sampleRows;
        coarseRect = bounds?.getClampedRasterBox?.({
          x: paddedMinCol * cellWidth,
          y: paddedMinRow * cellHeight,
          width: (paddedMaxCol - paddedMinCol + 1) * cellWidth,
          height: (paddedMaxRow - paddedMinRow + 1) * cellHeight,
        }, targetWidth, targetHeight);
      }

      if (!coarseRect) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const clampToDocument = options.clampToDocument !== false;
      const mapLocalContentRectToDocument = (localRect) => {
        if (!localRect || !targetRect) {
          return null;
        }

        const documentContentRect = {
          height: localRect.height,
          width: localRect.width,
          x: targetRect.x + localRect.x,
          y: targetRect.y + localRect.y,
        };

        return clampToDocument
          ? bounds?.getClampedRasterBox?.(documentContentRect, this.width, this.height) || null
          : this.getUnclampedDocumentRect(documentContentRect);
      };

      if (options.coarseOnly === true) {
        return mapLocalContentRectToDocument(coarseRect);
      }

      const gl = this.gl;
      const pixels = new Uint8Array(coarseRect.width * coarseRect.height * 4);

      if (cpuPixels) {
        const readY = targetHeight - (coarseRect.y + coarseRect.height);

        for (let row = 0; row < coarseRect.height; row += 1) {
          const sourceStart = ((readY + row) * targetWidth + coarseRect.x) * 4;
          const destStart = row * coarseRect.width * 4;
          pixels.set(
            cpuPixels.subarray(sourceStart, sourceStart + coarseRect.width * 4),
            destStart,
          );
        }
      } else {
        const readY = targetHeight - (coarseRect.y + coarseRect.height);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
        gl.readPixels(coarseRect.x, readY, coarseRect.width, coarseRect.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      }

      let minX = coarseRect.width;
      let minY = coarseRect.height;
      let maxX = -1;
      let maxY = -1;

      for (let row = 0; row < coarseRect.height; row += 1) {
        for (let col = 0; col < coarseRect.width; col += 1) {
          const alpha = pixels[(row * coarseRect.width + col) * 4 + 3];

          if (alpha > alphaThreshold) {
            minX = Math.min(minX, col);
            minY = Math.min(minY, row);
            maxX = Math.max(maxX, col);
            maxY = Math.max(maxY, row);
          }
        }
      }

      if (maxX < 0 || maxY < 0) {
        return null;
      }

      const topDownMinY = coarseRect.height - 1 - maxY;
      const topDownMaxY = coarseRect.height - 1 - minY;
      const padding = Number.isFinite(options.padding) ? Math.max(0, Math.floor(options.padding)) : 2;

      const localBounds = bounds?.getClampedRasterBox?.({
        x: coarseRect.x + minX - padding,
        y: coarseRect.y + topDownMinY - padding,
        width: maxX - minX + 1 + padding * 2,
        height: topDownMaxY - topDownMinY + 1 + padding * 2,
      }, targetWidth, targetHeight);

      if (!localBounds) {
        return null;
      }

      return mapLocalContentRectToDocument(localBounds);
    }
,

    getRasterContentBounds(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (this.isSparseRasterTarget(target)) {
        if (options.coarseOnly === true) {
          return this.getRasterTargetDocumentRect(target);
        }

        let sparseBounds = null;

        target.tiles.forEach((tileTarget) => {
          const tileBounds = this.getRasterTargetPixelContentBounds(tileTarget, options);

          sparseBounds = sparseBounds ? this.unionRasterHistoryRects(sparseBounds, tileBounds) : tileBounds;
        });

        return sparseBounds;
      }

      if (!layerId) {
        return null;
      }

      return this.getRasterTargetPixelContentBounds(target, options);
    }
,

    isPaintRasterLayer(layerId, target = null) {
      const layer = layerId ? this.layerModel?.findEntryById?.(layerId) : null;

      return Boolean(
        layer?.type === "paint" ||
        layerId === this.paintLayerId ||
        String(layerId || target?.layerId || "").startsWith("paint-")
      );
    }
,

    estimatePaintTargetCropPotential(options = {}) {
      const documentBytes = this.getRasterRectBytes(this.width, this.height);
      const minSavingsBytes = Math.max(0, Number(options.minSavingsMiB ?? 8) || 0) * RASTER_MIB;
      const maxCropCoverage = Number.isFinite(options.maxCropCoverage)
        ? Math.min(1, Math.max(0, Number(options.maxCropCoverage)))
        : 0.8;
      const precise = options.precise === true;
      const rows = [];

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (
          this.needsCopyOnWriteDetach(target) ||
          !target?.framebuffer ||
          !target?.texture ||
          !this.isPaintRasterLayer(layerId, target)
        ) {
          continue;
        }

        const currentBytes = this.estimateRasterTargetBytes(target);
        const isFullCanvas = !this.isCroppedRasterTarget(target);
        const contentRect = this.getRasterContentBounds(layerId, {
          alphaThreshold: options.alphaThreshold,
          coarseOnly: !precise,
          padding: options.padding,
          padCells: options.padCells,
          sampleCols: options.sampleCols,
          sampleRows: options.sampleRows,
        });
        const croppedBytes = contentRect ? this.getRasterRectBytes(contentRect) : 0;
        const savingsBytes = Math.max(0, currentBytes - croppedBytes);
        const contentCoverage = documentBytes > 0 ? croppedBytes / documentBytes : 0;
        const action = !contentRect
          ? "empty-target"
          : !isFullCanvas
            ? "already-cropped"
            : savingsBytes >= minSavingsBytes && contentCoverage <= maxCropCoverage
              ? "crop-candidate"
              : "keep-full";

        rows.push({
          action,
          contentCoverage: Number(contentCoverage.toFixed(6)),
          contentRect: contentRect ? { ...contentRect } : null,
          currentBytes,
          currentMiB: this.formatRasterMiB(currentBytes),
          estimatedCroppedBytes: croppedBytes,
          estimatedCroppedMiB: this.formatRasterMiB(croppedBytes),
          isFullCanvas,
          layerId,
          mode: precise ? "precise" : "sampled",
          savingsBytes,
          savingsMiB: this.formatRasterMiB(savingsBytes),
        });
      }

      rows.sort((first, second) => second.savingsBytes - first.savingsBytes);

      const candidates = rows.filter((row) => row.action === "crop-candidate" || row.action === "empty-target");
      const potentialSavingsBytes = candidates.reduce((sum, row) => sum + row.savingsBytes, 0);

      return {
        candidateCount: candidates.length,
        generatedAt: new Date().toISOString(),
        mode: precise ? "precise" : "sampled",
        paintTargetCount: rows.length,
        potentialSavingsBytes,
        potentialSavingsMiB: this.formatRasterMiB(potentialSavingsBytes),
        rows,
      };
    }
,

    copyRasterTargetRectToTarget(sourceTarget, docRect, destinationTarget) {
      const mappedRect = this.getRasterTargetLocalRect(sourceTarget, docRect);
      const sourceRect = mappedRect?.localRect;

      if (!sourceTarget?.framebuffer || !destinationTarget?.framebuffer || !sourceRect) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        0,
        0,
        destinationTarget.width,
        destinationTarget.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }
,

    copyRasterTargetRectIntoTarget(sourceTarget, docRect, destinationTarget) {
      const sourceMappedRect = this.getRasterTargetLocalRect(sourceTarget, docRect);
      const destinationMappedRect = this.getRasterTargetLocalRect(destinationTarget, sourceMappedRect?.docRect);
      const sourceRect = sourceMappedRect?.localRect;
      const destinationRect = destinationMappedRect?.localRect;

      if (!sourceTarget?.framebuffer || !destinationTarget?.framebuffer || !sourceRect || !destinationRect) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;
      const destinationX0 = destinationRect.x;
      const destinationX1 = destinationRect.x + destinationRect.width;
      const destinationY0 = destinationTarget.height - (destinationRect.y + destinationRect.height);
      const destinationY1 = destinationTarget.height - destinationRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        destinationX0,
        destinationY0,
        destinationX1,
        destinationY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }
,

    createRasterTargetForDocumentRect(layerId, targetRect, options = {}) {
      const rect = this.getClampedDocumentRect(targetRect);

      if (!rect) {
        return null;
      }

      const clearColor = Array.isArray(options.clearColor)
        ? options.clearColor
        : [0, 0, 0, 0];

      return this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRect(rect),
        height: rect.height,
        layerId,
        reason: options.source || "create-raster-target-for-rect",
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
    }
,

    shouldSparsifyRasterTargetForPaintRect(layerId, target, requiredRect, options = {}) {
      const targetRect = this.getRasterTargetDocumentRect(target);

      return Boolean(
        options.sparse !== false &&
        requiredRect &&
        targetRect &&
        target?.framebuffer &&
        target?.texture &&
        !this.isSparseRasterTarget(target) &&
        this.isPaintRasterLayer(layerId, target) &&
        !this.containsRasterHistoryRect(targetRect, requiredRect)
      );
    }
,

    ensureRasterTargetsForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return [];
      }

      let existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (
        this.shouldRetileRasterTargetForPaint(layerId, existingTarget, options) ||
        this.shouldSparsifyRasterTargetForPaintRect(layerId, existingTarget, requiredRect, options)
      ) {
        existingTarget = this.sparsifyRasterTarget(layerId, existingTarget, {
          emit: false,
          source: options.source || "paint-retile-existing-target",
        }) || existingTarget;
      }

      const useSparse = options.sparse !== false &&
        (!existingTarget || this.isSparseRasterTarget(existingTarget));

      if (useSparse) {
        const sparseResult = this.ensureSparseRasterTargetForPaintRect(layerId, rect, options);

        if (sparseResult?.targets?.length) {
          return sparseResult.targets;
        }
      }

      const target = this.ensureRasterTargetForPaintRect(layerId, rect, options);

      return target ? [{ target }] : [];
    }
,

    prewarmRasterTargetsForPaintRect(layerId, rect, options = {}) {
      const existingTarget = this.rasterTargetsByLayerId.get(layerId);

      if (existingTarget && !this.isSparseRasterTarget(existingTarget)) {
        return [];
      }

      const sparseResult = this.ensureSparseRasterTargetForPaintRect(layerId, rect, {
        ...options,
        maxNewTiles: Number.isFinite(Number(options.maxNewTiles))
          ? Math.max(0, Math.round(Number(options.maxNewTiles)))
          : 2,
        source: options.source || "paint-target-prewarm",
      });

      return Array.isArray(sparseResult?.targets) ? sparseResult.targets : [];
    }
,

    getRasterTargetsForPaintRect(layerId, rect, options = {}) {
      let existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect || !existingTarget) {
        return [];
      }

      if (
        this.shouldRetileRasterTargetForPaint(layerId, existingTarget, options) ||
        this.shouldSparsifyRasterTargetForPaintRect(layerId, existingTarget, requiredRect, options)
      ) {
        existingTarget = this.sparsifyRasterTarget(layerId, existingTarget, {
          emit: false,
          source: options.source || "paint-retile-existing-target",
        }) || existingTarget;
      }

      if (this.isSparseRasterTarget(existingTarget)) {
        return this.getSparseRasterTileRects(requiredRect, {
          patchRects: options.patchRects,
          tileSize: existingTarget.tileSize,
          tilePatchRects: options.tilePatchRects,
        })
          .map((tile) => {
            const tileTarget = this.getSparseRasterTile(existingTarget, tile.tx, tile.ty);

            return tileTarget?.framebuffer && tileTarget?.texture
              ? {
                  patchRect: tile.patchRect ? { ...tile.patchRect } : { ...tile.rect },
                  rect: tile.rect ? { ...tile.rect } : { ...tile.patchRect },
                  target: tileTarget,
                  tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
                  tx: tile.tx,
                  ty: tile.ty,
                }
              : null;
          })
          .filter(Boolean);
      }

      const existingRect = this.getRasterTargetDocumentRect(existingTarget);

      return existingTarget?.framebuffer &&
        existingTarget?.texture &&
        this.containsRasterHistoryRect(existingRect, requiredRect)
        ? [{ target: existingTarget }]
        : [];
    }
,

    ensureRasterTargetForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return null;
      }

      let existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
      let existingRect = this.getRasterTargetDocumentRect(existingTarget);
      const source = options.source || "ensure-raster-target-for-paint-rect";

      if (this.isSparseRasterTarget(existingTarget)) {
        existingTarget = this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        }) || this.rasterTargetsByLayerId.get(layerId);
        existingRect = this.getRasterTargetDocumentRect(existingTarget);

        // Dense brush bakes can request a rect much larger than the sparse tiles
        // that were prewarmed during live drawing. Materializing sparse content
        // alone may therefore create a cropped target that is still too small.
        if (
          existingTarget?.framebuffer &&
          existingTarget?.texture &&
          this.containsRasterHistoryRect(existingRect, requiredRect)
        ) {
          return {
            ...existingTarget,
            layerId,
          };
        }
      }

      if (!existingTarget?.framebuffer || !existingTarget?.texture) {
        const nextTarget = this.createRasterTargetForDocumentRect(layerId, requiredRect, { source });

        if (!nextTarget) {
          return null;
        }

        if (!this.replaceRasterTarget(layerId, nextTarget, {
          emit: false,
          source,
        })) {
          this.deleteRasterTargetObject(nextTarget);
          return null;
        }

        return {
          ...nextTarget,
          layerId,
        };
      }

      if (this.containsRasterHistoryRect(existingRect, requiredRect)) {
        return {
          ...existingTarget,
          layerId,
        };
      }

      const nextRect = this.getClampedDocumentRect(this.unionRasterHistoryRects(existingRect, requiredRect));
      const clearColor = Array.isArray(existingTarget.clearColor)
        ? [...existingTarget.clearColor]
        : [0, 0, 0, 0];
      const nextTarget = this.createRasterTargetForDocumentRect(layerId, nextRect, {
        clearColor,
        source,
      });

      if (!nextTarget) {
        return {
          ...existingTarget,
          layerId,
        };
      }

      if (!this.copyRasterTargetRectIntoTarget(existingTarget, existingRect, nextTarget)) {
        this.deleteRasterTargetObject(nextTarget);
        return {
          ...existingTarget,
          layerId,
        };
      }

      if (!this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        source,
      })) {
        this.deleteRasterTargetObject(nextTarget);
        return {
          ...existingTarget,
          layerId,
        };
      }

      return {
        ...nextTarget,
        layerId,
      };
    }
,

    duplicateSparseRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);

      if (!sourceLayerId || !destinationLayerId || !this.isSparseRasterTarget(sourceTarget)) {
        return false;
      }

      if (options.copyOnWrite !== false) {
        const sharedTarget = this.createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, {
          source: options.source || "duplicate-sparse-raster-target",
        });

        if (!sharedTarget) {
          return false;
        }

        return this.installRasterTargetForLayer(destinationLayerId, sharedTarget, {
          emit: options.emit,
          label: options.label || destinationLayerId,
          source: options.source || "duplicate-sparse-raster-target",
        });
      }

      const destinationTarget = this.createSparseRasterTarget(destinationLayerId, {
        clearColor: sourceTarget.clearColor,
        tileSize: sourceTarget.tileSize,
      });
      let copiedCount = 0;

      for (const sourceTile of sourceTarget.tiles.values()) {
        if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
          kind: "paintTile",
          label: `${sourceLayerId} tile ${sourceTile.tx},${sourceTile.ty}`,
          layerId: sourceLayerId,
          ownerId: `${sourceLayerId}:${sourceTile.tx}:${sourceTile.ty}`,
          ownerType: "live",
          reason: options.source || "duplicate-sparse-raster-target",
        })) {
          this.deleteRasterTargetObject(destinationTarget);
          return false;
        }

        const tileRect = this.getRasterTargetDocumentRect(sourceTile);
        const destinationTile = this.ensureSparseRasterTileTarget(destinationLayerId, destinationTarget, {
          tileRect,
          tx: sourceTile.tx,
          ty: sourceTile.ty,
        }, {
          source: options.source || "duplicate-sparse-raster-target",
        });

        if (!destinationTile || !this.copyRasterTargetRectToTarget(sourceTile, tileRect, destinationTile)) {
          this.deleteRasterTargetObject(destinationTarget);
          return false;
        }

        copiedCount += 1;
      }

      if (copiedCount === 0 && sourceTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(destinationTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(destinationLayerId);

      destinationTarget.layerId = destinationLayerId;
      this.rasterTargetsByLayerId.set(destinationLayerId, destinationTarget);

      if (destinationLayerId === this.resolvePaintLayerId()) {
        this.paintLayerId = destinationLayerId;
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== destinationTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(destinationLayerId);
      this.commitVisualDirtyChange({
        emit: options.emit,
        layerId: destinationLayerId,
        rect: this.getRasterTargetDocumentRect(destinationTarget),
        source: options.source || "duplicate-sparse-raster-target",
        usePreviewDirtyTiles: true,
      });

      return true;
    }
,

    duplicateRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      if (!sourceLayerId || !destinationLayerId || sourceLayerId === destinationLayerId) {
        return false;
      }

      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);
      const sourceRect = this.getRasterTargetDocumentRect(sourceTarget);

      if (this.isSparseRasterTarget(sourceTarget)) {
        return this.duplicateSparseRasterTarget(sourceLayerId, destinationLayerId, options);
      }

      if (!sourceTarget?.framebuffer || !sourceTarget?.texture || !sourceRect) {
        return false;
      }

      if (options.copyOnWrite !== false) {
        const sharedTarget = this.createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, {
          source: options.source || "duplicate-raster-target",
        });

        if (!sharedTarget) {
          return false;
        }

        return this.installRasterTargetForLayer(destinationLayerId, sharedTarget, {
          emit: options.emit,
          label: options.label || destinationLayerId,
          source: options.source || "duplicate-raster-target",
        });
      }

      const clearColor = Array.isArray(sourceTarget.clearColor)
        ? [...sourceTarget.clearColor]
        : [0, 0, 0, 0];
      const destinationTarget = this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRasterTarget(sourceTarget),
        height: sourceRect.height,
        layerId: destinationLayerId,
        reason: options.source || "duplicate-raster-target",
        width: sourceRect.width,
        x: sourceRect.x,
        y: sourceRect.y,
      });

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        return false;
      }

      if (!this.copyRasterTargetRectToTarget(sourceTarget, sourceRect, destinationTarget)) {
        this.deleteRasterTargetObject(destinationTarget);
        return false;
      }

      const didReplace = this.replaceRasterTarget(destinationLayerId, destinationTarget, {
        emit: options.emit,
        label: options.label || destinationLayerId,
        source: options.source || "duplicate-raster-target",
      });

      if (!didReplace) {
        this.deleteRasterTargetObject(destinationTarget);
      }

      return didReplace;
    }
,

    compactPaintTargetToContent(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target?.framebuffer || !target?.texture || !this.isPaintRasterLayer(layerId, target)) {
        return null;
      }

      const currentBytes = this.estimateRasterTargetBytes(target);

      if (this.needsCopyOnWriteDetach(target)) {
        return {
          action: "copy-on-write-kept",
          bytesAfter: currentBytes,
          bytesBefore: currentBytes,
          layerId,
          savingsBytes: 0,
        };
      }

      const isFullCanvas = !this.isCroppedRasterTarget(target);
      const minSavingsBytes = Math.max(0, Number(options.minSavingsMiB ?? 8) || 0) * RASTER_MIB;
      const maxCropCoverage = Number.isFinite(options.maxCropCoverage)
        ? Math.min(1, Math.max(0, Number(options.maxCropCoverage)))
        : 0.8;
      const contentRect = options.contentRect || this.getRasterContentBounds(layerId, {
        alphaThreshold: options.alphaThreshold,
        coarseOnly: options.precise !== true,
        padding: options.padding,
        padCells: options.padCells,
        sampleCols: options.sampleCols,
        sampleRows: options.sampleRows,
      });

      if (!contentRect) {
        const activeLayerId = this.layerModel?.activeLayerId || "";
        const activePaintLayerId = this.resolvePaintLayerId?.() || "";
        const canDeleteEmpty = options.deleteEmptyTargets !== false &&
          layerId !== this.paintLayerId &&
          layerId !== activeLayerId &&
          layerId !== activePaintLayerId;
        const didDelete = canDeleteEmpty && this.deleteRasterTarget(layerId, {
          emit: false,
          source: options.source || "compact-empty-paint-target",
        });

        return {
          action: didDelete ? "deleted-empty" : "empty-kept",
          bytesAfter: didDelete ? 0 : currentBytes,
          bytesBefore: currentBytes,
          layerId,
          savingsBytes: didDelete ? currentBytes : 0,
        };
      }

      const croppedBytes = this.getRasterRectBytes(contentRect);
      const savingsBytes = Math.max(0, currentBytes - croppedBytes);
      const coverage = this.getRasterOperationCoverage(contentRect);

      if (!isFullCanvas || savingsBytes < minSavingsBytes || coverage > maxCropCoverage) {
        return {
          action: "skipped",
          bytesAfter: currentBytes,
          bytesBefore: currentBytes,
          contentRect: { ...contentRect },
          layerId,
          savingsBytes: 0,
        };
      }

      const nextTarget = this.createRasterTargetForRect(contentRect, target.clearColor || [0, 0, 0, 0]);

      if (!nextTarget?.framebuffer || !nextTarget?.texture) {
        return null;
      }

      if (!this.copyRasterTargetRectToTarget(target, contentRect, nextTarget)) {
        this.deleteRasterTargetObject(nextTarget);
        return null;
      }

      const didReplace = this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        source: options.source || "compact-paint-target",
      });

      if (!didReplace) {
        this.deleteRasterTargetObject(nextTarget);
        return null;
      }

      const recorded = this.recordRasterOperation({
        afterBytes: croppedBytes,
        beforeBytes: currentBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes: currentBytes + croppedBytes,
        historyBytes: 0,
        layerId,
        operationType: "paint-target-compact",
        persistentBytes: croppedBytes,
        policy: this.classifyRasterOperationMemory(currentBytes + croppedBytes, coverage),
        reason: options.source || "compact-paint-target",
        source: options.source || "compact-paint-target",
        sourceBytes: currentBytes,
        sourceRect: this.getRasterTargetDocumentRect(target),
        targetBytes: croppedBytes,
        targetRect: contentRect,
        tool: "paint-target-compact",
      });

      return {
        action: "compacted",
        bytesAfter: croppedBytes,
        bytesBefore: currentBytes,
        contentRect: { ...contentRect },
        layerId,
        memoryPolicy: recorded,
        savingsBytes,
      };
    }
,

    compactInactivePaintTargets(options = {}) {
      const excludedLayerIds = new Set();
      const addExcludedLayerId = (layerId) => {
        const normalizedLayerId = String(layerId || "").trim();

        if (normalizedLayerId) {
          excludedLayerIds.add(normalizedLayerId);
        }
      };
      const optionExcludedLayerIds = Array.isArray(options.excludeLayerIds)
        ? options.excludeLayerIds
        : [];

      optionExcludedLayerIds.forEach(addExcludedLayerId);
      addExcludedLayerId(options.excludeLayerId);
      addExcludedLayerId(this.layerModel?.activeLayerId);
      addExcludedLayerId(this.paintLayerId);
      addExcludedLayerId(this.resolvePaintLayerId?.());
      const includeActive = options.includeActive === true;
      const maxTargets = Math.max(1, Math.floor(Number(options.maxTargets) || 64));
      const results = [];

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (results.length >= maxTargets) {
          break;
        }

        if (!includeActive && excludedLayerIds.has(layerId)) {
          continue;
        }

        if (!this.isPaintRasterLayer(layerId, target) || !target?.texture || !target?.framebuffer) {
          continue;
        }

        const result = this.compactPaintTargetToContent(layerId, {
          ...options,
          source: options.source || "compact-inactive-paint-target",
        });

        if (result) {
          results.push(result);
        }
      }

      const summary = {
        compactedCount: results.filter((result) => result.action === "compacted").length,
        deletedEmptyCount: results.filter((result) => result.action === "deleted-empty").length,
        generatedAt: new Date().toISOString(),
        results,
        savingsBytes: results.reduce((sum, result) => sum + (Number(result.savingsBytes) || 0), 0),
      };

      summary.savingsMiB = this.formatRasterMiB(summary.savingsBytes);
      namespace.lastPaintTargetCompaction = summary;

      return summary;
    }
,

    clearRasterRect(layerId, rect) {
      if (!layerId || !rect) {
        return false;
      }

      const target = this.ensureWritableRasterTarget(layerId, {
        source: "clear-raster-rect-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const clearRect = mappedRect?.localRect;

      if (!target?.framebuffer || !clearRect) {
        return false;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(clearRect.x, target.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);

      return true;
    }
,

    cloneValue(value) {
      if (Array.isArray(value)) {
        return value.map((item) => this.cloneValue(item));
      }

      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, this.cloneValue(item)]),
        );
      }

      return value;
    }
,

    normalizeTransformArtboardRect(rect) {
      if (!rect) {
        return null;
      }

      const x = Number(rect.x);
      const y = Number(rect.y);
      const width = Number(rect.width);
      const height = Number(rect.height);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return null;
      }

      return {
        height,
        width,
        x,
        y,
      };
    }
,

    getRectIntersectionArea(a, b) {
      const first = this.normalizeTransformArtboardRect(a);
      const second = this.normalizeTransformArtboardRect(b);

      if (!first || !second) {
        return 0;
      }

      const x0 = Math.max(first.x, second.x);
      const y0 = Math.max(first.y, second.y);
      const x1 = Math.min(first.x + first.width, second.x + second.width);
      const y1 = Math.min(first.y + first.height, second.y + second.height);

      return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
    }
,

    getPolygonArea(points = []) {
      if (!Array.isArray(points) || points.length < 3) {
        return 0;
      }

      let area = 0;

      for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];

        area += (Number(current?.x) || 0) * (Number(next?.y) || 0);
        area -= (Number(next?.x) || 0) * (Number(current?.y) || 0);
      }

      return Math.abs(area) * 0.5;
    }
,

    clipPolygonToRect(points = [], rect = null) {
      const clipRect = this.normalizeTransformArtboardRect(rect);

      if (!clipRect || !Array.isArray(points) || points.length < 3) {
        return [];
      }

      const boundaries = [
        {
          inside: (point) => point.x >= clipRect.x,
          intersect: (start, end) => {
            const t = (clipRect.x - start.x) / ((end.x - start.x) || 1);
            return { x: clipRect.x, y: start.y + (end.y - start.y) * t };
          },
        },
        {
          inside: (point) => point.x <= clipRect.x + clipRect.width,
          intersect: (start, end) => {
            const x = clipRect.x + clipRect.width;
            const t = (x - start.x) / ((end.x - start.x) || 1);
            return { x, y: start.y + (end.y - start.y) * t };
          },
        },
        {
          inside: (point) => point.y >= clipRect.y,
          intersect: (start, end) => {
            const t = (clipRect.y - start.y) / ((end.y - start.y) || 1);
            return { x: start.x + (end.x - start.x) * t, y: clipRect.y };
          },
        },
        {
          inside: (point) => point.y <= clipRect.y + clipRect.height,
          intersect: (start, end) => {
            const y = clipRect.y + clipRect.height;
            const t = (y - start.y) / ((end.y - start.y) || 1);
            return { x: start.x + (end.x - start.x) * t, y };
          },
        },
      ];

      return boundaries.reduce((polygon, boundary) => {
        if (polygon.length === 0) {
          return [];
        }

        const output = [];

        for (let index = 0; index < polygon.length; index += 1) {
          const current = polygon[index];
          const previous = polygon[(index + polygon.length - 1) % polygon.length];
          const currentInside = boundary.inside(current);
          const previousInside = boundary.inside(previous);

          if (currentInside) {
            if (!previousInside) {
              output.push(boundary.intersect(previous, current));
            }

            output.push(current);
          } else if (previousInside) {
            output.push(boundary.intersect(previous, current));
          }
        }

        return output;
      }, points.map((point) => ({
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
      })));
    }
,

    getTransformArtboardGeometry(options = {}) {
      const transformMode = String(options.transformMode || "").trim().toLowerCase();
      const quad = Array.isArray(options.destQuad)
        ? options.destQuad
            .map((point) => ({
              x: Number(point?.x),
              y: Number(point?.y),
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : [];

      if (transformMode !== "warp" && quad.length >= 3) {
        return {
          points: quad,
          type: "polygon",
        };
      }

      const rect = this.normalizeTransformArtboardRect(options.destRect);

      return rect
        ? {
            rect,
            type: "rect",
          }
        : null;
    }
,

    getTransformGeometryArea(geometry) {
      if (geometry?.type === "polygon") {
        return this.getPolygonArea(geometry.points);
      }

      return geometry?.rect
        ? Math.max(0, geometry.rect.width * geometry.rect.height)
        : 0;
    }
,

    getTransformGeometryArtboardOverlapArea(geometry, artboardRect) {
      if (geometry?.type === "polygon") {
        return this.getPolygonArea(this.clipPolygonToRect(geometry.points, artboardRect));
      }

      return this.getRectIntersectionArea(geometry?.rect, artboardRect);
    }
,

    resolveTransformArtboardTransfer(layerId, options = {}) {
      const layer = this.layerModel?.findEntryById?.(layerId);
      const currentArtboardId = String(
        layer?.artboardId ||
        this.layerModel?.findEntryArtboardId?.(layerId) ||
        "",
      ).trim();
      const artboards = (namespace.getDocumentArtboards?.() || [])
        .map((artboard) => ({
          id: String(artboard?.id || "").trim(),
          rect: this.normalizeTransformArtboardRect(artboard),
        }))
        .filter((artboard) => artboard.id && artboard.rect);
      const geometry = this.getTransformArtboardGeometry(options);
      const geometryArea = this.getTransformGeometryArea(geometry);

      if (!layer || artboards.length === 0 || geometryArea <= 0) {
        return null;
      }

      let best = null;
      let currentOverlapArea = 0;

      artboards.forEach((artboard) => {
        const overlapArea = this.getTransformGeometryArtboardOverlapArea(geometry, artboard.rect);

        if (artboard.id === currentArtboardId) {
          currentOverlapArea = overlapArea;
        }

        if (!best || overlapArea > best.overlapArea) {
          best = {
            artboardId: artboard.id,
            overlapArea,
          };
        }
      });

      if (
        !best ||
        best.artboardId === currentArtboardId ||
        best.overlapArea <= currentOverlapArea ||
        best.overlapArea / geometryArea < RASTER_TRANSFORM_ARTBOARD_TRANSFER_MIN_RATIO
      ) {
        return null;
      }

      return {
        fromArtboardId: currentArtboardId,
        overlapArea: best.overlapArea,
        overlapRatio: best.overlapArea / geometryArea,
        toArtboardId: best.artboardId,
      };
    }
,

    applyTransformArtboardTransfer(layerId, options = {}) {
      const transfer = this.resolveTransformArtboardTransfer(layerId, options);

      if (!transfer?.toArtboardId) {
        return null;
      }

      const didMove = this.layerModel?.moveLayerToArtboard?.(layerId, transfer.toArtboardId, {
        history: false,
        source: options.source || "raster-transform-artboard-transfer",
      });

      return didMove ? transfer : null;
    }
,

    createRasterEditLayerStateHistoryEntry(baseEntry, options = {}) {
      const {
        afterState,
        beforeState,
        history,
        layerId,
        source = baseEntry?.source || "raster-edit",
      } = options;

      if (
        !baseEntry ||
        !history ||
        typeof history.restoreLayerState !== "function" ||
        !this.layerModel ||
        !beforeState ||
        !afterState
      ) {
        return baseEntry;
      }

      const before = this.cloneValue(beforeState);
      const after = this.cloneValue(afterState);

      return {
        ...baseEntry,
        afterActiveLayerId: after.activeLayerId || null,
        afterEntries: after.entries,
        afterReferenceLayerId: after.referenceLayerId || null,
        beforeActiveLayerId: before.activeLayerId || null,
        beforeEntries: before.entries,
        beforeReferenceLayerId: before.referenceLayerId || null,
        layerId,
        source,
        undo: () => {
          const didRestorePixels = baseEntry.undo?.() !== false;

          if (!didRestorePixels) {
            return false;
          }

          return history.restoreLayerState(this.layerModel, before, {
            source: `history-undo-${source}-layer-state`,
          });
        },
        redo: () => {
          const didRestoreState = history.restoreLayerState(this.layerModel, after, {
            source: `history-redo-${source}-layer-state`,
          });

          if (!didRestoreState) {
            return false;
          }

          const didRestorePixels = baseEntry.redo?.() !== false;

          if (!didRestorePixels) {
            baseEntry.undo?.();
            history.restoreLayerState(this.layerModel, before, {
              source: `history-redo-${source}-rollback`,
            });
          }

          return didRestorePixels;
        },
        destroy: () => {
          baseEntry.destroy?.();
        },
      };
    }
,

    finalizeRasterEditHistoryEntry(layerId, entry, options = {}) {
      const source = options.source || entry?.source || "raster-edit";
      const history = namespace.documentHistory;
      const layer = layerId ? this.layerModel?.findEntryById?.(layerId) : null;
      let didLayerStateChange = false;

      if (!layer || layer.locked === true) {
        return entry;
      }

      history?.flushLayerState?.(this.layerModel);
      const beforeState = history?.getLayerSnapshot?.(this.layerModel) || null;

      if (layer.type === "image") {
        const didRasterize = this.layerModel?.rasterizeImageLayerToPaint?.(layer.id, {
          history: false,
          source,
        });

        if (didRasterize) {
          didLayerStateChange = true;

          window.dispatchEvent(new CustomEvent("cbo:image-layer-rasterized", {
            detail: {
              layerId: layer.id,
              source,
            },
          }));
        }
      }

      const transfer = this.applyTransformArtboardTransfer(layer.id, {
        ...(options.artboardTransfer || {}),
        source: `${source}-artboard-transfer`,
      });

      didLayerStateChange = didLayerStateChange || Boolean(transfer);

      if (!didLayerStateChange) {
        return entry;
      }

      const afterState = history?.getLayerSnapshot?.(this.layerModel) || null;

      return this.createRasterEditLayerStateHistoryEntry(entry, {
        afterState,
        beforeState,
        history,
        layerId: layer.id,
        source,
      });
    }
,

    getTranslateOnlyRasterTransformDelta(options = {}) {
      const transformMode = String(options.transformMode || "free").trim().toLowerCase();

      if (transformMode === "warp" || transformMode === "perspective" || options.warpControlPoints) {
        return null;
      }

      const sourceRect = this.getUnclampedDocumentRect(options.sourceRect);
      const destQuad = Array.isArray(options.destQuad) ? options.destQuad : null;

      if (!sourceRect || !destQuad || destQuad.length < 4) {
        return null;
      }

      const dx = Number(destQuad[0]?.x) - sourceRect.x;
      const dy = Number(destQuad[0]?.y) - sourceRect.y;
      const roundedDx = Math.round(dx);
      const roundedDy = Math.round(dy);
      const epsilon = 0.001;

      if (
        !Number.isFinite(dx) ||
        !Number.isFinite(dy) ||
        (roundedDx === 0 && roundedDy === 0)
      ) {
        return null;
      }

      const expected = [
        { x: sourceRect.x + dx, y: sourceRect.y + dy },
        { x: sourceRect.x + sourceRect.width + dx, y: sourceRect.y + dy },
        { x: sourceRect.x + sourceRect.width + dx, y: sourceRect.y + sourceRect.height + dy },
        { x: sourceRect.x + dx, y: sourceRect.y + sourceRect.height + dy },
      ];

      for (let index = 0; index < expected.length; index += 1) {
        const point = destQuad[index];

        if (
          !point ||
          Math.abs(Number(point.x) - expected[index].x) > epsilon ||
          Math.abs(Number(point.y) - expected[index].y) > epsilon
        ) {
          return null;
        }
      }

      return {
        dx: roundedDx,
        dy: roundedDy,
      };
    }
,

    commitTranslatedRasterTransform(options = {}) {
      const {
        destQuad,
        destRect,
        layerId,
        source = "raster-transform",
        sourceRect,
        target,
        transformMode = "free",
        warpControlPoints,
      } = options;
      const delta = this.getTranslateOnlyRasterTransformDelta({
        destQuad,
        sourceRect,
        transformMode,
        warpControlPoints,
      });

      if (!layerId || !target || !delta) {
        return false;
      }

      const beforeTargetRect = this.getRasterTargetDocumentRect(target);
      const afterTargetRect = beforeTargetRect
        ? this.offsetDocumentRect(beforeTargetRect, delta.dx, delta.dy)
        : null;
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [sourceRect, destRect || this.offsetDocumentRect(sourceRect, delta.dx, delta.dy)],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const applyPlacement = (dx, dy, historySource) => {
        const didTranslate = this.translateRasterTargetPlacement(layerId, dx, dy, {
          source: historySource,
        });

        if (!didTranslate) {
          return false;
        }

        this.commitVisualDirtyChange({
          layerId,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: historySource,
        });
        this.requestDraw();
        return true;
      };

      if (!applyPlacement(delta.dx, delta.dy, source)) {
        return false;
      }

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterRect: afterTargetRect,
        beforeRect: beforeTargetRect,
        estimatedPeakBytes: 0,
        layerId,
        mode: transformMode,
        operationType: "raster-transform-placement",
        persistentBytes: 0,
        reason: source,
        scratchBytes: 0,
        source,
        sourceBytes: 0,
        sourceRect,
        targetBytes: 0,
        targetRect: afterTargetRect,
        tool: "raster-transform",
      }));
      const history = namespace.documentHistory;
      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        layerId,
        memoryPolicy,
        source,
        type: "custom",
        undo: () => applyPlacement(-delta.dx, -delta.dy, `history-undo-${source}`),
        redo: () => applyPlacement(delta.dx, delta.dy, `history-redo-${source}`),
      }, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      }

      this.clearRasterTransformPreview(layerId);
      return true;
    }
,

    commitCroppedRasterTransform(options = {}) {
      const {
        destQuad,
        destRect,
        layerId,
        source = "raster-transform",
        sourceSnapshot,
        transformMode = "free",
        warpControlPoints,
      } = options;
      let target = this.rasterTargetsByLayerId.get(layerId);
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);
      const nextRect = this.getUnclampedDocumentRect(
        destDirtyRect || destRect,
        CROPPED_TARGET_EDGE_PADDING,
      );
      const wasSparseTarget = this.isSparseRasterTarget(target);
      const willRasterizeImageLayer = this.layerModel?.findEntryById?.(layerId)?.type === "image";

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        }) || target;
      }

      if (!target?.framebuffer || !sourceSnapshot?.texture || !nextRect) {
        return false;
      }

      const preferSparseRestore = wasSparseTarget ||
        target.materializedFromSparse === true ||
        willRasterizeImageLayer;
      const beforeSnapshot = this.createRasterSnapshot(target, null, `${source}-before-target`);

      if (!beforeSnapshot?.texture) {
        return false;
      }

      const nextTarget = this.createRasterTargetForUnclampedRect(nextRect);

      if (!nextTarget?.framebuffer) {
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      if (preferSparseRestore) {
        nextTarget.materializedFromSparse = true;
        nextTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

      const localDestQuad = destQuad.map((point) => ({
        x: point.x - nextRect.x,
        y: point.y - nextRect.y,
      }));
      const normalizedTransformMode = String(transformMode).trim().toLowerCase();
      const localWarpControlPoints = normalizedTransformMode === "warp"
        ? this.offsetRasterWarpControlPoints(warpControlPoints, -nextRect.x, -nextRect.y)
        : null;
      const drawOptions = {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: options.edgeFeatherPixels,
        framebuffer: nextTarget.framebuffer,
        opacity: 1,
        textureFilter: this.gl?.LINEAR,
        viewportHeight: nextTarget.height,
        viewportWidth: nextTarget.width,
      };
      const didDraw = normalizedTransformMode === "warp"
        ? this.drawWarpTexturedMesh(sourceSnapshot.texture, localWarpControlPoints, drawOptions)
        : normalizedTransformMode === "perspective"
          ? this.drawPerspectiveTexturedQuad(sourceSnapshot.texture, localDestQuad, drawOptions)
          : this.drawTexturedQuad(sourceSnapshot.texture, localDestQuad, drawOptions);

      if (!didDraw) {
        this.deleteRasterTargetObject(nextTarget);
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      this.markRasterTargetDirty(nextTarget);

      const currentTargetRect = this.getRasterTargetDocumentRect(target);
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [currentTargetRect, nextRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const scratchBytes = this.estimateRasterSnapshotBytes(sourceSnapshot);

      this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        invalidate: false,
        rects: previewDirtyRects,
        source,
      });

      const afterPreferSparse = Boolean(
        preferSparseRestore &&
        (willRasterizeImageLayer || this.isPaintRasterLayer(layerId, nextTarget))
      );
      const finalLiveTarget = afterPreferSparse
        ? this.sparsifyRasterTarget(layerId, nextTarget, {
            clampToDocument: false,
            emit: false,
            source: `${source}-retile`,
            tileSize: nextTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || nextTarget
        : nextTarget;
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterRect: nextRect,
        beforeSnapshot,
        estimatedPeakBytes:
          sourceBytes +
          targetBytes +
          scratchBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot),
        layerId,
        mode: transformMode,
        operationType: "raster-transform",
        persistentBytes:
          targetBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot),
        reason: source,
        scratchBytes,
        source,
        sourceBytes,
        sourceRect: currentTargetRect,
        targetBytes,
        targetRect: nextRect,
        tool: "raster-transform",
      }));

      const history = namespace.documentHistory;
      let afterSnapshot = null;
      const snapshots = {
        after: null,
        before: beforeSnapshot,
      };
      const captureAfterSnapshot = () => {
        if (afterSnapshot?.texture || afterSnapshot?.cpuPixels || afterSnapshot?.empty === true) {
          return true;
        }

        afterSnapshot = this.createRasterSnapshot(layerId, nextRect, `${source}-after-target`);
        snapshots.after = afterSnapshot;

        return Boolean(afterSnapshot?.texture || afterSnapshot?.cpuPixels || afterSnapshot?.empty === true);
      };
      const baseEntry = {
        type: "custom",
        beforeSnapshot,
        layerId,
        memoryPolicy,
        snapshots,
        source,
        undo: () => {
          if (!captureAfterSnapshot()) {
            return false;
          }

          return this.restoreRasterSnapshot(layerId, beforeSnapshot, {
            preferSparse: preferSparseRestore,
            replaceSparse: preferSparseRestore,
            releaseSnapshotGpuAfterRestore: true,
            source: `history-undo-${source}`,
          });
        },
        redo: () => snapshots.after
          ? this.restoreRasterSnapshot(layerId, snapshots.after, {
              preferSparse: afterPreferSparse,
              replaceSparse: afterPreferSparse,
              releaseSnapshotGpuAfterRestore: true,
              source: `history-redo-${source}`,
            })
          : false,
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(snapshots.after);
        },
      };
      const entry = this.finalizeRasterEditHistoryEntry(layerId, baseEntry, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.commitVisualDirtyChange({
        layerId,
        maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
        preserveDirtyRects: true,
        rects: previewDirtyRects,
        source,
      });
      this.requestDraw();

      return true;
    }
,

    commitRasterTransform(options = {}) {
      const {
        destQuad,
        layerId,
        source = "raster-transform",
        sourceRect,
        sourceSnapshot,
        transformMode = "free",
        warpControlPoints,
      } = options;
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("transform.commit", {
        layerId,
        mode: transformMode,
        source,
      }) : null;

      try {
      const bounds = namespace.documentBounds;
      const normalizedTransformMode = String(transformMode).trim().toLowerCase();

      if (!bounds) {
        return false;
      }

      const destBounds = normalizedTransformMode === "warp"
        ? bounds?.rectToBounds?.(this.getRasterWarpBounds(warpControlPoints))
        : bounds?.quadToBounds?.(destQuad);
      const destRect = bounds?.boundsToRect?.(destBounds);

      // Fast path first. A pure move only needs placement history; materializing
      // sparse tiles before this point can turn a cheap commit into GPU work.
      let target = this.rasterTargetsByLayerId.get(layerId);

      if (this.getTranslateOnlyRasterTransformDelta({
        destQuad,
        sourceRect,
        transformMode: normalizedTransformMode,
        warpControlPoints,
      })) {
        return this.commitTranslatedRasterTransform({
          ...options,
          destRect,
          target,
        });
      }

      target = this.ensureWritableRasterTarget(layerId, {
        source: `${source}-copy-on-write-detach`,
      }) || target;

      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        }) || target;
      }

      const preferSparseRestore = wasSparseTarget || target?.materializedFromSparse === true;
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);
      const targetRect = this.getRasterTargetDocumentRect(target);
      const transformEscapesTarget = Boolean(
        targetRect &&
        (
          !this.containsRasterHistoryRect(targetRect, destDirtyRect || destRect) ||
          !this.containsRasterHistoryRect(targetRect, sourceRect)
        )
      );

      if (this.isCroppedRasterTarget(target) || transformEscapesTarget) {
        return this.commitCroppedRasterTransform({
          ...options,
          destRect,
        });
      }

      const dirtyRect = bounds?.getClampedRasterBox?.(
        bounds.getUnionRect(sourceRect, destDirtyRect || destRect),
        target?.width,
        target?.height,
      );
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [sourceRect, destDirtyRect || destRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );

      if (!target?.framebuffer || !sourceSnapshot?.texture || !sourceRect || !dirtyRect) {
        return false;
      }

      const useAuthoritativeSparseHistory = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));
      const sparseSnapshotCoversWholeTarget = Boolean(
        useAuthoritativeSparseHistory &&
        targetRect &&
        dirtyRect &&
        this.containsRasterHistoryRect(dirtyRect, targetRect)
      );
      const tileHistory = useAuthoritativeSparseHistory
        ? null
        : this.beginRasterTileHistory(layerId, dirtyRect, {
            label: source,
            source,
          });
      const beforeSnapshot = tileHistory
        ? null
        : this.createRasterSnapshot(layerId, dirtyRect, `${source}-before`);

      if (!tileHistory && !beforeSnapshot?.texture) {
        return false;
      }

      this.clearRasterRect(layerId, sourceRect);

      const drawOptions = {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: options.edgeFeatherPixels,
        framebuffer: target.framebuffer,
        opacity: 1,
        textureFilter: this.gl?.LINEAR,
        viewportHeight: target.height,
        viewportWidth: target.width,
      };
      const didDraw = String(transformMode).trim().toLowerCase() === "perspective"
        ? this.drawPerspectiveTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions)
        : normalizedTransformMode === "warp"
          ? this.drawWarpTexturedMesh(sourceSnapshot.texture, warpControlPoints, drawOptions)
          : this.drawTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions);

      if (!didDraw) {
        if (tileHistory) {
          this.restoreRasterTileHistoryEntry(tileHistory, "before", {
            emit: false,
            source: `${source}-rollback`,
          });
          this.deleteRasterTileHistoryCapture(tileHistory);
        } else {
          this.restoreRasterSnapshot(layerId, beforeSnapshot, {
            emit: false,
            preferSparse: preferSparseRestore,
            source: `${source}-rollback`,
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }
        return false;
      }

      if (tileHistory) {
        const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));
        const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
          afterRect: dirtyRect,
          beforeRect: dirtyRect,
          layerId,
          mode: transformMode,
          operationType: "raster-transform",
          persistentBytes: this.getRasterRectBytes(dirtyRect),
          reason: source,
          scratchBytes: 0,
          source,
          sourceBytes: this.estimateRasterSnapshotBytes(sourceSnapshot),
          sourceRect,
          targetBytes: this.getRasterRectBytes(dirtyRect),
          targetRect: dirtyRect,
          tool: "raster-transform",
        }));
        const tileEntry = this.commitRasterTileHistory(tileHistory, {
          label: source,
          lazyAfter: true,
          memoryPolicy,
          redoSource: `history-redo-${source}`,
          releaseSnapshotGpuAfterRestore: true,
          source,
          type: "custom",
          undoSource: `history-undo-${source}`,
        });

        if (!tileEntry) {
          this.restoreRasterTileHistoryEntry(tileHistory, "before", {
            emit: false,
            source: `${source}-rollback`,
          });
          this.deleteRasterTileHistoryCapture(tileHistory);
          return false;
        }

        const entry = this.finalizeRasterEditHistoryEntry(layerId, tileEntry, {
          artboardTransfer: {
            destQuad,
            destRect,
            transformMode,
            warpControlPoints,
          },
          source,
        });
        const history = namespace.documentHistory;

        if (afterPreferSparse) {
          this.sparsifyRasterTarget(layerId, target, {
            clampToDocument: false,
            emit: false,
            source: `${source}-retile`,
            tileSize: target.sparseTileSize || target.tileSize,
          });
        }

        if (history?.push) {
          history.push(entry);
        } else {
          entry.destroy();
        }

        this.clearRasterTransformPreview(layerId);
        this.commitVisualDirtyChange({
          layerId,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source,
        });
        this.requestDraw();

        return true;
      }

      const afterSnapshot = this.createRasterSnapshot(layerId, dirtyRect, `${source}-after`);

      if (!afterSnapshot?.texture) {
        this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: `${source}-rollback`,
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterSnapshot,
        beforeSnapshot,
        layerId,
        mode: transformMode,
        operationType: "raster-transform",
        persistentBytes:
          this.estimateRasterSnapshotBytes(beforeSnapshot) +
          this.estimateRasterSnapshotBytes(afterSnapshot),
        reason: source,
        scratchBytes: 0,
        source,
        sourceBytes: this.estimateRasterSnapshotBytes(sourceSnapshot),
        sourceRect,
        targetBytes: this.getRasterRectBytes(dirtyRect),
        targetRect: dirtyRect,
        tool: "raster-transform",
      }));

      const history = namespace.documentHistory;
      const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));

      if (afterPreferSparse) {
        this.sparsifyRasterTarget(layerId, target, {
          clampToDocument: false,
          emit: false,
          source: `${source}-retile`,
          tileSize: target.sparseTileSize || target.tileSize,
        });
      }

      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        type: "custom",
        afterSnapshot,
        beforeSnapshot,
        layerId,
        memoryPolicy,
        source,
        undo: () => this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          preferSparse: preferSparseRestore,
          replaceSparse: sparseSnapshotCoversWholeTarget,
          releaseSnapshotGpuAfterRestore: true,
          source: `history-undo-${source}`,
        }),
        redo: () => this.restoreRasterSnapshot(layerId, afterSnapshot, {
          preferSparse: afterPreferSparse,
          replaceSparse: sparseSnapshotCoversWholeTarget,
          releaseSnapshotGpuAfterRestore: true,
          source: `history-redo-${source}`,
        }),
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(afterSnapshot);
        },
      }, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.commitVisualDirtyChange({
        layerId,
        maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
        preserveDirtyRects: true,
        rects: previewDirtyRects,
        source,
      });
      this.requestDraw();

      return true;
      } finally {
        trace?.end({
          layerId,
          mode: transformMode,
          source,
        });
      }
    }
,

    deleteRasterTarget(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if ((target.texture && target.texture === this.texture) || layerId === this.paintLayerId || layerId === "background") {
        return false;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);

      this.deleteRasterTargetObject(target);
      this.rasterTargetsByLayerId.delete(layerId);
      this.deletePuppetMeshResource(layerId);

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: targetRect,
          source: options.source || "delete-raster-target",
          usePreviewDirtyTiles: true,
        });
      }

      return true;
    }
,

    emitContentChange(detail = {}) {
      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail,
      }));
    }
,

    handleLayerModelChange(event) {
      const source = event?.detail?.source || "layers-change";
      const changeType = event?.detail?.changeType || "";
      const isRasterTransformArtboardTransfer =
        source.endsWith("-artboard-transfer") && source.includes("raster-transform");
      const nonVisualSources = new Set([
        "active-layer",
        "image-rasterize",
        "image-upload",
        "image-upload-error",
        "layer-effects-rasterize",
        "raster-transform",
      ]);
      const forceVisualSources = new Set([
        "image-upload-metadata",
        "layers-panel-clipping-mask",
      ]);

      if (forceVisualSources.has(source)) {
        if (source === "layers-panel-clipping-mask") {
          this.deletePreviewCache();
        }

        this.invalidatePreviewCache(source, event?.detail || {});
        this.requestDraw();
        this.pruneOrphanRasterTargets();
        return;
      }

      if (changeType !== "active-layer" && !nonVisualSources.has(source) && !isRasterTransformArtboardTransfer) {
        this.invalidatePreviewCache("layers-change", event?.detail || {});
      }

      this.pruneOrphanRasterTargets();
    }
,

    handleDocumentContentChange(event) {
      const detail = event?.detail || {};

      this.invalidatePreviewCache(detail.source || "document-content-change", detail);
    }
,

    handleHistoryChange(event) {
      const source = event?.detail?.source || "history-change";
      const stackOnlySources = new Set([
        "clear",
        "dispose",
        "history-budget-change",
        "history-gpu-hot-budget-change",
        "history-gpu-hot-prune",
        "init",
        "merge",
        "push",
        "redo-empty",
        "undo-empty",
      ]);

      if (!stackOnlySources.has(source) && !this.previewCacheDirty) {
        this.invalidatePreviewCache("history-change");
      }

      this.pruneOrphanRasterTargets();
    }
,

    collectEntryLayerIds(entries, result = new Set()) {
      if (!Array.isArray(entries)) {
        return result;
      }

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        if (entry.id) {
          result.add(entry.id);
        }

        this.collectEntryLayerIds(entry.children || [], result);
      }

      return result;
    }
,

    collectHistoryEntryLayerIds(entry, result = new Set()) {
      if (!entry) {
        return result;
      }

      if (entry.layerId) {
        result.add(entry.layerId);
      }

      if (Array.isArray(entry.layerIds)) {
        entry.layerIds.forEach((layerId) => {
          if (layerId) {
            result.add(layerId);
          }
        });
      }

      this.collectEntryLayerIds(entry.beforeEntries || [], result);
      this.collectEntryLayerIds(entry.afterEntries || [], result);

      return result;
    }
,

    collectHistoryLayerIds(result = new Set()) {
      const history = namespace.documentHistory;
      const stacks = [history?.undoStack, history?.redoStack];

      for (const stack of stacks) {
        if (!Array.isArray(stack)) {
          continue;
        }

        for (const entry of stack) {
          this.collectHistoryEntryLayerIds(entry, result);
        }
      }

      return result;
    }
,

    getCurrentRasterTargetLayerIds() {
      const currentLayerIds = this.collectEntryLayerIds(this.layerModel?.getEntries?.() || []);
      const activePaintLayerId = this.resolvePaintLayerId?.();

      currentLayerIds.add("background");

      if (activePaintLayerId) {
        currentLayerIds.add(activePaintLayerId);
      }

      return currentLayerIds;
    }
,

    syncActivePaintLayerReference() {
      const activePaintLayerId = this.resolvePaintLayerId?.();

      if (!activePaintLayerId || !this.rasterTargetsByLayerId) {
        return activePaintLayerId || "";
      }

      if (this.paintLayerId === activePaintLayerId) {
        return activePaintLayerId;
      }

      const previousTarget = this.paintLayerId
        ? this.rasterTargetsByLayerId.get(this.paintLayerId)
        : null;
      const nextTarget = this.rasterTargetsByLayerId.get(activePaintLayerId);

      this.paintLayerId = activePaintLayerId;

      if (this.isSparseRasterTarget(nextTarget)) {
        this.texture = null;
        this.framebuffer = null;
        return activePaintLayerId;
      }

      if (nextTarget?.texture && nextTarget?.framebuffer) {
        nextTarget.layerId = activePaintLayerId;
        this.texture = nextTarget.texture;
        this.framebuffer = nextTarget.framebuffer;
        this.updateRasterTargetResourceMetadata?.(nextTarget, {
          kind: "paintTarget",
          label: "main paint raster target",
          layerId: activePaintLayerId,
          ownerId: activePaintLayerId,
          ownerType: "live",
          purgeable: false,
          reason: "sync-active-paint-layer",
        });
      } else if (previousTarget?.texture && previousTarget.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      return activePaintLayerId;
    }
,

    reconcileRasterTargetResourceOwnership() {
      if (this.isDisposed || !this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let updatedCount = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (!target) {
          continue;
        }

        const isLiveTarget = currentLayerIds.has(layerId) || (target.texture && target.texture === this.texture);
        const isHistoryTarget = historyLayerIds.has(layerId);

        if (!isLiveTarget && !isHistoryTarget) {
          continue;
        }

        target.layerId = layerId;

        if (isLiveTarget) {
          const isPaintTarget = layerId !== "background" && this.isPaintRasterLayer(layerId, target);
          const kind = layerId === "background" ? "background" : isPaintTarget ? "paintTarget" : "layer";
          const keepColdForArtboard = this.isArtboardResidencyEnabled() &&
            target.state === "CPU_COLD" &&
            this.isLayerInColdArtboard(layerId);

          if (keepColdForArtboard) {
            this.updateRasterTargetResourceMetadata?.(target, {
              kind,
              label: layerId,
              layerId,
              ownerId: layerId,
              ownerType: "liveCpuCold",
              purgeable: true,
              reason: "artboard-residency-cold-live",
              state: "CPU_COLD",
            });
            updatedCount += 1;
            continue;
          }

          if ((!target.texture || !target.framebuffer) && target.state === "CPU_COLD") {
            this.hydrateRasterTarget(target, {
              kind,
              label: layerId,
              layerId,
              ownerId: layerId,
              ownerType: "live",
              purgeable: false,
              reason: "history-retained-layer-target-hydrate",
            });
          }

          this.updateRasterTargetResourceMetadata?.(target, {
            kind,
            label: layerId,
            layerId,
            ownerId: layerId,
            ownerType: "live",
            purgeable: false,
            reason: "raster-target-live",
          });
          updatedCount += 1;
          continue;
        }

        if (target.state === "CPU_COLD") {
          updatedCount += 1;
          continue;
        }

        if (this.needsCopyOnWriteDetach(target)) {
          updatedCount += 1;
          continue;
        }

        if (this.dehydrateRasterTarget(target, {
          layerId,
          reason: "history-retained-layer-target",
        })) {
          updatedCount += 1;
          continue;
        }

        this.updateRasterTargetResourceMetadata?.(target, {
          kind: "historyLayerTarget",
          label: layerId,
          layerId,
          ownerId: layerId,
          ownerType: "historyGpu",
          purgeable: true,
          reason: "history-retained-layer-target",
          state: "GPU_HOT",
        });
        updatedCount += 1;
      }

      return updatedCount;
    }
,

    getHistoryColdRasterTargetBytes() {
      if (!this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let total = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (
          currentLayerIds.has(layerId) ||
          !historyLayerIds.has(layerId) ||
          target?.state !== "CPU_COLD"
        ) {
          continue;
        }

        total += Math.max(
          0,
          Math.round(Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(target)),
        );
      }

      return total;
    }
,

    getRasterTargetCpuRawBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetCpuRawBytes(tile);
        });

        return total;
      }

      return Math.max(
        0,
        Math.round(Number(target.cpuRawBytes) || Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(target)),
      );
    }
,

    getHistoryColdRasterTargetRawBytes() {
      if (!this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let total = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (
          currentLayerIds.has(layerId) ||
          !historyLayerIds.has(layerId) ||
          target?.state !== "CPU_COLD"
        ) {
          continue;
        }

        total += this.getRasterTargetCpuRawBytes(target);
      }

      return total;
    }
,

    getRetainedRasterTargetLayerIds() {
      const retainedLayerIds = this.getCurrentRasterTargetLayerIds();

      this.collectHistoryLayerIds(retainedLayerIds);

      return retainedLayerIds;
    }
,

    pruneOrphanRasterTargets() {
      if (this.isDisposed || !this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      this.syncActivePaintLayerReference();

      const retainedLayerIds = this.getRetainedRasterTargetLayerIds();
      let prunedCount = 0;

      for (const layerId of Array.from(this.rasterTargetsByLayerId.keys())) {
        const target = this.rasterTargetsByLayerId.get(layerId);

        if (retainedLayerIds.has(layerId) || (target?.texture && target.texture === this.texture)) {
          continue;
        }

        if (this.deleteRasterTarget(layerId, { emit: false })) {
          prunedCount += 1;
        }
      }

      this.reconcileRasterTargetResourceOwnership();

      return prunedCount;
    }

    });
  };
})(window.CBO = window.CBO || {});
