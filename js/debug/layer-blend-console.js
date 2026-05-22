(function registerLayerBlendConsole(namespace) {
  const OVERLAY_ID = "cbo-layer-blend-console-overlay";
  const PANEL_ID = "cbo-layer-blend-console-panel";
  const TRACE_SCRIPT_ID = "cbo-layer-blend-performance-trace-loader";
  const TRACE_SCRIPT_SRC = "./js/debug/performance-trace.js?v=blend-console-v2";
  const UPDATE_MS = 1000;
  const TRACE_LIMIT = 180;

  const state = {
    expanded: true,
    lastCopyTimer: 0,
    lastText: "",
    overlay: null,
    perfTraceRequested: false,
    running: false,
    timer: 0,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function clampNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function formatMs(value) {
    const ms = Math.max(0, clampNumber(value));

    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }

    return `${ms.toFixed(ms >= 10 ? 1 : 2)}ms`;
  }

  function formatPixels(value) {
    const pixels = Math.max(0, Math.round(clampNumber(value)));

    if (pixels >= 1000000) {
      return `${(pixels / 1000000).toFixed(2)}MPx`;
    }

    if (pixels >= 1000) {
      return `${(pixels / 1000).toFixed(1)}KPx`;
    }

    return `${pixels}px`;
  }

  function formatBytes(value) {
    const bytes = Math.max(0, clampNumber(value));
    const mib = bytes / (1024 * 1024);

    return mib >= 10 ? `${mib.toFixed(1)}MiB` : `${mib.toFixed(2)}MiB`;
  }

  function formatPercent(value) {
    return `${Math.round(Math.max(0, Math.min(1, clampNumber(value, 1))) * 100)}%`;
  }

  function shortText(value, maxLength = 36) {
    const text = String(value == null ? "" : value);

    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }

  function buttonStyle() {
    return [
      "appearance:none",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "min-height:24px",
      "padding:4px 8px",
      "border:1px solid rgba(255,255,255,.16)",
      "border-radius:6px",
      "background:rgba(255,255,255,.08)",
      "color:#eef3ff",
      "font:700 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "cursor:pointer",
    ].join(";");
  }

  function ensurePerfTrace() {
    if (namespace.PerfTrace?.start) {
      namespace.PerfTrace.start({
        limit: TRACE_LIMIT,
        slowThresholdMs: 8,
        updateHz: 2,
        usePerformanceApi: true,
        visible: false,
      });
      return;
    }

    if (state.perfTraceRequested || document.getElementById(TRACE_SCRIPT_ID)) {
      return;
    }

    state.perfTraceRequested = true;

    const script = document.createElement("script");

    script.id = TRACE_SCRIPT_ID;
    script.src = TRACE_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => {
      namespace.PerfTrace?.start?.({
        limit: TRACE_LIMIT,
        slowThresholdMs: 8,
        updateHz: 2,
        usePerformanceApi: true,
        visible: false,
      });
      render();
    });
    document.head.append(script);
  }

  function getBlendModeLabel(mode) {
    return namespace.BlendModes?.getLayerBlendModeLabel?.(mode) || String(mode || "Normal");
  }

  function getBlendModeKeyFromId(id) {
    const mode = namespace.BlendModes?.supportedModes?.find?.((item) => item.id === id);

    return mode?.key || `mode-${id}`;
  }

  function flattenEntries(entries, output = []) {
    if (!Array.isArray(entries)) {
      return output;
    }

    entries.forEach((entry) => {
      if (!entry) {
        return;
      }

      output.push(entry);
      flattenEntries(entry.children, output);
    });

    return output;
  }

  function getTargetSummary(renderer, layerId) {
    const target = renderer?.rasterTargetsByLayerId?.get?.(layerId);

    if (!target) {
      return {
        bytes: 0,
        height: 0,
        kind: "none",
        pixels: 0,
        tileCount: 0,
        width: 0,
      };
    }

    const rect = renderer.getRasterTargetDocumentRect?.(target) || target;
    const width = Math.max(0, Math.round(clampNumber(rect?.width || target.width)));
    const height = Math.max(0, Math.round(clampNumber(rect?.height || target.height)));
    const isSparse = renderer.isSparseRasterTarget?.(target) === true;
    const bytes = renderer.estimateRasterTargetBytes?.(target) || width * height * 4;

    return {
      bytes,
      height,
      kind: isSparse ? "sparse" : target.cropped ? "cropped" : "dense",
      pixels: width * height,
      tileCount: isSparse ? Math.max(0, target.tiles?.size || 0) : 0,
      width,
      x: Math.round(clampNumber(rect?.x)),
      y: Math.round(clampNumber(rect?.y)),
    };
  }

  function collectLayerTelemetry() {
    const renderer = namespace.documentRenderer || null;
    const entries = flattenEntries(namespace.documentLayerModel?.getEntries?.() || []);
    const layers = entries
      .filter((entry) => entry?.type !== "group" && entry?.type !== "background")
      .map((entry) => {
        const blendMode = namespace.BlendModes?.normalizeLayerBlendMode?.(entry.blendMode) || "normal";
        const visible = entry.visible !== false;
        const advanced = visible && blendMode !== "normal";

        return {
          blendMode,
          blendModeLabel: getBlendModeLabel(blendMode),
          clippingMask: entry.clippingMask === true,
          effects: Array.isArray(entry.effects)
            ? entry.effects.filter((effect) => effect?.enabled !== false).map((effect) => effect.type || "effect")
            : [],
          id: entry.id || "",
          name: entry.name || "",
          opacity: Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1,
          target: advanced ? getTargetSummary(renderer, entry.id) : null,
          type: entry.type || "",
          visible,
        };
      });
    const advancedLayers = layers.filter((layer) => layer.visible && layer.blendMode !== "normal");

    return {
      advancedLayers,
      layerCount: layers.length,
      layers,
      visibleCount: layers.filter((layer) => layer.visible).length,
    };
  }

  function collectTraceTelemetry() {
    const trace = namespace.PerfTrace?.collect?.({ limit: TRACE_LIMIT }) || namespace.collectPerformanceTrace?.({ limit: TRACE_LIMIT }) || null;
    const recent = Array.isArray(trace?.recent) ? [...trace.recent].reverse() : [];
    const blendEvents = recent.filter((entry) => entry?.name === "layer-composite.draw");
    const canvasEvents = recent.filter((entry) => entry?.name === "canvas.draw");
    const previewEvents = recent.filter((entry) => entry?.name === "preview-cache.update");
    const modeTotals = new Map();

    blendEvents.forEach((entry) => {
      const detail = entry.detail || {};
      const modeId = Math.max(0, Math.round(clampNumber(detail.blendModeId)));
      const mode = getBlendModeKeyFromId(modeId);
      const row = modeTotals.get(mode) || {
        count: 0,
        maxMs: 0,
        mode,
        sourcePixels: 0,
        totalMs: 0,
        viewportPixels: 0,
      };
      const scissorWidth = Math.max(0, Math.round(clampNumber(detail.scissorWidth)));
      const scissorHeight = Math.max(0, Math.round(clampNumber(detail.scissorHeight)));
      const fillWidth = scissorWidth > 0 ? scissorWidth : clampNumber(detail.viewportWidth);
      const fillHeight = scissorHeight > 0 ? scissorHeight : clampNumber(detail.viewportHeight);

      row.count += 1;
      row.totalMs += clampNumber(entry.durationMs);
      row.maxMs = Math.max(row.maxMs, clampNumber(entry.durationMs));
      row.sourcePixels += Math.max(0, Math.round(clampNumber(detail.sourceWidth) * clampNumber(detail.sourceHeight)));
      row.viewportPixels += Math.max(0, Math.round(fillWidth * fillHeight));
      modeTotals.set(mode, row);
    });

    return {
      blendEvents,
      canvasEvents,
      enabled: trace?.enabled === true,
      eventCount: trace?.eventCount || 0,
      lastBlend: blendEvents[blendEvents.length - 1] || null,
      lastCanvas: canvasEvents[canvasEvents.length - 1] || null,
      lastPreview: previewEvents[previewEvents.length - 1] || null,
      modeTotals: Array.from(modeTotals.values()).sort((first, second) => second.totalMs - first.totalMs),
      recent,
      traceReady: Boolean(trace),
    };
  }

  function collectRendererTelemetry() {
    const renderer = namespace.documentRenderer || null;

    if (!renderer) {
      return {
        ready: false,
      };
    }

    return {
      compositeScratchBytes: Math.max(0, Math.round(renderer.layerCompositeWidth || 0)) *
        Math.max(0, Math.round(renderer.layerCompositeHeight || 0)) * 4 * 2,
      compositeScratchHeight: Math.max(0, Math.round(renderer.layerCompositeHeight || 0)),
      compositeScratchWidth: Math.max(0, Math.round(renderer.layerCompositeWidth || 0)),
      documentHeight: Math.max(0, Math.round(renderer.height || 0)),
      documentWidth: Math.max(0, Math.round(renderer.width || 0)),
      previewCacheDirty: renderer.previewCacheDirty === true,
      previewCacheHeight: Math.max(0, Math.round(renderer.previewCacheHeight || 0)),
      previewCacheReady: renderer.previewCacheReady === true,
      previewCacheReason: renderer.previewCacheReason || "",
      previewCacheScale: clampNumber(renderer.previewCacheScale, 1),
      previewCacheWidth: Math.max(0, Math.round(renderer.previewCacheWidth || 0)),
      ready: true,
    };
  }

  function collectTelemetry() {
    return {
      generatedAt: nowIso(),
      layers: collectLayerTelemetry(),
      renderer: collectRendererTelemetry(),
      trace: collectTraceTelemetry(),
    };
  }

  function getFrameStatus(trace) {
    if (!trace.traceReady) {
      return "trace loading";
    }

    if (!trace.lastCanvas) {
      return "waiting for render";
    }

    return `${formatMs(trace.lastCanvas.durationMs)} canvas.draw`;
  }

  function buildConsoleText() {
    const telemetry = collectTelemetry();
    const renderer = telemetry.renderer;
    const layers = telemetry.layers;
    const trace = telemetry.trace;
    const scratch = renderer.ready && renderer.compositeScratchWidth > 0
      ? `${renderer.compositeScratchWidth}x${renderer.compositeScratchHeight} ${formatBytes(renderer.compositeScratchBytes)}`
      : "none yet";
    const cache = renderer.ready
      ? `${renderer.previewCacheReady ? "ready" : "not ready"} / ${renderer.previewCacheDirty ? "dirty" : "clean"} / ${renderer.previewCacheWidth}x${renderer.previewCacheHeight} @ ${renderer.previewCacheScale.toFixed(3)}`
      : "renderer not ready";
    const modeLines = trace.modeTotals.slice(0, 5).map((row) => (
      `${row.mode}: ${formatMs(row.totalMs)} / ${row.count}x / max ${formatMs(row.maxMs)} / src ${formatPixels(row.sourcePixels)} / fill ${formatPixels(row.viewportPixels)}`
    ));
    const layerLines = layers.advancedLayers.slice(0, 6).map((layer) => {
      const target = layer.target;
      const flags = [
        layer.clippingMask ? "clip" : "",
        layer.effects.length ? `fx:${layer.effects.join("+")}` : "",
        target.tileCount ? `${target.tileCount} tiles` : "",
      ].filter(Boolean).join(" ");

      return `${shortText(layer.name || layer.id, 24)} ${layer.blendMode} ${formatPercent(layer.opacity)} ${target.kind} ${target.width}x${target.height} ${formatBytes(target.bytes)}${flags ? ` ${flags}` : ""}`;
    });

    return [
      "CBO LAYER BLEND CONSOLE",
      `Status: ${state.running ? "recording" : "paused"} | ${getFrameStatus(trace)}`,
      `Layers: ${layers.visibleCount}/${layers.layerCount} visible | advanced blend ${layers.advancedLayers.length}`,
      `Composite scratch: ${scratch}`,
      `Preview cache: ${cache}`,
      "",
      "Blend cost from renderer trace:",
      ...(modeLines.length ? modeLines : ["none yet"]),
      "",
      "Advanced blend layers:",
      ...(layerLines.length ? layerLines : ["none"]),
      "",
      "Last events:",
      `canvas: ${trace.lastCanvas ? formatMs(trace.lastCanvas.durationMs) : "none"}`,
      `blend pass: ${trace.lastBlend ? `${formatMs(trace.lastBlend.durationMs)} mode ${trace.lastBlend.detail?.blendModeId}` : "none"}`,
      `preview cache: ${trace.lastPreview ? formatMs(trace.lastPreview.durationMs) : "none"}`,
    ].join("\n");
  }

  function buildCopyText() {
    const telemetry = collectTelemetry();

    return [
      "CBO LAYER BLEND DEBUG",
      `generatedAt=${telemetry.generatedAt}`,
      `userAgent=${navigator.userAgent || ""}`,
      `devicePixelRatio=${window.devicePixelRatio || 1}`,
      "",
      "[summary]",
      buildConsoleText(),
      "",
      "[json]",
      JSON.stringify(telemetry, null, 2),
    ].join("\n");
  }

  function fallbackCopy(text) {
    const input = document.createElement("textarea");

    input.value = text;
    input.setAttribute("readonly", "true");
    input.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    document.body.append(input);
    input.focus();
    input.select();

    try {
      document.execCommand("copy");
    } finally {
      input.remove();
    }
  }

  async function copyConsole() {
    const text = buildCopyText();
    const copyButton = state.overlay?.querySelector("[data-layer-blend-console-copy]");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }

      if (copyButton) {
        copyButton.textContent = "Copied";
      }
    } catch (error) {
      fallbackCopy(text);
      if (copyButton) {
        copyButton.textContent = "Copied";
      }
    }

    window.clearTimeout(state.lastCopyTimer);
    state.lastCopyTimer = window.setTimeout(() => {
      if (copyButton) {
        copyButton.textContent = "Copy";
      }
    }, 900);
  }

  function clearTrace() {
    namespace.PerfTrace?.reset?.();
    render();
  }

  function ensureOverlay() {
    if (state.overlay && document.body.contains(state.overlay)) {
      return state.overlay;
    }

    const overlay = document.createElement("div");

    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position:fixed",
      "right:10px",
      "bottom:10px",
      "z-index:2147483004",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-end",
      "gap:6px",
      "max-width:calc(100vw - 20px)",
      "pointer-events:none",
    ].join(";");

    const toggle = document.createElement("button");

    toggle.type = "button";
    toggle.dataset.layerBlendConsoleToggle = "true";
    toggle.textContent = "Blend";
    toggle.style.cssText = [
      buttonStyle(),
      "min-width:68px",
      "min-height:32px",
      "background:rgba(13,17,23,.92)",
      "border-color:rgba(102,217,239,.58)",
      "box-shadow:0 10px 24px rgba(0,0,0,.28)",
      "pointer-events:auto",
    ].join(";");

    const panel = document.createElement("div");

    panel.id = PANEL_ID;
    panel.dataset.layerBlendConsolePanel = "true";
    panel.style.cssText = [
      "width:min(500px,calc(100vw - 20px))",
      "max-height:min(42vh,330px)",
      "box-sizing:border-box",
      "border:1px solid rgba(102,217,239,.52)",
      "border-radius:8px",
      "background:rgba(13,17,23,.94)",
      "color:#eef3ff",
      "box-shadow:0 14px 34px rgba(0,0,0,.34)",
      "backdrop-filter:blur(9px)",
      "overflow:hidden",
      "pointer-events:auto",
    ].join(";");

    const header = document.createElement("div");

    header.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:10px",
      "padding:7px 9px",
      "border-bottom:1px solid rgba(255,255,255,.1)",
      "font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "text-transform:uppercase",
    ].join(";");

    const title = document.createElement("span");

    title.textContent = "Layer blend console";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:5px;flex:0 0 auto";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.layerBlendConsoleCopy = "true";
    copy.textContent = "Copy";
    copy.style.cssText = buttonStyle();

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.style.cssText = buttonStyle();

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close layer blend console");
    close.textContent = "x";
    close.style.cssText = `${buttonStyle()};width:24px;padding:0`;

    const body = document.createElement("pre");
    body.dataset.layerBlendConsoleBody = "true";
    body.style.cssText = [
      "box-sizing:border-box",
      "margin:0",
      "max-height:calc(min(42vh,330px) - 39px)",
      "overflow:auto",
      "padding:9px 11px",
      "font:11px/1.36 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "white-space:pre-wrap",
      "overflow-wrap:anywhere",
    ].join(";");

    toggle.addEventListener("click", () => {
      state.expanded = true;
      syncOverlay();
      render();
    });
    close.addEventListener("click", () => {
      state.expanded = false;
      syncOverlay();
    });
    copy.addEventListener("click", copyConsole);
    clear.addEventListener("click", clearTrace);

    actions.append(copy, clear, close);
    header.append(title, actions);
    panel.append(header, body);
    overlay.append(toggle, panel);
    document.body.append(overlay);
    state.overlay = overlay;
    syncOverlay();
    return overlay;
  }

  function syncOverlay() {
    const overlay = state.overlay;

    if (!overlay) {
      return;
    }

    const toggle = overlay.querySelector("[data-layer-blend-console-toggle]");
    const panel = overlay.querySelector("[data-layer-blend-console-panel]");

    if (toggle) {
      toggle.hidden = state.expanded;
      toggle.setAttribute("aria-expanded", String(state.expanded));
    }

    if (panel) {
      panel.hidden = !state.expanded;
    }
  }

  function render() {
    ensurePerfTrace();

    const overlay = ensureOverlay();
    const body = overlay.querySelector("[data-layer-blend-console-body]");
    const text = buildConsoleText();

    if (body && text !== state.lastText) {
      body.textContent = text;
      state.lastText = text;
    }

    syncOverlay();
  }

  function start() {
    state.running = true;
    ensureOverlay();
    ensurePerfTrace();
    render();

    if (!state.timer) {
      state.timer = window.setInterval(render, UPDATE_MS);
    }

    return collectTelemetry();
  }

  function stop() {
    state.running = false;

    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = 0;
    }

    namespace.PerfTrace?.stop?.({ visible: false });
    render();
    return collectTelemetry();
  }

  const api = {
    clear: clearTrace,
    collect: collectTelemetry,
    copy: copyConsole,
    render,
    start,
    stop,
  };

  namespace.LayerBlendConsole = api;
  namespace.layerBlendConsole = api;
  namespace.collectLayerBlendConsole = collectTelemetry;
  namespace.copyLayerBlendConsole = copyConsole;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window.CBO = window.CBO || {});
