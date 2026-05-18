window.CBO = window.CBO || {};

window.CBO.initLayersPanel = function initLayersPanel() {
  const panel = document.querySelector(".drawer-layers-panel");
  const addLayerButton = document.querySelector(".drawer-new-layer-button");
  const copyLayerButton = document.querySelector(".drawer-copy-layer-button");
  const mergeLayerButton = document.querySelector(".drawer-merge-layer-button");
  const addGroupButton = document.querySelector(".drawer-new-folder-button");

  if (!panel || panel.dataset.layersReady === "true") {
    return;
  }

  panel.dataset.layersReady = "true";

  let groupCount = 0;
  let rangeAnchor = null;
  let focusedLayer = null;
  let dragState = null;
  let layerContextMenu = null;
  let layerLimitToast = null;
  let layerLimitToastTimer = 0;
  let contextMenuLayerId = "";
  let suppressNextClick = false;
  let suppressNextClickTimer = 0;
  let layerLongPressState = null;
  let isRenderingLayerModel = false;
  let isSyncingLayerModelFromDom = false;
  let isEnsuringArtboardLayerGroups = false;
  let selectedArtboardGroupId = "";
  const expandedArtboardGroupIds = new Set();
  const collapsedLayerGroupIds = new Set();
  const ARTBOARD_LAYER_GROUP_PREFIX = "artboard-group-";
  const layerTouchLongPressDelay = 520;
  const layerTouchMoveTolerance = 10;
  const layerTouchDragAutoScrollZone = 54;
  const layerTouchDragAutoScrollStep = 18;
  const layerModel = window.CBO.documentLayerModel ||
    (window.CBO.DocumentLayerModel ? new window.CBO.DocumentLayerModel() : null);

  window.CBO.documentLayerModel = layerModel;

  function isArtboardSelectionEnabled() {
    return window.CBO.artboardSelectionEnabled === true;
  }

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
    return row?.dataset.artboardGroup === "true" || row.classList.contains("locked");
  }

  function isGroupRow(row) {
    return row.dataset.layerType === "group";
  }

  function isArtboardGroupRow(row) {
    return row?.dataset.artboardGroup === "true";
  }

  function isBackgroundRow(row) {
    return row?.dataset.layerType === "background" || row?.dataset.layerId === "background";
  }

  function getLayerId(row) {
    return row?.dataset.layerId || "";
  }

  function ensureLayerLimitToast() {
    if (layerLimitToast?.isConnected) {
      return layerLimitToast;
    }

    layerLimitToast = document.getElementById("cbo-layer-limit-toast");

    if (!layerLimitToast) {
      layerLimitToast = document.createElement("div");
      layerLimitToast.id = "cbo-layer-limit-toast";
      layerLimitToast.className = "cbo-layer-limit-toast";
      layerLimitToast.hidden = true;
      layerLimitToast.setAttribute("role", "status");
      layerLimitToast.setAttribute("aria-live", "polite");
      document.body.appendChild(layerLimitToast);
    }

    return layerLimitToast;
  }

  function showLayerLimitToast(message = "You can't create new layers") {
    const toast = ensureLayerLimitToast();

    if (layerLimitToastTimer) {
      clearTimeout(layerLimitToastTimer);
      layerLimitToastTimer = 0;
    }

    toast.textContent = message;
    toast.hidden = false;
    layerLimitToastTimer = window.setTimeout(() => {
      toast.hidden = true;
      layerLimitToastTimer = 0;
    }, 1000);
  }

  function getDocumentRasterBytes() {
    const renderer = window.CBO.documentRenderer;
    const width = Math.max(1, Math.round(Number(renderer?.width) || Number(window.CBO.documentSettings?.width) || 1));
    const height = Math.max(1, Math.round(Number(renderer?.height) || Number(window.CBO.documentSettings?.height) || 1));

    return width * height * 4;
  }

  function allowNewRasterLayers(options = {}) {
    const budget = window.CBO.getRasterLayerCreationBudget?.({
      estimatedNewBytes: options.estimatedNewBytes,
      source: options.source,
    });

    if (!budget || budget.allowed !== false) {
      return true;
    }

    showLayerLimitToast();
    return false;
  }

  function normalizeLayerOpacity(value, fallback = 1) {
    const opacity = Number(value);

    return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback;
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

  function getActiveLayerRow() {
    return getLayerRows().find((row) => getLayerId(row) === layerModel?.activeLayerId) || null;
  }

  function syncActiveLayerUi() {
    const activeRow = getActiveLayerRow();

    getLayerRows().forEach((layerRow) => {
      layerRow.classList.toggle("active", layerRow === activeRow);
    });
    syncMergeLayerButtonUi();
  }

  function getReferenceLayerId() {
    return window.CBO.colorFill?.getReferenceLayerId?.() || window.CBO.colorFillReferenceLayerId || "";
  }

  function setReferenceLayerId(layerId, source = "layers-panel-reference", options = {}) {
    if (window.CBO.colorFill?.setReferenceLayerId) {
      window.CBO.colorFill.setReferenceLayerId(layerId, { ...options, source });
    } else {
      window.CBO.colorFillReferenceLayerId = layerId || "";
      window.dispatchEvent(new CustomEvent("cbo:color-fill-reference-change", {
        detail: { layerId: layerId || null, source },
      }));
    }
  }

  function clearReferenceLayerId(source = "layers-panel-clear-reference", options = {}) {
    if (window.CBO.colorFill?.clearReferenceLayerId) {
      window.CBO.colorFill.clearReferenceLayerId({ ...options, source });
    } else {
      setReferenceLayerId("", source);
    }
  }

  function isReferenceableLayerRow(row) {
    return Boolean(row && !isGroupRow(row) && !isBackgroundRow(row));
  }

  function updateLayerDescription(row) {
    if (!row) {
      return;
    }

    const descriptions = [];

    if (row.classList.contains("reference-layer")) {
      descriptions.push("Reference layer for color fill");
    }

    if (row.classList.contains("clipping-mask")) {
      descriptions.push("Clipping mask");
    }

    if (descriptions.length > 0) {
      row.setAttribute("aria-description", descriptions.join(". "));
    } else {
      row.removeAttribute("aria-description");
    }
  }

  function syncReferenceLayerUi() {
    const referenceId = getReferenceLayerId();
    const hasMissingReference = referenceId && !layerModel?.findEntryById?.(referenceId);

    if (hasMissingReference) {
      clearReferenceLayerId("layers-panel-prune-reference", { history: false });
      return;
    }

    getLayerRows().forEach((layerRow) => {
      const isReference = referenceId && getLayerId(layerRow) === referenceId;

      layerRow.classList.toggle("reference-layer", Boolean(isReference));
      updateLayerDescription(layerRow);
    });
  }

  function getFlatContentLayersTopToBottom() {
    return layerModel?.flattenTopToBottom?.() || [];
  }

  function getLayerBelow(layerId) {
    const layers = getFlatContentLayersTopToBottom();
    const index = layers.findIndex((layer) => layer.id === layerId);

    return index >= 0 ? layers[index + 1] || null : null;
  }

  function isClippingMaskAllowed(layerId) {
    const layer = layerModel?.findEntryById?.(layerId);
    const below = getLayerBelow(layerId);

    if (!layer || layer.locked === true) {
      return false;
    }

    if (layer.type === "group" || layer.type === "background" || layer.id === "background") {
      return false;
    }

    if (!below || below.type === "background" || below.type === "group") {
      return false;
    }

    return true;
  }

  function toggleClippingMask(layerId) {
    const layer = layerModel?.findEntryById?.(layerId);

    if (!layer || layer.locked === true) {
      return false;
    }

    const shouldClip = layer.clippingMask !== true;

    if (shouldClip && !isClippingMaskAllowed(layerId)) {
      return false;
    }

    return layerModel.updateLayer(layerId, {
      clippingMask: shouldClip,
    }, {
      source: "layers-panel-clipping-mask",
    });
  }

  function setFocusedLayerUi(row) {
    const unlockedRow = row && !isLayerLocked(row) ? row : null;

    getLayerRows().forEach((layerRow) => {
      layerRow.classList.toggle("selection-focus", layerRow === unlockedRow);
    });
    focusedLayer = unlockedRow;

    return unlockedRow;
  }

  function setFocusedLayer(row) {
    const unlockedRow = setFocusedLayerUi(row);
    const layerId = getLayerId(unlockedRow);

    if (layerModel && layerId && !isGroupRow(unlockedRow) && layerModel.activeLayerId !== layerId) {
      layerModel.setActiveLayer(layerId, { source: "layers-panel-selection" });
    }

    syncActiveLayerUi();
  }

  function clearArtboardGroupActivation(options = {}) {
    getLayerRows().forEach((row) => {
      if (!isArtboardGroupRow(row)) {
        return;
      }

      row.classList.remove("artboard-active");
      row.removeAttribute("aria-current");
    });

    if (options.preserveSelectionState !== true) {
      selectedArtboardGroupId = "";
    }
  }

  function applyArtboardGroupActivationById(groupId, options = {}) {
    if (!isArtboardSelectionEnabled() && options.force !== true) {
      clearArtboardGroupActivation();
      syncActiveLayerUi();
      return null;
    }

    const normalizedGroupId = String(groupId || "").trim();
    const rows = getLayerRows();
    const activeRow = normalizedGroupId
      ? rows.find((row) => isArtboardGroupRow(row) && getLayerId(row) === normalizedGroupId)
      : null;

    rows.forEach((row) => {
      setLayerSelected(row, false);
      row.classList.remove("selection-focus");

      if (isArtboardGroupRow(row)) {
        const isActiveArtboard = row === activeRow;

        row.classList.toggle("artboard-active", isActiveArtboard);
        row.toggleAttribute("aria-current", isActiveArtboard);
      }
    });

    if (!activeRow) {
      if (options.preserveMissing !== true) {
        selectedArtboardGroupId = "";
      }

      syncActiveLayerUi();
      return null;
    }

    selectedArtboardGroupId = normalizedGroupId;
    rangeAnchor = null;
    focusedLayer = null;
    activeRow.classList.add("selection-focus");
    syncActiveLayerUi();

    return activeRow;
  }

  function selectArtboardGroupRow(row, options = {}) {
    if (!isArtboardSelectionEnabled() && options.force !== true) {
      clearArtboardGroupActivation();
      return null;
    }

    if (!isArtboardGroupRow(row)) {
      return null;
    }

    const activeRow = applyArtboardGroupActivationById(getLayerId(row));
    const artboardId = getArtboardIdFromGroupId(getLayerId(row));

    if (activeRow && options.emit !== false && artboardId) {
      window.CBO.selectPreviewArtboard?.(artboardId, {
        source: options.source || "layers-panel-artboard-row",
      });
    }

    return activeRow;
  }

  function clearLayerSelection() {
    getLayerRows().forEach((row) => setLayerSelected(row, false));
    getLayerRows().forEach((row) => row.classList.remove("selection-focus"));
    clearArtboardGroupActivation();
    window.CBO.clearPreviewArtboardSelection?.({
      source: "layers-panel-clear-selection",
    });
    rangeAnchor = null;
    focusedLayer = null;
    syncActiveLayerUi();
    syncMergeLayerButtonUi();
  }

  function suppressUpcomingLayerClick(duration = 450) {
    suppressNextClick = true;

    if (suppressNextClickTimer) {
      window.clearTimeout(suppressNextClickTimer);
    }

    suppressNextClickTimer = window.setTimeout(() => {
      suppressNextClick = false;
      suppressNextClickTimer = 0;
    }, duration);
  }

  function consumeSuppressedLayerClick(event) {
    if (!suppressNextClick) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClick = false;

    if (suppressNextClickTimer) {
      window.clearTimeout(suppressNextClickTimer);
      suppressNextClickTimer = 0;
    }

    return true;
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
    syncLayerModelFromDom("rename");
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
    if (entry.classList.contains("collapsed")) {
      collapsedLayerGroupIds.add(getLayerId(row));
      expandedArtboardGroupIds.delete(getLayerId(row));
    } else {
      collapsedLayerGroupIds.delete(getLayerId(row));
      if (isArtboardGroupRow(row)) {
        expandedArtboardGroupIds.add(getLayerId(row));
      }
    }
    updateGroupToggle(row);
  }

  function getArtboardLayerGroupId(artboardId) {
    return `${ARTBOARD_LAYER_GROUP_PREFIX}${String(artboardId || "active-document").trim() || "active-document"}`;
  }

  function getArtboardIdFromGroupId(groupId) {
    const normalizedGroupId = String(groupId || "").trim();

    return normalizedGroupId.startsWith(ARTBOARD_LAYER_GROUP_PREFIX)
      ? normalizedGroupId.slice(ARTBOARD_LAYER_GROUP_PREFIX.length)
      : "";
  }

  function getCurrentArtboardGroupId() {
    if (isArtboardSelectionEnabled() && selectedArtboardGroupId) {
      return selectedArtboardGroupId;
    }

    const selectedArtboardId = isArtboardSelectionEnabled()
      ? window.CBO.getSelectedDocumentArtboardId?.() ||
        window.CBO.getSelectedPreviewArtboardId?.() ||
        ""
      : "";

    return selectedArtboardId
      ? getArtboardLayerGroupId(selectedArtboardId)
      : getArtboardLayerGroupId("active-document");
  }

  function getCurrentArtboardLayerEntry() {
    const groupId = getCurrentArtboardGroupId();
    const row = groupId
      ? getLayerRows().find((layerRow) => isArtboardGroupRow(layerRow) && getLayerId(layerRow) === groupId)
      : null;

    return row ? getLayerEntry(row) : null;
  }

  function expandArtboardLayerEntry(entry) {
    const row = entry?.querySelector(":scope > [data-layer-row]");
    const groupId = getLayerId(row);

    if (!row || !isArtboardGroupRow(row)) {
      return;
    }

    entry.classList.remove("collapsed");
    collapsedLayerGroupIds.delete(groupId);
    expandedArtboardGroupIds.add(groupId);
    updateGroupToggle(row);
  }

  function isArtboardLayerGroup(entry) {
    return entry?.type === "group" && entry.artboardGroup === true;
  }

  function getFallbackArtboardRecords() {
    const renderer = window.CBO.documentRenderer;

    if (!renderer) {
      return [];
    }

    return [{
      height: Math.max(1, Math.round(renderer.height || window.CBO.documentSettings?.height || 1)),
      id: "active-document",
      name: "Artboard 1",
      width: Math.max(1, Math.round(renderer.width || window.CBO.documentSettings?.width || 1)),
    }];
  }

  function getArtboardLayerRecords() {
    const records = window.CBO.getDocumentArtboards?.() || window.CBO.getPreviewArtboards?.() || getFallbackArtboardRecords();

    return records.map((artboard, index) => ({
      height: Math.max(1, Math.round(Number(artboard?.height) || 1)),
      id: String(artboard?.id || (index === 0 ? "active-document" : `preview-${index}`)),
      name: String(artboard?.name || `Artboard ${index + 1}`),
      width: Math.max(1, Math.round(Number(artboard?.width) || 1)),
    }));
  }

  function createArtboardLayerGroup(artboard, children = [], existingGroup = null) {
    return {
      ...(existingGroup || {}),
      artboardGroup: true,
      artboardHeight: artboard.height,
      artboardId: artboard.id,
      artboardWidth: artboard.width,
      children,
      id: getArtboardLayerGroupId(artboard.id),
      locked: existingGroup?.locked === true,
      name: artboard.name,
      type: "group",
      visible: existingGroup?.visible !== false,
    };
  }

  function ensureArtboardLayerGroups(source = "layers-panel-artboards") {
    if (!layerModel || isEnsuringArtboardLayerGroups) {
      return;
    }

    const artboards = getArtboardLayerRecords();

    if (artboards.length === 0) {
      return;
    }

    const artboardGroupIds = new Set(artboards.map((artboard) => getArtboardLayerGroupId(artboard.id)));

    if (selectedArtboardGroupId && !artboardGroupIds.has(selectedArtboardGroupId)) {
      selectedArtboardGroupId = "";
    }

    const entries = layerModel.getEntries?.() || [];
    const existingGroupsByArtboardId = new Map();
    const looseEntries = [];

    entries.forEach((entry) => {
      if (isArtboardLayerGroup(entry)) {
        existingGroupsByArtboardId.set(entry.artboardId || entry.id, entry);
        return;
      }

      looseEntries.push(entry);
    });

    const nextEntries = artboards.map((artboard, index) => {
      const existingGroup = existingGroupsByArtboardId.get(artboard.id) ||
        existingGroupsByArtboardId.get(getArtboardLayerGroupId(artboard.id)) ||
        null;
      const existingChildren = Array.isArray(existingGroup?.children) ? existingGroup.children : [];
      const children = index === 0 && looseEntries.length > 0
        ? [...looseEntries, ...existingChildren]
        : existingChildren;

      return createArtboardLayerGroup(artboard, children, existingGroup);
    });

    if (JSON.stringify(entries) === JSON.stringify(nextEntries)) {
      return;
    }

    isEnsuringArtboardLayerGroups = true;

    try {
      layerModel.setEntries(nextEntries, {
        history: false,
        source,
      });
    } finally {
      isEnsuringArtboardLayerGroups = false;
    }

    renderLayerModel();
  }

  function getInsertTarget(list) {
    const selectedRows = Array.from(list.querySelectorAll("[data-layer-row].selected"));

    return selectedRows.includes(focusedLayer) ? focusedLayer : selectedRows[0];
  }

  function serializeLayerEntry(entry, inheritedArtboardId = "") {
    const row = entry.querySelector(":scope > [data-layer-row]");
    const type = row?.dataset.layerType || entry.dataset.layerType || "layer";
    const isBackground = type === "background";
    const id = getLayerId(row) || layerModel?.createId(type) || `${type}-${Date.now().toString(36)}`;
    const cloneSourceId = entry.dataset.layerCloneSourceId || "";
    const existingEntry = layerModel?.findEntryById?.(id) || layerModel?.findEntryById?.(cloneSourceId);
    const preservedEntry = existingEntry
      ? Object.fromEntries(
          Object.entries(existingEntry)
            .filter(([key]) => !["id", "type", "name", "visible", "locked", "children"].includes(key)),
        )
      : {};
    const serialized = {
      ...preservedEntry,
      id,
      type,
      name: isBackground
        ? "Background"
        : row?.querySelector(":scope .layer-name")?.textContent.trim() || (type === "group" ? "Group" : "Layer"),
      visible: !row?.classList.contains("hidden-layer"),
      locked: isBackground || row?.classList.contains("locked") === true,
      opacity: normalizeLayerOpacity(existingEntry?.opacity),
    };
    const inheritedId = String(inheritedArtboardId || "").trim();
    const artboardGroupId = type === "group" && (
      row?.dataset.artboardGroup === "true" ||
      entry.dataset.artboardGroup === "true" ||
      preservedEntry.artboardGroup === true
    )
      ? getArtboardIdFromGroupId(id) || String(preservedEntry.artboardId || "").trim()
      : "";
    const resolvedArtboardId = artboardGroupId || inheritedId || String(preservedEntry.artboardId || "").trim();

    if (resolvedArtboardId) {
      serialized.artboardId = resolvedArtboardId;
    } else {
      delete serialized.artboardId;
    }

    if (type === "group") {
      const children = getLayerChildren(entry);

      serialized.children = children
        ? Array.from(children.children)
            .filter((childEntry) => childEntry.matches("[data-layer-entry]"))
            .map((childEntry) => serializeLayerEntry(childEntry, resolvedArtboardId))
        : [];
    }

    return serialized;
  }

  function syncLayerModelFromDom(source = "layers-panel", options = {}) {
    if (!layerModel) {
      return;
    }

    isSyncingLayerModelFromDom = true;

    try {
      const rootList = panel.querySelector(".layers-list");
      const entries = Array.from(rootList.children)
        .filter((entry) => entry.matches("[data-layer-entry]"))
        .map(serializeLayerEntry);
      const activeLayerId = getLayerId(focusedLayer) || getLayerId(getFirstSelectedLayer());

      const syncOptions = { ...options, source };

      layerModel.setEntries(entries, syncOptions);

      if (activeLayerId && layerModel.activeLayerId !== activeLayerId) {
        layerModel.setActiveLayer(activeLayerId, syncOptions);
      }
    } finally {
      isSyncingLayerModelFromDom = false;
    }

    syncReferenceLayerUi();
  }

  function insertLayerEntry(entry) {
    const rootList = panel.querySelector(".layers-list");
    const activeRow = getInsertTarget(rootList);
    const activeEntry = activeRow ? getLayerEntry(activeRow) : null;

    if (activeEntry) {
      activeEntry.parentElement.insertBefore(entry, activeEntry);
    } else {
      const activeArtboardEntry = getCurrentArtboardLayerEntry();
      const activeArtboardChildren = activeArtboardEntry ? getLayerChildren(activeArtboardEntry) : null;

      if (activeArtboardChildren) {
        expandArtboardLayerEntry(activeArtboardEntry);
        activeArtboardChildren.prepend(entry);
      } else {
        rootList.prepend(entry);
      }
    }

    isSyncingLayerModelFromDom = true;

    try {
      updateLayerDepths();
      selectOnlyLayer(entry.querySelector("[data-layer-row]"));
      syncLayerModelFromDom("insert");
    } finally {
      isSyncingLayerModelFromDom = false;
    }

    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function insertLayerEntryAfter(entry, targetEntry, options = {}) {
    targetEntry.parentElement.insertBefore(entry, targetEntry.nextElementSibling);

    if (options.updateDepths !== false) {
      updateLayerDepths();
    }

    if (options.sync !== false) {
      syncLayerModelFromDom("insert-after");
    }

    if (options.scroll !== false) {
      panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
    }
  }

  function getLayerIcon(type, state = {}) {
    if (state.artboardGroup === true) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-dice1-icon lucide-dice-1">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <path d="M12 12h.01" />
        </svg>
      `;
    }

    if (type === "group") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1" />
          <path d="M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1" />
          <path d="M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z" />
        </svg>
      `;
    }

    if (type === "image") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      `;
    }

    if (type === "background") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        </svg>
      `;
    }

    if (type === "vector" || type === "svg") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
          <path d="M5 17A12 12 0 0 1 17 5" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
        </svg>
      `;
    }

    if (type === "vector-text" || type === "text") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v16" />
          <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
          <path d="M9 20h6" />
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

  function getClippingMaskIndicator() {
    return `
      <span class="layer-clipping-indicator" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m14 15-5 5-5-5" />
          <path d="M20 4h-7a4 4 0 0 0-4 4v12" />
        </svg>
      </span>
    `;
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

  function applyLayerState(row, state = {}) {
    const lockButton = row.querySelector("[data-layer-lock]");
    const visibilityButton = row.querySelector("[data-layer-visibility]");
    const isBackground = isBackgroundRow(row);
    const isLocked = isBackground || state.locked === true;
    const isHidden = state.visible === false;
    const isClipping = state.clippingMask === true;

    row.classList.toggle("locked", isLocked);
    row.classList.toggle("hidden-layer", isHidden);
    row.classList.toggle("clipping-mask", isClipping);
    lockButton?.setAttribute("aria-pressed", String(isLocked));
    lockButton?.setAttribute("aria-label", isBackground ? "Background locked" : isLocked ? "Unlock layer" : "Lock layer");
    lockButton?.toggleAttribute("disabled", isBackground);
    visibilityButton?.setAttribute("aria-pressed", String(!isHidden));
    visibilityButton?.setAttribute("aria-label", isHidden ? "Show layer" : "Hide layer");
    updateLayerDescription(row);
  }

  function createLayerEntry(layerName, type = "layer", id = "", state = {}) {
    const entry = document.createElement("div");
    const row = document.createElement("div");
    const layerId = id || layerModel?.createId(type) || `${type}-${Date.now().toString(36)}`;

    entry.className = `layer-entry ${type === "group" ? "layer-group-entry" : ""} ${state.artboardGroup === true ? "layer-artboard-entry" : ""}`.trim();
    entry.dataset.layerEntry = "";
    entry.dataset.layerId = layerId;
    entry.dataset.layerType = type;
    row.className = `layer-row ${type === "group" ? "layer-group-row" : ""} ${state.artboardGroup === true ? "layer-artboard-row" : ""}`.trim();
    row.role = "option";
    row.tabIndex = 0;
    row.dataset.layerRow = "";
    row.dataset.layerId = layerId;
    row.dataset.layerType = type;
    if (state.artboardGroup === true) {
      row.dataset.artboardGroup = "true";
      entry.dataset.artboardGroup = "true";
    }
    row.innerHTML = `
      <div class="layer-info">
        ${getDisclosureControl(type)}
        <span class="layer-icon-stack" data-layer-drag-handle aria-hidden="true">
          ${getClippingMaskIndicator()}
          <span class="layer-file-icon" aria-hidden="true">
            ${getLayerIcon(type, state)}
          </span>
        </span>
        <span class="layer-name">${layerName}</span>
      </div>
      ${createLayerActions()}
    `;

    entry.append(row);
    applyLayerState(row, state);

    if (type === "group") {
      const children = document.createElement("div");
      children.className = "layer-children";
      children.dataset.layerChildren = "";
      entry.append(children);
    }

    return entry;
  }

  function createLayerEntryFromModel(entry) {
    const layerEntry = createLayerEntry(entry.name, entry.type, entry.id, entry);

    if (entry.type === "group") {
      const children = getLayerChildren(layerEntry);

      (entry.children || []).forEach((childEntry) => {
        children.append(createLayerEntryFromModel(childEntry));
      });
      const shouldCollapse = entry.artboardGroup === true
        ? !expandedArtboardGroupIds.has(entry.id)
        : collapsedLayerGroupIds.has(entry.id);

      layerEntry.classList.toggle("collapsed", shouldCollapse);
      updateGroupToggle(layerEntry.querySelector(":scope > [data-layer-row]"));
    }

    return layerEntry;
  }

  function renderLayerModel() {
    const rootList = panel.querySelector(".layers-list");
    const entries = layerModel?.getEntries?.() || [];

    isRenderingLayerModel = true;

    try {
      rootList.replaceChildren(...entries.map(createLayerEntryFromModel));
      updateLayerDepths();

      const activeRow =
        layerModel?.activeLayerId &&
        getLayerRows().find((row) => getLayerId(row) === layerModel.activeLayerId);
      const activeArtboardRow = isArtboardSelectionEnabled() && selectedArtboardGroupId
        ? applyArtboardGroupActivationById(selectedArtboardGroupId, { preserveMissing: true })
        : null;

      if (activeArtboardRow) {
        syncActiveLayerUi();
      } else if (activeRow) {
        selectOnlyLayer(activeRow);
      } else {
        clearLayerSelection();
      }

      syncActiveLayerUi();
      syncReferenceLayerUi();
      syncMergeLayerButtonUi();
    } finally {
      isRenderingLayerModel = false;
    }
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

    copiedEntry.dataset.layerCloneSourceId = getLayerId(sourceRow);
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

  function collectLayerClonePairs(entry, pairs = []) {
    const sourceLayerId = entry.dataset.layerCloneSourceId || "";
    const row = entry.querySelector(":scope > [data-layer-row]");
    const destinationLayerId = getLayerId(row);
    const children = getLayerChildren(entry);

    if (sourceLayerId && destinationLayerId && sourceLayerId !== destinationLayerId) {
      pairs.push({ destinationLayerId, sourceLayerId });
    }

    Array.from(children?.children || []).forEach((childEntry) => {
      if (childEntry.matches("[data-layer-entry]")) {
        collectLayerClonePairs(childEntry, pairs);
      }
    });

    return pairs;
  }

  function duplicateCopiedLayerRasterTargets(copiedEntries) {
    const renderer = window.CBO.documentRenderer;

    if (!renderer?.duplicateRasterTarget) {
      return;
    }

    copiedEntries
      .flatMap((entry) => collectLayerClonePairs(entry))
      .forEach(({ sourceLayerId, destinationLayerId }) => {
        renderer.duplicateRasterTarget(sourceLayerId, destinationLayerId, {
          source: "layers-panel-copy",
        });
      });
  }

  function getSelectedRootEntries() {
    return Array.from(panel.querySelector(".layers-list").querySelectorAll("[data-layer-entry]"))
      .filter(isEntrySelected)
      .filter((entry) => {
        const selectedParent = entry.parentElement.closest("[data-layer-entry]");

        return !selectedParent || !isEntrySelected(selectedParent);
      });
  }

  function isContentLayerRow(row) {
    return Boolean(row && !isGroupRow(row) && !isBackgroundRow(row));
  }

  function isPaintLayerRow(row) {
    return row?.dataset.layerType === "paint";
  }

  function getContentLayerRows() {
    return getLayerRows().filter(isContentLayerRow);
  }

  function getSelectedContentLayerRows() {
    return getLayerRows().filter((row) => row.classList.contains("selected") && isContentLayerRow(row));
  }

  function getSelectedContentLayerIds() {
    return getSelectedContentLayerRows().map(getLayerId).filter(Boolean);
  }

  function getFocusedMergeLayerId() {
    return getLayerId(focusedLayer) || layerModel?.activeLayerId || getLayerId(getFirstSelectedLayer());
  }

  function getHeaderMergeMode() {
    const selectedLayerIds = getSelectedContentLayerIds();

    if (selectedLayerIds.length > 1) {
      return {
        canMerge: window.CBO.getDocumentLayerMergePlan?.(selectedLayerIds)?.ok === true,
        layerIds: selectedLayerIds,
        mode: "selected",
      };
    }

    const layerId = getFocusedMergeLayerId();

    return {
      canMerge: window.CBO.getDocumentLayerMergeDownPlan?.(layerId)?.ok === true,
      layerId,
      mode: "down",
    };
  }

  function syncMergeLayerButtonUi() {
    if (!mergeLayerButton) {
      return;
    }

    const mergeMode = getHeaderMergeMode();
    const label = mergeMode.mode === "selected" ? "Merge selected layers" : "Merge layer down";
    const tooltip = mergeMode.mode === "selected" ? "MERGE SELECTED" : "MERGE DOWN";

    mergeLayerButton.disabled = !mergeMode.canMerge;
    mergeLayerButton.setAttribute("aria-disabled", String(!mergeMode.canMerge));
    mergeLayerButton.setAttribute("aria-label", label);
    mergeLayerButton.dataset.tooltip = tooltip;
  }

  function getContentLayerRowsInside(entries) {
    const rows = entries.flatMap((entry) =>
      Array.from(entry.querySelectorAll("[data-layer-row]")).filter(isContentLayerRow),
    );

    return Array.from(new Set(rows));
  }

  function estimateLayerRowRasterBytes(row) {
    if (!isContentLayerRow(row)) {
      return 0;
    }

    const renderer = window.CBO.documentRenderer;
    const layerId = getLayerId(row);
    const target = layerId ? renderer?.rasterTargetsByLayerId?.get?.(layerId) : null;

    if (target && typeof renderer?.estimateRasterTargetBytes === "function") {
      return renderer.estimateRasterTargetBytes(target);
    }

    return getDocumentRasterBytes();
  }

  function estimateEntryRasterBytes(entries) {
    const rows = getContentLayerRowsInside(entries);

    return rows.reduce((total, row) => total + estimateLayerRowRasterBytes(row), 0);
  }

  function estimateLayerRowRasterDuplicateBytes(row) {
    if (!isContentLayerRow(row)) {
      return 0;
    }

    const renderer = window.CBO.documentRenderer;
    const layerId = getLayerId(row);
    const target = layerId ? renderer?.rasterTargetsByLayerId?.get?.(layerId) : null;

    if (target && typeof renderer?.estimateRasterTargetDuplicateBytes === "function") {
      return renderer.estimateRasterTargetDuplicateBytes(target);
    }

    return estimateLayerRowRasterBytes(row);
  }

  function estimateEntryRasterDuplicateBytes(entries) {
    const rows = getContentLayerRowsInside(entries);

    return rows.reduce((total, row) => total + estimateLayerRowRasterDuplicateBytes(row), 0);
  }

  function clearLayerContents(rows, options = {}) {
    const renderer = window.CBO.documentRenderer;
    const layerIds = Array.from(new Set(rows.map(getLayerId).filter(Boolean)));

    layerIds.forEach((layerId) => {
      renderer?.clearLayer?.(layerId, options);
    });
  }

  function showLayerMergeError(fallbackMessage = "Can't merge these layers") {
    const error = window.CBO.lastLayerMergeError;

    showLayerLimitToast(error?.message || fallbackMessage);
  }

  function runLayerMerge(promise, fallbackMessage) {
    Promise.resolve(promise)
      .then((didMerge) => {
        if (didMerge === false) {
          showLayerMergeError(fallbackMessage);
        } else {
          syncMergeLayerButtonUi();
        }
      })
      .catch((error) => {
        window.CBO.lastLayerMergeError = {
          error,
          message: error?.message || fallbackMessage,
          ok: false,
          reason: "layers-panel-merge-failed",
        };
        showLayerMergeError(fallbackMessage);
        syncMergeLayerButtonUi();
      });
  }

  function mergeLayersFromHeaderButton() {
    const mergeMode = getHeaderMergeMode();

    if (!mergeMode.canMerge) {
      showLayerMergeError(
        mergeMode.mode === "selected"
          ? "Can't merge the selected layers"
          : "Can't merge this layer down",
      );
      return;
    }

    if (mergeMode.mode === "selected") {
      runLayerMerge(
        window.CBO.mergeDocumentLayers?.(mergeMode.layerIds, {
          source: "layers-panel-header-merge-selected",
        }),
        "Can't merge the selected layers",
      );
      return;
    }

    runLayerMerge(
      window.CBO.mergeLayerDown?.(mergeMode.layerId, {
        source: "layers-panel-header-merge-down",
      }),
      "Can't merge this layer down",
    );
  }

  function releaseDeletedDocumentHistory(source = "layers-panel-delete-all-content-layers") {
    const renderer = window.CBO.documentRenderer;

    window.CBO.documentHistory?.clear?.();
    renderer?.pruneOrphanRasterTargets?.();
    renderer?.invalidatePreviewCache?.(source);
    renderer?.requestDraw?.();
  }

  function selectOnlyLayer(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    clearArtboardGroupActivation();
    window.CBO.clearPreviewArtboardSelection?.({
      source: "layers-panel-select-layer",
    });
    getLayerRows().forEach((layerRow) => setLayerSelected(layerRow, false));
    setLayerBranchSelected(row, true);
    rangeAnchor = row;
    setFocusedLayer(row);
    syncMergeLayerButtonUi();
  }

  function toggleLayerSelection(row) {
    if (isLayerLocked(row)) {
      clearLayerSelection();
      return;
    }

    clearArtboardGroupActivation();
    window.CBO.clearPreviewArtboardSelection?.({
      source: "layers-panel-toggle-layer",
    });
    const shouldSelect = !row.classList.contains("selected");

    setLayerBranchSelected(row, shouldSelect);
    rangeAnchor = row;
    setFocusedLayer(shouldSelect ? row : getFirstSelectedLayer());
    syncMergeLayerButtonUi();
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

    clearArtboardGroupActivation();
    window.CBO.clearPreviewArtboardSelection?.({
      source: "layers-panel-range-select",
    });
    rows.forEach((layerRow, index) => {
      if (index >= startIndex && index <= endIndex && !isLayerLocked(layerRow)) {
        setLayerBranchSelected(layerRow, true);
      }
    });

    rangeAnchor = isLayerLocked(row) ? getFirstSelectedLayer() : anchor;
    setFocusedLayer(isLayerLocked(row) ? getFirstSelectedLayer() : row);
    syncMergeLayerButtonUi();
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

  function getNextNewLayerName() {
    const newLayerCount = layerModel
      ?.flattenTopToBottom?.()
      .filter((entry) => entry.type === "paint" && /^New Layer(?: \d+)?$/.test(entry.name || "")).length || 0;

    return newLayerCount === 0 ? "New Layer" : `New Layer ${newLayerCount + 1}`;
  }

  function addPaintLayer() {
    if (!allowNewRasterLayers({
      estimatedNewBytes: getDocumentRasterBytes(),
      source: "layers-panel-new-layer",
    })) {
      return;
    }

    const layerEntry = createLayerEntry(getNextNewLayerName(), "paint");

    insertLayerEntry(layerEntry);
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
    syncLayerModelFromDom("group-selection");
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function copySelectedLayers() {
    const selectedEntries = getSelectedRootEntries();
    let insertAfterEntry = selectedEntries[selectedEntries.length - 1];
    const copiedEntries = [];
    const copiedRows = [];

    if (!insertAfterEntry) {
      return;
    }

    if (!allowNewRasterLayers({
      estimatedNewBytes: estimateEntryRasterDuplicateBytes(selectedEntries),
      source: "layers-panel-copy",
    })) {
      return;
    }

    selectedEntries.forEach((entry) => {
      const copiedEntry = cloneLayerEntryForUi(entry);

      insertLayerEntryAfter(copiedEntry, insertAfterEntry, {
        scroll: false,
        sync: false,
        updateDepths: false,
      });
      insertAfterEntry = copiedEntry;
      copiedEntries.push(copiedEntry);
      copiedRows.push(copiedEntry.querySelector(":scope > [data-layer-row]"));
    });

    updateLayerDepths();
    clearLayerSelection();
    copiedRows.forEach((row) => setLayerBranchSelected(row, true));
    rangeAnchor = copiedRows[0] || null;
    setFocusedLayerUi(copiedRows[0] || null);
    syncLayerModelFromDom("copy");
    syncActiveLayerUi();
    duplicateCopiedLayerRasterTargets(copiedEntries);
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function deleteSelectedLayers() {
    const selectedEntries = getSelectedRootEntries();

    if (!selectedEntries.length) {
      return;
    }

    const selectedContentRows = getContentLayerRowsInside(selectedEntries);
    const remainingContentRows = getContentLayerRows().filter((row) =>
      !selectedEntries.some((entry) => entry.contains(row)),
    );
    const isDeletingAllContent = selectedContentRows.length > 0 && remainingContentRows.length === 0;
    const isDirectLastPaintLayer =
      isDeletingAllContent &&
      selectedEntries.length === 1 &&
      selectedContentRows.length === 1 &&
      isPaintLayerRow(selectedContentRows[0]) &&
      getLayerEntry(selectedContentRows[0]) === selectedEntries[0];

    if (isDirectLastPaintLayer) {
      clearLayerContents(selectedContentRows, {
        releaseRaster: true,
        source: "layers-panel-delete-last-content-layer",
      });
      releaseDeletedDocumentHistory("layers-panel-delete-last-content-layer");
      return;
    }

    selectedEntries.forEach((entry) => entry.remove());
    clearLayerSelection();
    updateLayerDepths();
    syncLayerModelFromDom(
      isDeletingAllContent ? "delete-all-content-layers" : "delete",
      isDeletingAllContent ? { history: false } : {},
    );

    if (isDeletingAllContent) {
      layerModel?.ensureActivePaintLayer?.({
        history: false,
        source: "delete-last-content-layer",
      });
      releaseDeletedDocumentHistory("layers-panel-delete-all-content-layers");
    }

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

    if (intent.type === "after" && isBackgroundRow(intent.targetRow)) {
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

  function scrollLayerDrawerDuringTouchDrag(event) {
    if (!dragState?.isDragging || dragState.pointerType !== "touch") {
      return;
    }

    const scrollHost = panel.closest(".drawer-content");

    if (!scrollHost) {
      return;
    }

    const rect = scrollHost.getBoundingClientRect();
    const distanceFromTop = event.clientY - rect.top;
    const distanceFromBottom = rect.bottom - event.clientY;
    const canScrollUp = scrollHost.scrollTop > 0;
    const canScrollDown = scrollHost.scrollTop < scrollHost.scrollHeight - scrollHost.clientHeight - 1;
    const delta = distanceFromTop < layerTouchDragAutoScrollZone && canScrollUp
      ? -layerTouchDragAutoScrollStep
      : distanceFromBottom < layerTouchDragAutoScrollZone && canScrollDown
        ? layerTouchDragAutoScrollStep
        : 0;

    if (!delta) {
      return;
    }

    scrollHost.scrollTop += delta;
    scrollHost.dispatchEvent(new Event("scroll"));
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
    syncLayerModelFromDom("reorder");
    panel.closest(".drawer-content")?.dispatchEvent(new Event("scroll"));
  }

  function deleteSelectedArtboardGroup() {
    if (!isArtboardSelectionEnabled()) {
      selectedArtboardGroupId = "";
      return false;
    }

    const groupId = selectedArtboardGroupId;
    const artboardId = getArtboardIdFromGroupId(groupId);

    if (!artboardId) {
      return false;
    }

    if (artboardId === "active-document") {
      showLayerLimitToast("You can't delete Artboard 1 yet");
      return true;
    }

    const didDelete = window.CBO.deletePreviewArtboard?.(artboardId, {
      source: "layers-panel-delete-artboard",
    }) === true;

    if (didDelete) {
      selectedArtboardGroupId = "";
      clearArtboardGroupActivation();
    }

    return didDelete;
  }

  function isTouchLayerPointer(event) {
    return event.pointerType === "touch";
  }

  function isLayerTouchDragHandleTarget(target) {
    return target instanceof Element && Boolean(target.closest("[data-layer-drag-handle]"));
  }

  function cancelLayerDrag(pointerId) {
    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    dragState.sourceEntries.forEach((entry) => entry.classList.remove("dragging"));
    clearDropHints();

    if (dragState.sourceRow.hasPointerCapture(pointerId)) {
      dragState.sourceRow.releasePointerCapture(pointerId);
    }

    dragState = null;
  }

  function clearLayerLongPressState(options = {}) {
    const state = layerLongPressState;

    if (!state) {
      return;
    }

    window.clearTimeout(state.timer);

    if (options.suppressClick && state.didOpen) {
      suppressUpcomingLayerClick();
    }

    layerLongPressState = null;
  }

  function beginLayerLongPress(row, event) {
    if (!isTouchLayerPointer(event) || event.isPrimary === false) {
      return;
    }

    clearLayerLongPressState();

    const state = {
      clientX: event.clientX,
      clientY: event.clientY,
      didOpen: false,
      pointerId: event.pointerId,
      row,
      startX: event.clientX,
      startY: event.clientY,
      timer: 0,
    };

    state.timer = window.setTimeout(() => {
      if (layerLongPressState !== state || !state.row.isConnected) {
        return;
      }

      state.didOpen = true;
      cancelLayerDrag(state.pointerId);
      selectOnlyLayer(state.row);
      openLayerContextMenu(state.row, {
        clientX: state.clientX,
        clientY: state.clientY,
      });
      suppressUpcomingLayerClick();
    }, layerTouchLongPressDelay);

    layerLongPressState = state;
  }

  function updateLayerLongPress(event) {
    const state = layerLongPressState;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    state.clientX = event.clientX;
    state.clientY = event.clientY;

    if (state.didOpen) {
      event.preventDefault();
      return;
    }

    const distanceX = event.clientX - state.startX;
    const distanceY = event.clientY - state.startY;

    if (Math.hypot(distanceX, distanceY) > layerTouchMoveTolerance) {
      clearLayerLongPressState();
    }
  }

  function stopLayerLongPress(event) {
    const state = layerLongPressState;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    clearLayerLongPressState({ suppressClick: true });
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
      pointerType: event.pointerType,
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

    if (layerLongPressState?.pointerId === event.pointerId && layerLongPressState.didOpen) {
      event.preventDefault();
      return;
    }

    const distanceX = event.clientX - dragState.startX;
    const distanceY = event.clientY - dragState.startY;
    const dragThreshold = dragState.pointerType === "touch" ? layerTouchMoveTolerance : 4;

    if (!dragState.isDragging && Math.hypot(distanceX, distanceY) < dragThreshold) {
      return;
    }

    if (!dragState.isDragging) {
      clearLayerLongPressState();
      dragState.isDragging = true;
      dragState.sourceEntries.forEach((entry) => entry.classList.add("dragging"));
    }

    showDropHint(findDropIntent(event));
    scrollLayerDrawerDuringTouchDrag(event);
    event.preventDefault();
  }

  function stopLayerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const wasDragging = dragState.isDragging;

    if (wasDragging) {
      applyDropIntent();
      suppressUpcomingLayerClick();
    }

    dragState.sourceEntries.forEach((entry) => entry.classList.remove("dragging"));
    clearDropHints();

    if (dragState.sourceRow.hasPointerCapture(event.pointerId)) {
      dragState.sourceRow.releasePointerCapture(event.pointerId);
    }

    dragState = null;
  }

  function ensureLayerContextMenu() {
    if (layerContextMenu) {
      return layerContextMenu;
    }

    layerContextMenu = document.createElement("div");
    layerContextMenu.className = "layer-context-menu";
    layerContextMenu.hidden = true;
    layerContextMenu.setAttribute("role", "menu");
    layerContextMenu.innerHTML = `
      <button class="layer-context-menu-item" type="button" role="menuitemcheckbox" data-layer-context-action="reference"></button>
      <button class="layer-context-menu-item" type="button" role="menuitemcheckbox" data-layer-context-action="clipping-mask"></button>
      <button class="layer-context-menu-item" type="button" role="menuitem" data-layer-context-action="merge-down">MERGE DOWN</button>
      <button class="layer-context-menu-item" type="button" role="menuitem" data-layer-context-action="merge-selected">MERGE SELECTED</button>
      <button class="layer-context-menu-item" type="button" role="menuitem" data-layer-context-action="select-alpha">SELECT ALPHA</button>
    `;

    layerContextMenu.addEventListener("click", (event) => {
      const target = event.target;
      const actionButton = target instanceof Element
        ? target.closest("[data-layer-context-action]")
        : null;

      if (!actionButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (actionButton.dataset.layerContextAction === "reference") {
        const currentReferenceId = getReferenceLayerId();

        if (currentReferenceId && currentReferenceId === contextMenuLayerId) {
          clearReferenceLayerId();
        } else {
          setReferenceLayerId(contextMenuLayerId);
        }

        syncReferenceLayerUi();
      }

      if (actionButton.dataset.layerContextAction === "clipping-mask") {
        toggleClippingMask(contextMenuLayerId);
        closeLayerContextMenu();
        return;
      }

      if (actionButton.dataset.layerContextAction === "merge-down") {
        const layerId = contextMenuLayerId;

        closeLayerContextMenu();
        runLayerMerge(
          window.CBO.mergeLayerDown?.(layerId, {
            source: "layers-panel-merge-down",
          }),
          "Can't merge this layer down",
        );
        return;
      }

      if (actionButton.dataset.layerContextAction === "merge-selected") {
        const layerIds = getSelectedContentLayerIds();

        closeLayerContextMenu();
        runLayerMerge(
          window.CBO.mergeDocumentLayers?.(layerIds, {
            source: "layers-panel-merge-selected",
          }),
          "Can't merge the selected layers",
        );
        return;
      }

      if (actionButton.dataset.layerContextAction === "select-alpha") {
        window.CBO.areaSelection?.selectLayerAlpha?.(contextMenuLayerId, {
          source: "layers-panel-select-alpha-commit",
        });
        closeLayerContextMenu();
        return;
      }

      closeLayerContextMenu();
    });

    document.body.appendChild(layerContextMenu);

    return layerContextMenu;
  }

  function closeLayerContextMenu() {
    if (!layerContextMenu) {
      return;
    }

    layerContextMenu.hidden = true;
    contextMenuLayerId = "";
  }

  function positionLayerContextMenu(menu, clientX, clientY) {
    menu.hidden = false;
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    const rect = menu.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(clientX, window.innerWidth - rect.width - gap);
    const top = Math.min(clientY, window.innerHeight - rect.height - gap);

    menu.style.left = `${Math.max(gap, left)}px`;
    menu.style.top = `${Math.max(gap, top)}px`;
  }

  function openLayerContextMenu(row, event) {
    if (!isReferenceableLayerRow(row)) {
      closeLayerContextMenu();
      return;
    }

    const menu = ensureLayerContextMenu();
    const referenceButton = menu.querySelector("[data-layer-context-action='reference']");
    const clippingButton = menu.querySelector("[data-layer-context-action='clipping-mask']");
    const mergeDownButton = menu.querySelector("[data-layer-context-action='merge-down']");
    const mergeSelectedButton = menu.querySelector("[data-layer-context-action='merge-selected']");
    const selectAlphaButton = menu.querySelector("[data-layer-context-action='select-alpha']");
    const layerId = getLayerId(row);
    const layer = layerModel?.findEntryById?.(layerId);
    const isReference = layerId && getReferenceLayerId() === layerId;
    const isClipping = layer?.clippingMask === true;
    const canClip = layer?.locked !== true && (isClippingMaskAllowed(layerId) || isClipping);
    const canSelectAlpha = typeof window.CBO.areaSelection?.selectLayerAlpha === "function" &&
      window.CBO.areaSelection?.canSelectLayerAlpha?.(layerId) !== false;
    const selectedLayerIds = getSelectedContentLayerIds();
    const canMergeDown = window.CBO.getDocumentLayerMergeDownPlan?.(layerId)?.ok === true;
    const canMergeSelected = selectedLayerIds.length > 1 &&
      row.classList.contains("selected") &&
      window.CBO.getDocumentLayerMergePlan?.(selectedLayerIds)?.ok === true;

    contextMenuLayerId = layerId;
    referenceButton.textContent = isReference ? "REMOVE REFERENCE" : "SET AS REFERENCE";
    referenceButton.setAttribute("aria-checked", String(isReference));
    if (clippingButton) {
      clippingButton.textContent = isClipping ? "RELEASE CLIPPING MASK" : "CREATE CLIPPING MASK";
      clippingButton.setAttribute("aria-checked", String(isClipping));
      clippingButton.disabled = !canClip;
      clippingButton.classList.toggle("disabled", !canClip);
    }
    if (mergeDownButton) {
      mergeDownButton.textContent = "MERGE DOWN";
      mergeDownButton.disabled = !canMergeDown;
      mergeDownButton.classList.toggle("disabled", !canMergeDown);
    }
    if (mergeSelectedButton) {
      mergeSelectedButton.textContent = "MERGE SELECTED";
      mergeSelectedButton.disabled = !canMergeSelected;
      mergeSelectedButton.classList.toggle("disabled", !canMergeSelected);
    }
    if (selectAlphaButton) {
      selectAlphaButton.textContent = "SELECT ALPHA";
      selectAlphaButton.disabled = !canSelectAlpha;
      selectAlphaButton.classList.toggle("disabled", !canSelectAlpha);
    }
    positionLayerContextMenu(menu, event.clientX, event.clientY);
  }

  function handleArtboardSelectionChange(event) {
    if (!isArtboardSelectionEnabled()) {
      clearArtboardGroupActivation();
      return;
    }

    const artboardId = event.detail?.artboardId || event.detail?.artboard?.id;
    const groupId = getArtboardLayerGroupId(artboardId);

    if (!artboardId) {
      clearArtboardGroupActivation();
      return;
    }

    selectedArtboardGroupId = groupId;
    applyArtboardGroupActivationById(groupId, { preserveMissing: true });
  }

  panel.innerHTML = `
    <div class="layers-list" role="listbox" aria-label="Layers" aria-multiselectable="true"></div>
  `;

  layerModel?.addEventListener?.("change", () => {
    if (isRenderingLayerModel || isSyncingLayerModelFromDom || isEnsuringArtboardLayerGroups) {
      return;
    }

    renderLayerModel();
  });

  window.addEventListener("cbo:editor-canvas-ready", () => ensureArtboardLayerGroups("editor-canvas-ready-artboards"));
  window.addEventListener("cbo:document-artboards-change", () => ensureArtboardLayerGroups("document-artboard-layer-groups"));
  window.addEventListener("cbo:artboard-preview-change", () => ensureArtboardLayerGroups("artboard-preview-layer-groups"));
  window.addEventListener("cbo:artboard-selection-change", handleArtboardSelectionChange);
  renderLayerModel();
  window.addEventListener("cbo:color-fill-reference-change", syncReferenceLayerUi);

  addLayerButton?.addEventListener("click", addPaintLayer);
  copyLayerButton?.addEventListener("click", copySelectedLayers);
  mergeLayerButton?.addEventListener("click", mergeLayersFromHeaderButton);
  addGroupButton?.addEventListener("click", addGroup);

  document.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (!isDeleteShortcut(event)) {
      return;
    }

    if (!getSelectedRootEntries().length && selectedArtboardGroupId && deleteSelectedArtboardGroup()) {
      event.preventDefault();
      return;
    }

    if (!getSelectedRootEntries().length) {
      return;
    }

    event.preventDefault();
    deleteSelectedLayers();
  });

  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

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

    if (isArtboardGroupRow(row)) {
      return;
    }

    const isTouchPointer = isTouchLayerPointer(event);
    const isTouchDragHandle = isTouchPointer && isLayerTouchDragHandleTarget(target);

    if (isTouchPointer) {
      selectLayerFromPointer(row, event);

      if (!isTouchDragHandle) {
        beginLayerLongPress(row, event);
        return;
      }

      event.preventDefault();
    }

    startLayerDrag(row, event);
  });

  panel.addEventListener("pointermove", (event) => {
    updateLayerLongPress(event);
    updateLayerDrag(event);
  });
  panel.addEventListener("pointerup", (event) => {
    stopLayerLongPress(event);
    stopLayerDrag(event);
  });
  panel.addEventListener("pointercancel", (event) => {
    stopLayerLongPress(event);
    stopLayerDrag(event);
  });
  panel.addEventListener("contextmenu", (event) => {
    const target = event.target;
    const row = target instanceof Element ? target.closest("[data-layer-row]") : null;

    if (!row || !panel.contains(row)) {
      closeLayerContextMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openLayerContextMenu(row, event);
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      layerContextMenu &&
      !layerContextMenu.hidden &&
      event.target instanceof Node &&
      !layerContextMenu.contains(event.target)
    ) {
      closeLayerContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLayerContextMenu();
    }
  });

  window.addEventListener("resize", closeLayerContextMenu);
  panel.closest(".drawer-content")?.addEventListener("scroll", closeLayerContextMenu);

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

    if (consumeSuppressedLayerClick(event)) {
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

    if (isArtboardGroupRow(row)) {
      selectArtboardGroupRow(row, {
        source: "layers-panel-artboard-click",
      });
      return;
    }

    if (lockButton) {
      if (isBackgroundRow(row)) {
        return;
      }

      const isLocked = row.classList.toggle("locked");

      if (isLocked) {
        setLayerBranchSelected(row, false);
        setFocusedLayer(getFirstSelectedLayer());
        rangeAnchor = focusedLayer;
      }

      lockButton.setAttribute("aria-pressed", String(isLocked));
      lockButton.setAttribute("aria-label", isLocked ? "Unlock layer" : "Lock layer");
      syncLayerModelFromDom("lock");
      return;
    }

    if (visibilityButton) {
      const isHidden = row.classList.toggle("hidden-layer");
      visibilityButton.setAttribute("aria-pressed", String(!isHidden));
      visibilityButton.setAttribute("aria-label", isHidden ? "Show layer" : "Hide layer");
      syncLayerModelFromDom("visibility");
      return;
    }

    selectLayerFromPointer(row, event);
  });
};
