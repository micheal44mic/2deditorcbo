window.CBO = window.CBO || {};

(function registerLayerEffectsPanel(namespace) {
  const MAX_GAUSSIAN_BLUR_RADIUS = 40;

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
      <div class="layer-effects-header">
        <div class="layer-effects-heading">
          <span class="layer-effects-title">Effects</span>
          <span class="layer-effects-target" data-layer-effects-target>Layer</span>
        </div>
        <div class="layer-effects-header-actions">
          <button class="layer-effects-icon-button" type="button" aria-label="Apply gaussian blur" data-layer-effects-accept>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button class="layer-effects-icon-button" type="button" aria-label="Close effects" data-layer-effects-close>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
      <section class="layer-effects-section" aria-label="Gaussian blur">
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
    `;

    const targetName = panel.querySelector("[data-layer-effects-target]");
    const blurInput = panel.querySelector("[data-layer-blur-input]");
    const blurValue = panel.querySelector("[data-layer-blur-value]");
    const acceptButton = panel.querySelector("[data-layer-effects-accept]");
    const resetButton = panel.querySelector("[data-layer-blur-reset]");
    const closeButton = panel.querySelector("[data-layer-effects-close]");
    let previewSession = null;

    document.body.append(panel);

    function getLayerModel() {
      return namespace.documentLayerModel;
    }

    function getActiveLayer() {
      const layerModel = getLayerModel();

      return layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
    }

    function startPreviewSession() {
      const layerModel = getLayerModel();
      const layer = getActiveLayer();

      previewSession = isBlurEligibleLayer(layer)
        ? {
            beforeState: namespace.documentHistory?.getLayerSnapshot?.(layerModel) ||
              getLayerStateSnapshot(layerModel),
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

    function closePanel(options = {}) {
      const shouldCancel = options.cancel !== false;

      if (shouldCancel) {
        restorePreviewSession();
      } else {
        previewSession = null;
      }

      panel.hidden = true;
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    }

    function setOpen(isOpen) {
      if (!isOpen) {
        closePanel({ cancel: true });
        return;
      }

      startPreviewSession();
      panel.hidden = !isOpen;
      button.classList.toggle("active", isOpen);
      button.setAttribute("aria-pressed", isOpen ? "true" : "false");

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

      targetName.textContent = isEligible ? layer.name || "Layer" : "No layer";
      blurInput.disabled = !isEligible;
      acceptButton.disabled = !isEligible || radius <= 0;
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

    button.addEventListener("click", (event) => {
      event.preventDefault();
      setOpen(panel.hidden);
    });

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
    window.addEventListener("cbo:document-layers-change", syncControls);
    window.addEventListener("cbo:layer-effects-rasterized", syncControls);
    syncControls();
  };
})(window.CBO = window.CBO || {});
