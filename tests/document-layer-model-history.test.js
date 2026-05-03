const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentModules() {
  const historySource = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-history.js"),
    "utf8",
  );
  const blendModesSource = fs.readFileSync(
    path.join(repoRoot, "js", "blend-modes.js"),
    "utf8",
  );
  const layerModelSource = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-layer-model.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Date,
    Event,
    EventTarget,
    JSON,
    Map,
    Number,
    Object,
    Set,
    String,
    WeakMap,
    console,
    queueMicrotask,
    window,
  });

  vm.runInContext(blendModesSource, context);
  vm.runInContext(historySource, context);
  vm.runInContext(layerModelSource, context);

  return {
    DocumentHistory: context.window.CBO.DocumentHistory,
    DocumentLayerModel: context.window.CBO.DocumentLayerModel,
    window: context.window,
  };
}

function waitForHistoryFlush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

test("setEntries and setActiveLayer are batched into one layer-state entry", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ maxEntries: 40 });
  const model = new DocumentLayerModel();
  const textLayer = model.createLayer({
    id: "text-1",
    text: "Hello",
    type: "vector-text",
  });

  window.CBO.documentHistory = history;
  model.setEntries([textLayer, ...model.getEntries()], { source: "vector-text-create" });
  model.setActiveLayer(textLayer.id, { source: "vector-text-create" });

  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].type, "layer-state");
  assert.equal(history.undoStack[0].afterActiveLayerId, textLayer.id);
  assert.ok(model.findEntryById(textLayer.id));

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById(textLayer.id), null);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);

  assert.equal(history.redo(), true);
  assert.ok(model.findEntryById(textLayer.id));
  assert.equal(model.activeLayerId, textLayer.id);
});

test("updateLayer entries with the same historyGroup merge", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ groupIdleMs: 1000 });
  const model = new DocumentLayerModel();

  window.CBO.documentHistory = history;
  model.updateLayer("paint-main", { name: "Paint A" }, {
    historyGroup: "paint-name-edit",
    source: "test-name",
  });
  await waitForHistoryFlush();

  model.updateLayer("paint-main", { name: "Paint B" }, {
    historyGroup: "paint-name-edit",
    source: "test-name",
  });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].beforeEntries[0].name, "Paint");
  assert.equal(history.undoStack[0].afterEntries[0].name, "Paint B");

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById("paint-main").name, "Paint");
});

test("layer effects are normalized and preserved through layer state history", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ groupIdleMs: 1000 });
  const model = new DocumentLayerModel();

  window.CBO.documentHistory = history;
  model.updateLayer("paint-main", {
    effects: [
      { type: "gaussian-blur", radius: 240, enabled: true },
      { type: "motion-blur", distance: 340, angle: -45, enabled: true },
      { type: "radial-blur", amount: 260, centerX: 125, centerY: -25, mode: "zoom", enabled: true },
      { type: "future-effect", strength: 0.5 },
    ],
  }, {
    historyGroup: "gaussian-blur-paint-main",
    source: "gaussian-blur",
  });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(model.findEntryById("paint-main").effects[0].radius, 200);
  assert.equal(model.findEntryById("paint-main").effects[1].distance, 300);
  assert.equal(model.findEntryById("paint-main").effects[1].angle, 315);
  assert.equal(model.findEntryById("paint-main").effects[2].amount, 200);
  assert.equal(model.findEntryById("paint-main").effects[2].centerX, 100);
  assert.equal(model.findEntryById("paint-main").effects[2].centerY, 0);
  assert.equal(model.findEntryById("paint-main").effects[2].mode, "zoom");
  assert.equal(model.findEntryById("paint-main").effects[3].type, "future-effect");

  model.updateLayer("paint-main", {
    effects: [{ type: "gaussian-blur", radius: 12, enabled: true }],
  }, {
    historyGroup: "gaussian-blur-paint-main",
    source: "gaussian-blur",
  });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(model.findEntryById("paint-main").effects[0].radius, 12);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById("paint-main").effects, undefined);

  assert.equal(history.redo(), true);
  assert.equal(model.findEntryById("paint-main").effects[0].radius, 12);

  model.updateLayer("paint-main", {
    effects: [{ type: "gaussian-blur", radius: 0, enabled: true }],
  }, {
    source: "gaussian-blur-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "motion-blur", distance: 0, angle: 90, enabled: true }],
  }, {
    source: "motion-blur-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "radial-blur", amount: 0, centerX: 50, centerY: 50, enabled: true }],
  }, {
    source: "radial-blur-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);
});

test("layer opacity and blend mode changes are preserved through layer state history", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ groupIdleMs: 1000 });
  const model = new DocumentLayerModel();

  window.CBO.documentHistory = history;
  model.updateLayer("paint-main", {
    blendMode: "multiply",
    opacity: 0.46,
  }, {
    historyGroup: "layer-sidebar-paint-main",
    source: "layer-sidebar",
  });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(model.findEntryById("paint-main").blendMode, "multiply");
  assert.equal(model.findEntryById("paint-main").opacity, 0.46);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById("paint-main").blendMode, "normal");
  assert.equal(model.findEntryById("paint-main").opacity, 1);

  assert.equal(history.redo(), true);
  assert.equal(model.findEntryById("paint-main").blendMode, "multiply");
  assert.equal(model.findEntryById("paint-main").opacity, 0.46);
});

test("setActiveLayer does not record selection-only changes by default", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory();
  const model = new DocumentLayerModel();
  const paintLayer = model.createLayer({
    id: "paint-extra",
    name: "Paint Extra",
    type: "paint",
  });

  window.CBO.documentHistory = history;
  model.setEntries([paintLayer, ...model.getEntries()], { history: false, source: "seed" });
  model.setActiveLayer("paint-extra", { source: "selection-only" });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 0);
  assert.equal(model.activeLayerId, "paint-extra");
});

test("ensureActivePaintLayer records automatic paint layer creation", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory();
  const model = new DocumentLayerModel();
  const textLayer = model.createLayer({
    id: "text-active",
    text: "Draw here",
    type: "vector-text",
  });

  window.CBO.documentHistory = history;
  model.setEntries([textLayer, ...model.getEntries()], { history: false, source: "seed" });
  model.setActiveLayer(textLayer.id, { history: false, source: "seed" });

  const paintLayer = model.ensureActivePaintLayer({ source: "brush-stroke" });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(paintLayer.type, "paint");
  assert.equal(model.activeLayerId, paintLayer.id);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById(paintLayer.id), null);
  assert.equal(model.activeLayerId, textLayer.id);
});
