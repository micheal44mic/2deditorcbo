const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadPuppetNamespace() {
  const context = {
    console,
    document: {},
    window: {
      CBO: {},
      addEventListener() {},
      requestAnimationFrame() {
        return 0;
      },
    },
  };

  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "puppet-transform-tool.js"), "utf8"),
    context,
  );

  return context.window.CBO;
}

test("puppet rasterize redo can recompute pixels without storing an after snapshot", () => {
  const namespace = loadPuppetNamespace();
  const calls = [];
  const beforeSnapshot = { id: "before" };
  const redoBeforeSnapshot = { id: "redo-before" };
  const beforePuppet = {
    pins: [{ id: "pin-1", x: 12, y: 20 }],
  };
  const beforeState = {
    activeLayerId: "paint-main",
    entries: [{
      id: "paint-main",
      puppet: beforePuppet,
      type: "paint",
    }],
  };
  const afterState = {
    activeLayerId: "paint-main",
    entries: [{
      id: "paint-main",
      puppet: { pins: [] },
      type: "paint",
    }],
  };
  let activeEntries = beforeState.entries.map((entry) => ({
    ...entry,
    puppet: { pins: entry.puppet.pins.map((pin) => ({ ...pin })) },
  }));
  const layerModel = {
    findEntryById(layerId) {
      return activeEntries.find((entry) => entry.id === layerId) || null;
    },
  };
  const history = {
    restoreLayerState(model, state, options = {}) {
      calls.push(`state:${options.source}`);
      activeEntries = state.entries.map((entry) => ({
        ...entry,
        puppet: { pins: entry.puppet.pins.map((pin) => ({ ...pin })) },
      }));
      return model === layerModel;
    },
  };
  const renderer = {
    deleteRasterSnapshot(snapshot) {
      if (snapshot) {
        calls.push(`delete:${snapshot.id}`);
      }
    },
    rasterizePuppetLayer(layer, options = {}) {
      calls.push(`rasterize:${layer.id}:${layer.puppet.pins.length}:${options.captureAfterSnapshot}`);
      return { beforeSnapshot: redoBeforeSnapshot, layerId: layer.id };
    },
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(`pixels:${options.source}:${layerId}:${snapshot.id}`);
      return true;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createPuppetRasterizeHistoryEntry({
    afterPreferSparse: true,
    afterSnapshot: null,
    afterState,
    beforePreferSparse: true,
    beforeSnapshot,
    beforeState,
    history,
    layerId: "paint-main",
    layerModel,
    puppet: beforePuppet,
    renderer,
  });

  assert.equal(entry.afterSnapshot, null);
  assert.equal(entry.redo(), true);
  assert.deepEqual(calls, [
    "state:history-redo-puppet-rasterize-prepare",
    "pixels:history-redo-puppet-rasterize-prepare:paint-main:before",
    "rasterize:paint-main:1:false",
    "delete:redo-before",
    "state:history-redo-puppet-rasterize",
    "draw",
  ]);
  assert.deepEqual(activeEntries, afterState.entries);
});
