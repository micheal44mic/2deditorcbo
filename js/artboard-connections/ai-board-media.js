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

  Controller.prototype.getAiImageBoardMediaVariantSrc = function getAiImageBoardMediaVariantSrc(media, lod) {
    with (this) {

    const variants = media?.variants && typeof media.variants === "object" ? media.variants : null;
    const key = String(lod || "");
    const explicitVariant = String(variants?.[key] || "").trim();

    return explicitVariant;
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
    delete mediaHost.dataset.mediaPreview;
    delete mediaHost.dataset.mediaPreviewKey;
    delete mediaHost.dataset.mediaPreviewSource;
    delete mediaHost.dataset.mediaPreviewSrc;
    delete mediaHost.dataset.mediaPreviewSwapRequest;
    delete mediaHost.dataset.mediaSrc;
    }
  };

  Controller.prototype.resetAiImageBoardMediaHost = function resetAiImageBoardMediaHost(mediaHost) {
    with (this) {

    if (!mediaHost) {
      return;
    }

    mediaHost.querySelectorAll("[data-ai-image-board-preview-layer]").forEach(clearAiImageBoardPreviewLayer);
    mediaHost.replaceChildren();
    mediaHost.classList.remove("is-crossfading", "is-image-preview", "is-placeholder-preview", "is-video-preview");
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
    mediaHost.classList.remove("is-crossfading", "is-placeholder-preview", "is-video-preview");

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

  Controller.prototype.renderAiImageBoardVideoPreview = function renderAiImageBoardVideoPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
    with (this) {

    resetAiImageBoardMediaHost(mediaHost);
    mediaHost.classList.add("is-video-preview");
    setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind);
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
      mediaHost.classList.remove("is-placeholder-preview", "is-video-preview");
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
    mediaHost.classList.remove("is-placeholder-preview", "is-video-preview");
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
        const shouldFallbackToOriginal = Boolean(
          isRuntimePreview &&
          error?.runtimePreviewBlank &&
          src &&
          previewSrc !== src
        );

        if (shouldFallbackToOriginal) {
          markAiImageRuntimePreviewVariantError(src, preview.lod, error?.message || "Blank AI preview layer.", error?.previewProbe || null);
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

        if (!hasAiImageBoardPaintedImagePreview(mediaHost)) {
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

    if (
      !isAiBoardCameraMotionActive() ||
      !mediaHost ||
      media?.kind === "video" ||
      mediaHost.dataset.mediaSrc !== String(media?.src || "").trim() ||
      !hasAiImageBoardPaintedImagePreview(mediaHost, String(media?.src || "").trim(), "image")
    ) {
      return "";
    }

    return getAiBoardNumericLod(currentLod) ? currentLod : "";
    }
  };

  Controller.prototype.shouldHoldAiImageBoardPreviewForPendingLod = function shouldHoldAiImageBoardPreviewForPendingLod(mediaHost, src, kind, preview) {
    with (this) {

    const previewMode = String(preview?.previewMode || "");
    const previewSource = String(preview?.previewSource || "");
    const previewLod = String(preview?.lod || "");

    return Boolean(
      previewMode === "placeholder" &&
      (previewSource === "loading" || previewSource === "runtime" || previewSource === "error" || previewLod.startsWith("loading-") || previewLod.startsWith("error-")) &&
      hasAiImageBoardPaintedImagePreview(mediaHost, src, kind)
    );
    }
  };

  Controller.prototype.resolveAiImageBoardPreview = function resolveAiImageBoardPreview(media, recommendedLod) {
    with (this) {

    const src = String(media?.src || "").trim();
    const kind = media?.kind === "video" ? "video" : "image";
    const safeRecommendedLod = getAiBoardRuntimeSafeLod(media, recommendedLod);

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

    if (kind === "video") {
      return {
        kind,
        lod: "video-poster",
        previewKey: `${src}::video-poster`,
        previewMode: "video-poster",
        previewSource: "poster",
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

    if (!mediaHost) {
      return;
    }

    element.classList.toggle("has-generated-media", Boolean(src));

    if (!src) {
      resetAiImageBoardMediaHost(mediaHost);
      return;
    }

    if (
      kind === "image" &&
      preview.previewMode === "placeholder" &&
      preview.lod !== "unloaded" &&
      preview.previewSource !== "unloaded" &&
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
    const previewKey = String(preview.previewKey || previewSrcForDataset || previewMode);

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
        (kind === "video" && mediaHost.classList.contains("is-video-preview")) ||
        (kind === "image" && activeImageLayer?.dataset?.previewKey === previewKey)
      )
    );

    if (isStablePreviewCurrent) {
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
      renderAiImageBoardVideoPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset);
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

