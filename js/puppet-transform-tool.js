(function registerPuppetTransformTool(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PUPPET_TOOL_MODE = "puppet";
  const DEFAULT_PUPPET_GRID_COLS = 256;
  const DEFAULT_PUPPET_GRID_ROWS = 256;
  const PUPPET_OVERLAY_ALPHA_THRESHOLD = 18;
  const PUPPET_OVERLAY_ALPHA_SAMPLE_SCALE = 2;
  const PIN_HIT_RADIUS_CSS = 14;

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

  function runAfterNextPaint(callback) {
    if (typeof window.requestAnimationFrame !== "function") {
      callback();
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(callback);
    });
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function isPuppetToolDetail(detail = {}) {
    const label = String(detail.label || "").trim().toLowerCase();
    const toolMode = String(detail.toolMode || "").trim().toLowerCase();

    return toolMode === PUPPET_TOOL_MODE || label === PUPPET_TOOL_MODE;
  }

  function setPuppetLoading(isLoading) {
    const stage = document.querySelector(".editor-stage");

    if (!stage) {
      return;
    }

    let loader = stage.querySelector(".editor-puppet-loading");

    if (isLoading) {
      if (!loader) {
        loader = document.createElement("div");
        loader.className = "editor-puppet-loading";
        loader.setAttribute("role", "status");
        loader.setAttribute("aria-live", "polite");
        loader.innerHTML = `
          <span class="editor-puppet-loading-spinner" aria-hidden="true"></span>
          <span class="editor-puppet-loading-label">LOADING</span>
        `;
        stage.append(loader);
      }

      loader.hidden = false;
    } else if (loader) {
      loader.hidden = true;
    }
  }

  function createPuppetRasterizeHistoryEntry(options = {}) {
    const {
      afterSnapshot,
      afterPreferSparse = false,
      afterState,
      beforeSnapshot,
      beforePreferSparse = false,
      beforeState,
      history,
      layerId,
      layerModel,
      puppet,
      renderer,
    } = options;

    if (!history || !layerModel || !renderer || !layerId || !beforeState || !afterState) {
      return null;
    }

    const before = cloneValue(beforeState);
    const after = cloneValue(afterState);
    const puppetForRedo = puppet ? cloneValue(puppet) : null;

    return {
      type: "custom",
      afterSnapshot,
      beforeSnapshot,
      layerId,
      source: "puppet-rasterize",
      undo() {
        const didRestoreState = history.restoreLayerState(layerModel, before, {
          source: "history-undo-puppet-rasterize",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
          preferSparse: beforePreferSparse,
          replaceSparse: beforePreferSparse,
          source: "history-undo-puppet-rasterize",
        }) !== false;

        namespace.brushEngine?.requestDraw?.();
        return didRestorePixels;
      },
      redo() {
        if (!afterSnapshot) {
          const didRestoreBeforeState = history.restoreLayerState(layerModel, before, {
            source: "history-redo-puppet-rasterize-prepare",
          });

          if (!didRestoreBeforeState) {
            return false;
          }

          const didRestoreBeforePixels = renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
            preferSparse: beforePreferSparse,
            replaceSparse: beforePreferSparse,
            source: "history-redo-puppet-rasterize-prepare",
          }) !== false;

          if (!didRestoreBeforePixels) {
            return false;
          }

          const redoLayer = layerModel.findEntryById?.(layerId);
          const redoPuppet = puppetForRedo || redoLayer?.puppet || before.entries?.find?.((entry) => entry?.id === layerId)?.puppet;
          const layerForRedo = redoPuppet
            ? { ...redoLayer, puppet: cloneValue(redoPuppet) }
            : redoLayer;
          const redoResult = renderer.rasterizePuppetLayer?.(layerForRedo, {
            captureAfterSnapshot: false,
            emit: false,
            source: "history-redo-puppet-rasterize",
          });

          renderer.deleteRasterSnapshot?.(redoResult?.beforeSnapshot);
          renderer.deleteRasterSnapshot?.(redoResult?.afterSnapshot);

          if (!redoResult) {
            return false;
          }

          const didRestoreAfterState = history.restoreLayerState(layerModel, after, {
            source: "history-redo-puppet-rasterize",
          });

          if (!didRestoreAfterState) {
            history.restoreLayerState(layerModel, before, {
              source: "history-redo-puppet-rasterize-rollback",
            });
            renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
              preferSparse: beforePreferSparse,
              replaceSparse: beforePreferSparse,
              source: "history-redo-puppet-rasterize-rollback",
            });
            namespace.brushEngine?.requestDraw?.();
            return false;
          }

          namespace.brushEngine?.requestDraw?.();
          return true;
        }

        const didRestoreState = history.restoreLayerState(layerModel, after, {
          source: "history-redo-puppet-rasterize",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = renderer.restoreRasterSnapshot?.(layerId, afterSnapshot, {
          preferSparse: afterPreferSparse,
          replaceSparse: afterPreferSparse,
          source: "history-redo-puppet-rasterize",
        }) !== false;

        if (!didRestorePixels) {
          history.restoreLayerState(layerModel, before, {
            source: "history-redo-puppet-rasterize-rollback",
          });
        }

        namespace.brushEngine?.requestDraw?.();
        return didRestorePixels;
      },
      destroy() {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    };
  }

  namespace.createPuppetRasterizeHistoryEntry = createPuppetRasterizeHistoryEntry;

  class PuppetTransformTool {
    constructor(options = {}) {
      this.stage = options.stage;
      this.layerModel = options.layerModel;
      this.documentRenderer = options.documentRenderer;
      this.svg = null;
      this.hitArea = null;
      this.meshGroup = null;
      this.pinGroup = null;
      this.activeTool = "";
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.dpr = Math.max(1, window.devicePixelRatio || 1);
      this.pinSequence = 0;
      this.dragState = null;
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleBeforeHistoryAction = this.handleBeforeHistoryAction.bind(this);
      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleTouchNavigationStart = this.handleTouchNavigationStart.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleResize = this.handleResize.bind(this);

      this.createOverlay();
      this.bindEvents();
      this.render();
    }

    createOverlay() {
      if (!this.stage) {
        throw new Error("PuppetTransformTool richiede .editor-stage.");
      }

      this.svg = createSvgElement("svg", {
        "aria-label": "Controlli trasformazione puppet",
        class: "editor-puppet-overlay",
        focusable: "false",
      });
      this.hitArea = createSvgElement("rect", {
        class: "editor-puppet-hit-area",
        fill: "transparent",
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });
      this.pinGroup = createSvgElement("g", { class: "editor-puppet-pin-layer" });
      this.meshGroup = createSvgElement("g", { class: "editor-puppet-mesh-layer" });

      this.svg.append(this.hitArea, this.meshGroup, this.pinGroup);
      this.stage.append(this.svg);
      this.updateViewportSize();
    }

    bindEvents() {
      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:touch-navigation-start", this.handleTouchNavigationStart);
      window.addEventListener("resize", this.handleResize, { passive: true });
      this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
      this.svg.addEventListener("pointerdown", this.handlePointerDown);
      this.svg.addEventListener("pointermove", this.handlePointerMove);
      this.svg.addEventListener("pointerup", this.handlePointerUp);
      this.svg.addEventListener("pointercancel", this.handlePointerCancel);
      this.layerModel?.addEventListener?.("change", this.handleDocumentChange);
    }

    handleToolChange(event) {
      const detail = event.detail || {};
      const label = String(detail.label || "").trim().toLowerCase();
      const toolMode = String(detail.toolMode || "").trim().toLowerCase();
      const nextTool = toolMode || label;

      if (this.isActive() && nextTool !== PUPPET_TOOL_MODE) {
        this.rasterizeActivePuppetLayer();
      }

      this.activeTool = nextTool;
      this.svg.classList.toggle("puppet-tool-active", this.isActive());
      this.render();
    }

    handleBeforeHistoryAction(event) {
      const action = String(event.detail?.action || "").trim().toLowerCase();

      if (action !== "undo" && action !== "redo") {
        return;
      }

      if (this.dragState) {
        this.finishDrag();
        return;
      }

      namespace.documentHistory?.flushLayerState?.(this.layerModel);
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
      this.render();
    }

    handleResize() {
      this.updateViewportSize();
      this.render();
    }

    handleWheel(event) {
      namespace.brushEngine?.handleWheel?.(event);
    }

    isActive() {
      return this.activeTool === PUPPET_TOOL_MODE;
    }

    updateViewportSize() {
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    getActiveLayer() {
      const activeLayerId = this.layerModel?.activeLayerId;

      return activeLayerId ? this.layerModel?.findEntryById?.(activeLayerId) || null : null;
    }

    isPuppetableLayer(layer) {
      return Boolean(
        layer &&
        layer.locked !== true &&
        (layer.type === "paint" || layer.type === "image")
      );
    }

    getLayerPuppet(layer) {
      const puppet = layer?.puppet || {};
      const pins = Array.isArray(puppet.pins) ? puppet.pins : [];

      return {
        cols: DEFAULT_PUPPET_GRID_COLS,
        rows: DEFAULT_PUPPET_GRID_ROWS,
        pins: pins.map((pin) => ({
          id: String(pin.id || this.createPinId()),
          restX: toFiniteNumber(pin.restX, 0),
          restY: toFiniteNumber(pin.restY, 0),
          x: toFiniteNumber(pin.x, toFiniteNumber(pin.restX, 0)),
          y: toFiniteNumber(pin.y, toFiniteNumber(pin.restY, 0)),
          rotation: toFiniteNumber(pin.rotation, 0),
        })),
      };
    }

    getLayerTarget(layer) {
      return layer?.id ? this.documentRenderer?.getRasterTarget?.(layer.id) || null : null;
    }

    getGridSize(layer, puppet) {
      if (this.documentRenderer?.getPuppetGridSize) {
        return this.documentRenderer.getPuppetGridSize({ ...layer, puppet });
      }

      return {
        cols: DEFAULT_PUPPET_GRID_COLS,
        rows: DEFAULT_PUPPET_GRID_ROWS,
      };
    }

    createPinId() {
      this.pinSequence += 1;

      return `puppet-pin-${Date.now().toString(36)}-${this.pinSequence.toString(36)}`;
    }

    documentToViewportPoint(x, y) {
      return {
        x: (x * this.camera.zoom + this.camera.x) / this.dpr,
        y: (y * this.camera.zoom + this.camera.y) / this.dpr,
      };
    }

    clientToDocumentPoint(clientX, clientY) {
      const rect = this.stage.getBoundingClientRect();
      const viewportX = (clientX - rect.left) * this.dpr;
      const viewportY = (clientY - rect.top) * this.dpr;

      return {
        x: (viewportX - this.camera.x) / this.camera.zoom,
        y: (viewportY - this.camera.y) / this.camera.zoom,
      };
    }

    isDocumentPointInside(point) {
      const width = Math.max(1, toFiniteNumber(this.documentRenderer?.width, 1));
      const height = Math.max(1, toFiniteNumber(this.documentRenderer?.height, 1));

      return (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= width &&
        point.y <= height
      );
    }

    requestDraw() {
      if (namespace.brushEngine?.requestDraw) {
        namespace.brushEngine.requestDraw();
      } else {
        namespace.brushEngine?.draw?.();
      }
    }

    patchLayerPuppet(layerId, puppet, options = {}) {
      const didUpdate = this.layerModel?.updateLayer?.(layerId, {
        puppet: cloneValue(puppet),
      }, {
        historyGroup: options.historyGroup || "",
        source: options.source || "puppet-transform",
      });

      if (didUpdate) {
        this.requestDraw();
      }

      return didUpdate;
    }

    rasterizeActivePuppetLayer() {
      if (this.isRasterizing) {
        return true;
      }

      const layer = this.getActiveLayer();
      const puppet = this.getLayerPuppet(layer);

      if (!this.isPuppetableLayer(layer) || puppet.pins.length === 0) {
        return false;
      }

      const renderer = this.documentRenderer;
      const history = namespace.documentHistory;

      history?.flushLayerState?.(this.layerModel);

      const beforeState = history?.getLayerSnapshot?.(this.layerModel) || null;
      const nextPuppet = {
        ...puppet,
        pins: [],
      };
      const rasterizedLayerPatch = {
        puppet: cloneValue(nextPuppet),
      };

      this.layerModel?.updateLayer?.(layer.id, rasterizedLayerPatch, {
        history: false,
        source: "puppet-rasterize-preview-clear",
      });
      this.isRasterizing = true;
      this.requestDraw();
      this.render();

      runAfterNextPaint(() => {
        const snapshots = renderer?.rasterizePuppetLayer?.({ ...layer, puppet }, {
          captureAfterSnapshot: false,
          emit: false,
          source: "puppet-rasterize",
        });

        if (!snapshots) {
          this.layerModel?.updateLayer?.(layer.id, {
            puppet: cloneValue(puppet),
          }, {
            history: false,
            source: "puppet-rasterize-rollback",
          });
          this.isRasterizing = false;
          this.requestDraw();
          this.render();
          return;
        }

        if (layer.type === "image") {
          this.layerModel?.updateLayer?.(layer.id, {
            puppet: cloneValue(nextPuppet),
            type: "paint",
          }, {
            history: false,
            source: "puppet-rasterize",
          });
        }

        const afterState = history?.getLayerSnapshot?.(this.layerModel) || null;
        const historyEntry = createPuppetRasterizeHistoryEntry({
          afterSnapshot: snapshots.afterSnapshot,
          afterPreferSparse: snapshots.afterPreferSparse,
          afterState,
          beforeSnapshot: snapshots.beforeSnapshot,
          beforePreferSparse: snapshots.beforePreferSparse,
          beforeState,
          history,
          layerId: layer.id,
          layerModel: this.layerModel,
          puppet,
          renderer,
        });

        if (historyEntry) {
          history.push(historyEntry);
        } else {
          renderer?.deleteRasterSnapshot?.(snapshots.beforeSnapshot);
          renderer?.deleteRasterSnapshot?.(snapshots.afterSnapshot);
        }

        this.isRasterizing = false;
        this.requestDraw();
        this.render();
        window.dispatchEvent(new CustomEvent("cbo:puppet-rasterized", {
          detail: {
            layerId: layer.id,
            rasterizedLayerType: layer.type === "image" ? "paint" : layer.type,
            source: "puppet-rasterize",
          },
        }));
      });

      return true;
    }

    findPinIdFromEventTarget(target) {
      return target?.closest?.("[data-puppet-pin-id]")?.getAttribute("data-puppet-pin-id") || "";
    }

    findNearestPinId(layer, clientX, clientY) {
      const puppet = this.getLayerPuppet(layer);
      const stageRect = this.stage.getBoundingClientRect();
      const x = clientX - stageRect.left;
      const y = clientY - stageRect.top;
      let bestPinId = "";
      let bestDistSq = PIN_HIT_RADIUS_CSS * PIN_HIT_RADIUS_CSS;

      puppet.pins.forEach((pin) => {
        const point = this.documentToViewportPoint(pin.x, pin.y);
        const dx = point.x - x;
        const dy = point.y - y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= bestDistSq) {
          bestDistSq = distSq;
          bestPinId = pin.id;
        }
      });

      return bestPinId;
    }

    findPinById(puppet, pinId) {
      return puppet?.pins?.find((pin) => pin.id === pinId) || null;
    }

    getPinAngleFromEvent(pin, event) {
      const point = this.clientToDocumentPoint(event.clientX, event.clientY);

      return Math.atan2(point.y - pin.y, point.x - pin.x);
    }

    canCreatePinAtRestPoint(layer, restPoint) {
      if (!layer?.id || !restPoint) {
        return false;
      }

      if (typeof this.documentRenderer?.getRasterAlphaAtPoint !== "function") {
        return true;
      }

      return this.documentRenderer.getRasterAlphaAtPoint(
        layer.id,
        restPoint.x,
        restPoint.y,
      ) > PUPPET_OVERLAY_ALPHA_THRESHOLD;
    }

    removePin(layer, pinId) {
      const puppet = this.getLayerPuppet(layer);
      const nextPins = puppet.pins.filter((pin) => pin.id !== pinId);

      return this.patchLayerPuppet(layer.id, {
        ...puppet,
        pins: nextPins,
      }, {
        historyGroup: `puppet-remove-${layer.id}-${pinId}`,
        source: "puppet-remove-pin",
      });
    }

    startDrag(event, layer, pinId, puppet, options = {}) {
      const mode = options.mode || "move";
      const historyGroup = `puppet-${mode}-${layer.id}-${pinId}`;

      namespace.documentHistory?.beginGroup?.(historyGroup);
      this.dragState = {
        historyGroup,
        layerId: layer.id,
        mode,
        pinId,
        startAngle: toFiniteNumber(options.startAngle, 0),
        startRotation: toFiniteNumber(options.startRotation, 0),
      };

      try {
        this.svg.setPointerCapture(event.pointerId);
      } catch (error) {
        // La capture puo' fallire in casi rari, il drag resta comunque agganciato agli eventi sull'overlay.
      }

      if (options.patchOnStart === true) {
        this.patchLayerPuppet(layer.id, puppet, {
          historyGroup,
          source: "puppet-drag-start",
        });
      }
    }

    handlePointerDown(event) {
      if (namespace.isTouchNavigationExclusive?.() || !this.isActive() || event.button !== 0) {
        return;
      }

      const layer = this.getActiveLayer();

      if (!this.isPuppetableLayer(layer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const targetPinId =
        this.findPinIdFromEventTarget(event.target) ||
        this.findNearestPinId(layer, event.clientX, event.clientY);

      if (event.altKey && event.shiftKey && targetPinId) {
        this.removePin(layer, targetPinId);
        return;
      }

      const puppet = this.getLayerPuppet(layer);
      let pinId = targetPinId;

      if (event.altKey && pinId) {
        const pin = this.findPinById(puppet, pinId);

        if (pin) {
          this.startDrag(event, layer, pinId, puppet, {
            mode: "rotate",
            startAngle: this.getPinAngleFromEvent(pin, event),
            startRotation: pin.rotation,
          });
          return;
        }
      }

      if (!pinId) {
        const point = this.clientToDocumentPoint(event.clientX, event.clientY);

        if (!this.isDocumentPointInside(point)) {
          return;
        }

        const restPoint = this.documentRenderer?.getPuppetRestPoint
          ? this.documentRenderer.getPuppetRestPoint(layer.id, point.x, point.y)
          : point;

        if (!this.canCreatePinAtRestPoint(layer, restPoint)) {
          return;
        }

        const pin = {
          id: this.createPinId(),
          restX: restPoint.x,
          restY: restPoint.y,
          x: point.x,
          y: point.y,
          rotation: 0,
        };

        puppet.pins = [...puppet.pins, pin];
        pinId = pin.id;
      }

      this.startDrag(event, layer, pinId, puppet, {
        patchOnStart: !targetPinId,
      });
    }

    updateDrag(event) {
      if (!this.dragState) {
        return;
      }

      const layer = this.layerModel?.findEntryById?.(this.dragState.layerId);

      if (!this.isPuppetableLayer(layer)) {
        this.finishDrag(event);
        return;
      }

      const puppet = this.getLayerPuppet(layer);

      if (this.dragState.mode === "rotate") {
        const pin = this.findPinById(puppet, this.dragState.pinId);

        if (!pin) {
          this.finishDrag(event);
          return;
        }

        const rotation = this.dragState.startRotation +
          this.getPinAngleFromEvent(pin, event) -
          this.dragState.startAngle;
        const pins = puppet.pins.map((item) =>
          item.id === this.dragState.pinId
            ? { ...item, rotation }
            : item,
        );

        this.patchLayerPuppet(layer.id, {
          ...puppet,
          pins,
        }, {
          historyGroup: this.dragState.historyGroup,
          source: "puppet-rotate",
        });
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const pins = puppet.pins.map((pin) =>
        pin.id === this.dragState.pinId
          ? { ...pin, x: point.x, y: point.y }
          : pin,
      );

      this.patchLayerPuppet(layer.id, {
        ...puppet,
        pins,
      }, {
        historyGroup: this.dragState.historyGroup,
        source: "puppet-drag",
      });
    }

    handlePointerMove(event) {
      if (!this.dragState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.updateDrag(event);
    }

    finishDrag(event) {
      if (!this.dragState) {
        return;
      }

      const historyGroup = this.dragState.historyGroup;

      if (event?.pointerId != null && this.svg.hasPointerCapture?.(event.pointerId)) {
        this.svg.releasePointerCapture(event.pointerId);
      }

      this.dragState = null;
      namespace.documentHistory?.endGroup?.(historyGroup);
      namespace.documentHistory?.flushLayerState?.(this.layerModel);
      this.render();
    }

    handlePointerUp(event) {
      if (!this.dragState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.finishDrag(event);
    }

    handlePointerCancel(event) {
      this.finishDrag(event);
    }

    handleTouchNavigationStart() {
      this.finishDrag();
    }

    createPinNode(pin) {
      const point = this.documentToViewportPoint(pin.x, pin.y);
      const rotationDegrees = (toFiniteNumber(pin.rotation, 0) * 180) / Math.PI;
      const group = createSvgElement("g", {
        class: "editor-puppet-pin",
        "data-puppet-pin-id": pin.id,
        transform: `translate(${point.x} ${point.y})`,
      });

      group.append(
        createSvgElement("circle", {
          class: "editor-puppet-pin-hit",
          cx: 0,
          cy: 0,
          fill: "transparent",
          r: PIN_HIT_RADIUS_CSS,
        }),
        createSvgElement("line", {
          class: "editor-puppet-pin-rotation",
          x1: 0,
          y1: 0,
          x2: 13,
          y2: 0,
          stroke: "#1473e6",
          "stroke-linecap": "round",
          "stroke-width": 1.4,
          transform: `rotate(${rotationDegrees})`,
          "vector-effect": "non-scaling-stroke",
        }),
        createSvgElement("circle", {
          class: "editor-puppet-pin-ring",
          cx: 0,
          cy: 0,
          fill: "rgba(20, 115, 230, 0.16)",
          r: 8,
          stroke: "#1473e6",
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
        }),
        createSvgElement("circle", {
          class: "editor-puppet-pin-core",
          cx: 0,
          cy: 0,
          fill: "#ffffff",
          r: 3.4,
          stroke: "#1473e6",
          "stroke-width": 1.5,
          "vector-effect": "non-scaling-stroke",
        }),
      );

      return group;
    }

    createMeshPath(layer, puppet) {
      const target = this.getLayerTarget(layer);

      if (!target?.texture || !this.documentRenderer?.writeRigidMlsPoint) {
        return null;
      }

      const { cols, rows } = this.getGridSize(layer, puppet);
      const targetRect = this.documentRenderer.getRasterTargetDocumentRect?.(target) || {
        x: Number.isFinite(target.x) ? target.x : 0,
        y: Number.isFinite(target.y) ? target.y : 0,
      };
      const localPins = this.documentRenderer.getPuppetLocalPins?.(layer, target) ||
        puppet.pins.map((pin) => ({
          ...pin,
          restX: (Number.isFinite(pin.restX) ? pin.restX : 0) - targetRect.x,
          restY: (Number.isFinite(pin.restY) ? pin.restY : 0) - targetRect.y,
          x: (Number.isFinite(pin.x) ? pin.x : 0) - targetRect.x,
          y: (Number.isFinite(pin.y) ? pin.y : 0) - targetRect.y,
        }));
      const sampleCols = cols * PUPPET_OVERLAY_ALPHA_SAMPLE_SCALE + 1;
      const sampleRows = rows * PUPPET_OVERLAY_ALPHA_SAMPLE_SCALE + 1;
      let alphaSamples = this.documentRenderer.getPuppetAlphaSamples
        ? this.documentRenderer.getPuppetAlphaSamples(target, sampleCols, sampleRows)
        : null;

      if (!alphaSamples?.length && this.documentRenderer.getPuppetAlphaMask) {
        const alphaMask = this.documentRenderer.getPuppetAlphaMask(target, sampleCols, sampleRows, {
          threshold: PUPPET_OVERLAY_ALPHA_THRESHOLD,
        });

        alphaSamples = Uint8Array.from(alphaMask || [], (value) => (value ? 255 : 0));
      }

      if (!alphaSamples?.length) {
        return null;
      }

      const vertices = new Float32Array((cols + 1) * (rows + 1) * 2);
      let vertexOffset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const sourceX = (gridX / cols) * target.width;
          const sourceY = (gridY / rows) * target.height;

          this.documentRenderer.writeRigidMlsPoint(vertices, vertexOffset, sourceX, sourceY, localPins);
          vertices[vertexOffset] += targetRect.x;
          vertices[vertexOffset + 1] += targetRect.y;
          vertexOffset += 2;
        }
      }

      const edges = new Set();
      const parts = [];
      const getAlphaAtGridPoint = (x, y) => {
        const sampleX = Math.max(0, Math.min(sampleCols - 1, Math.round((x / cols) * (sampleCols - 1))));
        const sampleY = Math.max(0, Math.min(sampleRows - 1, Math.round((y / rows) * (sampleRows - 1))));

        return alphaSamples[sampleY * sampleCols + sampleX] || 0;
      };
      const isAlphaVisible = (x, y) => getAlphaAtGridPoint(x, y) > PUPPET_OVERLAY_ALPHA_THRESHOLD;
      const isTriangleVisible = (points) => {
        const centroid = points.reduce((sum, point) => ({
          x: sum.x + point.x / points.length,
          y: sum.y + point.y / points.length,
        }), { x: 0, y: 0 });

        if (isAlphaVisible(centroid.x, centroid.y)) {
          return true;
        }

        return points.some((point) => isAlphaVisible(point.x, point.y));
      };

      const appendEdge = (startIndex, endIndex) => {
        const first = Math.min(startIndex, endIndex);
        const second = Math.max(startIndex, endIndex);
        const key = `${first}:${second}`;

        if (edges.has(key)) {
          return;
        }

        edges.add(key);

        const startOffset = startIndex * 2;
        const endOffset = endIndex * 2;
        const start = this.documentToViewportPoint(vertices[startOffset], vertices[startOffset + 1]);
        const end = this.documentToViewportPoint(vertices[endOffset], vertices[endOffset + 1]);

        parts.push(
          `M${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
          `L${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
        );
      };

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;
          const topLeft = { x, y, index: a };
          const topRight = { x: x + 1, y, index: b };
          const bottomLeft = { x, y: y + 1, index: c };
          const bottomRight = { x: x + 1, y: y + 1, index: d };

          if ((x + y) % 2 === 0) {
            if (isTriangleVisible([topLeft, bottomLeft, topRight])) {
              appendEdge(a, c);
              appendEdge(c, b);
              appendEdge(b, a);
            }

            if (isTriangleVisible([topRight, bottomLeft, bottomRight])) {
              appendEdge(b, c);
              appendEdge(c, d);
              appendEdge(d, b);
            }
          } else {
            if (isTriangleVisible([topLeft, bottomLeft, bottomRight])) {
              appendEdge(a, c);
              appendEdge(c, d);
              appendEdge(d, a);
            }

            if (isTriangleVisible([topLeft, bottomRight, topRight])) {
              appendEdge(a, d);
              appendEdge(d, b);
              appendEdge(b, a);
            }
          }
        }
      }

      if (parts.length === 0) {
        return null;
      }

      return createSvgElement("path", {
        class: "editor-puppet-mesh-triangles",
        d: parts.join(" "),
      });
    }

    render() {
      if (!this.svg || !this.meshGroup || !this.pinGroup) {
        return;
      }

      this.updateViewportSize();
      this.meshGroup.replaceChildren();
      this.pinGroup.replaceChildren();

      const layer = this.getActiveLayer();
      const isVisible = this.isActive() && this.isPuppetableLayer(layer);

      this.svg.classList.toggle("has-puppet-layer", isVisible);

      if (!isVisible) {
        return;
      }

      const puppet = this.getLayerPuppet(layer);
      const meshPath = this.createMeshPath(layer, puppet);

      if (meshPath) {
        this.meshGroup.append(meshPath);
      }

      puppet.pins.forEach((pin) => {
        this.pinGroup.append(this.createPinNode(pin));
      });
    }
  }

  namespace.PuppetTransformTool = PuppetTransformTool;
  namespace.ensurePuppetTransformTool = function ensurePuppetTransformTool() {
    const stage = document.querySelector(".editor-stage");
    const layerModel = namespace.documentLayerModel;
    const documentRenderer = namespace.documentRenderer;

    if (namespace.puppetTransformTool) {
      return namespace.puppetTransformTool;
    }

    if (!stage || !layerModel || !documentRenderer) {
      return null;
    }

    namespace.puppetTransformTool = new PuppetTransformTool({
      documentRenderer,
      layerModel,
      stage,
    });

    return namespace.puppetTransformTool;
  };

  namespace.initPuppetTransformTool = function initPuppetTransformTool() {
    if (namespace.puppetTransformToolBootstrapped) {
      return;
    }

    namespace.puppetTransformToolBootstrapped = true;

    window.addEventListener("cbo:tool-change", (event) => {
      if (!isPuppetToolDetail(event.detail)) {
        return;
      }

      if (namespace.puppetTransformTool) {
        return;
      }

      if (namespace.puppetTransformToolLoadFrame) {
        return;
      }

      setPuppetLoading(true);
      namespace.puppetTransformToolLoadFrame = window.requestAnimationFrame(() => {
        namespace.puppetTransformToolLoadFrame = 0;
        const tool = namespace.ensurePuppetTransformTool();

        tool?.handleToolChange?.(event);

        window.requestAnimationFrame(() => {
          setPuppetLoading(false);
        });
      });
    });
  };
})(window.CBO = window.CBO || {});
