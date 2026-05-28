(function registerBrushEngineSampler(namespace) {
  namespace.BrushEngineMixins = namespace.BrushEngineMixins || {};

  function defineBrushEngineMethods(BrushEngine, methods) {
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(BrushEngine.prototype, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  namespace.BrushEngineMixins.sampler = function installBrushEngineSampler(BrushEngine, internals) {
    const {
      MIN_ZOOM,
      MAX_ZOOM,
      WHEEL_ZOOM_INTENSITY,
      PINCH_ZOOM_INTENSITY,
      ANDROID_PINCH_ZOOM_STEP_MIN,
      ANDROID_PINCH_ZOOM_STEP_MAX,
      TOUCH_NAVIGATION_STALE_POINTER_MS,
      CROPPED_BRUSH_STROKES,
      STROKE_ALLOCATION_QUANTUM,
      STROKE_FINAL_PADDING,
      STROKE_SAMPLE_CLAMP_MIN_PADDING,
      STROKE_PREVIEW_DIRTY_TILE_SIZE,
      STROKE_PREVIEW_DIRTY_MAX_RECTS,
      STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE,
      STROKE_TARGET_PREWARM_MAX_TILES,
      PREVIEW_DIRTY_DEBUG_EVENT,
      ERASER_EMPTY_LAYER_TOAST_MS,
      ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS,
      MAX_STAMPS_PER_FLUSH,
      MOBILE_MAX_STAMPS_PER_FLUSH,
      ANDROID_MAX_STAMPS_PER_FLUSH,
      DESKTOP_POINTER_SAMPLES_PER_FRAME,
      MOBILE_POINTER_SAMPLES_PER_FRAME,
      ANDROID_POINTER_SAMPLES_PER_FRAME,
      DESKTOP_POINTER_FRAME_BUDGET_MS,
      MOBILE_POINTER_FRAME_BUDGET_MS,
      ANDROID_POINTER_FRAME_BUDGET_MS,
      POINTER_SAMPLE_BACKLOG_MULTIPLIER,
      DESKTOP_STROKE_SEGMENT_MIN_SAMPLES,
      MOBILE_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MIN_SAMPLES,
      ANDROID_STROKE_SEGMENT_MAX_SAMPLES,
      ANDROID_STROKE_SEGMENT_DISTANCE_STEP,
      ANDROID_STROKE_ALLOCATION_QUANTUM,
      BRUSH_HISTORY_BATCH_IDLE_MS,
      RASTER_BYTES_PER_PIXEL,
      RASTER_MIB,
      STROKE_MEMORY_POLICY,
      STROKE_SCRATCH_SOFT_EVICT_BYTES,
      STROKE_SCRATCH_HARD_WARN_BYTES,
      STROKE_SCRATCH_TOP_RESOURCE_LIMIT,
      STROKE_INCREMENTAL_BAKE_ENABLED,
      STROKE_INCREMENTAL_BAKE_COVERAGE,
      STROKE_INCREMENTAL_BAKE_SAFE_BUILDUP,
      VELOCITY_PRESSURE_MAX_SPEED,
      VELOCITY_PRESSURE_SMOOTHING,
      RENDERING_MODE_PRESETS,
      STROKE_BUILDUP_EPSILON,
      STROKE_RENDER_MODE_PLATEAU,
      STROKE_RENDER_MODE_ACCUM,
      STROKE_RENDER_MODE_MIXED,
      COLOR_GOLDEN_RATIO,
    } = internals;
    const ADAPTIVE_SPACING_MIN_FRACTION = 0.01;
    const ADAPTIVE_SPACING_MIN_ZOOM = 0.1;
    const ADAPTIVE_BRUSH_SPACING_DESKTOP = Object.freeze({
      full: 2800,
      maxMultiplier: 2.25,
      maxTotalMultiplier: 3,
      simpleMaxTotalMultiplier: 1.45,
      smoothing: 0.35,
      start: 650,
    });
    const ADAPTIVE_BRUSH_SPACING_MOBILE = Object.freeze({
      full: 1700,
      maxMultiplier: 2.75,
      maxTotalMultiplier: 3.5,
      simpleMaxTotalMultiplier: 1.7,
      smoothing: 0.45,
      start: 380,
    });
    const ADAPTIVE_ERASER_SPACING_DESKTOP = Object.freeze({
      full: 3200,
      maxMultiplier: 1.35,
      maxTotalMultiplier: 1.75,
      smoothing: 0.28,
      start: 900,
    });
    const ADAPTIVE_ERASER_SPACING_MOBILE = Object.freeze({
      full: 2200,
      maxMultiplier: 1.5,
      maxTotalMultiplier: 2,
      smoothing: 0.35,
      start: 650,
    });

    defineBrushEngineMethods(BrushEngine, {
    createSeededUnit(seed) {
      const nextSeed = (Math.imul((seed || 1) >>> 0, 1664525) + 1013904223) >>> 0;

      return nextSeed / 4294967296;
    }
,

    createStableStrokeUnit(salt) {
      return this.createSeededUnit(((this.strokeInitialSeed || 1) ^ (salt || 0)) >>> 0);
    }
,

    createStableStrokeSigned(salt) {
      return this.createStableStrokeUnit(salt) * 2 - 1;
    }
,

    createStrokeSeed(point, tool = "brush") {
      const salt = tool === "eraser" ? 0x9e3779b9 : 0x85ebca6b;

      return (
        Date.now() ^
        Math.round(point.x * 1000) ^
        Math.round(point.y * 1000) ^
        salt
      ) >>> 0;
    }
,

    beginStrokeDynamics(sample) {
      const StrokeMath = namespace.StrokeMath;
      const point = { x: sample.x, y: sample.y };
      const tool = this.currentStrokeTool || "brush";
      const seed = (sample.strokeSeed ?? this.createStrokeSeed(point, tool) ?? 1) >>> 0;
      const inputPressure = StrokeMath?.normalizePressure
        ? StrokeMath.normalizePressure(sample.pressure)
        : sample.pressure;

      sample.strokeSeed = seed;
      this.strokeRandomState = { seed };
      this.strokeInitialSeed = seed;
      this.strokeChargeRadius = this.getBaseBrushRadius();
      this.initializeStrokeColorDynamics(seed);
      this.initializeWetMixRandom(seed);
      this.initializeGrainDynamics(seed);
      this.strokeShapeRotation = this.brushState.shapeRandomized === true
        ? (this.createSeededUnit(seed ^ 0x9e3779b9) * 2 - 1) * Math.PI
        : 0;
      this.strokeDynamicsState = StrokeMath?.createStrokeState
        ? StrokeMath.createStrokeState(point, {
            pressure: inputPressure,
            seed,
            time: sample.time,
            tool,
          })
        : null;
      this.initializeVelocityPressureState(sample);
      this.resetAdaptiveSpacingState(sample);

      return {
        ...sample,
        pressure: this.resolveSamplePressure(sample, inputPressure),
      };
    }
,

    shouldEmitStabilizationGuide() {
      return (
        this.options?.suppressCameraEvents !== true &&
        this.options?.getSettings == null &&
        this.stage &&
        this.canvas &&
        !this.isDisposed
      );
    }
,

    documentPointToStageCssPoint(point) {
      if (!point || !this.stage || !this.canvas) {
        return null;
      }

      const x = Number(point.x);
      const y = Number(point.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      const stageRect = this.stage.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(0.0001, Number(this.dpr) || 1);
      const zoom = Math.max(0.0001, Number(this.camera?.zoom) || 1);

      return {
        x: canvasRect.left - stageRect.left + (x * zoom + (Number(this.camera?.x) || 0)) / dpr,
        y: canvasRect.top - stageRect.top + (y * zoom + (Number(this.camera?.y) || 0)) / dpr,
      };
    }
,

    updateStabilizationGuide(rawSample, processedPoint, guide) {
      if (!this.shouldEmitStabilizationGuide()) {
        return;
      }

      if (
        !this.isDrawing ||
        guide?.active !== true ||
        this.largeBlendFinalQualityReplay === true ||
        this.strokeTotalLength != null
      ) {
        this.clearStabilizationGuide();
        return;
      }

      const cursor = this.documentPointToStageCssPoint(guide.inputPoint || rawSample);
      const brush = this.documentPointToStageCssPoint(guide.outputPoint || processedPoint);

      if (!cursor || !brush) {
        this.clearStabilizationGuide();
        return;
      }

      this.stabilizationGuideVisible = true;
      window.dispatchEvent(new CustomEvent("cbo:brush-stabilization-guide", {
        detail: {
          active: true,
          brush,
          cursor,
          distance: Number(guide.distance) || 0,
          ropeLength: Number(guide.ropeLength) || 0,
          taut: guide.taut === true,
          tool: this.currentStrokeTool || "brush",
        },
      }));
    }
,

    clearStabilizationGuide() {
      if (!this.stabilizationGuideVisible || !this.shouldEmitStabilizationGuide()) {
        this.stabilizationGuideVisible = false;
        return;
      }

      this.stabilizationGuideVisible = false;
      window.dispatchEvent(new CustomEvent("cbo:brush-stabilization-guide", {
        detail: { active: false },
      }));
    }
,

    processPointerSample(event) {
      return this.applyStabilization(this.createPointerSample(event));
    }
,

    applyStabilization(rawSample) {
      const StrokeMath = namespace.StrokeMath;

      if (!this.strokeDynamicsState || !StrokeMath?.processStrokeInput) {
        return {
          ...rawSample,
          pressure: this.resolveSamplePressure(rawSample, rawSample.pressure),
        };
      }

      const processed = StrokeMath.processStrokeInput(
        { x: rawSample.x, y: rawSample.y },
        this.strokeDynamicsState,
        this.brushState,
        rawSample.pressure,
        {
          ...rawSample,
          cameraZoom: this.camera?.zoom,
          dpr: this.dpr,
        },
      );

      this.updateStabilizationGuide(rawSample, processed.point, processed.stabilizationGuide);

      return {
        ...rawSample,
        x: processed.point.x,
        y: processed.point.y,
        pressure: this.resolveSamplePressure(rawSample, processed.pressure),
      };
    }
,

    isMobilePerformanceMode() {
      return namespace.DocumentRenderer?.isMobileLikeEnvironment?.() === true;
    }
,

    isAndroidPerformanceMode() {
      return namespace.androidPerformanceMode === true ||
        namespace.deviceIsAndroid === true ||
        namespace.DocumentRenderer?.isAndroidLikeEnvironment?.() === true;
    }
,

    isAndroidFullRenderMode() {
      return this.isAndroidPerformanceMode() && namespace.androidFullRenderMode === true;
    }
,

    isAndroidPreviewCacheDisabled() {
      return this.isAndroidPerformanceMode() &&
        (
          namespace.androidFullRenderMode === true ||
          namespace.androidPreviewCacheEnabled === false ||
          namespace.DocumentRenderer?.isAndroidPreviewCacheDisabled?.() === true
        );
    }
,

    isAndroidDirtyRegionsDisabled() {
      return this.isAndroidPerformanceMode() &&
        (
          namespace.androidFullRenderMode === true ||
          namespace.androidDirtyRegionsEnabled === false ||
          namespace.DocumentRenderer?.isAndroidDirtyRegionsDisabled?.() === true
        );
    }
,

    getPointerSamplesPerFrame() {
      if (this.isAndroidPerformanceMode()) {
        return ANDROID_POINTER_SAMPLES_PER_FRAME;
      }

      return this.isMobilePerformanceMode()
        ? MOBILE_POINTER_SAMPLES_PER_FRAME
        : DESKTOP_POINTER_SAMPLES_PER_FRAME;
    }
,

    getPointerFrameBudgetMs() {
      if (this.isAndroidPerformanceMode()) {
        return ANDROID_POINTER_FRAME_BUDGET_MS;
      }

      return this.isMobilePerformanceMode()
        ? MOBILE_POINTER_FRAME_BUDGET_MS
        : DESKTOP_POINTER_FRAME_BUDGET_MS;
    }
,

    getMaxStampsPerFlush() {
      if (this.isAndroidPerformanceMode()) {
        return ANDROID_MAX_STAMPS_PER_FLUSH;
      }

      return this.isMobilePerformanceMode()
        ? MOBILE_MAX_STAMPS_PER_FLUSH
        : MAX_STAMPS_PER_FLUSH;
    }
,

    isAdaptiveStrokeSpacingEnabled() {
      const tool = this.currentStrokeTool || "brush";
      const toolEnabled = tool === "brush"
        ? namespace.adaptiveBrushSpacingEnabled !== false && namespace.brushAdaptiveSpacingEnabled !== false
        : (
            tool === "eraser" &&
            namespace.adaptiveEraserSpacingEnabled !== false &&
            namespace.eraserAdaptiveSpacingEnabled !== false
          );

      return (
        namespace.adaptiveStrokeSpacingEnabled !== false &&
        toolEnabled &&
        this.brushState?.adaptiveSpacingEnabled !== false &&
        this.isDrawing === true &&
        this.largeBlendFinalQualityReplay !== true &&
        this.strokeTotalLength == null
      );
    }
,

    getAdaptiveSpacingConfig(pointerType = "") {
      const normalizedPointerType = String(pointerType || "").toLowerCase();
      const isMobileLike = this.isMobilePerformanceMode() || this.isAndroidPerformanceMode() || normalizedPointerType === "touch";

      if (this.currentStrokeTool === "eraser") {
        return isMobileLike ? ADAPTIVE_ERASER_SPACING_MOBILE : ADAPTIVE_ERASER_SPACING_DESKTOP;
      }

      return isMobileLike ? ADAPTIVE_BRUSH_SPACING_MOBILE : ADAPTIVE_BRUSH_SPACING_DESKTOP;
    }
,

    getAdaptiveSpacingShapeLoad() {
      const shapeCount = this.clamp(Math.round(Number(this.brushState?.shapeCount) || 1), 1, 16);
      const shapeScatter = this.clamp(Number(this.brushState?.shapeScatter) || 0, 0, 2);
      const shapeCountJitter = this.clamp01(this.brushState?.shapeCountJitter);
      const countLoad = this.clamp((shapeCount - 1) / 7, 0, 1);
      const scatterLoad = this.clamp(shapeScatter / 0.75, 0, 1);
      const jitterLoad = countLoad * shapeCountJitter;
      const value = this.clamp(countLoad * 0.55 + scatterLoad * 0.35 + jitterLoad * 0.1, 0, 1);

      return {
        countLoad,
        scatterLoad,
        shapeCount,
        shapeCountJitter,
        shapeScatter,
        value,
      };
    }
,

    getAdaptiveSpacingMaxTotalMultiplier(config, shapeLoad = this.getAdaptiveSpacingShapeLoad()) {
      const configuredMax = Math.max(1, Number(config?.maxTotalMultiplier) || 1);

      if (this.currentStrokeTool === "eraser") {
        return configuredMax;
      }

      const simpleMax = this.clamp(
        Number(config?.simpleMaxTotalMultiplier) || configuredMax,
        1,
        configuredMax,
      );
      const load = this.clamp01(Number(shapeLoad?.value) || 0);

      return simpleMax + (configuredMax - simpleMax) * load;
    }
,

    resetAdaptiveSpacingState(sample = null) {
      const sampleTime = Number(sample?.time);

      this.adaptiveSpacingState = sample
        ? {
            lastTime: Number.isFinite(sampleTime) ? sampleTime : this.getNow(),
            pointerType: sample.pointerType || "",
            speed: 0,
          }
        : null;
      this.activeStrokeSpacingMultiplier = 1;
    }
,

    updateAdaptiveSpacingForSegment(from, to) {
      if (!this.isAdaptiveStrokeSpacingEnabled() || !from || !to) {
        this.activeStrokeSpacingMultiplier = 1;
        return 1;
      }

      if (!this.adaptiveSpacingState) {
        this.resetAdaptiveSpacingState(from);
      }

      const state = this.adaptiveSpacingState;
      const pointerType = to.pointerType || from.pointerType || state?.pointerType || "";
      const config = this.getAdaptiveSpacingConfig(pointerType);
      const currentTime = Number(to.time);
      const previousTime = Number(from.time);
      const safeCurrentTime = Number.isFinite(currentTime)
        ? currentTime
        : (Number.isFinite(previousTime) ? previousTime + 16 : this.getNow());
      const safePreviousTime = Number.isFinite(previousTime)
        ? previousTime
        : (Number.isFinite(state?.lastTime) ? state.lastTime : safeCurrentTime - 16);
      const deltaTime = Math.max(1, Math.min(64, safeCurrentTime - safePreviousTime));
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const zoom = this.clamp(Number(this.camera?.zoom) || 1, ADAPTIVE_SPACING_MIN_ZOOM, MAX_ZOOM);
      const screenSpeedPerSecond = distance * zoom / (deltaTime * 0.001);
      const previousSpeed = Number.isFinite(state?.speed) ? state.speed : 0;

      state.speed = previousSpeed + (screenSpeedPerSecond - previousSpeed) * config.smoothing;
      state.lastTime = safeCurrentTime;
      state.pointerType = pointerType;

      const ramp = this.clamp((state.speed - config.start) / Math.max(1, config.full - config.start), 0, 1);
      const eased = ramp * ramp * (3 - 2 * ramp);
      const speedMultiplier = 1 + eased * (config.maxMultiplier - 1);
      const zoomOutMultiplier = zoom < 1 ? 1 / zoom : 1;
      const uncappedMultiplier = Math.max(1, speedMultiplier * zoomOutMultiplier);
      const shapeLoad = this.getAdaptiveSpacingShapeLoad();
      const maxTotalMultiplier = this.getAdaptiveSpacingMaxTotalMultiplier(config, shapeLoad);
      const multiplier = Math.min(uncappedMultiplier, maxTotalMultiplier);

      this.activeStrokeSpacingMultiplier = multiplier;

      return multiplier;
    }
,

    getActiveAdaptiveSpacingMultiplier() {
      if (!this.isAdaptiveStrokeSpacingEnabled()) {
        return 1;
      }

      const multiplier = Number(this.activeStrokeSpacingMultiplier);

      return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
    }
,

    getNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }
,

    shouldUseVelocityPressure(sample) {
      const pointerType = String(sample?.pointerType || "").toLowerCase();

      return (
        this.brushState.velocityPressureEnabled === true &&
        this.currentStrokeTool !== "eraser" &&
        pointerType !== "pen"
      );
    }
,

    initializeVelocityPressureState(sample) {
      if (!this.shouldUseVelocityPressure(sample)) {
        this.velocityPressureState = null;
        return;
      }

      this.velocityPressureState = {
        pressure: 0,
        lastX: sample.x,
        lastY: sample.y,
        lastTime: sample.time,
      };
    }
,

    resolveSamplePressure(sample, fallbackPressure = 1) {
      if (!this.shouldUseVelocityPressure(sample)) {
        return fallbackPressure;
      }

      return this.updateVelocityPressure(sample);
    }
,

    updateVelocityPressure(sample) {
      if (!this.velocityPressureState) {
        this.initializeVelocityPressureState(sample);
      }

      const state = this.velocityPressureState;

      if (!state) {
        return 1;
      }

      const sampleTime = Number(sample.time);
      const stateTime = Number(state.lastTime);
      const currentTime = Number.isFinite(sampleTime) ? sampleTime : (Number.isFinite(stateTime) ? stateTime + 1 : 1);
      const lastTime = Number.isFinite(stateTime) ? stateTime : currentTime - 1;
      const distance = Math.hypot(sample.x - state.lastX, sample.y - state.lastY);
      const deltaTime = Math.max(1, currentTime - lastTime);
      const speed = this.clamp(distance / deltaTime, 0, VELOCITY_PRESSURE_MAX_SPEED);
      const targetPressure = speed / VELOCITY_PRESSURE_MAX_SPEED;

      state.pressure += (targetPressure - state.pressure) * VELOCITY_PRESSURE_SMOOTHING;
      state.lastX = sample.x;
      state.lastY = sample.y;
      state.lastTime = currentTime;

      return this.clamp01(state.pressure);
    }
,

    parseColorToRgb01(value) {
      const fallback = [0, 0, 0];

      if (typeof value !== "string") {
        return fallback;
      }

      const trimmed = value.trim();

      if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);

        if (hex.length === 3 || hex.length === 4) {
          const r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
          const g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
          const b = parseInt(hex.charAt(2) + hex.charAt(2), 16);

          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r / 255, g / 255, b / 255];
          }
        } else if (hex.length === 6 || hex.length === 8) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);

          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r / 255, g / 255, b / 255];
          }
        }

        return fallback;
      }

      const rgbMatch = trimmed.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);

      if (rgbMatch) {
        const r = Math.max(0, Math.min(255, Number(rgbMatch[1])));
        const g = Math.max(0, Math.min(255, Number(rgbMatch[2])));
        const b = Math.max(0, Math.min(255, Number(rgbMatch[3])));

        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          return [r / 255, g / 255, b / 255];
        }
      }

      return fallback;
    }
,

    getColorDynamicsAmount(key) {
      const value = this.brushState?.[key] ?? namespace.brushSettings?.[key] ?? 0;

      return this.clamp01(value);
    }
,

    getColorJitterAmounts(prefix) {
      return {
        hue: this.getColorDynamicsAmount(`${prefix}ColorHueJitter`),
        saturation: this.getColorDynamicsAmount(`${prefix}ColorSaturationJitter`),
        lightness: this.getColorDynamicsAmount(`${prefix}ColorLightnessJitter`),
        darkness: this.getColorDynamicsAmount(`${prefix}ColorDarknessJitter`),
        secondary: this.getColorDynamicsAmount(`${prefix}ColorSecondaryJitter`),
      };
    }
,

    hasColorJitter(amounts) {
      return (
        amounts.hue > 0 ||
        amounts.saturation > 0 ||
        amounts.lightness > 0 ||
        amounts.darkness > 0 ||
        amounts.secondary > 0
      );
    }
,

    getPrimaryColorRgb() {
      return this.parseColorToRgb01(
        this.brushState?.color ??
          namespace.selectedColors?.primary ??
          namespace.selectedColor ??
          "#000000",
      );
    }
,

    getSecondaryColorRgb() {
      return this.parseColorToRgb01(
        this.brushState?.secondaryColor ?? namespace.selectedColors?.secondary ?? "#000000",
      );
    }
,

    nextColorRandom() {
      const state = this.strokeColorRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeColorRandomState = state;

      return state.seed / 4294967296;
    }
,

    initializeWetMixRandom(seed) {
      const wetSeed = ((((seed || 1) >>> 0) ^ 0xa24baed5) >>> 0) || 1;

      this.strokeWetRandomState = { seed: wetSeed };
    }
,

    initializeGrainDynamics(seed) {
      const grainSeed = ((((seed || 1) >>> 0) ^ 0x7f4a7c15) >>> 0) || 1;

      this.strokeGrainRandomState = { seed: grainSeed };

      if (this.getGrainMode() !== "moving" || !this.getGrainMovingOffsetJitter()) {
        this.strokeGrainOffset = { x: 0, y: 0 };
        return;
      }

      const grainWidth = Math.max(1, this.grainImageWidth || 1);
      const grainHeight = Math.max(1, this.grainImageHeight || 1);
      const x = (this.createSeededUnit(seed ^ 0x2c1b3c6d) - 0.5) * grainWidth;
      const y = (this.createSeededUnit(seed ^ 0x9f4a7c15) - 0.5) * grainHeight;

      this.strokeGrainOffset = { x, y };
    }
,

    nextGrainRandom() {
      const state = this.strokeGrainRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeGrainRandomState = state;

      return state.seed / 4294967296;
    }
,

    nextWetRandom() {
      const state = this.strokeWetRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeWetRandomState = state;

      return state.seed / 4294967296;
    }
,

    randomColorSigned() {
      return this.nextColorRandom() * 2 - 1;
    }
,

    wrapUnit(value) {
      return ((value % 1) + 1) % 1;
    }
,

    wrapHue(hue) {
      return ((hue % 360) + 360) % 360;
    }
,

    rgbToHsl(rgb) {
      const red = this.clamp01(rgb?.[0]);
      const green = this.clamp01(rgb?.[1]);
      const blue = this.clamp01(rgb?.[2]);
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const lightness = (max + min) * 0.5;
      const delta = max - min;
      let hue = 0;
      let saturation = 0;

      if (delta > 0) {
        saturation = lightness > 0.5
          ? delta / (2 - max - min)
          : delta / (max + min);

        if (max === red) {
          hue = (green - blue) / delta + (green < blue ? 6 : 0);
        } else if (max === green) {
          hue = (blue - red) / delta + 2;
        } else {
          hue = (red - green) / delta + 4;
        }

        hue *= 60;
      }

      return {
        h: hue,
        s: saturation,
        l: lightness,
      };
    }
,

    hueToRgb(p, q, t) {
      let nextT = t;

      if (nextT < 0) {
        nextT += 1;
      }

      if (nextT > 1) {
        nextT -= 1;
      }

      if (nextT < 1 / 6) {
        return p + (q - p) * 6 * nextT;
      }

      if (nextT < 1 / 2) {
        return q;
      }

      if (nextT < 2 / 3) {
        return p + (q - p) * (2 / 3 - nextT) * 6;
      }

      return p;
    }
,

    hslToRgb(hsl) {
      const hue = this.wrapHue(hsl?.h ?? 0) / 360;
      const saturation = this.clamp01(hsl?.s);
      const lightness = this.clamp01(hsl?.l);

      if (saturation <= 0) {
        return [lightness, lightness, lightness];
      }

      const q = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
      const p = 2 * lightness - q;

      return [
        this.hueToRgb(p, q, hue + 1 / 3),
        this.hueToRgb(p, q, hue),
        this.hueToRgb(p, q, hue - 1 / 3),
      ];
    }
,

    mixRgb(from, to, t) {
      const amount = this.clamp01(t);

      return [
        this.lerp(this.clamp01(from?.[0]), this.clamp01(to?.[0]), amount),
        this.lerp(this.clamp01(from?.[1]), this.clamp01(to?.[1]), amount),
        this.lerp(this.clamp01(from?.[2]), this.clamp01(to?.[2]), amount),
      ];
    }
,

    getColorSampleUnit(sample, channel) {
      const value = sample?.[channel];

      return Number.isFinite(value) ? this.wrapUnit(value) : this.nextColorRandom();
    }
,

    getColorSampleSigned(sample, channel) {
      return this.getColorSampleUnit(sample, channel) * 2 - 1;
    }
,

    applyNeutralColorVisibility(hsl, amounts, sourceHsl) {
      const chromaAmount = Math.max(amounts.hue, amounts.saturation);

      if (chromaAmount <= 0) {
        return;
      }

      if (sourceHsl.s <= 0.08) {
        hsl.s = Math.max(hsl.s, this.lerp(0.38, 0.88, chromaAmount));
      }

      if (sourceHsl.l <= 0.1) {
        hsl.s = Math.max(hsl.s, this.lerp(0.28, 0.72, chromaAmount));
        hsl.l = Math.max(hsl.l, this.lerp(0.12, 0.42, chromaAmount));
      } else if (sourceHsl.l >= 0.9) {
        hsl.s = Math.max(hsl.s, this.lerp(0.28, 0.72, chromaAmount));
        hsl.l = Math.min(hsl.l, this.lerp(0.88, 0.58, chromaAmount));
      }
    }
,

    getNextStampColorSample() {
      const state = this.strokeColorState || {};
      const index = state.stampColorIndex || 0;
      const phase = state.stampColorPhase || 0;
      const position = this.wrapUnit(phase + index * COLOR_GOLDEN_RATIO);

      state.stampColorIndex = index + 1;
      this.strokeColorState = state;

      return {
        hue: position,
        saturation: this.wrapUnit(position + 0.37),
        lightness: this.wrapUnit(position + 0.61),
        darkness: this.wrapUnit(position + 0.83),
        secondary: this.wrapUnit(position + 0.19),
      };
    }
,

    getLumaJitterRange(sourceLightness) {
      const baseLightness = this.clamp01(sourceLightness);

      return {
        darkFloor: baseLightness <= 0.1
          ? Math.max(0.02, baseLightness * 0.65)
          : Math.max(0.12, baseLightness * 0.35),
        lightCeiling: baseLightness >= 0.9
          ? Math.min(0.98, baseLightness + (1 - baseLightness) * 0.35)
          : Math.min(0.9, 1 - (1 - baseLightness) * 0.35),
      };
    }
,

    applyLumaJitter(hsl, amounts, sample, sourceHsl) {
      const lightnessAmount = this.clamp01(amounts.lightness);
      const darknessAmount = this.clamp01(amounts.darkness);

      if (lightnessAmount <= 0 && darknessAmount <= 0) {
        return;
      }

      const lightPull = this.getColorSampleUnit(sample, "lightness") * lightnessAmount;
      const darkPull = this.getColorSampleUnit(sample, "darkness") * darknessAmount;
      const signedPull = this.clamp(lightPull - darkPull, -1, 1);
      const { darkFloor, lightCeiling } = this.getLumaJitterRange(sourceHsl.l);

      if (signedPull > 0) {
        hsl.l = this.lerp(sourceHsl.l, lightCeiling, signedPull);
      } else if (signedPull < 0) {
        hsl.l = this.lerp(sourceHsl.l, darkFloor, -signedPull);
      }
    }
,

    applyColorJitter(baseRgb, amounts, secondaryRgb, sample = null) {
      const hsl = this.rgbToHsl(baseRgb);
      const sourceHsl = { ...hsl };

      if (amounts.hue > 0) {
        hsl.h = this.wrapHue(hsl.h + this.getColorSampleSigned(sample, "hue") * 180 * amounts.hue);
      }

      if (amounts.saturation > 0) {
        hsl.s += this.getColorSampleSigned(sample, "saturation") * amounts.saturation;
      }

      this.applyLumaJitter(hsl, amounts, sample, sourceHsl);

      this.applyNeutralColorVisibility(hsl, amounts, sourceHsl);
      hsl.s = this.clamp01(hsl.s);
      hsl.l = this.clamp01(hsl.l);

      const rgb = this.hslToRgb(hsl);

      if (amounts.secondary > 0) {
        return this.mixRgb(rgb, secondaryRgb, this.getColorSampleUnit(sample, "secondary") * amounts.secondary);
      }

      return rgb;
    }
,

    initializeStrokeColorDynamics(seed) {
      const colorSeed = (((seed || 1) >>> 0) ^ 0x6c8e9cf5) >>> 0;
      const primaryRgb = this.getPrimaryColorRgb();
      const secondaryRgb = this.getSecondaryColorRgb();
      const strokeAmounts = this.getColorJitterAmounts("stroke");
      const stampAmounts = this.getColorJitterAmounts("stamp");
      const hasStrokeJitter = this.hasColorJitter(strokeAmounts);
      const hasStampJitter = this.hasColorJitter(stampAmounts);

      this.strokeColorRandomState = { seed: colorSeed || 1 };
      this.strokeColorState = {
        secondaryRgb,
        stampAmounts,
        stampColorIndex: 0,
        stampColorPhase: this.createSeededUnit(colorSeed ^ 0xb5297a4d),
        hasStampJitter,
        strokeBaseColorRgb: hasStrokeJitter
          ? this.applyColorJitter(primaryRgb, strokeAmounts, secondaryRgb)
          : primaryRgb,
      };
    }
,

    getCurrentStrokeColorRgb() {
      return this.strokeColorState?.strokeBaseColorRgb || this.getPrimaryColorRgb();
    }
,

    getNextStampColorRgb() {
      if (!this.strokeColorState) {
        return this.getPrimaryColorRgb();
      }

      if (!this.strokeColorState.hasStampJitter) {
        return this.strokeColorState.strokeBaseColorRgb;
      }

      return this.applyColorJitter(
        this.strokeColorState.strokeBaseColorRgb,
        this.strokeColorState.stampAmounts,
        this.strokeColorState.secondaryRgb,
        this.getNextStampColorSample(),
      );
    }
,

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }
,

    clamp01(value) {
      return this.clamp(value, 0, 1);
    }
,

    nextRandom() {
      const state = this.strokeRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeRandomState = state;

      return state.seed / 4294967296;
    }
,

    randomSigned() {
      return this.nextRandom() * 2 - 1;
    }
,

    lerp(start, end, t) {
      return start + (end - start) * t;
    }
,

    getStrokeSegmentSampleCount(segmentDistance) {
      if (this.isAndroidPerformanceMode()) {
        return Math.max(
          ANDROID_STROKE_SEGMENT_MIN_SAMPLES,
          Math.min(
            ANDROID_STROKE_SEGMENT_MAX_SAMPLES,
            Math.ceil(segmentDistance / ANDROID_STROKE_SEGMENT_DISTANCE_STEP),
          ),
        );
      }

      const minSamples = this.isMobilePerformanceMode()
        ? MOBILE_STROKE_SEGMENT_MIN_SAMPLES
        : DESKTOP_STROKE_SEGMENT_MIN_SAMPLES;

      return Math.max(minSamples, Math.min(128, Math.ceil(segmentDistance / 4)));
    }
,

    catmullRom(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;

      return {
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        pressure: this.lerp(p1.pressure, p2.pressure, t),
        pointerType: p2.pointerType || p1.pointerType || "",
        tiltX: this.lerp(p1.tiltX, p2.tiltX, t),
        tiltY: this.lerp(p1.tiltY, p2.tiltY, t),
        altitudeAngle: Number.isFinite(Number(p1.altitudeAngle)) && Number.isFinite(Number(p2.altitudeAngle))
          ? this.lerp(Number(p1.altitudeAngle), Number(p2.altitudeAngle), t)
          : p2.altitudeAngle ?? p1.altitudeAngle,
        azimuthAngle: Number.isFinite(Number(p1.azimuthAngle)) && Number.isFinite(Number(p2.azimuthAngle))
          ? this.lerp(Number(p1.azimuthAngle), Number(p2.azimuthAngle), t)
          : p2.azimuthAngle ?? p1.azimuthAngle,
        twist: Number.isFinite(Number(p1.twist)) && Number.isFinite(Number(p2.twist))
          ? this.lerp(Number(p1.twist), Number(p2.twist), t)
          : p2.twist ?? p1.twist,
      };
    }
,

    createStamp(point, alphaScale = 1) {
      return {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        alphaScale,
        flowScale: 1,
        bleedScale: 0,
        sizeCompressionScale: 1,
        sizeScale: 1,
        rotation: 0,
        pointerType: point.pointerType || "",
        tiltX: point.tiltX,
        tiltY: point.tiltY,
        altitudeAngle: point.altitudeAngle,
        azimuthAngle: point.azimuthAngle,
        twist: point.twist,
      };
    }
,

    lerpStamp(from, to, t) {
      return {
        x: this.lerp(from.x, to.x, t),
        y: this.lerp(from.y, to.y, t),
        pressure: this.lerp(from.pressure, to.pressure, t),
        alphaScale: this.lerp(from.alphaScale ?? 1, to.alphaScale ?? 1, t),
        flowScale: this.lerp(from.flowScale ?? 1, to.flowScale ?? 1, t),
        bleedScale: this.lerp(from.bleedScale ?? 0, to.bleedScale ?? 0, t),
        sizeCompressionScale: this.lerp(from.sizeCompressionScale ?? 1, to.sizeCompressionScale ?? 1, t),
        sizeScale: this.lerp(from.sizeScale ?? 1, to.sizeScale ?? 1, t),
        rotation: this.lerp(from.rotation ?? 0, to.rotation ?? 0, t),
        pointerType: to.pointerType || from.pointerType || "",
        tiltX: this.lerp(from.tiltX, to.tiltX, t),
        tiltY: this.lerp(from.tiltY, to.tiltY, t),
        altitudeAngle: Number.isFinite(Number(from.altitudeAngle)) && Number.isFinite(Number(to.altitudeAngle))
          ? this.lerp(Number(from.altitudeAngle), Number(to.altitudeAngle), t)
          : to.altitudeAngle ?? from.altitudeAngle,
        azimuthAngle: Number.isFinite(Number(from.azimuthAngle)) && Number.isFinite(Number(to.azimuthAngle))
          ? this.lerp(Number(from.azimuthAngle), Number(to.azimuthAngle), t)
          : to.azimuthAngle ?? from.azimuthAngle,
        twist: Number.isFinite(Number(from.twist)) && Number.isFinite(Number(to.twist))
          ? this.lerp(Number(from.twist), Number(to.twist), t)
          : to.twist ?? from.twist,
      };
    }
,

    applyTaperToStamp(stamp) {
      // Il taper si applica solo nel pass di "rigenerazione" post-stroke,
      // quando la lunghezza totale del tratto e' nota. In live drawing sta a null.
      if (this.strokeTotalLength == null) {
        return;
      }

      const StrokeMath = namespace.StrokeMath;
      const factor =
        StrokeMath?.getTaperFactor != null
          ? StrokeMath.getTaperFactor(this.strokeDistance, this.strokeTotalLength, this.brushState)
          : 1;

      if (factor >= 1) {
        return;
      }

      const taperSize = this.clamp01(this.brushState.taperSize ?? 1);
      const taperOpacity = this.clamp01(this.brushState.taperOpacity ?? 0);
      const taperPressure = this.clamp01(this.brushState.taperPressure ?? 0);
      // taperSize 1 -> il taper porta il dab a sparire; 0 -> nessun effetto sulla size.
      const sizeContribution = this.lerp(1 - taperSize, 1, factor);
      const opacityContribution = this.lerp(1 - taperOpacity, 1, factor);
      const pressureContribution = this.lerp(1 - taperPressure, 1, factor);

      stamp.pressure = (stamp.pressure ?? 1) * pressureContribution;
      stamp.sizeScale = (stamp.sizeScale ?? 1) * sizeContribution;
      stamp.alphaScale = (stamp.alphaScale ?? 1) * opacityContribution;
    }
,

    isTaperActive() {
      const taperStart = this.clamp01(this.brushState.taperStart);
      const taperEnd = this.clamp01(this.brushState.taperEnd);
      const taperSize = this.clamp01(this.brushState.taperSize ?? 1);
      const taperOpacity = this.clamp01(this.brushState.taperOpacity ?? 0);
      const taperPressure = this.clamp01(this.brushState.taperPressure ?? 0);

      return (taperStart > 0 || taperEnd > 0) && (taperSize > 0 || taperOpacity > 0 || taperPressure > 0);
    }
,

    getBaseBrushSize() {
      const sizeFromRadiusSetting = Number(this.brushState.radius);

      if (Number.isFinite(sizeFromRadiusSetting) && sizeFromRadiusSetting > 0) {
        return sizeFromRadiusSetting;
      }

      const size = Number(this.brushState.size);

      if (Number.isFinite(size) && size > 0) {
        return size;
      }

      return 20;
    }
,

    getBaseBrushRadius() {
      return Math.max(0.5, this.getBaseBrushSize() * 0.5);
    }
,

    getBrushSize() {
      return this.getBaseBrushSize();
    }
,

    isMobileLargeBlendFastPathCandidate(brushSize = this.getBrushSize()) {
      if (
        namespace.mobileLargeBlendBrushFastPath === false ||
        namespace.androidLargeBlendBrushFastPath === false
      ) {
        return false;
      }

      if (!this.isAndroidPerformanceMode?.() && !this.isMobilePerformanceMode?.()) {
        return false;
      }

      const size = Math.max(0, Number(brushSize) || 0);

      if (size < 192) {
        return false;
      }

      const buildUp = typeof this.getStrokeBuildUp === "function"
        ? this.getStrokeBuildUp()
        : 0;

      return buildUp >= 0.8;
    }
,

    shouldUseMobileLargeBlendFastPath(brushSize = this.getBrushSize()) {
      return (
        this.isMobileLargeBlendFastPathCandidate(brushSize) &&
        this.largeBlendFinalQualityReplay !== true &&
        this.isDrawing === true
      );
    }
,

    shouldUseAndroidLargeBlendFastPath(brushSize = this.getBrushSize()) {
      return this.shouldUseMobileLargeBlendFastPath(brushSize);
    }
,

    getMobileLargeBlendSpacingFraction(spacingFraction, brushSize = this.getBrushSize()) {
      const safeSpacing = Number.isFinite(Number(spacingFraction))
        ? this.clamp(Number(spacingFraction), 0, 1)
        : 0.1;

      if (!this.shouldUseMobileLargeBlendFastPath(brushSize)) {
        return safeSpacing;
      }

      const largeBrushFactor = this.clamp((Math.max(0, Number(brushSize) || 0) - 192) / 320, 0, 1);
      const spacingFloor = this.lerp(0.12, 0.18, largeBrushFactor);

      return Math.max(safeSpacing, spacingFloor);
    }
,

    getAndroidLargeBlendSpacingFraction(spacingFraction, brushSize = this.getBrushSize()) {
      return this.getMobileLargeBlendSpacingFraction(spacingFraction, brushSize);
    }
,

    getStrokeChargeRadius() {
      const radius = Number(this.strokeChargeRadius);

      return Number.isFinite(radius) && radius > 0 ? radius : this.getBaseBrushRadius();
    }
,

    getStampSpacing(sizeScaleOrStamp = 1) {
      const brushSize = this.getBrushSize();
      const stamp = typeof sizeScaleOrStamp === "object" && sizeScaleOrStamp !== null
        ? sizeScaleOrStamp
        : null;
      const sizeScale = stamp ? stamp.sizeScale ?? 1 : sizeScaleOrStamp;
      const pressure = stamp ? this.clamp(stamp.pressure ?? 1, 0, 1) : 1;
      const pressureSizeFactor = stamp ? this.lerp(this.getMinSizeRatio(), 1, pressure) : 1;
      const spacingFraction = Number(this.brushState.spacing);
      const safeSpacing = Number.isFinite(spacingFraction)
        ? this.clamp(spacingFraction, ADAPTIVE_SPACING_MIN_FRACTION, 1)
        : Math.max(ADAPTIVE_SPACING_MIN_FRACTION, 0.1);
      const effectiveSpacing = this.getMobileLargeBlendSpacingFraction(safeSpacing, brushSize);
      const spacingJitter = this.clamp01(this.brushState.spacingJitter);
      const effectiveSizeScale = this.clamp((Number(sizeScale) || 1) * pressureSizeFactor, 0.05, 1);
      const adaptiveSpacingMultiplier = this.getActiveAdaptiveSpacingMultiplier();
      const baseSpacing = Math.max(0.5, brushSize * effectiveSizeScale * effectiveSpacing * adaptiveSpacingMultiplier);
      const jitterAmount = baseSpacing * spacingJitter * 0.85;
      const spacing = Math.max(0.5, baseSpacing + this.randomSigned() * jitterAmount);

      if (this.taperSpacingCap != null) {
        return Math.min(spacing, this.taperSpacingCap);
      }

      return spacing;
    }
,

    getCurrentStrokePathLength() {
      return Math.max(0, this.strokeDistance + this.leftoverDistance);
    }
,

    getTaperMinDistance() {
      if (this.brushState.taperMinDistanceEnabled !== true) {
        return 247;
      }

      const minDistance = Number(this.brushState.taperMinDistance);

      if (!Number.isFinite(minDistance) || minDistance <= 0) {
        return 247;
      }

      return this.clamp(minDistance, 0, 1000);
    }
,

    getTaperSpacingCap(totalLength) {
      const safeLength = Number(totalLength);

      if (!Number.isFinite(safeLength) || safeLength <= 0) {
        return null;
      }

      // Durante la rigenerazione taper i tratti molto corti hanno bisogno di
      // abbastanza dab per descrivere la percentuale della traccia, non un solo cerchio.
      return Math.max(0.5, safeLength / 12);
    }
,

    getFallOffScale() {
      const fallOff = this.clamp01(this.brushState.fallOff);

      if (fallOff <= 0) {
        return 1;
      }

      const radius = Math.max(0.5, this.getBrushSize() * 0.5);
      const fadeDistance = Math.max(radius * 2, radius * (96 - fallOff * 88));

      return this.clamp(1 - this.strokeDistance / fadeDistance, 0, 1);
    }
,

    getWetMixAlphaScale() {
      const dilution = this.clamp01(this.brushState.wetDilution);
      const charge = this.clamp01(this.brushState.wetCharge ?? 1);
      const attack = this.clamp01(this.brushState.wetAttack ?? 1);
      const jitter = this.clamp01(this.brushState.wetnessJitter);
      const dilutionScale = this.lerp(1, 0.05, dilution);
      const attackScale = this.lerp(0.05, 1, attack);
      let chargeScale = 1;

      if (charge < 1) {
        const radius = Math.max(0.5, this.getStrokeChargeRadius());
        const safeCharge = Math.max(charge, 0.01);
        const initialLoad = this.lerp(0.2, 1, safeCharge);
        const depletionDistance = radius * this.lerp(5, 120, safeCharge);
        const depletion = this.clamp01(this.strokeDistance / depletionDistance);
        const easedDepletion = depletion * depletion * (3 - 2 * depletion);

        chargeScale = this.lerp(initialLoad, 0, easedDepletion);
      }

      let alpha = dilutionScale * attackScale * chargeScale;

      if (jitter > 0) {
        alpha *= this.lerp(1 - jitter * 0.4, 1 + jitter * 0.4, this.nextWetRandom());
      }

      return this.clamp01(alpha);
    }
,

    getStampAlphaScale() {
      return this.getFallOffScale() * this.getWetMixAlphaScale();
    }
,

    isPencilPointerSample(sample) {
      return String(sample?.pointerType || "").toLowerCase() === "pen";
    }
,

    isPenPointerSample(sample) {
      return this.isPencilPointerSample(sample);
    }
,

    getPencilPressureInput(sample) {
      if (!this.isPencilPointerSample(sample)) {
        return 1;
      }

      const pressure = Number(sample?.pressure);

      return Number.isFinite(pressure)
        ? this.clamp(pressure, 0, 1)
        : 1;
    }
,

    getPenPressureInput(sample) {
      return this.getPencilPressureInput(sample);
    }
,

    getPencilPressureCurveValue(sample) {
      const pressure = this.getPencilPressureInput(sample);
      const low = this.clamp01(this.brushState.pencilPressureCurveLow ?? 0);
      const mid = this.clamp01(this.brushState.pencilPressureCurveMid ?? 0.5);
      const high = this.clamp01(this.brushState.pencilPressureCurveHigh ?? 1);

      return pressure <= 0.5
        ? this.lerp(low, mid, pressure * 2)
        : this.lerp(mid, high, (pressure - 0.5) * 2);
    }
,

    getPencilAltitudeDegrees(sample) {
      if (!this.isPencilPointerSample(sample)) {
        return 90;
      }

      const rawAltitudeAngle = sample?.altitudeAngle;
      const altitudeAngle = Number(rawAltitudeAngle);

      if (rawAltitudeAngle != null && Number.isFinite(altitudeAngle) && altitudeAngle >= 0) {
        return this.clamp(altitudeAngle * 180 / Math.PI, 0, 90);
      }

      const tiltX = Number(sample?.tiltX);
      const tiltY = Number(sample?.tiltY);

      if (!Number.isFinite(tiltX) && !Number.isFinite(tiltY)) {
        return 90;
      }

      const tiltMagnitude = Math.hypot(
        Number.isFinite(tiltX) ? tiltX : 0,
        Number.isFinite(tiltY) ? tiltY : 0,
      );

      return this.clamp(90 - tiltMagnitude, 0, 90);
    }
,

    getPencilTiltAmount(sample) {
      if (!this.isPencilPointerSample(sample)) {
        return 0;
      }

      const trigger = this.clamp(Number(this.brushState.pencilTiltTrigger ?? 45), 15, 90);
      const altitudeDegrees = this.getPencilAltitudeDegrees(sample);

      if (altitudeDegrees > trigger) {
        return 0;
      }

      return this.clamp((trigger - altitudeDegrees) / Math.max(1, trigger - 15), 0, 1);
    }
,

    getPenTiltAmount(sample) {
      return this.getPencilTiltAmount(sample);
    }
,

    getPencilTiltRotation(stamp) {
      const amount = this.clamp01(this.brushState.pencilTiltRotation ?? this.brushState.penTiltRotation ?? 0);

      if (amount <= 0 || !this.isPencilPointerSample(stamp)) {
        return 0;
      }

      const rawAzimuthAngle = stamp?.azimuthAngle;
      const azimuthAngle = Number(rawAzimuthAngle);

      if (rawAzimuthAngle != null && Number.isFinite(azimuthAngle)) {
        return azimuthAngle * amount;
      }

      const tiltX = Number(stamp?.tiltX);
      const tiltY = Number(stamp?.tiltY);

      if (!Number.isFinite(tiltX) || !Number.isFinite(tiltY) || (tiltX === 0 && tiltY === 0)) {
        return 0;
      }

      return Math.atan2(tiltY, tiltX) * amount;
    }
,

    getPenTiltRotation(stamp) {
      return this.getPencilTiltRotation(stamp);
    }
,

    getPencilBarrelRollAmount(stamp, tangent = null) {
      if (!this.isPencilPointerSample(stamp)) {
        return 0;
      }

      const twist = Number(stamp?.twist);

      if (!Number.isFinite(twist)) {
        return 0;
      }

      let angle = twist * Math.PI / 180;

      if (
        this.brushState.pencilBarrelRelativeToStroke !== false &&
        tangent &&
        Number.isFinite(tangent.x) &&
        Number.isFinite(tangent.y) &&
        (tangent.x !== 0 || tangent.y !== 0)
      ) {
        angle -= Math.atan2(tangent.y, tangent.x);
      }

      return this.clamp01(Math.abs(Math.sin(angle)));
    }
,

    applyPencilInputToStamp(stamp, tangent = null) {
      if (!stamp || stamp.pencilInputApplied === true || stamp.penInputApplied === true || !this.isPencilPointerSample(stamp)) {
        return stamp;
      }

      const pressure = this.getPencilPressureCurveValue(stamp);
      const pressureSize = this.clamp01(this.brushState.pencilPressureSize ?? this.brushState.penPressureSize ?? 0);
      const pressureOpacity = this.clamp01(this.brushState.pencilPressureOpacity ?? this.brushState.penPressureOpacity ?? 0);
      const pressureFlow = this.clamp01(this.brushState.pencilPressureFlow ?? 0);
      const pressureBleed = this.clamp01(this.brushState.pencilPressureBleed ?? 0);
      const tiltAmount = this.getPencilTiltAmount(stamp);
      const tiltSize = this.clamp01(this.brushState.pencilTiltSize ?? this.brushState.penTiltSize ?? 0);
      const tiltOpacity = this.clamp01(this.brushState.pencilTiltOpacity ?? 0);
      const tiltGradation = this.clamp01(this.brushState.pencilTiltGradation ?? 0);
      const tiltBleed = this.clamp01(this.brushState.pencilTiltBleed ?? 0);
      const barrelRoll = this.getPencilBarrelRollAmount(stamp, tangent);
      const barrelSize = this.clamp(Number(this.brushState.pencilBarrelSize) || 0, -1, 1);
      const barrelOpacity = this.clamp01(this.brushState.pencilBarrelOpacity ?? 0);
      const barrelBleed = this.clamp01(this.brushState.pencilBarrelBleed ?? 0);

      stamp.pressure = this.lerp(1, pressure, pressureSize);
      stamp.alphaScale = (stamp.alphaScale ?? 1) * this.lerp(1, pressure, pressureOpacity);
      stamp.flowScale = (stamp.flowScale ?? 1) * this.lerp(1, pressure, pressureFlow);
      stamp.bleedScale = Math.max(stamp.bleedScale ?? 0, pressure * pressureBleed);

      if (tiltAmount > 0) {
        const tiltSizeScale = this.lerp(1, 1 + tiltAmount * 1.8, tiltSize);
        const tiltOpacityScale = this.lerp(1, Math.max(0.04, 1 - tiltOpacity * 0.92), tiltAmount);
        const tiltFlowScale = this.lerp(1, Math.max(0.18, 1 - tiltGradation * 0.58), tiltAmount);
        const tiltBleedScale = tiltAmount * Math.max(tiltBleed, tiltGradation * 0.72);

        stamp.sizeScale = (stamp.sizeScale ?? 1) * tiltSizeScale;
        stamp.alphaScale *= tiltOpacityScale;
        stamp.flowScale *= tiltFlowScale;
        stamp.bleedScale = Math.max(stamp.bleedScale ?? 0, tiltBleedScale);

        if (this.brushState.pencilTiltSizeCompression === true && tiltSizeScale > 1) {
          stamp.sizeCompressionScale = Math.max(stamp.sizeCompressionScale ?? 1, tiltSizeScale);
        }
      }

      if (barrelRoll > 0) {
        const barrelSizeScale = this.clamp(1 + barrelRoll * barrelSize, 0.18, 2.35);

        stamp.sizeScale = (stamp.sizeScale ?? 1) * barrelSizeScale;
        stamp.alphaScale *= this.lerp(1, Math.max(0.04, 1 - barrelOpacity), barrelRoll);
        stamp.bleedScale = Math.max(stamp.bleedScale ?? 0, barrelRoll * barrelBleed);
      }

      stamp.pencilInputApplied = true;
      stamp.penInputApplied = true;
      return stamp;
    }
,

    applyPenInputToStamp(stamp, tangent = null) {
      return this.applyPencilInputToStamp(stamp, tangent);
    }
,

    getStampBounds(stamp) {
      const pressure = this.clamp(stamp.pressure ?? 1, 0, 1);
      const sizeFactor = this.lerp(this.getMinSizeRatio(), 1, pressure);
      const scale = Math.max(stamp.sizeScale ?? 1, 0);
      const stampPixelSize = this.getBrushSize() * sizeFactor * scale;
      const usesShapeTexture = this.shapeTextureReady && this.shapeTexture;
      const halfExtent = stampPixelSize * (usesShapeTexture ? Math.SQRT1_2 : 0.5) + 2;

      return {
        minX: stamp.x - halfExtent,
        minY: stamp.y - halfExtent,
        maxX: stamp.x + halfExtent,
        maxY: stamp.y + halfExtent,
      };
    }
,

    includeStrokeStampBounds(stamp) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getStrokeAllocationBounds(target);
      const bounds = this.getStampBounds(stamp);
      const clampedBounds = {
        minX: Math.max(paintRect.x, bounds.minX),
        minY: Math.max(paintRect.y, bounds.minY),
        maxX: Math.min(paintRect.x + paintRect.width, bounds.maxX),
        maxY: Math.min(paintRect.y + paintRect.height, bounds.maxY),
      };

      if (clampedBounds.maxX <= clampedBounds.minX || clampedBounds.maxY <= clampedBounds.minY) {
        return;
      }

      this.includeStrokeTilePatchRect({
        x: Math.floor(clampedBounds.minX),
        y: Math.floor(clampedBounds.minY),
        width: Math.max(1, Math.ceil(clampedBounds.maxX) - Math.floor(clampedBounds.minX)),
        height: Math.max(1, Math.ceil(clampedBounds.maxY) - Math.floor(clampedBounds.minY)),
      });

      if (!this.activeStrokeBounds) {
        this.activeStrokeBounds = clampedBounds;
      } else {
        this.activeStrokeBounds.minX = Math.min(this.activeStrokeBounds.minX, clampedBounds.minX);
        this.activeStrokeBounds.minY = Math.min(this.activeStrokeBounds.minY, clampedBounds.minY);
        this.activeStrokeBounds.maxX = Math.max(this.activeStrokeBounds.maxX, clampedBounds.maxX);
        this.activeStrokeBounds.maxY = Math.max(this.activeStrokeBounds.maxY, clampedBounds.maxY);
      }

      this.queueActiveStrokeDirtyRegionDebug();
      this.queueStrokeTargetPrewarm();
    }
,

    getStampBufferDirtyRect(stamps, clipRect = null) {
      if (!Array.isArray(stamps) || stamps.length === 0) {
        return null;
      }

      let dirtyRect = null;

      for (let index = 0; index < stamps.length; index += 1) {
        const bounds = this.getStampBounds(stamps[index]);
        const x = Math.floor(bounds.minX);
        const y = Math.floor(bounds.minY);
        const width = Math.ceil(bounds.maxX) - x;
        const height = Math.ceil(bounds.maxY) - y;

        if (width <= 0 || height <= 0) {
          continue;
        }

        dirtyRect = this.unionDocumentRects(dirtyRect, {
          height,
          width,
          x,
          y,
        });
      }

      if (!dirtyRect) {
        return null;
      }

      return clipRect
        ? this.intersectDocumentRects(dirtyRect, clipRect)
        : dirtyRect;
    }
,

    getStrokeBufferScissor(rect, strokeBufferRect = this.strokeBufferRect) {
      const clipped = this.intersectDocumentRects(rect, strokeBufferRect);

      if (!clipped || !strokeBufferRect) {
        return null;
      }

      const x = Math.max(0, Math.round(clipped.x - strokeBufferRect.x));
      const y = Math.max(0, Math.round(
        strokeBufferRect.height - ((clipped.y - strokeBufferRect.y) + clipped.height),
      ));
      const width = Math.max(0, Math.round(clipped.width));
      const height = Math.max(0, Math.round(clipped.height));

      return width > 0 && height > 0
        ? { height, width, x, y }
        : null;
    }
,

    setStrokeBufferScissor(scissor) {
      if (!scissor) {
        return false;
      }

      const gl = this.gl;

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);

      return true;
    }
,

    includeStrokeTilePatchRect(rect) {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const renderer = this.documentRenderer;
      const tileSize = renderer?.getRasterHistoryTileSize?.() || 256;
      const tileRects = renderer?.getRasterHistoryTileRects?.(rect, { tileSize }) || [];

      if (tileRects.length === 0) {
        return;
      }

      if (!this.activeStrokeTilePatchRects) {
        this.activeStrokeTilePatchRects = new Map();
      }

      for (const tile of tileRects) {
        const key = `${tile.tx}:${tile.ty}`;
        const previous = this.activeStrokeTilePatchRects.get(key);
        const patchRect = previous?.patchRect
          ? renderer.unionRasterHistoryRects?.(previous.patchRect, tile.patchRect || tile.rect)
          : tile.patchRect || tile.rect;

        this.activeStrokeTilePatchRects.set(key, {
          patchRect: { ...patchRect },
          rect: { ...patchRect },
          tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
          tx: tile.tx,
          ty: tile.ty,
        });
      }
    }
,

    getActiveStrokeTilePatchRects(clipRect = null) {
      if (!(this.activeStrokeTilePatchRects instanceof Map)) {
        return null;
      }

      const renderer = this.documentRenderer;
      const patchRects = [];

      for (const item of this.activeStrokeTilePatchRects.values()) {
        const patchRect = clipRect
          ? renderer?.intersectRasterHistoryRects?.(item.patchRect, clipRect)
          : item.patchRect;

        if (!patchRect) {
          continue;
        }

        patchRects.push({
          patchRect: { ...patchRect },
          rect: { ...patchRect },
          tileRect: item.tileRect ? { ...item.tileRect } : null,
          tx: item.tx,
          ty: item.ty,
        });
      }

      return patchRects.length > 0 ? patchRects : null;
    }
,

    getActiveAreaSelectionCoverageRects(rect) {
      if (!rect) {
        return null;
      }

      const artboardRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || "");
      const clippedRect = artboardRect
        ? this.intersectDocumentRects(rect, artboardRect)
        : rect;

      if (!clippedRect) {
        return artboardRect ? [] : null;
      }

      if (!namespace.areaSelection?.hasSelection?.()) {
        return artboardRect ? [clippedRect] : null;
      }

      const rects = namespace.areaSelection.getIntersectingRects?.(clippedRect) || [];

      if (!artboardRect) {
        return rects.length > 0 ? rects : [];
      }

      const clippedRects = rects
        .map((selectionRect) => this.intersectDocumentRects(selectionRect, artboardRect))
        .filter(Boolean);

      return clippedRects.length > 0 ? clippedRects : [];
    }
,

    getActiveAreaSelectionMask(rect) {
      if (!namespace.areaSelection?.hasSelection?.() || !rect) {
        return null;
      }

      const region = namespace.areaSelection.getRegionSnapshot?.();
      const mask = region?.createMaskPixels?.(rect);

      return mask?.rect && mask.width > 0 && mask.height > 0
        ? {
            ...mask,
            version: region.version,
          }
        : null;
    }
,

    getBoundsForDocumentRects(rects) {
      if (!Array.isArray(rects) || rects.length === 0) {
        return null;
      }

      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;

      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
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
,

    intersectDocumentRects(a, b) {
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
,

    unionDocumentRects(a, b) {
      if (!a) {
        return b ? { ...b } : null;
      }

      if (!b) {
        return { ...a };
      }

      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const x1 = Math.max(a.x + a.width, b.x + b.width);
      const y1 = Math.max(a.y + a.height, b.y + b.height);

      return {
        height: y1 - y0,
        width: x1 - x0,
        x: x0,
        y: y0,
      };
    }
,

    getPreviewDirtyTileSize() {
      const configured = Number(this.options?.previewDirtyTileSize);

      if (Number.isFinite(configured) && configured > 0) {
        return Math.max(64, Math.round(configured));
      }

      const historyTileSize = Number(this.documentRenderer?.getRasterHistoryTileSize?.());

      return Math.max(
        128,
        Math.round(Number.isFinite(historyTileSize) && historyTileSize > 0
          ? historyTileSize * 2
          : STROKE_PREVIEW_DIRTY_TILE_SIZE),
      );
    }
,

    getPreviewDirtyTileRects(rect, tileSize = this.getPreviewDirtyTileSize()) {
      if (!rect || rect.width <= 0 || rect.height <= 0 || !Number.isFinite(tileSize) || tileSize <= 0) {
        return [];
      }

      const size = Math.max(1, Math.round(tileSize));
      const edgeEpsilon = 1e-6;
      const minTx = Math.floor(rect.x / size);
      const maxTx = Math.floor((rect.x + rect.width - edgeEpsilon) / size);
      const minTy = Math.floor(rect.y / size);
      const maxTy = Math.floor((rect.y + rect.height - edgeEpsilon) / size);
      const tileRects = [];

      for (let ty = minTy; ty <= maxTy; ty += 1) {
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          const tileRect = {
            height: size,
            width: size,
            x: tx * size,
            y: ty * size,
          };
          const patchRect = this.documentRenderer?.intersectRasterHistoryRects?.(rect, tileRect) ||
            this.intersectDocumentRects(rect, tileRect);

          if (!patchRect) {
            continue;
          }

          tileRects.push({
            patchRect: { ...patchRect },
            rect: { ...patchRect },
            tileRect,
            tx,
            ty,
          });
        }
      }

      return tileRects;
    }
,

    getTileBasedPreviewDirtyRects(sourceRects, effectiveStrokeRect) {
      const rawRects = Array.isArray(sourceRects) && sourceRects.length > 0
        ? sourceRects
        : (effectiveStrokeRect ? [effectiveStrokeRect] : []);
      const tileSize = this.getPreviewDirtyTileSize();
      const dirtyTiles = new Map();

      rawRects.forEach((item) => {
        const rect = item?.patchRect || item?.rect || item;
        const clippedRect = effectiveStrokeRect
          ? this.documentRenderer?.intersectRasterHistoryRects?.(rect, effectiveStrokeRect) ||
            this.intersectDocumentRects(rect, effectiveStrokeRect)
          : rect;

        if (!clippedRect || clippedRect.width <= 0 || clippedRect.height <= 0) {
          return;
        }

        this.getPreviewDirtyTileRects(clippedRect, tileSize).forEach((tile) => {
          const key = `${tile.tx}:${tile.ty}`;
          const previous = dirtyTiles.get(key);
          const nextRect = previous
            ? this.documentRenderer?.unionRasterHistoryRects?.(previous.rect, tile.patchRect) ||
              this.unionDocumentRects(previous.rect, tile.patchRect)
            : tile.patchRect;

          dirtyTiles.set(key, {
            rect: { ...nextRect },
            tx: tile.tx,
            ty: tile.ty,
          });
        });
      });

      return Array.from(dirtyTiles.values())
        .sort((first, second) => (first.ty - second.ty) || (first.tx - second.tx))
        .map((tile) => ({ ...tile.rect }));
    }
,

    clonePreviewDirtyRects(rects) {
      if (!Array.isArray(rects)) {
        return [];
      }

      return rects
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => ({ ...rect }));
    }
,

    storeStrokePreviewDirtyRects(rects) {
      const cloned = this.clonePreviewDirtyRects(rects);

      if (cloned.length > 0) {
        this.strokePreviewDirtyRects = cloned;
        this.lastStrokePreviewDirtyRects = cloned.map((rect) => ({ ...rect }));
      }

      return cloned;
    }
,

    updateStrokePreviewDirtyRects(effectiveStrokeRect = null, tilePatchRects = null) {
      const strokeRect = effectiveStrokeRect || this.getActiveStrokeRect();

      if (!strokeRect) {
        return [];
      }

      return this.storeStrokePreviewDirtyRects(
        this.getActiveStrokePreviewDirtyRects(strokeRect, tilePatchRects),
      );
    }
,

    getFallbackStrokePreviewDirtyRects(effectiveStrokeRect = null) {
      const storedRects = this.clonePreviewDirtyRects(this.strokePreviewDirtyRects);

      if (storedRects.length > 0) {
        return storedRects;
      }

      const lastRects = this.clonePreviewDirtyRects(this.lastStrokePreviewDirtyRects);

      if (lastRects.length > 0) {
        return lastRects;
      }

      return effectiveStrokeRect && effectiveStrokeRect.width > 0 && effectiveStrokeRect.height > 0
        ? [{ ...effectiveStrokeRect }]
        : [];
    }
,

    getPreviewDirtyRectsCoverage(rects, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const cloned = this.clonePreviewDirtyRects(rects);

      if (!cloned.length) {
        return 0;
      }

      const targetRect = {
        height: Math.max(1, Math.round(target?.height || this.height || 1)),
        width: Math.max(1, Math.round(target?.width || this.width || 1)),
        x: Number.isFinite(target?.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target?.y) ? Math.round(target.y) : 0,
      };
      const targetPixels = targetRect.width * targetRect.height;

      if (targetPixels <= 0) {
        return 0;
      }

      const dirtyPixels = cloned.reduce((sum, rect) => {
        const clipped = this.documentRenderer?.intersectRasterHistoryRects?.(rect, targetRect) ||
          this.intersectDocumentRects(rect, targetRect);

        if (!clipped) {
          return sum;
        }

        return sum + Math.max(0, Math.round(clipped.width || 0)) * Math.max(0, Math.round(clipped.height || 0));
      }, 0);

      return Math.min(1, Math.max(0, dirtyPixels / targetPixels));
    }
,

    shouldKeepPreviewCacheForDirtyBake(previewDirtyRects, memoryReport = null, target = null) {
      const rects = this.clonePreviewDirtyRects(previewDirtyRects);

      if (!rects.length || rects.length > STROKE_PREVIEW_DIRTY_MAX_RECTS) {
        return false;
      }

      const dirtyCoverage = this.getPreviewDirtyRectsCoverage(
        rects,
        target || memoryReport?.canvasSize || this.getDocumentDrawTarget(this.strokeTargetLayerId || ""),
      );

      return dirtyCoverage > 0 && dirtyCoverage <= STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE;
    }
,

    emitActiveStrokeDirtyRegionDebug() {
      this.activeStrokeDirtyDebugFrame = 0;

      if (!this.isDrawing) {
        return;
      }

      const strokeRect = this.getActiveStrokeRect();
      const rects = this.updateStrokePreviewDirtyRects(strokeRect);

      if (namespace.debugPreviewDirtyRegions !== true || !strokeRect || rects.length === 0) {
        return;
      }

      window.dispatchEvent(new CustomEvent(PREVIEW_DIRTY_DEBUG_EVENT, {
        detail: {
          generatedAt: Date.now(),
          layerId: this.strokeTargetLayerId || "",
          live: true,
          mode: "partial-live",
          reason: `${this.currentStrokeTool || "brush"}-live`,
          rects,
        },
      }));
    }
,

    queueActiveStrokeDirtyRegionDebug() {
      if (
        namespace.debugPreviewDirtyRegions !== true ||
        this.activeStrokeDirtyDebugFrame ||
        this.isDisposed
      ) {
        return;
      }

      const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout?.(callback, 16) || 0);

      this.activeStrokeDirtyDebugFrame = requestFrame(() => this.emitActiveStrokeDirtyRegionDebug());
    }
,

    cancelActiveStrokeDirtyRegionDebug() {
      if (!this.activeStrokeDirtyDebugFrame) {
        return;
      }

      if (window.cancelAnimationFrame) {
        window.cancelAnimationFrame(this.activeStrokeDirtyDebugFrame);
      } else {
        window.clearTimeout?.(this.activeStrokeDirtyDebugFrame);
      }

      this.activeStrokeDirtyDebugFrame = 0;
    }
,

    queueStrokeTargetPrewarm() {
      if (
        this.currentStrokeTool === "eraser" ||
        !this.isDrawing ||
        (
          namespace.interactiveBrushPrewarmEnabled !== true &&
          namespace.EngineGovernor?.mode === "interactive"
        ) ||
        this.activeStrokeTargetPrewarmFrame ||
        this.isDisposed ||
        typeof this.documentRenderer?.prewarmRasterTargetsForPaintRect !== "function"
      ) {
        return;
      }

      const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout?.(callback, 16) || 0);

      this.activeStrokeTargetPrewarmFrame = requestFrame(() => {
        this.activeStrokeTargetPrewarmFrame = 0;
        this.prewarmStrokePaintTargets();
      });
    }
,

    cancelStrokeTargetPrewarm() {
      if (!this.activeStrokeTargetPrewarmFrame) {
        return;
      }

      if (window.cancelAnimationFrame) {
        window.cancelAnimationFrame(this.activeStrokeTargetPrewarmFrame);
      } else {
        window.clearTimeout?.(this.activeStrokeTargetPrewarmFrame);
      }

      this.activeStrokeTargetPrewarmFrame = 0;
    }
,

    prewarmStrokePaintTargets(maxNewTiles = STROKE_TARGET_PREWARM_MAX_TILES) {
      if (
        this.currentStrokeTool === "eraser" ||
        !this.isDrawing ||
        (
          namespace.interactiveBrushPrewarmEnabled !== true &&
          namespace.EngineGovernor?.mode === "interactive"
        ) ||
        typeof this.documentRenderer?.prewarmRasterTargetsForPaintRect !== "function"
      ) {
        return 0;
      }

      const layerId = this.strokeTargetLayerId || this.documentRenderer?.resolvePaintLayerId?.() || "";
      const strokeRect = this.getActiveStrokeRect();

      if (!layerId || !strokeRect) {
        return 0;
      }

      const selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(strokeRect);
      const hasSelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length > 0;
      const hasEmptySelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length === 0;

      if (hasEmptySelectionCoverage) {
        return 0;
      }

      const effectiveStrokeRect = hasSelectionCoverage
        ? this.getBoundsForDocumentRects(selectionCoverageRects)
        : strokeRect;

      if (!effectiveStrokeRect) {
        return 0;
      }

      const activeStrokeTilePatchRects = hasSelectionCoverage
        ? this.filterTilePatchRectsToCoverage(
            this.getActiveStrokeTilePatchRects(effectiveStrokeRect),
            selectionCoverageRects,
          )
        : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.targets.prewarm", {
        layerId,
        maxNewTiles,
        tilePatchRectCount: Array.isArray(activeStrokeTilePatchRects) ? activeStrokeTilePatchRects.length : 0,
      }) : null;

      try {
        const targets = this.documentRenderer.prewarmRasterTargetsForPaintRect(layerId, effectiveStrokeRect, {
          maxNewTiles,
          source: "brush-stroke-target-prewarm",
          tilePatchRects: activeStrokeTilePatchRects,
        });

        return Array.isArray(targets) ? targets.length : 0;
      } finally {
        trace?.end({
          maxNewTiles,
        });
      }
    }
,

    filterTilePatchRectsToCoverage(tilePatchRects, coverageRects) {
      if (!Array.isArray(tilePatchRects) || !Array.isArray(coverageRects) || coverageRects.length === 0) {
        return tilePatchRects;
      }

      const renderer = this.documentRenderer;
      const filtered = [];

      tilePatchRects.forEach((item) => {
        const patchRect = item?.patchRect || item?.rect || item;

        coverageRects.forEach((coverageRect) => {
          const clippedPatch = renderer?.intersectRasterHistoryRects?.(patchRect, coverageRect);

          if (!clippedPatch) {
            return;
          }

          filtered.push({
            ...item,
            patchRect: { ...clippedPatch },
            rect: { ...clippedPatch },
          });
        });
      });

      return filtered.length > 0 ? filtered : null;
    }
,

    getActiveStrokePreviewDirtyRects(effectiveStrokeRect, tilePatchRects = null) {
      const sourceRects = Array.isArray(tilePatchRects) && tilePatchRects.length > 0
        ? tilePatchRects
        : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);
      const dirtyRects = this.getTileBasedPreviewDirtyRects(sourceRects, effectiveStrokeRect);

      return dirtyRects.length > 0
        ? dirtyRects
        : (effectiveStrokeRect ? [{ ...effectiveStrokeRect }] : []);
    }
,

    getStrokePreviewDirtyRectsForBake(effectiveStrokeRect, tilePatchRects = null) {
      if (this.isAndroidDirtyRegionsDisabled()) {
        this.strokePreviewDirtyRects = null;
        this.lastStrokePreviewDirtyRects = null;
        return [];
      }

      const computedPreviewDirtyRects = this.updateStrokePreviewDirtyRects(
        effectiveStrokeRect,
        tilePatchRects,
      );

      return computedPreviewDirtyRects.length > 0
        ? computedPreviewDirtyRects
        : this.getFallbackStrokePreviewDirtyRects(effectiveStrokeRect);
    }
,

    warmPreviewCacheForStroke({ force = false } = {}) {
      if (
        this.isAndroidPreviewCacheDisabled() ||
        this.isDrawing ||
        (!force && namespace.EngineGovernor?.mode === "interactive") ||
        namespace.smudgeEngine?.isDragging ||
        !this.documentRenderer?.updatePreviewCacheIfNeeded
      ) {
        return false;
      }

      const previewCacheOptions = {
        camera: this.camera,
        dpr: this.dpr,
        viewportHeight: this.viewportHeight,
        viewportWidth: this.viewportWidth,
      };
      const previewCacheDimensions = typeof this.documentRenderer.getPreviewCacheDimensions === "function"
        ? this.documentRenderer.getPreviewCacheDimensions(previewCacheOptions)
        : null;

      if (
        typeof this.documentRenderer.shouldUsePreviewCacheForCamera === "function" &&
        !this.documentRenderer.shouldUsePreviewCacheForCamera(this.camera, previewCacheDimensions)
      ) {
        return false;
      }

      return this.documentRenderer.updatePreviewCacheIfNeeded(previewCacheOptions) === true;
    }
,

    getActiveStrokeRect() {
      if (!this.activeStrokeBounds) {
        return null;
      }

      const x = Math.floor(this.activeStrokeBounds.minX);
      const y = Math.floor(this.activeStrokeBounds.minY);
      const width = Math.ceil(this.activeStrokeBounds.maxX) - x;
      const height = Math.ceil(this.activeStrokeBounds.maxY) - y;

      if (width <= 0 || height <= 0) {
        return null;
      }

      return { x, y, width, height };
    }
,

    isStampCompletelyOutsideDocument(stamp) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target.layerId || "") ||
        this.getFullDocumentRect(target);
      const bounds = this.getStampBounds(stamp);

      return (
        bounds.maxX < paintRect.x ||
        bounds.minX > paintRect.x + paintRect.width ||
        bounds.maxY < paintRect.y ||
        bounds.minY > paintRect.y + paintRect.height
      );
    }
,

    applyStampJitter(stamp, tangent) {
      const radius = Math.max(0.5, this.getBrushSize() * 0.5);
      const lateral = this.clamp(this.brushState.jitterLateral, 0, 2) * radius;
      const linear = this.clamp(this.brushState.jitterLinear, 0, 2) * radius;

      if (lateral <= 0 && linear <= 0) {
        return stamp;
      }

      const lateralOffset = this.randomSigned() * lateral;
      const linearOffset = this.randomSigned() * linear;
      const perpendicular = {
        x: -tangent.y,
        y: tangent.x,
      };

      return {
        ...stamp,
        x: stamp.x + perpendicular.x * lateralOffset + tangent.x * linearOffset,
        y: stamp.y + perpendicular.y * lateralOffset + tangent.y * linearOffset,
      };
    }
,

    resolveActiveStrokeSymmetry(options = {}) {
      const tool = String(options.tool || this.currentStrokeTool || "").trim().toLowerCase();

      if (tool !== "brush" && tool !== "eraser") {
        return null;
      }

      const config = namespace.getActiveVerticalSymmetryConfig?.({
        layerId: options.layerId || this.strokeTargetLayerId || "",
      });

      return config?.mode === "vertical" && Number.isFinite(Number(config.axisX))
        ? {
            ...config,
            axisX: Number(config.axisX),
          }
        : null;
    }
,

    getActiveStrokeSymmetry() {
      const symmetry = this.activeStrokeSymmetry;

      return symmetry?.mode === "vertical" && Number.isFinite(Number(symmetry.axisX))
        ? symmetry
        : null;
    }
,

    createVerticalSymmetryStamp(stamp, symmetry = this.getActiveStrokeSymmetry()) {
      if (!stamp || !symmetry) {
        return null;
      }

      const axisX = Number(symmetry.axisX);
      const stampX = Number(stamp.x);

      if (!Number.isFinite(axisX) || !Number.isFinite(stampX)) {
        return null;
      }

      const mirroredX = axisX * 2 - stampX;

      if (Math.abs(mirroredX - stampX) < 0.001) {
        return null;
      }

      return {
        ...stamp,
        colorRgb: Array.isArray(stamp.colorRgb) ? [...stamp.colorRgb] : stamp.colorRgb,
        mirrorX: -(Number(stamp.mirrorX) || 1),
        rotation: -(Number(stamp.rotation) || 0),
        x: mirroredX,
      };
    }
,

    pushPreparedShapeStamp(stamp, tangent, options = {}) {
      const originalOutsideDocument = this.isStampCompletelyOutsideDocument(stamp);

      this.applyMovingGrainToStamp(stamp, tangent);

      if (options.assignColor !== false) {
        stamp.colorRgb = this.getNextStampColorRgb();
      }

      let didPushStamp = false;

      if (!originalOutsideDocument && options.includeBounds !== false) {
        this.includeStrokeStampBounds(stamp);
      }

      if (!originalOutsideDocument) {
        this.stampsBuffer.push(stamp);
        didPushStamp = true;
      }

      const mirroredStamp = this.createVerticalSymmetryStamp(stamp);

      if (mirroredStamp && !this.isStampCompletelyOutsideDocument(mirroredStamp)) {
        if (options.includeBounds !== false) {
          this.includeStrokeStampBounds(mirroredStamp);
        }

        this.stampsBuffer.push(mirroredStamp);
        didPushStamp = true;
      }

      return didPushStamp;
    }
,

    pushShapeStamps(baseStamp, tangent, options = {}) {
      this.applyPencilInputToStamp(baseStamp, tangent);
      const isFirstStrokeShape = this.strokeStampCount === 0 && this.stampsBuffer.length === 0 && this.strokeDistance === 0;
      const effectiveCount = this.getEffectiveShapeCount(
        isFirstStrokeShape ? () => this.createStableStrokeUnit(0x51f15eed) : null,
      );
      const hasDirectionalTangent = this.hasUsableShapeTangent(tangent);
      const shouldUpdateWhenTangentArrives = this.getShapeRotation() !== 0 && !hasDirectionalTangent;
      const directionalRotation = this.getShapeDirectionalRotation(tangent);
      const penTiltRotation = this.getPencilTiltRotation(baseStamp);
      const getScatterRotation = (index) => {
        if (!isFirstStrokeShape) {
          return this.getShapeScatterRotation();
        }

        return this.getShapeScatterRotation(
          this.createStableStrokeSigned((0x5ca77e12 + Math.imul(index + 1, 0x9e3779b1)) >>> 0),
        );
      };

      if (effectiveCount === 1) {
        const scatterRotation = getScatterRotation(0);

        baseStamp.rotation = directionalRotation + scatterRotation;
        baseStamp.penTiltRotation = penTiltRotation;
        baseStamp.rotation += penTiltRotation;
        if (shouldUpdateWhenTangentArrives) {
          baseStamp.needsShapeRotationTangent = true;
          baseStamp.shapeScatterRotation = scatterRotation;
        }

        this.pushPreparedShapeStamp(baseStamp, tangent, options);
        return;
      }

      for (let index = 0; index < effectiveCount; index += 1) {
        const scatterRotation = getScatterRotation(index);
        const stamp = {
          ...baseStamp,
          penTiltRotation,
          rotation: directionalRotation + penTiltRotation + scatterRotation,
        };

        if (shouldUpdateWhenTangentArrives) {
          stamp.needsShapeRotationTangent = true;
          stamp.shapeScatterRotation = scatterRotation;
        }

        this.pushPreparedShapeStamp(stamp, tangent, options);
      }
    }
,

    processStamps(options = {}) {
      if (this.currentStroke.length !== 4) {
        return;
      }

      const deferFlush = options.deferFlush === true;
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.process-stamps", {
        tool: this.currentStrokeTool || "brush",
      }) : null;

      try {
      const [p0, p1, p2, p3] = this.currentStroke;
      const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (segmentDistance <= 0) {
        this.applyPendingShapeRotation(this.getPointTangent(p2, p3));
        this.currentStroke.shift();
        if (!deferFlush) {
          this.flushStamps();
        }
        return;
      }

      const sampleCount = this.getStrokeSegmentSampleCount(segmentDistance);
      let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

      this.updateAdaptiveSpacingForSegment(p1, p2);

      for (let index = 1; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const point = this.catmullRom(p0, p1, p2, p3, t);
        const stepDistance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);

        if (stepDistance > 0) {
          const tangent = {
            x: (point.x - previousPoint.x) / stepDistance,
            y: (point.y - previousPoint.y) / stepDistance,
          };

          this.lastStrokeTangent = tangent;
          this.applyPendingShapeRotation(tangent);
          this.leftoverDistance += stepDistance;

          while (this.leftoverDistance >= this.nextStampDistance) {
            const stampDistance = this.nextStampDistance;
            const overshoot = this.leftoverDistance - stampDistance;
            const distanceFromPrevious = stepDistance - overshoot;
            const stampT = Math.max(0, Math.min(1, distanceFromPrevious / stepDistance));
            const stamp = this.applyStampJitter(this.lerpStamp(previousPoint, point, stampT), tangent);

            this.strokeDistance += stampDistance;
            stamp.alphaScale = this.getStampAlphaScale();
            stamp.sizeScale = 1;
            this.applyPencilInputToStamp(stamp, tangent);
            this.applyTaperToStamp(stamp);
            this.pushShapeStamps(stamp, tangent);
            if (this.stampsBuffer.length >= this.getMaxStampsPerFlush()) {
              this.flushStamps({ requestDraw: !deferFlush });
            }
            this.leftoverDistance -= stampDistance;
            this.nextStampDistance = this.getStampSpacing(stamp);
          }
        }

        previousPoint = point;
      }

      this.currentStroke.shift();
      if (!deferFlush) {
        this.flushStamps();
      }
      } finally {
        trace?.end({
          bufferedStamps: this.stampsBuffer.length,
          strokeStamps: this.strokeStampCount,
        });
      }
    }

    });
  };
})(window.CBO = window.CBO || {});
