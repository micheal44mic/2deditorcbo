(function registerAiBoardMediaDebugConsole(namespace) {
  const LAST_SNAPSHOT_STORAGE_KEY = "cbo-ai-board-debug-last-snapshot-v1";
  const ISOLATION_MODES = ["full", "no-edges", "no-bubbles", "no-boards", "no-overlay"];
  const MAX_EVENTS = 180;
  const SLOW_FRAME_MS = 50;
  const SLOW_LONG_TASK_MS = 50;

  const state = {
    container: null,
    eventList: null,
    bareButton: null,
    bareMode: false,
    isolationButton: null,
    isolationMode: "full",
    longTaskCount: 0,
    metrics: {
      frameMs: 0,
      renderBoardsMs: 0,
      metadataMs: 0,
      mediaLoadMs: 0,
    },
    minimized: false,
    nextId: 1,
    rafActive: false,
    rafLastAt: 0,
    rows: [],
    summary: null,
    textRows: [],
  };

  function round(value, digits = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
  }

  function formatTime(date = new Date()) {
    const pad = (value, size = 2) => String(value).padStart(size, "0");

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }

  function getBoards() {
    const boards = namespace.getArtboardConnectionBoards?.();

    return Array.isArray(boards) ? boards : [];
  }

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getCamera() {
    const camera = namespace.brushEngine?.camera || { x: 0, y: 0, zoom: 0 };

    return {
      x: round(camera.x, 2),
      y: round(camera.y, 2),
      zoom: round(camera.zoom, 5),
    };
  }

  function getMediaElementSnapshot() {
    return Array.from(document.querySelectorAll("[data-ai-image-board-media] img, [data-ai-image-board-media] video"))
      .map((node) => {
        const isVideo = node.tagName?.toLowerCase?.() === "video";

        return {
          complete: isVideo ? undefined : Boolean(node.complete),
          currentSrc: node.currentSrc || node.src || "",
          height: isVideo ? round(node.videoHeight || 0, 0) : round(node.naturalHeight || 0, 0),
          kind: isVideo ? "video" : "image",
          networkState: isVideo ? node.networkState : undefined,
          readyState: isVideo ? node.readyState : undefined,
          width: isVideo ? round(node.videoWidth || 0, 0) : round(node.naturalWidth || 0, 0),
        };
      });
  }

  function captureSnapshot() {
    const boards = getBoards();
    const camera = getCamera();
    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const viewScale = Math.max(0.0001, (Number(camera.zoom) || 0) / dpr);
    const mediaBoards = boards.filter((board) => board?.generatedMedia);
    const boardArea = boards.reduce((total, board) => {
      const width = Number(board.width) || 0;
      const height = Number(board.height) || 0;

      return total + Math.max(0, width) * Math.max(0, height);
    }, 0);
    const boardScreenPixels = boardArea * viewScale * viewScale;
    const pixelCount = mediaBoards.reduce((total, board) => {
      const media = board.generatedMedia || {};
      const width = Number(media.width || board.width) || 0;
      const height = Number(media.height || board.height) || 0;

      return total + Math.max(0, width) * Math.max(0, height);
    }, 0);
    const stage = getStage();
    const pane = stage?.querySelector?.("[data-space-board-pane]") || null;
    const mediaElements = getMediaElementSnapshot();

    return {
      actionBubbles: stage?.querySelectorAll?.("[data-artboard-action-bubble]")?.length || 0,
      bareMode: state.bareMode,
      boardAreaDocPx: Math.round(boardArea),
      boardDomNodes: stage?.querySelectorAll?.("[data-ai-image-board]")?.length || 0,
      boardScreenPixels: Math.round(boardScreenPixels),
      boards: boards.length,
      camera,
      connectionPaths: stage?.querySelectorAll?.("[data-artboard-connection-layer] path.editor-artboard-connection-path")?.length || 0,
      dpr: round(dpr, 2),
      generatedBoards: mediaBoards.length,
      heavyBoards: stage?.querySelectorAll?.("[data-ai-image-board][data-ai-image-board-heavy-mounted='true']")?.length || 0,
      imageNodes: mediaElements.filter((entry) => entry.kind === "image").length,
      isolationMode: state.isolationMode,
      loadingBoards: document.querySelectorAll(".editor-ai-image-board.is-generating").length,
      longTasks: state.longTaskCount,
      mediaDecodedMB: round((pixelCount * 4) / 1048576, 1),
      mediaElements,
      mediaPixels: Math.round(pixelCount),
      paneCount: stage?.querySelectorAll?.("[data-space-board-pane]")?.length || 0,
      paneIsTransforming: Boolean(pane?.classList?.contains("is-transforming")),
      paneTransform: pane?.style?.transform || "",
      stageChildren: stage?.children?.length || 0,
      touchGuardActive: Boolean(namespace.isTouchNavigationGuardActive?.()),
      touchGuardClass: Boolean(document.body?.classList?.contains("cbo-touch-navigation-guard")),
      touchNavigationActive: Boolean(namespace.isTouchNavigationExclusive?.()),
      ua: navigator.userAgent || "",
      videoNodes: mediaElements.filter((entry) => entry.kind === "video").length,
      viewport: {
        h: Math.round(window.innerHeight || 0),
        w: Math.round(window.innerWidth || 0),
      },
    };
  }

  function formatValue(value) {
    if (value == null) {
      return "";
    }

    if (typeof value === "number") {
      return `${round(value, 2)}`;
    }

    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }

    return String(value);
  }

  function formatDetail(detail = {}) {
    const preferredKeys = [
      "durationMs",
      "boardId",
      "runId",
      "kind",
      "name",
      "src",
      "width",
      "height",
      "pixelMB",
      "boards",
      "generatedBoards",
      "boardDomNodes",
      "connectionPaths",
      "heavyBoards",
      "paneCount",
      "paneIsTransforming",
      "touchGuardActive",
      "touchNavigationActive",
      "isolationMode",
      "bareMode",
      "imageNodes",
      "videoNodes",
      "loadingBoards",
      "frameMs",
      "readyState",
      "networkState",
      "message",
    ];
    const keys = [
      ...preferredKeys.filter((key) => Object.prototype.hasOwnProperty.call(detail, key)),
      ...Object.keys(detail).filter((key) => !preferredKeys.includes(key)),
    ];

    return keys
      .map((key) => {
        const value = formatValue(detail[key]);

        return value ? `${key}=${value}` : "";
      })
      .filter(Boolean)
      .join(" | ");
  }

  function ensureStyles() {
    if (document.getElementById("cbo-ai-board-media-debug-style")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "cbo-ai-board-media-debug-style";
    style.textContent = `
      .cbo-ai-board-media-debug {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: 16px;
        z-index: 2147483000;
        max-height: 42vh;
        border: 1px solid rgba(255, 255, 255, 0.34);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.86);
        color: #ecf9ff;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
        font: 13px/1.32 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        overflow: hidden;
        pointer-events: auto;
        touch-action: manipulation;
      }

      .cbo-ai-board-media-debug.is-minimized .cbo-ai-board-media-debug-body {
        display: none;
      }

      .cbo-ai-board-media-debug-header {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 46px;
        padding: 8px 13px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.14);
      }

      .cbo-ai-board-media-debug-title {
        flex: 1 1 auto;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0;
      }

      .cbo-ai-board-media-debug button {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.32);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.13);
        color: #fff;
        font: inherit;
        padding: 7px 10px;
      }

      .cbo-ai-board-media-debug button.is-active {
        border-color: rgba(111, 220, 255, 0.86);
        background: rgba(27, 157, 210, 0.34);
      }

      .cbo-ai-board-media-debug button.is-warning {
        border-color: rgba(255, 213, 111, 0.88);
        background: rgba(184, 121, 18, 0.34);
      }

      .cbo-ai-board-media-debug-summary {
        padding: 10px 13px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: #b9e9ff;
        white-space: pre-wrap;
      }

      .cbo-ai-board-media-debug-list {
        max-height: calc(42vh - 104px);
        overflow: auto;
        padding: 8px 13px 12px;
        -webkit-overflow-scrolling: touch;
      }

      .cbo-ai-board-media-debug-row {
        margin: 0 0 7px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .cbo-ai-board-media-debug-row.is-warn {
        color: #ffd56f;
        font-weight: 700;
      }

      body.cbo-ai-board-bare-debug .editor-space-board-pane {
        will-change: transform !important;
      }

      body.cbo-ai-board-bare-debug .editor-ai-image-board {
        contain: layout style !important;
      }

      body.cbo-ai-board-bare-debug .editor-ai-image-board::before,
      body.cbo-ai-board-bare-debug .editor-ai-image-board::after,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-loading,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-footer,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-prompt-title,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-media,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-input,
      body.cbo-ai-board-bare-debug .editor-ai-image-board-generate {
        display: none !important;
      }

      body.cbo-ai-board-bare-debug .editor-ai-image-board-surface {
        border: 4px solid #f05023 !important;
        border-radius: 0 !important;
        background: rgba(255, 255, 255, 0.92) !important;
        box-shadow: none !important;
      }

      body.cbo-ai-board-isolate-no-edges .editor-artboard-connection-layer {
        display: none !important;
      }

      body.cbo-ai-board-isolate-no-bubbles .editor-artboard-action-bubble {
        display: none !important;
      }

      body.cbo-ai-board-isolate-no-boards .editor-ai-image-board {
        display: none !important;
      }

      body.cbo-ai-board-isolate-no-overlay .editor-space-board-layer {
        display: none !important;
      }

      @media (max-width: 700px) {
        .cbo-ai-board-media-debug {
          left: 9px;
          right: 9px;
          bottom: 12px;
          max-height: 40vh;
          font-size: 12px;
        }

        .cbo-ai-board-media-debug-list {
          max-height: calc(40vh - 104px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (state.container || !document.body) {
      return state.container;
    }

    ensureStyles();

    const container = document.createElement("section");
    const header = document.createElement("div");
    const title = document.createElement("div");
    const minButton = document.createElement("button");
    const bareButton = document.createElement("button");
    const isolationButton = document.createElement("button");
    const copyButton = document.createElement("button");
    const clearButton = document.createElement("button");
    const body = document.createElement("div");
    const summary = document.createElement("div");
    const list = document.createElement("div");

    container.className = "cbo-ai-board-media-debug";
    header.className = "cbo-ai-board-media-debug-header";
    title.className = "cbo-ai-board-media-debug-title";
    body.className = "cbo-ai-board-media-debug-body";
    summary.className = "cbo-ai-board-media-debug-summary";
    list.className = "cbo-ai-board-media-debug-list";

    title.textContent = "AI BOARD DEBUG ON";
    minButton.type = "button";
    minButton.textContent = "min";
    bareButton.type = "button";
    bareButton.textContent = "bare";
    isolationButton.type = "button";
    isolationButton.textContent = "iso:full";
    copyButton.type = "button";
    copyButton.textContent = "copy";
    clearButton.type = "button";
    clearButton.textContent = "clear";

    minButton.addEventListener("click", () => {
      state.minimized = !state.minimized;
      container.classList.toggle("is-minimized", state.minimized);
      minButton.textContent = state.minimized ? "show" : "min";
    });
    bareButton.addEventListener("click", () => setBareMode(!state.bareMode));
    isolationButton.addEventListener("click", cycleIsolationMode);
    copyButton.addEventListener("click", () => copyDebugText(copyButton));
    clearButton.addEventListener("click", clear);

    header.append(title, minButton, bareButton, isolationButton, copyButton, clearButton);
    body.append(summary, list);
    container.append(header, body);
    document.body.appendChild(container);

    state.container = container;
    state.bareButton = bareButton;
    state.isolationButton = isolationButton;
    state.summary = summary;
    state.eventList = list;

    setBareMode(state.bareMode, { silent: true });
    setIsolationMode(state.isolationMode, { silent: true });
    updateSummary(captureSnapshot());

    return container;
  }

  function setBareMode(enabled, options = {}) {
    state.bareMode = Boolean(enabled);
    document.body?.classList.toggle("cbo-ai-board-bare-debug", state.bareMode);

    if (state.bareButton) {
      state.bareButton.classList.toggle("is-active", state.bareMode);
      state.bareButton.textContent = state.bareMode ? "full" : "bare";
    }

    updateSummary(captureSnapshot());

    if (options.silent !== true) {
      log(state.bareMode ? "bare-mode-on" : "bare-mode-off", {
        mode: state.bareMode ? "bare" : "full",
      });
    }
  }

  function setIsolationMode(mode, options = {}) {
    const nextMode = ISOLATION_MODES.includes(mode) ? mode : "full";

    state.isolationMode = nextMode;

    ISOLATION_MODES.forEach((candidate) => {
      document.body?.classList.toggle(`cbo-ai-board-isolate-${candidate}`, candidate !== "full" && candidate === nextMode);
    });

    if (state.isolationButton) {
      state.isolationButton.textContent = `iso:${nextMode}`;
      state.isolationButton.classList.toggle("is-warning", nextMode !== "full");
    }

    updateSummary(captureSnapshot());

    if (options.silent !== true) {
      log("isolation-mode", {
        mode: nextMode,
      });
    }
  }

  function cycleIsolationMode() {
    const currentIndex = Math.max(0, ISOLATION_MODES.indexOf(state.isolationMode));
    const nextMode = ISOLATION_MODES[(currentIndex + 1) % ISOLATION_MODES.length];

    setIsolationMode(nextMode);
  }

  function updateSummary(snapshot = captureSnapshot()) {
    ensurePanel();

    if (!state.summary) {
      return;
    }

    state.summary.textContent = [
      `z=${snapshot.camera.zoom}`,
      `cam=${snapshot.camera.x},${snapshot.camera.y}`,
      `boards=${snapshot.boards}`,
      `dom=${snapshot.boardDomNodes}`,
      `paths=${snapshot.connectionPaths}`,
      `heavy=${snapshot.heavyBoards}`,
      `pane=${snapshot.paneCount}`,
      `moving=${snapshot.paneIsTransforming ? 1 : 0}`,
      `touchGuard=${snapshot.touchGuardActive ? 1 : 0}`,
      `touchNav=${snapshot.touchNavigationActive ? 1 : 0}`,
      `iso=${snapshot.isolationMode}`,
      `bare=${snapshot.bareMode ? 1 : 0}`,
      `boardArea=${snapshot.boardAreaDocPx}`,
      `screenPx=${snapshot.boardScreenPixels}`,
      `generated=${snapshot.generatedBoards}`,
      `loading=${snapshot.loadingBoards}`,
      `img=${snapshot.imageNodes}`,
      `vid=${snapshot.videoNodes}`,
      `px=${snapshot.mediaPixels}`,
      `est=${snapshot.mediaDecodedMB}MB`,
      `frame=${round(state.metrics.frameMs, 1)}ms`,
      `metadata=${round(state.metrics.metadataMs, 1)}ms`,
      `mediaLoad=${round(state.metrics.mediaLoadMs, 1)}ms`,
      `render=${round(state.metrics.renderBoardsMs, 1)}ms`,
      `long=${snapshot.longTasks}`,
    ].join(" | ");
  }

  function appendEvent(eventName, detail = {}, options = {}) {
    const snapshot = captureSnapshot();
    const warn = options.warn === true;
    const id = state.nextId++;
    const time = formatTime();
    const prefix = warn ? "!" : "-";
    const detailText = formatDetail(detail);
    const message = `${prefix} ${time} #${id} ${eventName}${detailText ? `: ${detailText}` : ""}`;
    const row = document.createElement("div");

    persistSnapshot(eventName, detail, snapshot);

    row.className = `cbo-ai-board-media-debug-row${warn ? " is-warn" : ""}`;
    row.textContent = message;

    ensurePanel();

    state.rows.push(row);
    state.textRows.push(message);
    state.eventList?.appendChild(row);

    while (state.rows.length > MAX_EVENTS) {
      state.rows.shift()?.remove();
      state.textRows.shift();
    }

    if (state.eventList) {
      state.eventList.scrollTop = state.eventList.scrollHeight;
    }

    updateSummary(snapshot);

    console[warn ? "warn" : "log"]?.("[CBO ai media]", eventName, {
      detail,
      snapshot,
    });
  }

  function log(eventName, detail = {}) {
    appendEvent(eventName, detail, { warn: false });
  }

  function warn(eventName, detail = {}) {
    appendEvent(eventName, detail, { warn: true });
  }

  function recordTiming(eventName, detail = {}, options = {}) {
    const durationMs = Number(detail.durationMs || 0);
    const metric = String(options.metric || "").trim();

    if (metric && Object.prototype.hasOwnProperty.call(state.metrics, metric)) {
      state.metrics[metric] = round(durationMs, 1);
    }

    updateSummary(captureSnapshot());

    const warnAtMs = Number.isFinite(Number(options.warnAtMs)) ? Number(options.warnAtMs) : 16;

    if (durationMs < warnAtMs && options.always !== true) {
      return;
    }

    appendEvent(eventName, {
      ...detail,
      durationMs: round(durationMs, 1),
    }, {
      warn: true,
    });
  }

  function getDebugText() {
    const snapshot = captureSnapshot();
    const header = [
      "AI BOARD DEBUG",
      `copiedAt=${new Date().toISOString()}`,
      `ua=${snapshot.ua}`,
      `viewport=${snapshot.viewport.w}x${snapshot.viewport.h}`,
      `dpr=${snapshot.dpr}`,
      `zoom=${snapshot.camera.zoom}`,
      `camera=${snapshot.camera.x},${snapshot.camera.y}`,
      `boards=${snapshot.boards}`,
      `boardDomNodes=${snapshot.boardDomNodes}`,
      `connectionPaths=${snapshot.connectionPaths}`,
      `heavyBoards=${snapshot.heavyBoards}`,
      `paneCount=${snapshot.paneCount}`,
      `paneIsTransforming=${snapshot.paneIsTransforming ? 1 : 0}`,
      `paneTransform=${snapshot.paneTransform}`,
      `touchGuardActive=${snapshot.touchGuardActive ? 1 : 0}`,
      `touchGuardClass=${snapshot.touchGuardClass ? 1 : 0}`,
      `touchNavigationActive=${snapshot.touchNavigationActive ? 1 : 0}`,
      `actionBubbles=${snapshot.actionBubbles}`,
      `isolationMode=${snapshot.isolationMode}`,
      `bareMode=${snapshot.bareMode ? 1 : 0}`,
      `boardAreaDocPx=${snapshot.boardAreaDocPx}`,
      `boardScreenPixels=${snapshot.boardScreenPixels}`,
      `generatedBoards=${snapshot.generatedBoards}`,
      `loadingBoards=${snapshot.loadingBoards}`,
      `imageNodes=${snapshot.imageNodes}`,
      `videoNodes=${snapshot.videoNodes}`,
      `mediaPixels=${snapshot.mediaPixels}`,
      `mediaDecodedMB=${snapshot.mediaDecodedMB}`,
      `stageChildren=${snapshot.stageChildren}`,
      `longTasks=${snapshot.longTasks}`,
      `mediaElements=${JSON.stringify(snapshot.mediaElements)}`,
      "",
      state.summary?.textContent || "",
      "",
      "EVENTS",
    ];

    return header.concat(state.textRows).join("\n");
  }

  async function copyDebugText(button = null) {
    const text = getDebugText();
    let copied = false;

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (error) {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      } finally {
        textarea.remove();
      }
    }

    if (button) {
      const previousText = button.textContent;

      button.textContent = copied ? "copied" : "failed";
      window.setTimeout(() => {
        button.textContent = previousText;
      }, 900);
    }

    return copied;
  }

  function clear() {
    state.rows.splice(0).forEach((row) => row.remove());
    state.textRows.length = 0;
    Object.keys(state.metrics).forEach((key) => {
      state.metrics[key] = 0;
    });
    state.longTaskCount = 0;
    updateSummary(captureSnapshot());
  }

  function persistSnapshot(eventName, detail = {}, snapshot = captureSnapshot()) {
    try {
      window.localStorage?.setItem?.(LAST_SNAPSHOT_STORAGE_KEY, JSON.stringify({
        at: new Date().toISOString(),
        detail,
        eventName,
        snapshot,
      }));
    } catch (error) {
      // Storage can be unavailable in private browsing or low-storage states.
    }
  }

  function readPersistedSnapshot() {
    try {
      const raw = window.localStorage?.getItem?.(LAST_SNAPSHOT_STORAGE_KEY);

      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function startRafMonitor() {
    if (state.rafActive) {
      return;
    }

    state.rafActive = true;

    const tick = (timestamp) => {
      if (!state.rafActive) {
        return;
      }

      if (state.rafLastAt) {
        const frameMs = timestamp - state.rafLastAt;

        state.metrics.frameMs = round(frameMs, 1);
        if (frameMs >= SLOW_FRAME_MS) {
          const snapshot = captureSnapshot();

          warn("slow-raf", {
            boards: snapshot.boards,
            boardDomNodes: snapshot.boardDomNodes,
            boardScreenPixels: snapshot.boardScreenPixels,
            connectionPaths: snapshot.connectionPaths,
            generatedBoards: snapshot.generatedBoards,
            heavyBoards: snapshot.heavyBoards,
            imageNodes: snapshot.imageNodes,
            loadingBoards: snapshot.loadingBoards,
            mediaDecodedMB: snapshot.mediaDecodedMB,
            paneCount: snapshot.paneCount,
            paneIsTransforming: snapshot.paneIsTransforming,
            videoNodes: snapshot.videoNodes,
            frameMs: round(frameMs, 1),
          });
        }
      }

      state.rafLastAt = timestamp;
      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  }

  function startLongTaskMonitor() {
    if (typeof PerformanceObserver !== "function") {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration) || 0;

          if (duration < SLOW_LONG_TASK_MS) {
            continue;
          }

          state.longTaskCount += 1;
          warn("long-task", {
            durationMs: round(duration, 1),
            name: entry.name || "task",
          });
        }
      });

      observer.observe({ entryTypes: ["longtask"] });
    } catch (error) {
      // Long task observer is not available on every mobile browser.
    }
  }

  window.addEventListener("error", (event) => {
    warn("window-error", {
      message: event.message || "error",
      source: event.filename || "",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    warn("unhandled-rejection", {
      message: event.reason?.message || String(event.reason || "rejection"),
    });
  });

  namespace.AiBoardMediaDebug = {
    captureSnapshot,
    clear,
    copy: copyDebugText,
    log,
    recordTiming,
    setBareMode,
    setIsolationMode,
    show: ensurePanel,
    toggleIsolationMode: cycleIsolationMode,
    toggleBareMode: () => setBareMode(!state.bareMode),
    warn,
  };

  function logPreviousSessionSnapshot() {
    const previous = readPersistedSnapshot();

    if (!previous?.snapshot) {
      return;
    }

    log("previous-session", {
      at: previous.at || "",
      boards: previous.snapshot.boards,
      eventName: previous.eventName || "",
      heavyBoards: previous.snapshot.heavyBoards,
      isolationMode: previous.snapshot.isolationMode,
      paneCount: previous.snapshot.paneCount,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      logPreviousSessionSnapshot();
      log("debug-console-ready", { message: "temporary ai media debug enabled" });
      startRafMonitor();
      startLongTaskMonitor();
    }, { once: true });
  } else {
    logPreviousSessionSnapshot();
    log("debug-console-ready", { message: "temporary ai media debug enabled" });
    startRafMonitor();
    startLongTaskMonitor();
  }
})(window.CBO = window.CBO || {});
