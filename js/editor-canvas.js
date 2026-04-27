window.CBO = window.CBO || {};

window.CBO.placeUploadedImageOnCanvas = async function placeUploadedImageOnCanvas(detail = {}) {
  const rasterizer = window.CBO.imageRasterizer;
  const layerModel = window.CBO.documentLayerModel;
  const documentRenderer = window.CBO.documentRenderer;

  if (!rasterizer?.placeBlob || !detail.blob || !layerModel?.createLayer || !documentRenderer?.getRasterTarget) {
    return;
  }

  const imageLayer = layerModel.createLayer({
    name: detail.name || "Image",
    type: "image",
  });
  const entries = layerModel.getEntries();

  layerModel.setEntries([imageLayer, ...entries], { source: "image-upload" });
  layerModel.setActiveLayer(imageLayer.id, { source: "image-upload" });

  try {
    await rasterizer.placeBlob(detail.blob, { layerId: imageLayer.id });
  } catch (error) {
    const remainingEntries = layerModel.getEntries().filter((entry) => entry.id !== imageLayer.id);

    layerModel.setEntries(remainingEntries, { source: "image-upload-error" });
    console.warn("Impossibile inserire l'immagine caricata nel canvas.", error);
  }
};

window.addEventListener("cbo:place-uploaded-image", (event) => {
  void window.CBO.placeUploadedImageOnCanvas(event.detail);
});

window.CBO.hexToUnitRgba = function hexToUnitRgba(hexColor, fallback = [1, 1, 1, 1]) {
  const normalized = String(hexColor || "").trim().replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback.slice();
  }

  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ];
};

window.CBO.unitRgbaToHex = function unitRgbaToHex(color, fallback = "#FFFFFF") {
  if (!Array.isArray(color)) {
    return fallback;
  }

  const hex = color
    .slice(0, 3)
    .map((channel) => {
      const value = Number.isFinite(channel) ? Math.min(1, Math.max(0, channel)) : 1;

      return Math.round(value * 255).toString(16).padStart(2, "0");
    })
    .join("")
    .toUpperCase();

  return `#${hex}`;
};

window.CBO.createTextLayerOnCanvas = function createTextLayerOnCanvas(options = {}) {
  const layerModel = window.CBO.documentLayerModel;
  const renderer = window.CBO.documentRenderer;

  if (!layerModel?.createTextLayer || !renderer) {
    return null;
  }

  const documentWidth = Math.max(1, renderer.width || 1);
  const documentHeight = Math.max(1, renderer.height || 1);
  const boxWidth = Math.min(720, Math.max(260, documentWidth * 0.45));
  const boxHeight = 180;
  const x = Math.round((documentWidth - boxWidth) * 0.5);
  const y = Math.round((documentHeight - boxHeight) * 0.5);
  const selectedColor = window.CBO.selectedColor || window.CBO.brushSettings?.color || "#FFFFFF";
  const textLayer = layerModel.createTextLayer({
    name: options.name || "Text",
    text: options.text || "Text",
    opacity: 1,
    font: {
      family: "Inter, Arial, sans-serif",
      size: 72,
      weight: 700,
      style: "normal",
    },
    style: {
      fillColor: window.CBO.hexToUnitRgba(selectedColor, [1, 1, 1, 1]),
      strokeColor: [0, 0, 0, 1],
      strokeWidth: 0,
      lineHeight: 1.15,
      letterSpacing: 0,
      align: "left",
    },
    box: {
      x,
      y,
      width: boxWidth,
      height: boxHeight,
    },
    transform: {
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      anchorX: 0,
      anchorY: 0,
    },
  });
  const entries = layerModel.getEntries();

  layerModel.setEntries([textLayer, ...entries], { source: options.source || "text-tool-create" });
  layerModel.setActiveLayer(textLayer.id, { source: options.source || "text-tool-create" });

  return textLayer;
};

window.CBO.ensureActiveTextLayer = function ensureActiveTextLayer(options = {}) {
  const layerModel = window.CBO.documentLayerModel;
  const activeLayer = layerModel?.getActiveLayer?.();

  if (activeLayer?.type === "text") {
    return activeLayer;
  }

  return window.CBO.createTextLayerOnCanvas(options);
};

if (window.CBO.textToolBindingReady !== true) {
  window.CBO.textToolBindingReady = true;
  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();

    if (label === "TYPE" || toolMode === "text") {
      window.CBO.ensureActiveTextLayer?.({ source: "text-tool" });
    }
  });
}

window.CBO.initEditorCanvas = function initEditorCanvas() {
  const stage = document.querySelector(".editor-stage");

  if (!stage || stage.dataset.canvasReady === "true") {
    return;
  }

  if (!window.CBO.BrushEngine) {
    throw new Error("BrushEngine non caricato: impossibile inizializzare il canvas WebGL2.");
  }

  if (!window.CBO.DocumentRenderer) {
    throw new Error("DocumentRenderer non caricato: impossibile inizializzare il documento raster.");
  }

  if (!window.CBO.DocumentLayerModel) {
    throw new Error("DocumentLayerModel non caricato: impossibile inizializzare i layer documento.");
  }

  if (!window.CBO.SmudgeEngine) {
    throw new Error("SmudgeEngine non caricato: impossibile inizializzare lo smudge WebGL2.");
  }

  if (!window.CBO.ImageRasterizer) {
    throw new Error("ImageRasterizer non caricato: impossibile inizializzare il rasterizer immagini.");
  }

  const canvas = document.createElement("canvas");

  canvas.className = "editor-webgl-canvas";
  canvas.setAttribute("aria-label", "Area di disegno WebGL");

  stage.dataset.canvasReady = "true";
  stage.dataset.paintEngine = "webgl2";
  stage.replaceChildren(canvas);

  window.CBO.imageRasterizer?.dispose?.();
  window.CBO.imageRasterizer = null;
  window.CBO.smudgeEngine?.dispose?.();
  window.CBO.smudgeEngine = null;
  window.CBO.brushEngine?.dispose?.();
  window.CBO.documentRenderer?.dispose?.();
  window.CBO.documentRenderer = null;

  const gl = window.CBO.DocumentRenderer.createContext(canvas);

  if (!gl) {
    throw new Error("WebGL2 non disponibile: impossibile inizializzare il canvas editor.");
  }

  const viewport = window.CBO.DocumentRenderer.resizeCanvasViewport(canvas, gl);
  const layerModel = window.CBO.documentLayerModel || new window.CBO.DocumentLayerModel();

  window.CBO.documentLayerModel = layerModel;

  const documentRenderer = new window.CBO.DocumentRenderer({
    gl,
    layerModel,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
  let brushEngine;
  let smudgeEngine;

  try {
    brushEngine = new window.CBO.BrushEngine(canvas, {
      gl,
      documentRenderer,
    });
  } catch (error) {
    documentRenderer.dispose();
    throw error;
  }

  try {
    smudgeEngine = new window.CBO.SmudgeEngine(canvas, {
      gl,
      documentRenderer,
      getViewState: () => ({
        camera: brushEngine.camera,
        dpr: brushEngine.dpr,
      }),
      requestDraw: () => brushEngine.draw(),
    });
  } catch (error) {
    brushEngine.dispose();
    documentRenderer.dispose();
    throw error;
  }

  window.CBO.brushEngine = brushEngine;
  window.CBO.smudgeEngine = smudgeEngine;
  window.CBO.documentRenderer = documentRenderer;

  try {
    window.CBO.imageRasterizer = new window.CBO.ImageRasterizer({
      gl,
      getDocumentSize: () => ({
        width: window.CBO.documentRenderer.width,
        height: window.CBO.documentRenderer.height,
      }),
      getTarget: (options = {}) => {
        if (options.layerId) {
          return window.CBO.documentRenderer.getRasterTarget(options.layerId, options);
        }

        return window.CBO.documentRenderer.getPaintTarget();
      },
      markContent: ({ layerId, bounds }) => {
        if (!layerId || !bounds) {
          return;
        }

        window.CBO.documentRenderer.markRasterTargetContentMaybe(layerId, bounds);
      },
    });
  } catch (error) {
    smudgeEngine.dispose();
    brushEngine.dispose();
    documentRenderer.dispose();
    window.CBO.smudgeEngine = null;
    window.CBO.brushEngine = null;
    window.CBO.documentRenderer = null;
    throw error;
  }
};
