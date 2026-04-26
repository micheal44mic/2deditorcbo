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
    `,
  );

  const brushGallery = panel.querySelector("[data-brush-gallery]");
  const brushPopout = editorPage.querySelector("[data-brush-popout]");
  const brushPopoutButtons = panel.querySelectorAll(
    ".brushes-panel-gallery-button, .brushes-panel-see-more",
  );
  const sidebarBrushList = panel.querySelector("[data-sidebar-brush-list]");
  const packageList = brushPopout?.querySelector("[data-brush-packages]");
  const packageItems = brushPopout?.querySelector("[data-brush-package-items]");
  const createBrushButton = brushPopout?.querySelector("[data-brush-create]");
  const closeButton = brushPopout?.querySelector("[data-brush-popout-close]");
  const deleteDialog = brushPopout?.querySelector("[data-brush-delete-dialog]");
  const deleteBrushName = brushPopout?.querySelector("[data-brush-delete-name]");
  const deleteCancelButton = brushPopout?.querySelector("[data-brush-delete-cancel]");
  const deleteConfirmButton = brushPopout?.querySelector("[data-brush-delete-confirm]");
  let pendingDeleteBrushId = "";

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

  function renderBrushPreview(canvas, brushId, variant) {
    if (!BrushPreview?.render || !canvas) {
      return;
    }

    const settings = BrushLibrary.getSettings(brushId);

    if (!settings) {
      return;
    }

    BrushPreview.render(canvas, brushId, settings, { variant });
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

    if (!brushPopout || brushPopout.hidden) {
      return;
    }

    document.querySelectorAll("[data-brush-preview-id]").forEach((canvas) => {
      if (canvas.dataset.brushPreviewId !== brushId) {
        return;
      }

      if (canvas.dataset.brushPreviewVariant !== "gallery") {
        return;
      }

      renderBrushPreview(canvas, brushId, canvas.dataset.brushPreviewVariant || "gallery");
    });
  }

  function selectBrush(packageIndex, brushId, { closePopout = false } = {}) {
    const nextPackage = brushPackages[packageIndex];

    if (!nextPackage || !BrushLibrary.getBrush(brushId)) {
      return;
    }

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
  }

  function applyBrushPreset(brushId) {
    const settings = BrushLibrary.getSettings(brushId);

    if (!settings) {
      return;
    }

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

  renderPackages();
  renderSidebarPackages();
  applyBrushPreset(selectedBrushId);

  brushPopoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openBrushPopout(selectedPackageIndex);
    });
  });

  createBrushButton?.addEventListener("click", createBrushFromGallery);
  closeButton?.addEventListener("click", closeBrushPopout);
  deleteCancelButton?.addEventListener("click", closeDeleteDialog);
  deleteConfirmButton?.addEventListener("click", confirmDeleteBrush);
  deleteDialog?.addEventListener("click", (event) => {
    if (event.target === deleteDialog) {
      closeDeleteDialog();
    }
  });
  window.addEventListener("cbo:brush-settings-change", syncSelectedBrushSettings);

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
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const isBrushTool =
      event.detail?.syncGroup === "brush" || event.detail?.label?.toUpperCase() === "BRUSH";

    if (brushGallery) {
      brushGallery.hidden = !isBrushTool;
    }

    if (!isBrushTool) {
      closeBrushPopout();
    }
  });
};
