window.CBO = window.CBO || {};

window.CBO.initToolbar = function initToolbar() {
  const toolButtons = document.querySelectorAll("[data-tool]");
  const menuButtons = document.querySelectorAll(".tool-menu-button");
  const toolsetOptions = document.querySelectorAll("[data-toolset-option]");

  function activateTool(button) {
    const syncGroup = button.dataset.toolSync;
    const activeButtons = syncGroup
      ? Array.from(toolButtons).filter((toolButton) => toolButton.dataset.toolSync === syncGroup)
      : [button];

    toolButtons.forEach((toolButton) => {
      toolButton.classList.remove("active");
      toolButton.setAttribute("aria-pressed", "false");
    });

    activeButtons.forEach((toolButton) => {
      toolButton.classList.add("active");
      toolButton.setAttribute("aria-pressed", "true");
    });
  }

  function closeMenus(exceptButton = null) {
    menuButtons.forEach((button) => {
      if (button !== exceptButton) {
        button.classList.remove("open");
        button.setAttribute("aria-pressed", "false");
      }
    });
  }

  function selectToolsetOption(option) {
    const toolset = option.dataset.toolsetOption;
    const primary = document.querySelector(`[data-toolset-primary="${toolset}"]`);
    const options = document.querySelectorAll(`[data-toolset-option="${toolset}"]`);
    const icon = option.querySelector("svg").cloneNode(true);

    options.forEach((toolOption) => toolOption.classList.remove("active"));
    option.classList.add("active");

    primary.replaceChildren(icon);
    primary.setAttribute("aria-label", option.dataset.label);
    primary.dataset.tooltip = option.dataset.label;
    activateTool(primary);
  }

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTool(button);
    });
  });

  toolsetOptions.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      selectToolsetOption(option);
      closeMenus();
    });
  });

  menuButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const pairedTool = button.previousElementSibling;

      if (pairedTool?.matches("[data-tool]")) {
        activateTool(pairedTool);
      }

      closeMenus(button);
      button.classList.toggle("open");
      button.setAttribute("aria-pressed", button.classList.contains("open"));
    });
  });

  document.addEventListener("click", () => {
    closeMenus();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable;

    if (isTyping) {
      return;
    }

    const key = event.key.toLowerCase();
    const toolsetOption = document.querySelector(`[data-toolset-option][data-shortcut="${key}"]`);
    const toolbarTool = document.querySelector(`[data-tool][data-shortcut="${key}"]`);

    if (toolsetOption) {
      event.preventDefault();
      selectToolsetOption(toolsetOption);
      closeMenus();
      return;
    }

    if (toolbarTool) {
      event.preventDefault();
      activateTool(toolbarTool);
      closeMenus();
    }
  });
};
