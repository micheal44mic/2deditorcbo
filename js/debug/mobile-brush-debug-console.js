(function registerMobileBrushDebugConsole(namespace) {
  const MAX_LINES = 900;
  const MAX_TEXT_LENGTH = 2200;
  const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"];
  const buttonResetTimers = new WeakMap();

  const state = {
    consoleCaptureInstalled: false,
    eventId: 0,
    lines: [],
    longTaskObserver: null,
    maxLines: MAX_LINES,
    sessionId: 0,
    startedAt: now(),
  };

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function roundMs(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  }

  function describeElement(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    const id = element.id ? `#${element.id}` : "";
    const classes = Array.from(element.classList || []).slice(0, 4).map((className) => `.${className}`).join("");

    return `<${element.tagName.toLowerCase()}${id}${classes}>`;
  }

  function sanitizeValue(value, seen = new WeakSet()) {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "bigint") {
      return `${value}n`;
    }

    if (typeof value === "function") {
      return `[function ${value.name || "anonymous"}]`;
    }

    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack,
      };
    }

    if (typeof Event !== "undefined" && value instanceof Event) {
      return {
        clientX: Number.isFinite(value.clientX) ? Math.round(value.clientX) : undefined,
        clientY: Number.isFinite(value.clientY) ? Math.round(value.clientY) : undefined,
        pointerType: value.pointerType,
        target: describeElement(value.target),
        type: value.type,
      };
    }

    if (typeof Element !== "undefined" && value instanceof Element) {
      return describeElement(value);
    }

    if (Array.isArray(value)) {
      return value.slice(0, 32).map((item) => sanitizeValue(item, seen));
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        return "[circular]";
      }

      seen.add(value);

      const result = {};
      Object.keys(value).slice(0, 48).forEach((key) => {
        result[key] = sanitizeValue(value[key], seen);
      });

      return result;
    }

    return String(value);
  }

  function serializeValue(value) {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(sanitizeValue(value));
    } catch (error) {
      return String(value);
    }
  }

  function trimText(text, maxLength = MAX_TEXT_LENGTH) {
    const safeText = String(text || "");

    if (safeText.length <= maxLength) {
      return safeText;
    }

    return `${safeText.slice(0, maxLength)}... [trimmed ${safeText.length - maxLength} chars]`;
  }

  function appendLine(level, name, payload = null) {
    const id = String(++state.eventId).padStart(4, "0");
    const elapsedMs = roundMs(now() - state.startedAt).toFixed(2);
    const timestamp = new Date().toISOString();
    const serializedPayload = payload == null ? "" : ` ${trimText(serializeValue(payload))}`;
    const line = `${id} +${elapsedMs}ms ${timestamp} [${level}] ${name}${serializedPayload}`;

    state.lines.push(line);

    while (state.lines.length > state.maxLines) {
      state.lines.shift();
    }

    window.dispatchEvent?.(new CustomEvent("cbo:mobile-brush-debug-log", {
      detail: {
        id: state.eventId,
        level,
        line,
        name,
      },
    }));

    return line;
  }

  function log(name, detail = {}) {
    return appendLine("trace", name, detail);
  }

  function begin(name, detail = {}) {
    const startedAt = now();
    let ended = false;

    log(`${name}.start`, detail);

    return {
      cancel() {
        ended = true;
      },
      end(extraDetail = {}) {
        if (ended) {
          return null;
        }

        ended = true;

        return log(`${name}.end`, {
          ...extraDetail,
          durationMs: roundMs(now() - startedAt),
        });
      },
    };
  }

  function measure(name, callback, detail = {}) {
    if (typeof callback !== "function") {
      return undefined;
    }

    const trace = begin(name, detail);

    try {
      const result = callback();

      if (result && typeof result.then === "function") {
        return result.finally(() => trace.end());
      }

      trace.end();
      return result;
    } catch (error) {
      trace.end({
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  function getDeviceSnapshot() {
    const visualViewport = window.visualViewport;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    return {
      deviceMemory: navigator.deviceMemory || null,
      dpr: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      innerHeight: window.innerHeight || 0,
      innerWidth: window.innerWidth || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      networkDownlink: connection?.downlink || null,
      networkEffectiveType: connection?.effectiveType || null,
      platform: navigator.userAgentData?.platform || navigator.platform || "",
      userAgent: navigator.userAgent || "",
      visualViewportHeight: visualViewport?.height || null,
      visualViewportScale: visualViewport?.scale || null,
      visualViewportWidth: visualViewport?.width || null,
    };
  }

  function startCapture(name = "mobile-brush", detail = {}) {
    state.sessionId += 1;
    appendLine("session", `${name}.start`, {
      ...detail,
      device: getDeviceSnapshot(),
      sessionId: state.sessionId,
    });

    return state.sessionId;
  }

  function getText() {
    const header = [
      "CBO MOBILE BRUSH DEBUG",
      `generatedAt=${new Date().toISOString()}`,
      `sessionId=${state.sessionId}`,
      `lineCount=${state.lines.length}`,
      `device=${serializeValue(getDeviceSnapshot())}`,
      "",
    ];

    return [...header, ...state.lines].join("\n");
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return "clipboard-api";
      } catch (error) {
        // The fallback below works on older Android WebViews and file URLs.
      }
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:0",
      "width:1px",
      "height:1px",
      "opacity:0",
    ].join(";");
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      if (!document.execCommand("copy")) {
        throw new Error("execCommand copy returned false");
      }

      return "execCommand";
    } finally {
      textarea.remove();
    }
  }

  function setCopyButtonState(button, label, delayMs = 1100) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const defaultLabel = button.dataset.mobileBrushDebugCopyDefault || button.textContent || "Copy";

    button.dataset.mobileBrushDebugCopyDefault = defaultLabel;
    button.textContent = label;

    if (buttonResetTimers.has(button)) {
      window.clearTimeout(buttonResetTimers.get(button));
    }

    buttonResetTimers.set(button, window.setTimeout(() => {
      button.textContent = defaultLabel;
      buttonResetTimers.delete(button);
    }, delayMs));
  }

  async function copyToClipboard(button = null) {
    log("debug-copy.request", {
      lineCount: state.lines.length,
    });

    const text = getText();

    try {
      const method = await writeClipboard(text);

      setCopyButtonState(button, "Copied");
      log("debug-copy.success", {
        charCount: text.length,
        method,
      });

      return {
        method,
        ok: true,
        text,
      };
    } catch (error) {
      setCopyButtonState(button, "Copy failed", 1500);
      log("debug-copy.failed", {
        error: error?.message || String(error),
      });

      return {
        error,
        ok: false,
        text,
      };
    }
  }

  function installConsoleCapture() {
    if (state.consoleCaptureInstalled || typeof console === "undefined") {
      return;
    }

    CONSOLE_METHODS.forEach((method) => {
      const original = console[method];

      if (typeof original !== "function" || original.__cboMobileBrushDebugWrapped === true) {
        return;
      }

      const wrapped = function captureConsoleLine(...args) {
        appendLine(`console.${method}`, "console", args.map((arg) => sanitizeValue(arg)));
        return original.apply(console, args);
      };

      wrapped.__cboMobileBrushDebugWrapped = true;
      console[method] = wrapped;
    });

    state.consoleCaptureInstalled = true;
  }

  function startLongTaskObserver() {
    if (state.longTaskObserver || typeof PerformanceObserver === "undefined") {
      return;
    }

    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes || [];

    if (supportedEntryTypes.length && !supportedEntryTypes.includes("longtask")) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (Number(entry.duration) < 50) {
            return;
          }

          log("main-thread.longtask", {
            durationMs: roundMs(entry.duration),
            name: entry.name || "",
            startTimeMs: roundMs(entry.startTime),
          });
        });
      });

      observer.observe({
        buffered: true,
        type: "longtask",
      });
      state.longTaskObserver = observer;
    } catch (error) {
      // Some Android WebViews expose PerformanceObserver but reject longtask.
    }
  }

  function installWindowErrorCapture() {
    window.addEventListener("error", (event) => {
      log("window.error", {
        colno: event.colno,
        filename: event.filename,
        lineno: event.lineno,
        message: event.message,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      log("window.unhandledrejection", {
        reason: sanitizeValue(event.reason),
      });
    });
  }

  const api = {
    begin,
    copyToClipboard,
    get sessionId() {
      return state.sessionId;
    },
    getText,
    log,
    measure,
    startCapture,
  };

  installConsoleCapture();
  startLongTaskObserver();
  installWindowErrorCapture();
  log("debug-console.ready", {
    maxLines: state.maxLines,
  });

  namespace.MobileBrushDebug = api;
  namespace.mobileBrushDebug = api;
  namespace.copyMobileBrushDebugLog = copyToClipboard;
})(window.CBO = window.CBO || {});
