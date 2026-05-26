(function registerLayerEffects(namespace) {
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

  function normalizeHexColor(value, fallback = "#FFFFFF") {
    const raw = String(value || "").trim();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
        .toUpperCase()}`;
    }

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toUpperCase()}`;
    }

    return fallback;
  }

  function normalizeColorOverlayOpacity(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }

  function normalizeLayerStrokeSize(value, maxSize = 64) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(maxSize, number)) : 0;
  }

  function colorToRgbUnit(color) {
    const normalized = normalizeHexColor(color);
    const hex = normalized.slice(1);

    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    };
  }

  namespace.DocumentRendererMixins.layerEffects = function installRegisterLayerEffects(DocumentRenderer, internals) {
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
      MAX_LAYER_STROKE_SIZE,
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
    getGaussianBlurRadius(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "gaussian-blur" && item.enabled !== false)
        : effects?.gaussianBlur;
      const radius = Number(effect?.radius);

      return Number.isFinite(radius) ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius)) : 0;
    }
,

    getLayerGaussianBlur(layer) {
      const radius = this.getGaussianBlurRadius(layer);

      return radius > 0
        ? {
            enabled: true,
            radius,
          }
        : null;
    }
,

    getMotionBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "motion-blur" && item.enabled !== false)
        : effects?.motionBlur;
      const distance = Number(effect?.distance);

      return {
        angle: normalizeAngle(effect?.angle),
        distance: Number.isFinite(distance) ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance)) : 0,
      };
    }
,

    getLayerMotionBlur(layer) {
      const motionBlur = this.getMotionBlur(layer);

      return motionBlur.distance > 0
        ? {
            enabled: true,
            distance: motionBlur.distance,
            angle: motionBlur.angle,
          }
        : null;
    }
,

    getFieldBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "field-blur" && item.enabled !== false)
        : effects?.fieldBlur;

      return {
        pins: normalizeFieldBlurPins(effect?.pins),
      };
    }
,

    getLayerFieldBlur(layer) {
      const fieldBlur = this.getFieldBlur(layer);

      return hasFieldBlurAmount(fieldBlur.pins)
        ? {
            enabled: true,
            pins: fieldBlur.pins,
          }
        : null;
    }
,

    getRadialBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "radial-blur" && item.enabled !== false)
        : effects?.radialBlur;
      const amount = Number(effect?.amount);
      const centerFallback = effect?.center;

      return {
        amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount)) : 0,
        centerX: normalizePercent(effect?.centerX ?? centerFallback),
        centerY: normalizePercent(effect?.centerY ?? centerFallback),
        mode: normalizeRadialBlurMode(effect?.mode),
      };
    }
,

    getLayerRadialBlur(layer) {
      const radialBlur = this.getRadialBlur(layer);

      return radialBlur.amount > 0
        ? {
            enabled: true,
            amount: radialBlur.amount,
            centerX: radialBlur.centerX,
            centerY: radialBlur.centerY,
            mode: radialBlur.mode,
          }
        : null;
    }
,

    getGrain(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "grain" && item.enabled !== false)
        : effects?.grain;
      const seed = Number(effect?.seed);

      return {
        amount: normalizeGrainAmount(effect?.amount),
        scale: normalizeGrainScale(effect?.scale),
        monochrome: effect ? effect.monochrome !== false : true,
        seed: Number.isFinite(seed) ? seed : 0,
      };
    }
,

    getLayerGrain(layer) {
      const grain = this.getGrain(layer);

      return grain.amount > 0
        ? {
            enabled: true,
            amount: grain.amount,
            scale: grain.scale,
            monochrome: grain.monochrome,
            seed: grain.seed,
          }
        : null;
    }
,

    getNoise(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "noise" && item.enabled !== false)
        : effects?.noise;
      const seed = Number(effect?.seed);

      return {
        amount: normalizeNoiseAmount(effect?.amount),
        scale: normalizeNoiseScale(effect?.scale),
        monochrome: effect ? effect.monochrome !== false : true,
        seed: Number.isFinite(seed) ? seed : 0,
      };
    }
,

    getLayerNoise(layer) {
      const noise = this.getNoise(layer);

      return noise.amount > 0
        ? {
            enabled: true,
            amount: noise.amount,
            scale: noise.scale,
            monochrome: noise.monochrome,
            seed: noise.seed,
          }
        : null;
    }
,

    getThreshold(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "threshold" && item.enabled !== false)
        : effects?.threshold;

      return {
        enabled: Boolean(effect && effect.enabled !== false),
        threshold: normalizeThresholdValue(effect?.threshold ?? effect?.level),
      };
    }
,

    getLayerThreshold(layer) {
      const threshold = this.getThreshold(layer);

      return threshold.enabled
        ? {
            enabled: true,
            threshold: threshold.threshold,
          }
        : null;
    }
,

    getCurves(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "curves" && item.enabled !== false)
        : effects?.curves;

      return normalizeCurvesEffect(effect);
    }
,

    getLayerCurves(layer) {
      const curves = this.getCurves(layer);

      return hasMeaningfulCurvesEffect(curves) ? curves : null;
    }
,

    getColorOverlay(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "color-overlay" && item.enabled !== false)
        : effects?.colorOverlay;
      const opacity = normalizeColorOverlayOpacity(effect?.opacity);

      return {
        color: normalizeHexColor(effect?.color || effect?.hex),
        enabled: Boolean(effect && effect.enabled !== false && opacity > 0),
        opacity,
      };
    }
,

    getLayerColorOverlay(layer) {
      const colorOverlay = this.getColorOverlay(layer);

      return colorOverlay.enabled ? colorOverlay : null;
    }
,

    getStroke(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "stroke" && item.enabled !== false)
        : effects?.stroke;
      const opacity = normalizeColorOverlayOpacity(effect?.opacity);
      const size = normalizeLayerStrokeSize(effect?.size ?? effect?.width, MAX_LAYER_STROKE_SIZE);

      return {
        color: normalizeHexColor(effect?.color || effect?.hex),
        enabled: Boolean(effect && effect.enabled !== false && opacity > 0 && size > 0),
        opacity,
        position: "outside",
        size,
      };
    }
,

    getLayerStroke(layer) {
      const stroke = this.getStroke(layer);

      return stroke.enabled ? stroke : null;
    }
,

    hasEnabledLayerEffects(layer) {
      return (
        this.getGaussianBlurRadius(layer) > 0 ||
        this.getMotionBlur(layer).distance > 0 ||
        hasFieldBlurAmount(this.getFieldBlur(layer).pins) ||
        this.getRadialBlur(layer).amount > 0 ||
        this.getGrain(layer).amount > 0 ||
        this.getNoise(layer).amount > 0 ||
        Boolean(this.getLayerThreshold(layer)) ||
        Boolean(this.getLayerCurves(layer)) ||
        Boolean(this.getLayerColorOverlay(layer)) ||
        Boolean(this.getLayerStroke(layer))
      );
    }
,

    hasLayerVisualEffects(layer) {
      return this.hasEnabledLayerEffects(layer);
    }
,

    hasAnyEnabledLayerEffects(layers = this.getOrderedLayersBottomToTop()) {
      return Array.isArray(layers) && layers.some((layer) => this.hasEnabledLayerEffects(layer));
    }
,

    createLayerEffectScratchTarget(width = this.width, height = this.height, resourceMetadata = {}) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error("Impossibile creare le scratch texture per gli effetti layer.");
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
        targetWidth,
        targetHeight,
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
        throw new Error("Scratch FBO effetti layer incompleto.");
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const target = {
        cropped: targetWidth !== this.width || targetHeight !== this.height,
        framebuffer,
        height: targetHeight,
        id: resourceMetadata.ownerId || `effect-scratch-${this.rasterTargetIdSequence++}`,
        texture,
        width: targetWidth,
        x: 0,
        y: 0,
      };

      this.registerRasterTargetResources(target, {
        height: targetHeight,
        kind: resourceMetadata.kind || "effectScratch",
        label: resourceMetadata.label || "layer effect scratch",
        ownerId: resourceMetadata.ownerId || target.id,
        ownerType: "scratch",
        purgeable: resourceMetadata.purgeable !== undefined
          ? Boolean(resourceMetadata.purgeable)
          : true,
        reason: resourceMetadata.reason || "create-layer-effect-scratch-target",
        width: targetWidth,
        ...resourceMetadata,
      });

      return target;
    }
,

    deleteLayerEffectTarget(target) {
      if (!target) {
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
    }
,

    deleteLayerEffectScratchTargets() {
      this.deleteLayerEffectTarget(this.layerEffectScratchA);
      this.deleteLayerEffectTarget(this.layerEffectScratchB);
      this.layerEffectScratchA = null;
      this.layerEffectScratchB = null;
    }
,

    deleteGaussianBlurResources() {
      this.deleteLayerEffectScratchTargets();

      if (this.gaussianBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.gaussianBlurProgramInfo.program);
      }

      this.gaussianBlurProgramInfo = null;
    }
,

    deleteMotionBlurResources() {
      if (this.motionBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.motionBlurProgramInfo.program);
      }

      this.motionBlurProgramInfo = null;
    }
,

    deleteFieldBlurResources() {
      if (this.fieldBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.fieldBlurProgramInfo.program);
      }

      this.fieldBlurProgramInfo = null;
    }
,

    deleteRadialBlurResources() {
      if (this.radialBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.radialBlurProgramInfo.program);
      }

      this.radialBlurProgramInfo = null;
    }
,

    deleteGrainResources() {
      if (this.grainProgramInfo?.program) {
        this.gl.deleteProgram(this.grainProgramInfo.program);
      }

      this.grainProgramInfo = null;
    }
,

    deleteNoiseResources() {
      if (this.noiseProgramInfo?.program) {
        this.gl.deleteProgram(this.noiseProgramInfo.program);
      }

      this.noiseProgramInfo = null;
    }
,

    deleteThresholdResources() {
      if (this.thresholdProgramInfo?.program) {
        this.gl.deleteProgram(this.thresholdProgramInfo.program);
      }

      this.thresholdProgramInfo = null;
    }
,

    deleteCurvesResources() {
      const gl = this.gl;

      if (this.curvesProgramInfo?.program) {
        gl.deleteProgram(this.curvesProgramInfo.program);
      }

      this.curvesProgramInfo = null;

      if (this.curvesLutTexture) {
        this.deleteRasterTexture(this.curvesLutTexture);
        gl.deleteTexture(this.curvesLutTexture);
        this.curvesLutTexture = null;
      }
    }
,

    deleteColorOverlayResources() {
      if (this.colorOverlayProgramInfo?.program) {
        this.gl.deleteProgram(this.colorOverlayProgramInfo.program);
      }

      this.colorOverlayProgramInfo = null;
    }
,

    deleteLayerStrokeResources() {
      if (this.layerStrokeProgramInfo?.program) {
        this.gl.deleteProgram(this.layerStrokeProgramInfo.program);
      }

      this.layerStrokeProgramInfo = null;
    }
,

    ensureLayerEffectScratchTargets(width = this.width, height = this.height) {
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));
      const needsScratch =
        !this.layerEffectScratchA ||
        !this.layerEffectScratchB ||
        this.layerEffectScratchA.width !== targetWidth ||
        this.layerEffectScratchA.height !== targetHeight ||
        this.layerEffectScratchB.width !== targetWidth ||
        this.layerEffectScratchB.height !== targetHeight;

      if (needsScratch) {
        this.deleteLayerEffectScratchTargets();
        this.layerEffectScratchA = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "effectScratch",
          label: "layerEffectScratchA",
          ownerId: "layerEffectScratchA",
          ownerType: "scratch",
          purgeable: true,
          reason: "layer-effect",
        });
        this.layerEffectScratchB = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "effectScratch",
          label: "layerEffectScratchB",
          ownerId: "layerEffectScratchB",
          ownerType: "scratch",
          purgeable: true,
          reason: "layer-effect",
        });
      }

      return {
        scratchA: this.layerEffectScratchA,
        scratchB: this.layerEffectScratchB,
      };
    }
,

    getLayerEffectWriteTarget(sourceTexture, width = this.width, height = this.height) {
      const { scratchA, scratchB } = this.ensureLayerEffectScratchTargets(width, height);

      return sourceTexture === scratchA.texture ? scratchB : scratchA;
    }
,

    deleteActiveStrokeScratchTarget() {
      this.deleteLayerEffectTarget(this.activeStrokeScratchTarget);
      this.activeStrokeScratchTarget = null;
    }
,

    ensureActiveStrokeScratchTarget(width = this.width, height = this.height) {
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));
      const needsScratch =
        !this.activeStrokeScratchTarget ||
        this.activeStrokeScratchTarget.width !== targetWidth ||
        this.activeStrokeScratchTarget.height !== targetHeight;

      if (needsScratch) {
        this.deleteActiveStrokeScratchTarget();
        this.activeStrokeScratchTarget = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "strokeScratch",
          label: "active stroke scratch target",
          ownerId: "activeStrokeScratchTarget",
          ownerType: "scratch",
          purgeable: false,
          reason: "active-stroke",
        });
      }

      return this.activeStrokeScratchTarget;
    }
,

    renderLayerWithActiveStrokeTexture(layerTexture, strokeTexture, strokeRect = null, options = {}) {
      const renderResults = Array.isArray(options.renderResults)
        ? options.renderResults.filter((renderResult) => renderResult?.texture)
        : null;

      if (!strokeTexture || (!layerTexture && !renderResults) || !this.programInfo || !this.quad) {
        return null;
      }

      const gl = this.gl;
      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const scratch = this.ensureActiveStrokeScratchTarget(width, height);
      const { program, uniforms } = this.programInfo;
      const strokeClipRects = Array.isArray(options.clipRects)
        ? options.clipRects
            .map((rect) => this.getUnclampedDocumentRect?.(rect) || rect)
            .filter(Boolean)
        : [];
      const layerRect = options.layerRect
        ? this.getUnclampedDocumentRect?.(options.layerRect) || options.layerRect
        : null;
      const layerDrawWidth = Math.max(1, Math.round(layerRect?.width || width));
      const layerDrawHeight = Math.max(1, Math.round(layerRect?.height || height));
      const layerOriginX = Number.isFinite(layerRect?.x) ? layerRect.x : 0;
      const layerOriginY = Number.isFinite(layerRect?.y) ? layerRect.y : 0;
      const hasStrokeClip = options.hasClip === true || strokeClipRects.length > 0;
      const getScratchScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const left = Math.max(0, Math.floor(docRect.x));
        const top = Math.max(0, Math.floor(docRect.y));
        const right = Math.min(width, Math.ceil(docRect.x + docRect.width));
        const bottom = Math.min(height, Math.ceil(docRect.y + docRect.height));

        if (right <= left || bottom <= top) {
          return null;
        }

        return {
          height: bottom - top,
          width: right - left,
          x: left,
          y: height - bottom,
        };
      };
      const drawSource = (texture, documentWidth, documentHeight, originX = 0, originY = 0) => {
        if (!texture) {
          return;
        }

        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, originX, originY);
        gl.uniform2f(uniforms.drawOrigin, originX, originY);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const drawLayerSources = () => {
        if (renderResults) {
          renderResults.forEach((renderResult) => {
            const rect = renderResult.rect
              ? this.getUnclampedDocumentRect?.(renderResult.rect) || renderResult.rect
              : null;
            const sourceWidth = Math.max(1, Math.round(rect?.width || width));
            const sourceHeight = Math.max(1, Math.round(rect?.height || height));
            const sourceX = Number.isFinite(rect?.x) ? rect.x : 0;
            const sourceY = Number.isFinite(rect?.y) ? rect.y : 0;

            drawSource(renderResult.texture, sourceWidth, sourceHeight, sourceX, sourceY);
          });
          return;
        }

        drawSource(layerTexture, layerDrawWidth, layerDrawHeight, layerOriginX, layerOriginY);
      };
      const drawStrokeSource = (documentWidth, documentHeight, originX = 0, originY = 0) => {
        if (hasStrokeClip && strokeClipRects.length === 0) {
          return;
        }

        if (strokeClipRects.length === 0) {
          drawSource(strokeTexture, documentWidth, documentHeight, originX, originY);
          return;
        }

        const wasScissorEnabled = gl.isEnabled?.(gl.SCISSOR_TEST) === true;
        const previousScissor = gl.getParameter?.(gl.SCISSOR_BOX) || null;

        gl.enable(gl.SCISSOR_TEST);
        try {
          strokeClipRects.forEach((clipRect) => {
            const scissor = getScratchScissorForDocumentRect(clipRect);

            if (!scissor) {
              return;
            }

            gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
            drawSource(strokeTexture, documentWidth, documentHeight, originX, originY);
          });
        } finally {
          if (previousScissor) {
            gl.scissor(previousScissor[0], previousScissor[1], previousScissor[2], previousScissor[3]);
          }

          if (!wasScissorEnabled) {
            gl.disable(gl.SCISSOR_TEST);
          }
        }
      };

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, width, height);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, width, height);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);

      drawLayerSources();

      if (strokeRect) {
        const rectWidth = Math.max(1, Math.round(strokeRect.width || width));
        const rectHeight = Math.max(1, Math.round(strokeRect.height || height));
        const rectX = Number.isFinite(strokeRect.x) ? strokeRect.x : 0;
        const rectY = Number.isFinite(strokeRect.y) ? strokeRect.y : 0;

        drawStrokeSource(rectWidth, rectHeight, rectX, rectY);
      } else {
        drawStrokeSource(width, height);
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return scratch;
    }
,

    runGaussianBlurPass({ sourceTexture, target, radius, texelStepX, texelStepY }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureGaussianBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelStep, texelStepX, texelStepY);
      gl.uniform1f(uniforms.radius, radius);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runMotionBlurPass({ sourceTexture, target, distance, texelStepX, texelStepY }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureMotionBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.directionTexelStep, texelStepX, texelStepY);
      gl.uniform1f(uniforms.distance, distance);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runFieldBlurPass({ sourceTexture, target, pins }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureFieldBlurProgramInfo();
      const width = Math.max(1, target.width || this.width || 1);
      const height = Math.max(1, target.height || this.height || 1);
      const pinValues = new Float32Array(MAX_FIELD_BLUR_PINS * 3);
      const normalizedPins = normalizeFieldBlurPins(pins);

      normalizedPins.forEach((pin, index) => {
        const offset = index * 3;

        pinValues[offset] = pin.x / width;
        pinValues[offset + 1] = 1 - pin.y / height;
        pinValues[offset + 2] = pin.blur;
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelSize, 1 / width, 1 / height);
      gl.uniform1i(uniforms.pinCount, normalizedPins.length);
      gl.uniform3fv(uniforms.pins, pinValues);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runRadialBlurPass({ sourceTexture, target, amount, centerX, centerY, mode = "spin" }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureRadialBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelSize, 1 / target.width, 1 / target.height);
      gl.uniform2f(uniforms.center, centerX, centerY);
      gl.uniform1f(uniforms.mode, normalizeRadialBlurMode(mode) === "zoom" ? 1 : 0);
      gl.uniform1f(uniforms.amount, amount);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runGrainPass({
      sourceTexture,
      target,
      amount,
      scale,
      monochrome,
      seed,
      originX = 0,
      originY = 0,
    }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureGrainProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.amount, normalizeGrainAmount(amount));
      gl.uniform1f(uniforms.scale, normalizeGrainScale(scale));
      gl.uniform1f(uniforms.monochrome, monochrome === false ? 0 : 1);
      gl.uniform1f(uniforms.seed, Number.isFinite(Number(seed)) ? Number(seed) : 0);
      gl.uniform2f(uniforms.origin, Number.isFinite(originX) ? originX : 0, Number.isFinite(originY) ? originY : 0);
      gl.uniform2f(uniforms.size, Math.max(1, target.width || 1), Math.max(1, target.height || 1));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runNoisePass({
      sourceTexture,
      target,
      amount,
      scale,
      monochrome,
      seed,
      originX = 0,
      originY = 0,
    }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureNoiseProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.amount, normalizeNoiseAmount(amount));
      gl.uniform1f(uniforms.scale, normalizeNoiseScale(scale));
      gl.uniform1f(uniforms.monochrome, monochrome === false ? 0 : 1);
      gl.uniform1f(uniforms.seed, Number.isFinite(Number(seed)) ? Number(seed) : 0);
      gl.uniform2f(uniforms.origin, Number.isFinite(originX) ? originX : 0, Number.isFinite(originY) ? originY : 0);
      gl.uniform2f(uniforms.size, Math.max(1, target.width || 1), Math.max(1, target.height || 1));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runThresholdPass({ sourceTexture, target, threshold }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureThresholdProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.threshold, normalizeThresholdValue(threshold));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runColorOverlayPass({ color, opacity, sourceTexture, target }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureColorOverlayProgramInfo();
      const rgb = colorToRgbUnit(color);

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform3f(uniforms.color, rgb.r, rgb.g, rgb.b);
      gl.uniform1f(uniforms.opacity, normalizeColorOverlayOpacity(opacity));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    runLayerStrokePass({ color, opacity, size, sourceTexture, target }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureLayerStrokeProgramInfo();
      const rgb = colorToRgbUnit(color);
      const width = Math.max(1, target.width || 1);
      const height = Math.max(1, target.height || 1);

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform3f(uniforms.color, rgb.r, rgb.g, rgb.b);
      gl.uniform1f(uniforms.opacity, normalizeColorOverlayOpacity(opacity));
      gl.uniform1f(uniforms.size, normalizeLayerStrokeSize(size, MAX_LAYER_STROKE_SIZE));
      gl.uniform2f(uniforms.texelSize, 1 / width, 1 / height);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    ensureCurvesLutTexture() {
      if (this.curvesLutTexture) {
        this.markRasterResourceUsed(this.curvesLutTexture);
        return this.curvesLutTexture;
      }

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture LUT curves.");
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
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.curvesLutTexture = texture;
      this.registerRasterTexture(texture, {
        height: 1,
        kind: "curvesLut",
        label: "curves LUT texture",
        ownerId: "curves-lut",
        ownerType: "scratch",
        purgeable: true,
        reason: "ensure-curves-lut-texture",
        width: 256,
      });

      return texture;
    }
,

    uploadCurvesLutTexture(lutData) {
      if (!(lutData instanceof Uint8Array) || lutData.length !== 256 * 4) {
        return null;
      }

      const gl = this.gl;
      const texture = this.ensureCurvesLutTexture();

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        256,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        lutData,
      );
      gl.activeTexture(gl.TEXTURE0);

      return texture;
    }
,

    runCurvesPass({ sourceTexture, target, curves }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao || !curves) {
        return false;
      }

      const lutData = buildPackedCurvesLut(curves);
      const lutTexture = this.uploadCurvesLutTexture(lutData);

      if (!lutTexture) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureCurvesProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.curveLut, 1);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    applyGaussianBlurTexture(sourceTexture, radius, options = {}) {
      const blurRadius = Number.isFinite(radius)
        ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius))
        : 0;

      if (!sourceTexture || blurRadius <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const { scratchA, scratchB } = this.ensureLayerEffectScratchTargets(width, height);
      const firstTarget = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const secondTarget = firstTarget === scratchA ? scratchB : scratchA;
      const didHorizontalPass = this.runGaussianBlurPass({
        radius: blurRadius,
        sourceTexture,
        target: firstTarget,
        texelStepX: 1 / width,
        texelStepY: 0,
      });
      const didVerticalPass = didHorizontalPass && this.runGaussianBlurPass({
        radius: blurRadius,
        sourceTexture: firstTarget.texture,
        target: secondTarget,
        texelStepX: 0,
        texelStepY: 1 / height,
      });

      return didVerticalPass ? secondTarget.texture : sourceTexture;
    }
,

    applyMotionBlurTexture(sourceTexture, distance, angle, options = {}) {
      const blurDistance = Number.isFinite(distance)
        ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance))
        : 0;

      if (!sourceTexture || blurDistance <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const angleRad = normalizeAngle(angle) * Math.PI / 180;
      const didMotionPass = this.runMotionBlurPass({
        distance: blurDistance,
        sourceTexture,
        target,
        texelStepX: Math.cos(angleRad) / width,
        texelStepY: Math.sin(angleRad) / height,
      });

      return didMotionPass ? target.texture : sourceTexture;
    }
,

    applyFieldBlurTexture(sourceTexture, pins, options = {}) {
      const nextPins = normalizeFieldBlurPins(pins);

      if (!sourceTexture || !hasFieldBlurAmount(nextPins)) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const originX = Number.isFinite(options.originX) ? options.originX : 0;
      const originY = Number.isFinite(options.originY) ? options.originY : 0;
      const localPins = nextPins.map((pin) => ({
        ...pin,
        x: pin.x - originX,
        y: pin.y - originY,
      }));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didFieldPass = this.runFieldBlurPass({
        pins: localPins,
        sourceTexture,
        target,
      });

      return didFieldPass ? target.texture : sourceTexture;
    }
,

    applyRadialBlurTexture(
      sourceTexture,
      amount,
      centerX = 50,
      centerY = 50,
      mode = "spin",
      options = {},
    ) {
      const blurAmount = Number.isFinite(amount)
        ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount))
        : 0;

      if (!sourceTexture || blurAmount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const resolvedCenter = this.resolveRadialBlurCenter(centerX, centerY, {
        height,
        outputRect: options.rect || null,
        sourceRect: options.sourceRect || null,
        width,
      });
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didRadialPass = this.runRadialBlurPass({
        amount: blurAmount,
        centerX: resolvedCenter.x,
        centerY: resolvedCenter.y,
        mode,
        sourceTexture,
        target,
      });

      return didRadialPass ? target.texture : sourceTexture;
    }
,

    applyGrainTexture(sourceTexture, grain, options = {}) {
      const grainEffect = grain || null;
      const amount = normalizeGrainAmount(grainEffect?.amount);

      if (!sourceTexture || amount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didGrainPass = this.runGrainPass({
        amount,
        monochrome: grainEffect?.monochrome !== false,
        originX: Number.isFinite(options.originX) ? options.originX : 0,
        originY: Number.isFinite(options.originY) ? options.originY : 0,
        scale: normalizeGrainScale(grainEffect?.scale),
        seed: Number.isFinite(Number(grainEffect?.seed)) ? Number(grainEffect.seed) : 0,
        sourceTexture,
        target,
      });

      return didGrainPass ? target.texture : sourceTexture;
    }
,

    applyNoiseTexture(sourceTexture, noise, options = {}) {
      const noiseEffect = noise || null;
      const amount = normalizeNoiseAmount(noiseEffect?.amount);

      if (!sourceTexture || amount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didNoisePass = this.runNoisePass({
        amount,
        monochrome: noiseEffect?.monochrome !== false,
        originX: Number.isFinite(options.originX) ? options.originX : 0,
        originY: Number.isFinite(options.originY) ? options.originY : 0,
        scale: normalizeNoiseScale(noiseEffect?.scale),
        seed: Number.isFinite(Number(noiseEffect?.seed)) ? Number(noiseEffect.seed) : 0,
        sourceTexture,
        target,
      });

      return didNoisePass ? target.texture : sourceTexture;
    }
,

    applyThresholdTexture(sourceTexture, threshold, options = {}) {
      if (!sourceTexture || !threshold) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didThresholdPass = this.runThresholdPass({
        sourceTexture,
        target,
        threshold: threshold.threshold,
      });

      return didThresholdPass ? target.texture : sourceTexture;
    }
,

    applyCurvesTexture(sourceTexture, curves, options = {}) {
      if (!sourceTexture || !curves || !hasMeaningfulCurvesEffect(curves)) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didCurvesPass = this.runCurvesPass({
        curves,
        sourceTexture,
        target,
      });

      return didCurvesPass ? target.texture : sourceTexture;
    }
,

    applyColorOverlayTexture(sourceTexture, colorOverlay, options = {}) {
      if (!sourceTexture || !colorOverlay || colorOverlay.enabled === false) {
        return sourceTexture || null;
      }

      const opacity = normalizeColorOverlayOpacity(colorOverlay.opacity);

      if (opacity <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didColorOverlayPass = this.runColorOverlayPass({
        color: colorOverlay.color,
        opacity,
        sourceTexture,
        target,
      });

      return didColorOverlayPass ? target.texture : sourceTexture;
    }
,

    applyLayerStrokeTexture(sourceTexture, stroke, options = {}) {
      if (!sourceTexture || !stroke || stroke.enabled === false) {
        return sourceTexture || null;
      }

      const size = normalizeLayerStrokeSize(stroke.size, MAX_LAYER_STROKE_SIZE);
      const opacity = normalizeColorOverlayOpacity(stroke.opacity);

      if (size <= 0 || opacity <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didLayerStrokePass = this.runLayerStrokePass({
        color: stroke.color,
        opacity,
        size,
        sourceTexture,
        target,
      });

      return didLayerStrokePass ? target.texture : sourceTexture;
    }
,

    resolveRadialBlurCenter(centerX, centerY, options = {}) {
      const outputRect = options.outputRect;
      const sourceRect = options.sourceRect || outputRect;
      const width = Math.max(1, Math.round(options.width || outputRect?.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || outputRect?.height || this.height || 1));

      if (outputRect && sourceRect) {
        const centerDocX = sourceRect.x + sourceRect.width * normalizePercent(centerX) / 100;
        const centerDocY = sourceRect.y + sourceRect.height * normalizePercent(centerY) / 100;

        return {
          x: (centerDocX - outputRect.x) / width,
          y: 1 - (centerDocY - outputRect.y) / height,
        };
      }

      return {
        x: normalizePercent(centerX) / 100,
        y: 1 - normalizePercent(centerY) / 100,
      };
    }
,

    getRadialBlurDocumentCenter(radialBlur, sourceRect) {
      if (!radialBlur || !sourceRect) {
        return null;
      }

      return {
        x: sourceRect.x + sourceRect.width * normalizePercent(radialBlur.centerX) / 100,
        y: sourceRect.y + sourceRect.height * normalizePercent(radialBlur.centerY) / 100,
      };
    }
,

    includePointInBounds(bounds, point) {
      if (!bounds || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return bounds;
      }

      bounds.x1 = Math.min(bounds.x1, point.x);
      bounds.y1 = Math.min(bounds.y1, point.y);
      bounds.x2 = Math.max(bounds.x2, point.x);
      bounds.y2 = Math.max(bounds.y2, point.y);

      return bounds;
    }
,

    isAngleWithinRange(angle, start, end) {
      const fullTurn = Math.PI * 2;
      const normalize = (value) => {
        let next = value % fullTurn;

        if (next < 0) {
          next += fullTurn;
        }

        return next;
      };
      const nextAngle = normalize(angle);
      const nextStart = normalize(start);
      const nextEnd = normalize(end);

      return nextStart <= nextEnd
        ? nextAngle >= nextStart && nextAngle <= nextEnd
        : nextAngle >= nextStart || nextAngle <= nextEnd;
    }
,

    getRadialBlurOutputRect(radialBlur, inputRect, centerSourceRect = inputRect) {
      if (!radialBlur || !inputRect) {
        return inputRect || null;
      }

      const amount = Number(radialBlur.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return inputRect;
      }

      const center = this.getRadialBlurDocumentCenter(radialBlur, centerSourceRect);

      if (!center) {
        return inputRect;
      }

      const corners = [
        { x: inputRect.x, y: inputRect.y },
        { x: inputRect.x + inputRect.width, y: inputRect.y },
        { x: inputRect.x + inputRect.width, y: inputRect.y + inputRect.height },
        { x: inputRect.x, y: inputRect.y + inputRect.height },
      ];
      const bounds = {
        x1: inputRect.x,
        y1: inputRect.y,
        x2: inputRect.x + inputRect.width,
        y2: inputRect.y + inputRect.height,
      };

      if (normalizeRadialBlurMode(radialBlur.mode) === "zoom") {
        const zoomRange = Math.min(0.95, Math.max(0, amount) * 0.0025);
        const scale = 1 / Math.max(0.05, 1 - zoomRange);

        for (const corner of corners) {
          this.includePointInBounds(bounds, {
            x: center.x + (corner.x - center.x) * scale,
            y: center.y + (corner.y - center.y) * scale,
          });
        }
      } else {
        const angleRange = Math.max(0, amount) * 0.0062831853;
        const criticalAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

        for (const corner of corners) {
          const dx = corner.x - center.x;
          const dy = corner.y - center.y;
          const radius = Math.hypot(dx, dy);

          if (radius <= 0) {
            continue;
          }

          const baseAngle = Math.atan2(dy, dx);
          const start = baseAngle - angleRange;
          const end = baseAngle + angleRange;
          const candidateAngles = [start, baseAngle, end];

          for (const angle of criticalAngles) {
            if (this.isAngleWithinRange(angle, start, end)) {
              candidateAngles.push(angle);
            }
          }

          for (const angle of candidateAngles) {
            this.includePointInBounds(bounds, {
              x: center.x + Math.cos(angle) * radius,
              y: center.y + Math.sin(angle) * radius,
            });
          }
        }
      }

      return this.getClampedDocumentRect({
        x: bounds.x1,
        y: bounds.y1,
        width: bounds.x2 - bounds.x1,
        height: bounds.y2 - bounds.y1,
      }, CROPPED_TARGET_EDGE_PADDING) || inputRect;
    }
,

    getLayerEffectOutputRect(layer, targetRect) {
      if (!targetRect) {
        return null;
      }

      let outputRect = targetRect;
      const padding = this.getLayerEffectPadding(layer);

      if (padding > 0) {
        outputRect = this.getClampedDocumentRect(outputRect, padding) || outputRect;
      }

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false || effect.type !== "radial-blur") {
            continue;
          }

          const radialBlur = this.getLayerRadialBlur({ effects: [effect] });

          if (radialBlur) {
            outputRect = this.getRadialBlurOutputRect(radialBlur, outputRect, targetRect) || outputRect;
          }
        }
      } else {
        const radialBlur = this.getLayerRadialBlur(layer);

        if (radialBlur) {
          outputRect = this.getRadialBlurOutputRect(radialBlur, outputRect, targetRect) || outputRect;
        }
      }

      return outputRect;
    }
,

    getLayerEffectPadding(layer) {
      let padding = 0;

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false) {
            continue;
          }

          if (effect.type === "gaussian-blur") {
            padding = Math.max(padding, this.getGaussianBlurRadius({ effects: [effect] }));
          } else if (effect.type === "motion-blur") {
            const motionBlur = this.getLayerMotionBlur({ effects: [effect] });

            if (motionBlur) {
              padding = Math.max(padding, motionBlur.distance);
            }
          } else if (effect.type === "field-blur") {
            const fieldBlur = this.getLayerFieldBlur({ effects: [effect] });

            if (fieldBlur) {
              padding = Math.max(
                padding,
                ...fieldBlur.pins.map((pin) => Number.isFinite(pin.blur) ? pin.blur : 0),
              );
            }
          } else if (effect.type === "stroke") {
            const stroke = this.getLayerStroke({ effects: [effect] });

            if (stroke) {
              padding = Math.max(padding, stroke.size);
            }
          }
        }
      } else {
        const motionBlur = this.getLayerMotionBlur(layer);
        const fieldBlur = this.getLayerFieldBlur(layer);
        const stroke = this.getLayerStroke(layer);

        padding = Math.max(padding, this.getGaussianBlurRadius(layer));

        if (motionBlur) {
          padding = Math.max(padding, motionBlur.distance);
        }

        if (fieldBlur) {
          padding = Math.max(
            padding,
            ...fieldBlur.pins.map((pin) => Number.isFinite(pin.blur) ? pin.blur : 0),
          );
        }

        if (stroke) {
          padding = Math.max(padding, stroke.size);
        }
      }

      return padding > 0
        ? Math.min(CROPPED_TARGET_EFFECT_PADDING, Math.ceil(padding + CROPPED_TARGET_EDGE_PADDING))
        : 0;
    }
,

    createLayerEffectPaddedSource(sourceTexture, sourceRect, outputRect) {
      if (!sourceTexture || !sourceRect || !outputRect || !this.programInfo || !this.quad?.vao) {
        return null;
      }

      const width = Math.max(1, Math.round(outputRect.width || 1));
      const height = Math.max(1, Math.round(outputRect.height || 1));
      const { scratchA } = this.ensureLayerEffectScratchTargets(width, height);

      if (!scratchA?.framebuffer || !scratchA.texture) {
        return null;
      }

      const gl = this.gl;
      const { program, uniforms } = this.programInfo;
      const offsetX = sourceRect.x - outputRect.x;
      const offsetY = sourceRect.y - outputRect.y;

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratchA.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, width, height);
      gl.uniform2f(uniforms.documentSize, sourceRect.width, sourceRect.height);
      gl.uniform2f(uniforms.cameraPosition, offsetX, offsetY);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipOrigin, 0, 0);
      gl.uniform2f(uniforms.clipTextureSize, width, height);
      gl.uniform2f(uniforms.drawOrigin, sourceRect.x, sourceRect.y);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.uniform1f(uniforms.opacity, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return {
        height,
        rect: outputRect,
        texture: scratchA.texture,
        width,
      };
    }
,

    applyLayerEffectsToTexture(layer, sourceTexture, options = {}) {
      if (!sourceTexture) {
        return null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const effectRect = options.rect || null;
      const sourceRect = options.sourceRect || effectRect;
      const effectOriginX = Number.isFinite(effectRect?.x) ? effectRect.x : 0;
      const effectOriginY = Number.isFinite(effectRect?.y) ? effectRect.y : 0;
      const effectOptions = {
        height,
        originX: effectOriginX,
        originY: effectOriginY,
        rect: effectRect,
        sourceRect,
        width,
      };
      let texture = sourceTexture;

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false) {
            continue;
          }

          if (effect.type === "gaussian-blur") {
            const radius = this.getGaussianBlurRadius({ effects: [effect] });

            texture = this.applyGaussianBlurTexture(texture, radius, effectOptions);
          } else if (effect.type === "motion-blur") {
            const motionBlur = this.getLayerMotionBlur({ effects: [effect] });

            if (motionBlur) {
              texture = this.applyMotionBlurTexture(texture, motionBlur.distance, motionBlur.angle, effectOptions);
            }
          } else if (effect.type === "field-blur") {
            const fieldBlur = this.getLayerFieldBlur({ effects: [effect] });

            if (fieldBlur) {
              texture = this.applyFieldBlurTexture(texture, fieldBlur.pins, effectOptions);
            }
          } else if (effect.type === "radial-blur") {
            const radialBlur = this.getLayerRadialBlur({ effects: [effect] });

            if (radialBlur) {
              texture = this.applyRadialBlurTexture(
                texture,
                radialBlur.amount,
                radialBlur.centerX,
                radialBlur.centerY,
                radialBlur.mode,
                effectOptions,
              );
            }
          } else if (effect.type === "grain") {
            const grain = this.getLayerGrain({ effects: [effect] });

            if (grain) {
              texture = this.applyGrainTexture(texture, grain, effectOptions);
            }
          } else if (effect.type === "noise") {
            const noise = this.getLayerNoise({ effects: [effect] });

            if (noise) {
              texture = this.applyNoiseTexture(texture, noise, effectOptions);
            }
          } else if (effect.type === "threshold") {
            const threshold = this.getLayerThreshold({ effects: [effect] });

            if (threshold) {
              texture = this.applyThresholdTexture(texture, threshold, effectOptions);
            }
          } else if (effect.type === "curves") {
            const curves = this.getLayerCurves({ effects: [effect] });

            if (curves) {
              texture = this.applyCurvesTexture(texture, curves, effectOptions);
            }
          } else if (effect.type === "color-overlay") {
            const colorOverlay = this.getLayerColorOverlay({ effects: [effect] });

            if (colorOverlay) {
              texture = this.applyColorOverlayTexture(texture, colorOverlay, effectOptions);
            }
          } else if (effect.type === "stroke") {
            const stroke = this.getLayerStroke({ effects: [effect] });

            if (stroke) {
              texture = this.applyLayerStrokeTexture(texture, stroke, effectOptions);
            }
          }
        }

        return texture;
      }

      const radius = this.getGaussianBlurRadius(layer);
      const motionBlur = this.getLayerMotionBlur(layer);
      const fieldBlur = this.getLayerFieldBlur(layer);
      const radialBlur = this.getLayerRadialBlur(layer);
      const grain = this.getLayerGrain(layer);
      const noise = this.getLayerNoise(layer);
      const threshold = this.getLayerThreshold(layer);
      const curves = this.getLayerCurves(layer);
      const colorOverlay = this.getLayerColorOverlay(layer);
      const stroke = this.getLayerStroke(layer);

      if (radius > 0) {
        texture = this.applyGaussianBlurTexture(texture, radius, effectOptions);
      }

      if (motionBlur) {
        texture = this.applyMotionBlurTexture(texture, motionBlur.distance, motionBlur.angle, effectOptions);
      }

      if (fieldBlur) {
        texture = this.applyFieldBlurTexture(texture, fieldBlur.pins, effectOptions);
      }

      if (radialBlur) {
        texture = this.applyRadialBlurTexture(
          texture,
          radialBlur.amount,
          radialBlur.centerX,
          radialBlur.centerY,
          radialBlur.mode,
          effectOptions,
        );
      }

      if (grain) {
        texture = this.applyGrainTexture(texture, grain, effectOptions);
      }

      if (noise) {
        texture = this.applyNoiseTexture(texture, noise, effectOptions);
      }

      if (threshold) {
        texture = this.applyThresholdTexture(texture, threshold, effectOptions);
      }

      if (curves) {
        texture = this.applyCurvesTexture(texture, curves, effectOptions);
      }

      if (colorOverlay) {
        texture = this.applyColorOverlayTexture(texture, colorOverlay, effectOptions);
      }

      if (stroke) {
        texture = this.applyLayerStrokeTexture(texture, stroke, effectOptions);
      }

      return texture;
    }
,

    rasterizeLayerEffects(layer, options = {}) {
      if (!this.hasEnabledLayerEffects(layer) || !layer?.id) {
        return null;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("effects.rasterize", {
        layerId: layer.id,
        source: options.source || "layer-effects-rasterize",
      }) : null;

      try {
      const captureBeforeSnapshot = options.captureBeforeSnapshot !== false;
      const captureAfterSnapshot = options.captureAfterSnapshot !== false;
      let target = this.ensureWritableRasterTarget(layer.id, {
        source: options.source || "layer-effects-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layer.id);
      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layer.id, {
          emit: false,
          source: options.source || "layer-effects-rasterize",
        }) || target;
      }

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const beforeSnapshot = captureBeforeSnapshot
        ? this.createRasterSnapshot(target, null, "layer-effects-rasterize-before")
        : null;

      if (captureBeforeSnapshot && !beforeSnapshot?.texture) {
        return null;
      }

      const renderResult = this.getLayerRenderResult(layer, target);
      const renderTexture = renderResult?.texture;
      const targetRect = this.getRasterTargetDocumentRect(target);
      const renderRect = renderResult?.rect || targetRect;
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [targetRect, renderRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const needsTargetSwap = renderRect && !this.areDocumentRectsEqual(renderRect, targetRect);
      const destinationTarget = needsTargetSwap
        ? this.createRasterTargetForRect(renderRect)
        : target;

      if (
        destinationTarget &&
        destinationTarget !== target &&
        (wasSparseTarget || target.materializedFromSparse === true)
      ) {
        destinationTarget.materializedFromSparse = true;
        destinationTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

      const didCopy = renderTexture &&
        renderTexture !== target.texture &&
        destinationTarget?.framebuffer &&
        this.copyTextureToRasterTarget(renderTexture, destinationTarget, {
          height: renderResult.height,
          width: renderResult.width,
        });

      if (!didCopy) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        if (beforeSnapshot) {
          this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
            emit: false,
            preferSparse: wasSparseTarget,
            source: "layer-effects-rasterize-rollback",
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }

        return null;
      }

      if (needsTargetSwap) {
        this.replaceRasterTarget(layer.id, destinationTarget, {
          emit: false,
          invalidate: false,
          rects: previewDirtyRects,
          source: options.source || "layer-effects-rasterize",
        });
      }

      const finalTarget = needsTargetSwap ? destinationTarget : target;
      const afterSnapshot = captureAfterSnapshot
        ? this.createRasterSnapshot(finalTarget, null, "layer-effects-rasterize-after")
        : null;

      if (captureAfterSnapshot && !afterSnapshot?.texture) {
        if (beforeSnapshot) {
          this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
            emit: false,
            preferSparse: wasSparseTarget,
            source: "layer-effects-rasterize-rollback",
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }

        return null;
      }

      const shouldRetileFinalTarget = Boolean(
        (wasSparseTarget || finalTarget.materializedFromSparse === true) &&
        this.isPaintRasterLayer(layer.id, finalTarget)
      );
      const finalLiveTarget = shouldRetileFinalTarget
        ? this.sparsifyRasterTarget(layer.id, finalTarget, {
            emit: false,
            source: `${options.source || "layer-effects-rasterize"}-retile`,
            tileSize: finalTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || finalTarget
        : finalTarget;
      const finalTargetRect = this.getRasterTargetDocumentRect(finalLiveTarget);
      const beforeBytes = this.getRasterRectBytes(beforeSnapshot?.rect);
      const afterBytes = this.getRasterRectBytes(afterSnapshot?.rect);
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);
      const scratchBytes =
        this.estimateRasterTargetBytes(this.layerEffectScratchA) +
        this.estimateRasterTargetBytes(this.layerEffectScratchB);
      const persistentBytes = beforeBytes + afterBytes + targetBytes;
      const estimatedPeakBytes = persistentBytes + sourceBytes + scratchBytes;
      const coverage = this.getRasterOperationCoverage(finalTargetRect);

      const memoryPolicy = this.recordRasterOperation({
        afterBytes,
        beforeBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes,
        historyBytes: beforeBytes + afterBytes,
        layerId: layer.id,
        operationType: "layer-effects-rasterize",
        persistentBytes,
        policy: this.classifyRasterOperationMemory(estimatedPeakBytes, coverage),
        reason: options.source || "layer-effects-rasterize",
        scratchBytes,
        source: options.source || "layer-effects-rasterize",
        sourceBytes,
        sourceRect: targetRect,
        targetBytes,
        targetRect: finalTargetRect,
        tool: "layer-effects",
      });

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId: layer.id,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: options.source || "layer-effects-rasterize",
        });
      }

      return {
        afterPreferSparse: shouldRetileFinalTarget,
        afterSnapshot,
        beforePreferSparse: wasSparseTarget || target.materializedFromSparse === true,
        beforeSnapshot,
        layerId: layer.id,
        memoryPolicy,
        previewDirtyRects: previewDirtyRects.map((rect) => ({ ...rect })),
        targetRect: finalTargetRect ? { ...finalTargetRect } : null,
      };
      } finally {
        trace?.end({
          layerId: layer.id,
          source: options.source || "layer-effects-rasterize",
        });
      }
    }

    });
  };
})(window.CBO = window.CBO || {});
