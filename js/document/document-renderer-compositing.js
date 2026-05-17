(function registerCompositing(namespace) {
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

  namespace.DocumentRendererMixins.compositing = function installRegisterCompositing(DocumentRenderer, internals) {
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
    getLayerOpacity(layerId, layers = this.getRenderableLayers()) {
      const layer = Array.isArray(layers)
        ? layers.find((entry) => entry?.id === layerId)
        : null;

      return Number.isFinite(layer?.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
    }
,

    normalizeArtboardDragLayerIds(layerIds = []) {
      return new Set((Array.isArray(layerIds) ? layerIds : [])
        .map((layerId) => String(layerId || "").trim())
        .filter(Boolean));
    }
,

    beginArtboardDragPreview(options = {}) {
      const artboardId = String(options.artboardId || "").trim();

      if (!artboardId) {
        return false;
      }

      this.artboardDragPreview = {
        artboardId,
        dx: 0,
        dy: 0,
        layerIds: this.normalizeArtboardDragLayerIds(options.layerIds),
        startArtboardRect: options.startArtboardRect ? { ...options.startArtboardRect } : null,
      };

      return true;
    }
,

    setArtboardDragPreview(options = {}) {
      const artboardId = String(options.artboardId || "").trim();

      if (!this.artboardDragPreview || this.artboardDragPreview.artboardId !== artboardId) {
        return this.beginArtboardDragPreview(options) && this.setArtboardDragPreview(options);
      }

      const dx = Number(options.dx);
      const dy = Number(options.dy);

      this.artboardDragPreview.dx = Number.isFinite(dx) ? dx : 0;
      this.artboardDragPreview.dy = Number.isFinite(dy) ? dy : 0;

      if (Array.isArray(options.layerIds)) {
        this.artboardDragPreview.layerIds = this.normalizeArtboardDragLayerIds(options.layerIds);
      }

      return true;
    }
,

    clearArtboardDragPreview(artboardId = "") {
      const normalizedArtboardId = String(artboardId || "").trim();

      if (!this.artboardDragPreview) {
        return false;
      }

      if (normalizedArtboardId && this.artboardDragPreview.artboardId !== normalizedArtboardId) {
        return false;
      }

      this.artboardDragPreview = null;
      return true;
    }
,

    hasArtboardDragPreview() {
      return Boolean(
        this.artboardDragPreview &&
        (this.artboardDragPreview.dx !== 0 || this.artboardDragPreview.dy !== 0)
      );
    }
,

    getArtboardDragOffsetForLayer(layer) {
      const preview = this.artboardDragPreview;

      if (!preview || !layer?.id || layer.artboardId !== preview.artboardId) {
        return null;
      }

      if (preview.layerIds.size > 0 && !preview.layerIds.has(layer.id)) {
        return null;
      }

      if (preview.dx === 0 && preview.dy === 0) {
        return null;
      }

      return {
        dx: preview.dx,
        dy: preview.dy,
      };
    }
,

    offsetDocumentRect(rect, dx = 0, dy = 0) {
      if (!rect) {
        return null;
      }

      return {
        height: rect.height,
        width: rect.width,
        x: rect.x + dx,
        y: rect.y + dy,
      };
    }
,

    getArtboardDragVisualRect(layer, rect = null, layerTarget = null) {
      const offset = this.getArtboardDragOffsetForLayer(layer);

      if (!offset) {
        return rect;
      }

      const baseRect = rect || this.getRasterTargetDocumentRect(layerTarget);

      return this.offsetDocumentRect(baseRect, offset.dx, offset.dy);
    }
,

    getLayerArtboardRect(layer) {
      if (this.options?.isolateDocumentArtboards) {
        return null;
      }

      const explicitArtboardId = String(layer?.artboardId || "").trim();
      const inferredArtboardId = !explicitArtboardId && layer?.id
        ? String(this.layerModel?.findEntryArtboardId?.(layer.id) || "").trim()
        : "";
      const artboardId = explicitArtboardId || inferredArtboardId;

      if (!artboardId) {
        return null;
      }

      const rect = namespace.getDocumentArtboardRect?.(artboardId);

      if (!rect) {
        return null;
      }

      return {
        height: Math.max(1, Math.round(Number(rect.height) || 1)),
        width: Math.max(1, Math.round(Number(rect.width) || 1)),
        x: Math.round(Number(rect.x) || 0),
        y: Math.round(Number(rect.y) || 0),
      };
    }
,

    getLayerArtboardVisualRect(layer) {
      const rect = this.getLayerArtboardRect(layer);
      const offset = this.getArtboardDragOffsetForLayer(layer);

      return rect && offset
        ? this.offsetDocumentRect(rect, offset.dx, offset.dy)
        : rect;
    }
,

    isPointInsideLayerArtboard(layer, x, y, padding = 0) {
      const rect = this.getLayerArtboardRect(layer);
      const safePadding = Math.max(0, Number(padding) || 0);

      if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) {
        return true;
      }

      return (
        x >= rect.x - safePadding &&
        y >= rect.y - safePadding &&
        x <= rect.x + rect.width + safePadding &&
        y <= rect.y + rect.height + safePadding
      );
    }
,

    offsetFiniteValue(value, delta = 0) {
      const number = Number(value);

      return Number.isFinite(number) ? number + delta : value;
    }
,

    getArtboardDragVisualLayer(layer) {
      const offset = this.getArtboardDragOffsetForLayer(layer);

      if (!offset || !layer?.puppet || !Array.isArray(layer.puppet.pins)) {
        return layer;
      }

      return {
        ...layer,
        puppet: {
          ...layer.puppet,
          pins: layer.puppet.pins.map((pin) => ({
            ...pin,
            restX: this.offsetFiniteValue(pin.restX, offset.dx),
            restY: this.offsetFiniteValue(pin.restY, offset.dy),
            x: this.offsetFiniteValue(pin.x, offset.dx),
            y: this.offsetFiniteValue(pin.y, offset.dy),
          })),
        },
      };
    }
,

    createClipBaseForLayer(layer, target, visible = true, options = {}) {
      const offset = this.getArtboardDragOffsetForLayer(layer);
      const targetRect = offset ? this.getRasterTargetDocumentRect(target) : null;

      return {
        layer,
        target,
        transformPreview: options.transformPreview || null,
        visible,
        visualX: targetRect ? targetRect.x + offset.dx : undefined,
        visualY: targetRect ? targetRect.y + offset.dy : undefined,
      };
    }
,

    getClipBaseOrigin(clipBase) {
      return {
        x: Number.isFinite(clipBase?.visualX)
          ? clipBase.visualX
          : Number.isFinite(clipBase?.target?.x)
            ? clipBase.target.x
            : 0,
        y: Number.isFinite(clipBase?.visualY)
          ? clipBase.visualY
          : Number.isFinite(clipBase?.target?.y)
            ? clipBase.target.y
            : 0,
      };
    }
,

    getClipBaseTransformSampling(clipBase) {
      const preview = clipBase?.transformPreview;
      const transformMode = String(preview?.transformMode || "free").trim().toLowerCase();

      if (
        !preview?.texture ||
        transformMode === "warp" ||
        !Array.isArray(preview.quad)
      ) {
        return null;
      }

      const matrix = this.computeDestToSourceUvHomography(preview.quad);

      if (!matrix) {
        return null;
      }

      return {
        matrix,
        sourceUvRect: this.normalizeTextureSourceUvRect(preview.sourceUvRect),
        texture: preview.texture,
      };
    }
,

    hasClipBaseSamplingTexture(clipBase) {
      return Boolean(
        clipBase?.target?.texture ||
        this.getClipBaseTransformSampling(clipBase)?.texture
      );
    }
,

    getLayerBlendModeId(layer) {
      return namespace.BlendModes?.getLayerBlendModeId?.(layer?.blendMode) || 0;
    }
,

    hasAdvancedLayerBlendMode(layer) {
      return this.getLayerBlendModeId(layer) !== 0;
    }
,

    hasAnyAdvancedLayerBlendModes(layers = this.getOrderedLayersBottomToTop()) {
      return Array.isArray(layers) && layers.some((layer) => this.hasAdvancedLayerBlendMode(layer));
    }
,

    ensureLayerCompositeTargets(width, height) {
      const targetWidth = Math.max(1, Math.round(width || 1));
      const targetHeight = Math.max(1, Math.round(height || 1));
      const hasTargets =
        this.layerCompositeScratchA?.texture &&
        this.layerCompositeScratchA?.framebuffer &&
        this.layerCompositeScratchB?.texture &&
        this.layerCompositeScratchB?.framebuffer &&
        this.layerCompositeWidth === targetWidth &&
        this.layerCompositeHeight === targetHeight;

      if (hasTargets) {
        this.markRasterResourceUsed(this.layerCompositeScratchA.texture);
        this.markRasterResourceUsed(this.layerCompositeScratchB.texture);
        return [this.layerCompositeScratchA, this.layerCompositeScratchB];
      }

      this.deleteLayerCompositeTargets();

      this.layerCompositeScratchA = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
        kind: "compositeScratch",
        label: "layer composite ping",
        ownerId: "layer-composite-ping",
        reason: "create-layer-composite-target",
      });
      this.layerCompositeScratchB = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
        kind: "compositeScratch",
        label: "layer composite pong",
        ownerId: "layer-composite-pong",
        reason: "create-layer-composite-target",
      });
      this.layerCompositeWidth = targetWidth;
      this.layerCompositeHeight = targetHeight;

      return [this.layerCompositeScratchA, this.layerCompositeScratchB];
    }
,

    deleteLayerCompositeTargets() {
      this.deleteLayerEffectTarget(this.layerCompositeScratchA);
      this.deleteLayerEffectTarget(this.layerCompositeScratchB);
      this.layerCompositeScratchA = null;
      this.layerCompositeScratchB = null;
      this.layerCompositeWidth = 0;
      this.layerCompositeHeight = 0;
    }
,

    deleteLayerCompositeResources() {
      const gl = this.gl;

      if (this.layerCompositeProgramInfo?.program) {
        gl.deleteProgram(this.layerCompositeProgramInfo.program);
        this.layerCompositeProgramInfo = null;
      }

      this.deleteLayerCompositeTargets();
    }
,

    beginLayerComposite(width, height) {
      const [read, write] = this.ensureLayerCompositeTargets(width, height);
      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, read.framebuffer);
      gl.viewport(0, 0, read.width, read.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        height: read.height,
        read,
        width: read.width,
        write,
      };
    }
,

    swapLayerComposite(compositeState) {
      return {
        ...compositeState,
        read: compositeState.write,
        write: compositeState.read,
      };
    }
,

    setLayerCompositeMaskClipUniforms(uniforms, clipRect = null, clipRects = null) {
      const gl = this.gl;
      const rects = Array.isArray(clipRects)
        ? clipRects.slice(0, 32)
        : [];

      if (rects.length > 0) {
        const values = new Float32Array(32 * 4);

        rects.forEach((rect, index) => {
          values[index * 4] = rect.x;
          values[index * 4 + 1] = rect.y;
          values[index * 4 + 2] = rect.width;
          values[index * 4 + 3] = rect.height;
        });

        gl.uniform1f(uniforms.maskClipMode, 1.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniforms.maskClipRectCount, rects.length);
        gl.uniform4fv(uniforms.maskClipRects, values);
        return;
      }

      if (clipRect) {
        gl.uniform1f(uniforms.maskClipMode, 1.0);
        gl.uniform4f(uniforms.maskClipRect, clipRect.x, clipRect.y, clipRect.width, clipRect.height);
        gl.uniform1i(uniforms.maskClipRectCount, 0);
        return;
      }

      gl.uniform1f(uniforms.maskClipMode, 0.0);
      gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
      gl.uniform1i(uniforms.maskClipRectCount, 0);
    }
,

    drawLayerCompositeTexture(options = {}) {
      const sourceTexture = options.texture;
      const backdropTexture = options.backdropTexture;

      if (!sourceTexture || !backdropTexture || !options.framebuffer) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureLayerCompositeProgramInfo();
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || 1));
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const rect = options.rect || {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(options.documentWidth || this.width || 1)),
        height: Math.max(1, Math.round(options.documentHeight || this.height || 1)),
      };
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const blendModeId = Math.max(0, Math.round(Number(options.blendModeId) || 0));
      const clipBase = options.clipBase || null;
      const maskTexture = options.maskTexture || null;
      const maskRect = options.maskRect || null;
      const previewCutRect = options.previewCutRect || null;
      const textureMagFilter = Number.isFinite(options.textureMagFilter)
        ? options.textureMagFilter
        : this.getViewportTextureMagFilter(camera);
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("layer-composite.draw", {
        blendModeId,
        hasClipBase: this.hasClipBaseSamplingTexture(clipBase),
        hasMask: Boolean(maskTexture),
        sourceHeight: Math.max(1, Math.round(rect.height || 1)),
        sourceWidth: Math.max(1, Math.round(rect.width || 1)),
        viewportHeight,
        viewportWidth,
      }) : null;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform4f(uniforms.sourceRect, rect.x, rect.y, rect.width, rect.height);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1i(uniforms.backdropTexture, 3);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.blendMode, blendModeId);

      if (maskTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        gl.uniform1f(uniforms.maskMode, 1.0);

        if (maskRect) {
          gl.uniform1f(uniforms.maskRectMode, 1.0);
          gl.uniform4f(uniforms.maskRect, maskRect.x, maskRect.y, maskRect.width, maskRect.height);
        } else {
          gl.uniform1f(uniforms.maskRectMode, 0.0);
          gl.uniform4f(uniforms.maskRect, 0, 0, rect.width, rect.height);
        }

        this.setLayerCompositeMaskClipUniforms(uniforms, options.maskClipRect, options.maskClipRects);
      } else {
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, rect.width, rect.height);
        this.setLayerCompositeMaskClipUniforms(uniforms);
      }

      const didBindClipTexture = this.setClipBaseUniforms(uniforms, clipBase, {
        fallbackHeight: this.height,
        fallbackWidth: this.width,
        textureMagFilter,
        textureUnit: 2,
      });

      if (previewCutRect) {
        gl.uniform1f(uniforms.previewCutMode, 1.0);
        gl.uniform4f(
          uniforms.previewCutRect,
          previewCutRect.x,
          previewCutRect.y,
          previewCutRect.width,
          previewCutRect.height,
        );
      } else {
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      }

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
      gl.activeTexture(gl.TEXTURE0);
      this.setRasterTextureSampling(sourceTexture, gl.LINEAR, textureMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      if (maskTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      this.clearClipBaseTexture(2, didBindClipTexture);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(null);

      trace?.end();

      return true;
    }
,

    drawScreenTexture(texture, options = {}) {
      if (!texture || !this.programInfo || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.programInfo;
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);

      if (options.blend === false) {
        gl.disable(gl.BLEND);
      } else {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, 0, 0);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1i(uniforms.selectionClipTexture, 3);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, viewportWidth, viewportHeight);
      gl.uniform1f(uniforms.maskClipMode, 0.0);
      gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
      gl.uniform1i(uniforms.maskClipRectCount, 0);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipOrigin, 0, 0);
      gl.uniform2f(uniforms.clipTextureSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.drawOrigin, 0, 0);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.selectionClipMode, 0.0);
      gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }
,

    getArtboardBackgroundRenderRects() {
      const artboards = namespace.getDocumentArtboards?.();

      if (Array.isArray(artboards) && artboards.length > 0) {
        return artboards
          .map((artboard) => ({
            height: Math.max(1, Math.round(Number(artboard.height) || 1)),
            width: Math.max(1, Math.round(Number(artboard.width) || 1)),
            x: Math.round(Number(artboard.x) || 0),
            y: Math.round(Number(artboard.y) || 0),
          }))
          .filter((rect) => rect.width > 0 && rect.height > 0);
      }

      return [{
        height: Math.max(1, Math.round(this.height || 1)),
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      }];
    }
,

    isProceduralBackgroundLayerTarget(layer, layerTarget) {
      return Boolean(
        layerTarget?.procedural === true &&
        (layerTarget.layerId === "background" || layer?.id === "background" || layer?.type === "background")
      );
    }
,

    getProceduralBackgroundRenderResults(layer, layerTarget, options = {}) {
      if (!layerTarget?.texture) {
        return [];
      }

      if (this.options.cssArtboardPaper === true) {
        return [];
      }

      const renderRect = options.renderRect || null;
      const cullingStats = options.cullingStats || null;
      const renderRects = this.getArtboardBackgroundRenderRects();
      const layerArtboardId = String(layer?.artboardId || "").trim();
      const scopedRects = (() => {
        if (!layerArtboardId) {
          return renderRects;
        }

        const artboards = namespace.getDocumentArtboards?.();
        const artboardIndex = Array.isArray(artboards)
          ? artboards.findIndex((artboard, index) => {
              const artboardId = String(artboard?.id || (index === 0 ? "active-document" : `artboard-${index + 1}`));

              return artboardId === layerArtboardId;
            })
          : -1;

        if (artboardIndex >= 0 && renderRects[artboardIndex]) {
          return [renderRects[artboardIndex]];
        }

        return layerArtboardId === "active-document" && renderRects[0]
          ? [renderRects[0]]
          : [];
      })();

      const visibleRects = [];

      scopedRects.forEach((rect) => {
        const isVisible = !renderRect || this.documentRectsIntersect(rect, renderRect);

        if (cullingStats?.artboardBackgrounds) {
          cullingStats.artboardBackgrounds.tested += 1;
          if (isVisible) {
            cullingStats.artboardBackgrounds.drawn += 1;
          } else {
            cullingStats.artboardBackgrounds.skippedOutsideRenderRect += 1;
          }
        }

        if (isVisible) {
          visibleRects.push(rect);
        }
      });

      return visibleRects.map((rect) => ({
        height: rect.height,
        rect,
        texture: layerTarget.texture,
        width: rect.width,
      }));
    }
,

    getLayerRenderResult(layer, layerTarget, options = {}) {
      if (!layerTarget?.texture) {
        return null;
      }

      const skipLayerEffects = options.skipLayerEffects === true;
      const targetRect = this.getRasterTargetDocumentRect(layerTarget);
      let width = Math.max(1, Math.round(layerTarget.width || this.width || 1));
      let height = Math.max(1, Math.round(layerTarget.height || this.height || 1));
      let rect = this.isCroppedRasterTarget(layerTarget) ? targetRect : null;
      let texture = layerTarget.texture;
      const paddedRect = !skipLayerEffects && this.isCroppedRasterTarget(layerTarget)
        ? this.getLayerEffectOutputRect(layer, targetRect)
        : targetRect;

      if (paddedRect && !this.areDocumentRectsEqual(paddedRect, targetRect)) {
        const paddedSource = this.createLayerEffectPaddedSource(texture, targetRect, paddedRect);

        if (paddedSource?.texture) {
          texture = paddedSource.texture;
          width = paddedSource.width;
          height = paddedSource.height;
          rect = paddedSource.rect;
        }
      }

      if (!skipLayerEffects) {
        texture = this.applyLayerEffectsToTexture(layer, texture, { height, rect, sourceRect: targetRect, width });
      }

      return {
        height,
        rect,
        texture,
        width,
      };
    }
,

    getLayerRenderResults(layer, layerTarget, options = {}) {
      const cullingStats = options.cullingStats || null;

      if (this.isProceduralBackgroundLayerTarget(layer, layerTarget)) {
        const results = this.getProceduralBackgroundRenderResults(layer, layerTarget, options);

        if (cullingStats?.renderResults) {
          cullingStats.renderResults.returned += results.length;
        }

        return results;
      }

      if (this.isSparseRasterTarget(layerTarget)) {
        const renderRect = options.cullSparseTiles === true
          ? options.renderRect
          : null;
        const tileTargets = Array.from(layerTarget.tiles.values());
        const visibleTileTargets = [];

        tileTargets.forEach((tileTarget) => {
          if (cullingStats?.sparseTiles) {
            cullingStats.sparseTiles.tested += 1;
          }

          if (!tileTarget?.texture) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.missingTexture += 1;
            }
            return;
          }

          if (!renderRect) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.uncullable += options.cullSparseTiles === true ? 0 : 1;
              cullingStats.sparseTiles.drawn += 1;
            }
            visibleTileTargets.push(tileTarget);
            return;
          }

          const tileRect = this.getRasterTargetDocumentRect(tileTarget);

          if (this.documentRectsIntersect(tileRect, renderRect)) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.drawn += 1;
            }
            visibleTileTargets.push(tileTarget);
          } else if (cullingStats?.sparseTiles) {
            cullingStats.sparseTiles.skippedOutsideRenderRect += 1;
          }
        });

        const results = visibleTileTargets
          .sort((first, second) => (first.ty - second.ty) || (first.tx - second.tx))
          .map((tileTarget) => this.getLayerRenderResult(layer, tileTarget, options))
          .filter(Boolean);

        if (cullingStats?.renderResults) {
          cullingStats.renderResults.returned += results.length;
        }

        return results;
      }

      const result = this.getLayerRenderResult(layer, layerTarget, options);

      if (result && cullingStats?.renderResults) {
        cullingStats.renderResults.returned += 1;
      }

      return result ? [result] : [];
    }
,

    hasRenderableRasterTarget(layerTarget) {
      return Boolean(
        layerTarget?.texture ||
        (this.isSparseRasterTarget(layerTarget) && layerTarget.tiles.size > 0)
      );
    }
,

    hasLayerPendingRasterContent(layer) {
      if (!layer || layer.visible === false || layer.type !== "image") {
        return false;
      }

      const rawWidth = Number(layer.imageBounds?.width);
      const rawHeight = Number(layer.imageBounds?.height);

      if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
        return false;
      }

      const bounds = this.getUnclampedDocumentRect(layer.imageBounds);

      return Boolean(bounds && bounds.width > 0 && bounds.height > 0);
    }
,

    hasLayerRenderableOrPendingRasterContent(layer) {
      if (!layer?.id) {
        return false;
      }

      return Boolean(
        this.hasRenderableRasterTarget(this.rasterTargetsByLayerId.get(layer.id)) ||
        this.hasLayerPendingRasterContent(layer)
      );
    }
,

    needsSingleTextureLayerTarget(layer, layerTarget, options = {}) {
      return Boolean(
        this.isSparseRasterTarget(layerTarget) &&
        (
          options.forceSingleTexture === true ||
          this.hasPuppetLayerTransform(layer) ||
          (!options.skipLayerEffects && this.hasEnabledLayerEffects(layer))
        )
      );
    }
,

    getRenderableLayerTarget(layer, layerTarget, options = {}) {
      if (layer?.type === "background" && !layerTarget?.texture) {
        return this.rasterTargetsByLayerId.get("background") || layerTarget;
      }

      if (!this.needsSingleTextureLayerTarget(layer, layerTarget, options)) {
        return layerTarget;
      }

      return this.materializeRasterTarget(layer.id, {
        emit: false,
        source: options.source || "sparse-layer-render-materialize",
      }) || layerTarget;
    }
,

    getLayerRenderTexture(layer, layerTarget, options = {}) {
      return this.getLayerRenderResult(layer, layerTarget, options)?.texture || null;
    }
,

    resolveLayerVisualTexture(layer, layerTarget, options = {}) {
      return this.getLayerRenderTexture(layer, layerTarget, options);
    }
,

    getPuppetVisualTarget(layerTarget, renderResult) {
      if (!layerTarget || !renderResult?.texture || !renderResult.rect) {
        return layerTarget;
      }

      return {
        ...layerTarget,
        cropped: this.isCroppedRect(renderResult.rect),
        height: renderResult.height,
        texture: renderResult.texture,
        width: renderResult.width,
        x: renderResult.rect.x,
        y: renderResult.rect.y,
      };
    }
,

    copyTextureToRasterTarget(sourceTexture, target, options = {}) {
      if (!sourceTexture || !target?.framebuffer || !target?.texture) {
        return false;
      }

      const gl = this.gl;
      const readFramebuffer = gl.createFramebuffer();
      const sourceWidth = Math.max(1, Math.round(options.width || target.width || this.width || 1));
      const sourceHeight = Math.max(1, Math.round(options.height || target.height || this.height || 1));

      if (!readFramebuffer) {
        return false;
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sourceTexture, 0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);

      const canCopy =
        gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE &&
        gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

      if (canCopy) {
        gl.blitFramebuffer(
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          target.width,
          target.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.deleteFramebuffer(readFramebuffer);

      return canCopy;
    }
,

    drawToCanvas(options = {}) {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;
      const target = this.getDocumentDrawTarget();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const viewportRenderOverscanCssPx = this.getViewportRenderOverscanCssPx(options);
      const viewportVisibleDocRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const viewportRenderRect = this.getViewportRenderRect(
        camera,
        viewportWidth,
        viewportHeight,
        viewportRenderOverscanCssPx,
      );
      const { program, uniforms } = this.programInfo;
      const activeStrokeLayerId = options.activeStrokeLayerId || target.layerId;
      const activeStrokeMode = String(options.activeStrokeMode || "paint").toLowerCase();
      const activeStrokeRect = options.activeStrokeRect || null;
      const activeStrokeClipRects = Array.isArray(options.activeStrokeClipRects) && activeStrokeRect
        ? options.activeStrokeClipRects
            .map((rect) => this.intersectRasterHistoryRects?.(rect, activeStrokeRect))
            .filter(Boolean)
        : null;
      const activeStrokeHasClip = Boolean(
        activeStrokeRect &&
        (
          options.activeStrokeClipRect ||
          activeStrokeClipRects
        )
      );
      const activeStrokeClipRect = activeStrokeHasClip
        ? this.intersectRasterHistoryRects?.(options.activeStrokeClipRect, activeStrokeRect)
        : null;
      const rasterTransformPreview = this.rasterTransformPreview?.texture
        ? this.rasterTransformPreview
        : null;
      const hasArtboardDragPreview = this.hasArtboardDragPreview();
      const staticViewportRenderRect = hasArtboardDragPreview ? null : viewportRenderRect;
      const vectorTextTransformPreviewLayerId = this.vectorTextTransformPreviewLayerId || "";
      const hasActiveEraserStroke = Boolean(options.activeStrokeTexture && activeStrokeMode === "eraser");
      const activeStrokeSelectionMask = hasActiveEraserStroke
        ? options.activeStrokeSelectionMask
        : null;
      const activeStrokeSelectionClipTexture = activeStrokeSelectionMask
        ? this.getActiveStrokeSelectionClipTexture(activeStrokeSelectionMask)
        : null;

      if (!activeStrokeSelectionMask) {
        this.deleteActiveStrokeSelectionClipTexture();
      }

      const orderedLayers = this.getOrderedLayersBottomToTop();
      const artboardResidency = this.resolveAndPublishArtboardResidency({
        activeLayerId: activeStrokeLayerId,
        camera,
        dpr: options.dpr,
        renderRect: viewportRenderRect,
        viewportHeight,
        viewportRect: {
          dpr: options.dpr,
          overscanCssPx: viewportRenderOverscanCssPx,
          renderRect: viewportRenderRect,
          visibleRect: viewportVisibleDocRect,
          zoom: camera.zoom || 1,
        },
        viewportWidth,
        visibleRect: viewportVisibleDocRect,
      });
      const artboardFlatPreviewFallbackIds = this.getArtboardFlatPreviewFallbackIds(artboardResidency, orderedLayers, {
        activeStrokeTexture: Boolean(options.activeStrokeTexture),
      });
      const deferInteractiveResidencyHydration = Boolean(
        options.activeStrokeTexture ||
        options.deferPreviewCacheUpdate === true
      );
      const artboardResidencyHydrated = deferInteractiveResidencyHydration
        ? 0
        : this.hydrateHotArtboardTargets(artboardResidency, orderedLayers, {
            renderRect: viewportRenderRect,
            reason: "draw-to-canvas-artboard-residency",
            skipArtboardIds: artboardFlatPreviewFallbackIds,
          });
      const artboardResidencyMetrics = this.collectArtboardResidencyMetrics(artboardResidency, orderedLayers, {
        camera,
        dpr: options.dpr,
      });
      const renderableLayers = orderedLayers.filter((layer) => layer.visible !== false);
      const hasClippingMasks = orderedLayers.some((layer) => layer?.clippingMask === true);
      const isValidClipBaseLayer = (layer) => Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );
      const needsClipBaseTexture = (layer) => Boolean(
        layer?.visible !== false &&
        (
          this.hasLayerRenderableOrPendingRasterContent(layer) ||
          (
            options.activeStrokeTexture &&
            activeStrokeMode !== "eraser" &&
            layer?.id === activeStrokeLayerId
          )
        )
      );
      const clipBaseLayerIds = new Set();
      let pendingClipBaseLayer = null;

      orderedLayers.forEach((layer) => {
        if (layer?.clippingMask === true) {
          if (pendingClipBaseLayer?.id && needsClipBaseTexture(pendingClipBaseLayer)) {
            clipBaseLayerIds.add(pendingClipBaseLayer.id);
          }
        } else {
          pendingClipBaseLayer = isValidClipBaseLayer(layer) ? layer : null;
        }
      });
      const activeStrokeLayerIndex = renderableLayers.findIndex((layer) => layer?.id === activeStrokeLayerId);
      const activeStrokeLayer = activeStrokeLayerIndex >= 0 ? renderableLayers[activeStrokeLayerIndex] : null;
      const activeStrokeLayerHasBlendMode = Boolean(activeStrokeLayer && this.hasAdvancedLayerBlendMode(activeStrokeLayer));
      const activeStrokeLayerHasEffects = Boolean(activeStrokeLayer && this.hasEnabledLayerEffects(activeStrokeLayer));
      const activeStrokeIsClipBaseLayer = Boolean(
        options.activeStrokeTexture &&
        activeStrokeLayer &&
        clipBaseLayerIds.has(activeStrokeLayer.id)
      );
      const activeStrokeUsesClippingMask = Boolean(
        options.activeStrokeTexture &&
        hasClippingMasks &&
        (
          activeStrokeLayer?.clippingMask === true ||
          activeStrokeIsClipBaseLayer
        )
      );
      const activeStrokeDefersLayerEffects = Boolean(
        options.activeStrokeTexture &&
        options.deferPreviewCacheUpdate === true &&
        activeStrokeLayerHasEffects
      );
      const activeStrokeDefersLayerBlend = Boolean(
        options.activeStrokeTexture &&
        options.deferPreviewCacheUpdate === true &&
        activeStrokeLayerHasBlendMode
      );
      const activeStrokeLayerUsesAdvancedCompositing = Boolean(
        activeStrokeLayer &&
        (
          (!activeStrokeDefersLayerBlend && activeStrokeLayerHasBlendMode) ||
          (!activeStrokeDefersLayerEffects && activeStrokeLayerHasEffects) ||
          this.hasPuppetLayerTransform(activeStrokeLayer)
        )
      );
      const activeStrokeNeedsFullStack = Boolean(
        options.activeStrokeTexture &&
        activeStrokeMode !== "eraser" &&
        activeStrokeLayer &&
        (
          activeStrokeLayerUsesAdvancedCompositing ||
          activeStrokeUsesClippingMask
        )
      );
      const activeStrokeNeedsScratchMerge = Boolean(
        options.activeStrokeTexture &&
        activeStrokeMode !== "eraser" &&
        activeStrokeLayer &&
        (
          (!activeStrokeHasClip && activeStrokeLayerUsesAdvancedCompositing) ||
          activeStrokeIsClipBaseLayer
        )
      );
      const activeStrokeScratchClipRects = activeStrokeClipRects?.length
        ? activeStrokeClipRects
        : activeStrokeClipRect
          ? [activeStrokeClipRect]
          : [];

      if (!activeStrokeNeedsScratchMerge && this.activeStrokeScratchTarget) {
        this.deleteActiveStrokeScratchTarget();
      }
      const activeStrokeCanOverlayPreview = !options.activeStrokeTexture ||
        (
          activeStrokeLayerIndex >= 0 &&
          !activeStrokeNeedsFullStack &&
          !renderableLayers
            .slice(activeStrokeLayerIndex + 1)
            .some((layer) => this.hasRenderableRasterTarget(this.rasterTargetsByLayerId.get(layer.id)))
        );
      const previewCacheOptions = {
        activeStrokeTexture: options.activeStrokeTexture,
        camera,
        deferPreviewCacheUpdate: options.deferPreviewCacheUpdate,
        dpr: options.dpr,
        previewCacheOverscanCssPx: options.previewCacheOverscanCssPx,
        previewCacheScope: options.previewCacheScope,
        viewportHeight,
        viewportWidth,
      };
      const androidZoomOutPreviewCacheAllowed = isAndroidZoomOutPreviewCacheAllowed(previewCacheOptions);

      previewCacheOptions.androidZoomOutPreviewCache = androidZoomOutPreviewCacheAllowed;

      const allowPreviewCache = options.allowPreviewCache === true && !isAndroidPreviewCacheDisabled(previewCacheOptions);
      const previewCacheDimensions = this.getPreviewCacheDimensions(previewCacheOptions);
      const previewCacheDocumentRect = previewCacheDimensions.documentRect;
      const canUsePreviewCacheAtCurrentZoom = this.shouldUsePreviewCacheForCamera(camera, previewCacheDimensions);
      const canUsePreviewCache = Boolean(
        allowPreviewCache &&
        canUsePreviewCacheAtCurrentZoom &&
        !hasArtboardDragPreview &&
        !rasterTransformPreview &&
        !vectorTextTransformPreviewLayerId &&
        !hasActiveEraserStroke &&
        !activeStrokeNeedsFullStack &&
        activeStrokeCanOverlayPreview
      );
      const deferPreviewCacheUpdate = Boolean(
        options.deferPreviewCacheUpdate === true ||
        options.activeStrokeTexture
      );
      const viewportCullingDebug = this.isViewportCullingDebugEnabled(options);
      const viewportLayerCullingEnabled = this.isViewportLayerCullingEnabled(options);
      const viewportLayerCullingMeasured = this.isViewportLayerCullingAuditEnabled(options);
      const viewportCullingStats = this.createViewportCullingStats({
        camera,
        debug: viewportCullingDebug,
        layerCullingEnabled: viewportLayerCullingEnabled,
        layerCullingMeasured: viewportLayerCullingMeasured,
        overscanCssPx: viewportRenderOverscanCssPx,
        renderRect: viewportRenderRect,
        source: "drawToCanvas",
        viewportHeight,
        viewportWidth,
        visibleRect: viewportVisibleDocRect,
      });

      viewportCullingStats.layers.total = orderedLayers.length;
      viewportCullingStats.layers.visible = renderableLayers.length;
      viewportCullingStats.artboardResidency = artboardResidency
        ? {
            activeArtboardId: artboardResidency.activeArtboardId || "",
            cacheArtboardIds: [...(artboardResidency.cacheArtboardIds || [])],
            coldArtboardIds: [...(artboardResidency.coldArtboardIds || [])],
            flatPreviewFallbackArtboardIds: Array.from(artboardFlatPreviewFallbackIds),
            hotArtboardIds: [...(artboardResidency.hotArtboardIds || [])],
            hydratedLayerCount: artboardResidencyHydrated,
            metrics: artboardResidencyMetrics,
            prefetchArtboardIds: [...(artboardResidency.prefetchArtboardIds || [])],
            pressure: artboardResidencyMetrics?.budget?.pressure || "ok",
            visibleArtboardIds: [...(artboardResidency.visibleArtboardIds || [])],
            warmArtboardIds: [...(artboardResidency.warmArtboardIds || [])],
          }
        : null;
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("canvas.draw", {
        activeStrokeDefersLayerBlend,
        activeStrokeDefersLayerEffects,
        activeStroke: Boolean(options.activeStrokeTexture),
        canUsePreviewCache,
        deferPreviewCacheUpdate,
        layers: renderableLayers.length,
        zoom: camera.zoom || 1,
      }) : null;

      try {
      let didDrawActiveStroke = false;
      let currentMaskTexture = null;
      let currentMaskRect = null;
      let currentMaskClipRect = null;
      let currentMaskClipRects = null;
      let currentPreviewCutRect = null;
      let canvasCompositeState = null;
      let preserveCompositeOutsideScissor = false;
      const viewportTextureMagFilter = this.getViewportTextureMagFilter(camera);
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const getViewportScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const zoom = camera.zoom || 1;
        const left = (camera.x || 0) + docRect.x * zoom;
        const top = (camera.y || 0) + docRect.y * zoom;
        const right = (camera.x || 0) + (docRect.x + docRect.width) * zoom;
        const bottom = (camera.y || 0) + (docRect.y + docRect.height) * zoom;
        const clippedLeft = Math.max(0, Math.floor(Math.min(left, right)));
        const clippedTop = Math.max(0, Math.floor(Math.min(top, bottom)));
        const clippedRight = Math.min(viewportWidth, Math.ceil(Math.max(left, right)));
        const clippedBottom = Math.min(viewportHeight, Math.ceil(Math.max(top, bottom)));

        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
          return null;
        }

        return {
          height: clippedBottom - clippedTop,
          width: clippedRight - clippedLeft,
          x: clippedLeft,
          y: viewportHeight - clippedBottom,
        };
      };
      let currentViewportScissor = null;
      const intersectViewportScissors = (first, second) => {
        if (!first || !second) {
          return first || second || null;
        }

        const x0 = Math.max(first.x, second.x);
        const y0 = Math.max(first.y, second.y);
        const x1 = Math.min(first.x + first.width, second.x + second.width);
        const y1 = Math.min(first.y + first.height, second.y + second.height);

        return x1 > x0 && y1 > y0
          ? {
              height: y1 - y0,
              width: x1 - x0,
              x: x0,
              y: y0,
            }
          : null;
      };
      const restoreViewportScissor = (scissor) => {
        currentViewportScissor = scissor;

        if (scissor) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
        } else {
          gl.disable(gl.SCISSOR_TEST);
        }
      };
      const withViewportScissor = (scissor, callback) => {
        if (!scissor) {
          callback();
          return;
        }

        const previousScissor = currentViewportScissor;
        const nextScissor = intersectViewportScissors(previousScissor, scissor);

        if (!nextScissor) {
          return;
        }

        const previousPreserveCompositeOutsideScissor = preserveCompositeOutsideScissor;

        restoreViewportScissor(nextScissor);
        preserveCompositeOutsideScissor = preserveCompositeOutsideScissor || Boolean(canvasCompositeState);
        try {
          callback();
        } finally {
          preserveCompositeOutsideScissor = previousPreserveCompositeOutsideScissor;
          restoreViewportScissor(previousScissor);
        }
      };
      const withLayerArtboardClip = (layer, callback) => {
        const artboardRect = this.getLayerArtboardVisualRect(layer);

        viewportCullingStats.artboardClips.tested += 1;

        if (!artboardRect) {
          viewportCullingStats.artboardClips.drawn += 1;
          callback();
          return;
        }

        if (viewportRenderRect && !this.documentRectsIntersect(artboardRect, viewportRenderRect)) {
          viewportCullingStats.artboardClips.skippedOutsideRenderRect += 1;
          return;
        }

        const artboardScissor = getViewportScissorForDocumentRect(artboardRect);

        if (!artboardScissor) {
          viewportCullingStats.artboardClips.skippedViewportScissor += 1;
          return;
        }

        viewportCullingStats.artboardClips.drawn += 1;
        withViewportScissor(artboardScissor, callback);
      };
      const withAllArtboardClips = (callback) => {
        const allArtboardRects = (namespace.getDocumentArtboards?.() || [])
          .map((artboard) => this.normalizeTransformArtboardRect(artboard))
          .filter(Boolean);

        if (allArtboardRects.length === 0) {
          callback();
          return;
        }

        const artboardRects = staticViewportRenderRect
          ? allArtboardRects.filter((artboardRect) => this.documentRectsIntersect(artboardRect, staticViewportRenderRect))
          : allArtboardRects;

        viewportCullingStats.artboardClips.tested += allArtboardRects.length;

        if (staticViewportRenderRect) {
          viewportCullingStats.artboardClips.skippedOutsideRenderRect += Math.max(0, allArtboardRects.length - artboardRects.length);
        }

        if (artboardRects.length === 0) {
          return;
        }

        artboardRects.forEach((artboardRect) => {
          const artboardScissor = getViewportScissorForDocumentRect(artboardRect);

          if (artboardScissor) {
            viewportCullingStats.artboardClips.drawn += 1;
            withViewportScissor(artboardScissor, callback);
          } else {
            viewportCullingStats.artboardClips.skippedViewportScissor += 1;
          }
        });
      };
      const withActiveStrokeClip = (callback) => {
        const clipRects = activeStrokeClipRects?.length
          ? activeStrokeClipRects
          : activeStrokeClipRect
            ? [activeStrokeClipRect]
            : null;

        if (activeStrokeHasClip && !clipRects?.length) {
          return;
        }

        if (!clipRects) {
          callback();
          return;
        }

        clipRects.forEach((clipRect) => {
          const scissor = getViewportScissorForDocumentRect(clipRect);

          if (!scissor) {
            return;
          }

          withViewportScissor(scissor, callback);
        });
      };
      const setMaskClipUniforms = (uniformSet, clipRect = null, clipRects = null) => {
        const rects = Array.isArray(clipRects)
          ? clipRects.slice(0, 32)
          : [];

        if (rects.length > 0) {
          const values = new Float32Array(32 * 4);

          rects.forEach((rect, index) => {
            values[index * 4] = rect.x;
            values[index * 4 + 1] = rect.y;
            values[index * 4 + 2] = rect.width;
            values[index * 4 + 3] = rect.height;
          });

          gl.uniform1f(uniformSet.maskClipMode, 1.0);
          gl.uniform4f(uniformSet.maskClipRect, 0, 0, 0, 0);
          gl.uniform1i(uniformSet.maskClipRectCount, rects.length);
          gl.uniform4fv(uniformSet.maskClipRects, values);
          return;
        }

        if (clipRect) {
          gl.uniform1f(uniformSet.maskClipMode, 1.0);
          gl.uniform4f(
            uniformSet.maskClipRect,
            clipRect.x,
            clipRect.y,
            clipRect.width,
            clipRect.height,
          );
          gl.uniform1i(uniformSet.maskClipRectCount, 0);
          return;
        }

        gl.uniform1f(uniformSet.maskClipMode, 0.0);
        gl.uniform4f(uniformSet.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniformSet.maskClipRectCount, 0);
      };
      const drawTexture = (texture, opacity, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (camera.x || 0) + rect.x * (camera.zoom || 1),
            (camera.y || 0) + rect.y * (camera.zoom || 1),
          );
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        const didBindClipTexture = this.setClipBaseUniforms(uniforms, clipBase, {
          fallbackHeight: target.height,
          fallbackWidth: target.width,
          textureMagFilter: viewportTextureMagFilter,
          textureUnit: 2,
        });

        if (texture === this.previewTexture) {
          this.setRasterTextureSampling(texture, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
        } else {
          this.setRasterTextureSampling(texture, gl.LINEAR, viewportTextureMagFilter);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.clearClipBaseTexture(2, didBindClipTexture);
      };
      const drawBlendTexture = (texture, opacity, rect = null, clipBase = null, blendModeId = 0) => {
        if (!texture) {
          return;
        }

        if (blendModeId === 0) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (!canvasCompositeState?.read?.texture || !canvasCompositeState?.write?.framebuffer) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (preserveCompositeOutsideScissor) {
          gl.disable(gl.SCISSOR_TEST);
          this.drawScreenTexture(canvasCompositeState.read.texture, {
            blend: false,
            framebuffer: canvasCompositeState.write.framebuffer,
            viewportHeight,
            viewportWidth,
          });
          gl.enable(gl.SCISSOR_TEST);
        }

        this.drawLayerCompositeTexture({
          backdropTexture: canvasCompositeState.read.texture,
          blendModeId,
          camera,
          clipBase,
          documentHeight: target.height,
          documentWidth: target.width,
          framebuffer: canvasCompositeState.write.framebuffer,
          maskClipRect: currentMaskClipRect,
          maskClipRects: currentMaskClipRects,
          maskRect: currentMaskRect,
          maskTexture: currentMaskTexture,
          opacity,
          previewCutRect: currentPreviewCutRect,
          rect,
          texture,
          textureMagFilter: viewportTextureMagFilter,
          viewportHeight,
          viewportWidth,
        });
        canvasCompositeState = this.swapLayerComposite(canvasCompositeState);
        bindArtboardProgram();
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, canvasCompositeState?.read?.framebuffer || null);
        gl.viewport(0, 0, viewportWidth, viewportHeight);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1i(uniforms.selectionClipTexture, 3);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
        gl.uniform1f(uniforms.maskClipMode, 0.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        gl.uniformMatrix3fv(uniforms.clipDestToSourceUv, false, CLIP_IDENTITY_UV_MATRIX);
        gl.uniform4f(uniforms.clipSourceUvRect, 0, 0, 1, 1);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.selectionClipMode, 0.0);
        gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      };
      const drawArtboardFlatPreviewFallbacks = () => {
        if (!artboardFlatPreviewFallbackIds.size) {
          return 0;
        }

        let drawnCount = 0;

        artboardFlatPreviewFallbackIds.forEach((artboardId) => {
          const preview = this.getArtboardFlatPreview(artboardId);
          const scissor = preview ? getViewportScissorForDocumentRect(preview.rect) : null;

          if (!preview?.texture || !scissor) {
            return;
          }

          withViewportScissor(scissor, () => {
            drawTexture(preview.texture, 1, preview.rect);
            drawnCount += 1;
          });
        });

        return drawnCount;
      };
      const setPreviewCut = (rect = null) => {
        currentPreviewCutRect = rect;
        if (rect) {
          gl.uniform1f(uniforms.previewCutMode, 1.0);
          gl.uniform4f(uniforms.previewCutRect, rect.x, rect.y, rect.width, rect.height);
        } else {
          gl.uniform1f(uniforms.previewCutMode, 0.0);
          gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        }
      };
      const drawRasterTransformPreview = (layerOpacity = 1, clipBase = null) => {
        if (!rasterTransformPreview?.texture || !Array.isArray(rasterTransformPreview.quad)) {
          return;
        }

        const drawOptions = {
          camera,
          clipBase,
          edgeFeatherPixels: rasterTransformPreview.edgeFeatherPixels,
          framebuffer: canvasCompositeState?.read?.framebuffer || null,
          opacity: rasterTransformPreview.opacity * layerOpacity,
          sourceUvRect: rasterTransformPreview.sourceUvRect,
          textureFilter: gl.LINEAR,
          viewportHeight,
          viewportWidth,
        };

        withAllArtboardClips(() => {
          if (rasterTransformPreview.transformMode === "warp") {
            this.drawWarpTexturedMesh(
              rasterTransformPreview.texture,
              rasterTransformPreview.warpControlPoints,
              drawOptions,
            );
          } else if (rasterTransformPreview.transformMode === "perspective") {
            this.drawPerspectiveTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
          } else {
            this.drawTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
          }
        });

        bindArtboardProgram();
      };
      const didUpdatePreviewCache = canUsePreviewCache
        ? (
            deferPreviewCacheUpdate
              ? Boolean(this.previewCacheReady && !this.previewCacheDirty && this.previewTexture)
              : this.updatePreviewCacheIfNeeded(previewCacheOptions)
          )
        : false;
      const usePreviewCache = canUsePreviewCache && didUpdatePreviewCache && this.previewCacheReady;
      const canvasNeedsLayerComposite = !usePreviewCache && orderedLayers.some((layer) =>
        layer?.visible !== false &&
        !(activeStrokeDefersLayerBlend && layer?.id === activeStrokeLayerId) &&
        this.hasAdvancedLayerBlendMode(layer)
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      if (this.options.transparentBackground) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(0.15, 0.15, 0.15, 1.0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      bindArtboardProgram();

      // Pass 1: layer documento, dal basso verso l'alto.
      gl.uniform1f(uniforms.gridMode, 0.0);

      if (usePreviewCache) {
        const activeStrokeOpacity = this.getLayerOpacity(activeStrokeLayerId, renderableLayers);
        const cacheDocRect = this.previewCacheDocumentRect || previewCacheDocumentRect;
        const exactCacheDocRect = this.getPreviewCacheExactDocumentRect(cacheDocRect);

        drawTexture(this.previewTexture, 1, exactCacheDocRect);

        if (options.activeStrokeTexture && activeStrokeMode !== "eraser") {
          withLayerArtboardClip(activeStrokeLayer, () => {
            withActiveStrokeClip(() => {
              drawTexture(options.activeStrokeTexture, activeStrokeOpacity, activeStrokeRect);
            });
          });
          didDrawActiveStroke = true;
        }
      } else {
        if (canvasNeedsLayerComposite) {
          canvasCompositeState = this.beginLayerComposite(viewportWidth, viewportHeight);
          bindArtboardProgram();
        }

        viewportCullingStats.artboardResidency.flatPreviewDrawnCount = drawArtboardFlatPreviewFallbacks();

        let currentClipBase = null;

        for (const layer of orderedLayers) {
          viewportCullingStats.layers.considered += 1;
          const rawLayerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const layerArtboardId = this.getLayerArtboardId(layer);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const isActiveStrokeLayer = options.activeStrokeTexture && layer.id === activeStrokeLayerId;
          const isClipBaseLayer = clipBaseLayerIds.has(layer.id);
          const isRasterTransformPreviewLayer = rasterTransformPreview?.layerId === layer.id;
          const isVectorTextTransformPreviewLayer = vectorTextTransformPreviewLayerId === layer.id;
          const transformPreviewForClipBase = isRasterTransformPreviewLayer
            ? rasterTransformPreview
            : null;
          const eraserMaskTexture = isActiveStrokeLayer && activeStrokeMode === "eraser"
            ? options.activeStrokeTexture
            : null;
          const clipBase = isClippingLayer ? currentClipBase : null;
          const skipLayerEffectsForInteractiveStroke = Boolean(
            isActiveStrokeLayer &&
            activeStrokeDefersLayerEffects &&
            activeStrokeMode !== "eraser"
          );
          const skipLayerBlendForInteractiveStroke = Boolean(
            isActiveStrokeLayer &&
            activeStrokeDefersLayerBlend &&
            activeStrokeMode !== "eraser"
          );
          let layerTarget = this.getRenderableLayerTarget(layer, rawLayerTarget, {
            forceSingleTexture: Boolean(eraserMaskTexture),
            skipLayerEffects: skipLayerEffectsForInteractiveStroke,
            source: "canvas-sparse-layer",
          });
          const canCullSparseTilesForViewport = Boolean(
            staticViewportRenderRect &&
            !isClippingLayer &&
            !isActiveStrokeLayer &&
            !isRasterTransformPreviewLayer &&
            !isVectorTextTransformPreviewLayer &&
            !eraserMaskTexture &&
            !rasterTransformPreview &&
            !vectorTextTransformPreviewLayerId &&
            !this.hasAdvancedLayerBlendMode(layer) &&
            !this.hasEnabledLayerEffects(layer) &&
            !this.hasPuppetLayerTransform(layer)
          );
          const viewportLayerRenderOptions = {
            cullSparseTiles: canCullSparseTilesForViewport,
            cullingStats: viewportCullingStats,
            renderRect: staticViewportRenderRect,
            skipLayerEffects: skipLayerEffectsForInteractiveStroke,
          };

          if (layerArtboardId && artboardFlatPreviewFallbackIds.has(layerArtboardId)) {
            if (!isClippingLayer) {
              currentClipBase = null;
            }

            viewportCullingStats.layers.skippedFlatPreviewFallback += 1;
            continue;
          }

          if (!isClippingLayer) {
            const shouldMaterializeClipBase = hasClippingMasks && isClipBaseLayer;
            const baseTarget = shouldMaterializeClipBase
              ? this.getRenderableLayerTarget(layer, layerTarget, {
                  forceSingleTexture: true,
                  source: "canvas-clip-base",
                })
              : layerTarget;

            if (shouldMaterializeClipBase) {
              layerTarget = baseTarget;
            }

            currentClipBase = isValidClipBaseLayer(layer)
              ? this.createClipBaseForLayer(layer, baseTarget, layer.visible !== false, {
                  transformPreview: transformPreviewForClipBase,
                })
              : null;
          }

          if (layer.visible === false) {
            viewportCullingStats.layers.skippedInvisible += 1;
            continue;
          }

          if (isVectorTextTransformPreviewLayer) {
            if (!isClippingLayer) {
              currentClipBase = null;
            }

            viewportCullingStats.layers.skippedVectorTransformPreview += 1;
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !this.hasClipBaseSamplingTexture(clipBase))) {
            viewportCullingStats.layers.skippedClippingBaseMissing += 1;
            continue;
          }

          if (viewportLayerCullingMeasured) {
            const layerCullDecision = this.getViewportLayerCullDecision(layer, layerTarget, {
              clipBaseLayerIds,
              eraserMaskTexture,
              hasArtboardDragPreview,
              isActiveStrokeLayer,
              isClippingLayer,
              isRasterTransformPreviewLayer,
              isVectorTextTransformPreviewLayer,
              rasterTransformPreview,
              renderRect: staticViewportRenderRect,
              vectorTextTransformPreviewLayerId,
            });
            const shouldCullLayer = Boolean(viewportLayerCullingEnabled && layerCullDecision.shouldCull);

            this.recordViewportLayerCullDecision(viewportCullingStats, layerCullDecision, shouldCullLayer);

            if (shouldCullLayer) {
              continue;
            }
          }

          viewportCullingStats.layers.passedCull += 1;

          if (isRasterTransformPreviewLayer) {
            setPreviewCut(rasterTransformPreview.sourceRect);
          }

          if (layerTarget?.texture) {
            viewportCullingStats.layers.drawPasses += 1;
            let renderTarget = layerTarget;
            let didMergeActiveStroke = false;

            if (isActiveStrokeLayer && activeStrokeNeedsScratchMerge) {
              const mergedTarget = this.renderLayerWithActiveStrokeTexture(
                layerTarget.texture,
                options.activeStrokeTexture,
                activeStrokeRect,
                {
                  clipRects: activeStrokeScratchClipRects,
                  hasClip: activeStrokeHasClip,
                },
              );

              if (mergedTarget?.texture) {
                renderTarget = mergedTarget;
                didMergeActiveStroke = true;
                didDrawActiveStroke = true;
                if (!isClippingLayer && isClipBaseLayer) {
                  currentClipBase = this.createClipBaseForLayer(layer, mergedTarget, layer.visible !== false, {
                    transformPreview: transformPreviewForClipBase,
                  });
                }
                bindArtboardProgram();
              }
            }

            const blendModeId = skipLayerBlendForInteractiveStroke ? 0 : this.getLayerBlendModeId(layer);

            if (eraserMaskTexture) {
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, eraserMaskTexture);
              gl.uniform1f(uniforms.maskMode, 1.0);
              if (activeStrokeRect) {
                gl.uniform1f(uniforms.maskRectMode, 1.0);
                gl.uniform4f(
                  uniforms.maskRect,
                  activeStrokeRect.x,
                  activeStrokeRect.y,
                  activeStrokeRect.width,
                  activeStrokeRect.height,
                );
              } else {
                gl.uniform1f(uniforms.maskRectMode, 0.0);
                gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
              }
              setMaskClipUniforms(uniforms, activeStrokeClipRect, activeStrokeClipRects);
              if (activeStrokeSelectionClipTexture && activeStrokeSelectionMask?.rect) {
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, activeStrokeSelectionClipTexture);
                gl.uniform1f(uniforms.selectionClipMode, 1.0);
                gl.uniform4f(
                  uniforms.selectionClipRect,
                  activeStrokeSelectionMask.rect.x,
                  activeStrokeSelectionMask.rect.y,
                  activeStrokeSelectionMask.rect.width,
                  activeStrokeSelectionMask.rect.height,
                );
              } else {
                gl.uniform1f(uniforms.selectionClipMode, 0.0);
                gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
              }
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = eraserMaskTexture;
              currentMaskRect = activeStrokeRect || null;
              currentMaskClipRect = activeStrokeClipRect || null;
              currentMaskClipRects = activeStrokeClipRects || null;
            }

            for (const renderResult of this.getLayerRenderResults(layer, renderTarget, viewportLayerRenderOptions)) {
              const layerTexture = renderResult?.texture;
              const layerRect = this.getArtboardDragVisualRect(layer, renderResult?.rect || null, renderTarget);

              if (!layerTexture) {
                continue;
              }

              if (layerTexture !== renderTarget.texture) {
                bindArtboardProgram();
              }

              withLayerArtboardClip(layer, () => {
                if (this.hasPuppetLayerTransform(layer) && !eraserMaskTexture) {
                  if (isClippingLayer) {
                    drawBlendTexture(layerTexture, opacity, layerRect, clipBase, blendModeId);
                  } else {
                    const visualRenderResult = layerRect
                      ? { ...renderResult, rect: layerRect }
                      : renderResult;
                    const puppetTarget = this.getPuppetVisualTarget(renderTarget, visualRenderResult);
                    const didDrawPuppet = this.drawPuppetLayer(this.getArtboardDragVisualLayer(layer), puppetTarget, opacity, {
                      camera,
                      sourceTexture: layerTexture,
                      textureMagFilter: viewportTextureMagFilter,
                      viewportHeight,
                      viewportWidth,
                    });

                    bindArtboardProgram();

                    if (!didDrawPuppet) {
                      drawBlendTexture(layerTexture, opacity, layerRect, null, blendModeId);
                    }
                  }
                } else {
                  drawBlendTexture(layerTexture, opacity, layerRect, clipBase, blendModeId);
                }
              });

            }

            if (eraserMaskTexture) {
              gl.uniform1f(uniforms.maskMode, 0.0);
              gl.uniform1f(uniforms.maskRectMode, 0.0);
              setMaskClipUniforms(uniforms);
              gl.uniform1f(uniforms.selectionClipMode, 0.0);
              gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = null;
              currentMaskRect = null;
              currentMaskClipRect = null;
              currentMaskClipRects = null;
              didDrawActiveStroke = true;
            }

            if (didMergeActiveStroke) {
              currentMaskTexture = null;
              currentMaskRect = null;
              currentMaskClipRect = null;
              currentMaskClipRects = null;
            }
          } else if (this.isSparseRasterTarget(layerTarget)) {
            viewportCullingStats.layers.drawPasses += 1;
            const blendModeId = skipLayerBlendForInteractiveStroke ? 0 : this.getLayerBlendModeId(layer);

            for (const renderResult of this.getLayerRenderResults(layer, layerTarget, viewportLayerRenderOptions)) {
              const layerTexture = renderResult?.texture;

              if (!layerTexture) {
                continue;
              }

              withLayerArtboardClip(layer, () => {
                drawBlendTexture(
                  layerTexture,
                  opacity,
                  this.getArtboardDragVisualRect(layer, renderResult.rect || null, layerTarget),
                  clipBase,
                  blendModeId,
                );
              });
            }
          }

          if (isRasterTransformPreviewLayer) {
            setPreviewCut(null);
          }

          if (isRasterTransformPreviewLayer) {
            drawRasterTransformPreview(opacity, clipBase);
          }

          if (isActiveStrokeLayer && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
            withLayerArtboardClip(layer, () => {
              withActiveStrokeClip(() => {
                drawBlendTexture(
                  options.activeStrokeTexture,
                  opacity,
                  activeStrokeRect,
                  clipBase,
                  this.getLayerBlendModeId(layer),
                );
              });
            });
            didDrawActiveStroke = true;
          }
        }
      }

      if (options.activeStrokeTexture && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          withLayerArtboardClip(activeStrokeLayer, () => {
            withActiveStrokeClip(() => {
              drawTexture(options.activeStrokeTexture, 1.0, activeStrokeRect);
            });
          });
        }
      }

      if (canvasCompositeState?.read?.texture) {
        this.drawScreenTexture(canvasCompositeState.read.texture, {
          blend: true,
          framebuffer: null,
          viewportHeight,
          viewportWidth,
        });
        canvasCompositeState = null;
        bindArtboardProgram();
      }

      // Pass 2: griglia pixel sopra tutto, ma solo oltre il 1000%.
      // Sotto quella soglia non disegniamo proprio il pass, evitando overlay bianchi a zoom out.
      if (this.shouldDrawPixelGrid(camera)) {
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.gridMode, 1.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform1f(uniforms.gridMode, 0.0);
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      } finally {
        trace?.end({
          activeStroke: Boolean(options.activeStrokeTexture),
          activeStrokeScratchMerge: Boolean(activeStrokeNeedsScratchMerge),
          canUsePreviewCache,
          layers: renderableLayers.length,
          layersCulled: viewportCullingStats.layers.safelyCulled,
          sparseTilesSkipped: viewportCullingStats.sparseTiles.skippedOutsideRenderRect,
        });
        this.scheduleArtboardResidencyMaintenance(artboardResidency, {
          activeLayerId: activeStrokeLayerId,
          activeStrokeTexture: Boolean(options.activeStrokeTexture),
          camera,
          deferPreviewCacheUpdate,
          dpr: options.dpr,
          metrics: artboardResidencyMetrics,
          orderedLayers,
          viewportHeight,
          viewportWidth,
        });
        this.finalizeViewportCullingStats(viewportCullingStats);
      }
    }

    });
  };
})(window.CBO = window.CBO || {});
