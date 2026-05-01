window.CBO = window.CBO || {};

window.CBO.createPuppetButton = function createPuppetButton() {
  return `
    <button class="tool-button vertical-puppet-button" type="button" aria-label="PUPPET" aria-pressed="false" data-tooltip="PUPPET" data-tool-mode="puppet" data-tool>
      <svg class="lucide lucide-network-icon lucide-network" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <path d="M5 16v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
        <path d="M12 8v3" />
      </svg>
    </button>
  `;
};
