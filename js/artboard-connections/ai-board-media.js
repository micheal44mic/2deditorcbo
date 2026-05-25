window.CBO = window.CBO || {};



(function registerAiBoardMediaJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-media.js.");

  }



  Controller.prototype.getAiImageBoardPreviewCssUrl = function getAiImageBoardPreviewCssUrl(src) {
    with (this) {

    return `url("${String(src || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`;
    }
  };

  Controller.prototype.normalizeAiImageBoardVariantSrc = function normalizeAiImageBoardVariantSrc(value) {
    with (this) {

    if (typeof value === "string") {
      return value.trim();
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    return String(value.src || value.url || value.href || "").trim();
    }
  };

  Controller.prototype.getAiImageBoardMediaVariantSrc = function getAiImageBoardMediaVariantSrc(media, lod) {
    with (this) {

    const variants = media?.variants && typeof media.variants === "object" ? media.variants : null;
    const key = String(lod || "");
    const explicitVariant = normalizeAiImageBoardVariantSrc(variants?.[key]);

    return explicitVariant;
    }
  };

  Controller.prototype.getAiVideoBoardVariantKeys = function getAiVideoBoardVariantKeys(lod) {
    with (this) {

    const raw = String(lod || "").trim();
    const numeric = getAiBoardNumericLod(raw);
    const base = numeric ? String(numeric) : raw.replace(/^video[-_]/i, "").replace(/p$/i, "");
    const keys = [
      raw,
      base,
      `${base}p`,
      `video-${base}`,
      `video_${base}`,
    ].filter(Boolean);

    return Array.from(new Set(keys));
    }
  };

  Controller.prototype.getAiVideoBoardVariantValue = function getAiVideoBoardVariantValue(media, lod) {
    with (this) {

    const variants = media?.variants && typeof media.variants === "object" ? media.variants : null;

    if (!variants) {
      return null;
    }

    for (const key of getAiVideoBoardVariantKeys(lod)) {
      if (Object.prototype.hasOwnProperty.call(variants, key)) {
        return variants[key];
      }
    }

    return null;
    }
  };

  Controller.prototype.getAiVideoBoardVariantSrc = function getAiVideoBoardVariantSrc(media, lod) {
    with (this) {

    return normalizeAiImageBoardVariantSrc(getAiVideoBoardVariantValue(media, lod));
    }
  };

  Controller.prototype.getAiVideoBoardVariantPosterSrc = function getAiVideoBoardVariantPosterSrc(media, lod) {
    with (this) {

    const variant = getAiVideoBoardVariantValue(media, lod);

    if (variant && typeof variant === "object") {
      const poster = String(
        variant.posterSrc ||
        variant.poster ||
        variant.startFrameSrc ||
        variant.thumbnailSrc ||
        "",
      ).trim();

      if (poster) {
        return poster;
      }
    }

    const posters = media?.posters && typeof media.posters === "object" ? media.posters : null;

    if (!posters) {
      return "";
    }

    for (const key of getAiVideoBoardVariantKeys(lod)) {
      const poster = String(posters[key] || "").trim();

      if (poster) {
        return poster;
      }
    }

    return "";
    }
  };

  Controller.prototype.getAiVideoBoardPosterSrc = function getAiVideoBoardPosterSrc(media, lod) {
    with (this) {

    return getAiVideoBoardVariantPosterSrc(media, lod) ||
      String(
        media?.posterSrc ||
        media?.poster ||
        media?.startFrameSrc ||
        media?.thumbnailSrc ||
        "",
      ).trim();
    }
  };

  Controller.prototype.getAiVideoBoardAvailableVariantSizes = function getAiVideoBoardAvailableVariantSizes(media) {
    with (this) {

    return AI_VIDEO_PREVIEW_VARIANT_SIZES
      .filter((size) => Boolean(getAiVideoBoardVariantSrc(media, size)));
    }
  };

  Controller.prototype.getAiVideoBoardFixedCanvasPreviewSrc = function getAiVideoBoardFixedCanvasPreviewSrc(media) {
    with (this) {

    return String(
      media?.previewSrc ||
      media?.canvasPreviewSrc ||
      media?.preview?.src ||
      media?.preview?.url ||
      "",
    ).trim() || getAiVideoBoardVariantSrc(media, AI_VIDEO_CANVAS_PREVIEW_LOD);
    }
  };

  Controller.prototype.selectAiVideoBoardVariantSize = function selectAiVideoBoardVariantSize(media, recommendedLod) {
    with (this) {

    const availableSizes = getAiVideoBoardAvailableVariantSizes(media);
    const requestedSize = getAiBoardNumericLod(recommendedLod);

    if (!availableSizes.length || !requestedSize) {
      return 0;
    }

    return availableSizes.find((size) => Number(size) >= requestedSize) ||
      availableSizes[availableSizes.length - 1] ||
      0;
    }
  };

  Controller.prototype.resolveAiVideoBoardPreview = function resolveAiVideoBoardPreview(media, recommendedLod) {
    with (this) {

    const originalSrc = String(media?.src || "").trim();
    const previewSrc = getAiVideoBoardFixedCanvasPreviewSrc(media);
    const videoSrc = previewSrc || originalSrc;
    const lod = previewSrc ? `video-${AI_VIDEO_CANVAS_PREVIEW_LOD}` : "video-full";
    let posterSrc = getAiVideoBoardPosterSrc(media, AI_VIDEO_CANVAS_PREVIEW_LOD);
    let posterSource = posterSrc ? "provided-poster" : "";

    if (!posterSrc && videoSrc) {
      const runtimePoster = requestAiVideoRuntimePoster(videoSrc, AI_VIDEO_CANVAS_PREVIEW_LOD);

      if (runtimePoster?.status === "ready" && runtimePoster.objectUrl) {
        posterSrc = runtimePoster.objectUrl;
        posterSource = "runtime-poster";
      } else if (runtimePoster?.status) {
        posterSource = `runtime-poster-${runtimePoster.status}`;
      }
    }

    return {
      kind: "video",
      lod,
      posterSrc,
      posterSource,
      previewKey: `${videoSrc}::${posterSrc || posterSource || "no-poster"}::${lod}`,
      previewMode: "video",
      previewSource: previewSrc ? "fixed-video-preview" : "original-video-fallback",
      previewSrc: videoSrc,
    };
    }
  };

  Controller.prototype.getAiImageBoardActivePreviewLayer = function getAiImageBoardActivePreviewLayer(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return null;
    }

    const activeLayerName = String(mediaHost.dataset.mediaActiveLayer || "").trim();

    if (activeLayerName) {
      const layer = mediaHost.querySelector(`[data-ai-image-board-preview-layer="${activeLayerName}"]`);

      if (layer) {
        return layer;
      }
    }

    return mediaHost.querySelector("[data-ai-image-board-preview-layer].is-active") || null;
    }
  };

  Controller.prototype.hasAiImageBoardPaintedImagePreview = function hasAiImageBoardPaintedImagePreview(mediaHost, src = "", kind = "image") {
    with (this) {

    const activeLayer = getAiImageBoardActivePreviewLayer(mediaHost);
    const expectedSrc = String(src || "").trim();
    const expectedKind = String(kind || "").trim();

    return Boolean(
      mediaHost &&
      mediaHost.classList.contains("is-image-preview") &&
      activeLayer &&
      (activeLayer.currentSrc || activeLayer.src || activeLayer.dataset.previewKey) &&
      (!expectedSrc || mediaHost.dataset.mediaSrc === expectedSrc) &&
      (!expectedKind || mediaHost.dataset.mediaKind === expectedKind)
    );
    }
  };

  Controller.prototype.createAiImageBoardPreviewLayer = function createAiImageBoardPreviewLayer(name) {
    with (this) {

    const image = document.createElement("img");

    image.className = "editor-ai-image-board-media-item editor-ai-image-board-preview-layer";
    image.dataset.aiImageBoardPreviewLayer = name;
    image.alt = "";
    image.decoding = "async";
    image.loading = "eager";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");

    return image;
    }
  };

  Controller.prototype.ensureAiImageBoardImagePreviewLayers = function ensureAiImageBoardImagePreviewLayers(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return { active: null, inactive: null };
    }

    let layerA = mediaHost.querySelector('[data-ai-image-board-preview-layer="a"]');
    let layerB = mediaHost.querySelector('[data-ai-image-board-preview-layer="b"]');

    if (!layerA) {
      layerA = createAiImageBoardPreviewLayer("a");
      mediaHost.appendChild(layerA);
    }

    if (!layerB) {
      layerB = createAiImageBoardPreviewLayer("b");
      mediaHost.appendChild(layerB);
    }

    const active = getAiImageBoardActivePreviewLayer(mediaHost);
    const inactive = active === layerA ? layerB : layerA;

    return { active, inactive };
    }
  };

  Controller.prototype.clearAiImageBoardPreviewLayer = function clearAiImageBoardPreviewLayer(layer) {
    with (this) {

    if (!layer) {
      return;
    }

    layer.onload = null;
    layer.onerror = null;
    layer.classList.remove("is-active");
    layer.removeAttribute("src");
    delete layer.dataset.previewKey;
    delete layer.dataset.previewKind;
    delete layer.dataset.previewLod;
    delete layer.dataset.previewMediaSrc;
    delete layer.dataset.previewProbeAlpha;
    delete layer.dataset.previewProbeBlank;
    delete layer.dataset.previewProbeLumaRange;
    delete layer.dataset.previewProbeNonWhite;
    delete layer.dataset.previewSource;
    delete layer.dataset.previewSrc;
    delete layer.dataset.previewSwapRequest;
    }
  };

  Controller.prototype.clearAiImageBoardMediaDataset = function clearAiImageBoardMediaDataset(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    delete mediaHost.dataset.mediaActiveLayer;
    delete mediaHost.dataset.mediaKind;
    delete mediaHost.dataset.mediaLod;
    delete mediaHost.dataset.mediaName;
    delete mediaHost.dataset.mediaPendingKind;
    delete mediaHost.dataset.mediaPendingLod;
    delete mediaHost.dataset.mediaPendingPreviewKey;
    delete mediaHost.dataset.mediaPendingPreviewSource;
    delete mediaHost.dataset.mediaPendingSrc;
    delete mediaHost.dataset.mediaPosterSrc;
    delete mediaHost.dataset.mediaPreview;
    delete mediaHost.dataset.mediaPreviewKey;
    delete mediaHost.dataset.mediaPreviewSource;
    delete mediaHost.dataset.mediaPreviewSrc;
    delete mediaHost.dataset.mediaPreviewSwapRequest;
    delete mediaHost.dataset.mediaSrc;
    delete mediaHost.dataset.mediaVideoRenderMode;
    delete mediaHost.dataset.mediaVideoSrc;
    }
  };

  Controller.prototype.releaseAiImageBoardVideoPreview = function releaseAiImageBoardVideoPreview(mediaHost) {
    with (this) {

    mediaHost?.querySelectorAll?.("[data-ai-image-board-video]").forEach((video) => {
      try {
        video.pause?.();
      } catch (_error) {
        // Best effort cleanup before the media node is detached.
      }

      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load?.();
    });
    }
  };

  Controller.prototype.resetAiImageBoardMediaHost = function resetAiImageBoardMediaHost(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    const boardElement = mediaHost.closest?.("[data-ai-image-board]");
    const muteButton = getAiImageBoardVideoMuteButton(mediaHost);

    boardElement?.classList.remove("has-video-preview");

    if (muteButton) {
      muteButton.hidden = true;
      muteButton.innerHTML = "";
      muteButton.classList.remove("is-muted");
      muteButton.setAttribute("aria-label", "Unmute video");
    }

    mediaHost.removeEventListener("pointerenter", handleAiImageBoardVideoPointerEnter);
    mediaHost.removeEventListener("pointerleave", handleAiImageBoardVideoPointerLeave);
    mediaHost.removeEventListener("click", handleAiImageBoardVideoManualPlayClick);
    releaseAiImageBoardVideoPreview(mediaHost);
    mediaHost.querySelectorAll("[data-ai-image-board-preview-layer]").forEach(clearAiImageBoardPreviewLayer);
    mediaHost.replaceChildren();
    mediaHost.classList.remove("is-crossfading", "is-image-preview", "is-placeholder-preview", "is-video-preview", "is-video-deferred");
    mediaHost.style.removeProperty("background-image");
    clearAiImageBoardMediaDataset(mediaHost);
    }
  };

  Controller.prototype.setAiImageBoardMediaDataset = function setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    mediaHost.dataset.mediaLod = preview.lod;
    mediaHost.dataset.mediaKind = kind;
    mediaHost.dataset.mediaName = String(media?.name || "");
    mediaHost.dataset.mediaPreview = preview.previewMode;
    mediaHost.dataset.mediaPreviewKey = previewKey;
    mediaHost.dataset.mediaPreviewSource = preview.previewSource || "";
    mediaHost.dataset.mediaPreviewSrc = previewSrcForDataset;
    mediaHost.dataset.mediaSrc = src;
    delete mediaHost.dataset.mediaPendingKind;
    delete mediaHost.dataset.mediaPendingLod;
    delete mediaHost.dataset.mediaPendingPreviewKey;
    delete mediaHost.dataset.mediaPendingPreviewSource;
    delete mediaHost.dataset.mediaPendingSrc;
    delete mediaHost.dataset.mediaPreviewSwapRequest;
    }
  };

  Controller.prototype.markAiImageBoardPreviewPending = function markAiImageBoardPreviewPending(mediaHost, src, kind, preview, previewKey = "") {
    with (this) {

    if (!mediaHost) {
      return;
    }

    mediaHost.dataset.mediaPendingSrc = src;
    mediaHost.dataset.mediaPendingKind = kind;
    mediaHost.dataset.mediaPendingLod = preview.lod;
    mediaHost.dataset.mediaPendingPreviewSource = preview.previewSource || "";

    if (previewKey) {
      mediaHost.dataset.mediaPendingPreviewKey = previewKey;
    }
    }
  };

  Controller.prototype.decodeAiImageBoardPreviewSource = function decodeAiImageBoardPreviewSource(src) {
    with (this) {

    const nextSrc = String(src || "").trim();

    return new Promise((resolve, reject) => {
      if (!nextSrc) {
        reject(new Error("Missing AI preview image source."));
        return;
      }

      const image = new Image();
      let settled = false;
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(image);
      };
      const fail = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(`Unable to decode AI preview image: ${nextSrc}`));
      };
      const decodeLoadedImage = () => {
        if (image.decode) {
          image.decode().then(finish).catch(() => {
            if (image.complete && Number(image.naturalWidth) > 0) {
              finish();
            } else {
              fail();
            }
          });
          return;
        }

        if (image.complete && Number(image.naturalWidth) > 0) {
          finish();
        }
      };

      image.onload = decodeLoadedImage;
      image.onerror = fail;
      image.decoding = "async";
      image.loading = "eager";
      image.src = nextSrc;

      if (image.complete && Number(image.naturalWidth) > 0) {
        decodeLoadedImage();
      }
    });
    }
  };

  Controller.prototype.decodeAiImageBoardPreviewLayer = function decodeAiImageBoardPreviewLayer(image, src) {
    with (this) {

    const nextSrc = String(src || "").trim();

    if (!image || !nextSrc) {
      return Promise.reject(new Error("Missing AI preview image layer."));
    }

    return decodeAiImageBoardPreviewSource(nextSrc).then(() => {
      image.onload = null;
      image.onerror = null;
      image.decoding = "async";
      image.loading = "eager";

      if (image.getAttribute("src") !== nextSrc) {
        image.src = nextSrc;
      }

      return image;
    });
    }
  };

  Controller.prototype.waitAiImageBoardPreviewPaintFrames = function waitAiImageBoardPreviewPaintFrames(frameCount = this.AI_IMAGE_PREVIEW_PAINT_FRAMES) {
    with (this) {

    const frames = Math.max(1, Number(frameCount) || 1);

    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame !== "function") {
        window.setTimeout(resolve, 0);
        return;
      }

      let remaining = frames;
      const tick = () => {
        remaining -= 1;

        if (remaining <= 0) {
          resolve();
          return;
        }

        window.requestAnimationFrame(tick);
      };

      window.requestAnimationFrame(tick);
    });
    }
  };

  Controller.prototype.isAiImageBoardPreviewSwapCurrent = function isAiImageBoardPreviewSwapCurrent(mediaHost, layer, requestId, previewKey, src, kind) {
    with (this) {

    return Boolean(
      mediaHost?.isConnected &&
      layer?.isConnected &&
      mediaHost.dataset.mediaPreviewSwapRequest === requestId &&
      mediaHost.dataset.mediaPendingPreviewKey === previewKey &&
      mediaHost.dataset.mediaPendingSrc === src &&
      mediaHost.dataset.mediaPendingKind === kind &&
      layer.dataset.previewSwapRequest === requestId &&
      layer.dataset.previewKey === previewKey
    );
    }
  };

  Controller.prototype.commitAiImageBoardPreviewLayer = function commitAiImageBoardPreviewLayer(mediaHost, incomingLayer, media, preview, previewKey, previewSrcForDataset, src, kind) {
    with (this) {

    const previousLayer = getAiImageBoardActivePreviewLayer(mediaHost);
    const incomingLayerName = String(incomingLayer?.dataset?.aiImageBoardPreviewLayer || "").trim();

    if (!mediaHost || !incomingLayer || !incomingLayerName) {
      return;
    }

    mediaHost.style.removeProperty("background-image");
    mediaHost.classList.add("is-image-preview");
    mediaHost.classList.remove("is-crossfading", "is-placeholder-preview", "is-video-preview", "is-video-deferred");

    if (previousLayer && previousLayer !== incomingLayer) {
      previousLayer.style.zIndex = "1";
    }

    incomingLayer.classList.add("is-active");
    incomingLayer.style.zIndex = "2";
    mediaHost.dataset.mediaActiveLayer = incomingLayerName;
    setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind);
    recordAiBoardPreviewDebugEvent("layer-swap-commit", {
      boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
      complete: incomingLayer.complete,
      height: incomingLayer.naturalHeight,
      layer: incomingLayerName,
      lod: preview.lod,
      previewKey,
      previewSource: preview.previewSource || "",
      src,
      width: incomingLayer.naturalWidth,
    });

    if (previousLayer && previousLayer !== incomingLayer) {
      waitAiImageBoardPreviewPaintFrames(AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES).then(() => {
        if (mediaHost.dataset.mediaActiveLayer === incomingLayerName) {
          previousLayer.classList.remove("is-active");
          previousLayer.style.zIndex = "1";
        }
      });
    }

    if (AI_IMAGE_PREVIEW_CROSSFADE_MS > 0) {
      mediaHost.classList.add("is-crossfading");
      window.setTimeout(() => {
        if (mediaHost.dataset.mediaActiveLayer === incomingLayerName) {
          mediaHost.classList.remove("is-crossfading");
        }
      }, AI_IMAGE_PREVIEW_CROSSFADE_MS + 40);
    } else {
      mediaHost.classList.remove("is-crossfading");
    }

    renderSpaceBoards();
    }
  };

  Controller.prototype.renderAiImageBoardPlaceholderPreview = function renderAiImageBoardPlaceholderPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
    with (this) {

    if (shouldHoldAiImageBoardPreviewForPendingLod(mediaHost, src, kind, preview)) {
      markAiImageBoardPreviewPending(mediaHost, src, kind, preview, previewKey);
      recordAiBoardPreviewDebugEvent("placeholder-held", {
        boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
        lod: preview.lod,
        previewKey,
        previewSource: preview.previewSource || "",
        src,
      });
      return;
    }

    resetAiImageBoardMediaHost(mediaHost);
    mediaHost.classList.add("is-placeholder-preview");
    setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind);
    recordAiBoardPreviewDebugEvent("placeholder-render", {
      boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
      lod: preview.lod,
      previewKey,
      previewSource: preview.previewSource || "",
      src,
    });
    }
  };

  Controller.prototype.createAiImageBoardVideoPreviewElement = function createAiImageBoardVideoPreviewElement() {
    with (this) {

    const video = document.createElement("video");

    video.className = "editor-ai-image-board-media-item editor-ai-image-board-video";
    video.dataset.aiImageBoardVideo = "";
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.controls = false;
    video.draggable = false;
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("preload", "auto");
    video.setAttribute("controlslist", "nodownload nofullscreen");
    video.setAttribute("aria-hidden", "true");

    return video;
    }
  };

  Controller.prototype.createAiImageBoardVideoPosterElement = function createAiImageBoardVideoPosterElement() {
    with (this) {

    const image = document.createElement("img");

    image.className = "editor-ai-image-board-media-item editor-ai-image-board-video-poster";
    image.dataset.aiImageBoardVideoPoster = "";
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");

    return image;
    }
  };

  Controller.prototype.getAiImageBoardVideoMuteIconMarkup = function getAiImageBoardVideoMuteIconMarkup(muted) {
    with (this) {

    return muted
      ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-off-icon lucide-volume-off" aria-hidden="true">
          <path d="M16 9a5 5 0 0 1 .95 2.293"></path>
          <path d="M19.364 5.636a9 9 0 0 1 1.889 9.96"></path>
          <path d="m2 2 20 20"></path>
          <path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11"></path>
          <path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686"></path>
        </svg>
      `
      : `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume2-icon lucide-volume-2" aria-hidden="true">
          <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path>
          <path d="M16 9a5 5 0 0 1 0 6"></path>
          <path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path>
        </svg>
      `;
    }
  };

  Controller.prototype.getAiImageBoardVideoMuteButton = function getAiImageBoardVideoMuteButton(mediaHost) {
    with (this) {

    return mediaHost?.querySelector?.(":scope > [data-ai-image-board-video-mute]") ||
      mediaHost?.querySelector?.("[data-ai-image-board-video-mute]") ||
      null;
    }
  };

  Controller.prototype.ensureAiImageBoardVideoMuteButton = function ensureAiImageBoardVideoMuteButton(mediaHost) {
    with (this) {

    let button = getAiImageBoardVideoMuteButton(mediaHost);

    if (!mediaHost) {
      return null;
    }

    if (!button) {
      button = document.createElement("button");
      button.className = "editor-ai-image-board-video-mute";
      button.type = "button";
      button.dataset.aiImageBoardVideoMute = "";
      button.setAttribute("aria-label", "Unmute video");
      button.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      button.addEventListener("click", handleAiImageBoardVideoMuteClick);
      mediaHost.append(button);
    }

    button.hidden = false;
    mediaHost.closest?.("[data-ai-image-board]")?.classList.add("has-video-preview");

    return button;
    }
  };

  Controller.prototype.syncAiImageBoardVideoPreviewState = function syncAiImageBoardVideoPreviewState(mediaHost, board) {
    with (this) {

    const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");
    const button = getAiImageBoardVideoMuteButton(mediaHost);
    const muted = board?.videoMuted !== false;

    if (video) {
      video.muted = muted;
      video.defaultMuted = muted;
    }

    if (button) {
      button.innerHTML = getAiImageBoardVideoMuteIconMarkup(muted);
      button.classList.toggle("is-muted", muted);
      button.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
    }

    mediaHost?.classList.toggle("is-video-muted", muted);
    }
  };

  Controller.prototype.isAiImageBoardVideoMuteAvailable = function isAiImageBoardVideoMuteAvailable(board) {
    with (this) {

    const media = board?.generatedMedia || null;
    const src = String(media?.src || "").trim();

    return Boolean(board && board.type === "ai-image" && media?.kind === "video" && src);
    }
  };

  Controller.prototype.syncAiImageBoardVideoMuteUi = function syncAiImageBoardVideoMuteUi(board) {
    with (this) {

    const boardId = String(board?.id || "").trim();

    if (!boardId) {
      return;
    }

    Array.from(document.querySelectorAll("[data-ai-image-board]"))
      .filter((element) => element.dataset?.boardId === boardId)
      .forEach((element) => {
        const mediaHost = element.querySelector("[data-ai-image-board-media]");
        const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");

        syncAiImageBoardVideoPreviewState(mediaHost, board);
        updateAiImageBoardActionToolbarState(
          element.querySelector("[data-ai-image-board-action-toolbar]"),
          board,
        );

        if (video && !video.paused) {
          playAiImageBoardVideoPreview(video);
        }
      });

    if (mobileActionToolbar?.isConnected && mobileActionToolbar.dataset?.boardId === boardId) {
      updateAiImageBoardActionToolbarState(mobileActionToolbar, board);
    }
    }
  };

  Controller.prototype.toggleAiImageBoardVideoMuted = function toggleAiImageBoardVideoMuted(boardId) {
    with (this) {

    const board = getSpaceBoardById(boardId);

    if (!isAiImageBoardVideoMuteAvailable(board)) {
      return false;
    }

    board.videoMuted = board.videoMuted === false;
    syncAiImageBoardVideoMuteUi(board);
    return true;
    }
  };

  Controller.prototype.isAiImageBoardVideoSelected = function isAiImageBoardVideoSelected(mediaHost, board = null) {
    with (this) {

    const boardElement = mediaHost?.closest?.("[data-ai-image-board]");
    const boardId = String(board?.id || boardElement?.dataset?.boardId || "").trim();

    return Boolean(
      boardId &&
      (selectedSpaceBoardId === boardId || boardElement?.classList.contains("is-selected"))
    );
    }
  };

  Controller.prototype.isAiImageBoardMediaHovering = function isAiImageBoardMediaHovering(mediaHost) {
    with (this) {

    try {
      return Boolean(mediaHost?.matches?.(":hover"));
    } catch (_error) {
      return false;
    }
    }
  };

  Controller.prototype.getAiImageBoardVideoPreviewIntentUntil = function getAiImageBoardVideoPreviewIntentUntil(mediaHost) {
    with (this) {

    return Math.max(0, Number(mediaHost?.dataset?.mediaVideoIntentUntil) || 0);
    }
  };

  Controller.prototype.isAiImageBoardVideoPreviewIntentActive = function isAiImageBoardVideoPreviewIntentActive(mediaHost) {
    with (this) {

    return getAiImageBoardVideoPreviewIntentUntil(mediaHost) > (performance.now?.() || Date.now());
    }
  };

  Controller.prototype.markAiImageBoardVideoPreviewIntent = function markAiImageBoardVideoPreviewIntent(mediaHost, durationMs = 2600) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    const intentDurationMs = Math.max(800, Number(durationMs) || 2600);
    const expiresAt = (performance.now?.() || Date.now()) + intentDurationMs;

    mediaHost.dataset.mediaVideoIntentUntil = String(Math.round(expiresAt));
    window.setTimeout?.(() => {
      if (
        mediaHost.isConnected &&
        !isAiImageBoardVideoSelected(mediaHost) &&
        !isAiImageBoardMediaHovering(mediaHost) &&
        !isAiImageBoardVideoPreviewIntentActive(mediaHost)
      ) {
        renderSpaceBoards();
      }
    }, intentDurationMs + 80);
    }
  };

  Controller.prototype.clearAiImageBoardVideoPreviewIntent = function clearAiImageBoardVideoPreviewIntent(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    delete mediaHost.dataset.mediaVideoIntentUntil;
    }
  };

  Controller.prototype.shouldMountAiImageBoardVideoPreviewElement = function shouldMountAiImageBoardVideoPreviewElement(mediaHost, board, preview) {
    with (this) {

    const previewSource = String(preview?.previewSource || "").trim();

    if (previewSource !== "original-video-fallback") {
      return true;
    }

    return Boolean(
      isAiImageBoardVideoSelected(mediaHost, board) ||
      isAiImageBoardMediaHovering(mediaHost) ||
      isAiImageBoardVideoPreviewIntentActive(mediaHost)
    );
    }
  };

  Controller.prototype.getAiImageBoardVideoPreviewRenderMode = function getAiImageBoardVideoPreviewRenderMode(mediaHost, board, preview) {
    with (this) {

    return shouldMountAiImageBoardVideoPreviewElement(mediaHost, board, preview) ? "mounted" : "deferred";
    }
  };

  Controller.prototype.pauseAiImageBoardVideoPreview = function pauseAiImageBoardVideoPreview(video) {
    with (this) {

    try {
      video?.pause?.();
    } catch (_error) {
      // Pausing a detached media element is harmless to ignore.
    }
    }
  };

  Controller.prototype.playAiImageBoardVideoPreview = function playAiImageBoardVideoPreview(video) {
    with (this) {

    if (!video || !video.isConnected) {
      return;
    }

    const playResult = video.play?.();

    if (playResult?.catch) {
      playResult.catch(() => {});
    }
    }
  };

  Controller.prototype.requestAiImageBoardVideoPreviewPlayback = function requestAiImageBoardVideoPreviewPlayback(mediaHost, durationMs = 2600) {
    with (this) {

    if (!mediaHost?.isConnected) {
      return;
    }

    markAiImageBoardVideoPreviewIntent(mediaHost, durationMs);
    renderSpaceBoards();

    const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));

    scheduleFrame(() => {
      playAiImageBoardVideoPreview(mediaHost.querySelector?.("[data-ai-image-board-video]"));
    });
    }
  };

  Controller.prototype.syncAiImageBoardVideoSelectionPlayback = function syncAiImageBoardVideoSelectionPlayback(mediaHost, board = null) {
    with (this) {

    const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");

    if (!video) {
      return;
    }

    const boardId = String(board?.id || mediaHost?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    if (boardId && aiImageEnlargeState?.mediaKind === "video" && aiImageEnlargeState.boardId === boardId) {
      pauseAiImageBoardVideoPreview(video);
      return;
    }

    if (isAiImageBoardVideoSelected(mediaHost, board)) {
      playAiImageBoardVideoPreview(video);
    } else if (!isAiImageBoardMediaHovering(mediaHost)) {
      pauseAiImageBoardVideoPreview(video);
    }
    }
  };

  Controller.prototype.handleAiImageBoardVideoPointerEnter = function handleAiImageBoardVideoPointerEnter(event) {
    with (this) {

    if (event.pointerType === "touch") {
      return;
    }

    const mediaHost = event.currentTarget;
    const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");

    if (!video) {
      requestAiImageBoardVideoPreviewPlayback(mediaHost);
      return;
    }

    playAiImageBoardVideoPreview(video);
    }
  };

  Controller.prototype.handleAiImageBoardVideoPointerLeave = function handleAiImageBoardVideoPointerLeave(event) {
    with (this) {

    const mediaHost = event.currentTarget;

    if (isAiImageBoardVideoSelected(mediaHost)) {
      return;
    }

    clearAiImageBoardVideoPreviewIntent(mediaHost);
    pauseAiImageBoardVideoPreview(mediaHost?.querySelector?.("[data-ai-image-board-video]"));
    renderSpaceBoards();
    }
  };

  Controller.prototype.handleAiImageBoardVideoManualPlayClick = function handleAiImageBoardVideoManualPlayClick(event) {
    with (this) {

    const mediaHost = event.currentTarget;
    const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");

    event.preventDefault();
    event.stopPropagation();

    if (!video) {
      requestAiImageBoardVideoPreviewPlayback(mediaHost, 10000);
      return;
    }

    playAiImageBoardVideoPreview(video);
    }
  };

  Controller.prototype.handleAiImageBoardVideoMuteClick = function handleAiImageBoardVideoMuteClick(event) {
    with (this) {

    const mediaHost = event.currentTarget?.closest?.("[data-ai-image-board-media]");
    const boardElement = mediaHost?.closest?.("[data-ai-image-board]");
    const board = getSpaceBoardById(boardElement?.dataset?.boardId || "");
    const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");

    event.preventDefault();
    event.stopPropagation();

    if (!board) {
      return;
    }

    toggleAiImageBoardVideoMuted(board.id);

    if (video && !video.paused) {
      playAiImageBoardVideoPreview(video);
    }
    }
  };

  Controller.prototype.renderAiImageBoardVideoPreview = function renderAiImageBoardVideoPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset, board = null) {
    with (this) {

    const videoSrc = String(preview?.previewSrc || src || "").trim();
    const posterSrc = String(preview?.posterSrc || "").trim();
    const posterSrcForDataset = summarizeAiBoardPreviewSrc(posterSrc);
    const renderMode = getAiImageBoardVideoPreviewRenderMode(mediaHost, board, preview);
    const shouldMountVideo = renderMode === "mounted";

    resetAiImageBoardMediaHost(mediaHost);
    mediaHost.classList.add("is-video-preview");
    mediaHost.classList.toggle("is-video-deferred", !shouldMountVideo);
    mediaHost.dataset.mediaVideoRenderMode = renderMode;
    mediaHost.dataset.mediaVideoSrc = videoSrc;
    mediaHost.dataset.mediaPosterSrc = posterSrcForDataset;
    setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind);

    if (!videoSrc) {
      return;
    }

    mediaHost.addEventListener("pointerenter", handleAiImageBoardVideoPointerEnter);
    mediaHost.addEventListener("pointerleave", handleAiImageBoardVideoPointerLeave);
    mediaHost.addEventListener("click", handleAiImageBoardVideoManualPlayClick);

    if (!shouldMountVideo) {
      if (posterSrc) {
        const poster = createAiImageBoardVideoPosterElement();

        poster.src = posterSrc;
        mediaHost.append(poster);
      }

      syncAiImageBoardVideoPreviewState(mediaHost, board);
      recordAiBoardPreviewDebugEvent("video-preview-deferred", {
        boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
        lod: preview.lod,
        posterSource: preview.posterSource || "",
        posterSrc,
        previewSource: preview.previewSource || "",
        reason: "original-video-fallback",
        src,
        videoSrc,
      });
      return;
    }

    const video = createAiImageBoardVideoPreviewElement();

    video.dataset.videoSrc = videoSrc;
    if (posterSrc) {
      video.poster = posterSrc;
    }

    mediaHost.append(video);
    video.src = videoSrc;
    ensureAiImageBoardVideoMuteButton(mediaHost);
    syncAiImageBoardVideoPreviewState(mediaHost, board);
    syncAiImageBoardVideoSelectionPlayback(mediaHost, board);
    recordAiBoardPreviewDebugEvent("video-preview-render", {
      boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
      lod: preview.lod,
      posterSrc,
      previewSource: preview.previewSource || "",
      renderMode,
      src,
      videoSrc,
    });
    }
  };

  Controller.prototype.renderAiImageBoardImagePreview = function renderAiImageBoardImagePreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
    with (this) {

    const previewSrc = String(preview?.previewSrc || "").trim();

    if (!previewSrc) {
      recordAiBoardPreviewDebugEvent("image-preview-missing-src", {
        boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
        lod: preview?.lod || "",
        previewKey,
        previewSource: preview?.previewSource || "",
        src,
      });
      renderAiImageBoardPlaceholderPreview(mediaHost, media, {
        ...preview,
        previewMode: "placeholder",
        previewSource: preview?.previewSource || "missing-src",
      }, src, kind, previewKey, previewSrcForDataset);
      return;
    }

    const activeLayer = getAiImageBoardActivePreviewLayer(mediaHost);
    const activeKey = String(activeLayer?.dataset?.previewKey || "");
    const isCurrent = mediaHost.dataset.mediaSrc === src &&
      mediaHost.dataset.mediaKind === kind &&
      mediaHost.dataset.mediaLod === preview.lod &&
      mediaHost.dataset.mediaPreviewKey === previewKey &&
      mediaHost.dataset.mediaPreviewSource === preview.previewSource &&
      mediaHost.dataset.mediaPreviewSrc === previewSrcForDataset &&
      activeKey === previewKey;

    if (isCurrent) {
      mediaHost.classList.add("is-image-preview");
      mediaHost.classList.remove("is-placeholder-preview", "is-video-preview", "is-video-deferred");
      mediaHost.style.removeProperty("background-image");
      return;
    }

    if (
      mediaHost.dataset.mediaPendingPreviewKey === previewKey &&
      mediaHost.dataset.mediaPendingSrc === src &&
      mediaHost.dataset.mediaPendingKind === kind
    ) {
      return;
    }

    const { active, inactive } = ensureAiImageBoardImagePreviewLayers(mediaHost);
    const incomingLayer = inactive || active;

    if (!incomingLayer) {
      return;
    }

    const requestId = String(aiImagePreviewSwapSeed++);

    mediaHost.style.removeProperty("background-image");
    mediaHost.classList.add("is-image-preview");
    mediaHost.classList.remove("is-placeholder-preview", "is-video-preview", "is-video-deferred");
    mediaHost.dataset.mediaPreviewSwapRequest = requestId;
    markAiImageBoardPreviewPending(mediaHost, src, kind, preview, previewKey);
    recordAiBoardPreviewDebugEvent("layer-swap-start", {
      boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
      layer: String(incomingLayer.dataset.aiImageBoardPreviewLayer || ""),
      lod: preview.lod,
      previewKey,
      previewSource: preview.previewSource || "",
      requestId,
      src,
      targetSrc: previewSrc,
    });

    incomingLayer.classList.remove("is-active");
    incomingLayer.style.zIndex = "2";
    incomingLayer.dataset.previewSwapRequest = requestId;
    incomingLayer.dataset.previewKey = previewKey;
    incomingLayer.dataset.previewKind = kind;
    incomingLayer.dataset.previewLod = preview.lod;
    incomingLayer.dataset.previewMediaSrc = src;
    incomingLayer.dataset.previewSource = preview.previewSource || "";
    incomingLayer.dataset.previewSrc = previewSrcForDataset;

    decodeAiImageBoardPreviewLayer(incomingLayer, previewSrc)
      .then(() => {
        if (!isAiImageBoardPreviewSwapCurrent(mediaHost, incomingLayer, requestId, previewKey, src, kind)) {
          return;
        }

        return waitAiImageBoardPreviewPaintFrames().then(() => {
          if (!isAiImageBoardPreviewSwapCurrent(mediaHost, incomingLayer, requestId, previewKey, src, kind)) {
            return;
          }

          const paintProbe = probeAiImagePreviewLayer(incomingLayer);
          const isRuntimePreview = String(preview.previewSource || "").startsWith("runtime");

          incomingLayer.dataset.previewProbeAlpha = String(paintProbe.alphaRatio ?? "");
          incomingLayer.dataset.previewProbeBlank = paintProbe.blank ? "1" : "0";
          incomingLayer.dataset.previewProbeLumaRange = String(paintProbe.lumaRange ?? "");
          incomingLayer.dataset.previewProbeNonWhite = String(paintProbe.nonWhiteRatio ?? "");
          recordAiBoardPreviewDebugEvent("layer-paint-probe", {
            boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
            layer: String(incomingLayer.dataset.aiImageBoardPreviewLayer || ""),
            lod: preview.lod,
            previewKey,
            previewSource: preview.previewSource || "",
            probe: paintProbe,
            requestId,
            src,
            targetSrc: previewSrc,
          });

          if (paintProbe.blank && isRuntimePreview) {
            const error = new Error(`Blank AI preview layer for LOD ${preview.lod}.`);

            error.previewProbe = paintProbe;
            error.runtimePreviewBlank = true;
            throw error;
          }

          commitAiImageBoardPreviewLayer(mediaHost, incomingLayer, media, preview, previewKey, previewSrcForDataset, src, kind);
        });
      })
      .catch((error) => {
        if (!isAiImageBoardPreviewSwapCurrent(mediaHost, incomingLayer, requestId, previewKey, src, kind)) {
          return;
        }

        delete mediaHost.dataset.mediaPreviewSwapRequest;
        delete mediaHost.dataset.mediaPendingKind;
        delete mediaHost.dataset.mediaPendingLod;
        delete mediaHost.dataset.mediaPendingPreviewKey;
        delete mediaHost.dataset.mediaPendingPreviewSource;
        delete mediaHost.dataset.mediaPendingSrc;
        clearAiImageBoardPreviewLayer(incomingLayer);

        const isRuntimePreview = String(preview.previewSource || "").startsWith("runtime");
        const forceLowQualityCanvasPreview = kind === "image" && isAiImageBoardMobileLowQualityPreview();
        const shouldFallbackToOriginal = Boolean(
          isRuntimePreview &&
          error?.runtimePreviewBlank &&
          src &&
          previewSrc !== src &&
          !forceLowQualityCanvasPreview
        );

        if (isRuntimePreview && error?.runtimePreviewBlank) {
          markAiImageRuntimePreviewVariantError(src, preview.lod, error?.message || "Blank AI preview layer.", error?.previewProbe || null);
        }

        if (shouldFallbackToOriginal) {
          recordAiBoardPreviewDebugEvent("runtime-preview-layer-blank", {
            boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
            layer: String(incomingLayer.dataset.aiImageBoardPreviewLayer || ""),
            lod: preview.lod,
            message: error?.message || String(error || "error"),
            previewKey,
            previewSource: preview.previewSource || "",
            probe: error?.previewProbe || null,
            src,
            targetSrc: previewSrc,
          });
          renderAiImageBoardImagePreview(mediaHost, media, {
            kind,
            lod: "full",
            previewKey: `${src}::runtime-layer-blank-original::${preview.lod}`,
            previewMode: "image-background",
            previewSource: "runtime-layer-blank-original",
            previewSrc: src,
          }, src, kind, `${src}::runtime-layer-blank-original::${preview.lod}`, summarizeAiBoardPreviewSrc(src));
          return;
        }

        const shouldReplaceActivePreview = forceLowQualityCanvasPreview &&
          isAiImageBoardMobilePreviewLodAboveCap(mediaHost?.dataset?.mediaLod || "");

        if (!hasAiImageBoardPaintedImagePreview(mediaHost) || shouldReplaceActivePreview) {
          renderAiImageBoardPlaceholderPreview(mediaHost, media, {
            ...preview,
            lod: `error-${preview.lod}`,
            previewMode: "placeholder",
            previewSource: "decode-error",
          }, src, kind, `error-${previewKey}`, "");
        }

        recordAiBoardPreviewDebugEvent("layer-swap-error", {
          boardId: getAiBoardDebugBoardIdFromMediaHost(mediaHost),
          layer: String(incomingLayer.dataset.aiImageBoardPreviewLayer || ""),
          lod: preview.lod,
          message: error?.message || String(error || "error"),
          previewKey,
          previewSource: preview.previewSource || "",
          src,
          targetSrc: previewSrc,
        });
        console.warn("[CBO] Unable to paint AI preview layer.", error);
      });
    }
  };

  Controller.prototype.getAiBoardCameraMotionKey = function getAiBoardCameraMotionKey(camera, dpr) {
    with (this) {

    return [
      Math.round((Number(camera?.x) || 0) * 10) / 10,
      Math.round((Number(camera?.y) || 0) * 10) / 10,
      Math.round((Math.max(0.0001, Number(camera?.zoom) || 1)) * 100000) / 100000,
      Math.round((Math.max(1, Number(dpr) || 1)) * 100) / 100,
    ].join(":");
    }
  };

  Controller.prototype.noteAiBoardCameraMotion = function noteAiBoardCameraMotion(camera, dpr) {
    with (this) {

    const key = getAiBoardCameraMotionKey(camera, dpr);

    if (!aiBoardLastCameraMotionKey) {
      aiBoardLastCameraMotionKey = key;
      return;
    }

    if (key === aiBoardLastCameraMotionKey) {
      return;
    }

    aiBoardLastCameraMotionKey = key;
    aiBoardCameraMotionUntil = (performance.now?.() || Date.now()) + AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS;

    if (aiBoardCameraMotionTimer) {
      window.clearTimeout(aiBoardCameraMotionTimer);
    }

    aiBoardCameraMotionTimer = window.setTimeout(() => {
      aiBoardCameraMotionTimer = 0;
      renderSpaceBoards();
    }, AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS + 16);
    }
  };

  Controller.prototype.isAiBoardCameraMotionActive = function isAiBoardCameraMotionActive() {
    with (this) {

    return (performance.now?.() || Date.now()) < aiBoardCameraMotionUntil;
    }
  };

  Controller.prototype.getAiBoardHeldLodDuringCameraMotion = function getAiBoardHeldLodDuringCameraMotion(mediaHost, media) {
    with (this) {

    const currentLod = String(mediaHost?.dataset?.mediaLod || "");
    const currentNumericLod = getAiBoardNumericLod(currentLod);

    if (
      !isAiBoardCameraMotionActive() ||
      !mediaHost ||
      media?.kind === "video" ||
      mediaHost.dataset.mediaSrc !== String(media?.src || "").trim() ||
      !hasAiImageBoardPaintedImagePreview(mediaHost, String(media?.src || "").trim(), "image")
    ) {
      return "";
    }

    if (isAiImageBoardMobilePreviewLodAboveCap(currentLod)) {
      return "";
    }

    return currentNumericLod ? currentLod : "";
    }
  };

  Controller.prototype.shouldHoldAiImageBoardPreviewForPendingLod = function shouldHoldAiImageBoardPreviewForPendingLod(mediaHost, src, kind, preview) {
    with (this) {

    const previewMode = String(preview?.previewMode || "");
    const previewSource = String(preview?.previewSource || "");
    const previewLod = String(preview?.lod || "");
    const isPendingPlaceholder = previewMode === "placeholder" &&
      (previewSource === "loading" || previewSource === "runtime" || previewSource === "error" || previewLod.startsWith("loading-") || previewLod.startsWith("error-"));
    const hasPaintedPreview = hasAiImageBoardPaintedImagePreview(mediaHost, src, kind);

    if (isAiImageBoardMobilePreviewLodAboveCap(mediaHost?.dataset?.mediaLod || "")) {
      return false;
    }

    return Boolean(isPendingPlaceholder && hasPaintedPreview);
    }
  };

  Controller.prototype.resolveAiImageBoardPreview = function resolveAiImageBoardPreview(media, recommendedLod) {
    with (this) {

    const src = String(media?.src || "").trim();
    const kind = media?.kind === "video" ? "video" : "image";
    const forceLowQualityCanvasPreview = kind === "image" && isAiImageBoardMobileLowQualityPreview();
    const safeRecommendedLod = forceLowQualityCanvasPreview
      ? normalizeAiImageBoardMobileCanvasPreviewLod(media, recommendedLod)
      : getAiBoardRuntimeSafeLod(media, recommendedLod);

    if (!src) {
      return {
        kind,
        lod: "empty",
        previewKey: "empty",
        previewMode: "empty",
        previewSource: "none",
        previewSrc: "",
      };
    }

    if (safeRecommendedLod === "placeholder" || safeRecommendedLod === "unloaded") {
      return {
        kind,
        lod: safeRecommendedLod,
        previewKey: `${src}::${safeRecommendedLod}`,
        previewMode: "placeholder",
        previewSource: safeRecommendedLod === "unloaded" ? "unloaded" : "none",
        previewSrc: "",
      };
    }

    if (kind === "video") {
      return resolveAiVideoBoardPreview(media, safeRecommendedLod);
    }

    if (String(safeRecommendedLod || "").startsWith("loading-") || String(safeRecommendedLod || "").startsWith("error-")) {
      return {
        kind,
        lod: safeRecommendedLod,
        previewKey: `${src}::${safeRecommendedLod}`,
        previewMode: "placeholder",
        previewSource: String(safeRecommendedLod).startsWith("loading-")
          ? "loading"
          : forceLowQualityCanvasPreview
            ? "runtime-error-mobile-placeholder"
            : "error",
        previewSrc: "",
      };
    }

    if (!AI_IMAGE_PREVIEW_VARIANT_SIZES.includes(Number(safeRecommendedLod))) {
      return {
        kind,
        lod: "full",
        previewKey: src,
        previewMode: "image-background",
        previewSource: "original",
        previewSrc: src,
      };
    }

    const variantSrc = getAiImageBoardMediaVariantSrc(media, safeRecommendedLod);

    if (variantSrc) {
      return {
        kind,
        lod: safeRecommendedLod,
        previewKey: variantSrc,
        previewMode: "image-background",
        previewSource: "provided",
        previewSrc: variantSrc,
      };
    }

    const runtimeVariant = requestAiImageRuntimePreviewVariant(src, safeRecommendedLod);

    if (runtimeVariant?.status === "ready" && runtimeVariant.objectUrl) {
      const runtimeSource = runtimeVariant.sourceType === "data-url"
        ? "runtime-data-url"
        : runtimeVariant.sourceType === "blob"
          ? "runtime-blob"
          : "runtime";

      return {
        kind,
        lod: safeRecommendedLod,
        previewKey: `${getAiImageRuntimePreviewCacheKey(src, safeRecommendedLod)}::${runtimeSource}`,
        previewMode: "image-background",
        previewSource: runtimeSource,
        previewSrc: runtimeVariant.objectUrl,
      };
    }

    if (runtimeVariant?.status === "error") {
      if (forceLowQualityCanvasPreview) {
        recordAiBoardPreviewDebugEvent("runtime-preview-mobile-placeholder", {
          lod: safeRecommendedLod,
          message: runtimeVariant.error || "",
          probe: runtimeVariant.probe || null,
          src,
          status: runtimeVariant.status,
        });

        return {
          kind,
          lod: `error-${safeRecommendedLod}`,
          previewKey: `${getAiImageRuntimePreviewCacheKey(src, safeRecommendedLod)}::runtime-error-mobile-placeholder`,
          previewMode: "placeholder",
          previewSource: "runtime-error-mobile-placeholder",
          previewSrc: "",
        };
      }

      recordAiBoardPreviewDebugEvent("runtime-preview-original-fallback", {
        lod: safeRecommendedLod,
        message: runtimeVariant.error || "",
        probe: runtimeVariant.probe || null,
        src,
        status: runtimeVariant.status,
      });

      return {
        kind,
        lod: "full",
        previewKey: `${src}::runtime-error-original::${safeRecommendedLod}`,
        previewMode: "image-background",
        previewSource: "runtime-error-original",
        previewSrc: src,
      };
    }

    return {
      kind,
      lod: `loading-${safeRecommendedLod}`,
      previewKey: `${getAiImageRuntimePreviewCacheKey(src, safeRecommendedLod)}::${runtimeVariant?.status || "runtime"}`,
      previewMode: "placeholder",
      previewSource: runtimeVariant?.status || "runtime",
      previewSrc: "",
    };
    }
  };

  Controller.prototype.renderAiImageBoardGeneratedMedia = function renderAiImageBoardGeneratedMedia(element, board, options = {}) {
    with (this) {

    const mediaHost = element?.querySelector?.("[data-ai-image-board-media]");
    const media = board?.generatedMedia || null;
    const src = String(media?.src || "").trim();
    let preview = resolveAiImageBoardPreview(media, options.recommendedLod);
    const kind = preview.kind;
    const forceLowQualityCanvasPreview = kind === "image" && isAiImageBoardMobileLowQualityPreview();

    if (!mediaHost) {
      return;
    }

    element.classList.toggle("has-generated-media", Boolean(src));

    if (!src) {
      resetAiImageBoardMediaHost(mediaHost);
      return;
    }

    if (
      forceLowQualityCanvasPreview &&
      (
        preview.lod === "full" ||
        preview.previewSrc === src ||
        String(preview.previewSource || "").includes("original")
      )
    ) {
      recordAiBoardPreviewDebugEvent("mobile-full-preview-render-blocked", {
        boardId: board?.id || getAiBoardDebugBoardIdFromMediaHost(mediaHost),
        lod: preview.lod || "",
        previewSource: preview.previewSource || "",
        src,
      });
      preview = resolveAiImageBoardPreview(media, getAiImageBoardMobilePreviewLod());
    }

    if (
      kind === "image" &&
      preview.previewMode === "placeholder" &&
      preview.lod !== "unloaded" &&
      preview.previewSource !== "unloaded" &&
      !forceLowQualityCanvasPreview &&
      !hasAiImageBoardPaintedImagePreview(mediaHost, src, kind)
    ) {
      preview = {
        kind,
        lod: "full",
        previewKey: src,
        previewMode: "image-background",
        previewSource: "original-first-paint",
        previewSrc: src,
      };
    }

    const previewMode = preview.previewMode;
    const previewSrc = String(preview.previewSrc || "").trim();
    const previewSrcForDataset = summarizeAiBoardPreviewSrc(previewSrc);
    const previewPosterSrcForDataset = summarizeAiBoardPreviewSrc(preview.posterSrc || "");
    const previewKey = String(preview.previewKey || previewSrcForDataset || previewMode);
    const videoPreviewRenderMode = kind === "video"
      ? getAiImageBoardVideoPreviewRenderMode(mediaHost, board, preview)
      : "";

    if (shouldHoldAiImageBoardPreviewForPendingLod(mediaHost, src, kind, preview)) {
      markAiImageBoardPreviewPending(mediaHost, src, kind, preview, previewKey);
      recordAiBoardPreviewDebugEvent("preview-held", {
        boardId: board?.id || getAiBoardDebugBoardIdFromMediaHost(mediaHost),
        lod: preview.lod,
        previewKey,
        previewMode,
        previewSource: preview.previewSource || "",
        src,
      });
      return;
    }

    const activeImageLayer = getAiImageBoardActivePreviewLayer(mediaHost);
    const isStablePreviewCurrent = (
      mediaHost.dataset.mediaSrc === src &&
      mediaHost.dataset.mediaKind === kind &&
      mediaHost.dataset.mediaLod === preview.lod &&
      mediaHost.dataset.mediaPreviewKey === previewKey &&
      mediaHost.dataset.mediaPreview === previewMode &&
      mediaHost.dataset.mediaPreviewSource === preview.previewSource &&
      mediaHost.dataset.mediaPreviewSrc === previewSrcForDataset &&
      (
        (previewMode === "placeholder" && mediaHost.classList.contains("is-placeholder-preview")) ||
        (
          kind === "video" &&
          mediaHost.classList.contains("is-video-preview") &&
          mediaHost.dataset.mediaVideoSrc === previewSrc &&
          mediaHost.dataset.mediaPosterSrc === previewPosterSrcForDataset &&
          mediaHost.dataset.mediaVideoRenderMode === videoPreviewRenderMode &&
          (
            videoPreviewRenderMode !== "mounted" ||
            Boolean(mediaHost.querySelector?.("[data-ai-image-board-video]"))
          ) &&
          (
            videoPreviewRenderMode !== "deferred" ||
            !mediaHost.querySelector?.("[data-ai-image-board-video]")
          )
        ) ||
        (kind === "image" && activeImageLayer?.dataset?.previewKey === previewKey)
      )
    );

    if (isStablePreviewCurrent) {
      if (kind === "video") {
        syncAiImageBoardVideoPreviewState(mediaHost, board);
        syncAiImageBoardVideoSelectionPlayback(mediaHost, board);
      }
      return;
    }

    recordAiBoardPreviewDebugEvent("preview-target", {
      boardId: board?.id || getAiBoardDebugBoardIdFromMediaHost(mediaHost),
      currentLod: mediaHost.dataset.mediaLod || "",
      lod: preview.lod,
      previewKey,
      previewMode,
      previewSource: preview.previewSource || "",
      src,
    });

    if (previewMode === "placeholder") {
      renderAiImageBoardPlaceholderPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset);
    } else if (kind === "image") {
      renderAiImageBoardImagePreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset);
    } else {
      renderAiImageBoardVideoPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset, board);
    }
    }
  };

  Controller.prototype.handleAiImagePromptFocus = function handleAiImagePromptFocus(event) {
    with (this) {

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
      value: getAiImageBoardPromptText(board),
    };
    }
  };

})(window.CBO);
