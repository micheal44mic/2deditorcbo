(function registerDocumentRenderer(namespace) {
  const CROPPED_TARGET_EDGE_PADDING = 2;
  const CROPPED_TARGET_EFFECT_PADDING = 320;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_HISTORY_TILE_SIZE = 256;
  const RASTER_HISTORY_MOBILE_TILE_SIZE = 128;
  const PREVIEW_DIRTY_MAX_RECTS = 96;
  const PREVIEW_DIRTY_MERGE_WASTE_RATIO = 1.18;
  const PREVIEW_DIRTY_FULL_COVERAGE_RATIO = 0.92;
  const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug";
  const VIEWPORT_RENDER_OVERSCAN_CSS_PX = 256;
  const VIEWPORT_CULLING_DEBUG_EVENT = "cbo:viewport-culling-debug";
  const VIEWPORT_LAYER_CULL_SAFE_TYPES = new Set(["paint", "image", "raster", "bitmap"]);
  const ARTBOARD_RESIDENCY_IDLE_DELAY_MS = 1400;
  const ARTBOARD_RESIDENCY_WARM_HOLD_MS = 2400;
  const ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES = 384 * 1024 * 1024;
  const ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES = 640 * 1024 * 1024;
  const ARTBOARD_RESIDENCY_PREFETCH_CSS_PX = 640;
  const ARTBOARD_FLAT_PREVIEW_MAX_SIZE = 2048;
  const RASTER_TRANSFORM_EDGE_AA_FEATHER_PIXELS = 1;
  const RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING = 2;
  const RASTER_TRANSFORM_ARTBOARD_TRANSFER_MIN_RATIO = 0.4;
  const RASTER_WARP_MESH_COLS = 64;
  const RASTER_WARP_MESH_ROWS = 64;
  const RASTER_MIB = 1024 * 1024;
  const RASTER_OPERATION_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });
  const RASTER_SCRATCH_SOFT_EVICT_BYTES = 96 * RASTER_MIB;
  const RASTER_SCRATCH_HARD_WARN_BYTES = 128 * RASTER_MIB;
  const RASTER_SCRATCH_TOP_RESOURCE_LIMIT = 8;
  const DESKTOP_RENDER_DPR_CAP = 2;
  const MOBILE_RENDER_DPR_CAP = 1.5;
  const LOW_MEMORY_MOBILE_RENDER_DPR_CAP = 1.25;
  const MOBILE_PREVIEW_CACHE_MAX_SIZE = 1536;
  const MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX = 128;
  const MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX = 128;
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
uniform sampler2D u_selectionClipTexture;
uniform float u_opacity;
uniform vec2 uDocumentSize;
uniform float uCameraZoom;
uniform float u_gridMode;
uniform float u_maskMode;
uniform vec4 u_maskRect;
uniform float u_maskRectMode;
uniform vec4 u_maskClipRect;
uniform vec4 u_maskClipRects[32];
uniform int u_maskClipRectCount;
uniform float u_maskClipMode;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipOrigin;
uniform vec2 u_clipTextureSize;
uniform vec2 u_drawOrigin;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;
uniform float u_selectionClipMode;
uniform vec4 u_selectionClipRect;

in vec2 v_uv;
in vec2 v_documentPixel;

out vec4 outColor;

void main() {
  if (u_gridMode > 0.5) {
    // Griglia pixel: disattivata in modo duro sotto il 1000%.
    // Questo evita che fwidth/fract generino shimmer o linee biancastre durante lo zoom out.
    float safeZoom = abs(uCameraZoom);

    if (safeZoom < 10.01) {
      discard;
    }

    vec2 docPx = v_uv * uDocumentSize;
    vec2 boundaryDistance = abs(fract(docPx - 0.5) - 0.5) / max(fwidth(docPx), vec2(0.0001));
    float line = 1.0 - clamp(min(boundaryDistance.x, boundaryDistance.y), 0.0, 1.0);
    // Fade in solo sopra il 1000%: sotto resta una vista pulita e non pixelata.
    float zoomFade = smoothstep(10.01, 12.0, safeZoom);
    float alpha = line * zoomFade * 0.30;

    if (alpha <= 0.0001) {
      discard;
    }

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
        vec2 local = (globalDocPixel - u_maskRect.xy) / max(u_maskRect.zw, vec2(1.0));

        if (!any(lessThan(local, vec2(0.0))) && !any(greaterThan(local, vec2(1.0)))) {
          eraseAlpha = clamp(texture(u_maskTexture, vec2(local.x, 1.0 - local.y)).a, 0.0, 1.0);
        }
      } else {
        eraseAlpha = clamp(texture(u_maskTexture, v_uv).a, 0.0, 1.0);
      }

      if (u_maskClipMode > 0.5) {
        bool insideMaskClipRect = false;
        bool insideLegacyMaskClipRect =
          globalDocPixel.x >= u_maskClipRect.x &&
          globalDocPixel.y >= u_maskClipRect.y &&
          globalDocPixel.x <= u_maskClipRect.x + u_maskClipRect.z &&
          globalDocPixel.y <= u_maskClipRect.y + u_maskClipRect.w;

        insideMaskClipRect = insideLegacyMaskClipRect && u_maskClipRectCount <= 0;

        for (int i = 0; i < 32; i++) {
          if (i >= u_maskClipRectCount) {
            break;
          }

          vec4 clipRect = u_maskClipRects[i];
          insideMaskClipRect = insideMaskClipRect || (
            globalDocPixel.x >= clipRect.x &&
            globalDocPixel.y >= clipRect.y &&
            globalDocPixel.x <= clipRect.x + clipRect.z &&
            globalDocPixel.y <= clipRect.y + clipRect.w
          );
        }

        if (!insideMaskClipRect) {
          eraseAlpha = 0.0;
        }
      }

      if (u_selectionClipMode > 0.5) {
        vec2 selectionLocal = (globalDocPixel - u_selectionClipRect.xy) / max(u_selectionClipRect.zw, vec2(1.0));
        float selectionAlpha = 0.0;

        if (!any(lessThan(selectionLocal, vec2(0.0))) && !any(greaterThan(selectionLocal, vec2(1.0)))) {
          selectionAlpha = texture(u_selectionClipTexture, vec2(selectionLocal.x, 1.0 - selectionLocal.y)).r;
        }

        eraseAlpha *= selectionAlpha;
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

  const NOISE_FRAGMENT_SHADER_SOURCE = `#version 300 es
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
  vec3 p3 = fract(vec3(p.xyx) * 0.0973);
  p3 += dot(p3, p3.yzx + 19.19);

  return fract((p3.x + p3.y) * p3.z);
}

float noiseSample(vec2 cell, float salt) {
  return hash12(cell + vec2(salt * 1.71, salt * 0.83) + u_seed);
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
  float noiseSize = mix(1.0, 8.0, clamp((u_scale - 1.0) / 99.0, 0.0, 1.0));
  vec2 noiseCell = floor(documentPixel / max(noiseSize, 1.0));
  vec3 color = base.rgb / max(alpha, 0.0001);
  vec3 noise;

  if (u_monochrome > 0.5) {
    float value = noiseSample(noiseCell, 13.0);

    noise = vec3(value);
  } else {
    noise = vec3(
      noiseSample(noiseCell, 7.0),
      noiseSample(noiseCell, 23.0),
      noiseSample(noiseCell, 41.0)
    );
  }

  color = clamp(color + (noise * 2.0 - 1.0) * amount, vec3(0.0), vec3(1.0));
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

  const CURVES_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_curveLut;

in vec2 v_uv;

out vec4 outColor;

float lutCoord(float value) {
  return (clamp(value, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  float alpha = clamp(base.a, 0.0, 1.0);

  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec3 color = clamp(base.rgb / max(alpha, 0.0001), vec3(0.0), vec3(1.0));
  vec3 mapped = vec3(
    texture(u_curveLut, vec2(lutCoord(color.r), 0.5)).r,
    texture(u_curveLut, vec2(lutCoord(color.g), 0.5)).g,
    texture(u_curveLut, vec2(lutCoord(color.b), 0.5)).b
  );

  outColor = vec4(mapped * alpha, alpha);
}
`;

  const LAYER_COMPOSITE_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

uniform vec2 uViewportSize;

out vec2 v_backdropUv;
out vec2 v_viewportPixel;

void main() {
  v_viewportPixel = aUnitCorner * uViewportSize;
  v_backdropUv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(aUnitCorner.x * 2.0 - 1.0, 1.0 - aUnitCorner.y * 2.0, 0.0, 1.0);
}
`;

  const LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_backdropTexture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_clipTexture;
uniform float u_opacity;
uniform int u_blendMode;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;
uniform vec4 u_sourceRect;
uniform float u_maskMode;
uniform vec4 u_maskRect;
uniform float u_maskRectMode;
uniform vec4 u_maskClipRect;
uniform vec4 u_maskClipRects[32];
uniform int u_maskClipRectCount;
uniform float u_maskClipMode;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipOrigin;
uniform vec2 u_clipTextureSize;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;

in vec2 v_backdropUv;
in vec2 v_viewportPixel;

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

bool isInsideUnitRect(vec2 point) {
  return point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0;
}

void main() {
  vec4 backdrop = texture(u_backdropTexture, v_backdropUv);
  float safeZoom = max(abs(uCameraZoom), 0.000001);
  vec2 globalDocPixel = (v_viewportPixel - uCameraPosition) / safeZoom;
  vec2 sourceLocal = (globalDocPixel - u_sourceRect.xy) / max(u_sourceRect.zw, vec2(1.0));
  bool insideSource = isInsideUnitRect(sourceLocal);
  vec2 sourceUv = vec2(sourceLocal.x, 1.0 - sourceLocal.y);
  vec4 source = insideSource ? texture(u_texture, sourceUv) * clamp(u_opacity, 0.0, 1.0) : vec4(0.0);

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
      vec2 local = (globalDocPixel - u_maskRect.xy) / max(u_maskRect.zw, vec2(1.0));

      if (isInsideUnitRect(local)) {
        eraseAlpha = clamp(texture(u_maskTexture, vec2(local.x, 1.0 - local.y)).a, 0.0, 1.0);
      }
    } else if (insideSource) {
      eraseAlpha = clamp(texture(u_maskTexture, sourceUv).a, 0.0, 1.0);
    }

    if (u_maskClipMode > 0.5) {
      bool insideMaskClipRect = false;
      bool insideLegacyMaskClipRect =
        globalDocPixel.x >= u_maskClipRect.x &&
        globalDocPixel.y >= u_maskClipRect.y &&
        globalDocPixel.x <= u_maskClipRect.x + u_maskClipRect.z &&
        globalDocPixel.y <= u_maskClipRect.y + u_maskClipRect.w;

      insideMaskClipRect = insideLegacyMaskClipRect && u_maskClipRectCount <= 0;

      for (int i = 0; i < 32; i++) {
        if (i >= u_maskClipRectCount) {
          break;
        }

        vec4 clipRect = u_maskClipRects[i];
        insideMaskClipRect = insideMaskClipRect || (
          globalDocPixel.x >= clipRect.x &&
          globalDocPixel.y >= clipRect.y &&
          globalDocPixel.x <= clipRect.x + clipRect.z &&
          globalDocPixel.y <= clipRect.y + clipRect.w
        );
      }

      if (!insideMaskClipRect) {
        eraseAlpha = 0.0;
      }
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

    if (isInsideUnitRect(clipUv)) {
      clipAlpha = texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
    }

    source *= clipAlpha;
  }

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
  const MAX_NOISE_AMOUNT = 100;
  const MAX_NOISE_SCALE = 100;
  const DEFAULT_NOISE_SCALE = 1;
  const MAX_THRESHOLD_VALUE = 255;
  const DEFAULT_THRESHOLD_VALUE = 128;
  const PREVIEW_CACHE_ZOOM_THRESHOLD = 1.0;
  const PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD = 10.01;
  const PREVIEW_CACHE_MAX_SIZE = 2048;
  const PREVIEW_CACHE_SCOPE_DEFAULT = "visible-artboards";
  const PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX = 256;

  function isMobileLikeEnvironment() {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return false;
    }

    const hasTouch = Number(navigator.maxTouchPoints) > 0;
    const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
    const userAgent = navigator.userAgent || "";
    const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

    return hasTouch || hasCoarsePointer || hasMobileUserAgent;
  }

  function getNavigatorDeviceMemory() {
    const memory = typeof navigator !== "undefined" ? Number(navigator.deviceMemory) : 0;

    return Number.isFinite(memory) && memory > 0 ? memory : 0;
  }

  function getCanvasPerformanceDpr(options = {}) {
    const rawDpr = Number.isFinite(Number(options.dpr))
      ? Number(options.dpr)
      : (
          typeof window !== "undefined" && Number.isFinite(Number(window.devicePixelRatio))
            ? Number(window.devicePixelRatio)
            : 1
        );
    const isMobile = options.mobileLike === true || (options.mobileLike !== false && isMobileLikeEnvironment());
    const memory = Number.isFinite(Number(options.deviceMemory))
      ? Number(options.deviceMemory)
      : getNavigatorDeviceMemory();
    const defaultCap = isMobile
      ? (memory > 0 && memory <= 4 ? LOW_MEMORY_MOBILE_RENDER_DPR_CAP : MOBILE_RENDER_DPR_CAP)
      : DESKTOP_RENDER_DPR_CAP;
    const namespaceCap = isMobile
      ? Number(namespace.mobileRenderDprCap ?? namespace.maxRenderDpr)
      : Number(namespace.desktopRenderDprCap ?? namespace.maxRenderDpr);
    const optionCap = Number(options.maxRenderDpr);
    const cap = Number.isFinite(optionCap) && optionCap > 0
      ? optionCap
      : Number.isFinite(namespaceCap) && namespaceCap > 0
        ? namespaceCap
        : defaultCap;

    return Math.max(1, Math.min(Math.max(1, rawDpr), cap));
  }

  function getDefaultPreviewCacheMaxSize() {
    return isMobileLikeEnvironment() ? MOBILE_PREVIEW_CACHE_MAX_SIZE : PREVIEW_CACHE_MAX_SIZE;
  }

  function getDefaultPreviewCacheOverscanCssPx() {
    return isMobileLikeEnvironment()
      ? MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX
      : PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX;
  }

  function getDefaultViewportRenderOverscanCssPx() {
    return isMobileLikeEnvironment()
      ? MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX
      : VIEWPORT_RENDER_OVERSCAN_CSS_PX;
  }

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

  function createDefaultCurvesPoints() {
    const engine = getCurvesEngine();

    return engine?.createDefaultPointsByChannel?.() || {
      b: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      g: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      r: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
      rgb: [{ id: "black", x: 0, y: 0, endpoint: true }, { id: "white", x: 255, y: 255, endpoint: true }],
    };
  }

  function normalizeCurvesEffect(effect) {
    const engine = getCurvesEngine();

    if (engine?.normalizeEffect) {
      return engine.normalizeEffect(effect || {});
    }

    return {
      type: "curves",
      enabled: effect?.enabled !== false,
      points: createDefaultCurvesPoints(),
    };
  }

  function hasMeaningfulCurvesEffect(effect) {
    const normalized = normalizeCurvesEffect(effect);
    const engine = getCurvesEngine();

    return normalized.enabled !== false && engine?.hasMeaningfulCurves?.(normalized.points) === true;
  }

  function buildPackedCurvesLut(effect) {
    const engine = getCurvesEngine();
    const normalized = normalizeCurvesEffect(effect);

    return engine?.buildPackedLut?.(normalized.points) || null;
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

      const gl = canvas.getContext("webgl2", WEBGL2_CONTEXT_ATTRIBUTES);

      return namespace.EngineGovernor?.instrumentWebGlContext?.(gl) || gl;
    }

    static getPerformanceDpr(options = {}) {
      return getCanvasPerformanceDpr(options);
    }

    static isMobileLikeEnvironment() {
      return isMobileLikeEnvironment();
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
      const dpr = getCanvasPerformanceDpr();
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
        cssArtboardPaper: options.cssArtboardPaper === true,
        documentWidth: Number.isFinite(options.documentWidth) && options.documentWidth > 0
          ? Math.floor(options.documentWidth)
          : null,
        documentHeight: Number.isFinite(options.documentHeight) && options.documentHeight > 0
          ? Math.floor(options.documentHeight)
          : null,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
        isolateDocumentArtboards: options.isolateDocumentArtboards === true,
        debugViewportCulling: options.debugViewportCulling === true,
        debugViewportCullingLog: options.debugViewportCullingLog === true,
        enableViewportLayerCulling: options.enableViewportLayerCulling === true,
        measureViewportLayerCulling: options.measureViewportLayerCulling === true,
        enableArtboardResidency: options.enableArtboardResidency !== false,
        enableArtboardResidencyBudget: options.enableArtboardResidencyBudget !== false,
        enableArtboardResidencyPrefetch: options.enableArtboardResidencyPrefetch !== false,
        enableArtboardFlatPreviews: options.enableArtboardFlatPreviews !== false,
        enableArtboardTileResidency: options.enableArtboardTileResidency !== false,
        artboardResidencyIdleDelayMs: Number.isFinite(options.artboardResidencyIdleDelayMs) && options.artboardResidencyIdleDelayMs >= 0
          ? Math.floor(options.artboardResidencyIdleDelayMs)
          : ARTBOARD_RESIDENCY_IDLE_DELAY_MS,
        artboardResidencyWarmHoldMs: Number.isFinite(options.artboardResidencyWarmHoldMs) && options.artboardResidencyWarmHoldMs >= 0
          ? Math.floor(options.artboardResidencyWarmHoldMs)
          : ARTBOARD_RESIDENCY_WARM_HOLD_MS,
        artboardResidencySoftBudgetBytes: Number.isFinite(options.artboardResidencySoftBudgetBytes) && options.artboardResidencySoftBudgetBytes > 0
          ? Math.floor(options.artboardResidencySoftBudgetBytes)
          : ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES,
        artboardResidencyHardBudgetBytes: Number.isFinite(options.artboardResidencyHardBudgetBytes) && options.artboardResidencyHardBudgetBytes > 0
          ? Math.floor(options.artboardResidencyHardBudgetBytes)
          : ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES,
        artboardResidencyPrefetchCssPx: Number.isFinite(options.artboardResidencyPrefetchCssPx) && options.artboardResidencyPrefetchCssPx >= 0
          ? Math.floor(options.artboardResidencyPrefetchCssPx)
          : ARTBOARD_RESIDENCY_PREFETCH_CSS_PX,
        artboardFlatPreviewMaxSize: Number.isFinite(options.artboardFlatPreviewMaxSize) && options.artboardFlatPreviewMaxSize > 0
          ? Math.floor(options.artboardFlatPreviewMaxSize)
          : ARTBOARD_FLAT_PREVIEW_MAX_SIZE,
        previewCacheMaxSize: Number.isFinite(options.previewCacheMaxSize) && options.previewCacheMaxSize > 0
          ? Math.floor(options.previewCacheMaxSize)
          : getDefaultPreviewCacheMaxSize(),
        previewCacheOverscanCssPx: Number.isFinite(options.previewCacheOverscanCssPx) && options.previewCacheOverscanCssPx >= 0
          ? Math.floor(options.previewCacheOverscanCssPx)
          : getDefaultPreviewCacheOverscanCssPx(),
        previewCacheScope: typeof options.previewCacheScope === "string" && options.previewCacheScope.trim()
          ? options.previewCacheScope.trim()
          : PREVIEW_CACHE_SCOPE_DEFAULT,
      };
      this.layerModel = options.layerModel ||
        (namespace.DocumentLayerModel
          ? new namespace.DocumentLayerModel({
              ignoreGlobalArtboards: this.options.isolateDocumentArtboards,
            })
          : null);
      this.width = 1;
      this.height = 1;
      this.texture = null;
      this.framebuffer = null;
      this.rasterTargetIdSequence = 1;
      this.paintLayerId = "";
      this.rasterTargetsByLayerId = new Map();
      this.puppetMeshResourcesByLayerId = new Map();
      this.rasterTransformPreview = null;
      this.artboardDragPreview = null;
      this.vectorTextTransformPreviewLayerId = "";
      this.previewTexture = null;
      this.previewFramebuffer = null;
      this.previewCacheWidth = 0;
      this.previewCacheHeight = 0;
      this.previewCacheScale = 1;
      this.previewCacheDocumentRect = null;
      this.previewCacheScopeInfo = null;
      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewDirtyStats = this.createPreviewDirtyStats();
      this.previewCacheReady = false;
      this.previewCacheReason = "init";
      this.viewportCullingStatsSequence = 0;
      this.viewportCullingLastStats = null;
      this.artboardResidencyWarmUntilById = new Map();
      this.artboardResidencyLast = null;
      this.artboardResidencyLastViewOptions = null;
      this.artboardResidencyIdleTimer = 0;
      this.artboardResidencyLastColdStorage = null;
      this.artboardResidencyAccessById = new Map();
      this.artboardResidencyMetricsLast = null;
      this.artboardResidencyPressureLast = null;
      this.artboardFlatPreviewsById = new Map();
      this.artboardFlatPreviewVersion = 1;
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
      this.noiseProgramInfo = null;
      this.thresholdProgramInfo = null;
      this.curvesProgramInfo = null;
      this.curvesLutTexture = null;
      this.layerCompositeProgramInfo = null;
      this.layerCompositeScratchA = null;
      this.layerCompositeScratchB = null;
      this.layerCompositeWidth = 0;
      this.layerCompositeHeight = 0;
      this.layerEffectScratchA = null;
      this.layerEffectScratchB = null;
      this.activeStrokeScratchTarget = null;
      this.activeStrokeSelectionClipTexture = null;
      this.activeStrokeSelectionClipKey = "";
      this.activeStrokeSelectionClipWidth = 0;
      this.activeStrokeSelectionClipHeight = 0;
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
      const scratchBytes = Math.max(0, Math.round(Number(report?.scratchBytes) || 0));

      return (
        policy === "large" ||
        policy === "huge" ||
        report?.scratchBudgetExceeded === true ||
        scratchBytes >= RASTER_SCRATCH_SOFT_EVICT_BYTES
      );
    }

    getRasterScratchDiagnostics(limit = RASTER_SCRATCH_TOP_RESOURCE_LIMIT) {
      const normalizedLimit = Math.max(1, Math.floor(Number(limit) || RASTER_SCRATCH_TOP_RESOURCE_LIMIT));
      const manager = this.getRasterResourceManager();
      const topScratchResources = typeof manager?.getTopScratchResourcesByBytes === "function"
        ? manager.getTopScratchResourcesByBytes(normalizedLimit)
        : (
            typeof manager?.getTopResourcesByBytes === "function"
              ? manager.getTopResourcesByBytes(64).filter((row) => row.ownerType === "scratch").slice(0, normalizedLimit)
              : []
          );

      return {
        activeStrokeScratchTargetPresent: Boolean(this.activeStrokeScratchTarget?.texture),
        activeStrokeScratchTargetSize: this.activeStrokeScratchTarget
          ? {
              height: Math.max(0, Math.round(this.activeStrokeScratchTarget.height || 0)),
              width: Math.max(0, Math.round(this.activeStrokeScratchTarget.width || 0)),
            }
          : null,
        layerEffectScratchAPresent: Boolean(this.layerEffectScratchA?.texture),
        layerEffectScratchASize: this.layerEffectScratchA
          ? {
              height: Math.max(0, Math.round(this.layerEffectScratchA.height || 0)),
              width: Math.max(0, Math.round(this.layerEffectScratchA.width || 0)),
            }
          : null,
        layerEffectScratchBPresent: Boolean(this.layerEffectScratchB?.texture),
        layerEffectScratchBSize: this.layerEffectScratchB
          ? {
              height: Math.max(0, Math.round(this.layerEffectScratchB.height || 0)),
              width: Math.max(0, Math.round(this.layerEffectScratchB.width || 0)),
            }
          : null,
        scratchHardWarnMiB: this.formatRasterMiB(RASTER_SCRATCH_HARD_WARN_BYTES),
        scratchSoftEvictMiB: this.formatRasterMiB(RASTER_SCRATCH_SOFT_EVICT_BYTES),
        topScratchResources: topScratchResources.map((row) => ({
          bbox: row.bbox ? { ...row.bbox } : null,
          bytes: Math.max(0, Math.round(Number(row.bytes) || 0)),
          height: Math.max(0, Math.round(Number(row.height) || 0)),
          isFullCanvas: Boolean(row.isFullCanvas),
          kind: row.kind || "",
          label: row.label || "",
          MiB: row.MiB || row.estimatedMiB || this.formatRasterMiB(row.bytes),
          ownerId: row.ownerId || "",
          ownerType: row.ownerType || "",
          purgeable: Boolean(row.purgeable),
          reason: row.reason || "",
          width: Math.max(0, Math.round(Number(row.width) || 0)),
        })),
      };
    }

    evictRasterScratchCachesForPolicy(report = {}, options = {}) {
      if (!this.shouldEvictRasterScratchForPolicy(report)) {
        return null;
      }

      const policy = this.getRasterOperationPolicy(report);
      const hadPreviewCache = Boolean(this.previewTexture || this.previewFramebuffer);
      const hadEffectScratch = Boolean(this.layerEffectScratchA || this.layerEffectScratchB);
      const hadCompositeScratch = Boolean(this.layerCompositeScratchA || this.layerCompositeScratchB);
      const hadActiveStrokeScratch = Boolean(this.activeStrokeScratchTarget);
      const deletePreviewCache = options.deletePreviewCache !== false;
      const deleteEffectScratch = options.deleteEffectScratch !== false;
      const deleteCompositeScratch = options.deleteCompositeScratch !== false;
      const deleteActiveStrokeScratch = options.deleteActiveStrokeScratch !== false;

      if (deletePreviewCache && hadPreviewCache) {
        this.deletePreviewCache();
      }

      if (deleteEffectScratch && hadEffectScratch) {
        this.deleteLayerEffectScratchTargets();
      }

      if (deleteCompositeScratch && hadCompositeScratch) {
        this.deleteLayerCompositeTargets();
      }

      if (deleteActiveStrokeScratch && hadActiveStrokeScratch) {
        this.deleteActiveStrokeScratchTarget();
      }

      const scratchBytes = Math.max(0, Math.round(Number(report?.scratchBytes) || 0));
      const eviction = {
        createdAt: new Date().toISOString(),
        operationType: report?.operationType || report?.phase || "",
        policy,
        reason: report?.reason || options.reason || "raster-policy",
        scratchBudgetExceeded: scratchBytes >= RASTER_SCRATCH_SOFT_EVICT_BYTES,
        scratchBytes,
        scratchDiagnostics: this.getRasterScratchDiagnostics?.() || null,
        scratchHardBudgetExceeded: scratchBytes >= RASTER_SCRATCH_HARD_WARN_BYTES,
        scratchHardWarnMiB: this.formatRasterMiB(RASTER_SCRATCH_HARD_WARN_BYTES),
        scratchMiB: this.formatRasterMiB(scratchBytes),
        scratchSoftEvictMiB: this.formatRasterMiB(RASTER_SCRATCH_SOFT_EVICT_BYTES),
        source: options.source || report?.source || report?.tool || "raster-policy",
        deletedActiveStrokeScratch: deleteActiveStrokeScratch && hadActiveStrokeScratch,
        deletedCompositeScratch: deleteCompositeScratch && hadCompositeScratch,
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
      const targetWidth = Math.max(1, Math.round(target?.width || 1));
      const targetHeight = Math.max(1, Math.round(target?.height || 1));
      const width = Math.max(1, Math.round(
        metadata.width ?? target?.resourceWidth ?? target?.textureWidth ?? targetWidth,
      ));
      const height = Math.max(1, Math.round(
        metadata.height ?? target?.resourceHeight ?? target?.textureHeight ?? targetHeight,
      ));
      const x = Number.isFinite(target?.x) ? Math.round(target.x) : 0;
      const y = Number.isFinite(target?.y) ? Math.round(target.y) : 0;
      const ownerId = metadata.ownerId || metadata.layerId || target?.layerId || target?.id || "";
      const bboxSource = metadata.bbox || metadata.rect || null;
      const bbox = {
        x: Number.isFinite(bboxSource?.x) ? Math.round(bboxSource.x) : x,
        y: Number.isFinite(bboxSource?.y) ? Math.round(bboxSource.y) : y,
        width: Math.max(1, Math.round(bboxSource?.width || targetWidth)),
        height: Math.max(1, Math.round(bboxSource?.height || targetHeight)),
      };

      return this.withRasterResourceDocumentMetadata({
        ...metadata,
        bbox,
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
      if (this.isCopyOnWriteRasterTarget(target)) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.estimateRasterTargetBytes(tile);
        });

        return total;
      }

      const width = Math.max(0, Math.round(target?.width || 0));
      const height = Math.max(0, Math.round(target?.height || 0));

      return width * height * RASTER_BYTES_PER_PIXEL;
    }

    estimateRasterTargetDuplicateBytes(target, options = {}) {
      if (!target) {
        return 0;
      }

      return options.copyOnWrite === false
        ? this.estimateRasterTargetBytes(target)
        : 0;
    }

    isSparseRasterTarget(target) {
      return Boolean(target?.sparse === true && target.tiles instanceof Map);
    }

    isCopyOnWriteRasterTarget(target) {
      return Boolean(target?.copyOnWrite === true && target.copyOnWriteSource);
    }

    hasCopyOnWriteDependents(target) {
      return Math.max(0, Math.round(Number(target?.copyOnWriteRefCount) || 0)) > 0;
    }

    needsCopyOnWriteDetach(target) {
      return Boolean(this.isCopyOnWriteRasterTarget(target) || this.hasCopyOnWriteDependents(target));
    }

    getCopyOnWriteSourceTarget(target) {
      let source = target;

      while (source?.copyOnWrite === true && source.copyOnWriteSource) {
        source = source.copyOnWriteSource;
      }

      return source || target;
    }

    addCopyOnWriteReference(sourceTarget) {
      const source = this.getCopyOnWriteSourceTarget(sourceTarget);

      if (!source) {
        return null;
      }

      source.copyOnWriteRefCount = Math.max(0, Math.round(Number(source.copyOnWriteRefCount) || 0)) + 1;

      return source;
    }

    releaseCopyOnWriteReference(target) {
      if (!this.isCopyOnWriteRasterTarget(target)) {
        return;
      }

      const source = target.copyOnWriteSource;

      target.copyOnWrite = false;
      target.copyOnWriteSource = null;
      target.copyOnWriteSourceLayerId = "";
      target.framebuffer = null;
      target.texture = null;
      target.tiles = new Map();
      target.state = "DELETED";

      if (!source) {
        return;
      }

      source.copyOnWriteRefCount = Math.max(0, Math.round(Number(source.copyOnWriteRefCount) || 0) - 1);

      if (source.copyOnWriteRefCount === 0 && source.copyOnWriteDeleted === true) {
        source.copyOnWriteDeleted = false;
        this.deleteRasterTargetObject(source);
      }
    }

    createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      if (!sourceLayerId || !destinationLayerId) {
        return null;
      }

      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);
      const source = this.addCopyOnWriteReference(sourceTarget);

      if (!source) {
        return null;
      }

      const sourceRect = this.getRasterTargetDocumentRect(source);
      const target = {
        clearColor: Array.isArray(source.clearColor) ? [...source.clearColor] : [0, 0, 0, 0],
        copyOnWrite: true,
        copyOnWriteSource: source,
        copyOnWriteSourceLayerId: sourceLayerId,
        cropped: source.cropped === true,
        framebuffer: this.isSparseRasterTarget(source) ? null : source.framebuffer,
        height: Math.max(1, Math.round(source.height || sourceRect?.height || this.height || 1)),
        id: `raster-cow-target-${this.rasterTargetIdSequence++}`,
        layerId: destinationLayerId,
        materializedFromSparse: source.materializedFromSparse === true,
        sparse: source.sparse === true,
        sparseTileSize: source.sparseTileSize || source.tileSize,
        texture: this.isSparseRasterTarget(source) ? null : source.texture,
        tileSize: source.tileSize,
        tiles: this.isSparseRasterTarget(source) ? source.tiles : new Map(),
        version: source.version || 0,
        width: Math.max(1, Math.round(source.width || sourceRect?.width || this.width || 1)),
        x: Number.isFinite(source.x) ? Math.round(source.x) : sourceRect?.x || 0,
        y: Number.isFinite(source.y) ? Math.round(source.y) : sourceRect?.y || 0,
      };

      target.copyOnWriteReason = options.source || "copy-on-write-duplicate";

      return target;
    }

    cloneRasterTargetForCopyOnWrite(sourceTarget, destinationLayerId, options = {}) {
      const source = this.getCopyOnWriteSourceTarget(sourceTarget);
      const reason = options.source || "copy-on-write-detach";

      if (!source || !destinationLayerId) {
        return null;
      }

      if (this.isSparseRasterTarget(source)) {
        const destinationTarget = this.createSparseRasterTarget(destinationLayerId, {
          clearColor: source.clearColor,
          tileSize: source.tileSize,
        });
        let copiedCount = 0;

        for (const sourceTile of source.tiles.values()) {
          if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
            kind: "paintTile",
            label: `${destinationLayerId} COW tile ${sourceTile.tx},${sourceTile.ty}`,
            layerId: destinationLayerId,
            ownerId: `${destinationLayerId}:${sourceTile.tx}:${sourceTile.ty}`,
            ownerType: "live",
            reason,
          })) {
            this.deleteRasterTargetObject(destinationTarget);
            return null;
          }

          const tileRect = this.getRasterTargetDocumentRect(sourceTile);
          const destinationTile = this.ensureSparseRasterTileTarget(destinationLayerId, destinationTarget, {
            tileRect,
            tx: sourceTile.tx,
            ty: sourceTile.ty,
          }, {
            source: reason,
          });

          if (!destinationTile || !this.copyRasterTargetRectToTarget(sourceTile, tileRect, destinationTile)) {
            this.deleteRasterTargetObject(destinationTarget);
            return null;
          }

          copiedCount += 1;
        }

        if (copiedCount === 0 && source.tiles.size > 0) {
          this.deleteRasterTargetObject(destinationTarget);
          return null;
        }

        destinationTarget.layerId = destinationLayerId;
        destinationTarget.version = (source.version || 0) + 1;
        return destinationTarget;
      }

      if ((!source.texture || !source.framebuffer) && !this.hydrateRasterTarget(source, {
        kind: "layer",
        label: destinationLayerId,
        layerId: destinationLayerId,
        ownerId: destinationLayerId,
        ownerType: "live",
        reason,
      })) {
        return null;
      }

      const sourceRect = this.getRasterTargetDocumentRect(source);
      const clearColor = Array.isArray(source.clearColor) ? [...source.clearColor] : [0, 0, 0, 0];
      const destinationTarget = this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRasterTarget(source),
        height: sourceRect.height,
        layerId: destinationLayerId,
        reason,
        width: sourceRect.width,
        x: sourceRect.x,
        y: sourceRect.y,
      });

      if (!destinationTarget?.framebuffer || !destinationTarget?.texture) {
        return null;
      }

      if (!this.copyRasterTargetRectToTarget(source, sourceRect, destinationTarget)) {
        this.deleteRasterTargetObject(destinationTarget);
        return null;
      }

      destinationTarget.layerId = destinationLayerId;
      destinationTarget.materializedFromSparse = source.materializedFromSparse === true;
      destinationTarget.sparseTileSize = source.sparseTileSize || source.tileSize;

      return destinationTarget;
    }

    installRasterTargetForLayer(layerId, nextTarget, options = {}) {
      if (!layerId || !nextTarget) {
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);

      nextTarget.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, nextTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = this.isSparseRasterTarget(nextTarget) ? null : nextTarget.texture;
        this.framebuffer = this.isSparseRasterTarget(nextTarget) ? null : nextTarget.framebuffer;
      }

      if (!this.isSparseRasterTarget(nextTarget) && !this.isCopyOnWriteRasterTarget(nextTarget)) {
        const nextKind =
          layerId === "background"
            ? "background"
            : this.isPaintRasterLayer(layerId, nextTarget)
              ? "paintTarget"
              : "layer";

        this.updateRasterTargetResourceMetadata(nextTarget, {
          kind: nextKind,
          label: options.label || layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.source || "install-raster-target",
        });
      }

      if (previousTarget && previousTarget !== nextTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);

      if (options.invalidate !== false || options.emit !== false) {
        this.commitVisualDirtyChange({
          emit: options.emit,
          invalidate: options.invalidate,
          layerId,
          rect: this.getRasterTargetDocumentRect(nextTarget),
          source: options.source || "install-raster-target",
          usePreviewDirtyTiles: true,
        });
      }

      return true;
    }

    ensureWritableRasterTarget(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return null;
      }

      if (target.state === "CPU_COLD" && (!target.texture || !target.framebuffer)) {
        this.hydrateRasterTarget(target, {
          kind: this.isSparseRasterTarget(target) ? "paintTile" : "layer",
          label: options.label || layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.source || "ensure-writable-raster-target-hydrate",
        });
      }

      if (!this.needsCopyOnWriteDetach(target)) {
        return target || null;
      }

      const nextTarget = this.cloneRasterTargetForCopyOnWrite(target, layerId, {
        source: options.source || "copy-on-write-detach",
      });

      if (!nextTarget) {
        return target;
      }

      if (!this.installRasterTargetForLayer(layerId, nextTarget, {
        emit: false,
        invalidate: false,
        label: options.label || layerId,
        source: options.source || "copy-on-write-detach",
      })) {
        this.deleteRasterTargetObject(nextTarget);
        return target;
      }

      return nextTarget;
    }

    createSparseRasterTarget(layerId, options = {}) {
      const tileSize = this.getRasterHistoryTileSize({
        tileSize: options.tileSize || options.liveTileSize,
      });

      return {
        clearColor: Array.isArray(options.clearColor) ? [...options.clearColor] : [0, 0, 0, 0],
        cropped: false,
        framebuffer: null,
        height: Math.max(1, Math.round(this.height || 1)),
        id: `sparse-raster-target-${this.rasterTargetIdSequence++}`,
        layerId,
        sparse: true,
        texture: null,
        tileSize,
        tiles: new Map(),
        version: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };
    }

    getSparseTileKey(tx, ty) {
      return `${Math.round(Number(tx) || 0)}:${Math.round(Number(ty) || 0)}`;
    }

    getSparseRasterTileRects(rect, options = {}) {
      return this.getRasterHistoryTileRects(rect, {
        clampToDocument: options.clampToDocument,
        patchRects: options.patchRects,
        tileSize: options.tileSize || options.liveTileSize,
        tilePatchRects: options.tilePatchRects,
      });
    }

    getSparseRasterTile(target, tx, ty) {
      return this.isSparseRasterTarget(target)
        ? target.tiles.get(this.getSparseTileKey(tx, ty)) || null
        : null;
    }

    ensureSparseRasterTileTarget(layerId, sparseTarget, tile, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !tile?.tileRect) {
        return null;
      }

      const key = this.getSparseTileKey(tile.tx, tile.ty);
      const existingTile = sparseTarget.tiles.get(key);

      if (existingTile?.framebuffer && existingTile?.texture) {
        return existingTile;
      }

      if (existingTile?.state === "CPU_COLD" && this.hydrateRasterTarget(existingTile, {
        kind: options.kind || existingTile.kind || "paintTile",
        label: options.label || `${layerId} tile ${tile.tx},${tile.ty}`,
        layerId,
        ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.source || "sparse-tile-hydrate",
      })) {
        return existingTile;
      }

      const clearColor = Array.isArray(sparseTarget.clearColor)
        ? [...sparseTarget.clearColor]
        : [0, 0, 0, 0];
      const tileRect = tile.tileRect || tile.rect;
      const tileTarget = this.createRasterTarget(clearColor, {
        cropped: true,
        height: tileRect.height,
        kind: "paintTile",
        label: `${layerId} tile ${tile.tx},${tile.ty}`,
        layerId,
        ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.source || "create-sparse-raster-tile",
        width: tileRect.width,
        x: tileRect.x,
        y: tileRect.y,
      });

      tileTarget.layerId = layerId;
      tileTarget.parentTargetId = sparseTarget.id;
      tileTarget.tileKey = key;
      tileTarget.tx = tile.tx;
      tileTarget.ty = tile.ty;
      sparseTarget.tiles.set(key, tileTarget);

      return tileTarget;
    }

    ensureSparseRasterTargetForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return null;
      }

      let sparseTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (!this.isSparseRasterTarget(sparseTarget)) {
        if (sparseTarget?.framebuffer || sparseTarget?.texture) {
          return null;
        }

        sparseTarget = this.createSparseRasterTarget(layerId, options);
        this.rasterTargetsByLayerId.set(layerId, sparseTarget);
      }

      const tileTargets = [];
      const maxNewTiles = Number.isFinite(Number(options.maxNewTiles))
        ? Math.max(0, Math.round(Number(options.maxNewTiles)))
        : Infinity;
      let newTileCount = 0;

      for (const tile of this.getSparseRasterTileRects(requiredRect, {
        patchRects: options.patchRects,
        tileSize: sparseTarget.tileSize,
        tilePatchRects: options.tilePatchRects,
      })) {
        const key = this.getSparseTileKey(tile.tx, tile.ty);
        const hadTile = sparseTarget.tiles.has(key);

        if (!hadTile && newTileCount >= maxNewTiles) {
          continue;
        }

        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, options);

        if (tileTarget) {
          if (!hadTile && this.isTransparentRasterClearColor(sparseTarget.clearColor)) {
            tileTarget.freshEmptyPaintTile = true;
          }

          if (!hadTile) {
            newTileCount += 1;
          }

          tileTargets.push({
            patchRect: tile.patchRect ? { ...tile.patchRect } : { ...tile.rect },
            rect: tile.rect ? { ...tile.rect } : { ...tile.patchRect },
            target: tileTarget,
            tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
            tx: tile.tx,
            ty: tile.ty,
          });
        }
      }

      if (tileTargets.length === 0) {
        return null;
      }

      sparseTarget.layerId = layerId;
      sparseTarget.version = (sparseTarget.version || 0) + 1;

      return {
        layerId,
        sparseTarget,
        targets: tileTargets,
      };
    }

    dehydrateRasterTarget(target, options = {}) {
      if (!target) {
        return false;
      }

      if (this.needsCopyOnWriteDetach(target)) {
        return false;
      }

      if (this.isSparseRasterTarget(target)) {
        let didCool = false;
        let totalCpuBytes = 0;
        let totalRawBytes = 0;

        target.tiles.forEach((tile) => {
          didCool = this.dehydrateRasterTarget(tile, options) || didCool;
          totalCpuBytes += Math.max(0, Math.round(Number(tile.cpuBytes) || Number(tile.cpuPixels?.byteLength) || 0));
          totalRawBytes += Math.max(0, Math.round(Number(tile.cpuRawBytes) || Number(tile.cpuBytes) || Number(tile.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(tile)));
        });
        target.state = "CPU_COLD";
        target.cpuBytes = totalCpuBytes;
        target.cpuRawBytes = totalRawBytes;

        return didCool || target.tiles.size === 0;
      }

      if (target.state === "CPU_COLD") {
        return true;
      }

      if (!target.framebuffer || !target.texture) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const pixels = new Uint8Array(width * height * RASTER_BYTES_PER_PIXEL);
      const gl = this.gl;

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer?.(gl.FRAMEBUFFER, null);
        console.warn?.("[CBO renderer] Impossibile raffreddare target raster.", error);
        return false;
      }

      this.deleteRasterFramebuffer?.(target.framebuffer || target.framebufferResourceId);
      gl.deleteFramebuffer?.(target.framebuffer);
      target.framebuffer = null;
      target.framebufferResourceId = "";

      this.deleteRasterTexture?.(target.texture || target.textureResourceId);
      gl.deleteTexture?.(target.texture);
      target.texture = null;
      target.textureResourceId = "";

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
          console.warn?.("[CBO renderer] Compressione RLE target raster fallita, salvo raw.", error);
          storedPixels = pixels;
          storedEncoding = null;
        }
      }

      target.cpuBytes = storedPixels.byteLength;
      target.cpuPixels = storedPixels;
      target.cpuPixelsEncoding = storedEncoding;
      target.cpuRawBytes = rawByteLength;
      target.state = "CPU_COLD";
      target.reason = options.reason || target.reason || "raster-target-cpu-cold";

      return true;
    }

    hydrateRasterTarget(target, options = {}) {
      if (!target) {
        return false;
      }

      if (this.isSparseRasterTarget(target)) {
        let didHydrate = target.tiles.size === 0;
        const layerId = options.layerId || target.layerId || "";

        target.tiles.forEach((tile) => {
          const tileOwnerId = layerId
            ? `${layerId}:${tile.tx}:${tile.ty}`
            : options.ownerId || tile.ownerId || tile.id || "";

          didHydrate = this.hydrateRasterTarget(tile, {
            ...options,
            kind: options.kind || tile.kind || "paintTile",
            label: options.label || `${layerId} tile ${tile.tx},${tile.ty}`,
            layerId,
            ownerId: tileOwnerId,
          }) || didHydrate;
        });
        target.state = "GPU_HOT";
        target.cpuBytes = 0;
        target.cpuRawBytes = 0;

        return didHydrate;
      }

      if (target.texture && target.framebuffer) {
        return true;
      }

      if (!(target.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const compression = window.CBO?.HistoryCompression;
      let uploadPixels = target.cpuPixels;

      if (target.cpuPixelsEncoding) {
        if (!compression?.isCompressedEncoding?.(target.cpuPixelsEncoding)) {
          return false;
        }

        try {
          uploadPixels = compression.decompressRgba(
            target.cpuPixels,
            Number(target.cpuRawBytes) || width * height * RASTER_BYTES_PER_PIXEL,
            target.cpuPixelsEncoding,
          );
        } catch (error) {
          console.warn?.("[CBO renderer] Decompressione RLE target raster fallita.", error);
          return false;
        }
      }

      const nextTarget = this.createRasterTarget(target.clearColor || [0, 0, 0, 0], {
        cropped: target.cropped === true,
        height,
        kind: options.kind || "layer",
        label: options.label || target.layerId || target.id || "raster target",
        layerId: options.layerId || target.layerId || "",
        ownerId: options.ownerId || options.layerId || target.layerId || target.id || "",
        ownerType: options.ownerType || "live",
        purgeable: options.purgeable === true,
        reason: options.reason || "raster-target-hydrate",
        width,
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
      });
      const gl = this.gl;

      try {
        gl.bindTexture(gl.TEXTURE_2D, nextTarget.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);
        gl.bindTexture(gl.TEXTURE_2D, null);
      } catch (error) {
        gl.bindTexture?.(gl.TEXTURE_2D, null);
        this.deleteRasterTargetObject(nextTarget);
        console.warn?.("[CBO renderer] Impossibile riattivare target raster.", error);
        return false;
      }

      this.markRasterTargetDirty(nextTarget);
      Object.assign(target, nextTarget, {
        cpuBytes: 0,
        cpuPixels: null,
        cpuPixelsEncoding: null,
        cpuRawBytes: 0,
        state: "GPU_HOT",
      });

      return true;
    }

    estimateRasterSnapshotBytes(snapshot) {
      return this.getRasterRectBytes(snapshot?.rect || snapshot?.targetRect);
    }

    isTransparentRasterClearColor(clearColor) {
      const color = Array.isArray(clearColor) ? clearColor : [0, 0, 0, 0];
      const alpha = Number(color[3]);

      return !Number.isFinite(alpha) || alpha <= 0;
    }

    createEmptyRasterSnapshot(layerId, rect, label = "empty raster snapshot") {
      const docRect = this.getClampedDocumentRect(rect);

      if (!layerId || !docRect) {
        return null;
      }

      return {
        bytes: 0,
        empty: true,
        id: `empty-raster-snapshot-${this.rasterTargetIdSequence++}`,
        label,
        layerId,
        rect: { ...docRect },
        state: "EMPTY",
        targetRect: { ...docRect },
      };
    }

    getRasterHistoryTileSize(options = {}) {
      const fallback = this.isMobileLikeDevice?.() ? RASTER_HISTORY_MOBILE_TILE_SIZE : RASTER_HISTORY_TILE_SIZE;
      const requested = Number(options.tileSize ?? options.historyTileSize ?? fallback);

      if (!Number.isFinite(requested) || requested <= 0) {
        return fallback;
      }

      return Math.max(16, Math.min(1024, Math.round(requested)));
    }

    getPreviewCacheMaxSize() {
      const fallback = this.isMobileLikeDevice?.() ? MOBILE_PREVIEW_CACHE_MAX_SIZE : PREVIEW_CACHE_MAX_SIZE;
      const requested = Number(this.options?.previewCacheMaxSize ?? fallback);

      return Math.max(1, Math.floor(Number.isFinite(requested) && requested > 0 ? requested : fallback));
    }

    getPreviewCacheOverscanCssPx() {
      const fallback = this.isMobileLikeDevice?.()
        ? MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX
        : PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX;
      const requested = Number(this.options?.previewCacheOverscanCssPx ?? fallback);

      return Math.max(0, Math.floor(Number.isFinite(requested) && requested >= 0 ? requested : fallback));
    }

    getViewportRenderOverscanCssPx(options = {}) {
      if (Number.isFinite(Number(options.viewportRenderOverscanCssPx))) {
        return Math.max(0, Number(options.viewportRenderOverscanCssPx));
      }

      return getDefaultViewportRenderOverscanCssPx();
    }

    getRasterHistoryTileBounds(tx, ty, options = {}) {
      const tileSize = this.getRasterHistoryTileSize(options);
      const documentRect = this.getDocumentBoundsRect();
      const tileX = tx * tileSize;
      const tileY = ty * tileSize;

      if (options.clampToDocument === false) {
        return {
          height: tileSize,
          width: tileSize,
          x: tileX,
          y: tileY,
        };
      }

      const x0 = Math.max(documentRect.x, tileX);
      const y0 = Math.max(documentRect.y, tileY);
      const x1 = Math.min(tileX + tileSize, documentRect.x + documentRect.width);
      const y1 = Math.min(tileY + tileSize, documentRect.y + documentRect.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }

    emitRasterHistoryTileDebug(detail = {}) {
      if (namespace.debugRasterHistoryTiles !== true) {
        return;
      }

      const tx = Math.round(Number(detail.tx) || 0);
      const ty = Math.round(Number(detail.ty) || 0);
      const tileSize = this.getRasterHistoryTileSize({ tileSize: detail.tileSize });
      const tileRect = detail.tileRect || this.getRasterHistoryTileBounds(tx, ty, { tileSize });
      const patchRect = detail.patchRect || detail.rect || null;

      if (!tileRect || !patchRect) {
        return;
      }

      window.dispatchEvent(new CustomEvent("cbo:raster-history-tile-debug", {
        detail: {
          bytes: Math.max(0, Math.round(Number(detail.bytes) || 0)),
          layerId: detail.layerId || "",
          patchRect: { ...patchRect },
          phase: detail.phase || "tile",
          source: detail.source || "",
          tileRect: { ...tileRect },
          tileSize,
          tx,
          ty,
        },
      }));
    }

    getRasterHistoryTileRects(rect, options = {}) {
      const captureRect = options.clampToDocument === false
        ? this.getUnclampedDocumentRect(rect)
        : this.getClampedDocumentRect(rect);

      if (!captureRect) {
        return [];
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const startTx = Math.floor(captureRect.x / tileSize);
      const startTy = Math.floor(captureRect.y / tileSize);
      const endTx = Math.floor((captureRect.x + captureRect.width - 1) / tileSize);
      const endTy = Math.floor((captureRect.y + captureRect.height - 1) / tileSize);
      const patchLookup = this.getRasterHistoryPatchLookup(options.tilePatchRects || options.patchRects, { tileSize });
      const rects = [];

      for (let ty = startTy; ty <= endTy; ty += 1) {
        for (let tx = startTx; tx <= endTx; tx += 1) {
          const tileRect = this.getRasterHistoryTileBounds(tx, ty, {
            clampToDocument: options.clampToDocument,
            tileSize,
          });

          if (!tileRect) {
            continue;
          }

          const lookupPatchRect = patchLookup?.get(`${tx}:${ty}`) || null;
          const capturePatchRect = this.intersectRasterHistoryRects(tileRect, captureRect);
          if (patchLookup && !lookupPatchRect) {
            continue;
          }
          const patchRect = lookupPatchRect
            ? this.intersectRasterHistoryRects(lookupPatchRect, capturePatchRect)
            : capturePatchRect;

          if (!patchRect) {
            continue;
          }

          rects.push({
            patchRect: { ...patchRect },
            rect: { ...patchRect },
            tileRect: { ...tileRect },
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

    intersectRasterHistoryRects(a, b) {
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
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    }

    containsRasterHistoryRect(container, rect) {
      return Boolean(
        container &&
        rect &&
        rect.x >= container.x &&
        rect.y >= container.y &&
        rect.x + rect.width <= container.x + container.width &&
        rect.y + rect.height <= container.y + container.height
      );
    }

    getRasterHistoryPatchLookup(patchRects = null, options = {}) {
      const items = patchRects instanceof Map
        ? Array.from(patchRects.values())
        : Array.isArray(patchRects)
          ? patchRects
          : [];

      if (items.length === 0) {
        return null;
      }

      const tileSize = this.getRasterHistoryTileSize(options);
      const lookup = new Map();

      for (const item of items) {
        const sourceRect = item?.patchRect || item?.rect || item;
        const rect = this.getClampedDocumentRect(sourceRect);

        if (!rect) {
          continue;
        }

        const startTx = Math.floor(rect.x / tileSize);
        const startTy = Math.floor(rect.y / tileSize);
        const endTx = Math.floor((rect.x + rect.width - 1) / tileSize);
        const endTy = Math.floor((rect.y + rect.height - 1) / tileSize);

        for (let ty = startTy; ty <= endTy; ty += 1) {
          for (let tx = startTx; tx <= endTx; tx += 1) {
            const tileRect = this.getRasterHistoryTileBounds(tx, ty, { tileSize });
            const patchRect = this.intersectRasterHistoryRects(tileRect, rect);

            if (!patchRect) {
              continue;
            }

            const key = `${tx}:${ty}`;
            lookup.set(key, this.unionRasterHistoryRects(lookup.get(key), patchRect));
          }
        }
      }

      return lookup.size > 0 ? lookup : null;
    }

    copyRasterSnapshotToSnapshot(sourceSnapshot, destSnapshot) {
      if (!sourceSnapshot || !destSnapshot) {
        return false;
      }

      if ((!sourceSnapshot.framebuffer || !sourceSnapshot.texture) && !this.hydrateRasterSnapshot(sourceSnapshot)) {
        return false;
      }

      if ((!destSnapshot.framebuffer || !destSnapshot.texture) && !this.hydrateRasterSnapshot(destSnapshot)) {
        return false;
      }

      if (!sourceSnapshot.framebuffer || !destSnapshot.framebuffer || !sourceSnapshot.rect || !destSnapshot.rect) {
        return false;
      }

      const sourceRect = sourceSnapshot.rect;
      const destRect = destSnapshot.rect;
      const destX0 = sourceRect.x - destRect.x;
      const destY0 = destRect.height - ((sourceRect.y - destRect.y) + sourceRect.height);
      const destX1 = destX0 + sourceRect.width;
      const destY1 = destY0 + sourceRect.height;

      if (
        destX0 < 0 ||
        destY0 < 0 ||
        destX1 > destRect.width ||
        destY1 > destRect.height
      ) {
        return false;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceSnapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destSnapshot.framebuffer);
      gl.blitFramebuffer(
        0,
        0,
        sourceRect.width,
        sourceRect.height,
        destX0,
        destY0,
        destX1,
        destY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

      return true;
    }

    expandRasterTileHistoryDelta(capture, delta, nextRect, options = {}) {
      if (!capture || !delta || !nextRect) {
        return false;
      }

      if (this.containsRasterHistoryRect(delta.rect, nextRect)) {
        return true;
      }

      const label = options.label || capture.label || options.source || "raster-tile-history";
      const layerId = delta.layerId || capture.layerId;
      const unionRect = this.unionRasterHistoryRects(delta.rect, nextRect);
      const previousBefore = delta.before;

      if (previousBefore?.empty === true) {
        const nextBefore = this.createEmptyRasterSnapshot(
          layerId,
          unionRect,
          `${label}-before-tile-${delta.tx}-${delta.ty}-expanded`,
        );

        if (!nextBefore) {
          return false;
        }

        this.deleteRasterSnapshot(previousBefore);
        this.deleteRasterSnapshot(delta.after);
        delta.after = null;
        delta.before = nextBefore;
        delta.rect = nextBefore.rect ? { ...nextBefore.rect } : { ...unionRect };

        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: nextBefore.bytes,
            layerId,
            patchRect: delta.rect,
            phase: "before-expand-empty",
            source: label,
            tileRect: delta.tileRect,
            tileSize: capture.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }

        return true;
      }

      const nextBefore = this.createRasterSnapshot(
        layerId,
        unionRect,
        `${label}-before-tile-${delta.tx}-${delta.ty}-expanded`,
      );

      if (!nextBefore?.texture && !nextBefore?.cpuPixels) {
        return false;
      }

      if (!this.copyRasterSnapshotToSnapshot(previousBefore, nextBefore)) {
        this.deleteRasterSnapshot(nextBefore);
        return false;
      }

      this.deleteRasterSnapshot(previousBefore);
      this.deleteRasterSnapshot(delta.after);
      delta.after = null;
      delta.before = nextBefore;
      delta.rect = nextBefore.rect ? { ...nextBefore.rect } : { ...unionRect };

      if (namespace.debugRasterHistoryTiles === true) {
        this.emitRasterHistoryTileDebug({
          bytes: nextBefore.bytes,
          layerId,
          patchRect: delta.rect,
          phase: "before-expand",
          source: label,
          tileRect: delta.tileRect,
          tileSize: capture.tileSize,
          tx: delta.tx,
          ty: delta.ty,
        });
      }

      return true;
    }

    createRasterTileHistoryBeforeSnapshot(layerId, tile, label = "raster-tile-history") {
      const target = this.rasterTargetsByLayerId.get(layerId) || this.getRasterTarget(layerId);
      const snapshotLabel = `${label}-before-tile-${tile.tx}-${tile.ty}`;

      if (this.isSparseRasterTarget(target)) {
        const tileTarget = this.getSparseRasterTile(target, tile.tx, tile.ty);

        if (tileTarget?.freshEmptyPaintTile === true && this.isTransparentRasterClearColor(target.clearColor)) {
          tileTarget.freshEmptyPaintTile = false;
          return this.createEmptyRasterSnapshot(layerId, tile.rect, snapshotLabel);
        }
      }

      return this.createRasterSnapshot(layerId, tile.rect, snapshotLabel);
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
      const existingDeltas = new Map(capture.tileDeltas.map((delta) => [`${delta.storeId}:${delta.tx}:${delta.ty}`, delta]));
      const label = options.label || capture.label || options.source || "raster-tile-history";
      const layerId = options.layerId || capture.layerId;

      for (const tile of this.getRasterHistoryTileRects(captureRect, {
        patchRects: options.patchRects,
        tilePatchRects: options.tilePatchRects,
        tileSize,
      })) {
        const storeId = `LayerPixels:${layerId}`;
        const key = `${storeId}:${tile.tx}:${tile.ty}`;
        const existingDelta = existingDeltas.get(key);

        if (existingDelta) {
          if (!this.expandRasterTileHistoryDelta(capture, existingDelta, tile.rect, { label, source: options.source })) {
            return false;
          }
          continue;
        }

        const before = this.createRasterTileHistoryBeforeSnapshot(layerId, tile, label);

        if (before?.empty !== true && !before?.texture && !before?.cpuPixels) {
          return false;
        }

        capture.tileDeltas.push({
          after: null,
          before,
          layerId,
          rect: before.rect ? { ...before.rect } : { ...tile.rect },
          storeId,
          tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
          tx: tile.tx,
          ty: tile.ty,
        });
        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: before.bytes,
            layerId,
            patchRect: before.rect ? { ...before.rect } : { ...tile.rect },
            phase: "before",
            source: label,
            tileRect: tile.tileRect || tile.rect,
            tileSize,
            tx: tile.tx,
            ty: tile.ty,
          });
        }
        existingDeltas.set(key, capture.tileDeltas[capture.tileDeltas.length - 1]);
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

      if (options.silentBeforeRasterHistoryCapture !== true) {
        window.dispatchEvent(new CustomEvent("cbo:before-raster-history-capture", {
          detail: {
            layerId,
            label: options.label || "",
            source: options.source || options.label || "raster-tile-history",
          },
        }));
      }

      const target = this.rasterTargetsByLayerId.get(layerId) || this.getRasterTarget(layerId);
      const captureRect = this.getClampedDocumentRect(dirtyRect);

      if ((!this.isSparseRasterTarget(target) && (!target?.framebuffer || !target?.texture)) || !captureRect) {
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

      if (!this.extendRasterTileHistory(capture, captureRect, {
        label,
        layerId,
        patchRects: options.patchRects,
        tilePatchRects: options.tilePatchRects,
        tileSize,
      })) {
        this.deleteRasterTileHistoryCapture(capture);
        return null;
      }

      return capture;
    }

    hasRasterTileHistorySnapshot(snapshot) {
      return Boolean(snapshot && (snapshot.empty === true || snapshot.texture || snapshot.framebuffer || snapshot.cpuPixels));
    }

    captureRasterTileHistoryAfterSnapshots(entry, options = {}) {
      if (!entry || !Array.isArray(entry.tileDeltas) || entry.tileDeltas.length === 0) {
        return false;
      }

      const label = options.label || entry.label || options.source || "raster-tile-history";
      const createdDeltas = [];

      for (const delta of entry.tileDeltas) {
        if (this.hasRasterTileHistorySnapshot(delta.after)) {
          continue;
        }

        const after = this.createRasterSnapshot(
          delta.layerId || entry.layerId,
          delta.rect,
          `${label}-after-tile-${delta.tx}-${delta.ty}`,
        );

        if (!after?.texture && !after?.cpuPixels) {
          for (const createdDelta of createdDeltas) {
            this.deleteRasterSnapshot(createdDelta.after);
            createdDelta.after = null;
          }

          entry.afterCaptureFailed = true;
          return false;
        }

        delta.after = after;
        createdDeltas.push(delta);
        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: after.bytes,
            layerId: delta.layerId || entry.layerId,
            patchRect: after.rect ? { ...after.rect } : { ...delta.rect },
            phase: "after",
            source: label,
            tileRect: delta.tileRect,
            tileSize: entry.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }
      }

      return true;
    }

    commitRasterTileHistory(capture, options = {}) {
      if (!capture || capture.destroyed === true || !Array.isArray(capture.tileDeltas)) {
        return null;
      }

      const label = options.label || capture.label || options.source || "raster-tile-history";
      const lazyAfter = options.lazyAfter === true;
      const renderer = this;
      const entry = {
        affectedNodes: [...capture.affectedNodes],
        id: capture.id,
        label,
        lazyAfter,
        layerId: capture.layerId,
        memoryPolicy: options.memoryPolicy || capture.memoryPolicy || null,
        projectionInvalidation: capture.projectionInvalidation.map((rect) => ({ ...rect })),
        rect: { ...capture.rect },
        source: options.source || capture.source || label,
        tileDeltas: capture.tileDeltas,
        tileSize: capture.tileSize,
        type: options.type || "tile-delta",
        undo() {
          if (this.lazyAfter && !renderer.captureRasterTileHistoryAfterSnapshots(this, {
            label,
            source: options.source || capture.source || label,
          })) {
            return false;
          }

          return renderer.restoreRasterTileHistoryEntry(this, "before", {
            releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
            source: options.undoSource || `history-undo-${this.source}`,
          });
        },
        redo() {
          return renderer.restoreRasterTileHistoryEntry(this, "after", {
            releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
            source: options.redoSource || `history-redo-${this.source}`,
          });
        },
        destroy() {
          renderer.deleteRasterTileHistoryCapture(this);
        },
      };

      if (!lazyAfter && !this.captureRasterTileHistoryAfterSnapshots(entry, {
        label,
        source: options.source || capture.source || label,
      })) {
        capture.commitFailed = true;
        return null;
      }

      capture.destroyed = true;
      return entry;
    }

    restoreRasterTileHistoryEntry(entry, snapshotKey = "before", options = {}) {
      const deltas = Array.isArray(entry?.tileDeltas) ? entry.tileDeltas : [];

      if (deltas.length === 0) {
        return false;
      }

      for (const delta of deltas) {
        if (!this.hasRasterTileHistorySnapshot(delta?.[snapshotKey])) {
          return false;
        }
      }

      for (const delta of deltas) {
        const layerId = delta.layerId || entry.layerId;
        const didRestore = this.restoreRasterSnapshot(layerId, delta[snapshotKey], {
          emit: false,
          releaseSnapshotGpuAfterRestore: options.releaseSnapshotGpuAfterRestore === true,
          source: options.source || "raster-tile-history-restore",
        });

        if (!didRestore) {
          return false;
        }

        if (namespace.debugRasterHistoryTiles === true) {
          this.emitRasterHistoryTileDebug({
            bytes: delta[snapshotKey]?.bytes,
            layerId,
            patchRect: delta[snapshotKey]?.rect || delta.rect,
            phase: `restore-${snapshotKey}`,
            source: options.source || "raster-tile-history-restore",
            tileRect: delta.tileRect,
            tileSize: entry.tileSize,
            tx: delta.tx,
            ty: delta.ty,
          });
        }
      }

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId: entry.layerId,
          preserveDirtyRects: true,
          rects: Array.isArray(entry.projectionInvalidation)
            ? entry.projectionInvalidation.map((rect) => ({ ...rect }))
            : (entry.rect ? [{ ...entry.rect }] : []),
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
          maskClipMode: gl.getUniformLocation(program, "u_maskClipMode"),
          maskClipRect: gl.getUniformLocation(program, "u_maskClipRect"),
          maskClipRectCount: gl.getUniformLocation(program, "u_maskClipRectCount"),
          maskClipRects: gl.getUniformLocation(program, "u_maskClipRects[0]"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          selectionClipMode: gl.getUniformLocation(program, "u_selectionClipMode"),
          selectionClipRect: gl.getUniformLocation(program, "u_selectionClipRect"),
          selectionClipTexture: gl.getUniformLocation(program, "u_selectionClipTexture"),
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

    createNoiseProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, NOISE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma noise WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma noise.";

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

    createCurvesProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, CURVES_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma curves WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma curves.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          curveLut: gl.getUniformLocation(program, "u_curveLut"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createLayerCompositeProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, LAYER_COMPOSITE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma compositing layer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma compositing layer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          backdropTexture: gl.getUniformLocation(program, "u_backdropTexture"),
          blendMode: gl.getUniformLocation(program, "u_blendMode"),
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipOrigin: gl.getUniformLocation(program, "u_clipOrigin"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          maskClipMode: gl.getUniformLocation(program, "u_maskClipMode"),
          maskClipRect: gl.getUniformLocation(program, "u_maskClipRect"),
          maskClipRectCount: gl.getUniformLocation(program, "u_maskClipRectCount"),
          maskClipRects: gl.getUniformLocation(program, "u_maskClipRects[0]"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          sourceRect: gl.getUniformLocation(program, "u_sourceRect"),
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

    ensureNoiseProgramInfo() {
      if (!this.noiseProgramInfo) {
        this.noiseProgramInfo = this.createNoiseProgramInfo();
      }

      return this.noiseProgramInfo;
    }

    ensureThresholdProgramInfo() {
      if (!this.thresholdProgramInfo) {
        this.thresholdProgramInfo = this.createThresholdProgramInfo();
      }

      return this.thresholdProgramInfo;
    }

    ensureCurvesProgramInfo() {
      if (!this.curvesProgramInfo) {
        this.curvesProgramInfo = this.createCurvesProgramInfo();
      }

      return this.curvesProgramInfo;
    }

    ensureLayerCompositeProgramInfo() {
      if (!this.layerCompositeProgramInfo) {
        this.layerCompositeProgramInfo = this.createLayerCompositeProgramInfo();
      }

      return this.layerCompositeProgramInfo;
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

    setRasterTextureSampling(texture, minFilter, magFilter = minFilter) {
      if (!texture || !Number.isFinite(minFilter)) {
        return;
      }

      const gl = this.gl;
      const previousTextureUnit = typeof gl.getParameter === "function"
        ? gl.getParameter(gl.ACTIVE_TEXTURE)
        : null;
      const resolvedMagFilter = Number.isFinite(magFilter) ? magFilter : minFilter;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, resolvedMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, null);

      if (Number.isFinite(previousTextureUnit)) {
        gl.activeTexture(previousTextureUnit);
      }
    }

    getViewportTextureMagFilter(camera = {}) {
      const zoom = Math.abs(Number(camera?.zoom) || 1);

      return zoom >= PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD
        ? this.gl.NEAREST
        : this.gl.LINEAR;
    }

    shouldDrawPixelGrid(camera = {}) {
      const zoom = Math.abs(Number(camera?.zoom) || 1);

      return zoom >= PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD;
    }

    shouldUsePreviewCacheForCamera(camera = {}, previewCacheDimensions = null) {
      const zoom = Math.abs(Number(camera?.zoom) || 1);
      const dimensions = previewCacheDimensions || this.getPreviewCacheDimensions();
      const cacheScale = Math.max(0.0001, Number(dimensions?.scale) || 1);

      // Usa la cache mipmapped per lo zoom out, ma mai quando andrebbe ingrandita.
      // Cosi' sotto il 100% il downsample resta pulito, sopra il 100% resta full-res.
      return zoom < PREVIEW_CACHE_ZOOM_THRESHOLD && zoom <= cacheScale * 1.01;
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
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;

      if (!this.updateRasterWarpMeshVertices(resource, points)) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
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

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

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
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;
      const matrix = this.computeAffineDestToSourceUvMatrix(quad);
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!matrix || !edgeData || !vertices) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
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

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

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
      const textureFilter = Number.isFinite(options.textureFilter) ? options.textureFilter : null;
      const edgeData = this.computeQuadEdgeUniformData(quad);
      const vertices = this.createExpandedQuadDrawVertices(
        quad,
        this.getRasterTransformEdgeAaPaddingForCamera(camera, edgeFeatherPixels),
      );

      if (!edgeData || !vertices) {
        return false;
      }

      if (textureFilter !== null) {
        this.setRasterTextureSampling(texture, textureFilter);
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

      if (textureFilter !== null) {
        const restoreTextureFilter = Number.isFinite(options.restoreTextureFilter)
          ? options.restoreTextureFilter
          : gl.NEAREST;

        this.setRasterTextureSampling(texture, restoreTextureFilter);
      }

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

    normalizePreviewCacheDocumentRect(rect) {
      if (!rect) {
        return null;
      }

      const rawX = Number(rect.x);
      const rawY = Number(rect.y);
      const rawWidth = Number(rect.width);
      const rawHeight = Number(rect.height);
      const x = Number.isFinite(rawX) ? rawX : 0;
      const y = Number.isFinite(rawY) ? rawY : 0;
      const width = Number.isFinite(rawWidth) ? Math.max(1, rawWidth) : Math.max(1, this.width || 1);
      const height = Number.isFinite(rawHeight) ? Math.max(1, rawHeight) : Math.max(1, this.height || 1);
      const minX = Math.floor(x);
      const minY = Math.floor(y);
      const maxX = Math.ceil(x + width);
      const maxY = Math.ceil(y + height);

      return {
        height: Math.max(1, maxY - minY),
        width: Math.max(1, maxX - minX),
        x: minX,
        y: minY,
      };
    }

    clonePreviewCacheScopeInfo(scopeInfo) {
      if (!scopeInfo) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(scopeInfo));
      } catch (error) {
        return { ...scopeInfo };
      }
    }

    publishPreviewCacheScopeInfo(scopeInfo) {
      const snapshot = this.clonePreviewCacheScopeInfo(scopeInfo);

      this.previewCacheScopeInfo = snapshot;
      namespace.lastPreviewCacheScope = snapshot;

      return snapshot;
    }

    getPreviewCacheGlobalDocumentRect() {
      const rect = this.getDocumentBoundsRect?.() || this.getFullDocumentRect?.() || {
        height: Math.max(1, Math.round(this.height || 1)),
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      };

      return this.normalizePreviewCacheDocumentRect(rect) || this.getFullDocumentRect();
    }

    getPreviewCacheScopeMode(options = {}) {
      const rawMode = String(
        options.previewCacheScope ||
        this.options?.previewCacheScope ||
        PREVIEW_CACHE_SCOPE_DEFAULT
      ).trim().toLowerCase();

      if (rawMode === "document" || rawMode === "all" || rawMode === "global") {
        return "document";
      }

      if (rawMode === "viewport" || rawMode === "visible-viewport") {
        return "visible-viewport";
      }

      return PREVIEW_CACHE_SCOPE_DEFAULT;
    }

    getPreviewCacheViewportRect(options = {}) {
      const camera = options.camera;
      const viewportWidth = Math.max(0, Math.round(Number(options.viewportWidth) || 0));
      const viewportHeight = Math.max(0, Math.round(Number(options.viewportHeight) || 0));

      if (!camera || viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
      }

      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const dpr = Number.isFinite(Number(options.dpr))
        ? Math.max(1, Number(options.dpr))
        : getCanvasPerformanceDpr();
      const overscanCssPx = Number.isFinite(Number(options.previewCacheOverscanCssPx))
        ? Math.max(0, Number(options.previewCacheOverscanCssPx))
        : this.getPreviewCacheOverscanCssPx();
      const visibleRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const overscanDoc = (overscanCssPx * dpr) / zoom;
      const renderRect = this.expandDocumentRect(visibleRect, overscanDoc) || visibleRect;

      return {
        dpr,
        overscanCssPx,
        renderRect: this.normalizePreviewCacheDocumentRect(renderRect),
        visibleRect: this.normalizePreviewCacheDocumentRect(visibleRect),
        zoom,
      };
    }

    getPreviewCacheArtboardRects() {
      if (this.options?.isolateDocumentArtboards) {
        return [];
      }

      return (namespace.getDocumentArtboards?.() || [])
        .map((artboard) => this.normalizePreviewCacheDocumentRect(artboard))
        .filter(Boolean);
    }

    getPreviewCacheArtboards() {
      if (this.options?.isolateDocumentArtboards) {
        return [];
      }

      return (namespace.getDocumentArtboards?.() || [])
        .map((artboard, index) => {
          const rect = this.normalizePreviewCacheDocumentRect(artboard);
          const id = String(artboard?.id || (index === 0 ? "active-document" : `artboard-${index + 1}`)).trim();

          return rect && id
            ? {
                id,
                rect,
              }
            : null;
        })
        .filter(Boolean);
    }

    getArtboardResidencyNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }

    ensureArtboardResidencyState() {
      if (!(this.artboardResidencyWarmUntilById instanceof Map)) {
        this.artboardResidencyWarmUntilById = new Map();
      }

      return this.artboardResidencyWarmUntilById;
    }

    isArtboardResidencyEnabled(options = {}) {
      return Boolean(
        options.enableArtboardResidency !== false &&
        this.options?.enableArtboardResidency !== false &&
        namespace.enableArtboardResidency !== false
      );
    }

    isArtboardResidencyBudgetEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardResidencyBudget !== false &&
        this.options?.enableArtboardResidencyBudget !== false &&
        namespace.enableArtboardResidencyBudget !== false
      );
    }

    isArtboardResidencyPrefetchEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardResidencyPrefetch !== false &&
        this.options?.enableArtboardResidencyPrefetch !== false &&
        namespace.enableArtboardResidencyPrefetch !== false
      );
    }

    isArtboardFlatPreviewsEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardFlatPreviews !== false &&
        this.options?.enableArtboardFlatPreviews !== false &&
        namespace.enableArtboardFlatPreviews !== false
      );
    }

    isArtboardTileResidencyEnabled(options = {}) {
      return Boolean(
        this.isArtboardResidencyEnabled(options) &&
        options.enableArtboardTileResidency !== false &&
        this.options?.enableArtboardTileResidency !== false &&
        namespace.enableArtboardTileResidency !== false
      );
    }

    getArtboardResidencySoftBudgetBytes(options = {}) {
      const rawBudget = Number.isFinite(Number(options.artboardResidencySoftBudgetBytes))
        ? Number(options.artboardResidencySoftBudgetBytes)
        : Number(this.options?.artboardResidencySoftBudgetBytes);

      return Math.max(0, Math.round(rawBudget || ARTBOARD_RESIDENCY_SOFT_BUDGET_BYTES));
    }

    getArtboardResidencyHardBudgetBytes(options = {}) {
      const softBudget = this.getArtboardResidencySoftBudgetBytes(options);
      const rawBudget = Number.isFinite(Number(options.artboardResidencyHardBudgetBytes))
        ? Number(options.artboardResidencyHardBudgetBytes)
        : Number(this.options?.artboardResidencyHardBudgetBytes);

      return Math.max(softBudget, Math.round(rawBudget || ARTBOARD_RESIDENCY_HARD_BUDGET_BYTES));
    }

    ensureArtboardResidencyAccessState() {
      if (!(this.artboardResidencyAccessById instanceof Map)) {
        this.artboardResidencyAccessById = new Map();
      }

      return this.artboardResidencyAccessById;
    }

    getArtboardResidencyPrefetchDocPx(viewportRect = null, options = {}) {
      const cssPx = Number.isFinite(Number(options.artboardResidencyPrefetchCssPx))
        ? Math.max(0, Number(options.artboardResidencyPrefetchCssPx))
        : Math.max(0, Number(this.options?.artboardResidencyPrefetchCssPx) || ARTBOARD_RESIDENCY_PREFETCH_CSS_PX);
      const dpr = Number.isFinite(Number(viewportRect?.dpr || options.dpr))
        ? Math.max(1, Number(viewportRect?.dpr || options.dpr))
        : 1;
      const zoom = Number.isFinite(Number(viewportRect?.zoom || options.camera?.zoom))
        ? Math.max(0.0001, Math.abs(Number(viewportRect?.zoom || options.camera?.zoom)))
        : 1;

      return (cssPx * dpr) / zoom;
    }

    getLayerArtboardId(layerOrId = "") {
      const layer = typeof layerOrId === "object" && layerOrId
        ? layerOrId
        : this.layerModel?.findEntryById?.(String(layerOrId || "").trim());
      const layerId = String(layer?.id || (typeof layerOrId === "string" ? layerOrId : "")).trim();
      const explicitArtboardId = String(layer?.artboardId || "").trim();

      if (explicitArtboardId) {
        return explicitArtboardId;
      }

      if (!layerId || layer?.type === "background" || layerId === "background") {
        return "";
      }

      return String(this.layerModel?.findEntryArtboardId?.(layerId) || "").trim();
    }

    getActiveArtboardIdForResidency(options = {}) {
      const explicitArtboardId = String(options.artboardId || options.activeArtboardId || "").trim();

      if (explicitArtboardId) {
        return explicitArtboardId;
      }

      const selectedArtboardId = String(namespace.getSelectedDocumentArtboardId?.() || "").trim();

      if (selectedArtboardId) {
        return selectedArtboardId;
      }

      const activeLayerId = String(options.activeLayerId || this.layerModel?.activeLayerId || "").trim();
      const layerArtboardId = activeLayerId ? this.getLayerArtboardId(activeLayerId) : "";

      if (layerArtboardId) {
        return layerArtboardId;
      }

      return String(namespace.getActiveDocumentArtboardId?.({ layerId: activeLayerId }) || "").trim();
    }

    getDocumentRectUnion(rects = []) {
      const normalizedRects = (Array.isArray(rects) ? rects : [])
        .map((rect) => this.normalizePreviewCacheDocumentRect(rect))
        .filter(Boolean);

      if (normalizedRects.length === 0) {
        return null;
      }

      const bounds = normalizedRects.reduce((result, rect) => {
        if (!result) {
          return {
            bottom: rect.y + rect.height,
            left: rect.x,
            right: rect.x + rect.width,
            top: rect.y,
          };
        }

        return {
          bottom: Math.max(result.bottom, rect.y + rect.height),
          left: Math.min(result.left, rect.x),
          right: Math.max(result.right, rect.x + rect.width),
          top: Math.min(result.top, rect.y),
        };
      }, null);

      return bounds
        ? {
            height: Math.max(1, bounds.bottom - bounds.top),
            width: Math.max(1, bounds.right - bounds.left),
            x: bounds.left,
            y: bounds.top,
          }
        : null;
    }

    getDocumentRectIntersection(first, second) {
      const a = this.normalizePreviewCacheDocumentRect(first);
      const b = this.normalizePreviewCacheDocumentRect(second);

      if (!a || !b) {
        return null;
      }

      const x0 = Math.max(a.x, b.x);
      const y0 = Math.max(a.y, b.y);
      const x1 = Math.min(a.x + a.width, b.x + b.width);
      const y1 = Math.min(a.y + a.height, b.y + b.height);

      return x1 > x0 && y1 > y0
        ? {
            height: Math.max(1, y1 - y0),
            width: Math.max(1, x1 - x0),
            x: x0,
            y: y0,
          }
        : null;
    }

    documentRectContains(outer, inner) {
      const a = this.normalizePreviewCacheDocumentRect(outer);
      const b = this.normalizePreviewCacheDocumentRect(inner);

      return Boolean(
        a &&
        b &&
        b.x >= a.x &&
        b.y >= a.y &&
        b.x + b.width <= a.x + a.width &&
        b.y + b.height <= a.y + a.height
      );
    }

    getDocumentRectCenter(rect) {
      const normalizedRect = this.normalizePreviewCacheDocumentRect(rect);

      return normalizedRect
        ? {
            x: normalizedRect.x + normalizedRect.width / 2,
            y: normalizedRect.y + normalizedRect.height / 2,
          }
        : null;
    }

    getDocumentRectDistance(first, second) {
      const firstCenter = this.getDocumentRectCenter(first);
      const secondCenter = this.getDocumentRectCenter(second);

      if (!firstCenter || !secondCenter) {
        return 0;
      }

      const dx = firstCenter.x - secondCenter.x;
      const dy = firstCenter.y - secondCenter.y;

      return Math.sqrt(dx * dx + dy * dy);
    }

    resolveArtboardPrefetch(artboards = [], visibleRect = null, renderRect = null, viewportRect = null, options = {}) {
      if (!this.isArtboardResidencyPrefetchEnabled(options) || !visibleRect || !Array.isArray(artboards) || artboards.length === 0) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const previousVisibleRect = this.normalizePreviewCacheDocumentRect(this.artboardResidencyLast?.visibleRect);
      const currentVisibleRect = this.normalizePreviewCacheDocumentRect(visibleRect);

      if (!previousVisibleRect || !currentVisibleRect) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const previousCenter = this.getDocumentRectCenter(previousVisibleRect);
      const currentCenter = this.getDocumentRectCenter(currentVisibleRect);
      const dx = currentCenter.x - previousCenter.x;
      const dy = currentCenter.y - previousCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 1) {
        return {
          artboardIds: [],
          rect: null,
        };
      }

      const leadRect = this.normalizePreviewCacheDocumentRect({
        height: currentVisibleRect.height,
        width: currentVisibleRect.width,
        x: currentVisibleRect.x + dx,
        y: currentVisibleRect.y + dy,
      });
      const prefetchPadding = this.getArtboardResidencyPrefetchDocPx(viewportRect, options);
      const prefetchRect = this.expandDocumentRect(
        this.getDocumentRectUnion([renderRect || currentVisibleRect, leadRect]) || currentVisibleRect,
        prefetchPadding,
      ) || currentVisibleRect;
      const artboardIds = artboards
        .filter((artboard) => this.documentRectsIntersect(artboard.rect, prefetchRect))
        .map((artboard) => artboard.id);

      return {
        artboardIds,
        rect: this.normalizePreviewCacheDocumentRect(prefetchRect),
      };
    }

    pruneExpiredArtboardWarmIds(now = this.getArtboardResidencyNow()) {
      const warmUntilById = this.ensureArtboardResidencyState();
      const warmIds = new Set();

      warmUntilById.forEach((until, artboardId) => {
        if (Number(until) > now) {
          warmIds.add(artboardId);
        } else {
          warmUntilById.delete(artboardId);
        }
      });

      return warmIds;
    }

    resolveArtboardResidency(options = {}) {
      const now = Number.isFinite(Number(options.now))
        ? Number(options.now)
        : this.getArtboardResidencyNow();
      const viewportRect = options.viewportRect || this.getPreviewCacheViewportRect(options);
      const visibleRect = this.normalizePreviewCacheDocumentRect(options.visibleRect || viewportRect?.visibleRect);
      const renderRect = this.normalizePreviewCacheDocumentRect(options.renderRect || viewportRect?.renderRect);
      const artboards = this.getPreviewCacheArtboards();
      const artboardById = new Map(artboards.map((artboard) => [artboard.id, artboard]));
      const activeArtboardId = this.getActiveArtboardIdForResidency(options);
      const visibleArtboards = visibleRect
        ? artboards.filter((artboard) => this.documentRectsIntersect(artboard.rect, visibleRect))
        : [];
      const renderArtboards = renderRect
        ? artboards.filter((artboard) => this.documentRectsIntersect(artboard.rect, renderRect))
        : visibleArtboards;
      const hotArtboardIds = new Set([
        ...visibleArtboards.map((artboard) => artboard.id),
        ...renderArtboards.map((artboard) => artboard.id),
      ]);

      if (activeArtboardId && artboardById.has(activeArtboardId)) {
        hotArtboardIds.add(activeArtboardId);
      }

      const prefetch = this.resolveArtboardPrefetch(artboards, visibleRect, renderRect, viewportRect, options);
      const warmArtboardIds = this.pruneExpiredArtboardWarmIds(now);
      (prefetch.artboardIds || []).forEach((artboardId) => {
        if (!hotArtboardIds.has(artboardId)) {
          warmArtboardIds.add(artboardId);
        }
      });
      const cacheArtboards = visibleArtboards.length > 0
        ? visibleArtboards
        : activeArtboardId && artboardById.has(activeArtboardId)
          ? [artboardById.get(activeArtboardId)]
          : [];
      const coldArtboardIds = artboards
        .map((artboard) => artboard.id)
        .filter((artboardId) => !hotArtboardIds.has(artboardId) && !warmArtboardIds.has(artboardId));
      const cacheRect = this.getDocumentRectUnion(cacheArtboards.map((artboard) => artboard.rect));

      return {
        activeArtboardId: activeArtboardId || "",
        artboardCount: artboards.length,
        artboards: artboards.map((artboard) => ({
          id: artboard.id,
          rect: { ...artboard.rect },
        })),
        cacheArtboardIds: cacheArtboards.map((artboard) => artboard.id),
        cacheArtboards: cacheArtboards.map((artboard) => ({
          id: artboard.id,
          rect: { ...artboard.rect },
        })),
        cacheRect: cacheRect ? { ...cacheRect } : null,
        coldArtboardIds,
        hotArtboardIds: Array.from(hotArtboardIds),
        prefetchArtboardIds: (prefetch.artboardIds || []).filter((artboardId) => !hotArtboardIds.has(artboardId)),
        prefetchRect: prefetch.rect ? { ...prefetch.rect } : null,
        renderArtboardIds: renderArtboards.map((artboard) => artboard.id),
        renderRect: renderRect ? { ...renderRect } : null,
        visibleArtboardIds: visibleArtboards.map((artboard) => artboard.id),
        visibleRect: visibleRect ? { ...visibleRect } : null,
        warmArtboardIds: Array.from(warmArtboardIds),
      };
    }

    cloneArtboardResidency(residency = null) {
      if (!residency) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(residency));
      } catch (error) {
        return { ...residency };
      }
    }

    resolveAndPublishArtboardResidency(options = {}) {
      if (!this.isArtboardResidencyEnabled(options)) {
        this.artboardResidencyLast = null;
        namespace.lastArtboardResidency = null;
        return null;
      }

      const now = Number.isFinite(Number(options.now))
        ? Number(options.now)
        : this.getArtboardResidencyNow();
      const firstPass = this.resolveArtboardResidency({ ...options, now });
      const warmUntilById = this.ensureArtboardResidencyState();
      const warmHoldMs = Number.isFinite(Number(this.options?.artboardResidencyWarmHoldMs))
        ? Math.max(0, Number(this.options.artboardResidencyWarmHoldMs))
        : ARTBOARD_RESIDENCY_WARM_HOLD_MS;
      const previousHotIds = new Set(this.artboardResidencyLast?.hotArtboardIds || []);
      const nextHotIds = new Set(firstPass.hotArtboardIds || []);

      previousHotIds.forEach((artboardId) => {
        if (!nextHotIds.has(artboardId)) {
          warmUntilById.set(artboardId, now + warmHoldMs);
        }
      });
      nextHotIds.forEach((artboardId) => warmUntilById.delete(artboardId));

      const nextResidency = this.resolveArtboardResidency({ ...options, now });
      const snapshot = this.cloneArtboardResidency(nextResidency);
      const accessById = this.ensureArtboardResidencyAccessState();

      [
        ...(nextResidency.hotArtboardIds || []),
        ...(nextResidency.prefetchArtboardIds || []),
      ].forEach((artboardId) => {
        if (artboardId) {
          accessById.set(artboardId, now);
        }
      });

      this.artboardResidencyLast = snapshot;
      namespace.lastArtboardResidency = snapshot;

      return nextResidency;
    }

    getArtboardResidencyViewOptions(options = {}) {
      return {
        activeArtboardId: options.activeArtboardId || "",
        activeLayerId: options.activeLayerId || "",
        camera: options.camera
          ? {
              x: Number(options.camera.x) || 0,
              y: Number(options.camera.y) || 0,
              zoom: Number(options.camera.zoom) || 1,
            }
          : null,
        dpr: options.dpr,
        viewportHeight: options.viewportHeight,
        viewportWidth: options.viewportWidth,
      };
    }

    getRasterTargetGpuBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetGpuBytes(tile);
        });

        return total;
      }

      return target.texture && target.state !== "CPU_COLD"
        ? this.estimateRasterTargetBytes(target)
        : 0;
    }

    getRasterTargetCpuBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetCpuBytes(tile);
        });

        return Math.max(total, Math.round(Number(target.cpuBytes) || 0));
      }

      return Math.max(
        0,
        Math.round(Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || 0),
      );
    }

    getSparseRasterTargetColdTileCount(target) {
      if (!this.isSparseRasterTarget(target)) {
        return 0;
      }

      let coldCount = 0;

      target.tiles?.forEach?.((tile) => {
        if (tile?.state === "CPU_COLD" || (!tile?.texture && tile?.cpuPixels instanceof Uint8Array)) {
          coldCount += 1;
        }
      });

      return coldCount;
    }

    estimateArtboardFlatPreviewBytes(preview) {
      return preview?.texture
        ? this.getRasterRectBytes(preview.width, preview.height)
        : 0;
    }

    collectArtboardResidencyMetrics(residency = this.artboardResidencyLast, orderedLayers = null, options = {}) {
      if (!residency) {
        return null;
      }

      const accessById = this.ensureArtboardResidencyAccessState();
      const visibleIds = new Set(residency.visibleArtboardIds || []);
      const renderIds = new Set(residency.renderArtboardIds || []);
      const hotIds = new Set(residency.hotArtboardIds || []);
      const warmIds = new Set(residency.warmArtboardIds || []);
      const coldIds = new Set(residency.coldArtboardIds || []);
      const prefetchIds = new Set(residency.prefetchArtboardIds || []);
      const activeArtboardId = residency.activeArtboardId || "";
      const visibleRect = residency.visibleRect || null;
      const metricsById = new Map((residency.artboards || []).map((artboard) => [
        artboard.id,
        {
          artboardId: artboard.id,
          coldLayerCount: 0,
          coldTileCount: 0,
          cpuBytes: 0,
          cpuRawBytes: 0,
          distanceFromVisible: this.getDocumentRectDistance(artboard.rect, visibleRect),
          flatPreviewBytes: 0,
          flatPreviewMiB: "0.00",
          hasFlatPreview: false,
          hot: hotIds.has(artboard.id),
          layerCount: 0,
          liveLayerCount: 0,
          liveTileCount: 0,
          gpuBytes: 0,
          lastAccessedAt: Math.max(0, Number(accessById.get(artboard.id)) || 0),
          prefetch: prefetchIds.has(artboard.id),
          rect: { ...artboard.rect },
          render: renderIds.has(artboard.id),
          status: coldIds.has(artboard.id)
            ? "cold"
            : hotIds.has(artboard.id)
              ? "hot"
              : warmIds.has(artboard.id)
                ? "warm"
                : "idle",
          visible: visibleIds.has(artboard.id),
          warm: warmIds.has(artboard.id),
        },
      ]));
      const layers = Array.isArray(orderedLayers)
        ? orderedLayers
        : this.getOrderedLayersBottomToTop();
      let globalGpuBytes = 0;
      let globalCpuBytes = 0;
      let globalCpuRawBytes = 0;

      for (const layer of layers) {
        const layerId = String(layer?.id || "").trim();
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;
        const gpuBytes = this.getRasterTargetGpuBytes(target);
        const cpuBytes = this.getRasterTargetCpuBytes(target);
        const cpuRawBytes = this.getRasterTargetCpuRawBytes?.(target) || cpuBytes;
        const artboardId = this.getLayerArtboardId(layer);
        const artboardMetrics = artboardId ? metricsById.get(artboardId) : null;

        if (!artboardMetrics) {
          globalGpuBytes += gpuBytes;
          globalCpuBytes += cpuBytes;
          globalCpuRawBytes += cpuRawBytes;
          continue;
        }

        artboardMetrics.layerCount += 1;
        artboardMetrics.gpuBytes += gpuBytes;
        artboardMetrics.cpuBytes += cpuBytes;
        artboardMetrics.cpuRawBytes += cpuRawBytes;

        if (target?.state === "CPU_COLD" || (!gpuBytes && cpuBytes > 0)) {
          artboardMetrics.coldLayerCount += 1;
        } else if (gpuBytes > 0) {
          artboardMetrics.liveLayerCount += 1;
        }

        if (this.isSparseRasterTarget(target)) {
          const coldTileCount = this.getSparseRasterTargetColdTileCount(target);

          artboardMetrics.coldTileCount += coldTileCount;
          artboardMetrics.liveTileCount += Math.max(0, (target.tiles?.size || 0) - coldTileCount);
        }
      }

      let totalGpuBytes = globalGpuBytes;
      let totalCpuBytes = globalCpuBytes;
      let totalCpuRawBytes = globalCpuRawBytes;
      let totalFlatPreviewBytes = 0;

      metricsById.forEach((artboardMetrics, artboardId) => {
        const previewBytes = this.estimateArtboardFlatPreviewBytes(this.artboardFlatPreviewsById?.get?.(artboardId));

        artboardMetrics.flatPreviewBytes = previewBytes;
        artboardMetrics.flatPreviewMiB = this.formatRasterMiB(previewBytes);
        artboardMetrics.hasFlatPreview = previewBytes > 0;
        artboardMetrics.gpuMiB = this.formatRasterMiB(artboardMetrics.gpuBytes);
        artboardMetrics.cpuMiB = this.formatRasterMiB(artboardMetrics.cpuBytes);
        artboardMetrics.cpuRawMiB = this.formatRasterMiB(artboardMetrics.cpuRawBytes);
        totalGpuBytes += artboardMetrics.gpuBytes;
        totalCpuBytes += artboardMetrics.cpuBytes;
        totalCpuRawBytes += artboardMetrics.cpuRawBytes;
        totalFlatPreviewBytes += previewBytes;
      });

      const softBudgetBytes = this.getArtboardResidencySoftBudgetBytes(options);
      const hardBudgetBytes = this.getArtboardResidencyHardBudgetBytes(options);
      const residentGpuBytes = totalGpuBytes + totalFlatPreviewBytes;
      const budgetPressure = !this.isArtboardResidencyBudgetEnabled(options)
        ? "disabled"
        : residentGpuBytes > hardBudgetBytes
          ? "hard"
          : residentGpuBytes > softBudgetBytes
            ? "soft"
            : "ok";
      const metrics = {
        artboards: Array.from(metricsById.values()).sort((first, second) =>
          (first.rect.y - second.rect.y) || (first.rect.x - second.rect.x) || first.artboardId.localeCompare(second.artboardId)
        ),
        budget: {
          hardBudgetBytes,
          hardBudgetMiB: this.formatRasterMiB(hardBudgetBytes),
          overHardBytes: Math.max(0, residentGpuBytes - hardBudgetBytes),
          overSoftBytes: Math.max(0, residentGpuBytes - softBudgetBytes),
          pressure: budgetPressure,
          softBudgetBytes,
          softBudgetMiB: this.formatRasterMiB(softBudgetBytes),
        },
        globalCpuBytes,
        globalCpuMiB: this.formatRasterMiB(globalCpuBytes),
        globalCpuRawBytes,
        globalGpuBytes,
        globalGpuMiB: this.formatRasterMiB(globalGpuBytes),
        residentGpuBytes,
        residentGpuMiB: this.formatRasterMiB(residentGpuBytes),
        totalCpuBytes,
        totalCpuMiB: this.formatRasterMiB(totalCpuBytes),
        totalCpuRawBytes,
        totalFlatPreviewBytes,
        totalFlatPreviewMiB: this.formatRasterMiB(totalFlatPreviewBytes),
        totalGpuBytes,
        totalGpuMiB: this.formatRasterMiB(totalGpuBytes),
      };

      this.artboardResidencyMetricsLast = metrics;
      namespace.lastArtboardResidencyMetrics = metrics;

      return metrics;
    }

    getArtboardResidencyCoolingPlan(residency, metrics = null, options = {}) {
      const resolvedMetrics = metrics || this.collectArtboardResidencyMetrics(residency, options.orderedLayers, options);

      if (!residency || !resolvedMetrics) {
        return {
          candidateArtboardIds: [],
          pressure: "none",
          projectedGpuBytes: 0,
          targetGpuBytes: 0,
        };
      }

      const protectedIds = new Set([
        residency.activeArtboardId || "",
        ...(residency.visibleArtboardIds || []),
        ...(residency.renderArtboardIds || []),
      ].filter(Boolean));
      const coldIds = new Set(residency.coldArtboardIds || []);
      const pressure = resolvedMetrics.budget?.pressure || "ok";
      const shouldUseBudget = this.isArtboardResidencyBudgetEnabled(options) &&
        (pressure === "soft" || pressure === "hard");
      const candidateMetrics = resolvedMetrics.artboards
        .filter((artboard) => {
          if (protectedIds.has(artboard.artboardId)) {
            return false;
          }

          return coldIds.has(artboard.artboardId) ||
            (shouldUseBudget && (artboard.status === "warm" || artboard.prefetch));
        })
        .sort((first, second) => {
          const firstPriority = coldIds.has(first.artboardId) ? 0 : 1;
          const secondPriority = coldIds.has(second.artboardId) ? 0 : 1;

          return (firstPriority - secondPriority) ||
            (first.lastAccessedAt - second.lastAccessedAt) ||
            (second.distanceFromVisible - first.distanceFromVisible) ||
            (second.gpuBytes - first.gpuBytes);
        });
      const targetGpuBytes = pressure === "hard"
        ? resolvedMetrics.budget.hardBudgetBytes
        : resolvedMetrics.budget.softBudgetBytes;
      let projectedGpuBytes = resolvedMetrics.residentGpuBytes;
      const candidateArtboardIds = [];

      for (const artboard of candidateMetrics) {
        if (!coldIds.has(artboard.artboardId) && projectedGpuBytes <= targetGpuBytes) {
          break;
        }

        candidateArtboardIds.push(artboard.artboardId);
        projectedGpuBytes = Math.max(0, projectedGpuBytes - artboard.gpuBytes);
      }

      const plan = {
        candidateArtboardIds,
        pressure,
        projectedGpuBytes,
        projectedGpuMiB: this.formatRasterMiB(projectedGpuBytes),
        targetGpuBytes,
        targetGpuMiB: this.formatRasterMiB(targetGpuBytes),
      };

      this.artboardResidencyPressureLast = plan;
      namespace.lastArtboardResidencyPressure = plan;

      return plan;
    }

    deleteArtboardFlatPreview(artboardId, options = {}) {
      const normalizedId = String(artboardId || "").trim();
      const preview = normalizedId ? this.artboardFlatPreviewsById?.get?.(normalizedId) : null;

      if (!preview) {
        return false;
      }

      if (preview.texture || preview.textureResourceId) {
        this.deleteRasterTexture?.(preview.texture || preview.textureResourceId);
        this.gl?.deleteTexture?.(preview.texture);
      }

      this.artboardFlatPreviewsById.delete(normalizedId);

      if (options.publish !== false) {
        namespace.lastArtboardFlatPreviewInvalidation = {
          artboardIds: [normalizedId],
          reason: options.reason || "delete-artboard-flat-preview",
        };
      }

      return true;
    }

    deleteAllArtboardFlatPreviews(reason = "delete-artboard-flat-previews") {
      const artboardIds = Array.from(this.artboardFlatPreviewsById?.keys?.() || []);

      artboardIds.forEach((artboardId) => this.deleteArtboardFlatPreview(artboardId, {
        publish: false,
        reason,
      }));

      namespace.lastArtboardFlatPreviewInvalidation = {
        artboardIds,
        reason,
      };

      return artboardIds.length;
    }

    getArtboardFlatPreview(artboardId) {
      const normalizedId = String(artboardId || "").trim();
      const preview = normalizedId ? this.artboardFlatPreviewsById?.get?.(normalizedId) : null;

      return preview?.texture ? preview : null;
    }

    invalidateArtboardFlatPreviews(reason = "unknown", options = {}, dirtyRects = null) {
      if (!this.artboardFlatPreviewsById?.size) {
        return 0;
      }

      const layerArtboardId = options.layerId ? this.getLayerArtboardId(options.layerId) : "";

      if (layerArtboardId && this.artboardFlatPreviewsById.has(layerArtboardId)) {
        return this.deleteArtboardFlatPreview(layerArtboardId, {
          reason: `${reason}:layer`,
        }) ? 1 : 0;
      }

      const rects = Array.isArray(dirtyRects)
        ? dirtyRects
        : this.getDirtyRegionRectsFromOptions?.(options) || [];

      if (!rects.length) {
        return this.deleteAllArtboardFlatPreviews(`${reason}:full`);
      }

      const artboardIds = [];

      this.artboardFlatPreviewsById.forEach((preview, artboardId) => {
        if (rects.some((rect) => this.documentRectsIntersect(preview.rect, rect))) {
          artboardIds.push(artboardId);
        }
      });
      artboardIds.forEach((artboardId) => this.deleteArtboardFlatPreview(artboardId, {
        publish: false,
        reason: `${reason}:dirty`,
      }));

      if (artboardIds.length > 0) {
        namespace.lastArtboardFlatPreviewInvalidation = {
          artboardIds,
          reason: `${reason}:dirty`,
        };
      }

      return artboardIds.length;
    }

    captureArtboardFlatPreviewsFromPreviewCache(options = {}) {
      if (
        !this.isArtboardFlatPreviewsEnabled(options) ||
        !this.previewTexture ||
        !this.previewFramebuffer ||
        !this.previewCacheDocumentRect ||
        !this.previewCacheWidth ||
        !this.previewCacheHeight
      ) {
        return null;
      }

      if (!(this.artboardFlatPreviewsById instanceof Map)) {
        this.artboardFlatPreviewsById = new Map();
      }

      if (!Number.isFinite(Number(this.artboardFlatPreviewVersion))) {
        this.artboardFlatPreviewVersion = 1;
      }

      const gl = this.gl;

      if (typeof gl?.copyTexSubImage2D !== "function") {
        return null;
      }

      const cacheRect = this.normalizePreviewCacheDocumentRect(this.previewCacheDocumentRect);
      const cacheScale = Math.max(0.0001, Number(this.previewCacheScale) || 1);
      const cacheWidth = Math.max(1, Math.round(this.previewCacheWidth || 1));
      const cacheHeight = Math.max(1, Math.round(this.previewCacheHeight || 1));
      const maxSize = Math.max(1, Math.round(Number(this.options?.artboardFlatPreviewMaxSize) || ARTBOARD_FLAT_PREVIEW_MAX_SIZE));
      const scopeIds = new Set(this.previewCacheScopeInfo?.visibleArtboardIds || this.previewCacheScopeInfo?.cacheArtboardIds || []);
      const artboards = this.getPreviewCacheArtboards()
        .filter((artboard) => scopeIds.size === 0 || scopeIds.has(artboard.id))
        .filter((artboard) => this.documentRectContains(cacheRect, artboard.rect));
      const capturedIds = [];
      const skippedIds = [];

      if (artboards.length === 0) {
        return null;
      }

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);

        for (const artboard of artboards) {
          const sourceX = Math.max(0, Math.floor((artboard.rect.x - cacheRect.x) * cacheScale));
          const sourceTop = Math.max(0, Math.floor((artboard.rect.y - cacheRect.y) * cacheScale));
          const sourceWidth = Math.min(cacheWidth - sourceX, Math.max(1, Math.round(artboard.rect.width * cacheScale)));
          const sourceHeight = Math.min(cacheHeight - sourceTop, Math.max(1, Math.round(artboard.rect.height * cacheScale)));
          const sourceY = Math.max(0, cacheHeight - sourceTop - sourceHeight);

          if (sourceWidth <= 0 || sourceHeight <= 0 || sourceWidth > maxSize || sourceHeight > maxSize) {
            skippedIds.push(artboard.id);
            continue;
          }

          const texture = gl.createTexture?.();

          if (!texture) {
            skippedIds.push(artboard.id);
            continue;
          }

          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sourceWidth, sourceHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sourceX, sourceY, sourceWidth, sourceHeight);

          this.deleteArtboardFlatPreview(artboard.id, {
            publish: false,
            reason: "replace-artboard-flat-preview",
          });

          const textureRow = this.registerRasterTexture(texture, {
            bbox: { ...artboard.rect },
            height: sourceHeight,
            kind: "artboardFlatPreview",
            label: `flat preview ${artboard.id}`,
            ownerId: artboard.id,
            ownerType: "cache",
            purgeable: true,
            reason: "capture-artboard-flat-preview",
            width: sourceWidth,
          });

          this.artboardFlatPreviewsById.set(artboard.id, {
            artboardId: artboard.id,
            bytes: this.getRasterRectBytes(sourceWidth, sourceHeight),
            capturedAt: this.getArtboardResidencyNow(),
            height: sourceHeight,
            rect: { ...artboard.rect },
            scale: cacheScale,
            source: "preview-cache",
            texture,
            textureResourceId: textureRow?.id || "",
            version: this.artboardFlatPreviewVersion++,
            width: sourceWidth,
          });
          capturedIds.push(artboard.id);
        }
      } catch (error) {
        console.warn?.("[CBO renderer] Impossibile catturare preview flattened per artboard.", error);
        return null;
      } finally {
        gl.bindTexture?.(gl.TEXTURE_2D, null);
        gl.bindFramebuffer?.(gl.FRAMEBUFFER, null);
      }

      const report = {
        capturedIds,
        skippedIds,
        source: options.reason || "preview-cache",
      };

      namespace.lastArtboardFlatPreviewCapture = report;

      return report;
    }

    artboardHasOnlyColdRasterTargets(artboardId, orderedLayers = []) {
      let hasRasterLayer = false;

      for (const layer of orderedLayers) {
        if (layer?.visible === false || this.getLayerArtboardId(layer) !== artboardId) {
          continue;
        }

        const target = this.rasterTargetsByLayerId?.get?.(layer.id);

        if (!target) {
          return false;
        }

        hasRasterLayer = true;

        if (this.getRasterTargetGpuBytes(target) > 0) {
          return false;
        }
      }

      return hasRasterLayer;
    }

    getArtboardFlatPreviewFallbackIds(residency, orderedLayers = [], options = {}) {
      if (
        !residency ||
        !this.isArtboardFlatPreviewsEnabled(options) ||
        options.activeStrokeTexture ||
        this.rasterTransformPreview ||
        this.vectorTextTransformPreviewLayerId
      ) {
        return new Set();
      }

      const activeArtboardId = residency.activeArtboardId || "";
      const candidateIds = new Set(residency.visibleArtboardIds || []);
      const fallbackIds = new Set();

      candidateIds.forEach((artboardId) => {
        if (
          !artboardId ||
          artboardId === activeArtboardId ||
          !this.getArtboardFlatPreview(artboardId) ||
          !this.artboardHasOnlyColdRasterTargets(artboardId, orderedLayers)
        ) {
          return;
        }

        fallbackIds.add(artboardId);
      });

      return fallbackIds;
    }

    isLayerInColdArtboard(layerOrId = "") {
      const artboardId = this.getLayerArtboardId(layerOrId);

      return Boolean(
        artboardId &&
        Array.isArray(this.artboardResidencyLast?.coldArtboardIds) &&
        this.artboardResidencyLast.coldArtboardIds.includes(artboardId)
      );
    }

    hydrateHotArtboardTargets(residency, orderedLayers = [], options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        return 0;
      }

      const hotIds = new Set([
        ...(residency.hotArtboardIds || []),
        ...(residency.warmArtboardIds || []),
      ]);
      const skipArtboardIds = new Set(options.skipArtboardIds || []);
      let hydratedCount = 0;

      for (const layer of orderedLayers) {
        const layerId = String(layer?.id || "").trim();
        const artboardId = this.getLayerArtboardId(layer);
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

        if (!layerId || !artboardId || !hotIds.has(artboardId) || skipArtboardIds.has(artboardId) || !target) {
          continue;
        }

        if (this.isSparseRasterTarget(target)) {
          hydratedCount += this.hydrateSparseRasterTargetForRect(layerId, target, options.renderRect || residency.renderRect, {
            reason: options.reason || "artboard-residency-hot-hydrate",
          });
          continue;
        }

        if (target.state !== "CPU_COLD") {
          continue;
        }

        if (this.hydrateRasterTarget(target, {
          kind: "layer",
          label: layerId,
          layerId,
          ownerId: layerId,
          ownerType: "live",
          purgeable: false,
          reason: options.reason || "artboard-residency-hot-hydrate",
        })) {
          hydratedCount += 1;
        }
      }

      return hydratedCount;
    }

    hydrateSparseRasterTargetForRect(layerId, target, rect = null, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(target)) {
        return 0;
      }

      let hydratedCount = 0;
      const renderRect = this.normalizePreviewCacheDocumentRect(rect);

      target.tiles?.forEach?.((tile) => {
        if (!tile || tile.state !== "CPU_COLD") {
          return;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (renderRect && !this.documentRectsIntersect(tileRect, renderRect)) {
          return;
        }

        const ownerId = `${layerId}:${tile.tx}:${tile.ty}`;

        if (this.hydrateRasterTarget(tile, {
          kind: "paintTile",
          label: `${layerId} tile ${tile.tx},${tile.ty}`,
          layerId,
          ownerId,
          ownerType: "live",
          purgeable: false,
          reason: options.reason || "sparse-tile-render-hydrate",
        })) {
          hydratedCount += 1;
        }
      });

      if (hydratedCount > 0 && target.state === "CPU_COLD") {
        target.state = "GPU_PARTIAL";
      }

      return hydratedCount;
    }

    dehydrateSparseRasterTargetOutsideRect(layerId, target, keepRect = null, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(target)) {
        return null;
      }

      const protectedRect = this.normalizePreviewCacheDocumentRect(keepRect);
      let cooledTileCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;

      target.tiles?.forEach?.((tile) => {
        if (!tile || tile.state === "CPU_COLD" || !tile.texture || this.needsCopyOnWriteDetach(tile)) {
          return;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (protectedRect && this.documentRectsIntersect(tileRect, protectedRect)) {
          return;
        }

        const beforeBytes = this.estimateRasterTargetBytes(tile);

        if (this.dehydrateRasterTarget(tile, {
          layerId,
          reason: options.reason || "artboard-tile-residency",
        })) {
          cooledTileCount += 1;
          releasedRawBytes += beforeBytes;
          storedCpuBytes += this.getRasterTargetCpuBytes(tile);
        }
      });

      if (cooledTileCount === 0) {
        return null;
      }

      const liveTileCount = Math.max(0, (target.tiles?.size || 0) - this.getSparseRasterTargetColdTileCount(target));

      target.state = liveTileCount > 0 ? "GPU_PARTIAL" : "CPU_COLD";
      target.cpuBytes = this.getRasterTargetCpuBytes(target);
      target.cpuRawBytes = this.getRasterTargetCpuRawBytes?.(target) || target.cpuBytes;

      return {
        cooledTileCount,
        layerId,
        releasedRawBytes,
        storedCpuBytes,
      };
    }

    shouldDehydrateLayerForArtboardResidency(layer, target, coldArtboardIds) {
      if (!layer?.id || !target || !coldArtboardIds?.size) {
        return false;
      }

      if (layer.type === "group" || layer.type === "background" || layer.id === "background") {
        return false;
      }

      const artboardId = this.getLayerArtboardId(layer);

      return Boolean(
        artboardId &&
        coldArtboardIds.has(artboardId) &&
        target.state !== "CPU_COLD" &&
        !this.needsCopyOnWriteDetach(target)
      );
    }

    applyArtboardTileResidency(residency, orderedLayers = [], options = {}) {
      if (!residency || !this.isArtboardTileResidencyEnabled(options)) {
        return null;
      }

      const metrics = options.metrics || this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const pressure = metrics?.budget?.pressure || "ok";

      if (pressure !== "soft" && pressure !== "hard" && options.forceTileResidency !== true) {
        return null;
      }

      const keepRect = residency.renderRect || residency.visibleRect;

      if (!keepRect) {
        return null;
      }

      let cooledTileCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;
      const cooledLayerIds = [];

      for (const layer of orderedLayers) {
        const layerId = String(layer?.id || "").trim();
        const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

        if (
          !layerId ||
          layer?.visible === false ||
          layer?.clippingMask === true ||
          this.hasAdvancedLayerBlendMode(layer) ||
          this.hasEnabledLayerEffects(layer) ||
          this.hasPuppetLayerTransform(layer) ||
          !this.isSparseRasterTarget(target)
        ) {
          continue;
        }

        const report = this.dehydrateSparseRasterTargetOutsideRect(layerId, target, keepRect, {
          reason: options.reason || "artboard-tile-residency",
        });

        if (!report) {
          continue;
        }

        cooledTileCount += report.cooledTileCount;
        releasedRawBytes += report.releasedRawBytes;
        storedCpuBytes += report.storedCpuBytes;
        cooledLayerIds.push(layerId);
      }

      return cooledTileCount > 0
        ? {
            cooledLayerIds,
            cooledTileCount,
            releasedRawBytes,
            releasedRawMiB: this.formatRasterMiB(releasedRawBytes),
            storedCpuBytes,
            storedCpuMiB: this.formatRasterMiB(storedCpuBytes),
          }
        : null;
    }

    applyArtboardColdStorage(residency = this.artboardResidencyLast, options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        return null;
      }

      if (options.activeStrokeTexture || options.activeStroke === true || this.rasterTransformPreview || this.hasArtboardDragPreview?.()) {
        return null;
      }

      const orderedLayers = Array.isArray(options.orderedLayers)
        ? options.orderedLayers
        : this.getOrderedLayersBottomToTop();
      const metricsBefore = options.metrics || this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const coolingPlan = this.getArtboardResidencyCoolingPlan(residency, metricsBefore, {
        ...options,
        orderedLayers,
      });
      const coldArtboardIds = new Set(coolingPlan.candidateArtboardIds || residency.coldArtboardIds || []);

      if (orderedLayers.length === 0) {
        return null;
      }

      let cooledLayerCount = 0;
      let releasedRawBytes = 0;
      let storedCpuBytes = 0;
      const cooledLayerIds = [];

      if (coldArtboardIds.size > 0) {
        for (const layer of orderedLayers) {
          const layerId = String(layer?.id || "").trim();
          const target = layerId ? this.rasterTargetsByLayerId?.get?.(layerId) : null;

          if (!this.shouldDehydrateLayerForArtboardResidency(layer, target, coldArtboardIds)) {
            continue;
          }

          const beforeBytes = this.getRasterTargetGpuBytes(target) || this.estimateRasterTargetBytes(target);

          if (this.dehydrateRasterTarget(target, {
            layerId,
            reason: options.reason || "artboard-residency-cold",
          })) {
            cooledLayerCount += 1;
            releasedRawBytes += beforeBytes;
            storedCpuBytes += this.getRasterTargetCpuBytes?.(target) || 0;
            cooledLayerIds.push(layerId);
          }
        }
      }

      const tileReport = this.applyArtboardTileResidency(residency, orderedLayers, {
        ...options,
        metrics: metricsBefore,
        reason: options.reason || "artboard-tile-residency",
      });

      if (cooledLayerCount === 0 && !tileReport) {
        return null;
      }

      if (tileReport) {
        releasedRawBytes += tileReport.releasedRawBytes;
        storedCpuBytes += tileReport.storedCpuBytes;
      }

      const metricsAfter = this.collectArtboardResidencyMetrics(residency, orderedLayers, options);
      const report = {
        coldArtboardIds: Array.from(coldArtboardIds),
        cooledLayerCount,
        cooledLayerIds,
        coolingPlan,
        metricsAfter,
        metricsBefore,
        releasedRawBytes,
        releasedRawMiB: this.formatRasterMiB?.(releasedRawBytes) || releasedRawBytes,
        source: options.reason || "artboard-residency-cold",
        storedCpuBytes,
        storedCpuMiB: this.formatRasterMiB?.(storedCpuBytes) || storedCpuBytes,
        tileResidency: tileReport,
      };

      this.artboardResidencyLastColdStorage = report;
      namespace.lastArtboardResidencyColdStorage = report;

      return report;
    }

    dispatchArtboardResidencyBusy(isBusy, detail = {}) {
      if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return false;
      }

      try {
        if (typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("cbo:artboard-residency-busy", {
            detail: {
              active: Boolean(isBusy),
              label: "OPTIMIZING",
              source: "artboard-residency",
              ...detail,
            },
          }));
        }
      } catch (error) {
        return false;
      }

      return true;
    }

    afterArtboardResidencyBusyPaint(callback) {
      const run = typeof callback === "function" ? callback : () => {};
      const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (handler) => window.setTimeout?.(handler, 16);

      raf(() => {
        raf(run);
      });
    }

    finishArtboardResidencyBusy() {
      const hide = () => this.dispatchArtboardResidencyBusy(false, {
        reason: "artboard-residency-idle-cold",
      });

      if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
        window.setTimeout(() => this.afterArtboardResidencyBusyPaint(hide), 120);
      } else {
        hide();
      }
    }

    cancelArtboardResidencyIdleTimer(reason = "cancelled") {
      if (this.artboardResidencyIdleTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
        window.clearTimeout(this.artboardResidencyIdleTimer);
      }

      this.artboardResidencyIdleTimer = 0;
    }

    scheduleArtboardResidencyMaintenance(residency, options = {}) {
      if (!residency || !this.isArtboardResidencyEnabled(options)) {
        this.cancelArtboardResidencyIdleTimer("disabled-or-empty-residency");
        return false;
      }

      if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
        return false;
      }

      this.artboardResidencyLastViewOptions = this.getArtboardResidencyViewOptions(options);
      this.cancelArtboardResidencyIdleTimer("rescheduled");

      const metrics = options.metrics || this.collectArtboardResidencyMetrics(residency, options.orderedLayers, options);
      const pressure = metrics?.budget?.pressure || "ok";
      const overBudget = pressure === "soft" || pressure === "hard";
      const hasColdOrWarm = (residency.coldArtboardIds?.length || 0) > 0 ||
        (residency.warmArtboardIds?.length || 0) > 0 ||
        overBudget;

      if (!hasColdOrWarm || options.activeStrokeTexture || options.deferPreviewCacheUpdate === true) {
        return false;
      }

      const idleDelay = Number.isFinite(Number(this.options?.artboardResidencyIdleDelayMs))
        ? Math.max(0, Number(this.options.artboardResidencyIdleDelayMs))
        : ARTBOARD_RESIDENCY_IDLE_DELAY_MS;
      const warmHold = Number.isFinite(Number(this.options?.artboardResidencyWarmHoldMs))
        ? Math.max(0, Number(this.options.artboardResidencyWarmHoldMs))
        : ARTBOARD_RESIDENCY_WARM_HOLD_MS;
      const delay = pressure === "hard"
        ? 0
        : pressure === "soft"
          ? Math.min(Math.max(0, idleDelay), 250)
          : Math.max(idleDelay, warmHold);

      this.artboardResidencyIdleTimer = window.setTimeout(() => {
        this.artboardResidencyIdleTimer = 0;

        if (this.isDisposed) {
          return;
        }

        this.dispatchArtboardResidencyBusy(true, {
          reason: "artboard-residency-idle-cold",
        });

        this.afterArtboardResidencyBusyPaint(() => {
          if (this.isDisposed) {
            this.dispatchArtboardResidencyBusy(false, {
              reason: "disposed",
            });
            return;
          }

          try {
            const viewOptions = this.artboardResidencyLastViewOptions || {};
            const nextResidency = this.resolveAndPublishArtboardResidency({
              ...viewOptions,
              now: this.getArtboardResidencyNow(),
            });

            this.applyArtboardColdStorage(nextResidency, {
              reason: "artboard-residency-idle-cold",
            });
          } finally {
            this.finishArtboardResidencyBusy();
          }
        });
      }, delay);

      return true;
    }

    resolvePreviewCacheDocumentRect(options = {}) {
      const globalRect = this.getPreviewCacheGlobalDocumentRect();
      const mode = this.getPreviewCacheScopeMode(options);
      const baseScopeInfo = {
        documentRect: { ...globalRect },
        mode: "document",
        reason: mode === "document" ? "forced-document" : "fallback-document",
        scope: mode,
      };

      if (mode === "document") {
        return {
          documentRect: globalRect,
          scopeInfo: baseScopeInfo,
        };
      }

      const viewportRect = this.getPreviewCacheViewportRect(options);

      if (!viewportRect?.visibleRect || !viewportRect.renderRect) {
        return {
          documentRect: globalRect,
          scopeInfo: baseScopeInfo,
        };
      }

      if (mode === "visible-viewport") {
        const documentRect = viewportRect.renderRect;

        return {
          documentRect,
          scopeInfo: {
            documentRect: { ...documentRect },
            mode: "visible-viewport",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: "forced-viewport",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      const artboardResidency = this.resolveArtboardResidency({
        ...options,
        viewportRect,
      });
      const artboardRects = artboardResidency.artboards.map((artboard) => artboard.rect);
      const visibleArtboards = artboardResidency.cacheArtboards.map((artboard) => artboard.rect);

      if (visibleArtboards.length === 1) {
        const documentRect = visibleArtboards[0];

        return {
          documentRect,
          scopeInfo: {
            artboardCount: artboardRects.length,
            cacheArtboardIds: [...artboardResidency.cacheArtboardIds],
            documentRect: { ...documentRect },
            mode: "visible-artboard",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: artboardResidency.visibleArtboardIds.length === 1
              ? "single-visible-artboard"
              : "active-artboard-fallback",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleArtboardCount: artboardResidency.visibleArtboardIds.length,
            visibleArtboardIds: [...artboardResidency.visibleArtboardIds],
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      if (visibleArtboards.length > 1) {
        const documentRect = this.getDocumentRectUnion(visibleArtboards) || viewportRect.renderRect;

        return {
          documentRect,
          scopeInfo: {
            artboardCount: artboardRects.length,
            cacheArtboardIds: [...artboardResidency.cacheArtboardIds],
            documentRect: { ...documentRect },
            mode: "visible-artboards",
            overscanCssPx: viewportRect.overscanCssPx,
            reason: "multiple-visible-artboards",
            renderRect: { ...viewportRect.renderRect },
            scope: mode,
            visibleArtboardCount: visibleArtboards.length,
            visibleArtboardIds: [...artboardResidency.visibleArtboardIds],
            visibleRect: { ...viewportRect.visibleRect },
          },
        };
      }

      return {
        documentRect: globalRect,
        scopeInfo: {
          ...baseScopeInfo,
          artboardCount: artboardRects.length,
          overscanCssPx: viewportRect.overscanCssPx,
          renderRect: { ...viewportRect.renderRect },
          visibleArtboardCount: 0,
          visibleArtboardIds: [],
          visibleRect: { ...viewportRect.visibleRect },
        },
      };
    }

    getPreviewCacheDocumentRect(options = {}) {
      return this.resolvePreviewCacheDocumentRect(options).documentRect;
    }

    getPreviewCacheDimensions(options = {}) {
      const resolvedPreviewRect = this.resolvePreviewCacheDocumentRect(options);
      const documentRect = resolvedPreviewRect.documentRect;
      const documentWidth = documentRect.width;
      const documentHeight = documentRect.height;
      const maxSize = this.getPreviewCacheMaxSize();
      const scale = Math.min(1, maxSize / Math.max(documentWidth, documentHeight));
      const width = Math.max(1, Math.floor(documentWidth * scale));
      const height = Math.max(1, Math.floor(documentHeight * scale));
      const effectiveScale = Math.min(width / documentWidth, height / documentHeight);

      return {
        documentHeight,
        documentRect,
        documentWidth,
        documentX: documentRect.x,
        documentY: documentRect.y,
        height,
        scale: Math.max(0.0001, effectiveScale),
        scopeInfo: resolvedPreviewRect.scopeInfo,
        width,
      };
    }

    getPreviewCacheExactDocumentRect(fallbackRect = null) {
      const documentRect = this.normalizePreviewCacheDocumentRect(
        this.previewCacheDocumentRect || fallbackRect || this.getPreviewCacheDocumentRect(),
      ) || this.getPreviewCacheGlobalDocumentRect();
      const cacheScale = Math.max(0.0001, Number(this.previewCacheScale) || 1);
      const cacheWidth = Math.max(0, Math.round(Number(this.previewCacheWidth) || 0));
      const cacheHeight = Math.max(0, Math.round(Number(this.previewCacheHeight) || 0));

      if (cacheWidth <= 0 || cacheHeight <= 0) {
        return documentRect;
      }

      return {
        height: Math.max(1, cacheHeight / cacheScale),
        width: Math.max(1, cacheWidth / cacheScale),
        x: documentRect.x,
        y: documentRect.y,
      };
    }

    createPreviewCache(options = {}) {
      const dimensions = this.getPreviewCacheDimensions(options);

      if (
        this.previewTexture &&
        this.previewFramebuffer &&
        this.areDocumentRectsEqual(this.previewCacheDocumentRect, dimensions.documentRect) &&
        this.previewCacheWidth === dimensions.width &&
        this.previewCacheHeight === dimensions.height
      ) {
        this.publishPreviewCacheScopeInfo(dimensions.scopeInfo);
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

      const { documentHeight, documentWidth, height, scale, width } = dimensions;
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

      if (Number.isFinite(gl.TEXTURE_BASE_LEVEL) && Number.isFinite(gl.TEXTURE_MAX_LEVEL)) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
      }

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
      this.previewCacheWidth = width;
      this.previewCacheHeight = height;
      this.previewCacheScale = scale;
      this.previewCacheDocumentRect = { ...dimensions.documentRect };
      this.publishPreviewCacheScopeInfo(dimensions.scopeInfo);
      this.previewMipLevels = levels;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";

      const textureRow = this.registerRasterTexture(texture, {
        bbox: {
          x: dimensions.documentRect.x,
          y: dimensions.documentRect.y,
          width: documentWidth,
          height: documentHeight,
        },
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
        bbox: {
          x: dimensions.documentRect.x,
          y: dimensions.documentRect.y,
          width: documentWidth,
          height: documentHeight,
        },
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

      this.previewCacheWidth = 0;
      this.previewCacheHeight = 0;
      this.previewCacheScale = 1;
      this.previewCacheDocumentRect = null;
      this.previewCacheScopeInfo = null;
      namespace.lastPreviewCacheScope = null;
      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewDirtyRects = null;
      this.previewDirtyCompactOptions = null;
      this.previewLastDirtyMode = "full";
      this.previewLastDirtyRect = null;
      this.previewCacheReady = false;
    }

    deleteActiveStrokeSelectionClipTexture() {
      if (this.activeStrokeSelectionClipTexture) {
        this.gl.deleteTexture(this.activeStrokeSelectionClipTexture);
        this.activeStrokeSelectionClipTexture = null;
      }

      this.activeStrokeSelectionClipKey = "";
      this.activeStrokeSelectionClipWidth = 0;
      this.activeStrokeSelectionClipHeight = 0;
    }

    getActiveStrokeSelectionClipTexture(mask) {
      const rect = mask?.rect;
      const width = Math.max(0, Math.round(mask?.width || rect?.width || 0));
      const height = Math.max(0, Math.round(mask?.height || rect?.height || 0));
      const pixels = mask?.pixels;

      if (!rect || width <= 0 || height <= 0 || !pixels || pixels.length < width * height) {
        this.deleteActiveStrokeSelectionClipTexture();
        return null;
      }

      const key = [
        Math.round(rect.x || 0),
        Math.round(rect.y || 0),
        width,
        height,
        Number.isFinite(mask.version) ? mask.version : 0,
      ].join(":");

      if (
        this.activeStrokeSelectionClipTexture &&
        this.activeStrokeSelectionClipKey === key &&
        this.activeStrokeSelectionClipWidth === width &&
        this.activeStrokeSelectionClipHeight === height
      ) {
        return this.activeStrokeSelectionClipTexture;
      }

      this.deleteActiveStrokeSelectionClipTexture();

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        return null;
      }

      const rgba = new Uint8Array(width * height * 4);

      for (let index = 0; index < width * height; index += 1) {
        const value = pixels[index] || 0;
        const offset = index * 4;

        rgba[offset] = value;
        rgba[offset + 1] = value;
        rgba[offset + 2] = value;
        rgba[offset + 3] = 255;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.activeStrokeSelectionClipTexture = texture;
      this.activeStrokeSelectionClipKey = key;
      this.activeStrokeSelectionClipWidth = width;
      this.activeStrokeSelectionClipHeight = height;

      return texture;
    }

    getViewportCullingNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }

    cloneViewportCullingStats(stats) {
      if (!stats) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(stats));
      } catch (error) {
        return { ...stats };
      }
    }

    isViewportCullingDebugEnabled(options = {}) {
      return Boolean(
        options.debugViewportCulling === true ||
        this.options?.debugViewportCulling === true ||
        namespace.debugViewportCulling === true ||
        namespace.viewportCullingDebug === true
      );
    }

    isViewportLayerCullingEnabled(options = {}) {
      return Boolean(
        options.enableViewportLayerCulling === true ||
        this.options?.enableViewportLayerCulling === true ||
        namespace.enableViewportLayerCulling === true ||
        namespace.viewportLayerCullingEnabled === true
      );
    }

    isViewportLayerCullingAuditEnabled(options = {}) {
      return Boolean(
        this.isViewportLayerCullingEnabled(options) ||
        this.isViewportCullingDebugEnabled(options) ||
        options.measureViewportLayerCulling === true ||
        this.options?.measureViewportLayerCulling === true ||
        namespace.measureViewportLayerCulling === true ||
        namespace.viewportLayerCullingAudit === true
      );
    }

    createViewportCullingStats(options = {}) {
      const camera = options.camera || {};
      const zoom = Number.isFinite(Number(camera.zoom)) ? Number(camera.zoom) : 1;
      const cameraX = Number.isFinite(Number(camera.x)) ? Number(camera.x) : 0;
      const cameraY = Number.isFinite(Number(camera.y)) ? Number(camera.y) : 0;

      return {
        artboardBackgrounds: {
          drawn: 0,
          skippedOutsideRenderRect: 0,
          tested: 0,
        },
        artboardClips: {
          drawn: 0,
          skippedOutsideRenderRect: 0,
          skippedViewportScissor: 0,
          tested: 0,
        },
        debug: options.debug === true,
        durationMs: 0,
        enabled: Boolean(options.renderRect),
        frameId: (this.viewportCullingStatsSequence = (this.viewportCullingStatsSequence || 0) + 1),
        layerCulling: {
          enabled: options.layerCullingEnabled === true,
          measured: options.layerCullingMeasured === true,
        },
        layers: {
          blocked: {
            activeStroke: 0,
            advancedBlend: 0,
            artboardDragPreview: 0,
            background: 0,
            clippingMask: 0,
            clipBase: 0,
            effects: 0,
            eraser: 0,
            globalTransformPreview: 0,
            group: 0,
            noRenderRect: 0,
            noTarget: 0,
            noTargetRect: 0,
            puppet: 0,
            transformPreview: 0,
            unsafeType: 0,
          },
          considered: 0,
          drawPasses: 0,
          passedCull: 0,
          safeCullCandidates: 0,
          safelyCulled: 0,
          skippedClippingBaseMissing: 0,
          skippedFlatPreviewFallback: 0,
          skippedInvisible: 0,
          skippedVectorTransformPreview: 0,
          total: 0,
          visible: 0,
          wouldCullSafely: 0,
        },
        notes: [],
        overscanCssPx: Math.max(0, Number(options.overscanCssPx) || 0),
        renderRect: options.renderRect ? { ...options.renderRect } : null,
        renderResults: {
          returned: 0,
        },
        source: options.source || "drawToCanvas",
        sparseTiles: {
          drawn: 0,
          missingTexture: 0,
          skippedOutsideRenderRect: 0,
          tested: 0,
          uncullable: 0,
        },
        startedAt: this.getViewportCullingNow(),
        viewport: {
          cameraX,
          cameraY,
          height: Math.max(1, Math.round(Number(options.viewportHeight) || 1)),
          visibleRect: options.visibleRect ? { ...options.visibleRect } : null,
          width: Math.max(1, Math.round(Number(options.viewportWidth) || 1)),
          zoom,
        },
      };
    }

    finalizeViewportCullingStats(stats) {
      if (!stats) {
        return null;
      }

      stats.durationMs = Math.max(0, this.getViewportCullingNow() - (Number(stats.startedAt) || 0));
      const snapshot = this.cloneViewportCullingStats(stats);

      this.viewportCullingLastStats = snapshot;
      namespace.lastViewportCullingStats = snapshot;

      if (stats.debug && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        try {
          if (typeof CustomEvent === "function") {
            window.dispatchEvent(new CustomEvent(VIEWPORT_CULLING_DEBUG_EVENT, { detail: snapshot }));
          }
        } catch (error) {
          // Debug only: never break rendering for an event/listener issue.
        }
      }

      if (
        stats.debug &&
        (this.options?.debugViewportCullingLog === true || namespace.viewportCullingLog === true) &&
        typeof console !== "undefined" &&
        typeof console.debug === "function"
      ) {
        console.debug("[CBO] viewport culling", snapshot);
      }

      return snapshot;
    }

    getLastViewportCullingStats() {
      return this.cloneViewportCullingStats(this.viewportCullingLastStats);
    }

    setViewportCullingDebug(enabled = true) {
      this.options = this.options || {};
      this.options.debugViewportCulling = enabled === true;
    }

    setViewportLayerCulling(enabled = true) {
      this.options = this.options || {};
      this.options.enableViewportLayerCulling = enabled === true;
    }

    getLayerViewportCullRect(layer, layerTarget) {
      if (!layerTarget || !this.hasRenderableRasterTarget(layerTarget)) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(layerTarget);
      const visualRect = this.getArtboardDragVisualRect(layer, targetRect, layerTarget) || targetRect;

      return this.normalizeTransformArtboardRect(visualRect);
    }

    getViewportLayerCullBlockReason(layer, layerTarget, context = {}) {
      const layerType = String(layer?.type || "").trim();

      if (!context.renderRect) {
        return "noRenderRect";
      }

      if (layer?.type === "background" || layer?.id === "background") {
        return "background";
      }

      if (layer?.type === "group") {
        return "group";
      }

      if (!VIEWPORT_LAYER_CULL_SAFE_TYPES.has(layerType)) {
        return "unsafeType";
      }

      if (!layerTarget || !this.hasRenderableRasterTarget(layerTarget)) {
        return "noTarget";
      }

      if (layer?.clippingMask === true || context.isClippingLayer === true) {
        return "clippingMask";
      }

      if (context.clipBaseLayerIds?.has?.(layer?.id)) {
        return "clipBase";
      }

      if (context.isActiveStrokeLayer === true) {
        return "activeStroke";
      }

      if (context.eraserMaskTexture) {
        return "eraser";
      }

      if (context.isRasterTransformPreviewLayer === true || context.isVectorTextTransformPreviewLayer === true) {
        return "transformPreview";
      }

      if (context.rasterTransformPreview || context.vectorTextTransformPreviewLayerId) {
        return "globalTransformPreview";
      }

      if (context.hasArtboardDragPreview === true) {
        return "artboardDragPreview";
      }

      if (this.hasAdvancedLayerBlendMode(layer)) {
        return "advancedBlend";
      }

      if (this.hasEnabledLayerEffects(layer)) {
        return "effects";
      }

      if (this.hasPuppetLayerTransform(layer)) {
        return "puppet";
      }

      if (!this.getLayerViewportCullRect(layer, layerTarget)) {
        return "noTargetRect";
      }

      return "";
    }

    getViewportLayerCullDecision(layer, layerTarget, context = {}) {
      const reason = this.getViewportLayerCullBlockReason(layer, layerTarget, context);

      if (reason) {
        return {
          canCull: false,
          reason,
          shouldCull: false,
        };
      }

      const rect = this.getLayerViewportCullRect(layer, layerTarget);
      const shouldCull = Boolean(rect && context.renderRect && !this.documentRectsIntersect(rect, context.renderRect));

      return {
        canCull: true,
        reason: shouldCull ? "outsideRenderRect" : "intersectsRenderRect",
        rect,
        shouldCull,
      };
    }

    recordViewportLayerCullDecision(stats, decision, didCull = false) {
      if (!stats?.layers || !decision) {
        return;
      }

      if (decision.canCull) {
        stats.layers.safeCullCandidates += 1;

        if (decision.shouldCull) {
          stats.layers.wouldCullSafely += 1;
        }

        if (didCull) {
          stats.layers.safelyCulled += 1;
        }

        return;
      }

      const blocked = stats.layers.blocked;

      if (decision.reason && Object.prototype.hasOwnProperty.call(blocked, decision.reason)) {
        blocked[decision.reason] += 1;
      }
    }

    getFullDocumentRect() {
      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        height: Math.max(1, Math.round(this.height || 1)),
      };
    }

    resolveCanvasVisibleDocRect(camera = {}, viewportWidth = 1, viewportHeight = 1) {
      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const cameraX = Number.isFinite(Number(camera?.x)) ? Number(camera.x) : 0;
      const cameraY = Number.isFinite(Number(camera?.y)) ? Number(camera.y) : 0;
      const safeViewportWidth = Math.max(1, Math.round(Number(viewportWidth) || 1));
      const safeViewportHeight = Math.max(1, Math.round(Number(viewportHeight) || 1));
      const left = (0 - cameraX) / zoom;
      const top = (0 - cameraY) / zoom;
      const right = (safeViewportWidth - cameraX) / zoom;
      const bottom = (safeViewportHeight - cameraY) / zoom;
      const minX = Math.floor(Math.min(left, right));
      const minY = Math.floor(Math.min(top, bottom));
      const maxX = Math.ceil(Math.max(left, right));
      const maxY = Math.ceil(Math.max(top, bottom));

      return {
        height: Math.max(1, maxY - minY),
        width: Math.max(1, maxX - minX),
        x: minX,
        y: minY,
      };
    }

    expandDocumentRect(rect, overscanDoc = 0) {
      const normalized = this.normalizeTransformArtboardRect(rect);

      if (!normalized) {
        return null;
      }

      const amount = Number.isFinite(Number(overscanDoc))
        ? Math.max(0, Number(overscanDoc))
        : 0;

      return {
        height: normalized.height + amount * 2,
        width: normalized.width + amount * 2,
        x: normalized.x - amount,
        y: normalized.y - amount,
      };
    }

    documentRectsIntersect(a, b) {
      const first = this.normalizeTransformArtboardRect(a);
      const second = this.normalizeTransformArtboardRect(b);

      if (!first || !second) {
        return false;
      }

      return (
        first.x + first.width > second.x &&
        second.x + second.width > first.x &&
        first.y + first.height > second.y &&
        second.y + second.height > first.y
      );
    }

    getViewportRenderRect(camera = {}, viewportWidth = 1, viewportHeight = 1, overscanCssPx = VIEWPORT_RENDER_OVERSCAN_CSS_PX) {
      const visibleRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const rawZoom = Number(camera?.zoom);
      const zoom = Number.isFinite(rawZoom) && Math.abs(rawZoom) > 0.0001
        ? Math.abs(rawZoom)
        : 1;
      const dpr = typeof window !== "undefined" && Number.isFinite(Number(window.devicePixelRatio))
        ? Math.max(1, Number(window.devicePixelRatio))
        : 1;
      const overscanViewportPx = Number.isFinite(Number(overscanCssPx))
        ? Math.max(0, Number(overscanCssPx)) * dpr
        : 0;
      const overscanDoc = overscanViewportPx / zoom;

      return this.expandDocumentRect(visibleRect, overscanDoc) || visibleRect;
    }

    normalizeDirtyRegionRect(rect) {
      const clamped = this.getClampedDocumentRect(rect);

      return clamped ? { ...clamped } : null;
    }

    getDirtyRegionRectsFromOptions(options = {}) {
      const rawRects = [];

      if (options.rect) {
        rawRects.push(options.rect);
      }

      if (Array.isArray(options.rects)) {
        rawRects.push(...options.rects);
      }

      if (Array.isArray(options.projectionInvalidation)) {
        rawRects.push(...options.projectionInvalidation);
      }

      const layer = options.layerId
        ? this.layerModel?.findEntryById?.(options.layerId)
        : null;
      const normalizedRects = rawRects
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean)
        .map((rect) => (
          layer && this.hasEnabledLayerEffects(layer)
            ? this.getLayerEffectOutputRect(layer, rect) || rect
            : rect
        ))
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);

      return this.clipPreviewDirtyRectsToArtboards(normalizedRects, options);
    }

    getIncomingDirtyRegionRectCount(options = {}) {
      const explicitCount = Number(options.dirtyRectInputCount);

      if (Number.isFinite(explicitCount) && explicitCount > 0) {
        return Math.round(explicitCount);
      }

      let count = 0;

      if (options.rect) {
        count += 1;
      }

      if (Array.isArray(options.rects)) {
        count += options.rects.length;
      }

      if (Array.isArray(options.projectionInvalidation)) {
        count += options.projectionInvalidation.length;
      }

      return count;
    }

    getPreviewDirtyArtboardClipRects(options = {}) {
      if (options.clipToArtboards === false || this.options?.isolateDocumentArtboards) {
        return null;
      }

      const explicitRects = Array.isArray(options.previewArtboardClipRects)
        ? options.previewArtboardClipRects
        : null;
      const sourceRects = explicitRects || namespace.getDocumentArtboards?.() || [];
      const rects = (Array.isArray(sourceRects) ? sourceRects : [])
        .map((rect) => this.normalizeTransformArtboardRect(rect))
        .filter(Boolean)
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);

      return rects.length > 0 ? rects : null;
    }

    clonePreviewDirtyArtboardClipRects(rects) {
      return (Array.isArray(rects) ? rects : [])
        .map((rect) => this.normalizeTransformArtboardRect(rect))
        .filter(Boolean)
        .map((rect) => ({ ...rect }));
    }

    clipPreviewDirtyRectsToArtboards(rects = [], options = {}) {
      const sourceRects = (Array.isArray(rects) ? rects : [rects])
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);
      const clipRects = this.getPreviewDirtyArtboardClipRects(options);

      if (!clipRects || sourceRects.length === 0) {
        return sourceRects;
      }

      const clippedRects = [];

      sourceRects.forEach((rect) => {
        const rectClips = clipRects
          .map((clipRect) => this.intersectRasterHistoryRects(rect, clipRect))
          .filter(Boolean);

        clippedRects.push(...rectClips);
      });

      return clippedRects.map((rect) => ({ ...rect }));
    }

    getPreviewDirtyTileSize(options = {}) {
      const configured = Number(options.previewDirtyTileSize ?? options.tileSize);

      if (Number.isFinite(configured) && configured > 0) {
        return Math.max(64, Math.round(configured));
      }

      return Math.max(128, this.getRasterHistoryTileSize(options) * 2);
    }

    getTileBasedPreviewDirtyRects(rects = [], options = {}) {
      const sourceRects = this.clipPreviewDirtyRectsToArtboards(rects, options);
      const tileSize = this.getPreviewDirtyTileSize(options);
      const dirtyTiles = new Map();

      sourceRects.forEach((rect) => {
        this.getRasterHistoryTileRects(rect, { tileSize }).forEach((tile) => {
          const patchRect = tile.patchRect || tile.rect;

          if (!patchRect) {
            return;
          }

          const key = `${tile.tx}:${tile.ty}`;
          const previous = dirtyTiles.get(key);
          const nextRect = previous
            ? this.unionRasterHistoryRects(previous, patchRect)
            : patchRect;

          dirtyTiles.set(key, { ...nextRect });
        });
      });

      return Array.from(dirtyTiles.entries())
        .sort(([firstKey], [secondKey]) => {
          const [firstTx, firstTy] = firstKey.split(":").map((value) => Number(value));
          const [secondTx, secondTy] = secondKey.split(":").map((value) => Number(value));

          return (firstTy - secondTy) || (firstTx - secondTx);
        })
        .map(([, rect]) => ({ ...rect }));
    }

    createVisualDirtyChange(options = {}) {
      const source = options.source || "visual-change";
      const rawRects = [];
      const pushRect = (rect) => {
        if (rect) {
          rawRects.push(rect);
        }
      };
      const pushRects = (rects) => {
        if (Array.isArray(rects)) {
          rects.forEach(pushRect);
        }
      };

      pushRect(options.rect);
      pushRects(options.rects);
      pushRects(options.tilePatchRects);
      pushRects(options.projectionInvalidation);
      pushRects(options.visualRects);
      pushRect(options.sourceRect);
      pushRect(options.targetRect);
      pushRect(options.beforeRect);
      pushRect(options.afterRect);
      pushRect(options.previousRect);
      pushRect(options.nextRect);

      const normalizedRects = rawRects
        .map((rect) => this.normalizeDirtyRegionRect(rect))
        .filter(Boolean);
      const previewRects = this.clipPreviewDirtyRectsToArtboards(normalizedRects, options);
      const shouldTileDirtyRects = options.tileDirty === true || options.usePreviewDirtyTiles === true;
      const dirtyRects = shouldTileDirtyRects
        ? this.getTileBasedPreviewDirtyRects(previewRects, options)
        : previewRects.map((rect) => ({ ...rect }));
      const preserveDirtyRects = options.preserveDirtyRects === true ||
        shouldTileDirtyRects ||
        Array.isArray(options.tilePatchRects);
      const detail = {
        dirtyRectInputCount: normalizedRects.length,
        layerId: options.layerId || "",
        maxDirtyRects: Math.max(
          1,
          Math.round(Number(options.maxDirtyRects) || PREVIEW_DIRTY_MAX_RECTS),
        ),
        preserveDirtyRects,
        source,
      };

      if (Number.isFinite(Number(options.dirtyMergeWasteRatio))) {
        detail.dirtyMergeWasteRatio = Number(options.dirtyMergeWasteRatio);
      }

      if (options.mergeAdjacentDirtyRects === false) {
        detail.mergeAdjacentDirtyRects = false;
      }

      if (options.clipToArtboards === false) {
        detail.clipToArtboards = false;
      }

      if (Array.isArray(options.previewArtboardClipRects)) {
        const previewArtboardClipRects = this.clonePreviewDirtyArtboardClipRects(options.previewArtboardClipRects);

        if (previewArtboardClipRects.length > 0) {
          detail.previewArtboardClipRects = previewArtboardClipRects;
        }
      }

      if (dirtyRects.length === 1 && preserveDirtyRects !== true) {
        detail.rect = { ...dirtyRects[0] };
        detail.rects = null;
      } else {
        detail.rect = null;
        detail.rects = dirtyRects.length > 0
          ? dirtyRects.map((rect) => ({ ...rect }))
          : null;
      }

      return detail;
    }

    commitVisualDirtyChange(options = {}) {
      if (namespace.PerfTrace?.enabled) {
        namespace.PerfTrace.mark("dirty.commit", {
          layerId: options.layerId || "",
          rectCount: Array.isArray(options.rects) ? options.rects.length : (options.rect ? 1 : 0),
          source: options.source || "visual-dirty",
        });
      }
      const detail = this.createVisualDirtyChange(options);
      const shouldEmit = options.emit !== false;

      if (shouldEmit) {
        this.emitContentChange(detail);
      } else if (options.invalidate !== false) {
        this.invalidatePreviewCache(detail.source, detail);
      }

      if (options.requestDraw === true) {
        this.requestDraw();
      }

      return detail;
    }

    unionDirtyRegionRects(rects = []) {
      return rects.reduce((result, rect) => this.unionRasterHistoryRects(result, rect), null);
    }

    getDirtyRegionRectArea(rect) {
      if (!rect) {
        return 0;
      }

      return Math.max(0, Math.round(rect.width || 0)) * Math.max(0, Math.round(rect.height || 0));
    }

    getDirtyRegionRectListArea(rects = []) {
      return rects.reduce((total, rect) => total + this.getDirtyRegionRectArea(rect), 0);
    }

    compactDirtyRegionRects(rects = [], options = {}) {
      const maxRects = Math.max(1, Math.round(Number(options.maxRects) || PREVIEW_DIRTY_MAX_RECTS));
      const mergeWasteRatio = Math.max(
        1,
        Number.isFinite(Number(options.mergeWasteRatio))
          ? Number(options.mergeWasteRatio)
          : PREVIEW_DIRTY_MERGE_WASTE_RATIO,
      );
      const mergeAdjacent = options.mergeAdjacent !== false;
      const normalizedRects = rects
        .map((rect) => (
          options.skipNormalize === true
            ? (rect && rect.width > 0 && rect.height > 0 ? { ...rect } : null)
            : this.normalizeDirtyRegionRect(rect)
        ))
        .filter(Boolean);
      const compacted = [];
      const overlaps = (a, b) => (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
      const canMerge = (a, b) => {
        if (!mergeAdjacent && !overlaps(a, b)) {
          return false;
        }

        const merged = this.unionRasterHistoryRects(a, b);
        const mergedArea = this.getDirtyRegionRectArea(merged);
        const sourceArea = this.getDirtyRegionRectArea(a) + this.getDirtyRegionRectArea(b);

        return mergedArea <= sourceArea * mergeWasteRatio;
      };

      normalizedRects.forEach((rect) => {
        let mergedRect = { ...rect };
        let didMerge = true;

        while (didMerge) {
          didMerge = false;

          for (let index = 0; index < compacted.length; index += 1) {
            if (!canMerge(compacted[index], mergedRect)) {
              continue;
            }

            mergedRect = this.unionRasterHistoryRects(compacted[index], mergedRect);
            compacted.splice(index, 1);
            didMerge = true;
            break;
          }
        }

        compacted.push(mergedRect);
      });

      while (compacted.length > maxRects) {
        let bestA = 0;
        let bestB = 1;
        let bestExtraArea = Infinity;

        for (let a = 0; a < compacted.length; a += 1) {
          for (let b = a + 1; b < compacted.length; b += 1) {
            const merged = this.unionRasterHistoryRects(compacted[a], compacted[b]);
            const extraArea = this.getDirtyRegionRectArea(merged) -
              this.getDirtyRegionRectArea(compacted[a]) -
              this.getDirtyRegionRectArea(compacted[b]);

            if (extraArea < bestExtraArea) {
              bestA = a;
              bestB = b;
              bestExtraArea = extraArea;
            }
          }
        }

        compacted[bestA] = this.unionRasterHistoryRects(compacted[bestA], compacted[bestB]);
        compacted.splice(bestB, 1);
      }

      return compacted;
    }

    createPreviewDirtyStats() {
      return {
        fullFrames: 0,
        lastCacheHeight: 0,
        lastCacheScale: 1,
        lastCacheWidth: 0,
        lastCoverage: 1,
        lastDrawnPixels: 0,
        lastFullPixels: 0,
        lastMode: "full",
        lastReason: "init",
        lastRect: null,
        lastRectCount: 0,
        lastScissorCount: 0,
        lastSavedPixels: 0,
        partialFrames: 0,
        totalDrawnPixels: 0,
        totalFrames: 0,
        totalFullPixels: 0,
        totalSavedPixels: 0,
      };
    }

    resetPreviewDirtyStats() {
      this.previewDirtyStats = this.createPreviewDirtyStats();

      return this.getPreviewDirtyStats();
    }

    recordPreviewDirtyFrame(options = {}) {
      const cacheWidth = Math.max(1, Math.round(Number(options.cacheWidth) || this.previewCacheWidth || 1));
      const cacheHeight = Math.max(1, Math.round(Number(options.cacheHeight) || this.previewCacheHeight || 1));
      const fullPixels = cacheWidth * cacheHeight;
      const scissors = Array.isArray(options.dirtyScissors)
        ? options.dirtyScissors.filter(Boolean)
        : (options.dirtyScissor ? [options.dirtyScissor] : []);
      const mode = scissors.length > 0 ? "partial" : "full";
      const drawnPixels = mode === "partial"
        ? Math.min(fullPixels, Math.max(1, this.getDirtyRegionRectListArea(scissors)))
        : fullPixels;
      const savedPixels = Math.max(0, fullPixels - drawnPixels);
      const dirtyRects = Array.isArray(options.dirtyRects)
        ? options.dirtyRects.filter(Boolean)
        : (options.dirtyRect ? [options.dirtyRect] : []);
      const stats = this.previewDirtyStats || this.createPreviewDirtyStats();

      stats.totalFrames += 1;
      stats.totalFullPixels += fullPixels;
      stats.totalDrawnPixels += drawnPixels;
      stats.totalSavedPixels += savedPixels;

      if (mode === "partial") {
        stats.partialFrames += 1;
      } else {
        stats.fullFrames += 1;
      }

      stats.lastCacheHeight = cacheHeight;
      stats.lastCacheScale = Math.max(0.0001, Number(options.cacheScale) || this.previewCacheScale || 1);
      stats.lastCacheWidth = cacheWidth;
      stats.lastCoverage = fullPixels > 0 ? drawnPixels / fullPixels : 1;
      stats.lastDrawnPixels = drawnPixels;
      stats.lastFullPixels = fullPixels;
      stats.lastMode = mode;
      stats.lastReason = this.previewCacheReason || "unknown";
      stats.lastRect = options.dirtyRect ? { ...options.dirtyRect } : null;
      stats.lastRectCount = dirtyRects.length;
      stats.lastScissorCount = scissors.length;
      stats.lastSavedPixels = savedPixels;

      this.previewDirtyStats = stats;
      this.previewLastDirtyMode = mode;
      this.previewLastDirtyRect = stats.lastRect ? { ...stats.lastRect } : null;

      return this.getPreviewDirtyStats();
    }

    getPreviewDirtyStats() {
      const stats = this.previewDirtyStats || this.createPreviewDirtyStats();
      const totalFrames = Math.max(0, Number(stats.totalFrames) || 0);
      const totalFullPixels = Math.max(0, Number(stats.totalFullPixels) || 0);
      const totalSavedPixels = Math.max(0, Number(stats.totalSavedPixels) || 0);

      return {
        ...stats,
        hitRate: totalFrames > 0 ? stats.partialFrames / totalFrames : 0,
        lastRect: stats.lastRect ? { ...stats.lastRect } : null,
        totalSavedRatio: totalFullPixels > 0 ? totalSavedPixels / totalFullPixels : 0,
      };
    }

    getPreviewDirtyRegionScissor(rect, cacheWidth, cacheHeight, cacheScale, options = {}) {
      const dirtyRect = this.normalizeDirtyRegionRect(rect);

      if (!dirtyRect) {
        return null;
      }

      const documentRect = options.documentRect || options.cacheDocumentRect || this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect();
      const offsetX = Number.isFinite(Number(documentRect?.x)) ? Number(documentRect.x) : 0;
      const offsetY = Number.isFinite(Number(documentRect?.y)) ? Number(documentRect.y) : 0;
      const x0 = Math.max(0, Math.floor((dirtyRect.x - offsetX) * cacheScale));
      const y0 = Math.max(0, Math.floor((dirtyRect.y - offsetY) * cacheScale));
      const x1 = Math.min(cacheWidth, Math.ceil((dirtyRect.x + dirtyRect.width - offsetX) * cacheScale));
      const y1 = Math.min(cacheHeight, Math.ceil((dirtyRect.y + dirtyRect.height - offsetY) * cacheScale));

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        height: y1 - y0,
        width: x1 - x0,
        x: x0,
        y: cacheHeight - y1,
      };
    }

    getPreviewDirtyRegionScissors(rects, cacheWidth, cacheHeight, cacheScale, options = {}) {
      const cachePixels = Math.max(1, Math.round(cacheWidth || 1) * Math.round(cacheHeight || 1));
      const scissors = this.compactDirtyRegionRects(
        (Array.isArray(rects) ? rects : [])
          .map((rect) => this.getPreviewDirtyRegionScissor(rect, cacheWidth, cacheHeight, cacheScale, options))
          .filter(Boolean),
        {
          maxRects: options.maxRects || PREVIEW_DIRTY_MAX_RECTS,
          mergeAdjacent: options.mergeAdjacent,
          mergeWasteRatio: options.mergeWasteRatio,
          skipNormalize: true,
        },
      );
      const redrawPixels = Math.min(cachePixels, this.getDirtyRegionRectListArea(scissors));

      if (!scissors.length || redrawPixels / cachePixels >= PREVIEW_DIRTY_FULL_COVERAGE_RATIO) {
        return null;
      }

      return scissors;
    }

    emitPreviewDirtyRegionDebug(detail = {}) {
      if (namespace.debugPreviewDirtyRegions !== true) {
        return;
      }

      window.dispatchEvent(new CustomEvent(PREVIEW_DIRTY_DEBUG_EVENT, {
        detail: {
          generatedAt: Date.now(),
          ...detail,
        },
      }));
    }

    invalidatePreviewCache(reason = "unknown", options = {}) {
      if (namespace.PerfTrace?.enabled) {
        namespace.PerfTrace.mark("preview.invalidate", {
          layerId: options.layerId || "",
          ready: this.previewCacheReady,
          reason,
          rectCount: Array.isArray(options.rects) ? options.rects.length : (options.rect ? 1 : 0),
        });
      }
      const hadFullInvalidation = this.previewCacheDirty && this.previewDirtyRects === null;
      const dirtyRects = this.getDirtyRegionRectsFromOptions(options);
      const incomingDirtyRectCount = this.getIncomingDirtyRegionRectCount(options);

      this.invalidateArtboardFlatPreviews(reason, options, dirtyRects);

      if (!dirtyRects.length && incomingDirtyRectCount > 0) {
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause: "dirty-outside-visible-artboards",
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "skipped",
            reason,
            rects: [],
          });
        }
        return;
      }

      this.previewCacheDirty = true;
      this.previewCacheReason = reason;

      if (!dirtyRects.length || !this.previewCacheReady) {
        const forcedFullCause = !dirtyRects.length
          ? "no-dirty-rects"
          : "preview-cache-not-ready";

        this.previewDirtyRects = null;
        this.previewDirtyCompactOptions = null;
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause,
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "full",
            reason,
            rects: forcedFullCause === "preview-cache-not-ready"
              ? dirtyRects.map((rect) => ({ ...rect }))
              : [],
          });
        }
        return;
      }

      if (hadFullInvalidation) {
        if (namespace.debugPreviewDirtyRegions === true) {
          this.emitPreviewDirtyRegionDebug({
            layerId: options.layerId || "",
            meta: {
              forcedFullCause: "full-invalidation-pending",
              incomingDirtyRectCount,
              incomingDirtyRectsLength: dirtyRects.length,
              incomingOptionsRectsLength: Array.isArray(options.rects) ? options.rects.length : null,
              previewCacheDirty: this.previewCacheDirty,
              previewCacheReady: this.previewCacheReady,
            },
            mode: "full-pending",
            reason,
            rects: dirtyRects.map((rect) => ({ ...rect })),
          });
        }
        return;
      }

      const previousCompactOptions = this.previewDirtyCompactOptions || {};
      const nextCompactOptions = {
        maxRects: Math.max(
          1,
          Math.round(Number(options.maxDirtyRects || previousCompactOptions.maxRects || PREVIEW_DIRTY_MAX_RECTS)),
        ),
        mergeAdjacent: previousCompactOptions.mergeAdjacent === false ||
          options.preserveDirtyRects === true ||
          options.mergeAdjacentDirtyRects === false
            ? false
            : true,
        mergeWasteRatio: Number.isFinite(Number(options.dirtyMergeWasteRatio))
          ? Number(options.dirtyMergeWasteRatio)
          : previousCompactOptions.mergeWasteRatio,
      };
      const nextDirtyRects = this.compactDirtyRegionRects([
        ...(Array.isArray(this.previewDirtyRects) ? this.previewDirtyRects : []),
        ...dirtyRects,
      ], nextCompactOptions);

      this.previewDirtyCompactOptions = nextCompactOptions;
      this.previewDirtyRects = nextDirtyRects.length > 0 ? nextDirtyRects : null;
      if (namespace.debugPreviewDirtyRegions === true) {
        this.emitPreviewDirtyRegionDebug({
          layerId: options.layerId || "",
          mode: "partial",
          reason,
          rects: nextDirtyRects.map((rect) => ({ ...rect })),
        });
      }
    }

    getLayerOpacity(layerId, layers = this.getRenderableLayers()) {
      const layer = Array.isArray(layers)
        ? layers.find((entry) => entry?.id === layerId)
        : null;

      return Number.isFinite(layer?.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
    }

    normalizeArtboardDragLayerIds(layerIds = []) {
      return new Set((Array.isArray(layerIds) ? layerIds : [])
        .map((layerId) => String(layerId || "").trim())
        .filter(Boolean));
    }

    beginArtboardDragPreview(options = {}) {
      const artboardId = String(options.artboardId || "").trim();

      if (!artboardId) {
        return false;
      }

      this.artboardDragPreview = {
        artboardId,
        dx: 0,
        dy: 0,
        layerIds: this.normalizeArtboardDragLayerIds(options.layerIds),
        startArtboardRect: options.startArtboardRect ? { ...options.startArtboardRect } : null,
      };

      return true;
    }

    setArtboardDragPreview(options = {}) {
      const artboardId = String(options.artboardId || "").trim();

      if (!this.artboardDragPreview || this.artboardDragPreview.artboardId !== artboardId) {
        return this.beginArtboardDragPreview(options) && this.setArtboardDragPreview(options);
      }

      const dx = Number(options.dx);
      const dy = Number(options.dy);

      this.artboardDragPreview.dx = Number.isFinite(dx) ? dx : 0;
      this.artboardDragPreview.dy = Number.isFinite(dy) ? dy : 0;

      if (Array.isArray(options.layerIds)) {
        this.artboardDragPreview.layerIds = this.normalizeArtboardDragLayerIds(options.layerIds);
      }

      return true;
    }

    clearArtboardDragPreview(artboardId = "") {
      const normalizedArtboardId = String(artboardId || "").trim();

      if (!this.artboardDragPreview) {
        return false;
      }

      if (normalizedArtboardId && this.artboardDragPreview.artboardId !== normalizedArtboardId) {
        return false;
      }

      this.artboardDragPreview = null;
      return true;
    }

    hasArtboardDragPreview() {
      return Boolean(
        this.artboardDragPreview &&
        (this.artboardDragPreview.dx !== 0 || this.artboardDragPreview.dy !== 0)
      );
    }

    getArtboardDragOffsetForLayer(layer) {
      const preview = this.artboardDragPreview;

      if (!preview || !layer?.id || layer.artboardId !== preview.artboardId) {
        return null;
      }

      if (preview.layerIds.size > 0 && !preview.layerIds.has(layer.id)) {
        return null;
      }

      if (preview.dx === 0 && preview.dy === 0) {
        return null;
      }

      return {
        dx: preview.dx,
        dy: preview.dy,
      };
    }

    offsetDocumentRect(rect, dx = 0, dy = 0) {
      if (!rect) {
        return null;
      }

      return {
        height: rect.height,
        width: rect.width,
        x: rect.x + dx,
        y: rect.y + dy,
      };
    }

    getArtboardDragVisualRect(layer, rect = null, layerTarget = null) {
      const offset = this.getArtboardDragOffsetForLayer(layer);

      if (!offset) {
        return rect;
      }

      const baseRect = rect || this.getRasterTargetDocumentRect(layerTarget);

      return this.offsetDocumentRect(baseRect, offset.dx, offset.dy);
    }

    getLayerArtboardRect(layer) {
      if (this.options?.isolateDocumentArtboards) {
        return null;
      }

      const explicitArtboardId = String(layer?.artboardId || "").trim();
      const inferredArtboardId = !explicitArtboardId && layer?.id
        ? String(this.layerModel?.findEntryArtboardId?.(layer.id) || "").trim()
        : "";
      const artboardId = explicitArtboardId || inferredArtboardId;

      if (!artboardId) {
        return null;
      }

      const rect = namespace.getDocumentArtboardRect?.(artboardId);

      if (!rect) {
        return null;
      }

      return {
        height: Math.max(1, Math.round(Number(rect.height) || 1)),
        width: Math.max(1, Math.round(Number(rect.width) || 1)),
        x: Math.round(Number(rect.x) || 0),
        y: Math.round(Number(rect.y) || 0),
      };
    }

    getLayerArtboardVisualRect(layer) {
      const rect = this.getLayerArtboardRect(layer);
      const offset = this.getArtboardDragOffsetForLayer(layer);

      return rect && offset
        ? this.offsetDocumentRect(rect, offset.dx, offset.dy)
        : rect;
    }

    isPointInsideLayerArtboard(layer, x, y, padding = 0) {
      const rect = this.getLayerArtboardRect(layer);
      const safePadding = Math.max(0, Number(padding) || 0);

      if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) {
        return true;
      }

      return (
        x >= rect.x - safePadding &&
        y >= rect.y - safePadding &&
        x <= rect.x + rect.width + safePadding &&
        y <= rect.y + rect.height + safePadding
      );
    }

    offsetFiniteValue(value, delta = 0) {
      const number = Number(value);

      return Number.isFinite(number) ? number + delta : value;
    }

    getArtboardDragVisualLayer(layer) {
      const offset = this.getArtboardDragOffsetForLayer(layer);

      if (!offset || !layer?.puppet || !Array.isArray(layer.puppet.pins)) {
        return layer;
      }

      return {
        ...layer,
        puppet: {
          ...layer.puppet,
          pins: layer.puppet.pins.map((pin) => ({
            ...pin,
            restX: this.offsetFiniteValue(pin.restX, offset.dx),
            restY: this.offsetFiniteValue(pin.restY, offset.dy),
            x: this.offsetFiniteValue(pin.x, offset.dx),
            y: this.offsetFiniteValue(pin.y, offset.dy),
          })),
        },
      };
    }

    createClipBaseForLayer(layer, target, visible = true) {
      const offset = this.getArtboardDragOffsetForLayer(layer);
      const targetRect = offset ? this.getRasterTargetDocumentRect(target) : null;

      return {
        layer,
        target,
        visible,
        visualX: targetRect ? targetRect.x + offset.dx : undefined,
        visualY: targetRect ? targetRect.y + offset.dy : undefined,
      };
    }

    getClipBaseOrigin(clipBase) {
      return {
        x: Number.isFinite(clipBase?.visualX)
          ? clipBase.visualX
          : Number.isFinite(clipBase?.target?.x)
            ? clipBase.target.x
            : 0,
        y: Number.isFinite(clipBase?.visualY)
          ? clipBase.visualY
          : Number.isFinite(clipBase?.target?.y)
            ? clipBase.target.y
            : 0,
      };
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

    getNoise(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "noise" && item.enabled !== false)
        : effects?.noise;
      const seed = Number(effect?.seed);

      return {
        amount: normalizeNoiseAmount(effect?.amount),
        scale: normalizeNoiseScale(effect?.scale),
        monochrome: effect ? effect.monochrome !== false : true,
        seed: Number.isFinite(seed) ? seed : 0,
      };
    }

    getLayerNoise(layer) {
      const noise = this.getNoise(layer);

      return noise.amount > 0
        ? {
            enabled: true,
            amount: noise.amount,
            scale: noise.scale,
            monochrome: noise.monochrome,
            seed: noise.seed,
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

    getCurves(layer) {
      const effects = layer?.effects;
      const effect = Array.isArray(effects)
        ? effects.find((item) => item && item.type === "curves" && item.enabled !== false)
        : effects?.curves;

      return normalizeCurvesEffect(effect);
    }

    getLayerCurves(layer) {
      const curves = this.getCurves(layer);

      return hasMeaningfulCurvesEffect(curves) ? curves : null;
    }

    hasEnabledLayerEffects(layer) {
      return (
        this.getGaussianBlurRadius(layer) > 0 ||
        this.getMotionBlur(layer).distance > 0 ||
        hasFieldBlurAmount(this.getFieldBlur(layer).pins) ||
        this.getRadialBlur(layer).amount > 0 ||
        this.getGrain(layer).amount > 0 ||
        this.getNoise(layer).amount > 0 ||
        Boolean(this.getLayerThreshold(layer)) ||
        Boolean(this.getLayerCurves(layer))
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

    ensureLayerCompositeTargets(width, height) {
      const targetWidth = Math.max(1, Math.round(width || 1));
      const targetHeight = Math.max(1, Math.round(height || 1));
      const hasTargets =
        this.layerCompositeScratchA?.texture &&
        this.layerCompositeScratchA?.framebuffer &&
        this.layerCompositeScratchB?.texture &&
        this.layerCompositeScratchB?.framebuffer &&
        this.layerCompositeWidth === targetWidth &&
        this.layerCompositeHeight === targetHeight;

      if (hasTargets) {
        this.markRasterResourceUsed(this.layerCompositeScratchA.texture);
        this.markRasterResourceUsed(this.layerCompositeScratchB.texture);
        return [this.layerCompositeScratchA, this.layerCompositeScratchB];
      }

      this.deleteLayerCompositeTargets();

      this.layerCompositeScratchA = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
        kind: "compositeScratch",
        label: "layer composite ping",
        ownerId: "layer-composite-ping",
        reason: "create-layer-composite-target",
      });
      this.layerCompositeScratchB = this.createLayerEffectScratchTarget(targetWidth, targetHeight, {
        kind: "compositeScratch",
        label: "layer composite pong",
        ownerId: "layer-composite-pong",
        reason: "create-layer-composite-target",
      });
      this.layerCompositeWidth = targetWidth;
      this.layerCompositeHeight = targetHeight;

      return [this.layerCompositeScratchA, this.layerCompositeScratchB];
    }

    deleteLayerCompositeTargets() {
      this.deleteLayerEffectTarget(this.layerCompositeScratchA);
      this.deleteLayerEffectTarget(this.layerCompositeScratchB);
      this.layerCompositeScratchA = null;
      this.layerCompositeScratchB = null;
      this.layerCompositeWidth = 0;
      this.layerCompositeHeight = 0;
    }

    deleteLayerCompositeResources() {
      const gl = this.gl;

      if (this.layerCompositeProgramInfo?.program) {
        gl.deleteProgram(this.layerCompositeProgramInfo.program);
        this.layerCompositeProgramInfo = null;
      }

      this.deleteLayerCompositeTargets();
    }

    beginLayerComposite(width, height) {
      const [read, write] = this.ensureLayerCompositeTargets(width, height);
      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, read.framebuffer);
      gl.viewport(0, 0, read.width, read.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        height: read.height,
        read,
        width: read.width,
        write,
      };
    }

    swapLayerComposite(compositeState) {
      return {
        ...compositeState,
        read: compositeState.write,
        write: compositeState.read,
      };
    }

    setLayerCompositeMaskClipUniforms(uniforms, clipRect = null, clipRects = null) {
      const gl = this.gl;
      const rects = Array.isArray(clipRects)
        ? clipRects.slice(0, 32)
        : [];

      if (rects.length > 0) {
        const values = new Float32Array(32 * 4);

        rects.forEach((rect, index) => {
          values[index * 4] = rect.x;
          values[index * 4 + 1] = rect.y;
          values[index * 4 + 2] = rect.width;
          values[index * 4 + 3] = rect.height;
        });

        gl.uniform1f(uniforms.maskClipMode, 1.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniforms.maskClipRectCount, rects.length);
        gl.uniform4fv(uniforms.maskClipRects, values);
        return;
      }

      if (clipRect) {
        gl.uniform1f(uniforms.maskClipMode, 1.0);
        gl.uniform4f(uniforms.maskClipRect, clipRect.x, clipRect.y, clipRect.width, clipRect.height);
        gl.uniform1i(uniforms.maskClipRectCount, 0);
        return;
      }

      gl.uniform1f(uniforms.maskClipMode, 0.0);
      gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
      gl.uniform1i(uniforms.maskClipRectCount, 0);
    }

    drawLayerCompositeTexture(options = {}) {
      const sourceTexture = options.texture;
      const backdropTexture = options.backdropTexture;

      if (!sourceTexture || !backdropTexture || !options.framebuffer) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureLayerCompositeProgramInfo();
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || 1));
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const rect = options.rect || {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(options.documentWidth || this.width || 1)),
        height: Math.max(1, Math.round(options.documentHeight || this.height || 1)),
      };
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const blendModeId = Math.max(0, Math.round(Number(options.blendModeId) || 0));
      const clipBase = options.clipBase || null;
      const maskTexture = options.maskTexture || null;
      const maskRect = options.maskRect || null;
      const previewCutRect = options.previewCutRect || null;
      const textureMagFilter = Number.isFinite(options.textureMagFilter)
        ? options.textureMagFilter
        : this.getViewportTextureMagFilter(camera);
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("layer-composite.draw", {
        blendModeId,
        hasClipBase: Boolean(clipBase?.target?.texture),
        hasMask: Boolean(maskTexture),
        sourceHeight: Math.max(1, Math.round(rect.height || 1)),
        sourceWidth: Math.max(1, Math.round(rect.width || 1)),
        viewportHeight,
        viewportWidth,
      }) : null;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform4f(uniforms.sourceRect, rect.x, rect.y, rect.width, rect.height);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1i(uniforms.backdropTexture, 3);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.blendMode, blendModeId);

      if (maskTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        gl.uniform1f(uniforms.maskMode, 1.0);

        if (maskRect) {
          gl.uniform1f(uniforms.maskRectMode, 1.0);
          gl.uniform4f(uniforms.maskRect, maskRect.x, maskRect.y, maskRect.width, maskRect.height);
        } else {
          gl.uniform1f(uniforms.maskRectMode, 0.0);
          gl.uniform4f(uniforms.maskRect, 0, 0, rect.width, rect.height);
        }

        this.setLayerCompositeMaskClipUniforms(uniforms, options.maskClipRect, options.maskClipRects);
      } else {
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, rect.width, rect.height);
        this.setLayerCompositeMaskClipUniforms(uniforms);
      }

      if (clipBase?.target?.texture) {
        const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
          ? Math.min(1, Math.max(0, clipBase.layer.opacity))
          : 1;
        const clipOrigin = this.getClipBaseOrigin(clipBase);

        gl.activeTexture(gl.TEXTURE2);
        this.setRasterTextureSampling(clipBase.target.texture, gl.LINEAR, textureMagFilter);
        gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
        gl.uniform1f(uniforms.clipMode, 1.0);
        gl.uniform1f(uniforms.clipOpacity, clipOpacity);
        gl.uniform2f(
          uniforms.clipOrigin,
          clipOrigin.x,
          clipOrigin.y,
        );
        gl.uniform2f(
          uniforms.clipTextureSize,
          clipBase.target.width || this.width,
          clipBase.target.height || this.height,
        );
      } else {
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, this.width, this.height);
      }

      if (previewCutRect) {
        gl.uniform1f(uniforms.previewCutMode, 1.0);
        gl.uniform4f(
          uniforms.previewCutRect,
          previewCutRect.x,
          previewCutRect.y,
          previewCutRect.width,
          previewCutRect.height,
        );
      } else {
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      }

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
      gl.activeTexture(gl.TEXTURE0);
      this.setRasterTextureSampling(sourceTexture, gl.LINEAR, textureMagFilter);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      if (maskTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      if (clipBase?.target?.texture) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(null);

      trace?.end();

      return true;
    }

    drawScreenTexture(texture, options = {}) {
      if (!texture || !this.programInfo || !this.quad?.vao) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.programInfo;
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);

      if (options.blend === false) {
        gl.disable(gl.BLEND);
      } else {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, 0, 0);
      gl.uniform1f(uniforms.cameraZoom, 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1i(uniforms.selectionClipTexture, 3);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, viewportWidth, viewportHeight);
      gl.uniform1f(uniforms.maskClipMode, 0.0);
      gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
      gl.uniform1i(uniforms.maskClipRectCount, 0);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipOrigin, 0, 0);
      gl.uniform2f(uniforms.clipTextureSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.drawOrigin, 0, 0);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.selectionClipMode, 0.0);
      gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
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

    deleteNoiseResources() {
      if (this.noiseProgramInfo?.program) {
        this.gl.deleteProgram(this.noiseProgramInfo.program);
      }

      this.noiseProgramInfo = null;
    }

    deleteThresholdResources() {
      if (this.thresholdProgramInfo?.program) {
        this.gl.deleteProgram(this.thresholdProgramInfo.program);
      }

      this.thresholdProgramInfo = null;
    }

    deleteCurvesResources() {
      const gl = this.gl;

      if (this.curvesProgramInfo?.program) {
        gl.deleteProgram(this.curvesProgramInfo.program);
      }

      this.curvesProgramInfo = null;

      if (this.curvesLutTexture) {
        this.deleteRasterTexture(this.curvesLutTexture);
        gl.deleteTexture(this.curvesLutTexture);
        this.curvesLutTexture = null;
      }
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

    runNoisePass({
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
      const { program, uniforms } = this.ensureNoiseProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.amount, normalizeNoiseAmount(amount));
      gl.uniform1f(uniforms.scale, normalizeNoiseScale(scale));
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

    ensureCurvesLutTexture() {
      if (this.curvesLutTexture) {
        this.markRasterResourceUsed(this.curvesLutTexture);
        return this.curvesLutTexture;
      }

      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture LUT curves.");
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
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.curvesLutTexture = texture;
      this.registerRasterTexture(texture, {
        height: 1,
        kind: "curvesLut",
        label: "curves LUT texture",
        ownerId: "curves-lut",
        ownerType: "scratch",
        purgeable: true,
        reason: "ensure-curves-lut-texture",
        width: 256,
      });

      return texture;
    }

    uploadCurvesLutTexture(lutData) {
      if (!(lutData instanceof Uint8Array) || lutData.length !== 256 * 4) {
        return null;
      }

      const gl = this.gl;
      const texture = this.ensureCurvesLutTexture();

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        256,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        lutData,
      );
      gl.activeTexture(gl.TEXTURE0);

      return texture;
    }

    runCurvesPass({ sourceTexture, target, curves }) {
      if (!sourceTexture || !target?.framebuffer || !this.quad?.vao || !curves) {
        return false;
      }

      const lutData = buildPackedCurvesLut(curves);
      const lutTexture = this.uploadCurvesLutTexture(lutData);

      if (!lutTexture) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensureCurvesProgramInfo();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.curveLut, 1);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
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

    applyNoiseTexture(sourceTexture, noise, options = {}) {
      const noiseEffect = noise || null;
      const amount = normalizeNoiseAmount(noiseEffect?.amount);

      if (!sourceTexture || amount <= 0) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didNoisePass = this.runNoisePass({
        amount,
        monochrome: noiseEffect?.monochrome !== false,
        originX: Number.isFinite(options.originX) ? options.originX : 0,
        originY: Number.isFinite(options.originY) ? options.originY : 0,
        scale: normalizeNoiseScale(noiseEffect?.scale),
        seed: Number.isFinite(Number(noiseEffect?.seed)) ? Number(noiseEffect.seed) : 0,
        sourceTexture,
        target,
      });

      return didNoisePass ? target.texture : sourceTexture;
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

    applyCurvesTexture(sourceTexture, curves, options = {}) {
      if (!sourceTexture || !curves || !hasMeaningfulCurvesEffect(curves)) {
        return sourceTexture || null;
      }

      const width = Math.max(1, Math.round(options.width || this.width || 1));
      const height = Math.max(1, Math.round(options.height || this.height || 1));
      const target = this.getLayerEffectWriteTarget(sourceTexture, width, height);
      const didCurvesPass = this.runCurvesPass({
        curves,
        sourceTexture,
        target,
      });

      return didCurvesPass ? target.texture : sourceTexture;
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
          } else if (effect.type === "noise") {
            const noise = this.getLayerNoise({ effects: [effect] });

            if (noise) {
              texture = this.applyNoiseTexture(texture, noise, effectOptions);
            }
          } else if (effect.type === "threshold") {
            const threshold = this.getLayerThreshold({ effects: [effect] });

            if (threshold) {
              texture = this.applyThresholdTexture(texture, threshold, effectOptions);
            }
          } else if (effect.type === "curves") {
            const curves = this.getLayerCurves({ effects: [effect] });

            if (curves) {
              texture = this.applyCurvesTexture(texture, curves, effectOptions);
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
      const noise = this.getLayerNoise(layer);
      const threshold = this.getLayerThreshold(layer);
      const curves = this.getLayerCurves(layer);

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

      if (noise) {
        texture = this.applyNoiseTexture(texture, noise, effectOptions);
      }

      if (threshold) {
        texture = this.applyThresholdTexture(texture, threshold, effectOptions);
      }

      if (curves) {
        texture = this.applyCurvesTexture(texture, curves, effectOptions);
      }

      return texture;
    }

    getArtboardBackgroundRenderRects() {
      const artboards = namespace.getDocumentArtboards?.();

      if (Array.isArray(artboards) && artboards.length > 0) {
        return artboards
          .map((artboard) => ({
            height: Math.max(1, Math.round(Number(artboard.height) || 1)),
            width: Math.max(1, Math.round(Number(artboard.width) || 1)),
            x: Math.round(Number(artboard.x) || 0),
            y: Math.round(Number(artboard.y) || 0),
          }))
          .filter((rect) => rect.width > 0 && rect.height > 0);
      }

      return [{
        height: Math.max(1, Math.round(this.height || 1)),
        width: Math.max(1, Math.round(this.width || 1)),
        x: 0,
        y: 0,
      }];
    }

    isProceduralBackgroundLayerTarget(layer, layerTarget) {
      return Boolean(
        layerTarget?.procedural === true &&
        (layerTarget.layerId === "background" || layer?.id === "background" || layer?.type === "background")
      );
    }

    getProceduralBackgroundRenderResults(layer, layerTarget, options = {}) {
      if (!layerTarget?.texture) {
        return [];
      }

      if (this.options.cssArtboardPaper === true) {
        return [];
      }

      const renderRect = options.renderRect || null;
      const cullingStats = options.cullingStats || null;
      const renderRects = this.getArtboardBackgroundRenderRects();
      const layerArtboardId = String(layer?.artboardId || "").trim();
      const scopedRects = (() => {
        if (!layerArtboardId) {
          return renderRects;
        }

        const artboards = namespace.getDocumentArtboards?.();
        const artboardIndex = Array.isArray(artboards)
          ? artboards.findIndex((artboard, index) => {
              const artboardId = String(artboard?.id || (index === 0 ? "active-document" : `artboard-${index + 1}`));

              return artboardId === layerArtboardId;
            })
          : -1;

        if (artboardIndex >= 0 && renderRects[artboardIndex]) {
          return [renderRects[artboardIndex]];
        }

        return layerArtboardId === "active-document" && renderRects[0]
          ? [renderRects[0]]
          : [];
      })();

      const visibleRects = [];

      scopedRects.forEach((rect) => {
        const isVisible = !renderRect || this.documentRectsIntersect(rect, renderRect);

        if (cullingStats?.artboardBackgrounds) {
          cullingStats.artboardBackgrounds.tested += 1;
          if (isVisible) {
            cullingStats.artboardBackgrounds.drawn += 1;
          } else {
            cullingStats.artboardBackgrounds.skippedOutsideRenderRect += 1;
          }
        }

        if (isVisible) {
          visibleRects.push(rect);
        }
      });

      return visibleRects.map((rect) => ({
        height: rect.height,
        rect,
        texture: layerTarget.texture,
        width: rect.width,
      }));
    }

    getLayerRenderResult(layer, layerTarget, options = {}) {
      if (!layerTarget?.texture) {
        return null;
      }

      const skipLayerEffects = options.skipLayerEffects === true;
      const targetRect = this.getRasterTargetDocumentRect(layerTarget);
      let width = Math.max(1, Math.round(layerTarget.width || this.width || 1));
      let height = Math.max(1, Math.round(layerTarget.height || this.height || 1));
      let rect = this.isCroppedRasterTarget(layerTarget) ? targetRect : null;
      let texture = layerTarget.texture;
      const paddedRect = !skipLayerEffects && this.isCroppedRasterTarget(layerTarget)
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

      if (!skipLayerEffects) {
        texture = this.applyLayerEffectsToTexture(layer, texture, { height, rect, sourceRect: targetRect, width });
      }

      return {
        height,
        rect,
        texture,
        width,
      };
    }

    getLayerRenderResults(layer, layerTarget, options = {}) {
      const cullingStats = options.cullingStats || null;

      if (this.isProceduralBackgroundLayerTarget(layer, layerTarget)) {
        const results = this.getProceduralBackgroundRenderResults(layer, layerTarget, options);

        if (cullingStats?.renderResults) {
          cullingStats.renderResults.returned += results.length;
        }

        return results;
      }

      if (this.isSparseRasterTarget(layerTarget)) {
        const renderRect = options.cullSparseTiles === true
          ? options.renderRect
          : null;
        const tileTargets = Array.from(layerTarget.tiles.values());
        const visibleTileTargets = [];

        tileTargets.forEach((tileTarget) => {
          if (cullingStats?.sparseTiles) {
            cullingStats.sparseTiles.tested += 1;
          }

          if (!tileTarget?.texture) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.missingTexture += 1;
            }
            return;
          }

          if (!renderRect) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.uncullable += options.cullSparseTiles === true ? 0 : 1;
              cullingStats.sparseTiles.drawn += 1;
            }
            visibleTileTargets.push(tileTarget);
            return;
          }

          const tileRect = this.getRasterTargetDocumentRect(tileTarget);

          if (this.documentRectsIntersect(tileRect, renderRect)) {
            if (cullingStats?.sparseTiles) {
              cullingStats.sparseTiles.drawn += 1;
            }
            visibleTileTargets.push(tileTarget);
          } else if (cullingStats?.sparseTiles) {
            cullingStats.sparseTiles.skippedOutsideRenderRect += 1;
          }
        });

        const results = visibleTileTargets
          .sort((first, second) => (first.ty - second.ty) || (first.tx - second.tx))
          .map((tileTarget) => this.getLayerRenderResult(layer, tileTarget, options))
          .filter(Boolean);

        if (cullingStats?.renderResults) {
          cullingStats.renderResults.returned += results.length;
        }

        return results;
      }

      const result = this.getLayerRenderResult(layer, layerTarget, options);

      if (result && cullingStats?.renderResults) {
        cullingStats.renderResults.returned += 1;
      }

      return result ? [result] : [];
    }

    hasRenderableRasterTarget(layerTarget) {
      return Boolean(
        layerTarget?.texture ||
        (this.isSparseRasterTarget(layerTarget) && layerTarget.tiles.size > 0)
      );
    }

    needsSingleTextureLayerTarget(layer, layerTarget, options = {}) {
      return Boolean(
        this.isSparseRasterTarget(layerTarget) &&
        (
          options.forceSingleTexture === true ||
          this.hasPuppetLayerTransform(layer) ||
          (!options.skipLayerEffects && this.hasEnabledLayerEffects(layer))
        )
      );
    }

    getRenderableLayerTarget(layer, layerTarget, options = {}) {
      if (layer?.type === "background" && !layerTarget?.texture) {
        return this.rasterTargetsByLayerId.get("background") || layerTarget;
      }

      if (!this.needsSingleTextureLayerTarget(layer, layerTarget, options)) {
        return layerTarget;
      }

      return this.materializeRasterTarget(layer.id, {
        emit: false,
        source: options.source || "sparse-layer-render-materialize",
      }) || layerTarget;
    }

    getLayerRenderTexture(layer, layerTarget, options = {}) {
      return this.getLayerRenderResult(layer, layerTarget, options)?.texture || null;
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
      return isMobileLikeEnvironment();
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
        new Uint8Array([247, 247, 242, 255]),
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
        resourceHeight: 1,
        resourceWidth: 1,
        version: 0,
        clearColor: [247 / 255, 247 / 255, 242 / 255, 1],
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
      // Sampling lineare: la vista resta morbida durante zoom out e zoom intermedi.
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

    createPaintTarget(layerId = "", options = {}) {
      const targetLayerId = layerId || options.layerId || options.resourceMetadata?.layerId || "";

      return this.createRasterTarget([0, 0, 0, 0], {
        ...options,
        layerId: targetLayerId,
        ownerId: options.ownerId || targetLayerId || options.resourceMetadata?.ownerId,
        reason: options.reason || options.source || "create-paint-target",
      });
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

    createRasterTargetForUnclampedRect(rect, clearColor = [0, 0, 0, 0], padding = 0, options = {}) {
      const targetRect = this.getUnclampedDocumentRect(rect, padding);

      if (!targetRect) {
        return null;
      }

      return this.createRasterTarget(clearColor, {
        cropped: true,
        height: targetRect.height,
        layerId: options.layerId,
        reason: options.source || "create-raster-target-for-unclamped-rect",
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

      const documentRect = this.getDocumentBoundsRect();
      const pad = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
      const minX = Math.max(documentRect.x, Math.floor(rawX - pad));
      const minY = Math.max(documentRect.y, Math.floor(rawY - pad));
      const maxX = Math.min(documentRect.x + documentRect.width, Math.ceil(rawX + rawWidth + pad));
      const maxY = Math.min(documentRect.y + documentRect.height, Math.ceil(rawY + rawHeight + pad));

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

    getUnclampedDocumentRect(rect, padding = 0) {
      if (!rect) {
        return null;
      }

      const pad = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
      const minX = Math.floor(rawX - pad);
      const minY = Math.floor(rawY - pad);
      const maxX = Math.ceil(rawX + rawWidth + pad);
      const maxY = Math.ceil(rawY + rawHeight + pad);

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

      if (this.isSparseRasterTarget(target)) {
        let rect = null;

        target.tiles.forEach((tile) => {
          const tileRect = this.getRasterTargetDocumentRect(tile);

          rect = rect ? this.unionRasterHistoryRects(rect, tileRect) : tileRect;
        });

        return rect || {
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(this.width || 1)),
          height: Math.max(1, Math.round(this.height || 1)),
        };
      }

      return {
        x: Number.isFinite(target.x) ? Math.round(target.x) : 0,
        y: Number.isFinite(target.y) ? Math.round(target.y) : 0,
        width: Math.max(1, Math.round(target.width || this.width || 1)),
        height: Math.max(1, Math.round(target.height || this.height || 1)),
      };
    }

    translateRasterTargetRect(target, dx = 0, dy = 0) {
      if (!target || this.isSparseRasterTarget(target)) {
        return false;
      }

      const currentRect = this.getRasterTargetDocumentRect(target);

      if (!currentRect) {
        return false;
      }

      target.x = currentRect.x + dx;
      target.y = currentRect.y + dy;
      target.cropped = true;
      this.markRasterTargetDirty(target);

      return true;
    }

    copyRasterTargetDocumentRectToDocumentRect(sourceTarget, sourceDocRect, destinationTarget, destinationDocRect) {
      const mapLocalRect = (target, docRect) => {
        const targetRect = this.getRasterTargetDocumentRect(target);
        const clippedDocRect = this.intersectRasterHistoryRects(docRect, targetRect);

        return clippedDocRect && targetRect
          ? {
              height: clippedDocRect.height,
              width: clippedDocRect.width,
              x: clippedDocRect.x - targetRect.x,
              y: clippedDocRect.y - targetRect.y,
            }
          : null;
      };
      const sourceRect = mapLocalRect(sourceTarget, sourceDocRect);
      const destinationRect = mapLocalRect(destinationTarget, destinationDocRect);

      if (
        !sourceTarget?.framebuffer ||
        !destinationTarget?.framebuffer ||
        !sourceRect ||
        !destinationRect ||
        sourceRect.width !== destinationRect.width ||
        sourceRect.height !== destinationRect.height
      ) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;
      const destinationX0 = destinationRect.x;
      const destinationX1 = destinationRect.x + destinationRect.width;
      const destinationY0 = destinationTarget.height - (destinationRect.y + destinationRect.height);
      const destinationY1 = destinationTarget.height - destinationRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        destinationX0,
        destinationY0,
        destinationX1,
        destinationY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }

    translateSparseRasterTarget(layerId, sparseTarget, dx = 0, dy = 0, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return false;
      }

      if (sparseTarget.tiles.size === 0) {
        sparseTarget.version = (sparseTarget.version || 0) + 1;
        return true;
      }

      const tileSize = this.getRasterHistoryTileSize({ tileSize: sparseTarget.tileSize });
      const nextSparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: sparseTarget.clearColor,
        tileSize,
      });
      const source = options.source || "translate-sparse-raster-target";
      let copiedCount = 0;

      for (const sourceTile of sparseTarget.tiles.values()) {
        if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
          kind: "paintTile",
          label: `${layerId} tile ${sourceTile.tx},${sourceTile.ty}`,
          layerId,
          ownerId: `${layerId}:${sourceTile.tx}:${sourceTile.ty}`,
          ownerType: "live",
          reason: source,
        })) {
          this.deleteRasterTargetObject(nextSparseTarget);
          return false;
        }

        const sourceTileRect = this.getRasterTargetDocumentRect(sourceTile);
        const shiftedTileRect = this.offsetDocumentRect(sourceTileRect, dx, dy);

        if (!sourceTileRect || !shiftedTileRect) {
          continue;
        }

      for (const tile of this.getSparseRasterTileRects(shiftedTileRect, {
        clampToDocument: false,
        tileSize,
      })) {
          const destinationPatchRect = this.intersectRasterHistoryRects(shiftedTileRect, tile.tileRect || tile.rect);
          const sourcePatchRect = destinationPatchRect
            ? {
                height: destinationPatchRect.height,
                width: destinationPatchRect.width,
                x: destinationPatchRect.x - dx,
                y: destinationPatchRect.y - dy,
              }
            : null;

          if (!destinationPatchRect || !sourcePatchRect) {
            continue;
          }

          const destinationTile = this.ensureSparseRasterTileTarget(layerId, nextSparseTarget, tile, { source });

          if (
            !destinationTile ||
            !this.copyRasterTargetDocumentRectToDocumentRect(
              sourceTile,
              sourcePatchRect,
              destinationTile,
              destinationPatchRect,
            )
          ) {
            this.deleteRasterTargetObject(nextSparseTarget);
            return false;
          }

          copiedCount += 1;
        }
      }

      if (copiedCount === 0 && sparseTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(nextSparseTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);

      nextSparseTarget.layerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, nextSparseTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.paintLayerId = layerId;
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== nextSparseTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      nextSparseTarget.version = (nextSparseTarget.version || 0) + 1;

      return true;
    }

    translateRasterTargetPlacement(layerId, dx = 0, dy = 0, options = {}) {
      const normalizedLayerId = String(layerId || "").trim();
      const deltaX = Number(dx);
      const deltaY = Number(dy);
      const safeDx = Number.isFinite(deltaX) ? Math.round(deltaX) : 0;
      const safeDy = Number.isFinite(deltaY) ? Math.round(deltaY) : 0;

      if (!normalizedLayerId || (safeDx === 0 && safeDy === 0)) {
        return false;
      }

      const source = options.source || "translate-raster-target";
      const target = this.ensureWritableRasterTarget(normalizedLayerId, {
        source,
      }) || this.rasterTargetsByLayerId.get(normalizedLayerId);

      if (!target) {
        return false;
      }

      const didTranslate = this.isSparseRasterTarget(target)
        ? this.translateSparseRasterTarget(normalizedLayerId, target, safeDx, safeDy, { source })
        : this.translateRasterTargetRect(target, safeDx, safeDy);

      if (!didTranslate) {
        return false;
      }

      if (!this.isSparseRasterTarget(this.rasterTargetsByLayerId.get(normalizedLayerId))) {
        this.updateRasterTargetResourceMetadata(target, {
          kind: normalizedLayerId === "background" ? "background" : this.isPaintRasterLayer(normalizedLayerId, target) ? "paintTarget" : "layer",
          label: normalizedLayerId,
          layerId: normalizedLayerId,
          ownerId: normalizedLayerId,
          ownerType: "live",
          purgeable: false,
          reason: source,
        });
      }

      this.deletePuppetMeshResource(normalizedLayerId);
      return true;
    }

    translateRasterTargetsByLayerIds(layerIds = [], dx = 0, dy = 0, options = {}) {
      const ids = Array.from(new Set((Array.isArray(layerIds) ? layerIds : [])
        .map((layerId) => String(layerId || "").trim())
        .filter(Boolean)));
      let didTranslate = false;

      ids.forEach((layerId) => {
        didTranslate = this.translateRasterTargetPlacement(layerId, dx, dy, options) || didTranslate;
      });

      return didTranslate;
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
        ? this.getUnclampedDocumentRect(docRect)
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

    markRasterTargetDirty(targetOrPaintTarget) {
      const target = targetOrPaintTarget?.target || targetOrPaintTarget;

      if (target) {
        target.version = (target.version || 0) + 1;
        target.freshEmptyPaintTile = false;
      }

      if (targetOrPaintTarget && targetOrPaintTarget !== target) {
        targetOrPaintTarget.version = (targetOrPaintTarget.version || 0) + 1;
      }
    }

    clearTarget(target) {
      if (this.isSparseRasterTarget(target)) {
        target.tiles.forEach((tile) => this.deleteRasterTargetObject(tile));
        target.tiles.clear();
        target.cpuBytes = 0;
        target.cpuPixels = null;
        target.cpuPixelsEncoding = null;
        target.cpuRawBytes = 0;
        target.state = "";
        this.markRasterTargetDirty(target);
        return;
      }

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

      const target = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "clear-layer-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if (
        options.releaseRaster === true &&
        layerId !== "background" &&
        this.isPaintRasterLayer(layerId, target)
      ) {
        const targetRect = this.getRasterTargetDocumentRect(target);
        const sparseTarget = this.createSparseRasterTarget(layerId, {
          clearColor: target.clearColor,
          tileSize: target.sparseTileSize || target.tileSize,
        });
        const previousTarget = this.rasterTargetsByLayerId.get(layerId);

        this.rasterTargetsByLayerId.set(layerId, sparseTarget);

        if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
          this.paintLayerId = layerId;
          this.texture = null;
          this.framebuffer = null;
        }

        if (previousTarget && previousTarget !== sparseTarget) {
          this.deleteRasterTargetObject(previousTarget);
        }

        this.deletePuppetMeshResource(layerId);
        this.commitVisualDirtyChange({
          emit: options.emit,
          layerId,
          rect: targetRect,
          source: options.source || "clear-layer-release-raster",
          usePreviewDirtyTiles: true,
        });
      } else {
        const targetRect = this.getRasterTargetDocumentRect(target);

        this.clearTarget(target);
        if (options.emit !== false) {
          this.commitVisualDirtyChange({
            layerId,
            rect: targetRect,
            source: options.source || "clear-layer",
            usePreviewDirtyTiles: true,
          });
        }
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

    createRasterSnapshotFromSparseTarget(sparseTarget, rect = null, label = "raster snapshot") {
      const docRect = this.getUnclampedDocumentRect(rect || this.getRasterTargetDocumentRect(sparseTarget));

      if (!this.isSparseRasterTarget(sparseTarget) || !docRect) {
        return null;
      }

      const tempTarget = this.createRasterTargetForUnclampedRect(docRect, [0, 0, 0, 0], 0, {
        layerId: sparseTarget.layerId || "",
        source: `${label}-sparse-temp`,
      });

      if (!tempTarget) {
        return null;
      }

      for (const tile of sparseTarget.tiles.values()) {
        const tileRect = this.getRasterTargetDocumentRect(tile);
        const patchRect = this.intersectRasterHistoryRects(tileRect, docRect);

        if (!patchRect) {
          continue;
        }

        if ((!tile.texture || !tile.framebuffer) && !this.hydrateRasterTarget(tile, {
          layerId: sparseTarget.layerId,
          ownerType: "live",
          reason: `${label}-sparse-hydrate`,
        })) {
          continue;
        }

        this.copyRasterTargetRectIntoTarget(tile, patchRect, tempTarget);
      }

      const snapshot = this.createRasterSnapshot(tempTarget, docRect, label);

      this.deleteRasterTargetObject(tempTarget);

      return snapshot;
    }

    createRasterSnapshot(targetOrLayerId, rect = null, label = "raster snapshot") {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId) || this.getRasterTarget(targetOrLayerId)
        : targetOrLayerId;

      if (this.isSparseRasterTarget(target)) {
        return this.createRasterSnapshotFromSparseTarget(target, rect, label);
      }

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
          console.warn?.("[CBO renderer] Compressione RLE history fallita, salvo raw.", error);
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

    hydrateRasterSnapshot(snapshot, options = {}) {
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
            snapshot.cpuPixelsEncoding,
          );
        } catch (error) {
          console.warn?.("[CBO renderer] Decompressione RLE history fallita.", error);
          return false;
        }
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
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);

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

      if (options.retainCpuPixels !== true) {
        snapshot.cpuBytes = 0;
        snapshot.cpuPixels = null;
        snapshot.cpuPixelsEncoding = null;
        snapshot.cpuRawBytes = 0;
      } else {
        snapshot.cpuBytes = snapshot.cpuPixels.byteLength;
        snapshot.cpuRawBytes = Number(snapshot.cpuRawBytes) || width * height * 4;
      }

      return true;
    }

    releaseRetainedRasterSnapshotGpu(snapshot) {
      if (!snapshot || !(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const gl = this.gl;
      let didRelease = false;

      if (snapshot.framebuffer) {
        this.deleteRasterFramebuffer(snapshot.framebuffer);
        gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
        didRelease = true;
      }

      if (snapshot.texture) {
        this.deleteRasterTexture(snapshot.texture);
        gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
        didRelease = true;
      }

      const { height, width } = this.getRasterSnapshotDimensions(snapshot);

      snapshot.cpuBytes = snapshot.cpuPixels.byteLength;
      snapshot.cpuRawBytes = Number(snapshot.cpuRawBytes) || width * height * 4;
      snapshot.state = "CPU_COLD";

      return didRelease;
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

    isTransparentPixelBuffer(pixels) {
      if (!(pixels instanceof Uint8Array)) {
        return false;
      }

      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) {
          return false;
        }
      }

      return true;
    }

    getRasterTargetCpuPixels(target) {
      if (!(target?.cpuPixels instanceof Uint8Array)) {
        return null;
      }

      const compression = window.CBO?.HistoryCompression;

      if (!target.cpuPixelsEncoding) {
        return target.cpuPixels;
      }

      if (!compression?.isCompressedEncoding?.(target.cpuPixelsEncoding)) {
        return null;
      }

      try {
        return compression.decompressRgba(
          target.cpuPixels,
          Number(target.cpuRawBytes) || Math.max(1, Math.round(target.width || 1)) * Math.max(1, Math.round(target.height || 1)) * RASTER_BYTES_PER_PIXEL,
          target.cpuPixelsEncoding,
        );
      } catch (error) {
        console.warn?.("[CBO renderer] Decompressione RLE target raster fallita.", error);
        return null;
      }
    }

    isRasterTargetFullyTransparent(target) {
      if (!target) {
        return true;
      }

      if (target.cpuPixels instanceof Uint8Array) {
        const pixels = this.getRasterTargetCpuPixels(target);

        return pixels ? this.isTransparentPixelBuffer(pixels) : false;
      }

      if (!target.framebuffer || !target.texture) {
        return false;
      }

      const width = Math.max(1, Math.round(target.width || 1));
      const height = Math.max(1, Math.round(target.height || 1));
      const pixels = new Uint8Array(width * height * RASTER_BYTES_PER_PIXEL);
      const gl = this.gl;
      const framebufferTarget = gl.READ_FRAMEBUFFER || gl.FRAMEBUFFER;

      try {
        gl.bindFramebuffer(framebufferTarget, target.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(framebufferTarget, null);
      } catch (error) {
        gl.bindFramebuffer?.(framebufferTarget, null);
        console.warn?.("[CBO renderer] Impossibile verificare tile raster vuoto.", error);
        return false;
      }

      return this.isTransparentPixelBuffer(pixels);
    }

    pruneTransparentSparseRasterTiles(layerId, sparseTarget, tileKeys = []) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return 0;
      }

      let prunedCount = 0;
      const keys = new Set(tileKeys.filter(Boolean));

      keys.forEach((key) => {
        const tileTarget = sparseTarget.tiles.get(key);

        if (!tileTarget || !this.isRasterTargetFullyTransparent(tileTarget)) {
          return;
        }

        this.deleteRasterTargetObject(tileTarget);
        sparseTarget.tiles.delete(key);
        prunedCount += 1;
      });

      if (prunedCount > 0) {
        sparseTarget.version = (sparseTarget.version || 0) + 1;
      }

      return prunedCount;
    }

    restoreRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !snapshot?.rect) {
        return false;
      }

      if (snapshot.empty === true) {
        return this.restoreEmptyRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options);
      }

      const needsHydrate = !snapshot.texture || !snapshot.framebuffer;
      const releaseSnapshotGpuAfterRestore = Boolean(
        options.releaseSnapshotGpuAfterRestore === true &&
        needsHydrate &&
        snapshot.cpuPixels instanceof Uint8Array
      );
      const finish = (result) => {
        if (releaseSnapshotGpuAfterRestore) {
          this.releaseRetainedRasterSnapshotGpu(snapshot);
        }

        return result;
      };

      if (needsHydrate && !this.hydrateRasterSnapshot(snapshot, {
        retainCpuPixels: releaseSnapshotGpuAfterRestore,
      })) {
        return false;
      }

      const sourceTarget = {
        framebuffer: snapshot.framebuffer,
        height: snapshot.rect.height,
        width: snapshot.rect.width,
        x: snapshot.rect.x,
        y: snapshot.rect.y,
      };
      let didRestore = false;
      const restoredTileKeys = [];

      for (const tile of this.getSparseRasterTileRects(snapshot.rect, {
        clampToDocument: false,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, {
          source: options.source || "raster-snapshot-sparse-restore",
        });
        const patchRect = this.intersectRasterHistoryRects(tile.tileRect || tile.rect, snapshot.rect);

        if (!tileTarget || !patchRect) {
          continue;
        }

        const didCopy = this.copyRasterTargetRectIntoTarget(sourceTarget, patchRect, tileTarget);

        if (didCopy) {
          didRestore = true;
          restoredTileKeys.push(tileTarget.tileKey || this.getSparseTileKey(tile.tx, tile.ty));
        }
      }

      if (!didRestore) {
        return finish(false);
      }

      const prunedCount = options.pruneTransparentTiles === false
        ? 0
        : this.pruneTransparentSparseRasterTiles(layerId, sparseTarget, restoredTileKeys);
      sparseTarget.version = (sparseTarget.version || 0) + 1;

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: snapshot.rect ? { ...snapshot.rect } : null,
          source: options.source || "raster-snapshot-sparse-restore",
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return finish(true);
    }

    restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options = {}) {
      const existingTarget = this.rasterTargetsByLayerId.get(layerId);

      if (
        !layerId ||
        !snapshot ||
        options.sparse === false ||
        !this.isPaintRasterLayer(layerId, existingTarget)
      ) {
        return false;
      }

      const sparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: existingTarget?.clearColor,
        tileSize: options.tileSize || existingTarget?.sparseTileSize || existingTarget?.tileSize,
      });
      const source = options.source || "raster-snapshot-sparse-restore";
      const didRestoreSparse = this.restoreRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, {
        ...options,
        emit: false,
        source,
      });

      if (!didRestoreSparse) {
        this.deleteRasterTargetObject(sparseTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(layerId);
      const previousTargetRect = this.getRasterTargetDocumentRect(previousTarget);
      const restoreDirtyRect = this.unionRasterHistoryRects(previousTargetRect, snapshot.rect);

      this.rasterTargetsByLayerId.set(layerId, sparseTarget);

      if (layerId === this.paintLayerId || previousTarget?.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== sparseTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(layerId);
      this.commitVisualDirtyChange({
        emit: options.emit,
        layerId,
        rect: restoreDirtyRect || snapshot.rect,
        source,
        usePreviewDirtyTiles: true,
      });

      this.requestDraw();
      return true;
    }

    restoreEmptyRasterSnapshotToSparseTarget(layerId, sparseTarget, snapshot, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget) || !snapshot?.rect) {
        return false;
      }

      const gl = this.gl;
      const touchedTileKeys = [];
      let didTouchExistingTile = false;

      for (const tile of this.getSparseRasterTileRects(snapshot.rect, {
        clampToDocument: false,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileKey = this.getSparseTileKey(tile.tx, tile.ty);
        const tileTarget = sparseTarget.tiles.get(tileKey);
        const patchRect = this.intersectRasterHistoryRects(tile.tileRect || tile.rect, snapshot.rect);

        if (!tileTarget || !patchRect) {
          continue;
        }

        didTouchExistingTile = true;

        if (this.containsRasterHistoryRect(patchRect, tile.tileRect || tile.rect)) {
          this.deleteRasterTargetObject(tileTarget);
          sparseTarget.tiles.delete(tileKey);
          touchedTileKeys.push(tileKey);
          continue;
        }

        const mappedRect = this.getRasterTargetLocalRect(tileTarget, patchRect);
        const clearRect = mappedRect?.localRect;

        if (!tileTarget.framebuffer || !clearRect) {
          continue;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, tileTarget.framebuffer);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(clearRect.x, tileTarget.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.markRasterTargetDirty(tileTarget);
        touchedTileKeys.push(tileKey);
      }

      if (didTouchExistingTile) {
        this.pruneTransparentSparseRasterTiles(layerId, sparseTarget, touchedTileKeys);
        sparseTarget.version = (sparseTarget.version || 0) + 1;
      }

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: snapshot.rect ? { ...snapshot.rect } : null,
          source: options.source || "empty-raster-snapshot-sparse-restore",
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return true;
    }

    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      if (!layerId || !snapshot) {
        return false;
      }

      if (snapshot.empty === true) {
        const existingTarget = this.rasterTargetsByLayerId.get(layerId);

        if (this.isSparseRasterTarget(existingTarget)) {
          return this.restoreEmptyRasterSnapshotToSparseTarget(layerId, existingTarget, snapshot, options);
        }

        const didClear = this.clearRasterRect(layerId, snapshot.rect);

        if (options.emit !== false) {
          this.commitVisualDirtyChange({
            layerId,
            rect: snapshot.rect ? { ...snapshot.rect } : null,
            source: options.source || "empty-raster-snapshot-restore",
            usePreviewDirtyTiles: true,
          });
        }

        this.requestDraw();
        return didClear || !existingTarget;
      }

      const needsHydrate = !snapshot.texture || !snapshot.framebuffer;
      const releaseSnapshotGpuAfterRestore = Boolean(
        options.releaseSnapshotGpuAfterRestore === true &&
        needsHydrate &&
        snapshot.cpuPixels instanceof Uint8Array
      );
      const finish = (result) => {
        if (releaseSnapshotGpuAfterRestore) {
          this.releaseRetainedRasterSnapshotGpu(snapshot);
        }

        return result;
      };

      if (needsHydrate && !this.hydrateRasterSnapshot(snapshot, {
        retainCpuPixels: releaseSnapshotGpuAfterRestore,
      })) {
        return false;
      }

      let existingTarget = this.rasterTargetsByLayerId.get(layerId);
      const shouldRestoreAsSparseTarget = Boolean(
        options.sparse !== false &&
        (options.preferSparse === true || options.replaceSparse === true) &&
        this.isPaintRasterLayer(layerId, existingTarget)
      );

      if (this.needsCopyOnWriteDetach(existingTarget) && !shouldRestoreAsSparseTarget) {
        existingTarget = this.ensureWritableRasterTarget(layerId, {
          source: options.source || "raster-snapshot-copy-on-write-detach",
        }) || existingTarget;
      }

      if (this.isSparseRasterTarget(existingTarget)) {
        if (options.replaceSparse === true && shouldRestoreAsSparseTarget) {
          return finish(this.restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options));
        }

        return finish(this.restoreRasterSnapshotToSparseTarget(layerId, existingTarget, snapshot, options));
      }

      if (shouldRestoreAsSparseTarget && this.restoreRasterSnapshotAsSparseTarget(layerId, snapshot, options)) {
        return finish(true);
      }

      let target = this.getRasterTarget(layerId);
      const snapshotTargetRect = snapshot.targetRect;
      const targetRect = this.getRasterTargetDocumentRect(target);
      const restoreDirtyRect = this.unionRasterHistoryRects(targetRect, snapshot.rect);

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
        return finish(false);
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
        this.commitVisualDirtyChange({
          layerId,
          rect: restoreDirtyRect || (snapshot.rect ? { ...snapshot.rect } : null),
          source: options.source || "raster-snapshot-restore",
          usePreviewDirtyTiles: true,
        });
      }

      return finish(true);
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
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;
      snapshot.state = "DELETED";
    }

    deleteRasterTargetObject(target) {
      if (!target) {
        return;
      }

      if (this.isCopyOnWriteRasterTarget(target)) {
        this.releaseCopyOnWriteReference(target);
        return;
      }

      if (this.hasCopyOnWriteDependents(target)) {
        target.copyOnWriteDeleted = true;
        target.layerId = "";
        return;
      }

      if (this.isSparseRasterTarget(target)) {
        target.tiles.forEach((tile) => this.deleteRasterTargetObject(tile));
        target.tiles.clear();
        target.cpuBytes = 0;
        target.cpuPixels = null;
        target.cpuPixelsEncoding = null;
        target.cpuRawBytes = 0;
        target.state = "DELETED";
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
      target.cpuBytes = 0;
      target.cpuPixels = null;
      target.cpuPixelsEncoding = null;
      target.cpuRawBytes = 0;
      target.state = "DELETED";
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
      if (options.invalidate !== false || options.emit !== false) {
        this.commitVisualDirtyChange({
          dirtyMergeWasteRatio: options.dirtyMergeWasteRatio,
          emit: options.emit,
          invalidate: options.invalidate,
          layerId,
          maxDirtyRects: options.maxDirtyRects,
          mergeAdjacentDirtyRects: options.mergeAdjacentDirtyRects,
          preserveDirtyRects: options.preserveDirtyRects,
          rect: options.rect || null,
          rects: options.rects || null,
          source: options.source || "replace-raster-target",
          tileDirty: options.tileDirty,
          usePreviewDirtyTiles: options.usePreviewDirtyTiles,
        });
      }

      return true;
    }

    materializeSparseRasterTarget(layerId, sparseTarget, options = {}) {
      if (!layerId || !this.isSparseRasterTarget(sparseTarget)) {
        return null;
      }

      const targetRect = this.getRasterTargetDocumentRect(sparseTarget);

      if (!targetRect) {
        return null;
      }

      const fullTarget = this.createRasterTargetForUnclampedRect(targetRect, sparseTarget.clearColor, 0, {
        layerId,
        source: options.source || "materialize-sparse-raster-target",
      });

      if (!fullTarget) {
        return null;
      }

      fullTarget.materializedFromSparse = true;
      fullTarget.sparseTileSize = sparseTarget.tileSize;

      let didCopyAnyTile = false;

      for (const tile of sparseTarget.tiles.values()) {
        if ((!tile.texture || !tile.framebuffer) && !this.hydrateRasterTarget(tile, {
          kind: "paintTile",
          label: `${layerId} tile ${tile.tx},${tile.ty}`,
          layerId,
          ownerId: `${layerId}:${tile.tx}:${tile.ty}`,
          ownerType: "live",
          reason: options.source || "materialize-sparse-raster-target",
        })) {
          continue;
        }

        const tileRect = this.getRasterTargetDocumentRect(tile);

        if (tileRect && this.copyRasterTargetRectIntoTarget(tile, tileRect, fullTarget)) {
          didCopyAnyTile = true;
        }
      }

      if (!didCopyAnyTile && sparseTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(fullTarget);
        return null;
      }

      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      if (!this.replaceRasterTarget(layerId, fullTarget, {
        emit: options.emit,
        invalidate: shouldInvalidate,
        source: options.source || "materialize-sparse-raster-target",
      })) {
        this.deleteRasterTargetObject(fullTarget);
        return null;
      }

      return {
        ...fullTarget,
        layerId,
      };
    }

    shouldRetileRasterTargetForPaint(layerId, target, options = {}) {
      return Boolean(
        options.sparse !== false &&
        options.retileExistingTarget !== false &&
        target?.framebuffer &&
        target?.texture &&
        !this.isSparseRasterTarget(target) &&
        this.isPaintRasterLayer(layerId, target) &&
        (
          target.materializedFromSparse === true ||
          options.retileMaterializedTarget === true
        )
      );
    }

    sparsifyRasterTarget(layerId, target = null, options = {}) {
      const sourceTarget = target || this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !sourceTarget) {
        return null;
      }

      if (this.isSparseRasterTarget(sourceTarget)) {
        return sourceTarget;
      }

      if (!sourceTarget.framebuffer || !sourceTarget.texture) {
        return null;
      }

      const currentTarget = this.rasterTargetsByLayerId.get(layerId);

      if (currentTarget && currentTarget !== sourceTarget) {
        return null;
      }

      const sourceRect = options.clampToDocument === false
        ? this.getUnclampedDocumentRect(options.rect || this.getRasterTargetDocumentRect(sourceTarget))
        : this.getClampedDocumentRect(options.rect || this.getRasterTargetDocumentRect(sourceTarget));

      if (!sourceRect) {
        return null;
      }

      const source = options.source || "sparsify-raster-target";
      const sparseTarget = this.createSparseRasterTarget(layerId, {
        clearColor: sourceTarget.clearColor,
        tileSize: options.tileSize || sourceTarget.sparseTileSize || sourceTarget.tileSize,
      });
      let didCopyAnyTile = false;

      for (const tile of this.getSparseRasterTileRects(sourceRect, {
        clampToDocument: options.clampToDocument,
        tileSize: sparseTarget.tileSize,
      })) {
        const tileTarget = this.ensureSparseRasterTileTarget(layerId, sparseTarget, tile, {
          ownerType: options.ownerType || "live",
          source,
        });
        const patchRect = tile.rect || tile.patchRect;

        if (!tileTarget || !patchRect) {
          this.deleteRasterTargetObject(sparseTarget);
          return null;
        }

        if (!this.copyRasterTargetRectIntoTarget(sourceTarget, patchRect, tileTarget)) {
          this.deleteRasterTargetObject(sparseTarget);
          return null;
        }

        didCopyAnyTile = true;

        if (
          options.pruneTransparentTiles !== false &&
          this.isRasterTargetFullyTransparent(tileTarget)
        ) {
          this.deleteRasterTargetObject(tileTarget);
          sparseTarget.tiles.delete(tileTarget.tileKey || this.getSparseTileKey(tile.tx, tile.ty));
        }
      }

      if (!didCopyAnyTile) {
        this.deleteRasterTargetObject(sparseTarget);
        return null;
      }

      sparseTarget.layerId = layerId;
      sparseTarget.version = (sparseTarget.version || 0) + 1;
      this.rasterTargetsByLayerId.set(layerId, sparseTarget);

      if (layerId === this.paintLayerId || sourceTarget.texture === this.texture) {
        this.texture = null;
        this.framebuffer = null;
      }

      this.deleteRasterTargetObject(sourceTarget);
      this.deletePuppetMeshResource(layerId);
      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      if (shouldInvalidate || options.emit !== false) {
        this.commitVisualDirtyChange({
          emit: options.emit,
          invalidate: shouldInvalidate,
          layerId,
          rect: sourceRect,
          source,
          usePreviewDirtyTiles: true,
        });
      }

      this.requestDraw();
      return sparseTarget;
    }

    sparsifyRasterizedImageLayer(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target || this.isSparseRasterTarget(target)) {
        return target || null;
      }

      if (!target.framebuffer || !target.texture || !this.isPaintRasterLayer(layerId, target)) {
        return target;
      }

      return this.sparsifyRasterTarget(layerId, target, {
        clampToDocument: false,
        emit: options.emit === true,
        pruneTransparentTiles: options.pruneTransparentTiles,
        source: options.source || "image-rasterize-retile",
        tileSize: options.tileSize || target.sparseTileSize || target.tileSize,
      }) || target;
    }

    materializeRasterTarget(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target?.texture || !target?.framebuffer) {
        if (this.isSparseRasterTarget(target)) {
          return this.materializeSparseRasterTarget(layerId, target, options) || {
            ...target,
            layerId,
          };
        }

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

      if (target.materializedFromSparse === true) {
        fullTarget.materializedFromSparse = true;
        fullTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

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
      const shouldInvalidate = options.invalidate !== undefined
        ? options.invalidate
        : options.emit !== false;

      this.replaceRasterTarget(layerId, fullTarget, {
        emit: options.emit,
        invalidate: shouldInvalidate,
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

    setVectorTextTransformPreviewLayer(layerId = "") {
      const nextLayerId = String(layerId || "");

      if (this.vectorTextTransformPreviewLayerId === nextLayerId) {
        return;
      }

      this.vectorTextTransformPreviewLayerId = nextLayerId;
      this.invalidatePreviewCache("vector-text-transform-preview");
      this.requestDraw();
    }

    clearVectorTextTransformPreviewLayer(layerId = "") {
      const currentLayerId = this.vectorTextTransformPreviewLayerId || "";

      if (!currentLayerId || (layerId && currentLayerId !== layerId)) {
        return;
      }

      this.vectorTextTransformPreviewLayerId = "";
      this.invalidatePreviewCache("vector-text-transform-preview");
      this.requestDraw();
    }

    isVectorTextTransformPreviewLayer(layerId = "") {
      return Boolean(layerId && this.vectorTextTransformPreviewLayerId === layerId);
    }

    getRasterTargetPixelContentBounds(target, options = {}) {
      if (!target) {
        return null;
      }

      const bounds = namespace.documentBounds;
      const targetWidth = Math.max(1, Math.round(target.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(target.height || this.height || 1));
      const hasGpuPixels = Boolean(target.framebuffer && target.texture);
      const hasCpuPixels = target.cpuPixels instanceof Uint8Array;
      const cpuPixels = hasCpuPixels ? this.getRasterTargetCpuPixels(target) : null;
      const sampleCols = Math.max(16, Math.min(512, Math.floor(options.sampleCols || 256)));
      const sampleRows = Math.max(16, Math.min(512, Math.floor(options.sampleRows || 256)));
      const alphaThreshold = Number.isFinite(options.alphaThreshold)
        ? Math.max(0, Math.min(255, options.alphaThreshold))
        : 2;
      const pixelPerfect = options.pixelPerfect === true;
      let coarseRect = null;

      if (!hasGpuPixels && !cpuPixels) {
        return null;
      }

      if (pixelPerfect || cpuPixels) {
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
      const clampToDocument = options.clampToDocument !== false;
      const mapLocalContentRectToDocument = (localRect) => {
        if (!localRect || !targetRect) {
          return null;
        }

        const documentContentRect = {
          height: localRect.height,
          width: localRect.width,
          x: targetRect.x + localRect.x,
          y: targetRect.y + localRect.y,
        };

        return clampToDocument
          ? bounds?.getClampedRasterBox?.(documentContentRect, this.width, this.height) || null
          : this.getUnclampedDocumentRect(documentContentRect);
      };

      if (options.coarseOnly === true) {
        return mapLocalContentRectToDocument(coarseRect);
      }

      const gl = this.gl;
      const pixels = new Uint8Array(coarseRect.width * coarseRect.height * 4);

      if (cpuPixels) {
        const readY = targetHeight - (coarseRect.y + coarseRect.height);

        for (let row = 0; row < coarseRect.height; row += 1) {
          const sourceStart = ((readY + row) * targetWidth + coarseRect.x) * 4;
          const destStart = row * coarseRect.width * 4;
          pixels.set(
            cpuPixels.subarray(sourceStart, sourceStart + coarseRect.width * 4),
            destStart,
          );
        }
      } else {
        const readY = targetHeight - (coarseRect.y + coarseRect.height);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
        gl.readPixels(coarseRect.x, readY, coarseRect.width, coarseRect.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      }

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

      return mapLocalContentRectToDocument(localBounds);
    }

    getRasterContentBounds(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (this.isSparseRasterTarget(target)) {
        if (options.coarseOnly === true) {
          return this.getRasterTargetDocumentRect(target);
        }

        let sparseBounds = null;

        target.tiles.forEach((tileTarget) => {
          const tileBounds = this.getRasterTargetPixelContentBounds(tileTarget, options);

          sparseBounds = sparseBounds ? this.unionRasterHistoryRects(sparseBounds, tileBounds) : tileBounds;
        });

        return sparseBounds;
      }

      if (!layerId) {
        return null;
      }

      return this.getRasterTargetPixelContentBounds(target, options);
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
        if (
          this.needsCopyOnWriteDetach(target) ||
          !target?.framebuffer ||
          !target?.texture ||
          !this.isPaintRasterLayer(layerId, target)
        ) {
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

    copyRasterTargetRectIntoTarget(sourceTarget, docRect, destinationTarget) {
      const sourceMappedRect = this.getRasterTargetLocalRect(sourceTarget, docRect);
      const destinationMappedRect = this.getRasterTargetLocalRect(destinationTarget, sourceMappedRect?.docRect);
      const sourceRect = sourceMappedRect?.localRect;
      const destinationRect = destinationMappedRect?.localRect;

      if (!sourceTarget?.framebuffer || !destinationTarget?.framebuffer || !sourceRect || !destinationRect) {
        return false;
      }

      const gl = this.gl;
      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = sourceTarget.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = sourceTarget.height - sourceRect.y;
      const destinationX0 = destinationRect.x;
      const destinationX1 = destinationRect.x + destinationRect.width;
      const destinationY0 = destinationTarget.height - (destinationRect.y + destinationRect.height);
      const destinationY1 = destinationTarget.height - destinationRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceTarget.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destinationTarget.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        destinationX0,
        destinationY0,
        destinationX1,
        destinationY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.markRasterTargetDirty(destinationTarget);

      return true;
    }

    createRasterTargetForDocumentRect(layerId, targetRect, options = {}) {
      const rect = this.getClampedDocumentRect(targetRect);

      if (!rect) {
        return null;
      }

      const clearColor = Array.isArray(options.clearColor)
        ? options.clearColor
        : [0, 0, 0, 0];

      return this.createRasterTarget(clearColor, {
        cropped: this.isCroppedRect(rect),
        height: rect.height,
        layerId,
        reason: options.source || "create-raster-target-for-rect",
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
    }

    shouldSparsifyRasterTargetForPaintRect(layerId, target, requiredRect, options = {}) {
      const targetRect = this.getRasterTargetDocumentRect(target);

      return Boolean(
        options.sparse !== false &&
        requiredRect &&
        targetRect &&
        target?.framebuffer &&
        target?.texture &&
        !this.isSparseRasterTarget(target) &&
        this.isPaintRasterLayer(layerId, target) &&
        !this.containsRasterHistoryRect(targetRect, requiredRect)
      );
    }

    ensureRasterTargetsForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return [];
      }

      let existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);

      if (
        this.shouldRetileRasterTargetForPaint(layerId, existingTarget, options) ||
        this.shouldSparsifyRasterTargetForPaintRect(layerId, existingTarget, requiredRect, options)
      ) {
        existingTarget = this.sparsifyRasterTarget(layerId, existingTarget, {
          emit: false,
          source: options.source || "paint-retile-existing-target",
        }) || existingTarget;
      }

      const useSparse = options.sparse !== false &&
        (!existingTarget || this.isSparseRasterTarget(existingTarget));

      if (useSparse) {
        const sparseResult = this.ensureSparseRasterTargetForPaintRect(layerId, rect, options);

        if (sparseResult?.targets?.length) {
          return sparseResult.targets;
        }
      }

      const target = this.ensureRasterTargetForPaintRect(layerId, rect, options);

      return target ? [{ target }] : [];
    }

    prewarmRasterTargetsForPaintRect(layerId, rect, options = {}) {
      const existingTarget = this.rasterTargetsByLayerId.get(layerId);

      if (existingTarget && !this.isSparseRasterTarget(existingTarget)) {
        return [];
      }

      const sparseResult = this.ensureSparseRasterTargetForPaintRect(layerId, rect, {
        ...options,
        maxNewTiles: Number.isFinite(Number(options.maxNewTiles))
          ? Math.max(0, Math.round(Number(options.maxNewTiles)))
          : 2,
        source: options.source || "paint-target-prewarm",
      });

      return Array.isArray(sparseResult?.targets) ? sparseResult.targets : [];
    }

    getRasterTargetsForPaintRect(layerId, rect, options = {}) {
      let existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect || !existingTarget) {
        return [];
      }

      if (
        this.shouldRetileRasterTargetForPaint(layerId, existingTarget, options) ||
        this.shouldSparsifyRasterTargetForPaintRect(layerId, existingTarget, requiredRect, options)
      ) {
        existingTarget = this.sparsifyRasterTarget(layerId, existingTarget, {
          emit: false,
          source: options.source || "paint-retile-existing-target",
        }) || existingTarget;
      }

      if (this.isSparseRasterTarget(existingTarget)) {
        return this.getSparseRasterTileRects(requiredRect, {
          patchRects: options.patchRects,
          tileSize: existingTarget.tileSize,
          tilePatchRects: options.tilePatchRects,
        })
          .map((tile) => {
            const tileTarget = this.getSparseRasterTile(existingTarget, tile.tx, tile.ty);

            return tileTarget?.framebuffer && tileTarget?.texture
              ? {
                  patchRect: tile.patchRect ? { ...tile.patchRect } : { ...tile.rect },
                  rect: tile.rect ? { ...tile.rect } : { ...tile.patchRect },
                  target: tileTarget,
                  tileRect: tile.tileRect ? { ...tile.tileRect } : { ...tile.rect },
                  tx: tile.tx,
                  ty: tile.ty,
                }
              : null;
          })
          .filter(Boolean);
      }

      const existingRect = this.getRasterTargetDocumentRect(existingTarget);

      return existingTarget?.framebuffer &&
        existingTarget?.texture &&
        this.containsRasterHistoryRect(existingRect, requiredRect)
        ? [{ target: existingTarget }]
        : [];
    }

    ensureRasterTargetForPaintRect(layerId, rect, options = {}) {
      const requiredRect = this.getClampedDocumentRect(rect, options.padding || 0);

      if (!layerId || !requiredRect) {
        return null;
      }

      const existingTarget = this.ensureWritableRasterTarget(layerId, {
        source: options.source || "paint-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
      const existingRect = this.getRasterTargetDocumentRect(existingTarget);
      const source = options.source || "ensure-raster-target-for-paint-rect";

      if (this.isSparseRasterTarget(existingTarget)) {
        return this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        });
      }

      if (!existingTarget?.framebuffer || !existingTarget?.texture) {
        const nextTarget = this.createRasterTargetForDocumentRect(layerId, requiredRect, { source });

        if (!nextTarget) {
          return null;
        }

        if (!this.replaceRasterTarget(layerId, nextTarget, {
          emit: false,
          source,
        })) {
          this.deleteRasterTargetObject(nextTarget);
          return null;
        }

        return {
          ...nextTarget,
          layerId,
        };
      }

      if (this.containsRasterHistoryRect(existingRect, requiredRect)) {
        return {
          ...existingTarget,
          layerId,
        };
      }

      const nextRect = this.getClampedDocumentRect(this.unionRasterHistoryRects(existingRect, requiredRect));
      const clearColor = Array.isArray(existingTarget.clearColor)
        ? [...existingTarget.clearColor]
        : [0, 0, 0, 0];
      const nextTarget = this.createRasterTargetForDocumentRect(layerId, nextRect, {
        clearColor,
        source,
      });

      if (!nextTarget) {
        return {
          ...existingTarget,
          layerId,
        };
      }

      if (!this.copyRasterTargetRectIntoTarget(existingTarget, existingRect, nextTarget)) {
        this.deleteRasterTargetObject(nextTarget);
        return {
          ...existingTarget,
          layerId,
        };
      }

      if (!this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        source,
      })) {
        this.deleteRasterTargetObject(nextTarget);
        return {
          ...existingTarget,
          layerId,
        };
      }

      return {
        ...nextTarget,
        layerId,
      };
    }

    duplicateSparseRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);

      if (!sourceLayerId || !destinationLayerId || !this.isSparseRasterTarget(sourceTarget)) {
        return false;
      }

      if (options.copyOnWrite !== false) {
        const sharedTarget = this.createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, {
          source: options.source || "duplicate-sparse-raster-target",
        });

        if (!sharedTarget) {
          return false;
        }

        return this.installRasterTargetForLayer(destinationLayerId, sharedTarget, {
          emit: options.emit,
          label: options.label || destinationLayerId,
          source: options.source || "duplicate-sparse-raster-target",
        });
      }

      const destinationTarget = this.createSparseRasterTarget(destinationLayerId, {
        clearColor: sourceTarget.clearColor,
        tileSize: sourceTarget.tileSize,
      });
      let copiedCount = 0;

      for (const sourceTile of sourceTarget.tiles.values()) {
        if ((!sourceTile.texture || !sourceTile.framebuffer) && !this.hydrateRasterTarget(sourceTile, {
          kind: "paintTile",
          label: `${sourceLayerId} tile ${sourceTile.tx},${sourceTile.ty}`,
          layerId: sourceLayerId,
          ownerId: `${sourceLayerId}:${sourceTile.tx}:${sourceTile.ty}`,
          ownerType: "live",
          reason: options.source || "duplicate-sparse-raster-target",
        })) {
          this.deleteRasterTargetObject(destinationTarget);
          return false;
        }

        const tileRect = this.getRasterTargetDocumentRect(sourceTile);
        const destinationTile = this.ensureSparseRasterTileTarget(destinationLayerId, destinationTarget, {
          tileRect,
          tx: sourceTile.tx,
          ty: sourceTile.ty,
        }, {
          source: options.source || "duplicate-sparse-raster-target",
        });

        if (!destinationTile || !this.copyRasterTargetRectToTarget(sourceTile, tileRect, destinationTile)) {
          this.deleteRasterTargetObject(destinationTarget);
          return false;
        }

        copiedCount += 1;
      }

      if (copiedCount === 0 && sourceTarget.tiles.size > 0) {
        this.deleteRasterTargetObject(destinationTarget);
        return false;
      }

      const previousTarget = this.rasterTargetsByLayerId.get(destinationLayerId);

      destinationTarget.layerId = destinationLayerId;
      this.rasterTargetsByLayerId.set(destinationLayerId, destinationTarget);

      if (destinationLayerId === this.resolvePaintLayerId()) {
        this.paintLayerId = destinationLayerId;
        this.texture = null;
        this.framebuffer = null;
      }

      if (previousTarget && previousTarget !== destinationTarget) {
        this.deleteRasterTargetObject(previousTarget);
      }

      this.deletePuppetMeshResource(destinationLayerId);
      this.commitVisualDirtyChange({
        emit: options.emit,
        layerId: destinationLayerId,
        rect: this.getRasterTargetDocumentRect(destinationTarget),
        source: options.source || "duplicate-sparse-raster-target",
        usePreviewDirtyTiles: true,
      });

      return true;
    }

    duplicateRasterTarget(sourceLayerId, destinationLayerId, options = {}) {
      if (!sourceLayerId || !destinationLayerId || sourceLayerId === destinationLayerId) {
        return false;
      }

      const sourceTarget = this.rasterTargetsByLayerId.get(sourceLayerId);
      const sourceRect = this.getRasterTargetDocumentRect(sourceTarget);

      if (this.isSparseRasterTarget(sourceTarget)) {
        return this.duplicateSparseRasterTarget(sourceLayerId, destinationLayerId, options);
      }

      if (!sourceTarget?.framebuffer || !sourceTarget?.texture || !sourceRect) {
        return false;
      }

      if (options.copyOnWrite !== false) {
        const sharedTarget = this.createCopyOnWriteRasterTarget(sourceLayerId, destinationLayerId, {
          source: options.source || "duplicate-raster-target",
        });

        if (!sharedTarget) {
          return false;
        }

        return this.installRasterTargetForLayer(destinationLayerId, sharedTarget, {
          emit: options.emit,
          label: options.label || destinationLayerId,
          source: options.source || "duplicate-raster-target",
        });
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

      if (this.needsCopyOnWriteDetach(target)) {
        return {
          action: "copy-on-write-kept",
          bytesAfter: currentBytes,
          bytesBefore: currentBytes,
          layerId,
          savingsBytes: 0,
        };
      }

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

      const target = this.ensureWritableRasterTarget(layerId, {
        source: "clear-raster-rect-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layerId);
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

    normalizeTransformArtboardRect(rect) {
      if (!rect) {
        return null;
      }

      const x = Number(rect.x);
      const y = Number(rect.y);
      const width = Number(rect.width);
      const height = Number(rect.height);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return null;
      }

      return {
        height,
        width,
        x,
        y,
      };
    }

    getRectIntersectionArea(a, b) {
      const first = this.normalizeTransformArtboardRect(a);
      const second = this.normalizeTransformArtboardRect(b);

      if (!first || !second) {
        return 0;
      }

      const x0 = Math.max(first.x, second.x);
      const y0 = Math.max(first.y, second.y);
      const x1 = Math.min(first.x + first.width, second.x + second.width);
      const y1 = Math.min(first.y + first.height, second.y + second.height);

      return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
    }

    getPolygonArea(points = []) {
      if (!Array.isArray(points) || points.length < 3) {
        return 0;
      }

      let area = 0;

      for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];

        area += (Number(current?.x) || 0) * (Number(next?.y) || 0);
        area -= (Number(next?.x) || 0) * (Number(current?.y) || 0);
      }

      return Math.abs(area) * 0.5;
    }

    clipPolygonToRect(points = [], rect = null) {
      const clipRect = this.normalizeTransformArtboardRect(rect);

      if (!clipRect || !Array.isArray(points) || points.length < 3) {
        return [];
      }

      const boundaries = [
        {
          inside: (point) => point.x >= clipRect.x,
          intersect: (start, end) => {
            const t = (clipRect.x - start.x) / ((end.x - start.x) || 1);
            return { x: clipRect.x, y: start.y + (end.y - start.y) * t };
          },
        },
        {
          inside: (point) => point.x <= clipRect.x + clipRect.width,
          intersect: (start, end) => {
            const x = clipRect.x + clipRect.width;
            const t = (x - start.x) / ((end.x - start.x) || 1);
            return { x, y: start.y + (end.y - start.y) * t };
          },
        },
        {
          inside: (point) => point.y >= clipRect.y,
          intersect: (start, end) => {
            const t = (clipRect.y - start.y) / ((end.y - start.y) || 1);
            return { x: start.x + (end.x - start.x) * t, y: clipRect.y };
          },
        },
        {
          inside: (point) => point.y <= clipRect.y + clipRect.height,
          intersect: (start, end) => {
            const y = clipRect.y + clipRect.height;
            const t = (y - start.y) / ((end.y - start.y) || 1);
            return { x: start.x + (end.x - start.x) * t, y };
          },
        },
      ];

      return boundaries.reduce((polygon, boundary) => {
        if (polygon.length === 0) {
          return [];
        }

        const output = [];

        for (let index = 0; index < polygon.length; index += 1) {
          const current = polygon[index];
          const previous = polygon[(index + polygon.length - 1) % polygon.length];
          const currentInside = boundary.inside(current);
          const previousInside = boundary.inside(previous);

          if (currentInside) {
            if (!previousInside) {
              output.push(boundary.intersect(previous, current));
            }

            output.push(current);
          } else if (previousInside) {
            output.push(boundary.intersect(previous, current));
          }
        }

        return output;
      }, points.map((point) => ({
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
      })));
    }

    getTransformArtboardGeometry(options = {}) {
      const transformMode = String(options.transformMode || "").trim().toLowerCase();
      const quad = Array.isArray(options.destQuad)
        ? options.destQuad
            .map((point) => ({
              x: Number(point?.x),
              y: Number(point?.y),
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : [];

      if (transformMode !== "warp" && quad.length >= 3) {
        return {
          points: quad,
          type: "polygon",
        };
      }

      const rect = this.normalizeTransformArtboardRect(options.destRect);

      return rect
        ? {
            rect,
            type: "rect",
          }
        : null;
    }

    getTransformGeometryArea(geometry) {
      if (geometry?.type === "polygon") {
        return this.getPolygonArea(geometry.points);
      }

      return geometry?.rect
        ? Math.max(0, geometry.rect.width * geometry.rect.height)
        : 0;
    }

    getTransformGeometryArtboardOverlapArea(geometry, artboardRect) {
      if (geometry?.type === "polygon") {
        return this.getPolygonArea(this.clipPolygonToRect(geometry.points, artboardRect));
      }

      return this.getRectIntersectionArea(geometry?.rect, artboardRect);
    }

    resolveTransformArtboardTransfer(layerId, options = {}) {
      const layer = this.layerModel?.findEntryById?.(layerId);
      const currentArtboardId = String(
        layer?.artboardId ||
        this.layerModel?.findEntryArtboardId?.(layerId) ||
        "",
      ).trim();
      const artboards = (namespace.getDocumentArtboards?.() || [])
        .map((artboard) => ({
          id: String(artboard?.id || "").trim(),
          rect: this.normalizeTransformArtboardRect(artboard),
        }))
        .filter((artboard) => artboard.id && artboard.rect);
      const geometry = this.getTransformArtboardGeometry(options);
      const geometryArea = this.getTransformGeometryArea(geometry);

      if (!layer || artboards.length === 0 || geometryArea <= 0) {
        return null;
      }

      let best = null;
      let currentOverlapArea = 0;

      artboards.forEach((artboard) => {
        const overlapArea = this.getTransformGeometryArtboardOverlapArea(geometry, artboard.rect);

        if (artboard.id === currentArtboardId) {
          currentOverlapArea = overlapArea;
        }

        if (!best || overlapArea > best.overlapArea) {
          best = {
            artboardId: artboard.id,
            overlapArea,
          };
        }
      });

      if (
        !best ||
        best.artboardId === currentArtboardId ||
        best.overlapArea <= currentOverlapArea ||
        best.overlapArea / geometryArea < RASTER_TRANSFORM_ARTBOARD_TRANSFER_MIN_RATIO
      ) {
        return null;
      }

      return {
        fromArtboardId: currentArtboardId,
        overlapArea: best.overlapArea,
        overlapRatio: best.overlapArea / geometryArea,
        toArtboardId: best.artboardId,
      };
    }

    applyTransformArtboardTransfer(layerId, options = {}) {
      const transfer = this.resolveTransformArtboardTransfer(layerId, options);

      if (!transfer?.toArtboardId) {
        return null;
      }

      const didMove = this.layerModel?.moveLayerToArtboard?.(layerId, transfer.toArtboardId, {
        history: false,
        source: options.source || "raster-transform-artboard-transfer",
      });

      return didMove ? transfer : null;
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
          const didRestoreState = history.restoreLayerState(this.layerModel, after, {
            source: `history-redo-${source}-layer-state`,
          });

          if (!didRestoreState) {
            return false;
          }

          const didRestorePixels = baseEntry.redo?.() !== false;

          if (!didRestorePixels) {
            baseEntry.undo?.();
            history.restoreLayerState(this.layerModel, before, {
              source: `history-redo-${source}-rollback`,
            });
          }

          return didRestorePixels;
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
      let didLayerStateChange = false;

      if (!layer || layer.locked === true) {
        return entry;
      }

      history?.flushLayerState?.(this.layerModel);
      const beforeState = history?.getLayerSnapshot?.(this.layerModel) || null;

      if (layer.type === "image") {
        const didRasterize = this.layerModel?.rasterizeImageLayerToPaint?.(layer.id, {
          history: false,
          source,
        });

        if (didRasterize) {
          didLayerStateChange = true;

          window.dispatchEvent(new CustomEvent("cbo:image-layer-rasterized", {
            detail: {
              layerId: layer.id,
              source,
            },
          }));
        }
      }

      const transfer = this.applyTransformArtboardTransfer(layer.id, {
        ...(options.artboardTransfer || {}),
        source: `${source}-artboard-transfer`,
      });

      didLayerStateChange = didLayerStateChange || Boolean(transfer);

      if (!didLayerStateChange) {
        return entry;
      }

      const afterState = history?.getLayerSnapshot?.(this.layerModel) || null;

      return this.createRasterEditLayerStateHistoryEntry(entry, {
        afterState,
        beforeState,
        history,
        layerId: layer.id,
        source,
      });
    }

    getTranslateOnlyRasterTransformDelta(options = {}) {
      const transformMode = String(options.transformMode || "free").trim().toLowerCase();

      if (transformMode === "warp" || transformMode === "perspective" || options.warpControlPoints) {
        return null;
      }

      const sourceRect = this.getUnclampedDocumentRect(options.sourceRect);
      const destQuad = Array.isArray(options.destQuad) ? options.destQuad : null;

      if (!sourceRect || !destQuad || destQuad.length < 4) {
        return null;
      }

      const dx = Number(destQuad[0]?.x) - sourceRect.x;
      const dy = Number(destQuad[0]?.y) - sourceRect.y;
      const roundedDx = Math.round(dx);
      const roundedDy = Math.round(dy);
      const epsilon = 0.001;

      if (
        !Number.isFinite(dx) ||
        !Number.isFinite(dy) ||
        (roundedDx === 0 && roundedDy === 0)
      ) {
        return null;
      }

      const expected = [
        { x: sourceRect.x + dx, y: sourceRect.y + dy },
        { x: sourceRect.x + sourceRect.width + dx, y: sourceRect.y + dy },
        { x: sourceRect.x + sourceRect.width + dx, y: sourceRect.y + sourceRect.height + dy },
        { x: sourceRect.x + dx, y: sourceRect.y + sourceRect.height + dy },
      ];

      for (let index = 0; index < expected.length; index += 1) {
        const point = destQuad[index];

        if (
          !point ||
          Math.abs(Number(point.x) - expected[index].x) > epsilon ||
          Math.abs(Number(point.y) - expected[index].y) > epsilon
        ) {
          return null;
        }
      }

      return {
        dx: roundedDx,
        dy: roundedDy,
      };
    }

    commitTranslatedRasterTransform(options = {}) {
      const {
        destQuad,
        destRect,
        layerId,
        source = "raster-transform",
        sourceRect,
        target,
        transformMode = "free",
        warpControlPoints,
      } = options;
      const delta = this.getTranslateOnlyRasterTransformDelta({
        destQuad,
        sourceRect,
        transformMode,
        warpControlPoints,
      });

      if (!layerId || !target || !delta) {
        return false;
      }

      const beforeTargetRect = this.getRasterTargetDocumentRect(target);
      const afterTargetRect = beforeTargetRect
        ? this.offsetDocumentRect(beforeTargetRect, delta.dx, delta.dy)
        : null;
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [sourceRect, destRect || this.offsetDocumentRect(sourceRect, delta.dx, delta.dy)],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const applyPlacement = (dx, dy, historySource) => {
        const didTranslate = this.translateRasterTargetPlacement(layerId, dx, dy, {
          source: historySource,
        });

        if (!didTranslate) {
          return false;
        }

        this.commitVisualDirtyChange({
          layerId,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: historySource,
        });
        this.requestDraw();
        return true;
      };

      if (!applyPlacement(delta.dx, delta.dy, source)) {
        return false;
      }

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterRect: afterTargetRect,
        beforeRect: beforeTargetRect,
        estimatedPeakBytes: 0,
        layerId,
        mode: transformMode,
        operationType: "raster-transform-placement",
        persistentBytes: 0,
        reason: source,
        scratchBytes: 0,
        source,
        sourceBytes: 0,
        sourceRect,
        targetBytes: 0,
        targetRect: afterTargetRect,
        tool: "raster-transform",
      }));
      const history = namespace.documentHistory;
      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        layerId,
        memoryPolicy,
        source,
        type: "custom",
        undo: () => applyPlacement(-delta.dx, -delta.dy, `history-undo-${source}`),
        redo: () => applyPlacement(delta.dx, delta.dy, `history-redo-${source}`),
      }, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      }

      this.clearRasterTransformPreview(layerId);
      return true;
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
      let target = this.rasterTargetsByLayerId.get(layerId);
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);
      const nextRect = this.getUnclampedDocumentRect(
        destDirtyRect || destRect,
        CROPPED_TARGET_EDGE_PADDING,
      );
      const wasSparseTarget = this.isSparseRasterTarget(target);
      const willRasterizeImageLayer = this.layerModel?.findEntryById?.(layerId)?.type === "image";

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        }) || target;
      }

      if (!target?.framebuffer || !sourceSnapshot?.texture || !nextRect) {
        return false;
      }

      const preferSparseRestore = wasSparseTarget ||
        target.materializedFromSparse === true ||
        willRasterizeImageLayer;
      const beforeSnapshot = this.createRasterSnapshot(target, null, `${source}-before-target`);

      if (!beforeSnapshot?.texture) {
        return false;
      }

      const nextTarget = this.createRasterTargetForUnclampedRect(nextRect);

      if (!nextTarget?.framebuffer) {
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      if (preferSparseRestore) {
        nextTarget.materializedFromSparse = true;
        nextTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
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
        textureFilter: this.gl?.LINEAR,
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

      const currentTargetRect = this.getRasterTargetDocumentRect(target);
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [currentTargetRect, nextRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const scratchBytes = this.estimateRasterSnapshotBytes(sourceSnapshot);

      this.replaceRasterTarget(layerId, nextTarget, {
        emit: false,
        invalidate: false,
        rects: previewDirtyRects,
        source,
      });

      const afterPreferSparse = Boolean(
        preferSparseRestore &&
        (willRasterizeImageLayer || this.isPaintRasterLayer(layerId, nextTarget))
      );
      const finalLiveTarget = afterPreferSparse
        ? this.sparsifyRasterTarget(layerId, nextTarget, {
            clampToDocument: false,
            emit: false,
            source: `${source}-retile`,
            tileSize: nextTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || nextTarget
        : nextTarget;
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);

      const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
        afterRect: nextRect,
        beforeSnapshot,
        estimatedPeakBytes:
          sourceBytes +
          targetBytes +
          scratchBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot),
        layerId,
        mode: transformMode,
        operationType: "raster-transform",
        persistentBytes:
          targetBytes +
          this.estimateRasterSnapshotBytes(beforeSnapshot),
        reason: source,
        scratchBytes,
        source,
        sourceBytes,
        sourceRect: currentTargetRect,
        targetBytes,
        targetRect: nextRect,
        tool: "raster-transform",
      }));

      const history = namespace.documentHistory;
      let afterSnapshot = null;
      const snapshots = {
        after: null,
        before: beforeSnapshot,
      };
      const captureAfterSnapshot = () => {
        if (afterSnapshot?.texture || afterSnapshot?.cpuPixels || afterSnapshot?.empty === true) {
          return true;
        }

        afterSnapshot = this.createRasterSnapshot(layerId, nextRect, `${source}-after-target`);
        snapshots.after = afterSnapshot;

        return Boolean(afterSnapshot?.texture || afterSnapshot?.cpuPixels || afterSnapshot?.empty === true);
      };
      const baseEntry = {
        type: "custom",
        beforeSnapshot,
        layerId,
        memoryPolicy,
        snapshots,
        source,
        undo: () => {
          if (!captureAfterSnapshot()) {
            return false;
          }

          return this.restoreRasterSnapshot(layerId, beforeSnapshot, {
            preferSparse: preferSparseRestore,
            replaceSparse: preferSparseRestore,
            releaseSnapshotGpuAfterRestore: true,
            source: `history-undo-${source}`,
          });
        },
        redo: () => snapshots.after
          ? this.restoreRasterSnapshot(layerId, snapshots.after, {
              preferSparse: afterPreferSparse,
              replaceSparse: afterPreferSparse,
              releaseSnapshotGpuAfterRestore: true,
              source: `history-redo-${source}`,
            })
          : false,
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(snapshots.after);
        },
      };
      const entry = this.finalizeRasterEditHistoryEntry(layerId, baseEntry, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.commitVisualDirtyChange({
        layerId,
        maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
        preserveDirtyRects: true,
        rects: previewDirtyRects,
        source,
      });
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
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("transform.commit", {
        layerId,
        mode: transformMode,
        source,
      }) : null;

      try {
      let target = this.ensureWritableRasterTarget(layerId, {
        source: `${source}-copy-on-write-detach`,
      }) || this.rasterTargetsByLayerId.get(layerId);
      const bounds = namespace.documentBounds;
      const normalizedTransformMode = String(transformMode).trim().toLowerCase();

      if (!bounds) {
        return false;
      }

      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source,
        }) || target;
      }

      const preferSparseRestore = wasSparseTarget || target?.materializedFromSparse === true;

      const destBounds = normalizedTransformMode === "warp"
        ? bounds?.rectToBounds?.(this.getRasterWarpBounds(warpControlPoints))
        : bounds?.quadToBounds?.(destQuad);
      const destRect = bounds?.boundsToRect?.(destBounds);
      const destDirtyRect = this.padRasterRect(destRect, RASTER_TRANSFORM_EDGE_AA_DIRTY_PADDING);
      const targetRect = this.getRasterTargetDocumentRect(target);
      const transformEscapesTarget = Boolean(
        targetRect &&
        (
          !this.containsRasterHistoryRect(targetRect, destDirtyRect || destRect) ||
          !this.containsRasterHistoryRect(targetRect, sourceRect)
        )
      );

      if (this.getTranslateOnlyRasterTransformDelta({
        destQuad,
        sourceRect,
        transformMode: normalizedTransformMode,
        warpControlPoints,
      })) {
        return this.commitTranslatedRasterTransform({
          ...options,
          destRect,
          target,
        });
      }

      if (this.isCroppedRasterTarget(target) || transformEscapesTarget) {
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
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [sourceRect, destDirtyRect || destRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );

      if (!target?.framebuffer || !sourceSnapshot?.texture || !sourceRect || !dirtyRect) {
        return false;
      }

      const useAuthoritativeSparseHistory = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));
      const tileHistory = useAuthoritativeSparseHistory
        ? null
        : this.beginRasterTileHistory(layerId, dirtyRect, {
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
        textureFilter: this.gl?.LINEAR,
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
            preferSparse: preferSparseRestore,
            source: `${source}-rollback`,
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }
        return false;
      }

      if (tileHistory) {
        const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));
        const memoryPolicy = this.recordRasterOperation(this.createRasterOperationMemoryReport({
          afterRect: dirtyRect,
          beforeRect: dirtyRect,
          layerId,
          mode: transformMode,
          operationType: "raster-transform",
          persistentBytes: this.getRasterRectBytes(dirtyRect),
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
          lazyAfter: true,
          memoryPolicy,
          redoSource: `history-redo-${source}`,
          releaseSnapshotGpuAfterRestore: true,
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

        const entry = this.finalizeRasterEditHistoryEntry(layerId, tileEntry, {
          artboardTransfer: {
            destQuad,
            destRect,
            transformMode,
            warpControlPoints,
          },
          source,
        });
        const history = namespace.documentHistory;

        if (afterPreferSparse) {
          this.sparsifyRasterTarget(layerId, target, {
            clampToDocument: false,
            emit: false,
            source: `${source}-retile`,
            tileSize: target.sparseTileSize || target.tileSize,
          });
        }

        if (history?.push) {
          history.push(entry);
        } else {
          entry.destroy();
        }

        this.clearRasterTransformPreview(layerId);
        this.commitVisualDirtyChange({
          layerId,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source,
        });
        this.requestDraw();

        return true;
      }

      const afterSnapshot = this.createRasterSnapshot(layerId, dirtyRect, `${source}-after`);

      if (!afterSnapshot?.texture) {
        this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
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
      const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layerId, target));

      if (afterPreferSparse) {
        this.sparsifyRasterTarget(layerId, target, {
          clampToDocument: false,
          emit: false,
          source: `${source}-retile`,
          tileSize: target.sparseTileSize || target.tileSize,
        });
      }

      const entry = this.finalizeRasterEditHistoryEntry(layerId, {
        type: "custom",
        afterSnapshot,
        beforeSnapshot,
        layerId,
        memoryPolicy,
        source,
        undo: () => this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          preferSparse: preferSparseRestore,
          replaceSparse: preferSparseRestore,
          releaseSnapshotGpuAfterRestore: true,
          source: `history-undo-${source}`,
        }),
        redo: () => this.restoreRasterSnapshot(layerId, afterSnapshot, {
          preferSparse: afterPreferSparse,
          replaceSparse: afterPreferSparse,
          releaseSnapshotGpuAfterRestore: true,
          source: `history-redo-${source}`,
        }),
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(afterSnapshot);
        },
      }, {
        artboardTransfer: {
          destQuad,
          destRect,
          transformMode,
          warpControlPoints,
        },
        source,
      });

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.commitVisualDirtyChange({
        layerId,
        maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
        preserveDirtyRects: true,
        rects: previewDirtyRects,
        source,
      });
      this.requestDraw();

      return true;
      } finally {
        trace?.end({
          layerId,
          mode: transformMode,
          source,
        });
      }
    }

    deleteRasterTarget(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if ((target.texture && target.texture === this.texture) || layerId === this.paintLayerId || layerId === "background") {
        return false;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);

      this.deleteRasterTargetObject(target);
      this.rasterTargetsByLayerId.delete(layerId);
      this.deletePuppetMeshResource(layerId);

      if (options.emit !== false) {
        this.commitVisualDirtyChange({
          layerId,
          rect: targetRect,
          source: options.source || "delete-raster-target",
          usePreviewDirtyTiles: true,
        });
      }

      return true;
    }

    emitContentChange(detail = {}) {
      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail,
      }));
    }

    handleLayerModelChange(event) {
      const source = event?.detail?.source || "layers-change";
      const changeType = event?.detail?.changeType || "";
      const isRasterTransformArtboardTransfer =
        source.endsWith("-artboard-transfer") && source.includes("raster-transform");
      const nonVisualSources = new Set([
        "active-layer",
        "image-rasterize",
        "image-upload",
        "image-upload-error",
        "image-upload-metadata",
        "layer-effects-rasterize",
        "raster-transform",
      ]);

      if (changeType !== "active-layer" && !nonVisualSources.has(source) && !isRasterTransformArtboardTransfer) {
        this.invalidatePreviewCache("layers-change");
      }

      this.pruneOrphanRasterTargets();
    }

    handleDocumentContentChange(event) {
      const detail = event?.detail || {};

      this.invalidatePreviewCache(detail.source || "document-content-change", detail);
    }

    handleHistoryChange(event) {
      const source = event?.detail?.source || "history-change";
      const stackOnlySources = new Set([
        "clear",
        "dispose",
        "history-budget-change",
        "history-gpu-hot-budget-change",
        "history-gpu-hot-prune",
        "init",
        "merge",
        "push",
        "redo-empty",
        "undo-empty",
      ]);

      if (!stackOnlySources.has(source) && !this.previewCacheDirty) {
        this.invalidatePreviewCache("history-change");
      }

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

      if (this.isSparseRasterTarget(nextTarget)) {
        this.texture = null;
        this.framebuffer = null;
        return activePaintLayerId;
      }

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
      } else if (previousTarget?.texture && previousTarget.texture === this.texture) {
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

        const isLiveTarget = currentLayerIds.has(layerId) || (target.texture && target.texture === this.texture);
        const isHistoryTarget = historyLayerIds.has(layerId);

        if (!isLiveTarget && !isHistoryTarget) {
          continue;
        }

        target.layerId = layerId;

        if (isLiveTarget) {
          const isPaintTarget = layerId !== "background" && this.isPaintRasterLayer(layerId, target);
          const kind = layerId === "background" ? "background" : isPaintTarget ? "paintTarget" : "layer";
          const keepColdForArtboard = this.isArtboardResidencyEnabled() &&
            target.state === "CPU_COLD" &&
            this.isLayerInColdArtboard(layerId);

          if (keepColdForArtboard) {
            this.updateRasterTargetResourceMetadata?.(target, {
              kind,
              label: layerId,
              layerId,
              ownerId: layerId,
              ownerType: "liveCpuCold",
              purgeable: true,
              reason: "artboard-residency-cold-live",
              state: "CPU_COLD",
            });
            updatedCount += 1;
            continue;
          }

          if ((!target.texture || !target.framebuffer) && target.state === "CPU_COLD") {
            this.hydrateRasterTarget(target, {
              kind,
              label: layerId,
              layerId,
              ownerId: layerId,
              ownerType: "live",
              purgeable: false,
              reason: "history-retained-layer-target-hydrate",
            });
          }

          this.updateRasterTargetResourceMetadata?.(target, {
            kind,
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

        if (target.state === "CPU_COLD") {
          updatedCount += 1;
          continue;
        }

        if (this.needsCopyOnWriteDetach(target)) {
          updatedCount += 1;
          continue;
        }

        if (this.dehydrateRasterTarget(target, {
          layerId,
          reason: "history-retained-layer-target",
        })) {
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

    getHistoryColdRasterTargetBytes() {
      if (!this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let total = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (
          currentLayerIds.has(layerId) ||
          !historyLayerIds.has(layerId) ||
          target?.state !== "CPU_COLD"
        ) {
          continue;
        }

        total += Math.max(
          0,
          Math.round(Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(target)),
        );
      }

      return total;
    }

    getRasterTargetCpuRawBytes(target) {
      if (!target) {
        return 0;
      }

      if (this.isSparseRasterTarget(target)) {
        let total = 0;

        target.tiles?.forEach?.((tile) => {
          total += this.getRasterTargetCpuRawBytes(tile);
        });

        return total;
      }

      return Math.max(
        0,
        Math.round(Number(target.cpuRawBytes) || Number(target.cpuBytes) || Number(target.cpuPixels?.byteLength) || this.estimateRasterTargetBytes(target)),
      );
    }

    getHistoryColdRasterTargetRawBytes() {
      if (!this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const currentLayerIds = this.getCurrentRasterTargetLayerIds();
      const historyLayerIds = this.collectHistoryLayerIds(new Set());
      let total = 0;

      for (const [layerId, target] of this.rasterTargetsByLayerId.entries()) {
        if (
          currentLayerIds.has(layerId) ||
          !historyLayerIds.has(layerId) ||
          target?.state !== "CPU_COLD"
        ) {
          continue;
        }

        total += this.getRasterTargetCpuRawBytes(target);
      }

      return total;
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

        if (retainedLayerIds.has(layerId) || (target?.texture && target.texture === this.texture)) {
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
      let target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget(layerId, {
        source: "get-paint-target",
      });

      target = this.ensureWritableRasterTarget(layerId, {
        source: "get-paint-target-copy-on-write-detach",
      }) || target;

      if (this.isSparseRasterTarget(target)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: "get-paint-target-materialize-sparse",
        }) || this.createPaintTarget(layerId, {
          source: "get-paint-target-materialize-sparse",
        });
      }

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

    getDocumentBoundsRect() {
      const artboardUnion = this.options?.isolateDocumentArtboards
        ? null
        : namespace.getDocumentArtboardUnionRect?.();

      return artboardUnion || {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(this.width || 1)),
        height: Math.max(1, Math.round(this.height || 1)),
      };
    }

    ensurePaintLayerForBrush(options = {}) {
      const paintLayer = this.layerModel?.ensureActivePaintLayer?.({
        reuseExistingPaintLayer: true,
        source: "brush-stroke",
      });

      if (paintLayer?.id) {
        if (options.materialize === false) {
          this.paintLayerId = paintLayer.id;
          return this.getDocumentDrawTarget(paintLayer.id);
        }

        const target = this.getPaintTarget();

        if (this.isCroppedRasterTarget(target)) {
          return this.materializeRasterTarget(paintLayer.id, {
            source: "brush-materialize",
          }) || target;
        }

        return target;
      }

      if (options.materialize === false) {
        const layerId = this.resolvePaintLayerId();

        this.paintLayerId = layerId;
        return this.getDocumentDrawTarget(layerId);
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

      let target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget(layerId, {
        source: "get-raster-target",
      });

      target = this.ensureWritableRasterTarget(layerId, {
        source: "get-raster-target-copy-on-write-detach",
      }) || target;

      if (this.isSparseRasterTarget(target)) {
        target = this.materializeRasterTarget(layerId, {
          emit: false,
          source: "get-raster-target-materialize-sparse",
        }) || this.createPaintTarget(layerId, {
          source: "get-raster-target-materialize-sparse",
        });
      }

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

    updatePreviewCacheIfNeeded(options = {}) {
      const didCreate = this.createPreviewCache(options);

      if (!didCreate) {
        return false;
      }

      if (!this.previewCacheDirty && this.previewCacheReady) {
        return true;
      }

      return this.updatePreviewCache(options);
    }

    updatePreviewCache(options = {}) {
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("preview-cache.update", {
        dirty: this.previewCacheDirty,
        reason: this.previewCacheReason || "unknown",
      }) : null;

      try {
      if (!this.previewTexture || !this.previewFramebuffer || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const baseDocumentWidth = Math.max(1, Math.round(this.width || 1));
      const baseDocumentHeight = Math.max(1, Math.round(this.height || 1));
      const documentRect = this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect(options);
      const documentWidth = Math.max(1, Math.round(documentRect.width || baseDocumentWidth));
      const documentHeight = Math.max(1, Math.round(documentRect.height || baseDocumentHeight));
      const cacheWidth = Math.max(1, Math.round(this.previewCacheWidth || documentWidth));
      const cacheHeight = Math.max(1, Math.round(this.previewCacheHeight || documentHeight));
      const cacheScale = Math.max(
        0.0001,
        Number(this.previewCacheScale) || Math.min(cacheWidth / documentWidth, cacheHeight / documentHeight),
      );
      const dirtyCompactOptions = this.previewDirtyCompactOptions || {};
      const dirtyRects = this.previewCacheReady && Array.isArray(this.previewDirtyRects) && this.previewDirtyRects.length > 0
        ? this.compactDirtyRegionRects(this.previewDirtyRects, dirtyCompactOptions)
        : null;
      const dirtyScissors = dirtyRects
        ? this.getPreviewDirtyRegionScissors(dirtyRects, cacheWidth, cacheHeight, cacheScale, {
            ...dirtyCompactOptions,
            documentRect,
          })
        : null;
      const dirtyRect = dirtyScissors
        ? this.unionDirtyRegionRects(dirtyRects)
        : null;
      const { program, uniforms } = this.programInfo;
      const flatCamera = {
        x: -documentRect.x * cacheScale,
        y: -documentRect.y * cacheScale,
        zoom: cacheScale,
      };
      let previewCompositeState = null;
      const setDocumentProjection = (projectionWidth, projectionHeight, cameraX, cameraY, cameraZoom = cacheScale) => {
        gl.uniform2f(uniforms.documentSize, projectionWidth, projectionHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
        gl.uniform1f(uniforms.cameraZoom, cameraZoom);
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, previewCompositeState?.read?.framebuffer || this.previewFramebuffer);
        gl.viewport(0, 0, cacheWidth, cacheHeight);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, cacheWidth, cacheHeight);
        setDocumentProjection(baseDocumentWidth, baseDocumentHeight, flatCamera.x, flatCamera.y);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, baseDocumentWidth, baseDocumentHeight);
        gl.uniform1f(uniforms.maskClipMode, 0.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniforms.maskClipRectCount, 0);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, baseDocumentWidth, baseDocumentHeight);
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
      let currentPreviewScissor = null;
      const getPreviewScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const left = (docRect.x - documentRect.x) * cacheScale;
        const top = (docRect.y - documentRect.y) * cacheScale;
        const right = (docRect.x + docRect.width - documentRect.x) * cacheScale;
        const bottom = (docRect.y + docRect.height - documentRect.y) * cacheScale;
        const clippedLeft = Math.max(0, Math.floor(Math.min(left, right)));
        const clippedTop = Math.max(0, Math.floor(Math.min(top, bottom)));
        const clippedRight = Math.min(cacheWidth, Math.ceil(Math.max(left, right)));
        const clippedBottom = Math.min(cacheHeight, Math.ceil(Math.max(top, bottom)));

        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
          return null;
        }

        return {
          height: clippedBottom - clippedTop,
          width: clippedRight - clippedLeft,
          x: clippedLeft,
          y: cacheHeight - clippedBottom,
        };
      };
      const intersectPreviewScissors = (first, second) => {
        if (!first || !second) {
          return first || second || null;
        }

        const x0 = Math.max(first.x, second.x);
        const y0 = Math.max(first.y, second.y);
        const x1 = Math.min(first.x + first.width, second.x + second.width);
        const y1 = Math.min(first.y + first.height, second.y + second.height);

        return x1 > x0 && y1 > y0
          ? {
              height: y1 - y0,
              width: x1 - x0,
              x: x0,
              y: y0,
            }
          : null;
      };
      const restorePreviewScissor = (scissor) => {
        currentPreviewScissor = scissor;

        if (scissor) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
        } else {
          gl.disable(gl.SCISSOR_TEST);
        }
      };
      const withPreviewScissor = (scissor, callback) => {
        if (!scissor) {
          callback();
          return;
        }

        const previousScissor = currentPreviewScissor;
        const nextScissor = intersectPreviewScissors(previousScissor, scissor);

        if (!nextScissor) {
          return;
        }

        restorePreviewScissor(nextScissor);
        try {
          callback();
        } finally {
          restorePreviewScissor(previousScissor);
        }
      };
      const withLayerPreviewArtboardClip = (layer, callback) => {
        const artboardRect = this.getLayerArtboardVisualRect(layer);

        if (!artboardRect) {
          callback();
          return;
        }

        const artboardScissor = getPreviewScissorForDocumentRect(artboardRect);

        if (!artboardScissor) {
          return;
        }

        withPreviewScissor(artboardScissor, callback);
      };
      const drawTexture = (texture, opacity = 1, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (rect.x - documentRect.x) * cacheScale,
            (rect.y - documentRect.y) * cacheScale,
          );
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(baseDocumentWidth, baseDocumentHeight, flatCamera.x, flatCamera.y);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;
          const clipOrigin = this.getClipBaseOrigin(clipBase);

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1i(uniforms.clipTexture, 2);
          gl.uniform1f(uniforms.clipMode, 1.0);
          gl.uniform1f(uniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            uniforms.clipOrigin,
            clipOrigin.x,
            clipOrigin.y,
          );
          gl.uniform2f(
            uniforms.clipTextureSize,
            clipBase.target.width || baseDocumentWidth,
            clipBase.target.height || baseDocumentHeight,
          );
          gl.activeTexture(gl.TEXTURE0);
        } else {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.uniform1f(uniforms.clipOpacity, 1.0);
          gl.uniform2f(uniforms.clipOrigin, 0, 0);
          gl.uniform2f(uniforms.clipTextureSize, baseDocumentWidth, baseDocumentHeight);
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

        if (!previewCompositeState?.read?.texture || !previewCompositeState?.write?.framebuffer) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (currentPreviewScissor) {
          gl.disable(gl.SCISSOR_TEST);
          this.drawScreenTexture(previewCompositeState.read.texture, {
            blend: false,
            framebuffer: previewCompositeState.write.framebuffer,
            viewportHeight: cacheHeight,
            viewportWidth: cacheWidth,
          });
          restorePreviewScissor(currentPreviewScissor);
        }

        this.drawLayerCompositeTexture({
          backdropTexture: previewCompositeState.read.texture,
          blendModeId,
          camera: flatCamera,
          clipBase,
          documentHeight: baseDocumentHeight,
          documentWidth: baseDocumentWidth,
          framebuffer: previewCompositeState.write.framebuffer,
          opacity,
          rect,
          texture,
          viewportHeight: cacheHeight,
          viewportWidth: cacheWidth,
        });
        previewCompositeState = this.swapLayerComposite(previewCompositeState);
        bindArtboardProgram();
      };

      const orderedPreviewLayers = this.getOrderedLayersBottomToTop();
      const previewNeedsLayerComposite = orderedPreviewLayers.some((layer) =>
        layer?.visible !== false && this.hasAdvancedLayerBlendMode(layer)
      );
      const isValidClipBaseLayer = (layer) => Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );
      const clipBaseLayerIds = new Set();
      let pendingClipBaseLayerId = "";

      orderedPreviewLayers.forEach((layer) => {
        if (layer?.clippingMask === true) {
          if (pendingClipBaseLayerId) {
            clipBaseLayerIds.add(pendingClipBaseLayerId);
          }
        } else {
          pendingClipBaseLayerId = isValidClipBaseLayer(layer) ? layer.id : "";
        }
      });

      const drawPreviewCachePass = (dirtyScissor = null) => {
        restorePreviewScissor(dirtyScissor || null);

        if (previewNeedsLayerComposite) {
          previewCompositeState = this.beginLayerComposite(cacheWidth, cacheHeight);
        } else {
          previewCompositeState = null;
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);
          gl.viewport(0, 0, cacheWidth, cacheHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        bindArtboardProgram();

        let currentClipBase = null;

        for (const layer of orderedPreviewLayers) {
          const rawLayerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const clipBase = isClippingLayer ? currentClipBase : null;
          let layerTarget = this.getRenderableLayerTarget(layer, rawLayerTarget, {
            forceSingleTexture: false,
            source: "preview-cache-sparse-layer",
          });

          if (!isClippingLayer) {
            const shouldMaterializeClipBase = clipBaseLayerIds.has(layer.id);
            const baseTarget = shouldMaterializeClipBase
              ? this.getRenderableLayerTarget(layer, layerTarget, {
                  forceSingleTexture: true,
                  source: "preview-cache-clip-base",
                })
              : layerTarget;

            if (shouldMaterializeClipBase) {
              layerTarget = baseTarget;
            }

            currentClipBase = isValidClipBaseLayer(layer)
              ? this.createClipBaseForLayer(layer, baseTarget, layer.visible !== false)
              : null;
          }

          if (layer.visible === false) {
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !clipBase?.target?.texture)) {
            continue;
          }

          if (!this.hasRenderableRasterTarget(layerTarget)) {
            continue;
          }

          for (const renderResult of this.getLayerRenderResults(layer, layerTarget)) {
            const layerTexture = renderResult?.texture;

            if (!layerTexture) {
              continue;
            }

            if (layerTexture !== layerTarget.texture) {
              bindArtboardProgram();
            }

            if (this.hasPuppetLayerTransform(layer)) {
              withLayerPreviewArtboardClip(layer, () => {
                if (isClippingLayer) {
                  drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, clipBase);
                } else {
                  const puppetTarget = this.getPuppetVisualTarget(layerTarget, renderResult);
                  const didDrawPuppet = this.drawPuppetLayer(layer, puppetTarget, opacity, {
                    camera: flatCamera,
                    sourceTexture: layerTexture,
                    viewportHeight: cacheHeight,
                    viewportWidth: cacheWidth,
                  });

                  bindArtboardProgram();

                  if (!didDrawPuppet) {
                    drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, null);
                  }
                }
              });
            } else {
              withLayerPreviewArtboardClip(layer, () => {
                drawBlendTexture(layerTexture, opacity, this.getLayerBlendModeId(layer), renderResult.rect, clipBase);
              });
            }
          }
        }

        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);

        if (previewCompositeState?.read?.texture) {
          this.drawScreenTexture(previewCompositeState.read.texture, {
            blend: false,
            framebuffer: this.previewFramebuffer,
            viewportHeight: cacheHeight,
            viewportWidth: cacheWidth,
          });
          previewCompositeState = null;
        }

        restorePreviewScissor(null);
      };

      const previewPassScissors = Array.isArray(dirtyScissors) && dirtyScissors.length > 0
        ? dirtyScissors
        : [null];

      previewPassScissors.forEach((dirtyScissor) => drawPreviewCachePass(dirtyScissor));

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);

      if (this.previewMipLevels > 1) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewCacheDirty = false;
      this.previewDirtyRects = [];
      this.previewDirtyCompactOptions = null;
      this.recordPreviewDirtyFrame({
        cacheHeight,
        cacheScale,
        cacheWidth,
        dirtyRect,
        dirtyRects,
        dirtyScissors,
      });
      this.previewCacheReady = true;
      this.captureArtboardFlatPreviewsFromPreviewCache({
        reason: this.previewCacheReason || "preview-cache-update",
      });

      return true;
      } finally {
        trace?.end({
          cacheHeight: this.previewCacheHeight,
          cacheWidth: this.previewCacheWidth,
          mode: this.previewLastDirtyMode || this.previewDirtyStats?.lastMode || "unknown",
          reason: this.previewCacheReason || "unknown",
        });
      }
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
      const documentRect = this.previewCacheDocumentRect || this.getPreviewCacheDocumentRect();
      const exactRect = this.getPreviewCacheExactDocumentRect(documentRect);

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, exactRect.width, exactRect.height);
      gl.uniform2f(
        uniforms.cameraPosition,
        (camera.x || 0) + exactRect.x * (camera.zoom || 1),
        (camera.y || 0) + exactRect.y * (camera.zoom || 1),
      );
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, exactRect.x, exactRect.y, exactRect.width, exactRect.height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, exactRect.width, exactRect.height);
      gl.uniform2f(uniforms.drawOrigin, exactRect.x, exactRect.y);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      this.setRasterTextureSampling(this.previewTexture, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
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

      if (this.isSparseRasterTarget(target)) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return 0;
        }

        const tileSize = this.getRasterHistoryTileSize({ tileSize: target.tileSize });
        const tx = Math.floor(x / tileSize);
        const ty = Math.floor(y / tileSize);
        const tileTarget = this.getSparseRasterTile(target, tx, ty);

        return tileTarget ? this.getRasterAlphaAtPoint(tileTarget, x, y) : 0;
      }

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
      const textureMagFilter = Number.isFinite(options.textureMagFilter)
        ? options.textureMagFilter
        : this.getViewportTextureMagFilter(camera);

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
      this.setRasterTextureSampling(sourceTexture, gl.LINEAR, textureMagFilter);
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

      const captureAfterSnapshot = options.captureAfterSnapshot !== false;
      let target = this.ensureWritableRasterTarget(layer.id, {
        source: options.source || "puppet-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layer.id);
      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layer.id, {
          emit: false,
          source: options.source || "puppet-rasterize",
        }) || target;
      }

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const preferSparseRestore = wasSparseTarget || target.materializedFromSparse === true;
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

      if (
        destinationTarget &&
        destinationTarget !== target &&
        preferSparseRestore
      ) {
        destinationTarget.materializedFromSparse = true;
        destinationTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

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
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      this.markRasterTargetDirty(destinationTarget);

      const rasterizedSnapshot = captureAfterSnapshot
        ? this.createRasterSnapshot(destinationTarget, null, "puppet-rasterize-after")
        : null;

      if (captureAfterSnapshot && !rasterizedSnapshot?.texture) {
        if (needsTargetSwap) {
          this.deleteRasterTargetObject(destinationTarget);
        }

        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      if (needsTargetSwap && !this.replaceRasterTarget(layer.id, destinationTarget, {
        emit: false,
        rect: destinationRect,
        source: options.source || "puppet-rasterize",
      })) {
        this.deleteRasterTargetObject(destinationTarget);
        this.deleteRasterSnapshot(rasterizedSnapshot);
        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          preferSparse: preferSparseRestore,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const sourceBytes = this.estimateRasterTargetBytes(target);
      const afterPreferSparse = Boolean(preferSparseRestore && this.isPaintRasterLayer(layer.id, destinationTarget));
      const finalLiveTarget = afterPreferSparse
        ? this.sparsifyRasterTarget(layer.id, destinationTarget, {
            emit: false,
            source: `${options.source || "puppet-rasterize"}-retile`,
            tileSize: destinationTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || destinationTarget
        : destinationTarget;
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);
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
        this.commitVisualDirtyChange({
          layerId: layer.id,
          sourceRect: targetRect,
          source: options.source || "puppet-rasterize",
          targetRect: destinationRect,
          usePreviewDirtyTiles: true,
        });
      }

      return {
        afterPreferSparse,
        afterSnapshot: rasterizedSnapshot,
        beforePreferSparse: preferSparseRestore,
        beforeSnapshot: sourceSnapshot,
        layerId: layer.id,
        memoryPolicy,
        targetRect: destinationRect ? { ...destinationRect } : null,
      };
    }

    rasterizeLayerEffects(layer, options = {}) {
      if (!this.hasEnabledLayerEffects(layer) || !layer?.id) {
        return null;
      }

      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("effects.rasterize", {
        layerId: layer.id,
        source: options.source || "layer-effects-rasterize",
      }) : null;

      try {
      const captureBeforeSnapshot = options.captureBeforeSnapshot !== false;
      const captureAfterSnapshot = options.captureAfterSnapshot !== false;
      let target = this.ensureWritableRasterTarget(layer.id, {
        source: options.source || "layer-effects-copy-on-write-detach",
      }) || this.rasterTargetsByLayerId.get(layer.id);
      const wasSparseTarget = this.isSparseRasterTarget(target);

      if (wasSparseTarget) {
        target = this.materializeRasterTarget(layer.id, {
          emit: false,
          source: options.source || "layer-effects-rasterize",
        }) || target;
      }

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const beforeSnapshot = captureBeforeSnapshot
        ? this.createRasterSnapshot(target, null, "layer-effects-rasterize-before")
        : null;

      if (captureBeforeSnapshot && !beforeSnapshot?.texture) {
        return null;
      }

      const renderResult = this.getLayerRenderResult(layer, target);
      const renderTexture = renderResult?.texture;
      const targetRect = this.getRasterTargetDocumentRect(target);
      const renderRect = renderResult?.rect || targetRect;
      const previewDirtyRects = this.getTileBasedPreviewDirtyRects(
        [targetRect, renderRect],
        { previewDirtyTileSize: options.previewDirtyTileSize },
      );
      const needsTargetSwap = renderRect && !this.areDocumentRectsEqual(renderRect, targetRect);
      const destinationTarget = needsTargetSwap
        ? this.createRasterTargetForRect(renderRect)
        : target;

      if (
        destinationTarget &&
        destinationTarget !== target &&
        (wasSparseTarget || target.materializedFromSparse === true)
      ) {
        destinationTarget.materializedFromSparse = true;
        destinationTarget.sparseTileSize = target.sparseTileSize || target.tileSize;
      }

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

        if (beforeSnapshot) {
          this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
            emit: false,
            preferSparse: wasSparseTarget,
            source: "layer-effects-rasterize-rollback",
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }

        return null;
      }

      if (needsTargetSwap) {
        this.replaceRasterTarget(layer.id, destinationTarget, {
          emit: false,
          invalidate: false,
          rects: previewDirtyRects,
          source: options.source || "layer-effects-rasterize",
        });
      }

      const finalTarget = needsTargetSwap ? destinationTarget : target;
      const afterSnapshot = captureAfterSnapshot
        ? this.createRasterSnapshot(finalTarget, null, "layer-effects-rasterize-after")
        : null;

      if (captureAfterSnapshot && !afterSnapshot?.texture) {
        if (beforeSnapshot) {
          this.restoreRasterSnapshot(layer.id, beforeSnapshot, {
            emit: false,
            preferSparse: wasSparseTarget,
            source: "layer-effects-rasterize-rollback",
          });
          this.deleteRasterSnapshot(beforeSnapshot);
        }

        return null;
      }

      const shouldRetileFinalTarget = Boolean(
        (wasSparseTarget || finalTarget.materializedFromSparse === true) &&
        this.isPaintRasterLayer(layer.id, finalTarget)
      );
      const finalLiveTarget = shouldRetileFinalTarget
        ? this.sparsifyRasterTarget(layer.id, finalTarget, {
            emit: false,
            source: `${options.source || "layer-effects-rasterize"}-retile`,
            tileSize: finalTarget.sparseTileSize || target.sparseTileSize || target.tileSize,
          }) || finalTarget
        : finalTarget;
      const finalTargetRect = this.getRasterTargetDocumentRect(finalLiveTarget);
      const beforeBytes = this.getRasterRectBytes(beforeSnapshot?.rect);
      const afterBytes = this.getRasterRectBytes(afterSnapshot?.rect);
      const sourceBytes = this.estimateRasterTargetBytes(target);
      const targetBytes = this.estimateRasterTargetBytes(finalLiveTarget);
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
        this.commitVisualDirtyChange({
          layerId: layer.id,
          maxDirtyRects: PREVIEW_DIRTY_MAX_RECTS,
          preserveDirtyRects: true,
          rects: previewDirtyRects,
          source: options.source || "layer-effects-rasterize",
        });
      }

      return {
        afterPreferSparse: shouldRetileFinalTarget,
        afterSnapshot,
        beforePreferSparse: wasSparseTarget || target.materializedFromSparse === true,
        beforeSnapshot,
        layerId: layer.id,
        memoryPolicy,
        previewDirtyRects: previewDirtyRects.map((rect) => ({ ...rect })),
        targetRect: finalTargetRect ? { ...finalTargetRect } : null,
      };
      } finally {
        trace?.end({
          layerId: layer.id,
          source: options.source || "layer-effects-rasterize",
        });
      }
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
      const viewportRenderOverscanCssPx = this.getViewportRenderOverscanCssPx(options);
      const viewportVisibleDocRect = this.resolveCanvasVisibleDocRect(camera, viewportWidth, viewportHeight);
      const viewportRenderRect = this.getViewportRenderRect(
        camera,
        viewportWidth,
        viewportHeight,
        viewportRenderOverscanCssPx,
      );
      const { program, uniforms } = this.programInfo;
      const activeStrokeLayerId = options.activeStrokeLayerId || target.layerId;
      const activeStrokeMode = String(options.activeStrokeMode || "paint").toLowerCase();
      const activeStrokeRect = options.activeStrokeRect || null;
      const activeStrokeClipRects = Array.isArray(options.activeStrokeClipRects) && activeStrokeRect
        ? options.activeStrokeClipRects
            .map((rect) => this.intersectRasterHistoryRects?.(rect, activeStrokeRect))
            .filter(Boolean)
        : null;
      const activeStrokeHasClip = Boolean(
        activeStrokeRect &&
        (
          options.activeStrokeClipRect ||
          activeStrokeClipRects
        )
      );
      const activeStrokeClipRect = activeStrokeHasClip
        ? this.intersectRasterHistoryRects?.(options.activeStrokeClipRect, activeStrokeRect)
        : null;
      const rasterTransformPreview = this.rasterTransformPreview?.texture
        ? this.rasterTransformPreview
        : null;
      const hasArtboardDragPreview = this.hasArtboardDragPreview();
      const staticViewportRenderRect = hasArtboardDragPreview ? null : viewportRenderRect;
      const vectorTextTransformPreviewLayerId = this.vectorTextTransformPreviewLayerId || "";
      const hasActiveEraserStroke = Boolean(options.activeStrokeTexture && activeStrokeMode === "eraser");
      const activeStrokeSelectionMask = hasActiveEraserStroke
        ? options.activeStrokeSelectionMask
        : null;
      const activeStrokeSelectionClipTexture = activeStrokeSelectionMask
        ? this.getActiveStrokeSelectionClipTexture(activeStrokeSelectionMask)
        : null;

      if (!activeStrokeSelectionMask) {
        this.deleteActiveStrokeSelectionClipTexture();
      }

      const orderedLayers = this.getOrderedLayersBottomToTop();
      const artboardResidency = this.resolveAndPublishArtboardResidency({
        activeLayerId: activeStrokeLayerId,
        camera,
        dpr: options.dpr,
        renderRect: viewportRenderRect,
        viewportHeight,
        viewportRect: {
          dpr: options.dpr,
          overscanCssPx: viewportRenderOverscanCssPx,
          renderRect: viewportRenderRect,
          visibleRect: viewportVisibleDocRect,
          zoom: camera.zoom || 1,
        },
        viewportWidth,
        visibleRect: viewportVisibleDocRect,
      });
      const artboardFlatPreviewFallbackIds = this.getArtboardFlatPreviewFallbackIds(artboardResidency, orderedLayers, {
        activeStrokeTexture: Boolean(options.activeStrokeTexture),
      });
      const deferInteractiveResidencyHydration = Boolean(
        options.activeStrokeTexture ||
        options.deferPreviewCacheUpdate === true
      );
      const artboardResidencyHydrated = deferInteractiveResidencyHydration
        ? 0
        : this.hydrateHotArtboardTargets(artboardResidency, orderedLayers, {
            renderRect: viewportRenderRect,
            reason: "draw-to-canvas-artboard-residency",
            skipArtboardIds: artboardFlatPreviewFallbackIds,
          });
      const artboardResidencyMetrics = this.collectArtboardResidencyMetrics(artboardResidency, orderedLayers, {
        camera,
        dpr: options.dpr,
      });
      const renderableLayers = orderedLayers.filter((layer) => layer.visible !== false);
      const hasClippingMasks = orderedLayers.some((layer) => layer?.clippingMask === true);
      const isValidClipBaseLayer = (layer) => Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );
      const clipBaseLayerIds = new Set();
      let pendingClipBaseLayerId = "";

      orderedLayers.forEach((layer) => {
        if (layer?.clippingMask === true) {
          if (pendingClipBaseLayerId) {
            clipBaseLayerIds.add(pendingClipBaseLayerId);
          }
        } else {
          pendingClipBaseLayerId = isValidClipBaseLayer(layer) ? layer.id : "";
        }
      });
      const activeStrokeLayerIndex = renderableLayers.findIndex((layer) => layer?.id === activeStrokeLayerId);
      const activeStrokeLayer = activeStrokeLayerIndex >= 0 ? renderableLayers[activeStrokeLayerIndex] : null;
      const activeStrokeLayerHasBlendMode = Boolean(activeStrokeLayer && this.hasAdvancedLayerBlendMode(activeStrokeLayer));
      const activeStrokeLayerHasEffects = Boolean(activeStrokeLayer && this.hasEnabledLayerEffects(activeStrokeLayer));
      const activeStrokeUsesClippingMask = Boolean(
        options.activeStrokeTexture &&
        hasClippingMasks &&
        activeStrokeLayer?.clippingMask === true
      );
      const activeStrokeDefersLayerEffects = Boolean(
        options.activeStrokeTexture &&
        options.deferPreviewCacheUpdate === true &&
        activeStrokeLayerHasEffects
      );
      const activeStrokeDefersLayerBlend = Boolean(
        options.activeStrokeTexture &&
        options.deferPreviewCacheUpdate === true &&
        activeStrokeLayerHasBlendMode
      );
      const activeStrokeLayerUsesAdvancedCompositing = Boolean(
        activeStrokeLayer &&
        (
          (!activeStrokeDefersLayerBlend && activeStrokeLayerHasBlendMode) ||
          (!activeStrokeDefersLayerEffects && activeStrokeLayerHasEffects) ||
          this.hasPuppetLayerTransform(activeStrokeLayer)
        )
      );
      const activeStrokeNeedsFullStack = Boolean(
        options.activeStrokeTexture &&
        activeStrokeMode !== "eraser" &&
        activeStrokeLayer &&
        (
          activeStrokeLayerUsesAdvancedCompositing ||
          activeStrokeUsesClippingMask
        )
      );
      const activeStrokeNeedsScratchMerge = Boolean(
        options.activeStrokeTexture &&
        activeStrokeMode !== "eraser" &&
        activeStrokeLayer &&
        !activeStrokeHasClip &&
        activeStrokeLayerUsesAdvancedCompositing
      );

      if (!activeStrokeNeedsScratchMerge && this.activeStrokeScratchTarget) {
        this.deleteActiveStrokeScratchTarget();
      }
      const activeStrokeCanOverlayPreview = !options.activeStrokeTexture ||
        (
          activeStrokeLayerIndex >= 0 &&
          !activeStrokeNeedsFullStack &&
          !renderableLayers
            .slice(activeStrokeLayerIndex + 1)
            .some((layer) => this.hasRenderableRasterTarget(this.rasterTargetsByLayerId.get(layer.id)))
        );
      const allowPreviewCache = options.allowPreviewCache === true;
      const previewCacheOptions = {
        camera,
        dpr: options.dpr,
        previewCacheOverscanCssPx: options.previewCacheOverscanCssPx,
        previewCacheScope: options.previewCacheScope,
        viewportHeight,
        viewportWidth,
      };
      const previewCacheDimensions = this.getPreviewCacheDimensions(previewCacheOptions);
      const previewCacheDocumentRect = previewCacheDimensions.documentRect;
      const canUsePreviewCacheAtCurrentZoom = this.shouldUsePreviewCacheForCamera(camera, previewCacheDimensions);
      const canUsePreviewCache = Boolean(
        allowPreviewCache &&
        canUsePreviewCacheAtCurrentZoom &&
        !hasArtboardDragPreview &&
        !rasterTransformPreview &&
        !vectorTextTransformPreviewLayerId &&
        !hasActiveEraserStroke &&
        !activeStrokeNeedsFullStack &&
        activeStrokeCanOverlayPreview
      );
      const deferPreviewCacheUpdate = Boolean(
        options.deferPreviewCacheUpdate === true ||
        options.activeStrokeTexture
      );
      const viewportCullingDebug = this.isViewportCullingDebugEnabled(options);
      const viewportLayerCullingEnabled = this.isViewportLayerCullingEnabled(options);
      const viewportLayerCullingMeasured = this.isViewportLayerCullingAuditEnabled(options);
      const viewportCullingStats = this.createViewportCullingStats({
        camera,
        debug: viewportCullingDebug,
        layerCullingEnabled: viewportLayerCullingEnabled,
        layerCullingMeasured: viewportLayerCullingMeasured,
        overscanCssPx: viewportRenderOverscanCssPx,
        renderRect: viewportRenderRect,
        source: "drawToCanvas",
        viewportHeight,
        viewportWidth,
        visibleRect: viewportVisibleDocRect,
      });

      viewportCullingStats.layers.total = orderedLayers.length;
      viewportCullingStats.layers.visible = renderableLayers.length;
      viewportCullingStats.artboardResidency = artboardResidency
        ? {
            activeArtboardId: artboardResidency.activeArtboardId || "",
            cacheArtboardIds: [...(artboardResidency.cacheArtboardIds || [])],
            coldArtboardIds: [...(artboardResidency.coldArtboardIds || [])],
            flatPreviewFallbackArtboardIds: Array.from(artboardFlatPreviewFallbackIds),
            hotArtboardIds: [...(artboardResidency.hotArtboardIds || [])],
            hydratedLayerCount: artboardResidencyHydrated,
            metrics: artboardResidencyMetrics,
            prefetchArtboardIds: [...(artboardResidency.prefetchArtboardIds || [])],
            pressure: artboardResidencyMetrics?.budget?.pressure || "ok",
            visibleArtboardIds: [...(artboardResidency.visibleArtboardIds || [])],
            warmArtboardIds: [...(artboardResidency.warmArtboardIds || [])],
          }
        : null;
      const trace = namespace.PerfTrace?.enabled ? namespace.PerfTrace.begin("canvas.draw", {
        activeStrokeDefersLayerBlend,
        activeStrokeDefersLayerEffects,
        activeStroke: Boolean(options.activeStrokeTexture),
        canUsePreviewCache,
        deferPreviewCacheUpdate,
        layers: renderableLayers.length,
        zoom: camera.zoom || 1,
      }) : null;

      try {
      let didDrawActiveStroke = false;
      let currentMaskTexture = null;
      let currentMaskRect = null;
      let currentMaskClipRect = null;
      let currentMaskClipRects = null;
      let currentPreviewCutRect = null;
      let canvasCompositeState = null;
      let preserveCompositeOutsideScissor = false;
      const viewportTextureMagFilter = this.getViewportTextureMagFilter(camera);
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const getViewportScissorForDocumentRect = (docRect) => {
        if (!docRect) {
          return null;
        }

        const zoom = camera.zoom || 1;
        const left = (camera.x || 0) + docRect.x * zoom;
        const top = (camera.y || 0) + docRect.y * zoom;
        const right = (camera.x || 0) + (docRect.x + docRect.width) * zoom;
        const bottom = (camera.y || 0) + (docRect.y + docRect.height) * zoom;
        const clippedLeft = Math.max(0, Math.floor(Math.min(left, right)));
        const clippedTop = Math.max(0, Math.floor(Math.min(top, bottom)));
        const clippedRight = Math.min(viewportWidth, Math.ceil(Math.max(left, right)));
        const clippedBottom = Math.min(viewportHeight, Math.ceil(Math.max(top, bottom)));

        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
          return null;
        }

        return {
          height: clippedBottom - clippedTop,
          width: clippedRight - clippedLeft,
          x: clippedLeft,
          y: viewportHeight - clippedBottom,
        };
      };
      let currentViewportScissor = null;
      const intersectViewportScissors = (first, second) => {
        if (!first || !second) {
          return first || second || null;
        }

        const x0 = Math.max(first.x, second.x);
        const y0 = Math.max(first.y, second.y);
        const x1 = Math.min(first.x + first.width, second.x + second.width);
        const y1 = Math.min(first.y + first.height, second.y + second.height);

        return x1 > x0 && y1 > y0
          ? {
              height: y1 - y0,
              width: x1 - x0,
              x: x0,
              y: y0,
            }
          : null;
      };
      const restoreViewportScissor = (scissor) => {
        currentViewportScissor = scissor;

        if (scissor) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
        } else {
          gl.disable(gl.SCISSOR_TEST);
        }
      };
      const withViewportScissor = (scissor, callback) => {
        if (!scissor) {
          callback();
          return;
        }

        const previousScissor = currentViewportScissor;
        const nextScissor = intersectViewportScissors(previousScissor, scissor);

        if (!nextScissor) {
          return;
        }

        const previousPreserveCompositeOutsideScissor = preserveCompositeOutsideScissor;

        restoreViewportScissor(nextScissor);
        preserveCompositeOutsideScissor = preserveCompositeOutsideScissor || Boolean(canvasCompositeState);
        try {
          callback();
        } finally {
          preserveCompositeOutsideScissor = previousPreserveCompositeOutsideScissor;
          restoreViewportScissor(previousScissor);
        }
      };
      const withLayerArtboardClip = (layer, callback) => {
        const artboardRect = this.getLayerArtboardVisualRect(layer);

        viewportCullingStats.artboardClips.tested += 1;

        if (!artboardRect) {
          viewportCullingStats.artboardClips.drawn += 1;
          callback();
          return;
        }

        if (viewportRenderRect && !this.documentRectsIntersect(artboardRect, viewportRenderRect)) {
          viewportCullingStats.artboardClips.skippedOutsideRenderRect += 1;
          return;
        }

        const artboardScissor = getViewportScissorForDocumentRect(artboardRect);

        if (!artboardScissor) {
          viewportCullingStats.artboardClips.skippedViewportScissor += 1;
          return;
        }

        viewportCullingStats.artboardClips.drawn += 1;
        withViewportScissor(artboardScissor, callback);
      };
      const withAllArtboardClips = (callback) => {
        const allArtboardRects = (namespace.getDocumentArtboards?.() || [])
          .map((artboard) => this.normalizeTransformArtboardRect(artboard))
          .filter(Boolean);

        if (allArtboardRects.length === 0) {
          callback();
          return;
        }

        const artboardRects = staticViewportRenderRect
          ? allArtboardRects.filter((artboardRect) => this.documentRectsIntersect(artboardRect, staticViewportRenderRect))
          : allArtboardRects;

        viewportCullingStats.artboardClips.tested += allArtboardRects.length;

        if (staticViewportRenderRect) {
          viewportCullingStats.artboardClips.skippedOutsideRenderRect += Math.max(0, allArtboardRects.length - artboardRects.length);
        }

        if (artboardRects.length === 0) {
          return;
        }

        artboardRects.forEach((artboardRect) => {
          const artboardScissor = getViewportScissorForDocumentRect(artboardRect);

          if (artboardScissor) {
            viewportCullingStats.artboardClips.drawn += 1;
            withViewportScissor(artboardScissor, callback);
          } else {
            viewportCullingStats.artboardClips.skippedViewportScissor += 1;
          }
        });
      };
      const withActiveStrokeClip = (callback) => {
        const clipRects = activeStrokeClipRects?.length
          ? activeStrokeClipRects
          : activeStrokeClipRect
            ? [activeStrokeClipRect]
            : null;

        if (activeStrokeHasClip && !clipRects?.length) {
          return;
        }

        if (!clipRects) {
          callback();
          return;
        }

        clipRects.forEach((clipRect) => {
          const scissor = getViewportScissorForDocumentRect(clipRect);

          if (!scissor) {
            return;
          }

          withViewportScissor(scissor, callback);
        });
      };
      const setMaskClipUniforms = (uniformSet, clipRect = null, clipRects = null) => {
        const rects = Array.isArray(clipRects)
          ? clipRects.slice(0, 32)
          : [];

        if (rects.length > 0) {
          const values = new Float32Array(32 * 4);

          rects.forEach((rect, index) => {
            values[index * 4] = rect.x;
            values[index * 4 + 1] = rect.y;
            values[index * 4 + 2] = rect.width;
            values[index * 4 + 3] = rect.height;
          });

          gl.uniform1f(uniformSet.maskClipMode, 1.0);
          gl.uniform4f(uniformSet.maskClipRect, 0, 0, 0, 0);
          gl.uniform1i(uniformSet.maskClipRectCount, rects.length);
          gl.uniform4fv(uniformSet.maskClipRects, values);
          return;
        }

        if (clipRect) {
          gl.uniform1f(uniformSet.maskClipMode, 1.0);
          gl.uniform4f(
            uniformSet.maskClipRect,
            clipRect.x,
            clipRect.y,
            clipRect.width,
            clipRect.height,
          );
          gl.uniform1i(uniformSet.maskClipRectCount, 0);
          return;
        }

        gl.uniform1f(uniformSet.maskClipMode, 0.0);
        gl.uniform4f(uniformSet.maskClipRect, 0, 0, 0, 0);
        gl.uniform1i(uniformSet.maskClipRectCount, 0);
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
          const clipOrigin = this.getClipBaseOrigin(clipBase);

          gl.activeTexture(gl.TEXTURE2);
          this.setRasterTextureSampling(clipBase.target.texture, gl.LINEAR, viewportTextureMagFilter);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1i(uniforms.clipTexture, 2);
          gl.uniform1f(uniforms.clipMode, 1.0);
          gl.uniform1f(uniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            uniforms.clipOrigin,
            clipOrigin.x,
            clipOrigin.y,
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

        if (texture === this.previewTexture) {
          this.setRasterTextureSampling(texture, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
        } else {
          this.setRasterTextureSampling(texture, gl.LINEAR, viewportTextureMagFilter);
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

        if (!canvasCompositeState?.read?.texture || !canvasCompositeState?.write?.framebuffer) {
          drawTexture(texture, opacity, rect, clipBase);
          return;
        }

        if (preserveCompositeOutsideScissor) {
          gl.disable(gl.SCISSOR_TEST);
          this.drawScreenTexture(canvasCompositeState.read.texture, {
            blend: false,
            framebuffer: canvasCompositeState.write.framebuffer,
            viewportHeight,
            viewportWidth,
          });
          gl.enable(gl.SCISSOR_TEST);
        }

        this.drawLayerCompositeTexture({
          backdropTexture: canvasCompositeState.read.texture,
          blendModeId,
          camera,
          clipBase,
          documentHeight: target.height,
          documentWidth: target.width,
          framebuffer: canvasCompositeState.write.framebuffer,
          maskClipRect: currentMaskClipRect,
          maskClipRects: currentMaskClipRects,
          maskRect: currentMaskRect,
          maskTexture: currentMaskTexture,
          opacity,
          previewCutRect: currentPreviewCutRect,
          rect,
          texture,
          textureMagFilter: viewportTextureMagFilter,
          viewportHeight,
          viewportWidth,
        });
        canvasCompositeState = this.swapLayerComposite(canvasCompositeState);
        bindArtboardProgram();
      };
      const bindArtboardProgram = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, canvasCompositeState?.read?.framebuffer || null);
        gl.viewport(0, 0, viewportWidth, viewportHeight);
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1i(uniforms.selectionClipTexture, 3);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
        gl.uniform1f(uniforms.maskClipMode, 0.0);
        gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipOrigin, 0, 0);
        gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.selectionClipMode, 0.0);
        gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      };
      const drawArtboardFlatPreviewFallbacks = () => {
        if (!artboardFlatPreviewFallbackIds.size) {
          return 0;
        }

        let drawnCount = 0;

        artboardFlatPreviewFallbackIds.forEach((artboardId) => {
          const preview = this.getArtboardFlatPreview(artboardId);
          const scissor = preview ? getViewportScissorForDocumentRect(preview.rect) : null;

          if (!preview?.texture || !scissor) {
            return;
          }

          withViewportScissor(scissor, () => {
            drawTexture(preview.texture, 1, preview.rect);
            drawnCount += 1;
          });
        });

        return drawnCount;
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
          framebuffer: canvasCompositeState?.read?.framebuffer || null,
          opacity: rasterTransformPreview.opacity * layerOpacity,
          textureFilter: gl.LINEAR,
          viewportHeight,
          viewportWidth,
        };

        withAllArtboardClips(() => {
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
        });

        bindArtboardProgram();
      };
      const didUpdatePreviewCache = canUsePreviewCache
        ? (
            deferPreviewCacheUpdate
              ? Boolean(this.previewCacheReady && !this.previewCacheDirty && this.previewTexture)
              : this.updatePreviewCacheIfNeeded(previewCacheOptions)
          )
        : false;
      const usePreviewCache = canUsePreviewCache && didUpdatePreviewCache && this.previewCacheReady;
      const canvasNeedsLayerComposite = !usePreviewCache && orderedLayers.some((layer) =>
        layer?.visible !== false &&
        !(activeStrokeDefersLayerBlend && layer?.id === activeStrokeLayerId) &&
        this.hasAdvancedLayerBlendMode(layer)
      );

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
        const cacheDocRect = this.previewCacheDocumentRect || previewCacheDocumentRect;
        const exactCacheDocRect = this.getPreviewCacheExactDocumentRect(cacheDocRect);

        drawTexture(this.previewTexture, 1, exactCacheDocRect);

        if (options.activeStrokeTexture && activeStrokeMode !== "eraser") {
          withLayerArtboardClip(activeStrokeLayer, () => {
            withActiveStrokeClip(() => {
              drawTexture(options.activeStrokeTexture, activeStrokeOpacity, activeStrokeRect);
            });
          });
          didDrawActiveStroke = true;
        }
      } else {
        if (canvasNeedsLayerComposite) {
          canvasCompositeState = this.beginLayerComposite(viewportWidth, viewportHeight);
          bindArtboardProgram();
        }

        viewportCullingStats.artboardResidency.flatPreviewDrawnCount = drawArtboardFlatPreviewFallbacks();

        let currentClipBase = null;

        for (const layer of orderedLayers) {
          viewportCullingStats.layers.considered += 1;
          const rawLayerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const layerArtboardId = this.getLayerArtboardId(layer);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const isActiveStrokeLayer = options.activeStrokeTexture && layer.id === activeStrokeLayerId;
          const isRasterTransformPreviewLayer = rasterTransformPreview?.layerId === layer.id;
          const isVectorTextTransformPreviewLayer = vectorTextTransformPreviewLayerId === layer.id;
          const eraserMaskTexture = isActiveStrokeLayer && activeStrokeMode === "eraser"
            ? options.activeStrokeTexture
            : null;
          const clipBase = isClippingLayer ? currentClipBase : null;
          const skipLayerEffectsForInteractiveStroke = Boolean(
            isActiveStrokeLayer &&
            activeStrokeDefersLayerEffects &&
            activeStrokeMode !== "eraser"
          );
          const skipLayerBlendForInteractiveStroke = Boolean(
            isActiveStrokeLayer &&
            activeStrokeDefersLayerBlend &&
            activeStrokeMode !== "eraser"
          );
          let layerTarget = this.getRenderableLayerTarget(layer, rawLayerTarget, {
            forceSingleTexture: Boolean(eraserMaskTexture),
            skipLayerEffects: skipLayerEffectsForInteractiveStroke,
            source: "canvas-sparse-layer",
          });
          const canCullSparseTilesForViewport = Boolean(
            staticViewportRenderRect &&
            !isClippingLayer &&
            !isActiveStrokeLayer &&
            !isRasterTransformPreviewLayer &&
            !isVectorTextTransformPreviewLayer &&
            !eraserMaskTexture &&
            !rasterTransformPreview &&
            !vectorTextTransformPreviewLayerId &&
            !this.hasAdvancedLayerBlendMode(layer) &&
            !this.hasEnabledLayerEffects(layer) &&
            !this.hasPuppetLayerTransform(layer)
          );
          const viewportLayerRenderOptions = {
            cullSparseTiles: canCullSparseTilesForViewport,
            cullingStats: viewportCullingStats,
            renderRect: staticViewportRenderRect,
            skipLayerEffects: skipLayerEffectsForInteractiveStroke,
          };

          if (layerArtboardId && artboardFlatPreviewFallbackIds.has(layerArtboardId)) {
            if (!isClippingLayer) {
              currentClipBase = null;
            }

            viewportCullingStats.layers.skippedFlatPreviewFallback += 1;
            continue;
          }

          if (!isClippingLayer) {
            const shouldMaterializeClipBase = hasClippingMasks && clipBaseLayerIds.has(layer.id);
            const baseTarget = shouldMaterializeClipBase
              ? this.getRenderableLayerTarget(layer, layerTarget, {
                  forceSingleTexture: true,
                  source: "canvas-clip-base",
                })
              : layerTarget;

            if (shouldMaterializeClipBase) {
              layerTarget = baseTarget;
            }

            currentClipBase = isValidClipBaseLayer(layer)
              ? this.createClipBaseForLayer(layer, baseTarget, layer.visible !== false)
              : null;
          }

          if (layer.visible === false) {
            viewportCullingStats.layers.skippedInvisible += 1;
            continue;
          }

          if (isVectorTextTransformPreviewLayer) {
            if (!isClippingLayer) {
              currentClipBase = null;
            }

            viewportCullingStats.layers.skippedVectorTransformPreview += 1;
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !clipBase?.target?.texture)) {
            viewportCullingStats.layers.skippedClippingBaseMissing += 1;
            continue;
          }

          if (viewportLayerCullingMeasured) {
            const layerCullDecision = this.getViewportLayerCullDecision(layer, layerTarget, {
              clipBaseLayerIds,
              eraserMaskTexture,
              hasArtboardDragPreview,
              isActiveStrokeLayer,
              isClippingLayer,
              isRasterTransformPreviewLayer,
              isVectorTextTransformPreviewLayer,
              rasterTransformPreview,
              renderRect: staticViewportRenderRect,
              vectorTextTransformPreviewLayerId,
            });
            const shouldCullLayer = Boolean(viewportLayerCullingEnabled && layerCullDecision.shouldCull);

            this.recordViewportLayerCullDecision(viewportCullingStats, layerCullDecision, shouldCullLayer);

            if (shouldCullLayer) {
              continue;
            }
          }

          viewportCullingStats.layers.passedCull += 1;

          if (isRasterTransformPreviewLayer) {
            setPreviewCut(rasterTransformPreview.sourceRect);
          }

          if (layerTarget?.texture) {
            viewportCullingStats.layers.drawPasses += 1;
            let renderTarget = layerTarget;
            let didMergeActiveStroke = false;

            if (isActiveStrokeLayer && activeStrokeNeedsScratchMerge) {
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

            const blendModeId = skipLayerBlendForInteractiveStroke ? 0 : this.getLayerBlendModeId(layer);

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
              setMaskClipUniforms(uniforms, activeStrokeClipRect, activeStrokeClipRects);
              if (activeStrokeSelectionClipTexture && activeStrokeSelectionMask?.rect) {
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, activeStrokeSelectionClipTexture);
                gl.uniform1f(uniforms.selectionClipMode, 1.0);
                gl.uniform4f(
                  uniforms.selectionClipRect,
                  activeStrokeSelectionMask.rect.x,
                  activeStrokeSelectionMask.rect.y,
                  activeStrokeSelectionMask.rect.width,
                  activeStrokeSelectionMask.rect.height,
                );
              } else {
                gl.uniform1f(uniforms.selectionClipMode, 0.0);
                gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
              }
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = eraserMaskTexture;
              currentMaskRect = activeStrokeRect || null;
              currentMaskClipRect = activeStrokeClipRect || null;
              currentMaskClipRects = activeStrokeClipRects || null;
            }

            for (const renderResult of this.getLayerRenderResults(layer, renderTarget, viewportLayerRenderOptions)) {
              const layerTexture = renderResult?.texture;
              const layerRect = this.getArtboardDragVisualRect(layer, renderResult?.rect || null, renderTarget);

              if (!layerTexture) {
                continue;
              }

              if (layerTexture !== renderTarget.texture) {
                bindArtboardProgram();
              }

              withLayerArtboardClip(layer, () => {
                if (this.hasPuppetLayerTransform(layer) && !eraserMaskTexture) {
                  if (isClippingLayer) {
                    drawBlendTexture(layerTexture, opacity, layerRect, clipBase, blendModeId);
                  } else {
                    const visualRenderResult = layerRect
                      ? { ...renderResult, rect: layerRect }
                      : renderResult;
                    const puppetTarget = this.getPuppetVisualTarget(renderTarget, visualRenderResult);
                    const didDrawPuppet = this.drawPuppetLayer(this.getArtboardDragVisualLayer(layer), puppetTarget, opacity, {
                      camera,
                      sourceTexture: layerTexture,
                      textureMagFilter: viewportTextureMagFilter,
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
              });
            }

            if (eraserMaskTexture) {
              gl.uniform1f(uniforms.maskMode, 0.0);
              gl.uniform1f(uniforms.maskRectMode, 0.0);
              setMaskClipUniforms(uniforms);
              gl.uniform1f(uniforms.selectionClipMode, 0.0);
              gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE0);
              currentMaskTexture = null;
              currentMaskRect = null;
              currentMaskClipRect = null;
              currentMaskClipRects = null;
              didDrawActiveStroke = true;
            }

            if (didMergeActiveStroke) {
              currentMaskTexture = null;
              currentMaskRect = null;
              currentMaskClipRect = null;
              currentMaskClipRects = null;
            }
          } else if (this.isSparseRasterTarget(layerTarget)) {
            viewportCullingStats.layers.drawPasses += 1;
            const blendModeId = skipLayerBlendForInteractiveStroke ? 0 : this.getLayerBlendModeId(layer);

            for (const renderResult of this.getLayerRenderResults(layer, layerTarget, viewportLayerRenderOptions)) {
              const layerTexture = renderResult?.texture;

              if (!layerTexture) {
                continue;
              }

              withLayerArtboardClip(layer, () => {
                drawBlendTexture(
                  layerTexture,
                  opacity,
                  this.getArtboardDragVisualRect(layer, renderResult.rect || null, layerTarget),
                  clipBase,
                  blendModeId,
                );
              });
            }
          }

          if (isRasterTransformPreviewLayer) {
            setPreviewCut(null);
          }

          if (isRasterTransformPreviewLayer) {
            drawRasterTransformPreview(opacity);
          }

          if (isActiveStrokeLayer && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
            withLayerArtboardClip(layer, () => {
              withActiveStrokeClip(() => {
                drawBlendTexture(
                  options.activeStrokeTexture,
                  opacity,
                  activeStrokeRect,
                  clipBase,
                  this.getLayerBlendModeId(layer),
                );
              });
            });
            didDrawActiveStroke = true;
          }
        }
      }

      if (options.activeStrokeTexture && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          withLayerArtboardClip(activeStrokeLayer, () => {
            withActiveStrokeClip(() => {
              drawTexture(options.activeStrokeTexture, 1.0, activeStrokeRect);
            });
          });
        }
      }

      if (canvasCompositeState?.read?.texture) {
        this.drawScreenTexture(canvasCompositeState.read.texture, {
          blend: true,
          framebuffer: null,
          viewportHeight,
          viewportWidth,
        });
        canvasCompositeState = null;
        bindArtboardProgram();
      }

      // Pass 2: griglia pixel sopra tutto, ma solo oltre il 1000%.
      // Sotto quella soglia non disegniamo proprio il pass, evitando overlay bianchi a zoom out.
      if (this.shouldDrawPixelGrid(camera)) {
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.gridMode, 1.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform1f(uniforms.gridMode, 0.0);
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      } finally {
        trace?.end({
          activeStroke: Boolean(options.activeStrokeTexture),
          activeStrokeScratchMerge: Boolean(activeStrokeNeedsScratchMerge),
          canUsePreviewCache,
          layers: renderableLayers.length,
          layersCulled: viewportCullingStats.layers.safelyCulled,
          sparseTilesSkipped: viewportCullingStats.sparseTiles.skippedOutsideRenderRect,
        });
        this.scheduleArtboardResidencyMaintenance(artboardResidency, {
          activeLayerId: activeStrokeLayerId,
          activeStrokeTexture: Boolean(options.activeStrokeTexture),
          camera,
          deferPreviewCacheUpdate,
          dpr: options.dpr,
          metrics: artboardResidencyMetrics,
          orderedLayers,
          viewportHeight,
          viewportWidth,
        });
        this.finalizeViewportCullingStats(viewportCullingStats);
      }
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;
      this.cancelArtboardResidencyIdleTimer();
      this.layerModel?.removeEventListener?.("change", this.handleLayerModelChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.removeEventListener("cbo:history-change", this.handleHistoryChange);

      this.deleteGaussianBlurResources();
      this.deleteMotionBlurResources();
      this.deleteFieldBlurResources();
      this.deleteRadialBlurResources();
      this.deleteGrainResources();
      this.deleteNoiseResources();
      this.deleteThresholdResources();
      this.deleteCurvesResources();
      this.deleteActiveStrokeScratchTarget();
      this.deleteActiveStrokeSelectionClipTexture();
      this.deleteLayerCompositeResources();
      this.deletePreviewCache();
      this.deleteAllArtboardFlatPreviews("dispose");

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
