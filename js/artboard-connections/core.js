window.CBO = window.CBO || {};

(function registerArtboardConnectionsCore(namespace) {
  function ArtboardConnectionsController(namespaceRef) {
    this.namespace = namespaceRef;
      this.ACTION_BUBBLE_SIZE_DOC_PX = 120;
      this.ACTION_BUBBLE_GAP_DOC_PX = 24;
      this.ACTION_BUBBLE_ICON_DOC_PX = 76;
      this.ACTION_BUBBLE_BORDER_DOC_PX = 3;
      this.CONNECTION_MIN_DRAG_CSS_PX = 6;
      this.CONNECTION_CLICK_DISTANCE_CSS_PX = 220;
      this.CONNECTION_ARROW_LENGTH_STROKE_UNITS = 5;
      this.CONNECTION_PLAIN_STROKE_CSS_PX = 1.5;
      this.CONNECTION_PLAIN_GEOMETRY_SCALE = 0.5;
      this.CONNECTION_MENU_GAP_CSS_PX = 14;
      this.CONNECTION_DROP_TARGET_MAGNET_RADIUS_CSS_PX = 44;
      this.CONNECTION_DROP_TARGET_TOUCH_RADIUS_CSS_PX = 104;
      this.CANVAS_DOT_GRID_PATTERN_ID = "cbo-editor-dot-grid-pattern";
      this.CANVAS_DOT_GRID_BASE_WORLD_PX = 20;
      this.CANVAS_DOT_GRID_TARGET_MIN_SCREEN_PX = 16;
      this.CANVAS_DOT_GRID_TARGET_MAX_SCREEN_PX = 32;
      this.CANVAS_DOT_GRID_STEPS_PER_OCTAVE = 5;
      this.CANVAS_DOT_GRID_MIN_OPACITY = 0.8;
      this.CANVAS_DOT_GRID_MAX_OPACITY = 1;
      this.AI_IMAGE_BOARD_SIZE_DOC_PX = 1024;
      this.AI_IMAGE_BOARD_RADIUS_DOC_PX = 38;
      this.AI_IMAGE_BOARD_OUTLINE_DOC_PX = 5;
      this.AI_IMAGE_BOARD_SELECTION_SHADOW_Y_DOC_PX = 34;
      this.AI_IMAGE_BOARD_SELECTION_SHADOW_BLUR_DOC_PX = 86;
      this.AI_IMAGE_BOARD_SELECTION_SHADOW_SECONDARY_Y_DOC_PX = 9;
      this.AI_IMAGE_BOARD_SELECTION_SHADOW_SECONDARY_BLUR_DOC_PX = 26;
      this.AI_IMAGE_BOARD_SELECTION_SHADOW_RISE_DOC_PX = 18;
      this.AI_IMAGE_PROMPT_PLACEHOLDER = "Neon product shot";
      this.AI_IMAGE_PROMPT_INPUT_MIN_HEIGHT_CSS_PX = 84;
      this.AI_IMAGE_BOARD_FOOTER_MIN_HEIGHT_CSS_PX = 210;
      this.AI_IMAGE_CAPTION_PLACEHOLDER = "Write the image you want to generate";
      this.AI_IMAGE_CAPTION_INSET_DOC_PX = 32;
      this.AI_IMAGE_CAPTION_FONT_DOC_PX = 56;
      this.AI_IMAGE_CAPTION_LINE_HEIGHT_DOC_PX = 66;
      this.AI_IMAGE_CAPTION_MIN_HEIGHT_DOC_PX = 74;
      this.AI_IMAGE_CAPTION_PREVIEW_LINES = 2;
      this.AI_IMAGE_CAPTION_PADDING_X_DOC_PX = 6;
      this.AI_IMAGE_CAPTION_PADDING_Y_DOC_PX = 4;
      this.AI_IMAGE_CAPTION_EDITOR_RADIUS_DOC_PX = 6;
      this.AI_IMAGE_CAPTION_FOCUS_RING_DOC_PX = 1;
      this.AI_IMAGE_CAPTION_SHADOW_Y_DOC_PX = 1;
      this.AI_IMAGE_CAPTION_SHADOW_BLUR_DOC_PX = 2;
      this.AI_IMAGE_CAPTION_FOCUS_TOP_GAP_CSS_PX = 16;
      this.AI_IMAGE_CAPTION_FOCUS_BOTTOM_GAP_CSS_PX = 18;
      this.AI_IMAGE_CAPTION_FOCUS_VERTICAL_RATIO = 0.56;
      this.TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX = 920;
      this.TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX = 280;
      this.TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX = 200;
      this.TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX = 120;
      this.TEXT_PROMPT_BOARD_PADDING_DOC_PX = 22;
      this.TEXT_PROMPT_BOARD_RADIUS_DOC_PX = 18;
      this.TEXT_PROMPT_BOARD_OUTLINE_DOC_PX = 5;
      this.TEXT_PROMPT_RESIZE_HANDLE_DOC_PX = 30;
      this.TEXT_PROMPT_RESIZE_LINE_DOC_PX = 8;
      this.TEXT_PROMPT_FONT_SIZE_DOC_PX = 32;
      this.TEXT_PROMPT_FONT_SIZE_MIN_DOC_PX = 10;
      this.TEXT_PROMPT_FONT_SIZE_MAX_DOC_PX = 72;
      this.TEXT_PROMPT_FONT_SIZE_STEP_DOC_PX = 2;
      this.TEXT_PROMPT_TEXT_COLOR = "#15171c";
      this.TEXT_PROMPT_BACKGROUND_COLOR = "#ffffff";
      this.TEXT_PROMPT_DEFAULT_HTML = "<h1>Text Prompt</h1><p>Write your prompt here.</p>";
      this.TEXT_PROMPT_PLACEHOLDER = "Write your prompt here.";
      this.ARTBOARD_LABEL_FONT_RATIO = 0.036;
      this.ARTBOARD_LABEL_HEIGHT_RATIO = 1.35;
      this.ARTBOARD_LABEL_PADDING_X_RATIO = 0.55;
      this.ARTBOARD_LABEL_RADIUS_RATIO = 0.28;
      this.ARTBOARD_LABEL_TOP_GAP_RATIO = 0.32;
      this.AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX = 96;
      this.AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX = 42;
      this.AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX = 24;
      this.AI_IMAGE_GENERATION_PREVIEW_MIN_MS = 3000;
      this.AI_IMAGE_GENERATION_PREVIEW_MAX_MS = 5000;
      this.AI_IMAGE_PREVIEW_VARIANT_SIZES = [128, 256, 512, 1024];
      this.AI_IMAGE_MOBILE_CANVAS_PREVIEW_LOD = 256;
      this.AI_IMAGE_PREVIEW_LOD_THRESHOLDS = [
      { lod: "128", max: 80 },
      { lod: "256", max: 250 },
      { lod: "512", max: 700 },
      { lod: "1024", max: 1400 },
    ];
      this.AI_IMAGE_PREVIEW_LOD_UP_HYSTERESIS = 1.15;
      this.AI_IMAGE_PREVIEW_LOD_DOWN_HYSTERESIS = 0.72;
      this.AI_IMAGE_PREVIEW_CROSSFADE_MS = 0;
      this.AI_IMAGE_PREVIEW_PAINT_FRAMES = 2;
      this.AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES = 2;
      this.AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS = 240;
      this.AI_IMAGE_RUNTIME_PREVIEW_CACHE_MAX_ENTRIES = 80;
      this.AI_IMAGE_RUNTIME_PREVIEW_QUALITY = 0.78;
      this.AI_IMAGE_MOBILE_RUNTIME_PREVIEW_QUALITY = 0.58;
      this.AI_IMAGE_UNSTABLE_RUNTIME_LODS = new Set([512]);
      this.AI_VIDEO_CANVAS_PREVIEW_LOD = 360;
      this.AI_VIDEO_RUNTIME_POSTER_CACHE_MAX_ENTRIES = 32;
      this.AI_VIDEO_PREVIEW_VARIANT_SIZES = [240, 360, 480, 720, 1080];
      this.AI_VIDEO_PREVIEW_LOD_THRESHOLDS = [
      { lod: "240", max: 220 },
      { lod: "360", max: 360 },
      { lod: "480", max: 700 },
      { lod: "720", max: 1200 },
      { lod: "1080", max: 1800 },
    ];
      this.AI_VIDEO_DECODED_FRAME_BUDGET = 3;
      this.AI_BOARD_PREVIEW_DEBUG_EVENT_LIMIT = 180;
      this.AI_IMAGE_SAMPLE_ASSETS = [
      { kind: "image", name: "Badge", src: "assets/ai-board-samples/sample-01-badge.png" },
      { kind: "image", name: "Balenciaga", src: "assets/ai-board-samples/sample-02-balenciaga.png" },
      { kind: "image", name: "Hats", src: "assets/ai-board-samples/sample-03-hats.jpg" },
      { kind: "image", name: "Dragon", src: "assets/ai-board-samples/sample-04-dragon.png" },
      { kind: "image", name: "Green screens", src: "assets/ai-board-samples/sample-05-green-screens.jpeg" },
      { kind: "video", name: "Render 2026-05-18 2", src: "assets/ai-board-samples/sample-06-video-2026-05-18-2.mp4", width: 1080, height: 1920, codec: "avc1.640029" },
      { kind: "video", name: "Render 2026-05-18 1", src: "assets/ai-board-samples/sample-07-video-2026-05-18-1.mp4", width: 1080, height: 1920, codec: "avc1.640029" },
      { kind: "video", name: "Render 2026-05-07 1", src: "assets/ai-board-samples/sample-08-video-2026-05-07-1.mp4", width: 1080, height: 1920, codec: "avc1.640029" },
    ];
      this.SPACE_BOARD_GAP_DOC_PX = 220;
      this.SPACE_BOARD_DRAG_GAP_DOC_PX = 24;
      this.SPACE_BOARD_MOVE_SEARCH_STEPS = 18;
      this.SPACE_BOARD_PANE_TRANSFORM_IDLE_MS = 180;
      this.SPACE_BOARD_LAZY_OVERSCAN_CSS_PX = 640;
      this.SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX = 140;
      this.AI_BOARD_ARTBOARD_PLAIN_MODE = true;
      this.AI_IMAGE_GENERATE_DUPLICATE_GUARD_MS = 650;
      this.AI_IMAGE_ENLARGE_MIN_VIEWPORT_PX = 280;
      this.AI_IMAGE_ENLARGE_MIN_SCALE = 1;
      this.AI_IMAGE_ENLARGE_MAX_SCALE = 6;
      this.AI_IMAGE_ENLARGE_WHEEL_SPEED = 0.0014;
      this.AI_IMAGE_ENLARGE_EDGE_SLACK_RATIO = 0.35;
      this.AI_IMAGE_ENLARGE_EDGE_SLACK_MAX_PX = 360;
      this.AI_IMAGE_ENLARGE_PINCH_MIN_DISTANCE_PX = 24;
      this.AI_IMAGE_EDIT_PREVIEW_PROMPT_PRESETS = [
      { name: "Solar Mist", tone: "solar" },
      { name: "Chrome Pop", tone: "chrome" },
      { name: "Velvet Glow", tone: "velvet" },
      { name: "Pixel Bloom", tone: "pixel" },
      { name: "Frost Line", tone: "frost" },
      { name: "Nova Dust", tone: "nova" },
    ];
      this.SVG_NS = "http://www.w3.org/2000/svg";
      this.connectionDrag = null;
      this.connections = [];
      this.spaceBoards = [];
      this.anchorOverrides = new Map();
      this.connectionDropTargetBoardId = "";
      this.connectionBlockedTargetBoardId = "";
      this.menuState = null;
      this.menuDismissBound = false;
      this.ignoreNextMenuDocumentClick = false;
      this.spaceBoardDrag = null;
      this.spaceBoardDragRenderFrame = 0;
      this.selectedSpaceBoardId = "";
      this.mobileActionToolbar = null;
      this.aiImageEnlargeViewer = null;
      this.aiImageEnlargeState = null;
      this.aiImageEditPreviewViewer = null;
      this.lastConnectionsGeometryKey = "";
      this.spaceBoardPaneTransformIdleTimer = 0;
      this.promptEditState = null;
      this.captionEditState = null;
      this.textPromptEditState = null;
      this.textPromptResize = null;
      this.textPromptInlineEditBoardId = "";
      this.textPromptFocusBoardId = "";
      this.textPromptToolbar = null;
      this.textPromptToolbarBoardId = "";
      this.aiImageEditPreviewPromptSelectionRange = null;
      this.promptFocusViewportTimers = [];
      this.aiImageGeneratingBoardIds = new Set();
      this.aiImageGenerationPreviewTimers = new Map();
      this.aiImageGenerationRuns = new Map();
      this.aiImageGenerationStatusByBoardId = new Map();
      this.aiImageLastGenerateActivation = { at: 0, boardId: "" };
      this.aiImageRuntimePreviewCache = new Map();
      this.aiVideoRuntimePosterCache = new Map();
      this.aiRuntimeLodSkipDebugKeys = new Set();
      this.aiImagePreviewSwapSeed = 1;
      this.aiBoardPreviewDebugEventId = 1;
      this.aiBoardPreviewDebugEvents = [];
      this.aiBoardPreviewDebugByBoardId = new Map();
      this.aiBoardCameraMotionUntil = 0;
      this.aiBoardCameraMotionTimer = 0;
      this.aiBoardLastCameraMotionKey = "";
      this.aiBoardPreviewTraceByBoardId = new Map();
      this.connectionIdSeed = 1;
      this.boardIdSeed = 1;
      this.aiBoardMetrics = this.createEmptyAiBoardMetrics();
      this.lastRenderContext = {
      artboardViews: [],
      camera: { x: 0, y: 0, zoom: 1 },
      dpr: 1,
      selectedArtboardId: "",
      viewScale: 1,
    };
    this.namespace.aiBoardMetrics = this.aiBoardMetrics;
    this.bindControllerMethods();
  }

  ArtboardConnectionsController.prototype.bindControllerMethods = function bindControllerMethods() {
    Object.getOwnPropertyNames(ArtboardConnectionsController.prototype).forEach((name) => {
      if (name === "constructor" || name === "bindControllerMethods") {
        return;
      }

      if (typeof this[name] === "function") {
        this[name] = this[name].bind(this);
      }
    });
  };

  namespace.ArtboardConnectionsController = ArtboardConnectionsController;
})(window.CBO);
