window.CBO = window.CBO || {};



(function registerConnectionDomJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before connection-dom.js.");

  }



  Controller.prototype.ensureConnectionMenu = function ensureConnectionMenu() {
    with (this) {

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
          materializeAiImageBoardFromMenu({ generationKind: "image" });
        } else if (action === "ai-video") {
          materializeAiImageBoardFromMenu({ generationKind: "video" });
        }
      });
      stage.appendChild(menu);
    }

    return menu;
    }
  };

  Controller.prototype.getActionAnchorPoint = function getActionAnchorPoint(artboard) {
    with (this) {

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
        (Number(artboard.width) || 0),
      y: Number(artboard.y) || 0,
    };
    }
  };

  Controller.prototype.getSpaceBoardById = function getSpaceBoardById(boardId) {
    with (this) {

    const normalizedId = String(boardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return spaceBoards.find((board) => board.id === normalizedId) || null;
    }
  };

  Controller.prototype.getSpaceBoardRect = function getSpaceBoardRect(board) {
    with (this) {

    return board
      ? createRect(board.x, board.y, board.width || AI_IMAGE_BOARD_SIZE_DOC_PX, board.height || AI_IMAGE_BOARD_SIZE_DOC_PX)
      : null;
    }
  };

  Controller.prototype.getSpaceBoardVisibleDocumentRect = function getSpaceBoardVisibleDocumentRect(marginDocPx = 0) {
    with (this) {

    const stage = getStage();

    if (!stage) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const rect = stage.getBoundingClientRect?.() || { width: 1, height: 1 };
    const viewportWidthCss = Math.max(1, Number(stage.clientWidth || rect.width) || 1);
    const viewportHeightCss = Math.max(1, Number(stage.clientHeight || rect.height) || 1);
    const margin = Math.max(0, Number(marginDocPx) || 0);
    const left = (0 - (Number(camera.x) || 0)) / zoom;
    const top = (0 - (Number(camera.y) || 0)) / zoom;
    const width = (viewportWidthCss * dpr) / zoom;
    const height = (viewportHeightCss * dpr) / zoom;

    return createRect(
      left - margin,
      top - margin,
      width + margin * 2,
      height + margin * 2,
    );
    }
  };

  Controller.prototype.getSpaceBoardLazyMarginDocPx = function getSpaceBoardLazyMarginDocPx() {
    with (this) {

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return (SPACE_BOARD_LAZY_OVERSCAN_CSS_PX * dpr) / zoom;
    }
  };

  Controller.prototype.isSpaceBoardNearViewport = function isSpaceBoardNearViewport(board, marginDocPx = this.getSpaceBoardLazyMarginDocPx()) {
    with (this) {

    const boardRect = getSpaceBoardRect(board);
    const viewportRect = getSpaceBoardVisibleDocumentRect(marginDocPx);

    return Boolean(boardRect && viewportRect && rectsOverlap(boardRect, viewportRect));
    }
  };

  Controller.prototype.isMobileLikeSpaceBoardViewport = function isMobileLikeSpaceBoardViewport() {
    with (this) {

    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900
    );
    }
  };

  Controller.prototype.getSpaceBoardMinScreenSize = function getSpaceBoardMinScreenSize(board) {
    with (this) {

    const rect = getSpaceBoardRect(board);
    const scale = getViewScale();

    return rect ? Math.min(rect.width, rect.height) * scale : 0;
    }
  };

  Controller.prototype.isSpaceBoardFocusedOrSelected = function isSpaceBoardFocusedOrSelected(board, element) {
    with (this) {

    const boardId = String(board?.id || "").trim();
    const focusedBoardId = String(document.activeElement?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    return Boolean(
      boardId &&
      (
        boardId === selectedSpaceBoardId ||
        boardId === focusedBoardId ||
        boardId === String(spaceBoardDrag?.boardId || "").trim() ||
        aiImageGeneratingBoardIds.has(boardId) ||
        element?.matches?.(":focus-within")
      )
    );
    }
  };

  Controller.prototype.shouldUnloadAiBoardMedia = function shouldUnloadAiBoardMedia(board, visibilityState, element) {
    with (this) {

    return visibilityState !== "visible" && !isSpaceBoardFocusedOrSelected(board, element);
    }
  };

  Controller.prototype.shouldMountAiImageBoardHeavyContent = function shouldMountAiImageBoardHeavyContent(board, element) {
    with (this) {

    if (!board) {
      return false;
    }

    if (isSpaceBoardFocusedOrSelected(board, element)) {
      return true;
    }

    if (!isSpaceBoardNearViewport(board)) {
      return false;
    }

    return !isMobileLikeSpaceBoardViewport() ||
      getSpaceBoardMinScreenSize(board) >= SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX;
    }
  };

})(window.CBO);
