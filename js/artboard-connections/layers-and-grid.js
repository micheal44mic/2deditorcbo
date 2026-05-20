window.CBO = window.CBO || {};



(function registerLayersAndGridJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before layers-and-grid.js.");

  }



  Controller.prototype.ensureActionBubble = function ensureActionBubble(artboardId) {
    with (this) {

    const stage = getStage();
    const normalizedArtboardId = String(artboardId || "").trim();

    if (!stage || !getRenderer() || !normalizedArtboardId) {
      return null;
    }

    let bubble = Array.from(stage.querySelectorAll("[data-artboard-action-bubble]"))
      .find((element) => element.dataset.artboardId === normalizedArtboardId) || null;

    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "editor-artboard-action-bubble";
      bubble.dataset.artboardActionBubble = "";
      bubble.dataset.artboardId = normalizedArtboardId;
      bubble.setAttribute("aria-hidden", "true");
      bubble.addEventListener("pointerenter", () => {
        bubble.classList.add("is-hovered");
      });
      bubble.addEventListener("pointerleave", () => {
        bubble.classList.remove("is-hovered");
      });
      bubble.addEventListener("pointerdown", startConnectionDrag);
      bubble.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
          <circle cx="9" cy="9" r="2"></circle>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
        </svg>
      `;
      stage.appendChild(bubble);
    }

    bubble.dataset.artboardId = normalizedArtboardId;
    return bubble;
    }
  };

  Controller.prototype.ensureSpaceBoardLayer = function ensureSpaceBoardLayer() {
    with (this) {

    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-space-board-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-space-board-layer";
      layer.dataset.artboardSpaceBoardLayer = "";
      stage.appendChild(layer);
    }

    let pane = layer.querySelector("[data-space-board-pane]");

    if (!pane) {
      pane = document.createElement("div");
      pane.className = "editor-space-board-pane";
      pane.dataset.spaceBoardPane = "";

      const movableChildren = Array.from(layer.children).filter((child) => (
        child.matches?.("[data-artboard-connection-layer], [data-ai-image-board]")
      ));

      movableChildren.forEach((child) => pane.appendChild(child));
      layer.appendChild(pane);
    }

    return layer;
    }
  };

  Controller.prototype.ensureSpaceBoardPane = function ensureSpaceBoardPane() {
    with (this) {

    return ensureSpaceBoardLayer()?.querySelector("[data-space-board-pane]") || null;
    }
  };

  Controller.prototype.getSpaceBoardElement = function getSpaceBoardElement(boardId) {
    with (this) {

    const pane = ensureSpaceBoardPane();
    const normalizedBoardId = String(boardId || "").trim();

    if (!pane || !normalizedBoardId) {
      return null;
    }

    return Array.from(pane.querySelectorAll("[data-ai-image-board]"))
      .find((element) => element.dataset.boardId === normalizedBoardId) || null;
    }
  };

  Controller.prototype.setStylePropertyIfChanged = function setStylePropertyIfChanged(element, property, value) {
    with (this) {

    if (!element || element.style[property] === value) {
      return false;
    }

    element.style[property] = value;
    return true;
    }
  };

  Controller.prototype.setCssVarIfChanged = function setCssVarIfChanged(element, property, value) {
    with (this) {

    if (!element || element.style.getPropertyValue(property) === value) {
      return false;
    }

    element.style.setProperty(property, value);
    return true;
    }
  };

  Controller.prototype.setSvgAttributeIfChanged = function setSvgAttributeIfChanged(element, attribute, value) {
    with (this) {

    const nextValue = String(value);

    if (!element || element.getAttribute(attribute) === nextValue) {
      return false;
    }

    element.setAttribute(attribute, nextValue);
    return true;
    }
  };

  Controller.prototype.scheduleSpaceBoardPaneTransformIdle = function scheduleSpaceBoardPaneTransformIdle(pane) {
    with (this) {

    const layer = pane?.closest?.("[data-artboard-space-board-layer]");

    if (!pane || !layer) {
      return;
    }

    pane.classList.add("is-transforming");
    layer.classList.add("is-transforming");

    if (spaceBoardPaneTransformIdleTimer) {
      window.clearTimeout(spaceBoardPaneTransformIdleTimer);
    }

    spaceBoardPaneTransformIdleTimer = window.setTimeout(() => {
      spaceBoardPaneTransformIdleTimer = 0;
      pane.classList.remove("is-transforming");
      layer.classList.remove("is-transforming");
    }, SPACE_BOARD_PANE_TRANSFORM_IDLE_MS);
    }
  };

  Controller.prototype.ensureInfiniteCanvasDotGridOverlay = function ensureInfiniteCanvasDotGridOverlay() {
    with (this) {

    const stage = getStage();

    if (!stage) {
      return null;
    }

    let overlay = stage.querySelector("[data-editor-canvas-dot-grid]");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "editor-canvas-grid-pattern-overlay grid-pattern-overlay vue-flow__background vue-flow__container board-radial-grid-background fade-in board-radial-grid-layer";
      overlay.dataset.editorCanvasDotGrid = "";
      overlay.setAttribute("aria-hidden", "true");

      const svg = createSvgElement("svg", {
        class: "editor-canvas-grid-pattern-surface grid-pattern-surface",
        "shape-rendering": "crispEdges",
      });
      const defs = createSvgElement("defs");
      const pattern = createSvgElement("pattern", {
        id: CANVAS_DOT_GRID_PATTERN_ID,
        patternUnits: "userSpaceOnUse",
        x: 0,
        y: 0,
        width: CANVAS_DOT_GRID_BASE_WORLD_PX,
        height: CANVAS_DOT_GRID_BASE_WORLD_PX,
      });
      const horizontalLine = createSvgElement("rect", {
        "data-editor-canvas-dot-grid-horizontal": "",
        fill: "rgba(100,100,100,1.0)",
        height: 0.5,
        opacity: 0,
        width: CANVAS_DOT_GRID_BASE_WORLD_PX,
        x: 0,
        y: 0,
      });
      const verticalLine = createSvgElement("rect", {
        "data-editor-canvas-dot-grid-vertical": "",
        fill: "rgba(100,100,100,1.0)",
        height: CANVAS_DOT_GRID_BASE_WORLD_PX,
        opacity: 0,
        width: 0.5,
        x: 0,
        y: 0,
      });
      const dot = createSvgElement("rect", {
        "data-editor-canvas-dot-grid-dot": "",
        fill: "rgba(100,100,100,1.0)",
        height: 1,
        opacity: 1,
        width: 1,
        x: 0,
        y: 0,
      });
      const fill = createSvgElement("rect", {
        "data-editor-canvas-dot-grid-fill": "",
        fill: `url(#${CANVAS_DOT_GRID_PATTERN_ID})`,
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });

      pattern.append(horizontalLine, verticalLine, dot);
      defs.append(pattern);
      svg.append(defs, fill);
      overlay.append(svg);
      stage.prepend(overlay);
    }

    return {
      dot: overlay.querySelector("[data-editor-canvas-dot-grid-dot]"),
      fill: overlay.querySelector("[data-editor-canvas-dot-grid-fill]"),
      horizontalLine: overlay.querySelector("[data-editor-canvas-dot-grid-horizontal]"),
      overlay,
      pattern: overlay.querySelector("pattern"),
      svg: overlay.querySelector("svg"),
      verticalLine: overlay.querySelector("[data-editor-canvas-dot-grid-vertical]"),
    };
    }
  };

  Controller.prototype.computeInfiniteCanvasDotGrid = function computeInfiniteCanvasDotGrid(scale) {
    with (this) {

    const safeScale = Math.max(0.0001, Number(scale) || 1);
    const targetScreenSpacing = (CANVAS_DOT_GRID_TARGET_MIN_SCREEN_PX + CANVAS_DOT_GRID_TARGET_MAX_SCREEN_PX) * 0.5;
    const idealStep = Math.log2(targetScreenSpacing / (CANVAS_DOT_GRID_BASE_WORLD_PX * safeScale)) *
      CANVAS_DOT_GRID_STEPS_PER_OCTAVE;
    const step = Math.round(idealStep);
    const worldSpacing = CANVAS_DOT_GRID_BASE_WORLD_PX *
      Math.pow(2, step / CANVAS_DOT_GRID_STEPS_PER_OCTAVE);
    const screenSpacing = Math.max(1, worldSpacing * safeScale);
    const phase = ((step % CANVAS_DOT_GRID_STEPS_PER_OCTAVE) + CANVAS_DOT_GRID_STEPS_PER_OCTAVE) %
      CANVAS_DOT_GRID_STEPS_PER_OCTAVE;
    const phaseRatio = CANVAS_DOT_GRID_STEPS_PER_OCTAVE > 1
      ? phase / (CANVAS_DOT_GRID_STEPS_PER_OCTAVE - 1)
      : 1;
    const opacity = CANVAS_DOT_GRID_MIN_OPACITY +
      (CANVAS_DOT_GRID_MAX_OPACITY - CANVAS_DOT_GRID_MIN_OPACITY) * phaseRatio;

    return {
      opacity,
      screenSpacing,
      step,
      worldSpacing,
    };
    }
  };

  Controller.prototype.updateInfiniteCanvasDotGrid = function updateInfiniteCanvasDotGrid(viewState = this.getCameraState()) {
    with (this) {

    const grid = ensureInfiniteCanvasDotGridOverlay();

    if (!grid?.pattern || !grid.svg) {
      return;
    }

    const camera = viewState?.camera || {};
    const dpr = Math.max(0.0001, Number(viewState?.dpr) || 1);
    const scale = Math.max(0.0001, (Number(camera.zoom) || 1) / dpr);
    const { opacity, screenSpacing, step, worldSpacing } = computeInfiniteCanvasDotGrid(scale);
    const cameraX = (Number(camera.x) || 0) / dpr;
    const cameraY = (Number(camera.y) || 0) / dpr;
    const offsetX = cameraX % screenSpacing;
    const offsetY = cameraY % screenSpacing;
    const roundedSpacing = roundMetricValue(screenSpacing, 3);

    setSvgAttributeIfChanged(grid.pattern, "x", roundMetricValue(offsetX, 3));
    setSvgAttributeIfChanged(grid.pattern, "y", roundMetricValue(offsetY, 3));
    setSvgAttributeIfChanged(grid.pattern, "width", roundedSpacing);
    setSvgAttributeIfChanged(grid.pattern, "height", roundedSpacing);
    setSvgAttributeIfChanged(grid.horizontalLine, "width", roundedSpacing);
    setSvgAttributeIfChanged(grid.verticalLine, "height", roundedSpacing);
    setStylePropertyIfChanged(grid.svg, "opacity", String(roundMetricValue(opacity, 3)));
    grid.overlay.dataset.gridStep = String(step);
    grid.overlay.dataset.gridWorldSpacing = String(roundMetricValue(worldSpacing, 3));
    grid.overlay.dataset.gridScreenSpacing = String(roundedSpacing);
    }
  };

  Controller.prototype.renderSpaceBoardPaneTransform = function renderSpaceBoardPaneTransform() {
    with (this) {

    const viewState = getCameraState();
    updateInfiniteCanvasDotGrid(viewState);

    const pane = ensureSpaceBoardPane();

    if (!pane) {
      return null;
    }

    if (shouldUsePlainAiBoardArtboards()) {
      setStylePropertyIfChanged(pane, "transform", "none");
      setCssVarIfChanged(pane, "--editor-space-board-scale", "1");
      const labelMetrics = getArtboardLabelMetrics(AI_IMAGE_BOARD_SIZE_DOC_PX, AI_IMAGE_BOARD_SIZE_DOC_PX);

      setCssVarIfChanged(pane, "--editor-space-board-label-height", `${labelMetrics.height}px`);
      setCssVarIfChanged(pane, "--editor-space-board-label-padding-x", `${labelMetrics.paddingX}px`);
      setCssVarIfChanged(pane, "--editor-space-board-label-radius", `${labelMetrics.radius}px`);
      setCssVarIfChanged(pane, "--editor-space-board-label-font-size", `${labelMetrics.fontSize}px`);
      setCssVarIfChanged(pane, "--editor-space-board-label-top", `${labelMetrics.top}px`);
      return pane;
    }

    const { camera, dpr } = viewState;
    const scale = getViewScale();
    const tx = (Number(camera.x) || 0) / dpr;
    const ty = (Number(camera.y) || 0) / dpr;
    const transform = `matrix(${scale}, 0, 0, ${scale}, ${tx}, ${ty})`;
    const didChangeTransform = setStylePropertyIfChanged(pane, "transform", transform);

    setCssVarIfChanged(pane, "--editor-space-board-scale", String(scale));
    const labelMetrics = getArtboardLabelMetrics(AI_IMAGE_BOARD_SIZE_DOC_PX, AI_IMAGE_BOARD_SIZE_DOC_PX);

    setCssVarIfChanged(pane, "--editor-space-board-label-height", `${labelMetrics.height}px`);
    setCssVarIfChanged(pane, "--editor-space-board-label-padding-x", `${labelMetrics.paddingX}px`);
    setCssVarIfChanged(pane, "--editor-space-board-label-radius", `${labelMetrics.radius}px`);
    setCssVarIfChanged(pane, "--editor-space-board-label-font-size", `${labelMetrics.fontSize}px`);
    setCssVarIfChanged(pane, "--editor-space-board-label-top", `${labelMetrics.top}px`);

    if (didChangeTransform) {
      scheduleSpaceBoardPaneTransformIdle(pane);
    }

    return pane;
    }
  };

})(window.CBO);

