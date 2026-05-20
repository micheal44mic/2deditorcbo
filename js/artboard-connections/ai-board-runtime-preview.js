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

    const match = String(src || "").match(/(?:^|[-_/@])(128|256|512|1024|2048)(?=[^0-9]|$)/);

    return match?.[1] || "";
    }
  };

  Controller.prototype.getAiBoardNeededPreviewPixels = function getAiBoardNeededPreviewPixels(screenWidth = 0, screenHeight = 0, dpr = 1) {
    with (this) {

    return Math.max(Number(screenWidth) || 0, Number(screenHeight) || 0) *
      Math.max(1, Number(dpr) || 1);
    }
  };

  Controller.prototype.getAiBoardNumericLod = function getAiBoardNumericLod(value) {
    with (this) {

    const match = String(value || "").match(/(?:^|[^0-9])(128|256|512|1024|2048)(?:[^0-9]|$)/);
    const lod = Number(match?.[1] || 0);

    return Number.isFinite(lod) && lod > 0 ? lod : 0;
    }
  };

  Controller.prototype.getAiBoardLodTransitionThreshold = function getAiBoardLodTransitionThreshold(fromLod, toLod) {
    with (this) {

    const from = Number(fromLod) || 0;
    const to = Number(toLod) || 0;
    const lower = Math.min(from, to);
    const threshold = AI_IMAGE_PREVIEW_LOD_THRESHOLDS.find((entry) => Number(entry.lod) === lower)?.max;

    return Number(threshold) || 0;
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
      return "video-poster";
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
      return "video-poster";
    }

    return mediaHost?.dataset?.mediaLod || getAiBoardAssetLodFromSrc(mediaHost?.dataset?.mediaPreviewSrc || src) || "full";
    }
  };

  Controller.prototype.getAiImageRuntimePreviewCacheKey = function getAiImageRuntimePreviewCacheKey(src, lod) {
    with (this) {

    return `${String(src || "").trim()}::${String(lod || "").trim()}`;
    }
  };

  Controller.prototype.estimateAiBoardDecodedMB = function estimateAiBoardDecodedMB(board, currentLod, isActivePreview) {
    with (this) {

    const media = board?.generatedMedia || null;

    if (!isActivePreview || !media || media.kind === "video" || !media.src) {
      return 0;
    }

    const originalWidth = Math.max(0, Number(media.width) || 0);
    const originalHeight = Math.max(0, Number(media.height) || 0);
    const lodSize = Number(currentLod);
    const scale = Number.isFinite(lodSize) && lodSize > 0
      ? Math.min(1, lodSize / Math.max(1, originalWidth, originalHeight))
      : 1;
    const width = originalWidth * scale;
    const height = originalHeight * scale;

    return (width * height * 4) / (1024 * 1024);
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

    const ua = String(navigator.userAgent || "");
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1);
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/i.test(ua);

    return isIos && isSafari;
    }
  };

  Controller.prototype.getAiBoardRuntimeSafeLod = function getAiBoardRuntimeSafeLod(media, lod) {
    with (this) {

    const requestedLod = String(lod || "").trim();

    if (
      AI_IMAGE_UNSTABLE_RUNTIME_LODS.has(Number(requestedLod)) &&
      !getAiImageBoardMediaVariantSrc(media, requestedLod)
    ) {
      recordAiBoardPreviewDebugEvent("runtime-lod-skip", {
        lod: requestedLod,
        nextLod: "1024",
        reason: "unstable-runtime-lod",
        src: media?.src || "",
      });
      return "1024";
    }

    return requestedLod;
    }
  };

  Controller.prototype.loadImageElementForRuntimePreview = function loadImageElementForRuntimePreview(src) {
    with (this) {

    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };

      image.decoding = "async";
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(new Error(`Unable to load AI preview source: ${src}`));
      };
      image.src = src;

      if (image.decode) {
        image.decode().then(() => {
          cleanup();
          resolve(image);
        }).catch(() => {
          // Keep the load/error handlers as the compatibility fallback.
        });
      }
    });
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

    if (shouldUseDataUrlRuntimePreview()) {
      return {
        sourceType: "data-url",
        url: canvas.toDataURL("image/png"),
      };
    }

    const blobOrDataUrl = await canvasToBlob(canvas, "image/webp", AI_IMAGE_RUNTIME_PREVIEW_QUALITY);

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

    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    try {
      const probe = probeAiImageRuntimePreviewCanvas(canvas);

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
      image.removeAttribute("src");
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
