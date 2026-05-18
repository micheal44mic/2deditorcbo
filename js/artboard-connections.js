window.CBO = window.CBO || {};

(function registerArtboardConnections(namespace) {
  const ACTION_BUBBLE_SIZE_DOC_PX = 120;
  const ACTION_BUBBLE_GAP_DOC_PX = 24;
  const ACTION_BUBBLE_ICON_DOC_PX = 76;
  const ACTION_BUBBLE_MIN_CSS_PX = 28;
  const ACTION_BUBBLE_MAX_CSS_PX = 128;
  const ACTION_BUBBLE_VIEWPORT_PADDING_CSS_PX = 8;
  const CONNECTION_MIN_DRAG_CSS_PX = 6;
  const CONNECTION_CLICK_DISTANCE_CSS_PX = 220;
  const CONNECTION_ARROW_LENGTH_STROKE_UNITS = 5;
  const CONNECTION_MENU_GAP_CSS_PX = 14;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let connectionDrag = null;
  let connections = [];
  let anchorOverrides = new Map();
  let menuState = null;
  let menuDismissBound = false;
  let ignoreNextMenuDocumentClick = false;
  let connectionIdSeed = 1;
  let lastRenderContext = {
    artboardViews: [],
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    selectedArtboardId: "",
    viewScale: 1,
  };

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function cloneCamera(camera) {
    return {
      x: Number(camera?.x) || 0,
      y: Number(camera?.y) || 0,
      zoom: Math.max(0.0001, Number(camera?.zoom) || 1),
    };
  }

  function getCameraState() {
    const brushEngine = getBrushEngine();
    const camera = lastRenderContext.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera: cloneCamera(camera),
      dpr: Math.max(1, Number(lastRenderContext.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
  }

  function getAllArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    if (Array.isArray(artboards) && artboards.length > 0) {
      return artboards;
    }

    return lastRenderContext.artboardViews.map((view) => view.artboard).filter(Boolean);
  }

  function getArtboardById(artboardId) {
    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getViewScale() {
    const { camera, dpr } = getCameraState();

    return Math.max(0.0001, Number(camera.zoom) || 1) / dpr;
  }

  function getConnectionStrokeWidth(viewScale = getViewScale()) {
    return Math.max(0.5, 3 * (Number(viewScale) || 1));
  }

  function documentPointToStagePoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(camera.x) || 0) + (Number(point?.x) || 0) * zoom) / dpr,
      y: ((Number(camera.y) || 0) + (Number(point?.y) || 0) * zoom) / dpr,
    };
  }

  function stagePointToDocumentPoint(point, viewState = getCameraState()) {
    const { camera, dpr } = viewState;
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: ((Number(point?.x) || 0) * dpr - (Number(camera.x) || 0)) / zoom,
      y: ((Number(point?.y) || 0) * dpr - (Number(camera.y) || 0)) / zoom,
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

  function ensureActionBubble(artboardId) {
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

  function ensureConnectionLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let svg = stage.querySelector("[data-artboard-connection-layer]");

    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("editor-artboard-connection-layer");
      svg.dataset.artboardConnectionLayer = "";
    }

    if (stage.firstElementChild !== svg) {
      stage.insertBefore(svg, stage.firstElementChild || null);
    }

    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, rect.width || stage.clientWidth || 1);
    const height = Math.max(1, rect.height || stage.clientHeight || 1);

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    return svg;
  }

  function ensureConnectionMenu() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let menu = stage.querySelector("[data-artboard-connection-menu]");

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "editor-artboard-connection-menu";
      menu.dataset.artboardConnectionMenu = "";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-hidden", "true");
      menu.innerHTML = `
        <div class="editor-artboard-connection-menu-header">
          <div class="editor-artboard-connection-menu-title">Add...</div>
          <button class="editor-artboard-connection-menu-close" type="button" aria-label="Close connection menu" data-artboard-connection-dismiss>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-image">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
          <span>AI Image board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="ai-video">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m22 8-6 4 6 4V8Z"></path>
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
          </svg>
          <span>AI Video board</span>
        </button>
        <button class="editor-artboard-connection-menu-button" type="button" role="menuitem" data-artboard-connection-action="mockup">
          <svg class="editor-artboard-connection-menu-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 1.2.8L6 9.5V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5l1.94.46a1 1 0 0 0 1.2-.8l.58-3.47a2 2 0 0 0-1.34-2.23Z"></path>
          </svg>
          <span>Mockup</span>
        </button>
      `;
      menu.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      menu.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.target?.closest?.("[data-artboard-connection-dismiss]")) {
          dismissConnectionMenu();
        }
      });
      stage.appendChild(menu);
    }

    return menu;
  }

  function getActionAnchorPoint(artboard) {
    if (!artboard) {
      return null;
    }

    const artboardId = String(artboard.id || "").trim();
    const override = artboardId ? anchorOverrides.get(artboardId) : null;

    if (override) {
      return override;
    }

    return {
      x: (Number(artboard.x) || 0) +
        (Number(artboard.width) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX,
      y: (Number(artboard.y) || 0) +
        ACTION_BUBBLE_GAP_DOC_PX +
        ACTION_BUBBLE_SIZE_DOC_PX * 0.5,
    };
  }

  function createConnectionPathD(start, end, viewScale = 1) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const arrowInset = Math.min(
      getConnectionStrokeWidth(viewScale) * CONNECTION_ARROW_LENGTH_STROKE_UNITS,
      Math.max(0, length * 0.5),
    );
    const shaftEnd = {
      x: end.x - (dx / length) * arrowInset,
      y: end.y - (dy / length) * arrowInset,
    };
    const shaftDx = shaftEnd.x - start.x;
    const shaftDy = shaftEnd.y - start.y;
    const handleDistance = Math.max(48 * viewScale, Math.abs(shaftDx) * 0.5);
    const verticalEase = Math.min(Math.abs(shaftDy) * 0.18, 80 * viewScale);
    const control1 = {
      x: start.x + handleDistance,
      y: start.y + Math.sign(shaftDy || 1) * verticalEase,
    };
    const control2 = {
      x: shaftEnd.x - handleDistance,
      y: shaftEnd.y - Math.sign(shaftDy || 1) * verticalEase,
    };

    return `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${shaftEnd.x} ${shaftEnd.y}`;
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
  }

  function createConnectionPath(connection, options = {}) {
    const sourceArtboard = getArtboardById(connection.sourceArtboardId);
    const source = getActionAnchorPoint(sourceArtboard);

    if (!source || !Number.isFinite(Number(connection.endDocX)) || !Number.isFinite(Number(connection.endDocY))) {
      return null;
    }

    const viewState = getCameraState();
    const viewScale = getViewScale();
    const start = documentPointToStagePoint(source, viewState);
    const end = documentPointToStagePoint({ x: connection.endDocX, y: connection.endDocY }, viewState);

    return createSvgElement("path", {
      class: `editor-artboard-connection-path${options.active ? " is-active" : ""}`,
      d: createConnectionPathD(start, end, viewScale),
      "data-connection-id": connection.id || "",
      "marker-end": "url(#editor-artboard-connection-arrow)",
      "stroke-width": getConnectionStrokeWidth(viewScale),
    });
  }

  function createConnectionDefs() {
    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: "editor-artboard-connection-arrow",
      markerHeight: "5",
      markerUnits: "strokeWidth",
      markerWidth: "5",
      orient: "auto",
      refX: "0",
      refY: "2.5",
      viewBox: "0 0 5 5",
    });
    const arrow = createSvgElement("path", {
      d: "M 0 0 L 5 2.5 L 0 5 z",
      fill: "#f05023",
    });

    marker.appendChild(arrow);
    defs.appendChild(marker);

    return defs;
  }

  function renderConnections() {
    const svg = ensureConnectionLayer();

    if (!svg) {
      return;
    }

    const paths = connections
      .map((connection) => createConnectionPath(connection))
      .filter(Boolean);

    if (connectionDrag) {
      const activePath = createConnectionPath(connectionDrag, { active: true });

      if (activePath) {
        paths.push(activePath);
      }
    }

    svg.replaceChildren(createConnectionDefs(), ...paths);
  }

  function getConnectionById(connectionId) {
    const normalizedId = String(connectionId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return connections.find((connection) => connection.id === normalizedId) || null;
  }

  function bindMenuDismiss() {
    if (menuDismissBound) {
      return;
    }

    menuDismissBound = true;
    document.addEventListener("click", handleMenuDocumentClick, true);
    document.addEventListener("keydown", handleMenuKeydown, true);
  }

  function unbindMenuDismiss() {
    if (!menuDismissBound) {
      return;
    }

    menuDismissBound = false;
    document.removeEventListener("click", handleMenuDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
  }

  function showConnectionMenu(connection) {
    if (!connection?.id) {
      return;
    }

    menuState = {
      connectionId: connection.id,
    };
    ignoreNextMenuDocumentClick = true;
    window.setTimeout(() => {
      ignoreNextMenuDocumentClick = false;
    }, 0);
    bindMenuDismiss();
    renderConnectionMenu();
  }

  function renderConnectionOverlay() {
    renderActions();
    renderConnections();
    renderConnectionMenu();
  }

  function dismissConnectionMenu(options = {}) {
    const connectionId = String(menuState?.connectionId || "").trim();

    menuState = null;
    unbindMenuDismiss();

    const menu = getStage()?.querySelector("[data-artboard-connection-menu]");

    menu?.classList.remove("is-visible");
    menu?.setAttribute("aria-hidden", "true");

    if (options.removeConnection !== false && connectionId) {
      connections = connections.filter((connection) => connection.id !== connectionId);
    }

    if (options.render !== false) {
      renderConnectionOverlay();
    }
  }

  function handleMenuDocumentClick(event) {
    if (!menuState) {
      return;
    }

    if (ignoreNextMenuDocumentClick) {
      ignoreNextMenuDocumentClick = false;
      return;
    }

    if (event.target?.closest?.("[data-artboard-connection-menu]")) {
      return;
    }

    dismissConnectionMenu();
  }

  function handleMenuKeydown(event) {
    if (!menuState || event.key !== "Escape") {
      return;
    }

    dismissConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderConnectionMenu() {
    const menu = ensureConnectionMenu();

    if (!menu) {
      return;
    }

    const connection = getConnectionById(menuState?.connectionId);

    if (!connection) {
      menu.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      return;
    }

    const end = documentPointToStagePoint({
      x: connection.endDocX,
      y: connection.endDocY,
    });

    menu.classList.add("is-visible");
    menu.setAttribute("aria-hidden", "false");

    const height = menu.offsetHeight || 154;
    const left = end.x + CONNECTION_MENU_GAP_CSS_PX;
    const top = end.y - height * 0.5;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function createConnectionId() {
    const id = `artboard-connection-${Date.now().toString(36)}-${connectionIdSeed}`;
    connectionIdSeed += 1;
    return id;
  }

  function getDefaultConnectionEndPoint(sourceArtboardId) {
    const sourceArtboard = getArtboardById(sourceArtboardId);
    const anchor = getActionAnchorPoint(sourceArtboard);

    if (!anchor) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: anchor.x + (CONNECTION_CLICK_DISTANCE_CSS_PX * dpr) / zoom,
      y: anchor.y,
    };
  }

  function updateConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const dx = event.clientX - connectionDrag.startClientX;
    const dy = event.clientY - connectionDrag.startClientY;

    connectionDrag.endDocX = point.docX;
    connectionDrag.endDocY = point.docY;
    connectionDrag.didMove = connectionDrag.didMove ||
      Math.hypot(dx, dy) >= CONNECTION_MIN_DRAG_CSS_PX;
    renderConnections();
    event.preventDefault();
  }

  function finishConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    updateConnectionDrag(event);

    const connection = connectionDrag;
    const sourceElement = connection.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    const defaultEnd = connection.didMove
      ? null
      : getDefaultConnectionEndPoint(connection.sourceArtboardId);
    const finalizedConnection = {
      endDocX: defaultEnd?.x ?? connection.endDocX,
      endDocY: defaultEnd?.y ?? connection.endDocY,
      id: connection.id,
      sourceArtboardId: connection.sourceArtboardId,
    };

    connections.push(finalizedConnection);
    showConnectionMenu(finalizedConnection);

    renderConnections();
    renderConnectionMenu();
    event.preventDefault();
    event.stopPropagation();
  }

  function cancelConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }

    const sourceElement = connectionDrag.sourceElement;

    connectionDrag = null;
    document.removeEventListener("pointermove", updateConnectionDrag, true);
    document.removeEventListener("pointerup", finishConnectionDrag, true);
    document.removeEventListener("pointercancel", cancelConnectionDrag, true);

    try {
      sourceElement?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function startConnectionDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }

    if (menuState) {
      dismissConnectionMenu({ render: false });
    }

    const bubble = event.currentTarget;
    const sourceArtboardId = String(bubble?.dataset?.artboardId || lastRenderContext.selectedArtboardId || "").trim();
    const point = getEventDocumentPoint(event);

    if (!sourceArtboardId || !point || !getArtboardById(sourceArtboardId)) {
      return;
    }

    connectionDrag = {
      didMove: false,
      endDocX: point.docX,
      endDocY: point.docY,
      id: createConnectionId(),
      pointerId: event.pointerId,
      sourceArtboardId,
      sourceElement: bubble,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };

    try {
      bubble?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort for browser compatibility.
    }

    document.addEventListener("pointermove", updateConnectionDrag, true);
    document.addEventListener("pointerup", finishConnectionDrag, true);
    document.addEventListener("pointercancel", cancelConnectionDrag, true);
    renderConnections();
    event.preventDefault();
    event.stopPropagation();
  }

  function renderActions() {
    const selectedId = String(lastRenderContext.selectedArtboardId || "").trim();
    const visibleArtboardIds = new Set();

    if (selectedId) {
      visibleArtboardIds.add(selectedId);
    }

    connections.forEach((connection) => {
      const sourceArtboardId = String(connection?.sourceArtboardId || "").trim();

      if (sourceArtboardId) {
        visibleArtboardIds.add(sourceArtboardId);
      }
    });

    const activeSourceArtboardId = String(connectionDrag?.sourceArtboardId || "").trim();

    if (activeSourceArtboardId) {
      visibleArtboardIds.add(activeSourceArtboardId);
    }

    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();
    const stageWidth = Math.max(1, Number(stageRect?.width || stage?.clientWidth) || 1);
    const stageHeight = Math.max(1, Number(stageRect?.height || stage?.clientHeight) || 1);
    const scale = Math.max(0.0001, Number(lastRenderContext.viewScale) || 1);
    const maxViewportSize = Math.max(
      ACTION_BUBBLE_MIN_CSS_PX,
      Math.min(
        ACTION_BUBBLE_MAX_CSS_PX,
        stageWidth - ACTION_BUBBLE_VIEWPORT_PADDING_CSS_PX * 2,
        stageHeight - ACTION_BUBBLE_VIEWPORT_PADDING_CSS_PX * 2,
      ),
    );
    const size = clampNumber(
      ACTION_BUBBLE_SIZE_DOC_PX * scale,
      ACTION_BUBBLE_MIN_CSS_PX,
      maxViewportSize,
    );
    const visualScale = size / ACTION_BUBBLE_SIZE_DOC_PX;
    const gap = clampNumber(ACTION_BUBBLE_GAP_DOC_PX * scale, 6, 40);
    const iconSize = Math.max(1, ACTION_BUBBLE_ICON_DOC_PX * visualScale);
    const borderWidth = Math.max(0.5, 3 * visualScale);
    const renderedIds = new Set();
    const nextAnchorOverrides = new Map();

    lastRenderContext.artboardViews.forEach((view) => {
      if (!visibleArtboardIds.has(view.artboard.id)) {
        return;
      }

      const bubble = ensureActionBubble(view.artboard.id);

      if (!bubble) {
        return;
      }

      renderedIds.add(view.artboard.id);
      const left = view.left + view.width + gap;
      const top = view.top + gap;

      nextAnchorOverrides.set(view.artboard.id, stagePointToDocumentPoint({
        x: left + size,
        y: top + size * 0.5,
      }));

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.borderWidth = `${borderWidth}px`;
      bubble.style.setProperty("--artboard-action-icon-size", `${iconSize}px`);
      bubble.classList.add("is-visible");
    });

    anchorOverrides = nextAnchorOverrides;

    getStage()?.querySelectorAll("[data-artboard-action-bubble]").forEach((bubble) => {
      if (!renderedIds.has(bubble.dataset.artboardId || "")) {
        bubble.classList.remove("is-visible", "is-hovered");
      }
    });
  }

  namespace.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay(options = {}) {
    const camera = options.camera || getBrushEngine()?.camera || lastRenderContext.camera;
    const dpr = Math.max(1, Number(options.dpr || getBrushEngine()?.dpr || lastRenderContext.dpr || window.devicePixelRatio || 1));
    const viewScale = Number.isFinite(Number(options.viewScale))
      ? Number(options.viewScale)
      : Math.max(0.0001, Number(camera?.zoom) || 1) / dpr;

    lastRenderContext = {
      artboardViews: Array.isArray(options.artboardViews) ? options.artboardViews : [],
      camera: cloneCamera(camera),
      dpr,
      selectedArtboardId: String(options.selectedArtboardId || "").trim(),
      viewScale,
    };
    renderConnectionOverlay();
  };

  namespace.getArtboardConnections = function getArtboardConnections() {
    return connections.map((connection) => ({ ...connection }));
  };

  namespace.clearArtboardConnections = function clearArtboardConnections() {
    connections = [];
    connectionDrag = null;
    dismissConnectionMenu({ render: false });
    renderConnectionOverlay();
  };
})(window.CBO);
