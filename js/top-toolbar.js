window.CBO = window.CBO || {};

const TRANSFORM_MODE_ICONS = Object.freeze({
  freeTransform: `
    <svg class="lucide lucide-scaling-icon lucide-scaling" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M14 15H9v-5" />
      <path d="M16 3h5v5" />
      <path d="M21 3 9 15" />
    </svg>
  `,
  perspectiveDistort: `
    <svg class="transform-mode-fill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.3,2H6.7c-1.2,0-2.4,1-2.5,2.3l-1.7,13.9c-.3,2.1.9,3.8,2.5,3.8h14c1.7,0,2.8-1.8,2.5-3.8l-1.7-13.9c-.2-1.3-1.3-2.3-2.5-2.3ZM18.2,4.3l.5,5.3h-5.9V3.5c0,0,4.6,0,4.6,0,.4,0,.8.4.9.8ZM6.6,3.5h4.6v6.1h-6l.5-5.3c0-.4.4-.8.9-.8ZM4.4,18.2l.7-6.6h6.1v7.8h-5.9c-.5,0-.9-.6-.8-1.2ZM18.8,19.4h-5.8v-7.8c0,0,6,0,6,0l.7,6.6c0,.7-.3,1.2-.8,1.2Z" />
    </svg>
  `,
  cancelTransform: `
    <svg class="lucide lucide-x-icon lucide-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  `,
  acceptTransform: `
    <svg class="lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  `,
});

window.CBO.initTopToolbar = function initTopToolbar() {
  const editorPage = document.querySelector(".editor-page");
  const BrushDefaults = window.CBO.BrushDefaults;
  const defaultBrushSettings = BrushDefaults.settings;
  const brushSizeMax = BrushDefaults.brushSizeMax || 500;

  if (!editorPage) {
    return;
  }

  if (document.querySelector(".top-toolbar-dock")) {
    return;
  }

  const dock = document.createElement("div");
  dock.className = "top-toolbar-dock";
  dock.setAttribute("aria-label", "Paint controls");
  dock.dataset.tooltipZone = "";
  window.CBO.brushSettings = BrushDefaults.createSettings(window.CBO.brushSettings);

  dock.innerHTML = `
    <nav class="bottom-toolbar transform-mode-toolbar" aria-label="Transform toolbar" data-transform-mode-toolbar hidden>
      <button class="transform-mode-button active" type="button" aria-label="FREE TRANSFORM" aria-pressed="true" data-tooltip="FREE TRANSFORM" data-transform-mode="free">
        ${TRANSFORM_MODE_ICONS.freeTransform}
      </button>
      <button class="transform-mode-button" type="button" aria-label="PERSPECTIVE DISTORTION" aria-pressed="false" data-tooltip="PERSPECTIVE DISTORTION" data-transform-mode="perspective">
        ${TRANSFORM_MODE_ICONS.perspectiveDistort}
      </button>
      <label class="transform-angle-control" data-tooltip="ROTATION ANGLE" data-transform-angle-control hidden>
        <svg class="transform-angle-icon lucide lucide-rotate-ccw-icon lucide-rotate-ccw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <input class="transform-angle-input" type="number" min="-360" max="360" step="1" value="0" aria-label="Rotation angle" autocomplete="off" data-transform-angle-input />
        <span class="transform-angle-unit" aria-hidden="true">°</span>
      </label>
      <div class="transform-mode-divider" aria-hidden="true" data-raster-transform-action-divider hidden></div>
      <button class="transform-mode-button transform-action-button transform-action-cancel" type="button" aria-label="ANNULLA TRASFORMAZIONE" data-tooltip="ANNULLA TRASFORMAZIONE" data-raster-transform-action="cancel" hidden disabled>
        ${TRANSFORM_MODE_ICONS.cancelTransform}
      </button>
      <button class="transform-mode-button transform-action-button transform-action-accept" type="button" aria-label="ACCETTA TRASFORMAZIONE" data-tooltip="ACCETTA TRASFORMAZIONE" data-raster-transform-action="accept" hidden disabled>
        ${TRANSFORM_MODE_ICONS.acceptTransform}
      </button>
    </nav>
    <div class="brush-quick-controls" data-brush-quick-controls hidden>
      <label class="bottom-toolbar brush-quick-toolbar">
        <span class="brush-quick-label">SIZE</span>
        <input class="brush-quick-range" type="range" min="1" max="${brushSizeMax}" step="1" data-brush-quick-input="radius" aria-label="Brush size" />
        <span class="brush-quick-value" data-brush-quick-value="radius"></span>
      </label>
      <label class="bottom-toolbar brush-quick-toolbar">
        <span class="brush-quick-label">OPACITY</span>
        <input class="brush-quick-range" type="range" min="0" max="100" step="1" data-brush-quick-input="opacity" aria-label="Brush opacity" />
        <span class="brush-quick-value" data-brush-quick-value="opacity"></span>
      </label>
    </div>
    <nav class="bottom-toolbar top-layers-toolbar" aria-label="Layers toolbar">
      <button class="tool-button top-layers-button" type="button" aria-label="LAYERS" aria-pressed="false" data-tooltip="LAYERS" data-drawer-sync="layers">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
          <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
          <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
        </svg>
      </button>
      <button class="tool-button top-rasterize-text-button" type="button" aria-label="RASTERIZE" aria-pressed="false" data-tooltip="RASTERIZE TEXT" data-rasterize-text hidden>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4h6v6H4z" />
          <path d="M14 4h6v6h-6z" />
          <path d="M4 14h6v6H4z" />
          <path d="M14 14h6v6h-6z" />
          <path d="M10 12h4" />
          <path d="M12 10v4" />
        </svg>
      </button>
    </nav>
    <nav class="bottom-toolbar top-toolbar" aria-label="Paint toolbar">
      <div class="tool-group" aria-label="Brush tools">
        <button class="tool-button" type="button" aria-label="BRUSH" aria-pressed="false" data-tooltip="BRUSH" data-toolset-primary="top-brush" data-tool-sync="brush" data-tool-mode="brush" data-tool>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m11 10 3 3" />
            <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" />
            <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />
          </svg>
        </button>
        <button class="tool-button tool-menu-button" type="button" aria-label="Brush tools" aria-pressed="false" data-tooltip="Brush tools">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span class="tool-popover" aria-hidden="true">
            <span class="popover-option active" data-toolset-option="top-brush" data-label="BRUSH">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m11 10 3 3" />
                <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" />
                <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />
              </svg>
              <span class="popover-label">BRUSH</span>
              <span class="popover-key"></span>
            </span>
          </span>
        </button>
      </div>
      <button class="tool-button" type="button" aria-label="SMUDGE" aria-pressed="false" data-tooltip="SMUDGE" data-tool-sync="smudge" data-tool-mode="smudge" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 14a8 8 0 0 1-8 8" />
          <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
          <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
          <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
      <button class="tool-button" type="button" aria-label="ERASER" aria-pressed="false" data-tooltip="ERASER" data-tool-mode="eraser" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
          <path d="m5.082 11.09 8.828 8.828" />
        </svg>
      </button>
      <button class="tool-button color-picker-button" type="button" aria-label="COLOR" aria-expanded="false" data-tooltip="COLOR">
        <span class="color-picker-swatch" aria-hidden="true"></span>
      </button>
    </nav>
  `;

  editorPage.appendChild(dock);

  const layersButton = dock.querySelector(".top-layers-button");
  const rasterizeTextButton = dock.querySelector("[data-rasterize-text]");
  const transformModeToolbar = dock.querySelector("[data-transform-mode-toolbar]");
  const transformModeButtons = dock.querySelectorAll("[data-transform-mode]");
  const transformAngleControl = dock.querySelector("[data-transform-angle-control]");
  const transformAngleInput = dock.querySelector("[data-transform-angle-input]");
  const rasterTransformActionDivider = dock.querySelector("[data-raster-transform-action-divider]");
  const rasterTransformActionButtons = dock.querySelectorAll("[data-raster-transform-action]");
  const quickControls = dock.querySelector("[data-brush-quick-controls]");
  const quickInputs = dock.querySelectorAll("[data-brush-quick-input]");
  const quickValues = dock.querySelectorAll("[data-brush-quick-value]");
  let selectedTransformMode = "free";
  let isResizeToolActive = false;
  let isRotateToolActive = false;
  let isRasterTransformPending = false;
  let isSyncingTransformAngle = false;
  const allowedTransformModes = new Set(["free", "perspective"]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function getBrushSettings() {
    window.CBO.brushSettings = BrushDefaults.createSettings(window.CBO.brushSettings);

    return window.CBO.brushSettings;
  }

  function getControlDisplayValue(key, settings = getBrushSettings()) {
    if (key === "opacity") {
      return clamp(Math.round(Number(settings.opacity ?? defaultBrushSettings.opacity) * 100), 0, 100);
    }

    return clamp(Math.round(Number(settings.radius ?? defaultBrushSettings.radius)), 1, brushSizeMax);
  }

  function updateRangeProgress(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty("--brush-quick-range-progress", `${progress}%`);
  }

  function syncQuickControls() {
    const settings = getBrushSettings();

    quickInputs.forEach((input) => {
      const key = input.dataset.brushQuickInput;
      const displayValue = getControlDisplayValue(key, settings);

      input.value = String(displayValue);
      updateRangeProgress(input);
    });

    quickValues.forEach((valueElement) => {
      const key = valueElement.dataset.brushQuickValue;
      const displayValue = getControlDisplayValue(key, settings);

      valueElement.textContent = key === "opacity" ? `${displayValue}%` : `${displayValue}px`;
    });
  }

  function dispatchBrushSettings() {
    window.dispatchEvent(
      new CustomEvent("cbo:brush-settings-change", {
        detail: {
          source: "quick-controls",
          persistBrushPreset: false,
          settings: { ...getBrushSettings() },
        },
      }),
    );
  }

  function updateBrushSetting(key, displayValue) {
    const settings = getBrushSettings();

    if (key === "opacity") {
      settings.opacity = clamp(displayValue, 0, 100) / 100;
    } else if (key === "radius") {
      settings.radius = clamp(displayValue, 1, brushSizeMax);
    }

    syncQuickControls();
    dispatchBrushSettings();
  }

  function showBrushQuickControls(isVisible) {
    if (!quickControls) {
      return;
    }

    quickControls.hidden = !isVisible;

    if (isVisible) {
      syncQuickControls();
    }
  }

  function setTransformMode(mode, options = {}) {
    const normalizedMode = String(mode || "").trim().toLowerCase();

    if (!allowedTransformModes.has(normalizedMode)) {
      return;
    }

    selectedTransformMode = normalizedMode;

    transformModeButtons.forEach((button) => {
      const isActive = button.dataset.transformMode === selectedTransformMode;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    window.CBO.transformMode = selectedTransformMode;

    if (options.emit !== false) {
      window.dispatchEvent(
        new CustomEvent("cbo:transform-mode-change", {
          detail: {
            mode: selectedTransformMode,
            source: options.source || "transform-mode-toolbar",
          },
        }),
      );
    }
  }

  function showTransformModeToolbar(isVisible) {
    if (!transformModeToolbar) {
      return;
    }

    isResizeToolActive = Boolean(isVisible);
    transformModeToolbar.hidden = !isVisible;

    if (!isVisible) {
      isRasterTransformPending = false;
    }

    if (isVisible) {
      setTransformMode(selectedTransformMode, { emit: false });
    }

    syncRasterTransformActions();
  }

  function showTransformAngleControl(isVisible) {
    if (!transformAngleControl) {
      return;
    }

    transformAngleControl.hidden = !isVisible;
  }

  function syncTransformAngleInput(degrees = 0) {
    if (!transformAngleInput) {
      return;
    }

    isSyncingTransformAngle = true;
    transformAngleInput.value = String(degrees);
    isSyncingTransformAngle = false;
  }

  function dispatchTransformAngleInput() {
    if (!transformAngleInput || isSyncingTransformAngle) {
      return;
    }

    const degrees = Number(transformAngleInput.value);

    if (!Number.isFinite(degrees)) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("cbo:raster-transform-rotation-input", {
        detail: {
          degrees,
          source: "transform-angle-control",
        },
      }),
    );
  }

  function syncRasterTransformActions() {
    const shouldShow = isResizeToolActive && isRasterTransformPending;

    if (rasterTransformActionDivider) {
      rasterTransformActionDivider.hidden = !shouldShow;
    }

    rasterTransformActionButtons.forEach((button) => {
      button.hidden = !shouldShow;
      button.disabled = !shouldShow;
    });
  }

  function getActiveLayer() {
    const layerModel = window.CBO.documentLayerModel;

    return layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
  }

  function isVectorTextLayer(layer) {
    return layer?.type === "vector-text" || layer?.type === "text" || layer?.kind === "text";
  }

  function isRasterizableImageLayer(layer) {
    return layer?.type === "image" &&
      layer.locked !== true &&
      typeof window.CBO.rasterizeActiveImageLayer === "function";
  }

  function hasRasterizableLayerEffects(layer) {
    return window.CBO.hasRasterizableLayerEffects?.(layer) === true &&
      typeof window.CBO.rasterizeActiveLayerEffects === "function";
  }

  function syncRasterizeTextButton() {
    if (!rasterizeTextButton) {
      return;
    }

    const activeLayer = getActiveLayer();
    const canRasterizeText = isVectorTextLayer(activeLayer) &&
      typeof window.CBO.rasterizeActiveVectorTextLayer === "function";
    const canRasterizeEffects = !canRasterizeText && hasRasterizableLayerEffects(activeLayer);
    const canRasterizeImage = !canRasterizeText && !canRasterizeEffects && isRasterizableImageLayer(activeLayer);
    const canRasterize = canRasterizeText || canRasterizeEffects || canRasterizeImage;
    const tooltip = canRasterizeEffects
      ? "RASTERIZE EFFECTS"
      : canRasterizeImage
        ? "RASTERIZE IMAGE"
        : "RASTERIZE TEXT";

    rasterizeTextButton.hidden = !canRasterize;
    rasterizeTextButton.disabled = !canRasterize;
    rasterizeTextButton.dataset.rasterizeMode = canRasterizeEffects
      ? "effects"
      : canRasterizeImage
        ? "image"
        : "text";
    rasterizeTextButton.dataset.tooltip = tooltip;
  }

  layersButton.addEventListener("click", () => {
    if (window.CBO.openDrawerPanel) {
      window.CBO.openDrawerPanel("layers");
    }
  });

  rasterizeTextButton?.addEventListener("click", async () => {
    if (rasterizeTextButton.disabled) {
      return;
    }

    rasterizeTextButton.disabled = true;
    rasterizeTextButton.classList.add("active");

    try {
      if (rasterizeTextButton.dataset.rasterizeMode === "effects") {
        await window.CBO.rasterizeActiveLayerEffects?.();
      } else if (rasterizeTextButton.dataset.rasterizeMode === "image") {
        await window.CBO.rasterizeActiveImageLayer?.();
      } else {
        await window.CBO.rasterizeActiveVectorTextLayer?.();
      }
    } catch (error) {
      console.warn("Impossibile rasterizzare il layer attivo.", error);
    } finally {
      rasterizeTextButton.classList.remove("active");
      syncRasterizeTextButton();
    }
  });

  quickInputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateBrushSetting(input.dataset.brushQuickInput, input.value);
    });
  });

  transformAngleInput?.addEventListener("input", dispatchTransformAngleInput);

  transformModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTransformMode(button.dataset.transformMode, { source: "transform-mode-toolbar" });
    });
  });

  rasterTransformActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("cbo:raster-transform-action", {
          detail: {
            action: button.dataset.rasterTransformAction,
            source: "transform-mode-toolbar",
          },
        }),
      );
    });
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();
    const syncGroup = String(event.detail?.syncGroup || "").toLowerCase();
    const isBrush = label === "BRUSH" || label === "ERASER" || toolMode === "eraser" || (toolMode === "brush" && syncGroup === "brush");
    const isResize = label === "RESIZE" || toolMode === "resize";
    const isRotate = label === "ROTATE" || toolMode === "rotate";

    isRotateToolActive = isRotate;
    showBrushQuickControls(isBrush);
    showTransformModeToolbar(isResize || isRotate);
    showTransformAngleControl(isRotate);
  });

  window.addEventListener("cbo:raster-transform-state-change", (event) => {
    const detail = event.detail || {};

    isResizeToolActive = Boolean(event.detail?.active);
    isRotateToolActive = detail.toolMode === "rotate";
    isRasterTransformPending = Boolean(detail.pending);
    showTransformAngleControl(isRotateToolActive && detail.hasBounds === true);
    syncTransformAngleInput(detail.rotationDegrees ?? 0);
    syncRasterTransformActions();
  });

  window.addEventListener("cbo:document-layers-change", syncRasterizeTextButton);
  window.addEventListener("cbo:vector-text-rasterized", syncRasterizeTextButton);
  window.addEventListener("cbo:layer-effects-rasterized", syncRasterizeTextButton);
  window.addEventListener("cbo:image-layer-rasterized", syncRasterizeTextButton);
  window.addEventListener("cbo:brush-settings-change", syncQuickControls);
  setTransformMode(selectedTransformMode, { emit: false });
  syncRasterizeTextButton();
  syncQuickControls();
};
