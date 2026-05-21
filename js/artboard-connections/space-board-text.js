window.CBO = window.CBO || {};

(function registerSpaceBoardTextJs(namespace) {
  const Controller = namespace.ArtboardConnectionsController;

  if (!Controller) {
    throw new Error("ArtboardConnectionsController must be loaded before space-board-text.js.");
  }

  const TEXT_PROMPT_BOARD_TYPE = "text-prompt";
  const TEXT_PROMPT_BOARD_SELECTOR = "[data-space-text-board]";
  const TEXT_PROMPT_EDITOR_SELECTOR = "[data-text-prompt-editor]";
  const TEXT_PROMPT_TRANSPARENT_BACKGROUND = "transparent";
  const TEXT_PROMPT_ALLOWED_TAGS = new Set([
    "B",
    "BR",
    "DIV",
    "EM",
    "H1",
    "H2",
    "H3",
    "I",
    "LI",
    "OL",
    "P",
    "STRONG",
    "UL",
  ]);

  Controller.prototype.isTextPromptBoard = function isTextPromptBoard(board) {
    with (this) {

    return board?.type === TEXT_PROMPT_BOARD_TYPE || board?.type === "text-note";
    }
  };

  Controller.prototype.getSpaceBoardDomSelector = function getSpaceBoardDomSelector() {
    with (this) {

    return "[data-space-board], [data-ai-image-board], [data-space-text-board]";
    }
  };

  Controller.prototype.createTextPromptBoardId = function createTextPromptBoardId() {
    with (this) {

    const id = `text-prompt-board-${Date.now().toString(36)}-${boardIdSeed}`;
    boardIdSeed += 1;
    return id;
    }
  };

  Controller.prototype.getTextPromptBoardElement = function getTextPromptBoardElement(boardId) {
    with (this) {

    const pane = ensureSpaceBoardPane();
    const normalizedBoardId = String(boardId || "").trim();

    if (!pane || !normalizedBoardId) {
      return null;
    }

    return Array.from(pane.querySelectorAll(TEXT_PROMPT_BOARD_SELECTOR))
      .find((element) => element.dataset.boardId === normalizedBoardId) || null;
    }
  };

  Controller.prototype.normalizeTextPromptColor = function normalizeTextPromptColor(value, fallback = TEXT_PROMPT_TEXT_COLOR) {
    with (this) {

    const color = String(value || "").trim();
    const safeFallback = /^#[0-9a-f]{6}$/i.test(String(fallback || "")) ? String(fallback).toLowerCase() : "#15171c";

    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return color.toLowerCase();
    }

    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((part) => `${part}${part}`).join("")}`.toLowerCase();
    }

    return safeFallback;
    }
  };

  Controller.prototype.normalizeTextPromptBackgroundColor = function normalizeTextPromptBackgroundColor(value) {
    with (this) {

    const color = String(value || "").trim().toLowerCase();

    if (color === TEXT_PROMPT_TRANSPARENT_BACKGROUND || color === "none") {
      return TEXT_PROMPT_TRANSPARENT_BACKGROUND;
    }

    return normalizeTextPromptColor(color, TEXT_PROMPT_BACKGROUND_COLOR);
    }
  };

  Controller.prototype.escapeTextPromptHtml = function escapeTextPromptHtml(value) {
    with (this) {

    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    }
  };

  Controller.prototype.unwrapTextPromptNode = function unwrapTextPromptNode(node) {
    with (this) {

    if (!node?.parentNode) {
      return;
    }

    while (node.firstChild) {
      node.parentNode.insertBefore(node.firstChild, node);
    }

    node.remove();
    }
  };

  Controller.prototype.replaceTextPromptTag = function replaceTextPromptTag(node, tagName) {
    with (this) {

    if (!node?.parentNode) {
      return null;
    }

    const replacement = document.createElement(tagName);

    while (node.firstChild) {
      replacement.appendChild(node.firstChild);
    }

    node.replaceWith(replacement);
    return replacement;
    }
  };

  Controller.prototype.cleanTextPromptNode = function cleanTextPromptNode(node) {
    with (this) {

    if (!node) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }

    Array.from(node.childNodes).forEach(cleanTextPromptNode);

    const tagName = String(node.tagName || "").toUpperCase();

    if (!TEXT_PROMPT_ALLOWED_TAGS.has(tagName)) {
      unwrapTextPromptNode(node);
      return;
    }

    Array.from(node.attributes || []).forEach((attribute) => {
      node.removeAttribute(attribute.name);
    });

    if (tagName === "B") {
      replaceTextPromptTag(node, "strong");
    } else if (tagName === "I") {
      replaceTextPromptTag(node, "em");
    } else if (tagName === "DIV") {
      replaceTextPromptTag(node, "p");
    }
    }
  };

  Controller.prototype.sanitizeTextPromptHtml = function sanitizeTextPromptHtml(value) {
    with (this) {

    const template = document.createElement("template");

    template.innerHTML = String(value || "");
    Array.from(template.content.childNodes).forEach(cleanTextPromptNode);

    const html = template.innerHTML.trim();

    if (!html || html === "<br>") {
      return "<p></p>";
    }

    return html;
    }
  };

  Controller.prototype.getTextPromptBoardHtml = function getTextPromptBoardHtml(board) {
    with (this) {

    const html = String(board?.html || board?.contentHtml || "").trim();

    return sanitizeTextPromptHtml(html || TEXT_PROMPT_DEFAULT_HTML);
    }
  };

  Controller.prototype.setTextPromptBoardHtml = function setTextPromptBoardHtml(board, html, options = {}) {
    with (this) {

    if (!board || !isTextPromptBoard(board)) {
      return false;
    }

    const nextHtml = sanitizeTextPromptHtml(html);

    if (board.html === nextHtml) {
      return false;
    }

    board.html = nextHtml;
    board.contentHtml = nextHtml;

    if (options.emit !== false) {
      emitConnectionsChange(options.emitSource || "text-prompt-input");
    }

    return true;
    }
  };

  Controller.prototype.normalizeTextPromptFontSizeDoc = function normalizeTextPromptFontSizeDoc(value) {
    with (this) {

    const fallback = Number(TEXT_PROMPT_FONT_SIZE_DOC_PX) || 14;
    const min = Math.max(1, Number(TEXT_PROMPT_FONT_SIZE_MIN_DOC_PX) || 10);
    const max = Math.max(min, Number(TEXT_PROMPT_FONT_SIZE_MAX_DOC_PX) || 72);
    const number = Number(value);
    const next = Number.isFinite(number) ? number : fallback;

    return Math.min(max, Math.max(min, Math.round(next * 10) / 10));
    }
  };

  Controller.prototype.getTextPromptBoardFontSizeDoc = function getTextPromptBoardFontSizeDoc(board) {
    with (this) {

    return normalizeTextPromptFontSizeDoc(board?.fontSizeDoc ?? board?.fontSize);
    }
  };

  Controller.prototype.setTextPromptBoardFontSizeDoc = function setTextPromptBoardFontSizeDoc(board, fontSizeDoc, options = {}) {
    with (this) {

    if (!board || !isTextPromptBoard(board)) {
      return false;
    }

    const nextFontSize = normalizeTextPromptFontSizeDoc(fontSizeDoc);

    if (getTextPromptBoardFontSizeDoc(board) === nextFontSize && Number(board.fontSizeDoc) === nextFontSize) {
      return false;
    }

    board.fontSizeDoc = nextFontSize;
    board.fontSize = nextFontSize;

    if (options.emit !== false) {
      emitConnectionsChange(options.emitSource || "text-prompt-font-size");
    }

    return true;
    }
  };

  Controller.prototype.getTextPromptBoardTextColor = function getTextPromptBoardTextColor(board) {
    with (this) {

    return normalizeTextPromptColor(board?.textColor, TEXT_PROMPT_TEXT_COLOR);
    }
  };

  Controller.prototype.getTextPromptBoardBackgroundColor = function getTextPromptBoardBackgroundColor(board) {
    with (this) {

    return normalizeTextPromptBackgroundColor(board?.backgroundColor);
    }
  };

  Controller.prototype.setTextPromptBoardStyleColor = function setTextPromptBoardStyleColor(board, kind, value, options = {}) {
    with (this) {

    if (!board || !isTextPromptBoard(board)) {
      return false;
    }

    const normalizedKind = String(kind || "").trim();
    const nextColor = normalizedKind === "background"
      ? normalizeTextPromptBackgroundColor(value)
      : normalizeTextPromptColor(value, TEXT_PROMPT_TEXT_COLOR);
    const key = normalizedKind === "background" ? "backgroundColor" : "textColor";
    const currentColor = key === "backgroundColor"
      ? getTextPromptBoardBackgroundColor(board)
      : getTextPromptBoardTextColor(board);

    if (currentColor === nextColor && board[key] === nextColor) {
      return false;
    }

    board[key] = nextColor;

    if (options.emit !== false) {
      emitConnectionsChange(options.emitSource || "text-prompt-style-color");
    }

    return true;
    }
  };

  Controller.prototype.getTextPromptTypography = function getTextPromptTypography(board, scale = 1) {
    with (this) {

    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const fontSizeDoc = getTextPromptBoardFontSizeDoc(board);
    const headingSizeDoc = fontSizeDoc * (30 / TEXT_PROMPT_FONT_SIZE_DOC_PX);

    return {
      fontSize: fontSizeDoc * safeScale,
      headingLineHeight: headingSizeDoc * 1.2 * safeScale,
      headingSize: headingSizeDoc * safeScale,
      lineHeight: fontSizeDoc * 1.4 * safeScale,
    };
    }
  };

  Controller.prototype.syncTextPromptFocusTypography = function syncTextPromptFocusTypography(overlay, board) {
    with (this) {

    if (!overlay || !isTextPromptBoard(board)) {
      return false;
    }

    const fontSizeDoc = getTextPromptBoardFontSizeDoc(board);
    const focusFontSize = fontSizeDoc * (18 / TEXT_PROMPT_FONT_SIZE_DOC_PX);
    const focusHeadingSize = focusFontSize * (38 / 18);

    overlay.style.setProperty("--text-prompt-focus-font-size", `${focusFontSize}px`);
    overlay.style.setProperty("--text-prompt-focus-line-height", `${focusFontSize * 1.55}px`);
    overlay.style.setProperty("--text-prompt-focus-heading-size", `${focusHeadingSize}px`);
    overlay.style.setProperty("--text-prompt-focus-heading-line-height", `${focusHeadingSize * (46 / 38)}px`);
    return true;
    }
  };

  Controller.prototype.syncTextPromptFocusStyle = function syncTextPromptFocusStyle(overlay, board) {
    with (this) {

    if (!overlay || !isTextPromptBoard(board)) {
      return false;
    }

    overlay.style.setProperty("--text-prompt-text-color", getTextPromptBoardTextColor(board));
    overlay.style.setProperty("--text-prompt-background-color", getTextPromptBoardBackgroundColor(board));
    overlay.classList.toggle("is-transparent-background", getTextPromptBoardBackgroundColor(board) === TEXT_PROMPT_TRANSPARENT_BACKGROUND);
    syncTextPromptFocusTypography(overlay, board);
    return true;
    }
  };

  Controller.prototype.getTextPromptBoardCount = function getTextPromptBoardCount() {
    with (this) {

    return spaceBoards.filter((board) => isTextPromptBoard(board)).length;
    }
  };

  Controller.prototype.getDuplicatedTextPromptBoardName = function getDuplicatedTextPromptBoardName(board) {
    with (this) {

    const baseName = String(board?.name || "Text Prompt").trim() || "Text Prompt";
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

  Controller.prototype.getCurrentViewportTextPromptBoardPlacement = function getCurrentViewportTextPromptBoardPlacement(options = {}) {
    with (this) {

    const width = Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(options.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX);
    const height = Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(options.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX);

    return getCurrentViewportAiImageBoardPlacement({ height, width });
    }
  };

  Controller.prototype.createTextPromptBoardFromRect = function createTextPromptBoardFromRect(rect, options = {}) {
    with (this) {

    if (!rect) {
      return null;
    }

    const boardIndex = getTextPromptBoardCount() + 1;
    const board = {
      backgroundColor: normalizeTextPromptBackgroundColor(options.backgroundColor),
      fontSizeDoc: normalizeTextPromptFontSizeDoc(options.fontSizeDoc ?? options.fontSize),
      height: Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(rect.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX),
      html: sanitizeTextPromptHtml(options.html || TEXT_PROMPT_DEFAULT_HTML),
      id: createTextPromptBoardId(),
      name: String(options.name || `Text Prompt #${boardIndex}`).trim() || `Text Prompt #${boardIndex}`,
      textColor: normalizeTextPromptColor(options.textColor, TEXT_PROMPT_TEXT_COLOR),
      type: TEXT_PROMPT_BOARD_TYPE,
      width: Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(rect.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX),
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
    };

    board.contentHtml = board.html;
    board.fontSize = board.fontSizeDoc;
    spaceBoards.push(board);
    selectedSpaceBoardId = board.id;
    return board;
    }
  };

  Controller.prototype.createDetachedTextPromptBoardFromMenu = function createDetachedTextPromptBoardFromMenu(options = {}) {
    with (this) {

    const placement = getCurrentViewportTextPromptBoardPlacement(options) || createRect(
      0,
      0,
      TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX,
      TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX,
    );

    return createTextPromptBoardFromRect(placement, options);
    }
  };

  Controller.prototype.createTextPromptBoardNearConnection = function createTextPromptBoardNearConnection(connection, options = {}) {
    with (this) {

    const anchor = getConnectionEndPoint(connection);

    if (!anchor) {
      return null;
    }

    const width = Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(options.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX);
    const height = Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(options.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX);
    const metrics = getActionBubbleMetrics();
    const preferredRect = createRect(
      anchor.x + metrics.outsideOffsetDoc,
      anchor.y - height * 0.5,
      width,
      height,
    );

    return createTextPromptBoardFromRect(resolveFreeSpaceBoardPlacement(preferredRect), options);
    }
  };

  Controller.prototype.materializeTextPromptBoardFromMenu = function materializeTextPromptBoardFromMenu(options = {}) {
    with (this) {

    const connection = getConnectionById(menuState?.connectionId);
    const beforeState = captureConnectionsHistoryState({
      excludeConnectionIds: connection ? [connection.id] : [],
    });
    const board = connection
      ? createTextPromptBoardNearConnection(connection, options)
      : createDetachedTextPromptBoardFromMenu(options);

    dismissConnectionMenu({
      removeConnection: Boolean(connection),
      render: false,
    });

    if (!board) {
      renderConnectionOverlay();
      return null;
    }

    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-create-${board.id}`,
      source: "space-board-create-text-prompt",
      type: "space-board-create",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-create-text-prompt");
    return board;
    }
  };

  Controller.prototype.createDuplicateTextPromptBoardPlacement = function createDuplicateTextPromptBoardPlacement(board) {
    with (this) {

    const width = Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(board?.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX);
    const height = Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(board?.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX);
    const preferredRect = createRect(
      (Number(board?.x) || 0) + Math.min(width * 0.25, 120),
      (Number(board?.y) || 0) + Math.min(height * 0.35, 96),
      width,
      height,
    );

    return resolveFreeSpaceBoardPlacement(preferredRect, {
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
      includeSurroundingCandidates: true,
    });
    }
  };

  Controller.prototype.duplicateTextPromptBoard = function duplicateTextPromptBoard(boardId) {
    with (this) {

    const board = getSpaceBoardById(boardId);

    if (!isTextPromptBoard(board)) {
      return false;
    }

    if (textPromptEditState?.mode === "inline" && textPromptEditState.boardId === board.id) {
      commitTextPromptInlineEditing({
        source: "text-prompt-input",
      });
    }

    const beforeState = captureConnectionsHistoryState();
    const placement = createDuplicateTextPromptBoardPlacement(board);
    const duplicate = {
      ...cloneSpaceBoard(board),
      height: placement.height,
      html: getTextPromptBoardHtml(board),
      id: createTextPromptBoardId(),
      name: getDuplicatedTextPromptBoardName(board),
      type: TEXT_PROMPT_BOARD_TYPE,
      width: placement.width,
      x: placement.x,
      y: placement.y,
    };

    duplicate.contentHtml = duplicate.html;
    spaceBoards.push(duplicate);
    selectedSpaceBoardId = duplicate.id;
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-duplicate-${board.id}`,
      source: "space-board-duplicate-text-prompt",
      type: "space-board-duplicate",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-duplicate-text-prompt");
    return duplicate;
    }
  };

  Controller.prototype.deleteTextPromptBoard = function deleteTextPromptBoard(boardId) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);

    if (!isTextPromptBoard(board)) {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();

    closeTextPromptFocusMode({ commit: true });
    spaceBoards = spaceBoards.filter((entry) => entry.id !== normalizedBoardId);

    if (selectedSpaceBoardId === normalizedBoardId) {
      selectedSpaceBoardId = "";
    }

    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-delete-${normalizedBoardId}`,
      source: "space-board-delete-text-prompt",
      type: "space-board-delete",
    });
    renderConnectionOverlay();
    emitConnectionsChange("space-board-delete-text-prompt");
    return true;
    }
  };

  Controller.prototype.ensureTextPromptBoardElement = function ensureTextPromptBoardElement(boardId) {
    with (this) {

    const pane = ensureSpaceBoardPane();
    const normalizedBoardId = String(boardId || "").trim();

    if (!pane || !normalizedBoardId) {
      return null;
    }

    let board = Array.from(pane.querySelectorAll(TEXT_PROMPT_BOARD_SELECTOR))
      .find((element) => element.dataset.boardId === normalizedBoardId) || null;

    if (!board) {
      board = document.createElement("div");
      board.className = "editor-space-text-board editor-artboard-frame";
      board.dataset.spaceBoard = "";
      board.dataset.spaceTextBoard = "";
      board.dataset.boardId = normalizedBoardId;
      board.innerHTML = `
        <div class="editor-space-text-board-header" data-space-text-board-drag-handle>
          <svg class="editor-space-text-board-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7V4h16v3"></path>
            <path d="M9 20h6"></path>
            <path d="M12 4v16"></path>
          </svg>
          <span class="editor-space-text-board-title" data-text-prompt-title></span>
        </div>
        <div class="editor-space-text-board-resize-controls" data-text-prompt-resize-controls aria-hidden="true">
          <span class="editor-space-text-board-resize-line is-top" data-text-prompt-resize="n"></span>
          <span class="editor-space-text-board-resize-line is-right" data-text-prompt-resize="e"></span>
          <span class="editor-space-text-board-resize-line is-bottom" data-text-prompt-resize="s"></span>
          <span class="editor-space-text-board-resize-line is-left" data-text-prompt-resize="w"></span>
          <span class="editor-space-text-board-resize-handle is-top is-left" data-text-prompt-resize="nw"></span>
          <span class="editor-space-text-board-resize-handle is-top is-right" data-text-prompt-resize="ne"></span>
          <span class="editor-space-text-board-resize-handle is-bottom is-left" data-text-prompt-resize="sw"></span>
          <span class="editor-space-text-board-resize-handle is-bottom is-right" data-text-prompt-resize="se"></span>
        </div>
        <div class="editor-space-text-board-shell">
          <div class="editor-space-text-board-scroll" data-text-prompt-scroll>
            <div class="editor-space-text-board-editor" data-text-prompt-editor role="textbox" aria-multiline="true" aria-readonly="true" contenteditable="false" spellcheck="true" tabindex="-1" data-placeholder="${escapeTextPromptHtml(TEXT_PROMPT_PLACEHOLDER)}"></div>
          </div>
        </div>
      `;
      board.addEventListener("pointerdown", handleAiImageBoardPointerDown, true);
      board.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelector("[data-space-text-board-drag-handle]")?.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelectorAll("[data-text-prompt-resize]").forEach((handle) => {
        handle.addEventListener("pointerdown", startTextPromptResize);
      });
      board.addEventListener("wheel", handleSpaceBoardWheel, { passive: false });

      const editor = board.querySelector(TEXT_PROMPT_EDITOR_SELECTOR);

      editor?.addEventListener("pointerdown", handleTextPromptEditorPointerDown);
      editor?.addEventListener("click", handleTextPromptEditorClick);
      editor?.addEventListener("dblclick", handleTextPromptEditorDoubleClick);
      editor?.addEventListener("focus", handleTextPromptEditorFocus);
      editor?.addEventListener("input", handleTextPromptEditorInput);
      editor?.addEventListener("blur", handleTextPromptEditorBlur);
      editor?.addEventListener("keydown", handleTextPromptEditorKeydown);
      editor?.addEventListener("paste", handleTextPromptEditorPaste);
      pane.appendChild(board);
    }

    board.dataset.boardId = normalizedBoardId;
    return board;
    }
  };

  Controller.prototype.syncTextPromptEditorHtml = function syncTextPromptEditorHtml(element, board) {
    with (this) {

    const editor = element?.querySelector?.(TEXT_PROMPT_EDITOR_SELECTOR);
    const html = getTextPromptBoardHtml(board);

    if (!editor) {
      return false;
    }

    if (document.activeElement !== editor && editor.innerHTML !== html) {
      editor.innerHTML = html;
    }

    editor.dataset.placeholder = TEXT_PROMPT_PLACEHOLDER;
    return true;
    }
  };

  Controller.prototype.updateTextPromptOverflowState = function updateTextPromptOverflowState(element) {
    with (this) {

    const scroll = element?.querySelector?.("[data-text-prompt-scroll]");

    if (!scroll) {
      return false;
    }

    const isOverflowing = (scroll.scrollHeight || 0) > (scroll.clientHeight || 0) + 1;

    scroll.classList.toggle("is-overflowing", isOverflowing);
    return isOverflowing;
    }
  };

  Controller.prototype.renderTextPromptBoards = function renderTextPromptBoards(options = {}) {
    with (this) {

    const pane = options.pane || ensureSpaceBoardPane();
    const viewState = options.viewState || getCameraState();
    const viewScale = Number.isFinite(Number(options.viewScale)) ? Number(options.viewScale) : getViewScale();
    const textBoards = spaceBoards.filter((board) => isTextPromptBoard(board));
    const renderedIds = new Set();

    if (!pane) {
      syncTextPromptToolbar("");
      return renderedIds;
    }

    const plainArtboardMode = shouldUsePlainAiBoardArtboards();

    textBoards.forEach((board) => {
      const element = ensureTextPromptBoardElement(board.id);

      if (!element) {
        return;
      }

      renderedIds.add(board.id);

      const docWidth = Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(board.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX);
      const docHeight = Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(board.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX);
      const point = plainArtboardMode
        ? documentPointToStagePoint({ x: board.x, y: board.y }, viewState)
        : { x: 0, y: 0 };
      const width = plainArtboardMode ? Math.max(1, docWidth * viewScale) : docWidth;
      const height = plainArtboardMode ? Math.max(1, docHeight * viewScale) : docHeight;
      const boardScale = plainArtboardMode ? viewScale : 1;
      const labelMetrics = getArtboardLabelMetrics(docWidth, docHeight, boardScale);
      const typography = getTextPromptTypography(board, boardScale);
      const isSelected = selectedSpaceBoardId === board.id;
      const isEditing = textPromptInlineEditBoardId === board.id;
      const textColor = getTextPromptBoardTextColor(board);
      const backgroundColor = getTextPromptBoardBackgroundColor(board);

      setStylePropertyIfChanged(element, "left", `${point.x}px`);
      setStylePropertyIfChanged(element, "top", `${point.y}px`);
      setStylePropertyIfChanged(element, "width", `${width}px`);
      setStylePropertyIfChanged(element, "height", `${height}px`);
      setStylePropertyIfChanged(element, "transform", plainArtboardMode ? "none" : `translate3d(${Number(board.x) || 0}px, ${Number(board.y) || 0}px, 0)`);
      setCssVarIfChanged(element, "--text-prompt-board-padding", `${TEXT_PROMPT_BOARD_PADDING_DOC_PX * boardScale}px`);
      setCssVarIfChanged(element, "--text-prompt-board-radius", `${TEXT_PROMPT_BOARD_RADIUS_DOC_PX * boardScale}px`);
      setCssVarIfChanged(element, "--text-prompt-board-outline", `${TEXT_PROMPT_BOARD_OUTLINE_DOC_PX * boardScale}px`);
      setCssVarIfChanged(element, "--text-prompt-background-color", backgroundColor);
      setCssVarIfChanged(element, "--text-prompt-text-color", textColor);
      setCssVarIfChanged(element, "--text-prompt-font-size", `${typography.fontSize}px`);
      setCssVarIfChanged(element, "--text-prompt-line-height", `${typography.lineHeight}px`);
      setCssVarIfChanged(element, "--text-prompt-heading-size", `${typography.headingSize}px`);
      setCssVarIfChanged(element, "--text-prompt-heading-line-height", `${typography.headingLineHeight}px`);
      setCssVarIfChanged(element, "--text-prompt-resize-handle", `${TEXT_PROMPT_RESIZE_HANDLE_DOC_PX * boardScale}px`);
      setCssVarIfChanged(element, "--text-prompt-resize-line", `${TEXT_PROMPT_RESIZE_LINE_DOC_PX * boardScale}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-height", `${labelMetrics.height}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-padding-x", `${labelMetrics.paddingX}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-radius", `${labelMetrics.radius}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-font-size", `${labelMetrics.fontSize}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-top", `${labelMetrics.top}px`);
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-editing", isEditing);
      element.classList.toggle("is-transparent-background", backgroundColor === TEXT_PROMPT_TRANSPARENT_BACKGROUND);
      element.classList.toggle("is-resizing", textPromptResize?.boardId === board.id);

      const title = element.querySelector("[data-text-prompt-title]");

      if (title) {
        title.textContent = board.name || "Text Prompt";
      }

      syncTextPromptEditorHtml(element, board);
      const editor = element.querySelector(TEXT_PROMPT_EDITOR_SELECTOR);

      if (editor && document.activeElement !== editor) {
        editor.setAttribute("contenteditable", isEditing ? "true" : "false");
        editor.setAttribute("aria-readonly", isEditing ? "false" : "true");
        editor.tabIndex = isEditing ? 0 : -1;
      }
      window.requestAnimationFrame?.(() => updateTextPromptOverflowState(element));
    });

    pane.querySelectorAll(TEXT_PROMPT_BOARD_SELECTOR).forEach((element) => {
      const boardId = element.dataset.boardId || "";

      if (!renderedIds.has(boardId)) {
        element.remove();
      }
    });

    syncTextPromptToolbar(!spaceBoardDrag && renderedIds.has(selectedSpaceBoardId) ? selectedSpaceBoardId : "");
    return renderedIds;
    }
  };

  Controller.prototype.getTextPromptEditorBoard = function getTextPromptEditorBoard(editor) {
    with (this) {

    const boardId = String(editor?.closest?.(TEXT_PROMPT_BOARD_SELECTOR)?.dataset?.boardId || textPromptFocusBoardId || "").trim();

    return getSpaceBoardById(boardId);
    }
  };

  Controller.prototype.focusTextPromptEditor = function focusTextPromptEditor(boardId, options = {}) {
    with (this) {

    return enterTextPromptInlineEditing(boardId, options);
    }
  };

  Controller.prototype.enterTextPromptInlineEditing = function enterTextPromptInlineEditing(boardId, options = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId || !isTextPromptBoard(getSpaceBoardById(normalizedBoardId))) {
      return false;
    }

    selectedSpaceBoardId = normalizedBoardId;
    textPromptInlineEditBoardId = normalizedBoardId;
    renderSpaceBoards();
    window.requestAnimationFrame?.(() => {
      const editor = getTextPromptBoardElement(normalizedBoardId)?.querySelector?.(TEXT_PROMPT_EDITOR_SELECTOR);

      if (!editor) {
        return;
      }

      editor.setAttribute("contenteditable", "true");
      editor.setAttribute("aria-readonly", "false");
      editor.tabIndex = 0;
      editor.focus({ preventScroll: true });
      if (options.select === true) {
        selectTextPromptEditorContents(editor);
      } else {
        moveTextPromptCaretToEnd(editor);
      }
    });

    return true;
    }
  };

  Controller.prototype.selectTextPromptEditorContents = function selectTextPromptEditorContents(editor) {
    with (this) {

    const selection = window.getSelection?.();
    const range = document.createRange?.();

    if (!editor || !selection || !range) {
      return false;
    }

    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
    }
  };

  Controller.prototype.moveTextPromptCaretToEnd = function moveTextPromptCaretToEnd(editor) {
    with (this) {

    const selection = window.getSelection?.();
    const range = document.createRange?.();

    if (!editor || !selection || !range) {
      return false;
    }

    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
    }
  };

  Controller.prototype.handleTextPromptEditorPointerDown = function handleTextPromptEditorPointerDown(event) {
    with (this) {

    event.stopPropagation();
    }
  };

  Controller.prototype.handleTextPromptEditorClick = function handleTextPromptEditorClick(event) {
    with (this) {

    const board = getTextPromptEditorBoard(event.currentTarget);

    if (board) {
      selectedSpaceBoardId = board.id;
      syncTextPromptToolbar(board.id);
    }

    event.stopPropagation();
    }
  };

  Controller.prototype.handleTextPromptEditorDoubleClick = function handleTextPromptEditorDoubleClick(event) {
    with (this) {

    const board = getTextPromptEditorBoard(event.currentTarget);

    if (!board) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    enterTextPromptInlineEditing(board.id, { select: false });
    }
  };

  Controller.prototype.handleTextPromptEditorFocus = function handleTextPromptEditorFocus(event) {
    with (this) {

    const board = getTextPromptEditorBoard(event.currentTarget);

    if (!board) {
      return;
    }

    selectedSpaceBoardId = board.id;
    textPromptInlineEditBoardId = board.id;
    textPromptEditState = {
      beforeState: captureConnectionsHistoryState(),
      boardId: board.id,
      mode: "inline",
      value: getTextPromptBoardHtml(board),
    };
    event.currentTarget.closest?.(TEXT_PROMPT_BOARD_SELECTOR)?.classList.add("is-editing");
    syncTextPromptToolbar(board.id);
    renderTextPromptBoards();
    }
  };

  Controller.prototype.handleTextPromptEditorInput = function handleTextPromptEditorInput(event) {
    with (this) {

    const editor = event.currentTarget;
    const board = getTextPromptEditorBoard(editor);

    if (!board) {
      return;
    }

    setTextPromptBoardHtml(board, editor.innerHTML, {
      emit: false,
    });
    updateTextPromptOverflowState(editor.closest?.(TEXT_PROMPT_BOARD_SELECTOR));
    syncTextPromptToolbar(board.id);
    }
  };

  Controller.prototype.handleTextPromptEditorBlur = function handleTextPromptEditorBlur(event) {
    with (this) {

    const editor = event.currentTarget;
    const board = getTextPromptEditorBoard(editor);
    const editState = textPromptEditState;

    textPromptInlineEditBoardId = "";
    editor.setAttribute("contenteditable", "false");
    editor.setAttribute("aria-readonly", "true");
    editor.tabIndex = -1;
    editor.closest?.(TEXT_PROMPT_BOARD_SELECTOR)?.classList.remove("is-editing");
    textPromptEditState = null;

    if (!board || !editState || editState.boardId !== board.id) {
      renderTextPromptBoards();
      return;
    }

    setTextPromptBoardHtml(board, editor.innerHTML, {
      emit: false,
    });

    if (getTextPromptBoardHtml(board) !== editState.value) {
      pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `text-prompt-edit-${board.id}`,
        source: "text-prompt-input",
        type: "text-prompt-edit",
      });
      emitConnectionsChange("text-prompt-input");
    }

    renderTextPromptBoards();
    }
  };

  Controller.prototype.commitTextPromptInlineEditing = function commitTextPromptInlineEditing(options = {}) {
    with (this) {

    const editState = textPromptEditState;

    if (!editState || editState.mode !== "inline") {
      return false;
    }

    const board = getSpaceBoardById(editState.boardId);
    const editor = getTextPromptBoardElement(editState.boardId)?.querySelector?.(TEXT_PROMPT_EDITOR_SELECTOR);

    if (board && editor) {
      setTextPromptBoardHtml(board, editor.innerHTML, {
        emit: false,
      });
    }

    textPromptEditState = null;
    textPromptInlineEditBoardId = "";

    if (editor) {
      editor.setAttribute("contenteditable", "false");
      editor.setAttribute("aria-readonly", "true");
      editor.tabIndex = -1;
      editor.blur?.();
      editor.closest?.(TEXT_PROMPT_BOARD_SELECTOR)?.classList.remove("is-editing");
    }

    if (board && getTextPromptBoardHtml(board) !== editState.value) {
      pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `text-prompt-edit-${board.id}`,
        source: options.source || "text-prompt-input",
        type: "text-prompt-edit",
      });
      emitConnectionsChange(options.source || "text-prompt-input");
    }

    renderTextPromptBoards();
    return true;
    }
  };

  Controller.prototype.handleTextPromptEditorKeydown = function handleTextPromptEditorKeydown(event) {
    with (this) {

    if (event.key === "Escape") {
      event.currentTarget?.blur?.();
      event.preventDefault();
    }

    event.stopPropagation();
    }
  };

  Controller.prototype.handleTextPromptEditorPaste = function handleTextPromptEditorPaste(event) {
    with (this) {

    const text = event.clipboardData?.getData?.("text/plain") || "";

    event.preventDefault();
    document.execCommand?.("insertText", false, text);
    }
  };

  Controller.prototype.startTextPromptResize = function startTextPromptResize(event) {
    with (this) {

    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    const handle = String(event.currentTarget?.dataset?.textPromptResize || "").trim();
    const boardElement = event.currentTarget?.closest?.(TEXT_PROMPT_BOARD_SELECTOR);
    const boardId = String(boardElement?.dataset?.boardId || "").trim();
    const board = getSpaceBoardById(boardId);
    const point = getEventDocumentPoint(event);

    if (!handle || !board || !point || !isTextPromptBoard(board)) {
      return;
    }

    selectedSpaceBoardId = boardId;
    textPromptResize = {
      beforeState: captureConnectionsHistoryState(),
      boardId,
      handle,
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startHeight: Math.max(TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX, Number(board.height) || TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX),
      startWidth: Math.max(TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX, Number(board.width) || TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX),
      startX: Number(board.x) || 0,
      startY: Number(board.y) || 0,
    };

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    document.addEventListener("pointermove", updateTextPromptResize, true);
    document.addEventListener("pointerup", finishTextPromptResize, true);
    document.addEventListener("pointercancel", finishTextPromptResize, true);
    renderConnectionOverlay();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.updateTextPromptResize = function updateTextPromptResize(event) {
    with (this) {

    if (!textPromptResize || event.pointerId !== textPromptResize.pointerId) {
      return;
    }

    const board = getSpaceBoardById(textPromptResize.boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    const dx = (Number(point.docX) || 0) - textPromptResize.startDocX;
    const dy = (Number(point.docY) || 0) - textPromptResize.startDocY;
    const handle = textPromptResize.handle;
    let nextX = textPromptResize.startX;
    let nextY = textPromptResize.startY;
    let nextWidth = textPromptResize.startWidth;
    let nextHeight = textPromptResize.startHeight;

    if (handle.includes("e")) {
      nextWidth = textPromptResize.startWidth + dx;
    }

    if (handle.includes("s")) {
      nextHeight = textPromptResize.startHeight + dy;
    }

    if (handle.includes("w")) {
      nextWidth = textPromptResize.startWidth - dx;
      nextX = textPromptResize.startX + dx;
    }

    if (handle.includes("n")) {
      nextHeight = textPromptResize.startHeight - dy;
      nextY = textPromptResize.startY + dy;
    }

    if (nextWidth < TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX) {
      if (handle.includes("w")) {
        nextX = textPromptResize.startX + textPromptResize.startWidth - TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX;
      }
      nextWidth = TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX;
    }

    if (nextHeight < TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX) {
      if (handle.includes("n")) {
        nextY = textPromptResize.startY + textPromptResize.startHeight - TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX;
      }
      nextHeight = TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX;
    }

    board.x = Math.round(nextX * 1000) / 1000;
    board.y = Math.round(nextY * 1000) / 1000;
    board.width = Math.round(nextWidth * 1000) / 1000;
    board.height = Math.round(nextHeight * 1000) / 1000;
    renderConnectionOverlay();
    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.finishTextPromptResize = function finishTextPromptResize(event) {
    with (this) {

    if (!textPromptResize || event.pointerId !== textPromptResize.pointerId) {
      return;
    }

    const state = textPromptResize;
    const board = getSpaceBoardById(state.boardId);

    textPromptResize = null;
    document.removeEventListener("pointermove", updateTextPromptResize, true);
    document.removeEventListener("pointerup", finishTextPromptResize, true);
    document.removeEventListener("pointercancel", finishTextPromptResize, true);

    try {
      state.sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released.
    }

    if (event.type === "pointercancel") {
      restoreConnectionsHistoryState(state.beforeState, "text-prompt-resize-cancel");
    } else if (
      board &&
      (
        Math.round((Number(board.x) || 0) - state.startX) ||
        Math.round((Number(board.y) || 0) - state.startY) ||
        Math.round((Number(board.width) || 0) - state.startWidth) ||
        Math.round((Number(board.height) || 0) - state.startHeight)
      )
    ) {
      pushConnectionsHistoryEntry(state.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `text-prompt-resize-${state.boardId}`,
        source: "text-prompt-resize",
        type: "text-prompt-resize",
      });
      emitConnectionsChange("text-prompt-resize");
      renderConnectionOverlay();
    } else {
      renderConnectionOverlay();
    }

    event.preventDefault();
    event.stopPropagation();
    }
  };

  Controller.prototype.ensureTextPromptToolbar = function ensureTextPromptToolbar() {
    with (this) {

    if (textPromptToolbar?.isConnected) {
      return textPromptToolbar;
    }

    const stage = getStage();

    if (!stage) {
      return null;
    }

    textPromptToolbar?.remove();
    textPromptToolbar = document.createElement("div");
    textPromptToolbar.className = "editor-text-prompt-toolbar editor-ai-image-board-action-toolbar";
    textPromptToolbar.dataset.textPromptToolbar = "";
    textPromptToolbar.setAttribute("aria-hidden", "true");
    textPromptToolbar.innerHTML = `
      <div class="editor-ai-image-board-action-toolbar-items editor-text-prompt-toolbar-items" data-text-prompt-toolbar-items>
        <label class="editor-ai-image-board-action-toolbar-button editor-text-prompt-color-control" data-text-prompt-color-control="text" data-ai-image-board-toolbar-label="Text color" aria-label="Text color">
          <span class="editor-text-prompt-color-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-case-sensitive-icon lucide-case-sensitive">
              <path d="m3 15 4-8 4 8"></path>
              <path d="M4 13h6"></path>
              <circle cx="18" cy="12" r="3"></circle>
              <path d="M21 9v6"></path>
            </svg>
          </span>
          <span class="editor-text-prompt-color-swatch" data-text-prompt-color-swatch="text"></span>
          <input class="editor-text-prompt-color-input" type="color" data-text-prompt-color-input="text" aria-label="Text color" />
        </label>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="font-increase" data-ai-image-board-toolbar-label="Bigger text" aria-label="Increase font size">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-icon lucide-arrow-up" aria-hidden="true">
            <path d="m5 12 7-7 7 7"></path>
            <path d="M12 19V5"></path>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="font-decrease" data-ai-image-board-toolbar-label="Smaller text" aria-label="Decrease font size">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-icon lucide-arrow-down" aria-hidden="true">
            <path d="M12 5v14"></path>
            <path d="m19 12-7 7-7-7"></path>
          </svg>
        </button>
        <label class="editor-ai-image-board-action-toolbar-button editor-text-prompt-color-control" data-text-prompt-color-control="background" data-ai-image-board-toolbar-label="Background" aria-label="Background color">
          <span class="editor-text-prompt-color-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square">
              <rect width="18" height="18" x="3" y="3" rx="2"></rect>
            </svg>
          </span>
          <span class="editor-text-prompt-color-swatch" data-text-prompt-color-swatch="background"></span>
          <input class="editor-text-prompt-color-input" type="color" data-text-prompt-color-input="background" aria-label="Background color" />
        </label>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="background-transparent" data-ai-image-board-toolbar-label="Transparent" aria-label="Transparent background">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-dashed-icon lucide-square-dashed" aria-hidden="true">
            <path d="M5 3a2 2 0 0 0-2 2"></path>
            <path d="M19 3a2 2 0 0 1 2 2"></path>
            <path d="M21 19a2 2 0 0 1-2 2"></path>
            <path d="M5 21a2 2 0 0 1-2-2"></path>
            <path d="M9 3h1"></path>
            <path d="M9 21h1"></path>
            <path d="M14 3h1"></path>
            <path d="M14 21h1"></path>
            <path d="M3 9v1"></path>
            <path d="M21 9v1"></path>
            <path d="M3 14v1"></path>
            <path d="M21 14v1"></path>
          </svg>
        </button>
        <span class="editor-ai-image-board-action-toolbar-separator" aria-hidden="true"></span>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="focus" data-ai-image-board-toolbar-label="Focus" aria-label="Focus mode">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fullscreen-icon lucide-fullscreen" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
            <rect width="10" height="8" x="7" y="8" rx="1"></rect>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="duplicate" data-ai-image-board-toolbar-label="Duplicate" aria-label="Duplicate">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy" aria-hidden="true">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
        </button>
        <button class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="delete" data-ai-image-board-toolbar-label="Delete" aria-label="Delete">
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
    textPromptToolbar.addEventListener("pointerdown", (event) => {
      if (!event.target?.closest?.("[data-text-prompt-color-control]")) {
        event.preventDefault();
      }
      event.stopPropagation();
    });
    textPromptToolbar.addEventListener("click", handleTextPromptToolbarClick);
    textPromptToolbar.addEventListener("change", handleTextPromptToolbarColorChange);
    stage.appendChild(textPromptToolbar);
    return textPromptToolbar;
    }
  };

  Controller.prototype.syncTextPromptToolbar = function syncTextPromptToolbar(boardId = "") {
    with (this) {

    const toolbar = ensureTextPromptToolbar();
    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);
    const element = getTextPromptBoardElement(normalizedBoardId);
    const stage = getStage();

    textPromptToolbarBoardId = normalizedBoardId;

    if (!toolbar || !stage || !isTextPromptBoard(board) || !element || isMobileLikeSpaceBoardViewport()) {
      if (toolbar) {
        toolbar.classList.remove("is-visible", "is-below");
        toolbar.setAttribute("aria-hidden", "true");
      }
      return false;
    }

    const stageRect = stage.getBoundingClientRect?.();
    const boardRect = element.getBoundingClientRect?.();

    if (!stageRect || !boardRect) {
      toolbar.classList.remove("is-visible", "is-below");
      toolbar.setAttribute("aria-hidden", "true");
      return false;
    }

    toolbar.dataset.boardId = normalizedBoardId;
    toolbar.classList.add("is-visible");
    toolbar.setAttribute("aria-hidden", "false");

    const toolbarWidth = Math.max(1, toolbar.offsetWidth || 360);
    const toolbarHeight = Math.max(1, toolbar.offsetHeight || 40);
    const desiredLeft = boardRect.left - stageRect.left + boardRect.width * 0.5;
    const toolbarHalfWidth = toolbarWidth * 0.5;
    const left = Math.min(
      Math.max(toolbarHalfWidth + 8, desiredLeft),
      Math.max(toolbarHalfWidth + 8, (stage.clientWidth || stageRect.width || 1) - toolbarHalfWidth - 8),
    );
    const aboveTop = boardRect.top - stageRect.top - toolbarHeight - 14;
    const belowTop = boardRect.bottom - stageRect.top + 14;
    const shouldPlaceBelow = aboveTop < 8 && belowTop + toolbarHeight < (stage.clientHeight || stageRect.height || 1) - 8;
    const top = shouldPlaceBelow ? belowTop : Math.max(8, aboveTop);

    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.classList.toggle("is-below", shouldPlaceBelow);
    updateTextPromptToolbarState(toolbar);
    return true;
    }
  };

  Controller.prototype.adjustTextPromptBoardFontSize = function adjustTextPromptBoardFontSize(boardId, deltaDocPx, options = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);

    if (!isTextPromptBoard(board)) {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();
    const currentFontSize = getTextPromptBoardFontSizeDoc(board);
    const nextFontSize = normalizeTextPromptFontSizeDoc(currentFontSize + (Number(deltaDocPx) || 0));

    if (nextFontSize === currentFontSize) {
      updateTextPromptToolbarState(options.toolbar || textPromptToolbar);
      return false;
    }

    setTextPromptBoardFontSizeDoc(board, nextFontSize, {
      emit: false,
    });
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `text-prompt-font-size-${board.id}`,
      source: "text-prompt-font-size",
      type: "text-prompt-font-size",
    });

    if (textPromptFocusBoardId === board.id) {
      syncTextPromptFocusTypography(document.querySelector("[data-text-prompt-focus-overlay]"), board);
    }

    renderConnectionOverlay();
    updateTextPromptToolbarState(options.toolbar || textPromptToolbar);
    emitConnectionsChange("text-prompt-font-size");
    return true;
    }
  };

  Controller.prototype.applyTextPromptStyleColor = function applyTextPromptStyleColor(boardId, kind, value, options = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);

    if (!isTextPromptBoard(board)) {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();

    if (!setTextPromptBoardStyleColor(board, kind, value, { emit: false })) {
      updateTextPromptToolbarState(options.toolbar || textPromptToolbar);
      return false;
    }

    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `text-prompt-style-${board.id}`,
      source: "text-prompt-style-color",
      type: "text-prompt-style",
    });

    if (textPromptFocusBoardId === board.id) {
      syncTextPromptFocusStyle(document.querySelector("[data-text-prompt-focus-overlay]"), board);
    }

    renderConnectionOverlay();
    updateTextPromptToolbarState(options.toolbar || textPromptToolbar);
    emitConnectionsChange("text-prompt-style-color");
    return true;
    }
  };

  Controller.prototype.getActiveTextPromptEditor = function getActiveTextPromptEditor() {
    with (this) {

    const active = document.activeElement;

    if (active?.matches?.(TEXT_PROMPT_EDITOR_SELECTOR) || active?.matches?.("[data-text-prompt-focus-editor]")) {
      return active;
    }

    if (textPromptFocusBoardId) {
      return document.querySelector("[data-text-prompt-focus-editor]");
    }

    return getTextPromptBoardElement(textPromptToolbarBoardId)?.querySelector?.(TEXT_PROMPT_EDITOR_SELECTOR) || null;
    }
  };

  Controller.prototype.applyTextPromptCommand = function applyTextPromptCommand(command, options = {}) {
    with (this) {

    const normalizedCommand = String(command || "").trim();
    const toolbarBoardId = String(options.boardId || textPromptToolbarBoardId || textPromptFocusBoardId || "").trim();
    const board = getSpaceBoardById(toolbarBoardId);

    if (!isTextPromptBoard(board)) {
      return false;
    }

    if (
      textPromptEditState?.mode === "inline" &&
      textPromptEditState.boardId === board.id &&
      ["focus", "duplicate", "delete", "background-transparent"].includes(normalizedCommand)
    ) {
      commitTextPromptInlineEditing({
        source: "text-prompt-input",
      });
    }

    const shouldRecordImmediate = !textPromptEditState || textPromptEditState.boardId !== board.id;
    const beforeState = shouldRecordImmediate ? captureConnectionsHistoryState() : null;
    const beforeHtml = getTextPromptBoardHtml(board);

    if (normalizedCommand === "focus") {
      return openTextPromptFocusMode(toolbarBoardId);
    }

    if (normalizedCommand === "duplicate") {
      return Boolean(duplicateTextPromptBoard(toolbarBoardId));
    }

    if (normalizedCommand === "delete") {
      return deleteTextPromptBoard(toolbarBoardId);
    }

    if (normalizedCommand === "font-increase" || normalizedCommand === "font-decrease") {
      const direction = normalizedCommand === "font-increase" ? 1 : -1;

      return adjustTextPromptBoardFontSize(toolbarBoardId, TEXT_PROMPT_FONT_SIZE_STEP_DOC_PX * direction, options);
    }

    if (normalizedCommand === "background-transparent") {
      return applyTextPromptStyleColor(toolbarBoardId, "background", TEXT_PROMPT_TRANSPARENT_BACKGROUND, options);
    }

    const editor = getActiveTextPromptEditor();

    if (!editor) {
      return false;
    }

    editor.focus({ preventScroll: true });

    if (normalizedCommand === "h1") {
      document.execCommand?.("formatBlock", false, "h1");
    } else if (normalizedCommand === "paragraph") {
      document.execCommand?.("formatBlock", false, "p");
    } else if (normalizedCommand === "bold") {
      document.execCommand?.("bold", false, null);
    } else if (normalizedCommand === "italic") {
      document.execCommand?.("italic", false, null);
    } else if (normalizedCommand === "bullet-list") {
      document.execCommand?.("insertUnorderedList", false, null);
    } else {
      return false;
    }

    setTextPromptBoardHtml(board, editor.innerHTML, {
      emit: false,
    });
    if (shouldRecordImmediate && getTextPromptBoardHtml(board) !== beforeHtml) {
      pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
        historyGroup: `text-prompt-format-${board.id}`,
        source: "text-prompt-toolbar",
        type: "text-prompt-edit",
      });
      emitConnectionsChange("text-prompt-toolbar");
    }
    updateTextPromptToolbarState(options.toolbar || textPromptToolbar);
    updateTextPromptOverflowState(editor.closest?.(TEXT_PROMPT_BOARD_SELECTOR));
    return true;
    }
  };

  Controller.prototype.updateTextPromptToolbarState = function updateTextPromptToolbarState(toolbar) {
    with (this) {

    if (!toolbar) {
      return false;
    }

    const bold = document.queryCommandState?.("bold") === true;
    const italic = document.queryCommandState?.("italic") === true;
    const block = String(document.queryCommandValue?.("formatBlock") || "").toLowerCase();
    const board = getSpaceBoardById(toolbar.dataset.boardId || textPromptToolbarBoardId || textPromptFocusBoardId);
    const fontSize = getTextPromptBoardFontSizeDoc(board);
    const fontSizeLabel = toolbar.querySelector("[data-text-prompt-font-size]");
    const fontDecrease = toolbar.querySelector('[data-text-prompt-command="font-decrease"]');
    const fontIncrease = toolbar.querySelector('[data-text-prompt-command="font-increase"]');
    const textColor = getTextPromptBoardTextColor(board);
    const backgroundColor = getTextPromptBoardBackgroundColor(board);
    const textColorInput = toolbar.querySelector('[data-text-prompt-color-input="text"]');
    const backgroundColorInput = toolbar.querySelector('[data-text-prompt-color-input="background"]');
    const textSwatch = toolbar.querySelector('[data-text-prompt-color-swatch="text"]');
    const backgroundSwatch = toolbar.querySelector('[data-text-prompt-color-swatch="background"]');
    const transparentButton = toolbar.querySelector('[data-text-prompt-command="background-transparent"]');

    toolbar.querySelector('[data-text-prompt-command="bold"]')?.classList.toggle("is-active", bold);
    toolbar.querySelector('[data-text-prompt-command="italic"]')?.classList.toggle("is-active", italic);
    toolbar.querySelector('[data-text-prompt-command="h1"]')?.classList.toggle("is-active", block === "h1");
    toolbar.querySelector('[data-text-prompt-command="paragraph"]')?.classList.toggle("is-active", block === "p" || block === "div");

    if (fontSizeLabel) {
      fontSizeLabel.textContent = String(Math.round(fontSize));
    }

    if (fontDecrease) {
      fontDecrease.disabled = fontSize <= TEXT_PROMPT_FONT_SIZE_MIN_DOC_PX;
    }

    if (fontIncrease) {
      fontIncrease.disabled = fontSize >= TEXT_PROMPT_FONT_SIZE_MAX_DOC_PX;
    }

    if (textColorInput) {
      textColorInput.value = textColor;
    }

    if (backgroundColorInput) {
      backgroundColorInput.value = backgroundColor === TEXT_PROMPT_TRANSPARENT_BACKGROUND
        ? normalizeTextPromptColor(TEXT_PROMPT_BACKGROUND_COLOR, "#ffffff")
        : backgroundColor;
    }

    if (textSwatch) {
      textSwatch.style.background = textColor;
    }

    if (backgroundSwatch) {
      backgroundSwatch.style.background = backgroundColor === TEXT_PROMPT_TRANSPARENT_BACKGROUND
        ? "transparent"
        : backgroundColor;
      backgroundSwatch.classList.toggle("is-transparent", backgroundColor === TEXT_PROMPT_TRANSPARENT_BACKGROUND);
    }

    transparentButton?.classList.toggle("is-active", backgroundColor === TEXT_PROMPT_TRANSPARENT_BACKGROUND);

    return true;
    }
  };

  Controller.prototype.handleTextPromptToolbarClick = function handleTextPromptToolbarClick(event) {
    with (this) {

    if (event.target?.closest?.("[data-text-prompt-color-control]")) {
      event.stopPropagation();
      return;
    }

    const button = event.target?.closest?.("[data-text-prompt-command]");

    event.preventDefault();
    event.stopPropagation();

    if (!button) {
      return;
    }

    applyTextPromptCommand(button.dataset.textPromptCommand, {
      boardId: button.closest("[data-text-prompt-toolbar]")?.dataset?.boardId || textPromptToolbarBoardId,
      toolbar: button.closest("[data-text-prompt-toolbar]"),
    });
    }
  };

  Controller.prototype.handleTextPromptToolbarColorChange = function handleTextPromptToolbarColorChange(event) {
    with (this) {

    const input = event.target?.closest?.("[data-text-prompt-color-input]");

    if (!input) {
      return;
    }

    const toolbar = input.closest("[data-text-prompt-toolbar]");
    const boardId = toolbar?.dataset?.boardId || textPromptToolbarBoardId || textPromptFocusBoardId;
    const kind = input.dataset.textPromptColorInput === "background" ? "background" : "text";

    event.stopPropagation();
    applyTextPromptStyleColor(boardId, kind, input.value, {
      toolbar,
    });
    }
  };

  Controller.prototype.ensureTextPromptFocusOverlay = function ensureTextPromptFocusOverlay() {
    with (this) {

    let overlay = document.querySelector("[data-text-prompt-focus-overlay]");

    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.className = "editor-text-prompt-focus-overlay";
    overlay.dataset.textPromptFocusOverlay = "";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="editor-text-prompt-focus-shell" role="dialog" aria-modal="true" aria-label="Text Prompt focus mode">
        <div class="editor-text-prompt-focus-header">
          <button class="editor-text-prompt-focus-close" type="button" aria-label="Close focus mode" data-text-prompt-focus-close>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
          <span class="editor-text-prompt-focus-title" data-text-prompt-focus-title></span>
          <div class="editor-text-prompt-focus-toolbar" data-text-prompt-toolbar data-text-prompt-focus-toolbar>
            <button type="button" data-text-prompt-command="paragraph" aria-label="Paragraph">P</button>
            <button type="button" data-text-prompt-command="h1" aria-label="Heading 1">H1</button>
            <span class="editor-text-prompt-toolbar-separator" aria-hidden="true"></span>
            <button type="button" data-text-prompt-command="bold" aria-label="Bold"><strong>B</strong></button>
            <button type="button" data-text-prompt-command="italic" aria-label="Italic"><em>I</em></button>
            <button type="button" data-text-prompt-command="bullet-list" aria-label="Bulleted list">List</button>
            <span class="editor-text-prompt-toolbar-separator" aria-hidden="true"></span>
            <button type="button" data-text-prompt-command="font-decrease" aria-label="Decrease font size">A-</button>
            <span class="editor-text-prompt-font-size" data-text-prompt-font-size aria-hidden="true">14</span>
            <button type="button" data-text-prompt-command="font-increase" aria-label="Increase font size">A+</button>
          </div>
        </div>
        <div class="editor-text-prompt-focus-body">
          <div class="editor-text-prompt-focus-editor" data-text-prompt-focus-editor contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="${escapeTextPromptHtml(TEXT_PROMPT_PLACEHOLDER)}"></div>
        </div>
      </div>
    `;
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) {
        closeTextPromptFocusMode();
      }
    });
    overlay.querySelector("[data-text-prompt-focus-close]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTextPromptFocusMode();
    });
    overlay.querySelector("[data-text-prompt-focus-toolbar]")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    overlay.querySelector("[data-text-prompt-focus-toolbar]")?.addEventListener("click", handleTextPromptToolbarClick);
    const editor = overlay.querySelector("[data-text-prompt-focus-editor]");

    editor?.addEventListener("input", handleTextPromptFocusInput);
    editor?.addEventListener("keydown", handleTextPromptFocusKeydown);
    editor?.addEventListener("paste", handleTextPromptEditorPaste);
    document.body.appendChild(overlay);
    return overlay;
    }
  };

  Controller.prototype.openTextPromptFocusMode = function openTextPromptFocusMode(boardId) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();
    const board = getSpaceBoardById(normalizedBoardId);
    const overlay = ensureTextPromptFocusOverlay();

    if (!overlay || !isTextPromptBoard(board)) {
      return false;
    }

    selectedSpaceBoardId = normalizedBoardId;
    textPromptInlineEditBoardId = "";
    textPromptFocusBoardId = normalizedBoardId;
    textPromptEditState = {
      beforeState: captureConnectionsHistoryState(),
      boardId: normalizedBoardId,
      mode: "focus",
      value: getTextPromptBoardHtml(board),
    };
    overlay.dataset.boardId = normalizedBoardId;
    overlay.querySelector("[data-text-prompt-focus-title]").textContent = board.name || "Text Prompt";
    const toolbar = overlay.querySelector("[data-text-prompt-focus-toolbar]");
    const editor = overlay.querySelector("[data-text-prompt-focus-editor]");

    if (toolbar) {
      toolbar.dataset.boardId = normalizedBoardId;
    }

    if (editor) {
      editor.innerHTML = getTextPromptBoardHtml(board);
      editor.dataset.placeholder = TEXT_PROMPT_PLACEHOLDER;
    }

    syncTextPromptFocusStyle(overlay, board);
    overlay.hidden = false;
    document.body.classList.add("editor-text-prompt-focus-open");
    renderConnectionOverlay();
    window.requestAnimationFrame?.(() => {
      editor?.focus?.({ preventScroll: true });
      moveTextPromptCaretToEnd(editor);
      updateTextPromptToolbarState(toolbar);
    });
    return true;
    }
  };

  Controller.prototype.handleTextPromptFocusInput = function handleTextPromptFocusInput(event) {
    with (this) {

    const board = getSpaceBoardById(textPromptFocusBoardId);

    if (!isTextPromptBoard(board)) {
      return;
    }

    setTextPromptBoardHtml(board, event.currentTarget.innerHTML, {
      emit: false,
    });
    renderTextPromptBoards();
    }
  };

  Controller.prototype.handleTextPromptFocusKeydown = function handleTextPromptFocusKeydown(event) {
    with (this) {

    if (event.key === "Escape") {
      closeTextPromptFocusMode();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.stopPropagation();
    }
  };

  Controller.prototype.closeTextPromptFocusMode = function closeTextPromptFocusMode(options = {}) {
    with (this) {

    const overlay = document.querySelector("[data-text-prompt-focus-overlay]");
    const board = getSpaceBoardById(textPromptFocusBoardId);
    const editor = overlay?.querySelector?.("[data-text-prompt-focus-editor]");
    const editState = textPromptEditState;
    const shouldCommit = options.commit !== false;

    if (board && editor && shouldCommit) {
      setTextPromptBoardHtml(board, editor.innerHTML, {
        emit: false,
      });
    }

    if (board && editState && editState.boardId === board.id && getTextPromptBoardHtml(board) !== editState.value) {
      pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `text-prompt-edit-${board.id}`,
        source: "text-prompt-focus-input",
        type: "text-prompt-edit",
      });
      emitConnectionsChange("text-prompt-focus-input");
    }

    textPromptFocusBoardId = "";
    textPromptEditState = null;

    if (overlay) {
      overlay.hidden = true;
      delete overlay.dataset.boardId;
    }

    document.body.classList.remove("editor-text-prompt-focus-open");
    renderConnectionOverlay();
    return true;
    }
  };

})(window.CBO);
