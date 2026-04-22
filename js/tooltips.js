window.CBO = window.CBO || {};

window.CBO.initTooltips = function initTooltips() {
  const tooltipButtons = document.querySelectorAll("[data-tooltip]");
  const resetZones = document.querySelectorAll("[data-tooltip-zone]");
  const tooltipDelay = 1000;
  let tooltipTimer = null;
  let tooltipWarm = false;

  function hideTooltips() {
    window.clearTimeout(tooltipTimer);
    tooltipTimer = null;

    tooltipButtons.forEach((button) => {
      button.classList.remove("tooltip-visible");
    });
  }

  function showTooltip(button) {
    if (!button.dataset.tooltip || button.classList.contains("open")) {
      return;
    }

    hideTooltips();
    button.classList.add("tooltip-visible");
    tooltipWarm = true;
  }

  function queueTooltip(button) {
    hideTooltips();

    if (tooltipWarm) {
      showTooltip(button);
      return;
    }

    tooltipTimer = window.setTimeout(() => {
      showTooltip(button);
    }, tooltipDelay);
  }

  tooltipButtons.forEach((button) => {
    button.addEventListener("mouseenter", () => {
      queueTooltip(button);
    });

    button.addEventListener("focus", () => {
      queueTooltip(button);
    });

    button.addEventListener("mouseleave", () => {
      button.classList.remove("tooltip-visible");
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    });

    button.addEventListener("blur", () => {
      button.classList.remove("tooltip-visible");
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    });
  });

  resetZones.forEach((zone) => {
    zone.addEventListener("mouseleave", () => {
      tooltipWarm = false;
      hideTooltips();
    });
  });
};
