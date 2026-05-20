window.CBO = window.CBO || {};



(function registerAiBoardEnlargeViewerJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-enlarge-viewer.js.");

  }



  Controller.prototype.ensureAiImageBoardEnlargeViewer = function ensureAiImageBoardEnlargeViewer() {
    with (this) {

    if (aiImageEnlargeViewer?.isConnected) {
      return aiImageEnlargeViewer;
    }

    aiImageEnlargeViewer?.remove();
    aiImageEnlargeViewer = document.createElement("div");
    aiImageEnlargeViewer.className = "editor-ai-image-enlarge-viewer";
    aiImageEnlargeViewer.dataset.aiImageEnlargeViewer = "";
    aiImageEnlargeViewer.hidden = true;
    aiImageEnlargeViewer.setAttribute("aria-hidden", "true");
    aiImageEnlargeViewer.setAttribute("aria-label", "Image preview");
    aiImageEnlargeViewer.setAttribute("aria-modal", "true");
    aiImageEnlargeViewer.setAttribute("role", "dialog");
    aiImageEnlargeViewer.innerHTML = `
      <div class="editor-ai-image-enlarge-shell" data-ai-image-enlarge-shell>
        <div class="editor-ai-image-enlarge-header" data-ai-image-enlarge-header>
          <button class="editor-ai-image-enlarge-close" type="button" aria-label="Close preview" data-ai-image-enlarge-close>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
          <div class="editor-ai-image-enlarge-title" data-ai-image-enlarge-title></div>
          <div class="editor-ai-image-enlarge-actions">
            <button class="editor-ai-image-enlarge-download" type="button" data-ai-image-enlarge-download disabled aria-disabled="true">Download</button>
          </div>
        </div>
        <div class="editor-ai-image-enlarge-stage" data-ai-image-enlarge-stage>
          <img class="editor-ai-image-enlarge-image" data-ai-image-enlarge-image alt="" draggable="false">
          <div class="editor-ai-image-enlarge-meta">
            <span data-ai-image-enlarge-zoom>100%</span>
            <span data-ai-image-enlarge-dimensions></span>
          </div>
        </div>
      </div>
    `;

    const stage = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-stage]");
    const image = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-image]");

    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-close]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        stopSpaceBoardControlEvent(event);
        closeAiImageBoardEnlargeViewer();
      });
    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-download]")
      ?.addEventListener("click", stopSpaceBoardControlEvent);
    stage?.addEventListener("wheel", handleAiImageBoardEnlargeWheel, { passive: false });
    stage?.addEventListener("auxclick", handleAiImageBoardEnlargeAuxClick);
    stage?.addEventListener("pointerdown", handleAiImageBoardEnlargePointerDown);
    stage?.addEventListener("pointermove", handleAiImageBoardEnlargePointerMove);
    stage?.addEventListener("pointerup", handleAiImageBoardEnlargePointerEnd);
    stage?.addEventListener("pointercancel", handleAiImageBoardEnlargePointerEnd);
    image?.addEventListener("load", requestAiImageBoardEnlargeRender);

    document.body.appendChild(aiImageEnlargeViewer);
    return aiImageEnlargeViewer;
    }
  };

  Controller.prototype.openAiImageBoardEnlargeViewer = function openAiImageBoardEnlargeViewer(boardId) {
    with (this) {

    const board = getSpaceBoardById(boardId);
    const media = getAiImageBoardEnlargeMedia(board);

    if (!media || !isAiImageBoardEnlargeViewportAllowed()) {
      return false;
    }

    closeAiImageBoardEditPreview();

    const viewer = ensureAiImageBoardEnlargeViewer();
    const stage = viewer.querySelector("[data-ai-image-enlarge-stage]");
    const image = viewer.querySelector("[data-ai-image-enlarge-image]");
    const title = viewer.querySelector("[data-ai-image-enlarge-title]");
    const dimensions = viewer.querySelector("[data-ai-image-enlarge-dimensions]");
    const closeButton = viewer.querySelector("[data-ai-image-enlarge-close]");

    if (!stage || !image) {
      return false;
    }

    cancelAiImageBoardEnlargeRender();
    aiImageEnlargeState = {
      activePointers: new Map(),
      boardId: board.id,
      frame: 0,
      gesture: "",
      image,
      isPanning: false,
      lastPointerX: 0,
      lastPointerY: 0,
      mediaHeight: media.height,
      mediaWidth: media.width,
      offsetX: 0,
      offsetY: 0,
      pinchCenterX: 0,
      pinchCenterY: 0,
      pinchStartDistance: 0,
      pinchStartOffsetX: 0,
      pinchStartOffsetY: 0,
      pinchStartScale: AI_IMAGE_ENLARGE_MIN_SCALE,
      pointerId: null,
      scale: AI_IMAGE_ENLARGE_MIN_SCALE,
      src: media.src,
      stage,
      viewer,
    };

    viewer.dataset.boardId = board.id;
    viewer.classList.remove("is-panning", "is-zoomed");
    viewer.hidden = false;
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("editor-ai-image-enlarge-open");

    if (title) {
      title.textContent = media.name;
    }

    if (dimensions) {
      dimensions.textContent = `${media.width}x${media.height} px`;
    }

    image.alt = media.name;
    image.decoding = "async";
    image.loading = "eager";
    image.style.removeProperty("height");
    image.style.transform = "translate3d(0px, 0px, 0) scale(1)";
    image.style.removeProperty("width");

    if (image.getAttribute("src") !== media.src) {
      image.src = media.src;
    }

    window.addEventListener("keydown", handleAiImageBoardEnlargeKeyDown, true);
    window.addEventListener("resize", handleAiImageBoardEnlargeResize);
    requestAiImageBoardEnlargeRender();
    closeButton?.focus?.({ preventScroll: true });
    return true;
    }
  };

  Controller.prototype.closeAiImageBoardEnlargeViewer = function closeAiImageBoardEnlargeViewer() {
    with (this) {

    cancelAiImageBoardEnlargeRender();

    const viewer = aiImageEnlargeViewer;
    const image = viewer?.querySelector?.("[data-ai-image-enlarge-image]");

    aiImageEnlargeState = null;
    window.removeEventListener("keydown", handleAiImageBoardEnlargeKeyDown, true);
    window.removeEventListener("resize", handleAiImageBoardEnlargeResize);
    document.body.classList.remove("editor-ai-image-enlarge-open");

    if (!viewer) {
      return;
    }

    viewer.hidden = true;
    viewer.classList.remove("is-panning", "is-zoomed");
    viewer.setAttribute("aria-hidden", "true");
    delete viewer.dataset.boardId;

    if (image) {
      image.alt = "";
      image.style.removeProperty("height");
      image.style.removeProperty("transform");
      image.style.removeProperty("width");
      image.removeAttribute("src");
    }
    }
  };

  Controller.prototype.cancelAiImageBoardEnlargeRender = function cancelAiImageBoardEnlargeRender() {
    with (this) {

    if (!aiImageEnlargeState?.frame || typeof window.cancelAnimationFrame !== "function") {
      if (aiImageEnlargeState) {
        aiImageEnlargeState.frame = 0;
      }
      return;
    }

    window.cancelAnimationFrame(aiImageEnlargeState.frame);
    aiImageEnlargeState.frame = 0;
    }
  };

  Controller.prototype.requestAiImageBoardEnlargeRender = function requestAiImageBoardEnlargeRender() {
    with (this) {

    if (!aiImageEnlargeState || aiImageEnlargeState.frame) {
      return;
    }

    if (typeof window.requestAnimationFrame !== "function") {
      renderAiImageBoardEnlargeTransform();
      return;
    }

    aiImageEnlargeState.frame = window.requestAnimationFrame(renderAiImageBoardEnlargeTransform);
    }
  };

  Controller.prototype.renderAiImageBoardEnlargeTransform = function renderAiImageBoardEnlargeTransform() {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state) {
      return;
    }

    state.frame = 0;
    syncAiImageBoardEnlargeBaseSize();
    clampAiImageBoardEnlargePan();

    const scale = roundAiImageBoardEnlargeNumber(state.scale);
    const offsetX = roundAiImageBoardEnlargeNumber(state.offsetX);
    const offsetY = roundAiImageBoardEnlargeNumber(state.offsetY);
    const isZoomed = state.scale > AI_IMAGE_ENLARGE_MIN_SCALE + 0.01;
    const zoomLabel = state.viewer.querySelector("[data-ai-image-enlarge-zoom]");

    state.image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    state.viewer.classList.toggle("is-zoomed", isZoomed);
    state.stage.dataset.zoomed = isZoomed ? "true" : "false";

    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
    }
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeWheel = function handleAiImageBoardEnlargeWheel(event) {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const wheelDelta = getAiImageBoardEnlargeWheelDelta(event, state.stage);
    const deltaY = wheelDelta.y || wheelDelta.x;
    const nextScale = clampAiImageBoardEnlargeValue(
      state.scale * Math.exp(-deltaY * AI_IMAGE_ENLARGE_WHEEL_SPEED),
      AI_IMAGE_ENLARGE_MIN_SCALE,
      AI_IMAGE_ENLARGE_MAX_SCALE,
    );

    if (Math.abs(nextScale - state.scale) < 0.001) {
      return;
    }

    if (nextScale <= AI_IMAGE_ENLARGE_MIN_SCALE + 0.001) {
      state.scale = AI_IMAGE_ENLARGE_MIN_SCALE;
      state.offsetX = 0;
      state.offsetY = 0;
      requestAiImageBoardEnlargeRender();
      return;
    }

    const stageRect = state.stage.getBoundingClientRect();
    const pointerX = event.clientX - stageRect.left - (stageRect.width / 2);
    const pointerY = event.clientY - stageRect.top - (stageRect.height / 2);
    const imagePointX = (pointerX - state.offsetX) / state.scale;
    const imagePointY = (pointerY - state.offsetY) / state.scale;

    state.scale = nextScale;
    state.offsetX = pointerX - (imagePointX * nextScale);
    state.offsetY = pointerY - (imagePointY * nextScale);
    clampAiImageBoardEnlargePan();
    requestAiImageBoardEnlargeRender();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargePointerDown = function handleAiImageBoardEnlargePointerDown(event) {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state || !isAiImageBoardEnlargePanPointer(event)) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    state.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    try {
      state.stage.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Pointer capture is a smoothness improvement, not a hard requirement.
    }

    if (state.activePointers.size >= 2) {
      beginAiImageBoardEnlargePinch();
      return;
    }

    if (state.scale <= AI_IMAGE_ENLARGE_MIN_SCALE + 0.01) {
      return;
    }

    state.gesture = "pan";
    state.isPanning = true;
    state.pointerId = event.pointerId;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.viewer.classList.add("is-panning");
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeAuxClick = function handleAiImageBoardEnlargeAuxClick(event) {
    with (this) {

    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    }
  };

  Controller.prototype.isAiImageBoardEnlargePanPointer = function isAiImageBoardEnlargePanPointer(event) {
    with (this) {

    return event.pointerType === "touch" ||
      event.button === 0 ||
      event.button === 1;
    }
  };

  Controller.prototype.handleAiImageBoardEnlargePointerMove = function handleAiImageBoardEnlargePointerMove(event) {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state?.activePointers?.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    state.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (state.activePointers.size >= 2) {
      updateAiImageBoardEnlargePinch();
      return;
    }

    if (!state.isPanning || state.pointerId !== event.pointerId) {
      if (state.scale <= AI_IMAGE_ENLARGE_MIN_SCALE + 0.01) {
        return;
      }

      state.gesture = "pan";
      state.isPanning = true;
      state.pointerId = event.pointerId;
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      state.viewer.classList.add("is-panning");
      return;
    }

    state.offsetX += event.clientX - state.lastPointerX;
    state.offsetY += event.clientY - state.lastPointerY;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    clampAiImageBoardEnlargePan();
    requestAiImageBoardEnlargeRender();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargePointerEnd = function handleAiImageBoardEnlargePointerEnd(event) {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state?.activePointers?.has(event.pointerId)) {
      return;
    }

    stopSpaceBoardControlEvent(event);
    state.activePointers.delete(event.pointerId);

    try {
      state.stage.releasePointerCapture?.(event.pointerId);
    } catch (_error) {
      // The browser may release capture before pointerup.
    }

    if (state.activePointers.size >= 2) {
      beginAiImageBoardEnlargePinch();
      return;
    }

    const remainingPointer = getAiImageBoardEnlargePrimaryPointer(state);

    if (remainingPointer && state.scale > AI_IMAGE_ENLARGE_MIN_SCALE + 0.01) {
      state.gesture = "pan";
      state.isPanning = true;
      state.pointerId = remainingPointer.id;
      state.lastPointerX = remainingPointer.x;
      state.lastPointerY = remainingPointer.y;
      state.viewer.classList.add("is-panning");
      return;
    }

    state.gesture = "";
    state.isPanning = false;
    state.pointerId = null;
    state.viewer.classList.remove("is-panning");
    }
  };

  Controller.prototype.beginAiImageBoardEnlargePinch = function beginAiImageBoardEnlargePinch() {
    with (this) {

    const state = aiImageEnlargeState;
    const pinch = getAiImageBoardEnlargePinchMetrics(state);

    if (!state || !pinch) {
      return;
    }

    state.gesture = "pinch";
    state.isPanning = false;
    state.pointerId = null;
    state.pinchStartDistance = pinch.distance;
    state.pinchStartScale = state.scale;
    state.pinchStartOffsetX = state.offsetX;
    state.pinchStartOffsetY = state.offsetY;
    state.pinchCenterX = pinch.centerX;
    state.pinchCenterY = pinch.centerY;
    state.viewer.classList.remove("is-panning");
    }
  };

  Controller.prototype.updateAiImageBoardEnlargePinch = function updateAiImageBoardEnlargePinch() {
    with (this) {

    const state = aiImageEnlargeState;
    const pinch = getAiImageBoardEnlargePinchMetrics(state);

    if (!state || !pinch) {
      return;
    }

    if (state.gesture !== "pinch" || state.pinchStartDistance <= 0) {
      beginAiImageBoardEnlargePinch();
      return;
    }

    const nextScale = clampAiImageBoardEnlargeValue(
      state.pinchStartScale * (pinch.distance / state.pinchStartDistance),
      AI_IMAGE_ENLARGE_MIN_SCALE,
      AI_IMAGE_ENLARGE_MAX_SCALE,
    );
    const imagePointX = (state.pinchCenterX - state.pinchStartOffsetX) / state.pinchStartScale;
    const imagePointY = (state.pinchCenterY - state.pinchStartOffsetY) / state.pinchStartScale;

    state.scale = nextScale;
    state.offsetX = pinch.centerX - (imagePointX * nextScale);
    state.offsetY = pinch.centerY - (imagePointY * nextScale);
    clampAiImageBoardEnlargePan();
    requestAiImageBoardEnlargeRender();
    }
  };

  Controller.prototype.getAiImageBoardEnlargePinchMetrics = function getAiImageBoardEnlargePinchMetrics(state) {
    with (this) {

    const pointers = Array.from(state?.activePointers?.entries?.() || []);

    if (pointers.length < 2) {
      return null;
    }

    const first = pointers[0][1];
    const second = pointers[1][1];
    const stageRect = state.stage.getBoundingClientRect();
    const firstX = first.x - stageRect.left - (stageRect.width / 2);
    const firstY = first.y - stageRect.top - (stageRect.height / 2);
    const secondX = second.x - stageRect.left - (stageRect.width / 2);
    const secondY = second.y - stageRect.top - (stageRect.height / 2);
    const distance = Math.hypot(secondX - firstX, secondY - firstY);

    if (distance < AI_IMAGE_ENLARGE_PINCH_MIN_DISTANCE_PX) {
      return null;
    }

    return {
      centerX: (firstX + secondX) / 2,
      centerY: (firstY + secondY) / 2,
      distance,
    };
    }
  };

  Controller.prototype.getAiImageBoardEnlargePrimaryPointer = function getAiImageBoardEnlargePrimaryPointer(state) {
    with (this) {

    const pointer = Array.from(state?.activePointers?.entries?.() || [])[0];

    if (!pointer) {
      return null;
    }

    return {
      id: pointer[0],
      x: pointer[1].x,
      y: pointer[1].y,
    };
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeKeyDown = function handleAiImageBoardEnlargeKeyDown(event) {
    with (this) {

    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeAiImageBoardEnlargeViewer();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeResize = function handleAiImageBoardEnlargeResize() {
    with (this) {

    if (!aiImageEnlargeState) {
      return;
    }

    if (!isAiImageBoardEnlargeViewportAllowed()) {
      closeAiImageBoardEnlargeViewer();
      return;
    }

    requestAiImageBoardEnlargeRender();
    }
  };

  Controller.prototype.clampAiImageBoardEnlargePan = function clampAiImageBoardEnlargePan() {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state) {
      return;
    }

    state.scale = clampAiImageBoardEnlargeValue(
      state.scale,
      AI_IMAGE_ENLARGE_MIN_SCALE,
      AI_IMAGE_ENLARGE_MAX_SCALE,
    );

    if (state.scale <= AI_IMAGE_ENLARGE_MIN_SCALE + 0.001) {
      state.scale = AI_IMAGE_ENLARGE_MIN_SCALE;
      state.offsetX = 0;
      state.offsetY = 0;
      return;
    }

    const stageSize = getAiImageBoardEnlargeStageContentSize(state.stage);
    const baseWidth = Number(state.image.offsetWidth) || 0;
    const baseHeight = Number(state.image.offsetHeight) || 0;

    if (!stageSize.width || !stageSize.height || !baseWidth || !baseHeight) {
      state.offsetX = 0;
      state.offsetY = 0;
      return;
    }

    const scaledWidth = baseWidth * state.scale;
    const scaledHeight = baseHeight * state.scale;
    const overflowX = Math.max(0, (scaledWidth - stageSize.width) / 2);
    const overflowY = Math.max(0, (scaledHeight - stageSize.height) / 2);
    const edgeSlackX = overflowX
      ? Math.min(stageSize.width * AI_IMAGE_ENLARGE_EDGE_SLACK_RATIO, AI_IMAGE_ENLARGE_EDGE_SLACK_MAX_PX)
      : 0;
    const edgeSlackY = overflowY
      ? Math.min(stageSize.height * AI_IMAGE_ENLARGE_EDGE_SLACK_RATIO, AI_IMAGE_ENLARGE_EDGE_SLACK_MAX_PX)
      : 0;
    const maxOffsetX = overflowX + edgeSlackX;
    const maxOffsetY = overflowY + edgeSlackY;

    state.offsetX = maxOffsetX
      ? clampAiImageBoardEnlargeValue(state.offsetX, -maxOffsetX, maxOffsetX)
      : 0;
    state.offsetY = maxOffsetY
      ? clampAiImageBoardEnlargeValue(state.offsetY, -maxOffsetY, maxOffsetY)
      : 0;
    }
  };

  Controller.prototype.syncAiImageBoardEnlargeBaseSize = function syncAiImageBoardEnlargeBaseSize() {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state) {
      return false;
    }

    const stageSize = getAiImageBoardEnlargeStageContentSize(state.stage);
    const naturalWidth = Math.max(1, Number(state.image.naturalWidth) || Number(state.mediaWidth) || 1);
    const naturalHeight = Math.max(1, Number(state.image.naturalHeight) || Number(state.mediaHeight) || 1);

    if (!stageSize.width || !stageSize.height || !naturalWidth || !naturalHeight) {
      return false;
    }

    const fitScale = Math.min(stageSize.width / naturalWidth, stageSize.height / naturalHeight);
    const baseWidth = Math.max(1, Math.floor(naturalWidth * fitScale));
    const baseHeight = Math.max(1, Math.floor(naturalHeight * fitScale));
    const nextWidth = `${baseWidth}px`;
    const nextHeight = `${baseHeight}px`;

    if (state.image.style.width !== nextWidth) {
      state.image.style.width = nextWidth;
    }

    if (state.image.style.height !== nextHeight) {
      state.image.style.height = nextHeight;
    }

    return true;
    }
  };

  Controller.prototype.getAiImageBoardEnlargeStageContentSize = function getAiImageBoardEnlargeStageContentSize(stage) {
    with (this) {

    const rect = stage?.getBoundingClientRect?.();

    if (!rect) {
      return { height: 0, width: 0 };
    }

    const style = typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(stage)
      : null;
    const paddingLeft = Number.parseFloat(style?.paddingLeft || "0") || 0;
    const paddingRight = Number.parseFloat(style?.paddingRight || "0") || 0;
    const paddingTop = Number.parseFloat(style?.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style?.paddingBottom || "0") || 0;

    return {
      height: Math.max(1, rect.height - paddingTop - paddingBottom),
      width: Math.max(1, rect.width - paddingLeft - paddingRight),
    };
    }
  };

  Controller.prototype.getAiImageBoardEnlargeWheelDelta = function getAiImageBoardEnlargeWheelDelta(event, stage) {
    with (this) {

    const stageSize = getAiImageBoardEnlargeStageContentSize(stage);
    const multiplier = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? Math.max(1, stageSize.height)
        : 1;

    return {
      x: (Number(event.deltaX) || 0) * multiplier,
      y: (Number(event.deltaY) || 0) * multiplier,
    };
    }
  };

  Controller.prototype.clampAiImageBoardEnlargeValue = function clampAiImageBoardEnlargeValue(value, min, max) {
    with (this) {

    const nextValue = Number(value);

    if (!Number.isFinite(nextValue)) {
      return min;
    }

    return Math.min(max, Math.max(min, nextValue));
    }
  };

  Controller.prototype.roundAiImageBoardEnlargeNumber = function roundAiImageBoardEnlargeNumber(value) {
    with (this) {

    return Math.round((Number(value) || 0) * 1000) / 1000;
    }
  };

})(window.CBO);

