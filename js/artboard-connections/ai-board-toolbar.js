window.CBO = window.CBO || {};



(function registerAiBoardToolbarJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-toolbar.js.");

  }



  Controller.prototype.handleAiImageBoardPointerDown = function handleAiImageBoardPointerDown(event) {
    with (this) {

    const boardId = String(event.target?.closest?.("[data-space-board], [data-ai-image-board], [data-space-text-board]")?.dataset?.boardId || "").trim();

    if (!boardId || selectedSpaceBoardId === boardId) {
      return;
    }

    selectedSpaceBoardId = boardId;
    renderSpaceBoards();
    }
  };

  Controller.prototype.handleDocumentSpaceBoardSelectionPointerDown = function handleDocumentSpaceBoardSelectionPointerDown(event) {
    with (this) {

    if (
      !selectedSpaceBoardId ||
      event.target?.closest?.("[data-space-board], [data-ai-image-board], [data-space-text-board], [data-ai-image-board-action-toolbar], [data-text-prompt-toolbar], [data-text-prompt-focus-overlay], [data-ai-image-enlarge-viewer], [data-ai-image-edit-preview-viewer]")
    ) {
      return;
    }

    selectedSpaceBoardId = "";
    renderSpaceBoards();
    }
  };

  Controller.prototype.shouldStartSpaceBoardDragFromEvent = function shouldStartSpaceBoardDragFromEvent(event) {
    with (this) {

    const target = event.target;

    if (!target?.closest) {
      return true;
    }

    return !target.closest([
      "[data-ai-image-board-action-toolbar]",
      "[data-ai-image-board-caption]",
      "[data-ai-image-board-footer]",
      "[data-ai-image-board-generate]",
      "[data-ai-image-board-prompt-input]",
      "[data-text-prompt-editor]",
      "[data-text-prompt-toolbar]",
      "[data-text-prompt-resize]",
      "[contenteditable]",
      "button",
      "input",
      "textarea",
      "select",
    ].join(","));
    }
  };

  Controller.prototype.ensureAiImageBoardActionToolbar = function ensureAiImageBoardActionToolbar(element) {
    with (this) {

    if (!element) {
      return null;
    }

    let toolbar = element.querySelector("[data-ai-image-board-action-toolbar]");

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "editor-ai-image-board-action-toolbar";
      toolbar.dataset.aiImageBoardActionToolbar = "";
      toolbar.setAttribute("aria-hidden", "true");
      toolbar.innerHTML = getAiImageBoardActionToolbarMarkup();
      element.prepend(toolbar);
    }

    if (
      !toolbar.querySelector("[data-ai-image-board-toolbar-action]") ||
      !toolbar.querySelector('[data-ai-image-board-toolbar-action="edit-preview"]') ||
      !toolbar.querySelector('[data-ai-image-board-toolbar-action="video-mute"]')
    ) {
      toolbar.innerHTML = getAiImageBoardActionToolbarMarkup();
    }

    bindAiImageBoardActionToolbar(toolbar);
    return toolbar;
    }
  };

  Controller.prototype.getAiImageBoardActionToolbarMarkup = function getAiImageBoardActionToolbarMarkup() {
    with (this) {

    return `
      <div class="editor-ai-image-board-action-toolbar-items" data-ai-image-board-action-toolbar-items>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" aria-label="Enlarge" data-ai-image-board-toolbar-action="fullscreen" data-ai-image-board-toolbar-label="Enlarge">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fullscreen-icon lucide-fullscreen" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
            <rect width="10" height="8" x="7" y="8" rx="1"></rect>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" aria-label="Create with AI" data-ai-image-board-toolbar-action="edit-preview" data-ai-image-board-toolbar-label="Create with AI">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-astroid-icon lucide-astroid" aria-hidden="true">
            <path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203"></path>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button is-muted" type="button" aria-label="Unmute video" data-ai-image-board-toolbar-action="video-mute" data-ai-image-board-toolbar-label="Unmute" hidden>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-off-icon lucide-volume-off" aria-hidden="true">
            <path d="M16 9a5 5 0 0 1 .95 2.293"></path>
            <path d="M19.364 5.636a9 9 0 0 1 1.889 9.96"></path>
            <path d="m2 2 20 20"></path>
            <path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11"></path>
            <path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686"></path>
          </svg>
        </button>
        <span class="editor-ai-image-board-action-toolbar-separator" aria-hidden="true"></span>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" aria-label="Duplicate" data-ai-image-board-toolbar-action="duplicate" data-ai-image-board-toolbar-label="Duplicate">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy" aria-hidden="true">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" aria-label="Delete" data-ai-image-board-toolbar-action="delete" data-ai-image-board-toolbar-label="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2" aria-hidden="true">
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            <path d="M3 6h18"></path>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
    }
  };

  Controller.prototype.bindAiImageBoardActionToolbar = function bindAiImageBoardActionToolbar(toolbar) {
    with (this) {

    if (!toolbar || toolbar.dataset.actionToolbarBound === "true") {
      return;
    }

    toolbar.dataset.actionToolbarBound = "true";
    toolbar.addEventListener("pointerdown", stopSpaceBoardControlEvent, true);
    toolbar.addEventListener("click", handleAiImageBoardActionToolbarClick);
    }
  };

  Controller.prototype.ensureAiImageBoardMobileActionToolbar = function ensureAiImageBoardMobileActionToolbar() {
    with (this) {

    if (mobileActionToolbar?.isConnected) {
      if (!mobileActionToolbar.querySelector('[data-ai-image-board-toolbar-action="video-mute"]')) {
        mobileActionToolbar.innerHTML = getAiImageBoardActionToolbarMarkup();
      }

      return mobileActionToolbar;
    }

    mobileActionToolbar?.remove();
    mobileActionToolbar = document.createElement("div");
    mobileActionToolbar.className = "editor-ai-image-board-mobile-action-toolbar";
    mobileActionToolbar.dataset.aiImageBoardActionToolbar = "";
    mobileActionToolbar.setAttribute("data-ai-image-board-mobile-action-toolbar", "");
    mobileActionToolbar.setAttribute("aria-hidden", "true");
    mobileActionToolbar.innerHTML = getAiImageBoardActionToolbarMarkup();
    bindAiImageBoardActionToolbar(mobileActionToolbar);
    document.body.appendChild(mobileActionToolbar);

    return mobileActionToolbar;
    }
  };

  Controller.prototype.syncAiImageBoardMobileActionToolbar = function syncAiImageBoardMobileActionToolbar(boardId = "") {
    with (this) {

    const toolbar = ensureAiImageBoardMobileActionToolbar();
    const normalizedBoardId = String(boardId || "").trim();

    if (!toolbar) {
      return;
    }

    toolbar.dataset.boardId = normalizedBoardId;
    toolbar.classList.toggle("is-active", Boolean(normalizedBoardId));
    toolbar.setAttribute("aria-hidden", normalizedBoardId ? "false" : "true");
    updateAiImageBoardActionToolbarState(toolbar, getSpaceBoardById(normalizedBoardId));
    }
  };

  Controller.prototype.updateAiImageBoardActionToolbarState = function updateAiImageBoardActionToolbarState(toolbar, board) {
    with (this) {

    const fullscreenButton = toolbar?.querySelector?.('[data-ai-image-board-toolbar-action="fullscreen"]');
    const editPreviewButton = toolbar?.querySelector?.('[data-ai-image-board-toolbar-action="edit-preview"]');
    const videoMuteButton = toolbar?.querySelector?.('[data-ai-image-board-toolbar-action="video-mute"]');
    const duplicateButton = toolbar?.querySelector?.('[data-ai-image-board-toolbar-action="duplicate"]');
    const deleteButton = toolbar?.querySelector?.('[data-ai-image-board-toolbar-action="delete"]');
    const canEnlarge = Boolean(getAiImageBoardEnlargeMedia(board));
    const canEditPreview = Boolean(getAiImageBoardEditPreviewMedia(board));
    const canMuteVideo = typeof isAiImageBoardVideoMuteAvailable === "function" &&
      Boolean(isAiImageBoardVideoMuteAvailable(board));
    const hasBoard = Boolean(board);

    setAiImageBoardToolbarButtonEnabled(fullscreenButton, canEnlarge);
    setAiImageBoardToolbarButtonEnabled(editPreviewButton, canEditPreview);
    if (videoMuteButton) {
      const muted = board?.videoMuted !== false;

      videoMuteButton.hidden = !canMuteVideo;
      videoMuteButton.setAttribute("aria-hidden", canMuteVideo ? "false" : "true");
      videoMuteButton.classList.toggle("is-muted", muted);
      videoMuteButton.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
      videoMuteButton.dataset.aiImageBoardToolbarLabel = muted ? "Unmute" : "Mute";
      videoMuteButton.innerHTML = typeof getAiImageBoardVideoMuteIconMarkup === "function"
        ? getAiImageBoardVideoMuteIconMarkup(muted)
        : videoMuteButton.innerHTML;
      setAiImageBoardToolbarButtonEnabled(videoMuteButton, canMuteVideo);
    }

    setAiImageBoardToolbarButtonEnabled(duplicateButton, hasBoard);
    setAiImageBoardToolbarButtonEnabled(deleteButton, hasBoard);
    }
  };

  Controller.prototype.updateAiImageBoardActionToolbarPlacement = function updateAiImageBoardActionToolbarPlacement(element, isSelected = false) {
    with (this) {

    if (!element) {
      return false;
    }

    if (!isSelected || isMobileLikeSpaceBoardViewport()) {
      element.classList.remove("is-action-toolbar-below");
      return false;
    }

    const toolbar = element.querySelector("[data-ai-image-board-action-toolbar]");
    const boardRect = element.getBoundingClientRect?.();

    if (!toolbar || !boardRect) {
      element.classList.remove("is-action-toolbar-below");
      return false;
    }

    const elementStyle = window.getComputedStyle?.(element);
    const labelTop = parseCssPixelValue(
      elementStyle?.getPropertyValue("--editor-artboard-label-top"),
      -25,
    );
    const toolbarHeight = Math.max(1, toolbar.getBoundingClientRect?.().height || 32);
    const aboveTop = boardRect.top + labelTop - 50;
    const belowTop = boardRect.bottom + 14;
    const bounds = getAiImageBoardActionToolbarViewportBounds();
    const shouldFlipBelow = aboveTop < bounds.top && belowTop + toolbarHeight <= bounds.bottom;

    element.classList.toggle("is-action-toolbar-below", shouldFlipBelow);
    return shouldFlipBelow;
    }
  };

  Controller.prototype.getAiImageBoardActionToolbarViewportBounds = function getAiImageBoardActionToolbarViewportBounds() {
    with (this) {

    const visualViewport = window.visualViewport;
    const viewportTop = Number(visualViewport?.offsetTop) || 0;
    const viewportHeight = Math.max(1, Number(visualViewport?.height || window.innerHeight || 1));
    let top = viewportTop + 8;
    let bottom = viewportTop + viewportHeight - 8;

    [
      ".top-toolbar-dock",
      ".brush-quick-controls:not([hidden])",
    ].forEach((selector) => {
      const rect = getVisibleFixedElementRect(selector);

      if (rect) {
        top = Math.max(top, rect.bottom + 8);
      }
    });

    [
      ".toolbar-dock",
      ".area-selection-operation-toolbar",
      ".transform-mode-toolbar",
      ".text-add-toolbar:not([hidden])",
    ].forEach((selector) => {
      const rect = getVisibleFixedElementRect(selector);

      if (rect) {
        bottom = Math.min(bottom, rect.top - 8);
      }
    });

    return {
      bottom: Math.max(top + 1, bottom),
      top,
    };
    }
  };

  Controller.prototype.setAiImageBoardToolbarButtonEnabled = function setAiImageBoardToolbarButtonEnabled(button, enabled) {
    with (this) {

    if (!button) {
      return;
    }

    button.disabled = !enabled;
    button.setAttribute("aria-disabled", enabled ? "false" : "true");
    }
  };

  Controller.prototype.handleAiImageBoardActionToolbarClick = function handleAiImageBoardActionToolbarClick(event) {
    with (this) {

    const actionButton = event.target?.closest?.("[data-ai-image-board-toolbar-action]");

    stopSpaceBoardControlEvent(event);

    if (!actionButton) {
      return;
    }

    event.preventDefault();

    if (actionButton.disabled) {
      return;
    }

    const action = actionButton.dataset.aiImageBoardToolbarAction;

    const toolbar = actionButton.closest("[data-ai-image-board-action-toolbar]");
    const boardId = String(
      actionButton.closest("[data-ai-image-board]")?.dataset?.boardId ||
      toolbar?.dataset?.boardId ||
      ""
    ).trim();

    if (action === "fullscreen") {
      openAiImageBoardEnlargeViewer(boardId);
    } else if (action === "edit-preview") {
      openAiImageBoardEditPreview(boardId);
    } else if (action === "video-mute") {
      if (typeof toggleAiImageBoardVideoMuted === "function") {
        toggleAiImageBoardVideoMuted(boardId);
      }
    } else if (action === "duplicate") {
      duplicateAiImageBoard(boardId);
    } else if (action === "delete") {
      deleteAiImageBoard(boardId);
    }
    }
  };

  Controller.prototype.isAiImageBoardEnlargeViewportAllowed = function isAiImageBoardEnlargeViewportAllowed() {
    with (this) {

    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);

    return viewportWidth >= AI_IMAGE_ENLARGE_MIN_VIEWPORT_PX;
    }
  };

})(window.CBO);
