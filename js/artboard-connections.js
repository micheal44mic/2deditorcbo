window.CBO = window.CBO || {};

(function registerArtboardConnections(namespace) {
  const ACTION_BUBBLE_SIZE_DOC_PX = 120;
  const ACTION_BUBBLE_GAP_DOC_PX = 24;
  const ACTION_BUBBLE_ICON_DOC_PX = 76;
  const CONNECTION_MIN_DRAG_CSS_PX = 6;
  const CONNECTION_CLICK_DISTANCE_CSS_PX = 220;
  const CONNECTION_ARROW_LENGTH_STROKE_UNITS = 5;
  const CONNECTION_MENU_GAP_CSS_PX = 14;
  const AI_IMAGE_BOARD_SIZE_DOC_PX = 1024;
  const AI_IMAGE_BOARD_RADIUS_DOC_PX = 38;
  const AI_IMAGE_PROMPT_PLACEHOLDER = "Neon product shot";
  const AI_IMAGE_PROMPT_INPUT_MIN_HEIGHT_CSS_PX = 84;
  const AI_IMAGE_BOARD_FOOTER_MIN_HEIGHT_CSS_PX = 210;
  const AI_IMAGE_INPUT_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX;
  const AI_IMAGE_INPUT_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX;
  const AI_IMAGE_GENERATE_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX;
  const AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX;
  const AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX = 96;
  const AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX = 42;
  const AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX = 24;
  const AI_IMAGE_GENERATION_PREVIEW_MS = 3000;
  const SPACE_BOARD_GAP_DOC_PX = 220;
  const SPACE_BOARD_DRAG_GAP_DOC_PX = 24;
  const SPACE_BOARD_MOVE_SEARCH_STEPS = 18;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let connectionDrag = null;
  let connections = [];
  let spaceBoards = [];
  let anchorOverrides = new Map();
  let menuState = null;
  let menuDismissBound = false;
  let ignoreNextMenuDocumentClick = false;
  let spaceBoardDrag = null;
  let promptEditState = null;
  let promptFocusViewportTimers = [];
  let aiImageGeneratingBoardIds = new Set();
  let aiImageGenerationPreviewTimers = new Map();
  let connectionIdSeed = 1;
  let boardIdSeed = 1;
  let lastRenderContext = {
    artboardViews: [],
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    selectedArtboardId: "",
    viewScale: 1,
  };

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function cloneCamera(camera) {
    return {
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      zoom: Math.max(0.0001, Number(camera?.zoom) || 1),
    };
  }

  function getCameraState() {
    const brushEngine = getBrushEngine();
    const camera = lastRenderContext.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera: cloneCamera(camera),
      dpr: Math.max(1, Number(lastRenderContext.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
  }

  function getAllArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    if (Array.isArray(artboards) && artboards.length > 0) {
      return artboards;
    }

    return lastRenderContext.artboardViews.map((view) => view.artboard).filter(Boolean);
  }

  function getArtboardById(artboardId) {
    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
  }

  function createRect(x, y, width, height) {
    return {
      height: Math.max(1, Number(height) || 1),
      width: Math.max(1, Number(width) || 1),
      x: Number(x) || 0,
      y: Number(y) || 0,
    };
  }

  function expandRect(rect, amount = 0) {
    const safeAmount = Math.max(0, Number(amount) || 0);

    return rect
      ? {
          height: rect.height + safeAmount * 2,
          width: rect.width + safeAmount * 2,
          x: rect.x - safeAmount,
          y: rect.y - safeAmount,
        }
      : null;
  }

  function rectsOverlap(first, second) {
    return Boolean(
      first &&
      second &&
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y
    );
  }

  function doesRectOverlapAny(rect, blockers = []) {
    return blockers.some((blocker) => rectsOverlap(rect, blocker));
  }

  function offsetRect(rect, dx = 0, dy = 0) {
    return rect
      ? createRect(
          rect.x + (Number(dx) || 0),
          rect.y + (Number(dy) || 0),
          rect.width,
          rect.height,
        )
      : null;
  }

  function getRectOverlapArea(first, second) {
    if (!first || !second) {
      return 0;
    }

    const width = Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
    );
    const height = Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
    );

    return width * height;
  }

  function getRectOverlapScore(rect, blockers = []) {
    return blockers.reduce((score, blocker) => score + getRectOverlapArea(rect, blocker), 0);
  }

  function getViewScale() {
    const { camera, dpr } = getCameraState();

    return Math.max(0.0001, Number(camera.zoom) || 1) / dpr;
  }

  function getConnectionStrokeWidth(viewScale = getViewScale()) {
    return Math.max(0.5, 3 * (Number(viewScale) || 1));
  }

  function getActionBubbleMetrics(scale = getViewScale()) {
    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const size = ACTION_BUBBLE_SIZE_DOC_PX * safeScale;
    const gap = ACTION_BUBBLE_GAP_DOC_PX * safeScale;
    const iconSize = ACTION_BUBBLE_ICON_DOC_PX * safeScale;
    const borderWidth = 3 * safeScale;

    return {
      borderWidth,
      borderWidthDoc: 3,
      gap,
      gapDoc: ACTION_BUBBLE_GAP_DOC_PX,
      iconSize,
      iconSizeDoc: ACTION_BUBBLE_ICON_DOC_PX,
      size,
      sizeDoc: ACTION_BUBBLE_SIZE_DOC_PX,
      visualScale: safeScale,
    };
  }

  function documentPointToStagePoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(camera.x) || 0) + (Number(point?.x) || 0) * zoom) / dpr,
      y: ((Number(camera.y) || 0) + (Number(point?.y) || 0) * zoom) / dpr,
    };
  }

  function stagePointToDocumentPoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(point?.x) || 0) * dpr - (Number(camera.x) || 0)) / zoom,
      y: ((Number(point?.y) || 0) * dpr - (Number(camera.y) || 0)) / zoom,
    };
  }

  function getEventDocumentPoint(event) {
    const brushEngine = getBrushEngine();

    if (brushEngine?.screenToDocumentSpace) {
      return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
    }

    const stage = getStage();

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const viewportX = (event.clientX - rect.left) * dpr;
    const viewportY = (event.clientY - rect.top) * dpr;

    return {
      docX: (viewportX - (Number(camera.x) || 0)) / zoom,
      docY: (viewportY - (Number(camera.y) || 0)) / zoom,
    };
  }

  function ensureActionBubble(artboardId) {
    const stage = getStage();
    const normalizedArtboardId = String(artboardId || "").trim();

    if (!stage || !getRenderer() || !normalizedArtboardId) {
      return null;
    }

    let bubble = Array.from(stage.querySelectorAll("[data-artboard-action-bubble]"))
      .find((element) => element.dataset.artboardId === normalizedArtboardId) || null;

    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "editor-artboard-action-bubble";
      bubble.dataset.artboardActionBubble = "";
      bubble.dataset.artboardId = normalizedArtboardId;
      bubble.setAttribute("aria-hidden", "true");
      bubble.addEventListener("pointerenter", () => {
        bubble.classList.add("is-hovered");
      });
      bubble.addEventListener("pointerleave", () => {
        bubble.classList.remove("is-hovered");
      });
      bubble.addEventListener("pointerdown", startConnectionDrag);
      bubble.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
          <circle cx="9" cy="9" r="2"></circle>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
        </svg>
      `;
      stage.appendChild(bubble);
    }

    bubble.dataset.artboardId = normalizedArtboardId;
    return bubble;
  }

  function ensureSpaceBoardLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-space-board-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-space-board-layer";
      layer.dataset.artboardSpaceBoardLayer = "";
      stage.appendChild(layer);
    }

    return layer;
  }

  function ensureAiImageBoardElement(boardId) {
    const layer = ensureSpaceBoardLayer();
    const normalizedBoardId = String(boardId || "").trim();

    if (!layer || !normalizedBoardId) {
      return null;
    }

    let board = Array.from(layer.querySelectorAll("[data-ai-image-board]"))
      .find((element) => element.dataset.boardId === normalizedBoardId) || null;

    if (!board) {
      board = document.createElement("div");
      board.className = "editor-ai-image-board";
      board.dataset.aiImageBoard = "";
      board.dataset.boardId = normalizedBoardId;
      board.innerHTML = `
        <div class="editor-ai-image-board-label" data-ai-image-board-drag-handle></div>
        <div class="editor-ai-image-board-surface"></div>
        <div class="editor-ai-image-board-loading" aria-hidden="true">
          <div class="editor-ai-image-board-loading-halo"></div>
          <div class="editor-ai-image-board-loading-text">Your image is being generated...</div>
        </div>
        <div class="editor-ai-image-board-prompt-title" aria-hidden="true">What image do you want to generate?</div>
        <div class="editor-ai-image-board-footer" data-ai-image-board-footer>
          <textarea class="editor-ai-image-board-prompt-input" data-ai-image-board-prompt-input aria-label="AI image prompt" placeholder="${AI_IMAGE_PROMPT_PLACEHOLDER}" spellcheck="true"></textarea>
        </div>
        <div class="editor-ai-image-board-input" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
        </div>
        <button class="editor-ai-image-board-generate" type="button" aria-label="Generate image" data-ai-image-board-generate>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>
          </svg>
        </button>
      `;
      board.querySelector("[data-ai-image-board-drag-handle]")?.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelector("[data-ai-image-board-footer]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      board.querySelector("[data-ai-image-board-footer]")?.addEventListener("click", stopSpaceBoardControlEvent);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("click", handleAiImageGenerateClick);
      board.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("focus", handleAiImagePromptFocus);
      board.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("input", handleAiImagePromptInput);
      board.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("blur", handleAiImagePromptBlur);
      board.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("keydown", stopSpaceBoardControlEvent);
      board.addEventListener("wheel", handleSpaceBoardWheel, { passive: false });
      layer.appendChild(board);
    }

    board.dataset.boardId = normalizedBoardId;
    return board;
  }

  function ensureConnectionLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let svg = stage.querySelector("[data-artboard-connection-layer]");

    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("editor-artboard-connection-layer");
      svg.dataset.artboardConnectionLayer = "";
    }

    if (stage.firstElementChild !== svg) {
      stage.insertBefore(svg, stage.firstElementChild || null);
    }

    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, rect.width || stage.clientWidth || 1);
    const height = Math.max(1, rect.height || stage.clientHeight || 1);

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    return svg;
  }

  function ensureConnectionMenu() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let menu = stage.querySelector("[data-artboard-connection-menu]");

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "editor-artboard-connection-menu";
      menu.dataset.artboardConnectionMenu = "";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-hidden", "true");
      menu.innerHTML = `
        <div class="editor-artboard-connection-menu-header">
          <div class="editor-artboard-connection-menu-title">Add...</div>
          <button class="editor-artboard-connection-menu-close" type="button" aria-label="Close connection menu" data-artboard-connection-dismiss>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-image">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
          <span>AI Image board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-video">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m22 8-6 4 6 4V8Z"></path>
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
          </svg>
          <span>AI Video board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="mockup">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 1.2.8L6 9.5V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5l1.94.46a1 1 0 0 0 1.2-.8l.58-3.47a2 2 0 0 0-1.34-2.23Z"></path>
          </svg>
          <span>Mockup</span>
        </button>
      `;
      menu.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      menu.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.target?.closest?.("[data-artboard-connection-dismiss]")) {
          dismissConnectionMenu();
          return;
        }

        const action = event.target?.closest?.("[data-artboard-connection-action]")?.dataset?.artboardConnectionAction;

        if (action === "ai-image") {
          materializeAiImageBoardFromMenu();
        }
      });
      stage.appendChild(menu);
    }

    return menu;
  }

  function getActionAnchorPoint(artboard) {
    if (!artboard) {
      return null;
    }

    const artboardId = String(artboard.id || "").trim();
    const override = artboardId ? anchorOverrides.get(artboardId) : null;

    if (override) {
      return override;
    }

    return {
      x: (Number(artboard.x) || 0) +
        (Number(artboard.width) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX,
      y: (Number(artboard.y) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX * 0.5,
    };
  }

  function getSpaceBoardById(boardId) {
    const normalizedId = String(boardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return spaceBoards.find((board) => board.id === normalizedId) || null;
  }

  function getSpaceBoardRect(board) {
    return board
      ? createRect(board.x, board.y, board.width || AI_IMAGE_BOARD_SIZE_DOC_PX, board.height || AI_IMAGE_BOARD_SIZE_DOC_PX)
      : null;
  }

  function cloneConnection(connection) {
    return {
      ...connection,
    };
  }

  function cloneSpaceBoard(board) {
    return {
      ...board,
    };
  }

  function captureConnectionsHistoryState(options = {}) {
    const excludeConnectionIds = new Set(
      Array.isArray(options.excludeConnectionIds)
        ? options.excludeConnectionIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    return {
      connections: connections
        .filter((connection) => !excludeConnectionIds.has(String(connection?.id || "").trim()))
        .map(cloneConnection),
      spaceBoards: spaceBoards.map(cloneSpaceBoard),
    };
  }

  function restoreConnectionsHistoryState(state, source = "history-artboard-connections") {
    removeSpaceBoardDragListeners();
    connections = Array.isArray(state?.connections)
      ? state.connections.map(cloneConnection)
      : [];
    spaceBoards = Array.isArray(state?.spaceBoards)
      ? state.spaceBoards.map(cloneSpaceBoard)
      : [];
    connectionDrag = null;
    spaceBoardDrag = null;
    menuState = null;
    unbindMenuDismiss();
    renderConnectionOverlay();
    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));

    return true;
  }

  function statesAreEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  function pushConnectionsHistoryEntry(beforeState, afterState, options = {}) {
    const history = namespace.documentHistory;

    if (
      !beforeState ||
      !afterState ||
      statesAreEqual(beforeState, afterState) ||
      history?.canRecord?.(options) !== true ||
      typeof history.push !== "function"
    ) {
      return false;
    }

    const before = {
      connections: beforeState.connections.map(cloneConnection),
      spaceBoards: beforeState.spaceBoards.map(cloneSpaceBoard),
    };
    const after = {
      connections: afterState.connections.map(cloneConnection),
      spaceBoards: afterState.spaceBoards.map(cloneSpaceBoard),
    };

    return history.push({
      after,
      before,
      historyGroup: options.historyGroup || "",
      source: options.source || "artboard-connections",
      type: options.type || "artboard-connections-state",
      undo() {
        return restoreConnectionsHistoryState(this.before, `history-undo-${this.source}`);
      },
      redo() {
        return restoreConnectionsHistoryState(this.after, `history-redo-${this.source}`);
      },
      mergeWith() {
        return false;
      },
      destroy() {},
    }, options);
  }

  function emitConnectionsChange(source = "artboard-connections") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));
  }

  function stopSpaceBoardControlEvent(event) {
    event.stopPropagation();
  }

  function handleSpaceBoardWheel(event) {
    const brushEngine = getBrushEngine();

    if (!brushEngine?.handleWheel) {
      return;
    }

    event.stopPropagation();
    brushEngine.handleWheel.call(brushEngine, event);
  }

  function handleAiImageGenerateClick(event) {
    const board = getBoardFromControlEvent(event);

    event.preventDefault();
    event.stopPropagation();

    if (!board) {
      return;
    }

    startAiImageGenerationPreview(board.id);

    window.dispatchEvent(new CustomEvent("cbo:ai-image-board-generate-click", {
      detail: {
        board: cloneSpaceBoard(board),
        source: "artboard-connections",
      },
    }));
  }

  function getBoardFromControlEvent(event) {
    const boardId = String(event.currentTarget?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    return getSpaceBoardById(boardId);
  }

  function startAiImageGenerationPreview(boardId) {
    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return false;
    }

    if (aiImageGenerationPreviewTimers.has(normalizedBoardId)) {
      window.clearTimeout(aiImageGenerationPreviewTimers.get(normalizedBoardId));
    }

    aiImageGeneratingBoardIds.add(normalizedBoardId);
    renderSpaceBoards();

    const timerId = window.setTimeout(() => {
      aiImageGenerationPreviewTimers.delete(normalizedBoardId);
      aiImageGeneratingBoardIds.delete(normalizedBoardId);
      renderSpaceBoards();
    }, AI_IMAGE_GENERATION_PREVIEW_MS);

    aiImageGenerationPreviewTimers.set(normalizedBoardId, timerId);

    return true;
  }

  function clearAiImageGenerationPreview(boardId = "") {
    const normalizedBoardId = String(boardId || "").trim();

    if (normalizedBoardId) {
      if (aiImageGenerationPreviewTimers.has(normalizedBoardId)) {
        window.clearTimeout(aiImageGenerationPreviewTimers.get(normalizedBoardId));
      }

      aiImageGenerationPreviewTimers.delete(normalizedBoardId);
      aiImageGeneratingBoardIds.delete(normalizedBoardId);
      return;
    }

    aiImageGenerationPreviewTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    aiImageGenerationPreviewTimers = new Map();
    aiImageGeneratingBoardIds = new Set();
  }

  function handleAiImagePromptFocus(event) {
    const board = getBoardFromControlEvent(event);
    const input = event.currentTarget;

    if (input) {
      input.placeholder = "";
      resizeAiImagePromptInput(input);
    }

    if (!board) {
      return;
    }

    scheduleAiImagePromptFocusViewport(board.id);

    promptEditState = {
      beforeState: captureConnectionsHistoryState(),
      boardId: board.id,
      value: String(board.promptText || ""),
    };
  }

  function handleAiImagePromptInput(event) {
    const board = getBoardFromControlEvent(event);

    if (!board) {
      return;
    }

    board.promptText = String(event.currentTarget?.value || "");
    resizeAiImagePromptInput(event.currentTarget);
    emitConnectionsChange("space-board-prompt-input");
  }

  function handleAiImagePromptBlur(event) {
    const board = getBoardFromControlEvent(event);
    const editState = promptEditState;
    const input = event.currentTarget;

    promptEditState = null;

    if (input) {
      input.placeholder = AI_IMAGE_PROMPT_PLACEHOLDER;
      resizeAiImagePromptInput(input);
    }

    if (!board || !editState || editState.boardId !== board.id) {
      return;
    }

    const nextValue = String(event.currentTarget?.value || "");

    if (nextValue === editState.value) {
      return;
    }

    pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-prompt-${board.id}`,
      source: "space-board-prompt-input",
      type: "space-board-prompt",
    });
  }

  function isMobilePromptFocusViewport() {
    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900 ||
      document.documentElement?.classList.contains("cbo-visual-keyboard-active")
    );
  }

  function clearPromptFocusViewportTimers() {
    promptFocusViewportTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    promptFocusViewportTimers = [];
  }

  function scheduleAiImagePromptFocusViewport(boardId) {
    if (!isMobilePromptFocusViewport()) {
      return;
    }

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return;
    }

    clearPromptFocusViewportTimers();
    focusAiImagePromptBoard(normalizedBoardId);
    [80, 260, 520].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        focusAiImagePromptBoard(normalizedBoardId);
        window.scrollTo?.(0, 0);
      }, delay);

      promptFocusViewportTimers.push(timerId);
    });
  }

  function focusAiImagePromptBoard(boardId) {
    const board = getSpaceBoardById(boardId);
    const brushEngine = getBrushEngine();
    const stage = getStage();

    if (!board || !brushEngine?.camera || !stage) {
      return false;
    }

    const dpr = Math.max(0.0001, Number(brushEngine.dpr || lastRenderContext.dpr || window.devicePixelRatio || 1));
    const zoom = Math.max(0.0001, Number(brushEngine.camera.zoom) || 1);
    const stageRect = stage.getBoundingClientRect();
    const viewportWidthCss = Math.max(1, stage.clientWidth || stageRect.width || 1);
    const viewportHeightCss = Math.max(
      1,
      Math.min(
        stage.clientHeight || stageRect.height || 1,
        window.visualViewport?.height || stage.clientHeight || stageRect.height || 1,
      ),
    );
    const boardWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardScreenHeight = boardHeight * zoom / dpr;
    const maxTop = Math.max(
      AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX,
      viewportHeightCss - Math.min(boardScreenHeight, viewportHeightCss) - AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX,
    );
    const targetTopCss = Math.min(AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX, maxTop);
    const boardCenterX = (Number(board.x) || 0) + boardWidth * 0.5;
    const boardTopY = Number(board.y) || 0;
    const nextCameraX = viewportWidthCss * 0.5 * dpr - boardCenterX * zoom;
    const nextCameraY = targetTopCss * dpr - boardTopY * zoom;

    if (
      Math.abs((Number(brushEngine.camera.x) || 0) - nextCameraX) < 0.5 &&
      Math.abs((Number(brushEngine.camera.y) || 0) - nextCameraY) < 0.5
    ) {
      return false;
    }

    brushEngine.camera.x = nextCameraX;
    brushEngine.camera.y = nextCameraY;
    brushEngine.userManipulatedCamera = true;
    brushEngine.requestDraw?.();

    return true;
  }

  function resizeAiImagePromptInput(input) {
    if (!input) {
      return;
    }

    const boardElement = input.closest?.("[data-ai-image-board]");
    const footer = input.closest?.("[data-ai-image-board-footer]");

    input.style.height = "auto";
    input.style.height = `${Math.max(AI_IMAGE_PROMPT_INPUT_MIN_HEIGHT_CSS_PX, input.scrollHeight || 0)}px`;

    if (boardElement && footer) {
      const footerHeight = Math.max(
        AI_IMAGE_BOARD_FOOTER_MIN_HEIGHT_CSS_PX,
        Math.ceil(footer.scrollHeight || footer.offsetHeight || 0),
      );
      boardElement.style.setProperty("--ai-image-board-footer-height", `${footerHeight}px`);
    }
  }

  function getAiImageBoardFootprintRect(rect) {
    if (!rect) {
      return null;
    }

    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;

    return createRect(
      rect.x - leftExtension,
      rect.y,
      rect.width + leftExtension,
      rect.height,
    );
  }

  function getDocumentArtboardRect(artboard) {
    return artboard
      ? createRect(artboard.x, artboard.y, artboard.width, artboard.height)
      : null;
  }

  function getSpaceBoardPlacementBlockers(options = {}) {
    const excludeBoardId = String(options.excludeBoardId || "").trim();
    const gap = Number.isFinite(Number(options.gap))
      ? Math.max(0, Number(options.gap))
      : SPACE_BOARD_GAP_DOC_PX;

    return [
      ...getAllArtboards().map(getDocumentArtboardRect),
      ...spaceBoards
        .filter((board) => !excludeBoardId || board.id !== excludeBoardId)
        .map(getSpaceBoardRect)
        .map(getAiImageBoardFootprintRect),
    ]
      .filter(Boolean)
      .map((rect) => expandRect(rect, gap));
  }

  function resolveFreeSpaceBoardPlacement(preferredRect, options = {}) {
    const blockers = getSpaceBoardPlacementBlockers(options);
    const preferredFootprint = getAiImageBoardFootprintRect(preferredRect);
    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;

    if (!doesRectOverlapAny(preferredFootprint, blockers)) {
      return preferredRect;
    }

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (x, y) => {
      const rect = createRect(
        Math.round(Number(x) || 0),
        Math.round(Number(y) || 0),
        preferredRect.width,
        preferredRect.height,
      );
      const key = `${rect.x}:${rect.y}`;

      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(rect);
      }
    };

    blockers.forEach((blocker) => {
      pushCandidate(blocker.x + blocker.width + leftExtension, preferredRect.y);
      pushCandidate(preferredRect.x, blocker.y + blocker.height);
      pushCandidate(blocker.x + blocker.width + leftExtension, blocker.y);
      pushCandidate(blocker.x, blocker.y + blocker.height);
    });

    blockers.forEach((horizontalBlocker) => {
      blockers.forEach((verticalBlocker) => {
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y);
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y + verticalBlocker.height);
      });
    });

    return candidates
      .filter((rect) => !doesRectOverlapAny(getAiImageBoardFootprintRect(rect), blockers))
      .sort((first, second) => (
        Math.hypot(first.x - preferredRect.x, first.y - preferredRect.y) -
        Math.hypot(second.x - preferredRect.x, second.y - preferredRect.y)
      ))[0] || preferredRect;
  }

  function getAiImageBoardInputAnchor(board) {
    if (!board) {
      return null;
    }

    const metrics = getActionBubbleMetrics();

    return {
      x: (Number(board.x) || 0) -
        metrics.gapDoc -
        metrics.sizeDoc * 0.5,
      y: (Number(board.y) || 0) +
        (Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX) -
        metrics.gapDoc -
        metrics.sizeDoc * 0.5,
    };
  }

  function getConnectionEndPoint(connection) {
    const targetBoard = getSpaceBoardById(connection?.targetBoardId);
    const targetAnchor = targetBoard?.type === "ai-image"
      ? getAiImageBoardInputAnchor(targetBoard)
      : null;

    if (targetAnchor) {
      return targetAnchor;
    }

    if (
      !Number.isFinite(Number(connection?.endDocX)) ||
      !Number.isFinite(Number(connection?.endDocY))
    ) {
      return null;
    }

    return {
      x: Number(connection.endDocX),
      y: Number(connection.endDocY),
    };
  }

  function createConnectionPathD(start, end, viewScale = 1) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const arrowInset = Math.min(
      getConnectionStrokeWidth(viewScale) * CONNECTION_ARROW_LENGTH_STROKE_UNITS,
      Math.max(0, length * 0.5),
    );
    const shaftEnd = {
      x: end.x - (dx / length) * arrowInset,
      y: end.y - (dy / length) * arrowInset,
    };
    const shaftDx = shaftEnd.x - start.x;
    const shaftDy = shaftEnd.y - start.y;
    const handleDistance = Math.max(48 * viewScale, Math.abs(shaftDx) * 0.5);
    const verticalEase = Math.min(Math.abs(shaftDy) * 0.18, 80 * viewScale);
    const control1 = {
      x: start.x + handleDistance,
      y: start.y + Math.sign(shaftDy || 1) * verticalEase,
    };
    const control2 = {
      x: shaftEnd.x - handleDistance,
      y: shaftEnd.y - Math.sign(shaftDy || 1) * verticalEase,
    };

    return `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${shaftEnd.x} ${shaftEnd.y}`;
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
  }

  function createConnectionPath(connection, options = {}) {
    const sourceArtboard = getArtboardById(connection.sourceArtboardId);
    const source = getActionAnchorPoint(sourceArtboard);
    const target = getConnectionEndPoint(connection);

    if (!source || !target) {
      return null;
    }

    const viewState = getCameraState();
    const viewScale = getViewScale();
    const start = documentPointToStagePoint(source, viewState);
    const end = documentPointToStagePoint(target, viewState);

    return createSvgElement("path", {
      class: `editor-artboard-connection-path${options.active ? " is-active" : ""}`,
      d: createConnectionPathD(start, end, viewScale),
      "data-connection-id": connection.id || "",
      "marker-end": "url(#editor-artboard-connection-arrow)",
      "stroke-width": getConnectionStrokeWidth(viewScale),
    });
  }

  function createConnectionDefs() {
    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: "editor-artboard-connection-arrow",
      markerHeight: "5",
      markerUnits: "strokeWidth",
      markerWidth: "5",
      orient: "auto",
      refX: "0",
      refY: "2.5",
      viewBox: "0 0 5 5",
    });
    const arrow = createSvgElement("path", {
      d: "M 0 0 L 5 2.5 L 0 5 z",
      fill: "#f05023",
    });

    marker.appendChild(arrow);
    defs.appendChild(marker);

    return defs;
  }

  function renderConnections() {
    const svg = ensureConnectionLayer();

    if (!svg) {
      return;
    }

    const paths = connections
      .map((connection) => createConnectionPath(connection))
      .filter(Boolean);

    if (connectionDrag) {
      const activePath = createConnectionPath(connectionDrag, { active: true });

      if (activePath) {
        paths.push(activePath);
      }
    }

    svg.replaceChildren(createConnectionDefs(), ...paths);
  }

  function renderSpaceBoards() {
    const layer = ensureSpaceBoardLayer();

    if (!layer) {
      return;
    }

    const viewState = getCameraState();
    const scale = getViewScale();
    const handleMetrics = getActionBubbleMetrics(scale);
    const renderedIds = new Set();

    spaceBoards.forEach((board) => {
      if (board.type !== "ai-image") {
        return;
      }

      const element = ensureAiImageBoardElement(board.id);

      if (!element) {
        return;
      }

      renderedIds.add(board.id);

      const point = documentPointToStagePoint({
        x: board.x,
        y: board.y,
      }, viewState);
      const width = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const height = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const label = element.querySelector("[data-ai-image-board-drag-handle]");
      const promptInput = element.querySelector("[data-ai-image-board-prompt-input]");

      element.style.left = `${point.x}px`;
      element.style.top = `${point.y}px`;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.transform = `scale(${scale})`;
      element.style.setProperty("--ai-image-board-radius", `${AI_IMAGE_BOARD_RADIUS_DOC_PX}px`);
      element.style.setProperty("--ai-image-input-handle-size", `${handleMetrics.sizeDoc}px`);
      element.style.setProperty("--ai-image-input-handle-left", `${(handleMetrics.sizeDoc + handleMetrics.gapDoc) * -1}px`);
      element.style.setProperty("--ai-image-input-handle-top", `${height - handleMetrics.gapDoc - handleMetrics.sizeDoc}px`);
      element.style.setProperty("--ai-image-input-border-width", `${handleMetrics.borderWidthDoc}px`);
      element.style.setProperty("--ai-image-input-icon-size", `${handleMetrics.iconSizeDoc}px`);
      element.style.setProperty("--ai-image-generate-handle-size", `${AI_IMAGE_GENERATE_HANDLE_SIZE_DOC_PX}px`);
      element.style.setProperty("--ai-image-generate-handle-left", `${width + AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX}px`);
      element.style.setProperty("--ai-image-generate-handle-top", `${AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX}px`);
      element.style.setProperty("--ai-image-generate-border-width", `${handleMetrics.borderWidthDoc}px`);
      element.style.setProperty("--ai-image-generate-icon-size", `${handleMetrics.iconSizeDoc}px`);
      element.style.setProperty("--ai-image-board-label-top", `${-25 / Math.max(0.0001, scale)}px`);
      element.style.setProperty("--ai-image-board-label-inverse-scale", `${1 / Math.max(0.0001, scale)}`);
      element.classList.toggle("is-generating", aiImageGeneratingBoardIds.has(board.id));

      if (label) {
        label.textContent = `${board.name || "AI Image board"} ${width} x ${height}`;
      }

      if (promptInput && document.activeElement !== promptInput) {
        promptInput.value = String(board.promptText || "");
      }

      resizeAiImagePromptInput(promptInput);
    });

    layer.querySelectorAll("[data-ai-image-board]").forEach((element) => {
      const boardId = element.dataset.boardId || "";

      if (!renderedIds.has(boardId)) {
        clearAiImageGenerationPreview(boardId);
        element.remove();
      }
    });
  }

  function getConnectionById(connectionId) {
    const normalizedId = String(connectionId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return connections.find((connection) => connection.id === normalizedId) || null;
  }

  function bindMenuDismiss() {
    if (menuDismissBound) {
      return;
    }

    menuDismissBound = true;
    document.addEventListener("click", handleMenuDocumentClick, true);
    document.addEventListener("keydown", handleMenuKeydown, true);
  }

  function unbindMenuDismiss() {
    if (!menuDismissBound) {
      return;
    }

    menuDismissBound = false;
    document.removeEventListener("click", handleMenuDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
  }

  function showConnectionMenu(connection) {
    if (!connection?.id) {
      return;
    }

    menuState = {
      connectionId: connection.id,
    };
    ignoreNextMenuDocumentClick = true;
    window.setTimeout(() => {
      ignoreNextMenuDocumentClick = false;
    }, 0);
    bindMenuDismiss();
    renderConnectionMenu();
  }

  function renderConnectionOverlay() {
    renderSpaceBoards();
    renderActions();
    renderConnections();
    renderConnectionMenu();
  }

  function dismissConnectionMenu(options = {}) {
    const connectionId = String(menuState?.connectionId || "").trim();

    menuState = null;
    unbindMenuDismiss();

    const menu = getStage()?.querySelector("[data-artboard-connection-menu]");

    menu?.classList.remove("is-visible");
    menu?.setAttribute("aria-hidden", "true");

    if (options.removeConnection !== false && connectionId) {
      connections = connections.filter((connection) => connection.id !== connectionId);
    }

    if (options.render !== false) {
      renderConnectionOverlay();
    }
  }

  function handleMenuDocumentClick(event) {
    if (!menuState) {
      return;
    }

    if (ignoreNextMenuDocumentClick) {
      ignoreNextMenuDocumentClick = false;
      return;
    }

    if (event.target?.closest?.("[data-artboard-connection-menu]")) {
      return;
    }

    dismissConnectionMenu();
  }

  function handleMenuKeydown(event) {
    if (!menuState || event.key !== "Escape") {
      return;
    }

    dismissConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderConnectionMenu() {
    const menu = ensureConnectionMenu();

    if (!menu) {
      return;
    }

    const connection = getConnectionById(menuState?.connectionId);

    if (!connection) {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }

    const target = getConnectionEndPoint(connection);

    if (!target) {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }

    const end = documentPointToStagePoint(target);
    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();
    const stageWidth = Math.max(1, Number(stageRect?.width || stage?.clientWidth) || 1);
    const stageHeight = Math.max(1, Number(stageRect?.height || stage?.clientHeight) || 1);

    menu.classList.add("is-visible");
    menu.setAttribute("aria-hidden", "false");

    const height = menu.offsetHeight || 154;
    const width = menu.offsetWidth || 140;
    const preferredLeft = end.x + CONNECTION_MENU_GAP_CSS_PX;
    const left = preferredLeft + width > stageWidth - 8
      ? Math.max(8, end.x - width - CONNECTION_MENU_GAP_CSS_PX)
      : Math.max(8, preferredLeft);
    const top = Math.min(
      Math.max(8, end.y - height * 0.5),
      Math.max(8, stageHeight - height - 8),
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function createConnectionId() {
    const id = `artboard-connection-${Date.now().toString(36)}-${connectionIdSeed}`;
    connectionIdSeed += 1;
    return id;
  }

  function createBoardId() {
    const id = `ai-image-board-${Date.now().toString(36)}-${boardIdSeed}`;
    boardIdSeed += 1;
    return id;
  }

  function createAiImageBoardForConnection(connection) {
    const anchor = getConnectionEndPoint(connection);

    if (!anchor) {
      return null;
    }

    const handleMetrics = getActionBubbleMetrics();
    const preferredRect = createRect(
      anchor.x + handleMetrics.gapDoc + handleMetrics.sizeDoc * 0.5,
      anchor.y - AI_IMAGE_BOARD_SIZE_DOC_PX + handleMetrics.gapDoc + handleMetrics.sizeDoc * 0.5,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
    );
    const placement = resolveFreeSpaceBoardPlacement(preferredRect);
    const board = {
      height: AI_IMAGE_BOARD_SIZE_DOC_PX,
      id: createBoardId(),
      name: `AI Image board #${spaceBoards.filter((entry) => entry.type === "ai-image").length + 1}`,
      promptText: "",
      type: "ai-image",
      width: AI_IMAGE_BOARD_SIZE_DOC_PX,
      x: placement.x,
      y: placement.y,
    };

    spaceBoards.push(board);

    const targetAnchor = getAiImageBoardInputAnchor(board);

    connection.endDocX = targetAnchor.x;
    connection.endDocY = targetAnchor.y;
    connection.targetBoardId = board.id;
    connection.targetHandle = "image-input";

    return board;
  }

  function getAllowedSpaceBoardMove(startFootprint, dx, dy, blockers = []) {
    const safeDx = Number.isFinite(Number(dx)) ? Number(dx) : 0;
    const safeDy = Number.isFinite(Number(dy)) ? Number(dy) : 0;

    if (!startFootprint || blockers.length === 0 || (safeDx === 0 && safeDy === 0)) {
      return {
        dx: safeDx,
        dy: safeDy,
      };
    }

    const startScore = getRectOverlapScore(startFootprint, blockers);
    const isAllowed = (rect) => {
      const score = getRectOverlapScore(rect, blockers);

      return score <= 0 || (startScore > 0 && score <= startScore);
    };

    if (isAllowed(offsetRect(startFootprint, safeDx, safeDy))) {
      return {
        dx: safeDx,
        dy: safeDy,
      };
    }

    let low = 0;
    let high = 1;

    for (let index = 0; index < SPACE_BOARD_MOVE_SEARCH_STEPS; index += 1) {
      const mid = (low + high) * 0.5;

      if (isAllowed(offsetRect(startFootprint, safeDx * mid, safeDy * mid))) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return {
      dx: safeDx * low,
      dy: safeDy * low,
    };
  }

  function getSpaceBoardMoveDistance(move) {
    return Math.hypot(Number(move?.dx) || 0, Number(move?.dy) || 0);
  }

  function constrainSpaceBoardMove(boardId, dx, dy, startRect) {
    const normalizedBoardId = String(boardId || "").trim();
    const start = startRect || getSpaceBoardRect(getSpaceBoardById(normalizedBoardId));

    if (!start) {
      return {
        dx: Number(dx) || 0,
        dy: Number(dy) || 0,
      };
    }

    const requested = {
      dx: Number(dx) || 0,
      dy: Number(dy) || 0,
    };
    const candidate = createRect(
      start.x + requested.dx,
      start.y + requested.dy,
      start.width,
      start.height,
    );
    const blockers = getSpaceBoardPlacementBlockers({
      excludeBoardId: normalizedBoardId,
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
    });
    const startFootprint = getAiImageBoardFootprintRect(start);

    if (!doesRectOverlapAny(getAiImageBoardFootprintRect(candidate), blockers)) {
      return requested;
    }

    return [
      getAllowedSpaceBoardMove(startFootprint, requested.dx, requested.dy, blockers),
      getAllowedSpaceBoardMove(startFootprint, requested.dx, 0, blockers),
      getAllowedSpaceBoardMove(startFootprint, 0, requested.dy, blockers),
    ].sort((first, second) => getSpaceBoardMoveDistance(second) - getSpaceBoardMoveDistance(first))[0] || {
      dx: 0,
      dy: 0,
    };
  }

  function startSpaceBoardDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    const boardElement = event.currentTarget?.closest?.("[data-ai-image-board]");
    const boardId = String(boardElement?.dataset?.boardId || "").trim();
    const board = getSpaceBoardById(boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    spaceBoardDrag = {
      boardId,
      beforeState: captureConnectionsHistoryState(),
      didMove: false,
      dx: 0,
      dy: 0,
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startRect: getSpaceBoardRect(board),
      startX: Number(board.x) || 0,
      startY: Number(board.y) || 0,
    };

    getStage()?.classList.add("artboard-dragging");

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    addSpaceBoardDragListeners();
    event.preventDefault();
    event.stopPropagation();
  }

  function updateSpaceBoardDrag(event) {
    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    const board = getSpaceBoardById(spaceBoardDrag.boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    const rawDx = (Number(point.docX) || 0) - spaceBoardDrag.startDocX;
    const rawDy = (Number(point.docY) || 0) - spaceBoardDrag.startDocY;
    const constrained = constrainSpaceBoardMove(
      spaceBoardDrag.boardId,
      rawDx,
      rawDy,
      spaceBoardDrag.startRect,
    );
    const dx = Number(constrained.dx) || 0;
    const dy = Number(constrained.dy) || 0;

    board.x = spaceBoardDrag.startX + dx;
    board.y = spaceBoardDrag.startY + dy;
    spaceBoardDrag.dx = dx;
    spaceBoardDrag.dy = dy;
    spaceBoardDrag.didMove = spaceBoardDrag.didMove || Boolean(dx || dy);
    renderConnectionOverlay();
    event.preventDefault();
    event.stopPropagation();
  }

  function finishSpaceBoardDrag(event) {
    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    const state = spaceBoardDrag;

    spaceBoardDrag = null;
    removeSpaceBoardDragListeners();
    getStage()?.classList.remove("artboard-dragging");

    try {
      state.sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Some browsers release capture automatically before pointercancel/pointerup.
    }

    if (event.type === "pointercancel") {
      restoreConnectionsHistoryState(state.beforeState, "space-board-drag-cancel");
    } else if (state.didMove && (Math.round(state.dx) || Math.round(state.dy))) {
      pushConnectionsHistoryEntry(state.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-move-${state.boardId}`,
        source: "space-board-label-drag",
        type: "space-board-move",
      });
    } else {
      renderConnectionOverlay();
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function addSpaceBoardDragListeners() {
    document.addEventListener("pointermove", updateSpaceBoardDrag, true);
    document.addEventListener("pointerup", finishSpaceBoardDrag, true);
    document.addEventListener("pointercancel", finishSpaceBoardDrag, true);
  }

  function removeSpaceBoardDragListeners() {
    document.removeEventListener("pointermove", updateSpaceBoardDrag, true);
    document.removeEventListener("pointerup", finishSpaceBoardDrag, true);
    document.removeEventListener("pointercancel", finishSpaceBoardDrag, true);
    getStage()?.classList.remove("artboard-dragging");
  }

  function materializeAiImageBoardFromMenu() {
    const connection = getConnectionById(menuState?.connectionId);

    if (!connection) {
      dismissConnectionMenu();
      return;
    }

    const beforeState = captureConnectionsHistoryState({
      excludeConnectionIds: [connection.id],
    });

    createAiImageBoardForConnection(connection);
    dismissConnectionMenu({
      removeConnection: false,
      render: false,
    });
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-create-${connection.id}`,
      source: "space-board-create-ai-image",
      type: "space-board-create",
    });
    renderConnectionOverlay();
  }

  function getDefaultConnectionEndPoint(sourceArtboardId) {
    const sourceArtboard = getArtboardById(sourceArtboardId);
    const anchor = getActionAnchorPoint(sourceArtboard);

    if (!anchor) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: anchor.x + (CONNECTION_CLICK_DISTANCE_CSS_PX * dpr) / zoom,
      y: anchor.y,
    };
  }

  function updateConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const dx = event.clientX - connectionDrag.startClientX;
    const dy = event.clientY - connectionDrag.startClientY;

    connectionDrag.endDocX = point.docX;
    connectionDrag.endDocY = point.docY;
    connectionDrag.didMove = connectionDrag.didMove ||
      Math.hypot(dx, dy) >= CONNECTION_MIN_DRAG_CSS_PX;
    renderConnections();
    event.preventDefault();
  }

  function finishConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    updateConnectionDrag(event);

    const connection = connectionDrag;
    const sourceElement = connection.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    const defaultEnd = connection.didMove
      ? null
      : getDefaultConnectionEndPoint(connection.sourceArtboardId);
    const finalizedConnection = {
      endDocX: defaultEnd?.x ?? connection.endDocX,
      endDocY: defaultEnd?.y ?? connection.endDocY,
      id: connection.id,
      sourceArtboardId: connection.sourceArtboardId,
    };

    connections.push(finalizedConnection);
    showConnectionMenu(finalizedConnection);

    renderConnections();
    renderConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function cancelConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const sourceElement = connectionDrag.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function startConnectionDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    const bubble = event.currentTarget;
    const sourceArtboardId = String(bubble?.dataset?.artboardId || lastRenderContext.selectedArtboardId || "").trim();
    const point = getEventDocumentPoint(event);

    if (!sourceArtboardId || !point || !getArtboardById(sourceArtboardId)) {
      return;
    }

    connectionDrag = {
      didMove: false,
      endDocX: point.docX,
      endDocY: point.docY,
      id: createConnectionId(),
      pointerId: event.pointerId,
      sourceArtboardId,
      sourceElement: bubble,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };

    try {
      bubble?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    document.addEventListener("pointermove", updateConnectionDrag, true);
    document.addEventListener("pointerup", finishConnectionDrag, true);
    document.addEventListener("pointercancel", cancelConnectionDrag, true);
    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderActions() {
    const selectedId = String(lastRenderContext.selectedArtboardId || "").trim();
    const visibleArtboardIds = new Set();

    if (selectedId) {
      visibleArtboardIds.add(selectedId);
    }

    connections.forEach((connection) => {
      const sourceArtboardId = String(connection?.sourceArtboardId || "").trim();

      if (sourceArtboardId) {
        visibleArtboardIds.add(sourceArtboardId);
      }
    });

    const activeSourceArtboardId = String(connectionDrag?.sourceArtboardId || "").trim();

    if (activeSourceArtboardId) {
      visibleArtboardIds.add(activeSourceArtboardId);
    }

    const scale = Math.max(0.0001, Number(lastRenderContext.viewScale) || 1);
    const { borderWidth, gap, iconSize, size } = getActionBubbleMetrics(scale);
    const renderedIds = new Set();
    const nextAnchorOverrides = new Map();

    lastRenderContext.artboardViews.forEach((view) => {
      if (!visibleArtboardIds.has(view.artboard.id)) {
        return;
      }

      const bubble = ensureActionBubble(view.artboard.id);

      if (!bubble) {
        return;
      }

      renderedIds.add(view.artboard.id);
      const left = view.left + view.width + gap;
      const top = view.top + gap;

      nextAnchorOverrides.set(view.artboard.id, stagePointToDocumentPoint({
        x: left + size,
        y: top + size * 0.5,
      }));

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.borderWidth = `${borderWidth}px`;
      bubble.style.setProperty("--artboard-action-icon-size", `${iconSize}px`);
      bubble.classList.add("is-visible");
    });

    anchorOverrides = nextAnchorOverrides;

    getStage()?.querySelectorAll("[data-artboard-action-bubble]").forEach((bubble) => {
      if (!renderedIds.has(bubble.dataset.artboardId || "")) {
        bubble.classList.remove("is-visible", "is-hovered");
      }
    });
  }

  namespace.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay(options = {}) {
    const camera = options.camera || getBrushEngine()?.camera || lastRenderContext.camera;
    const dpr = Math.max(1, Number(options.dpr || getBrushEngine()?.dpr || lastRenderContext.dpr || window.devicePixelRatio || 1));
    const viewScale = Number.isFinite(Number(options.viewScale))
      ? Number(options.viewScale)
      : Math.max(0.0001, Number(camera?.zoom) || 1) / dpr;

    lastRenderContext = {
      artboardViews: Array.isArray(options.artboardViews) ? options.artboardViews : [],
      camera: cloneCamera(camera),
      dpr,
      selectedArtboardId: String(options.selectedArtboardId || "").trim(),
      viewScale,
    };
    renderConnectionOverlay();
  };

  namespace.getArtboardConnections = function getArtboardConnections() {
    return connections.map((connection) => ({ ...connection }));
  };

  namespace.getArtboardConnectionBoards = function getArtboardConnectionBoards() {
    return spaceBoards.map((board) => ({ ...board }));
  };

  namespace.getArtboardConnectionBoardCollisionRects = function getArtboardConnectionBoardCollisionRects() {
    return spaceBoards
      .map(getSpaceBoardRect)
      .map(getAiImageBoardFootprintRect)
      .filter(Boolean)
      .map((rect) => ({ ...rect }));
  };

  namespace.clearArtboardConnections = function clearArtboardConnections() {
    connections = [];
    spaceBoards = [];
    connectionDrag = null;
    spaceBoardDrag = null;
    promptEditState = null;
    clearPromptFocusViewportTimers();
    clearAiImageGenerationPreview();
    removeSpaceBoardDragListeners();
    dismissConnectionMenu({ render: false });
    renderConnectionOverlay();
  };
})(window.CBO);
