(function registerVectorTextRenderer(namespace) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TEXT_LAYER_TYPE = "vector-text";
  const CORNER_ENVELOPE_NODES = ["TL", "TR", "BL", "BR"];
  const CENTER_ENVELOPE_NODES = ["TC", "BC"];
  const HANDLE_ENVELOPE_NODES = ["TC_HandleL", "TC_HandleR", "BC_HandleL", "BC_HandleR"];
  const ACTIVE_TEXT_RASTER_DEBOUNCE_MS = 180;
  const TEXT_RASTER_PREVIEW_MS = 260;
  const TEXT_RASTER_BOUNDS_PADDING = 2;
  const TEXT_RASTER_DEBUG = true;

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, String(value));
      }
    });

    return element;
  }

  function bytesToMega(bytes) {
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  function getRasterDebugStats(size, rasterBox) {
    const documentPixels = Math.max(1, Math.round(size.width * size.height));
    const cropPixels = rasterBox
      ? Math.max(1, Math.round(rasterBox.width * rasterBox.height))
      : 0;
    const documentBytes = documentPixels * 4;
    const cropBytes = cropPixels * 4;
    const savedBytes = Math.max(0, documentBytes - cropBytes);
    const reduction = documentBytes > 0
      ? Math.round((1 - cropBytes / documentBytes) * 1000) / 10
      : 0;

    return {
      cropBytes,
      cropMB: bytesToMega(cropBytes),
      cropPixels,
      documentBytes,
      documentMB: bytesToMega(documentBytes),
      documentPixels,
      reduction,
      savedMB: bytesToMega(savedBytes),
    };
  }

  function isTextLayer(entry) {
    return entry?.type === TEXT_LAYER_TYPE || entry?.type === "text" || entry?.kind === "text";
  }

  function isFormField(target) {
    return (
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable)
    );
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    }

    return value;
  }

  function findEntryById(entries, id) {
    for (const entry of entries || []) {
      if (entry.id === id) {
        return entry;
      }

      const child = findEntryById(entry.children || [], id);

      if (child) {
        return child;
      }
    }

    return null;
  }

  function insertEntryAbove(entries, targetId, entry) {
    if (!targetId) {
      return false;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const current = entries[index];

      if (current.id === targetId) {
        entries.splice(index, 0, entry);
        return true;
      }

      if (current.type === "group" && insertEntryAbove(current.children || [], targetId, entry)) {
        return true;
      }
    }

    return false;
  }

  function insertAboveBackground(entries, entry) {
    const backgroundIndex = entries.findIndex(
      (candidate) => candidate.id === "background" || candidate.type === "background",
    );
    const index = backgroundIndex >= 0 ? backgroundIndex : entries.length;

    entries.splice(index, 0, entry);
  }

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function formatLayerTransform(layer) {
    const x = toFiniteNumber(layer.x, 0);
    const y = toFiniteNumber(layer.y, 0);
    const rotation = toFiniteNumber(layer.rotation, 0);
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);

    return `translate(${x} ${y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`;
  }

  function pointList(...points) {
    return points.map((point) => `${point.x} ${point.y}`).join(" ");
  }

  function topCurvePath(grid) {
    const p1 = {
      x: grid.TL.x + (grid.TC.x - grid.TL.x) / 3,
      y: grid.TL.y,
    };
    const p2 = {
      x: grid.TR.x - (grid.TR.x - grid.TC.x) / 3,
      y: grid.TR.y,
    };

    return [
      `M ${grid.TL.x} ${grid.TL.y}`,
      `C ${p1.x} ${p1.y} ${grid.TC_HandleL.x} ${grid.TC_HandleL.y} ${grid.TC.x} ${grid.TC.y}`,
      `C ${grid.TC_HandleR.x} ${grid.TC_HandleR.y} ${p2.x} ${p2.y} ${grid.TR.x} ${grid.TR.y}`,
    ].join(" ");
  }

  function bottomCurvePath(grid) {
    const p1 = {
      x: grid.BL.x + (grid.BC.x - grid.BL.x) / 3,
      y: grid.BL.y,
    };
    const p2 = {
      x: grid.BR.x - (grid.BR.x - grid.BC.x) / 3,
      y: grid.BR.y,
    };

    return [
      `M ${grid.BL.x} ${grid.BL.y}`,
      `C ${p1.x} ${p1.y} ${grid.BC_HandleL.x} ${grid.BC_HandleL.y} ${grid.BC.x} ${grid.BC.y}`,
      `C ${grid.BC_HandleR.x} ${grid.BC_HandleR.y} ${p2.x} ${p2.y} ${grid.BR.x} ${grid.BR.y}`,
    ].join(" ");
  }

  function envelopeOutlinePath(grid) {
    const topLeftControl = {
      x: grid.TL.x + (grid.TC.x - grid.TL.x) / 3,
      y: grid.TL.y,
    };
    const topRightControl = {
      x: grid.TR.x - (grid.TR.x - grid.TC.x) / 3,
      y: grid.TR.y,
    };
    const bottomLeftControl = {
      x: grid.BL.x + (grid.BC.x - grid.BL.x) / 3,
      y: grid.BL.y,
    };
    const bottomRightControl = {
      x: grid.BR.x - (grid.BR.x - grid.BC.x) / 3,
      y: grid.BR.y,
    };

    return [
      `M ${grid.TL.x} ${grid.TL.y}`,
      `C ${topLeftControl.x} ${topLeftControl.y} ${grid.TC_HandleL.x} ${grid.TC_HandleL.y} ${grid.TC.x} ${grid.TC.y}`,
      `C ${grid.TC_HandleR.x} ${grid.TC_HandleR.y} ${topRightControl.x} ${topRightControl.y} ${grid.TR.x} ${grid.TR.y}`,
      `L ${grid.BR.x} ${grid.BR.y}`,
      `C ${bottomRightControl.x} ${bottomRightControl.y} ${grid.BC_HandleR.x} ${grid.BC_HandleR.y} ${grid.BC.x} ${grid.BC.y}`,
      `C ${grid.BC_HandleL.x} ${grid.BC_HandleL.y} ${bottomLeftControl.x} ${bottomLeftControl.y} ${grid.BL.x} ${grid.BL.y}`,
      "Z",
    ].join(" ");
  }

  function colorWithOpacity(color, opacity) {
    const clampedOpacity = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
    const hex = String(color || "#000000").trim();

    if (clampedOpacity >= 1) {
      return hex;
    }

    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      const [r, g, b] = hex
        .slice(1)
        .split("")
        .map((value) => Number.parseInt(value + value, 16));

      return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
    }

    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);

      return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
    }

    return hex;
  }

  let solidShadowCacheKey = "";
  let solidShadowCacheValue = "";

  function createSolidShadowExtrusionPathData(pathData, offsetX, offsetY) {
    const offsetXRounded = Math.round(offsetX * 100) / 100;
    const offsetYRounded = Math.round(offsetY * 100) / 100;
    const cacheKey = `${pathData}|${offsetXRounded}|${offsetYRounded}`;

    if (solidShadowCacheKey === cacheKey) {
      return solidShadowCacheValue;
    }

    const tokens = String(pathData || "").match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
    const segments = [];
    let index = 0;
    let command = "";
    let current = { x: 0, y: 0 };
    let contourStart = { x: 0, y: 0 };

    function toNum(token) {
      const value = Number(token);

      return Number.isFinite(value) ? value : 0;
    }

    function formatPoint(point) {
      return `${Math.round(point.x * 100) / 100} ${Math.round(point.y * 100) / 100}`;
    }

    function formatOffsetPoint(point) {
      return `${Math.round((point.x + offsetX) * 100) / 100} ${Math.round((point.y + offsetY) * 100) / 100}`;
    }

    function needsReverse(start, end) {
      return (end.x - start.x) * offsetY - (end.y - start.y) * offsetX < 0;
    }

    function addLinePatch(start, end) {
      if (Math.abs(end.x - start.x) < 0.01 && Math.abs(end.y - start.y) < 0.01) {
        return;
      }

      if (needsReverse(start, end)) {
        segments.push(`M ${formatPoint(start)} L ${formatOffsetPoint(start)} L ${formatOffsetPoint(end)} L ${formatPoint(end)} Z`);
      } else {
        segments.push(`M ${formatPoint(start)} L ${formatPoint(end)} L ${formatOffsetPoint(end)} L ${formatOffsetPoint(start)} Z`);
      }
    }

    function addQuadraticPatch(start, control, end) {
      if (Math.abs(end.x - start.x) < 0.01 && Math.abs(end.y - start.y) < 0.01) {
        return;
      }

      if (needsReverse(start, end)) {
        segments.push(`M ${formatPoint(start)} L ${formatOffsetPoint(start)} Q ${formatOffsetPoint(control)} ${formatOffsetPoint(end)} L ${formatPoint(end)} Q ${formatPoint(control)} ${formatPoint(start)} Z`);
      } else {
        segments.push(`M ${formatPoint(start)} Q ${formatPoint(control)} ${formatPoint(end)} L ${formatOffsetPoint(end)} Q ${formatOffsetPoint(control)} ${formatOffsetPoint(start)} Z`);
      }
    }

    function addCubicPatch(start, controlA, controlB, end) {
      if (Math.abs(end.x - start.x) < 0.01 && Math.abs(end.y - start.y) < 0.01) {
        return;
      }

      if (needsReverse(start, end)) {
        segments.push(`M ${formatPoint(start)} L ${formatOffsetPoint(start)} C ${formatOffsetPoint(controlA)} ${formatOffsetPoint(controlB)} ${formatOffsetPoint(end)} L ${formatPoint(end)} C ${formatPoint(controlB)} ${formatPoint(controlA)} ${formatPoint(start)} Z`);
      } else {
        segments.push(`M ${formatPoint(start)} C ${formatPoint(controlA)} ${formatPoint(controlB)} ${formatPoint(end)} L ${formatOffsetPoint(end)} C ${formatOffsetPoint(controlB)} ${formatOffsetPoint(controlA)} ${formatOffsetPoint(start)} Z`);
      }
    }

    while (index < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[index])) {
        command = tokens[index];
        index += 1;
      }

      const normalized = command.toUpperCase();
      const relative = command !== normalized;

      if (normalized === "M") {
        const x = toNum(tokens[index]);
        const y = toNum(tokens[index + 1]);

        index += 2;
        current = relative ? { x: current.x + x, y: current.y + y } : { x, y };
        contourStart = current;
        command = relative ? "l" : "L";
      } else if (normalized === "L") {
        const x = toNum(tokens[index]);
        const y = toNum(tokens[index + 1]);
        const next = relative ? { x: current.x + x, y: current.y + y } : { x, y };

        index += 2;
        addLinePatch(current, next);
        current = next;
      } else if (normalized === "H") {
        const x = toNum(tokens[index]);
        const next = relative ? { x: current.x + x, y: current.y } : { x, y: current.y };

        index += 1;
        addLinePatch(current, next);
        current = next;
      } else if (normalized === "V") {
        const y = toNum(tokens[index]);
        const next = relative ? { x: current.x, y: current.y + y } : { x: current.x, y };

        index += 1;
        addLinePatch(current, next);
        current = next;
      } else if (normalized === "Q") {
        const controlX = toNum(tokens[index]);
        const controlY = toNum(tokens[index + 1]);
        const endX = toNum(tokens[index + 2]);
        const endY = toNum(tokens[index + 3]);
        const control = relative
          ? { x: current.x + controlX, y: current.y + controlY }
          : { x: controlX, y: controlY };
        const next = relative
          ? { x: current.x + endX, y: current.y + endY }
          : { x: endX, y: endY };

        index += 4;
        addQuadraticPatch(current, control, next);
        current = next;
      } else if (normalized === "C") {
        const controlAX = toNum(tokens[index]);
        const controlAY = toNum(tokens[index + 1]);
        const controlBX = toNum(tokens[index + 2]);
        const controlBY = toNum(tokens[index + 3]);
        const endX = toNum(tokens[index + 4]);
        const endY = toNum(tokens[index + 5]);
        const controlA = relative
          ? { x: current.x + controlAX, y: current.y + controlAY }
          : { x: controlAX, y: controlAY };
        const controlB = relative
          ? { x: current.x + controlBX, y: current.y + controlBY }
          : { x: controlBX, y: controlBY };
        const next = relative
          ? { x: current.x + endX, y: current.y + endY }
          : { x: endX, y: endY };

        index += 6;
        addCubicPatch(current, controlA, controlB, next);
        current = next;
      } else if (normalized === "Z") {
        addLinePatch(current, contourStart);
        current = contourStart;
      } else {
        break;
      }
    }

    solidShadowCacheKey = cacheKey;
    solidShadowCacheValue = segments.join(" ");

    return solidShadowCacheValue;
  }

  function getLayerSignature(layer) {
    return JSON.stringify({
      envelopeGrid: layer.envelopeGrid || null,
      alternates: layer.alternates,
      fontSize: layer.fontSize,
      fontUrl: layer.fontUrl,
      letterSpacing: layer.letterSpacing,
      ligatures: layer.ligatures,
      lineHeight: layer.lineHeight,
      text: layer.text,
      textAlign: layer.textAlign,
      uppercase: layer.uppercase,
      warp: layer.warp || null,
    });
  }

  function getTextRasterSignature(layer, pathData, size, rasterBox) {
    return JSON.stringify({
      documentHeight: size.height,
      documentWidth: size.width,
      pathData,
      rasterBox: rasterBox ? {
        height: rasterBox.height,
        width: rasterBox.width,
        x: rasterBox.x,
        y: rasterBox.y,
      } : null,
      rotation: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      shadowAngle: layer.shadowAngle,
      shadowDistance: layer.shadowDistance,
      shadowType: layer.shadowType,
      style: layer.style || null,
      x: layer.x,
      y: layer.y,
    });
  }

  function serializeTextLayerSvg(layerNode, defs, size, rasterBox = null) {
    const box = rasterBox || {
      height: size.height,
      width: size.width,
      x: 0,
      y: 0,
    };
    const svg = createSvgElement("svg", {
      height: box.height,
      viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`,
      width: box.width,
      xmlns: SVG_NS,
    });

    if (defs?.length) {
      const defsNode = createSvgElement("defs");

      defs.forEach((definition) => defsNode.append(definition));
      svg.append(defsNode);
    }

    svg.append(layerNode);

    return new XMLSerializer().serializeToString(svg);
  }

  function loadSvgImage(svgMarkup) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Impossibile aggiornare la texture del testo vettoriale."));
      };

      image.src = objectUrl;
    });
  }

  function safeDomId(value) {
    return String(value || "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/^-+/, "id-");
  }

  function getStrokeAlign(layer) {
    return ["outer", "inner", "center"].includes(layer.style?.strokeAlign)
      ? layer.style.strokeAlign
      : "center";
  }

  function hasFiniteBounds(bounds) {
    return (
      bounds &&
      Number.isFinite(bounds.x1) &&
      Number.isFinite(bounds.y1) &&
      Number.isFinite(bounds.x2) &&
      Number.isFinite(bounds.y2) &&
      bounds.x2 > bounds.x1 &&
      bounds.y2 > bounds.y1
    );
  }

  function cloneBounds(bounds) {
    return {
      x1: bounds.x1,
      y1: bounds.y1,
      x2: bounds.x2,
      y2: bounds.y2,
    };
  }

  function expandBounds(bounds, amount) {
    const pad = Math.max(0, toFiniteNumber(amount, 0));

    return {
      x1: bounds.x1 - pad,
      y1: bounds.y1 - pad,
      x2: bounds.x2 + pad,
      y2: bounds.y2 + pad,
    };
  }

  function offsetBounds(bounds, dx, dy) {
    return {
      x1: bounds.x1 + dx,
      y1: bounds.y1 + dy,
      x2: bounds.x2 + dx,
      y2: bounds.y2 + dy,
    };
  }

  function includeBounds(target, bounds) {
    if (!hasFiniteBounds(bounds)) {
      return target;
    }

    target.x1 = Math.min(target.x1, bounds.x1);
    target.y1 = Math.min(target.y1, bounds.y1);
    target.x2 = Math.max(target.x2, bounds.x2);
    target.y2 = Math.max(target.y2, bounds.y2);

    return target;
  }

  function getLayerShadowOffset(layer) {
    const angle = (toFiniteNumber(layer.shadowAngle, 0) * Math.PI) / 180;
    const distance = Math.max(0, toFiniteNumber(layer.shadowDistance, 0));

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }

  function getTextStrokePadding(layer) {
    const strokeWidth = Math.max(0, toFiniteNumber(layer.style?.strokeWidth, 0));
    const strokeAlign = getStrokeAlign(layer);

    if (strokeWidth <= 0 || strokeAlign === "inner") {
      return 0;
    }

    return strokeAlign === "outer" ? strokeWidth : strokeWidth / 2;
  }

  function getTextLocalRasterBounds(layer, pathBounds) {
    if (!hasFiniteBounds(pathBounds)) {
      return null;
    }

    const paintBounds = expandBounds(pathBounds, getTextStrokePadding(layer));
    const bounds = cloneBounds(paintBounds);
    const shadow = layer.style?.shadow || {};
    const shadowOpacity = Number.isFinite(shadow.opacity) ? shadow.opacity : 0;

    if (shadowOpacity <= 0) {
      return bounds;
    }

    const offset = getLayerShadowOffset(layer);

    if (layer.shadowType === "drop") {
      const blur = Math.max(0, toFiniteNumber(shadow.blur, 0));
      const blurPad = Math.ceil(blur * 2 + 2);

      includeBounds(bounds, expandBounds(offsetBounds(paintBounds, offset.x, offset.y), blurPad));
    } else if (layer.shadowType === "solid") {
      const distance = Math.hypot(offset.x, offset.y);

      if (distance > 0) {
        includeBounds(bounds, expandBounds(pathBounds, 2));
        includeBounds(bounds, expandBounds(offsetBounds(pathBounds, offset.x, offset.y), 2));
      }
    }

    return bounds;
  }

  function transformLayerPoint(layer, point) {
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);
    const radians = (toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = point.x * scaleX;
    const y = point.y * scaleY;

    return {
      x: toFiniteNumber(layer.x, 0) + x * cos - y * sin,
      y: toFiniteNumber(layer.y, 0) + x * sin + y * cos,
    };
  }

  function transformLayerBounds(layer, bounds) {
    const points = [
      transformLayerPoint(layer, { x: bounds.x1, y: bounds.y1 }),
      transformLayerPoint(layer, { x: bounds.x2, y: bounds.y1 }),
      transformLayerPoint(layer, { x: bounds.x1, y: bounds.y2 }),
      transformLayerPoint(layer, { x: bounds.x2, y: bounds.y2 }),
    ];

    return points.reduce(
      (next, point) => ({
        x1: Math.min(next.x1, point.x),
        y1: Math.min(next.y1, point.y),
        x2: Math.max(next.x2, point.x),
        y2: Math.max(next.y2, point.y),
      }),
      { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
    );
  }

  function getClampedRasterBox(bounds, size) {
    const paddedBounds = expandBounds(bounds, TEXT_RASTER_BOUNDS_PADDING);
    const x1 = Math.max(0, Math.min(size.width, paddedBounds.x1));
    const y1 = Math.max(0, Math.min(size.height, paddedBounds.y1));
    const x2 = Math.max(0, Math.min(size.width, paddedBounds.x2));
    const y2 = Math.max(0, Math.min(size.height, paddedBounds.y2));

    if (x2 <= x1 || y2 <= y1) {
      return null;
    }

    const x = Math.floor(x1);
    const y = Math.floor(y1);
    const width = Math.max(1, Math.min(size.width - x, Math.ceil(x2) - x));
    const height = Math.max(1, Math.min(size.height - y, Math.ceil(y2) - y));

    return { height, width, x, y };
  }

  function getTextLayerRasterBox(layer, pathBounds, size) {
    const localBounds = getTextLocalRasterBounds(layer, pathBounds);

    if (!localBounds) {
      return null;
    }

    return getClampedRasterBox(transformLayerBounds(layer, localBounds), size);
  }

  function resolveCameraState() {
    const brushEngine = namespace.brushEngine;
    const camera = brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera,
      dpr: Math.max(1, brushEngine?.dpr || window.devicePixelRatio || 1),
      viewportHeight: Math.max(1, brushEngine?.viewportHeight || 1),
      viewportWidth: Math.max(1, brushEngine?.viewportWidth || 1),
    };
  }

  function getCenteredDocumentPoint() {
    const stage = document.querySelector(".editor-stage");
    const { camera, dpr } = resolveCameraState();
    const rect = stage?.getBoundingClientRect();
    const viewportX = ((rect?.width || 1) * dpr) / 2;
    const viewportY = ((rect?.height || 1) * dpr) / 2;
    const zoom = Math.max(0.0001, camera.zoom || 1);

    return {
      x: (viewportX - (camera.x || 0)) / zoom,
      y: (viewportY - (camera.y || 0)) / zoom,
    };
  }

  function getLayerVisualCenterOffset(layer, bounds) {
    const centerX = (bounds.x1 + bounds.x2) / 2;
    const centerY = (bounds.y1 + bounds.y2) / 2;
    const scaleX = toFiniteNumber(layer.scaleX, 1);
    const scaleY = toFiniteNumber(layer.scaleY, 1);
    const radians = (toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
    const scaledX = centerX * scaleX;
    const scaledY = centerY * scaleY;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: scaledX * cos - scaledY * sin,
      y: scaledX * sin + scaledY * cos,
    };
  }

  function getWarpedTextBounds(layer, font) {
    const engine = namespace.VectorTextEngine;
    const path = engine.createTextPath(font, layer.text, layer.fontSize, {
      letterSpacing: layer.letterSpacing,
      ligatures: layer.ligatures,
      lineHeight: layer.lineHeight,
      textAlign: layer.textAlign,
      uppercase: layer.uppercase,
    });
    const bounds = path.getBoundingBox();

    if (layer.envelopeGrid) {
      engine.applyEnvelopeWarp(path, layer.envelopeGrid);
    } else {
      path.commands = engine.warpPathCommands(path.commands, bounds, layer.warp);
    }

    return path.getBoundingBox();
  }

  function centerVectorTextLayer(layerModel, layerId, targetPoint, historyGroup = "") {
    const engine = namespace.VectorTextEngine;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!layer || !engine?.loadOpenTypeFont) {
      return Promise.resolve(false);
    }

    const initialX = layer.x;
    const initialY = layer.y;

    return engine
      .loadOpenTypeFont(layer.fontUrl || engine.DEFAULT_FONT_URL)
      .then((font) => {
        const currentLayer = layerModel.findEntryById(layerId);

        if (!currentLayer || currentLayer.x !== initialX || currentLayer.y !== initialY) {
          return false;
        }

        const bounds = getWarpedTextBounds(currentLayer, font);
        const offset = getLayerVisualCenterOffset(currentLayer, bounds);

        layerModel.updateLayer(layerId, {
          x: targetPoint.x - offset.x,
          y: targetPoint.y - offset.y,
        }, {
          historyGroup,
          source: "vector-text-center",
        });

        return true;
      })
      .catch((error) => {
        console.warn("Impossibile centrare il testo vettoriale.", error);
        return false;
      });
  }

  namespace.createVectorTextLayer = function createVectorTextLayer(seed = {}) {
    const layerModel = namespace.documentLayerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (!layerModel) {
      return null;
    }

    namespace.documentLayerModel = layerModel;

    const centeredPoint = getCenteredDocumentPoint();
    const shouldCenterVisually = !Number.isFinite(seed.x) && !Number.isFinite(seed.y);
    const layer = layerModel.createLayer({
      type: TEXT_LAYER_TYPE,
      x: Number.isFinite(seed.x) ? seed.x : centeredPoint.x,
      y: Number.isFinite(seed.y) ? seed.y : centeredPoint.y,
      ...seed,
    });
    const entries = layerModel.getEntries();
    const activeLayer = findEntryById(entries, layerModel.activeLayerId);
    const didInsert = activeLayer?.type !== "background"
      ? insertEntryAbove(entries, activeLayer?.id, layer)
      : false;
    const historyGroup = `vector-text-create-${layer.id}`;
    let shouldEndCreateGroup = true;

    if (!didInsert) {
      insertAboveBackground(entries, layer);
    }

    namespace.documentHistory?.beginGroup?.(historyGroup);

    try {
      layerModel.setEntries(entries, { historyGroup, source: "vector-text-create" });
      layerModel.setActiveLayer(layer.id, { historyGroup, source: "vector-text-create" });

      if (shouldCenterVisually) {
        shouldEndCreateGroup = false;
        void centerVectorTextLayer(layerModel, layer.id, centeredPoint, historyGroup)
          .finally(() => {
            namespace.documentHistory?.endGroup?.(historyGroup);
          });
      }
    } finally {
      if (shouldEndCreateGroup) {
        namespace.documentHistory?.endGroup?.(historyGroup);
      }
    }

    return cloneValue(layer);
  };

  class VectorTextRenderer {
    constructor(options = {}) {
      this.stage = options.stage;
      this.layerModel = options.layerModel;
      this.svg = null;
      this.defs = null;
      this.hitArea = null;
      this.viewportGroup = null;
      this.contentGroup = null;
      this.debugGroup = null;
      this.pathCache = new Map();
      this.fontCache = new Map();
      this.fontRequests = new Map();
      this.rasterLayerCache = new Map();
      this.rasterGeneration = 0;
      this.previewTimer = 0;
      this.frameRequest = 0;
      this.interactionTimer = 0;
      this.isInteracting = false;
      this.activeTool = "";
      this.dragState = null;
      this.envelopeDragState = null;

      this.handleCameraChange = this.handleCameraChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleDragMove = this.handleDragMove.bind(this);
      this.handleDragEnd = this.handleDragEnd.bind(this);
      this.handleEnvelopeDragMove = this.handleEnvelopeDragMove.bind(this);
      this.handleEnvelopeDragEnd = this.handleEnvelopeDragEnd.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);

      this.mount();
      this.bindEvents();
      this.scheduleContentRender();
    }

    mount() {
      if (!this.stage) {
        throw new Error("VectorTextRenderer richiede .editor-stage.");
      }

      this.svg = createSvgElement("svg", {
        "aria-label": "Layer testo vettoriali",
        class: "editor-vector-overlay",
        focusable: "false",
      });
      this.defs = createSvgElement("defs");
      this.hitArea = createSvgElement("rect", {
        class: "editor-vector-hit-area",
        fill: "transparent",
        height: "100%",
        width: "100%",
        x: 0,
        y: 0,
      });
      this.viewportGroup = createSvgElement("g", { class: "editor-vector-viewport" });
      this.contentGroup = createSvgElement("g", { class: "editor-vector-content" });
      this.debugGroup = createSvgElement("g", {
        class: "editor-vector-raster-debug",
        "pointer-events": "none",
      });

      this.viewportGroup.append(this.contentGroup, this.debugGroup);
      this.svg.append(this.defs, this.hitArea, this.viewportGroup);
      this.stage.append(this.svg);
      this.updateViewportSize();
      this.updateCameraTransform();
    }

    bindEvents() {
      window.addEventListener("cbo:camera-change", this.handleCameraChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("resize", () => {
        this.updateViewportSize();
        this.updateCameraTransform();
      });
      this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
      this.svg.addEventListener("pointerdown", this.handlePointerDown);
      this.layerModel?.addEventListener?.("change", this.handleDocumentChange);
    }

    handleWheel(event) {
      namespace.brushEngine?.handleWheel?.(event);
    }

    handleToolChange(event) {
      const detail = event.detail || {};
      const label = String(detail.label || "").toLowerCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();
      this.activeTool = toolMode || label;
      this.svg.classList.toggle("text-tool-active", this.activeTool === "text" || this.activeTool === "type");

      if (this.activeTool === "text" || this.activeTool === "type") {
        namespace.createVectorTextLayer();
      }
    }

    handleDocumentChange() {
      this.scheduleContentRender();
    }

    handleCameraChange() {
      this.updateViewportSize();
      this.updateCameraTransform();
      this.beginInteraction();
    }

    handleKeyDown(event) {
      if (isFormField(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        const layer = this.getActiveTextLayer();

        if (!layer) {
          return;
        }

        event.preventDefault();
        namespace.createVectorTextLayer({
          ...cloneValue(layer),
          id: undefined,
          name: `${layer.name || "Text"} Copy`,
          x: toFiniteNumber(layer.x, 0) + 120,
          y: toFiniteNumber(layer.y, 0) + 120,
        });
      }
    }

    beginInteraction() {
      if (!this.isInteracting) {
        this.isInteracting = true;
        this.svg.classList.add("is-interacting");
        this.scheduleContentRender();
      }

      if (this.interactionTimer) {
        window.clearTimeout(this.interactionTimer);
      }

      this.interactionTimer = window.setTimeout(() => {
        this.isInteracting = false;
        this.svg.classList.remove("is-interacting");
        this.interactionTimer = 0;
        this.scheduleContentRender();
      }, 140);
    }

    beginRasterPreview(duration = TEXT_RASTER_PREVIEW_MS) {
      this.svg.classList.add("is-raster-previewing");

      if (this.previewTimer) {
        window.clearTimeout(this.previewTimer);
      }

      this.previewTimer = window.setTimeout(() => {
        this.svg.classList.remove("is-raster-previewing");
        this.previewTimer = 0;
      }, duration);
    }

    finishRasterPreviewIfIdle() {
      const hasPendingRasterWork = Array.from(this.rasterLayerCache.values())
        .some((cache) => cache?.pendingSignature || cache?.queuedSignature);

      if (hasPendingRasterWork) {
        return;
      }

      if (this.previewTimer) {
        window.clearTimeout(this.previewTimer);
        this.previewTimer = 0;
      }

      this.svg.classList.remove("is-raster-previewing");
    }

    beginTextEditPreview() {
      this.svg.classList.add("is-text-edit-previewing");
    }

    endTextEditPreview() {
      this.svg.classList.remove("is-text-edit-previewing");
    }

    updateViewportSize() {
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    updateCameraTransform() {
      const { camera, dpr } = resolveCameraState();
      const zoom = Math.max(0.0001, (camera.zoom || 1) / dpr);
      const x = (camera.x || 0) / dpr;
      const y = (camera.y || 0) / dpr;

      this.viewportGroup.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
    }

    scheduleContentRender() {
      if (this.frameRequest) {
        return;
      }

      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0;
        this.renderContent();
      });
    }

    getFont(url) {
      const fontUrl = url || namespace.VectorTextEngine?.DEFAULT_FONT_URL;

      if (this.fontCache.has(fontUrl)) {
        return this.fontCache.get(fontUrl);
      }

      if (!this.fontRequests.has(fontUrl)) {
        const request = namespace.VectorTextEngine
          .loadOpenTypeFont(fontUrl)
          .then((font) => {
            this.fontCache.set(fontUrl, font);
            this.fontRequests.delete(fontUrl);
            this.scheduleContentRender();
            return font;
          })
          .catch((error) => {
            this.fontRequests.delete(fontUrl);
            console.warn("Impossibile caricare il font vettoriale.", error);
            return null;
          });

        this.fontRequests.set(fontUrl, request);
      }

      return null;
    }

    getPathMetrics(layer, font) {
      const signature = getLayerSignature(layer);
      const cached = this.pathCache.get(layer.id);

      if (cached?.signature === signature) {
        return cached;
      }

      const engine = namespace.VectorTextEngine;
      const path = engine.createTextPath(font, layer.text, layer.fontSize, {
        letterSpacing: layer.letterSpacing,
        ligatures: layer.ligatures,
        lineHeight: layer.lineHeight,
        textAlign: layer.textAlign,
        uppercase: layer.uppercase,
      });
      const baseBounds = path.getBoundingBox();

      if (layer.envelopeGrid) {
        engine.applyEnvelopeWarp(path, layer.envelopeGrid);
      } else {
        path.commands = engine.warpPathCommands(path.commands, baseBounds, layer.warp);
      }

      const metrics = {
        bounds: path.getBoundingBox(),
        pathData: path.toPathData(2),
        signature,
      };

      this.pathCache.set(layer.id, metrics);

      return metrics;
    }

    getPathData(layer, font) {
      return this.getPathMetrics(layer, font).pathData;
    }

    getRenderableTextLayers() {
      const renderable = this.layerModel?.getRenderableLayers?.() || [];

      return renderable.filter(isTextLayer);
    }

    getActiveTextLayer() {
      const activeId = this.layerModel?.activeLayerId;

      return this.getRenderableTextLayers().find((layer) => layer.id === activeId) || null;
    }

    getLayerNode(layerId) {
      if (!layerId || !this.contentGroup) {
        return null;
      }

      return Array.from(this.contentGroup.querySelectorAll("[data-layer-id]"))
        .find((node) => node.getAttribute("data-layer-id") === layerId) || null;
    }

    getDocumentTextureSize() {
      const renderer = namespace.documentRenderer;

      return {
        height: Math.max(1, Math.round(renderer?.height || 4000)),
        width: Math.max(1, Math.round(renderer?.width || 4000)),
      };
    }

    createRasterTextLayerMarkup(layer, pathData, size, rasterBox) {
      const defs = [];
      const filter = this.createDropShadowFilter(layer, { ignoreInteraction: true });
      const rasterLayer = {
        ...layer,
        opacity: 1,
      };
      const node = this.createTextLayerNode(rasterLayer, pathData, {
        active: false,
        applyLayerOpacity: false,
        defs,
        filterId: filter?.id || "",
        ignoreInteraction: true,
        includeControls: false,
        interactive: false,
      });

      if (filter) {
        defs.push(filter.node);
      }

      return serializeTextLayerSvg(node, defs, size, rasterBox);
    }

    createRasterTextAsset(layer, options = {}) {
      const font = options.font || this.getFont(layer.fontUrl);

      if (!font) {
        return null;
      }

      const size = options.size || this.getDocumentTextureSize();
      const metrics = this.getPathMetrics(layer, font);
      const rasterBox = getTextLayerRasterBox(layer, metrics.bounds, size);

      if (!rasterBox) {
        return {
          pathData: metrics.pathData,
          rasterBox: null,
          svgMarkup: "",
        };
      }

      return {
        pathData: metrics.pathData,
        rasterBox,
        svgMarkup: this.createRasterTextLayerMarkup(layer, metrics.pathData, size, rasterBox),
      };
    }

    debugRasterBox(options = {}) {
      const rasterBox = options.rasterBox;
      const size = options.size;
      const source = options.source || "raster-debug";

      if (!TEXT_RASTER_DEBUG || !rasterBox) {
        return;
      }

      const stats = getRasterDebugStats(size, rasterBox);
      const stroke = options.stroke || "#ff2bd6";
      const fill = options.fill || "rgba(255, 43, 214, 0.08)";
      const allocationBox = options.allocationBox || null;
      const allocationCount = Math.max(1, Math.round(options.allocationCount || 1));
      const allocationStroke = options.allocationStroke || "#ff7a00";
      const layer = options.layer || {};
      const extraRows = options.extraRows || {};
      const debugNote = options.note || "Nota: fullLayerTargetMB resta pieno; crop/dirty MB misura l'area realmente toccata.";
      const label = `${rasterBox.width}x${rasterBox.height} px / ${stats.cropMB} MB`;
      const group = createSvgElement("g", {
        class: "editor-vector-raster-debug-box",
        "data-layer-id": layer.id || "",
        "data-source": source,
      });
      const nodes = [];

      if (allocationBox) {
        const allocationBytes = allocationBox.width * allocationBox.height * 4;
        const allocationRect = createSvgElement("rect", {
          fill: "none",
          height: allocationBox.height,
          stroke: allocationStroke,
          "stroke-dasharray": "36 18",
          "stroke-linejoin": "round",
          "stroke-width": 4,
          "vector-effect": "non-scaling-stroke",
          width: allocationBox.width,
          x: allocationBox.x,
          y: allocationBox.y,
        });
        const allocationText = createSvgElement("text", {
          fill: allocationStroke,
          "font-family": "monospace",
          "font-size": 32,
          "font-weight": 800,
          "paint-order": "stroke",
          stroke: "rgba(0, 0, 0, 0.78)",
          "stroke-width": 7,
          x: allocationBox.x + 18,
          y: allocationBox.y + 42,
        });

        allocationText.textContent = `ALLOC ${allocationBox.width}x${allocationBox.height} x${allocationCount} / ${bytesToMega(allocationBytes * allocationCount)} MB`;
        nodes.push(allocationRect, allocationText);
        extraRows.allocationBox = `${allocationBox.width}x${allocationBox.height} @ ${allocationBox.x},${allocationBox.y}`;
        extraRows.allocationEachMB = bytesToMega(allocationBytes);
        extraRows.allocationTotalMB = bytesToMega(allocationBytes * allocationCount);
      }

      const rect = createSvgElement("rect", {
        fill,
        height: rasterBox.height,
        stroke,
        "stroke-dasharray": "18 10",
        "stroke-linejoin": "round",
        "stroke-width": 3,
        "vector-effect": "non-scaling-stroke",
        width: rasterBox.width,
        x: rasterBox.x,
        y: rasterBox.y,
      });
      const text = createSvgElement("text", {
        fill: stroke,
        "font-family": "monospace",
        "font-size": 28,
        "font-weight": 700,
        "paint-order": "stroke",
        stroke: "rgba(0, 0, 0, 0.72)",
        "stroke-width": 6,
        x: rasterBox.x,
        y: Math.max(28, rasterBox.y - 12),
      });

      text.textContent = label;
      nodes.push(rect, text);
      group.append(...nodes);
      this.debugGroup?.replaceChildren(group);

      console.groupCollapsed?.(`[CBO raster debug] ${layer.name || layer.id || "layer"} (${source})`);
      console.table?.({
        cropBox: `${rasterBox.width}x${rasterBox.height} @ ${rasterBox.x},${rasterBox.y}`,
        cropTempMB: stats.cropMB,
        fullDocumentTempMB: stats.documentMB,
        fullLayerTargetMB: stats.documentMB,
        reductionPercent: `${stats.reduction}%`,
        savedTempMB: stats.savedMB,
        ...extraRows,
      });
      console.log?.(debugNote);
      console.groupEnd?.();
    }

    debugTextRaster(layer, rasterBox, size, source = "vector-text-cache") {
      this.debugRasterBox({
        layer,
        rasterBox,
        size,
        source,
      });
    }

    syncTextLayerRaster(layer, pathData, pathBounds) {
      const renderer = namespace.documentRenderer;
      const rasterizer = namespace.imageRasterizer;

      if (!renderer?.getRasterTarget || !rasterizer?.placeRasterImage) {
        return;
      }

      const size = this.getDocumentTextureSize();
      const rasterBox = getTextLayerRasterBox(layer, pathBounds, size);
      const signature = getTextRasterSignature(layer, pathData, size, rasterBox);
      const cached = this.rasterLayerCache.get(layer.id);

      if (
        cached?.signature === signature ||
        cached?.pendingSignature === signature ||
        cached?.queuedSignature === signature
      ) {
        return;
      }

      const delay = layer.id === this.layerModel?.activeLayerId ? ACTIVE_TEXT_RASTER_DEBOUNCE_MS : 0;

      if (delay > 0) {
        this.queueTextLayerRasterSync(layer, pathData, size, rasterBox, signature, delay);
        this.beginRasterPreview(delay + TEXT_RASTER_PREVIEW_MS);
        return;
      }

      this.runTextLayerRasterSync(layer, pathData, size, rasterBox, signature);
    }

    queueTextLayerRasterSync(layer, pathData, size, rasterBox, signature, delay) {
      const cached = this.rasterLayerCache.get(layer.id) || {};

      if (cached.timerId) {
        window.clearTimeout(cached.timerId);
      }

      const timerId = window.setTimeout(() => {
        const latest = this.rasterLayerCache.get(layer.id);

        if (!latest || latest.queuedSignature !== signature) {
          return;
        }

        this.rasterLayerCache.set(layer.id, {
          ...latest,
          queuedSignature: "",
          timerId: 0,
        });
        this.runTextLayerRasterSync(layer, pathData, size, rasterBox, signature);
      }, delay);

      this.rasterLayerCache.set(layer.id, {
        ...cached,
        queuedSignature: signature,
        timerId,
      });
    }

    runTextLayerRasterSync(layer, pathData, size, rasterBox, signature) {
      const renderer = namespace.documentRenderer;
      const rasterizer = namespace.imageRasterizer;

      if (!renderer?.getRasterTarget || !rasterizer?.placeRasterImage) {
        return;
      }

      const cached = this.rasterLayerCache.get(layer.id) || {};
      const generation = this.rasterGeneration + 1;

      this.rasterGeneration = generation;
      this.rasterLayerCache.set(layer.id, {
        ...cached,
        generation,
        pendingSignature: signature,
      });

      if (!rasterBox) {
        renderer.clearLayer(layer.id, { emit: false });
        this.rasterLayerCache.set(layer.id, {
          generation,
          pendingSignature: "",
          signature,
        });
        this.finishRasterPreviewIfIdle();
        namespace.brushEngine?.requestDraw?.();
        return;
      }

      const svgMarkup = this.createRasterTextLayerMarkup(layer, pathData, size, rasterBox);

      loadSvgImage(svgMarkup)
        .then((image) => {
          const latest = this.rasterLayerCache.get(layer.id);

          if (
            !latest ||
            latest.generation !== generation ||
            latest.pendingSignature !== signature ||
            namespace.documentRenderer !== renderer ||
            namespace.imageRasterizer !== rasterizer
          ) {
            return;
          }

          const target = renderer.getRasterTarget(layer.id);

          renderer.clearLayer(layer.id, { emit: false });
          rasterizer.placeRasterImage(image, {
            emit: false,
            layerId: layer.id,
            source: "vector-text-cache",
            target,
            x: rasterBox.x,
            y: rasterBox.y,
          });
          this.debugTextRaster(layer, rasterBox, size, "vector-text-cache");

          this.rasterLayerCache.set(layer.id, {
            generation,
            pendingSignature: "",
            signature,
          });
          this.finishRasterPreviewIfIdle();
          namespace.brushEngine?.requestDraw?.();
        })
        .catch((error) => {
          const latest = this.rasterLayerCache.get(layer.id);

          if (latest?.generation === generation) {
            this.rasterLayerCache.set(layer.id, {
              ...latest,
              pendingSignature: "",
            });
          }

          this.finishRasterPreviewIfIdle();
          console.warn("Impossibile sincronizzare il testo vettoriale nel compositing WebGL.", error);
        });
    }

    removeStaleTextRasterTargets(activeLayerIds) {
      const renderer = namespace.documentRenderer;
      let didRemoveTarget = false;

      this.rasterLayerCache.forEach((_cache, layerId) => {
        if (activeLayerIds.has(layerId)) {
          return;
        }

        if (_cache?.timerId) {
          window.clearTimeout(_cache.timerId);
        }

        this.rasterLayerCache.delete(layerId);
        didRemoveTarget = renderer?.deleteRasterTarget?.(layerId, { emit: false }) || didRemoveTarget;
      });

      if (didRemoveTarget) {
        namespace.brushEngine?.requestDraw?.();
      }
    }

    getEnvelopeHandleHitAtClient(clientX, clientY, pointerType = "mouse") {
      const layer = this.getActiveTextLayer();

      if (!layer?.envelopeGrid || layer.locked === true) {
        return null;
      }

      const layerNode = this.getLayerNode(layer.id);

      if (!layerNode) {
        return null;
      }

      const nodeIds = [
        ...CORNER_ENVELOPE_NODES,
        ...CENTER_ENVELOPE_NODES,
        ...HANDLE_ENVELOPE_NODES,
      ];
      const hitRadius = pointerType === "touch" ? 24 : 18;
      let closest = null;

      nodeIds.forEach((nodeId) => {
        const handle = layerNode.querySelector(`[data-envelope-node="${nodeId}"]`);

        if (!handle) {
          return;
        }

        const rect = handle.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(clientX - centerX, clientY - centerY);

        if (!closest || distance < closest.distance) {
          closest = { distance, layerId: layer.id, nodeId };
        }
      });

      return closest?.distance <= hitRadius ? closest : null;
    }

    renderContent() {
      const layers = this.getRenderableTextLayers();
      const activeLayerId = this.layerModel?.activeLayerId || "";
      const activeTextLayerIds = new Set();
      const nodes = [];
      const defs = [];

      layers.forEach((layer) => {
        if (layer.visible === false) {
          return;
        }

        activeTextLayerIds.add(layer.id);

        const font = this.getFont(layer.fontUrl);

        if (!font) {
          return;
        }

        const draggingLayer = this.dragState?.layerId === layer.id ? this.dragState.nextLayer : null;
        const renderLayer = draggingLayer
          ? { ...layer, x: draggingLayer.x, y: draggingLayer.y }
          : layer;
        const pathMetrics = this.getPathMetrics(layer, font);
        const pathData = pathMetrics.pathData;
        const filter = this.createDropShadowFilter(renderLayer);
        const node = this.createTextLayerNode(renderLayer, pathData, {
          active: renderLayer.id === activeLayerId,
          defs,
          filterId: filter?.id || "",
        });

        if (filter) {
          defs.push(filter.node);
        }

        nodes.push(node);
        this.syncTextLayerRaster(renderLayer, pathData, pathMetrics.bounds);
      });

      this.removeStaleTextRasterTargets(activeTextLayerIds);
      this.defs.replaceChildren(...defs);
      this.contentGroup.replaceChildren(...nodes);
      this.updateCameraTransform();
    }

    createDropShadowFilter(layer, options = {}) {
      if ((this.isInteracting && options.ignoreInteraction !== true) || layer.shadowType !== "drop") {
        return null;
      }

      const shadow = layer.style?.shadow || {};
      const opacity = Number.isFinite(shadow.opacity) ? shadow.opacity : 0;
      const blur = Number.isFinite(shadow.blur) ? shadow.blur : 0;

      if (opacity <= 0) {
        return null;
      }

      const angle = (toFiniteNumber(layer.shadowAngle, 0) * Math.PI) / 180;
      const distance = Math.max(0, toFiniteNumber(layer.shadowDistance, 0));
      const id = `cbo-vector-shadow-${safeDomId(layer.id)}`;
      const filter = createSvgElement("filter", {
        height: "300%",
        id,
        width: "300%",
        x: "-100%",
        y: "-100%",
      });
      const dropShadow = createSvgElement("feDropShadow", {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        "flood-color": shadow.color || "#000000",
        "flood-opacity": opacity,
        stdDeviation: Math.max(0, blur / 2),
      });

      filter.append(dropShadow);

      return { id, node: filter };
    }

    createTextLayerNode(layer, pathData, options = {}) {
      const group = createSvgElement("g", {
        class: `editor-vector-text-layer${options.active ? " active" : ""}`,
        "data-layer-id": layer.id,
        opacity: options.applyLayerOpacity === false ? 1 : toFiniteNumber(layer.opacity, 1),
        transform: formatLayerTransform(layer),
      });

      if (layer.locked === true) {
        group.classList.add("locked");
      }

      this.appendSolidShadow(group, layer, pathData, {
        ignoreInteraction: options.ignoreInteraction === true,
      });

      const paintGroup = this.createTextPaintGroup(layer, pathData, options);

      group.append(paintGroup);

      if (options.includeControls !== false && options.active && layer.envelopeGrid) {
        group.append(this.createEnvelopeControls(layer));
      }

      if (options.interactive !== false) {
        group.addEventListener("pointerdown", (event) => this.handleTextLayerPointerDown(event, layer.id));
      }

      return group;
    }

    createTextPaintPath(layer, pathData, attributes = {}) {
      return createSvgElement("path", {
        class: "editor-vector-text-path",
        d: pathData,
        "fill-rule": "nonzero",
        "stroke-linejoin": "round",
        ...attributes,
      });
    }

    createTextPaintGroup(layer, pathData, options = {}) {
      const paintGroup = createSvgElement("g", { class: "editor-vector-text-paint" });
      const fill = layer.style?.fill || "#f8efe2";
      const stroke = layer.style?.stroke || "#1b1713";
      const strokeWidth = Math.max(0, toFiniteNumber(layer.style?.strokeWidth, 0));
      const strokeAlign = getStrokeAlign(layer);

      if (options.filterId) {
        paintGroup.setAttribute("filter", `url(#${options.filterId})`);
      }

      if (strokeWidth <= 0) {
        paintGroup.append(this.createTextPaintPath(layer, pathData, {
          fill,
          stroke: "none",
        }));
        return paintGroup;
      }

      if (strokeAlign === "outer") {
        paintGroup.append(
          this.createTextPaintPath(layer, pathData, {
            fill: "none",
            stroke,
            "stroke-width": strokeWidth * 2,
          }),
          this.createTextPaintPath(layer, pathData, {
            fill,
            stroke: "none",
          }),
        );
        return paintGroup;
      }

      if (strokeAlign === "inner") {
        const clipId = `cbo-vector-inner-stroke-${safeDomId(layer.id)}`;
        const clipPath = createSvgElement("clipPath", { id: clipId });

        clipPath.append(this.createTextPaintPath(layer, pathData, {
          fill: "#ffffff",
          stroke: "none",
        }));
        options.defs?.push?.(clipPath);
        paintGroup.append(
          this.createTextPaintPath(layer, pathData, {
            fill,
            stroke: "none",
          }),
          this.createTextPaintPath(layer, pathData, {
            "clip-path": `url(#${clipId})`,
            fill: "none",
            stroke,
            "stroke-width": strokeWidth * 2,
          }),
        );
        return paintGroup;
      }

      paintGroup.append(this.createTextPaintPath(layer, pathData, {
        fill,
        stroke,
        "stroke-width": strokeWidth,
      }));

      return paintGroup;
    }

    createEnvelopeControls(layer) {
      const grid = layer.envelopeGrid;
      const group = createSvgElement("g", { class: "editor-vector-envelope-ui" });
      const outlinePath = envelopeOutlinePath(grid);
      const outlineAttributes = {
        d: outlinePath,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
      };
      const curveAttributes = {
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
      };

      group.append(
        createSvgElement("path", {
          class: "editor-vector-envelope-fill",
          d: outlinePath,
          fill: "rgba(20, 115, 230, 0.035)",
          stroke: "none",
        }),
        createSvgElement("path", {
          ...outlineAttributes,
          class: "editor-vector-envelope-outline",
          stroke: "#1473e6",
          "stroke-width": 1.75,
        }),
        createSvgElement("polyline", {
          class: "editor-vector-envelope-midline",
          points: pointList(grid.TC, grid.BC),
          stroke: "rgba(20, 115, 230, 0.36)",
          "stroke-width": 1.15,
          "vector-effect": "non-scaling-stroke",
        }),
        createSvgElement("path", {
          ...curveAttributes,
          class: "editor-vector-envelope-curve-guide",
          d: topCurvePath(grid),
          stroke: "rgba(20, 115, 230, 0.28)",
          "stroke-width": 1,
        }),
        createSvgElement("path", {
          ...curveAttributes,
          class: "editor-vector-envelope-curve-guide",
          d: bottomCurvePath(grid),
          stroke: "rgba(20, 115, 230, 0.28)",
          "stroke-width": 1,
        }),
      );

      [
        ["TC", "TC_HandleL"],
        ["TC", "TC_HandleR"],
        ["BC", "BC_HandleL"],
        ["BC", "BC_HandleR"],
      ].forEach(([anchorId, handleId]) => {
        group.append(createSvgElement("polyline", {
          class: "editor-vector-envelope-control-line",
          fill: "none",
          points: pointList(grid[anchorId], grid[handleId]),
          stroke: "rgba(20, 115, 230, 0.55)",
          "stroke-linecap": "round",
          "stroke-width": 1.15,
          "vector-effect": "non-scaling-stroke",
        }));
      });

      CORNER_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, {
          className: "corner",
          shape: "square",
          size: 13,
        }));
      });
      CENTER_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, {
          className: "anchor",
          shape: "diamond",
          size: 14,
        }));
      });
      HANDLE_ENVELOPE_NODES.forEach((nodeId) => {
        group.append(this.createEnvelopeHandle(layer, nodeId, {
          className: "control",
          shape: "circle",
          size: 9,
        }));
      });

      return group;
    }

    createEnvelopeHandle(layer, nodeId, options = {}) {
      const point = layer.envelopeGrid[nodeId];
      const size = Number.isFinite(options.size) ? options.size : 12;
      const roleClass = options.className || "anchor";
      const group = createSvgElement("g", {
        class: `editor-vector-envelope-handle-group ${roleClass}`,
        "data-envelope-node": nodeId,
        transform: `translate(${point.x} ${point.y})`,
      });
      const hitTarget = createSvgElement("circle", {
        class: "editor-vector-envelope-hit",
        cx: 0,
        cy: 0,
        fill: "none",
        "pointer-events": "stroke",
        r: Math.max(7, size / 2),
        stroke: "#1473e6",
        "stroke-opacity": 0.001,
        "stroke-width": 24,
        "vector-effect": "non-scaling-stroke",
      });
      let marker;

      if (options.shape === "circle") {
        marker = createSvgElement("circle", {
          class: "editor-vector-envelope-handle",
          cx: 0,
          cy: 0,
          fill: "#ffffff",
          r: size / 2,
          stroke: "#1473e6",
          "stroke-width": 1.5,
          "vector-effect": "non-scaling-stroke",
        });
      } else {
        marker = createSvgElement("rect", {
          class: "editor-vector-envelope-handle",
          fill: options.shape === "diamond" ? "#1473e6" : "#ffffff",
          height: size,
          rx: 1.75,
          stroke: "#1473e6",
          "stroke-width": 1.5,
          transform: options.shape === "diamond" ? "rotate(45)" : "",
          "vector-effect": "non-scaling-stroke",
          width: size,
          x: -size / 2,
          y: -size / 2,
        });
      }

      group.append(hitTarget, marker);
      group.addEventListener("pointerdown", (event) => {
        this.handleEnvelopePointerDown(event, layer.id, nodeId);
      });

      return group;
    }

    appendSolidShadow(group, layer, pathData, options = {}) {
      if ((this.isInteracting && options.ignoreInteraction !== true) || layer.shadowType !== "solid") {
        return;
      }

      const shadow = layer.style?.shadow || {};
      const opacity = Number.isFinite(shadow.opacity) ? shadow.opacity : 0;
      const distance = Math.max(0, toFiniteNumber(layer.shadowDistance, 0));

      if (opacity <= 0 || distance <= 0) {
        return;
      }

      const shadowGroup = createSvgElement("g", {
        class: "editor-vector-solid-shadow",
        opacity: String(opacity),
      });
      const angle = (toFiniteNumber(layer.shadowAngle, 0) * Math.PI) / 180;
      const color = colorWithOpacity(shadow.color || "#000000", 1);
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      const extrusionPathData = createSolidShadowExtrusionPathData(pathData, offsetX, offsetY);

      if (extrusionPathData) {
        shadowGroup.append(createSvgElement("path", {
          class: "editor-vector-solid-shadow-extrusion",
          d: extrusionPathData,
          fill: color,
          stroke: color,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": 1,
        }));
      }

      shadowGroup.append(createSvgElement("path", {
        class: "editor-vector-solid-shadow-backface",
        d: pathData,
        fill: color,
        stroke: color,
        "stroke-linejoin": "round",
        "stroke-width": 1,
        transform: `translate(${offsetX} ${offsetY})`,
      }));

      group.append(shadowGroup);
    }

    handlePointerDown(event) {
      if (event.button === 0 && event.target === this.hitArea) {
        const envelopeHit = this.getEnvelopeHandleHitAtClient(
          event.clientX,
          event.clientY,
          event.pointerType,
        );

        if (envelopeHit) {
          this.handleEnvelopePointerDown(event, envelopeHit.layerId, envelopeHit.nodeId);
          return;
        }
      }

      if (event.target !== this.hitArea) {
        return;
      }

      if (this.activeTool !== "text" && this.activeTool !== "type") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    handleTextLayerPointerDown(event, layerId) {
      const layer = this.layerModel?.findEntryById?.(layerId);

      if (!layer) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.layerModel.setActiveLayer(layerId, { source: "vector-text-select" });

      if (layer.locked === true || event.button !== 0) {
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const group = event.currentTarget;

      this.dragState = {
        group,
        historyGroup: `text-drag-${layerId}`,
        layer: cloneValue(layer),
        layerId,
        pointerId: event.pointerId,
        startDocX: point.x,
        startDocY: point.y,
      };

      group.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", this.handleDragMove);
      window.addEventListener("pointerup", this.handleDragEnd);
      window.addEventListener("pointercancel", this.handleDragEnd);
      this.beginTextEditPreview();
      this.beginInteraction();
    }

    handleEnvelopePointerDown(event, layerId, nodeId) {
      const layer = this.layerModel?.findEntryById?.(layerId);

      if (!layer?.envelopeGrid || layer.locked === true) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.layerModel.setActiveLayer(layerId, { source: "vector-text-envelope-select" });

      this.envelopeDragState = {
        grid: cloneValue(layer.envelopeGrid),
        historyGroup: `text-envelope-${layerId}-${nodeId}`,
        layerId,
        nodeId,
        pointerId: event.pointerId,
        startLayerPoint: this.clientToLayerPoint(event.clientX, event.clientY, layer),
        startNodePosition: cloneValue(layer.envelopeGrid[nodeId]),
      };

      namespace.documentHistory?.beginGroup?.(this.envelopeDragState.historyGroup);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", this.handleEnvelopeDragMove);
      window.addEventListener("pointerup", this.handleEnvelopeDragEnd);
      window.addEventListener("pointercancel", this.handleEnvelopeDragEnd);
      this.beginTextEditPreview();
      this.beginInteraction();
    }

    handleEnvelopeDragMove(event) {
      if (!this.envelopeDragState || event.pointerId !== this.envelopeDragState.pointerId) {
        return;
      }

      const layer = this.layerModel?.findEntryById?.(this.envelopeDragState.layerId);

      if (!layer?.envelopeGrid) {
        return;
      }

      const currentPosition = this.clientToLayerPoint(event.clientX, event.clientY, layer);
      const startLayerPoint = this.envelopeDragState.startLayerPoint;
      const startNodePosition = this.envelopeDragState.startNodePosition;
      const position = {
        x: startNodePosition.x + currentPosition.x - startLayerPoint.x,
        y: startNodePosition.y + currentPosition.y - startLayerPoint.y,
      };
      const envelopeGrid = namespace.VectorTextEngine.updateEnvelopeGridNode(
        this.envelopeDragState.grid,
        this.envelopeDragState.nodeId,
        position,
      );

      this.layerModel.updateLayer(layer.id, { envelopeGrid }, {
        historyGroup: this.envelopeDragState.historyGroup,
        source: "vector-text-envelope-drag",
      });
      this.beginInteraction();
      event.preventDefault();
    }

    handleEnvelopeDragEnd(event) {
      if (!this.envelopeDragState || event.pointerId !== this.envelopeDragState.pointerId) {
        return;
      }

      window.removeEventListener("pointermove", this.handleEnvelopeDragMove);
      window.removeEventListener("pointerup", this.handleEnvelopeDragEnd);
      window.removeEventListener("pointercancel", this.handleEnvelopeDragEnd);
      namespace.documentHistory?.endGroup?.(this.envelopeDragState.historyGroup);
      this.envelopeDragState = null;
      this.endTextEditPreview();
      event.preventDefault();
    }

    handleDragMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const point = this.clientToDocumentPoint(event.clientX, event.clientY);
      const nextLayer = {
        ...this.dragState.layer,
        x: toFiniteNumber(this.dragState.layer.x, 0) + point.x - this.dragState.startDocX,
        y: toFiniteNumber(this.dragState.layer.y, 0) + point.y - this.dragState.startDocY,
      };
      const currentGroup = this.getLayerNode(this.dragState.layerId) || this.dragState.group;

      this.dragState.nextLayer = nextLayer;
      currentGroup?.setAttribute("transform", formatLayerTransform(nextLayer));
      this.beginInteraction();
      event.preventDefault();
    }

    handleDragEnd(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const { group, historyGroup, layerId, nextLayer } = this.dragState;

      group.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", this.handleDragMove);
      window.removeEventListener("pointerup", this.handleDragEnd);
      window.removeEventListener("pointercancel", this.handleDragEnd);

      if (nextLayer) {
        this.layerModel.updateLayer(layerId, {
          x: nextLayer.x,
          y: nextLayer.y,
        }, {
          historyGroup,
          source: "vector-text-drag",
        });
        this.beginRasterPreview(ACTIVE_TEXT_RASTER_DEBOUNCE_MS + TEXT_RASTER_PREVIEW_MS);
      }

      this.dragState = null;
      this.endTextEditPreview();
      event.preventDefault();
    }

    clientToDocumentPoint(clientX, clientY) {
      const rect = this.stage.getBoundingClientRect();
      const { camera, dpr } = resolveCameraState();
      const viewportX = (clientX - rect.left) * dpr;
      const viewportY = (clientY - rect.top) * dpr;
      const zoom = Math.max(0.0001, camera.zoom || 1);

      return {
        x: (viewportX - (camera.x || 0)) / zoom,
        y: (viewportY - (camera.y || 0)) / zoom,
      };
    }

    clientToLayerPoint(clientX, clientY, layer) {
      const point = this.clientToDocumentPoint(clientX, clientY);
      const scaleX = toFiniteNumber(layer.scaleX, 1) || 1;
      const scaleY = toFiniteNumber(layer.scaleY, 1) || 1;
      const radians = (-toFiniteNumber(layer.rotation, 0) * Math.PI) / 180;
      const dx = point.x - toFiniteNumber(layer.x, 0);
      const dy = point.y - toFiniteNumber(layer.y, 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      return {
        x: (dx * cos - dy * sin) / scaleX,
        y: (dx * sin + dy * cos) / scaleY,
      };
    }
  }

  namespace.VectorTextRenderer = VectorTextRenderer;

  namespace.initVectorTextRenderer = function initVectorTextRenderer() {
    const stage = document.querySelector(".editor-stage");

    if (!stage || stage.dataset.vectorTextReady === "true") {
      return;
    }

    const layerModel = namespace.documentLayerModel ||
      (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);

    if (!layerModel || !namespace.VectorTextEngine) {
      return;
    }

    namespace.documentLayerModel = layerModel;
    stage.dataset.vectorTextReady = "true";
    namespace.vectorTextRenderer = new VectorTextRenderer({ layerModel, stage });
  };
})(window.CBO = window.CBO || {});
