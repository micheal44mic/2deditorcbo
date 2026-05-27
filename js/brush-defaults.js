window.CBO = window.CBO || {};

(function registerBrushDefaults(namespace) {
  const defaultShapeAlphaSrc = namespace.defaultShapeAlpha?.src || "./data/brush-shape-alpha.png";
  const defaultShapeAlphaName = namespace.defaultShapeAlpha?.name || "SHAPE ALPHA";
  const defaultGrainTextureSrc = namespace.defaultGrainTexture?.src || "./data/pastel-pencil-grain-texture.png";
  const defaultGrainTextureName = namespace.defaultGrainTexture?.name || "PASTEL PENCIL GRAIN";
  const defaultTaperMinDistance = 247;
  const brushSizeMax = 500;
  const minimumSpacing = 0.01;
  const taperTipRealMin = 0.15;
  const grainModeValues = new Set(["moving", "texturized"]);
  const grainBlendModeValues = Object.freeze([
    "multiply",
    "darken",
    "linear-burn",
    "overlay",
    "lighten",
    "difference",
  ]);
  const grainBlendModeValueSet = new Set(grainBlendModeValues);
  const renderingModeValues = Object.freeze([
    "light-glaze",
    "uniform-glaze",
    "intense-glaze",
    "heavy-glaze",
    "uniform-blending",
    "intense-blending",
  ]);
  const renderingModeValueSet = new Set(renderingModeValues);
  const burntEdgesModeValues = Object.freeze(["multiply", "color-burn", "linear-burn"]);
  const burntEdgesModeValueSet = new Set(burntEdgesModeValues);
  const grainTexturizedMinTextureScale = 0.05;

  const settings = Object.freeze({
    radius: 18,
    opacity: 0.92,
    renderingMode: "light-glaze",
    flow: 1,
    wetEdges: 0,
    burntEdges: 0,
    burntEdgesMode: "linear-burn",
    alphaThresholdEnabled: false,
    alphaThreshold: 0.5,
    spacing: 0.18,
    smoothing: 0,
    streamLineAmount: 0,
    streamLinePressure: 0,
    stabilizationAmount: 0,
    motionFilteringAmount: 0,
    motionFilteringExpression: 0,
    spacingJitter: 0,
    jitterLateral: 0,
    jitterLinear: 0,
    fallOff: 0,
    velocityPressureEnabled: false,
    pencilInputVersion: 2,
    penPressureSize: 0,
    penPressureOpacity: 0,
    penTiltSize: 0,
    penTiltRotation: 0,
    pencilPressureCurveLow: 0,
    pencilPressureCurveMid: 0.5,
    pencilPressureCurveHigh: 1,
    pencilPressureSize: 0,
    pencilPressureOpacity: 0,
    pencilPressureFlow: 0,
    pencilPressureBleed: 0,
    pencilTiltTrigger: 45,
    pencilTiltOpacity: 0,
    pencilTiltGradation: 0,
    pencilTiltBleed: 0,
    pencilTiltSize: 0,
    pencilTiltSizeCompression: false,
    pencilTiltRotation: 0,
    pencilBarrelSize: 0,
    pencilBarrelOpacity: 0,
    pencilBarrelBleed: 0,
    pencilBarrelRelativeToStroke: true,
    taperStart: 0,
    taperEnd: 0,
    taperLinkSizes: false,
    taperSize: 1,
    taperOpacity: 0,
    taperPressure: 0,
    taperMinDistance: defaultTaperMinDistance,
    taperMinDistanceEnabled: false,
    taperTip: 0.5,
    taperTipAnimation: true,
    shapeAlphaSrc: defaultShapeAlphaSrc,
    shapeAlphaName: defaultShapeAlphaName,
    shapeRotation: 0,
    shapeScatter: 0,
    shapeCount: 1,
    shapeCountJitter: 0,
    shapeRandomized: false,
    shapeFlipX: false,
    shapeFlipY: false,
    grainEnabled: true,
    grainTextureSrc: defaultGrainTextureSrc,
    grainTextureName: defaultGrainTextureName,
    grainMode: "texturized",
    grainBlendMode: "multiply",
    grainBrightness: 0,
    grainContrast: 0,
    grainTexturizedScale: 1,
    grainTexturizedDepth: 1,
    grainMovingMovement: 0,
    grainMovingScale: 1,
    grainMovingZoom: 0,
    grainMovingRotation: 0,
    grainMovingDepth: 1,
    grainMovingDepthMinimum: 0,
    grainMovingDepthJitter: 0,
    grainMovingOffsetJitter: true,
    grainScale: 1,
    grainRotation: 0,
    grainStrength: 1,
    grainInvert: false,
    stampColorHueJitter: 0,
    stampColorSaturationJitter: 0,
    stampColorLightnessJitter: 0,
    stampColorDarknessJitter: 0,
    stampColorSecondaryJitter: 0,
    strokeColorHueJitter: 0,
    strokeColorSaturationJitter: 0,
    strokeColorLightnessJitter: 0,
    strokeColorDarknessJitter: 0,
    strokeColorSecondaryJitter: 0,
    wetDilution: 0,
    wetCharge: 1,
    wetAttack: 1,
    wetnessJitter: 0,
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  function normalize01(value, fallback = 1) {
    const number = Number(value);

    return Number.isFinite(number) ? clamp01(number) : fallback;
  }

  function normalizeRange(value, fallback, min, max) {
    const number = Number(value);

    return Number.isFinite(number) ? clamp(number, min, max) : fallback;
  }

  function normalizeSigned(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? clamp(number, -1, 1) : fallback;
  }

  function grainTextureScaleToTexturizedScale(textureScale) {
    const value = Number(textureScale);

    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    const minLog = Math.log(grainTexturizedMinTextureScale);
    const maxLog = Math.log(1);

    return clamp01((Math.log(value) - minLog) / (maxLog - minLog));
  }

  function normalizeGrainBlendMode(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    return grainBlendModeValueSet.has(normalized) ? normalized : "multiply";
  }

  function normalizeRenderingMode(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    return renderingModeValueSet.has(normalized) ? normalized : settings.renderingMode;
  }

  function normalizeBurntEdgesMode(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    return burntEdgesModeValueSet.has(normalized) ? normalized : settings.burntEdgesMode;
  }

  function createSettings(overrides = {}) {
    const nextOverrides = overrides || {};
    const nextSettings = {
      ...settings,
      ...nextOverrides,
    };

    nextSettings.streamLineAmount =
      nextOverrides.streamLineAmount ?? nextOverrides.smoothing ?? nextSettings.streamLineAmount;
    if (!hasOwn(nextOverrides, "pencilPressureSize") && hasOwn(nextOverrides, "penPressureSize")) {
      nextSettings.pencilPressureSize = nextOverrides.penPressureSize;
    }
    if (!hasOwn(nextOverrides, "pencilPressureOpacity") && hasOwn(nextOverrides, "penPressureOpacity")) {
      nextSettings.pencilPressureOpacity = nextOverrides.penPressureOpacity;
    }
    if (!hasOwn(nextOverrides, "pencilTiltSize") && hasOwn(nextOverrides, "penTiltSize")) {
      nextSettings.pencilTiltSize = nextOverrides.penTiltSize;
    }
    if (!hasOwn(nextOverrides, "pencilTiltRotation") && hasOwn(nextOverrides, "penTiltRotation")) {
      nextSettings.pencilTiltRotation = nextOverrides.penTiltRotation;
    }
    if (
      !hasOwn(nextOverrides, "pencilInputVersion") &&
      Number(nextSettings.pencilPressureSize) === 1 &&
      normalize01(nextSettings.pencilPressureOpacity, 0) === 0 &&
      normalize01(nextSettings.pencilPressureFlow, 0) === 0 &&
      normalize01(nextSettings.pencilPressureBleed, 0) === 0 &&
      normalize01(nextSettings.pencilTiltSize, 0) === 0 &&
      normalize01(nextSettings.pencilTiltOpacity, 0) === 0 &&
      normalize01(nextSettings.pencilTiltGradation, 0) === 0 &&
      normalize01(nextSettings.pencilTiltBleed, 0) === 0 &&
      normalizeSigned(nextSettings.pencilBarrelSize, 0) === 0 &&
      normalize01(nextSettings.pencilBarrelOpacity, 0) === 0 &&
      normalize01(nextSettings.pencilBarrelBleed, 0) === 0
    ) {
      nextSettings.pencilPressureSize = 0;
    }
    nextSettings.pencilInputVersion = settings.pencilInputVersion;
    nextSettings.shapeAlphaSrc = nextSettings.shapeAlphaSrc || defaultShapeAlphaSrc;
    nextSettings.shapeAlphaName = nextSettings.shapeAlphaName || defaultShapeAlphaName;
    nextSettings.grainEnabled = nextSettings.grainEnabled !== false;
    nextSettings.grainTextureSrc = nextSettings.grainTextureSrc || defaultGrainTextureSrc;
    nextSettings.grainTextureName = nextSettings.grainTextureName || defaultGrainTextureName;
    nextSettings.grainMode = grainModeValues.has(String(nextSettings.grainMode).toLowerCase())
      ? String(nextSettings.grainMode).toLowerCase()
      : "texturized";
    nextSettings.grainBlendMode = normalizeGrainBlendMode(nextSettings.grainBlendMode);
    nextSettings.renderingMode = normalizeRenderingMode(nextSettings.renderingMode);
    nextSettings.flow = normalize01(nextSettings.flow, settings.flow);
    nextSettings.radius = normalizeRange(nextSettings.radius, settings.radius, 1, brushSizeMax);
    nextSettings.streamLineAmount = normalize01(nextSettings.streamLineAmount, settings.streamLineAmount);
    nextSettings.streamLinePressure = normalize01(nextSettings.streamLinePressure, settings.streamLinePressure);
    nextSettings.stabilizationAmount = normalize01(nextSettings.stabilizationAmount, settings.stabilizationAmount);
    nextSettings.motionFilteringAmount = normalize01(
      nextSettings.motionFilteringAmount,
      settings.motionFilteringAmount,
    );
    nextSettings.motionFilteringExpression = normalize01(
      nextSettings.motionFilteringExpression,
      settings.motionFilteringExpression,
    );
    nextSettings.spacing = normalizeRange(nextSettings.spacing, settings.spacing, minimumSpacing, 1);
    nextSettings.spacingJitter = normalize01(nextSettings.spacingJitter, settings.spacingJitter);
    nextSettings.jitterLateral = normalizeRange(nextSettings.jitterLateral, settings.jitterLateral, 0, 2);
    nextSettings.jitterLinear = normalizeRange(nextSettings.jitterLinear, settings.jitterLinear, 0, 2);
    nextSettings.fallOff = normalize01(nextSettings.fallOff, settings.fallOff);
    nextSettings.wetEdges = normalize01(nextSettings.wetEdges, settings.wetEdges);
    nextSettings.burntEdges = normalize01(nextSettings.burntEdges, settings.burntEdges);
    nextSettings.burntEdgesMode = normalizeBurntEdgesMode(nextSettings.burntEdgesMode);
    nextSettings.alphaThresholdEnabled = nextSettings.alphaThresholdEnabled === true;
    nextSettings.alphaThreshold = normalize01(nextSettings.alphaThreshold, settings.alphaThreshold);
    nextSettings.velocityPressureEnabled = nextSettings.velocityPressureEnabled === true;
    nextSettings.pencilPressureCurveLow = normalize01(
      nextSettings.pencilPressureCurveLow,
      settings.pencilPressureCurveLow,
    );
    nextSettings.pencilPressureCurveMid = normalize01(
      nextSettings.pencilPressureCurveMid,
      settings.pencilPressureCurveMid,
    );
    nextSettings.pencilPressureCurveHigh = normalize01(
      nextSettings.pencilPressureCurveHigh,
      settings.pencilPressureCurveHigh,
    );
    nextSettings.pencilPressureSize = normalize01(nextSettings.pencilPressureSize, settings.pencilPressureSize);
    nextSettings.pencilPressureOpacity = normalize01(
      nextSettings.pencilPressureOpacity,
      settings.pencilPressureOpacity,
    );
    nextSettings.pencilPressureFlow = normalize01(nextSettings.pencilPressureFlow, settings.pencilPressureFlow);
    nextSettings.pencilPressureBleed = normalize01(nextSettings.pencilPressureBleed, settings.pencilPressureBleed);
    nextSettings.pencilTiltTrigger = normalizeRange(
      nextSettings.pencilTiltTrigger,
      settings.pencilTiltTrigger,
      15,
      90,
    );
    nextSettings.pencilTiltOpacity = normalize01(nextSettings.pencilTiltOpacity, settings.pencilTiltOpacity);
    nextSettings.pencilTiltGradation = normalize01(nextSettings.pencilTiltGradation, settings.pencilTiltGradation);
    nextSettings.pencilTiltBleed = normalize01(nextSettings.pencilTiltBleed, settings.pencilTiltBleed);
    nextSettings.pencilTiltSize = normalize01(nextSettings.pencilTiltSize, settings.pencilTiltSize);
    nextSettings.pencilTiltSizeCompression = nextSettings.pencilTiltSizeCompression === true;
    nextSettings.pencilTiltRotation = normalize01(nextSettings.pencilTiltRotation, settings.pencilTiltRotation);
    nextSettings.pencilBarrelSize = normalizeSigned(nextSettings.pencilBarrelSize, settings.pencilBarrelSize);
    nextSettings.pencilBarrelOpacity = normalize01(nextSettings.pencilBarrelOpacity, settings.pencilBarrelOpacity);
    nextSettings.pencilBarrelBleed = normalize01(nextSettings.pencilBarrelBleed, settings.pencilBarrelBleed);
    nextSettings.pencilBarrelRelativeToStroke = nextSettings.pencilBarrelRelativeToStroke !== false;
    nextSettings.penPressureSize = nextSettings.pencilPressureSize;
    nextSettings.penPressureOpacity = nextSettings.pencilPressureOpacity;
    nextSettings.penTiltSize = nextSettings.pencilTiltSize;
    nextSettings.penTiltRotation = nextSettings.pencilTiltRotation;
    nextSettings.shapeRotation = normalizeSigned(nextSettings.shapeRotation, settings.shapeRotation);
    nextSettings.shapeScatter = normalizeRange(nextSettings.shapeScatter, settings.shapeScatter, 0, 2);
    nextSettings.shapeCount = normalizeRange(Math.round(Number(nextSettings.shapeCount) || settings.shapeCount), settings.shapeCount, 1, 16);
    nextSettings.shapeCountJitter = normalize01(nextSettings.shapeCountJitter, settings.shapeCountJitter);
    nextSettings.grainBrightness = normalizeSigned(nextSettings.grainBrightness, settings.grainBrightness);
    nextSettings.grainContrast = normalizeSigned(nextSettings.grainContrast, settings.grainContrast);
    nextSettings.grainTexturizedScale = hasOwn(nextOverrides, "grainTexturizedScale")
      ? normalize01(nextOverrides.grainTexturizedScale, settings.grainTexturizedScale)
      : grainTextureScaleToTexturizedScale(nextOverrides.grainScale ?? nextSettings.grainScale);
    nextSettings.grainTexturizedDepth = hasOwn(nextOverrides, "grainTexturizedDepth")
      ? normalize01(nextOverrides.grainTexturizedDepth, settings.grainTexturizedDepth)
      : normalize01(nextOverrides.grainStrength ?? nextSettings.grainStrength, settings.grainTexturizedDepth);
    nextSettings.grainMovingMovement = normalize01(nextSettings.grainMovingMovement, settings.grainMovingMovement);
    nextSettings.grainMovingScale = normalize01(nextSettings.grainMovingScale, settings.grainMovingScale);
    nextSettings.grainMovingZoom = normalize01(nextSettings.grainMovingZoom, settings.grainMovingZoom);
    nextSettings.grainMovingRotation = normalizeSigned(nextSettings.grainMovingRotation, settings.grainMovingRotation);
    nextSettings.grainMovingDepth = normalize01(nextSettings.grainMovingDepth, settings.grainMovingDepth);
    nextSettings.grainMovingDepthMinimum = normalize01(
      nextSettings.grainMovingDepthMinimum,
      settings.grainMovingDepthMinimum,
    );
    nextSettings.grainMovingDepthJitter = normalize01(
      nextSettings.grainMovingDepthJitter,
      settings.grainMovingDepthJitter,
    );
    nextSettings.grainMovingOffsetJitter = nextSettings.grainMovingOffsetJitter !== false;

    return nextSettings;
  }

  namespace.BrushDefaults = Object.freeze({
    defaultGrainTextureName,
    defaultGrainTextureSrc,
    defaultShapeAlphaName,
    defaultShapeAlphaSrc,
    defaultTaperMinDistance,
    burntEdgesModeValues,
    grainBlendModeValues,
    renderingModeValues,
    grainTexturizedMinTextureScale,
    grainTextureExportSize: 4096,
    shapeAlphaExportSize: 512,
    brushSizeMax,
    minimumSpacing,
    settings,
    taperTipRealMin,
    createSettings,
  });
})(window.CBO);
