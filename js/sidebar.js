window.CBO = window.CBO || {};

window.CBO.initSidebar = function initSidebar() {
  const editorPage = document.querySelector(".editor-page");
  const toggle = document.querySelector(".panel-toggle");
  const railButtons = document.querySelectorAll("[data-rail-button]");

  function setDrawerTriggerActive(panelName) {
    railButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.drawerPanel === panelName);
    });

    document.querySelectorAll("[data-drawer-sync]").forEach((button) => {
      const isActive = button.dataset.drawerSync === panelName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setDrawerOpen(isOpen) {
    editorPage.classList.toggle("left-panel-collapsed", !isOpen);
    toggle.innerHTML = isOpen ? window.CBO.icons.panelClose : window.CBO.icons.panelOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close left panel" : "Open left panel");
  }

  function isDrawerOpen() {
    return !editorPage.classList.contains("left-panel-collapsed");
  }

  function getActiveDrawerPanel() {
    return document.querySelector(".left-drawer")?.dataset.drawerPanel || "";
  }

  window.CBO.openDrawerPanel = function openDrawerPanel(panelName = "elements") {
    setDrawerTriggerActive(panelName);

    if (window.CBO.setDrawerPanel) {
      window.CBO.setDrawerPanel(panelName);
    }

    setDrawerOpen(true);
  };

  window.CBO.closeDrawerPanel = function closeDrawerPanel() {
    setDrawerOpen(false);
  };

  window.CBO.toggleDrawerPanel = function toggleDrawerPanel(panelName = "elements") {
    if (isDrawerOpen() && getActiveDrawerPanel() === panelName) {
      setDrawerOpen(false);
      return;
    }

    window.CBO.openDrawerPanel(panelName);
  };

  window.CBO.setDrawerTriggerActive = setDrawerTriggerActive;

  railButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.CBO.openDrawerPanel(button.dataset.drawerPanel || "elements");
    });
  });

  toggle.addEventListener("click", () => {
    const isOpening = editorPage.classList.contains("left-panel-collapsed");
    setDrawerOpen(isOpening);
  });
};
