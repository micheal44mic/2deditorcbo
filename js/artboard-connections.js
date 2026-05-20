window.CBO = window.CBO || {};

(function registerArtboardConnections(namespace) {
  const Controller = namespace.ArtboardConnectionsController;

  if (!Controller) {
    throw new Error("ArtboardConnectionsController core is not loaded.");
  }

  Controller.prototype.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay(options = {}) {
    with (this) {
    const camera = options.camera || getBrushEngine()?.camera || lastRenderContext.camera;
    const dpr = Math.max(1, Number(options.dpr || getBrushEngine()?.dpr || lastRenderContext.dpr || window.devicePixelRatio || 1));
    const viewScale = Number.isFinite(Number(options.viewScale))
      ? Number(options.viewScale)
      : Math.max(0.0001, Number(camera?.zoom) || 1) / dpr;

    noteAiBoardCameraMotion(camera, dpr);

    lastRenderContext = {
      artboardViews: Array.isArray(options.artboardViews) ? options.artboardViews : [],
      camera: cloneCamera(camera),
      dpr,
      selectedArtboardId: String(options.selectedArtboardId || "").trim(),
      viewScale,
    };
    renderConnectionOverlay();
    }
  };

  Controller.prototype.getArtboardConnections = function getArtboardConnections() {
    with (this) {
    return connections.map((connection) => ({ ...connection }));
    }
  };

  Controller.prototype.getArtboardConnectionBoards = function getArtboardConnectionBoards() {
    with (this) {
    return spaceBoards.map((board) => ({ ...board }));
    }
  };

  Controller.prototype.getArtboardConnectionBoardCollisionRects = function getArtboardConnectionBoardCollisionRects() {
    with (this) {
    return spaceBoards
      .map(getSpaceBoardRect)
      .map(getAiImageBoardFootprintRect)
      .filter(Boolean)
      .map((rect) => ({ ...rect }));
    }
  };

  Controller.prototype.getAiBoardMetrics = function getAiBoardMetrics() {
    with (this) {
    return {
      ...aiBoardMetrics,
      boards: Array.isArray(aiBoardMetrics.boards)
        ? aiBoardMetrics.boards.map((board) => ({ ...board }))
        : [],
      previewDebugEvents: Array.isArray(aiBoardMetrics.previewDebugEvents)
        ? aiBoardMetrics.previewDebugEvents.map((event) => ({ ...event }))
        : [],
    };
    }
  };

  Controller.prototype.clearArtboardConnections = function clearArtboardConnections() {
    with (this) {
    connections = [];
    spaceBoards = [];
    connectionDrag = null;
    spaceBoardDrag = null;
    selectedSpaceBoardId = "";
    lastConnectionsGeometryKey = "";
    aiBoardPreviewDebugEvents = [];
    aiBoardPreviewDebugByBoardId = new Map();
    aiBoardPreviewDebugEventId = 1;
    promptEditState = null;
    captionEditState = null;
    clearPromptFocusViewportTimers();
    clearAiImageGenerationPreview();
    closeAiImageBoardEnlargeViewer();
    closeAiImageBoardEditPreview();
    removeSpaceBoardDragListeners();
    syncAiImageBoardMobileActionToolbar("");
    dismissConnectionMenu({ render: false });
    renderConnectionOverlay();
    }
  };

  Controller.prototype.init = function init() {
    with (this) {
    document.addEventListener("pointerdown", handleDocumentSpaceBoardSelectionPointerDown, true);
    window.addEventListener("cbo:touch-navigation-start", () => {
      cancelSpaceBoardDragForTouchNavigation();
    });
    window.addEventListener("cbo:camera-change", (event) => {
      updateInfiniteCanvasDotGrid(event.detail || getCameraState());
    });
    window.addEventListener("cbo:editor-canvas-ready", (event) => {
      updateInfiniteCanvasDotGrid(event.detail || getCameraState());
    });
    window.addEventListener("resize", () => {
      updateInfiniteCanvasDotGrid();
    });
    updateInfiniteCanvasDotGrid();
    }
  };

  const controller = new Controller(namespace);

  namespace.artboardConnectionsController = controller;
  namespace.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay(options = {}) {
    return controller.renderArtboardConnectionOverlay(options);
  };
  namespace.getArtboardConnections = function getArtboardConnections() {
    return controller.getArtboardConnections();
  };
  namespace.getArtboardConnectionBoards = function getArtboardConnectionBoards() {
    return controller.getArtboardConnectionBoards();
  };
  namespace.getArtboardConnectionBoardCollisionRects = function getArtboardConnectionBoardCollisionRects() {
    return controller.getArtboardConnectionBoardCollisionRects();
  };
  namespace.getAiBoardMetrics = function getAiBoardMetrics() {
    return controller.getAiBoardMetrics();
  };
  namespace.openAiBoardConnectionMenu = function openAiBoardConnectionMenu(options = {}) {
    return controller.openAiBoardConnectionMenu(options);
  };
  namespace.clearArtboardConnections = function clearArtboardConnections() {
    return controller.clearArtboardConnections();
  };

  controller.init();
})(window.CBO);
