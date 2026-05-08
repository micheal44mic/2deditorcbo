(function registerDocumentHistory(namespace) {
  const DEFAULT_MAX_HISTORY_ENTRIES = 40;
  const DEFAULT_GROUP_IDLE_MS = 700;
  const BYTES_PER_PIXEL = 4;
  const MIB = 1024 * 1024;
  const DEFAULT_MAX_RASTER_HISTORY_BYTES = 320 * MIB;
  const DEFAULT_MAX_RASTER_HISTORY_GPU_HOT_BYTES = 192 * MIB;
  const DEFAULT_MIN_RASTER_HISTORY_GPU_HOT_ENTRIES = 6;
  const HISTORY_CHANGE_EVENT = "cbo:history-change";

  function isObject(value) {
    return Boolean(value && typeof value === "object");
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function statesAreEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  function warnHistoryError(message, error) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(message, error);
    }
  }

  function toFinitePositiveNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function getRectBytes(rect) {
    if (!isObject(rect)) {
      return 0;
    }

    const width = Math.max(0, Math.round(Number(rect.width) || 0));
    const height = Math.max(0, Math.round(Number(rect.height) || 0));

    return width * height * BYTES_PER_PIXEL;
  }

  function normalizeRasterHistoryBudgetBytes(options = {}) {
    const explicitBytes = toFinitePositiveNumber(
      options.maxRasterHistoryBytes ?? options.rasterHistoryBudgetBytes,
      0,
    );

    if (explicitBytes > 0) {
      return Math.floor(explicitBytes);
    }

    const explicitMiB = toFinitePositiveNumber(
      options.maxRasterHistoryMiB ?? options.rasterHistoryBudgetMiB,
      0,
    );

    if (explicitMiB > 0) {
      return Math.floor(explicitMiB * MIB);
    }

    return DEFAULT_MAX_RASTER_HISTORY_BYTES;
  }

  function normalizeRasterHistoryGpuHotBudgetBytes(options = {}) {
    const rawBytes = options.maxRasterHistoryGpuHotBytes ?? options.rasterHistoryGpuHotBudgetBytes;

    if (rawBytes != null) {
      const explicitBytes = Number(rawBytes);

      if (Number.isFinite(explicitBytes) && explicitBytes >= 0) {
        return Math.floor(explicitBytes);
      }
    }

    const rawMiB = options.maxRasterHistoryGpuHotMiB ?? options.rasterHistoryGpuHotBudgetMiB;

    if (rawMiB != null) {
      const explicitMiB = Number(rawMiB);

      if (Number.isFinite(explicitMiB) && explicitMiB >= 0) {
        return Math.floor(explicitMiB * MIB);
      }
    }

    return DEFAULT_MAX_RASTER_HISTORY_GPU_HOT_BYTES;
  }

  class DocumentHistory extends EventTarget {
    constructor(options = {}) {
      super();

      this.maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
        ? Math.floor(options.maxEntries)
        : DEFAULT_MAX_HISTORY_ENTRIES;
      this.groupIdleMs = Number.isFinite(options.groupIdleMs) && options.groupIdleMs >= 0
        ? Math.floor(options.groupIdleMs)
        : DEFAULT_GROUP_IDLE_MS;
      this.maxRasterHistoryBytes = normalizeRasterHistoryBudgetBytes(options);
      this.maxRasterHistoryGpuHotBytes = normalizeRasterHistoryGpuHotBudgetBytes(options);
      this.minRasterHistoryGpuHotEntries = Number.isFinite(options.minRasterHistoryGpuHotEntries)
        ? Math.max(0, Math.floor(options.minRasterHistoryGpuHotEntries))
        : DEFAULT_MIN_RASTER_HISTORY_GPU_HOT_ENTRIES;
      this.undoStack = [];
      this.redoStack = [];
      this.activeGroups = new Map();
      this.pendingLayerStates = new WeakMap();
      this.isRestoring = false;
      this.isDisposed = false;
      this.lastRasterBudgetPrune = null;
      this.lastRasterGpuHotPrune = null;
      this.handleHistoryAction = this.handleHistoryAction.bind(this);

      window.addEventListener("cbo:history-action", this.handleHistoryAction);
      this.emitChange("init");
    }

    handleHistoryAction(event) {
      const action = String(event.detail?.action || "").toLowerCase();
      const beforeDispatched = event.detail?.beforeDispatched === true;

      if (!beforeDispatched) {
        window.dispatchEvent(new CustomEvent("cbo:before-history-action", {
          detail: { action },
        }));
      }

      if (action === "undo") {
        this.undo();
      } else if (action === "redo") {
        this.redo();
      }
    }

    beginGroup(groupId) {
      const key = String(groupId || "").trim();

      if (key) {
        this.activeGroups.set(key, (this.activeGroups.get(key) || 0) + 1);
      }
    }

    endGroup(groupId) {
      const key = String(groupId || "").trim();

      if (key) {
        const count = (this.activeGroups.get(key) || 0) - 1;

        if (count > 0) {
          this.activeGroups.set(key, count);
        } else {
          this.activeGroups.delete(key);
        }
      }
    }

    canRecord(options = {}) {
      if (this.isDisposed || this.isRestoring) {
        return false;
      }

      if (options.recordHistory === false || options.history === false) {
        return false;
      }

      return true;
    }

    runWithoutRecording(callback) {
      if (typeof callback !== "function") {
        return undefined;
      }

      const wasRestoring = this.isRestoring;

      this.isRestoring = true;

      try {
        return callback();
      } finally {
        this.isRestoring = wasRestoring;
      }
    }

    normalizeEntry(entry, options = {}) {
      if (!isObject(entry) || typeof entry.undo !== "function" || typeof entry.redo !== "function") {
        return null;
      }

      entry.type = entry.type || "custom";
      entry.source = entry.source || options.source || "document-history";
      entry.historyGroup = String(options.historyGroup || entry.historyGroup || "").trim();
      entry.updatedAt = Date.now();

      return entry;
    }

    destroyEntry(entry) {
      if (!entry || entry.destroyed === true) {
        return;
      }

      entry.destroyed = true;

      if (typeof entry.destroy === "function") {
        entry.destroy();
      }
    }

    estimateSnapshotBytes(snapshot) {
      if (!isObject(snapshot)) {
        return 0;
      }

      const explicitBytes = toFinitePositiveNumber(
        snapshot.bytes ?? snapshot.byteSize ?? snapshot.gpuBytes ?? snapshot.cpuBytes ?? snapshot.coldBytes,
        0,
      );

      if (explicitBytes > 0) {
        return Math.floor(explicitBytes);
      }

      const cpuPixelsBytes = toFinitePositiveNumber(snapshot.cpuPixels?.byteLength, 0);

      if (cpuPixelsBytes > 0) {
        return Math.floor(cpuPixelsBytes);
      }

      const hasTextureKey = Object.prototype.hasOwnProperty.call(snapshot, "texture");
      const hasFramebufferKey = Object.prototype.hasOwnProperty.call(snapshot, "framebuffer");

      if (
        hasTextureKey &&
        snapshot.texture == null &&
        (!hasFramebufferKey || snapshot.framebuffer == null)
      ) {
        return 0;
      }

      return getRectBytes(snapshot.rect || snapshot.docRect || snapshot.targetRect || snapshot.bbox);
    }

    estimateSnapshotGpuHotBytes(snapshot) {
      if (!isObject(snapshot)) {
        return 0;
      }

      const hasGpuResource = Boolean(snapshot.texture || snapshot.framebuffer);

      if (!hasGpuResource || snapshot.state === "CPU_COLD") {
        return 0;
      }

      return this.estimateSnapshotBytes(snapshot);
    }

    forEachRasterSnapshot(entry, callback) {
      if (!isObject(entry) || typeof callback !== "function") {
        return;
      }

      const seen = new Set();
      const visit = (snapshot, key = "") => {
        if (!isObject(snapshot) || seen.has(snapshot)) {
          return;
        }

        seen.add(snapshot);
        callback(snapshot, key, entry);
      };

      visit(entry.before, "before");
      visit(entry.after, "after");
      visit(entry.beforeSnapshot, "beforeSnapshot");
      visit(entry.afterSnapshot, "afterSnapshot");
      visit(entry.rasterSnapshot, "rasterSnapshot");

      if (isObject(entry.snapshots)) {
        visit(entry.snapshots.before, "snapshots.before");
        visit(entry.snapshots.after, "snapshots.after");
        visit(entry.snapshots.beforeSnapshot, "snapshots.beforeSnapshot");
        visit(entry.snapshots.afterSnapshot, "snapshots.afterSnapshot");
      }

      if (Array.isArray(entry.dabs)) {
        entry.dabs.forEach((dab, index) => {
          visit(dab?.before, `dabs.${index}.before`);
          visit(dab?.after, `dabs.${index}.after`);
        });
      }

      if (Array.isArray(entry.tileDeltas)) {
        entry.tileDeltas.forEach((delta, index) => {
          visit(delta?.before, `tileDeltas.${index}.before`);
          visit(delta?.after, `tileDeltas.${index}.after`);
        });
      }
    }

    estimateRasterEntryBytes(entry) {
      if (!isObject(entry)) {
        return 0;
      }

      let total = 0;

      this.forEachRasterSnapshot(entry, (snapshot) => {
        total += this.estimateSnapshotBytes(snapshot);
      });

      return total;
    }

    estimateRasterEntryGpuHotBytes(entry) {
      if (!isObject(entry)) {
        return 0;
      }

      let total = 0;

      this.forEachRasterSnapshot(entry, (snapshot) => {
        total += this.estimateSnapshotGpuHotBytes(snapshot);
      });

      return total;
    }

    getRasterHistoryBytes() {
      const sumStack = (stack) => Array.isArray(stack)
        ? stack.reduce((sum, entry) => sum + this.estimateRasterEntryBytes(entry), 0)
        : 0;

      return sumStack(this.undoStack) + sumStack(this.redoStack);
    }

    getRasterHistoryGpuHotBytes() {
      const sumStack = (stack) => Array.isArray(stack)
        ? stack.reduce((sum, entry) => sum + this.estimateRasterEntryGpuHotBytes(entry), 0)
        : 0;

      return sumStack(this.undoStack) + sumStack(this.redoStack);
    }

    getRasterHistoryCpuColdBytes() {
      return Math.max(0, this.getRasterHistoryBytes() - this.getRasterHistoryGpuHotBytes());
    }

    getRasterHistoryBudgetBytes() {
      return this.maxRasterHistoryBytes;
    }

    getRasterHistoryBudgetMiB() {
      return this.maxRasterHistoryBytes / MIB;
    }

    setRasterHistoryBudgetBytes(bytes) {
      const nextBytes = Math.max(0, Math.floor(Number(bytes) || 0));

      this.maxRasterHistoryBytes = nextBytes;
      const pruneResult = this.pruneRasterHistoryBudget();
      this.emitChange("history-budget-change");

      return pruneResult;
    }

    setRasterHistoryBudgetMiB(mib) {
      return this.setRasterHistoryBudgetBytes((Number(mib) || 0) * MIB);
    }

    getRasterHistoryGpuHotBudgetBytes() {
      return this.maxRasterHistoryGpuHotBytes;
    }

    getRasterHistoryGpuHotBudgetMiB() {
      return this.maxRasterHistoryGpuHotBytes / MIB;
    }

    setRasterHistoryGpuHotBudgetBytes(bytes) {
      this.maxRasterHistoryGpuHotBytes = Math.max(0, Math.floor(Number(bytes) || 0));
      const pruneResult = this.pruneRasterHistoryGpuHotBudget();
      this.emitChange("history-gpu-hot-budget-change");

      return pruneResult;
    }

    setRasterHistoryGpuHotBudgetMiB(mib) {
      return this.setRasterHistoryGpuHotBudgetBytes((Number(mib) || 0) * MIB);
    }

    getRasterHistoryEntryCount() {
      return this.undoStack.length + this.redoStack.length;
    }

    destroyOldestRasterHistoryEntry() {
      const totalEntries = this.getRasterHistoryEntryCount();

      if (totalEntries <= 1) {
        return null;
      }

      const candidates = [];
      const collectCandidates = (stack, stackName) => {
        if (!Array.isArray(stack)) {
          return;
        }

        stack.forEach((entry, index) => {
          const bytes = this.estimateRasterEntryBytes(entry);

          if (bytes <= 0) {
            return;
          }

          candidates.push({
            bytes,
            entry,
            index,
            stack,
            stackName,
            updatedAt: Number.isFinite(entry?.updatedAt) ? entry.updatedAt : 0,
          });
        });
      };

      collectCandidates(this.undoStack, "undo");
      collectCandidates(this.redoStack, "redo");

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((first, second) => (
        first.updatedAt - second.updatedAt ||
        first.index - second.index
      ));

      const candidate = candidates[0];

      candidate.stack.splice(candidate.index, 1);
      const entry = candidate.entry;
      const bytes = candidate.bytes;

      this.destroyEntry(entry);

      return {
        bytes,
        source: entry?.source || "",
        stack: candidate.stackName,
        type: entry?.type || "",
      };
    }

    pruneRasterHistoryBudget() {
      const budgetBytes = Math.max(0, Math.floor(Number(this.maxRasterHistoryBytes) || 0));
      const beforeBytes = this.getRasterHistoryBytes();
      const dropped = [];

      if (!Number.isFinite(budgetBytes)) {
        return {
          afterBytes: beforeBytes,
          beforeBytes,
          budgetBytes,
          dropped,
        };
      }

      while (this.getRasterHistoryBytes() > budgetBytes) {
        const droppedEntry = this.destroyOldestRasterHistoryEntry();

        if (!droppedEntry) {
          break;
        }

        dropped.push(droppedEntry);
      }

      const afterBytes = this.getRasterHistoryBytes();
      const result = {
        afterBytes,
        beforeBytes,
        budgetBytes,
        dropped,
      };

      this.lastRasterBudgetPrune = result;
      this.pruneRasterHistoryGpuHotBudget();

      return result;
    }

    collectGpuHotSnapshotCandidates(options = {}) {
      const candidates = [];
      const minProtectedEntries = Number.isFinite(Number(options.minProtectedEntries))
        ? Math.max(0, Math.floor(Number(options.minProtectedEntries)))
        : this.minRasterHistoryGpuHotEntries;
      const collectStack = (stack, stackName, protectedFromIndex = Infinity) => {
        if (!Array.isArray(stack)) {
          return;
        }

        stack.forEach((entry, entryIndex) => {
          const isProtected = entryIndex >= protectedFromIndex;

          if (isProtected) {
            return;
          }

          this.forEachRasterSnapshot(entry, (snapshot, key) => {
            const bytes = this.estimateSnapshotGpuHotBytes(snapshot);

            if (bytes <= 0 || typeof snapshot.dehydrateGpu !== "function") {
              return;
            }

            candidates.push({
              bytes,
              entry,
              entryIndex,
              key,
              snapshot,
              stackName,
              updatedAt: Number.isFinite(entry?.updatedAt) ? entry.updatedAt : 0,
            });
          });
        });
      };
      const protectedUndoStart = Math.max(0, this.undoStack.length - minProtectedEntries);
      const protectedRedoStart = Math.max(0, this.redoStack.length - minProtectedEntries);

      collectStack(this.redoStack, "redo", protectedRedoStart);
      collectStack(this.undoStack, "undo", protectedUndoStart);

      candidates.sort((first, second) => (
        first.updatedAt - second.updatedAt ||
        first.entryIndex - second.entryIndex ||
        second.bytes - first.bytes
      ));

      return candidates;
    }

    pruneRasterHistoryGpuHotBudget(options = {}) {
      const requestedBudget = options.budgetBytes ?? options.targetGpuHotBytes ?? this.maxRasterHistoryGpuHotBytes;
      const budgetBytes = Math.max(0, Math.floor(Number(requestedBudget) || 0));
      const minProtectedEntries = Number.isFinite(Number(options.minProtectedEntries))
        ? Math.max(0, Math.floor(Number(options.minProtectedEntries)))
        : this.minRasterHistoryGpuHotEntries;
      const beforeBytes = this.getRasterHistoryGpuHotBytes();
      const cooled = [];

      if (!Number.isFinite(budgetBytes)) {
        return {
          afterBytes: beforeBytes,
          beforeBytes,
          budgetBytes,
          cooled,
          minProtectedEntries,
        };
      }

      const skippedSnapshots = new Set();
      const getCandidates = () => this.collectGpuHotSnapshotCandidates({ minProtectedEntries })
        .filter((candidate) => !skippedSnapshots.has(candidate.snapshot));
      let candidates = getCandidates();

      while (this.getRasterHistoryGpuHotBytes() > budgetBytes && candidates.length > 0) {
        const candidate = candidates.shift();
        const didCool = candidate.snapshot.dehydrateGpu() !== false;

        if (didCool) {
          cooled.push({
            bytes: candidate.bytes,
            key: candidate.key,
            source: candidate.entry?.source || "",
            stack: candidate.stackName,
            type: candidate.entry?.type || "",
          });
        } else {
          skippedSnapshots.add(candidate.snapshot);
        }

        candidates = getCandidates();
      }

      const afterBytes = this.getRasterHistoryGpuHotBytes();
      const result = {
        afterBytes,
        beforeBytes,
        budgetBytes,
        cooled,
        minProtectedEntries,
      };

      this.lastRasterGpuHotPrune = result;

      return result;
    }

    clearStack(stack) {
      if (!Array.isArray(stack)) {
        return;
      }

      while (stack.length > 0) {
        this.destroyEntry(stack.pop());
      }
    }

    clear() {
      this.clearStack(this.undoStack);
      this.clearStack(this.redoStack);
      this.emitChange("clear");
    }

    shouldMergeEntries(previousEntry, nextEntry) {
      if (!previousEntry || !nextEntry || typeof previousEntry.mergeWith !== "function") {
        return false;
      }

      if (!previousEntry.historyGroup || previousEntry.historyGroup !== nextEntry.historyGroup) {
        return false;
      }

      if (previousEntry.type !== nextEntry.type) {
        return false;
      }

      if (this.activeGroups.has(nextEntry.historyGroup)) {
        return true;
      }

      const previousUpdatedAt = Number.isFinite(previousEntry.updatedAt) ? previousEntry.updatedAt : 0;
      const nextUpdatedAt = Number.isFinite(nextEntry.updatedAt) ? nextEntry.updatedAt : Date.now();

      return nextUpdatedAt - previousUpdatedAt <= this.groupIdleMs;
    }

    push(entry, options = {}) {
      if (!this.canRecord(options)) {
        this.destroyEntry(entry);
        return false;
      }

      const nextEntry = this.normalizeEntry(entry, options);

      if (!nextEntry) {
        this.destroyEntry(entry);
        return false;
      }

      const previousEntry = this.undoStack[this.undoStack.length - 1];

      if (this.shouldMergeEntries(previousEntry, nextEntry)) {
        const didMerge = previousEntry.mergeWith(nextEntry) !== false;

        if (didMerge) {
          previousEntry.updatedAt = nextEntry.updatedAt;
          this.destroyEntry(nextEntry);
          this.clearStack(this.redoStack);
          this.pruneRasterHistoryBudget();
          this.emitChange("merge");
          return true;
        }
      }

      this.undoStack.push(nextEntry);
      this.clearStack(this.redoStack);

      while (this.undoStack.length > this.maxEntries) {
        this.destroyEntry(this.undoStack.shift());
      }

      this.pruneRasterHistoryBudget();

      this.emitChange("push");
      return true;
    }

    invokeEntry(entry, methodName) {
      try {
        return entry?.[methodName]?.() !== false;
      } catch (error) {
        warnHistoryError(`Impossibile eseguire history.${methodName}.`, error);
        return false;
      }
    }

    undo() {
      const entry = this.undoStack.pop();

      if (!entry) {
        this.emitChange("undo-empty");
        return false;
      }

      const didUndo = this.runWithoutRecording(() => this.invokeEntry(entry, "undo"));

      if (didUndo) {
        entry.updatedAt = Date.now();
        this.redoStack.push(entry);
        this.pruneRasterHistoryBudget();
      } else {
        this.destroyEntry(entry);
      }

      this.emitChange("undo");
      return didUndo;
    }

    redo() {
      const entry = this.redoStack.pop();

      if (!entry) {
        this.emitChange("redo-empty");
        return false;
      }

      const didRedo = this.runWithoutRecording(() => this.invokeEntry(entry, "redo"));

      if (didRedo) {
        entry.updatedAt = Date.now();
        this.undoStack.push(entry);
        this.pruneRasterHistoryBudget();
      } else {
        this.destroyEntry(entry);
      }

      this.emitChange("redo");
      return didRedo;
    }

    emitChange(source) {
      const detail = {
        canRedo: this.redoStack.length > 0,
        canUndo: this.undoStack.length > 0,
        redoCount: this.redoStack.length,
        rasterHistoryBudgetBytes: this.maxRasterHistoryBytes,
        rasterHistoryBytes: this.getRasterHistoryBytes(),
        rasterHistoryCpuColdBytes: this.getRasterHistoryCpuColdBytes(),
        rasterHistoryGpuHotBudgetBytes: this.maxRasterHistoryGpuHotBytes,
        rasterHistoryGpuHotBytes: this.getRasterHistoryGpuHotBytes(),
        source,
        undoCount: this.undoStack.length,
      };

      this.dispatchEvent(new CustomEvent("change", { detail }));
      window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail }));
    }

    getLayerSnapshot(layerModel) {
      if (!layerModel || typeof layerModel.getEntries !== "function") {
        return null;
      }

      return {
        activeLayerId: layerModel.activeLayerId || null,
        entries: layerModel.getEntries(),
        referenceLayerId: this.getReferenceLayerId(),
      };
    }

    getReferenceLayerId() {
      const colorFill = namespace.colorFill;

      if (typeof colorFill?.getReferenceLayerId === "function") {
        return colorFill.getReferenceLayerId() || null;
      }

      return namespace.colorFillReferenceLayerId || null;
    }

    restoreReferenceLayerId(layerId, options = {}) {
      const nextLayerId = String(layerId || "").trim();
      const colorFill = namespace.colorFill;
      const source = options.source || "history-reference-restore";

      if (typeof colorFill?.setReferenceLayerId === "function") {
        colorFill.setReferenceLayerId(nextLayerId, {
          emit: options.emit,
          history: false,
          source,
        });
        return true;
      }

      namespace.colorFillReferenceLayerId = nextLayerId;
      window.dispatchEvent(new CustomEvent("cbo:color-fill-reference-change", {
        detail: {
          layerId: nextLayerId || null,
          source,
        },
      }));

      return true;
    }

    restoreLayerState(layerModel, state, options = {}) {
      if (!layerModel || !Array.isArray(state?.entries)) {
        return false;
      }

      this.runWithoutRecording(() => {
        layerModel.setEntries(cloneValue(state.entries), {
          history: false,
          source: options.source || "history-layer-restore",
        });
        layerModel.setActiveLayer(state.activeLayerId || null, {
          history: false,
          source: options.source || "history-layer-restore",
        });
        this.restoreReferenceLayerId(state.referenceLayerId || null, {
          source: options.source || "history-layer-restore",
        });
      });

      return true;
    }

    createLayerStateEntry(layerModel, beforeState, afterState, options = {}) {
      if (!beforeState || !afterState || statesAreEqual(beforeState, afterState)) {
        return null;
      }

      const history = this;
      const before = cloneValue(beforeState);
      const after = cloneValue(afterState);

      return {
        type: "layer-state",
        beforeEntries: before.entries,
        afterEntries: after.entries,
        beforeActiveLayerId: before.activeLayerId || null,
        afterActiveLayerId: after.activeLayerId || null,
        beforeReferenceLayerId: before.referenceLayerId || null,
        afterReferenceLayerId: after.referenceLayerId || null,
        historyGroup: options.historyGroup || "",
        source: options.source || "layer-state",
        undo() {
          return history.restoreLayerState(layerModel, {
            activeLayerId: this.beforeActiveLayerId,
            entries: this.beforeEntries,
            referenceLayerId: this.beforeReferenceLayerId,
          }, { source: "history-undo-layer-state" });
        },
        redo() {
          return history.restoreLayerState(layerModel, {
            activeLayerId: this.afterActiveLayerId,
            entries: this.afterEntries,
            referenceLayerId: this.afterReferenceLayerId,
          }, { source: "history-redo-layer-state" });
        },
        mergeWith(nextEntry) {
          if (nextEntry?.type !== "layer-state") {
            return false;
          }

          this.afterEntries = cloneValue(nextEntry.afterEntries);
          this.afterActiveLayerId = nextEntry.afterActiveLayerId || null;
          this.afterReferenceLayerId = nextEntry.afterReferenceLayerId || null;
          return true;
        },
        destroy() {},
      };
    }

    recordReferenceStateChange(beforeLayerId, afterLayerId, options = {}) {
      if (!this.canRecord(options)) {
        return false;
      }

      const before = String(beforeLayerId || "").trim();
      const after = String(afterLayerId || "").trim();

      if (before === after) {
        return false;
      }

      const history = this;

      return this.push({
        type: "reference-layer-state",
        beforeReferenceLayerId: before || null,
        afterReferenceLayerId: after || null,
        historyGroup: options.historyGroup || "",
        source: options.source || "color-fill-reference",
        undo() {
          return history.restoreReferenceLayerId(this.beforeReferenceLayerId, {
            source: "history-undo-reference-layer",
          });
        },
        redo() {
          return history.restoreReferenceLayerId(this.afterReferenceLayerId, {
            source: "history-redo-reference-layer",
          });
        },
        mergeWith(nextEntry) {
          if (nextEntry?.type !== "reference-layer-state") {
            return false;
          }

          this.afterReferenceLayerId = nextEntry.afterReferenceLayerId || null;
          return true;
        },
        destroy() {},
      }, options);
    }

    recordLayerStateChange(layerModel, beforeState, options = {}) {
      if (!this.canRecord(options) || !beforeState) {
        return false;
      }

      const existing = this.pendingLayerStates.get(layerModel);
      const pending = existing || {
        beforeState: cloneValue(beforeState),
        options: { ...options },
        scheduled: false,
      };

      pending.options = {
        ...pending.options,
        ...options,
        historyGroup: options.historyGroup || pending.options.historyGroup || "",
        source: options.source || pending.options.source || "layer-state",
      };

      if (!pending.scheduled) {
        pending.scheduled = true;
        queueMicrotask(() => {
          this.flushLayerState(layerModel);
        });
      }

      this.pendingLayerStates.set(layerModel, pending);
      return true;
    }

    flushLayerState(layerModel) {
      const pending = this.pendingLayerStates.get(layerModel);

      if (!pending) {
        return false;
      }

      this.pendingLayerStates.delete(layerModel);

      if (!this.canRecord(pending.options)) {
        return false;
      }

      const afterState = this.getLayerSnapshot(layerModel);
      const entry = this.createLayerStateEntry(layerModel, pending.beforeState, afterState, pending.options);

      if (!entry) {
        return false;
      }

      return this.push(entry, pending.options);
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      window.removeEventListener("cbo:history-action", this.handleHistoryAction);
      this.clear();
      this.activeGroups.clear();
      this.pendingLayerStates = new WeakMap();
      this.isDisposed = true;
      this.emitChange("dispose");
    }
  }

  namespace.DocumentHistory = DocumentHistory;
})(window.CBO = window.CBO || {});
