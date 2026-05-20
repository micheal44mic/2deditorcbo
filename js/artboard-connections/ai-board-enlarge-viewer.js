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
          <video class="editor-ai-image-enlarge-image editor-ai-image-enlarge-video" data-ai-image-enlarge-video muted loop playsinline preload="metadata" hidden></video>
          <div class="editor-ai-image-enlarge-video-controls" data-ai-image-enlarge-video-controls hidden aria-hidden="true">
            <div class="editor-ai-image-enlarge-video-controls-glass" aria-hidden="true"></div>
            <div class="editor-ai-image-enlarge-video-controls-content">
              <div class="editor-ai-image-enlarge-video-controls-row">
                <div class="editor-ai-image-enlarge-video-controls-side is-left">
                  <button class="editor-ai-image-enlarge-video-control-button" type="button" aria-label="Disable loop" aria-pressed="true" data-ai-image-enlarge-video-loop>
                    ${getAiImageBoardEnlargeVideoIconMarkup("repeat")}
                  </button>
                </div>
                <button class="editor-ai-image-enlarge-video-control-button is-play" type="button" aria-label="Pause video" data-ai-image-enlarge-video-play>
                  ${getAiImageBoardEnlargeVideoIconMarkup("pause")}
                </button>
                <div class="editor-ai-image-enlarge-video-controls-side is-right">
                  <button class="editor-ai-image-enlarge-video-control-button" type="button" aria-label="Unmute video" data-ai-image-enlarge-video-mute>
                    ${getAiImageBoardEnlargeVideoIconMarkup("volume-off")}
                  </button>
                  <button class="editor-ai-image-enlarge-video-control-button" type="button" aria-label="Enter fullscreen" data-ai-image-enlarge-video-fullscreen>
                    ${getAiImageBoardEnlargeVideoIconMarkup("fullscreen")}
                  </button>
                </div>
              </div>
              <div class="editor-ai-image-enlarge-video-progress-row">
                <span class="editor-ai-image-enlarge-video-time" data-ai-image-enlarge-video-current>00:00</span>
                <div class="editor-ai-image-enlarge-video-progress" role="slider" tabindex="0" aria-label="Video progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-ai-image-enlarge-video-progress>
                  <div class="editor-ai-image-enlarge-video-progress-fill" data-ai-image-enlarge-video-progress-fill></div>
                </div>
                <span class="editor-ai-image-enlarge-video-time" data-ai-image-enlarge-video-duration>00:00</span>
              </div>
            </div>
          </div>
          <div class="editor-ai-image-enlarge-meta">
            <span data-ai-image-enlarge-zoom>100%</span>
            <span data-ai-image-enlarge-dimensions></span>
          </div>
        </div>
      </div>
    `;

    const stage = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-stage]");
    const image = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-image]");
    const video = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video]");
    const videoControls = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-controls]");
    const videoProgress = aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-progress]");

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
    stage?.addEventListener("mousemove", handleAiImageBoardEnlargeVideoControlsActivity);
    stage?.addEventListener("mouseenter", handleAiImageBoardEnlargeVideoControlsActivity);
    stage?.addEventListener("mouseleave", handleAiImageBoardEnlargeVideoControlsLeave);
    image?.addEventListener("load", requestAiImageBoardEnlargeRender);
    video?.addEventListener("loadedmetadata", requestAiImageBoardEnlargeRender);
    video?.addEventListener("loadedmetadata", syncAiImageBoardEnlargeVideoControls);
    video?.addEventListener("durationchange", syncAiImageBoardEnlargeVideoControls);
    video?.addEventListener("timeupdate", syncAiImageBoardEnlargeVideoControls);
    video?.addEventListener("play", handleAiImageBoardEnlargeVideoPlaybackChange);
    video?.addEventListener("pause", handleAiImageBoardEnlargeVideoPlaybackChange);
    video?.addEventListener("ended", handleAiImageBoardEnlargeVideoPlaybackChange);
    video?.addEventListener("volumechange", syncAiImageBoardEnlargeVideoControls);
    videoControls?.addEventListener("pointerdown", handleAiImageBoardEnlargeVideoControlsPointerDown);
    videoControls?.addEventListener("click", stopSpaceBoardControlEvent);
    videoControls?.addEventListener("wheel", handleAiImageBoardEnlargeVideoControlsWheel, { passive: false });
    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-loop]")
      ?.addEventListener("click", handleAiImageBoardEnlargeVideoLoopClick);
    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-play]")
      ?.addEventListener("click", handleAiImageBoardEnlargeVideoPlayClick);
    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-mute]")
      ?.addEventListener("click", handleAiImageBoardEnlargeVideoMuteClick);
    aiImageEnlargeViewer.querySelector("[data-ai-image-enlarge-video-fullscreen]")
      ?.addEventListener("click", handleAiImageBoardEnlargeVideoFullscreenClick);
    videoProgress?.addEventListener("pointerdown", handleAiImageBoardEnlargeVideoProgressPointerDown);
    videoProgress?.addEventListener("pointermove", handleAiImageBoardEnlargeVideoProgressPointerMove);
    videoProgress?.addEventListener("pointerup", handleAiImageBoardEnlargeVideoProgressPointerEnd);
    videoProgress?.addEventListener("pointercancel", handleAiImageBoardEnlargeVideoProgressPointerEnd);
    videoProgress?.addEventListener("keydown", handleAiImageBoardEnlargeVideoProgressKeyDown);
    document.addEventListener("fullscreenchange", syncAiImageBoardEnlargeVideoControls);
    document.addEventListener("webkitfullscreenchange", syncAiImageBoardEnlargeVideoControls);

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
    const video = viewer.querySelector("[data-ai-image-enlarge-video]");
    const title = viewer.querySelector("[data-ai-image-enlarge-title]");
    const dimensions = viewer.querySelector("[data-ai-image-enlarge-dimensions]");
    const closeButton = viewer.querySelector("[data-ai-image-enlarge-close]");

    const isVideo = media.kind === "video";
    const mediaElement = isVideo ? video : image;

    if (!stage || !image || !video || !mediaElement) {
      return false;
    }

    cancelAiImageBoardEnlargeRender();
    aiImageEnlargeState = {
      activePointers: new Map(),
      boardId: board.id,
      frame: 0,
      gesture: "",
      image: mediaElement,
      mediaKind: media.kind || "image",
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
      video: isVideo ? video : null,
      videoControlsIdleTimer: 0,
      videoSeekPointerId: null,
      viewer,
    };

    if (isVideo) {
      const boardPreviewVideo = getSpaceBoardElement(board.id)
        ?.querySelector?.("[data-ai-image-board-video]");

      pauseAiImageBoardVideoPreview(boardPreviewVideo);
    }

    viewer.dataset.boardId = board.id;
    viewer.classList.remove("is-panning", "is-zoomed", "is-video-preview");
    viewer.classList.toggle("is-video-preview", isVideo);
    viewer.hidden = false;
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("editor-ai-image-enlarge-open");
    setAiImageBoardEnlargeVideoControlsActive(isVideo);

    if (title) {
      title.textContent = media.name;
    }

    if (dimensions) {
      dimensions.textContent = `${media.width}x${media.height} px`;
    }

    image.hidden = isVideo;
    video.hidden = !isVideo;
    [image, video].forEach((element) => {
      element.style.removeProperty("height");
      element.style.transform = "translate3d(0px, 0px, 0) scale(1)";
      element.style.removeProperty("width");
    });

    if (isVideo) {
      image.alt = "";
      image.removeAttribute("src");
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.controls = false;
      video.playsInline = true;
      video.setAttribute("loop", "");
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.poster = media.posterSrc || "";
      if (video.getAttribute("src") !== media.src) {
        video.src = media.src;
      }
      syncAiImageBoardEnlargeVideoControls();
      showAiImageBoardEnlargeVideoControls();
      const playResult = video.play?.();

      if (playResult?.catch) {
        playResult.catch(() => {
          syncAiImageBoardEnlargeVideoControls();
          showAiImageBoardEnlargeVideoControls();
        });
      }
    } else {
      setAiImageBoardEnlargeVideoControlsActive(false);
      video.pause?.();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load?.();
      image.alt = media.name;
      image.decoding = "async";
      image.loading = "eager";

      if (image.getAttribute("src") !== media.src) {
        image.src = media.src;
      }
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
    clearAiImageBoardEnlargeVideoControlsTimer();

    const viewer = aiImageEnlargeViewer;
    const image = viewer?.querySelector?.("[data-ai-image-enlarge-image]");
    const video = viewer?.querySelector?.("[data-ai-image-enlarge-video]");

    aiImageEnlargeState = null;
    window.removeEventListener("keydown", handleAiImageBoardEnlargeKeyDown, true);
    window.removeEventListener("resize", handleAiImageBoardEnlargeResize);
    document.body.classList.remove("editor-ai-image-enlarge-open");

    if (!viewer) {
      return;
    }

    viewer.hidden = true;
    viewer.classList.remove("is-panning", "is-zoomed", "is-video-preview");
    viewer.setAttribute("aria-hidden", "true");
    delete viewer.dataset.boardId;
    setAiImageBoardEnlargeVideoControlsActive(false);

    if (image) {
      image.alt = "";
      image.style.removeProperty("height");
      image.style.removeProperty("transform");
      image.style.removeProperty("width");
      image.removeAttribute("src");
    }

    if (video) {
      video.pause?.();
      video.style.removeProperty("height");
      video.style.removeProperty("transform");
      video.style.removeProperty("width");
      video.controls = false;
      video.removeAttribute("poster");
      video.removeAttribute("src");
      video.load?.();
    }
    }
  };

  Controller.prototype.getAiImageBoardEnlargeVideoIconMarkup = function getAiImageBoardEnlargeVideoIconMarkup(icon) {
    with (this) {

    const icons = {
      "fullscreen": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
          <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
          <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
          <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
          <rect width="10" height="8" x="7" y="8" rx="1"></rect>
        </svg>
      `,
      "minimize": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
          <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
          <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
          <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
        </svg>
      `,
      "pause": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="14" y="3" width="5" height="18" rx="1"></rect>
          <rect x="5" y="3" width="5" height="18" rx="1"></rect>
        </svg>
      `,
      "play": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M7 5.8a1.6 1.6 0 0 1 2.42-1.37l9.2 5.62a1.6 1.6 0 0 1 0 2.72l-9.2 5.62A1.6 1.6 0 0 1 7 17.02z"></path>
        </svg>
      `,
      "repeat": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m17 2 4 4-4 4"></path>
          <path d="M3 11v-1a4 4 0 0 1 4-4h14"></path>
          <path d="m7 22-4-4 4-4"></path>
          <path d="M21 13v1a4 4 0 0 1-4 4H3"></path>
        </svg>
      `,
      "repeat-off": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11.656 6H21l-4-4"></path>
          <path d="M17.898 17.898A4 4 0 0 1 17 18H3l4-4"></path>
          <path d="m2 2 20 20"></path>
          <path d="M21 13v1a4 4 0 0 1-.171 1.159"></path>
          <path d="m21 6-4 4"></path>
          <path d="M3 11v-1a4 4 0 0 1 3.102-3.898"></path>
          <path d="m7 22-4-4"></path>
        </svg>
      `,
      "volume": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path>
          <path d="M16 9a5 5 0 0 1 0 6"></path>
          <path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path>
        </svg>
      `,
      "volume-off": `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 9a5 5 0 0 1 .95 2.293"></path>
          <path d="M19.364 5.636a9 9 0 0 1 1.889 9.96"></path>
          <path d="m2 2 20 20"></path>
          <path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11"></path>
          <path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686"></path>
        </svg>
      `,
    };

    return icons[icon] || icons.play;
    }
  };

  Controller.prototype.setAiImageBoardEnlargeVideoControlsActive = function setAiImageBoardEnlargeVideoControlsActive(active) {
    with (this) {

    const viewer = aiImageEnlargeViewer;
    const controls = viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");

    if (!controls) {
      return;
    }

    controls.hidden = !active;
    controls.setAttribute("aria-hidden", active ? "false" : "true");

    if (!active) {
      controls.classList.remove("is-idle", "is-seeking");
      clearAiImageBoardEnlargeVideoControlsTimer();
      syncAiImageBoardEnlargeVideoControls();
      return;
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.clearAiImageBoardEnlargeVideoControlsTimer = function clearAiImageBoardEnlargeVideoControlsTimer() {
    with (this) {

    const timer = aiImageEnlargeState?.videoControlsIdleTimer || 0;

    if (timer) {
      window.clearTimeout(timer);
      aiImageEnlargeState.videoControlsIdleTimer = 0;
    }
    }
  };

  Controller.prototype.showAiImageBoardEnlargeVideoControls = function showAiImageBoardEnlargeVideoControls() {
    with (this) {

    const state = aiImageEnlargeState;
    const controls = state?.viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");
    const video = state?.video;

    if (!state || state.mediaKind !== "video" || !controls || controls.hidden || !video) {
      return;
    }

    controls.classList.remove("is-idle");
    clearAiImageBoardEnlargeVideoControlsTimer();

    state.videoControlsIdleTimer = window.setTimeout(hideAiImageBoardEnlargeVideoControls, 2500);
    }
  };

  Controller.prototype.hideAiImageBoardEnlargeVideoControls = function hideAiImageBoardEnlargeVideoControls() {
    with (this) {

    const state = aiImageEnlargeState;
    const controls = state?.viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");
    const video = state?.video;

    if (!state || state.mediaKind !== "video" || !controls || controls.hidden || !video || state.videoSeekPointerId !== null) {
      return;
    }

    clearAiImageBoardEnlargeVideoControlsTimer();
    controls.classList.add("is-idle");
    }
  };

  Controller.prototype.toggleAiImageBoardEnlargeVideoControls = function toggleAiImageBoardEnlargeVideoControls() {
    with (this) {

    const state = aiImageEnlargeState;
    const controls = state?.viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");

    if (!state || state.mediaKind !== "video" || !controls || controls.hidden) {
      return;
    }

    if (controls.classList.contains("is-idle")) {
      showAiImageBoardEnlargeVideoControls();
    } else {
      hideAiImageBoardEnlargeVideoControls();
    }
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoControlsActivity = function handleAiImageBoardEnlargeVideoControlsActivity() {
    with (this) {

    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoControlsLeave = function handleAiImageBoardEnlargeVideoControlsLeave() {
    with (this) {

    hideAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoControlsPointerDown = function handleAiImageBoardEnlargeVideoControlsPointerDown(event) {
    with (this) {

    stopSpaceBoardControlEvent(event);
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoControlsWheel = function handleAiImageBoardEnlargeVideoControlsWheel(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoPlaybackChange = function handleAiImageBoardEnlargeVideoPlaybackChange() {
    with (this) {

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoLoopClick = function handleAiImageBoardEnlargeVideoLoopClick(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const video = aiImageEnlargeState?.video;

    if (!video) {
      return;
    }

    video.loop = !video.loop;

    if (video.loop) {
      video.setAttribute("loop", "");
    } else {
      video.removeAttribute("loop");
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoPlayClick = function handleAiImageBoardEnlargeVideoPlayClick(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const video = aiImageEnlargeState?.video;

    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      if (video.ended && Number.isFinite(video.duration)) {
        video.currentTime = 0;
      }

      const playResult = video.play?.();

      if (playResult?.catch) {
        playResult.catch(() => {});
      }
    } else {
      video.pause?.();
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoMuteClick = function handleAiImageBoardEnlargeVideoMuteClick(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const video = aiImageEnlargeState?.video;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    video.defaultMuted = video.muted;

    if (video.muted) {
      video.setAttribute("muted", "");
    } else {
      video.removeAttribute("muted");

      if (!video.volume) {
        video.volume = 1;
      }
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoFullscreenClick = function handleAiImageBoardEnlargeVideoFullscreenClick(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const state = aiImageEnlargeState;
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;

    if (!state?.stage) {
      return;
    }

    if (fullscreenElement) {
      const exitResult = document.exitFullscreen?.() || document.webkitExitFullscreen?.();

      if (exitResult?.catch) {
        exitResult.catch(() => {});
      }
    } else {
      const target = state.stage;
      const requestResult = target.requestFullscreen?.() || target.webkitRequestFullscreen?.();

      if (requestResult?.catch) {
        requestResult.catch(() => {});
      }
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoProgressPointerDown = function handleAiImageBoardEnlargeVideoProgressPointerDown(event) {
    with (this) {

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    const state = aiImageEnlargeState;
    const progress = event.currentTarget;

    if (!state || state.mediaKind !== "video" || !progress) {
      return;
    }

    state.videoSeekPointerId = event.pointerId;
    progress.classList.add("is-seeking");

    try {
      progress.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Pointer capture is optional; seeking still works from the initial tap.
    }

    seekAiImageBoardEnlargeVideoFromEvent(event);
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoProgressPointerMove = function handleAiImageBoardEnlargeVideoProgressPointerMove(event) {
    with (this) {

    const state = aiImageEnlargeState;

    if (!state || state.videoSeekPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    seekAiImageBoardEnlargeVideoFromEvent(event);
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoProgressPointerEnd = function handleAiImageBoardEnlargeVideoProgressPointerEnd(event) {
    with (this) {

    const state = aiImageEnlargeState;
    const progress = event.currentTarget;

    if (!state || state.videoSeekPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    state.videoSeekPointerId = null;
    progress?.classList?.remove("is-seeking");

    try {
      progress?.releasePointerCapture?.(event.pointerId);
    } catch (_error) {
      // The browser may have already released capture.
    }

    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.handleAiImageBoardEnlargeVideoProgressKeyDown = function handleAiImageBoardEnlargeVideoProgressKeyDown(event) {
    with (this) {

    const video = aiImageEnlargeState?.video;
    const duration = Number(video?.duration) || 0;

    if (!video || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    let nextTime = video.currentTime;

    if (event.key === "ArrowLeft") {
      nextTime -= 5;
    } else if (event.key === "ArrowRight") {
      nextTime += 5;
    } else if (event.key === "Home") {
      nextTime = 0;
    } else if (event.key === "End") {
      nextTime = duration;
    } else {
      return;
    }

    event.preventDefault();
    stopSpaceBoardControlEvent(event);
    video.currentTime = clampAiImageBoardEnlargeValue(nextTime, 0, duration);
    syncAiImageBoardEnlargeVideoControls();
    showAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.seekAiImageBoardEnlargeVideoFromEvent = function seekAiImageBoardEnlargeVideoFromEvent(event) {
    with (this) {

    const state = aiImageEnlargeState;
    const video = state?.video;
    const progress = state?.viewer?.querySelector?.("[data-ai-image-enlarge-video-progress]");
    const duration = Number(video?.duration) || 0;
    const rect = progress?.getBoundingClientRect?.();

    if (!video || !progress || !rect?.width || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const ratio = clampAiImageBoardEnlargeValue((event.clientX - rect.left) / rect.width, 0, 1);
    video.currentTime = ratio * duration;
    syncAiImageBoardEnlargeVideoControls();
    }
  };

  Controller.prototype.syncAiImageBoardEnlargeVideoControls = function syncAiImageBoardEnlargeVideoControls() {
    with (this) {

    const viewer = aiImageEnlargeViewer;
    const controls = viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");
    const video = aiImageEnlargeState?.video || viewer?.querySelector?.("[data-ai-image-enlarge-video]");
    const isVideoActive = Boolean(aiImageEnlargeState && aiImageEnlargeState.mediaKind === "video" && video && !controls?.hidden);

    if (!controls || !video || !isVideoActive) {
      return;
    }

    const current = Math.max(0, Number(video.currentTime) || 0);
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;
    const pct = duration
      ? clampAiImageBoardEnlargeValue((current / duration) * 100, 0, 100)
      : 0;
    const currentEl = controls.querySelector("[data-ai-image-enlarge-video-current]");
    const durationEl = controls.querySelector("[data-ai-image-enlarge-video-duration]");
    const progress = controls.querySelector("[data-ai-image-enlarge-video-progress]");
    const fill = controls.querySelector("[data-ai-image-enlarge-video-progress-fill]");
    const playButton = controls.querySelector("[data-ai-image-enlarge-video-play]");
    const loopButton = controls.querySelector("[data-ai-image-enlarge-video-loop]");
    const muteButton = controls.querySelector("[data-ai-image-enlarge-video-mute]");
    const fullscreenButton = controls.querySelector("[data-ai-image-enlarge-video-fullscreen]");
    const isPaused = Boolean(video.paused || video.ended);
    const isMuted = Boolean(video.muted || video.volume === 0);
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    const isFullscreen = fullscreenElement === aiImageEnlargeState?.stage || fullscreenElement === viewer;

    if (currentEl) {
      currentEl.textContent = formatAiImageBoardEnlargeVideoTime(current);
    }

    if (durationEl) {
      durationEl.textContent = formatAiImageBoardEnlargeVideoTime(duration);
    }

    if (progress) {
      progress.setAttribute("aria-valuenow", String(Math.round(pct)));
      progress.setAttribute("aria-valuetext", `${formatAiImageBoardEnlargeVideoTime(current)} of ${formatAiImageBoardEnlargeVideoTime(duration)}`);
    }

    if (fill) {
      fill.style.width = `${pct}%`;
    }

    if (playButton) {
      playButton.innerHTML = getAiImageBoardEnlargeVideoIconMarkup(isPaused ? "play" : "pause");
      playButton.setAttribute("aria-label", isPaused ? "Play video" : "Pause video");
    }

    if (loopButton) {
      loopButton.innerHTML = getAiImageBoardEnlargeVideoIconMarkup(video.loop ? "repeat" : "repeat-off");
      loopButton.setAttribute("aria-pressed", video.loop ? "true" : "false");
      loopButton.setAttribute("aria-label", video.loop ? "Disable loop" : "Enable loop");
    }

    if (muteButton) {
      muteButton.innerHTML = getAiImageBoardEnlargeVideoIconMarkup(isMuted ? "volume-off" : "volume");
      muteButton.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
    }

    if (fullscreenButton) {
      fullscreenButton.innerHTML = getAiImageBoardEnlargeVideoIconMarkup(isFullscreen ? "minimize" : "fullscreen");
      fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
    }
    }
  };

  Controller.prototype.formatAiImageBoardEnlargeVideoTime = function formatAiImageBoardEnlargeVideoTime(seconds) {
    with (this) {

    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

    const controls = state.viewer?.querySelector?.("[data-ai-image-enlarge-video-controls]");
    const shouldToggleTouchControls = state.mediaKind === "video" &&
      !controls?.hidden &&
      event.pointerType !== "mouse";

    event.preventDefault();
    stopSpaceBoardControlEvent(event);

    if (shouldToggleTouchControls) {
      toggleAiImageBoardEnlargeVideoControls();
      return;
    }

    showAiImageBoardEnlargeVideoControls();

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
