document.addEventListener(
  "contextmenu",
  (event) => {
    event.preventDefault();
  },
  { capture: true },
);

(() => {
  const guardedOptions = { capture: true, passive: false };
  const editableSelector = 'input, textarea, select, [contenteditable="true"]';
  const interactiveSelector = [
    "a[href]",
    "button",
    "[role='button']",
    "[data-tool]",
    "[data-toolset-option]",
    "[data-history-action]",
    "[data-drawer-sync]",
    "[data-rasterize-text]",
    ".side-panel",
    ".toolbar-dock",
    ".top-toolbar-dock",
    ".text-add-toolbar",
    ".mobile-text-panel",
    ".mobile-layer-effects-panel",
    ".right-vertical-toolbar-dock",
    ".brush-studio-panel",
    ".brushes-gallery-popout",
    ".layer-effects-popover",
  ].join(", ");

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest(editableSelector));
  }

  function isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(interactiveSelector));
  }

  function preventBrowserGesture(event) {
    if (isEditableTarget(event.target) || isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
  }

  let lastTouchEndAt = 0;

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches?.length > 1 || Math.abs(event.scale || 1) !== 1) {
        preventBrowserGesture(event);
      }
    },
    guardedOptions,
  );

  document.addEventListener(
    "touchend",
    (event) => {
      if (event.touches?.length || isEditableTarget(event.target) || isInteractiveTarget(event.target)) {
        return;
      }

      const now = Date.now();
      if (now - lastTouchEndAt < 360) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    guardedOptions,
  );

  document.addEventListener("dblclick", preventBrowserGesture, guardedOptions);
  document.addEventListener("gesturestart", preventBrowserGesture, guardedOptions);
  document.addEventListener("gesturechange", preventBrowserGesture, guardedOptions);
  document.addEventListener("gestureend", preventBrowserGesture, guardedOptions);
})();

document.addEventListener("DOMContentLoaded", () => {
  function initCanvasDependentTools() {
    window.CBO.initBrushShapeOutlinePreview?.();
    window.CBO.initAreaSelectionTool?.();
    window.CBO.initRasterTransformTool?.();
    window.CBO.initPuppetTransformTool?.();
    window.CBO.initVectorTextRenderer();
  }

  window.addEventListener("cbo:editor-canvas-ready", initCanvasDependentTools);

  window.CBO.initSidebar();
  window.CBO.initDrawer();
  window.CBO.initLayersPanel();
  window.CBO.initDragScroll();
  window.CBO.initTopToolbar();
  window.CBO.initVerticalToolbar();
  window.CBO.initLayerEffectsPanel?.();
  window.CBO.initColorPicker();
  window.CBO.initColorDrop();
  window.CBO.initToolbar();
  if (window.CBO.initEditorDocumentStart) {
    window.CBO.initEditorDocumentStart();
  } else {
    window.CBO.initEditorCanvas();
  }

  if (window.CBO.documentRenderer) {
    initCanvasDependentTools();
  }

  window.CBO.initRightSidebar();
  window.CBO.initBrushesPanel();
  window.CBO.initBrushStudio();
  window.CBO.initTooltips();
});
