const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentMergeModules() {
  const sources = [
    path.join(repoRoot, "js", "blend-modes.js"),
    path.join(repoRoot, "js", "curves-engine.js"),
    path.join(repoRoot, "js", "document", "document-history.js"),
    path.join(repoRoot, "js", "document", "document-layer-model.js"),
    path.join(repoRoot, "js", "document", "document-layer-merge.js"),
  ].map((filePath) => fs.readFileSync(filePath, "utf8"));
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
    Error,
    Event,
    EventTarget,
    Float32Array,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    Uint8Array,
    WeakMap,
    console,
    queueMicrotask,
    window,
  });

  sources.forEach((source) => vm.runInContext(source, context));

  return {
    DocumentHistory: context.window.CBO.DocumentHistory,
    DocumentLayerModel: context.window.CBO.DocumentLayerModel,
    window: context.window,
  };
}

function createMockRenderer() {
  const calls = [];
  const renderer = {
    calls,
    height: 512,
    rasterTargetsByLayerId: new Map(),
    width: 512,
    clearLayer(layerId, options = {}) {
      calls.push(["clear", layerId, options.source, options.releaseRaster]);
      this.rasterTargetsByLayerId.delete(layerId);
      return true;
    },
    commitVisualDirtyChange(detail = {}) {
      calls.push(["dirty", detail.layerId, detail.source, detail.usePreviewDirtyTiles]);
    },
    createRasterSnapshot(layerId, rect, label) {
      calls.push(["snapshot", layerId, label]);
      return {
        framebuffer: {},
        label,
        layerId,
        rect: rect ? { ...rect } : null,
        texture: {},
      };
    },
    createRasterTargetForUnclampedRect(rect, clearColor, padding, options = {}) {
      calls.push(["create-target", options.layerId, rect.width, rect.height]);
      return {
        framebuffer: {},
        height: rect.height,
        layerId: options.layerId,
        texture: {},
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    },
    createSparseRasterTarget(layerId) {
      return {
        layerId,
        sparse: true,
        tileSize: 256,
        tiles: new Map(),
      };
    },
    deleteRasterSnapshot(snapshot) {
      calls.push(["delete-snapshot", snapshot?.label]);
    },
    deleteRasterTarget(layerId, options = {}) {
      calls.push(["delete-target", layerId, options.source]);
      this.rasterTargetsByLayerId.delete(layerId);
      return true;
    },
    deleteRasterTargetObject(target) {
      calls.push(["delete-object", target?.layerId]);
    },
    getClampedDocumentRect(rect) {
      return rect ? { ...rect } : null;
    },
    getRasterRectBytes(rect) {
      return Math.max(1, rect.width) * Math.max(1, rect.height) * 4;
    },
    getRasterTargetDocumentRect(target) {
      return {
        height: target.height || 1,
        width: target.width || 1,
        x: target.x || 0,
        y: target.y || 0,
      };
    },
    hasRenderableRasterTarget(target) {
      return Boolean(target && (target.texture || target.sparse === true));
    },
    installRasterTargetForLayer(layerId, target) {
      calls.push(["install", layerId]);
      this.rasterTargetsByLayerId.set(layerId, target);
      return true;
    },
    isSparseRasterTarget(target) {
      return target?.sparse === true;
    },
    pruneOrphanRasterTargets() {
      calls.push(["prune"]);
    },
    replaceRasterTarget(layerId, target, options = {}) {
      calls.push(["replace", layerId, options.source]);
      this.rasterTargetsByLayerId.set(layerId, target);
      return true;
    },
    requestDraw() {
      calls.push(["draw"]);
    },
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(["restore", layerId, snapshot?.label, options.source, options.preferSparse]);
      this.rasterTargetsByLayerId.set(layerId, {
        framebuffer: {},
        height: snapshot?.rect?.height || 1,
        layerId,
        texture: {},
        width: snapshot?.rect?.width || 1,
        x: snapshot?.rect?.x || 0,
        y: snapshot?.rect?.y || 0,
      });
      return true;
    },
    sparsifyRasterTarget(layerId, target, options = {}) {
      calls.push(["sparsify", layerId, options.source, options.pruneTransparentTiles]);
      const sparse = {
        layerId,
        sparse: true,
        tileSize: options.tileSize || 256,
        tiles: new Map([["0:0", target]]),
      };
      this.rasterTargetsByLayerId.set(layerId, sparse);
      return sparse;
    },
    syncActivePaintLayerReference() {
      calls.push(["sync-active"]);
    },
  };

  return renderer;
}

test("merge down keeps the lower layer id, retile output, and records undo/redo snapshots", async () => {
  const { DocumentHistory, DocumentLayerModel, window } = loadDocumentMergeModules();
  const history = new DocumentHistory({ maxEntries: 20 });
  const model = new DocumentLayerModel();
  const renderer = createMockRenderer();

  window.CBO.documentHistory = history;
  window.CBO.documentLayerModel = model;
  window.CBO.documentRenderer = renderer;
  window.CBO.renderDocumentLayerMergeToTarget = () => true;

  model.setEntries([
    model.createLayer({ id: "top", name: "Top", type: "paint" }),
    model.createLayer({ id: "bottom", name: "Bottom", opacity: 0.5, type: "image" }),
    model.createLayer({ id: "background", locked: true, name: "Background", type: "background" }),
  ], { history: false, source: "unit-setup" });
  model.setActiveLayer("top", { history: false, source: "unit-setup" });
  renderer.rasterTargetsByLayerId.set("top", {
    framebuffer: {},
    height: 32,
    layerId: "top",
    texture: {},
    width: 32,
    x: 0,
    y: 0,
  });
  renderer.rasterTargetsByLayerId.set("bottom", {
    framebuffer: {},
    height: 32,
    layerId: "bottom",
    texture: {},
    width: 32,
    x: 16,
    y: 16,
  });

  assert.equal(await window.CBO.mergeLayerDown("top", { source: "unit-merge-down" }), true);

  const entries = model.getEntries();
  assert.equal(entries.some((entry) => entry.id === "top"), false);
  assert.equal(entries[0].id, "bottom");
  assert.equal(entries[0].type, "paint");
  assert.equal(entries[0].opacity, 1);
  assert.equal(entries[0].blendMode, "normal");
  assert.equal(model.activeLayerId, "bottom");
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].beforeSnapshots.length, 2);
  assert.equal(history.undoStack[0].afterSnapshots.length, 1);
  assert.ok(renderer.calls.some((call) => call[0] === "sparsify" && call[3] === true));
  assert.ok(renderer.calls.some((call) => call[0] === "dirty" && call[3] === true));

  assert.equal(history.undo(), true);
  assert.ok(model.findEntryById("top"));
  assert.equal(model.findEntryById("bottom").type, "image");
  assert.ok(renderer.calls.some((call) => call[0] === "restore" && call[1] === "top"));

  assert.equal(history.redo(), true);
  assert.equal(model.findEntryById("top"), null);
  assert.equal(model.findEntryById("bottom").type, "paint");
});

test("merge plan rejects non-contiguous, hidden, locked, and unbased clipping selections", () => {
  const { DocumentLayerModel, window } = loadDocumentMergeModules();
  const model = new DocumentLayerModel();
  const renderer = createMockRenderer();

  window.CBO.documentLayerModel = model;
  window.CBO.documentRenderer = renderer;

  model.setEntries([
    model.createLayer({ id: "top", name: "Top", type: "paint" }),
    model.createLayer({ id: "clip", clippingMask: true, name: "Clip", type: "paint" }),
    model.createLayer({ id: "middle", name: "Middle", type: "paint" }),
    model.createLayer({ id: "locked", locked: true, name: "Locked", type: "paint" }),
    model.createLayer({ id: "hidden", name: "Hidden", type: "paint", visible: false }),
    model.createLayer({ id: "bottom", name: "Bottom", type: "paint" }),
    model.createLayer({ id: "background", locked: true, name: "Background", type: "background" }),
  ], { history: false, source: "unit-setup" });

  assert.equal(window.CBO.getDocumentLayerMergePlan(["top", "middle"]).reason, "not-contiguous");
  assert.equal(window.CBO.getDocumentLayerMergePlan(["locked", "hidden"]).reason, "locked-layer");
  assert.equal(window.CBO.getDocumentLayerMergePlan(["hidden", "bottom"]).reason, "hidden-layer");
  assert.equal(window.CBO.getDocumentLayerMergePlan(["top", "clip"]).reason, "missing-clipping-base");
});

test("merge implementation creates a cropped raster target and immediately sparsifies transparent tiles", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-layer-merge.js"),
    "utf8",
  );

  assert.match(source, /createRasterTargetForUnclampedRect\?\.\(renderRect/);
  assert.match(source, /sparsifyRasterTarget\?\.\(destinationLayerId, target, \{/);
  assert.match(source, /pruneTransparentTiles:\s*true/);
  assert.match(source, /usePreviewDirtyTiles:\s*true/);
});
