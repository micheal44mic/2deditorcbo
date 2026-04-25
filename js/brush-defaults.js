window.CBO = window.CBO || {};

(function registerBrushDefaults(namespace) {
  const defaultShapeAlphaSrc = namespace.defaultShapeAlpha?.src || "./data/brush-shape-alpha.png";
  const defaultShapeAlphaName = namespace.defaultShapeAlpha?.name || "SHAPE ALPHA";
  const defaultGrainTextureSrc = namespace.defaultGrainTexture?.src || "./data/pastel-pencil-grain-texture.png";
  const defaultGrainTextureName = namespace.defaultGrainTexture?.name || "PASTEL PENCIL GRAIN";
  const defaultTaperMinDistance = 247;
  const taperTipRealMin = 0.15;
  const grainModeValues = new Set(["moving", "texturized"]);
  const grainTexturizedMinTextureScale = 0.05;

  const settings = Object.freeze({
    radius: 18,
    opacity: 0.92,
    spacing: 0.18,
    smoothing: 0,
    streamLineAmount: 0,
    streamLinePressure: 0,
    stabilizationAmount: 0,
    spacingJitter: 0,
    jitterLateral: 0,
    jitterLinear: 0,
    fallOff: 0,
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
    grainTexturizedScale: 1,
    grainTexturizedDepth: 1,
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

  function grainTextureScaleToTexturizedScale(textureScale) {
    const value = Number(textureScale);

    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    const minLog = Math.log(grainTexturizedMinTextureScale);
    const maxLog = Math.log(1);

    return clamp01((Math.log(value) - minLog) / (maxLog - minLog));
  }

  function createSettings(overrides = {}) {
    const nextOverrides = overrides || {};
    const nextSettings = {
      ...settings,
      ...nextOverrides,
    };

    nextSettings.streamLineAmount =
      nextOverrides.streamLineAmount ?? nextOverrides.smoothing ?? nextSettings.streamLineAmount;
    nextSettings.shapeAlphaSrc = nextSettings.shapeAlphaSrc || defaultShapeAlphaSrc;
    nextSettings.shapeAlphaName = nextSettings.shapeAlphaName || defaultShapeAlphaName;
    nextSettings.grainTextureSrc = nextSettings.grainTextureSrc || defaultGrainTextureSrc;
    nextSettings.grainTextureName = nextSettings.grainTextureName || defaultGrainTextureName;
    nextSettings.grainMode = grainModeValues.has(String(nextSettings.grainMode).toLowerCase())
      ? String(nextSettings.grainMode).toLowerCase()
      : "texturized";
    nextSettings.grainTexturizedScale = hasOwn(nextOverrides, "grainTexturizedScale")
      ? normalize01(nextOverrides.grainTexturizedScale, settings.grainTexturizedScale)
      : grainTextureScaleToTexturizedScale(nextOverrides.grainScale ?? nextSettings.grainScale);
    nextSettings.grainTexturizedDepth = hasOwn(nextOverrides, "grainTexturizedDepth")
      ? normalize01(nextOverrides.grainTexturizedDepth, settings.grainTexturizedDepth)
      : normalize01(nextOverrides.grainStrength ?? nextSettings.grainStrength, settings.grainTexturizedDepth);

    return nextSettings;
  }

  namespace.BrushDefaults = Object.freeze({
    defaultGrainTextureName,
    defaultGrainTextureSrc,
    defaultShapeAlphaName,
    defaultShapeAlphaSrc,
    defaultTaperMinDistance,
    grainTexturizedMinTextureScale,
    grainTextureExportSize: 2048,
    shapeAlphaExportSize: 512,
    settings,
    taperTipRealMin,
    createSettings,
  });
})(window.CBO);
