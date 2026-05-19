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
        "[data-ai-image-board]",
        "[data-artboard-action-bubble]",
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

    createPointerSample(event) {
      const { docX, docY } = this.screenToDocumentSpace(event.clientX, event.clientY);
      const isMouse = event.pointerType === "mouse";
      const point = this.clampStrokeSamplePoint(docX, docY);
      const eventTime = Number(event.timeStamp);

      return {
        x: point.x,
        y: point.y,
        pressure: isMouse ? 1.0 : event.pressure,
        pointerType: event.pointerType || "",
        tiltX: isMouse ? 0 : event.tiltX,
        tiltY: isMouse ? 0 : event.tiltY,
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
        !this.isTouchCanvasPanInteractiveTarget(event.target)
      );
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
    }
,

    resetStrokeRuntimeState() {
      this.cancelActiveStrokeDirtyRegionDebug();
      this.cancelStrokeTargetPrewarm();
      this.resetStrokeProgress();
      this.strokeDynamicsState = null;
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeGrainRandomState = null;
      this.velocityPressureState = null;
      this.strokeChargeRadius = null;
      this.strokeGrainOffset = { x: 0, y: 0 };
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.strokeTargetLayerId = null;
      this.strokeRenderMode = null;
      this.currentStrokeTool = this.activeStrokeTool || "brush";
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
      this.applyTaperToStamp(startStamp);
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing(startStamp.sizeScale);
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
      const startPoint = this.beginStrokeDynamics(firstSample);

      this.isDrawing = true;

      try {
        this.resetStrokeProgress();
        const startStamp = this.createStamp(startPoint);

        startStamp.alphaScale = this.getStampAlphaScale();
        startStamp.sizeScale = 1;
        this.pushShapeStamps(startStamp, null);
        this.nextStampDistance = this.getStampSpacing();
        this.currentStroke = [startPoint, startPoint, startPoint];

        // Replay degli intermedi (escluso ultimo: lo trattiamo come pointer-up).
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
        this.flushStamps();

        if (this.isTaperActive() && rawSamples.length > 1) {
          this.regenerateStrokeWithTaper(rawSamples, this.getCurrentStrokePathLength());
        }

        this.bakeStroke();
      } catch (error) {
        console.error?.("[CBO brush] Replay tratto interrotto: cleanup stroke scratch eseguito.", error);
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

      const initialPendingSamples = this.pendingPointerSamples.length;
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
      const rawSample = this.createPointerSample(event);

      this.strokeInputStats = this.createStrokeInputStats(rawSample);

      this.recordedStroke = [rawSample];

      const point = this.beginStrokeDynamics(rawSample);

      this.isDrawing = true;
      this.activePointerId = event.pointerId;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(point);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing();
      this.currentStroke = [point, point, point];
      this.canvas.setPointerCapture(event.pointerId);
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
      this.enqueuePointerMoveSamples(event);
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

      try {
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

        // Taper: rifaccio l'intero tratto in strokeFBO conoscendo la lunghezza totale,
        // cosi' posso modulare size+opacity ai due estremi. Solo dopo bake.
        if (this.isTaperActive() && this.recordedStroke.length > 1) {
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
        console.error?.("[CBO brush] Fine tratto interrotta: cleanup stroke scratch eseguito.", error);
      } finally {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }

        if (this.recordedStroke.length > 0) {
          this.lastRecordedStroke = this.recordedStroke.slice();
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
