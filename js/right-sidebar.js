window.CBO = window.CBO || {};

window.CBO.initRightSidebar = function initRightSidebar() {
  const panel = document.querySelector(".right-panel");

  if (!panel || panel.dataset.rightSidebarReady === "true") {
    return;
  }

  panel.dataset.rightSidebarReady = "true";
  panel.innerHTML = `
    <div class="right-sidebar-content">
      <div class="right-sidebar-actions right-sidebar-section" aria-label="User actions">
        <button class="right-sidebar-avatar" type="button" aria-label="User profile" data-tooltip="PROFILE">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button class="right-sidebar-share-button" type="button" data-tooltip="SHARE">SHARE</button>
      </div>
      <label class="right-sidebar-project-field right-sidebar-section">
        <span class="right-sidebar-project-label">Project name</span>
        <span class="right-sidebar-project-input-wrap">
          <input class="right-sidebar-project-input" type="text" aria-label="Project name" placeholder="Untitled" autocomplete="off" spellcheck="false" />
        </span>
      </label>
      <section class="smudge-sidebar right-sidebar-section" aria-label="Smudge settings" data-smudge-sidebar hidden>
        <div class="smudge-sidebar-header">
          <h2 class="smudge-sidebar-title">SMUDGE</h2>
          <button class="smudge-sidebar-reset" type="button" data-smudge-reset>RESET</button>
        </div>
        <div class="smudge-sidebar-controls" data-smudge-controls></div>
        <label class="smudge-sidebar-toggle">
          <span class="smudge-sidebar-toggle-label">PRESSURE</span>
          <button class="smudge-sidebar-toggle-button" type="button" aria-pressed="true" data-smudge-pressure>
            <span class="smudge-sidebar-toggle-knob"></span>
          </button>
        </label>
      </section>
    </div>
  `;

  const projectInput = panel.querySelector(".right-sidebar-project-input");
  const smudgeSidebar = panel.querySelector("[data-smudge-sidebar]");
  const smudgeControls = panel.querySelector("[data-smudge-controls]");
  const smudgeReset = panel.querySelector("[data-smudge-reset]");
  const pressureButton = panel.querySelector("[data-smudge-pressure]");
  const storageKey = "cbo-project-name";
  const fallbackSmudgeSettings = {
    radius: 34,
    opacity: 0.78,
    hardness: 0.35,
    spacing: 0.03,
    drag: 0.92,
    pressureAffectsStrength: true,
  };
  const smudgeControlDefs = [
    { key: "radius", label: "SIZE", min: 1, max: 120, step: 1, unit: "PX", fromDisplay: (value) => value, toDisplay: (value) => Math.round(value) },
    { key: "opacity", label: "OPACITY", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "hardness", label: "HARDNESS", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "spacing", label: "SPACING", min: 1, max: 12, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
    { key: "drag", label: "DRAG", min: 0, max: 100, step: 1, unit: "%", fromDisplay: (value) => value / 100, toDisplay: (value) => Math.round(value * 100) },
  ];
  const smudgeControlElements = new Map();

  if (projectInput) {
    projectInput.value = window.localStorage.getItem(storageKey) || "";
    projectInput.addEventListener("input", () => {
      window.localStorage.setItem(storageKey, projectInput.value);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function getDefaultSmudgeSettings() {
    return {
      ...fallbackSmudgeSettings,
      ...(window.CBO.SmudgeBrushes?.wetPaint || {}),
    };
  }

  function getSmudgeSettings() {
    return {
      ...getDefaultSmudgeSettings(),
      ...(window.CBO.smudgeSettings || {}),
    };
  }

  function dispatchSmudgeSettings(settings) {
    window.CBO.smudgeSettings = { ...settings };
    window.dispatchEvent(
      new CustomEvent("cbo:paint-settings-change", {
        detail: {
          tool: "smudge",
          settings: { ...settings },
        },
      }),
    );
  }

  function updateRangeProgress(input, min, max) {
    const progress = ((Number(input.value) - min) / (max - min)) * 100;

    input.style.setProperty("--smudge-sidebar-range-progress", `${progress}%`);
  }

  function syncSmudgeControls() {
    const settings = getSmudgeSettings();

    smudgeControlDefs.forEach((definition) => {
      const elements = smudgeControlElements.get(definition.key);

      if (!elements) {
        return;
      }

      const displayValue = clamp(
        definition.toDisplay(settings[definition.key]),
        definition.min,
        definition.max,
      );

      elements.input.value = String(displayValue);
      elements.value.textContent = String(Math.round(displayValue));
      updateRangeProgress(elements.input, definition.min, definition.max);
    });

    if (pressureButton) {
      const isActive = settings.pressureAffectsStrength !== false;

      pressureButton.classList.toggle("active", isActive);
      pressureButton.setAttribute("aria-pressed", String(isActive));
    }
  }

  function updateSmudgeSetting(key, value) {
    const definition = smudgeControlDefs.find((nextDefinition) => nextDefinition.key === key);

    if (!definition) {
      return;
    }

    const settings = getSmudgeSettings();
    const displayValue = clamp(value, definition.min, definition.max);

    settings[key] = definition.fromDisplay(displayValue);
    dispatchSmudgeSettings(settings);
    syncSmudgeControls();
  }

  function createSmudgeControl(definition) {
    const control = document.createElement("label");
    const header = document.createElement("span");
    const label = document.createElement("span");
    const valueWrap = document.createElement("span");
    const value = document.createElement("span");
    const unit = document.createElement("span");
    const input = document.createElement("input");

    control.className = "smudge-sidebar-control";
    header.className = "smudge-sidebar-control-header";
    label.className = "smudge-sidebar-control-label";
    valueWrap.className = "smudge-sidebar-control-value";
    value.className = "smudge-sidebar-control-number";
    unit.className = "smudge-sidebar-control-unit";
    input.className = "smudge-sidebar-range";

    label.textContent = definition.label;
    unit.textContent = definition.unit;
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.setAttribute("aria-label", definition.label);

    input.addEventListener("input", () => {
      updateSmudgeSetting(definition.key, input.value);
    });

    valueWrap.append(value, unit);
    header.append(label, valueWrap);
    control.append(header, input);
    smudgeControlElements.set(definition.key, { input, value });

    return control;
  }

  function showSmudgeSettings(isVisible) {
    if (!smudgeSidebar) {
      return;
    }

    smudgeSidebar.hidden = !isVisible;

    if (isVisible) {
      syncSmudgeControls();
    }
  }

  function normalizeToolName(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "smudge") {
      return "smudge";
    }

    return "";
  }

  smudgeControlDefs.forEach((definition) => {
    smudgeControls?.append(createSmudgeControl(definition));
  });

  pressureButton?.addEventListener("click", () => {
    const settings = getSmudgeSettings();

    settings.pressureAffectsStrength = settings.pressureAffectsStrength === false;
    dispatchSmudgeSettings(settings);
    syncSmudgeControls();
  });

  smudgeReset?.addEventListener("click", () => {
    dispatchSmudgeSettings(getDefaultSmudgeSettings());
    syncSmudgeControls();
  });

  window.addEventListener("cbo:tool-change", (event) => {
    showSmudgeSettings(normalizeToolName(event.detail?.toolMode || event.detail?.label) === "smudge");
  });

  syncSmudgeControls();
};
