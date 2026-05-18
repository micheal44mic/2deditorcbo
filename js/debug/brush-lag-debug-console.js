(function registerBrushLagDebugConsole(namespace) {
  const OVERLAY_ID = "cbo-brush-lag-debug-console";
  const STYLE_ID = "cbo-brush-lag-debug-console-style";
  const MAX_EVENTS = 160;
  const MAX_VISIBLE_ROWS = 16;
  const DEBUG_BUILD_ENABLED = true;

  const state = {
    enabled: DEBUG_BUILD_ENABLED,
    events: [],
    expanded: true,
    metrics: {},
    overlay: null,
    renderRaf: 0,
    sequence: 0,
    slowLogAtByEvent: new Map(),
    visible: true,
  };

  function nowLabel(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");

    return `${hh}:${mm}:${ss}.${ms}`;
  }

  function round(value, digits = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    const factor = 10 ** digits;

    return Math.round(number * factor) / factor;
  }

  function getEngine() {
    return namespace.brushEngine || null;
  }

  function getRenderer(engine = getEngine()) {
    return engine?.documentRenderer || namespace.documentRenderer || null;
  }

  function cloneRect(rect) {
    if (!rect) {
      return null;
    }

    return {
      height: round(rect.height, 1),
      width: round(rect.width, 1),
      x: round(rect.x, 1),
      y: round(rect.y, 1),
    };
  }

  function captureState() {
    const engine = getEngine();
    const renderer = getRenderer(engine);
    const pendingSamples = Array.isArray(engine?.pendingPointerSamples)
      ? engine.pendingPointerSamples.length
      : 0;

    return {
      activeLayerId: renderer?.layerModel?.activeLayerId || "",
      brushSize: round(engine?.getBrushSize?.(), 1),
      camera: engine?.camera
        ? {
            x: round(engine.camera.x, 1),
            y: round(engine.camera.y, 1),
            zoom: round(engine.camera.zoom, 5),
          }
        : null,
      dpr: round(engine?.dpr || window.devicePixelRatio || 1, 2),
      isDrawing: engine?.isDrawing === true,
      isPanning: engine?.isPanning === true,
      pendingSamples,
      previewCache: {
        dirty: renderer?.previewCacheDirty === true,
        ready: renderer?.previewCacheReady === true,
        reason: renderer?.previewCacheReason || "",
      },
      strokeBufferRect: cloneRect(engine?.strokeBufferRect),
      strokeStamps: Math.max(0, Math.round(Number(engine?.strokeStampCount) || 0)),
      tool: engine?.currentStrokeTool || engine?.activeStrokeTool || "",
      viewport: {
        height: Math.round(engine?.viewportHeight || window.innerHeight || 0),
        width: Math.round(engine?.viewportWidth || window.innerWidth || 0),
      },
    };
  }

  function compactDuration(value) {
    const number = Number(value);

    return Number.isFinite(number) ? `${round(number, 1)}ms` : "-";
  }

  function compactRect(rect) {
    if (!rect) {
      return "null";
    }

    return `${rect.x},${rect.y} ${rect.width}x${rect.height}`;
  }

  function compactPhases(phases) {
    if (!phases || typeof phases !== "object") {
      return "";
    }

    const labels = [
      ["setup", "setup"],
      ["coverage", "cov"],
      ["targets", "targets"],
      ["history-prepare", "histPrep"],
      ["pre-draw", "preDraw"],
      ["draw", "draw"],
      ["history-commit", "commit"],
      ["cleanup", "cleanup"],
      ["dirty", "dirty"],
    ];

    return labels
      .filter(([key]) => Number.isFinite(Number(phases[key])))
      .map(([key, label]) => `${label}:${compactDuration(phases[key])}`)
      .join(" ");
  }

  function compactCurrent(snapshot = captureState()) {
    const metrics = state.metrics;
    const cache = snapshot.previewCache || {};
    const camera = snapshot.camera || {};

    return [
      `tool=${snapshot.tool || "?"}`,
      `draw=${snapshot.isDrawing ? 1 : 0}`,
      `z=${camera.zoom ?? "?"}`,
      `pending=${snapshot.pendingSamples}`,
      `stamps=${snapshot.strokeStamps}`,
      `size=${snapshot.brushSize ?? "?"}`,
      `frame=${compactDuration(metrics.frameMs)}`,
      `drawMs=${compactDuration(metrics.drawMs)}`,
      `input=${compactDuration(metrics.inputMs)}`,
      `flush=${compactDuration(metrics.flushMs)}`,
      `bake=${compactDuration(metrics.bakeMs)}`,
      `cache=${cache.ready ? "ready" : "no"} dirty=${cache.dirty ? 1 : 0}`,
    ].join(" | ");
  }

  function compactDetail(detail) {
    if (!detail || typeof detail !== "object") {
      return String(detail || "");
    }

    const parts = [];

    if (detail.tool) {
      parts.push(`tool=${detail.tool}`);
    }

    if (Number.isFinite(detail.durationMs)) {
      parts.push(`dt=${compactDuration(detail.durationMs)}`);
    }

    if (detail.phases) {
      const phaseSummary = compactPhases(detail.phases);

      if (phaseSummary) {
        parts.push(`phases=${phaseSummary}`);
      }
    }

    if (Number.isFinite(detail.frameMs)) {
      parts.push(`frame=${compactDuration(detail.frameMs)}`);
    }

    if (Number.isFinite(detail.processedSamples)) {
      parts.push(`processed=${detail.processedSamples}`);
    }

    if (Number.isFinite(detail.initialPendingSamples)) {
      parts.push(`pending0=${detail.initialPendingSamples}`);
    }

    if (Number.isFinite(detail.remainingSamples)) {
      parts.push(`pending=${detail.remainingSamples}`);
    }

    if (Number.isFinite(detail.stampCount)) {
      parts.push(`stamps=${detail.stampCount}`);
    }

    if (Number.isFinite(detail.strokeStamps)) {
      parts.push(`totalStamps=${detail.strokeStamps}`);
    }

    if (Number.isFinite(detail.paintTargetCount)) {
      parts.push(`targets=${detail.paintTargetCount}`);
    }

    if (Number.isFinite(detail.tilePatchRectCount)) {
      parts.push(`patchTiles=${detail.tilePatchRectCount}`);
    }

    if (Number.isFinite(detail.targetCoverage)) {
      parts.push(`coverage=${Math.round(detail.targetCoverage * 100)}%`);
    }

    if (detail.targetStrategy) {
      parts.push(`strategy=${detail.targetStrategy}`);
    }

    if (Number.isFinite(detail.previewDirtyRectCount)) {
      parts.push(`dirtyRects=${detail.previewDirtyRectCount}`);
    }

    if (detail.strokeRect) {
      parts.push(`stroke=${compactRect(detail.strokeRect)}`);
    }

    if (detail.strokeBufferRect) {
      parts.push(`buffer=${compactRect(detail.strokeBufferRect)}`);
    }

    if (Number.isFinite(detail.drawCallCount)) {
      parts.push(`draws=${detail.drawCallCount}`);
    }

    if (detail.historyMode) {
      parts.push(`history=${detail.historyMode}`);
    }

    if (detail.historyCommitMode) {
      parts.push(`commit=${detail.historyCommitMode}`);
    }

    if (detail.reason) {
      parts.push(`reason=${detail.reason}`);
    }

    if (detail.message) {
      parts.push(detail.message);
    }

    if (parts.length === 0) {
      try {
        return JSON.stringify(detail).slice(0, 220);
      } catch (error) {
        return String(detail);
      }
    }

    return parts.join(" | ");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureStyle() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        left: max(8px, env(safe-area-inset-left));
        bottom: max(8px, env(safe-area-inset-bottom));
        z-index: 2147483000;
        width: min(96vw, 680px);
        max-height: min(50vh, 430px);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.86);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.38);
        color: #eef4ff;
        font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        pointer-events: auto;
        text-align: left;
        touch-action: manipulation;
      }

      #${OVERLAY_ID}[hidden] {
        display: none !important;
      }

      #${OVERLAY_ID} .cbo-brush-lag-head {
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        display: flex;
        gap: 6px;
        min-height: 28px;
        padding: 6px 8px;
      }

      #${OVERLAY_ID} .cbo-brush-lag-title {
        color: #ffffff;
        font-weight: 700;
        letter-spacing: 0;
        margin-right: auto;
        white-space: nowrap;
      }

      #${OVERLAY_ID} button {
        appearance: none;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: #ffffff;
        font: inherit;
        min-height: 24px;
        padding: 2px 7px;
      }

      #${OVERLAY_ID} .cbo-brush-lag-current {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        color: #aee2ff;
        padding: 6px 8px;
        white-space: normal;
        word-break: break-word;
      }

      #${OVERLAY_ID} .cbo-brush-lag-log {
        margin: 0;
        max-height: calc(min(50vh, 430px) - 78px);
        overflow: auto;
        padding: 6px 8px 8px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${OVERLAY_ID} .cbo-brush-lag-row {
        color: #eef4ff;
        display: block;
        margin: 0 0 3px;
      }

      #${OVERLAY_ID} .cbo-brush-lag-row.warn {
        color: #ffd98a;
        font-weight: 700;
      }

      #${OVERLAY_ID} .cbo-brush-lag-row.error {
        color: #ff9f9f;
        font-weight: 700;
      }

      @media (max-width: 700px) {
        #${OVERLAY_ID} {
          font-size: 10px;
          max-height: 44vh;
          width: calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));
        }
      }
    `;
    document.head?.appendChild(style);
  }

  function ensureOverlay() {
    if (typeof document === "undefined" || !document.body) {
      return null;
    }

    if (state.overlay?.isConnected) {
      return state.overlay;
    }

    ensureStyle();

    let overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("section");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("aria-label", "Brush lag debug console");
      overlay.setAttribute("role", "status");
      overlay.innerHTML = `
        <div class="cbo-brush-lag-head">
          <span class="cbo-brush-lag-title">BRUSH LAG DEBUG ON</span>
          <button type="button" data-brush-lag-toggle>min</button>
          <button type="button" data-brush-lag-clear>clear</button>
        </div>
        <div class="cbo-brush-lag-current" data-brush-lag-current></div>
        <pre class="cbo-brush-lag-log" data-brush-lag-log></pre>
      `;
      overlay.querySelector("[data-brush-lag-toggle]")?.addEventListener("click", () => {
        state.expanded = !state.expanded;
        renderNow();
      });
      overlay.querySelector("[data-brush-lag-clear]")?.addEventListener("click", () => {
        state.events.length = 0;
        renderNow();
      });
      document.body.appendChild(overlay);
    }

    state.overlay = overlay;

    return overlay;
  }

  function renderNow() {
    state.renderRaf = 0;

    if (!state.enabled || !state.visible) {
      if (state.overlay) {
        state.overlay.hidden = true;
      }
      return;
    }

    const overlay = ensureOverlay();

    if (!overlay) {
      return;
    }

    overlay.hidden = false;

    const current = overlay.querySelector("[data-brush-lag-current]");
    const log = overlay.querySelector("[data-brush-lag-log]");
    const toggle = overlay.querySelector("[data-brush-lag-toggle]");

    if (toggle) {
      toggle.textContent = state.expanded ? "min" : "open";
    }

    if (current) {
      current.textContent = compactCurrent();
      current.hidden = !state.expanded;
    }

    if (log) {
      const rows = state.events
        .slice(-MAX_VISIBLE_ROWS)
        .map((entry) => {
          const className = entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "";
          const marker = entry.level === "warn" ? "!" : entry.level === "error" ? "x" : "-";

          return `<span class="cbo-brush-lag-row ${className}">${escapeHtml(`${marker} ${entry.time} #${entry.id} ${entry.event}: ${entry.summary}`)}</span>`;
        })
        .join("");

      log.innerHTML = rows || '<span class="cbo-brush-lag-row">- waiting for brush events</span>';
      log.hidden = !state.expanded;
    }
  }

  function scheduleRender() {
    if (state.renderRaf || typeof window === "undefined") {
      return;
    }

    state.renderRaf = window.requestAnimationFrame?.(renderNow) || window.setTimeout?.(renderNow, 16) || 0;
  }

  function log(event, detail = {}, options = {}) {
    if (!state.enabled) {
      return null;
    }

    const level = options.level || (options.warn === true ? "warn" : "info");
    const snapshot = options.snapshot === false ? null : captureState();
    const entry = {
      detail,
      event: String(event || "debug"),
      id: ++state.sequence,
      level,
      snapshot,
      summary: compactDetail(detail),
      time: nowLabel(),
    };

    state.events.push(entry);

    if (state.events.length > MAX_EVENTS) {
      state.events.splice(0, state.events.length - MAX_EVENTS);
    }

    namespace.lastBrushLagDebugEvent = entry;
    window.CBO_BRUSH_LAG_DEBUG_EVENTS = state.events;

    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]?.(`[CBO brush lag] ${entry.event}`, {
      detail,
      snapshot,
    });

    scheduleRender();
    window.dispatchEvent?.(new CustomEvent("cbo:brush-lag-debug", { detail: entry }));

    return entry;
  }

  function warn(event, detail = {}, options = {}) {
    return log(event, detail, { ...options, level: "warn" });
  }

  function recordTiming(event, detail = {}, options = {}) {
    const durationMs = Number(detail.durationMs);
    const metricName = options.metric || `${event}Ms`;

    if (Number.isFinite(durationMs)) {
      state.metrics[metricName] = round(durationMs, 2);
    }

    if (Number.isFinite(detail.pendingSamples)) {
      state.metrics.pendingSamples = Math.max(0, Math.round(detail.pendingSamples));
    }

    if (Number.isFinite(detail.remainingSamples)) {
      state.metrics.pendingSamples = Math.max(0, Math.round(detail.remainingSamples));
    }

    if (Number.isFinite(detail.strokeStamps)) {
      state.metrics.strokeStamps = Math.max(0, Math.round(detail.strokeStamps));
    }

    const warnAtMs = Number(options.warnAtMs);
    const now = Date.now();
    const throttleMs = Math.max(0, Math.round(Number(options.throttleMs) || 250));
    const lastAt = state.slowLogAtByEvent.get(event) || 0;

    if (Number.isFinite(durationMs) && Number.isFinite(warnAtMs) && durationMs >= warnAtMs && now - lastAt >= throttleMs) {
      state.slowLogAtByEvent.set(event, now);
      warn(event, detail, { snapshot: options.snapshot !== false });
    } else {
      scheduleRender();
    }

    return true;
  }

  function setVisible(visible) {
    state.visible = visible !== false;
    renderNow();
  }

  function setEnabled(enabled) {
    state.enabled = enabled !== false;
    renderNow();
  }

  namespace.BrushLagDebug = {
    captureState,
    getEvents: () => state.events.slice(),
    log,
    recordTiming,
    render: renderNow,
    setEnabled,
    setVisible,
    state,
    warn,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        ensureOverlay();
        log("debug-console-ready", { message: "temporary brush lag debug enabled" }, { snapshot: false });
      }, { once: true });
    } else {
      ensureOverlay();
      log("debug-console-ready", { message: "temporary brush lag debug enabled" }, { snapshot: false });
    }
  }
})(window.CBO = window.CBO || {});
