window.CBO = window.CBO || {};

(function registerVectorRectTool(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VECTOR_RECT_LAYER_TYPE = "vector-rect";
  const VECTOR_TEXT_LAYER_TYPE = "vector-text";
  const VECTOR_RECT_TOOL_MODE = "vector-rect";
  const MIN_RECT_DRAG_CSS_PX = 4;
  const DEFAULT_RECT_FILL = "#bfefff";
  const DEFAULT_RECT_STROKE = "#dbdbdb";
  const SELECTED_RECT_STROKE = "#f05023";
  const DEFAULT_RECT_STROKE_WIDTH = 3;
  const DEFAULT_RECT_RADIUS = 18;
  const RECT_FILL_SWATCHES = [
    { fill: "#bfefff", label: "Light blue" },
    { fill: "#111111", label: "Black" },
    { fill: "#8d3f35", label: "Brick" },
    { fill: "#b36b3a", label: "Copper" },
  ];
  const RECT_TITLE_HEIGHT = 18;
  const RECT_TITLE_GAP = 7;
  const RECT_TITLE_FONT_SIZE = 10;
  const RECT_TITLE_PADDING_X = 7;
  const RECT_TITLE_RADIUS = 5;
  const RECT_TITLE_MIN_FONT_SIZE = 7;
  const RECT_TITLE_MAX_FONT_SIZE = 14;
  const MIN_RECT_SIZE = 12;
  const RECT_RESIZE_HANDLE_SIZE_CSS_PX = 10;
  const RECT_RESIZE_HANDLE_HIT_SIZE_CSS_PX = 24;
  const RECT_ACTION_TOOLBAR_GAP_CSS_PX = 14;
  const RECT_ACTION_TOOLBAR_HEIGHT_CSS_PX = 40;
  const VECTOR_RECT_MOVE_TYPE = "vector-rect";
  const VECTOR_RECT_MOVE_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-move-icon lucide-move" aria-hidden="true">
      <path d="M12 2v20"></path>
      <path d="m15 19-3 3-3-3"></path>
      <path d="m19 9 3 3-3 3"></path>
      <path d="M2 12h20"></path>
      <path d="m5 9-3 3 3 3"></path>
      <path d="m9 5 3-3 3 3"></path>
    </svg>
  `;
  const RECT_RESIZE_HANDLES = [
    "nw",
    "ne",
    "se",
    "sw",
    "n",
    "e",
    "s",
    "w",
  ];

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      if (value == null) {
        return;
      }

      element.setAttribute(key, String(value));
    });

    return element;
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function toPositiveNumber(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  function isMobileMoveViewport() {
    return Boolean(
      window.matchMedia?.("(pointer: coarse), (max-width: 900px)")?.matches ||
      (window.innerWidth || 0) <= 900
    );
  }

  function getViewportDocumentScale() {
    return Math.max(0.0001, (Number(namespace.brushEngine?.camera?.zoom) || 1) /
      Math.max(1, Number(namespace.brushEngine?.dpr || window.devicePixelRatio || 1)));
  }

  function cssPixelsToDocumentUnits(cssPixels) {
    return Math.max(0, Number(cssPixels) || 0) / getViewportDocumentScale();
  }

  function documentPointToLayerPoint(layer, point) {
    if (!point) {
      return null;
    }

    const scaleX = toFiniteNumber(layer?.scaleX, 1) || 1;
    const scaleY = toFiniteNumber(layer?.scaleY, 1) || 1;
    const radians = (-toFiniteNumber(layer?.rotation, 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = toFiniteNumber(point.x, 0) - toFiniteNumber(layer?.x, 0);
    const dy = toFiniteNumber(point.y, 0) - toFiniteNumber(layer?.y, 0);

    return {
      x: (dx * cos - dy * sin) / scaleX,
      y: (dx * sin + dy * cos) / scaleY,
    };
  }

  function getVectorTextApproxBounds(layer) {
    const fontSize = Math.max(1, toFiniteNumber(layer?.fontSize, 300));
    const lineHeight = Math.max(1, toFiniteNumber(layer?.lineHeight, fontSize * 0.82));
    const letterSpacing = toFiniteNumber(layer?.letterSpacing, 0);
    const lines = String(layer?.text || "CBOs").split(/\r?\n/);
    const longestLineLength = Math.max(1, ...lines.map((line) => Math.max(1, line.length)));
    const width = Math.max(
      fontSize * 0.5,
      longestLineLength * fontSize * 0.62 + Math.max(0, longestLineLength - 1) * letterSpacing,
    );
    const height = Math.max(fontSize * 0.85, lines.length * lineHeight);
    const align = String(layer?.textAlign || "center").toLowerCase();
    const x1 = align === "right" ? -width : align === "left" ? 0 : -width / 2;

    return {
      x1,
      y1: -fontSize,
      x2: x1 + width,
      y2: Math.max(height, lineHeight),
    };
  }

  function isPointInVectorTextApproxBounds(point, layer, padding = 0) {
    const localPoint = documentPointToLayerPoint(layer, point);
    const bounds = getVectorTextApproxBounds(layer);
    const hitPadding = Math.max(0, Number(padding) || 0);

    return Boolean(
      localPoint &&
      localPoint.x >= bounds.x1 - hitPadding &&
      localPoint.y >= bounds.y1 - hitPadding &&
      localPoint.x <= bounds.x2 + hitPadding &&
      localPoint.y <= bounds.y2 + hitPadding
    );
  }

  function getCameraViewportOffset() {
    const camera = namespace.brushEngine?.camera || { x: 0, y: 0 };
    const dpr = Math.max(1, Number(namespace.brushEngine?.dpr || window.devicePixelRatio || 1));

    return {
      x: (Number(camera.x) || 0) / dpr,
      y: (Number(camera.y) || 0) / dpr,
    };
  }

  function normalizeFillColor(fill) {
    return String(fill || DEFAULT_RECT_FILL).trim().toLowerCase();
  }

  function getFillSwatch(fill) {
    const normalizedFill = normalizeFillColor(fill);

    return RECT_FILL_SWATCHES.find((swatch) => swatch.fill.toLowerCase() === normalizedFill) ||
      RECT_FILL_SWATCHES[0];
  }

  function getVectorRectActionToolbarMarkup() {
    const swatches = RECT_FILL_SWATCHES.map((swatch) => (
      `<button class="editor-ai-image-board-action-toolbar-button editor-vector-rect-fill-swatch" type="button" aria-label="${swatch.label}" aria-pressed="false" data-ai-image-board-toolbar-label="${swatch.label}" data-vector-rect-fill-swatch data-vector-rect-fill="${swatch.fill}" style="--vector-rect-swatch-color: ${swatch.fill};">
        <span class="editor-vector-rect-fill-swatch-chip" aria-hidden="true"></span>
      </button>`
    )).join("");

    return `
      <div class="editor-ai-image-board-action-toolbar-items editor-vector-rect-action-toolbar-items" data-vector-rect-action-toolbar-items>
        ${swatches}
        <span class="editor-ai-image-board-action-toolbar-separator editor-vector-rect-action-toolbar-separator" aria-hidden="true"></span>
        <button class="editor-ai-image-board-action-toolbar-button editor-vector-rect-move-button" type="button" aria-label="Move" aria-pressed="false" data-ai-image-board-toolbar-label="Move" data-vector-rect-move data-vector-rect-toolbar-action="move">
          ${VECTOR_RECT_MOVE_ICON}
        </button>
      </div>`;
  }

  function debugVectorRectFill(message, detail = {}) {
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug("[vector-rect-fill]", message, detail);
    }
  }

  function normalizeRect(rect = {}) {
    const x = toFiniteNumber(rect.x, 0);
    const y = toFiniteNumber(rect.y, 0);
    const width = toPositiveNumber(rect.width, 1);
    const height = toPositiveNumber(rect.height, 1);

    return {
      height,
      width,
      x,
      y,
    };
  }

  function roundRect(rect = {}) {
    const normalized = normalizeRect(rect);

    return {
      height: Math.max(1, Math.round(normalized.height)),
      width: Math.max(1, Math.round(normalized.width)),
      x: Math.round(normalized.x),
      y: Math.round(normalized.y),
    };
  }

  function getRectFromPoints(start, current, event = {}) {
    const startX = toFiniteNumber(start?.x, 0);
    const startY = toFiniteNumber(start?.y, 0);
    let dx = toFiniteNumber(current?.x, startX) - startX;
    let dy = toFiniteNumber(current?.y, startY) - startY;

    if (event.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));

      dx = (dx < 0 ? -1 : 1) * size;
      dy = (dy < 0 ? -1 : 1) * size;
    }

    if (event.altKey) {
      return normalizeRect({
        height: Math.abs(dy) * 2,
        width: Math.abs(dx) * 2,
        x: startX - Math.abs(dx),
        y: startY - Math.abs(dy),
      });
    }

    return normalizeRect({
      height: Math.abs(dy),
      width: Math.abs(dx),
      x: Math.min(startX, startX + dx),
      y: Math.min(startY, startY + dy),
    });
  }

  function getLayerRect(layer) {
    if (!layer || layer.type !== VECTOR_RECT_LAYER_TYPE) {
      return null;
    }

    const width = Number(layer.width);
    const height = Number(layer.height);

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }

    return {
      height,
      width,
      x: toFiniteNumber(layer.x, 0),
      y: toFiniteNumber(layer.y, 0),
    };
  }

  function getLayerTitle(layer) {
    return String(layer?.name || "Rectangle").trim() || "Rectangle";
  }

  function getRectTitleMetrics(rect) {
    const normalizedRect = normalizeRect(rect);
    const minSide = Math.min(normalizedRect.width, normalizedRect.height);
    const scale = clampNumber(minSide / 120, 0.7, 1.35);
    const fontSize = Math.round(clampNumber(
      RECT_TITLE_FONT_SIZE * scale,
      RECT_TITLE_MIN_FONT_SIZE,
      RECT_TITLE_MAX_FONT_SIZE
    ));

    return {
      fontSize,
      gap: Math.round(clampNumber(RECT_TITLE_GAP * scale, 4, 10)),
      height: Math.round(clampNumber(RECT_TITLE_HEIGHT * scale, 14, 24)),
      paddingX: Math.round(clampNumber(RECT_TITLE_PADDING_X * scale, 4, 10)),
      radius: Math.round(clampNumber(RECT_TITLE_RADIUS * scale, 3, 7)),
    };
  }

  function truncateTitleToWidth(title, availableWidth, fontSize) {
    const safeTitle = String(title || "");
    const maxChars = Math.floor(Math.max(0, availableWidth) / Math.max(1, fontSize * 0.62));

    if (safeTitle.length <= maxChars) {
      return safeTitle;
    }

    if (maxChars <= 0) {
      return "";
    }

    if (maxChars <= 3) {
      return safeTitle.slice(0, maxChars);
    }

    return `${safeTitle.slice(0, maxChars - 3)}...`;
  }

  function getRectTitleBounds(layer, rect) {
    const title = getLayerTitle(layer);
    const metrics = getRectTitleMetrics(rect);
    const naturalWidth = Math.ceil(title.length * metrics.fontSize * 0.62 + metrics.paddingX * 2);
    const maxWidth = Math.max(1, Math.floor(rect.width));
    const minWidth = Math.min(maxWidth, Math.max(28, Math.round(46 * (metrics.fontSize / RECT_TITLE_FONT_SIZE))));
    const width = Math.min(maxWidth, Math.max(minWidth, naturalWidth));

    return {
      displayTitle: truncateTitleToWidth(title, width - metrics.paddingX * 2, metrics.fontSize),
      fontSize: metrics.fontSize,
      gap: metrics.gap,
      height: metrics.height,
      paddingX: metrics.paddingX,
      radius: metrics.radius,
      width,
      x: rect.x,
      y: rect.y - metrics.gap - metrics.height,
    };
  }

  function isPointInRect(point, rect, padding = 0) {
    if (!point || !rect) {
      return false;
    }

    return (
      point.x >= rect.x - padding &&
      point.x <= rect.x + rect.width + padding &&
      point.y >= rect.y - padding &&
      point.y <= rect.y + rect.height + padding
    );
  }

  function getResizeHandleCenter(rect, handle) {
    const normalizedRect = normalizeRect(rect);
    const isWest = handle.includes("w");
    const isEast = handle.includes("e");
    const isNorth = handle.includes("n");
    const isSouth = handle.includes("s");

    return {
      x: isWest ? normalizedRect.x : (isEast ? normalizedRect.x + normalizedRect.width : normalizedRect.x + normalizedRect.width / 2),
      y: isNorth ? normalizedRect.y : (isSouth ? normalizedRect.y + normalizedRect.height : normalizedRect.y + normalizedRect.height / 2),
    };
  }

  function getResizeHandleBounds(rect, handle, size) {
    const center = getResizeHandleCenter(rect, handle);
    const length = Math.max(1, toFiniteNumber(size, 1));

    return {
      height: length,
      width: length,
      x: center.x - length / 2,
      y: center.y - length / 2,
    };
  }

  function getResizeHandleAtPoint(point, rect, hitSize) {
    return RECT_RESIZE_HANDLES.find((handle) => isPointInRect(
      point,
      getResizeHandleBounds(rect, handle, hitSize),
    )) || "";
  }

  function resizeRectFromHandle(startRect, handle, startPoint, currentPoint) {
    const rect = normalizeRect(startRect);
    const dx = toFiniteNumber(currentPoint?.x, startPoint?.x || 0) - toFiniteNumber(startPoint?.x, 0);
    const dy = toFiniteNumber(currentPoint?.y, startPoint?.y || 0) - toFiniteNumber(startPoint?.y, 0);
    let left = rect.x;
    let right = rect.x + rect.width;
    let top = rect.y;
    let bottom = rect.y + rect.height;

    if (handle.includes("w")) {
      left += dx;
    }

    if (handle.includes("e")) {
      right += dx;
    }

    if (handle.includes("n")) {
      top += dy;
    }

    if (handle.includes("s")) {
      bottom += dy;
    }

    if (right - left < MIN_RECT_SIZE) {
      if (handle.includes("w")) {
        left = right - MIN_RECT_SIZE;
      } else {
        right = left + MIN_RECT_SIZE;
      }
    }

    if (bottom - top < MIN_RECT_SIZE) {
      if (handle.includes("n")) {
        top = bottom - MIN_RECT_SIZE;
      } else {
        bottom = top + MIN_RECT_SIZE;
      }
    }

    return normalizeRect({
      height: bottom - top,
      width: right - left,
      x: left,
      y: top,
    });
  }

  function getRectDragDistanceCss(startEvent, event) {
    const startClientX = startEvent?.clientX ?? startEvent?.startClientX;
    const startClientY = startEvent?.clientY ?? startEvent?.startClientY;
    const dx = toFiniteNumber(event?.clientX, 0) - toFiniteNumber(startClientX, 0);
    const dy = toFiniteNumber(event?.clientY, 0) - toFiniteNumber(startClientY, 0);

    return Math.hypot(dx, dy);
  }

  function getLayerModel() {
    const layerModel = namespace.documentLayerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (layerModel) {
      namespace.documentLayerModel = layerModel;
    }

    return layerModel;
  }

  function insertEntryAboveBackground(entries, layer) {
    if (!Array.isArray(entries) || !layer) {
      return false;
    }

    const backgroundIndex = entries.findIndex((entry) => entry?.type === "background");
    const insertIndex = backgroundIndex >= 0 ? backgroundIndex : entries.length;

    entries.splice(insertIndex, 0, layer);
    return true;
  }

  function isCanvasObjectEntry(entry) {
    return Boolean(
      entry?.canvasObject === true ||
      entry?.type === VECTOR_RECT_LAYER_TYPE ||
      entry?.type === VECTOR_TEXT_LAYER_TYPE
    );
  }

  function insertRectCanvasObjectAtBottom(entries, layer) {
    if (!Array.isArray(entries) || !layer) {
      return false;
    }

    const firstNonCanvasObjectIndex = entries.findIndex((entry) => !isCanvasObjectEntry(entry));

    entries.splice(firstNonCanvasObjectIndex >= 0 ? firstNonCanvasObjectIndex : entries.length, 0, layer);
    return true;
  }

  function isVectorRectToolState(detail = {}) {
    const label = String(detail.label || "").trim().toLowerCase();
    const toolMode = String(detail.toolMode || "").trim().toLowerCase();

    return toolMode === VECTOR_RECT_TOOL_MODE || label === "square";
  }

  function getInitialToolState() {
    const activeTool = document.querySelector("[data-tool].active");

    return {
      label: activeTool?.getAttribute("aria-label") || "",
      toolMode: activeTool?.dataset?.toolMode || "",
    };
  }

  const STAGE_INTERACTIVE_SELECTOR = [
    "button",
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[data-artboard-action-bubble]",
    "[data-artboard-connection-menu]",
    "[data-artboard-symmetry-button]",
    "[data-ai-image-board]",
    "[data-ai-image-board-action-toolbar]",
    "[data-ai-image-board-mobile-action-toolbar]",
    "[data-ai-image-enlarge-viewer]",
    "[data-ai-image-edit-preview-viewer]",
    "[data-space-board]",
    "[data-space-text-board]",
    "[data-text-prompt-toolbar]",
    "[data-text-prompt-focus-overlay]",
    "[data-mockup-slot]",
    "[data-mockup-slot-popover]",
    "[data-vector-rect-action-toolbar]",
    "[data-vector-text-layer]",
    ".editor-vector-envelope-handle-group",
    ".editor-vector-envelope-handle",
  ].join(",");

  function isStageInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(STAGE_INTERACTIVE_SELECTOR));
  }

  function cssEscape(value) {
    return window.CSS?.escape
      ? window.CSS.escape(String(value || ""))
      : String(value || "").replace(/["\\]/g, "\\$&");
  }

  function isVectorTextLayerEntry(entry) {
    return entry?.type === VECTOR_TEXT_LAYER_TYPE || entry?.type === "text" || entry?.kind === "text";
  }

  function isPointerInsideClientRect(event, rect, padding = 0) {
    if (
      !rect ||
      !Number.isFinite(event?.clientX) ||
      !Number.isFinite(event?.clientY) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return false;
    }

    const hitPadding = Math.max(0, Number(padding) || 0);

    return (
      event.clientX >= rect.left - hitPadding &&
      event.clientY >= rect.top - hitPadding &&
      event.clientX <= rect.right + hitPadding &&
      event.clientY <= rect.bottom + hitPadding
    );
  }

  function isPointerOverVectorTextLayer(event, layer, point = null) {
    const layerId = String(layer?.id || "").trim();

    if (!layerId || layer?.visible === false) {
      return false;
    }

    const node = document.querySelector?.(`.editor-vector-text-layer[data-layer-id="${cssEscape(layerId)}"]`);
    const rect = node?.getBoundingClientRect?.();

    return (
      isPointerInsideClientRect(event, rect, 4) ||
      isPointInVectorTextApproxBounds(point, layer, cssPixelsToDocumentUnits(12))
    );
  }

  function isPointerOverStageInteractiveTarget(event, overlay) {
    if (isStageInteractiveTarget(event.target)) {
      return true;
    }

    if (typeof document.elementsFromPoint !== "function") {
      return false;
    }

    return document.elementsFromPoint(event.clientX, event.clientY)
      .some((element) => (
        element instanceof Element &&
        !overlay?.contains(element) &&
        isStageInteractiveTarget(element)
      ));
  }

  function isPointerOverDrawingArtboardLabel(event, stage) {
    const layer = stage?.querySelector?.("[data-artboard-preview-layer]");

    if (!layer) {
      return false;
    }

    return Array.from(layer.querySelectorAll("[data-artboard-id] .editor-artboard-frame-label"))
      .some((label) => {
        const rect = label.getBoundingClientRect?.();

        return Boolean(
          rect &&
          event.clientX >= rect.left &&
          event.clientY >= rect.top &&
          event.clientX <= rect.right &&
          event.clientY <= rect.bottom
        );
      });
  }

  function isPointInsideDrawingArtboard(point) {
    return Boolean(namespace.getDocumentArtboardAtPoint?.({
      docX: point?.x,
      docY: point?.y,
    }));
  }

  class VectorRectTool {
    constructor(options = {}) {
      this.stage = options.stage;
      this.layerModel = options.layerModel;
      this.svg = null;
      this.toolbar = null;
      this.viewportGroup = null;
      this.contentGroup = null;
      this.draftGroup = null;
      this.dragState = null;
      this.isActive = false;
      this.canSelectExistingRects = false;
      this.frameRequest = 0;
      this.movePreview = null;
      this.resizePreview = null;
      this.selectedLayerId = "";

      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerEnd = this.handlePointerEnd.bind(this);
      this.handleToolbarClick = this.handleToolbarClick.bind(this);
      this.handleToolbarPointerDown = this.handleToolbarPointerDown.bind(this);
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
      this.handleMobileObjectMoveChange = this.handleMobileObjectMoveChange.bind(this);

      this.mount();
      this.bindEvents();
      this.registerMobileMovePointerTarget();
      this.handleToolChange({ detail: getInitialToolState() });
      this.render();
    }

    mount() {
      if (!this.stage) {
        throw new Error("VectorRectTool richiede .editor-stage.");
      }

      this.svg = createSvgElement("svg", {
        "aria-label": "Rettangoli vettoriali",
        class: "editor-vector-rect-overlay",
        focusable: "false",
      });
      const hitArea = createSvgElement("rect", {
        class: "editor-vector-rect-hit-area",
        fill: "transparent",
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });

      this.viewportGroup = createSvgElement("g", { class: "editor-vector-rect-viewport" });
      this.contentGroup = createSvgElement("g", { class: "editor-vector-rect-content" });
      this.draftGroup = createSvgElement("g", { class: "editor-vector-rect-draft" });
      this.viewportGroup.append(this.contentGroup, this.draftGroup);
      this.svg.append(hitArea, this.viewportGroup);
      this.toolbar = document.createElement("div");
      this.toolbar.className = "editor-vector-rect-action-toolbar editor-ai-image-board-action-toolbar";
      this.toolbar.dataset.vectorRectActionToolbar = "";
      this.toolbar.setAttribute("aria-hidden", "true");
      this.toolbar.innerHTML = getVectorRectActionToolbarMarkup();
      this.toolbar.addEventListener("pointerdown", this.handleToolbarPointerDown, true);
      this.toolbar.addEventListener("click", this.handleToolbarClick);

      const vectorTextOverlay = this.stage.querySelector(".editor-vector-overlay");

      if (vectorTextOverlay?.parentElement === this.stage) {
        this.stage.insertBefore(this.svg, vectorTextOverlay);
      } else {
        this.stage.append(this.svg);
      }

      (document.body || this.stage).appendChild(this.toolbar);
      this.updateViewportSize();
      this.updateCameraTransform();
    }

    bindEvents() {
      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:mobile-object-move-change", this.handleMobileObjectMoveChange);
      window.addEventListener("resize", this.handleResize);
      this.layerModel?.addEventListener?.("change", this.handleDocumentChange);
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      this.stage.addEventListener("pointerdown", this.handlePointerDown, true);
    }

    registerMobileMovePointerTarget() {
      const previousPredicate = namespace.isMobileObjectMovePointerTarget;

      namespace.isMobileObjectMovePointerTarget = (event) => (
        Boolean(previousPredicate?.(event)) ||
        this.isMobileMovePointerTarget(event)
      );
    }

    handleMobileObjectMoveChange() {
      this.updateToolbar();
    }

    clearSelection(source = "vector-rect-clear-selection") {
      const selectedLayerId = String(this.selectedLayerId || "").trim();

      if (selectedLayerId) {
        this.setSelectedLayerMoveArmed(false, selectedLayerId, source);
      } else {
        namespace.clearMobileObjectMoveArmed?.({ type: VECTOR_RECT_MOVE_TYPE }, { source });
      }

      if (!selectedLayerId && !this.toolbar) {
        return false;
      }

      this.selectedLayerId = "";
      this.render();
      return Boolean(selectedLayerId);
    }

    handleToolChange(event) {
      const detail = event.detail || {};

      this.isActive = isVectorRectToolState(detail);
      this.canSelectExistingRects = this.isActive;
      this.svg?.classList.toggle("vector-rect-tool-active", this.isActive);
      this.stage?.classList.toggle("vector-rect-tool-active", this.isActive);

      if (!this.isActive && this.selectedLayerId) {
        this.clearSelection("vector-rect-tool-change-clear-selection");
        return;
      }

      this.updateToolbar();
    }

    handleCameraChange() {
      this.updateCameraTransform();
      this.scheduleRender();
    }

    handleDocumentChange() {
      this.scheduleRender();
    }

    handleResize() {
      this.updateViewportSize();
      this.updateCameraTransform();
      this.updateToolbar();
    }

    handleDocumentPointerDown(event) {
      if (!this.selectedLayerId || this.dragState || event.button !== 0) {
        return;
      }

      const target = event.target;

      if (target?.closest?.("[data-vector-rect-action-toolbar]")) {
        return;
      }

      if (!target?.closest?.(".editor-stage")) {
        return;
      }

      if (isPointerOverDrawingArtboardLabel(event, this.stage)) {
        return;
      }

      const point = this.getEventDocumentPoint(event);
      const hitLayer = isPointInsideDrawingArtboard(point)
        ? null
        : this.getHitLayerAtPoint(point, event);

      if (hitLayer?.id === this.selectedLayerId) {
        return;
      }

      this.clearSelection("vector-rect-document-pointer-clear-selection");
    }

    handleToolbarPointerDown(event) {
      const swatch = event.target?.closest?.("[data-vector-rect-fill-swatch]");
      const moveButton = event.target?.closest?.("[data-vector-rect-move]");

      if (moveButton && this.toolbar?.contains(moveButton)) {
        this.toggleSelectedLayerMove();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }

      if (swatch && this.toolbar?.contains(swatch)) {
        debugVectorRectFill("swatch-pointerdown", {
          fill: swatch.dataset.vectorRectFill,
          layerId: this.selectedLayerId,
        });
        this.setSelectedLayerFill(swatch.dataset.vectorRectFill);
        event.preventDefault();
      }

      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    handleToolbarClick(event) {
      const swatch = event.target?.closest?.("[data-vector-rect-fill-swatch]");
      const moveButton = event.target?.closest?.("[data-vector-rect-move]");

      if (moveButton && this.toolbar?.contains(moveButton)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!swatch || !this.toolbar?.contains(swatch)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.setSelectedLayerFill(swatch.dataset.vectorRectFill);
    }

    isSelectedLayerMoveArmed(layerId = this.selectedLayerId) {
      return Boolean(namespace.isMobileObjectMoveArmed?.({
        id: layerId,
        type: VECTOR_RECT_MOVE_TYPE,
      }));
    }

    setSelectedLayerMoveArmed(active, layerId = this.selectedLayerId, source = "vector-rect-move-toolbar") {
      const normalizedLayerId = String(layerId || "").trim();

      if (!normalizedLayerId) {
        namespace.clearMobileObjectMoveArmed?.({ type: VECTOR_RECT_MOVE_TYPE }, { source });
        this.updateToolbar();
        return false;
      }

      if (active) {
        namespace.setMobileObjectMoveArmed?.({
          id: normalizedLayerId,
          type: VECTOR_RECT_MOVE_TYPE,
        }, { source });
      } else {
        namespace.clearMobileObjectMoveArmed?.({
          id: normalizedLayerId,
          type: VECTOR_RECT_MOVE_TYPE,
        }, { source });
      }

      this.updateToolbar();
      return true;
    }

    toggleSelectedLayerMove() {
      const normalizedLayerId = String(this.selectedLayerId || "").trim();

      if (!normalizedLayerId) {
        return false;
      }

      namespace.toggleMobileObjectMoveArmed?.({
        id: normalizedLayerId,
        type: VECTOR_RECT_MOVE_TYPE,
      }, { source: "vector-rect-move-toolbar" });
      this.updateToolbar();
      return true;
    }

    isMobileMovePointerTarget(event) {
      if (!this.isSelectedLayerMoveArmed()) {
        return false;
      }

      const point = this.getEventDocumentPoint(event);
      const hitLayer = this.getHitLayerAtPoint(point, event);

      return Boolean(hitLayer && hitLayer.id === this.selectedLayerId);
    }

    updateViewportSize() {
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    updateCameraTransform() {
      const brushEngine = namespace.brushEngine;
      const camera = brushEngine?.camera || { x: 0, y: 0, zoom: 1 };
      const dpr = Math.max(1, Number(brushEngine?.dpr || window.devicePixelRatio || 1));
      const zoom = Math.max(0.0001, (Number(camera.zoom) || 1) / dpr);
      const x = (Number(camera.x) || 0) / dpr;
      const y = (Number(camera.y) || 0) / dpr;

      this.viewportGroup?.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
      this.updateToolbar();
    }

    getEventDocumentPoint(event) {
      const brushEngine = namespace.brushEngine;

      if (brushEngine?.screenToDocumentSpace) {
        const point = brushEngine.screenToDocumentSpace(event.clientX, event.clientY);

        return {
          x: toFiniteNumber(point.docX, 0),
          y: toFiniteNumber(point.docY, 0),
        };
      }

      const stageRect = this.stage.getBoundingClientRect();
      const camera = brushEngine?.camera || { x: 0, y: 0, zoom: 1 };
      const dpr = Math.max(1, Number(brushEngine?.dpr || window.devicePixelRatio || 1));
      const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
      const viewportX = (event.clientX - stageRect.left) * dpr;
      const viewportY = (event.clientY - stageRect.top) * dpr;

      return {
        x: (viewportX - (Number(camera.x) || 0)) / zoom,
        y: (viewportY - (Number(camera.y) || 0)) / zoom,
      };
    }

    handlePointerDown(event) {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        namespace.brushEngine?.isDrawing === true
      ) {
        return;
      }

      if (isPointerOverStageInteractiveTarget(event, this.svg)) {
        return;
      }

      if (isPointerOverDrawingArtboardLabel(event, this.stage)) {
        return;
      }

      const point = this.getEventDocumentPoint(event);

      if (isPointInsideDrawingArtboard(point)) {
        if (this.canSelectExistingRects && this.selectedLayerId) {
          this.clearSelection("vector-rect-artboard-pointer-clear-selection");
        }
        return;
      }

      const resizeHit = this.canSelectExistingRects ? this.getResizeHandleAtPoint(point, event) : null;

      if (resizeHit) {
        this.beginResizeDrag(resizeHit.layer, resizeHit.handle, event, point);
        return;
      }

      const hitLayer = this.canSelectExistingRects ? this.getHitLayerAtPoint(point, event) : null;

      if (hitLayer) {
        const canMoveHitLayer = this.isSelectedLayerMoveArmed(hitLayer.id);

        if (!canMoveHitLayer) {
          if (this.selectedLayerId !== hitLayer.id) {
            this.setSelectedLayerMoveArmed(false, this.selectedLayerId, "vector-rect-select-clear-move");
          }

          this.selectedLayerId = hitLayer.id;
          this.render();
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        this.beginMoveDrag(hitLayer, event, point);
        return;
      }

      if (this.canSelectExistingRects && this.selectedLayerId) {
        this.clearSelection("vector-rect-clear-selection");
      }

      if (!this.isActive) {
        return;
      }

      this.dragState = {
        mode: "create",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: point,
      };

      try {
        this.stage.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // Capture is a convenience; document listeners keep the drag alive.
      }

      document.addEventListener("pointermove", this.handlePointerMove, true);
      document.addEventListener("pointerup", this.handlePointerEnd, true);
      document.addEventListener("pointercancel", this.handlePointerEnd, true);
      this.renderDraft(getRectFromPoints(point, point, event));
      event.preventDefault();
      event.stopPropagation();
    }

    getRenderableVectorRectLayers() {
      return (this.layerModel?.getRenderableLayers?.() || [])
        .filter((layer) => layer?.type === VECTOR_RECT_LAYER_TYPE && layer.visible !== false);
    }

    isPointerBlockedByPriorityLayer(event, point) {
      const layers = this.layerModel?.getRenderableLayers?.() || [];

      return layers.some((layer) => isVectorTextLayerEntry(layer) && isPointerOverVectorTextLayer(event, layer, point));
    }

    getHitLayerAtPoint(point, event = null) {
      if (this.isPointerBlockedByPriorityLayer(event, point)) {
        return null;
      }

      const layers = this.layerModel?.getRenderableLayers?.() || [];
      const padding = Math.max(2, cssPixelsToDocumentUnits(6));

      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];

        if (layer?.type !== VECTOR_RECT_LAYER_TYPE || layer.visible === false) {
          continue;
        }

        const rect = getLayerRect(layer);

        if (!rect) {
          continue;
        }

        if (isPointInRect(point, rect, padding) || isPointInRect(point, getRectTitleBounds(layer, rect), padding)) {
          return layer;
        }
      }

      return null;
    }

    getResizeHandleAtPoint(point, event = null) {
      const normalizedLayerId = String(this.selectedLayerId || "").trim();

      if (!normalizedLayerId) {
        return null;
      }

      if (this.isPointerBlockedByPriorityLayer(event, point)) {
        return null;
      }

      const layer = this.getRenderableVectorRectLayers()
        .find((candidate) => candidate?.id === normalizedLayerId);
      const rect = getLayerRect(layer);
      const handle = rect
        ? getResizeHandleAtPoint(point, rect, cssPixelsToDocumentUnits(RECT_RESIZE_HANDLE_HIT_SIZE_CSS_PX))
        : "";

      return handle ? { handle, layer } : null;
    }

    beginMoveDrag(layer, event, point) {
      const rect = getLayerRect(layer);

      if (!rect) {
        return;
      }

      this.selectedLayerId = layer.id;
      this.movePreview = null;
      this.dragState = {
        layerId: layer.id,
        mode: "move",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: point,
        startRect: rect,
      };

      try {
        this.stage.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // Capture is a convenience; document listeners keep the drag alive.
      }

      document.addEventListener("pointermove", this.handlePointerMove, true);
      document.addEventListener("pointerup", this.handlePointerEnd, true);
      document.addEventListener("pointercancel", this.handlePointerEnd, true);
      this.render();
      event.preventDefault();
      event.stopPropagation();
    }

    beginResizeDrag(layer, handle, event, point) {
      const rect = getLayerRect(layer);

      if (!rect || !handle) {
        return;
      }

      this.selectedLayerId = layer.id;
      this.movePreview = null;
      this.resizePreview = null;
      this.dragState = {
        handle,
        layerId: layer.id,
        mode: "resize",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: point,
        startRect: rect,
      };

      try {
        this.stage.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // Capture is a convenience; document listeners keep the drag alive.
      }

      document.addEventListener("pointermove", this.handlePointerMove, true);
      document.addEventListener("pointerup", this.handlePointerEnd, true);
      document.addEventListener("pointercancel", this.handlePointerEnd, true);
      this.render();
      event.preventDefault();
      event.stopPropagation();
    }

    handlePointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const point = this.getEventDocumentPoint(event);

      if (this.dragState.mode === "move") {
        this.resizePreview = null;
        this.movePreview = {
          dx: point.x - this.dragState.startPoint.x,
          dy: point.y - this.dragState.startPoint.y,
          layerId: this.dragState.layerId,
        };
        this.scheduleRender();
      } else if (this.dragState.mode === "resize") {
        this.movePreview = null;
        this.resizePreview = {
          layerId: this.dragState.layerId,
          rect: resizeRectFromHandle(
            this.dragState.startRect,
            this.dragState.handle,
            this.dragState.startPoint,
            point,
          ),
        };
        this.scheduleRender();
      } else {
        const rect = getRectFromPoints(this.dragState.startPoint, point, event);

        this.renderDraft(rect);
      }

      event.preventDefault();
      event.stopPropagation();
    }

    handlePointerEnd(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const state = this.dragState;
      const point = this.getEventDocumentPoint(event);
      const dragDistance = getRectDragDistanceCss(state, event);
      const delta = {
        dx: point.x - state.startPoint.x,
        dy: point.y - state.startPoint.y,
      };

      this.dragState = null;
      document.removeEventListener("pointermove", this.handlePointerMove, true);
      document.removeEventListener("pointerup", this.handlePointerEnd, true);
      document.removeEventListener("pointercancel", this.handlePointerEnd, true);
      this.clearDraft();

      try {
        this.stage.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // The browser may release capture before pointerup.
      }

      if (state.mode === "move") {
        this.movePreview = null;

        if (event.type !== "pointercancel" && dragDistance >= MIN_RECT_DRAG_CSS_PX) {
          this.moveLayerByDelta(state.layerId, state.startRect, delta);
        } else {
          this.render();
        }
      } else if (state.mode === "resize") {
        this.resizePreview = null;

        if (event.type !== "pointercancel" && dragDistance >= MIN_RECT_DRAG_CSS_PX) {
          this.resizeLayerToRect(
            state.layerId,
            roundRect(resizeRectFromHandle(state.startRect, state.handle, state.startPoint, point)),
          );
        } else {
          this.render();
        }
      } else if (event.type !== "pointercancel" && dragDistance >= MIN_RECT_DRAG_CSS_PX) {
        const rect = roundRect(getRectFromPoints(state.startPoint, point, event));

        this.createLayerFromRect(rect, {
          source: "vector-rect-drag",
        });
      }

      event.preventDefault();
      event.stopPropagation();
    }

    moveLayerByDelta(layerId, startRect, delta) {
      const layerModel = getLayerModel();
      const normalizedLayerId = String(layerId || "").trim();

      if (!normalizedLayerId || !startRect || !layerModel?.updateLayer) {
        return false;
      }

      this.layerModel = layerModel;

      return layerModel.updateLayer(normalizedLayerId, {
        x: Math.round(startRect.x + toFiniteNumber(delta.dx, 0)),
        y: Math.round(startRect.y + toFiniteNumber(delta.dy, 0)),
      }, {
        historyGroup: `vector-rect-move-${normalizedLayerId}`,
        source: "vector-rect-move",
      });
    }

    resizeLayerToRect(layerId, rect) {
      const layerModel = getLayerModel();
      const normalizedLayerId = String(layerId || "").trim();
      const normalizedRect = roundRect(rect);

      if (!normalizedLayerId || !layerModel?.updateLayer) {
        debugVectorRectFill("missing-selected-layer", {
          fill: swatch.fill,
          layerId: normalizedLayerId,
        });
        return false;
      }

      this.layerModel = layerModel;

      return layerModel.updateLayer(normalizedLayerId, {
        height: normalizedRect.height,
        width: normalizedRect.width,
        x: normalizedRect.x,
        y: normalizedRect.y,
      }, {
        historyGroup: `vector-rect-resize-${normalizedLayerId}`,
        source: "vector-rect-resize",
      });
    }

    setSelectedLayerFill(fill) {
      const layerModel = getLayerModel();
      const normalizedLayerId = String(this.selectedLayerId || "").trim();
      const swatch = getFillSwatch(fill);

      if (!normalizedLayerId || !layerModel?.updateLayer) {
        return false;
      }

      this.layerModel = layerModel;

      const currentLayer = layerModel.findEntryById?.(normalizedLayerId) || this.getSelectedLayer();

      if (normalizeFillColor(currentLayer?.fill) === swatch.fill.toLowerCase()) {
        debugVectorRectFill("skip-same-fill", {
          fill: swatch.fill,
          layerId: normalizedLayerId,
        });
        this.render();
        return false;
      }

      const didUpdate = layerModel.updateLayer(normalizedLayerId, {
        fill: swatch.fill,
      }, {
        historyGroup: `vector-rect-fill-${normalizedLayerId}`,
        source: "vector-rect-fill",
      });

      debugVectorRectFill("apply-fill", {
        didUpdate,
        fill: swatch.fill,
        layerId: normalizedLayerId,
      });

      if (didUpdate) {
        this.render();
      }

      return didUpdate;
    }

    createLayerFromRect(rect, options = {}) {
      const layerModel = getLayerModel();
      const normalizedRect = roundRect(rect);

      if (!layerModel?.createLayer || !layerModel?.setEntries) {
        return null;
      }

      this.layerModel = layerModel;

      namespace.ensureDocumentLayerArtboardGroups?.({
        history: false,
        source: "vector-rect-artboard-groups",
      });

      const layer = layerModel.createLayer({
        ...normalizedRect,
        canvasObject: true,
        fill: options.fill || DEFAULT_RECT_FILL,
        kind: "rect",
        locked: true,
        name: options.name || "Rectangle",
        rx: Number.isFinite(options.rx) ? Math.max(0, options.rx) : DEFAULT_RECT_RADIUS,
        ry: Number.isFinite(options.ry) ? Math.max(0, options.ry) : DEFAULT_RECT_RADIUS,
        selectable: false,
        stroke: options.stroke || DEFAULT_RECT_STROKE,
        strokeWidth: Number.isFinite(options.strokeWidth)
          ? Math.max(0, options.strokeWidth)
          : DEFAULT_RECT_STROKE_WIDTH,
        type: VECTOR_RECT_LAYER_TYPE,
        vectorEffect: "non-scaling-stroke",
      });
      const entries = layerModel.getEntries();
      const didInsert = insertRectCanvasObjectAtBottom(entries, layer);
      const nextEntries = didInsert || insertEntryAboveBackground(entries, layer) ? entries : [layer, ...entries];
      const historyGroup = `vector-rect-create-${layer.id}`;

      layerModel.setEntries(nextEntries, {
        historyGroup,
        source: options.source || "vector-rect-create",
      });

      return layer;
    }

    scheduleRender() {
      if (this.frameRequest) {
        return;
      }

      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0;
        this.render();
      });
    }

    render() {
      if (!this.contentGroup) {
        return;
      }

      const layers = this.getRenderableVectorRectLayers();

      if (this.selectedLayerId && !layers.some((layer) => layer.id === this.selectedLayerId)) {
        this.clearSelection("vector-rect-selected-layer-removed");
      }

      this.contentGroup.replaceChildren(...layers.map((layer) => this.createRectLayerNode(layer)));
      this.updateToolbar(layers);
    }

    getSelectedLayer(layers = this.getRenderableVectorRectLayers()) {
      const normalizedLayerId = String(this.selectedLayerId || "").trim();

      if (!normalizedLayerId) {
        return null;
      }

      return layers.find((candidate) => candidate?.id === normalizedLayerId) || null;
    }

    getLayerDisplayRect(layer) {
      const rect = this.resizePreview?.layerId === layer?.id
        ? normalizeRect(this.resizePreview.rect)
        : getLayerRect(layer);

      if (!rect) {
        return null;
      }

      if (this.movePreview?.layerId === layer?.id) {
        return {
          ...rect,
          x: rect.x + toFiniteNumber(this.movePreview.dx, 0),
          y: rect.y + toFiniteNumber(this.movePreview.dy, 0),
        };
      }

      return rect;
    }

    getSelectedLayerDisplayRect(layers = this.getRenderableVectorRectLayers()) {
      const layer = this.getSelectedLayer(layers);

      return this.getLayerDisplayRect(layer);
    }

    getDocumentRectViewportRect(rect) {
      if (!rect) {
        return null;
      }

      const scale = getViewportDocumentScale();
      const offset = getCameraViewportOffset();

      return {
        height: rect.height * scale,
        width: rect.width * scale,
        x: rect.x * scale + offset.x,
        y: rect.y * scale + offset.y,
      };
    }

    updateToolbar(layers) {
      if (!this.toolbar || !this.stage) {
        return;
      }

      const layer = this.canSelectExistingRects ? this.getSelectedLayer(layers) : null;
      const rect = layer ? this.getLayerDisplayRect(layer) : null;
      const viewportRect = this.getDocumentRectViewportRect(rect);

      if (!viewportRect) {
        this.toolbar.classList.remove("is-active");
        this.toolbar.setAttribute("aria-hidden", "true");
        this.toolbar.style.opacity = "0";
        this.toolbar.style.pointerEvents = "none";
        return;
      }

      const activeFill = getFillSwatch(layer.fill || DEFAULT_RECT_FILL).fill.toLowerCase();

      this.toolbar.querySelectorAll("[data-vector-rect-fill-swatch]").forEach((swatch) => {
        const isActive = normalizeFillColor(swatch.dataset.vectorRectFill) === activeFill;

        swatch.classList.toggle("is-active", isActive);
        swatch.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

      const moveButton = this.toolbar.querySelector("[data-vector-rect-move]");
      const isMoveArmed = this.isSelectedLayerMoveArmed(layer.id);

      if (moveButton) {
        moveButton.classList.toggle("is-active", isMoveArmed);
        moveButton.setAttribute("aria-pressed", isMoveArmed ? "true" : "false");
      }

      const stageRect = this.stage.getBoundingClientRect();
      const centerX = viewportRect.x + viewportRect.width / 2;
      const top = viewportRect.y - RECT_ACTION_TOOLBAR_GAP_CSS_PX - RECT_ACTION_TOOLBAR_HEIGHT_CSS_PX;
      const belowTop = viewportRect.y + viewportRect.height + RECT_ACTION_TOOLBAR_GAP_CSS_PX;

      if (isMobileMoveViewport()) {
        this.toolbar.style.left = "50%";
        this.toolbar.style.top = "auto";
        this.toolbar.style.bottom = "calc(var(--cbo-mobile-floating-bottom) + 28px)";
        this.toolbar.classList.add("is-active");
        this.toolbar.style.opacity = "1";
        this.toolbar.style.pointerEvents = "auto";
        this.toolbar.setAttribute("aria-hidden", "false");
        return;
      }

      const safeTop = top >= 8
        ? top
        : Math.min(
            Math.max(8, stageRect.height - RECT_ACTION_TOOLBAR_HEIGHT_CSS_PX - 8),
            belowTop,
          );
      const safeLeft = clampNumber(
        stageRect.left + centerX,
        stageRect.left + 24,
        Math.max(stageRect.left + 24, stageRect.right - 24),
      );
      const scrollX = Number(window.scrollX || window.pageXOffset || 0);
      const scrollY = Number(window.scrollY || window.pageYOffset || 0);

      this.toolbar.style.left = `${Math.round(safeLeft + scrollX)}px`;
      this.toolbar.style.top = `${Math.round(stageRect.top + safeTop + scrollY)}px`;
      this.toolbar.style.bottom = "";
      this.toolbar.classList.add("is-active");
      this.toolbar.style.opacity = "1";
      this.toolbar.style.pointerEvents = "auto";
      this.toolbar.setAttribute("aria-hidden", "false");
    }

    createRectLayerNode(layer) {
      const baseRect = getLayerRect(layer);
      const rect = this.resizePreview?.layerId === layer.id
        ? normalizeRect(this.resizePreview.rect)
        : baseRect;
      const group = createSvgElement("g", {
        class: `editor-vector-rect-layer${layer.id === this.selectedLayerId ? " is-selected" : ""}`,
        "data-layer-id": layer.id,
        opacity: toFiniteNumber(layer.opacity, 1),
        transform: this.movePreview?.layerId === layer.id
          ? `translate(${toFiniteNumber(this.movePreview.dx, 0)} ${toFiniteNumber(this.movePreview.dy, 0)})`
          : null,
      });

      if (!rect) {
        return group;
      }

      group.append(this.createRectShapeNode(layer, rect, layer.id === this.selectedLayerId));
      group.append(this.createRectTitleNode(layer, rect, layer.id === this.selectedLayerId));
      if (layer.id === this.selectedLayerId) {
        group.append(this.createRectResizeHandlesNode(layer, rect));
      }
      return group;
    }

    createRectShapeNode(layer, rect, isSelected = false) {
      const fill = layer.fill || DEFAULT_RECT_FILL;

      return createSvgElement("rect", {
        class: "editor-vector-rect-shape",
        fill,
        height: rect.height,
        rx: Math.max(0, toFiniteNumber(layer.rx, 0)),
        ry: Math.max(0, toFiniteNumber(layer.ry, 0)),
        stroke: isSelected ? SELECTED_RECT_STROKE : (layer.stroke || DEFAULT_RECT_STROKE),
        "stroke-width": Math.max(0, toFiniteNumber(layer.strokeWidth, DEFAULT_RECT_STROKE_WIDTH)),
        style: `fill: ${fill};`,
        "vector-effect": layer.vectorEffect || "non-scaling-stroke",
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
    }

    createRectTitleNode(layer, rect, isSelected = false) {
      const bounds = getRectTitleBounds(layer, rect);
      const group = createSvgElement("g", {
        class: `editor-vector-rect-title${isSelected ? " is-selected" : ""}`,
      });
      const background = createSvgElement("rect", {
        class: "editor-vector-rect-title-bg",
        fill: isSelected ? SELECTED_RECT_STROKE : "rgba(17, 17, 17, 0.68)",
        height: bounds.height,
        rx: bounds.radius,
        ry: bounds.radius,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      });
      const text = createSvgElement("text", {
        class: "editor-vector-rect-title-text",
        "dominant-baseline": "middle",
        fill: "#ffffff",
        style: `font-size: ${bounds.fontSize}px;`,
        x: bounds.x + bounds.paddingX,
        y: bounds.y + bounds.height / 2,
      });

      text.textContent = bounds.displayTitle;
      group.append(background, text);
      return group;
    }

    createRectResizeHandlesNode(layer, rect) {
      const group = createSvgElement("g", {
        class: "editor-vector-rect-resize-handles",
        "data-layer-id": layer.id,
      });
      const visibleSize = cssPixelsToDocumentUnits(RECT_RESIZE_HANDLE_SIZE_CSS_PX);
      const hitSize = cssPixelsToDocumentUnits(RECT_RESIZE_HANDLE_HIT_SIZE_CSS_PX);
      const radius = visibleSize * 0.28;

      RECT_RESIZE_HANDLES.forEach((handle) => {
        const handleGroup = createSvgElement("g", {
          class: "editor-vector-rect-resize-handle-group",
          "data-resize-handle": handle,
        });
        const hitBounds = getResizeHandleBounds(rect, handle, hitSize);
        const visibleBounds = getResizeHandleBounds(rect, handle, visibleSize);

        handleGroup.append(
          createSvgElement("rect", {
            class: "editor-vector-rect-resize-hit",
            height: hitBounds.height,
            width: hitBounds.width,
            x: hitBounds.x,
            y: hitBounds.y,
          }),
          createSvgElement("rect", {
            class: "editor-vector-rect-resize-handle",
            height: visibleBounds.height,
            rx: radius,
            ry: radius,
            width: visibleBounds.width,
            x: visibleBounds.x,
            y: visibleBounds.y,
          }),
        );
        group.append(handleGroup);
      });

      return group;
    }

    renderDraft(rect) {
      if (!this.draftGroup) {
        return;
      }

      const normalizedRect = normalizeRect(rect);
      const draftLayer = {
        fill: DEFAULT_RECT_FILL,
        rx: DEFAULT_RECT_RADIUS,
        ry: DEFAULT_RECT_RADIUS,
        stroke: DEFAULT_RECT_STROKE,
        strokeWidth: DEFAULT_RECT_STROKE_WIDTH,
        vectorEffect: "non-scaling-stroke",
      };

      this.draftGroup.replaceChildren(this.createRectShapeNode(draftLayer, normalizedRect));
    }

    clearDraft() {
      this.draftGroup?.replaceChildren();
    }
  }

  namespace.VectorRectTool = VectorRectTool;
  namespace.VECTOR_RECT_LAYER_TYPE = VECTOR_RECT_LAYER_TYPE;
  namespace.VECTOR_RECT_TOOL_MODE = VECTOR_RECT_TOOL_MODE;

  namespace.initVectorRectTool = function initVectorRectTool() {
    const stage = document.querySelector(".editor-stage");

    if (!stage) {
      return null;
    }

    const existingOverlay = stage.querySelector(".editor-vector-rect-overlay");

    if (stage.dataset.vectorRectReady === "true" && existingOverlay && namespace.vectorRectTool) {
      return namespace.vectorRectTool;
    }

    const layerModel = getLayerModel();

    if (!layerModel) {
      return null;
    }

    stage.dataset.vectorRectReady = "true";
    namespace.vectorRectTool = new VectorRectTool({ layerModel, stage });
    return namespace.vectorRectTool;
  };

  namespace.createVectorRectLayer = function createVectorRectLayer(rect = {}, options = {}) {
    if (!namespace.vectorRectTool) {
      namespace.initVectorRectTool?.();
    }

    return namespace.vectorRectTool?.createLayerFromRect?.(rect, options) || null;
  };
})(window.CBO = window.CBO || {});
