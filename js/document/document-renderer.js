(function registerDocumentRenderer(namespace) {
  const CROPPED_TARGET_EDGE_PADDING = 2;
  const CROPPED_TARGET_EFFECT_PADDING = 320;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_HISTORY_TILE_SIZE = 256;
  const RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS = 1;
  const RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING = 2;
  const RASTER_WARP_MESH_COLS = 64;
  const RASTER_WARP_MESH_ROWS = 64;
  const RASTER_MIB = 1024 * 1024;
  const RASTER_OPERATION_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });
  const WEBGL2_CONTEXT_ATTRIBUTES = Object.freeze({
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
  });

  const ARTBOARD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

uniform vec2 uViewportSize;
uniform vec2 uDocumentSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;
out vec2 v_documentPixel;

void main() {
  // aUnitCorner contiene i quattro angoli del documento in spazio normalizzato [0..1].
  // Moltiplicando per uDocumentSize otteniamo coordinate in pixel reali del documento.
  vec2 documentPixel = aUnitCorner * uDocumentSize;

  // La camera conserva l'angolo alto-sinistro del documento in pixel fisici del viewport.
  // Lo zoom scala i pixel del documento prima di proiettarli sul canvas-monitor.
  vec2 viewportPixel = uCameraPosition + documentPixel * uCameraZoom;

  // WebGL usa clip space [-1..1] con asse Y positivo verso l'alto.
  // Il DOM usa pixel con origine in alto a sinistra: per questo invertiamo l'asse Y.
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  v_documentPixel = documentPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const ARTBOARD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_clipTexture;
uniform float u_opacity;
uniform vec2 uDocumentSize;
uniform float uCameraZoom;
uniform float u_gridMode;
uniform float u_maskMode;
uniform vec4 u_maskRect;
uniform float u_maskRectMode;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipOrigin;
uniform vec2 u_clipTextureSize;
uniform vec2 u_drawOrigin;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;

in vec2 v_uv;
in vec2 v_documentPixel;

out vec4 outColor;

void main() {
  if (u_gridMode > 0.5) {
    // Griglia pixel: una linea bianca sottile su ogni bordo di pixel del documento.
    vec2 docPx = v_uv * uDocumentSize;
    vec2 boundaryDistance = abs(fract(docPx - 0.5) - 0.5) / fwidth(docPx);
    float line = 1.0 - clamp(min(boundaryDistance.x, boundaryDistance.y), 0.0, 1.0);
    // Fade in tra zoom 6x e 12x: sotto invisibile, sopra piena visibilita'.
    float zoomFade = smoothstep(6.0, 12.0, uCameraZoom);
    float alpha = line * zoomFade * 0.35;
    // Output pre-moltiplicato bianco.
    outColor = vec4(alpha, alpha, alpha, alpha);
  } else {
    vec4 color = texture(u_texture, v_uv) * u_opacity;

    vec2 globalDocPixel = u_drawOrigin + v_documentPixel;

    if (u_previewCutMode > 0.5) {
      bool insideCutRect =
        globalDocPixel.x >= u_previewCutRect.x &&
        globalDocPixel.y >= u_previewCutRect.y &&
        globalDocPixel.x <= u_previewCutRect.x + u_previewCutRect.z &&
        globalDocPixel.y <= u_previewCutRect.y + u_previewCutRect.w;

      if (insideCutRect) {
        color = vec4(0.0);
      }
    }

    if (u_maskMode > 0.5) {
      float eraseAlpha = 0.0;

      if (u_maskRectMode > 0.5) {
        vec2 local = (v_documentPixel - u_maskRect.xy) / max(u_maskRect.zw, vec2(1.0));

        if (!any(lessThan(local, vec2(0.0))) && !any(greaterThan(local, vec2(1.0)))) {
          eraseAlpha = clamp(texture(u_maskTexture, vec2(local.x, 1.0 - local.y)).a, 0.0, 1.0);
        }
      } else {
        eraseAlpha = clamp(texture(u_maskTexture, v_uv).a, 0.0, 1.0);
      }

      color *= 1.0 - eraseAlpha;
    }

    if (u_clipMode > 0.5) {
      vec2 clipLocalPixel = globalDocPixel - u_clipOrigin;
      vec2 clipUv = vec2(
        clipLocalPixel.x / max(u_clipTextureSize.x, 1.0),
        1.0 - clipLocalPixel.y / max(u_clipTextureSize.y, 1.0)
      );
      float clipAlpha = 0.0;

      if (clipUv.x >= 0.0 && clipUv.x <= 1.0 && clipUv.y >= 0.0 && clipUv.y <= 1.0) {
        clipAlpha = texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
      }

      color *= clipAlpha;
    }

    outColor = color;
  }
}
`;

  const PUPPET_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aDestPixel;
layout(location = 1) in vec2 aSourceUv;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;

void main() {
  vec2 viewportPixel = uCameraPosition + aDestPixel * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = aSourceUv;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PUPPET_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`;

  const TEXTURED_QUAD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aDestPixel;
layout(location = 1) in vec2 aSourceUv;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_destPixel;

void main() {
  vec2 viewportPixel = uCameraPosition + aDestPixel * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_destPixel = aDestPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform mat3 u_destToSourceUv;
uniform vec4 u_quadEdges[4];
uniform float u_edgeFeatherPixels;
uniform float u_opacity;

in vec2 v_destPixel;

out vec4 outColor;

float signedDistanceToConvexQuad(vec2 point) {
  float d0 = dot(u_quadEdges[0].xy, point) + u_quadEdges[0].z;
  float d1 = dot(u_quadEdges[1].xy, point) + u_quadEdges[1].z;
  float d2 = dot(u_quadEdges[2].xy, point) + u_quadEdges[2].z;
  float d3 = dot(u_quadEdges[3].xy, point) + u_quadEdges[3].z;

  return min(min(d0, d1), min(d2, d3));
}

float quadCoverage(vec2 point) {
  float signedDistance = signedDistanceToConvexQuad(point);

  if (u_edgeFeatherPixels <= 0.0) {
    return signedDistance >= 0.0 ? 1.0 : 0.0;
  }

  float distanceFwidth = max(fwidth(signedDistance), 0.0001);
  float aa = max(0.5 * max(u_edgeFeatherPixels, 0.0) * distanceFwidth, 0.0001);

  return smoothstep(-aa, aa, signedDistance);
}

void main() {
  float coverage = quadCoverage(v_destPixel);

  if (coverage <= 0.0) {
    discard;
  }

  vec3 mapped = u_destToSourceUv * vec3(v_destPixel, 1.0);

  if (abs(mapped.z) < 0.000001) {
    discard;
  }

  vec2 unitUv = mapped.xy / mapped.z;
  vec2 clampedUnitUv = clamp(unitUv, vec2(0.0), vec2(1.0));
  vec2 uv = vec2(clampedUnitUv.x, 1.0 - clampedUnitUv.y);

  outColor = texture(u_texture, uv) * u_opacity * coverage;
}
`;

  const PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aDestPixel;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_destPixel;

void main() {
  vec2 viewportPixel = uCameraPosition + aDestPixel * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_destPixel = aDestPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE = TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE;

  const GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

out vec2 v_uv;

void main() {
  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(aUnitCorner.x * 2.0 - 1.0, 1.0 - aUnitCorner.y * 2.0, 0.0, 1.0);
}
`;

  const GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texelStep;
uniform float u_radius;

in vec2 v_uv;

out vec4 outColor;

const int MAX_RADIUS = 200;

void main() {
  float radius = clamp(u_radius, 0.0, float(MAX_RADIUS));

  if (radius <= 0.01) {
    outColor = texture(u_texture, v_uv);
    return;
  }

  float sigma = max(radius * 0.5, 0.5);
  float twoSigmaSq = 2.0 * sigma * sigma;
  vec4 sum = texture(u_texture, v_uv);
  float weightSum = 1.0;

  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (float(i) > radius) {
      break;
    }

    float x = float(i);
    float weight = exp(-(x * x) / twoSigmaSq);
    vec2 offset = u_texelStep * x;

    sum += texture(u_texture, v_uv + offset) * weight;
    sum += texture(u_texture, v_uv - offset) * weight;
    weightSum += weight * 2.0;
  }

  outColor = sum / weightSum;
}
`;

  const MOTION_BLUR_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

out vec2 v_uv;

void main() {
  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(aUnitCorner.x * 2.0 - 1.0, 1.0 - aUnitCorner.y * 2.0, 0.0, 1.0);
}
`;

  const MOTION_BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_directionTexelStep;
uniform float u_distance;

in vec2 v_uv;

out vec4 outColor;

const int MAX_DISTANCE = 300;

void main() {
  float distance = clamp(u_distance, 0.0, float(MAX_DISTANCE));

  if (distance <= 0.01) {
    outColor = texture(u_texture, v_uv);
    return;
  }

  vec4 sum = texture(u_texture, v_uv);
  float weightSum = 1.0;

  for (int i = 1; i <= MAX_DISTANCE; i++) {
    if (float(i) > distance) {
      break;
    }

    vec2 offset = u_directionTexelStep * float(i);

    sum += texture(u_texture, v_uv + offset);
    sum += texture(u_texture, v_uv - offset);
    weightSum += 2.0;
  }

  outColor = sum / weightSum;
}
`;

  const FIELD_BLUR_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

out vec2 v_uv;

void main() {
  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(aUnitCorner.x * 2.0 - 1.0, 1.0 - aUnitCorner.y * 2.0, 0.0, 1.0);
}
`;

  const FIELD_BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform int u_pinCount;
uniform vec3 u_pins[8];

in vec2 v_uv;

out vec4 outColor;

const int MAX_FIELD_BLUR_PINS = 8;
const int FIELD_BLUR_SAMPLE_COUNT = 64;
const float MAX_FIELD_BLUR_RADIUS = 200.0;

float hash(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float resolveFieldBlurRadius(vec2 uv) {
  int pinCount = clamp(u_pinCount, 0, MAX_FIELD_BLUR_PINS);

  if (pinCount <= 0) {
    return 0.0;
  }

  vec2 texelSize = max(u_texelSize, vec2(0.000001));
  float blurSum = 0.0;
  float weightSum = 0.0;

  for (int i = 0; i < MAX_FIELD_BLUR_PINS; i++) {
    if (i >= pinCount) {
      break;
    }

    vec3 pin = u_pins[i];
    float distancePx = length((uv - pin.xy) / texelSize);
    float weight = 1.0 / (distancePx * distancePx + 0.01);

    blurSum += clamp(pin.z, 0.0, MAX_FIELD_BLUR_RADIUS) * weight;
    weightSum += weight;
  }

  return clamp(blurSum / max(weightSum, 0.000001), 0.0, MAX_FIELD_BLUR_RADIUS);
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  float radius = resolveFieldBlurRadius(v_uv);

  if (radius <= 0.01) {
    outColor = base;
    return;
  }

  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  float randomOffset = hash(gl_FragCoord.xy) * 6.28318530718;

  for (int i = 0; i < FIELD_BLUR_SAMPLE_COUNT; i++) {
    float sampleIndex = float(i) + 0.5;
    float angle = sampleIndex * 2.39996323 + randomOffset;
    float progress = sampleIndex / float(FIELD_BLUR_SAMPLE_COUNT);
    float sampleRadius = sqrt(progress) * radius;
    vec2 offset = vec2(cos(angle), sin(angle)) * sampleRadius * u_texelSize;
    float weight = exp(-3.0 * progress);

    sum += texture(u_texture, v_uv + offset) * weight;
    weightSum += weight;
  }

  outColor = sum / weightSum;
}
`;

  const RADIAL_BLUR_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

out vec2 v_uv;

void main() {
  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(aUnitCorner.x * 2.0 - 1.0, 1.0 - aUnitCorner.y * 2.0, 0.0, 1.0);
}
`;

  const RADIAL_BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform vec2 u_center;
uniform float u_amount;
uniform float u_mode;

in vec2 v_uv;

out vec4 outColor;

const int MAX_AMOUNT = 200;

void main() {
  float amount = clamp(u_amount, 0.0, float(MAX_AMOUNT));
  vec4 base = texture(u_texture, v_uv);

  if (amount <= 0.01) {
    outColor = base;
    return;
  }

  vec2 texelSize = max(u_texelSize, vec2(0.000001));
  vec2 center = clamp(u_center, vec2(0.0), vec2(1.0));
  vec2 radialVector = v_uv - center;
  float radialDistance = length(radialVector / texelSize);

  if (radialDistance <= 0.001) {
    outColor = base;
    return;
  }

  vec4 sum = base;
  float weightSum = 1.0;
  float angleRange = amount * 0.0062831853;
  float zoomRange = amount * 0.0025;

  for (int i = 1; i <= MAX_AMOUNT; i++) {
    if (float(i) > amount) {
      break;
    }

    float sampleRatio = float(i) / (amount + 1.0);
    float weight = 1.0 - sampleRatio;
    vec2 sampleA;
    vec2 sampleB;

    if (u_mode > 0.5) {
      float zoomOffset = sampleRatio * zoomRange;

      sampleA = v_uv - radialVector * zoomOffset;
      sampleB = v_uv + radialVector * zoomOffset;
    } else {
      float angleOffset = sampleRatio * angleRange;
      float rotationCos = cos(angleOffset);
      float rotationSin = sin(angleOffset);
      vec2 rotatedClockwise = vec2(
        radialVector.x * rotationCos - radialVector.y * rotationSin,
        radialVector.x * rotationSin + radialVector.y * rotationCos
      );
      vec2 rotatedCounterClockwise = vec2(
        radialVector.x * rotationCos + radialVector.y * rotationSin,
        -radialVector.x * rotationSin + radialVector.y * rotationCos
      );

      sampleA = center + rotatedClockwise;
      sampleB = center + rotatedCounterClockwise;
    }

    sum += texture(u_texture, sampleA) * weight;
    sum += texture(u_texture, sampleB) * weight;
    weightSum += weight * 2.0;
  }

  outColor = sum / weightSum;
}
`;

  const GRAIN_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_scale;
uniform float u_monochrome;
uniform float u_seed;
uniform vec2 u_origin;
uniform vec2 u_size;

in vec2 v_uv;

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);

  return fract((p3.x + p3.y) * p3.z);
}

float grainNoise(vec2 cell, float salt) {
  return hash12(cell + vec2(salt, salt * 1.37) + u_seed) * 2.0 - 1.0;
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  float alpha = clamp(base.a, 0.0, 1.0);
  float amount = clamp(u_amount / 100.0, 0.0, 1.0);

  if (alpha <= 0.0 || amount <= 0.0) {
    outColor = base;
    return;
  }

  vec2 documentPixel = u_origin + vec2(v_uv.x * u_size.x, (1.0 - v_uv.y) * u_size.y);
  float grainSize = mix(1.0, 24.0, clamp(u_scale / 100.0, 0.0, 1.0));
  vec2 grainCell = floor(documentPixel / max(grainSize, 1.0));
  vec3 color = base.rgb / max(alpha, 0.0001);
  vec3 noise;

  if (u_monochrome > 0.5) {
    float value = grainNoise(grainCell, 17.0);

    noise = vec3(value);
  } else {
    noise = vec3(
      grainNoise(grainCell, 11.0),
      grainNoise(grainCell, 29.0),
      grainNoise(grainCell, 47.0)
    );
  }

  color = clamp(color + noise * amount, vec3(0.0), vec3(1.0));
  outColor = vec4(color * alpha, alpha);
}
`;

  const THRESHOLD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_threshold;

in vec2 v_uv;

out vec4 outColor;

float thresholdLuminance(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  float alpha = clamp(base.a, 0.0, 1.0);

  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec3 color = clamp(base.rgb / max(alpha, 0.0001), vec3(0.0), vec3(1.0));
  float level = clamp(u_threshold, 0.0, 255.0);
  float white = thresholdLuminance(color) * 255.0 >= level ? 1.0 : 0.0;

  outColor = vec4(vec3(white) * alpha, alpha);
}
`;

  const LAYER_BLEND_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_backdropTexture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_clipTexture;
uniform float u_opacity;
uniform int u_blendMode;
uniform vec2 uBackdropSize;
uniform float u_maskMode;
uniform vec4 u_maskRect;
uniform float u_maskRectMode;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipOrigin;
uniform vec2 u_clipTextureSize;
uniform vec2 u_drawOrigin;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;

in vec2 v_uv;
in vec2 v_documentPixel;

out vec4 outColor;

vec3 blendOverlay(vec3 baseColor, vec3 sourceColor) {
  vec3 dark = 2.0 * baseColor * sourceColor;
  vec3 light = 1.0 - 2.0 * (1.0 - baseColor) * (1.0 - sourceColor);

  return mix(dark, light, step(vec3(0.5), baseColor));
}

vec3 applyBlendMode(vec3 baseColor, vec3 sourceColor, int blendMode) {
  if (blendMode == 1) {
    return baseColor * sourceColor;
  }

  if (blendMode == 2) {
    return 1.0 - (1.0 - baseColor) * (1.0 - sourceColor);
  }

  if (blendMode == 3) {
    return blendOverlay(baseColor, sourceColor);
  }

  if (blendMode == 4) {
    return min(baseColor, sourceColor);
  }

  if (blendMode == 5) {
    return max(baseColor, sourceColor);
  }

  if (blendMode == 6) {
    return abs(baseColor - sourceColor);
  }

  if (blendMode == 7) {
    return baseColor + sourceColor - 2.0 * baseColor * sourceColor;
  }

  return sourceColor;
}

void main() {
  vec4 source = texture(u_texture, v_uv) * clamp(u_opacity, 0.0, 1.0);

  vec2 globalDocPixel = u_drawOrigin + v_documentPixel;

  if (u_previewCutMode > 0.5) {
    bool insideCutRect =
      globalDocPixel.x >= u_previewCutRect.x &&
      globalDocPixel.y >= u_previewCutRect.y &&
      globalDocPixel.x <= u_previewCutRect.x + u_previewCutRect.z &&
      globalDocPixel.y <= u_previewCutRect.y + u_previewCutRect.w;

    if (insideCutRect) {
      source = vec4(0.0);
    }
  }

  if (u_maskMode > 0.5) {
    float eraseAlpha = 0.0;

    if (u_maskRectMode > 0.5) {
      vec2 local = (v_documentPixel - u_maskRect.xy) / max(u_maskRect.zw, vec2(1.0));

      if (!any(lessThan(local, vec2(0.0))) && !any(greaterThan(local, vec2(1.0)))) {
        eraseAlpha = clamp(texture(u_maskTexture, vec2(local.x, 1.0 - local.y)).a, 0.0, 1.0);
      }
    } else {
      eraseAlpha = clamp(texture(u_maskTexture, v_uv).a, 0.0, 1.0);
    }

    source *= 1.0 - eraseAlpha;
  }

  if (u_clipMode > 0.5) {
    vec2 clipLocalPixel = globalDocPixel - u_clipOrigin;
    vec2 clipUv = vec2(
      clipLocalPixel.x / max(u_clipTextureSize.x, 1.0),
      1.0 - clipLocalPixel.y / max(u_clipTextureSize.y, 1.0)
    );
    float clipAlpha = 0.0;

    if (clipUv.x >= 0.0 && clipUv.x <= 1.0 && clipUv.y >= 0.0 && clipUv.y <= 1.0) {
      clipAlpha = texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
    }

    source *= clipAlpha;
  }

  vec2 backdropUv = gl_FragCoord.xy / max(uBackdropSize, vec2(1.0));
  vec4 backdrop = texture(u_backdropTexture, backdropUv);
  float sourceAlpha = clamp(source.a, 0.0, 1.0);
  float backdropAlpha = clamp(backdrop.a, 0.0, 1.0);

  if (sourceAlpha <= 0.0) {
    outColor = backdrop;
    return;
  }

  vec3 sourceColor = sourceAlpha > 0.0 ? source.rgb / sourceAlpha : vec3(0.0);
  vec3 backdropColor = backdropAlpha > 0.0 ? backdrop.rgb / backdropAlpha : vec3(0.0);
  vec3 blendedColor = applyBlendMode(backdropColor, sourceColor, u_blendMode);
  float outputAlpha = sourceAlpha + backdropAlpha * (1.0 - sourceAlpha);
  vec3 outputRgb =
    blendedColor * sourceAlpha * backdropAlpha +
    sourceColor * sourceAlpha * (1.0 - backdropAlpha) +
    backdropColor * backdropAlpha * (1.0 - sourceAlpha);

  outColor = vec4(clamp(outputRgb, vec3(0.0), vec3(1.0)), outputAlpha);
}
`;

  const DEFAULT_PUPPET_GRID_COLS = 256;
  const DEFAULT_PUPPET_GRID_ROWS = 256;
  const PUPPET_PIN_EPSILON = 0.000001;
  const MAX_GAUSSIAN_BLUR_RADIUS = 200;
  const MAX_MOTION_BLUR_DISTANCE = 300;
  const MAX_FIELD_BLUR_RADIUS = 200;
  const MAX_FIELD_BLUR_PINS = 8;
  const MAX_RADIAL_BLUR_AMOUNT = 200;
  const MAX_GRAIN_AMOUNT = 100;
  const MAX_GRAIN_SCALE = 100;
  const DEFAULT_GRAIN_SCALE = 42;
  const MAX_THRESHOLD_VALUE = 255;
  const DEFAULT_THRESHOLD_VALUE = 128;
  const PREVIEW_CACHE_ZOOM_THRESHOLD = 25.0;

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

  function normalizeThresholdValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, Math.min(MAX_THRESHOLD_VALUE, number)) : DEFAULT_THRESHOLD_VALUE;
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

        return {
          blur: Number.isFinite(blur) ? Math.max(0, Math.min(MAX_FIELD_BLUR_RADIUS, blur)) : 0,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        };
      });
  }

  function hasFieldBlurAmount(pins) {
    return normalizeFieldBlurPins(pins).some((pin) => pin.blur > 0);
  }

  class DocumentRenderer {
    static createContext(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per creare WebGL2.");
      }

      return canvas.getContext("webgl2", WEBGL2_CONTEXT_ATTRIBUTES);
    }

    static resizeCanvasViewport(canvas, gl) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per misurare il viewport.");
      }

      if (!gl || typeof gl.viewport !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido per il viewport.");
      }

      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, canvas.clientHeight || Math.round(rect.height) || 1);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      const didResize = canvas.width !== width || canvas.height !== height;

      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);

      return { dpr, width, height, didResize };
    }

    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createTexture !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido.");
      }

      this.gl = options.gl;
      this.options = {
        transparentBackground: options.transparentBackground === true,
        documentWidth: Number.isFinite(options.documentWidth) && options.documentWidth > 0
          ? Math.floor(options.documentWidth)
          : null,
        documentHeight: Number.isFinite(options.documentHeight) && options.documentHeight > 0
          ? Math.floor(options.documentHeight)
          : null,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
      };
      this.layerModel = options.layerModel ||
        (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);
      this.width = 1;
      this.height = 1;
      this.texture = null;
      this.framebuffer = null;
      this.rasterTargetIdSequence = 1;
      this.paintLayerId = "";
      this.rasterTargetsByLayerId = new Map();
      this.puppetMeshResourcesByLayerId = new Map();
      this.rasterTransformPreview = null;
      this.previewTexture = null;
      this.previewFramebuffer = null;
      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";
      this.texturedQuad = null;
      this.rasterWarpMesh = null;
      this.programInfo = null;
      this.texturedQuadProgramInfo = null;
      this.puppetProgramInfo = null;
      this.perspectiveQuadProgramInfo = null;
      this.gaussianBlurProgramInfo = null;
      this.motionBlurProgramInfo = null;
      this.fieldBlurProgramInfo = null;
      this.radialBlurProgramInfo = null;
      this.grainProgramInfo = null;
      this.thresholdProgramInfo = null;
      this.layerBlendProgramInfo = null;
      this.layerBlendBackdropTexture = null;
      this.layerBlendBackdropWidth = 0;
      this.layerBlendBackdropHeight = 0;
      this.layerEffectScratchA = null;
      this.layerEffectScratchB = null;
      this.activeStrokeScratchTarget = null;
      this.quad = null;
      this.isDisposed = false;
      this.handleLayerModelChange = this.handleLayerModelChange.bind(this);
      this.handleDocumentContentChange = this.handleDocumentContentChange.bind(this);
      this.handleHistoryChange = this.handleHistoryChange.bind(this);

      try {
        this.configureDocumentSize(options.viewportWidth, options.viewportHeight);
        this.createBaseLayerTarget();
        this.programInfo = this.createProgramInfo();
        this.quad = this.createArtboardQuad();
      } catch (error) {
        this.dispose();
        throw error;
      }

      this.layerModel?.addEventListener?.("change", this.handleLayerModelChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.addEventListener("cbo:history-change", this.handleHistoryChange);
    }

    getRasterResourceManager() {
      return namespace.rasterResourceManager || null;
    }

    withRasterResourceDocumentMetadata(metadata = {}) {
      return {
        ...metadata,
        documentHeight: metadata.documentHeight ?? this.height,
        documentWidth: metadata.documentWidth ?? this.width,
      };
    }

    registerRasterTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.withRasterResourceDocumentMetadata(metadata));
    }

    updateRasterTexture(textureOrId, metadataPatch = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.updateTexture || !textureOrId) {
        return null;
      }

      return manager.updateTexture(textureOrId, this.withRasterResourceDocumentMetadata(metadataPatch));
    }

    deleteRasterTexture(textureOrId) {
      const manager = this.getRasterResourceManager();

      if (!manager?.deleteTexture || !textureOrId) {
        return false;
      }

      return manager.deleteTexture(textureOrId);
    }

    registerRasterFramebuffer(framebuffer, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerFramebuffer || !framebuffer) {
        return null;
      }

      return manager.registerFramebuffer(framebuffer, this.withRasterResourceDocumentMetadata(metadata));
    }

    updateRasterFramebuffer(framebufferOrId, metadataPatch = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.updateFramebuffer || !framebufferOrId) {
        return null;
      }

      return manager.updateFramebuffer(framebufferOrId, this.withRasterResourceDocumentMetadata(metadataPatch));
    }

    deleteRasterFramebuffer(framebufferOrId) {
      const manager = this.getRasterResourceManager();

      if (!manager?.deleteFramebuffer || !framebufferOrId) {
        return false;
      }

      return manager.deleteFramebuffer(framebufferOrId);
    }

    markRasterResourceUsed(textureOrId) {
      return this.getRasterResourceManager()?.markUsed?.(textureOrId) || null;
    }

    getRasterRectBytes(rectOrWidth, height = null) {
      const width = typeof rectOrWidth === "object"
        ? rectOrWidth?.width
        : rectOrWidth;
      const resolvedHeight = typeof rectOrWidth === "object"
        ? rectOrWidth?.height
        : height;

      return Math.max(0, Math.round(Number(width) || 0)) *
        Math.max(0, Math.round(Number(resolvedHeight) || 0)) *
        RASTER_BYTES_PER_PIXEL;
    }

    getRasterOperationCoverage(rectOrWidth, height = null) {
      const width = typeof rectOrWidth === "object"
        ? rectOrWidth?.width
        : rectOrWidth;
      const resolvedHeight = typeof rectOrWidth === "object"
        ? rectOrWidth?.height
        : height;
      const documentPixels = Math.max(0, Math.round(this.width || 0)) * Math.max(0, Math.round(this.height || 0));

      if (documentPixels <= 0) {
        return 0;
      }

      return Math.min(
        1,
        Math.max(0, (Math.max(0, width || 0) * Math.max(0, resolvedHeight || 0)) / documentPixels),
      );
    }

    classifyRasterOperationMemory(estimatedPeakBytes, coverage = 0) {
      if (
        estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.largeMaxBytes ||
        coverage >= RASTER_OPERATION_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.mediumMaxBytes) {
        return "large";
      }

      if (estimatedPeakBytes > RASTER_OPERATION_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }

    formatRasterMiB(bytes) {
      return ((Math.max(0, Number(bytes) || 0) / RASTER_MIB)).toFixed(2);
    }

    getRasterOperationPolicy(report = {}) {
      const policy = String(report?.policy || "").toLowerCase();

      if (policy) {
        return policy;
      }

      return this.classifyRasterOperationMemory(
        Number(report?.estimatedPeakBytes) || 0,
        Number(report?.coverage) || 0,
      );
    }

    shouldEvictRasterScratchForPolicy(report = {}) {
      const policy = this.getRasterOperationPolicy(report);

      return policy === "large" || policy === "huge";
    }

    evictRasterScratchCachesForPolicy(report = {}, options = {}) {
      if (!this.shouldEvictRasterScratchForPolicy(report)) {
        return null;
      }

      const policy = this.getRasterOperationPolicy(report);
      const hadPreviewCache = Boolean(this.previewTexture || this.previewFramebuffer);
      const hadEffectScratch = Boolean(this.layerEffectScratchA || this.layerEffectScratchB);
      const hadActiveStrokeScratch = Boolean(this.activeStrokeScratchTarget);
      const deletePreviewCache = options.deletePreviewCache !== false;
      const deleteEffectScratch = options.deleteEffectScratch !== false;
      const deleteActiveStrokeScratch = options.deleteActiveStrokeScratch !== false;

      if (deletePreviewCache && hadPreviewCache) {
        this.deletePreviewCache();
      }

      if (deleteEffectScratch && hadEffectScratch) {
        this.deleteLayerEffectScratchTargets();
      }

      if (deleteActiveStrokeScratch && hadActiveStrokeScratch) {
        this.deleteActiveStrokeScratchTarget();
      }

      const eviction = {
        createdAt: new Date().toISOString(),
        operationType: report?.operationType || report?.phase || "",
        policy,
        reason: report?.reason || options.reason || "raster-policy",
        source: options.source || report?.source || report?.tool || "raster-policy",
        deletedActiveStrokeScratch: deleteActiveStrokeScratch && hadActiveStrokeScratch,
        deletedEffectScratch: deleteEffectScratch && hadEffectScratch,
        deletedPreviewCache: deletePreviewCache && hadPreviewCache,
      };

      namespace.lastRasterScratchEviction = eviction;
      return eviction;
    }

    recordRasterOperation(report = {}) {
      const recorded = this.getRasterResourceManager()?.recordRasterOperation?.(
        this.withRasterResourceDocumentMetadata(report),
      ) || report;

      namespace.lastRasterOperationMemoryReport = recorded;
      this.evictRasterScratchCachesForPolicy(recorded);

      return recorded;
    }

    getRasterTargetResourceMetadata(target, metadata = {}) {
      const width = Math.max(1, Math.round(target?.width || 1));
      const height = Math.max(1, Math.round(target?.height || 1));
      const x = Number.isFinite(target?.x) ? Math.round(target.x) : 0;
      const y = Number.isFinite(target?.y) ? Math.round(target.y) : 0;
      const ownerId = metadata.ownerId || metadata.layerId || target?.layerId || target?.id || "";

      return this.withRasterResourceDocumentMetadata({
        ...metadata,
        bbox: {
          x,
          y,
          width,
          height,
        },
        height,
        kind: metadata.kind || "layer",
        label: metadata.label || ownerId || target?.id || "raster target",
        layerId: metadata.layerId || target?.layerId || "",
        originX: x,
        originY: y,
        ownerId,
        ownerType: metadata.ownerType || "live",
        purgeable: metadata.purgeable === true,
        reason: metadata.reason || "raster-target",
        width,
      });
    }

    registerRasterTargetResources(target, metadata = {}) {
      if (!target) {
        return target;
      }

      const baseMetadata = this.getRasterTargetResourceMetadata(target, metadata);

      if (target.texture) {
        const textureRow = this.registerRasterTexture(target.texture, baseMetadata);
        target.textureResourceId = textureRow?.id || target.textureResourceId || "";
      }

      if (target.framebuffer) {
        const framebufferRow = this.registerRasterFramebuffer(target.framebuffer, {
          ...baseMetadata,
          kind: `${baseMetadata.kind}Framebuffer`,
          linkedTextureId: target.textureResourceId || "",
        });

        target.framebufferResourceId = framebufferRow?.id || target.framebufferResourceId || "";
      }

      return target;
    }

    updateRasterTargetResourceMetadata(target, metadata = {}) {
      if (!target) {
        return target;
      }

      const baseMetadata = this.getRasterTargetResourceMetadata(target, metadata);

      if (target.texture || target.textureResourceId) {
        const textureRow =
          this.updateRasterTexture(target.texture || target.textureResourceId, baseMetadata) ||
          this.registerRasterTexture(target.texture, baseMetadata);

        target.textureResourceId = textureRow?.id || target.textureResourceId || "";
      }

      if (target.framebuffer || target.framebufferResourceId) {
        const framebufferMetadata = {
          ...baseMetadata,
          kind: `${baseMetadata.kind}Framebuffer`,
          linkedTextureId: target.textureResourceId || "",
        };
        const framebufferRow =
          this.updateRasterFramebuffer(target.framebuffer || target.framebufferResourceId, framebufferMetadata) ||
          this.registerRasterFramebuffer(target.framebuffer, framebufferMetadata);

        target.framebufferResourceId = framebufferRow?.id || target.framebufferResourceId || "";
      }

      return target;
    }

    unregisterRasterTargetResources(target) {
      if (!target) {
        return;
      }

      if (target.framebuffer || target.framebufferResourceId) {
        this.deleteRasterFramebuffer(target.framebuffer || target.framebufferResourceId);
        target.framebufferResourceId = "";
      }

      if (target.texture || target.textureResourceId) {
        this.deleteRasterTexture(target.texture || target.textureResourceId);
        target.textureResourceId = "";
      }
    }

    estimateRasterTargetBytes(target) {
      const width = Math.max(0, Math.round(target?.width || 0));
      const height = Math.max(0, Math.round(target?.height || 0));

      return width * height * RASTER_BYTES_PER_PIXEL;
    }

    estimateRasterSnapshotBytes(snapshot) {
      return this.getRasterRectBytes(snapshot?.rect || snapshot?.targetRect);
    }

    getRasterHistoryTileSize(options = {}) {
      const requested = Number(options.tileSize ?? options.historyTileSize ?? RASTER_HISTORY_TILE_SIZE);

      if (!Number.isFinite(requested) || requested <= 0) {
        return RASTER_HISTORY_TILE_SIZE;
      }

      return Math.max(16, Math.min(1024, Math.round(requested)));
    }

    getRasterHistoryTileRects(rect, options = {}) {
      const captureRect = this.getClampedDocumentRect(rect);

      if (!captureRect) {
        return [];
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const startTx = Math.floor(captureRect.x / tileSize);
      const startTy = Math.floor(captureRect.y / tileSize);
      const endTx = Math.floor((captureRect.x + captureRect.width - 1) / tileSize);
      const endTy = Math.floor((captureRect.y + captureRect.height - 1) / tileSize);
      const rects = [];

      for (let ty = startTy; ty <= endTy; ty += 1) {
        for (let tx = startTx; tx <= endTx; tx += 1) {
          const tileX = tx * tileSize;
          const tileY = ty * tileSize;
          const x0 = Math.max(0, tileX);
          const y0 = Math.max(0, tileY);
          const x1 = Math.min(tileX + tileSize, this.width);
          const y1 = Math.min(tileY + tileSize, this.height);

          if (x1 <= x0 || y1 <= y0) {
            continue;
          }

          rects.push({
            rect: {
              x: x0,
              y: y0,
              width: x1 - x0,
              height: y1 - y0,
            },
            tx,
            ty,
          });
        }
      }

      return rects;
    }

    unionRasterHistoryRects(a, b) {
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
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }

    extendRasterTileHistory(capture, dirtyRect, options = {}) {
      if (!capture || capture.destroyed === true || !Array.isArray(capture.tileDeltas)) {
        return false;
      }

      const captureRect = this.getClampedDocumentRect(dirtyRect);

      if (!captureRect) {
        return true;
      }

      const tileSize = this.getRasterHistoryTileSize({
        tileSize: capture.tileSize,
        ...options,
      });
      const existingKeys = new Set(capture.tileDeltas.map((delta) => `${delta.storeId}:${delta.tx}:${delta.ty}`));
      const label = options.label || capture.label || options.source || "raster-tile-history";
      const layerId = options.layerId || capture.layerId;

      for (const tile of this.getRasterHistoryTileRects(captureRect, { tileSize })) {
        const storeId = `LayerPixels:${layerId}`;
        const key = `${storeId}:${tile.tx}:${tile.ty}`;

        if (existingKeys.has(key)) {
          continue;
        }

        const before = this.createRasterSnapshot(layerId, tile.rect, `${label}-before-tile-${tile.tx}-${tile.ty}`);

        if (!before?.texture && !before?.cpuPixels) {
          return false;
        }

        capture.tileDeltas.push({
          after: null,
          before,
          layerId,
          rect: before.rect ? { ...before.rect } : { ...tile.rect },
          storeId,
          tx: tile.tx,
          ty: tile.ty,
        });
        existingKeys.add(key);
      }

      capture.rect = this.unionRasterHistoryRects(capture.rect, captureRect);
      capture.projectionInvalidation = [{ ...capture.rect }];

      return true;
    }

    deleteRasterTileHistoryCapture(capture) {
      const deltas = Array.isArray(capture?.tileDeltas) ? capture.tileDeltas : [];

      for (const delta of deltas) {
        this.deleteRasterSnapshot(delta.before);
        this.deleteRasterSnapshot(delta.after);
        delta.before = null;
        delta.after = null;
      }

      if (capture) {
        capture.destroyed = true;
      }
    }

    beginRasterTileHistory(layerId, dirtyRect, options = {}) {
      if (!layerId || !dirtyRect) {
        return null;
      }

      const target = this.rasterTargetsByLayerId.get(layerId) || this.getRasterTarget(layerId);
      const captureRect = this.getClampedDocumentRect(dirtyRect);

      if (!target?.framebuffer || !target?.texture || !captureRect) {
        return null;
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const label = options.label || options.source || "raster-tile-history";
      const capture = {
        affectedNodes: [layerId],
        id: `raster-tile-history-${this.rasterTargetIdSequence++}`,
        label,
        layerId,
        projectionInvalidation: [{ ...captureRect }],
        rect: { ...captureRect },
        source: options.source || label,
        tileDeltas: [],
        tileSize,
        type: "raster-tile-history-capture",
      };

      if (!this.extendRasterTileHistory(capture, captureRect, { label, layerId, tileSize })) {
        this.deleteRasterTileHistoryCapture(capture);
        return null;
      }

      return capture;
    }

    commitRasterTileHistory(capture, options = {}) {
      if (!capture || capture.destroyed === true || !Array.isArray(capture.tileDeltas)) {
        return null;
      }

      const label = options.label || capture.label || options.source || "raster-tile-history";

      for (const delta of capture.tileDeltas) {
        const after = this.createRasterSnapshot(
          delta.layerId || capture.layerId,
          delta.rect,
          `${label}-after-tile-${delta.tx}-${delta.ty}`,
        );

        if (!after?.texture && !after?.cpuPixels) {
          for (const existingDelta of capture.tileDeltas) {
            this.deleteRasterSnapshot(existingDelta.after);
            existingDelta.after = null;
          }

          capture.commitFailed = true;
          return null;
        }

        delta.after = after;
      }

      const renderer = this;
      const entry = {
        affectedNodes: [...capture.affectedNodes],
        id: capture.id,
        label,
        layerId: capture.layerId,
        memoryPolicy: options.memoryPolicy || capture.memoryPolicy || null,
        projectionInvalidation: capture.projectionInvalidation.map((rect) => ({ ...rect })),
        rect: { ...capture.rect },
        source: options.source || capture.source || label,
        tileDeltas: capture.tileDeltas,
        tileSize: capture.tileSize,
        type: options.type || "tile-delta",
        undo() {
          return renderer.restoreRasterTileHistoryEntry(this, "before", {
            source: options.undoSource || `history-undo-${this.source}`,
          });
        },
        redo() {
          return renderer.restoreRasterTileHistoryEntry(this, "after", {
            source: options.redoSource || `history-redo-${this.source}`,
          });
        },
        destroy() {
          renderer.deleteRasterTileHistoryCapture(this);
        },
      };

      capture.destroyed = true;
      return entry;
    }

    restoreRasterTileHistoryEntry(entry, snapshotKey = "before", options = {}) {
      const deltas = Array.isArray(entry?.tileDeltas) ? entry.tileDeltas : [];

      if (deltas.length === 0) {
        return false;
      }

      for (const delta of deltas) {
        if (!delta?.[snapshotKey]) {
          return false;
        }
      }

      for (const delta of deltas) {
        const layerId = delta.layerId || entry.layerId;
        const didRestore = this.restoreRasterSnapshot(layerId, delta[snapshotKey], {
          emit: false,
          source: options.source || "raster-tile-history-restore",
        });

        if (!didRestore) {
          return false;
        }
      }

      if (options.emit !== false) {
        this.emitContentChange({
          layerId: entry.layerId,
          source: options.source || "raster-tile-history-restore",
        });
      }

      this.requestDraw();
      return true;
    }

    createRasterOperationMemoryReport(options = {}) {
      const beforeBytes = this.getRasterRectBytes(options.beforeRect) ||
        this.estimateRasterSnapshotBytes(options.beforeSnapshot);
      const afterBytes = this.getRasterRectBytes(options.afterRect) ||
        this.estimateRasterSnapshotBytes(options.afterSnapshot);
      const sourceBytes = Number.isFinite(Number(options.sourceBytes))
        ? Math.max(0, Math.round(Number(options.sourceBytes)))
        : this.getRasterRectBytes(options.sourceRect);
      const targetBytes = Number.isFinite(Number(options.targetBytes))
        ? Math.max(0, Math.round(Number(options.targetBytes)))
        : this.getRasterRectBytes(options.targetRect);
      const scratchBytes = Number.isFinite(Number(options.scratchBytes))
        ? Math.max(0, Math.round(Number(options.scratchBytes)))
        : 0;
      const historyBytes = beforeBytes + afterBytes;
      const persistentBytes = Number.isFinite(Number(options.persistentBytes))
        ? Math.max(0, Math.round(Number(options.persistentBytes)))
        : historyBytes;
      const estimatedPeakBytes = Number.isFinite(Number(options.estimatedPeakBytes))
        ? Math.max(0, Math.round(Number(options.estimatedPeakBytes)))
        : sourceBytes + targetBytes + scratchBytes + historyBytes;
      const coverage = Number.isFinite(Number(options.coverage))
        ? Math.min(1, Math.max(0, Number(options.coverage)))
        : this.getRasterOperationCoverage(options.targetRect || options.afterSnapshot?.rect || options.beforeSnapshot?.rect);

      return {
        afterBytes,
        beforeBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes,
        historyBytes,
        layerId: options.layerId || "",
        mode: options.mode || options.transformMode || "",
        operationType: options.operationType || "raster-operation",
        persistentBytes,
        policy: this.classifyRasterOperationMemory(estimatedPeakBytes, coverage),
        reason: options.reason || options.source || "",
        scratchBytes,
        source: options.source || "",
        sourceBytes,
        sourceRect: options.sourceRect || null,
        targetBytes,
        targetRect: options.targetRect || null,
        tool: options.tool || options.operationType || "raster-operation",
      };
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader document renderer WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info =
          gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione dello shader document renderer.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    createProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, ARTBOARD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, ARTBOARD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma document renderer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma document renderer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          drawOrigin: gl.getUniformLocation(program, "u_drawOrigin"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          gridMode: gl.getUniformLocation(program, "u_gridMode"),
        },
      };
    }

    createPuppetProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PUPPET_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PUPPET_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma puppet WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma puppet.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createTexturedQuadProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, TEXTURED_QUAD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma textured quad edge AA WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma textured quad edge AA.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          destToSourceUv: gl.getUniformLocation(program, "u_destToSourceUv"),
          edgeFeatherPixels: gl.getUniformLocation(program, "u_edgeFeatherPixels"),
          quadEdges: gl.getUniformLocation(program, "u_quadEdges[0]"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createPerspectiveQuadProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma perspective quad WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma perspective quad.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          destToSourceUv: gl.getUniformLocation(program, "u_destToSourceUv"),
          edgeFeatherPixels: gl.getUniformLocation(program, "u_edgeFeatherPixels"),
          quadEdges: gl.getUniformLocation(program, "u_quadEdges[0]"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createGaussianBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma gaussian blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma gaussian blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          radius: gl.getUniformLocation(program, "u_radius"),
          texelStep: gl.getUniformLocation(program, "u_texelStep"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createMotionBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, MOTION_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, MOTION_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma motion blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma motion blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          directionTexelStep: gl.getUniformLocation(program, "u_directionTexelStep"),
          distance: gl.getUniformLocation(program, "u_distance"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createFieldBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, FIELD_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FIELD_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma field blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma field blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          pinCount: gl.getUniformLocation(program, "u_pinCount"),
          pins: gl.getUniformLocation(program, "u_pins[0]"),
          texelSize: gl.getUniformLocation(program, "u_texelSize"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createRadialBlurProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, RADIAL_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, RADIAL_BLUR_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma radial blur WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma radial blur.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          amount: gl.getUniformLocation(program, "u_amount"),
          center: gl.getUniformLocation(program, "u_center"),
          mode: gl.getUniformLocation(program, "u_mode"),
          texelSize: gl.getUniformLocation(program, "u_texelSize"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createGrainProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, GRAIN_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma grain WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma grain.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          amount: gl.getUniformLocation(program, "u_amount"),
          monochrome: gl.getUniformLocation(program, "u_monochrome"),
          origin: gl.getUniformLocation(program, "u_origin"),
          scale: gl.getUniformLocation(program, "u_scale"),
          seed: gl.getUniformLocation(program, "u_seed"),
          size: gl.getUniformLocation(program, "u_size"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createThresholdProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, THRESHOLD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma threshold WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma threshold.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          texture: gl.getUniformLocation(program, "u_texture"),
          threshold: gl.getUniformLocation(program, "u_threshold"),
        },
      };
    }

    createLayerBlendProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, ARTBOARD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, LAYER_BLEND_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma blend layer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma blend layer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          backdropSize: gl.getUniformLocation(program, "uBackdropSize"),
          backdropTexture: gl.getUniformLocation(program, "u_backdropTexture"),
          blendMode: gl.getUniformLocation(program, "u_blendMode"),
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          drawOrigin: gl.getUniformLocation(program, "u_drawOrigin"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
        },
      };
    }

    ensurePuppetProgramInfo() {
      if (!this.puppetProgramInfo) {
        this.puppetProgramInfo = this.createPuppetProgramInfo();
      }

      return this.puppetProgramInfo;
    }

    ensureTexturedQuadProgramInfo() {
      if (!this.texturedQuadProgramInfo) {
        this.texturedQuadProgramInfo = this.createTexturedQuadProgramInfo();
      }

      return this.texturedQuadProgramInfo;
    }

    ensurePerspectiveQuadProgramInfo() {
      if (!this.perspectiveQuadProgramInfo) {
        this.perspectiveQuadProgramInfo = this.createPerspectiveQuadProgramInfo();
      }

      return this.perspectiveQuadProgramInfo;
    }

    ensureGaussianBlurProgramInfo() {
      if (!this.gaussianBlurProgramInfo) {
        this.gaussianBlurProgramInfo = this.createGaussianBlurProgramInfo();
      }

      return this.gaussianBlurProgramInfo;
    }

    ensureMotionBlurProgramInfo() {
      if (!this.motionBlurProgramInfo) {
        this.motionBlurProgramInfo = this.createMotionBlurProgramInfo();
      }

      return this.motionBlurProgramInfo;
    }

    ensureFieldBlurProgramInfo() {
      if (!this.fieldBlurProgramInfo) {
        this.fieldBlurProgramInfo = this.createFieldBlurProgramInfo();
      }

      return this.fieldBlurProgramInfo;
    }

    ensureRadialBlurProgramInfo() {
      if (!this.radialBlurProgramInfo) {
        this.radialBlurProgramInfo = this.createRadialBlurProgramInfo();
      }

      return this.radialBlurProgramInfo;
    }

    ensureGrainProgramInfo() {
      if (!this.grainProgramInfo) {
        this.grainProgramInfo = this.createGrainProgramInfo();
      }

      return this.grainProgramInfo;
    }

    ensureThresholdProgramInfo() {
      if (!this.thresholdProgramInfo) {
        this.thresholdProgramInfo = this.createThresholdProgramInfo();
      }

      return this.thresholdProgramInfo;
    }

    ensureLayerBlendProgramInfo() {
      if (!this.layerBlendProgramInfo) {
        this.layerBlendProgramInfo = this.createLayerBlendProgramInfo();
      }

      return this.layerBlendProgramInfo;
    }

    createTexturedQuadResource() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse per il quad raster transform.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, 6 * 4 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(
        1,
        2,
        gl.FLOAT,
        false,
        4 * Float32Array.BYTES_PER_ELEMENT,
        2 * Float32Array.BYTES_PER_ELEMENT,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { buffer, vao };
    }

    ensureTexturedQuadResource() {
      if (!this.texturedQuad) {
        this.texturedQuad = this.createTexturedQuadResource();
      }

      return this.texturedQuad;
    }

    deleteRasterWarpMeshResource() {
      const resource = this.rasterWarpMesh;

      if (!resource) {
        return;
      }

      const gl = this.gl;

      if (resource.vbo) {
        gl.deleteBuffer(resource.vbo);
      }

      if (resource.ebo) {
        gl.deleteBuffer(resource.ebo);
      }

      if (resource.vao) {
        gl.deleteVertexArray(resource.vao);
      }

      this.rasterWarpMesh = null;
    }

    createRasterWarpMeshResource(cols = RASTER_WARP_MESH_COLS, rows = RASTER_WARP_MESH_ROWS) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ebo = gl.createBuffer();
      const vertices = new Float32Array((cols + 1) * (rows + 1) * 4);
      const indices = new Uint32Array(cols * rows * 6);
      let indexOffset = 0;

      if (!vao || !vbo || !ebo) {
        if (vao) {
          gl.deleteVertexArray(vao);
        }

        if (vbo) {
          gl.deleteBuffer(vbo);
        }

        if (ebo) {
          gl.deleteBuffer(ebo);
        }

        throw new Error("Impossibile creare la mesh raster warp WebGL2.");
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;

          indices[indexOffset++] = a;
          indices[indexOffset++] = c;
          indices[indexOffset++] = b;
          indices[indexOffset++] = b;
          indices[indexOffset++] = c;
          indices[indexOffset++] = d;
        }
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      this.rasterWarpMesh = {
        cols,
        ebo,
        indexCount: indices.length,
        indices,
        rows,
        vao,
        vbo,
        vertices,
      };

      return this.rasterWarpMesh;
    }

    ensureRasterWarpMeshResource(cols = RASTER_WARP_MESH_COLS, rows = RASTER_WARP_MESH_ROWS) {
      if (this.rasterWarpMesh?.cols === cols && this.rasterWarpMesh?.rows === rows) {
        return this.rasterWarpMesh;
      }

      this.deleteRasterWarpMeshResource();
      return this.createRasterWarpMeshResource(cols, rows);
    }

    getRasterTransformEdgeFeatherPixels(options = {}) {
      if (Number.isFinite(options.edgeFeatherPixels)) {
        return Math.max(0, Number(options.edgeFeatherPixels));
      }

      if (options.preserveHardEdges === true) {
        return 0;
      }

      return RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS;
    }

    getRasterTransformEdgeAaPaddingForCamera(camera = {}, edgeFeatherPixels = RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS) {
      const featherPixels = Math.max(0, Number(edgeFeatherPixels) || 0);

      if (featherPixels <= 0) {
        return 0;
      }

      const zoom = Math.abs(Number(camera.zoom));
      const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

      return Math.max(
        1,
        Math.ceil(featherPixels / safeZoom) + 1,
      );
    }

    padRasterRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const safePadding = Math.max(0, Math.ceil(Number(padding) || 0));

      return {
        height: rect.height + safePadding * 2,
        width: rect.width + safePadding * 2,
        x: rect.x - safePadding,
        y: rect.y - safePadding,
      };
    }

    createExpandedQuadDrawVertices(quad, padding = 0) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let index = 0; index < 4; index += 1) {
        const point = quad[index];

        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return null;
        }

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      const safePadding = Math.max(0, Number(padding) || 0);
      const x0 = minX - safePadding;
      const y0 = minY - safePadding;
      const x1 = maxX + safePadding;
      const y1 = maxY + safePadding;

      return new Float32Array([
        x0, y0, 0, 1,
        x1, y0, 1, 1,
        x1, y1, 1, 0,
        x0, y0, 0, 1,
        x1, y1, 1, 0,
        x0, y1, 0, 0,
      ]);
    }

    computeQuadEdgeUniformData(quad) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      const points = quad.slice(0, 4).map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }));

      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        return null;
      }

      const center = points.reduce(
        (result, point) => ({
          x: result.x + point.x / points.length,
          y: result.y + point.y / points.length,
        }),
        { x: 0, y: 0 },
      );
      const edgeData = new Float32Array(16);

      for (let index = 0; index < 4; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % 4];
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const length = Math.hypot(dx, dy);

        if (length < 0.000001) {
          return null;
        }

        let nx = -dy / length;
        let ny = dx / length;
        let c = -(nx * current.x + ny * current.y);

        if (nx * center.x + ny * center.y + c < 0) {
          nx *= -1;
          ny *= -1;
          c *= -1;
        }

        const offset = index * 4;

        edgeData[offset] = nx;
        edgeData[offset + 1] = ny;
        edgeData[offset + 2] = c;
        edgeData[offset + 3] = 0;
      }

      return edgeData;
    }

    computeAffineDestToSourceUvMatrix(quad) {
      if (!Array.isArray(quad) || quad.length < 4) {
        return null;
      }

      const q0 = quad[0];
      const q1 = quad[1];
      const q3 = quad[3];

      if (
        !q0 ||
        !q1 ||
        !q3 ||
        !Number.isFinite(q0.x) ||
        !Number.isFinite(q0.y) ||
        !Number.isFinite(q1.x) ||
        !Number.isFinite(q1.y) ||
        !Number.isFinite(q3.x) ||
        !Number.isFinite(q3.y)
      ) {
        return null;
      }

      const ax = q1.x - q0.x;
      const ay = q1.y - q0.y;
      const bx = q3.x - q0.x;
      const by = q3.y - q0.y;
      const determinant = ax * by - ay * bx;

      if (Math.abs(determinant) < 0.000001) {
        return null;
      }

      const m00 = by / determinant;
      const m01 = -bx / determinant;
      const m02 = (bx * q0.y - by * q0.x) / determinant;
      const m10 = -ay / determinant;
      const m11 = ax / determinant;
      const m12 = (ay * q0.x - ax * q0.y) / determinant;

      return new Float32Array([
        m00, m10, 0,
        m01, m11, 0,
        m02, m12, 1,
      ]);
    }

    computeDestToSourceUvHomography(destQuad) {
      if (!Array.isArray(destQuad) || destQuad.length < 4) {
        return null;
      }

      const points = destQuad.map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }));

      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        return null;
      }

      const x0 = points[0].x;
      const y0 = points[0].y;
      const x1 = points[1].x;
      const y1 = points[1].y;
      const x2 = points[2].x;
      const y2 = points[2].y;
      const x3 = points[3].x;
      const y3 = points[3].y;
      const dx1 = x1 - x2;
      const dx2 = x3 - x2;
      const dy1 = y1 - y2;
      const dy2 = y3 - y2;
      const sx = x0 - x1 + x2 - x3;
      const sy = y0 - y1 + y2 - y3;
      const epsilon = 0.000001;
      let a;
      let b;
      let c;
      let d;
      let e;
      let f;
      let g;
      let h;

      if (Math.abs(sx) < epsilon && Math.abs(sy) < epsilon) {
        a = x1 - x0;
        b = x3 - x0;
        c = x0;
        d = y1 - y0;
        e = y3 - y0;
        f = y0;
        g = 0;
        h = 0;
      } else {
        const det = dx1 * dy2 - dx2 * dy1;

        if (Math.abs(det) < epsilon) {
          return null;
        }

        g = (sx * dy2 - sy * dx2) / det;
        h = (dx1 * sy - dy1 * sx) / det;
        a = x1 - x0 + g * x1;
        b = x3 - x0 + h * x3;
        c = x0;
        d = y1 - y0 + g * y1;
        e = y3 - y0 + h * y3;
        f = y0;
      }

      const c00 = e - f * h;
      const c01 = f * g - d;
      const c02 = d * h - e * g;
      const c10 = c * h - b;
      const c11 = a - c * g;
      const c12 = b * g - a * h;
      const c20 = b * f - c * e;
      const c21 = c * d - a * f;
      const c22 = a * e - b * d;
      const detM = a * c00 + b * c01 + c * c02;

      if (Math.abs(detM) < epsilon) {
        return null;
      }

      const inverseDet = 1 / detM;

      return new Float32Array([
        c00 * inverseDet, c01 * inverseDet, c02 * inverseDet,
        c10 * inverseDet, c11 * inverseDet, c12 * inverseDet,
        c20 * inverseDet, c21 * inverseDet, c22 * inverseDet,
      ]);
    }

    normalizeRasterWarpControlPoints(controlPoints) {
      if (!Array.isArray(controlPoints) || controlPoints.length !== 4) {
        return null;
      }

      const normalized = [];

      for (let row = 0; row < 4; row += 1) {
        if (!Array.isArray(controlPoints[row]) || controlPoints[row].length !== 4) {
          return null;
        }

        normalized[row] = [];

        for (let col = 0; col < 4; col += 1) {
          const point = controlPoints[row][col];
          const x = Number(point?.x);
          const y = Number(point?.y);

          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }

          normalized[row][col] = { x, y };
        }
      }

      return normalized;
    }

    getRasterWarpBernstein(index, t) {
      const clampedT = Math.min(1, Math.max(0, Number(t) || 0));
      const inverse = 1 - clampedT;

      if (index === 0) {
        return inverse * inverse * inverse;
      }

      if (index === 1) {
        return 3 * clampedT * inverse * inverse;
      }

      if (index === 2) {
        return 3 * clampedT * clampedT * inverse;
      }

      return clampedT * clampedT * clampedT;
    }

    evaluateRasterWarpSurface(u, v, controlPoints) {
      let x = 0;
      let y = 0;

      for (let row = 0; row < 4; row += 1) {
        const rowWeight = this.getRasterWarpBernstein(row, v);

        for (let col = 0; col < 4; col += 1) {
          const point = controlPoints[row][col];
          const weight = rowWeight * this.getRasterWarpBernstein(col, u);

          x += point.x * weight;
          y += point.y * weight;
        }
      }

      return { x, y };
    }

    getRasterWarpBounds(controlPoints) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!points) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const point = points[row][col];

          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    offsetRasterWarpControlPoints(controlPoints, dx = 0, dy = 0) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!points) {
        return null;
      }

      return points.map((row) =>
        row.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        }))
      );
    }

    updateRasterWarpMeshVertices(resource, controlPoints) {
      const vertices = resource?.vertices;

      if (!vertices) {
        return false;
      }

      const cols = resource.cols;
      const rows = resource.rows;
      let offset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        const v = gridY / rows;

        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const u = gridX / cols;
          const point = this.evaluateRasterWarpSurface(u, v, controlPoints);

          vertices[offset] = point.x;
          vertices[offset + 1] = point.y;
          vertices[offset + 2] = u;
          vertices[offset + 3] = 1 - v;
          offset += 4;
        }
      }

      return true;
    }

    drawWarpTexturedMesh(texture, controlPoints, options = {}) {
      const points = this.normalizeRasterWarpControlPoints(controlPoints);

      if (!texture || !points) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const resource = this.ensureRasterWarpMeshResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;

      if (!this.updateRasterWarpMeshVertices(resource, points)) {
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, resource.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, resource.vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindVertexArray(resource.vao);
      gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);

      return true;
    }

    drawTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureTexturedQuadProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const edgeFeatherPixels = this.getRasterTransformEdgeFeatherPixels(options);
      const matrix = this.computeAffineDestToSourceUvMatrix(quad);
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!matrix || !edgeData || !vertices) {
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniformMatrix3fv(uniforms.destToSourceUv, false, matrix);
      gl.uniform4fv(uniforms.quadEdges, edgeData);
      gl.uniform1f(uniforms.edgeFeatherPixels, edgeFeatherPixels);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    drawPerspectiveTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const matrix = this.computeDestToSourceUvHomography(quad);

      if (!matrix) {
        return this.drawTexturedQuad(texture, quad, options);
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePerspectiveQuadProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const edgeFeatherPixels = this.getRasterTransformEdgeFeatherPixels(options);
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!edgeData || !vertices) {
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniformMatrix3fv(uniforms.destToSourceUv, false, matrix);
      gl.uniform4fv(uniforms.quadEdges, edgeData);
      gl.uniform1f(uniforms.edgeFeatherPixels, edgeFeatherPixels);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    createArtboardQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      const vertices = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse GPU per l'artboard.");
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

    createPreviewCache() {
      if (this.previewTexture && this.previewFramebuffer) {
        return true;
      }

      if (this.previewTexture || this.previewFramebuffer) {
        this.deletePreviewCache();
      }

      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        console.warn("Preview mipmap non disponibile: impossibile allocare la cache.");
        return false;
      }

      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const levels = Math.max(1, Math.floor(Math.log2(Math.max(width, height))) + 1);

      gl.bindTexture(gl.TEXTURE_2D, texture);

      if (typeof gl.texStorage2D === "function" && gl.RGBA8) {
        gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn("Preview FBO incompleto: uso il rendering full-res come fallback.");
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewTexture = texture;
      this.previewFramebuffer = framebuffer;
      this.previewMipLevels = levels;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";

      const textureRow = this.registerRasterTexture(texture, {
        height,
        kind: "previewMip",
        label: "preview mip cache",
        mipLevels: levels,
        ownerId: "preview-cache",
        ownerType: "cache",
        purgeable: true,
        reason: "create-preview-cache",
        width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        height,
        kind: "previewMipFramebuffer",
        label: "preview mip framebuffer",
        linkedTextureId: textureRow?.id || "",
        ownerId: "preview-cache",
        ownerType: "cache",
        purgeable: true,
        reason: "create-preview-cache",
        width,
      });

      return true;
    }

    deletePreviewCache() {
      const gl = this.gl;

      if (this.previewFramebuffer) {
        this.deleteRasterFramebuffer(this.previewFramebuffer);
        gl.deleteFramebuffer(this.previewFramebuffer);
        this.previewFramebuffer = null;
      }

      if (this.previewTexture) {
        this.deleteRasterTexture(this.previewTexture);
        gl.deleteTexture(this.previewTexture);
        this.previewTexture = null;
      }

      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
    }

    invalidatePreviewCache(reason = "unknown") {
      this.previewCacheDirty = true;
      this.previewCacheReason = reason;
    }

    getLayerOpacity(layerId, layers = this.getRenderableLayers()) {
      const layer = Array.isArray(layers)
        ? layers.find((entry) => entry?.id === layerId)
        : null;

      return Number.isFinite(layer?.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
    }

    getGaussianBlurRadius(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "gaussian-blur" && item.enabled !== false)
        : effects?.gaussianBlur;
      const radius = Number(effect?.radius);

      return Number.isFinite(radius) ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius)) : 0;
    }

    getLayerGaussianBlur(layer) {
      const radius = this.getGaussianBlurRadius(layer);

      return radius > 0
        ? {
            enabled: true,
            radius,
          }
        : null;
    }

    getMotionBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "motion-blur" && item.enabled !== false)
        : effects?.motionBlur;
      const distance = Number(effect?.distance);

      return {
        angle: normalizeAngle(effect?.angle),
        distance: Number.isFinite(distance) ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance)) : 0,
      };
    }

    getLayerMotionBlur(layer) {
      const motionBlur = this.getMotionBlur(layer);

      return motionBlur.distance > 0
        ? {
            enabled: true,
            distance: motionBlur.distance,
            angle: motionBlur.angle,
          }
        : null;
    }

    getFieldBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "field-blur" && item.enabled !== false)
        : effects?.fieldBlur;

      return {
        pins: normalizeFieldBlurPins(effect?.pins),
      };
    }

    getLayerFieldBlur(layer) {
      const fieldBlur = this.getFieldBlur(layer);

      return hasFieldBlurAmount(fieldBlur.pins)
        ? {
            enabled: true,
            pins: fieldBlur.pins,
          }
        : null;
    }

    getRadialBlur(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "radial-blur" && item.enabled !== false)
        : effects?.radialBlur;
      const amount = Number(effect?.amount);
      const centerFallback = effect?.center;

      return {
        amount: Number.isFinite(amount) ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount)) : 0,
        centerX: normalizePercent(effect?.centerX ?? centerFallback),
        centerY: normalizePercent(effect?.centerY ?? centerFallback),
        mode: normalizeRadialBlurMode(effect?.mode),
      };
    }

    getLayerRadialBlur(layer) {
      const radialBlur = this.getRadialBlur(layer);

      return radialBlur.amount > 0
        ? {
            enabled: true,
            amount: radialBlur.amount,
            centerX: radialBlur.centerX,
            centerY: radialBlur.centerY,
            mode: radialBlur.mode,
          }
        : null;
    }

    getGrain(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "grain" && item.enabled !== false)
        : effects?.grain;
      const seed = Number(effect?.seed);

      return {
        amount: normalizeGrainAmount(effect?.amount),
        scale: normalizeGrainScale(effect?.scale),
        monochrome: effect ? effect.monochrome !== false : true,
        seed: Number.isFinite(seed) ? seed : 0,
      };
    }

    getLayerGrain(layer) {
      const grain = this.getGrain(layer);

      return grain.amount > 0
        ? {
            enabled: true,
            amount: grain.amount,
            scale: grain.scale,
            monochrome: grain.monochrome,
            seed: grain.seed,
          }
        : null;
    }

    getThreshold(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "threshold" && item.enabled !== false)
        : effects?.threshold;

      return {
        enabled: Boolean(effect && effect.enabled !== false),
        threshold: normalizeThresholdValue(effect?.threshold ?? effect?.level),
      };
    }

    getLayerThreshold(layer) {
      const threshold = this.getThreshold(layer);

      return threshold.enabled
        ? {
            enabled: true,
            threshold: threshold.threshold,
          }
        : null;
    }

    hasEnabledLayerEffects(layer) {
      return (
        this.getGaussianBlurRadius(layer) > 0 ||
        this.getMotionBlur(layer).distance > 0 ||
        hasFieldBlurAmount(this.getFieldBlur(layer).pins) ||
        this.getRadialBlur(layer).amount > 0 ||
        this.getGrain(layer).amount > 0 ||
        Boolean(this.getLayerThreshold(layer))
      );
    }

    hasLayerVisualEffects(layer) {
      return this.hasEnabledLayerEffects(layer);
    }

    hasAnyEnabledLayerEffects(layers = this.getOrderedLayersBottomToTop()) {
      return Array.isArray(layers) && layers.some((layer) => this.hasEnabledLayerEffects(layer));
    }

    getLayerBlendModeId(layer) {
      return namespace.BlendModes?.getLayerBlendModeId?.(layer?.blendMode) || 0;
    }

    hasAdvancedLayerBlendMode(layer) {
      return this.getLayerBlendModeId(layer) !== 0;
    }

    hasAnyAdvancedLayerBlendModes(layers = this.getOrderedLayersBottomToTop()) {
      return Array.isArray(layers) && layers.some((layer) => this.hasAdvancedLayerBlendMode(layer));
    }

    ensureLayerBlendBackdropTexture(width, height) {
      const gl = this.gl;
      const targetWidth = Math.max(1, Math.round(width || 1));
      const targetHeight = Math.max(1, Math.round(height || 1));
      const needsTexture =
        !this.layerBlendBackdropTexture ||
        this.layerBlendBackdropWidth !== targetWidth ||
        this.layerBlendBackdropHeight !== targetHeight;

      if (!needsTexture) {
        this.markRasterResourceUsed(this.layerBlendBackdropTexture);
        return this.layerBlendBackdropTexture;
      }

      if (this.layerBlendBackdropTexture) {
        this.deleteRasterTexture(this.layerBlendBackdropTexture);
        gl.deleteTexture(this.layerBlendBackdropTexture);
      }

      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture backdrop per i blend mode.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.layerBlendBackdropTexture = texture;
      this.layerBlendBackdropWidth = targetWidth;
      this.layerBlendBackdropHeight = targetHeight;

      this.registerRasterTexture(texture, {
        height: targetHeight,
        kind: "backdrop",
        label: "layer blend backdrop",
        ownerId: "layer-blend-backdrop",
        ownerType: "scratch",
        purgeable: true,
        reason: "ensure-layer-blend-backdrop-texture",
        width: targetWidth,
      });

      return texture;
    }

    copyCurrentFramebufferToLayerBlendBackdrop(width, height) {
      const gl = this.gl;
      const targetWidth = Math.max(1, Math.round(width || 1));
      const targetHeight = Math.max(1, Math.round(height || 1));
      const texture = this.ensureLayerBlendBackdropTexture(targetWidth, targetHeight);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, targetWidth, targetHeight);
      gl.activeTexture(gl.TEXTURE0);

      return texture;
    }

    deleteLayerBlendResources() {
      const gl = this.gl;

      if (this.layerBlendProgramInfo?.program) {
        gl.deleteProgram(this.layerBlendProgramInfo.program);
        this.layerBlendProgramInfo = null;
      }

      if (this.layerBlendBackdropTexture) {
        this.deleteRasterTexture(this.layerBlendBackdropTexture);
        gl.deleteTexture(this.layerBlendBackdropTexture);
        this.layerBlendBackdropTexture = null;
      }

      this.layerBlendBackdropWidth = 0;
      this.layerBlendBackdropHeight = 0;
    }

    createLayerEffectScratchTarget(width = this.width, height = this.height, resourceMetadata = {}) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error("Impossibile creare le scratch texture per gli effetti layer.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
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
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error("Scratch FBO effetti layer incompleto.");
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const target = {
        cropped: targetWidth !== this.width || targetHeight !== this.height,
        framebuffer,
        height: targetHeight,
        id: resourceMetadata.ownerId || `effect-scratch-${this.rasterTargetIdSequence++}`,
        texture,
        width: targetWidth,
        x: 0,
        y: 0,
      };

      this.registerRasterTargetResources(target, {
        height: targetHeight,
        kind: resourceMetadata.kind || "effectScratch",
        label: resourceMetadata.label || "layer effect scratch",
        ownerId: resourceMetadata.ownerId || target.id,
        ownerType: "scratch",
        purgeable: resourceMetadata.purgeable !== undefined
          ? Boolean(resourceMetadata.purgeable)
          : true,
        reason: resourceMetadata.reason || "create-layer-effect-scratch-target",
        width: targetWidth,
        ...resourceMetadata,
      });

      return target;
    }

    deleteLayerEffectTarget(target) {
      if (!target) {
        return;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        this.deleteRasterFramebuffer(target.framebuffer);
        gl.deleteFramebuffer(target.framebuffer);
        target.framebuffer = null;
      }

      if (target.texture) {
        this.deleteRasterTexture(target.texture);
        gl.deleteTexture(target.texture);
        target.texture = null;
      }

      target.framebufferResourceId = "";
      target.textureResourceId = "";
    }

    deleteLayerEffectScratchTargets() {
      this.deleteLayerEffectTarget(this.layerEffectScratchA);
      this.deleteLayerEffectTarget(this.layerEffectScratchB);
      this.layerEffectScratchA = null;
      this.layerEffectScratchB = null;
    }

    deleteGaussianBlurResources() {
      this.deleteLayerEffectScratchTargets();

      if (this.gaussianBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.gaussianBlurProgramInfo.program);
      }

      this.gaussianBlurProgramInfo = null;
    }

    deleteMotionBlurResources() {
      if (this.motionBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.motionBlurProgramInfo.program);
      }

      this.motionBlurProgramInfo = null;
    }

    deleteFieldBlurResources() {
      if (this.fieldBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.fieldBlurProgramInfo.program);
      }

      this.fieldBlurProgramInfo = null;
    }

    deleteRadialBlurResources() {
      if (this.radialBlurProgramInfo?.program) {
        this.gl.deleteProgram(this.radialBlurProgramInfo.program);
      }

      this.radialBlurProgramInfo = null;
    }

    deleteGrainResources() {
      if (this.grainProgramInfo?.program) {
        this.gl.deleteProgram(this.grainProgramInfo.program);
      }

      this.grainProgramInfo = null;
    }

    deleteThresholdResources() {
      if (this.thresholdProgramInfo?.program) {
        this.gl.deleteProgram(this.thresholdProgramInfo.program);
      }

      this.thresholdProgramInfo = null;
    }

    ensureLayerEffectScratchTargets(width = this.width, height = this.height) {
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));
      const needsScratch =
        !this.layerEffectScratchA ||
        !this.layerEffectScratchB ||
        this.layerEffectScratchA.width !== targetWidth ||
        this.layerEffectScratchA.height !== targetHeight ||
        this.layerEffectScratchB.width !== targetWidth ||
        this.layerEffectScratchB.height !== targetHeight;

      if (needsScratch) {
        this.deleteLayerEffectScratchTargets();
        this.layerEffectScratchA = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "effectScratch",
          label: "layerEffectScratchA",
          ownerId: "layerEffectScratchA",
          ownerType: "scratch",
          purgeable: true,
          reason: "layer-effect",
        });
        this.layerEffectScratchB = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "effectScratch",
          label: "layerEffectScratchB",
          ownerId: "layerEffectScratchB",
          ownerType: "scratch",
          purgeable: true,
          reason: "layer-effect",
        });
      }

      return {
        scratchA: this.layerEffectScratchA,
        scratchB: this.layerEffectScratchB,
      };
    }

    getLayerEffectWriteTarget(sourceTexture, width = this.width, height = this.height) {
      const { scratchA, scratchB } = this.ensureLayerEffectScratchTargets(width, height);

      return sourceTexture === scratchA.texture ? scratchB : scratchA;
    }

    deleteActiveStrokeScratchTarget() {
      this.deleteLayerEffectTarget(this.activeStrokeScratchTarget);
      this.activeStrokeScratchTarget = null;
    }

    ensureActiveStrokeScratchTarget(width = this.width, height = this.height) {
      const targetWidth = Math.max(1, Math.round(width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(height || this.height || 1));
      const needsScratch =
        !this.activeStrokeScratchTarget ||
        this.activeStrokeScratchTarget.width !== targetWidth ||
        this.activeStrokeScratchTarget.height !== targetHeight;

      if (needsScratch) {
        this.deleteActiveStrokeScratchTarget();
        this.activeStrokeScratchTarget = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
          kind: "strokeScratch",
          label: "active stroke scratch target",
          ownerId: "activeStrokeScratchTarget",
          ownerType: "scratch",
          purgeable: false,
          reason: "active-stroke",
        });
      }

      return this.activeStrokeScratchTarget;
    }

    renderLayerWithActiveStrokeTexture(layerTexture, strokeTexture, strokeRect = null) {
      if (!strokeTexture || !this.programInfo || !this.quad) {
        return null;
      }

      const gl = this.gl;
      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const scratch = this.ensureActiveStrokeScratchTarget(width, height);
      const { program, uniforms } = this.programInfo;
      const drawSource = (texture, documentWidth, documentHeight, originX = 0, originY = 0) => {
        if (!texture) {
          return;
        }

        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, originX, originY);
        gl.uniform2f(uniforms.drawOrigin, originX, originY);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, width, height);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, width, height);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);

      drawSource(layerTexture, width, height);

      if (strokeRect) {
        const rectWidth = Math.max(1, Math.round(strokeRect.width || width));
        const rectHeight = Math.max(1, Math.round(strokeRect.height || height));
        const rectX = Number.isFinite(strokeRect.x) ? strokeRect.x : 0;
        const rectY = Number.isFinite(strokeRect.y) ? strokeRect.y : 0;

        drawSource(strokeTexture, rectWidth, rectHeight, rectX, rectY);
      } else {
        drawSource(strokeTexture, width, height);
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return scratch;
    }

    runGaussianBlurPass({ sourceTexture, target, radius, texelStepX, texelStepY }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureGaussianBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelStep, texelStepX, texelStepY);
      gl.uniform1f(uniforms.radius, radius);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    runMotionBlurPass({ sourceTexture, target, distance, texelStepX, texelStepY }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureMotionBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.directionTexelStep, texelStepX, texelStepY);
      gl.uniform1f(uniforms.distance, distance);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    runFieldBlurPass({ sourceTexture, target, pins }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureFieldBlurProgramInfo();
      const width = Math.max(1, target.width || this.width || 1);
      const height = Math.max(1, target.height || this.height || 1);
      const pinValues = new Float32Array(MAX_FIELD_BLUR_PINS * 3);
      const normalizedPins = normalizeFieldBlurPins(pins);

      normalizedPins.forEach((pin, index) => {
        const offset = index * 3;

        pinValues[offset] = pin.x / width;
        pinValues[offset + 1] = 1 - pin.y / height;
        pinValues[offset + 2] = pin.blur;
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelSize, 1 / width, 1 / height);
      gl.uniform1i(uniforms.pinCount, normalizedPins.length);
      gl.uniform3fv(uniforms.pins, pinValues);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    runRadialBlurPass({ sourceTexture, target, amount, centerX, centerY, mode = "spin" }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureRadialBlurProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform2f(uniforms.texelSize, 1 / target.width, 1 / target.height);
      gl.uniform2f(uniforms.center, centerX, centerY);
      gl.uniform1f(uniforms.mode, normalizeRadialBlurMode(mode) === "zoom" ? 1 : 0);
      gl.uniform1f(uniforms.amount, amount);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    runGrainPass({
      sourceTexture,
      target,
      amount,
      scale,
      monochrome,
      seed,
      originX = 0,
      originY = 0,
    }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureGrainProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.amount, normalizeGrainAmount(amount));
      gl.uniform1f(uniforms.scale, normalizeGrainScale(scale));
      gl.uniform1f(uniforms.monochrome, monochrome === false ? 0 : 1);
      gl.uniform1f(uniforms.seed, Number.isFinite(Number(seed)) ? Number(seed) : 0);
      gl.uniform2f(uniforms.origin, Number.isFinite(originX) ? originX : 0, Number.isFinite(originY) ? originY : 0);
      gl.uniform2f(uniforms.size, Math.max(1, target.width || 1), Math.max(1, target.height || 1));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    runThresholdPass({ sourceTexture, target, threshold }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureThresholdProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.threshold, normalizeThresholdValue(threshold));
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    applyGaussianBlurTexture(sourceTexture, radius, options = {}) {
      const blurRadius = Number.isFinite(radius)
        ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius))
        : 0;

      if (!sourceTexture || blurRadius <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const { scratchA, scratchB } = this.ensureLayerEffectScratchTargets(width, height);
      const firstTarget = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const secondTarget = firstTarget === scratchA ? scratchB : scratchA;
      const didHorizontalPass = this.runGaussianBlurPass({
        radius: blurRadius,
        sourceTexture,
        target: firstTarget,
        texelStepX: 1 / width,
        texelStepY: 0,
      });
      const didVerticalPass = didHorizontalPass && this.runGaussianBlurPass({
        radius: blurRadius,
        sourceTexture: firstTarget.texture,
        target: secondTarget,
        texelStepX: 0,
        texelStepY: 1 / height,
      });

      return didVerticalPass ? secondTarget.texture : sourceTexture;
    }

    applyMotionBlurTexture(sourceTexture, distance, angle, options = {}) {
      const blurDistance = Number.isFinite(distance)
        ? Math.max(0, Math.min(MAX_MOTION_BLUR_DISTANCE, distance))
        : 0;

      if (!sourceTexture || blurDistance <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const angleRad = normalizeAngle(angle) * Math.PI / 180;
      const didMotionPass = this.runMotionBlurPass({
        distance: blurDistance,
        sourceTexture,
        target,
        texelStepX: Math.cos(angleRad) / width,
        texelStepY: Math.sin(angleRad) / height,
      });

      return didMotionPass ? target.texture : sourceTexture;
    }

    applyFieldBlurTexture(sourceTexture, pins, options = {}) {
      const nextPins = normalizeFieldBlurPins(pins);

      if (!sourceTexture || !hasFieldBlurAmount(nextPins)) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const originX = Number.isFinite(options.originX) ? options.originX : 0;
      const originY = Number.isFinite(options.originY) ? options.originY : 0;
      const localPins = nextPins.map((pin) => ({
        ...pin,
        x: pin.x - originX,
        y: pin.y - originY,
      }));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didFieldPass = this.runFieldBlurPass({
        pins: localPins,
        sourceTexture,
        target,
      });

      return didFieldPass ? target.texture : sourceTexture;
    }

    applyRadialBlurTexture(
      sourceTexture,
      amount,
      centerX = 50,
      centerY = 50,
      mode = "spin",
      options = {},
    ) {
      const blurAmount = Number.isFinite(amount)
        ? Math.max(0, Math.min(MAX_RADIAL_BLUR_AMOUNT, amount))
        : 0;

      if (!sourceTexture || blurAmount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const resolvedCenter = this.resolveRadialBlurCenter(centerX, centerY, {
        height,
        outputRect: options.rect || null,
        sourceRect: options.sourceRect || null,
        width,
      });
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didRadialPass = this.runRadialBlurPass({
        amount: blurAmount,
        centerX: resolvedCenter.x,
        centerY: resolvedCenter.y,
        mode,
        sourceTexture,
        target,
      });

      return didRadialPass ? target.texture : sourceTexture;
    }

    applyGrainTexture(sourceTexture, grain, options = {}) {
      const grainEffect = grain || null;
      const amount = normalizeGrainAmount(grainEffect?.amount);

      if (!sourceTexture || amount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didGrainPass = this.runGrainPass({
        amount,
        monochrome: grainEffect?.monochrome !== false,
        originX: Number.isFinite(options.originX) ? options.originX : 0,
        originY: Number.isFinite(options.originY) ? options.originY : 0,
        scale: normalizeGrainScale(grainEffect?.scale),
        seed: Number.isFinite(Number(grainEffect?.seed)) ? Number(grainEffect.seed) : 0,
        sourceTexture,
        target,
      });

      return didGrainPass ? target.texture : sourceTexture;
    }

    applyThresholdTexture(sourceTexture, threshold, options = {}) {
      if (!sourceTexture || !threshold) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didThresholdPass = this.runThresholdPass({
        sourceTexture,
        target,
        threshold: threshold.threshold,
      });

      return didThresholdPass ? target.texture : sourceTexture;
    }

    resolveRadialBlurCenter(centerX, centerY, options = {}) {
      const outputRect = options.outputRect;
      const sourceRect = options.sourceRect || outputRect;
      const width = Math.max(1, Math.round(options.width || outputRect?.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || outputRect?.height || this.height || 1));

      if (outputRect && sourceRect) {
        const centerDocX = sourceRect.x + sourceRect.width * normalizePercent(centerX) / 100;
        const centerDocY = sourceRect.y + sourceRect.height * normalizePercent(centerY) / 100;

        return {
          x: (centerDocX - outputRect.x) / width,
          y: 1 - (centerDocY - outputRect.y) / height,
        };
      }

      return {
        x: normalizePercent(centerX) / 100,
        y: 1 - normalizePercent(centerY) / 100,
      };
    }

    getRadialBlurDocumentCenter(radialBlur, sourceRect) {
      if (!radialBlur || !sourceRect) {
        return null;
      }

      return {
        x: sourceRect.x + sourceRect.width * normalizePercent(radialBlur.centerX) / 100,
        y: sourceRect.y + sourceRect.height * normalizePercent(radialBlur.centerY) / 100,
      };
    }

    includePointInBounds(bounds, point) {
      if (!bounds || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return bounds;
      }

      bounds.x1 = Math.min(bounds.x1, point.x);
      bounds.y1 = Math.min(bounds.y1, point.y);
      bounds.x2 = Math.max(bounds.x2, point.x);
      bounds.y2 = Math.max(bounds.y2, point.y);

      return bounds;
    }

    isAngleWithinRange(angle, start, end) {
      const fullTurn = Math.PI * 2;
      const normalize = (value) => {
        let next = value % fullTurn;

        if (next < 0) {
          next += fullTurn;
        }

        return next;
      };
      const nextAngle = normalize(angle);
      const nextStart = normalize(start);
      const nextEnd = normalize(end);

      return nextStart <= nextEnd
        ? nextAngle >= nextStart && nextAngle <= nextEnd
        : nextAngle >= nextStart || nextAngle <= nextEnd;
    }

    getRadialBlurOutputRect(radialBlur, inputRect, centerSourceRect = inputRect) {
      if (!radialBlur || !inputRect) {
        return inputRect || null;
      }

      const amount = Number(radialBlur.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return inputRect;
      }

      const center = this.getRadialBlurDocumentCenter(radialBlur, centerSourceRect);

      if (!center) {
        return inputRect;
      }

      const corners = [
        { x: inputRect.x, y: inputRect.y },
        { x: inputRect.x + inputRect.width, y: inputRect.y },
        { x: inputRect.x + inputRect.width, y: inputRect.y + inputRect.height },
        { x: inputRect.x, y: inputRect.y + inputRect.height },
      ];
      const bounds = {
        x1: inputRect.x,
        y1: inputRect.y,
        x2: inputRect.x + inputRect.width,
        y2: inputRect.y + inputRect.height,
      };

      if (normalizeRadialBlurMode(radialBlur.mode) === "zoom") {
        const zoomRange = Math.min(0.95, Math.max(0, amount) * 0.0025);
        const scale = 1 / Math.max(0.05, 1 - zoomRange);

        for (const corner of corners) {
          this.includePointInBounds(bounds, {
            x: center.x + (corner.x - center.x) * scale,
            y: center.y + (corner.y - center.y) * scale,
          });
        }
      } else {
        const angleRange = Math.max(0, amount) * 0.0062831853;
        const criticalAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

        for (const corner of corners) {
          const dx = corner.x - center.x;
          const dy = corner.y - center.y;
          const radius = Math.hypot(dx, dy);

          if (radius <= 0) {
            continue;
          }

          const baseAngle = Math.atan2(dy, dx);
          const start = baseAngle - angleRange;
          const end = baseAngle + angleRange;
          const candidateAngles = [start, baseAngle, end];

          for (const angle of criticalAngles) {
            if (this.isAngleWithinRange(angle, start, end)) {
              candidateAngles.push(angle);
            }
          }

          for (const angle of candidateAngles) {
            this.includePointInBounds(bounds, {
              x: center.x + Math.cos(angle) * radius,
              y: center.y + Math.sin(angle) * radius,
            });
          }
        }
      }

      return this.getClampedDocumentRect({
        x: bounds.x1,
        y: bounds.y1,
        width: bounds.x2 - bounds.x1,
        height: bounds.y2 - bounds.y1,
      }, CROPPED_TARGET_EDGE_PADDING) || inputRect;
    }

    getLayerEffectOutputRect(layer, targetRect) {
      if (!targetRect) {
        return null;
      }

      let outputRect = targetRect;
      const padding = this.getLayerEffectPadding(layer);

      if (padding > 0) {
        outputRect = this.getClampedDocumentRect(outputRect, padding) || outputRect;
      }

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false || effect.type !== "radial-blur") {
            continue;
          }

          const radialBlur = this.getLayerRadialBlur({ effects: [effect] });

          if (radialBlur) {
            outputRect = this.getRadialBlurOutputRect(radialBlur, outputRect, targetRect) || outputRect;
          }
        }
      } else {
        const radialBlur = this.getLayerRadialBlur(layer);

        if (radialBlur) {
          outputRect = this.getRadialBlurOutputRect(radialBlur, outputRect, targetRect) || outputRect;
        }
      }

      return outputRect;
    }

    getLayerEffectPadding(layer) {
      let padding = 0;

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false) {
            continue;
          }

          if (effect.type === "gaussian-blur") {
            padding = Math.max(padding, this.getGaussianBlurRadius({ effects: [effect] }));
          } else if (effect.type === "motion-blur") {
            const motionBlur = this.getLayerMotionBlur({ effects: [effect] });

            if (motionBlur) {
              padding = Math.max(padding, motionBlur.distance);
            }
          } else if (effect.type === "field-blur") {
            const fieldBlur = this.getLayerFieldBlur({ effects: [effect] });

            if (fieldBlur) {
              padding = Math.max(
                padding,
                ...fieldBlur.pins.map((pin) => Number.isFinite(pin.blur) ? pin.blur : 0),
              );
            }
          }
        }
      } else {
        const motionBlur = this.getLayerMotionBlur(layer);
        const fieldBlur = this.getLayerFieldBlur(layer);

        padding = Math.max(padding, this.getGaussianBlurRadius(layer));

        if (motionBlur) {
          padding = Math.max(padding, motionBlur.distance);
        }

        if (fieldBlur) {
          padding = Math.max(
            padding,
            ...fieldBlur.pins.map((pin) => Number.isFinite(pin.blur) ? pin.blur : 0),
          );
        }
      }

      return padding > 0
        ? Math.min(CROPPED_TARGET_EFFECT_PADDING, Math.ceil(padding + CROPPED_TARGET_EDGE_PADDING))
        : 0;
    }

    createLayerEffectPaddedSource(sourceTexture, sourceRect, outputRect) {
      if (!sourceTexture || !sourceRect || !outputRect || !this.programInfo || !this.quad?.vao) {
        return null;
      }

      const width = Math.max(1, Math.round(outputRect.width || 1));
      const height = Math.max(1, Math.round(outputRect.height || 1));
      const { scratchA } = this.ensureLayerEffectScratchTargets(width, height);

      if (!scratchA?.framebuffer || !scratchA.texture) {
        return null;
      }

      const gl = this.gl;
      const { program, uniforms } = this.programInfo;
      const offsetX = sourceRect.x - outputRect.x;
      const offsetY = sourceRect.y - outputRect.y;

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratchA.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, width, height);
      gl.uniform2f(uniforms.documentSize, sourceRect.width, sourceRect.height);
      gl.uniform2f(uniforms.cameraPosition, offsetX, offsetY);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipOrigin, 0, 0);
      gl.uniform2f(uniforms.clipTextureSize, width, height);
      gl.uniform2f(uniforms.drawOrigin, sourceRect.x, sourceRect.y);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.uniform1f(uniforms.opacity, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return {
        height,
        rect: outputRect,
        texture: scratchA.texture,
        width,
      };
    }

    applyLayerEffectsToTexture(layer, sourceTexture, options = {}) {
      if (!sourceTexture) {
        return null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const effectRect = options.rect || null;
      const sourceRect = options.sourceRect || effectRect;
      const effectOriginX = Number.isFinite(effectRect?.x) ? effectRect.x : 0;
      const effectOriginY = Number.isFinite(effectRect?.y) ? effectRect.y : 0;
      const effectOptions = {
        height,
        originX: effectOriginX,
        originY: effectOriginY,
        rect: effectRect,
        sourceRect,
        width,
      };
      let texture = sourceTexture;

      if (Array.isArray(layer?.effects)) {
        for (const effect of layer.effects) {
          if (!effect || effect.enabled === false) {
            continue;
          }

          if (effect.type === "gaussian-blur") {
            const radius = this.getGaussianBlurRadius({ effects: [effect] });

            texture = this.applyGaussianBlurTexture(texture, radius, effectOptions);
          } else if (effect.type === "motion-blur") {
            const motionBlur = this.getLayerMotionBlur({ effects: [effect] });

            if (motionBlur) {
              texture = this.applyMotionBlurTexture(texture, motionBlur.distance, motionBlur.angle, effectOptions);
            }
          } else if (effect.type === "field-blur") {
            const fieldBlur = this.getLayerFieldBlur({ effects: [effect] });

            if (fieldBlur) {
              texture = this.applyFieldBlurTexture(texture, fieldBlur.pins, effectOptions);
            }
          } else if (effect.type === "radial-blur") {
            const radialBlur = this.getLayerRadialBlur({ effects: [effect] });

            if (radialBlur) {
              texture = this.applyRadialBlurTexture(
                texture,
                radialBlur.amount,
                radialBlur.centerX,
                radialBlur.centerY,
                radialBlur.mode,
                effectOptions,
              );
            }
          } else if (effect.type === "grain") {
            const grain = this.getLayerGrain({ effects: [effect] });

            if (grain) {
              texture = this.applyGrainTexture(texture, grain, effectOptions);
            }
          } else if (effect.type === "threshold") {
            const threshold = this.getLayerThreshold({ effects: [effect] });

            if (threshold) {
              texture = this.applyThresholdTexture(texture, threshold, effectOptions);
            }
          }
        }

        return texture;
      }

      const radius = this.getGaussianBlurRadius(layer);
      const motionBlur = this.getLayerMotionBlur(layer);
      const fieldBlur = this.getLayerFieldBlur(layer);
      const radialBlur = this.getLayerRadialBlur(layer);
      const grain = this.getLayerGrain(layer);
      const threshold = this.getLayerThreshold(layer);

      if (radius > 0) {
        texture = this.applyGaussianBlurTexture(texture, radius, effectOptions);
      }

      if (motionBlur) {
        texture = this.applyMotionBlurTexture(texture, motionBlur.distance, motionBlur.angle, effectOptions);
      }

      if (fieldBlur) {
        texture = this.applyFieldBlurTexture(texture, fieldBlur.pins, effectOptions);
      }

      if (radialBlur) {
        texture = this.applyRadialBlurTexture(
          texture,
          radialBlur.amount,
          radialBlur.centerX,
          radialBlur.centerY,
          radialBlur.mode,
          effectOptions,
        );
      }

      if (grain) {
        texture = this.applyGrainTexture(texture, grain, effectOptions);
      }

      if (threshold) {
        texture = this.applyThresholdTexture(texture, threshold, effectOptions);
      }

      return texture;
    }

    getLayerRenderResult(layer, layerTarget) {
      if (!layerTarget?.texture) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(layerTarget);
      let width = Math.max(1, Math.round(layerTarget.width || this.width || 1));
      let height = Math.max(1, Math.round(layerTarget.height || this.height || 1));
      let rect = this.isCroppedRasterTarget(layerTarget) ? targetRect : null;
      let texture = layerTarget.texture;
      const paddedRect = this.isCroppedRasterTarget(layerTarget)
        ? this.getLayerEffectOutputRect(layer, targetRect)
        : targetRect;

      if (paddedRect && !this.areDocumentRectsEqual(paddedRect, targetRect)) {
        const paddedSource = this.createLayerEffectPaddedSource(texture, targetRect, paddedRect);

        if (paddedSource?.texture) {
          texture = paddedSource.texture;
          width = paddedSource.width;
          height = paddedSource.height;
          rect = paddedSource.rect;
        }
      }

      texture = this.applyLayerEffectsToTexture(layer, texture, { height, rect, sourceRect: targetRect, width });

      return {
        height,
        rect,
        texture,
        width,
      };
    }

    getLayerRenderTexture(layer, layerTarget) {
      return this.getLayerRenderResult(layer, layerTarget)?.texture || null;
    }

    resolveLayerVisualTexture(layer, layerTarget, options = {}) {
      return this.getLayerRenderTexture(layer, layerTarget, options);
    }

    getPuppetVisualTarget(layerTarget, renderResult) {
      if (!layerTarget || !renderResult?.texture || !renderResult.rect) {
        return layerTarget;
      }

      return {
        ...layerTarget,
        cropped: this.isCroppedRect(renderResult.rect),
        height: renderResult.height,
        texture: renderResult.texture,
        width: renderResult.width,
        x: renderResult.rect.x,
        y: renderResult.rect.y,
      };
    }

    copyTextureToRasterTarget(sourceTexture, target, options = {}) {
      if (!sourceTexture || !target?.framebuffer || !target?.texture) {
        return false;
      }

      const gl = this.gl;
      const readFramebuffer = gl.createFramebuffer();
      const sourceWidth = Math.max(1, Math.round(options.width || target.width || this.width || 1));
      const sourceHeight = Math.max(1, Math.round(options.height || target.height || this.height || 1));

      if (!readFramebuffer) {
        return false;
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sourceTexture, 0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);

      const canCopy =
        gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE &&
        gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

      if (canCopy) {
        gl.blitFramebuffer(
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          target.width,
          target.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.deleteFramebuffer(readFramebuffer);

      return canCopy;
    }

    configureDocumentSize(viewportWidth, viewportHeight) {
      const gl = this.gl;
      const policyCap = this.isMobileLikeDevice() ? 2048 : 4096;
      const hardwareCap = gl.getParameter(gl.MAX_TEXTURE_SIZE) || policyCap;
      const fixedWidth = this.options.documentWidth;
      const fixedHeight = this.options.documentHeight;

      if (fixedWidth && fixedHeight) {
        const cap = Math.max(1, hardwareCap);

        this.width = Math.max(1, Math.min(fixedWidth, cap));
        this.height = Math.max(1, Math.min(fixedHeight, cap));
        return;
      }

      const optionCap = this.options.documentSizeCap;
      const effectiveCap = optionCap ? Math.min(policyCap, optionCap) : policyCap;
      const cap = Math.max(1, Math.min(effectiveCap, hardwareCap));
      const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
      const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
      const aspect = safeViewportWidth / safeViewportHeight;

      if (aspect >= 1) {
        this.width = cap;
        this.height = Math.max(1, Math.round(cap / aspect));
      } else {
        this.height = cap;
        this.width = Math.max(1, Math.round(cap * aspect));
      }
    }

    isMobileLikeDevice() {
      const hasTouch = navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
      const userAgent = navigator.userAgent || "";
      const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

      return hasTouch || hasCoarsePointer || hasMobileUserAgent;
    }

    createProceduralBackgroundTarget() {
      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture procedurale per lo sfondo.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255]),
      );
      gl.bindTexture(gl.TEXTURE_2D, null);

      const target = {
        id: "background-procedural-target",
        framebuffer: null,
        texture,
        width: this.width,
        height: this.height,
        x: 0,
        y: 0,
        cropped: false,
        version: 0,
        clearColor: [1, 1, 1, 1],
        layerId: "background",
        procedural: true,
      };

      const textureRow = this.registerRasterTexture(texture, {
        bbox: {
          x: 0,
          y: 0,
          width: this.width,
          height: this.height,
        },
        height: 1,
        kind: "background",
        label: "procedural background texture",
        layerId: "background",
        ownerId: "background",
        ownerType: "live",
        purgeable: false,
        reason: "create-procedural-background-target",
        width: 1,
      });

      target.textureResourceId = textureRow?.id || "";

      return target;
    }

    createBaseLayerTarget() {
      const backgroundTarget = this.createProceduralBackgroundTarget();

      this.rasterTargetsByLayerId.set("background", backgroundTarget);
      this.paintLayerId = this.resolvePaintLayerId();
      this.texture = null;
      this.framebuffer = null;

      backgroundTarget.layerId = "background";
    }

    createRasterTarget(clearColor = [0, 0, 0, 0], options = {}) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const targetWidth = Math.max(1, Math.round(options.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(options.height || this.height || 1));
      const targetX = Number.isFinite(options.x) ? Math.round(options.x) : 0;
      const targetY = Number.isFinite(options.y) ? Math.round(options.y) : 0;
      const cropped = options.cropped === true ||
        targetX !== 0 ||
        targetY !== 0 ||
        targetWidth !== this.width ||
        targetHeight !== this.height;

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error("Impossibile creare il documento FBO in VRAM.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // MAG = NEAREST: zoomando in si vedono i pixel quadrati come in Photoshop / Procreate.
      // MIN = LINEAR: zoom out resta liscio senza moire.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
        throw new Error("Documento FBO incompleto: impossibile inizializzare la tela.");
      }

      const target = {
        id: `raster-target-${this.rasterTargetIdSequence++}`,
        framebuffer,
        texture,
        width: targetWidth,
        height: targetHeight,
        x: targetX,
        y: targetY,
        cropped,
        version: 0,
        clearColor,
      };

      this.registerRasterTargetResources(target, {
        kind: options.kind || options.resourceMetadata?.kind || "layer",
        label: options.label || options.resourceMetadata?.label || "raster target",
        layerId: options.layerId || options.resourceMetadata?.layerId || "",
        ownerId: options.ownerId || options.layerId || options.resourceMetadata?.ownerId || target.id,
        ownerType: options.ownerType || options.resourceMetadata?.ownerType || "live",
        purgeable: options.purgeable === true || options.resourceMetadata?.purgeable === true,
        reason: options.reason || options.source || options.resourceMetadata?.reason || "create-raster-target",
      });

      this.clearTarget(target);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return target;
    }

    createPaintTarget() {
      return this.createRasterTarget([0, 0, 0, 0]);
    }

    createRasterTargetForRect(rect, clearColor = [0, 0, 0, 0], padding = 0) {
      const targetRect = this.getClampedDocumentRect(rect, padding);

      if (!targetRect) {
        return null;
      }

      return this.createRasterTarget(clearColor, {
        cropped: true,
        height: targetRect.height,
        width: targetRect.width,
        x: targetRect.x,
        y: targetRect.y,
      });
    }

    resolvePaintLayerId() {
      const activeLayer = this.layerModel?.findEntryById?.(this.layerModel.activeLayerId);

      if (activeLayer?.type === "paint") {
        return activeLayer.id;
      }

      const renderablePaintLayer = this.layerModel
        ?.flattenTopToBottom?.()
        .find((layer) => layer.type === "paint");

      return renderablePaintLayer?.id || "paint-main";
    }

    getClampedDocumentRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const pad = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
      const minX = Math.max(0, Math.floor(rawX - pad));
      const minY = Math.max(0, Math.floor(rawY - pad));
      const maxX = Math.min(this.width, Math.ceil(rawX + rawWidth + pad));
      const maxY = Math.min(this.height, Math.ceil(rawY + rawHeight + pad));

      if (maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }

    getRasterTargetDocumentRect(target) {
      if (!target) {
        return null;
      }

      return {
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
        width: Math.max(1, Math.round(target.width || this.width || 1)),
        height: Math.max(1, Math.round(target.height || this.height || 1)),
      };
    }

    isCroppedRasterTarget(target) {
      const rect = this.getRasterTargetDocumentRect(target);

      return Boolean(
        target &&
        rect &&
        (
          target.cropped === true ||
          rect.x !== 0 ||
          rect.y !== 0 ||
          rect.width !== this.width ||
          rect.height !== this.height
        )
      );
    }

    isCroppedRect(rect) {
      return Boolean(
        rect &&
        (
          rect.x !== 0 ||
          rect.y !== 0 ||
          rect.width !== this.width ||
          rect.height !== this.height
        )
      );
    }

    areDocumentRectsEqual(a, b) {
      return Boolean(
        a &&
        b &&
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height
      );
    }

    getRasterTargetLocalRect(target, docRect = null) {
      const targetRect = this.getRasterTargetDocumentRect(target);
      const requested = docRect
        ? this.getClampedDocumentRect(docRect)
        : targetRect;

      if (!targetRect || !requested) {
        return null;
      }

      const x0 = Math.max(targetRect.x, requested.x);
      const y0 = Math.max(targetRect.y, requested.y);
      const x1 = Math.min(targetRect.x + targetRect.width, requested.x + requested.width);
      const y1 = Math.min(targetRect.y + targetRect.height, requested.y + requested.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        docRect: {
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
        },
        localRect: {
          x: x0 - targetRect.x,
          y: y0 - targetRect.y,
          width: x1 - x0,
          height: y1 - y0,
        },
        targetRect,
      };
    }

    markRasterTargetDirty(target) {
      if (target) {
        target.version = (target.version || 0) + 1;
      }
    }

    clearTarget(target) {
      if (!target?.framebuffer) {
        return;
      }

      const gl = this.gl;
      const clearColor = Array.isArray(target.clearColor) ? target.clearColor : [0, 0, 0, 0];

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);
    }

    clear() {
      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => this.clearTarget(target));
      this.emitContentChange({ source: "clear-document" });
    }

    clearLayer(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      this.clearTarget(target);
      if (options.emit !== false) {
        this.emitContentChange({ layerId, source: options.source || "clear-layer" });
      }

      return true;
    }

    getSnapshotRect(target, rect = null) {
      if (!target || !Number.isFinite(target.width) || !Number.isFinite(target.height)) {
        return null;
      }

      if (!rect) {
        return {
          height: Math.max(1, Math.round(target.height)),
          width: Math.max(1, Math.round(target.width)),
          x: 0,
          y: 0,
        };
      }

      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const x = Math.max(0, Math.min(target.width - 1, Math.floor(rawX)));
      const y = Math.max(0, Math.min(target.height - 1, Math.floor(rawY)));
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : target.width - x;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : target.height - y;
      const width = Math.max(1, Math.min(target.width - x, Math.ceil(rawWidth)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil(rawHeight)));

      return { x, y, width, height };
    }

    createRasterSnapshot(targetOrLayerId, rect = null, label = "raster snapshot") {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId) || this.getRasterTarget(targetOrLayerId)
        : targetOrLayerId;
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const snapshotRect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const targetRect = mappedRect?.targetRect;

      if (!target?.framebuffer || !snapshotRect || !docRect || !targetRect) {
        return null;
      }

      const layerId = typeof targetOrLayerId === "string" ? targetOrLayerId : target?.layerId || "";
      const snapshotId = `raster-snapshot-${this.rasterTargetIdSequence++}`;
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        snapshotRect.width,
        snapshotRect.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn(`Snapshot raster ${label} incompleto.`);
        return null;
      }

      const sourceX0 = snapshotRect.x;
      const sourceX1 = snapshotRect.x + snapshotRect.width;
      const sourceY0 = target.height - (snapshotRect.y + snapshotRect.height);
      const sourceY1 = target.height - snapshotRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        0,
        0,
        snapshotRect.width,
        snapshotRect.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const snapshot = {
        bytes: snapshotRect.width * snapshotRect.height * 4,
        id: snapshotId,
        framebuffer,
        label,
        layerId,
        rect: docRect,
        state: "GPU_HOT",
        targetRect,
        texture,
      };
      snapshot.dehydrateGpu = () => this.dehydrateRasterSnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateRasterSnapshot(snapshot);

      const textureRow = this.registerRasterTexture(texture, {
        bbox: docRect,
        height: snapshotRect.height,
        kind: "historySnapshot",
        label,
        layerId,
        originX: docRect.x,
        originY: docRect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width: snapshotRect.width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        height: snapshotRect.height,
        kind: "historySnapshotFramebuffer",
        label: `${label} framebuffer`,
        layerId,
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        width: snapshotRect.width,
      });

      return snapshot;
    }

    getRasterSnapshotDimensions(snapshot) {
      const rect = snapshot?.rect || snapshot?.targetRect || null;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      return { height, width };
    }

    dehydrateRasterSnapshot(snapshot) {
      if (!snapshot?.framebuffer || snapshot.state === "CPU_COLD") {
        return snapshot?.state === "CPU_COLD";
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const pixels = new Uint8Array(width * height * 4);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        console.warn?.("[CBO renderer] Impossibile raffreddare snapshot raster.", error);
        return false;
      }

      this.deleteRasterFramebuffer(snapshot.framebuffer);
      gl.deleteFramebuffer(snapshot.framebuffer);
      snapshot.framebuffer = null;

      if (snapshot.texture) {
        this.deleteRasterTexture(snapshot.texture);
        gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      snapshot.bytes = snapshot.bytes || pixels.byteLength;
      snapshot.cpuBytes = pixels.byteLength;
      snapshot.cpuPixels = pixels;
      snapshot.state = "CPU_COLD";

      return true;
    }

    hydrateRasterSnapshot(snapshot) {
      if (!snapshot || snapshot.texture || snapshot.framebuffer) {
        return Boolean(snapshot?.texture && snapshot?.framebuffer);
      }

      if (!(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, snapshot.cpuPixels);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      snapshot.framebuffer = framebuffer;
      snapshot.texture = texture;
      snapshot.state = "GPU_HOT";

      const layerId = snapshot.layerId || "";
      const textureRow = this.registerRasterTexture(texture, {
        bbox: snapshot.rect,
        height,
        kind: "historySnapshot",
        label: snapshot.label || "raster snapshot",
        layerId,
        originX: snapshot.rect?.x,
        originY: snapshot.rect?.y,
        ownerId: snapshot.id || this.nextRasterTargetId?.() || "raster-snapshot",
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "raster snapshot",
        state: "GPU_HOT",
        width,
      });

      this.registerRasterFramebuffer(framebuffer, {
        height,
        kind: "historySnapshotFramebuffer",
        label: `${snapshot.label || "raster snapshot"} framebuffer`,
        layerId,
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshot.id || "",
        ownerType: "historyGpu",
        purgeable: false,
        reason: snapshot.label || "raster snapshot",
        width,
      });

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;

      return true;
    }

    canRestoreRasterSnapshot(target, snapshot) {
      const mappedRect = this.getRasterTargetLocalRect(target, snapshot?.rect);
      const rect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const snapshotRect = snapshot?.rect;

      return Boolean(
        target?.framebuffer &&
        snapshot?.framebuffer &&
        rect &&
        docRect &&
        snapshotRect &&
        docRect.x === snapshotRect.x &&
        docRect.y === snapshotRect.y &&
        docRect.width === snapshotRect.width &&
        docRect.height === snapshotRect.height &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= target.width &&
        rect.y + rect.height <= target.height
      );
    }

    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      if (!layerId || !snapshot) {
        return false;
      }

      if ((!snapshot.texture || !snapshot.framebuffer) && !this.hydrateRasterSnapshot(snapshot)) {
        return false;
      }

      let target = this.getRasterTarget(layerId);
      const snapshotTargetRect = snapshot.targetRect;
      const targetRect = this.getRasterTargetDocumentRect(target);

      if (
        snapshotTargetRect &&
        (
          targetRect.x !== snapshotTargetRect.x ||
          targetRect.y !== snapshotTargetRect.y ||
          targetRect.width !== snapshotTargetRect.width ||
          targetRect.height !== snapshotTargetRect.height
        ) &&
        snapshot.rect?.x === snapshotTargetRect.x &&
        snapshot.rect?.y === snapshotTargetRect.y &&
        snapshot.rect?.width === snapshotTargetRect.width &&
        snapshot.rect?.height === snapshotTargetRect.height
      ) {
        const nextTarget = this.createRasterTarget([0, 0, 0, 0], {
          cropped: this.isCroppedRect(snapshotTargetRect),
          height: snapshotTargetRect.height,
          width: snapshotTargetRect.width,
          x: snapshotTargetRect.x,
          y: snapshotTargetRect.y,
        });

        const gl = this.gl;

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, nextTarget.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          snapshotTargetRect.width,
          snapshotTargetRect.height,
          0,
          0,
          nextTarget.width,
          nextTarget.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        this.markRasterTargetDirty(nextTarget);
        this.replaceRasterTarget(layerId, nextTarget, {
          emit: false,
          source: options.source || "raster-snapshot-target-swap",
        });
        target = nextTarget;
      }

      if (!this.canRestoreRasterSnapshot(target, snapshot)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: options.source || "raster-snapshot-materialize",
        });
      }

      if (!this.canRestoreRasterSnapshot(target, snapshot)) {
        return false;
      }

      const gl = this.gl;
      const rect = snapshot.rect;
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const localRect = mappedRect.localRect;
      const x0 = localRect.x;
      const x1 = localRect.x + localRect.width;
      const y0 = target.height - (localRect.y + localRect.height);
      const y1 = target.height - localRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(0, 0, localRect.width, localRect.height, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);

      if (options.emit !== false) {
        this.emitContentChange({
          layerId,
          source: options.source || "raster-snapshot-restore",
        });
      }

      return true;
    }

    deleteRasterSnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      if (snapshot?.framebuffer) {
        this.deleteRasterFramebuffer(snapshot.framebuffer);
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
      }

      if (snapshot?.texture) {
        this.deleteRasterTexture(snapshot.texture);
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.state = "DELETED";
    }

    deleteRasterTargetObject(target) {
      if (!target) {
        return;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        this.deleteRasterFramebuffer(target.framebuffer);
        gl.deleteFramebuffer(target.framebuffer);
        target.framebuffer = null;
      }

      if (target.texture) {
        this.deleteRasterTexture(target.texture);
        gl.deleteTexture(target.texture);
        target.texture = null;
      }

      target.framebufferResourceId = "";
      target.textureResourceId = "";
    }

    replaceRasterTarget(layerId, nextTarget, options = {}) {
      if (!layerId || !nextTarget?.framebuffer || !nextTarget?.texture) {
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);
      const nextKind =
        layerId === "background"
          ? "background"
          : this.isPaintRasterLayer(layerId, nextTarget)
            ? "paintTarget"
            : "layer";

      nextTarget.layerId = layerId;
      this.updateRasterTargetResourceMetadata(nextTarget, {
        kind: nextKind,
        label: options.label || layerId,
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: options.source || "replace-raster-target",
      });

      this.rasterTargetsByLayerId.set(layerId, nextTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = nextTarget.texture;
        this.framebuffer = nextTarget.framebuffer;
      }

      if (previousTarget && previousTarget !== nextTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      this.invalidatePreviewCache(options.source || "replace-raster-target");

      if (options.emit !== false) {
        this.emitContentChange({
          layerId,
          source: options.source || "replace-raster-target",
        });
      }

      return true;
    }

    materializeRasterTarget(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target?.texture || !target?.framebuffer) {
        return this.getRasterTarget(layerId);
      }

      if (!this.isCroppedRasterTarget(target)) {
        return {
          ...target,
          layerId,
        };
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const oldBytes = this.estimateRasterTargetBytes(target);
      const newBytes = Math.max(1, Math.round(this.width || 1)) *
        Math.max(1, Math.round(this.height || 1)) *
        4;
      const fullTarget = this.createRasterTarget(target.clearColor || [0, 0, 0, 0], {
        cropped: false,
        height: this.height,
        width: this.width,
        x: 0,
        y: 0,
      });
      const destQuad = [
        { x: targetRect.x, y: targetRect.y },
        { x: targetRect.x + targetRect.width, y: targetRect.y },
        { x: targetRect.x + targetRect.width, y: targetRect.y + targetRect.height },
        { x: targetRect.x, y: targetRect.y + targetRect.height },
      ];
      const didDraw = this.drawTexturedQuad(target.texture, destQuad, {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: 0,
        framebuffer: fullTarget.framebuffer,
        opacity: 1,
        viewportHeight: fullTarget.height,
        viewportWidth: fullTarget.width,
      });

      if (!didDraw) {
        this.deleteRasterTargetObject(fullTarget);
        return {
          ...target,
          layerId,
        };
      }

      this.markRasterTargetDirty(fullTarget);
      this.getRasterResourceManager()?.recordFullCanvasMaterialization?.({
        bytesAdded: Math.max(0, newBytes - oldBytes),
        layerId,
        newSize: {
          height: this.height,
          width: this.width,
        },
        oldBBox: targetRect,
        reason: options.reason || options.source || "materialize-raster-target",
        stackTag: options.stackTag || "",
        tool: options.tool || options.source || "materializeRasterTarget",
      });
      this.replaceRasterTarget(layerId, fullTarget, {
        emit: options.emit,
        source: options.source || "materialize-raster-target",
      });

      return {
        ...fullTarget,
        layerId,
      };
    }

    requestDraw() {
      if (namespace.brushEngine?.requestDraw) {
        namespace.brushEngine.requestDraw();
      } else {
        namespace.brushEngine?.draw?.();
      }
    }

    setRasterTransformPreview(preview = null) {
      const transformMode = String(preview?.transformMode || "free").trim().toLowerCase() || "free";
      const warpControlPoints = transformMode === "warp"
        ? this.normalizeRasterWarpControlPoints(preview?.warpControlPoints)
        : null;

      if (!preview?.layerId || !preview?.texture || !Array.isArray(preview.quad) || (transformMode === "warp" && !warpControlPoints)) {
        this.rasterTransformPreview = null;
      } else {
        this.rasterTransformPreview = {
          layerId: preview.layerId,
          edgeFeatherPixels: this.getRasterTransformEdgeFeatherPixels(preview),
          opacity: Number.isFinite(preview.opacity) ? Math.min(1, Math.max(0, preview.opacity)) : 1,
          quad: preview.quad.map((point) => ({
            x: Number.isFinite(point?.x) ? point.x : 0,
            y: Number.isFinite(point?.y) ? point.y : 0,
          })),
          sourceRect: preview.sourceRect ? { ...preview.sourceRect } : null,
          texture: preview.texture,
          transformMode,
          warpControlPoints,
        };
        this.updateRasterTexture(preview.texture, {
          bbox: preview.sourceRect || null,
          height: preview.sourceRect?.height,
          kind: "transformPreview",
          label: "raster transform preview",
          layerId: preview.layerId,
          ownerId: `transform-preview-${preview.layerId}`,
          ownerType: "scratch",
          purgeable: true,
          reason: "set-raster-transform-preview",
          width: preview.sourceRect?.width,
        });
      }

      this.requestDraw();
    }

    clearRasterTransformPreview(layerId = "") {
      if (!this.rasterTransformPreview) {
        return;
      }

      if (!layerId || this.rasterTransformPreview.layerId === layerId) {
        this.rasterTransformPreview = null;
        this.requestDraw();
      }
    }

    getRasterContentBounds(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target?.framebuffer || !target?.texture) {
        return null;
      }

      const bounds = namespace.documentBounds;
      const targetWidth = Math.max(1, Math.round(target.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(target.height || this.height || 1));
      const sampleCols = Math.max(16, Math.min(512, Math.floor(options.sampleCols || 256)));
      const sampleRows = Math.max(16, Math.min(512, Math.floor(options.sampleRows || 256)));
      const alphaThreshold = Number.isFinite(options.alphaThreshold)
        ? Math.max(0, Math.min(255, options.alphaThreshold))
        : 2;
      const pixelPerfect = options.pixelPerfect === true;
      let coarseRect = null;

      if (pixelPerfect) {
        coarseRect = { x: 0, y: 0, width: targetWidth, height: targetHeight };
      } else {
        const samples = this.getPuppetAlphaSamples(target, sampleCols, sampleRows);
        let minCol = sampleCols;
        let minRow = sampleRows;
        let maxCol = -1;
        let maxRow = -1;

        for (let row = 0; row < sampleRows; row += 1) {
          for (let col = 0; col < sampleCols; col += 1) {
            if (samples[row * sampleCols + col] > alphaThreshold) {
              minCol = Math.min(minCol, col);
              minRow = Math.min(minRow, row);
              maxCol = Math.max(maxCol, col);
              maxRow = Math.max(maxRow, row);
            }
          }
        }

        if (maxCol < 0 || maxRow < 0) {
          return null;
        }

        const padCells = Number.isFinite(options.padCells) ? Math.max(0, Math.floor(options.padCells)) : 2;
        const paddedMinCol = Math.max(0, minCol - padCells);
        const paddedMinRow = Math.max(0, minRow - padCells);
        const paddedMaxCol = Math.min(sampleCols - 1, maxCol + padCells);
        const paddedMaxRow = Math.min(sampleRows - 1, maxRow + padCells);
        const cellWidth = targetWidth / sampleCols;
        const cellHeight = targetHeight / sampleRows;
        coarseRect = bounds?.getClampedRasterBox?.({
          x: paddedMinCol * cellWidth,
          y: paddedMinRow * cellHeight,
          width: (paddedMaxCol - paddedMinCol + 1) * cellWidth,
          height: (paddedMaxRow - paddedMinRow + 1) * cellHeight,
        }, targetWidth, targetHeight);
      }

      if (!coarseRect) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);

      if (options.coarseOnly === true) {
        return bounds?.getClampedRasterBox?.({
          x: targetRect.x + coarseRect.x,
          y: targetRect.y + coarseRect.y,
          width: coarseRect.width,
          height: coarseRect.height,
        }, this.width, this.height) || null;
      }

      const gl = this.gl;
      const pixels = new Uint8Array(coarseRect.width * coarseRect.height * 4);
      const readY = targetHeight - (coarseRect.y + coarseRect.height);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.readPixels(coarseRect.x, readY, coarseRect.width, coarseRect.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

      let minX = coarseRect.width;
      let minY = coarseRect.height;
      let maxX = -1;
      let maxY = -1;

      for (let row = 0; row < coarseRect.height; row += 1) {
        for (let col = 0; col < coarseRect.width; col += 1) {
          const alpha = pixels[(row * coarseRect.width + col) * 4 + 3];

          if (alpha > alphaThreshold) {
            minX = Math.min(minX, col);
            minY = Math.min(minY, row);
            maxX = Math.max(maxX, col);
            maxY = Math.max(maxY, row);
          }
        }
      }

      if (maxX < 0 || maxY < 0) {
        return null;
      }

      const topDownMinY = coarseRect.height - 1 - maxY;
      const topDownMaxY = coarseRect.height - 1 - minY;
      const padding = Number.isFinite(options.padding) ? Math.max(0, Math.floor(options.padding)) : 2;

      const localBounds = bounds?.getClampedRasterBox?.({
        x: coarseRect.x + minX - padding,
        y: coarseRect.y + topDownMinY - padding,
        width: maxX - minX + 1 + padding * 2,
        height: topDownMaxY - topDownMinY + 1 + padding * 2,
      }, targetWidth, targetHeight);

      if (!localBounds) {
        return null;
      }

      return bounds?.getClampedRasterBox?.({
        x: targetRect.x + localBounds.x,
        y: targetRect.y + localBounds.y,
        width: localBounds.width,
        height: localBounds.height,
      }, this.width, this.height) || null;
    }

    isPaintRasterLayer(layerId, target = null) {
      const layer = layerId ? this.layerModel?.findEntryById?.(layerId) : null;

      return Boolean(
        layer?.type === "paint" ||
        layerId === this.paintLayerId ||
        String(layerId || target?.layerId || "").startsWith("paint-")
      );
    }

    estimatePaintTargetCropPotential(options = {}) {
      const documentBytes = this.getRasterRectBytes(this.width, this.height);
      const minSavingsBytes = Math.max(0, Number(options.minSavingsMiB ?? 8) || 0) * RASTER_MIB;
      const maxCropCoverage = Number.isFinite(options.maxCropCoverage)
        ? Math.min(1, Math.max(0, Number(options.maxCropCoverage)))
        : 0.8;
      const precise = options.precise === true;
      const rows = [];

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (!target?.framebuffer || !target?.texture || !this.isPaintRasterLayer(layerId, target)) {
          continue;
        }

        const currentBytes = this.estimateRasterTargetBytes(target);
        const isFullCanvas = !this.isCroppedRasterTarget(target);
        const contentRect = this.getRasterContentBounds(layerId, {
          alphaThreshold: options.alphaThreshold,
          coarseOnly: !precise,
          padding: options.padding,
          padCells: options.padCells,
          sampleCols: options.sampleCols,
          sampleRows: options.sampleRows,
        });
        const croppedBytes = contentRect ? this.getRasterRectBytes(contentRect) : 0;
        const savingsBytes = Math.max(0, currentBytes - croppedBytes);
        const contentCoverage = documentBytes > 0 ? croppedBytes / documentBytes : 0;
        const action = !contentRect
          ? "empty-target"
          : !isFullCanvas
            ? "already-cropped"
            : savingsBytes >= minSavingsBytes && contentCoverage <= maxCropCoverage
              ? "crop-candidate"
              : "keep-full";

        rows.push({
          action,
          contentCoverage: Number(contentCoverage.toFixed(6)),
          contentRect: contentRect ? { ...contentRect } : null,
          currentBytes,
          currentMiB: this.formatRasterMiB(currentBytes),
          estimatedCroppedBytes: croppedBytes,
          estimatedCroppedMiB: this.formatRasterMiB(croppedBytes),
          isFullCanvas,
          layerId,
          mode: precise ? "precise" : "sampled",
          savingsBytes,
          savingsMiB: this.formatRasterMiB(savingsBytes),
        });
      }

      rows.sort((first, second) => second.savingsBytes - first.savingsBytes);

      const candidates = rows.filter((row) => row.action === "crop-candidate" || row.action === "empty-target");
      const potentialSavingsBytes = candidates.reduce((sum, row) => sum + row.savingsBytes, 0);

      return {
        candidateCount: candidates.length,
        generatedAt: new Date().toISOString(),
        mode: precise ? "precise" : "sampled",
        paintTargetCount: rows.length,
        potentialSavingsBytes,
        potentialSavingsMiB: this.formatRasterMiB(potentialSavingsBytes),
        rows,
      };
    }

    copyRasterTargetRectToTarget(sourceTarget, docRect, destinationTarget) {
      const mappedRect = this.getRasterTargetLocalRect(sourceTarget, docRect);
      const sourceRect = mappedRect?.localRect;

      if (!sourceTarget?.framebuffer || !destinationTarget?.framebuffer || !sourceRect) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        0,
        0,
        destinationTarget.width,
        destinationTarget.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }

    duplicateRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      if (!sourceLayerId || !destinationLayerId || sourceLayerId === destinationLayerId) {
        return false;
      }

      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);
      const sourceRect = this.getRasterTargetDocumentRect(sourceTarget);

      if (!sourceTarget?.framebuffer || !sourceTarget?.texture || !sourceRect) {
        return false;
      }

      const clearColor = Array.isArray(sourceTarget.clearColor)
        ? [...sourceTarget.clearColor]
        : [0, 0, 0, 0];
      const destinationTarget = this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRasterTarget(sourceTarget),
        height: sourceRect.height,
        layerId: destinationLayerId,
        reason: options.source || "duplicate-raster-target",
        width: sourceRect.width,
        x: sourceRect.x,
        y: sourceRect.y,
      });

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        return false;
      }

      if (!this.copyRasterTargetRectToTarget(sourceTarget, sourceRect, destinationTarget)) {
        this.deleteRasterTargetObject(destinationTarget);
        return false;
      }

      const didReplace = this.replaceRasterTarget(destinationLayerId, destinationTarget, {
        emit: options.emit,
        label: options.label || destinationLayerId,
        source: options.source || "duplicate-raster-target",
      });

      if (!didReplace) {
        this.deleteRasterTargetObject(destinationTarget);
      }

      return didReplace;
    }

    compactPaintTargetToContent(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target?.framebuffer || !target?.texture || !this.isPaintRasterLayer(layerId, target)) {
        return null;
      }

      const currentBytes = this.estimateRasterTargetBytes(target);
      const isFullCanvas = !this.isCroppedRasterTarget(target);
      const minSavingsBytes = Math.max(0, Number(options.minSavingsMiB ?? 8) || 0) * RASTER_MIB;
      const maxCropCoverage = Number.isFinite(options.maxCropCoverage)
        ? Math.min(1, Math.max(0, Number(options.maxCropCoverage)))
        : 0.8;
      const contentRect = options.contentRect || this.getRasterContentBounds(layerId, {
        alphaThreshold: options.alphaThreshold,
        coarseOnly: options.precise !== true,
        padding: options.padding,
        padCells: options.padCells,
        sampleCols: options.sampleCols,
        sampleRows: options.sampleRows,
      });

      if (!contentRect) {
        const didDelete = layerId !== this.paintLayerId && this.deleteRasterTarget(layerId, {
          emit: false,
          source: options.source || "compact-empty-paint-target",
        });

        return {
          action: didDelete ? "deleted-empty" : "empty-kept",
          bytesAfter: didDelete ? 0 : currentBytes,
          bytesBefore: currentBytes,
          layerId,
          savingsBytes: didDelete ? currentBytes : 0,
        };
      }

      const croppedBytes = this.getRasterRectBytes(contentRect);
      const savingsBytes = Math.max(0, currentBytes - croppedBytes);
      const coverage = this.getRasterOperationCoverage(contentRect);

      if (!isFullCanvas || savingsBytes < minSavingsBytes || coverage > maxCropCoverage) {
        return {
          action: "skipped",
          bytesAfter: currentBytes,
          bytesBefore: currentBytes,
          contentRect: { ...contentRect },
          layerId,
          savingsBytes: 0,
        };
      }

      const nextTarget = this.createRasterTargetForRect(contentRect, target.clearColor || [0, 0, 0, 0]);

      if (!nextTarget?.framebuffer || !nextTarget?.texture) {
        return null;
      }

      if (!this.copyRasterTargetRectToTarget(target, contentRect, nextTarget)) {
        this.deleteRasterTargetObject(nextTarget);
        return null;
      }

      const didReplace = this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        source: options.source || "compact-paint-target",
      });

      if (!didReplace) {
        this.deleteRasterTargetObject(nextTarget);
        return null;
      }

      const recorded = this.recordRasterOperation({
        afterBytes: croppedBytes,
        beforeBytes: currentBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes: currentBytes + croppedBytes,
        historyBytes: 0,
        layerId,
        operationType: "paint-target-compact",
        persistentBytes: croppedBytes,
        policy: this.classifyRasterOperationMemory(currentBytes + croppedBytes, coverage),
        reason: options.source || "compact-paint-target",
        source: options.source || "compact-paint-target",
        sourceBytes: currentBytes,
        sourceRect: this.getRasterTargetDocumentRect(target),
        targetBytes: croppedBytes,
        targetRect: contentRect,
        tool: "paint-target-compact",
      });

      return {
        action: "compacted",
        bytesAfter: croppedBytes,
        bytesBefore: currentBytes,
        contentRect: { ...contentRect },
        layerId,
        memoryPolicy: recorded,
        savingsBytes,
      };
    }

    compactInactivePaintTargets(options = {}) {
      const activeLayerId = options.excludeLayerId ||
        this.layerModel?.activeLayerId ||
        this.paintLayerId ||
        "";
      const includeActive = options.includeActive === true;
      const maxTargets = Math.max(1, Math.floor(Number(options.maxTargets) || 64));
      const results = [];

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (results.length >= maxTargets) {
          break;
        }

        if (!includeActive && layerId === activeLayerId) {
          continue;
        }

        if (!this.isPaintRasterLayer(layerId, target) || !target?.texture || !target?.framebuffer) {
          continue;
        }

        const result = this.compactPaintTargetToContent(layerId, {
          ...options,
          source: options.source || "compact-inactive-paint-target",
        });

        if (result) {
          results.push(result);
        }
      }

      const summary = {
        compactedCount: results.filter((result) => result.action === "compacted").length,
        deletedEmptyCount: results.filter((result) => result.action === "deleted-empty").length,
        generatedAt: new Date().toISOString(),
        results,
        savingsBytes: results.reduce((sum, result) => sum + (Number(result.savingsBytes) || 0), 0),
      };

      summary.savingsMiB = this.formatRasterMiB(summary.savingsBytes);
      namespace.lastPaintTargetCompaction = summary;

      return summary;
    }

    clearRasterRect(layerId, rect) {
      if (!layerId || !rect) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const clearRect = mappedRect?.localRect;

      if (!target?.framebuffer || !clearRect) {
        return false;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(clearRect.x, target.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.markRasterTargetDirty(target);

      return true;
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

    createRasterEditLayerStateHistoryEntry(baseEntry, options = {}) {
      const {
        afterState,
        beforeState,
        history,
        layerId,
        source = baseEntry?.source || "raster-edit",
      } = options;

      if (
        !baseEntry ||
        !history ||
        typeof history.restoreLayerState !== "function" ||
        !this.layerModel ||
        !beforeState ||
        !afterState
      ) {
        return baseEntry;
      }

      const before = this.cloneValue(beforeState);
      const after = this.cloneValue(afterState);

      return {
        ...baseEntry,
        afterActiveLayerId: after.activeLayerId || null,
        afterEntries: after.entries,
        afterReferenceLayerId: after.referenceLayerId || null,
        beforeActiveLayerId: before.activeLayerId || null,
        beforeEntries: before.entries,
        beforeReferenceLayerId: before.referenceLayerId || null,
        layerId,
        source,
        undo: () => {
          const didRestorePixels = baseEntry.undo?.() !== false;

          if (!didRestorePixels) {
            return false;
          }

          return history.restoreLayerState(this.layerModel, before, {
            source: `history-undo-${source}-layer-state`,
          });
        },
        redo: () => {
          const didRestorePixels = baseEntry.redo?.() !== false;

          if (!didRestorePixels) {
            return false;
          }

          const didRestoreState = history.restoreLayerState(this.layerModel, after, {
            source: `history-redo-${source}-layer-state`,
          });

          if (!didRestoreState) {
            baseEntry.undo?.();
          }

          return didRestoreState;
        },
        destroy: () => {
          baseEntry.destroy?.();
        },
      };
    }

    finalizeRasterEditHistoryEntry(layerId, entry, options = {}) {
      const source = options.source || entry?.source || "raster-edit";
      const history = namespace.documentHistory;
      const layer = layerId ? this.layerModel?.findEntryById?.(layerId) : null;

      if (layer?.type !== "image" || layer.locked === true) {
        return entry;
      }

      history?.flushLayerState?.(this.layerModel);
      const beforeState = history?.getLayerSnapshot?.(this.layerModel) || null;
      const didRasterize = this.layerModel?.rasterizeImageLayerToPaint?.(layer.id, {
        history: false,
        source,
      });

      if (!didRasterize) {
        return entry;
      }

      const afterState = history?.getLayerSnapshot?.(this.layerModel) || null;

      window.dispatchEvent(new CustomEvent("cbo:image-layer-rasterized", {
        detail: {
          layerId: layer.id,
          source,
        },
      }));

      return this.createRasterEditLayerStateHistoryEntry(entry, {
        afterState,
        beforeState,
        history,
        layerId: layer.id,
        source,
      });
    }

    commitCroppedRasterTransform(options = {}) {
      const {
        destQuad,
        destRect,
        layerId,
        source = "raster-transform",
        sourceSnapshot,
        transformMode = "free",
        warpControlPoints,
      } = options;
      const target = this.rasterTargetsByLayerId.get(layerId);
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);
      const nextRect = this.getClampedDocumentRect(
        destDirtyRect || destRect,
        CROPPED_TARGET_EDGE_PADDING,
      );

      if (!target?.framebuffer || !sourceSnapshot?.texture || !nextRect) {
        return false;
      }

      const beforeSnapshot = this.createRasterSnapshot(target, null, `${source}-before-target`);

      if (!beforeSnapshot?.texture) {
        return false;
      }

      const nextTarget = this.createRasterTargetForRect(nextRect);

      if (!nextTarget?.framebuffer) {
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const localDestQuad = destQuad.map((point) => ({
        x: point.x - nextRect.x,
        y: point.y - nextRect.y,
      }));
      const normalizedTransformMode = String(transformMode).trim().toLowerCase();
      const localWarpControlPoints = normalizedTransformMode === "warp"
        ? this.offsetRasterWarpControlPoints(warpControlPoints, -nextRect.x, -nextRect.y)
        : null;
      const drawOptions = {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: options.edgeFeatherPixels,
        framebuffer: nextTarget.framebuffer,
        opacity: 1,
        viewportHeight: nextTarget.height,
        viewportWidth: nextTarget.width,
      };
      const didDraw = normalizedTransformMode === "warp"
        ? this.drawWarpTexturedMesh(sourceSnapshot.texture, localWarpControlPoints, drawOptions)
        : normalizedTransformMode === "perspective"
          ? this.drawPerspectiveTexturedQuad(sourceSnapshot.texture, localDestQuad, drawOptions)
          : this.drawTexturedQuad(sourceSnapshot.texture, localDestQuad, drawOptions);

      if (!didDraw) {
        this.deleteRasterTargetObject(nextTarget);
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      this.markRasterTargetDirty(nextTarget);

      const afterSnapshot = this.createRasterSnapshot(nextTarget, null, `${source}-after-target`);

      if (!afterSnapshot?.texture) {
        this.deleteRasterTargetObject(nextTarget);
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const currentTargetRect = this.getRasterTargetDocumentRect(target);
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const targetBytes = this.estimateRasterTargetBytes(nextTarget);
      const scratchBytes = this.estimateRasterSnapshotBytes(sourceSnapshot);

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterSnapshot,
        beforeSnapshot,
        estimatedPeakBytes:
          sourceBytes +
          targetBytes +
          scratchBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot) +
          this.estimateRasterSnapshotBytes(afterSnapshot),
        layerId,
        mode: transformMode,
        operationType: "raster-transform",
        persistentBytes:
          targetBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot) +
          this.estimateRasterSnapshotBytes(afterSnapshot),
        reason: source,
        scratchBytes,
        source,
        sourceBytes,
        sourceRect: currentTargetRect,
        targetBytes,
        targetRect: nextRect,
        tool: "raster-transform",
      }));

      this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        source,
      });

      const history = namespace.documentHistory;
      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        type: "custom",
        afterSnapshot,
        beforeSnapshot,
        layerId,
        memoryPolicy,
        source,
        undo: () => this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          source: `history-undo-${source}`,
        }),
        redo: () => this.restoreRasterSnapshot(layerId, afterSnapshot, {
          source: `history-redo-${source}`,
        }),
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(afterSnapshot);
        },
      }, { source });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.emitContentChange({ layerId, source });
      this.requestDraw();

      return true;
    }

    commitRasterTransform(options = {}) {
      const {
        destQuad,
        layerId,
        source = "raster-transform",
        sourceRect,
        sourceSnapshot,
        transformMode = "free",
        warpControlPoints,
      } = options;
      const target = this.rasterTargetsByLayerId.get(layerId);
      const bounds = namespace.documentBounds;
      const normalizedTransformMode = String(transformMode).trim().toLowerCase();

      if (!bounds) {
        return false;
      }

      const destBounds = normalizedTransformMode === "warp"
        ? bounds?.rectToBounds?.(this.getRasterWarpBounds(warpControlPoints))
        : bounds?.quadToBounds?.(destQuad);
      const destRect = bounds?.boundsToRect?.(destBounds);
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);

      if (this.isCroppedRasterTarget(target)) {
        return this.commitCroppedRasterTransform({
          ...options,
          destRect,
        });
      }

      const dirtyRect = bounds?.getClampedRasterBox?.(
        bounds.getUnionRect(sourceRect, destDirtyRect || destRect),
        target?.width,
        target?.height,
      );

      if (!target?.framebuffer || !sourceSnapshot?.texture || !sourceRect || !dirtyRect) {
        return false;
      }

      const tileHistory = this.beginRasterTileHistory(layerId, dirtyRect, {
        label: source,
        source,
      });
      const beforeSnapshot = tileHistory
        ? null
        : this.createRasterSnapshot(layerId, dirtyRect, `${source}-before`);

      if (!tileHistory && !beforeSnapshot?.texture) {
        return false;
      }

      this.clearRasterRect(layerId, sourceRect);

      const drawOptions = {
        camera: { x: 0, y: 0, zoom: 1 },
        edgeFeatherPixels: options.edgeFeatherPixels,
        framebuffer: target.framebuffer,
        opacity: 1,
        viewportHeight: target.height,
        viewportWidth: target.width,
      };
      const didDraw = String(transformMode).trim().toLowerCase() === "perspective"
        ? this.drawPerspectiveTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions)
        : normalizedTransformMode === "warp"
          ? this.drawWarpTexturedMesh(sourceSnapshot.texture, warpControlPoints, drawOptions)
          : this.drawTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions);

      if (!didDraw) {
        if (tileHistory) {
          this.restoreRasterTileHistoryEntry(tileHistory, "before", {
            emit: false,
            source: `${source}-rollback`,
          });
          this.deleteRasterTileHistoryCapture(tileHistory);
        } else {
          this.restoreRasterSnapshot(layerId, beforeSnapshot, {
            emit: false,
            source: `${source}-rollback`,
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }
        return false;
      }

      if (tileHistory) {
        const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
          afterRect: dirtyRect,
          beforeRect: dirtyRect,
          layerId,
          mode: transformMode,
          operationType: "raster-transform",
          persistentBytes: this.getRasterRectBytes(dirtyRect) * 2,
          reason: source,
          scratchBytes: 0,
          source,
          sourceBytes: this.estimateRasterSnapshotBytes(sourceSnapshot),
          sourceRect,
          targetBytes: this.getRasterRectBytes(dirtyRect),
          targetRect: dirtyRect,
          tool: "raster-transform",
        }));
        const tileEntry = this.commitRasterTileHistory(tileHistory, {
          label: source,
          memoryPolicy,
          redoSource: `history-redo-${source}`,
          source,
          type: "custom",
          undoSource: `history-undo-${source}`,
        });

        if (!tileEntry) {
          this.restoreRasterTileHistoryEntry(tileHistory, "before", {
            emit: false,
            source: `${source}-rollback`,
          });
          this.deleteRasterTileHistoryCapture(tileHistory);
          return false;
        }

        const entry = this.finalizeRasterEditHistoryEntry(layerId, tileEntry, { source });
        const history = namespace.documentHistory;

        if (history?.push) {
          history.push(entry);
        } else {
          entry.destroy();
        }

        this.clearRasterTransformPreview(layerId);
        this.emitContentChange({ layerId, source });
        this.requestDraw();

        return true;
      }

      const afterSnapshot = this.createRasterSnapshot(layerId, dirtyRect, `${source}-after`);

      if (!afterSnapshot?.texture) {
        this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          emit: false,
          source: `${source}-rollback`,
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterSnapshot,
        beforeSnapshot,
        layerId,
        mode: transformMode,
        operationType: "raster-transform",
        persistentBytes:
          this.estimateRasterSnapshotBytes(beforeSnapshot) +
          this.estimateRasterSnapshotBytes(afterSnapshot),
        reason: source,
        scratchBytes: 0,
        source,
        sourceBytes: this.estimateRasterSnapshotBytes(sourceSnapshot),
        sourceRect,
        targetBytes: this.getRasterRectBytes(dirtyRect),
        targetRect: dirtyRect,
        tool: "raster-transform",
      }));

      const history = namespace.documentHistory;
      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        type: "custom",
        afterSnapshot,
        beforeSnapshot,
        layerId,
        memoryPolicy,
        source,
        undo: () => this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          source: `history-undo-${source}`,
        }),
        redo: () => this.restoreRasterSnapshot(layerId, afterSnapshot, {
          source: `history-redo-${source}`,
        }),
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(afterSnapshot);
        },
      }, { source });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.emitContentChange({ layerId, source });
      this.requestDraw();

      return true;
    }

    deleteRasterTarget(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if (target.texture === this.texture || layerId === this.paintLayerId || layerId === "background") {
        return false;
      }

      this.deleteRasterTargetObject(target);
      this.rasterTargetsByLayerId.delete(layerId);
      this.deletePuppetMeshResource(layerId);

      if (options.emit !== false) {
        this.emitContentChange({ layerId, source: options.source || "delete-raster-target" });
      }

      return true;
    }

    emitContentChange(detail = {}) {
      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail,
      }));
    }

    handleLayerModelChange() {
      this.invalidatePreviewCache("layers-change");
      this.pruneOrphanRasterTargets();
    }

    handleDocumentContentChange(event) {
      this.invalidatePreviewCache(event?.detail?.source || "document-content-change");
    }

    handleHistoryChange() {
      this.invalidatePreviewCache("history-change");
      this.pruneOrphanRasterTargets();
    }

    collectEntryLayerIds(entries, result = new Set()) {
      if (!Array.isArray(entries)) {
        return result;
      }

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        if (entry.id) {
          result.add(entry.id);
        }

        this.collectEntryLayerIds(entry.children || [], result);
      }

      return result;
    }

    collectHistoryEntryLayerIds(entry, result = new Set()) {
      if (!entry) {
        return result;
      }

      if (entry.layerId) {
        result.add(entry.layerId);
      }

      if (Array.isArray(entry.layerIds)) {
        entry.layerIds.forEach((layerId) => {
          if (layerId) {
            result.add(layerId);
          }
        });
      }

      this.collectEntryLayerIds(entry.beforeEntries || [], result);
      this.collectEntryLayerIds(entry.afterEntries || [], result);

      return result;
    }

    collectHistoryLayerIds(result = new Set()) {
      const history = namespace.documentHistory;
      const stacks = [history?.undoStack, history?.redoStack];

      for (const stack of stacks) {
        if (!Array.isArray(stack)) {
          continue;
        }

        for (const entry of stack) {
          this.collectHistoryEntryLayerIds(entry, result);
        }
      }

      return result;
    }

    getCurrentRasterTargetLayerIds() {
      const currentLayerIds = this.collectEntryLayerIds(this.layerModel?.getEntries?.() || []);
      const activePaintLayerId = this.resolvePaintLayerId?.();

      currentLayerIds.add("background");

      if (activePaintLayerId) {
        currentLayerIds.add(activePaintLayerId);
      }

      return currentLayerIds;
    }

    syncActivePaintLayerReference() {
      const activePaintLayerId = this.resolvePaintLayerId?.();

      if (!activePaintLayerId || !this.rasterTargetsByLayerId) {
        return activePaintLayerId || "";
      }

      if (this.paintLayerId === activePaintLayerId) {
        return activePaintLayerId;
      }

      const previousTarget = this.paintLayerId
        ? this.rasterTargetsByLayerId.get(this.paintLayerId)
        : null;
      const nextTarget = this.rasterTargetsByLayerId.get(activePaintLayerId);

      this.paintLayerId = activePaintLayerId;

      if (nextTarget?.texture && nextTarget?.framebuffer) {
        nextTarget.layerId = activePaintLayerId;
        this.texture = nextTarget.texture;
        this.framebuffer = nextTarget.framebuffer;
        this.updateRasterTargetResourceMetadata?.(nextTarget, {
          kind: "paintTarget",
          label: "main paint raster target",
          layerId: activePaintLayerId,
          ownerId: activePaintLayerId,
          ownerType: "live",
          purgeable: false,
          reason: "sync-active-paint-layer",
        });
      } else if (previousTarget?.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      return activePaintLayerId;
    }

    reconcileRasterTargetResourceOwnership() {
      if (this.isDisposed || !this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let updatedCount = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (!target) {
          continue;
        }

        const isLiveTarget = currentLayerIds.has(layerId) || target.texture === this.texture;
        const isHistoryTarget = historyLayerIds.has(layerId);

        if (!isLiveTarget && !isHistoryTarget) {
          continue;
        }

        target.layerId = layerId;

        if (isLiveTarget) {
          const isPaintTarget = layerId !== "background" && this.isPaintRasterLayer(layerId, target);

          this.updateRasterTargetResourceMetadata?.(target, {
            kind: layerId === "background" ? "background" : isPaintTarget ? "paintTarget" : "layer",
            label: layerId,
            layerId,
            ownerId: layerId,
            ownerType: "live",
            purgeable: false,
            reason: "raster-target-live",
          });
          updatedCount += 1;
          continue;
        }

        this.updateRasterTargetResourceMetadata?.(target, {
          kind: "historyLayerTarget",
          label: layerId,
          layerId,
          ownerId: layerId,
          ownerType: "historyGpu",
          purgeable: true,
          reason: "history-retained-layer-target",
          state: "GPU_HOT",
        });
        updatedCount += 1;
      }

      return updatedCount;
    }

    getRetainedRasterTargetLayerIds() {
      const retainedLayerIds = this.getCurrentRasterTargetLayerIds();

      this.collectHistoryLayerIds(retainedLayerIds);

      return retainedLayerIds;
    }

    pruneOrphanRasterTargets() {
      if (this.isDisposed || !this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      this.syncActivePaintLayerReference();

      const retainedLayerIds = this.getRetainedRasterTargetLayerIds();
      let prunedCount = 0;

      for (const layerId of Array.from(this.rasterTargetsByLayerId.keys())) {
        const target = this.rasterTargetsByLayerId.get(layerId);

        if (retainedLayerIds.has(layerId) || target?.texture === this.texture) {
          continue;
        }

        if (this.deleteRasterTarget(layerId, { emit: false })) {
          prunedCount += 1;
        }
      }

      this.reconcileRasterTargetResourceOwnership();

      return prunedCount;
    }

    getPaintTarget() {
      const layerId = this.resolvePaintLayerId();
      const target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget();

      this.paintLayerId = layerId;
      target.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, target);
      this.texture = target.texture;
      this.framebuffer = target.framebuffer;
      this.updateRasterTargetResourceMetadata(target, {
        kind: "paintTarget",
        label: "main paint raster target",
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: "get-paint-target",
      });

      return {
        ...target,
        layerId,
      };
    }

    getDocumentDrawTarget(layerId = this.resolvePaintLayerId()) {
      return {
        cropped: false,
        framebuffer: null,
        height: Math.max(1, Math.round(this.height || 1)),
        layerId,
        texture: null,
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };
    }

    ensurePaintLayerForBrush() {
      const paintLayer = this.layerModel?.ensureActivePaintLayer?.({ source: "brush-stroke" });

      if (paintLayer?.id) {
        const target = this.getPaintTarget();

        if (this.isCroppedRasterTarget(target)) {
          return this.materializeRasterTarget(paintLayer.id, {
            source: "brush-materialize",
          }) || target;
        }

        return target;
      }

      return this.getPaintTarget();
    }

    clearActiveLayer(options = {}) {
      this.layerModel?.setActiveLayer?.(null, {
        source: options.source || "clear-active-layer",
      });
    }

    getRasterTarget(layerId) {
      if (!layerId) {
        throw new TypeError("DocumentRenderer richiede un layerId per il target raster.");
      }

      const target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget();
      const activePaintLayerId = this.resolvePaintLayerId();
      const isPaintTarget = this.isPaintRasterLayer(layerId, target);

      if (layerId === activePaintLayerId) {
        this.paintLayerId = layerId;
        this.texture = target.texture;
        this.framebuffer = target.framebuffer;
      }
      target.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, target);
      this.updateRasterTargetResourceMetadata(target, {
        kind: layerId === "background" ? "background" : isPaintTarget ? "paintTarget" : "layer",
        label: layerId,
        layerId,
        ownerId: layerId,
        ownerType: "live",
        purgeable: false,
        reason: "get-raster-target",
      });

      return {
        ...target,
        layerId,
      };
    }

    getRenderableLayers() {
      const layers = this.layerModel?.getRenderableLayers?.();

      if (Array.isArray(layers)) {
        return layers;
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    getOrderedLayersBottomToTop() {
      const layers = this.layerModel?.flattenTopToBottom?.();

      if (Array.isArray(layers)) {
        return layers.reverse();
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    updatePreviewCacheIfNeeded() {
      if (!this.previewTexture || !this.previewFramebuffer) {
        const didCreate = this.createPreviewCache();

        if (!didCreate) {
          return false;
        }
      }

      if (!this.previewCacheDirty && this.previewCacheReady) {
        return true;
      }

      return this.updatePreviewCache();
    }

    updatePreviewCache() {
      if (!this.previewTexture || !this.previewFramebuffer || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const { program, uniforms } = this.programInfo;
      const flatCamera = { x: 0, y: 0, zoom: 1 };
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);
        gl.viewport(0, 0, width, height);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, width, height);
        setDocumentProjection(width, height, 0, 0);
        gl.uniform1f(uniforms.cameraZoom, 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, width, height);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      };
      const drawTexture = (texture, opacity = 1, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(rect.width, rect.height, rect.x, rect.y);
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(width, height, 0, 0);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1i(uniforms.clipTexture, 2);
          gl.uniform1f(uniforms.clipMode, 1.0);
          gl.uniform1f(uniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            uniforms.clipOrigin,
            Number.isFinite(clipBase.target.x) ? clipBase.target.x : 0,
            Number.isFinite(clipBase.target.y) ? clipBase.target.y : 0,
          );
          gl.uniform2f(
            uniforms.clipTextureSize,
            clipBase.target.width || width,
            clipBase.target.height || height,
          );
          gl.activeTexture(gl.TEXTURE0);
        } else {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.uniform1f(uniforms.clipOpacity, 1.0);
          gl.uniform2f(uniforms.clipOrigin, 0, 0);
          gl.uniform2f(uniforms.clipTextureSize, width, height);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (clipBase?.target?.texture) {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
        }
      };
      const drawBlendTexture = (texture, opacity = 1, blendModeId = 0, rect = null, clipBase = null) => {
        if (!texture) {
          return;
        }

        if (blendModeId === 0) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        const backdropTexture = this.copyCurrentFramebufferToLayerBlendBackdrop(width, height);
        const { program: blendProgram, uniforms: blendUniforms } = this.ensureLayerBlendProgramInfo();

        gl.disable(gl.BLEND);
        gl.useProgram(blendProgram);
        gl.uniform2f(blendUniforms.viewportSize, width, height);
        if (rect) {
          gl.uniform2f(blendUniforms.documentSize, rect.width, rect.height);
          gl.uniform2f(blendUniforms.cameraPosition, rect.x, rect.y);
          gl.uniform2f(blendUniforms.drawOrigin, rect.x, rect.y);
        } else {
          gl.uniform2f(blendUniforms.documentSize, width, height);
          gl.uniform2f(blendUniforms.cameraPosition, 0, 0);
          gl.uniform2f(blendUniforms.drawOrigin, 0, 0);
        }
        gl.uniform1f(blendUniforms.cameraZoom, 1);
        gl.uniform1i(blendUniforms.texture, 0);
        gl.uniform1i(blendUniforms.backdropTexture, 3);
        gl.uniform1i(blendUniforms.maskTexture, 1);
        gl.uniform1i(blendUniforms.clipTexture, 2);
        gl.uniform1f(blendUniforms.opacity, opacity);
        gl.uniform1i(blendUniforms.blendMode, blendModeId);
        gl.uniform2f(blendUniforms.backdropSize, width, height);
        gl.uniform1f(blendUniforms.maskMode, 0.0);
        gl.uniform1f(blendUniforms.maskRectMode, 0.0);
        gl.uniform4f(blendUniforms.maskRect, 0, 0, width, height);
        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1f(blendUniforms.clipMode, 1.0);
          gl.uniform1f(blendUniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            blendUniforms.clipOrigin,
            Number.isFinite(clipBase.target.x) ? clipBase.target.x : 0,
            Number.isFinite(clipBase.target.y) ? clipBase.target.y : 0,
          );
          gl.uniform2f(
            blendUniforms.clipTextureSize,
            clipBase.target.width || width,
            clipBase.target.height || height,
          );
        } else {
          gl.uniform1f(blendUniforms.clipMode, 0.0);
          gl.uniform1f(blendUniforms.clipOpacity, 1.0);
          gl.uniform2f(blendUniforms.clipOrigin, 0, 0);
          gl.uniform2f(blendUniforms.clipTextureSize, width, height);
        }
        gl.uniform1f(blendUniforms.previewCutMode, 0.0);
        gl.uniform4f(blendUniforms.previewCutRect, 0, 0, 0, 0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (clipBase?.target?.texture) {
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.activeTexture(gl.TEXTURE0);
        bindArtboardProgram();
      };

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      bindArtboardProgram();

      let currentClipBase = null;
      const isValidClipBaseLayer = (layer) => Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );

      for (const layer of this.getOrderedLayersBottomToTop()) {
        const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
        const isClippingLayer = layer.clippingMask === true;
        const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
        const clipBase = isClippingLayer ? currentClipBase : null;

        if (!isClippingLayer) {
          currentClipBase = isValidClipBaseLayer(layer)
            ? {
                layer,
                target: layerTarget,
                visible: layer.visible !== false,
              }
            : null;
        }

        if (layer.visible === false) {
          continue;
        }

        if (isClippingLayer && (!clipBase?.visible || !clipBase?.target?.texture)) {
          continue;
        }

        if (!layerTarget?.texture) {
          continue;
        }

        const renderResult = this.getLayerRenderResult(layer, layerTarget);
        const layerTexture = renderResult?.texture;

        if (!layerTexture) {
          continue;
        }

        if (layerTexture !== layerTarget.texture) {
          bindArtboardProgram();
        }

        if (this.hasPuppetLayerTransform(layer)) {
          if (isClippingLayer) {
            drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, clipBase);
          } else {
            const puppetTarget = this.getPuppetVisualTarget(layerTarget, renderResult);
            const didDrawPuppet = this.drawPuppetLayer(layer, puppetTarget, opacity, {
              camera: flatCamera,
              sourceTexture: layerTexture,
              viewportHeight: height,
              viewportWidth: width,
            });

            bindArtboardProgram();

            if (!didDrawPuppet) {
              drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, null);
            }
          }
        } else {
          drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, clipBase);
        }
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewCacheDirty = false;
      this.previewCacheReady = true;

      return true;
    }

    drawPreviewCacheToCanvas(options = {}) {
      if (!this.previewTexture || !this.previewCacheReady || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const { program, uniforms } = this.programInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, this.width, this.height);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, this.width, this.height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, this.width, this.height);
      gl.uniform2f(uniforms.drawOrigin, 0, 0);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    hasPuppetLayerTransform(layer) {
      return Array.isArray(layer?.puppet?.pins) && layer.puppet.pins.length > 0;
    }

    getPuppetGridSize(layer) {
      return {
        cols: DEFAULT_PUPPET_GRID_COLS,
        rows: DEFAULT_PUPPET_GRID_ROWS,
      };
    }

    getPuppetLocalPins(layer, target) {
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const pins = layer?.puppet?.pins || [];

      return pins.map((pin) => ({
        ...pin,
        restX: (Number.isFinite(pin.restX) ? pin.restX : 0) - targetRect.x,
        restY: (Number.isFinite(pin.restY) ? pin.restY : 0) - targetRect.y,
        x: (Number.isFinite(pin.x) ? pin.x : 0) - targetRect.x,
        y: (Number.isFinite(pin.y) ? pin.y : 0) - targetRect.y,
      }));
    }

    writeRigidMlsPoint(vertices, offset, x, y, pins) {
      if (!pins?.length) {
        vertices[offset] = x;
        vertices[offset + 1] = y;
        return;
      }

      if (pins.length === 1) {
        const pin = pins[0];
        const rotation = Number(pin.rotation);
        const angle = Number.isFinite(rotation) ? rotation : 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = x - pin.restX;
        const dy = y - pin.restY;

        vertices[offset] = pin.x + dx * cos - dy * sin;
        vertices[offset + 1] = pin.y + dx * sin + dy * cos;
        return;
      }

      let pStarX = 0;
      let pStarY = 0;
      let qStarX = 0;
      let qStarY = 0;
      let weightSum = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const distSq = dx * dx + dy * dy;

        if (distSq < PUPPET_PIN_EPSILON) {
          vertices[offset] = pin.x;
          vertices[offset + 1] = pin.y;
          return;
        }

        const weight = 1 / distSq;

        weightSum += weight;
        pStarX += weight * pin.restX;
        pStarY += weight * pin.restY;
        qStarX += weight * pin.x;
        qStarY += weight * pin.y;
      }

      pStarX /= weightSum;
      pStarY /= weightSum;
      qStarX /= weightSum;
      qStarY /= weightSum;

      let a = 0;
      let b = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const phatX = pin.restX - pStarX;
        const phatY = pin.restY - pStarY;
        const qhatX = pin.x - qStarX;
        const qhatY = pin.y - qStarY;

        a += weight * (phatX * qhatX + phatY * qhatY);
        b += weight * (phatX * qhatY - phatY * qhatX);
      }

      const norm = Math.sqrt(a * a + b * b);
      const rotA = norm > PUPPET_PIN_EPSILON ? a / norm : 1;
      const rotB = norm > PUPPET_PIN_EPSILON ? b / norm : 0;
      const vhatX = x - pStarX;
      const vhatY = y - pStarY;

      let resultX = qStarX + vhatX * rotA - vhatY * rotB;
      let resultY = qStarY + vhatX * rotB + vhatY * rotA;
      let rotationDeltaX = 0;
      let rotationDeltaY = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const angle = Number(pin.rotation);

        if (!Number.isFinite(angle) || Math.abs(angle) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        rotationDeltaX += weight * (dx * cos - dy * sin - dx);
        rotationDeltaY += weight * (dx * sin + dy * cos - dy);
      }

      resultX += rotationDeltaX / weightSum;
      resultY += rotationDeltaY / weightSum;

      vertices[offset] = resultX;
      vertices[offset + 1] = resultY;
    }

    deletePuppetMeshResource(layerId) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource) {
        return false;
      }

      const gl = this.gl;

      if (resource.vbo) {
        gl.deleteBuffer(resource.vbo);
      }

      if (resource.ebo) {
        gl.deleteBuffer(resource.ebo);
      }

      if (resource.vao) {
        gl.deleteVertexArray(resource.vao);
      }

      this.puppetMeshResourcesByLayerId.delete(layerId);
      return true;
    }

    getPuppetAlphaSamples(target, cols, rows) {
      const samples = new Uint8Array(cols * rows);

      samples.fill(255);

      if (!target?.texture) {
        return samples;
      }

      const gl = this.gl;
      const fboRead = gl.createFramebuffer();
      const fboWrite = gl.createFramebuffer();
      const miniTexture = gl.createTexture();

      if (!fboRead || !fboWrite || !miniTexture) {
        if (fboRead) {
          gl.deleteFramebuffer(fboRead);
        }

        if (fboWrite) {
          gl.deleteFramebuffer(fboWrite);
        }

        if (miniTexture) {
          gl.deleteTexture(miniTexture);
        }

        return samples;
      }

      gl.bindTexture(gl.TEXTURE_2D, miniTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboRead);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fboWrite);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, miniTexture, 0);

      const readReady = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const writeReady = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

      if (readReady && writeReady) {
        gl.blitFramebuffer(
          0,
          0,
          target.width,
          target.height,
          0,
          0,
          cols,
          rows,
          gl.COLOR_BUFFER_BIT,
          gl.LINEAR,
        );

        const pixels = new Uint8Array(cols * rows * 4);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboWrite);
        gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < cols; x += 1) {
            const webglY = rows - 1 - y;
            const alpha = pixels[(webglY * cols + x) * 4 + 3];

            samples[y * cols + x] = alpha;
          }
        }
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(fboRead);
      gl.deleteFramebuffer(fboWrite);
      gl.deleteTexture(miniTexture);

      return samples;
    }

    getPuppetAlphaMask(target, cols, rows, options = {}) {
      const samples = this.getPuppetAlphaSamples(target, cols, rows);
      const mask = new Uint8Array(cols * rows);
      const threshold = Number.isFinite(options.threshold)
        ? Math.max(0, Math.min(255, options.threshold))
        : 2;

      for (let index = 0; index < samples.length; index += 1) {
        mask[index] = samples[index] > threshold ? 1 : 0;
      }

      return mask;
    }

    getRasterAlphaAtPoint(targetOrLayerId, x, y) {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId)
        : targetOrLayerId;

      if (!target?.framebuffer || !Number.isFinite(x) || !Number.isFinite(y)) {
        return 0;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const pixelX = Math.floor(x - targetRect.x);
      const pixelY = Math.floor(y - targetRect.y);

      if (
        pixelX < 0 ||
        pixelY < 0 ||
        pixelX >= target.width ||
        pixelY >= target.height
      ) {
        return 0;
      }

      const gl = this.gl;
      const pixel = new Uint8Array(4);
      const webglY = target.height - pixelY - 1;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.readPixels(pixelX, webglY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

      return pixel[3];
    }

    getPuppetRestPoint(layerId, targetX, targetY) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource?.indices || !resource?.vertices) {
        return { x: targetX, y: targetY };
      }

      const { vertices, indices } = resource;
      const targetWidth = Math.max(1, resource.targetWidth || 1);
      const targetHeight = Math.max(1, resource.targetHeight || 1);
      const originX = Number.isFinite(resource.targetX) ? resource.targetX : 0;
      const originY = Number.isFinite(resource.targetY) ? resource.targetY : 0;

      for (let index = 0; index < indices.length; index += 3) {
        const i0 = indices[index] * 4;
        const i1 = indices[index + 1] * 4;
        const i2 = indices[index + 2] * 4;
        const x1 = vertices[i0];
        const y1 = vertices[i0 + 1];
        const x2 = vertices[i1];
        const y2 = vertices[i1 + 1];
        const x3 = vertices[i2];
        const y3 = vertices[i2 + 1];
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);

        if (Math.abs(det) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const w1 = ((y2 - y3) * (targetX - x3) + (x3 - x2) * (targetY - y3)) / det;
        const w2 = ((y3 - y1) * (targetX - x3) + (x1 - x3) * (targetY - y3)) / det;
        const w3 = 1 - w1 - w2;

        if (w1 >= -0.05 && w2 >= -0.05 && w3 >= -0.05) {
          const u1 = vertices[i0 + 2];
          const v1 = vertices[i0 + 3];
          const u2 = vertices[i1 + 2];
          const v2 = vertices[i1 + 3];
          const u3 = vertices[i2 + 2];
          const v3 = vertices[i2 + 3];
          const u = w1 * u1 + w2 * u2 + w3 * u3;
          const v = w1 * v1 + w2 * v2 + w3 * v3;

          return {
            x: originX + u * targetWidth,
            y: originY + (1 - v) * targetHeight,
          };
        }
      }

      return { x: targetX, y: targetY };
    }

    createPuppetMeshResource(layerId, target, cols, rows) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ebo = gl.createBuffer();
      const vertices = new Float32Array((cols + 1) * (rows + 1) * 4);
      const validIndices = [];
      const targetRect = this.getRasterTargetDocumentRect(target);

      if (!vao || !vbo || !ebo) {
        if (vao) {
          gl.deleteVertexArray(vao);
        }

        if (vbo) {
          gl.deleteBuffer(vbo);
        }

        if (ebo) {
          gl.deleteBuffer(ebo);
        }

        throw new Error("Impossibile creare la mesh puppet WebGL2.");
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;

          validIndices.push(a, c, b, b, c, d);
        }
      }

      const indices = new Uint32Array(validIndices);

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      const resource = {
        cols,
        ebo,
        indexCount: indices.length,
        indices,
        rows,
        targetHeight: target.height,
        targetWidth: target.width,
        targetX: targetRect?.x || 0,
        targetY: targetRect?.y || 0,
        vao,
        vbo,
        vertices,
      };

      this.puppetMeshResourcesByLayerId.set(layerId, resource);
      return resource;
    }

    getPuppetMeshResource(layerId, target, cols, rows) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (
        resource?.cols === cols &&
        resource?.rows === rows &&
        resource?.targetWidth === target.width &&
        resource?.targetHeight === target.height &&
        resource?.targetX === (this.getRasterTargetDocumentRect(target)?.x || 0) &&
        resource?.targetY === (this.getRasterTargetDocumentRect(target)?.y || 0)
      ) {
        return resource;
      }

      this.deletePuppetMeshResource(layerId);
      return this.createPuppetMeshResource(layerId, target, cols, rows);
    }

    updatePuppetMeshVertices(resource, layer, target) {
      const pins = this.getPuppetLocalPins(layer, target);
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const vertices = resource.vertices;
      const cols = resource.cols;
      const rows = resource.rows;
      let offset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const sourceX = (gridX / cols) * target.width;
          const sourceY = (gridY / rows) * target.height;

          this.writeRigidMlsPoint(vertices, offset, sourceX, sourceY, pins);
          vertices[offset] += targetRect.x;
          vertices[offset + 1] += targetRect.y;
          vertices[offset + 2] = sourceX / target.width;
          vertices[offset + 3] = 1 - sourceY / target.height;
          offset += 4;
        }
      }
    }

    getPuppetDeformedBounds(layer, target) {
      if (!this.hasPuppetLayerTransform(layer) || !target?.texture) {
        return this.getRasterTargetDocumentRect(target);
      }

      const { cols, rows } = this.getPuppetGridSize(layer);
      const resource = this.getPuppetMeshResource(layer.id, target, cols, rows);

      if (!resource?.vertices?.length) {
        return this.getRasterTargetDocumentRect(target);
      }

      this.updatePuppetMeshVertices(resource, layer, target);

      const vertices = resource.vertices;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let offset = 0; offset < vertices.length; offset += 4) {
        const x = vertices[offset];
        const y = vertices[offset + 1];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return this.getRasterTargetDocumentRect(target);
      }

      return this.getClampedDocumentRect({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }, CROPPED_TARGET_EDGE_PADDING) || this.getRasterTargetDocumentRect(target);
    }

    getPuppetMeshSignature(layer, target) {
      const pins = layer.puppet?.pins || [];
      const { cols, rows } = this.getPuppetGridSize(layer);
      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const parts = [
        targetRect.x,
        targetRect.y,
        target.width,
        target.height,
        cols,
        rows,
      ];

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];

        parts.push(pin.id, pin.restX, pin.restY, pin.x, pin.y, pin.rotation || 0);
      }

      return parts.join("|");
    }

    drawPuppetLayer(layer, target, opacity, options = {}) {
      if (!target?.texture || !layer?.id) {
        return false;
      }

      const gl = this.gl;
      const { cols, rows } = this.getPuppetGridSize(layer);
      const resource = this.getPuppetMeshResource(layer.id, target, cols, rows);
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const sourceTexture = options.sourceTexture || target.texture;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const signature = this.getPuppetMeshSignature(layer, target);

      if (resource.signature !== signature) {
        this.updatePuppetMeshVertices(resource, layer, target);
        gl.bindBuffer(gl.ARRAY_BUFFER, resource.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, resource.vertices);
        resource.signature = signature;
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.bindVertexArray(resource.vao);
      gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    rasterizePuppetLayer(layer, options = {}) {
      if (!this.hasPuppetLayerTransform(layer) || !layer?.id) {
        return null;
      }

      const target = this.rasterTargetsByLayerId.get(layer.id);

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const sourceSnapshot = this.createRasterSnapshot(target, null, "puppet-rasterize-before");

      if (!sourceSnapshot?.texture) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(target) || { x: 0, y: 0 };
      const outputRect = this.getPuppetDeformedBounds(layer, target) || targetRect;
      const needsTargetSwap = outputRect && !this.areDocumentRectsEqual(outputRect, targetRect);
      const destinationTarget = needsTargetSwap
        ? this.createRasterTargetForRect(outputRect)
        : target;

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const gl = this.gl;
      const destinationRect = this.getRasterTargetDocumentRect(destinationTarget) || targetRect;

      gl.bindFramebuffer(gl.FRAMEBUFFER, destinationTarget.framebuffer);
      gl.viewport(0, 0, destinationTarget.width, destinationTarget.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const didDraw = this.drawPuppetLayer(layer, target, 1, {
        camera: { x: -destinationRect.x, y: -destinationRect.y, zoom: 1 },
        sourceTexture: sourceSnapshot.texture,
        viewportHeight: destinationTarget.height,
        viewportWidth: destinationTarget.width,
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      if (!didDraw) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      this.markRasterTargetDirty(destinationTarget);

      const rasterizedSnapshot = this.createRasterSnapshot(destinationTarget, null, "puppet-rasterize-after");

      if (!rasterizedSnapshot?.texture) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      if (needsTargetSwap && !this.replaceRasterTarget(layer.id, destinationTarget, {
        emit: false,
        source: options.source || "puppet-rasterize",
      })) {
        this.deleteRasterTargetObject(destinationTarget);
        this.deleteRasterSnapshot(rasterizedSnapshot);
        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const sourceBytes = this.estimateRasterTargetBytes(target);
      const targetBytes = this.estimateRasterTargetBytes(destinationTarget);
      const beforeBytes = this.estimateRasterSnapshotBytes(sourceSnapshot);
      const afterBytes = this.estimateRasterSnapshotBytes(rasterizedSnapshot);
      const scratchBytes = needsTargetSwap ? targetBytes : 0;
      const estimatedPeakBytes = sourceBytes + scratchBytes + beforeBytes + afterBytes;
      const coverage = this.getRasterOperationCoverage(destinationRect);

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterSnapshot: rasterizedSnapshot,
        beforeSnapshot: sourceSnapshot,
        coverage,
        estimatedPeakBytes,
        layerId: layer.id,
        operationType: "puppet-rasterize",
        persistentBytes: beforeBytes + afterBytes + (needsTargetSwap ? targetBytes : 0),
        reason: options.source || "puppet-rasterize",
        scratchBytes,
        source: options.source || "puppet-rasterize",
        sourceBytes,
        sourceRect: targetRect,
        targetBytes,
        targetRect: destinationRect,
        tool: "puppet",
      }));

      this.deletePuppetMeshResource(layer.id);

      if (options.emit !== false) {
        this.emitContentChange({
          layerId: layer.id,
          source: options.source || "puppet-rasterize",
        });
      }

      return {
        afterSnapshot: rasterizedSnapshot,
        beforeSnapshot: sourceSnapshot,
        layerId: layer.id,
        memoryPolicy,
      };
    }

    rasterizeLayerEffects(layer, options = {}) {
      if (!this.hasEnabledLayerEffects(layer) || !layer?.id) {
        return null;
      }

      const target = this.rasterTargetsByLayerId.get(layer.id);

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const beforeSnapshot = this.createRasterSnapshot(target, null, "layer-effects-rasterize-before");

      if (!beforeSnapshot?.texture) {
        return null;
      }

      const renderResult = this.getLayerRenderResult(layer, target);
      const renderTexture = renderResult?.texture;
      const targetRect = this.getRasterTargetDocumentRect(target);
      const renderRect = renderResult?.rect || targetRect;
      const needsTargetSwap = renderRect && !this.areDocumentRectsEqual(renderRect, targetRect);
      const destinationTarget = needsTargetSwap
        ? this.createRasterTargetForRect(renderRect)
        : target;
      const didCopy = renderTexture &&
        renderTexture !== target.texture &&
        destinationTarget?.framebuffer &&
        this.copyTextureToRasterTarget(renderTexture, destinationTarget, {
          height: renderResult.height,
          width: renderResult.width,
        });

      if (!didCopy) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
          emit: false,
          source: "layer-effects-rasterize-rollback",
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return null;
      }

      if (needsTargetSwap) {
        this.replaceRasterTarget(layer.id, destinationTarget, {
          emit: false,
          source: options.source || "layer-effects-rasterize",
        });
      }

      const finalTarget = needsTargetSwap ? destinationTarget : target;
      const afterSnapshot = this.createRasterSnapshot(finalTarget, null, "layer-effects-rasterize-after");

      if (!afterSnapshot?.texture) {
        this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
          emit: false,
          source: "layer-effects-rasterize-rollback",
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return null;
      }

      const finalTargetRect = this.getRasterTargetDocumentRect(finalTarget);
      const beforeBytes = this.getRasterRectBytes(beforeSnapshot.rect);
      const afterBytes = this.getRasterRectBytes(afterSnapshot.rect);
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const targetBytes = this.estimateRasterTargetBytes(finalTarget);
      const scratchBytes =
        this.estimateRasterTargetBytes(this.layerEffectScratchA) +
        this.estimateRasterTargetBytes(this.layerEffectScratchB);
      const persistentBytes = beforeBytes + afterBytes + targetBytes;
      const estimatedPeakBytes = persistentBytes + sourceBytes + scratchBytes;
      const coverage = this.getRasterOperationCoverage(finalTargetRect);

      const memoryPolicy = this.recordRasterOperation({
        afterBytes,
        beforeBytes,
        canvasSize: {
          height: this.height,
          width: this.width,
        },
        coverage,
        estimatedPeakBytes,
        historyBytes: beforeBytes + afterBytes,
        layerId: layer.id,
        operationType: "layer-effects-rasterize",
        persistentBytes,
        policy: this.classifyRasterOperationMemory(estimatedPeakBytes, coverage),
        reason: options.source || "layer-effects-rasterize",
        scratchBytes,
        source: options.source || "layer-effects-rasterize",
        sourceBytes,
        sourceRect: targetRect,
        targetBytes,
        targetRect: finalTargetRect,
        tool: "layer-effects",
      });

      if (options.emit !== false) {
        this.emitContentChange({
          layerId: layer.id,
          source: options.source || "layer-effects-rasterize",
        });
      }

      return {
        afterSnapshot,
        beforeSnapshot,
        layerId: layer.id,
        memoryPolicy,
      };
    }

    drawToCanvas(options = {}) {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;
      const target = this.getDocumentDrawTarget();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const { program, uniforms } = this.programInfo;
      const activeStrokeLayerId = options.activeStrokeLayerId || target.layerId;
      const activeStrokeMode = String(options.activeStrokeMode || "paint").toLowerCase();
      const activeStrokeRect = options.activeStrokeRect || null;
      const rasterTransformPreview = this.rasterTransformPreview?.texture
        ? this.rasterTransformPreview
        : null;
      const hasActiveEraserStroke = Boolean(options.activeStrokeTexture && activeStrokeMode === "eraser");
      const orderedLayers = this.getOrderedLayersBottomToTop();
      const renderableLayers = orderedLayers.filter((layer) => layer.visible !== false);
      const hasClippingMasks = orderedLayers.some((layer) => layer?.clippingMask === true);
      const activeStrokeLayerIndex = renderableLayers.findIndex((layer) => layer?.id === activeStrokeLayerId);
      const activeStrokeLayer = activeStrokeLayerIndex >= 0 ? renderableLayers[activeStrokeLayerIndex] : null;
      const activeStrokeUsesClippingMask = Boolean(
        options.activeStrokeTexture &&
        hasClippingMasks &&
        activeStrokeLayer?.clippingMask === true
      );
      const activeStrokeNeedsFullStack = Boolean(
        options.activeStrokeTexture &&
        activeStrokeMode !== "eraser" &&
        activeStrokeLayer &&
        (
          this.hasAdvancedLayerBlendMode(activeStrokeLayer) ||
          this.hasEnabledLayerEffects(activeStrokeLayer) ||
          activeStrokeUsesClippingMask
        )
      );
      const activeStrokeCanOverlayPreview = !options.activeStrokeTexture ||
        (
          activeStrokeLayerIndex >= 0 &&
          !activeStrokeNeedsFullStack &&
          !renderableLayers
            .slice(activeStrokeLayerIndex + 1)
            .some((layer) => this.rasterTargetsByLayerId.get(layer.id)?.texture)
        );
      const allowPreviewCache = options.allowPreviewCache === true;
      const isWithinPreviewCacheZoom = (camera.zoom || 1) < PREVIEW_CACHE_ZOOM_THRESHOLD;
      const canUsePreviewCache = Boolean(
        allowPreviewCache &&
        isWithinPreviewCacheZoom &&
        !rasterTransformPreview &&
        !hasActiveEraserStroke &&
        !activeStrokeNeedsFullStack &&
        activeStrokeCanOverlayPreview
      );
      let didDrawActiveStroke = false;
      let currentMaskTexture = null;
      let currentMaskRect = null;
      let currentPreviewCutRect = null;
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const drawTexture = (texture, opacity, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (camera.x || 0) + rect.x * (camera.zoom || 1),
            (camera.y || 0) + rect.y * (camera.zoom || 1),
          );
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1i(uniforms.clipTexture, 2);
          gl.uniform1f(uniforms.clipMode, 1.0);
          gl.uniform1f(uniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            uniforms.clipOrigin,
            Number.isFinite(clipBase.target.x) ? clipBase.target.x : 0,
            Number.isFinite(clipBase.target.y) ? clipBase.target.y : 0,
          );
          gl.uniform2f(
            uniforms.clipTextureSize,
            clipBase.target.width || target.width,
            clipBase.target.height || target.height,
          );
          gl.activeTexture(gl.TEXTURE0);
        } else {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.uniform1f(uniforms.clipOpacity, 1.0);
          gl.uniform2f(uniforms.clipOrigin, 0, 0);
          gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (clipBase?.target?.texture) {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
        }
      };
      const drawBlendTexture = (texture, opacity, rect = null, clipBase = null, blendModeId = 0) => {
        if (!texture) {
          return;
        }

        if (blendModeId === 0) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        const backdropTexture = this.copyCurrentFramebufferToLayerBlendBackdrop(viewportWidth, viewportHeight);
        const { program: blendProgram, uniforms: blendUniforms } = this.ensureLayerBlendProgramInfo();

        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (camera.x || 0) + rect.x * (camera.zoom || 1),
            (camera.y || 0) + rect.y * (camera.zoom || 1),
          );
        } else {
          setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        }

        gl.disable(gl.BLEND);
        gl.useProgram(blendProgram);
        gl.uniform2f(blendUniforms.viewportSize, viewportWidth, viewportHeight);
        if (rect) {
          gl.uniform2f(blendUniforms.documentSize, rect.width, rect.height);
          gl.uniform2f(
            blendUniforms.cameraPosition,
            (camera.x || 0) + rect.x * (camera.zoom || 1),
            (camera.y || 0) + rect.y * (camera.zoom || 1),
          );
          gl.uniform2f(blendUniforms.drawOrigin, rect.x, rect.y);
        } else {
          gl.uniform2f(blendUniforms.documentSize, target.width, target.height);
          gl.uniform2f(blendUniforms.cameraPosition, camera.x || 0, camera.y || 0);
          gl.uniform2f(blendUniforms.drawOrigin, 0, 0);
        }
        gl.uniform1f(blendUniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(blendUniforms.texture, 0);
        gl.uniform1i(blendUniforms.backdropTexture, 3);
        gl.uniform1i(blendUniforms.maskTexture, 1);
        gl.uniform1i(blendUniforms.clipTexture, 2);
        gl.uniform1f(blendUniforms.opacity, opacity);
        gl.uniform1i(blendUniforms.blendMode, blendModeId);
        gl.uniform2f(blendUniforms.backdropSize, viewportWidth, viewportHeight);

        if (currentMaskTexture) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, currentMaskTexture);
          gl.uniform1f(blendUniforms.maskMode, 1.0);
          if (currentMaskRect) {
            gl.uniform1f(blendUniforms.maskRectMode, 1.0);
            gl.uniform4f(
              blendUniforms.maskRect,
              currentMaskRect.x,
              currentMaskRect.y,
              currentMaskRect.width,
              currentMaskRect.height,
            );
          } else {
            gl.uniform1f(blendUniforms.maskRectMode, 0.0);
            gl.uniform4f(blendUniforms.maskRect, 0, 0, target.width, target.height);
          }
        } else {
          gl.uniform1f(blendUniforms.maskMode, 0.0);
          gl.uniform1f(blendUniforms.maskRectMode, 0.0);
          gl.uniform4f(blendUniforms.maskRect, 0, 0, target.width, target.height);
        }

        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1f(blendUniforms.clipMode, 1.0);
          gl.uniform1f(blendUniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            blendUniforms.clipOrigin,
            Number.isFinite(clipBase.target.x) ? clipBase.target.x : 0,
            Number.isFinite(clipBase.target.y) ? clipBase.target.y : 0,
          );
          gl.uniform2f(
            blendUniforms.clipTextureSize,
            clipBase.target.width || target.width,
            clipBase.target.height || target.height,
          );
        } else {
          gl.uniform1f(blendUniforms.clipMode, 0.0);
          gl.uniform1f(blendUniforms.clipOpacity, 1.0);
          gl.uniform2f(blendUniforms.clipOrigin, 0, 0);
          gl.uniform2f(blendUniforms.clipTextureSize, target.width, target.height);
        }

        if (currentPreviewCutRect) {
          gl.uniform1f(blendUniforms.previewCutMode, 1.0);
          gl.uniform4f(
            blendUniforms.previewCutRect,
            currentPreviewCutRect.x,
            currentPreviewCutRect.y,
            currentPreviewCutRect.width,
            currentPreviewCutRect.height,
          );
        } else {
          gl.uniform1f(blendUniforms.previewCutMode, 0.0);
          gl.uniform4f(blendUniforms.previewCutRect, 0, 0, 0, 0);
        }

        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindTexture(gl.TEXTURE_2D, null);

        if (currentMaskTexture) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }

        if (clipBase?.target?.texture) {
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }

        gl.activeTexture(gl.TEXTURE0);
        bindArtboardProgram();
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, viewportWidth, viewportHeight);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      };
      const setPreviewCut = (rect = null) => {
        currentPreviewCutRect = rect;
        if (rect) {
          gl.uniform1f(uniforms.previewCutMode, 1.0);
          gl.uniform4f(uniforms.previewCutRect, rect.x, rect.y, rect.width, rect.height);
        } else {
          gl.uniform1f(uniforms.previewCutMode, 0.0);
          gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        }
      };
      const drawRasterTransformPreview = (layerOpacity = 1) => {
        if (!rasterTransformPreview?.texture || !Array.isArray(rasterTransformPreview.quad)) {
          return;
        }

        const drawOptions = {
          camera,
          edgeFeatherPixels: rasterTransformPreview.edgeFeatherPixels,
          opacity: rasterTransformPreview.opacity * layerOpacity,
          viewportHeight,
          viewportWidth,
        };

        if (rasterTransformPreview.transformMode === "warp") {
          this.drawWarpTexturedMesh(
            rasterTransformPreview.texture,
            rasterTransformPreview.warpControlPoints,
            drawOptions,
          );
        } else if (rasterTransformPreview.transformMode === "perspective") {
          this.drawPerspectiveTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
        } else {
          this.drawTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
        }

        bindArtboardProgram();
      };
      const didUpdatePreviewCache = canUsePreviewCache
        ? this.updatePreviewCacheIfNeeded()
        : false;
      const usePreviewCache = canUsePreviewCache && didUpdatePreviewCache && this.previewCacheReady;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      if (this.options.transparentBackground) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(0.15, 0.15, 0.15, 1.0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      bindArtboardProgram();

      // Pass 1: layer documento, dal basso verso l'alto.
      gl.uniform1f(uniforms.gridMode, 0.0);

      if (usePreviewCache) {
        const activeStrokeOpacity = this.getLayerOpacity(activeStrokeLayerId, renderableLayers);

        drawTexture(this.previewTexture, 1);

        if (options.activeStrokeTexture && activeStrokeMode !== "eraser") {
          drawTexture(options.activeStrokeTexture, activeStrokeOpacity, activeStrokeRect);
          didDrawActiveStroke = true;
        }
      } else {
        let currentClipBase = null;
        const isValidClipBaseLayer = (layer) => Boolean(
          layer &&
          layer.type !== "group" &&
          layer.type !== "background" &&
          layer.id !== "background"
        );

        for (const layer of orderedLayers) {
          const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const isActiveStrokeLayer = options.activeStrokeTexture && layer.id === activeStrokeLayerId;
          const isRasterTransformPreviewLayer = rasterTransformPreview?.layerId === layer.id;
          const eraserMaskTexture = isActiveStrokeLayer && activeStrokeMode === "eraser"
            ? options.activeStrokeTexture
            : null;
          const clipBase = isClippingLayer ? currentClipBase : null;

          if (!isClippingLayer) {
            currentClipBase = isValidClipBaseLayer(layer)
              ? {
                  layer,
                  target: layerTarget,
                  visible: layer.visible !== false,
                }
              : null;
          }

          if (layer.visible === false) {
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !clipBase?.target?.texture)) {
            continue;
          }

          if (layerTarget?.texture) {
            let renderTarget = layerTarget;
            let didMergeActiveStroke = false;

            if (isActiveStrokeLayer && activeStrokeMode !== "eraser") {
              const mergedTarget = this.renderLayerWithActiveStrokeTexture(
                layerTarget.texture,
                options.activeStrokeTexture,
                activeStrokeRect,
              );

              if (mergedTarget?.texture) {
                renderTarget = mergedTarget;
                didMergeActiveStroke = true;
                didDrawActiveStroke = true;
                bindArtboardProgram();
              }
            }

            const renderResult = this.getLayerRenderResult(layer, renderTarget);
            const layerTexture = renderResult?.texture;
            const hasVisualEffects = layerTexture && layerTexture !== renderTarget.texture;
            const blendModeId = this.getLayerBlendModeId(layer);
            const layerRect = renderResult?.rect || null;

            if (hasVisualEffects) {
              bindArtboardProgram();
            }

            if (isRasterTransformPreviewLayer) {
              setPreviewCut(rasterTransformPreview.sourceRect);
            }

            if (eraserMaskTexture) {
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, eraserMaskTexture);
              gl.uniform1f(uniforms.maskMode, 1.0);
              if (activeStrokeRect) {
                gl.uniform1f(uniforms.maskRectMode, 1.0);
                gl.uniform4f(
                  uniforms.maskRect,
                  activeStrokeRect.x,
                  activeStrokeRect.y,
                  activeStrokeRect.width,
                  activeStrokeRect.height,
                );
              } else {
                gl.uniform1f(uniforms.maskRectMode, 0.0);
                gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
              }
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = eraserMaskTexture;
              currentMaskRect = activeStrokeRect || null;
            }

            if (this.hasPuppetLayerTransform(layer) && !eraserMaskTexture) {
              if (isClippingLayer) {
                drawBlendTexture(layerTexture, opacity, layerRect, clipBase, blendModeId);
              } else {
                const puppetTarget = this.getPuppetVisualTarget(layerTarget, renderResult);
                const didDrawPuppet = this.drawPuppetLayer(layer, puppetTarget, opacity, {
                  camera,
                  sourceTexture: layerTexture,
                  viewportHeight,
                  viewportWidth,
                });

                bindArtboardProgram();

                if (!didDrawPuppet) {
                  drawBlendTexture(layerTexture, opacity, layerRect, null, blendModeId);
                }
              }
            } else {
              drawBlendTexture(layerTexture, opacity, layerRect, clipBase, blendModeId);
            }

            if (isRasterTransformPreviewLayer) {
              setPreviewCut(null);
            }

            if (eraserMaskTexture) {
              gl.uniform1f(uniforms.maskMode, 0.0);
              gl.uniform1f(uniforms.maskRectMode, 0.0);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = null;
              currentMaskRect = null;
              didDrawActiveStroke = true;
            }

            if (didMergeActiveStroke) {
              currentMaskTexture = null;
              currentMaskRect = null;
            }
          }

          if (isRasterTransformPreviewLayer) {
            drawRasterTransformPreview(opacity);
          }

          if (isActiveStrokeLayer && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
            drawBlendTexture(
              options.activeStrokeTexture,
              opacity,
              activeStrokeRect,
              clipBase,
              this.getLayerBlendModeId(layer),
            );
            didDrawActiveStroke = true;
          }
        }
      }

      if (options.activeStrokeTexture && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          drawTexture(options.activeStrokeTexture, 1.0, activeStrokeRect);
        }
      }

      // Pass 2: griglia pixel sopra tutto. Lo shader la attiva solo a zoom alto.
      setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.gridMode, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;
      this.layerModel?.removeEventListener?.("change", this.handleLayerModelChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.removeEventListener("cbo:history-change", this.handleHistoryChange);

      this.deleteGaussianBlurResources();
      this.deleteMotionBlurResources();
      this.deleteFieldBlurResources();
      this.deleteRadialBlurResources();
      this.deleteGrainResources();
      this.deleteThresholdResources();
      this.deleteActiveStrokeScratchTarget();
      this.deleteLayerBlendResources();
      this.deletePreviewCache();

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.texturedQuad) {
        gl.deleteBuffer(this.texturedQuad.buffer);
        gl.deleteVertexArray(this.texturedQuad.vao);
        this.texturedQuad = null;
      }

      this.deleteRasterWarpMeshResource();

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }

      if (this.texturedQuadProgramInfo?.program) {
        gl.deleteProgram(this.texturedQuadProgramInfo.program);
        this.texturedQuadProgramInfo = null;
      }

      if (this.puppetProgramInfo?.program) {
        gl.deleteProgram(this.puppetProgramInfo.program);
        this.puppetProgramInfo = null;
      }

      if (this.perspectiveQuadProgramInfo?.program) {
        gl.deleteProgram(this.perspectiveQuadProgramInfo.program);
        this.perspectiveQuadProgramInfo = null;
      }

      for (const layerId of Array.from(this.puppetMeshResourcesByLayerId.keys())) {
        this.deletePuppetMeshResource(layerId);
      }

      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => {
        this.deleteRasterTargetObject(target);
      });

      this.rasterTargetsByLayerId.clear();
      this.framebuffer = null;
      this.texture = null;
    }
  }

  namespace.DocumentRenderer = DocumentRenderer;
})(window.CBO = window.CBO || {});
