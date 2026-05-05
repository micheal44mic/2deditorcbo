window.CBO = window.CBO || {};

const EDITOR_DOCUMENT_PRESETS = Object.freeze([
  { id: "square-1024", label: "1024 x 1024", tag: "DRAFT", width: 1024, height: 1024 },
  { id: "square-2048", label: "2048 x 2048", tag: "STANDARD", width: 2048, height: 2048 },
  { id: "square-3000", label: "3000 x 3000", tag: "LARGE", width: 3000, height: 3000 },
  { id: "square-4000", label: "4000 x 4000", tag: "CURRENT", width: 4000, height: 4000 },
  { id: "landscape-1920", label: "1920 x 1080", tag: "LANDSCAPE", width: 1920, height: 1080 },
  { id: "story-1080", label: "1080 x 1920", tag: "STORY", width: 1080, height: 1920 },
  { id: "social-1080", label: "1080 x 1080", tag: "SOCIAL", width: 1080, height: 1080 },
]);
const DEFAULT_DOCUMENT_PRESET_ID = "square-4000";

function getDocumentPreset(id) {
  return EDITOR_DOCUMENT_PRESETS.find((preset) => preset.id === id) ||
    EDITOR_DOCUMENT_PRESETS.find((preset) => preset.id === DEFAULT_DOCUMENT_PRESET_ID) ||
    EDITOR_DOCUMENT_PRESETS[0];
}

function normalizeDocumentSize(options = {}) {
  const preset = getDocumentPreset(options.presetId);
  const width = Number.isFinite(options.documentWidth) && options.documentWidth > 0
    ? Math.floor(options.documentWidth)
    : preset.width;
  const height = Number.isFinite(options.documentHeight) && options.documentHeight > 0
    ? Math.floor(options.documentHeight)
    : preset.height;

  return {
    height,
    presetId: preset.id,
    width,
  };
}

function createDocumentPresetButton(preset) {
  const button = document.createElement("button");
  const preview = document.createElement("span");
  const label = document.createElement("span");
  const tag = document.createElement("span");

  button.className = "document-start-preset";
  button.type = "button";
  button.dataset.documentPreset = preset.id;
  button.setAttribute("aria-label", `Create ${preset.label} document`);

  preview.className = "document-start-preset-preview";
  preview.style.setProperty("--document-preset-aspect", `${preset.width} / ${preset.height}`);

  label.className = "document-start-preset-label";
  label.textContent = preset.label;

  tag.className = "document-start-preset-tag";
  tag.textContent = preset.tag;

  button.append(preview, label, tag);
  return button;
}

function formatAutosaveDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function createDocumentRecoveryButton(summary) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const meta = document.createElement("span");
  const savedAt = formatAutosaveDate(summary?.savedAt);
  const sizeLabel = `${Math.max(1, Math.round(summary?.width || 1))} x ${Math.max(1, Math.round(summary?.height || 1))}`;
  const layerLabel = `${Math.max(0, Math.round(summary?.layerCount || 0))} layers`;
  const tileLabel = `${Math.max(0, Math.round(summary?.tileCount || 0))} tiles`;

  button.className = "document-start-recovery";
  button.type = "button";
  button.dataset.documentRecovery = "latest";
  button.setAttribute("aria-label", "Continue autosaved document");

  label.className = "document-start-recovery-label";
  label.textContent = "Continue autosaved document";

  meta.className = "document-start-recovery-meta";
  meta.textContent = [sizeLabel, layerLabel, tileLabel, savedAt].filter(Boolean).join(" | ");

  button.append(label, meta);
  return button;
}

window.CBO.initEditorDocumentStart = function initEditorDocumentStart() {
  const stage = document.querySelector(".editor-stage");

  if (!stage || stage.dataset.canvasReady === "true") {
    return null;
  }

  if (stage.dataset.documentStartReady === "true") {
    return stage.querySelector("[data-document-start]");
  }

  const screen = document.createElement("div");
  const panel = document.createElement("section");
  const title = document.createElement("h1");
  const recoveryHost = document.createElement("div");
  const presetGrid = document.createElement("div");

  screen.className = "document-start-screen";
  screen.dataset.documentStart = "";

  panel.className = "document-start-panel";
  panel.setAttribute("aria-labelledby", "document-start-title");

  title.className = "document-start-title";
  title.id = "document-start-title";
  title.textContent = "New document";

  recoveryHost.className = "document-start-recovery-host";
  recoveryHost.hidden = true;

  presetGrid.className = "document-start-presets";
  presetGrid.setAttribute("aria-label", "Document presets");
  presetGrid.append(...EDITOR_DOCUMENT_PRESETS.map(createDocumentPresetButton));

  presetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-document-preset]");

    if (!button) {
      return;
    }

    const preset = getDocumentPreset(button.dataset.documentPreset);

    window.CBO.initEditorCanvas({
      documentHeight: preset.height,
      documentWidth: preset.width,
      presetId: preset.id,
    });
  });

  panel.append(title, recoveryHost, presetGrid);
  screen.append(panel);
  stage.dataset.documentStartReady = "true";
  stage.replaceChildren(screen);

  const autosave = window.CBO.documentAutosave;

  if (autosave?.getLatestSummary && autosave?.restoreLatest) {
    void autosave.getLatestSummary().then((summary) => {
      if (!summary || stage.dataset.canvasReady === "true") {
        return;
      }

      const recoveryButton = createDocumentRecoveryButton(summary);

      recoveryButton.addEventListener("click", () => {
        recoveryButton.disabled = true;
        recoveryButton.dataset.loading = "true";
        void autosave.restoreLatest().then((didRestore) => {
          if (didRestore) {
            return;
          }

          recoveryButton.disabled = false;
          recoveryButton.dataset.loading = "false";
        }).catch((error) => {
          console.warn("Impossibile ripristinare l'autosave documento.", error);
          recoveryButton.disabled = false;
          recoveryButton.dataset.loading = "false";
        });
      });

      recoveryHost.replaceChildren(recoveryButton);
      recoveryHost.hidden = false;
    });
  }

  requestAnimationFrame(() => {
    screen.querySelector(`[data-document-preset="${DEFAULT_DOCUMENT_PRESET_ID}"]`)?.focus();
  });

  return screen;
};

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

window.CBO.initEditorCanvas = function initEditorCanvas(options = {}) {
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
  const documentSize = normalizeDocumentSize(options);

  canvas.className = "editor-webgl-canvas";
  canvas.setAttribute("aria-label", "Area di disegno WebGL");

  stage.dataset.canvasReady = "true";
  stage.dataset.documentStartReady = "false";
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
    documentWidth: documentSize.width,
    documentHeight: documentSize.height,
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
  window.CBO.documentSettings = {
    height: documentRenderer.height,
    presetId: documentSize.presetId,
    requestedHeight: documentSize.height,
    requestedWidth: documentSize.width,
    width: documentRenderer.width,
  };

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
        const documentWidth = Math.max(1, Math.round(renderer.width || 1));
        const documentHeight = Math.max(1, Math.round(renderer.height || 1));
        const fitScale = Math.min(1, documentWidth / sourceWidth, documentHeight / sourceHeight);
        const drawWidth = Math.max(1, Math.min(documentWidth, Math.floor(sourceWidth * fitScale)));
        const drawHeight = Math.max(1, Math.min(documentHeight, Math.floor(sourceHeight * fitScale)));
        const rect = renderer.getClampedDocumentRect?.({
          x: Math.round((documentWidth - drawWidth) * 0.5),
          y: Math.round((documentHeight - drawHeight) * 0.5),
          width: drawWidth,
          height: drawHeight,
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
          drawHeight,
          drawWidth,
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

  window.dispatchEvent(new CustomEvent("cbo:editor-canvas-ready", {
    detail: {
      documentHeight: documentRenderer.height,
      documentWidth: documentRenderer.width,
      presetId: documentSize.presetId,
      requestedHeight: documentSize.height,
      requestedWidth: documentSize.width,
    },
  }));
};
