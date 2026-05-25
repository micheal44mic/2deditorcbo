window.CBO = window.CBO || {};



(function registerAiBoardRuntimePreviewJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-runtime-preview.js.");

  }



  Controller.prototype.createEmptyAiBoardMetrics = function createEmptyAiBoardMetrics(overrides = {}) {
    with (this) {

    return {
      activePreviewCount: 0,
      boardDragging: false,
      boards: [],
      cameraMoving: false,
      deferredPreviewBoards: 0,
      dpr: 1,
      estimatedDecodedMB: 0,
      frameMs: 0,
      generatingBoards: 0,
      lastGenerateStatus: "",
      nearAiBoards: 0,
      offscreenAiBoards: 0,
      previewDebugEvents: [],
      renderedAiBoards: 0,
      runtimePreviewCacheCount: 0,
      runtimePreviewCacheMB: 0,
      runtimePreviewLoadingCount: 0,
      runtimePosterCacheCount: 0,
      runtimePosterLoadingCount: 0,
      stateBoards: 0,
      updatedAt: new Date().toISOString(),
      visibleAiBoards: 0,
      zoom: 1,
      ...overrides,
    };
    }
  };

  Controller.prototype.getAiBoardAssetLodFromSrc = function getAiBoardAssetLodFromSrc(src) {
    with (this) {

    const match = String(src || "").match(/(?:^|[-_/@])(128|240|256|360|480|512|720|1024|1080|2048)(?=[^0-9]|$)/);

    return match?.[1] || "";
    }
  };

  Controller.prototype.getAiBoardNeededPreviewPixels = function getAiBoardNeededPreviewPixels(screenWidth = 0, screenHeight = 0, dpr = 1) {
    with (this) {

    return Math.max(Number(screenWidth) || 0, Number(screenHeight) || 0) *
      Math.max(1, Number(dpr) || 1);
    }
  };

  Controller.prototype.isAiImageBoardMobileLowQualityPreview = function isAiImageBoardMobileLowQualityPreview() {
    with (this) {

    if (typeof isMobileLikeSpaceBoardViewport === "function") {
      return isMobileLikeSpaceBoardViewport();
    }

    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900
    );
    }
  };

  Controller.prototype.getAiImageBoardMobilePreviewLod = function getAiImageBoardMobilePreviewLod() {
    with (this) {

    const configuredLod = getAiBoardNumericLod(AI_IMAGE_MOBILE_CANVAS_PREVIEW_LOD);

    if (AI_IMAGE_PREVIEW_VARIANT_SIZES.includes(configuredLod)) {
      return String(configuredLod);
    }

    return String(AI_IMAGE_PREVIEW_VARIANT_SIZES[0] || 128);
    }
  };

  Controller.prototype.isAiImageBoardMobilePreviewLodAboveCap = function isAiImageBoardMobilePreviewLodAboveCap(lod) {
    with (this) {

    if (!isAiImageBoardMobileLowQualityPreview()) {
      return false;
    }

    const value = String(lod || "").trim();
    const numericLod = getAiBoardNumericLod(value);
    const mobileLod = getAiBoardNumericLod(getAiImageBoardMobilePreviewLod());

    return value === "full" || (numericLod > 0 && numericLod > mobileLod);
    }
  };

  Controller.prototype.getAiBoardNumericLod = function getAiBoardNumericLod(value) {
    with (this) {

    const match = String(value || "").match(/(?:^|[^0-9])(128|240|256|360|480|512|720|1024|1080|2048)(?:[^0-9]|$)/);
    const lod = Number(match?.[1] || 0);

    return Number.isFinite(lod) && lod > 0 ? lod : 0;
    }
  };

  Controller.prototype.getAiBoardLodTransitionThreshold = function getAiBoardLodTransitionThreshold(fromLod, toLod) {
    with (this) {

    const from = Number(fromLod) || 0;
    const to = Number(toLod) || 0;
    const lower = Math.min(from, to);
    const thresholds = [
      ...AI_IMAGE_PREVIEW_LOD_THRESHOLDS,
      ...AI_VIDEO_PREVIEW_LOD_THRESHOLDS,
    ];
    const threshold = thresholds.find((entry) => Number(entry.lod) === lower)?.max;

    return Number(threshold) || 0;
    }
  };

  Controller.prototype.getAiVideoBoardRecommendedLod = function getAiVideoBoardRecommendedLod(board, screenWidth = 0, screenHeight = 0, dpr = 1) {
    with (this) {

    return `video-${AI_VIDEO_CANVAS_PREVIEW_LOD}`;
    }
  };

  Controller.prototype.getAiBoardRecommendedLod = function getAiBoardRecommendedLod(board, screenWidth = 0, screenHeight = 0, dpr = 1) {
    with (this) {

    const media = board?.generatedMedia || null;
    const kind = media?.kind === "video" ? "video" : "image";
    const src = String(media?.src || "").trim();

    if (!src) {
      return "empty";
    }

    if (kind === "video") {
      return getAiVideoBoardRecommendedLod(board, screenWidth, screenHeight, dpr);
    }

    if (isAiImageBoardMobileLowQualityPreview()) {
      return getAiBoardRuntimeSafeLod(media, getAiImageBoardMobilePreviewLod());
    }

    const neededPixels = getAiBoardNeededPreviewPixels(screenWidth, screenHeight, dpr);

    let recommendedLod = "2048";

    if (neededPixels < 80) {
      recommendedLod = "128";
    } else if (neededPixels < 250) {
      recommendedLod = "256";
    } else if (neededPixels < 700) {
      recommendedLod = "512";
    } else if (neededPixels < 1400) {
      recommendedLod = "1024";
    }

    return getAiBoardRuntimeSafeLod(media, recommendedLod);
    }
  };

  Controller.prototype.getStableAiBoardRecommendedLod = function getStableAiBoardRecommendedLod(board, screenWidth = 0, screenHeight = 0, dpr = 1, mediaHost = null) {
    with (this) {

    const rawLod = getAiBoardRecommendedLod(board, screenWidth, screenHeight, dpr);
    const rawNumericLod = getAiBoardNumericLod(rawLod);
    const currentNumericLod = getAiBoardNumericLod(mediaHost?.dataset?.mediaLod || "");

    if (board?.generatedMedia?.kind !== "video" && isAiImageBoardMobileLowQualityPreview()) {
      return rawLod;
    }

    if (!rawNumericLod || !currentNumericLod || rawNumericLod === currentNumericLod) {
      return rawLod;
    }

    const threshold = getAiBoardLodTransitionThreshold(currentNumericLod, rawNumericLod);
    const neededPixels = getAiBoardNeededPreviewPixels(screenWidth, screenHeight, dpr);

    if (!threshold) {
      return rawLod;
    }

    if (rawNumericLod > currentNumericLod && neededPixels < threshold * AI_IMAGE_PREVIEW_LOD_UP_HYSTERESIS) {
      return String(currentNumericLod);
    }

    if (rawNumericLod < currentNumericLod && neededPixels > threshold * AI_IMAGE_PREVIEW_LOD_DOWN_HYSTERESIS) {
      return String(currentNumericLod);
    }

    return rawLod;
    }
  };

  Controller.prototype.isAiBoardPreviewActive = function isAiBoardPreviewActive(mediaHost) {
    with (this) {

    const activeImageLayer = getAiImageBoardActivePreviewLayer(mediaHost);

    return Boolean(
      mediaHost?.dataset?.mediaPreview &&
      (
        mediaHost.classList.contains("is-video-preview") ||
        (
          mediaHost.classList.contains("is-image-preview") &&
          Boolean(activeImageLayer?.currentSrc || activeImageLayer?.src || activeImageLayer?.dataset?.previewKey)
        ) ||
        mediaHost.style.backgroundImage
      )
    );
    }
  };

  Controller.prototype.getAiBoardCurrentLod = function getAiBoardCurrentLod(board, mediaHost) {
    with (this) {

    const media = board?.generatedMedia || null;
    const src = String(media?.src || "").trim();
    const previewMode = String(mediaHost?.dataset?.mediaPreview || "");

    if (!src) {
      return "empty";
    }

    if (previewMode === "placeholder") {
      return mediaHost?.dataset?.mediaLod || "placeholder";
    }

    if (!isAiBoardPreviewActive(mediaHost)) {
      return "unloaded";
    }

    if (media?.kind === "video") {
      return mediaHost?.dataset?.mediaLod || "video-full";
    }

    return mediaHost?.dataset?.mediaLod || getAiBoardAssetLodFromSrc(mediaHost?.dataset?.mediaPreviewSrc || src) || "full";
    }
  };

  Controller.prototype.getAiImageRuntimePreviewCacheKey = function getAiImageRuntimePreviewCacheKey(src, lod) {
    with (this) {

    return `${String(src || "").trim()}::${String(lod || "").trim()}`;
    }
  };

  Controller.prototype.estimateAiBoardDecodedMB = function estimateAiBoardDecodedMB(board, currentLod, isActivePreview, mediaHost = null) {
    with (this) {

    const media = board?.generatedMedia || null;

    if (!isActivePreview || !media || !media.src) {
      return 0;
    }

    if (
      media.kind === "video" &&
      (
        mediaHost?.dataset?.mediaVideoRenderMode === "deferred" ||
        !mediaHost?.querySelector?.("[data-ai-image-board-video]")
      )
    ) {
      return 0;
    }

    const originalWidth = Math.max(0, Number(media.width) || 0);
    const originalHeight = Math.max(0, Number(media.height) || 0);
    const lodSize = Number(currentLod);
    const numericLod = getAiBoardNumericLod(currentLod);
    const scale = Number.isFinite(lodSize) && lodSize > 0
      ? Math.min(1, lodSize / Math.max(1, originalWidth, originalHeight))
      : numericLod
        ? Math.min(1, numericLod / Math.max(1, originalWidth, originalHeight))
      : 1;
    const width = originalWidth * scale;
    const height = originalHeight * scale;
    const frameBudget = media.kind === "video"
      ? Math.max(1, Number(AI_VIDEO_DECODED_FRAME_BUDGET) || 1)
      : 1;

    return (width * height * 4 * frameBudget) / (1024 * 1024);
    }
  };

  Controller.prototype.estimateDecodedMBFromDimensions = function estimateDecodedMBFromDimensions(width, height) {
    with (this) {

    return (Math.max(0, Number(width) || 0) * Math.max(0, Number(height) || 0) * 4) / (1024 * 1024);
    }
  };

  Controller.prototype.getAiImageRuntimePreviewCacheStats = function getAiImageRuntimePreviewCacheStats() {
    with (this) {

    let readyCount = 0;
    let loadingCount = 0;
    let decodedMB = 0;

    aiImageRuntimePreviewCache.forEach((entry) => {
      if (entry.status === "loading") {
        loadingCount += 1;
      }

      if (entry.status === "ready") {
        readyCount += 1;
        decodedMB += estimateDecodedMBFromDimensions(entry.width, entry.height);
      }
    });

    return {
      decodedMB: roundMetricValue(decodedMB, 2),
      loadingCount,
      readyCount,
    };
    }
  };

  Controller.prototype.getAiVideoRuntimePosterCacheKey = function getAiVideoRuntimePosterCacheKey(src, lod = AI_VIDEO_CANVAS_PREVIEW_LOD) {
    with (this) {

    return `${String(src || "").trim()}::poster::${String(lod || AI_VIDEO_CANVAS_PREVIEW_LOD).trim()}`;
    }
  };

  Controller.prototype.getAiVideoRuntimePosterCacheStats = function getAiVideoRuntimePosterCacheStats() {
    with (this) {

    let readyCount = 0;
    let loadingCount = 0;

    aiVideoRuntimePosterCache.forEach((entry) => {
      if (entry.status === "loading") {
        loadingCount += 1;
      } else if (entry.status === "ready") {
        readyCount += 1;
      }
    });

    return {
      loadingCount,
      readyCount,
    };
    }
  };

  Controller.prototype.pruneAiVideoRuntimePosterCache = function pruneAiVideoRuntimePosterCache() {
    with (this) {

    const entries = Array.from(aiVideoRuntimePosterCache.entries())
      .filter(([, entry]) => entry.status !== "loading")
      .sort(([, first], [, second]) => (Number(first.lastUsedAt) || 0) - (Number(second.lastUsedAt) || 0));

    while (aiVideoRuntimePosterCache.size > AI_VIDEO_RUNTIME_POSTER_CACHE_MAX_ENTRIES && entries.length > 0) {
      const [key, entry] = entries.shift();

      if (String(entry.objectUrl || "").startsWith("blob:")) {
        URL.revokeObjectURL(entry.objectUrl);
      }

      aiVideoRuntimePosterCache.delete(key);
    }
    }
  };

  Controller.prototype.pruneAiImageRuntimePreviewCache = function pruneAiImageRuntimePreviewCache() {
    with (this) {

    const entries = Array.from(aiImageRuntimePreviewCache.entries())
      .filter(([, entry]) => entry.status !== "loading")
      .sort(([, first], [, second]) => (Number(first.lastUsedAt) || 0) - (Number(second.lastUsedAt) || 0));

    while (aiImageRuntimePreviewCache.size > AI_IMAGE_RUNTIME_PREVIEW_CACHE_MAX_ENTRIES && entries.length > 0) {
      const [key, entry] = entries.shift();

      if (String(entry.objectUrl || "").startsWith("blob:")) {
        URL.revokeObjectURL(entry.objectUrl);
      }

      aiImageRuntimePreviewCache.delete(key);
    }
    }
  };

  Controller.prototype.shouldUseDataUrlRuntimePreview = function shouldUseDataUrlRuntimePreview() {
    with (this) {

    return isAiImageBoardIosSafariPreviewDevice();
    }
  };

  Controller.prototype.isAiImageBoardIosSafariPreviewDevice = function isAiImageBoardIosSafariPreviewDevice() {
    with (this) {

    const ua = String(navigator.userAgent || "");
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1);
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/i.test(ua);

    return isIos && isSafari;
    }
  };

  Controller.prototype.getAiImageRuntimePreviewQuality = function getAiImageRuntimePreviewQuality() {
    with (this) {

    return isAiImageBoardMobileLowQualityPreview()
      ? AI_IMAGE_MOBILE_RUNTIME_PREVIEW_QUALITY
      : AI_IMAGE_RUNTIME_PREVIEW_QUALITY;
    }
  };

  Controller.prototype.getAiBoardRuntimeSafeLod = function getAiBoardRuntimeSafeLod(media, lod) {
    with (this) {

    const requestedLod = String(lod || "").trim();

    if (
      AI_IMAGE_UNSTABLE_RUNTIME_LODS.has(Number(requestedLod)) &&
      !getAiImageBoardMediaVariantSrc(media, requestedLod)
    ) {
      const skipKey = `${media?.src || ""}::${requestedLod}::1024`;

      if (!aiRuntimeLodSkipDebugKeys.has(skipKey)) {
        aiRuntimeLodSkipDebugKeys.add(skipKey);
        recordAiBoardPreviewDebugEvent("runtime-lod-skip", {
          lod: requestedLod,
          nextLod: "1024",
          reason: "unstable-runtime-lod",
          src: media?.src || "",
        });
      }

      return "1024";
    }

    return requestedLod;
    }
  };

  Controller.prototype.normalizeAiImageBoardMobileCanvasPreviewLod = function normalizeAiImageBoardMobileCanvasPreviewLod(media, lod) {
    with (this) {

    const requestedLod = String(lod || "").trim();

    if (media?.kind === "video" || !isAiImageBoardMobileLowQualityPreview()) {
      return getAiBoardRuntimeSafeLod(media, requestedLod);
    }

    if (requestedLod === "empty" || requestedLod === "placeholder" || requestedLod === "unloaded") {
      return requestedLod;
    }

    const mobileLod = getAiImageBoardMobilePreviewLod();
    const mobileNumericLod = getAiBoardNumericLod(mobileLod);
    const requestedNumericLod = getAiBoardNumericLod(requestedLod);

    if (requestedLod.startsWith("loading-") || requestedLod.startsWith("error-")) {
      if (!requestedNumericLod || requestedNumericLod > mobileNumericLod) {
        return `${requestedLod.startsWith("loading-") ? "loading" : "error"}-${mobileLod}`;
      }

      return requestedLod;
    }

    if (
      requestedLod === "full" ||
      !AI_IMAGE_PREVIEW_VARIANT_SIZES.includes(Number(requestedLod)) ||
      (requestedNumericLod > 0 && requestedNumericLod > mobileNumericLod)
    ) {
      recordAiBoardPreviewDebugEvent("mobile-full-preview-blocked", {
        lod: requestedLod || "missing",
        mobileLod,
        src: media?.src || "",
      });
      return getAiBoardRuntimeSafeLod(media, mobileLod);
    }

    return getAiBoardRuntimeSafeLod(media, requestedLod);
    }
  };

  Controller.prototype.loadImageElementForRuntimePreview = function loadImageElementForRuntimePreview(src) {
    with (this) {

    return new Promise((resolve, reject) => {
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

        if (!image.complete || Number(image.naturalWidth) <= 0 || Number(image.naturalHeight) <= 0) {
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
        reject(new Error(`Unable to load AI preview source: ${src}`));
      };

      image.decoding = "async";
      image.onload = finish;
      image.onerror = fail;
      image.src = src;

      if (image.decode) {
        image.decode().then(() => {
          finish();
        }).catch(() => {
          // Keep the load/error handlers as the compatibility fallback.
        });
      }

      if (image.complete && Number(image.naturalWidth) > 0 && Number(image.naturalHeight) > 0) {
        finish();
      }
    });
    }
  };

  Controller.prototype.waitAiImageRuntimePreviewFrame = function waitAiImageRuntimePreviewFrame(frameCount = 1) {
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

  Controller.prototype.stageAiImageRuntimePreviewSourceForIos = async function stageAiImageRuntimePreviewSourceForIos(image) {
    with (this) {

    if (!image || !isAiImageBoardIosSafariPreviewDevice() || image.isConnected || !document.body) {
      return false;
    }

    image.dataset.aiRuntimePreviewStaging = "";
    image.setAttribute("aria-hidden", "true");
    image.style.position = "fixed";
    image.style.left = "-10000px";
    image.style.top = "0";
    image.style.width = "1px";
    image.style.height = "1px";
    image.style.opacity = "0";
    image.style.pointerEvents = "none";
    image.style.contain = "strict";
    document.body.appendChild(image);
    await waitAiImageRuntimePreviewFrame(2);

    return true;
    }
  };

  Controller.prototype.drawAiImageRuntimePreviewCanvas = async function drawAiImageRuntimePreviewCanvas(context, canvas, image, width, height, lod, src) {
    with (this) {

    const maxAttempts = isAiImageBoardIosSafariPreviewDevice() ? 4 : 2;
    let lastProbe = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = isAiImageBoardMobileLowQualityPreview() ? "low" : "medium";
      context.drawImage(image, 0, 0, width, height);
      context.restore();

      const probe = probeAiImageRuntimePreviewCanvas(canvas);

      lastProbe = probe;

      if (!probe.blank) {
        if (attempt > 1) {
          recordAiBoardPreviewDebugEvent("runtime-preview-draw-retry-success", {
            attempt,
            lod,
            probe,
            src,
          });
        }

        return probe;
      }

      if (attempt < maxAttempts) {
        recordAiBoardPreviewDebugEvent("runtime-preview-draw-blank-retry", {
          attempt,
          lod,
          probe,
          sourceComplete: image.complete ? 1 : 0,
          sourceNatural: `${image.naturalWidth || 0}x${image.naturalHeight || 0}`,
          src,
        });
        await waitAiImageRuntimePreviewFrame(isAiImageBoardIosSafariPreviewDevice() ? 2 : 1);
      }
    }

    return lastProbe || probeAiImageRuntimePreviewCanvas(canvas);
    }
  };

  Controller.prototype.canvasToBlob = function canvasToBlob(canvas, type, quality) {
    with (this) {

    return new Promise((resolve, reject) => {
      if (!canvas.toBlob) {
        try {
          const dataUrl = canvas.toDataURL(type, quality);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
        return;
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to create AI preview blob."));
        }
      }, type, quality);
    });
    }
  };

  Controller.prototype.canvasToRuntimePreviewUrl = async function canvasToRuntimePreviewUrl(canvas) {
    with (this) {

    const quality = getAiImageRuntimePreviewQuality();

    if (shouldUseDataUrlRuntimePreview()) {
      return {
        sourceType: "data-url",
        url: canvas.toDataURL("image/webp", quality),
      };
    }

    const blobOrDataUrl = await canvasToBlob(canvas, "image/webp", quality);

    return {
      sourceType: typeof blobOrDataUrl === "string" ? "data-url" : "blob",
      url: typeof blobOrDataUrl === "string" ? blobOrDataUrl : URL.createObjectURL(blobOrDataUrl),
    };
    }
  };

  Controller.prototype.buildAiImageRuntimePreviewVariant = async function buildAiImageRuntimePreviewVariant(src, lod) {
    with (this) {

    const image = await loadImageElementForRuntimePreview(src);
    const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width) || 1);
    const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height) || 1);
    const targetMax = Math.max(1, Number(lod) || 1);
    const scale = Math.min(1, targetMax / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    const stagedForIos = await stageAiImageRuntimePreviewSourceForIos(image);

    canvas.width = width;
    canvas.height = height;

    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("Unable to create AI runtime preview canvas context.");
      }

      const probe = await drawAiImageRuntimePreviewCanvas(context, canvas, image, width, height, lod, src);

      if (probe.blank) {
        const error = new Error(`Blank AI runtime preview canvas for LOD ${lod}.`);

        error.previewProbe = probe;
        throw error;
      }

      const previewUrl = await canvasToRuntimePreviewUrl(canvas);

      return {
        height,
        objectUrl: previewUrl.url,
        probe,
        sourceType: previewUrl.sourceType,
        width,
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      if (stagedForIos) {
        image.remove();
      }
      image.removeAttribute("src");
    }
    }
  };

  Controller.prototype.loadVideoElementForRuntimePoster = function loadVideoElementForRuntimePoster(src) {
    with (this) {

    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      let settled = false;
      let timeoutId = 0;
      const cleanup = () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = 0;
        }

        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onerror = null;
      };
      const finish = () => {
        if (settled) {
          return;
        }

        if (Number(video.videoWidth) <= 0 || Number(video.videoHeight) <= 0 || Number(video.readyState) < 2) {
          return;
        }

        settled = true;
        cleanup();
        resolve(video);
      };
      const fail = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(`Unable to load AI video poster source: ${src}`));
      };

      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("preload", "metadata");
      video.onloadedmetadata = finish;
      video.onloadeddata = finish;
      video.oncanplay = finish;
      video.onerror = fail;
      timeoutId = window.setTimeout(fail, 2600);
      video.src = src;
      video.load?.();
    });
    }
  };

  Controller.prototype.drawAiVideoRuntimePosterCanvas = async function drawAiVideoRuntimePosterCanvas(context, canvas, video, width, height, lod, src) {
    with (this) {

    await waitAiImageRuntimePreviewFrame(2);

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#111318";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = isAiImageBoardMobileLowQualityPreview() ? "low" : "medium";
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    return probeAiImageRuntimePreviewCanvas(canvas);
    }
  };

  Controller.prototype.buildAiVideoRuntimePoster = async function buildAiVideoRuntimePoster(src, lod = AI_VIDEO_CANVAS_PREVIEW_LOD) {
    with (this) {

    const video = await loadVideoElementForRuntimePoster(src);
    const sourceWidth = Math.max(1, Number(video.videoWidth || video.width) || 1);
    const sourceHeight = Math.max(1, Number(video.videoHeight || video.height) || 1);
    const targetMax = Math.max(1, Number(lod) || AI_VIDEO_CANVAS_PREVIEW_LOD);
    const scale = Math.min(1, targetMax / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("Unable to create AI video poster canvas context.");
      }

      const probe = await drawAiVideoRuntimePosterCanvas(context, canvas, video, width, height, lod, src);
      const previewUrl = await canvasToRuntimePreviewUrl(canvas);

      return {
        height,
        objectUrl: previewUrl.url,
        probe,
        sourceType: previewUrl.sourceType,
        width,
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      video.removeAttribute("src");
      video.load?.();
    }
    }
  };

  Controller.prototype.probeAiImagePreviewDrawable = function probeAiImagePreviewDrawable(drawable) {
    with (this) {

    const width = Math.max(
      1,
      Number(drawable?.naturalWidth || drawable?.videoWidth || drawable?.width) || 0,
    );
    const height = Math.max(
      1,
      Number(drawable?.naturalHeight || drawable?.videoHeight || drawable?.height) || 0,
    );
    const probeSize = 32;
    const probeCanvas = document.createElement("canvas");
    const probeContext = probeCanvas.getContext("2d", { willReadFrequently: true });

    if (!probeContext) {
      return {
        blank: false,
        error: "missing-2d-context",
        height,
        width,
      };
    }

    probeCanvas.width = probeSize;
    probeCanvas.height = probeSize;

    try {
      probeContext.drawImage(drawable, 0, 0, probeSize, probeSize);

      const data = probeContext.getImageData(0, 0, probeSize, probeSize).data;
      const total = probeSize * probeSize;
      let alphaPixels = 0;
      let lumaMax = 0;
      let lumaMin = 255;
      let nonWhitePixels = 0;

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        if (alpha <= 12) {
          continue;
        }

        const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

        alphaPixels += 1;
        lumaMin = Math.min(lumaMin, luma);
        lumaMax = Math.max(lumaMax, luma);

        if (!(red >= 248 && green >= 248 && blue >= 248)) {
          nonWhitePixels += 1;
        }
      }

      const alphaRatio = alphaPixels / total;
      const nonWhiteRatio = nonWhitePixels / total;
      const lumaRange = alphaPixels > 0 ? lumaMax - lumaMin : 0;
      const blank = alphaRatio < 0.01 || (nonWhiteRatio < 0.003 && lumaRange < 8);

      return {
        alphaRatio: roundMetricValue(alphaRatio, 4),
        blank,
        height,
        lumaRange: roundMetricValue(lumaRange, 2),
        nonWhiteRatio: roundMetricValue(nonWhiteRatio, 4),
        width,
      };
    } catch (error) {
      return {
        blank: false,
        error: error?.message || String(error || "probe-error"),
        height,
        width,
      };
    } finally {
      probeCanvas.width = 1;
      probeCanvas.height = 1;
    }
    }
  };

  Controller.prototype.evictAiImageRuntimePreviewVariantsForSrc = function evictAiImageRuntimePreviewVariantsForSrc(src) {
    with (this) {

    const normalizedSrc = String(src || "").trim();
    let evictedCount = 0;

    if (!normalizedSrc) {
      return 0;
    }

    Array.from(aiImageRuntimePreviewCache.entries()).forEach(([key, entry]) => {
      if (entry?.src !== normalizedSrc || entry.status === "loading") {
        return;
      }

      if (String(entry.objectUrl || "").startsWith("blob:")) {
        URL.revokeObjectURL(entry.objectUrl);
      }

      aiImageRuntimePreviewCache.delete(key);
      evictedCount += 1;
    });

    return evictedCount;
    }
  };

  Controller.prototype.getAiImageBoardRuntimePreviewSrc = function getAiImageBoardRuntimePreviewSrc(board) {
    with (this) {

    const media = board?.generatedMedia || null;
    const kind = media?.kind === "video" ? "video" : "image";
    const src = String(media?.src || "").trim();

    return kind === "image" ? src : "";
    }
  };

  Controller.prototype.collectRetainedAiImageRuntimePreviewSrcs = function collectRetainedAiImageRuntimePreviewSrcs(aiBoards, visibleViewportRect) {
    with (this) {

    const retainedSrcs = new Set();

    (Array.isArray(aiBoards) ? aiBoards : []).forEach((board) => {
      const src = getAiImageBoardRuntimePreviewSrc(board);

      if (!src) {
        return;
      }

      if (String(board?.id || "") === selectedSpaceBoardId) {
        retainedSrcs.add(src);
        return;
      }

      const boardRect = getSpaceBoardRect(board);

      if (boardRect && visibleViewportRect && rectsOverlap(boardRect, visibleViewportRect)) {
        retainedSrcs.add(src);
      }
    });

    return retainedSrcs;
    }
  };

  Controller.prototype.shouldEvictAiImageRuntimePreviewVariantsForSrc = function shouldEvictAiImageRuntimePreviewVariantsForSrc(src, retainedRuntimePreviewSrcs = null) {
    with (this) {

    const normalizedSrc = String(src || "").trim();

    return Boolean(
      normalizedSrc &&
      !(retainedRuntimePreviewSrcs instanceof Set && retainedRuntimePreviewSrcs.has(normalizedSrc))
    );
    }
  };

  Controller.prototype.probeAiImageRuntimePreviewCanvas = function probeAiImageRuntimePreviewCanvas(canvas) {
    with (this) {

    return probeAiImagePreviewDrawable(canvas);
    }
  };

  Controller.prototype.probeAiImagePreviewLayer = function probeAiImagePreviewLayer(image) {
    with (this) {

    return probeAiImagePreviewDrawable(image);
    }
  };

  Controller.prototype.requestAiImageRuntimePreviewVariant = function requestAiImageRuntimePreviewVariant(src, lod) {
    with (this) {

    const normalizedSrc = String(src || "").trim();
    const normalizedLod = String(lod || "").trim();

    if (!normalizedSrc || !AI_IMAGE_PREVIEW_VARIANT_SIZES.includes(Number(normalizedLod))) {
      return null;
    }

    const key = getAiImageRuntimePreviewCacheKey(normalizedSrc, normalizedLod);
    const cached = aiImageRuntimePreviewCache.get(key);

    if (cached) {
      cached.lastUsedAt = performance.now?.() || Date.now();
      return cached;
    }

    const entry = {
      height: 0,
      lastUsedAt: performance.now?.() || Date.now(),
      lod: normalizedLod,
      objectUrl: "",
      probe: null,
      sourceType: "",
      src: normalizedSrc,
      status: "loading",
      width: 0,
    };

    aiImageRuntimePreviewCache.set(key, entry);
    recordAiBoardPreviewDebugEvent("runtime-preview-request", {
      lod: normalizedLod,
      src: normalizedSrc,
    });
    buildAiImageRuntimePreviewVariant(normalizedSrc, normalizedLod)
      .then((result) => {
        entry.height = result.height;
        entry.objectUrl = result.objectUrl;
        entry.probe = result.probe || null;
        entry.sourceType = result.sourceType;
        entry.status = "ready";
        entry.width = result.width;
        entry.lastUsedAt = performance.now?.() || Date.now();
        recordAiBoardPreviewDebugEvent("runtime-preview-ready", {
          height: result.height,
          lod: normalizedLod,
          probe: result.probe || null,
          sourceType: result.sourceType,
          src: normalizedSrc,
          status: "ready",
          width: result.width,
        });
        pruneAiImageRuntimePreviewCache();
        renderSpaceBoards();
      })
      .catch((error) => {
        entry.error = error?.message || String(error || "error");
        entry.probe = error?.previewProbe || null;
        entry.status = "error";
        recordAiBoardPreviewDebugEvent(entry.probe?.blank ? "runtime-preview-blank" : "runtime-preview-error", {
          lod: normalizedLod,
          message: entry.error,
          probe: entry.probe,
          src: normalizedSrc,
          status: "error",
        });
        console.warn("[CBO] Unable to create runtime AI preview variant.", error);
        renderSpaceBoards();
      });

    return entry;
    }
  };

  Controller.prototype.requestAiVideoRuntimePoster = function requestAiVideoRuntimePoster(src, lod = AI_VIDEO_CANVAS_PREVIEW_LOD) {
    with (this) {

    const normalizedSrc = String(src || "").trim();
    const normalizedLod = String(lod || AI_VIDEO_CANVAS_PREVIEW_LOD).trim();

    if (!normalizedSrc) {
      return null;
    }

    const key = getAiVideoRuntimePosterCacheKey(normalizedSrc, normalizedLod);
    const cached = aiVideoRuntimePosterCache.get(key);

    if (cached) {
      cached.lastUsedAt = performance.now?.() || Date.now();
      return cached;
    }

    const entry = {
      height: 0,
      lastUsedAt: performance.now?.() || Date.now(),
      lod: normalizedLod,
      objectUrl: "",
      probe: null,
      sourceType: "",
      src: normalizedSrc,
      status: "loading",
      width: 0,
    };

    aiVideoRuntimePosterCache.set(key, entry);
    recordAiBoardPreviewDebugEvent("video-poster-request", {
      lod: normalizedLod,
      src: normalizedSrc,
    });
    buildAiVideoRuntimePoster(normalizedSrc, normalizedLod)
      .then((result) => {
        entry.height = result.height;
        entry.objectUrl = result.objectUrl;
        entry.probe = result.probe || null;
        entry.sourceType = result.sourceType;
        entry.status = "ready";
        entry.width = result.width;
        entry.lastUsedAt = performance.now?.() || Date.now();
        recordAiBoardPreviewDebugEvent("video-poster-ready", {
          height: result.height,
          lod: normalizedLod,
          probe: result.probe || null,
          sourceType: result.sourceType,
          src: normalizedSrc,
          status: "ready",
          width: result.width,
        });
        pruneAiVideoRuntimePosterCache();
        renderSpaceBoards();
      })
      .catch((error) => {
        entry.error = error?.message || String(error || "error");
        entry.status = "error";
        recordAiBoardPreviewDebugEvent("video-poster-error", {
          lod: normalizedLod,
          message: entry.error,
          src: normalizedSrc,
          status: "error",
        });
        console.warn("[CBO] Unable to create runtime AI video poster.", error);
        renderSpaceBoards();
      });

    return entry;
    }
  };

  Controller.prototype.markAiImageRuntimePreviewVariantError = function markAiImageRuntimePreviewVariantError(src, lod, message, probe = null) {
    with (this) {

    const key = getAiImageRuntimePreviewCacheKey(src, lod);
    const entry = aiImageRuntimePreviewCache.get(key);

    if (!entry) {
      return;
    }

    if (String(entry.objectUrl || "").startsWith("blob:")) {
      URL.revokeObjectURL(entry.objectUrl);
    }

    entry.error = String(message || "Runtime AI preview failed.");
    entry.objectUrl = "";
    entry.probe = probe || entry.probe || null;
    entry.status = "error";
    }
  };

  Controller.prototype.preloadAiImageBoardRuntimeLod = function preloadAiImageBoardRuntimeLod(media, recommendedLod) {
    with (this) {

    const kind = media?.kind === "video" ? "video" : "image";
    const src = String(media?.src || "").trim();
    const safeRecommendedLod = getAiBoardRuntimeSafeLod(media, recommendedLod);

    if (kind !== "image" || !src || !AI_IMAGE_PREVIEW_VARIANT_SIZES.includes(Number(safeRecommendedLod))) {
      return;
    }

    if (getAiImageBoardMediaVariantSrc(media, safeRecommendedLod)) {
      return;
    }

    requestAiImageRuntimePreviewVariant(src, safeRecommendedLod);
    }
  };

  Controller.prototype.getAiBoardVisibilityState = function getAiBoardVisibilityState(boardRect, visibleViewportRect, nearViewportRect) {
    with (this) {

    if (boardRect && visibleViewportRect && rectsOverlap(boardRect, visibleViewportRect)) {
      return "visible";
    }

    if (boardRect && nearViewportRect && rectsOverlap(boardRect, nearViewportRect)) {
      return "near";
    }

    return "offscreen";
    }
  };

  Controller.prototype.getShortAiBoardId = function getShortAiBoardId(boardId) {
    with (this) {

    const value = String(boardId || "");

    return value.length > 18 ? value.slice(-18) : value;
    }
  };

  Controller.prototype.summarizeAiBoardPreviewSrc = function summarizeAiBoardPreviewSrc(src) {
    with (this) {

    const value = String(src || "");

    if (value.startsWith("data:")) {
      return `${value.slice(0, 32)}...(${value.length} chars)`;
    }

    return value;
    }
  };

  Controller.prototype.getAiBoardDebugBoardIdFromMediaHost = function getAiBoardDebugBoardIdFromMediaHost(mediaHost) {
    with (this) {

    return String(mediaHost?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();
    }
  };

  Controller.prototype.roundAiBoardDebugRect = function roundAiBoardDebugRect(rect) {
    with (this) {

    if (!rect) {
      return null;
    }

    return {
      bottom: roundMetricValue(rect.bottom, 2),
      height: roundMetricValue(rect.height, 2),
      left: roundMetricValue(rect.left, 2),
      right: roundMetricValue(rect.right, 2),
      top: roundMetricValue(rect.top, 2),
      width: roundMetricValue(rect.width, 2),
    };
    }
  };

  Controller.prototype.summarizeAiBoardDebugValue = function summarizeAiBoardDebugValue(key, value) {
    with (this) {

    if (value == null) {
      return value;
    }

    if (/src|url|key/i.test(String(key || ""))) {
      return summarizeAiBoardPreviewSrc(value);
    }

    return value;
    }
  };

  Controller.prototype.normalizeAiBoardDebugDetail = function normalizeAiBoardDebugDetail(detail = {}) {
    with (this) {

    return Object.fromEntries(Object.entries(detail).map(([key, value]) => [
      key,
      summarizeAiBoardDebugValue(key, value),
    ]));
    }
  };

  Controller.prototype.recordAiBoardPreviewDebugEvent = function recordAiBoardPreviewDebugEvent(eventName, detail = {}) {
    with (this) {

    const normalizedDetail = normalizeAiBoardDebugDetail(detail);
    const boardId = String(normalizedDetail.boardId || "").trim();
    const event = {
      at: new Date().toISOString(),
      detail: normalizedDetail,
      eventName,
      id: aiBoardPreviewDebugEventId++,
    };

    aiBoardPreviewDebugEvents.push(event);

    while (aiBoardPreviewDebugEvents.length > AI_BOARD_PREVIEW_DEBUG_EVENT_LIMIT) {
      aiBoardPreviewDebugEvents.shift();
    }

    if (boardId) {
      aiBoardPreviewDebugByBoardId.set(boardId, event);
    }

    return event;
    }
  };

  Controller.prototype.getAiBoardPreviewTraceSignature = function getAiBoardPreviewTraceSignature(boardMetric) {
    with (this) {

    const debug = boardMetric?.previewDebug || {};
    const host = debug.host || {};
    const activeLayer = debug.activeLayer || {};
    const probe = activeLayer.probe || {};

    return [
      boardMetric?.visibility || "",
      boardMetric?.activePreview ? "1" : "0",
      debug.diagnosis || "",
      boardMetric?.currentLod || "",
      boardMetric?.recommendedLod || "",
      boardMetric?.previewSource || "",
      host.preview || "",
      host.pendingLod || "",
      activeLayer.complete ? "1" : "0",
      activeLayer.naturalWidth || 0,
      activeLayer.naturalHeight || 0,
      activeLayer.opacity || "",
      probe.blank || "",
    ].join("|");
    }
  };

  Controller.prototype.shouldRecordAiBoardPreviewDisappearanceTrace = function shouldRecordAiBoardPreviewDisappearanceTrace(boardMetric) {
    with (this) {

    if (!boardMetric?.generated || boardMetric.mediaKind === "video" || boardMetric.visibility === "offscreen") {
      return false;
    }

    const diagnosis = String(boardMetric.previewDebug?.diagnosis || "");
    const source = String(boardMetric.previewSource || "");
    const currentLod = String(boardMetric.currentLod || "");

    return !boardMetric.activePreview ||
      diagnosis === "no-active-layer" ||
      diagnosis === "active-layer-no-src" ||
      diagnosis === "active-layer-hidden" ||
      diagnosis === "active-layer-not-decoded" ||
      diagnosis === "zero-rect" ||
      source === "unloaded" ||
      currentLod === "unloaded";
    }
  };

  Controller.prototype.traceAiBoardPreviewVisibility = function traceAiBoardPreviewVisibility(metrics) {
    with (this) {

    if (metrics?.boardDragging || !isAiImageBoardMobileLowQualityPreview() || !metrics?.boards?.length) {
      return;
    }

    metrics.boards.forEach((boardMetric) => {
      const boardId = String(boardMetric?.id || "").trim();

      if (!boardId || !boardMetric.generated) {
        return;
      }

      const signature = getAiBoardPreviewTraceSignature(boardMetric);
      const previous = aiBoardPreviewTraceByBoardId.get(boardId);

      if (previous === signature) {
        return;
      }

      aiBoardPreviewTraceByBoardId.set(boardId, signature);

      const eventName = shouldRecordAiBoardPreviewDisappearanceTrace(boardMetric)
        ? "preview-disappearance-trace"
        : "preview-visibility-trace";
      const debug = boardMetric.previewDebug || {};
      const activeLayer = debug.activeLayer || {};
      const host = debug.host || {};

      recordAiBoardPreviewDebugEvent(eventName, {
        activePreview: boardMetric.activePreview ? 1 : 0,
        boardId,
        currentLod: boardMetric.currentLod || "",
        diagnosis: debug.diagnosis || "",
        hostPreview: host.preview || "",
        layerComplete: activeLayer.complete ? 1 : 0,
        layerNatural: `${activeLayer.naturalWidth || 0}x${activeLayer.naturalHeight || 0}`,
        mediaKind: boardMetric.mediaKind || "",
        previewSource: boardMetric.previewSource || "",
        recommendedLod: boardMetric.recommendedLod || "",
        visibility: boardMetric.visibility || "",
      });
    });
    }
  };

  Controller.prototype.getAiBoardLayerDebug = function getAiBoardLayerDebug(layer) {
    with (this) {

    if (!layer) {
      return null;
    }

    const style = window.getComputedStyle?.(layer);

    return {
      active: layer.classList.contains("is-active"),
      complete: Boolean(layer.complete),
      currentSrc: summarizeAiBoardPreviewSrc(layer.currentSrc || ""),
      display: style?.display || "",
      naturalHeight: Number(layer.naturalHeight) || 0,
      naturalWidth: Number(layer.naturalWidth) || 0,
      name: String(layer.dataset.aiImageBoardPreviewLayer || ""),
      probe: {
        alphaRatio: layer.dataset.previewProbeAlpha || "",
        blank: layer.dataset.previewProbeBlank || "",
        lumaRange: layer.dataset.previewProbeLumaRange || "",
        nonWhiteRatio: layer.dataset.previewProbeNonWhite || "",
      },
      opacity: style?.opacity || "",
      previewKey: summarizeAiBoardPreviewSrc(layer.dataset.previewKey || ""),
      previewLod: layer.dataset.previewLod || "",
      previewSource: layer.dataset.previewSource || "",
      rect: roundAiBoardDebugRect(layer.getBoundingClientRect?.()),
      src: summarizeAiBoardPreviewSrc(layer.getAttribute("src") || layer.src || ""),
      visibility: style?.visibility || "",
      zIndex: style?.zIndex || "",
    };
    }
  };

  Controller.prototype.getAiBoardPreviewDiagnosis = function getAiBoardPreviewDiagnosis(mediaHost, activeLayer) {
    with (this) {

    if (!mediaHost) {
      return "no-media-host";
    }

    if (mediaHost.classList.contains("is-placeholder-preview")) {
      return `placeholder-${mediaHost.dataset.mediaPreviewSource || "unknown"}`;
    }

    if (mediaHost.classList.contains("is-video-preview")) {
      const video = mediaHost.querySelector?.("[data-ai-image-board-video]");

      if (!video) {
        if (mediaHost.dataset.mediaVideoRenderMode === "deferred") {
          return "video-deferred";
        }

        return "video-no-element";
      }

      if (!(video.currentSrc || video.src || video.getAttribute("src"))) {
        return "video-no-src";
      }

      return video.paused ? "video-paused" : "video-playing";
    }

    if (!activeLayer) {
      return "no-active-layer";
    }

    const activeStyle = window.getComputedStyle?.(activeLayer);
    const hostRect = mediaHost.getBoundingClientRect?.();
    const layerRect = activeLayer.getBoundingClientRect?.();

    if (!(activeLayer.currentSrc || activeLayer.src || activeLayer.getAttribute("src"))) {
      return "active-layer-no-src";
    }

    if (!activeLayer.complete || Number(activeLayer.naturalWidth) <= 0 || Number(activeLayer.naturalHeight) <= 0) {
      return "active-layer-not-decoded";
    }

    if (activeStyle?.display === "none" || activeStyle?.visibility === "hidden" || activeStyle?.opacity === "0") {
      return "active-layer-hidden";
    }

    if (!hostRect || hostRect.width <= 0 || hostRect.height <= 0 || !layerRect || layerRect.width <= 0 || layerRect.height <= 0) {
      return "zero-rect";
    }

    return "painted-or-compositor";
    }
  };

  Controller.prototype.getAiBoardPreviewDebugSnapshot = function getAiBoardPreviewDebugSnapshot(element, mediaHost) {
    with (this) {

    const activeLayer = getAiImageBoardActivePreviewLayer(mediaHost);
    const layers = mediaHost
      ? Array.from(mediaHost.querySelectorAll("[data-ai-image-board-preview-layer]")).map(getAiBoardLayerDebug)
      : [];
    const hostStyle = mediaHost ? window.getComputedStyle?.(mediaHost) : null;
    const boardId = String(element?.dataset?.boardId || getAiBoardDebugBoardIdFromMediaHost(mediaHost)).trim();
    const lastEvent = boardId ? aiBoardPreviewDebugByBoardId.get(boardId) : null;

    return {
      activeLayer: getAiBoardLayerDebug(activeLayer),
      diagnosis: getAiBoardPreviewDiagnosis(mediaHost, activeLayer),
      host: mediaHost ? {
        activeLayerName: mediaHost.dataset.mediaActiveLayer || "",
        className: mediaHost.className || "",
        display: hostStyle?.display || "",
        kind: mediaHost.dataset.mediaKind || "",
        lod: mediaHost.dataset.mediaLod || "",
        opacity: hostStyle?.opacity || "",
        pendingKind: mediaHost.dataset.mediaPendingKind || "",
        pendingLod: mediaHost.dataset.mediaPendingLod || "",
        pendingPreviewKey: summarizeAiBoardPreviewSrc(mediaHost.dataset.mediaPendingPreviewKey || ""),
        pendingSource: mediaHost.dataset.mediaPendingPreviewSource || "",
        pendingSrc: summarizeAiBoardPreviewSrc(mediaHost.dataset.mediaPendingSrc || ""),
        preview: mediaHost.dataset.mediaPreview || "",
        previewKey: summarizeAiBoardPreviewSrc(mediaHost.dataset.mediaPreviewKey || ""),
        previewSource: mediaHost.dataset.mediaPreviewSource || "",
        previewSrc: summarizeAiBoardPreviewSrc(mediaHost.dataset.mediaPreviewSrc || ""),
        rect: roundAiBoardDebugRect(mediaHost.getBoundingClientRect?.()),
        src: summarizeAiBoardPreviewSrc(mediaHost.dataset.mediaSrc || ""),
        swapRequest: mediaHost.dataset.mediaPreviewSwapRequest || "",
        visibility: hostStyle?.visibility || "",
        videoRenderMode: mediaHost.dataset.mediaVideoRenderMode || "",
      } : null,
      lastEvent: lastEvent ? {
        at: lastEvent.at,
        detail: lastEvent.detail,
        eventName: lastEvent.eventName,
        id: lastEvent.id,
      } : null,
      layers,
    };
    }
  };

  Controller.prototype.publishAiBoardMetrics = function publishAiBoardMetrics(metrics) {
    with (this) {

    traceAiBoardPreviewVisibility(metrics);
    metrics.previewDebugEvents = aiBoardPreviewDebugEvents.map((event) => ({ ...event }));
    aiBoardMetrics = {
      ...metrics,
      boards: Array.isArray(metrics.boards) ? metrics.boards.map((board) => ({ ...board })) : [],
      previewDebugEvents: Array.isArray(metrics.previewDebugEvents) ? metrics.previewDebugEvents.map((event) => ({ ...event })) : [],
      updatedAt: new Date().toISOString(),
    };
    namespace.aiBoardMetrics = aiBoardMetrics;
    }
  };

  Controller.prototype.shouldUsePlainAiBoardArtboards = function shouldUsePlainAiBoardArtboards() {
    with (this) {

    return AI_BOARD_ARTBOARD_PLAIN_MODE === true;
    }
  };

})(window.CBO);
