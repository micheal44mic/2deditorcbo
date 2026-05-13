window.CBO = window.CBO || {};

(function registerArtboardPreview(namespace) {
  const PREVIEW_ARTBOARD_WIDTH = 1048;
  const PREVIEW_ARTBOARD_HEIGHT = 2048;
  const PREVIEW_ARTBOARD_GAP = 256;
  const DEFAULT_PREVIEW_ARTBOARD_COUNT = 0;
  const ARTBOARD_SIZE_MAX = 32768;
  const ARTBOARD_SIZE_PRESETS = [
    { id: "current", label: "SAME AS CURRENT" },
    { id: "document", label: "DOCUMENT SIZE" },
    { id: "portrait", height: 1920, label: "1080 x 1920", width: 1080 },
    { id: "landscape", height: 1080, label: "1920 x 1080", width: 1920 },
    { id: "custom", label: "CUSTOM" },
  ];
  const FIT_PADDING_CSS_PX = 72;
  const PREVIEW_OVERLAY_OVERSCAN_CSS_PX = 512;
  const LABEL_HIT_HEIGHT_CSS_PX = 30;
  const SELECTION_TOOL_MODE = "selection";

  let lastCameraState = null;
  let isReady = false;
  let currentToolMode = SELECTION_TOOL_MODE;
  let selectedArtboardId = "";
  let artboardDragState = null;
  let artboardCreatePopover = null;
  let artboardCreateButton = null;
  let activeArtboardSizePreset = "current";

  function getStage() {
    return document.querySelector(".editor-stage");
  }

  function getRenderer() {
    return namespace.documentRenderer || null;
  }

  function getBrushEngine() {
    return namespace.brushEngine || null;
  }

  function getFallbackPrimaryArtboard() {
    const renderer = getRenderer();
    const width = Math.max(1, Math.round(renderer?.width || namespace.documentSettings?.width || 1));
    const height = Math.max(1, Math.round(renderer?.height || namespace.documentSettings?.height || 1));

    return {
      height,
      id: "active-document",
      isPrimary: true,
      name: "Artboard 1",
      type: "active",
      width,
      x: 0,
      y: 0,
    };
  }

  function getAllArtboards() {
    const artboards = namespace.getDocumentArtboards?.();

    return Array.isArray(artboards) && artboards.length > 0
      ? artboards
      : [getFallbackPrimaryArtboard()];
  }

  function getArtboardById(artboardId) {
    const normalizedId = String(artboardId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return getAllArtboards().find((artboard) => artboard.id === normalizedId) || null;
  }

  function cloneArtboard(artboard) {
    return {
      height: artboard.height,
      id: artboard.id,
      isPrimary: artboard.isPrimary === true,
      name: artboard.name,
      type: artboard.type,
      width: artboard.width,
      x: artboard.x,
      y: artboard.y,
    };
  }

  function clampArtboardSize(value, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return Math.max(1, Math.round(Number(fallback) || 1));
    }

    return Math.max(1, Math.min(ARTBOARD_SIZE_MAX, Math.round(number)));
  }

  function formatArtboardSize(size) {
    return `${clampArtboardSize(size?.width, PREVIEW_ARTBOARD_WIDTH)} x ${clampArtboardSize(size?.height, PREVIEW_ARTBOARD_HEIGHT)}`;
  }

  function getActiveArtboardForSizing() {
    const activeId = String(
      namespace.getSelectedDocumentArtboardId?.() ||
      selectedArtboardId ||
      namespace.getActiveDocumentArtboardId?.() ||
      "",
    ).trim();

    return getArtboardById(activeId) || getAllArtboards()[0] || getFallbackPrimaryArtboard();
  }

  function getDocumentArtboardSize() {
    const renderer = getRenderer();

    return {
      height: clampArtboardSize(renderer?.height || namespace.documentSettings?.height, PREVIEW_ARTBOARD_HEIGHT),
      width: clampArtboardSize(renderer?.width || namespace.documentSettings?.width, PREVIEW_ARTBOARD_WIDTH),
    };
  }

  function resolveArtboardPresetSize(presetId) {
    const preset = ARTBOARD_SIZE_PRESETS.find((entry) => entry.id === presetId) || ARTBOARD_SIZE_PRESETS[0];

    if (preset?.id === "document") {
      return getDocumentArtboardSize();
    }

    if (Number.isFinite(Number(preset?.width)) && Number.isFinite(Number(preset?.height))) {
      return {
        height: clampArtboardSize(preset.height, PREVIEW_ARTBOARD_HEIGHT),
        width: clampArtboardSize(preset.width, PREVIEW_ARTBOARD_WIDTH),
      };
    }

    const activeArtboard = getActiveArtboardForSizing();

    return {
      height: clampArtboardSize(activeArtboard?.height, PREVIEW_ARTBOARD_HEIGHT),
      width: clampArtboardSize(activeArtboard?.width, PREVIEW_ARTBOARD_WIDTH),
    };
  }

  function ensureArtboardCreatePopover() {
    if (artboardCreatePopover?.isConnected) {
      return artboardCreatePopover;
    }

    const host = document.querySelector(".editor-page") || document.body;
    const presetButtons = ARTBOARD_SIZE_PRESETS.map((preset) => `
      <button class="artboard-create-preset" type="button" data-artboard-size-preset="${preset.id}" aria-pressed="false">
        <span class="artboard-create-preset-label">${preset.label}</span>
        <span class="artboard-create-preset-size" data-artboard-preset-size="${preset.id}"></span>
      </button>
    `).join("");

    host.insertAdjacentHTML(
      "beforeend",
      `
        <section class="artboard-create-popover" data-artboard-create-popover role="dialog" aria-label="Artboard options" hidden>
          <div class="artboard-create-header">
            <h2 class="artboard-create-title">ARTBOARD</h2>
            <button class="artboard-create-icon-button" type="button" aria-label="Close artboard options" data-artboard-popover-close>
              <svg class="artboard-create-icon lucide lucide-x-icon lucide-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div class="artboard-create-presets" data-artboard-preset-list>
            ${presetButtons}
          </div>
          <div class="artboard-create-custom-fields" data-artboard-custom-fields hidden>
            <label class="artboard-create-size-field">
              <span>W</span>
              <input class="artboard-create-size-input" type="number" min="1" max="${ARTBOARD_SIZE_MAX}" step="1" inputmode="numeric" data-artboard-width-input />
            </label>
            <label class="artboard-create-size-field">
              <span>H</span>
              <input class="artboard-create-size-input" type="number" min="1" max="${ARTBOARD_SIZE_MAX}" step="1" inputmode="numeric" data-artboard-height-input />
            </label>
          </div>
          <div class="artboard-create-actions">
            <button class="artboard-create-cancel" type="button" data-artboard-popover-close>CANCEL</button>
            <button class="artboard-create-confirm" type="button" data-artboard-create-confirm>
              <svg class="artboard-create-check-icon lucide lucide-check-icon lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>CREATE</span>
            </button>
          </div>
        </section>
      `,
    );

    artboardCreatePopover = host.querySelector("[data-artboard-create-popover]");
    artboardCreatePopover?.addEventListener("click", handleArtboardPopoverClick);
    artboardCreatePopover?.addEventListener("input", handleArtboardPopoverInput);

    return artboardCreatePopover;
  }

  function getArtboardCreateInputs() {
    const popover = ensureArtboardCreatePopover();

    return {
      heightInput: popover?.querySelector("[data-artboard-height-input]") || null,
      widthInput: popover?.querySelector("[data-artboard-width-input]") || null,
    };
  }

  function syncArtboardCreatePresetLabels() {
    const popover = ensureArtboardCreatePopover();

    ARTBOARD_SIZE_PRESETS.forEach((preset) => {
      const label = popover?.querySelector(`[data-artboard-preset-size="${preset.id}"]`);

      if (!label) {
        return;
      }

      label.textContent = preset.id === "custom"
        ? "SET WIDTH + HEIGHT"
        : formatArtboardSize(resolveArtboardPresetSize(preset.id));
    });
  }

  function setActiveArtboardSizePreset(presetId, options = {}) {
    const popover = ensureArtboardCreatePopover();
    const normalizedPresetId = ARTBOARD_SIZE_PRESETS.some((preset) => preset.id === presetId)
      ? presetId
      : "current";
    const customFields = popover?.querySelector("[data-artboard-custom-fields]");
    const { heightInput, widthInput } = getArtboardCreateInputs();
    const shouldShowCustom = normalizedPresetId === "custom";

    activeArtboardSizePreset = normalizedPresetId;
    popover?.querySelectorAll("[data-artboard-size-preset]").forEach((button) => {
      const isActive = button.dataset.artboardSizePreset === normalizedPresetId;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (customFields) {
      customFields.hidden = !shouldShowCustom;
    }

    if (!options.preserveCustomValue && widthInput && heightInput) {
      const size = resolveArtboardPresetSize(shouldShowCustom ? "current" : normalizedPresetId);

      widthInput.value = String(size.width);
      heightInput.value = String(size.height);
    }
  }

  function getArtboardCreateSize() {
    if (activeArtboardSizePreset !== "custom") {
      return resolveArtboardPresetSize(activeArtboardSizePreset);
    }

    const { heightInput, widthInput } = getArtboardCreateInputs();
    const fallback = resolveArtboardPresetSize("current");

    return {
      height: clampArtboardSize(heightInput?.value, fallback.height),
      width: clampArtboardSize(widthInput?.value, fallback.width),
    };
  }

  function positionArtboardCreatePopover() {
    const popover = artboardCreatePopover;
    const button = artboardCreateButton;

    if (!popover || popover.hidden || !button) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 12;
    const maxLeft = Math.max(12, window.innerWidth - popoverRect.width - 12);
    const maxTop = Math.max(12, window.innerHeight - popoverRect.height - 12);
    const left = Math.min(maxLeft, Math.max(12, buttonRect.right + gap));
    const top = Math.min(maxTop, Math.max(12, buttonRect.top - 6));

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function closeArtboardCreatePopover() {
    if (!artboardCreatePopover) {
      return;
    }

    artboardCreatePopover.hidden = true;
    artboardCreateButton?.classList.remove("active");
    artboardCreateButton?.setAttribute("aria-expanded", "false");
    artboardCreateButton?.setAttribute("aria-pressed", "false");
  }

  function openArtboardCreatePopover(button) {
    artboardCreateButton = button || artboardCreateButton || document.querySelector("[data-artboard-create]");
    const popover = ensureArtboardCreatePopover();

    if (!popover) {
      return;
    }

    syncArtboardCreatePresetLabels();
    setActiveArtboardSizePreset(activeArtboardSizePreset || "current");
    popover.hidden = false;
    artboardCreateButton?.classList.add("active");
    artboardCreateButton?.setAttribute("aria-expanded", "true");
    artboardCreateButton?.setAttribute("aria-pressed", "true");
    positionArtboardCreatePopover();
  }

  function submitArtboardCreatePopover() {
    if (!getRenderer()) {
      namespace.initEditorCanvas?.();
    }

    if (!getRenderer()) {
      return;
    }

    const size = getArtboardCreateSize();
    const sourceArtboard = getActiveArtboardForSizing();
    const artboard = createPreviewArtboard({
      height: size.height,
      sourceArtboardId: sourceArtboard?.id,
      width: size.width,
    });

    if (!artboard) {
      return;
    }

    selectArtboard(artboard.id, {
      source: "artboard-preview-create",
    });
    closeArtboardCreatePopover();
    fitPreviewArtboards();
  }

  function handleArtboardPopoverClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const presetButton = target.closest("[data-artboard-size-preset]");

    if (presetButton) {
      setActiveArtboardSizePreset(presetButton.dataset.artboardSizePreset || "current");
      return;
    }

    if (target.closest("[data-artboard-create-confirm]")) {
      submitArtboardCreatePopover();
      return;
    }

    if (target.closest("[data-artboard-popover-close]")) {
      closeArtboardCreatePopover();
    }
  }

  function handleArtboardPopoverInput(event) {
    const target = event.target;

    if (
      target instanceof Element &&
      (target.matches("[data-artboard-width-input]") || target.matches("[data-artboard-height-input]"))
    ) {
      setActiveArtboardSizePreset("custom", {
        preserveCustomValue: true,
      });
    }
  }

  function handleArtboardPopoverDocumentClick(event) {
    const target = event.target;

    if (
      !artboardCreatePopover ||
      artboardCreatePopover.hidden ||
      !(target instanceof Element) ||
      artboardCreatePopover.contains(target) ||
      artboardCreateButton?.contains(target)
    ) {
      return;
    }

    closeArtboardCreatePopover();
  }

  function handleArtboardPopoverKeydown(event) {
    if (event.key === "Escape" && artboardCreatePopover && !artboardCreatePopover.hidden) {
      event.stopPropagation();
      closeArtboardCreatePopover();
    }
  }

  function emitArtboardPreviewChange(source = "artboard-preview") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-preview-change", {
      detail: {
        artboards: getAllArtboards().map(cloneArtboard),
        selectedArtboardId: selectedArtboardId || null,
        source,
      },
    }));
  }

  function emitArtboardSelectionChange(artboard, source = "artboard-preview-selection") {
    window.dispatchEvent(new CustomEvent("cbo:artboard-selection-change", {
      detail: {
        artboard: artboard ? cloneArtboard(artboard) : null,
        artboardId: artboard?.id || null,
        source,
      },
    }));
  }

  function getLastArtboard() {
    const artboards = getAllArtboards();

    return artboards[artboards.length - 1] || getFallbackPrimaryArtboard();
  }

  function createPreviewArtboard(options = {}) {
    const width = clampArtboardSize(options.width, resolveArtboardPresetSize("current").width);
    const height = clampArtboardSize(options.height, resolveArtboardPresetSize("current").height);
    const artboard = namespace.createDocumentArtboard?.({
      height,
      source: "artboard-preview-create",
      sourceArtboardId: options.sourceArtboardId,
      width,
    });

    if (artboard) {
      return artboard;
    }

    const previous = getLastArtboard();

    return {
      height,
      id: `artboard-${Date.now().toString(36)}`,
      isPrimary: false,
      name: "Artboard",
      type: "artboard",
      width,
      x: Math.round(previous.x + previous.width + PREVIEW_ARTBOARD_GAP),
      y: 0,
    };
  }

  function ensureDefaultPreviewArtboards() {
    namespace.ensureDefaultDocumentArtboards?.(DEFAULT_PREVIEW_ARTBOARD_COUNT, {
      source: "artboard-preview-defaults",
    });
  }

  function normalizeBounds(rect) {
    if (!rect) {
      return null;
    }

    if (
      Number.isFinite(Number(rect.left)) &&
      Number.isFinite(Number(rect.top)) &&
      Number.isFinite(Number(rect.right)) &&
      Number.isFinite(Number(rect.bottom))
    ) {
      const left = Number(rect.left);
      const top = Number(rect.top);
      const right = Number(rect.right);
      const bottom = Number(rect.bottom);

      return right > left && bottom > top
        ? { bottom, left, right, top }
        : null;
    }

    if (
      Number.isFinite(Number(rect.x)) &&
      Number.isFinite(Number(rect.y)) &&
      Number.isFinite(Number(rect.width)) &&
      Number.isFinite(Number(rect.height))
    ) {
      const left = Number(rect.x);
      const top = Number(rect.y);
      const width = Number(rect.width);
      const height = Number(rect.height);

      return width > 0 && height > 0
        ? {
            bottom: top + height,
            left,
            right: left + width,
            top,
          }
        : null;
    }

    if (
      Number.isFinite(Number(rect.x1)) &&
      Number.isFinite(Number(rect.y1)) &&
      Number.isFinite(Number(rect.x2)) &&
      Number.isFinite(Number(rect.y2))
    ) {
      const left = Number(rect.x1);
      const top = Number(rect.y1);
      const right = Number(rect.x2);
      const bottom = Number(rect.y2);

      return right > left && bottom > top
        ? { bottom, left, right, top }
        : null;
    }

    return null;
  }

  function getBoundsFromQuad(quad) {
    if (!Array.isArray(quad) || quad.length === 0) {
      return null;
    }

    const points = quad
      .map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (points.length === 0) {
      return null;
    }

    return normalizeBounds({
      bottom: Math.max(...points.map((point) => point.y)),
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
    });
  }

  function getArtboardBounds(artboard) {
    return normalizeBounds({
      height: artboard?.height,
      width: artboard?.width,
      x: artboard?.x,
      y: artboard?.y,
    });
  }

  function getUnionBounds(boundsList = []) {
    const list = Array.isArray(boundsList) ? boundsList : [];

    return list
      .map(normalizeBounds)
      .filter(Boolean)
      .reduce((rect, bounds) => {
        if (!rect) {
          return { ...bounds };
        }

        return {
          bottom: Math.max(rect.bottom, bounds.bottom),
          left: Math.min(rect.left, bounds.left),
          right: Math.max(rect.right, bounds.right),
          top: Math.min(rect.top, bounds.top),
        };
      }, null);
  }

  function getUnionRect(artboards = []) {
    const list = Array.isArray(artboards) ? artboards : [];

    return getUnionBounds(list.map(getArtboardBounds));
  }

  function expandBounds(bounds, amount = 0) {
    const rect = normalizeBounds(bounds);
    const safeAmount = Math.max(0, Number(amount) || 0);

    return rect
      ? {
          bottom: rect.bottom + safeAmount,
          left: rect.left - safeAmount,
          right: rect.right + safeAmount,
          top: rect.top - safeAmount,
        }
      : null;
  }

  function boundsIntersect(a, b) {
    const first = normalizeBounds(a);
    const second = normalizeBounds(b);

    return Boolean(
      first &&
      second &&
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top
    );
  }

  function ensureOverlay() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-preview-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-artboard-preview-layer";
      layer.dataset.artboardPreviewLayer = "";
      stage.appendChild(layer);
    }

    return layer;
  }

  function ensurePaperLayer() {
    const stage = getStage();

    if (!stage || !getRenderer()) {
      return null;
    }

    let layer = stage.querySelector("[data-artboard-paper-layer]");

    if (!layer) {
      layer = document.createElement("div");
      layer.className = "editor-artboard-paper-layer";
      layer.dataset.artboardPaperLayer = "";
      stage.appendChild(layer);
    }

    return layer;
  }

  function getCameraState() {
    const brushEngine = getBrushEngine();
    const camera = lastCameraState?.camera || brushEngine?.camera || { x: 0, y: 0, zoom: 1 };

    return {
      camera,
      dpr: Math.max(1, Number(lastCameraState?.dpr || brushEngine?.dpr || window.devicePixelRatio || 1)),
    };
  }

  function getStageViewportSize(stage, dpr) {
    if (!stage) {
      return null;
    }

    const brushEngine = getBrushEngine();
    const rect = stage.getBoundingClientRect();
    const width = Number(lastCameraState?.viewportWidth) ||
      Number(brushEngine?.viewportWidth) ||
      ((stage.clientWidth || rect.width || 1) * dpr);
    const height = Number(lastCameraState?.viewportHeight) ||
      Number(brushEngine?.viewportHeight) ||
      ((stage.clientHeight || rect.height || 1) * dpr);

    return {
      height: Math.max(1, Math.round(height)),
      width: Math.max(1, Math.round(width)),
    };
  }

  function resolveVisibleDocRect() {
    const stage = getStage();

    if (!stage) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const viewportSize = getStageViewportSize(stage, dpr);
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const cameraX = Number(camera.x) || 0;
    const cameraY = Number(camera.y) || 0;

    if (!viewportSize) {
      return null;
    }

    return normalizeBounds({
      bottom: (viewportSize.height - cameraY) / zoom,
      left: (0 - cameraX) / zoom,
      right: (viewportSize.width - cameraX) / zoom,
      top: (0 - cameraY) / zoom,
    });
  }

  function getPreviewOverlayCullRect() {
    const visibleDocRect = resolveVisibleDocRect();

    if (!visibleDocRect) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const overscanDoc = (PREVIEW_OVERLAY_OVERSCAN_CSS_PX * dpr) / zoom;

    return expandBounds(visibleDocRect, overscanDoc);
  }

  function getActiveSelectionBounds() {
    const areaSelection = namespace.areaSelection;

    if (areaSelection?.hasSelection?.()) {
      const selectionBounds = normalizeBounds(areaSelection.getRect?.() || areaSelection.getBounds?.());

      if (selectionBounds) {
        return selectionBounds;
      }
    }

    const selectionProviders = [
      { context: namespace, method: namespace.resolveActiveSelectionRect },
      { context: namespace, method: namespace.getActiveSelectionRect },
      { context: namespace, method: namespace.getSelectionRect },
      { context: namespace, method: namespace.getSelectionBounds },
      { context: namespace.selectionTool, method: namespace.selectionTool?.getBounds },
      { context: namespace.rasterTransformTool, method: namespace.rasterTransformTool?.getSelectionBounds },
    ];

    for (const provider of selectionProviders) {
      if (typeof provider.method !== "function") {
        continue;
      }

      try {
        const selectionBounds = normalizeBounds(provider.method.call(provider.context, { source: "artboard-preview-fit" }));

        if (selectionBounds) {
          return selectionBounds;
        }
      } catch (error) {
        // Optional selection integrations may not be initialized yet.
      }
    }

    const transformTool = namespace.rasterTransformTool;
    const isTransformSelectionActive = Boolean(transformTool) && (
      transformTool.isActive?.() ||
      transformTool.isSelectionActive?.() ||
      transformTool.isOverlayActive?.()
    );

    if (!isTransformSelectionActive) {
      return null;
    }

    return getBoundsFromQuad(transformTool?.currentQuad) || normalizeBounds(transformTool?.contentRect);
  }

  function resolveScaleTargetRect(options = {}) {
    const artboards = Array.isArray(options.artboards) ? options.artboards : getAllArtboards();

    if (options.ignoreSelection !== true) {
      const selectionBounds = getActiveSelectionBounds();

      if (selectionBounds) {
        return selectionBounds;
      }
    }

    const selectedId = String(namespace.getSelectedDocumentArtboardId?.() || selectedArtboardId || "").trim();
    const selectedArtboardBounds = selectedId
      ? getArtboardBounds(artboards.find((artboard) => artboard.id === selectedId))
      : null;

    if (selectedArtboardBounds) {
      return selectedArtboardBounds;
    }

    const visibleDocRect = resolveVisibleDocRect();
    const visibleArtboards = visibleDocRect
      ? artboards.filter((artboard) => boundsIntersect(getArtboardBounds(artboard), visibleDocRect))
      : [];

    return getUnionRect(visibleArtboards) || getUnionRect(artboards);
  }

  function getEventDocumentPoint(event) {
    const brushEngine = getBrushEngine();

    if (brushEngine?.screenToDocumentSpace) {
      return brushEngine.screenToDocumentSpace(event.clientX, event.clientY);
    }

    const stage = getStage();

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const viewportX = (event.clientX - rect.left) * dpr;
    const viewportY = (event.clientY - rect.top) * dpr;

    return {
      docX: (viewportX - (Number(camera.x) || 0)) / zoom,
      docY: (viewportY - (Number(camera.y) || 0)) / zoom,
    };
  }

  function getArtboardAtDocumentPoint(point) {
    const x = Number(point?.docX ?? point?.x);
    const y = Number(point?.docY ?? point?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const labelHitHeight = (LABEL_HIT_HEIGHT_CSS_PX * dpr) / zoom;

    return [...getAllArtboards()].reverse().find((artboard) => (
      x >= artboard.x &&
      y >= artboard.y - labelHitHeight &&
      x <= artboard.x + artboard.width &&
      y <= artboard.y + artboard.height
    )) || null;
  }

  function selectArtboard(artboardId, options = {}) {
    const didUseDocumentModel = typeof namespace.selectDocumentArtboard === "function";
    const artboard = didUseDocumentModel
      ? namespace.selectDocumentArtboard(artboardId, options)
      : getArtboardById(artboardId);

    if (!artboard) {
      return null;
    }

    selectedArtboardId = artboard.id;
    renderArtboardPreviews();

    if (!didUseDocumentModel && options.emit !== false) {
      emitArtboardSelectionChange(artboard, options.source || "artboard-preview-selection");
    }

    return cloneArtboard(artboard);
  }

  function clearArtboardSelection(options = {}) {
    const currentSelection = namespace.getSelectedDocumentArtboardId?.() || selectedArtboardId || "";

    if (!currentSelection) {
      return false;
    }

    selectedArtboardId = "";
    if (typeof namespace.clearDocumentArtboardSelection === "function") {
      const didClear = namespace.clearDocumentArtboardSelection(options);

      renderArtboardPreviews();
      return didClear;
    }

    renderArtboardPreviews();

    if (options.emit !== false) {
      emitArtboardSelectionChange(null, options.source || "artboard-preview-clear-selection");
    }

    return true;
  }

  function renamePreviewArtboards() {
    return getAllArtboards().map(cloneArtboard);
  }

  function movePreviewArtboard(artboardId, x, y, options = {}) {
    const artboard = namespace.moveDocumentArtboard?.(artboardId, x, y, options) || null;

    if (!artboard) {
      return null;
    }

    renderArtboardPreviews();

    return cloneArtboard(artboard);
  }

  function getArtboardContentLayerIds(artboardId) {
    return namespace.getArtboardContentLayerIds?.(artboardId) || [];
  }

  function getArtboardBackgroundLayer(artboardId) {
    const normalizedId = String(artboardId || "active-document").trim() || "active-document";
    const layerModel = namespace.documentLayerModel;
    const backgroundId = layerModel?.getArtboardBackgroundLayerId?.(normalizedId) ||
      (normalizedId === "active-document" ? "background" : `background-${normalizedId}`);
    const flatLayers = layerModel?.flattenTopToBottom?.();

    if (Array.isArray(flatLayers)) {
      return flatLayers.find((layer) => (
        (layer.id === backgroundId || layer.type === "background") &&
        String(layer.artboardId || "active-document").trim() === normalizedId
      )) || null;
    }

    return layerModel?.findEntryById?.(backgroundId) || null;
  }

  function isArtboardBackgroundVisible(artboardId) {
    const backgroundLayer = getArtboardBackgroundLayer(artboardId);

    return backgroundLayer ? backgroundLayer.visible !== false : true;
  }

  function getArtboardDragScreenOffset(dx, dy) {
    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);

    return {
      x: (dx * zoom) / dpr,
      y: (dy * zoom) / dpr,
    };
  }

  function applyArtboardDragDomTransform(artboardId, dx = 0, dy = 0) {
    const stage = getStage();
    const normalizedId = String(artboardId || "").trim();

    if (!stage || !normalizedId) {
      return;
    }

    const screenOffset = getArtboardDragScreenOffset(dx, dy);
    const transform = dx || dy
      ? `translate(${screenOffset.x}px, ${screenOffset.y}px)`
      : "";

    stage
      .querySelectorAll("[data-artboard-id]")
      .forEach((element) => {
        if (element.dataset.artboardId === normalizedId) {
          element.style.transform = transform;
        }
      });
  }

  function clearArtboardDragDomTransform(artboardId) {
    applyArtboardDragDomTransform(artboardId, 0, 0);
  }

  function syncArtboardDragPreview() {
    if (!artboardDragState) {
      return;
    }

    applyArtboardDragDomTransform(
      artboardDragState.artboardId,
      artboardDragState.dx || 0,
      artboardDragState.dy || 0,
    );
  }

  function deletePreviewArtboard(artboardId, options = {}) {
    const normalizedId = String(artboardId || "").trim();

    if (namespace.deleteDocumentArtboard?.(normalizedId, options) !== true) {
      return false;
    }

    renamePreviewArtboards();

    if (selectedArtboardId === normalizedId) {
      selectedArtboardId = "";
    }

    if (options.fit !== false) {
      fitPreviewArtboards();
    } else {
      renderArtboardPreviews();
    }

    return true;
  }

  function handleToolChange(event) {
    currentToolMode = String(event.detail?.toolMode || event.detail?.label || "").trim().toLowerCase();

    if (currentToolMode !== SELECTION_TOOL_MODE) {
      getStage()?.classList.remove("artboard-label-hover");
    }
  }

  function getArtboardLabelAtClientPoint(clientX, clientY) {
    const layer = getStage()?.querySelector("[data-artboard-preview-layer]");

    if (!layer) {
      return null;
    }

    const frames = Array.from(layer.querySelectorAll("[data-artboard-id]"));
    const hitFrame = frames.find((frame) => {
      const label = frame.querySelector(".editor-artboard-frame-label");
      const rect = label?.getBoundingClientRect?.();

      return rect &&
        clientX >= rect.left &&
        clientY >= rect.top &&
        clientX <= rect.right &&
        clientY <= rect.bottom;
    });

    return hitFrame ? getArtboardById(hitFrame.dataset.artboardId) : null;
  }

  function updateArtboardLabelHover(event) {
    const stage = getStage();
    const labelArtboard = currentToolMode === SELECTION_TOOL_MODE
      ? getArtboardLabelAtClientPoint(event.clientX, event.clientY)
      : null;
    const isMovableLabel = labelArtboard && labelArtboard.isPrimary !== true;

    stage?.classList.toggle("artboard-label-hover", Boolean(isMovableLabel));
  }

  function startArtboardDrag(event, artboard) {
    const point = getEventDocumentPoint(event);
    const renderer = getRenderer();
    const brushEngine = getBrushEngine();

    if (!point || !artboard || artboard.isPrimary === true || brushEngine?.isDrawing === true) {
      return false;
    }

    artboardDragState = {
      artboardId: artboard.id,
      didMove: false,
      dx: 0,
      dy: 0,
      layerIds: getArtboardContentLayerIds(artboard.id),
      pointerId: event.pointerId,
      startArtboardRect: {
        height: artboard.height,
        width: artboard.width,
        x: artboard.x,
        y: artboard.y,
      },
      startDocX: Number(point.docX) || 0,
      startDocY: Number(point.docY) || 0,
      startX: Number(artboard.x) || 0,
      startY: Number(artboard.y) || 0,
    };
    renderer?.beginArtboardDragPreview?.({
      artboardId: artboard.id,
      layerIds: artboardDragState.layerIds,
      startArtboardRect: artboardDragState.startArtboardRect,
    });
    namespace.vectorTextRenderer?.beginArtboardDragPreview?.({
      artboardId: artboard.id,
      layerIds: artboardDragState.layerIds,
    });

    getStage()?.classList.add("artboard-dragging");
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is a convenience here; dragging still follows document coordinates without it.
    }
    event.preventDefault();
    event.stopPropagation();

    selectArtboard(artboard.id, {
      source: "artboard-preview-label-pointer",
    });

    return true;
  }

  function updateArtboardDrag(event) {
    if (!artboardDragState || artboardDragState.pointerId !== event.pointerId) {
      updateArtboardLabelHover(event);
      return;
    }

    const point = getEventDocumentPoint(event);

    if (!point) {
      return;
    }

    const nextX = artboardDragState.startX + ((Number(point.docX) || 0) - artboardDragState.startDocX);
    const nextY = artboardDragState.startY + ((Number(point.docY) || 0) - artboardDragState.startDocY);
    const rawDx = nextX - artboardDragState.startX;
    const rawDy = nextY - artboardDragState.startY;
    const constrained = namespace.constrainDocumentArtboardMove?.(
      artboardDragState.artboardId,
      rawDx,
      rawDy,
      {
        startRect: artboardDragState.startArtboardRect,
      },
    ) || { dx: rawDx, dy: rawDy };
    const dx = Number.isFinite(Number(constrained.dx)) ? Number(constrained.dx) : rawDx;
    const dy = Number.isFinite(Number(constrained.dy)) ? Number(constrained.dy) : rawDy;

    artboardDragState.didMove = true;
    artboardDragState.dx = dx;
    artboardDragState.dy = dy;
    getRenderer()?.setArtboardDragPreview?.({
      artboardId: artboardDragState.artboardId,
      dx,
      dy,
      layerIds: artboardDragState.layerIds,
    });
    namespace.vectorTextRenderer?.setArtboardDragPreview?.({
      artboardId: artboardDragState.artboardId,
      dx,
      dy,
      layerIds: artboardDragState.layerIds,
    });
    applyArtboardDragDomTransform(artboardDragState.artboardId, dx, dy);
    getBrushEngine()?.requestDraw?.();

    event.preventDefault();
    event.stopPropagation();
  }

  function finishArtboardDrag(event) {
    if (!artboardDragState || artboardDragState.pointerId !== event.pointerId) {
      return;
    }

    const state = artboardDragState;

    artboardDragState = null;
    getStage()?.classList.remove("artboard-dragging", "artboard-label-hover");
    getRenderer()?.clearArtboardDragPreview?.(state.artboardId);
    namespace.vectorTextRenderer?.clearArtboardDragPreview?.(state.artboardId);
    clearArtboardDragDomTransform(state.artboardId);
    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Some browsers release capture automatically before pointercancel/pointerup.
    }
    event.preventDefault();
    event.stopPropagation();

    if (state.didMove && event.type !== "pointercancel") {
      const dx = Math.round(Number(state.dx) || 0);
      const dy = Math.round(Number(state.dy) || 0);

      if (dx || dy) {
        namespace.commitArtboardMoveWithContents?.(state.artboardId, dx, dy, {
          layerIds: state.layerIds,
          source: "artboard-preview-label-drag",
        });
      } else {
        emitArtboardPreviewChange("artboard-preview-label-drag");
      }
    } else {
      renderArtboardPreviews();
      getBrushEngine()?.requestDraw?.();
    }
  }

  function handleStagePointerDown(event) {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      currentToolMode !== SELECTION_TOOL_MODE
    ) {
      return;
    }

    const labelArtboard = getArtboardLabelAtClientPoint(event.clientX, event.clientY);

    if (startArtboardDrag(event, labelArtboard)) {
      return;
    }

    const artboard = getArtboardAtDocumentPoint(getEventDocumentPoint(event));

    if (!artboard) {
      clearArtboardSelection({
        source: "artboard-preview-stage-empty-pointer",
      });
      return;
    }

    selectArtboard(artboard.id, {
      source: "artboard-preview-stage-pointer",
    });
  }

  function bindStagePointerSelection() {
    const stage = getStage();

    if (!stage || stage.dataset.artboardSelectionReady === "true") {
      return;
    }

    stage.dataset.artboardSelectionReady = "true";
    stage.addEventListener("pointerdown", handleStagePointerDown, true);
    stage.addEventListener("pointermove", updateArtboardDrag, true);
    stage.addEventListener("pointerup", finishArtboardDrag, true);
    stage.addEventListener("pointercancel", finishArtboardDrag, true);
  }

  function syncSelectedArtboardId(artboards) {
    if (!selectedArtboardId) {
      return;
    }

    if (!artboards.some((artboard) => artboard.id === selectedArtboardId)) {
      selectedArtboardId = "";
    }
  }

  function renderArtboardPreviews() {
    const layer = ensureOverlay();
    const paperLayer = ensurePaperLayer();

    if (!layer || !paperLayer) {
      return;
    }

    const { camera, dpr } = getCameraState();
    const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
    const allArtboards = getAllArtboards();
    const cullRect = getPreviewOverlayCullRect();
    const draggedArtboardId = String(artboardDragState?.artboardId || "").trim();
    const artboards = cullRect
      ? allArtboards.filter((artboard) => (
          artboard.id === draggedArtboardId ||
          boundsIntersect(getArtboardBounds(artboard), cullRect)
        ))
      : allArtboards;

    selectedArtboardId = namespace.getSelectedDocumentArtboardId?.() || selectedArtboardId || "";
    syncSelectedArtboardId(allArtboards);
    const artboardViews = artboards.map((artboard) => {
      const left = ((Number(camera.x) || 0) + artboard.x * zoom) / dpr;
      const top = ((Number(camera.y) || 0) + artboard.y * zoom) / dpr;
      const width = Math.max(1, (artboard.width * zoom) / dpr);
      const height = Math.max(1, (artboard.height * zoom) / dpr);

      return { artboard, height, left, top, width };
    });

    paperLayer.replaceChildren(...artboardViews.map(({ artboard, height, left, top, width }) => {
      const paper = document.createElement("div");

      paper.className = "editor-artboard-paper";
      paper.dataset.artboardId = artboard.id;
      paper.classList.toggle("is-transparent", !isArtboardBackgroundVisible(artboard.id));
      paper.style.left = `${left}px`;
      paper.style.top = `${top}px`;
      paper.style.width = `${width}px`;
      paper.style.height = `${height}px`;

      return paper;
    }));

    layer.replaceChildren(...artboardViews.map(({ artboard, height, left, top, width }) => {
      const frame = document.createElement("div");
      const label = document.createElement("span");
      const isSelected = selectedArtboardId === artboard.id;

      frame.className = artboard.type === "active"
        ? "editor-artboard-frame is-active"
        : "editor-artboard-frame";
      frame.classList.toggle("is-selected", isSelected);
      frame.dataset.artboardId = artboard.id;
      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;

      label.className = "editor-artboard-frame-label";
      label.textContent = `${artboard.name} ${artboard.width} x ${artboard.height}`;

      frame.append(label);
      return frame;
    }));

    syncArtboardDragPreview();
  }

  function fitPreviewRect(targetRect) {
    const brushEngine = getBrushEngine();
    const stage = getStage();
    const bounds = normalizeBounds(targetRect);

    if (!brushEngine?.camera || !stage || !bounds) {
      renderArtboardPreviews();
      return;
    }

    const dpr = Math.max(1, Number(brushEngine.dpr || window.devicePixelRatio || 1));
    const viewportSize = getStageViewportSize(stage, dpr);

    if (!viewportSize) {
      renderArtboardPreviews();
      return;
    }

    const padding = FIT_PADDING_CSS_PX * dpr;
    const availableWidth = Math.max(1, viewportSize.width - padding * 2);
    const availableHeight = Math.max(1, viewportSize.height - padding * 2);
    const boundsWidth = Math.max(1, bounds.right - bounds.left);
    const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
    const zoom = Math.max(0.05, Math.min(32, availableWidth / boundsWidth, availableHeight / boundsHeight));

    brushEngine.camera.zoom = zoom;
    brushEngine.camera.x = (viewportSize.width - boundsWidth * zoom) * 0.5 - bounds.left * zoom;
    brushEngine.camera.y = (viewportSize.height - boundsHeight * zoom) * 0.5 - bounds.top * zoom;
    brushEngine.userManipulatedCamera = true;
    lastCameraState = {
      ...(lastCameraState || {}),
      camera: {
        x: brushEngine.camera.x,
        y: brushEngine.camera.y,
        zoom: brushEngine.camera.zoom,
      },
      dpr,
    };
    brushEngine.requestDraw?.();
    renderArtboardPreviews();
  }

  function fitPreviewArtboards() {
    fitPreviewRect(resolveScaleTargetRect());
  }

  function fitAllPreviewArtboards() {
    fitPreviewRect(getUnionRect(getAllArtboards()));
  }

  function resetPreviewArtboards(options = {}) {
    const renderer = getRenderer();

    namespace.resetDocumentArtboards?.({
      artboards: options.artboards,
      defaultSecondaryCount: DEFAULT_PREVIEW_ARTBOARD_COUNT,
      documentHeight: renderer?.height || namespace.documentSettings?.height || 1,
      documentWidth: renderer?.width || namespace.documentSettings?.width || 1,
      source: options.source || "artboard-preview-reset",
    });

    if (options.fit !== false) {
      fitPreviewArtboards();
      return;
    }

    renderArtboardPreviews();
  }

  function handleCreateButtonClick() {
    if (!getRenderer()) {
      namespace.initEditorCanvas?.();
    }

    if (!getRenderer()) {
      return;
    }

    if (artboardCreatePopover && !artboardCreatePopover.hidden) {
      closeArtboardCreatePopover();
      return;
    }

    openArtboardCreatePopover(artboardCreateButton);
  }

  namespace.initArtboardPreview = function initArtboardPreview() {
    const button = document.querySelector("[data-artboard-create]");

    currentToolMode = String(document.querySelector("[data-tool].active")?.dataset.toolMode || SELECTION_TOOL_MODE)
      .trim()
      .toLowerCase() || SELECTION_TOOL_MODE;

    if (button && button.dataset.artboardReady !== "true") {
      button.dataset.artboardReady = "true";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-pressed", "false");
      artboardCreateButton = button;
      button.addEventListener("click", handleCreateButtonClick);
    }

    if (isReady) {
      return;
    }

    isReady = true;
    bindStagePointerSelection();

    window.addEventListener("cbo:camera-change", (event) => {
      lastCameraState = event.detail || null;
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:tool-change", handleToolChange);
    window.addEventListener("cbo:document-artboards-change", () => {
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:document-layers-change", () => {
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:document-artboard-selection-change", (event) => {
      selectedArtboardId = event.detail?.artboardId || "";
      renderArtboardPreviews();
    });
    window.addEventListener("cbo:editor-canvas-ready", (event) => {
      bindStagePointerSelection();
      if (event.detail?.source === "autosave-restore") {
        fitAllPreviewArtboards();
      } else {
        fitPreviewArtboards();
      }
    });
    window.addEventListener("cbo:editor-canvas-reset", (event) => {
      resetPreviewArtboards({
        source: event.detail?.source || "editor-canvas-reset",
      });
    });
    window.addEventListener("resize", () => renderArtboardPreviews());
    window.addEventListener("resize", positionArtboardCreatePopover);
    document.addEventListener("click", handleArtboardPopoverDocumentClick);
    document.addEventListener("keydown", handleArtboardPopoverKeydown);

    if (getRenderer()) {
      fitPreviewArtboards();
    }
  };

  namespace.createPreviewArtboard = function createPreviewArtboardFromTool(options = {}) {
    const artboard = createPreviewArtboard(options);

    if (artboard?.id) {
      selectArtboard(artboard.id, {
        source: options.source || "artboard-preview-create",
      });
    }
    renderArtboardPreviews();
    return { ...artboard };
  };

  namespace.getPreviewArtboards = function getPreviewArtboards() {
    return getAllArtboards().map(cloneArtboard);
  };

  namespace.selectPreviewArtboard = function selectPreviewArtboard(artboardId, options = {}) {
    return selectArtboard(artboardId, options);
  };

  namespace.getSelectedPreviewArtboardId = function getSelectedPreviewArtboardId() {
    return selectedArtboardId || "";
  };

  namespace.clearPreviewArtboardSelection = function clearPreviewArtboardSelection(options = {}) {
    return clearArtboardSelection(options);
  };

  namespace.resolvePreviewVisibleDocRect = function resolvePreviewVisibleDocRect() {
    const rect = resolveVisibleDocRect();

    return rect ? { ...rect } : null;
  };

  namespace.resolvePreviewScaleTargetRect = function resolvePreviewScaleTargetRect(options = {}) {
    const rect = resolveScaleTargetRect(options);

    return rect ? { ...rect } : null;
  };

  namespace.fitPreviewArtboards = function fitPreviewArtboardsFromTool() {
    fitPreviewArtboards();
  };

  namespace.fitAllPreviewArtboards = function fitAllPreviewArtboardsFromTool() {
    fitAllPreviewArtboards();
  };

  namespace.deletePreviewArtboard = function deletePreviewArtboardFromTool(artboardId, options = {}) {
    return deletePreviewArtboard(artboardId, options);
  };

  namespace.movePreviewArtboard = function movePreviewArtboardFromTool(artboardId, x, y, options = {}) {
    return movePreviewArtboard(artboardId, x, y, options);
  };
})(window.CBO = window.CBO || {});
