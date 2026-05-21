(function registerWebglPrograms(namespace) {
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

  namespace.DocumentRendererMixins.webglPrograms = function installRegisterWebglPrograms(DocumentRenderer, internals) {
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
    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader document renderer WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info =
          gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione dello shader document renderer.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }
,

    createProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, ARTBOARD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, ARTBOARD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma document renderer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma document renderer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipDestToSourceUv: gl.getUniformLocation(program, "u_clipDestToSourceUv"),
          clipSourceUvRect: gl.getUniformLocation(program, "u_clipSourceUvRect"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          drawOrigin: gl.getUniformLocation(program, "u_drawOrigin"),
          maskClipMode: gl.getUniformLocation(program, "u_maskClipMode"),
          maskClipRect: gl.getUniformLocation(program, "u_maskClipRect"),
          maskClipRectCount: gl.getUniformLocation(program, "u_maskClipRectCount"),
          maskClipRects: gl.getUniformLocation(program, "u_maskClipRects[0]"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          selectionClipMode: gl.getUniformLocation(program, "u_selectionClipMode"),
          selectionClipRect: gl.getUniformLocation(program, "u_selectionClipRect"),
          selectionClipTexture: gl.getUniformLocation(program, "u_selectionClipTexture"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          gridMode: gl.getUniformLocation(program, "u_gridMode"),
        },
      };
    }
,

    createPuppetProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PUPPET_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PUPPET_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma puppet WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma puppet.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }
,

    createTexturedQuadProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, TEXTURED_QUAD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma textured quad edge AA WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma textured quad edge AA.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipDestToSourceUv: gl.getUniformLocation(program, "u_clipDestToSourceUv"),
          clipSourceUvRect: gl.getUniformLocation(program, "u_clipSourceUvRect"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          destToSourceUv: gl.getUniformLocation(program, "u_destToSourceUv"),
          edgeFeatherPixels: gl.getUniformLocation(program, "u_edgeFeatherPixels"),
          quadEdges: gl.getUniformLocation(program, "u_quadEdges[0]"),
          sourceUvRect: gl.getUniformLocation(program, "u_sourceUvRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }
,

    createPerspectiveQuadProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma perspective quad WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma perspective quad.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipDestToSourceUv: gl.getUniformLocation(program, "u_clipDestToSourceUv"),
          clipSourceUvRect: gl.getUniformLocation(program, "u_clipSourceUvRect"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          destToSourceUv: gl.getUniformLocation(program, "u_destToSourceUv"),
          edgeFeatherPixels: gl.getUniformLocation(program, "u_edgeFeatherPixels"),
          quadEdges: gl.getUniformLocation(program, "u_quadEdges[0]"),
          sourceUvRect: gl.getUniformLocation(program, "u_sourceUvRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }
,

    createGaussianBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma gaussian blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma gaussian blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          radius: gl.getUniformLocation(program, "u_radius"),
          texelStep: gl.getUniformLocation(program, "u_texelStep"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createMotionBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, MOTION_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, MOTION_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma motion blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma motion blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          directionTexelStep: gl.getUniformLocation(program, "u_directionTexelStep"),
          distance: gl.getUniformLocation(program, "u_distance"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createFieldBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, FIELD_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FIELD_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma field blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma field blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          pinCount: gl.getUniformLocation(program, "u_pinCount"),
          pins: gl.getUniformLocation(program, "u_pins[0]"),
          texelSize: gl.getUniformLocation(program, "u_texelSize"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createRadialBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, RADIAL_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, RADIAL_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma radial blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma radial blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          amount: gl.getUniformLocation(program, "u_amount"),
          center: gl.getUniformLocation(program, "u_center"),
          mode: gl.getUniformLocation(program, "u_mode"),
          texelSize: gl.getUniformLocation(program, "u_texelSize"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createGrainProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, GRAIN_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma grain WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma grain.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          amount: gl.getUniformLocation(program, "u_amount"),
          monochrome: gl.getUniformLocation(program, "u_monochrome"),
          origin: gl.getUniformLocation(program, "u_origin"),
          scale: gl.getUniformLocation(program, "u_scale"),
          seed: gl.getUniformLocation(program, "u_seed"),
          size: gl.getUniformLocation(program, "u_size"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createNoiseProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, NOISE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma noise WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma noise.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          amount: gl.getUniformLocation(program, "u_amount"),
          monochrome: gl.getUniformLocation(program, "u_monochrome"),
          origin: gl.getUniformLocation(program, "u_origin"),
          scale: gl.getUniformLocation(program, "u_scale"),
          seed: gl.getUniformLocation(program, "u_seed"),
          size: gl.getUniformLocation(program, "u_size"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createThresholdProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, THRESHOLD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma threshold WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma threshold.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          texture: gl.getUniformLocation(program, "u_texture"),
          threshold: gl.getUniformLocation(program, "u_threshold"),
        },
      };
    }
,

    createCurvesProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, CURVES_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma curves WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma curves.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          curveLut: gl.getUniformLocation(program, "u_curveLut"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }
,

    createLayerCompositeProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, LAYER_COMPOSITE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma compositing layer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma compositing layer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          backdropTexture: gl.getUniformLocation(program, "u_backdropTexture"),
          blendMode: gl.getUniformLocation(program, "u_blendMode"),
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipDestToSourceUv: gl.getUniformLocation(program, "u_clipDestToSourceUv"),
          clipSourceUvRect: gl.getUniformLocation(program, "u_clipSourceUvRect"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          maskClipMode: gl.getUniformLocation(program, "u_maskClipMode"),
          maskClipRect: gl.getUniformLocation(program, "u_maskClipRect"),
          maskClipRectCount: gl.getUniformLocation(program, "u_maskClipRectCount"),
          maskClipRects: gl.getUniformLocation(program, "u_maskClipRects[0]"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          sourceRect: gl.getUniformLocation(program, "u_sourceRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
        },
      };
    }
,

    ensurePuppetProgramInfo() {
      if (!this.puppetProgramInfo) {
        this.puppetProgramInfo = this.createPuppetProgramInfo();
      }

      return this.puppetProgramInfo;
    }
,

    ensureTexturedQuadProgramInfo() {
      if (!this.texturedQuadProgramInfo) {
        this.texturedQuadProgramInfo = this.createTexturedQuadProgramInfo();
      }

      return this.texturedQuadProgramInfo;
    }
,

    ensurePerspectiveQuadProgramInfo() {
      if (!this.perspectiveQuadProgramInfo) {
        this.perspectiveQuadProgramInfo = this.createPerspectiveQuadProgramInfo();
      }

      return this.perspectiveQuadProgramInfo;
    }
,

    ensureGaussianBlurProgramInfo() {
      if (!this.gaussianBlurProgramInfo) {
        this.gaussianBlurProgramInfo = this.createGaussianBlurProgramInfo();
      }

      return this.gaussianBlurProgramInfo;
    }
,

    ensureMotionBlurProgramInfo() {
      if (!this.motionBlurProgramInfo) {
        this.motionBlurProgramInfo = this.createMotionBlurProgramInfo();
      }

      return this.motionBlurProgramInfo;
    }
,

    ensureFieldBlurProgramInfo() {
      if (!this.fieldBlurProgramInfo) {
        this.fieldBlurProgramInfo = this.createFieldBlurProgramInfo();
      }

      return this.fieldBlurProgramInfo;
    }
,

    ensureRadialBlurProgramInfo() {
      if (!this.radialBlurProgramInfo) {
        this.radialBlurProgramInfo = this.createRadialBlurProgramInfo();
      }

      return this.radialBlurProgramInfo;
    }
,

    ensureGrainProgramInfo() {
      if (!this.grainProgramInfo) {
        this.grainProgramInfo = this.createGrainProgramInfo();
      }

      return this.grainProgramInfo;
    }
,

    ensureNoiseProgramInfo() {
      if (!this.noiseProgramInfo) {
        this.noiseProgramInfo = this.createNoiseProgramInfo();
      }

      return this.noiseProgramInfo;
    }
,

    ensureThresholdProgramInfo() {
      if (!this.thresholdProgramInfo) {
        this.thresholdProgramInfo = this.createThresholdProgramInfo();
      }

      return this.thresholdProgramInfo;
    }
,

    ensureCurvesProgramInfo() {
      if (!this.curvesProgramInfo) {
        this.curvesProgramInfo = this.createCurvesProgramInfo();
      }

      return this.curvesProgramInfo;
    }
,

    ensureLayerCompositeProgramInfo() {
      if (!this.layerCompositeProgramInfo) {
        this.layerCompositeProgramInfo = this.createLayerCompositeProgramInfo();
      }

      return this.layerCompositeProgramInfo;
    }
,

    createTexturedQuadResource() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse per il quad raster transform.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, 6 * 4 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(
        1,
        2,
        gl.FLOAT,
        false,
        4 * Float32Array.BYTES_PER_ELEMENT,
        2 * Float32Array.BYTES_PER_ELEMENT,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { buffer, vao };
    }
,

    ensureTexturedQuadResource() {
      if (!this.texturedQuad) {
        this.texturedQuad = this.createTexturedQuadResource();
      }

      return this.texturedQuad;
    }
,

    deleteRasterWarpMeshResource() {
      const resource = this.rasterWarpMesh;

      if (!resource) {
        return;
      }

      const gl = this.gl;

      if (resource.vbo) {
        gl.deleteBuffer(resource.vbo);
      }

      if (resource.ebo) {
        gl.deleteBuffer(resource.ebo);
      }

      if (resource.vao) {
        gl.deleteVertexArray(resource.vao);
      }

      this.rasterWarpMesh = null;
    }
,

    createRasterWarpMeshResource(cols = RASTER_WARP_MESH_COLS, rows = RASTER_WARP_MESH_ROWS) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ebo = gl.createBuffer();
      const vertices = new Float32Array((cols + 1) * (rows + 1) * 4);
      const indices = new Uint32Array(cols * rows * 6);
      let indexOffset = 0;

      if (!vao || !vbo || !ebo) {
        if (vao) {
          gl.deleteVertexArray(vao);
        }

        if (vbo) {
          gl.deleteBuffer(vbo);
        }

        if (ebo) {
          gl.deleteBuffer(ebo);
        }

        throw new Error("Impossibile creare la mesh raster warp WebGL2.");
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;

          indices[indexOffset++] = a;
          indices[indexOffset++] = c;
          indices[indexOffset++] = b;
          indices[indexOffset++] = b;
          indices[indexOffset++] = c;
          indices[indexOffset++] = d;
        }
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      this.rasterWarpMesh = {
        cols,
        ebo,
        indexCount: indices.length,
        indices,
        rows,
        vao,
        vbo,
        vertices,
      };

      return this.rasterWarpMesh;
    }
,

    ensureRasterWarpMeshResource(cols = RASTER_WARP_MESH_COLS, rows = RASTER_WARP_MESH_ROWS) {
      if (this.rasterWarpMesh?.cols === cols && this.rasterWarpMesh?.rows === rows) {
        return this.rasterWarpMesh;
      }

      this.deleteRasterWarpMeshResource();
      return this.createRasterWarpMeshResource(cols, rows);
    }
,

    getRasterTransformEdgeFeatherPixels(options = {}) {
      if (Number.isFinite(options.edgeFeatherPixels)) {
        return Math.max(0, Number(options.edgeFeatherPixels));
      }

      if (options.preserveHardEdges === true) {
        return 0;
      }

      return RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS;
    }
,

    getRasterTransformEdgeAaPaddingForCamera(camera = {}, edgeFeatherPixels = RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS) {
      const featherPixels = Math.max(0, Number(edgeFeatherPixels) || 0);

      if (featherPixels <= 0) {
        return 0;
      }

      const zoom = Math.abs(Number(camera.zoom));
      const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

      return Math.max(
        1,
        Math.ceil(featherPixels / safeZoom) + 1,
      );
    }
,

    padRasterRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const safePadding = Math.max(0, Math.ceil(Number(padding) || 0));

      return {
        height: rect.height + safePadding * 2,
        width: rect.width + safePadding * 2,
        x: rect.x - safePadding,
        y: rect.y - safePadding,
      };
    }
,

    createExpandedQuadDrawVertices(quad, padding = 0) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let index = 0; index < 4; index += 1) {
        const point = quad[index];

        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return null;
        }

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      const safePadding = Math.max(0, Number(padding) || 0);
      const x0 = minX - safePadding;
      const y0 = minY - safePadding;
      const x1 = maxX + safePadding;
      const y1 = maxY + safePadding;

      return new Float32Array([
        x0, y0, 0, 1,
        x1, y0, 1, 1,
        x1, y1, 1, 0,
        x0, y0, 0, 1,
        x1, y1, 1, 0,
        x0, y1, 0, 0,
      ]);
    }
,

    computeQuadEdgeUniformData(quad) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      const points = quad.slice(0, 4).map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }));

      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        return null;
      }

      const center = points.reduce(
        (result, point) => ({
          x: result.x + point.x / points.length,
          y: result.y + point.y / points.length,
        }),
        { x: 0, y: 0 },
      );
      const edgeData = new Float32Array(16);

      for (let index = 0; index < 4; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % 4];
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const length = Math.hypot(dx, dy);

        if (length < 0.000001) {
          return null;
        }

        let nx = -dy / length;
        let ny = dx / length;
        let c = -(nx * current.x + ny * current.y);

        if (nx * center.x + ny * center.y + c < 0) {
          nx *= -1;
          ny *= -1;
          c *= -1;
        }

        const offset = index * 4;

        edgeData[offset] = nx;
        edgeData[offset + 1] = ny;
        edgeData[offset + 2] = c;
        edgeData[offset + 3] = 0;
      }

      return edgeData;
    }
,

    computeAffineDestToSourceUvMatrix(quad) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      const q0 = quad[0];
      const q1 = quad[1];
      const q3 = quad[3];

      if (
        !q0 ||
        !q1 ||
        !q3 ||
        !Number.isFinite(q0.x) ||
        !Number.isFinite(q0.y) ||
        !Number.isFinite(q1.x) ||
        !Number.isFinite(q1.y) ||
        !Number.isFinite(q3.x) ||
        !Number.isFinite(q3.y)
      ) {
        return null;
      }

      const ax = q1.x - q0.x;
      const ay = q1.y - q0.y;
      const bx = q3.x - q0.x;
      const by = q3.y - q0.y;
      const determinant = ax * by - ay * bx;

      if (Math.abs(determinant) < 0.000001) {
        return null;
      }

      const m00 = by / determinant;
      const m01 = -bx / determinant;
      const m02 = (bx * q0.y - by * q0.x) / determinant;
      const m10 = -ay / determinant;
      const m11 = ax / determinant;
      const m12 = (ay * q0.x - ax * q0.y) / determinant;

      return new Float32Array([
        m00, m10, 0,
        m01, m11, 0,
        m02, m12, 1,
      ]);
    }
,

    computeDestToSourceUvHomography(destQuad) {
      if (!Array.isArray(destQuad) || destQuad.length < 4) {
        return null;
      }

      const points = destQuad.map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }));

      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        return null;
      }

      const x0 = points[0].x;
      const y0 = points[0].y;
      const x1 = points[1].x;
      const y1 = points[1].y;
      const x2 = points[2].x;
      const y2 = points[2].y;
      const x3 = points[3].x;
      const y3 = points[3].y;
      const dx1 = x1 - x2;
      const dx2 = x3 - x2;
      const dy1 = y1 - y2;
      const dy2 = y3 - y2;
      const sx = x0 - x1 + x2 - x3;
      const sy = y0 - y1 + y2 - y3;
      const epsilon = 0.000001;
      let a;
      let b;
      let c;
      let d;
      let e;
      let f;
      let g;
      let h;

      if (Math.abs(sx) < epsilon && Math.abs(sy) < epsilon) {
        a = x1 - x0;
        b = x3 - x0;
        c = x0;
        d = y1 - y0;
        e = y3 - y0;
        f = y0;
        g = 0;
        h = 0;
      } else {
        const det = dx1 * dy2 - dx2 * dy1;

        if (Math.abs(det) < epsilon) {
          return null;
        }

        g = (sx * dy2 - sy * dx2) / det;
        h = (dx1 * sy - dy1 * sx) / det;
        a = x1 - x0 + g * x1;
        b = x3 - x0 + h * x3;
        c = x0;
        d = y1 - y0 + g * y1;
        e = y3 - y0 + h * y3;
        f = y0;
      }

      const c00 = e - f * h;
      const c01 = f * g - d;
      const c02 = d * h - e * g;
      const c10 = c * h - b;
      const c11 = a - c * g;
      const c12 = b * g - a * h;
      const c20 = b * f - c * e;
      const c21 = c * d - a * f;
      const c22 = a * e - b * d;
      const detM = a * c00 + b * c01 + c * c02;

      if (Math.abs(detM) < epsilon) {
        return null;
      }

      const inverseDet = 1 / detM;

      return new Float32Array([
        c00 * inverseDet, c01 * inverseDet, c02 * inverseDet,
        c10 * inverseDet, c11 * inverseDet, c12 * inverseDet,
        c20 * inverseDet, c21 * inverseDet, c22 * inverseDet,
      ]);
    }
,

    normalizeTextureSourceUvRect(rect = null) {
      const x = Number(rect?.x);
      const y = Number(rect?.y);
      const width = Number(rect?.width);
      const height = Number(rect?.height);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return { height: 1, width: 1, x: 0, y: 0 };
      }

      return {
        height,
        width,
        x,
        y,
      };
    }
,

    normalizeRasterWarpControlPoints(controlPoints) {
      if (!Array.isArray(controlPoints) || controlPoints.length !== 4) {
        return null;
      }

      const normalized = [];

      for (let row = 0; row < 4; row += 1) {
        if (!Array.isArray(controlPoints[row]) || controlPoints[row].length !== 4) {
          return null;
        }

        normalized[row] = [];

        for (let col = 0; col < 4; col += 1) {
          const point = controlPoints[row][col];
          const x = Number(point?.x);
          const y = Number(point?.y);

          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }

          normalized[row][col] = { x, y };
        }
      }

      return normalized;
    }
,

    getRasterWarpBernstein(index, t) {
      const clampedT = Math.min(1, Math.max(0, Number(t) || 0));
      const inverse = 1 - clampedT;

      if (index === 0) {
        return inverse * inverse * inverse;
      }

      if (index === 1) {
        return 3 * clampedT * inverse * inverse;
      }

      if (index === 2) {
        return 3 * clampedT * clampedT * inverse;
      }

      return clampedT * clampedT * clampedT;
    }
,

    evaluateRasterWarpSurface(u, v, controlPoints) {
      let x = 0;
      let y = 0;

      for (let row = 0; row < 4; row += 1) {
        const rowWeight = this.getRasterWarpBernstein(row, v);

        for (let col = 0; col < 4; col += 1) {
          const point = controlPoints[row][col];
          const weight = rowWeight * this.getRasterWarpBernstein(col, u);

          x += point.x * weight;
          y += point.y * weight;
        }
      }

      return { x, y };
    }
,

    getRasterWarpBounds(controlPoints) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!points) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const point = points[row][col];

          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
,

    offsetRasterWarpControlPoints(controlPoints, dx = 0, dy = 0) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!points) {
        return null;
      }

      return points.map((row) =>
        row.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        }))
      );
    }
,

    updateRasterWarpMeshVertices(resource, controlPoints) {
      const vertices = resource?.vertices;

      if (!vertices) {
        return false;
      }

      const cols = resource.cols;
      const rows = resource.rows;
      let offset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        const v = gridY / rows;

        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const u = gridX / cols;
          const point = this.evaluateRasterWarpSurface(u, v, controlPoints);

          vertices[offset] = point.x;
          vertices[offset + 1] = point.y;
          vertices[offset + 2] = u;
          vertices[offset + 3] = 1 - v;
          offset += 4;
        }
      }

      return true;
    }
,

    setRasterTextureSampling(texture, minFilter, magFilter = minFilter) {
      if (!texture || !Number.isFinite(minFilter)) {
        return;
      }

      const gl = this.gl;
      const previousTextureUnit = typeof gl.getParameter === "function"
        ? gl.getParameter(gl.ACTIVE_TEXTURE)
        : null;
      const resolvedMagFilter = Number.isFinite(magFilter) ? magFilter : minFilter;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, resolvedMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, null);

      if (Number.isFinite(previousTextureUnit)) {
        gl.activeTexture(previousTextureUnit);
      }
    }
,

    getViewportTextureMagFilter(camera = {}) {
      if (!isPixelPerfectRenderingEnabled()) {
        return this.gl.LINEAR;
      }

      const zoom = Math.abs(Number(camera?.zoom) || 1);

      return zoom >= PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD
        ? this.gl.NEAREST
        : this.gl.LINEAR;
    }
,

    shouldDrawPixelGrid(camera = {}) {
      if (!isPixelPerfectRenderingEnabled()) {
        return false;
      }

      const zoom = Math.abs(Number(camera?.zoom) || 1);

      return zoom >= PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD;
    }
,

    shouldUsePreviewCacheForCamera(camera = {}, previewCacheDimensions = null) {
      const zoom = Math.abs(Number(camera?.zoom) || 1);
      const dimensions = previewCacheDimensions || this.getPreviewCacheDimensions();
      const cacheScale = Math.max(0.0001, Number(dimensions?.scale) || 1);

      // Usa la cache mipmapped per lo zoom out, ma mai quando andrebbe ingrandita.
      // Cosi' sotto il 100% il downsample resta pulito, sopra il 100% resta full-res.
      return zoom < PREVIEW_CACHE_ZOOM_THRESHOLD && zoom <= cacheScale * 1.01;
    }
,

    setDisabledClipBaseUniforms(uniforms, options = {}) {
      const gl = this.gl;
      const textureUnit = Number.isFinite(options.textureUnit)
        ? Math.max(0, Math.round(options.textureUnit))
        : 2;
      const fallbackWidth = Math.max(1, Math.round(options.fallbackWidth || this.width || 1));
      const fallbackHeight = Math.max(1, Math.round(options.fallbackHeight || this.height || 1));

      gl.uniform1i(uniforms.clipTexture, textureUnit);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipOrigin, 0, 0);
      gl.uniform2f(uniforms.clipTextureSize, fallbackWidth, fallbackHeight);
      gl.uniformMatrix3fv(uniforms.clipDestToSourceUv, false, CLIP_IDENTITY_UV_MATRIX);
      gl.uniform4f(uniforms.clipSourceUvRect, 0, 0, 1, 1);
      return false;
    }
,

    setClipBaseUniforms(uniforms, clipBase = null, options = {}) {
      const gl = this.gl;
      const textureUnit = Number.isFinite(options.textureUnit)
        ? Math.max(0, Math.round(options.textureUnit))
        : 2;
      const fallbackWidth = Math.max(1, Math.round(options.fallbackWidth || this.width || 1));
      const fallbackHeight = Math.max(1, Math.round(options.fallbackHeight || this.height || 1));
      if (!clipBase?.visible) {
        return this.setDisabledClipBaseUniforms(uniforms, {
          fallbackHeight,
          fallbackWidth,
          textureUnit,
        });
      }

      const transformSampling = this.getClipBaseTransformSampling(clipBase);
      const texture = transformSampling?.texture || clipBase?.target?.texture;

      if (!texture) {
        return this.setDisabledClipBaseUniforms(uniforms, {
          fallbackHeight,
          fallbackWidth,
          textureUnit,
        });
      }

      const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
        ? Math.min(1, Math.max(0, clipBase.layer.opacity))
        : 1;
      const textureMagFilter = Number.isFinite(options.textureMagFilter)
        ? options.textureMagFilter
        : gl.LINEAR;

      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      this.setRasterTextureSampling(texture, gl.LINEAR, textureMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.clipTexture, textureUnit);
      gl.uniform1f(uniforms.clipOpacity, clipOpacity);

      if (transformSampling) {
        const sourceUvRect = transformSampling.sourceUvRect || { x: 0, y: 0, width: 1, height: 1 };

        gl.uniform1f(uniforms.clipMode, 2.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, fallbackWidth, fallbackHeight);
        gl.uniformMatrix3fv(uniforms.clipDestToSourceUv, false, transformSampling.matrix);
        gl.uniform4f(
          uniforms.clipSourceUvRect,
          sourceUvRect.x,
          sourceUvRect.y,
          sourceUvRect.width,
          sourceUvRect.height,
        );
      } else {
        const clipOrigin = this.getClipBaseOrigin(clipBase);

        gl.uniform1f(uniforms.clipMode, 1.0);
        gl.uniform2f(uniforms.clipOrigin, clipOrigin.x, clipOrigin.y);
        gl.uniform2f(
          uniforms.clipTextureSize,
          clipBase.target.width || fallbackWidth,
          clipBase.target.height || fallbackHeight,
        );
        gl.uniformMatrix3fv(uniforms.clipDestToSourceUv, false, CLIP_IDENTITY_UV_MATRIX);
        gl.uniform4f(uniforms.clipSourceUvRect, 0, 0, 1, 1);
      }

      gl.activeTexture(gl.TEXTURE0);
      return true;
    }
,

    setTransformClipUniforms(uniforms, clipBase = null, textureMagFilter = null) {
      return this.setClipBaseUniforms(uniforms, clipBase, {
        fallbackHeight: this.height,
        fallbackWidth: this.width,
        textureMagFilter,
        textureUnit: 1,
      });
    }
,

    clearClipBaseTexture(textureUnit = 2, didBindClipTexture = false) {
      if (!didBindClipTexture) {
        return;
      }

      const gl = this.gl;

      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
    }
,

    clearTransformClipTexture(didBindClipTexture = false) {
      this.clearClipBaseTexture(1, didBindClipTexture);
    }
,

    drawWarpTexturedMesh(texture, controlPoints, options = {}) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!texture || !points) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const resource = this.ensureRasterWarpMeshResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;

      if (!this.updateRasterWarpMeshVertices(resource, points)) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, resource.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, resource.vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindVertexArray(resource.vao);
      gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

      return true;
    }
,

    drawTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureTexturedQuadProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const edgeFeatherPixels = this.getRasterTransformEdgeFeatherPixels(options);
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;
      const sourceUvRect = this.normalizeTextureSourceUvRect(options.sourceUvRect);
      const matrix = this.computeAffineDestToSourceUvMatrix(quad);
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!matrix || !edgeData || !vertices) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniformMatrix3fv(uniforms.destToSourceUv, false, matrix);
      gl.uniform4f(uniforms.sourceUvRect, sourceUvRect.x, sourceUvRect.y, sourceUvRect.width, sourceUvRect.height);
      gl.uniform4fv(uniforms.quadEdges, edgeData);
      gl.uniform1f(uniforms.edgeFeatherPixels, edgeFeatherPixels);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);
      const didBindClipTexture = this.setTransformClipUniforms(
        uniforms,
        options.clipBase,
        textureFilter,
      );

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      this.clearTransformClipTexture(didBindClipTexture);

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

      return true;
    }
,

    drawPerspectiveTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const matrix = this.computeDestToSourceUvHomography(quad);

      if (!matrix) {
        return this.drawTexturedQuad(texture, quad, options);
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePerspectiveQuadProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const edgeFeatherPixels = this.getRasterTransformEdgeFeatherPixels(options);
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;
      const sourceUvRect = this.normalizeTextureSourceUvRect(options.sourceUvRect);
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!edgeData || !vertices) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniformMatrix3fv(uniforms.destToSourceUv, false, matrix);
      gl.uniform4f(uniforms.sourceUvRect, sourceUvRect.x, sourceUvRect.y, sourceUvRect.width, sourceUvRect.height);
      gl.uniform4fv(uniforms.quadEdges, edgeData);
      gl.uniform1f(uniforms.edgeFeatherPixels, edgeFeatherPixels);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);
      const didBindClipTexture = this.setTransformClipUniforms(
        uniforms,
        options.clipBase,
        textureFilter,
      );

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      this.clearTransformClipTexture(didBindClipTexture);

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

      return true;
    }

    });
  };
})(window.CBO = window.CBO || {});
