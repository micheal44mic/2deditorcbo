window.CBO = window.CBO || {};

(function registerDocumentArtboardModel(namespace) {
  const DEFAULT_ARTBOARD_WIDTH = 1048;
  const DEFAULT_ARTBOARD_HEIGHT = 2048;
  const DEFAULT_ARTBOARD_GAP = 256;
  const DEFAULT_SECONDARY_ARTBOARD_COUNT = 2;
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

    createSecondaryArtboard(options = {}) {
      const previous = this.artboards[this.artboards.length - 1] || this.createPrimaryArtboard(options);
      const index = Math.max(2, this.artboards.length + 1);
      const id = String(options.id || `artboard-${Date.now().toString(36)}-${this.sequence++}`);

      return {
        height: toPositiveInt(options.height, DEFAULT_ARTBOARD_HEIGHT),
        id,
        isPrimary: false,
        name: String(options.name || `Artboard ${index}`),
        type: "artboard",
        width: toPositiveInt(options.width, DEFAULT_ARTBOARD_WIDTH),
        x: toFiniteInt(options.x, previous.x + previous.width + DEFAULT_ARTBOARD_GAP),
        y: toFiniteInt(options.y, 0),
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

      artboard.x = toFiniteInt(x, artboard.x);
      artboard.y = toFiniteInt(y, artboard.y);

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

  namespace.deleteDocumentArtboard = function deleteDocumentArtboard(artboardId, options = {}) {
    return namespace.documentArtboardModel.deleteArtboard(artboardId, options);
  };

  namespace.selectDocumentArtboard = function selectDocumentArtboard(artboardId, options = {}) {
    return namespace.documentArtboardModel.selectArtboard(artboardId, options);
  };

  namespace.clearDocumentArtboardSelection = function clearDocumentArtboardSelection(options = {}) {
    return namespace.documentArtboardModel.clearSelection(options);
  };

  namespace.getSelectedDocumentArtboardId = function getSelectedDocumentArtboardId() {
    return namespace.documentArtboardModel.getSelectedArtboardId();
  };
})(window.CBO = window.CBO || {});
