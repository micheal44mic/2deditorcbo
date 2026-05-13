window.CBO = window.CBO || {};

(function registerBrushEngine(namespace) {
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 32;
  const WHEEL_ZOOM_INTENSITY = 0.0015;
  const PINCH_ZOOM_INTENSITY = 0.01;
  const CROPPED_BRUSH_STROKES = true;
  const STROKE_ALLOCATION_QUANTUM = 128;
  const STROKE_FINAL_PADDING = 6;
  const STROKE_SAMPLE_CLAMP_MIN_PADDING = 64;
  const STROKE_PREVIEW_DIRTY_TILE_SIZE = 512;
  const STROKE_PREVIEW_DIRTY_MAX_RECTS = 96;
  const STROKE_PREVIEW_DIRTY_KEEP_CACHE_MAX_COVERAGE = 0.45;
  const STROKE_TARGET_PREWARM_MAX_TILES = 2;
  const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug";
  const ERASER_EMPTY_LAYER_TOAST_MS = 800;
  const ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS = 1600;
  const MAX_STAMPS_PER_FLUSH = 4096;
  const BRUSH_HISTORY_BATCH_IDLE_MS = 1000;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const STROKE_MEMORY_POLICY = Object.freeze({
    normalMaxBytes: 5 * RASTER_MIB,
    mediumMaxBytes: 32 * RASTER_MIB,
    largeMaxBytes: 128 * RASTER_MIB,
    largeCoverage: 0.25,
    hugeCoverage: 0.35,
  });
  const VELOCITY_PRESSURE_MAX_SPEED = 5;
  const VELOCITY_PRESSURE_SMOOTHING = 0.02;
  const RENDERING_MODE_PRESETS = Object.freeze({
    "light-glaze": { strokeBuildUp: 0 },
    "uniform-glaze": { strokeBuildUp: 0.15 },
    "intense-glaze": { strokeBuildUp: 0.35 },
    "heavy-glaze": { strokeBuildUp: 0.6 },
    "uniform-blending": { strokeBuildUp: 0.8 },
    "intense-blending": { strokeBuildUp: 1 },
  });
  const COLOR_GOLDEN_RATIO = 0.618033988749895;

  const BRUSH_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 aInstancePos;
layout(location = 2) in float aInstancePressure;
layout(location = 3) in float aInstanceAlpha;
layout(location = 4) in float aInstanceSizeScale;
layout(location = 5) in float aInstanceRotation;
layout(location = 6) in vec3 aInstanceColor;
layout(location = 7) in vec2 aInstanceGrainOffset;
layout(location = 8) in float aInstanceGrainTravel;
layout(location = 9) in float aInstanceGrainRotation;
layout(location = 10) in float aInstanceGrainDepthScale;

uniform vec2 u_docResolution;
uniform vec2 u_targetOrigin;
uniform vec2 u_targetSize;
uniform float u_brushSize;
uniform float u_minSizeRatio;
uniform vec2 u_shapeFlip;

out vec2 v_uv;
out vec2 v_localPosition;
out vec2 v_docPosition;
out vec2 v_grainOffset;
out float v_grainTravel;
out float v_grainRotation;
out float v_grainDepthScale;
out float v_stampPixelSize;
out float v_pressure;
out float v_alpha;
out vec3 v_color;

void main() {
  // Min-size ratio evita che pressure=0 collassi lo stamp a 0px (problema con stylus).
  float pressure = clamp(aInstancePressure, 0.0, 1.0);
  float sizeFactor = mix(u_minSizeRatio, 1.0, pressure);
  // aInstanceSizeScale e' il moltiplicatore esterno dei dab (taper, ecc.):
  // bypassa il min-size ratio quindi puo' arrivare davvero a 0 (taper a punta).
  float scale = max(aInstanceSizeScale, 0.0);
  vec2 localPosition = a_position * u_shapeFlip;
  float angle = aInstanceRotation;
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotatedPosition = vec2(
    localPosition.x * c - localPosition.y * s,
    localPosition.x * s + localPosition.y * c
  );
  float stampPixelSize = u_brushSize * sizeFactor * scale;
  vec2 documentPosition = aInstancePos + rotatedPosition * stampPixelSize;
  vec2 targetPosition = (documentPosition - u_targetOrigin) / max(u_targetSize, vec2(1.0));
  vec2 clipPosition = targetPosition * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_uv = a_position + 0.5;
  v_localPosition = a_position;
  v_docPosition = documentPosition;
  v_grainOffset = aInstanceGrainOffset;
  v_grainTravel = aInstanceGrainTravel;
  v_grainRotation = aInstanceGrainRotation;
  v_grainDepthScale = clamp(aInstanceGrainDepthScale, 0.0, 1.0);
  v_stampPixelSize = stampPixelSize;
  v_pressure = pressure;
  v_alpha = clamp(aInstanceAlpha, 0.0, 1.0);
  v_color = aInstanceColor;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const BRUSH_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform float u_flow;
uniform float u_hardness;
uniform float u_wetEdges;
uniform float u_burntEdges;
uniform int u_burntEdgesMode;
uniform bool u_alphaThresholdEnabled;
uniform float u_alphaThreshold;
uniform sampler2D u_shapeTexture;
uniform float u_useShapeTexture;
uniform bool u_grainEnabled;
uniform sampler2D u_grainTexture;
uniform vec2 u_grainTexSize;
uniform int u_grainMode;
uniform float u_grainScale;
uniform mat2 u_grainRotationMat;
uniform float u_grainDepth;
uniform float u_grainMovement;
uniform float u_grainZoom;
uniform float u_grainDepthMinimum;
uniform int u_grainBlendMode;
uniform float u_grainBrightness;
uniform float u_grainContrast;
uniform bool u_grainInvert;

in vec2 v_uv;
in vec2 v_localPosition;
in vec2 v_docPosition;
in vec2 v_grainOffset;
in float v_grainTravel;
in float v_grainRotation;
in float v_grainDepthScale;
in float v_stampPixelSize;
in float v_pressure;
in float v_alpha;
in vec3 v_color;

out vec4 outColor;

const int GRAIN_BLEND_MULTIPLY = 0;
const int GRAIN_BLEND_DARKEN = 1;
const int GRAIN_BLEND_LINEAR_BURN = 2;
const int GRAIN_BLEND_OVERLAY = 3;
const int GRAIN_BLEND_LIGHTEN = 4;
const int GRAIN_BLEND_DIFFERENCE = 5;
const int GRAIN_MODE_TEXTURIZED = 0;
const int GRAIN_MODE_MOVING = 1;
const int BURNT_EDGES_MULTIPLY = 0;
const int BURNT_EDGES_COLOR_BURN = 1;
const int BURNT_EDGES_LINEAR_BURN = 2;

float applyFlowCoverageCurve(float coverage, float flow) {
  float safeCoverage = clamp(coverage, 0.0, 1.0);
  float safeFlow = clamp(flow, 0.0, 1.0);
  float edgePower = mix(2.35, 1.0, safeFlow);

  return pow(safeCoverage, edgePower);
}

vec3 blendOverlay(vec3 baseColor, vec3 blendColor) {
  vec3 low = 2.0 * baseColor * blendColor;
  vec3 high = 1.0 - 2.0 * (1.0 - baseColor) * (1.0 - blendColor);

  return mix(low, high, step(vec3(0.5), baseColor));
}

vec3 blendColorBurn(vec3 baseColor, vec3 blendColor) {
  vec3 safeBlend = max(blendColor, vec3(0.001));

  return 1.0 - min(vec3(1.0), (1.0 - baseColor) / safeBlend);
}

vec3 applyBurntEdgesMode(vec3 baseColor, float mask, int mode) {
  float strength = clamp(mask, 0.0, 1.0);
  vec3 blendColor = vec3(1.0 - strength * 0.72);

  if (mode == BURNT_EDGES_COLOR_BURN) {
    return blendColorBurn(baseColor, blendColor);
  }

  if (mode == BURNT_EDGES_LINEAR_BURN) {
    return max(baseColor + blendColor - 1.0, vec3(0.0));
  }

  return baseColor * blendColor;
}

float getBurntEdgeMask(float shape, float amount) {
  float safeShape = clamp(shape, 0.0, 1.0);
  float softRing = smoothstep(0.04, 0.45, safeShape) * (1.0 - smoothstep(0.55, 0.9, safeShape));
  float hardRing = clamp(fwidth(safeShape) * 16.0, 0.0, 1.0) * smoothstep(0.001, 0.15, safeShape);

  return clamp(max(softRing, hardRing) * clamp(amount, 0.0, 1.0), 0.0, 1.0);
}

vec3 applyGrainBlendMode(vec3 baseColor, float grain, int blendMode) {
  vec3 grainColor = vec3(grain);

  if (blendMode == GRAIN_BLEND_DARKEN) {
    return min(baseColor, grainColor);
  }

  if (blendMode == GRAIN_BLEND_LINEAR_BURN) {
    return max(baseColor + grainColor - 1.0, vec3(0.0));
  }

  if (blendMode == GRAIN_BLEND_OVERLAY) {
    return blendOverlay(baseColor, grainColor);
  }

  if (blendMode == GRAIN_BLEND_LIGHTEN) {
    return max(baseColor, grainColor);
  }

  if (blendMode == GRAIN_BLEND_DIFFERENCE) {
    return abs(baseColor - grainColor);
  }

  return baseColor * grainColor;
}

float getGrainCoverage(float grain, int blendMode) {
  if (
    blendMode == GRAIN_BLEND_MULTIPLY ||
    blendMode == GRAIN_BLEND_DARKEN ||
    blendMode == GRAIN_BLEND_LINEAR_BURN
  ) {
    return grain;
  }

  if (blendMode == GRAIN_BLEND_OVERLAY) {
    return mix(1.0, grain, 0.45);
  }

  if (blendMode == GRAIN_BLEND_LIGHTEN) {
    return mix(1.0, grain, 0.12);
  }

  if (blendMode == GRAIN_BLEND_DIFFERENCE) {
    return mix(1.0, grain, 0.18);
  }

  return grain;
}

float applyGrainAdjustments(float grain, float depth) {
  float userContrast = u_grainContrast < 0.0
    ? 1.0 + clamp(u_grainContrast, -1.0, 0.0)
    : 1.0 + clamp(u_grainContrast, 0.0, 1.0) * 2.0;
  float depthContrast = mix(1.0, 1.75, depth);
  float contrastedGrain = (grain - 0.5) * depthContrast * userContrast + 0.5;

  return clamp(contrastedGrain + clamp(u_grainBrightness, -1.0, 1.0), 0.0, 1.0);
}

vec2 rotateGrainPosition(vec2 position, float angle) {
  float c = cos(angle);
  float s = sin(angle);

  return vec2(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  );
}

vec2 getMovingGrainUv(vec2 safeTextureSize) {
  float zoom = clamp(u_grainZoom, 0.0, 1.0);
  float movement = clamp(u_grainMovement, 0.0, 1.0);
  vec2 followSizePosition = v_localPosition * safeTextureSize;
  vec2 croppedPosition = v_localPosition * max(v_stampPixelSize, 1.0);
  vec2 grainPosition = mix(followSizePosition, croppedPosition, zoom);

  grainPosition += vec2(v_grainTravel * movement, 0.0);
  grainPosition = rotateGrainPosition(grainPosition, v_grainRotation) + v_grainOffset;

  return grainPosition / (safeTextureSize * max(u_grainScale, 0.0001));
}

float getMovingGrainDepth(float baseDepth) {
  float minimum = clamp(u_grainDepthMinimum, 0.0, 1.0);
  float pressureDepth = mix(minimum, 1.0, clamp(v_pressure, 0.0, 1.0));
  float jitterDepth = clamp(v_grainDepthScale, 0.0, 1.0);
  float depthScale = max(minimum, pressureDepth * jitterDepth);

  return clamp(baseDepth * depthScale, 0.0, 1.0);
}

void applyGrainSample(vec2 grainUv, float depth, inout vec3 brushColor, inout float grainCoverage) {
  float grain = texture(u_grainTexture, grainUv).r;
  float adjustedGrain = applyGrainAdjustments(grain, depth);

  if (u_grainInvert) {
    adjustedGrain = 1.0 - adjustedGrain;
  }

  vec3 blendedColor = applyGrainBlendMode(v_color, adjustedGrain, u_grainBlendMode);

  brushColor = mix(v_color, blendedColor, depth);
  grainCoverage = mix(1.0, getGrainCoverage(adjustedGrain, u_grainBlendMode), depth);
}

void main() {
  float shape = 1.0;

  if (u_useShapeTexture > 0.5) {
    float coreShape = texture(u_shapeTexture, v_uv).a;

    if (u_wetEdges > 0.0) {
      float offset = 0.05 * u_wetEdges;
      float rightShape = texture(u_shapeTexture, v_uv + vec2(offset, 0.0)).a;
      float leftShape = texture(u_shapeTexture, v_uv + vec2(-offset, 0.0)).a;
      float topShape = texture(u_shapeTexture, v_uv + vec2(0.0, offset)).a;
      float bottomShape = texture(u_shapeTexture, v_uv + vec2(0.0, -offset)).a;
      float blurredShape = (coreShape * 2.0 + rightShape + leftShape + topShape + bottomShape) / 6.0;

      shape = mix(coreShape, blurredShape, u_wetEdges);
    } else {
      shape = coreShape;
    }
  } else {
    float distanceFromCenter = distance(v_uv, vec2(0.5));

    if (distanceFromCenter > 0.5) {
      discard;
    }

    // Hardness=1: bordo nitido (fade in 1 px AA). Hardness=0: gradiente radiale dal centro.
    float fw = max(fwidth(distanceFromCenter), 0.001);
    float effectiveHardness = clamp(u_hardness * (1.0 - u_wetEdges * 0.8), 0.0, 1.0);
    float edgeStart = mix(0.0, 0.5 - fw, effectiveHardness);
    shape = 1.0 - smoothstep(edgeStart, 0.5, distanceFromCenter);
  }

  if (shape <= 0.001) {
    discard;
  }

  if (u_wetEdges > 0.0) {
    float phase = mix(1.0, 1.5, u_wetEdges);
    float pooledShape = sin(clamp(shape, 0.0, 1.0) * 1.570796 * phase);

    shape = mix(shape, pooledShape, u_wetEdges);
  }

  float burntEdgeMask = getBurntEdgeMask(shape, u_burntEdges);
  vec3 brushColor = v_color;
  float grainCoverage = 1.0;

  if (u_grainEnabled && u_grainScale > 0.0) {
    vec2 safeTextureSize = max(u_grainTexSize, vec2(1.0));
    float depth = clamp(u_grainDepth, 0.0, 1.0);
    vec2 grainUv;

    if (u_grainMode == GRAIN_MODE_MOVING) {
      grainUv = getMovingGrainUv(safeTextureSize);
      depth = getMovingGrainDepth(depth);
    } else {
      vec2 rotatedPosition = u_grainRotationMat * v_docPosition;
      grainUv = rotatedPosition / (safeTextureSize * u_grainScale);
    }

    applyGrainSample(grainUv, depth, brushColor, grainCoverage);
  }

  if (burntEdgeMask > 0.0) {
    brushColor = applyBurntEdgesMode(brushColor, burntEdgeMask, u_burntEdgesMode);
  }

  float flow = clamp(u_flow, 0.0, 2.0);
  float coverage = shape * grainCoverage;
  if (burntEdgeMask > 0.0) {
    coverage = clamp(coverage + burntEdgeMask * 0.22, 0.0, 1.0);
  }

  if (flow < 1.0) {
    coverage = applyFlowCoverageCurve(coverage, flow);
  }

  if (u_alphaThresholdEnabled) {
    if (coverage < clamp(u_alphaThreshold, 0.0, 1.0)) {
      discard;
    }

    coverage = 1.0;
  }

  float alpha = clamp(coverage * v_alpha * flow, 0.0, 1.0);

  // Output pre-moltiplicato: necessario per la pipeline dello stroke attivo.
  outColor = vec4(clamp(brushColor, vec3(0.0), vec3(1.0)) * alpha, alpha);
}
`;

  const COMPOSITE_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const COMPOSITE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`;

  const STROKE_BUILDUP_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_plateauTexture;
uniform sampler2D u_accumTexture;
uniform float u_buildUp;

in vec2 v_uv;

out vec4 outColor;

void main() {
  vec4 plateauColor = texture(u_plateauTexture, v_uv);
  vec4 accumColor = texture(u_accumTexture, v_uv);

  outColor = mix(plateauColor, accumColor, clamp(u_buildUp, 0.0, 1.0));
}
`;

  const ImageCache = namespace.ImageCache || {
    entries: new Map(),

    load(source) {
      if (this.entries.has(source)) {
        return this.entries.get(source);
      }

      const promise = new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => {
          this.entries.delete(source);
          reject(new Error("Impossibile caricare la texture del pennello."));
        };
        image.src = source;
      });

      this.entries.set(source, promise);

      return promise;
    },
  };

  namespace.ImageCache = ImageCache;

  const GRAIN_BLEND_MODE_IDS = Object.freeze({
    multiply: 0,
    darken: 1,
    "linear-burn": 2,
    overlay: 3,
    lighten: 4,
    difference: 5,
  });
  const BURNT_EDGES_MODE_IDS = Object.freeze({
    multiply: 0,
    "color-burn": 1,
    "linear-burn": 2,
  });
  const GRAIN_TEXTURIZED_MIN_TEXTURE_SCALE = Math.max(
    0.001,
    namespace.BrushDefaults?.grainTexturizedMinTextureScale ?? 0.05,
  );

  class BrushEngine {
    constructor(canvas, options = {}) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("BrushEngine richiede un HTMLCanvasElement.");
      }

      this.canvas = canvas;
      this.options = {
        getSettings: typeof options.getSettings === "function" ? options.getSettings : null,
        transparentBackground: options.transparentBackground === true,
        singleStrokeMode: options.singleStrokeMode === true,
        disableNavigation: options.disableNavigation === true,
        disableInput: options.disableInput === true,
        manualRender: options.manualRender === true,
        enableHistory: options.enableHistory === true
          ? true
          : options.enableHistory === false
            ? false
            : !options.getSettings && options.disableInput !== true,
        historyBatchIdleMs: Number.isFinite(options.historyBatchIdleMs) && options.historyBatchIdleMs >= 0
          ? Math.floor(options.historyBatchIdleMs)
          : BRUSH_HISTORY_BATCH_IDLE_MS,
        respectActiveTool: options.respectActiveTool === true
          ? true
          : options.respectActiveTool === false
            ? false
            : !options.getSettings,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
      };
      this.gl = options.gl;

      if (!this.gl) {
        throw new Error("BrushEngine richiede un contesto WebGL2 gia' inizializzato.");
      }

      if (this.gl.canvas !== canvas) {
        throw new Error("Il contesto WebGL2 passato a BrushEngine deve appartenere al canvas del brush.");
      }

      if (!options.documentRenderer?.getPaintTarget) {
        throw new Error("BrushEngine richiede un DocumentRenderer gia' inizializzato.");
      }

      this.camera = { x: 0, y: 0, zoom: 1 };
      this.stage = canvas.closest(".editor-stage") || canvas.parentElement || canvas;
      this.dpr = 1;
      this.viewportWidth = 1;
      this.viewportHeight = 1;
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
      this.lastStrokeTangent = null;
      this.strokeDynamicsState = null;
      this.strokeRandomState = { seed: 1 };
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeGrainRandomState = null;
      this.velocityPressureState = null;
      this.strokeInitialSeed = 1;
      this.strokeShapeRotation = 0;
      this.strokeGrainOffset = { x: 0, y: 0 };
      this.strokeChargeRadius = null;
      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
      this.recordedStroke = [];
      this.lastRecordedStroke = [];
      this.isDrawing = false;
      this.activePointerId = null;
      this.isPanning = false;
      this.activePanPointerId = null;
      this.panCaptureElement = null;
      this.panLastViewportX = 0;
      this.panLastViewportY = 0;
      this.isSpaceHeld = false;
      this.userManipulatedCamera = false;
      this.frameRequest = 0;
      this.resizeObserver = null;
      this.isDisposed = false;
      this.isBrushToolActive = this.getInitialBrushToolActive();
      this.activeStrokeTool = this.activeStrokeTool || (this.isBrushToolActive ? "brush" : "");
      this.currentStrokeTool = "brush";
      this.strokeTargetLayerId = null;
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.activeStrokeDirtyDebugFrame = 0;
      this.activeStrokeTargetPrewarmFrame = 0;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.documentRenderer = options.documentRenderer;
      this.strokeTexture = null;
      this.strokeFBO = null;
      this.strokePlateauTexture = null;
      this.strokePlateauFBO = null;
      this.strokeAccumTexture = null;
      this.strokeAccumFBO = null;
      this.strokeBufferRect = null;
      this.lastStrokeMemoryReport = null;
      this.pendingBrushHistory = null;
      this.pendingBrushHistoryTimer = 0;
      this.isFlushingBrushHistory = false;
      this.emptyEraserLayerToastTimer = 0;
      this.lastEmptyEraserLayerToastAt = 0;
      this.brushProgramInfo = null;
      this.compositeProgramInfo = null;
      this.strokeBuildupProgramInfo = null;
      this.brush = null;
      this.shapeTexture = null;
      this.shapeTextureSource = "";
      this.shapeTextureReady = false;
      this.shapeTextureRequestId = 0;
      this.grainTexture = null;
      this.grainTextureSource = "";
      this.grainTextureReady = false;
      this.grainTextureRequestId = 0;
      this.grainImageWidth = 1;
      this.grainImageHeight = 1;
      this.fullscreenQuad = null;

      this.handleResize = this.handleResize.bind(this);
      this.handleBrushSettingsChange = this.handleBrushSettingsChange.bind(this);
      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleDocumentChange = this.handleDocumentChange.bind(this);
      this.handleBeforeHistoryAction = this.handleBeforeHistoryAction.bind(this);
      this.handleBeforeRasterHistoryCapture = this.handleBeforeRasterHistoryCapture.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleNavigationPointerDown = this.handleNavigationPointerDown.bind(this);
      this.handleNavigationPointerMove = this.handleNavigationPointerMove.bind(this);
      this.handleNavigationPointerUp = this.handleNavigationPointerUp.bind(this);
      this.handleNavigationPointerCancel = this.handleNavigationPointerCancel.bind(this);
      this.handleAuxClick = this.handleAuxClick.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleKeyUp = this.handleKeyUp.bind(this);
      this.handleWindowBlur = this.handleWindowBlur.bind(this);
      this.renderLoop = this.renderLoop.bind(this);

      // Misuriamo prima il viewport: serve a calcolare il documento con il giusto aspect ratio.
      this.resizeViewport();
      this.brushProgramInfo = this.createBrushProgramInfo();
      this.compositeProgramInfo = this.createCompositeProgramInfo();
      this.strokeBuildupProgramInfo = this.createStrokeBuildupProgramInfo();
      this.fullscreenQuad = this.createFullscreenQuad();
      this.configureGlState();
      this.brush = this.createBrushResources();
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
      this.centerCamera();
      this.observeViewportSize();
      this.bindBrushSettings();
      this.bindToolState();
      this.bindDocumentEvents();
      if (!this.options.disableInput) {
        this.bindPointerEvents();
        this.bindNavigationEvents();
      }
      if (!this.options.manualRender) {
        this.requestDraw();
      }
    }

    getRasterResourceManager() {
      return window.CBO?.rasterResourceManager || null;
    }

    getRasterResourceDocumentMetadata(metadata = {}) {
      const renderer = window.CBO?.documentRenderer || this.documentRenderer;

      return {
        ...metadata,
        documentHeight: metadata.documentHeight ?? renderer?.height,
        documentWidth: metadata.documentWidth ?? renderer?.width,
      };
    }

    nextBrushResourceOwnerId(prefix = "brush-resource") {
      this.rasterResourceIdSequence = this.rasterResourceIdSequence || 1;

      return `${prefix}-${this.rasterResourceIdSequence++}`;
    }

    registerBrushTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.getRasterResourceDocumentMetadata(metadata));
    }

    registerBrushFramebuffer(framebuffer, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerFramebuffer || !framebuffer) {
        return null;
      }

      return manager.registerFramebuffer(framebuffer, this.getRasterResourceDocumentMetadata(metadata));
    }

    deleteBrushTexture(textureOrId) {
      return this.getRasterResourceManager()?.deleteTexture?.(textureOrId) || false;
    }

    deleteBrushFramebuffer(framebufferOrId) {
      return this.getRasterResourceManager()?.deleteFramebuffer?.(framebufferOrId) || false;
    }

    configureGlState() {
      const gl = this.gl;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    resizeViewport() {
      const gl = this.gl;
      const rect = this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, this.canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, this.canvas.clientHeight || Math.round(rect.height) || 1);
      const nextDpr = Math.max(1, window.devicePixelRatio || 1);
      const nextWidth = Math.max(1, Math.round(cssWidth * nextDpr));
      const nextHeight = Math.max(1, Math.round(cssHeight * nextDpr));
      const didResize =
        this.canvas.width !== nextWidth ||
        this.canvas.height !== nextHeight ||
        this.viewportWidth !== nextWidth ||
        this.viewportHeight !== nextHeight ||
        this.dpr !== nextDpr;

      if (!didResize) {
        return false;
      }

      this.dpr = nextDpr;
      this.viewportWidth = nextWidth;
      this.viewportHeight = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      gl.viewport(0, 0, nextWidth, nextHeight);

      return true;
    }

    getPaintTarget() {
      const target = this.documentRenderer?.getPaintTarget?.();

      if (
        !target ||
        !target.framebuffer ||
        !target.texture ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height)
      ) {
        throw new Error("BrushEngine richiede un target documento valido.");
      }

      return target;
    }

    getDocumentDrawTarget(layerId = "") {
      const target = this.documentRenderer?.getDocumentDrawTarget?.(layerId) || this.documentRenderer?.getPaintTarget?.();

      if (
        !target ||
        !Number.isFinite(target.width) ||
        !Number.isFinite(target.height)
      ) {
        throw new Error("BrushEngine richiede dimensioni documento valide.");
      }

      return target;
    }

    centerCamera() {
      const target = this.getDocumentDrawTarget();
      const zoom = Math.max(
        0.0001,
        Math.min(this.viewportWidth / target.width, this.viewportHeight / target.height),
      );
      const artboardWidth = target.width * zoom;
      const artboardHeight = target.height * zoom;

      this.camera.zoom = zoom;
      this.camera.x = (this.viewportWidth - artboardWidth) * 0.5;
      this.camera.y = (this.viewportHeight - artboardHeight) * 0.5;
    }

    createBrushProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, BRUSH_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, BRUSH_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma brush WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma brush.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          brushSize: gl.getUniformLocation(program, "u_brushSize"),
          docResolution: gl.getUniformLocation(program, "u_docResolution"),
          targetOrigin: gl.getUniformLocation(program, "u_targetOrigin"),
          targetSize: gl.getUniformLocation(program, "u_targetSize"),
          minSizeRatio: gl.getUniformLocation(program, "u_minSizeRatio"),
          shapeFlip: gl.getUniformLocation(program, "u_shapeFlip"),
          flow: gl.getUniformLocation(program, "u_flow"),
          hardness: gl.getUniformLocation(program, "u_hardness"),
          wetEdges: gl.getUniformLocation(program, "u_wetEdges"),
          burntEdges: gl.getUniformLocation(program, "u_burntEdges"),
          burntEdgesMode: gl.getUniformLocation(program, "u_burntEdgesMode"),
          alphaThresholdEnabled: gl.getUniformLocation(program, "u_alphaThresholdEnabled"),
          alphaThreshold: gl.getUniformLocation(program, "u_alphaThreshold"),
          shapeTexture: gl.getUniformLocation(program, "u_shapeTexture"),
          useShapeTexture: gl.getUniformLocation(program, "u_useShapeTexture"),
          grainEnabled: gl.getUniformLocation(program, "u_grainEnabled"),
          grainTexture: gl.getUniformLocation(program, "u_grainTexture"),
          grainTexSize: gl.getUniformLocation(program, "u_grainTexSize"),
          grainMode: gl.getUniformLocation(program, "u_grainMode"),
          grainScale: gl.getUniformLocation(program, "u_grainScale"),
          grainRotationMat: gl.getUniformLocation(program, "u_grainRotationMat"),
          grainDepth: gl.getUniformLocation(program, "u_grainDepth"),
          grainMovement: gl.getUniformLocation(program, "u_grainMovement"),
          grainZoom: gl.getUniformLocation(program, "u_grainZoom"),
          grainDepthMinimum: gl.getUniformLocation(program, "u_grainDepthMinimum"),
          grainBlendMode: gl.getUniformLocation(program, "u_grainBlendMode"),
          grainBrightness: gl.getUniformLocation(program, "u_grainBrightness"),
          grainContrast: gl.getUniformLocation(program, "u_grainContrast"),
          grainInvert: gl.getUniformLocation(program, "u_grainInvert"),
        },
      };
    }

    createCompositeProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, COMPOSITE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma composite WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma composite.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          texture: gl.getUniformLocation(program, "u_texture"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createStrokeBuildupProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, COMPOSITE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, STROKE_BUILDUP_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma stroke build-up WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma stroke build-up.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          plateauTexture: gl.getUniformLocation(program, "u_plateauTexture"),
          accumTexture: gl.getUniformLocation(program, "u_accumTexture"),
          buildUp: gl.getUniformLocation(program, "u_buildUp"),
        },
      };
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione shader.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    createFullscreenQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      // Triangle strip in clip space: copre l'intero target FBO senza scomodare la camera.
      const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare il quad fullscreen GPU.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, buffer };
    }

    createTransparentRenderTarget(label, width, height, resourceMetadata = {}) {
      const gl = this.gl;
      const documentTarget = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const targetWidth = Math.max(1, Math.round(width || documentTarget.width));
      const targetHeight = Math.max(1, Math.round(height || documentTarget.height));
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetLabel = label || "Render target";

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error(`Impossibile creare ${targetLabel} in VRAM.`);
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Sampling lineare come il documento: niente gradoni grossi a zoom intermedi.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        targetWidth,
        targetHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error(`${targetLabel} incompleto: impossibile inizializzare il livello tratto.`);
      }

      gl.viewport(0, 0, targetWidth, targetHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const ownerId = resourceMetadata.ownerId || this.nextBrushResourceOwnerId("brush-stroke-target");
      const target = {
        framebuffer,
        height: targetHeight,
        id: ownerId,
        texture,
        width: targetWidth,
      };
      const textureRow = this.registerBrushTexture(texture, {
        height: targetHeight,
        kind: "strokeScratch",
        label: targetLabel,
        ownerId,
        ownerType: "scratch",
        purgeable: false,
        reason: "brush-engine",
        width: targetWidth,
        ...resourceMetadata,
      });

      this.registerBrushFramebuffer(framebuffer, {
        height: targetHeight,
        kind: "strokeScratchFramebuffer",
        label: `${targetLabel} framebuffer`,
        linkedTextureId: textureRow?.id || "",
        ownerId,
        ownerType: "scratch",
        purgeable: false,
        reason: "brush-engine",
        width: targetWidth,
        ...resourceMetadata,
      });

      return target;
    }

    createStrokeLayerTarget(rect = null) {
      const gl = this.gl;
      const targets = [];
      const documentTarget = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const nextRect = rect || {
        x: 0,
        y: 0,
        width: documentTarget.width,
        height: documentTarget.height,
      };

      try {
        const resourceMetadata = {
          bbox: nextRect,
          originX: nextRect.x,
          originY: nextRect.y,
          reason: "create-stroke-layer-target",
        };

        targets.push(this.createTransparentRenderTarget("Stroke FBO", nextRect.width, nextRect.height, resourceMetadata));
        targets.push(this.createTransparentRenderTarget("Stroke plateau FBO", nextRect.width, nextRect.height, resourceMetadata));
        targets.push(this.createTransparentRenderTarget("Stroke accumulation FBO", nextRect.width, nextRect.height, resourceMetadata));
      } catch (error) {
        this.deleteStrokeTargets(targets);

        throw error;
      }

      this.strokeTexture = targets[0].texture;
      this.strokeFBO = targets[0].framebuffer;
      this.strokePlateauTexture = targets[1].texture;
      this.strokePlateauFBO = targets[1].framebuffer;
      this.strokeAccumTexture = targets[2].texture;
      this.strokeAccumFBO = targets[2].framebuffer;
      this.strokeBufferRect = { ...nextRect };
    }

    getFullDocumentRect(target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const documentBounds = this.documentRenderer?.getDocumentBoundsRect?.();

      if (documentBounds) {
        return {
          x: Math.round(Number(documentBounds.x) || 0),
          y: Math.round(Number(documentBounds.y) || 0),
          width: Math.max(1, Math.round(Number(documentBounds.width) || 1)),
          height: Math.max(1, Math.round(Number(documentBounds.height) || 1)),
        };
      }

      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(target.width || 1)),
        height: Math.max(1, Math.round(target.height || 1)),
      };
    }

    getActiveDocumentPaintRect(layerId = this.strokeTargetLayerId || "") {
      return namespace.getActiveDocumentArtboardRect?.({ layerId }) || null;
    }

    getStrokeAllocationBounds(target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      return this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target?.layerId || "") ||
        this.getFullDocumentRect(target);
    }

    getRasterRectBytes(rect) {
      if (!rect) {
        return 0;
      }

      const width = Math.max(0, Math.round(rect.width || 0));
      const height = Math.max(0, Math.round(rect.height || 0));

      return width * height * RASTER_BYTES_PER_PIXEL;
    }

    getRasterRectCoverage(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target?.layerId || "");
      const canvasPixels = Math.max(1, Math.round(paintRect?.width || target?.width || 1)) *
        Math.max(1, Math.round(paintRect?.height || target?.height || 1));
      const rectPixels = Math.max(0, Math.round(rect?.width || 0)) *
        Math.max(0, Math.round(rect?.height || 0));

      return rectPixels / canvasPixels;
    }

    classifyStrokeMemory(estimatedPeakBytes, coverage) {
      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.largeMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.mediumMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.largeCoverage
      ) {
        return "large";
      }

      if (estimatedPeakBytes > STROKE_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }

    createStrokeMemoryReport({
      layerId = "",
      phase = "brush-stroke",
      strokeBufferRect = null,
      strokeRect = null,
      target = this.getDocumentDrawTarget(layerId),
      tool = this.currentStrokeTool || "brush",
    } = {}) {
      const beforeBytes = this.getRasterRectBytes(strokeRect);
      const potentialAfterBytes = beforeBytes;
      const scratchBytes = this.getRasterRectBytes(strokeBufferRect) * 3;
      const persistentBytes = beforeBytes + potentialAfterBytes;
      const estimatedPeakBytes = persistentBytes + scratchBytes;
      const coverage = this.getRasterRectCoverage(strokeRect, target);
      const policy = this.classifyStrokeMemory(estimatedPeakBytes, coverage);
      const hasTileHistory = typeof this.documentRenderer?.beginRasterTileHistory === "function";
      const historyMode = hasTileHistory
        ? "tile-before-after"
        : (
            policy === "huge"
              ? "gpu-before-no-redo"
              : "gpu-before-lazy-after"
          );

      return {
        beforeBytes,
        canvasSize: {
          height: Math.max(1, Math.round(target?.height || 1)),
          width: Math.max(1, Math.round(target?.width || 1)),
        },
        coverage,
        estimatedPeakBytes,
        historyMode,
        layerId,
        persistentBytes,
        phase,
        policy,
        potentialAfterBytes,
        reason: historyMode === "gpu-before-no-redo"
          ? "redo snapshot disabled for very large brush stroke"
          : "brush stroke memory estimate",
        scratchBytes,
        source: "brush-engine",
        strokeBufferRect: strokeBufferRect ? { ...strokeBufferRect } : null,
        strokeRect: strokeRect ? { ...strokeRect } : null,
        tool,
      };
    }

    recordStrokeMemory(report) {
      if (!report) {
        return null;
      }

      this.lastStrokeMemoryReport = report;
      namespace.lastBrushStrokeMemoryReport = report;
      const recorded = namespace.rasterResourceManager?.recordStrokeMemory?.(report) || report;

      if (namespace.debugRasterMemoryLogs !== true && namespace.debugStrokeMemoryLogs !== true) {
        return recorded;
      }

      if (report.policy === "large" || report.policy === "huge") {
        console.warn?.("[CBO brush] Stroke memory policy", recorded);
      } else if (report.policy === "medium") {
        console.info?.("[CBO brush] Stroke memory estimate", recorded);
      }

      return recorded;
    }

    pruneRasterHistoryForStroke(report) {
      const history = namespace.documentHistory;

      if (!history?.pruneRasterHistoryBudget || !report || report.policy === "normal") {
        return null;
      }

      return history.pruneRasterHistoryBudget({ deferGpuHotPrune: true });
    }

    coolRasterHistoryGpuHotForBrush() {
      const history = namespace.documentHistory;

      if (typeof history?.scheduleRasterHistoryGpuHotPrune === "function") {
        return history.scheduleRasterHistoryGpuHotPrune({
          minProtectedEntries: 0,
          source: "brush-stroke",
          targetGpuHotBytes: 0,
        });
      }

      if (!history?.pruneRasterHistoryGpuHotBudget) {
        return null;
      }

      return history.pruneRasterHistoryGpuHotBudget({
        minProtectedEntries: 0,
        targetGpuHotBytes: 0,
      });
    }

    canBatchBrushHistory() {
      return Boolean(
        this.options.enableHistory &&
        this.options.historyBatchIdleMs > 0 &&
        this.documentRenderer?.beginRasterTileHistory &&
        this.documentRenderer?.extendRasterTileHistory &&
        this.documentRenderer?.commitRasterTileHistory,
      );
    }

    clearPendingBrushHistoryTimer() {
      if (!this.pendingBrushHistoryTimer) {
        return;
      }

      window.clearTimeout(this.pendingBrushHistoryTimer);
      this.pendingBrushHistoryTimer = 0;
    }

    schedulePendingBrushHistoryCommit() {
      if (!this.pendingBrushHistory || this.isDisposed) {
        return;
      }

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistoryTimer = window.setTimeout(() => {
        this.pendingBrushHistoryTimer = 0;

        if (this.isDrawing || this.isPanning) {
          this.schedulePendingBrushHistoryCommit();
          return;
        }

        this.flushPendingBrushHistory({
          source: "brush-history-idle",
        });
      }, this.options.historyBatchIdleMs);
    }

    isPendingBrushHistoryCompatible(layerId, source) {
      const pending = this.pendingBrushHistory;

      return Boolean(
        pending &&
        pending.layerId === layerId &&
        pending.source === source,
      );
    }

    getMergedBrushHistoryMemoryReport(previous, next) {
      if (!previous) {
        return next ? {
          ...next,
          phase: "brush-history-batch",
          strokeCount: 1,
        } : null;
      }

      if (!next) {
        return previous;
      }

      const policyRank = {
        normal: 0,
        medium: 1,
        large: 2,
        huge: 3,
      };
      const previousPolicy = String(previous.policy || "normal");
      const nextPolicy = String(next.policy || "normal");
      const policy = (policyRank[nextPolicy] || 0) > (policyRank[previousPolicy] || 0)
        ? nextPolicy
        : previousPolicy;

      return {
        ...previous,
        canvasSize: next.canvasSize || previous.canvasSize,
        coverage: Math.max(Number(previous.coverage) || 0, Number(next.coverage) || 0),
        estimatedPeakBytes: Math.max(
          Number(previous.estimatedPeakBytes) || 0,
          Number(next.estimatedPeakBytes) || 0,
        ),
        phase: "brush-history-batch",
        policy,
        scratchBytes: Math.max(Number(previous.scratchBytes) || 0, Number(next.scratchBytes) || 0),
        strokeCount: (Number(previous.strokeCount) || 1) + 1,
        strokeRect: this.unionRects(previous.strokeRect, next.strokeRect),
      };
    }

    prepareBatchedBrushHistory(layerId, strokeRect, memoryReport, tilePatchRects = this.getActiveStrokeTilePatchRects(strokeRect)) {
      if (!this.canBatchBrushHistory() || !layerId || !strokeRect) {
        return null;
      }

      const source = this.currentStrokeTool || "brush";

      if (this.pendingBrushHistory && !this.isPendingBrushHistoryCompatible(layerId, source)) {
        this.flushPendingBrushHistory({
          source: "brush-history-switch",
        });
      }

      if (!this.pendingBrushHistory) {
        const capture = this.documentRenderer.beginRasterTileHistory(layerId, strokeRect, {
          label: "brush-stroke",
          source,
          tilePatchRects,
        });

        if (!capture) {
          return null;
        }

        this.pendingBrushHistory = {
          capture,
          createdAt: Date.now(),
          layerId,
          memoryPolicy: this.getMergedBrushHistoryMemoryReport(null, memoryReport),
          source,
          strokeCount: 1,
          updatedAt: Date.now(),
        };

        return capture;
      }

      const didExtend = this.documentRenderer.extendRasterTileHistory(this.pendingBrushHistory.capture, strokeRect, {
        label: "brush-stroke",
        layerId,
        source,
        tilePatchRects,
      });

      if (!didExtend) {
        this.flushPendingBrushHistory({
          source: "brush-history-extend-failed",
        });
        return null;
      }

      this.pendingBrushHistory.memoryPolicy = this.getMergedBrushHistoryMemoryReport(
        this.pendingBrushHistory.memoryPolicy,
        memoryReport,
      );
      this.pendingBrushHistory.strokeCount += 1;
      this.pendingBrushHistory.updatedAt = Date.now();

      return this.pendingBrushHistory.capture;
    }

    flushPendingBrushHistory(options = {}) {
      const pending = this.pendingBrushHistory;

      if (!pending || this.isFlushingBrushHistory) {
        return false;
      }

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistory = null;
      this.isFlushingBrushHistory = true;

      try {
        const history = namespace.documentHistory;
        const tileEntry = this.documentRenderer?.commitRasterTileHistory?.(pending.capture, {
          label: "brush-stroke",
          lazyAfter: true,
          memoryPolicy: pending.memoryPolicy,
          redoSource: `history-redo-${pending.source}`,
          source: pending.source,
          type: "pixel",
          undoSource: `history-undo-${pending.source}`,
        });
        const entry = tileEntry
          ? this.documentRenderer?.finalizeRasterEditHistoryEntry?.(pending.layerId, tileEntry, {
              source: pending.source,
            }) || tileEntry
          : null;

        if (history?.push && entry) {
          history.push(entry, {
            source: options.source || "brush-history-batch",
          });
          this.pruneRasterHistoryForStroke(pending.memoryPolicy);
          this.coolRasterHistoryGpuHotForBrush();
          return true;
        }

        this.documentRenderer?.finalizeRasterEditHistoryEntry?.(pending.layerId, null, {
          source: pending.source,
        });
        this.documentRenderer?.deleteRasterTileHistoryCapture?.(pending.capture);
        return false;
      } finally {
        this.isFlushingBrushHistory = false;
        this.requestDraw();
      }
    }

    discardPendingBrushHistory() {
      if (!this.pendingBrushHistory) {
        return;
      }

      const pending = this.pendingBrushHistory;

      this.clearPendingBrushHistoryTimer();
      this.pendingBrushHistory = null;
      this.documentRenderer?.deleteRasterTileHistoryCapture?.(pending.capture);
    }

    isBrushStrokeCropped() {
      return CROPPED_BRUSH_STROKES;
    }

    containsRect(container, rect) {
      return Boolean(
        container &&
        rect &&
        rect.x >= container.x &&
        rect.y >= container.y &&
        rect.x + rect.width <= container.x + container.width &&
        rect.y + rect.height <= container.y + container.height
      );
    }

    unionRects(first, second) {
      if (!first) {
        return second ? { ...second } : null;
      }

      if (!second) {
        return { ...first };
      }

      const x = Math.min(first.x, second.x);
      const y = Math.min(first.y, second.y);
      const x2 = Math.max(first.x + first.width, second.x + second.width);
      const y2 = Math.max(first.y + first.height, second.y + second.height);

      return {
        x,
        y,
        width: x2 - x,
        height: y2 - y,
      };
    }

    getPaddedStrokeAllocationRect(rect, target) {
      if (!this.isBrushStrokeCropped()) {
        return this.getFullDocumentRect(target);
      }

      const quantum = STROKE_ALLOCATION_QUANTUM;
      const padding = Math.max(16, Math.ceil(this.getBrushSize()));
      const bounds = this.getStrokeAllocationBounds(target);
      const minX = Math.max(bounds.x, Math.floor((rect.x - padding) / quantum) * quantum);
      const minY = Math.max(bounds.y, Math.floor((rect.y - padding) / quantum) * quantum);
      const maxX = Math.min(
        bounds.x + bounds.width,
        Math.ceil((rect.x + rect.width + padding) / quantum) * quantum,
      );
      const maxY = Math.min(
        bounds.y + bounds.height,
        Math.ceil((rect.y + rect.height + padding) / quantum) * quantum,
      );

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }

    getFinalStrokeAllocationRect(rect, target) {
      if (!this.isBrushStrokeCropped()) {
        return this.getFullDocumentRect(target);
      }

      const padding = STROKE_FINAL_PADDING;
      const bounds = this.getStrokeAllocationBounds(target);
      const minX = Math.max(bounds.x, Math.floor(rect.x - padding));
      const minY = Math.max(bounds.y, Math.floor(rect.y - padding));
      const maxX = Math.min(bounds.x + bounds.width, Math.ceil(rect.x + rect.width + padding));
      const maxY = Math.min(bounds.y + bounds.height, Math.ceil(rect.y + rect.height + padding));

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }

    isSameRect(first, second) {
      return Boolean(
        first &&
        second &&
        first.x === second.x &&
        first.y === second.y &&
        first.width === second.width &&
        first.height === second.height
      );
    }

    getCurrentStrokeTargets() {
      if (!this.strokeTexture || !this.strokeFBO) {
        return null;
      }

      return [
        { texture: this.strokeTexture, framebuffer: this.strokeFBO, width: this.strokeBufferRect?.width || 1, height: this.strokeBufferRect?.height || 1 },
        { texture: this.strokePlateauTexture, framebuffer: this.strokePlateauFBO, width: this.strokeBufferRect?.width || 1, height: this.strokeBufferRect?.height || 1 },
        { texture: this.strokeAccumTexture, framebuffer: this.strokeAccumFBO, width: this.strokeBufferRect?.width || 1, height: this.strokeBufferRect?.height || 1 },
      ];
    }

    deleteStrokeTargets(targets = this.getCurrentStrokeTargets()) {
      if (!Array.isArray(targets)) {
        return;
      }

      const gl = this.gl;

      targets.forEach((target) => {
        if (target?.framebuffer) {
          this.deleteBrushFramebuffer(target.framebuffer);
          gl.deleteFramebuffer(target.framebuffer);
          target.framebuffer = null;
        }

        if (target?.texture) {
          this.deleteBrushTexture(target.texture);
          gl.deleteTexture(target.texture);
          target.texture = null;
        }
      });
    }

    releaseStrokeLayerTarget() {
      this.deleteStrokeTargets();
      this.strokeTexture = null;
      this.strokeFBO = null;
      this.strokePlateauTexture = null;
      this.strokePlateauFBO = null;
      this.strokeAccumTexture = null;
      this.strokeAccumFBO = null;
      this.strokeBufferRect = null;
    }

    copyStrokeTargetContent(previousTargets, previousRect, nextTargets, nextRect) {
      if (!previousRect || !nextRect || !Array.isArray(previousTargets) || !Array.isArray(nextTargets)) {
        return;
      }

      const intersectionX = Math.max(previousRect.x, nextRect.x);
      const intersectionY = Math.max(previousRect.y, nextRect.y);
      const intersectionMaxX = Math.min(previousRect.x + previousRect.width, nextRect.x + nextRect.width);
      const intersectionMaxY = Math.min(previousRect.y + previousRect.height, nextRect.y + nextRect.height);
      const intersectionWidth = Math.max(0, Math.round(intersectionMaxX - intersectionX));
      const intersectionHeight = Math.max(0, Math.round(intersectionMaxY - intersectionY));

      if (intersectionWidth <= 0 || intersectionHeight <= 0) {
        return;
      }

      const gl = this.gl;
      const sourceX0 = Math.round(intersectionX - previousRect.x);
      const sourceY0 = Math.round(previousRect.height - ((intersectionY - previousRect.y) + intersectionHeight));
      const destX0 = Math.round(intersectionX - nextRect.x);
      const destY0 = Math.round(nextRect.height - ((intersectionY - nextRect.y) + intersectionHeight));

      previousTargets.forEach((previous, index) => {
        const next = nextTargets[index];

        if (!previous?.framebuffer || !next?.framebuffer) {
          return;
        }

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, next.framebuffer);
        gl.blitFramebuffer(
          sourceX0,
          sourceY0,
          sourceX0 + intersectionWidth,
          sourceY0 + intersectionHeight,
          destX0,
          destY0,
          destX0 + intersectionWidth,
          destY0 + intersectionHeight,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      });

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    replaceStrokeLayerTarget(nextRect, previousTargets = this.getCurrentStrokeTargets(), previousRect = this.strokeBufferRect) {
      const gl = this.gl;
      const nextTargets = [];
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.stroke-target.replace", {
        nextPixels: Math.max(0, Math.round(nextRect?.width || 0)) * Math.max(0, Math.round(nextRect?.height || 0)),
        previousPixels: Math.max(0, Math.round(previousRect?.width || 0)) * Math.max(0, Math.round(previousRect?.height || 0)),
      }) : null;

      try {
      try {
        const resourceMetadata = {
          bbox: nextRect,
          originX: nextRect.x,
          originY: nextRect.y,
          reason: "replace-stroke-layer-target",
        };

        nextTargets.push(this.createTransparentRenderTarget("Stroke FBO", nextRect.width, nextRect.height, resourceMetadata));
        nextTargets.push(this.createTransparentRenderTarget("Stroke plateau FBO", nextRect.width, nextRect.height, resourceMetadata));
        nextTargets.push(this.createTransparentRenderTarget("Stroke accumulation FBO", nextRect.width, nextRect.height, resourceMetadata));
      } catch (error) {
        this.deleteStrokeTargets(nextTargets);
        throw error;
      }

      this.copyStrokeTargetContent(previousTargets, previousRect, nextTargets, nextRect);
      this.deleteStrokeTargets(previousTargets);

      this.strokeTexture = nextTargets[0].texture;
      this.strokeFBO = nextTargets[0].framebuffer;
      this.strokePlateauTexture = nextTargets[1].texture;
      this.strokePlateauFBO = nextTargets[1].framebuffer;
      this.strokeAccumTexture = nextTargets[2].texture;
      this.strokeAccumFBO = nextTargets[2].framebuffer;
      this.strokeBufferRect = { ...nextRect };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      } finally {
        trace?.end({
          nextHeight: Math.max(0, Math.round(nextRect?.height || 0)),
          nextWidth: Math.max(0, Math.round(nextRect?.width || 0)),
        });
      }
    }

    ensureStrokeLayerTargetForRect(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      const requiredRect = this.isBrushStrokeCropped() ? rect : this.getFullDocumentRect(target);

      if (!requiredRect) {
        return false;
      }

      if (this.strokeBufferRect && this.containsRect(this.strokeBufferRect, requiredRect)) {
        return true;
      }

      const previousTargets = this.getCurrentStrokeTargets();
      const previousRect = this.strokeBufferRect ? { ...this.strokeBufferRect } : null;
      const unionRect = previousRect ? this.unionRects(previousRect, requiredRect) : requiredRect;
      const nextRect = this.getPaddedStrokeAllocationRect(unionRect, target);

      this.replaceStrokeLayerTarget(nextRect, previousTargets, previousRect);

      return true;
    }

    compactStrokeLayerTargetForRect(rect, target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "")) {
      if (!rect || !this.strokeBufferRect || !this.strokeTexture) {
        return false;
      }

      const nextRect = this.getFinalStrokeAllocationRect(rect, target);

      if (this.isSameRect(this.strokeBufferRect, nextRect)) {
        return true;
      }

      this.replaceStrokeLayerTarget(
        nextRect,
        this.getCurrentStrokeTargets(),
        { ...this.strokeBufferRect },
      );

      return true;
    }

    createBrushResources() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const quadVBO = gl.createBuffer();
      const instanceVBO = gl.createBuffer();
      const vertices = new Float32Array([
        -0.5, -0.5,
        0.5, -0.5,
        -0.5, 0.5,
        0.5, 0.5,
      ]);

      if (!vao || !quadVBO || !instanceVBO) {
        if (instanceVBO) {
          gl.deleteBuffer(instanceVBO);
        }

        if (quadVBO) {
          gl.deleteBuffer(quadVBO);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse GPU del pennello.");
      }

      gl.bindVertexArray(vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      // Instance stride 56 byte: pos, pressure, alpha, size, rotation, color, grain moving data.
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 56, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 56, 8);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 56, 12);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 56, 16);
      gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 56, 20);
      gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 56, 24);
      gl.vertexAttribDivisor(6, 1);
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 56, 36);
      gl.vertexAttribDivisor(7, 1);
      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8, 1, gl.FLOAT, false, 56, 44);
      gl.vertexAttribDivisor(8, 1);
      gl.enableVertexAttribArray(9);
      gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 56, 48);
      gl.vertexAttribDivisor(9, 1);
      gl.enableVertexAttribArray(10);
      gl.vertexAttribPointer(10, 1, gl.FLOAT, false, 56, 52);
      gl.vertexAttribDivisor(10, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, quadVBO, instanceVBO };
    }

    observeViewportSize() {
      window.addEventListener("resize", this.handleResize, { passive: true });

      if (!window.ResizeObserver) {
        return;
      }

      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas);
    }

    handleResize() {
      if (this.resizeViewport() && !this.userManipulatedCamera) {
        this.centerCamera();
      }

      this.requestDraw();
    }

    bindBrushSettings() {
      // Quando un getSettings esplicito è fornito (es. preview pad), non ascoltiamo l'evento globale:
      // il chiamante usa setBrushState() per pilotare l'engine senza inquinare il brush principale.
      if (this.options.getSettings) {
        return;
      }

      window.addEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
    }

    bindToolState() {
      if (!this.options.respectActiveTool) {
        this.isBrushToolActive = true;
        return;
      }

      window.addEventListener("cbo:tool-change", this.handleToolChange);
    }

    bindDocumentEvents() {
      window.addEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.addEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.addEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.addEventListener("cbo:before-raster-history-capture", this.handleBeforeRasterHistoryCapture);
    }

    handleBrushSettingsChange() {
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
    }

    getInitialBrushToolActive() {
      if (this.options?.respectActiveTool === false || this.options?.getSettings) {
        this.activeStrokeTool = "brush";
        return true;
      }

      const activeTool = document.querySelector("[data-tool].active");

      if (!activeTool) {
        this.activeStrokeTool = "";
        return false;
      }

      const tool = this.resolveStrokeToolFromDetail({
        label: activeTool.getAttribute("aria-label") || "",
        syncGroup: activeTool.dataset.toolSync || "",
        toolMode: activeTool.dataset.toolMode || "",
      });

      this.activeStrokeTool = tool || "";

      return Boolean(tool);
    }

    resolveStrokeToolFromDetail(detail = {}) {
      const label = String(detail.label || "").toUpperCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();
      const syncGroup = String(detail.syncGroup || "").toLowerCase();

      if (label === "ERASER" || toolMode === "eraser") {
        return "eraser";
      }

      if (label === "BRUSH" || (toolMode === "brush" && syncGroup === "brush")) {
        return "brush";
      }

      return "";
    }

    isBrushToolDetail(detail = {}) {
      return Boolean(this.resolveStrokeToolFromDetail(detail));
    }

    handleToolChange(event) {
      const tool = this.resolveStrokeToolFromDetail(event.detail);

      if (tool !== this.activeStrokeTool) {
        this.flushPendingBrushHistory({
          source: "brush-tool-change",
        });
      }

      this.activeStrokeTool = tool;
      this.isBrushToolActive = Boolean(tool);
    }

    handleDocumentChange(event) {
      if (event?.type === "cbo:document-layers-change") {
        this.flushPendingBrushHistory({
          source: "brush-layer-change",
        });
      }

      this.requestDraw();
    }

    handleBeforeHistoryAction(event) {
      const action = String(event.detail?.action || "").trim().toLowerCase();

      if (action === "undo" || action === "redo") {
        this.flushPendingBrushHistory({
          source: `brush-before-${action}`,
        });
      }
    }

    handleBeforeRasterHistoryCapture(event) {
      const source = String(event.detail?.source || "").trim().toLowerCase();

      if (source === "brush" || source === "eraser" || source === "brush-stroke") {
        return;
      }

      this.flushPendingBrushHistory({
        source: source ? `brush-before-${source}` : "brush-before-raster-history",
      });
    }

    canStartBrushStroke() {
      return !this.options.respectActiveTool || this.isBrushToolActive;
    }

    readBrushSettingsSource() {
      if (this.options.getSettings) {
        return this.options.getSettings();
      }

      return namespace.brushSettings;
    }

    setBrushState(settings) {
      this.brushState = { ...(settings || {}) };
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
    }

    getShapeTextureSource() {
      const source = this.brushState?.shapeAlphaSrc;

      return typeof source === "string" && source.trim() ? source : "";
    }

    getGrainTextureSource() {
      const source = this.brushState?.grainTextureSrc;

      return typeof source === "string" && source.trim() ? source : "";
    }

    syncShapeTextureFromState() {
      const source = this.getShapeTextureSource();

      if (source === this.shapeTextureSource) {
        return;
      }

      this.shapeTextureSource = source;
      this.shapeTextureReady = false;
      this.shapeTextureRequestId += 1;

      if (!source) {
        return;
      }

      const requestId = this.shapeTextureRequestId;

      ImageCache.load(source)
        .then((image) => {
          if (this.isDisposed || requestId !== this.shapeTextureRequestId) {
            return;
          }

          this.uploadShapeTexture(image);
        })
        .catch(() => {
          if (requestId === this.shapeTextureRequestId) {
            this.shapeTextureReady = false;
          }
        });
    }

    uploadShapeTexture(image) {
      const gl = this.gl;

      if (!this.shapeTexture) {
        this.shapeTexture = gl.createTexture();
      }

      if (!this.shapeTexture) {
        this.shapeTextureReady = false;
        return;
      }

      gl.bindTexture(gl.TEXTURE_2D, this.shapeTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.shapeTextureReady = true;
      this.registerBrushTexture(this.shapeTexture, {
        height: Math.max(1, image.naturalHeight || image.height || 1),
        kind: "brushShapeTexture",
        label: "brush shape texture",
        mipLevels: 1,
        ownerId: "brush-shape-texture",
        ownerType: "cache",
        purgeable: true,
        reason: "brush-shape-upload",
        width: Math.max(1, image.naturalWidth || image.width || 1),
      });

      if (this.options.singleStrokeMode && !this.isDrawing && this.lastRecordedStroke.length > 0) {
        this.replayLastStroke();
      }

      this.requestDraw();
    }

    syncGrainTextureFromState() {
      const source = this.getGrainTextureSource();

      if (source === this.grainTextureSource) {
        return;
      }

      this.grainTextureSource = source;
      this.grainTextureReady = false;
      this.grainImageWidth = 1;
      this.grainImageHeight = 1;
      this.grainTextureRequestId += 1;

      if (!source) {
        return;
      }

      const requestId = this.grainTextureRequestId;

      ImageCache.load(source)
        .then((image) => {
          if (this.isDisposed || requestId !== this.grainTextureRequestId) {
            return;
          }

          this.uploadGrainTexture(image);
        })
        .catch(() => {
          if (requestId === this.grainTextureRequestId) {
            this.grainTextureReady = false;
          }
        });
    }

    waitForBrushAssets(settings = this.brushState) {
      const pending = [];
      const shapeSource = typeof settings?.shapeAlphaSrc === "string" ? settings.shapeAlphaSrc.trim() : "";
      const grainSource = typeof settings?.grainTextureSrc === "string" ? settings.grainTextureSrc.trim() : "";

      if (shapeSource) {
        pending.push(ImageCache.load(shapeSource).catch(() => null));
      }

      if (settings?.grainEnabled === true && grainSource) {
        pending.push(ImageCache.load(grainSource).catch(() => null));
      }

      return Promise.all(pending).then(() => undefined);
    }

    uploadGrainTexture(image) {
      const gl = this.gl;

      if (!this.grainTexture) {
        this.grainTexture = gl.createTexture();
      }

      if (!this.grainTexture) {
        this.grainTextureReady = false;
        return;
      }

      this.grainImageWidth = Math.max(1, image.naturalWidth || image.width || 1);
      this.grainImageHeight = Math.max(1, image.naturalHeight || image.height || 1);

      gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.grainTextureReady = true;
      this.registerBrushTexture(this.grainTexture, {
        height: this.grainImageHeight,
        kind: "brushGrainTexture",
        label: "brush grain texture",
        mipLevels: Math.max(1, Math.floor(Math.log2(Math.max(this.grainImageWidth, this.grainImageHeight))) + 1),
        ownerId: "brush-grain-texture",
        ownerType: "cache",
        purgeable: true,
        reason: "brush-grain-upload",
        width: this.grainImageWidth,
      });

      if (this.options.singleStrokeMode && !this.isDrawing && this.lastRecordedStroke.length > 0) {
        this.replayLastStroke();
      }

      this.requestDraw();
    }

    bindPointerEvents() {
      this.canvas.style.touchAction = "none";
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    }

    bindNavigationEvents() {
      if (this.options.disableNavigation) {
        return;
      }

      const navigationTarget = this.stage || this.canvas;

      this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
      navigationTarget.addEventListener("pointerdown", this.handleNavigationPointerDown, true);
      navigationTarget.addEventListener("pointermove", this.handleNavigationPointerMove, true);
      navigationTarget.addEventListener("pointerup", this.handleNavigationPointerUp, true);
      navigationTarget.addEventListener("pointercancel", this.handleNavigationPointerCancel, true);
      navigationTarget.addEventListener("auxclick", this.handleAuxClick, true);
      window.addEventListener("keydown", this.handleKeyDown, true);
      window.addEventListener("keyup", this.handleKeyUp, true);
      window.addEventListener("blur", this.handleWindowBlur);
    }

    handleWheel(event) {
      event.preventDefault();

      let deltaY = event.deltaY;

      if (event.deltaMode === 1) {
        deltaY *= 16;
      } else if (event.deltaMode === 2) {
        deltaY *= window.innerHeight || 800;
      }

      const intensity = event.ctrlKey ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY;
      const factor = Math.exp(-deltaY * intensity);

      this.zoomAtClient(event.clientX, event.clientY, factor);
    }

    zoomAtClient(clientX, clientY, factor) {
      if (!Number.isFinite(factor) || factor <= 0) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const cursorViewportX = (clientX - rect.left) * this.dpr;
      const cursorViewportY = (clientY - rect.top) * this.dpr;
      const oldZoom = this.camera.zoom;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

      if (newZoom === oldZoom) {
        return;
      }

      // Mantieni fermo il punto del documento sotto il cursore (anchor zoom).
      const docX = (cursorViewportX - this.camera.x) / oldZoom;
      const docY = (cursorViewportY - this.camera.y) / oldZoom;

      this.camera.zoom = newZoom;
      this.camera.x = cursorViewportX - docX * newZoom;
      this.camera.y = cursorViewportY - docY * newZoom;
      this.userManipulatedCamera = true;
      this.requestDraw();
    }

    isTemporaryPanTrigger(event) {
      return event.button === 1 || (event.button === 0 && this.isSpaceHeld);
    }

    markNavigationEvent(event) {
      event.__cboNavigationHandled = true;
      event.preventDefault();
      event.stopPropagation();
    }

    beginPan(event, captureElement = this.canvas) {
      this.isPanning = true;
      this.activePanPointerId = event.pointerId;
      this.panCaptureElement = captureElement || this.canvas;
      this.panLastViewportX = event.clientX * this.dpr;
      this.panLastViewportY = event.clientY * this.dpr;

      try {
        this.panCaptureElement.setPointerCapture(event.pointerId);
      } catch (error) {
        // Alcuni browser rifiutano la capture su pointer non principali; il pan funziona comunque.
      }

      this.updateCursor();
    }

    updatePan(event) {
      const currentX = event.clientX * this.dpr;
      const currentY = event.clientY * this.dpr;

      this.camera.x += currentX - this.panLastViewportX;
      this.camera.y += currentY - this.panLastViewportY;
      this.panLastViewportX = currentX;
      this.panLastViewportY = currentY;
      this.userManipulatedCamera = true;
      this.requestDraw();
    }

    endPan(event) {
      const pointerId = event?.pointerId ?? this.activePanPointerId;
      const captureElement = this.panCaptureElement || this.canvas;

      if (pointerId != null && captureElement?.hasPointerCapture?.(pointerId)) {
        captureElement.releasePointerCapture(pointerId);
      }

      this.isPanning = false;
      this.activePanPointerId = null;
      this.panCaptureElement = null;
      this.updateCursor();
    }

    handleNavigationPointerDown(event) {
      if (this.isDisposed || !this.isTemporaryPanTrigger(event)) {
        return;
      }

      this.markNavigationEvent(event);

      if (this.isDrawing || this.isPanning) {
        return;
      }

      this.beginPan(event, event.currentTarget || this.stage || this.canvas);
    }

    handleNavigationPointerMove(event) {
      if (this.isDisposed || !this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.updatePan(event);
    }

    handleNavigationPointerUp(event) {
      if (this.isDisposed || !this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.endPan(event);
    }

    handleNavigationPointerCancel(event) {
      if (!this.isPanning || this.activePanPointerId !== event.pointerId) {
        return;
      }

      this.markNavigationEvent(event);
      this.endPan(event);
    }

    handleAuxClick(event) {
      if (event.button !== 1) {
        return;
      }

      this.markNavigationEvent(event);
    }

    markSpacebarEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    handleKeyDown(event) {
      if (event.code !== "Space" || this.isInputFocused()) {
        return;
      }

      this.markSpacebarEvent(event);

      if (!this.isSpaceHeld) {
        this.isSpaceHeld = true;
        this.updateCursor();
      }
    }

    handleKeyUp(event) {
      if (event.code !== "Space" || (!this.isSpaceHeld && this.isInputFocused())) {
        return;
      }

      this.markSpacebarEvent(event);

      if (this.isSpaceHeld) {
        this.isSpaceHeld = false;
        this.updateCursor();
      }
    }

    handleWindowBlur() {
      this.isSpaceHeld = false;

      if (this.isPanning) {
        this.endPan();
      } else {
        this.updateCursor();
      }
    }

    isInputFocused() {
      const element = document.activeElement;

      if (!element || element === document.body) {
        return false;
      }

      const tag = element.tagName;

      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
    }

    updateCursor() {
      document.body?.classList.toggle("cbo-canvas-pan-active", this.isPanning);
      document.body?.classList.toggle("cbo-canvas-pan-ready", !this.isPanning && this.isSpaceHeld);

      if (this.isPanning) {
        this.canvas.style.cursor = "grabbing";
      } else if (this.isSpaceHeld) {
        this.canvas.style.cursor = "grab";
      } else {
        this.canvas.style.cursor = "";
      }
    }

    screenToDocumentSpace(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const viewportX = (clientX - rect.left) * this.dpr;
      const viewportY = (clientY - rect.top) * this.dpr;

      return {
        docX: (viewportX - this.camera.x) / this.camera.zoom,
        docY: (viewportY - this.camera.y) / this.camera.zoom,
      };
    }

    clampStrokeSamplePoint(x, y) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target.layerId || "") ||
        this.getFullDocumentRect(target);
      const margin = Math.max(STROKE_SAMPLE_CLAMP_MIN_PADDING, Math.ceil(this.getBrushSize() * 2));
      const safeX = Number.isFinite(x) ? x : 0;
      const safeY = Number.isFinite(y) ? y : 0;

      return {
        x: this.clamp(safeX, paintRect.x - margin, paintRect.x + paintRect.width + margin),
        y: this.clamp(safeY, paintRect.y - margin, paintRect.y + paintRect.height + margin),
      };
    }

    createPointerSample(event) {
      const { docX, docY } = this.screenToDocumentSpace(event.clientX, event.clientY);
      const isMouse = event.pointerType === "mouse";
      const point = this.clampStrokeSamplePoint(docX, docY);

      return {
        x: point.x,
        y: point.y,
        pressure: isMouse ? 1.0 : event.pressure,
        pointerType: event.pointerType || "",
        tiltX: isMouse ? 0 : event.tiltX,
        tiltY: isMouse ? 0 : event.tiltY,
        time: performance.now(),
      };
    }

    isDocumentPointInside(point) {
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const paintRect = this.getActiveDocumentPaintRect(this.strokeTargetLayerId || target.layerId || "") ||
        this.getFullDocumentRect(target);

      return (
        point.docX >= paintRect.x &&
        point.docY >= paintRect.y &&
        point.docX <= paintRect.x + paintRect.width &&
        point.docY <= paintRect.y + paintRect.height
      );
    }

    activateArtboardAtPoint(point, source = "brush-pointer-artboard") {
      return namespace.selectDocumentArtboardAtPoint?.(point, { source }) || null;
    }

    ensureEmptyEraserLayerToast() {
      if (typeof document === "undefined" || !document.body) {
        return null;
      }

      let toast = document.getElementById?.("cbo-eraser-empty-layer-toast") || null;

      if (!toast && typeof document.createElement === "function") {
        toast = document.createElement("div");
        toast.id = "cbo-eraser-empty-layer-toast";
        toast.className = "cbo-layer-limit-toast";
        toast.hidden = true;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
      }

      return toast;
    }

    showEmptyEraserLayerToast(message = "Nothing to erase on this layer") {
      const now = Date.now();

      if (now - (this.lastEmptyEraserLayerToastAt || 0) < ERASER_EMPTY_LAYER_TOAST_THROTTLE_MS) {
        return;
      }

      const toast = this.ensureEmptyEraserLayerToast();

      if (!toast) {
        return;
      }

      this.lastEmptyEraserLayerToastAt = now;

      if (this.emptyEraserLayerToastTimer) {
        window.clearTimeout?.(this.emptyEraserLayerToastTimer);
        this.emptyEraserLayerToastTimer = 0;
      }

      toast.textContent = message;
      toast.hidden = false;
      this.emptyEraserLayerToastTimer = window.setTimeout?.(() => {
        toast.hidden = true;
        this.emptyEraserLayerToastTimer = 0;
      }, ERASER_EMPTY_LAYER_TOAST_MS) || 0;
    }

    getActiveRasterTargetForEraser() {
      const layerModel = this.documentRenderer?.layerModel;
      const activeId = layerModel?.activeLayerId;

      if (!activeId || typeof layerModel?.findEntryById !== "function") {
        return this.getPaintTarget();
      }

      const activeLayer = layerModel.findEntryById(activeId);

      if (activeLayer?.type !== "paint" && activeLayer?.type !== "image") {
        return null;
      }

      const existingTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(activeId);
      const isEmptySparseTarget =
        this.documentRenderer?.isSparseRasterTarget?.(existingTarget) &&
        existingTarget.tiles.size === 0;

      if (!existingTarget || isEmptySparseTarget) {
        this.showEmptyEraserLayerToast();
        return null;
      }

      const target = this.documentRenderer?.isCroppedRasterTarget?.(existingTarget)
        ? this.documentRenderer?.materializeRasterTarget?.(activeId, {
            source: "eraser-materialize",
          })
        : this.documentRenderer?.getRasterTarget?.(activeId);

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      return target;
    }

    createSeededUnit(seed) {
      const nextSeed = (Math.imul((seed || 1) >>> 0, 1664525) + 1013904223) >>> 0;

      return nextSeed / 4294967296;
    }

    createStableStrokeUnit(salt) {
      return this.createSeededUnit(((this.strokeInitialSeed || 1) ^ (salt || 0)) >>> 0);
    }

    createStableStrokeSigned(salt) {
      return this.createStableStrokeUnit(salt) * 2 - 1;
    }

    createStrokeSeed(point, tool = "brush") {
      const salt = tool === "eraser" ? 0x9e3779b9 : 0x85ebca6b;

      return (
        Date.now() ^
        Math.round(point.x * 1000) ^
        Math.round(point.y * 1000) ^
        salt
      ) >>> 0;
    }

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
            tool,
          })
        : null;
      this.initializeVelocityPressureState(sample);

      return {
        ...sample,
        pressure: this.resolveSamplePressure(sample, inputPressure),
      };
    }

    processPointerSample(event) {
      return this.applyStabilization(this.createPointerSample(event));
    }

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
      );

      return {
        ...rawSample,
        x: processed.point.x,
        y: processed.point.y,
        pressure: this.resolveSamplePressure(rawSample, processed.pressure),
      };
    }

    shouldUseVelocityPressure(sample) {
      const pointerType = String(sample?.pointerType || "").toLowerCase();

      return (
        this.brushState.velocityPressureEnabled === true &&
        this.currentStrokeTool !== "eraser" &&
        pointerType !== "pen"
      );
    }

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

    resolveSamplePressure(sample, fallbackPressure = 1) {
      if (!this.shouldUseVelocityPressure(sample)) {
        return fallbackPressure;
      }

      return this.updateVelocityPressure(sample);
    }

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

    getColorDynamicsAmount(key) {
      const value = this.brushState?.[key] ?? namespace.brushSettings?.[key] ?? 0;

      return this.clamp01(value);
    }

    getColorJitterAmounts(prefix) {
      return {
        hue: this.getColorDynamicsAmount(`${prefix}ColorHueJitter`),
        saturation: this.getColorDynamicsAmount(`${prefix}ColorSaturationJitter`),
        lightness: this.getColorDynamicsAmount(`${prefix}ColorLightnessJitter`),
        darkness: this.getColorDynamicsAmount(`${prefix}ColorDarknessJitter`),
        secondary: this.getColorDynamicsAmount(`${prefix}ColorSecondaryJitter`),
      };
    }

    hasColorJitter(amounts) {
      return (
        amounts.hue > 0 ||
        amounts.saturation > 0 ||
        amounts.lightness > 0 ||
        amounts.darkness > 0 ||
        amounts.secondary > 0
      );
    }

    getPrimaryColorRgb() {
      return this.parseColorToRgb01(
        this.brushState?.color ??
          namespace.selectedColors?.primary ??
          namespace.selectedColor ??
          "#000000",
      );
    }

    getSecondaryColorRgb() {
      return this.parseColorToRgb01(
        this.brushState?.secondaryColor ?? namespace.selectedColors?.secondary ?? "#000000",
      );
    }

    nextColorRandom() {
      const state = this.strokeColorRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeColorRandomState = state;

      return state.seed / 4294967296;
    }

    initializeWetMixRandom(seed) {
      const wetSeed = ((((seed || 1) >>> 0) ^ 0xa24baed5) >>> 0) || 1;

      this.strokeWetRandomState = { seed: wetSeed };
    }

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

    nextGrainRandom() {
      const state = this.strokeGrainRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeGrainRandomState = state;

      return state.seed / 4294967296;
    }

    nextWetRandom() {
      const state = this.strokeWetRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeWetRandomState = state;

      return state.seed / 4294967296;
    }

    randomColorSigned() {
      return this.nextColorRandom() * 2 - 1;
    }

    wrapUnit(value) {
      return ((value % 1) + 1) % 1;
    }

    wrapHue(hue) {
      return ((hue % 360) + 360) % 360;
    }

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

    mixRgb(from, to, t) {
      const amount = this.clamp01(t);

      return [
        this.lerp(this.clamp01(from?.[0]), this.clamp01(to?.[0]), amount),
        this.lerp(this.clamp01(from?.[1]), this.clamp01(to?.[1]), amount),
        this.lerp(this.clamp01(from?.[2]), this.clamp01(to?.[2]), amount),
      ];
    }

    getColorSampleUnit(sample, channel) {
      const value = sample?.[channel];

      return Number.isFinite(value) ? this.wrapUnit(value) : this.nextColorRandom();
    }

    getColorSampleSigned(sample, channel) {
      return this.getColorSampleUnit(sample, channel) * 2 - 1;
    }

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

    getCurrentStrokeColorRgb() {
      return this.strokeColorState?.strokeBaseColorRgb || this.getPrimaryColorRgb();
    }

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

    getOpacity01() {
      const value = Number(this.brushState.opacity);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    getMinSizeRatio() {
      const value = Number(this.brushState.minSizeRatio);

      if (!Number.isFinite(value)) {
        return 0.15;
      }

      return Math.max(0, Math.min(1, value));
    }

    getRenderingModePreset() {
      const mode = String(this.brushState.renderingMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return RENDERING_MODE_PRESETS[mode] || RENDERING_MODE_PRESETS["light-glaze"];
    }

    getFlow() {
      const value = Number(this.brushState.flow ?? 1.0);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 1.0;
    }

    getStrokeBuildUp() {
      const preset = this.getRenderingModePreset();
      const value = Number(preset.strokeBuildUp);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }

    getWetEdges() {
      const value = Number(this.brushState.wetEdges);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }

    getBurntEdges() {
      const value = Number(this.brushState.burntEdges);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }

    getBurntEdgesModeId() {
      const mode = String(this.brushState.burntEdgesMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return BURNT_EDGES_MODE_IDS[mode] ?? BURNT_EDGES_MODE_IDS["linear-burn"];
    }

    isAlphaThresholdEnabled() {
      return this.brushState.alphaThresholdEnabled === true;
    }

    getAlphaThreshold() {
      const value = Number(this.brushState.alphaThreshold);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0.5;
    }

    getHardness() {
      const value = Number(this.brushState.hardness);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }

    clamp01(value) {
      return this.clamp(value, 0, 1);
    }

    nextRandom() {
      const state = this.strokeRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeRandomState = state;

      return state.seed / 4294967296;
    }

    randomSigned() {
      return this.nextRandom() * 2 - 1;
    }

    lerp(start, end, t) {
      return start + (end - start) * t;
    }

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
        tiltX: this.lerp(p1.tiltX, p2.tiltX, t),
        tiltY: this.lerp(p1.tiltY, p2.tiltY, t),
      };
    }

    createStamp(point, alphaScale = 1) {
      return {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        alphaScale,
        sizeScale: 1,
        rotation: 0,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
      };
    }

    lerpStamp(from, to, t) {
      return {
        x: this.lerp(from.x, to.x, t),
        y: this.lerp(from.y, to.y, t),
        pressure: this.lerp(from.pressure, to.pressure, t),
        alphaScale: this.lerp(from.alphaScale ?? 1, to.alphaScale ?? 1, t),
        sizeScale: this.lerp(from.sizeScale ?? 1, to.sizeScale ?? 1, t),
        rotation: this.lerp(from.rotation ?? 0, to.rotation ?? 0, t),
        tiltX: this.lerp(from.tiltX, to.tiltX, t),
        tiltY: this.lerp(from.tiltY, to.tiltY, t),
      };
    }

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

    isTaperActive() {
      const taperStart = this.clamp01(this.brushState.taperStart);
      const taperEnd = this.clamp01(this.brushState.taperEnd);
      const taperSize = this.clamp01(this.brushState.taperSize ?? 1);
      const taperOpacity = this.clamp01(this.brushState.taperOpacity ?? 0);
      const taperPressure = this.clamp01(this.brushState.taperPressure ?? 0);

      return (taperStart > 0 || taperEnd > 0) && (taperSize > 0 || taperOpacity > 0 || taperPressure > 0);
    }

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

    getBaseBrushRadius() {
      return Math.max(0.5, this.getBaseBrushSize() * 0.5);
    }

    getBrushSize() {
      return this.getBaseBrushSize();
    }

    getStrokeChargeRadius() {
      const radius = Number(this.strokeChargeRadius);

      return Number.isFinite(radius) && radius > 0 ? radius : this.getBaseBrushRadius();
    }

    getStampSpacing(sizeScale = 1) {
      const brushSize = this.getBrushSize();
      const spacingFraction = Number(this.brushState.spacing);
      const safeSpacing = Number.isFinite(spacingFraction)
        ? this.clamp(spacingFraction, 0, 1)
        : 0.1;
      const spacingJitter = this.clamp01(this.brushState.spacingJitter);
      const effectiveSizeScale = this.clamp(sizeScale, 0.05, 1);
      const baseSpacing = Math.max(0.5, brushSize * effectiveSizeScale * safeSpacing);
      const jitterAmount = baseSpacing * spacingJitter * 0.85;
      const spacing = Math.max(0.5, baseSpacing + this.randomSigned() * jitterAmount);

      if (this.taperSpacingCap != null) {
        return Math.min(spacing, this.taperSpacingCap);
      }

      return spacing;
    }

    getCurrentStrokePathLength() {
      return Math.max(0, this.strokeDistance + this.leftoverDistance);
    }

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

    getTaperSpacingCap(totalLength) {
      const safeLength = Number(totalLength);

      if (!Number.isFinite(safeLength) || safeLength <= 0) {
        return null;
      }

      // Durante la rigenerazione taper i tratti molto corti hanno bisogno di
      // abbastanza dab per descrivere la percentuale della traccia, non un solo cerchio.
      return Math.max(0.5, safeLength / 12);
    }

    getFallOffScale() {
      const fallOff = this.clamp01(this.brushState.fallOff);

      if (fallOff <= 0) {
        return 1;
      }

      const radius = Math.max(0.5, this.getBrushSize() * 0.5);
      const fadeDistance = Math.max(radius * 2, radius * (96 - fallOff * 88));

      return this.clamp(1 - this.strokeDistance / fadeDistance, 0, 1);
    }

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

    getStampAlphaScale() {
      return this.getFallOffScale() * this.getWetMixAlphaScale();
    }

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

      this.updateStrokePreviewDirtyRects();
      this.queueActiveStrokeDirtyRegionDebug();
      this.queueStrokeTargetPrewarm();
    }

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

    setStrokeBufferScissor(scissor) {
      if (!scissor) {
        return false;
      }

      const gl = this.gl;

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);

      return true;
    }

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

    clonePreviewDirtyRects(rects) {
      if (!Array.isArray(rects)) {
        return [];
      }

      return rects
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => ({ ...rect }));
    }

    storeStrokePreviewDirtyRects(rects) {
      const cloned = this.clonePreviewDirtyRects(rects);

      if (cloned.length > 0) {
        this.strokePreviewDirtyRects = cloned;
        this.lastStrokePreviewDirtyRects = cloned.map((rect) => ({ ...rect }));
      }

      return cloned;
    }

    updateStrokePreviewDirtyRects(effectiveStrokeRect = null, tilePatchRects = null) {
      const strokeRect = effectiveStrokeRect || this.getActiveStrokeRect();

      if (!strokeRect) {
        return [];
      }

      return this.storeStrokePreviewDirtyRects(
        this.getActiveStrokePreviewDirtyRects(strokeRect, tilePatchRects),
      );
    }

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

    queueStrokeTargetPrewarm() {
      if (
        this.currentStrokeTool === "eraser" ||
        !this.isDrawing ||
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

    prewarmStrokePaintTargets(maxNewTiles = STROKE_TARGET_PREWARM_MAX_TILES) {
      if (
        this.currentStrokeTool === "eraser" ||
        !this.isDrawing ||
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

    getActiveStrokePreviewDirtyRects(effectiveStrokeRect, tilePatchRects = null) {
      const sourceRects = Array.isArray(tilePatchRects) && tilePatchRects.length > 0
        ? tilePatchRects
        : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);
      const dirtyRects = this.getTileBasedPreviewDirtyRects(sourceRects, effectiveStrokeRect);

      return dirtyRects.length > 0
        ? dirtyRects
        : (effectiveStrokeRect ? [{ ...effectiveStrokeRect }] : []);
    }

    warmPreviewCacheForStroke() {
      if (
        namespace.smudgeEngine?.isDragging ||
        !this.documentRenderer?.updatePreviewCacheIfNeeded
      ) {
        return false;
      }

      if (
        typeof this.documentRenderer.shouldUsePreviewCacheForCamera === "function" &&
        !this.documentRenderer.shouldUsePreviewCacheForCamera(this.camera)
      ) {
        return false;
      }

      return this.documentRenderer.updatePreviewCacheIfNeeded() === true;
    }

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

    getShapeRotation() {
      return this.clamp(this.brushState.shapeRotation, -1, 1);
    }

    getShapeScatter() {
      return this.clamp(this.brushState.shapeScatter, 0, 2);
    }

    getShapeCount() {
      return this.clamp(Math.round(Number(this.brushState.shapeCount) || 1), 1, 16);
    }

    getShapeCountJitter() {
      return this.clamp01(this.brushState.shapeCountJitter);
    }

    getShapeFlipXSign() {
      return this.brushState.shapeFlipX === true ? -1 : 1;
    }

    getShapeFlipYSign() {
      return this.brushState.shapeFlipY === true ? -1 : 1;
    }

    isGrainEnabled() {
      const mode = this.getGrainMode();

      if (
        this.brushState.grainEnabled !== true ||
        !this.grainTextureReady ||
        !this.grainTexture
      ) {
        return false;
      }

      if (mode === "moving") {
        return this.getGrainMovingScale() > 0 && this.getGrainMovingDepth() > 0;
      }

      return (
        this.getGrainTexturizedScale() > 0 &&
        this.getGrainTexturizedDepth() > 0
      );
    }

    getGrainMode() {
      return this.brushState.grainMode === "moving" ? "moving" : "texturized";
    }

    getGrainBlendModeId() {
      const mode = String(this.brushState.grainBlendMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return GRAIN_BLEND_MODE_IDS[mode] ?? GRAIN_BLEND_MODE_IDS.multiply;
    }

    getGrainBrightness() {
      const value = Number(this.brushState.grainBrightness);

      return Number.isFinite(value) ? this.clamp(value, -1, 1) : 0;
    }

    getGrainContrast() {
      const value = Number(this.brushState.grainContrast);

      return Number.isFinite(value) ? this.clamp(value, -1, 1) : 0;
    }

    textureScaleToTexturizedScale(textureScale) {
      const value = Number(textureScale);

      if (!Number.isFinite(value) || value <= 0) {
        return 0;
      }

      const minLog = Math.log(GRAIN_TEXTURIZED_MIN_TEXTURE_SCALE);
      const maxLog = Math.log(1);

      return this.clamp01((Math.log(value) - minLog) / (maxLog - minLog));
    }

    getGrainTexturizedScale() {
      const value = Number(this.brushState.grainTexturizedScale);

      if (Number.isFinite(value)) {
        return this.clamp01(value);
      }

      const legacyScale = Number(this.brushState.grainScale);

      return Number.isFinite(legacyScale) ? this.textureScaleToTexturizedScale(legacyScale) : 1;
    }

    getGrainScale() {
      const value = this.getGrainMode() === "moving"
        ? this.getGrainMovingScale()
        : this.getGrainTexturizedScale();

      if (value <= 0) {
        return 0;
      }

      return Math.exp(Math.log(GRAIN_TEXTURIZED_MIN_TEXTURE_SCALE) * (1 - value));
    }

    getGrainRotationRadians() {
      const degrees = Number(this.brushState.grainRotation);

      return Number.isFinite(degrees) ? degrees * (Math.PI / 180) : 0;
    }

    getGrainTexturizedDepth() {
      const value = Number(this.brushState.grainTexturizedDepth);

      if (Number.isFinite(value)) {
        return this.clamp01(value);
      }

      return this.clamp01(this.brushState.grainStrength ?? 1);
    }

    getGrainMovingMovement() {
      return this.clamp01(this.brushState.grainMovingMovement);
    }

    getGrainMovingScale() {
      return this.clamp01(this.brushState.grainMovingScale ?? 1);
    }

    getGrainMovingZoom() {
      return this.clamp01(this.brushState.grainMovingZoom);
    }

    getGrainMovingRotation() {
      return this.clamp(this.brushState.grainMovingRotation, -1, 1);
    }

    getGrainMovingDepth() {
      return this.clamp01(this.brushState.grainMovingDepth ?? 1);
    }

    getGrainMovingDepthMinimum() {
      return this.clamp01(this.brushState.grainMovingDepthMinimum);
    }

    getGrainMovingDepthJitter() {
      return this.clamp01(this.brushState.grainMovingDepthJitter);
    }

    getGrainMovingOffsetJitter() {
      return this.brushState.grainMovingOffsetJitter !== false;
    }

    getActiveGrainDepth() {
      return this.getGrainMode() === "moving"
        ? this.getGrainMovingDepth()
        : this.getGrainTexturizedDepth();
    }

    isGrainInverted() {
      return this.brushState.grainInvert === true;
    }

    getEffectiveShapeCount(randomUnit = null) {
      const count = this.getShapeCount();
      const jitter = this.getShapeCountJitter();

      if (jitter <= 0 || count <= 1) {
        return count;
      }

      const minCount = Math.max(1, Math.ceil(count * (1 - jitter)));

      if (minCount >= count) {
        return count;
      }

      const unit = typeof randomUnit === "function" ? randomUnit() : this.nextRandom();

      return minCount + Math.floor(unit * (count - minCount + 1));
    }

    getShapeDirectionalRotation(tangent) {
      const rotationFollow = this.getShapeRotation();

      if (rotationFollow === 0 || !this.hasUsableShapeTangent(tangent)) {
        return this.strokeShapeRotation;
      }

      return this.strokeShapeRotation + Math.atan2(tangent.y, tangent.x) * rotationFollow;
    }

    hasUsableShapeTangent(tangent) {
      return Boolean(tangent && (tangent.x !== 0 || tangent.y !== 0));
    }

    getPointTangent(from, to) {
      if (!from || !to) {
        return null;
      }

      const distance = Math.hypot(to.x - from.x, to.y - from.y);

      if (distance <= 0) {
        return null;
      }

      return {
        x: (to.x - from.x) / distance,
        y: (to.y - from.y) / distance,
      };
    }

    applyPendingShapeRotation(tangent) {
      if (!this.hasUsableShapeTangent(tangent)) {
        return;
      }

      const directionalRotation = this.getShapeDirectionalRotation(tangent);

      this.stampsBuffer.forEach((stamp) => {
        if (stamp.needsShapeRotationTangent !== true) {
          return;
        }

        stamp.rotation = directionalRotation + (stamp.shapeScatterRotation ?? 0);
        stamp.needsShapeRotationTangent = false;
      });
    }

    getShapeScatterRotation(randomSignedValue = null) {
      const scatter = this.getShapeScatter();

      if (scatter <= 0) {
        return 0;
      }

      const signedValue = Number.isFinite(randomSignedValue) ? randomSignedValue : this.randomSigned();

      return signedValue * Math.PI * scatter * 0.5;
    }

    getGrainMovingDirectionalRotation(tangent) {
      const rotationFollow = this.getGrainMovingRotation();

      if (rotationFollow === 0 || !tangent || (tangent.x === 0 && tangent.y === 0)) {
        return 0;
      }

      return Math.atan2(tangent.y, tangent.x) * rotationFollow;
    }

    getGrainMovingDepthScale() {
      const jitter = this.getGrainMovingDepthJitter();

      if (jitter <= 0) {
        return 1;
      }

      return this.lerp(1, this.nextGrainRandom(), jitter);
    }

    applyMovingGrainToStamp(stamp, tangent) {
      if (this.getGrainMode() !== "moving") {
        stamp.grainOffsetX = 0;
        stamp.grainOffsetY = 0;
        stamp.grainTravel = 0;
        stamp.grainRotation = 0;
        stamp.grainDepthScale = 1;
        return;
      }

      stamp.grainOffsetX = this.strokeGrainOffset?.x ?? 0;
      stamp.grainOffsetY = this.strokeGrainOffset?.y ?? 0;
      stamp.grainTravel = this.strokeDistance;
      stamp.grainRotation = this.getGrainMovingDirectionalRotation(tangent);
      stamp.grainDepthScale = this.getGrainMovingDepthScale();
    }

    pushShapeStamps(baseStamp, tangent) {
      const isFirstStrokeShape = this.strokeStampCount === 0 && this.stampsBuffer.length === 0 && this.strokeDistance === 0;
      const effectiveCount = this.getEffectiveShapeCount(
        isFirstStrokeShape ? () => this.createStableStrokeUnit(0x51f15eed) : null,
      );
      const hasDirectionalTangent = this.hasUsableShapeTangent(tangent);
      const shouldUpdateWhenTangentArrives = this.getShapeRotation() !== 0 && !hasDirectionalTangent;
      const directionalRotation = this.getShapeDirectionalRotation(tangent);
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
        if (shouldUpdateWhenTangentArrives) {
          baseStamp.needsShapeRotationTangent = true;
          baseStamp.shapeScatterRotation = scatterRotation;
        }

        if (this.isStampCompletelyOutsideDocument(baseStamp)) {
          return;
        }

        this.applyMovingGrainToStamp(baseStamp, tangent);
        baseStamp.colorRgb = this.getNextStampColorRgb();
        this.includeStrokeStampBounds(baseStamp);
        this.stampsBuffer.push(baseStamp);
        return;
      }

      for (let index = 0; index < effectiveCount; index += 1) {
        const scatterRotation = getScatterRotation(index);
        const stamp = {
          ...baseStamp,
          rotation: directionalRotation + scatterRotation,
        };

        if (shouldUpdateWhenTangentArrives) {
          stamp.needsShapeRotationTangent = true;
          stamp.shapeScatterRotation = scatterRotation;
        }

        if (this.isStampCompletelyOutsideDocument(stamp)) {
          continue;
        }

        this.applyMovingGrainToStamp(stamp, tangent);
        stamp.colorRgb = this.getNextStampColorRgb();
        this.includeStrokeStampBounds(stamp);
        this.stampsBuffer.push(stamp);
      }
    }

    processStamps() {
      if (this.currentStroke.length !== 4) {
        return;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.process-stamps", {
        tool: this.currentStrokeTool || "brush",
      }) : null;

      try {
      const [p0, p1, p2, p3] = this.currentStroke;
      const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (segmentDistance <= 0) {
        this.applyPendingShapeRotation(this.getPointTangent(p2, p3));
        this.currentStroke.shift();
        this.flushStamps();
        return;
      }

      const sampleCount = Math.max(8, Math.min(128, Math.ceil(segmentDistance / 4)));
      let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

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
            this.applyTaperToStamp(stamp);
            this.pushShapeStamps(stamp, tangent);
            if (this.stampsBuffer.length >= MAX_STAMPS_PER_FLUSH) {
              this.flushStamps();
            }
            this.leftoverDistance -= stampDistance;
            this.nextStampDistance = this.getStampSpacing(stamp.sizeScale);
          }
        }

        previousPoint = point;
      }

      this.currentStroke.shift();
      this.flushStamps();
      } finally {
        trace?.end({
          bufferedStamps: this.stampsBuffer.length,
          strokeStamps: this.strokeStampCount,
        });
      }
    }

    flushStamps() {
      if (this.stampsBuffer.length === 0) {
        return;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.flush-stamps", {
        bufferedStamps: this.stampsBuffer.length,
        tool: this.currentStrokeTool || "brush",
      }) : null;
      const beginFlushTrace = (name, detail = {}) => namespace.PerfTrace?.enabled
        ? namespace.PerfTrace.begin(`brush.flush-stamps.${name}`, detail)
        : null;
      let flushUsedScissor = false;

      try {
      const gl = this.gl;
      const target = this.getDocumentDrawTarget(this.strokeTargetLayerId || "");
      const strokeRect = this.getActiveStrokeRect();

      if (!strokeRect || !this.ensureStrokeLayerTargetForRect(strokeRect, target)) {
        this.stampsBuffer.length = 0;
        return;
      }

      const strokeBufferRect = this.strokeBufferRect || this.getFullDocumentRect(target);
      const stampCount = this.stampsBuffer.length;
      const flushDirtyRect = this.getStampBufferDirtyRect(this.stampsBuffer, strokeBufferRect);
      const flushScissor = this.getStrokeBufferScissor(flushDirtyRect, strokeBufferRect);
      flushUsedScissor = Boolean(flushScissor);
      const instanceTrace = beginFlushTrace("instance-data", {
        scissorPixels: Math.max(0, Math.round(flushScissor?.width || 0)) *
          Math.max(0, Math.round(flushScissor?.height || 0)),
        stampCount,
      });
      // 14 float per istanza: base dab + colore + dati grain Moving.
      const instanceData = new Float32Array(stampCount * 14);
      const brushSize = this.getBrushSize();
      const fallbackColor = this.getCurrentStrokeColorRgb();
      const useShapeTexture = this.shapeTextureReady && this.shapeTexture ? 1 : 0;
      const useGrainTexture = this.isGrainEnabled();
      const brushOpacity = this.getOpacity01();

      for (let index = 0; index < stampCount; index += 1) {
        const stamp = this.stampsBuffer[index];
        const offset = index * 14;
        const color = stamp.colorRgb || fallbackColor;

        instanceData[offset] = stamp.x;
        instanceData[offset + 1] = stamp.y;
        instanceData[offset + 2] = stamp.pressure;
        instanceData[offset + 3] = (stamp.alphaScale ?? 1) * brushOpacity;
        instanceData[offset + 4] = stamp.sizeScale ?? 1;
        instanceData[offset + 5] = stamp.rotation ?? 0;
        instanceData[offset + 6] = color[0];
        instanceData[offset + 7] = color[1];
        instanceData[offset + 8] = color[2];
        instanceData[offset + 9] = stamp.grainOffsetX ?? 0;
        instanceData[offset + 10] = stamp.grainOffsetY ?? 0;
        instanceData[offset + 11] = stamp.grainTravel ?? 0;
        instanceData[offset + 12] = stamp.grainRotation ?? 0;
        instanceData[offset + 13] = stamp.grainDepthScale ?? 1;
      }
      instanceTrace?.end({
        floatCount: instanceData.length,
      });

      gl.useProgram(this.brushProgramInfo.program);
      gl.uniform2f(this.brushProgramInfo.uniforms.docResolution, target.width, target.height);
      gl.uniform2f(this.brushProgramInfo.uniforms.targetOrigin, strokeBufferRect.x, strokeBufferRect.y);
      gl.uniform2f(this.brushProgramInfo.uniforms.targetSize, strokeBufferRect.width, strokeBufferRect.height);
      gl.uniform1f(this.brushProgramInfo.uniforms.brushSize, brushSize);
      gl.uniform1f(this.brushProgramInfo.uniforms.minSizeRatio, this.getMinSizeRatio());
      gl.uniform2f(this.brushProgramInfo.uniforms.shapeFlip, this.getShapeFlipXSign(), this.getShapeFlipYSign());
      gl.uniform1f(this.brushProgramInfo.uniforms.flow, this.getFlow());
      gl.uniform1f(this.brushProgramInfo.uniforms.hardness, this.getHardness());
      gl.uniform1f(this.brushProgramInfo.uniforms.wetEdges, this.getWetEdges());
      gl.uniform1f(this.brushProgramInfo.uniforms.burntEdges, this.getBurntEdges());
      gl.uniform1i(this.brushProgramInfo.uniforms.burntEdgesMode, this.getBurntEdgesModeId());
      gl.uniform1i(this.brushProgramInfo.uniforms.alphaThresholdEnabled, this.isAlphaThresholdEnabled() ? 1 : 0);
      gl.uniform1f(this.brushProgramInfo.uniforms.alphaThreshold, this.getAlphaThreshold());
      gl.uniform1f(this.brushProgramInfo.uniforms.useShapeTexture, useShapeTexture);
      gl.uniform1i(this.brushProgramInfo.uniforms.shapeTexture, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, useShapeTexture ? this.shapeTexture : null);
      gl.uniform1i(this.brushProgramInfo.uniforms.grainEnabled, useGrainTexture ? 1 : 0);
      gl.uniform1i(this.brushProgramInfo.uniforms.grainTexture, 2);

      if (useGrainTexture) {
        const grainMode = this.getGrainMode();
        const grainRotation = grainMode === "moving" ? 0 : this.getGrainRotationRadians();
        const cos = Math.cos(grainRotation);
        const sin = Math.sin(grainRotation);
        const rotationMatrix = new Float32Array([cos, sin, -sin, cos]);

        gl.uniform2f(this.brushProgramInfo.uniforms.grainTexSize, this.grainImageWidth, this.grainImageHeight);
        gl.uniform1i(this.brushProgramInfo.uniforms.grainMode, grainMode === "moving" ? 1 : 0);
        gl.uniform1f(this.brushProgramInfo.uniforms.grainScale, this.getGrainScale());
        gl.uniformMatrix2fv(this.brushProgramInfo.uniforms.grainRotationMat, false, rotationMatrix);
        gl.uniform1f(this.brushProgramInfo.uniforms.grainDepth, this.getActiveGrainDepth());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainMovement, this.getGrainMovingMovement());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainZoom, this.getGrainMovingZoom());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainDepthMinimum, this.getGrainMovingDepthMinimum());
        gl.uniform1i(this.brushProgramInfo.uniforms.grainBlendMode, this.getGrainBlendModeId());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainBrightness, this.getGrainBrightness());
        gl.uniform1f(this.brushProgramInfo.uniforms.grainContrast, this.getGrainContrast());
        gl.uniform1i(this.brushProgramInfo.uniforms.grainInvert, this.isGrainInverted() ? 1 : 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
      }

      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(this.brush.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brush.instanceVBO);
      const uploadTrace = beginFlushTrace("upload", {
        bytes: instanceData.byteLength,
        stampCount,
      });
      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
      uploadTrace?.end({
        bytes: instanceData.byteLength,
      });

      const drawTrace = beginFlushTrace("draw-stamps", {
        scissor: Boolean(flushScissor),
        stampCount,
      });
      const didSetFlushScissor = this.setStrokeBufferScissor(flushScissor);

      try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokePlateauFBO);
      gl.viewport(0, 0, strokeBufferRect.width, strokeBufferRect.height);
      gl.enable(gl.BLEND);
      // Plateau reale: Light Glaze non somma ne' opacità ne' colore nello stesso stroke.
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stampCount);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokeAccumFBO);
      gl.viewport(0, 0, strokeBufferRect.width, strokeBufferRect.height);
      gl.enable(gl.BLEND);
      // Accumulo pieno: gli stamp dello stesso tratto si stratificano con SrcOver pre-moltiplicato.
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stampCount);
      } finally {
      if (didSetFlushScissor) {
        gl.disable(gl.SCISSOR_TEST);
      }
      }
      drawTrace?.end({
        scissorHeight: Math.max(0, Math.round(flushScissor?.height || 0)),
        scissorWidth: Math.max(0, Math.round(flushScissor?.width || 0)),
      });

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(null);
      // Ripristina la pipeline al blending pre-moltiplicato standard.
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const composeTrace = beginFlushTrace("compose", {
        scissor: Boolean(flushScissor),
      });
      this.composeStrokeBuildUp(flushDirtyRect);
      composeTrace?.end({
        scissorHeight: Math.max(0, Math.round(flushScissor?.height || 0)),
        scissorWidth: Math.max(0, Math.round(flushScissor?.width || 0)),
      });
      this.stampsBuffer.length = 0;
      this.strokeStampCount += stampCount;
      this.requestDraw();
      } finally {
        trace?.end({
          scissor: flushUsedScissor,
          strokeStamps: this.strokeStampCount,
        });
      }
    }

    composeStrokeBuildUp(dirtyRect = null) {
      const gl = this.gl;
      const target = this.strokeBufferRect || this.getFullDocumentRect();
      const { program, uniforms } = this.strokeBuildupProgramInfo;
      const scissor = this.getStrokeBufferScissor(dirtyRect, target);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokeFBO);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      const didSetScissor = this.setStrokeBufferScissor(scissor);

      try {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.strokePlateauTexture);
      gl.uniform1i(uniforms.plateauTexture, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.strokeAccumTexture);
      gl.uniform1i(uniforms.accumTexture, 1);
      gl.uniform1f(uniforms.buildUp, this.getStrokeBuildUp());

      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      } finally {
      if (didSetScissor) {
        gl.disable(gl.SCISSOR_TEST);
      }
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    bakeStroke() {
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("brush.bake", {
        tool: this.currentStrokeTool || "brush",
      }) : null;
      const beginBakeTrace = (name, detail = {}) => namespace.PerfTrace?.enabled
        ? namespace.PerfTrace.begin(`brush.bake.${name}`, detail)
        : null;

      try {
      const setupTrace = beginBakeTrace("setup");
      const gl = this.gl;
      const layerId = this.strokeTargetLayerId ||
        this.documentRenderer?.resolvePaintLayerId?.() ||
        this.getDocumentDrawTarget().layerId;
      const isEraserStroke = this.currentStrokeTool === "eraser";
      const { program, uniforms } = this.compositeProgramInfo;
      const strokeRect = this.getActiveStrokeRect();
      setupTrace?.end({
        hasStrokeRect: Boolean(strokeRect),
        hasStrokeTexture: Boolean(this.strokeTexture),
        layerId,
        tool: this.currentStrokeTool || "brush",
      });

      if (!this.strokeTexture || !strokeRect) {
        this.releaseStrokeLayerTarget();
        return;
      }

      const coverageTrace = beginBakeTrace("coverage");
      const selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(strokeRect);
      const hasSelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length > 0;
      const hasEmptySelectionCoverage = Array.isArray(selectionCoverageRects) && selectionCoverageRects.length === 0;
      coverageTrace?.end({
        coverageRectCount: Array.isArray(selectionCoverageRects) ? selectionCoverageRects.length : 0,
        hasEmptySelectionCoverage,
        hasSelectionCoverage,
      });

      if (hasEmptySelectionCoverage) {
        this.clearStrokeLayer();
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        return;
      }

      const effectiveStrokeRect = hasSelectionCoverage
        ? this.getBoundsForDocumentRects(selectionCoverageRects)
        : strokeRect;

      if (!effectiveStrokeRect) {
        this.clearStrokeLayer();
        this.releaseStrokeLayerTarget();
        this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
        return;
      }

      const targetTrace = beginBakeTrace("targets");
      const documentTarget = this.getDocumentDrawTarget(layerId);
      const finalStrokeBufferRect = this.getFinalStrokeAllocationRect(strokeRect, documentTarget);
      const activeStrokeTilePatchRects = hasSelectionCoverage
        ? this.filterTilePatchRectsToCoverage(
            this.getActiveStrokeTilePatchRects(effectiveStrokeRect),
            selectionCoverageRects,
          )
        : this.getActiveStrokeTilePatchRects(effectiveStrokeRect);
      const computedPreviewDirtyRects = this.updateStrokePreviewDirtyRects(
        effectiveStrokeRect,
        activeStrokeTilePatchRects,
      );
      const previewDirtyRects = computedPreviewDirtyRects.length > 0
        ? computedPreviewDirtyRects
        : this.getFallbackStrokePreviewDirtyRects(effectiveStrokeRect);
      const paintTargets = isEraserStroke
        ? this.documentRenderer?.getRasterTargetsForPaintRect?.(layerId, effectiveStrokeRect, {
            source: "brush-eraser-target",
            tilePatchRects: activeStrokeTilePatchRects,
          }) || [{
            target: this.documentRenderer?.getRasterTarget?.(layerId) || this.getPaintTarget(),
          }]
        : this.documentRenderer?.ensureRasterTargetsForPaintRect?.(layerId, effectiveStrokeRect, {
            source: "brush-stroke-target",
            tilePatchRects: activeStrokeTilePatchRects,
          }) || [{
            target: this.documentRenderer?.ensureRasterTargetForPaintRect?.(layerId, effectiveStrokeRect, {
              source: "brush-stroke-target",
            }) || this.documentRenderer?.getRasterTarget?.(layerId),
          }];
      const target = paintTargets.find((item) => item?.target?.framebuffer && item?.target?.texture)?.target || null;
      targetTrace?.end({
        hasFinalStrokeBufferRect: Boolean(finalStrokeBufferRect),
        hasTarget: Boolean(target),
        paintTargetCount: paintTargets.length,
        previewDirtyRectCount: previewDirtyRects.length,
        tilePatchRectCount: activeStrokeTilePatchRects.length,
      });

      if (!target?.framebuffer || !target?.texture || !finalStrokeBufferRect) {
        this.releaseStrokeLayerTarget();
        return;
      }

      const historyPrepareTrace = beginBakeTrace("history-prepare");
      const memoryReport = this.createStrokeMemoryReport({
        layerId,
        phase: "brush-bake",
        strokeBufferRect: finalStrokeBufferRect,
        strokeRect: effectiveStrokeRect,
        target: documentTarget,
        tool: this.currentStrokeTool,
      });
      const batchedTileHistory = this.prepareBatchedBrushHistory(
        layerId,
        effectiveStrokeRect,
        memoryReport,
        activeStrokeTilePatchRects,
      );
      const tileHistory = !batchedTileHistory && this.options.enableHistory && effectiveStrokeRect
        ? this.documentRenderer?.beginRasterTileHistory?.(layerId, effectiveStrokeRect, {
            label: "brush-stroke",
            source: this.currentStrokeTool,
            tilePatchRects: activeStrokeTilePatchRects,
          })
        : null;
      const beforeSnapshot = this.options.enableHistory && effectiveStrokeRect && !batchedTileHistory && !tileHistory
        ? this.createHistorySnapshot(target, effectiveStrokeRect, "before-stroke")
        : null;
      historyPrepareTrace?.end({
        hasBatchedTileHistory: Boolean(batchedTileHistory),
        hasBeforeSnapshot: Boolean(beforeSnapshot),
        hasTileHistory: Boolean(tileHistory),
        historyMode: memoryReport?.historyMode || "",
        policy: memoryReport?.policy || "",
      });

      const preDrawTrace = beginBakeTrace("pre-draw");
      this.recordStrokeMemory(memoryReport);
      this.compactStrokeLayerTargetForRect(strokeRect, documentTarget);
      this.warmPreviewCacheForStroke();
      preDrawTrace?.end({
        policy: memoryReport?.policy || "",
      });
      const bakeRect = this.strokeBufferRect || { ...strokeRect };
      const drawTrace = beginBakeTrace("draw-targets", {
        paintTargetCount: paintTargets.length,
      });
      let drawCallCount = 0;
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      if (isEraserStroke) {
        gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.strokeTexture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.opacity, 1.0);

      gl.bindVertexArray(this.fullscreenQuad.vao);
      paintTargets.forEach((item) => {
        const paintTarget = item?.target;
        const targetRect = this.documentRenderer?.getRasterTargetDocumentRect?.(paintTarget) || { x: 0, y: 0 };
        const localBakeX = Math.round(bakeRect.x - targetRect.x);
        const localBakeY = Math.round(bakeRect.y - targetRect.y);
        const targetCoverageRects = hasSelectionCoverage
          ? selectionCoverageRects
              .map((selectionRect) => this.documentRenderer?.intersectRasterHistoryRects?.(selectionRect, targetRect))
              .filter(Boolean)
          : null;

        if (!paintTarget?.framebuffer || !paintTarget?.texture) {
          return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, paintTarget.framebuffer);
        gl.viewport(localBakeX, paintTarget.height - (localBakeY + bakeRect.height), bakeRect.width, bakeRect.height);
        if (hasSelectionCoverage) {
          if (!targetCoverageRects?.length) {
            return;
          }

          targetCoverageRects.forEach((selectionTargetRect) => {
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(
              selectionTargetRect.x - targetRect.x,
              paintTarget.height - ((selectionTargetRect.y - targetRect.y) + selectionTargetRect.height),
              selectionTargetRect.width,
              selectionTargetRect.height,
            );
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            drawCallCount += 1;
          });
          gl.disable(gl.SCISSOR_TEST);
        } else {
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          drawCallCount += 1;
        }
        this.documentRenderer?.markRasterTargetDirty?.(paintTarget);
      });
      if (hasSelectionCoverage) {
        gl.disable(gl.SCISSOR_TEST);
      }
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawTrace?.end({
        drawCallCount,
        paintTargetCount: paintTargets.length,
        selectionScissorCount: hasSelectionCoverage ? drawCallCount : 0,
      });

      const historyCommitTrace = beginBakeTrace("history-commit");
      let historyCommitMode = "none";
      let pushedHistoryEntry = false;
      if (batchedTileHistory) {
        historyCommitMode = "batched-tile";
        this.schedulePendingBrushHistoryCommit();
      } else if (tileHistory) {
        historyCommitMode = "tile";
        const history = namespace.documentHistory;
        const tileEntry = this.documentRenderer?.commitRasterTileHistory?.(tileHistory, {
          label: "brush-stroke",
          lazyAfter: true,
          memoryPolicy: memoryReport,
          redoSource: `history-redo-${this.currentStrokeTool}`,
          source: this.currentStrokeTool,
          type: "pixel",
          undoSource: `history-undo-${this.currentStrokeTool}`,
        });
        const entry = tileEntry
          ? this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, tileEntry, {
              source: this.currentStrokeTool,
            }) || tileEntry
          : null;

        if (history?.push && entry) {
          history.push(entry);
          pushedHistoryEntry = true;
          this.pruneRasterHistoryForStroke(memoryReport);
        } else {
          this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
            source: this.currentStrokeTool,
          });
          this.documentRenderer?.deleteRasterTileHistoryCapture?.(tileHistory);
        }
      } else if (beforeSnapshot) {
        historyCommitMode = "snapshot";
        const history = namespace.documentHistory;
        let afterSnapshot = null;
        let entry = null;
        const redoDisabled = memoryReport.historyMode === "gpu-before-no-redo";
        const captureRedoSnapshot = () => {
          if (redoDisabled) {
            return false;
          }

          if (afterSnapshot?.texture) {
            return true;
          }

          const redoTarget = this.documentRenderer?.getRasterTarget?.(layerId);

          afterSnapshot = this.createHistorySnapshot(redoTarget, beforeSnapshot.docRect || beforeSnapshot.rect, "after-stroke");
          if (afterSnapshot?.texture && entry) {
            entry.after = afterSnapshot;
          }

          return Boolean(afterSnapshot?.texture);
        };

        if (history?.push) {
          entry = {
            type: "pixel",
            after: null,
            before: beforeSnapshot,
            memoryPolicy: memoryReport,
            layerId,
            rect: beforeSnapshot.docRect || beforeSnapshot.rect,
            source: this.currentStrokeTool,
            undo: () => {
              if (redoDisabled) {
                return this.restoreHistorySnapshot(layerId, beforeSnapshot);
              }

              if (!captureRedoSnapshot()) {
                return false;
              }

              return this.restoreHistorySnapshot(layerId, beforeSnapshot);
            },
            redo: () => afterSnapshot?.texture
              ? this.restoreHistorySnapshot(layerId, afterSnapshot)
              : false,
            destroy: () => {
              this.deleteHistorySnapshot(beforeSnapshot);
              this.deleteHistorySnapshot(afterSnapshot);
            },
          };

          entry = this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, entry, {
            source: this.currentStrokeTool,
          }) || entry;

          history.push(entry);
          pushedHistoryEntry = true;
          this.pruneRasterHistoryForStroke(memoryReport);
        } else {
          this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
            source: this.currentStrokeTool,
          });
          this.deleteHistorySnapshot(beforeSnapshot);
        }
      } else {
        this.documentRenderer?.finalizeRasterEditHistoryEntry?.(layerId, null, {
          source: this.currentStrokeTool,
        });
      }
      historyCommitTrace?.end({
        mode: historyCommitMode,
        pushedHistoryEntry,
      });

      const cleanupTrace = beginBakeTrace("cleanup");
      this.clearStrokeLayer();
      this.releaseStrokeLayerTarget();
      this.documentRenderer?.deleteActiveStrokeScratchTarget?.();
      const keepPreviewCacheForDirtyBake = this.shouldKeepPreviewCacheForDirtyBake(
        previewDirtyRects,
        memoryReport,
        documentTarget,
      );
      this.documentRenderer?.evictRasterScratchCachesForPolicy?.(memoryReport, {
        deletePreviewCache: !keepPreviewCacheForDirtyBake,
        source: "brush-bake",
      });
      this.documentRenderer?.compactInactivePaintTargets?.({
        excludeLayerId: layerId,
        source: "brush-bake-compact-inactive",
      });
      cleanupTrace?.end({
        keepPreviewCacheForDirtyBake,
      });
      const dirtyTrace = beginBakeTrace("dirty");
      if (typeof this.documentRenderer?.commitVisualDirtyChange === "function") {
        this.documentRenderer.commitVisualDirtyChange({
          emit: false,
          layerId,
          maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: "bake-stroke",
        });
      } else {
        this.documentRenderer?.invalidatePreviewCache?.("bake-stroke", {
          layerId,
          maxDirtyRects: STROKE_PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
        });
      }
      this.requestDraw();
      dirtyTrace?.end({
        previewDirtyRectCount: previewDirtyRects.length,
      });
      } finally {
        trace?.end({
          strokeStamps: this.strokeStampCount,
          tool: this.currentStrokeTool || "brush",
        });
      }
    }

    clearStrokeLayer() {
      const gl = this.gl;
      const target = this.strokeBufferRect || this.getFullDocumentRect();
      const framebuffers = [this.strokeFBO, this.strokePlateauFBO, this.strokeAccumFBO];

      for (const framebuffer of framebuffers) {
        if (!framebuffer) {
          continue;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    clearAllLayers() {
      this.documentRenderer?.clear();
      this.releaseStrokeLayerTarget();
      this.requestDraw();
    }

    createHistorySnapshot(target, rect, label = "history snapshot") {
      if (!target?.framebuffer || !Number.isFinite(target.width) || !Number.isFinite(target.height) || !rect) {
        return null;
      }

      const targetRect = this.documentRenderer?.getRasterTargetDocumentRect?.(target) || {
        height: Math.max(1, Math.round(target.height || 1)),
        width: Math.max(1, Math.round(target.width || 1)),
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
      };
      const snapshotDocRect = this.intersectDocumentRects(rect, targetRect);

      if (!snapshotDocRect) {
        return null;
      }

      const gl = this.gl;
      const x = Math.max(0, Math.floor(snapshotDocRect.x - targetRect.x));
      const y = Math.max(0, Math.floor(snapshotDocRect.y - targetRect.y));
      const width = Math.max(1, Math.min(target.width - x, Math.ceil(snapshotDocRect.width)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil(snapshotDocRect.height)));
      const texture = gl.createTexture();

      if (!texture) {
        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.copyTexSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        x,
        target.height - (y + height),
        width,
        height,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const snapshotId = this.nextBrushResourceOwnerId("brush-history-snapshot");
      const docRect = {
        height,
        width,
        x: targetRect.x + x,
        y: targetRect.y + y,
      };
      const snapshot = {
        bytes: width * height * 4,
        docRect,
        id: snapshotId,
        label,
        layerId: this.strokeTargetLayerId || target?.layerId || "",
        rect: { x, y, width, height },
        state: "GPU_HOT",
        texture,
      };
      snapshot.dehydrateGpu = () => this.dehydrateHistorySnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateHistorySnapshot(snapshot);

      this.registerBrushTexture(texture, {
        bbox: docRect,
        height,
        kind: "historySnapshot",
        label,
        layerId: snapshot.layerId,
        originX: docRect.x,
        originY: docRect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width,
      });

      return snapshot;
    }

    dehydrateHistorySnapshot(snapshot) {
      if (!snapshot?.texture || snapshot.state === "CPU_COLD") {
        return snapshot?.state === "CPU_COLD";
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const framebuffer = gl.createFramebuffer();

      if (!framebuffer) {
        return false;
      }

      const pixels = new Uint8Array(width * height * 4);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, snapshot.texture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteFramebuffer(framebuffer);
          return false;
        }

        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        console.warn?.("[CBO brush] Impossibile raffreddare snapshot pennellata.", error);
        return false;
      }

      gl.deleteFramebuffer(framebuffer);
      this.deleteBrushTexture(snapshot.texture);
      gl.deleteTexture(snapshot.texture);
      snapshot.texture = null;

      const compression = window.CBO?.HistoryCompression;
      let storedPixels = pixels;
      let storedEncoding = null;
      const rawByteLength = pixels.byteLength;

      if (compression && typeof compression.compressRgba === "function") {
        try {
          const result = compression.compressRgba(pixels);

          if (result && result.encoding && result.bytes instanceof Uint8Array) {
            storedPixels = result.bytes;
            storedEncoding = result.encoding;
          }
        } catch (error) {
          console.warn?.("[CBO brush] Compressione RLE snapshot fallita, salvo raw.", error);
          storedPixels = pixels;
          storedEncoding = null;
        }
      }

      snapshot.bytes = snapshot.bytes || rawByteLength;
      snapshot.cpuBytes = storedPixels.byteLength;
      snapshot.cpuPixels = storedPixels;
      snapshot.cpuPixelsEncoding = storedEncoding;
      snapshot.cpuRawBytes = rawByteLength;
      snapshot.state = "CPU_COLD";

      return true;
    }

    hydrateHistorySnapshot(snapshot) {
      if (!snapshot || snapshot.texture) {
        return Boolean(snapshot?.texture);
      }

      if (!(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      if (width <= 0 || height <= 0) {
        return false;
      }

      const compression = window.CBO?.HistoryCompression;
      let uploadPixels = snapshot.cpuPixels;

      if (snapshot.cpuPixelsEncoding) {
        if (!compression?.isCompressedEncoding?.(snapshot.cpuPixelsEncoding)) {
          return false;
        }

        try {
          uploadPixels = compression.decompressRgba(
            snapshot.cpuPixels,
            Number(snapshot.cpuRawBytes) || width * height * 4,
          );
        } catch (error) {
          console.warn?.("[CBO brush] Decompressione RLE snapshot fallita.", error);
          return false;
        }
      }

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);
      gl.bindTexture(gl.TEXTURE_2D, null);

      snapshot.texture = texture;
      snapshot.state = "GPU_HOT";

      this.registerBrushTexture(texture, {
        bbox: snapshot.docRect || snapshot.rect,
        height,
        kind: "historySnapshot",
        label: snapshot.label || "history snapshot",
        layerId: snapshot.layerId || "",
        originX: snapshot.docRect?.x,
        originY: snapshot.docRect?.y,
        ownerId: snapshot.id || this.nextBrushResourceOwnerId("brush-history-snapshot"),
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "history snapshot",
        state: "GPU_HOT",
        width,
      });

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;

      return true;
    }

    restoreHistorySnapshot(layerId, snapshot) {
      if (!layerId || !snapshot?.rect) {
        return false;
      }

      if (!snapshot.texture && !this.hydrateHistorySnapshot(snapshot)) {
        return false;
      }

      const target = this.documentRenderer?.getRasterTarget?.(layerId);

      if (!target?.framebuffer || !target?.texture) {
        return false;
      }

      const gl = this.gl;
      const rect = snapshot.rect;
      const { program, uniforms } = this.compositeProgramInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(rect.x, target.height - (rect.y + rect.height), rect.width, rect.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, snapshot.texture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.opacity, 1.0);
      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail: { layerId, source: "history-restore" },
      }));
      this.requestDraw();

      return true;
    }

    deleteHistorySnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      if (snapshot?.texture) {
        this.deleteBrushTexture(snapshot.texture);
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      if (snapshot?.framebuffer) {
        this.deleteBrushFramebuffer(snapshot.framebuffer);
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
      }

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;
      snapshot.state = "DELETED";
    }

    resetStrokeProgress() {
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
    }

    resetStrokeRuntimeState() {
      this.cancelActiveStrokeDirtyRegionDebug();
      this.cancelStrokeTargetPrewarm();
      this.resetStrokeProgress();
      this.strokeDynamicsState = null;
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeGrainRandomState = null;
      this.velocityPressureState = null;
      this.strokeChargeRadius = null;
      this.strokeGrainOffset = { x: 0, y: 0 };
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.strokeTargetLayerId = null;
      this.currentStrokeTool = this.activeStrokeTool || "brush";
    }

    replayLastStroke() {
      if (!this.lastRecordedStroke || this.lastRecordedStroke.length === 0) {
        return;
      }

      this.replayStroke(this.lastRecordedStroke);
    }

    pushForcedTaperStamp(point, distanceFromStart) {
      if (!point || this.strokeTotalLength == null) {
        return;
      }

      this.strokeDistance = this.clamp(distanceFromStart, 0, this.strokeTotalLength);

      const stamp = this.createStamp(point);

      stamp.alphaScale = this.getStampAlphaScale();
      stamp.sizeScale = 1;
      this.applyTaperToStamp(stamp);
      this.pushShapeStamps(stamp, this.lastStrokeTangent);
    }

    regenerateStrokeWithTaper(rawSamples, totalLength) {
      // Re-emette gli stamp del tratto su strokeFBO con il taper completo (start + end).
      // NON tocca il base layer: chiamato durante pointerup PRIMA del bake.
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || totalLength <= 0) {
        return;
      }

      const StrokeMath = namespace.StrokeMath;
      const firstSample = rawSamples[0];
      const point = { x: firstSample.x, y: firstSample.y };
      const inputPressure = StrokeMath?.normalizePressure
        ? StrokeMath.normalizePressure(firstSample.pressure)
        : firstSample.pressure;

      // Riusiamo il seed iniziale dello stroke originale per riprodurre l'identica
      // sequenza di jitter spaziale (lateral/linear/spacing) e colore.
      this.releaseStrokeLayerTarget();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.strokeRandomState = { seed: this.strokeInitialSeed };
      this.initializeStrokeColorDynamics(this.strokeInitialSeed);
      this.initializeWetMixRandom(this.strokeInitialSeed);
      this.initializeGrainDynamics(this.strokeInitialSeed);
      this.strokeDynamicsState = StrokeMath?.createStrokeState
        ? StrokeMath.createStrokeState(point, {
            pressure: inputPressure,
            seed: this.strokeInitialSeed,
            tool: "brush",
          })
        : null;
      this.initializeVelocityPressureState(firstSample);
      const startPoint = {
        ...firstSample,
        pressure: this.resolveSamplePressure(firstSample, inputPressure),
      };

      this.strokeTotalLength = totalLength;
      this.taperSpacingCap = this.getTaperSpacingCap(totalLength);
      this.resetStrokeProgress();
      const startStamp = this.createStamp(startPoint);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.applyTaperToStamp(startStamp);
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing(startStamp.sizeScale);
      this.currentStroke = [startPoint, startPoint, startPoint];

      for (let index = 1; index < rawSamples.length - 1; index += 1) {
        const stableSample = this.applyStabilization(rawSamples[index]);

        this.currentStroke.push(stableSample);
        this.processStamps();
      }

      const lastRaw = rawSamples[rawSamples.length - 1];
      const lastPoint = rawSamples.length > 1 ? this.applyStabilization(lastRaw) : startPoint;

      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.pushForcedTaperStamp(lastPoint, totalLength);
      this.flushStamps();

      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
    }

    replayStroke(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || this.isDrawing) {
        return;
      }

      this.clearAllLayers();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;

      const firstSample = rawSamples[0];
      const startPoint = this.beginStrokeDynamics(firstSample);

      this.isDrawing = true;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(startPoint);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing();
      this.currentStroke = [startPoint, startPoint, startPoint];

      // Replay degli intermedi (escluso ultimo: lo trattiamo come pointer-up).
      for (let index = 1; index < rawSamples.length - 1; index += 1) {
        const stableSample = this.applyStabilization(rawSamples[index]);

        this.currentStroke.push(stableSample);
        this.processStamps();
      }

      const lastRaw = rawSamples[rawSamples.length - 1];
      const lastPoint = rawSamples.length > 1 ? this.applyStabilization(lastRaw) : startPoint;

      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.flushStamps();

      if (this.isTaperActive() && rawSamples.length > 1) {
        this.regenerateStrokeWithTaper(rawSamples, this.getCurrentStrokePathLength());
      }

      this.bakeStroke();

      this.resetStrokeRuntimeState();
      this.isDrawing = false;

      if (this.options.manualRender) {
        this.draw();
      } else {
        this.requestDraw();
      }
    }

    renderSyntheticStroke(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        return;
      }

      this.lastRecordedStroke = rawSamples.map((sample) => ({ ...sample }));
      this.replayStroke(this.lastRecordedStroke);
    }

    handlePointerDown(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      const isPanTrigger = this.isTemporaryPanTrigger(event);

      if (isPanTrigger) {
        if (this.isDrawing || this.isPanning) {
          return;
        }

        event.preventDefault();
        this.beginPan(event);
        return;
      }

      if (event.button !== 0 || this.isDrawing || this.isPanning) {
        return;
      }

      const documentPoint = this.screenToDocumentSpace(event.clientX, event.clientY);

      this.activateArtboardAtPoint(documentPoint);

      if (!this.isDocumentPointInside(documentPoint)) {
        event.preventDefault();
        return;
      }

      if (!this.canStartBrushStroke()) {
        return;
      }

      event.preventDefault();
      this.clearPendingBrushHistoryTimer();
      const strokeTool = this.activeStrokeTool || "brush";
      let strokeTarget = null;

      if (strokeTool === "eraser") {
        strokeTarget = this.getActiveRasterTargetForEraser();

        if (!strokeTarget) {
          return;
        }
      } else {
        strokeTarget = this.documentRenderer?.ensurePaintLayerForBrush?.({ materialize: false }) ||
          this.getDocumentDrawTarget();
      }

      // Modalità preview: ogni nuovo tratto resetta la canvas (utile nella drawing pad).
      if (this.options.singleStrokeMode && strokeTool !== "eraser") {
        this.clearAllLayers();
      }

      this.releaseStrokeLayerTarget();
      this.activeStrokeBounds = null;
      this.activeStrokeTilePatchRects = null;
      this.strokePreviewDirtyRects = null;
      this.lastStrokePreviewDirtyRects = null;
      this.warmPreviewCacheForStroke();
      this.currentStrokeTool = strokeTool;
      this.strokeTargetLayerId = strokeTarget?.layerId || null;
      const rawSample = this.createPointerSample(event);

      this.recordedStroke = [rawSample];

      const point = this.beginStrokeDynamics(rawSample);

      this.isDrawing = true;
      this.activePointerId = event.pointerId;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(point);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing();
      this.currentStroke = [point, point, point];
      this.canvas.setPointerCapture(event.pointerId);
      this.requestDraw();
    }

    handlePointerMove(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.updatePan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const rawSample = this.createPointerSample(event);

      this.recordedStroke.push(rawSample);
      this.currentStroke.push(this.applyStabilization(rawSample));
      this.processStamps();
      this.requestDraw();
    }

    handlePointerUp(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const rawSample = this.createPointerSample(event);

      this.recordedStroke.push(rawSample);

      const point = this.applyStabilization(rawSample);

      this.currentStroke.push(point);
      this.processStamps();
      this.currentStroke.push(point);
      this.processStamps();
      this.flushStamps();

      // Taper: rifaccio l'intero tratto in strokeFBO conoscendo la lunghezza totale,
      // cosi' posso modulare size+opacity ai due estremi. Solo dopo bake.
      if (this.isTaperActive() && this.recordedStroke.length > 1) {
        this.regenerateStrokeWithTaper(this.recordedStroke, this.getCurrentStrokePathLength());
      }

      this.bakeStroke();

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.lastRecordedStroke = this.recordedStroke.slice();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
      this.isDrawing = false;
      this.activePointerId = null;
      this.requestDraw();
    }

    handlePointerCancel(event) {
      if (event.__cboNavigationHandled) {
        return;
      }

      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.releaseStrokeLayerTarget();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
      this.isDrawing = false;
      this.activePointerId = null;
      this.requestDraw();
    }

    startRenderLoop() {
      this.requestDraw();
    }

    requestDraw() {
      if (this.isDisposed || this.options.manualRender || this.frameRequest) {
        return;
      }

      this.frameRequest = requestAnimationFrame(this.renderLoop);
    }

    renderLoop() {
      if (this.isDisposed) {
        return;
      }

      this.frameRequest = 0;

      if (this.resizeViewport() && !this.userManipulatedCamera) {
        this.centerCamera();
      }

      this.draw();
    }

    draw() {
      const target = this.getDocumentDrawTarget();
      const activeStrokeLayerId = this.strokeTargetLayerId || target.layerId;
      const allowPreviewCache = !namespace.smudgeEngine?.isDragging;

      this.documentRenderer.drawToCanvas({
        allowPreviewCache,
        activeStrokeClipRect: namespace.areaSelection?.hasSelection?.()
          ? namespace.areaSelection.getRect?.()
          : null,
        activeStrokeClipRects: this.getActiveAreaSelectionCoverageRects(this.strokeBufferRect),
        activeStrokeLayerId,
        activeStrokeMode: this.currentStrokeTool === "eraser" ? "eraser" : "paint",
        activeStrokeRect: this.strokeBufferRect,
        activeStrokeSelectionMask: this.currentStrokeTool === "eraser"
          ? this.getActiveAreaSelectionMask(this.strokeBufferRect)
          : null,
        activeStrokeTexture: this.isDrawing ? this.strokeTexture : null,
        camera: this.camera,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
      });

      window.dispatchEvent(
        new CustomEvent("cbo:camera-change", {
          detail: {
            camera: { ...this.camera },
            dpr: this.dpr,
            viewportHeight: this.viewportHeight,
            viewportWidth: this.viewportWidth,
          },
        }),
      );
    }

    dispose() {
      const gl = this.gl;

      this.isDisposed = true;

      if (this.frameRequest) {
        cancelAnimationFrame(this.frameRequest);
        this.frameRequest = 0;
      }

      this.cancelActiveStrokeDirtyRegionDebug();
      this.cancelStrokeTargetPrewarm();

      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
      window.removeEventListener("cbo:tool-change", this.handleToolChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentChange);
      window.removeEventListener("cbo:document-layers-change", this.handleDocumentChange);
      window.removeEventListener("cbo:before-history-action", this.handleBeforeHistoryAction);
      window.removeEventListener("cbo:before-raster-history-capture", this.handleBeforeRasterHistoryCapture);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (!this.options.disableInput) {
        const navigationTarget = this.stage || this.canvas;

        this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
        this.canvas.removeEventListener("pointermove", this.handlePointerMove);
        this.canvas.removeEventListener("pointerup", this.handlePointerUp);
        this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
        this.canvas.removeEventListener("wheel", this.handleWheel);
        navigationTarget.removeEventListener("pointerdown", this.handleNavigationPointerDown, true);
        navigationTarget.removeEventListener("pointermove", this.handleNavigationPointerMove, true);
        navigationTarget.removeEventListener("pointerup", this.handleNavigationPointerUp, true);
        navigationTarget.removeEventListener("pointercancel", this.handleNavigationPointerCancel, true);
        navigationTarget.removeEventListener("auxclick", this.handleAuxClick, true);
      }
      window.removeEventListener("keydown", this.handleKeyDown, true);
      window.removeEventListener("keyup", this.handleKeyUp, true);
      window.removeEventListener("blur", this.handleWindowBlur);
      this.canvas.style.cursor = "";
      document.body?.classList.remove("cbo-canvas-pan-active", "cbo-canvas-pan-ready");
      this.discardPendingBrushHistory();
      if (this.emptyEraserLayerToastTimer) {
        window.clearTimeout?.(this.emptyEraserLayerToastTimer);
        this.emptyEraserLayerToastTimer = 0;
      }

      if (this.fullscreenQuad) {
        gl.deleteBuffer(this.fullscreenQuad.buffer);
        gl.deleteVertexArray(this.fullscreenQuad.vao);
        this.fullscreenQuad = null;
      }

      if (this.brush) {
        gl.deleteBuffer(this.brush.instanceVBO);
        gl.deleteBuffer(this.brush.quadVBO);
        gl.deleteVertexArray(this.brush.vao);
        this.brush = null;
      }

      this.documentRenderer = null;

      if (this.strokeFBO) {
        this.deleteBrushFramebuffer(this.strokeFBO);
        gl.deleteFramebuffer(this.strokeFBO);
        this.strokeFBO = null;
      }

      if (this.strokeTexture) {
        this.deleteBrushTexture(this.strokeTexture);
        gl.deleteTexture(this.strokeTexture);
        this.strokeTexture = null;
      }

      if (this.strokePlateauFBO) {
        this.deleteBrushFramebuffer(this.strokePlateauFBO);
        gl.deleteFramebuffer(this.strokePlateauFBO);
        this.strokePlateauFBO = null;
      }

      if (this.strokePlateauTexture) {
        this.deleteBrushTexture(this.strokePlateauTexture);
        gl.deleteTexture(this.strokePlateauTexture);
        this.strokePlateauTexture = null;
      }

      if (this.strokeAccumFBO) {
        this.deleteBrushFramebuffer(this.strokeAccumFBO);
        gl.deleteFramebuffer(this.strokeAccumFBO);
        this.strokeAccumFBO = null;
      }

      if (this.strokeAccumTexture) {
        this.deleteBrushTexture(this.strokeAccumTexture);
        gl.deleteTexture(this.strokeAccumTexture);
        this.strokeAccumTexture = null;
      }

      if (this.shapeTexture) {
        this.deleteBrushTexture(this.shapeTexture);
        gl.deleteTexture(this.shapeTexture);
        this.shapeTexture = null;
      }

      if (this.grainTexture) {
        this.deleteBrushTexture(this.grainTexture);
        gl.deleteTexture(this.grainTexture);
        this.grainTexture = null;
      }

      if (this.compositeProgramInfo?.program) {
        gl.deleteProgram(this.compositeProgramInfo.program);
        this.compositeProgramInfo = null;
      }

      if (this.strokeBuildupProgramInfo?.program) {
        gl.deleteProgram(this.strokeBuildupProgramInfo.program);
        this.strokeBuildupProgramInfo = null;
      }

      if (this.brushProgramInfo?.program) {
        gl.deleteProgram(this.brushProgramInfo.program);
        this.brushProgramInfo = null;
      }

    }
  }

  namespace.BrushEngine = BrushEngine;
})(window.CBO);
