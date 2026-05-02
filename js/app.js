document.addEventListener(
  "contextmenu",
  (event) => {
    event.preventDefault();
  },
  { capture: true },
);

document.addEventListener("DOMContentLoaded", () => {
  window.CBO.initSidebar();
  window.CBO.initDrawer();
  window.CBO.initLayersPanel();
  window.CBO.initDragScroll();
  window.CBO.initTopToolbar();
  window.CBO.initVerticalToolbar();
  window.CBO.initColorPicker();
  window.CBO.initColorDrop();
  window.CBO.initToolbar();
  window.CBO.initEditorCanvas();
  window.CBO.initBrushShapeOutlinePreview?.();
  window.CBO.initRasterTransformTool?.();
  window.CBO.initPuppetTransformTool?.();
  window.CBO.initVectorTextRenderer();
  window.CBO.initRightSidebar();
  window.CBO.initBrushesPanel();
  window.CBO.initBrushStudio();
  window.CBO.initTooltips();
});
