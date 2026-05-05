(function registerRasterTransformTool(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const RESIZE_TOOL_MODE = "resize";
  const RASTER_ALPHA_HIT_THRESHOLD = 2;
  const HANDLE_SIZE = 10;
  const MIN_TRANSFORM_SIZE = 2;
  const GUIDE_PROXIMITY_PX = 3;
  const HANDLE_DEFS = Object.freeze([
    { dir: "nw", cursor: "nwse-resize" },
    { dir: "n", cursor: "ns-resize" },
    { dir: "ne", cursor: "nesw-resize" },
    { dir: "e", cursor: "ew-resize" },
    { dir: "se", cursor: "nwse-resize" },
    { dir: "s", cursor: "ns-resize" },
    { dir: "sw", cursor: "nesw-resize" },
    { dir: "w", cursor: "ew-resize" },
  ]);
  const HANDLE_TO_CORNERS = Object.freeze({
    0: [0],
    1: [0, 1],
    2: [1],
    3: [1, 2],
    4: [2],
    5: [2, 3],
    6: [3],
    7: [3, 0],
  });

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, String(value));
      }
    });

    return element;
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function isResizeToolDetail(detail = {}) {
    const label = String(detail.label || "").trim().toLowerCase();
    const toolMode = String(detail.toolMode || "").trim().toLowerCase();

    return toolMode === RESIZE_TOOL_MODE || label === RESIZE_TOOL_MODE;
  }

  function normalizeTransformMode(mode) {
    return String(mode || "").trim().toLowerCase() === "perspective"
      ? "perspective"
      : "free";
  }

  function rectToQuad(rect) {
    if (!rect) {
      return null;
    }

    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
  }

  function getRectFromQuad(quad) {
    const bounds = namespace.documentBounds?.quadToBounds?.(quad);

    return namespace.documentBounds?.boundsToRect?.(bounds) || null;
  }

  function getMidPoint(first, second) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function quadChanged(first = [], second = []) {
    if (first.length !== second.length) {
      return true;
    }

    return first.some((point, index) => {
      const other = second[index];

      return Math.abs(point.x - other.x) > 0.01 || Math.abs(point.y - other.y) > 0.01;
    });
  }

  function setSvgElementVisible(element, isVisible) {
    if (!element) {
      return;
    }

    if (isVisible) {
      element.removeAttribute("hidden");
      element.style.display = "";
    } else {
      element.setAttribute("hidden", "");
      element.style.display = "none";
    }
  }

  class RasterTransformTool {
    constructor(options = {}) {
      this.stage = options.stage;
      this.layerModel = options.layerModel;
      this.documentRenderer = options.documentRenderer;
      this.svg = null;
      this.hitArea = null;
      this.guideLayer = null;
      this.guides = {};
      this.box = null;
      this.handles = [];
      this.activeTool = "";
      this.transformMode = normalizeTransformMode(namespace.transformMode);
      this.activeLayerId = null;
      this.contentRect = null;
      this.sourceSnapshot = null;
      this.startQuad = null;
      this.currentQuad = null;
      this.dragState = null;
      this.isCommitting = false;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.dpr = Math.max(1, window.devicePixelRatio || 1);
      this.viewportWidth = 1;
      this.viewportHeight = 1;
      this.lastPublishedState = "";
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleTransformModeChange = this.handleTransformModeChange.bind(this);
      this.handleRasterTransformAction = this.handleRasterTransformAction.bind(this);
      this.handleBeforeHistoryAction = this.handleBeforeHistoryAction.bind(this);
      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);

      this.createOverlay();
      this.bindEvents();
      this.syncViewState();
      this.render();
    }

    createOverlay() {
      if (!this.stage) {
        throw new Error("RasterTransformTool richiede .editor-stage.");
      }

      this.svg = createSvgElement("svg", {
        "aria-label": "Controlli trasformazione raster",
        class: "editor-raster-transform-overlay",
        focusable: "false",
      });
      this.hitArea = createSvgElement("rect", {
        class: "editor-raster-transform-hit-area",
        fill: "transparent",
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });
      this.box = createSvgElement("polygon", {
        class: "editor-raster-transform-box",
        points: "",
      });
      this.guideLayer = createSvgElement("g", {
        class: "editor-raster-transform-guide-layer",
        hidden: "",
      });
      ["left", "center-x", "right", "top", "center-y", "bottom"].forEach((guideName) => {
        const guide = createSvgElement("line", {
          class: `editor-raster-transform-guide editor-raster-transform-guide-${guideName}`,
          x1: 0,
          x2: 0,
          y1: 0,
          y2: 0,
        });

        this.guides[guideName] = guide;
        this.guideLayer.append(guide);
      });
      this.handles = HANDLE_DEFS.map((definition, index) => {
        const handle = createSvgElement("rect", {
          class: "editor-raster-transform-handle",
          height: HANDLE_SIZE,
          width: HANDLE_SIZE,
          x: 0,
          y: 0,
        });

        handle.dataset.dir = definition.dir;
        handle.dataset.handleIndex = String(index);
        handle.style.cursor = definition.cursor;

        return handle;
      });

      this.svg.append(this.hitArea, this.guideLayer, this.box, ...this.handles);
      this.stage.append(this.svg);
      this.updateViewportSize();
    }

    syncViewState() {
      const brushEngine = namespace.brushEngine;

      if (!brushEngine?.camera) {
        return;
      }

      this.camera = {
        x: toFiniteNumber(brushEngine.camera.x, 0),
        y: toFiniteNumber(brushEngine.camera.y, 0),
        zoom: Math.max(0.0001, toFiniteNumber(brushEngine.camera.zoom, 1)),
      };
      this.dpr = Math.max(1, toFiniteNumber(brushEngine.dpr, this.dpr || window.devicePixelRatio || 1));
    }

    bindEvents() {
      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("cbo:transform-mode-change", this.handleTransformModeChange);
      window.addEventListener("cbo:raster-transform-action", this.handleRasterTransformAction);
      window.addEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("resize", this.handleResize, { passive: true });
      this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
      this.svg.addEventListener("pointerdown", this.handlePointerDown);
      this.svg.addEventListener("pointermove", this.handlePointerMove);
      this.svg.addEventListener("pointerup", this.handlePointerUp);
      this.svg.addEventListener("pointercancel", this.handlePointerCancel);
      this.layerModel?.addEventListener?.("change", this.handleDocumentChange);
    }

    isActive() {
      return this.activeTool === RESIZE_TOOL_MODE;
    }

    isTransformableLayer(layer) {
      return Boolean(
        layer &&
          layer.locked !== true &&
          (layer.type === "paint" || layer.type === "image")
      );
    }

    getActiveLayer() {
      const layerId = this.layerModel?.activeLayerId;

      return layerId ? this.layerModel?.findEntryById?.(layerId) || null : null;
    }

    handleToolChange(event) {
      const detail = event.detail || {};

      if (isResizeToolDetail(detail)) {
        this.activeTool = RESIZE_TOOL_MODE;
        this.activateLayer(this.getActiveLayer());
      } else {
        if (this.isActive()) {
          this.commitTransform();
        }

        this.activeTool = String(detail.toolMode || detail.label || "").trim().toLowerCase();
        this.deactivateLayer();
      }

      this.render();
    }

    handleTransformModeChange(event) {
      this.transformMode = normalizeTransformMode(event.detail?.mode);
      if (this.sourceSnapshot) {
        this.updatePreview();
      }

      this.render();
    }

    handleRasterTransformAction(event) {
      if (!this.isActive()) {
        return;
      }

      const action = String(event.detail?.action || "").trim().toLowerCase();

      if (action === "accept") {
        this.commitTransform();
      } else if (action === "cancel") {
        this.cancelTransform();
      }
    }

    handleBeforeHistoryAction(event) {
      const action = String(event.detail?.action || "").trim().toLowerCase();

      if ((action === "undo" || action === "redo") && this.hasPendingTransform()) {
        this.commitTransform();
      }
    }

    handleCameraChange(event) {
      const detail = event.detail || {};

      if (detail.camera) {
        this.camera = {
          x: toFiniteNumber(detail.camera.x, 0),
          y: toFiniteNumber(detail.camera.y, 0),
          zoom: Math.max(0.0001, toFiniteNumber(detail.camera.zoom, 1)),
        };
      }

      this.dpr = Math.max(1, toFiniteNumber(detail.dpr, this.dpr));
      this.render();
    }

    handleDocumentChange() {
      if (!this.isActive() || this.dragState || this.isCommitting) {
        return;
      }

      const activeLayer = this.getActiveLayer();

      if (!activeLayer || activeLayer.id !== this.activeLayerId) {
        this.commitTransform();
        this.activateLayer(activeLayer);
        return;
      }

      if (!this.sourceSnapshot) {
        this.activateLayer(activeLayer);
      }
    }

    handleResize() {
      this.updateViewportSize();
      this.render();
    }

    handleWheel(event) {
      namespace.brushEngine?.handleWheel?.(event);
    }

    handleKeyDown(event) {
      if (!this.isActive()) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelTransform();
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.commitTransform();
      }
    }

    updateViewportSize() {
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      this.viewportWidth = width;
      this.viewportHeight = height;
      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    documentToViewportPoint(x, y) {
      return {
        x: (x * this.camera.zoom + this.camera.x) / this.dpr,
        y: (y * this.camera.zoom + this.camera.y) / this.dpr,
      };
    }

    clientToDocumentPoint(clientX, clientY) {
      const stageRect = this.stage.getBoundingClientRect();
      const viewportX = (clientX - stageRect.left) * this.dpr;
      const viewportY = (clientY - stageRect.top) * this.dpr;

      return {
        x: (viewportX - this.camera.x) / this.camera.zoom,
        y: (viewportY - this.camera.y) / this.camera.zoom,
      };
    }

    rasterizePuppetIfNeeded(layer) {
      if (!Array.isArray(layer?.puppet?.pins) || layer.puppet.pins.length === 0) {
        return;
      }

      namespace.puppetTransformTool?.rasterizeActivePuppetLayer?.();
    }

    activateLayer(layer) {
      this.cancelTransform({ keepGeometry: false });

      if (!this.isTransformableLayer(layer)) {
        this.activeLayerId = null;
        this.contentRect = null;
        this.startQuad = null;
        this.currentQuad = null;
        this.render();
        return false;
      }

      this.rasterizePuppetIfNeeded(layer);

      const bounds = this.documentRenderer?.getRasterContentBounds?.(layer.id);

      this.activeLayerId = layer.id;
      this.contentRect = bounds || null;
      this.startQuad = bounds ? rectToQuad(bounds) : null;
      this.currentQuad = bounds ? cloneValue(this.startQuad) : null;
      this.render();

      return Boolean(bounds);
    }

    deactivateLayer() {
      this.cancelTransform({ keepGeometry: false });
      this.activeLayerId = null;
      this.contentRect = null;
      this.startQuad = null;
      this.currentQuad = null;
      this.render();
    }

    createSourceSnapshot() {
      if (this.sourceSnapshot || !this.activeLayerId || !this.contentRect) {
        return this.sourceSnapshot;
      }

      this.sourceSnapshot = this.documentRenderer?.createRasterSnapshot?.(
        this.activeLayerId,
        this.contentRect,
        "raster-transform-preview",
      ) || null;

      return this.sourceSnapshot;
    }

    updatePreview() {
      const snapshot = this.createSourceSnapshot();

      if (!snapshot?.texture || !this.currentQuad) {
        return false;
      }

      this.documentRenderer?.setRasterTransformPreview?.({
        layerId: this.activeLayerId,
        opacity: 1,
        quad: this.currentQuad,
        sourceRect: this.contentRect,
        texture: snapshot.texture,
        transformMode: this.transformMode,
      });

      return true;
    }

    cancelTransform(options = {}) {
      if (this.sourceSnapshot) {
        this.documentRenderer?.deleteRasterSnapshot?.(this.sourceSnapshot);
        this.sourceSnapshot = null;
      }

      if (this.activeLayerId) {
        this.documentRenderer?.clearRasterTransformPreview?.(this.activeLayerId);
      }

      this.dragState = null;

      if (options.keepGeometry !== false && this.startQuad) {
        this.currentQuad = cloneValue(this.startQuad);
      }

      this.render();
    }

    commitTransform() {
      if (!this.sourceSnapshot || !this.activeLayerId || !this.contentRect || !this.currentQuad) {
        return false;
      }

      if (!quadChanged(this.startQuad || [], this.currentQuad || [])) {
        this.cancelTransform();
        return false;
      }

      this.isCommitting = true;

      const didCommit = this.documentRenderer?.commitRasterTransform?.({
        destQuad: this.currentQuad,
        layerId: this.activeLayerId,
        source: "raster-transform",
        sourceRect: this.contentRect,
        sourceSnapshot: this.sourceSnapshot,
        transformMode: this.transformMode,
      }) === true;

      this.documentRenderer?.deleteRasterSnapshot?.(this.sourceSnapshot);
      this.sourceSnapshot = null;
      this.dragState = null;

      const layer = this.getActiveLayer();

      if (didCommit && this.isTransformableLayer(layer)) {
        const bounds = this.documentRenderer?.getRasterContentBounds?.(layer.id);

        this.contentRect = bounds || null;
        this.startQuad = bounds ? rectToQuad(bounds) : null;
        this.currentQuad = bounds ? cloneValue(this.startQuad) : null;
      }

      this.isCommitting = false;
      this.render();

      return didCommit;
    }

    pickLayerAtClient(clientX, clientY) {
      const point = this.clientToDocumentPoint(clientX, clientY);
      const layers = this.documentRenderer?.getRenderableLayers?.() || this.layerModel?.getRenderableLayers?.() || [];

      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];

        if (!this.isTransformableLayer(layer)) {
          continue;
        }

        if (this.documentRenderer?.getRasterAlphaAtPoint?.(layer.id, point.x, point.y) > RASTER_ALPHA_HIT_THRESHOLD) {
          return layer;
        }
      }

      return null;
    }

    getHandleTarget(target) {
      return target?.closest?.(".editor-raster-transform-handle") || null;
    }

    getBoxTarget(target) {
      return target?.closest?.(".editor-raster-transform-box") || null;
    }

    handlePointerDown(event) {
      if (!this.isActive() || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const handle = this.getHandleTarget(event.target);
      const box = this.getBoxTarget(event.target);

      if (!handle && !box) {
        if (this.hasPendingTransform()) {
          return;
        }

        const hitLayer = this.pickLayerAtClient(event.clientX, event.clientY);

        if (hitLayer) {
          this.layerModel?.setActiveLayer?.(hitLayer.id, { source: "raster-transform-select" });
        }

        return;
      }

      if (!this.activeLayerId || !this.currentQuad || !this.contentRect) {
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const mode = handle
        ? (this.transformMode === "free" ? "scale" : "distort")
        : "move";

      this.dragState = {
        didChange: false,
        dir: handle?.dataset.dir || "",
        handleIndex: handle ? Number(handle.dataset.handleIndex) : -1,
        mode,
        pointerId: event.pointerId,
        startPoint: point,
        startQuad: cloneValue(this.currentQuad),
        startRect: getRectFromQuad(this.currentQuad),
      };
      this.svg.setPointerCapture?.(event.pointerId);
      this.updatePreview();
    }

    handlePointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.updateDrag(event);
    }

    handlePointerUp(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (this.svg.hasPointerCapture?.(event.pointerId)) {
        this.svg.releasePointerCapture(event.pointerId);
      }

      this.dragState = null;

      if (!quadChanged(this.startQuad || [], this.currentQuad || [])) {
        this.cancelTransform();
      } else {
        this.updatePreview();
        this.render();
      }
    }

    handlePointerCancel(event) {
      if (this.dragState?.pointerId === event.pointerId) {
        this.cancelTransform();
      }
    }

    updateDrag(event) {
      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const dx = point.x - this.dragState.startPoint.x;
      const dy = point.y - this.dragState.startPoint.y;

      if (this.dragState.mode === "move") {
        const snappedDelta = this.getSnappedMoveDelta(dx, dy);

        this.currentQuad = this.dragState.startQuad.map((item) => ({
          x: item.x + snappedDelta.dx,
          y: item.y + snappedDelta.dy,
        }));
      } else if (this.dragState.mode === "scale") {
        this.currentQuad = this.getScaledQuad(dx, dy, event);
      } else {
        this.currentQuad = this.getDistortedQuad(dx, dy);
      }

      this.dragState.didChange = quadChanged(this.dragState.startQuad, this.currentQuad);
      this.render();
      this.updatePreview();
    }

    getScaledQuad(dx, dy, event) {
      const startRect = this.dragState.startRect;
      const dir = this.dragState.dir;

      if (!startRect || !dir) {
        return cloneValue(this.dragState.startQuad);
      }

      let x = startRect.x;
      let y = startRect.y;
      let width = startRect.width;
      let height = startRect.height;

      if (dir.includes("e")) {
        width += dx;
      }

      if (dir.includes("s")) {
        height += dy;
      }

      if (dir.includes("w")) {
        x += dx;
        width -= dx;
      }

      if (dir.includes("n")) {
        y += dy;
        height -= dy;
      }

      if (width < MIN_TRANSFORM_SIZE) {
        if (dir.includes("w")) {
          x -= MIN_TRANSFORM_SIZE - width;
        }

        width = MIN_TRANSFORM_SIZE;
      }

      if (height < MIN_TRANSFORM_SIZE) {
        if (dir.includes("n")) {
          y -= MIN_TRANSFORM_SIZE - height;
        }

        height = MIN_TRANSFORM_SIZE;
      }

      if (event.shiftKey && startRect.height > 0) {
        const aspect = startRect.width / startRect.height;

        if (dir === "e" || dir === "w") {
          const previousHeight = height;

          height = width / aspect;
          y -= (height - previousHeight) / 2;
        } else if (dir === "n" || dir === "s") {
          const previousWidth = width;

          width = height * aspect;
          x -= (width - previousWidth) / 2;
        } else if (width / height > aspect) {
          const nextHeight = width / aspect;

          if (dir.includes("n")) {
            y += height - nextHeight;
          }

          height = nextHeight;
        } else {
          const nextWidth = height * aspect;

          if (dir.includes("w")) {
            x += width - nextWidth;
          }

          width = nextWidth;
        }
      }

      if (event.altKey) {
        const centerX = startRect.x + startRect.width / 2;
        const centerY = startRect.y + startRect.height / 2;

        x = centerX - width / 2;
        y = centerY - height / 2;
      }

      return rectToQuad(this.getSnappedScaledRect({ x, y, width, height }, dir, event));
    }

    getDistortedQuad(dx, dy) {
      const nextQuad = cloneValue(this.dragState.startQuad);
      const cornerIndexes = HANDLE_TO_CORNERS[this.dragState.handleIndex] || [];

      if (cornerIndexes.length === 0) {
        return nextQuad;
      }

      cornerIndexes.forEach((cornerIndex) => {
        nextQuad[cornerIndex] = {
          x: nextQuad[cornerIndex].x + dx,
          y: nextQuad[cornerIndex].y + dy,
        };
      });

      return nextQuad;
    }

    getHandlePoints(points) {
      return [
        points[0],
        getMidPoint(points[0], points[1]),
        points[1],
        getMidPoint(points[1], points[2]),
        points[2],
        getMidPoint(points[2], points[3]),
        points[3],
        getMidPoint(points[3], points[0]),
      ];
    }

    hasPendingTransform() {
      return Boolean(
        this.sourceSnapshot &&
          Array.isArray(this.startQuad) &&
          Array.isArray(this.currentQuad) &&
          quadChanged(this.startQuad, this.currentQuad)
      );
    }

    shouldShowGuides() {
      return Boolean(
        this.dragState &&
          (this.dragState.mode === "move" || this.dragState.mode === "scale")
      );
    }

    setGuideLine(name, x1, y1, x2, y2) {
      const line = this.guides[name];

      if (!line) {
        return;
      }

      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
    }

    getGuideDocumentSize() {
      return {
        documentWidth: Math.max(1, toFiniteNumber(this.documentRenderer?.width, 1)),
        documentHeight: Math.max(1, toFiniteNumber(this.documentRenderer?.height, 1)),
      };
    }

    getGuideSnapThreshold() {
      return GUIDE_PROXIMITY_PX * this.dpr / this.camera.zoom;
    }

    getGuidePositions(documentWidth, documentHeight) {
      return {
        x: {
          left: 0,
          "center-x": documentWidth / 2,
          right: documentWidth,
        },
        y: {
          top: 0,
          "center-y": documentHeight / 2,
          bottom: documentHeight,
        },
      };
    }

    findClosestSnapOffset(objectPositions, guidePositions, threshold = this.getGuideSnapThreshold()) {
      let snapOffset = 0;
      let snapDistance = Infinity;

      objectPositions.forEach((objectPosition) => {
        const candidate = this.findClosestSnapCandidate(objectPosition, guidePositions, threshold);

        if (candidate && candidate.distance < snapDistance) {
          snapOffset = candidate.offset;
          snapDistance = candidate.distance;
        }
      });

      return snapOffset;
    }

    findClosestSnapCandidate(objectPosition, guidePositions, threshold = this.getGuideSnapThreshold()) {
      let snapCandidate = null;

      guidePositions.forEach((guidePosition) => {
        const offset = guidePosition - objectPosition;
        const distance = Math.abs(offset);

        if (distance <= threshold && (!snapCandidate || distance < snapCandidate.distance)) {
          snapCandidate = {
            distance,
            guidePosition,
            offset,
          };
        }
      });

      return snapCandidate;
    }

    getRectGuidePositions(rect) {
      return {
        x: [rect.x, rect.x + rect.width / 2, rect.x + rect.width],
        y: [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
      };
    }

    getSnapOffsetForRect(rect) {
      if (!rect) {
        return { x: 0, y: 0 };
      }

      const { documentWidth, documentHeight } = this.getGuideDocumentSize();
      const guides = this.getGuidePositions(documentWidth, documentHeight);
      const positions = this.getRectGuidePositions(rect);

      return {
        x: this.findClosestSnapOffset(positions.x, Object.values(guides.x)),
        y: this.findClosestSnapOffset(positions.y, Object.values(guides.y)),
      };
    }

    getSnappedMoveDelta(dx, dy) {
      const startRect = this.dragState?.startRect;

      if (!startRect) {
        return { dx, dy };
      }

      const snapOffset = this.getSnapOffsetForRect({
        x: startRect.x + dx,
        y: startRect.y + dy,
        width: startRect.width,
        height: startRect.height,
      });

      return {
        dx: dx + snapOffset.x,
        dy: dy + snapOffset.y,
      };
    }

    getScaleSnapCandidates(rect, dir) {
      const { documentWidth, documentHeight } = this.getGuideDocumentSize();
      const guides = this.getGuidePositions(documentWidth, documentHeight);
      const candidates = [];

      if (dir.includes("e")) {
        const candidate = this.findClosestSnapCandidate(rect.x + rect.width, Object.values(guides.x));

        if (candidate) {
          candidates.push({ ...candidate, axis: "x", side: "e" });
        }
      }

      if (dir.includes("w")) {
        const candidate = this.findClosestSnapCandidate(rect.x, Object.values(guides.x));

        if (candidate) {
          candidates.push({ ...candidate, axis: "x", side: "w" });
        }
      }

      if (dir.includes("s")) {
        const candidate = this.findClosestSnapCandidate(rect.y + rect.height, Object.values(guides.y));

        if (candidate) {
          candidates.push({ ...candidate, axis: "y", side: "s" });
        }
      }

      if (dir.includes("n")) {
        const candidate = this.findClosestSnapCandidate(rect.y, Object.values(guides.y));

        if (candidate) {
          candidates.push({ ...candidate, axis: "y", side: "n" });
        }
      }

      return candidates.sort((first, second) => first.distance - second.distance);
    }

    clampScaledRect(rect, dir) {
      let { x, y, width, height } = rect;

      if (width < MIN_TRANSFORM_SIZE) {
        if (dir.includes("w")) {
          x -= MIN_TRANSFORM_SIZE - width;
        }

        width = MIN_TRANSFORM_SIZE;
      }

      if (height < MIN_TRANSFORM_SIZE) {
        if (dir.includes("n")) {
          y -= MIN_TRANSFORM_SIZE - height;
        }

        height = MIN_TRANSFORM_SIZE;
      }

      return { x, y, width, height };
    }

    getEdgeSnappedScaledRect(rect, dir, candidates) {
      let { x, y, width, height } = rect;

      candidates.forEach((candidate) => {
        if (candidate.side === "e") {
          width += candidate.offset;
        } else if (candidate.side === "w") {
          x += candidate.offset;
          width -= candidate.offset;
        } else if (candidate.side === "s") {
          height += candidate.offset;
        } else if (candidate.side === "n") {
          y += candidate.offset;
          height -= candidate.offset;
        }
      });

      return this.clampScaledRect({ x, y, width, height }, dir);
    }

    getCenteredSnappedScaledRect(rect, candidates) {
      const startRect = this.dragState?.startRect;

      if (!startRect) {
        return rect;
      }

      const centerX = startRect.x + startRect.width / 2;
      const centerY = startRect.y + startRect.height / 2;
      let { width, height } = rect;

      candidates.forEach((candidate) => {
        if (candidate.side === "e") {
          const nextWidth = (candidate.guidePosition - centerX) * 2;

          if (nextWidth >= MIN_TRANSFORM_SIZE) {
            width = nextWidth;
          }
        } else if (candidate.side === "w") {
          const nextWidth = (centerX - candidate.guidePosition) * 2;

          if (nextWidth >= MIN_TRANSFORM_SIZE) {
            width = nextWidth;
          }
        } else if (candidate.side === "s") {
          const nextHeight = (candidate.guidePosition - centerY) * 2;

          if (nextHeight >= MIN_TRANSFORM_SIZE) {
            height = nextHeight;
          }
        } else if (candidate.side === "n") {
          const nextHeight = (centerY - candidate.guidePosition) * 2;

          if (nextHeight >= MIN_TRANSFORM_SIZE) {
            height = nextHeight;
          }
        }
      });

      return {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      };
    }

    getAspectSnappedScaledRect(rect, dir, event, candidate) {
      const startRect = this.dragState?.startRect;

      if (!startRect || !candidate || startRect.height <= 0) {
        return rect;
      }

      const aspect = startRect.width / startRect.height;
      const centerX = startRect.x + startRect.width / 2;
      const centerY = startRect.y + startRect.height / 2;
      let x = rect.x;
      let y = rect.y;
      let width = rect.width;
      let height = rect.height;

      if (event.altKey) {
        if (candidate.axis === "x") {
          const halfWidth = candidate.side === "e"
            ? candidate.guidePosition - centerX
            : centerX - candidate.guidePosition;

          if (halfWidth < MIN_TRANSFORM_SIZE / 2) {
            return rect;
          }

          width = halfWidth * 2;
          height = width / aspect;
        } else {
          const halfHeight = candidate.side === "s"
            ? candidate.guidePosition - centerY
            : centerY - candidate.guidePosition;

          if (halfHeight < MIN_TRANSFORM_SIZE / 2) {
            return rect;
          }

          height = halfHeight * 2;
          width = height * aspect;
        }

        return {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
        };
      }

      if (candidate.axis === "x") {
        if (candidate.side === "e") {
          x = startRect.x;
          width = candidate.guidePosition - x;
        } else {
          const right = startRect.x + startRect.width;

          x = candidate.guidePosition;
          width = right - x;
        }

        if (width < MIN_TRANSFORM_SIZE) {
          return rect;
        }

        height = width / aspect;

        if (dir.includes("n")) {
          y = startRect.y + startRect.height - height;
        } else if (dir.includes("s")) {
          y = startRect.y;
        } else {
          y = centerY - height / 2;
        }
      } else {
        if (candidate.side === "s") {
          y = startRect.y;
          height = candidate.guidePosition - y;
        } else {
          const bottom = startRect.y + startRect.height;

          y = candidate.guidePosition;
          height = bottom - y;
        }

        if (height < MIN_TRANSFORM_SIZE) {
          return rect;
        }

        width = height * aspect;

        if (dir.includes("w")) {
          x = startRect.x + startRect.width - width;
        } else if (dir.includes("e")) {
          x = startRect.x;
        } else {
          x = centerX - width / 2;
        }
      }

      return this.clampScaledRect({ x, y, width, height }, dir);
    }

    getSnappedScaledRect(rect, dir, event) {
      const candidates = this.getScaleSnapCandidates(rect, dir);

      if (candidates.length === 0) {
        return rect;
      }

      if (event.shiftKey) {
        return this.getAspectSnappedScaledRect(rect, dir, event, candidates[0]);
      }

      if (event.altKey) {
        return this.getCenteredSnappedScaledRect(rect, candidates);
      }

      return this.getEdgeSnappedScaledRect(rect, dir, candidates);
    }

    getActiveGuideNames(rect, documentWidth, documentHeight) {
      if (!rect) {
        return new Set();
      }

      const threshold = this.getGuideSnapThreshold();
      const positions = this.getRectGuidePositions(rect);
      const guides = this.getGuidePositions(documentWidth, documentHeight);
      const activeGuides = new Set();

      Object.entries(guides.x).forEach(([name, guidePosition]) => {
        if (positions.x.some((position) => Math.abs(position - guidePosition) <= threshold)) {
          activeGuides.add(name);
        }
      });

      Object.entries(guides.y).forEach(([name, guidePosition]) => {
        if (positions.y.some((position) => Math.abs(position - guidePosition) <= threshold)) {
          activeGuides.add(name);
        }
      });

      return activeGuides;
    }

    renderGuides(isVisible) {
      if (!isVisible) {
        setSvgElementVisible(this.guideLayer, false);
        return;
      }

      const { documentWidth, documentHeight } = this.getGuideDocumentSize();
      const left = this.documentToViewportPoint(0, 0).x;
      const centerX = this.documentToViewportPoint(documentWidth / 2, 0).x;
      const right = this.documentToViewportPoint(documentWidth, 0).x;
      const top = this.documentToViewportPoint(0, 0).y;
      const centerY = this.documentToViewportPoint(0, documentHeight / 2).y;
      const bottom = this.documentToViewportPoint(0, documentHeight).y;
      const activeGuides = this.getActiveGuideNames(
        getRectFromQuad(this.currentQuad),
        documentWidth,
        documentHeight,
      );

      setSvgElementVisible(this.guideLayer, activeGuides.size > 0);

      this.setGuideLine("left", left, 0, left, this.viewportHeight);
      this.setGuideLine("center-x", centerX, 0, centerX, this.viewportHeight);
      this.setGuideLine("right", right, 0, right, this.viewportHeight);
      this.setGuideLine("top", 0, top, this.viewportWidth, top);
      this.setGuideLine("center-y", 0, centerY, this.viewportWidth, centerY);
      this.setGuideLine("bottom", 0, bottom, this.viewportWidth, bottom);

      Object.entries(this.guides).forEach(([name, line]) => {
        setSvgElementVisible(line, activeGuides.has(name));
      });
    }

    emitStateChange() {
      const detail = {
        active: this.isActive(),
        hasBounds: Array.isArray(this.currentQuad),
        layerId: this.activeLayerId || null,
        pending: this.hasPendingTransform(),
        source: "raster-transform-tool",
      };
      const stateKey = JSON.stringify(detail);

      if (stateKey === this.lastPublishedState) {
        return;
      }

      this.lastPublishedState = stateKey;
      window.dispatchEvent(new CustomEvent("cbo:raster-transform-state-change", { detail }));
    }

    render() {
      this.syncViewState();

      const isVisible = this.isActive() && Array.isArray(this.currentQuad);

      if (this.isActive()) {
        this.svg.removeAttribute("hidden");
        this.svg.style.display = "block";
      } else {
        this.svg.setAttribute("hidden", "");
        this.svg.style.display = "none";
      }

      this.svg.classList.toggle("raster-transform-tool-active", this.isActive());
      setSvgElementVisible(this.box, isVisible);
      this.renderGuides(isVisible && this.shouldShowGuides());
      this.handles.forEach((handle) => {
        setSvgElementVisible(handle, isVisible);

        if (!isVisible) {
          handle.setAttribute("x", "-9999");
          handle.setAttribute("y", "-9999");
        }
      });

      if (!isVisible) {
        this.box.setAttribute("points", "");
        this.emitStateChange();
        return;
      }

      const points = this.currentQuad.map((point) => this.documentToViewportPoint(point.x, point.y));
      const handlePoints = this.getHandlePoints(points);

      this.box.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));

      this.handles.forEach((handle, index) => {
        setSvgElementVisible(handle, true);
        handle.setAttribute("x", handlePoints[index].x - HANDLE_SIZE / 2);
        handle.setAttribute("y", handlePoints[index].y - HANDLE_SIZE / 2);
      });

      this.emitStateChange();
    }
  }

  namespace.RasterTransformTool = RasterTransformTool;
  namespace.initRasterTransformTool = function initRasterTransformTool() {
    if (namespace.rasterTransformTool) {
      return namespace.rasterTransformTool;
    }

    const stage = document.querySelector(".editor-stage");
    const layerModel = namespace.documentLayerModel;
    const documentRenderer = namespace.documentRenderer;

    if (!stage || !layerModel || !documentRenderer) {
      return null;
    }

    namespace.rasterTransformTool = new RasterTransformTool({
      documentRenderer,
      layerModel,
      stage,
    });

    return namespace.rasterTransformTool;
  };
})(window.CBO = window.CBO || {});
