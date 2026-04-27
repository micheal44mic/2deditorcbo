(function registerTextPathRenderer(namespace) {
  const FONT_URLS = {
    roboto: "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Black.ttf",
    oswald: "https://cdn.jsdelivr.net/gh/googlefonts/OswaldFont@main/fonts/ttf/Oswald-Bold.ttf",
  };
  const TRANSFORM_MODES = ["CUSTOM", "DISTORT", "CIRCLE", "ANGLE", "ARCH", "RISE", "WAVE", "FLAG"];
  const PARAMETRIC_MODES = ["ARCH", "WAVE", "FLAG", "ANGLE", "RISE", "CIRCLE"];
  const FLATTEN_STEP = 4;

  function loadScriptOnce(src, dataAttribute, globalName) {
    if (globalName && window[globalName]) {
      return Promise.resolve();
    }

    const existingScript = document.querySelector(`[${dataAttribute}]`);

    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = src;
      script.async = true;
      script.setAttribute(dataAttribute, "");
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`${src} failed to load`)), {
        once: true,
      });
      document.head.append(script);
    });
  }

  class TextPathRenderer {
    constructor(options = {}) {
      this.fontUrls = {
        ...FONT_URLS,
        ...(options.fontUrls || {}),
      };
      this.fonts = {};
      this.readyPromise = null;
      this.status = "idle";
      this.ensureReady();
    }

    ensureReady() {
      if (this.readyPromise) {
        return this.readyPromise;
      }

      this.status = "loading";
      this.readyPromise = loadScriptOnce(
        "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js",
        "data-opentype-loader",
        "opentype",
      )
        .then(() => this.loadFonts())
        .then(() => {
          this.status = "ready";
          namespace.brushEngine?.draw?.();
        })
        .catch((error) => {
          this.status = "error";
          console.warn("Unable to load vector text fonts.", error);
          namespace.brushEngine?.draw?.();
        });

      return this.readyPromise;
    }

    async loadFonts() {
      const entries = await Promise.all(
        Object.entries(this.fontUrls).map(async ([key, url]) => {
          try {
            const response = await fetch(url);

            if (!response.ok) {
              throw new Error(`Font request failed: ${response.status}`);
            }

            const buffer = await response.arrayBuffer();

            return [key, window.opentype.parse(buffer.slice(0))];
          } catch (error) {
            console.warn(`Unable to load ${key} vector font.`, error);
            return [key, null];
          }
        }),
      );

      entries.forEach(([key, font]) => {
        this.fonts[key] = font;
      });
    }

    getFontKey(font = {}) {
      const key = String(font.key || "").trim().toLowerCase();

      if (this.fonts[key]) {
        return key;
      }

      const family = String(font.family || "").toLowerCase();

      if (family.includes("oswald") && this.fonts.oswald) {
        return "oswald";
      }

      return this.fonts.roboto ? "roboto" : Object.keys(this.fonts).find((nextKey) => this.fonts[nextKey]) || "";
    }

    getFont(font = {}) {
      return this.fonts[this.getFontKey(font)] || null;
    }

    canRenderLayer(layer) {
      if (!String(layer?.text || "").trim()) {
        return false;
      }

      if (this.status !== "ready") {
        this.ensureReady();
        return false;
      }

      return Boolean(this.getFont(layer.font));
    }

    normalizeMode(warp = {}) {
      const mode = String(warp.mode || "").trim().toUpperCase();

      if (TRANSFORM_MODES.includes(mode)) {
        return mode;
      }

      return warp.enabled === true ? "DISTORT" : "CUSTOM";
    }

    isParametricMode(mode) {
      return PARAMETRIC_MODES.includes(mode);
    }

    shouldUsePathCanvas(layer) {
      const mode = this.normalizeMode(layer?.warp);
      const shadow = layer?.shadow || {};
      const strokeWidth = Number(layer?.style?.strokeWidth) || 0;
      const hasShadow = (Number(shadow.offset) || 0) > 0 || (shadow.solid === false && (Number(shadow.blur) || 0) > 0);

      return mode !== "CUSTOM" || hasShadow || strokeWidth > 0;
    }

    render(canvas, layer, options = {}) {
      if (!canvas || !this.canRenderLayer(layer)) {
        return false;
      }

      const font = this.getFont(layer.font);
      const width = Math.max(1, options.width || 1);
      const height = Math.max(1, options.height || 1);
      const left = Number.isFinite(options.left) ? options.left : 0;
      const top = Number.isFinite(options.top) ? options.top : 0;
      const layout = options.layout && typeof options.layout === "object"
        ? {
          x: Number.isFinite(options.layout.x) ? options.layout.x : null,
          y: Number.isFinite(options.layout.y) ? options.layout.y : null,
        }
        : null;
      const cssScale = Math.max(0.000001, Number(options.cssScale) || 1);
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const style = layer.style || {};
      const shadow = layer.shadow || {};
      const mode = this.normalizeMode(layer.warp);
      const state = {
        amount: Number.isFinite(layer.warp?.amount) ? layer.warp.amount : 0.5,
        borderColor: this.rgbaToCss(style.strokeColor, [0, 0, 0, 1]),
        borderWeight: Math.max(0, Number(style.strokeWidth) || 0) * cssScale,
        fillColor: this.rgbaToCss(style.fillColor, [1, 1, 1, 1]),
        fontSize: Math.max(1, Number(layer.font?.size) || 163) * cssScale,
        mode,
        shadow: {
          solid: shadow.solid !== false,
          color: this.rgbaToCss(shadow.color, [0.859, 0.102, 0.353, 1]),
          offset: Math.max(0, Number(shadow.offset) || 0) * cssScale,
          angle: Number.isFinite(shadow.angle) ? shadow.angle : 45,
          blur: Math.max(0, Number(shadow.blur) || 0) * cssScale,
        },
      };
      const cacheKey = JSON.stringify({
        fontKey: this.getFontKey(layer.font),
        height,
        layout,
        ratio,
        state,
        text: layer.text,
        warp: layer.warp,
        width,
      });

      canvas.hidden = false;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (canvas.dataset.renderKey === cacheKey) {
        return true;
      }

      canvas.width = Math.max(1, Math.ceil(width * ratio));
      canvas.height = Math.max(1, Math.ceil(height * ratio));

      const context = canvas.getContext("2d");

      if (!context) {
        return false;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      const geometry = this.createGeometry(font, layer.text, state.fontSize);

      if (!geometry) {
        canvas.dataset.renderKey = cacheKey;
        return true;
      }

      const path = this.createRenderedPath(geometry, state, layer.warp, width, height, layout);

      this.drawShadowLayer(context, path, state);

      context.save();
      context.lineJoin = "round";
      context.lineCap = "round";
      context.miterLimit = 2;
      context.fillStyle = state.fillColor;
      context.strokeStyle = state.borderColor;
      context.lineWidth = state.borderWeight;

      if (state.borderWeight > 0) {
        context.stroke(path);
      }

      context.fill(path);
      context.restore();
      canvas.dataset.renderKey = cacheKey;

      return true;
    }

    createGeometry(font, text, fontSize) {
      if (!font || !String(text || "").trim()) {
        return null;
      }

      const path = font.getPath(String(text), 0, 0, fontSize);
      const bbox = path.getBoundingBox();
      const width = Math.max(1, bbox.x2 - bbox.x1);
      const height = Math.max(1, bbox.y2 - bbox.y1);
      const points = this.flattenOpenTypePath(path).map((point) => {
        if (point.type === "Z") {
          return point;
        }

        return {
          ...point,
          origX: point.x,
          origY: point.y,
          u: Math.min(1, Math.max(0, (point.x - bbox.x1) / width)),
          v: Math.min(1, Math.max(0, (point.y - bbox.y1) / height)),
        };
      });

      return {
        bbox: {
          x1: bbox.x1,
          y1: bbox.y1,
          x2: bbox.x2,
          y2: bbox.y2,
        },
        points,
      };
    }

    distance(pointA, pointB) {
      return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
    }

    addFlattenedLine(points, pointA, pointB) {
      const steps = Math.max(1, Math.ceil(this.distance(pointA, pointB) / FLATTEN_STEP));

      for (let index = 1; index <= steps; index += 1) {
        const t = index / steps;

        points.push({
          type: "L",
          x: pointA.x + (pointB.x - pointA.x) * t,
          y: pointA.y + (pointB.y - pointA.y) * t,
        });
      }
    }

    getQuadraticPoint(t, p0, p1, p2) {
      const mt = 1 - t;

      return {
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
      };
    }

    getCubicPoint(t, p0, p1, p2, p3) {
      const mt = 1 - t;

      return {
        x:
          mt * mt * mt * p0.x +
          3 * mt * mt * t * p1.x +
          3 * mt * t * t * p2.x +
          t * t * t * p3.x,
        y:
          mt * mt * mt * p0.y +
          3 * mt * mt * t * p1.y +
          3 * mt * t * t * p2.y +
          t * t * t * p3.y,
      };
    }

    addFlattenedQuadratic(points, p0, p1, p2) {
      const estimatedLength = this.distance(p0, p1) + this.distance(p1, p2);
      const steps = Math.max(6, Math.min(80, Math.ceil(estimatedLength / FLATTEN_STEP)));

      for (let index = 1; index <= steps; index += 1) {
        points.push({
          type: "L",
          ...this.getQuadraticPoint(index / steps, p0, p1, p2),
        });
      }
    }

    addFlattenedCubic(points, p0, p1, p2, p3) {
      const estimatedLength = this.distance(p0, p1) + this.distance(p1, p2) + this.distance(p2, p3);
      const steps = Math.max(8, Math.min(100, Math.ceil(estimatedLength / FLATTEN_STEP)));

      for (let index = 1; index <= steps; index += 1) {
        points.push({
          type: "L",
          ...this.getCubicPoint(index / steps, p0, p1, p2, p3),
        });
      }
    }

    flattenOpenTypePath(path) {
      const points = [];
      let currentPoint = { x: 0, y: 0 };
      let contourStart = null;

      path.commands.forEach((command) => {
        if (command.type === "M") {
          currentPoint = { x: command.x, y: command.y };
          contourStart = currentPoint;
          points.push({ type: "M", ...currentPoint });
          return;
        }

        if (command.type === "L") {
          const nextPoint = { x: command.x, y: command.y };

          this.addFlattenedLine(points, currentPoint, nextPoint);
          currentPoint = nextPoint;
          return;
        }

        if (command.type === "Q") {
          const controlPoint = { x: command.x1, y: command.y1 };
          const nextPoint = { x: command.x, y: command.y };

          this.addFlattenedQuadratic(points, currentPoint, controlPoint, nextPoint);
          currentPoint = nextPoint;
          return;
        }

        if (command.type === "C") {
          const firstControlPoint = { x: command.x1, y: command.y1 };
          const secondControlPoint = { x: command.x2, y: command.y2 };
          const nextPoint = { x: command.x, y: command.y };

          this.addFlattenedCubic(points, currentPoint, firstControlPoint, secondControlPoint, nextPoint);
          currentPoint = nextPoint;
          return;
        }

        if (command.type === "Z") {
          points.push({ type: "Z" });

          if (contourStart) {
            currentPoint = contourStart;
          }
        }
      });

      return points;
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

      return {
        points: Object.fromEntries(
          Object.entries(defaultWarp.points).map(([key, fallback]) => [
            key,
            toPoint(warp?.points?.[key], fallback),
          ]),
        ),
        handles: Object.fromEntries(
          Object.entries(defaultWarp.handles).map(([key, fallback]) => [
            key,
            toPoint(warp?.handles?.[key], fallback),
          ]),
        ),
      };
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

    getGeometryMetrics(geometry, width, height, layout = null) {
      const textWidth = Math.max(1, geometry.bbox.x2 - geometry.bbox.x1);
      const textHeight = Math.max(1, geometry.bbox.y2 - geometry.bbox.y1);
      const layoutX = Number.isFinite(layout?.x) ? layout.x : (width - textWidth) / 2;
      const layoutY = Number.isFinite(layout?.y) ? layout.y : (height - textHeight) / 2;
      const offsetX = layoutX - geometry.bbox.x1;
      const offsetY = layoutY - geometry.bbox.y1;

      return { textWidth, textHeight, offsetX, offsetY, layoutX, layoutY };
    }

    mapNormalPoint(point, geometry, width, height, layout = null) {
      const { offsetX, offsetY } = this.getGeometryMetrics(geometry, width, height, layout);

      return {
        x: point.origX + offsetX,
        y: point.origY + offsetY,
      };
    }

    mapDistortedPoint(point, warp, width, height) {
      const geometry = this.normalizeWarpGeometry(warp, width, height);
      const topPoint = this.sampleWarpEdge(geometry, "top", point.u);
      const bottomPoint = this.sampleWarpEdge(geometry, "bottom", point.u);

      return {
        x: topPoint.x * (1 - point.v) + bottomPoint.x * point.v,
        y: topPoint.y * (1 - point.v) + bottomPoint.y * point.v,
      };
    }

    mapParametricPoint(point, geometry, state, width, height, layout = null) {
      const { textWidth, textHeight, offsetX, offsetY, layoutX, layoutY } = this.getGeometryMetrics(
        geometry,
        width,
        height,
        layout,
      );
      const baseX = point.origX + offsetX;
      const baseY = point.origY + offsetY;
      const amount = state.amount;

      if (state.mode === "ARCH") {
        return {
          x: baseX,
          y: baseY - Math.sin(point.u * Math.PI) * textWidth * 0.3 * amount,
        };
      }

      if (state.mode === "WAVE") {
        return {
          x: baseX,
          y: baseY - Math.sin(point.u * Math.PI * 4) * textWidth * 0.1 * amount,
        };
      }

      if (state.mode === "FLAG") {
        return {
          x: baseX,
          y: baseY - Math.sin(point.u * Math.PI * 2) * textWidth * 0.1 * amount,
        };
      }

      if (state.mode === "ANGLE") {
        return {
          x: baseX,
          y: baseY + (point.u - 0.5) * textWidth * 0.5 * amount,
        };
      }

      if (state.mode === "RISE") {
        return {
          x: baseX,
          y: baseY - (1 - Math.cos((point.u * Math.PI) / 2)) * textWidth * 0.4 * amount,
        };
      }

      if (state.mode === "CIRCLE") {
        if (Math.abs(amount) < 0.01) {
          return { x: baseX, y: baseY };
        }

        const maxAngle = amount * Math.PI * 2;
        const radiusCenter = textWidth / Math.abs(maxAngle);
        const sign = Math.sign(amount);
        const radius = radiusCenter - (point.v - 0.5) * textHeight * sign;
        const angle = (point.u - 0.5) * maxAngle - (Math.PI / 2) * sign;

        return {
          x: layoutX + textWidth / 2 + radius * Math.cos(angle),
          y: layoutY + textHeight / 2 + radiusCenter * sign + radius * Math.sin(angle),
        };
      }

      return { x: baseX, y: baseY };
    }

    mapRenderedPoint(point, geometry, state, warp, width, height, layout = null) {
      if (state.mode === "DISTORT") {
        return this.mapDistortedPoint(point, warp, width, height);
      }

      if (this.isParametricMode(state.mode)) {
        return this.mapParametricPoint(point, geometry, state, width, height, layout);
      }

      return this.mapNormalPoint(point, geometry, width, height, layout);
    }

    createRenderedPath(geometry, state, warp, width, height, layout = null) {
      const path = new Path2D();

      geometry.points.forEach((point) => {
        if (point.type === "Z") {
          path.closePath();
          return;
        }

        const renderedPoint = this.mapRenderedPoint(point, geometry, state, warp, width, height, layout);

        if (point.type === "M") {
          path.moveTo(renderedPoint.x, renderedPoint.y);
        } else {
          path.lineTo(renderedPoint.x, renderedPoint.y);
        }
      });

      return path;
    }

    drawTranslatedPath(context, path, dx, dy, state) {
      context.save();
      context.translate(dx, dy);
      context.fillStyle = state.shadow.color;
      context.strokeStyle = state.shadow.color;
      context.lineWidth = state.borderWeight;
      context.lineJoin = "round";
      context.lineCap = "round";

      if (state.borderWeight > 0) {
        context.stroke(path);
      }

      context.fill(path);
      context.restore();
    }

    drawShadowLayer(context, path, state) {
      const shouldDrawShadow =
        state.shadow.offset > 0 || (!state.shadow.solid && state.shadow.blur > 0);

      if (!shouldDrawShadow) {
        return;
      }

      const radians = (state.shadow.angle * Math.PI) / 180;
      const dx = Math.cos(radians) * state.shadow.offset;
      const dy = Math.sin(radians) * state.shadow.offset;

      if (state.shadow.solid) {
        const steps = Math.max(1, Math.ceil(state.shadow.offset));

        for (let index = 1; index <= steps; index += 1) {
          this.drawTranslatedPath(
            context,
            path,
            (index / steps) * dx,
            (index / steps) * dy,
            state,
          );
        }
        return;
      }

      context.save();

      if ("filter" in context && state.shadow.blur > 0) {
        context.filter = `blur(${state.shadow.blur}px)`;
      }

      this.drawTranslatedPath(context, path, dx, dy, state);
      context.restore();
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
  }

  namespace.TextPathRenderer = TextPathRenderer;
})(window.CBO = window.CBO || {});
