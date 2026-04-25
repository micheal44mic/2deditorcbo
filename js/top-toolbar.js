window.CBO = window.CBO || {};

window.CBO.initTopToolbar = function initTopToolbar() {
  const editorPage = document.querySelector(".editor-page");
  const defaultBrushSettings = {
    radius: 18,
    opacity: 0.92,
  };

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
  window.CBO.brushSettings = {
    ...defaultBrushSettings,
    ...(window.CBO.brushSettings || {}),
  };

  dock.innerHTML = `
    <div class="brush-quick-controls" data-brush-quick-controls hidden>
      <label class="bottom-toolbar brush-quick-toolbar">
        <span class="brush-quick-label">SIZE</span>
        <input class="brush-quick-range" type="range" min="1" max="120" step="1" data-brush-quick-input="radius" aria-label="Brush size" />
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
      <button class="tool-button" type="button" aria-label="SMUDGE" aria-pressed="false" data-tooltip="SMUDGE" data-tool-mode="smudge" data-tool>
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
  const quickControls = dock.querySelector("[data-brush-quick-controls]");
  const quickInputs = dock.querySelectorAll("[data-brush-quick-input]");
  const quickValues = dock.querySelectorAll("[data-brush-quick-value]");

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function getBrushSettings() {
    window.CBO.brushSettings = {
      ...defaultBrushSettings,
      ...(window.CBO.brushSettings || {}),
    };

    return window.CBO.brushSettings;
  }

  function getControlDisplayValue(key, settings = getBrushSettings()) {
    if (key === "opacity") {
      return clamp(Math.round(Number(settings.opacity ?? defaultBrushSettings.opacity) * 100), 0, 100);
    }

    return clamp(Math.round(Number(settings.radius ?? defaultBrushSettings.radius)), 1, 120);
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
      settings.radius = clamp(displayValue, 1, 120);
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

  layersButton.addEventListener("click", () => {
    if (window.CBO.openDrawerPanel) {
      window.CBO.openDrawerPanel("layers");
    }
  });

  quickInputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateBrushSetting(input.dataset.brushQuickInput, input.value);
    });
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();
    const syncGroup = String(event.detail?.syncGroup || "").toLowerCase();
    const isBrush = label === "BRUSH" || (toolMode === "brush" && syncGroup === "brush");

    showBrushQuickControls(isBrush);
  });

  window.addEventListener("cbo:brush-settings-change", syncQuickControls);
  syncQuickControls();
};
