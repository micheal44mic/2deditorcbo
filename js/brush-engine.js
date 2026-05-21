window.CBO = window.CBO || {};

(function registerBrushEngine(namespace) {
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 32;
  const WHEEL_ZOOM_INTENSITY = 0.0015;
  const PINCH_ZOOM_INTENSITY = 0.01;
  const ANDROID_PINCH_ZOOM_STEP_MIN = 0.75;
  const ANDROID_PINCH_ZOOM_STEP_MAX = 1.333;
  const TOUCH_NAVIGATION_STALE_POINTER_MS = 900;
  const CROPPED_BRUSH_STROKES = true;
  const STROKE_ALLOCATION_QUANTUM = 128;
  const STROKE_FINAL_PADDING = 6;
  const STROKE_SAMPLE_CLAMP_MIN_PADDING = 64;
  const STROKE_PREVIEW_DIRTY_TILE_SIZE = 512;
  const STROKE_PREVIEW_DIRTY_MAX_RECTS = 96;
  const STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE = 0.45;
  const STROKE_TARGET_PREWARM_MAX_TILES = 2;
  const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug";
  const ERASER_EMPTY_LAYER_TOAST_MS = 800;
  const ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS = 1600;
  const MAX_STAMPS_PER_FLUSH = 4096;
  const MOBILE_MAX_STAMPS_PER_FLUSH = 1024;
  const ANDROID_MAX_STAMPS_PER_FLUSH = 384;
  const DESKTOP_POINTER_SAMPLES_PER_FRAME = 96;
  const MOBILE_POINTER_SAMPLES_PER_FRAME = 48;
  const ANDROID_POINTER_SAMPLES_PER_FRAME = 24;
  const DESKTOP_POINTER_FRAME_BUDGET_MS = 7;
  const MOBILE_POINTER_FRAME_BUDGET_MS = 4;
  const ANDROID_POINTER_FRAME_BUDGET_MS = 2.5;
  const POINTER_SAMPLE_BACKLOG_MULTIPLIER = 2;
  const DESKTOP_STROKE_SEGMENT_MIN_SAMPLES = 8;
  const MOBILE_STROKE_SEGMENT_MIN_SAMPLES = 4;
  const ANDROID_STROKE_SEGMENT_MIN_SAMPLES = 2;
  const ANDROID_STROKE_SEGMENT_MAX_SAMPLES = 48;
  const ANDROID_STROKE_SEGMENT_DISTANCE_STEP = 6;
  const ANDROID_STROKE_ALLOCATION_QUANTUM = 256;
  const BRUSH_HISTORY_BATCH_IDLE_MS = 300;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const STROKE_MEMORY_POLICY = Object.freeze({
    normalMaxBytes: 5 * RASTER_MIB,
    mediumMaxBytes: 32 * RASTER_MIB,
    largeMaxBytes: 128 * RASTER_MIB,
    largeCoverage: 0.25,
    hugeCoverage: 0.35,
  });
  const STROKE_SCRATCH_SOFT_EVICT_BYTES = 96 * RASTER_MIB;
  const STROKE_SCRATCH_HARD_WARN_BYTES = 128 * RASTER_MIB;
  const STROKE_SCRATCH_TOP_RESOURCE_LIMIT = 8;
  const STROKE_INCREMENTAL_BAKE_ENABLED = true;
  const STROKE_INCREMENTAL_BAKE_COVERAGE = 0.25;
  const STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP = 0.999;
  const VELOCITY_PRESSURE_MAX_SPEED = 5;
  const VELOCITY_PRESSURE_SMOOTHING = 0.02;
  const RENDERING_MODE_PRESETS = Object.freeze({
    "light-glaze": { strokeBuildUp: 0 },
    "uniform-glaze": { strokeBuildUp: 0.15 },
    "intense-glaze": { strokeBuildUp: 0.35 },
    "heavy-glaze": { strokeBuildUp: 0.6 },
    "uniform-blending": { strokeBuildUp: 0.8 },
    "intense-blending": { strokeBuildUp: 1 },
  });
  const STROKE_BUILDUP_EPSILON = 0.001;
  const STROKE_RENDER_MODE_PLATEAU = "plateau";
  const STROKE_RENDER_MODE_ACCUM = "accum";
  const STROKE_RENDER_MODE_MIXED = "mixed";
  const COLOR_GOLDEN_RATIO = 0.618033988749895;
  const QUICK_LINE_HOLD_DELAY_MS = 520;
  const QUICK_LINE_MIN_SCREEN_DISTANCE = 24;
  const QUICK_LINE_MAX_PATH_RATIO = 1.22;
  const QUICK_LINE_DEVIATION_SCREEN_FRACTION = 0.075;
  const QUICK_LINE_MIN_SCREEN_DEVIATION = 7;
  const QUICK_LINE_MAX_SCREEN_DEVIATION = 28;
  const QUICK_LINE_MAX_SOURCE_SAMPLES = 96;
  const QUICK_SHAPE_PREVIEW_MIN_INTERVAL_MS = 34;
  const QUICK_SHAPE_PREVIEW_MAX_INTERVAL_MS = 96;
  const QUICK_CIRCLE_MIN_SCREEN_DIAMETER = 32;
  const QUICK_CIRCLE_MAX_ASPECT_RATIO = 1.75;
  const QUICK_CIRCLE_MAX_CLOSE_GAP_FRACTION = 1.05;
  const QUICK_CIRCLE_MIN_PATH_RATIO = 0.45;
  const QUICK_CIRCLE_MAX_PATH_RATIO = 2.15;
  const QUICK_CIRCLE_MAX_RADIAL_DEVIATION_FRACTION = 0.72;
  const QUICK_CIRCLE_MAX_AVERAGE_DEVIATION_FRACTION = 0.36;
  const QUICK_CIRCLE_MIN_SYNTHETIC_SAMPLES = 36;
  const QUICK_CIRCLE_MAX_SYNTHETIC_SAMPLES = 64;
  const QUICK_CIRCLE_SNAP_ASPECT_RATIO = 1.18;
  const QUICK_ELLIPSE_MAX_ASPECT_RATIO = 10;

  class BrushEngine {
    constructor(canvas, options = {}) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("BrushEngine richiede un HTMLCanvasElement.");
      }

      this.canvas = canvas;
      this.options = {
        getSettings: typeof options.getSettings === "function" ? options.getSettings : null,
        transparentBackground: options.transparentBackground === true,
        singleStrokeMode: options.singleStrokeMode === true,
        disableNavigation: options.disableNavigation === true,
        disableInput: options.disableInput === true,
        isolateDocumentArtboards: options.isolateDocumentArtboards === true,
        suppressCameraEvents: options.suppressCameraEvents === true,
        manualRender: options.manualRender === true,
        enableHistory: options.enableHistory === true
          ? true
          : options.enableHistory === false
            ? false
            : !options.getSettings && options.disableInput !== true,
        historyBatchIdleMs: Number.isFinite(options.historyBatchIdleMs) && options.historyBatchIdleMs >= 0
          ? Math.floor(options.historyBatchIdleMs)
          : BRUSH_HISTORY_BATCH_IDLE_MS,
        enableIncrementalStrokeBake: options.enableIncrementalStrokeBake === false
          ? false
          : STROKE_INCREMENTAL_BAKE_ENABLED,
        experimentalIncrementalStrokeBakeUnsafe: options.experimentalIncrementalStrokeBakeUnsafe === true,
        respectActiveTool: options.respectActiveTool === true
          ? true
          : options.respectActiveTool === false
            ? false
            : !options.getSettings,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
      };
      this.gl = options.gl;

      if (!this.gl) {
        throw new Error("BrushEngine richiede un contesto WebGL2 gia' inizializzato.");
      }

      if (this.gl.canvas !== canvas) {
        throw new Error("Il contesto WebGL2 passato a BrushEngine deve appartenere al canvas del brush.");
      }

      if (!options.documentRenderer?.getPaintTarget) {
        throw new Error("BrushEngine richiede un DocumentRenderer gia' inizializzato.");
      }

      this.camera = { x: 0, y: 0, zoom: 1 };
      this.stage = canvas.closest(".editor-stage") || canvas.parentElement || canvas;
      this.dpr = 1;
      this.viewportWidth = 1;
      this.viewportHeight = 1;
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
      this.lastStrokeTangent = null;
      this.strokeDynamicsState = null;
      this.strokeRandomState = { seed: 1 };
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeGrainRandomState = null;
      this.velocityPressureState = null;
      this.adaptiveSpacingState = null;
      this.activeStrokeSpacingMultiplier = 1;
      this.strokeInitialSeed = 1;
      this.strokeShapeRotation = 0;
      this.strokeGrainOffset = { x: 0, y: 0 };
      this.strokeChargeRadius = null;
      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
      this.recordedStroke = [];
      this.lastRecordedStroke = [];
      this.replayStrokeCache = null;
      this.pendingPointerSamples = [];
      this.quickLineHoldTimer = 0;
      this.quickLineState = null;
      this.quickShapePreviewFrame = 0;
      this.quickShapePreviewTimer = 0;
      this.quickShapePendingSample = null;
      this.quickShapeLastPreviewAt = 0;
      this.quickShapeLastPreviewDurationMs = 0;
      this.activeTouchPointers = new Map();
      this.touchNavigationGesture = null;
      this.touchNavigationExclusive = false;
      this.touchNavigationLastActivityAt = 0;
      this.isDrawing = false;
      this.activePointerId = null;
      this.isPanning = false;
      this.activePanPointerId = null;
      this.panCaptureElement = null;
      this.panLastViewportX = 0;
      this.panLastViewportY = 0;
      this.isSpaceHeld = false;
      this.userManipulatedCamera = false;
      this.frameRequest = 0;
      this.lastCameraChangeDetail = null;
      this.resizeObserver = null;
      this.isDisposed = false;
      this.isBrushToolActive = this.getInitialBrushToolActive();
      this.activeStrokeTool = this.activeStrokeTool || (this.isBrushToolActive ? "brush" : "");
      this.currentStrokeTool = "brush";
      this.strokeTargetLayerId = null;
      this.activeStrokeSymmetry = null;
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.activeStrokeDirtyDebugFrame = 0;
      this.activeStrokeTargetPrewarmFrame = 0;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.documentRenderer = options.documentRenderer;
      this.strokeTexture = null;
      this.strokeFBO = null;
      this.strokeRenderMode = null;
      this.brushSimpleProgramInfo = null;
      this.strokePlateauTexture = null;
      this.strokePlateauFBO = null;
      this.strokeAccumTexture = null;
      this.strokeAccumFBO = null;
      this.strokeBufferRect = null;
      this.strokeTargetAllocationCount = 0;
      this.strokeTargetReplaceCount = 0;
      this.strokeTargetReallocationCount = 0;
      this.strokeTargetPeakScratchBytes = 0;
      this.strokeTargetPeakCoverage = 0;
      this.strokeTargetLastAllocationRect = null;
      this.largeBlendLivePreviewUsed = false;
      this.largeBlendFinalQualityReplay = false;
      this.lastLargeBlendFinalQualityReplay = null;
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
      this.lastStrokeMemoryReport = null;
      this.pendingBrushHistory = null;
      this.pendingBrushHistoryTimer = 0;
      this.pendingEraserImageRasterizeCancel = null;
      this.pendingEraserImageRasterizeHandle = 0;
      this.pendingEraserImageRasterizeLayerId = "";
      this.isFlushingBrushHistory = false;
      this.emptyEraserLayerToastTimer = 0;
      this.lastEmptyEraserLayerToastAt = 0;
      this.brushProgramInfo = null;
      this.compositeProgramInfo = null;
      this.strokeBuildupProgramInfo = null;
      this.brush = null;
      this.shapeTexture = null;
      this.shapeTextureSource = "";
      this.shapeTextureReady = false;
      this.shapeTextureRequestId = 0;
      this.grainTexture = null;
      this.grainTextureSource = "";
      this.grainTextureReady = false;
      this.grainTextureRequestId = 0;
      this.grainImageWidth = 1;
      this.grainImageHeight = 1;
      this.stampInstanceData = null;
      this.stampInstanceCapacity = 0;
      this.brushInstanceVboCapacityBytes = 0;
      this.grainRotationMatrixData = new Float32Array(4);
      this.fullscreenQuad = null;

      this.handleResize = this.handleResize.bind(this);
      this.handleBrushSettingsChange = this.handleBrushSettingsChange.bind(this);
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleBeforeHistoryAction = this.handleBeforeHistoryAction.bind(this);
      this.handleBeforeRasterHistoryCapture = this.handleBeforeRasterHistoryCapture.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleNavigationPointerDown = this.handleNavigationPointerDown.bind(this);
      this.handleNavigationPointerMove = this.handleNavigationPointerMove.bind(this);
      this.handleNavigationPointerUp = this.handleNavigationPointerUp.bind(this);
      this.handleNavigationPointerCancel = this.handleNavigationPointerCancel.bind(this);
      this.handleWindowTouchNavigationPointerRelease = this.handleWindowTouchNavigationPointerRelease.bind(this);
      this.handleWindowTouchNavigationEnd = this.handleWindowTouchNavigationEnd.bind(this);
      this.handleAuxClick = this.handleAuxClick.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleKeyUp = this.handleKeyUp.bind(this);
      this.handleWindowBlur = this.handleWindowBlur.bind(this);
      this.renderLoop = this.renderLoop.bind(this);

      // Misuriamo prima il viewport: serve a calcolare il documento con il giusto aspect ratio.
      this.resizeViewport();
      this.brushProgramInfo = this.createBrushProgramInfo();
      this.brushSimpleProgramInfo = this.createSimpleBrushProgramInfo();
      this.compositeProgramInfo = this.createCompositeProgramInfo();
      this.strokeBuildupProgramInfo = this.createStrokeBuildupProgramInfo();
      this.fullscreenQuad = this.createFullscreenQuad();
      this.configureGlState();
      this.brush = this.createBrushResources();
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
      this.centerCamera();
      this.observeViewportSize();
      this.bindBrushSettings();
      this.bindToolState();
      this.bindDocumentEvents();
      if (!this.options.disableInput) {
        this.bindPointerEvents();
        this.bindNavigationEvents();
      }
      if (!this.options.manualRender) {
        this.requestDraw();
      }
    }


  }
  const BRUSH_ENGINE_INTERNALS = Object.freeze({
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
    QUICK_LINE_HOLD_DELAY_MS,
    QUICK_LINE_MIN_SCREEN_DISTANCE,
    QUICK_LINE_MAX_PATH_RATIO,
    QUICK_LINE_DEVIATION_SCREEN_FRACTION,
    QUICK_LINE_MIN_SCREEN_DEVIATION,
    QUICK_LINE_MAX_SCREEN_DEVIATION,
    QUICK_LINE_MAX_SOURCE_SAMPLES,
    QUICK_SHAPE_PREVIEW_MIN_INTERVAL_MS,
    QUICK_SHAPE_PREVIEW_MAX_INTERVAL_MS,
    QUICK_CIRCLE_MIN_SCREEN_DIAMETER,
    QUICK_CIRCLE_MAX_ASPECT_RATIO,
    QUICK_CIRCLE_MAX_CLOSE_GAP_FRACTION,
    QUICK_CIRCLE_MIN_PATH_RATIO,
    QUICK_CIRCLE_MAX_PATH_RATIO,
    QUICK_CIRCLE_MAX_RADIAL_DEVIATION_FRACTION,
    QUICK_CIRCLE_MAX_AVERAGE_DEVIATION_FRACTION,
    QUICK_CIRCLE_MIN_SYNTHETIC_SAMPLES,
    QUICK_CIRCLE_MAX_SYNTHETIC_SAMPLES,
    QUICK_CIRCLE_SNAP_ASPECT_RATIO,
    QUICK_ELLIPSE_MAX_ASPECT_RATIO,
  });

  function installBrushEngineMixin(name) {
    const install = namespace.BrushEngineMixins?.[name];

    if (typeof install === "function") {
      install(BrushEngine, BRUSH_ENGINE_INTERNALS);
    }
  }

  [
    "shaderGrain",
    "targetGpu",
    "history",
    "sampler",
    "strokeInput",
  ].forEach(installBrushEngineMixin);

  namespace.BrushEngine = BrushEngine;
})(window.CBO);
