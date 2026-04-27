(function registerVectorOverlayRenderer(namespace) {
  class VectorOverlayRenderer {
    constructor(options = {}) {
      if (!(options.stage instanceof HTMLElement)) {
        throw new TypeError("VectorOverlayRenderer richiede lo stage editor.");
      }

      this.stage = options.stage;
      this.overlay = document.createElement("div");
      this.world = document.createElement("div");
      this.measureRoot = document.createElement("div");
      this.elementsByLayerId = new Map();
      this.isDisposed = false;

      this.overlay.className = "editor-vector-overlay";
      this.overlay.setAttribute("aria-hidden", "true");
      this.world.className = "editor-vector-world";
      this.overlay.append(this.world);
      this.stage.append(this.overlay);
      this.measureRoot.className = "editor-vector-measure-root";
      Object.assign(this.measureRoot.style, {
        contain: "layout style paint",
        left: "-100000px",
        pointerEvents: "none",
        position: "fixed",
        top: "0",
        visibility: "hidden",
        zIndex: "-1",
      });
      document.body.append(this.measureRoot);
    }

    rgbaToCss(color, fallback = [1, 1, 1, 1]) {
      const source = Array.isArray(color) ? color : fallback;
      const channels = fallback.map((fallbackChannel, index) => {
        const value = source[index];

        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallbackChannel;
      });
      const r = Math.round(channels[0] * 255);
      const g = Math.round(channels[1] * 255);
      const b = Math.round(channels[2] * 255);
      const a = channels[3];

      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    getLayerElement(layer) {
      let element = this.elementsByLayerId.get(layer.id);

      if (!element) {
        element = document.createElement("div");
        const strokeElement = document.createElement("div");
        const fillElement = document.createElement("div");
        const boundsElement = this.createBoundsElement();

        element.className = "editor-vector-text-layer";
        strokeElement.className = "editor-vector-text-face editor-vector-text-stroke";
        fillElement.className = "editor-vector-text-face editor-vector-text-fill";
        element.append(strokeElement, fillElement, boundsElement);
        this.elementsByLayerId.set(layer.id, element);
        this.world.append(element);
      } else if (!element.querySelector(".editor-vector-text-fill")) {
        element.replaceChildren();
        const strokeElement = document.createElement("div");
        const fillElement = document.createElement("div");
        const boundsElement = this.createBoundsElement();

        strokeElement.className = "editor-vector-text-face editor-vector-text-stroke";
        fillElement.className = "editor-vector-text-face editor-vector-text-fill";
        element.append(strokeElement, fillElement, boundsElement);
      }

      return element;
    }

    createBoundsElement() {
      const boundsElement = document.createElement("div");
      const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

      boundsElement.className = "editor-vector-text-bounds";
      boundsElement.hidden = true;
      handles.forEach((handle) => {
        const handleElement = document.createElement("span");

        handleElement.className = "editor-selection-handle";
        handleElement.dataset.handle = handle;
        boundsElement.append(handleElement);
      });

      return boundsElement;
    }

    syncTextFace(element, styles) {
      if (!element) {
        return;
      }

      Object.entries(styles).forEach(([property, value]) => {
        element.style[property] = value;
      });
    }

    measureTextBounds(text, textStyles, width, strokeOutset) {
      if (!this.measureRoot) {
        return null;
      }

      const measureElement = document.createElement("div");

      measureElement.className = "editor-vector-text-face";
      measureElement.textContent = text;
      Object.assign(measureElement.style, {
        height: "auto",
        inset: "auto",
        left: "0",
        overflow: "visible",
        position: "absolute",
        top: "0",
        width: `${Math.max(1, width)}px`,
      });
      this.syncTextFace(measureElement, textStyles);
      this.measureRoot.append(measureElement);

      const range = document.createRange();

      range.selectNodeContents(measureElement);

      const rootRect = measureElement.getBoundingClientRect();
      const rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0);

      range.detach?.();
      measureElement.remove();

      if (rects.length === 0) {
        return null;
      }

      const bounds = rects.reduce((accumulator, rect) => ({
        left: Math.min(accumulator.left, rect.left),
        top: Math.min(accumulator.top, rect.top),
        right: Math.max(accumulator.right, rect.right),
        bottom: Math.max(accumulator.bottom, rect.bottom),
      }), {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      });
      const outset = Math.max(0, strokeOutset || 0);
      const x = bounds.left - rootRect.left - outset;
      const y = bounds.top - rootRect.top - outset;
      const measuredWidth = bounds.right - bounds.left + outset * 2;
      const measuredHeight = bounds.bottom - bounds.top + outset * 2;

      return {
        x,
        y,
        width: Math.max(1, measuredWidth),
        height: Math.max(1, measuredHeight),
      };
    }

    removeUnusedElements(activeIds) {
      for (const [layerId, element] of this.elementsByLayerId.entries()) {
        if (activeIds.has(layerId)) {
          continue;
        }

        element.remove();
        this.elementsByLayerId.delete(layerId);
      }
    }

    sync(options = {}) {
      if (this.isDisposed) {
        return;
      }

      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const dpr = Number.isFinite(options.dpr) && options.dpr > 0 ? options.dpr : 1;
      const renderableLayers = Array.isArray(options.layers) ? options.layers : [];
      const activeLayerId = options.activeLayerId || "";
      const activeIds = new Set();
      const cameraZoom = Math.max(0.000001, Number(camera.zoom) || 1);
      const cssScale = cameraZoom / dpr;
      const cssCameraX = (Number(camera.x) || 0) / dpr;
      const cssCameraY = (Number(camera.y) || 0) / dpr;
      const cssViewportWidth = Math.max(1, Math.round((options.viewportWidth || 1) / dpr));
      const cssViewportHeight = Math.max(1, Math.round((options.viewportHeight || 1) / dpr));

      this.world.style.width = `${cssViewportWidth}px`;
      this.world.style.height = `${cssViewportHeight}px`;
      this.world.style.transform = "none";

      renderableLayers.forEach((layer, index) => {
        if (layer?.type !== "text" || layer.visible === false) {
          return;
        }

        const text = String(layer.text || "");

        if (!text.trim()) {
          return;
        }

        const box = layer.box || {};
        const transform = layer.transform || {};
        const style = layer.style || {};
        const font = layer.font || {};
        const strokeWidth = Number.isFinite(style.strokeWidth) ? Math.max(0, style.strokeWidth) : 0;
        const strokeColor = this.rgbaToCss(style.strokeColor, [0, 0, 0, 1]);
        const x = Number.isFinite(transform.x) ? transform.x : Number(box.x) || 0;
        const y = Number.isFinite(transform.y) ? transform.y : Number(box.y) || 0;
        const width = Math.max(1, Number(box.width) || 1);
        const height = Math.max(1, Number(box.height) || 1);
        const screenX = cssCameraX + x * cssScale;
        const screenY = cssCameraY + y * cssScale;
        const screenWidth = width * cssScale;
        const screenHeight = height * cssScale;
        const scaleX = Number.isFinite(transform.scaleX) ? transform.scaleX : 1;
        const scaleY = Number.isFinite(transform.scaleY) ? transform.scaleY : 1;
        const rotation = Number.isFinite(transform.rotation) ? transform.rotation : 0;
        const skewX = Number.isFinite(transform.skewX) ? transform.skewX : 0;
        const skewY = Number.isFinite(transform.skewY) ? transform.skewY : 0;
        const anchorX = Number.isFinite(transform.anchorX) ? Math.min(1, Math.max(0, transform.anchorX)) : 0;
        const anchorY = Number.isFinite(transform.anchorY) ? Math.min(1, Math.max(0, transform.anchorY)) : 0;
        const element = this.getLayerElement(layer);
        const strokeElement = element.querySelector(".editor-vector-text-stroke");
        const fillElement = element.querySelector(".editor-vector-text-fill");
        const boundsElement = element.querySelector(".editor-vector-text-bounds");
        const fillColor = this.rgbaToCss(style.fillColor, [1, 1, 1, 1]);
        const textStyles = {
          fontFamily: typeof font.family === "string" && font.family.trim()
            ? font.family
            : "Inter, Arial, sans-serif",
          fontSize: `${Math.max(1, Number(font.size) || 72) * cssScale}px`,
          fontWeight: String(font.weight || 700),
          fontStyle: font.style === "italic" ? "italic" : "normal",
          lineHeight: String(Number.isFinite(style.lineHeight) && style.lineHeight > 0
            ? style.lineHeight
            : 1.15),
          letterSpacing: `${(Number.isFinite(style.letterSpacing) ? style.letterSpacing : 0) * cssScale}px`,
          textAlign: ["left", "center", "right"].includes(style.align) ? style.align : "left",
        };

        activeIds.add(layer.id);
        element.classList.toggle("selected", layer.id === activeLayerId);
        element.style.zIndex = String(index);
        element.style.opacity = String(Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1);
        element.style.width = `${screenWidth}px`;
        element.style.height = `${screenHeight}px`;
        element.style.transformOrigin = `${anchorX * 100}% ${anchorY * 100}%`;
        element.style.transform = [
          `translate(${screenX}px, ${screenY}px)`,
          `rotate(${rotation}deg)`,
          `skew(${skewX}deg, ${skewY}deg)`,
          `scale(${scaleX}, ${scaleY})`,
        ].join(" ");

        if (strokeElement) {
          strokeElement.textContent = text;
          this.syncTextFace(strokeElement, {
            ...textStyles,
            color: strokeColor,
            webkitTextFillColor: "transparent",
            webkitTextStroke: strokeWidth > 0 ? `${strokeWidth * cssScale}px ${strokeColor}` : "0 transparent",
          });
        }

        if (fillElement) {
          fillElement.textContent = text;
          this.syncTextFace(fillElement, {
            ...textStyles,
            color: fillColor,
            webkitTextFillColor: fillColor,
            webkitTextStroke: "0 transparent",
          });
        }

        if (boundsElement) {
          const isSelected = layer.id === activeLayerId;

          boundsElement.hidden = !isSelected;

          if (isSelected) {
            const visualBounds = this.measureTextBounds(
              text,
              textStyles,
              screenWidth,
              (strokeWidth * cssScale) / 2,
            );

            if (visualBounds) {
              boundsElement.style.left = `${visualBounds.x}px`;
              boundsElement.style.top = `${visualBounds.y}px`;
              boundsElement.style.width = `${visualBounds.width}px`;
              boundsElement.style.height = `${visualBounds.height}px`;
            }
          }
        }
      });

      this.removeUnusedElements(activeIds);
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      this.isDisposed = true;
      this.elementsByLayerId.clear();
      this.overlay.remove();
      this.measureRoot?.remove();
      this.measureRoot = null;
    }
  }

  namespace.VectorOverlayRenderer = VectorOverlayRenderer;
})(window.CBO = window.CBO || {});
