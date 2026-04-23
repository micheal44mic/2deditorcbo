window.CBO = window.CBO || {};

window.CBO.initLayersPanel = function initLayersPanel() {
  const panel = document.querySelector(".drawer-layers-panel");
  const addLayerButton = document.querySelector(".drawer-add-layer-button");

  if (!panel || panel.dataset.layersReady === "true") {
    return;
  }

  panel.dataset.layersReady = "true";

  let layerCount = 1;
  let rangeAnchor = null;
  let focusedLayer = null;

  function getLayerRows() {
    return Array.from(panel.querySelectorAll("[data-layer-row]"));
  }

  function isLayerLocked(row) {
    return row.classList.contains("locked");
  }

  function getFirstSelectedLayer() {
    return getLayerRows().find((layerRow) => layerRow.classList.contains("selected")) || null;
  }

  function setLayerSelected(row, isSelected) {
    const shouldSelect = isSelected && !isLayerLocked(row);

    row.classList.remove("active");
    row.classList.toggle("selected", shouldSelect);
    row.setAttribute("aria-selected", String(shouldSelect));
  }

  function setFocusedLayer(row) {
    const unlockedRow = row && !isLayerLocked(row) ? row : null;

    getLayerRows().forEach((layerRow) => {
      layerRow.classList.toggle("selection-focus", layerRow === unlockedRow);
    });
    focusedLayer = unlockedRow;
  }

  function clearLayerSelection() {
    getLayerRows().forEach((row) => setLayerSelected(row, false));
    rangeAnchor = null;
    setFocusedLayer(null);
  }

  function createLayerRow(layerName) {
    const row = document.createElement("div");

    row.className = "layer-row";
    row.role = "option";
    row.tabIndex = 0;
    row.dataset.layerRow = "";
    row.innerHTML = `
      <div class="layer-info">
        <span class="layer-file-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
            <path d="M14 2v5a1 1 0 0 0 1 1h5" />
          </svg>
        </span>
        <span class="layer-name">${layerName}</span>
      </div>
      <div class="layer-actions">
        <button class="layer-action layer-lock-button" type="button" aria-label="Lock layer" aria-pressed="false" data-layer-lock>
          <svg class="layer-icon-unlocked" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          <svg class="layer-icon-locked" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="16" r="1" />
            <rect x="3" y="10" width="18" height="12" rx="2" />
            <path d="M7 10V7a5 5 0 0 1 10 0v3" />
          </svg>
        </button>
        <button class="layer-action layer-visibility-button" type="button" aria-label="Hide layer" aria-pressed="true" data-layer-visibility>
          <svg class="layer-icon-visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg class="layer-icon-hidden" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-.722-3.25" />
            <path d="M2 8a10.645 10.645 0 0 0 20 0" />
            <path d="m20 15-1.726-2.05" />
            <path d="m4 15 1.726-2.05" />
            <path d="m9 18 .722-3.25" />
          </svg>
        </button>
      </div>
    `;

    return row;
  }

  function selectOnlyLayer(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    getLayerRows().forEach((layerRow) => {
      setLayerSelected(layerRow, layerRow === row);
    });
    rangeAnchor = row;
    setFocusedLayer(row);
  }

  function toggleLayerSelection(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    const shouldSelect = !row.classList.contains("selected");

    setLayerSelected(row, shouldSelect);
    rangeAnchor = row;
    setFocusedLayer(shouldSelect ? row : getFirstSelectedLayer());
  }

  function selectLayerRange(row, shouldAddToSelection) {
    const rows = getLayerRows();
    const anchor =
      rangeAnchor && rows.includes(rangeAnchor) && !isLayerLocked(rangeAnchor)
        ? rangeAnchor
        : row;
    const anchorIndex = rows.indexOf(anchor);
    const rowIndex = rows.indexOf(row);
    const startIndex = Math.min(anchorIndex, rowIndex);
    const endIndex = Math.max(anchorIndex, rowIndex);

    if (!shouldAddToSelection) {
      rows.forEach((layerRow) => setLayerSelected(layerRow, false));
    }

    rows.forEach((layerRow, index) => {
      if (index >= startIndex && index <= endIndex && !isLayerLocked(layerRow)) {
        setLayerSelected(layerRow, true);
      }
    });

    rangeAnchor = isLayerLocked(row) ? getFirstSelectedLayer() : anchor;
    setFocusedLayer(isLayerLocked(row) ? getFirstSelectedLayer() : row);
  }

  function selectLayerFromPointer(row, event) {
    if (event.shiftKey) {
      selectLayerRange(row, event.ctrlKey || event.metaKey);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleLayerSelection(row);
      return;
    }

    selectOnlyLayer(row);
  }

  function addLayer() {
    const list = panel.querySelector(".layers-list");
    const selectedRows = Array.from(list.querySelectorAll("[data-layer-row].selected"));
    const activeRow = selectedRows.includes(focusedLayer) ? focusedLayer : selectedRows[0];
    const row = createLayerRow(`Layer ${layerCount + 1}`);

    layerCount += 1;

    if (activeRow) {
      list.insertBefore(row, activeRow);
    } else {
      list.prepend(row);
    }

    selectOnlyLayer(row);
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  panel.innerHTML = `
    <div class="layers-list" role="listbox" aria-label="Layers" aria-multiselectable="true"></div>
  `;

  const firstLayer = createLayerRow("Layer");
  panel.querySelector(".layers-list").append(firstLayer);
  selectOnlyLayer(firstLayer);

  addLayerButton?.addEventListener("click", addLayer);

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (
      panel.contains(target) ||
      target.closest(".drawer-add-layer-button")
    ) {
      return;
    }

    clearLayerSelection();
  });

  panel.addEventListener("click", (event) => {
    const row = event.target.closest("[data-layer-row]");
    const lockButton = event.target.closest("[data-layer-lock]");
    const visibilityButton = event.target.closest("[data-layer-visibility]");

    if (!row) {
      clearLayerSelection();
      return;
    }

    if (lockButton) {
      const isLocked = row.classList.toggle("locked");

      if (isLocked) {
        setLayerSelected(row, false);
        setFocusedLayer(getFirstSelectedLayer());
        rangeAnchor = focusedLayer;
      }

      lockButton.setAttribute("aria-pressed", String(isLocked));
      lockButton.setAttribute("aria-label", isLocked ? "Unlock layer" : "Lock layer");
      return;
    }

    if (visibilityButton) {
      const isHidden = row.classList.toggle("hidden-layer");
      visibilityButton.setAttribute("aria-pressed", String(!isHidden));
      visibilityButton.setAttribute("aria-label", isHidden ? "Show layer" : "Hide layer");
      return;
    }

    selectLayerFromPointer(row, event);
  });
};
