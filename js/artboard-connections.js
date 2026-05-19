window.CBO = window.CBO || {};

(function registerArtboardConnections(namespace) {
  const ACTION_BUBBLE_SIZE_DOC_PX = 120;
  const ACTION_BUBBLE_GAP_DOC_PX = 24;
  const ACTION_BUBBLE_ICON_DOC_PX = 76;
  const CONNECTION_MIN_DRAG_CSS_PX = 6;
  const CONNECTION_CLICK_DISTANCE_CSS_PX = 220;
  const CONNECTION_ARROW_LENGTH_STROKE_UNITS = 5;
  const CONNECTION_MENU_GAP_CSS_PX = 14;
  const AI_IMAGE_BOARD_SIZE_DOC_PX = 1024;
  const AI_IMAGE_BOARD_RADIUS_DOC_PX = 38;
  const AI_IMAGE_PROMPT_PLACEHOLDER = "Neon product shot";
  const AI_IMAGE_PROMPT_INPUT_MIN_HEIGHT_CSS_PX = 84;
  const AI_IMAGE_BOARD_FOOTER_MIN_HEIGHT_CSS_PX = 210;
  const AI_IMAGE_INPUT_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX;
  const AI_IMAGE_INPUT_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX;
  const AI_IMAGE_GENERATE_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX;
  const AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX;
  const AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX = 96;
  const AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX = 42;
  const AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX = 24;
  const AI_IMAGE_GENERATION_PREVIEW_MS = 0;
  const AI_IMAGE_PREVIEW_VARIANT_SIZES = [128, 256, 512, 1024];
  const AI_IMAGE_PREVIEW_LOD_THRESHOLDS = [
    { lod: "128", max: 80 },
    { lod: "256", max: 250 },
    { lod: "512", max: 700 },
    { lod: "1024", max: 1400 },
  ];
  const AI_IMAGE_PREVIEW_LOD_UP_HYSTERESIS = 1.15;
  const AI_IMAGE_PREVIEW_LOD_DOWN_HYSTERESIS = 0.72;
  const AI_IMAGE_PREVIEW_CROSSFADE_MS = 0;
  const AI_IMAGE_PREVIEW_PAINT_FRAMES = 2;
  const AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES = 2;
  const AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS = 240;
  const AI_IMAGE_RUNTIME_PREVIEW_CACHE_MAX_ENTRIES = 80;
  const AI_IMAGE_RUNTIME_PREVIEW_QUALITY = 0.78;
  const AI_IMAGE_UNSTABLE_RUNTIME_LODS = new Set([512]);
  const AI_BOARD_PREVIEW_DEBUG_EVENT_LIMIT = 80;
  const AI_IMAGE_SAMPLE_ASSETS = [
    { kind: "image", name: "Badge", src: "assets/ai-board-samples/sample-01-badge.png" },
    { kind: "image", name: "Balenciaga", src: "assets/ai-board-samples/sample-02-balenciaga.png" },
    { kind: "image", name: "Hats", src: "assets/ai-board-samples/sample-03-hats.jpg" },
    { kind: "image", name: "Dragon", src: "assets/ai-board-samples/sample-04-dragon.png" },
    { kind: "image", name: "Green screens", src: "assets/ai-board-samples/sample-05-green-screens.jpeg" },
    { kind: "video", name: "Render 2026-05-18 2", src: "assets/ai-board-samples/sample-06-video-2026-05-18-2.mp4" },
    { kind: "video", name: "Render 2026-05-18 1", src: "assets/ai-board-samples/sample-07-video-2026-05-18-1.mp4" },
    { kind: "video", name: "Render 2026-05-07 1", src: "assets/ai-board-samples/sample-08-video-2026-05-07-1.mp4" },
  ];
  const SPACE_BOARD_GAP_DOC_PX = 220;
  const SPACE_BOARD_DRAG_GAP_DOC_PX = 24;
  const SPACE_BOARD_MOVE_SEARCH_STEPS = 18;
  const SPACE_BOARD_PANE_TRANSFORM_IDLE_MS = 180;
  const SPACE_BOARD_LAZY_OVERSCAN_CSS_PX = 640;
  const SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX = 140;
  const AI_BOARD_ARTBOARD_PLAIN_MODE = true;
  const AI_BOARD_METRICS_PANEL_ID = "cbo-ai-board-metrics";
  const AI_BOARD_METRICS_COPY_RESET_MS = 900;
  const AI_IMAGE_GENERATE_DUPLICATE_GUARD_MS = 650;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let connectionDrag = null;
  let connections = [];
  let spaceBoards = [];
  let anchorOverrides = new Map();
  let menuState = null;
  let menuDismissBound = false;
  let ignoreNextMenuDocumentClick = false;
  let spaceBoardDrag = null;
  let selectedSpaceBoardId = "";
  let lastConnectionsGeometryKey = "";
  let spaceBoardPaneTransformIdleTimer = 0;
  let promptEditState = null;
  let promptFocusViewportTimers = [];
  let aiImageGeneratingBoardIds = new Set();
  let aiImageGenerationPreviewTimers = new Map();
  let aiImageGenerationRuns = new Map();
  let aiImageGenerationStatusByBoardId = new Map();
  let aiImageLastGenerateActivation = { at: 0, boardId: "" };
  let aiImageRuntimePreviewCache = new Map();
  let aiImagePreviewSwapSeed = 1;
  let aiBoardPreviewDebugEventId = 1;
  let aiBoardPreviewDebugEvents = [];
  let aiBoardPreviewDebugByBoardId = new Map();
  let aiBoardCameraMotionUntil = 0;
  let aiBoardCameraMotionTimer = 0;
  let aiBoardLastCameraMotionKey = "";
  let connectionIdSeed = 1;
  let boardIdSeed = 1;
  let aiBoardMetrics = createEmptyAiBoardMetrics();
  let aiBoardMetricsCopyResetTimer = 0;
  let lastRenderContext = {
    artboardViews: [],
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    selectedArtboardId: "",
    viewScale: 1,
  };

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function roundMetricValue(value, precision = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const multiplier = 10 ** Math.max(0, Number(precision) || 0);

    return Math.round(number * multiplier) / multiplier;
  }

  function createEmptyAiBoardMetrics(overrides = {}) {
    return {
      activePreviewCount: 0,
      boards: [],
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

  function getAiBoardAssetLodFromSrc(src) {
    const match = String(src || "").match(/(?:^|[-_/@])(128|256|512|1024|2048)(?=[^0-9]|$)/);

    return match?.[1] || "";
  }

  function getAiBoardNeededPreviewPixels(screenWidth = 0, screenHeight = 0, dpr = 1) {
    return Math.max(Number(screenWidth) || 0, Number(screenHeight) || 0) *
      Math.max(1, Number(dpr) || 1);
  }

  function getAiBoardNumericLod(value) {
    const match = String(value || "").match(/(?:^|[^0-9])(128|256|512|1024|2048)(?:[^0-9]|$)/);
    const lod = Number(match?.[1] || 0);

    return Number.isFinite(lod) && lod > 0 ? lod : 0;
  }

  function getAiBoardLodTransitionThreshold(fromLod, toLod) {
    const from = Number(fromLod) || 0;
    const to = Number(toLod) || 0;
    const lower = Math.min(from, to);
    const threshold = AI_IMAGE_PREVIEW_LOD_THRESHOLDS.find((entry) => Number(entry.lod) === lower)?.max;

    return Number(threshold) || 0;
  }

  function getAiBoardRecommendedLod(board, screenWidth = 0, screenHeight = 0, dpr = 1) {
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

  function getStableAiBoardRecommendedLod(board, screenWidth = 0, screenHeight = 0, dpr = 1, mediaHost = null) {
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

  function isAiBoardPreviewActive(mediaHost) {
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

  function getAiBoardCurrentLod(board, mediaHost) {
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

  function estimateAiBoardDecodedMB(board, currentLod, isActivePreview) {
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

  function estimateDecodedMBFromDimensions(width, height) {
    return (Math.max(0, Number(width) || 0) * Math.max(0, Number(height) || 0) * 4) / (1024 * 1024);
  }

  function getAiImageRuntimePreviewCacheKey(src, lod) {
    return `${String(src || "").trim()}::${String(lod || "").trim()}`;
  }

  function getAiImageRuntimePreviewCacheStats() {
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

  function pruneAiImageRuntimePreviewCache() {
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

  function shouldUseDataUrlRuntimePreview() {
    const ua = String(navigator.userAgent || "");
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1);
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/i.test(ua);

    return isIos && isSafari;
  }

  function getAiBoardRuntimeSafeLod(media, lod) {
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

  function loadImageElementForRuntimePreview(src) {
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

  function canvasToBlob(canvas, type, quality) {
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

  function probeAiImagePreviewDrawable(drawable) {
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

  function evictAiImageRuntimePreviewVariantsForSrc(src) {
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

  function probeAiImageRuntimePreviewCanvas(canvas) {
    return probeAiImagePreviewDrawable(canvas);
  }

  function probeAiImagePreviewLayer(image) {
    return probeAiImagePreviewDrawable(image);
  }

  async function canvasToRuntimePreviewUrl(canvas) {
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

  async function buildAiImageRuntimePreviewVariant(src, lod) {
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

  function requestAiImageRuntimePreviewVariant(src, lod) {
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

  function markAiImageRuntimePreviewVariantError(src, lod, message, probe = null) {
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

  function preloadAiImageBoardRuntimeLod(media, recommendedLod) {
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

  function getAiBoardVisibilityState(boardRect, visibleViewportRect, nearViewportRect) {
    if (boardRect && visibleViewportRect && rectsOverlap(boardRect, visibleViewportRect)) {
      return "visible";
    }

    if (boardRect && nearViewportRect && rectsOverlap(boardRect, nearViewportRect)) {
      return "near";
    }

    return "offscreen";
  }

  function getShortAiBoardId(boardId) {
    const value = String(boardId || "");

    return value.length > 18 ? value.slice(-18) : value;
  }

  function escapeMetricText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function summarizeAiBoardPreviewSrc(src) {
    const value = String(src || "");

    if (value.startsWith("data:")) {
      return `${value.slice(0, 32)}...(${value.length} chars)`;
    }

    return value;
  }

  function getAiBoardDebugBoardIdFromMediaHost(mediaHost) {
    return String(mediaHost?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();
  }

  function roundAiBoardDebugRect(rect) {
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

  function summarizeAiBoardDebugValue(key, value) {
    if (value == null) {
      return value;
    }

    if (/src|url|key/i.test(String(key || ""))) {
      return summarizeAiBoardPreviewSrc(value);
    }

    return value;
  }

  function normalizeAiBoardDebugDetail(detail = {}) {
    return Object.fromEntries(Object.entries(detail).map(([key, value]) => [
      key,
      summarizeAiBoardDebugValue(key, value),
    ]));
  }

  function recordAiBoardPreviewDebugEvent(eventName, detail = {}) {
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

  function getAiBoardLayerDebug(layer) {
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

  function getAiBoardPreviewDiagnosis(mediaHost, activeLayer) {
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

  function getAiBoardPreviewDebugSnapshot(element, mediaHost) {
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

  function formatAiBoardMetricsReport(metrics = aiBoardMetrics) {
    const rows = Array.isArray(metrics.boards) ? metrics.boards : [];
    const boardLines = rows.length
      ? rows.map((board) => [
          board.id,
          board.visibility,
          `current=${board.currentLod}`,
          `recommended=${board.recommendedLod}`,
          `preview=${["placeholder", "unloaded"].includes(board.currentLod) ? board.currentLod : board.activePreview ? "on" : "off"}`,
          `source=${board.previewSource || "none"}`,
          `debug=${board.previewDebug?.diagnosis || "none"}`,
          `layer=${board.previewDebug?.activeLayer?.name || "none"}`,
          `complete=${board.previewDebug?.activeLayer?.complete ? "yes" : "no"}`,
          `natural=${board.previewDebug?.activeLayer?.naturalWidth || 0}x${board.previewDebug?.activeLayer?.naturalHeight || 0}`,
          `generating=${board.isGenerating ? "yes" : "no"}`,
          `generation=${board.generationStatus || "none"}`,
          `screen=${board.screenWidth}x${board.screenHeight}`,
          `est=${board.estimatedDecodedMB}MB`,
        ].join(" | ")).join("\n")
      : "none";
    const debugEvents = Array.isArray(metrics.previewDebugEvents) && metrics.previewDebugEvents.length
      ? metrics.previewDebugEvents.slice(-40).map((event) => [
          `#${event.id}`,
          new Date(event.at).toLocaleTimeString(),
          event.eventName,
          event.detail?.boardId ? `board=${getShortAiBoardId(event.detail.boardId)}` : "",
          event.detail?.lod ? `lod=${event.detail.lod}` : "",
          event.detail?.previewSource ? `source=${event.detail.previewSource}` : "",
          event.detail?.status ? `status=${event.detail.status}` : "",
          event.detail?.message ? `message=${event.detail.message}` : "",
        ].filter(Boolean).join(" | ")).join("\n")
      : "none";

    return [
      "AI BOARD METRICS",
      `copiedAt=${new Date().toISOString()}`,
      `stateBoards=${metrics.stateBoards}`,
      `renderedAiBoards=${metrics.renderedAiBoards}`,
      `visibleAiBoards=${metrics.visibleAiBoards}`,
      `nearAiBoards=${metrics.nearAiBoards}`,
      `offscreenAiBoards=${metrics.offscreenAiBoards}`,
      `activePreviewCount=${metrics.activePreviewCount}`,
      `estimatedDecodedMB=${metrics.estimatedDecodedMB}`,
      `frameMs=${metrics.frameMs}`,
      `generatingBoards=${metrics.generatingBoards}`,
      `lastGenerateStatus=${metrics.lastGenerateStatus}`,
      `runtimePreviewCacheCount=${metrics.runtimePreviewCacheCount}`,
      `runtimePreviewLoadingCount=${metrics.runtimePreviewLoadingCount}`,
      `runtimePreviewCacheMB=${metrics.runtimePreviewCacheMB}`,
      `zoom=${metrics.zoom}`,
      `dpr=${metrics.dpr}`,
      "",
      "BOARDS",
      boardLines,
      "",
      "PREVIEW DEBUG EVENTS",
      debugEvents,
      "",
      "RAW",
      JSON.stringify(metrics, null, 2),
    ].join("\n");
  }

  function copyAiBoardMetricsText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "12px";
      textarea.style.top = "12px";
      textarea.style.width = "1px";
      textarea.style.height = "1px";
      textarea.style.fontSize = "16px";
      textarea.style.opacity = "0.01";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange?.(0, textarea.value.length);

      try {
        if (!document.execCommand("copy")) {
          throw new Error("copy command failed");
        }

        resolve();
      } catch (error) {
        reject(error);
      } finally {
        textarea.remove();
      }
    });
  }

  function handleAiBoardMetricsCopy(event) {
    const button = event.currentTarget;

    copyAiBoardMetricsText(formatAiBoardMetricsReport())
      .then(() => {
        if (!button) {
          return;
        }

        button.textContent = "Copied";
        window.clearTimeout(aiBoardMetricsCopyResetTimer);
        aiBoardMetricsCopyResetTimer = window.setTimeout(() => {
          button.textContent = "Copy";
        }, AI_BOARD_METRICS_COPY_RESET_MS);
      })
      .catch((error) => {
        console.warn("[CBO] Unable to copy AI board metrics.", error);
        if (button) {
          button.textContent = "Copy failed";
        }
      });
  }

  function ensureAiBoardMetricsPanel() {
    if (!document.body) {
      return null;
    }

    let panel = document.getElementById(AI_BOARD_METRICS_PANEL_ID);

    if (!panel) {
      panel = document.createElement("section");
      panel.id = AI_BOARD_METRICS_PANEL_ID;
      panel.className = "editor-ai-board-metrics";
      panel.innerHTML = `
        <div class="editor-ai-board-metrics-header">
          <span>AI METRICS</span>
          <button type="button" data-ai-board-metrics-copy>Copy</button>
        </div>
        <div class="editor-ai-board-metrics-body" data-ai-board-metrics-body></div>
      `;
      panel.querySelector("[data-ai-board-metrics-copy]")?.addEventListener("click", handleAiBoardMetricsCopy);
      document.body.appendChild(panel);
    }

    return panel;
  }

  function renderAiBoardMetricsPanel(metrics = aiBoardMetrics) {
    const panel = ensureAiBoardMetricsPanel();
    const body = panel?.querySelector?.("[data-ai-board-metrics-body]");

    if (!body) {
      return;
    }

    const boards = Array.isArray(metrics.boards) ? metrics.boards : [];
    const previewRows = boards.slice(0, 4).map((board) => (
      `<div>${escapeMetricText(getShortAiBoardId(board.id))}: ${escapeMetricText(board.visibility)} ` +
      `${escapeMetricText(board.currentLod)} -> ${escapeMetricText(board.recommendedLod)} ` +
      `${escapeMetricText(board.previewDebug?.diagnosis || "no-debug")} ` +
      `${board.isGenerating ? "generating " : ""}` +
      `${escapeMetricText(board.screenWidth)}x${escapeMetricText(board.screenHeight)}</div>`
    )).join("");
    const hiddenCount = Math.max(0, boards.length - 4);

    body.innerHTML = `
      <div>state ${metrics.stateBoards} | rendered ${metrics.renderedAiBoards} | visible ${metrics.visibleAiBoards} | near ${metrics.nearAiBoards} | off ${metrics.offscreenAiBoards}</div>
      <div>preview ${metrics.activePreviewCount} | runtime ${metrics.runtimePreviewCacheCount}/${metrics.runtimePreviewLoadingCount} | est ${metrics.estimatedDecodedMB}MB | frame ${metrics.frameMs}ms | z ${metrics.zoom}</div>
      ${previewRows || "<div>boards: none</div>"}
      ${hiddenCount ? `<div>+${hiddenCount} more</div>` : ""}
    `;
  }

  function publishAiBoardMetrics(metrics) {
    aiBoardMetrics = {
      ...metrics,
      boards: Array.isArray(metrics.boards) ? metrics.boards.map((board) => ({ ...board })) : [],
      previewDebugEvents: Array.isArray(metrics.previewDebugEvents) ? metrics.previewDebugEvents.map((event) => ({ ...event })) : [],
      updatedAt: new Date().toISOString(),
    };
    namespace.aiBoardMetrics = aiBoardMetrics;
    renderAiBoardMetricsPanel(aiBoardMetrics);
  }

  function shouldUsePlainAiBoardArtboards() {
    return AI_BOARD_ARTBOARD_PLAIN_MODE === true;
  }

  function cloneCamera(camera) {
    return {
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      zoom: Math.max(0.0001, Number(camera?.zoom) || 1),
    };
  }

  function getCameraState() {
    const brushEngine = getBrushEngine();
    const camera = lastRenderContext.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera: cloneCamera(camera),
      dpr: Math.max(1, Number(lastRenderContext.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
  }

  function getAllArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    if (Array.isArray(artboards) && artboards.length > 0) {
      return artboards;
    }

    return lastRenderContext.artboardViews.map((view) => view.artboard).filter(Boolean);
  }

  function getArtboardById(artboardId) {
    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
  }

  function createRect(x, y, width, height) {
    return {
      height: Math.max(1, Number(height) || 1),
      width: Math.max(1, Number(width) || 1),
      x: Number(x) || 0,
      y: Number(y) || 0,
    };
  }

  function expandRect(rect, amount = 0) {
    const safeAmount = Math.max(0, Number(amount) || 0);

    return rect
      ? {
          height: rect.height + safeAmount * 2,
          width: rect.width + safeAmount * 2,
          x: rect.x - safeAmount,
          y: rect.y - safeAmount,
        }
      : null;
  }

  function rectsOverlap(first, second) {
    return Boolean(
      first &&
      second &&
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y
    );
  }

  function doesRectOverlapAny(rect, blockers = []) {
    return blockers.some((blocker) => rectsOverlap(rect, blocker));
  }

  function offsetRect(rect, dx = 0, dy = 0) {
    return rect
      ? createRect(
          rect.x + (Number(dx) || 0),
          rect.y + (Number(dy) || 0),
          rect.width,
          rect.height,
        )
      : null;
  }

  function getRectOverlapArea(first, second) {
    if (!first || !second) {
      return 0;
    }

    const width = Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
    );
    const height = Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
    );

    return width * height;
  }

  function getRectOverlapScore(rect, blockers = []) {
    return blockers.reduce((score, blocker) => score + getRectOverlapArea(rect, blocker), 0);
  }

  function getViewScale() {
    const { camera, dpr } = getCameraState();

    return Math.max(0.0001, Number(camera.zoom) || 1) / dpr;
  }

  function getConnectionStrokeWidth(viewScale = getViewScale()) {
    return Math.max(0.5, 3 * (Number(viewScale) || 1));
  }

  function getActionBubbleMetrics(scale = getViewScale()) {
    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const size = ACTION_BUBBLE_SIZE_DOC_PX * safeScale;
    const gap = ACTION_BUBBLE_GAP_DOC_PX * safeScale;
    const iconSize = ACTION_BUBBLE_ICON_DOC_PX * safeScale;
    const borderWidth = 3 * safeScale;

    return {
      borderWidth,
      borderWidthDoc: 3,
      gap,
      gapDoc: ACTION_BUBBLE_GAP_DOC_PX,
      iconSize,
      iconSizeDoc: ACTION_BUBBLE_ICON_DOC_PX,
      size,
      sizeDoc: ACTION_BUBBLE_SIZE_DOC_PX,
      visualScale: safeScale,
    };
  }

  function documentPointToStagePoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(camera.x) || 0) + (Number(point?.x) || 0) * zoom) / dpr,
      y: ((Number(camera.y) || 0) + (Number(point?.y) || 0) * zoom) / dpr,
    };
  }

  function stagePointToDocumentPoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(point?.x) || 0) * dpr - (Number(camera.x) || 0)) / zoom,
      y: ((Number(point?.y) || 0) * dpr - (Number(camera.y) || 0)) / zoom,
    };
  }

  function getEventDocumentPoint(event) {
    const brushEngine = getBrushEngine();

    if (brushEngine?.screenToDocumentSpace) {
      return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
    }

    const stage = getStage();

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const viewportX = (event.clientX - rect.left) * dpr;
    const viewportY = (event.clientY - rect.top) * dpr;

    return {
      docX: (viewportX - (Number(camera.x) || 0)) / zoom,
      docY: (viewportY - (Number(camera.y) || 0)) / zoom,
    };
  }

  function ensureActionBubble(artboardId) {
    const stage = getStage();
    const normalizedArtboardId = String(artboardId || "").trim();

    if (!stage || !getRenderer() || !normalizedArtboardId) {
      return null;
    }

    let bubble = Array.from(stage.querySelectorAll("[data-artboard-action-bubble]"))
      .find((element) => element.dataset.artboardId === normalizedArtboardId) || null;

    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "editor-artboard-action-bubble";
      bubble.dataset.artboardActionBubble = "";
      bubble.dataset.artboardId = normalizedArtboardId;
      bubble.setAttribute("aria-hidden", "true");
      bubble.addEventListener("pointerenter", () => {
        bubble.classList.add("is-hovered");
      });
      bubble.addEventListener("pointerleave", () => {
        bubble.classList.remove("is-hovered");
      });
      bubble.addEventListener("pointerdown", startConnectionDrag);
      bubble.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
          <circle cx="9" cy="9" r="2"></circle>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
        </svg>
      `;
      stage.appendChild(bubble);
    }

    bubble.dataset.artboardId = normalizedArtboardId;
    return bubble;
  }

  function ensureSpaceBoardLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-space-board-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-space-board-layer";
      layer.dataset.artboardSpaceBoardLayer = "";
      stage.appendChild(layer);
    }

    let pane = layer.querySelector("[data-space-board-pane]");

    if (!pane) {
      pane = document.createElement("div");
      pane.className = "editor-space-board-pane";
      pane.dataset.spaceBoardPane = "";

      const movableChildren = Array.from(layer.children).filter((child) => (
        child.matches?.("[data-artboard-connection-layer], [data-ai-image-board]")
      ));

      movableChildren.forEach((child) => pane.appendChild(child));
      layer.appendChild(pane);
    }

    return layer;
  }

  function ensureSpaceBoardPane() {
    return ensureSpaceBoardLayer()?.querySelector("[data-space-board-pane]") || null;
  }

  function setStylePropertyIfChanged(element, property, value) {
    if (!element || element.style[property] === value) {
      return false;
    }

    element.style[property] = value;
    return true;
  }

  function setCssVarIfChanged(element, property, value) {
    if (!element || element.style.getPropertyValue(property) === value) {
      return false;
    }

    element.style.setProperty(property, value);
    return true;
  }

  function scheduleSpaceBoardPaneTransformIdle(pane) {
    const layer = pane?.closest?.("[data-artboard-space-board-layer]");

    if (!pane || !layer) {
      return;
    }

    pane.classList.add("is-transforming");
    layer.classList.add("is-transforming");

    if (spaceBoardPaneTransformIdleTimer) {
      window.clearTimeout(spaceBoardPaneTransformIdleTimer);
    }

    spaceBoardPaneTransformIdleTimer = window.setTimeout(() => {
      spaceBoardPaneTransformIdleTimer = 0;
      pane.classList.remove("is-transforming");
      layer.classList.remove("is-transforming");
    }, SPACE_BOARD_PANE_TRANSFORM_IDLE_MS);
  }

  function renderSpaceBoardPaneTransform() {
    const pane = ensureSpaceBoardPane();

    if (!pane) {
      return null;
    }

    if (shouldUsePlainAiBoardArtboards()) {
      setStylePropertyIfChanged(pane, "transform", "none");
      setCssVarIfChanged(pane, "--editor-space-board-scale", "1");
      setCssVarIfChanged(pane, "--editor-space-board-inverse-scale", "1");
      setCssVarIfChanged(pane, "--editor-space-board-label-top", "-25px");
      return pane;
    }

    const { camera, dpr } = getCameraState();
    const scale = getViewScale();
    const tx = (Number(camera.x) || 0) / dpr;
    const ty = (Number(camera.y) || 0) / dpr;
    const transform = `matrix(${scale}, 0, 0, ${scale}, ${tx}, ${ty})`;
    const didChangeTransform = setStylePropertyIfChanged(pane, "transform", transform);
    const inverseScale = 1 / Math.max(0.0001, scale);

    setCssVarIfChanged(pane, "--editor-space-board-scale", String(scale));
    setCssVarIfChanged(pane, "--editor-space-board-inverse-scale", String(inverseScale));
    setCssVarIfChanged(pane, "--editor-space-board-label-top", `${-25 * inverseScale}px`);

    if (didChangeTransform) {
      scheduleSpaceBoardPaneTransformIdle(pane);
    }

    return pane;
  }

  function handleAiImageBoardPointerDown(event) {
    const boardId = String(event.target?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    if (!boardId || selectedSpaceBoardId === boardId) {
      return;
    }

    selectedSpaceBoardId = boardId;
    renderSpaceBoards();
  }

  function handleDocumentSpaceBoardSelectionPointerDown(event) {
    if (!selectedSpaceBoardId || event.target?.closest?.("[data-ai-image-board]")) {
      return;
    }

    selectedSpaceBoardId = "";
    renderSpaceBoards();
  }

  function ensureAiImageBoardElement(boardId) {
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
          <span class="editor-artboard-frame-label" data-ai-image-board-drag-handle></span>
          <div class="editor-ai-image-board-surface editor-artboard-paper">
            <div class="editor-ai-image-board-media" data-ai-image-board-media></div>
          </div>
          <div class="editor-ai-image-board-input" data-ai-image-board-input-handle aria-hidden="true"></div>
          <button class="editor-ai-image-board-play" type="button" aria-label="Generate image" data-ai-image-board-generate>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>
            </svg>
          </button>
        `
        : `
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
      board.querySelector("[data-ai-image-board-drag-handle]")?.addEventListener("pointerdown", startSpaceBoardDrag);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerdown", stopSpaceBoardControlEvent);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("pointerup", handleAiImageGenerateClick);
      board.querySelector("[data-ai-image-board-generate]")?.addEventListener("click", handleAiImageGenerateClick);
      board.addEventListener("wheel", handleSpaceBoardWheel, { passive: false });
      pane.appendChild(board);
    }

    board.dataset.boardId = normalizedBoardId;
    board.classList.toggle("is-plain-artboard", shouldUsePlainAiBoardArtboards());
    if (shouldUsePlainAiBoardArtboards()) {
      const surface = board.querySelector(".editor-ai-image-board-surface");

      if (surface && !surface.querySelector("[data-ai-image-board-media]")) {
        surface.insertAdjacentHTML("afterbegin", `
          <div class="editor-ai-image-board-media" data-ai-image-board-media></div>
        `);
      }
    }
    return board;
  }

  function ensureAiImageBoardHeavyContent(element) {
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

  function unmountAiImageBoardHeavyContent(element) {
    if (shouldUsePlainAiBoardArtboards() || !element || element.matches?.(":focus-within")) {
      return false;
    }

    element.querySelector("[data-ai-image-board-media]")?.replaceChildren();
    element.querySelectorAll("[data-ai-image-board-heavy]").forEach((node) => node.remove());
    delete element.dataset.aiImageBoardHeavyMounted;
    element.classList.remove("is-heavy-mounted", "is-generating");

    return true;
  }

  function ensureConnectionLayer() {
    const pane = ensureSpaceBoardPane();
    const stage = getStage();

    if (!pane || !stage || !getRenderer()) {
      return null;
    }

    let svg = pane.querySelector("[data-artboard-connection-layer]") || stage.querySelector("[data-artboard-connection-layer]");

    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("editor-artboard-connection-layer");
      svg.dataset.artboardConnectionLayer = "";
    }

    if (svg.parentElement !== pane || pane.firstElementChild !== svg) {
      pane.insertBefore(svg, pane.firstElementChild || null);
    }

    if (shouldUsePlainAiBoardArtboards()) {
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

  function ensureConnectionMenu() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let menu = stage.querySelector("[data-artboard-connection-menu]");

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "editor-artboard-connection-menu";
      menu.dataset.artboardConnectionMenu = "";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-hidden", "true");
      menu.innerHTML = `
        <div class="editor-artboard-connection-menu-header">
          <div class="editor-artboard-connection-menu-title">Add...</div>
          <button class="editor-artboard-connection-menu-close" type="button" aria-label="Close connection menu" data-artboard-connection-dismiss>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-image">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
          <span>AI Image board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-video">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m22 8-6 4 6 4V8Z"></path>
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
          </svg>
          <span>AI Video board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="mockup">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 1.2.8L6 9.5V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5l1.94.46a1 1 0 0 0 1.2-.8l.58-3.47a2 2 0 0 0-1.34-2.23Z"></path>
          </svg>
          <span>Mockup</span>
        </button>
      `;
      menu.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      menu.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.target?.closest?.("[data-artboard-connection-dismiss]")) {
          dismissConnectionMenu();
          return;
        }

        const action = event.target?.closest?.("[data-artboard-connection-action]")?.dataset?.artboardConnectionAction;

        if (action === "ai-image") {
          materializeAiImageBoardFromMenu();
        }
      });
      stage.appendChild(menu);
    }

    return menu;
  }

  function getActionAnchorPoint(artboard) {
    if (!artboard) {
      return null;
    }

    const artboardId = String(artboard.id || "").trim();
    const override = artboardId ? anchorOverrides.get(artboardId) : null;

    if (override) {
      return override;
    }

    return {
      x: (Number(artboard.x) || 0) +
        (Number(artboard.width) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX,
      y: (Number(artboard.y) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX * 0.5,
    };
  }

  function getSpaceBoardById(boardId) {
    const normalizedId = String(boardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return spaceBoards.find((board) => board.id === normalizedId) || null;
  }

  function getSpaceBoardRect(board) {
    return board
      ? createRect(board.x, board.y, board.width || AI_IMAGE_BOARD_SIZE_DOC_PX, board.height || AI_IMAGE_BOARD_SIZE_DOC_PX)
      : null;
  }

  function getSpaceBoardVisibleDocumentRect(marginDocPx = 0) {
    const stage = getStage();

    if (!stage) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const rect = stage.getBoundingClientRect?.() || { width: 1, height: 1 };
    const viewportWidthCss = Math.max(1, Number(stage.clientWidth || rect.width) || 1);
    const viewportHeightCss = Math.max(1, Number(stage.clientHeight || rect.height) || 1);
    const margin = Math.max(0, Number(marginDocPx) || 0);
    const left = (0 - (Number(camera.x) || 0)) / zoom;
    const top = (0 - (Number(camera.y) || 0)) / zoom;
    const width = (viewportWidthCss * dpr) / zoom;
    const height = (viewportHeightCss * dpr) / zoom;

    return createRect(
      left - margin,
      top - margin,
      width + margin * 2,
      height + margin * 2,
    );
  }

  function getSpaceBoardLazyMarginDocPx() {
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return (SPACE_BOARD_LAZY_OVERSCAN_CSS_PX * dpr) / zoom;
  }

  function isSpaceBoardNearViewport(board, marginDocPx = getSpaceBoardLazyMarginDocPx()) {
    const boardRect = getSpaceBoardRect(board);
    const viewportRect = getSpaceBoardVisibleDocumentRect(marginDocPx);

    return Boolean(boardRect && viewportRect && rectsOverlap(boardRect, viewportRect));
  }

  function isMobileLikeSpaceBoardViewport() {
    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900
    );
  }

  function getSpaceBoardMinScreenSize(board) {
    const rect = getSpaceBoardRect(board);
    const scale = getViewScale();

    return rect ? Math.min(rect.width, rect.height) * scale : 0;
  }

  function isSpaceBoardFocusedOrSelected(board, element) {
    const boardId = String(board?.id || "").trim();
    const focusedBoardId = String(document.activeElement?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    return Boolean(
      boardId &&
      (
        boardId === selectedSpaceBoardId ||
        boardId === focusedBoardId ||
        boardId === String(spaceBoardDrag?.boardId || "").trim() ||
        aiImageGeneratingBoardIds.has(boardId) ||
        element?.matches?.(":focus-within")
      )
    );
  }

  function shouldUnloadAiBoardMedia(board, visibilityState, element) {
    return visibilityState !== "visible" && !isSpaceBoardFocusedOrSelected(board, element);
  }

  function shouldMountAiImageBoardHeavyContent(board, element) {
    if (!board) {
      return false;
    }

    if (isSpaceBoardFocusedOrSelected(board, element)) {
      return true;
    }

    if (!isSpaceBoardNearViewport(board)) {
      return false;
    }

    return !isMobileLikeSpaceBoardViewport() ||
      getSpaceBoardMinScreenSize(board) >= SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX;
  }

  function cloneConnection(connection) {
    return {
      ...connection,
    };
  }

  function cloneSpaceBoard(board) {
    return {
      ...board,
    };
  }

  function captureConnectionsHistoryState(options = {}) {
    const excludeConnectionIds = new Set(
      Array.isArray(options.excludeConnectionIds)
        ? options.excludeConnectionIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    return {
      connections: connections
        .filter((connection) => !excludeConnectionIds.has(String(connection?.id || "").trim()))
        .map(cloneConnection),
      spaceBoards: spaceBoards.map(cloneSpaceBoard),
    };
  }

  function restoreConnectionsHistoryState(state, source = "history-artboard-connections") {
    removeSpaceBoardDragListeners();
    connections = Array.isArray(state?.connections)
      ? state.connections.map(cloneConnection)
      : [];
    spaceBoards = Array.isArray(state?.spaceBoards)
      ? state.spaceBoards.map(cloneSpaceBoard)
      : [];
    connectionDrag = null;
    spaceBoardDrag = null;
    selectedSpaceBoardId = "";
    lastConnectionsGeometryKey = "";
    menuState = null;
    unbindMenuDismiss();
    renderConnectionOverlay();
    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));

    return true;
  }

  function statesAreEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  function pushConnectionsHistoryEntry(beforeState, afterState, options = {}) {
    const history = namespace.documentHistory;

    if (
      !beforeState ||
      !afterState ||
      statesAreEqual(beforeState, afterState) ||
      history?.canRecord?.(options) !== true ||
      typeof history.push !== "function"
    ) {
      return false;
    }

    const before = {
      connections: beforeState.connections.map(cloneConnection),
      spaceBoards: beforeState.spaceBoards.map(cloneSpaceBoard),
    };
    const after = {
      connections: afterState.connections.map(cloneConnection),
      spaceBoards: afterState.spaceBoards.map(cloneSpaceBoard),
    };

    return history.push({
      after,
      before,
      historyGroup: options.historyGroup || "",
      source: options.source || "artboard-connections",
      type: options.type || "artboard-connections-state",
      undo() {
        return restoreConnectionsHistoryState(this.before, `history-undo-${this.source}`);
      },
      redo() {
        return restoreConnectionsHistoryState(this.after, `history-redo-${this.source}`);
      },
      mergeWith() {
        return false;
      },
      destroy() {},
    }, options);
  }

  function emitConnectionsChange(source = "artboard-connections") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));
  }

  function stopSpaceBoardControlEvent(event) {
    event.stopPropagation();
  }

  function setAiImageGenerationStatus(boardId, status, detail = {}) {
    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return null;
    }

    const record = {
      at: new Date().toISOString(),
      boardId: normalizedBoardId,
      status: String(status || "unknown"),
      ...detail,
    };

    aiImageGenerationStatusByBoardId.set(normalizedBoardId, record);

    return record;
  }

  function getAiImageGenerationStatus(boardId) {
    return aiImageGenerationStatusByBoardId.get(String(boardId || "").trim()) || null;
  }

  function getLastAiImageGenerationStatus() {
    return Array.from(aiImageGenerationStatusByBoardId.values())
      .sort((first, second) => String(second.at || "").localeCompare(String(first.at || "")))[0] || null;
  }

  function formatAiImageGenerationStatus(record) {
    if (!record) {
      return "";
    }

    const boardId = getShortAiBoardId(record.boardId);
    const status = String(record.status || "unknown");
    const sample = record.sampleName ? `:${record.sampleName}` : "";
    const message = record.message ? `:${record.message}` : "";

    return `${boardId}:${status}${sample}${message}`;
  }

  function shouldHandleAiImageGenerateActivation(event, boardId) {
    const normalizedBoardId = String(boardId || "").trim();
    const now = performance.now?.() || Date.now();

    if (
      event?.type === "click" &&
      normalizedBoardId &&
      aiImageLastGenerateActivation.boardId === normalizedBoardId &&
      now - aiImageLastGenerateActivation.at < AI_IMAGE_GENERATE_DUPLICATE_GUARD_MS
    ) {
      return false;
    }

    aiImageLastGenerateActivation = {
      at: now,
      boardId: normalizedBoardId,
    };

    return true;
  }

  function handleSpaceBoardWheel(event) {
    const brushEngine = getBrushEngine();

    if (!brushEngine?.handleWheel) {
      return;
    }

    event.stopPropagation();
    brushEngine.handleWheel.call(brushEngine, event);
  }

  function handleAiImageGenerateClick(event) {
    const board = getBoardFromControlEvent(event);

    event.preventDefault();
    event.stopPropagation();

    if (!board || !shouldHandleAiImageGenerateActivation(event, board.id)) {
      return;
    }

    startAiImageGenerationPreview(board.id);

    window.dispatchEvent(new CustomEvent("cbo:ai-image-board-generate-click", {
      detail: {
        board: cloneSpaceBoard(board),
        source: "artboard-connections",
      },
    }));
  }

  function pickRandomAiImageSample(currentSrc = "") {
    const candidates = getAiImageSampleCandidates(currentSrc, "image");

    return candidates[0] || null;
  }

  function getAiImageSampleCandidates(currentSrc = "", preferredKind = "image") {
    const current = String(currentSrc || "").trim();
    const kind = String(preferredKind || "").trim();
    const preferredSamples = kind
      ? AI_IMAGE_SAMPLE_ASSETS.filter((sample) => (sample.kind === "video" ? "video" : "image") === kind)
      : AI_IMAGE_SAMPLE_ASSETS;
    const sourcePool = preferredSamples.length > 0 ? preferredSamples : AI_IMAGE_SAMPLE_ASSETS;
    const pool = sourcePool.filter((sample) => sample.src !== current);
    const candidates = pool.length > 0 ? pool : sourcePool;
    const shuffled = [...candidates];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const value = shuffled[index];

      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = value;
    }

    return shuffled;
  }

  function loadFirstAvailableAiImageSampleMetadata(samples) {
    const candidates = Array.isArray(samples) ? samples.filter((sample) => sample?.src) : [];
    let lastError = null;

    const tryCandidate = (index = 0) => {
      const sample = candidates[index];

      if (!sample) {
        return Promise.reject(lastError || new Error("No available fake AI image sample."));
      }

      return loadAiImageSampleMetadata(sample).catch((error) => {
        lastError = error;
        console.warn("[CBO] Fake AI sample failed, trying next sample.", error);
        return tryCandidate(index + 1);
      });
    };

    return tryCandidate();
  }

  function loadAiImageSampleMetadata(sample) {
    if (!sample?.src) {
      return Promise.reject(new Error("Missing AI image sample source."));
    }

    const kind = sample.kind === "video" ? "video" : "image";

    if (kind === "video") {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const cleanup = () => {
          video.removeAttribute("src");
          video.load?.();
        };

        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.addEventListener("loadedmetadata", () => {
          const width = Math.round(Number(video.videoWidth) || AI_IMAGE_BOARD_SIZE_DOC_PX);
          const height = Math.round(Number(video.videoHeight) || AI_IMAGE_BOARD_SIZE_DOC_PX);

          cleanup();
          resolve({
            ...sample,
            height,
            width,
          });
        }, { once: true });
        video.addEventListener("error", () => {
          cleanup();
          reject(new Error(`Unable to load AI board video sample: ${sample.src}`));
        }, { once: true });
        video.src = sample.src;
        video.load?.();
      });
    }

    return new Promise((resolve, reject) => {
      const image = new Image();

      image.addEventListener("load", () => {
        resolve({
          ...sample,
          height: Math.round(Number(image.naturalHeight) || AI_IMAGE_BOARD_SIZE_DOC_PX),
          width: Math.round(Number(image.naturalWidth) || AI_IMAGE_BOARD_SIZE_DOC_PX),
        });
      }, { once: true });
      image.addEventListener("error", () => {
        reject(new Error(`Unable to load AI board image sample: ${sample.src}`));
      }, { once: true });
      image.decoding = "async";
      image.src = sample.src;
    });
  }

  function applyAiImageSampleToBoard(boardId, sample) {
    const board = getSpaceBoardById(boardId);

    if (!board || !sample) {
      return false;
    }

    board.generatedMedia = {
      height: Math.max(1, Math.round(Number(sample.height) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
      kind: sample.kind === "video" ? "video" : "image",
      name: String(sample.name || "Generated sample"),
      src: String(sample.src || ""),
      variants: sample.variants && typeof sample.variants === "object" ? { ...sample.variants } : undefined,
      width: Math.max(1, Math.round(Number(sample.width) || AI_IMAGE_BOARD_SIZE_DOC_PX)),
    };
    board.height = board.generatedMedia.height;
    board.width = board.generatedMedia.width;
    board.name = board.generatedMedia.name;
    return true;
  }

  function completeAiImageSampleGeneration(boardId, runId) {
    const normalizedBoardId = String(boardId || "").trim();
    const activeRunId = aiImageGenerationRuns.get(normalizedBoardId);

    if (!normalizedBoardId || activeRunId !== runId) {
      setAiImageGenerationStatus(normalizedBoardId, "stale", { runId });
      return;
    }

    const board = getSpaceBoardById(normalizedBoardId);
    const beforeState = captureConnectionsHistoryState();
    const samples = getAiImageSampleCandidates(board?.generatedMedia?.src || "", "image");
    const sample = samples[0] || pickRandomAiImageSample(board?.generatedMedia?.src || "");

    if (!board || !sample) {
      setAiImageGenerationStatus(normalizedBoardId, "error", {
        message: "missing-board-or-sample",
        runId,
      });
      aiImageGeneratingBoardIds.delete(normalizedBoardId);
      aiImageGenerationRuns.delete(normalizedBoardId);
      aiImageGenerationPreviewTimers.delete(normalizedBoardId);
      renderSpaceBoards();
      return;
    }

    setAiImageGenerationStatus(normalizedBoardId, "metadata", {
      runId,
      sampleKind: sample.kind || "",
      sampleName: sample.name || "",
      sampleSrc: sample.src || "",
    });

    loadFirstAvailableAiImageSampleMetadata(samples)
      .then((sampleWithMeta) => {
        if (aiImageGenerationRuns.get(normalizedBoardId) !== runId) {
          setAiImageGenerationStatus(normalizedBoardId, "stale", {
            runId,
            sampleName: sampleWithMeta?.name || sample.name || "",
          });
          return;
        }

        const didApply = applyAiImageSampleToBoard(normalizedBoardId, sampleWithMeta);

        aiImageGeneratingBoardIds.delete(normalizedBoardId);
        aiImageGenerationRuns.delete(normalizedBoardId);
        aiImageGenerationPreviewTimers.delete(normalizedBoardId);

        if (didApply) {
          setAiImageGenerationStatus(normalizedBoardId, "complete", {
            runId,
            sampleKind: sampleWithMeta.kind || "",
            sampleName: sampleWithMeta.name || "",
            sampleSrc: sampleWithMeta.src || "",
          });
          pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
            historyGroup: `ai-image-board-sample-${normalizedBoardId}`,
            source: "ai-image-board-sample-generation",
            type: "space-board-generate-sample",
          });
          emitConnectionsChange("ai-image-board-sample-generation");
        } else {
          setAiImageGenerationStatus(normalizedBoardId, "error", {
            message: "apply-failed",
            runId,
            sampleName: sampleWithMeta?.name || sample.name || "",
          });
        }

        renderConnectionOverlay();
      })
      .catch((error) => {
        console.warn("[CBO] Unable to apply AI image sample.", error);
        setAiImageGenerationStatus(normalizedBoardId, "error", {
          message: error?.message || String(error || "error"),
          runId,
          sampleName: sample.name || "",
        });
        aiImageGeneratingBoardIds.delete(normalizedBoardId);
        aiImageGenerationRuns.delete(normalizedBoardId);
        aiImageGenerationPreviewTimers.delete(normalizedBoardId);
        renderSpaceBoards();
      });
  }

  function getBoardFromControlEvent(event) {
    const boardId = String(event.currentTarget?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    return getSpaceBoardById(boardId);
  }

  function startAiImageGenerationPreview(boardId) {
    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return false;
    }

    if (aiImageGeneratingBoardIds.has(normalizedBoardId)) {
      return false;
    }

    if (aiImageGenerationPreviewTimers.has(normalizedBoardId)) {
      window.clearTimeout(aiImageGenerationPreviewTimers.get(normalizedBoardId));
    }

    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    aiImageGenerationRuns.set(normalizedBoardId, runId);
    aiImageGeneratingBoardIds.add(normalizedBoardId);
    setAiImageGenerationStatus(normalizedBoardId, "loading", { runId });

    const timerId = window.setTimeout(() => {
      completeAiImageSampleGeneration(normalizedBoardId, runId);
    }, AI_IMAGE_GENERATION_PREVIEW_MS);

    aiImageGenerationPreviewTimers.set(normalizedBoardId, timerId);

    return true;
  }

  function clearAiImageGenerationPreview(boardId = "") {
    const normalizedBoardId = String(boardId || "").trim();

    if (normalizedBoardId) {
      if (aiImageGenerationPreviewTimers.has(normalizedBoardId)) {
        window.clearTimeout(aiImageGenerationPreviewTimers.get(normalizedBoardId));
      }

      aiImageGenerationPreviewTimers.delete(normalizedBoardId);
      aiImageGenerationRuns.delete(normalizedBoardId);
      aiImageGeneratingBoardIds.delete(normalizedBoardId);
      aiImageGenerationStatusByBoardId.delete(normalizedBoardId);
      return;
    }

    aiImageGenerationPreviewTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    aiImageGenerationPreviewTimers = new Map();
    aiImageGenerationRuns = new Map();
    aiImageGeneratingBoardIds = new Set();
    aiImageGenerationStatusByBoardId = new Map();
  }

  function getAiImageBoardPreviewCssUrl(src) {
    return `url("${String(src || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`;
  }

  function getAiImageBoardMediaVariantSrc(media, lod) {
    const variants = media?.variants && typeof media.variants === "object" ? media.variants : null;
    const key = String(lod || "");
    const explicitVariant = String(variants?.[key] || "").trim();

    return explicitVariant;
  }

  function getAiImageBoardActivePreviewLayer(mediaHost) {
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

  function hasAiImageBoardPaintedImagePreview(mediaHost, src = "", kind = "image") {
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

  function createAiImageBoardPreviewLayer(name) {
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

  function ensureAiImageBoardImagePreviewLayers(mediaHost) {
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

  function clearAiImageBoardPreviewLayer(layer) {
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

  function clearAiImageBoardMediaDataset(mediaHost) {
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

  function resetAiImageBoardMediaHost(mediaHost) {
    if (!mediaHost) {
      return;
    }

    mediaHost.querySelectorAll("[data-ai-image-board-preview-layer]").forEach(clearAiImageBoardPreviewLayer);
    mediaHost.replaceChildren();
    mediaHost.classList.remove("is-crossfading", "is-image-preview", "is-placeholder-preview", "is-video-preview");
    mediaHost.style.removeProperty("background-image");
    clearAiImageBoardMediaDataset(mediaHost);
  }

  function setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind) {
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

  function markAiImageBoardPreviewPending(mediaHost, src, kind, preview, previewKey = "") {
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

  function decodeAiImageBoardPreviewSource(src) {
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

  function decodeAiImageBoardPreviewLayer(image, src) {
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

  function waitAiImageBoardPreviewPaintFrames(frameCount = AI_IMAGE_PREVIEW_PAINT_FRAMES) {
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

  function isAiImageBoardPreviewSwapCurrent(mediaHost, layer, requestId, previewKey, src, kind) {
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

  function commitAiImageBoardPreviewLayer(mediaHost, incomingLayer, media, preview, previewKey, previewSrcForDataset, src, kind) {
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

  function renderAiImageBoardPlaceholderPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
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

  function renderAiImageBoardVideoPreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
    resetAiImageBoardMediaHost(mediaHost);
    mediaHost.classList.add("is-video-preview");
    setAiImageBoardMediaDataset(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind);
  }

  function renderAiImageBoardImagePreview(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset) {
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

  function getAiBoardCameraMotionKey(camera, dpr) {
    return [
      Math.round((Number(camera?.x) || 0) * 10) / 10,
      Math.round((Number(camera?.y) || 0) * 10) / 10,
      Math.round((Math.max(0.0001, Number(camera?.zoom) || 1)) * 100000) / 100000,
      Math.round((Math.max(1, Number(dpr) || 1)) * 100) / 100,
    ].join(":");
  }

  function noteAiBoardCameraMotion(camera, dpr) {
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

  function isAiBoardCameraMotionActive() {
    return (performance.now?.() || Date.now()) < aiBoardCameraMotionUntil;
  }

  function getAiBoardHeldLodDuringCameraMotion(mediaHost, media) {
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

  function shouldHoldAiImageBoardPreviewForPendingLod(mediaHost, src, kind, preview) {
    const previewMode = String(preview?.previewMode || "");
    const previewSource = String(preview?.previewSource || "");
    const previewLod = String(preview?.lod || "");

    return Boolean(
      previewMode === "placeholder" &&
      (previewSource === "loading" || previewSource === "runtime" || previewSource === "error" || previewLod.startsWith("loading-") || previewLod.startsWith("error-")) &&
      hasAiImageBoardPaintedImagePreview(mediaHost, src, kind)
    );
  }

  function resolveAiImageBoardPreview(media, recommendedLod) {
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

  function renderAiImageBoardGeneratedMedia(element, board, options = {}) {
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

  function handleAiImagePromptFocus(event) {
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
      value: String(board.promptText || ""),
    };
  }

  function handleAiImagePromptInput(event) {
    const board = getBoardFromControlEvent(event);

    if (!board) {
      return;
    }

    board.promptText = String(event.currentTarget?.value || "");
    resizeAiImagePromptInput(event.currentTarget);
    emitConnectionsChange("space-board-prompt-input");
  }

  function handleAiImagePromptBlur(event) {
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

  function isMobilePromptFocusViewport() {
    return Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.innerWidth || 0) <= 900 ||
      document.documentElement?.classList.contains("cbo-visual-keyboard-active")
    );
  }

  function clearPromptFocusViewportTimers() {
    promptFocusViewportTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    promptFocusViewportTimers = [];
  }

  function scheduleAiImagePromptFocusViewport(boardId) {
    if (!isMobilePromptFocusViewport()) {
      return;
    }

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return;
    }

    clearPromptFocusViewportTimers();
    focusAiImagePromptBoard(normalizedBoardId);
    [80, 260, 520].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        focusAiImagePromptBoard(normalizedBoardId);
        window.scrollTo?.(0, 0);
      }, delay);

      promptFocusViewportTimers.push(timerId);
    });
  }

  function focusAiImagePromptBoard(boardId) {
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
    const viewportHeightCss = Math.max(
      1,
      Math.min(
        stage.clientHeight || stageRect.height || 1,
        window.visualViewport?.height || stage.clientHeight || stageRect.height || 1,
      ),
    );
    const boardWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardScreenHeight = boardHeight * zoom / dpr;
    const maxTop = Math.max(
      AI_IMAGE_PROMPT_FOCUS_MIN_TOP_CSS_PX,
      viewportHeightCss - Math.min(boardScreenHeight, viewportHeightCss) - AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX,
    );
    const targetTopCss = Math.min(AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX, maxTop);
    const boardCenterX = (Number(board.x) || 0) + boardWidth * 0.5;
    const boardTopY = Number(board.y) || 0;
    const nextCameraX = viewportWidthCss * 0.5 * dpr - boardCenterX * zoom;
    const nextCameraY = targetTopCss * dpr - boardTopY * zoom;

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

  function resizeAiImagePromptInput(input) {
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

  function getAiImageBoardFootprintRect(rect) {
    if (!rect) {
      return null;
    }

    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;

    return createRect(
      rect.x - leftExtension,
      rect.y,
      rect.width + leftExtension,
      rect.height,
    );
  }

  function getDocumentArtboardRect(artboard) {
    return artboard
      ? createRect(artboard.x, artboard.y, artboard.width, artboard.height)
      : null;
  }

  function getSpaceBoardPlacementBlockers(options = {}) {
    const excludeBoardId = String(options.excludeBoardId || "").trim();
    const gap = Number.isFinite(Number(options.gap))
      ? Math.max(0, Number(options.gap))
      : SPACE_BOARD_GAP_DOC_PX;

    return [
      ...getAllArtboards().map(getDocumentArtboardRect),
      ...spaceBoards
        .filter((board) => !excludeBoardId || board.id !== excludeBoardId)
        .map(getSpaceBoardRect)
        .map(getAiImageBoardFootprintRect),
    ]
      .filter(Boolean)
      .map((rect) => expandRect(rect, gap));
  }

  function resolveFreeSpaceBoardPlacement(preferredRect, options = {}) {
    const blockers = getSpaceBoardPlacementBlockers(options);
    const preferredFootprint = getAiImageBoardFootprintRect(preferredRect);
    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;

    if (!doesRectOverlapAny(preferredFootprint, blockers)) {
      return preferredRect;
    }

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (x, y) => {
      const rect = createRect(
        Math.round(Number(x) || 0),
        Math.round(Number(y) || 0),
        preferredRect.width,
        preferredRect.height,
      );
      const key = `${rect.x}:${rect.y}`;

      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(rect);
      }
    };

    blockers.forEach((blocker) => {
      pushCandidate(blocker.x + blocker.width + leftExtension, preferredRect.y);
      pushCandidate(preferredRect.x, blocker.y + blocker.height);
      pushCandidate(blocker.x + blocker.width + leftExtension, blocker.y);
      pushCandidate(blocker.x, blocker.y + blocker.height);
    });

    blockers.forEach((horizontalBlocker) => {
      blockers.forEach((verticalBlocker) => {
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y);
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y + verticalBlocker.height);
      });
    });

    return candidates
      .filter((rect) => !doesRectOverlapAny(getAiImageBoardFootprintRect(rect), blockers))
      .sort((first, second) => (
        Math.hypot(first.x - preferredRect.x, first.y - preferredRect.y) -
        Math.hypot(second.x - preferredRect.x, second.y - preferredRect.y)
      ))[0] || preferredRect;
  }

  function getAiImageBoardInputAnchor(board) {
    if (!board) {
      return null;
    }

    if (shouldUsePlainAiBoardArtboards()) {
      return {
        x: Number(board.x) || 0,
        y: (Number(board.y) || 0) +
          (Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX),
      };
    }

    const metrics = getActionBubbleMetrics();

    return {
      x: (Number(board.x) || 0) -
        metrics.gapDoc -
        metrics.sizeDoc * 0.5,
      y: (Number(board.y) || 0) +
        (Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX) -
        metrics.gapDoc -
        metrics.sizeDoc * 0.5,
    };
  }

  function getConnectionEndPoint(connection) {
    const targetBoard = getSpaceBoardById(connection?.targetBoardId);
    const targetAnchor = targetBoard?.type === "ai-image"
      ? getAiImageBoardInputAnchor(targetBoard)
      : null;

    if (targetAnchor) {
      return targetAnchor;
    }

    if (
      !Number.isFinite(Number(connection?.endDocX)) ||
      !Number.isFinite(Number(connection?.endDocY))
    ) {
      return null;
    }

    return {
      x: Number(connection.endDocX),
      y: Number(connection.endDocY),
    };
  }

  function createConnectionPathD(start, end, viewScale = 1) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const arrowInset = Math.min(
      getConnectionStrokeWidth(viewScale) * CONNECTION_ARROW_LENGTH_STROKE_UNITS,
      Math.max(0, length * 0.5),
    );
    const shaftEnd = {
      x: end.x - (dx / length) * arrowInset,
      y: end.y - (dy / length) * arrowInset,
    };
    const shaftDx = shaftEnd.x - start.x;
    const shaftDy = shaftEnd.y - start.y;
    const handleDistance = Math.max(48 * viewScale, Math.abs(shaftDx) * 0.5);
    const verticalEase = Math.min(Math.abs(shaftDy) * 0.18, 80 * viewScale);
    const control1 = {
      x: start.x + handleDistance,
      y: start.y + Math.sign(shaftDy || 1) * verticalEase,
    };
    const control2 = {
      x: shaftEnd.x - handleDistance,
      y: shaftEnd.y - Math.sign(shaftDy || 1) * verticalEase,
    };

    return `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${shaftEnd.x} ${shaftEnd.y}`;
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
  }

  function createConnectionPath(connection, options = {}) {
    const sourceArtboard = getArtboardById(connection.sourceArtboardId);
    const sourceDoc = getActionAnchorPoint(sourceArtboard);
    const targetDoc = getConnectionEndPoint(connection);

    if (!sourceDoc || !targetDoc) {
      return null;
    }

    const plainArtboardMode = shouldUsePlainAiBoardArtboards();
    const source = plainArtboardMode ? documentPointToStagePoint(sourceDoc) : sourceDoc;
    const target = plainArtboardMode ? documentPointToStagePoint(targetDoc) : targetDoc;
    const pathScale = plainArtboardMode ? 0.5 : 1;
    const strokeWidth = plainArtboardMode ? 1.5 : getConnectionStrokeWidth(1);

    return createSvgElement("path", {
      class: `editor-artboard-connection-path${options.active ? " is-active" : ""}`,
      d: createConnectionPathD(source, target, pathScale),
      "data-connection-id": connection.id || "",
      "marker-end": "url(#editor-artboard-connection-arrow)",
      "stroke-width": strokeWidth,
    });
  }

  function createConnectionDefs() {
    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: "editor-artboard-connection-arrow",
      markerHeight: "5",
      markerUnits: "strokeWidth",
      markerWidth: "5",
      orient: "auto",
      refX: "0",
      refY: "2.5",
      viewBox: "0 0 5 5",
    });
    const arrow = createSvgElement("path", {
      d: "M 0 0 L 5 2.5 L 0 5 z",
      fill: "#f05023",
    });

    marker.appendChild(arrow);
    defs.appendChild(marker);

    return defs;
  }

  function roundConnectionGeometryValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
  }

  function getPointGeometryKey(point) {
    return point
      ? `${roundConnectionGeometryValue(point.x)},${roundConnectionGeometryValue(point.y)}`
      : "";
  }

  function getConnectionGeometryKey() {
    const records = connections.map((connection) => {
      const sourceArtboard = getArtboardById(connection.sourceArtboardId);
      const source = getActionAnchorPoint(sourceArtboard);
      const target = getConnectionEndPoint(connection);

      return [
        connection.id || "",
        connection.sourceArtboardId || "",
        connection.targetBoardId || "",
        connection.targetHandle || "",
        getPointGeometryKey(source),
        getPointGeometryKey(target),
      ].join(":");
    });

    if (connectionDrag) {
      const sourceArtboard = getArtboardById(connectionDrag.sourceArtboardId);
      const source = getActionAnchorPoint(sourceArtboard);
      const target = getConnectionEndPoint(connectionDrag);

      records.push([
        "drag",
        connectionDrag.id || "",
        connectionDrag.sourceArtboardId || "",
        getPointGeometryKey(source),
        getPointGeometryKey(target),
      ].join(":"));
    }

    if (shouldUsePlainAiBoardArtboards()) {
      const { camera, dpr } = getCameraState();

      records.push([
        "plain-view",
        roundConnectionGeometryValue(camera.x),
        roundConnectionGeometryValue(camera.y),
        roundConnectionGeometryValue(camera.zoom),
        roundConnectionGeometryValue(dpr),
      ].join(":"));
    }

    return records.join("|");
  }

  function renderConnections(options = {}) {
    const svg = ensureConnectionLayer();

    if (!svg) {
      return;
    }

    const geometryKey = getConnectionGeometryKey();

    if (
      options.force !== true &&
      geometryKey === lastConnectionsGeometryKey &&
      svg.dataset.connectionGeometryKey === geometryKey
    ) {
      return;
    }

    const paths = connections
      .map((connection) => createConnectionPath(connection))
      .filter(Boolean);

    if (connectionDrag) {
      const activePath = createConnectionPath(connectionDrag, { active: true });

      if (activePath) {
        paths.push(activePath);
      }
    }

    svg.dataset.connectionGeometryKey = geometryKey;
    lastConnectionsGeometryKey = geometryKey;
    svg.replaceChildren(createConnectionDefs(), ...paths);
  }

  function renderSpaceBoards() {
    const renderStartedAt = performance.now?.() || Date.now();
    const aiBoards = spaceBoards.filter((board) => board.type === "ai-image");
    const layer = ensureSpaceBoardLayer();
    const pane = renderSpaceBoardPaneTransform();
    const viewState = getCameraState();
    const viewScale = getViewScale();
    const visibleViewportRect = getSpaceBoardVisibleDocumentRect(0);
    const nearViewportRect = getSpaceBoardVisibleDocumentRect(getSpaceBoardLazyMarginDocPx());
    const runtimePreviewCacheStats = getAiImageRuntimePreviewCacheStats();
    const metrics = createEmptyAiBoardMetrics({
      dpr: roundMetricValue(viewState.dpr, 2),
      generatingBoards: aiImageGeneratingBoardIds.size,
      lastGenerateStatus: formatAiImageGenerationStatus(getLastAiImageGenerationStatus()),
      runtimePreviewCacheCount: runtimePreviewCacheStats.readyCount,
      runtimePreviewCacheMB: runtimePreviewCacheStats.decodedMB,
      runtimePreviewLoadingCount: runtimePreviewCacheStats.loadingCount,
      stateBoards: aiBoards.length,
      zoom: roundMetricValue(viewState.camera.zoom, 5),
    });

    if (!layer || !pane) {
      metrics.frameMs = roundMetricValue((performance.now?.() || Date.now()) - renderStartedAt, 2);
      publishAiBoardMetrics(metrics);
      return;
    }

    const handleMetrics = getActionBubbleMetrics(1);
    const renderedIds = new Set();

    aiBoards.forEach((board) => {
      const boardRect = getSpaceBoardRect(board);
      const visibilityState = getAiBoardVisibilityState(boardRect, visibleViewportRect, nearViewportRect);
      const element = ensureAiImageBoardElement(board.id);

      if (visibilityState === "visible") {
        metrics.visibleAiBoards += 1;
      } else if (visibilityState === "near") {
        metrics.nearAiBoards += 1;
      } else {
        metrics.offscreenAiBoards += 1;
      }

      if (!element) {
        return;
      }

      renderedIds.add(board.id);

      const docWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const docHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const plainArtboardMode = shouldUsePlainAiBoardArtboards();
      const point = plainArtboardMode
        ? documentPointToStagePoint({ x: board.x, y: board.y }, viewState)
        : { x: 0, y: 0 };
      const width = plainArtboardMode
        ? Math.max(1, docWidth * viewScale)
        : docWidth;
      const height = plainArtboardMode
        ? Math.max(1, docHeight * viewScale)
        : docHeight;
      const plainControlSize = Math.max(18, Math.min(34, Math.round(ACTION_BUBBLE_SIZE_DOC_PX * viewScale)));
      const label = element.querySelector("[data-ai-image-board-drag-handle]");
      const shouldMountHeavy = !plainArtboardMode && shouldMountAiImageBoardHeavyContent(board, element);
      const isNearViewport = visibilityState !== "offscreen";
      const isMobileLean = isMobileLikeSpaceBoardViewport() &&
        getSpaceBoardMinScreenSize(board) < SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX;

      if (shouldMountHeavy) {
        ensureAiImageBoardHeavyContent(element);
      } else {
        unmountAiImageBoardHeavyContent(element);
      }

      const promptInput = element.querySelector("[data-ai-image-board-prompt-input]");
      const isHeavyMounted = element.dataset.aiImageBoardHeavyMounted === "true";
      const isGenerating = aiImageGeneratingBoardIds.has(board.id);
      const generationStatus = getAiImageGenerationStatus(board.id);
      const generateButton = element.querySelector("[data-ai-image-board-generate]");
      const shouldUnloadMedia = shouldUnloadAiBoardMedia(board, visibilityState, element);
      const shouldUpdatePreviewLod = visibilityState === "visible";
      const mediaHost = element.querySelector("[data-ai-image-board-media]");

      setStylePropertyIfChanged(element, "left", `${point.x}px`);
      setStylePropertyIfChanged(element, "top", `${point.y}px`);
      setStylePropertyIfChanged(element, "width", `${width}px`);
      setStylePropertyIfChanged(element, "height", `${height}px`);
      setCssVarIfChanged(element, "--ai-plain-control-size", `${plainControlSize}px`);
      const boardTransform = plainArtboardMode
        ? "none"
        : `translate3d(${Number(board.x) || 0}px, ${Number(board.y) || 0}px, 0)`;

      setStylePropertyIfChanged(element, "transform", boardTransform);
      setCssVarIfChanged(element, "--ai-image-board-radius", `${AI_IMAGE_BOARD_RADIUS_DOC_PX}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-size", `${handleMetrics.sizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-left", `${(handleMetrics.sizeDoc + handleMetrics.gapDoc) * -1}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-top", `${docHeight - handleMetrics.gapDoc - handleMetrics.sizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-border-width", `${handleMetrics.borderWidthDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-icon-size", `${handleMetrics.iconSizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-size", `${AI_IMAGE_GENERATE_HANDLE_SIZE_DOC_PX}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-left", `${docWidth + AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-top", `${AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX}px`);
      setCssVarIfChanged(element, "--ai-image-generate-border-width", `${handleMetrics.borderWidthDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-icon-size", `${handleMetrics.iconSizeDoc}px`);
      element.classList.toggle("is-generating", isGenerating && isHeavyMounted && !plainArtboardMode);
      element.classList.toggle("is-heavy-mounted", isHeavyMounted);
      element.classList.toggle("is-near-viewport", isNearViewport);
      element.classList.toggle("is-selected", selectedSpaceBoardId === board.id);
      element.classList.toggle("is-mobile-lean", isMobileLean);
      element.classList.toggle("has-generated-media", Boolean(board.generatedMedia?.src));
      if (generateButton) {
        generateButton.disabled = isGenerating;
        generateButton.classList.toggle("is-loading", isGenerating);
        if (isGenerating) {
          generateButton.setAttribute("aria-busy", "true");
        } else {
          generateButton.removeAttribute("aria-busy");
        }
      }

      const currentMediaLod = getAiBoardCurrentLod(board, mediaHost);
      const rawRecommendedLod = shouldUnloadMedia
        ? "unloaded"
        : shouldUpdatePreviewLod
          ? getAiBoardRecommendedLod(board, width, height, viewState.dpr)
          : currentMediaLod || "deferred";
      const stableRecommendedLod = shouldUnloadMedia || !shouldUpdatePreviewLod
        ? rawRecommendedLod
        : getStableAiBoardRecommendedLod(board, width, height, viewState.dpr, mediaHost);
      const heldLodForCameraMotion = shouldUnloadMedia || !shouldUpdatePreviewLod
        ? ""
        : getAiBoardHeldLodDuringCameraMotion(mediaHost, board.generatedMedia);
      const recommendedLod = heldLodForCameraMotion || stableRecommendedLod;

      if (shouldUpdatePreviewLod && rawRecommendedLod !== recommendedLod) {
        preloadAiImageBoardRuntimeLod(board.generatedMedia, rawRecommendedLod);
      }

      if ((plainArtboardMode || isHeavyMounted) && (shouldUpdatePreviewLod || shouldUnloadMedia || !board.generatedMedia?.src)) {
        renderAiImageBoardGeneratedMedia(element, board, { recommendedLod });
      }

      if (shouldUnloadMedia) {
        const evictedCount = evictAiImageRuntimePreviewVariantsForSrc(board.generatedMedia?.src || "");

        if (evictedCount > 0) {
          recordAiBoardPreviewDebugEvent("runtime-preview-evict-offscreen", {
            boardId: board.id,
            count: evictedCount,
            src: board.generatedMedia?.src || "",
            visibility: visibilityState,
          });
        }
      }

      const activePreview = isAiBoardPreviewActive(mediaHost);
      const currentLod = getAiBoardCurrentLod(board, mediaHost);
      const decodedMB = roundMetricValue(estimateAiBoardDecodedMB(board, currentLod, activePreview), 2);
      const previewDebug = getAiBoardPreviewDebugSnapshot(element, mediaHost);

      if (activePreview) {
        metrics.activePreviewCount += 1;
      }

      metrics.estimatedDecodedMB += decodedMB;
      metrics.boards.push({
        activePreview,
        currentLod,
        estimatedDecodedMB: decodedMB,
        generationMessage: generationStatus?.message || "",
        generationSampleKind: generationStatus?.sampleKind || "",
        generationSampleName: generationStatus?.sampleName || "",
        generationStatus: generationStatus?.status || "",
        generated: Boolean(board.generatedMedia?.src),
        id: board.id,
        isGenerating,
        mediaKind: board.generatedMedia?.kind || "",
        name: board.name || "AI Image board",
        previewDebug,
        previewSource: mediaHost?.dataset?.mediaPreviewSource || "",
        previewSrc: summarizeAiBoardPreviewSrc(mediaHost?.dataset?.mediaPreviewSrc || ""),
        recommendedLod,
        screenHeight: roundMetricValue(height, 2),
        screenWidth: roundMetricValue(width, 2),
        visibility: visibilityState,
      });

      if (label) {
        label.textContent = `${board.name || "AI Image board"} ${docWidth} x ${docHeight}`;
      }

      if (promptInput && document.activeElement !== promptInput) {
        promptInput.value = String(board.promptText || "");
      }

      resizeAiImagePromptInput(promptInput);
    });

    layer.querySelectorAll("[data-ai-image-board]").forEach((element) => {
      const boardId = element.dataset.boardId || "";

      if (!renderedIds.has(boardId)) {
        clearAiImageGenerationPreview(boardId);
        if (selectedSpaceBoardId === boardId) {
          selectedSpaceBoardId = "";
        }
        element.remove();
      }
    });

    const finalRuntimePreviewCacheStats = getAiImageRuntimePreviewCacheStats();

    metrics.renderedAiBoards = renderedIds.size;
    metrics.runtimePreviewCacheCount = finalRuntimePreviewCacheStats.readyCount;
    metrics.runtimePreviewCacheMB = finalRuntimePreviewCacheStats.decodedMB;
    metrics.runtimePreviewLoadingCount = finalRuntimePreviewCacheStats.loadingCount;
    metrics.previewDebugEvents = aiBoardPreviewDebugEvents.map((event) => ({ ...event }));
    metrics.estimatedDecodedMB = roundMetricValue(metrics.estimatedDecodedMB, 2);
    metrics.frameMs = roundMetricValue((performance.now?.() || Date.now()) - renderStartedAt, 2);
    publishAiBoardMetrics(metrics);
  }

  function getConnectionById(connectionId) {
    const normalizedId = String(connectionId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return connections.find((connection) => connection.id === normalizedId) || null;
  }

  function bindMenuDismiss() {
    if (menuDismissBound) {
      return;
    }

    menuDismissBound = true;
    document.addEventListener("click", handleMenuDocumentClick, true);
    document.addEventListener("keydown", handleMenuKeydown, true);
  }

  function unbindMenuDismiss() {
    if (!menuDismissBound) {
      return;
    }

    menuDismissBound = false;
    document.removeEventListener("click", handleMenuDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
  }

  function showConnectionMenu(connection) {
    if (!connection?.id) {
      return;
    }

    menuState = {
      connectionId: connection.id,
    };
    ignoreNextMenuDocumentClick = true;
    window.setTimeout(() => {
      ignoreNextMenuDocumentClick = false;
    }, 0);
    bindMenuDismiss();
    renderConnectionMenu();
  }

  function renderConnectionOverlay() {
    renderSpaceBoards();
    renderActions();
    renderConnections();
    renderConnectionMenu();
  }

  function dismissConnectionMenu(options = {}) {
    const connectionId = String(menuState?.connectionId || "").trim();

    menuState = null;
    unbindMenuDismiss();

    const menu = getStage()?.querySelector("[data-artboard-connection-menu]");

    menu?.classList.remove("is-visible");
    menu?.setAttribute("aria-hidden", "true");

    if (options.removeConnection !== false && connectionId) {
      connections = connections.filter((connection) => connection.id !== connectionId);
    }

    if (options.render !== false) {
      renderConnectionOverlay();
    }
  }

  function handleMenuDocumentClick(event) {
    if (!menuState) {
      return;
    }

    if (ignoreNextMenuDocumentClick) {
      ignoreNextMenuDocumentClick = false;
      return;
    }

    if (event.target?.closest?.("[data-artboard-connection-menu]")) {
      return;
    }

    dismissConnectionMenu();
  }

  function handleMenuKeydown(event) {
    if (!menuState || event.key !== "Escape") {
      return;
    }

    dismissConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderConnectionMenu() {
    const menu = ensureConnectionMenu();

    if (!menu) {
      return;
    }

    const connection = getConnectionById(menuState?.connectionId);

    if (!connection) {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }

    const target = getConnectionEndPoint(connection);

    if (!target) {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }

    const end = documentPointToStagePoint(target);
    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();
    const stageWidth = Math.max(1, Number(stageRect?.width || stage?.clientWidth) || 1);
    const stageHeight = Math.max(1, Number(stageRect?.height || stage?.clientHeight) || 1);

    menu.classList.add("is-visible");
    menu.setAttribute("aria-hidden", "false");

    const height = menu.offsetHeight || 154;
    const width = menu.offsetWidth || 140;
    const preferredLeft = end.x + CONNECTION_MENU_GAP_CSS_PX;
    const left = preferredLeft + width > stageWidth - 8
      ? Math.max(8, end.x - width - CONNECTION_MENU_GAP_CSS_PX)
      : Math.max(8, preferredLeft);
    const top = Math.min(
      Math.max(8, end.y - height * 0.5),
      Math.max(8, stageHeight - height - 8),
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function createConnectionId() {
    const id = `artboard-connection-${Date.now().toString(36)}-${connectionIdSeed}`;
    connectionIdSeed += 1;
    return id;
  }

  function createBoardId() {
    const id = `ai-image-board-${Date.now().toString(36)}-${boardIdSeed}`;
    boardIdSeed += 1;
    return id;
  }

  function createAiImageBoardForConnection(connection) {
    const anchor = getConnectionEndPoint(connection);

    if (!anchor) {
      return null;
    }

    const handleMetrics = getActionBubbleMetrics();
    const preferredRect = createRect(
      anchor.x + handleMetrics.gapDoc + handleMetrics.sizeDoc * 0.5,
      anchor.y - AI_IMAGE_BOARD_SIZE_DOC_PX + handleMetrics.gapDoc + handleMetrics.sizeDoc * 0.5,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
      AI_IMAGE_BOARD_SIZE_DOC_PX,
    );
    const placement = resolveFreeSpaceBoardPlacement(preferredRect);
    const board = {
      height: AI_IMAGE_BOARD_SIZE_DOC_PX,
      id: createBoardId(),
      name: `AI Image board #${spaceBoards.filter((entry) => entry.type === "ai-image").length + 1}`,
      promptText: "",
      type: "ai-image",
      width: AI_IMAGE_BOARD_SIZE_DOC_PX,
      x: placement.x,
      y: placement.y,
    };

    spaceBoards.push(board);

    const targetAnchor = getAiImageBoardInputAnchor(board);

    connection.endDocX = targetAnchor.x;
    connection.endDocY = targetAnchor.y;
    connection.targetBoardId = board.id;
    connection.targetHandle = "image-input";

    return board;
  }

  function getAllowedSpaceBoardMove(startFootprint, dx, dy, blockers = []) {
    const safeDx = Number.isFinite(Number(dx)) ? Number(dx) : 0;
    const safeDy = Number.isFinite(Number(dy)) ? Number(dy) : 0;

    if (!startFootprint || blockers.length === 0 || (safeDx === 0 && safeDy === 0)) {
      return {
        dx: safeDx,
        dy: safeDy,
      };
    }

    const startScore = getRectOverlapScore(startFootprint, blockers);
    const isAllowed = (rect) => {
      const score = getRectOverlapScore(rect, blockers);

      return score <= 0 || (startScore > 0 && score <= startScore);
    };

    if (isAllowed(offsetRect(startFootprint, safeDx, safeDy))) {
      return {
        dx: safeDx,
        dy: safeDy,
      };
    }

    let low = 0;
    let high = 1;

    for (let index = 0; index < SPACE_BOARD_MOVE_SEARCH_STEPS; index += 1) {
      const mid = (low + high) * 0.5;

      if (isAllowed(offsetRect(startFootprint, safeDx * mid, safeDy * mid))) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return {
      dx: safeDx * low,
      dy: safeDy * low,
    };
  }

  function getSpaceBoardMoveDistance(move) {
    return Math.hypot(Number(move?.dx) || 0, Number(move?.dy) || 0);
  }

  function constrainSpaceBoardMove(boardId, dx, dy, startRect) {
    const normalizedBoardId = String(boardId || "").trim();
    const start = startRect || getSpaceBoardRect(getSpaceBoardById(normalizedBoardId));

    if (!start) {
      return {
        dx: Number(dx) || 0,
        dy: Number(dy) || 0,
      };
    }

    const requested = {
      dx: Number(dx) || 0,
      dy: Number(dy) || 0,
    };
    const candidate = createRect(
      start.x + requested.dx,
      start.y + requested.dy,
      start.width,
      start.height,
    );
    const blockers = getSpaceBoardPlacementBlockers({
      excludeBoardId: normalizedBoardId,
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
    });
    const startFootprint = getAiImageBoardFootprintRect(start);

    if (!doesRectOverlapAny(getAiImageBoardFootprintRect(candidate), blockers)) {
      return requested;
    }

    return [
      getAllowedSpaceBoardMove(startFootprint, requested.dx, requested.dy, blockers),
      getAllowedSpaceBoardMove(startFootprint, requested.dx, 0, blockers),
      getAllowedSpaceBoardMove(startFootprint, 0, requested.dy, blockers),
    ].sort((first, second) => getSpaceBoardMoveDistance(second) - getSpaceBoardMoveDistance(first))[0] || {
      dx: 0,
      dy: 0,
    };
  }

  function startSpaceBoardDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    const boardElement = event.currentTarget?.closest?.("[data-ai-image-board]");
    const boardId = String(boardElement?.dataset?.boardId || "").trim();
    const board = getSpaceBoardById(boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    selectedSpaceBoardId = boardId;
    ensureAiImageBoardHeavyContent(boardElement);

    spaceBoardDrag = {
      boardId,
      beforeState: captureConnectionsHistoryState(),
      didMove: false,
      dx: 0,
      dy: 0,
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startRect: getSpaceBoardRect(board),
      startX: Number(board.x) || 0,
      startY: Number(board.y) || 0,
    };

    getStage()?.classList.add("artboard-dragging");

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    addSpaceBoardDragListeners();
    event.preventDefault();
    event.stopPropagation();
  }

  function updateSpaceBoardDrag(event) {
    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    const board = getSpaceBoardById(spaceBoardDrag.boardId);
    const point = getEventDocumentPoint(event);

    if (!board || !point) {
      return;
    }

    const rawDx = (Number(point.docX) || 0) - spaceBoardDrag.startDocX;
    const rawDy = (Number(point.docY) || 0) - spaceBoardDrag.startDocY;
    const constrained = constrainSpaceBoardMove(
      spaceBoardDrag.boardId,
      rawDx,
      rawDy,
      spaceBoardDrag.startRect,
    );
    const dx = Number(constrained.dx) || 0;
    const dy = Number(constrained.dy) || 0;

    board.x = spaceBoardDrag.startX + dx;
    board.y = spaceBoardDrag.startY + dy;
    spaceBoardDrag.dx = dx;
    spaceBoardDrag.dy = dy;
    spaceBoardDrag.didMove = spaceBoardDrag.didMove || Boolean(dx || dy);
    renderConnectionOverlay();
    event.preventDefault();
    event.stopPropagation();
  }

  function finishSpaceBoardDrag(event) {
    if (!spaceBoardDrag || event.pointerId !== spaceBoardDrag.pointerId) {
      return;
    }

    const state = spaceBoardDrag;

    spaceBoardDrag = null;
    removeSpaceBoardDragListeners();
    getStage()?.classList.remove("artboard-dragging");

    try {
      state.sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Some browsers release capture automatically before pointercancel/pointerup.
    }

    if (event.type === "pointercancel") {
      restoreConnectionsHistoryState(state.beforeState, "space-board-drag-cancel");
    } else if (state.didMove && (Math.round(state.dx) || Math.round(state.dy))) {
      pushConnectionsHistoryEntry(state.beforeState, captureConnectionsHistoryState(), {
        historyGroup: `space-board-move-${state.boardId}`,
        source: "space-board-label-drag",
        type: "space-board-move",
      });
    } else {
      renderConnectionOverlay();
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function addSpaceBoardDragListeners() {
    document.addEventListener("pointermove", updateSpaceBoardDrag, true);
    document.addEventListener("pointerup", finishSpaceBoardDrag, true);
    document.addEventListener("pointercancel", finishSpaceBoardDrag, true);
  }

  function removeSpaceBoardDragListeners() {
    document.removeEventListener("pointermove", updateSpaceBoardDrag, true);
    document.removeEventListener("pointerup", finishSpaceBoardDrag, true);
    document.removeEventListener("pointercancel", finishSpaceBoardDrag, true);
    getStage()?.classList.remove("artboard-dragging");
  }

  function materializeAiImageBoardFromMenu() {
    const connection = getConnectionById(menuState?.connectionId);

    if (!connection) {
      dismissConnectionMenu();
      return;
    }

    const beforeState = captureConnectionsHistoryState({
      excludeConnectionIds: [connection.id],
    });

    const board = createAiImageBoardForConnection(connection);
    dismissConnectionMenu({
      removeConnection: false,
      render: false,
    });
    pushConnectionsHistoryEntry(beforeState, captureConnectionsHistoryState(), {
      historyGroup: `space-board-create-${connection.id}`,
      source: "space-board-create-ai-image",
      type: "space-board-create",
    });
    renderConnectionOverlay();
  }

  function getDefaultConnectionEndPoint(sourceArtboardId) {
    const sourceArtboard = getArtboardById(sourceArtboardId);
    const anchor = getActionAnchorPoint(sourceArtboard);

    if (!anchor) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: anchor.x + (CONNECTION_CLICK_DISTANCE_CSS_PX * dpr) / zoom,
      y: anchor.y,
    };
  }

  function updateConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const dx = event.clientX - connectionDrag.startClientX;
    const dy = event.clientY - connectionDrag.startClientY;

    connectionDrag.endDocX = point.docX;
    connectionDrag.endDocY = point.docY;
    connectionDrag.didMove = connectionDrag.didMove ||
      Math.hypot(dx, dy) >= CONNECTION_MIN_DRAG_CSS_PX;
    renderConnections();
    event.preventDefault();
  }

  function finishConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    updateConnectionDrag(event);

    const connection = connectionDrag;
    const sourceElement = connection.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    const defaultEnd = connection.didMove
      ? null
      : getDefaultConnectionEndPoint(connection.sourceArtboardId);
    const finalizedConnection = {
      endDocX: defaultEnd?.x ?? connection.endDocX,
      endDocY: defaultEnd?.y ?? connection.endDocY,
      id: connection.id,
      sourceArtboardId: connection.sourceArtboardId,
    };

    connections.push(finalizedConnection);
    showConnectionMenu(finalizedConnection);

    renderConnections();
    renderConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function cancelConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const sourceElement = connectionDrag.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function startConnectionDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    const bubble = event.currentTarget;
    const sourceArtboardId = String(bubble?.dataset?.artboardId || lastRenderContext.selectedArtboardId || "").trim();
    const point = getEventDocumentPoint(event);

    if (!sourceArtboardId || !point || !getArtboardById(sourceArtboardId)) {
      return;
    }

    connectionDrag = {
      didMove: false,
      endDocX: point.docX,
      endDocY: point.docY,
      id: createConnectionId(),
      pointerId: event.pointerId,
      sourceArtboardId,
      sourceElement: bubble,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };

    try {
      bubble?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    document.addEventListener("pointermove", updateConnectionDrag, true);
    document.addEventListener("pointerup", finishConnectionDrag, true);
    document.addEventListener("pointercancel", cancelConnectionDrag, true);
    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderActions() {
    const selectedId = String(lastRenderContext.selectedArtboardId || "").trim();
    const visibleArtboardIds = new Set();

    if (selectedId) {
      visibleArtboardIds.add(selectedId);
    }

    connections.forEach((connection) => {
      const sourceArtboardId = String(connection?.sourceArtboardId || "").trim();

      if (sourceArtboardId) {
        visibleArtboardIds.add(sourceArtboardId);
      }
    });

    const activeSourceArtboardId = String(connectionDrag?.sourceArtboardId || "").trim();

    if (activeSourceArtboardId) {
      visibleArtboardIds.add(activeSourceArtboardId);
    }

    const scale = Math.max(0.0001, Number(lastRenderContext.viewScale) || 1);
    const { borderWidth, gap, iconSize, size } = getActionBubbleMetrics(scale);
    const renderedIds = new Set();
    const nextAnchorOverrides = new Map();

    lastRenderContext.artboardViews.forEach((view) => {
      if (!visibleArtboardIds.has(view.artboard.id)) {
        return;
      }

      const bubble = ensureActionBubble(view.artboard.id);

      if (!bubble) {
        return;
      }

      renderedIds.add(view.artboard.id);
      const left = view.left + view.width + gap;
      const top = view.top + gap;

      nextAnchorOverrides.set(view.artboard.id, stagePointToDocumentPoint({
        x: left + size,
        y: top + size * 0.5,
      }));

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.borderWidth = `${borderWidth}px`;
      bubble.style.setProperty("--artboard-action-icon-size", `${iconSize}px`);
      bubble.classList.add("is-visible");
    });

    anchorOverrides = nextAnchorOverrides;

    getStage()?.querySelectorAll("[data-artboard-action-bubble]").forEach((bubble) => {
      if (!renderedIds.has(bubble.dataset.artboardId || "")) {
        bubble.classList.remove("is-visible", "is-hovered");
      }
    });
  }

  namespace.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay(options = {}) {
    const camera = options.camera || getBrushEngine()?.camera || lastRenderContext.camera;
    const dpr = Math.max(1, Number(options.dpr || getBrushEngine()?.dpr || lastRenderContext.dpr || window.devicePixelRatio || 1));
    const viewScale = Number.isFinite(Number(options.viewScale))
      ? Number(options.viewScale)
      : Math.max(0.0001, Number(camera?.zoom) || 1) / dpr;

    noteAiBoardCameraMotion(camera, dpr);

    lastRenderContext = {
      artboardViews: Array.isArray(options.artboardViews) ? options.artboardViews : [],
      camera: cloneCamera(camera),
      dpr,
      selectedArtboardId: String(options.selectedArtboardId || "").trim(),
      viewScale,
    };
    renderConnectionOverlay();
  };

  namespace.getArtboardConnections = function getArtboardConnections() {
    return connections.map((connection) => ({ ...connection }));
  };

  namespace.getArtboardConnectionBoards = function getArtboardConnectionBoards() {
    return spaceBoards.map((board) => ({ ...board }));
  };

  namespace.getArtboardConnectionBoardCollisionRects = function getArtboardConnectionBoardCollisionRects() {
    return spaceBoards
      .map(getSpaceBoardRect)
      .map(getAiImageBoardFootprintRect)
      .filter(Boolean)
      .map((rect) => ({ ...rect }));
  };

  namespace.getAiBoardMetrics = function getAiBoardMetrics() {
    return {
      ...aiBoardMetrics,
      boards: Array.isArray(aiBoardMetrics.boards)
        ? aiBoardMetrics.boards.map((board) => ({ ...board }))
        : [],
      previewDebugEvents: Array.isArray(aiBoardMetrics.previewDebugEvents)
        ? aiBoardMetrics.previewDebugEvents.map((event) => ({ ...event }))
        : [],
    };
  };

  namespace.clearArtboardConnections = function clearArtboardConnections() {
    connections = [];
    spaceBoards = [];
    connectionDrag = null;
    spaceBoardDrag = null;
    selectedSpaceBoardId = "";
    lastConnectionsGeometryKey = "";
    aiBoardPreviewDebugEvents = [];
    aiBoardPreviewDebugByBoardId = new Map();
    aiBoardPreviewDebugEventId = 1;
    promptEditState = null;
    clearPromptFocusViewportTimers();
    clearAiImageGenerationPreview();
    removeSpaceBoardDragListeners();
    dismissConnectionMenu({ render: false });
    renderConnectionOverlay();
  };

  document.addEventListener("pointerdown", handleDocumentSpaceBoardSelectionPointerDown, true);
})(window.CBO);
