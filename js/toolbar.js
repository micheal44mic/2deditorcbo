window.CBO = window.CBO || {};

window.CBO.initToolbar = function initToolbar() {
  const toolButtons = document.querySelectorAll("[data-tool]");
  const menuButtons = document.querySelectorAll(".tool-menu-button");
  const toolsetOptions = document.querySelectorAll("[data-toolset-option]");
  const historyButtons = document.querySelectorAll("[data-history-action]");
  const mobileTransformToggleButtons = document.querySelectorAll("[data-mobile-transform-toggle]");
  const mobileTransformToolContainers = document.querySelectorAll("[data-mobile-transform-tools]");
  let historyActionInFlight = false;
  let historyBusyOverlay = null;

  function setMobileTransformToolsOpen(isOpen) {
    const nextOpen = Boolean(isOpen) && mobileTransformToolContainers.length > 0;

    mobileTransformToolContainers.forEach((container) => {
      const dock = container.closest(".right-vertical-toolbar-dock");

      dock?.classList.toggle("mobile-transform-tools-open", nextOpen);
    });

    mobileTransformToggleButtons.forEach((button) => {
      button.classList.toggle("active", nextOpen);
      button.setAttribute("aria-pressed", String(nextOpen));
    });
  }

  function toggleMobileTransformTools() {
    const isOpen = Array.from(mobileTransformToolContainers).some((container) =>
      container.closest(".right-vertical-toolbar-dock")?.classList.contains("mobile-transform-tools-open")
    );

    setMobileTransformToolsOpen(!isOpen);
  }

  function syncTransformModeFromButton(button) {
    const mode = String(button.dataset.transformSelectMode || "").trim().toLowerCase();

    if (!mode) {
      return;
    }

    const transformAspectLocked =
      String(button.dataset.transformAspectLock || "").trim().toLowerCase() === "true";

    window.CBO.transformMode = mode;
    window.CBO.transformAspectLocked = transformAspectLocked;
    window.dispatchEvent(
      new CustomEvent("cbo:transform-mode-change", {
        detail: {
          mode,
          transformAspectLocked,
          source: "mobile-transform-sidebar",
        },
      }),
    );
  }

  function isTextToolButton(button) {
    const label = String(button.getAttribute("aria-label") || "").trim().toLowerCase();
    const toolMode = String(button.dataset.toolMode || "").trim().toLowerCase();

    return toolMode === "text" || label === "type";
  }

  function activateTool(button) {
    syncTransformModeFromButton(button);

    if (isTextToolButton(button)) {
      setMobileTransformToolsOpen(false);
    }

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

    window.dispatchEvent(
      new CustomEvent("cbo:tool-change", {
        detail: {
          label: button.getAttribute("aria-label") || "",
          syncGroup: syncGroup || "",
          transformAspectLocked:
            String(button.dataset.transformAspectLock || "").trim().toLowerCase() === "true",
          toolMode: button.dataset.toolMode || "",
        },
      }),
    );
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
    primary.dataset.toolMode = option.dataset.toolMode || "";
    activateTool(primary);
  }

  function flashHistoryButton(button) {
    if (button.disabled) {
      return;
    }

    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");

    window.setTimeout(() => {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    }, 140);
  }

  function ensureHistoryBusyOverlay() {
    if (historyBusyOverlay?.isConnected) {
      return historyBusyOverlay;
    }

    const overlay = document.createElement("div");
    const spinner = document.createElement("span");
    const label = document.createElement("span");

    overlay.className = "cbo-history-busy-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("role", "status");
    spinner.className = "cbo-history-busy-spinner";
    spinner.setAttribute("aria-hidden", "true");
    label.className = "cbo-history-busy-label";
    overlay.append(spinner, label);
    document.body.append(overlay);
    historyBusyOverlay = overlay;

    return overlay;
  }

  function setHistoryBusy(action, isBusy) {
    const overlay = ensureHistoryBusyOverlay();
    const label = overlay.querySelector(".cbo-history-busy-label");
    const normalizedAction = String(action || "").trim().toLowerCase();

    if (label) {
      label.textContent = normalizedAction === "redo" ? "REDO" : "UNDO";
    }

    overlay.hidden = !isBusy;
    document.body?.classList.toggle("cbo-history-busy-active", Boolean(isBusy));
  }

  function afterHistoryBusyPaint(callback) {
    const raf = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (handler) => window.setTimeout(handler, 16);

    raf(() => {
      raf(callback);
    });
  }

  function finishHistoryBusy(action) {
    window.setTimeout(() => {
      afterHistoryBusyPaint(() => {
        historyActionInFlight = false;
        setHistoryBusy(action, false);
      });
    }, 120);
  }

  function triggerHistoryAction(action) {
    const normalizedAction = String(action || "").trim().toLowerCase();

    if (historyActionInFlight || (normalizedAction !== "undo" && normalizedAction !== "redo")) {
      return;
    }

    historyActionInFlight = true;
    setHistoryBusy(normalizedAction, true);
    afterHistoryBusyPaint(() => {
      window.dispatchEvent(
        new CustomEvent("cbo:before-history-action", {
          detail: {
            action: normalizedAction,
            source: "toolbar",
          },
        }),
      );

      const button = document.querySelector(`[data-history-action="${normalizedAction}"]`);

      if (!button || button.disabled) {
        finishHistoryBusy(normalizedAction);
        return;
      }

      flashHistoryButton(button);
      window.dispatchEvent(
        new CustomEvent("cbo:history-action", {
          detail: {
            action: normalizedAction,
            beforeDispatched: true,
            source: "toolbar",
          },
        }),
      );
      finishHistoryBusy(normalizedAction);
    });
  }

  function setHistoryButtonState(button, isEnabled) {
    button.disabled = !isEnabled;
    button.classList.toggle("disabled", !isEnabled);
    button.setAttribute("aria-disabled", String(!isEnabled));

    if (!isEnabled) {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    }
  }

  function updateHistoryButtons(detail = {}) {
    historyButtons.forEach((button) => {
      const action = String(button.dataset.historyAction || "").toLowerCase();

      if (action === "undo") {
        setHistoryButtonState(button, detail.canUndo === true);
      } else if (action === "redo") {
        setHistoryButtonState(button, detail.canRedo === true);
      }
    });
  }

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTool(button);
    });
  });

  mobileTransformToggleButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMobileTransformTools();
    });
  });

  historyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      triggerHistoryAction(button.dataset.historyAction);
    });
  });

  window.addEventListener("cbo:history-change", (event) => {
    updateHistoryButtons(event.detail || {});
  });
  updateHistoryButtons({
    canRedo: window.CBO.documentHistory?.redoStack?.length > 0,
    canUndo: window.CBO.documentHistory?.undoStack?.length > 0,
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
    const isModifierShortcut = event.ctrlKey || event.metaKey;
    const isUndoShortcut = isModifierShortcut && key === "z" && !event.shiftKey;
    const isRedoShortcut =
      (isModifierShortcut && key === "z" && event.shiftKey) ||
      (event.ctrlKey && key === "y" && !event.shiftKey);

    if (isUndoShortcut || isRedoShortcut) {
      event.preventDefault();
      triggerHistoryAction(isUndoShortcut ? "undo" : "redo");
      closeMenus();
      return;
    }

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
