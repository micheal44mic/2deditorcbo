window.CBO = window.CBO || {};

window.CBO.createResizeButton = function createResizeButton() {
  return `
    <div class="tool-group vertical-resize-tool-group" aria-label="Resize tools">
      <button class="tool-button vertical-resize-button" type="button" aria-label="RESIZE" aria-pressed="false" data-tooltip="RESIZE" data-toolset-primary="vertical-resize" data-tool>
        <svg class="lucide lucide-scaling-icon lucide-scaling" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M14 15H9v-5" />
          <path d="M16 3h5v5" />
          <path d="M21 3 9 15" />
        </svg>
      </button>
      <button class="tool-button tool-menu-button" type="button" aria-label="Resize tools" aria-pressed="false" data-tooltip="Resize tools">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span class="tool-popover" aria-hidden="true">
          <span class="popover-option active" data-toolset-option="vertical-resize" data-label="RESIZE">
            <svg class="lucide lucide-scaling-icon lucide-scaling" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M14 15H9v-5" />
              <path d="M16 3h5v5" />
              <path d="M21 3 9 15" />
            </svg>
            <span class="popover-label">RESIZE</span>
            <span class="popover-key"></span>
          </span>
          <span class="popover-option" data-toolset-option="vertical-resize" data-tool-mode="puppet" data-label="PUPPET">
            <svg class="lucide lucide-network-icon lucide-network" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="16" y="16" width="6" height="6" rx="1" />
              <rect x="2" y="16" width="6" height="6" rx="1" />
              <rect x="9" y="2" width="6" height="6" rx="1" />
              <path d="M5 16v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
              <path d="M12 8v3" />
            </svg>
            <span class="popover-label">PUPPET</span>
            <span class="popover-key"></span>
          </span>
        </span>
      </button>
    </div>
  `;
};
