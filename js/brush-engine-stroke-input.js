(function registerBrushEngineStrokeInput(namespace) {
  namespace.BrushEngineMixins = namespace.BrushEngineMixins || {};

  function defineBrushEngineMethods(BrushEngine, methods) {
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(BrushEngine.prototype, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  namespace.BrushEngineMixins.strokeInput = function installBrushEngineStrokeInput(BrushEngine, internals) {
    const {
      MIN_ZOOM,
      MAX_ZOOM,
      WHEEL_ZOOM_INTENSITY,
      PINCH_ZOOM_INTENSITY,
      ANDROID_PINCH_ZOOM_STEP_MIN,
      ANDROID_PINCH_ZOOM_STEP_MAX,
      TOUCH_NAVIGATION_STALE_POINTER_MS,
      CROPPED_BRUSH_STROKES,
      STROKE_ALLOCATION_QUANTUM,
      STROKE_FINAL_PADDING,
      STROKE_SAMPLE_CLAMP_MIN_PADDING,
      STROKE_PREVIEW_DIRTY_TILE_SIZE,
      STROKE_PREVIEW_DIRTY_MAX_RECTS,
      STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE,
      STROKE_TARGET_PREWARM_MAX_TILES,
      PREVIEW_DIRTY_DEBUG_EVENT,
      ERASER_EMPTY_LAYER_TOAST_MS,
      ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS,
      MAX_STAMPS_PER_FLUSH,
      MOBILE_MAX_STAMPS_PER_FLUSH,
      ANDROID_MAX_STAMPS_PER_FLUSH,
      DESKTOP_POINTER_SAMPLES_PER_FRAME,
      MOBILE_POINTER_SAMPLES_PER_FRAME,
      ANDROID_POINTER_SAMPLES_PER_FRAME,
      DESKTOP_POINTER_FRAME_BUDGET_MS,
      MOBILE_POINTER_FRAME_BUDGET_MS,
      ANDROID_POINTER_FRAME_BUDGET_MS,
      POINTER_SAMPLE_BACKLOG_MULTIPLIER,
      DESKTOP_STROKE_SEGMENT_MIN_SAMPLES,
      MOBILE_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MAX_SAMPLES,
      ANDROID_STROKE_SEGMENT_DISTANCE_STEP,
      ANDROID_STROKE_ALLOCATION_QUANTUM,
      BRUSH_HISTORY_BATCH_IDLE_MS,
      RASTER_BYTES_PER_PIXEL,
      RASTER_MIB,
      STROKE_MEMORY_POLICY,
      STROKE_SCRATCH_SOFT_EVICT_BYTES,
      STROKE_SCRATCH_HARD_WARN_BYTES,
      STROKE_SCRATCH_TOP_RESOURCE_LIMIT,
      STROKE_INCREMENTAL_BAKE_ENABLED,
      STROKE_INCREMENTAL_BAKE_COVERAGE,
      STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP,
      VELOCITY_PRESSURE_MAX_SPEED,
      VELOCITY_PRESSURE_SMOOTHING,
      RENDERING_MODE_PRESETS,
      STROKE_BUILDUP_EPSILON,
      STROKE_RENDER_MODE_PLATEAU,
      STROKE_RENDER_MODE_ACCUM,
      STROKE_RENDER_MODE_MIXED,
      COLOR_GOLDEN_RATIO,
      QUICK_LINE_HOLD_DELAY_MS,
      QUICK_LINE_MIN_SCREEN_DISTANCE,
      QUICK_LINE_MAX_PATH_RATIO,
      QUICK_LINE_DEVIATION_SCREEN_FRACTION,
      QUICK_LINE_MIN_SCREEN_DEVIATION,
      QUICK_LINE_MAX_SCREEN_DEVIATION,
      QUICK_LINE_MAX_SOURCE_SAMPLES,
      QUICK_SHAPE_PREVIEW_MIN_INTERVAL_MS,
      QUICK_SHAPE_PREVIEW_MAX_INTERVAL_MS,
      QUICK_CIRCLE_MIN_SCREEN_DIAMETER,
      QUICK_CIRCLE_MAX_ASPECT_RATIO,
      QUICK_CIRCLE_MAX_CLOSE_GAP_FRACTION,
      QUICK_CIRCLE_MIN_PATH_RATIO,
      QUICK_CIRCLE_MAX_PATH_RATIO,
      QUICK_CIRCLE_MAX_RADIAL_DEVIATION_FRACTION,
      QUICK_CIRCLE_MAX_AVERAGE_DEVIATION_FRACTION,
      QUICK_CIRCLE_MIN_SYNTHETIC_SAMPLES,
      QUICK_CIRCLE_MAX_SYNTHETIC_SAMPLES,
      QUICK_CIRCLE_SNAP_ASPECT_RATIO,
      QUICK_ELLIPSE_MAX_ASPECT_RATIO,
    } = internals;

    defineBrushEngineMethods(BrushEngine, {
    observeViewportSize() {
      window.addEventListener("resize", this.handleResize, { passive: true });

      if (!window.ResizeObserver) {
        return;
      }

      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas);
    }
,

    handleResize() {
      if (this.resizeViewport() && !this.userManipulatedCamera) {
        this.centerCamera();
      }

      this.requestDraw();
    }
,

    bindBrushSettings() {
      // Quando un getSettings esplicito è fornito (es. preview pad), non ascoltiamo l'evento globale:
      // il chiamante usa setBrushState() per pilotare l'engine senza inquinare il brush principale.
      if (this.options.getSettings) {
        return;
      }

      window.addEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
    }
,

    bindToolState() {
      if (!this.options.respectActiveTool) {
        this.isBrushToolActive = true;
        return;
      }

      window.addEventListener("cbo:tool-change", this.handleToolChange);
    }
,

    bindDocumentEvents() {
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.addEventListener("cbo:before-raster-history-capture", this.handleBeforeRasterHistoryCapture);
    }
,

    handleBrushSettingsChange() {
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
    }
,

    getInitialBrushToolActive() {
      if (this.options?.respectActiveTool === false || this.options?.getSettings) {
        this.activeStrokeTool = "brush";
        return true;
      }

      const activeTool = document.querySelector("[data-tool].active");

      if (!activeTool) {
        this.activeStrokeTool = "";
        return false;
      }

      const tool = this.resolveStrokeToolFromDetail({
        label: activeTool.getAttribute("aria-label") || "",
        syncGroup: activeTool.dataset.toolSync || "",
        toolMode: activeTool.dataset.toolMode || "",
      });

      this.activeStrokeTool = tool || "";

      return Boolean(tool);
    }
,

    resolveStrokeToolFromDetail(detail = {}) {
      const label = String(detail.label || "").toUpperCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();
      const syncGroup = String(detail.syncGroup || "").toLowerCase();

      if (label === "ERASER" || toolMode === "eraser") {
        return "eraser";
      }

      if (label === "BRUSH" || (toolMode === "brush" && syncGroup === "brush")) {
        return "brush";
      }

      return "";
    }
,

    isBrushToolDetail(detail = {}) {
      return Boolean(this.resolveStrokeToolFromDetail(detail));
    }
,

    handleToolChange(event) {
      const tool = this.resolveStrokeToolFromDetail(event.detail);

      if (tool !== this.activeStrokeTool) {
        this.flushPendingBrushHistory({
          source: "brush-tool-change",
        });
      }

      this.activeStrokeTool = tool;
      this.isBrushToolActive = Boolean(tool);

      if (tool === "eraser") {
        this.scheduleActiveImageLayerRasterizeForEraser("eraser-tool-change-preflight");
      } else {
        this.cancelPendingEraserImageRasterize();
      }
    }
,

    handleDocumentChange(event) {
      if (event?.type === "cbo:document-layers-change") {
        this.flushPendingBrushHistory({
          source: "brush-layer-change",
        });
      }

      this.requestDraw();

      if (this.activeStrokeTool === "eraser") {
        this.scheduleActiveImageLayerRasterizeForEraser("eraser-layer-change-preflight");
      }
    }
,

    canStartBrushStroke() {
      return !this.options.respectActiveTool || this.isBrushToolActive;
    }
,

    bindPointerEvents() {
      this.canvas.style.touchAction = "none";
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    }
,

    bindNavigationEvents() {
      if (this.options.disableNavigation) {
        return;
      }

      const navigationTarget = this.stage || this.canvas;

      this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
      navigationTarget.addEventListener("pointerdown", this.handleNavigationPointerDown, true);
      navigationTarget.addEventListener("pointermove", this.handleNavigationPointerMove, true);
      navigationTarget.addEventListener("pointerup", this.handleNavigationPointerUp, true);
      navigationTarget.addEventListener("pointercancel", this.handleNavigationPointerCancel, true);
      navigationTarget.addEventListener("auxclick", this.handleAuxClick, true);
      window.addEventListener("pointerup", this.handleWindowTouchNavigationPointerRelease);
      window.addEventListener("pointercancel", this.handleWindowTouchNavigationPointerRelease);
      window.addEventListener("touchend", this.handleWindowTouchNavigationEnd, { passive: true });
      window.addEventListener("touchcancel", this.handleWindowTouchNavigationEnd, { passive: true });
      window.addEventListener("keydown", this.handleKeyDown, true);
      window.addEventListener("keyup", this.handleKeyUp, true);
      window.addEventListener("blur", this.handleWindowBlur);
    }
,

    roundEraserDebugValue(value, digits = 3) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return null;
      }

      const factor = 10 ** digits;

      return Math.round(number * factor) / factor;
    }
,

    logEraserZoomDebug(eventName, detail = {}, options = {}) {
      const debug = namespace.EraserZoomDebug;

      if (!debug?.log) {
        return null;
      }

      return debug.log(eventName, {
        ...detail,
        activeStrokeTool: this.activeStrokeTool || "",
        currentStrokeTool: this.currentStrokeTool || "",
        isDrawing: this.isDrawing === true,
        isPanning: this.isPanning === true,
        touchNavigationExclusive: this.touchNavigationExclusive === true,
      }, options);
    }
,

    warnEraserZoomDebug(eventName, detail = {}, options = {}) {
      const debug = namespace.EraserZoomDebug;

      if (!debug?.warn) {
        return null;
      }

      return debug.warn(eventName, {
        ...detail,
        activeStrokeTool: this.activeStrokeTool || "",
        currentStrokeTool: this.currentStrokeTool || "",
        isDrawing: this.isDrawing === true,
        isPanning: this.isPanning === true,
        touchNavigationExclusive: this.touchNavigationExclusive === true,
      }, options);
    }
,

    handleWheel(event) {
      event.preventDefault();

      let deltaY = event.deltaY;

      if (event.deltaMode === 1) {
        deltaY *= 16;
      } else if (event.deltaMode === 2) {
        deltaY *= window.innerHeight || 800;
      }

      const intensity = event.ctrlKey ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY;
      const factor = Math.exp(-deltaY * intensity);

      this.zoomAtClient(event.clientX, event.clientY, factor);
    }
,

    getCanvasViewportPoint(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const safeClientX = Number.isFinite(Number(clientX)) ? Number(clientX) : rect.left;
      const safeClientY = Number.isFinite(Number(clientY)) ? Number(clientY) : rect.top;

      return {
        x: (safeClientX - rect.left) * this.dpr,
        y: (safeClientY - rect.top) * this.dpr,
      };
    }
,

    zoomAtClient(clientX, clientY, factor) {
      if (!Number.isFinite(factor) || factor <= 0) {
        return;
      }

      const cursor = this.getCanvasViewportPoint(clientX, clientY);
      const cursorViewportX = cursor.x;
      const cursorViewportY = cursor.y;
      const oldZoom = this.camera.zoom;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

      if (newZoom === oldZoom) {
        return;
      }

      // Mantieni fermo il punto del documento sotto il cursore (anchor zoom).
      const docX = (cursorViewportX - this.camera.x) / oldZoom;
      const docY = (cursorViewportY - this.camera.y) / oldZoom;

      this.camera.zoom = newZoom;
      this.camera.x = cursorViewportX - docX * newZoom;
      this.camera.y = cursorViewportY - docY * newZoom;
      this.userManipulatedCamera = true;
      this.requestDraw();
      this.logEraserZoomDebug("zoom-wheel", {
        clientX: this.roundEraserDebugValue(clientX),
        clientY: this.roundEraserDebugValue(clientY),
        docX: this.roundEraserDebugValue(docX),
        docY: this.roundEraserDebugValue(docY),
        factor: this.roundEraserDebugValue(factor, 5),
        newZoom: this.roundEraserDebugValue(newZoom, 5),
        oldZoom: this.roundEraserDebugValue(oldZoom, 5),
      }, { layerState: false });
    }
,

    getTouchNavigationPointers() {
      return Array.from(this.activeTouchPointers.values())
        .filter((pointer) => pointer && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY))
        .sort((first, second) => first.pointerId - second.pointerId);
    }
,

    rememberTouchNavigationPointer(event) {
      const now = this.getNow();

      this.touchNavigationLastActivityAt = now;
      this.activeTouchPointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        updatedAt: now,
      });
    }
,

    pruneStaleTouchNavigationPointers(now = this.getNow()) {
      let didPrune = false;

      this.activeTouchPointers.forEach((pointer, pointerId) => {
        const updatedAt = Number(pointer?.updatedAt) || 0;

        if (updatedAt > 0 && now - updatedAt <= TOUCH_NAVIGATION_STALE_POINTER_MS) {
          return;
        }

        this.activeTouchPointers.delete(pointerId);
        didPrune = true;
      });

      const hasStaleGesture = this.touchNavigationGesture && this.activeTouchPointers.size < 2;
      const hasStaleExclusive = this.touchNavigationExclusive && this.activeTouchPointers.size === 0;

      if (!didPrune && !hasStaleGesture && !hasStaleExclusive) {
        return false;
      }

      if (this.isPanning && this.activePanPointerId != null && !this.activeTouchPointers.has(this.activePanPointerId)) {
        this.endPan();
      }

      if (this.touchNavigationGesture && this.activeTouchPointers.size < 2) {
        this.touchNavigationGesture = null;
      }

      if (this.touchNavigationExclusive && this.activeTouchPointers.size === 0) {
        this.endTouchNavigationExclusive();
      }

      return true;
    }
,

    resetTouchNavigationState(source = "touch-navigation-reset") {
      const hadState = this.activeTouchPointers.size > 0 ||
        this.touchNavigationGesture ||
        this.touchNavigationExclusive ||
        (this.isPanning && this.activePanPointerId != null);

      this.activeTouchPointers.clear();
      this.touchNavigationGesture = null;
      this.touchNavigationLastActivityAt = 0;

      if (this.isPanning && this.activePanPointerId != null) {
        this.endPan();
      }

      this.endTouchNavigationExclusive();

      if (hadState) {
        namespace.EngineGovernor?.markActivity?.({ source });
      }
    }
,

    getTouchNavigationGeometry(pointers = this.getTouchNavigationPointers()) {
      if (!Array.isArray(pointers) || pointers.length < 2) {
        return null;
      }

      const first = pointers[0];
      const second = pointers[1];
      const centerClientX = (first.clientX + second.clientX) * 0.5;
      const centerClientY = (first.clientY + second.clientY) * 0.5;
      const firstViewport = this.getCanvasViewportPoint(first.clientX, first.clientY);
      const secondViewport = this.getCanvasViewportPoint(second.clientX, second.clientY);
      const centerViewport = this.getCanvasViewportPoint(centerClientX, centerClientY);
      const distance = Math.max(
        1,
        Math.hypot(secondViewport.x - firstViewport.x, secondViewport.y - firstViewport.y),
      );

      return {
        centerClientX,
        centerClientY,
        centerX: centerViewport.x,
        centerY: centerViewport.y,
        distance,
        pointerIds: [first.pointerId, second.pointerId],
      };
    }
,

    cancelActiveStrokeForTouchNavigation() {
      if (!this.isDrawing) {
        return false;
      }

      const pointerId = this.activePointerId;
      const layerId = this.strokeTargetLayerId || "";

      if (pointerId != null && this.canvas.hasPointerCapture?.(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }

      this.documentRenderer?.invalidatePreviewCache?.("touch-navigation-cancel-stroke", {
        layerId,
      });
      this.resetQuickLineState();
      this.clearStrokeLayer();
      this.releaseStrokeLayerTarget();
      this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      this.clearPendingPointerSamples();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
      this.isDrawing = false;
      this.activePointerId = null;
      this.requestDraw();

      return true;
    }
,

    beginTouchNavigationGesture() {
      this.pruneStaleTouchNavigationPointers();
      const geometry = this.getTouchNavigationGeometry();

      if (!geometry) {
        return false;
      }

      this.cancelActiveStrokeForTouchNavigation();

      if (this.isPanning) {
        this.endPan();
      }

      this.touchNavigationGesture = {
        lastCenterX: geometry.centerX,
        lastCenterY: geometry.centerY,
        lastDistance: geometry.distance,
        pointerIds: geometry.pointerIds,
      };
      this.touchNavigationExclusive = true;
      namespace.setTouchNavigationExclusive?.(true, {
        pointerIds: geometry.pointerIds,
        source: "brush-touch-navigation",
      });
      namespace.EngineGovernor?.markActivity?.({ source: "touch-navigation-start" });
      this.logEraserZoomDebug("touch-zoom-start", {
        centerX: this.roundEraserDebugValue(geometry.centerX),
        centerY: this.roundEraserDebugValue(geometry.centerY),
        distance: this.roundEraserDebugValue(geometry.distance),
        pointerIds: geometry.pointerIds,
      }, { layerState: false });

      return true;
    }
,

    updateTouchNavigationGesture() {
      if (!this.touchNavigationGesture) {
        return false;
      }

      const pointers = this.touchNavigationGesture.pointerIds
        .map((pointerId) => this.activeTouchPointers.get(pointerId))
        .filter(Boolean);
      const geometry = this.getTouchNavigationGeometry(pointers);

      if (!geometry) {
        this.touchNavigationGesture = null;
        return false;
      }

      const oldZoom = this.camera.zoom;
      const previousCenterX = this.touchNavigationGesture.lastCenterX;
      const previousCenterY = this.touchNavigationGesture.lastCenterY;
      const previousDistance = Math.max(1, this.touchNavigationGesture.lastDistance || geometry.distance);
      const rawFactor = geometry.distance / previousDistance;

      if (!Number.isFinite(rawFactor) || rawFactor <= 0) {
        this.resetTouchNavigationState("touch-navigation-invalid-factor");
        return false;
      }

      const factor = this.isAndroidPerformanceMode()
        ? this.clamp(rawFactor, ANDROID_PINCH_ZOOM_STEP_MIN, ANDROID_PINCH_ZOOM_STEP_MAX)
        : rawFactor;
      const docX = (previousCenterX - this.camera.x) / oldZoom;
      const docY = (previousCenterY - this.camera.y) / oldZoom;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

      this.camera.zoom = newZoom;
      this.camera.x = geometry.centerX - docX * newZoom;
      this.camera.y = geometry.centerY - docY * newZoom;
      this.touchNavigationGesture.lastCenterX = geometry.centerX;
      this.touchNavigationGesture.lastCenterY = geometry.centerY;
      this.touchNavigationGesture.lastDistance = geometry.distance;
      this.userManipulatedCamera = true;
      namespace.EngineGovernor?.markActivity?.({ source: "touch-navigation" });
      this.requestDraw();
      this.logEraserZoomDebug("touch-zoom-update", {
        centerX: this.roundEraserDebugValue(geometry.centerX),
        centerY: this.roundEraserDebugValue(geometry.centerY),
        docX: this.roundEraserDebugValue(docX),
        docY: this.roundEraserDebugValue(docY),
        factor: this.roundEraserDebugValue(factor, 5),
        newZoom: this.roundEraserDebugValue(newZoom, 5),
        oldZoom: this.roundEraserDebugValue(oldZoom, 5),
        rawFactor: this.roundEraserDebugValue(rawFactor, 5),
      }, { layerState: false });

      return true;
    }
,

    forgetTouchNavigationPointer(pointerId) {
      this.activeTouchPointers.delete(pointerId);

      if (this.touchNavigationGesture && this.activeTouchPointers.size < 2) {
        this.touchNavigationGesture = null;
      }

      if (this.touchNavigationExclusive && this.activeTouchPointers.size === 0) {
        this.endTouchNavigationExclusive();
      }
    }
,

    endTouchNavigationExclusive() {
      if (!this.touchNavigationExclusive) {
        return;
      }

      this.touchNavigationExclusive = false;
      namespace.setTouchNavigationExclusive?.(false, {
        source: "brush-touch-navigation",
      });
      this.logEraserZoomDebug("touch-zoom-end", {
        activeTouchPointers: this.activeTouchPointers.size,
      }, { layerState: false });
    }
,

    isTemporaryPanTrigger(event) {
      return event.button === 1 || (event.button === 0 && this.isSpaceHeld);
    }
,

    isSelectionToolActiveForTouchPan() {
      const activeTool = document.querySelector("[data-tool].active");
      const toolMode = String(activeTool?.dataset?.toolMode || "").trim().toLowerCase();
      const label = String(activeTool?.getAttribute?.("aria-label") || "").trim().toLowerCase();

      return toolMode === "selection" || label === "selection";
    }
,

    isTouchCanvasPanInteractiveTarget(target) {
      return target instanceof Element && Boolean(target.closest([
        "a[href]",
        "button",
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
        "[role='button']",
        "[data-artboard-drag-handle]",
        "[data-ai-image-board]",
        "[data-space-text-board]",
        ".editor-vector-text-layer",
        "[data-artboard-action-bubble]",
        "[data-artboard-symmetry-button]",
        "[data-artboard-connection-menu]",
      ].join(", ")));
    }
,

    isPrimaryTouchPointer(event) {
      return event.pointerType === "touch" && event.isPrimary !== false;
    }
,

    isPrimaryStrokePointer(event) {
      if (this.isPrimaryTouchPointer(event)) {
        return true;
      }

      return event.button === 0;
    }
,

    shouldSuppressTouchToolEvent(event) {
      return Boolean(
        event?.pointerType === "touch" &&
        namespace.isTouchNavigationExclusive?.({ includeGuard: true })
      );
    }
,

    suppressTouchToolEvent(event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
    }
,

    markNavigationEvent(event) {
      event.__cboNavigationHandled = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
,

    beginPan(event, captureElement = this.canvas) {
      this.isPanning = true;
      this.activePanPointerId = event.pointerId;
      this.panCaptureElement = captureElement || this.canvas;
      this.panLastViewportX = event.clientX * this.dpr;
      this.panLastViewportY = event.clientY * this.dpr;

      try {
        this.panCaptureElement.setPointerCapture(event.pointerId);
      } catch (error) {
        // Alcuni browser rifiutano la capture su pointer non principali; il pan funziona comunque.
      }

      this.updateCursor();
    }
,

    updatePan(event) {
      const currentX = event.clientX * this.dpr;
      const currentY = event.clientY * this.dpr;

      namespace.EngineGovernor?.markActivity?.({ source: "pan" });
      this.camera.x += currentX - this.panLastViewportX;
      this.camera.y += currentY - this.panLastViewportY;
      this.panLastViewportX = currentX;
      this.panLastViewportY = currentY;
      this.userManipulatedCamera = true;
      this.requestDraw();
    }
,

    endPan(event) {
      const pointerId = event?.pointerId ?? this.activePanPointerId;
      const captureElement = this.panCaptureElement || this.canvas;

      if (pointerId != null && captureElement?.hasPointerCapture?.(pointerId)) {
        captureElement.releasePointerCapture(pointerId);
      }

      this.isPanning = false;
      this.activePanPointerId = null;
      this.panCaptureElement = null;
      this.updateCursor();
    }
,

    handleNavigationPointerDown(event) {
      if (this.isDisposed) {
        return;
      }

      if (event.pointerType === "touch") {
        this.pruneStaleTouchNavigationPointers();
        this.rememberTouchNavigationPointer(event);
        const documentPoint = this.screenToDocumentSpace(event.clientX, event.clientY);

        if (this.activeTouchPointers.size >= 2 && this.beginTouchNavigationGesture()) {
          this.markNavigationEvent(event);
        } else if (this.shouldStartSelectionTouchCanvasPan(event, documentPoint)) {
          this.markNavigationEvent(event);
          this.clearSelectionForTouchCanvasPan();
          this.beginPan(event, event.currentTarget || this.stage || this.canvas);
          namespace.EngineGovernor?.markActivity?.({ source: "selection-touch-empty-canvas-pan-start" });
        } else if (this.touchNavigationExclusive) {
          this.markNavigationEvent(event);
        }
        return;
      }

      if (this.isDisposed || !this.isTemporaryPanTrigger(event)) {
        return;
      }

      this.markNavigationEvent(event);

      if (this.isDrawing || this.isPanning) {
        return;
      }

      this.beginPan(event, event.currentTarget || this.stage || this.canvas);
    }
,

    handleNavigationPointerMove(event) {
      if (event.pointerType === "touch" && this.activeTouchPointers.has(event.pointerId)) {
        this.rememberTouchNavigationPointer(event);

        if (this.isPanning && this.activePanPointerId === event.pointerId) {
          this.markNavigationEvent(event);
          this.updatePan(event);
        } else if (this.touchNavigationGesture) {
          this.markNavigationEvent(event);
          this.updateTouchNavigationGesture();
        } else if (this.touchNavigationExclusive) {
          this.markNavigationEvent(event);
        }
        return;
      }

      if (this.isDisposed || !this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.updatePan(event);
    }
,

    handleNavigationPointerUp(event) {
      if (event.pointerType === "touch") {
        if (this.isPanning && this.activePanPointerId === event.pointerId) {
          this.markNavigationEvent(event);
          this.endPan(event);
        } else if (this.touchNavigationGesture || this.touchNavigationExclusive) {
          this.markNavigationEvent(event);
        }
        this.forgetTouchNavigationPointer(event.pointerId);
        return;
      }

      if (this.isDisposed || !this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.endPan(event);
    }
,

    handleNavigationPointerCancel(event) {
      if (event.pointerType === "touch") {
        if (this.isPanning && this.activePanPointerId === event.pointerId) {
          this.markNavigationEvent(event);
          this.endPan(event);
        } else if (this.touchNavigationGesture || this.touchNavigationExclusive) {
          this.markNavigationEvent(event);
        }
        this.forgetTouchNavigationPointer(event.pointerId);
        return;
      }

      if (!this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.endPan(event);
    }
,

    handleWindowTouchNavigationPointerRelease(event) {
      if (event.pointerType !== "touch") {
        return;
      }

      if (
        !this.activeTouchPointers.has(event.pointerId) &&
        this.activePanPointerId !== event.pointerId &&
        !this.touchNavigationGesture &&
        !this.touchNavigationExclusive
      ) {
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        this.endPan(event);
      }

      this.forgetTouchNavigationPointer(event.pointerId);
    }
,

    handleWindowTouchNavigationEnd(event) {
      const touchCount = Number(event.touches?.length) || 0;

      if ((this.touchNavigationGesture || this.touchNavigationExclusive) && touchCount < 2) {
        this.resetTouchNavigationState("touch-navigation-touchend-reset");
        return;
      }

      if (this.isPanning && this.activePanPointerId != null && touchCount === 0) {
        this.resetTouchNavigationState("touch-navigation-pan-touchend-reset");
      }
    }
,

    handleAuxClick(event) {
      if (event.button !== 1) {
        return;
      }

      this.markNavigationEvent(event);
    }
,

    markSpacebarEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
,

    handleKeyDown(event) {
      if (event.code !== "Space" || this.isInputFocused()) {
        return;
      }

      this.markSpacebarEvent(event);

      if (!this.isSpaceHeld) {
        this.isSpaceHeld = true;
        this.updateCursor();
      }
    }
,

    handleKeyUp(event) {
      if (event.code !== "Space" || (!this.isSpaceHeld && this.isInputFocused())) {
        return;
      }

      this.markSpacebarEvent(event);

      if (this.isSpaceHeld) {
        this.isSpaceHeld = false;
        this.updateCursor();
      }
    }
,

    handleWindowBlur() {
      this.isSpaceHeld = false;
      this.resetTouchNavigationState("touch-navigation-window-blur-reset");

      if (this.isPanning) {
        this.endPan();
      } else {
        this.updateCursor();
      }
    }
,

    isInputFocused() {
      const element = document.activeElement;

      if (!element || element === document.body) {
        return false;
      }

      const tag = element.tagName;

      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
    }
,

    updateCursor() {
      document.body?.classList.toggle("cbo-canvas-pan-active", this.isPanning);
      document.body?.classList.toggle("cbo-canvas-pan-ready", !this.isPanning && this.isSpaceHeld);

      if (this.isPanning) {
        this.canvas.style.cursor = "grabbing";
      } else if (this.isSpaceHeld) {
        this.canvas.style.cursor = "grab";
      } else {
        this.canvas.style.cursor = "";
      }
    }
,

    screenToDocumentSpace(clientX, clientY) {
      const viewportPoint = this.getCanvasViewportPoint(clientX, clientY);
      const viewportX = viewportPoint.x;
      const viewportY = viewportPoint.y;

      return {
        docX: (viewportX - this.camera.x) / this.camera.zoom,
        docY: (viewportY - this.camera.y) / this.camera.zoom,
      };
    }
,

    clampStrokeSamplePoint(x, y) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target.layerId || "") ||
        this.getFullDocumentRect(target);
      const margin = Math.max(STROKE_SAMPLE_CLAMP_MIN_PADDING, Math.ceil(this.getBrushSize() * 2));
      const safeX = Number.isFinite(x) ? x : 0;
      const safeY = Number.isFinite(y) ? y : 0;

      return {
        x: this.clamp(safeX, paintRect.x - margin, paintRect.x + paintRect.width + margin),
        y: this.clamp(safeY, paintRect.y - margin, paintRect.y + paintRect.height + margin),
      };
    }
,

    normalizePointerPressure(event, isMouse = false) {
      if (isMouse) {
        return 1.0;
      }

      const pointerType = String(event?.pointerType || "").toLowerCase();

      if (pointerType !== "pen") {
        return 1.0;
      }

      const pressure = Number(event?.pressure);

      return Number.isFinite(pressure) ? this.clamp(pressure, 0, 1) : 1.0;
    }
,

    normalizePointerTiltValue(value) {
      const tilt = Number(value);

      return Number.isFinite(tilt) ? this.clamp(tilt, -90, 90) : 0;
    }
,

    createPointerTiltFromAngles(altitudeAngle, azimuthAngle) {
      const altitude = Number(altitudeAngle);
      const azimuth = Number(azimuthAngle);

      if (!Number.isFinite(altitude) || !Number.isFinite(azimuth)) {
        return { tiltX: 0, tiltY: 0 };
      }

      if (altitude <= 0) {
        return {
          tiltX: Math.round(Math.cos(azimuth) * 90),
          tiltY: Math.round(Math.sin(azimuth) * 90),
        };
      }

      const tanAltitude = Math.tan(altitude);

      if (!Number.isFinite(tanAltitude) || tanAltitude === 0) {
        return { tiltX: 0, tiltY: 0 };
      }

      return {
        tiltX: this.normalizePointerTiltValue(Math.atan(Math.cos(azimuth) / tanAltitude) * 180 / Math.PI),
        tiltY: this.normalizePointerTiltValue(Math.atan(Math.sin(azimuth) / tanAltitude) * 180 / Math.PI),
      };
    }
,

    getPointerTilt(event, isMouse = false) {
      if (isMouse) {
        return { tiltX: 0, tiltY: 0 };
      }

      const rawTiltX = Number(event?.tiltX);
      const rawTiltY = Number(event?.tiltY);

      if (Number.isFinite(rawTiltX) || Number.isFinite(rawTiltY)) {
        return {
          tiltX: this.normalizePointerTiltValue(rawTiltX),
          tiltY: this.normalizePointerTiltValue(rawTiltY),
        };
      }

      return this.createPointerTiltFromAngles(event?.altitudeAngle, event?.azimuthAngle);
    }
,

    createPointerSample(event) {
      const { docX, docY } = this.screenToDocumentSpace(event.clientX, event.clientY);
      const isMouse = event.pointerType === "mouse";
      const point = this.clampStrokeSamplePoint(docX, docY);
      const eventTime = Number(event.timeStamp);
      const tilt = this.getPointerTilt(event, isMouse);
      const altitudeAngle = Number(event.altitudeAngle);
      const azimuthAngle = Number(event.azimuthAngle);
      const twist = Number(event.twist);

      return {
        x: point.x,
        y: point.y,
        pressure: this.normalizePointerPressure(event, isMouse),
        pointerType: event.pointerType || "",
        tiltX: tilt.tiltX,
        tiltY: tilt.tiltY,
        altitudeAngle: Number.isFinite(altitudeAngle) ? altitudeAngle : null,
        azimuthAngle: Number.isFinite(azimuthAngle) ? azimuthAngle : null,
        twist: Number.isFinite(twist) ? twist : 0,
        time: Number.isFinite(eventTime) && eventTime > 0 ? eventTime : performance.now(),
      };
    }
,

    isDocumentPointInside(point) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target.layerId || "") ||
        this.getFullDocumentRect(target);

      return (
        point.docX >= paintRect.x &&
        point.docY >= paintRect.y &&
        point.docX <= paintRect.x + paintRect.width &&
        point.docY <= paintRect.y + paintRect.height
      );
    }
,

    isDocumentPointOnAnyArtboard(point) {
      if (!point) {
        return false;
      }

      if (namespace.getDocumentArtboardAtPoint?.(point)) {
        return true;
      }

      return this.isDocumentPointInside(point);
    }
,

    shouldStartTouchCanvasPan(event, point) {
      return (
        this.isPrimaryTouchPointer(event) &&
        !this.isDrawing &&
        !this.isPanning &&
        !this.touchNavigationGesture &&
        !this.touchNavigationExclusive &&
        !this.isDocumentPointOnAnyArtboard(point)
      );
    }
,

    shouldStartSelectionTouchCanvasPan(event, point) {
      return (
        this.activeTouchPointers.size === 1 &&
        this.isSelectionToolActiveForTouchPan() &&
        this.shouldStartTouchCanvasPan(event, point) &&
        !namespace.isMobileObjectMovePointerTarget?.(event) &&
        !this.isTouchCanvasPanInteractiveTarget(event.target)
      );
    }
,

    clearSelectionForTouchCanvasPan() {
      const transformTool = namespace.rasterTransformTool;

      if (transformTool?.hasPendingTransform?.()) {
        transformTool.commitTransform?.();
      }

      namespace.documentLayerModel?.setActiveLayer?.(null, {
        history: false,
        source: "selection-touch-empty-canvas-pan-clear-layer",
      });
      transformTool?.activateLayer?.(null, { selection: true });
    }
,

    activateArtboardAtPoint(point, source = "brush-pointer-artboard") {
      if (this.usesIsolatedDocumentArtboards()) {
        return null;
      }

      return namespace.selectDocumentArtboardAtPoint?.(point, { source }) || null;
    }
,

    ensureEmptyEraserLayerToast() {
      if (typeof document === "undefined" || !document.body) {
        return null;
      }

      let toast = document.getElementById?.("cbo-eraser-empty-layer-toast") || null;

      if (!toast && typeof document.createElement === "function") {
        toast = document.createElement("div");
        toast.id = "cbo-eraser-empty-layer-toast";
        toast.className = "cbo-layer-limit-toast";
        toast.hidden = true;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
      }

      return toast;
    }
,

    showEmptyEraserLayerToast(message = "Nothing to erase on this layer") {
      const now = Date.now();

      if (now - (this.lastEmptyEraserLayerToastAt || 0) < ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS) {
        return;
      }

      const toast = this.ensureEmptyEraserLayerToast();

      if (!toast) {
        return;
      }

      this.lastEmptyEraserLayerToastAt = now;

      if (this.emptyEraserLayerToastTimer) {
        window.clearTimeout?.(this.emptyEraserLayerToastTimer);
        this.emptyEraserLayerToastTimer = 0;
      }

      toast.textContent = message;
      toast.hidden = false;
      this.emptyEraserLayerToastTimer = window.setTimeout?.(() => {
        toast.hidden = true;
        this.emptyEraserLayerToastTimer = 0;
      }, ERASER_EMPTY_LAYER_TOAST_MS) || 0;
    }
,

    cancelPendingEraserImageRasterize() {
      const cancel = this.pendingEraserImageRasterizeCancel;
      const handle = this.pendingEraserImageRasterizeHandle;

      if (handle && typeof cancel === "function") {
        cancel(handle);
      }

      this.pendingEraserImageRasterizeHandle = 0;
      this.pendingEraserImageRasterizeCancel = null;
      this.pendingEraserImageRasterizeLayerId = "";
    }
,

    scheduleActiveImageLayerRasterizeForEraser(source = "eraser-image-preflight-rasterize") {
      const layerModel = this.documentRenderer?.layerModel || namespace.documentLayerModel;
      const activeId = layerModel?.activeLayerId;
      const activeLayer = activeId && typeof layerModel?.findEntryById === "function"
        ? layerModel.findEntryById(activeId)
        : null;

      if (this.activeStrokeTool !== "eraser" || activeLayer?.type !== "image") {
        this.cancelPendingEraserImageRasterize();
        return false;
      }

      if (this.pendingEraserImageRasterizeLayerId === activeId) {
        return true;
      }

      this.cancelPendingEraserImageRasterize();

      const run = () => {
        this.pendingEraserImageRasterizeHandle = 0;
        this.pendingEraserImageRasterizeCancel = null;
        this.pendingEraserImageRasterizeLayerId = "";

        if (this.activeStrokeTool !== "eraser" || layerModel.activeLayerId !== activeId) {
          return;
        }

        this.rasterizeImageLayerForEraser(activeId, {
          source,
          requestDraw: true,
        });
      };
      const useIdleCallback = typeof window.requestIdleCallback === "function";

      this.pendingEraserImageRasterizeLayerId = activeId;
      this.pendingEraserImageRasterizeCancel = useIdleCallback
        ? window.cancelIdleCallback?.bind(window)
        : window.clearTimeout?.bind(window);
      this.pendingEraserImageRasterizeHandle = useIdleCallback
        ? window.requestIdleCallback(run, { timeout: 250 })
        : window.setTimeout(run, 0);

      return true;
    }
,

    rasterizeImageLayerForEraser(activeId, options = {}) {
      const layerModel = this.documentRenderer?.layerModel || namespace.documentLayerModel;
      const activeLayer = activeId && typeof layerModel?.findEntryById === "function"
        ? layerModel.findEntryById(activeId)
        : null;

      if (activeLayer?.type !== "image") {
        return activeLayer;
      }

      const source = options.source || "eraser-image-auto-rasterize";
      this.logEraserZoomDebug("eraser-image-rasterize-start", {
        before: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
        layerId: activeId,
        source,
      });
      const rasterizeOptions = {
        historyGroup: `eraser-image-auto-rasterize-${activeId}`,
        requestDraw: options.requestDraw === true,
        source,
      };

      if (options.deferHistoryFlush === true) {
        rasterizeOptions.deferHistoryFlush = true;
      }

      const didRasterize = typeof namespace.rasterizeImageLayerToPaint === "function"
        ? namespace.rasterizeImageLayerToPaint(activeId, rasterizeOptions)
        : layerModel.rasterizeImageLayerToPaint?.(activeId, rasterizeOptions) === true;

      if (!didRasterize) {
        this.warnEraserZoomDebug("eraser-image-rasterize-failed", {
          layerId: activeId,
          source,
        });
        return null;
      }

      this.documentRenderer?.materializeRasterTarget?.(activeId, {
        emit: false,
        invalidate: false,
        source: `${source}-materialize`,
      });
      const denseTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(activeId);

      if (
        denseTarget?.texture &&
        denseTarget?.framebuffer &&
        !this.documentRenderer?.isSparseRasterTarget?.(denseTarget)
      ) {
        denseTarget.materializedFromSparse = false;
      }
      this.documentRenderer?.invalidatePreviewCache?.(source, {
        layerId: activeId,
        lightweight: options.lightweight !== false,
      });

      if (options.requestDraw === true) {
        this.documentRenderer?.requestDraw?.();
      }

      this.logEraserZoomDebug("eraser-image-rasterize-end", {
        after: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
        layerId: activeId,
        source,
      });

      return layerModel.findEntryById(activeId);
    }
,

    getActiveRasterTargetForEraser() {
      const layerModel = this.documentRenderer?.layerModel;
      const activeId = layerModel?.activeLayerId;

      if (!activeId || typeof layerModel?.findEntryById !== "function") {
        this.warnEraserZoomDebug("eraser-target-fallback-missing-active-layer", {
          activeId: activeId || "",
        });
        return this.getPaintTarget();
      }

      let activeLayer = layerModel.findEntryById(activeId);
      this.logEraserZoomDebug("eraser-target-check-start", {
        activeLayerType: activeLayer?.type || "",
        layerId: activeId,
        state: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
      });

      if (activeLayer?.type === "image") {
        this.cancelPendingEraserImageRasterize();
        activeLayer = this.rasterizeImageLayerForEraser(activeId, {
          deferHistoryFlush: true,
          lightweight: true,
          requestDraw: false,
        });
      }

      if (activeLayer?.type !== "paint") {
        this.warnEraserZoomDebug("eraser-target-not-paint-layer", {
          activeLayerType: activeLayer?.type || "",
          layerId: activeId,
          state: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
        });
        return null;
      }

      const existingTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(activeId);
      const isEmptySparseTarget =
        this.documentRenderer?.isSparseRasterTarget?.(existingTarget) &&
        existingTarget.tiles.size === 0;

      if (!existingTarget || isEmptySparseTarget) {
        this.warnEraserZoomDebug("eraser-target-empty-before-stroke", {
          isEmptySparseTarget,
          layerId: activeId,
          state: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
          target: namespace.EraserZoomDebug?.getTargetSummary?.(existingTarget, this.documentRenderer),
        });
        this.showEmptyEraserLayerToast();
        return null;
      }

      const target = this.documentRenderer?.isSparseRasterTarget?.(existingTarget)
        ? this.documentRenderer?.materializeRasterTarget?.(activeId, {
            emit: false,
            invalidate: false,
            source: "eraser-materialize-sparse",
          })
        : existingTarget;

      if (!target?.texture || !target?.framebuffer) {
        this.warnEraserZoomDebug("eraser-target-unusable-before-stroke", {
          layerId: activeId,
          state: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
          target: namespace.EraserZoomDebug?.getTargetSummary?.(target, this.documentRenderer),
        });
        return null;
      }

      if (!this.documentRenderer?.isSparseRasterTarget?.(target)) {
        target.materializedFromSparse = false;
      }

      this.logEraserZoomDebug("eraser-target-ready", {
        layerId: activeId,
        state: namespace.EraserZoomDebug?.captureLayerState?.(activeId, { coarseOnly: true }),
        target: namespace.EraserZoomDebug?.getTargetSummary?.(target, this.documentRenderer),
      });

      return target;
    }
,

    resetStrokeProgress() {
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
      this.activeStrokeSpacingMultiplier = 1;
    }
,

    resetStrokeRuntimeState() {
      this.resetQuickLineState();
      this.cancelActiveStrokeDirtyRegionDebug();
      this.cancelStrokeTargetPrewarm();
      this.resetStrokeProgress();
      this.strokeDynamicsState = null;
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeGrainRandomState = null;
      this.velocityPressureState = null;
      this.adaptiveSpacingState = null;
      this.strokeChargeRadius = null;
      this.strokeGrainOffset = { x: 0, y: 0 };
      this.activeStrokeSymmetry = null;
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.strokeTargetLayerId = null;
      this.strokeRenderMode = null;
      this.largeBlendLivePreviewUsed = false;
      this.largeBlendFinalQualityReplay = false;
      this.currentStrokeTool = this.activeStrokeTool || "brush";
    }
,

    invalidateReplayStrokeCache() {
      this.replayStrokeCache = null;
    }
,

    roundReplayCacheNumber(value, precision = 10000) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "";
      }

      return Math.round(number * precision) / precision;
    }
,

    getReplayStrokeSamplingKey() {
      if (this.isAndroidPerformanceMode()) {
        return "android";
      }

      return this.isMobilePerformanceMode() ? "mobile" : "desktop";
    }
,

    getLargeBlendReplayQualityKey() {
      if (this.largeBlendFinalQualityReplay === true) {
        return "large-blend-final-full";
      }

      return this.shouldUseMobileLargeBlendFastPath?.() === true
        ? "large-blend-live-preview"
        : "large-blend-full";
    }
,

    getReplayStrokeSampleSignature(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        return "";
      }

      const lastIndex = rawSamples.length - 1;
      const middleIndex = Math.floor(lastIndex / 2);
      const sampleSignature = (sample) => [
        this.roundReplayCacheNumber(sample?.x, 1000),
        this.roundReplayCacheNumber(sample?.y, 1000),
        this.roundReplayCacheNumber(sample?.pressure, 1000),
        this.roundReplayCacheNumber(sample?.time, 10),
        this.roundReplayCacheNumber(sample?.tiltX, 1000),
        this.roundReplayCacheNumber(sample?.tiltY, 1000),
        this.roundReplayCacheNumber(sample?.altitudeAngle, 1000),
        this.roundReplayCacheNumber(sample?.azimuthAngle, 1000),
        this.roundReplayCacheNumber(sample?.twist, 1000),
        sample?.strokeSeed ?? "",
        sample?.pointerType || "",
      ].join(",");

      return [
        rawSamples.length,
        sampleSignature(rawSamples[0]),
        sampleSignature(rawSamples[middleIndex]),
        sampleSignature(rawSamples[lastIndex]),
      ].join("|");
    }
,

    getReplayStrokePathSettingsKey() {
      const settings = this.brushState || {};

      return [
        this.currentStrokeTool || "brush",
        this.getReplayStrokeSamplingKey(),
        this.roundReplayCacheNumber(settings.streamLineAmount ?? settings.smoothing, 10000),
        this.roundReplayCacheNumber(settings.streamLinePressure, 10000),
        this.roundReplayCacheNumber(settings.stabilizationAmount, 10000),
        this.roundReplayCacheNumber(settings.motionFilteringAmount, 10000),
        this.roundReplayCacheNumber(settings.motionFilteringExpression, 10000),
        settings.velocityPressureEnabled === true ? 1 : 0,
      ].join("|");
    }
,

    getReplayStrokeBaseSettingsKey(taperTotalLength = null) {
      const settings = this.brushState || {};
      const taperActive = taperTotalLength != null;
      const baseKeys = [
        this.getLargeBlendReplayQualityKey(),
        this.roundReplayCacheNumber(settings.radius ?? settings.size, 10000),
        this.roundReplayCacheNumber(settings.size ?? settings.radius, 10000),
        this.roundReplayCacheNumber(settings.spacing, 10000),
        this.roundReplayCacheNumber(settings.spacingJitter, 10000),
        this.roundReplayCacheNumber(settings.jitterLateral, 10000),
        this.roundReplayCacheNumber(settings.jitterLinear, 10000),
        this.roundReplayCacheNumber(settings.fallOff, 10000),
        this.roundReplayCacheNumber(settings.wetDilution, 10000),
        this.roundReplayCacheNumber(settings.wetCharge, 10000),
        this.roundReplayCacheNumber(settings.wetAttack, 10000),
        this.roundReplayCacheNumber(settings.wetnessJitter, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureCurveLow, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureCurveMid, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureCurveHigh, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureSize ?? settings.penPressureSize, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureOpacity ?? settings.penPressureOpacity, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureFlow, 10000),
        this.roundReplayCacheNumber(settings.pencilPressureBleed, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltTrigger, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltOpacity, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltGradation, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltBleed, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltSize ?? settings.penTiltSize, 10000),
        settings.pencilTiltSizeCompression === true ? 1 : 0,
        this.roundReplayCacheNumber(settings.pencilBarrelSize, 10000),
        this.roundReplayCacheNumber(settings.pencilBarrelOpacity, 10000),
        this.roundReplayCacheNumber(settings.pencilBarrelBleed, 10000),
        settings.pencilBarrelRelativeToStroke !== false ? 1 : 0,
      ];

      if (!taperActive) {
        return ["base", ...baseKeys, "taper:off"].join("|");
      }

      return [
        "base",
        ...baseKeys,
        "taper:on",
        this.roundReplayCacheNumber(taperTotalLength, 1000),
        this.roundReplayCacheNumber(settings.taperStart, 10000),
        this.roundReplayCacheNumber(settings.taperEnd, 10000),
        this.roundReplayCacheNumber(settings.taperSize, 10000),
        this.roundReplayCacheNumber(settings.taperOpacity, 10000),
        this.roundReplayCacheNumber(settings.taperPressure, 10000),
        settings.taperMinDistanceEnabled === true ? 1 : 0,
        this.roundReplayCacheNumber(settings.taperMinDistance, 10000),
        this.roundReplayCacheNumber(settings.taperTip, 10000),
      ].join("|");
    }
,

    getReplayStrokePaintKey() {
      const target = this.getDocumentDrawTarget?.(this.strokeTargetLayerId || "") || null;
      const layerId = this.strokeTargetLayerId || target?.layerId || "";
      const paintRect = this.getActiveDocumentPaintRect?.(layerId) ||
        (target ? this.getFullDocumentRect(target) : null);
      const symmetry = this.getActiveStrokeSymmetry?.() || null;
      const rectKey = paintRect
        ? [
            this.roundReplayCacheNumber(paintRect.x, 1000),
            this.roundReplayCacheNumber(paintRect.y, 1000),
            this.roundReplayCacheNumber(paintRect.width, 1000),
            this.roundReplayCacheNumber(paintRect.height, 1000),
          ].join(",")
        : "";

      return [
        layerId,
        Math.max(0, Math.round(Number(target?.width) || 0)),
        Math.max(0, Math.round(Number(target?.height) || 0)),
        rectKey,
        symmetry
          ? [
              "symmetry",
              symmetry.mode || "vertical",
              symmetry.artboardId || "",
              this.roundReplayCacheNumber(symmetry.axisX, 1000),
            ].join(":")
          : "symmetry:off",
      ].join("|");
    }
,

    getReplayExpandedSettingsKey() {
      const settings = this.brushState || {};

      return [
        "expanded",
        this.getReplayStrokePaintKey(),
        this.getLargeBlendReplayQualityKey(),
        this.shapeTextureReady && this.shapeTexture ? 1 : 0,
        this.roundReplayCacheNumber(settings.minSizeRatio, 10000),
        settings.shapeRandomized === true ? 1 : 0,
        this.roundReplayCacheNumber(settings.shapeRotation, 10000),
        this.roundReplayCacheNumber(settings.shapeScatter, 10000),
        this.roundReplayCacheNumber(settings.shapeCount, 10000),
        this.roundReplayCacheNumber(settings.shapeCountJitter, 10000),
        this.roundReplayCacheNumber(settings.pencilTiltRotation ?? settings.penTiltRotation, 10000),
        this.getGrainMode(),
        settings.grainMovingOffsetJitter !== false ? 1 : 0,
        this.roundReplayCacheNumber(settings.grainMovingRotation, 10000),
        this.roundReplayCacheNumber(settings.grainMovingDepthJitter, 10000),
        Math.max(0, Math.round(Number(this.grainImageWidth) || 0)),
        Math.max(0, Math.round(Number(this.grainImageHeight) || 0)),
      ].join("|");
    }
,

    createProcessedReplaySamples(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        return [];
      }

      const startPoint = this.beginStrokeDynamics(rawSamples[0]);
      const processedSamples = [{ ...startPoint }];

      for (let index = 1; index < rawSamples.length; index += 1) {
        processedSamples.push({ ...this.applyStabilization(rawSamples[index]) });
      }

      return processedSamples;
    }
,

    forEachReplayStrokeSegment(processedSamples, onSegment) {
      if (!Array.isArray(processedSamples) || processedSamples.length === 0) {
        return;
      }

      const currentStroke = [
        processedSamples[0],
        processedSamples[0],
        processedSamples[0],
      ];

      const emitSegment = () => {
        if (currentStroke.length !== 4) {
          return;
        }

        onSegment(currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3]);
        currentStroke.shift();
      };

      for (let index = 1; index < processedSamples.length - 1; index += 1) {
        currentStroke.push(processedSamples[index]);
        emitSegment();
      }

      const lastPoint = processedSamples[processedSamples.length - 1];

      currentStroke.push(lastPoint);
      emitSegment();
      currentStroke.push(lastPoint);
      emitSegment();
    }
,

    measureReplayStrokePathLength(processedSamples) {
      let pathLength = 0;

      this.forEachReplayStrokeSegment(processedSamples, (p0, p1, p2, p3) => {
        const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        if (segmentDistance <= 0) {
          return;
        }

        const sampleCount = this.getStrokeSegmentSampleCount(segmentDistance);
        let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

        for (let index = 1; index <= sampleCount; index += 1) {
          const point = this.catmullRom(p0, p1, p2, p3, index / sampleCount);
          const stepDistance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);

          pathLength += stepDistance;
          previousPoint = point;
        }
      });

      return pathLength;
    }
,

    getReplayStrokePathCache(rawSamples) {
      const signature = this.getReplayStrokeSampleSignature(rawSamples);
      const pathSettingsKey = this.getReplayStrokePathSettingsKey();
      const existingCache = this.replayStrokeCache;

      if (
        existingCache &&
        existingCache.rawSamples === rawSamples &&
        existingCache.signature === signature &&
        existingCache.pathSettingsKey === pathSettingsKey
      ) {
        return existingCache;
      }

      const processedSamples = this.createProcessedReplaySamples(rawSamples);
      const nextSignature = this.getReplayStrokeSampleSignature(rawSamples);
      const pathLength = this.measureReplayStrokePathLength(processedSamples);
      const nextCache = {
        rawSamples,
        signature: nextSignature,
        pathSettingsKey,
        processedSamples,
        pathLength,
        baseStampsByKey: new Map(),
      };

      this.replayStrokeCache = nextCache;
      return nextCache;
    }
,

    captureReplayBaseStamp(baseStamps, stamp, tangent) {
      const seed = this.strokeRandomState?.seed ?? this.strokeInitialSeed ?? 1;

      baseStamps.push({
        distance: this.roundReplayCacheNumber(this.strokeDistance, 1000),
        randomSeedBeforeShape: seed >>> 0,
        stamp: {
          x: stamp.x,
          y: stamp.y,
          pressure: stamp.pressure,
          alphaScale: stamp.alphaScale ?? 1,
          flowScale: stamp.flowScale ?? 1,
          bleedScale: stamp.bleedScale ?? 0,
          sizeCompressionScale: stamp.sizeCompressionScale ?? 1,
          sizeScale: stamp.sizeScale ?? 1,
          rotation: stamp.rotation ?? 0,
          pointerType: stamp.pointerType || "",
          tiltX: stamp.tiltX,
          tiltY: stamp.tiltY,
          altitudeAngle: stamp.altitudeAngle,
          azimuthAngle: stamp.azimuthAngle,
          twist: stamp.twist,
          pencilInputApplied: stamp.pencilInputApplied === true,
          penInputApplied: stamp.penInputApplied === true,
        },
        tangent: tangent ? { x: tangent.x, y: tangent.y } : null,
      });
    }
,

    buildReplayBaseStamps(pathCache, taperTotalLength = null) {
      const processedSamples = pathCache?.processedSamples || [];
      const rawSamples = pathCache?.rawSamples || [];

      if (processedSamples.length === 0 || rawSamples.length === 0) {
        return [];
      }

      const baseStamps = [];
      const hasTaper = taperTotalLength != null && taperTotalLength > 0;

      try {
        this.beginStrokeDynamics(rawSamples[0]);
        this.resetStrokeProgress();
        this.strokeTotalLength = hasTaper ? taperTotalLength : null;
        this.taperSpacingCap = hasTaper ? this.getTaperSpacingCap(taperTotalLength) : null;
        this.lastStrokeTangent = null;

        const startStamp = this.createStamp(processedSamples[0]);

        startStamp.alphaScale = this.getStampAlphaScale();
        startStamp.sizeScale = 1;
        this.applyPencilInputToStamp(startStamp, null);
        this.applyTaperToStamp(startStamp);
        this.captureReplayBaseStamp(baseStamps, startStamp, null);
        this.nextStampDistance = this.getStampSpacing(startStamp);

        this.forEachReplayStrokeSegment(processedSamples, (p0, p1, p2, p3) => {
          const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          if (segmentDistance <= 0) {
            return;
          }

          const sampleCount = this.getStrokeSegmentSampleCount(segmentDistance);
          let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

          for (let index = 1; index <= sampleCount; index += 1) {
            const t = index / sampleCount;
            const point = this.catmullRom(p0, p1, p2, p3, t);
            const stepDistance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);

            if (stepDistance > 0) {
              const tangent = {
                x: (point.x - previousPoint.x) / stepDistance,
                y: (point.y - previousPoint.y) / stepDistance,
              };

              this.lastStrokeTangent = tangent;
              this.leftoverDistance += stepDistance;

              while (this.leftoverDistance >= this.nextStampDistance) {
                const stampDistance = this.nextStampDistance;
                const overshoot = this.leftoverDistance - stampDistance;
                const distanceFromPrevious = stepDistance - overshoot;
                const stampT = Math.max(0, Math.min(1, distanceFromPrevious / stepDistance));
                const stamp = this.applyStampJitter(this.lerpStamp(previousPoint, point, stampT), tangent);

                this.strokeDistance += stampDistance;
                stamp.alphaScale = this.getStampAlphaScale();
                stamp.sizeScale = 1;
                this.applyPencilInputToStamp(stamp, tangent);
                this.applyTaperToStamp(stamp);
                this.captureReplayBaseStamp(baseStamps, stamp, tangent);
                this.leftoverDistance -= stampDistance;
                this.nextStampDistance = this.getStampSpacing(stamp);
              }
            }

            previousPoint = point;
          }
        });

        if (hasTaper && processedSamples.length > 1) {
          const lastPoint = processedSamples[processedSamples.length - 1];
          const finalStamp = this.createStamp(lastPoint);

          this.strokeDistance = this.clamp(taperTotalLength, 0, taperTotalLength);
          finalStamp.alphaScale = this.getStampAlphaScale();
          finalStamp.sizeScale = 1;
          this.applyPencilInputToStamp(finalStamp, this.lastStrokeTangent);
          this.applyTaperToStamp(finalStamp);
          this.captureReplayBaseStamp(baseStamps, finalStamp, this.lastStrokeTangent);
        }
      } finally {
        this.strokeTotalLength = null;
        this.taperSpacingCap = null;
      }

      return baseStamps;
    }
,

    getReplayStrokeRenderPlan(rawSamples) {
      const pathCache = this.getReplayStrokePathCache(rawSamples);
      const taperTotalLength =
        this.isTaperActive() && rawSamples.length > 1 && pathCache.pathLength > 0
          ? pathCache.pathLength
          : null;
      const baseSettingsKey = this.getReplayStrokeBaseSettingsKey(taperTotalLength);
      const baseStampsByKey = pathCache.baseStampsByKey || new Map();
      const cachedBase = baseStampsByKey.get(baseSettingsKey);

      pathCache.baseStampsByKey = baseStampsByKey;

      if (cachedBase) {
        return cachedBase;
      }

      const baseStamps = this.buildReplayBaseStamps(pathCache, taperTotalLength);
      const plan = {
        baseStamps,
        taperTotalLength,
        expandedStampsByKey: new Map(),
      };

      baseStampsByKey.set(baseSettingsKey, plan);
      while (baseStampsByKey.size > 16) {
        baseStampsByKey.delete(baseStampsByKey.keys().next().value);
      }

      return plan;
    }
,

    buildReplayExpandedStamps(baseStamps) {
      if (!Array.isArray(baseStamps) || baseStamps.length === 0) {
        return [];
      }

      const previousStampsBuffer = this.stampsBuffer;
      const previousStrokeStampCount = this.strokeStampCount;
      const previousStrokeDistance = this.strokeDistance;
      const previousLastStrokeTangent = this.lastStrokeTangent;

      this.stampsBuffer = [];
      this.strokeStampCount = 0;
      this.strokeDistance = 0;
      this.lastStrokeTangent = null;

      try {
        baseStamps.forEach((baseStamp) => {
          const tangent = baseStamp.tangent ? { ...baseStamp.tangent } : null;

          if (tangent) {
            this.applyPendingShapeRotation(tangent);
            this.lastStrokeTangent = tangent;
          }

          this.strokeDistance = Number(baseStamp.distance) || 0;
          this.strokeRandomState = {
            seed: (baseStamp.randomSeedBeforeShape || this.strokeInitialSeed || 1) >>> 0,
          };

          this.pushShapeStamps({ ...baseStamp.stamp }, tangent, {
            assignColor: false,
            includeBounds: false,
          });
        });

        return this.stampsBuffer.map((stamp) => ({ ...stamp }));
      } finally {
        this.stampsBuffer = previousStampsBuffer;
        this.strokeStampCount = previousStrokeStampCount;
        this.strokeDistance = previousStrokeDistance;
        this.lastStrokeTangent = previousLastStrokeTangent;
      }
    }
,

    getReplayExpandedStamps(replayPlan) {
      const baseStamps = replayPlan?.baseStamps || [];

      if (!Array.isArray(baseStamps) || baseStamps.length === 0) {
        return [];
      }

      const expandedSettingsKey = this.getReplayExpandedSettingsKey();
      const expandedStampsByKey = replayPlan.expandedStampsByKey || new Map();
      const cachedExpanded = expandedStampsByKey.get(expandedSettingsKey);

      replayPlan.expandedStampsByKey = expandedStampsByKey;

      if (cachedExpanded) {
        return cachedExpanded.expandedStamps;
      }

      const expandedStamps = this.buildReplayExpandedStamps(baseStamps);
      const cacheEntry = { expandedStamps };

      expandedStampsByKey.set(expandedSettingsKey, cacheEntry);
      while (expandedStampsByKey.size > 8) {
        expandedStampsByKey.delete(expandedStampsByKey.keys().next().value);
      }

      return expandedStamps;
    }
,

    renderReplayExpandedStamps(expandedStamps) {
      if (!Array.isArray(expandedStamps) || expandedStamps.length === 0) {
        return;
      }

      this.resetStrokeProgress();

      expandedStamps.forEach((expandedStamp) => {
        const stamp = { ...expandedStamp };

        stamp.colorRgb = this.getNextStampColorRgb();
        this.includeStrokeStampBounds(stamp);
        this.stampsBuffer.push(stamp);

        if (this.stampsBuffer.length >= this.getMaxStampsPerFlush()) {
          this.flushStamps({ requestDraw: false });
        }
      });

      this.flushStamps({ requestDraw: false });
    }
,

    renderReplayBaseStamps(baseStamps) {
      this.renderReplayExpandedStamps(this.buildReplayExpandedStamps(baseStamps));
    }
,

    replayLastStroke() {
      if (!this.lastRecordedStroke || this.lastRecordedStroke.length === 0) {
        return;
      }

      this.replayStroke(this.lastRecordedStroke);
    }
,

    pushForcedTaperStamp(point, distanceFromStart) {
      if (!point || this.strokeTotalLength == null) {
        return;
      }

      this.strokeDistance = this.clamp(distanceFromStart, 0, this.strokeTotalLength);

      const stamp = this.createStamp(point);

      stamp.alphaScale = this.getStampAlphaScale();
      stamp.sizeScale = 1;
      this.applyPencilInputToStamp(stamp, this.lastStrokeTangent);
      this.applyTaperToStamp(stamp);
      this.pushShapeStamps(stamp, this.lastStrokeTangent);
    }
,

    regenerateStrokeWithTaper(rawSamples, totalLength) {
      // Re-emette gli stamp del tratto su strokeFBO con il taper completo (start + end).
      // NON tocca il base layer: chiamato durante pointerup PRIMA del bake.
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || totalLength <= 0) {
        return;
      }

      const StrokeMath = namespace.StrokeMath;
      const firstSample = rawSamples[0];
      const point = { x: firstSample.x, y: firstSample.y };
      const inputPressure = StrokeMath?.normalizePressure
        ? StrokeMath.normalizePressure(firstSample.pressure)
        : firstSample.pressure;

      // Riusiamo il seed iniziale dello stroke originale per riprodurre l'identica
      // sequenza di jitter spaziale (lateral/linear/spacing) e colore.
      this.releaseStrokeLayerTarget();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.strokeRandomState = { seed: this.strokeInitialSeed };
      this.initializeStrokeColorDynamics(this.strokeInitialSeed);
      this.initializeWetMixRandom(this.strokeInitialSeed);
      this.initializeGrainDynamics(this.strokeInitialSeed);
      this.strokeDynamicsState = StrokeMath?.createStrokeState
        ? StrokeMath.createStrokeState(point, {
            pressure: inputPressure,
            seed: this.strokeInitialSeed,
            time: firstSample.time,
            tool: "brush",
          })
        : null;
      this.initializeVelocityPressureState(firstSample);
      const startPoint = {
        ...firstSample,
        pressure: this.resolveSamplePressure(firstSample, inputPressure),
      };

      this.strokeTotalLength = totalLength;
      this.taperSpacingCap = this.getTaperSpacingCap(totalLength);
      this.resetStrokeProgress();
      const startStamp = this.createStamp(startPoint);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.applyPencilInputToStamp(startStamp, null);
      this.applyTaperToStamp(startStamp);
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing(startStamp);
      this.currentStroke = [startPoint, startPoint, startPoint];

      for (let index = 1; index < rawSamples.length - 1; index += 1) {
        const stableSample = this.applyStabilization(rawSamples[index]);

        this.currentStroke.push(stableSample);
        this.processStamps();
      }

      const lastRaw = rawSamples[rawSamples.length - 1];
      const lastPoint = rawSamples.length > 1 ? this.applyStabilization(lastRaw) : startPoint;

      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.pushForcedTaperStamp(lastPoint, totalLength);
      this.flushStamps();

      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
    }
,

    shouldRegenerateLargeBlendFinalQuality(rawSamples = this.recordedStroke) {
      const fullQualityBakeEnabled =
        namespace.mobileLargeBlendFullQualityBake === true ||
        namespace.androidLargeBlendFullQualityBake === true;

      return (
        fullQualityBakeEnabled &&
        this.largeBlendLivePreviewUsed === true &&
        Array.isArray(rawSamples) &&
        rawSamples.length > 0
      );
    }
,

    getLargeBlendFinalReplayLimits() {
      const configuredMaxStamps = Number(
        namespace.mobileLargeBlendFinalReplayMaxStamps ??
        namespace.androidLargeBlendFinalReplayMaxStamps,
      );
      const configuredMaxMP = Number(
        namespace.mobileLargeBlendFinalReplayMaxMP ??
        namespace.androidLargeBlendFinalReplayMaxMP,
      );

      return {
        maxEstimatedStamps: Number.isFinite(configuredMaxStamps) && configuredMaxStamps > 0
          ? Math.round(configuredMaxStamps)
          : (this.isAndroidPerformanceMode?.() ? 384 : 512),
        maxEstimatedMP: Number.isFinite(configuredMaxMP) && configuredMaxMP > 0
          ? configuredMaxMP
          : (this.isAndroidPerformanceMode?.() ? 96 : 128),
      };
    }
,

    estimateLargeBlendFinalReplayFromLive() {
      const previousFinalQualityReplay = this.largeBlendFinalQualityReplay === true;
      const liveStamps = Math.max(
        0,
        Math.round(Number(this.strokeStampCount) || 0) +
          Math.round(Number(this.stampsBuffer?.length) || 0),
      );
      const liveShapeCount = Math.max(1, Math.round(Number(this.getEffectiveShapeCount?.(() => 0.999999)) || 1));
      const liveSpacing = Math.max(0.5, Number(this.getStampSpacing?.()) || 0.5);
      let finalShapeCount = liveShapeCount;
      let finalSpacing = liveSpacing;

      this.largeBlendFinalQualityReplay = true;

      try {
        finalShapeCount = Math.max(1, Math.round(Number(this.getEffectiveShapeCount?.(() => 0.999999)) || liveShapeCount));
        finalSpacing = Math.max(0.5, Number(this.getStampSpacing?.()) || liveSpacing);
      } finally {
        this.largeBlendFinalQualityReplay = previousFinalQualityReplay;
      }

      const spacingFactor = Math.max(1, liveSpacing / finalSpacing);
      const shapeFactor = Math.max(1, finalShapeCount / liveShapeCount);
      const estimatedStamps = Math.ceil(liveStamps * spacingFactor * shapeFactor);
      const brushSize = Math.max(0, Number(this.getBrushSize?.()) || 0);
      const drawPasses = this.getBrushStrokeRenderMode?.() === STROKE_RENDER_MODE_MIXED ? 2 : 1;
      const estimatedMP = estimatedStamps * brushSize * brushSize * drawPasses / 1000000;
      const limits = this.getLargeBlendFinalReplayLimits();
      const allowed = estimatedStamps <= limits.maxEstimatedStamps && estimatedMP <= limits.maxEstimatedMP;

      return {
        allowed,
        drawPasses,
        estimatedMP: this.roundEraserDebugValue(estimatedMP, 2),
        estimatedStamps,
        finalShapeCount,
        finalSpacing: this.roundEraserDebugValue(finalSpacing, 2),
        liveShapeCount,
        liveSpacing: this.roundEraserDebugValue(liveSpacing, 2),
        liveStamps,
        maxEstimatedMP: limits.maxEstimatedMP,
        maxEstimatedStamps: limits.maxEstimatedStamps,
        reason: allowed ? "safe" : "too-expensive",
      };
    }
,

    createSkippedLargeBlendFinalReplayReport(preflight, startedAt = this.getNow()) {
      return {
        durationMs: this.roundEraserDebugValue(this.getNow() - startedAt, 2),
        estimatedMP: preflight?.estimatedMP ?? 0,
        estimatedStamps: preflight?.estimatedStamps ?? 0,
        maxEstimatedMP: preflight?.maxEstimatedMP ?? 0,
        maxEstimatedStamps: preflight?.maxEstimatedStamps ?? 0,
        reason: preflight?.reason || "too-expensive",
        shapeCount: preflight?.finalShapeCount ?? this.getShapeCount?.(),
        shapeCountEffective: preflight?.liveShapeCount ?? this.getEffectiveShapeCount?.(() => 0.999999),
        spacing: preflight?.liveSpacing ?? this.roundEraserDebugValue(this.getStampSpacing?.(), 2),
        status: "skipped",
        strokeStamps: this.strokeStampCount,
        tool: this.currentStrokeTool || "brush",
      };
    }
,

    regenerateLargeBlendStrokeForFinalBake(rawSamples) {
      if (!this.shouldRegenerateLargeBlendFinalQuality(rawSamples)) {
        return null;
      }

      const startedAt = this.getNow();
      const preflight = this.estimateLargeBlendFinalReplayFromLive();

      if (!preflight.allowed) {
        const skippedReport = this.createSkippedLargeBlendFinalReplayReport(preflight, startedAt);

        this.lastLargeBlendFinalQualityReplay = skippedReport;
        return skippedReport;
      }

      const previousFinalQualityReplay = this.largeBlendFinalQualityReplay === true;
      const previousTaperSpacingCap = this.taperSpacingCap;
      const previousStrokeTotalLength = this.strokeTotalLength;
      const firstSample = rawSamples[0];

      this.largeBlendFinalQualityReplay = true;

      try {
        const replayPlan = this.getReplayStrokeRenderPlan(rawSamples);
        const expandedStamps = this.getReplayExpandedStamps(replayPlan);

        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        this.activeStrokeBounds = null;
        this.activeStrokeTilePatchRects = null;
        this.strokePreviewDirtyRects = null;
        this.lastStrokePreviewDirtyRects = null;

        this.beginStrokeDynamics(firstSample);
        this.renderReplayExpandedStamps(expandedStamps);

        const report = {
          baseStamps: Math.max(0, replayPlan?.baseStamps?.length || 0),
          durationMs: this.roundEraserDebugValue(this.getNow() - startedAt, 2),
          estimatedMP: preflight.estimatedMP,
          estimatedStamps: preflight.estimatedStamps,
          expandedStamps: Math.max(0, expandedStamps.length || 0),
          shapeCount: this.getShapeCount(),
          shapeCountEffective: this.getEffectiveShapeCount(() => 0.999999),
          spacing: this.roundEraserDebugValue(this.getStampSpacing(), 2),
          status: "rendered",
          strokeStamps: this.strokeStampCount,
          taper: replayPlan?.taperTotalLength != null,
          tool: this.currentStrokeTool || "brush",
        };

        this.lastLargeBlendFinalQualityReplay = report;
        return report;
      } finally {
        this.largeBlendFinalQualityReplay = previousFinalQualityReplay;
        this.strokeTotalLength = previousStrokeTotalLength;
        this.taperSpacingCap = previousTaperSpacingCap;
      }
    }
,

    replayStroke(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || this.isDrawing) {
        return;
      }

      this.clearAllLayers();
      this.resetStrokeAllocationDiagnostics();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;

      const firstSample = rawSamples[0];

      this.isDrawing = true;

      try {
        const replayPlan = this.getReplayStrokeRenderPlan(rawSamples);

        this.beginStrokeDynamics(firstSample);
        this.renderReplayExpandedStamps(this.getReplayExpandedStamps(replayPlan));
        this.bakeStroke();
      } catch {
      } finally {
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        this.resetStrokeRuntimeState();
        this.isDrawing = false;

        if (this.options.manualRender) {
          this.draw();
        } else {
          this.requestDraw();
        }
      }
    }
,

    renderSyntheticStroke(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        return;
      }

      this.lastRecordedStroke = rawSamples.map((sample) => ({ ...sample }));
      this.invalidateReplayStrokeCache();
      this.replayStroke(this.lastRecordedStroke);
    }
,

    getPointerEventSamples(event) {
      const events = typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : null;
      const sourceEvents = Array.isArray(events) && events.length > 0 ? events : [event];

      return sourceEvents.map((sourceEvent) => this.createPointerSample(sourceEvent));
    }
,

    createStrokeInputStats(firstSample = null) {
      const startTime = Number(firstSample?.time);

      return {
        avgSpeed: 0,
        coalescedSamples: 0,
        droppedSamples: 0,
        durationMs: 0,
        frameBudgetHits: 0,
        lastSample: firstSample ? { ...firstSample } : null,
        maxPendingSamples: 0,
        maxSegmentDistance: 0,
        moveEvents: 0,
        pathDistance: 0,
        pointerUpDrainSamples: 0,
        processedSamples: 0,
        rawSamples: firstSample ? 1 : 0,
        startTime: Number.isFinite(startTime) ? startTime : this.getNow(),
      };
    }
,

    updateStrokeInputStats(samples = [], options = {}) {
      if (!Array.isArray(samples) || samples.length === 0) {
        return null;
      }

      if (!this.strokeInputStats) {
        this.strokeInputStats = this.createStrokeInputStats();
      }

      const stats = this.strokeInputStats;
      let batchPathDistance = 0;
      let batchMaxSegmentDistance = 0;

      if (options.eventType === "move") {
        stats.moveEvents += 1;
        stats.coalescedSamples += Math.max(0, samples.length - 1);
      }

      stats.rawSamples += samples.length;

      samples.forEach((sample) => {
        if (stats.lastSample) {
          const distance = Math.hypot(sample.x - stats.lastSample.x, sample.y - stats.lastSample.y);

          batchPathDistance += distance;
          batchMaxSegmentDistance = Math.max(batchMaxSegmentDistance, distance);
          stats.pathDistance += distance;
          stats.maxSegmentDistance = Math.max(stats.maxSegmentDistance, distance);
        }

        stats.lastSample = { ...sample };
      });

      const lastTime = Number(stats.lastSample?.time);
      const durationMs = Number.isFinite(lastTime)
        ? Math.max(0, lastTime - stats.startTime)
        : 0;

      stats.durationMs = durationMs;
      stats.avgSpeed = durationMs > 0 ? stats.pathDistance / durationMs : 0;

      return {
        batchMaxSegmentDistance,
        batchPathDistance,
        sampleCount: samples.length,
        stats: this.getStrokeInputStatsSnapshot(),
      };
    }
,

    getStrokeInputStatsSnapshot() {
      const stats = this.strokeInputStats;

      if (!stats) {
        return null;
      }

      return {
        avgSpeed: Math.round((Number(stats.avgSpeed) || 0) * 100) / 100,
        coalescedSamples: Math.max(0, Math.round(Number(stats.coalescedSamples) || 0)),
        droppedSamples: Math.max(0, Math.round(Number(stats.droppedSamples) || 0)),
        durationMs: Math.round((Number(stats.durationMs) || 0) * 10) / 10,
        frameBudgetHits: Math.max(0, Math.round(Number(stats.frameBudgetHits) || 0)),
        maxPendingSamples: Math.max(0, Math.round(Number(stats.maxPendingSamples) || 0)),
        maxSegmentDistance: Math.round((Number(stats.maxSegmentDistance) || 0) * 10) / 10,
        moveEvents: Math.max(0, Math.round(Number(stats.moveEvents) || 0)),
        pathDistance: Math.round((Number(stats.pathDistance) || 0) * 10) / 10,
        pointerUpDrainSamples: Math.max(0, Math.round(Number(stats.pointerUpDrainSamples) || 0)),
        processedSamples: Math.max(0, Math.round(Number(stats.processedSamples) || 0)),
        rawSamples: Math.max(0, Math.round(Number(stats.rawSamples) || 0)),
      };
    }
,

    enqueuePointerMoveSamples(event) {
      const samples = this.getPointerEventSamples(event);

      if (samples.length === 0) {
        return false;
      }

      if (!Array.isArray(this.pendingPointerSamples)) {
        this.pendingPointerSamples = [];
      }

      if (!Array.isArray(this.recordedStroke)) {
        this.recordedStroke = [];
      }

      this.updateStrokeInputStats(samples, { eventType: "move" });

      this.recordedStroke.push(...samples);
      this.pendingPointerSamples.push(...samples);
      if (this.strokeInputStats) {
        this.strokeInputStats.maxPendingSamples = Math.max(
          this.strokeInputStats.maxPendingSamples || 0,
          this.pendingPointerSamples.length,
        );
      }

      return true;
    }
,

    takePointerSamplesForFrame(options = {}) {
      if (!Array.isArray(this.pendingPointerSamples) || this.pendingPointerSamples.length === 0) {
        return [];
      }

      if (options.drainAll === true) {
        return this.pendingPointerSamples.splice(0);
      }

      const budget = Math.max(1, Math.round(Number(options.maxSamples) || this.getPointerSamplesPerFrame()));

      if (this.pendingPointerSamples.length <= budget) {
        return this.pendingPointerSamples.splice(0);
      }

      const backlogLimit = budget * POINTER_SAMPLE_BACKLOG_MULTIPLIER;

      if (this.pendingPointerSamples.length <= backlogLimit) {
        return this.pendingPointerSamples.splice(0, budget);
      }

      const pendingSamples = this.pendingPointerSamples.length;
      const result = this.pendingPointerSamples.splice(0, budget);

      namespace.lastBrushPointerBacklogDrop = {
        backlogPreserved: true,
        droppedSamples: 0,
        keptSamples: result.length,
        pendingSamples,
        remainingSamples: this.pendingPointerSamples.length,
        timestamp: Date.now(),
      };
      if (this.strokeInputStats) {
        this.strokeInputStats.maxPendingSamples = Math.max(
          this.strokeInputStats.maxPendingSamples || 0,
          pendingSamples,
        );
      }
      return result;
    }
,

    processPendingPointerSamples(options = {}) {
      if (!this.isDrawing || !Array.isArray(this.pendingPointerSamples) || this.pendingPointerSamples.length === 0) {
        return false;
      }

      const samples = this.takePointerSamplesForFrame(options);
      const frameBudgetMs = options.drainAll === true ? Infinity : this.getPointerFrameBudgetMs();
      const startedAt = this.getNow();
      let processedCount = 0;

      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];

        this.currentStroke.push(this.applyStabilization(sample));
        this.processStamps({ deferFlush: true });
        processedCount += 1;

        if (
          index < samples.length - 1 &&
          Number.isFinite(frameBudgetMs) &&
          this.getNow() - startedAt >= frameBudgetMs
        ) {
          this.pendingPointerSamples.unshift(...samples.slice(index + 1));
          if (this.strokeInputStats) {
            this.strokeInputStats.frameBudgetHits += 1;
          }
          namespace.lastBrushPointerFrameBudget = {
            budgetMs: frameBudgetMs,
            processedSamples: processedCount,
            remainingSamples: this.pendingPointerSamples.length,
            timestamp: Date.now(),
          };
          break;
        }
      }

      if (this.strokeInputStats) {
        this.strokeInputStats.processedSamples += processedCount;
        if (options.drainAll === true) {
          this.strokeInputStats.pointerUpDrainSamples += processedCount;
        }
      }

      if (processedCount > 0 && options.flush !== false) {
        this.flushStamps({ requestDraw: options.requestDraw !== false });
      }

      if (this.pendingPointerSamples.length > 0) {
        this.requestDraw();
      }

      return processedCount > 0;
    }
,

    clearPendingPointerSamples() {
      if (Array.isArray(this.pendingPointerSamples)) {
        this.pendingPointerSamples.length = 0;
      } else {
        this.pendingPointerSamples = [];
      }
    }
,

    isQuickLineEnabled() {
      return namespace.quickLineEnabled !== false;
    }
,

    clearQuickLineHoldTimer() {
      if (!this.quickLineHoldTimer) {
        return;
      }

      window.clearTimeout?.(this.quickLineHoldTimer);
      this.quickLineHoldTimer = 0;
    }
,

    cancelQuickShapePreviewFrame() {
      if (this.quickShapePreviewTimer) {
        window.clearTimeout?.(this.quickShapePreviewTimer);
        this.quickShapePreviewTimer = 0;
      }

      if (!this.quickShapePreviewFrame) {
        this.quickShapePendingSample = null;
        return;
      }

      if (window.cancelAnimationFrame) {
        window.cancelAnimationFrame(this.quickShapePreviewFrame);
      } else {
        window.clearTimeout?.(this.quickShapePreviewFrame);
      }

      this.quickShapePreviewFrame = 0;
      this.quickShapePendingSample = null;
    }
,

    resetQuickLineState() {
      this.clearQuickLineHoldTimer();
      this.cancelQuickShapePreviewFrame();
      this.quickLineState = null;
      this.quickShapeLastPreviewAt = 0;
      this.quickShapeLastPreviewDurationMs = 0;
    }
,

    isQuickLineActive() {
      return this.quickLineState?.active === true;
    }
,

    getQuickShapePreviewMinIntervalMs() {
      const configured = Number(namespace.quickShapePreviewMinIntervalMs);

      if (Number.isFinite(configured) && configured >= 0) {
        return configured;
      }

      const lastDuration = Math.max(0, Number(this.quickShapeLastPreviewDurationMs) || 0);
      const baseInterval = Number.isFinite(Number(QUICK_SHAPE_PREVIEW_MIN_INTERVAL_MS))
        ? QUICK_SHAPE_PREVIEW_MIN_INTERVAL_MS
        : 34;
      const maxInterval = Number.isFinite(Number(QUICK_SHAPE_PREVIEW_MAX_INTERVAL_MS))
        ? QUICK_SHAPE_PREVIEW_MAX_INTERVAL_MS
        : 96;

      if (lastDuration <= 10) {
        return baseInterval;
      }

      return this.clamp(lastDuration * 2, baseInterval, maxInterval);
    }
,

    canScheduleQuickLineHold() {
      return (
        this.isQuickLineEnabled() &&
        this.isDrawing === true &&
        this.currentStrokeTool !== "eraser" &&
        this.isQuickLineActive() !== true &&
        this.incrementalStrokeBakeCount === 0 &&
        !this.incrementalStrokeBakedRect
      );
    }
,

    scheduleQuickLineHold() {
      this.clearQuickLineHoldTimer();

      if (!this.canScheduleQuickLineHold()) {
        return false;
      }

      const configuredDelay = Number(namespace.quickLineHoldDelayMs);
      const holdDelay = Number.isFinite(configuredDelay) && configuredDelay >= 0
        ? configuredDelay
        : QUICK_LINE_HOLD_DELAY_MS;

      this.quickLineHoldTimer = window.setTimeout?.(() => {
        this.quickLineHoldTimer = 0;
        this.tryActivateQuickLine("hold");
      }, holdDelay) || 0;

      return this.quickLineHoldTimer !== 0;
    }
,

    deferQuickShapePreviewSample(rawSample) {
      const sample = this.cloneQuickLineSample(rawSample);

      if (!sample || !this.isQuickLineActive()) {
        return false;
      }

      this.quickShapePendingSample = sample;

      if (this.quickShapePreviewFrame || this.quickShapePreviewTimer) {
        return true;
      }

      const runPreview = () => {
        this.quickShapePreviewFrame = 0;
        const pendingSample = this.quickShapePendingSample;

        this.quickShapePendingSample = null;

        if (!pendingSample || !this.isQuickLineActive()) {
          return;
        }

        this.updateQuickLinePreviewFromSample(pendingSample, { immediate: true });
      };
      const requestFrame = window.requestAnimationFrame ||
        ((callback) => window.setTimeout?.(callback, 16) || 0);
      const now = this.getNow();
      const lastPreviewAt = Number(this.quickShapeLastPreviewAt) || 0;
      const elapsed = Math.max(0, now - lastPreviewAt);
      const delay = Math.max(0, this.getQuickShapePreviewMinIntervalMs() - elapsed);

      if (delay > 1) {
        this.quickShapePreviewTimer = window.setTimeout?.(() => {
          this.quickShapePreviewTimer = 0;

          if (!this.quickShapePendingSample || !this.isQuickLineActive()) {
            this.quickShapePendingSample = null;
            return;
          }

          this.quickShapePreviewFrame = requestFrame(runPreview);
        }, delay) || 0;

        return this.quickShapePreviewTimer !== 0;
      }

      this.quickShapePreviewFrame = requestFrame(runPreview);

      return this.quickShapePreviewFrame !== 0;
    }
,

    cloneQuickLineSample(sample) {
      const x = Number(sample?.x);
      const y = Number(sample?.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      const pressure = Number(sample?.pressure);
      const tiltX = Number(sample?.tiltX);
      const tiltY = Number(sample?.tiltY);
      const altitudeAngle = Number(sample?.altitudeAngle);
      const azimuthAngle = Number(sample?.azimuthAngle);
      const twist = Number(sample?.twist);
      const time = Number(sample?.time);
      const strokeSeed = Number(sample?.strokeSeed);
      const clone = {
        x,
        y,
        pressure: Number.isFinite(pressure) ? pressure : 1,
        pointerType: sample?.pointerType || "",
        tiltX: Number.isFinite(tiltX) ? tiltX : 0,
        tiltY: Number.isFinite(tiltY) ? tiltY : 0,
        altitudeAngle: Number.isFinite(altitudeAngle) ? altitudeAngle : null,
        azimuthAngle: Number.isFinite(azimuthAngle) ? azimuthAngle : null,
        twist: Number.isFinite(twist) ? twist : 0,
        time: Number.isFinite(time) ? time : this.getNow(),
      };

      if (Number.isFinite(strokeSeed)) {
        clone.strokeSeed = strokeSeed >>> 0;
      }

      return clone;
    }
,

    getQuickLineSourceSamples(rawSamples = this.recordedStroke) {
      const samples = Array.isArray(rawSamples)
        ? rawSamples.map((sample) => this.cloneQuickLineSample(sample)).filter(Boolean)
        : [];

      if (samples.length <= QUICK_LINE_MAX_SOURCE_SAMPLES) {
        return samples;
      }

      const reduced = [];
      const maxIndex = samples.length - 1;
      let previousIndex = -1;

      for (let index = 0; index < QUICK_LINE_MAX_SOURCE_SAMPLES; index += 1) {
        const sourceIndex = Math.round((index / (QUICK_LINE_MAX_SOURCE_SAMPLES - 1)) * maxIndex);

        if (sourceIndex === previousIndex) {
          continue;
        }

        reduced.push({ ...samples[sourceIndex] });
        previousIndex = sourceIndex;
      }

      return reduced;
    }
,

    measureQuickLinePathLength(samples) {
      if (!Array.isArray(samples) || samples.length < 2) {
        return 0;
      }

      let pathLength = 0;

      for (let index = 1; index < samples.length; index += 1) {
        pathLength += Math.hypot(
          samples[index].x - samples[index - 1].x,
          samples[index].y - samples[index - 1].y,
        );
      }

      return pathLength;
    }
,

    getQuickShapeTValues(sourceSamples = this.recordedStroke) {
      const samples = this.getQuickLineSourceSamples(sourceSamples);

      if (samples.length <= 1) {
        return samples.map(() => 0);
      }

      const pathLength = Math.max(0.0001, this.measureQuickLinePathLength(samples));
      let traveled = 0;

      return samples.map((sample, index) => {
        if (index === 0) {
          return 0;
        }

        traveled += Math.hypot(
          sample.x - samples[index - 1].x,
          sample.y - samples[index - 1].y,
        );

        return index === samples.length - 1
          ? 1
          : this.clamp(traveled / pathLength, 0, 1);
      });
    }
,

    measureQuickEllipseCircumference(radiusX, radiusY) {
      const a = Math.max(0.0001, Math.abs(Number(radiusX) || 0));
      const b = Math.max(0.0001, Math.abs(Number(radiusY) || 0));
      const h = ((a - b) * (a - b)) / ((a + b) * (a + b));

      return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    }
,

    analyzeQuickLineStroke(rawSamples = this.recordedStroke) {
      const samples = this.getQuickLineSourceSamples(rawSamples);

      if (samples.length < 2) {
        return { eligible: false, reason: "not-enough-samples" };
      }

      const start = samples[0];
      const end = samples[samples.length - 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lineDistance = Math.hypot(dx, dy);
      const screenScale = Math.max(0.0001, Number(this.camera?.zoom) || 1);
      const screenDistance = lineDistance * screenScale;

      if (screenDistance < QUICK_LINE_MIN_SCREEN_DISTANCE) {
        return {
          eligible: false,
          lineDistance,
          reason: "too-short",
          screenDistance,
        };
      }

      const pathLength = this.measureQuickLinePathLength(samples);

      if (pathLength <= 0) {
        return { eligible: false, lineDistance, reason: "empty-path", screenDistance };
      }

      const pathRatio = pathLength / Math.max(lineDistance, 0.0001);

      if (pathRatio > QUICK_LINE_MAX_PATH_RATIO) {
        return {
          eligible: false,
          lineDistance,
          pathLength,
          pathRatio,
          reason: "too-curved",
          screenDistance,
        };
      }

      let maxDeviation = 0;
      let totalDeviation = 0;

      for (let index = 1; index < samples.length - 1; index += 1) {
        const sample = samples[index];
        const deviation = Math.abs((sample.x - start.x) * dy - (sample.y - start.y) * dx) / lineDistance;

        maxDeviation = Math.max(maxDeviation, deviation);
        totalDeviation += deviation;
      }

      const allowedScreenDeviation = this.clamp(
        screenDistance * QUICK_LINE_DEVIATION_SCREEN_FRACTION,
        QUICK_LINE_MIN_SCREEN_DEVIATION,
        QUICK_LINE_MAX_SCREEN_DEVIATION,
      );
      const allowedDeviation = allowedScreenDeviation / screenScale;

      if (maxDeviation > allowedDeviation) {
        return {
          allowedDeviation,
          eligible: false,
          lineDistance,
          maxDeviation,
          pathLength,
          pathRatio,
          reason: "too-wobbly",
          screenDistance,
        };
      }

      return {
        allowedDeviation,
        averageDeviation: samples.length > 2 ? totalDeviation / (samples.length - 2) : 0,
        eligible: true,
        end: { ...end },
        lineDistance,
        maxDeviation,
        pathLength,
        pathRatio,
        screenDistance,
        start: { ...start },
      };
    }
,

    createQuickLineSamples(sourceSamples = this.recordedStroke, tValues = null) {
      const samples = this.getQuickLineSourceSamples(sourceSamples);

      if (samples.length < 2) {
        return samples;
      }

      const start = samples[0];
      const end = samples[samples.length - 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;

      const normalizedTValues =
        Array.isArray(tValues) && tValues.length === samples.length
          ? tValues
          : this.getQuickShapeTValues(samples);

      return samples.map((sample, index) => {
        const rawT = normalizedTValues[index];
        const t = index === 0
          ? 0
          : index === samples.length - 1
            ? 1
            : this.clamp(
                Number.isFinite(Number(rawT)) ? Number(rawT) : index / (samples.length - 1),
                0,
                1,
              );

        return {
          ...sample,
          x: start.x + dx * t,
          y: start.y + dy * t,
        };
      });
    }
,

    getQuickShapeSampleBounds(samples) {
      if (!Array.isArray(samples) || samples.length === 0) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      samples.forEach((sample) => {
        minX = Math.min(minX, sample.x);
        minY = Math.min(minY, sample.y);
        maxX = Math.max(maxX, sample.x);
        maxY = Math.max(maxY, sample.y);
      });

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
      }

      return {
        center: {
          x: (minX + maxX) * 0.5,
          y: (minY + maxY) * 0.5,
        },
        height: maxY - minY,
        maxX,
        maxY,
        minX,
        minY,
        width: maxX - minX,
      };
    }
,

    analyzeQuickCircleStroke(rawSamples = this.recordedStroke) {
      const samples = this.getQuickLineSourceSamples(rawSamples);

      if (samples.length < 6) {
        return { eligible: false, reason: "not-enough-samples", shapeType: "ellipse" };
      }

      const bounds = this.getQuickShapeSampleBounds(samples);
      const width = Math.max(0, Number(bounds?.width) || 0);
      const height = Math.max(0, Number(bounds?.height) || 0);
      const minDiameter = Math.min(width, height);
      const maxDiameter = Math.max(width, height);
      const screenScale = Math.max(0.0001, Number(this.camera?.zoom) || 1);
      const screenDiameter = maxDiameter * screenScale;

      if (!bounds || screenDiameter < QUICK_CIRCLE_MIN_SCREEN_DIAMETER || minDiameter <= 0) {
        return {
          eligible: false,
          reason: "too-small",
          screenDiameter,
          shapeType: "ellipse",
        };
      }

      const aspectRatio = maxDiameter / Math.max(minDiameter, 0.0001);

      if (aspectRatio > QUICK_ELLIPSE_MAX_ASPECT_RATIO) {
        return {
          aspectRatio,
          eligible: false,
          reason: "too-flat-for-ellipse",
          screenDiameter,
          shapeType: "ellipse",
        };
      }

      const first = samples[0];
      const last = samples[samples.length - 1];
      const center = bounds.center;
      const rawRadiusX = Math.max(0.0001, width * 0.5);
      const rawRadiusY = Math.max(0.0001, height * 0.5);
      const averageRadius = (rawRadiusX + rawRadiusY) * 0.5;

      const closeGap = Math.hypot(last.x - first.x, last.y - first.y);
      const maxCloseGap = Math.max(
        QUICK_LINE_MIN_SCREEN_DEVIATION / screenScale,
        averageRadius * QUICK_CIRCLE_MAX_CLOSE_GAP_FRACTION,
      );

      if (closeGap > maxCloseGap) {
        return {
          closeGap,
          eligible: false,
          maxCloseGap,
          reason: "open-shape",
          screenDiameter,
          shapeType: "ellipse",
        };
      }

      const pathLength = this.measureQuickLinePathLength(samples);
      const circumference = Math.max(
        0.0001,
        this.measureQuickEllipseCircumference(rawRadiusX, rawRadiusY),
      );
      const pathRatio = pathLength / circumference;

      if (pathRatio < QUICK_CIRCLE_MIN_PATH_RATIO || pathRatio > QUICK_CIRCLE_MAX_PATH_RATIO) {
        return {
          circumference,
          eligible: false,
          pathLength,
          pathRatio,
          reason: "bad-circumference",
          screenDiameter,
          shapeType: "ellipse",
        };
      }

      let maxNormalizedDeviation = 0;
      let totalNormalizedDeviation = 0;

      samples.forEach((sample) => {
        const normalizedRadius = Math.hypot(
          (sample.x - center.x) / rawRadiusX,
          (sample.y - center.y) / rawRadiusY,
        );
        const deviation = Math.abs(normalizedRadius - 1);

        maxNormalizedDeviation = Math.max(maxNormalizedDeviation, deviation);
        totalNormalizedDeviation += deviation;
      });

      const averageNormalizedDeviation = totalNormalizedDeviation / samples.length;

      if (
        maxNormalizedDeviation > QUICK_CIRCLE_MAX_RADIAL_DEVIATION_FRACTION ||
        averageNormalizedDeviation > QUICK_CIRCLE_MAX_AVERAGE_DEVIATION_FRACTION
      ) {
        return {
          averageDeviationFraction: averageNormalizedDeviation,
          eligible: false,
          maxDeviationFraction: maxNormalizedDeviation,
          reason: "too-irregular",
          screenDiameter,
          shapeType: "ellipse",
        };
      }

      const shapeType = aspectRatio <= QUICK_CIRCLE_SNAP_ASPECT_RATIO
        ? "circle"
        : "ellipse";

      const radiusX = shapeType === "circle" ? averageRadius : rawRadiusX;
      const radiusY = shapeType === "circle" ? averageRadius : rawRadiusY;

      const startAngle = Math.atan2(
        (first.y - center.y) / radiusY,
        (first.x - center.x) / radiusX,
      );

      return {
        aspectRatio,
        averageDeviationFraction: averageNormalizedDeviation,
        center: { ...center },
        closeGap,
        eligible: true,
        maxDeviationFraction: maxNormalizedDeviation,
        pathLength,
        pathRatio,
        radius: averageRadius,
        radiusFromBounds: averageRadius,
        radiusX,
        radiusY,
        screenDiameter,
        shapeType,
        startAngle: Number.isFinite(startAngle) ? startAngle : 0,
      };
    }
,

    createQuickCircleSamplesFromGeometry(sourceSamples, geometry = {}) {
      const samples = this.getQuickLineSourceSamples(sourceSamples);

      if (samples.length < 2 || !geometry?.center) {
        return samples;
      }

      const center = geometry.center;

      const radiusFallback = Math.max(0.0001, Number(geometry.radius) || 0);
      const radiusX = Math.max(
        0.0001,
        Number(geometry.radiusX) || radiusFallback,
      );
      const radiusY = Math.max(
        0.0001,
        Number(geometry.radiusY) || radiusFallback,
      );

      const startAngle = Number.isFinite(Number(geometry.startAngle))
        ? Number(geometry.startAngle)
        : Math.atan2(
            (samples[0].y - center.y) / radiusY,
            (samples[0].x - center.x) / radiusX,
          );

      const tValues = Array.isArray(geometry.tValues) && geometry.tValues.length > 1
        ? geometry.tValues
        : this.getQuickShapeTValues(samples);

      const requestedSampleCount = Number(geometry.sampleCount);
      const sampleCount = Math.round(this.clamp(
        Number.isFinite(requestedSampleCount) && requestedSampleCount >= 2
          ? requestedSampleCount
          : Math.max(2, tValues.length || samples.length),
        2,
        QUICK_LINE_MAX_SOURCE_SAMPLES,
      ));
      const maxSourceIndex = samples.length - 1;

      return Array.from({ length: sampleCount }, (_, index) => {
        const fallbackT = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
        const rawT = tValues[index];
        const t = this.clamp(
          Number.isFinite(Number(rawT)) ? Number(rawT) : fallbackT,
          0,
          1,
        );
        const sourceIndex = Math.min(
          maxSourceIndex,
          Math.round(fallbackT * maxSourceIndex),
        );
        const sourceSample = samples[sourceIndex] || samples[0];
        const angle = startAngle + Math.PI * 2 * t;

        return {
          ...sourceSample,
          x: center.x + Math.cos(angle) * radiusX,
          y: center.y + Math.sin(angle) * radiusY,
        };
      });
    }
,

    createQuickCircleSamples(sourceSamples = this.recordedStroke, geometry = {}) {
      return this.createQuickCircleSamplesFromGeometry(sourceSamples, geometry);
    }
,

    cloneQuickShapeBaseStamp(baseStamp) {
      if (!baseStamp?.stamp) {
        return null;
      }

      const stamp = baseStamp.stamp;
      const x = Number(stamp.x);
      const y = Number(stamp.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return {
        distance: Number(baseStamp.distance) || 0,
        randomSeedBeforeShape: (Number(baseStamp.randomSeedBeforeShape) || this.strokeInitialSeed || 1) >>> 0,
        stamp: {
          ...stamp,
          x,
          y,
        },
        tangent: baseStamp.tangent
          ? {
              x: Number(baseStamp.tangent.x) || 0,
              y: Number(baseStamp.tangent.y) || 0,
            }
          : null,
      };
    }
,

    createQuickShapeBaseStampState(rawSamples = this.recordedStroke) {
      try {
        const pathCache = this.getReplayStrokePathCache(rawSamples);
        const replayPlan = this.getReplayStrokeRenderPlan(rawSamples);
        const baseStamps = Array.isArray(replayPlan?.baseStamps)
          ? replayPlan.baseStamps
              .map((baseStamp) => this.cloneQuickShapeBaseStamp(baseStamp))
              .filter(Boolean)
          : [];

        if (baseStamps.length === 0) {
          return null;
        }

        const lastDistance = Number(baseStamps[baseStamps.length - 1]?.distance) || 0;
        const pathLength = Math.max(
          0.0001,
          Number(pathCache?.pathLength) || lastDistance || this.measureQuickLinePathLength(rawSamples),
        );
        const tValues = baseStamps.map((baseStamp, index) => {
          if (index === 0) {
            return 0;
          }

          if (index === baseStamps.length - 1 && baseStamps.length > 1) {
            return this.clamp((Number(baseStamp.distance) || pathLength) / pathLength, 0, 1);
          }

          return this.clamp((Number(baseStamp.distance) || 0) / pathLength, 0, 1);
        });

        return {
          baseStamps,
          pathLength,
          tValues,
        };
      } catch (error) {
        namespace.lastBrushQuickShapeBaseStampError = {
          message: error?.message || String(error),
          timestamp: Date.now(),
        };
        return null;
      }
    }
,

    getQuickShapeBaseStampStateFromQuickLineState(state = this.quickLineState) {
      const baseStamps = Array.isArray(state?.quickShapeBaseStamps)
        ? state.quickShapeBaseStamps
            .map((baseStamp) => this.cloneQuickShapeBaseStamp(baseStamp))
            .filter(Boolean)
        : [];

      if (baseStamps.length === 0) {
        return null;
      }

      const pathLength = Math.max(
        0.0001,
        Number(state.quickShapeBaseStampPathLength) ||
          Number(baseStamps[baseStamps.length - 1]?.distance) ||
          0,
      );
      const tValues = Array.isArray(state.quickShapeBaseStampTValues) &&
        state.quickShapeBaseStampTValues.length === baseStamps.length
        ? state.quickShapeBaseStampTValues.map((value) => this.clamp(Number(value) || 0, 0, 1))
        : baseStamps.map((baseStamp) => this.clamp((Number(baseStamp.distance) || 0) / pathLength, 0, 1));

      return {
        baseStamps,
        pathLength,
        tValues,
      };
    }
,

    createQuickLineBaseStamps(sourceSamples, baseStampState) {
      const samples = this.getQuickLineSourceSamples(sourceSamples);
      const baseStamps = Array.isArray(baseStampState?.baseStamps)
        ? baseStampState.baseStamps
        : [];

      if (samples.length < 2 || baseStamps.length === 0) {
        return null;
      }

      const start = samples[0];
      const end = samples[samples.length - 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.hypot(dx, dy);
      const tangent = distance > 0
        ? {
            x: dx / distance,
            y: dy / distance,
          }
        : null;
      const tValues = Array.isArray(baseStampState.tValues) ? baseStampState.tValues : [];

      return baseStamps.map((baseStamp, index) => {
        const t = this.clamp(Number(tValues[index]) || 0, 0, 1);

        return {
          ...baseStamp,
          stamp: {
            ...baseStamp.stamp,
            x: start.x + dx * t,
            y: start.y + dy * t,
          },
          tangent: tangent ? { ...tangent } : baseStamp.tangent,
        };
      });
    }
,

    createQuickCircleBaseStampsFromGeometry(geometry = {}, baseStampState) {
      const baseStamps = Array.isArray(baseStampState?.baseStamps)
        ? baseStampState.baseStamps
        : [];
      const center = geometry?.center;

      if (!center || baseStamps.length === 0) {
        return null;
      }

      const radiusFallback = Math.max(0.0001, Number(geometry.radius) || 0);
      const radiusX = Math.max(0.0001, Number(geometry.radiusX) || radiusFallback);
      const radiusY = Math.max(0.0001, Number(geometry.radiusY) || radiusFallback);
      const startAngle = Number.isFinite(Number(geometry.startAngle))
        ? Number(geometry.startAngle)
        : 0;
      const tValues = Array.isArray(baseStampState.tValues) ? baseStampState.tValues : [];

      return baseStamps.map((baseStamp, index) => {
        const t = this.clamp(Number(tValues[index]) || 0, 0, 1);
        const angle = startAngle + Math.PI * 2 * t;
        const tangentDx = -Math.sin(angle) * radiusX;
        const tangentDy = Math.cos(angle) * radiusY;
        const tangentLength = Math.hypot(tangentDx, tangentDy);
        const tangent = tangentLength > 0
          ? {
              x: tangentDx / tangentLength,
              y: tangentDy / tangentLength,
            }
          : baseStamp.tangent;

        return {
          ...baseStamp,
          stamp: {
            ...baseStamp.stamp,
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY,
          },
          tangent: tangent ? { ...tangent } : null,
        };
      });
    }
,

    renderQuickLinePreview(lineSamples, options = {}) {
      if (!Array.isArray(lineSamples) || lineSamples.length < 2) {
        return false;
      }

      const layerId = this.strokeTargetLayerId;
      const strokeTool = this.currentStrokeTool;
      const strokeRenderMode = this.strokeRenderMode;
      const startedAt = this.getNow();

      this.clearPendingPointerSamples();
      if (this.strokeTexture || this.strokeFBO) {
        this.clearStrokeLayer();
      } else {
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      }
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.invalidateReplayStrokeCache();

      try {
        this.beginStrokeDynamics(lineSamples[0]);
        const baseStamps = Array.isArray(options.baseStamps) && options.baseStamps.length > 0
          ? options.baseStamps
          : null;
        const expandedStamps = baseStamps
          ? this.buildReplayExpandedStamps(baseStamps)
          : this.getReplayExpandedStamps(this.getReplayStrokeRenderPlan(lineSamples));

        this.renderReplayExpandedStamps(expandedStamps);
        return true;
      } catch (error) {
        namespace.lastBrushQuickLineError = {
          message: error?.message || String(error),
          timestamp: Date.now(),
        };
        return false;
      } finally {
        this.strokeTargetLayerId = layerId;
        this.currentStrokeTool = strokeTool;
        this.strokeRenderMode = strokeRenderMode;
        this.quickShapeLastPreviewAt = this.getNow();
        this.quickShapeLastPreviewDurationMs = Math.max(0, this.quickShapeLastPreviewAt - startedAt);
      }
    }
,

    tryActivateQuickLine(source = "hold") {
      this.clearQuickLineHoldTimer();

      if (!this.canScheduleQuickLineHold()) {
        return false;
      }

      this.processPendingPointerSamples({
        drainAll: true,
        requestDraw: false,
      });

      if (this.incrementalStrokeBakeCount > 0 || this.incrementalStrokeBakedRect) {
        namespace.lastBrushQuickLine = {
          reason: "incremental-bake-active",
          source,
          status: "rejected",
          timestamp: Date.now(),
        };
        return false;
      }

      const lineAnalysis = this.analyzeQuickLineStroke(this.recordedStroke);
      const circleAnalysis = lineAnalysis.eligible
        ? null
        : this.analyzeQuickCircleStroke(this.recordedStroke);
      const analysis = lineAnalysis.eligible ? lineAnalysis : circleAnalysis;
      const shapeType = lineAnalysis.eligible
        ? "line"
        : analysis?.shapeType || "circle";

      if (!analysis?.eligible) {
        namespace.lastBrushQuickLine = {
          circle: circleAnalysis,
          line: lineAnalysis,
          source,
          status: "rejected",
          timestamp: Date.now(),
        };
        return false;
      }

      const sourceSamples = this.getQuickLineSourceSamples(this.recordedStroke);
      const quickShapeTValues = this.getQuickShapeTValues(sourceSamples);
      const quickShapeSampleCount = sourceSamples.length;
      const quickShapeBaseStampState = this.createQuickShapeBaseStampState(this.recordedStroke);
      const lineSamples = shapeType === "line"
        ? this.createQuickLineSamples(sourceSamples, quickShapeTValues)
        : this.createQuickCircleSamplesFromGeometry(sourceSamples, {
            ...analysis,
            sampleCount: quickShapeSampleCount,
            tValues: quickShapeTValues,
          });
      const quickShapePreviewBaseStamps = shapeType === "line"
        ? this.createQuickLineBaseStamps(sourceSamples, quickShapeBaseStampState)
        : this.createQuickCircleBaseStampsFromGeometry({
            ...analysis,
            sampleCount: quickShapeSampleCount,
            tValues: quickShapeTValues,
          }, quickShapeBaseStampState);

      if (!this.renderQuickLinePreview(lineSamples, { baseStamps: quickShapePreviewBaseStamps })) {
        namespace.lastBrushQuickLine = {
          reason: "render-failed",
          source,
          status: "rejected",
          timestamp: Date.now(),
        };
        return false;
      }

      this.quickLineState = {
        active: true,
        analysis,
        circleCenter: shapeType !== "line" ? { ...analysis.center } : null,
        circleRadius: shapeType !== "line" ? analysis.radius : null,
        circleRadiusX: shapeType !== "line" ? analysis.radiusX : null,
        circleRadiusY: shapeType !== "line" ? analysis.radiusY : null,
        circleStartAngle: shapeType !== "line" ? analysis.startAngle : null,
        lineSamples: lineSamples.map((sample) => ({ ...sample })),
        quickShapeBaseStampPathLength: quickShapeBaseStampState?.pathLength || null,
        quickShapeBaseStampTValues: quickShapeBaseStampState?.tValues || null,
        quickShapeBaseStamps: quickShapeBaseStampState?.baseStamps || null,
        quickShapeSampleCount,
        quickShapeTValues,
        shapeType,
        source,
        sourceSamples: sourceSamples.map((sample) => ({ ...sample })),
      };
      this.recordedStroke = lineSamples.map((sample) => ({ ...sample }));
      namespace.lastBrushQuickLine = {
        ...analysis,
        shapeType,
        source,
        status: "active",
        timestamp: Date.now(),
      };
      namespace.EngineGovernor?.markActivity?.({ source: "brush-quick-line" });
      this.requestDraw();

      return true;
    }
,

    updateQuickCirclePreviewFromSample(rawSample) {
      if (!this.isQuickLineActive()) {
        return false;
      }

      const sample = this.cloneQuickLineSample(rawSample);
      const state = this.quickLineState || {};
      const center = state.circleCenter || state.analysis?.center;

      if (!sample || !center) {
        return false;
      }

      const previousSource = Array.isArray(state.sourceSamples)
        ? state.sourceSamples
        : this.recordedStroke;

      const sourceSamples = previousSource.length > 1
        ? previousSource.slice(0, -1).map((sourceSample) => ({ ...sourceSample }))
        : previousSource.map((sourceSample) => ({ ...sourceSample }));

      sourceSamples.push(sample);

      const screenScale = Math.max(0.0001, Number(this.camera?.zoom) || 1);
      const minRadius = QUICK_CIRCLE_MIN_SCREEN_DIAMETER / (2 * screenScale);

      const shapeType = state.shapeType === "ellipse" || state.analysis?.shapeType === "ellipse"
        ? "ellipse"
        : "circle";

      const fallbackRadius = Math.max(
        minRadius,
        Number(state.circleRadius) ||
          Number(state.analysis?.radius) ||
          minRadius,
      );

      const fallbackRadiusX = Math.max(
        minRadius,
        Number(state.circleRadiusX) ||
          Number(state.analysis?.radiusX) ||
          fallbackRadius,
      );

      const fallbackRadiusY = Math.max(
        minRadius,
        Number(state.circleRadiusY) ||
          Number(state.analysis?.radiusY) ||
          fallbackRadius,
      );

      const startAngle = Number.isFinite(Number(state.circleStartAngle))
        ? Number(state.circleStartAngle)
        : Math.atan2(
            (sourceSamples[0]?.y - center.y) / fallbackRadiusY,
            (sourceSamples[0]?.x - center.x) / fallbackRadiusX,
          );

      let radiusX = fallbackRadiusX;
      let radiusY = fallbackRadiusY;

      if (shapeType === "circle") {
        const pointerRadius = Math.hypot(sample.x - center.x, sample.y - center.y);
        const radius = Math.max(
          minRadius,
          Number.isFinite(pointerRadius) && pointerRadius > 0
            ? pointerRadius
            : fallbackRadius,
        );

        radiusX = radius;
        radiusY = radius;
      } else {
        const dx = sample.x - center.x;
        const dy = sample.y - center.y;
        const cosA = Math.cos(startAngle);
        const sinA = Math.sin(startAngle);

        radiusX = Math.abs(cosA) > 0.15
          ? Math.abs(dx / cosA)
          : Math.abs(dx) > minRadius
            ? Math.abs(dx)
            : fallbackRadiusX;

        radiusY = Math.abs(sinA) > 0.15
          ? Math.abs(dy / sinA)
          : Math.abs(dy) > minRadius
            ? Math.abs(dy)
            : fallbackRadiusY;

        radiusX = Math.max(minRadius, radiusX);
        radiusY = Math.max(minRadius, radiusY);
      }

      const radius = (radiusX + radiusY) * 0.5;

      const circleSamples = this.createQuickCircleSamplesFromGeometry(sourceSamples, {
        center,
        radius,
        radiusX,
        radiusY,
        sampleCount: state.quickShapeSampleCount || sourceSamples.length,
        startAngle,
        tValues: state.quickShapeTValues,
      });
      const quickShapeBaseStampState = this.getQuickShapeBaseStampStateFromQuickLineState(state);
      const circleBaseStamps = this.createQuickCircleBaseStampsFromGeometry({
        center,
        radius,
        radiusX,
        radiusY,
        startAngle,
      }, quickShapeBaseStampState);

      if (!this.renderQuickLinePreview(circleSamples, { baseStamps: circleBaseStamps })) {
        return false;
      }

      this.quickLineState = {
        ...state,
        analysis: {
          ...(state.analysis || {}),
          center: { ...center },
          eligible: true,
          radius,
          radiusX,
          radiusY,
          shapeType,
        },
        circleCenter: { ...center },
        circleRadius: radius,
        circleRadiusX: radiusX,
        circleRadiusY: radiusY,
        circleStartAngle: startAngle,
        lineSamples: circleSamples.map((circleSample) => ({ ...circleSample })),
        quickShapeSampleCount: state.quickShapeSampleCount || circleSamples.length,
        quickShapeTValues: state.quickShapeTValues || this.getQuickShapeTValues(sourceSamples),
        shapeType,
        sourceSamples: sourceSamples.map((sourceSample) => ({ ...sourceSample })),
      };
      this.recordedStroke = circleSamples.map((circleSample) => ({ ...circleSample }));
      namespace.lastBrushQuickLine = {
        ...this.quickLineState.analysis,
        shapeType,
        status: "active",
        timestamp: Date.now(),
      };
      namespace.EngineGovernor?.markActivity?.({
        source: shapeType === "ellipse"
          ? "brush-quick-ellipse-update"
          : "brush-quick-circle-update",
      });
      this.requestDraw();

      return true;
    }
,

    updateQuickLinePreviewFromSample(rawSample, options = {}) {
      if (!this.isQuickLineActive()) {
        return false;
      }

      if (options.defer === true) {
        return this.deferQuickShapePreviewSample(rawSample);
      }

      const state = this.quickLineState || {};

      if (state.shapeType === "circle" || state.shapeType === "ellipse") {
        return this.updateQuickCirclePreviewFromSample(rawSample);
      }

      const sample = this.cloneQuickLineSample(rawSample);

      if (!sample) {
        return false;
      }

      const previousSource = Array.isArray(state.sourceSamples)
        ? state.sourceSamples
        : this.recordedStroke;
      const sourceSamples = previousSource.length > 1
        ? previousSource.slice(0, -1).map((sourceSample) => ({ ...sourceSample }))
        : previousSource.map((sourceSample) => ({ ...sourceSample }));

      sourceSamples.push(sample);
      const lineSamples = this.createQuickLineSamples(
        sourceSamples,
        state.quickShapeTValues,
      );
      const quickShapeBaseStampState = this.getQuickShapeBaseStampStateFromQuickLineState(state);
      const lineBaseStamps = this.createQuickLineBaseStamps(sourceSamples, quickShapeBaseStampState);

      if (!this.renderQuickLinePreview(lineSamples, { baseStamps: lineBaseStamps })) {
        return false;
      }

      const analysis = this.analyzeQuickLineStroke(lineSamples);

      this.quickLineState = {
        ...this.quickLineState,
        analysis: {
          ...analysis,
          eligible: true,
        },
        lineSamples: lineSamples.map((lineSample) => ({ ...lineSample })),
        sourceSamples: sourceSamples.map((sourceSample) => ({ ...sourceSample })),
      };
      this.recordedStroke = lineSamples.map((lineSample) => ({ ...lineSample }));
      namespace.lastBrushQuickLine = {
        ...this.quickLineState.analysis,
        shapeType: "line",
        status: "active",
        timestamp: Date.now(),
      };
      namespace.EngineGovernor?.markActivity?.({ source: "brush-quick-line-update" });
      this.requestDraw();

      return true;
    }
,

    updateQuickLinePreviewFromEvent(event, options = {}) {
      const samples = this.getPointerEventSamples(event);
      const sample = samples[samples.length - 1] || this.createPointerSample(event);

      return this.updateQuickLinePreviewFromSample(sample, options);
    }
,

    handlePointerDown(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.shouldSuppressTouchToolEvent(event)) {
        this.suppressTouchToolEvent(event);
        return;
      }

      const isPanTrigger = this.isTemporaryPanTrigger(event);

      if (isPanTrigger) {
        if (this.isDrawing || this.isPanning) {
          return;
        }

        event.preventDefault();
        this.beginPan(event);
        return;
      }

      if (!this.isPrimaryStrokePointer(event) || this.isDrawing || this.isPanning) {
        return;
      }

      const documentPoint = this.screenToDocumentSpace(event.clientX, event.clientY);

      if (this.shouldStartTouchCanvasPan(event, documentPoint)) {
        this.markNavigationEvent(event);
        this.beginPan(event, event.currentTarget || this.stage || this.canvas);
        namespace.EngineGovernor?.markActivity?.({ source: "touch-empty-canvas-pan-start" });
        return;
      }

      this.activateArtboardAtPoint(documentPoint);

      if (!this.isDocumentPointInside(documentPoint)) {
        event.preventDefault();
        return;
      }

      if (!this.canStartBrushStroke()) {
        return;
      }

      event.preventDefault();
      this.resetQuickLineState();
      this.clearPendingBrushHistoryTimer();
      const strokeTool = this.activeStrokeTool || "brush";
      let strokeTarget = null;

      if (strokeTool === "eraser") {
        this.logEraserZoomDebug("eraser-pointerdown", {
          docPoint: {
            x: this.roundEraserDebugValue(documentPoint.x, 2),
            y: this.roundEraserDebugValue(documentPoint.y, 2),
          },
          pointerId: event.pointerId,
          pointerType: event.pointerType || "",
          state: namespace.EraserZoomDebug?.captureLayerState?.(
            this.documentRenderer?.layerModel?.activeLayerId || "",
            { coarseOnly: true },
          ),
        });
        strokeTarget = this.getActiveRasterTargetForEraser();

        if (!strokeTarget) {
          this.warnEraserZoomDebug("eraser-pointerdown-no-target", {
            layerId: this.documentRenderer?.layerModel?.activeLayerId || "",
          });
          return;
        }

        this.logEraserZoomDebug("eraser-pointerdown-target", {
          layerId: strokeTarget.layerId || "",
          target: namespace.EraserZoomDebug?.getTargetSummary?.(strokeTarget, this.documentRenderer),
        });
      } else {
        strokeTarget = this.documentRenderer?.ensurePaintLayerForBrush?.({ materialize: false }) ||
          this.getDocumentDrawTarget();
      }

      // Modalità preview: ogni nuovo tratto resetta la canvas (utile nella drawing pad).
      if (this.options.singleStrokeMode && strokeTool !== "eraser") {
        this.clearAllLayers();
      }

      this.releaseStrokeLayerTarget();
      this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      this.resetStrokeAllocationDiagnostics();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.clearPendingPointerSamples();
      this.warmPreviewCacheForStroke({ force: true });
      namespace.EngineGovernor?.markActivity?.({ source: "brush-pointerdown" });
      this.currentStrokeTool = strokeTool;
      this.strokeRenderMode = this.getBrushStrokeRenderMode();
      this.strokeTargetLayerId = strokeTarget?.layerId || null;
      this.activeStrokeSymmetry = this.resolveActiveStrokeSymmetry?.({
        layerId: this.strokeTargetLayerId || "",
        tool: strokeTool,
      }) || null;
      const rawSample = this.createPointerSample(event);

      this.strokeInputStats = this.createStrokeInputStats(rawSample);

      this.recordedStroke = [rawSample];

      const point = this.beginStrokeDynamics(rawSample);

      this.isDrawing = true;
      this.activePointerId = event.pointerId;
      this.largeBlendFinalQualityReplay = false;
      this.largeBlendLivePreviewUsed = this.shouldUseMobileLargeBlendFastPath?.() === true;
      this.lastLargeBlendFinalQualityReplay = null;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(point);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.applyPencilInputToStamp(startStamp, null);
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing(startStamp);
      this.currentStroke = [point, point, point];
      this.canvas.setPointerCapture(event.pointerId);
      this.scheduleQuickLineHold();
      this.requestDraw();
    }
,

    handlePointerMove(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.shouldSuppressTouchToolEvent(event)) {
        this.suppressTouchToolEvent(event);
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.updatePan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      namespace.EngineGovernor?.markActivity?.({ source: "brush-pointermove" });

      if (this.isQuickLineActive()) {
        this.updateQuickLinePreviewFromEvent(event, { defer: true });
        return;
      }

      this.enqueuePointerMoveSamples(event);
      this.scheduleQuickLineHold();
      this.requestDraw();
    }
,

    handlePointerUp(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.shouldSuppressTouchToolEvent(event)) {
        this.suppressTouchToolEvent(event);
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      namespace.EngineGovernor?.markActivity?.({ source: "brush-pointerup" });
      const quickLineWasActive = this.isQuickLineActive();

      this.clearQuickLineHoldTimer();
      this.cancelQuickShapePreviewFrame();

      try {
        if (quickLineWasActive) {
          this.updateQuickLinePreviewFromEvent(event);
        } else {
          this.processPendingPointerSamples({
            drainAll: true,
            requestDraw: false,
          });
          const rawSample = this.createPointerSample(event);

          this.recordedStroke.push(rawSample);

          const point = this.applyStabilization(rawSample);

          this.currentStroke.push(point);
          this.processStamps();
          this.currentStroke.push(point);
          this.processStamps();
          this.flushStamps();
        }

        if (this.currentStrokeTool === "eraser") {
          this.logEraserZoomDebug("eraser-pointerup-before-bake", {
            layerId: this.strokeTargetLayerId || "",
            recordedSamples: this.recordedStroke.length,
            state: namespace.EraserZoomDebug?.captureLayerState?.(this.strokeTargetLayerId || "", {
              coarseOnly: true,
            }),
            strokeRect: this.activeStrokeBounds ? { ...this.activeStrokeBounds } : null,
            strokeStamps: this.strokeStampCount,
          });
        }

        if (!quickLineWasActive && this.shouldRegenerateLargeBlendFinalQuality(this.recordedStroke)) {
          this.regenerateLargeBlendStrokeForFinalBake(this.recordedStroke);
        // Taper: rifaccio l'intero tratto in strokeFBO conoscendo la lunghezza totale,
        // cosi' posso modulare size+opacity ai due estremi. Solo dopo bake.
        } else if (!quickLineWasActive && this.isTaperActive() && this.recordedStroke.length > 1) {
          this.regenerateStrokeWithTaper(this.recordedStroke, this.getCurrentStrokePathLength());
        }

        this.bakeStroke();

        if (this.currentStrokeTool === "eraser") {
          this.logEraserZoomDebug("eraser-pointerup-after-bake", {
            layerId: this.strokeTargetLayerId || "",
            state: namespace.EraserZoomDebug?.captureLayerState?.(this.strokeTargetLayerId || "", {
              precise: true,
            }),
          });
        }
      } catch (error) {
        this.warnEraserZoomDebug("eraser-pointerup-error", {
          layerId: this.strokeTargetLayerId || "",
          message: error?.message || String(error),
        });
      } finally {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }

        if (this.recordedStroke.length > 0) {
          this.lastRecordedStroke = this.recordedStroke.slice();
          this.invalidateReplayStrokeCache();
        }

        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        this.clearPendingPointerSamples();
        if (this.pendingBrushHistory) {
          this.schedulePendingBrushHistoryCommit();
        }
        this.recordedStroke = [];
        this.resetStrokeRuntimeState();
        this.isDrawing = false;
        this.activePointerId = null;
        this.requestDraw();
      }
    }
,

    handlePointerCancel(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.shouldSuppressTouchToolEvent(event)) {
        this.suppressTouchToolEvent(event);
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      this.resetQuickLineState();

      if (this.currentStrokeTool === "eraser") {
        this.warnEraserZoomDebug("eraser-pointercancel", {
          layerId: this.strokeTargetLayerId || "",
          pointerId: event.pointerId,
          pointerType: event.pointerType || "",
        });
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.releaseStrokeLayerTarget();
      this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      this.clearPendingPointerSamples();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
      this.isDrawing = false;
      this.activePointerId = null;
      this.requestDraw();
    }

    });
  };
})(window.CBO = window.CBO || {});
