(function registerAreaSelectionTool(namespace) {
  const RECT_TOOL_MODE = "selection-rect";
  const MIN_SELECTION_SIZE = 3;

  const state = {
    activeToolMode: "",
    canvas: null,
    overlay: null,
    pointerId: null,
    rafId: 0,
    rect: null,
    startPoint: null,
  };

  function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function normalizeRectFromPoints(startPoint, endPoint) {
    const renderer = getRenderer();
    const width = Math.max(1, Math.round(renderer?.width || 1));
    const height = Math.max(1, Math.round(renderer?.height || 1));
    const minX = clamp(Math.min(startPoint.docX, endPoint.docX), 0, width);
    const minY = clamp(Math.min(startPoint.docY, endPoint.docY), 0, height);
    const maxX = clamp(Math.max(startPoint.docX, endPoint.docX), 0, width);
    const maxY = clamp(Math.max(startPoint.docY, endPoint.docY), 0, height);
    const x = Math.floor(minX);
    const y = Math.floor(minY);
    const right = Math.ceil(maxX);
    const bottom = Math.ceil(maxY);

    if (right - x < MIN_SELECTION_SIZE || bottom - y < MIN_SELECTION_SIZE) {
      return null;
    }

    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function cloneRect(rect) {
    return rect
      ? {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        }
      : null;
  }

  function intersectRects(a, b) {
    if (!a || !b) {
      return null;
    }

    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.width, b.x + b.width);
    const y1 = Math.min(a.y + a.height, b.y + b.height);

    if (x1 <= x0 || y1 <= y0) {
      return null;
    }

    return {
      height: y1 - y0,
      width: x1 - x0,
      x: x0,
      y: y0,
    };
  }

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function setRect(rect, options = {}) {
    state.rect = rect ? cloneRect(rect) : null;
    namespace.activeAreaSelectionRect = cloneRect(state.rect);
    updateOverlay();

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("cbo:area-selection-change", {
        detail: {
          rect: cloneRect(state.rect),
          source: options.source || "area-selection",
        },
      }));
    }

    if (state.rect) {
      startOverlayLoop();
    }

    return cloneRect(state.rect);
  }

  function clear(options = {}) {
    return setRect(null, {
      ...options,
      source: options.source || "area-selection-clear",
    });
  }

  function hasSelection() {
    return Boolean(state.rect);
  }

  function getRect() {
    return cloneRect(state.rect);
  }

  function intersectRect(rect) {
    return state.rect ? intersectRects(rect, state.rect) : cloneRect(rect);
  }

  function isPointInside(docX, docY) {
    const rect = state.rect;

    if (!rect) {
      return true;
    }

    return (
      docX >= rect.x &&
      docY >= rect.y &&
      docX < rect.x + rect.width &&
      docY < rect.y + rect.height
    );
  }

  function getScreenRect(rect) {
    const brushEngine = getBrushEngine();
    const canvas = state.canvas;
    const camera = brushEngine?.camera;
    const dpr = Math.max(1, Number(brushEngine?.dpr) || window.devicePixelRatio || 1);

    if (!canvas || !camera || !rect) {
      return null;
    }

    const left = (camera.x + rect.x * camera.zoom) / dpr;
    const top = (camera.y + rect.y * camera.zoom) / dpr;
    const width = (rect.width * camera.zoom) / dpr;
    const height = (rect.height * camera.zoom) / dpr;

    return {
      height,
      left,
      top,
      width,
    };
  }

  function getDocumentScreenRect() {
    const brushEngine = getBrushEngine();
    const renderer = getRenderer();
    const canvas = state.canvas;
    const camera = brushEngine?.camera;
    const dpr = Math.max(1, Number(brushEngine?.dpr) || window.devicePixelRatio || 1);

    if (!canvas || !camera || !renderer) {
      return null;
    }

    return {
      height: (Math.max(1, Math.round(renderer.height || 1)) * camera.zoom) / dpr,
      left: (camera.x || 0) / dpr,
      top: (camera.y || 0) / dpr,
      width: (Math.max(1, Math.round(renderer.width || 1)) * camera.zoom) / dpr,
    };
  }

  function getViewportRect() {
    const canvas = state.canvas;

    if (!canvas) {
      return {
        height: 1,
        width: 1,
      };
    }

    return {
      height: Math.max(1, canvas.clientHeight || canvas.getBoundingClientRect().height || 1),
      width: Math.max(1, canvas.clientWidth || canvas.getBoundingClientRect().width || 1),
    };
  }

  function ensureOverlay() {
    if (state.overlay?.isConnected) {
      return state.overlay;
    }

    const overlay = document.createElement("div");
    const shadeTop = document.createElement("span");
    const shadeRight = document.createElement("span");
    const shadeBottom = document.createElement("span");
    const shadeLeft = document.createElement("span");
    const outline = document.createElement("span");
    const host = state.canvas?.parentElement || document.querySelector(".editor-stage");

    overlay.className = "editor-area-selection-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    shadeTop.className = "editor-area-selection-shade editor-area-selection-shade-top";
    shadeRight.className = "editor-area-selection-shade editor-area-selection-shade-right";
    shadeBottom.className = "editor-area-selection-shade editor-area-selection-shade-bottom";
    shadeLeft.className = "editor-area-selection-shade editor-area-selection-shade-left";
    outline.className = "editor-area-selection-outline";
    overlay.append(shadeTop, shadeRight, shadeBottom, shadeLeft, outline);
    host?.appendChild(overlay);
    state.overlay = overlay;

    return overlay;
  }

  function updateOverlay() {
    const overlay = ensureOverlay();
    const screenRect = getScreenRect(state.rect);
    const documentRect = getDocumentScreenRect();

    if (!screenRect || !documentRect || !state.rect) {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    overlay.style.left = "0px";
    overlay.style.top = "0px";
    overlay.style.width = `${getViewportRect().width}px`;
    overlay.style.height = `${getViewportRect().height}px`;
    overlay.style.setProperty("--area-document-x", `${documentRect.left}px`);
    overlay.style.setProperty("--area-document-y", `${documentRect.top}px`);
    overlay.style.setProperty("--area-document-width", `${Math.max(1, documentRect.width)}px`);
    overlay.style.setProperty("--area-document-height", `${Math.max(1, documentRect.height)}px`);
    overlay.style.setProperty("--area-selection-x", `${screenRect.left}px`);
    overlay.style.setProperty("--area-selection-y", `${screenRect.top}px`);
    overlay.style.setProperty("--area-selection-width", `${Math.max(1, screenRect.width)}px`);
    overlay.style.setProperty("--area-selection-height", `${Math.max(1, screenRect.height)}px`);
  }

  function startOverlayLoop() {
    if (state.rafId) {
      return;
    }

    const tick = () => {
      state.rafId = 0;
      updateOverlay();

      if (state.rect || state.pointerId != null) {
        state.rafId = window.requestAnimationFrame(tick);
      }
    };

    state.rafId = window.requestAnimationFrame(tick);
  }

  function stopOverlayLoop() {
    if (!state.rafId || state.rect || state.pointerId != null) {
      return;
    }

    window.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  function isRectToolActive() {
    return state.activeToolMode === RECT_TOOL_MODE;
  }

  function getEventDocumentPoint(event) {
    const brushEngine = getBrushEngine();

    if (!brushEngine?.screenToDocumentSpace) {
      return null;
    }

    return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
  }

  function handlePointerDown(event) {
    if (!isRectToolActive() || event.button !== 0 || state.pointerId != null) {
      return;
    }

    const point = getEventDocumentPoint(event);
    const brushEngine = getBrushEngine();

    if (!point || !brushEngine?.isDocumentPointInside?.(point)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.pointerId = event.pointerId;
    state.startPoint = point;
    setRect(null, { source: "area-selection-drag-start" });
    state.canvas?.setPointerCapture?.(event.pointerId);
    startOverlayLoop();
  }

  function handlePointerMove(event) {
    if (event.pointerId !== state.pointerId || !state.startPoint) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRect(normalizeRectFromPoints(state.startPoint, point), {
      emit: false,
      source: "area-selection-drag",
    });
  }

  function finishPointer(event, didCancel = false) {
    if (event.pointerId !== state.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.canvas?.hasPointerCapture?.(event.pointerId)) {
      state.canvas.releasePointerCapture(event.pointerId);
    }

    const point = getEventDocumentPoint(event);

    if (didCancel || !point || !state.startPoint) {
      clear({ source: "area-selection-cancel" });
    } else {
      setRect(normalizeRectFromPoints(state.startPoint, point), {
        source: "area-selection-commit",
      });
    }

    state.pointerId = null;
    state.startPoint = null;
    stopOverlayLoop();
  }

  function getWritableLayerId() {
    const layerModel = namespace.documentLayerModel;
    const activeId = layerModel?.activeLayerId || "";
    const layer = activeId ? layerModel.findEntryById?.(activeId) : null;

    if (!layer || layer.locked === true || (layer.type !== "paint" && layer.type !== "image")) {
      return "";
    }

    return layer.id;
  }

  function clearTargetRect(target, rect) {
    const renderer = getRenderer();
    const mappedRect = renderer?.getRasterTargetLocalRect?.(target, rect);
    const clearRect = mappedRect?.localRect;
    const gl = renderer?.gl || renderer?.context;

    if (!gl || !target?.framebuffer || !clearRect) {
      return false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(clearRect.x, target.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    renderer.markRasterTargetDirty?.(target);

    return true;
  }

  function pushDeleteHistory(layerId, dirtyRect, tileHistory, beforeSnapshot) {
    const renderer = getRenderer();
    const history = namespace.documentHistory;

    if (!history?.push || !renderer) {
      renderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
        source: "area-selection-delete",
      });
      renderer?.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer?.deleteRasterSnapshot?.(beforeSnapshot);
      return;
    }

    if (tileHistory) {
      const tileEntry = renderer.commitRasterTileHistory?.(tileHistory, {
        label: "area-selection-delete",
        memoryPolicy: renderer.createRasterOperationMemoryReport?.({
          afterRect: dirtyRect,
          beforeRect: dirtyRect,
          layerId,
          operationType: "area-selection-delete",
          source: "area-selection-delete",
          targetRect: dirtyRect,
          tool: "selection",
        }),
        redoSource: "history-redo-area-selection-delete",
        source: "area-selection-delete",
        type: "pixel",
        undoSource: "history-undo-area-selection-delete",
      });
      const entry = tileEntry
        ? renderer.finalizeRasterEditHistoryEntry?.(layerId, tileEntry, {
            source: "area-selection-delete",
          }) || tileEntry
        : null;

      if (entry) {
        history.push(entry);
      } else {
        renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      }

      return;
    }

    if (!beforeSnapshot) {
      return;
    }

    const afterSnapshot = renderer.createRasterSnapshot?.(layerId, dirtyRect, "area-selection-delete-after");
    let entry = {
      after: afterSnapshot,
      before: beforeSnapshot,
      layerId,
      memoryPolicy: renderer.createRasterOperationMemoryReport?.({
        afterSnapshot,
        beforeSnapshot,
        layerId,
        operationType: "area-selection-delete",
        source: "area-selection-delete",
        targetRect: dirtyRect,
        tool: "selection",
      }),
      rect: dirtyRect,
      source: "area-selection-delete",
      type: "pixel",
      undo: () => renderer.restoreRasterSnapshot(layerId, beforeSnapshot, {
        source: "history-undo-area-selection-delete",
      }),
      redo: () => renderer.restoreRasterSnapshot(layerId, afterSnapshot, {
        source: "history-redo-area-selection-delete",
      }),
      destroy: () => {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    };

    entry = renderer.finalizeRasterEditHistoryEntry?.(layerId, entry, {
      source: "area-selection-delete",
    }) || entry;
    history.push(entry);
  }

  function deleteSelectionPixels() {
    const renderer = getRenderer();
    const layerId = getWritableLayerId();
    const rect = getRect();

    if (!renderer || !layerId || !rect) {
      return false;
    }

    const targets = renderer.getRasterTargetsForPaintRect?.(layerId, rect, {
      source: "area-selection-delete",
    }) || [];

    if (targets.length === 0) {
      return false;
    }

    const tileHistory = renderer.beginRasterTileHistory?.(layerId, rect, {
      label: "area-selection-delete",
      source: "area-selection-delete",
    });
    const beforeSnapshot = tileHistory
      ? null
      : renderer.createRasterSnapshot?.(layerId, rect, "area-selection-delete-before");
    let didClear = false;

    targets.forEach((entry) => {
      didClear = clearTargetRect(entry?.target || entry, rect) || didClear;
    });

    if (!didClear) {
      renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer.deleteRasterSnapshot?.(beforeSnapshot);
      return false;
    }

    pushDeleteHistory(layerId, rect, tileHistory, beforeSnapshot);
    renderer.invalidatePreviewCache?.("area-selection-delete");
    renderer.emitContentChange?.({ layerId, source: "area-selection-delete" });
    renderer.requestDraw?.();

    return true;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      if (state.rect) {
        event.preventDefault();
        event.stopPropagation();
        clear({ source: "area-selection-escape" });
      }
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace" && event.code !== "Delete" && event.code !== "Backspace") {
      return;
    }

    if (!state.rect) {
      return;
    }

    if (deleteSelectionPixels()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleToolChange(event) {
    state.activeToolMode = String(event.detail?.toolMode || "").trim().toLowerCase();
  }

  function initAreaSelectionTool() {
    const canvas = document.querySelector(".editor-webgl-canvas");

    if (!canvas || canvas.dataset.areaSelectionReady === "true") {
      return;
    }

    state.canvas = canvas;
    state.activeToolMode = String(document.querySelector("[data-tool].active")?.dataset.toolMode || "").trim().toLowerCase();
    canvas.dataset.areaSelectionReady = "true";
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", (event) => finishPointer(event, false));
    canvas.addEventListener("pointercancel", (event) => finishPointer(event, true));
    window.addEventListener("cbo:tool-change", handleToolChange);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updateOverlay);
    ensureOverlay();
  }

  namespace.areaSelection = {
    clear,
    deleteSelectionPixels,
    getRect,
    hasSelection,
    intersectRect,
    isPointInside,
    setRect,
  };

  namespace.initAreaSelectionTool = initAreaSelectionTool;
})(window.CBO = window.CBO || {});
