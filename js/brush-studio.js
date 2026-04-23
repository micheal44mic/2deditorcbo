window.CBO = window.CBO || {};

window.CBO.initBrushStudio = function initBrushStudio() {
  const editorPage = document.querySelector(".editor-page");
  const studioCategories = ["BASIC", "TEXTURE", "PRESSURE"];
  const studioSettings = {
    BASIC: {
      randomized: false,
      size: 0,
      spacing: 50,
    },
  };
  const clampPercentage = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  const clampSignedPercentage = (value) => Math.min(100, Math.max(-100, Math.round(Number(value) || 0)));

  if (!editorPage || editorPage.dataset.brushStudioReady === "true") {
    return;
  }

  editorPage.dataset.brushStudioReady = "true";
  editorPage.insertAdjacentHTML(
    "beforeend",
    `
      <section class="brush-studio-panel" aria-label="Brush studio" data-brush-studio hidden>
        <div class="brush-studio-column brush-studio-categories-column">
          <h2 class="brush-studio-title">BRUSH STUDIO</h2>
          <div class="brush-studio-categories" aria-label="Brush studio categories" data-brush-studio-categories></div>
        </div>
        <div class="brush-studio-column brush-studio-selection-column">
          <div class="brush-studio-settings" data-brush-studio-settings></div>
        </div>
        <div class="brush-studio-column brush-studio-drawing-column">
          <div class="brush-studio-drawing-header">
            <h2 class="brush-studio-drawing-title">DRAWING PAD</h2>
            <div class="brush-studio-drawing-actions">
              <button class="brush-studio-cancel-button" type="button">CANCEL</button>
              <button class="brush-studio-check-button" type="button" aria-label="Confirm drawing pad">
                <svg class="brush-studio-check-icon lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>
    `,
  );

  const brushStudio = editorPage.querySelector("[data-brush-studio]");
  const categoryList = editorPage.querySelector("[data-brush-studio-categories]");
  const settingsPanel = editorPage.querySelector("[data-brush-studio-settings]");
  let selectedCategory = studioCategories[0];

  // Temporary demo categories. Replace this array later with the real Brush Studio data.
  function renderCategories() {
    if (!categoryList) {
      return;
    }

    categoryList.replaceChildren(
      ...studioCategories.map((categoryName) => {
        const categoryButton = document.createElement("button");
        const isActive = categoryName === selectedCategory;

        categoryButton.className = "brush-studio-category";
        categoryButton.type = "button";
        categoryButton.textContent = categoryName;
        categoryButton.setAttribute("aria-pressed", String(isActive));
        categoryButton.classList.toggle("active", isActive);
        categoryButton.addEventListener("click", () => {
          selectedCategory = categoryName;
          renderStudioContent();
        });

        return categoryButton;
      }),
    );
  }

  function renderSpacingSetting() {
    if (!settingsPanel) {
      return;
    }

    const spacingValue = studioSettings.BASIC.spacing;
    const selectedName = document.createElement("div");
    const setting = document.createElement("div");
    const header = document.createElement("div");
    const name = document.createElement("div");
    const value = document.createElement("label");
    const valueInput = document.createElement("input");
    const valueUnit = document.createElement("span");
    const slider = document.createElement("input");
    const randomizedSetting = document.createElement("div");
    const randomizedName = document.createElement("div");
    const randomizedToggle = document.createElement("button");
    const sizeValue = studioSettings.BASIC.size;
    const sizeSetting = document.createElement("div");
    const sizeHeader = document.createElement("div");
    const sizeName = document.createElement("div");
    const sizeValueLabel = document.createElement("label");
    const sizeValueInput = document.createElement("input");
    const sizeValueUnit = document.createElement("span");
    const sizeSlider = document.createElement("input");

    selectedName.className = "brush-studio-selected-name";
    setting.className = "brush-studio-setting";
    header.className = "brush-studio-setting-header";
    name.className = "brush-studio-setting-name";
    value.className = "brush-studio-setting-value";
    valueInput.className = "brush-studio-setting-value-input";
    valueUnit.className = "brush-studio-setting-value-unit";
    slider.className = "brush-studio-range";
    randomizedSetting.className = "brush-studio-setting brush-studio-toggle-setting";
    randomizedName.className = "brush-studio-setting-name";
    randomizedToggle.className = "brush-studio-toggle";
    sizeSetting.className = "brush-studio-setting";
    sizeHeader.className = "brush-studio-setting-header";
    sizeName.className = "brush-studio-setting-name";
    sizeValueLabel.className = "brush-studio-setting-value";
    sizeValueInput.className = "brush-studio-setting-value-input";
    sizeValueUnit.className = "brush-studio-setting-value-unit";
    sizeSlider.className = "brush-studio-range brush-studio-range-centered";
    randomizedToggle.innerHTML = `
      <span class="brush-studio-toggle-knob" aria-hidden="true">
        <svg class="brush-studio-toggle-check lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      </span>
    `;

    selectedName.textContent = selectedCategory;
    name.textContent = "SPACING";
    valueUnit.textContent = "%";
    randomizedName.textContent = "RANDOMIZED";
    sizeName.textContent = "SIZE";
    sizeValueUnit.textContent = "%";

    valueInput.type = "number";
    valueInput.min = "0";
    valueInput.max = "100";
    valueInput.step = "1";
    valueInput.value = String(spacingValue);
    valueInput.setAttribute("aria-label", "SPACING PERCENTAGE");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(spacingValue);
    slider.setAttribute("aria-label", "SPACING");
    slider.style.setProperty("--brush-studio-range-progress", `${spacingValue}%`);
    randomizedToggle.type = "button";
    randomizedToggle.setAttribute("aria-label", "RANDOMIZED");
    sizeValueInput.type = "number";
    sizeValueInput.min = "-100";
    sizeValueInput.max = "100";
    sizeValueInput.step = "1";
    sizeValueInput.value = String(sizeValue);
    sizeValueInput.setAttribute("aria-label", "SIZE PERCENTAGE");
    sizeSlider.type = "range";
    sizeSlider.min = "-100";
    sizeSlider.max = "100";
    sizeSlider.value = String(sizeValue);
    sizeSlider.setAttribute("aria-label", "SIZE");

    function setCenteredRangeFill(rangeInput, value) {
      const progress = ((value + 100) / 200) * 100;
      const start = Math.min(50, progress);
      const end = Math.max(50, progress);

      rangeInput.style.setProperty("--brush-studio-range-start", `${start}%`);
      rangeInput.style.setProperty("--brush-studio-range-end", `${end}%`);
    }

    function setRandomizedValue(isRandomized) {
      studioSettings.BASIC.randomized = isRandomized;
      randomizedToggle.classList.toggle("active", isRandomized);
      randomizedToggle.setAttribute("aria-pressed", String(isRandomized));
    }

    function setSpacingValue(value) {
      const spacing = clampPercentage(value);

      studioSettings.BASIC.spacing = spacing;
      slider.value = String(spacing);
      valueInput.value = String(spacing);
      slider.style.setProperty("--brush-studio-range-progress", `${spacing}%`);
    }

    function setSizeValue(value) {
      const size = clampSignedPercentage(value);

      studioSettings.BASIC.size = size;
      sizeSlider.value = String(size);
      sizeValueInput.value = String(size);
      setCenteredRangeFill(sizeSlider, size);
    }

    slider.addEventListener("input", () => {
      setSpacingValue(slider.value);
    });
    valueInput.addEventListener("input", () => {
      if (valueInput.value.trim() === "") {
        return;
      }

      setSpacingValue(valueInput.value);
    });
    valueInput.addEventListener("blur", () => {
      setSpacingValue(valueInput.value || studioSettings.BASIC.spacing);
    });
    valueInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        valueInput.blur();
      }
    });
    randomizedToggle.addEventListener("click", () => {
      setRandomizedValue(!studioSettings.BASIC.randomized);
    });
    sizeSlider.addEventListener("input", () => {
      setSizeValue(sizeSlider.value);
    });
    sizeValueInput.addEventListener("input", () => {
      if (sizeValueInput.value.trim() === "") {
        return;
      }

      setSizeValue(sizeValueInput.value);
    });
    sizeValueInput.addEventListener("blur", () => {
      setSizeValue(sizeValueInput.value || studioSettings.BASIC.size);
    });
    sizeValueInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        sizeValueInput.blur();
      }
    });

    value.append(valueInput, valueUnit);
    header.append(name, value);
    setting.append(header, slider);
    randomizedSetting.append(randomizedName, randomizedToggle);
    sizeValueLabel.append(sizeValueInput, sizeValueUnit);
    sizeHeader.append(sizeName, sizeValueLabel);
    sizeSetting.append(sizeHeader, sizeSlider);
    setRandomizedValue(studioSettings.BASIC.randomized);
    setSizeValue(studioSettings.BASIC.size);
    settingsPanel.replaceChildren(selectedName, setting, randomizedSetting, sizeSetting);
  }

  function renderSelectedCategoryName() {
    if (!settingsPanel) {
      return;
    }

    const selectedName = document.createElement("div");

    selectedName.className = "brush-studio-selected-name";
    selectedName.textContent = selectedCategory;
    settingsPanel.replaceChildren(selectedName);
  }

  function renderSettings() {
    if (selectedCategory === "BASIC") {
      renderSpacingSetting();
      return;
    }

    renderSelectedCategoryName();
  }

  function renderStudioContent() {
    renderCategories();
    renderSettings();
  }

  function openBrushStudio() {
    if (brushStudio) {
      renderStudioContent();
      brushStudio.hidden = false;
    }
  }

  function closeBrushStudio() {
    if (brushStudio) {
      brushStudio.hidden = true;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const studioButton = target.closest(".brushes-panel-studio-button, .brushes-gallery-studio-button");

    if (studioButton) {
      openBrushStudio();
      return;
    }

    const clickedInsideBrushStudio = event.composedPath().includes(brushStudio);

    if (brushStudio && !brushStudio.hidden && !clickedInsideBrushStudio) {
      closeBrushStudio();
    }
  });

  renderStudioContent();
};
