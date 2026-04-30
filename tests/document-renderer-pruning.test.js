const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentRenderer() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    addEventListener() {},
    dispatchEvent() {},
    matchMedia: () => ({ matches: false }),
    removeEventListener() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Event,
    EventTarget,
    HTMLCanvasElement: class HTMLCanvasElement {},
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    navigator: { maxTouchPoints: 0, userAgent: "" },
    window,
  });

  vm.runInContext(source, context);

  return {
    DocumentRenderer: context.window.CBO.DocumentRenderer,
    window: context.window,
  };
}

test("pruneOrphanRasterTargets keeps current and history-referenced raster targets", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const mainTexture = {};
  const deleted = [];

  window.CBO.documentHistory = {
    redoStack: [
      {
        beforeEntries: [{ id: "history-before" }],
      },
    ],
    undoStack: [
      { layerId: "pixel-history" },
      {
        afterEntries: [
          {
            id: "group-history",
            children: [{ id: "nested-history" }],
          },
        ],
      },
    ],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    getEntries: () => [
      { id: "paint-main" },
      { id: "current-image" },
      {
        id: "current-group",
        children: [{ id: "current-child" }],
      },
    ],
  };
  renderer.paintLayerId = "paint-main";
  renderer.texture = mainTexture;
  renderer.rasterTargetsByLayerId = new Map([
    ["paint-main", { texture: mainTexture }],
    ["background", { texture: {} }],
    ["current-image", { texture: {} }],
    ["current-child", { texture: {} }],
    ["pixel-history", { texture: {} }],
    ["history-before", { texture: {} }],
    ["nested-history", { texture: {} }],
    ["orphan", { texture: {} }],
  ]);
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["orphan"]);
  assert.equal(renderer.rasterTargetsByLayerId.has("pixel-history"), true);
  assert.equal(renderer.rasterTargetsByLayerId.has("history-before"), true);
  assert.equal(renderer.rasterTargetsByLayerId.has("nested-history"), true);
});

test("raster snapshot rectangles clamp crop bounds safely", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 80,
    width: 100,
  };
  const firstRect = renderer.getSnapshotRect(target, {
    height: 0,
    width: 500,
    x: -10,
    y: 12.6,
  });
  const secondRect = renderer.getSnapshotRect(target, {
    x: 95.2,
    y: 70.5,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(firstRect)), {
    height: 68,
    width: 100,
    x: 0,
    y: 12,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(secondRect)), {
    height: 10,
    width: 5,
    x: 95,
    y: 70,
  });
});

test("document renderer exposes GPU snapshot lifecycle helpers for raster history", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createRasterSnapshot\(targetOrLayerId, rect = null, label = "raster snapshot"\)/);
  assert.match(source, /restoreRasterSnapshot\(layerId, snapshot, options = \{\}\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\)/);
  assert.match(source, /gl\.blitFramebuffer\(/);
  assert.match(source, /gl\.deleteFramebuffer\(snapshot\.framebuffer\)/);
  assert.match(source, /gl\.deleteTexture\(snapshot\.texture\)/);
});
