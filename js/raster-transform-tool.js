(function registerRasterTransformTool(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SELECTION_TOOL_MODE = "selection";
  const RESIZE_TOOL_MODE = "resize";
  const ROTATE_TOOL_MODE = "rotate";
  const WARP_TRANSFORM_MODE = "warp";
  const RASTER_ALPHA_HIT_THRESHOLD = 2;
  const RASTER_TRANSFORM_BOUNDS_ALPHA_THRESHOLD = 0;
  const RASTER_TRANSFORM_BOUNDS_PADDING = 2;
  const RASTER_TRANSFORM_BOUNDS_OPTIONS = Object.freeze({
    alphaThreshold: RASTER_TRANSFORM_BOUNDS_ALPHA_THRESHOLD,
    clampToDocument: false,
    padding: RASTER_TRANSFORM_BOUNDS_PADDING,
  });
  const HANDLE_SIZE = 10;
  const MOBILE_HANDLE_SIZE = 18;
  const HANDLE_HIT_RADIUS_PX = 16;
  const HANDLE_TOUCH_HIT_RADIUS_PX = 34;
  const WARP_POINT_SIZE = 6;
  const WARP_POINT_HIT_RADIUS_PX = 16;
  const WARP_POINT_TOUCH_HIT_RADIUS_PX = 38;
  const WARP_GRID_SAMPLE_STEPS = 28;
  const MIN_TRANSFORM_SIZE = 2;
  const GUIDE_PROXIMITY_PX = 3;
  const TOUCH_SELECTION_HIT_RADIUS_PX = 8;
  const SELECTION_MOVE_HOLD_MS = 120;
  const ROTATION_SNAP_RADIANS = Math.PI / 12;
  const ROTATION_FREE_SNAP_THRESHOLD_RADIANS = Math.PI / 90;
  const TRIG_EPSILON = 1e-10;
  const AXIS_ALIGNED_QUAD_EPSILON = 0.001;

  function isAndroidPerformanceMode() {
    return namespace.androidPerformanceMode === true ||
      namespace.deviceIsAndroid === true ||
      namespace.DocumentRenderer?.isAndroidLikeEnvironment?.() === true;
  }

  function isPixelPerfectTransformEnabled() {
    if (namespace.pixelPerfectRenderingEnabled === false) {
      return false;
    }

    if (isAndroidPerformanceMode() && namespace.androidPixelPerfectEnabled !== true) {
      return false;
    }

    return true;
  }

  function isAndroidFastResizeBoundsEnabled() {
    return isAndroidPerformanceMode() && namespace.androidFastResizeBoundsEnabled !== false;
  }

  function isAndroidLiveTransformPreviewEnabled() {
    return isAndroidPerformanceMode() && namespace.androidLiveTransformPreviewEnabled !== false;
  }

  function getRasterTransformBoundsOptions() {
    return {
      ...RASTER_TRANSFORM_BOUNDS_OPTIONS,
      pixelPerfect: isPixelPerfectTransformEnabled(),
    };
  }

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
  const WARP_HANDLE_LINE_DEFS = Object.freeze([
    { from: [0, 0], to: [0, 1] },
    { from: [0, 0], to: [1, 0] },
    { from: [0, 3], to: [0, 2] },
    { from: [0, 3], to: [1, 3] },
    { from: [3, 3], to: [3, 2] },
    { from: [3, 3], to: [2, 3] },
    { from: [3, 0], to: [3, 1] },
    { from: [3, 0], to: [2, 0] },
  ]);

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

  function isRotateToolDetail(detail = {}) {
    const label = String(detail.label || "").trim().toLowerCase();
    const toolMode = String(detail.toolMode || "").trim().toLowerCase();

    return toolMode === ROTATE_TOOL_MODE || label === ROTATE_TOOL_MODE;
  }

  function isSelectionToolDetail(detail = {}) {
    const label = String(detail.label || "").trim().toLowerCase();
    const toolMode = String(detail.toolMode || "").trim().toLowerCase();

    return toolMode === SELECTION_TOOL_MODE || label === SELECTION_TOOL_MODE;
  }

  function getTransformToolMode(detail = {}) {
    if (isRotateToolDetail(detail)) {
      return ROTATE_TOOL_MODE;
    }

    return isResizeToolDetail(detail) ? RESIZE_TOOL_MODE : "";
  }

  function normalizeTransformMode(mode) {
    const normalizedMode = String(mode || "").trim().toLowerCase();

    if (normalizedMode === "perspective" || normalizedMode === WARP_TRANSFORM_MODE) {
      return normalizedMode;
    }

    return "free";
  }

  function isVectorTextLayer(layer) {
    return Boolean(layer && (layer.type === "vector-text" || layer.type === "text" || layer.kind === "text"));
  }

  function formatVectorTextLayerTransform(layer) {
    const x = toFiniteNumber(layer?.x, 0);
    const y = toFiniteNumber(layer?.y, 0);
    const rotation = toFiniteNumber(layer?.rotation, 0);
    const scaleX = toFiniteNumber(layer?.scaleX, 1);
    const scaleY = toFiniteNumber(layer?.scaleY, 1);

    return `translate(${x} ${y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`;
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

  function getPointDistance(first, second) {
    return Math.hypot(
      toFiniteNumber(second?.x, 0) - toFiniteNumber(first?.x, 0),
      toFiniteNumber(second?.y, 0) - toFiniteNumber(first?.y, 0),
    );
  }

  function getQuadTopAngle(quad = []) {
    if (!Array.isArray(quad) || quad.length < 2) {
      return 0;
    }

    return Math.atan2(
      toFiniteNumber(quad[1]?.y, 0) - toFiniteNumber(quad[0]?.y, 0),
      toFiniteNumber(quad[1]?.x, 0) - toFiniteNumber(quad[0]?.x, 0),
    );
  }

  function lerpPoint(first, second, amount) {
    return {
      x: first.x + (second.x - first.x) * amount,
      y: first.y + (second.y - first.y) * amount,
    };
  }

  function interpolateQuadPoint(quad, u, v) {
    const top = lerpPoint(quad[0], quad[1], u);
    const bottom = lerpPoint(quad[3], quad[2], u);

    return lerpPoint(top, bottom, v);
  }

  function createWarpControlPointsFromQuad(quad = []) {
    if (!Array.isArray(quad) || quad.length < 4) {
      return null;
    }

    return Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) =>
        interpolateQuadPoint(quad, col / 3, row / 3)
      )
    );
  }

  function getWarpBoundaryQuad(controlPoints) {
    if (!Array.isArray(controlPoints) || controlPoints.length < 4) {
      return null;
    }

    return [
      controlPoints[0]?.[0],
      controlPoints[0]?.[3],
      controlPoints[3]?.[3],
      controlPoints[3]?.[0],
    ].map((point) => ({
      x: toFiniteNumber(point?.x, 0),
      y: toFiniteNumber(point?.y, 0),
    }));
  }

  function bernsteinCubic(index, t) {
    const inverse = 1 - t;

    if (index === 0) {
      return inverse * inverse * inverse;
    }

    if (index === 1) {
      return 3 * t * inverse * inverse;
    }

    if (index === 2) {
      return 3 * t * t * inverse;
    }

    return t * t * t;
  }

  function evaluateWarpSurface(u, v, controlPoints) {
    let x = 0;
    let y = 0;

    for (let row = 0; row < 4; row += 1) {
      const by = bernsteinCubic(row, v);

      for (let col = 0; col < 4; col += 1) {
        const point = controlPoints?.[row]?.[col];
        const weight = by * bernsteinCubic(col, u);

        x += toFiniteNumber(point?.x, 0) * weight;
        y += toFiniteNumber(point?.y, 0) * weight;
      }
    }

    return { x, y };
  }

  function warpControlPointsChanged(first = [], second = []) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== 4 || second.length !== 4) {
      return true;
    }

    for (let row = 0; row < 4; row += 1) {
      if (!Array.isArray(first[row]) || !Array.isArray(second[row]) || first[row].length !== 4 || second[row].length !== 4) {
        return true;
      }

      for (let col = 0; col < 4; col += 1) {
        const point = first[row][col];
        const other = second[row][col];

        if (Math.abs(toFiniteNumber(point?.x, 0) - toFiniteNumber(other?.x, 0)) > 0.01 ||
          Math.abs(toFiniteNumber(point?.y, 0) - toFiniteNumber(other?.y, 0)) > 0.01) {
          return true;
        }
      }
    }

    return false;
  }

  function getWarpPointKind(row, col) {
    const isOuterRow = row === 0 || row === 3;
    const isOuterCol = col === 0 || col === 3;

    if (isOuterRow && isOuterCol) {
      return "corner";
    }

    if (isOuterRow || isOuterCol) {
      return "edge";
    }

    return "inner";
  }

  function getQuadCenter(quad = []) {
    if (!Array.isArray(quad) || quad.length === 0) {
      return { x: 0, y: 0 };
    }

    return quad.reduce(
      (center, point) => ({
        x: center.x + toFiniteNumber(point?.x, 0) / quad.length,
        y: center.y + toFiniteNumber(point?.y, 0) / quad.length,
      }),
      { x: 0, y: 0 },
    );
  }

  function getPointAngleFromCenter(center, point) {
    return Math.atan2(point.y - center.y, point.x - center.x);
  }

  function rotatePointAroundCenter(point, center, angle) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const cos = cleanTrigValue(Math.cos(angle));
    const sin = cleanTrigValue(Math.sin(angle));

    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }

  function snapAngle(angle, increment = ROTATION_SNAP_RADIANS) {
    return Math.round(angle / increment) * increment;
  }

  function cleanTrigValue(value) {
    if (Math.abs(value) < TRIG_EPSILON) {
      return 0;
    }

    if (Math.abs(value - 1) < TRIG_EPSILON) {
      return 1;
    }

    if (Math.abs(value + 1) < TRIG_EPSILON) {
      return -1;
    }

    return value;
  }

  function getAngleDistance(first, second) {
    return Math.atan2(Math.sin(first - second), Math.cos(first - second));
  }

  function getSnappedRotationAngle(angle, options = {}) {
    const snapped = snapAngle(angle);

    if (options.force === true || Math.abs(getAngleDistance(angle, snapped)) <= ROTATION_FREE_SNAP_THRESHOLD_RADIANS) {
      return snapped;
    }

    return angle;
  }

  function degreesToRadians(degrees) {
    return (toFiniteNumber(degrees, 0) * Math.PI) / 180;
  }

  function radiansToDegrees(radians) {
    return (toFiniteNumber(radians, 0) * 180) / Math.PI;
  }

  function formatRotationDegrees(radians) {
    const degrees = radiansToDegrees(radians);
    const rounded = Math.round(degrees);

    return Math.abs(degrees - rounded) < 0.01
      ? String(rounded)
      : String(Math.round(degrees * 10) / 10);
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

  function isAxisAlignedQuad(quad = []) {
    if (!Array.isArray(quad) || quad.length < 4) {
      return false;
    }

    const points = quad.slice(0, 4);

    if (points.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {
      return false;
    }

    const horizontalFirst = (
      Math.abs(points[0].y - points[1].y) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[1].x - points[2].x) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[2].y - points[3].y) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[3].x - points[0].x) <= AXIS_ALIGNED_QUAD_EPSILON
    );
    const verticalFirst = (
      Math.abs(points[0].x - points[1].x) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[1].y - points[2].y) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[2].x - points[3].x) <= AXIS_ALIGNED_QUAD_EPSILON &&
      Math.abs(points[3].y - points[0].y) <= AXIS_ALIGNED_QUAD_EPSILON
    );

    return horizontalFirst || verticalFirst;
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
      this.warpLayer = null;
      this.warpGridPaths = [];
      this.warpHandleLines = [];
      this.warpPoints = [];
      this.guides = {};
      this.box = null;
      this.handles = [];
      this.activeTool = "";
      this.transformMode = normalizeTransformMode(namespace.transformMode);
      this.transformAspectLocked = namespace.transformAspectLocked === true;
      this.activeLayerId = null;
      this.contentRect = null;
      this.sourceSnapshot = null;
      this.startVectorTextLayer = null;
      this.startQuad = null;
      this.currentQuad = null;
      this.startWarpPoints = null;
      this.currentWarpPoints = null;
      this.currentRotationRadians = 0;
      this.dragState = null;
      this.dragFrameRequest = 0;
      this.pendingDragEvent = null;
      this.selectionMoveHoldState = null;
      this.isCommitting = false;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.dpr = Math.max(1, window.devicePixelRatio || 1);
      this.viewportWidth = 1;
      this.viewportHeight = 1;
      this.lastPublishedState = "";
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleTransformModeChange = this.handleTransformModeChange.bind(this);
      this.handleTextTransformEditRequest = this.handleTextTransformEditRequest.bind(this);
      this.handleRasterTransformAction = this.handleRasterTransformAction.bind(this);
      this.handleRotationInput = this.handleRotationInput.bind(this);
      this.handleBeforeHistoryAction = this.handleBeforeHistoryAction.bind(this);
      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleTouchNavigationStart = this.handleTouchNavigationStart.bind(this);
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
      this.syncActiveToolFromToolbar();
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
      this.warpLayer = createSvgElement("g", {
        class: "editor-raster-transform-warp-layer",
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
      this.warpGridPaths = Array.from({ length: 8 }, (_, index) => {
        const path = createSvgElement("path", {
          class: "editor-raster-transform-warp-line",
          d: "",
        });

        path.dataset.warpLineIndex = String(index);
        this.warpLayer.append(path);

        return path;
      });
      this.warpHandleLines = WARP_HANDLE_LINE_DEFS.map((definition, index) => {
        const line = createSvgElement("line", {
          class: "editor-raster-transform-warp-handle-line",
          x1: 0,
          x2: 0,
          y1: 0,
          y2: 0,
        });

        line.dataset.warpHandleLineIndex = String(index);
        line.dataset.from = definition.from.join(",");
        line.dataset.to = definition.to.join(",");
        this.warpLayer.append(line);

        return line;
      });
      this.warpPoints = [];
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const kind = getWarpPointKind(row, col);
          const point = createSvgElement("circle", {
            class: `editor-raster-transform-warp-point editor-raster-transform-warp-point-${kind}`,
            cx: 0,
            cy: 0,
            r: kind === "corner" ? WARP_POINT_SIZE : WARP_POINT_SIZE - 1,
          });

          point.dataset.row = String(row);
          point.dataset.col = String(col);
          point.dataset.kind = kind;
          this.warpPoints.push(point);
          this.warpLayer.append(point);
        }
      }

      this.svg.append(this.hitArea, this.guideLayer, this.warpLayer, this.box, ...this.handles);
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
      window.addEventListener("cbo:text-transform-edit-request", this.handleTextTransformEditRequest);
      window.addEventListener("cbo:raster-transform-action", this.handleRasterTransformAction);
      window.addEventListener("cbo:raster-transform-rotation-input", this.handleRotationInput);
      window.addEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:touch-navigation-start", this.handleTouchNavigationStart);
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
      return this.activeTool === RESIZE_TOOL_MODE || this.activeTool === ROTATE_TOOL_MODE;
    }

    isSelectionActive() {
      return this.activeTool === SELECTION_TOOL_MODE;
    }

    isOverlayActive() {
      return this.isActive() || this.isSelectionActive();
    }

    isRotateActive() {
      return this.activeTool === ROTATE_TOOL_MODE;
    }

    isTransformableLayer(layer) {
      return Boolean(
        layer &&
          layer.locked !== true &&
          (layer.type === "paint" || layer.type === "image" || isVectorTextLayer(layer))
      );
    }

    isVectorTextLayer(layer) {
      return isVectorTextLayer(layer);
    }

    isRasterTransformLayer(layer) {
      return Boolean(layer && !this.isVectorTextLayer(layer) && (layer.type === "paint" || layer.type === "image"));
    }

    requestLayerVisibleForTransform(layer, source = "raster-transform") {
      if (!layer?.id) {
        return false;
      }

      return this.layerModel?.requestLayerVisibleForEdit?.(layer.id, {
        source,
      }) !== false;
    }

    isSelectableLayer(layer) {
      return Boolean(layer && layer.locked !== true && layer.type !== "group");
    }

    getActiveLayer() {
      const layerId = this.layerModel?.activeLayerId;

      return layerId ? this.layerModel?.findEntryById?.(layerId) || null : null;
    }

    isSelectionLayerActivationCurrent(layer) {
      return Boolean(layer?.id && layer.id === this.activeLayerId);
    }

    handleToolChange(event) {
      const detail = event.detail || {};
      const transformToolMode = getTransformToolMode(detail);

      if (Object.prototype.hasOwnProperty.call(detail, "transformAspectLocked")) {
        this.transformAspectLocked = detail.transformAspectLocked === true;
      }

      if (this.isSelectionActive() && !isSelectionToolDetail(detail) && this.hasPendingTransform()) {
        this.commitTransform();
      }

      if (transformToolMode) {
        const wasActive = this.isActive();
        const isSameTransformTool = this.activeTool === transformToolMode;
        let activeLayer = this.getActiveLayer();

        if (this.isActive() && this.activeTool !== transformToolMode && this.hasPendingTransform()) {
          this.commitTransform();
          activeLayer = this.getActiveLayer();
        }

        this.activeTool = transformToolMode;

        const isSameLayerActive = activeLayer?.id && activeLayer.id === this.activeLayerId;

        if (!wasActive || !isSameTransformTool || !isSameLayerActive || !(this.hasPendingTransform() || this.sourceSnapshot || this.startVectorTextLayer)) {
          this.activateLayer(activeLayer);
        }
      } else if (isSelectionToolDetail(detail)) {
        if (this.isActive() || this.hasPendingTransform()) {
          this.commitTransform();
        }

        this.activeTool = SELECTION_TOOL_MODE;
        this.activateLayer(this.getActiveLayer(), { selection: true });
      } else {
        if (this.isActive()) {
          this.commitTransform();
        }

        this.activeTool = String(detail.toolMode || detail.label || "").trim().toLowerCase();
        this.deactivateLayer();
      }

      this.render();
    }

    handleTextTransformEditRequest(event) {
      const requestedLayerId = String(event.detail?.layerId || "");
      const activeLayer = this.getActiveLayer();

      if (!this.isVectorTextLayer(activeLayer) || (requestedLayerId && activeLayer.id !== requestedLayerId)) {
        return;
      }

      if (this.hasPendingTransform()) {
        this.commitTransform();
      }

      this.activeTool = "text-transform";
      this.deactivateLayer();
      this.render();
    }

    syncActiveToolFromToolbar() {
      const activeTool = document.querySelector("[data-tool].active");

      if (!activeTool) {
        return;
      }

      this.handleToolChange({
        detail: {
          label: activeTool.getAttribute("aria-label") || "",
          syncGroup: activeTool.dataset.toolSync || "",
          transformAspectLocked:
            String(activeTool.dataset.transformAspectLock || "").trim().toLowerCase() === "true",
          toolMode: activeTool.dataset.toolMode || "",
        },
      });
    }

    handleTransformModeChange(event) {
      const nextMode = normalizeTransformMode(event.detail?.mode);
      const previousMode = this.transformMode;

      if (this.transformMode === WARP_TRANSFORM_MODE && nextMode !== WARP_TRANSFORM_MODE && this.hasPendingTransform()) {
        this.commitTransform();
      }

      this.transformMode = nextMode;

      if (this.transformMode === WARP_TRANSFORM_MODE) {
        if (previousMode !== WARP_TRANSFORM_MODE && Array.isArray(this.currentQuad)) {
          this.currentWarpPoints = createWarpControlPointsFromQuad(this.currentQuad);
        }

        this.ensureWarpControlPoints();
      }

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

    handleRotationInput(event) {
      if (!this.isRotateActive()) {
        return;
      }

      const degrees = Number(event.detail?.degrees);

      if (!Number.isFinite(degrees)) {
        return;
      }

      this.setRotationDegrees(degrees);
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

    handleDocumentChange(event) {
      if (this.isSelectionActive()) {
        if (this.dragState || this.selectionMoveHoldState || this.isCommitting) {
          return;
        }

        const activeLayer = this.getActiveLayer();
        const isActiveLayerOnlyChange = event?.detail?.changeType === "active-layer";

        if (isActiveLayerOnlyChange && this.isSelectionLayerActivationCurrent(activeLayer)) {
          return;
        }

        if (this.hasPendingTransform()) {
          if (activeLayer?.id !== this.activeLayerId) {
            this.commitTransform();
            this.activateLayer(activeLayer, { selection: true });
          }

          return;
        }

        this.activateLayer(activeLayer, { selection: true });
        return;
      }

      if (!this.isActive() || this.dragState || this.isCommitting) {
        return;
      }

      const activeLayer = this.getActiveLayer();

      if (!activeLayer || activeLayer.id !== this.activeLayerId) {
        this.commitTransform();
        this.activateLayer(activeLayer);
        return;
      }

      if (!this.sourceSnapshot && !this.isVectorTextLayer(activeLayer)) {
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
      if (!this.isActive() && !this.isSelectionActive()) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (this.isSelectionActive()) {
          this.commitTransform();
          this.layerModel?.setActiveLayer?.(null, { source: "selection-tool-escape" });
          this.activateLayer(null, { selection: true });
        } else {
          this.cancelTransform();
        }
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

    clientToViewportPoint(clientX, clientY) {
      const stageRect = this.stage.getBoundingClientRect();

      return {
        x: clientX - stageRect.left,
        y: clientY - stageRect.top,
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

    normalizeTransformRect(rect) {
      const x = Number(rect?.x);
      const y = Number(rect?.y);
      const width = Number(rect?.width);
      const height = Number(rect?.height);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return null;
      }

      return { x, y, width, height };
    }

    isDocumentSizedRect(rect) {
      const width = Math.max(1, Math.round(this.documentRenderer?.width || 1));
      const height = Math.max(1, Math.round(this.documentRenderer?.height || 1));

      return Boolean(
        rect &&
        Math.round(rect.x) === 0 &&
        Math.round(rect.y) === 0 &&
        Math.round(rect.width) >= width &&
        Math.round(rect.height) >= height
      );
    }

    getCoarseRasterContentBounds(layerOrId) {
      const layer = typeof layerOrId === "object" && layerOrId
        ? layerOrId
        : this.layerModel?.findEntryById?.(layerOrId) || null;
      const layerId = String(layer?.id || layerOrId || "").trim();

      if (!layerId) {
        return null;
      }

      const target = this.documentRenderer?.rasterTargetsByLayerId?.get?.(layerId) || null;
      const targetRect = this.normalizeTransformRect(
        this.documentRenderer?.getRasterTargetDocumentRect?.(target),
      );
      const artboardRect = this.normalizeTransformRect(layer ? this.getLayerArtboardRect(layer) : null);

      if (targetRect && artboardRect && this.isDocumentSizedRect(targetRect)) {
        return artboardRect;
      }

      return targetRect || artboardRect;
    }

    getPixelTightRasterContentBounds(layerOrId) {
      if (isAndroidFastResizeBoundsEnabled()) {
        return this.getCoarseRasterContentBounds(layerOrId);
      }

      const layerId = typeof layerOrId === "object" && layerOrId
        ? layerOrId.id
        : layerOrId;

      return this.documentRenderer?.getRasterContentBounds?.(layerId, getRasterTransformBoundsOptions()) || null;
    }

    getSelectionHitRadius(pointerType = "") {
      return pointerType === "touch"
        ? TOUCH_SELECTION_HIT_RADIUS_PX * this.dpr / this.camera.zoom
        : 0;
    }

    getHandleSize() {
      return window.matchMedia?.("(pointer: coarse)")?.matches || isAndroidPerformanceMode()
        ? MOBILE_HANDLE_SIZE
        : HANDLE_SIZE;
    }

    getHandleHitRadius(pointerType = "") {
      return pointerType === "touch"
        ? HANDLE_TOUCH_HIT_RADIUS_PX
        : HANDLE_HIT_RADIUS_PX;
    }

    getLayerArtboardRect(layer) {
      const artboardId = String(
        layer?.artboardId ||
        this.layerModel?.findEntryArtboardId?.(layer?.id) ||
        "",
      ).trim();

      return artboardId
        ? namespace.getDocumentArtboardRect?.(artboardId) || null
        : null;
    }

    isPointInsideLayerArtboard(layer, point, padding = 0) {
      const rect = this.getLayerArtboardRect(layer);
      const safePadding = Math.max(0, Number(padding) || 0);

      if (!rect || !point) {
        return true;
      }

      return (
        point.x >= rect.x - safePadding &&
        point.y >= rect.y - safePadding &&
        point.x <= rect.x + rect.width + safePadding &&
        point.y <= rect.y + rect.height + safePadding
      );
    }

    hasLayerAlphaNearPoint(layerId, point, hitRadius = 0) {
      if (this.documentRenderer?.getRasterAlphaAtPoint?.(layerId, point.x, point.y) > RASTER_ALPHA_HIT_THRESHOLD) {
        return true;
      }

      if (!(hitRadius > 0)) {
        return false;
      }

      const diagonal = hitRadius * Math.SQRT1_2;
      const sampleOffsets = [
        [-hitRadius, 0],
        [hitRadius, 0],
        [0, -hitRadius],
        [0, hitRadius],
        [-diagonal, -diagonal],
        [diagonal, -diagonal],
        [diagonal, diagonal],
        [-diagonal, diagonal],
      ];

      return sampleOffsets.some(([dx, dy]) =>
        this.documentRenderer?.getRasterAlphaAtPoint?.(layerId, point.x + dx, point.y + dy) > RASTER_ALPHA_HIT_THRESHOLD
      );
    }

    isPointInCurrentQuad(point) {
      if (!point || !Array.isArray(this.currentQuad) || this.currentQuad.length < 4) {
        return false;
      }

      let expectedSign = 0;

      for (let index = 0; index < this.currentQuad.length; index += 1) {
        const first = this.currentQuad[index];
        const second = this.currentQuad[(index + 1) % this.currentQuad.length];
        const cross =
          (second.x - first.x) * (point.y - first.y) -
          (second.y - first.y) * (point.x - first.x);

        if (Math.abs(cross) <= AXIS_ALIGNED_QUAD_EPSILON) {
          continue;
        }

        const sign = Math.sign(cross);

        if (expectedSign === 0) {
          expectedSign = sign;
        } else if (sign !== expectedSign) {
          return false;
        }
      }

      return true;
    }

    getPendingSelectionMoveLayerAtClient(clientX, clientY) {
      const layer = this.getActiveLayer();

      if (!this.hasPendingTransform() || !this.isTransformableLayer(layer)) {
        return null;
      }

      const point = this.clientToDocumentPoint(clientX, clientY);

      return this.isPointInCurrentQuad(point)
        ? layer
        : null;
    }

    getVectorTextNodeBounds(layerId) {
      const node = namespace.vectorTextRenderer?.getLayerNode?.(layerId);
      const rect = node?.getBoundingClientRect?.();

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const topLeft = this.clientToDocumentPoint(rect.left, rect.top);
      const bottomRight = this.clientToDocumentPoint(rect.right, rect.bottom);

      return {
        height: Math.max(1, bottomRight.y - topLeft.y),
        width: Math.max(1, bottomRight.x - topLeft.x),
        x: topLeft.x,
        y: topLeft.y,
      };
    }

    getVectorTextContentBounds(layer) {
      if (!this.isVectorTextLayer(layer)) {
        return null;
      }

      const contentRect = namespace.vectorTextRenderer?.getTextLayerContentRect?.(layer);

      if (contentRect?.width > 0 && contentRect?.height > 0) {
        return contentRect;
      }

      return this.getVectorTextNodeBounds(layer.id);
    }

    getLayerContentBounds(layer) {
      return this.isVectorTextLayer(layer)
        ? this.getVectorTextContentBounds(layer)
        : this.getPixelTightRasterContentBounds(layer);
    }

    getLayerSelectionBounds(layer) {
      if (this.isVectorTextLayer(layer)) {
        return this.getVectorTextContentBounds(layer);
      }

      return this.getCoarseRasterContentBounds(layer);
    }

    activateLayer(layer, options = {}) {
      const selectionOnly = options.selection === true;

      this.cancelTransform({ keepGeometry: false });

      if (!selectionOnly && layer && !this.requestLayerVisibleForTransform(layer, "raster-transform-activate")) {
        this.activeLayerId = null;
        this.contentRect = null;
        this.startVectorTextLayer = null;
        this.startQuad = null;
        this.currentQuad = null;
        this.startWarpPoints = null;
        this.currentWarpPoints = null;
        this.currentRotationRadians = 0;
        this.render();
        return false;
      }

      const canActivateLayer = selectionOnly
        ? this.isSelectableLayer(layer)
        : this.isTransformableLayer(layer);

      if (!canActivateLayer) {
        this.activeLayerId = null;
        this.contentRect = null;
        this.startVectorTextLayer = null;
        this.startQuad = null;
        this.currentQuad = null;
        this.startWarpPoints = null;
        this.currentWarpPoints = null;
        this.currentRotationRadians = 0;
        this.render();
        return false;
      }

      if (!selectionOnly && this.isRasterTransformLayer(layer)) {
        this.rasterizePuppetIfNeeded(layer);
      }

      const bounds = selectionOnly
        ? this.getLayerSelectionBounds(layer)
        : this.getLayerContentBounds(layer);

      this.activeLayerId = layer.id;
      this.contentRect = bounds || null;
      this.startVectorTextLayer = this.isVectorTextLayer(layer) ? cloneValue(layer) : null;
      this.startQuad = bounds ? rectToQuad(bounds) : null;
      this.currentQuad = bounds ? cloneValue(this.startQuad) : null;
      this.startWarpPoints = this.startQuad ? createWarpControlPointsFromQuad(this.startQuad) : null;
      this.currentWarpPoints = this.startWarpPoints ? cloneValue(this.startWarpPoints) : null;
      this.currentRotationRadians = 0;
      this.render();

      return Boolean(bounds);
    }

    deactivateLayer() {
      this.cancelTransform({ keepGeometry: false });
      this.activeLayerId = null;
      this.contentRect = null;
      this.startVectorTextLayer = null;
      this.startQuad = null;
      this.currentQuad = null;
      this.startWarpPoints = null;
      this.currentWarpPoints = null;
      this.currentRotationRadians = 0;
      this.render();
    }

    getVectorTextPreviewLayer(layer, quad = this.currentQuad) {
      const startLayer = this.startVectorTextLayer || layer;
      const startRect = this.contentRect || getRectFromQuad(this.startQuad);

      if (!this.isVectorTextLayer(startLayer) || !startRect || !Array.isArray(this.startQuad) || !Array.isArray(quad)) {
        return null;
      }

      const startWidth = Math.max(MIN_TRANSFORM_SIZE, getPointDistance(this.startQuad[0], this.startQuad[1]));
      const startHeight = Math.max(MIN_TRANSFORM_SIZE, getPointDistance(this.startQuad[0], this.startQuad[3]));
      const nextWidth = Math.max(MIN_TRANSFORM_SIZE, getPointDistance(quad[0], quad[1]));
      const nextHeight = Math.max(MIN_TRANSFORM_SIZE, getPointDistance(quad[0], quad[3]));
      const scaleX = nextWidth / startWidth;
      const scaleY = nextHeight / startHeight;
      const originPoint = interpolateQuadPoint(
        quad,
        (toFiniteNumber(startLayer.x, 0) - startRect.x) / Math.max(MIN_TRANSFORM_SIZE, startRect.width),
        (toFiniteNumber(startLayer.y, 0) - startRect.y) / Math.max(MIN_TRANSFORM_SIZE, startRect.height),
      );
      const rotationDelta = getQuadTopAngle(quad) - getQuadTopAngle(this.startQuad);

      return {
        ...startLayer,
        rotation: toFiniteNumber(startLayer.rotation, 0) + radiansToDegrees(rotationDelta),
        scaleX: toFiniteNumber(startLayer.scaleX, 1) * scaleX,
        scaleY: toFiniteNumber(startLayer.scaleY, 1) * scaleY,
        x: originPoint.x,
        y: originPoint.y,
      };
    }

    setVectorTextPreviewLayer(layer) {
      const node = namespace.vectorTextRenderer?.getLayerNode?.(layer?.id);

      if (!node || !layer) {
        return false;
      }

      node.setAttribute("transform", formatVectorTextLayerTransform(layer));
      this.documentRenderer?.setVectorTextTransformPreviewLayer?.(layer.id);
      namespace.vectorTextRenderer?.beginTextEditPreview?.();

      return true;
    }

    clearVectorTextPreview() {
      if (!this.startVectorTextLayer?.id) {
        this.documentRenderer?.clearVectorTextTransformPreviewLayer?.();
        namespace.vectorTextRenderer?.endTextEditPreview?.();
        return;
      }

      const layer = this.layerModel?.findEntryById?.(this.startVectorTextLayer.id) || this.startVectorTextLayer;
      const node = namespace.vectorTextRenderer?.getLayerNode?.(this.startVectorTextLayer.id);

      node?.setAttribute("transform", formatVectorTextLayerTransform(layer));
      this.documentRenderer?.clearVectorTextTransformPreviewLayer?.(this.startVectorTextLayer.id);
      namespace.vectorTextRenderer?.endTextEditPreview?.();
    }

    getSourceUvRect(sourceRect, targetRect) {
      if (!sourceRect || !targetRect || !(targetRect.width > 0) || !(targetRect.height > 0)) {
        return null;
      }

      const epsilon = 0.001;
      const left = sourceRect.x - targetRect.x;
      const top = sourceRect.y - targetRect.y;

      if (
        left < -epsilon ||
        top < -epsilon ||
        left + sourceRect.width > targetRect.width + epsilon ||
        top + sourceRect.height > targetRect.height + epsilon
      ) {
        return null;
      }

      return {
        height: sourceRect.height / targetRect.height,
        width: sourceRect.width / targetRect.width,
        x: left / targetRect.width,
        y: top / targetRect.height,
      };
    }

    getLiveRasterTransformPreview(effectiveTransformMode = this.getEffectiveTransformMode()) {
      if (
        !isAndroidLiveTransformPreviewEnabled() ||
        effectiveTransformMode !== "free" ||
        !this.activeLayerId ||
        !this.contentRect ||
        !Array.isArray(this.currentQuad)
      ) {
        return null;
      }

      const target = this.documentRenderer?.rasterTargetsByLayerId?.get?.(this.activeLayerId) || null;

      if (
        !target?.texture ||
        this.documentRenderer?.isSparseRasterTarget?.(target) === true ||
        target.state === "CPU_COLD"
      ) {
        return null;
      }

      const targetRect = this.normalizeTransformRect(
        this.documentRenderer?.getRasterTargetDocumentRect?.(target),
      );
      const sourceRect = this.normalizeTransformRect(this.contentRect);
      const sourceUvRect = this.getSourceUvRect(sourceRect, targetRect);

      if (!targetRect || !sourceRect || !sourceUvRect) {
        return null;
      }

      return {
        liveTexture: true,
        quad: this.currentQuad,
        sourceRect,
        sourceUvRect,
        texture: target.texture,
      };
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

    createDragEventSnapshot(event) {
      return {
        altKey: event.altKey === true,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey === true,
        metaKey: event.metaKey === true,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey === true,
      };
    }

    scheduleDragUpdate(event) {
      this.pendingDragEvent = this.createDragEventSnapshot(event);

      if (this.dragFrameRequest) {
        return;
      }

      this.dragFrameRequest = requestAnimationFrame(() => {
        this.dragFrameRequest = 0;
        this.flushPendingDragUpdate();
      });
    }

    flushPendingDragUpdate() {
      if (this.dragFrameRequest) {
        cancelAnimationFrame(this.dragFrameRequest);
        this.dragFrameRequest = 0;
      }

      const event = this.pendingDragEvent;

      this.pendingDragEvent = null;

      if (!event || !this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      this.updateDrag(event);
    }

    cancelPendingDragUpdate() {
      if (this.dragFrameRequest) {
        cancelAnimationFrame(this.dragFrameRequest);
        this.dragFrameRequest = 0;
      }

      this.pendingDragEvent = null;
    }

    updatePreview() {
      const activeLayer = this.layerModel?.findEntryById?.(this.activeLayerId);

      if (this.isVectorTextLayer(activeLayer)) {
        const previewLayer = this.getVectorTextPreviewLayer(activeLayer);

        return this.setVectorTextPreviewLayer(previewLayer);
      }

      const effectiveTransformMode = this.getEffectiveTransformMode();
      const livePreview = this.getLiveRasterTransformPreview(effectiveTransformMode);

      if (livePreview) {
        this.documentRenderer?.setRasterTransformPreview?.({
          edgeFeatherPixels: this.getEdgeFeatherPixelsForQuad(this.currentQuad),
          layerId: this.activeLayerId,
          liveTexture: true,
          opacity: 1,
          quad: livePreview.quad,
          sourceRect: livePreview.sourceRect,
          sourceUvRect: livePreview.sourceUvRect,
          texture: livePreview.texture,
          transformMode: effectiveTransformMode,
          warpControlPoints: null,
        });

        return true;
      }

      const snapshot = this.createSourceSnapshot();

      if (!snapshot?.texture || !this.currentQuad) {
        return false;
      }

      if (effectiveTransformMode === WARP_TRANSFORM_MODE && !this.ensureWarpControlPoints()) {
        return false;
      }

      this.documentRenderer?.setRasterTransformPreview?.({
        edgeFeatherPixels: this.getEdgeFeatherPixelsForQuad(this.currentQuad),
        layerId: this.activeLayerId,
        opacity: 1,
        quad: this.currentQuad,
        sourceRect: this.contentRect,
        sourceUvRect: null,
        texture: snapshot.texture,
        transformMode: effectiveTransformMode,
        warpControlPoints: effectiveTransformMode === WARP_TRANSFORM_MODE
          ? this.currentWarpPoints
          : null,
      });

      return true;
    }

    cancelTransform(options = {}) {
      this.cancelPendingDragUpdate();
      this.clearSelectionMoveHold({ releaseCapture: true });
      this.clearVectorTextPreview();

      if (this.sourceSnapshot) {
        this.documentRenderer?.deleteRasterSnapshot?.(this.sourceSnapshot);
        this.sourceSnapshot = null;
      }

      if (this.activeLayerId) {
        this.documentRenderer?.clearRasterTransformPreview?.(this.activeLayerId);
      }

      this.dragState = null;
      this.startVectorTextLayer = null;
      this.currentRotationRadians = 0;

      if (options.keepGeometry !== false && this.startQuad) {
        this.currentQuad = cloneValue(this.startQuad);
        this.currentWarpPoints = this.startWarpPoints ? cloneValue(this.startWarpPoints) : null;
      }

      this.render();
    }

    commitVectorTextTransform(layer) {
      if (!this.isVectorTextLayer(layer) || !this.activeLayerId || !this.contentRect || !this.currentQuad) {
        return false;
      }

      if (!quadChanged(this.startQuad || [], this.currentQuad || [])) {
        this.cancelTransform();
        return false;
      }

      const previewLayer = this.getVectorTextPreviewLayer(layer);

      if (!previewLayer) {
        this.cancelTransform();
        return false;
      }

      this.isCommitting = true;

      const historyGroup = `vector-text-transform-${layer.id}`;
      const didCommit = this.layerModel?.updateLayer?.(layer.id, {
        rotation: previewLayer.rotation,
        scaleX: previewLayer.scaleX,
        scaleY: previewLayer.scaleY,
        x: previewLayer.x,
        y: previewLayer.y,
      }, {
        historyGroup,
        source: "vector-text-transform",
      }) === true;

      if (didCommit) {
        const transfer = this.documentRenderer?.resolveTransformArtboardTransfer?.(layer.id, {
          destQuad: this.currentQuad,
          destRect: getRectFromQuad(this.currentQuad),
          transformMode: "free",
        });

        if (transfer?.toArtboardId) {
          this.layerModel?.moveLayerToArtboard?.(layer.id, transfer.toArtboardId, {
            historyGroup,
            source: "vector-text-transform",
          });
        }
      }

      this.dragState = null;
      this.sourceSnapshot = null;
      this.startVectorTextLayer = null;

      if (!didCommit) {
        this.documentRenderer?.clearVectorTextTransformPreviewLayer?.(layer.id);
        namespace.vectorTextRenderer?.endTextEditPreview?.();
      }

      const nextLayer = this.layerModel?.findEntryById?.(layer.id) || previewLayer;
      const bounds = didCommit
        ? this.getVectorTextContentBounds(nextLayer) || getRectFromQuad(this.currentQuad)
        : null;

      if (didCommit && bounds) {
        this.contentRect = bounds;
        this.startQuad = rectToQuad(bounds);
        this.currentQuad = this.startQuad ? cloneValue(this.startQuad) : null;
        this.startWarpPoints = this.startQuad ? createWarpControlPointsFromQuad(this.startQuad) : null;
        this.currentWarpPoints = this.startWarpPoints ? cloneValue(this.startWarpPoints) : null;
      }

      this.currentRotationRadians = 0;
      this.isCommitting = false;
      this.render();

      return didCommit;
    }

    commitTransform() {
      this.clearSelectionMoveHold({ releaseCapture: true });
      this.flushPendingDragUpdate();

      if (this.isCommitting) {
        return false;
      }

      const effectiveTransformMode = this.getEffectiveTransformMode();
      const activeLayer = this.layerModel?.findEntryById?.(this.activeLayerId);

      if (activeLayer && !this.requestLayerVisibleForTransform(activeLayer, "raster-transform")) {
        return false;
      }

      if (this.isVectorTextLayer(activeLayer)) {
        return this.commitVectorTextTransform(activeLayer);
      }

      if (!this.activeLayerId || !this.contentRect || !this.currentQuad) {
        return false;
      }

      if (!quadChanged(this.startQuad || [], this.currentQuad || [])) {
        if (effectiveTransformMode === WARP_TRANSFORM_MODE && warpControlPointsChanged(this.startWarpPoints || [], this.currentWarpPoints || [])) {
          // Internal warp points can change without moving the four corners.
        } else {
          this.cancelTransform();
          return false;
        }
      }

      if (effectiveTransformMode === WARP_TRANSFORM_MODE && !this.ensureWarpControlPoints()) {
        this.cancelTransform();
        return false;
      }

      this.isCommitting = true;
      const layerId = this.activeLayerId;
      const sourceRect = cloneValue(this.contentRect);
      const destQuad = cloneValue(this.currentQuad);
      const warpControlPoints = effectiveTransformMode === WARP_TRANSFORM_MODE
        ? cloneValue(this.currentWarpPoints)
        : null;
      const edgeFeatherPixels = this.getEdgeFeatherPixelsForQuad(destQuad);
      const translateOnly = this.documentRenderer?.getTranslateOnlyRasterTransformDelta?.({
        destQuad,
        sourceRect,
        transformMode: effectiveTransformMode,
        warpControlPoints,
      });
      const sourceSnapshot = translateOnly
        ? this.sourceSnapshot
        : this.sourceSnapshot || this.createSourceSnapshot();

      if (!translateOnly && !sourceSnapshot?.texture) {
        this.isCommitting = false;
        return false;
      }

      this.render();

      const didCommit = this.documentRenderer?.commitRasterTransform?.({
        destQuad,
        edgeFeatherPixels,
        layerId,
        source: "raster-transform",
        sourceRect,
        sourceSnapshot,
        transformMode: effectiveTransformMode,
        warpControlPoints,
      }) === true;

      if (sourceSnapshot) {
        this.documentRenderer?.deleteRasterSnapshot?.(sourceSnapshot);
      }

      if (sourceSnapshot && this.sourceSnapshot === sourceSnapshot) {
        this.sourceSnapshot = null;
      }

      this.dragState = null;

      const layer = this.layerModel?.findEntryById?.(layerId) || this.getActiveLayer();

      if (didCommit && this.isTransformableLayer(layer)) {
        const bounds = this.getPixelTightRasterContentBounds(layer);

        this.contentRect = bounds || null;
        this.startQuad = bounds ? rectToQuad(bounds) : null;
        this.currentQuad = bounds ? cloneValue(this.startQuad) : null;
        this.startWarpPoints = this.startQuad ? createWarpControlPointsFromQuad(this.startQuad) : null;
        this.currentWarpPoints = this.startWarpPoints ? cloneValue(this.startWarpPoints) : null;
        this.currentRotationRadians = 0;
      }

      this.isCommitting = false;
      this.render();

      return didCommit;
    }

    getEdgeFeatherPixelsForQuad(quad = this.currentQuad) {
      return isAxisAlignedQuad(quad) ? 0 : undefined;
    }

    pickLayerAtClient(clientX, clientY, options = {}) {
      const point = this.clientToDocumentPoint(clientX, clientY);
      const layers = this.documentRenderer?.getRenderableLayers?.() || this.layerModel?.getRenderableLayers?.() || [];
      const selectionOnly = options.selection === true;
      const hitRadius = selectionOnly ? this.getSelectionHitRadius(options.pointerType) : 0;

      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        const canPickLayer = selectionOnly
          ? this.isSelectableLayer(layer)
          : this.isTransformableLayer(layer);

        if (!canPickLayer) {
          continue;
        }

        if (
          this.isPointInsideLayerArtboard(layer, point, hitRadius) &&
          this.hasLayerAlphaNearPoint(layer.id, point, hitRadius)
        ) {
          return layer;
        }
      }

      return null;
    }

    getHandleTarget(target) {
      return target?.closest?.(".editor-raster-transform-handle") || null;
    }

    getHandleHitAtClient(clientX, clientY, pointerType = "") {
      if (!this.isActive() || this.isWarpMode() || !Array.isArray(this.currentQuad)) {
        return null;
      }

      const viewportPoint = this.clientToViewportPoint(clientX, clientY);
      const points = this.currentQuad.map((point) => this.documentToViewportPoint(point.x, point.y));
      const handlePoints = this.getHandlePoints(points);
      const hitRadius = this.getHandleHitRadius(pointerType);
      const maxDistanceSq = hitRadius * hitRadius;
      let closest = null;

      handlePoints.forEach((handlePoint, index) => {
        const dx = handlePoint.x - viewportPoint.x;
        const dy = handlePoint.y - viewportPoint.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq <= maxDistanceSq && (!closest || distanceSq < closest.distanceSq)) {
          closest = { distanceSq, index };
        }
      });

      return closest ? this.handles[closest.index] || null : null;
    }

    getBoxTarget(target) {
      return target?.closest?.(".editor-raster-transform-box") || null;
    }

    getWarpPointTarget(target) {
      return target?.closest?.(".editor-raster-transform-warp-point") || null;
    }

    getWarpPointHitFromTarget(target) {
      const warpPoint = this.getWarpPointTarget(target);

      if (!warpPoint) {
        return null;
      }

      return {
        col: Math.max(0, Math.min(3, Number(warpPoint.dataset.col) || 0)),
        row: Math.max(0, Math.min(3, Number(warpPoint.dataset.row) || 0)),
      };
    }

    getWarpPointHitAtClient(clientX, clientY, pointerType = "") {
      if (!Array.isArray(this.currentWarpPoints)) {
        return null;
      }

      const viewportPoint = this.clientToViewportPoint(clientX, clientY);
      const hitRadius = pointerType === "touch"
        ? WARP_POINT_TOUCH_HIT_RADIUS_PX
        : WARP_POINT_HIT_RADIUS_PX;
      const maxDistanceSq = hitRadius * hitRadius;
      let closest = null;

      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const point = this.currentWarpPoints[row]?.[col];

          if (!point) {
            continue;
          }

          const candidate = this.documentToViewportPoint(point.x, point.y);
          const dx = candidate.x - viewportPoint.x;
          const dy = candidate.y - viewportPoint.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq <= maxDistanceSq && (!closest || distanceSq < closest.distanceSq)) {
            closest = {
              col,
              distanceSq,
              row,
            };
          }
        }
      }

      return closest ? { col: closest.col, row: closest.row } : null;
    }

    shouldStartOffArtboardLayerDrag(point, pointerType = "") {
      if (
        pointerType !== "touch" ||
        !this.isActive() ||
        !this.activeLayerId ||
        !Array.isArray(this.currentQuad) ||
        !this.contentRect
      ) {
        return false;
      }

      const layer = this.getActiveLayer();
      const artboardRect = this.getLayerArtboardRect(layer);

      return Boolean(
        artboardRect &&
        this.isTransformableLayer(layer) &&
        !this.isPointInsideLayerArtboard(layer, point, 0)
      );
    }

    clearSelectionMoveHold(options = {}) {
      const holdState = this.selectionMoveHoldState;

      if (!holdState) {
        return null;
      }

      if (holdState.timerId != null) {
        window.clearTimeout(holdState.timerId);
      }

      this.selectionMoveHoldState = null;

      if (
        options.releaseCapture === true &&
        holdState.pointerId != null &&
        this.svg.hasPointerCapture?.(holdState.pointerId)
      ) {
        this.svg.releasePointerCapture(holdState.pointerId);
      }

      return holdState;
    }

    beginSelectionMoveHold(event, layer) {
      if (!this.isTransformableLayer(layer) || !this.currentQuad || !this.contentRect) {
        return false;
      }

      this.clearSelectionMoveHold({ releaseCapture: true });

      this.selectionMoveHoldState = {
        clientX: event.clientX,
        clientY: event.clientY,
        layerId: layer.id,
        pointerId: event.pointerId,
        timerId: window.setTimeout(() => {
          this.beginSelectionMoveDrag();
        }, SELECTION_MOVE_HOLD_MS),
      };

      this.svg.setPointerCapture?.(event.pointerId);

      return true;
    }

    beginSelectionMoveDrag() {
      const holdState = this.clearSelectionMoveHold();

      if (!holdState) {
        return false;
      }

      const layer = this.layerModel?.findEntryById?.(holdState.layerId);

      if (!this.isSelectionActive() || !this.isTransformableLayer(layer) || layer.id !== this.activeLayerId || !this.currentQuad || !this.contentRect) {
        if (this.svg.hasPointerCapture?.(holdState.pointerId)) {
          this.svg.releasePointerCapture(holdState.pointerId);
        }

        return false;
      }

      const point = this.clientToDocumentPoint(holdState.clientX, holdState.clientY);

      this.dragState = {
        didChange: false,
        dir: "",
        handleIndex: -1,
        mode: "move",
        pointerId: holdState.pointerId,
        selectionMove: true,
        startPoint: point,
        startQuad: cloneValue(this.currentQuad),
        startRect: getRectFromQuad(this.currentQuad),
      };
      this.updatePreview();
      this.render();

      return true;
    }

    isWarpMode() {
      return this.isActive() &&
        this.transformMode === WARP_TRANSFORM_MODE &&
        !this.isRotateActive() &&
        !this.isVectorTextLayer(this.getActiveLayer());
    }

    getEffectiveTransformMode() {
      if (this.isVectorTextLayer(this.getActiveLayer())) {
        return "free";
      }

      if (this.isWarpMode()) {
        return WARP_TRANSFORM_MODE;
      }

      return this.transformMode === "perspective" ? "perspective" : "free";
    }

    ensureWarpControlPoints() {
      if (Array.isArray(this.currentWarpPoints)) {
        return true;
      }

      if (!Array.isArray(this.currentQuad)) {
        return false;
      }

      this.currentWarpPoints = createWarpControlPointsFromQuad(this.currentQuad);

      if (!Array.isArray(this.startWarpPoints) && Array.isArray(this.startQuad)) {
        this.startWarpPoints = createWarpControlPointsFromQuad(this.startQuad);
      }

      return Array.isArray(this.currentWarpPoints);
    }

    getWarpInteractionBounds() {
      const controlPoints = this.currentWarpPoints;

      if (!Array.isArray(controlPoints)) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const point = controlPoints[row]?.[col];
          const x = toFiniteNumber(point?.x, NaN);
          const y = toFiniteNumber(point?.y, NaN);

          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            continue;
          }

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    isPointInWarpInteractionArea(point) {
      const bounds = this.getWarpInteractionBounds();

      if (!bounds || !point) {
        return false;
      }

      const padding = Math.max(4, 8 * this.dpr / this.camera.zoom);

      return (
        point.x >= bounds.x - padding &&
        point.x <= bounds.x + bounds.width + padding &&
        point.y >= bounds.y - padding &&
        point.y <= bounds.y + bounds.height + padding
      );
    }

    getWarpUvForDocumentPoint(point) {
      if (!this.currentWarpPoints || !point) {
        return { u: 0.5, v: 0.5 };
      }

      let bestU = 0.5;
      let bestV = 0.5;
      let bestDistanceSq = Infinity;
      const steps = 24;

      for (let row = 0; row <= steps; row += 1) {
        const v = row / steps;

        for (let col = 0; col <= steps; col += 1) {
          const u = col / steps;
          const sample = evaluateWarpSurface(u, v, this.currentWarpPoints);
          const dx = sample.x - point.x;
          const dy = sample.y - point.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestU = u;
            bestV = v;
          }
        }
      }

      return { u: bestU, v: bestV };
    }

    getAttachedWarpHandles(row, col) {
      const handles = [];

      if (row === 0 && col === 0) {
        handles.push([0, 1], [1, 0]);
      } else if (row === 0 && col === 3) {
        handles.push([0, 2], [1, 3]);
      } else if (row === 3 && col === 3) {
        handles.push([3, 2], [2, 3]);
      } else if (row === 3 && col === 0) {
        handles.push([3, 1], [2, 0]);
      }

      return handles;
    }

    applyWarpPointDelta(controlPoints, row, col, dx, dy) {
      const nextPoints = cloneValue(controlPoints);
      const movePoint = (targetRow, targetCol) => {
        if (!nextPoints[targetRow]?.[targetCol]) {
          return;
        }

        nextPoints[targetRow][targetCol] = {
          x: nextPoints[targetRow][targetCol].x + dx,
          y: nextPoints[targetRow][targetCol].y + dy,
        };
      };

      movePoint(row, col);

      if (getWarpPointKind(row, col) === "corner") {
        this.getAttachedWarpHandles(row, col).forEach(([handleRow, handleCol]) => {
          movePoint(handleRow, handleCol);
        });
      }

      return nextPoints;
    }

    applyWarpSurfaceDelta(controlPoints, u, v, dx, dy) {
      const nextPoints = cloneValue(controlPoints);
      const weights = Array.from({ length: 4 }, () => Array(4).fill(0));
      let sumSq = 0;

      for (let row = 0; row < 4; row += 1) {
        const by = bernsteinCubic(row, v);

        for (let col = 0; col < 4; col += 1) {
          const weight = by * bernsteinCubic(col, u);

          weights[row][col] = weight;
          sumSq += weight * weight;
        }
      }

      const divisor = sumSq > 0.000001 ? sumSq : 1;

      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const weight = weights[row][col] / divisor;

          nextPoints[row][col] = {
            x: nextPoints[row][col].x + dx * weight,
            y: nextPoints[row][col].y + dy * weight,
          };
        }
      }

      return nextPoints;
    }

    syncQuadFromWarpPoints() {
      const boundaryQuad = getWarpBoundaryQuad(this.currentWarpPoints);

      if (boundaryQuad) {
        this.currentQuad = boundaryQuad;
      }
    }

    handlePointerDown(event) {
      if (namespace.isTouchNavigationExclusive?.() || !this.isOverlayActive() || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (this.isSelectionActive()) {
        const pendingMoveLayer = this.getPendingSelectionMoveLayerAtClient(event.clientX, event.clientY);
        let hitLayer = pendingMoveLayer || this.pickLayerAtClient(event.clientX, event.clientY, {
          pointerType: event.pointerType,
          selection: true,
        });

        if (this.hasPendingTransform() && !pendingMoveLayer) {
          this.commitTransform();
          hitLayer = this.pickLayerAtClient(event.clientX, event.clientY, {
            pointerType: event.pointerType,
            selection: true,
          });
        }

        if (hitLayer) {
          if (!this.isSelectionLayerActivationCurrent(hitLayer)) {
            this.activateLayer(hitLayer, { selection: true });
          }

          if (this.layerModel?.activeLayerId !== hitLayer.id) {
            this.layerModel?.setActiveLayer?.(hitLayer.id, { source: "selection-tool" });
          }

          this.beginSelectionMoveHold(event, hitLayer);
        } else {
          this.layerModel?.setActiveLayer?.(null, { source: "selection-tool" });
          this.activateLayer(null, { selection: true });
        }

        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const handle = this.getHandleTarget(event.target) ||
        this.getHandleHitAtClient(event.clientX, event.clientY, event.pointerType);
      const offArtboardMove = !handle &&
        this.shouldStartOffArtboardLayerDrag(point, event.pointerType);
      const box = this.getBoxTarget(event.target) || (
        !this.isWarpMode() &&
        this.activeLayerId &&
        Array.isArray(this.currentQuad) &&
        this.isPointInCurrentQuad(point)
          ? this.box
          : null
      ) || (offArtboardMove ? this.box : null);

      if (this.isWarpMode()) {
        if (!this.activeLayerId || !this.currentQuad || !this.contentRect || !this.ensureWarpControlPoints()) {
          return;
        }

        const warpPointHit = this.getWarpPointHitFromTarget(event.target) ||
          this.getWarpPointHitAtClient(event.clientX, event.clientY, event.pointerType);

        if (!warpPointHit && !this.isPointInWarpInteractionArea(point)) {
          if (this.hasPendingTransform()) {
            return;
          }

          const hitLayer = this.pickLayerAtClient(event.clientX, event.clientY);

          if (hitLayer) {
            this.layerModel?.setActiveLayer?.(hitLayer.id, { source: "raster-transform-select" });
          }

          return;
        }

        const row = warpPointHit ? warpPointHit.row : -1;
        const col = warpPointHit ? warpPointHit.col : -1;
        const uv = warpPointHit ? null : this.getWarpUvForDocumentPoint(point);

        this.dragState = {
          col,
          didChange: false,
          mode: warpPointHit ? "warp-point" : "warp-surface",
          pointerId: event.pointerId,
          row,
          startPoint: point,
          startQuad: cloneValue(this.currentQuad),
          startRect: getRectFromQuad(this.currentQuad),
          startWarpPoints: cloneValue(this.currentWarpPoints),
          warpU: uv?.u ?? 0.5,
          warpV: uv?.v ?? 0.5,
        };
        this.svg.setPointerCapture?.(event.pointerId);
        this.updatePreview();
        return;
      }

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

      const rotationCenter = getQuadCenter(this.currentQuad);
      const mode = offArtboardMove
        ? "move"
        : this.isRotateActive()
        ? "rotate"
        : handle
          ? (this.getEffectiveTransformMode() === "free" ? "scale" : "distort")
          : "move";

      this.dragState = {
        didChange: false,
        dir: handle?.dataset.dir || "",
        handleIndex: handle ? Number(handle.dataset.handleIndex) : -1,
        mode,
        pointerId: event.pointerId,
        rotationCenter,
        startAngle: getPointAngleFromCenter(rotationCenter, point),
        startPoint: point,
        startQuad: cloneValue(this.currentQuad),
        startRect: getRectFromQuad(this.currentQuad),
        startRotationRadians: this.currentRotationRadians,
      };
      this.svg.setPointerCapture?.(event.pointerId);
      this.updatePreview();
    }

    handlePointerMove(event) {
      if (this.selectionMoveHoldState?.pointerId === event.pointerId) {
        this.selectionMoveHoldState.clientX = event.clientX;
        this.selectionMoveHoldState.clientY = event.clientY;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.scheduleDragUpdate(event);
    }

    handlePointerUp(event) {
      if (this.selectionMoveHoldState?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        this.clearSelectionMoveHold({ releaseCapture: true });
        return;
      }

      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      this.pendingDragEvent = this.createDragEventSnapshot(event);
      this.flushPendingDragUpdate();

      if (this.svg.hasPointerCapture?.(event.pointerId)) {
        this.svg.releasePointerCapture(event.pointerId);
      }

      this.dragState = null;

      if (!this.hasPendingTransform()) {
        this.cancelTransform();
      } else {
        this.updatePreview();
        this.render();
      }
    }

    handlePointerCancel(event) {
      if (this.selectionMoveHoldState?.pointerId === event.pointerId) {
        this.clearSelectionMoveHold({ releaseCapture: true });
        return;
      }

      if (this.dragState?.pointerId === event.pointerId) {
        this.cancelPendingDragUpdate();
        this.cancelTransform();
      }
    }

    handleTouchNavigationStart() {
      this.clearSelectionMoveHold({ releaseCapture: true });

      if (this.dragState) {
        this.cancelPendingDragUpdate();
        this.cancelTransform();
      }
    }

    updateDrag(event) {
      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const dx = point.x - this.dragState.startPoint.x;
      const dy = point.y - this.dragState.startPoint.y;

      if (this.dragState.mode === "warp-point") {
        this.currentWarpPoints = this.applyWarpPointDelta(
          this.dragState.startWarpPoints,
          this.dragState.row,
          this.dragState.col,
          dx,
          dy,
        );
        this.syncQuadFromWarpPoints();
      } else if (this.dragState.mode === "warp-surface") {
        this.currentWarpPoints = this.applyWarpSurfaceDelta(
          this.dragState.startWarpPoints,
          this.dragState.warpU,
          this.dragState.warpV,
          dx,
          dy,
        );
        this.syncQuadFromWarpPoints();
      } else if (this.dragState.mode === "move") {
        const snappedDelta = this.getSnappedMoveDelta(dx, dy);

        this.currentQuad = this.dragState.startQuad.map((item) => ({
          x: item.x + snappedDelta.dx,
          y: item.y + snappedDelta.dy,
        }));
      } else if (this.dragState.mode === "scale") {
        this.currentQuad = this.getScaledQuad(dx, dy, event);
      } else if (this.dragState.mode === "rotate") {
        this.currentQuad = this.getRotatedQuad(point, event);
      } else {
        this.currentQuad = this.getDistortedQuad(dx, dy);
      }

      this.dragState.didChange = this.dragState.mode === "warp-point" || this.dragState.mode === "warp-surface"
        ? warpControlPointsChanged(this.dragState.startWarpPoints, this.currentWarpPoints)
        : quadChanged(this.dragState.startQuad, this.currentQuad);
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

      if (this.isScaleAspectLocked(event) && startRect.height > 0) {
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

    isScaleAspectLocked(event = {}) {
      return this.transformAspectLocked === true || event.shiftKey === true;
    }

    getRotatedQuad(point, event) {
      const center = this.dragState.rotationCenter || getQuadCenter(this.dragState.startQuad);
      const currentAngle = getPointAngleFromCenter(center, point);
      const rawDelta = currentAngle - this.dragState.startAngle;
      const delta = getSnappedRotationAngle(rawDelta, { force: event.shiftKey });

      this.currentRotationRadians = toFiniteNumber(this.dragState.startRotationRadians, 0) + delta;

      return this.dragState.startQuad.map((item) => rotatePointAroundCenter(item, center, delta));
    }

    setRotationDegrees(degrees) {
      if (!this.activeLayerId || !this.startQuad || !this.contentRect) {
        return false;
      }

      const radians = degreesToRadians(degrees);
      const center = getQuadCenter(this.startQuad);

      this.currentRotationRadians = radians;
      this.currentQuad = this.startQuad.map((item) => rotatePointAroundCenter(item, center, radians));
      this.render();
      this.updatePreview();

      return true;
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
      const hasWarpChange = this.getEffectiveTransformMode() === WARP_TRANSFORM_MODE &&
        Array.isArray(this.startWarpPoints) &&
        Array.isArray(this.currentWarpPoints) &&
        warpControlPointsChanged(this.startWarpPoints, this.currentWarpPoints);
      const activeLayer = this.layerModel?.findEntryById?.(this.activeLayerId);
      const hasTransformSource = this.isVectorTextLayer(activeLayer) || this.isTransformableLayer(activeLayer);

      return Boolean(
        hasTransformSource &&
          Array.isArray(this.startQuad) &&
          Array.isArray(this.currentQuad) &&
          (quadChanged(this.startQuad, this.currentQuad) || hasWarpChange)
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

      if (this.isScaleAspectLocked(event)) {
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

    createWarpPath(points = []) {
      if (!points.length) {
        return "";
      }

      return points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
    }

    getWarpGridViewportPath(axis, value) {
      const points = [];

      for (let step = 0; step <= WARP_GRID_SAMPLE_STEPS; step += 1) {
        const amount = step / WARP_GRID_SAMPLE_STEPS;
        const u = axis === "u" ? value : amount;
        const v = axis === "v" ? value : amount;
        const point = evaluateWarpSurface(u, v, this.currentWarpPoints);

        points.push(this.documentToViewportPoint(point.x, point.y));
      }

      return this.createWarpPath(points);
    }

    renderWarpControls(isVisible) {
      const showWarp = Boolean(isVisible && this.isWarpMode() && this.ensureWarpControlPoints());

      setSvgElementVisible(this.warpLayer, showWarp);

      if (!showWarp) {
        this.warpGridPaths.forEach((path) => path.setAttribute("d", ""));
        this.warpHandleLines.forEach((line) => {
          line.setAttribute("x1", "-9999");
          line.setAttribute("y1", "-9999");
          line.setAttribute("x2", "-9999");
          line.setAttribute("y2", "-9999");
        });
        this.warpPoints.forEach((point) => {
          point.setAttribute("cx", "-9999");
          point.setAttribute("cy", "-9999");
        });
        return;
      }

      const values = [0, 1 / 3, 2 / 3, 1];

      values.forEach((value, index) => {
        this.warpGridPaths[index].setAttribute("d", this.getWarpGridViewportPath("v", value));
        this.warpGridPaths[index + 4].setAttribute("d", this.getWarpGridViewportPath("u", value));
      });

      this.warpHandleLines.forEach((line, index) => {
        const definition = WARP_HANDLE_LINE_DEFS[index];
        const fromPoint = this.currentWarpPoints[definition.from[0]]?.[definition.from[1]];
        const toPoint = this.currentWarpPoints[definition.to[0]]?.[definition.to[1]];
        const fromViewport = this.documentToViewportPoint(fromPoint?.x || 0, fromPoint?.y || 0);
        const toViewport = this.documentToViewportPoint(toPoint?.x || 0, toPoint?.y || 0);

        line.setAttribute("x1", fromViewport.x);
        line.setAttribute("y1", fromViewport.y);
        line.setAttribute("x2", toViewport.x);
        line.setAttribute("y2", toViewport.y);
      });

      this.warpPoints.forEach((point) => {
        const row = Number(point.dataset.row) || 0;
        const col = Number(point.dataset.col) || 0;
        const controlPoint = this.currentWarpPoints[row]?.[col];
        const viewportPoint = this.documentToViewportPoint(controlPoint?.x || 0, controlPoint?.y || 0);

        point.setAttribute("cx", viewportPoint.x);
        point.setAttribute("cy", viewportPoint.y);
      });
    }

    emitStateChange() {
      const detail = {
        active: this.isActive(),
        hasBounds: Array.isArray(this.currentQuad),
        layerId: this.activeLayerId || null,
        pending: this.hasPendingTransform(),
        rotationDegrees: formatRotationDegrees(this.currentRotationRadians),
        source: "raster-transform-tool",
        toolMode: this.activeTool,
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

      const isCommitting = this.isCommitting === true;
      const isVisible = !isCommitting && this.isOverlayActive() && Array.isArray(this.currentQuad);

      if (!isCommitting && this.isOverlayActive()) {
        this.svg.removeAttribute("hidden");
        this.svg.style.display = "block";
      } else {
        this.svg.setAttribute("hidden", "");
        this.svg.style.display = "none";
      }

      this.svg.classList.toggle("raster-transform-tool-active", this.isActive());
      this.svg.classList.toggle("raster-selection-tool-active", this.isSelectionActive());
      setSvgElementVisible(this.box, isVisible && !this.isWarpMode());
      this.renderGuides(isVisible && this.shouldShowGuides());
      this.renderWarpControls(isVisible);
      this.handles.forEach((handle) => {
        setSvgElementVisible(handle, isVisible && this.isActive() && !this.isWarpMode());

        if (!isVisible || !this.isActive() || this.isWarpMode()) {
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
      const transformCursor = this.isRotateActive()
        ? (this.dragState?.mode === "rotate" ? "grabbing" : "grab")
        : "move";
      const boxCursor = this.isSelectionActive() ? "default" : transformCursor;

      this.box.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
      this.box.style.cursor = boxCursor;

      if (this.isActive() && !this.isWarpMode()) {
        const handlePoints = this.getHandlePoints(points);
        const handleSize = this.getHandleSize();

        this.handles.forEach((handle, index) => {
          setSvgElementVisible(handle, true);
          handle.setAttribute("height", handleSize);
          handle.setAttribute("width", handleSize);
          handle.setAttribute("x", handlePoints[index].x - handleSize / 2);
          handle.setAttribute("y", handlePoints[index].y - handleSize / 2);
          handle.style.cursor = this.isRotateActive()
            ? transformCursor
            : HANDLE_DEFS[index].cursor;
        });
      }

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
