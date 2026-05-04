const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentHistory() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-history.js"),
    "utf8",
  );
  const listeners = new Map();
  const window = {
    CBO: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init?.detail;
      }
    },
    Date,
    EventTarget,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    WeakMap,
    console,
    queueMicrotask,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO.DocumentHistory;
}

test("push accepts an entry, then undo and redo move it between stacks", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory({ maxEntries: 40 });
  const calls = [];

  history.push({
    type: "custom",
    undo() {
      calls.push("undo");
      return true;
    },
    redo() {
      calls.push("redo");
      return true;
    },
    destroy() {
      calls.push("destroy");
    },
  });

  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);

  assert.equal(history.undo(), true);
  assert.deepEqual(calls, ["undo"]);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);

  assert.equal(history.redo(), true);
  assert.deepEqual(calls, ["undo", "redo"]);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);
});

test("push rejects invalid entries and destroys them", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let destroyed = false;

  const success = history.push({
    destroy() {
      destroyed = true;
    },
  });

  assert.equal(success, false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(destroyed, true);
});

test("new pushes destroy redo stack after an undo", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let destroyed = false;

  history.push({ id: "entry-1", undo: () => true, redo: () => true });
  history.push({
    id: "entry-2",
    undo: () => true,
    redo: () => true,
    destroy: () => {
      destroyed = true;
    },
  });
  history.undo();
  history.push({ id: "entry-3", undo: () => true, redo: () => true });

  assert.equal(history.undoStack.length, 2);
  assert.equal(history.redoStack.length, 0);
  assert.equal(history.undoStack[0].id, "entry-1");
  assert.equal(history.undoStack[1].id, "entry-3");
  assert.equal(destroyed, true);
});

test("maxEntries destroys the oldest entry", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory({ maxEntries: 2 });
  const destroyed = [];

  for (let index = 1; index <= 3; index += 1) {
    history.push({
      type: "custom",
      id: index,
      undo: () => true,
      redo: () => true,
      destroy: () => destroyed.push(index),
    });
  }

  assert.deepEqual(destroyed, [1]);
  assert.equal(history.undoStack.length, 2);
  assert.equal(history.undoStack[0].id, 2);
  assert.equal(history.undoStack[1].id, 3);
});

test("raster history default budget is 500 MiB", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();

  assert.equal(history.getRasterHistoryBudgetMiB(), 500);
});

test("raster history budget destroys the oldest raster entries by byte size", () => {
  const DocumentHistory = loadDocumentHistory();
  const mib = 1024 * 1024;
  const history = new DocumentHistory({ maxEntries: 40, maxRasterHistoryBytes: 2 * mib });
  const destroyed = [];
  const createRasterEntry = (id) => ({
    id,
    before: {
      rect: { width: 512, height: 512 },
      texture: {},
    },
    redo: () => true,
    undo: () => true,
    destroy: () => destroyed.push(id),
  });

  history.push(createRasterEntry("raster-1"));
  history.push(createRasterEntry("raster-2"));
  history.push(createRasterEntry("raster-3"));

  assert.deepEqual(destroyed, ["raster-1"]);
  assert.deepEqual(Array.from(history.undoStack, (entry) => entry.id), ["raster-2", "raster-3"]);
  assert.equal(history.getRasterHistoryBytes(), 2 * mib);
});

test("raster history budget keeps metadata-only entries while trimming raster bytes", () => {
  const DocumentHistory = loadDocumentHistory();
  const mib = 1024 * 1024;
  const history = new DocumentHistory({ maxEntries: 40, maxRasterHistoryBytes: mib });
  const destroyed = [];
  const createRasterEntry = (id) => ({
    id,
    before: {
      rect: { width: 512, height: 512 },
      texture: {},
    },
    redo: () => true,
    undo: () => true,
    destroy: () => destroyed.push(id),
  });

  history.push({
    id: "metadata",
    redo: () => true,
    undo: () => true,
    destroy: () => destroyed.push("metadata"),
  });
  history.push(createRasterEntry("raster-1"));
  history.push(createRasterEntry("raster-2"));

  assert.deepEqual(destroyed, ["raster-1"]);
  assert.deepEqual(Array.from(history.undoStack, (entry) => entry.id), ["metadata", "raster-2"]);
  assert.equal(history.getRasterHistoryBytes(), mib);
});

test("raster history budget can be changed in MiB", () => {
  const DocumentHistory = loadDocumentHistory();
  const mib = 1024 * 1024;
  const history = new DocumentHistory({ maxEntries: 40, maxRasterHistoryMiB: 4 });
  const destroyed = [];

  history.push({
    id: "large-raster-1",
    before: {
      rect: { width: 512, height: 512 },
      texture: {},
    },
    redo: () => true,
    undo: () => true,
    destroy: () => destroyed.push("large-raster-1"),
  });
  history.push({
    id: "large-raster-2",
    before: {
      rect: { width: 512, height: 512 },
      texture: {},
    },
    redo: () => true,
    undo: () => true,
    destroy: () => destroyed.push("large-raster-2"),
  });

  const result = history.setRasterHistoryBudgetMiB(1);

  assert.equal(history.getRasterHistoryBudgetBytes(), mib);
  assert.deepEqual(destroyed, ["large-raster-1"]);
  assert.deepEqual(Array.from(history.undoStack, (entry) => entry.id), ["large-raster-2"]);
  assert.equal(result.afterBytes, mib);
});

test("undo failures destroy the entry instead of moving it to redo", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let destroyed = false;

  history.push({
    undo: () => false,
    redo: () => true,
    destroy: () => {
      destroyed = true;
    },
  });

  assert.equal(history.undo(), false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 0);
  assert.equal(destroyed, true);
});

test("redo failures destroy the entry instead of moving it to undo", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let destroyed = false;

  history.push({
    undo: () => true,
    redo: () => false,
    destroy: () => {
      destroyed = true;
    },
  });

  assert.equal(history.undo(), true);
  assert.equal(history.redo(), false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 0);
  assert.equal(destroyed, true);
});

test("layer-state entries with the same historyGroup merge into one undo", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory({ groupIdleMs: 1000 });
  const mockLayerModel = { getEntries: () => [] };

  const entry1 = history.createLayerStateEntry(
    mockLayerModel,
    { entries: ["A"], activeLayerId: "1" },
    { entries: ["A", "B"], activeLayerId: "1" },
    { historyGroup: "text-edit-1" },
  );
  const entry2 = history.createLayerStateEntry(
    mockLayerModel,
    { entries: ["A", "B"], activeLayerId: "1" },
    { entries: ["A", "B", "C"], activeLayerId: "1" },
    { historyGroup: "text-edit-1" },
  );

  history.push(entry1);
  history.push(entry2);

  assert.equal(history.undoStack.length, 1);
  assert.deepEqual(history.undoStack[0].beforeEntries, ["A"]);
  assert.deepEqual(history.undoStack[0].afterEntries, ["A", "B", "C"]);
});

test("runWithoutRecording prevents pushes during restore", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let pushedAttempt = true;

  history.push({
    undo: () => {
      pushedAttempt = history.push({ undo: () => true, redo: () => true });
      return true;
    },
    redo: () => true,
  });

  history.undo();
  assert.equal(pushedAttempt, false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);
});

test("destroyEntry is idempotent", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();
  let destroyCount = 0;
  const entry = {
    undo: () => true,
    redo: () => true,
    destroy: () => {
      destroyCount += 1;
    },
  };

  history.destroyEntry(entry);
  history.destroyEntry(entry);

  assert.equal(destroyCount, 1);
});

test("beginGroup and endGroup keep nested continuous edits active until the final end", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory();

  history.beginGroup("text-content-1");
  history.beginGroup("text-content-1");
  history.endGroup("text-content-1");

  assert.equal(history.activeGroups.has("text-content-1"), true);

  history.endGroup("text-content-1");

  assert.equal(history.activeGroups.has("text-content-1"), false);
});

test("history action dispatches a before hook before undo or redo", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-history.js"),
    "utf8",
  );

  assert.match(source, /new CustomEvent\("cbo:before-history-action"/);
  assert.match(source, /detail: \{ action \}/);
});
