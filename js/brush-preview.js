window.CBO = window.CBO || {};

(function registerBrushPreview(namespace) {
  const StrokeMath = namespace.StrokeMath;
  const BrushDefaults = namespace.BrushDefaults;
  const cache = new Map();
  const queue = [];
  const pendingKeys = new WeakMap();
  const maxDpr = 2;
  const previewColor = { r: 223, g: 227, b: 234 };
  const previewColorHex = "#dfe3ea";
  const previewFixedRadius = 30;
  const thumbnailInternalSize = { width: 188, height: 52 };
  const previewsPerFrame = 1;
  const largeHashStringThreshold = 512;
  const hashStringEdgeLength = 96;
  const renderingModeFlowScale = Object.freeze({
    "light-glaze": 1,
    "uniform-glaze": 1,
    "intense-glaze": 1.2,
    "heavy-glaze": 1.4,
    "uniform-blending": 1.55,
    "intense-blending": 1.75,
  });
  let frameId = 0;
  let isProcessingQueue = false;
  let thumbnailRenderer = null;
  let thumbnailRendererUnavailable = false;
  let thumbnailBrushSettings = {};

  const hashKeys = [
    "color",
    "secondaryColor",
    "radius",
    "opacity",
    "minSizeRatio",
    "renderingMode",
    "flow",
    "hardness",
    "wetEdges",
    "burntEdges",
    "burntEdgesMode",
    "alphaThresholdEnabled",
    "alphaThreshold",
    "spacing",
    "spacingJitter",
    "jitterLateral",
    "jitterLinear",
    "fallOff",
    "velocityPressureEnabled",
    "taperStart",
    "taperEnd",
    "taperSize",
    "taperOpacity",
    "taperPressure",
    "taperMinDistance",
    "taperMinDistanceEnabled",
    "taperTip",
    "shapeRotation",
    "shapeScatter",
    "shapeCount",
    "shapeCountJitter",
    "shapeRandomized",
    "shapeFlipX",
    "shapeFlipY",
    "shapeAlphaSrc",
    "shapeAlphaName",
    "grainEnabled",
    "grainTextureSrc",
    "grainTextureName",
    "grainMode",
    "grainBlendMode",
    "grainRotation",
    "grainBrightness",
    "grainContrast",
    "grainTexturizedScale",
    "grainTexturizedDepth",
    "grainMovingMovement",
    "grainMovingScale",
    "grainMovingZoom",
    "grainMovingRotation",
    "grainMovingDepth",
    "grainMovingDepthMinimum",
    "grainMovingDepthJitter",
    "grainMovingOffsetJitter",
    "grainInvert",
    "wetDilution",
    "wetCharge",
    "wetAttack",
    "wetnessJitter",
    "streamLineAmount",
    "streamLinePressure",
    "stabilizationAmount",
    "smoothing",
    "stampColorHueJitter",
    "stampColorSaturationJitter",
    "stampColorLightnessJitter",
    "stampColorDarknessJitter",
    "stampColorSecondaryJitter",
    "strokeColorHueJitter",
    "strokeColorSaturationJitter",
    "strokeColorLightnessJitter",
    "strokeColorDarknessJitter",
    "strokeColorSecondaryJitter",
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function lerp(from, to, amount) {
    return from + (to - from) * clamp01(amount);
  }

  function normalizeSettings(settings = {}) {
    return BrushDefaults?.createSettings
      ? BrushDefaults.createSettings(settings)
      : { ...(settings || {}) };
  }

  function getVariantSize(variant) {
    if (variant === "sidebar") {
      return { width: 188, height: 42 };
    }

    return { width: 188, height: 52 };
  }

  function isMobilePerformanceMode() {
    return namespace.DocumentRenderer?.isMobileLikeEnvironment?.() === true;
  }

  function resolveSize(canvas, options = {}) {
    const fallback = getVariantSize(options.variant);
    const width = Math.max(1, Math.round(options.width || canvas.clientWidth || fallback.width));
    const height = Math.max(1, Math.round(options.height || canvas.clientHeight || fallback.height));
    const dprCap = isMobilePerformanceMode() ? 1 : maxDpr;
    const dpr = Math.max(1, Math.min(dprCap, window.devicePixelRatio || 1));

    return { width, height, dpr };
  }

  function stableHash(settings) {
    let hash = 2166136261;

    hashKeys.forEach((key) => {
      const value = getHashValueSignature(key, settings?.[key]);
      const pair = `${key}:${value};`;

      for (let index = 0; index < pair.length; index += 1) {
        hash ^= pair.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    });

    return (hash >>> 0).toString(36);
  }

  function getHashValueSignature(key, rawValue) {
    if (rawValue == null) {
      return "";
    }

    const value = String(rawValue);

    if (value.length <= largeHashStringThreshold) {
      return value;
    }

    const head = value.slice(0, hashStringEdgeLength);
    const tail = value.slice(-hashStringEdgeLength);

    return `${key}:large:${value.length}:${head}:${tail}`;
  }

  function createCacheKey(brushId, settings, size) {
    return `${brushId || "brush"}:${size.width}x${size.height}@${size.dpr}:${stableHash(settings)}`;
  }

  function ensureCanvasSize(canvas, size) {
    const pixelWidth = Math.max(1, Math.round(size.width * size.dpr));
    const pixelHeight = Math.max(1, Math.round(size.height * size.dpr));

    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth;
    }

    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight;
    }
  }

  function drawCached(canvas, cached, size) {
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    ensureCanvasSize(canvas, size);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cached, 0, 0, canvas.width, canvas.height);
  }

  function scheduleQueue() {
    if (frameId) {
      return;
    }

    frameId = window.requestAnimationFrame(processQueue);
  }

  function enqueue(job) {
    queue.push(job);
    scheduleQueue();
  }

  async function processQueue() {
    frameId = 0;

    if (isProcessingQueue) {
      return;
    }

    isProcessingQueue = true;

    try {
      let rendered = 0;
      while (queue.length > 0 && rendered < previewsPerFrame) {
        const job = queue.shift();

        if (!job.canvas.isConnected || pendingKeys.get(job.canvas) !== job.key) {
          continue;
        }

        try {
          await renderQueuedJob(job);
        } catch (error) {
          const fallback = renderToCanvas(job.settings, job.size);

          cache.set(job.key, fallback);
          if (job.canvas.isConnected && pendingKeys.get(job.canvas) === job.key) {
            drawCached(job.canvas, fallback, job.size);
          }
        }
        rendered += 1;
      }
    } finally {
      isProcessingQueue = false;
    }

    if (queue.length > 0) {
      scheduleQueue();
    }
  }

  async function renderQueuedJob(job) {
    let cached = cache.get(job.key);

    if (!cached) {
      cached = await renderToCanvasWithBestRenderer(job.settings, job.size);
      cache.set(job.key, cached);
    }

    if (!job.canvas.isConnected || pendingKeys.get(job.canvas) !== job.key) {
      return;
    }

    drawCached(job.canvas, cached, job.size);
  }

  function getThumbnailRenderer() {
    if (thumbnailRendererUnavailable || !namespace.BrushEngine || !namespace.DocumentRenderer || !document.body) {
      return null;
    }

    if (thumbnailRenderer) {
      return thumbnailRenderer;
    }

    const host = document.createElement("div");
    const canvas = document.createElement("canvas");

    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "-10000px";
    host.style.width = `${thumbnailInternalSize.width}px`;
    host.style.height = `${thumbnailInternalSize.height}px`;
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.style.overflow = "hidden";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);
    document.body.appendChild(host);

    let documentRenderer = null;

    try {
      const gl = namespace.DocumentRenderer.createContext(canvas);

      if (!gl) {
        throw new Error("WebGL2 non disponibile per il renderer thumbnail.");
      }

      const viewport = namespace.DocumentRenderer.resizeCanvasViewport(canvas, gl);

      documentRenderer = new namespace.DocumentRenderer({
        gl,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        isolateDocumentArtboards: true,
        transparentBackground: true,
        documentSizeCap: 512,
      });

      const engine = new namespace.BrushEngine(canvas, {
        gl,
        documentRenderer,
        getSettings: () => thumbnailBrushSettings,
        isolateDocumentArtboards: true,
        suppressCameraEvents: true,
        transparentBackground: true,
        singleStrokeMode: true,
        disableInput: true,
        disableNavigation: true,
        manualRender: true,
        documentSizeCap: 512,
      });

      thumbnailRenderer = { canvas, documentRenderer, engine, host };
      return thumbnailRenderer;
    } catch (error) {
      documentRenderer?.dispose?.();
      host.remove();
      thumbnailRendererUnavailable = true;
      return null;
    }
  }

  function getPreviewEngineSettings(settings) {
    const normalizedSettings = normalizeSettings({
      ...settings,
      color: previewColorHex,
      secondaryColor: previewColorHex,
      opacity: 1,
      radius: previewFixedRadius,
      size: previewFixedRadius,
    });

    return normalizedSettings;
  }

  function createSyntheticStrokeSamples(engine, settings) {
    const target = engine.getPaintTarget?.();
    const width = Math.max(1, target?.width || 512);
    const height = Math.max(1, target?.height || 142);
    const radius = Math.max(1, Number(settings.radius) || Number(settings.size) * 0.5 || 20);
    const margin = Math.min(width * 0.24, Math.max(width * 0.08, radius * 1.2));
    const startX = margin;
    const endX = Math.max(startX + 1, width - margin);
    const sampleCount = 44;
    const samples = [];

    for (let index = 0; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const x = startX + (endX - startX) * t;
      const y =
        height * 0.56 -
        Math.sin(t * Math.PI) * height * 0.12 +
        Math.sin(t * Math.PI * 2.1) * height * 0.035;

      samples.push({
        x,
        y,
        pressure: 1,
        tiltX: 0,
        tiltY: 0,
        time: index * 16,
        strokeSeed: 0x2dcb05,
      });
    }

    return samples;
  }

  async function renderWebglPreview(settings, size) {
    const renderer = getThumbnailRenderer();

    if (!renderer?.engine?.renderSyntheticStroke) {
      return null;
    }

    const output = document.createElement("canvas");
    const context = output.getContext("2d", { alpha: true });
    const engineSettings = getPreviewEngineSettings(settings);

    output.width = Math.max(1, Math.round(size.width * size.dpr));
    output.height = Math.max(1, Math.round(size.height * size.dpr));

    if (!context) {
      return null;
    }

    thumbnailBrushSettings = engineSettings;
    renderer.engine.setBrushState(engineSettings);
    await renderer.engine.waitForBrushAssets?.(engineSettings);
    const samples = createSyntheticStrokeSamples(renderer.engine, engineSettings);

    renderer.engine.renderSyntheticStroke(samples);

    if (window.createImageBitmap) {
      return window.createImageBitmap(renderer.canvas);
    }

    context.clearRect(0, 0, output.width, output.height);
    context.drawImage(renderer.canvas, 0, 0, output.width, output.height);

    return output;
  }

  async function renderToCanvasWithBestRenderer(settings, size) {
    if (isMobilePerformanceMode()) {
      return renderToCanvas(settings, size);
    }

    try {
      const webglCanvas = await renderWebglPreview(settings, size);

      if (webglCanvas) {
        return webglCanvas;
      }
    } catch (error) {
      thumbnailRendererUnavailable = true;
    }

    return renderToCanvas(settings, size);
  }

  function getPreviewRadius(settings, height) {
    const normalized = Math.sqrt(clamp(previewFixedRadius, 1, 120) / 120);

    return lerp(Math.max(3.5, height * 0.09), height * 0.34, normalized);
  }

  function getPathPoint(t, width, height) {
    const x = width * (0.08 + t * 0.84);
    const y = height * (0.6 - Math.sin(t * Math.PI) * 0.17 + Math.sin(t * Math.PI * 2.15) * 0.045);

    return { x, y };
  }

  function getPressure(t) {
    return 1;
  }

  function getPathLength(width, height) {
    let total = 0;
    let previous = getPathPoint(0, width, height);

    for (let index = 1; index <= 72; index += 1) {
      const point = getPathPoint(index / 72, width, height);

      total += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }

    return total;
  }

  function getFlow(settings) {
    const mode = String(settings.renderingMode || "light-glaze")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const scale = renderingModeFlowScale[mode] || 1;

    return clamp((Number(settings.flow) || 1) * scale, 0, 2);
  }

  function getStampAlpha(settings, alphaScale) {
    const opacity = Number.isFinite(Number(settings.opacity)) ? clamp01(settings.opacity) : 1;
    const flow = getFlow(settings);
    const flowAlpha = flow <= 1 ? lerp(0.36, 1, flow) : clamp(1 + (flow - 1) * 0.16, 1, 1.16);

    return clamp(opacity * flowAlpha * alphaScale, 0, 0.96);
  }

  function drawDab(context, point, radius, alpha, settings, randomState) {
    if (radius <= 0.2 || alpha <= 0.001) {
      return;
    }

    const hardness = clamp01(settings.hardness ?? 1);
    const wetEdges = clamp01(settings.wetEdges);
    const effectiveHardness = clamp(hardness * (1 - wetEdges * 0.55), 0.02, 0.98);
    const hardStop = clamp(effectiveHardness, 0.03, 0.96);
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    const color = `rgba(${previewColor.r}, ${previewColor.g}, ${previewColor.b}, ${alpha})`;

    gradient.addColorStop(0, color);
    gradient.addColorStop(hardStop, color);
    gradient.addColorStop(1, `rgba(${previewColor.r}, ${previewColor.g}, ${previewColor.b}, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();

    const burntEdges = clamp01(settings.burntEdges);

    if (burntEdges > 0) {
      context.strokeStyle = `rgba(14, 16, 20, ${alpha * burntEdges * 0.36})`;
      context.lineWidth = Math.max(0.7, radius * 0.12);
      context.beginPath();
      context.arc(point.x, point.y, radius * lerp(0.72, 0.92, randomUnit(randomState)), 0, Math.PI * 2);
      context.stroke();
    }
  }

  function randomUnit(state) {
    state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;

    return state.seed / 4294967296;
  }

  function randomSigned(state) {
    return randomUnit(state) * 2 - 1;
  }

  function getEffectiveShapeCount(settings, state) {
    const count = clamp(Math.round(Number(settings.shapeCount) || 1), 1, 16);
    const jitter = clamp01(settings.shapeCountJitter);

    if (jitter <= 0 || count <= 1) {
      return count;
    }

    const minCount = Math.max(1, Math.ceil(count * (1 - jitter)));

    return minCount + Math.floor(randomUnit(state) * (count - minCount + 1));
  }

  function drawPreviewStamp(context, point, pressure, alphaScale, settings, radius, totalLength, strokeState, randomState) {
    const taperFactor = StrokeMath?.getTaperFactor
      ? StrokeMath.getTaperFactor(strokeState.distance, totalLength, settings)
      : 1;
    const taperSize = clamp01(settings.taperSize ?? 1);
    const taperOpacity = clamp01(settings.taperOpacity);
    const taperPressure = clamp01(settings.taperPressure);
    const sizeScale = lerp(1 - taperSize, 1, taperFactor);
    const opacityScale = lerp(1 - taperOpacity, 1, taperFactor);
    const pressureScale = lerp(1 - taperPressure, 1, taperFactor);
    const minSizeRatio = clamp(settings.minSizeRatio ?? 0.15, 0, 1);
    const pressureSize = lerp(minSizeRatio, 1, clamp01(pressure * pressureScale));
    const baseAlpha = getStampAlpha(settings, alphaScale * opacityScale);
    const shapeCount = getEffectiveShapeCount(settings, randomState);
    const scatter = clamp(settings.shapeScatter, 0, 2);

    for (let index = 0; index < shapeCount; index += 1) {
      const offsetAmount = shapeCount > 1 ? radius * scatter * 0.08 : 0;
      const nextPoint = {
        x: point.x + randomSigned(randomState) * offsetAmount,
        y: point.y + randomSigned(randomState) * offsetAmount,
      };
      const countAlpha = baseAlpha / Math.sqrt(shapeCount);

      drawDab(context, nextPoint, radius * pressureSize * sizeScale, countAlpha, settings, randomState);
    }
  }

  function applyPreviewGrain(canvas, context, settings, dpr) {
    if (settings.grainEnabled !== true) {
      return;
    }

    const depth = settings.grainMode === "moving"
      ? clamp01(settings.grainMovingDepth ?? 1)
      : clamp01(settings.grainTexturizedDepth ?? settings.grainStrength ?? 1);

    if (depth <= 0) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const scale = settings.grainMode === "moving"
      ? clamp01(settings.grainMovingScale ?? 1)
      : clamp01(settings.grainTexturizedScale ?? 1);
    const cellSize = Math.max(1, Math.round(lerp(16, 3, scale) * dpr));
    const inverted = settings.grainInvert === true;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;

        if (data[offset + 3] <= 0) {
          continue;
        }

        let grain = hashNoise(Math.floor(x / cellSize), Math.floor(y / cellSize));

        if (inverted) {
          grain = 1 - grain;
        }

        const factor = lerp(1, lerp(0.52, 1.14, grain), depth);

        data[offset] = clamp(data[offset] * factor, 0, 255);
        data[offset + 1] = clamp(data[offset + 1] * factor, 0, 255);
        data[offset + 2] = clamp(data[offset + 2] * factor, 0, 255);
        data[offset + 3] = clamp(data[offset + 3] * lerp(1, lerp(0.62, 1.08, grain), depth), 0, 255);
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  function hashNoise(x, y) {
    let seed = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519);

    seed ^= seed >>> 13;
    seed = Math.imul(seed, 1274126177);
    seed ^= seed >>> 16;

    return (seed >>> 0) / 4294967296;
  }

  function renderToCanvas(rawSettings, size) {
    const settings = normalizeSettings(rawSettings);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: settings.grainEnabled === true,
    });
    const pixelWidth = Math.max(1, Math.round(size.width * size.dpr));
    const pixelHeight = Math.max(1, Math.round(size.height * size.dpr));

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    if (!context || !StrokeMath?.createStrokeState || !StrokeMath?.drawStrokeSegment) {
      return canvas;
    }

    context.scale(size.dpr, size.dpr);
    context.clearRect(0, 0, size.width, size.height);

    const radius = getPreviewRadius(settings, size.height);
    const totalLength = getPathLength(size.width, size.height);
    const previewSettings = {
      ...settings,
      radius,
      taperMinDistanceEnabled: true,
      taperMinDistance: Math.max(8, Math.min(totalLength * 0.36, size.width * 0.38)),
    };
    const startPoint = getPathPoint(0, size.width, size.height);
    const strokeState = StrokeMath.createStrokeState(startPoint, {
      pressure: getPressure(0),
      seed: 0x2dcb05,
      tool: "brush",
    });
    const randomState = { seed: 0x7f4a7c15 };

    drawPreviewStamp(context, startPoint, getPressure(0), 1, previewSettings, radius, totalLength, strokeState, randomState);

    for (let index = 1; index <= 56; index += 1) {
      const t = index / 56;
      const point = getPathPoint(t, size.width, size.height);

      StrokeMath.drawStrokeSegment({
        to: point,
        state: strokeState,
        settings: previewSettings,
        radius,
        pressure: getPressure(t),
        bounds: {
          minX: 0,
          minY: 0,
          maxX: size.width,
          maxY: size.height,
        },
        forceFinalDab: index === 56,
        drawDab: (dabPoint, pressure, fallOffScale) => {
          drawPreviewStamp(
            context,
            dabPoint,
            pressure,
            fallOffScale,
            previewSettings,
            radius,
            totalLength,
            strokeState,
            randomState,
          );
        },
      });
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    applyPreviewGrain(canvas, context, previewSettings, size.dpr);

    return canvas;
  }

  function render(canvas, brushId, settings, options = {}) {
    if (!canvas) {
      return;
    }

    const normalizedSettings = normalizeSettings(settings);
    const size = resolveSize(canvas, options);
    const key = createCacheKey(brushId, normalizedSettings, size);
    const cached = cache.get(key);

    pendingKeys.set(canvas, key);

    if (cached) {
      drawCached(canvas, cached, size);
      return;
    }

    enqueue({
      canvas,
      key,
      settings: normalizedSettings,
      size,
    });
  }

  function invalidate(brushId = "") {
    if (!brushId) {
      cache.clear();
      return;
    }

    const prefix = `${brushId}:`;

    Array.from(cache.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    });
  }

  namespace.BrushPreview = {
    invalidate,
    render,
  };
})(window.CBO);
