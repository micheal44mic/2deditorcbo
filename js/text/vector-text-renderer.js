(function registerVectorTextRenderer(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TEXT_LAYER_TYPE = "vector-text";
  const CORNER_ENVELOPE_NODES = ["TL", "TR", "BL", "BR"];
  const CENTER_ENVELOPE_NODES = ["TC", "BC"];
  const HANDLE_ENVELOPE_NODES = ["TC_HandleL", "TC_HandleR", "BC_HandleL", "BC_HandleR"];

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, String(value));
      }
    });

    return element;
  }

  function isTextLayer(entry) {
    return entry?.type === TEXT_LAYER_TYPE || entry?.type === "text" || entry?.kind === "text";
  }

  function isFormField(target) {
    return (
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable)
    );
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    }

    return value;
  }

  function findEntryById(entries, id) {
    for (const entry of entries || []) {
      if (entry.id === id) {
        return entry;
      }

      const child = findEntryById(entry.children || [], id);

      if (child) {
        return child;
      }
    }

    return null;
  }

  function insertEntryAbove(entries, targetId, entry) {
    if (!targetId) {
      return false;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const current = entries[index];

      if (current.id === targetId) {
        entries.splice(index, 0, entry);
        return true;
      }

      if (current.type === "group" && insertEntryAbove(current.children || [], targetId, entry)) {
        return true;
      }
    }

    return false;
  }

  function insertAboveBackground(entries, entry) {
    const backgroundIndex = entries.findIndex(
      (candidate) => candidate.id === "background" || candidate.type === "background",
    );
    const index = backgroundIndex >= 0 ? backgroundIndex : entries.length;

    entries.splice(index, 0, entry);
  }

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function formatLayerTransform(layer) {
    const x = toFiniteNumber(layer.x, 0);
    const y = toFiniteNumber(layer.y, 0);
    const rotation = toFiniteNumber(layer.rotation, 0);
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);

    return `translate(${x} ${y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`;
  }

  function pointList(...points) {
    return points.map((point) => `${point.x} ${point.y}`).join(" ");
  }

  function topCurvePath(grid) {
    const p1 = {
      x: grid.TL.x + (grid.TC.x - grid.TL.x) / 3,
      y: grid.TL.y,
    };
    const p2 = {
      x: grid.TR.x - (grid.TR.x - grid.TC.x) / 3,
      y: grid.TR.y,
    };

    return [
      `M ${grid.TL.x} ${grid.TL.y}`,
      `C ${p1.x} ${p1.y} ${grid.TC_HandleL.x} ${grid.TC_HandleL.y} ${grid.TC.x} ${grid.TC.y}`,
      `C ${grid.TC_HandleR.x} ${grid.TC_HandleR.y} ${p2.x} ${p2.y} ${grid.TR.x} ${grid.TR.y}`,
    ].join(" ");
  }

  function bottomCurvePath(grid) {
    const p1 = {
      x: grid.BL.x + (grid.BC.x - grid.BL.x) / 3,
      y: grid.BL.y,
    };
    const p2 = {
      x: grid.BR.x - (grid.BR.x - grid.BC.x) / 3,
      y: grid.BR.y,
    };

    return [
      `M ${grid.BL.x} ${grid.BL.y}`,
      `C ${p1.x} ${p1.y} ${grid.BC_HandleL.x} ${grid.BC_HandleL.y} ${grid.BC.x} ${grid.BC.y}`,
      `C ${grid.BC_HandleR.x} ${grid.BC_HandleR.y} ${p2.x} ${p2.y} ${grid.BR.x} ${grid.BR.y}`,
    ].join(" ");
  }

  function colorWithOpacity(color, opacity) {
    const clampedOpacity = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
    const hex = String(color || "#000000").trim();

    if (clampedOpacity >= 1) {
      return hex;
    }

    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      const [r, g, b] = hex
        .slice(1)
        .split("")
        .map((value) => Number.parseInt(value + value, 16));

      return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
    }

    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);

      return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
    }

    return hex;
  }

  function getLayerSignature(layer) {
    return JSON.stringify({
      envelopeGrid: layer.envelopeGrid || null,
      alternates: layer.alternates,
      fontSize: layer.fontSize,
      fontUrl: layer.fontUrl,
      letterSpacing: layer.letterSpacing,
      ligatures: layer.ligatures,
      lineHeight: layer.lineHeight,
      text: layer.text,
      textAlign: layer.textAlign,
      uppercase: layer.uppercase,
      warp: layer.warp || null,
    });
  }

  function safeDomId(value) {
    return String(value || "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/^-+/, "id-");
  }

  function getStrokeAlign(layer) {
    return ["outer", "inner", "center"].includes(layer.style?.strokeAlign)
      ? layer.style.strokeAlign
      : "center";
  }

  function resolveCameraState() {
    const brushEngine = namespace.brushEngine;
    const camera = brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera,
      dpr: Math.max(1, brushEngine?.dpr || window.devicePixelRatio || 1),
      viewportHeight: Math.max(1, brushEngine?.viewportHeight || 1),
      viewportWidth: Math.max(1, brushEngine?.viewportWidth || 1),
    };
  }

  function getCenteredDocumentPoint() {
    const stage = document.querySelector(".editor-stage");
    const { camera, dpr } = resolveCameraState();
    const rect = stage?.getBoundingClientRect();
    const viewportX = ((rect?.width || 1) * dpr) / 2;
    const viewportY = ((rect?.height || 1) * dpr) / 2;
    const zoom = Math.max(0.0001, camera.zoom || 1);

    return {
      x: (viewportX - (camera.x || 0)) / zoom,
      y: (viewportY - (camera.y || 0)) / zoom,
    };
  }

  function getLayerVisualCenterOffset(layer, bounds) {
    const centerX = (bounds.x1 + bounds.x2) / 2;
    const centerY = (bounds.y1 + bounds.y2) / 2;
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);
    const radians = (toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
    const scaledX = centerX * scaleX;
    const scaledY = centerY * scaleY;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: scaledX * cos - scaledY * sin,
      y: scaledX * sin + scaledY * cos,
    };
  }

  function getWarpedTextBounds(layer, font) {
    const engine = namespace.VectorTextEngine;
    const path = engine.createTextPath(font, layer.text, layer.fontSize, {
      letterSpacing: layer.letterSpacing,
      ligatures: layer.ligatures,
      lineHeight: layer.lineHeight,
      textAlign: layer.textAlign,
      uppercase: layer.uppercase,
    });
    const bounds = path.getBoundingBox();

    if (layer.envelopeGrid) {
      engine.applyEnvelopeWarp(path, layer.envelopeGrid);
    } else {
      path.commands = engine.warpPathCommands(path.commands, bounds, layer.warp);
    }

    return path.getBoundingBox();
  }

  function centerVectorTextLayer(layerModel, layerId, targetPoint) {
    const engine = namespace.VectorTextEngine;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!layer || !engine?.loadOpenTypeFont) {
      return;
    }

    const initialX = layer.x;
    const initialY = layer.y;

    engine
      .loadOpenTypeFont(layer.fontUrl || engine.DEFAULT_FONT_URL)
      .then((font) => {
        const currentLayer = layerModel.findEntryById(layerId);

        if (!currentLayer || currentLayer.x !== initialX || currentLayer.y !== initialY) {
          return;
        }

        const bounds = getWarpedTextBounds(currentLayer, font);
        const offset = getLayerVisualCenterOffset(currentLayer, bounds);

        layerModel.updateLayer(layerId, {
          x: targetPoint.x - offset.x,
          y: targetPoint.y - offset.y,
        }, { source: "vector-text-center" });
      })
      .catch((error) => {
        console.warn("Impossibile centrare il testo vettoriale.", error);
      });
  }

  namespace.createVectorTextLayer = function createVectorTextLayer(seed = {}) {
    const layerModel = namespace.documentLayerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (!layerModel) {
      return null;
    }

    namespace.documentLayerModel = layerModel;

    const centeredPoint = getCenteredDocumentPoint();
    const shouldCenterVisually = !Number.isFinite(seed.x) && !Number.isFinite(seed.y);
    const layer = layerModel.createLayer({
      type: TEXT_LAYER_TYPE,
      x: Number.isFinite(seed.x) ? seed.x : centeredPoint.x,
      y: Number.isFinite(seed.y) ? seed.y : centeredPoint.y,
      ...seed,
    });
    const entries = layerModel.getEntries();
    const activeLayer = findEntryById(entries, layerModel.activeLayerId);
    const didInsert = activeLayer?.type !== "background"
      ? insertEntryAbove(entries, activeLayer?.id, layer)
      : false;

    if (!didInsert) {
      insertAboveBackground(entries, layer);
    }

    layerModel.setEntries(entries, { source: "vector-text-create" });
    layerModel.setActiveLayer(layer.id, { source: "vector-text-create" });

    if (shouldCenterVisually) {
      centerVectorTextLayer(layerModel, layer.id, centeredPoint);
    }

    return cloneValue(layer);
  };

  class VectorTextRenderer {
    constructor(options = {}) {
      this.stage = options.stage;
      this.layerModel = options.layerModel;
      this.svg = null;
      this.defs = null;
      this.hitArea = null;
      this.viewportGroup = null;
      this.contentGroup = null;
      this.pathCache = new Map();
      this.fontCache = new Map();
      this.fontRequests = new Map();
      this.frameRequest = 0;
      this.interactionTimer = 0;
      this.isInteracting = false;
      this.activeTool = "";
      this.dragState = null;
      this.envelopeDragState = null;

      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleDragMove = this.handleDragMove.bind(this);
      this.handleDragEnd = this.handleDragEnd.bind(this);
      this.handleEnvelopeDragMove = this.handleEnvelopeDragMove.bind(this);
      this.handleEnvelopeDragEnd = this.handleEnvelopeDragEnd.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);

      this.mount();
      this.bindEvents();
      this.scheduleContentRender();
    }

    mount() {
      if (!this.stage) {
        throw new Error("VectorTextRenderer richiede .editor-stage.");
      }

      this.svg = createSvgElement("svg", {
        "aria-label": "Layer testo vettoriali",
        class: "editor-vector-overlay",
        focusable: "false",
      });
      this.defs = createSvgElement("defs");
      this.hitArea = createSvgElement("rect", {
        class: "editor-vector-hit-area",
        fill: "transparent",
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });
      this.viewportGroup = createSvgElement("g", { class: "editor-vector-viewport" });
      this.contentGroup = createSvgElement("g", { class: "editor-vector-content" });

      this.viewportGroup.append(this.contentGroup);
      this.svg.append(this.defs, this.hitArea, this.viewportGroup);
      this.stage.append(this.svg);
      this.updateViewportSize();
      this.updateCameraTransform();
    }

    bindEvents() {
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("resize", () => {
        this.updateViewportSize();
        this.updateCameraTransform();
      });
      this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
      this.svg.addEventListener("pointerdown", this.handlePointerDown);
      this.layerModel?.addEventListener?.("change", this.handleDocumentChange);
    }

    handleWheel(event) {
      namespace.brushEngine?.handleWheel?.(event);
    }

    handleToolChange(event) {
      const detail = event.detail || {};
      const label = String(detail.label || "").toLowerCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();
      this.activeTool = toolMode || label;
      this.svg.classList.toggle("text-tool-active", this.activeTool === "text" || this.activeTool === "type");

      if (this.activeTool === "text" || this.activeTool === "type") {
        namespace.createVectorTextLayer();
      }
    }

    handleDocumentChange() {
      this.scheduleContentRender();
    }

    handleCameraChange() {
      this.updateViewportSize();
      this.updateCameraTransform();
      this.beginInteraction();
    }

    handleKeyDown(event) {
      if (isFormField(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        const layer = this.getActiveTextLayer();

        if (!layer) {
          return;
        }

        event.preventDefault();
        namespace.createVectorTextLayer({
          ...cloneValue(layer),
          id: undefined,
          name: `${layer.name || "Text"} Copy`,
          x: toFiniteNumber(layer.x, 0) + 120,
          y: toFiniteNumber(layer.y, 0) + 120,
        });
      }
    }

    beginInteraction() {
      if (!this.isInteracting) {
        this.isInteracting = true;
        this.svg.classList.add("is-interacting");
        this.scheduleContentRender();
      }

      if (this.interactionTimer) {
        window.clearTimeout(this.interactionTimer);
      }

      this.interactionTimer = window.setTimeout(() => {
        this.isInteracting = false;
        this.svg.classList.remove("is-interacting");
        this.interactionTimer = 0;
        this.scheduleContentRender();
      }, 140);
    }

    updateViewportSize() {
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    updateCameraTransform() {
      const { camera, dpr } = resolveCameraState();
      const zoom = Math.max(0.0001, camera.zoom || 1);
      const x = (camera.x || 0) / dpr;
      const y = (camera.y || 0) / dpr;

      this.viewportGroup.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
    }

    scheduleContentRender() {
      if (this.frameRequest) {
        return;
      }

      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0;
        this.renderContent();
      });
    }

    getFont(url) {
      const fontUrl = url || namespace.VectorTextEngine?.DEFAULT_FONT_URL;

      if (this.fontCache.has(fontUrl)) {
        return this.fontCache.get(fontUrl);
      }

      if (!this.fontRequests.has(fontUrl)) {
        const request = namespace.VectorTextEngine
          .loadOpenTypeFont(fontUrl)
          .then((font) => {
            this.fontCache.set(fontUrl, font);
            this.fontRequests.delete(fontUrl);
            this.scheduleContentRender();
            return font;
          })
          .catch((error) => {
            this.fontRequests.delete(fontUrl);
            console.warn("Impossibile caricare il font vettoriale.", error);
            return null;
          });

        this.fontRequests.set(fontUrl, request);
      }

      return null;
    }

    getPathData(layer, font) {
      const signature = getLayerSignature(layer);
      const cached = this.pathCache.get(layer.id);

      if (cached?.signature === signature) {
        return cached.pathData;
      }

      const pathData = namespace.VectorTextEngine.getWarpedPathData({
        alternates: layer.alternates,
        envelopeGrid: layer.envelopeGrid,
        font,
        fontSize: layer.fontSize,
        letterSpacing: layer.letterSpacing,
        ligatures: layer.ligatures,
        lineHeight: layer.lineHeight,
        text: layer.text,
        textAlign: layer.textAlign,
        uppercase: layer.uppercase,
        warp: layer.warp,
      });

      this.pathCache.set(layer.id, { pathData, signature });

      return pathData;
    }

    getRenderableTextLayers() {
      const renderable = this.layerModel?.getRenderableLayers?.() || [];

      return renderable.filter(isTextLayer);
    }

    getActiveTextLayer() {
      const activeId = this.layerModel?.activeLayerId;

      return this.getRenderableTextLayers().find((layer) => layer.id === activeId) || null;
    }

    getLayerNode(layerId) {
      if (!layerId || !this.contentGroup) {
        return null;
      }

      return Array.from(this.contentGroup.querySelectorAll("[data-layer-id]"))
        .find((node) => node.getAttribute("data-layer-id") === layerId) || null;
    }

    renderContent() {
      const layers = this.getRenderableTextLayers();
      const activeLayerId = this.layerModel?.activeLayerId || "";
      const nodes = [];
      const defs = [];

      layers.forEach((layer) => {
        if (layer.visible === false) {
          return;
        }

        const font = this.getFont(layer.fontUrl);

        if (!font) {
          return;
        }

        const pathData = this.getPathData(layer, font);
        const filter = this.createDropShadowFilter(layer);
        const node = this.createTextLayerNode(layer, pathData, {
          active: layer.id === activeLayerId,
          defs,
          filterId: filter?.id || "",
        });

        if (filter) {
          defs.push(filter.node);
        }

        nodes.push(node);
      });

      this.defs.replaceChildren(...defs);
      this.contentGroup.replaceChildren(...nodes);
      this.updateCameraTransform();
    }

    createDropShadowFilter(layer) {
      if (this.isInteracting || layer.shadowType !== "drop") {
        return null;
      }

      const shadow = layer.style?.shadow || {};
      const opacity = Number.isFinite(shadow.opacity) ? shadow.opacity : 0;
      const blur = Number.isFinite(shadow.blur) ? shadow.blur : 0;

      if (opacity <= 0) {
        return null;
      }

      const angle = (toFiniteNumber(layer.shadowAngle, 0) * Math.PI) / 180;
      const distance = Math.max(0, toFiniteNumber(layer.shadowDistance, 0));
      const id = `cbo-vector-shadow-${safeDomId(layer.id)}`;
      const filter = createSvgElement("filter", {
        height: "300%",
        id,
        width: "300%",
        x: "-100%",
        y: "-100%",
      });
      const dropShadow = createSvgElement("feDropShadow", {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        "flood-color": shadow.color || "#000000",
        "flood-opacity": opacity,
        stdDeviation: Math.max(0, blur / 2),
      });

      filter.append(dropShadow);

      return { id, node: filter };
    }

    createTextLayerNode(layer, pathData, options = {}) {
      const group = createSvgElement("g", {
        class: `editor-vector-text-layer${options.active ? " active" : ""}`,
        "data-layer-id": layer.id,
        opacity: toFiniteNumber(layer.opacity, 1),
        transform: formatLayerTransform(layer),
      });

      if (layer.locked === true) {
        group.classList.add("locked");
      }

      this.appendSolidShadow(group, layer, pathData);

      const paintGroup = this.createTextPaintGroup(layer, pathData, options);

      group.append(paintGroup);

      if (options.active && layer.envelopeGrid) {
        group.append(this.createEnvelopeControls(layer));
      }

      group.addEventListener("pointerdown", (event) => this.handleTextLayerPointerDown(event, layer.id));

      return group;
    }

    createTextPaintPath(layer, pathData, attributes = {}) {
      return createSvgElement("path", {
        class: "editor-vector-text-path",
        d: pathData,
        "fill-rule": "nonzero",
        "stroke-linejoin": "round",
        ...attributes,
      });
    }

    createTextPaintGroup(layer, pathData, options = {}) {
      const paintGroup = createSvgElement("g", { class: "editor-vector-text-paint" });
      const fill = layer.style?.fill || "#f8efe2";
      const stroke = layer.style?.stroke || "#1b1713";
      const strokeWidth = Math.max(0, toFiniteNumber(layer.style?.strokeWidth, 0));
      const strokeAlign = getStrokeAlign(layer);

      if (options.filterId) {
        paintGroup.setAttribute("filter", `url(#${options.filterId})`);
      }

      if (strokeWidth <= 0) {
        paintGroup.append(this.createTextPaintPath(layer, pathData, {
          fill,
          stroke: "none",
        }));
        return paintGroup;
      }

      if (strokeAlign === "outer") {
        paintGroup.append(
          this.createTextPaintPath(layer, pathData, {
            fill: "none",
            stroke,
            "stroke-width": strokeWidth * 2,
          }),
          this.createTextPaintPath(layer, pathData, {
            fill,
            stroke: "none",
          }),
        );
        return paintGroup;
      }

      if (strokeAlign === "inner") {
        const clipId = `cbo-vector-inner-stroke-${safeDomId(layer.id)}`;
        const clipPath = createSvgElement("clipPath", { id: clipId });

        clipPath.append(this.createTextPaintPath(layer, pathData, {
          fill: "#ffffff",
          stroke: "none",
        }));
        options.defs?.push?.(clipPath);
        paintGroup.append(
          this.createTextPaintPath(layer, pathData, {
            fill,
            stroke: "none",
          }),
          this.createTextPaintPath(layer, pathData, {
            "clip-path": `url(#${clipId})`,
            fill: "none",
            stroke,
            "stroke-width": strokeWidth * 2,
          }),
        );
        return paintGroup;
      }

      paintGroup.append(this.createTextPaintPath(layer, pathData, {
        fill,
        stroke,
        "stroke-width": strokeWidth,
      }));

      return paintGroup;
    }

    createEnvelopeControls(layer) {
      const grid = layer.envelopeGrid;
      const group = createSvgElement("g", { class: "editor-vector-envelope-ui" });
      const guideAttributes = {
        fill: "none",
        stroke: "#00a3ff",
        "stroke-dasharray": "16 10",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": 3,
        "vector-effect": "non-scaling-stroke",
      };

      group.append(
        createSvgElement("path", { ...guideAttributes, d: topCurvePath(grid) }),
        createSvgElement("path", { ...guideAttributes, d: bottomCurvePath(grid) }),
        createSvgElement("polyline", { ...guideAttributes, points: pointList(grid.TL, grid.BL) }),
        createSvgElement("polyline", { ...guideAttributes, points: pointList(grid.TR, grid.BR) }),
        createSvgElement("polyline", {
          fill: "none",
          points: pointList(grid.TC, grid.BC),
          stroke: "rgba(0, 163, 255, 0.45)",
          "stroke-dasharray": "8 8",
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
        }),
      );

      [
        ["TC", "TC_HandleL"],
        ["TC", "TC_HandleR"],
        ["BC", "BC_HandleL"],
        ["BC", "BC_HandleR"],
      ].forEach(([anchorId, handleId]) => {
        group.append(createSvgElement("polyline", {
          fill: "none",
          points: pointList(grid[anchorId], grid[handleId]),
          stroke: "rgba(23, 61, 53, 0.72)",
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
        }));
      });

      CORNER_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, 8, "#f9f2e8", "#0077b6"));
      });
      CENTER_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, 10, "#00a3ff", "#f9f2e8"));
      });
      HANDLE_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, 7, "#173d35", "#f9f2e8"));
      });

      return group;
    }

    createEnvelopeHandle(layer, nodeId, radius, fill, stroke) {
      const point = layer.envelopeGrid[nodeId];
      const handle = createSvgElement("circle", {
        class: "editor-vector-envelope-handle",
        "data-envelope-node": nodeId,
        cx: point.x,
        cy: point.y,
        fill,
        r: radius,
        stroke,
        "stroke-width": 2.5,
        "vector-effect": "non-scaling-stroke",
      });

      handle.addEventListener("pointerdown", (event) => {
        this.handleEnvelopePointerDown(event, layer.id, nodeId);
      });

      return handle;
    }

    appendSolidShadow(group, layer, pathData) {
      if (this.isInteracting || layer.shadowType !== "solid") {
        return;
      }

      const shadow = layer.style?.shadow || {};
      const opacity = Number.isFinite(shadow.opacity) ? shadow.opacity : 0;
      const distance = Math.max(0, toFiniteNumber(layer.shadowDistance, 0));

      if (opacity <= 0 || distance <= 0) {
        return;
      }

      const shadowGroup = createSvgElement("g", { class: "editor-vector-solid-shadow" });
      const angle = (toFiniteNumber(layer.shadowAngle, 0) * Math.PI) / 180;
      const maxSteps = 140;
      const steps = Math.max(1, Math.min(maxSteps, Math.ceil(distance)));
      const stepDistance = distance / steps;
      const color = colorWithOpacity(shadow.color || "#000000", opacity);

      for (let index = steps; index >= 1; index -= 1) {
        const offset = index * stepDistance;
        const path = createSvgElement("path", {
          d: pathData,
          fill: color,
          stroke: color,
          "stroke-linejoin": "round",
          "stroke-width": 1.5,
          transform: `translate(${Math.cos(angle) * offset} ${Math.sin(angle) * offset})`,
        });

        shadowGroup.append(path);
      }

      group.append(shadowGroup);
    }

    handlePointerDown(event) {
      if (event.target !== this.hitArea) {
        return;
      }

      if (this.activeTool !== "text" && this.activeTool !== "type") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    handleTextLayerPointerDown(event, layerId) {
      const layer = this.layerModel?.findEntryById?.(layerId);

      if (!layer) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.layerModel.setActiveLayer(layerId, { source: "vector-text-select" });

      if (layer.locked === true || event.button !== 0) {
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const group = event.currentTarget;

      this.dragState = {
        group,
        layer: cloneValue(layer),
        layerId,
        pointerId: event.pointerId,
        startDocX: point.x,
        startDocY: point.y,
      };

      group.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", this.handleDragMove);
      window.addEventListener("pointerup", this.handleDragEnd);
      window.addEventListener("pointercancel", this.handleDragEnd);
      this.beginInteraction();
    }

    handleEnvelopePointerDown(event, layerId, nodeId) {
      const layer = this.layerModel?.findEntryById?.(layerId);

      if (!layer?.envelopeGrid || layer.locked === true) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.layerModel.setActiveLayer(layerId, { source: "vector-text-envelope-select" });

      this.envelopeDragState = {
        layerId,
        nodeId,
        pointerId: event.pointerId,
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", this.handleEnvelopeDragMove);
      window.addEventListener("pointerup", this.handleEnvelopeDragEnd);
      window.addEventListener("pointercancel", this.handleEnvelopeDragEnd);
      this.beginInteraction();
    }

    handleEnvelopeDragMove(event) {
      if (!this.envelopeDragState || event.pointerId !== this.envelopeDragState.pointerId) {
        return;
      }

      const layer = this.layerModel?.findEntryById?.(this.envelopeDragState.layerId);

      if (!layer?.envelopeGrid) {
        return;
      }

      const position = this.clientToLayerPoint(event.clientX, event.clientY, layer);
      const envelopeGrid = namespace.VectorTextEngine.updateEnvelopeGridNode(
        layer.envelopeGrid,
        this.envelopeDragState.nodeId,
        position,
      );

      this.layerModel.updateLayer(layer.id, { envelopeGrid }, { source: "vector-text-envelope-drag" });
      this.beginInteraction();
      event.preventDefault();
    }

    handleEnvelopeDragEnd(event) {
      if (!this.envelopeDragState || event.pointerId !== this.envelopeDragState.pointerId) {
        return;
      }

      window.removeEventListener("pointermove", this.handleEnvelopeDragMove);
      window.removeEventListener("pointerup", this.handleEnvelopeDragEnd);
      window.removeEventListener("pointercancel", this.handleEnvelopeDragEnd);
      this.envelopeDragState = null;
      event.preventDefault();
    }

    handleDragMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const nextLayer = {
        ...this.dragState.layer,
        x: toFiniteNumber(this.dragState.layer.x, 0) + point.x - this.dragState.startDocX,
        y: toFiniteNumber(this.dragState.layer.y, 0) + point.y - this.dragState.startDocY,
      };
      const currentGroup = this.getLayerNode(this.dragState.layerId) || this.dragState.group;

      this.dragState.nextLayer = nextLayer;
      currentGroup?.setAttribute("transform", formatLayerTransform(nextLayer));
      this.beginInteraction();
      event.preventDefault();
    }

    handleDragEnd(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const { group, layerId, nextLayer } = this.dragState;

      group.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", this.handleDragMove);
      window.removeEventListener("pointerup", this.handleDragEnd);
      window.removeEventListener("pointercancel", this.handleDragEnd);

      if (nextLayer) {
        this.layerModel.updateLayer(layerId, {
          x: nextLayer.x,
          y: nextLayer.y,
        }, { source: "vector-text-drag" });
      }

      this.dragState = null;
      event.preventDefault();
    }

    clientToDocumentPoint(clientX, clientY) {
      const rect = this.stage.getBoundingClientRect();
      const { camera, dpr } = resolveCameraState();
      const viewportX = (clientX - rect.left) * dpr;
      const viewportY = (clientY - rect.top) * dpr;
      const zoom = Math.max(0.0001, camera.zoom || 1);

      return {
        x: (viewportX - (camera.x || 0)) / zoom,
        y: (viewportY - (camera.y || 0)) / zoom,
      };
    }

    clientToLayerPoint(clientX, clientY, layer) {
      const point = this.clientToDocumentPoint(clientX, clientY);
      const scaleX = toFiniteNumber(layer.scaleX, 1) || 1;
      const scaleY = toFiniteNumber(layer.scaleY, 1) || 1;
      const radians = (-toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
      const dx = point.x - toFiniteNumber(layer.x, 0);
      const dy = point.y - toFiniteNumber(layer.y, 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      return {
        x: (dx * cos - dy * sin) / scaleX,
        y: (dx * sin + dy * cos) / scaleY,
      };
    }
  }

  namespace.VectorTextRenderer = VectorTextRenderer;

  namespace.initVectorTextRenderer = function initVectorTextRenderer() {
    const stage = document.querySelector(".editor-stage");

    if (!stage || stage.dataset.vectorTextReady === "true") {
      return;
    }

    const layerModel = namespace.documentLayerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (!layerModel || !namespace.VectorTextEngine) {
      return;
    }

    namespace.documentLayerModel = layerModel;
    stage.dataset.vectorTextReady = "true";
    namespace.vectorTextRenderer = new VectorTextRenderer({ layerModel, stage });
  };
})(window.CBO = window.CBO || {});
