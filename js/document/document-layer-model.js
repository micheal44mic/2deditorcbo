(function registerDocumentLayerModel(namespace) {
  const BACKGROUND_LAYER_ID = "background";
  const VECTOR_TEXT_TYPE = "vector-text";
  const MAX_GAUSSIAN_BLUR_RADIUS = 200;
  const MAX_MOTION_BLUR_DISTANCE = 300;
  const MAX_FIELD_BLUR_RADIUS = 200;
  const MAX_FIELD_BLUR_PINS = 8;
  const MAX_RADIAL_BLUR_AMOUNT = 200;
  const MAX_GRAIN_AMOUNT = 100;
  const MAX_GRAIN_SCALE = 100;
  const DEFAULT_GRAIN_SCALE = 42;
  const MAX_NOISE_AMOUNT = 100;
  const MAX_NOISE_SCALE = 100;
  const DEFAULT_NOISE_SCALE = 1;
  const MAX_THRESHOLD_VALUE = 255;
  const DEFAULT_THRESHOLD_VALUE = 128;
  const CURVE_CHANNELS = Object.freeze(["rgb", "r", "g", "b"]);
  const DEFAULT_VECTOR_TEXT_STYLE = Object.freeze({
    fill: "#000000",
    stroke: "#000000",
    strokeAlign: "center",
    strokeWidth: 0,
    shadow: {
      color: "#000000",
      blur: 0,
      offsetX: 0,
      offsetY: 0,
      opacity: 0,
    },
  });

  function normalizeAngle(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return ((number % 360) + 360) % 360;
  }

  function normalizePercent(value, fallback = 50) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
  }

  function normalizeRadialBlurMode(value) {
    return String(value || "").trim().toLowerCase() === "zoom" ? "zoom" : "spin";
  }

  function normalizeGrainAmount(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_GRAIN_AMOUNT, number)) : 0;
  }

  function normalizeGrainScale(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(1, Math.min(MAX_GRAIN_SCALE, number)) : DEFAULT_GRAIN_SCALE;
  }

  function normalizeNoiseAmount(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_NOISE_AMOUNT, number)) : 0;
  }

  function normalizeNoiseScale(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(1, Math.min(MAX_NOISE_SCALE, number)) : DEFAULT_NOISE_SCALE;
  }

  function normalizeThresholdValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_THRESHOLD_VALUE, number)) : DEFAULT_THRESHOLD_VALUE;
  }

  function getCurvesEngine() {
    return namespace.CurvesEngine || null;
  }

  function getIdentityCurvePoints() {
    return [
      { id: "black", x: 0, y: 0, endpoint: true },
      { id: "white", x: 255, y: 255, endpoint: true },
    ];
  }

  function normalizeCurvePoint(point, fallbackId) {
    const x = Number(point?.x);
    const y = Number(point?.y);

    return {
      id: typeof point?.id === "string" && point.id.trim() ? point.id : fallbackId,
      x: Number.isFinite(x) ? Math.max(0, Math.min(255, Math.round(x))) : 0,
      y: Number.isFinite(y) ? Math.max(0, Math.min(255, Math.round(y))) : 0,
      endpoint: point?.endpoint === true,
    };
  }

  function normalizeCurvePoints(points) {
    const engine = getCurvesEngine();

    if (engine?.normalizePoints) {
      return engine.normalizePoints(points);
    }

    const source = Array.isArray(points) && points.length >= 2 ? points : getIdentityCurvePoints();
    const sorted = source
      .filter(Boolean)
      .map((point, index) => normalizeCurvePoint(point, `curve-${index}`))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const unique = [];

    for (const point of sorted) {
      const last = unique[unique.length - 1];

      if (!last || last.x !== point.x) {
        unique.push(point);
      }
    }

    if (unique.length < 2) {
      return getIdentityCurvePoints();
    }

    return unique.slice(0, 19).map((point, index, list) => ({
      ...point,
      endpoint: index === 0 || index === list.length - 1,
    }));
  }

  function normalizeCurvesPointsByChannel(pointsByChannel = {}) {
    const engine = getCurvesEngine();

    if (engine?.normalizePointsByChannel) {
      return engine.normalizePointsByChannel(pointsByChannel);
    }

    return Object.fromEntries(
      CURVE_CHANNELS.map((channel) => [channel, normalizeCurvePoints(pointsByChannel?.[channel])]),
    );
  }

  function hasMeaningfulCurves(pointsByChannel = {}) {
    const engine = getCurvesEngine();

    if (engine?.hasMeaningfulCurves) {
      return engine.hasMeaningfulCurves(pointsByChannel);
    }

    const points = normalizeCurvesPointsByChannel(pointsByChannel);

    return CURVE_CHANNELS.some((channel) => {
      const channelPoints = points[channel];

      return !(
        channelPoints.length === 2 &&
        channelPoints[0].x === 0 &&
        channelPoints[0].y === 0 &&
        channelPoints[1].x === 255 &&
        channelPoints[1].y === 255
      );
    });
  }

  function normalizeFieldBlurPins(pins) {
    if (!Array.isArray(pins)) {
      return [];
    }

    return pins
      .filter(Boolean)
      .slice(0, MAX_FIELD_BLUR_PINS)
      .map((pin) => {
        const x = Number(pin.x);
        const y = Number(pin.y);
        const blur = Number(pin.blur);
        const nextPin = {
          blur: Number.isFinite(blur) ? Math.max(0, Math.min(MAX_FIELD_BLUR_RADIUS, blur)) : 0,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        };

        if (typeof pin.id === "string" && pin.id.trim()) {
          nextPin.id = pin.id;
        }

        return nextPin;
      });
  }

  function hasFieldBlurAmount(pins) {
    return normalizeFieldBlurPins(pins).some((pin) => pin.blur > 0);
  }

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
      const baseKeys = new Set([
        "id",
        "type",
        "name",
        "visible",
        "locked",
        "opacity",
        "blendMode",
        "effects",
        "children",
      ]);
      const blendModes = window.CBO?.BlendModes;
      const extras = Object.fromEntries(
        Object.entries(options)
          .filter(([key]) => !baseKeys.has(key))
          .map(([key, value]) => [key, this.cloneValue(value)]),
      );

      const layer = {
        ...extras,
        id: options.id || this.createId(type),
        type,
        name: options.name || this.getFallbackName(type),
        visible: options.visible !== false,
        locked: options.locked === true,
        opacity: Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1,
        blendMode: blendModes?.normalizeLayerBlendMode?.(options.blendMode) || "normal",
        clippingMask: options.clippingMask === true,
      };
      const effects = this.normalizeLayerEffects(options.effects);

      if (effects.length > 0) {
        layer.effects = effects;
      }

      return layer;
    }

    normalizeLayerEffects(effects) {
      if (!Array.isArray(effects)) {
        return [];
      }

      return effects
        .filter(Boolean)
        .map((effect) => {
          if (effect.type === "gaussian-blur") {
            const radius = Number(effect.radius);

            return {
              type: "gaussian-blur",
              enabled: effect.enabled !== false,
              radius: Number.isFinite(radius) ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius)) : 0,
            };
          }

          if (effect.type === "motion-blur") {
            const distance = Number(effect.distance);

            return {
              type: "motion-blur",
              enabled: effect.enabled !== false,
              distance: Number.isFinite(distance) ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance)) : 0,
              angle: normalizeAngle(effect.angle),
            };
          }

          if (effect.type === "field-blur") {
            return {
              type: "field-blur",
              enabled: effect.enabled !== false,
              pins: normalizeFieldBlurPins(effect.pins),
            };
          }

          if (effect.type === "radial-blur") {
            const amount = Number(effect.amount);
            const centerFallback = effect.center;

            return {
              type: "radial-blur",
              enabled: effect.enabled !== false,
              amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount)) : 0,
              centerX: normalizePercent(effect.centerX ?? centerFallback),
              centerY: normalizePercent(effect.centerY ?? centerFallback),
              mode: normalizeRadialBlurMode(effect.mode),
            };
          }

          if (effect.type === "grain") {
            const amount = normalizeGrainAmount(effect.amount);
            const seed = Number(effect.seed);

            return {
              type: "grain",
              enabled: effect.enabled !== false,
              amount,
              scale: normalizeGrainScale(effect.scale),
              monochrome: effect.monochrome !== false,
              seed: Number.isFinite(seed) ? seed : 0,
            };
          }

          if (effect.type === "noise") {
            const amount = normalizeNoiseAmount(effect.amount);
            const seed = Number(effect.seed);

            return {
              type: "noise",
              enabled: effect.enabled !== false,
              amount,
              scale: normalizeNoiseScale(effect.scale),
              monochrome: effect.monochrome !== false,
              seed: Number.isFinite(seed) ? seed : 0,
            };
          }

          if (effect.type === "threshold") {
            return {
              type: "threshold",
              enabled: effect.enabled !== false,
              threshold: normalizeThresholdValue(effect.threshold ?? effect.level),
            };
          }

          if (effect.type === "curves") {
            return {
              type: "curves",
              enabled: effect.enabled !== false,
              points: normalizeCurvesPointsByChannel(effect.points || effect.curves),
            };
          }

          return this.cloneValue(effect);
        })
        .filter((effect) =>
          (effect.type !== "gaussian-blur" || effect.radius > 0) &&
          (effect.type !== "motion-blur" || effect.distance > 0) &&
          (effect.type !== "field-blur" || hasFieldBlurAmount(effect.pins)) &&
          (effect.type !== "radial-blur" || effect.amount > 0) &&
          (effect.type !== "grain" || effect.amount > 0) &&
          (effect.type !== "noise" || effect.amount > 0) &&
          (effect.type !== "threshold" || effect.enabled !== false) &&
          (effect.type !== "curves" || (effect.enabled !== false && hasMeaningfulCurves(effect.points))),
        );
    }

    createLayer(options = {}) {
      const type = options.type || "layer";

      if (type === "group") {
        return this.createGroup(options);
      }

      if (type === VECTOR_TEXT_TYPE || type === "text") {
        return this.createVectorTextLayer(options);
      }

      return this.createBaseLayer(options);
    }

    createVectorTextLayer(options = {}) {
      const engine = window.CBO?.VectorTextEngine;
      const fontRecord = (window.CBO?.VECTOR_TEXT_FONTS || []).find((font) =>
        font.url === (options.fontUrl || engine?.DEFAULT_FONT_URL),
      ) || null;
      const style = options.style || {};
      const shadow = style.shadow || {};
      const base = this.createBaseLayer({
        ...options,
        type: VECTOR_TEXT_TYPE,
        name: options.name || "Text",
      });

      return {
        ...base,
        kind: "text",
        text: typeof options.text === "string" ? options.text : "CBOs",
        x: Number.isFinite(options.x) ? options.x : 850,
        y: Number.isFinite(options.y) ? options.y : 1420,
        scaleX: Number.isFinite(options.scaleX) ? options.scaleX : 1,
        scaleY: Number.isFinite(options.scaleY) ? options.scaleY : 1,
        rotation: Number.isFinite(options.rotation) ? options.rotation : 0,
        fontSize: Number.isFinite(options.fontSize) ? options.fontSize : 300,
        fontUrl: options.fontUrl || engine?.DEFAULT_FONT_URL || "./vendor/fonts/LibreBaskerville-wght.ttf",
        fontLabel: options.fontLabel || fontRecord?.label || engine?.DEFAULT_FONT_LABEL || "Libre Baskerville VF",
        fontFamily: options.fontFamily || fontRecord?.family || engine?.DEFAULT_FONT_LABEL || "UnifrakturCook",
        fontStyle: options.fontStyle || fontRecord?.style || "Bold",
        letterSpacing: Number.isFinite(options.letterSpacing) ? options.letterSpacing : 0,
        lineHeight: Number.isFinite(options.lineHeight) ? options.lineHeight : 182,
        textAlign: ["left", "center", "right"].includes(options.textAlign) ? options.textAlign : "center",
        uppercase: options.uppercase === true,
        ligatures: options.ligatures !== false,
        alternates: options.alternates === true,
        shadowType: options.shadowType || "drop",
        shadowAngle: Number.isFinite(options.shadowAngle) ? options.shadowAngle : 0,
        shadowDistance: Number.isFinite(options.shadowDistance) ? options.shadowDistance : 0,
        envelopeGrid: options.envelopeGrid ? this.cloneValue(options.envelopeGrid) : null,
        warp: {
          type: options.warp?.type || "none",
          amount: Number.isFinite(options.warp?.amount) ? options.warp.amount : 0,
        },
        style: {
          fill: style.fill || DEFAULT_VECTOR_TEXT_STYLE.fill,
          stroke: style.stroke || DEFAULT_VECTOR_TEXT_STYLE.stroke,
          strokeAlign: ["outer", "inner", "center"].includes(style.strokeAlign)
            ? style.strokeAlign
            : DEFAULT_VECTOR_TEXT_STYLE.strokeAlign,
          strokeWidth: Number.isFinite(style.strokeWidth)
            ? style.strokeWidth
            : DEFAULT_VECTOR_TEXT_STYLE.strokeWidth,
          shadow: {
            color: shadow.color || DEFAULT_VECTOR_TEXT_STYLE.shadow.color,
            blur: Number.isFinite(shadow.blur) ? shadow.blur : DEFAULT_VECTOR_TEXT_STYLE.shadow.blur,
            offsetX: Number.isFinite(shadow.offsetX)
              ? shadow.offsetX
              : DEFAULT_VECTOR_TEXT_STYLE.shadow.offsetX,
            offsetY: Number.isFinite(shadow.offsetY)
              ? shadow.offsetY
              : DEFAULT_VECTOR_TEXT_STYLE.shadow.offsetY,
            opacity: Number.isFinite(shadow.opacity)
              ? shadow.opacity
              : DEFAULT_VECTOR_TEXT_STYLE.shadow.opacity,
          },
        },
      };
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

      if (type === VECTOR_TEXT_TYPE || type === "text") {
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
              effects: entry.effects,
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

    insertAtTop(entry) {
      if (!entry) {
        return false;
      }

      this.entries.unshift(entry);
      return true;
    }

    ensureActivePaintLayer(options = {}) {
      const activeEntry = this.findEntryById(this.activeLayerId);

      if (activeEntry?.type === "paint") {
        return this.cloneEntry(activeEntry);
      }

      const beforeState = this.captureHistoryState(options);
      const paintLayer = this.createLayer({
        name: this.getNextPaintLayerName(),
        type: "paint",
      });
      const inserted = activeEntry
        ? this.insertEntryAbove(activeEntry.id, paintLayer)
        : this.insertAtTop(paintLayer);

      if (!inserted) {
        this.insertAboveBottomSystemLayer(paintLayer);
      }

      this.entries = this.ensureSystemLayers(this.entries);
      this.activeLayerId = paintLayer.id;
      this.emitChange(options.source || "ensure-paint-layer");
      this.recordHistoryStateChange(beforeState, options);

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

    captureHistoryState(options = {}) {
      const history = window.CBO?.documentHistory;

      if (!history?.canRecord?.(options) || !history?.getLayerSnapshot) {
        return null;
      }

      return history.getLayerSnapshot(this);
    }

    recordHistoryStateChange(beforeState, options = {}) {
      const history = window.CBO?.documentHistory;

      if (!beforeState || !history?.recordLayerStateChange) {
        return false;
      }

      return history.recordLayerStateChange(this, beforeState, options);
    }

    setEntries(entries, options = {}) {
      const beforeState = this.captureHistoryState(options);
      const hasRequestedActiveLayer = Object.prototype.hasOwnProperty.call(options, "activeLayerId");

      this.entries = this.ensureSystemLayers(this.normalizeEntries(entries));

      if (hasRequestedActiveLayer) {
        const requestedEntry = this.findEntryById(options.activeLayerId);

        this.activeLayerId = this.canActivateEntry(requestedEntry) ? requestedEntry.id : null;
      } else if (!this.canActivateEntry(this.findEntryById(this.activeLayerId))) {
        this.activeLayerId = this.findFirstLayer(this.entries)?.id || null;
      }

      this.emitChange(options.source || "set-entries");
      this.recordHistoryStateChange(beforeState, options);
    }

    setActiveLayer(id, options = {}) {
      const beforeState = options.recordActiveLayerHistory === true
        ? this.captureHistoryState(options)
        : null;
      const entry = this.findEntryById(id);

      this.activeLayerId = this.canActivateEntry(entry) ? entry.id : null;
      this.emitChange(options.source || "active-layer");
      this.recordHistoryStateChange(beforeState, options);
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

      const beforeState = this.captureHistoryState(options);

      Object.assign(entry, this.cloneValue(nextPatch));
      entry.opacity = Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1;
      entry.blendMode = window.CBO?.BlendModes?.normalizeLayerBlendMode?.(entry.blendMode) || "normal";
      if (Object.prototype.hasOwnProperty.call(nextPatch, "effects")) {
        const effects = this.normalizeLayerEffects(nextPatch.effects);

        if (effects.length > 0) {
          entry.effects = effects;
        } else {
          delete entry.effects;
        }
      }

      this.emitChange(options.source || "update-layer");
      this.recordHistoryStateChange(beforeState, options);

      return true;
    }

    rasterizeImageLayerToPaint(id, options = {}) {
      const entry = this.findEntryById(id);

      if (!entry || entry.type !== "image" || entry.locked === true) {
        return false;
      }

      const source = options.source || "image-rasterize";
      const didRasterize = this.updateLayer(entry.id, {
        type: "paint",
      }, {
        history: options.history,
        historyGroup: options.historyGroup || `image-rasterize-${entry.id}`,
        source,
      });

      if (didRasterize) {
        namespace.documentRenderer?.sparsifyRasterizedImageLayer?.(entry.id, {
          emit: false,
          source: `${source}-retile`,
        });
      }

      return didRasterize;
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
  namespace.rasterizeImageLayerToPaint = function rasterizeImageLayerToPaint(layerId, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const activeLayerId = layerId || layerModel?.activeLayerId;
    const layer = activeLayerId ? layerModel?.findEntryById?.(activeLayerId) : null;

    if (!layerModel?.rasterizeImageLayerToPaint || layer?.type !== "image") {
      return false;
    }

    namespace.documentHistory?.flushLayerState?.(layerModel);

    const source = options.source || "image-rasterize";
    const didRasterize = layerModel.rasterizeImageLayerToPaint(layer.id, {
      ...options,
      source,
    });

    if (!didRasterize) {
      return false;
    }

    namespace.documentRenderer?.requestDraw?.();
    window.dispatchEvent(new CustomEvent("cbo:image-layer-rasterized", {
      detail: {
        layerId: layer.id,
        source,
      },
    }));

    return true;
  };
  namespace.rasterizeActiveImageLayerToPaint = (options = {}) =>
    namespace.rasterizeImageLayerToPaint(null, options);
  namespace.rasterizeActiveImageLayer = namespace.rasterizeActiveImageLayerToPaint;
})(window.CBO = window.CBO || {});
