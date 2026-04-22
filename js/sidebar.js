window.CBO = window.CBO || {};

window.CBO.initSidebar = function initSidebar() {
  const editorPage = document.querySelector(".editor-page");
  const toggle = document.querySelector(".panel-toggle");
  const railButtons = document.querySelectorAll("[data-rail-button]");

  function setDrawerOpen(isOpen) {
    editorPage.classList.toggle("left-panel-collapsed", !isOpen);
    toggle.innerHTML = isOpen ? window.CBO.icons.panelClose : window.CBO.icons.panelOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close left panel" : "Open left panel");
  }

  railButtons.forEach((button) => {
    button.addEventListener("click", () => {
      railButtons.forEach((railButton) => railButton.classList.remove("active"));
      button.classList.add("active");

      if (window.CBO.setDrawerPanel) {
        window.CBO.setDrawerPanel(button.dataset.drawerPanel || "elements");
      }

      setDrawerOpen(true);
    });
  });

  toggle.addEventListener("click", () => {
    const isOpening = editorPage.classList.contains("left-panel-collapsed");
    setDrawerOpen(isOpening);
  });
};
