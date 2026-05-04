window.CBO = window.CBO || {};

const EDITOR_DOCUMENT_SIZE = 4000;

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

  if (!window.CBO.DocumentHistory) {
    throw new Error("DocumentHistory non caricato: impossibile inizializzare la history documento.");
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

  window.CBO.documentHistory?.dispose?.();
  window.CBO.documentHistory = null;
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
    documentWidth: EDITOR_DOCUMENT_SIZE,
    documentHeight: EDITOR_DOCUMENT_SIZE,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
  window.CBO.documentHistory = new window.CBO.DocumentHistory({
    maxEntries: 40,
    maxRasterHistoryMiB: 256,
  });
  let brushEngine;
  let smudgeEngine;

  try {
    brushEngine = new window.CBO.BrushEngine(canvas, {
      gl,
      documentRenderer,
    });
  } catch (error) {
    window.CBO.documentHistory?.dispose?.();
    window.CBO.documentHistory = null;
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
      requestDraw: () => brushEngine.requestDraw?.() || brushEngine.draw(),
    });
  } catch (error) {
    window.CBO.documentHistory?.dispose?.();
    window.CBO.documentHistory = null;
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
      createTargetForPlacement: (options = {}) => {
        if (
          !options.layerId ||
          options.cropped === false ||
          Number.isFinite(options.x) ||
          Number.isFinite(options.y)
        ) {
          return null;
        }

        const renderer = window.CBO.documentRenderer;

        if (!renderer?.createRasterTargetForRect || !renderer?.replaceRasterTarget) {
          return null;
        }

        const sourceWidth = Math.max(1, Math.round(options.sourceWidth || 1));
        const sourceHeight = Math.max(1, Math.round(options.sourceHeight || 1));
        const rect = renderer.getClampedDocumentRect?.({
          x: Math.round((renderer.width - sourceWidth) * 0.5),
          y: Math.round((renderer.height - sourceHeight) * 0.5),
          width: sourceWidth,
          height: sourceHeight,
        });
        const target = rect ? renderer.createRasterTargetForRect(rect, [0, 0, 0, 0], 2) : null;

        if (!target) {
          return null;
        }

        renderer.replaceRasterTarget(options.layerId, target, {
          emit: false,
          source: options.source || "image-placement-target",
        });

        return {
          ...target,
          drawX: rect.x - target.x,
          drawY: rect.y - target.y,
          layerId: options.layerId,
        };
      },
      getTarget: (options = {}) => {
        if (options.layerId) {
          return window.CBO.documentRenderer.getRasterTarget(options.layerId);
        }

        return window.CBO.documentRenderer.getPaintTarget();
      },
    });
  } catch (error) {
    window.CBO.documentHistory?.dispose?.();
    window.CBO.documentHistory = null;
    smudgeEngine.dispose();
    brushEngine.dispose();
    documentRenderer.dispose();
    window.CBO.smudgeEngine = null;
    window.CBO.brushEngine = null;
    window.CBO.documentRenderer = null;
    throw error;
  }
};
