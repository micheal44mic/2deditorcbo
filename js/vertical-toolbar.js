window.CBO = window.CBO || {};

window.CBO.initVerticalToolbar = function initVerticalToolbar() {
  const editorPage = document.querySelector(".editor-page");

  if (!editorPage) {
    return;
  }

  if (document.querySelector(".right-vertical-toolbar-dock")) {
    return;
  }

  const dock = document.createElement("div");
  dock.className = "right-vertical-toolbar-dock";
  dock.setAttribute("aria-label", "Canvas side controls");
  dock.dataset.tooltipZone = "";

  dock.innerHTML = `
    <nav class="bottom-toolbar right-vertical-toolbar" aria-label="Canvas side toolbar">
      ${window.CBO.createMobileTransformTools ? window.CBO.createMobileTransformTools() : ""}
      <div class="tool-group vertical-selection-tool-group" aria-label="Area select tools">
        <button class="tool-button" type="button" aria-label="RECT SELECT" aria-pressed="false" data-tooltip="RECT SELECT" data-toolset-primary="side-selection" data-tool-mode="selection-rect" data-tool>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 3a2 2 0 0 0-2 2" />
            <path d="M19 3a2 2 0 0 1 2 2" />
            <path d="M21 19a2 2 0 0 1-2 2" />
            <path d="M5 21a2 2 0 0 1-2-2" />
            <path d="M9 3h1" />
            <path d="M9 21h1" />
            <path d="M14 3h1" />
            <path d="M14 21h1" />
            <path d="M3 9v1" />
            <path d="M21 9v1" />
            <path d="M3 14v1" />
            <path d="M21 14v1" />
          </svg>
        </button>
        <button class="tool-button tool-menu-button" type="button" aria-label="Area select tools" aria-pressed="false" data-tooltip="Area select tools">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span class="tool-popover" aria-hidden="true">
            <span class="popover-option active" data-toolset-option="side-selection" data-tool-mode="selection-rect" data-label="RECT SELECT">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 3a2 2 0 0 0-2 2" />
                <path d="M19 3a2 2 0 0 1 2 2" />
                <path d="M21 19a2 2 0 0 1-2 2" />
                <path d="M5 21a2 2 0 0 1-2-2" />
                <path d="M9 3h1" />
                <path d="M9 21h1" />
                <path d="M14 3h1" />
                <path d="M14 21h1" />
                <path d="M3 9v1" />
                <path d="M21 9v1" />
                <path d="M3 14v1" />
                <path d="M21 14v1" />
              </svg>
              <span class="popover-label">RECT SELECT</span>
              <span class="popover-key"></span>
            </span>
            <span class="popover-option" data-toolset-option="side-selection" data-tool-mode="selection-lasso" data-label="LASSO SELECT">
              <svg class="lucide lucide-lasso-icon lucide-lasso" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" />
                <path d="M7 22a5 5 0 0 1-2-3.994" />
                <circle cx="5" cy="16" r="2" />
              </svg>
              <span class="popover-label">LASSO SELECT</span>
              <span class="popover-key"></span>
            </span>
            <span class="popover-option" data-toolset-option="side-selection" data-tool-mode="selection-pen" data-label="PEN SELECT">
              <svg class="lucide lucide-spline-icon lucide-spline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="19" r="2" />
                <path d="M5 17A12 12 0 0 1 17 5" />
              </svg>
              <span class="popover-label">PEN SELECT</span>
              <span class="popover-key"></span>
            </span>
          </span>
        </button>
      </div>
      <button class="tool-button vertical-filter-gallery-button" type="button" aria-label="FILTER GALLERY" aria-pressed="false" data-tooltip="FILTER GALLERY" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" />
          <circle cx="19" cy="5" r="1" />
          <circle cx="5" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
          <circle cx="19" cy="19" r="1" />
          <circle cx="5" cy="19" r="1" />
        </svg>
      </button>
      <button class="tool-button vertical-adjustment-layer-button" type="button" aria-label="ADJUSTMENT LAYER" aria-pressed="false" data-tooltip="ADJUSTMENT LAYER" data-tool>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
          <path d="m14 7 3 3" />
          <path d="M5 6v4" />
          <path d="M19 14v4" />
          <path d="M10 2v2" />
          <path d="M7 8H3" />
          <path d="M21 16h-4" />
          <path d="M11 3H9" />
        </svg>
      </button>
      ${window.CBO.createFileAdjustmentsButton ? window.CBO.createFileAdjustmentsButton() : ""}
      ${window.CBO.createRotateButton ? window.CBO.createRotateButton() : ""}
      ${window.CBO.createResizeButton ? window.CBO.createResizeButton() : ""}
    </nav>
  `;

  editorPage.appendChild(dock);
};
