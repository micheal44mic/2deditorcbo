window.CBO = window.CBO || {};



(function registerConnectionActionsJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before connection-actions.js.");

  }



  Controller.prototype.bindMenuDismiss = function bindMenuDismiss() {
    with (this) {

    if (menuDismissBound) {
      return;
    }

    menuDismissBound = true;
    document.addEventListener("click", handleMenuDocumentClick, true);
    document.addEventListener("keydown", handleMenuKeydown, true);
    }
  };

  Controller.prototype.unbindMenuDismiss = function unbindMenuDismiss() {
    with (this) {

    if (!menuDismissBound) {
      return;
    }

    menuDismissBound = false;
    document.removeEventListener("click", handleMenuDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
    }
  };

  Controller.prototype.showConnectionMenu = function showConnectionMenu(connection) {
    with (this) {

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
  };

  Controller.prototype.getDetachedConnectionMenuAnchorViewportPoint = function getDetachedConnectionMenuAnchorViewportPoint(trigger = null) {
    with (this) {

    const visualViewport = window.visualViewport || null;
    const viewportWidth = Math.max(1, Number(visualViewport?.width || window.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(visualViewport?.height || window.innerHeight) || 1);
    const triggerRect = trigger?.getBoundingClientRect?.();

    if (!triggerRect) {
      return {
        x: viewportWidth * 0.5,
        y: viewportHeight * 0.5,
      };
    }

    return {
      x: Math.min(Math.max(8, triggerRect.left + triggerRect.width * 0.5), Math.max(8, viewportWidth - 8)),
      y: Math.min(Math.max(8, triggerRect.top), Math.max(8, viewportHeight - 8)),
    };
    }
  };

  Controller.prototype.openAiBoardConnectionMenu = function openAiBoardConnectionMenu(options = {}) {
    with (this) {

    if (menuState?.detached === true) {
      dismissConnectionMenu({
        removeConnection: false,
      });
      return true;
    }

    if (menuState) {
      dismissConnectionMenu();
    }

    const anchorViewportPoint = getDetachedConnectionMenuAnchorViewportPoint(options.trigger || null);

    if (!anchorViewportPoint) {
      return false;
    }

    menuState = {
      anchorViewportPoint,
      detached: true,
    };
    ignoreNextMenuDocumentClick = true;
    window.setTimeout(() => {
      ignoreNextMenuDocumentClick = false;
    }, 0);
    bindMenuDismiss();
    renderConnectionMenu();
    return true;
    }
  };

  Controller.prototype.renderConnectionOverlay = function renderConnectionOverlay() {
    with (this) {

    renderSpaceBoards();
    renderActions();
    renderConnections();
    renderConnectionMenu();
    }
  };

  Controller.prototype.renderActiveSpaceBoardDragFrame = function renderActiveSpaceBoardDragFrame() {
    with (this) {

    const state = spaceBoardDrag;
    const board = getSpaceBoardById(state?.boardId || "");
    const layer = ensureSpaceBoardLayer();
    const element = layer?.querySelector?.(`[data-ai-image-board][data-board-id="${board?.id || ""}"]`);

    if (!state || !board || board.type !== "ai-image" || !element) {
      renderConnectionOverlay();
      return false;
    }

    const docWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const docHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const viewState = getCameraState();
    const viewScale = getViewScale();
    const plainArtboardMode = shouldUsePlainAiBoardArtboards();

    if (plainArtboardMode) {
      const point = documentPointToStagePoint({ x: board.x, y: board.y }, viewState);

      setStylePropertyIfChanged(element, "left", `${point.x}px`);
      setStylePropertyIfChanged(element, "top", `${point.y}px`);
      setStylePropertyIfChanged(element, "width", `${Math.max(1, docWidth * viewScale)}px`);
      setStylePropertyIfChanged(element, "height", `${Math.max(1, docHeight * viewScale)}px`);
      setStylePropertyIfChanged(element, "transform", "none");
    } else {
      setStylePropertyIfChanged(element, "transform", `translate3d(${Number(board.x) || 0}px, ${Number(board.y) || 0}px, 0)`);
    }

    element.classList.add("is-preview-work-deferred");
    renderConnections();
    renderConnectionMenu();
    return true;
    }
  };

  Controller.prototype.cancelScheduledSpaceBoardDragRender = function cancelScheduledSpaceBoardDragRender() {
    with (this) {

    if (spaceBoardDragRenderFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(spaceBoardDragRenderFrame);
    }

    spaceBoardDragRenderFrame = 0;
    }
  };

  Controller.prototype.scheduleSpaceBoardDragRender = function scheduleSpaceBoardDragRender() {
    with (this) {

    if (spaceBoardDragRenderFrame) {
      return;
    }

    const renderFrame = () => {
      spaceBoardDragRenderFrame = 0;
      renderActiveSpaceBoardDragFrame();
    };

    if (typeof window.requestAnimationFrame !== "function") {
      renderFrame();
      return;
    }

    spaceBoardDragRenderFrame = window.requestAnimationFrame(renderFrame);
    }
  };

  Controller.prototype.dismissConnectionMenu = function dismissConnectionMenu(options = {}) {
    with (this) {

    const connectionId = String(menuState?.connectionId || "").trim();

    menuState = null;
    unbindMenuDismiss();

    const menu = getStage()?.querySelector("[data-artboard-connection-menu]");

    menu?.classList.remove("is-visible");
    menu?.classList.remove("is-detached-toolbar-menu");
    menu?.setAttribute("aria-hidden", "true");

    if (options.removeConnection !== false && connectionId) {
      connections = connections.filter((connection) => connection.id !== connectionId);
    }

    if (options.render !== false) {
      renderConnectionOverlay();
    }
    }
  };

  Controller.prototype.handleMenuDocumentClick = function handleMenuDocumentClick(event) {
    with (this) {

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
  };

  Controller.prototype.handleMenuKeydown = function handleMenuKeydown(event) {
    with (this) {

    if (!menuState || event.key !== "Escape") {
      return;
    }

    dismissConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.renderConnectionMenu = function renderConnectionMenu() {
    with (this) {

    const menu = ensureConnectionMenu();

    if (!menu) {
      return;
    }

    const isDetachedMenu = menuState?.detached === true;
    const connection = getConnectionById(menuState?.connectionId);
    const detachedEnd = isDetachedMenu
      ? menuState.anchorViewportPoint || getDetachedConnectionMenuAnchorViewportPoint()
      : null;
    let end = null;

    if (connection) {
      const target = getConnectionEndPoint(connection);

      if (!target) {
        menu.classList.remove("is-visible");
        menu.setAttribute("aria-hidden", "true");
        return;
      }

      end = documentPointToStagePoint(target);
    } else if (detachedEnd) {
      end = detachedEnd;
    } else {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }
    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();
    const visualViewport = window.visualViewport || null;
    const viewportWidth = Math.max(1, Number(visualViewport?.width || window.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(visualViewport?.height || window.innerHeight) || 1);
    const stageWidth = isDetachedMenu
      ? viewportWidth
      : Math.max(1, Number(stageRect?.width || stage?.clientWidth) || 1);
    const stageHeight = isDetachedMenu
      ? viewportHeight
      : Math.max(1, Number(stageRect?.height || stage?.clientHeight) || 1);
    const toolbarRect = isDetachedMenu
      ? document.querySelector(".toolbar-dock")?.getBoundingClientRect?.()
      : null;
    const toolbarTop = toolbarRect
      ? isDetachedMenu
        ? Number(toolbarRect.top) || stageHeight
        : (Number(toolbarRect.top) || 0) - (Number(stageRect?.top) || 0)
      : stageHeight;

    menu.classList.toggle("is-detached-toolbar-menu", isDetachedMenu);
    menu.classList.add("is-visible");
    menu.setAttribute("aria-hidden", "false");

    const height = menu.offsetHeight || 154;
    const width = menu.offsetWidth || 140;
    const preferredLeft = end.x + CONNECTION_MENU_GAP_CSS_PX;
    const left = isDetachedMenu
      ? Math.min(
          Math.max(8, end.x - width * 0.5),
          Math.max(8, stageWidth - width - 8),
        )
      : preferredLeft + width > stageWidth - 8
        ? Math.max(8, end.x - width - CONNECTION_MENU_GAP_CSS_PX)
        : Math.max(8, preferredLeft);
    const stageTopLimit = stageHeight - height - 8;
    const detachedTopLimit = toolbarTop - CONNECTION_MENU_GAP_CSS_PX - height;
    const top = Math.min(
      Math.max(8, end.y - height * 0.5),
      Math.max(8, isDetachedMenu ? detachedTopLimit : stageTopLimit),
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    }
  };

  Controller.prototype.createConnectionId = function createConnectionId() {
    with (this) {

    const id = `artboard-connection-${Date.now().toString(36)}-${connectionIdSeed}`;
    connectionIdSeed += 1;
    return id;
    }
  };

  Controller.prototype.createBoardId = function createBoardId() {
    with (this) {

    const id = `ai-image-board-${Date.now().toString(36)}-${boardIdSeed}`;
    boardIdSeed += 1;
    return id;
    }
  };

  Controller.prototype.getIncomingConnectionsForSpaceBoard = function getIncomingConnectionsForSpaceBoard(boardId) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return [];
    }

    return connections.filter((connection) => connection.targetBoardId === normalizedBoardId);
    }
  };

  Controller.prototype.getDuplicatedAiImageBoardName = function getDuplicatedAiImageBoardName(board) {
    with (this) {

    const baseName = String(board?.name || "AI Image board").trim() || "AI Image board";
    const copyBase = `${baseName} copy`;
    const existingNames = new Set(spaceBoards.map((entry) => String(entry?.name || "").trim()));

    if (!existingNames.has(copyBase)) {
      return copyBase;
    }

    let index = 2;

    while (existingNames.has(`${copyBase} ${index}`)) {
      index += 1;
    }

    return `${copyBase} ${index}`;
    }
  };

  Controller.prototype.createDuplicateAiImageBoardPlacement = function createDuplicateAiImageBoardPlacement(board) {
    with (this) {

    const width = Number(board?.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const height = Number(board?.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const metrics = getActionBubbleMetrics(1, width, height);
    const nearbyGap = metrics.gapDoc + metrics.sizeDoc + SPACE_BOARD_DRAG_GAP_DOC_PX;
    const preferredRect = createRect(
      (Number(board?.x) || 0) + width + nearbyGap,
      Number(board?.y) || 0,
      width,
      height,
    );

    return resolveFreeSpaceBoardPlacement(preferredRect, {
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
    });
    }
  };

  Controller.prototype.duplicateAiImageBoard = function duplicateAiImageBoard(boardId) {
    with (this) {

    const board = getSpaceBoardById(boardId);

    if (!board || board.type !== "ai-image") {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();
    const placement = createDuplicateAiImageBoardPlacement(board);
    const duplicate = {
      ...cloneSpaceBoard(board),
      height: placement.height,
      id: createBoardId(),
      name: getDuplicatedAiImageBoardName(board),
      promptParts: normalizeAiImagePromptParts(board.promptParts),
      type: "ai-image",
      width: placement.width,
      x: placement.x,
      y: placement.y,
    };

    spaceBoards.push(duplicate);

    const duplicateAnchor = getAiImageBoardInputAnchor(duplicate);

    getIncomingConnectionsForSpaceBoard(board.id).forEach((connection) => {
      connections.push({
        ...cloneConnection(connection),
        endDocX: duplicateAnchor?.x ?? connection.endDocX,
        endDocY: duplicateAnchor?.y ?? connection.endDocY,
        id: createConnectionId(),
        targetBoardId: duplicate.id,
        targetHandle: connection.targetHandle || "image-input",
      });
    });

    selectedSpaceBoardId = duplicate.id;
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-duplicate-${board.id}`,
      source: "space-board-duplicate-ai-image",
      type: "space-board-duplicate",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-duplicate-ai-image");
    return duplicate;
    }
  };

  Controller.prototype.closeAiImageBoardViewsForBoard = function closeAiImageBoardViewsForBoard(boardId) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return false;
    }

    if (aiImageEditPreviewViewer?.dataset?.boardId === normalizedBoardId) {
      closeAiImageBoardEditPreview();
    }

    if (aiImageEnlargeViewer?.dataset?.boardId === normalizedBoardId) {
      closeAiImageBoardEnlargeViewer();
    }

    return true;
    }
  };

  Controller.prototype.deleteAiImageBoard = function deleteAiImageBoard(boardId) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);

    if (!board || board.type !== "ai-image") {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();

    closeAiImageBoardViewsForBoard(normalizedBoardId);
    clearAiImageGenerationPreview(normalizedBoardId);
    spaceBoards = spaceBoards.filter((entry) => entry.id !== normalizedBoardId);
    connections = connections.filter((connection) => connection.targetBoardId !== normalizedBoardId);

    if (selectedSpaceBoardId === normalizedBoardId) {
      selectedSpaceBoardId = "";
    }

    if (menuState?.connectionId && !getConnectionById(menuState.connectionId)) {
      dismissConnectionMenu({
        removeConnection: false,
        render: false,
      });
    }

    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-delete-${normalizedBoardId}`,
      source: "space-board-delete-ai-image",
      type: "space-board-delete",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-delete-ai-image");
    return true;
    }
  };

  Controller.prototype.createAiImageBoardForConnection = function createAiImageBoardForConnection(connection, options = {}) {
    with (this) {

    const anchor = getConnectionEndPoint(connection);

    if (!anchor) {
      return null;
    }

    const generationKind = options.generationKind === "video" ? "video" : "image";
    const boardCount = spaceBoards.filter((entry) => (
      entry.type === "ai-image" &&
      getAiImageBoardGenerationKind(entry) === generationKind
    )).length + 1;
    const handleMetrics = getActionBubbleMetrics();
    const preferredRect = createRect(
      anchor.x + handleMetrics.outsideOffsetDoc,
      anchor.y - AI_IMAGE_BOARD_SIZE_DOC_PX + handleMetrics.outsideOffsetDoc,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
    );
    const placement = resolveFreeSpaceBoardPlacement(preferredRect);
    const board = {
      height: AI_IMAGE_BOARD_SIZE_DOC_PX,
      id: createBoardId(),
      captionText: "",
      generationKind,
      name: generationKind === "video" ? `AI Video board #${boardCount}` : `AI Image board #${boardCount}`,
      promptParts: [],
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
  };

  Controller.prototype.connectToExistingAiImageBoard = function connectToExistingAiImageBoard(connection, board) {
    with (this) {

    const targetAnchor = getAiImageBoardInputAnchor(board);

    if (!connection || !board || board.type !== "ai-image" || !targetAnchor) {
      return false;
    }

    connection.endDocX = targetAnchor.x;
    connection.endDocY = targetAnchor.y;
    connection.targetBoardId = board.id;
    connection.targetHandle = "image-input";
    selectedSpaceBoardId = board.id;

    return true;
    }
  };

  Controller.prototype.isConnectionTargetBoardOccupied = function isConnectionTargetBoardOccupied(board, options = {}) {
    with (this) {

    const normalizedBoardId = String(board?.id || board || "").trim();

    if (!normalizedBoardId) {
      return false;
    }

    const excludeConnectionId = String(options.excludeConnectionId || "").trim();
    const sourceIsTextPrompt = isTextPromptConnection(options.sourceConnection);

    return connections.some((connection) => (
      connection?.targetBoardId === normalizedBoardId &&
      (!excludeConnectionId || connection.id !== excludeConnectionId) &&
      (!sourceIsTextPrompt || isTextPromptConnection(connection))
    ));
    }
  };

  Controller.prototype.getConnectionDropTargetMagnetRadius = function getConnectionDropTargetMagnetRadius(board, options = {}) {
    with (this) {

    const metrics = getActionBubbleMetrics(1, board?.width, board?.height);
    const baseRadiusDoc = Math.max(
      metrics.sizeDoc * 0.5 + metrics.gapDoc * 1.5,
      metrics.sizeDoc * 0.75,
    );
    const viewScale = Math.max(0.0001, getViewScale());
    const isTouchTarget = options.pointerType === "touch" ||
      options.pointerType === "pen" ||
      isMobileLikeSpaceBoardViewport();
    const screenRadiusCss = isTouchTarget
      ? CONNECTION_DROP_TARGET_TOUCH_RADIUS_CSS_PX
      : CONNECTION_DROP_TARGET_MAGNET_RADIUS_CSS_PX;

    return Math.max(baseRadiusDoc, screenRadiusCss / viewScale);
    }
  };

  Controller.prototype.setConnectionDropTargetBoard = function setConnectionDropTargetBoard(boardId = "", options = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const normalizedBlockedBoardId = String(options.blockedBoardId || "").trim();

    if (connectionDropTargetBoardId === normalizedBoardId) {
      if (connectionBlockedTargetBoardId === normalizedBlockedBoardId) {
        return;
      }
    }

    connectionDropTargetBoardId = normalizedBoardId;
    connectionBlockedTargetBoardId = normalizedBlockedBoardId;
    getStage()?.querySelectorAll("[data-ai-image-board]").forEach((element) => {
      const boardId = element.dataset.boardId || "";

      element.classList.toggle(
        "is-connection-drop-target",
        Boolean(normalizedBoardId) && boardId === normalizedBoardId,
      );
      element.classList.toggle(
        "is-connection-drop-blocked",
        Boolean(normalizedBlockedBoardId) && boardId === normalizedBlockedBoardId,
      );
    });
    }
  };

  Controller.prototype.getConnectionDropTargetAtDocumentPoint = function getConnectionDropTargetAtDocumentPoint(point, options = {}) {
    with (this) {

    const x = Number.isFinite(Number(point?.docX)) ? Number(point.docX) : Number(point?.x);
    const y = Number.isFinite(Number(point?.docY)) ? Number(point.docY) : Number(point?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const includeOccupied = options.includeOccupied === true;
    const canUseBoard = (board) => (
      board?.type === "ai-image" &&
      (includeOccupied || !isConnectionTargetBoardOccupied(board, options))
    );

    const magnetMatches = [...spaceBoards]
      .reverse()
      .filter(canUseBoard)
      .map((board) => {
        const anchor = getAiImageBoardInputAnchor(board);
        const magnetRadius = getConnectionDropTargetMagnetRadius(board, options);
        const distance = anchor ? Math.hypot(x - anchor.x, y - anchor.y) : Infinity;

        return {
          board,
          distance,
          magnetRadius,
        };
      })
      .filter((entry) => entry.distance <= entry.magnetRadius)
      .sort((first, second) => first.distance - second.distance);

    if (magnetMatches[0]?.board) {
      return magnetMatches[0].board;
    }

    const fallbackBoard = getSpaceBoardAtDocumentPoint(point, { type: "ai-image" });

    return canUseBoard(fallbackBoard) ? fallbackBoard : null;
    }
  };

  Controller.prototype.createDetachedAiImageBoardFromMenu = function createDetachedAiImageBoardFromMenu(options = {}) {
    with (this) {

    const generationKind = options.generationKind === "video" ? "video" : "image";
    const boardCount = spaceBoards.filter((entry) => (
      entry.type === "ai-image" &&
      getAiImageBoardGenerationKind(entry) === generationKind
    )).length + 1;
    const placement = getCurrentViewportAiImageBoardPlacement() || createRect(
      0,
      0,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
    );
    const board = {
      height: AI_IMAGE_BOARD_SIZE_DOC_PX,
      id: createBoardId(),
      captionText: "",
      generationKind,
      name: generationKind === "video" ? `AI Video board #${boardCount}` : `AI Image board #${boardCount}`,
      promptParts: [],
      promptText: "",
      type: "ai-image",
      width: AI_IMAGE_BOARD_SIZE_DOC_PX,
      x: placement.x,
      y: placement.y,
    };

    spaceBoards.push(board);
    selectedSpaceBoardId = board.id;

    return board;
    }
  };

  Controller.prototype.getImportedAiImageBoardSize = function getImportedAiImageBoardSize(width, height) {
    with (this) {

    const sourceWidth = Math.max(1, Math.round(Number(width) || AI_IMAGE_BOARD_SIZE_DOC_PX));
    const sourceHeight = Math.max(1, Math.round(Number(height) || AI_IMAGE_BOARD_SIZE_DOC_PX));

    return {
      height: sourceHeight,
      width: sourceWidth,
    };
    }
  };

  Controller.prototype.getAiImageBoardPlacementForClientPoint = function getAiImageBoardPlacementForClientPoint(options = {}) {
    with (this) {

    const width = Number(options.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const height = Number(options.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const clientX = Number(options.clientX);
    const clientY = Number(options.clientY);
    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();

    if (
      !stageRect ||
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      clientX < stageRect.left ||
      clientX > stageRect.right ||
      clientY < stageRect.top ||
      clientY > stageRect.bottom
    ) {
      return getCurrentViewportAiImageBoardPlacement({ height, width });
    }

    const center = stagePointToDocumentPoint({
      x: clientX - stageRect.left,
      y: clientY - stageRect.top,
    });
    const preferredRect = createRect(
      Math.round((Number(center.x) || 0) - width * 0.5),
      Math.round((Number(center.y) || 0) - height * 0.5),
      width,
      height,
    );

    return resolveFreeSpaceBoardPlacement(preferredRect, {
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
      includeSurroundingCandidates: true,
    });
    }
  };

  Controller.prototype.createAiImageBoardFromUpload = function createAiImageBoardFromUpload(options = {}) {
    with (this) {

    const uploadId = String(options.uploadId || "").trim();
    const src = String(options.src || "").trim();

    if (!uploadId || !src) {
      return null;
    }

    const mediaKind = options.kind === "video" ? "video" : "image";
    const originalWidth = Math.max(1, Math.round(Number(options.width) || AI_IMAGE_BOARD_SIZE_DOC_PX));
    const originalHeight = Math.max(1, Math.round(Number(options.height) || AI_IMAGE_BOARD_SIZE_DOC_PX));
    const size = getImportedAiImageBoardSize(originalWidth, originalHeight);
    const placement = getAiImageBoardPlacementForClientPoint({
      clientX: options.clientX,
      clientY: options.clientY,
      height: size.height,
      width: size.width,
    }) || createRect(0, 0, size.width, size.height);
    const boardCount = spaceBoards.filter((entry) => (
      entry.type === "ai-image" &&
      getAiImageBoardGenerationKind(entry) === mediaKind
    )).length + 1;
    const defaultName = mediaKind === "video"
      ? `Imported video #${boardCount}`
      : `Imported image #${boardCount}`;
    const name = String(options.name || defaultName).trim() || defaultName;
    const beforeState = captureConnectionsHistoryState();
    const board = {
      height: size.height,
      id: createBoardId(),
      captionText: "",
      generatedMedia: {
        duration: Number(options.duration) || 0,
        height: size.height,
        kind: mediaKind,
        name,
        originalHeight,
        originalWidth,
        src,
        uploadId,
        uploadSource: "cbo-editor-uploads",
        width: size.width,
      },
      generationKind: mediaKind,
      name,
      promptParts: [],
      promptText: "",
      type: "ai-image",
      width: size.width,
      x: placement.x,
      y: placement.y,
    };

    spaceBoards.push(board);
    selectedSpaceBoardId = board.id;
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-import-upload-${board.id}`,
      source: "space-board-import-upload",
      type: "space-board-import-upload",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-import-upload");

    return board;
    }
  };

  Controller.prototype.getAllowedSpaceBoardMove = function getAllowedSpaceBoardMove(startFootprint, dx, dy, blockers = []) {
    with (this) {

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
  };

  Controller.prototype.getSpaceBoardMoveDistance = function getSpaceBoardMoveDistance(move) {
    with (this) {

    return Math.hypot(Number(move?.dx) || 0, Number(move?.dy) || 0);
    }
  };

  Controller.prototype.constrainSpaceBoardMove = function constrainSpaceBoardMove(boardId, dx, dy, startRect, cachedBlockers = null, cachedStartFootprint = null) {
    with (this) {

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
    const blockers = Array.isArray(cachedBlockers)
      ? cachedBlockers
      : getSpaceBoardPlacementBlockers({
        excludeBoardId: normalizedBoardId,
        gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
      });
    const startFootprint = cachedStartFootprint || getAiImageBoardFootprintRect(start);

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
  };

  Controller.prototype.startSpaceBoardDrag = function startSpaceBoardDrag(event) {
    with (this) {

    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    if (!shouldStartSpaceBoardDragFromEvent(event)) {
      return;
    }

    const boardElement = event.currentTarget?.closest?.("[data-space-board], [data-ai-image-board], [data-space-text-board]");
    const boardId = String(boardElement?.dataset?.boardId || "").trim();
    const board = getSpaceBoardById(boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    const requiresMobileMoveArm = (
      (board.type === "ai-image" || (typeof isTextPromptBoard === "function" && isTextPromptBoard(board))) &&
      event.pointerType === "touch" &&
      isMobileLikeSpaceBoardViewport()
    );

    if (
      requiresMobileMoveArm &&
      !namespace.isMobileObjectMoveArmed?.({ id: boardId, type: "space-board" })
    ) {
      namespace.clearMobileObjectMoveArmed?.({ type: "space-board" }, {
        source: "space-board-mobile-select-clear-move",
      });
      selectedSpaceBoardId = boardId;
      if (board.type === "ai-image") {
        ensureAiImageBoardHeavyContent(boardElement);
      }
      renderConnectionOverlay();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    selectedSpaceBoardId = boardId;
    if (board.type === "ai-image") {
      ensureAiImageBoardHeavyContent(boardElement);
    }
    syncAiImageBoardMobileActionToolbar("");

    const startRect = getSpaceBoardRect(board);

    spaceBoardDrag = {
      boardId,
      beforeState: captureConnectionsHistoryState(),
      didMove: false,
      dx: 0,
      dy: 0,
      placementBlockers: getSpaceBoardPlacementBlockers({
        excludeBoardId: boardId,
        gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
      }),
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startFootprint: getAiImageBoardFootprintRect(startRect),
      startRect,
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
  };

  Controller.prototype.cancelSpaceBoardDragForTouchNavigation = function cancelSpaceBoardDragForTouchNavigation(source = "space-board-touch-navigation-cancel") {
    with (this) {

    const state = spaceBoardDrag;

    if (!state) {
      return false;
    }

    try {
      state.sourceElement?.releasePointerCapture?.(state.pointerId);
    } catch (error) {
      // Pointer capture may already be released when the browser promotes the touch gesture.
    }

    cancelScheduledSpaceBoardDragRender();
    restoreConnectionsHistoryState(state.beforeState, source);
    return true;
    }
  };

  Controller.prototype.updateSpaceBoardDrag = function updateSpaceBoardDrag(event) {
    with (this) {

    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    if (
      event.pointerType === "touch" &&
      namespace.isTouchNavigationExclusive?.({ includeGuard: true })
    ) {
      cancelSpaceBoardDragForTouchNavigation();
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
      spaceBoardDrag.placementBlockers,
      spaceBoardDrag.startFootprint,
    );
    const dx = Number(constrained.dx) || 0;
    const dy = Number(constrained.dy) || 0;

    board.x = spaceBoardDrag.startX + dx;
    board.y = spaceBoardDrag.startY + dy;
    spaceBoardDrag.dx = dx;
    spaceBoardDrag.dy = dy;
    spaceBoardDrag.didMove = spaceBoardDrag.didMove || Boolean(dx || dy);
    scheduleSpaceBoardDragRender();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.finishSpaceBoardDrag = function finishSpaceBoardDrag(event) {
    with (this) {

    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    const state = spaceBoardDrag;

    spaceBoardDrag = null;
    removeSpaceBoardDragListeners();
    getStage()?.classList.remove("artboard-dragging");
    cancelScheduledSpaceBoardDragRender();

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
      renderConnectionOverlay();
    } else {
      renderConnectionOverlay();
    }

    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.addSpaceBoardDragListeners = function addSpaceBoardDragListeners() {
    with (this) {

    document.addEventListener("pointermove", updateSpaceBoardDrag, true);
    document.addEventListener("pointerup", finishSpaceBoardDrag, true);
    document.addEventListener("pointercancel", finishSpaceBoardDrag, true);
    }
  };

  Controller.prototype.removeSpaceBoardDragListeners = function removeSpaceBoardDragListeners() {
    with (this) {

    document.removeEventListener("pointermove", updateSpaceBoardDrag, true);
    document.removeEventListener("pointerup", finishSpaceBoardDrag, true);
    document.removeEventListener("pointercancel", finishSpaceBoardDrag, true);
    getStage()?.classList.remove("artboard-dragging");
    }
  };

  Controller.prototype.materializeAiImageBoardFromMenu = function materializeAiImageBoardFromMenu() {
    with (this) {

    const options = arguments[0] || {};
    const connection = getConnectionById(menuState?.connectionId);

    if (!connection && menuState?.detached === true) {
      const beforeState = captureConnectionsHistoryState();
      const board = createDetachedAiImageBoardFromMenu(options);

      dismissConnectionMenu({
        removeConnection: false,
        render: false,
      });

      if (!board) {
        renderConnectionOverlay();
        return;
      }

      pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-create-${board.id}`,
        source: "space-board-create-detached-ai-image",
        type: "space-board-create",
      });
      renderConnectionOverlay();
      return;
    }

    if (!connection) {
      dismissConnectionMenu({
        removeConnection: false,
      });
      return;
    }

    const beforeState = captureConnectionsHistoryState({
      excludeConnectionIds: [connection.id],
    });

    const board = createAiImageBoardForConnection(connection, options);
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
  };

  Controller.prototype.getDefaultConnectionEndPoint = function getDefaultConnectionEndPoint(sourceArtboardId) {
    with (this) {

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
  };

  Controller.prototype.updateConnectionDrag = function updateConnectionDrag(event) {
    with (this) {

    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const dx = event.clientX - connectionDrag.startClientX;
    const dy = event.clientY - connectionDrag.startClientY;
    const didMove = connectionDrag.didMove ||
      Math.hypot(dx, dy) >= CONNECTION_MIN_DRAG_CSS_PX;
    const hitBoard = didMove
      ? getConnectionDropTargetAtDocumentPoint(point, {
          includeOccupied: true,
          pointerType: event.pointerType || "",
        })
      : null;
    const isBlockedTarget = Boolean(hitBoard && isConnectionTargetBoardOccupied(hitBoard, {
      sourceConnection: connectionDrag,
    }));
    const targetBoard = isBlockedTarget ? null : hitBoard;
    const blockedBoard = isBlockedTarget ? hitBoard : null;
    const targetAnchor = targetBoard
      ? getAiImageBoardInputAnchor(targetBoard)
      : null;
    const blockedAnchor = blockedBoard
      ? getAiImageBoardInputAnchor(blockedBoard)
      : null;
    const snapAnchor = targetAnchor || blockedAnchor;

    connectionDrag.didMove = didMove;
    connectionDrag.endDocX = snapAnchor?.x ?? point.docX;
    connectionDrag.endDocY = snapAnchor?.y ?? point.docY;
    connectionDrag.targetBoardId = targetBoard?.id || "";
    connectionDrag.targetHandle = targetBoard ? "image-input" : "";
    connectionDrag.blockedTargetBoardId = blockedBoard?.id || "";
    setConnectionDropTargetBoard(targetBoard?.id || "", {
      blockedBoardId: blockedBoard?.id || "",
    });
    renderConnections();
    event.preventDefault();
    }
  };

  Controller.prototype.finishConnectionDrag = function finishConnectionDrag(event) {
    with (this) {

    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    updateConnectionDrag(event);

    const connection = connectionDrag;
    const sourceElement = connection.sourceElement;
    const isTextSource = isTextPromptConnection(connection);

    connectionDrag = null;
    getStage()?.classList.remove("connection-dragging", "text-connection-dragging");
    setConnectionDropTargetBoard("");
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
      : isTextSource
      ? null
      : getDefaultConnectionEndPoint(connection.sourceArtboardId);
    const finalizedConnection = {
      endDocX: defaultEnd?.x ?? connection.endDocX,
      endDocY: defaultEnd?.y ?? connection.endDocY,
      id: connection.id,
      sourceArtboardId: connection.sourceArtboardId || "",
      sourceBoardId: connection.sourceBoardId || "",
      sourceBoardType: connection.sourceBoardType || "",
    };
    const targetBoard = connection.targetBoardId
      ? getSpaceBoardById(connection.targetBoardId)
      : connection.didMove
      ? getConnectionDropTargetAtDocumentPoint({
          x: finalizedConnection.endDocX,
          y: finalizedConnection.endDocY,
        }, {
          sourceConnection: connection,
        })
      : null;

    if (connection.blockedTargetBoardId) {
      renderConnectionOverlay();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (targetBoard && connectToExistingAiImageBoard(finalizedConnection, targetBoard)) {
      const beforeState = captureConnectionsHistoryState();

      connections.push(finalizedConnection);
      pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-connect-${finalizedConnection.id}`,
        source: "space-board-connect-existing-ai-image",
        type: "space-board-connect",
      });
      renderConnectionOverlay();
      emitConnectionsChange("space-board-connect-existing-ai-image");
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isTextSource) {
      renderConnectionOverlay();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    connections.push(finalizedConnection);
    showConnectionMenu(finalizedConnection);

    renderConnections();
    renderConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.cancelConnectionDrag = function cancelConnectionDrag(event) {
    with (this) {

    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const sourceElement = connectionDrag.sourceElement;

    connectionDrag = null;
    getStage()?.classList.remove("connection-dragging", "text-connection-dragging");
    setConnectionDropTargetBoard("");
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
  };

  Controller.prototype.startTextPromptConnectionDrag = function startTextPromptConnectionDrag(event) {
    with (this) {

    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    const badge = event.currentTarget;
    const boardElement = badge?.closest?.("[data-space-text-board]");
    const sourceBoardId = String(boardElement?.dataset?.boardId || "").trim();
    const sourceBoard = getSpaceBoardById(sourceBoardId);
    const point = getEventDocumentPoint(event);

    if (!sourceBoardId || !point || !isTextPromptBoard(sourceBoard)) {
      return;
    }

    selectedSpaceBoardId = sourceBoardId;
    syncAiImageBoardMobileActionToolbar("");
    connectionDrag = {
      didMove: false,
      endDocX: point.docX,
      endDocY: point.docY,
      id: createConnectionId(),
      pointerId: event.pointerId,
      sourceBoardId,
      sourceBoardType: "text-prompt",
      sourceElement: badge,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };

    getStage()?.classList.add("connection-dragging", "text-connection-dragging");

    try {
      badge?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    document.addEventListener("pointermove", updateConnectionDrag, true);
    document.addEventListener("pointerup", finishConnectionDrag, true);
    document.addEventListener("pointercancel", cancelConnectionDrag, true);
    renderConnectionOverlay();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.startConnectionDrag = function startConnectionDrag(event) {
    with (this) {

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

    getStage()?.classList.add("connection-dragging");

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
  };

  Controller.prototype.renderActions = function renderActions() {
    with (this) {

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
    const renderedIds = new Set();
    const nextAnchorOverrides = new Map();

    lastRenderContext.artboardViews.forEach((view) => {
      if (!visibleArtboardIds.has(view.artboard.id)) {
        return;
      }

      const bubble = ensureActionBubble(view.artboard.id);
      const symmetryButton = ensureSymmetryButton(view.artboard.id);
      const symmetryLine = ensureSymmetryLine(view.artboard.id);

      if (!bubble) {
        return;
      }

      renderedIds.add(view.artboard.id);
      const { borderWidth, gap, iconSize, size } = getActionBubbleMetrics(
        scale,
        view.artboard.width,
        view.artboard.height,
      );
      const left = view.left + view.width + gap;
      const top = view.top + gap;
      const symmetryLeft = view.left - gap - size;
      const symmetryLineWidth = Math.max(1, borderWidth);
      const isSymmetryActive = namespace.isArtboardVerticalSymmetryEnabled?.(view.artboard.id) === true;

      nextAnchorOverrides.set(view.artboard.id, stagePointToDocumentPoint({
        x: left + size * 0.5,
        y: top + size * 0.5,
      }));

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.borderWidth = `${borderWidth}px`;
      bubble.style.setProperty("--artboard-action-icon-size", `${iconSize}px`);
      bubble.classList.add("is-visible");

      if (symmetryButton) {
        symmetryButton.style.left = `${symmetryLeft}px`;
        symmetryButton.style.top = `${top}px`;
        symmetryButton.style.width = `${size}px`;
        symmetryButton.style.height = `${size}px`;
        symmetryButton.style.borderWidth = `${borderWidth}px`;
        symmetryButton.style.setProperty("--artboard-action-icon-size", `${iconSize}px`);
        symmetryButton.classList.toggle("is-active", isSymmetryActive);
        symmetryButton.setAttribute("aria-pressed", isSymmetryActive ? "true" : "false");
        symmetryButton.classList.add("is-visible");
      }

      if (symmetryLine) {
        symmetryLine.style.left = `${view.left + view.width * 0.5 - symmetryLineWidth * 0.5}px`;
        symmetryLine.style.top = `${view.top}px`;
        symmetryLine.style.width = `${symmetryLineWidth}px`;
        symmetryLine.style.height = `${view.height}px`;
        symmetryLine.classList.toggle("is-visible", isSymmetryActive);
      }
    });

    anchorOverrides = nextAnchorOverrides;

    getStage()?.querySelectorAll("[data-artboard-action-bubble]").forEach((bubble) => {
      if (!renderedIds.has(bubble.dataset.artboardId || "")) {
        bubble.classList.remove("is-visible", "is-hovered");
      }
    });

    getStage()?.querySelectorAll("[data-artboard-symmetry-button]").forEach((button) => {
      if (!renderedIds.has(button.dataset.artboardId || "")) {
        button.classList.remove("is-visible", "is-hovered");
      }
    });

    getStage()?.querySelectorAll("[data-artboard-symmetry-line]").forEach((line) => {
      if (!renderedIds.has(line.dataset.artboardId || "")) {
        line.classList.remove("is-visible");
      }
    });
    }
  };

})(window.CBO);
