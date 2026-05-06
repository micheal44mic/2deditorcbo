window.CBO = window.CBO || {};

const CBO_TRANSFORM_TOOL_ICONS = Object.freeze({
  distort: `
    <svg class="lucide lucide-grid3x3-icon lucide-grid-3x3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  `,
  perspective: `
    <svg class="transform-mode-fill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.3,2H6.7c-1.2,0-2.4,1-2.5,2.3l-1.7,13.9c-.3,2.1.9,3.8,2.5,3.8h14c1.7,0,2.8-1.8,2.5-3.8l-1.7-13.9c-.2-1.3-1.3-2.3-2.5-2.3ZM18.2,4.3l.5,5.3h-5.9V3.5c0,0,4.6,0,4.6,0,.4,0,.8.4.9.8ZM6.6,3.5h4.6v6.1h-6l.5-5.3c0-.4.4-.8.9-.8ZM4.4,18.2l.7-6.6h6.1v7.8h-5.9c-.5,0-.9-.6-.8-1.2ZM18.8,19.4h-5.8v-7.8c0,0,6,0,6,0l.7,6.6c0,.7-.3,1.2-.8,1.2Z" />
    </svg>
  `,
  puppet: `
    <svg class="lucide lucide-network-icon lucide-network" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M12 8v3" />
    </svg>
  `,
  resize: `
    <svg class="lucide lucide-scaling-icon lucide-scaling" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M14 15H9v-5" />
      <path d="M16 3h5v5" />
      <path d="M21 3 9 15" />
    </svg>
  `,
  rotate: `
    <svg class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  `,
});

window.CBO.createResizeButton = function createResizeButton() {
  return `
    <div class="tool-group vertical-resize-tool-group" aria-label="Resize tools">
      <button class="tool-button vertical-resize-button" type="button" aria-label="RESIZE" aria-pressed="false" data-tooltip="RESIZE" data-toolset-primary="vertical-resize" data-tool-mode="resize" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.resize}
      </button>
      <button class="tool-button tool-menu-button" type="button" aria-label="Resize tools" aria-pressed="false" data-tooltip="Resize tools">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span class="tool-popover" aria-hidden="true">
          <span class="popover-option active" data-toolset-option="vertical-resize" data-tool-mode="resize" data-label="RESIZE">
            ${CBO_TRANSFORM_TOOL_ICONS.resize}
            <span class="popover-label">RESIZE</span>
            <span class="popover-key"></span>
          </span>
          <span class="popover-option" data-toolset-option="vertical-resize" data-tool-mode="puppet" data-label="PUPPET">
            ${CBO_TRANSFORM_TOOL_ICONS.puppet}
            <span class="popover-label">PUPPET</span>
            <span class="popover-key"></span>
          </span>
        </span>
      </button>
    </div>
  `;
};

window.CBO.createMobileTransformTools = function createMobileTransformTools() {
  return `
    <div class="tool-group mobile-transform-tool-group" aria-label="Transform tools" data-mobile-transform-tools>
      <button class="tool-button mobile-transform-tool-button" type="button" aria-label="RESIZE" aria-pressed="false" data-tooltip="RESIZE" data-transform-select-mode="free" data-tool-mode="resize" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.resize}
      </button>
      <button class="tool-button mobile-transform-tool-button" type="button" aria-label="ROTATE" aria-pressed="false" data-tooltip="ROTATE" data-transform-select-mode="free" data-tool-mode="rotate" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.rotate}
      </button>
      <button class="tool-button mobile-transform-tool-button" type="button" aria-label="DISTORTION" aria-pressed="false" data-tooltip="DISTORTION" data-transform-select-mode="warp" data-tool-mode="resize" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.distort}
      </button>
      <button class="tool-button mobile-transform-tool-button" type="button" aria-label="PERSPECTIVE" aria-pressed="false" data-tooltip="PERSPECTIVE DISTORTION" data-transform-select-mode="perspective" data-tool-mode="resize" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.perspective}
      </button>
      <button class="tool-button mobile-transform-tool-button" type="button" aria-label="PUPPET" aria-pressed="false" data-tooltip="PUPPET" data-tool-mode="puppet" data-tool>
        ${CBO_TRANSFORM_TOOL_ICONS.puppet}
      </button>
    </div>
  `;
};
