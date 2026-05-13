window.CBO = window.CBO || {};

(function registerArtboardPreview(namespace) {
  const PREVIEW_ARTBOARD_WIDTH = 1048;
  const PREVIEW_ARTBOARD_HEIGHT = 2048;
  const PREVIEW_ARTBOARD_GAP = 256;
  const DEFAULT_PREVIEW_ARTBOARD_COUNT = 2;
  const FIT_PADDING_CSS_PX = 72;
  const LABEL_HIT_HEIGHT_CSS_PX = 30;
  const SELECTION_TOOL_MODE = "selection";

  let lastCameraState = null;
  let isReady = false;
  let currentToolMode = SELECTION_TOOL_MODE;
  let selectedArtboardId = "";
  let artboardDragState = null;

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function getFallbackPrimaryArtboard() {
    const renderer = getRenderer();
    const width = Math.max(1, Math.round(renderer?.width || namespace.documentSettings?.width || 1));
    const height = Math.max(1, Math.round(renderer?.height || namespace.documentSettings?.height || 1));

    return {
      height,
      id: "active-document",
      isPrimary: true,
      name: "Artboard 1",
      type: "active",
      width,
      x: 0,
      y: 0,
    };
  }

  function getAllArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    return Array.isArray(artboards) && artboards.length > 0
      ? artboards
      : [getFallbackPrimaryArtboard()];
  }

  function getArtboardById(artboardId) {
    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
  }

  function cloneArtboard(artboard) {
    return {
      height: artboard.height,
      id: artboard.id,
      isPrimary: artboard.isPrimary === true,
      name: artboard.name,
      type: artboard.type,
      width: artboard.width,
      x: artboard.x,
      y: artboard.y,
    };
  }

  function emitArtboardPreviewChange(source = "artboard-preview") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-preview-change", {
      detail: {
        artboards: getAllArtboards().map(cloneArtboard),
        selectedArtboardId: selectedArtboardId || null,
        source,
      },
    }));
  }

  function emitArtboardSelectionChange(artboard, source = "artboard-preview-selection") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-selection-change", {
      detail: {
        artboard: artboard ? cloneArtboard(artboard) : null,
        artboardId: artboard?.id || null,
        source,
      },
    }));
  }

  function getLastArtboard() {
    const artboards = getAllArtboards();

    return artboards[artboards.length - 1] || getFallbackPrimaryArtboard();
  }

  function createPreviewArtboard() {
    const artboard = namespace.createDocumentArtboard?.({
      height: PREVIEW_ARTBOARD_HEIGHT,
      source: "artboard-preview-create",
      width: PREVIEW_ARTBOARD_WIDTH,
    });

    if (artboard) {
      return artboard;
    }

    const previous = getLastArtboard();

    return {
      height: PREVIEW_ARTBOARD_HEIGHT,
      id: `artboard-${Date.now().toString(36)}`,
      isPrimary: false,
      name: "Artboard",
      type: "artboard",
      width: PREVIEW_ARTBOARD_WIDTH,
      x: Math.round(previous.x + previous.width + PREVIEW_ARTBOARD_GAP),
      y: 0,
    };
  }

  function ensureDefaultPreviewArtboards() {
    namespace.ensureDefaultDocumentArtboards?.(DEFAULT_PREVIEW_ARTBOARD_COUNT, {
      source: "artboard-preview-defaults",
    });
  }

  function getUnionRect(artboards) {
    return artboards.reduce((rect, artboard) => {
      const right = artboard.x + artboard.width;
      const bottom = artboard.y + artboard.height;

      if (!rect) {
        return {
          bottom,
          left: artboard.x,
          right,
          top: artboard.y,
        };
      }

      return {
        bottom: Math.max(rect.bottom, bottom),
        left: Math.min(rect.left, artboard.x),
        right: Math.max(rect.right, right),
        top: Math.min(rect.top, artboard.y),
      };
    }, null);
  }

  function ensureOverlay() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-preview-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-artboard-preview-layer";
      layer.dataset.artboardPreviewLayer = "";
      stage.appendChild(layer);
    }

    return layer;
  }

  function ensurePaperLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-paper-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-artboard-paper-layer";
      layer.dataset.artboardPaperLayer = "";
      stage.appendChild(layer);
    }

    return layer;
  }

  function getCameraState() {
    const brushEngine = getBrushEngine();
    const camera = lastCameraState?.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera,
      dpr: Math.max(1, Number(lastCameraState?.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
  }

  function getEventDocumentPoint(event) {
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

  function getArtboardAtDocumentPoint(point) {
    const x = Number(point?.docX ?? point?.x);
    const y = Number(point?.docY ?? point?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const labelHitHeight = (LABEL_HIT_HEIGHT_CSS_PX * dpr) / zoom;

    return [...getAllArtboards()].reverse().find((artboard) => (
      x >= artboard.x &&
      y >= artboard.y - labelHitHeight &&
      x <= artboard.x + artboard.width &&
      y <= artboard.y + artboard.height
    )) || null;
  }

  function selectArtboard(artboardId, options = {}) {
    const didUseDocumentModel = typeof namespace.selectDocumentArtboard === "function";
    const artboard = didUseDocumentModel
      ? namespace.selectDocumentArtboard(artboardId, options)
      : getArtboardById(artboardId);

    if (!artboard) {
      return null;
    }

    selectedArtboardId = artboard.id;
    renderArtboardPreviews();

    if (!didUseDocumentModel && options.emit !== false) {
      emitArtboardSelectionChange(artboard, options.source || "artboard-preview-selection");
    }

    return cloneArtboard(artboard);
  }

  function clearArtboardSelection(options = {}) {
    const currentSelection = namespace.getSelectedDocumentArtboardId?.() || selectedArtboardId || "";

    if (!currentSelection) {
      return false;
    }

    selectedArtboardId = "";
    if (typeof namespace.clearDocumentArtboardSelection === "function") {
      const didClear = namespace.clearDocumentArtboardSelection(options);

      renderArtboardPreviews();
      return didClear;
    }

    renderArtboardPreviews();

    if (options.emit !== false) {
      emitArtboardSelectionChange(null, options.source || "artboard-preview-clear-selection");
    }

    return true;
  }

  function renamePreviewArtboards() {
    return getAllArtboards().map(cloneArtboard);
  }

  function movePreviewArtboard(artboardId, x, y, options = {}) {
    const artboard = namespace.moveDocumentArtboard?.(artboardId, x, y, options) || null;

    if (!artboard) {
      return null;
    }

    renderArtboardPreviews();

    return cloneArtboard(artboard);
  }

  function getArtboardContentLayerIds(artboardId) {
    return namespace.getArtboardContentLayerIds?.(artboardId) || [];
  }

  function getArtboardBackgroundLayer(artboardId) {
    const normalizedId = String(artboardId || "active-document").trim() || "active-document";
    const layerModel = namespace.documentLayerModel;
    const backgroundId = layerModel?.getArtboardBackgroundLayerId?.(normalizedId) ||
      (normalizedId === "active-document" ? "background" : `background-${normalizedId}`);
    const flatLayers = layerModel?.flattenTopToBottom?.();

    if (Array.isArray(flatLayers)) {
      return flatLayers.find((layer) => (
        (layer.id === backgroundId || layer.type === "background") &&
        String(layer.artboardId || "active-document").trim() === normalizedId
      )) || null;
    }

    return layerModel?.findEntryById?.(backgroundId) || null;
  }

  function isArtboardBackgroundVisible(artboardId) {
    const backgroundLayer = getArtboardBackgroundLayer(artboardId);

    return backgroundLayer ? backgroundLayer.visible !== false : true;
  }

  function getArtboardDragScreenOffset(dx, dy) {
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: (dx * zoom) / dpr,
      y: (dy * zoom) / dpr,
    };
  }

  function applyArtboardDragDomTransform(artboardId, dx = 0, dy = 0) {
    const stage = getStage();
    const normalizedId = String(artboardId || "").trim();

    if (!stage || !normalizedId) {
      return;
    }

    const screenOffset = getArtboardDragScreenOffset(dx, dy);
    const transform = dx || dy
      ? `translate(${screenOffset.x}px, ${screenOffset.y}px)`
      : "";

    stage
      .querySelectorAll("[data-artboard-id]")
      .forEach((element) => {
        if (element.dataset.artboardId === normalizedId) {
          element.style.transform = transform;
        }
      });
  }

  function clearArtboardDragDomTransform(artboardId) {
    applyArtboardDragDomTransform(artboardId, 0, 0);
  }

  function syncArtboardDragPreview() {
    if (!artboardDragState) {
      return;
    }

    applyArtboardDragDomTransform(
      artboardDragState.artboardId,
      artboardDragState.dx || 0,
      artboardDragState.dy || 0,
    );
  }

  function deletePreviewArtboard(artboardId, options = {}) {
    const normalizedId = String(artboardId || "").trim();

    if (namespace.deleteDocumentArtboard?.(normalizedId, options) !== true) {
      return false;
    }

    renamePreviewArtboards();

    if (selectedArtboardId === normalizedId) {
      selectedArtboardId = "";
    }

    if (options.fit !== false) {
      fitPreviewArtboards();
    } else {
      renderArtboardPreviews();
    }

    return true;
  }

  function handleToolChange(event) {
    currentToolMode = String(event.detail?.toolMode || event.detail?.label || "").trim().toLowerCase();

    if (currentToolMode !== SELECTION_TOOL_MODE) {
      getStage()?.classList.remove("artboard-label-hover");
    }
  }

  function getArtboardLabelAtClientPoint(clientX, clientY) {
    const layer = getStage()?.querySelector("[data-artboard-preview-layer]");

    if (!layer) {
      return null;
    }

    const frames = Array.from(layer.querySelectorAll("[data-artboard-id]"));
    const hitFrame = frames.find((frame) => {
      const label = frame.querySelector(".editor-artboard-frame-label");
      const rect = label?.getBoundingClientRect?.();

      return rect &&
        clientX >= rect.left &&
        clientY >= rect.top &&
        clientX <= rect.right &&
        clientY <= rect.bottom;
    });

    return hitFrame ? getArtboardById(hitFrame.dataset.artboardId) : null;
  }

  function updateArtboardLabelHover(event) {
    const stage = getStage();
    const labelArtboard = currentToolMode === SELECTION_TOOL_MODE
      ? getArtboardLabelAtClientPoint(event.clientX, event.clientY)
      : null;
    const isMovableLabel = labelArtboard && labelArtboard.isPrimary !== true;

    stage?.classList.toggle("artboard-label-hover", Boolean(isMovableLabel));
  }

  function startArtboardDrag(event, artboard) {
    const point = getEventDocumentPoint(event);
    const renderer = getRenderer();
    const brushEngine = getBrushEngine();

    if (!point || !artboard || artboard.isPrimary === true || brushEngine?.isDrawing === true) {
      return false;
    }

    artboardDragState = {
      artboardId: artboard.id,
      didMove: false,
      dx: 0,
      dy: 0,
      layerIds: getArtboardContentLayerIds(artboard.id),
      pointerId: event.pointerId,
      startArtboardRect: {
        height: artboard.height,
        width: artboard.width,
        x: artboard.x,
        y: artboard.y,
      },
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startX: Number(artboard.x) || 0,
      startY: Number(artboard.y) || 0,
    };
    renderer?.beginArtboardDragPreview?.({
      artboardId: artboard.id,
      layerIds: artboardDragState.layerIds,
      startArtboardRect: artboardDragState.startArtboardRect,
    });
    namespace.vectorTextRenderer?.beginArtboardDragPreview?.({
      artboardId: artboard.id,
      layerIds: artboardDragState.layerIds,
    });

    getStage()?.classList.add("artboard-dragging");
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is a convenience here; dragging still follows document coordinates without it.
    }
    event.preventDefault();
    event.stopPropagation();

    selectArtboard(artboard.id, {
      source: "artboard-preview-label-pointer",
    });

    return true;
  }

  function updateArtboardDrag(event) {
    if (!artboardDragState || artboardDragState.pointerId !== event.pointerId) {
      updateArtboardLabelHover(event);
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const nextX = artboardDragState.startX + ((Number(point.docX) || 0) - artboardDragState.startDocX);
    const nextY = artboardDragState.startY + ((Number(point.docY) || 0) - artboardDragState.startDocY);
    const rawDx = nextX - artboardDragState.startX;
    const rawDy = nextY - artboardDragState.startY;
    const constrained = namespace.constrainDocumentArtboardMove?.(
      artboardDragState.artboardId,
      rawDx,
      rawDy,
      {
        startRect: artboardDragState.startArtboardRect,
      },
    ) || { dx: rawDx, dy: rawDy };
    const dx = Number.isFinite(Number(constrained.dx)) ? Number(constrained.dx) : rawDx;
    const dy = Number.isFinite(Number(constrained.dy)) ? Number(constrained.dy) : rawDy;

    artboardDragState.didMove = true;
    artboardDragState.dx = dx;
    artboardDragState.dy = dy;
    getRenderer()?.setArtboardDragPreview?.({
      artboardId: artboardDragState.artboardId,
      dx,
      dy,
      layerIds: artboardDragState.layerIds,
    });
    namespace.vectorTextRenderer?.setArtboardDragPreview?.({
      artboardId: artboardDragState.artboardId,
      dx,
      dy,
      layerIds: artboardDragState.layerIds,
    });
    applyArtboardDragDomTransform(artboardDragState.artboardId, dx, dy);
    getBrushEngine()?.requestDraw?.();

    event.preventDefault();
    event.stopPropagation();
  }

  function finishArtboardDrag(event) {
    if (!artboardDragState || artboardDragState.pointerId !== event.pointerId) {
      return;
    }

    const state = artboardDragState;

    artboardDragState = null;
    getStage()?.classList.remove("artboard-dragging", "artboard-label-hover");
    getRenderer()?.clearArtboardDragPreview?.(state.artboardId);
    namespace.vectorTextRenderer?.clearArtboardDragPreview?.(state.artboardId);
    clearArtboardDragDomTransform(state.artboardId);
    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Some browsers release capture automatically before pointercancel/pointerup.
    }
    event.preventDefault();
    event.stopPropagation();

    if (state.didMove && event.type !== "pointercancel") {
      const dx = Math.round(Number(state.dx) || 0);
      const dy = Math.round(Number(state.dy) || 0);

      if (dx || dy) {
        namespace.commitArtboardMoveWithContents?.(state.artboardId, dx, dy, {
          layerIds: state.layerIds,
          source: "artboard-preview-label-drag",
        });
      } else {
        emitArtboardPreviewChange("artboard-preview-label-drag");
      }
    } else {
      renderArtboardPreviews();
      getBrushEngine()?.requestDraw?.();
    }
  }

  function handleStagePointerDown(event) {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      currentToolMode !== SELECTION_TOOL_MODE
    ) {
      return;
    }

    const labelArtboard = getArtboardLabelAtClientPoint(event.clientX, event.clientY);

    if (startArtboardDrag(event, labelArtboard)) {
      return;
    }

    const artboard = getArtboardAtDocumentPoint(getEventDocumentPoint(event));

    if (!artboard) {
      clearArtboardSelection({
        source: "artboard-preview-stage-empty-pointer",
      });
      return;
    }

    selectArtboard(artboard.id, {
      source: "artboard-preview-stage-pointer",
    });
  }

  function bindStagePointerSelection() {
    const stage = getStage();

    if (!stage || stage.dataset.artboardSelectionReady === "true") {
      return;
    }

    stage.dataset.artboardSelectionReady = "true";
    stage.addEventListener("pointerdown", handleStagePointerDown, true);
    stage.addEventListener("pointermove", updateArtboardDrag, true);
    stage.addEventListener("pointerup", finishArtboardDrag, true);
    stage.addEventListener("pointercancel", finishArtboardDrag, true);
  }

  function syncSelectedArtboardId(artboards) {
    if (!selectedArtboardId) {
      return;
    }

    if (!artboards.some((artboard) => artboard.id === selectedArtboardId)) {
      selectedArtboardId = "";
    }
  }

  function renderArtboardPreviews() {
    const layer = ensureOverlay();
    const paperLayer = ensurePaperLayer();

    if (!layer || !paperLayer) {
      return;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const artboards = getAllArtboards();

    selectedArtboardId = namespace.getSelectedDocumentArtboardId?.() || selectedArtboardId || "";
    syncSelectedArtboardId(artboards);
    const artboardViews = artboards.map((artboard) => {
      const left = ((Number(camera.x) || 0) + artboard.x * zoom) / dpr;
      const top = ((Number(camera.y) || 0) + artboard.y * zoom) / dpr;
      const width = Math.max(1, (artboard.width * zoom) / dpr);
      const height = Math.max(1, (artboard.height * zoom) / dpr);

      return { artboard, height, left, top, width };
    });

    paperLayer.replaceChildren(...artboardViews.map(({ artboard, height, left, top, width }) => {
      const paper = document.createElement("div");

      paper.className = "editor-artboard-paper";
      paper.dataset.artboardId = artboard.id;
      paper.classList.toggle("is-transparent", !isArtboardBackgroundVisible(artboard.id));
      paper.style.left = `${left}px`;
      paper.style.top = `${top}px`;
      paper.style.width = `${width}px`;
      paper.style.height = `${height}px`;

      return paper;
    }));

    layer.replaceChildren(...artboardViews.map(({ artboard, height, left, top, width }) => {
      const frame = document.createElement("div");
      const label = document.createElement("span");
      const isSelected = selectedArtboardId === artboard.id;

      frame.className = artboard.type === "active"
        ? "editor-artboard-frame is-active"
        : "editor-artboard-frame";
      frame.classList.toggle("is-selected", isSelected);
      frame.dataset.artboardId = artboard.id;
      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;

      label.className = "editor-artboard-frame-label";
      label.textContent = `${artboard.name} ${artboard.width} x ${artboard.height}`;

      frame.append(label);
      return frame;
    }));

    syncArtboardDragPreview();
  }

  function fitPreviewArtboards() {
    const brushEngine = getBrushEngine();
    const stage = getStage();
    const union = getUnionRect(getAllArtboards());

    if (!brushEngine?.camera || !stage || !union) {
      renderArtboardPreviews();
      return;
    }

    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(1, Number(brushEngine.dpr || window.devicePixelRatio || 1));
    const viewportWidth = Math.max(1, Math.round((stage.clientWidth || rect.width || 1) * dpr));
    const viewportHeight = Math.max(1, Math.round((stage.clientHeight || rect.height || 1) * dpr));
    const padding = FIT_PADDING_CSS_PX * dpr;
    const availableWidth = Math.max(1, viewportWidth - padding * 2);
    const availableHeight = Math.max(1, viewportHeight - padding * 2);
    const unionWidth = Math.max(1, union.right - union.left);
    const unionHeight = Math.max(1, union.bottom - union.top);
    const zoom = Math.max(0.05, Math.min(32, availableWidth / unionWidth, availableHeight / unionHeight));

    brushEngine.camera.zoom = zoom;
    brushEngine.camera.x = (viewportWidth - unionWidth * zoom) * 0.5 - union.left * zoom;
    brushEngine.camera.y = (viewportHeight - unionHeight * zoom) * 0.5 - union.top * zoom;
    brushEngine.userManipulatedCamera = true;
    brushEngine.requestDraw?.();
    renderArtboardPreviews();
  }

  function resetPreviewArtboards(options = {}) {
    const renderer = getRenderer();

    namespace.resetDocumentArtboards?.({
      artboards: options.artboards,
      defaultSecondaryCount: DEFAULT_PREVIEW_ARTBOARD_COUNT,
      documentHeight: renderer?.height || namespace.documentSettings?.height || 1,
      documentWidth: renderer?.width || namespace.documentSettings?.width || 1,
      source: options.source || "artboard-preview-reset",
    });

    if (options.fit !== false) {
      fitPreviewArtboards();
      return;
    }

    renderArtboardPreviews();
  }

  function handleCreateButtonClick() {
    if (!getRenderer()) {
      namespace.initEditorCanvas?.();
    }

    if (!getRenderer()) {
      return;
    }

    ensureDefaultPreviewArtboards();
    createPreviewArtboard();
    fitPreviewArtboards();
  }

  namespace.initArtboardPreview = function initArtboardPreview() {
    const button = document.querySelector("[data-artboard-create]");

    currentToolMode = String(document.querySelector("[data-tool].active")?.dataset.toolMode || SELECTION_TOOL_MODE)
      .trim()
      .toLowerCase() || SELECTION_TOOL_MODE;

    if (button && button.dataset.artboardReady !== "true") {
      button.dataset.artboardReady = "true";
      button.addEventListener("click", handleCreateButtonClick);
    }

    if (isReady) {
      return;
    }

    isReady = true;
    bindStagePointerSelection();

    window.addEventListener("cbo:camera-change", (event) => {
      lastCameraState = event.detail || null;
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:tool-change", handleToolChange);
    window.addEventListener("cbo:document-artboards-change", () => {
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:document-layers-change", () => {
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:document-artboard-selection-change", (event) => {
      selectedArtboardId = event.detail?.artboardId || "";
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:editor-canvas-ready", () => {
      bindStagePointerSelection();
      ensureDefaultPreviewArtboards();
      fitPreviewArtboards();
    });
    window.addEventListener("cbo:editor-canvas-reset", (event) => {
      resetPreviewArtboards({
        source: event.detail?.source || "editor-canvas-reset",
      });
    });
    window.addEventListener("resize", () => renderArtboardPreviews());

    if (getRenderer()) {
      ensureDefaultPreviewArtboards();
      fitPreviewArtboards();
    }
  };

  namespace.createPreviewArtboard = function createPreviewArtboardFromTool() {
    const artboard = createPreviewArtboard();

    renderArtboardPreviews();
    return { ...artboard };
  };

  namespace.getPreviewArtboards = function getPreviewArtboards() {
    return getAllArtboards().map(cloneArtboard);
  };

  namespace.selectPreviewArtboard = function selectPreviewArtboard(artboardId, options = {}) {
    return selectArtboard(artboardId, options);
  };

  namespace.getSelectedPreviewArtboardId = function getSelectedPreviewArtboardId() {
    return selectedArtboardId || "";
  };

  namespace.clearPreviewArtboardSelection = function clearPreviewArtboardSelection(options = {}) {
    return clearArtboardSelection(options);
  };

  namespace.deletePreviewArtboard = function deletePreviewArtboardFromTool(artboardId, options = {}) {
    return deletePreviewArtboard(artboardId, options);
  };

  namespace.movePreviewArtboard = function movePreviewArtboardFromTool(artboardId, x, y, options = {}) {
    return movePreviewArtboard(artboardId, x, y, options);
  };
})(window.CBO = window.CBO || {});
