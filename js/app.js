document.addEventListener(
  "contextmenu",
  (event) => {
    event.preventDefault();
  },
  { capture: true },
);

document.addEventListener("DOMContentLoaded", () => {
  function initCanvasDependentTools() {
    window.CBO.initBrushShapeOutlinePreview?.();
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
