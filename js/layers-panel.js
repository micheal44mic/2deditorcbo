window.CBO = window.CBO || {};

window.CBO.initLayersPanel = function initLayersPanel() {
  const panel = document.querySelector(".drawer-layers-panel");
  const copyLayerButton = document.querySelector(".drawer-copy-layer-button");
  const addGroupButton = document.querySelector(".drawer-new-folder-button");

  if (!panel || panel.dataset.layersReady === "true") {
    return;
  }

  panel.dataset.layersReady = "true";

  let groupCount = 0;
  let rangeAnchor = null;
  let focusedLayer = null;
  let dragState = null;
  let suppressNextClick = false;

  function getLayerRows() {
    return Array.from(panel.querySelectorAll("[data-layer-row]"));
  }

  function getVisibleLayerRows() {
    return getLayerRows().filter((row) => !isInsideCollapsedGroup(row));
  }

  function getLayerEntry(row) {
    return row.closest("[data-layer-entry]");
  }

  function getLayerChildren(entry) {
    return entry.querySelector(":scope > [data-layer-children]");
  }

  function getDescendantRows(row) {
    const children = getLayerChildren(getLayerEntry(row));

    return children ? Array.from(children.querySelectorAll("[data-layer-row]")) : [];
  }

  function isLayerLocked(row) {
    return row.classList.contains("locked");
  }

  function isGroupRow(row) {
    return row.dataset.layerType === "group";
  }

  function isInsideCollapsedGroup(row) {
    let entry = getLayerEntry(row);

    while (entry) {
      const parentChildren = entry.parentElement;
      const parentEntry = parentChildren?.closest("[data-layer-entry]");

      if (parentEntry?.classList.contains("collapsed")) {
        return true;
      }

      entry = parentEntry;
    }

    return false;
  }

  function getFirstSelectedLayer() {
    return getLayerRows().find((layerRow) => layerRow.classList.contains("selected")) || null;
  }

  function isEntrySelected(entry) {
    return entry.querySelector(":scope > [data-layer-row]")?.classList.contains("selected");
  }

  function setLayerSelected(row, isSelected) {
    const shouldSelect = isSelected && !isLayerLocked(row);

    row.classList.remove("active");
    row.classList.toggle("selected", shouldSelect);
    row.setAttribute("aria-selected", String(shouldSelect));
  }

  function setLayerBranchSelected(row, isSelected) {
    setLayerSelected(row, isSelected);

    if (!isGroupRow(row)) {
      return;
    }

    getDescendantRows(row).forEach((childRow) => setLayerSelected(childRow, isSelected));
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

  function finishLayerRename(name, shouldCommit) {
    const row = name.closest("[data-layer-row]");
    const originalName = name.dataset.renameOriginal || "";
    const nextName = name.textContent.trim();
    const fallbackName = row && isGroupRow(row) ? "Group" : "Layer";

    name.textContent = shouldCommit && nextName ? nextName : originalName || fallbackName;
    name.classList.remove("renaming");
    name.removeAttribute("contenteditable");
    name.removeAttribute("spellcheck");
    delete name.dataset.renameOriginal;
    row?.classList.remove("renaming");
  }

  function beginLayerRename(row) {
    const name = row.querySelector(":scope .layer-name");

    if (!name || isLayerLocked(row)) {
      return;
    }

    panel.querySelectorAll(".layer-name.renaming").forEach((renamingName) => {
      finishLayerRename(renamingName, true);
    });

    selectOnlyLayer(row);
    name.dataset.renameOriginal = name.textContent;
    name.contentEditable = "true";
    name.spellcheck = false;
    name.classList.add("renaming");
    row.classList.add("renaming");
    name.focus();

    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(name);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function clearDropHints() {
    getLayerRows().forEach((row) => {
      row.classList.remove("drop-before", "drop-after", "drop-inside");
    });
  }

  function updateLayerDepths(container = panel.querySelector(".layers-list"), depth = 0) {
    Array.from(container.children).forEach((entry) => {
      if (!entry.matches("[data-layer-entry]")) {
        return;
      }

      entry.style.setProperty("--layer-indent", `${depth * 4}px`);

      const children = getLayerChildren(entry);

      if (children) {
        updateLayerDepths(children, depth + 1);
      }
    });
  }

  function updateGroupToggle(row) {
    const entry = getLayerEntry(row);
    const toggle = row.querySelector("[data-group-toggle]");
    const isCollapsed = entry.classList.contains("collapsed");

    if (!toggle) {
      return;
    }

    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.setAttribute("aria-label", isCollapsed ? "Expand group" : "Collapse group");
  }

  function toggleGroup(row) {
    const entry = getLayerEntry(row);

    if (!entry || !isGroupRow(row)) {
      return;
    }

    entry.classList.toggle("collapsed");
    updateGroupToggle(row);
  }

  function getInsertTarget(list) {
    const selectedRows = Array.from(list.querySelectorAll("[data-layer-row].selected"));

    return selectedRows.includes(focusedLayer) ? focusedLayer : selectedRows[0];
  }

  function insertLayerEntry(entry) {
    const rootList = panel.querySelector(".layers-list");
    const activeRow = getInsertTarget(rootList);
    const activeEntry = activeRow ? getLayerEntry(activeRow) : null;

    if (activeEntry) {
      activeEntry.parentElement.insertBefore(entry, activeEntry);
    } else {
      rootList.prepend(entry);
    }

    updateLayerDepths();
    selectOnlyLayer(entry.querySelector("[data-layer-row]"));
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function insertLayerEntryAfter(entry, targetEntry) {
    targetEntry.parentElement.insertBefore(entry, targetEntry.nextElementSibling);
    updateLayerDepths();
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function getLayerIcon(type) {
    if (type === "group") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1" />
          <path d="M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1" />
          <path d="M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z" />
        </svg>
      `;
    }

    if (type === "text") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v16" />
          <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
          <path d="M9 20h6" />
        </svg>
      `;
    }

    if (type === "vector") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
          <path d="M5 17A12 12 0 0 1 17 5" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
        </svg>
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      </svg>
    `;
  }

  function getDisclosureControl(type) {
    if (type === "group") {
      return `
        <button class="layer-disclosure-button" type="button" aria-label="Collapse group" aria-expanded="true" data-group-toggle>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      `;
    }

    return `<span class="layer-disclosure-spacer" aria-hidden="true"></span>`;
  }

  function createLayerActions() {
    return `
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
  }

  function createLayerEntry(layerName, type = "layer") {
    const entry = document.createElement("div");
    const row = document.createElement("div");

    // TODO: when canvas objects are wired to the layers panel, pass "text" or "vector"
    // here so text layers and vector layers use their dedicated icons.
    entry.className = `layer-entry ${type === "group" ? "layer-group-entry" : ""}`;
    entry.dataset.layerEntry = "";
    entry.dataset.layerType = type;
    row.className = `layer-row ${type === "group" ? "layer-group-row" : ""}`;
    row.role = "option";
    row.tabIndex = 0;
    row.dataset.layerRow = "";
    row.dataset.layerType = type;
    row.innerHTML = `
      <div class="layer-info">
        ${getDisclosureControl(type)}
        <span class="layer-file-icon" aria-hidden="true">
          ${getLayerIcon(type)}
        </span>
        <span class="layer-name">${layerName}</span>
      </div>
      ${createLayerActions()}
    `;

    entry.append(row);

    if (type === "group") {
      const children = document.createElement("div");
      children.className = "layer-children";
      children.dataset.layerChildren = "";
      entry.append(children);
    }

    return entry;
  }

  function syncCopiedRowState(sourceRow, copiedRow) {
    const sourceLock = sourceRow.querySelector("[data-layer-lock]");
    const copiedLock = copiedRow.querySelector("[data-layer-lock]");
    const sourceVisibility = sourceRow.querySelector("[data-layer-visibility]");
    const copiedVisibility = copiedRow.querySelector("[data-layer-visibility]");

    copiedRow.classList.toggle("locked", sourceRow.classList.contains("locked"));
    copiedRow.classList.toggle("hidden-layer", sourceRow.classList.contains("hidden-layer"));
    copiedLock?.setAttribute("aria-pressed", sourceLock?.getAttribute("aria-pressed") || "false");
    copiedLock?.setAttribute(
      "aria-label",
      sourceRow.classList.contains("locked") ? "Unlock layer" : "Lock layer",
    );
    copiedVisibility?.setAttribute(
      "aria-pressed",
      sourceVisibility?.getAttribute("aria-pressed") || "true",
    );
    copiedVisibility?.setAttribute(
      "aria-label",
      sourceRow.classList.contains("hidden-layer") ? "Show layer" : "Hide layer",
    );
  }

  function cloneLayerEntryForUi(sourceEntry) {
    const sourceRow = sourceEntry.querySelector(":scope > [data-layer-row]");
    const layerName = sourceRow.querySelector(".layer-name").textContent;
    const type = sourceRow.dataset.layerType || "layer";
    const copiedEntry = createLayerEntry(`${layerName} Copy`, type);
    const copiedRow = copiedEntry.querySelector(":scope > [data-layer-row]");

    syncCopiedRowState(sourceRow, copiedRow);

    if (type === "group") {
      copiedEntry.classList.toggle("collapsed", sourceEntry.classList.contains("collapsed"));
      updateGroupToggle(copiedRow);

      const sourceChildren = getLayerChildren(sourceEntry);
      const copiedChildren = getLayerChildren(copiedEntry);

      Array.from(sourceChildren.children).forEach((childEntry) => {
        if (childEntry.matches("[data-layer-entry]")) {
          copiedChildren.append(cloneLayerEntryForUi(childEntry));
        }
      });
    }

    return copiedEntry;
  }

  function getSelectedRootEntries() {
    return Array.from(panel.querySelector(".layers-list").querySelectorAll("[data-layer-entry]"))
      .filter(isEntrySelected)
      .filter((entry) => {
        const selectedParent = entry.parentElement.closest("[data-layer-entry]");

        return !selectedParent || !isEntrySelected(selectedParent);
      });
  }

  function selectOnlyLayer(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    getLayerRows().forEach((layerRow) => setLayerSelected(layerRow, false));
    setLayerBranchSelected(row, true);
    rangeAnchor = row;
    setFocusedLayer(row);
  }

  function toggleLayerSelection(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    const shouldSelect = !row.classList.contains("selected");

    setLayerBranchSelected(row, shouldSelect);
    rangeAnchor = row;
    setFocusedLayer(shouldSelect ? row : getFirstSelectedLayer());
  }

  function selectLayerRange(row, shouldAddToSelection) {
    const rows = getVisibleLayerRows();
    const anchor =
      rangeAnchor && rows.includes(rangeAnchor) && !isLayerLocked(rangeAnchor)
        ? rangeAnchor
        : row;
    const anchorIndex = rows.indexOf(anchor);
    const rowIndex = rows.indexOf(row);
    const startIndex = Math.min(anchorIndex, rowIndex);
    const endIndex = Math.max(anchorIndex, rowIndex);

    if (!shouldAddToSelection) {
      getLayerRows().forEach((layerRow) => setLayerSelected(layerRow, false));
    }

    rows.forEach((layerRow, index) => {
      if (index >= startIndex && index <= endIndex && !isLayerLocked(layerRow)) {
        setLayerBranchSelected(layerRow, true);
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

  function addGroup() {
    groupCount += 1;

    // TODO: add dedicated group actions when groups get richer editing controls.
    const groupEntry = createLayerEntry(groupCount === 1 ? "Group" : `Group ${groupCount}`, "group");
    const selectedEntries = getSelectedRootEntries();

    if (!selectedEntries.length) {
      insertLayerEntry(groupEntry);
      return;
    }

    const firstSelectedEntry = selectedEntries[0];
    const groupChildren = getLayerChildren(groupEntry);
    const groupRow = groupEntry.querySelector(":scope > [data-layer-row]");

    firstSelectedEntry.parentElement.insertBefore(groupEntry, firstSelectedEntry);
    selectedEntries.forEach((entry) => groupChildren.append(entry));
    updateLayerDepths();
    clearLayerSelection();
    setLayerBranchSelected(groupRow, true);
    rangeAnchor = groupRow;
    setFocusedLayer(groupRow);
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function copySelectedLayers() {
    const selectedEntries = getSelectedRootEntries();
    let insertAfterEntry = selectedEntries[selectedEntries.length - 1];
    const copiedRows = [];

    if (!insertAfterEntry) {
      return;
    }

    selectedEntries.forEach((entry) => {
      const copiedEntry = cloneLayerEntryForUi(entry);

      insertLayerEntryAfter(copiedEntry, insertAfterEntry);
      insertAfterEntry = copiedEntry;
      copiedRows.push(copiedEntry.querySelector(":scope > [data-layer-row]"));
    });

    clearLayerSelection();
    copiedRows.forEach((row) => setLayerBranchSelected(row, true));
    rangeAnchor = copiedRows[0] || null;
    setFocusedLayer(copiedRows[0] || null);
  }

  function deleteSelectedLayers() {
    const selectedEntries = getSelectedRootEntries();

    if (!selectedEntries.length) {
      return;
    }

    selectedEntries.forEach((entry) => entry.remove());
    clearLayerSelection();
    updateLayerDepths();
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function isEditableTarget(target) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.matches("input, textarea, select") ||
        Boolean(target.closest("[contenteditable='true']")))
    );
  }

  function isDeleteShortcut(event) {
    return (
      event.key === "Delete" ||
      event.key === "Backspace" ||
      event.code === "Delete" ||
      event.code === "Backspace" ||
      event.keyCode === 46 ||
      event.keyCode === 8
    );
  }

  function getDropIntent(targetRow, pointerY) {
    const targetEntry = getLayerEntry(targetRow);
    const targetRect = targetRow.getBoundingClientRect();
    const relativeY = pointerY - targetRect.top;
    const canDropInside = isGroupRow(targetRow) && !isLayerLocked(targetRow);
    const isInsideZone =
      canDropInside && relativeY > targetRect.height * 0.25 && relativeY < targetRect.height * 0.75;

    if (isInsideZone) {
      return {
        type: "inside",
        targetEntry,
        targetRow,
      };
    }

    return {
      type: relativeY < targetRect.height / 2 ? "before" : "after",
      targetEntry,
      targetRow,
    };
  }

  function isValidDropIntent(intent) {
    const sourceEntries = dragState?.sourceEntries || [];

    if (!sourceEntries.length || !intent || !intent.targetEntry) {
      return false;
    }

    return sourceEntries.every(
      (sourceEntry) => sourceEntry !== intent.targetEntry && !sourceEntry.contains(intent.targetEntry),
    );
  }

  function showDropHint(intent) {
    clearDropHints();

    if (!isValidDropIntent(intent)) {
      return;
    }

    intent.targetRow.classList.add(
      intent.type === "inside" ? "drop-inside" : `drop-${intent.type}`,
    );
    dragState.dropIntent = intent;
  }

  function findDropIntent(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const targetRow = element?.closest("[data-layer-row]");

    if (!targetRow || !panel.contains(targetRow)) {
      return null;
    }

    return getDropIntent(targetRow, event.clientY);
  }

  function applyDropIntent() {
    const { dropIntent, sourceEntries } = dragState;

    if (!isValidDropIntent(dropIntent)) {
      return;
    }

    if (dropIntent.type === "inside") {
      const children = getLayerChildren(dropIntent.targetEntry);

      dropIntent.targetEntry.classList.remove("collapsed");
      updateGroupToggle(dropIntent.targetRow);
      sourceEntries.forEach((sourceEntry) => children.append(sourceEntry));
    } else if (dropIntent.type === "before") {
      sourceEntries.forEach((sourceEntry) => {
        dropIntent.targetEntry.parentElement.insertBefore(sourceEntry, dropIntent.targetEntry);
      });
    } else {
      let insertAfterEntry = dropIntent.targetEntry;

      sourceEntries.forEach((sourceEntry) => {
        insertAfterEntry.parentElement.insertBefore(sourceEntry, insertAfterEntry.nextElementSibling);
        insertAfterEntry = sourceEntry;
      });
    }

    updateLayerDepths();
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function startLayerDrag(row, event) {
    if (isLayerLocked(row)) {
      return;
    }

    const sourceEntry = getLayerEntry(row);
    const selectedEntries = getSelectedRootEntries();
    const shouldDragSelection =
      row.classList.contains("selected") &&
      selectedEntries.some((entry) => entry === sourceEntry || entry.contains(sourceEntry));
    const sourceEntries = shouldDragSelection ? selectedEntries : [sourceEntry];

    dragState = {
      dropIntent: null,
      isDragging: false,
      pointerId: event.pointerId,
      sourceEntries,
      sourceRow: row,
      startX: event.clientX,
      startY: event.clientY,
    };

    row.setPointerCapture(event.pointerId);
  }

  function updateLayerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const distanceX = event.clientX - dragState.startX;
    const distanceY = event.clientY - dragState.startY;

    if (!dragState.isDragging && Math.hypot(distanceX, distanceY) < 4) {
      return;
    }

    if (!dragState.isDragging) {
      dragState.isDragging = true;
      dragState.sourceEntries.forEach((entry) => entry.classList.add("dragging"));
    }

    showDropHint(findDropIntent(event));
    event.preventDefault();
  }

  function stopLayerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const wasDragging = dragState.isDragging;

    if (wasDragging) {
      applyDropIntent();
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    dragState.sourceEntries.forEach((entry) => entry.classList.remove("dragging"));
    clearDropHints();

    if (dragState.sourceRow.hasPointerCapture(event.pointerId)) {
      dragState.sourceRow.releasePointerCapture(event.pointerId);
    }

    dragState = null;
  }

  panel.innerHTML = `
    <div class="layers-list" role="listbox" aria-label="Layers" aria-multiselectable="true"></div>
  `;

  const firstLayer = createLayerEntry("Layer");
  panel.querySelector(".layers-list").append(firstLayer);
  updateLayerDepths();
  selectOnlyLayer(firstLayer.querySelector("[data-layer-row]"));

  copyLayerButton?.addEventListener("click", copySelectedLayers);
  addGroupButton?.addEventListener("click", addGroup);

  document.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (!isDeleteShortcut(event)) {
      return;
    }

    if (!getSelectedRootEntries().length) {
      return;
    }

    event.preventDefault();
    deleteSelectedLayers();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (
      panel.contains(target) ||
      target.closest(".drawer-copy-layer-button, .drawer-new-folder-button")
    ) {
      return;
    }

    clearLayerSelection();
  });

  panel.addEventListener("pointerdown", (event) => {
    const target = event.target;

    if (
      !(target instanceof Element) ||
      target.closest("button") ||
      target.closest(".layer-name.renaming")
    ) {
      return;
    }

    const row = target.closest("[data-layer-row]");

    if (!row) {
      return;
    }

    startLayerDrag(row, event);
  });

  panel.addEventListener("pointermove", updateLayerDrag);
  panel.addEventListener("pointerup", stopLayerDrag);
  panel.addEventListener("pointercancel", stopLayerDrag);

  panel.addEventListener("dblclick", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const row = target.closest("[data-layer-row]");

    if (!row || !panel.contains(row) || target.closest("button, .layer-actions")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginLayerRename(row);
  });

  panel.addEventListener("keydown", (event) => {
    const target = event.target;

    if (
      !(target instanceof HTMLElement) ||
      !target.classList.contains("layer-name") ||
      !target.classList.contains("renaming")
    ) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finishLayerRename(target, true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finishLayerRename(target, false);
    }
  });

  panel.addEventListener("focusout", (event) => {
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      target.classList.contains("layer-name") &&
      target.classList.contains("renaming")
    ) {
      finishLayerRename(target, true);
    }
  });

  panel.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (suppressNextClick) {
      event.preventDefault();
      return;
    }

    if (target.closest(".layer-name.renaming")) {
      return;
    }

    const row = target.closest("[data-layer-row]");
    const toggleButton = target.closest("[data-group-toggle]");
    const lockButton = target.closest("[data-layer-lock]");
    const visibilityButton = target.closest("[data-layer-visibility]");

    if (!row) {
      clearLayerSelection();
      return;
    }

    if (toggleButton) {
      toggleGroup(row);
      return;
    }

    if (lockButton) {
      const isLocked = row.classList.toggle("locked");

      if (isLocked) {
        setLayerBranchSelected(row, false);
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
