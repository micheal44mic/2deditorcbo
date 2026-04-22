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
      <button class="tool-button" type="button" aria-label="HOLD" aria-pressed="false" data-tooltip="HOLD" data-tool>
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
    </nav>
  `;

  editorPage.appendChild(dock);
};
