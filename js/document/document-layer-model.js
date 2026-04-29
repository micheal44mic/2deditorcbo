(function registerDocumentLayerModel(namespace) {
  const BACKGROUND_LAYER_ID = "background";

  class DocumentLayerModel extends EventTarget {
    constructor(options = {}) {
      super();

      this.sequence = 0;
      this.entries = Array.isArray(options.entries)
        ? this.ensureSystemLayers(this.normalizeEntries(options.entries))
        : this.createDefaultEntries();
      this.activeLayerId = this.resolveActiveLayerId(options.activeLayerId);
    }

    createId(type = "layer") {
      this.sequence += 1;

      return `${type}-${Date.now().toString(36)}-${this.sequence.toString(36)}`;
    }

    createBaseLayer(options = {}) {
      const type = options.type || "layer";

      return {
        id: options.id || this.createId(type),
        type,
        name: options.name || this.getFallbackName(type),
        visible: options.visible !== false,
        locked: options.locked === true,
        opacity: Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1,
      };
    }

    createLayer(options = {}) {
      const type = options.type || "layer";

      if (type === "group") {
        return this.createGroup(options);
      }

      return this.createBaseLayer(options);
    }

    createGroup(options = {}) {
      return {
        ...this.createBaseLayer({
          ...options,
          type: "group",
          name: options.name || "Group",
        }),
        children: this.normalizeEntries(options.children || []),
      };
    }

    getFallbackName(type) {
      if (type === "paint") {
        return "Paint";
      }

      if (type === "background") {
        return "Background";
      }

      if (type === "image") {
        return "Image";
      }

      if (type === "svg" || type === "vector") {
        return "SVG";
      }

      return "Layer";
    }

    createDefaultEntries() {
      return [
        this.createLayer({ id: "paint-main", name: "Paint", type: "paint" }),
        this.createLayer({ id: BACKGROUND_LAYER_ID, name: "Background", type: "background", locked: true }),
      ];
    }

    normalizeEntries(entries = []) {
      return entries
        .filter(Boolean)
        .map((entry) => {
          if (entry.type === "group") {
            return this.createGroup({
              id: entry.id,
              name: entry.name,
              visible: entry.visible,
              locked: entry.locked,
              opacity: entry.opacity,
              children: entry.children,
            });
          }

          return this.createLayer(entry);
        });
    }

    ensureSystemLayers(entries = []) {
      let backgroundEntry = null;

      const stripBackground = (sourceEntries) =>
        sourceEntries
          .map((entry) => {
            if (entry.type === "background" || entry.id === BACKGROUND_LAYER_ID) {
              backgroundEntry = entry;
              return null;
            }

            if (entry.type === "group") {
              return {
                ...entry,
                children: stripBackground(entry.children || []),
              };
            }

            return entry;
          })
          .filter(Boolean);

      return [
        ...stripBackground(entries),
        this.createLayer({
          ...backgroundEntry,
          id: BACKGROUND_LAYER_ID,
          name: "Background",
          type: "background",
          locked: true,
        }),
      ];
    }

    getNextPaintLayerName() {
      const paintLayerCount = this.flattenTopToBottom()
        .filter((entry) => entry.type === "paint").length;

      return paintLayerCount === 0 ? "Paint" : `Paint ${paintLayerCount + 1}`;
    }

    insertEntryAbove(targetId, entry, entries = this.entries) {
      if (!targetId || !entry) {
        return false;
      }

      for (let index = 0; index < entries.length; index += 1) {
        const currentEntry = entries[index];

        if (currentEntry.id === targetId) {
          entries.splice(index, 0, entry);
          return true;
        }

        if (currentEntry.type === "group" && this.insertEntryAbove(targetId, entry, currentEntry.children || [])) {
          return true;
        }
      }

      return false;
    }

    insertAboveBottomSystemLayer(entry) {
      const backgroundIndex = this.entries.findIndex((layer) => layer.id === BACKGROUND_LAYER_ID);
      const insertIndex = backgroundIndex >= 0 ? backgroundIndex : this.entries.length;

      this.entries.splice(insertIndex, 0, entry);
    }

    ensureActivePaintLayer(options = {}) {
      const activeEntry = this.findEntryById(this.activeLayerId);

      if (activeEntry?.type === "paint") {
        return this.cloneEntry(activeEntry);
      }

      const paintLayer = this.createLayer({
        name: this.getNextPaintLayerName(),
        type: "paint",
      });
      const inserted = activeEntry
        ? this.insertEntryAbove(activeEntry.id, paintLayer)
        : false;

      if (!inserted) {
        this.insertAboveBottomSystemLayer(paintLayer);
      }

      this.entries = this.ensureSystemLayers(this.entries);
      this.activeLayerId = paintLayer.id;
      this.emitChange(options.source || "ensure-paint-layer");

      return this.cloneEntry(paintLayer);
    }

    cloneEntry(entry) {
      const clone = {};

      Object.entries(entry || {}).forEach(([key, value]) => {
        if (key === "children") {
          return;
        }

        clone[key] = this.cloneValue(value);
      });

      if (entry.children) {
        clone.children = entry.children.map((child) => this.cloneEntry(child));
      }

      return clone;
    }

    cloneValue(value) {
      if (Array.isArray(value)) {
        return value.map((item) => this.cloneValue(item));
      }

      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, this.cloneValue(item)]),
        );
      }

      return value;
    }

    getEntries() {
      return this.entries.map((entry) => this.cloneEntry(entry));
    }

    setEntries(entries, options = {}) {
      this.entries = this.ensureSystemLayers(this.normalizeEntries(entries));

      if (!this.canActivateEntry(this.findEntryById(this.activeLayerId))) {
        this.activeLayerId = this.findFirstLayer(this.entries)?.id || null;
      }

      this.emitChange(options.source || "set-entries");
    }

    setActiveLayer(id, options = {}) {
      const entry = this.findEntryById(id);

      this.activeLayerId = this.canActivateEntry(entry) ? entry.id : null;
      this.emitChange(options.source || "active-layer");
    }

    updateLayer(id, patch, options = {}) {
      const entry = this.findEntryById(id);

      if (!entry || entry.type === "group") {
        return false;
      }

      const nextPatch = typeof patch === "function" ? patch(this.cloneEntry(entry)) : patch;

      if (!nextPatch || typeof nextPatch !== "object") {
        return false;
      }

      Object.assign(entry, this.cloneValue(nextPatch));
      entry.opacity = Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1;

      this.emitChange(options.source || "update-layer");

      return true;
    }

    canActivateEntry(entry) {
      return Boolean(entry && entry.type !== "group" && entry.locked !== true);
    }

    resolveActiveLayerId(id) {
      const entry = this.findEntryById(id);

      return this.canActivateEntry(entry) ? entry.id : this.findFirstLayer(this.entries)?.id || null;
    }

    findFirstLayer(entries = this.entries) {
      for (const entry of entries) {
        if (this.canActivateEntry(entry)) {
          return entry;
        }

        const childLayer = this.findFirstLayer(entry.children || []);

        if (childLayer) {
          return childLayer;
        }
      }

      return null;
    }

    findEntryById(id, entries = this.entries) {
      if (!id) {
        return null;
      }

      for (const entry of entries) {
        if (entry.id === id) {
          return entry;
        }

        const childMatch = this.findEntryById(id, entry.children || []);

        if (childMatch) {
          return childMatch;
        }
      }

      return null;
    }

    getActiveLayer() {
      const activeEntry = this.findEntryById(this.activeLayerId);

      return activeEntry ? this.cloneEntry(activeEntry) : null;
    }

    flattenTopToBottom(entries = this.entries, ancestorsVisible = true) {
      const result = [];

      for (const entry of entries) {
        const visible = ancestorsVisible && entry.visible !== false;

        if (entry.type === "group") {
          result.push(...this.flattenTopToBottom(entry.children || [], visible));
          continue;
        }

        result.push({
          ...this.cloneEntry(entry),
          visible,
        });
      }

      return result;
    }

    getRenderableLayers() {
      return this.flattenTopToBottom()
        .filter((entry) => entry.visible !== false)
        .reverse();
    }

    emitChange(source) {
      const detail = {
        activeLayerId: this.activeLayerId,
        entries: this.getEntries(),
        source,
      };

      this.dispatchEvent(new CustomEvent("change", { detail }));
      window.dispatchEvent(new CustomEvent("cbo:document-layers-change", { detail }));
    }
  }

  namespace.DocumentLayerModel = DocumentLayerModel;
})(window.CBO = window.CBO || {});
