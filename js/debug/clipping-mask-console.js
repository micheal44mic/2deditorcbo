(function registerClippingMaskConsole(namespace) {
  const OVERLAY_ID = "cbo-clipping-mask-console-overlay";
  const PANEL_ID = "cbo-clipping-mask-console-panel";
  const EVENT_LIMIT = 14;
  const UPDATE_MS = 900;

  const state = {
    events: [],
    expanded: true,
    lastCopyTimer: 0,
    lastLayerSignature: "",
    lastOrderSignature: "",
    lastRender: null,
    lastText: "",
    overlay: null,
    timer: 0,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function formatTime(value) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
      return "--:--:--";
    }

    return date.toTimeString().slice(0, 8);
  }

  function shortText(value, maxLength = 24) {
    const text = String(value == null ? "" : value).trim();

    if (!text) {
      return "none";
    }

    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }

  function flag(value) {
    return value ? "1" : "0";
  }

  function buttonStyle() {
    return [
      "appearance:none",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "min-height:24px",
      "padding:4px 8px",
      "border:1px solid rgba(255,255,255,.18)",
      "border-radius:6px",
      "background:rgba(255,255,255,.08)",
      "color:#eef3ff",
      "font:700 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
      "letter-spacing:0",
      "cursor:pointer",
    ].join(";");
  }

  function flattenEntries(entries, output = []) {
    if (!Array.isArray(entries)) {
      return output;
    }

    entries.forEach((entry) => {
      if (!entry) {
        return;
      }

      if (entry.type !== "group") {
        output.push(entry);
      }
      flattenEntries(entry.children, output);
    });

    return output;
  }

  function getFlatLayersTopToBottom() {
    const model = namespace.documentLayerModel;

    if (model?.flattenTopToBottom) {
      return model.flattenTopToBottom();
    }

    return flattenEntries(model?.getEntries?.() || []);
  }

  function summarizeTarget(layerId) {
    const renderer = namespace.documentRenderer;
    const target = renderer?.rasterTargetsByLayerId?.get?.(layerId);

    if (renderer?.createClippingMaskDebugTargetSummary) {
      return renderer.createClippingMaskDebugTargetSummary(target);
    }

    return {
      state: target ? "target" : "none",
      texture: Boolean(target?.texture),
      textureTiles: Math.max(0, Math.round(Number(target?.textureTileCount || 0))),
      tiles: Math.max(0, target?.tiles?.size || 0),
    };
  }

  function collectRowsFromModel() {
    const layers = getFlatLayersTopToBottom();
    const renderer = namespace.documentRenderer;

    return layers
      .filter((layer) => layer?.clippingMask === true)
      .map((layer) => {
        const index = layers.findIndex((item) => item?.id === layer.id);
        const base = index >= 0 ? layers[index + 1] || null : null;
        const baseTarget = summarizeTarget(base?.id);
        const baseContent = base ? renderer?.hasLayerRenderableOrPendingRasterContent?.(base) === true : false;
        let reason = "waiting-render";
        let status = "watch";

        if (layer.visible === false) {
          reason = "clip-hidden";
          status = "off";
        } else if (!base) {
          reason = "no-base";
          status = "issue";
        } else if (base.visible === false) {
          reason = "base-hidden";
          status = "issue";
        } else if (!baseContent && !baseTarget.texture && !baseTarget.textureTiles) {
          reason = "base-empty";
          status = "issue";
        }

        return {
          baseContent,
          baseId: base?.id || "",
          baseName: base?.name || "",
          basePrepared: false,
          baseTarget,
          baseType: base?.type || "",
          baseVisible: base?.visible !== false,
          layerId: layer.id || "",
          layerName: layer.name || "",
          layerPuppet: renderer?.hasPuppetLayerTransform?.(layer) === true,
          layerVisible: layer.visible !== false,
          reason,
          status,
        };
      });
  }

  function getRows() {
    const renderRows = Array.isArray(state.lastRender?.rows) ? state.lastRender.rows : [];

    return renderRows.length ? renderRows : collectRowsFromModel();
  }

  function getOrderRows(rows = getRows()) {
    const layers = getFlatLayersTopToBottom();

    return rows.map((row) => {
      const layerIndex = layers.findIndex((layer) => layer?.id === row.layerId);
      const baseIndex = layers.findIndex((layer) => layer?.id === row.baseId);

      return {
        baseIndex,
        baseName: row.baseName || row.baseId || "",
        layerIndex,
        layerName: row.layerName || row.layerId || "",
      };
    });
  }

  function getIssue(rows = getRows()) {
    const skip = state.lastRender?.skips?.[0];

    if (skip) {
      return {
        layerName: skip.layerName || skip.layerId || "",
        reason: skip.reason || "skip",
      };
    }

    return rows.find((row) => row.status === "issue") || null;
  }

  function getStatusLine(rows = getRows()) {
    if (!rows.length) {
      return "Status: no clipping masks";
    }

    const issue = getIssue(rows);

    if (issue) {
      return `Status: ISSUE ${shortText(issue.layerName || issue.layerId)} why=${issue.reason}`;
    }

    return `Status: ok | chains ${rows.length}`;
  }

  function formatRow(row) {
    const baseTarget = row.baseTarget || {};
    const baseHasTexture = Boolean(baseTarget.texture);
    const parts = [
      `status=${row.status || "?"}`,
      row.reason && row.reason !== "ready" ? `why=${row.reason}` : "",
      `baseVis=${flag(row.baseVisible !== false)}`,
      `baseTex=${flag(baseHasTexture)}`,
      `basePrep=${flag(row.basePrepared === true)}`,
      `baseContent=${flag(row.baseContent === true)}`,
      row.layerPuppet === true ? "puppet=1" : "",
    ].filter(Boolean);

    return `${shortText(row.layerName || row.layerId)} -> ${shortText(row.baseName || row.baseId)} ${parts.join(" ")}`;
  }

  function formatOrderRow(row) {
    const layerIndex = row.layerIndex >= 0 ? row.layerIndex : "?";
    const baseIndex = row.baseIndex >= 0 ? row.baseIndex : "?";

    return `#${layerIndex} ${shortText(row.layerName)} -> #${baseIndex} ${shortText(row.baseName)}`;
  }

  function addEvent(kind, message, detail = {}) {
    const last = state.events[state.events.length - 1];

    if (last?.message === message && last?.kind === kind) {
      return;
    }

    state.events.push({
      at: nowIso(),
      detail,
      kind,
      message,
    });

    if (state.events.length > EVENT_LIMIT) {
      state.events.splice(0, state.events.length - EVENT_LIMIT);
    }

    render();
  }

  function getLayerSignature() {
    return collectRowsFromModel()
      .map((row) => `${row.layerId}>${row.baseId}:${row.status}:${row.reason}`)
      .join("|");
  }

  function getLayerOrderSignature() {
    return getFlatLayersTopToBottom()
      .map((layer, index) => `${index}:${layer?.id || ""}:${layer?.clippingMask === true ? "clip" : "base"}`)
      .join("|");
  }

  function syncLayerSignature(source = "") {
    const signature = getLayerSignature();
    const orderSignature = getLayerOrderSignature();
    const changed = signature !== state.lastLayerSignature || orderSignature !== state.lastOrderSignature;

    if (!changed) {
      return;
    }

    state.lastLayerSignature = signature;
    state.lastOrderSignature = orderSignature;
    if (source && source !== "layers-panel-clipping-mask") {
      addEvent("layers", `layers changed source=${source}`, { source });
    }
  }

  function handleAction(event) {
    const detail = event.detail || {};
    const layer = shortText(detail.layerName || detail.layerId);
    const base = shortText(detail.baseName || detail.baseId);

    if (detail.result === "ok") {
      addEvent("action", `toggle ${detail.shouldClip ? "ON" : "OFF"} ${layer} -> ${base}`, detail);
    } else {
      addEvent("action", `blocked ${layer} why=${detail.reason}`, detail);
    }
  }

  function handleRenderDebug(event) {
    const detail = event.detail || {};
    const skip = detail.skips?.[0];
    const issue = detail.rows?.find?.((row) => row.status === "issue");

    state.lastRender = detail;

    if (skip) {
      addEvent("render", `skip ${shortText(skip.layerName || skip.layerId)} why=${skip.reason} base=${shortText(skip.baseName || skip.baseId)}`, detail);
      return;
    }

    if (issue) {
      addEvent("render", `issue ${shortText(issue.layerName || issue.layerId)} why=${issue.reason}`, detail);
      return;
    }

    addEvent("render", `render ok chains=${detail.rows?.length || 0}`, detail);
  }

  function collectTelemetry() {
    const rows = getRows();

    return {
      events: state.events.slice(),
      generatedAt: nowIso(),
      lastAction: namespace.lastClippingMaskAction || null,
      lastRender: state.lastRender || namespace.lastClippingMaskDebug || null,
      order: getOrderRows(rows),
      rows,
      status: getStatusLine(rows),
    };
  }

  function buildConsoleText() {
    const telemetry = collectTelemetry();
    const rows = telemetry.rows;
    const render = telemetry.lastRender;
    const eventLines = state.events.slice(-8).map((entry) => (
      `${formatTime(entry.at)} ${entry.message}`
    ));

    return [
      "CBO CLIP DEBUG",
      telemetry.status,
      render ? `Render: frame=${render.frameId || 0} skippedBase=${render.skippedClippingBaseMissing || 0}` : "Render: waiting",
      "",
      "Stack:",
      ...(rows.length ? rows.slice(0, 6).map(formatRow) : ["none"]),
      "",
      "Order:",
      ...(rows.length ? getOrderRows(rows).slice(0, 6).map(formatOrderRow) : ["none"]),
      "",
      "Events:",
      ...(eventLines.length ? eventLines : ["none yet"]),
    ].join("\n");
  }

  function buildCopyText() {
    return [
      `generated=${nowIso()}`,
      `dpr=${window.devicePixelRatio || 1}`,
      "",
      buildConsoleText(),
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
    const copyButton = state.overlay?.querySelector("[data-clipping-mask-console-copy]");

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

  function clearEvents() {
    state.events = [];
    state.lastRender = null;
    namespace.clippingMaskDebugHistory = [];
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
      "left:10px",
      "bottom:10px",
      "z-index:2147483005",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-start",
      "gap:6px",
      "max-width:calc(100vw - 20px)",
      "pointer-events:none",
    ].join(";");

    const toggle = document.createElement("button");

    toggle.type = "button";
    toggle.dataset.clippingMaskConsoleToggle = "true";
    toggle.textContent = "Clip";
    toggle.style.cssText = [
      buttonStyle(),
      "min-width:58px",
      "min-height:32px",
      "background:rgba(13,17,23,.92)",
      "border-color:rgba(255,204,102,.62)",
      "box-shadow:0 10px 24px rgba(0,0,0,.28)",
      "pointer-events:auto",
    ].join(";");

    const panel = document.createElement("div");

    panel.id = PANEL_ID;
    panel.dataset.clippingMaskConsolePanel = "true";
    panel.style.cssText = [
      "width:min(430px,calc(100vw - 20px))",
      "max-height:min(38vh,300px)",
      "box-sizing:border-box",
      "border:1px solid rgba(255,204,102,.58)",
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

    title.textContent = "Clip mask console";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:5px;flex:0 0 auto";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.clippingMaskConsoleCopy = "true";
    copy.textContent = "Copy";
    copy.style.cssText = buttonStyle();

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.style.cssText = buttonStyle();

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close clip mask console");
    close.textContent = "x";
    close.style.cssText = `${buttonStyle()};width:24px;padding:0`;

    const body = document.createElement("pre");
    body.dataset.clippingMaskConsoleBody = "true";
    body.style.cssText = [
      "box-sizing:border-box",
      "margin:0",
      "max-height:calc(min(38vh,300px) - 39px)",
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
    clear.addEventListener("click", clearEvents);

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

    const toggle = overlay.querySelector("[data-clipping-mask-console-toggle]");
    const panel = overlay.querySelector("[data-clipping-mask-console-panel]");

    if (toggle) {
      toggle.hidden = state.expanded;
      toggle.setAttribute("aria-expanded", String(state.expanded));
    }

    if (panel) {
      panel.hidden = !state.expanded;
    }
  }

  function render() {
    const overlay = ensureOverlay();
    const body = overlay.querySelector("[data-clipping-mask-console-body]");
    const text = buildConsoleText();

    if (body && text !== state.lastText) {
      body.textContent = text;
      state.lastText = text;
    }

    syncOverlay();
  }

  function start() {
    ensureOverlay();
    syncLayerSignature();
    render();

    window.addEventListener("cbo:clipping-mask-action", handleAction);
    window.addEventListener("cbo:clipping-mask-debug", handleRenderDebug);
    window.addEventListener("cbo:document-layers-change", (event) => {
      syncLayerSignature(event.detail?.source || "");
      render();
    });

    if (!state.timer) {
      state.timer = window.setInterval(render, UPDATE_MS);
    }

    return collectTelemetry();
  }

  const api = {
    clear: clearEvents,
    collect: collectTelemetry,
    copy: copyConsole,
    log: addEvent,
    render,
    start,
  };

  namespace.ClippingMaskConsole = api;
  namespace.clippingMaskConsole = api;
  namespace.collectClippingMaskConsole = collectTelemetry;
  namespace.copyClippingMaskConsole = copyConsole;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window.CBO = window.CBO || {});
