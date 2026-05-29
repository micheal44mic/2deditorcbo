window.CBO = window.CBO || {};

(function registerAiBoardVideoDebugConsole(namespace) {
  const REFRESH_MS = 700;
  const MAX_RENDERED_EVENTS = 18;
  const MAX_COPIED_EVENTS = 80;
  const DARK_LUMA_THRESHOLD = 24;

  const state = {
    body: null,
    collapsed: false,
    copyButton: null,
    lastPayload: null,
    root: null,
    status: null,
    timer: 0,
  };

  function roundMetric(value, digits = 3) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const factor = 10 ** Math.max(0, digits);

    return Math.round(number * factor) / factor;
  }

  function summarizeSrc(src) {
    const value = String(src || "").trim();

    if (!value) {
      return "";
    }

    if (value.startsWith("data:")) {
      const type = value.slice(0, Math.min(value.indexOf(";"), 48));

      return `${type || "data-url"};length=${value.length}`;
    }

    if (value.length <= 180) {
      return value;
    }

    return `${value.slice(0, 92)}...${value.slice(-64)} (length=${value.length})`;
  }

  function getElementRect(element) {
    const rect = element?.getBoundingClientRect?.();

    if (!rect) {
      return null;
    }

    return {
      height: roundMetric(rect.height, 2),
      left: roundMetric(rect.left, 2),
      top: roundMetric(rect.top, 2),
      width: roundMetric(rect.width, 2),
    };
  }

  function getElementStyleState(element) {
    const style = element ? window.getComputedStyle?.(element) : null;

    return style ? {
      display: style.display || "",
      opacity: style.opacity || "",
      visibility: style.visibility || "",
      zIndex: style.zIndex || "",
    } : null;
  }

  function readDataset(element) {
    if (!element?.dataset) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(element.dataset)
        .filter(([key]) => (
          key.startsWith("media") ||
          key.startsWith("aiImageBoard") ||
          key === "boardId"
        ))
        .map(([key, value]) => [key, summarizeSrc(value)]),
    );
  }

  function probeDrawablePixels(drawable) {
    const sourceWidth = Number(drawable?.videoWidth || drawable?.naturalWidth || drawable?.width) || 0;
    const sourceHeight = Number(drawable?.videoHeight || drawable?.naturalHeight || drawable?.height) || 0;

    if (!drawable || sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const probeSize = 32;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return { ok: false, error: "missing-2d-context" };
    }

    canvas.width = probeSize;
    canvas.height = probeSize;

    try {
      context.drawImage(drawable, 0, 0, probeSize, probeSize);

      const data = context.getImageData(0, 0, probeSize, probeSize).data;
      const total = probeSize * probeSize;
      let alphaPixels = 0;
      let darkPixels = 0;
      let lumaMax = 0;
      let lumaMin = 255;
      let lumaSum = 0;

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
        lumaSum += luma;
        lumaMin = Math.min(lumaMin, luma);
        lumaMax = Math.max(lumaMax, luma);

        if (luma < DARK_LUMA_THRESHOLD) {
          darkPixels += 1;
        }
      }

      const alphaRatio = alphaPixels / total;
      const lumaAvg = alphaPixels > 0 ? lumaSum / alphaPixels : 0;
      const lumaRange = alphaPixels > 0 ? lumaMax - lumaMin : 0;
      const darkRatio = alphaPixels > 0 ? darkPixels / alphaPixels : 0;

      return {
        alphaRatio: roundMetric(alphaRatio, 4),
        darkRatio: roundMetric(darkRatio, 4),
        lumaAvg: roundMetric(lumaAvg, 2),
        lumaRange: roundMetric(lumaRange, 2),
        mostlyDark: alphaRatio > 0.1 && (lumaAvg < DARK_LUMA_THRESHOLD || darkRatio > 0.92),
        ok: true,
      };
    } catch (error) {
      return {
        error: error?.message || String(error || "probe-error"),
        ok: false,
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  function readVideoState(video) {
    if (!video) {
      return null;
    }

    return {
      autoplay: Boolean(video.autoplay),
      currentSrc: summarizeSrc(video.currentSrc || ""),
      currentTime: roundMetric(video.currentTime || 0, 3),
      duration: Number.isFinite(Number(video.duration)) ? roundMetric(video.duration, 3) : null,
      ended: Boolean(video.ended),
      error: video.error ? {
        code: Number(video.error.code) || 0,
        message: video.error.message || "",
      } : null,
      muted: Boolean(video.muted),
      networkState: Number(video.networkState) || 0,
      paused: Boolean(video.paused),
      playedRanges: video.played ? Number(video.played.length) || 0 : 0,
      playsInline: Boolean(video.playsInline),
      poster: summarizeSrc(video.poster || ""),
      preload: video.preload || "",
      probe: probeDrawablePixels(video),
      readyState: Number(video.readyState) || 0,
      rect: getElementRect(video),
      src: summarizeSrc(video.getAttribute("src") || video.src || ""),
      style: getElementStyleState(video),
      videoHeight: Number(video.videoHeight) || 0,
      videoWidth: Number(video.videoWidth) || 0,
    };
  }

  function readPosterState(poster) {
    if (!poster) {
      return null;
    }

    return {
      complete: Boolean(poster.complete),
      currentSrc: summarizeSrc(poster.currentSrc || ""),
      naturalHeight: Number(poster.naturalHeight) || 0,
      naturalWidth: Number(poster.naturalWidth) || 0,
      probe: probeDrawablePixels(poster),
      rect: getElementRect(poster),
      src: summarizeSrc(poster.getAttribute("src") || poster.src || ""),
      style: getElementStyleState(poster),
    };
  }

  function getMetricByBoardId(metrics) {
    const map = new Map();

    (metrics?.boards || []).forEach((board) => {
      const boardId = String(board?.id || "").trim();

      if (boardId) {
        map.set(boardId, board);
      }
    });

    return map;
  }

  function collectAiVideoDomBoards(metrics) {
    const metricByBoardId = getMetricByBoardId(metrics);

    return Array.from(document.querySelectorAll("[data-ai-image-board]"))
      .map((element) => {
        const boardId = String(element.dataset.boardId || "").trim();
        const mediaHost = element.querySelector("[data-ai-image-board-media]");
        const video = mediaHost?.querySelector?.("[data-ai-image-board-video]");
        const poster = mediaHost?.querySelector?.("[data-ai-image-board-video-poster]");
        const metric = metricByBoardId.get(boardId) || null;
        const isVideo = Boolean(
          video ||
          poster ||
          mediaHost?.classList?.contains("is-video-preview") ||
          metric?.mediaKind === "video" ||
          mediaHost?.dataset?.mediaKind === "video",
        );

        if (!isVideo) {
          return null;
        }

        const label = element.querySelector("[data-ai-image-board-drag-handle]");

        return {
          boardClassName: element.className || "",
          boardDataset: readDataset(element),
          boardId,
          boardRect: getElementRect(element),
          diagnosis: metric?.previewDebug?.diagnosis || "",
          mediaHostClassName: mediaHost?.className || "",
          mediaHostDataset: readDataset(mediaHost),
          mediaHostRect: getElementRect(mediaHost),
          mediaHostStyle: getElementStyleState(mediaHost),
          metric: metric ? {
            activePreview: Boolean(metric.activePreview),
            currentLod: metric.currentLod || "",
            estimatedDecodedMB: metric.estimatedDecodedMB || 0,
            generated: Boolean(metric.generated),
            generationStatus: metric.generationStatus || "",
            mediaKind: metric.mediaKind || "",
            previewDeferred: Boolean(metric.previewDeferred),
            previewSource: metric.previewSource || "",
            previewSrc: summarizeSrc(metric.previewSrc || ""),
            recommendedLod: metric.recommendedLod || "",
            screenHeight: metric.screenHeight || 0,
            screenWidth: metric.screenWidth || 0,
            visibility: metric.visibility || "",
          } : null,
          name: String(metric?.name || label?.textContent || "AI video board").trim(),
          poster: readPosterState(poster),
          video: readVideoState(video),
        };
      })
      .filter(Boolean);
  }

  function collectAiVideoDebugPayload() {
    const metrics = namespace.getAiBoardMetrics?.() || namespace.aiBoardMetrics || {};
    const events = Array.isArray(metrics.previewDebugEvents) ? metrics.previewDebugEvents : [];
    const videoBoards = collectAiVideoDomBoards(metrics);

    return {
      copiedAt: new Date().toISOString(),
      events: events.slice(-MAX_COPIED_EVENTS),
      metrics: {
        activePreviewCount: metrics.activePreviewCount || 0,
        cameraMoving: Boolean(metrics.cameraMoving),
        deferredPreviewBoards: metrics.deferredPreviewBoards || 0,
        dpr: metrics.dpr || window.devicePixelRatio || 1,
        frameMs: metrics.frameMs || 0,
        renderedAiBoards: metrics.renderedAiBoards || 0,
        runtimePosterCacheCount: metrics.runtimePosterCacheCount || 0,
        runtimePosterLoadingCount: metrics.runtimePosterLoadingCount || 0,
        runtimePreviewCacheCount: metrics.runtimePreviewCacheCount || 0,
        runtimePreviewLoadingCount: metrics.runtimePreviewLoadingCount || 0,
        updatedAt: metrics.updatedAt || "",
        visibleAiBoards: metrics.visibleAiBoards || 0,
        zoom: metrics.zoom || 1,
      },
      url: location.href,
      userAgent: navigator.userAgent,
      videoBoards,
      viewport: {
        devicePixelRatio: window.devicePixelRatio || 1,
        height: window.innerHeight || 0,
        width: window.innerWidth || 0,
      },
    };
  }

  function createButton(label, className) {
    const button = document.createElement("button");

    button.className = className;
    button.type = "button";
    button.textContent = label;

    return button;
  }

  function createField(label, value) {
    const field = document.createElement("div");
    const name = document.createElement("span");
    const text = document.createElement("strong");

    field.className = "editor-ai-video-debug-field";
    name.textContent = label;
    text.textContent = value;
    field.append(name, text);

    return field;
  }

  function formatProbe(probe) {
    if (!probe) {
      return "probe: n/a";
    }

    if (probe.ok === false) {
      return `probe: error ${probe.error || ""}`.trim();
    }

    return `probe: avg ${probe.lumaAvg}, dark ${probe.darkRatio}, darkFrame ${probe.mostlyDark ? "yes" : "no"}`;
  }

  function renderBoardSummary(board) {
    const item = document.createElement("section");
    const title = document.createElement("div");
    const name = document.createElement("strong");
    const id = document.createElement("span");
    const grid = document.createElement("div");

    item.className = "editor-ai-video-debug-board";
    title.className = "editor-ai-video-debug-board-title";
    name.textContent = board.name || "AI video board";
    id.textContent = board.boardId || "no-board-id";
    title.append(name, id);

    grid.className = "editor-ai-video-debug-grid";
    grid.append(
      createField("diagnosis", board.diagnosis || "unknown"),
      createField("render", board.mediaHostDataset.mediaVideoRenderMode || "n/a"),
      createField("preview", board.metric?.previewSource || board.mediaHostDataset.mediaPreviewSource || "n/a"),
      createField("poster", board.mediaHostDataset.mediaPosterSrc ? "yes" : "no"),
      createField("video", board.video ? `ready ${board.video.readyState}, paused ${board.video.paused ? "yes" : "no"}, t ${board.video.currentTime}` : "not mounted"),
      createField("video pixels", formatProbe(board.video?.probe)),
      createField("poster pixels", formatProbe(board.poster?.probe)),
      createField("src", board.mediaHostDataset.mediaVideoSrc || board.mediaHostDataset.mediaPreviewSrc || board.video?.src || "n/a"),
    );

    item.append(title, grid);

    return item;
  }

  function getEventSummary(event) {
    const detail = event?.detail || {};
    const parts = [
      detail.boardId ? `board=${detail.boardId}` : "",
      detail.status ? `status=${detail.status}` : "",
      detail.lod ? `lod=${detail.lod}` : "",
      detail.posterSource ? `poster=${detail.posterSource}` : "",
      detail.previewSource ? `preview=${detail.previewSource}` : "",
      detail.renderMode ? `render=${detail.renderMode}` : "",
      detail.reason ? `reason=${detail.reason}` : "",
      detail.diagnosis ? `diagnosis=${detail.diagnosis}` : "",
      detail.probe ? `probe=${JSON.stringify(detail.probe)}` : "",
      detail.message ? `message=${detail.message}` : "",
    ].filter(Boolean);

    return parts.join(" | ");
  }

  function renderEvent(event) {
    const row = document.createElement("div");
    const eventName = document.createElement("strong");
    const detail = document.createElement("span");
    const time = document.createElement("time");

    row.className = "editor-ai-video-debug-event";
    eventName.textContent = event?.eventName || "event";
    detail.textContent = getEventSummary(event);
    time.textContent = String(event?.at || "").slice(11, 19);
    row.append(time, eventName, detail);

    return row;
  }

  function renderConsole() {
    if (!state.root || !state.body) {
      return;
    }

    const payload = collectAiVideoDebugPayload();
    const events = payload.events.slice(-MAX_RENDERED_EVENTS).reverse();

    state.lastPayload = payload;
    state.status.textContent = `${payload.videoBoards.length} video board${payload.videoBoards.length === 1 ? "" : "s"} | ${payload.events.length} events`;

    state.body.replaceChildren();

    if (payload.videoBoards.length === 0) {
      const empty = document.createElement("div");

      empty.className = "editor-ai-video-debug-empty";
      empty.textContent = "No AI video boards visible yet.";
      state.body.append(empty);
    } else {
      payload.videoBoards.forEach((board) => {
        state.body.append(renderBoardSummary(board));
      });
    }

    const eventsTitle = document.createElement("div");
    const eventsList = document.createElement("div");

    eventsTitle.className = "editor-ai-video-debug-section-title";
    eventsTitle.textContent = "Recent preview events";
    eventsList.className = "editor-ai-video-debug-events";
    events.forEach((event) => {
      eventsList.append(renderEvent(event));
    });

    if (events.length === 0) {
      const empty = document.createElement("div");

      empty.className = "editor-ai-video-debug-empty";
      empty.textContent = "No preview events yet.";
      eventsList.append(empty);
    }

    state.body.append(eventsTitle, eventsList);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
      return Promise.resolve();
    } finally {
      textarea.remove();
    }
  }

  function copyDebugPayload() {
    const payload = collectAiVideoDebugPayload();
    const text = JSON.stringify(payload, null, 2);
    const copyPromise = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
      : fallbackCopy(text);

    state.lastPayload = payload;
    state.copyButton.disabled = true;
    state.copyButton.textContent = "Copying";

    copyPromise
      .then(() => {
        state.copyButton.textContent = "Copied";
      })
      .catch(() => {
        state.copyButton.textContent = "Copy failed";
      })
      .finally(() => {
        window.setTimeout(() => {
          state.copyButton.disabled = false;
          state.copyButton.textContent = "Copy";
        }, 1200);
      });
  }

  function setCollapsed(collapsed) {
    state.collapsed = Boolean(collapsed);
    state.root?.classList.toggle("is-collapsed", state.collapsed);
  }

  function createConsole() {
    if (state.root) {
      return state.root;
    }

    const root = document.createElement("aside");
    const header = document.createElement("header");
    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");
    const actions = document.createElement("div");
    const refreshButton = createButton("Refresh", "editor-ai-video-debug-button");
    const copyButton = createButton("Copy", "editor-ai-video-debug-button is-primary");
    const collapseButton = createButton("Min", "editor-ai-video-debug-button");
    const body = document.createElement("div");

    root.className = "editor-ai-video-debug-console";
    root.dataset.aiVideoDebugConsole = "";
    root.setAttribute("aria-live", "polite");

    header.className = "editor-ai-video-debug-header";
    titleWrap.className = "editor-ai-video-debug-title";
    title.textContent = "AI Video Debug";
    status.textContent = "Waiting for metrics";
    titleWrap.append(title, status);

    actions.className = "editor-ai-video-debug-actions";
    refreshButton.addEventListener("click", renderConsole);
    copyButton.addEventListener("click", copyDebugPayload);
    collapseButton.addEventListener("click", () => {
      setCollapsed(!state.collapsed);
      collapseButton.textContent = state.collapsed ? "Open" : "Min";
    });
    actions.append(refreshButton, copyButton, collapseButton);

    body.className = "editor-ai-video-debug-body";
    header.append(titleWrap, actions);
    root.append(header, body);
    document.body.append(root);

    state.body = body;
    state.copyButton = copyButton;
    state.root = root;
    state.status = status;

    return root;
  }

  function startConsole() {
    createConsole();
    renderConsole();

    if (!state.timer) {
      state.timer = window.setInterval(renderConsole, REFRESH_MS);
    }
  }

  function stopConsole() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = 0;
    }

    state.root?.remove();
    state.body = null;
    state.copyButton = null;
    state.root = null;
    state.status = null;
  }

  namespace.collectAiVideoDebugPayload = collectAiVideoDebugPayload;
  namespace.copyAiVideoDebugPayload = copyDebugPayload;
  namespace.openAiVideoDebugConsole = startConsole;
  namespace.closeAiVideoDebugConsole = stopConsole;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startConsole, { once: true });
  } else {
    startConsole();
  }
})(window.CBO);
