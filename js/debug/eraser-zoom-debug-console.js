(function registerEraserZoomDebugConsole(namespace) {
  const OVERLAY_ID = "cbo-eraser-zoom-debug-console";
  const STYLE_ID = "cbo-eraser-zoom-debug-console-style";
  const MAX_EVENTS = 140;
  const MAX_VISIBLE_ROWS = 16;
  const DEBUG_BUILD_ENABLED = true;

  const state = {
    enabled: DEBUG_BUILD_ENABLED,
    events: [],
    expanded: true,
    overlay: null,
    renderRaf: 0,
    sequence: 0,
    visible: true,
  };

  function nowLabel(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");

    return `${hh}:${mm}:${ss}.${ms}`;
  }

  function round(value, digits = 3) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    const factor = 10 ** digits;

    return Math.round(number * factor) / factor;
  }

  function cloneRect(rect) {
    if (!rect) {
      return null;
    }

    return {
      height: round(rect.height, 2),
      width: round(rect.width, 2),
      x: round(rect.x, 2),
      y: round(rect.y, 2),
    };
  }

  function getRenderer() {
    return namespace.documentRenderer || namespace.brushEngine?.documentRenderer || null;
  }

  function getLayerModel(renderer = getRenderer()) {
    return renderer?.layerModel || namespace.documentLayerModel || null;
  }

  function getActiveLayerId() {
    return getLayerModel()?.activeLayerId || "";
  }

  function getLayerSummary(layerId = getActiveLayerId(), renderer = getRenderer()) {
    const layerModel = getLayerModel(renderer);
    const layer = layerId && typeof layerModel?.findEntryById === "function"
      ? layerModel.findEntryById(layerId)
      : null;

    if (!layer) {
      return {
        id: layerId || "",
        missing: true,
      };
    }

    return {
      artboardId: layer.artboardId || "",
      id: layer.id || "",
      mockupId: layer.mockupAsset?.id || "",
      name: layer.name || "",
      opacity: round(layer.opacity ?? 1, 3),
      type: layer.type || "",
      visible: layer.visible !== false,
    };
  }

  function getTargetSummary(target, renderer = getRenderer()) {
    if (!target) {
      return {
        exists: false,
      };
    }

    const isSparse = Boolean(renderer?.isSparseRasterTarget?.(target));
    const rect = renderer?.getRasterTargetDocumentRect?.(target) || null;
    const tiles = isSparse && target.tiles instanceof Map ? target.tiles.size : null;

    return {
      cold: target.cold === true,
      cow: target.copyOnWrite === true,
      cropped: target.cropped === true,
      exists: true,
      framebuffer: Boolean(target.framebuffer),
      height: Math.round(target.height || 0),
      id: target.id || "",
      layerId: target.layerId || "",
      materializedFromSparse: target.materializedFromSparse === true,
      rect: cloneRect(rect),
      sparse: isSparse,
      texture: Boolean(target.texture),
      tileSize: target.tileSize || target.sparseTileSize || null,
      tiles,
      version: target.version || 0,
      width: Math.round(target.width || 0),
      x: Number.isFinite(target.x) ? Math.round(target.x) : null,
      y: Number.isFinite(target.y) ? Math.round(target.y) : null,
    };
  }

  function getPreviewCacheSummary(renderer = getRenderer()) {
    if (!renderer) {
      return null;
    }

    return {
      dirty: renderer.previewCacheDirty === true,
      dirtyRects: Array.isArray(renderer.previewDirtyRects)
        ? renderer.previewDirtyRects.length
        : renderer.previewDirtyRects === null
          ? "full"
          : 0,
      ready: renderer.previewCacheReady === true,
      reason: renderer.previewCacheReason || "",
      rect: cloneRect(renderer.previewCacheDocumentRect),
      scale: round(renderer.previewCacheScale || 1, 4),
      size: `${Math.round(renderer.previewCacheWidth || 0)}x${Math.round(renderer.previewCacheHeight || 0)}`,
    };
  }

  function captureLayerState(layerId = getActiveLayerId(), options = {}) {
    const renderer = getRenderer();
    const target = layerId
      ? renderer?.rasterTargetsByLayerId?.get?.(layerId) || renderer?.getRasterTarget?.(layerId) || null
      : null;
    let contentBounds = null;
    let contentError = "";

    if (layerId && options.includeContent !== false && typeof renderer?.getRasterContentBounds === "function") {
      try {
        contentBounds = renderer.getRasterContentBounds(layerId, {
          alphaThreshold: 2,
          coarseOnly: options.precise === true ? false : options.coarseOnly !== false,
          padCells: 1,
          padding: 1,
          sampleCols: options.precise === true ? 128 : 64,
          sampleRows: options.precise === true ? 128 : 64,
        });
      } catch (error) {
        contentError = error?.message || String(error);
      }
    }

    return {
      contentBounds: cloneRect(contentBounds),
      contentError,
      layer: getLayerSummary(layerId, renderer),
      previewCache: getPreviewCacheSummary(renderer),
      target: getTargetSummary(target, renderer),
    };
  }

  function captureActiveState(options = {}) {
    const engine = namespace.brushEngine || null;
    const layerId = getActiveLayerId();

    return {
      activeLayerId: layerId,
      camera: engine?.camera
        ? {
            x: round(engine.camera.x, 2),
            y: round(engine.camera.y, 2),
            zoom: round(engine.camera.zoom, 5),
          }
        : null,
      dpr: round(engine?.dpr || window.devicePixelRatio || 1, 3),
      isDrawing: engine?.isDrawing === true,
      isPanning: engine?.isPanning === true,
      layerState: options.layerState === false ? null : captureLayerState(layerId, options),
      tool: engine?.currentStrokeTool || engine?.activeStrokeTool || "",
      touchNavigation: Boolean(engine?.touchNavigationGesture || engine?.touchNavigationExclusive),
      viewport: {
        height: Math.round(engine?.viewportHeight || window.innerHeight || 0),
        width: Math.round(engine?.viewportWidth || window.innerWidth || 0),
      },
    };
  }

  function compactRect(rect) {
    if (!rect) {
      return "null";
    }

    return `${rect.x},${rect.y} ${rect.width}x${rect.height}`;
  }

  function compactTarget(target) {
    if (!target?.exists) {
      return "target=missing";
    }

    const mode = target.sparse ? `sparse:${target.tiles}` : target.cropped ? "cropped" : "dense";

    return `${mode} ${target.width}x${target.height} tex=${target.texture ? 1 : 0} fb=${target.framebuffer ? 1 : 0} rect=${compactRect(target.rect)}`;
  }

  function compactState(snapshot) {
    if (!snapshot) {
      return "snapshot unavailable";
    }

    const layer = snapshot.layerState?.layer || {};
    const target = snapshot.layerState?.target || {};
    const content = snapshot.layerState?.contentBounds;
    const cache = snapshot.layerState?.previewCache || {};
    const camera = snapshot.camera || {};

    return [
      `z=${camera.zoom ?? "?"}`,
      `cam=${camera.x ?? "?"},${camera.y ?? "?"}`,
      `tool=${snapshot.tool || "?"}`,
      `layer=${layer.name || layer.id || snapshot.activeLayerId || "none"}:${layer.type || "?"}`,
      compactTarget(target),
      `content=${compactRect(content)}`,
      `cache=${cache.ready ? "ready" : "no"} dirty=${cache.dirty ? 1 : 0} reason=${cache.reason || "-"}`,
    ].join(" | ");
  }

  function compactDetail(detail) {
    if (!detail || typeof detail !== "object") {
      return String(detail || "");
    }

    const parts = [];

    if (detail.layerId) {
      parts.push(`layer=${detail.layerId}`);
    }

    if (Number.isFinite(detail.oldZoom) || Number.isFinite(detail.newZoom)) {
      parts.push(`zoom=${round(detail.oldZoom, 4)}>${round(detail.newZoom, 4)}`);
    }

    if (Number.isFinite(detail.factor)) {
      parts.push(`factor=${round(detail.factor, 4)}`);
    }

    if (detail.strokeRect) {
      parts.push(`stroke=${compactRect(detail.strokeRect)}`);
    }

    if (detail.bakeRect) {
      parts.push(`bake=${compactRect(detail.bakeRect)}`);
    }

    if (Number.isFinite(detail.paintTargetCount)) {
      parts.push(`targets=${detail.paintTargetCount}`);
    }

    if (Number.isFinite(detail.drawCallCount)) {
      parts.push(`draws=${detail.drawCallCount}`);
    }

    if (detail.historyMode) {
      parts.push(`history=${detail.historyMode}`);
    }

    if (detail.target) {
      parts.push(compactTarget(detail.target));
    }

    if (detail.after?.contentBounds === null || detail.state?.contentBounds === null) {
      parts.push("CONTENT=NULL");
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
        width: min(96vw, 620px);
        max-height: min(50vh, 420px);
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

      #${OVERLAY_ID} .cbo-eraser-debug-head {
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        display: flex;
        gap: 6px;
        min-height: 28px;
        padding: 6px 8px;
      }

      #${OVERLAY_ID} .cbo-eraser-debug-title {
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

      #${OVERLAY_ID} .cbo-eraser-debug-current {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        color: #aee2ff;
        padding: 6px 8px;
        white-space: normal;
        word-break: break-word;
      }

      #${OVERLAY_ID} .cbo-eraser-debug-log {
        margin: 0;
        max-height: calc(min(50vh, 420px) - 78px);
        overflow: auto;
        padding: 6px 8px 8px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${OVERLAY_ID} .cbo-eraser-debug-row {
        color: #eef4ff;
        display: block;
        margin: 0 0 3px;
      }

      #${OVERLAY_ID} .cbo-eraser-debug-row.warn {
        color: #ffd98a;
        font-weight: 700;
      }

      #${OVERLAY_ID} .cbo-eraser-debug-row.error {
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
      overlay.setAttribute("aria-label", "Eraser debug console");
      overlay.setAttribute("role", "status");
      overlay.innerHTML = `
        <div class="cbo-eraser-debug-head">
          <span class="cbo-eraser-debug-title">ERASER DEBUG ON</span>
          <button type="button" data-eraser-debug-toggle>min</button>
          <button type="button" data-eraser-debug-clear>clear</button>
        </div>
        <div class="cbo-eraser-debug-current" data-eraser-debug-current></div>
        <pre class="cbo-eraser-debug-log" data-eraser-debug-log></pre>
      `;
      overlay.querySelector("[data-eraser-debug-toggle]")?.addEventListener("click", () => {
        state.expanded = !state.expanded;
        renderNow();
      });
      overlay.querySelector("[data-eraser-debug-clear]")?.addEventListener("click", () => {
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

    const current = overlay.querySelector("[data-eraser-debug-current]");
    const log = overlay.querySelector("[data-eraser-debug-log]");
    const toggle = overlay.querySelector("[data-eraser-debug-toggle]");

    if (toggle) {
      toggle.textContent = state.expanded ? "min" : "open";
    }

    if (current) {
      current.textContent = compactState(captureActiveState({ coarseOnly: true }));
      current.hidden = !state.expanded;
    }

    if (log) {
      const rows = state.events
        .slice(-MAX_VISIBLE_ROWS)
        .map((entry) => {
          const className = entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "";
          const marker = entry.level === "warn" ? "!" : entry.level === "error" ? "x" : "-";

          return `<span class="cbo-eraser-debug-row ${className}">${escapeHtml(`${marker} ${entry.time} #${entry.id} ${entry.event}: ${entry.summary}`)}</span>`;
        })
        .join("");

      log.innerHTML = rows || '<span class="cbo-eraser-debug-row">- waiting for eraser / zoom events</span>';
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
    const snapshot = options.snapshot === false ? null : captureActiveState(options);
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

    namespace.lastEraserZoomDebugEvent = entry;
    window.CBO_ERASER_DEBUG_EVENTS = state.events;

    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]?.(`[CBO eraser debug] ${entry.event}`, {
      detail,
      snapshot,
    });

    scheduleRender();
    window.dispatchEvent?.(new CustomEvent("cbo:eraser-zoom-debug", { detail: entry }));

    return entry;
  }

  function warn(event, detail = {}, options = {}) {
    return log(event, detail, { ...options, level: "warn" });
  }

  function setVisible(visible) {
    state.visible = visible !== false;
    renderNow();
  }

  function setEnabled(enabled) {
    state.enabled = enabled !== false;
    renderNow();
  }

  function installEventListeners() {
    if (typeof window === "undefined" || state.listenersInstalled) {
      return;
    }

    state.listenersInstalled = true;
    window.addEventListener("cbo:document-layers-change", (event) => {
      log("layers-change", {
        activeLayerId: getActiveLayerId(),
        source: event?.detail?.source || "",
      }, { coarseOnly: true });
    });
    window.addEventListener("cbo:before-history-action", (event) => {
      log("history-before-action", {
        action: event?.detail?.action || event?.detail?.type || "",
        activeLayerId: getActiveLayerId(),
      }, { coarseOnly: true });
    });
  }

  namespace.EraserZoomDebug = {
    captureActiveState,
    captureLayerState,
    getEvents: () => state.events.slice(),
    getTargetSummary,
    log,
    render: renderNow,
    setEnabled,
    setVisible,
    state,
    warn,
  };

  installEventListeners();

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        log("debug-console-ready", { message: "temporary eraser zoom debug enabled" }, { snapshot: false });
      }, { once: true });
    } else {
      log("debug-console-ready", { message: "temporary eraser zoom debug enabled" }, { snapshot: false });
    }
  }
})(window.CBO = window.CBO || {});
