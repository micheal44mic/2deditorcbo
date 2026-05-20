window.CBO = window.CBO || {};



(function registerCoreHelpersJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before core-helpers.js.");

  }



  Controller.prototype.getStage = function getStage() {
    with (this) {

    return document.querySelector(".editor-stage");
    }
  };

  Controller.prototype.getRenderer = function getRenderer() {
    with (this) {

    return namespace.documentRenderer || null;
    }
  };

  Controller.prototype.getBrushEngine = function getBrushEngine() {
    with (this) {

    return namespace.brushEngine || null;
    }
  };

  Controller.prototype.roundMetricValue = function roundMetricValue(value, precision = 2) {
    with (this) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const multiplier = 10 ** Math.max(0, Number(precision) || 0);

    return Math.round(number * multiplier) / multiplier;
    }
  };

  Controller.prototype.getBoardLabelReferenceSideDoc = function getBoardLabelReferenceSideDoc(width, height, fallback = this.AI_IMAGE_BOARD_SIZE_DOC_PX) {
    with (this) {

    const resolvedWidth = Math.max(1, Number(width) || fallback);
    const resolvedHeight = Math.max(1, Number(height) || fallback);

    return Math.max(1, Math.max(resolvedWidth, resolvedHeight));
    }
  };

  Controller.prototype.getArtboardLabelMetrics = function getArtboardLabelMetrics(width, height, scale = 1) {
    with (this) {

    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const labelSide = getBoardLabelReferenceSideDoc(width, height);
    const fontSizeDoc = labelSide * ARTBOARD_LABEL_FONT_RATIO;
    const heightDoc = fontSizeDoc * ARTBOARD_LABEL_HEIGHT_RATIO;
    const paddingXDoc = fontSizeDoc * ARTBOARD_LABEL_PADDING_X_RATIO;
    const radiusDoc = fontSizeDoc * ARTBOARD_LABEL_RADIUS_RATIO;
    const topDoc = (heightDoc + fontSizeDoc * ARTBOARD_LABEL_TOP_GAP_RATIO) * -1;

    return {
      fontSize: fontSizeDoc * safeScale,
      height: heightDoc * safeScale,
      paddingX: paddingXDoc * safeScale,
      radius: radiusDoc * safeScale,
      top: topDoc * safeScale,
    };
    }
  };

  Controller.prototype.getAiImagePlainControlMetrics = function getAiImagePlainControlMetrics(scale = 1, width = this.AI_IMAGE_BOARD_SIZE_DOC_PX, height = this.AI_IMAGE_BOARD_SIZE_DOC_PX) {
    with (this) {

    const metrics = getActionBubbleMetrics(scale, width, height);

    return {
      borderWidth: metrics.borderWidth,
      gap: metrics.gap,
      iconSize: metrics.iconSize,
      lod: "visible",
      outsideOffset: metrics.outsideOffset,
      size: metrics.size,
    };
    }
  };

  Controller.prototype.getAiImageSelectionShadowMetrics = function getAiImageSelectionShadowMetrics(scale = 1) {
    with (this) {

    const safeScale = Math.max(0.0001, Number(scale) || 1);

    return {
      blur: AI_IMAGE_BOARD_SELECTION_SHADOW_BLUR_DOC_PX * safeScale,
      rise: AI_IMAGE_BOARD_SELECTION_SHADOW_RISE_DOC_PX * safeScale,
      secondaryBlur: AI_IMAGE_BOARD_SELECTION_SHADOW_SECONDARY_BLUR_DOC_PX * safeScale,
      secondaryY: AI_IMAGE_BOARD_SELECTION_SHADOW_SECONDARY_Y_DOC_PX * safeScale,
      y: AI_IMAGE_BOARD_SELECTION_SHADOW_Y_DOC_PX * safeScale,
    };
    }
  };

  Controller.prototype.cloneCamera = function cloneCamera(camera) {
    with (this) {

    return {
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      zoom: Math.max(0.0001, Number(camera?.zoom) || 1),
    };
    }
  };

  Controller.prototype.getCameraState = function getCameraState() {
    with (this) {

    const brushEngine = getBrushEngine();
    const camera = lastRenderContext.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera: cloneCamera(camera),
      dpr: Math.max(1, Number(lastRenderContext.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
    }
  };

  Controller.prototype.getAllArtboards = function getAllArtboards() {
    with (this) {

    const artboards = namespace.getDocumentArtboards?.();

    if (Array.isArray(artboards) && artboards.length > 0) {
      return artboards;
    }

    return lastRenderContext.artboardViews.map((view) => view.artboard).filter(Boolean);
    }
  };

  Controller.prototype.getArtboardById = function getArtboardById(artboardId) {
    with (this) {

    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
    }
  };

  Controller.prototype.createRect = function createRect(x, y, width, height) {
    with (this) {

    return {
      height: Math.max(1, Number(height) || 1),
      width: Math.max(1, Number(width) || 1),
      x: Number(x) || 0,
      y: Number(y) || 0,
    };
    }
  };

  Controller.prototype.expandRect = function expandRect(rect, amount = 0) {
    with (this) {

    const safeAmount = Math.max(0, Number(amount) || 0);

    return rect
      ? {
          height: rect.height + safeAmount * 2,
          width: rect.width + safeAmount * 2,
          x: rect.x - safeAmount,
          y: rect.y - safeAmount,
        }
      : null;
    }
  };

  Controller.prototype.rectsOverlap = function rectsOverlap(first, second) {
    with (this) {

    return Boolean(
      first &&
      second &&
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y
    );
    }
  };

  Controller.prototype.doesRectOverlapAny = function doesRectOverlapAny(rect, blockers = []) {
    with (this) {

    return blockers.some((blocker) => rectsOverlap(rect, blocker));
    }
  };

  Controller.prototype.offsetRect = function offsetRect(rect, dx = 0, dy = 0) {
    with (this) {

    return rect
      ? createRect(
          rect.x + (Number(dx) || 0),
          rect.y + (Number(dy) || 0),
          rect.width,
          rect.height,
        )
      : null;
    }
  };

  Controller.prototype.getRectOverlapArea = function getRectOverlapArea(first, second) {
    with (this) {

    if (!first || !second) {
      return 0;
    }

    const width = Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
    );
    const height = Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
    );

    return width * height;
    }
  };

  Controller.prototype.getRectOverlapScore = function getRectOverlapScore(rect, blockers = []) {
    with (this) {

    return blockers.reduce((score, blocker) => score + getRectOverlapArea(rect, blocker), 0);
    }
  };

  Controller.prototype.getViewScale = function getViewScale() {
    with (this) {

    const { camera, dpr } = getCameraState();

    return Math.max(0.0001, Number(camera.zoom) || 1) / dpr;
    }
  };

  Controller.prototype.getConnectionStrokeWidth = function getConnectionStrokeWidth(viewScale = this.getViewScale()) {
    with (this) {

    return Math.max(0.5, 3 * (Number(viewScale) || 1));
    }
  };

  Controller.prototype.getPlainConnectionStrokeWidth = function getPlainConnectionStrokeWidth() {
    with (this) {

    return CONNECTION_PLAIN_STROKE_CSS_PX;
    }
  };

  Controller.prototype.getActionBubbleMetrics = function getActionBubbleMetrics(
    scale = this.getViewScale(),
    width = this.AI_IMAGE_BOARD_SIZE_DOC_PX,
    height = this.AI_IMAGE_BOARD_SIZE_DOC_PX,
  ) {
    with (this) {

    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const sizeDoc = ACTION_BUBBLE_SIZE_DOC_PX;
    const gapDoc = ACTION_BUBBLE_GAP_DOC_PX;
    const iconSizeDoc = ACTION_BUBBLE_ICON_DOC_PX;
    const borderWidthDoc = ACTION_BUBBLE_BORDER_DOC_PX;
    const outsideOffsetDoc = gapDoc + sizeDoc * 0.5;

    return {
      borderWidth: borderWidthDoc * safeScale,
      borderWidthDoc,
      gap: gapDoc * safeScale,
      gapDoc,
      iconSize: iconSizeDoc * safeScale,
      iconSizeDoc,
      outsideOffset: outsideOffsetDoc * safeScale,
      outsideOffsetDoc,
      size: sizeDoc * safeScale,
      sizeDoc,
      visualScale: safeScale,
    };
    }
  };

  Controller.prototype.documentPointToStagePoint = function documentPointToStagePoint(point, viewState = this.getCameraState()) {
    with (this) {

    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(camera.x) || 0) + (Number(point?.x) || 0) * zoom) / dpr,
      y: ((Number(camera.y) || 0) + (Number(point?.y) || 0) * zoom) / dpr,
    };
    }
  };

  Controller.prototype.stagePointToDocumentPoint = function stagePointToDocumentPoint(point, viewState = this.getCameraState()) {
    with (this) {

    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(point?.x) || 0) * dpr - (Number(camera.x) || 0)) / zoom,
      y: ((Number(point?.y) || 0) * dpr - (Number(camera.y) || 0)) / zoom,
    };
    }
  };

  Controller.prototype.getEventDocumentPoint = function getEventDocumentPoint(event) {
    with (this) {

    const brushEngine = getBrushEngine();

    if (brushEngine?.screenToDocumentSpace) {
      return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
    }

    const stage = getStage();

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const viewportX = (event.clientX - rect.left) * dpr;
    const viewportY = (event.clientY - rect.top) * dpr;

    return {
      docX: (viewportX - (Number(camera.x) || 0)) / zoom,
      docY: (viewportY - (Number(camera.y) || 0)) / zoom,
    };
    }
  };

})(window.CBO);

