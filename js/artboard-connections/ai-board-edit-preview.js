window.CBO = window.CBO || {};



(function registerAiBoardEditPreviewJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-edit-preview.js.");

  }



  Controller.prototype.getAiImageBoardEnlargeMedia = function getAiImageBoardEnlargeMedia(board) {
    with (this) {

    const media = board?.generatedMedia || null;
    const src = String(media?.src || "").trim();
    const kind = media?.kind === "video" ? "video" : "image";

    if (!src || kind !== "image") {
      return null;
    }

    return {
      height: Math.max(1, Math.round(Number(media?.height || board?.height) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
      name: String(media?.name || board?.name || "AI Image board"),
      src,
      width: Math.max(1, Math.round(Number(media?.width || board?.width) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
    };
    }
  };

  Controller.prototype.getAiImageBoardEditPreviewMedia = function getAiImageBoardEditPreviewMedia(board) {
    with (this) {

    if (!board || board.type !== "ai-image" || !shouldUsePlainAiBoardArtboards()) {
      return null;
    }

    const media = getAiImageBoardEnlargeMedia(board);

    return {
      height: media?.height || Math.max(1, Math.round(Number(board?.height) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
      name: media?.name || String(board?.name || "AI Image board"),
      src: media?.src || "",
      width: media?.width || Math.max(1, Math.round(Number(board?.width) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
    };
    }
  };

  Controller.prototype.isAiImageBoardEditPreviewViewportAllowed = function isAiImageBoardEditPreviewViewportAllowed() {
    with (this) {

    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);

    return viewportWidth >= AI_IMAGE_ENLARGE_MIN_VIEWPORT_PX;
    }
  };

  Controller.prototype.ensureAiImageBoardEditPreviewViewer = function ensureAiImageBoardEditPreviewViewer() {
    with (this) {

    if (aiImageEditPreviewViewer?.isConnected) {
      return aiImageEditPreviewViewer;
    }

    aiImageEditPreviewViewer?.remove();
    aiImageEditPreviewViewer = document.createElement("div");
    aiImageEditPreviewViewer.className = "editor-ai-image-edit-preview-viewer";
    aiImageEditPreviewViewer.dataset.aiImageEditPreviewViewer = "";
    aiImageEditPreviewViewer.hidden = true;
    aiImageEditPreviewViewer.setAttribute("aria-hidden", "true");
    aiImageEditPreviewViewer.setAttribute("aria-label", "Create with AI");
    aiImageEditPreviewViewer.setAttribute("aria-modal", "true");
    aiImageEditPreviewViewer.setAttribute("role", "dialog");
    aiImageEditPreviewViewer.innerHTML = `
      <div class="editor-ai-image-edit-preview-shell" data-ai-image-edit-preview-shell>
        <div class="editor-ai-image-edit-preview-header">
          <button class="editor-ai-image-edit-preview-close" type="button" aria-label="Close edit preview" data-ai-image-edit-preview-close>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
          <div class="editor-ai-image-edit-preview-title">Create with AI</div>
        </div>
        <div class="editor-ai-image-edit-preview-prompt-menu" id="editor-ai-image-edit-preview-prompt-menu" data-ai-image-edit-preview-prompt-menu hidden>
          <div class="editor-ai-image-edit-preview-prompt-menu-grid">
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Solar Mist" data-ai-image-edit-preview-prompt-preset-tone="solar" aria-label="Use Solar Mist preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Solar Mist</div>
            </button>
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Chrome Pop" data-ai-image-edit-preview-prompt-preset-tone="chrome" aria-label="Use Chrome Pop preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Chrome Pop</div>
            </button>
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Velvet Glow" data-ai-image-edit-preview-prompt-preset-tone="velvet" aria-label="Use Velvet Glow preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Velvet Glow</div>
            </button>
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Pixel Bloom" data-ai-image-edit-preview-prompt-preset-tone="pixel" aria-label="Use Pixel Bloom preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Pixel Bloom</div>
            </button>
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Frost Line" data-ai-image-edit-preview-prompt-preset-tone="frost" aria-label="Use Frost Line preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Frost Line</div>
            </button>
            <button class="editor-ai-image-edit-preview-prompt-menu-item" type="button" data-ai-image-edit-preview-prompt-preset="Nova Dust" data-ai-image-edit-preview-prompt-preset-tone="nova" aria-label="Use Nova Dust preset">
              <div class="editor-ai-image-edit-preview-prompt-menu-swatch"></div>
              <div class="editor-ai-image-edit-preview-prompt-menu-label">Nova Dust</div>
            </button>
          </div>
        </div>
        <div class="editor-ai-image-edit-preview-body">
          <div class="editor-ai-image-edit-preview-media-frame" data-ai-image-edit-preview-media-frame>
            <img class="editor-ai-image-edit-preview-image" data-ai-image-edit-preview-image alt="" draggable="false">
          </div>
          <div class="editor-ai-image-edit-preview-prompt">
            <div class="editor-ai-image-edit-preview-prompt-input" data-ai-image-edit-preview-prompt-input contenteditable="true" role="textbox" aria-multiline="true" aria-label="Create with AI prompt" data-placeholder="What do you want to create?" spellcheck="true"></div>
            <div class="editor-ai-image-edit-preview-prompt-row">
              <button class="editor-ai-image-edit-preview-chip is-active" type="button" aria-expanded="false" aria-controls="editor-ai-image-edit-preview-prompt-menu" data-ai-image-edit-preview-prompt-menu-toggle>Prompt</button>
              <span class="editor-ai-image-edit-preview-chip">Visual</span>
              <span class="editor-ai-image-edit-preview-attach">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.49-8.48"></path>
                </svg>
              </span>
              <span class="editor-ai-image-edit-preview-mode">Automatic</span>
              <button class="editor-ai-image-edit-preview-send" type="button" aria-label="Generate image" data-ai-image-edit-preview-send>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 19V5"></path>
                  <path d="m5 12 7-7 7 7"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="editor-ai-image-edit-preview-meta">
            <span>37%</span>
            <span data-ai-image-edit-preview-dimensions></span>
          </div>
        </div>
      </div>
    `;

    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-close]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        stopSpaceBoardControlEvent(event);
        closeAiImageBoardEditPreview();
      });
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("focus", handleAiImageEditPreviewPromptFocus);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("input", handleAiImageEditPreviewPromptInput);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("click", handleAiImageEditPreviewPromptClick);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("keyup", handleAiImageEditPreviewPromptSelectionChange);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("mouseup", handleAiImageEditPreviewPromptSelectionChange);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("paste", handleAiImageEditPreviewPromptPaste);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("blur", handleAiImageEditPreviewPromptBlur);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      ?.addEventListener("keydown", handleAiImageEditPreviewPromptKeyDown);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-menu-toggle]")
      ?.addEventListener("pointerdown", handleAiImageEditPreviewPromptMenuTogglePointerDown);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-menu-toggle]")
      ?.addEventListener("click", handleAiImageEditPreviewPromptMenuToggleClick);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-menu]")
      ?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-menu]")
      ?.addEventListener("click", handleAiImageEditPreviewPromptMenuClick);
    aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-send]")
      ?.addEventListener("click", handleAiImageEditPreviewSendClick);
    aiImageEditPreviewViewer.addEventListener("pointerdown", stopSpaceBoardControlEvent, true);
    aiImageEditPreviewViewer.addEventListener("click", stopSpaceBoardControlEvent);
    document.body.appendChild(aiImageEditPreviewViewer);
    return aiImageEditPreviewViewer;
    }
  };

  Controller.prototype.openAiImageBoardEditPreview = function openAiImageBoardEditPreview(boardId) {
    with (this) {

    const board = getSpaceBoardById(boardId);
    const media = getAiImageBoardEditPreviewMedia(board);

    if (!media || !isAiImageBoardEditPreviewViewportAllowed()) {
      return false;
    }

    closeAiImageBoardEnlargeViewer();

    const viewer = ensureAiImageBoardEditPreviewViewer();

    viewer.dataset.boardId = board.id;
    viewer.hidden = false;
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("editor-ai-image-edit-preview-open");

    setAiImageEditPreviewPromptMenuOpen(viewer, false);
    syncAiImageEditPreviewViewerFromBoard({ forcePrompt: true });

    window.addEventListener("keydown", handleAiImageBoardEditPreviewKeyDown, true);
    window.addEventListener("resize", handleAiImageBoardEditPreviewResize);
    viewer.querySelector("[data-ai-image-edit-preview-close]")?.focus?.({ preventScroll: true });
    return true;
    }
  };

  Controller.prototype.closeAiImageBoardEditPreview = function closeAiImageBoardEditPreview() {
    with (this) {

    const viewer = aiImageEditPreviewViewer;
    const image = viewer?.querySelector?.("[data-ai-image-edit-preview-image]");
    const promptEditor = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-input]");

    commitAiImageEditPreviewPromptInput(promptEditor);

    window.removeEventListener("keydown", handleAiImageBoardEditPreviewKeyDown, true);
    window.removeEventListener("resize", handleAiImageBoardEditPreviewResize);
    document.body.classList.remove("editor-ai-image-edit-preview-open");

    if (!viewer) {
      return;
    }

    setAiImageEditPreviewPromptMenuOpen(viewer, false);
    viewer.hidden = true;
    viewer.classList.remove("is-empty", "is-generating");
    viewer.setAttribute("aria-hidden", "true");
    delete viewer.dataset.boardId;

    if (image) {
      image.alt = "";
      image.hidden = false;
      image.removeAttribute("src");
    }
    }
  };

  Controller.prototype.syncAiImageEditPreviewViewerFromBoard = function syncAiImageEditPreviewViewerFromBoard(options = {}) {
    with (this) {

    const viewer = aiImageEditPreviewViewer;
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");
    const media = getAiImageBoardEditPreviewMedia(board);
    const frame = viewer?.querySelector?.("[data-ai-image-edit-preview-media-frame]");
    const image = viewer?.querySelector?.("[data-ai-image-edit-preview-image]");
    const dimensions = viewer?.querySelector?.("[data-ai-image-edit-preview-dimensions]");
    const promptEditor = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-input]");
    const sendButton = viewer?.querySelector?.("[data-ai-image-edit-preview-send]");

    if (!viewer || viewer.hidden || !board || !media || !image) {
      return false;
    }

    const hasImage = Boolean(media.src);
    const isGenerating = aiImageGeneratingBoardIds.has(board.id);

    viewer.classList.toggle("is-empty", !hasImage);
    viewer.classList.toggle("is-generating", isGenerating);
    frame?.classList.toggle("is-empty", !hasImage);
    frame?.classList.toggle("is-generating", isGenerating);
    frame?.style.setProperty("--editor-ai-image-edit-preview-media-ratio", `${media.width} / ${media.height}`);

    image.hidden = !hasImage;
    image.alt = hasImage ? media.name : "";
    image.decoding = "async";
    image.loading = "eager";

    if (hasImage) {
      if (image.getAttribute("src") !== media.src) {
        image.src = media.src;
      }
    } else {
      image.removeAttribute("src");
    }

    if (dimensions) {
      dimensions.textContent = `${media.width}x${media.height} px`;
    }

    if (promptEditor && (options.forcePrompt || document.activeElement !== promptEditor)) {
      renderAiImageEditPreviewPromptEditor(promptEditor, board);
    }

    if (sendButton) {
      sendButton.disabled = isGenerating;
      sendButton.classList.toggle("is-loading", isGenerating);

      if (isGenerating) {
        sendButton.setAttribute("aria-busy", "true");
      } else {
        sendButton.removeAttribute("aria-busy");
      }
    }

    return true;
    }
  };

  Controller.prototype.getAiImageBoardPromptText = function getAiImageBoardPromptText(board) {
    with (this) {

    const promptText = String(board?.promptText || "");

    return promptText || String(board?.captionText || "");
    }
  };

  Controller.prototype.getAiImagePromptPresetConfig = function getAiImagePromptPresetConfig(presetName) {
    with (this) {

    const name = String(presetName || "").trim();
    const normalizedName = name.toLowerCase();

    return AI_IMAGE_EDIT_PREVIEW_PROMPT_PRESETS.find((preset) => preset.name.toLowerCase() === normalizedName) || {
      name,
      tone: "default",
    };
    }
  };

  Controller.prototype.normalizeAiImagePromptParts = function normalizeAiImagePromptParts(parts) {
    with (this) {

    const normalized = [];

    if (!Array.isArray(parts)) {
      return normalized;
    }

    parts.forEach((part) => {
      if (!part || typeof part !== "object") {
        return;
      }

      if (part.type === "preset") {
        const preset = getAiImagePromptPresetConfig(part.name);

        if (preset.name) {
          normalized.push({
            name: preset.name,
            tone: preset.tone,
            type: "preset",
          });
        }
        return;
      }

      const text = String(part.text || "").replace(/\u00a0/g, " ");

      if (!text) {
        return;
      }

      const previous = normalized[normalized.length - 1];

      if (previous?.type === "text") {
        previous.text += text;
      } else {
        normalized.push({
          text,
          type: "text",
        });
      }
    });

    return normalized;
    }
  };

  Controller.prototype.getAiImagePromptPlainTextFromParts = function getAiImagePromptPlainTextFromParts(parts) {
    with (this) {

    return normalizeAiImagePromptParts(parts).map((part) => (
      part.type === "preset" ? part.name : part.text
    )).join("");
    }
  };

  Controller.prototype.getAiImageBoardPromptParts = function getAiImageBoardPromptParts(board) {
    with (this) {

    const parts = normalizeAiImagePromptParts(board?.promptParts);

    if (parts.length) {
      return parts;
    }

    const text = getAiImageBoardPromptText(board);

    return text ? [{ text, type: "text" }] : [];
    }
  };

  Controller.prototype.createAiImageEditPreviewPromptTokenElement = function createAiImageEditPreviewPromptTokenElement(presetName) {
    with (this) {

    const preset = getAiImagePromptPresetConfig(presetName);
    const token = document.createElement("span");
    const label = document.createElement("span");
    const remove = document.createElement("span");

    token.className = "editor-ai-image-edit-preview-prompt-token";
    token.contentEditable = "false";
    token.dataset.aiImageEditPreviewPromptToken = "";
    token.dataset.presetName = preset.name;
    token.dataset.presetTone = preset.tone;

    label.className = "editor-ai-image-edit-preview-prompt-token-label";
    label.textContent = preset.name;

    remove.className = "editor-ai-image-edit-preview-prompt-token-remove";
    remove.dataset.aiImageEditPreviewPromptTokenRemove = "";
    remove.setAttribute("aria-label", `Remove ${preset.name}`);
    remove.setAttribute("role", "button");
    remove.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="m15 9-6 6"></path>
        <path d="m9 9 6 6"></path>
      </svg>
    `;

    token.append(label, remove);
    return token;
    }
  };

  Controller.prototype.renderAiImageEditPreviewPromptEditor = function renderAiImageEditPreviewPromptEditor(editor, board) {
    with (this) {

    if (!editor) {
      return false;
    }

    editor.replaceChildren();
    getAiImageBoardPromptParts(board).forEach((part) => {
      if (part.type === "preset") {
        editor.appendChild(createAiImageEditPreviewPromptTokenElement(part.name));
      } else {
        editor.appendChild(document.createTextNode(part.text));
      }
    });

    return true;
    }
  };

  Controller.prototype.cleanEmptyAiImageEditPreviewPromptEditor = function cleanEmptyAiImageEditPreviewPromptEditor(editor) {
    with (this) {

    const hasToken = Boolean(editor?.querySelector?.("[data-ai-image-edit-preview-prompt-token]"));
    const text = String(editor?.textContent || "").replace(/\u00a0/g, " ").trim();

    if (!editor || hasToken || text) {
      return false;
    }

    editor.replaceChildren();
    return true;
    }
  };

  Controller.prototype.serializeAiImageEditPreviewPromptEditor = function serializeAiImageEditPreviewPromptEditor(editor) {
    with (this) {

    const parts = [];
    const appendTextPart = (text) => {
      const value = String(text || "").replace(/\u00a0/g, " ");

      if (!value) {
        return;
      }

      const previous = parts[parts.length - 1];

      if (previous?.type === "text") {
        previous.text += value;
      } else {
        parts.push({
          text: value,
          type: "text",
        });
      }
    };
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendTextPart(node.nodeValue || "");
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = node;

      if (element.matches?.("[data-ai-image-edit-preview-prompt-token]")) {
        const preset = getAiImagePromptPresetConfig(element.dataset.presetName);

        if (preset.name) {
          parts.push({
            name: preset.name,
            tone: preset.tone,
            type: "preset",
          });
        }
        return;
      }

      if (element.tagName === "BR") {
        appendTextPart("\n");
        return;
      }

      Array.from(element.childNodes).forEach(walk);
    };

    Array.from(editor?.childNodes || []).forEach(walk);

    const normalizedParts = normalizeAiImagePromptParts(parts);

    return {
      parts: normalizedParts,
      text: getAiImagePromptPlainTextFromParts(normalizedParts),
    };
    }
  };

  Controller.prototype.setAiImageBoardPromptText = function setAiImageBoardPromptText(board, value, options = {}) {
    with (this) {

    if (!board) {
      return false;
    }

    const nextValue = String(value || "");
    const shouldPreserveParts = options.preservePromptParts === true ||
      (options.force === true && !Array.isArray(options.promptParts));
    const nextParts = shouldPreserveParts
      ? normalizeAiImagePromptParts(board.promptParts)
      : normalizeAiImagePromptParts(Array.isArray(options.promptParts)
        ? options.promptParts
        : (nextValue ? [{ text: nextValue, type: "text" }] : []));
    const changed = String(board.promptText || "") !== nextValue ||
      String(board.captionText || "") !== nextValue ||
      JSON.stringify(normalizeAiImagePromptParts(board.promptParts)) !== JSON.stringify(nextParts);

    board.promptText = nextValue;
    board.captionText = nextValue;
    board.promptParts = nextParts;
    syncAiImageBoardPromptTextControls(board, options);

    if (options.emitSource) {
      emitConnectionsChange(options.emitSource);
    }

    return changed;
    }
  };

  Controller.prototype.syncAiImageBoardPromptTextControls = function syncAiImageBoardPromptTextControls(board, options = {}) {
    with (this) {

    if (!board) {
      return false;
    }

    const value = getAiImageBoardPromptText(board);
    const boardElement = getSpaceBoardElement(board.id);
    const boardPromptInput = boardElement?.querySelector?.("[data-ai-image-board-prompt-input]");

    if (boardPromptInput && (options.force || document.activeElement !== boardPromptInput)) {
      boardPromptInput.value = value;
      resizeAiImagePromptInput(boardPromptInput);
    }

    updateAiImageCaptionControls(boardElement, board, selectedSpaceBoardId === board.id);

    const previewEditor = aiImageEditPreviewViewer?.dataset?.boardId === board.id
      ? aiImageEditPreviewViewer.querySelector("[data-ai-image-edit-preview-prompt-input]")
      : null;

    if (previewEditor && (options.force || document.activeElement !== previewEditor)) {
      renderAiImageEditPreviewPromptEditor(previewEditor, board);
    }

    return true;
    }
  };

  Controller.prototype.getAiImageEditPreviewBoardFromEvent = function getAiImageEditPreviewBoardFromEvent(event) {
    with (this) {

    const viewer = event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]");

    return getSpaceBoardById(viewer?.dataset?.boardId || "");
    }
  };

  Controller.prototype.syncAiImageEditPreviewPromptToBoard = function syncAiImageEditPreviewPromptToBoard(editor) {
    with (this) {

    const viewer = editor?.closest?.("[data-ai-image-edit-preview-viewer]");
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");
    const serialized = serializeAiImageEditPreviewPromptEditor(editor);

    if (!board) {
      return false;
    }

    setAiImageBoardPromptText(board, serialized.text, {
      emitSource: "ai-image-edit-preview-prompt-input",
      promptParts: serialized.parts,
    });
    return true;
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptFocus = function handleAiImageEditPreviewPromptFocus(event) {
    with (this) {

    const board = getAiImageEditPreviewBoardFromEvent(event);

    if (!board) {
      return;
    }

    promptEditState = {
      beforeState: captureConnectionsHistoryState(),
      boardId: board.id,
      value: getAiImageBoardPromptText(board),
    };
    saveAiImageEditPreviewPromptSelection(event.currentTarget);
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptInput = function handleAiImageEditPreviewPromptInput(event) {
    with (this) {

    cleanEmptyAiImageEditPreviewPromptEditor(event.currentTarget);
    syncAiImageEditPreviewPromptToBoard(event.currentTarget);
    saveAiImageEditPreviewPromptSelection(event.currentTarget);
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptSelectionChange = function handleAiImageEditPreviewPromptSelectionChange(event) {
    with (this) {

    saveAiImageEditPreviewPromptSelection(event.currentTarget);
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptClick = function handleAiImageEditPreviewPromptClick(event) {
    with (this) {

    const removeButton = event.target?.closest?.("[data-ai-image-edit-preview-prompt-token-remove]");

    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      removeAiImageEditPreviewPromptToken(removeButton);
      return;
    }

    saveAiImageEditPreviewPromptSelection(event.currentTarget);
    stopSpaceBoardControlEvent(event);
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptPaste = function handleAiImageEditPreviewPromptPaste(event) {
    with (this) {

    const text = event.clipboardData?.getData?.("text/plain") || "";

    event.preventDefault();
    event.stopPropagation();

    insertAiImageEditPreviewPromptText(event.currentTarget, text);
    }
  };

  Controller.prototype.setAiImageEditPreviewPromptMenuOpen = function setAiImageEditPreviewPromptMenuOpen(viewer, open) {
    with (this) {

    const menu = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-menu]");
    const button = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-menu-toggle]");
    const shouldOpen = Boolean(open);

    if (!viewer || !menu || !button) {
      return false;
    }

    menu.hidden = !shouldOpen;
    button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    viewer.classList.toggle("is-prompt-menu-open", shouldOpen);
    return shouldOpen;
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptMenuTogglePointerDown = function handleAiImageEditPreviewPromptMenuTogglePointerDown(event) {
    with (this) {

    const viewer = event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]");
    const editor = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-input]");

    saveAiImageEditPreviewPromptSelection(editor);
    event.stopPropagation();
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptMenuToggleClick = function handleAiImageEditPreviewPromptMenuToggleClick(event) {
    with (this) {

    const viewer = event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]");
    const menu = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-menu]");

    event.preventDefault();
    event.stopPropagation();

    setAiImageEditPreviewPromptMenuOpen(viewer, Boolean(menu?.hidden));
    }
  };

  Controller.prototype.getAiImageEditPreviewPromptSelectionRange = function getAiImageEditPreviewPromptSelectionRange(editor) {
    with (this) {

    const selection = window.getSelection?.();

    if (!editor || !selection || !selection.rangeCount) {
      return null;
    }

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      return null;
    }

    return range;
    }
  };

  Controller.prototype.saveAiImageEditPreviewPromptSelection = function saveAiImageEditPreviewPromptSelection(editor) {
    with (this) {

    const range = getAiImageEditPreviewPromptSelectionRange(editor);

    if (!range) {
      return false;
    }

    aiImageEditPreviewPromptSelectionRange = range.cloneRange();
    return true;
    }
  };

  Controller.prototype.restoreAiImageEditPreviewPromptSelection = function restoreAiImageEditPreviewPromptSelection(editor) {
    with (this) {

    const selection = window.getSelection?.();
    const range = aiImageEditPreviewPromptSelectionRange;
    const rangeIsUsable = range &&
      range.startContainer?.isConnected &&
      range.endContainer?.isConnected &&
      editor?.contains?.(range.commonAncestorContainer);

    if (!editor || !selection) {
      return null;
    }

    if (!rangeIsUsable) {
      return placeAiImageEditPreviewPromptCaretAtEnd(editor);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    return range;
    }
  };

  Controller.prototype.placeAiImageEditPreviewPromptCaretAtEnd = function placeAiImageEditPreviewPromptCaretAtEnd(editor) {
    with (this) {

    const selection = window.getSelection?.();
    const range = document.createRange();

    if (!editor || !selection) {
      return null;
    }

    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    aiImageEditPreviewPromptSelectionRange = range.cloneRange();
    return range;
    }
  };

  Controller.prototype.setAiImageEditPreviewPromptCaretAfterNode = function setAiImageEditPreviewPromptCaretAfterNode(editor, node) {
    with (this) {

    const selection = window.getSelection?.();
    const range = document.createRange();

    if (!editor || !node || !selection) {
      return false;
    }

    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    aiImageEditPreviewPromptSelectionRange = range.cloneRange();
    return true;
    }
  };

  Controller.prototype.insertAiImageEditPreviewPromptText = function insertAiImageEditPreviewPromptText(editor, text) {
    with (this) {

    const value = String(text || "");
    const range = restoreAiImageEditPreviewPromptSelection(editor);
    const textNode = document.createTextNode(value);

    if (!editor || !range || !value) {
      return false;
    }

    range.deleteContents();
    range.insertNode(textNode);
    setAiImageEditPreviewPromptCaretAfterNode(editor, textNode);
    syncAiImageEditPreviewPromptToBoard(editor);
    return true;
    }
  };

  Controller.prototype.insertAiImageEditPreviewPromptPreset = function insertAiImageEditPreviewPromptPreset(editor, presetName) {
    with (this) {

    const preset = getAiImagePromptPresetConfig(presetName);
    const range = restoreAiImageEditPreviewPromptSelection(editor);
    const fragment = document.createDocumentFragment();
    let caretAnchor = null;

    if (!editor || !range || !preset.name) {
      return false;
    }

    editor.focus({ preventScroll: true });
    range.deleteContents();

    if (shouldInsertAiImagePromptTextSpacerBefore(range)) {
      fragment.appendChild(document.createTextNode(" "));
    }

    fragment.appendChild(createAiImageEditPreviewPromptTokenElement(preset.name));
    caretAnchor = document.createTextNode(" ");
    fragment.appendChild(caretAnchor);
    range.insertNode(fragment);
    setAiImageEditPreviewPromptCaretAfterNode(editor, caretAnchor);
    syncAiImageEditPreviewPromptToBoard(editor);
    return true;
    }
  };

  Controller.prototype.shouldInsertAiImagePromptTextSpacerBefore = function shouldInsertAiImagePromptTextSpacerBefore(range) {
    with (this) {

    const previousText = getAiImagePromptRangePreviousText(range);

    return Boolean(previousText && !/\s$/.test(previousText));
    }
  };

  Controller.prototype.getAiImagePromptRangePreviousText = function getAiImagePromptRangePreviousText(range) {
    with (this) {

    if (!range) {
      return "";
    }

    if (range.startContainer?.nodeType === Node.TEXT_NODE) {
      return String(range.startContainer.nodeValue || "").slice(0, range.startOffset);
    }

    const previousNode = range.startOffset > 0
      ? range.startContainer?.childNodes?.[range.startOffset - 1]
      : range.startContainer?.previousSibling;

    if (previousNode?.nodeType === Node.TEXT_NODE) {
      return String(previousNode.nodeValue || "");
    }

    if (previousNode?.nodeType === Node.ELEMENT_NODE && previousNode.matches?.("[data-ai-image-edit-preview-prompt-token]")) {
      return " ";
    }

    return "";
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptMenuClick = function handleAiImageEditPreviewPromptMenuClick(event) {
    with (this) {

    const presetButton = event.target?.closest?.("[data-ai-image-edit-preview-prompt-preset]");
    const viewer = event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]");
    const editor = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-input]");
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");

    event.preventDefault();
    event.stopPropagation();

    if (!presetButton || !event.currentTarget?.contains?.(presetButton)) {
      return;
    }

    if (!board || !editor) {
      return;
    }

    const beforeState = captureConnectionsHistoryState();
    insertAiImageEditPreviewPromptPreset(editor, presetButton.dataset.aiImageEditPreviewPromptPreset);
    const changed = !statesAreEqual(beforeState, captureConnectionsHistoryState());

    setAiImageEditPreviewPromptMenuOpen(viewer, false);

    if (changed) {
      pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-prompt-preset-${board.id}`,
        source: "ai-image-edit-preview-prompt-preset",
        type: "space-board-prompt-preset",
      });
    }
    }
  };

  Controller.prototype.removeAiImageEditPreviewPromptToken = function removeAiImageEditPreviewPromptToken(removeButton) {
    with (this) {

    const token = removeButton?.closest?.("[data-ai-image-edit-preview-prompt-token]");
    const editor = token?.closest?.("[data-ai-image-edit-preview-prompt-input]");
    const viewer = editor?.closest?.("[data-ai-image-edit-preview-viewer]");
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");

    if (!token || !editor || !board) {
      return false;
    }

    const beforeState = captureConnectionsHistoryState();
    const range = document.createRange();

    range.setStartBefore(token);
    range.collapse(true);
    token.remove();
    cleanEmptyAiImageEditPreviewPromptEditor(editor);

    const selection = window.getSelection?.();

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      aiImageEditPreviewPromptSelectionRange = range.cloneRange();
    }

    editor.focus({ preventScroll: true });
    syncAiImageEditPreviewPromptToBoard(editor);
    const changed = !statesAreEqual(beforeState, captureConnectionsHistoryState());

    if (changed) {
      pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-prompt-preset-${board.id}`,
        source: "ai-image-edit-preview-prompt-preset-clear",
        type: "space-board-prompt-preset",
      });
    }

    return changed;
    }
  };

  Controller.prototype.commitAiImageEditPreviewPromptInput = function commitAiImageEditPreviewPromptInput(input) {
    with (this) {

    const viewer = input?.closest?.("[data-ai-image-edit-preview-viewer]");
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");
    const editState = promptEditState;

    if (!board || !editState || editState.boardId !== board.id) {
      return;
    }

    promptEditState = null;

    const nextValue = serializeAiImageEditPreviewPromptEditor(input).text;

    if (nextValue === editState.value) {
      return;
    }

    pushConnectionsHistoryEntry(editState.beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-prompt-${board.id}`,
      source: "ai-image-edit-preview-prompt-input",
      type: "space-board-prompt",
    });
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptBlur = function handleAiImageEditPreviewPromptBlur(event) {
    with (this) {

    commitAiImageEditPreviewPromptInput(event.currentTarget);
    }
  };

  Controller.prototype.handleAiImageEditPreviewPromptKeyDown = function handleAiImageEditPreviewPromptKeyDown(event) {
    with (this) {

    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      triggerAiImageEditPreviewGenerate(event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]"));
      return;
    }

    stopSpaceBoardControlEvent(event);
    }
  };

  Controller.prototype.handleAiImageEditPreviewSendClick = function handleAiImageEditPreviewSendClick(event) {
    with (this) {

    event.preventDefault();
    event.stopPropagation();
    triggerAiImageEditPreviewGenerate(event.currentTarget?.closest?.("[data-ai-image-edit-preview-viewer]"));
    }
  };

  Controller.prototype.triggerAiImageEditPreviewGenerate = function triggerAiImageEditPreviewGenerate(viewer) {
    with (this) {

    const promptInput = viewer?.querySelector?.("[data-ai-image-edit-preview-prompt-input]");
    const board = getSpaceBoardById(viewer?.dataset?.boardId || "");

    if (!board || !shouldHandleAiImageGenerateActivation({ type: "click" }, board.id)) {
      return false;
    }

    syncAiImageEditPreviewPromptToBoard(promptInput);
    requestAiImageBoardGeneration(board.id, "ai-image-edit-preview");
    syncAiImageEditPreviewViewerFromBoard();
    return true;
    }
  };

  Controller.prototype.handleAiImageBoardEditPreviewKeyDown = function handleAiImageBoardEditPreviewKeyDown(event) {
    with (this) {

    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeAiImageBoardEditPreview();
    }
  };

  Controller.prototype.handleAiImageBoardEditPreviewResize = function handleAiImageBoardEditPreviewResize() {
    with (this) {

    if (!aiImageEditPreviewViewer || aiImageEditPreviewViewer.hidden) {
      return;
    }

    if (!isAiImageBoardEditPreviewViewportAllowed()) {
      closeAiImageBoardEditPreview();
    }
    }
  };

})(window.CBO);

