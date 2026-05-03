window.CBO = window.CBO || {};

(function registerLayerEffectsPanel(namespace) {
  const MAX_GAUSSIAN_BLUR_RADIUS = 40;
  const EFFECT_GROUPS = Object.freeze([
    {
      label: "Blur",
      items: Object.freeze([
        { implemented: true, icon: "blur", label: "Gaussian Blur", type: "gaussian-blur" },
        { implemented: false, icon: "motion", label: "Motion Blur", type: "motion-blur" },
        { implemented: false, icon: "radial", label: "Radial Blur", type: "radial-blur" },
      ]),
    },
    {
      label: "Color",
      items: Object.freeze([
        { implemented: false, icon: "curves", label: "Curves", type: "curves" },
        { implemented: false, icon: "levels", label: "Levels", type: "levels" },
        { implemented: false, icon: "threshold", label: "Threshold", type: "threshold" },
        { implemented: false, icon: "hue", label: "Hue/Saturation", type: "hue-saturation" },
      ]),
    },
    {
      label: "Texture",
      items: Object.freeze([
        { implemented: false, icon: "noise", label: "Noise", type: "noise" },
        { implemented: false, icon: "grain", label: "Grain", type: "grain" },
        { implemented: false, icon: "halftone", label: "Halftone", type: "halftone" },
        { implemented: false, icon: "pixelate", label: "Pixelate", type: "pixelate" },
      ]),
    },
    {
      label: "Light",
      items: Object.freeze([
        { implemented: false, icon: "bloom", label: "Bloom", type: "bloom" },
        { implemented: false, icon: "glow", label: "Glow", type: "glow" },
        { implemented: false, icon: "vignette", label: "Vignette", type: "vignette" },
      ]),
    },
  ]);

  function clamp(value, min, max) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function getEffectDefinition(type) {
    for (const group of EFFECT_GROUPS) {
      const item = group.items.find((effect) => effect.type === type);

      if (item) {
        return item;
      }
    }

    return null;
  }

  function isImplementedEffect(type) {
    return getEffectDefinition(type)?.implemented === true;
  }

  function getEffectIconMarkup(icon) {
    const pathsByIcon = {
      bloom: '<circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 4.9 2.1 2.1" /><path d="m17 17 2.1 2.1" /><path d="m19.1 4.9-2.1 2.1" /><path d="m7 17-2.1 2.1" />',
      blur: '<circle cx="12" cy="12" r="1" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="9" />',
      curves: '<path d="M4 19c5 0 4-14 9-14 4 0 3 14 7 14" /><path d="M4 19h16" /><path d="M4 5v14" />',
      glow: '<path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><circle cx="12" cy="12" r="4" />',
      grain: '<circle cx="7" cy="7" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="11" cy="12" r="1" /><circle cx="18" cy="14" r="1" /><circle cx="6" cy="17" r="1" />',
      halftone: '<circle cx="6" cy="6" r="2" /><circle cx="14" cy="5" r="1.5" /><circle cx="20" cy="8" r="1" /><circle cx="9" cy="14" r="1.5" /><circle cx="17" cy="16" r="2" /><circle cx="5" cy="20" r="1" />',
      hue: '<circle cx="12" cy="12" r="8" /><path d="M12 4v16" /><path d="M4 12h16" />',
      levels: '<path d="M4 19h16" /><path d="M6 19V9" /><path d="M12 19V5" /><path d="M18 19v-7" />',
      motion: '<path d="M4 8h9" /><path d="M4 12h16" /><path d="M4 16h9" /><path d="m16 8 4 4-4 4" />',
      noise: '<path d="M4 7h1" /><path d="M9 7h1" /><path d="M14 7h1" /><path d="M19 7h1" /><path d="M6 12h1" /><path d="M11 12h1" /><path d="M16 12h1" /><path d="M4 17h1" /><path d="M9 17h1" /><path d="M14 17h1" /><path d="M19 17h1" />',
      pixelate: '<path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h6v6h-6z" />',
      radial: '<circle cx="12" cy="12" r="8" /><path d="M12 4v4" /><path d="M12 16v4" /><path d="M4 12h4" /><path d="M16 12h4" />',
      threshold: '<path d="M4 19h16" /><path d="M4 5h16" /><path d="M12 5v14" /><path d="M8 9h8" /><path d="M8 15h8" />',
      vignette: '<rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="12" cy="12" r="4" />',
    };

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${pathsByIcon[icon] || pathsByIcon.blur}
      </svg>
    `;
  }

  function getEffectPickerMarkup() {
    return EFFECT_GROUPS.map((group) => `
      <section class="layer-effects-menu-group" data-layer-effects-menu-group>
        <div class="layer-effects-menu-title">${group.label}</div>
        <div class="layer-effects-menu-options">
          ${group.items.map((effect) => `
            <button
              class="layer-effect-option"
              type="button"
              data-effect-label="${effect.label.toLowerCase()}"
              data-layer-effect-option="${effect.type}"
              aria-disabled="false"
            >
              <span class="layer-effect-option-icon">${getEffectIconMarkup(effect.icon)}</span>
              <span class="layer-effect-option-label">${effect.label}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");
  }

  function getAdjustmentControlMarkup(label, value, input = "range") {
    if (input === "checkbox") {
      return `
        <label class="layer-effects-check-row">
          <span class="layer-effects-label">${label}</span>
          <input class="layer-effects-check" type="checkbox" ${value ? "checked" : ""} disabled />
        </label>
      `;
    }

    return `
      <label class="layer-effects-control-row">
        <span class="layer-effects-label">${label}</span>
        <input class="layer-effects-range" type="range" min="0" max="100" step="1" value="${value}" disabled />
      </label>
    `;
  }

  function getCurvesEditorMarkup() {
    return `
      <div class="layer-effects-tabs" aria-label="Curve channel">
        <button class="layer-effects-tab active" type="button" disabled>RGB</button>
        <button class="layer-effects-tab" type="button" disabled>R</button>
        <button class="layer-effects-tab" type="button" disabled>G</button>
        <button class="layer-effects-tab" type="button" disabled>B</button>
      </div>
      <div class="layer-effects-curve-box" aria-hidden="true">
        <svg viewBox="0 0 100 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 56H100M0 38H100M0 20H100M24 2V72M50 2V72M76 2V72" />
          <path class="curve-line" d="M5 65C30 62 33 18 52 18C72 18 72 53 95 8" />
          <circle cx="5" cy="65" r="3" />
          <circle cx="52" cy="18" r="3" />
          <circle cx="95" cy="8" r="3" />
        </svg>
      </div>
    `;
  }

  function getEffectEditorMarkup(effect) {
    if (effect.type === "gaussian-blur") {
      return "";
    }

    const controlsByType = {
      bloom: [
        getAdjustmentControlMarkup("Threshold", 72),
        getAdjustmentControlMarkup("Radius", 28),
        getAdjustmentControlMarkup("Intensity", 34),
      ],
      glow: [
        getAdjustmentControlMarkup("Radius", 18),
        getAdjustmentControlMarkup("Intensity", 40),
        getAdjustmentControlMarkup("Spread", 24),
      ],
      grain: [
        getAdjustmentControlMarkup("Amount", 18),
        getAdjustmentControlMarkup("Scale", 42),
        getAdjustmentControlMarkup("Monochrome", true, "checkbox"),
      ],
      halftone: [
        getAdjustmentControlMarkup("Size", 34),
        getAdjustmentControlMarkup("Angle", 45),
        getAdjustmentControlMarkup("Contrast", 62),
      ],
      "hue-saturation": [
        getAdjustmentControlMarkup("Hue", 50),
        getAdjustmentControlMarkup("Saturation", 50),
        getAdjustmentControlMarkup("Lightness", 50),
      ],
      levels: [
        getAdjustmentControlMarkup("Shadows", 8),
        getAdjustmentControlMarkup("Midtones", 50),
        getAdjustmentControlMarkup("Highlights", 92),
      ],
      "motion-blur": [
        getAdjustmentControlMarkup("Distance", 26),
        getAdjustmentControlMarkup("Angle", 38),
      ],
      noise: [
        getAdjustmentControlMarkup("Amount", 14),
        getAdjustmentControlMarkup("Scale", 28),
        getAdjustmentControlMarkup("Monochrome", true, "checkbox"),
      ],
      pixelate: [
        getAdjustmentControlMarkup("Size", 18),
      ],
      "radial-blur": [
        getAdjustmentControlMarkup("Amount", 22),
        getAdjustmentControlMarkup("Center", 50),
      ],
      threshold: [
        getAdjustmentControlMarkup("Level", 50),
      ],
      vignette: [
        getAdjustmentControlMarkup("Amount", 35),
        getAdjustmentControlMarkup("Size", 68),
        getAdjustmentControlMarkup("Feather", 44),
      ],
    };

    return `
      <section class="layer-effects-section layer-effects-disabled-editor" aria-label="${effect.label}" data-layer-effects-editor="${effect.type}" hidden>
        ${effect.type === "curves" ? getCurvesEditorMarkup() : (controlsByType[effect.type] || []).join("")}
      </section>
    `;
  }

  function getEffectEditorsMarkup() {
    return EFFECT_GROUPS
      .flatMap((group) => group.items)
      .map((effect) => getEffectEditorMarkup(effect))
      .join("");
  }

  function getGaussianBlurRadius(layer) {
    const effects = layer?.effects;
    const effect = Array.isArray(effects)
      ? effects.find((item) => item && item.type === "gaussian-blur" && item.enabled !== false)
      : effects?.gaussianBlur;
    const radius = Number(effect?.radius);

    return Number.isFinite(radius) ? Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius)) : 0;
  }

  function getNextEffects(layer, radius) {
    const nextRadius = clamp(radius, 0, MAX_GAUSSIAN_BLUR_RADIUS);
    const existingEffects = Array.isArray(layer?.effects) ? layer.effects : [];
    const effects = existingEffects
      .filter((effect) => effect && effect.type !== "gaussian-blur")
      .map((effect) => cloneValue(effect));

    if (nextRadius > 0) {
      effects.push({
        type: "gaussian-blur",
        enabled: true,
        radius: nextRadius,
      });
    }

    return effects;
  }

  function isBlurEligibleLayer(layer) {
    return Boolean(
      layer &&
      layer.locked !== true &&
      layer.type !== "group" &&
      layer.type !== "background" &&
      layer.id !== "background",
    );
  }

  function getLayerStateSnapshot(layerModel) {
    if (!layerModel || typeof layerModel.getEntries !== "function") {
      return null;
    }

    return {
      activeLayerId: layerModel.activeLayerId || null,
      entries: layerModel.getEntries(),
    };
  }

  namespace.getLayerGaussianBlurRadius = getGaussianBlurRadius;

  namespace.hasRasterizableLayerEffects = function hasRasterizableLayerEffects(layerOrId) {
    const layer = typeof layerOrId === "string"
      ? namespace.documentLayerModel?.findEntryById?.(layerOrId)
      : layerOrId;

    return isBlurEligibleLayer(layer) && getGaussianBlurRadius(layer) > 0;
  };

  namespace.setLayerGaussianBlurRadius = function setLayerGaussianBlurRadius(layerId, radius, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const layer = layerModel?.findEntryById?.(layerId);

    if (!isBlurEligibleLayer(layer) || !layerModel?.updateLayer) {
      return false;
    }

    const updateOptions = {
      historyGroup: options.historyGroup || `gaussian-blur-${layerId}`,
      source: options.source || "layer-effects-gaussian-blur",
    };

    if (options.history === false) {
      updateOptions.history = false;
    }

    const didUpdate = layerModel.updateLayer(layerId, {
      effects: getNextEffects(layer, radius),
    }, updateOptions);

    if (didUpdate) {
      namespace.documentRenderer?.requestDraw?.();
    }

    return didUpdate;
  };

  function createLayerEffectsRasterizeHistoryEntry(options = {}) {
    const {
      afterSnapshot,
      afterState,
      beforeSnapshot,
      beforeState,
      history,
      layerId,
      layerModel,
      renderer,
    } = options;

    if (!history || !layerModel || !renderer || !layerId || !beforeState || !afterState) {
      return null;
    }

    const before = cloneValue(beforeState);
    const after = cloneValue(afterState);

    return {
      type: "custom",
      afterSnapshot,
      afterActiveLayerId: after.activeLayerId,
      afterEntries: after.entries,
      beforeSnapshot,
      beforeActiveLayerId: before.activeLayerId,
      beforeEntries: before.entries,
      layerId,
      source: "layer-effects-rasterize",
      undo() {
        const didRestoreState = history.restoreLayerState(layerModel, before, {
          source: "history-undo-layer-effects-rasterize",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = renderer.restoreRasterSnapshot?.(layerId, beforeSnapshot, {
          source: "history-undo-layer-effects-rasterize",
        }) !== false;

        namespace.brushEngine?.requestDraw?.();
        return didRestorePixels;
      },
      redo() {
        const didRestoreState = history.restoreLayerState(layerModel, after, {
          source: "history-redo-layer-effects-rasterize",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = renderer.restoreRasterSnapshot?.(layerId, afterSnapshot, {
          source: "history-redo-layer-effects-rasterize",
        }) !== false;

        if (!didRestorePixels) {
          history.restoreLayerState(layerModel, before, {
            source: "history-redo-layer-effects-rasterize-rollback",
          });
        }

        namespace.brushEngine?.requestDraw?.();
        return didRestorePixels;
      },
      destroy() {
        renderer.deleteRasterSnapshot?.(beforeSnapshot);
        renderer.deleteRasterSnapshot?.(afterSnapshot);
      },
    };
  }

  namespace.createLayerEffectsRasterizeHistoryEntry = createLayerEffectsRasterizeHistoryEntry;

  namespace.rasterizeLayerEffects = function rasterizeLayerEffects(layerId, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const history = namespace.documentHistory;
    const activeLayerId = layerId || layerModel?.activeLayerId;
    const layer = activeLayerId ? layerModel?.findEntryById?.(activeLayerId) : null;

    if (!namespace.hasRasterizableLayerEffects(layer) || !renderer?.rasterizeLayerEffects) {
      return false;
    }

    history?.flushLayerState?.(layerModel);

    const beforeState = options.beforeState
      ? cloneValue(options.beforeState)
      : history?.getLayerSnapshot?.(layerModel) || null;
    const snapshots = renderer.rasterizeLayerEffects(layer, {
      emit: false,
      source: "layer-effects-rasterize",
    });

    if (!snapshots) {
      return false;
    }

    const didUpdateLayer = layerModel.updateLayer(layer.id, {
      effects: getNextEffects(layer, 0),
    }, {
      history: false,
      source: "layer-effects-rasterize",
    });

    if (!didUpdateLayer) {
      renderer.restoreRasterSnapshot?.(layer.id, snapshots.beforeSnapshot, {
        emit: false,
        source: "layer-effects-rasterize-rollback",
      });
      renderer.deleteRasterSnapshot?.(snapshots.beforeSnapshot);
      renderer.deleteRasterSnapshot?.(snapshots.afterSnapshot);
      return false;
    }

    const afterState = history?.getLayerSnapshot?.(layerModel) || null;
    const historyEntry = createLayerEffectsRasterizeHistoryEntry({
      afterSnapshot: snapshots.afterSnapshot,
      afterState,
      beforeSnapshot: snapshots.beforeSnapshot,
      beforeState,
      history,
      layerId: layer.id,
      layerModel,
      renderer,
    });

    if (historyEntry) {
      history.push(historyEntry);
    } else {
      renderer.deleteRasterSnapshot?.(snapshots.beforeSnapshot);
      renderer.deleteRasterSnapshot?.(snapshots.afterSnapshot);
    }

    renderer.emitContentChange?.({
      layerId: layer.id,
      source: "layer-effects-rasterize",
    });
    renderer.requestDraw?.();
    window.dispatchEvent(new CustomEvent("cbo:layer-effects-rasterized", {
      detail: {
        layerId: layer.id,
        source: "layer-effects-rasterize",
      },
    }));

    return true;
  };

  namespace.rasterizeActiveLayerEffects = (options = {}) => namespace.rasterizeLayerEffects(null, options);

  namespace.initLayerEffectsPanel = function initLayerEffectsPanel() {
    const button = document.querySelector(".vertical-adjustment-layer-button");

    if (!button || document.querySelector("[data-layer-effects-panel]")) {
      return;
    }

    const panel = document.createElement("div");

    panel.className = "layer-effects-popover";
    panel.hidden = true;
    panel.dataset.layerEffectsPanel = "";
    panel.innerHTML = `
      <div class="layer-effects-picker" data-layer-effects-picker>
        <div class="layer-effects-header">
          <div class="layer-effects-heading">
            <span class="layer-effects-title">Effects</span>
            <span class="layer-effects-target" data-layer-effects-picker-target>Layer</span>
          </div>
          <button class="layer-effects-icon-button" type="button" aria-label="Close effects" data-layer-effects-panel-close>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <label class="layer-effects-search">
          <input class="layer-effects-search-input" type="search" placeholder="Search effects" aria-label="Search effects" data-layer-effects-search />
        </label>
        <div class="layer-effects-menu" data-layer-effects-menu>
          ${getEffectPickerMarkup()}
        </div>
      </div>
      <div class="layer-effects-detail" data-layer-effects-detail hidden>
        <div class="layer-effects-header">
          <button class="layer-effects-icon-button layer-effects-back-button" type="button" aria-label="Back to effects" data-layer-effects-back>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div class="layer-effects-heading">
            <span class="layer-effects-title" data-layer-effects-title>Effect</span>
            <span class="layer-effects-target" data-layer-effects-target>Layer</span>
          </div>
          <div class="layer-effects-header-actions">
            <button class="layer-effects-icon-button" type="button" aria-label="Apply effect" data-layer-effects-accept>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button class="layer-effects-icon-button" type="button" aria-label="Cancel effects" data-layer-effects-close>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div class="layer-effects-detail-body">
          <section class="layer-effects-section" aria-label="Gaussian blur" data-layer-effects-editor="gaussian-blur" hidden>
            <div class="layer-effects-control-header">
              <span class="layer-effects-label">Gaussian Blur</span>
              <output class="layer-effects-value" data-layer-blur-value>0 px</output>
            </div>
            <input class="layer-effects-range" type="range" min="0" max="40" step="1" value="0" aria-label="Gaussian blur radius" data-layer-blur-input />
            <div class="layer-effects-actions">
              <button class="layer-effects-icon-button" type="button" aria-label="Reset gaussian blur" data-layer-blur-reset>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </section>
          ${getEffectEditorsMarkup()}
        </div>
      </div>
    `;

    const title = panel.querySelector("[data-layer-effects-title]");
    const targetName = panel.querySelector("[data-layer-effects-target]");
    const pickerTargetName = panel.querySelector("[data-layer-effects-picker-target]");
    const picker = panel.querySelector("[data-layer-effects-picker]");
    const detail = panel.querySelector("[data-layer-effects-detail]");
    const menu = panel.querySelector("[data-layer-effects-menu]");
    const searchInput = panel.querySelector("[data-layer-effects-search]");
    const effectEditors = panel.querySelectorAll("[data-layer-effects-editor]");
    const backButton = panel.querySelector("[data-layer-effects-back]");
    const blurInput = panel.querySelector("[data-layer-blur-input]");
    const blurValue = panel.querySelector("[data-layer-blur-value]");
    const acceptButton = panel.querySelector("[data-layer-effects-accept]");
    const resetButton = panel.querySelector("[data-layer-blur-reset]");
    const closeButton = panel.querySelector("[data-layer-effects-close]");
    const panelCloseButton = panel.querySelector("[data-layer-effects-panel-close]");
    let activeEffectType = "";
    let previewSession = null;

    document.body.append(panel);

    function getLayerModel() {
      return namespace.documentLayerModel;
    }

    function getActiveLayer() {
      const layerModel = getLayerModel();

      return layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
    }

    function startPreviewSession(effectType) {
      const layerModel = getLayerModel();
      const layer = getActiveLayer();
      const effect = getEffectDefinition(effectType);

      previewSession = effect?.implemented && isBlurEligibleLayer(layer)
        ? {
            beforeState: namespace.documentHistory?.getLayerSnapshot?.(layerModel) ||
              getLayerStateSnapshot(layerModel),
            effectType,
            effects: Array.isArray(layer.effects) ? cloneValue(layer.effects) : [],
            layerId: layer.id,
          }
        : null;
    }

    function restorePreviewSession() {
      const layerModel = getLayerModel();
      const session = previewSession;

      if (!session?.layerId || !layerModel?.updateLayer) {
        previewSession = null;
        return false;
      }

      const layer = layerModel.findEntryById?.(session.layerId);

      if (!layer) {
        previewSession = null;
        return false;
      }

      const didRestore = layerModel.updateLayer(session.layerId, {
        effects: cloneValue(session.effects),
      }, {
        history: false,
        source: "layer-effects-cancel",
      });

      if (didRestore) {
        namespace.documentRenderer?.requestDraw?.();
      }

      previewSession = null;
      return didRestore;
    }

    function setEffectView(effectType = "") {
      const definition = getEffectDefinition(effectType);
      const isEditor = Boolean(definition);
      const isImplemented = isImplementedEffect(effectType);

      activeEffectType = isEditor ? effectType : "";
      picker.hidden = isEditor;
      detail.hidden = !isEditor;
      effectEditors.forEach((editor) => {
        editor.hidden = editor.dataset.layerEffectsEditor !== activeEffectType;
      });
      title.textContent = isEditor ? definition.label : "Effects";
      closeButton.setAttribute("aria-label", isEditor ? "Cancel effect" : "Close effects");
      acceptButton.setAttribute(
        "aria-label",
        isEditor
          ? (isImplemented ? `Apply ${definition.label}` : `${definition.label} unavailable`)
          : "Apply effect",
      );
      panel.dataset.activeEffect = activeEffectType;
    }

    function showEffectPicker(options = {}) {
      if (options.cancel !== false) {
        restorePreviewSession();
      } else {
        previewSession = null;
      }

      setEffectView("");
      syncControls();
      searchInput?.focus?.({ preventScroll: true });
    }

    function openEffectEditor(effectType) {
      const definition = getEffectDefinition(effectType);

      if (!definition) {
        return;
      }

      restorePreviewSession();
      setEffectView(effectType);
      startPreviewSession(effectType);
      syncControls();
      if (effectType === "gaussian-blur") {
        blurInput?.focus?.({ preventScroll: true });
      }
    }

    function closePanel(options = {}) {
      const shouldCancel = options.cancel !== false;

      if (shouldCancel) {
        restorePreviewSession();
      } else {
        previewSession = null;
      }

      setEffectView("");
      panel.hidden = true;
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    }

    function setOpen(isOpen) {
      if (!isOpen) {
        closePanel({ cancel: true });
        return;
      }

      previewSession = null;
      setEffectView("");
      panel.hidden = false;
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");

      syncControls();
      positionPanel();
    }

    function positionPanel() {
      if (panel.hidden) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 12;
      const left = Math.max(12, buttonRect.left - panelRect.width - gap);
      const top = Math.min(
        Math.max(12, buttonRect.top - 8),
        window.innerHeight - panelRect.height - 12,
      );

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    function syncControls() {
      const layer = getActiveLayer();
      const isEligible = isBlurEligibleLayer(layer);
      const radius = isEligible ? getGaussianBlurRadius(layer) : 0;

      const layerName = isEligible ? layer.name || "Layer" : "No layer";

      targetName.textContent = layerName;
      pickerTargetName.textContent = layerName;
      menu.querySelectorAll("[data-layer-effect-option]").forEach((option) => {
        const definition = getEffectDefinition(option.dataset.layerEffectOption);
        const isEnabled = Boolean(definition && isEligible);

        option.disabled = !isEnabled;
        option.setAttribute("aria-disabled", isEnabled ? "false" : "true");
      });
      blurInput.disabled = !isEligible;
      acceptButton.disabled = !isEligible ||
        !isImplementedEffect(activeEffectType) ||
        (activeEffectType === "gaussian-blur" && radius <= 0);
      resetButton.disabled = !isEligible || radius <= 0;
      blurInput.value = String(radius);
      blurValue.textContent = `${Math.round(radius)} px`;
      panel.classList.toggle("disabled", !isEligible);
    }

    function applyRadius(radius) {
      const layer = getActiveLayer();

      if (!isBlurEligibleLayer(layer)) {
        syncControls();
        return;
      }

      const nextRadius = clamp(radius, 0, MAX_GAUSSIAN_BLUR_RADIUS);

      blurValue.textContent = `${Math.round(nextRadius)} px`;
      namespace.setLayerGaussianBlurRadius(layer.id, nextRadius, {
        history: false,
        source: "layer-effects-preview",
      });
    }

    function filterEffectMenu() {
      const query = String(searchInput?.value || "").trim().toLowerCase();

      menu.querySelectorAll("[data-layer-effects-menu-group]").forEach((group) => {
        let hasVisibleOption = false;

        group.querySelectorAll("[data-layer-effect-option]").forEach((option) => {
          const label = option.dataset.effectLabel || "";
          const isVisible = !query || label.includes(query);

          option.hidden = !isVisible;
          hasVisibleOption = hasVisibleOption || isVisible;
        });

        group.hidden = !hasVisibleOption;
      });
    }

    function handleLayerChange() {
      if (panel.hidden) {
        return;
      }

      const layer = getActiveLayer();

      if (previewSession?.layerId && layer?.id !== previewSession.layerId) {
        showEffectPicker({ cancel: true });
        return;
      }

      syncControls();
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (panel.hidden) {
        if (searchInput) {
          searchInput.value = "";
          filterEffectMenu();
        }
      }
      setOpen(panel.hidden);
    });

    backButton.addEventListener("click", () => {
      showEffectPicker({ cancel: true });
    });

    menu.addEventListener("click", (event) => {
      const option = event.target?.closest?.("[data-layer-effect-option]");

      if (!option || option.disabled) {
        return;
      }

      openEffectEditor(option.dataset.layerEffectOption);
    });

    searchInput?.addEventListener("input", filterEffectMenu);

    blurInput.addEventListener("input", () => {
      applyRadius(blurInput.value);
    });

    resetButton.addEventListener("click", () => {
      blurInput.value = "0";
      applyRadius(0);
    });

    acceptButton.addEventListener("click", () => {
      if (acceptButton.disabled) {
        return;
      }

      const didRasterize = namespace.rasterizeActiveLayerEffects?.({
        beforeState: previewSession?.beforeState || null,
      }) === true;

      if (didRasterize) {
        closePanel({ cancel: false });
      } else {
        syncControls();
      }
    });

    closeButton.addEventListener("click", () => {
      closePanel({ cancel: true });
    });

    panelCloseButton.addEventListener("click", () => {
      closePanel({ cancel: true });
    });

    document.addEventListener("pointerdown", (event) => {
      if (
        panel.hidden ||
        event.target instanceof Node && (panel.contains(event.target) || button.contains(event.target))
      ) {
        return;
      }

      closePanel({ cancel: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePanel({ cancel: true });
      }
    });

    window.addEventListener("resize", positionPanel);
    window.addEventListener("cbo:document-layers-change", handleLayerChange);
    window.addEventListener("cbo:layer-effects-rasterized", handleLayerChange);
    setEffectView("");
    filterEffectMenu();
    syncControls();
  };
})(window.CBO = window.CBO || {});
