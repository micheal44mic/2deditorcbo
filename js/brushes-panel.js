window.CBO = window.CBO || {};

window.CBO.initBrushesPanel = function initBrushesPanel() {
  const BrushLibrary = window.CBO.BrushLibrary;
  const BrushDefaults = window.CBO.BrushDefaults;
  const BrushPreview = window.CBO.BrushPreview;
  const plusIcon = `
    <svg class="brushes-gallery-action-icon lucide lucide-plus-icon lucide-plus" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  `;
  const downloadIcon = `
    <svg class="brushes-gallery-action-icon lucide lucide-download-icon lucide-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 15V3" />
      <path d="m7 10 5 5 5-5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </svg>
  `;
  const copyIcon = `
    <svg class="brushes-gallery-action-icon brushes-gallery-copy-icon lucide lucide-copy-icon lucide-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  `;
  const deleteIcon = `
    <svg class="brushes-gallery-action-icon brushes-gallery-delete-icon lucide lucide-trash-2-icon lucide-trash-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4c0-1 .8-2 2-2h4c1.2 0 2 .8 2 2v2" />
      <path d="M19 6 18 20c-.1 1.1-.9 2-2 2H8c-1.1 0-1.9-.9-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  `;
  const editorPage = document.querySelector(".editor-page");
  const panel = document.querySelector(".right-panel");
  const content = panel?.querySelector(".right-sidebar-content");

  if (!BrushLibrary || !BrushDefaults || !editorPage || !panel || !content || panel.dataset.brushesPanelReady === "true") {
    return;
  }

  const brushPackages = BrushLibrary.getPackages();
  let activePackageIndex = 0;
  let selectedPackageIndex = 0;
  let selectedBrushId = brushPackages[selectedPackageIndex]?.brushIds[0] || "";

  panel.dataset.brushesPanelReady = "true";
  content.insertAdjacentHTML(
    "beforeend",
    `
      <section class="brushes-panel right-sidebar-section" data-brush-gallery hidden>
        <div class="brushes-panel-header">
          <h2>CBOs Brushes</h2>
          <div class="brushes-panel-actions">
            <button class="brushes-panel-header-button brushes-panel-gallery-button" type="button" aria-label="BRUSH GALLERY" aria-controls="brushes-gallery-popout" aria-expanded="false" data-tooltip="BRUSH GALLERY">
              <svg class="brushes-panel-icon lucide lucide-library-big-icon lucide-library-big" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="8" height="18" x="3" y="3" rx="1" />
                <path d="M7 3v18" />
                <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" />
              </svg>
            </button>
            <button class="brushes-panel-header-button brushes-panel-studio-button" type="button" aria-label="BRUSH STUDIO" data-tooltip="BRUSH STUDIO">
              <svg class="brushes-panel-icon lucide lucide-notebook-pen-icon lucide-notebook-pen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
                <path d="M2 6h4" />
                <path d="M2 10h4" />
                <path d="M2 14h4" />
                <path d="M2 18h4" />
                <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="brushes-panel-grid" aria-label="Brush gallery" data-sidebar-brush-list>
        </div>
        <button class="brushes-panel-see-more" type="button" aria-controls="brushes-gallery-popout" aria-expanded="false">SEE MORE</button>
      </section>
    `,
  );

  editorPage.insertAdjacentHTML(
    "beforeend",
    `
      <aside class="brushes-gallery-popout" id="brushes-gallery-popout" aria-label="Brush gallery panel" data-brush-popout hidden>
        <div class="brushes-gallery-popout-header">
          <div class="brushes-gallery-popout-title">
            <h2>BRUSH GALLERY</h2>
          </div>
          <div class="brushes-gallery-popout-actions">
            <button class="brushes-gallery-icon-button brushes-gallery-export-button" type="button" aria-label="EXPORT BRUSH PRESETS" data-brush-export>
              ${downloadIcon}
            </button>
            <button class="brushes-gallery-icon-button brushes-gallery-create-button" type="button" aria-label="CREATE BRUSH" data-brush-create>
              ${plusIcon}
            </button>
            <button class="brushes-gallery-studio-button" type="button">BRUSH STUDIO</button>
            <button class="brushes-gallery-close-button" type="button" aria-label="Close brush gallery" data-brush-popout-close>
              <svg class="brushes-gallery-close-icon lucide lucide-x-icon lucide-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div class="brushes-gallery-layout">
          <div class="brushes-gallery-packages" aria-label="Brush packages" data-brush-packages></div>
          <div class="brushes-gallery-brushes" aria-label="Brushes" data-brush-package-items></div>
        </div>
        <div class="brushes-gallery-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="brushes-gallery-delete-title" data-brush-delete-dialog hidden>
          <div class="brushes-gallery-delete-card">
            <h3 id="brushes-gallery-delete-title">DELETE BRUSH?</h3>
            <p><span data-brush-delete-name></span></p>
            <div class="brushes-gallery-delete-actions">
              <button class="brushes-gallery-delete-cancel" type="button" data-brush-delete-cancel>CANCEL</button>
              <button class="brushes-gallery-delete-confirm" type="button" data-brush-delete-confirm>DELETE</button>
            </div>
          </div>
        </div>
      </aside>
      <section class="mobile-brush-library" aria-label="Brushes" data-mobile-brush-library hidden>
        <button class="mobile-brush-library-done" type="button" data-mobile-brush-library-done>Done</button>
        <div class="mobile-brush-library-header">
          <h2>Brushes</h2>
          <div class="mobile-brush-library-actions" aria-label="Brush actions">
            <button class="mobile-brush-library-action" type="button">New set</button>
            <button class="mobile-brush-library-action" type="button" data-mobile-brush-create>New brush</button>
            <button class="mobile-brush-library-action" type="button">Import</button>
          </div>
        </div>
        <div class="mobile-brush-library-layout">
          <div class="mobile-brush-library-packages" aria-label="Brush sets" data-mobile-brush-packages></div>
          <div class="mobile-brush-library-brushes" aria-label="Brushes in set" data-mobile-brush-items></div>
        </div>
        <div class="mobile-brush-library-selection-status" aria-live="polite" data-mobile-brush-status></div>
      </section>
    `,
  );

  const brushGallery = panel.querySelector("[data-brush-gallery]");
  const brushPopout = editorPage.querySelector("[data-brush-popout]");
  const mobileBrushLibrary = editorPage.querySelector("[data-mobile-brush-library]");
  const mobileBrushPackages = mobileBrushLibrary?.querySelector("[data-mobile-brush-packages]");
  const mobileBrushItems = mobileBrushLibrary?.querySelector("[data-mobile-brush-items]");
  const mobileBrushDoneButton = mobileBrushLibrary?.querySelector("[data-mobile-brush-library-done]");
  const mobileBrushCreateButton = mobileBrushLibrary?.querySelector("[data-mobile-brush-create]");
  const mobileBrushStatus = mobileBrushLibrary?.querySelector("[data-mobile-brush-status]");
  const brushPopoutButtons = panel.querySelectorAll(
    ".brushes-panel-gallery-button, .brushes-panel-see-more",
  );
  const sidebarBrushList = panel.querySelector("[data-sidebar-brush-list]");
  const packageList = brushPopout?.querySelector("[data-brush-packages]");
  const packageItems = brushPopout?.querySelector("[data-brush-package-items]");
  const exportBrushesButton = brushPopout?.querySelector("[data-brush-export]");
  const createBrushButton = brushPopout?.querySelector("[data-brush-create]");
  const closeButton = brushPopout?.querySelector("[data-brush-popout-close]");
  const deleteDialog = brushPopout?.querySelector("[data-brush-delete-dialog]");
  const deleteBrushName = brushPopout?.querySelector("[data-brush-delete-name]");
  const deleteCancelButton = brushPopout?.querySelector("[data-brush-delete-cancel]");
  const deleteConfirmButton = brushPopout?.querySelector("[data-brush-delete-confirm]");
  let pendingDeleteBrushId = "";
  let mobileBrushFeedbackTimer = 0;
  let mobileBrushSwipeState = null;
  let openMobileBrushActionRow = null;
  let mobileBrushPreviewGeneration = 0;
  let mobileBrushPreviewQueue = [];
  let mobileBrushPreviewTimer = 0;
  let brushLibraryPersistTimer = 0;
  let pendingBrushLibraryPersistSource = "";
  const MOBILE_BRUSH_PREVIEW_DELAY_MS = 96;
  const MOBILE_BRUSH_PREVIEW_GAP_MS = 54;
  const MOBILE_BRUSH_PREVIEW_SIZE = Object.freeze({
    height: 40,
    width: 156,
  });

  function getMobileBrushDebug() {
    return window.CBO?.MobileBrushDebug || null;
  }

  function traceMobileBrushDebug(eventName, detail = {}) {
    getMobileBrushDebug()?.trace?.(eventName, detail);
  }

  function getDebugNow() {
    return getMobileBrushDebug()?.now?.() || performance?.now?.() || Date.now();
  }

  function getDebugDuration(startMs) {
    return getMobileBrushDebug()?.roundMs?.(getDebugNow() - startMs) || Math.round((getDebugNow() - startMs) * 10) / 10;
  }

  function requestMobileBrushFrame(callback) {
    const requestFrame = window.requestAnimationFrame || ((handler) => window.setTimeout(handler, 16));

    return requestFrame(callback);
  }

  function resetMobileBrushPreviewQueue() {
    mobileBrushPreviewGeneration += 1;
    mobileBrushPreviewQueue = [];

    if (mobileBrushPreviewTimer) {
      window.clearTimeout(mobileBrushPreviewTimer);
      mobileBrushPreviewTimer = 0;
    }

    traceMobileBrushDebug("mobile-brush.preview-lazy-reset", {
      generation: mobileBrushPreviewGeneration,
    });
  }

  function scheduleMobileBrushPreviewPump(delayMs = MOBILE_BRUSH_PREVIEW_GAP_MS) {
    if (mobileBrushPreviewTimer || mobileBrushPreviewQueue.length === 0) {
      return;
    }

    mobileBrushPreviewTimer = window.setTimeout(() => {
      const runPump = () => pumpMobileBrushPreviewQueue();

      mobileBrushPreviewTimer = 0;

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(runPump, {
          timeout: 420,
        });
        return;
      }

      requestMobileBrushFrame(runPump);
    }, Math.max(0, Number(delayMs) || 0));
  }

  function pumpMobileBrushPreviewQueue() {
    if (!isMobileBrushLibraryOpen()) {
      resetMobileBrushPreviewQueue();
      return;
    }

    const job = mobileBrushPreviewQueue.shift();

    if (!job || job.generation !== mobileBrushPreviewGeneration) {
      scheduleMobileBrushPreviewPump();
      return;
    }

    const startMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.preview-lazy-pump.start", {
      brushId: job.brushId,
      generation: job.generation,
      queueWaitMs: getDebugDuration(job.queuedAtMs),
      remainingBefore: mobileBrushPreviewQueue.length,
    });

    if (job.canvas?.isConnected) {
      renderBrushPreview(job.canvas, job.brushId, "mobile-gallery", {
        deferred: true,
        height: MOBILE_BRUSH_PREVIEW_SIZE.height,
        width: MOBILE_BRUSH_PREVIEW_SIZE.width,
      });
      job.canvas.closest(".mobile-brush-library-brush")?.classList.add("has-preview");
    }

    traceMobileBrushDebug("mobile-brush.preview-lazy-pump.end", {
      durationMs: getDebugDuration(startMs),
      remainingAfter: mobileBrushPreviewQueue.length,
    });
    scheduleMobileBrushPreviewPump();
  }

  function queueMobileBrushPreview(canvas, brushId) {
    if (!canvas || !brushId) {
      return;
    }

    const job = {
      brushId,
      canvas,
      generation: mobileBrushPreviewGeneration,
      queuedAtMs: getDebugNow(),
    };

    canvas.closest(".mobile-brush-library-brush")?.classList.remove("has-preview");
    mobileBrushPreviewQueue.push(job);
    traceMobileBrushDebug("mobile-brush.preview-lazy-queue", {
      brushId,
      generation: mobileBrushPreviewGeneration,
      queueLength: mobileBrushPreviewQueue.length,
    });
    scheduleMobileBrushPreviewPump(MOBILE_BRUSH_PREVIEW_DELAY_MS);
  }

  function deferMobileBrushScrollIntoView(container, selector, debugEventPrefix = "mobile-brush.scroll-active") {
    const element = container?.querySelector(selector);

    if (!element) {
      return;
    }

    const queuedAtMs = getDebugNow();

    requestMobileBrushFrame(() => {
      requestMobileBrushFrame(() => {
        const startMs = getDebugNow();

        traceMobileBrushDebug(`${debugEventPrefix}.deferred.start`, {
          queueWaitMs: getDebugDuration(queuedAtMs),
        });
        element.scrollIntoView({
          block: "nearest",
        });
        traceMobileBrushDebug(`${debugEventPrefix}.deferred.end`, {
          durationMs: getDebugDuration(startMs),
        });
      });
    });
  }

  function getBrushName(brushId) {
    return BrushLibrary.getBrush(brushId)?.name || "BRUSH";
  }

  function getSelectedPackage() {
    return brushPackages[selectedPackageIndex] || brushPackages[0] || null;
  }

  function getPackageIndexById(packageId) {
    return brushPackages.findIndex((brushPackage) => brushPackage.id === packageId);
  }

  function canDeleteBrush(brushId) {
    const brushPackage = BrushLibrary.findPackageByBrushId(brushId);

    return (brushPackage?.brushIds.length || 0) > 1;
  }

  function createBrushPresetExportPayload() {
    return BrushLibrary.createLibrarySnapshot({
      selectedBrushId,
      selectedPackageId: getSelectedPackage()?.id || null,
    });
  }

  function downloadBrushPresetExport() {
    const payload = createBrushPresetExportPayload();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `cbo-brush-presets-${timestamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function persistBrushLibraryNow(source = "brush-library-change") {
    const storage = window.CBO.BrushLibraryStorage;

    if (!storage?.save) {
      return;
    }

    void storage.save(createBrushPresetExportPayload(), {
      source,
    });
  }

  function scheduleBrushLibraryPersistence(event) {
    pendingBrushLibraryPersistSource =
      event?.detail?.action ||
      event?.detail?.source ||
      pendingBrushLibraryPersistSource ||
      "brush-library-change";

    if (brushLibraryPersistTimer) {
      return;
    }

    brushLibraryPersistTimer = window.setTimeout(() => {
      const source = pendingBrushLibraryPersistSource || "brush-library-change";

      brushLibraryPersistTimer = 0;
      pendingBrushLibraryPersistSource = "";
      persistBrushLibraryNow(source);
    }, 0);
  }

  function syncSelectionFromPayload(payload = {}) {
    const requestedPackageId = String(payload?.selectedPackageId || "").trim();
    const requestedBrushId = String(payload?.selectedBrushId || "").trim();
    const brushPackage = requestedBrushId
      ? BrushLibrary.findPackageByBrushId(requestedBrushId)
      : null;
    let nextPackageIndex = requestedPackageId ? getPackageIndexById(requestedPackageId) : -1;

    if (nextPackageIndex < 0 && brushPackage) {
      nextPackageIndex = getPackageIndexById(brushPackage.id);
    }

    if (nextPackageIndex < 0) {
      nextPackageIndex = 0;
    }

    const nextPackage = brushPackages[nextPackageIndex] || brushPackages[0] || null;
    const nextBrushId =
      nextPackage?.brushIds.includes(requestedBrushId) === true
        ? requestedBrushId
        : nextPackage?.brushIds[0] || "";

    activePackageIndex = Math.max(0, nextPackageIndex);
    selectedPackageIndex = activePackageIndex;
    selectedBrushId = nextBrushId;
  }

  async function restoreBrushLibraryFromStorage() {
    const storage = window.CBO.BrushLibraryStorage;

    if (!storage?.load || !BrushLibrary.replaceLibraryState) {
      syncSelectionFromPayload();
      return false;
    }

    const payload = await storage.load();

    if (!payload) {
      syncSelectionFromPayload();
      return false;
    }

    const restoreResult = BrushLibrary.replaceLibraryState(payload, {
      silent: true,
      source: "brush-library-storage",
    });

    if (!restoreResult?.restored) {
      syncSelectionFromPayload();
      return false;
    }

    syncSelectionFromPayload(payload);
    window.dispatchEvent(new CustomEvent("cbo:brush-library-restored", {
      detail: {
        ...restoreResult,
        source: "brush-library-storage",
      },
    }));

    return true;
  }

  function renderBrushPreview(canvas, brushId, variant, options = {}) {
    if (!BrushPreview?.render || !canvas) {
      return;
    }

    const settings = BrushLibrary.getSettings(brushId);

    if (!settings) {
      return;
    }

    const startMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.preview-render.start", {
      brushId,
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
      deferred: options.deferred === true,
      variant,
    });
    BrushPreview.render(canvas, brushId, settings, {
      ...options,
      variant,
    });
    traceMobileBrushDebug("mobile-brush.preview-render.end", {
      brushId,
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
      durationMs: getDebugDuration(startMs),
      variant,
    });
  }

  function queueBrushPreview(canvas, brushId, variant) {
    window.requestAnimationFrame(() => {
      renderBrushPreview(canvas, brushId, variant);
    });
  }

  function refreshBrushPreviews(brushId) {
    if (!BrushPreview?.render || !brushId) {
      return;
    }

    BrushPreview.invalidate?.(brushId);

    if ((!brushPopout || brushPopout.hidden) && (!mobileBrushLibrary || mobileBrushLibrary.hidden)) {
      return;
    }

    document.querySelectorAll("[data-brush-preview-id]").forEach((canvas) => {
      if (canvas.dataset.brushPreviewId !== brushId) {
        return;
      }

      if (!["gallery", "mobile-gallery"].includes(canvas.dataset.brushPreviewVariant)) {
        return;
      }

      if (canvas.dataset.brushPreviewVariant === "mobile-gallery") {
        queueMobileBrushPreview(canvas, brushId);
        return;
      }

      renderBrushPreview(canvas, brushId, canvas.dataset.brushPreviewVariant || "gallery");
    });
  }

  function isMobileBrushLibraryViewport() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true;
  }

  function isMobileBrushLibraryOpen() {
    return Boolean(mobileBrushLibrary && !mobileBrushLibrary.hidden);
  }

  function syncMobilePackageButtons() {
    mobileBrushPackages?.querySelectorAll("[data-mobile-brush-package-index]").forEach((button) => {
      const packageIndex = Number(button.dataset.mobileBrushPackageIndex);
      const isActive = packageIndex === activePackageIndex;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function showMobileBrushSelectionFeedback(brushId) {
    if (!mobileBrushLibrary || !mobileBrushStatus) {
      return;
    }

    window.clearTimeout(mobileBrushFeedbackTimer);
    mobileBrushStatus.textContent = `${getBrushName(brushId)} selected`;
    mobileBrushLibrary.classList.add("has-selection-feedback");
    mobileBrushItems?.querySelectorAll(".just-selected").forEach((button) => {
      button.classList.remove("just-selected");
    });
    Array.from(mobileBrushItems?.querySelectorAll("[data-mobile-brush-id]") || [])
      .find((button) => button.dataset.mobileBrushId === brushId)
      ?.classList.add("just-selected");

    mobileBrushFeedbackTimer = window.setTimeout(() => {
      mobileBrushLibrary.classList.remove("has-selection-feedback");
      mobileBrushItems?.querySelectorAll(".just-selected").forEach((button) => {
        button.classList.remove("just-selected");
      });
    }, 820);
  }

  function showMobileBrushStatus(message) {
    if (!mobileBrushLibrary || !mobileBrushStatus) {
      return;
    }

    window.clearTimeout(mobileBrushFeedbackTimer);
    mobileBrushStatus.textContent = message;
    mobileBrushLibrary.classList.add("has-selection-feedback");
    mobileBrushFeedbackTimer = window.setTimeout(() => {
      mobileBrushLibrary.classList.remove("has-selection-feedback");
    }, 820);
  }

  function openMobileBrushStudio(brushId) {
    const startMs = getDebugNow();
    const brush = BrushLibrary.getBrush(brushId);

    if (!brush || typeof window.CBO.openBrushStudio !== "function") {
      traceMobileBrushDebug("mobile-brush.open-studio.unavailable", {
        brushId,
        hasBrush: Boolean(brush),
        hasStudioOpen: typeof window.CBO.openBrushStudio === "function",
      });
      return false;
    }

    traceMobileBrushDebug("mobile-brush.open-studio.start", {
      brushId,
      brushName: getBrushName(brushId),
    });
    closeMobileBrushLibrary();
    window.CBO.openBrushStudio({
      brushId,
      brushName: getBrushName(brushId),
      source: "mobile-brush-library",
    });
    traceMobileBrushDebug("mobile-brush.open-studio.end", {
      brushId,
      durationMs: getDebugDuration(startMs),
    });

    return true;
  }

  const MOBILE_BRUSH_ACTION_HANDLE_WIDTH = 44;

  function getMobileBrushSwipeMaxOffset(row) {
    if (!row) {
      return 0;
    }

    const actions = row.querySelector(".mobile-brush-library-row-actions");
    const rowWidth = Math.max(0, Math.round(row.getBoundingClientRect?.().width || 0));
    const actionsWidth = Math.max(0, Math.round(actions?.getBoundingClientRect?.().width || 0));
    const handleWidth = Math.min(MOBILE_BRUSH_ACTION_HANDLE_WIDTH, Math.max(0, rowWidth - 1));

    return Math.max(0, Math.min(actionsWidth || rowWidth, rowWidth - handleWidth));
  }

  function clampMobileBrushSwipeOffset(value, row) {
    const maxOffset = getMobileBrushSwipeMaxOffset(row);

    return Math.min(maxOffset, Math.max(0, Number(value) || 0));
  }

  function setMobileBrushActionOffset(row, offset) {
    if (!row) {
      return 0;
    }

    const nextOffset = clampMobileBrushSwipeOffset(offset, row);

    row.style.setProperty("--mobile-brush-action-offset", `${nextOffset}px`);

    return nextOffset;
  }

  function closeMobileBrushActions(row = openMobileBrushActionRow) {
    if (!row) {
      return;
    }

    row.classList.remove("is-actions-open", "is-swiping");
    setMobileBrushActionOffset(row, 0);

    if (openMobileBrushActionRow === row) {
      openMobileBrushActionRow = null;
    }
  }

  function openMobileBrushActions(row) {
    if (!row) {
      return;
    }

    if (openMobileBrushActionRow && openMobileBrushActionRow !== row) {
      closeMobileBrushActions(openMobileBrushActionRow);
    }

    row.classList.add("is-actions-open");
    row.classList.remove("is-swiping");
    setMobileBrushActionOffset(row, Number.POSITIVE_INFINITY);
    openMobileBrushActionRow = row;
  }

  function finishMobileBrushSwipe(pointerId = null) {
    if (!mobileBrushSwipeState || (pointerId !== null && mobileBrushSwipeState.pointerId !== pointerId)) {
      return;
    }

    const { button, moved, offset, pointerId: activePointerId, row } = mobileBrushSwipeState;
    const maxOffset = clampMobileBrushSwipeOffset(Number.POSITIVE_INFINITY, row);
    const shouldOpen = moved && offset >= Math.max(44, maxOffset * 0.34);

    row?.classList.remove("is-swiping");

    if (button?.hasPointerCapture?.(activePointerId)) {
      button.releasePointerCapture(activePointerId);
    }

    if (!moved) {
      mobileBrushSwipeState = null;
      return;
    }

    button.dataset.mobileBrushSuppressClick = "true";
    window.setTimeout(() => {
      if (button.dataset.mobileBrushSuppressClick === "true") {
        button.dataset.mobileBrushSuppressClick = "false";
      }
    }, 240);

    if (shouldOpen) {
      openMobileBrushActions(row);
    } else {
      closeMobileBrushActions(row);
    }

    mobileBrushSwipeState = null;
  }

  function handleMobileBrushSwipePointerDown(event, row, button) {
    if (!row || !button || event.button > 0) {
      return;
    }

    if (openMobileBrushActionRow && openMobileBrushActionRow !== row) {
      closeMobileBrushActions(openMobileBrushActionRow);
    }

    mobileBrushSwipeState = {
      button,
      moved: false,
      offset: row.classList.contains("is-actions-open")
        ? clampMobileBrushSwipeOffset(Number.POSITIVE_INFINITY, row)
        : 0,
      pointerId: event.pointerId,
      row,
      startOffset: row.classList.contains("is-actions-open")
        ? clampMobileBrushSwipeOffset(Number.POSITIVE_INFINITY, row)
        : 0,
      startX: event.clientX,
      startY: event.clientY,
    };
    button.setPointerCapture?.(event.pointerId);
  }

  function handleMobileBrushSwipePointerMove(event) {
    if (!mobileBrushSwipeState || mobileBrushSwipeState.pointerId !== event.pointerId) {
      return;
    }

    const { row, startOffset, startX, startY } = mobileBrushSwipeState;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const horizontalIntent = Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.18;

    if (!mobileBrushSwipeState.moved && !horizontalIntent) {
      return;
    }

    mobileBrushSwipeState.moved = true;
    row.classList.add("is-swiping");
    mobileBrushSwipeState.offset = setMobileBrushActionOffset(row, startOffset - deltaX);
    event.preventDefault();
  }

  function duplicateMobileBrush(brushId) {
    const sourcePackage = BrushLibrary.findPackageByBrushId(brushId);
    const packageIndex = getPackageIndexById(sourcePackage?.id);
    const duplicatedBrush = BrushLibrary.duplicateBrush(brushId);

    if (!duplicatedBrush || packageIndex < 0) {
      return;
    }

    activePackageIndex = packageIndex;
    selectBrush(packageIndex, duplicatedBrush.id);
    showMobileBrushSelectionFeedback(duplicatedBrush.id);
  }

  function createMobileBaseBrush() {
    const activePackage = brushPackages[activePackageIndex] || brushPackages[selectedPackageIndex] || brushPackages[0];
    const packageIndex = getPackageIndexById(activePackage?.id);
    const createdBrush = BrushLibrary.createBrush(activePackage?.id);

    if (!createdBrush || packageIndex < 0) {
      showMobileBrushStatus("Brush could not be created");
      return;
    }

    activePackageIndex = packageIndex;
    closeMobileBrushActions();
    selectBrush(packageIndex, createdBrush.id);
    showMobileBrushSelectionFeedback(createdBrush.id);
  }

  function deleteMobileBrush(brushId) {
    if (!canDeleteBrush(brushId)) {
      showMobileBrushStatus("Last brush cannot be deleted");
      closeMobileBrushActions();
      return;
    }

    const brushName = getBrushName(brushId);
    const deleteResult = BrushLibrary.deleteBrush(brushId);

    BrushPreview?.invalidate?.(brushId);
    closeMobileBrushActions();

    if (!deleteResult?.deleted) {
      renderMobileBrushes();
      return;
    }

    const nextPackageIndex = getPackageIndexById(deleteResult.packageId);

    if (selectedBrushId === brushId && nextPackageIndex >= 0 && deleteResult.nextBrushId) {
      selectBrush(nextPackageIndex, deleteResult.nextBrushId);
    } else {
      renderSidebarPackages();
      renderMobilePackages();
      renderMobileBrushes();
    }

    showMobileBrushStatus(`${brushName} deleted`);
  }

  function renderMobilePackages() {
    if (!mobileBrushPackages) {
      return;
    }

    const startMs = getDebugNow();
    const buildStartMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.render-packages.start", {
      activePackageIndex,
      packageCount: brushPackages.length,
    });
    traceMobileBrushDebug("mobile-brush.render-packages.build.start", {
      packageCount: brushPackages.length,
    });
    const packageButtons = brushPackages.map((brushPackage, packageIndex) => {
        const packageButton = document.createElement("button");
        const nameLabel = document.createElement("span");
        const countLabel = document.createElement("span");
        const brushCount = brushPackage.brushIds.length;
        const isActive = packageIndex === activePackageIndex;

        packageButton.className = "mobile-brush-library-package";
        packageButton.type = "button";
        packageButton.dataset.mobileBrushPackageIndex = String(packageIndex);
        packageButton.setAttribute("aria-label", `${brushPackage.name} brush set`);
        packageButton.setAttribute("aria-pressed", String(isActive));
        packageButton.classList.toggle("active", isActive);
        nameLabel.className = "mobile-brush-library-package-name";
        nameLabel.textContent = brushPackage.name;
        countLabel.className = "mobile-brush-library-package-count";
        countLabel.textContent = `${brushCount} ${brushCount === 1 ? "brush" : "brushes"}`;
        packageButton.append(nameLabel, countLabel);
        packageButton.addEventListener("click", () => {
          setActivePackage(packageIndex);
        });

        return packageButton;
      });

    traceMobileBrushDebug("mobile-brush.render-packages.build.end", {
      durationMs: getDebugDuration(buildStartMs),
      rendered: packageButtons.length,
    });
    const replaceStartMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.render-packages.replace-children.start", {
      packageCount: packageButtons.length,
    });
    mobileBrushPackages.replaceChildren(...packageButtons);
    traceMobileBrushDebug("mobile-brush.render-packages.replace-children.end", {
      childCount: mobileBrushPackages.children.length,
      durationMs: getDebugDuration(replaceStartMs),
    });

    deferMobileBrushScrollIntoView(
      mobileBrushPackages,
      ".mobile-brush-library-package.active",
      "mobile-brush.render-packages.scroll-active",
    );
    traceMobileBrushDebug("mobile-brush.render-packages.end", {
      childCount: mobileBrushPackages.children.length,
      durationMs: getDebugDuration(startMs),
      scrollDeferred: true,
    });
  }

  function renderMobileBrushes() {
    const startMs = getDebugNow();
    const activePackage = brushPackages[activePackageIndex] || brushPackages[selectedPackageIndex] || brushPackages[0];
    const brushIds = activePackage?.brushIds || [];

    if (!mobileBrushItems) {
      return;
    }

    traceMobileBrushDebug("mobile-brush.render-brushes.start", {
      activePackageId: activePackage?.id || "",
      activePackageIndex,
      brushCount: brushIds.length,
      selectedBrushId,
    });
    closeMobileBrushActions();
    resetMobileBrushPreviewQueue();

    const buildStartMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.render-brushes.build.start", {
      brushCount: brushIds.length,
    });
    const brushRows = brushIds.map((brushId) => {
        const brushRow = document.createElement("div");
        const actions = document.createElement("div");
        const shareButton = document.createElement("button");
        const duplicateButton = document.createElement("button");
        const deleteButton = document.createElement("button");
        const brushButton = document.createElement("button");
        const brushNameLabel = document.createElement("span");
        const previewCanvas = document.createElement("canvas");
        const isActive = brushId === selectedBrushId;
        const isDeletable = canDeleteBrush(brushId);

        brushRow.className = "mobile-brush-library-brush-row";
        brushRow.dataset.mobileBrushRowId = brushId;
        actions.className = "mobile-brush-library-row-actions";
        shareButton.className = "mobile-brush-library-row-action mobile-brush-library-row-action-share";
        shareButton.type = "button";
        shareButton.textContent = "Share";
        shareButton.setAttribute("aria-label", `Share ${getBrushName(brushId)} brush`);
        duplicateButton.className = "mobile-brush-library-row-action mobile-brush-library-row-action-duplicate";
        duplicateButton.type = "button";
        duplicateButton.textContent = "Duplicate";
        duplicateButton.setAttribute("aria-label", `Duplicate ${getBrushName(brushId)} brush`);
        deleteButton.className = "mobile-brush-library-row-action mobile-brush-library-row-action-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.disabled = !isDeletable;
        deleteButton.setAttribute("aria-label", `Delete ${getBrushName(brushId)} brush`);
        brushButton.className = "mobile-brush-library-brush";
        brushButton.type = "button";
        brushButton.dataset.mobileBrushId = brushId;
        brushButton.classList.toggle("active", isActive);
        brushButton.setAttribute("aria-label", `${getBrushName(brushId)} brush`);
        brushButton.setAttribute("aria-pressed", String(isActive));
        brushNameLabel.className = "mobile-brush-library-brush-name";
        brushNameLabel.textContent = getBrushName(brushId);
        previewCanvas.className = "brush-preview-canvas mobile-brush-library-preview";
        previewCanvas.width = MOBILE_BRUSH_PREVIEW_SIZE.width;
        previewCanvas.height = MOBILE_BRUSH_PREVIEW_SIZE.height;
        previewCanvas.dataset.brushPreviewId = brushId;
        previewCanvas.dataset.brushPreviewVariant = "mobile-gallery";
        actions.append(shareButton, duplicateButton, deleteButton);
        brushButton.append(brushNameLabel, previewCanvas);
        brushRow.append(actions, brushButton);
        queueMobileBrushPreview(previewCanvas, brushId);
        brushButton.addEventListener("pointerdown", (event) => {
          handleMobileBrushSwipePointerDown(event, brushRow, brushButton);
        });
        brushButton.addEventListener("click", (event) => {
          traceMobileBrushDebug("mobile-brush.row-click", {
            brushId,
            isActionsOpen: brushRow.classList.contains("is-actions-open"),
            isSelected: brushId === selectedBrushId,
            suppressClick: brushButton.dataset.mobileBrushSuppressClick === "true",
          });

          if (brushButton.dataset.mobileBrushSuppressClick === "true") {
            brushButton.dataset.mobileBrushSuppressClick = "false";
            return;
          }

          if (brushRow.classList.contains("is-actions-open")) {
            closeMobileBrushActions(brushRow);
            return;
          }

          if (brushId === selectedBrushId && openMobileBrushStudio(brushId)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          selectBrush(activePackageIndex, brushId);
          showMobileBrushSelectionFeedback(brushId);
        });
        shareButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        duplicateButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          duplicateMobileBrush(brushId);
        });
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteMobileBrush(brushId);
        });

        return brushRow;
      });

    traceMobileBrushDebug("mobile-brush.render-brushes.build.end", {
      durationMs: getDebugDuration(buildStartMs),
      rendered: brushRows.length,
    });
    const replaceStartMs = getDebugNow();

    traceMobileBrushDebug("mobile-brush.render-brushes.replace-children.start", {
      brushCount: brushRows.length,
    });
    mobileBrushItems.replaceChildren(...brushRows);
    traceMobileBrushDebug("mobile-brush.render-brushes.replace-children.end", {
      childCount: mobileBrushItems.children.length,
      durationMs: getDebugDuration(replaceStartMs),
    });

    deferMobileBrushScrollIntoView(
      mobileBrushItems,
      ".mobile-brush-library-brush.active",
      "mobile-brush.render-brushes.scroll-active",
    );
    traceMobileBrushDebug("mobile-brush.render-brushes.end", {
      childCount: mobileBrushItems.children.length,
      durationMs: getDebugDuration(startMs),
      previewQueueLength: mobileBrushPreviewQueue.length,
      scrollDeferred: true,
    });
  }

  function hasMobileBrushButton(brushId) {
    return Array.from(mobileBrushItems?.querySelectorAll("[data-mobile-brush-id]") || [])
      .some((button) => button.dataset.mobileBrushId === brushId);
  }

  function syncMobileBrushSelectionState() {
    const startMs = getDebugNow();

    syncMobilePackageButtons();
    mobileBrushItems?.querySelectorAll("[data-mobile-brush-id]").forEach((button) => {
      const isActive = button.dataset.mobileBrushId === selectedBrushId;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    traceMobileBrushDebug("mobile-brush.sync-selection.end", {
      durationMs: getDebugDuration(startMs),
      selectedBrushId,
    });
  }

  function selectBrush(packageIndex, brushId, { closePopout = false } = {}) {
    const startMs = getDebugNow();
    const nextPackage = brushPackages[packageIndex];

    if (!nextPackage || !BrushLibrary.getBrush(brushId)) {
      traceMobileBrushDebug("mobile-brush.select.invalid", {
        brushId,
        packageIndex,
      });
      return;
    }

    const canSyncMobileSelection =
      isMobileBrushLibraryOpen() &&
      activePackageIndex === packageIndex &&
      hasMobileBrushButton(brushId);

    traceMobileBrushDebug("mobile-brush.select.start", {
      brushId,
      canSyncMobileSelection,
      closePopout,
      packageIndex,
      previousBrushId: selectedBrushId,
    });
    selectedPackageIndex = packageIndex;
    selectedBrushId = brushId;
    applyBrushPreset(brushId);
    renderSidebarPackages();

    if (brushPopout && !brushPopout.hidden && !closePopout) {
      renderPackageItems();
    }

    if (closePopout) {
      closeBrushPopout();
    }

    if (isMobileBrushLibraryOpen()) {
      if (canSyncMobileSelection) {
        syncMobileBrushSelectionState();
        traceMobileBrushDebug("mobile-brush.select.end", {
          brushId,
          durationMs: getDebugDuration(startMs),
          mode: "sync-selection",
        });
        return;
      }

      renderMobilePackages();
      renderMobileBrushes();
    }

    traceMobileBrushDebug("mobile-brush.select.end", {
      brushId,
      durationMs: getDebugDuration(startMs),
      mode: "render",
    });
  }

  function applyBrushPreset(brushId) {
    const settings = BrushLibrary.getSettings(brushId);

    if (!settings) {
      return;
    }

    window.CBO.activeBrushId = brushId;
    window.CBO.activeBrushName = getBrushName(brushId);
    window.CBO.brushSettings = BrushDefaults.createSettings(settings);

    window.dispatchEvent(
      new CustomEvent("cbo:brush-settings-change", {
        detail: {
          source: "brush-preset",
          persistBrushPreset: false,
          brushId,
          brushName: getBrushName(brushId),
          settings: { ...window.CBO.brushSettings },
        },
      }),
    );
  }

  function syncSelectedBrushSettings(event) {
    if (!selectedBrushId || event.detail?.persistBrushPreset !== true) {
      return;
    }

    BrushLibrary.updateBrushSettings(
      selectedBrushId,
      event.detail?.settings || window.CBO.brushSettings,
    );
    refreshBrushPreviews(selectedBrushId);
  }

  function renderSidebarPackages() {
    if (!sidebarBrushList) {
      return;
    }

    sidebarBrushList.replaceChildren(
      ...brushPackages.map((brushPackage, packageIndex) => {
        const packageButton = document.createElement("button");
        const packageNameLabel = document.createElement("span");
        const packageCountLabel = document.createElement("span");
        const brushCount = brushPackage.brushIds.length;
        const isActive = packageIndex === selectedPackageIndex;

        packageButton.className = "brushes-panel-card brushes-panel-package-card";
        packageButton.type = "button";
        packageButton.setAttribute("aria-label", `${brushPackage.name} brush pack`);
        packageButton.setAttribute("aria-pressed", String(isActive));
        packageButton.classList.toggle("active", isActive);
        packageNameLabel.className = "brushes-panel-package-name";
        packageNameLabel.textContent = brushPackage.name;
        packageCountLabel.className = "brushes-panel-package-count";
        packageCountLabel.textContent = `${brushCount} ${brushCount === 1 ? "BRUSH" : "BRUSHES"}`;
        packageButton.append(packageNameLabel, packageCountLabel);
        packageButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openPackageBrushes(packageIndex);
        });

        return packageButton;
      }),
    );

    sidebarBrushList.querySelector(".brushes-panel-card.active")?.scrollIntoView({
      block: "nearest",
    });
  }

  function renderPackageItems() {
    if (!packageItems) {
      return;
    }

    const activePackage = brushPackages[activePackageIndex];

    packageItems.replaceChildren(
      ...(activePackage?.brushIds || []).map((brushId) => {
        const brushCard = document.createElement("div");
        const brushSelectButton = document.createElement("button");
        const brushNameLabel = document.createElement("span");
        const previewCanvas = document.createElement("canvas");
        const copyButton = document.createElement("button");
        const deleteButton = document.createElement("button");
        const isActive = brushId === selectedBrushId;
        const isDeletable = canDeleteBrush(brushId);

        brushCard.className = "brushes-gallery-brush";
        brushCard.classList.toggle("active", isActive);
        brushSelectButton.className = "brushes-gallery-brush-select";
        brushSelectButton.type = "button";
        brushSelectButton.setAttribute("aria-label", `${getBrushName(brushId)} brush`);
        brushSelectButton.setAttribute("aria-pressed", String(isActive));
        brushNameLabel.className = "brushes-gallery-item-name";
        brushNameLabel.textContent = getBrushName(brushId);
        previewCanvas.className = "brush-preview-canvas";
        previewCanvas.dataset.brushPreviewId = brushId;
        previewCanvas.dataset.brushPreviewVariant = "gallery";
        copyButton.className = "brushes-gallery-copy-button";
        copyButton.type = "button";
        copyButton.setAttribute("aria-label", `Duplicate ${getBrushName(brushId)} brush`);
        copyButton.innerHTML = copyIcon;
        deleteButton.className = "brushes-gallery-delete-button";
        deleteButton.type = "button";
        deleteButton.disabled = !isDeletable;
        deleteButton.setAttribute("aria-label", `Delete ${getBrushName(brushId)} brush`);
        deleteButton.innerHTML = deleteIcon;
        brushSelectButton.append(brushNameLabel, previewCanvas);
        brushCard.append(brushSelectButton, copyButton, deleteButton);

        if (brushPopout && !brushPopout.hidden) {
          queueBrushPreview(previewCanvas, brushId, "gallery");
        }

        brushSelectButton.addEventListener("click", () => {
          selectBrush(activePackageIndex, brushId, { closePopout: true });
        });
        copyButton.addEventListener("click", (event) => {
          event.stopPropagation();

          const duplicatedBrush = BrushLibrary.duplicateBrush(brushId);

          if (!duplicatedBrush) {
            return;
          }

          selectBrush(activePackageIndex, duplicatedBrush.id);
        });
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();

          if (!isDeletable) {
            return;
          }

          openDeleteDialog(brushId);
        });

        return brushCard;
      }),
    );
  }

  function renderPackages() {
    if (!packageList) {
      return;
    }

    packageList.replaceChildren(
      ...brushPackages.map((brushPackage, packageIndex) => {
        const packageButton = document.createElement("button");

        packageButton.className = "brushes-gallery-package";
        packageButton.type = "button";
        packageButton.textContent = brushPackage.name;
        packageButton.setAttribute("aria-pressed", String(packageIndex === activePackageIndex));
        packageButton.classList.toggle("active", packageIndex === activePackageIndex);
        packageButton.addEventListener("click", () => {
          setActivePackage(packageIndex);
        });

        return packageButton;
      }),
    );
  }

  function setActivePackage(packageIndex) {
    activePackageIndex = packageIndex;

    packageList?.querySelectorAll(".brushes-gallery-package").forEach((button, index) => {
      const isActive = index === activePackageIndex;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    renderPackageItems();

    if (isMobileBrushLibraryOpen()) {
      syncMobilePackageButtons();
      renderMobileBrushes();
    }
  }

  function openPackageBrushes(packageIndex) {
    if (!brushPopout) {
      return;
    }

    const nextPackageIndex = Number.isInteger(packageIndex) ? packageIndex : selectedPackageIndex;

    brushPopout.hidden = false;
    renderPackages();
    setActivePackage(nextPackageIndex);
    brushPopoutButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "true");
    });
  }

  function createBrushFromGallery() {
    const activePackage = brushPackages[activePackageIndex] || brushPackages[0];
    const createdBrush = BrushLibrary.createBrush(activePackage?.id);

    if (!createdBrush) {
      return;
    }

    selectBrush(activePackageIndex, createdBrush.id);
  }

  function openDeleteDialog(brushId) {
    if (!deleteDialog || !deleteBrushName) {
      return;
    }

    pendingDeleteBrushId = brushId;
    deleteBrushName.textContent = getBrushName(brushId);
    deleteDialog.hidden = false;
    deleteConfirmButton?.focus();
  }

  function closeDeleteDialog() {
    if (!deleteDialog) {
      return;
    }

    deleteDialog.hidden = true;
    pendingDeleteBrushId = "";
  }

  function confirmDeleteBrush() {
    if (!pendingDeleteBrushId) {
      return;
    }

    const brushId = pendingDeleteBrushId;
    const deleteResult = BrushLibrary.deleteBrush(brushId);

    closeDeleteDialog();
    BrushPreview?.invalidate?.(brushId);

    if (!deleteResult?.deleted) {
      renderPackageItems();
      return;
    }

    const nextPackageIndex = getPackageIndexById(deleteResult.packageId);

    if (selectedBrushId === brushId && nextPackageIndex >= 0 && deleteResult.nextBrushId) {
      selectBrush(nextPackageIndex, deleteResult.nextBrushId);
      return;
    }

    renderSidebarPackages();
    renderPackageItems();
  }

  function closeBrushPopout() {
    if (!brushPopout) {
      return;
    }

    closeDeleteDialog();
    brushPopout.hidden = true;
    packageItems?.replaceChildren();
    brushPopoutButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function openBrushPopout(packageIndex = selectedPackageIndex) {
    openPackageBrushes(packageIndex);
  }

  function closeMobileBrushLibrary() {
    if (!mobileBrushLibrary) {
      return;
    }

    traceMobileBrushDebug("mobile-brush.close-library.start", {
      hiddenBeforeClose: mobileBrushLibrary.hidden,
    });
    window.clearTimeout(mobileBrushFeedbackTimer);
    resetMobileBrushPreviewQueue();
    finishMobileBrushSwipe();
    closeMobileBrushActions();
    mobileBrushLibrary.classList.remove("has-selection-feedback");
    mobileBrushLibrary.hidden = true;
    document.body?.classList.remove("cbo-mobile-brush-library-open");
    traceMobileBrushDebug("mobile-brush.close-library.end", {
      hiddenAfterClose: mobileBrushLibrary.hidden,
    });
  }

  function openMobileBrushLibrary(options = {}) {
    if (!mobileBrushLibrary || !isMobileBrushLibraryViewport()) {
      traceMobileBrushDebug("mobile-brush.open-library.skipped", {
        hasLibrary: Boolean(mobileBrushLibrary),
        isViewportReady: isMobileBrushLibraryViewport(),
      });
      return;
    }

    const startMs = getDebugNow();
    const activePackage = brushPackages[selectedPackageIndex] || brushPackages[0];
    const debugSessionId = options.debugSessionId || getMobileBrushDebug()?.startSession?.("mobile-brush-library-open", {
      source: options.source || "direct",
      trigger: options.trigger || "api",
    });

    traceMobileBrushDebug("mobile-brush.open-library.start", {
      activePackageIndex,
      debugSessionId,
      hiddenBeforeOpen: mobileBrushLibrary.hidden,
      isViewportReady: isMobileBrushLibraryViewport(),
      packageCount: brushPackages.length,
      selectedBrushId,
      selectedPackageId: activePackage?.id || "",
      selectedPackageIndex,
      selectedPackageBrushCount: activePackage?.brushIds?.length || 0,
    });
    closeBrushPopout();
    activePackageIndex = selectedPackageIndex;
    mobileBrushLibrary.hidden = false;
    document.body?.classList.add("cbo-mobile-brush-library-open");
    renderMobilePackages();
    renderMobileBrushes();
    traceMobileBrushDebug("mobile-brush.open-library.end", {
      bodyClassApplied: document.body?.classList.contains("cbo-mobile-brush-library-open") === true,
      brushRowCount: mobileBrushItems?.children.length || 0,
      debugSessionId,
      durationMs: getDebugDuration(startMs),
      durationToDomMs: getDebugDuration(startMs),
      packageRowCount: mobileBrushPackages?.children.length || 0,
    });
    requestMobileBrushFrame(() => {
      traceMobileBrushDebug("mobile-brush.open-library.after-raf", {
        debugSessionId,
        elapsedMs: getDebugDuration(startMs),
      });
      requestMobileBrushFrame(() => {
        traceMobileBrushDebug("mobile-brush.open-library.after-second-raf", {
          debugSessionId,
          elapsedMs: getDebugDuration(startMs),
        });
        getMobileBrushDebug()?.endSession?.("mobile-brush-library-open", debugSessionId, {
          elapsedMs: getDebugDuration(startMs),
        });
      });
    });
  }

  window.CBO.openMobileBrushLibrary = openMobileBrushLibrary;
  window.CBO.closeMobileBrushLibrary = closeMobileBrushLibrary;

  async function initializeBrushPanelState() {
    await restoreBrushLibraryFromStorage();
    renderPackages();
    renderSidebarPackages();
    applyBrushPreset(selectedBrushId);
  }

  brushPopoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openBrushPopout(selectedPackageIndex);
    });
  });

  exportBrushesButton?.addEventListener("click", downloadBrushPresetExport);
  createBrushButton?.addEventListener("click", createBrushFromGallery);
  closeButton?.addEventListener("click", closeBrushPopout);
  mobileBrushCreateButton?.addEventListener("click", createMobileBaseBrush);
  mobileBrushDoneButton?.addEventListener("click", closeMobileBrushLibrary);
  window.addEventListener("pointermove", handleMobileBrushSwipePointerMove, { passive: false });
  window.addEventListener("pointerup", (event) => finishMobileBrushSwipe(event.pointerId));
  window.addEventListener("pointercancel", (event) => finishMobileBrushSwipe(event.pointerId));
  deleteCancelButton?.addEventListener("click", closeDeleteDialog);
  deleteConfirmButton?.addEventListener("click", confirmDeleteBrush);
  deleteDialog?.addEventListener("click", (event) => {
    if (event.target === deleteDialog) {
      closeDeleteDialog();
    }
  });
  window.addEventListener("cbo:brush-settings-change", syncSelectedBrushSettings);
  window.addEventListener("cbo:brush-library-change", scheduleBrushLibraryPersistence);

  document.addEventListener("click", (event) => {
    if (!brushPopout || brushPopout.hidden) {
      return;
    }

    const target = event.target;
    const clickedInsidePopout = target instanceof Element && brushPopout.contains(target);
    const clickedOpenButton =
      target instanceof Element && Array.from(brushPopoutButtons).some((button) => button.contains(target));

    if (!clickedInsidePopout && !clickedOpenButton) {
      closeBrushPopout();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && deleteDialog && !deleteDialog.hidden) {
      event.stopPropagation();
      closeDeleteDialog();
    }

    if (event.key === "Escape" && isMobileBrushLibraryOpen()) {
      event.stopPropagation();
      closeMobileBrushLibrary();
    }
  });

  window.addEventListener("resize", () => {
    if (isMobileBrushLibraryOpen() && !isMobileBrushLibraryViewport()) {
      closeMobileBrushLibrary();
    }
  });

  window.addEventListener("cbo:brush-tool-reactivate", (event) => {
    traceMobileBrushDebug("mobile-brush.reactivate-event", {
      debugSessionId: event.detail?.debugSessionId,
      label: event.detail?.label || "",
      source: event.detail?.source || "",
      toolMode: event.detail?.toolMode || "",
    });
    openMobileBrushLibrary({
      debugSessionId: event.detail?.debugSessionId,
      source: event.detail?.source || "event",
      trigger: "active-brush-click",
    });
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const label = String(event.detail?.label || "").toUpperCase();
    const toolMode = String(event.detail?.toolMode || "").toLowerCase();
    const syncGroup = String(event.detail?.syncGroup || "").toLowerCase();
    const isBrushTool =
      syncGroup === "brush" ||
      label === "BRUSH" ||
      label === "ERASER" ||
      toolMode === "eraser";

    if (brushGallery) {
      brushGallery.hidden = !isBrushTool;
    }

    if (!isBrushTool) {
      closeBrushPopout();
      closeMobileBrushLibrary();
    }
  });

  void initializeBrushPanelState();
};
