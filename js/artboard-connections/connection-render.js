window.CBO = window.CBO || {};



(function registerConnectionRenderJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before connection-render.js.");

  }



  Controller.prototype.createConnectionPathD = function createConnectionPathD(start, end, viewScale = 1) {
    with (this) {

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
  };

  Controller.prototype.createSvgElement = function createSvgElement(name, attributes = {}) {
    with (this) {

    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
    }
  };

  Controller.prototype.createConnectionPath = function createConnectionPath(connection, options = {}) {
    with (this) {

    const sourceArtboard = getArtboardById(connection.sourceArtboardId);
    const sourceDoc = getActionAnchorPoint(sourceArtboard);
    const targetDoc = getConnectionEndPoint(connection);

    if (!sourceDoc || !targetDoc) {
      return null;
    }

    const plainArtboardMode = shouldUsePlainAiBoardArtboards();
    const source = plainArtboardMode ? documentPointToStagePoint(sourceDoc) : sourceDoc;
    const target = plainArtboardMode ? documentPointToStagePoint(targetDoc) : targetDoc;
    const viewScale = getViewScale();
    const pathScale = plainArtboardMode ? CONNECTION_PLAIN_GEOMETRY_SCALE * viewScale : 1;
    const strokeWidth = plainArtboardMode ? getPlainConnectionStrokeWidth() : getConnectionStrokeWidth(1);

    return createSvgElement("path", {
      class: `editor-artboard-connection-path${options.active ? " is-active" : ""}`,
      d: createConnectionPathD(source, target, pathScale),
      "data-connection-id": connection.id || "",
      "marker-end": "url(#editor-artboard-connection-arrow)",
      "stroke-width": strokeWidth,
    });
    }
  };

  Controller.prototype.createConnectionDefs = function createConnectionDefs() {
    with (this) {

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
  };

  Controller.prototype.roundConnectionGeometryValue = function roundConnectionGeometryValue(value) {
    with (this) {

    const number = Number(value);

    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
    }
  };

  Controller.prototype.getPointGeometryKey = function getPointGeometryKey(point) {
    with (this) {

    return point
      ? `${roundConnectionGeometryValue(point.x)},${roundConnectionGeometryValue(point.y)}`
      : "";
    }
  };

  Controller.prototype.getConnectionGeometryKey = function getConnectionGeometryKey() {
    with (this) {

    const records = connections.map((connection) => {
      const sourceArtboard = getArtboardById(connection.sourceArtboardId);
      const source = getActionAnchorPoint(sourceArtboard);
      const target = getConnectionEndPoint(connection);

      return [
        connection.id || "",
        connection.sourceArtboardId || "",
        connection.targetBoardId || "",
        connection.targetHandle || "",
        getPointGeometryKey(source),
        getPointGeometryKey(target),
      ].join(":");
    });

    if (connectionDrag) {
      const sourceArtboard = getArtboardById(connectionDrag.sourceArtboardId);
      const source = getActionAnchorPoint(sourceArtboard);
      const target = getConnectionEndPoint(connectionDrag);

      records.push([
        "drag",
        connectionDrag.id || "",
        connectionDrag.sourceArtboardId || "",
        getPointGeometryKey(source),
        getPointGeometryKey(target),
      ].join(":"));
    }

    if (shouldUsePlainAiBoardArtboards()) {
      const { camera, dpr } = getCameraState();

      records.push([
        "plain-view",
        roundConnectionGeometryValue(camera.x),
        roundConnectionGeometryValue(camera.y),
        roundConnectionGeometryValue(camera.zoom),
        roundConnectionGeometryValue(dpr),
      ].join(":"));
    }

    return records.join("|");
    }
  };

  Controller.prototype.renderConnections = function renderConnections(options = {}) {
    with (this) {

    const svg = ensureConnectionLayer();

    if (!svg) {
      return;
    }

    const geometryKey = getConnectionGeometryKey();

    if (
      options.force !== true &&
      geometryKey === lastConnectionsGeometryKey &&
      svg.dataset.connectionGeometryKey === geometryKey
    ) {
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

    svg.dataset.connectionGeometryKey = geometryKey;
    lastConnectionsGeometryKey = geometryKey;
    svg.replaceChildren(createConnectionDefs(), ...paths);
    }
  };

})(window.CBO);

