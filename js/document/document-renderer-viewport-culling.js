(function registerViewportCulling(namespace) {
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

  namespace.DocumentRendererMixins.viewportCulling = function installRegisterViewportCulling(DocumentRenderer, internals) {
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
      isHighQualityViewEnabled,
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
    const PREVIEW_CACHE_INTERACTION_DEFER_MS = 120;
    const PREVIEW_CACHE_LOW_ZOOM_MIN_SIZE = 512;
    const PREVIEW_CACHE_HIGH_QUALITY_LOW_ZOOM_MIN_SIZE = 1536;
    const PREVIEW_CACHE_ZOOM_OVERSAMPLE = 1.08;
    const PREVIEW_CACHE_HIGH_QUALITY_ZOOM_OVERSAMPLE = 1.6;
    const PREVIEW_CACHE_ZOOM_SIZE_STEP = 128;

    defineDocumentRendererMethods(DocumentRenderer, {
    createArtboardQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      const vertices = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse GPU per l'artboard.");
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

    normalizePreviewCacheDocumentRect(rect) {
      if (!rect) {
        return null;
      }

      const rawX = Number(rect.x);
      const rawY = Number(rect.y);
      const rawWidth = Number(rect.width);
      const rawHeight = Number(rect.height);
      const x = Number.isFinite(rawX) ? rawX : 0;
      const y = Number.isFinite(rawY) ? rawY : 0;
      const width = Number.isFinite(rawWidth) ? Math.max(1, rawWidth) : Math.max(1, this.width || 1);
      const height = Number.isFinite(rawHeight) ? Math.max(1, rawHeight) : Math.max(1, this.height || 1);
      const minX = Math.floor(x);
      const minY = Math.floor(y);
      const maxX = Math.ceil(x + width);
      const maxY = Math.ceil(y + height);

      return {
        height: Math.max(1, maxY - minY),
        width: Math.max(1, maxX - minX),
        x: minX,
        y: minY,
      };
    }
,

    clonePreviewCacheScopeInfo(scopeInfo) {
      if (!scopeInfo) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(scopeInfo));
      } catch (error) {
        return { ...scopeInfo };
      }
    }
,

    publishPreviewCacheScopeInfo(scopeInfo) {
      const snapshot = this.clonePreviewCacheScopeInfo(scopeInfo);

      this.previewCacheScopeInfo = snapshot;
      namespace.lastPreviewCacheScope = snapshot;

      return snapshot;
    }
,

    getPreviewCacheGlobalDocumentRect() {
      const rect = this.getDocumentBoundsRect?.() || this.getFullDocumentRect?.() || {
        height: Math.max(1, Math.round(this.height || 1)),
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };

      return this.normalizePreviewCacheDocumentRect(rect) || this.getFullDocumentRect();
    }
,

    getPreviewCacheScopeMode(options = {}) {
      const rawMode = String(
        options.previewCacheScope ||
        this.options?.previewCacheScope ||
        PREVIEW_CACHE_SCOPE_DEFAULT
      ).trim().toLowerCase();

      if (rawMode === "document" || rawMode === "all" || rawMode === "global") {
        return "document";
      }

      if (rawMode === "viewport" || rawMode === "visible-viewport") {
        return "visible-viewport";
      }

      return PREVIEW_CACHE_SCOPE_DEFAULT;
    }
,

    getPreviewCacheViewportRect(options = {}) {
      const camera = options.camera;
      const viewportWidth = Math.max(0, Math.round(Number(options.viewportWidth) || 0));
      const viewportHeight = Math.max(0, Math.round(Number(options.viewportHeight) || 0));

      if (!camera || viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
      }

      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const dpr = Number.isFinite(Number(options.dpr))
        ? Math.max(1, Number(options.dpr))
        : getCanvasPerformanceDpr();
      const overscanCssPx = Number.isFinite(Number(options.previewCacheOverscanCssPx))
        ? Math.max(0, Number(options.previewCacheOverscanCssPx))
        : this.getPreviewCacheOverscanCssPx();
      const visibleRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const overscanDoc = (overscanCssPx * dpr) / zoom;
      const renderRect = this.expandDocumentRect(visibleRect, overscanDoc) || visibleRect;

      return {
        dpr,
        overscanCssPx,
        renderRect: this.normalizePreviewCacheDocumentRect(renderRect),
        visibleRect: this.normalizePreviewCacheDocumentRect(visibleRect),
        zoom,
      };
    }
,

    getPreviewCacheArtboardRects() {
      if (this.options?.isolateDocumentArtboards) {
        return [];
      }

      return (namespace.getDocumentArtboards?.() || [])
        .map((artboard) => this.normalizePreviewCacheDocumentRect(artboard))
        .filter(Boolean);
    }
,

    getPreviewCacheArtboards() {
      if (this.options?.isolateDocumentArtboards) {
        return [];
      }

      return (namespace.getDocumentArtboards?.() || [])
        .map((artboard, index) => {
          const rect = this.normalizePreviewCacheDocumentRect(artboard);
          const id = String(artboard?.id || (index === 0 ? "active-document" : `artboard-${index + 1}`)).trim();

          return rect && id
            ? {
                id,
                rect,
              }
            : null;
        })
        .filter(Boolean);
    }
,

    getArtboardResidencyNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }
,

    ensureArtboardResidencyState() {
      if (!(this.artboardResidencyWarmUntilById instanceof Map)) {
        this.artboardResidencyWarmUntilById = new Map();
      }

      return this.artboardResidencyWarmUntilById;
    }
,

    isArtboardResidencyEnabled(options = {}) {
      return Boolean(
        options.enableArtboardResidency !== false &&
        this.options?.enableArtboardResidency !== false &&
        namespace.enableArtboardResidency !== false
      );
    }
,

    isArtboardResidencyBudgetEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardResidencyBudget !== false &&
        this.options?.enableArtboardResidencyBudget !== false &&
        namespace.enableArtboardResidencyBudget !== false
      );
    }
,

    isArtboardResidencyPrefetchEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardResidencyPrefetch !== false &&
        this.options?.enableArtboardResidencyPrefetch !== false &&
        namespace.enableArtboardResidencyPrefetch !== false
      );
    }
,

    isArtboardFlatPreviewsEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardFlatPreviews !== false &&
        this.options?.enableArtboardFlatPreviews !== false &&
        namespace.enableArtboardFlatPreviews !== false
      );
    }
,

    isArtboardTileResidencyEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardTileResidency !== false &&
        this.options?.enableArtboardTileResidency !== false &&
        namespace.enableArtboardTileResidency !== false
      );
    }
,

    getArtboardResidencySoftBudgetBytes(options = {}) {
      const rawBudget = Number.isFinite(Number(options.artboardResidencySoftBudgetBytes))
        ? Number(options.artboardResidencySoftBudgetBytes)
        : Number(this.options?.artboardResidencySoftBudgetBytes);

      return Math.max(0, Math.round(rawBudget || ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES));
    }
,

    getArtboardResidencyHardBudgetBytes(options = {}) {
      const softBudget = this.getArtboardResidencySoftBudgetBytes(options);
      const rawBudget = Number.isFinite(Number(options.artboardResidencyHardBudgetBytes))
        ? Number(options.artboardResidencyHardBudgetBytes)
        : Number(this.options?.artboardResidencyHardBudgetBytes);

      return Math.max(softBudget, Math.round(rawBudget || ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES));
    }
,

    ensureArtboardResidencyAccessState() {
      if (!(this.artboardResidencyAccessById instanceof Map)) {
        this.artboardResidencyAccessById = new Map();
      }

      return this.artboardResidencyAccessById;
    }
,

    getArtboardResidencyPrefetchDocPx(viewportRect = null, options = {}) {
      const cssPx = Number.isFinite(Number(options.artboardResidencyPrefetchCssPx))
        ? Math.max(0, Number(options.artboardResidencyPrefetchCssPx))
        : Math.max(0, Number(this.options?.artboardResidencyPrefetchCssPx) || ARTBOARD_RESIDENCY_PREFETCH_CSS_PX);
      const dpr = Number.isFinite(Number(viewportRect?.dpr || options.dpr))
        ? Math.max(1, Number(viewportRect?.dpr || options.dpr))
        : 1;
      const zoom = Number.isFinite(Number(viewportRect?.zoom || options.camera?.zoom))
        ? Math.max(0.0001, Math.abs(Number(viewportRect?.zoom || options.camera?.zoom)))
        : 1;

      return (cssPx * dpr) / zoom;
    }
,

    getLayerArtboardId(layerOrId = "") {
      const layer = typeof layerOrId === "object" && layerOrId
        ? layerOrId
        : this.layerModel?.findEntryById?.(String(layerOrId || "").trim());
      const layerId = String(layer?.id || (typeof layerOrId === "string" ? layerOrId : "")).trim();
      const explicitArtboardId = String(layer?.artboardId || "").trim();

      if (explicitArtboardId) {
        return explicitArtboardId;
      }

      if (!layerId || layer?.type === "background" || layerId === "background") {
        return "";
      }

      return String(this.layerModel?.findEntryArtboardId?.(layerId) || "").trim();
    }
,

    getActiveArtboardIdForResidency(options = {}) {
      const explicitArtboardId = String(options.artboardId || options.activeArtboardId || "").trim();

      if (explicitArtboardId) {
        return explicitArtboardId;
      }

      const selectedArtboardId = String(namespace.getSelectedDocumentArtboardId?.() || "").trim();

      if (selectedArtboardId) {
        return selectedArtboardId;
      }

      const activeLayerId = String(options.activeLayerId || this.layerModel?.activeLayerId || "").trim();
      const layerArtboardId = activeLayerId ? this.getLayerArtboardId(activeLayerId) : "";

      if (layerArtboardId) {
        return layerArtboardId;
      }

      return String(namespace.getActiveDocumentArtboardId?.({ layerId: activeLayerId }) || "").trim();
    }
,

    getDocumentRectUnion(rects = []) {
      const normalizedRects = (Array.isArray(rects) ? rects : [])
        .map((rect) => this.normalizePreviewCacheDocumentRect(rect))
        .filter(Boolean);

      if (normalizedRects.length === 0) {
        return null;
      }

      const bounds = normalizedRects.reduce((result, rect) => {
        if (!result) {
          return {
            bottom: rect.y + rect.height,
            left: rect.x,
            right: rect.x + rect.width,
            top: rect.y,
          };
        }

        return {
          bottom: Math.max(result.bottom, rect.y + rect.height),
          left: Math.min(result.left, rect.x),
          right: Math.max(result.right, rect.x + rect.width),
          top: Math.min(result.top, rect.y),
        };
      }, null);

      return bounds
        ? {
            height: Math.max(1, bounds.bottom - bounds.top),
            width: Math.max(1, bounds.right - bounds.left),
            x: bounds.left,
            y: bounds.top,
          }
        : null;
    }
,

    getDocumentRectIntersection(first, second) {
      const a = this.normalizePreviewCacheDocumentRect(first);
      const b = this.normalizePreviewCacheDocumentRect(second);

      if (!a || !b) {
        return null;
      }

      const x0 = Math.max(a.x, b.x);
      const y0 = Math.max(a.y, b.y);
      const x1 = Math.min(a.x + a.width, b.x + b.width);
      const y1 = Math.min(a.y + a.height, b.y + b.height);

      return x1 > x0 && y1 > y0
        ? {
            height: Math.max(1, y1 - y0),
            width: Math.max(1, x1 - x0),
            x: x0,
            y: y0,
          }
        : null;
    }
,

    documentRectContains(outer, inner) {
      const a = this.normalizePreviewCacheDocumentRect(outer);
      const b = this.normalizePreviewCacheDocumentRect(inner);

      return Boolean(
        a &&
        b &&
        b.x >= a.x &&
        b.y >= a.y &&
        b.x + b.width <= a.x + a.width &&
        b.y + b.height <= a.y + a.height
      );
    }
,

    getDocumentRectCenter(rect) {
      const normalizedRect = this.normalizePreviewCacheDocumentRect(rect);

      return normalizedRect
        ? {
            x: normalizedRect.x + normalizedRect.width / 2,
            y: normalizedRect.y + normalizedRect.height / 2,
          }
        : null;
    }
,

    getDocumentRectDistance(first, second) {
      const firstCenter = this.getDocumentRectCenter(first);
      const secondCenter = this.getDocumentRectCenter(second);

      if (!firstCenter || !secondCenter) {
        return 0;
      }

      const dx = firstCenter.x - secondCenter.x;
      const dy = firstCenter.y - secondCenter.y;

      return Math.sqrt(dx * dx + dy * dy);
    }
,

    resolveArtboardPrefetch(artboards = [], visibleRect = null, renderRect = null, viewportRect = null, options = {}) {
      if (!this.isArtboardResidencyPrefetchEnabled(options) || !visibleRect || !Array.isArray(artboards) || artboards.length === 0) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const previousVisibleRect = this.normalizePreviewCacheDocumentRect(this.artboardResidencyLast?.visibleRect);
      const currentVisibleRect = this.normalizePreviewCacheDocumentRect(visibleRect);

      if (!previousVisibleRect || !currentVisibleRect) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const previousCenter = this.getDocumentRectCenter(previousVisibleRect);
      const currentCenter = this.getDocumentRectCenter(currentVisibleRect);
      const dx = currentCenter.x - previousCenter.x;
      const dy = currentCenter.y - previousCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 1) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const leadRect = this.normalizePreviewCacheDocumentRect({
        height: currentVisibleRect.height,
        width: currentVisibleRect.width,
        x: currentVisibleRect.x + dx,
        y: currentVisibleRect.y + dy,
      });
      const prefetchPadding = this.getArtboardResidencyPrefetchDocPx(viewportRect, options);
      const prefetchRect = this.expandDocumentRect(
        this.getDocumentRectUnion([renderRect || currentVisibleRect, leadRect]) || currentVisibleRect,
        prefetchPadding,
      ) || currentVisibleRect;
      const artboardIds = artboards
        .filter((artboard) => this.documentRectsIntersect(artboard.rect, prefetchRect))
        .map((artboard) => artboard.id);

      return {
        artboardIds,
        rect: this.normalizePreviewCacheDocumentRect(prefetchRect),
      };
    }
,

    pruneExpiredArtboardWarmIds(now = this.getArtboardResidencyNow()) {
      const warmUntilById = this.ensureArtboardResidencyState();
      const warmIds = new Set();

      warmUntilById.forEach((until, artboardId) => {
        if (Number(until) > now) {
          warmIds.add(artboardId);
        } else {
          warmUntilById.delete(artboardId);
        }
      });

      return warmIds;
    }
,

    resolveArtboardResidency(options = {}) {
      const now = Number.isFinite(Number(options.now))
        ? Number(options.now)
        : this.getArtboardResidencyNow();
      const viewportRect = options.viewportRect || this.getPreviewCacheViewportRect(options);
      const visibleRect = this.normalizePreviewCacheDocumentRect(options.visibleRect || viewportRect?.visibleRect);
      const renderRect = this.normalizePreviewCacheDocumentRect(options.renderRect || viewportRect?.renderRect);
      const artboards = this.getPreviewCacheArtboards();
      const artboardById = new Map(artboards.map((artboard) => [artboard.id, artboard]));
      const activeArtboardId = this.getActiveArtboardIdForResidency(options);
      const visibleArtboards = visibleRect
        ? artboards.filter((artboard) => this.documentRectsIntersect(artboard.rect, visibleRect))
        : [];
      const renderArtboards = renderRect
        ? artboards.filter((artboard) => this.documentRectsIntersect(artboard.rect, renderRect))
        : visibleArtboards;
      const hotArtboardIds = new Set([
        ...visibleArtboards.map((artboard) => artboard.id),
        ...renderArtboards.map((artboard) => artboard.id),
      ]);

      if (activeArtboardId && artboardById.has(activeArtboardId)) {
        hotArtboardIds.add(activeArtboardId);
      }

      const prefetch = this.resolveArtboardPrefetch(artboards, visibleRect, renderRect, viewportRect, options);
      const warmArtboardIds = this.pruneExpiredArtboardWarmIds(now);
      (prefetch.artboardIds || []).forEach((artboardId) => {
        if (!hotArtboardIds.has(artboardId)) {
          warmArtboardIds.add(artboardId);
        }
      });
      const cacheArtboards = visibleArtboards.length > 0
        ? visibleArtboards
        : activeArtboardId && artboardById.has(activeArtboardId)
          ? [artboardById.get(activeArtboardId)]
          : [];
      const coldArtboardIds = artboards
        .map((artboard) => artboard.id)
        .filter((artboardId) => !hotArtboardIds.has(artboardId) && !warmArtboardIds.has(artboardId));
      const cacheRect = this.getDocumentRectUnion(cacheArtboards.map((artboard) => artboard.rect));

      return {
        activeArtboardId: activeArtboardId || "",
        artboardCount: artboards.length,
        artboards: artboards.map((artboard) => ({
          id: artboard.id,
          rect: { ...artboard.rect },
        })),
        cacheArtboardIds: cacheArtboards.map((artboard) => artboard.id),
        cacheArtboards: cacheArtboards.map((artboard) => ({
          id: artboard.id,
          rect: { ...artboard.rect },
        })),
        cacheRect: cacheRect ? { ...cacheRect } : null,
        coldArtboardIds,
        hotArtboardIds: Array.from(hotArtboardIds),
        prefetchArtboardIds: (prefetch.artboardIds || []).filter((artboardId) => !hotArtboardIds.has(artboardId)),
        prefetchRect: prefetch.rect ? { ...prefetch.rect } : null,
        renderArtboardIds: renderArtboards.map((artboard) => artboard.id),
        renderRect: renderRect ? { ...renderRect } : null,
        visibleArtboardIds: visibleArtboards.map((artboard) => artboard.id),
        visibleRect: visibleRect ? { ...visibleRect } : null,
        warmArtboardIds: Array.from(warmArtboardIds),
      };
    }
,

    cloneArtboardResidency(residency = null) {
      if (!residency) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(residency));
      } catch (error) {
        return { ...residency };
      }
    }
,

    resolveAndPublishArtboardResidency(options = {}) {
      if (!this.isArtboardResidencyEnabled(options)) {
        this.artboardResidencyLast = null;
        namespace.lastArtboardResidency = null;
        return null;
      }

      const now = Number.isFinite(Number(options.now))
        ? Number(options.now)
        : this.getArtboardResidencyNow();
      const firstPass = this.resolveArtboardResidency({ ...options, now });
      const warmUntilById = this.ensureArtboardResidencyState();
      const warmHoldMs = Number.isFinite(Number(this.options?.artboardResidencyWarmHoldMs))
        ? Math.max(0, Number(this.options.artboardResidencyWarmHoldMs))
        : ARTBOARD_RESIDENCY_WARM_HOLD_MS;
      const previousHotIds = new Set(this.artboardResidencyLast?.hotArtboardIds || []);
      const nextHotIds = new Set(firstPass.hotArtboardIds || []);

      previousHotIds.forEach((artboardId) => {
        if (!nextHotIds.has(artboardId)) {
          warmUntilById.set(artboardId, now + warmHoldMs);
        }
      });
      nextHotIds.forEach((artboardId) => warmUntilById.delete(artboardId));

      const nextResidency = this.resolveArtboardResidency({ ...options, now });
      const snapshot = this.cloneArtboardResidency(nextResidency);
      const accessById = this.ensureArtboardResidencyAccessState();

      [
        ...(nextResidency.hotArtboardIds || []),
        ...(nextResidency.prefetchArtboardIds || []),
      ].forEach((artboardId) => {
        if (artboardId) {
          accessById.set(artboardId, now);
        }
      });

      this.artboardResidencyLast = snapshot;
      namespace.lastArtboardResidency = snapshot;

      return nextResidency;
    }
,

    getArtboardResidencyViewOptions(options = {}) {
      return {
        activeArtboardId: options.activeArtboardId || "",
        activeLayerId: options.activeLayerId || "",
        camera: options.camera
          ? {
              x: Number(options.camera.x) || 0,
              y: Number(options.camera.y) || 0,
              zoom: Number(options.camera.zoom) || 1,
            }
          : null,
        dpr: options.dpr,
        viewportHeight: options.viewportHeight,
        viewportWidth: options.viewportWidth,
      };
    }
,

    getRasterTargetGpuBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetGpuBytes(tile);
        });

        return total;
      }

      return target.texture && target.state !== "CPU_COLD"
        ? this.estimateRasterTargetBytes(target)
        : 0;
    }
,

    getRasterTargetCpuBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetCpuBytes(tile);
        });

        return Math.max(total, Math.round(Number(target.cpuBytes) || 0));
      }

      return Math.max(
        0,
        Math.round(Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || 0),
      );
    }
,

    getSparseRasterTargetColdTileCount(target) {
      if (!this.isSparseRasterTarget(target)) {
        return 0;
      }

      let coldCount = 0;

      target.tiles?.forEach?.((tile) => {
        if (tile?.state === "CPU_COLD" || (!tile?.texture && tile?.cpuPixels instanceof Uint8Array)) {
          coldCount += 1;
        }
      });

      return coldCount;
    }
,

    estimateArtboardFlatPreviewBytes(preview) {
      return preview?.texture
        ? this.getRasterRectBytes(preview.width, preview.height)
        : 0;
    }
,

    collectArtboardResidencyMetrics(residency = this.artboardResidencyLast, orderedLayers = null, options = {}) {
      if (!residency) {
        return null;
      }

      const accessById = this.ensureArtboardResidencyAccessState();
      const visibleIds = new Set(residency.visibleArtboardIds || []);
      const renderIds = new Set(residency.renderArtboardIds || []);
      const hotIds = new Set(residency.hotArtboardIds || []);
      const warmIds = new Set(residency.warmArtboardIds || []);
      const coldIds = new Set(residency.coldArtboardIds || []);
      const prefetchIds = new Set(residency.prefetchArtboardIds || []);
      const activeArtboardId = residency.activeArtboardId || "";
      const visibleRect = residency.visibleRect || null;
      const metricsById = new Map((residency.artboards || []).map((artboard) => [
        artboard.id,
        {
          artboardId: artboard.id,
          coldLayerCount: 0,
          coldTileCount: 0,
          cpuBytes: 0,
          cpuRawBytes: 0,
          distanceFromVisible: this.getDocumentRectDistance(artboard.rect, visibleRect),
          flatPreviewBytes: 0,
          flatPreviewMiB: "0.00",
          hasFlatPreview: false,
          hot: hotIds.has(artboard.id),
          layerCount: 0,
          liveLayerCount: 0,
          liveTileCount: 0,
          gpuBytes: 0,
          lastAccessedAt: Math.max(0, Number(accessById.get(artboard.id)) || 0),
          prefetch: prefetchIds.has(artboard.id),
          rect: { ...artboard.rect },
          render: renderIds.has(artboard.id),
          status: coldIds.has(artboard.id)
            ? "cold"
            : hotIds.has(artboard.id)
              ? "hot"
              : warmIds.has(artboard.id)
                ? "warm"
                : "idle",
          visible: visibleIds.has(artboard.id),
          warm: warmIds.has(artboard.id),
        },
      ]));
      const layers = Array.isArray(orderedLayers)
        ? orderedLayers
        : this.getOrderedLayersBottomToTop();
      let globalGpuBytes = 0;
      let globalCpuBytes = 0;
      let globalCpuRawBytes = 0;

      for (const layer of layers) {
        const layerId = String(layer?.id || "").trim();
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;
        const gpuBytes = this.getRasterTargetGpuBytes(target);
        const cpuBytes = this.getRasterTargetCpuBytes(target);
        const cpuRawBytes = this.getRasterTargetCpuRawBytes?.(target) || cpuBytes;
        const artboardId = this.getLayerArtboardId(layer);
        const artboardMetrics = artboardId ? metricsById.get(artboardId) : null;

        if (!artboardMetrics) {
          globalGpuBytes += gpuBytes;
          globalCpuBytes += cpuBytes;
          globalCpuRawBytes += cpuRawBytes;
          continue;
        }

        artboardMetrics.layerCount += 1;
        artboardMetrics.gpuBytes += gpuBytes;
        artboardMetrics.cpuBytes += cpuBytes;
        artboardMetrics.cpuRawBytes += cpuRawBytes;

        if (target?.state === "CPU_COLD" || (!gpuBytes && cpuBytes > 0)) {
          artboardMetrics.coldLayerCount += 1;
        } else if (gpuBytes > 0) {
          artboardMetrics.liveLayerCount += 1;
        }

        if (this.isSparseRasterTarget(target)) {
          const coldTileCount = this.getSparseRasterTargetColdTileCount(target);

          artboardMetrics.coldTileCount += coldTileCount;
          artboardMetrics.liveTileCount += Math.max(0, (target.tiles?.size || 0) - coldTileCount);
        }
      }

      let totalGpuBytes = globalGpuBytes;
      let totalCpuBytes = globalCpuBytes;
      let totalCpuRawBytes = globalCpuRawBytes;
      let totalFlatPreviewBytes = 0;

      metricsById.forEach((artboardMetrics, artboardId) => {
        const previewBytes = this.estimateArtboardFlatPreviewBytes(this.artboardFlatPreviewsById?.get?.(artboardId));

        artboardMetrics.flatPreviewBytes = previewBytes;
        artboardMetrics.flatPreviewMiB = this.formatRasterMiB(previewBytes);
        artboardMetrics.hasFlatPreview = previewBytes > 0;
        artboardMetrics.gpuMiB = this.formatRasterMiB(artboardMetrics.gpuBytes);
        artboardMetrics.cpuMiB = this.formatRasterMiB(artboardMetrics.cpuBytes);
        artboardMetrics.cpuRawMiB = this.formatRasterMiB(artboardMetrics.cpuRawBytes);
        totalGpuBytes += artboardMetrics.gpuBytes;
        totalCpuBytes += artboardMetrics.cpuBytes;
        totalCpuRawBytes += artboardMetrics.cpuRawBytes;
        totalFlatPreviewBytes += previewBytes;
      });

      const softBudgetBytes = this.getArtboardResidencySoftBudgetBytes(options);
      const hardBudgetBytes = this.getArtboardResidencyHardBudgetBytes(options);
      const residentGpuBytes = totalGpuBytes + totalFlatPreviewBytes;
      const budgetPressure = !this.isArtboardResidencyBudgetEnabled(options)
        ? "disabled"
        : residentGpuBytes > hardBudgetBytes
          ? "hard"
          : residentGpuBytes > softBudgetBytes
            ? "soft"
            : "ok";
      const metrics = {
        artboards: Array.from(metricsById.values()).sort((first, second) =>
          (first.rect.y - second.rect.y) || (first.rect.x - second.rect.x) || first.artboardId.localeCompare(second.artboardId)
        ),
        budget: {
          hardBudgetBytes,
          hardBudgetMiB: this.formatRasterMiB(hardBudgetBytes),
          overHardBytes: Math.max(0, residentGpuBytes - hardBudgetBytes),
          overSoftBytes: Math.max(0, residentGpuBytes - softBudgetBytes),
          pressure: budgetPressure,
          softBudgetBytes,
          softBudgetMiB: this.formatRasterMiB(softBudgetBytes),
        },
        globalCpuBytes,
        globalCpuMiB: this.formatRasterMiB(globalCpuBytes),
        globalCpuRawBytes,
        globalGpuBytes,
        globalGpuMiB: this.formatRasterMiB(globalGpuBytes),
        residentGpuBytes,
        residentGpuMiB: this.formatRasterMiB(residentGpuBytes),
        totalCpuBytes,
        totalCpuMiB: this.formatRasterMiB(totalCpuBytes),
        totalCpuRawBytes,
        totalFlatPreviewBytes,
        totalFlatPreviewMiB: this.formatRasterMiB(totalFlatPreviewBytes),
        totalGpuBytes,
        totalGpuMiB: this.formatRasterMiB(totalGpuBytes),
      };

      this.artboardResidencyMetricsLast = metrics;
      namespace.lastArtboardResidencyMetrics = metrics;

      return metrics;
    }
,

    getArtboardResidencyCoolingPlan(residency, metrics = null, options = {}) {
      const resolvedMetrics = metrics || this.collectArtboardResidencyMetrics(residency, options.orderedLayers, options);

      if (!residency || !resolvedMetrics) {
        return {
          candidateArtboardIds: [],
          pressure: "none",
          projectedGpuBytes: 0,
          targetGpuBytes: 0,
        };
      }

      const protectedIds = new Set([
        residency.activeArtboardId || "",
        ...(residency.visibleArtboardIds || []),
        ...(residency.renderArtboardIds || []),
      ].filter(Boolean));
      const coldIds = new Set(residency.coldArtboardIds || []);
      const pressure = resolvedMetrics.budget?.pressure || "ok";
      const shouldUseBudget = this.isArtboardResidencyBudgetEnabled(options) &&
        (pressure === "soft" || pressure === "hard");
      const candidateMetrics = resolvedMetrics.artboards
        .filter((artboard) => {
          if (protectedIds.has(artboard.artboardId)) {
            return false;
          }

          return coldIds.has(artboard.artboardId) ||
            (shouldUseBudget && (artboard.status === "warm" || artboard.prefetch));
        })
        .sort((first, second) => {
          const firstPriority = coldIds.has(first.artboardId) ? 0 : 1;
          const secondPriority = coldIds.has(second.artboardId) ? 0 : 1;

          return (firstPriority - secondPriority) ||
            (first.lastAccessedAt - second.lastAccessedAt) ||
            (second.distanceFromVisible - first.distanceFromVisible) ||
            (second.gpuBytes - first.gpuBytes);
        });
      const targetGpuBytes = pressure === "hard"
        ? resolvedMetrics.budget.hardBudgetBytes
        : resolvedMetrics.budget.softBudgetBytes;
      let projectedGpuBytes = resolvedMetrics.residentGpuBytes;
      const candidateArtboardIds = [];

      for (const artboard of candidateMetrics) {
        if (!coldIds.has(artboard.artboardId) && projectedGpuBytes <= targetGpuBytes) {
          break;
        }

        candidateArtboardIds.push(artboard.artboardId);
        projectedGpuBytes = Math.max(0, projectedGpuBytes - artboard.gpuBytes);
      }

      const plan = {
        candidateArtboardIds,
        pressure,
        projectedGpuBytes,
        projectedGpuMiB: this.formatRasterMiB(projectedGpuBytes),
        targetGpuBytes,
        targetGpuMiB: this.formatRasterMiB(targetGpuBytes),
      };

      this.artboardResidencyPressureLast = plan;
      namespace.lastArtboardResidencyPressure = plan;

      return plan;
    }
,

    deleteArtboardFlatPreview(artboardId, options = {}) {
      const normalizedId = String(artboardId || "").trim();
      const preview = normalizedId ? this.artboardFlatPreviewsById?.get?.(normalizedId) : null;

      if (!preview) {
        return false;
      }

      if (preview.texture || preview.textureResourceId) {
        this.deleteRasterTexture?.(preview.texture || preview.textureResourceId);
        this.gl?.deleteTexture?.(preview.texture);
      }

      this.artboardFlatPreviewsById.delete(normalizedId);

      if (options.publish !== false) {
        namespace.lastArtboardFlatPreviewInvalidation = {
          artboardIds: [normalizedId],
          reason: options.reason || "delete-artboard-flat-preview",
        };
      }

      return true;
    }
,

    deleteAllArtboardFlatPreviews(reason = "delete-artboard-flat-previews") {
      const artboardIds = Array.from(this.artboardFlatPreviewsById?.keys?.() || []);

      artboardIds.forEach((artboardId) => this.deleteArtboardFlatPreview(artboardId, {
        publish: false,
        reason,
      }));

      namespace.lastArtboardFlatPreviewInvalidation = {
        artboardIds,
        reason,
      };

      return artboardIds.length;
    }
,

    getArtboardFlatPreview(artboardId) {
      const normalizedId = String(artboardId || "").trim();
      const preview = normalizedId ? this.artboardFlatPreviewsById?.get?.(normalizedId) : null;

      return preview?.texture ? preview : null;
    }
,

    invalidateArtboardFlatPreviews(reason = "unknown", options = {}, dirtyRects = null) {
      if (!this.artboardFlatPreviewsById?.size) {
        return 0;
      }

      const layerArtboardId = options.layerId ? this.getLayerArtboardId(options.layerId) : "";

      if (layerArtboardId && this.artboardFlatPreviewsById.has(layerArtboardId)) {
        return this.deleteArtboardFlatPreview(layerArtboardId, {
          reason: `${reason}:layer`,
        }) ? 1 : 0;
      }

      const rects = Array.isArray(dirtyRects)
        ? dirtyRects
        : this.getDirtyRegionRectsFromOptions?.(options) || [];

      if (!rects.length) {
        return this.deleteAllArtboardFlatPreviews(`${reason}:full`);
      }

      const artboardIds = [];

      this.artboardFlatPreviewsById.forEach((preview, artboardId) => {
        if (rects.some((rect) => this.documentRectsIntersect(preview.rect, rect))) {
          artboardIds.push(artboardId);
        }
      });
      artboardIds.forEach((artboardId) => this.deleteArtboardFlatPreview(artboardId, {
        publish: false,
        reason: `${reason}:dirty`,
      }));

      if (artboardIds.length > 0) {
        namespace.lastArtboardFlatPreviewInvalidation = {
          artboardIds,
          reason: `${reason}:dirty`,
        };
      }

      return artboardIds.length;
    }
,

    captureArtboardFlatPreviewsFromPreviewCache(options = {}) {
      if (
        !this.isArtboardFlatPreviewsEnabled(options) ||
        !this.previewTexture ||
        !this.previewFramebuffer ||
        !this.previewCacheDocumentRect ||
        !this.previewCacheWidth ||
        !this.previewCacheHeight
      ) {
        return null;
      }

      if (!(this.artboardFlatPreviewsById instanceof Map)) {
        this.artboardFlatPreviewsById = new Map();
      }

      if (!Number.isFinite(Number(this.artboardFlatPreviewVersion))) {
        this.artboardFlatPreviewVersion = 1;
      }

      const gl = this.gl;

      if (typeof gl?.copyTexSubImage2D !== "function") {
        return null;
      }

      const cacheRect = this.normalizePreviewCacheDocumentRect(this.previewCacheDocumentRect);
      const cacheScale = Math.max(0.0001, Number(this.previewCacheScale) || 1);
      const cacheWidth = Math.max(1, Math.round(this.previewCacheWidth || 1));
      const cacheHeight = Math.max(1, Math.round(this.previewCacheHeight || 1));
      const maxSize = Math.max(1, Math.round(Number(this.options?.artboardFlatPreviewMaxSize) || ARTBOARD_FLAT_PREVIEW_MAX_SIZE));
      const scopeIds = new Set(this.previewCacheScopeInfo?.visibleArtboardIds || this.previewCacheScopeInfo?.cacheArtboardIds || []);
      const artboards = this.getPreviewCacheArtboards()
        .filter((artboard) => scopeIds.size === 0 || scopeIds.has(artboard.id))
        .filter((artboard) => this.documentRectContains(cacheRect, artboard.rect));
      const capturedIds = [];
      const skippedIds = [];

      if (artboards.length === 0) {
        return null;
      }

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);

        for (const artboard of artboards) {
          const sourceX = Math.max(0, Math.floor((artboard.rect.x - cacheRect.x) * cacheScale));
          const sourceTop = Math.max(0, Math.floor((artboard.rect.y - cacheRect.y) * cacheScale));
          const sourceWidth = Math.min(cacheWidth - sourceX, Math.max(1, Math.round(artboard.rect.width * cacheScale)));
          const sourceHeight = Math.min(cacheHeight - sourceTop, Math.max(1, Math.round(artboard.rect.height * cacheScale)));
          const sourceY = Math.max(0, cacheHeight - sourceTop - sourceHeight);

          if (sourceWidth <= 0 || sourceHeight <= 0 || sourceWidth > maxSize || sourceHeight > maxSize) {
            skippedIds.push(artboard.id);
            continue;
          }

          const texture = gl.createTexture?.();

          if (!texture) {
            skippedIds.push(artboard.id);
            continue;
          }

          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sourceWidth, sourceHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sourceX, sourceY, sourceWidth, sourceHeight);

          this.deleteArtboardFlatPreview(artboard.id, {
            publish: false,
            reason: "replace-artboard-flat-preview",
          });

          const textureRow = this.registerRasterTexture(texture, {
            bbox: { ...artboard.rect },
            height: sourceHeight,
            kind: "artboardFlatPreview",
            label: `flat preview ${artboard.id}`,
            ownerId: artboard.id,
            ownerType: "cache",
            purgeable: true,
            reason: "capture-artboard-flat-preview",
            width: sourceWidth,
          });

          this.artboardFlatPreviewsById.set(artboard.id, {
            artboardId: artboard.id,
            bytes: this.getRasterRectBytes(sourceWidth, sourceHeight),
            capturedAt: this.getArtboardResidencyNow(),
            height: sourceHeight,
            rect: { ...artboard.rect },
            scale: cacheScale,
            source: "preview-cache",
            texture,
            textureResourceId: textureRow?.id || "",
            version: this.artboardFlatPreviewVersion++,
            width: sourceWidth,
          });
          capturedIds.push(artboard.id);
        }
      } catch (error) {
        console.warn?.("[CBO renderer] Impossibile catturare preview flattened per artboard.", error);
        return null;
      } finally {
        gl.bindTexture?.(gl.TEXTURE_2D, null);
        gl.bindFramebuffer?.(gl.FRAMEBUFFER, null);
      }

      const report = {
        capturedIds,
        skippedIds,
        source: options.reason || "preview-cache",
      };

      namespace.lastArtboardFlatPreviewCapture = report;

      return report;
    }
,

    artboardHasOnlyColdRasterTargets(artboardId, orderedLayers = []) {
      let hasRasterLayer = false;

      for (const layer of orderedLayers) {
        if (layer?.visible === false || this.getLayerArtboardId(layer) !== artboardId) {
          continue;
        }

        const target = this.rasterTargetsByLayerId?.get?.(layer.id);

        if (!target) {
          return false;
        }

        hasRasterLayer = true;

        if (this.getRasterTargetGpuBytes(target) > 0) {
          return false;
        }
      }

      return hasRasterLayer;
    }
,

    getArtboardFlatPreviewFallbackIds(residency, orderedLayers = [], options = {}) {
      if (
        !residency ||
        !this.isArtboardFlatPreviewsEnabled(options) ||
        options.activeStrokeTexture ||
        this.rasterTransformPreview ||
        this.vectorTextTransformPreviewLayerId
      ) {
        return new Set();
      }

      const activeArtboardId = residency.activeArtboardId || "";
      const candidateIds = new Set(residency.visibleArtboardIds || []);
      const fallbackIds = new Set();

      candidateIds.forEach((artboardId) => {
        if (
          !artboardId ||
          artboardId === activeArtboardId ||
          !this.getArtboardFlatPreview(artboardId) ||
          !this.artboardHasOnlyColdRasterTargets(artboardId, orderedLayers)
        ) {
          return;
        }

        fallbackIds.add(artboardId);
      });

      return fallbackIds;
    }
,

    isLayerInColdArtboard(layerOrId = "") {
      const artboardId = this.getLayerArtboardId(layerOrId);

      return Boolean(
        artboardId &&
        Array.isArray(this.artboardResidencyLast?.coldArtboardIds) &&
        this.artboardResidencyLast.coldArtboardIds.includes(artboardId)
      );
    }
,

    hydrateHotArtboardTargets(residency, orderedLayers = [], options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        return 0;
      }

      const hotIds = new Set([
        ...(residency.hotArtboardIds || []),
        ...(residency.warmArtboardIds || []),
      ]);
      const skipArtboardIds = new Set(options.skipArtboardIds || []);
      let hydratedCount = 0;

      for (const layer of orderedLayers) {
        const layerId = String(layer?.id || "").trim();
        const artboardId = this.getLayerArtboardId(layer);
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

        if (!layerId || !artboardId || !hotIds.has(artboardId) || skipArtboardIds.has(artboardId) || !target) {
          continue;
        }

        if (this.isSparseRasterTarget(target)) {
          hydratedCount += this.hydrateSparseRasterTargetForRect(layerId, target, options.renderRect || residency.renderRect, {
            reason: options.reason || "artboard-residency-hot-hydrate",
          });
          continue;
        }

        if (target.state !== "CPU_COLD") {
          continue;
        }

        if (this.hydrateRasterTarget(target, {
          kind: "layer",
          label: layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.reason || "artboard-residency-hot-hydrate",
        })) {
          hydratedCount += 1;
        }
      }

      return hydratedCount;
    }
,

    hydrateSparseRasterTargetForRect(layerId, target, rect = null, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(target)) {
        return 0;
      }

      let hydratedCount = 0;
      const renderRect = this.normalizePreviewCacheDocumentRect(rect);

      target.tiles?.forEach?.((tile) => {
        if (!tile || tile.state !== "CPU_COLD") {
          return;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (renderRect && !this.documentRectsIntersect(tileRect, renderRect)) {
          return;
        }

        const ownerId = `${layerId}:${tile.tx}:${tile.ty}`;

        if (this.hydrateRasterTarget(tile, {
          kind: "paintTile",
          label: `${layerId} tile ${tile.tx},${tile.ty}`,
          layerId,
          ownerId,
          ownerType: "live",
          purgeable: false,
          reason: options.reason || "sparse-tile-render-hydrate",
        })) {
          hydratedCount += 1;
        }
      });

      if (hydratedCount > 0 && target.state === "CPU_COLD") {
        target.state = "GPU_PARTIAL";
      }

      return hydratedCount;
    }
,

    dehydrateSparseRasterTargetOutsideRect(layerId, target, keepRect = null, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(target)) {
        return null;
      }

      const protectedRect = this.normalizePreviewCacheDocumentRect(keepRect);
      let cooledTileCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;

      target.tiles?.forEach?.((tile) => {
        if (!tile || tile.state === "CPU_COLD" || !tile.texture || this.needsCopyOnWriteDetach(tile)) {
          return;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (protectedRect && this.documentRectsIntersect(tileRect, protectedRect)) {
          return;
        }

        const beforeBytes = this.estimateRasterTargetBytes(tile);

        if (this.dehydrateRasterTarget(tile, {
          layerId,
          reason: options.reason || "artboard-tile-residency",
        })) {
          cooledTileCount += 1;
          releasedRawBytes += beforeBytes;
          storedCpuBytes += this.getRasterTargetCpuBytes(tile);
        }
      });

      if (cooledTileCount === 0) {
        return null;
      }

      const liveTileCount = Math.max(0, (target.tiles?.size || 0) - this.getSparseRasterTargetColdTileCount(target));

      target.state = liveTileCount > 0 ? "GPU_PARTIAL" : "CPU_COLD";
      target.cpuBytes = this.getRasterTargetCpuBytes(target);
      target.cpuRawBytes = this.getRasterTargetCpuRawBytes?.(target) || target.cpuBytes;

      return {
        cooledTileCount,
        layerId,
        releasedRawBytes,
        storedCpuBytes,
      };
    }
,

    shouldDehydrateLayerForArtboardResidency(layer, target, coldArtboardIds) {
      if (!layer?.id || !target || !coldArtboardIds?.size) {
        return false;
      }

      if (layer.type === "group" || layer.type === "background" || layer.id === "background") {
        return false;
      }

      const artboardId = this.getLayerArtboardId(layer);

      return Boolean(
        artboardId &&
        coldArtboardIds.has(artboardId) &&
        target.state !== "CPU_COLD" &&
        !this.needsCopyOnWriteDetach(target)
      );
    }
,

    applyArtboardTileResidency(residency, orderedLayers = [], options = {}) {
      if (!residency || !this.isArtboardTileResidencyEnabled(options)) {
        return null;
      }

      const metrics = options.metrics || this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const pressure = metrics?.budget?.pressure || "ok";

      if (pressure !== "soft" && pressure !== "hard" && options.forceTileResidency !== true) {
        return null;
      }

      const keepRect = residency.renderRect || residency.visibleRect;

      if (!keepRect) {
        return null;
      }

      let cooledTileCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;
      const cooledLayerIds = [];

      for (const layer of orderedLayers) {
        const layerId = String(layer?.id || "").trim();
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

        if (
          !layerId ||
          layer?.visible === false ||
          layer?.clippingMask === true ||
          this.hasAdvancedLayerBlendMode(layer) ||
          this.hasEnabledLayerEffects(layer) ||
          this.hasPuppetLayerTransform(layer) ||
          !this.isSparseRasterTarget(target)
        ) {
          continue;
        }

        const report = this.dehydrateSparseRasterTargetOutsideRect(layerId, target, keepRect, {
          reason: options.reason || "artboard-tile-residency",
        });

        if (!report) {
          continue;
        }

        cooledTileCount += report.cooledTileCount;
        releasedRawBytes += report.releasedRawBytes;
        storedCpuBytes += report.storedCpuBytes;
        cooledLayerIds.push(layerId);
      }

      return cooledTileCount > 0
        ? {
            cooledLayerIds,
            cooledTileCount,
            releasedRawBytes,
            releasedRawMiB: this.formatRasterMiB(releasedRawBytes),
            storedCpuBytes,
            storedCpuMiB: this.formatRasterMiB(storedCpuBytes),
          }
        : null;
    }
,

    applyArtboardColdStorage(residency = this.artboardResidencyLast, options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        return null;
      }

      if (options.activeStrokeTexture || options.activeStroke === true || this.rasterTransformPreview || this.hasArtboardDragPreview?.()) {
        return null;
      }

      const orderedLayers = Array.isArray(options.orderedLayers)
        ? options.orderedLayers
        : this.getOrderedLayersBottomToTop();
      const metricsBefore = options.metrics || this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const coolingPlan = this.getArtboardResidencyCoolingPlan(residency, metricsBefore, {
        ...options,
        orderedLayers,
      });
      const coldArtboardIds = new Set(coolingPlan.candidateArtboardIds || residency.coldArtboardIds || []);

      if (orderedLayers.length === 0) {
        return null;
      }

      let cooledLayerCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;
      const cooledLayerIds = [];

      if (coldArtboardIds.size > 0) {
        for (const layer of orderedLayers) {
          const layerId = String(layer?.id || "").trim();
          const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

          if (!this.shouldDehydrateLayerForArtboardResidency(layer, target, coldArtboardIds)) {
            continue;
          }

          const beforeBytes = this.getRasterTargetGpuBytes(target) || this.estimateRasterTargetBytes(target);

          if (this.dehydrateRasterTarget(target, {
            layerId,
            reason: options.reason || "artboard-residency-cold",
          })) {
            cooledLayerCount += 1;
            releasedRawBytes += beforeBytes;
            storedCpuBytes += this.getRasterTargetCpuBytes?.(target) || 0;
            cooledLayerIds.push(layerId);
          }
        }
      }

      const tileReport = this.applyArtboardTileResidency(residency, orderedLayers, {
        ...options,
        metrics: metricsBefore,
        reason: options.reason || "artboard-tile-residency",
      });

      if (cooledLayerCount === 0 && !tileReport) {
        return null;
      }

      if (tileReport) {
        releasedRawBytes += tileReport.releasedRawBytes;
        storedCpuBytes += tileReport.storedCpuBytes;
      }

      const metricsAfter = this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const report = {
        coldArtboardIds: Array.from(coldArtboardIds),
        cooledLayerCount,
        cooledLayerIds,
        coolingPlan,
        metricsAfter,
        metricsBefore,
        releasedRawBytes,
        releasedRawMiB: this.formatRasterMiB?.(releasedRawBytes) || releasedRawBytes,
        source: options.reason || "artboard-residency-cold",
        storedCpuBytes,
        storedCpuMiB: this.formatRasterMiB?.(storedCpuBytes) || storedCpuBytes,
        tileResidency: tileReport,
      };

      this.artboardResidencyLastColdStorage = report;
      namespace.lastArtboardResidencyColdStorage = report;

      return report;
    }
,

    dispatchArtboardResidencyBusy(isBusy, detail = {}) {
      if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return false;
      }

      try {
        if (typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("cbo:artboard-residency-busy", {
            detail: {
              active: Boolean(isBusy),
              label: "OPTIMIZING",
              source: "artboard-residency",
              ...detail,
            },
          }));
        }
      } catch (error) {
        return false;
      }

      return true;
    }
,

    afterArtboardResidencyBusyPaint(callback) {
      const run = typeof callback === "function" ? callback : () => {};
      const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (handler) => window.setTimeout?.(handler, 16);

      raf(() => {
        raf(run);
      });
    }
,

    finishArtboardResidencyBusy() {
      const hide = () => this.dispatchArtboardResidencyBusy(false, {
        reason: "artboard-residency-idle-cold",
      });

      if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
        window.setTimeout(() => this.afterArtboardResidencyBusyPaint(hide), 120);
      } else {
        hide();
      }
    }
,

    cancelArtboardResidencyIdleTimer(reason = "cancelled") {
      if (this.artboardResidencyIdleTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
        window.clearTimeout(this.artboardResidencyIdleTimer);
      }

      this.artboardResidencyIdleTimer = 0;
    }
,

    scheduleArtboardResidencyMaintenance(residency, options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        this.cancelArtboardResidencyIdleTimer("disabled-or-empty-residency");
        return false;
      }

      if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
        return false;
      }

      this.artboardResidencyLastViewOptions = this.getArtboardResidencyViewOptions(options);
      this.cancelArtboardResidencyIdleTimer("rescheduled");

      const metrics = options.metrics || this.collectArtboardResidencyMetrics(residency, options.orderedLayers, options);
      const pressure = metrics?.budget?.pressure || "ok";
      const overBudget = pressure === "soft" || pressure === "hard";
      const hasColdOrWarm = (residency.coldArtboardIds?.length || 0) > 0 ||
        (residency.warmArtboardIds?.length || 0) > 0 ||
        overBudget;

      if (!hasColdOrWarm || options.activeStrokeTexture || options.deferPreviewCacheUpdate === true) {
        return false;
      }

      const idleDelay = Number.isFinite(Number(this.options?.artboardResidencyIdleDelayMs))
        ? Math.max(0, Number(this.options.artboardResidencyIdleDelayMs))
        : ARTBOARD_RESIDENCY_IDLE_DELAY_MS;
      const warmHold = Number.isFinite(Number(this.options?.artboardResidencyWarmHoldMs))
        ? Math.max(0, Number(this.options.artboardResidencyWarmHoldMs))
        : ARTBOARD_RESIDENCY_WARM_HOLD_MS;
      const delay = Math.max(idleDelay, warmHold);

      this.artboardResidencyIdleTimer = window.setTimeout(() => {
        this.artboardResidencyIdleTimer = 0;

        if (this.isDisposed) {
          return;
        }

        this.dispatchArtboardResidencyBusy(true, {
          reason: "artboard-residency-idle-cold",
        });

        this.afterArtboardResidencyBusyPaint(() => {
          if (this.isDisposed) {
            this.dispatchArtboardResidencyBusy(false, {
              reason: "disposed",
            });
            return;
          }

          try {
            const viewOptions = this.artboardResidencyLastViewOptions || {};
            const nextResidency = this.resolveAndPublishArtboardResidency({
              ...viewOptions,
              now: this.getArtboardResidencyNow(),
            });

            this.applyArtboardColdStorage(nextResidency, {
              reason: "artboard-residency-idle-cold",
            });
          } finally {
            this.finishArtboardResidencyBusy();
          }
        });
      }, delay);

      return true;
    }
,

    resolvePreviewCacheDocumentRect(options = {}) {
      const globalRect = this.getPreviewCacheGlobalDocumentRect();
      const mode = this.getPreviewCacheScopeMode(options);
      const baseScopeInfo = {
        documentRect: { ...globalRect },
        mode: "document",
        reason: mode === "document" ? "forced-document" : "fallback-document",
        scope: mode,
      };

      if (mode === "document") {
        return {
          documentRect: globalRect,
          scopeInfo: baseScopeInfo,
        };
      }

      const viewportRect = this.getPreviewCacheViewportRect(options);

      if (!viewportRect?.visibleRect || !viewportRect.renderRect) {
        return {
          documentRect: globalRect,
          scopeInfo: baseScopeInfo,
        };
      }

      if (mode === "visible-viewport") {
        const documentRect = viewportRect.renderRect;

        return {
          documentRect,
          scopeInfo: {
            documentRect: { ...documentRect },
            mode: "visible-viewport",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: "forced-viewport",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      const artboardResidency = this.resolveArtboardResidency({
        ...options,
        viewportRect,
      });
      const artboardRects = artboardResidency.artboards.map((artboard) => artboard.rect);
      const visibleArtboards = artboardResidency.cacheArtboards.map((artboard) => artboard.rect);

      if (visibleArtboards.length === 1) {
        const documentRect = visibleArtboards[0];

        return {
          documentRect,
          scopeInfo: {
            artboardCount: artboardRects.length,
            cacheArtboardIds: [...artboardResidency.cacheArtboardIds],
            documentRect: { ...documentRect },
            mode: "visible-artboard",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: artboardResidency.visibleArtboardIds.length === 1
              ? "single-visible-artboard"
              : "active-artboard-fallback",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleArtboardCount: artboardResidency.visibleArtboardIds.length,
            visibleArtboardIds: [...artboardResidency.visibleArtboardIds],
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      if (visibleArtboards.length > 1) {
        const documentRect = this.getDocumentRectUnion(visibleArtboards) || viewportRect.renderRect;

        return {
          documentRect,
          scopeInfo: {
            artboardCount: artboardRects.length,
            cacheArtboardIds: [...artboardResidency.cacheArtboardIds],
            documentRect: { ...documentRect },
            mode: "visible-artboards",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: "multiple-visible-artboards",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleArtboardCount: visibleArtboards.length,
            visibleArtboardIds: [...artboardResidency.visibleArtboardIds],
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      return {
        documentRect: globalRect,
        scopeInfo: {
          ...baseScopeInfo,
          artboardCount: artboardRects.length,
          overscanCssPx: viewportRect.overscanCssPx,
          renderRect: { ...viewportRect.renderRect },
          visibleArtboardCount: 0,
          visibleArtboardIds: [],
          visibleRect: { ...viewportRect.visibleRect },
        },
      };
    }
,

    getPreviewCacheDocumentRect(options = {}) {
      return this.resolvePreviewCacheDocumentRect(options).documentRect;
    }
,

    getPreviewCacheDimensions(options = {}) {
      const resolvedPreviewRect = this.resolvePreviewCacheDocumentRect(options);
      const documentRect = resolvedPreviewRect.documentRect;
      const documentWidth = documentRect.width;
      const documentHeight = documentRect.height;
      const documentMaxSize = Math.max(documentWidth, documentHeight);
      let maxSize = this.getPreviewCacheMaxSize(options);
      const zoom = Math.abs(Number(options.camera?.zoom) || 0);
      const dpr = Math.max(1, Number(options.dpr) || 1);
      let mipmapped = true;

      if (
        zoom > 0 &&
        zoom < PREVIEW_CACHE_ZOOM_THRESHOLD &&
        documentMaxSize > 0
      ) {
        const highQualityView = isHighQualityViewEnabled();
        const zoomOversample = highQualityView
          ? PREVIEW_CACHE_HIGH_QUALITY_ZOOM_OVERSAMPLE
          : PREVIEW_CACHE_ZOOM_OVERSAMPLE;
        const lowZoomMinSize = highQualityView
          ? PREVIEW_CACHE_HIGH_QUALITY_LOW_ZOOM_MIN_SIZE
          : PREVIEW_CACHE_LOW_ZOOM_MIN_SIZE;
        const targetScale = Math.min(1, zoom * dpr * zoomOversample);
        const targetSize = Math.ceil(documentMaxSize * targetScale);
        const zoomMaxSize = Math.ceil(targetSize / PREVIEW_CACHE_ZOOM_SIZE_STEP) * PREVIEW_CACHE_ZOOM_SIZE_STEP;

        maxSize = Math.min(maxSize, Math.max(lowZoomMinSize, zoomMaxSize));
        mipmapped = highQualityView;
      }

      const scale = Math.min(1, maxSize / Math.max(documentWidth, documentHeight));
      const width = Math.max(1, Math.floor(documentWidth * scale));
      const height = Math.max(1, Math.floor(documentHeight * scale));
      const effectiveScale = Math.min(width / documentWidth, height / documentHeight);

      return {
        documentHeight,
        documentRect,
        documentWidth,
        documentX: documentRect.x,
        documentY: documentRect.y,
        height,
        mipmapped,
        scale: Math.max(0.0001, effectiveScale),
        scopeInfo: resolvedPreviewRect.scopeInfo,
        width,
      };
    }
,

    getPreviewCacheExactDocumentRect(fallbackRect = null) {
      const documentRect = this.normalizePreviewCacheDocumentRect(
        this.previewCacheDocumentRect || fallbackRect || this.getPreviewCacheDocumentRect(),
      ) || this.getPreviewCacheGlobalDocumentRect();
      const cacheScale = Math.max(0.0001, Number(this.previewCacheScale) || 1);
      const cacheWidth = Math.max(0, Math.round(Number(this.previewCacheWidth) || 0));
      const cacheHeight = Math.max(0, Math.round(Number(this.previewCacheHeight) || 0));

      if (cacheWidth <= 0 || cacheHeight <= 0) {
        return documentRect;
      }

      return {
        height: Math.max(1, cacheHeight / cacheScale),
        width: Math.max(1, cacheWidth / cacheScale),
        x: documentRect.x,
        y: documentRect.y,
      };
    }
,

    createPreviewCache(options = {}) {
      if (isAndroidPreviewCacheDisabled(options)) {
        if (this.previewTexture || this.previewFramebuffer) {
          this.deletePreviewCache();
        }

        this.previewCacheDirty = true;
        this.previewCacheReason = "android-preview-cache-disabled";
        this.previewDirtyRects = null;
        this.previewDirtyCompactOptions = null;
        this.previewLastDirtyMode = "android-full-render";
        this.previewLastDirtyRect = null;
        this.previewCacheReady = false;
        return false;
      }

      const dimensions = this.getPreviewCacheDimensions(options);

      if (
        this.previewTexture &&
        this.previewFramebuffer &&
        this.areDocumentRectsEqual(this.previewCacheDocumentRect, dimensions.documentRect) &&
        this.previewCacheWidth === dimensions.width &&
        this.previewCacheHeight === dimensions.height &&
        this.previewCacheMipmapped === dimensions.mipmapped
      ) {
        this.publishPreviewCacheScopeInfo(dimensions.scopeInfo);
        return true;
      }

      if (this.previewTexture || this.previewFramebuffer) {
        this.deletePreviewCache();
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

        console.warn("Preview mipmap non disponibile: impossibile allocare la cache.");
        return false;
      }

      const { documentHeight, documentWidth, height, mipmapped, scale, width } = dimensions;
      const levels = mipmapped
        ? Math.max(1, Math.floor(Math.log2(Math.max(width, height))) + 1)
        : 1;

      gl.bindTexture(gl.TEXTURE_2D, texture);

      if (typeof gl.texStorage2D === "function" && gl.RGBA8) {
        gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
      } else {
        for (let level = 0; level < levels; level++) {
          const levelWidth = Math.max(1, width >> level);
          const levelHeight = Math.max(1, height >> level);

          gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            gl.RGBA,
            levelWidth,
            levelHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
        }
      }

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (Number.isFinite(gl.TEXTURE_BASE_LEVEL) && Number.isFinite(gl.TEXTURE_MAX_LEVEL)) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn("Preview FBO incompleto: uso il rendering full-res come fallback.");
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewTexture = texture;
      this.previewFramebuffer = framebuffer;
      this.previewCacheWidth = width;
      this.previewCacheHeight = height;
      this.previewCacheScale = scale;
      this.previewCacheDocumentRect = { ...dimensions.documentRect };
      this.publishPreviewCacheScopeInfo(dimensions.scopeInfo);
      this.previewMipLevels = levels;
      this.previewCacheMipmapped = mipmapped;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";

      const textureRow = this.registerRasterTexture(texture, {
        bbox: {
          x: dimensions.documentRect.x,
          y: dimensions.documentRect.y,
          width: documentWidth,
          height: documentHeight,
        },
        height,
        kind: "previewMip",
        label: "preview mip cache",
        mipLevels: levels,
        ownerId: "preview-cache",
        ownerType: "cache",
        purgeable: true,
        reason: "create-preview-cache",
        width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        bbox: {
          x: dimensions.documentRect.x,
          y: dimensions.documentRect.y,
          width: documentWidth,
          height: documentHeight,
        },
        height,
        kind: "previewMipFramebuffer",
        label: "preview mip framebuffer",
        linkedTextureId: textureRow?.id || "",
        ownerId: "preview-cache",
        ownerType: "cache",
        purgeable: true,
        reason: "create-preview-cache",
        width,
      });

      return true;
    }
,

    deletePreviewCache() {
      const gl = this.gl;

      this.clearPreviewCacheInteractionDefer?.();
      this.deletePreviewHqMipmapResources?.();

      if (this.previewFramebuffer) {
        this.deleteRasterFramebuffer(this.previewFramebuffer);
        gl.deleteFramebuffer(this.previewFramebuffer);
        this.previewFramebuffer = null;
      }

      if (this.previewTexture) {
        this.deleteRasterTexture(this.previewTexture);
        gl.deleteTexture(this.previewTexture);
        this.previewTexture = null;
      }

      this.previewCacheWidth = 0;
      this.previewCacheHeight = 0;
      this.previewCacheScale = 1;
      this.previewCacheDocumentRect = null;
      this.previewCacheScopeInfo = null;
      namespace.lastPreviewCacheScope = null;
      this.previewMipLevels = 0;
      this.previewCacheMipmapped = true;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewCacheReady = false;
    }
,

    deletePreviewHqMipmapResources() {
      const gl = this.gl;

      if (this.previewHqMipmapScratchFramebuffer) {
        gl.deleteFramebuffer(this.previewHqMipmapScratchFramebuffer);
        this.previewHqMipmapScratchFramebuffer = null;
      }

      if (this.previewHqMipmapScratchTexture) {
        gl.deleteTexture(this.previewHqMipmapScratchTexture);
        this.previewHqMipmapScratchTexture = null;
      }

      this.previewHqMipmapScratchWidth = 0;
      this.previewHqMipmapScratchHeight = 0;
    }
,

    ensurePreviewHqMipmapScratch(width, height) {
      const gl = this.gl;
      const safeWidth = Math.max(1, Math.round(Number(width) || 1));
      const safeHeight = Math.max(1, Math.round(Number(height) || 1));

      if (!this.previewHqMipmapScratchTexture) {
        this.previewHqMipmapScratchTexture = gl.createTexture();
      }

      if (!this.previewHqMipmapScratchFramebuffer) {
        this.previewHqMipmapScratchFramebuffer = gl.createFramebuffer();
      }

      if (!this.previewHqMipmapScratchTexture || !this.previewHqMipmapScratchFramebuffer) {
        this.deletePreviewHqMipmapResources();
        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, this.previewHqMipmapScratchTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (
        this.previewHqMipmapScratchWidth !== safeWidth ||
        this.previewHqMipmapScratchHeight !== safeHeight
      ) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, safeWidth, safeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.previewHqMipmapScratchWidth = safeWidth;
        this.previewHqMipmapScratchHeight = safeHeight;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewHqMipmapScratchFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.previewHqMipmapScratchTexture,
        0,
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.deletePreviewHqMipmapResources();
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }
,

    generateHighQualityPreviewMipmaps() {
      if (
        !isHighQualityViewEnabled() ||
        this.previewCacheMipmapped === false ||
        !this.previewTexture ||
        this.previewMipLevels <= 1 ||
        !this.quad?.vao
      ) {
        return false;
      }

      const gl = this.gl;
      const programInfo = this.ensurePreviewHqMipmapProgramInfo?.();

      if (!programInfo?.program) {
        return false;
      }

      const { program, uniforms } = programInfo;
      let sourceWidth = Math.max(1, Math.round(this.previewCacheWidth || 1));
      let sourceHeight = Math.max(1, Math.round(this.previewCacheHeight || 1));

      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.bindVertexArray(this.quad.vao);

      for (let level = 1; level < this.previewMipLevels; level++) {
        const targetWidth = Math.max(1, sourceWidth >> 1);
        const targetHeight = Math.max(1, sourceHeight >> 1);

        if (!this.ensurePreviewHqMipmapScratch(targetWidth, targetHeight)) {
          gl.bindVertexArray(null);
          gl.useProgram(null);
          return false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewHqMipmapScratchFramebuffer);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.uniform2f(uniforms.viewportSize, targetWidth, targetHeight);
        gl.uniform2f(uniforms.documentSize, targetWidth, targetHeight);
        gl.uniform2f(uniforms.cameraPosition, 0, 0);
        gl.uniform1f(uniforms.cameraZoom, 1);
        gl.uniform2f(uniforms.sourceSize, sourceWidth, sourceHeight);
        gl.uniform1i(uniforms.sourceLevel, level - 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER || gl.FRAMEBUFFER, this.previewHqMipmapScratchFramebuffer);
        gl.copyTexSubImage2D(gl.TEXTURE_2D, level, 0, 0, 0, 0, targetWidth, targetHeight);

        sourceWidth = targetWidth;
        sourceHeight = targetHeight;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);

      return true;
    }
,

    deleteActiveStrokeSelectionClipTexture() {
      if (this.activeStrokeSelectionClipTexture) {
        this.gl.deleteTexture(this.activeStrokeSelectionClipTexture);
        this.activeStrokeSelectionClipTexture = null;
      }

      this.activeStrokeSelectionClipKey = "";
      this.activeStrokeSelectionClipWidth = 0;
      this.activeStrokeSelectionClipHeight = 0;
    }
,

    getActiveStrokeSelectionClipTexture(mask) {
      const rect = mask?.rect;
      const width = Math.max(0, Math.round(mask?.width || rect?.width || 0));
      const height = Math.max(0, Math.round(mask?.height || rect?.height || 0));
      const pixels = mask?.pixels;

      if (!rect || width <= 0 || height <= 0 || !pixels || pixels.length < width * height) {
        this.deleteActiveStrokeSelectionClipTexture();
        return null;
      }

      const key = [
        Math.round(rect.x || 0),
        Math.round(rect.y || 0),
        width,
        height,
        Number.isFinite(mask.version) ? mask.version : 0,
      ].join(":");

      if (
        this.activeStrokeSelectionClipTexture &&
        this.activeStrokeSelectionClipKey === key &&
        this.activeStrokeSelectionClipWidth === width &&
        this.activeStrokeSelectionClipHeight === height
      ) {
        return this.activeStrokeSelectionClipTexture;
      }

      this.deleteActiveStrokeSelectionClipTexture();

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        return null;
      }

      const rgba = new Uint8Array(width * height * 4);

      for (let index = 0; index < width * height; index += 1) {
        const value = pixels[index] || 0;
        const offset = index * 4;

        rgba[offset] = value;
        rgba[offset + 1] = value;
        rgba[offset + 2] = value;
        rgba[offset + 3] = 255;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.activeStrokeSelectionClipTexture = texture;
      this.activeStrokeSelectionClipKey = key;
      this.activeStrokeSelectionClipWidth = width;
      this.activeStrokeSelectionClipHeight = height;

      return texture;
    }
,

    getViewportCullingNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }
,

    cloneViewportCullingStats(stats) {
      if (!stats) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(stats));
      } catch (error) {
        return { ...stats };
      }
    }
,

    isViewportCullingDebugEnabled(options = {}) {
      return Boolean(
        options.debugViewportCulling === true ||
        this.options?.debugViewportCulling === true ||
        namespace.debugViewportCulling === true ||
        namespace.viewportCullingDebug === true
      );
    }
,

    isViewportLayerCullingEnabled(options = {}) {
      return Boolean(
        options.enableViewportLayerCulling === true ||
        this.options?.enableViewportLayerCulling === true ||
        namespace.enableViewportLayerCulling === true ||
        namespace.viewportLayerCullingEnabled === true
      );
    }
,

    isViewportLayerCullingAuditEnabled(options = {}) {
      return Boolean(
        this.isViewportLayerCullingEnabled(options) ||
        this.isViewportCullingDebugEnabled(options) ||
        options.measureViewportLayerCulling === true ||
        this.options?.measureViewportLayerCulling === true ||
        namespace.measureViewportLayerCulling === true ||
        namespace.viewportLayerCullingAudit === true
      );
    }
,

    createViewportCullingStats(options = {}) {
      const camera = options.camera || {};
      const zoom = Number.isFinite(Number(camera.zoom)) ? Number(camera.zoom) : 1;
      const cameraX = Number.isFinite(Number(camera.x)) ? Number(camera.x) : 0;
      const cameraY = Number.isFinite(Number(camera.y)) ? Number(camera.y) : 0;

      return {
        artboardBackgrounds: {
          drawn: 0,
          skippedOutsideRenderRect: 0,
          tested: 0,
        },
        artboardClips: {
          drawn: 0,
          skippedOutsideRenderRect: 0,
          skippedViewportScissor: 0,
          tested: 0,
        },
        debug: options.debug === true,
        durationMs: 0,
        enabled: Boolean(options.renderRect),
        frameId: (this.viewportCullingStatsSequence = (this.viewportCullingStatsSequence || 0) + 1),
        layerCulling: {
          enabled: options.layerCullingEnabled === true,
          measured: options.layerCullingMeasured === true,
        },
        layers: {
          blocked: {
            activeStroke: 0,
            advancedBlend: 0,
            artboardDragPreview: 0,
            background: 0,
            clippingMask: 0,
            clipBase: 0,
            effects: 0,
            eraser: 0,
            globalTransformPreview: 0,
            group: 0,
            noRenderRect: 0,
            noTarget: 0,
            noTargetRect: 0,
            puppet: 0,
            transformPreview: 0,
            unsafeType: 0,
          },
          considered: 0,
          drawPasses: 0,
          passedCull: 0,
          safeCullCandidates: 0,
          safelyCulled: 0,
          skippedClippingBaseMissing: 0,
          skippedFlatPreviewFallback: 0,
          skippedInvisible: 0,
          skippedVectorTransformPreview: 0,
          total: 0,
          visible: 0,
          wouldCullSafely: 0,
        },
        notes: [],
        overscanCssPx: Math.max(0, Number(options.overscanCssPx) || 0),
        renderRect: options.renderRect ? { ...options.renderRect } : null,
        renderResults: {
          returned: 0,
        },
        source: options.source || "drawToCanvas",
        sparseTiles: {
          drawn: 0,
          missingTexture: 0,
          skippedOutsideRenderRect: 0,
          tested: 0,
          uncullable: 0,
        },
        startedAt: this.getViewportCullingNow(),
        viewport: {
          cameraX,
          cameraY,
          height: Math.max(1, Math.round(Number(options.viewportHeight) || 1)),
          visibleRect: options.visibleRect ? { ...options.visibleRect } : null,
          width: Math.max(1, Math.round(Number(options.viewportWidth) || 1)),
          zoom,
        },
      };
    }
,

    finalizeViewportCullingStats(stats) {
      if (!stats) {
        return null;
      }

      stats.durationMs = Math.max(0, this.getViewportCullingNow() - (Number(stats.startedAt) || 0));
      const snapshot = this.cloneViewportCullingStats(stats);

      this.viewportCullingLastStats = snapshot;
      namespace.lastViewportCullingStats = snapshot;

      if (stats.debug && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        try {
          if (typeof CustomEvent === "function") {
            window.dispatchEvent(new CustomEvent(VIEWPORT_CULLING_DEBUG_EVENT, { detail: snapshot }));
          }
        } catch (error) {
          // Debug only: never break rendering for an event/listener issue.
        }
      }

      if (
        stats.debug &&
        (this.options?.debugViewportCullingLog === true || namespace.viewportCullingLog === true) &&
        typeof console !== "undefined" &&
        typeof console.debug === "function"
      ) {
        console.debug("[CBO] viewport culling", snapshot);
      }

      return snapshot;
    }
,

    getLastViewportCullingStats() {
      return this.cloneViewportCullingStats(this.viewportCullingLastStats);
    }
,

    setViewportCullingDebug(enabled = true) {
      this.options = this.options || {};
      this.options.debugViewportCulling = enabled === true;
    }
,

    setViewportLayerCulling(enabled = true) {
      this.options = this.options || {};
      this.options.enableViewportLayerCulling = enabled === true;
    }
,

    getLayerViewportCullRect(layer, layerTarget) {
      if (!layerTarget || !this.hasRenderableRasterTarget(layerTarget)) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(layerTarget);
      const visualRect = this.getArtboardDragVisualRect(layer, targetRect, layerTarget) || targetRect;

      return this.normalizeTransformArtboardRect(visualRect);
    }
,

    getViewportLayerCullBlockReason(layer, layerTarget, context = {}) {
      const layerType = String(layer?.type || "").trim();

      if (!context.renderRect) {
        return "noRenderRect";
      }

      if (layer?.type === "background" || layer?.id === "background") {
        return "background";
      }

      if (layer?.type === "group") {
        return "group";
      }

      if (!VIEWPORT_LAYER_CULL_SAFE_TYPES.has(layerType)) {
        return "unsafeType";
      }

      if (!layerTarget || !this.hasRenderableRasterTarget(layerTarget)) {
        return "noTarget";
      }

      if (layer?.clippingMask === true || context.isClippingLayer === true) {
        return "clippingMask";
      }

      if (context.clipBaseLayerIds?.has?.(layer?.id)) {
        return "clipBase";
      }

      if (context.isActiveStrokeLayer === true) {
        return "activeStroke";
      }

      if (context.eraserMaskTexture) {
        return "eraser";
      }

      if (context.isRasterTransformPreviewLayer === true || context.isVectorTextTransformPreviewLayer === true) {
        return "transformPreview";
      }

      if (context.rasterTransformPreview || context.vectorTextTransformPreviewLayerId) {
        return "globalTransformPreview";
      }

      if (context.hasArtboardDragPreview === true) {
        return "artboardDragPreview";
      }

      if (this.hasAdvancedLayerBlendMode(layer)) {
        return "advancedBlend";
      }

      if (this.hasEnabledLayerEffects(layer)) {
        return "effects";
      }

      if (this.hasPuppetLayerTransform(layer)) {
        return "puppet";
      }

      if (!this.getLayerViewportCullRect(layer, layerTarget)) {
        return "noTargetRect";
      }

      return "";
    }
,

    getViewportLayerCullDecision(layer, layerTarget, context = {}) {
      const reason = this.getViewportLayerCullBlockReason(layer, layerTarget, context);

      if (reason) {
        return {
          canCull: false,
          reason,
          shouldCull: false,
        };
      }

      const rect = this.getLayerViewportCullRect(layer, layerTarget);
      const shouldCull = Boolean(rect && context.renderRect && !this.documentRectsIntersect(rect, context.renderRect));

      return {
        canCull: true,
        reason: shouldCull ? "outsideRenderRect" : "intersectsRenderRect",
        rect,
        shouldCull,
      };
    }
,

    recordViewportLayerCullDecision(stats, decision, didCull = false) {
      if (!stats?.layers || !decision) {
        return;
      }

      if (decision.canCull) {
        stats.layers.safeCullCandidates += 1;

        if (decision.shouldCull) {
          stats.layers.wouldCullSafely += 1;
        }

        if (didCull) {
          stats.layers.safelyCulled += 1;
        }

        return;
      }

      const blocked = stats.layers.blocked;

      if (decision.reason && Object.prototype.hasOwnProperty.call(blocked, decision.reason)) {
        blocked[decision.reason] += 1;
      }
    }
,

    getFullDocumentRect() {
      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        height: Math.max(1, Math.round(this.height || 1)),
      };
    }
,

    resolveCanvasVisibleDocRect(camera = {}, viewportWidth = 1, viewportHeight = 1) {
      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const cameraX = Number.isFinite(Number(camera?.x)) ? Number(camera.x) : 0;
      const cameraY = Number.isFinite(Number(camera?.y)) ? Number(camera.y) : 0;
      const safeViewportWidth = Math.max(1, Math.round(Number(viewportWidth) || 1));
      const safeViewportHeight = Math.max(1, Math.round(Number(viewportHeight) || 1));
      const left = (0 - cameraX) / zoom;
      const top = (0 - cameraY) / zoom;
      const right = (safeViewportWidth - cameraX) / zoom;
      const bottom = (safeViewportHeight - cameraY) / zoom;
      const minX = Math.floor(Math.min(left, right));
      const minY = Math.floor(Math.min(top, bottom));
      const maxX = Math.ceil(Math.max(left, right));
      const maxY = Math.ceil(Math.max(top, bottom));

      return {
        height: Math.max(1, maxY - minY),
        width: Math.max(1, maxX - minX),
        x: minX,
        y: minY,
      };
    }
,

    expandDocumentRect(rect, overscanDoc = 0) {
      const normalized = this.normalizeTransformArtboardRect(rect);

      if (!normalized) {
        return null;
      }

      const amount = Number.isFinite(Number(overscanDoc))
        ? Math.max(0, Number(overscanDoc))
        : 0;

      return {
        height: normalized.height + amount * 2,
        width: normalized.width + amount * 2,
        x: normalized.x - amount,
        y: normalized.y - amount,
      };
    }
,

    documentRectsIntersect(a, b) {
      const first = this.normalizeTransformArtboardRect(a);
      const second = this.normalizeTransformArtboardRect(b);

      if (!first || !second) {
        return false;
      }

      return (
        first.x + first.width > second.x &&
        second.x + second.width > first.x &&
        first.y + first.height > second.y &&
        second.y + second.height > first.y
      );
    }
,

    getViewportRenderRect(camera = {}, viewportWidth = 1, viewportHeight = 1, overscanCssPx = VIEWPORT_RENDER_OVERSCAN_CSS_PX) {
      const visibleRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const dpr = typeof window !== "undefined" && Number.isFinite(Number(window.devicePixelRatio))
        ? Math.max(1, Number(window.devicePixelRatio))
        : 1;
      const overscanViewportPx = Number.isFinite(Number(overscanCssPx))
        ? Math.max(0, Number(overscanCssPx)) * dpr
        : 0;
      const overscanDoc = overscanViewportPx / zoom;

      return this.expandDocumentRect(visibleRect, overscanDoc) || visibleRect;
    }
,

    normalizeDirtyRegionRect(rect) {
      const clamped = this.getClampedDocumentRect(rect);

      return clamped ? { ...clamped } : null;
    }
,

    getDirtyRegionRectsFromOptions(options = {}) {
      const rawRects = [];

      if (options.rect) {
        rawRects.push(options.rect);
      }

      if (Array.isArray(options.rects)) {
        rawRects.push(...options.rects);
      }

      if (Array.isArray(options.projectionInvalidation)) {
        rawRects.push(...options.projectionInvalidation);
      }

      const layer = options.layerId
        ? this.layerModel?.findEntryById?.(options.layerId)
        : null;
      const normalizedRects = rawRects
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean)
        .map((rect) => (
          layer && this.hasEnabledLayerEffects(layer)
            ? this.getLayerEffectOutputRect(layer, rect) || rect
            : rect
        ))
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);

      return this.clipPreviewDirtyRectsToArtboards(normalizedRects, options);
    }
,

    getIncomingDirtyRegionRectCount(options = {}) {
      const explicitCount = Number(options.dirtyRectInputCount);

      if (Number.isFinite(explicitCount) && explicitCount > 0) {
        return Math.round(explicitCount);
      }

      let count = 0;

      if (options.rect) {
        count += 1;
      }

      if (Array.isArray(options.rects)) {
        count += options.rects.length;
      }

      if (Array.isArray(options.projectionInvalidation)) {
        count += options.projectionInvalidation.length;
      }

      return count;
    }
,

    getPreviewDirtyArtboardClipRects(options = {}) {
      if (options.clipToArtboards === false || this.options?.isolateDocumentArtboards) {
        return null;
      }

      const explicitRects = Array.isArray(options.previewArtboardClipRects)
        ? options.previewArtboardClipRects
        : null;
      const sourceRects = explicitRects || namespace.getDocumentArtboards?.() || [];
      const rects = (Array.isArray(sourceRects) ? sourceRects : [])
        .map((rect) => this.normalizeTransformArtboardRect(rect))
        .filter(Boolean)
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);

      return rects.length > 0 ? rects : null;
    }
,

    clonePreviewDirtyArtboardClipRects(rects) {
      return (Array.isArray(rects) ? rects : [])
        .map((rect) => this.normalizeTransformArtboardRect(rect))
        .filter(Boolean)
        .map((rect) => ({ ...rect }));
    }
,

    clipPreviewDirtyRectsToArtboards(rects = [], options = {}) {
      const sourceRects = (Array.isArray(rects) ? rects : [rects])
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);
      const clipRects = this.getPreviewDirtyArtboardClipRects(options);

      if (!clipRects || sourceRects.length === 0) {
        return sourceRects;
      }

      const clippedRects = [];

      sourceRects.forEach((rect) => {
        const rectClips = clipRects
          .map((clipRect) => this.intersectRasterHistoryRects(rect, clipRect))
          .filter(Boolean);

        clippedRects.push(...rectClips);
      });

      return clippedRects.map((rect) => ({ ...rect }));
    }
,

    getPreviewDirtyTileSize(options = {}) {
      const configured = Number(options.previewDirtyTileSize ?? options.tileSize);

      if (Number.isFinite(configured) && configured > 0) {
        return Math.max(64, Math.round(configured));
      }

      return Math.max(128, this.getRasterHistoryTileSize(options) * 2);
    }
,

    getTileBasedPreviewDirtyRects(rects = [], options = {}) {
      const sourceRects = this.clipPreviewDirtyRectsToArtboards(rects, options);
      const tileSize = this.getPreviewDirtyTileSize(options);
      const dirtyTiles = new Map();

      sourceRects.forEach((rect) => {
        this.getRasterHistoryTileRects(rect, { tileSize }).forEach((tile) => {
          const patchRect = tile.patchRect || tile.rect;

          if (!patchRect) {
            return;
          }

          const key = `${tile.tx}:${tile.ty}`;
          const previous = dirtyTiles.get(key);
          const nextRect = previous
            ? this.unionRasterHistoryRects(previous, patchRect)
            : patchRect;

          dirtyTiles.set(key, { ...nextRect });
        });
      });

      return Array.from(dirtyTiles.entries())
        .sort(([firstKey], [secondKey]) => {
          const [firstTx, firstTy] = firstKey.split(":").map((value) => Number(value));
          const [secondTx, secondTy] = secondKey.split(":").map((value) => Number(value));

          return (firstTy - secondTy) || (firstTx - secondTx);
        })
        .map(([, rect]) => ({ ...rect }));
    }
,

    createVisualDirtyChange(options = {}) {
      const source = options.source || "visual-change";
      const rawRects = [];
      const pushRect = (rect) => {
        if (rect) {
          rawRects.push(rect);
        }
      };
      const pushRects = (rects) => {
        if (Array.isArray(rects)) {
          rects.forEach(pushRect);
        }
      };

      pushRect(options.rect);
      pushRects(options.rects);
      pushRects(options.tilePatchRects);
      pushRects(options.projectionInvalidation);
      pushRects(options.visualRects);
      pushRect(options.sourceRect);
      pushRect(options.targetRect);
      pushRect(options.beforeRect);
      pushRect(options.afterRect);
      pushRect(options.previousRect);
      pushRect(options.nextRect);

      const normalizedRects = rawRects
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);
      const previewRects = this.clipPreviewDirtyRectsToArtboards(normalizedRects, options);
      const shouldTileDirtyRects = options.tileDirty === true || options.usePreviewDirtyTiles === true;
      const dirtyRects = shouldTileDirtyRects
        ? this.getTileBasedPreviewDirtyRects(previewRects, options)
        : previewRects.map((rect) => ({ ...rect }));
      const preserveDirtyRects = options.preserveDirtyRects === true ||
        shouldTileDirtyRects ||
        Array.isArray(options.tilePatchRects);
      const detail = {
        dirtyRectInputCount: normalizedRects.length,
        layerId: options.layerId || "",
        maxDirtyRects: Math.max(
          1,
          Math.round(Number(options.maxDirtyRects) || PREVIEW_DIRTY_MAX_RECTS),
        ),
        preserveDirtyRects,
        source,
      };

      if (Number.isFinite(Number(options.dirtyMergeWasteRatio))) {
        detail.dirtyMergeWasteRatio = Number(options.dirtyMergeWasteRatio);
      }

      if (options.mergeAdjacentDirtyRects === false) {
        detail.mergeAdjacentDirtyRects = false;
      }

      if (options.clipToArtboards === false) {
        detail.clipToArtboards = false;
      }

      if (Array.isArray(options.previewArtboardClipRects)) {
        const previewArtboardClipRects = this.clonePreviewDirtyArtboardClipRects(options.previewArtboardClipRects);

        if (previewArtboardClipRects.length > 0) {
          detail.previewArtboardClipRects = previewArtboardClipRects;
        }
      }

      if (dirtyRects.length === 1 && preserveDirtyRects !== true) {
        detail.rect = { ...dirtyRects[0] };
        detail.rects = null;
      } else {
        detail.rect = null;
        detail.rects = dirtyRects.length > 0
          ? dirtyRects.map((rect) => ({ ...rect }))
          : null;
      }

      return detail;
    }
,

    commitVisualDirtyChange(options = {}) {
      if (namespace.PerfTrace?.enabled) {
        namespace.PerfTrace.mark("dirty.commit", {
          layerId: options.layerId || "",
          rectCount: Array.isArray(options.rects) ? options.rects.length : (options.rect ? 1 : 0),
          source: options.source || "visual-dirty",
        });
      }

      if (isAndroidDirtyRegionsDisabled()) {
        const detail = {
          androidDirtyRegionsDisabled: true,
          dirtyRectInputCount: 0,
          layerId: options.layerId || "",
          maxDirtyRects: Math.max(
            1,
            Math.round(Number(options.maxDirtyRects) || PREVIEW_DIRTY_MAX_RECTS),
          ),
          preserveDirtyRects: false,
          rect: null,
          rects: null,
          source: options.source || "visual-change",
        };
        const shouldEmit = options.emit !== false;

        if (shouldEmit) {
          this.emitContentChange(detail);
        } else if (options.invalidate !== false) {
          this.invalidatePreviewCache(detail.source, detail);
        }

        if (options.requestDraw === true) {
          this.requestDraw();
        }

        return detail;
      }

      const detail = this.createVisualDirtyChange(options);
      const shouldEmit = options.emit !== false;

      if (shouldEmit) {
        this.emitContentChange(detail);
      } else if (options.invalidate !== false) {
        this.invalidatePreviewCache(detail.source, detail);
      }

      if (options.requestDraw === true) {
        this.requestDraw();
      }

      return detail;
    }
,

    unionDirtyRegionRects(rects = []) {
      return rects.reduce((result, rect) => this.unionRasterHistoryRects(result, rect), null);
    }
,

    getDirtyRegionRectArea(rect) {
      if (!rect) {
        return 0;
      }

      return Math.max(0, Math.round(rect.width || 0)) * Math.max(0, Math.round(rect.height || 0));
    }
,

    getDirtyRegionRectListArea(rects = []) {
      return rects.reduce((total, rect) => total + this.getDirtyRegionRectArea(rect), 0);
    }
,

    compactDirtyRegionRects(rects = [], options = {}) {
      const maxRects = Math.max(1, Math.round(Number(options.maxRects) || PREVIEW_DIRTY_MAX_RECTS));
      const mergeWasteRatio = Math.max(
        1,
        Number.isFinite(Number(options.mergeWasteRatio))
          ? Number(options.mergeWasteRatio)
          : PREVIEW_DIRTY_MERGE_WASTE_RATIO,
      );
      const mergeAdjacent = options.mergeAdjacent !== false;
      const normalizedRects = rects
        .map((rect) => (
          options.skipNormalize === true
            ? (rect && rect.width > 0 && rect.height > 0 ? { ...rect } : null)
            : this.normalizeDirtyRegionRect(rect)
        ))
        .filter(Boolean);
      const compacted = [];
      const overlaps = (a, b) => (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
      const canMerge = (a, b) => {
        if (!mergeAdjacent && !overlaps(a, b)) {
          return false;
        }

        const merged = this.unionRasterHistoryRects(a, b);
        const mergedArea = this.getDirtyRegionRectArea(merged);
        const sourceArea = this.getDirtyRegionRectArea(a) + this.getDirtyRegionRectArea(b);

        return mergedArea <= sourceArea * mergeWasteRatio;
      };

      normalizedRects.forEach((rect) => {
        let mergedRect = { ...rect };
        let didMerge = true;

        while (didMerge) {
          didMerge = false;

          for (let index = 0; index < compacted.length; index += 1) {
            if (!canMerge(compacted[index], mergedRect)) {
              continue;
            }

            mergedRect = this.unionRasterHistoryRects(compacted[index], mergedRect);
            compacted.splice(index, 1);
            didMerge = true;
            break;
          }
        }

        compacted.push(mergedRect);
      });

      while (compacted.length > maxRects) {
        let bestA = 0;
        let bestB = 1;
        let bestExtraArea = Infinity;

        for (let a = 0; a < compacted.length; a += 1) {
          for (let b = a + 1; b < compacted.length; b += 1) {
            const merged = this.unionRasterHistoryRects(compacted[a], compacted[b]);
            const extraArea = this.getDirtyRegionRectArea(merged) -
              this.getDirtyRegionRectArea(compacted[a]) -
              this.getDirtyRegionRectArea(compacted[b]);

            if (extraArea < bestExtraArea) {
              bestA = a;
              bestB = b;
              bestExtraArea = extraArea;
            }
          }
        }

        compacted[bestA] = this.unionRasterHistoryRects(compacted[bestA], compacted[bestB]);
        compacted.splice(bestB, 1);
      }

      return compacted;
    }
,

    createPreviewDirtyStats() {
      return {
        fullFrames: 0,
        lastCacheHeight: 0,
        lastCacheScale: 1,
        lastCacheWidth: 0,
        lastCoverage: 1,
        lastDrawnPixels: 0,
        lastFullPixels: 0,
        lastMode: "full",
        lastReason: "init",
        lastRect: null,
        lastRectCount: 0,
        lastScissorCount: 0,
        lastSavedPixels: 0,
        partialFrames: 0,
        totalDrawnPixels: 0,
        totalFrames: 0,
        totalFullPixels: 0,
        totalSavedPixels: 0,
      };
    }
,

    resetPreviewDirtyStats() {
      this.previewDirtyStats = this.createPreviewDirtyStats();

      return this.getPreviewDirtyStats();
    }
,

    recordPreviewDirtyFrame(options = {}) {
      const cacheWidth = Math.max(1, Math.round(Number(options.cacheWidth) || this.previewCacheWidth || 1));
      const cacheHeight = Math.max(1, Math.round(Number(options.cacheHeight) || this.previewCacheHeight || 1));
      const fullPixels = cacheWidth * cacheHeight;
      const scissors = Array.isArray(options.dirtyScissors)
        ? options.dirtyScissors.filter(Boolean)
        : (options.dirtyScissor ? [options.dirtyScissor] : []);
      const mode = scissors.length > 0 ? "partial" : "full";
      const drawnPixels = mode === "partial"
        ? Math.min(fullPixels, Math.max(1, this.getDirtyRegionRectListArea(scissors)))
        : fullPixels;
      const savedPixels = Math.max(0, fullPixels - drawnPixels);
      const dirtyRects = Array.isArray(options.dirtyRects)
        ? options.dirtyRects.filter(Boolean)
        : (options.dirtyRect ? [options.dirtyRect] : []);
      const stats = this.previewDirtyStats || this.createPreviewDirtyStats();

      stats.totalFrames += 1;
      stats.totalFullPixels += fullPixels;
      stats.totalDrawnPixels += drawnPixels;
      stats.totalSavedPixels += savedPixels;

      if (mode === "partial") {
        stats.partialFrames += 1;
      } else {
        stats.fullFrames += 1;
      }

      stats.lastCacheHeight = cacheHeight;
      stats.lastCacheScale = Math.max(0.0001, Number(options.cacheScale) || this.previewCacheScale || 1);
      stats.lastCacheWidth = cacheWidth;
      stats.lastCoverage = fullPixels > 0 ? drawnPixels / fullPixels : 1;
      stats.lastDrawnPixels = drawnPixels;
      stats.lastFullPixels = fullPixels;
      stats.lastMode = mode;
      stats.lastReason = this.previewCacheReason || "unknown";
      stats.lastRect = options.dirtyRect ? { ...options.dirtyRect } : null;
      stats.lastRectCount = dirtyRects.length;
      stats.lastScissorCount = scissors.length;
      stats.lastSavedPixels = savedPixels;

      this.previewDirtyStats = stats;
      this.previewLastDirtyMode = mode;
      this.previewLastDirtyRect = stats.lastRect ? { ...stats.lastRect } : null;

      return this.getPreviewDirtyStats();
    }
,

    getPreviewDirtyStats() {
      const stats = this.previewDirtyStats || this.createPreviewDirtyStats();
      const totalFrames = Math.max(0, Number(stats.totalFrames) || 0);
      const totalFullPixels = Math.max(0, Number(stats.totalFullPixels) || 0);
      const totalSavedPixels = Math.max(0, Number(stats.totalSavedPixels) || 0);

      return {
        ...stats,
        hitRate: totalFrames > 0 ? stats.partialFrames / totalFrames : 0,
        lastRect: stats.lastRect ? { ...stats.lastRect } : null,
        totalSavedRatio: totalFullPixels > 0 ? totalSavedPixels / totalFullPixels : 0,
      };
    }
,

    getPreviewCacheUpdateNow() {
      const perf = typeof performance !== "undefined"
        ? performance
        : (typeof window !== "undefined" ? window.performance : null);

      return typeof perf?.now === "function" ? perf.now() : Date.now();
    }
,

    isPreviewCacheInteractionDeferSource(reason = "unknown", options = {}) {
      const source = String(options.source || reason || "");

      return source === "layer-sidebar-blend-mode" || source === "layer-blend-mode";
    }
,

    getPreviewCacheUpdateDeferRemainingMs() {
      const until = Math.max(0, Number(this.previewCacheUpdateDeferUntil) || 0);

      return Math.max(0, until - this.getPreviewCacheUpdateNow());
    }
,

    shouldDeferPreviewCacheUpdateForInteraction() {
      if (this.previewCacheDirty !== true) {
        return false;
      }

      return this.previewCacheUpdateDeferFramePending === true ||
        this.getPreviewCacheUpdateDeferRemainingMs() > 0;
    }
,

    finishPreviewCacheInteractionDeferFrame(wasDeferred = false) {
      if (wasDeferred !== true || this.previewCacheUpdateDeferFramePending !== true) {
        return false;
      }

      this.previewCacheUpdateDeferFramePending = false;

      if (this.previewCacheDirty === true && this.getPreviewCacheUpdateDeferRemainingMs() <= 0) {
        this.requestDraw?.();
      }

      return true;
    }
,

    scheduleDeferredPreviewCacheUpdate() {
      const root = typeof window !== "undefined" ? window : globalThis;
      const setTimer = typeof root.setTimeout === "function" ? root.setTimeout.bind(root) : null;
      const clearTimer = typeof root.clearTimeout === "function" ? root.clearTimeout.bind(root) : null;

      if (this.previewCacheUpdateDeferTimer && clearTimer) {
        clearTimer(this.previewCacheUpdateDeferTimer);
      }

      if (!setTimer) {
        this.previewCacheUpdateDeferTimer = 0;
        this.previewCacheUpdateDeferUntil = 0;
        this.requestDraw?.();
        return;
      }

      this.previewCacheUpdateDeferTimer = setTimer(() => {
        this.previewCacheUpdateDeferTimer = 0;
        this.previewCacheUpdateDeferUntil = 0;
        this.requestDraw?.();
      }, Math.round(this.getPreviewCacheUpdateDeferRemainingMs()));
    }
,

    clearPreviewCacheInteractionDefer() {
      const root = typeof window !== "undefined" ? window : globalThis;
      const clearTimer = typeof root.clearTimeout === "function" ? root.clearTimeout.bind(root) : null;

      if (this.previewCacheUpdateDeferTimer && clearTimer) {
        clearTimer(this.previewCacheUpdateDeferTimer);
      }

      this.previewCacheUpdateDeferTimer = 0;
      this.previewCacheUpdateDeferUntil = 0;
      this.previewCacheUpdateDeferFramePending = false;
      this.previewCacheUpdateDeferReason = "";
    }
,

    deferPreviewCacheUpdateForInteraction(reason = "unknown", options = {}) {
      if (!this.isPreviewCacheInteractionDeferSource(reason, options)) {
        return false;
      }

      const delayMs = Math.max(
        1,
        Math.round(Number(options.previewCacheDeferMs) || PREVIEW_CACHE_INTERACTION_DEFER_MS),
      );

      this.previewCacheUpdateDeferUntil = this.getPreviewCacheUpdateNow() + delayMs;
      this.previewCacheUpdateDeferReason = String(options.source || reason || "interaction");
      this.previewCacheUpdateDeferFramePending = true;
      this.requestDraw?.();
      this.scheduleDeferredPreviewCacheUpdate();
      return true;
    }
,

    getPreviewDirtyRegionScissor(rect, cacheWidth, cacheHeight, cacheScale, options = {}) {
      const dirtyRect = this.normalizeDirtyRegionRect(rect);

      if (!dirtyRect) {
        return null;
      }

      const documentRect = options.documentRect || options.cacheDocumentRect || this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect();
      const offsetX = Number.isFinite(Number(documentRect?.x)) ? Number(documentRect.x) : 0;
      const offsetY = Number.isFinite(Number(documentRect?.y)) ? Number(documentRect.y) : 0;
      const x0 = Math.max(0, Math.floor((dirtyRect.x - offsetX) * cacheScale));
      const y0 = Math.max(0, Math.floor((dirtyRect.y - offsetY) * cacheScale));
      const x1 = Math.min(cacheWidth, Math.ceil((dirtyRect.x + dirtyRect.width - offsetX) * cacheScale));
      const y1 = Math.min(cacheHeight, Math.ceil((dirtyRect.y + dirtyRect.height - offsetY) * cacheScale));

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        height: y1 - y0,
        width: x1 - x0,
        x: x0,
        y: cacheHeight - y1,
      };
    }
,

    getPreviewDirtyRegionScissors(rects, cacheWidth, cacheHeight, cacheScale, options = {}) {
      const cachePixels = Math.max(1, Math.round(cacheWidth || 1) * Math.round(cacheHeight || 1));
      const scissors = this.compactDirtyRegionRects(
        (Array.isArray(rects) ? rects : [])
          .map((rect) => this.getPreviewDirtyRegionScissor(rect, cacheWidth, cacheHeight, cacheScale, options))
          .filter(Boolean),
        {
          maxRects: options.maxRects || PREVIEW_DIRTY_MAX_RECTS,
          mergeAdjacent: options.mergeAdjacent,
          mergeWasteRatio: options.mergeWasteRatio,
          skipNormalize: true,
        },
      );
      const redrawPixels = Math.min(cachePixels, this.getDirtyRegionRectListArea(scissors));

      if (!scissors.length || redrawPixels / cachePixels >= PREVIEW_DIRTY_FULL_COVERAGE_RATIO) {
        return null;
      }

      return scissors;
    }
,

    emitPreviewDirtyRegionDebug(detail = {}) {
      if (namespace.debugPreviewDirtyRegions !== true) {
        return;
      }

      window.dispatchEvent(new CustomEvent(PREVIEW_DIRTY_DEBUG_EVENT, {
        detail: {
          generatedAt: Date.now(),
          ...detail,
        },
      }));
    }
,

    invalidatePreviewCache(reason = "unknown", options = {}) {
      if (namespace.PerfTrace?.enabled) {
        namespace.PerfTrace.mark("preview.invalidate", {
          layerId: options.layerId || "",
          ready: this.previewCacheReady,
          reason,
          rectCount: Array.isArray(options.rects) ? options.rects.length : (options.rect ? 1 : 0),
        });
      }

      if (isAndroidPreviewCacheDisabled() || isAndroidDirtyRegionsDisabled()) {
        this.invalidateArtboardFlatPreviews(reason, options, []);

        if (isAndroidPreviewCacheDisabled() && (this.previewTexture || this.previewFramebuffer)) {
          this.deletePreviewCache();
        }

        this.previewCacheDirty = true;
        this.previewCacheReason = reason;
        this.previewDirtyRects = null;
        this.previewDirtyCompactOptions = null;
        this.previewLastDirtyMode = "android-full-render";
        this.previewLastDirtyRect = null;

        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              androidDirtyRegionsDisabled: isAndroidDirtyRegionsDisabled(),
              androidPreviewCacheDisabled: isAndroidPreviewCacheDisabled(),
            },
            mode: "android-full-render",
            reason,
            rects: [],
          });
        }
        return;
      }

      const hadFullInvalidation = this.previewCacheDirty && this.previewDirtyRects === null;
      const dirtyRects = this.getDirtyRegionRectsFromOptions(options);
      const incomingDirtyRectCount = this.getIncomingDirtyRegionRectCount(options);

      this.invalidateArtboardFlatPreviews(reason, options, dirtyRects);

      if (!dirtyRects.length && incomingDirtyRectCount > 0) {
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause: "dirty-outside-visible-artboards",
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "skipped",
            reason,
            rects: [],
          });
        }
        return;
      }

      this.previewCacheDirty = true;
      this.previewCacheReason = reason;
      this.deferPreviewCacheUpdateForInteraction(reason, options);

      if (!dirtyRects.length || !this.previewCacheReady) {
        const forcedFullCause = !dirtyRects.length
          ? "no-dirty-rects"
          : "preview-cache-not-ready";

        this.previewDirtyRects = null;
        this.previewDirtyCompactOptions = null;
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause,
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "full",
            reason,
            rects: forcedFullCause === "preview-cache-not-ready"
              ? dirtyRects.map((rect) => ({ ...rect }))
              : [],
          });
        }
        return;
      }

      if (hadFullInvalidation) {
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause: "full-invalidation-pending",
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "full-pending",
            reason,
            rects: dirtyRects.map((rect) => ({ ...rect })),
          });
        }
        return;
      }

      const previousCompactOptions = this.previewDirtyCompactOptions || {};
      const nextCompactOptions = {
        maxRects: Math.max(
          1,
          Math.round(Number(options.maxDirtyRects || previousCompactOptions.maxRects || PREVIEW_DIRTY_MAX_RECTS)),
        ),
        mergeAdjacent: previousCompactOptions.mergeAdjacent === false ||
          options.preserveDirtyRects === true ||
          options.mergeAdjacentDirtyRects === false
            ? false
            : true,
        mergeWasteRatio: Number.isFinite(Number(options.dirtyMergeWasteRatio))
          ? Number(options.dirtyMergeWasteRatio)
          : previousCompactOptions.mergeWasteRatio,
      };
      const nextDirtyRects = this.compactDirtyRegionRects([
        ...(Array.isArray(this.previewDirtyRects) ? this.previewDirtyRects : []),
        ...dirtyRects,
      ], nextCompactOptions);

      this.previewDirtyCompactOptions = nextCompactOptions;
      this.previewDirtyRects = nextDirtyRects.length > 0 ? nextDirtyRects : null;
      if (namespace.debugPreviewDirtyRegions === true) {
        this.emitPreviewDirtyRegionDebug({
          layerId: options.layerId || "",
          mode: "partial",
          reason,
          rects: nextDirtyRects.map((rect) => ({ ...rect })),
        });
      }
    }
,

    updatePreviewCacheIfNeeded(options = {}) {
      const didCreate = this.createPreviewCache(options);

      if (!didCreate) {
        return false;
      }

      if (!this.previewCacheDirty && this.previewCacheReady) {
        return true;
      }

      return this.updatePreviewCache(options);
    }
,

    updatePreviewCache(options = {}) {
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("preview-cache.update", {
        dirty: this.previewCacheDirty,
        reason: this.previewCacheReason || "unknown",
      }) : null;

      try {
      if (!this.previewTexture || !this.previewFramebuffer || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const baseDocumentWidth = Math.max(1, Math.round(this.width || 1));
      const baseDocumentHeight = Math.max(1, Math.round(this.height || 1));
      const documentRect = this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect(options);
      const documentWidth = Math.max(1, Math.round(documentRect.width || baseDocumentWidth));
      const documentHeight = Math.max(1, Math.round(documentRect.height || baseDocumentHeight));
      const cacheWidth = Math.max(1, Math.round(this.previewCacheWidth || documentWidth));
      const cacheHeight = Math.max(1, Math.round(this.previewCacheHeight || documentHeight));
      const cacheScale = Math.max(
        0.0001,
        Number(this.previewCacheScale) || Math.min(cacheWidth / documentWidth, cacheHeight / documentHeight),
      );
      const dirtyCompactOptions = this.previewDirtyCompactOptions || {};
      const dirtyRects = this.previewCacheReady && Array.isArray(this.previewDirtyRects) && this.previewDirtyRects.length > 0
        ? this.compactDirtyRegionRects(this.previewDirtyRects, dirtyCompactOptions)
        : null;
      const dirtyScissors = dirtyRects
        ? this.getPreviewDirtyRegionScissors(dirtyRects, cacheWidth, cacheHeight, cacheScale, {
            ...dirtyCompactOptions,
            documentRect,
          })
        : null;
      const dirtyRect = dirtyScissors
        ? this.unionDirtyRegionRects(dirtyRects)
        : null;
      const { program, uniforms } = this.programInfo;
      const flatCamera = {
        x: -documentRect.x * cacheScale,
        y: -documentRect.y * cacheScale,
        zoom: cacheScale,
      };
      let previewCompositeState = null;
      const setDocumentProjection = (projectionWidth, projectionHeight, cameraX, cameraY, cameraZoom = cacheScale) => {
        gl.uniform2f(uniforms.documentSize, projectionWidth, projectionHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
        gl.uniform1f(uniforms.cameraZoom, cameraZoom);
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, previewCompositeState?.read?.framebuffer || this.previewFramebuffer);
        gl.viewport(0, 0, cacheWidth, cacheHeight);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, cacheWidth, cacheHeight);
        setDocumentProjection(baseDocumentWidth, baseDocumentHeight, flatCamera.x, flatCamera.y);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, baseDocumentWidth, baseDocumentHeight);
        gl.uniform1f(uniforms.maskClipMode, 0.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniforms.maskClipRectCount, 0);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, baseDocumentWidth, baseDocumentHeight);
        gl.uniformMatrix3fv(uniforms.clipDestToSourceUv, false, CLIP_IDENTITY_UV_MATRIX);
        gl.uniform4f(uniforms.clipSourceUvRect, 0, 0, 1, 1);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      };
      let currentPreviewScissor = null;
      const getPreviewScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const left = (docRect.x - documentRect.x) * cacheScale;
        const top = (docRect.y - documentRect.y) * cacheScale;
        const right = (docRect.x + docRect.width - documentRect.x) * cacheScale;
        const bottom = (docRect.y + docRect.height - documentRect.y) * cacheScale;
        const clippedLeft = Math.max(0, Math.floor(Math.min(left, right)));
        const clippedTop = Math.max(0, Math.floor(Math.min(top, bottom)));
        const clippedRight = Math.min(cacheWidth, Math.ceil(Math.max(left, right)));
        const clippedBottom = Math.min(cacheHeight, Math.ceil(Math.max(top, bottom)));

        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
          return null;
        }

        return {
          height: clippedBottom - clippedTop,
          width: clippedRight - clippedLeft,
          x: clippedLeft,
          y: cacheHeight - clippedBottom,
        };
      };
      const getPreviewTileScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const left = (docRect.x - documentRect.x) * cacheScale;
        const top = (docRect.y - documentRect.y) * cacheScale;
        const right = (docRect.x + docRect.width - documentRect.x) * cacheScale;
        const bottom = (docRect.y + docRect.height - documentRect.y) * cacheScale;
        const clippedLeft = Math.max(0, Math.ceil(Math.min(left, right) - 0.5));
        const clippedTop = Math.max(0, Math.ceil(Math.min(top, bottom) - 0.5));
        const clippedRight = Math.min(cacheWidth, Math.ceil(Math.max(left, right) - 0.5));
        const clippedBottom = Math.min(cacheHeight, Math.ceil(Math.max(top, bottom) - 0.5));

        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
          return null;
        }

        return {
          height: clippedBottom - clippedTop,
          width: clippedRight - clippedLeft,
          x: clippedLeft,
          y: cacheHeight - clippedBottom,
        };
      };
      const intersectPreviewScissors = (first, second) => {
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
      const restorePreviewScissor = (scissor) => {
        currentPreviewScissor = scissor;

        if (scissor) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
        } else {
          gl.disable(gl.SCISSOR_TEST);
        }
      };
      const withPreviewScissor = (scissor, callback) => {
        if (!scissor) {
          callback();
          return;
        }

        const previousScissor = currentPreviewScissor;
        const nextScissor = intersectPreviewScissors(previousScissor, scissor);

        if (!nextScissor) {
          return;
        }

        restorePreviewScissor(nextScissor);
        try {
          callback();
        } finally {
          restorePreviewScissor(previousScissor);
        }
      };
      const withLayerPreviewArtboardClip = (layer, callback) => {
        const artboardRect = this.getLayerArtboardVisualRect(layer);

        if (!artboardRect) {
          callback();
          return;
        }

        const artboardScissor = getPreviewScissorForDocumentRect(artboardRect);

        if (!artboardScissor) {
          return;
        }

        withPreviewScissor(artboardScissor, callback);
      };
      const drawTexture = (texture, opacity = 1, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (rect.x - documentRect.x) * cacheScale,
            (rect.y - documentRect.y) * cacheScale,
          );
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(baseDocumentWidth, baseDocumentHeight, flatCamera.x, flatCamera.y);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        const didBindClipTexture = this.setClipBaseUniforms(uniforms, clipBase, {
          fallbackHeight: baseDocumentHeight,
          fallbackWidth: baseDocumentWidth,
          textureMagFilter: gl.LINEAR,
          textureUnit: 2,
        });

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.clearClipBaseTexture(2, didBindClipTexture);
      };
      const drawBlendTexture = (texture, opacity = 1, blendModeId = 0, rect = null, clipBase = null) => {
        if (!texture) {
          return;
        }

        if (blendModeId === 0) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (!previewCompositeState?.read?.texture || !previewCompositeState?.write?.framebuffer) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (currentPreviewScissor) {
          gl.disable(gl.SCISSOR_TEST);
          this.drawScreenTexture(previewCompositeState.read.texture, {
            blend: false,
            framebuffer: previewCompositeState.write.framebuffer,
            viewportHeight: cacheHeight,
            viewportWidth: cacheWidth,
          });
          restorePreviewScissor(currentPreviewScissor);
        }

        this.drawLayerCompositeTexture({
          backdropTexture: previewCompositeState.read.texture,
          blendModeId,
          camera: flatCamera,
          clipBase,
          documentHeight: baseDocumentHeight,
          documentWidth: baseDocumentWidth,
          framebuffer: previewCompositeState.write.framebuffer,
          opacity,
          rect,
          texture,
          viewportHeight: cacheHeight,
          viewportWidth: cacheWidth,
        });
        previewCompositeState = this.swapLayerComposite(previewCompositeState);
        bindArtboardProgram();
      };
      const drawSparsePreviewAdvancedBlendResults = (layerTarget, renderResults, opacity, blendModeId, clipBase = null) => {
        if (
          blendModeId === 0 ||
          !previewCompositeState?.read?.texture ||
          !previewCompositeState?.write?.framebuffer ||
          !this.isSparseRasterTarget(layerTarget)
        ) {
          return false;
        }

        const entries = [];

        for (const renderResult of renderResults) {
          const layerTexture = renderResult?.texture;
          const layerRect = renderResult?.rect || null;

          if (!layerTexture) {
            continue;
          }

          if (!layerRect) {
            return false;
          }

          const tileScissor = getPreviewTileScissorForDocumentRect(layerRect);

          if (!tileScissor) {
            continue;
          }

          const scissor = intersectPreviewScissors(currentPreviewScissor, tileScissor);

          if (scissor) {
            entries.push({
              rect: layerRect,
              scissor,
              texture: layerTexture,
            });
          }
        }

        if (entries.length === 0) {
          return true;
        }

        const previousScissor = currentPreviewScissor;

        try {
          restorePreviewScissor(null);
          this.drawScreenTexture(previewCompositeState.read.texture, {
            blend: false,
            framebuffer: previewCompositeState.write.framebuffer,
            viewportHeight: cacheHeight,
            viewportWidth: cacheWidth,
          });

          for (const entry of entries) {
            restorePreviewScissor(entry.scissor);
            this.drawLayerCompositeTexture({
              backdropTexture: previewCompositeState.read.texture,
              blendModeId,
              camera: flatCamera,
              clipBase,
              documentHeight: baseDocumentHeight,
              documentWidth: baseDocumentWidth,
              framebuffer: previewCompositeState.write.framebuffer,
              opacity,
              rect: entry.rect,
              scissor: entry.scissor,
              texture: entry.texture,
              viewportHeight: cacheHeight,
              viewportWidth: cacheWidth,
            });
          }

          previewCompositeState = this.swapLayerComposite(previewCompositeState);
        } finally {
          restorePreviewScissor(previousScissor);
        }

        bindArtboardProgram();
        return true;
      };

      const orderedPreviewLayers = this.getOrderedLayersBottomToTop();
      const previewNeedsLayerComposite = orderedPreviewLayers.some((layer) =>
        layer?.visible !== false && this.hasAdvancedLayerBlendMode(layer)
      );
      const isValidClipBaseLayer = (layer) => Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );
      const needsClipBaseTexture = (layer) => Boolean(
        layer?.visible !== false &&
        this.hasLayerRenderableOrPendingRasterContent(layer)
      );
      const clipBaseLayerIds = new Set();
      let pendingClipBaseLayer = null;

      orderedPreviewLayers.forEach((layer) => {
        if (layer?.clippingMask === true) {
          if (pendingClipBaseLayer?.id && needsClipBaseTexture(pendingClipBaseLayer)) {
            clipBaseLayerIds.add(pendingClipBaseLayer.id);
          }
        } else {
          pendingClipBaseLayer = isValidClipBaseLayer(layer) ? layer : null;
        }
      });

      const drawPreviewCachePass = (dirtyScissor = null) => {
        restorePreviewScissor(dirtyScissor || null);

        if (previewNeedsLayerComposite) {
          previewCompositeState = this.beginLayerComposite(cacheWidth, cacheHeight);
        } else {
          previewCompositeState = null;
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);
          gl.viewport(0, 0, cacheWidth, cacheHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        bindArtboardProgram();

        let currentClipBase = null;

        for (const layer of orderedPreviewLayers) {
          const rawLayerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const clipBase = isClippingLayer ? currentClipBase : null;
          let layerTarget = this.getRenderableLayerTarget(layer, rawLayerTarget, {
            forceSingleTexture: isClippingLayer,
            source: isClippingLayer ? "preview-cache-clipping-layer" : "preview-cache-sparse-layer",
          });
          let shouldRebindPreviewAfterTargetResolve = layerTarget !== rawLayerTarget;

          if (!isClippingLayer) {
            const shouldMaterializeClipBase = clipBaseLayerIds.has(layer.id);
            const previousLayerTarget = layerTarget;
            const baseTarget = shouldMaterializeClipBase
              ? this.getRenderableLayerTarget(layer, layerTarget, {
                  forceSingleTexture: true,
                  source: "preview-cache-clip-base",
                })
              : layerTarget;

            if (shouldMaterializeClipBase) {
              layerTarget = baseTarget;
              if (baseTarget !== previousLayerTarget || baseTarget !== rawLayerTarget) {
                shouldRebindPreviewAfterTargetResolve = true;
              }
            }

            currentClipBase = isValidClipBaseLayer(layer)
              ? this.createClipBaseForLayer(layer, baseTarget, layer.visible !== false)
              : null;
          }

          if (shouldRebindPreviewAfterTargetResolve) {
            bindArtboardProgram();
          }

          if (layer.visible === false) {
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !this.hasClipBaseSamplingTexture(clipBase))) {
            continue;
          }

          if (!this.hasRenderableRasterTarget(layerTarget)) {
            continue;
          }

          const renderResults = this.getLayerRenderResults(layer, layerTarget);
          const blendModeId = this.getLayerBlendModeId(layer);

          if (
            blendModeId !== 0 &&
            previewCompositeState?.read?.texture &&
            previewCompositeState?.write?.framebuffer &&
            this.isSparseRasterTarget(layerTarget) &&
            !this.hasPuppetLayerTransform(layer)
          ) {
            withLayerPreviewArtboardClip(layer, () => {
              const didBatchSparseBlend = drawSparsePreviewAdvancedBlendResults(
                layerTarget,
                renderResults,
                opacity,
                blendModeId,
                clipBase,
              );

              if (!didBatchSparseBlend) {
                for (const renderResult of renderResults) {
                  const layerTexture = renderResult?.texture;

                  if (!layerTexture) {
                    continue;
                  }

                  if (layerTexture !== layerTarget.texture) {
                    bindArtboardProgram();
                  }

                  drawBlendTexture(layerTexture, opacity, blendModeId, renderResult.rect, clipBase);
                }
              }
            });
            continue;
          }

          for (const renderResult of renderResults) {
            const layerTexture = renderResult?.texture;

            if (!layerTexture) {
              continue;
            }

            if (layerTexture !== layerTarget.texture) {
              bindArtboardProgram();
            }

            if (this.hasPuppetLayerTransform(layer)) {
              withLayerPreviewArtboardClip(layer, () => {
                if (isClippingLayer) {
                  drawBlendTexture(layerTexture, opacity, blendModeId, renderResult.rect, clipBase);
                } else {
                  const puppetTarget = this.getPuppetVisualTarget(layerTarget, renderResult);
                  const didDrawPuppet = this.drawPuppetLayer(layer, puppetTarget, opacity, {
                    camera: flatCamera,
                    sourceTexture: layerTexture,
                    viewportHeight: cacheHeight,
                    viewportWidth: cacheWidth,
                  });

                  bindArtboardProgram();

                  if (!didDrawPuppet) {
                    drawBlendTexture(layerTexture, opacity, blendModeId, renderResult.rect, null);
                  }
                }
              });
            } else {
              withLayerPreviewArtboardClip(layer, () => {
                drawBlendTexture(layerTexture, opacity, blendModeId, renderResult.rect, clipBase);
              });
            }

          }
        }

        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);

        if (previewCompositeState?.read?.texture) {
          this.drawScreenTexture(previewCompositeState.read.texture, {
            blend: false,
            framebuffer: this.previewFramebuffer,
            viewportHeight: cacheHeight,
            viewportWidth: cacheWidth,
          });
          previewCompositeState = null;
        }

        restorePreviewScissor(null);
      };

      const previewPassScissors = Array.isArray(dirtyScissors) && dirtyScissors.length > 0
        ? dirtyScissors
        : [null];

      previewPassScissors.forEach((dirtyScissor) => drawPreviewCachePass(dirtyScissor));

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);

      if (this.previewCacheMipmapped !== false && this.previewMipLevels > 1) {
        const didGenerateHighQualityMipmaps = this.generateHighQualityPreviewMipmaps();

        if (!didGenerateHighQualityMipmaps) {
          gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
          gl.generateMipmap(gl.TEXTURE_2D);
        }
      }

      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewCacheDirty = false;
      this.previewDirtyRects = [];
      this.previewDirtyCompactOptions = null;
      this.recordPreviewDirtyFrame({
        cacheHeight,
        cacheScale,
        cacheWidth,
        dirtyRect,
        dirtyRects,
        dirtyScissors,
      });
      this.previewCacheReady = true;
      this.captureArtboardFlatPreviewsFromPreviewCache({
        reason: this.previewCacheReason || "preview-cache-update",
      });
      this.clearPreviewCacheInteractionDefer();

      return true;
      } finally {
        trace?.end({
          cacheHeight: this.previewCacheHeight,
          cacheWidth: this.previewCacheWidth,
          mode: this.previewLastDirtyMode || this.previewDirtyStats?.lastMode || "unknown",
          reason: this.previewCacheReason || "unknown",
        });
      }
    }
,

    drawPreviewCacheToCanvas(options = {}) {
      if (!this.previewTexture || !this.previewCacheReady || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const { program, uniforms } = this.programInfo;
      const documentRect = this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect();
      const exactRect = this.getPreviewCacheExactDocumentRect(documentRect);

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, exactRect.width, exactRect.height);
      gl.uniform2f(
        uniforms.cameraPosition,
        (camera.x || 0) + exactRect.x * (camera.zoom || 1),
        (camera.y || 0) + exactRect.y * (camera.zoom || 1),
      );
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, exactRect.x, exactRect.y, exactRect.width, exactRect.height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, exactRect.width, exactRect.height);
      gl.uniform2f(uniforms.drawOrigin, exactRect.x, exactRect.y);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      this.setRasterTextureSampling(this.previewTexture, this.getPreviewCacheTextureMinFilter(), gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    });
  };
})(window.CBO = window.CBO || {});
