window.CBO = window.CBO || {};



(function registerAiBoardGenerationJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before ai-board-generation.js.");

  }



  Controller.prototype.getAiImageGenerationStatus = function getAiImageGenerationStatus(boardId) {
    with (this) {

    return aiImageGenerationStatusByBoardId.get(String(boardId || "").trim()) || null;
    }
  };

  Controller.prototype.getLastAiImageGenerationStatus = function getLastAiImageGenerationStatus() {
    with (this) {

    return Array.from(aiImageGenerationStatusByBoardId.values())
      .sort((first, second) => String(second.at || "").localeCompare(String(first.at || "")))[0] || null;
    }
  };

  Controller.prototype.formatAiImageGenerationStatus = function formatAiImageGenerationStatus(record) {
    with (this) {

    if (!record) {
      return "";
    }

    const boardId = getShortAiBoardId(record.boardId);
    const status = String(record.status || "unknown");
    const sample = record.sampleName ? `:${record.sampleName}` : "";
    const message = record.message ? `:${record.message}` : "";

    return `${boardId}:${status}${sample}${message}`;
    }
  };

  Controller.prototype.shouldHandleAiImageGenerateActivation = function shouldHandleAiImageGenerateActivation(event, boardId) {
    with (this) {

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
  };

  Controller.prototype.handleSpaceBoardWheel = function handleSpaceBoardWheel(event) {
    with (this) {

    const brushEngine = getBrushEngine();

    if (!brushEngine?.handleWheel) {
      return;
    }

    event.stopPropagation();
    brushEngine.handleWheel.call(brushEngine, event);
    }
  };

  Controller.prototype.requestAiImageBoardGeneration = function requestAiImageBoardGeneration(boardId, triggerSource = "ai-image-board") {
    with (this) {

    const board = getSpaceBoardById(boardId);

    if (!board) {
      return false;
    }

    setAiImageBoardPromptText(board, getAiImageBoardPromptText(board), { force: true });
    startAiImageGenerationPreview(board.id);
    window.dispatchEvent(new CustomEvent("cbo:ai-image-board-generate-click", {
      detail: {
        board: cloneSpaceBoard(board),
        source: "artboard-connections",
        triggerSource,
      },
    }));

    return true;
    }
  };

  Controller.prototype.handleAiImageGenerateClick = function handleAiImageGenerateClick(event) {
    with (this) {

    const board = getBoardFromControlEvent(event);

    event.preventDefault();
    event.stopPropagation();

    if (!board || !shouldHandleAiImageGenerateActivation(event, board.id)) {
      return;
    }

    requestAiImageBoardGeneration(board.id, "ai-image-board");
    }
  };

  Controller.prototype.pickRandomAiImageSample = function pickRandomAiImageSample(currentSrc = "") {
    with (this) {

    const candidates = getAiImageSampleCandidates(currentSrc, "image");

    return candidates[0] || null;
    }
  };

  Controller.prototype.getAiImageSampleCandidates = function getAiImageSampleCandidates(currentSrc = "", preferredKind = "image") {
    with (this) {

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
  };

  Controller.prototype.loadFirstAvailableAiImageSampleMetadata = function loadFirstAvailableAiImageSampleMetadata(samples) {
    with (this) {

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
  };

  Controller.prototype.loadAiImageSampleMetadata = function loadAiImageSampleMetadata(sample) {
    with (this) {

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
  };

  Controller.prototype.applyAiImageSampleToBoard = function applyAiImageSampleToBoard(boardId, sample) {
    with (this) {

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
  };

  Controller.prototype.completeAiImageSampleGeneration = function completeAiImageSampleGeneration(boardId, runId) {
    with (this) {

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
  };

  Controller.prototype.getBoardFromControlEvent = function getBoardFromControlEvent(event) {
    with (this) {

    const boardId = String(event.currentTarget?.closest?.("[data-ai-image-board]")?.dataset?.boardId || "").trim();

    return getSpaceBoardById(boardId);
    }
  };

  Controller.prototype.startAiImageGenerationPreview = function startAiImageGenerationPreview(boardId) {
    with (this) {

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
    const delayMs = getAiImageGenerationPreviewDelayMs();

    setAiImageGenerationStatus(normalizedBoardId, "loading", { delayMs, runId });
    recordAiBoardPreviewDebugEvent("generation-shimmer-start", {
      boardId: normalizedBoardId,
      delayMs,
      runId,
    });
    renderSpaceBoards();

    const timerId = window.setTimeout(() => {
      completeAiImageSampleGeneration(normalizedBoardId, runId);
    }, delayMs);

    aiImageGenerationPreviewTimers.set(normalizedBoardId, timerId);

    return true;
    }
  };

  Controller.prototype.getAiImageGenerationPreviewDelayMs = function getAiImageGenerationPreviewDelayMs() {
    with (this) {

    const min = Math.max(0, Number(AI_IMAGE_GENERATION_PREVIEW_MIN_MS) || 0);
    const max = Math.max(min, Number(AI_IMAGE_GENERATION_PREVIEW_MAX_MS) || min);

    return Math.round(min + Math.random() * (max - min));
    }
  };

  Controller.prototype.clearAiImageGenerationPreview = function clearAiImageGenerationPreview(boardId = "") {
    with (this) {

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
  };

})(window.CBO);

