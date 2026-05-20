window.CBO = window.CBO || {};

window.CBO.initTooltips = function initTooltips() {
  const tooltipButtons = document.querySelectorAll("[data-tooltip]");
  const resetZones = document.querySelectorAll("[data-tooltip-zone]");
  const tooltipDelay = 1000;
  const touchHoldDelay = 520;
  const touchReleaseHideDelay = 1000;
  const tooltipGap = 10;
  let tooltipTimer = null;
  let touchHoldTimer = null;
  let touchHideTimer = null;
  let tooltipWarm = false;
  let activeButton = null;
  let suppressNextFocus = false;
  let lastTouchInteractionAt = 0;

  const tooltip = document.createElement("div");
  tooltip.className = "floating-tooltip";
  tooltip.setAttribute("role", "tooltip");
  document.body.appendChild(tooltip);

  function getPlacement(button) {
    if (button.closest(".top-toolbar-dock")) {
      return "bottom";
    }

    if (button.closest(".right-vertical-toolbar")) {
      return "left";
    }

    if (button.matches(".rail-button, .panel-title")) {
      return "right";
    }

    return "top";
  }

  function positionTooltip(button) {
    const rect = button.getBoundingClientRect();
    const placement = getPlacement(button);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    tooltip.dataset.placement = placement;

    if (placement === "top") {
      tooltip.style.left = `${centerX}px`;
      tooltip.style.top = `${rect.top - tooltipGap}px`;
      return;
    }

    if (placement === "bottom") {
      tooltip.style.left = `${centerX}px`;
      tooltip.style.top = `${rect.bottom + tooltipGap}px`;
      return;
    }

    if (placement === "left") {
      tooltip.style.left = `${rect.left - tooltipGap}px`;
      tooltip.style.top = `${centerY}px`;
      return;
    }

    tooltip.style.left = `${rect.right + tooltipGap}px`;
    tooltip.style.top = `${centerY}px`;
  }

  function hideTooltips() {
    window.clearTimeout(tooltipTimer);
    window.clearTimeout(touchHoldTimer);
    window.clearTimeout(touchHideTimer);
    tooltipTimer = null;
    touchHoldTimer = null;
    touchHideTimer = null;
    activeButton = null;
    tooltip.classList.remove("visible");
    tooltip.textContent = "";

    tooltipButtons.forEach((button) => {
      button.classList.remove("tooltip-visible");
    });
  }

  function showTooltip(button) {
    if (!button.dataset.tooltip || button.classList.contains("open") || isMobileToolbarTooltipDisabled(button)) {
      return;
    }

    window.clearTimeout(tooltipTimer);
    window.clearTimeout(touchHoldTimer);
    window.clearTimeout(touchHideTimer);
    tooltipTimer = null;
    touchHoldTimer = null;
    touchHideTimer = null;
    tooltipButtons.forEach((tooltipButton) => {
      tooltipButton.classList.remove("tooltip-visible");
    });
    activeButton = button;
    tooltip.textContent = button.dataset.tooltip;
    positionTooltip(button);
    window.requestAnimationFrame(() => {
      if (activeButton === button) {
        tooltip.classList.add("visible");
      }
    });
    button.classList.add("tooltip-visible");
    tooltipWarm = true;
  }

  function queueTooltip(button) {
    hideTooltips();

    if (isMobileToolbarTooltipDisabled(button)) {
      return;
    }

    if (tooltipWarm) {
      showTooltip(button);
      return;
    }

    tooltipTimer = window.setTimeout(() => {
      showTooltip(button);
    }, tooltipDelay);
  }

  function isTouchLikePointer(event) {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }

  function isAfterRecentTouch() {
    return Date.now() - lastTouchInteractionAt < touchReleaseHideDelay;
  }

  function isMobileToolbarTooltipDisabled(button) {
    return Boolean(
      window.matchMedia?.("(max-width: 900px)")?.matches &&
      button.closest(".toolbar-dock, .top-toolbar-dock, .right-vertical-toolbar-dock")
    );
  }

  function queueTouchTooltip(button) {
    window.clearTimeout(tooltipTimer);
    window.clearTimeout(touchHoldTimer);
    window.clearTimeout(touchHideTimer);
    tooltipTimer = null;
    touchHoldTimer = null;
    touchHideTimer = null;
    suppressNextFocus = true;
    lastTouchInteractionAt = Date.now();

    if (isMobileToolbarTooltipDisabled(button)) {
      hideTooltips();
      return;
    }

    touchHoldTimer = window.setTimeout(() => {
      showTooltip(button);
    }, touchHoldDelay);
  }

  function releaseTouchTooltip(button) {
    lastTouchInteractionAt = Date.now();
    window.clearTimeout(touchHoldTimer);
    touchHoldTimer = null;

    if (activeButton !== button) {
      return;
    }

    window.clearTimeout(touchHideTimer);
    touchHideTimer = window.setTimeout(() => {
      if (activeButton === button) {
        hideTooltips();
      }
    }, touchReleaseHideDelay);
  }

  tooltipButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (!isTouchLikePointer(event)) {
        return;
      }

      queueTouchTooltip(button);
    });

    button.addEventListener("pointerup", (event) => {
      if (!isTouchLikePointer(event)) {
        return;
      }

      releaseTouchTooltip(button);
    });

    button.addEventListener("pointercancel", (event) => {
      if (!isTouchLikePointer(event)) {
        return;
      }

      releaseTouchTooltip(button);
    });

    button.addEventListener("lostpointercapture", () => {
      releaseTouchTooltip(button);
    });

    button.addEventListener("mouseenter", () => {
      if (isAfterRecentTouch()) {
        return;
      }

      queueTooltip(button);
    });

    button.addEventListener("focus", (event) => {
      if (suppressNextFocus || isAfterRecentTouch()) {
        suppressNextFocus = false;
        return;
      }

      if (window.matchMedia?.("(pointer: coarse)")?.matches && event.target.matches?.(":active")) {
        return;
      }

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

  window.addEventListener("resize", hideTooltips);
  window.addEventListener(
    "scroll",
    () => {
      if (activeButton) {
        positionTooltip(activeButton);
      }
    },
    true,
  );
};
