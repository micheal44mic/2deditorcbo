(function registerBlendModes(namespace) {
  const supportedModes = Object.freeze([
    { id: 0, key: "normal", label: "Normal" },
    { id: 1, key: "multiply", label: "Multiply" },
    { id: 2, key: "screen", label: "Screen" },
    { id: 3, key: "overlay", label: "Overlay" },
    { id: 4, key: "darken", label: "Darken" },
    { id: 5, key: "lighten", label: "Lighten" },
    { id: 6, key: "difference", label: "Difference" },
    { id: 7, key: "exclusion", label: "Exclusion" },
  ]);
  const modeByKey = new Map(supportedModes.map((mode) => [mode.key, mode]));

  function normalizeLayerBlendMode(value) {
    const mode = String(value || "").trim().toLowerCase();

    return modeByKey.has(mode) ? mode : "normal";
  }

  function getLayerBlendModeId(value) {
    return modeByKey.get(normalizeLayerBlendMode(value))?.id || 0;
  }

  function getLayerBlendModeLabel(value) {
    return modeByKey.get(normalizeLayerBlendMode(value))?.label || "Normal";
  }

  function isAdvancedLayerBlendMode(value) {
    return getLayerBlendModeId(value) !== 0;
  }

  namespace.BlendModes = Object.freeze({
    getLayerBlendModeId,
    getLayerBlendModeLabel,
    isAdvancedLayerBlendMode,
    normalizeLayerBlendMode,
    supportedModes,
    supportedModeKeys: Object.freeze(supportedModes.map((mode) => mode.key)),
  });
})(window.CBO = window.CBO || {});
