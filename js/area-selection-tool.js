(function registerAreaSelectionTool(namespace) {
  const RECT_TOOL_MODE = "selection-rect";
  const CIRCLE_TOOL_MODE = "selection-circle";
  const LASSO_TOOL_MODE = "selection-lasso";
  const POLYGON_LASSO_TOOL_MODE = "selection-polygon-lasso";
  const COLOR_RANGE_TOOL_MODE = "selection-color-range";
  const LASSO_MIN_POINTS = 3;
  const LASSO_POINT_SPACING = 1.5;
  const POLYGON_LASSO_CLOSE_DISTANCE_PX = 10;
  const MIN_SELECTION_SIZE = 3;
  const PASTE_OFFSET_PX = 60;
  const AREA_SELECTION_ANTS_ENABLED = false;
  const DEFAULT_COLOR_RANGE_TOLERANCE = 48;
  const MAX_COLOR_RANGE_TOLERANCE = 255;
  const COLOR_RANGE_MIN_ALPHA = 1;

  const state = {
    activeToolMode: "",
    baseRegion: null,
    canvas: null,
    clipboard: null,
    colorRangeSampleColor: null,
    colorRangeTolerance: clamp(
      namespace.colorRangeSelectionTolerance ?? DEFAULT_COLOR_RANGE_TOLERANCE,
      0,
      MAX_COLOR_RANGE_TOLERANCE,
    ),
    overlay: null,
    overlayAnimationPausedUntil: 0,
    overlayDashOffset: 0,
    pointerId: null,
    pointerTarget: null,
    polygonLassoActive: false,
    polygonPreviewPoint: null,
    rafId: 0,
    resumeTimerId: 0,
    region: null,
    rect: null,
    rects: [],
    dragOperationMode: "replace",
    lassoPoints: [],
    operationMode: "replace",
    overlayCache: {
      boundaryPath: null,
      boundarySegmentsDoc: [],
      boundarySegmentsScreen: [],
      coveragePath: null,
      coverageRectsDoc: [],
      coverageRectsScreen: [],
      documentScreenRect: null,
      regionDirty: true,
      screenDirty: true,
      shadeDirty: true,
    },
    startPoint: null,
    visualPolygonPoints: null,
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

  function getNow() {
    return window.performance?.now?.() || Date.now();
  }

  function isOverlayAnimationPaused() {
    const brushEngine = namespace.brushEngine || null;
    const smudgeEngine = namespace.smudgeEngine || null;

    return (
      state.pointerId != null ||
      brushEngine?.isDrawing === true ||
      brushEngine?.isPanning === true ||
      smudgeEngine?.isDragging === true ||
      getNow() < state.overlayAnimationPausedUntil
    );
  }

  function pauseOverlayAnimation(durationMs = 180) {
    state.overlayAnimationPausedUntil = Math.max(
      state.overlayAnimationPausedUntil,
      getNow() + Math.max(0, durationMs),
    );
  }

  function markOverlayRegionDirty() {
    state.overlayCache.regionDirty = true;
    state.overlayCache.screenDirty = true;
    state.overlayCache.shadeDirty = true;
  }

  function markOverlayScreenDirty() {
    state.overlayCache.screenDirty = true;
    state.overlayCache.shadeDirty = true;
  }

  function normalizeRectFromPoints(startPoint, endPoint, options = {}) {
    const renderer = getRenderer();
    const width = Math.max(1, Math.round(renderer?.width || 1));
    const height = Math.max(1, Math.round(renderer?.height || 1));
    const fromCenter = options.fromCenter === true;
    const forceSquare = options.forceSquare === true;
    const startX = clamp(startPoint.docX, 0, width);
    const startY = clamp(startPoint.docY, 0, height);
    const endX = clamp(endPoint.docX, 0, width);
    const endY = clamp(endPoint.docY, 0, height);
    let dx = endX - startX;
    let dy = endY - startY;
    let minX;
    let minY;
    let maxX;
    let maxY;

    if (fromCenter) {
      let radiusX = Math.abs(dx);
      let radiusY = Math.abs(dy);

      if (forceSquare) {
        const radius = Math.min(
          Math.max(radiusX, radiusY),
          startX,
          width - startX,
          startY,
          height - startY,
        );

        radiusX = radius;
        radiusY = radius;
      } else {
        radiusX = Math.min(radiusX, startX, width - startX);
        radiusY = Math.min(radiusY, startY, height - startY);
      }

      minX = startX - radiusX;
      minY = startY - radiusY;
      maxX = startX + radiusX;
      maxY = startY + radiusY;
    } else if (forceSquare) {
      const signX = dx < 0 ? -1 : 1;
      const signY = dy < 0 ? -1 : 1;
      const maxWidth = signX > 0 ? width - startX : startX;
      const maxHeight = signY > 0 ? height - startY : startY;
      const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxWidth, maxHeight);

      dx = signX * size;
      dy = signY * size;
      minX = Math.min(startX, startX + dx);
      minY = Math.min(startY, startY + dy);
      maxX = Math.max(startX, startX + dx);
      maxY = Math.max(startY, startY + dy);
    } else {
      minX = Math.min(startX, endX);
      minY = Math.min(startY, endY);
      maxX = Math.max(startX, endX);
      maxY = Math.max(startY, endY);
    }

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

  function getSelectionDragOptions(event) {
    return {
      forceSquare: event.shiftKey === true,
      fromCenter: event.altKey === true,
    };
  }

  function normalizeOperationMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();

    return normalized === "add" || normalized === "subtract"
      ? normalized
      : "replace";
  }

  function setOperationMode(mode, options = {}) {
    state.operationMode = normalizeOperationMode(mode);

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("cbo:area-selection-operation-change", {
        detail: {
          mode: state.operationMode,
          source: options.source || "area-selection-operation",
        },
      }));
    }

    return state.operationMode;
  }

  function getOperationMode() {
    return state.operationMode;
  }

  function setColorRangeTolerance(value, options = {}) {
    state.colorRangeTolerance = Math.round(clamp(value, 0, MAX_COLOR_RANGE_TOLERANCE));
    namespace.colorRangeSelectionTolerance = state.colorRangeTolerance;

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("cbo:color-range-tolerance-change", {
        detail: {
          source: options.source || "color-range-tolerance",
          tolerance: state.colorRangeTolerance,
        },
      }));
    }

    return state.colorRangeTolerance;
  }

  function getColorRangeTolerance() {
    return state.colorRangeTolerance;
  }

  function channelToHex(value) {
    return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
  }

  function rgbToHexColor(red, green, blue) {
    return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
  }

  function setColorRangeSampleColor(color, options = {}) {
    state.colorRangeSampleColor = color || null;

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("cbo:color-range-sample-change", {
        detail: {
          color: state.colorRangeSampleColor,
          source: options.source || "color-range-sample",
        },
      }));
    }

    return state.colorRangeSampleColor;
  }

  function getColorRangeSampleColor() {
    return state.colorRangeSampleColor;
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

  function cloneRects(rects) {
    return Array.isArray(rects)
      ? rects.map(cloneRect).filter(Boolean)
      : [];
  }

  function clonePoints(points) {
    return Array.isArray(points)
      ? points
        .map((point) => ({
          x: Number(point?.x ?? point?.docX),
          y: Number(point?.y ?? point?.docY),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      : [];
  }

  function createEmptyRegion() {
    return namespace.SelectionRegion?.empty?.() || null;
  }

  function createRegionFromRect(rect) {
    return namespace.SelectionRegion?.fromRect?.(rect) || null;
  }

  function createRegionFromEllipse(rect) {
    return namespace.SelectionRegion?.fromEllipse?.(rect) || createRegionFromRect(rect);
  }

  function createRegionFromPolygon(points) {
    return namespace.SelectionRegion?.fromPolygon?.(points) || createEmptyRegion();
  }

  function createRegionFromRows(rows) {
    return namespace.SelectionRegion?.fromRows?.(rows) || createEmptyRegion();
  }

  function cloneRegion(region) {
    return region?.clone?.() || createEmptyRegion();
  }

  function normalizeSelectionRect(rect) {
    const documentRect = getDocumentRect();
    const clipped = intersectRects(rect, documentRect);

    if (!clipped || clipped.width < MIN_SELECTION_SIZE || clipped.height < MIN_SELECTION_SIZE) {
      return null;
    }

    return {
      height: Math.max(1, Math.round(clipped.height)),
      width: Math.max(1, Math.round(clipped.width)),
      x: Math.round(clipped.x),
      y: Math.round(clipped.y),
    };
  }

  function getBoundingRect(rects) {
    const validRects = cloneRects(rects);

    if (validRects.length === 0) {
      return null;
    }

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (let i = 0; i < validRects.length; i += 1) {
      const rect = validRects[i];
      x0 = Math.min(x0, rect.x);
      y0 = Math.min(y0, rect.y);
      x1 = Math.max(x1, rect.x + rect.width);
      y1 = Math.max(y1, rect.y + rect.height);
    }

    return {
      height: y1 - y0,
      width: x1 - x0,
      x: x0,
      y: y0,
    };
  }

  function subtractRectFromRect(sourceRect, cutRect) {
    const cut = intersectRects(sourceRect, cutRect);

    if (!cut) {
      return [cloneRect(sourceRect)];
    }

    const pieces = [];
    const sourceRight = sourceRect.x + sourceRect.width;
    const sourceBottom = sourceRect.y + sourceRect.height;
    const cutRight = cut.x + cut.width;
    const cutBottom = cut.y + cut.height;

    if (cut.y > sourceRect.y) {
      pieces.push({
        height: cut.y - sourceRect.y,
        width: sourceRect.width,
        x: sourceRect.x,
        y: sourceRect.y,
      });
    }

    if (cutBottom < sourceBottom) {
      pieces.push({
        height: sourceBottom - cutBottom,
        width: sourceRect.width,
        x: sourceRect.x,
        y: cutBottom,
      });
    }

    if (cut.x > sourceRect.x) {
      pieces.push({
        height: cut.height,
        width: cut.x - sourceRect.x,
        x: sourceRect.x,
        y: cut.y,
      });
    }

    if (cutRight < sourceRight) {
      pieces.push({
        height: cut.height,
        width: sourceRight - cutRight,
        x: cutRight,
        y: cut.y,
      });
    }

    return pieces
      .map(normalizeSelectionRect)
      .filter(Boolean);
  }

  function subtractRectFromRegion(rects, cutRect) {
    return cloneRects(rects)
      .flatMap((rect) => subtractRectFromRect(rect, cutRect));
  }

  function addRectToRegion(rects, nextRect) {
    let pieces = [normalizeSelectionRect(nextRect)].filter(Boolean);

    cloneRects(rects).forEach((existingRect) => {
      pieces = pieces.flatMap((piece) => subtractRectFromRect(piece, existingRect));
    });

    return [
      ...cloneRects(rects),
      ...pieces,
    ];
  }

  function applySelectionOperation(baseSelection, nextRect, mode = "replace", shape = "rect") {
    const baseRegion = Array.isArray(baseSelection)
      ? setRectsOnRegion(baseSelection)
      : cloneRegion(baseSelection);
    const rect = normalizeSelectionRect(nextRect);
    const isEllipse = shape === "ellipse";

    if (!rect) {
      return mode === "replace" ? createEmptyRegion() : baseRegion;
    }

    if (mode === "add") {
      if (isEllipse) {
        return baseRegion?.addEllipse?.(rect) || createRegionFromEllipse(rect);
      }

      return baseRegion?.addRect?.(rect) || createRegionFromRect(rect);
    }

    if (mode === "subtract") {
      if (isEllipse) {
        return baseRegion?.subtractEllipse?.(rect) || createEmptyRegion();
      }

      return baseRegion?.subtractRect?.(rect) || createEmptyRegion();
    }

    return isEllipse ? createRegionFromEllipse(rect) : createRegionFromRect(rect);
  }

  function getPolygonBounds(points) {
    const validPoints = Array.isArray(points)
      ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      : [];

    if (validPoints.length < LASSO_MIN_POINTS) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < validPoints.length; i += 1) {
      const point = validPoints[i];
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const x0 = Math.floor(minX);
    const y0 = Math.floor(minY);
    const x1 = Math.ceil(maxX);
    const y1 = Math.ceil(maxY);

    if (x1 - x0 < MIN_SELECTION_SIZE || y1 - y0 < MIN_SELECTION_SIZE) {
      return null;
    }

    return {
      height: y1 - y0,
      width: x1 - x0,
      x: x0,
      y: y0,
    };
  }

  function applyLassoOperation(baseSelection, points, mode = "replace") {
    const baseRegion = Array.isArray(baseSelection)
      ? setRectsOnRegion(baseSelection)
      : cloneRegion(baseSelection);

    if (!getPolygonBounds(points)) {
      return mode === "replace" ? createEmptyRegion() : baseRegion;
    }

    if (mode === "add") {
      return baseRegion?.addPolygon?.(points) || createRegionFromPolygon(points);
    }

    if (mode === "subtract") {
      return baseRegion?.subtractPolygon?.(points) || createEmptyRegion();
    }

    return createRegionFromPolygon(points);
  }

  function applyRegionOperation(baseSelection, nextRegion, mode = "replace") {
    const baseRegion = Array.isArray(baseSelection)
      ? setRectsOnRegion(baseSelection)
      : cloneRegion(baseSelection);
    const region = cloneRegion(nextRegion);

    if (!region || region.isEmpty?.()) {
      return mode === "replace" ? createEmptyRegion() : baseRegion;
    }

    if (mode === "add") {
      return baseRegion?.addRegion?.(region) || region;
    }

    if (mode === "subtract") {
      return baseRegion?.subtractRegion?.(region) || baseRegion;
    }

    return region;
  }

  function setRectsOnRegion(rects) {
    const region = createEmptyRegion();

    cloneRects(rects).forEach((rect) => region?.addRect?.(rect));

    return region;
  }

  function getDocumentRect() {
    const renderer = getRenderer();

    return {
      height: Math.max(1, Math.round(renderer?.height || 1)),
      width: Math.max(1, Math.round(renderer?.width || 1)),
      x: 0,
      y: 0,
    };
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

  function getColorRangeLayerSource() {
    const renderer = getRenderer();
    const layerModel = namespace.documentLayerModel;
    const activeId = layerModel?.activeLayerId || "";
    const layer = activeId ? layerModel.findEntryById?.(activeId) : null;
    const target = activeId ? renderer?.rasterTargetsByLayerId?.get?.(activeId) : null;

    if (!renderer || !layer || !target || (layer.type !== "paint" && layer.type !== "image")) {
      return null;
    }

    return {
      layer,
      layerId: activeId,
      target,
    };
  }

  function getLayerAlphaSource(layerId) {
    const renderer = getRenderer();
    const layerModel = namespace.documentLayerModel;
    const resolvedLayerId = String(layerId || layerModel?.activeLayerId || "").trim();
    const layer = resolvedLayerId ? layerModel?.findEntryById?.(resolvedLayerId) : null;
    const target = resolvedLayerId ? renderer?.rasterTargetsByLayerId?.get?.(resolvedLayerId) : null;

    if (!renderer || !layer || !target || layer.type === "group" || layer.type === "background" || layer.id === "background") {
      return null;
    }

    return {
      layer,
      layerId: resolvedLayerId,
      target,
    };
  }

  function canReadColorRangeTarget(target) {
    const renderer = getRenderer();

    if (!target) {
      return false;
    }

    if (renderer?.isSparseRasterTarget?.(target) === true) {
      let hasReadableTile = false;

      target.tiles?.forEach?.((tileTarget) => {
        if (
          tileTarget &&
          ((tileTarget.framebuffer && tileTarget.texture) || tileTarget.cpuPixels instanceof Uint8Array)
        ) {
          hasReadableTile = true;
        }
      });

      return hasReadableTile;
    }

    return Boolean((target.framebuffer && target.texture) || target.cpuPixels instanceof Uint8Array);
  }

  function canSelectLayerAlpha(layerId) {
    const sourceInfo = getLayerAlphaSource(layerId);

    return Boolean(sourceInfo?.target && canReadColorRangeTarget(sourceInfo.target));
  }

  function readFramebufferPixelsTopDown(gl, framebuffer, width, height) {
    const pixels = new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    return pixels;
  }

  function getTopDownRgbaOffset(pixelIndex, width, height) {
    const y = Math.floor(pixelIndex / width);
    const x = pixelIndex - y * width;
    const webglY = height - 1 - y;

    return (webglY * width + x) * 4;
  }

  function getColorRangeTargetDocumentRect(target, width, height) {
    const renderer = getRenderer();
    const rect = renderer?.getRasterTargetDocumentRect?.(target);

    if (rect) {
      return rect;
    }

    return {
      height,
      width,
      x: Number.isFinite(target?.x) ? Math.round(target.x) : 0,
      y: Number.isFinite(target?.y) ? Math.round(target.y) : 0,
    };
  }

  function createDenseColorRangePixelSource(gl, target, options = {}) {
    const renderer = getRenderer();

    if ((!target?.framebuffer || !target?.texture) && renderer?.hydrateRasterTarget) {
      renderer.hydrateRasterTarget(target, {
        kind: target?.kind || "layer",
        label: target?.layerId || target?.id || "color range target",
        layerId: target?.layerId || "",
        ownerId: target?.ownerId || target?.layerId || target?.id || "",
        ownerType: "live",
        reason: options.reason || "color-range-selection-hydrate",
      });
    }

    if (!target?.framebuffer || !target?.texture) {
      return null;
    }

    const width = Math.max(1, Math.round(target.width || 1));
    const height = Math.max(1, Math.round(target.height || 1));
    const rect = getColorRangeTargetDocumentRect(target, width, height);

    return {
      height,
      pixels: readFramebufferPixelsTopDown(gl, target.framebuffer, width, height),
      sparse: false,
      width,
      x: rect.x,
      y: rect.y,
    };
  }

  function createSparseColorRangePixelSource(gl, sparseTarget, options = {}) {
    const renderer = getRenderer();
    const tileSources = [];
    const tileMap = new Map();
    const tileSize = Math.max(1, Math.round(sparseTarget?.tileSize || 256));

    sparseTarget?.tiles?.forEach?.((tileTarget) => {
      if (!tileTarget) {
        return;
      }

      if ((!tileTarget.framebuffer || !tileTarget.texture) && renderer?.hydrateRasterTarget) {
        renderer.hydrateRasterTarget(tileTarget, {
          kind: "paintTile",
          label: `${sparseTarget.layerId || "color-range"} tile ${tileTarget.tx},${tileTarget.ty}`,
          layerId: sparseTarget.layerId || "",
          ownerId: tileTarget.ownerId || `${sparseTarget.layerId || "color-range"}:${tileTarget.tx}:${tileTarget.ty}`,
          ownerType: "live",
          reason: options.reason || "color-range-selection-hydrate",
        });
      }

      if (!tileTarget.framebuffer || !tileTarget.texture) {
        return;
      }

      const width = Math.max(1, Math.round(tileTarget.width || tileSize));
      const height = Math.max(1, Math.round(tileTarget.height || tileSize));
      const rect = getColorRangeTargetDocumentRect(tileTarget, width, height);
      const tx = Number.isFinite(tileTarget.tx) ? Math.round(tileTarget.tx) : Math.floor(rect.x / tileSize);
      const ty = Number.isFinite(tileTarget.ty) ? Math.round(tileTarget.ty) : Math.floor(rect.y / tileSize);
      const tileSource = {
        height,
        pixels: readFramebufferPixelsTopDown(gl, tileTarget.framebuffer, width, height),
        width,
        x: rect.x,
        y: rect.y,
      };

      tileSources.push(tileSource);
      tileMap.set(`${tx}:${ty}`, tileSource);
    });

    return {
      sparse: true,
      tileMap,
      tiles: tileSources,
      tileSize,
    };
  }

  function createColorRangePixelSource(gl, target, options = {}) {
    const renderer = getRenderer();

    if (renderer?.isSparseRasterTarget?.(target) === true) {
      return createSparseColorRangePixelSource(gl, target, options);
    }

    return createDenseColorRangePixelSource(gl, target, options);
  }

  function getColorRangePixelOffset(source, documentX, documentY) {
    if (!source) {
      return null;
    }

    if (source.sparse === true) {
      const x = Math.floor(documentX);
      const y = Math.floor(documentY);
      const tileSize = Math.max(1, Math.round(source.tileSize || 1));
      const tx = Math.floor(x / tileSize);
      const ty = Math.floor(y / tileSize);
      const tileSource = source.tileMap?.get?.(`${tx}:${ty}`);

      if (!tileSource) {
        return null;
      }

      const localX = x - tileSource.x;
      const localY = y - tileSource.y;

      if (
        localX < 0 ||
        localY < 0 ||
        localX >= tileSource.width ||
        localY >= tileSource.height
      ) {
        return null;
      }

      return {
        offset: getTopDownRgbaOffset(
          localY * tileSource.width + localX,
          tileSource.width,
          tileSource.height,
        ),
        pixels: tileSource.pixels,
      };
    }

    const localX = Math.floor(documentX) - source.x;
    const localY = Math.floor(documentY) - source.y;

    if (
      localX < 0 ||
      localY < 0 ||
      localX >= source.width ||
      localY >= source.height
    ) {
      return null;
    }

    return {
      offset: getTopDownRgbaOffset(localY * source.width + localX, source.width, source.height),
      pixels: source.pixels,
    };
  }

  function getColorRangePixel(source, documentX, documentY) {
    const offset = getColorRangePixelOffset(source, documentX, documentY);

    if (!offset?.pixels || offset.offset < 0) {
      return null;
    }

    return {
      a: offset.pixels[offset.offset + 3],
      b: offset.pixels[offset.offset + 2],
      g: offset.pixels[offset.offset + 1],
      r: offset.pixels[offset.offset],
    };
  }

  function colorRangeDistanceSq(pixels, offset, sample) {
    const dr = pixels[offset] - sample.r;
    const dg = pixels[offset + 1] - sample.g;
    const db = pixels[offset + 2] - sample.b;
    const da = pixels[offset + 3] - sample.a;

    return dr * dr + dg * dg + db * db + da * da;
  }

  function appendColorRangeInterval(rows, y, startX, endX) {
    if (endX <= startX) {
      return;
    }

    const intervals = rows.get(y) || [];

    intervals.push([startX, endX]);
    rows.set(y, intervals);
  }

  function scanColorRangeTile(rows, tileSource, sample, toleranceSq) {
    for (let localY = 0; localY < tileSource.height; localY += 1) {
      const docY = tileSource.y + localY;
      let startX = null;

      for (let localX = 0; localX < tileSource.width; localX += 1) {
        const offset = getTopDownRgbaOffset(localY * tileSource.width + localX, tileSource.width, tileSource.height);
        const alpha = tileSource.pixels[offset + 3];
        const isMatch = alpha >= COLOR_RANGE_MIN_ALPHA &&
          colorRangeDistanceSq(tileSource.pixels, offset, sample) <= toleranceSq;
        const docX = tileSource.x + localX;

        if (isMatch && startX == null) {
          startX = docX;
        } else if (!isMatch && startX != null) {
          appendColorRangeInterval(rows, docY, startX, docX);
          startX = null;
        }
      }

      if (startX != null) {
        appendColorRangeInterval(rows, docY, startX, tileSource.x + tileSource.width);
      }
    }
  }

  function createColorRangeRegion(source, sample, tolerance) {
    if (!source || !sample || sample.a < COLOR_RANGE_MIN_ALPHA) {
      return createEmptyRegion();
    }

    const rows = new Map();
    const toleranceSq = Math.round(clamp(tolerance, 0, MAX_COLOR_RANGE_TOLERANCE)) ** 2;

    if (source.sparse === true) {
      source.tiles.forEach((tileSource) => {
        scanColorRangeTile(rows, tileSource, sample, toleranceSq);
      });
    } else {
      scanColorRangeTile(rows, source, sample, toleranceSq);
    }

    return createRegionFromRows(rows);
  }

  function scanLayerAlphaTile(rows, tileSource, alphaThreshold = COLOR_RANGE_MIN_ALPHA) {
    for (let localY = 0; localY < tileSource.height; localY += 1) {
      const docY = tileSource.y + localY;
      let startX = null;

      for (let localX = 0; localX < tileSource.width; localX += 1) {
        const offset = getTopDownRgbaOffset(localY * tileSource.width + localX, tileSource.width, tileSource.height);
        const isOpaqueEnough = tileSource.pixels[offset + 3] >= alphaThreshold;
        const docX = tileSource.x + localX;

        if (isOpaqueEnough && startX == null) {
          startX = docX;
        } else if (!isOpaqueEnough && startX != null) {
          appendColorRangeInterval(rows, docY, startX, docX);
          startX = null;
        }
      }

      if (startX != null) {
        appendColorRangeInterval(rows, docY, startX, tileSource.x + tileSource.width);
      }
    }
  }

  function createLayerAlphaRegion(source, alphaThreshold = COLOR_RANGE_MIN_ALPHA) {
    if (!source) {
      return createEmptyRegion();
    }

    const rows = new Map();
    const threshold = Math.round(clamp(alphaThreshold, COLOR_RANGE_MIN_ALPHA, 255));

    if (source.sparse === true) {
      source.tiles.forEach((tileSource) => {
        scanLayerAlphaTile(rows, tileSource, threshold);
      });
    } else {
      scanLayerAlphaTile(rows, source, threshold);
    }

    return createRegionFromRows(rows);
  }

  function selectLayerAlpha(layerId, options = {}) {
    const renderer = getRenderer();
    const gl = renderer?.gl || renderer?.context;
    const sourceInfo = getLayerAlphaSource(layerId);

    if (!renderer || !gl || !sourceInfo?.target) {
      return false;
    }

    const source = createColorRangePixelSource(gl, sourceInfo.target, {
      reason: "layer-alpha-selection-hydrate",
    });
    const threshold = options.alphaThreshold ?? options.threshold ?? COLOR_RANGE_MIN_ALPHA;
    const alphaRegion = createLayerAlphaRegion(source, threshold);

    if (!alphaRegion || alphaRegion.isEmpty?.()) {
      return false;
    }

    const beforeRegion = getRegionSnapshot();
    const nextRegion = applyRegionOperation(
      beforeRegion,
      alphaRegion,
      normalizeOperationMode(options.operationMode || "replace"),
    );

    setRegion(nextRegion, {
      historyBeforeRegion: beforeRegion,
      source: options.source || "area-selection-layer-alpha-commit",
    });

    return true;
  }

  function selectColorRangeAt(point) {
    const renderer = getRenderer();
    const gl = renderer?.gl || renderer?.context;
    const sourceInfo = getColorRangeLayerSource();

    if (!renderer || !gl || !sourceInfo?.target) {
      return false;
    }

    const seedX = Math.floor(point?.docX ?? point?.x);
    const seedY = Math.floor(point?.docY ?? point?.y);
    const source = createColorRangePixelSource(gl, sourceInfo.target);
    const sample = getColorRangePixel(source, seedX, seedY);

    if (!sample || sample.a < COLOR_RANGE_MIN_ALPHA) {
      return false;
    }

    const sampledRegion = createColorRangeRegion(source, sample, state.colorRangeTolerance);

    if (!sampledRegion || sampledRegion.isEmpty?.()) {
      return false;
    }

    const beforeRegion = getRegionSnapshot();
    const nextRegion = applyRegionOperation(beforeRegion, sampledRegion, state.operationMode);

    setColorRangeSampleColor(rgbToHexColor(sample.r, sample.g, sample.b), {
      source: "area-selection-color-range",
    });
    setRegion(nextRegion, {
      historyBeforeRegion: beforeRegion,
      source: "area-selection-color-range-commit",
    });

    return true;
  }

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function setRect(rect, options = {}) {
    return setRegion(rect ? createRegionFromRect(rect) : createEmptyRegion(), options);
  }

  function setSelectionRects(rects, options = {}) {
    return setRegion(setRectsOnRegion(rects), options);
  }

  function setRegion(region, options = {}) {
    const beforeRegion = cloneRegion(options.historyBeforeRegion || state.region);
    state.region = cloneRegion(region);
    state.rect = state.region?.getBounds?.() || null;
    state.rects = state.region?.getCoverageRects?.() || [];
    state.visualPolygonPoints = clonePoints(options.visualPolygonPoints);
    namespace.activeAreaSelectionRect = cloneRect(state.rect);
    namespace.activeAreaSelectionRects = cloneRects(state.rects);
    markOverlayRegionDirty();
    updateOverlay();

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("cbo:area-selection-change", {
        detail: {
          rect: cloneRect(state.rect),
          rects: cloneRects(state.rects),
          source: options.source || "area-selection",
        },
      }));
    }

    if (state.rect) {
      startOverlayLoop();
    }

    pushSelectionHistory(beforeRegion, state.region, options);

    return cloneRect(state.rect);
  }

  function serializeRegionForHistory(region) {
    return region?.serialize?.() || createEmptyRegion()?.serialize?.() || { rows: [], version: 0 };
  }

  function restoreSelectionHistoryRegion(serializedRegion, source) {
    const region = namespace.SelectionRegion?.deserialize?.(serializedRegion) || createEmptyRegion();

    setRegion(region, {
      history: false,
      source,
    });
  }

  function pushSelectionHistory(beforeRegion, afterRegion, options = {}) {
    const history = namespace.documentHistory;

    if (
      !history?.push ||
      history.canRecord?.(options) === false ||
      options.history === false ||
      options.recordHistory === false ||
      options.selectionHistory === false
    ) {
      return false;
    }

    const source = options.source || "area-selection";

    if (!/commit|escape|clear/.test(source)) {
      return false;
    }

    const before = serializeRegionForHistory(beforeRegion);
    const after = serializeRegionForHistory(afterRegion);

    if (JSON.stringify(before.rows || []) === JSON.stringify(after.rows || [])) {
      return false;
    }

    return history.push({
      after,
      before,
      source: "area-selection-history",
      type: "selection",
      undo: () => {
        restoreSelectionHistoryRegion(before, "history-undo-area-selection");
        return true;
      },
      redo: () => {
        restoreSelectionHistoryRegion(after, "history-redo-area-selection");
        return true;
      },
    }, {
      source: "area-selection-history",
    });
  }

  function clear(options = {}) {
    return setRect(null, {
      ...options,
      source: options.source || "area-selection-clear",
    });
  }

  function hasSelection() {
    return Boolean(state.region && !state.region.isEmpty?.());
  }

  function getRect() {
    return cloneRect(state.rect);
  }

  function getRects() {
    return cloneRects(state.rects);
  }

  function getBounds() {
    return getRect();
  }

  function getRegionSnapshot() {
    return cloneRegion(state.region);
  }

  function setRegionSnapshot(region, options = {}) {
    return setRegion(region, options);
  }

  function getIntersectingRects(rect) {
    return hasSelection() && state.region?.getCoverageRects
      ? state.region.getCoverageRects(rect)
      : [cloneRect(rect)].filter(Boolean);
  }

  function intersectRect(rect) {
    return hasSelection() && state.region?.intersectBounds
      ? state.region.intersectBounds(rect)
      : cloneRect(rect);
  }

  function isPointInside(docX, docY) {
    if (!hasSelection()) {
      return true;
    }

    return state.region?.containsPoint?.(docX, docY) === true;
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

  function getScreenPoint(point) {
    const brushEngine = getBrushEngine();
    const canvas = state.canvas;
    const camera = brushEngine?.camera;
    const dpr = Math.max(1, Number(brushEngine?.dpr) || window.devicePixelRatio || 1);

    if (!canvas || !camera || !point) {
      return null;
    }

    return {
      x: (camera.x + point.x * camera.zoom) / dpr,
      y: (camera.y + point.y * camera.zoom) / dpr,
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

  function resizeOverlayCanvas(canvas, viewportRect) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(viewportRect.width));
    const height = Math.max(1, Math.round(viewportRect.height));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const didResize = canvas.width !== pixelWidth || canvas.height !== pixelHeight;

    if (didResize) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    return { didResize, dpr };
  }

  function getDocumentPointToScreenMapper(documentScreenRect) {
    const renderer = getRenderer();
    const documentWidth = Math.max(1, Math.round(renderer?.width || 1));
    const documentHeight = Math.max(1, Math.round(renderer?.height || 1));
    const scaleX = documentScreenRect.width / documentWidth;
    const scaleY = documentScreenRect.height / documentHeight;

    return (docX, docY) => ({
      x: documentScreenRect.left + docX * scaleX,
      y: documentScreenRect.top + docY * scaleY,
    });
  }

  function strokeBoundarySegments(ctx, segments, mapPoint, dashOffset) {
    if (!Array.isArray(segments) || segments.length === 0) {
      return;
    }

    const drawPath = () => {
      ctx.beginPath();
      segments.forEach((segment) => {
        const start = mapPoint(segment.x1, segment.y1);
        const end = mapPoint(segment.x2, segment.y2);

        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      });
    };

    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.setLineDash([6, 6]);

    drawPath();
    ctx.strokeStyle = "rgba(245, 251, 255, 0.96)";
    ctx.lineDashOffset = dashOffset;
    ctx.stroke();

    drawPath();
    ctx.strokeStyle = "#18a0fb";
    ctx.lineDashOffset = dashOffset + 6;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function strokeStaticBoundarySegments(ctx, segments, mapPoint) {
    if (!Array.isArray(segments) || segments.length === 0) {
      return;
    }

    ctx.beginPath();
    segments.forEach((segment) => {
      const start = mapPoint(segment.x1, segment.y1);
      const end = mapPoint(segment.x2, segment.y2);

      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    });
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.setLineDash([]);
    ctx.strokeStyle = "#18a0fb";
    ctx.stroke();
  }

  function strokeCachedBoundary(ctx, dashOffset = 0, isAnimated = false) {
    const path = state.overlayCache.boundaryPath;
    const segments = state.overlayCache.boundarySegmentsScreen;

    if (!path && (!Array.isArray(segments) || segments.length === 0)) {
      return;
    }

    const strokePath = () => {
      if (path) {
        ctx.stroke(path);
        return;
      }

      ctx.beginPath();
      segments.forEach((segment) => {
        ctx.moveTo(segment.x1, segment.y1);
        ctx.lineTo(segment.x2, segment.y2);
      });
      ctx.stroke();
    };

    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    if (!isAnimated) {
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = 0;
      ctx.strokeStyle = "#18a0fb";
      strokePath();
      ctx.setLineDash([]);
      return;
    }

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(245, 251, 255, 0.96)";
    ctx.lineDashOffset = dashOffset;
    strokePath();
    ctx.strokeStyle = "#18a0fb";
    ctx.lineDashOffset = dashOffset + 6;
    strokePath();
    ctx.setLineDash([]);
  }

  function strokeLassoPath(ctx, dashOffset = 0) {
    const points = getActiveLassoPathPoints();

    if (!Array.isArray(points) || points.length < 2) {
      return;
    }

    ctx.beginPath();
    points.forEach((point, index) => {
      const screenPoint = getScreenPoint(point);

      if (!screenPoint) {
        return;
      }

      if (index === 0) {
        ctx.moveTo(screenPoint.x, screenPoint.y);
      } else {
        ctx.lineTo(screenPoint.x, screenPoint.y);
      }
    });
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(245, 251, 255, 0.96)";
    ctx.lineDashOffset = dashOffset;
    ctx.stroke();
    ctx.strokeStyle = "#18a0fb";
    ctx.lineDashOffset = dashOffset + 6;
    ctx.stroke();
    ctx.setLineDash([]);
  }


  function ensureOverlay() {
    if (state.overlay?.isConnected) {
      return state.overlay;
    }

    const overlay = document.createElement("div");
    const shadeCanvas = document.createElement("canvas");
    const antsCanvas = document.createElement("canvas");
    const host = state.canvas?.parentElement || document.querySelector(".editor-stage");

    overlay.className = "editor-area-selection-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    shadeCanvas.className = "editor-area-selection-canvas editor-area-selection-shade-canvas";
    antsCanvas.className = "editor-area-selection-canvas editor-area-selection-ants-canvas";
    overlay.append(shadeCanvas, antsCanvas);
    host?.appendChild(overlay);
    state.overlay = overlay;

    return overlay;
  }

  function clearOverlayCanvases(overlay) {
    overlay?.querySelectorAll?.(".editor-area-selection-canvas")?.forEach((canvas) => {
      const ctx = canvas.getContext?.("2d");

      ctx?.clearRect?.(0, 0, canvas.width || 0, canvas.height || 0);
    });
  }

  function syncOverlayCanvasSize(canvas, viewportRect) {
    return resizeOverlayCanvas(canvas, viewportRect);
  }

  function getBoundaryPointKey(point) {
    return `${point.x}:${point.y}`;
  }

  function simplifyBoundaryPath(points) {
    const simplified = [];

    clonePoints(points).forEach((point) => {
      const previous = simplified[simplified.length - 1];

      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        simplified.push(point);
      }
    });

    let index = 1;

    while (index < simplified.length - 1) {
      const previous = simplified[index - 1];
      const current = simplified[index];
      const next = simplified[index + 1];
      const isCollinear = (
        (previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y)
      );

      if (isCollinear) {
        simplified.splice(index, 1);
      } else {
        index += 1;
      }
    }

    return simplified;
  }

  function buildContinuousBoundaryPaths(segments) {
    const edges = Array.isArray(segments)
      ? segments
        .map((segment, id) => {
          const a = { x: Number(segment?.x1), y: Number(segment?.y1) };
          const b = { x: Number(segment?.x2), y: Number(segment?.y2) };

          if (
            !Number.isFinite(a.x) ||
            !Number.isFinite(a.y) ||
            !Number.isFinite(b.x) ||
            !Number.isFinite(b.y) ||
            (a.x === b.x && a.y === b.y)
          ) {
            return null;
          }

          return {
            a,
            aKey: getBoundaryPointKey(a),
            b,
            bKey: getBoundaryPointKey(b),
            id,
          };
        })
        .filter(Boolean)
      : [];
    const adjacency = new Map();
    const visited = new Set();

    edges.forEach((edge) => {
      [edge.aKey, edge.bKey].forEach((key) => {
        const list = adjacency.get(key) || [];

        list.push(edge.id);
        adjacency.set(key, list);
      });
    });

    const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
    const paths = [];

    edges.forEach((startEdge) => {
      if (visited.has(startEdge.id)) {
        return;
      }

      const points = [startEdge.a, startEdge.b];
      const startKey = startEdge.aKey;
      let currentKey = startEdge.bKey;

      visited.add(startEdge.id);

      while (currentKey !== startKey) {
        const nextId = (adjacency.get(currentKey) || [])
          .find((id) => !visited.has(id));

        if (nextId == null) {
          break;
        }

        const edge = edgeById.get(nextId);
        const nextPoint = edge.aKey === currentKey ? edge.b : edge.a;

        visited.add(nextId);
        points.push(nextPoint);
        currentKey = edge.aKey === currentKey ? edge.bKey : edge.aKey;
      }

      if (points.length >= 2) {
        if (currentKey === startKey) {
          points.pop();
        }

        paths.push(simplifyBoundaryPath(points));
      }
    });

    return paths.filter((path) => path.length >= 2);
  }

  function rebuildOverlayRegionCache() {
    state.overlayCache.coverageRectsDoc = cloneRects(state.rects);
    state.overlayCache.boundarySegmentsDoc = state.region?.getBoundarySegments?.() || [];
    state.overlayCache.regionDirty = false;
    state.overlayCache.screenDirty = true;
    state.overlayCache.shadeDirty = true;
  }

  function rebuildOverlayScreenCache(documentRect) {
    const mapPoint = getDocumentPointToScreenMapper(documentRect);
    let boundarySegmentsScreen = [];
    const boundaryPath = typeof Path2D === "function" ? new Path2D() : null;
    const coveragePath = typeof Path2D === "function" ? new Path2D() : null;
    const visualPolygonPoints = clonePoints(state.visualPolygonPoints);

    if (visualPolygonPoints.length >= LASSO_MIN_POINTS && boundaryPath && coveragePath) {
      visualPolygonPoints.forEach((point, index) => {
        const screenPoint = mapPoint(point.x, point.y);

        if (index === 0) {
          boundaryPath.moveTo(screenPoint.x, screenPoint.y);
          coveragePath.moveTo(screenPoint.x, screenPoint.y);
        } else {
          boundaryPath.lineTo(screenPoint.x, screenPoint.y);
          coveragePath.lineTo(screenPoint.x, screenPoint.y);
        }
      });
      boundaryPath.closePath();
      coveragePath.closePath();
    } else {
      boundarySegmentsScreen = state.overlayCache.boundarySegmentsDoc.map((segment) => {
        const start = mapPoint(segment.x1, segment.y1);
        const end = mapPoint(segment.x2, segment.y2);

        return {
          x1: start.x,
          x2: end.x,
          y1: start.y,
          y2: end.y,
        };
      });

      if (boundaryPath) {
        buildContinuousBoundaryPaths(state.overlayCache.boundarySegmentsDoc).forEach((pathPoints) => {
          pathPoints.forEach((point, index) => {
            const screenPoint = mapPoint(point.x, point.y);

            if (index === 0) {
              boundaryPath.moveTo(screenPoint.x, screenPoint.y);
            } else {
              boundaryPath.lineTo(screenPoint.x, screenPoint.y);
            }
          });
          boundaryPath.closePath();
        });
      }
    }

    state.overlayCache.boundarySegmentsScreen = boundarySegmentsScreen;
    state.overlayCache.boundaryPath = boundaryPath;
    state.overlayCache.coveragePath = visualPolygonPoints.length >= LASSO_MIN_POINTS ? coveragePath : null;
    state.overlayCache.coverageRectsScreen = state.overlayCache.coverageRectsDoc
      .map(getScreenRect)
      .filter(Boolean);
    state.overlayCache.documentScreenRect = documentRect;
    state.overlayCache.screenDirty = false;
    state.overlayCache.shadeDirty = true;
  }

  function drawSelectionShade(overlay, viewportRect, dpr) {
    const canvas = overlay.querySelector(".editor-area-selection-shade-canvas");
    const ctx = canvas?.getContext?.("2d");
    const documentRect = state.overlayCache.documentScreenRect;

    if (!canvas || !ctx || !documentRect) {
      return;
    }

    const fillDeviceRect = (rect) => {
      const x0 = Math.floor(rect.left * dpr);
      const y0 = Math.floor(rect.top * dpr);
      const x1 = Math.ceil((rect.left + rect.width) * dpr);
      const y1 = Math.ceil((rect.top + rect.height) * dpr);

      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width || Math.ceil(viewportRect.width * dpr), canvas.height || Math.ceil(viewportRect.height * dpr));
    ctx.fillStyle = "rgba(24, 160, 251, 0.11)";
    fillDeviceRect(documentRect);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000000";
    if (state.overlayCache.coveragePath) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fill(state.overlayCache.coveragePath);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      state.overlayCache.coverageRectsScreen.forEach((rectScreen) => {
        fillDeviceRect(rectScreen);
      });
    }
    ctx.globalCompositeOperation = "source-over";
    state.overlayCache.shadeDirty = false;
  }

  function drawOverlayBoundaryFrame(overlay, viewportRect, dpr) {
    const canvas = overlay.querySelector(".editor-area-selection-ants-canvas");
    const ctx = canvas?.getContext?.("2d");

    if (!canvas || !ctx) {
      return;
    }

    const dashOffset = isOverlayAnimationPaused()
      ? state.overlayDashOffset
      : -((getNow() / 45) % 12);

    state.overlayDashOffset = dashOffset;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportRect.width, viewportRect.height);

    if (AREA_SELECTION_ANTS_ENABLED) {
      strokeCachedBoundary(ctx, dashOffset, true);
    } else {
      strokeCachedBoundary(ctx, 0, false);
    }

    if ((isLassoToolActive() && state.pointerId != null) || isPolygonLassoInProgress()) {
      strokeLassoPath(ctx, AREA_SELECTION_ANTS_ENABLED ? dashOffset : 0);
    }
  }

  function updateOverlay(options = {}) {
    const overlay = ensureOverlay();
    const documentRect = getDocumentScreenRect();
    const hasLassoPath = isLassoToolActive() && state.pointerId != null && state.lassoPoints.length > 1;
    const hasPolygonLassoPath = isPolygonLassoInProgress() && getActiveLassoPathPoints().length > 1;

    if (!documentRect || (!state.rect && !hasLassoPath && !hasPolygonLassoPath)) {
      overlay.hidden = true;
      clearOverlayCanvases(overlay);
      return;
    }

    overlay.hidden = false;
    overlay.style.left = "0px";
    overlay.style.top = "0px";
    const viewportRect = getViewportRect();

    overlay.style.width = `${viewportRect.width}px`;
    overlay.style.height = `${viewportRect.height}px`;

    const shadeCanvas = overlay.querySelector(".editor-area-selection-shade-canvas");
    const antsCanvas = overlay.querySelector(".editor-area-selection-ants-canvas");
    const shadeSize = shadeCanvas ? syncOverlayCanvasSize(shadeCanvas, viewportRect) : { didResize: false, dpr: 1 };
    const dpr = shadeSize.dpr;

    if (antsCanvas) {
      const antsSize = syncOverlayCanvasSize(antsCanvas, viewportRect);

      if (antsSize.didResize) {
        state.overlayCache.screenDirty = true;
      }
    }

    if (shadeSize.didResize) {
      state.overlayCache.screenDirty = true;
      state.overlayCache.shadeDirty = true;
    }

    if (options.regionDirty === true || state.overlayCache.regionDirty) {
      rebuildOverlayRegionCache();
    }

    if (options.screenDirty === true || state.overlayCache.screenDirty) {
      rebuildOverlayScreenCache(documentRect);
    }

    if (state.rect && options.shadeDirty !== false && state.overlayCache.shadeDirty) {
      drawSelectionShade(overlay, viewportRect, dpr);
    } else if (!state.rect) {
      const shadeCanvas = overlay.querySelector(".editor-area-selection-shade-canvas");
      const shadeCtx = shadeCanvas?.getContext?.("2d");

      shadeCtx?.clearRect?.(0, 0, shadeCanvas.width || 0, shadeCanvas.height || 0);
    }

    drawOverlayBoundaryFrame(overlay, viewportRect, dpr);
  }

  function startOverlayLoop() {
    if (state.rafId) {
      return;
    }

    if (state.resumeTimerId) {
      window.clearTimeout?.(state.resumeTimerId);
      state.resumeTimerId = 0;
    }

    const tick = () => {
      state.rafId = 0;
      updateOverlay();

      if ((state.rect || state.pointerId != null || state.polygonLassoActive) && !isOverlayAnimationPaused()) {
        state.rafId = window.requestAnimationFrame(tick);
      } else if (state.rect || state.pointerId != null || state.polygonLassoActive) {
        state.resumeTimerId = window.setTimeout?.(() => {
          state.resumeTimerId = 0;
          startOverlayLoop();
        }, 120) || 0;
      }
    };

    state.rafId = window.requestAnimationFrame(tick);
  }

  function stopOverlayLoop() {
    if (!state.rafId || state.rect || state.pointerId != null || state.polygonLassoActive) {
      return;
    }

    window.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    if (state.resumeTimerId) {
      window.clearTimeout?.(state.resumeTimerId);
      state.resumeTimerId = 0;
    }
  }

  function isRectToolActive() {
    return state.activeToolMode === RECT_TOOL_MODE;
  }

  function isCircleToolActive() {
    return state.activeToolMode === CIRCLE_TOOL_MODE;
  }

  function isLassoToolActive() {
    return state.activeToolMode === LASSO_TOOL_MODE;
  }

  function isPolygonLassoToolActive() {
    return state.activeToolMode === POLYGON_LASSO_TOOL_MODE;
  }

  function isColorRangeToolActive() {
    return state.activeToolMode === COLOR_RANGE_TOOL_MODE;
  }

  function isPolygonLassoInProgress() {
    return state.polygonLassoActive === true;
  }

  function isAreaSelectionToolActive() {
    return isRectToolActive() || isCircleToolActive() || isLassoToolActive() || isPolygonLassoToolActive() || isColorRangeToolActive();
  }

  function getActiveSelectionShape() {
    return isCircleToolActive() ? "ellipse" : "rect";
  }

  function getEventDocumentPoint(event) {
    const brushEngine = getBrushEngine();

    if (!brushEngine?.screenToDocumentSpace) {
      return null;
    }

    return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
  }

  function clampDocumentPoint(point) {
    const documentRect = getDocumentRect();

    return {
      x: clamp(point?.docX ?? point?.x, documentRect.x, documentRect.x + documentRect.width),
      y: clamp(point?.docY ?? point?.y, documentRect.y, documentRect.y + documentRect.height),
    };
  }

  function shouldAppendLassoPoint(point) {
    const previous = state.lassoPoints[state.lassoPoints.length - 1];

    if (!previous) {
      return true;
    }

    return Math.hypot(point.x - previous.x, point.y - previous.y) >= LASSO_POINT_SPACING;
  }

  function appendLassoPoint(point) {
    const clampedPoint = clampDocumentPoint(point);

    if (shouldAppendLassoPoint(clampedPoint)) {
      state.lassoPoints.push(clampedPoint);
      return true;
    }

    return false;
  }

  function getActiveLassoPathPoints() {
    const points = clonePoints(state.lassoPoints);
    const previewPoint = state.polygonLassoActive
      ? clonePoints([state.polygonPreviewPoint])[0]
      : null;
    const lastPoint = points[points.length - 1];

    if (
      previewPoint &&
      (!lastPoint || Math.hypot(previewPoint.x - lastPoint.x, previewPoint.y - lastPoint.y) >= LASSO_POINT_SPACING)
    ) {
      points.push(previewPoint);
    }

    return points;
  }

  function isNearFirstLassoPoint(point) {
    const firstPoint = state.lassoPoints[0];

    if (!firstPoint || state.lassoPoints.length < LASSO_MIN_POINTS) {
      return false;
    }

    const screenPoint = getScreenPoint(clampDocumentPoint(point));
    const firstScreenPoint = getScreenPoint(firstPoint);

    if (!screenPoint || !firstScreenPoint) {
      return Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) <= POLYGON_LASSO_CLOSE_DISTANCE_PX;
    }

    return Math.hypot(screenPoint.x - firstScreenPoint.x, screenPoint.y - firstScreenPoint.y) <= POLYGON_LASSO_CLOSE_DISTANCE_PX;
  }

  function resetPolygonLassoInteraction() {
    state.polygonLassoActive = false;
    state.polygonPreviewPoint = null;
    state.startPoint = null;
    state.baseRegion = null;
    state.dragOperationMode = "replace";
    state.lassoPoints = [];
  }

  function beginPolygonLasso(point) {
    const clampedPoint = clampDocumentPoint(point);

    state.polygonLassoActive = true;
    state.startPoint = point;
    state.baseRegion = getRegionSnapshot();
    state.dragOperationMode = state.operationMode;
    state.lassoPoints = [clampedPoint];
    state.polygonPreviewPoint = clampedPoint;

    if (state.dragOperationMode === "replace") {
      setRect(null, { source: "area-selection-polygon-lasso-start" });
    }

    updateOverlay({ shadeDirty: false });
    startOverlayLoop();
  }

  function cancelPolygonLasso(source = "area-selection-polygon-lasso-cancel") {
    const baseRegion = state.baseRegion;

    resetPolygonLassoInteraction();
    setRegion(baseRegion, { source });
    stopOverlayLoop();
  }

  function commitPolygonLasso(source = "area-selection-polygon-lasso-commit") {
    const points = clonePoints(state.lassoPoints);
    const baseRegion = state.baseRegion;
    const operationMode = state.dragOperationMode;

    if (!state.polygonLassoActive || !getPolygonBounds(points)) {
      return false;
    }

    resetPolygonLassoInteraction();
    setRegion(applyLassoOperation(
      baseRegion,
      points,
      operationMode,
    ), {
      historyBeforeRegion: baseRegion,
      source,
      visualPolygonPoints: operationMode === "replace" ? points : null,
    });
    stopOverlayLoop();

    return true;
  }

  function removeLastPolygonLassoPoint() {
    if (!state.polygonLassoActive) {
      return false;
    }

    if (state.lassoPoints.length <= 1) {
      cancelPolygonLasso();
      return true;
    }

    state.lassoPoints.pop();
    state.polygonPreviewPoint = state.lassoPoints[state.lassoPoints.length - 1] || null;
    updateOverlay({ shadeDirty: false });

    return true;
  }

  function handlePolygonLassoPointerDown(event, point) {
    if (state.pointerId != null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const clampedPoint = clampDocumentPoint(point);

    if (!state.polygonLassoActive) {
      beginPolygonLasso(clampedPoint);
      return;
    }

    if (isNearFirstLassoPoint(clampedPoint)) {
      commitPolygonLasso();
      return;
    }

    appendLassoPoint(clampedPoint);
    state.polygonPreviewPoint = clampedPoint;

    if (event.detail >= 2) {
      commitPolygonLasso();
      return;
    }

    updateOverlay({ shadeDirty: false });
  }

  function handlePointerDown(event) {
    if (!isAreaSelectionToolActive() || event.button !== 0 || state.pointerId != null) {
      return;
    }

    const point = getEventDocumentPoint(event);
    const brushEngine = getBrushEngine();

    if (!point || !brushEngine?.isDocumentPointInside?.(point)) {
      return;
    }

    if (isColorRangeToolActive()) {
      event.preventDefault();
      event.stopPropagation();
      selectColorRangeAt(point);
      return;
    }

    if (isPolygonLassoToolActive()) {
      handlePolygonLassoPointerDown(event, point);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.pointerId = event.pointerId;
    state.startPoint = point;
    state.baseRegion = getRegionSnapshot();
    state.dragOperationMode = state.operationMode;
    state.lassoPoints = [];
    if (isLassoToolActive()) {
      appendLassoPoint(point);
    }
    if (state.dragOperationMode === "replace") {
      setRect(null, { source: "area-selection-drag-start" });
    }
    state.pointerTarget?.setPointerCapture?.(event.pointerId);
    startOverlayLoop();
  }

  function handlePointerMove(event) {
    if (state.polygonLassoActive) {
      const point = getEventDocumentPoint(event);

      if (!point) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      state.polygonPreviewPoint = clampDocumentPoint(point);
      updateOverlay({ shadeDirty: false });
      return;
    }

    if (event.pointerId !== state.pointerId || !state.startPoint) {
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isLassoToolActive()) {
      if (appendLassoPoint(point)) {
        updateOverlay({ shadeDirty: false });
      }
      return;
    }

    setRegion(applySelectionOperation(
      state.baseRegion,
      normalizeRectFromPoints(state.startPoint, point, getSelectionDragOptions(event)),
      state.dragOperationMode,
      getActiveSelectionShape(),
    ), {
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

    if (state.pointerTarget?.hasPointerCapture?.(event.pointerId)) {
      state.pointerTarget.releasePointerCapture(event.pointerId);
    }

    const point = getEventDocumentPoint(event);

    if (didCancel || !point || !state.startPoint) {
      setRegion(state.baseRegion, { source: "area-selection-cancel" });
    } else if (isLassoToolActive()) {
      appendLassoPoint(point);
      setRegion(applyLassoOperation(
        state.baseRegion,
        state.lassoPoints,
        state.dragOperationMode,
      ), {
        historyBeforeRegion: state.baseRegion,
        source: "area-selection-lasso-commit",
      });
    } else {
      setRegion(applySelectionOperation(
        state.baseRegion,
        normalizeRectFromPoints(state.startPoint, point, getSelectionDragOptions(event)),
        state.dragOperationMode,
        getActiveSelectionShape(),
      ), {
        historyBeforeRegion: state.baseRegion,
        source: "area-selection-commit",
      });
    }

    state.pointerId = null;
    state.startPoint = null;
    state.baseRegion = null;
    state.dragOperationMode = "replace";
    state.lassoPoints = [];
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

  function deleteClipboardSnapshot() {
    const renderer = getRenderer();

    state.clipboard?.snapshots?.forEach((item) => {
      renderer?.deleteRasterSnapshot?.(item?.snapshot);
    });

    state.clipboard = null;
  }

  function copySelectionPixels() {
    const renderer = getRenderer();
    const layerId = getWritableLayerId();
    const rects = getRects();
    const rect = getBoundingRect(rects);

    if (!renderer || !layerId || !rect || rects.length === 0) {
      return false;
    }

    const sourceTarget = renderer.rasterTargetsByLayerId?.get?.(layerId);
    const snapshots = sourceTarget
      ? rects.map((selectionRect) => ({
          rect: cloneRect(selectionRect),
          snapshot: renderer.createRasterSnapshot?.(sourceTarget, selectionRect, "area-selection-copy"),
        }))
      : [];
    const validSnapshots = snapshots.filter((item) => item.snapshot?.texture && item.snapshot?.framebuffer);

    if (validSnapshots.length === 0 || validSnapshots.length !== rects.length) {
      snapshots.forEach((item) => renderer.deleteRasterSnapshot?.(item.snapshot));
      return false;
    }

    deleteClipboardSnapshot();
    state.clipboard = {
      layerId,
      rect: cloneRect(rect),
      snapshots: validSnapshots,
    };

    return true;
  }

  function resolvePasteLayer() {
    const renderer = getRenderer();
    const layerModel = namespace.documentLayerModel;
    const history = namespace.documentHistory;
    const activeId = layerModel?.activeLayerId || "";
    const activeLayer = activeId ? layerModel.findEntryById?.(activeId) : null;

    if (activeLayer && activeLayer.locked !== true && (activeLayer.type === "paint" || activeLayer.type === "image")) {
      return { layerId: activeLayer.id };
    }

    if (!renderer || !layerModel?.ensureActivePaintLayer) {
      return { layerId: "" };
    }

    history?.flushLayerState?.(layerModel);
    const beforeState = history?.getLayerSnapshot?.(layerModel) || null;
    const paintLayer = layerModel.ensureActivePaintLayer({
      history: false,
      source: "area-selection-paste-layer",
    });
    const afterState = history?.getLayerSnapshot?.(layerModel) || null;

    return {
      afterState,
      beforeState,
      createdLayer: true,
      layerId: paintLayer?.id || "",
    };
  }

  function restoreLayerStateOnPasteFailure(layerState) {
    const renderer = getRenderer();
    const layerModel = namespace.documentLayerModel;
    const history = namespace.documentHistory;

    if (layerState?.createdLayer && layerState.layerId) {
      renderer?.deleteRasterTarget?.(layerState.layerId, {
        emit: false,
        source: "area-selection-paste-cancel",
      });
    }

    if (layerState?.beforeState) {
      history?.restoreLayerState?.(layerModel, layerState.beforeState, {
        source: "area-selection-paste-cancel",
      });
    }
  }

  function pushPasteHistory(layerId, dirtyRect, tileHistory, beforeSnapshot, layerState) {
    const renderer = getRenderer();
    const history = namespace.documentHistory;
    const wrapEntry = (baseEntry) => {
      const rasterEntry = renderer?.finalizeRasterEditHistoryEntry?.(layerId, baseEntry, {
        source: "area-selection-paste",
      }) || baseEntry;

      if (!layerState?.beforeState || !layerState?.afterState || !renderer?.createRasterEditLayerStateHistoryEntry) {
        return rasterEntry;
      }

      return renderer.createRasterEditLayerStateHistoryEntry(rasterEntry, {
        afterState: layerState.afterState,
        beforeState: layerState.beforeState,
        history,
        layerId,
        source: "area-selection-paste",
      });
    };

    if (!history?.push || !renderer) {
      renderer?.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer?.deleteRasterSnapshot?.(beforeSnapshot);
      return;
    }

    if (tileHistory) {
      const tileEntry = renderer.commitRasterTileHistory?.(tileHistory, {
        label: "area-selection-paste",
        memoryPolicy: renderer.createRasterOperationMemoryReport?.({
          afterRect: dirtyRect,
          beforeRect: dirtyRect,
          layerId,
          operationType: "area-selection-paste",
          source: "area-selection-paste",
          targetRect: dirtyRect,
          tool: "selection",
        }),
        redoSource: "history-redo-area-selection-paste",
        source: "area-selection-paste",
        type: "pixel",
        undoSource: "history-undo-area-selection-paste",
      });
      const entry = tileEntry ? wrapEntry(tileEntry) : null;

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

    const afterSnapshot = renderer.createRasterSnapshot?.(layerId, dirtyRect, "area-selection-paste-after");
    const entry = wrapEntry({
      after: afterSnapshot,
      before: beforeSnapshot,
      layerId,
      memoryPolicy: renderer.createRasterOperationMemoryReport?.({
        afterSnapshot,
        beforeSnapshot,
        layerId,
        operationType: "area-selection-paste",
        source: "area-selection-paste",
        targetRect: dirtyRect,
        tool: "selection",
      }),
      rect: dirtyRect,
      source: "area-selection-paste",
      type: "pixel",
      undo: () => renderer.restoreRasterSnapshot(layerId, beforeSnapshot, {
        source: "history-undo-area-selection-paste",
      }),
      redo: () => renderer.restoreRasterSnapshot(layerId, afterSnapshot, {
        source: "history-redo-area-selection-paste",
      }),
      destroy: () => {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    });

    history.push(entry);
  }

  function pasteSelectionPixels() {
    const renderer = getRenderer();
    const clipboard = state.clipboard;

    if (!renderer || !Array.isArray(clipboard?.snapshots) || clipboard.snapshots.length === 0 || !clipboard.rect) {
      return false;
    }

    const pasteItems = clipboard.snapshots
      .map((item) => {
        const shiftedRect = {
          height: item.rect.height,
          width: item.rect.width,
          x: item.rect.x + PASTE_OFFSET_PX,
          y: item.rect.y + PASTE_OFFSET_PX,
        };
        const dirtyRect = intersectRects(shiftedRect, getDocumentRect());

        return dirtyRect
          ? {
              dirtyRect,
              shiftedRect,
              snapshot: item.snapshot,
            }
          : null;
      })
      .filter(Boolean);
    const dirtyRect = getBoundingRect(pasteItems.map((item) => item.dirtyRect));

    if (!dirtyRect || pasteItems.length === 0) {
      return false;
    }

    const layerState = resolvePasteLayer();
    const layerId = layerState.layerId;

    if (!layerId) {
      restoreLayerStateOnPasteFailure(layerState);
      return false;
    }

    const targets = renderer.ensureRasterTargetsForPaintRect?.(layerId, dirtyRect, {
      source: "area-selection-paste",
    }) || [];

    if (targets.length === 0) {
      restoreLayerStateOnPasteFailure(layerState);
      return false;
    }

    const tileHistory = renderer.beginRasterTileHistory?.(layerId, dirtyRect, {
      label: "area-selection-paste",
      source: "area-selection-paste",
    });
    const beforeSnapshot = tileHistory
      ? null
      : renderer.createRasterSnapshot?.(layerId, dirtyRect, "area-selection-paste-before");
    let didPaste = false;

    pasteItems.forEach((pasteItem) => {
      const sourceTarget = {
        cropped: true,
        framebuffer: pasteItem.snapshot.framebuffer,
        height: pasteItem.snapshot.rect?.height || pasteItem.shiftedRect.height,
        layerId: clipboard.layerId,
        texture: pasteItem.snapshot.texture,
        width: pasteItem.snapshot.rect?.width || pasteItem.shiftedRect.width,
        x: pasteItem.shiftedRect.x,
        y: pasteItem.shiftedRect.y,
      };

      targets.forEach((entry) => {
        const target = entry?.target || entry;
        const targetRect = entry?.patchRect ||
          entry?.tileRect ||
          renderer.getRasterTargetDocumentRect?.(target) ||
          dirtyRect;
        const patchRect = intersectRects(pasteItem.dirtyRect, targetRect);

        if (patchRect && renderer.copyRasterTargetRectIntoTarget?.(sourceTarget, patchRect, target)) {
          didPaste = true;
        }
      });
    });

    if (!didPaste) {
      renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer.deleteRasterSnapshot?.(beforeSnapshot);
      restoreLayerStateOnPasteFailure(layerState);
      return false;
    }

    pushPasteHistory(layerId, dirtyRect, tileHistory, beforeSnapshot, layerState);
    clear({ source: "area-selection-paste" });
    renderer.invalidatePreviewCache?.("area-selection-paste", { layerId, rect: dirtyRect });
    renderer.emitContentChange?.({ layerId, rect: dirtyRect, source: "area-selection-paste" });
    renderer.requestDraw?.();

    return true;
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
    const rects = getRects();
    const rect = getBoundingRect(rects);

    if (!renderer || !layerId || !rect || rects.length === 0) {
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
      rects.forEach((selectionRect) => {
        didClear = clearTargetRect(entry?.target || entry, selectionRect) || didClear;
      });
    });

    if (!didClear) {
      renderer.deleteRasterTileHistoryCapture?.(tileHistory);
      renderer.deleteRasterSnapshot?.(beforeSnapshot);
      return false;
    }

    pushDeleteHistory(layerId, rect, tileHistory, beforeSnapshot);
    renderer.invalidatePreviewCache?.("area-selection-delete", { layerId, rect });
    renderer.emitContentChange?.({ layerId, rect, source: "area-selection-delete" });
    renderer.requestDraw?.();

    return true;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      if (state.polygonLassoActive) {
        event.preventDefault();
        event.stopPropagation();
        cancelPolygonLasso();
        return;
      }

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

    const shortcutKey = String(event.key || "").toLowerCase();

    if (state.polygonLassoActive && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "Enter") {
        if (commitPolygonLasso()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete" || event.code === "Backspace" || event.code === "Delete") {
        if (removeLastPolygonLassoPoint()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    if (isAreaSelectionToolActive() && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (shortcutKey === "r" || event.key === "1") {
        setOperationMode("replace", { source: "area-selection-shortcut" });
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (shortcutKey === "a" || event.key === "2") {
        setOperationMode("add", { source: "area-selection-shortcut" });
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (shortcutKey === "s" || event.key === "3") {
        setOperationMode("subtract", { source: "area-selection-shortcut" });
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey === "c") {
      if (copySelectionPixels()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey === "v") {
      if (pasteSelectionPixels()) {
        event.preventDefault();
        event.stopPropagation();
      }
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
    const nextToolMode = String(event.detail?.toolMode || "").trim().toLowerCase();

    if (state.polygonLassoActive && nextToolMode !== POLYGON_LASSO_TOOL_MODE) {
      cancelPolygonLasso("area-selection-polygon-lasso-tool-change");
    }

    state.activeToolMode = nextToolMode;
  }

  function handleOverlayActivity(event = null) {
    if (!state.rect && !state.polygonLassoActive) {
      return;
    }

    if (event?.type === "pointermove" && !event.buttons) {
      return;
    }

    pauseOverlayAnimation();
    updateOverlay();
  }

  function handleOverlayCameraChange() {
    if (!state.rect && !state.polygonLassoActive) {
      return;
    }

    pauseOverlayAnimation();
    markOverlayScreenDirty();
    updateOverlay();
  }

  function handleOverlayResize() {
    if (!state.rect && !state.polygonLassoActive) {
      return;
    }

    markOverlayScreenDirty();
    updateOverlay();
  }

  function initAreaSelectionTool() {
    const canvas = document.querySelector(".editor-webgl-canvas");
    const pointerTarget = canvas?.closest?.(".editor-stage") || canvas;

    if (!canvas || !pointerTarget) {
      return;
    }

    state.canvas = canvas;
    state.pointerTarget = pointerTarget;
    state.activeToolMode = String(document.querySelector("[data-tool].active")?.dataset.toolMode || "").trim().toLowerCase();

    if (pointerTarget.dataset.areaSelectionReady !== "true") {
      pointerTarget.dataset.areaSelectionReady = "true";
      pointerTarget.addEventListener("pointerdown", handlePointerDown, true);
      pointerTarget.addEventListener("pointermove", handlePointerMove, true);
      pointerTarget.addEventListener("pointerup", (event) => finishPointer(event, false), true);
      pointerTarget.addEventListener("pointercancel", (event) => finishPointer(event, true), true);
      pointerTarget.addEventListener("pointerdown", handleOverlayActivity, true);
      pointerTarget.addEventListener("pointermove", handleOverlayActivity, true);
      pointerTarget.addEventListener("wheel", handleOverlayActivity, true);
      window.addEventListener("cbo:tool-change", handleToolChange);
      window.addEventListener("cbo:camera-change", handleOverlayCameraChange);
      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("resize", handleOverlayResize);
    }

    ensureOverlay();
  }

  namespace.areaSelection = {
    canSelectLayerAlpha,
    clear,
    copySelectionPixels,
    deleteSelectionPixels,
    getBounds,
    getColorRangeSampleColor,
    getColorRangeTolerance,
    getIntersectingRects,
    getOperationMode,
    getRegionSnapshot,
    getRect,
    getRects,
    hasSelection,
    intersectRect,
    isPointInside,
    pasteSelectionPixels,
    selectLayerAlpha,
    setRect,
    setColorRangeTolerance,
    setRegion: setRegionSnapshot,
    setOperationMode,
    setSelectionRects,
  };

  namespace.initAreaSelectionTool = initAreaSelectionTool;
})(window.CBO = window.CBO || {});
