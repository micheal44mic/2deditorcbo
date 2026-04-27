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

      if (type === "text") {
        return this.createTextLayer(options);
      }

      return this.createBaseLayer(options);
    }

    createTextLayer(options = {}) {
      const box = {
        x: Number.isFinite(options.box?.x) ? options.box.x : 0,
        y: Number.isFinite(options.box?.y) ? options.box.y : 0,
        width: Number.isFinite(options.box?.width) ? Math.max(1, options.box.width) : 640,
        height: Number.isFinite(options.box?.height) ? Math.max(1, options.box.height) : 180,
      };

      return {
        ...this.createBaseLayer({
          ...options,
          type: "text",
          name: options.name || "Text",
        }),
        text: typeof options.text === "string" ? options.text : "Text",
        font: this.normalizeTextFont(options.font),
        style: this.normalizeTextStyle(options.style),
        shadow: this.normalizeTextShadow(options.shadow),
        box,
        transform: this.normalizeTextTransform(options.transform, box),
        warp: this.normalizeTextWarp(options.warp, box),
      };
    }

    normalizeTextFont(font = {}) {
      font = font && typeof font === "object" ? font : {};

      return {
        key: ["roboto", "oswald"].includes(font.key) ? font.key : "roboto",
        family: typeof font.family === "string" && font.family.trim()
          ? font.family.trim()
          : "Roboto Black, Roboto, Inter, Arial, sans-serif",
        size: Number.isFinite(font.size) ? Math.min(512, Math.max(4, font.size)) : 163,
        weight: Number.isFinite(font.weight) || typeof font.weight === "string" ? font.weight : 900,
        style: font.style === "italic" ? "italic" : "normal",
      };
    }

    normalizeTextStyle(style = {}) {
      style = style && typeof style === "object" ? style : {};

      return {
        fillColor: this.normalizeColor(style.fillColor, [1, 1, 1, 1]),
        strokeColor: this.normalizeColor(style.strokeColor, [0, 0, 0, 1]),
        strokeWidth: Number.isFinite(style.strokeWidth) ? Math.max(0, style.strokeWidth) : 5,
        lineHeight: Number.isFinite(style.lineHeight) ? Math.min(3, Math.max(0.65, style.lineHeight)) : 1.15,
        letterSpacing: Number.isFinite(style.letterSpacing) ? Math.min(200, Math.max(-100, style.letterSpacing)) : 0,
        align: ["left", "center", "right"].includes(style.align) ? style.align : "left",
      };
    }

    normalizeTextShadow(shadow = {}) {
      shadow = shadow && typeof shadow === "object" ? shadow : {};

      return {
        solid: shadow.solid !== false,
        color: this.normalizeColor(shadow.color, [0.859, 0.102, 0.353, 1]),
        offset: Number.isFinite(shadow.offset) ? Math.min(200, Math.max(0, shadow.offset)) : 25,
        angle: Number.isFinite(shadow.angle) ? Math.min(360, Math.max(0, shadow.angle)) : 45,
        blur: Number.isFinite(shadow.blur) ? Math.min(100, Math.max(0, shadow.blur)) : 0,
      };
    }

    normalizeTextTransform(transform = {}, box = {}) {
      transform = transform && typeof transform === "object" ? transform : {};

      return {
        x: Number.isFinite(transform.x) ? transform.x : Number(box.x) || 0,
        y: Number.isFinite(transform.y) ? transform.y : Number(box.y) || 0,
        rotation: Number.isFinite(transform.rotation) ? transform.rotation : 0,
        scaleX: Number.isFinite(transform.scaleX) ? Math.min(50, Math.max(0.01, transform.scaleX)) : 1,
        scaleY: Number.isFinite(transform.scaleY) ? Math.min(50, Math.max(0.01, transform.scaleY)) : 1,
        skewX: Number.isFinite(transform.skewX) ? Math.min(85, Math.max(-85, transform.skewX)) : 0,
        skewY: Number.isFinite(transform.skewY) ? Math.min(85, Math.max(-85, transform.skewY)) : 0,
        anchorX: Number.isFinite(transform.anchorX) ? Math.min(1, Math.max(0, transform.anchorX)) : 0,
        anchorY: Number.isFinite(transform.anchorY) ? Math.min(1, Math.max(0, transform.anchorY)) : 0,
      };
    }

    normalizeTextWarp(warp = {}, box = {}) {
      warp = warp && typeof warp === "object" ? warp : {};
      const width = Math.max(1, Number(box.width) || 1);
      const height = Math.max(1, Number(box.height) || 1);
      const transformModes = ["CUSTOM", "DISTORT", "CIRCLE", "ANGLE", "ARCH", "RISE", "WAVE", "FLAG"];
      const rawMode = String(warp.mode || "").trim().toUpperCase();
      const mode = transformModes.includes(rawMode)
        ? rawMode
        : warp.enabled === true
          ? "DISTORT"
          : "CUSTOM";
      const defaultPoints = {
        topLeft: { x: 0, y: 0 },
        topCenter: { x: 0.5, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomLeft: { x: 0, y: 1 },
        bottomCenter: { x: 0.5, y: 1 },
        bottomRight: { x: 1, y: 1 },
      };
      const defaultHandles = {
        topIn: { x: 0.35, y: 0 },
        topOut: { x: 0.65, y: 0 },
        bottomIn: { x: 0.35, y: 1 },
        bottomOut: { x: 0.65, y: 1 },
      };
      const normalizeWarpPoint = (point, fallback) => {
        point = point && typeof point === "object" ? point : {};

        return {
          x: Number.isFinite(point.x) ? Math.min(3, Math.max(-2, point.x)) : fallback.x,
          y: Number.isFinite(point.y) ? Math.min(3, Math.max(-2, point.y)) : fallback.y,
        };
      };
      const normalizePointMap = (source, fallback) =>
        Object.fromEntries(
          Object.entries(fallback).map(([key, fallbackPoint]) => [
            key,
            normalizeWarpPoint(source?.[key], fallbackPoint),
          ]),
        );

      return {
        enabled: mode !== "CUSTOM",
        mode,
        amount: Number.isFinite(warp.amount) ? Math.min(1, Math.max(-1, warp.amount)) : 0.5,
        sourceWidth: Number.isFinite(warp.sourceWidth) ? Math.max(1, warp.sourceWidth) : width,
        sourceHeight: Number.isFinite(warp.sourceHeight) ? Math.max(1, warp.sourceHeight) : height,
        points: normalizePointMap(warp.points, defaultPoints),
        handles: normalizePointMap(warp.handles, defaultHandles),
      };
    }

    normalizeColor(value, fallback) {
      if (!Array.isArray(value)) {
        return fallback.slice();
      }

      const channels = fallback.map((fallbackChannel, index) => {
        const channel = value[index];

        return Number.isFinite(channel) ? Math.min(1, Math.max(0, channel)) : fallbackChannel;
      });

      return channels;
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

      if (type === "text") {
        return "Text";
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

      if (entry.type === "text") {
        const normalized = this.createTextLayer(entry);

        Object.assign(entry, normalized);
      } else {
        entry.opacity = Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1;
      }

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
