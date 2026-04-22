window.CBO = window.CBO || {};

window.CBO.initTopToolbar = function initTopToolbar() {
  const editorPage = document.querySelector(".editor-page");

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

  dock.innerHTML = `
    <nav class="bottom-toolbar top-layers-toolbar" aria-label="Layers toolbar">
      <button class="tool-button top-layers-button" type="button" aria-label="LAYERS" aria-pressed="false" data-tooltip="LAYERS">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
          <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
          <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
        </svg>
      </button>
    </nav>
    <nav class="bottom-toolbar top-toolbar" aria-label="Paint toolbar">
      <div class="tool-group" aria-label="Brush tools">
        <button class="tool-button" type="button" aria-label="BRUSH" aria-pressed="false" data-tooltip="BRUSH" data-toolset-primary="top-brush" data-tool-sync="brush" data-tool>
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
      <button class="tool-button" type="button" aria-label="SMUDGE" aria-pressed="false" data-tooltip="SMUDGE" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 14a8 8 0 0 1-8 8" />
          <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
          <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
          <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
      <button class="tool-button" type="button" aria-label="ERASER" aria-pressed="false" data-tooltip="ERASER" data-tool>
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

  layersButton.addEventListener("click", () => {
    layersButton.classList.add("active");
    window.setTimeout(() => {
      layersButton.classList.remove("active");
    }, 140);
  });
};
