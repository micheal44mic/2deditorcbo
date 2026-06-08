(function registerBrushEngineShaderGrain(namespace) {
  namespace.BrushEngineMixins = namespace.BrushEngineMixins || {};

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
layout(location = 11) in float aInstanceMirrorX;
layout(location = 12) in float aInstanceFlowScale;
layout(location = 13) in float aInstanceBleedScale;
layout(location = 14) in float aInstanceSizeCompressionScale;

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
out float v_flowScale;
out float v_bleedScale;
out float v_sizeCompressionScale;
out vec3 v_color;

void main() {
  // Min-size ratio evita che pressure=0 collassi lo stamp a 0px (problema con stylus).
  float pressure = clamp(aInstancePressure, 0.0, 1.0);
  float sizeFactor = mix(u_minSizeRatio, 1.0, pressure);
  // aInstanceSizeScale e' il moltiplicatore esterno dei dab (taper, ecc.):
  // bypassa il min-size ratio quindi puo' arrivare davvero a 0 (taper a punta).
  float scale = max(aInstanceSizeScale, 0.0);
  vec2 localPosition = a_position * u_shapeFlip * vec2(aInstanceMirrorX, 1.0);
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
  v_flowScale = max(aInstanceFlowScale, 0.0);
  v_bleedScale = clamp(aInstanceBleedScale, 0.0, 1.0);
  v_sizeCompressionScale = max(aInstanceSizeCompressionScale, 1.0);
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
uniform bool u_antiAliasing;
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
in float v_flowScale;
in float v_bleedScale;
in float v_sizeCompressionScale;
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

float sampleShapeTextureAlpha(vec2 uv) {
  ivec2 shapeSize = max(textureSize(u_shapeTexture, 0), ivec2(1));

  if (u_antiAliasing) {
    vec2 footprint = max(fwidth(uv) * 0.55, vec2(0.35) / vec2(shapeSize));
    float center = texture(u_shapeTexture, uv).a * 4.0;
    float right = texture(u_shapeTexture, uv + vec2(footprint.x, 0.0)).a;
    float left = texture(u_shapeTexture, uv - vec2(footprint.x, 0.0)).a;
    float top = texture(u_shapeTexture, uv + vec2(0.0, footprint.y)).a;
    float bottom = texture(u_shapeTexture, uv - vec2(0.0, footprint.y)).a;

    return (center + right + left + top + bottom) / 8.0;
  }

  ivec2 texel = ivec2(clamp(floor(uv * vec2(shapeSize)), vec2(0.0), vec2(shapeSize - ivec2(1))));

  return texelFetch(u_shapeTexture, texel, 0).a;
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
  vec2 croppedPosition = v_localPosition * max(v_stampPixelSize / max(v_sizeCompressionScale, 1.0), 1.0);
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
  float effectiveWetEdges = clamp(u_wetEdges + v_bleedScale * (1.0 - u_wetEdges), 0.0, 1.0);
  float effectiveBurntEdges = clamp(u_burntEdges + v_bleedScale * 0.5, 0.0, 1.0);

  if (u_useShapeTexture > 0.5) {
    float coreShape = sampleShapeTextureAlpha(v_uv);

    if (effectiveWetEdges > 0.0) {
      float offset = 0.05 * effectiveWetEdges;
      float rightShape = sampleShapeTextureAlpha(v_uv + vec2(offset, 0.0));
      float leftShape = sampleShapeTextureAlpha(v_uv + vec2(-offset, 0.0));
      float topShape = sampleShapeTextureAlpha(v_uv + vec2(0.0, offset));
      float bottomShape = sampleShapeTextureAlpha(v_uv + vec2(0.0, -offset));
      float blurredShape = (coreShape * 2.0 + rightShape + leftShape + topShape + bottomShape) / 6.0;

      shape = mix(coreShape, blurredShape, effectiveWetEdges);
    } else {
      shape = coreShape;
    }

  } else {
    float distanceFromCenter = distance(v_uv, vec2(0.5));

    // Hardness=1: bordo nitido (fade in 1 px AA). Hardness=0: gradiente radiale dal centro.
    float fw = max(fwidth(distanceFromCenter), 0.001);
    float aaWidth = u_antiAliasing ? fw * 1.35 : 0.0;

    if (distanceFromCenter > 0.5 + aaWidth) {
      discard;
    }

    float effectiveHardness = clamp(u_hardness * (1.0 - effectiveWetEdges * 0.8), 0.0, 1.0);
    float edgeStart = mix(0.0, 0.5 - (u_antiAliasing ? fw : 0.0), effectiveHardness);
    float edgeEnd = 0.5 + aaWidth;
    shape = (!u_antiAliasing && effectiveHardness >= 0.999)
      ? 1.0
      : 1.0 - smoothstep(edgeStart, edgeEnd, distanceFromCenter);
  }

  if (shape <= 0.001) {
    discard;
  }

  if (effectiveWetEdges > 0.0) {
    float phase = mix(1.0, 1.5, effectiveWetEdges);
    float pooledShape = sin(clamp(shape, 0.0, 1.0) * 1.570796 * phase);

    shape = mix(shape, pooledShape, effectiveWetEdges);
  }

  float burntEdgeMask = getBurntEdgeMask(shape, effectiveBurntEdges);
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

  float flow = clamp(u_flow * v_flowScale, 0.0, 2.0);
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

  const BRUSH_SIMPLE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform float u_flow;
uniform float u_hardness;
uniform bool u_antiAliasing;
uniform sampler2D u_shapeTexture;
uniform float u_useShapeTexture;

in vec2 v_uv;
in vec3 v_color;
in float v_alpha;
in float v_flowScale;

out vec4 outColor;

float applyFlowCoverageCurve(float coverage, float flow) {
  float safeCoverage = clamp(coverage, 0.0, 1.0);
  float safeFlow = clamp(flow, 0.0, 1.0);
  float edgePower = mix(2.35, 1.0, safeFlow);

  return pow(safeCoverage, edgePower);
}

float sampleShapeTextureAlpha(vec2 uv) {
  ivec2 shapeSize = max(textureSize(u_shapeTexture, 0), ivec2(1));

  if (u_antiAliasing) {
    vec2 footprint = max(fwidth(uv) * 0.55, vec2(0.35) / vec2(shapeSize));
    float center = texture(u_shapeTexture, uv).a * 4.0;
    float right = texture(u_shapeTexture, uv + vec2(footprint.x, 0.0)).a;
    float left = texture(u_shapeTexture, uv - vec2(footprint.x, 0.0)).a;
    float top = texture(u_shapeTexture, uv + vec2(0.0, footprint.y)).a;
    float bottom = texture(u_shapeTexture, uv - vec2(0.0, footprint.y)).a;

    return (center + right + left + top + bottom) / 8.0;
  }

  ivec2 texel = ivec2(clamp(floor(uv * vec2(shapeSize)), vec2(0.0), vec2(shapeSize - ivec2(1))));

  return texelFetch(u_shapeTexture, texel, 0).a;
}

void main() {
  float shape = 1.0;

  if (u_useShapeTexture > 0.5) {
    shape = sampleShapeTextureAlpha(v_uv);
  } else {
    float distanceFromCenter = distance(v_uv, vec2(0.5));

    float fw = max(fwidth(distanceFromCenter), 0.001);
    float aaWidth = u_antiAliasing ? fw * 1.35 : 0.0;

    if (distanceFromCenter > 0.5 + aaWidth) {
      discard;
    }

    float safeHardness = clamp(u_hardness, 0.0, 1.0);
    float edgeStart = mix(0.0, 0.5 - (u_antiAliasing ? fw : 0.0), safeHardness);
    float edgeEnd = 0.5 + aaWidth;
    shape = (!u_antiAliasing && safeHardness >= 0.999)
      ? 1.0
      : 1.0 - smoothstep(edgeStart, edgeEnd, distanceFromCenter);
  }

  if (shape <= 0.001) {
    discard;
  }

  float flow = clamp(u_flow * v_flowScale, 0.0, 2.0);
  float coverage = shape;

  if (flow < 1.0) {
    coverage = applyFlowCoverageCurve(coverage, flow);
  }

  float alpha = clamp(coverage * v_alpha * flow, 0.0, 1.0);

  outColor = vec4(clamp(v_color, vec3(0.0), vec3(1.0)) * alpha, alpha);
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

  function defineBrushEngineMethods(BrushEngine, methods) {
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(BrushEngine.prototype, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  namespace.BrushEngineMixins.shaderGrain = function installBrushEngineShaderGrain(BrushEngine, internals) {
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

    defineBrushEngineMethods(BrushEngine, {
    createBrushProgramInfo(fragmentSource = BRUSH_FRAGMENT_SHADER_SOURCE) {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, BRUSH_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
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
          antiAliasing: gl.getUniformLocation(program, "u_antiAliasing"),
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
,

    createSimpleBrushProgramInfo() {
      return this.createBrushProgramInfo(BRUSH_SIMPLE_FRAGMENT_SHADER_SOURCE);
    }
,

    getPencilBleedPotential() {
      const settings = this.brushState || {};

      return Math.max(
        this.clamp01(settings.pencilPressureBleed ?? 0),
        this.clamp01(settings.pencilTiltBleed ?? 0),
        this.clamp01(settings.pencilTiltGradation ?? 0) * 0.72,
        this.clamp01(settings.pencilBarrelBleed ?? 0),
      );
    }
,

    shouldUseSimpleBrushProgram(useGrainTexture = this.isGrainEnabled()) {
      return (
        namespace.mobileLargeBlendSimpleShader !== false &&
        namespace.androidLargeBlendSimpleShader !== false &&
        this.isMobileLargeBlendFastPathCandidate?.() === true &&
        useGrainTexture !== true &&
        this.getWetEdges() <= 0 &&
        this.getBurntEdges() <= 0 &&
        this.getPencilBleedPotential() <= 0 &&
        this.isAlphaThresholdEnabled() !== true
      );
    }
,

    getBrushProgramInfoForFlush(detail = {}) {
      if (this.shouldUseSimpleBrushProgram(detail.useGrainTexture === true)) {
        return this.brushSimpleProgramInfo || this.brushProgramInfo;
      }

      return this.brushProgramInfo;
    }
,

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
,

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
,

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
,

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
      // Instance stride 72 byte: base dab, colore, dati grain Moving, mirror flag, flow, bleed, size compression.
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 72, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 72, 8);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 72, 12);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 72, 16);
      gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 72, 20);
      gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 72, 24);
      gl.vertexAttribDivisor(6, 1);
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 72, 36);
      gl.vertexAttribDivisor(7, 1);
      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8, 1, gl.FLOAT, false, 72, 44);
      gl.vertexAttribDivisor(8, 1);
      gl.enableVertexAttribArray(9);
      gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 72, 48);
      gl.vertexAttribDivisor(9, 1);
      gl.enableVertexAttribArray(10);
      gl.vertexAttribPointer(10, 1, gl.FLOAT, false, 72, 52);
      gl.vertexAttribDivisor(10, 1);
      gl.enableVertexAttribArray(11);
      gl.vertexAttribPointer(11, 1, gl.FLOAT, false, 72, 56);
      gl.vertexAttribDivisor(11, 1);
      gl.enableVertexAttribArray(12);
      gl.vertexAttribPointer(12, 1, gl.FLOAT, false, 72, 60);
      gl.vertexAttribDivisor(12, 1);
      gl.enableVertexAttribArray(13);
      gl.vertexAttribPointer(13, 1, gl.FLOAT, false, 72, 64);
      gl.vertexAttribDivisor(13, 1);
      gl.enableVertexAttribArray(14);
      gl.vertexAttribPointer(14, 1, gl.FLOAT, false, 72, 68);
      gl.vertexAttribDivisor(14, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { instanceVBO, instanceVBOCapacityBytes: 0, quadVBO, vao };
    }
,

    readBrushSettingsSource() {
      if (this.options.getSettings) {
        return this.options.getSettings();
      }

      return namespace.brushSettings;
    }
,

    setBrushState(settings) {
      this.brushState = { ...(settings || {}) };
      this.syncShapeTextureFromState();
      this.syncGrainTextureFromState();
    }
,

    getShapeTextureSource() {
      const source = this.brushState?.shapeAlphaSrc;

      return typeof source === "string" && source.trim() ? source : "";
    }
,

    getGrainTextureSource() {
      const source = this.brushState?.grainTextureSrc;

      return typeof source === "string" && source.trim() ? source : "";
    }
,

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

          this.runOrQueueTextureUpload("brush-shape-upload", image, requestId, () => {
            if (!this.isDisposed && requestId === this.shapeTextureRequestId) {
              this.uploadShapeTexture(image);
            }
          });
        })
        .catch(() => {
          if (requestId === this.shapeTextureRequestId) {
            this.shapeTextureReady = false;
          }
        });
    }
,

    estimateImageUploadBytes(image) {
      const width = Math.max(1, Number(image?.naturalWidth || image?.width || 1));
      const height = Math.max(1, Number(image?.naturalHeight || image?.height || 1));

      return Math.max(4, Math.round(width * height * 4));
    }
,

    runOrQueueTextureUpload(label, image, version, callback) {
      if (typeof callback !== "function") {
        return false;
      }

      const governor = namespace.EngineGovernor;
      const bytes = this.estimateImageUploadBytes(image);

      if (!governor || governor.canUpload?.(bytes, { critical: false }) !== false) {
        callback();
        return true;
      }

      return governor.queueUpload?.(callback, {
        bytes,
        label,
        version,
      }) === true;
    }
,

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
,

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

          this.runOrQueueTextureUpload("brush-grain-upload", image, requestId, () => {
            if (!this.isDisposed && requestId === this.grainTextureRequestId) {
              this.uploadGrainTexture(image);
            }
          });
        })
        .catch(() => {
          if (requestId === this.grainTextureRequestId) {
            this.grainTextureReady = false;
          }
        });
    }
,

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
,

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
,

    getOpacity01() {
      const value = Number(this.brushState.opacity);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }
,

    getMinSizeRatio() {
      const value = Number(this.brushState.minSizeRatio);

      if (!Number.isFinite(value)) {
        return 0.15;
      }

      return Math.max(0, Math.min(1, value));
    }
,

    getRenderingModePreset() {
      const mode = String(this.brushState.renderingMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return RENDERING_MODE_PRESETS[mode] || RENDERING_MODE_PRESETS["light-glaze"];
    }
,

    getFlow() {
      const value = Number(this.brushState.flow ?? 1.0);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 1.0;
    }
,

    getStrokeBuildUp() {
      const preset = this.getRenderingModePreset();
      const value = Number(preset.strokeBuildUp);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }
,

    getBrushStrokeRenderMode() {
      const buildUp = this.getStrokeBuildUp();

      // Android: avoid mixed mode because it creates 3 FBO/scratch textures.
      // To re-enable for quality tests: window.CBO.androidMixedStrokeBuildup = true;
      if (this.isAndroidPerformanceMode() && namespace.androidMixedStrokeBuildup !== true) {
        return buildUp <= 0.25 ? STROKE_RENDER_MODE_PLATEAU : STROKE_RENDER_MODE_ACCUM;
      }

      if (buildUp <= STROKE_BUILDUP_EPSILON) {
        return STROKE_RENDER_MODE_PLATEAU;
      }

      if (buildUp >= 1 - STROKE_BUILDUP_EPSILON) {
        return STROKE_RENDER_MODE_ACCUM;
      }

      return STROKE_RENDER_MODE_MIXED;
    }
,

    getStrokeRenderMode() {
      return this.strokeRenderMode || this.getBrushStrokeRenderMode();
    }
,

    usesMixedStrokeBuildup() {
      return this.getStrokeRenderMode() === STROKE_RENDER_MODE_MIXED;
    }
,

    getStrokeScratchTextureCount() {
      return this.usesMixedStrokeBuildup() ? 3 : 1;
    }
,

    getWetEdges() {
      const value = Number(this.brushState.wetEdges);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }
,

    getBurntEdges() {
      const value = Number(this.brushState.burntEdges);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0;
    }
,

    getBurntEdgesModeId() {
      const mode = String(this.brushState.burntEdgesMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return BURNT_EDGES_MODE_IDS[mode] ?? BURNT_EDGES_MODE_IDS["linear-burn"];
    }
,

    isAntiAliasingEnabled() {
      return this.brushState.antiAliasing !== false;
    }
,

    isAlphaThresholdEnabled() {
      return this.brushState.alphaThresholdEnabled === true;
    }
,

    getAlphaThreshold() {
      const value = Number(this.brushState.alphaThreshold);

      return Number.isFinite(value) ? this.clamp(value, 0, 1) : 0.5;
    }
,

    getHardness() {
      const value = Number(this.brushState.hardness);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }
,

    getShapeRotation() {
      return this.clamp(this.brushState.shapeRotation, -1, 1);
    }
,

    getShapeScatter() {
      return this.clamp(this.brushState.shapeScatter, 0, 2);
    }
,

    getShapeCount() {
      return this.clamp(Math.round(Number(this.brushState.shapeCount) || 1), 1, 16);
    }
,

    getMobileLargeBlendEffectiveShapeCount(count = this.getShapeCount()) {
      const safeCount = this.clamp(Math.round(Number(count) || 1), 1, 16);

      if (
        namespace.mobileLargeBlendShapeCountCap === false ||
        namespace.androidLargeBlendShapeCountCap === false
      ) {
        return safeCount;
      }

      if (!this.shouldUseMobileLargeBlendFastPath?.()) {
        return safeCount;
      }

      const configuredCap = Number(
        namespace.mobileLargeBlendShapeCountCap ??
        namespace.androidLargeBlendShapeCountCap,
      );

      if (Number.isFinite(configuredCap) && configuredCap > 0) {
        return this.clamp(Math.round(configuredCap), 1, safeCount);
      }

      const brushSize = Math.max(0, Number(this.getBrushSize?.()) || 0);
      const largeBrushFactor = this.clamp((brushSize - 192) / 320, 0, 1);
      const defaultCap = Math.round(this.lerp(8, 6, largeBrushFactor));

      return Math.min(safeCount, defaultCap);
    }
,

    getAndroidLargeBlendEffectiveShapeCount(count = this.getShapeCount()) {
      return this.getMobileLargeBlendEffectiveShapeCount(count);
    }
,

    getShapeCountJitter() {
      return this.clamp01(this.brushState.shapeCountJitter);
    }
,

    getShapeFlipXSign() {
      return this.brushState.shapeFlipX === true ? -1 : 1;
    }
,

    getShapeFlipYSign() {
      return this.brushState.shapeFlipY === true ? -1 : 1;
    }
,

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
,

    getGrainMode() {
      return this.brushState.grainMode === "moving" ? "moving" : "texturized";
    }
,

    getGrainBlendModeId() {
      const mode = String(this.brushState.grainBlendMode || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      return GRAIN_BLEND_MODE_IDS[mode] ?? GRAIN_BLEND_MODE_IDS.multiply;
    }
,

    getGrainBrightness() {
      const value = Number(this.brushState.grainBrightness);

      return Number.isFinite(value) ? this.clamp(value, -1, 1) : 0;
    }
,

    getGrainContrast() {
      const value = Number(this.brushState.grainContrast);

      return Number.isFinite(value) ? this.clamp(value, -1, 1) : 0;
    }
,

    textureScaleToTexturizedScale(textureScale) {
      const value = Number(textureScale);

      if (!Number.isFinite(value) || value <= 0) {
        return 0;
      }

      const minLog = Math.log(GRAIN_TEXTURIZED_MIN_TEXTURE_SCALE);
      const maxLog = Math.log(1);

      return this.clamp01((Math.log(value) - minLog) / (maxLog - minLog));
    }
,

    getGrainTexturizedScale() {
      const value = Number(this.brushState.grainTexturizedScale);

      if (Number.isFinite(value)) {
        return this.clamp01(value);
      }

      const legacyScale = Number(this.brushState.grainScale);

      return Number.isFinite(legacyScale) ? this.textureScaleToTexturizedScale(legacyScale) : 1;
    }
,

    getGrainScale() {
      const value = this.getGrainMode() === "moving"
        ? this.getGrainMovingScale()
        : this.getGrainTexturizedScale();

      if (value <= 0) {
        return 0;
      }

      return Math.exp(Math.log(GRAIN_TEXTURIZED_MIN_TEXTURE_SCALE) * (1 - value));
    }
,

    getGrainRotationRadians() {
      const degrees = Number(this.brushState.grainRotation);

      return Number.isFinite(degrees) ? degrees * (Math.PI / 180) : 0;
    }
,

    getGrainTexturizedDepth() {
      const value = Number(this.brushState.grainTexturizedDepth);

      if (Number.isFinite(value)) {
        return this.clamp01(value);
      }

      return this.clamp01(this.brushState.grainStrength ?? 1);
    }
,

    getGrainMovingMovement() {
      return this.clamp01(this.brushState.grainMovingMovement);
    }
,

    getGrainMovingScale() {
      return this.clamp01(this.brushState.grainMovingScale ?? 1);
    }
,

    getGrainMovingZoom() {
      return this.clamp01(this.brushState.grainMovingZoom);
    }
,

    getGrainMovingRotation() {
      return this.clamp(this.brushState.grainMovingRotation, -1, 1);
    }
,

    getGrainMovingDepth() {
      return this.clamp01(this.brushState.grainMovingDepth ?? 1);
    }
,

    getGrainMovingDepthMinimum() {
      return this.clamp01(this.brushState.grainMovingDepthMinimum);
    }
,

    getGrainMovingDepthJitter() {
      return this.clamp01(this.brushState.grainMovingDepthJitter);
    }
,

    getGrainMovingOffsetJitter() {
      return this.brushState.grainMovingOffsetJitter !== false;
    }
,

    getActiveGrainDepth() {
      return this.getGrainMode() === "moving"
        ? this.getGrainMovingDepth()
        : this.getGrainTexturizedDepth();
    }
,

    isGrainInverted() {
      return this.brushState.grainInvert === true;
    }
,

    getEffectiveShapeCount(randomUnit = null) {
      const count = this.getMobileLargeBlendEffectiveShapeCount(this.getShapeCount());
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
,

    getShapeDirectionalRotation(tangent) {
      const rotationFollow = this.getShapeRotation();

      if (rotationFollow === 0 || !this.hasUsableShapeTangent(tangent)) {
        return this.strokeShapeRotation;
      }

      return this.strokeShapeRotation + Math.atan2(tangent.y, tangent.x) * rotationFollow;
    }
,

    hasUsableShapeTangent(tangent) {
      return Boolean(tangent && (tangent.x !== 0 || tangent.y !== 0));
    }
,

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
,

    applyPendingShapeRotation(tangent) {
      if (!this.hasUsableShapeTangent(tangent)) {
        return;
      }

      const directionalRotation = this.getShapeDirectionalRotation(tangent);

      this.stampsBuffer.forEach((stamp) => {
        if (stamp.needsShapeRotationTangent !== true) {
          return;
        }

        const nextRotation = directionalRotation + (stamp.penTiltRotation ?? 0) + (stamp.shapeScatterRotation ?? 0);

        stamp.rotation = Number(stamp.mirrorX) < 0 ? -nextRotation : nextRotation;
        stamp.needsShapeRotationTangent = false;
      });
    }
,

    getShapeScatterRotation(randomSignedValue = null) {
      const scatter = this.getShapeScatter();

      if (scatter <= 0) {
        return 0;
      }

      const signedValue = Number.isFinite(randomSignedValue) ? randomSignedValue : this.randomSigned();

      return signedValue * Math.PI * scatter * 0.5;
    }
,

    getGrainMovingDirectionalRotation(tangent) {
      const rotationFollow = this.getGrainMovingRotation();

      if (rotationFollow === 0 || !tangent || (tangent.x === 0 && tangent.y === 0)) {
        return 0;
      }

      return Math.atan2(tangent.y, tangent.x) * rotationFollow;
    }
,

    getGrainMovingDepthScale() {
      const jitter = this.getGrainMovingDepthJitter();

      if (jitter <= 0) {
        return 1;
      }

      return this.lerp(1, this.nextGrainRandom(), jitter);
    }
,

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
,

    getStampInstanceData(stampCount) {
      const requiredFloats = Math.max(18, Math.round(Number(stampCount) || 0) * 18);

      if (!this.stampInstanceData || this.stampInstanceCapacity < requiredFloats) {
        const previousCapacity = Math.max(0, Math.round(Number(this.stampInstanceCapacity) || 0));
        const nextCapacity = Math.max(requiredFloats, Math.ceil(previousCapacity * 1.5), 18 * 256);

        this.stampInstanceData = new Float32Array(nextCapacity);
        this.stampInstanceCapacity = nextCapacity;
      }

      return this.stampInstanceData.subarray(0, requiredFloats);
    }

    });
  };
})(window.CBO = window.CBO || {});
