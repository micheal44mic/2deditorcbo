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
    return connections.map(cloneConnection);
    }
  };

  Controller.prototype.getArtboardConnectionBoards = function getArtboardConnectionBoards() {
    with (this) {
    return spaceBoards.map(cloneSpaceBoard);
    }
  };

  Controller.prototype.restoreArtboardConnections = function restoreArtboardConnections(state, options = {}) {
    with (this) {
    return restoreArtboardConnectionState(state, options.source || "artboard-connections-restore");
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
    textPromptEditState = null;
    textPromptInlineEditBoardId = "";
    clearPromptFocusViewportTimers();
    if (typeof closeTextPromptFocusMode === "function") {
      closeTextPromptFocusMode({ commit: false });
    }
    if (typeof syncTextPromptToolbar === "function") {
      syncTextPromptToolbar("");
    }
    clearAiImageGenerationPreview();
    closeAiImageBoardEnlargeViewer();
    closeAiImageBoardEditPreview();
    removeSpaceBoardDragListeners();
    syncAiImageBoardMobileActionToolbar("");
    dismissConnectionMenu({ render: false });
    renderConnectionOverlay();
    }
  };

  Controller.prototype.prepareArtboardConnectionsForSave = function prepareArtboardConnectionsForSave(options = {}) {
    with (this) {
    const source = options.source || "artboard-connections-save";
    const active = document.activeElement;

    if (
      active?.matches?.("[data-ai-image-board-prompt-input]") &&
      typeof setAiImageBoardPromptText === "function"
    ) {
      const boardId = String(active.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();
      const board = getSpaceBoardById(boardId);

      if (board) {
        setAiImageBoardPromptText(board, active.value || "", {
          emitSource: source,
        });
      }
    }

    if (
      active?.matches?.("[data-ai-image-board-caption-editor]") &&
      typeof setAiImageBoardPromptText === "function" &&
      typeof getAiImageCaptionEditorText === "function"
    ) {
      const boardId = String(active.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();
      const board = getSpaceBoardById(boardId);

      if (board) {
        setAiImageBoardPromptText(board, getAiImageCaptionEditorText(active), {
          emitSource: source,
        });
      }
    }

    if (
      active?.matches?.("[data-ai-image-edit-preview-prompt-input]") &&
      typeof commitAiImageEditPreviewPromptInput === "function"
    ) {
      commitAiImageEditPreviewPromptInput(active);
    }

    if (typeof commitTextPromptInlineEditing === "function") {
      commitTextPromptInlineEditing({ source });
    }

    if (textPromptFocusBoardId && typeof closeTextPromptFocusMode === "function") {
      closeTextPromptFocusMode({ commit: true });
    }

    return true;
    }
  };

  Controller.prototype.init = function init() {
    with (this) {
    document.addEventListener("pointerdown", handleDocumentSpaceBoardSelectionPointerDown, true);
    window.addEventListener("cbo:touch-navigation-start", () => {
      cancelSpaceBoardDragForTouchNavigation();
    });
    window.addEventListener("cbo:mobile-object-move-change", () => {
      renderSpaceBoards();
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
    window.addEventListener("cbo:artboard-symmetry-change", () => {
      renderActions();
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
  namespace.restoreArtboardConnections = function restoreArtboardConnections(state, options = {}) {
    return controller.restoreArtboardConnections(state, options);
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
  namespace.prepareArtboardConnectionsForSave = function prepareArtboardConnectionsForSave(options = {}) {
    return controller.prepareArtboardConnectionsForSave(options);
  };

  controller.init();

  if (namespace.pendingArtboardConnectionRestore) {
    const pending = namespace.pendingArtboardConnectionRestore;

    namespace.pendingArtboardConnectionRestore = null;
    controller.restoreArtboardConnections(pending.state, {
      source: pending.source || "pending-artboard-connections-restore",
    });
  }
})(window.CBO);
