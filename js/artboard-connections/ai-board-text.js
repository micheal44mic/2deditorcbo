window.CBO = window.CBO || {};



(function registerAiBoardTextJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-text.js.");

  }



  Controller.prototype.handleAiImagePromptInput = function handleAiImagePromptInput(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);

    if (!board) {
      return;
    }

    setAiImageBoardPromptText(board, String(event.currentTarget?.value || ""), {
      emitSource: "space-board-prompt-input",
    });
    resizeAiImagePromptInput(event.currentTarget);
    }
  };

  Controller.prototype.handleAiImagePromptBlur = function handleAiImagePromptBlur(event) {
    with (this) {

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
  };

  Controller.prototype.focusAiImageCaptionEditor = function focusAiImageCaptionEditor(boardId, options = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId || !canEditAiImageCaption()) {
      return false;
    }

    selectedSpaceBoardId = normalizedBoardId;
    renderSpaceBoards();
    scheduleAiImagePromptFocusViewport(normalizedBoardId, { target: "caption" });

    window.requestAnimationFrame?.(() => {
      const element = Array.from(ensureSpaceBoardPane()?.querySelectorAll("[data-ai-image-board]") || [])
        .find((entry) => entry.dataset.boardId === normalizedBoardId) || null;
      const editor = element?.querySelector?.("[data-ai-image-board-caption-editor]");

      if (!editor) {
        return;
      }

      editor.focus({ preventScroll: true });

      if (options.select !== false) {
        const selection = window.getSelection?.();
        const range = document.createRange?.();

        if (selection && range) {
          range.selectNodeContents(editor);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        moveAiImageCaptionCaretToEnd(editor);
      }
    });

    return true;
    }
  };

  Controller.prototype.moveAiImageCaptionCaretToEnd = function moveAiImageCaptionCaretToEnd(editor) {
    with (this) {

    if (!editor) {
      return false;
    }

    const selection = window.getSelection?.();
    const range = document.createRange?.();

    if (!selection || !range) {
      return false;
    }

    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    keepAiImageCaptionCaretVisible(editor);
    return true;
    }
  };

  Controller.prototype.keepAiImageCaptionCaretVisible = function keepAiImageCaptionCaretVisible(editor) {
    with (this) {

    if (!editor) {
      return;
    }

    const scrollToBottom = () => {
      editor.scrollTop = editor.scrollHeight || 0;
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
    }
  };

  Controller.prototype.handleAiImageCaptionPointerDown = function handleAiImageCaptionPointerDown(event) {
    with (this) {

    event.stopPropagation();
    }
  };

  Controller.prototype.handleAiImageCaptionClick = function handleAiImageCaptionClick(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);

    event.preventDefault();
    event.stopPropagation();

    if (board && canEditAiImageCaption()) {
      focusAiImageCaptionEditor(board.id, { select: false });
    }
    }
  };

  Controller.prototype.handleAiImageCaptionFocus = function handleAiImageCaptionFocus(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);

    if (!board) {
      return;
    }

    if (!canEditAiImageCaption()) {
      event.currentTarget?.blur?.();
      renderSpaceBoards();
      return;
    }

    selectedSpaceBoardId = board.id;
    captionEditState = {
      beforeState: captureConnectionsHistoryState(),
      boardId: board.id,
      value: getAiImageBoardPromptText(board),
    };
    scheduleAiImagePromptFocusViewport(board.id, { target: "caption" });
    renderSpaceBoards();
    }
  };

  Controller.prototype.handleAiImageCaptionInput = function handleAiImageCaptionInput(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);

    if (!board) {
      return;
    }

    if (!canEditAiImageCaption()) {
      if (event.currentTarget) {
        event.currentTarget.textContent = String(board.captionText || "");
      }
      return;
    }

    setAiImageBoardPromptText(board, getAiImageCaptionEditorText(event.currentTarget), {
      emitSource: "space-board-caption-input",
    });
    keepAiImageCaptionCaretVisible(event.currentTarget);
    if (isMobilePromptFocusViewport()) {
      focusAiImagePromptBoard(board.id, { target: "caption" });
    }
    }
  };

  Controller.prototype.handleAiImageCaptionBlur = function handleAiImageCaptionBlur(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);
    const editState = captionEditState;

    captionEditState = null;

    if (!board || !editState || editState.boardId !== board.id) {
      renderSpaceBoards();
      return;
    }

    const nextValue = getAiImageCaptionEditorText(event.currentTarget);

    if (nextValue !== editState.value) {
      pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-caption-${board.id}`,
        source: "space-board-caption-input",
        type: "space-board-caption",
      });
    }

    renderSpaceBoards();
    }
  };

  Controller.prototype.getAiImageCaptionEditorText = function getAiImageCaptionEditorText(editor) {
    with (this) {

    return String(editor?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\n{4,}/g, "\n\n\n");
    }
  };

  Controller.prototype.canEditAiImageCaption = function canEditAiImageCaption() {
    with (this) {

    return !isMobileLikeSpaceBoardViewport();
    }
  };

  Controller.prototype.parseCssPixelValue = function parseCssPixelValue(value, fallback = 0) {
    with (this) {

    const number = Number.parseFloat(String(value || ""));

    return Number.isFinite(number) ? number : fallback;
    }
  };

  Controller.prototype.getAiImageCaptionMinHeightDoc = function getAiImageCaptionMinHeightDoc() {
    with (this) {

    return Math.max(
      AI_IMAGE_CAPTION_MIN_HEIGHT_DOC_PX,
      AI_IMAGE_CAPTION_LINE_HEIGHT_DOC_PX + AI_IMAGE_CAPTION_PADDING_Y_DOC_PX * 2,
    );
    }
  };

  Controller.prototype.getAiImageCaptionPreviewHeightDoc = function getAiImageCaptionPreviewHeightDoc() {
    with (this) {

    return Math.max(
      getAiImageCaptionMinHeightDoc(),
      AI_IMAGE_CAPTION_LINE_HEIGHT_DOC_PX * AI_IMAGE_CAPTION_PREVIEW_LINES +
        AI_IMAGE_CAPTION_PADDING_Y_DOC_PX * 2,
    );
    }
  };

  Controller.prototype.getAiImageCaptionMaxHeightDoc = function getAiImageCaptionMaxHeightDoc(boardHeight = this.AI_IMAGE_BOARD_SIZE_DOC_PX) {
    with (this) {

    const safeBoardHeight = Math.max(1, Number(boardHeight) || AI_IMAGE_BOARD_SIZE_DOC_PX);
    const availableHeight = safeBoardHeight - AI_IMAGE_CAPTION_INSET_DOC_PX * 2;

    return Math.max(getAiImageCaptionPreviewHeightDoc(), availableHeight);
    }
  };

  Controller.prototype.getAiImageCaptionStoredHeightDoc = function getAiImageCaptionStoredHeightDoc(element) {
    with (this) {

    const storedHeight = Number(element?.dataset?.aiCaptionHeightDoc || 0);

    return Number.isFinite(storedHeight) && storedHeight > 0
      ? storedHeight
      : getAiImageCaptionMinHeightDoc();
    }
  };

  Controller.prototype.syncAiImageCaptionHeight = function syncAiImageCaptionHeight(element, caption, measuredNode, shouldShow = true, allowGrowth = true) {
    with (this) {

    if (!element || !caption) {
      return false;
    }

    const computedStyle = window.getComputedStyle?.(caption);
    const minHeight = parseCssPixelValue(
      computedStyle?.getPropertyValue("--ai-caption-min-height"),
      caption.clientHeight || getAiImageCaptionMinHeightDoc(),
    );
    const maxHeight = Math.max(
      minHeight,
      parseCssPixelValue(computedStyle?.getPropertyValue("--ai-caption-max-height"), minHeight),
    );
    const contentHeight = shouldShow && measuredNode
      ? Math.ceil(measuredNode.scrollHeight || minHeight)
      : minHeight;
    const previewHeight = Math.min(
      maxHeight,
      Math.max(
        minHeight,
        parseCssPixelValue(computedStyle?.getPropertyValue("--ai-caption-preview-height"), minHeight),
      ),
    );
    const nextHeight = allowGrowth
      ? Math.min(maxHeight, Math.max(previewHeight, contentHeight))
      : previewHeight;
    const viewScale = Math.max(0.0001, getViewScale());

    setCssVarIfChanged(element, "--ai-caption-height", `${nextHeight}px`);
    element.dataset.aiCaptionHeightDoc = String(roundMetricValue(nextHeight / viewScale, 3));
    caption.classList.toggle("is-overflowing", contentHeight > maxHeight + 1);

    return true;
    }
  };

  Controller.prototype.updateAiImageCaptionControls = function updateAiImageCaptionControls(element, board, isSelected = false) {
    with (this) {

    const caption = ensureAiImageBoardCaptionControls(element);

    if (!caption || !board) {
      return false;
    }

    const text = String(board.captionText || "");
    const hasCaption = text.trim().length > 0;
    const textNode = caption.querySelector("[data-ai-image-board-caption-text]");
    const editor = caption.querySelector("[data-ai-image-board-caption-editor]");
    const canEditCaption = isSelected && canEditAiImageCaption();
    const shouldShow = canEditCaption || hasCaption;

    caption.hidden = !shouldShow;
    element.classList.toggle("has-caption", hasCaption);
    element.classList.toggle("is-caption-editing", canEditCaption);
    element.classList.remove("is-caption-lod-hidden");

    if (textNode) {
      textNode.textContent = text;
    }

    if (editor) {
      if (document.activeElement !== editor) {
        editor.textContent = text;
      }

      editor.tabIndex = canEditCaption ? 0 : -1;
      editor.contentEditable = canEditCaption ? "plaintext-only" : "false";
      editor.dataset.placeholder = AI_IMAGE_CAPTION_PLACEHOLDER;
      editor.setAttribute("aria-hidden", canEditCaption ? "false" : "true");
      editor.setAttribute("aria-multiline", "true");
    }

    window.requestAnimationFrame?.(() => {
      const measuredNode = isSelected ? editor : textNode;

      syncAiImageCaptionHeight(element, caption, measuredNode, shouldShow, isSelected);
    });

    return true;
    }
  };

  Controller.prototype.isMobilePromptFocusViewport = function isMobilePromptFocusViewport() {
    with (this) {

    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900 ||
      document.documentElement?.classList.contains("cbo-visual-keyboard-active")
    );
    }
  };

  Controller.prototype.clearPromptFocusViewportTimers = function clearPromptFocusViewportTimers() {
    with (this) {

    promptFocusViewportTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    promptFocusViewportTimers = [];
    }
  };

  Controller.prototype.scheduleAiImagePromptFocusViewport = function scheduleAiImagePromptFocusViewport(boardId, options = {}) {
    with (this) {

    if (!isMobilePromptFocusViewport()) {
      return;
    }

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return;
    }

    clearPromptFocusViewportTimers();
    focusAiImagePromptBoard(normalizedBoardId, options);
    [80, 260, 520, 900, 1300].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        focusAiImagePromptBoard(normalizedBoardId, options);
        window.scrollTo?.(0, 0);
      }, delay);

      promptFocusViewportTimers.push(timerId);
    });
    }
  };

  Controller.prototype.getVisibleViewportRectCss = function getVisibleViewportRectCss(stage, stageRect) {
    with (this) {

    const visualViewport = window.visualViewport;
    const left = Math.max(0, Number(visualViewport?.offsetLeft) || 0);
    const top = Math.max(0, Number(visualViewport?.offsetTop) || 0);
    const width = Math.max(1, visualViewport?.width || window.innerWidth || stage.clientWidth || stageRect.width || 1);
    const height = Math.max(1, visualViewport?.height || window.innerHeight || stage.clientHeight || stageRect.height || 1);

    return {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
    };
    }
  };

  Controller.prototype.getVisibleFixedElementRect = function getVisibleFixedElementRect(selector) {
    with (this) {

    const element = document.querySelector(selector);
    const rect = element?.getBoundingClientRect?.();

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const style = window.getComputedStyle?.(element);

    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) {
      return null;
    }

    return rect;
    }
  };

  Controller.prototype.getAiImageMobileFocusBand = function getAiImageMobileFocusBand(stage, stageRect, isCaptionTarget = false) {
    with (this) {

    const viewportRect = getVisibleViewportRectCss(stage, stageRect);
    const stageTop = Number(stageRect.top) || 0;
    const viewportTopInStage = Math.max(0, viewportRect.top - stageTop);
    const viewportBottomInStage = Math.max(viewportTopInStage + 1, viewportRect.bottom - stageTop);
    const topGap = isCaptionTarget ? AI_IMAGE_CAPTION_FOCUS_TOP_GAP_CSS_PX : AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX;
    let top = viewportTopInStage + topGap;
    let bottom = viewportBottomInStage - (
      isCaptionTarget ? AI_IMAGE_CAPTION_FOCUS_BOTTOM_GAP_CSS_PX : AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX
    );

    [
      ".top-toolbar-dock",
      ".brush-quick-controls:not([hidden])",
    ].forEach((selector) => {
      const rect = getVisibleFixedElementRect(selector);

      if (rect && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
        top = Math.max(top, rect.bottom - stageTop + topGap);
      }
    });

    [
      ".toolbar-dock",
      ".mobile-text-panel:not([hidden])",
      ".mobile-layer-effects-panel:not([hidden])",
      ".area-selection-operation-toolbar",
      ".transform-mode-toolbar",
      ".text-add-toolbar:not([hidden])",
    ].forEach((selector) => {
      const rect = getVisibleFixedElementRect(selector);

      if (rect && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
        bottom = Math.min(bottom, rect.top - stageTop - (
          isCaptionTarget ? AI_IMAGE_CAPTION_FOCUS_BOTTOM_GAP_CSS_PX : AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX
        ));
      }
    });

    if (bottom <= top + 24) {
      top = Math.max(0, viewportTopInStage + topGap);
      bottom = Math.max(top + 24, viewportBottomInStage - (
        isCaptionTarget ? AI_IMAGE_CAPTION_FOCUS_BOTTOM_GAP_CSS_PX : AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX
      ));
    }

    return {
      bottom,
      height: Math.max(1, bottom - top),
      top,
    };
    }
  };

  Controller.prototype.getAiImageMobileTargetTopCss = function getAiImageMobileTargetTopCss(targetScreenHeight, focusBand, isCaptionTarget = false) {
    with (this) {

    const targetHeight = Math.max(1, Number(targetScreenHeight) || 1);
    const availableHeight = Math.max(1, focusBand.height);
    const maxTop = Math.max(focusBand.top, focusBand.bottom - Math.min(targetHeight, availableHeight));

    if (!isCaptionTarget) {
      return Math.min(maxTop, Math.max(focusBand.top, AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX));
    }

    const availableTravel = Math.max(0, availableHeight - Math.min(targetHeight, availableHeight));
    const preferredTop = focusBand.top + availableTravel * AI_IMAGE_CAPTION_FOCUS_VERTICAL_RATIO;

    return Math.min(maxTop, Math.max(focusBand.top, preferredTop));
    }
  };

  Controller.prototype.focusAiImagePromptBoard = function focusAiImagePromptBoard(boardId, options = {}) {
    with (this) {

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
    const boardWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const isCaptionTarget = options.target === "caption";
    const captionElement = isCaptionTarget
      ? getSpaceBoardElement(board.id)?.querySelector?.("[data-ai-image-board-caption]")
      : null;
    const captionHeightCss = Number.parseFloat(
      captionElement ? window.getComputedStyle?.(captionElement)?.height || "" : "",
    );
    const captionHeightDoc = Math.min(
      getAiImageCaptionMaxHeightDoc(boardHeight),
      Math.max(
        getAiImageCaptionMinHeightDoc(),
        Number.isFinite(captionHeightCss) && captionHeightCss > 0
          ? captionHeightCss / Math.max(0.0001, getViewScale())
          : getAiImageCaptionStoredHeightDoc(getSpaceBoardElement(board.id)),
      ),
    );
    const targetDocHeight = isCaptionTarget ? captionHeightDoc : boardHeight;
    const targetTopY = isCaptionTarget
      ? (Number(board.y) || 0) + Math.max(0, boardHeight - AI_IMAGE_CAPTION_INSET_DOC_PX - captionHeightDoc)
      : Number(board.y) || 0;
    const targetScreenHeight = targetDocHeight * zoom / dpr;
    const focusBand = getAiImageMobileFocusBand(stage, stageRect, isCaptionTarget);
    const targetTopCss = getAiImageMobileTargetTopCss(targetScreenHeight, focusBand, isCaptionTarget);
    const boardCenterX = (Number(board.x) || 0) + boardWidth * 0.5;
    const nextCameraX = viewportWidthCss * 0.5 * dpr - boardCenterX * zoom;
    const nextCameraY = targetTopCss * dpr - targetTopY * zoom;

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
  };

  Controller.prototype.resizeAiImagePromptInput = function resizeAiImagePromptInput(input) {
    with (this) {

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
  };

})(window.CBO);
