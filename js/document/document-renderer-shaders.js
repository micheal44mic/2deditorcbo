(function registerDocumentRendererShaders(namespace) {
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
uniform mat3 u_clipDestToSourceUv;
uniform vec4 u_clipSourceUvRect;
uniform vec2 u_drawOrigin;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;
uniform float u_selectionClipMode;
uniform vec4 u_selectionClipRect;

in vec2 v_uv;
in vec2 v_documentPixel;

out vec4 outColor;

bool isInsideUnitRect(vec2 point) {
  return point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0;
}

float sampleClipAlpha(vec2 documentPixel) {
  if (u_clipMode <= 0.5) {
    return 1.0;
  }

  if (u_clipMode > 1.5) {
    vec3 mapped = u_clipDestToSourceUv * vec3(documentPixel, 1.0);

    if (abs(mapped.z) < 0.000001) {
      return 0.0;
    }

    vec2 unitUv = mapped.xy / mapped.z;

    if (!isInsideUnitRect(unitUv)) {
      return 0.0;
    }

    vec2 sourceUnitUv = u_clipSourceUvRect.xy + unitUv * u_clipSourceUvRect.zw;

    return texture(u_clipTexture, vec2(sourceUnitUv.x, 1.0 - sourceUnitUv.y)).a *
      clamp(u_clipOpacity, 0.0, 1.0);
  }

  vec2 clipLocalPixel = documentPixel - u_clipOrigin;
  vec2 clipUv = vec2(
    clipLocalPixel.x / max(u_clipTextureSize.x, 1.0),
    1.0 - clipLocalPixel.y / max(u_clipTextureSize.y, 1.0)
  );

  if (!isInsideUnitRect(clipUv)) {
    return 0.0;
  }

  return texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
}

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
      color *= sampleClipAlpha(globalDocPixel);
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
uniform sampler2D u_clipTexture;
uniform mat3 u_destToSourceUv;
uniform vec4 u_sourceUvRect;
uniform vec4 u_quadEdges[4];
uniform float u_edgeFeatherPixels;
uniform float u_opacity;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipOrigin;
uniform vec2 u_clipTextureSize;
uniform mat3 u_clipDestToSourceUv;
uniform vec4 u_clipSourceUvRect;

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

bool isInsideUnitRect(vec2 point) {
  return point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0;
}

float sampleClipAlpha(vec2 documentPixel) {
  if (u_clipMode <= 0.5) {
    return 1.0;
  }

  if (u_clipMode > 1.5) {
    vec3 mapped = u_clipDestToSourceUv * vec3(documentPixel, 1.0);

    if (abs(mapped.z) < 0.000001) {
      return 0.0;
    }

    vec2 unitUv = mapped.xy / mapped.z;

    if (!isInsideUnitRect(unitUv)) {
      return 0.0;
    }

    vec2 sourceUnitUv = u_clipSourceUvRect.xy + unitUv * u_clipSourceUvRect.zw;

    return texture(u_clipTexture, vec2(sourceUnitUv.x, 1.0 - sourceUnitUv.y)).a *
      clamp(u_clipOpacity, 0.0, 1.0);
  }

  vec2 clipLocalPixel = documentPixel - u_clipOrigin;
  vec2 clipUv = vec2(
    clipLocalPixel.x / max(u_clipTextureSize.x, 1.0),
    1.0 - clipLocalPixel.y / max(u_clipTextureSize.y, 1.0)
  );

  if (!isInsideUnitRect(clipUv)) {
    return 0.0;
  }

  return texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
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
  vec2 sourceUnitUv = u_sourceUvRect.xy + clampedUnitUv * u_sourceUvRect.zw;
  vec2 uv = vec2(sourceUnitUv.x, 1.0 - sourceUnitUv.y);
  float clipAlpha = sampleClipAlpha(v_destPixel);

  outColor = texture(u_texture, uv) * u_opacity * coverage * clipAlpha;
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
uniform mat3 u_clipDestToSourceUv;
uniform vec4 u_clipSourceUvRect;
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

float sampleClipAlpha(vec2 documentPixel) {
  if (u_clipMode <= 0.5) {
    return 1.0;
  }

  if (u_clipMode > 1.5) {
    vec3 mapped = u_clipDestToSourceUv * vec3(documentPixel, 1.0);

    if (abs(mapped.z) < 0.000001) {
      return 0.0;
    }

    vec2 unitUv = mapped.xy / mapped.z;

    if (!isInsideUnitRect(unitUv)) {
      return 0.0;
    }

    vec2 sourceUnitUv = u_clipSourceUvRect.xy + unitUv * u_clipSourceUvRect.zw;

    return texture(u_clipTexture, vec2(sourceUnitUv.x, 1.0 - sourceUnitUv.y)).a *
      clamp(u_clipOpacity, 0.0, 1.0);
  }

  vec2 clipLocalPixel = documentPixel - u_clipOrigin;
  vec2 clipUv = vec2(
    clipLocalPixel.x / max(u_clipTextureSize.x, 1.0),
    1.0 - clipLocalPixel.y / max(u_clipTextureSize.y, 1.0)
  );

  if (!isInsideUnitRect(clipUv)) {
    return 0.0;
  }

  return texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
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
    source *= sampleClipAlpha(globalDocPixel);
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


  namespace.DocumentRendererShaders = Object.freeze({
    WEBGL2_CONTEXT_ATTRIBUTES,
    ARTBOARD_VERTEX_SHADER_SOURCE,
    ARTBOARD_FRAGMENT_SHADER_SOURCE,
    PUPPET_VERTEX_SHADER_SOURCE,
    PUPPET_FRAGMENT_SHADER_SOURCE,
    TEXTURED_QUAD_VERTEX_SHADER_SOURCE,
    TEXTURED_QUAD_EDGE_AA_FRAGMENT_SHADER_SOURCE,
    PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE,
    PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE,
    GAUSSIAN_BLUR_VERTEX_SHADER_SOURCE,
    GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE,
    MOTION_BLUR_VERTEX_SHADER_SOURCE,
    MOTION_BLUR_FRAGMENT_SHADER_SOURCE,
    FIELD_BLUR_VERTEX_SHADER_SOURCE,
    FIELD_BLUR_FRAGMENT_SHADER_SOURCE,
    RADIAL_BLUR_VERTEX_SHADER_SOURCE,
    RADIAL_BLUR_FRAGMENT_SHADER_SOURCE,
    GRAIN_FRAGMENT_SHADER_SOURCE,
    NOISE_FRAGMENT_SHADER_SOURCE,
    THRESHOLD_FRAGMENT_SHADER_SOURCE,
    CURVES_FRAGMENT_SHADER_SOURCE,
    LAYER_COMPOSITE_VERTEX_SHADER_SOURCE,
    LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE,
  });
})(window.CBO = window.CBO || {});
