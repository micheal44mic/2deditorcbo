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
const MOBILE_DOCUMENT_PRESET_ID = "square-2048";
const DEFAULT_MOCKUP_ARTBOARD_SIZE = 2048;
const DESKTOP_RASTER_HISTORY_PROFILE = Object.freeze({
  maxEntries: 40,
  maxRasterHistoryGpuHotMiB: 0,
  maxRasterHistoryMiB: 600,
  minRasterHistoryGpuHotEntries: 0,
});
const MOBILE_RASTER_HISTORY_PROFILE = Object.freeze({
  maxEntries: 32,
  maxRasterHistoryGpuHotMiB: 0,
  maxRasterHistoryMiB: 400,
  minRasterHistoryGpuHotEntries: 0,
});

function isMobileLikeDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const memory = Number(navigator.deviceMemory) || 0;
  const touch = Number(navigator.maxTouchPoints) > 1;
  const coarsePointer = typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)")?.matches === true;
  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  return Boolean(
    mobileUserAgent ||
    (coarsePointer && (memory === 0 || memory <= 8)) ||
    (touch && memory > 0 && memory <= 6)
  );
}

function getDefaultDocumentPresetId() {
  const override = typeof window !== "undefined"
    ? String(window.CBO?.defaultDocumentPresetId || "").trim()
    : "";

  if (override) {
    return override;
  }

  return isMobileLikeDevice() ? MOBILE_DOCUMENT_PRESET_ID : DEFAULT_DOCUMENT_PRESET_ID;
}

function getRasterHistoryProfile() {
  const baseProfile = isMobileLikeDevice()
    ? MOBILE_RASTER_HISTORY_PROFILE
    : DESKTOP_RASTER_HISTORY_PROFILE;
  const override = typeof window !== "undefined" && window.CBO?.rasterHistoryProfile &&
    typeof window.CBO.rasterHistoryProfile === "object"
    ? window.CBO.rasterHistoryProfile
    : null;

  return {
    ...baseProfile,
    ...(override || {}),
  };
}

function isDocumentHistoryDisabled() {
  const namespaceValue = window.CBO?.isDocumentHistoryDisabled?.();

  if (typeof namespaceValue === "boolean") {
    return namespaceValue;
  }

  return Boolean(
    window.CBO?.documentHistoryDisabled === true ||
    window.CBO?.androidHistoryDisabled === true ||
    window.CBO?.androidHistoryEnabled === false
  );
}

function getDocumentPreset(id) {
  const defaultPresetId = getDefaultDocumentPresetId();

  return EDITOR_DOCUMENT_PRESETS.find((preset) => preset.id === id) ||
    EDITOR_DOCUMENT_PRESETS.find((preset) => preset.id === defaultPresetId) ||
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

function formatEditorZoomLabel(camera = {}) {
  const zoom = Math.abs(Number(camera?.zoom));
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const percent = safeZoom * 100;

  if (percent >= 1000) {
    return `${Math.round(percent).toLocaleString("en-US")}%`;
  }

  if (percent >= 10) {
    return `${Math.round(percent)}%`;
  }

  return `${Math.max(0.1, Math.round(percent * 10) / 10)}%`;
}

function updateEditorZoomIndicator(indicator, camera = {}) {
  if (!indicator) {
    return;
  }

  const label = formatEditorZoomLabel(camera);

  indicator.value = label;
  indicator.textContent = label;
  indicator.title = `Zoom ${label}`;
}

function createEditorCanvasReadyDetail(documentRenderer, documentSize = {}, source = "editor-canvas-ready") {
  if (!documentRenderer) {
    return null;
  }

  return {
    documentHeight: documentRenderer.height,
    documentWidth: documentRenderer.width,
    presetId: documentSize.presetId || "",
    requestedHeight: documentSize.requestedHeight || documentSize.height || documentRenderer.height,
    requestedWidth: documentSize.requestedWidth || documentSize.width || documentRenderer.width,
    source,
  };
}

function dispatchEditorCanvasReady(documentRenderer, documentSize = {}, options = {}) {
  const detail = createEditorCanvasReadyDetail(
    documentRenderer,
    documentSize,
    options.source || "editor-canvas-ready",
  );

  if (!detail) {
    return null;
  }

  window.CBO.lastEditorCanvasReadyDetail = detail;
  window.dispatchEvent(new CustomEvent("cbo:editor-canvas-ready", { detail }));

  return detail;
}

window.CBO.emitEditorCanvasReady = function emitEditorCanvasReady(options = {}) {
  const renderer = window.CBO.documentRenderer;

  if (!renderer) {
    return null;
  }

  const settings = window.CBO.documentSettings || {};

  return dispatchEditorCanvasReady(renderer, {
    height: settings.height || renderer.height,
    presetId: settings.presetId || options.presetId || "",
    requestedHeight: settings.requestedHeight || settings.height || renderer.height,
    requestedWidth: settings.requestedWidth || settings.width || renderer.width,
    width: settings.width || renderer.width,
  }, {
    source: options.source || "editor-canvas-ready",
  });
};

function getPrimaryDocumentArtboardId() {
  const artboards = typeof window !== "undefined"
    ? window.CBO?.getDocumentArtboards?.() || []
    : [];
  const primaryArtboard = artboards.find((artboard) => artboard?.isPrimary === true) || artboards[0] || null;

  return String(primaryArtboard?.id || "active-document").trim() || "active-document";
}

function resolveUploadedImageArtboardId(layerModel) {
  const activeEntry = layerModel?.findEntryById?.(layerModel.activeLayerId) || null;
  const resolvedArtboardId = String(
    layerModel?.resolveInsertionArtboardId?.(activeEntry) ||
    window.CBO?.getActiveDocumentArtboardId?.({ layerId: activeEntry?.id }) ||
    "",
  ).trim();
  const knownArtboards = window.CBO?.getDocumentArtboards?.() || [];

  return knownArtboards.some((artboard) => artboard?.id === resolvedArtboardId)
    ? resolvedArtboardId
    : getPrimaryDocumentArtboardId();
}

function ensureUploadArtboardGroups(layerModel) {
  const artboards = window.CBO?.getDocumentArtboards?.() || [];

  if (Array.isArray(artboards) && artboards.length > 0) {
    layerModel?.ensureArtboardGroups?.(artboards, {
      history: false,
      source: "image-upload-artboard-groups",
    });
  }
}

function getEntryArtboardGroupId(entry, layerModel) {
  return String(
    layerModel?.getArtboardIdFromGroup?.(entry) ||
    entry?.artboardId ||
    "",
  ).trim();
}

function insertLayerAtTopOfArtboardEntries(entries, artboardId, layer, layerModel) {
  const normalizedArtboardId = String(artboardId || "").trim();

  if (!normalizedArtboardId || !Array.isArray(entries) || !layer) {
    return false;
  }

  for (const entry of entries) {
    if (
      entry?.type === "group" &&
      entry.artboardGroup === true &&
      getEntryArtboardGroupId(entry, layerModel) === normalizedArtboardId
    ) {
      entry.children = Array.isArray(entry.children) ? entry.children : [];
      entry.children.unshift(layer);
      return true;
    }

    if (insertLayerAtTopOfArtboardEntries(entry?.children || [], normalizedArtboardId, layer, layerModel)) {
      return true;
    }
  }

  return false;
}

function removeLayerFromEntriesById(entries, layerId) {
  const normalizedLayerId = String(layerId || "").trim();

  if (!normalizedLayerId || !Array.isArray(entries)) {
    return Array.isArray(entries) ? entries : [];
  }

  return entries
    .filter((entry) => entry?.id !== normalizedLayerId)
    .map((entry) => {
      if (entry?.type !== "group") {
        return entry;
      }

      return {
        ...entry,
        children: removeLayerFromEntriesById(entry.children || [], normalizedLayerId),
      };
    });
}

function toPositiveDocumentInteger(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? Math.max(1, Math.round(number))
    : fallback;
}

function getDocumentPresetIdForSize(width, height) {
  const exactPreset = EDITOR_DOCUMENT_PRESETS.find((preset) =>
    preset.width === width && preset.height === height,
  );

  return exactPreset?.id || getDefaultDocumentPresetId();
}

window.CBO.editorDocumentPresets = EDITOR_DOCUMENT_PRESETS;
window.CBO.getDefaultEditorDocumentPresetId = getDefaultDocumentPresetId;
window.CBO.getEditorDocumentPreset = getDocumentPreset;

function getMockupAssetName(detail = {}) {
  return String(detail.name || detail.alt || "Mockup").trim() || "Mockup";
}

function getMockupArtboardSize(detail = {}) {
  return {
    height: toPositiveDocumentInteger(
      detail.artboardHeight ?? detail.documentHeight,
      DEFAULT_MOCKUP_ARTBOARD_SIZE,
    ),
    width: toPositiveDocumentInteger(
      detail.artboardWidth ?? detail.documentWidth,
      DEFAULT_MOCKUP_ARTBOARD_SIZE,
    ),
  };
}

function isEditorCanvasReady() {
  const stage = document.querySelector(".editor-stage");

  return Boolean(
    stage?.dataset.canvasReady === "true" &&
    window.CBO.documentRenderer &&
    window.CBO.documentLayerModel &&
    window.CBO.imageRasterizer,
  );
}

function getExistingDocumentArtboardId(artboardId) {
  const normalizedArtboardId = String(artboardId || "").trim();
  const knownArtboards = window.CBO?.getDocumentArtboards?.() || [];

  return knownArtboards.some((artboard) => artboard?.id === normalizedArtboardId)
    ? normalizedArtboardId
    : getPrimaryDocumentArtboardId();
}

async function fetchMockupAssetBlob(src) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Mockup asset non disponibile: ${response.status}`);
  }

  return response.blob();
}

function getMockupArtboardRect(artboardId) {
  const normalizedArtboardId = getExistingDocumentArtboardId(artboardId);
  const artboard = (window.CBO?.getDocumentArtboards?.() || [])
    .find((record) => record?.id === normalizedArtboardId) || null;

  return {
    height: Math.max(1, Math.round(Number(artboard?.height || window.CBO?.documentRenderer?.height) || 1)),
    width: Math.max(1, Math.round(Number(artboard?.width || window.CBO?.documentRenderer?.width) || 1)),
    x: Math.round(Number(artboard?.x) || 0),
    y: Math.round(Number(artboard?.y) || 0),
  };
}

function getMockupPlacementRect(detail = {}, artboardId) {
  const artboardRect = getMockupArtboardRect(artboardId);

  return {
    height: artboardRect.height,
    width: artboardRect.width,
    x: artboardRect.x,
    y: artboardRect.y,
  };
}

function createMockupPlacementTarget(layerId, placementRect, source = "mockup-placement-target") {
  const renderer = window.CBO.documentRenderer;

  if (!layerId || !placementRect || !renderer?.createRasterTargetForRect || !renderer?.replaceRasterTarget) {
    return null;
  }

  const target = renderer.createRasterTargetForRect(placementRect, [0, 0, 0, 0]);

  if (!target) {
    return null;
  }

  renderer.replaceRasterTarget(layerId, target, {
    emit: false,
    invalidate: false,
    source,
  });

  return {
    ...target,
    drawHeight: placementRect.height,
    drawWidth: placementRect.width,
    drawX: 0,
    drawY: 0,
    layerId,
  };
}

function prepareMockupArtboard(detail = {}) {
  const size = getMockupArtboardSize(detail);
  const name = getMockupAssetName(detail);

  if (!isEditorCanvasReady()) {
    window.CBO.documentSaveSystem?.clearCurrentDocument?.();
    window.CBO.setDocumentProjectName?.("", { source: "mockup-document-new" });
    window.CBO.initEditorCanvas({
      documentHeight: size.height,
      documentWidth: size.width,
      presetId: getDocumentPresetIdForSize(size.width, size.height),
    });

    return getPrimaryDocumentArtboardId();
  }

  const artboard = window.CBO.createDocumentArtboard?.({
    height: size.height,
    history: true,
    name,
    source: "mockup-artboard-create",
    width: size.width,
  });

  window.CBO.ensureDocumentLayerArtboardGroups?.({
    source: "mockup-artboard-layer-groups",
  });

  return getExistingDocumentArtboardId(artboard?.id);
}

function focusMockupArtboard(artboardId) {
  const normalizedArtboardId = getExistingDocumentArtboardId(artboardId);

  window.CBO.selectDocumentArtboard?.(normalizedArtboardId, {
    force: true,
    source: "mockup-artboard-select",
  });

  return normalizedArtboardId;
}

function focusMockupArtboardView(artboardId, options = {}) {
  const normalizedArtboardId = focusMockupArtboard(artboardId);

  if (typeof window.CBO.focusPreviewArtboardView === "function") {
    window.CBO.focusPreviewArtboardView(normalizedArtboardId, {
      closeDrawer: options.closeDrawer !== false,
      source: options.source || "mockup-artboard-view",
    });
    return normalizedArtboardId;
  }

  if (options.closeDrawer !== false) {
    window.CBO.closeDrawerPanel?.();
  }

  window.CBO.fitPreviewArtboard?.(normalizedArtboardId);
  window.CBO.fitPreviewArtboards?.();
  return normalizedArtboardId;
}

async function placeMockupImageLayer(detail = {}, artboardId) {
  const rasterizer = window.CBO.imageRasterizer;
  const layerModel = window.CBO.documentLayerModel;
  const documentRenderer = window.CBO.documentRenderer;
  const src = String(detail.src || "").trim();

  if (!rasterizer?.placeBlob || !src || !layerModel?.createLayer || !documentRenderer?.getRasterTarget) {
    window.CBO.EraserZoomDebug?.warn?.("mockup-place-unavailable", {
      hasCreateLayer: Boolean(layerModel?.createLayer),
      hasGetRasterTarget: Boolean(documentRenderer?.getRasterTarget),
      hasPlaceBlob: Boolean(rasterizer?.placeBlob),
      src,
    });
    return false;
  }

  const targetArtboardId = getExistingDocumentArtboardId(artboardId);
  const name = getMockupAssetName(detail);
  window.CBO.EraserZoomDebug?.log?.("mockup-place-start", {
    artboardId: targetArtboardId,
    id: detail.id || "",
    name,
    src,
  });
  const blob = await fetchMockupAssetBlob(src);
  const placementRect = getMockupPlacementRect(detail, targetArtboardId);

  window.CBO.EraserZoomDebug?.log?.("mockup-place-blob", {
    artboardId: targetArtboardId,
    blobBytes: Number(blob?.size) || 0,
    blobType: blob?.type || "",
    placementRect,
    src,
  });

  ensureUploadArtboardGroups(layerModel);

  const imageLayer = layerModel.createLayer({
    artboardId: targetArtboardId,
    mockupAsset: {
      id: detail.id || "",
      name,
      src,
    },
    name,
    type: "image",
  });
  const entries = layerModel.getEntries();
  const didInsertInArtboard = insertLayerAtTopOfArtboardEntries(
    entries,
    targetArtboardId,
    imageLayer,
    layerModel,
  );
  const nextEntries = didInsertInArtboard ? entries : [imageLayer, ...entries];

  layerModel.setEntries(nextEntries, { activeLayerId: imageLayer.id, source: "mockup-image-layer" });
  window.CBO.EraserZoomDebug?.log?.("mockup-layer-created", {
    artboardId: targetArtboardId,
    layerId: imageLayer.id,
    layerType: imageLayer.type,
    placementRect,
    src,
  });

  try {
    const placementTarget = createMockupPlacementTarget(imageLayer.id, placementRect);
    window.CBO.EraserZoomDebug?.log?.("mockup-placement-target", {
      layerId: imageLayer.id,
      placementRect,
      target: window.CBO.EraserZoomDebug?.getTargetSummary?.(
        documentRenderer.rasterTargetsByLayerId?.get?.(imageLayer.id),
        documentRenderer,
      ),
    });
    const placement = await rasterizer.placeBlob(blob, {
      artboardId: targetArtboardId,
      ...(placementTarget
        ? {
            drawHeight: placementRect.height,
            drawWidth: placementRect.width,
            target: placementTarget,
            x: 0,
            y: 0,
          }
        : {}),
      layerId: imageLayer.id,
      source: "mockup-rasterize",
    });

    window.CBO.EraserZoomDebug?.log?.("mockup-place-blob-done", {
      destinationRect: placement?.destinationRect || null,
      layerId: imageLayer.id,
      sourceRect: placement?.sourceRect || null,
      target: window.CBO.EraserZoomDebug?.getTargetSummary?.(
        documentRenderer.rasterTargetsByLayerId?.get?.(imageLayer.id),
        documentRenderer,
      ),
    });

    if (placement?.destinationRect && layerModel.updateLayer) {
      const didUpdateMetadata = layerModel.updateLayer(imageLayer.id, {
        imageAsset: {
          importedAt: new Date().toISOString(),
          name,
          sourceRect: placement.sourceRect || null,
          src,
        },
        imageBounds: placement.destinationRect,
        mockupAsset: {
          id: detail.id || "",
          importedAt: new Date().toISOString(),
          name,
          src,
        },
      }, {
        history: false,
        source: "mockup-image-metadata",
      });

      if (didUpdateMetadata !== false) {
        documentRenderer.commitVisualDirtyChange?.({
          layerId: imageLayer.id,
          rect: placement.destinationRect,
          source: "mockup-image-metadata",
          usePreviewDirtyTiles: true,
        });
        documentRenderer.requestDraw?.();
      }
    }

    return true;
  } catch (error) {
    const remainingEntries = removeLayerFromEntriesById(layerModel.getEntries(), imageLayer.id);

    layerModel.setEntries(remainingEntries, { source: "mockup-image-error" });
    window.CBO.EraserZoomDebug?.warn?.("mockup-place-error", {
      layerId: imageLayer.id,
      message: error?.message || String(error),
      src,
    });
    throw error;
  }
}

function createEditorZoomIndicator(camera = {}) {
  const indicator = document.createElement("output");

  indicator.className = "editor-zoom-indicator";
  indicator.dataset.editorZoomIndicator = "";
  indicator.setAttribute("aria-label", "Zoom");
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  updateEditorZoomIndicator(indicator, camera);

  return indicator;
}

window.CBO.placeUploadedImageOnCanvas = async function placeUploadedImageOnCanvas(detail = {}) {
  const rasterizer = window.CBO.imageRasterizer;
  const layerModel = window.CBO.documentLayerModel;
  const documentRenderer = window.CBO.documentRenderer;

  if (!rasterizer?.placeBlob || !detail.blob || !layerModel?.createLayer || !documentRenderer?.getRasterTarget) {
    return;
  }

  ensureUploadArtboardGroups(layerModel);
  const uploadArtboardId = resolveUploadedImageArtboardId(layerModel);
  const imageLayer = layerModel.createLayer({
    artboardId: uploadArtboardId,
    name: detail.name || "Image",
    type: "image",
  });
  const entries = layerModel.getEntries();
  const didInsertInArtboard = insertLayerAtTopOfArtboardEntries(
    entries,
    uploadArtboardId,
    imageLayer,
    layerModel,
  );
  const nextEntries = didInsertInArtboard ? entries : [imageLayer, ...entries];

  layerModel.setEntries(nextEntries, { activeLayerId: imageLayer.id, source: "image-upload" });

  try {
    const placement = await rasterizer.placeBlob(detail.blob, {
      artboardId: uploadArtboardId,
      layerId: imageLayer.id,
      source: "image-rasterize",
    });

    if (placement?.destinationRect && layerModel.updateLayer) {
      const didUpdateMetadata = layerModel.updateLayer(imageLayer.id, {
        imageAsset: {
          importedAt: new Date().toISOString(),
          name: detail.name || "Image",
          sourceRect: placement.sourceRect || null,
        },
        imageBounds: placement.destinationRect,
      }, {
        history: false,
        source: "image-upload-metadata",
      });

      if (didUpdateMetadata !== false) {
        documentRenderer.commitVisualDirtyChange?.({
          layerId: imageLayer.id,
          rect: placement.destinationRect,
          source: "image-upload-metadata",
          usePreviewDirtyTiles: true,
        });
        documentRenderer.requestDraw?.();
      }
    }

  } catch (error) {
    const remainingEntries = removeLayerFromEntriesById(layerModel.getEntries(), imageLayer.id);

    layerModel.setEntries(remainingEntries, { source: "image-upload-error" });
    console.warn("Impossibile inserire l'immagine caricata nel canvas.", error);
  }
};

window.addEventListener("cbo:place-uploaded-image", (event) => {
  void window.CBO.placeUploadedImageOnCanvas(event.detail);
});

window.CBO.openMockupAsset = async function openMockupAsset(detail = {}) {
  const src = String(detail.src || "").trim();

  if (!src) {
    return false;
  }

  window.CBO.EraserZoomDebug?.log?.("mockup-open-start", {
    id: detail.id || "",
    name: getMockupAssetName(detail),
    src,
  });
  const artboardId = focusMockupArtboard(prepareMockupArtboard(detail));
  const didPlace = await placeMockupImageLayer(detail, artboardId);

  focusMockupArtboardView(artboardId, {
    closeDrawer: true,
    source: "mockup-open-view",
  });
  window.CBO.EraserZoomDebug?.log?.("mockup-open-end", {
    artboardId,
    didPlace,
    id: detail.id || "",
    src,
  });
  return didPlace;
};

window.CBO.addMockupAssetToArtboard = async function addMockupAssetToArtboard(detail = {}, options = {}) {
  const src = String(detail.src || "").trim();

  if (!src || !isEditorCanvasReady()) {
    return false;
  }

  const requestedArtboardId = String(
    options.artboardId ||
    detail.artboardId ||
    window.CBO.getSelectedDocumentArtboardId?.() ||
    window.CBO.getActiveDocumentArtboardId?.() ||
    "",
  ).trim();
  const artboardId = focusMockupArtboard(getExistingDocumentArtboardId(requestedArtboardId));

  const didPlace = await placeMockupImageLayer(detail, artboardId);

  focusMockupArtboardView(artboardId, {
    closeDrawer: true,
    source: "mockup-addon-view",
  });
  return didPlace;
};

window.addEventListener("cbo:open-mockup-asset", (event) => {
  void window.CBO.openMockupAsset(event.detail).catch((error) => {
    console.warn("Impossibile aprire il mockup.", error);
  });
});

window.addEventListener("cbo:add-mockup-asset-to-artboard", (event) => {
  void window.CBO.addMockupAssetToArtboard(event.detail, {
    artboardId: event.detail?.artboardId,
  }).catch((error) => {
    console.warn("Impossibile aggiungere il mockup.", error);
  });
});

window.CBO.initEditorCanvas = function initEditorCanvas(options = {}) {
  const stage = document.querySelector(".editor-stage");
  const editorPage = stage?.closest?.(".editor-page");

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

  if (!window.CBO.DocumentArtboardModel) {
    throw new Error("DocumentArtboardModel non caricato: impossibile inizializzare gli artboard documento.");
  }

  const historyDisabled = isDocumentHistoryDisabled();

  if (!historyDisabled && !window.CBO.DocumentHistory) {
    throw new Error("DocumentHistory non caricato: impossibile inizializzare la history documento.");
  }

  if (!window.CBO.SmudgeEngine) {
    throw new Error("SmudgeEngine non caricato: impossibile inizializzare lo smudge WebGL2.");
  }

  if (!window.CBO.ImageRasterizer) {
    throw new Error("ImageRasterizer non caricato: impossibile inizializzare il rasterizer immagini.");
  }

  const canvas = document.createElement("canvas");
  const zoomIndicator = createEditorZoomIndicator();
  const documentSize = normalizeDocumentSize(options);

  canvas.className = "editor-webgl-canvas";
  canvas.setAttribute("aria-label", "Area di disegno WebGL");

  editorPage?.classList.remove("document-start-active");
  stage.dataset.canvasReady = "true";
  stage.dataset.documentStartReady = "false";
  stage.dataset.paintEngine = "webgl2";
  stage.replaceChildren(canvas, zoomIndicator);

  window.CBO.disposeEditorZoomIndicator?.();
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
    cssArtboardPaper: true,
    gl,
    layerModel,
    documentWidth: documentSize.width,
    documentHeight: documentSize.height,
    transparentBackground: true,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    enableViewportLayerCulling: true,
  });
  window.CBO.documentHistoryDisabled = historyDisabled;
  window.CBO.documentHistory = historyDisabled
    ? null
    : new window.CBO.DocumentHistory(getRasterHistoryProfile());
  let brushEngine;
  let smudgeEngine;

  try {
    brushEngine = new window.CBO.BrushEngine(canvas, {
      enableHistory: !historyDisabled,
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

  const handleZoomIndicatorCameraChange = (event) => {
    updateEditorZoomIndicator(zoomIndicator, event.detail?.camera || brushEngine.camera);
  };

  window.addEventListener("cbo:camera-change", handleZoomIndicatorCameraChange);
  window.CBO.disposeEditorZoomIndicator = function disposeEditorZoomIndicator() {
    window.removeEventListener("cbo:camera-change", handleZoomIndicatorCameraChange);
  };
  updateEditorZoomIndicator(zoomIndicator, brushEngine.camera);

  window.CBO.resetDocumentArtboards?.({
    artboards: options.artboards,
    defaultSecondaryCount: 0,
    documentHeight: documentRenderer.height,
    documentWidth: documentRenderer.width,
    source: "editor-canvas-init-artboards",
  });

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
        const artboardRect = window.CBO.getActiveDocumentArtboardRect?.({
          artboardId: options.artboardId,
          layerId: options.layerId,
        }) || {
          height: Math.max(1, Math.round(renderer.height || 1)),
          width: Math.max(1, Math.round(renderer.width || 1)),
          x: 0,
          y: 0,
        };
        const documentWidth = Math.max(1, Math.round(artboardRect.width || 1));
        const documentHeight = Math.max(1, Math.round(artboardRect.height || 1));
        const fitScale = Math.min(1, documentWidth / sourceWidth, documentHeight / sourceHeight);
        const drawWidth = Math.max(1, Math.min(documentWidth, Math.floor(sourceWidth * fitScale)));
        const drawHeight = Math.max(1, Math.min(documentHeight, Math.floor(sourceHeight * fitScale)));
        const rect = renderer.getClampedDocumentRect?.({
          x: Math.round(artboardRect.x + (documentWidth - drawWidth) * 0.5),
          y: Math.round(artboardRect.y + (documentHeight - drawHeight) * 0.5),
          width: drawWidth,
          height: drawHeight,
        });
        const target = rect ? renderer.createRasterTargetForRect(rect, [0, 0, 0, 0]) : null;

        if (!target) {
          return null;
        }

        renderer.replaceRasterTarget(options.layerId, target, {
          emit: false,
          invalidate: false,
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

  if (options.deferReadyEvent === true) {
    window.CBO.lastEditorCanvasReadyDetail = createEditorCanvasReadyDetail(
      documentRenderer,
      documentSize,
      "editor-canvas-init-deferred",
    );
    return;
  }

  dispatchEditorCanvasReady(documentRenderer, documentSize, {
    source: "editor-canvas-init",
  });

  if (options.startWithNoActiveLayer === true) {
    layerModel.setActiveLayer(null, {
      history: false,
      source: "editor-canvas-start-clear-layer-selection",
    });
  }
};
