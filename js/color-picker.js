window.CBO = window.CBO || {};

window.CBO.initColorPicker = function initColorPicker() {
  const dock = document.querySelector(".top-toolbar-dock");
  const button = document.querySelector(".color-picker-button");
  const swatch = document.querySelector(".color-picker-swatch");

  if (!dock || !button || !swatch || dock.querySelector(".color-picker-popover")) {
    return;
  }

  const state = {
    h: 0,
    s: 0,
    v: 1,
  };
  const slotColors = {
    primary: getInitialSlotColor("primary", "#FFFFFF"),
    secondary: getInitialSlotColor("secondary", "#000000"),
  };
  const presets = [
    "#FFFFFF",
    "#E7E8EA",
    "#B8BBC2",
    "#777D88",
    "#2A2D34",
    "#000000",
    "#EF4444",
    "#F97316",
    "#F59E0B",
    "#EAB308",
    "#84CC16",
    "#22C55E",
    "#14B8A6",
    "#06B6D4",
    "#0EA5E9",
    "#3B82F6",
    "#6366F1",
    "#8B5CF6",
    "#A855F7",
    "#D946EF",
    "#EC4899",
    "#F43F5E",
    "#FCA5A5",
    "#FDE68A",
  ];
  let activeSlot = window.CBO.activeColorSlot === "secondary" ? "secondary" : "primary";

  const popover = document.createElement("div");
  popover.className = "color-picker-popover";
  popover.id = "color-picker-popover";
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Color picker");
  popover.innerHTML = `
    <div class="color-picker-wheel">
      <div class="color-picker-hue-ring" data-color-hue-ring></div>
      <span class="color-picker-hue-handle" data-color-hue-handle></span>
      <div class="color-picker-sv-square" data-color-sv-square>
        <span class="color-picker-sv-handle" data-color-sv-handle></span>
      </div>
    </div>
    <div class="color-picker-slots" aria-label="Color slots">
      <button class="color-picker-eyedropper" type="button" aria-label="Eyedropper" data-color-eyedropper>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" />
          <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" />
          <path d="m2 22 .414-.414" />
        </svg>
      </button>
      <button class="color-picker-slot active" type="button" aria-label="Primary color" aria-pressed="true" data-color-slot="primary"></button>
      <button class="color-picker-slot" type="button" aria-label="Secondary color" aria-pressed="false" data-color-slot="secondary"></button>
    </div>
    <input class="color-picker-hex-input" type="text" value="#FFFFFF" aria-label="Hex color" spellcheck="false" maxlength="7" data-color-hex-input />
    <div class="color-picker-presets" aria-label="Color presets">
      ${presets
        .map(
          (color) =>
            `<button class="color-picker-preset" type="button" aria-label="${color}" data-color-preset="${color}" style="--preset-color: ${color}"></button>`,
        )
        .join("")}
    </div>
    <button class="color-picker-book-button" type="button" aria-label="Color book" data-color-book>COLOR BOOK</button>
  `;

  dock.appendChild(popover);
  button.setAttribute("aria-controls", popover.id);

  const wheel = popover.querySelector(".color-picker-wheel");
  const hueRing = popover.querySelector("[data-color-hue-ring]");
  const hueHandle = popover.querySelector("[data-color-hue-handle]");
  const svSquare = popover.querySelector("[data-color-sv-square]");
  const svHandle = popover.querySelector("[data-color-sv-handle]");
  const slotButtons = popover.querySelectorAll("[data-color-slot]");
  const presetButtons = popover.querySelectorAll("[data-color-preset]");
  const hexInput = popover.querySelector("[data-color-hex-input]");
  let activeControl = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeHexInput(value) {
    const trimmed = String(value || "").trim();
    const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex
        .split("")
        .map((character) => character + character)
        .join("")
        .toUpperCase()}`;
    }

    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return null;
    }

    return `#${hex.toUpperCase()}`;
  }

  function getInitialSlotColor(slot, fallback) {
    const settings = window.CBO.brushSettings || {};
    const selectedColors = window.CBO.selectedColors || {};
    const candidate = slot === "primary"
      ? selectedColors.primary || settings.color || window.CBO.selectedColor
      : selectedColors.secondary || settings.secondaryColor;

    return normalizeHexInput(candidate || fallback) || fallback;
  }

  function hsvToRgb(hue, saturation, value) {
    const chroma = value * saturation;
    const huePrime = hue / 60;
    const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
    const match = value - chroma;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (huePrime >= 0 && huePrime < 1) {
      red = chroma;
      green = x;
    } else if (huePrime >= 1 && huePrime < 2) {
      red = x;
      green = chroma;
    } else if (huePrime >= 2 && huePrime < 3) {
      green = chroma;
      blue = x;
    } else if (huePrime >= 3 && huePrime < 4) {
      green = x;
      blue = chroma;
    } else if (huePrime >= 4 && huePrime < 5) {
      red = x;
      blue = chroma;
    } else {
      red = chroma;
      blue = x;
    }

    return [
      Math.round((red + match) * 255),
      Math.round((green + match) * 255),
      Math.round((blue + match) * 255),
    ];
  }

  function rgbToHex(red, green, blue) {
    return [red, green, blue]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  function hexToRgb(hexColor) {
    const normalized = hexColor.replace("#", "");

    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ];
  }

  function rgbToHsv(red, green, blue) {
    const normalizedRed = red / 255;
    const normalizedGreen = green / 255;
    const normalizedBlue = blue / 255;
    const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
    const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
    const delta = max - min;
    let hue = state.h;

    if (delta) {
      if (max === normalizedRed) {
        hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
      } else if (max === normalizedGreen) {
        hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
      } else {
        hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
      }
    }

    return {
      h: (hue + 360) % 360,
      s: max ? delta / max : 0,
      v: max,
    };
  }

  function setStateFromHex(hexColor) {
    const [red, green, blue] = hexToRgb(hexColor);
    const nextState = rgbToHsv(red, green, blue);

    state.h = nextState.h;
    state.s = nextState.s;
    state.v = nextState.v;
  }

  function getSelectedColor() {
    const [red, green, blue] = hsvToRgb(state.h, state.s, state.v);

    return `#${rgbToHex(red, green, blue)}`;
  }

  function syncColorUi() {
    const selectedColor = slotColors[activeSlot];
    const primaryColor = slotColors.primary;
    const secondaryColor = slotColors.secondary;
    let didSettingsChange = false;

    popover.style.setProperty("--picker-hue", state.h);
    popover.style.setProperty("--primary-color", primaryColor);
    popover.style.setProperty("--secondary-color", secondaryColor);
    swatch.style.setProperty("--selected-color", selectedColor);
    hexInput.value = selectedColor;
    window.CBO.activeColorSlot = activeSlot;
    window.CBO.selectedColor = selectedColor;
    window.CBO.selectedColors = { ...slotColors };
    window.CBO.brushSettings = window.CBO.brushSettings || {};

    if (window.CBO.brushSettings.color !== primaryColor) {
      window.CBO.brushSettings.color = primaryColor;
      didSettingsChange = true;
    }

    if (window.CBO.brushSettings.secondaryColor !== secondaryColor) {
      window.CBO.brushSettings.secondaryColor = secondaryColor;
      didSettingsChange = true;
    }

    if (didSettingsChange) {
      window.dispatchEvent(
        new CustomEvent("cbo:brush-settings-change", {
          detail: {
            source: "color-picker",
            persistBrushPreset: false,
            settings: { ...window.CBO.brushSettings },
          },
        }),
      );
    }

    slotButtons.forEach((slotButton) => {
      const isActive = slotButton.dataset.colorSlot === activeSlot;

      slotButton.classList.toggle("active", isActive);
      slotButton.setAttribute("aria-pressed", String(isActive));
    });

    if (!popover.hidden) {
      updateHandles();
    }
  }

  function updateHandles() {
    const wheelRect = wheel.getBoundingClientRect();

    if (!wheelRect.width) {
      return;
    }

    const wheelRadius = wheelRect.width / 2;
    const hueRadius = wheelRadius * 0.78;
    const hueAngle = (360 - state.h) % 360;
    const hueRadians = (hueAngle * Math.PI) / 180;
    const hueX = wheelRadius + Math.sin(hueRadians) * hueRadius;
    const hueY = wheelRadius - Math.cos(hueRadians) * hueRadius;

    hueHandle.style.left = `${hueX}px`;
    hueHandle.style.top = `${hueY}px`;
    hueHandle.style.background = `hsl(${state.h} 100% 50%)`;
    svHandle.style.left = `${state.s * 100}%`;
    svHandle.style.top = `${(1 - state.v) * 100}%`;
    svHandle.style.background = getSelectedColor();
  }

  function updateColor() {
    const selectedColor = getSelectedColor();

    slotColors[activeSlot] = selectedColor;
    syncColorUi();
  }

  function selectSlot(slot) {
    activeSlot = slot;
    setStateFromHex(slotColors[activeSlot]);
    syncColorUi();
  }

  function setActiveSlotColor(hexColor) {
    setStateFromHex(hexColor);
    slotColors[activeSlot] = getSelectedColor();
    syncColorUi();
  }

  function closeToolMenus() {
    document.querySelectorAll(".tool-menu-button.open").forEach((menuButton) => {
      menuButton.classList.remove("open");
      menuButton.setAttribute("aria-pressed", "false");
    });
  }

  function setOpen(isOpen) {
    popover.hidden = !isOpen;
    button.classList.toggle("open", isOpen);
    button.classList.remove("tooltip-visible");
    button.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      closeToolMenus();
      window.requestAnimationFrame(updateHandles);
    }
  }

  function setHueFromPointer(event, shouldCheckRing = false) {
    const rect = hueRing.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);

    if (shouldCheckRing) {
      const outerRadius = rect.width / 2;
      const innerRadius = outerRadius * 0.56;

      if (distance < innerRadius || distance > outerRadius) {
        return false;
      }
    }

    const hueAngle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90;

    state.h = (360 - ((hueAngle + 360) % 360)) % 360;
    updateColor();
    return true;
  }

  function setSvFromPointer(event) {
    const rect = svSquare.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);

    state.s = rect.width ? x / rect.width : 0;
    state.v = rect.height ? 1 - y / rect.height : 1;
    updateColor();
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(popover.hidden);
  });

  popover.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  hueRing.addEventListener("pointerdown", (event) => {
    if (!setHueFromPointer(event, true)) {
      return;
    }

    event.preventDefault();
    hueRing.setPointerCapture(event.pointerId);
    activeControl = "hue";
  });

  hueHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hueHandle.setPointerCapture(event.pointerId);
    activeControl = "hue";
  });

  svSquare.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    svSquare.setPointerCapture(event.pointerId);
    activeControl = "sv";
    setSvFromPointer(event);
  });

  svHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    svHandle.setPointerCapture(event.pointerId);
    activeControl = "sv";
  });

  slotButtons.forEach((slotButton) => {
    slotButton.addEventListener("click", () => {
      selectSlot(slotButton.dataset.colorSlot);
    });
  });

  presetButtons.forEach((presetButton) => {
    presetButton.addEventListener("click", () => {
      setActiveSlotColor(presetButton.dataset.colorPreset);
    });
  });

  hexInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  hexInput.addEventListener("input", () => {
    const normalizedColor = normalizeHexInput(hexInput.value);

    if (!normalizedColor) {
      return;
    }

    setActiveSlotColor(normalizedColor);
  });

  hexInput.addEventListener("blur", () => {
    const normalizedColor = normalizeHexInput(hexInput.value);

    if (!normalizedColor) {
      hexInput.value = slotColors[activeSlot];
      return;
    }

    setActiveSlotColor(normalizedColor);
  });

  document.addEventListener("pointermove", (event) => {
    if (activeControl === "hue") {
      setHueFromPointer(event);
      return;
    }

    if (activeControl === "sv") {
      setSvFromPointer(event);
    }
  });

  document.addEventListener("pointerup", () => {
    activeControl = null;
  });

  document.addEventListener("click", () => {
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });

  setStateFromHex(slotColors[activeSlot]);
  syncColorUi();
};
