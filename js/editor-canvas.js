window.CBO = window.CBO || {};

window.CBO.placeUploadedImageOnCanvas = async function placeUploadedImageOnCanvas(detail = {}) {
  const engine = window.CBO.brushEngine;

  if (!engine?.placeImageBlob || !detail.blob) {
    return;
  }

  try {
    await engine.placeImageBlob(detail.blob, {
      name: detail.name || "Uploaded image",
    });
  } catch (error) {
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

  const canvas = document.createElement("canvas");

  canvas.className = "editor-webgl-canvas";
  canvas.setAttribute("aria-label", "Area di disegno WebGL");

  stage.dataset.canvasReady = "true";
  stage.dataset.paintEngine = "webgl2";
  stage.replaceChildren(canvas);

  window.CBO.brushEngine?.dispose?.();
  window.CBO.brushEngine = new window.CBO.BrushEngine(canvas);
};
