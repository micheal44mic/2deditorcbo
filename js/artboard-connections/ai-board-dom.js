window.CBO = window.CBO || {};



(function registerAiBoardDomJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-dom.js.");

  }



  Controller.prototype.ensureAiImageBoardElement = function ensureAiImageBoardElement(boardId) {
    with (this) {

    const pane = ensureSpaceBoardPane();
    const normalizedBoardId = String(boardId || "").trim();

    if (!pane || !normalizedBoardId) {
      return null;
    }

    let board = Array.from(pane.querySelectorAll("[data-ai-image-board]"))
      .find((element) => element.dataset.boardId === normalizedBoardId) || null;

    if (!board) {
      board = document.createElement("div");
      board.className = shouldUsePlainAiBoardArtboards()
        ? "editor-ai-image-board is-plain-artboard editor-artboard-frame"
        : "editor-ai-image-board";
      board.dataset.aiImageBoard = "";
      board.dataset.boardId = normalizedBoardId;
      board.innerHTML = shouldUsePlainAiBoardArtboards()
        ? `
          <div class="editor-ai-image-board-action-toolbar" data-ai-image-board-action-toolbar aria-hidden="true">
            ${getAiImageBoardActionToolbarMarkup()}
          </div>
          <span class="editor-artboard-frame-label" data-ai-image-board-drag-handle></span>
          <span class="editor-ai-image-board-dimensions" data-ai-image-board-dimensions></span>
          <span class="editor-ai-image-board-selection-shadow" data-ai-image-board-selection-shadow aria-hidden="true"></span>
          <div class="editor-ai-image-board-surface editor-artboard-paper">
            <div class="editor-ai-image-board-media" data-ai-image-board-media></div>
            <div class="editor-ai-image-board-caption" data-ai-image-board-caption hidden>
              <div class="editor-ai-image-board-caption-text" data-ai-image-board-caption-text></div>
              <div class="editor-ai-image-board-caption-editor" data-ai-image-board-caption-editor role="textbox" aria-label="AI image caption" data-placeholder="${AI_IMAGE_CAPTION_PLACEHOLDER}" spellcheck="true"></div>
            </div>
          </div>
          <div class="editor-ai-image-board-input" data-ai-image-board-input-handle aria-hidden="true"></div>
          <button class="editor-ai-image-board-play" type="button" aria-label="Generate image" data-ai-image-board-generate>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>
            </svg>
          </button>
        `
        : `
          <div class="editor-ai-image-board-action-toolbar" data-ai-image-board-action-toolbar aria-hidden="true">
            ${getAiImageBoardActionToolbarMarkup()}
          </div>
          <div class="editor-ai-image-board-label" data-ai-image-board-drag-handle></div>
          <div class="editor-ai-image-board-surface"></div>
          <div class="editor-ai-image-board-input" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
              <circle cx="9" cy="9" r="2"></circle>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
            </svg>
          </div>
        `;
      board.addEventListener("pointerdown", handleAiImageBoardPointerDown, true);
      board.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelector("[data-ai-image-board-drag-handle]")?.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerup", handleAiImageGenerateClick);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("click", handleAiImageGenerateClick);
      board.addEventListener("wheel", handleSpaceBoardWheel, { passive: false });
      ensureAiImageBoardCaptionControls(board);
      pane.appendChild(board);
    }

    board.dataset.boardId = normalizedBoardId;
    ensureAiImageBoardActionToolbar(board);
    board.classList.toggle("is-plain-artboard", shouldUsePlainAiBoardArtboards());
    if (shouldUsePlainAiBoardArtboards()) {
      const surface = board.querySelector(".editor-ai-image-board-surface");

      if (!board.querySelector("[data-ai-image-board-dimensions]")) {
        surface?.insertAdjacentHTML?.("beforebegin", `
          <span class="editor-ai-image-board-dimensions" data-ai-image-board-dimensions></span>
        `);
      }

      if (!board.querySelector("[data-ai-image-board-selection-shadow]")) {
        surface?.insertAdjacentHTML?.("beforebegin", `
          <span class="editor-ai-image-board-selection-shadow" data-ai-image-board-selection-shadow aria-hidden="true"></span>
        `);
      }

      if (surface && !surface.querySelector("[data-ai-image-board-media]")) {
        surface.insertAdjacentHTML("afterbegin", `
          <div class="editor-ai-image-board-media" data-ai-image-board-media></div>
        `);
      }
      ensureAiImageBoardCaptionControls(board);
    }
    return board;
    }
  };

  Controller.prototype.ensureAiImageBoardCaptionControls = function ensureAiImageBoardCaptionControls(element) {
    with (this) {

    const surface = element?.querySelector?.(".editor-ai-image-board-surface");

    if (!surface) {
      return null;
    }

    let caption = surface.querySelector("[data-ai-image-board-caption]");

    if (!caption) {
      surface.insertAdjacentHTML("beforeend", `
        <div class="editor-ai-image-board-caption" data-ai-image-board-caption hidden>
          <div class="editor-ai-image-board-caption-text" data-ai-image-board-caption-text></div>
          <div class="editor-ai-image-board-caption-editor" data-ai-image-board-caption-editor role="textbox" aria-label="AI image caption" data-placeholder="${AI_IMAGE_CAPTION_PLACEHOLDER}" spellcheck="true"></div>
        </div>
      `);
      caption = surface.querySelector("[data-ai-image-board-caption]");
    }

    if (caption && caption.dataset.captionControlsBound !== "true") {
      caption.dataset.captionControlsBound = "true";
      caption.addEventListener("pointerdown", handleAiImageCaptionPointerDown);
      caption.addEventListener("click", handleAiImageCaptionClick);
      const editor = caption.querySelector("[data-ai-image-board-caption-editor]");

      editor?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      editor?.addEventListener("click", stopSpaceBoardControlEvent);
      editor?.addEventListener("focus", handleAiImageCaptionFocus);
      editor?.addEventListener("input", handleAiImageCaptionInput);
      editor?.addEventListener("blur", handleAiImageCaptionBlur);
      editor?.addEventListener("keydown", stopSpaceBoardControlEvent);
    }

    return caption;
    }
  };

  Controller.prototype.ensureAiImageBoardHeavyContent = function ensureAiImageBoardHeavyContent(element) {
    with (this) {

    if (shouldUsePlainAiBoardArtboards()) {
      return false;
    }

    if (!element || element.dataset.aiImageBoardHeavyMounted === "true") {
      return Boolean(element);
    }

    const surface = element.querySelector(".editor-ai-image-board-surface");

    surface?.insertAdjacentHTML("beforeend", `
      <div class="editor-ai-image-board-media" data-ai-image-board-media data-ai-image-board-heavy></div>
    `);
    element.insertAdjacentHTML("beforeend", `
      <div class="editor-ai-image-board-loading" aria-hidden="true" data-ai-image-board-heavy>
        <div class="editor-ai-image-board-loading-halo"></div>
        <div class="editor-ai-image-board-loading-text">Your image is being generated...</div>
      </div>
      <div class="editor-ai-image-board-prompt-title" aria-hidden="true" data-ai-image-board-heavy>What image do you want to generate?</div>
      <div class="editor-ai-image-board-footer" data-ai-image-board-footer data-ai-image-board-heavy>
        <textarea class="editor-ai-image-board-prompt-input" data-ai-image-board-prompt-input aria-label="AI image prompt" placeholder="${AI_IMAGE_PROMPT_PLACEHOLDER}" spellcheck="true"></textarea>
      </div>
      <button class="editor-ai-image-board-generate" type="button" aria-label="Generate image" data-ai-image-board-generate data-ai-image-board-heavy>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>
        </svg>
      </button>
    `);

    element.querySelector("[data-ai-image-board-footer]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
    element.querySelector("[data-ai-image-board-footer]")?.addEventListener("click", stopSpaceBoardControlEvent);
    element.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
    element.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerup", handleAiImageGenerateClick);
    element.querySelector("[data-ai-image-board-generate]")?.addEventListener("click", handleAiImageGenerateClick);
    element.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("focus", handleAiImagePromptFocus);
    element.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("input", handleAiImagePromptInput);
    element.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("blur", handleAiImagePromptBlur);
    element.querySelector("[data-ai-image-board-prompt-input]")?.addEventListener("keydown", stopSpaceBoardControlEvent);
    element.dataset.aiImageBoardHeavyMounted = "true";
    element.classList.add("is-heavy-mounted");

    return true;
    }
  };

  Controller.prototype.unmountAiImageBoardHeavyContent = function unmountAiImageBoardHeavyContent(element) {
    with (this) {

    if (shouldUsePlainAiBoardArtboards() || !element || element.matches?.(":focus-within")) {
      return false;
    }

    element.querySelector("[data-ai-image-board-media]")?.replaceChildren();
    element.querySelectorAll("[data-ai-image-board-heavy]").forEach((node) => node.remove());
    delete element.dataset.aiImageBoardHeavyMounted;
    element.classList.remove("is-heavy-mounted", "is-generating");

    return true;
    }
  };

  Controller.prototype.ensureConnectionLayer = function ensureConnectionLayer() {
    with (this) {

    const pane = ensureSpaceBoardPane();
    const stage = getStage();

    if (!pane || !stage || !getRenderer()) {
      return null;
    }

    const plainArtboardMode = shouldUsePlainAiBoardArtboards();
    const desiredParent = plainArtboardMode ? stage : pane;
    let svg = Array.from(desiredParent.children || [])
      .find((child) => child.matches?.("[data-artboard-connection-layer]")) ||
      pane.querySelector("[data-artboard-connection-layer]") ||
      stage.querySelector("[data-artboard-connection-layer]");

    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("editor-artboard-connection-layer");
      svg.dataset.artboardConnectionLayer = "";
    }

    svg.classList.toggle("is-stage-underlay", plainArtboardMode);

    if (plainArtboardMode) {
      const paperLayer = stage.querySelector("[data-artboard-paper-layer]");

      if (svg.parentElement !== stage || (paperLayer && svg.nextElementSibling !== paperLayer)) {
        stage.insertBefore(svg, paperLayer || null);
      }
    } else if (svg.parentElement !== pane || pane.firstElementChild !== svg) {
      pane.insertBefore(svg, pane.firstElementChild || null);
    }

    if (plainArtboardMode) {
      const rect = stage.getBoundingClientRect?.() || { width: 1, height: 1 };
      const width = Math.max(1, Number(stage.clientWidth || rect.width) || 1);
      const height = Math.max(1, Number(stage.clientHeight || rect.height) || 1);

      setStylePropertyIfChanged(svg, "width", `${width}px`);
      setStylePropertyIfChanged(svg, "height", `${height}px`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    } else {
      setStylePropertyIfChanged(svg, "width", "1px");
      setStylePropertyIfChanged(svg, "height", "1px");
      svg.setAttribute("width", "1");
      svg.setAttribute("height", "1");
      svg.setAttribute("viewBox", "0 0 1 1");
    }

    return svg;
    }
  };

})(window.CBO);

