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
      this.activeWarpDrag = null;
      this.textPathRenderer = namespace.TextPathRenderer
        ? new namespace.TextPathRenderer()
        : null;
      this.isDisposed = false;
      this.handleWarpPointerDown = this.handleWarpPointerDown.bind(this);
      this.handleWarpPointerMove = this.handleWarpPointerMove.bind(this);
      this.handleWarpPointerEnd = this.handleWarpPointerEnd.bind(this);

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
      this.overlay.addEventListener("pointerdown", this.handleWarpPointerDown);
      window.addEventListener("pointermove", this.handleWarpPointerMove);
      window.addEventListener("pointerup", this.handleWarpPointerEnd);
      window.addEventListener("pointercancel", this.handleWarpPointerEnd);
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
        const visualElement = document.createElement("div");
        const strokeElement = document.createElement("div");
        const fillElement = document.createElement("div");
        const warpCanvas = document.createElement("canvas");
        const warpControls = this.createWarpControlsElement();
        const boundsElement = this.createBoundsElement();

        element.className = "editor-vector-text-layer";
        element.dataset.layerId = layer.id;
        visualElement.className = "editor-vector-text-visual";
        strokeElement.className = "editor-vector-text-face editor-vector-text-stroke";
        fillElement.className = "editor-vector-text-face editor-vector-text-fill";
        warpCanvas.className = "editor-vector-text-warp-canvas";
        visualElement.append(strokeElement, fillElement, warpCanvas);
        element.append(visualElement, boundsElement, warpControls);
        this.elementsByLayerId.set(layer.id, element);
        this.world.append(element);
      } else if (
        !element.querySelector(".editor-vector-text-visual") ||
        !element.querySelector(".editor-vector-text-fill") ||
        !element.querySelector(".editor-vector-text-warp-canvas") ||
        !element.querySelector(".editor-text-warp-controls")
      ) {
        element.replaceChildren();
        const visualElement = document.createElement("div");
        const strokeElement = document.createElement("div");
        const fillElement = document.createElement("div");
        const warpCanvas = document.createElement("canvas");
        const warpControls = this.createWarpControlsElement();
        const boundsElement = this.createBoundsElement();

        element.dataset.layerId = layer.id;
        visualElement.className = "editor-vector-text-visual";
        strokeElement.className = "editor-vector-text-face editor-vector-text-stroke";
        fillElement.className = "editor-vector-text-face editor-vector-text-fill";
        warpCanvas.className = "editor-vector-text-warp-canvas";
        visualElement.append(strokeElement, fillElement, warpCanvas);
        element.append(visualElement, boundsElement, warpControls);
      }

      return element;
    }

    createWarpControlsElement() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const topPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const bottomPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const handleKeys = ["topIn", "topOut", "bottomIn", "bottomOut"];
      const pointKeys = ["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"];

      svg.classList.add("editor-text-warp-controls");
      svg.hidden = true;
      outline.classList.add("editor-text-warp-outline");
      outline.dataset.warpPath = "outline";
      topPath.classList.add("editor-text-warp-curve");
      topPath.dataset.warpPath = "top";
      bottomPath.classList.add("editor-text-warp-curve");
      bottomPath.dataset.warpPath = "bottom";
      svg.append(outline, topPath, bottomPath);

      handleKeys.forEach((key) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

        line.classList.add("editor-text-warp-handle-line");
        line.dataset.warpHandleLine = key;
        svg.append(line);
      });

      pointKeys.forEach((key) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");

        circle.classList.add("editor-text-warp-anchor");
        circle.dataset.warpPoint = key;
        circle.setAttribute("r", "5");
        svg.append(circle);
      });

      handleKeys.forEach((key) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");

        circle.classList.add("editor-text-warp-handle");
        circle.dataset.warpHandle = key;
        circle.setAttribute("r", "4");
        svg.append(circle);
      });

      return svg;
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

    measureTextBounds(text, textStyles, width, strokeOutset, options = {}) {
      if (!this.measureRoot) {
        return null;
      }

      const measureElement = document.createElement("div");
      const fitContent = options.fitContent === true;
      const constraintWidth = Number.isFinite(width) ? Math.max(1, width) : 1;

      measureElement.className = "editor-vector-text-face";
      measureElement.textContent = text;
      Object.assign(measureElement.style, {
        height: "auto",
        inset: "auto",
        left: "0",
        overflow: "visible",
        position: "absolute",
        top: "0",
        width: fitContent ? "max-content" : `${constraintWidth}px`,
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

    measureNaturalTextBounds(text, textStyles) {
      return this.measureTextBounds(text, textStyles, 1, 0, { fitContent: true });
    }

    getBaseTextBounds(text, textStyles, screenWidth, screenHeight) {
      const measured = this.measureNaturalTextBounds(text, textStyles);

      if (!measured) {
        return {
          x: 0,
          y: 0,
          width: Math.max(1, screenWidth),
          height: Math.max(1, screenHeight),
        };
      }

      const width = Math.max(1, measured.width);
      const height = Math.max(1, measured.height);

      return {
        x: (Math.max(1, screenWidth) - width) * 0.5,
        y: (Math.max(1, screenHeight) - height) * 0.5,
        width,
        height,
      };
    }

    expandBounds(bounds, amount) {
      const outset = Math.max(0, Number(amount) || 0);

      return {
        x: bounds.x - outset,
        y: bounds.y - outset,
        width: Math.max(1, bounds.width + outset * 2),
        height: Math.max(1, bounds.height + outset * 2),
      };
    }

    syncBoundsElement(boundsElement, bounds) {
      if (!boundsElement || !bounds) {
        return false;
      }

      boundsElement.style.left = `${bounds.x}px`;
      boundsElement.style.top = `${bounds.y}px`;
      boundsElement.style.width = `${bounds.width}px`;
      boundsElement.style.height = `${bounds.height}px`;

      return true;
    }

    getCanvasFont(font = {}, cssScale = 1) {
      const fontSize = Math.max(1, Number(font.size) || 72) * cssScale;
      const family = typeof font.family === "string" && font.family.trim()
        ? font.family.trim()
        : "Inter, Arial, sans-serif";
      const weight = font.weight || 700;
      const style = font.style === "italic" ? "italic" : "normal";

      return `${style} ${weight} ${fontSize}px ${family}`;
    }

    measureCanvasText(context, text, letterSpacing) {
      const characters = Array.from(String(text || ""));

      if (characters.length === 0) {
        return 0;
      }

      return characters.reduce((width, character, index) => {
        const spacing = index < characters.length - 1 ? letterSpacing : 0;

        return width + context.measureText(character).width + spacing;
      }, 0);
    }

    wrapCanvasText(context, text, width, letterSpacing) {
      return String(text || "").split(/\r?\n/);
    }

    drawCanvasTextLine(context, line, x, baseline, letterSpacing, strokeWidth) {
      let penX = x;

      Array.from(line).forEach((character, index) => {
        if (strokeWidth > 0) {
          context.strokeText(character, penX, baseline);
        }

        context.fillText(character, penX, baseline);
        penX += context.measureText(character).width;

        if (index < line.length - 1) {
          penX += letterSpacing;
        }
      });
    }

    createTextSourceCanvas(layer, width, height, cssScale, ratio) {
      const sourceCanvas = document.createElement("canvas");
      const context = sourceCanvas.getContext("2d");
      const font = layer.font || {};
      const style = layer.style || {};
      const fontSize = Math.max(1, Number(font.size) || 72) * cssScale;
      const lineHeight = fontSize * (Number.isFinite(style.lineHeight) && style.lineHeight > 0
        ? style.lineHeight
        : 1.15);
      const strokeWidth = Math.max(0, Number(style.strokeWidth) || 0) * cssScale;
      const letterSpacing = (Number.isFinite(style.letterSpacing) ? style.letterSpacing : 0) * cssScale;
      const align = ["center", "right"].includes(style.align) ? style.align : "left";

      sourceCanvas.width = Math.max(1, Math.ceil(width * ratio));
      sourceCanvas.height = Math.max(1, Math.ceil(height * ratio));

      if (!context) {
        return sourceCanvas;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.font = this.getCanvasFont(font, cssScale);
      context.textBaseline = "alphabetic";
      context.lineJoin = "round";
      context.miterLimit = 2;
      context.fillStyle = this.rgbaToCss(style.fillColor, [1, 1, 1, 1]);
      context.strokeStyle = this.rgbaToCss(style.strokeColor, [0, 0, 0, 1]);
      context.lineWidth = strokeWidth;

      const lines = this.wrapCanvasText(context, layer.text || "", width, letterSpacing);
      const metrics = context.measureText("Mg");
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;

      lines.forEach((line, lineIndex) => {
        const lineWidth = this.measureCanvasText(context, line, letterSpacing);
        let x = 0;

        if (align === "center") {
          x = (width - lineWidth) * 0.5;
        } else if (align === "right") {
          x = width - lineWidth;
        }

        this.drawCanvasTextLine(
          context,
          line,
          x,
          ascent + lineIndex * lineHeight,
          letterSpacing,
          strokeWidth,
        );
      });

      return sourceCanvas;
    }

    lerpPoint(a, b, t) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }

    cubicPoint(a, b, c, d, t) {
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;

      return {
        x: a.x * mt2 * mt + b.x * 3 * mt2 * t + c.x * 3 * mt * t2 + d.x * t2 * t,
        y: a.y * mt2 * mt + b.y * 3 * mt2 * t + c.y * 3 * mt * t2 + d.y * t2 * t,
      };
    }

    normalizeWarpGeometry(warp, width, height) {
      const points = {};
      const handles = {};
      const defaultWarp = {
        points: {
          topLeft: { x: 0, y: 0 },
          topCenter: { x: 0.5, y: 0 },
          topRight: { x: 1, y: 0 },
          bottomLeft: { x: 0, y: 1 },
          bottomCenter: { x: 0.5, y: 1 },
          bottomRight: { x: 1, y: 1 },
        },
        handles: {
          topIn: { x: 0.35, y: 0 },
          topOut: { x: 0.65, y: 0 },
          bottomIn: { x: 0.35, y: 1 },
          bottomOut: { x: 0.65, y: 1 },
        },
      };
      const toPoint = (point, fallback) => ({
        x: (Number.isFinite(point?.x) ? point.x : fallback.x) * width,
        y: (Number.isFinite(point?.y) ? point.y : fallback.y) * height,
      });

      Object.entries(defaultWarp.points).forEach(([key, fallback]) => {
        points[key] = toPoint(warp?.points?.[key], fallback);
      });

      Object.entries(defaultWarp.handles).forEach(([key, fallback]) => {
        handles[key] = toPoint(warp?.handles?.[key], fallback);
      });

      return { points, handles };
    }

    sampleWarpEdge(geometry, edge, t) {
      const { points, handles } = geometry;
      const isTop = edge === "top";
      const left = points[isTop ? "topLeft" : "bottomLeft"];
      const center = points[isTop ? "topCenter" : "bottomCenter"];
      const right = points[isTop ? "topRight" : "bottomRight"];
      const handleIn = handles[isTop ? "topIn" : "bottomIn"];
      const handleOut = handles[isTop ? "topOut" : "bottomOut"];

      if (t <= 0.5) {
        return this.cubicPoint(
          left,
          this.lerpPoint(left, center, 0.35),
          handleIn,
          center,
          t * 2,
        );
      }

      return this.cubicPoint(
        center,
        handleOut,
        this.lerpPoint(center, right, 0.65),
        right,
        (t - 0.5) * 2,
      );
    }

    getWarpBounds(geometry) {
      const samples = [];

      for (let index = 0; index <= 48; index += 1) {
        const t = index / 48;

        samples.push(this.sampleWarpEdge(geometry, "top", t));
        samples.push(this.sampleWarpEdge(geometry, "bottom", t));
      }

      Object.values(geometry.handles).forEach((point) => samples.push(point));

      const bounds = samples.reduce((accumulator, point) => ({
        left: Math.min(accumulator.left, point.x),
        top: Math.min(accumulator.top, point.y),
        right: Math.max(accumulator.right, point.x),
        bottom: Math.max(accumulator.bottom, point.y),
      }), {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      });
      const padding = 18;

      return {
        x: Math.floor(bounds.left - padding),
        y: Math.floor(bounds.top - padding),
        width: Math.max(1, Math.ceil(bounds.right - bounds.left + padding * 2)),
        height: Math.max(1, Math.ceil(bounds.bottom - bounds.top + padding * 2)),
      };
    }

    getWarpCurvePath(geometry, edge) {
      const { points, handles } = geometry;
      const isTop = edge === "top";
      const left = points[isTop ? "topLeft" : "bottomLeft"];
      const center = points[isTop ? "topCenter" : "bottomCenter"];
      const right = points[isTop ? "topRight" : "bottomRight"];
      const handleIn = handles[isTop ? "topIn" : "bottomIn"];
      const handleOut = handles[isTop ? "topOut" : "bottomOut"];
      const leftControl = this.lerpPoint(left, center, 0.35);
      const rightControl = this.lerpPoint(center, right, 0.65);

      return [
        `M ${left.x} ${left.y}`,
        `C ${leftControl.x} ${leftControl.y} ${handleIn.x} ${handleIn.y} ${center.x} ${center.y}`,
        `C ${handleOut.x} ${handleOut.y} ${rightControl.x} ${rightControl.y} ${right.x} ${right.y}`,
      ].join(" ");
    }

    getWarpOutlinePath(geometry) {
      const points = [];

      for (let index = 0; index <= 28; index += 1) {
        points.push(this.sampleWarpEdge(geometry, "top", index / 28));
      }

      for (let index = 28; index >= 0; index -= 1) {
        points.push(this.sampleWarpEdge(geometry, "bottom", index / 28));
      }

      return points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .concat("Z")
        .join(" ");
    }

    renderWarpCanvas(canvas, layer, options = {}) {
      const width = Math.max(1, options.width || 1);
      const height = Math.max(1, options.height || 1);
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const geometry = this.normalizeWarpGeometry(layer.warp, width, height);
      const bounds = this.getWarpBounds(geometry);
      const cacheKey = JSON.stringify({
        bounds,
        cssScale: options.cssScale,
        font: layer.font,
        ratio,
        style: layer.style,
        text: layer.text,
        warp: layer.warp,
        width,
        height,
      });

      canvas.hidden = false;
      canvas.style.left = `${bounds.x}px`;
      canvas.style.top = `${bounds.y}px`;
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;

      if (canvas.dataset.renderKey !== cacheKey) {
        const context = canvas.getContext("2d");
        const sourceCanvas = this.createTextSourceCanvas(layer, width, height, options.cssScale || 1, ratio);
        const slices = Math.max(48, Math.ceil(width / 3));

        canvas.width = Math.max(1, Math.ceil(bounds.width * ratio));
        canvas.height = Math.max(1, Math.ceil(bounds.height * ratio));

        if (context) {
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          context.clearRect(0, 0, bounds.width, bounds.height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";

          for (let index = 0; index < slices; index += 1) {
            const u0 = index / slices;
            const u1 = (index + 1) / slices;
            const top0 = this.sampleWarpEdge(geometry, "top", u0);
            const top1 = this.sampleWarpEdge(geometry, "top", u1);
            const bottom0 = this.sampleWarpEdge(geometry, "bottom", u0);
            const bottom1 = this.sampleWarpEdge(geometry, "bottom", u1);
            const sx = Math.floor(sourceCanvas.width * u0);
            const sw = Math.max(1, Math.ceil(sourceCanvas.width * (u1 - u0)));
            const drawWidth = sw / ratio;
            const p0 = { x: top0.x - bounds.x, y: top0.y - bounds.y };
            const p1 = { x: top1.x - bounds.x, y: top1.y - bounds.y };
            const p2 = { x: bottom1.x - bounds.x, y: bottom1.y - bounds.y };
            const p3 = { x: bottom0.x - bounds.x, y: bottom0.y - bounds.y };
            const a = (p1.x - p0.x) / drawWidth;
            const b = (p1.y - p0.y) / drawWidth;
            const c = (p3.x - p0.x) / height;
            const d = (p3.y - p0.y) / height;

            context.save();
            context.beginPath();
            context.moveTo(p0.x, p0.y);
            context.lineTo(p1.x, p1.y);
            context.lineTo(p2.x, p2.y);
            context.lineTo(p3.x, p3.y);
            context.closePath();
            context.clip();
            context.transform(a, b, c, d, p0.x, p0.y);
            context.drawImage(sourceCanvas, sx, 0, sw, sourceCanvas.height, 0, 0, drawWidth, height);
            context.restore();
          }
        }

        canvas.dataset.renderKey = cacheKey;
      }

      return { bounds, geometry };
    }

    syncWarpControls(controls, state, options = {}) {
      if (!controls) {
        return;
      }

      const isVisible = options.visible === true;

      controls.hidden = !isVisible;
      controls.style.display = isVisible ? "" : "none";
      controls.dataset.layerId = options.layerId || "";

      if (!isVisible || !state?.geometry || !state?.bounds) {
        return;
      }

      const { bounds, geometry } = state;
      const { points, handles } = geometry;
      const setCircle = (selector, point) => {
        const circle = controls.querySelector(selector);

        if (!circle) {
          return;
        }

        circle.setAttribute("cx", String(point.x));
        circle.setAttribute("cy", String(point.y));
      };
      const setLine = (key, from, to) => {
        const line = controls.querySelector(`[data-warp-handle-line="${key}"]`);

        if (!line) {
          return;
        }

        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x));
        line.setAttribute("y2", String(to.y));
      };

      controls.style.left = `${bounds.x}px`;
      controls.style.top = `${bounds.y}px`;
      controls.style.width = `${bounds.width}px`;
      controls.style.height = `${bounds.height}px`;
      controls.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
      controls.querySelector('[data-warp-path="outline"]')?.setAttribute("d", this.getWarpOutlinePath(geometry));
      controls.querySelector('[data-warp-path="top"]')?.setAttribute("d", this.getWarpCurvePath(geometry, "top"));
      controls.querySelector('[data-warp-path="bottom"]')?.setAttribute("d", this.getWarpCurvePath(geometry, "bottom"));

      Object.entries(points).forEach(([key, point]) => {
        setCircle(`[data-warp-point="${key}"]`, point);
      });

      Object.entries(handles).forEach(([key, point]) => {
        setCircle(`[data-warp-handle="${key}"]`, point);
      });

      setLine("topIn", points.topCenter, handles.topIn);
      setLine("topOut", points.topCenter, handles.topOut);
      setLine("bottomIn", points.bottomCenter, handles.bottomIn);
      setLine("bottomOut", points.bottomCenter, handles.bottomOut);
    }

    cloneWarp(warp) {
      return JSON.parse(JSON.stringify(warp || {}));
    }

    getLocalDragDelta(element, deltaX, deltaY) {
      try {
        const matrix = new DOMMatrixReadOnly(window.getComputedStyle(element).transform);
        const inverse = matrix.inverse();
        const origin = new DOMPoint(0, 0).matrixTransform(inverse);
        const moved = new DOMPoint(deltaX, deltaY).matrixTransform(inverse);

        return {
          x: moved.x - origin.x,
          y: moved.y - origin.y,
        };
      } catch (error) {
        return { x: deltaX, y: deltaY };
      }
    }

    clampWarpValue(value) {
      return Math.min(3, Math.max(-2, value));
    }

    moveWarpPoint(warp, kind, key, deltaX, deltaY) {
      const targetMap = kind === "handle" ? warp.handles : warp.points;
      const target = targetMap?.[key];

      if (!target) {
        return;
      }

      target.x = this.clampWarpValue(target.x + deltaX);
      target.y = this.clampWarpValue(target.y + deltaY);

      if (kind !== "point") {
        return;
      }

      const linkedHandles = {
        topCenter: ["topIn", "topOut"],
        bottomCenter: ["bottomIn", "bottomOut"],
      }[key] || [];

      linkedHandles.forEach((handleKey) => {
        const handle = warp.handles?.[handleKey];

        if (!handle) {
          return;
        }

        handle.x = this.clampWarpValue(handle.x + deltaX);
        handle.y = this.clampWarpValue(handle.y + deltaY);
      });
    }

    handleWarpPointerDown(event) {
      const target = event.target?.closest?.("[data-warp-point], [data-warp-handle]");

      if (!target) {
        return;
      }

      const element = target.closest(".editor-vector-text-layer");
      const layerId = element?.dataset.layerId || "";
      const layer = namespace.documentLayerModel?.findEntryById?.(layerId);
      const key = target.dataset.warpPoint || target.dataset.warpHandle;
      const kind = target.dataset.warpPoint ? "point" : "handle";

      if (this.getTextTransformMode(layer) !== "DISTORT" || !key || !element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      this.activeWarpDrag = {
        pointerId: event.pointerId,
        layerId,
        kind,
        key,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWarp: this.cloneWarp(layer.warp),
        width: Math.max(1, parseFloat(element.style.width) || element.offsetWidth || 1),
        height: Math.max(1, parseFloat(element.style.height) || element.offsetHeight || 1),
      };
      target.setPointerCapture?.(event.pointerId);
    }

    handleWarpPointerMove(event) {
      const drag = this.activeWarpDrag;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const element = this.elementsByLayerId.get(drag.layerId);

      if (!element) {
        return;
      }

      event.preventDefault();

      const delta = this.getLocalDragDelta(
        element,
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
      );
      const nextWarp = this.cloneWarp(drag.startWarp);

      this.moveWarpPoint(
        nextWarp,
        drag.kind,
        drag.key,
        delta.x / drag.width,
        delta.y / drag.height,
      );
      namespace.documentLayerModel?.updateLayer?.(
        drag.layerId,
        { warp: nextWarp },
        { source: "text-warp-drag" },
      );
    }

    handleWarpPointerEnd(event) {
      if (!this.activeWarpDrag || this.activeWarpDrag.pointerId !== event.pointerId) {
        return;
      }

      this.activeWarpDrag = null;
    }

    getTextTransformMode(layer) {
      const mode = String(layer?.warp?.mode || "").trim().toUpperCase();
      const allowedModes = ["CUSTOM", "DISTORT", "CIRCLE", "ANGLE", "ARCH", "RISE", "WAVE", "FLAG"];

      if (allowedModes.includes(mode)) {
        return mode;
      }

      return layer?.warp?.enabled === true ? "DISTORT" : "CUSTOM";
    }

    getWarpControlState(layer, width, height) {
      return {
        bounds: {
          x: 0,
          y: 0,
          width: Math.max(1, width),
          height: Math.max(1, height),
        },
        geometry: this.normalizeWarpGeometry(layer?.warp, width, height),
      };
    }

    shouldRenderTextPathCanvas(layer) {
      if (!this.textPathRenderer?.shouldUsePathCanvas?.(layer)) {
        return false;
      }

      return this.textPathRenderer.canRenderLayer(layer);
    }

    getTextVisualOutset(layer, cssScale) {
      const style = layer?.style || {};
      const shadow = layer?.shadow || {};
      const strokeOutset = Math.max(0, Number(style.strokeWidth) || 0) * cssScale * 0.5;
      const shadowOffset = Math.max(0, Number(shadow.offset) || 0) * cssScale;
      const shadowBlur = shadow.solid === false
        ? Math.max(0, Number(shadow.blur) || 0) * cssScale
        : 0;

      return strokeOutset + shadowOffset + shadowBlur;
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
        const visualElement = element.querySelector(".editor-vector-text-visual");
        const strokeElement = element.querySelector(".editor-vector-text-stroke");
        const fillElement = element.querySelector(".editor-vector-text-fill");
        const warpCanvas = element.querySelector(".editor-vector-text-warp-canvas");
        const warpControls = element.querySelector(".editor-text-warp-controls");
        const boundsElement = element.querySelector(".editor-vector-text-bounds");
        const fillColor = this.rgbaToCss(style.fillColor, [1, 1, 1, 1]);
        const isSelected = layer.id === activeLayerId;
        const isTextTransforming = isSelected && namespace.textTransformationActive === true;
        const textTransformMode = this.getTextTransformMode(layer);
        const isDistortMode = textTransformMode === "DISTORT";
        const isWarpEnabled = textTransformMode !== "CUSTOM";
        const shouldRenderPathCanvas = this.shouldRenderTextPathCanvas(layer);
        const layerOpacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
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
        const baseTextBounds = this.getBaseTextBounds(text, textStyles, screenWidth, screenHeight);
        const textFaceBounds = {
          inset: "auto",
          left: `${baseTextBounds.x}px`,
          top: `${baseTextBounds.y}px`,
          width: `${baseTextBounds.width}px`,
          height: `${baseTextBounds.height}px`,
        };

        activeIds.add(layer.id);
        element.classList.toggle("selected", isSelected);
        element.classList.toggle("transforming", isTextTransforming);
        element.classList.toggle("warped", isWarpEnabled);
        element.style.zIndex = String(index);
        element.style.opacity = "1";
        element.style.width = `${screenWidth}px`;
        element.style.height = `${screenHeight}px`;
        element.style.transformOrigin = `${anchorX * 100}% ${anchorY * 100}%`;
        element.style.transform = [
          `translate(${screenX}px, ${screenY}px)`,
          `rotate(${rotation}deg)`,
          `skew(${skewX}deg, ${skewY}deg)`,
          `scale(${scaleX}, ${scaleY})`,
        ].join(" ");

        if (visualElement) {
          visualElement.style.opacity = String(layerOpacity);
        }

        if (strokeElement) {
          strokeElement.hidden = shouldRenderPathCanvas || isDistortMode;
          strokeElement.textContent = text;
          this.syncTextFace(strokeElement, {
            ...textStyles,
            ...textFaceBounds,
            color: strokeColor,
            webkitTextFillColor: "transparent",
            webkitTextStroke: strokeWidth > 0 ? `${strokeWidth * cssScale}px ${strokeColor}` : "0 transparent",
          });
        }

        if (fillElement) {
          fillElement.hidden = shouldRenderPathCanvas || isDistortMode;
          fillElement.textContent = text;
          this.syncTextFace(fillElement, {
            ...textStyles,
            ...textFaceBounds,
            color: fillColor,
            webkitTextFillColor: fillColor,
            webkitTextStroke: "0 transparent",
          });
        }

        if (shouldRenderPathCanvas && warpCanvas) {
          const pathCanvasBounds = this.expandBounds(
            baseTextBounds,
            this.getTextVisualOutset(layer, cssScale),
          );

          this.textPathRenderer.render(warpCanvas, layer, {
            cssScale,
            height: pathCanvasBounds.height,
            layout: {
              x: baseTextBounds.x - pathCanvasBounds.x,
              y: baseTextBounds.y - pathCanvasBounds.y,
            },
            left: pathCanvasBounds.x,
            top: pathCanvasBounds.y,
            width: pathCanvasBounds.width,
          });

          this.syncWarpControls(warpControls, isDistortMode
            ? this.getWarpControlState(layer, screenWidth, screenHeight)
            : null, {
            layerId: layer.id,
            visible: isDistortMode && isTextTransforming,
          });
        } else if (isDistortMode && warpCanvas) {
          const warpState = this.renderWarpCanvas(warpCanvas, layer, {
            cssScale,
            height: screenHeight,
            width: screenWidth,
          });

          this.syncWarpControls(warpControls, warpState, {
            layerId: layer.id,
            visible: isTextTransforming,
          });
        } else {
          if (warpCanvas) {
            warpCanvas.hidden = true;
            warpCanvas.dataset.renderKey = "";
          }

          this.syncWarpControls(warpControls, null, {
            layerId: layer.id,
            visible: false,
          });
        }

        if (boundsElement) {
          boundsElement.hidden = !isSelected || isTextTransforming || isDistortMode;

          if (isSelected && !isTextTransforming && !isDistortMode) {
            this.syncBoundsElement(boundsElement, baseTextBounds);
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
      this.overlay.removeEventListener("pointerdown", this.handleWarpPointerDown);
      window.removeEventListener("pointermove", this.handleWarpPointerMove);
      window.removeEventListener("pointerup", this.handleWarpPointerEnd);
      window.removeEventListener("pointercancel", this.handleWarpPointerEnd);
      this.elementsByLayerId.clear();
      this.overlay.remove();
      this.measureRoot?.remove();
      this.measureRoot = null;
    }
  }

  namespace.VectorOverlayRenderer = VectorOverlayRenderer;
})(window.CBO = window.CBO || {});
