window.CBO = window.CBO || {};

window.CBO.initBrushStudio = function initBrushStudio() {
  const editorPage = document.querySelector(".editor-page");
  const studioCategories = ["BASIC", "TEXTURE", "PRESSURE"];
  const studioSettings = {
    BASIC: {
      randomized: false,
      spacing: 50,
    },
  };
  const clampPercentage = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

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

    selectedName.textContent = selectedCategory;
    name.textContent = "SPACING";
    valueUnit.textContent = "%";
    randomizedName.textContent = "RANDOMIZED";

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

    function setRandomizedValue(isRandomized) {
      studioSettings.BASIC.randomized = isRandomized;
      randomizedToggle.classList.toggle("active", isRandomized);
      randomizedToggle.setAttribute("aria-pressed", String(isRandomized));
      randomizedToggle.textContent = isRandomized ? "ON" : "OFF";
    }

    function setSpacingValue(value) {
      const spacing = clampPercentage(value);

      studioSettings.BASIC.spacing = spacing;
      slider.value = String(spacing);
      valueInput.value = String(spacing);
      slider.style.setProperty("--brush-studio-range-progress", `${spacing}%`);
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

    value.append(valueInput, valueUnit);
    header.append(name, value);
    setting.append(header, slider);
    randomizedSetting.append(randomizedName, randomizedToggle);
    setRandomizedValue(studioSettings.BASIC.randomized);
    settingsPanel.replaceChildren(selectedName, setting, randomizedSetting);
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
