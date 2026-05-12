(function registerPerformanceTrace(namespace) {
  const OVERLAY_ID = "cbo-performance-trace-overlay";
  const OVERLAY_PANEL_ID = "cbo-performance-trace-panel";
  const DEFAULT_LIMIT = 240;
  const DEFAULT_UPDATE_HZ = 4;
  const DEFAULT_SLOW_THRESHOLD_MS = 16;

  const state = {
    aggregate: new Map(),
    enabled: false,
    eventId: 0,
    events: [],
    lastText: "",
    limit: DEFAULT_LIMIT,
    overlay: null,
    overlayExpanded: false,
    renderRafId: 0,
    slowThresholdMs: DEFAULT_SLOW_THRESHOLD_MS,
    updateHz: DEFAULT_UPDATE_HZ,
    updateTimer: 0,
    usePerformanceApi: true,
  };

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function roundMs(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  }

  function formatMs(value) {
    const ms = Math.max(0, Number(value) || 0);

    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }

    return `${ms.toFixed(ms >= 10 ? 1 : 2)}ms`;
  }

  function getCategory(name) {
    return String(name || "unknown").split(".")[0] || "unknown";
  }

  function sanitizeDetailValue(value, depth = 0) {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (depth > 2) {
      return "[object]";
    }

    if (Array.isArray(value)) {
      return {
        count: value.length,
      };
    }

    if (typeof value === "object") {
      const result = {};

      Object.keys(value).slice(0, 16).forEach((key) => {
        const item = value[key];

        if (typeof item === "function") {
          return;
        }

        result[key] = sanitizeDetailValue(item, depth + 1);
      });

      return result;
    }

    return String(value);
  }

  function sanitizeDetail(detail = {}) {
    return sanitizeDetailValue(detail) || {};
  }

  function ensureAggregate(name, category) {
    const key = String(name || "unknown");
    const existing = state.aggregate.get(key);

    if (existing) {
      return existing;
    }

    const created = {
      category,
      count: 0,
      lastMs: 0,
      maxMs: 0,
      name: key,
      slowCount: 0,
      totalMs: 0,
    };

    state.aggregate.set(key, created);
    return created;
  }

  function writePerformanceMeasure(startMark, endMark, measureName) {
    if (!state.usePerformanceApi || typeof performance === "undefined") {
      return;
    }

    try {
      if (startMark && endMark && typeof performance.measure === "function") {
        performance.measure(measureName, startMark, endMark);
      }
    } catch (error) {
      // Browser support varies; the internal trace still works.
    } finally {
      try {
        performance.clearMarks?.(startMark);
        performance.clearMarks?.(endMark);
        performance.clearMeasures?.(measureName);
      } catch (error) {
        // Ignore cleanup failures.
      }
    }
  }

  function recordTrace(name, durationMs = 0, detail = {}, options = {}) {
    if (!state.enabled && options.force !== true) {
      return null;
    }

    const safeName = String(name || "unknown");
    const duration = roundMs(durationMs);
    const category = getCategory(safeName);
    const startedAt = Math.max(0, Number(options.startedAt) || now());
    const entry = {
      category,
      detail: sanitizeDetail(detail),
      durationMs: duration,
      id: ++state.eventId,
      name: safeName,
      slow: duration >= state.slowThresholdMs,
      timestamp: Date.now(),
      type: options.type || "measure",
    };
    const aggregate = ensureAggregate(safeName, category);

    aggregate.count += 1;
    aggregate.lastMs = duration;
    aggregate.maxMs = Math.max(aggregate.maxMs, duration);
    aggregate.slowCount += entry.slow ? 1 : 0;
    aggregate.totalMs = roundMs(aggregate.totalMs + duration);

    state.events.push(entry);

    while (state.events.length > state.limit) {
      state.events.shift();
    }

    if (options.startMark && options.endMark) {
      writePerformanceMeasure(options.startMark, options.endMark, `cbo:${safeName}`);
    }

    window.dispatchEvent?.(new CustomEvent("cbo:performance-trace", {
      detail: {
        ...entry,
        startedAt,
      },
    }));
    queueRenderOverlay();
    return entry;
  }

  function beginTrace(name, detail = {}) {
    if (!state.enabled) {
      return null;
    }

    const id = ++state.eventId;
    const safeName = String(name || "unknown");
    const startedAt = now();
    const startMark = `cbo:${safeName}:${id}:start`;
    let ended = false;

    if (state.usePerformanceApi && typeof performance !== "undefined") {
      try {
        performance.mark?.(startMark);
      } catch (error) {
        // Ignore mark failures.
      }
    }

    return {
      cancel() {
        ended = true;
      },
      end(extraDetail = {}) {
        if (ended) {
          return null;
        }

        ended = true;

        const endMark = `cbo:${safeName}:${id}:end`;

        if (state.usePerformanceApi && typeof performance !== "undefined") {
          try {
            performance.mark?.(endMark);
          } catch (error) {
            // Ignore mark failures.
          }
        }

        return recordTrace(
          safeName,
          now() - startedAt,
          {
            ...detail,
            ...extraDetail,
          },
          {
            endMark,
            startMark,
            startedAt,
          },
        );
      },
    };
  }

  function measureTrace(name, callback, detail = {}) {
    if (typeof callback !== "function") {
      return undefined;
    }

    const trace = beginTrace(name, detail);

    try {
      const result = callback();

      if (result && typeof result.then === "function") {
        return result.finally(() => trace?.end());
      }

      trace?.end();
      return result;
    } catch (error) {
      trace?.end({
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  function markTrace(name, detail = {}) {
    if (state.enabled && state.usePerformanceApi && typeof performance !== "undefined") {
      try {
        performance.mark?.(`cbo:${String(name || "mark")}`);
      } catch (error) {
        // Ignore mark failures.
      }
    }

    return recordTrace(name, 0, detail, {
      type: "mark",
    });
  }

  function getAggregateRows() {
    return Array.from(state.aggregate.values())
      .map((item) => ({ ...item }))
      .sort((first, second) => (second.totalMs - first.totalMs) || (second.maxMs - first.maxMs));
  }

  function collectTraceTelemetry(options = {}) {
    const limit = Math.max(1, Math.min(state.limit, Math.round(Number(options.limit) || 12)));
    const recent = state.events.slice(-limit).reverse().map((entry) => ({ ...entry }));
    const slowEvents = state.events
      .filter((entry) => entry.slow)
      .slice(-limit)
      .reverse()
      .map((entry) => ({ ...entry }));
    const groups = getAggregateRows();

    return {
      enabled: state.enabled,
      eventCount: state.events.length,
      generatedAt: new Date().toISOString(),
      groups,
      last: state.events[state.events.length - 1] ? { ...state.events[state.events.length - 1] } : null,
      recent,
      slowEvents,
      slowThresholdMs: state.slowThresholdMs,
      top: groups.slice(0, limit),
    };
  }

  function ensureOverlay() {
    let overlay = state.overlay || document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      document.body.append(overlay);
    }

    overlay.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:64px",
      "z-index:2147483001",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-start",
      "gap:4px",
      "pointer-events:none",
    ].join(";");

    if (!overlay.querySelector("[data-performance-trace-toggle]")) {
      overlay.replaceChildren();

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.performanceTraceToggle = "true";
      toggle.setAttribute("aria-controls", OVERLAY_PANEL_ID);
      toggle.setAttribute("aria-label", "Apri performance trace");
      toggle.title = "Apri performance trace";
      toggle.style.cssText = [
        "appearance:none",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "gap:7px",
        "min-width:64px",
        "min-height:34px",
        "box-sizing:border-box",
        "padding:7px 10px",
        "border:1px solid rgba(142,255,165,.42)",
        "border-radius:8px",
        "background:rgba(14,17,24,.9)",
        "color:#eef3ff",
        "font:600 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
        "letter-spacing:0",
        "cursor:pointer",
        "pointer-events:auto",
        "box-shadow:0 10px 24px rgba(0,0,0,.28)",
        "backdrop-filter:blur(8px)",
      ].join(";");

      const dot = document.createElement("span");
      dot.dataset.performanceTraceStatusDot = "true";
      dot.style.cssText = [
        "display:block",
        "width:7px",
        "height:7px",
        "border-radius:999px",
        "background:rgba(142,255,165,.9)",
        "box-shadow:0 0 0 2px rgba(142,255,165,.12)",
        "flex:0 0 auto",
      ].join(";");

      const toggleText = document.createElement("span");
      toggleText.textContent = "Trace";

      toggle.append(dot, toggleText);

      const panel = document.createElement("div");
      panel.id = OVERLAY_PANEL_ID;
      panel.dataset.performanceTracePanel = "true";
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = [
        "min-width:300px",
        "max-width:min(430px,calc(100vw - 20px))",
        "box-sizing:border-box",
        "border:1px solid rgba(142,255,165,.42)",
        "border-radius:8px",
        "background:rgba(14,17,24,.9)",
        "color:#eef3ff",
        "box-shadow:0 12px 30px rgba(0,0,0,.32)",
        "backdrop-filter:blur(8px)",
        "overflow:hidden",
        "pointer-events:auto",
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText = [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:10px",
        "padding:8px 10px",
        "border-bottom:1px solid rgba(255,255,255,.1)",
        "font:600 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace",
        "text-transform:uppercase",
      ].join(";");

      const title = document.createElement("span");
      title.textContent = "Performance trace";

      const close = document.createElement("button");
      close.type = "button";
      close.dataset.performanceTraceClose = "true";
      close.setAttribute("aria-label", "Chiudi performance trace");
      close.title = "Chiudi performance trace";
      close.textContent = "x";
      close.style.cssText = [
        "appearance:none",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "width:24px",
        "height:24px",
        "border:1px solid rgba(255,255,255,.16)",
        "border-radius:6px",
        "background:rgba(255,255,255,.08)",
        "color:#eef3ff",
        "font:700 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
        "cursor:pointer",
        "padding:0",
      ].join(";");

      const body = document.createElement("pre");
      body.dataset.performanceTraceBody = "true";
      body.style.cssText = [
        "box-sizing:border-box",
        "margin:0",
        "padding:10px 12px",
        "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
        "letter-spacing:0",
        "white-space:pre-wrap",
        "overflow-wrap:anywhere",
      ].join(";");

      toggle.addEventListener("click", () => {
        setOverlayExpanded(true);
        renderOverlay();
      });

      close.addEventListener("click", () => setOverlayExpanded(false));
      header.append(title, close);
      panel.append(header, body);
      overlay.append(toggle, panel);
    }

    state.overlay = overlay;
    syncOverlayChrome();
    return overlay;
  }

  function syncOverlayChrome() {
    const overlay = state.overlay;

    if (!overlay) {
      return;
    }

    const telemetry = collectTraceTelemetry({ limit: 1 });
    const lastSlow = telemetry.last?.slow === true;
    const color = lastSlow ? "rgba(255,116,116,.9)" : "rgba(142,255,165,.9)";
    const toggle = overlay.querySelector("[data-performance-trace-toggle]");
    const panel = overlay.querySelector("[data-performance-trace-panel]");
    const dot = overlay.querySelector("[data-performance-trace-status-dot]");

    if (toggle) {
      toggle.hidden = state.overlayExpanded;
      toggle.setAttribute("aria-expanded", String(state.overlayExpanded));
      toggle.style.borderColor = color;
    }

    if (panel) {
      panel.hidden = !state.overlayExpanded;
      panel.style.borderColor = color;
    }

    if (dot) {
      dot.style.background = color;
      dot.style.boxShadow = `0 0 0 2px ${lastSlow ? "rgba(255,116,116,.12)" : "rgba(142,255,165,.12)"}`;
    }
  }

  function setOverlayExpanded(expanded) {
    state.overlayExpanded = expanded === true;
    syncOverlayChrome();
  }

  function formatTraceLine(entry) {
    if (!entry) {
      return "none";
    }

    return `${entry.name}: ${formatMs(entry.durationMs)}${entry.slow ? " slow" : ""}`;
  }

  function renderOverlay() {
    if (!state.overlay) {
      return;
    }

    const telemetry = collectTraceTelemetry({ limit: 6 });
    const topLines = telemetry.top.slice(0, 5).map((item) => (
      `${item.name}: ${formatMs(item.totalMs)} / ${item.count}x / max ${formatMs(item.maxMs)}`
    ));
    const recentSlowLines = telemetry.slowEvents.slice(0, 4).map(formatTraceLine);
    const lines = [
      "CBO PERF TRACE",
      `Status: ${telemetry.enabled ? "recording" : "stopped"}`,
      `Events: ${telemetry.eventCount}`,
      `Slow >= ${formatMs(telemetry.slowThresholdMs)}`,
      "",
      `Last: ${formatTraceLine(telemetry.last)}`,
      "",
      "Top total:",
      ...(topLines.length ? topLines : ["none"]),
      "",
      "Recent slow:",
      ...(recentSlowLines.length ? recentSlowLines : ["none"]),
    ];
    const text = lines.join("\n");
    const body = state.overlay.querySelector("[data-performance-trace-body]");

    if (body && state.lastText !== text) {
      body.textContent = text;
      state.lastText = text;
    }

    syncOverlayChrome();
  }

  function queueRenderOverlay() {
    if (!state.overlay || state.renderRafId) {
      return;
    }

    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));

    state.renderRafId = requestFrame(() => {
      state.renderRafId = 0;
      renderOverlay();
    });
  }

  function showTraceOverlay(visible = true) {
    const overlay = ensureOverlay();

    overlay.hidden = visible !== true;
    renderOverlay();
    return overlay;
  }

  function startTrace(options = {}) {
    state.enabled = true;
    state.limit = Math.max(20, Math.min(2000, Math.round(Number(options.limit) || state.limit || DEFAULT_LIMIT)));
    state.slowThresholdMs = Math.max(1, Number(options.slowThresholdMs) || state.slowThresholdMs || DEFAULT_SLOW_THRESHOLD_MS);
    state.usePerformanceApi = options.usePerformanceApi !== false;
    state.updateHz = Math.max(1, Math.min(12, Number(options.updateHz) || DEFAULT_UPDATE_HZ));

    if (options.visible !== false) {
      showTraceOverlay(true);
    }

    if (!state.updateTimer) {
      state.updateTimer = window.setInterval(renderOverlay, Math.round(1000 / state.updateHz));
    }

    return collectTraceTelemetry();
  }

  function stopTrace(options = {}) {
    state.enabled = false;

    if (state.updateTimer) {
      clearInterval(state.updateTimer);
      state.updateTimer = 0;
    }

    if (state.renderRafId) {
      window.cancelAnimationFrame(state.renderRafId);
      state.renderRafId = 0;
    }

    if (options.visible === false) {
      showTraceOverlay(false);
    } else {
      renderOverlay();
    }

    return collectTraceTelemetry();
  }

  function resetTrace() {
    state.aggregate.clear();
    state.events = [];
    state.eventId = 0;
    renderOverlay();
    return collectTraceTelemetry();
  }

  const api = {
    begin: beginTrace,
    collect: collectTraceTelemetry,
    get enabled() {
      return state.enabled;
    },
    mark: markTrace,
    measure: measureTrace,
    record: recordTrace,
    reset: resetTrace,
    show: showTraceOverlay,
    start: startTrace,
    stop: stopTrace,
  };

  namespace.PerfTrace = api;
  namespace.performanceTrace = api;
  namespace.collectPerformanceTrace = collectTraceTelemetry;
})(window.CBO = window.CBO || {});
