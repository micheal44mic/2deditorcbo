window.CBO = window.CBO || {};

(function registerMobileBrushDebug(namespace) {
  const maxLines = 900;
  const lines = [];
  const pageStartMs = performance?.now?.() || Date.now();
  let sequence = 0;
  let activeSessionId = 0;
  let copyButton = null;
  let copyButtonTimer = 0;

  function now() {
    return performance?.now?.() || Date.now();
  }

  function roundMs(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function getDeviceSnapshot() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    const viewport = window.visualViewport || {};

    return {
      deviceMemory: navigator.deviceMemory ?? null,
      dpr: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      networkDownlink: connection.downlink ?? null,
      networkEffectiveType: connection.effectiveType || null,
      platform: navigator.platform || "",
      userAgent: navigator.userAgent || "",
      visualViewportHeight: viewport.height ?? null,
      visualViewportScale: viewport.scale ?? null,
      visualViewportWidth: viewport.width ?? null,
    };
  }

  function sanitizeDetail(value, depth = 0) {
    if (value == null || typeof value === "boolean" || typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return value.length > 420 ? `${value.slice(0, 180)}...${value.slice(-120)}` : value;
    }

    if (depth > 3) {
      return "[depth-limit]";
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => sanitizeDetail(item, depth + 1));
    }

    if (value instanceof Element) {
      return {
        className: value.className || "",
        id: value.id || "",
        tagName: value.tagName,
      };
    }

    if (typeof value === "object") {
      const output = {};

      Object.keys(value).slice(0, 40).forEach((key) => {
        output[key] = sanitizeDetail(value[key], depth + 1);
      });

      return output;
    }

    return String(value);
  }

  function pushLine(level, eventName, detail = {}) {
    sequence += 1;

    const entry = {
      at: new Date().toISOString(),
      detail: sanitizeDetail(detail),
      elapsedMs: roundMs(now() - pageStartMs),
      event: eventName,
      index: sequence,
      level,
    };

    lines.push(entry);

    if (lines.length > maxLines) {
      lines.splice(0, lines.length - maxLines);
    }

    return entry;
  }

  function trace(eventName, detail = {}) {
    return pushLine("trace", eventName, detail);
  }

  function startSession(name, detail = {}) {
    activeSessionId += 1;
    pushLine("session", `${name}.start`, {
      ...detail,
      device: getDeviceSnapshot(),
      sessionId: activeSessionId,
    });

    return activeSessionId;
  }

  function endSession(name, sessionId, detail = {}) {
    pushLine("session", `${name}.end`, {
      ...detail,
      sessionId: sessionId || activeSessionId,
    });
  }

  function formatLine(entry) {
    const index = String(entry.index).padStart(4, "0");
    const elapsed = `+${entry.elapsedMs.toFixed(1)}ms`.padEnd(10, " ");
    const detailText = Object.keys(entry.detail || {}).length > 0
      ? ` ${JSON.stringify(entry.detail)}`
      : "";

    return `${index} ${elapsed} ${entry.at} [${entry.level}] ${entry.event}${detailText}`;
  }

  function createReport() {
    return [
      "CBO MOBILE BRUSH DEBUG",
      `generatedAt=${new Date().toISOString()}`,
      `sessionId=${activeSessionId}`,
      `lineCount=${lines.length}`,
      `device=${JSON.stringify(getDeviceSnapshot())}`,
      "",
      ...lines.map(formatLine),
    ].join("\n");
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function setCopyButtonLabel(label) {
    if (!copyButton) {
      return;
    }

    window.clearTimeout(copyButtonTimer);
    copyButton.textContent = label;
    copyButtonTimer = window.setTimeout(() => {
      if (copyButton) {
        copyButton.textContent = "Copy";
      }
    }, 1200);
  }

  async function copyReport() {
    trace("debug-copy.request", {
      lineCount: lines.length,
    });

    try {
      await writeClipboard(createReport());
      setCopyButtonLabel("Copied");
    } catch (error) {
      trace("debug-copy.error", {
        message: error?.message || String(error),
      });
      setCopyButtonLabel("Copy failed");
    }
  }

  function ensureCopyButton() {
    if (copyButton?.isConnected || !document.body) {
      return;
    }

    copyButton = document.createElement("button");
    copyButton.className = "mobile-brush-debug-copy";
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    copyButton.setAttribute("aria-label", "Copy mobile brush debug log");
    copyButton.dataset.mobileBrushDebugCopy = "true";
    copyButton.addEventListener("click", copyReport);
    document.body.append(copyButton);
  }

  function observeLongTasks() {
    if (typeof PerformanceObserver !== "function") {
      trace("main-thread.longtask.unsupported");
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          trace("main-thread.longtask", {
            durationMs: roundMs(entry.duration),
            name: entry.name || "",
            startTimeMs: roundMs(entry.startTime),
          });
        });
      });

      observer.observe({
        buffered: true,
        entryTypes: ["longtask"],
      });
    } catch (error) {
      trace("main-thread.longtask.error", {
        message: error?.message || String(error),
      });
    }
  }

  namespace.MobileBrushDebug = {
    copyReport,
    createReport,
    endSession,
    getDeviceSnapshot,
    now,
    roundMs,
    startSession,
    trace,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureCopyButton, { once: true });
  } else {
    ensureCopyButton();
  }

  trace("debug-console.ready", {
    maxLines,
  });
  observeLongTasks();
})(window.CBO);
