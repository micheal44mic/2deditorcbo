window.CBO = window.CBO || {};

(function registerDocumentArtboardModel(namespace) {
  const DEFAULT_ARTBOARD_WIDTH = 1048;
  const DEFAULT_ARTBOARD_HEIGHT = 2048;
  const DEFAULT_ARTBOARD_GAP = 256;
  const MIN_ARTBOARD_GAP = 32;
  const DEFAULT_SECONDARY_ARTBOARD_COUNT = 0;
  const PRIMARY_ARTBOARD_ID = "active-document";

  function toPositiveInt(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
  }

  function toFiniteInt(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.round(number) : fallback;
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

  function cloneRect(rect) {
    if (!rect) {
      return null;
    }

    return {
      height: Math.max(1, Math.round(Number(rect.height) || 1)),
      width: Math.max(1, Math.round(Number(rect.width) || 1)),
      x: toFiniteInt(rect.x, 0),
      y: toFiniteInt(rect.y, 0),
    };
  }

  function getArtboardRect(artboard) {
    return artboard
      ? cloneRect({
          height: artboard.height,
          width: artboard.width,
          x: artboard.x,
          y: artboard.y,
        })
      : null;
  }

  function intersectRects(a, b) {
    if (!a || !b) {
      return null;
    }

    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);

    if (right <= x || bottom <= y) {
      return null;
    }

    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function offsetRect(rect, dx = 0, dy = 0) {
    return rect
      ? {
          height: rect.height,
          width: rect.width,
          x: rect.x + dx,
          y: rect.y + dy,
        }
      : null;
  }

  function expandRect(rect, amount = 0) {
    const safeAmount = Math.max(0, Number(amount) || 0);

    return rect
      ? {
          height: rect.height + safeAmount * 2,
          width: rect.width + safeAmount * 2,
          x: rect.x - safeAmount,
          y: rect.y - safeAmount,
        }
      : null;
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

  function getArtboardContentLayerIds(artboardId) {
    const layerModel = namespace.documentLayerModel;

    if (typeof layerModel?.getArtboardContentLayerIds === "function") {
      return layerModel.getArtboardContentLayerIds(artboardId);
    }

    return (layerModel?.flattenTopToBottom?.() || [])
      .filter((layer) =>
        layer?.id &&
        layer.artboardId === artboardId &&
        layer.type !== "background" &&
        layer.id !== "background"
      )
      .map((layer) => layer.id);
  }

  function doRectsOverlap(a, b) {
    return Boolean(
      a &&
      b &&
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function getRectOverlapArea(a, b) {
    if (!doRectsOverlap(a, b)) {
      return 0;
    }

    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

    return Math.max(0, width) * Math.max(0, height);
  }

  function getTotalOverlapArea(rect, blockers = []) {
    return blockers.reduce(
      (total, blocker) => total + getRectOverlapArea(rect, blocker),
      0,
    );
  }

  function doesRectOverlapAny(rect, blockers = []) {
    return blockers.some((blocker) => doRectsOverlap(rect, blocker));
  }

  function getArtboardCollisionRects(artboardId) {
    const normalizedArtboardId = String(artboardId || "").trim();

    return (namespace.documentArtboardModel?.artboards || [])
      .filter((artboard) => artboard?.id && artboard.id !== normalizedArtboardId)
      .map((artboard) => getArtboardRect(artboard))
      .map((rect) => expandRect(rect, MIN_ARTBOARD_GAP))
      .filter(Boolean);
  }

  function constrainRectMove(startRect, dx, dy, blockers = []) {
    const safeDx = Number.isFinite(Number(dx)) ? Number(dx) : 0;
    const safeDy = Number.isFinite(Number(dy)) ? Number(dy) : 0;

    if (!startRect || blockers.length === 0 || (safeDx === 0 && safeDy === 0)) {
      return { blocked: false, dx: safeDx, dy: safeDy };
    }

    const targetRect = offsetRect(startRect, safeDx, safeDy);

    if (!doesRectOverlapAny(targetRect, blockers)) {
      return { blocked: false, dx: safeDx, dy: safeDy };
    }

    const startOverlapArea = getTotalOverlapArea(startRect, blockers);

    if (startOverlapArea > 0) {
      const targetOverlapArea = getTotalOverlapArea(targetRect, blockers);

      if (targetOverlapArea < startOverlapArea) {
        return { blocked: true, dx: safeDx, dy: safeDy };
      }

      return { blocked: true, dx: 0, dy: 0 };
    }

    let low = 0;
    let high = 1;

    for (let index = 0; index < 28; index += 1) {
      const mid = (low + high) * 0.5;
      const testRect = offsetRect(startRect, safeDx * mid, safeDy * mid);

      if (doesRectOverlapAny(testRect, blockers)) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return {
      blocked: true,
      dx: safeDx * low,
      dy: safeDy * low,
    };
  }

  function safeIntegerDelta(delta, blocked = false) {
    const value = Number(delta);

    if (!Number.isFinite(value)) {
      return 0;
    }

    if (!blocked) {
      return Math.round(value);
    }

    return value < 0 ? Math.ceil(value - 0.000001) : Math.floor(value + 0.000001);
  }

  function constrainArtboardMove(artboardId, dx, dy, options = {}) {
    const normalizedArtboardId = String(artboardId || "").trim();
    const artboard = namespace.documentArtboardModel?.getArtboardById?.(normalizedArtboardId);
    const startRect = cloneRect(options.startRect) || getArtboardRect(artboard);
    const blockers = getArtboardCollisionRects(normalizedArtboardId);

    return {
      artboardId: normalizedArtboardId,
      ...constrainRectMove(startRect, dx, dy, blockers),
    };
  }

  function getRasterMoveDirtyRects(layerIds, dx, dy) {
    const renderer = namespace.documentRenderer;

    if (!renderer?.rasterTargetsByLayerId || typeof renderer.getRasterTargetDocumentRect !== "function") {
      return [];
    }

    return layerIds.flatMap((layerId) => {
      const rect = renderer.getRasterTargetDocumentRect(renderer.rasterTargetsByLayerId.get(layerId));
      const nextRect = offsetRect(rect, dx, dy);

      return [rect, nextRect].filter(Boolean);
    });
  }

  function compactRects(rects = []) {
    return rects
      .filter(Boolean)
      .map((rect) => cloneRect(rect));
  }

  class DocumentArtboardModel extends EventTarget {
    constructor(options = {}) {
      super();

      this.artboards = [];
      this.selectedArtboardId = "";
      this.sequence = 1;
      this.reset(options);
    }

    createPrimaryArtboard(options = {}) {
      return {
        height: toPositiveInt(options.height ?? options.documentHeight, 1),
        id: PRIMARY_ARTBOARD_ID,
        isPrimary: true,
        name: String(options.name || "Artboard 1"),
        type: "active",
        width: toPositiveInt(options.width ?? options.documentWidth, 1),
        x: 0,
        y: 0,
      };
    }

    getArtboardBounds() {
      return this.artboards.reduce((bounds, artboard) => {
        const rect = getArtboardRect(artboard);

        if (!rect) {
          return bounds;
        }

        const right = rect.x + rect.width;
        const bottom = rect.y + rect.height;

        if (!bounds) {
          return {
            bottom,
            left: rect.x,
            right,
            top: rect.y,
          };
        }

        return {
          bottom: Math.max(bounds.bottom, bottom),
          left: Math.min(bounds.left, rect.x),
          right: Math.max(bounds.right, right),
          top: Math.min(bounds.top, rect.y),
        };
      }, null);
    }

    resolveNewArtboardSize(options = {}) {
      const sourceArtboardId = String(options.sourceArtboardId || this.selectedArtboardId || "").trim();
      const sourceArtboard = this.getArtboardById(sourceArtboardId) || this.artboards[0] || null;

      return {
        height: toPositiveInt(options.height, toPositiveInt(sourceArtboard?.height, DEFAULT_ARTBOARD_HEIGHT)),
        width: toPositiveInt(options.width, toPositiveInt(sourceArtboard?.width, DEFAULT_ARTBOARD_WIDTH)),
      };
    }

    getNewArtboardAnchor(options = {}) {
      const sourceArtboardId = String(
        options.anchorArtboardId ||
        options.sourceArtboardId ||
        this.selectedArtboardId ||
        "",
      ).trim();

      return (
        (sourceArtboardId ? this.getArtboardById(sourceArtboardId) : null) ||
        this.artboards[this.artboards.length - 1] ||
        this.artboards[0] ||
        null
      );
    }

    findFreeArtboardPlacement(size, options = {}) {
      const width = toPositiveInt(size?.width, DEFAULT_ARTBOARD_WIDTH);
      const height = toPositiveInt(size?.height, DEFAULT_ARTBOARD_HEIGHT);
      const blockers = this.artboards
        .map((artboard) => getArtboardRect(artboard))
        .map((rect) => expandRect(rect, MIN_ARTBOARD_GAP))
        .filter(Boolean);
      const canUseRect = (rect) => (
        options.allowOverlap === true ||
        !doesRectOverlapAny(rect, blockers)
      );
      const hasExplicitX = Number.isFinite(Number(options.x));
      const hasExplicitY = Number.isFinite(Number(options.y));

      if (hasExplicitX && hasExplicitY) {
        const explicitRect = {
          height,
          width,
          x: toFiniteInt(options.x, 0),
          y: toFiniteInt(options.y, 0),
        };

        if (canUseRect(explicitRect)) {
          return {
            x: explicitRect.x,
            y: explicitRect.y,
          };
        }
      }

      const anchorRect = getArtboardRect(this.getNewArtboardAnchor(options));
      const bounds = this.getArtboardBounds();
      const candidates = [];
      const seen = new Set();
      const pushCandidate = (x, y) => {
        const rect = {
          height,
          width,
          x: toFiniteInt(x, 0),
          y: toFiniteInt(y, 0),
        };
        const key = `${rect.x}:${rect.y}`;

        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(rect);
        }
      };

      if (anchorRect) {
        pushCandidate(anchorRect.x + anchorRect.width + DEFAULT_ARTBOARD_GAP, anchorRect.y);
        pushCandidate(anchorRect.x, anchorRect.y + anchorRect.height + DEFAULT_ARTBOARD_GAP);
      }

      if (bounds) {
        pushCandidate(bounds.right + DEFAULT_ARTBOARD_GAP, bounds.top);
        pushCandidate(bounds.left, bounds.bottom + DEFAULT_ARTBOARD_GAP);
      }

      this.artboards
        .map((artboard) => getArtboardRect(artboard))
        .filter(Boolean)
        .forEach((rect) => {
          pushCandidate(rect.x + rect.width + DEFAULT_ARTBOARD_GAP, rect.y);
          pushCandidate(rect.x, rect.y + rect.height + DEFAULT_ARTBOARD_GAP);
        });

      const freeCandidate = candidates.find(canUseRect);

      if (freeCandidate) {
        return {
          x: freeCandidate.x,
          y: freeCandidate.y,
        };
      }

      return bounds
        ? {
            x: toFiniteInt(bounds.right + DEFAULT_ARTBOARD_GAP, 0),
            y: toFiniteInt(bounds.top, 0),
          }
        : { x: 0, y: 0 };
    }

    createSecondaryArtboard(options = {}) {
      const index = Math.max(2, this.artboards.length + 1);
      const id = String(options.id || `artboard-${Date.now().toString(36)}-${this.sequence++}`);
      const size = this.resolveNewArtboardSize(options);
      const position = this.findFreeArtboardPlacement(size, options);

      return {
        height: size.height,
        id,
        isPrimary: false,
        name: String(options.name || `Artboard ${index}`),
        type: "artboard",
        width: size.width,
        x: position.x,
        y: position.y,
      };
    }

    normalizeArtboards(records = [], options = {}) {
      const source = Array.isArray(records) ? records : [];
      const primarySource =
        source.find((artboard) => artboard?.isPrimary === true || artboard?.id === PRIMARY_ARTBOARD_ID) ||
        null;
      const primary = this.createPrimaryArtboard({
        ...primarySource,
        documentHeight: options.documentHeight,
        documentWidth: options.documentWidth,
        height: primarySource?.height ?? options.documentHeight,
        width: primarySource?.width ?? options.documentWidth,
      });
      const usedIds = new Set([PRIMARY_ARTBOARD_ID]);
      const secondary = source
        .filter((artboard) => artboard && artboard !== primarySource)
        .map((artboard, index) => {
          const fallbackId = `artboard-${Date.now().toString(36)}-${this.sequence++}`;
          let id = String(artboard.id || fallbackId).trim() || fallbackId;

          if (id === PRIMARY_ARTBOARD_ID || usedIds.has(id)) {
            id = `${id || "artboard"}-${this.sequence++}`;
          }

          usedIds.add(id);

          return {
            height: toPositiveInt(artboard.height, DEFAULT_ARTBOARD_HEIGHT),
            id,
            isPrimary: false,
            name: String(artboard.name || `Artboard ${index + 2}`),
            type: "artboard",
            width: toPositiveInt(artboard.width, DEFAULT_ARTBOARD_WIDTH),
            x: toFiniteInt(artboard.x, primary.x + primary.width + DEFAULT_ARTBOARD_GAP * (index + 1)),
            y: toFiniteInt(artboard.y, 0),
          };
        });

      return [primary, ...secondary];
    }

    getArtboards() {
      return this.artboards.map(cloneArtboard);
    }

    getArtboardById(artboardId) {
      const normalizedId = String(artboardId || "").trim();

      return this.artboards.find((artboard) => artboard.id === normalizedId) || null;
    }

    getArtboardAtPoint(point) {
      const x = Number(point?.docX ?? point?.x);
      const y = Number(point?.docY ?? point?.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return [...this.artboards].reverse().find((artboard) => (
        x >= artboard.x &&
        y >= artboard.y &&
        x <= artboard.x + artboard.width &&
        y <= artboard.y + artboard.height
      )) || null;
    }

    getSelectedArtboardId() {
      return this.selectedArtboardId || "";
    }

    renameSecondaryArtboards() {
      this.artboards.forEach((artboard, index) => {
        if (index > 0) {
          artboard.name = `Artboard ${index + 1}`;
        }
      });
    }

    reset(options = {}) {
      const records = Array.isArray(options.artboards) ? options.artboards : null;

      this.artboards = records
        ? this.normalizeArtboards(records, options)
        : [this.createPrimaryArtboard(options)];
      this.ensureDefaultArtboards(options.defaultSecondaryCount ?? options.defaultArtboardCount ?? 0, {
        emit: false,
      });

      if (!this.getArtboardById(this.selectedArtboardId)) {
        this.selectedArtboardId = "";
      }

      this.emitChange(options.source || "document-artboard-reset");
      return this.getArtboards();
    }

    ensureDefaultArtboards(count = DEFAULT_SECONDARY_ARTBOARD_COUNT, options = {}) {
      const targetCount = Math.max(0, Math.round(Number(count) || 0));

      while (this.artboards.length - 1 < targetCount) {
        this.artboards.push(this.createSecondaryArtboard());
      }

      if (options.emit !== false) {
        this.emitChange(options.source || "document-artboard-defaults");
      }

      return this.getArtboards();
    }

    createArtboard(options = {}) {
      const artboard = this.createSecondaryArtboard(options);

      this.artboards.push(artboard);
      this.emitChange(options.source || "document-artboard-create");

      return cloneArtboard(artboard);
    }

    moveArtboard(artboardId, x, y, options = {}) {
      const artboard = this.getArtboardById(artboardId);

      if (!artboard || artboard.isPrimary) {
        return null;
      }

      const requestedX = toFiniteInt(x, artboard.x);
      const requestedY = toFiniteInt(y, artboard.y);
      const requestedDx = requestedX - artboard.x;
      const requestedDy = requestedY - artboard.y;
      const constrained = options.allowOverlap === true
        ? { blocked: false, dx: requestedDx, dy: requestedDy }
        : constrainArtboardMove(artboard.id, requestedDx, requestedDy, {
            startRect: getArtboardRect(artboard),
          });

      artboard.x += safeIntegerDelta(constrained.dx, constrained.blocked);
      artboard.y += safeIntegerDelta(constrained.dy, constrained.blocked);

      if (options.emit !== false) {
        this.emitChange(options.source || "document-artboard-move");
      }

      return cloneArtboard(artboard);
    }

    deleteArtboard(artboardId, options = {}) {
      const artboard = this.getArtboardById(artboardId);

      if (!artboard || artboard.isPrimary) {
        return false;
      }

      this.artboards = this.artboards.filter((entry) => entry.id !== artboard.id);
      this.renameSecondaryArtboards();

      if (this.selectedArtboardId === artboard.id) {
        this.selectedArtboardId = "";
        this.emitSelection(null, options.source || "document-artboard-delete");
      }

      this.emitChange(options.source || "document-artboard-delete");
      return true;
    }

    selectArtboard(artboardId, options = {}) {
      const artboard = this.getArtboardById(artboardId);

      if (!artboard) {
        return null;
      }

      this.selectedArtboardId = artboard.id;

      if (options.emit !== false) {
        this.emitSelection(artboard, options.source || "document-artboard-selection");
      }

      return cloneArtboard(artboard);
    }

    clearSelection(options = {}) {
      if (!this.selectedArtboardId) {
        return false;
      }

      this.selectedArtboardId = "";

      if (options.emit !== false) {
        this.emitSelection(null, options.source || "document-artboard-clear-selection");
      }

      return true;
    }

    emitChange(source = "document-artboards") {
      const detail = {
        artboards: this.getArtboards(),
        selectedArtboardId: this.selectedArtboardId || null,
        source,
      };

      this.dispatchEvent(new CustomEvent("change", { detail }));
      window.dispatchEvent(new CustomEvent("cbo:document-artboards-change", { detail }));
      window.dispatchEvent(new CustomEvent("cbo:artboard-preview-change", { detail }));
    }

    emitSelection(artboard, source = "document-artboard-selection") {
      const detail = {
        artboard: artboard ? cloneArtboard(artboard) : null,
        artboardId: artboard?.id || null,
        source,
      };

      this.dispatchEvent(new CustomEvent("selectionchange", { detail }));
      window.dispatchEvent(new CustomEvent("cbo:document-artboard-selection-change", { detail }));
      window.dispatchEvent(new CustomEvent("cbo:artboard-selection-change", { detail }));
    }
  }

  namespace.DocumentArtboardModel = DocumentArtboardModel;
  namespace.documentArtboardModel = namespace.documentArtboardModel || new DocumentArtboardModel();

  namespace.getDocumentArtboards = function getDocumentArtboards() {
    return namespace.documentArtboardModel.getArtboards();
  };

  namespace.getDocumentArtboardById = function getDocumentArtboardById(artboardId) {
    const artboard = namespace.documentArtboardModel.getArtboardById(artboardId);

    return artboard ? cloneArtboard(artboard) : null;
  };

  namespace.getDocumentArtboardRect = function getDocumentArtboardRect(artboardId) {
    return getArtboardRect(namespace.documentArtboardModel.getArtboardById(artboardId));
  };

  namespace.getDocumentArtboardAtPoint = function getDocumentArtboardAtPoint(point) {
    const artboard = namespace.documentArtboardModel.getArtboardAtPoint(point);

    return artboard ? cloneArtboard(artboard) : null;
  };

  namespace.getActiveDocumentArtboardId = function getActiveDocumentArtboardId(options = {}) {
    const explicitArtboardId = String(options.artboardId || "").trim();

    if (explicitArtboardId) {
      return explicitArtboardId;
    }

    const selectedArtboardId = namespace.documentArtboardModel.getSelectedArtboardId();

    if (selectedArtboardId) {
      return selectedArtboardId;
    }

    const layerModel = namespace.documentLayerModel;
    const layerId = String(options.layerId || layerModel?.activeLayerId || "").trim();
    const layerArtboardId = layerId
      ? layerModel?.findEntryArtboardId?.(layerId)
      : null;

    return String(layerArtboardId || PRIMARY_ARTBOARD_ID);
  };

  namespace.getActiveDocumentArtboard = function getActiveDocumentArtboard(options = {}) {
    const artboard = namespace.documentArtboardModel.getArtboardById(
      namespace.getActiveDocumentArtboardId(options),
    );

    return artboard ? cloneArtboard(artboard) : null;
  };

  namespace.getActiveDocumentArtboardRect = function getActiveDocumentArtboardRect(options = {}) {
    return getArtboardRect(namespace.documentArtboardModel.getArtboardById(
      namespace.getActiveDocumentArtboardId(options),
    ));
  };

  namespace.getDocumentArtboardUnionRect = function getDocumentArtboardUnionRect() {
    const artboards = namespace.documentArtboardModel.getArtboards();

    if (!artboards.length) {
      return null;
    }

    const bounds = artboards.reduce((rect, artboard) => {
      const x = Number(artboard.x) || 0;
      const y = Number(artboard.y) || 0;
      const right = x + Math.max(1, Math.round(Number(artboard.width) || 1));
      const bottom = y + Math.max(1, Math.round(Number(artboard.height) || 1));

      if (!rect) {
        return {
          bottom,
          left: x,
          right,
          top: y,
        };
      }

      return {
        bottom: Math.max(rect.bottom, bottom),
        left: Math.min(rect.left, x),
        right: Math.max(rect.right, right),
        top: Math.min(rect.top, y),
      };
    }, null);

    return bounds
      ? {
          height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
          width: Math.max(1, Math.round(bounds.right - bounds.left)),
          x: Math.round(bounds.left),
          y: Math.round(bounds.top),
        }
      : null;
  };

  namespace.intersectActiveDocumentArtboardRect = function intersectActiveDocumentArtboardRect(rect, options = {}) {
    return intersectRects(cloneRect(rect), namespace.getActiveDocumentArtboardRect(options));
  };

  namespace.getActiveDocumentArtboardCoverageRects = function getActiveDocumentArtboardCoverageRects(rect, options = {}) {
    const artboardRect = namespace.getActiveDocumentArtboardRect(options);

    if (!artboardRect) {
      return null;
    }

    const clipped = intersectRects(cloneRect(rect), artboardRect);

    return clipped ? [clipped] : [];
  };

  namespace.isPointInsideActiveDocumentArtboard = function isPointInsideActiveDocumentArtboard(point, options = {}) {
    const rect = namespace.getActiveDocumentArtboardRect(options);
    const x = Number(point?.docX ?? point?.x);
    const y = Number(point?.docY ?? point?.y);

    return Boolean(
      rect &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= rect.x &&
      y >= rect.y &&
      x <= rect.x + rect.width &&
      y <= rect.y + rect.height
    );
  };

  namespace.resetDocumentArtboards = function resetDocumentArtboards(options = {}) {
    return namespace.documentArtboardModel.reset(options);
  };

  namespace.ensureDefaultDocumentArtboards = function ensureDefaultDocumentArtboards(count = DEFAULT_SECONDARY_ARTBOARD_COUNT, options = {}) {
    return namespace.documentArtboardModel.ensureDefaultArtboards(count, options);
  };

  namespace.createDocumentArtboard = function createDocumentArtboard(options = {}) {
    return namespace.documentArtboardModel.createArtboard(options);
  };

  namespace.moveDocumentArtboard = function moveDocumentArtboard(artboardId, x, y, options = {}) {
    return namespace.documentArtboardModel.moveArtboard(artboardId, x, y, options);
  };

  namespace.getDocumentArtboardMinimumGap = function getDocumentArtboardMinimumGap() {
    return MIN_ARTBOARD_GAP;
  };

  namespace.constrainDocumentArtboardMove = function constrainDocumentArtboardMove(
    artboardId,
    dx,
    dy,
    options = {},
  ) {
    return constrainArtboardMove(artboardId, dx, dy, options);
  };

  namespace.wouldDocumentArtboardOverlap = function wouldDocumentArtboardOverlap(
    artboardId,
    dx,
    dy,
    options = {},
  ) {
    const constrained = constrainArtboardMove(artboardId, dx, dy, options);

    return constrained.blocked === true;
  };

  namespace.applyDocumentArtboardMoveWithContents = function applyDocumentArtboardMoveWithContents(
    artboardId,
    dx,
    dy,
    options = {},
  ) {
    const normalizedArtboardId = String(artboardId || "").trim();
    const requestedDeltaX = Number.isFinite(Number(dx)) ? Math.round(Number(dx)) : 0;
    const requestedDeltaY = Number.isFinite(Number(dy)) ? Math.round(Number(dy)) : 0;
    const artboard = namespace.documentArtboardModel.getArtboardById(normalizedArtboardId);

    if (!artboard || artboard.isPrimary === true || (requestedDeltaX === 0 && requestedDeltaY === 0)) {
      return false;
    }

    const source = options.source || "document-artboard-move-with-contents";
    const layerIds = Array.isArray(options.layerIds)
      ? options.layerIds.map((id) => String(id || "").trim()).filter(Boolean)
      : getArtboardContentLayerIds(normalizedArtboardId);
    const oldArtboardRect = getArtboardRect(artboard);
    const constrained = options.allowOverlap === true
      ? { blocked: false, dx: requestedDeltaX, dy: requestedDeltaY }
      : constrainArtboardMove(normalizedArtboardId, requestedDeltaX, requestedDeltaY, {
          startRect: oldArtboardRect,
        });
    const deltaX = safeIntegerDelta(constrained.dx, constrained.blocked);
    const deltaY = safeIntegerDelta(constrained.dy, constrained.blocked);

    if (deltaX === 0 && deltaY === 0) {
      return false;
    }

    const nextX = artboard.x + deltaX;
    const nextY = artboard.y + deltaY;
    const newArtboardRect = offsetRect(oldArtboardRect, deltaX, deltaY);
    const rasterDirtyRects = getRasterMoveDirtyRects(layerIds, deltaX, deltaY);
    const didMoveArtboard = namespace.documentArtboardModel.moveArtboard(
      normalizedArtboardId,
      nextX,
      nextY,
      {
        allowOverlap: true,
        emit: false,
        source,
      },
    );

    if (!didMoveArtboard) {
      return false;
    }

    const didMoveLayers = namespace.documentLayerModel?.translateLayersByIds?.(
      layerIds,
      deltaX,
      deltaY,
      {
        emit: false,
        history: false,
        source,
      },
    ) === true;
    const didMoveRasters = namespace.documentRenderer?.translateRasterTargetsByLayerIds?.(
      layerIds,
      deltaX,
      deltaY,
      {
        emit: false,
        history: false,
        source,
      },
    ) === true;
    const dirtyRects = compactRects([
      oldArtboardRect,
      newArtboardRect,
      ...rasterDirtyRects,
    ]);

    namespace.documentArtboardModel.emitChange(source);

    if (didMoveLayers) {
      namespace.documentLayerModel?.emitChange?.(source);
    }

    if (didMoveRasters || dirtyRects.length > 0) {
      namespace.documentRenderer?.commitVisualDirtyChange?.({
        maxDirtyRects: 96,
        preserveDirtyRects: true,
        rects: dirtyRects,
        source,
      });
    }

    namespace.documentRenderer?.requestDraw?.();

    return {
      artboard: namespace.getDocumentArtboardById(normalizedArtboardId),
      dx: deltaX,
      dy: deltaY,
      layerIds,
    };
  };

  namespace.commitArtboardMoveWithContents = function commitArtboardMoveWithContents(
    artboardId,
    dx,
    dy,
    options = {},
  ) {
    const normalizedArtboardId = String(artboardId || "").trim();
    const requestedDeltaX = Number.isFinite(Number(dx)) ? Math.round(Number(dx)) : 0;
    const requestedDeltaY = Number.isFinite(Number(dy)) ? Math.round(Number(dy)) : 0;
    const source = options.source || "artboard-move-with-contents";
    const history = namespace.documentHistory;
    const layerModel = namespace.documentLayerModel;
    const layerIds = Array.isArray(options.layerIds)
      ? options.layerIds.map((id) => String(id || "").trim()).filter(Boolean)
      : getArtboardContentLayerIds(normalizedArtboardId);

    if (!normalizedArtboardId || (requestedDeltaX === 0 && requestedDeltaY === 0)) {
      return false;
    }

    history?.flushLayerState?.(layerModel);

    const canRecordHistory = history?.canRecord?.(options) === true;
    const applyMove = (moveDx, moveDy, moveSource, moveOptions = {}) =>
      namespace.applyDocumentArtboardMoveWithContents(normalizedArtboardId, moveDx, moveDy, {
        ...options,
        history: false,
        layerIds,
        ...moveOptions,
        source: moveSource,
      });
    const result = history?.runWithoutRecording
      ? history.runWithoutRecording(() => applyMove(requestedDeltaX, requestedDeltaY, source))
      : applyMove(requestedDeltaX, requestedDeltaY, source);

    if (!result) {
      return false;
    }

    if (canRecordHistory && history?.push) {
      const entryLayerIds = cloneValue(layerIds);
      const entryDeltaX = result.dx;
      const entryDeltaY = result.dy;

      history.push({
        type: "artboard-move-with-contents",
        historyGroup: options.historyGroup || `artboard-move-${normalizedArtboardId}`,
        source,
        undo() {
          return applyMove(
            -entryDeltaX,
            -entryDeltaY,
            "history-undo-artboard-move-with-contents",
            { allowOverlap: true },
          ) !== false;
        },
        redo() {
          return applyMove(
            entryDeltaX,
            entryDeltaY,
            "history-redo-artboard-move-with-contents",
            { allowOverlap: true },
          ) !== false;
        },
        mergeWith() {
          return false;
        },
        destroy() {},
        layerIds: entryLayerIds,
      }, {
        historyGroup: options.historyGroup || `artboard-move-${normalizedArtboardId}`,
        source,
      });
    }

    return result;
  };

  namespace.deleteDocumentArtboard = function deleteDocumentArtboard(artboardId, options = {}) {
    return namespace.documentArtboardModel.deleteArtboard(artboardId, options);
  };

  namespace.selectDocumentArtboard = function selectDocumentArtboard(artboardId, options = {}) {
    return namespace.documentArtboardModel.selectArtboard(artboardId, options);
  };

  namespace.selectDocumentArtboardAtPoint = function selectDocumentArtboardAtPoint(point, options = {}) {
    const artboard = namespace.documentArtboardModel.getArtboardAtPoint(point);

    return artboard
      ? namespace.documentArtboardModel.selectArtboard(artboard.id, options)
      : null;
  };

  namespace.clearDocumentArtboardSelection = function clearDocumentArtboardSelection(options = {}) {
    return namespace.documentArtboardModel.clearSelection(options);
  };

  namespace.getSelectedDocumentArtboardId = function getSelectedDocumentArtboardId() {
    return namespace.documentArtboardModel.getSelectedArtboardId();
  };
})(window.CBO = window.CBO || {});
