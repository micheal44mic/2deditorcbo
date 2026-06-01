(function registerDocumentRenderer(namespace) {
  const CROPPED_TARGET_EDGE_PADDING = 2;
  const CROPPED_TARGET_EFFECT_PADDING = 320;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_HISTORY_TILE_SIZE = 256;
  const RASTER_HISTORY_MOBILE_TILE_SIZE = 128;
  const PREVIEW_DIRTY_MAX_RECTS = 96;
  const PREVIEW_DIRTY_MERGE_WASTE_RATIO = 1.18;
  const PREVIEW_DIRTY_FULL_COVERAGE_RATIO = 0.92;
  const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug";
  const VIEWPORT_RENDER_OVERSCAN_CSS_PX = 256;
  const VIEWPORT_CULLING_DEBUG_EVENT = "cbo:viewport-culling-debug";
  const VIEWPORT_LAYER_CULL_SAFE_TYPES = new Set(["paint", "image", "raster", "bitmap"]);
  const ARTBOARD_RESIDENCY_IDLE_DELAY_MS = 7000;
  const ARTBOARD_RESIDENCY_WARM_HOLD_MS = 7000;
  const ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES = 384 * 1024 * 1024;
  const ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES = 640 * 1024 * 1024;
  const ARTBOARD_RESIDENCY_PREFETCH_CSS_PX = 640;
  const ARTBOARD_RESIDENCY_READBACK_CHUNK_BYTES = 4 * 1024 * 1024;
  const ARTBOARD_RESIDENCY_MAINTENANCE_FRAME_DELAY_MS = 32;
  const ARTBOARD_FLAT_PREVIEW_MAX_SIZE = 2048;
  const RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS = 1;
  const RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING = 2;
  const RASTER_TRANSFORM_ARTBOARD_TRANSFER_MIN_RATIO = 0.4;
  const RASTER_WARP_MESH_COLS = 64;
  const RASTER_WARP_MESH_ROWS = 64;
  const RASTER_MIB = 1024 * 1024;
  const RASTER_OPERATION_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });
  const RASTER_SCRATCH_SOFT_EVICT_BYTES = 96 * RASTER_MIB;
  const RASTER_SCRATCH_HARD_WARN_BYTES = 128 * RASTER_MIB;
  const RASTER_SCRATCH_TOP_RESOURCE_LIMIT = 8;
  const DESKTOP_RENDER_DPR_CAP = 2;
  const MOBILE_RENDER_DPR_CAP = 1.5;
  const LOW_MEMORY_MOBILE_RENDER_DPR_CAP = 1.25;
  const ANDROID_RENDER_DPR_CAP = 1.25;
  const LOW_MEMORY_ANDROID_RENDER_DPR_CAP = 1.15;
  const HIGH_QUALITY_DESKTOP_RENDER_DPR_CAP = 3;
  const HIGH_QUALITY_MOBILE_RENDER_DPR_CAP = 2;
  const HIGH_QUALITY_ANDROID_RENDER_DPR_CAP = 1.5;
  const MOBILE_PREVIEW_CACHE_MAX_SIZE = 1536;
  const MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX = 128;
  const MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX = 128;
  const ANDROID_PREVIEW_CACHE_MAX_SIZE = 1024;
  const ANDROID_PREVIEW_CACHE_OVERSCAN_CSS_PX = 64;
  const ANDROID_VIEWPORT_RENDER_OVERSCAN_CSS_PX = 64;
  const CLIP_IDENTITY_UV_MATRIX = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  const {
    WEBGL2_CONTEXT_ATTRIBUTES,
    ARTBOARD_VERTEX_SHADER_SOURCE,
    ARTBOARD_FRAGMENT_SHADER_SOURCE,
    PUPPET_VERTEX_SHADER_SOURCE,
    PUPPET_FRAGMENT_SHADER_SOURCE,
    TEXTURED_QUAD_VERTEX_SHADER_SOURCE,
    TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE,
    PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE,
    PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE,
    PREVIEW_HQ_MIPMAP_FRAGMENT_SHADER_SOURCE,
    GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE,
    GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE,
    MOTION_BLUR_VERTEX_SHADER_SOURCE,
    MOTION_BLUR_FRAGMENT_SHADER_SOURCE,
    FIELD_BLUR_VERTEX_SHADER_SOURCE,
    FIELD_BLUR_FRAGMENT_SHADER_SOURCE,
    RADIAL_BLUR_VERTEX_SHADER_SOURCE,
    RADIAL_BLUR_FRAGMENT_SHADER_SOURCE,
    GRAIN_FRAGMENT_SHADER_SOURCE,
    NOISE_FRAGMENT_SHADER_SOURCE,
    THRESHOLD_FRAGMENT_SHADER_SOURCE,
    CURVES_FRAGMENT_SHADER_SOURCE,
    COLOR_OVERLAY_FRAGMENT_SHADER_SOURCE,
    LAYER_STROKE_FRAGMENT_SHADER_SOURCE,
    LAYER_COMPOSITE_VERTEX_SHADER_SOURCE,
    LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE,
  } = namespace.DocumentRendererShaders || {};
  const DEFAULT_PUPPET_GRID_COLS = 256;
  const DEFAULT_PUPPET_GRID_ROWS = 256;
  const PUPPET_PIN_EPSILON = 0.000001;
  const MAX_GAUSSIAN_BLUR_RADIUS = 200;
  const MAX_MOTION_BLUR_DISTANCE = 300;
  const MAX_FIELD_BLUR_RADIUS = 200;
  const MAX_FIELD_BLUR_PINS = 8;
  const MAX_RADIAL_BLUR_AMOUNT = 200;
  const MAX_GRAIN_AMOUNT = 100;
  const MAX_GRAIN_SCALE = 100;
  const DEFAULT_GRAIN_SCALE = 42;
  const MAX_NOISE_AMOUNT = 100;
  const MAX_NOISE_SCALE = 100;
  const DEFAULT_NOISE_SCALE = 1;
  const MAX_THRESHOLD_VALUE = 255;
  const DEFAULT_THRESHOLD_VALUE = 128;
  const MAX_LAYER_STROKE_SIZE = 64;
  const PREVIEW_CACHE_ZOOM_THRESHOLD = 1.0;
  const PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD = 10.01;
  const PREVIEW_CACHE_MAX_SIZE = 2048;
  const HIGH_QUALITY_PREVIEW_CACHE_MAX_SIZE = 4096;
  const HIGH_QUALITY_MOBILE_PREVIEW_CACHE_MAX_SIZE = 3072;
  const HIGH_QUALITY_ANDROID_PREVIEW_CACHE_MAX_SIZE = 2048;
  const PREVIEW_CACHE_SCOPE_DEFAULT = "visible-artboards";
  const PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX = 256;

  function isMobileLikeEnvironment() {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return false;
    }

    const hasTouch = Number(navigator.maxTouchPoints) > 0;
    const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
    const userAgent = navigator.userAgent || "";
    const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

    return hasTouch || hasCoarsePointer || hasMobileUserAgent;
  }

  function isAndroidLikeEnvironment() {
    if (typeof navigator === "undefined") {
      return false;
    }

    const platformHints = [
      navigator.userAgentData?.platform ||
        "",
      navigator.platform,
      navigator.userAgent,
      navigator.vendor,
    ];

    return platformHints.some((value) => /Android/i.test(String(value || "")));
  }

  function isAndroidPerformanceMode() {
    return namespace.androidPerformanceMode === true ||
      namespace.deviceIsAndroid === true ||
      isAndroidLikeEnvironment();
  }

  function isAndroidFullRenderMode() {
    return isAndroidPerformanceMode() && namespace.androidFullRenderMode === true;
  }

  function isAndroidZoomOutPreviewCacheAllowed(options = {}) {
    if (!isAndroidPerformanceMode() || namespace.androidZoomOutPreviewCacheEnabled !== true) {
      return false;
    }

    if (options.activeStrokeTexture || options.deferPreviewCacheUpdate === true) {
      return false;
    }

    const zoom = Math.abs(Number(options.camera?.zoom) || 1);

    return zoom < PREVIEW_CACHE_ZOOM_THRESHOLD;
  }

  function isAndroidPreviewCacheDisabled(options = {}) {
    return isAndroidPerformanceMode() &&
      !isAndroidZoomOutPreviewCacheAllowed(options) &&
      (namespace.androidFullRenderMode === true || namespace.androidPreviewCacheEnabled === false);
  }

  function isAndroidDirtyRegionsDisabled() {
    return isAndroidPerformanceMode() &&
      (namespace.androidFullRenderMode === true || namespace.androidDirtyRegionsEnabled === false);
  }

  function isPixelPerfectRenderingEnabled() {
    if (namespace.pixelPerfectRenderingEnabled === false) {
      return false;
    }

    if (isAndroidPerformanceMode() && namespace.androidPixelPerfectEnabled !== true) {
      return false;
    }

    return true;
  }

  function getNavigatorDeviceMemory() {
    const memory = typeof navigator !== "undefined" ? Number(navigator.deviceMemory) : 0;

    return Number.isFinite(memory) && memory > 0 ? memory : 0;
  }

  function isHighQualityViewEnabled() {
    if (namespace.highQualityViewEnabled === true) {
      return true;
    }

    if (typeof namespace.isHighQualityViewEnabled !== "function") {
      return false;
    }

    try {
      return namespace.isHighQualityViewEnabled() === true;
    } catch (error) {
      return false;
    }
  }

  function getCanvasPerformanceDpr(options = {}) {
    const rawDpr = Number.isFinite(Number(options.dpr))
      ? Number(options.dpr)
      : (
          typeof window !== "undefined" && Number.isFinite(Number(window.devicePixelRatio))
            ? Number(window.devicePixelRatio)
            : 1
        );

    const isAndroid = options.androidLike === true ||
      (options.androidLike !== false && isAndroidLikeEnvironment());
    const isMobile = options.mobileLike === true ||
      (options.mobileLike !== false && isMobileLikeEnvironment());

    const memory = Number.isFinite(Number(options.deviceMemory))
      ? Number(options.deviceMemory)
      : getNavigatorDeviceMemory();
    const highQualityView = isHighQualityViewEnabled();

    const normalDefaultCap = isAndroid
      ? (memory > 0 && memory <= 4 ? LOW_MEMORY_ANDROID_RENDER_DPR_CAP : ANDROID_RENDER_DPR_CAP)
      : isMobile
        ? (memory > 0 && memory <= 4 ? LOW_MEMORY_MOBILE_RENDER_DPR_CAP : MOBILE_RENDER_DPR_CAP)
        : DESKTOP_RENDER_DPR_CAP;
    const highQualityDefaultCap = isAndroid
      ? HIGH_QUALITY_ANDROID_RENDER_DPR_CAP
      : isMobile
        ? HIGH_QUALITY_MOBILE_RENDER_DPR_CAP
        : HIGH_QUALITY_DESKTOP_RENDER_DPR_CAP;
    const defaultCap = highQualityView ? highQualityDefaultCap : normalDefaultCap;

    const normalNamespaceCap = isAndroid
      ? Number(namespace.androidRenderDprCap ?? namespace.mobileRenderDprCap)
      : isMobile
        ? Number(namespace.mobileRenderDprCap ?? namespace.maxRenderDpr)
        : Number(namespace.desktopRenderDprCap ?? namespace.maxRenderDpr);
    const highQualityNamespaceCap = isAndroid
      ? Number(namespace.highQualityAndroidRenderDprCap ?? namespace.highQualityMobileRenderDprCap)
      : isMobile
        ? Number(namespace.highQualityMobileRenderDprCap ?? namespace.highQualityRenderDprCap)
        : Number(namespace.highQualityDesktopRenderDprCap ?? namespace.highQualityRenderDprCap);
    const namespaceCap = highQualityView ? highQualityNamespaceCap : normalNamespaceCap;

    const optionCap = Number(options.maxRenderDpr);

    const cap = Number.isFinite(optionCap) && optionCap > 0
      ? optionCap
      : Number.isFinite(namespaceCap) && namespaceCap > 0
        ? namespaceCap
        : defaultCap;

    return Math.max(1, Math.min(Math.max(1, rawDpr), cap));
  }

  function getHighQualityPreviewCacheMaxSize() {
    if (isAndroidLikeEnvironment()) {
      return HIGH_QUALITY_ANDROID_PREVIEW_CACHE_MAX_SIZE;
    }

    return isMobileLikeEnvironment()
      ? HIGH_QUALITY_MOBILE_PREVIEW_CACHE_MAX_SIZE
      : HIGH_QUALITY_PREVIEW_CACHE_MAX_SIZE;
  }

  function getDefaultPreviewCacheMaxSize() {
    if (isHighQualityViewEnabled()) {
      return getHighQualityPreviewCacheMaxSize();
    }

    if (isAndroidLikeEnvironment()) {
      return ANDROID_PREVIEW_CACHE_MAX_SIZE;
    }

    return isMobileLikeEnvironment() ? MOBILE_PREVIEW_CACHE_MAX_SIZE : PREVIEW_CACHE_MAX_SIZE;
  }

  function getDefaultPreviewCacheOverscanCssPx() {
    if (isAndroidLikeEnvironment()) {
      return ANDROID_PREVIEW_CACHE_OVERSCAN_CSS_PX;
    }

    return isMobileLikeEnvironment()
      ? MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX
      : PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX;
  }

  function getDefaultViewportRenderOverscanCssPx() {
    if (isAndroidLikeEnvironment()) {
      return ANDROID_VIEWPORT_RENDER_OVERSCAN_CSS_PX;
    }

    return isMobileLikeEnvironment()
      ? MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX
      : VIEWPORT_RENDER_OVERSCAN_CSS_PX;
  }

  function normalizeAngle(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return ((number % 360) + 360) % 360;
  }

  function normalizePercent(value, fallback = 50) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
  }

  function normalizeRadialBlurMode(value) {
    return String(value || "").trim().toLowerCase() === "zoom" ? "zoom" : "spin";
  }

  function normalizeGrainAmount(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_GRAIN_AMOUNT, number)) : 0;
  }

  function normalizeGrainScale(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(1, Math.min(MAX_GRAIN_SCALE, number)) : DEFAULT_GRAIN_SCALE;
  }

  function normalizeNoiseAmount(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_NOISE_AMOUNT, number)) : 0;
  }

  function normalizeNoiseScale(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(1, Math.min(MAX_NOISE_SCALE, number)) : DEFAULT_NOISE_SCALE;
  }

  function normalizeThresholdValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_THRESHOLD_VALUE, number)) : DEFAULT_THRESHOLD_VALUE;
  }

  function getCurvesEngine() {
    return namespace.CurvesEngine || null;
  }

  function createDefaultCurvesPoints() {
    const engine = getCurvesEngine();

    return engine?.createDefaultPointsByChannel?.() || {
      b: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      g: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      r: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      rgb: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
    };
  }

  function normalizeCurvesEffect(effect) {
    const engine = getCurvesEngine();

    if (engine?.normalizeEffect) {
      return engine.normalizeEffect(effect || {});
    }

    return {
      type: "curves",
      enabled: effect?.enabled !== false,
      points: createDefaultCurvesPoints(),
    };
  }

  function hasMeaningfulCurvesEffect(effect) {
    const normalized = normalizeCurvesEffect(effect);
    const engine = getCurvesEngine();

    return normalized.enabled !== false && engine?.hasMeaningfulCurves?.(normalized.points) === true;
  }

  function buildPackedCurvesLut(effect) {
    const engine = getCurvesEngine();
    const normalized = normalizeCurvesEffect(effect);

    return engine?.buildPackedLut?.(normalized.points) || null;
  }

  function normalizeFieldBlurPins(pins) {
    if (!Array.isArray(pins)) {
      return [];
    }

    return pins
      .filter(Boolean)
      .slice(0, MAX_FIELD_BLUR_PINS)
      .map((pin) => {
        const x = Number(pin.x);
        const y = Number(pin.y);
        const blur = Number(pin.blur);

        return {
          blur: Number.isFinite(blur) ? Math.max(0, Math.min(MAX_FIELD_BLUR_RADIUS, blur)) : 0,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        };
      });
  }

  function hasFieldBlurAmount(pins) {
    return normalizeFieldBlurPins(pins).some((pin) => pin.blur > 0);
  }

  class DocumentRenderer {
    static createContext(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per creare WebGL2.");
      }

      const gl = canvas.getContext("webgl2", WEBGL2_CONTEXT_ATTRIBUTES);

      return namespace.EngineGovernor?.instrumentWebGlContext?.(gl) || gl;
    }

    static getPerformanceDpr(options = {}) {
      return getCanvasPerformanceDpr(options);
    }

    static isMobileLikeEnvironment() {
      return isMobileLikeEnvironment();
    }

    static isAndroidLikeEnvironment() {
      return isAndroidLikeEnvironment();
    }

    static isAndroidFullRenderMode() {
      return isAndroidFullRenderMode();
    }

    static isAndroidPreviewCacheDisabled(options = {}) {
      return isAndroidPreviewCacheDisabled(options);
    }

    static isAndroidZoomOutPreviewCacheAllowed(options = {}) {
      return isAndroidZoomOutPreviewCacheAllowed(options);
    }

    static isAndroidDirtyRegionsDisabled() {
      return isAndroidDirtyRegionsDisabled();
    }

    static resizeCanvasViewport(canvas, gl) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per misurare il viewport.");
      }

      if (!gl || typeof gl.viewport !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido per il viewport.");
      }

      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, canvas.clientHeight || Math.round(rect.height) || 1);
      const dpr = getCanvasPerformanceDpr();
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      const didResize = canvas.width !== width || canvas.height !== height;

      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);

      return { dpr, width, height, didResize };
    }

    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createTexture !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido.");
      }

      this.gl = options.gl;
      this.options = {
        transparentBackground: options.transparentBackground === true,
        cssArtboardPaper: options.cssArtboardPaper === true,
        documentWidth: Number.isFinite(options.documentWidth) && options.documentWidth > 0
          ? Math.floor(options.documentWidth)
          : null,
        documentHeight: Number.isFinite(options.documentHeight) && options.documentHeight > 0
          ? Math.floor(options.documentHeight)
          : null,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
        isolateDocumentArtboards: options.isolateDocumentArtboards === true,
        debugViewportCulling: options.debugViewportCulling === true,
        debugViewportCullingLog: options.debugViewportCullingLog === true,
        enableViewportLayerCulling: options.enableViewportLayerCulling === true,
        measureViewportLayerCulling: options.measureViewportLayerCulling === true,
        enableArtboardResidency: options.enableArtboardResidency !== false,
        enableArtboardResidencyBudget: options.enableArtboardResidencyBudget !== false,
        enableArtboardResidencyPrefetch: options.enableArtboardResidencyPrefetch !== false,
        enableArtboardFlatPreviews: options.enableArtboardFlatPreviews !== false,
        enableArtboardTileResidency: options.enableArtboardTileResidency !== false,
        artboardResidencyIdleDelayMs: Number.isFinite(options.artboardResidencyIdleDelayMs) && options.artboardResidencyIdleDelayMs >= 0
          ? Math.floor(options.artboardResidencyIdleDelayMs)
          : ARTBOARD_RESIDENCY_IDLE_DELAY_MS,
        artboardResidencyWarmHoldMs: Number.isFinite(options.artboardResidencyWarmHoldMs) && options.artboardResidencyWarmHoldMs >= 0
          ? Math.floor(options.artboardResidencyWarmHoldMs)
          : ARTBOARD_RESIDENCY_WARM_HOLD_MS,
        artboardResidencySoftBudgetBytes: Number.isFinite(options.artboardResidencySoftBudgetBytes) && options.artboardResidencySoftBudgetBytes > 0
          ? Math.floor(options.artboardResidencySoftBudgetBytes)
          : ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES,
        artboardResidencyHardBudgetBytes: Number.isFinite(options.artboardResidencyHardBudgetBytes) && options.artboardResidencyHardBudgetBytes > 0
          ? Math.floor(options.artboardResidencyHardBudgetBytes)
          : ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES,
        artboardResidencyPrefetchCssPx: Number.isFinite(options.artboardResidencyPrefetchCssPx) && options.artboardResidencyPrefetchCssPx >= 0
          ? Math.floor(options.artboardResidencyPrefetchCssPx)
          : ARTBOARD_RESIDENCY_PREFETCH_CSS_PX,
        artboardResidencyReadbackChunkBytes: Number.isFinite(options.artboardResidencyReadbackChunkBytes) && options.artboardResidencyReadbackChunkBytes > 0
          ? Math.floor(options.artboardResidencyReadbackChunkBytes)
          : ARTBOARD_RESIDENCY_READBACK_CHUNK_BYTES,
        artboardResidencyMaintenanceFrameDelayMs: Number.isFinite(options.artboardResidencyMaintenanceFrameDelayMs) && options.artboardResidencyMaintenanceFrameDelayMs >= 0
          ? Math.floor(options.artboardResidencyMaintenanceFrameDelayMs)
          : ARTBOARD_RESIDENCY_MAINTENANCE_FRAME_DELAY_MS,
        artboardFlatPreviewMaxSize: Number.isFinite(options.artboardFlatPreviewMaxSize) && options.artboardFlatPreviewMaxSize > 0
          ? Math.floor(options.artboardFlatPreviewMaxSize)
          : ARTBOARD_FLAT_PREVIEW_MAX_SIZE,
        previewCacheMaxSize: Number.isFinite(options.previewCacheMaxSize) && options.previewCacheMaxSize > 0
          ? Math.floor(options.previewCacheMaxSize)
          : getDefaultPreviewCacheMaxSize(),
        previewCacheMaxSizeExplicit: Number.isFinite(options.previewCacheMaxSize) && options.previewCacheMaxSize > 0,
        previewCacheOverscanCssPx: Number.isFinite(options.previewCacheOverscanCssPx) && options.previewCacheOverscanCssPx >= 0
          ? Math.floor(options.previewCacheOverscanCssPx)
          : getDefaultPreviewCacheOverscanCssPx(),
        previewCacheScope: typeof options.previewCacheScope === "string" && options.previewCacheScope.trim()
          ? options.previewCacheScope.trim()
          : PREVIEW_CACHE_SCOPE_DEFAULT,
      };
      this.layerModel = options.layerModel ||
        (namespace.DocumentLayerModel
          ? new namespace.DocumentLayerModel({
              ignoreGlobalArtboards: this.options.isolateDocumentArtboards,
            })
          : null);
      this.width = 1;
      this.height = 1;
      this.texture = null;
      this.framebuffer = null;
      this.rasterTargetIdSequence = 1;
      this.paintLayerId = "";
      this.rasterTargetsByLayerId = new Map();
      this.puppetMeshResourcesByLayerId = new Map();
      this.rasterTransformPreview = null;
      this.artboardDragPreview = null;
      this.vectorTextTransformPreviewLayerId = "";
      this.previewTexture = null;
      this.previewFramebuffer = null;
      this.previewCacheWidth = 0;
      this.previewCacheHeight = 0;
      this.previewCacheScale = 1;
      this.previewCacheDocumentRect = null;
      this.previewCacheScopeInfo = null;
      this.previewMipLevels = 0;
      this.previewCacheMipmapped = true;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewDirtyStats = this.createPreviewDirtyStats();
      this.previewCacheReady = false;
      this.previewCacheReason = "init";
      this.previewCacheUpdateDeferFramePending = false;
      this.viewportCullingStatsSequence = 0;
      this.viewportCullingLastStats = null;
      this.artboardResidencyWarmUntilById = new Map();
      this.artboardResidencyLast = null;
      this.artboardResidencyLastViewOptions = null;
      this.artboardResidencyIdleTimer = 0;
      this.artboardResidencyMaintenanceJob = null;
      this.artboardResidencyMaintenanceTimer = 0;
      this.artboardResidencyMaintenanceFrameRequest = 0;
      this.artboardResidencyMaintenanceIdleCallback = 0;
      this.artboardResidencyMaintenanceSequence = 0;
      this.artboardResidencyLastColdStorage = null;
      this.artboardResidencyAccessById = new Map();
      this.artboardResidencyMetricsLast = null;
      this.artboardResidencyPressureLast = null;
      this.artboardFlatPreviewsById = new Map();
      this.artboardFlatPreviewVersion = 1;
      this.texturedQuad = null;
      this.rasterWarpMesh = null;
      this.programInfo = null;
      this.texturedQuadProgramInfo = null;
      this.puppetProgramInfo = null;
      this.perspectiveQuadProgramInfo = null;
      this.previewHqMipmapProgramInfo = null;
      this.previewHqMipmapScratchTexture = null;
      this.previewHqMipmapScratchFramebuffer = null;
      this.previewHqMipmapScratchWidth = 0;
      this.previewHqMipmapScratchHeight = 0;
      this.gaussianBlurProgramInfo = null;
      this.motionBlurProgramInfo = null;
      this.fieldBlurProgramInfo = null;
      this.radialBlurProgramInfo = null;
      this.grainProgramInfo = null;
      this.noiseProgramInfo = null;
      this.thresholdProgramInfo = null;
      this.curvesProgramInfo = null;
      this.curvesLutTexture = null;
      this.layerStrokeProgramInfo = null;
      this.layerCompositeProgramInfo = null;
      this.layerCompositeScratchA = null;
      this.layerCompositeScratchB = null;
      this.layerCompositeWidth = 0;
      this.layerCompositeHeight = 0;
      this.layerEffectScratchA = null;
      this.layerEffectScratchB = null;
      this.activeStrokeScratchTarget = null;
      this.activeStrokeSelectionClipTexture = null;
      this.activeStrokeSelectionClipKey = "";
      this.activeStrokeSelectionClipWidth = 0;
      this.activeStrokeSelectionClipHeight = 0;
      this.quad = null;
      this.isDisposed = false;
      this.handleLayerModelChange = this.handleLayerModelChange.bind(this);
      this.handleDocumentContentChange = this.handleDocumentContentChange.bind(this);
      this.handleHistoryChange = this.handleHistoryChange.bind(this);

      try {
        this.configureDocumentSize(options.viewportWidth, options.viewportHeight);
        this.createBaseLayerTarget();
        this.programInfo = this.createProgramInfo();
        this.quad = this.createArtboardQuad();
      } catch (error) {
        this.dispose();
        throw error;
      }

      this.layerModel?.addEventListener?.("change", this.handleLayerModelChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.addEventListener("cbo:history-change", this.handleHistoryChange);
    }

    getPaintTarget() {
      const layerId = this.resolvePaintLayerId();
      let target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget(layerId, {
        source: "get-paint-target",
      });

      target = this.ensureWritableRasterTarget(layerId, {
        source: "get-paint-target-copy-on-write-detach",
      }) || target;

      if (this.isSparseRasterTarget(target)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: "get-paint-target-materialize-sparse",
        }) || this.createPaintTarget(layerId, {
          source: "get-paint-target-materialize-sparse",
        });
      }

      this.paintLayerId = layerId;
      target.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, target);
      this.texture = target.texture;
      this.framebuffer = target.framebuffer;
      this.updateRasterTargetResourceMetadata(target, {
        kind: "paintTarget",
        label: "main paint raster target",
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: "get-paint-target",
      });

      return {
        ...target,
        layerId,
      };
    }

    getDocumentDrawTarget(layerId = this.resolvePaintLayerId()) {
      return {
        cropped: false,
        framebuffer: null,
        height: Math.max(1, Math.round(this.height || 1)),
        layerId,
        texture: null,
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };
    }

    getDocumentBoundsRect() {
      const artboardUnion = this.options?.isolateDocumentArtboards
        ? null
        : namespace.getDocumentArtboardUnionRect?.();

      return artboardUnion || {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        height: Math.max(1, Math.round(this.height || 1)),
      };
    }

    ensurePaintLayerForBrush(options = {}) {
      const paintLayer = this.layerModel?.ensureActivePaintLayer?.({
        reuseExistingPaintLayer: true,
        source: "brush-stroke",
      });

      if (paintLayer?.id) {
        if (options.materialize === false) {
          this.paintLayerId = paintLayer.id;
          return this.getDocumentDrawTarget(paintLayer.id);
        }

        const target = this.getPaintTarget();

        if (this.isCroppedRasterTarget(target)) {
          return this.materializeRasterTarget(paintLayer.id, {
            source: "brush-materialize",
          }) || target;
        }

        return target;
      }

      if (options.materialize === false) {
        const layerId = this.resolvePaintLayerId();

        this.paintLayerId = layerId;
        return this.getDocumentDrawTarget(layerId);
      }

      return this.getPaintTarget();
    }

    clearActiveLayer(options = {}) {
      this.layerModel?.setActiveLayer?.(null, {
        source: options.source || "clear-active-layer",
      });
    }

    getRasterTarget(layerId) {
      if (!layerId) {
        throw new TypeError("DocumentRenderer richiede un layerId per il target raster.");
      }

      let target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget(layerId, {
        source: "get-raster-target",
      });

      target = this.ensureWritableRasterTarget(layerId, {
        source: "get-raster-target-copy-on-write-detach",
      }) || target;

      if (this.isSparseRasterTarget(target)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: "get-raster-target-materialize-sparse",
        }) || this.createPaintTarget(layerId, {
          source: "get-raster-target-materialize-sparse",
        });
      }

      const activePaintLayerId = this.resolvePaintLayerId();
      const isPaintTarget = this.isPaintRasterLayer(layerId, target);

      if (layerId === activePaintLayerId) {
        this.paintLayerId = layerId;
        this.texture = target.texture;
        this.framebuffer = target.framebuffer;
      }
      target.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, target);
      this.updateRasterTargetResourceMetadata(target, {
        kind: layerId === "background" ? "background" : isPaintTarget ? "paintTarget" : "layer",
        label: layerId,
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: "get-raster-target",
      });

      return {
        ...target,
        layerId,
      };
    }

    getRenderableLayers() {
      const layers = this.layerModel?.getRenderableLayers?.();

      if (Array.isArray(layers)) {
        return layers;
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    getOrderedLayersBottomToTop() {
      const layers = this.layerModel?.flattenTopToBottom?.();

      if (Array.isArray(layers)) {
        return layers.reverse();
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    hasPuppetLayerTransform(layer) {
      return Array.isArray(layer?.puppet?.pins) && layer.puppet.pins.length > 0;
    }

    getPuppetGridSize(layer) {
      return {
        cols: DEFAULT_PUPPET_GRID_COLS,
        rows: DEFAULT_PUPPET_GRID_ROWS,
      };
    }

    getPuppetLocalPins(layer, target) {
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const pins = layer?.puppet?.pins || [];

      return pins.map((pin) => ({
        ...pin,
        restX: (Number.isFinite(pin.restX) ? pin.restX : 0) - targetRect.x,
        restY: (Number.isFinite(pin.restY) ? pin.restY : 0) - targetRect.y,
        x: (Number.isFinite(pin.x) ? pin.x : 0) - targetRect.x,
        y: (Number.isFinite(pin.y) ? pin.y : 0) - targetRect.y,
      }));
    }

    writeRigidMlsPoint(vertices, offset, x, y, pins) {
      if (!pins?.length) {
        vertices[offset] = x;
        vertices[offset + 1] = y;
        return;
      }

      if (pins.length === 1) {
        const pin = pins[0];
        const rotation = Number(pin.rotation);
        const angle = Number.isFinite(rotation) ? rotation : 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = x - pin.restX;
        const dy = y - pin.restY;

        vertices[offset] = pin.x + dx * cos - dy * sin;
        vertices[offset + 1] = pin.y + dx * sin + dy * cos;
        return;
      }

      let pStarX = 0;
      let pStarY = 0;
      let qStarX = 0;
      let qStarY = 0;
      let weightSum = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const distSq = dx * dx + dy * dy;

        if (distSq < PUPPET_PIN_EPSILON) {
          vertices[offset] = pin.x;
          vertices[offset + 1] = pin.y;
          return;
        }

        const weight = 1 / distSq;

        weightSum += weight;
        pStarX += weight * pin.restX;
        pStarY += weight * pin.restY;
        qStarX += weight * pin.x;
        qStarY += weight * pin.y;
      }

      pStarX /= weightSum;
      pStarY /= weightSum;
      qStarX /= weightSum;
      qStarY /= weightSum;

      let a = 0;
      let b = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const phatX = pin.restX - pStarX;
        const phatY = pin.restY - pStarY;
        const qhatX = pin.x - qStarX;
        const qhatY = pin.y - qStarY;

        a += weight * (phatX * qhatX + phatY * qhatY);
        b += weight * (phatX * qhatY - phatY * qhatX);
      }

      const norm = Math.sqrt(a * a + b * b);
      const rotA = norm > PUPPET_PIN_EPSILON ? a / norm : 1;
      const rotB = norm > PUPPET_PIN_EPSILON ? b / norm : 0;
      const vhatX = x - pStarX;
      const vhatY = y - pStarY;

      let resultX = qStarX + vhatX * rotA - vhatY * rotB;
      let resultY = qStarY + vhatX * rotB + vhatY * rotA;
      let rotationDeltaX = 0;
      let rotationDeltaY = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const angle = Number(pin.rotation);

        if (!Number.isFinite(angle) || Math.abs(angle) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        rotationDeltaX += weight * (dx * cos - dy * sin - dx);
        rotationDeltaY += weight * (dx * sin + dy * cos - dy);
      }

      resultX += rotationDeltaX / weightSum;
      resultY += rotationDeltaY / weightSum;

      vertices[offset] = resultX;
      vertices[offset + 1] = resultY;
    }

    deletePuppetMeshResource(layerId) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource) {
        return false;
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

      this.puppetMeshResourcesByLayerId.delete(layerId);
      return true;
    }

    getPuppetAlphaSamples(target, cols, rows) {
      const samples = new Uint8Array(cols * rows);

      samples.fill(255);

      if (!target?.texture) {
        return samples;
      }

      const gl = this.gl;
      const fboRead = gl.createFramebuffer();
      const fboWrite = gl.createFramebuffer();
      const miniTexture = gl.createTexture();

      if (!fboRead || !fboWrite || !miniTexture) {
        if (fboRead) {
          gl.deleteFramebuffer(fboRead);
        }

        if (fboWrite) {
          gl.deleteFramebuffer(fboWrite);
        }

        if (miniTexture) {
          gl.deleteTexture(miniTexture);
        }

        return samples;
      }

      gl.bindTexture(gl.TEXTURE_2D, miniTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboRead);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fboWrite);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, miniTexture, 0);

      const readReady = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const writeReady = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

      if (readReady && writeReady) {
        gl.blitFramebuffer(
          0,
          0,
          target.width,
          target.height,
          0,
          0,
          cols,
          rows,
          gl.COLOR_BUFFER_BIT,
          gl.LINEAR,
        );

        const pixels = new Uint8Array(cols * rows * 4);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboWrite);
        gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < cols; x += 1) {
            const webglY = rows - 1 - y;
            const alpha = pixels[(webglY * cols + x) * 4 + 3];

            samples[y * cols + x] = alpha;
          }
        }
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(fboRead);
      gl.deleteFramebuffer(fboWrite);
      gl.deleteTexture(miniTexture);

      return samples;
    }

    getPuppetAlphaMask(target, cols, rows, options = {}) {
      const samples = this.getPuppetAlphaSamples(target, cols, rows);
      const mask = new Uint8Array(cols * rows);
      const threshold = Number.isFinite(options.threshold)
        ? Math.max(0, Math.min(255, options.threshold))
        : 2;

      for (let index = 0; index < samples.length; index += 1) {
        mask[index] = samples[index] > threshold ? 1 : 0;
      }

      return mask;
    }

    getRasterAlphaAtPoint(targetOrLayerId, x, y) {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId)
        : targetOrLayerId;

      if (this.isSparseRasterTarget(target)) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return 0;
        }

        const tileSize = this.getRasterHistoryTileSize({ tileSize: target.tileSize });
        const tx = Math.floor(x / tileSize);
        const ty = Math.floor(y / tileSize);
        const tileTarget = this.getSparseRasterTile(target, tx, ty);

        return tileTarget ? this.getRasterAlphaAtPoint(tileTarget, x, y) : 0;
      }

      if (!target?.framebuffer || !Number.isFinite(x) || !Number.isFinite(y)) {
        return 0;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const pixelX = Math.floor(x - targetRect.x);
      const pixelY = Math.floor(y - targetRect.y);

      if (
        pixelX < 0 ||
        pixelY < 0 ||
        pixelX >= target.width ||
        pixelY >= target.height
      ) {
        return 0;
      }

      const gl = this.gl;
      const pixel = new Uint8Array(4);
      const webglY = target.height - pixelY - 1;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.readPixels(pixelX, webglY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

      return pixel[3];
    }

    getPuppetRestPoint(layerId, targetX, targetY) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource?.indices || !resource?.vertices) {
        return { x: targetX, y: targetY };
      }

      const { vertices, indices } = resource;
      const targetWidth = Math.max(1, resource.targetWidth || 1);
      const targetHeight = Math.max(1, resource.targetHeight || 1);
      const originX = Number.isFinite(resource.targetX) ? resource.targetX : 0;
      const originY = Number.isFinite(resource.targetY) ? resource.targetY : 0;

      for (let index = 0; index < indices.length; index += 3) {
        const i0 = indices[index] * 4;
        const i1 = indices[index + 1] * 4;
        const i2 = indices[index + 2] * 4;
        const x1 = vertices[i0];
        const y1 = vertices[i0 + 1];
        const x2 = vertices[i1];
        const y2 = vertices[i1 + 1];
        const x3 = vertices[i2];
        const y3 = vertices[i2 + 1];
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);

        if (Math.abs(det) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const w1 = ((y2 - y3) * (targetX - x3) + (x3 - x2) * (targetY - y3)) / det;
        const w2 = ((y3 - y1) * (targetX - x3) + (x1 - x3) * (targetY - y3)) / det;
        const w3 = 1 - w1 - w2;

        if (w1 >= -0.05 && w2 >= -0.05 && w3 >= -0.05) {
          const u1 = vertices[i0 + 2];
          const v1 = vertices[i0 + 3];
          const u2 = vertices[i1 + 2];
          const v2 = vertices[i1 + 3];
          const u3 = vertices[i2 + 2];
          const v3 = vertices[i2 + 3];
          const u = w1 * u1 + w2 * u2 + w3 * u3;
          const v = w1 * v1 + w2 * v2 + w3 * v3;

          return {
            x: originX + u * targetWidth,
            y: originY + (1 - v) * targetHeight,
          };
        }
      }

      return { x: targetX, y: targetY };
    }

    createPuppetMeshResource(layerId, target, cols, rows) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ebo = gl.createBuffer();
      const vertices = new Float32Array((cols + 1) * (rows + 1) * 4);
      const validIndices = [];
      const targetRect = this.getRasterTargetDocumentRect(target);

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

        throw new Error("Impossibile creare la mesh puppet WebGL2.");
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;

          validIndices.push(a, c, b, b, c, d);
        }
      }

      const indices = new Uint32Array(validIndices);

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

      const resource = {
        cols,
        ebo,
        indexCount: indices.length,
        indices,
        rows,
        targetHeight: target.height,
        targetWidth: target.width,
        targetX: targetRect?.x || 0,
        targetY: targetRect?.y || 0,
        vao,
        vbo,
        vertices,
      };

      this.puppetMeshResourcesByLayerId.set(layerId, resource);
      return resource;
    }

    getPuppetMeshResource(layerId, target, cols, rows) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (
        resource?.cols === cols &&
        resource?.rows === rows &&
        resource?.targetWidth === target.width &&
        resource?.targetHeight === target.height &&
        resource?.targetX === (this.getRasterTargetDocumentRect(target)?.x || 0) &&
        resource?.targetY === (this.getRasterTargetDocumentRect(target)?.y || 0)
      ) {
        return resource;
      }

      this.deletePuppetMeshResource(layerId);
      return this.createPuppetMeshResource(layerId, target, cols, rows);
    }

    updatePuppetMeshVertices(resource, layer, target) {
      const pins = this.getPuppetLocalPins(layer, target);
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const vertices = resource.vertices;
      const cols = resource.cols;
      const rows = resource.rows;
      let offset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const sourceX = (gridX / cols) * target.width;
          const sourceY = (gridY / rows) * target.height;

          this.writeRigidMlsPoint(vertices, offset, sourceX, sourceY, pins);
          vertices[offset] += targetRect.x;
          vertices[offset + 1] += targetRect.y;
          vertices[offset + 2] = sourceX / target.width;
          vertices[offset + 3] = 1 - sourceY / target.height;
          offset += 4;
        }
      }
    }

    getPuppetDeformedBounds(layer, target) {
      if (!this.hasPuppetLayerTransform(layer) || !target?.texture) {
        return this.getRasterTargetDocumentRect(target);
      }

      const { cols, rows } = this.getPuppetGridSize(layer);
      const resource = this.getPuppetMeshResource(layer.id, target, cols, rows);

      if (!resource?.vertices?.length) {
        return this.getRasterTargetDocumentRect(target);
      }

      this.updatePuppetMeshVertices(resource, layer, target);

      const vertices = resource.vertices;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let offset = 0; offset < vertices.length; offset += 4) {
        const x = vertices[offset];
        const y = vertices[offset + 1];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return this.getRasterTargetDocumentRect(target);
      }

      return this.getClampedDocumentRect({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }, CROPPED_TARGET_EDGE_PADDING) || this.getRasterTargetDocumentRect(target);
    }

    getPuppetMeshSignature(layer, target) {
      const pins = layer.puppet?.pins || [];
      const { cols, rows } = this.getPuppetGridSize(layer);
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const parts = [
        targetRect.x,
        targetRect.y,
        target.width,
        target.height,
        cols,
        rows,
      ];

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];

        parts.push(pin.id, pin.restX, pin.restY, pin.x, pin.y, pin.rotation || 0);
      }

      return parts.join("|");
    }

    drawPuppetLayer(layer, target, opacity, options = {}) {
      if (!target?.texture || !layer?.id) {
        return false;
      }

      const gl = this.gl;
      const { cols, rows } = this.getPuppetGridSize(layer);
      const resource = this.getPuppetMeshResource(layer.id, target, cols, rows);
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const sourceTexture = options.sourceTexture || target.texture;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const signature = this.getPuppetMeshSignature(layer, target);
      const textureMagFilter = Number.isFinite(options.textureMagFilter)
        ? options.textureMagFilter
        : this.getViewportTextureMagFilter(camera);

      if (resource.signature !== signature) {
        this.updatePuppetMeshVertices(resource, layer, target);
        gl.bindBuffer(gl.ARRAY_BUFFER, resource.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, resource.vertices);
        resource.signature = signature;
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.activeTexture(gl.TEXTURE0);
      this.setRasterTextureSampling(sourceTexture, gl.LINEAR, textureMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.bindVertexArray(resource.vao);
      gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    rasterizePuppetLayer(layer, options = {}) {
      if (!this.hasPuppetLayerTransform(layer) || !layer?.id) {
        return null;
      }

      const captureAfterSnapshot = options.captureAfterSnapshot !== false;
      let target = this.ensureWritableRasterTarget(layer.id, {
        source: options.source || "puppet-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layer.id);
      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layer.id, {
          emit: false,
          source: options.source || "puppet-rasterize",
        }) || target;
      }

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const preferSparseRestore = wasSparseTarget || target.materializedFromSparse === true;
      const sourceSnapshot = this.createRasterSnapshot(target, null, "puppet-rasterize-before");

      if (!sourceSnapshot?.texture) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const outputRect = this.getPuppetDeformedBounds(layer, target) || targetRect;
      const needsTargetSwap = outputRect && !this.areDocumentRectsEqual(outputRect, targetRect);
      const destinationTarget = needsTargetSwap
        ? this.createRasterTargetForRect(outputRect)
        : target;

      if (
        destinationTarget &&
        destinationTarget !== target &&
        preferSparseRestore
      ) {
        destinationTarget.materializedFromSparse = true;
        destinationTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const gl = this.gl;
      const destinationRect = this.getRasterTargetDocumentRect(destinationTarget) || targetRect;

      gl.bindFramebuffer(gl.FRAMEBUFFER, destinationTarget.framebuffer);
      gl.viewport(0, 0, destinationTarget.width, destinationTarget.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const didDraw = this.drawPuppetLayer(layer, target, 1, {
        camera: { x: -destinationRect.x, y: -destinationRect.y, zoom: 1 },
        sourceTexture: sourceSnapshot.texture,
        viewportHeight: destinationTarget.height,
        viewportWidth: destinationTarget.width,
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      if (!didDraw) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      this.markRasterTargetDirty(destinationTarget);

      const rasterizedSnapshot = captureAfterSnapshot
        ? this.createRasterSnapshot(destinationTarget, null, "puppet-rasterize-after")
        : null;

      if (captureAfterSnapshot && !rasterizedSnapshot?.texture) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      if (needsTargetSwap && !this.replaceRasterTarget(layer.id, destinationTarget, {
        emit: false,
        rect: destinationRect,
        source: options.source || "puppet-rasterize",
      })) {
        this.deleteRasterTargetObject(destinationTarget);
        this.deleteRasterSnapshot(rasterizedSnapshot);
        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const sourceBytes = this.estimateRasterTargetBytes(target);
      const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layer.id, destinationTarget));
      const finalLiveTarget = afterPreferSparse
        ? this.sparsifyRasterTarget(layer.id, destinationTarget, {
            emit: false,
            source: `${options.source || "puppet-rasterize"}-retile`,
            tileSize: destinationTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || destinationTarget
        : destinationTarget;
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);
      const beforeBytes = this.estimateRasterSnapshotBytes(sourceSnapshot);
      const afterBytes = this.estimateRasterSnapshotBytes(rasterizedSnapshot);
      const scratchBytes = needsTargetSwap ? targetBytes : 0;
      const estimatedPeakBytes = sourceBytes + scratchBytes + beforeBytes + afterBytes;
      const coverage = this.getRasterOperationCoverage(destinationRect);

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterSnapshot: rasterizedSnapshot,
        beforeSnapshot: sourceSnapshot,
        coverage,
        estimatedPeakBytes,
        layerId: layer.id,
        operationType: "puppet-rasterize",
        persistentBytes: beforeBytes + afterBytes + (needsTargetSwap ? targetBytes : 0),
        reason: options.source || "puppet-rasterize",
        scratchBytes,
        source: options.source || "puppet-rasterize",
        sourceBytes,
        sourceRect: targetRect,
        targetBytes,
        targetRect: destinationRect,
        tool: "puppet",
      }));

      this.deletePuppetMeshResource(layer.id);

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId: layer.id,
          sourceRect: targetRect,
          source: options.source || "puppet-rasterize",
          targetRect: destinationRect,
          usePreviewDirtyTiles: true,
        });
      }

      return {
        afterPreferSparse,
        afterSnapshot: rasterizedSnapshot,
        beforePreferSparse: preferSparseRestore,
        beforeSnapshot: sourceSnapshot,
        layerId: layer.id,
        memoryPolicy,
        targetRect: destinationRect ? { ...destinationRect } : null,
      };
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;
      this.cancelArtboardResidencyIdleTimer();
      this.layerModel?.removeEventListener?.("change", this.handleLayerModelChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.removeEventListener("cbo:history-change", this.handleHistoryChange);

      this.deleteGaussianBlurResources();
      this.deleteMotionBlurResources();
      this.deleteFieldBlurResources();
      this.deleteRadialBlurResources();
      this.deleteGrainResources();
      this.deleteNoiseResources();
      this.deleteThresholdResources();
      this.deleteCurvesResources();
      this.deleteColorOverlayResources();
      this.deleteLayerStrokeResources();
      this.deleteActiveStrokeScratchTarget();
      this.deleteActiveStrokeSelectionClipTexture();
      this.deleteLayerCompositeResources();
      this.deletePreviewCache();
      this.deletePreviewHqMipmapResources?.();
      this.deleteAllArtboardFlatPreviews("dispose");

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.texturedQuad) {
        gl.deleteBuffer(this.texturedQuad.buffer);
        gl.deleteVertexArray(this.texturedQuad.vao);
        this.texturedQuad = null;
      }

      this.deleteRasterWarpMeshResource();

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }

      if (this.texturedQuadProgramInfo?.program) {
        gl.deleteProgram(this.texturedQuadProgramInfo.program);
        this.texturedQuadProgramInfo = null;
      }

      if (this.puppetProgramInfo?.program) {
        gl.deleteProgram(this.puppetProgramInfo.program);
        this.puppetProgramInfo = null;
      }

      if (this.perspectiveQuadProgramInfo?.program) {
        gl.deleteProgram(this.perspectiveQuadProgramInfo.program);
        this.perspectiveQuadProgramInfo = null;
      }

      if (this.previewHqMipmapProgramInfo?.program) {
        gl.deleteProgram(this.previewHqMipmapProgramInfo.program);
        this.previewHqMipmapProgramInfo = null;
      }

      for (const layerId of Array.from(this.puppetMeshResourcesByLayerId.keys())) {
        this.deletePuppetMeshResource(layerId);
      }

      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => {
        this.deleteRasterTargetObject(target);
      });

      this.rasterTargetsByLayerId.clear();
      this.framebuffer = null;
      this.texture = null;
    }
  }

  const DOCUMENT_RENDERER_INTERNALS = Object.freeze({
    ANDROID_PREVIEW_CACHE_MAX_SIZE,
    ANDROID_PREVIEW_CACHE_OVERSCAN_CSS_PX,
    ANDROID_RENDER_DPR_CAP,
    ANDROID_VIEWPORT_RENDER_OVERSCAN_CSS_PX,
    ARTBOARD_FLAT_PREVIEW_MAX_SIZE,
    ARTBOARD_FRAGMENT_SHADER_SOURCE,
    ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES,
    ARTBOARD_RESIDENCY_IDLE_DELAY_MS,
    ARTBOARD_RESIDENCY_MAINTENANCE_FRAME_DELAY_MS,
    ARTBOARD_RESIDENCY_PREFETCH_CSS_PX,
    ARTBOARD_RESIDENCY_READBACK_CHUNK_BYTES,
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
    HIGH_QUALITY_ANDROID_PREVIEW_CACHE_MAX_SIZE,
    HIGH_QUALITY_ANDROID_RENDER_DPR_CAP,
    HIGH_QUALITY_DESKTOP_RENDER_DPR_CAP,
    HIGH_QUALITY_MOBILE_PREVIEW_CACHE_MAX_SIZE,
    HIGH_QUALITY_MOBILE_RENDER_DPR_CAP,
    HIGH_QUALITY_PREVIEW_CACHE_MAX_SIZE,
    LAYER_STROKE_FRAGMENT_SHADER_SOURCE,
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
    PREVIEW_HQ_MIPMAP_FRAGMENT_SHADER_SOURCE,
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
    COLOR_OVERLAY_FRAGMENT_SHADER_SOURCE,
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
    getHighQualityPreviewCacheMaxSize,
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
  });

  function installDocumentRendererMixin(name) {
    const install = namespace.DocumentRendererMixins?.[name];

    if (typeof install === "function") {
      install(DocumentRenderer, DOCUMENT_RENDERER_INTERNALS);
    }
  }

  [
    "rasterTargets",
    "historySnapshots",
    "webglPrograms",
    "viewportCulling",
    "layerEffects",
    "compositing",
  ].forEach(installDocumentRendererMixin);
  namespace.DocumentRenderer = DocumentRenderer;
})(window.CBO = window.CBO || {});
