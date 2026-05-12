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
  const curvesSource = fs.readFileSync(
    path.join(repoRoot, "js", "curves-engine.js"),
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
    Math,
    Number,
    Object,
    Set,
    String,
    Uint8Array,
    WeakMap,
    console,
    queueMicrotask,
    window,
  });

  vm.runInContext(blendModesSource, context);
  vm.runInContext(curvesSource, context);
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

test("vector text layers start plain black with no shadow or transform", () => {
  const { DocumentLayerModel } = loadDocumentModules();
  const model = new DocumentLayerModel();
  const layer = model.createLayer({ type: "vector-text" });

  assert.equal(layer.text, "CBOs");
  assert.equal(layer.style.fill, "#000000");
  assert.equal(layer.style.stroke, "#000000");
  assert.equal(layer.style.strokeWidth, 0);
  assert.equal(layer.style.shadow.color, "#000000");
  assert.equal(layer.style.shadow.blur, 0);
  assert.equal(layer.style.shadow.opacity, 0);
  assert.equal(layer.shadowAngle, 0);
  assert.equal(layer.shadowDistance, 0);
  assert.equal(layer.warp.type, "none");
  assert.equal(layer.warp.amount, 0);
  assert.equal(layer.envelopeGrid, null);
});

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

test("setEntries can replace a layer and activate the replacement in one change", () => {
  const { DocumentLayerModel } = loadDocumentModules();
  const model = new DocumentLayerModel();
  const emptyPaintLayer = model.createLayer({
    id: "paint-empty",
    name: "Empty Paint",
    type: "paint",
  });
  const textLayer = model.createLayer({
    id: "text-source",
    text: "Rasterize me",
    type: "vector-text",
  });
  const rasterLayer = model.createLayer({
    id: "text-raster",
    name: "Text",
    type: "paint",
  });
  const seenActiveLayerIds = [];

  model.setEntries([emptyPaintLayer, textLayer, ...model.getEntries()], { history: false, source: "seed" });
  model.setActiveLayer(textLayer.id, { history: false, source: "seed" });
  model.addEventListener("change", (event) => {
    seenActiveLayerIds.push(event.detail.activeLayerId);
  });

  model.setEntries([emptyPaintLayer, rasterLayer, ...model.getEntries().filter((entry) =>
    entry.id !== emptyPaintLayer.id && entry.id !== textLayer.id,
  )], {
    activeLayerId: rasterLayer.id,
    history: false,
    source: "vector-text-rasterize",
  });

  assert.deepEqual(seenActiveLayerIds, [rasterLayer.id]);
  assert.equal(model.activeLayerId, rasterLayer.id);
});

test("image layers can be rasterized into paint layers with undo history", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ maxEntries: 40 });
  const model = new DocumentLayerModel();
  const imageLayer = model.createLayer({
    id: "image-1",
    name: "Imported",
    type: "image",
  });
  const retileCalls = [];

  window.CBO.documentHistory = history;
  window.CBO.documentLayerModel = model;
  window.CBO.documentRenderer = {
    requestDraw() {},
    sparsifyRasterizedImageLayer(layerId, options = {}) {
      retileCalls.push({
        emit: options.emit,
        layerId,
        source: options.source,
      });
      return { sparse: true };
    },
  };

  model.setEntries([imageLayer, ...model.getEntries()], {
    history: false,
    source: "test-setup",
  });
  model.setActiveLayer(imageLayer.id, {
    history: false,
    source: "test-setup",
  });

  assert.equal(window.CBO.rasterizeActiveImageLayer(), true);
  await waitForHistoryFlush();

  assert.equal(model.findEntryById(imageLayer.id).type, "paint");
  assert.equal(history.undoStack.length, 1);
  assert.deepEqual(retileCalls, [{
    emit: false,
    layerId: "image-1",
    source: "image-rasterize-retile",
  }]);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById(imageLayer.id).type, "image");

  assert.equal(history.redo(), true);
  assert.equal(model.findEntryById(imageLayer.id).type, "paint");
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
      { type: "field-blur", pins: [{ id: "sharp", blur: 0, x: 10, y: 20 }, { blur: 260, x: 30, y: 40 }], enabled: true },
      { type: "radial-blur", amount: 260, centerX: 125, centerY: -25, mode: "zoom", enabled: true },
      { type: "grain", amount: 140, scale: -20, monochrome: false, seed: 0.25, enabled: true },
      { type: "noise", amount: 140, scale: -20, monochrome: false, seed: 0.5, enabled: true },
      { type: "threshold", threshold: 300, enabled: true },
      { type: "curves", points: { rgb: [{ id: "black", x: 0, y: 16 }, { id: "white", x: 255, y: 240 }] }, enabled: true },
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
  assert.equal(model.findEntryById("paint-main").effects[2].pins[0].id, "sharp");
  assert.equal(model.findEntryById("paint-main").effects[2].pins[0].blur, 0);
  assert.equal(model.findEntryById("paint-main").effects[2].pins[1].blur, 200);
  assert.equal(model.findEntryById("paint-main").effects[3].amount, 200);
  assert.equal(model.findEntryById("paint-main").effects[3].centerX, 100);
  assert.equal(model.findEntryById("paint-main").effects[3].centerY, 0);
  assert.equal(model.findEntryById("paint-main").effects[3].mode, "zoom");
  assert.equal(model.findEntryById("paint-main").effects[4].amount, 100);
  assert.equal(model.findEntryById("paint-main").effects[4].scale, 1);
  assert.equal(model.findEntryById("paint-main").effects[4].monochrome, false);
  assert.equal(model.findEntryById("paint-main").effects[4].seed, 0.25);
  assert.equal(model.findEntryById("paint-main").effects[5].amount, 100);
  assert.equal(model.findEntryById("paint-main").effects[5].scale, 1);
  assert.equal(model.findEntryById("paint-main").effects[5].monochrome, false);
  assert.equal(model.findEntryById("paint-main").effects[5].seed, 0.5);
  assert.equal(model.findEntryById("paint-main").effects[6].threshold, 255);
  assert.equal(model.findEntryById("paint-main").effects[7].type, "curves");
  assert.equal(model.findEntryById("paint-main").effects[7].points.rgb[0].y, 16);
  assert.equal(model.findEntryById("paint-main").effects[8].type, "future-effect");

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

  model.updateLayer("paint-main", {
    effects: [{ type: "field-blur", pins: [{ blur: 0, x: 10, y: 20 }], enabled: true }],
  }, {
    source: "field-blur-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "grain", amount: 0, scale: 42, monochrome: true, seed: 0.25, enabled: true }],
  }, {
    source: "grain-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "noise", amount: 0, scale: 1, monochrome: true, seed: 0.5, enabled: true }],
  }, {
    source: "noise-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "threshold", threshold: 128, enabled: false }],
  }, {
    source: "threshold-clear",
  });

  assert.equal(model.findEntryById("paint-main").effects, undefined);

  model.updateLayer("paint-main", {
    effects: [{ type: "curves", points: { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }, enabled: true }],
  }, {
    source: "curves-clear",
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

test("reference layer changes undo and redo through document history", () => {
  const { DocumentHistory, window } = loadDocumentModules();
  const history = new DocumentHistory();
  const calls = [];
  let referenceLayerId = "";

  window.CBO.colorFill = {
    getReferenceLayerId: () => referenceLayerId,
    setReferenceLayerId(layerId, options = {}) {
      referenceLayerId = String(layerId || "");
      calls.push({ layerId: referenceLayerId, source: options.source });
    },
  };
  window.CBO.documentHistory = history;

  referenceLayerId = "paint-main";
  history.recordReferenceStateChange("", "paint-main", {
    source: "unit-reference",
  });

  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undo(), true);
  assert.equal(referenceLayerId, "");
  assert.equal(calls.at(-1).source, "history-undo-reference-layer");

  assert.equal(history.redo(), true);
  assert.equal(referenceLayerId, "paint-main");
  assert.equal(calls.at(-1).source, "history-redo-reference-layer");
});

test("layer state undo restores the color fill reference when a referenced layer returns", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory();
  const model = new DocumentLayerModel({
    entries: [
      { id: "ref-layer", name: "Reference", type: "paint" },
      { id: "paint-main", name: "Paint", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });
  let referenceLayerId = "ref-layer";

  window.CBO.colorFill = {
    getReferenceLayerId: () => referenceLayerId,
    setReferenceLayerId(layerId) {
      referenceLayerId = String(layerId || "");
    },
  };
  window.CBO.documentHistory = history;

  model.setEntries(model.getEntries().filter((entry) => entry.id !== "ref-layer"), {
    source: "delete-reference-layer",
  });
  referenceLayerId = "";
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 1);
  assert.equal(referenceLayerId, "");

  assert.equal(history.undo(), true);
  assert.ok(model.findEntryById("ref-layer"));
  assert.equal(referenceLayerId, "ref-layer");

  assert.equal(history.redo(), true);
  assert.equal(model.findEntryById("ref-layer"), null);
  assert.equal(referenceLayerId, "");
});

test("clipping mask toggles stay as discrete undo steps", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory({ groupIdleMs: 1000 });
  const model = new DocumentLayerModel({
    entries: [
      { id: "clip", name: "Clip", type: "paint" },
      { id: "base", name: "Base", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  window.CBO.documentHistory = history;

  model.updateLayer("clip", { clippingMask: true }, {
    source: "layers-panel-clipping-mask",
  });
  await waitForHistoryFlush();

  model.updateLayer("clip", { clippingMask: false }, {
    source: "layers-panel-clipping-mask",
  });
  await waitForHistoryFlush();

  assert.equal(history.undoStack.length, 2);
  assert.equal(model.findEntryById("clip").clippingMask, false);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById("clip").clippingMask, true);

  assert.equal(history.undo(), true);
  assert.equal(model.findEntryById("clip").clippingMask, false);
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

test("setActiveLayer skips unchanged selections and marks active-only changes", () => {
  const { DocumentLayerModel } = loadDocumentModules();
  const model = new DocumentLayerModel();
  const paintLayer = model.createLayer({
    id: "paint-extra",
    name: "Paint Extra",
    type: "paint",
  });
  const changes = [];

  model.setEntries([paintLayer, ...model.getEntries()], { history: false, source: "seed" });
  model.addEventListener("change", (event) => {
    changes.push({
      activeLayerId: event.detail.activeLayerId,
      changeType: event.detail.changeType,
      previousActiveLayerId: event.detail.previousActiveLayerId,
      source: event.detail.source,
    });
  });

  assert.equal(model.setActiveLayer("paint-extra", { source: "selection-tool" }), true);
  assert.equal(model.setActiveLayer("paint-extra", { source: "selection-tool" }), false);
  assert.deepEqual(changes, [{
    activeLayerId: "paint-extra",
    changeType: "active-layer",
    previousActiveLayerId: "paint-main",
    source: "selection-tool",
  }]);
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

test("ensureActivePaintLayer without an active layer inserts above everything", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentModules();
  const history = new DocumentHistory();
  const model = new DocumentLayerModel();
  const topLayer = model.createLayer({
    id: "top-image",
    name: "Top Image",
    type: "image",
  });

  window.CBO.documentHistory = history;
  model.setEntries([topLayer, ...model.getEntries()], { history: false, source: "seed" });
  model.setActiveLayer(null, { history: false, source: "seed" });

  const paintLayer = model.ensureActivePaintLayer({ source: "brush-stroke" });
  await waitForHistoryFlush();

  const entries = model.getEntries();

  assert.equal(entries[0].id, paintLayer.id);
  assert.equal(entries[1].id, topLayer.id);
  assert.equal(model.activeLayerId, paintLayer.id);
  assert.equal(history.undoStack.length, 1);
});
