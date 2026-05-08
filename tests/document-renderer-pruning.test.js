const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentRenderer(options = {}) {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const matchCoarsePointer = options.coarsePointer === true;
  const window = {
    CBO: {},
    addEventListener() {},
    dispatchEvent() {},
    matchMedia: () => ({ matches: matchCoarsePointer }),
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
    navigator: {
      maxTouchPoints: Number.isFinite(options.maxTouchPoints) ? options.maxTouchPoints : 0,
      userAgent: options.userAgent || "",
    },
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

test("pruneOrphanRasterTargets cools deleted undoable layer targets to CPU", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const activeTexture = {};
  const historyFramebuffer = {};
  const historyTexture = {};
  const metadataUpdates = [];
  const deleted = [];
  const glCalls = [];

  window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [
      {
        beforeEntries: [{ id: "deleted-layer", type: "paint" }],
      },
    ],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    activeLayerId: "active-layer",
    findEntryById: (layerId) => {
      if (layerId === "active-layer") {
        return { id: "active-layer", type: "paint" };
      }

      return null;
    },
    flattenTopToBottom: () => [{ id: "active-layer", type: "paint" }],
    getEntries: () => [{ id: "active-layer", type: "paint" }],
  };
  renderer.paintLayerId = "deleted-layer";
  renderer.texture = historyTexture;
  renderer.framebuffer = {};
  renderer.gl = {
    bindFramebuffer: (...args) => glCalls.push(["bindFramebuffer", ...args]),
    deleteFramebuffer: (framebuffer) => glCalls.push(["deleteFramebuffer", framebuffer]),
    deleteTexture: (texture) => glCalls.push(["deleteTexture", texture]),
    FRAMEBUFFER: "FRAMEBUFFER",
    readPixels: (x, y, width, height, format, type, pixels) => {
      glCalls.push(["readPixels", width, height, format, type]);
      pixels.fill(17);
    },
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };
  renderer.rasterTargetsByLayerId = new Map([
    ["active-layer", { framebuffer: {}, height: 4, texture: activeTexture, width: 4 }],
    ["deleted-layer", { framebuffer: historyFramebuffer, height: 8, texture: historyTexture, width: 8 }],
    ["orphan", { framebuffer: {}, texture: {} }],
  ]);
  renderer.deleteRasterFramebuffer = (framebuffer) => glCalls.push(["unregisterFramebuffer", framebuffer]);
  renderer.deleteRasterTexture = (texture) => glCalls.push(["unregisterTexture", texture]);
  renderer.updateRasterTargetResourceMetadata = (target, metadata = {}) => {
    metadataUpdates.push({ layerId: metadata.layerId, metadata, target });
    return target;
  };
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["orphan"]);
  assert.equal(renderer.paintLayerId, "active-layer");
  assert.equal(renderer.texture, activeTexture);

  const activeUpdate = metadataUpdates.find((update) => update.layerId === "active-layer");
  const historyUpdate = metadataUpdates.find((update) => update.layerId === "deleted-layer");
  const historyTarget = renderer.rasterTargetsByLayerId.get("deleted-layer");

  assert.equal(activeUpdate.metadata.ownerType, "live");
  assert.equal(historyUpdate, undefined);
  assert.equal(historyTarget.texture, null);
  assert.equal(historyTarget.framebuffer, null);
  assert.equal(historyTarget.state, "CPU_COLD");
  assert.equal(historyTarget.cpuPixels.byteLength, 8 * 8 * 4);
  assert.equal(historyTarget.cpuBytes, 8 * 8 * 4);
  assert.equal(renderer.getHistoryColdRasterTargetBytes(), 8 * 8 * 4);
  assert.ok(glCalls.some((call) => call[0] === "readPixels" && call[1] === 8 && call[2] === 8));
  assert.ok(glCalls.some((call) => call[0] === "deleteTexture" && call[1] === historyTexture));
  assert.ok(glCalls.some((call) => call[0] === "deleteFramebuffer" && call[1] === historyFramebuffer));
});

test("reconcileRasterTargetResourceOwnership hydrates restored cold history targets", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const restoredTarget = {
    cpuBytes: 16,
    cpuPixels: new Uint8Array(16),
    height: 2,
    state: "CPU_COLD",
    width: 2,
  };
  const metadataUpdates = [];
  const hydrateCalls = [];

  window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    activeLayerId: "restored-layer",
    findEntryById: () => ({ id: "restored-layer", type: "paint" }),
    flattenTopToBottom: () => [{ id: "restored-layer", type: "paint" }],
    getEntries: () => [{ id: "restored-layer", type: "paint" }],
  };
  renderer.paintLayerId = "restored-layer";
  renderer.texture = null;
  renderer.rasterTargetsByLayerId = new Map([
    ["restored-layer", restoredTarget],
  ]);
  renderer.hydrateRasterTarget = (target, options = {}) => {
    hydrateCalls.push({ options, target });
    target.framebuffer = {};
    target.texture = {};
    target.state = "GPU_HOT";
    target.cpuBytes = 0;
    target.cpuPixels = null;
    return true;
  };
  renderer.updateRasterTargetResourceMetadata = (target, metadata = {}) => {
    metadataUpdates.push({ metadata, target });
    return target;
  };

  assert.equal(renderer.reconcileRasterTargetResourceOwnership(), 1);
  assert.equal(hydrateCalls.length, 1);
  assert.equal(hydrateCalls[0].options.ownerType, "live");
  assert.equal(hydrateCalls[0].options.reason, "history-retained-layer-target-hydrate");
  assert.equal(restoredTarget.state, "GPU_HOT");
  assert.equal(metadataUpdates[0].metadata.ownerType, "live");
});

test("pruneOrphanRasterTargets releases stale paint targets after history is cleared", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const activeTexture = {};
  const staleTexture = {};
  const deleted = [];

  window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [],
  };
  renderer.isDisposed = false;
  renderer.layerModel = {
    activeLayerId: "active-layer",
    findEntryById: (layerId) => {
      if (layerId === "active-layer") {
        return { id: "active-layer", type: "paint" };
      }

      return null;
    },
    flattenTopToBottom: () => [{ id: "active-layer", type: "paint" }],
    getEntries: () => [{ id: "active-layer", type: "paint" }],
  };
  renderer.paintLayerId = "deleted-layer";
  renderer.texture = staleTexture;
  renderer.framebuffer = {};
  renderer.rasterTargetsByLayerId = new Map([
    ["active-layer", { framebuffer: {}, texture: activeTexture }],
    ["deleted-layer", { framebuffer: {}, texture: staleTexture }],
  ]);
  renderer.updateRasterTargetResourceMetadata = (target) => target;
  renderer.deleteRasterTarget = (layerId, options = {}) => {
    assert.equal(options.emit, false);
    deleted.push(layerId);
    renderer.rasterTargetsByLayerId.delete(layerId);
    return true;
  };

  assert.equal(renderer.pruneOrphanRasterTargets(), 1);
  assert.deepEqual(deleted, ["deleted-layer"]);
  assert.equal(renderer.rasterTargetsByLayerId.has("deleted-layer"), false);
  assert.equal(renderer.paintLayerId, "active-layer");
  assert.equal(renderer.texture, activeTexture);
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

test("duplicateRasterTarget clones a source raster target into a new layer target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const sourceTarget = {
    clearColor: [0.1, 0.2, 0.3, 0],
    cropped: true,
    framebuffer: { id: "source-framebuffer" },
    height: 40,
    texture: { id: "source-texture" },
    width: 30,
    x: 8,
    y: 12,
  };
  const destinationTarget = {
    framebuffer: { id: "destination-framebuffer" },
    texture: { id: "destination-texture" },
  };
  const copyCalls = [];
  const replaceCalls = [];

  renderer.width = 100;
  renderer.height = 100;
  renderer.rasterTargetsByLayerId = new Map([["source-layer", sourceTarget]]);
  renderer.createRasterTarget = (clearColor, options = {}) => {
    assert.deepEqual(JSON.parse(JSON.stringify(clearColor)), sourceTarget.clearColor);
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      cropped: true,
      height: 40,
      layerId: "copy-layer",
      reason: "unit-duplicate",
      width: 30,
      x: 8,
      y: 12,
    });
    return destinationTarget;
  };
  renderer.copyRasterTargetRectToTarget = (source, rect, destination) => {
    copyCalls.push({ destination, rect, source });
    return true;
  };
  renderer.replaceRasterTarget = (layerId, target, options = {}) => {
    replaceCalls.push({ layerId, options, target });
    return true;
  };
  renderer.deleteRasterTargetObject = () => {
    throw new Error("destination target should not be deleted after a successful copy");
  };

  assert.equal(renderer.duplicateRasterTarget("source-layer", "copy-layer", {
    emit: false,
    source: "unit-duplicate",
  }), true);
  assert.equal(copyCalls[0].destination, destinationTarget);
  assert.equal(copyCalls[0].source, sourceTarget);
  assert.deepEqual(JSON.parse(JSON.stringify(copyCalls[0].rect)), {
    height: 40,
    width: 30,
    x: 8,
    y: 12,
  });
  assert.equal(replaceCalls.length, 1);
  assert.equal(replaceCalls[0].layerId, "copy-layer");
  assert.equal(replaceCalls[0].target, destinationTarget);
  assert.deepEqual(JSON.parse(JSON.stringify(replaceCalls[0].options)), {
    emit: false,
    label: "copy-layer",
    source: "unit-duplicate",
  });
});

test("duplicateRasterTarget preserves sparse paint tiles without full materialization", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const copyCalls = [];
  const createdTargets = [];

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.createRasterTarget = (clearColor, options = {}) => {
    const target = {
      clearColor,
      cropped: options.cropped === true,
      framebuffer: { id: `fb-${createdTargets.length}` },
      height: options.height,
      kind: options.kind,
      layerId: options.layerId,
      texture: { id: `tex-${createdTargets.length}` },
      width: options.width,
      x: options.x,
      y: options.y,
    };

    createdTargets.push(target);

    return target;
  };
  renderer.copyRasterTargetRectToTarget = (source, rect, destination) => {
    copyCalls.push({ destination, rect: { ...rect }, source });
    return true;
  };
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.resolvePaintLayerId = () => "paint-main";

  const sourceTarget = renderer.createSparseRasterTarget("source-layer", { tileSize: 256 });
  const sourceTile = {
    cropped: true,
    framebuffer: { id: "source-fb" },
    height: 256,
    layerId: "source-layer",
    texture: { id: "source-texture" },
    tx: 0,
    ty: 0,
    width: 256,
    x: 0,
    y: 0,
  };

  sourceTarget.tiles.set("0:0", sourceTile);
  renderer.rasterTargetsByLayerId.set("source-layer", sourceTarget);

  assert.equal(renderer.duplicateRasterTarget("source-layer", "copy-layer", {
    emit: false,
    source: "unit-duplicate-sparse",
  }), true);

  const destinationTarget = renderer.rasterTargetsByLayerId.get("copy-layer");

  assert.equal(renderer.isSparseRasterTarget(destinationTarget), true);
  assert.equal(destinationTarget.texture, null);
  assert.equal(destinationTarget.framebuffer, null);
  assert.equal(destinationTarget.tiles.size, 1);
  assert.equal(copyCalls.length, 1);
  assert.equal(copyCalls[0].source, sourceTile);
  assert.deepEqual(copyCalls[0].rect, { height: 256, width: 256, x: 0, y: 0 });
  assert.equal(copyCalls[0].destination.kind, "paintTile");
  assert.equal(renderer.estimateRasterTargetBytes(destinationTarget), 256 * 256 * 4);
});

test("ensureRasterTargetForPaintRect creates and grows cropped live targets", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const createdRects = [];
  const copiedRects = [];
  const replaced = [];

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.createRasterTargetForDocumentRect = (layerId, rect, options = {}) => {
    createdRects.push({ layerId, options, rect: { ...rect } });
    return {
      clearColor: options.clearColor || [0, 0, 0, 0],
      cropped: renderer.isCroppedRect(rect),
      framebuffer: { id: `fb-${createdRects.length}` },
      height: rect.height,
      texture: { id: `tex-${createdRects.length}` },
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  };
  renderer.replaceRasterTarget = (layerId, target, options = {}) => {
    replaced.push({ layerId, options, target });
    renderer.rasterTargetsByLayerId.set(layerId, target);
    return true;
  };
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copiedRects.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = () => {
    throw new Error("cropped target should not be deleted in this happy path");
  };

  const firstTarget = renderer.ensureRasterTargetForPaintRect("paint-1", {
    height: 80,
    width: 100,
    x: 200,
    y: 300,
  }, {
    source: "unit-first-stroke",
  });

  assert.equal(firstTarget.width, 100);
  assert.equal(firstTarget.height, 80);
  assert.equal(firstTarget.x, 200);
  assert.equal(firstTarget.y, 300);
  assert.equal(createdRects[0].options.source, "unit-first-stroke");
  assert.equal(replaced[0].options.emit, false);

  const grownTarget = renderer.ensureRasterTargetForPaintRect("paint-1", {
    height: 40,
    width: 50,
    x: 360,
    y: 420,
  }, {
    source: "unit-grow-stroke",
  });

  assert.equal(grownTarget.x, 200);
  assert.equal(grownTarget.y, 300);
  assert.equal(grownTarget.width, 210);
  assert.equal(grownTarget.height, 160);
  assert.deepEqual(copiedRects[0].rect, {
    height: 80,
    width: 100,
    x: 200,
    y: 300,
  });
  assert.equal(replaced[1].options.source, "unit-grow-stroke");
});

test("ensureRasterTargetsForPaintRect keeps distant first strokes as sparse tiles", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const createdTargets = [];

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => {
    const target = {
      clearColor,
      cropped: options.cropped === true,
      framebuffer: { id: `fb-${createdTargets.length}` },
      height: options.height,
      kind: options.kind,
      layerId: options.layerId,
      ownerId: options.ownerId,
      texture: { id: `tex-${createdTargets.length}` },
      width: options.width,
      x: options.x,
      y: options.y,
    };

    createdTargets.push(target);

    return target;
  };

  const firstTargets = renderer.ensureRasterTargetsForPaintRect("paint-1", {
    height: 20,
    width: 20,
    x: 16,
    y: 16,
  }, {
    source: "unit-first-sparse-stroke",
  });

  const secondTargets = renderer.ensureRasterTargetsForPaintRect("paint-1", {
    height: 20,
    width: 20,
    x: 3800,
    y: 3800,
  }, {
    source: "unit-distant-sparse-stroke",
  });

  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(firstTargets.length, 1);
  assert.equal(secondTargets.length, 1);
  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.equal(sparseTarget.texture, null);
  assert.equal(sparseTarget.framebuffer, null);
  assert.equal(sparseTarget.tiles.size, 2);
  assert.deepEqual(
    Array.from(sparseTarget.tiles.values()).map((target) => ({
      height: target.height,
      kind: target.kind,
      width: target.width,
      x: target.x,
      y: target.y,
    })),
    [
      { height: 256, kind: "paintTile", width: 256, x: 0, y: 0 },
      { height: 256, kind: "paintTile", width: 256, x: 3584, y: 3584 },
    ],
  );
  assert.equal(renderer.estimateRasterTargetBytes(sparseTarget), 2 * 256 * 256 * 4);
});

test("ensureRasterTargetsForPaintRect uses stamp patch tiles instead of stroke bounds", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });

  const targets = renderer.ensureRasterTargetsForPaintRect("paint-1", {
    height: 4000,
    width: 4000,
    x: 0,
    y: 0,
  }, {
    source: "unit-diagonal-sparse-stroke",
    tilePatchRects: [
      { patchRect: { height: 20, width: 20, x: 16, y: 16 }, tx: 0, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 2000, y: 2000 }, tx: 7, ty: 7 },
      { patchRect: { height: 20, width: 20, x: 3800, y: 3800 }, tx: 14, ty: 14 },
    ],
  });
  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(targets.length, 3);
  assert.equal(sparseTarget.tiles.size, 3);
  assert.deepEqual(
    Array.from(sparseTarget.tiles.values()).map((target) => `${target.x},${target.y}`),
    ["0,0", "1792,1792", "3584,3584"],
  );
  assert.equal(renderer.estimateRasterTargetBytes(sparseTarget), 3 * 256 * 256 * 4);
});

test("ensureRasterTargetsForPaintRect retiles materialized sparse paint targets before painting", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const materializedTarget = {
    cropped: false,
    framebuffer: { id: "materialized-fb" },
    height: 512,
    layerId: "paint-1",
    materializedFromSparse: true,
    sparseTileSize: 256,
    texture: { id: "materialized-texture" },
    width: 512,
    x: 0,
    y: 0,
  };
  const copyCalls = [];
  const deletedTargets = [];

  renderer.width = 512;
  renderer.height = 512;
  renderer.paintLayerId = "paint-1";
  renderer.texture = materializedTarget.texture;
  renderer.framebuffer = materializedTarget.framebuffer;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", materializedTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    ownerId: options.ownerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    tileKey: options.ownerId?.split(":").slice(1).join(":"),
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copyCalls.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};

  const targets = renderer.ensureRasterTargetsForPaintRect("paint-1", {
    height: 20,
    width: 20,
    x: 16,
    y: 16,
  }, {
    source: "unit-retile-paint",
  });
  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.equal(sparseTarget.tiles.size, 4);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].target, sparseTarget.tiles.get("0:0"));
  assert.equal(copyCalls.length, 4);
  assert.ok(copyCalls.every((call) => call.sourceTarget === materializedTarget));
  assert.equal(deletedTargets.includes(materializedTarget), true);
  assert.equal(renderer.texture, null);
  assert.equal(renderer.framebuffer, null);
});

test("getRasterTargetsForPaintRect retiles materialized sparse paint targets for eraser", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const materializedTarget = {
    cropped: false,
    framebuffer: { id: "materialized-fb" },
    height: 512,
    layerId: "paint-1",
    materializedFromSparse: true,
    sparseTileSize: 256,
    texture: { id: "materialized-texture" },
    width: 512,
    x: 0,
    y: 0,
  };
  const copyCalls = [];
  const deletedTargets = [];

  renderer.width = 512;
  renderer.height = 512;
  renderer.paintLayerId = "paint-1";
  renderer.texture = materializedTarget.texture;
  renderer.framebuffer = materializedTarget.framebuffer;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", materializedTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    ownerId: options.ownerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copyCalls.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};

  const targets = renderer.getRasterTargetsForPaintRect("paint-1", {
    height: 20,
    width: 20,
    x: 16,
    y: 16,
  }, {
    source: "unit-retile-eraser",
  });
  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.equal(sparseTarget.tiles.size, 4);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].target, sparseTarget.tiles.get("0:0"));
  assert.equal(copyCalls.length, 4);
  assert.equal(deletedTargets.includes(materializedTarget), true);
});

test("sparsifyRasterizedImageLayer converts imported paint targets into sparse tiles", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const importedTarget = {
    clearColor: [0, 0, 0, 0],
    cropped: true,
    framebuffer: { id: "imported-fb" },
    height: 512,
    layerId: "image-1",
    texture: { id: "imported-texture" },
    width: 512,
    x: 0,
    y: 0,
  };
  const copyCalls = [];
  const deletedTargets = [];

  renderer.width = 1024;
  renderer.height = 1024;
  renderer.paintLayerId = "paint-main";
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["image-1", importedTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "image-1", type: "paint" }),
  };
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    ownerId: options.ownerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copyCalls.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};

  const sparseTarget = renderer.sparsifyRasterizedImageLayer("image-1", {
    source: "unit-image-rasterize-retile",
  });

  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.equal(sparseTarget.tiles.size, 4);
  assert.equal(renderer.rasterTargetsByLayerId.get("image-1"), sparseTarget);
  assert.equal(copyCalls.length, 4);
  assert.ok(copyCalls.every((call) => call.sourceTarget === importedTarget));
  assert.equal(deletedTargets.includes(importedTarget), true);
});

test("restoreRasterSnapshot rebuilds sparse paint targets when requested", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const denseTarget = {
    framebuffer: { id: "dense-fb" },
    height: 512,
    layerId: "paint-1",
    texture: { id: "dense-texture" },
    width: 512,
    x: 0,
    y: 0,
  };
  const snapshot = {
    framebuffer: { id: "snapshot-fb" },
    rect: { height: 512, width: 512, x: 0, y: 0 },
    texture: { id: "snapshot-texture" },
  };
  const copyCalls = [];
  const deletedTargets = [];

  renderer.width = 512;
  renderer.height = 512;
  renderer.paintLayerId = "paint-1";
  renderer.texture = denseTarget.texture;
  renderer.framebuffer = denseTarget.framebuffer;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", denseTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.isMobileLikeDevice = () => false;
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copyCalls.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};

  assert.equal(renderer.restoreRasterSnapshot("paint-1", snapshot, {
    emit: false,
    preferSparse: true,
    source: "unit-restore-prefer-sparse",
  }), true);

  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.equal(sparseTarget.tiles.size, 4);
  assert.equal(copyCalls.length, 4);
  assert.equal(deletedTargets.includes(denseTarget), true);
  assert.equal(renderer.texture, null);
  assert.equal(renderer.framebuffer, null);
});

test("restoreRasterSnapshot can replace sparse paint targets to remove stale tiles", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const copyCalls = [];
  const deletedTargets = [];
  const staleTile = {
    framebuffer: { id: "stale-fb" },
    height: 256,
    texture: { id: "stale-texture" },
    width: 256,
    x: 512,
    y: 512,
  };
  const oldSparseTarget = {
    clearColor: [0, 0, 0, 0],
    framebuffer: null,
    height: 1024,
    id: "old-sparse",
    layerId: "paint-1",
    sparse: true,
    texture: null,
    tileSize: 256,
    tiles: new Map([["2:2", staleTile]]),
    width: 1024,
    x: 0,
    y: 0,
  };
  const snapshot = {
    framebuffer: { id: "snapshot-fb" },
    rect: { height: 256, width: 256, x: 0, y: 0 },
    texture: { id: "snapshot-texture" },
  };

  renderer.width = 1024;
  renderer.height = 1024;
  renderer.paintLayerId = "paint-1";
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", oldSparseTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `tile-fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    texture: { id: `tile-tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = (sourceTarget, rect, destinationTarget) => {
    copyCalls.push({ destinationTarget, rect: { ...rect }, sourceTarget });
    return true;
  };
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};

  assert.equal(renderer.restoreRasterSnapshot("paint-1", snapshot, {
    emit: false,
    preferSparse: true,
    replaceSparse: true,
    source: "unit-replace-sparse",
  }), true);

  const nextSparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.notEqual(nextSparseTarget, oldSparseTarget);
  assert.equal(renderer.isSparseRasterTarget(nextSparseTarget), true);
  assert.equal(nextSparseTarget.tiles.has("0:0"), true);
  assert.equal(nextSparseTarget.tiles.has("2:2"), false);
  assert.equal(copyCalls.length, 1);
  assert.equal(deletedTargets.includes(oldSparseTarget), true);
});

test("commitCroppedRasterTransform retiles materialized sparse paint targets after transform", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const materializedTarget = {
    cropped: true,
    framebuffer: { id: "materialized-fb" },
    height: 256,
    layerId: "paint-1",
    materializedFromSparse: true,
    sparseTileSize: 256,
    texture: { id: "materialized-texture" },
    width: 256,
    x: 0,
    y: 0,
  };
  const sourceSnapshot = {
    framebuffer: { id: "source-fb" },
    rect: { height: 80, width: 80, x: 24, y: 24 },
    texture: { id: "source-texture" },
  };
  const deletedTargets = [];
  const restoreCalls = [];
  let pushedEntry = null;

  window.CBO.documentHistory = {
    push(entry) {
      pushedEntry = entry;
      return true;
    },
  };
  renderer.width = 512;
  renderer.height = 512;
  renderer.paintLayerId = "paint-1";
  renderer.texture = materializedTarget.texture;
  renderer.framebuffer = materializedTarget.framebuffer;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", materializedTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.createRasterTargetForRect = (rect) => ({
    cropped: true,
    framebuffer: { id: `next-fb-${rect.x}-${rect.y}` },
    height: rect.height,
    texture: { id: `next-tex-${rect.x}-${rect.y}` },
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `tile-fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    ownerId: options.ownerId,
    texture: { id: `tile-tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deletePuppetMeshResource = () => {};
  renderer.deleteRasterSnapshot = () => {};
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.drawTexturedQuad = () => true;
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isMobileLikeDevice = () => false;
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.markRasterTargetDirty = () => {};
  renderer.recordRasterOperation = (report) => report;
  renderer.requestDraw = () => {};
  renderer.clearRasterTransformPreview = () => {};
  renderer.updateRasterTargetResourceMetadata = (target) => target;
  renderer.createRasterSnapshot = (target, rect, label) => ({
    framebuffer: { id: `${label}-fb` },
    rect: rect || renderer.getRasterTargetDocumentRect(target),
    texture: { id: `${label}-texture` },
  });

  const didCommit = renderer.commitCroppedRasterTransform({
    destQuad: [
      { x: 24, y: 24 },
      { x: 104, y: 24 },
      { x: 104, y: 104 },
      { x: 24, y: 104 },
    ],
    destRect: { height: 80, width: 80, x: 24, y: 24 },
    layerId: "paint-1",
    source: "unit-transform",
    sourceSnapshot,
  });
  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(didCommit, true);
  assert.equal(renderer.isSparseRasterTarget(sparseTarget), true);
  assert.ok(sparseTarget.tiles.size > 0);
  assert.ok(deletedTargets.includes(materializedTarget));
  assert.ok(pushedEntry);

  renderer.restoreRasterSnapshot = (layerId, snapshot, options = {}) => {
    restoreCalls.push({ layerId, options, snapshot });
    return true;
  };

  assert.equal(pushedEntry.undo(), true);
  assert.equal(pushedEntry.redo(), true);
  assert.deepEqual(
    restoreCalls.map((call) => [call.options.preferSparse, call.options.replaceSparse]),
    [[true, true], [true, true]],
  );
});

test("commitCroppedRasterTransform restores rasterized image layers as authoritative sparse targets", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const layer = { id: "image-1", type: "image" };
  const imageTarget = {
    cropped: true,
    framebuffer: { id: "image-fb" },
    height: 256,
    layerId: layer.id,
    texture: { id: "image-texture" },
    width: 256,
    x: 0,
    y: 0,
  };
  const sourceSnapshot = {
    framebuffer: { id: "source-fb" },
    rect: { height: 128, width: 128, x: 32, y: 32 },
    texture: { id: "source-texture" },
  };
  const restoreCalls = [];
  let pushedEntry = null;

  window.CBO.documentHistory = {
    flushLayerState() {},
    getLayerSnapshot() {
      return {
        activeLayerId: layer.id,
        entries: [{ ...layer }],
      };
    },
    push(entry) {
      pushedEntry = entry;
      return true;
    },
    restoreLayerState(layerModel, snapshot) {
      layer.type = snapshot.entries[0].type;
      return true;
    },
  };
  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([[layer.id, imageTarget]]);
  renderer.layerModel = {
    findEntryById: () => layer,
    rasterizeImageLayerToPaint() {
      layer.type = "paint";
      return true;
    },
  };
  renderer.createRasterTargetForRect = (rect) => ({
    cropped: true,
    framebuffer: { id: `next-fb-${rect.x}-${rect.y}` },
    height: rect.height,
    layerId: layer.id,
    texture: { id: `next-tex-${rect.x}-${rect.y}` },
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: `tile-fb-${options.x}-${options.y}` },
    height: options.height,
    kind: options.kind,
    layerId: options.layerId,
    ownerId: options.ownerId,
    texture: { id: `tile-tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deletePuppetMeshResource = () => {};
  renderer.deleteRasterSnapshot = () => {};
  renderer.deleteRasterTargetObject = () => {};
  renderer.drawTexturedQuad = () => true;
  renderer.emitContentChange = () => {};
  renderer.invalidatePreviewCache = () => {};
  renderer.isMobileLikeDevice = () => false;
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.markRasterTargetDirty = () => {};
  renderer.recordRasterOperation = (report) => report;
  renderer.requestDraw = () => {};
  renderer.clearRasterTransformPreview = () => {};
  renderer.updateRasterTargetResourceMetadata = (target) => target;
  renderer.createRasterSnapshot = (target, rect, label) => ({
    framebuffer: { id: `${label}-fb` },
    rect: rect || renderer.getRasterTargetDocumentRect(target),
    texture: { id: `${label}-texture` },
  });

  const didCommit = renderer.commitCroppedRasterTransform({
    destQuad: [
      { x: 256, y: 0 },
      { x: 384, y: 0 },
      { x: 384, y: 128 },
      { x: 256, y: 128 },
    ],
    destRect: { height: 128, width: 128, x: 256, y: 0 },
    layerId: layer.id,
    source: "unit-image-transform",
    sourceSnapshot,
  });

  assert.equal(didCommit, true);
  assert.equal(layer.type, "paint");
  assert.equal(renderer.isSparseRasterTarget(renderer.rasterTargetsByLayerId.get(layer.id)), true);
  assert.ok(pushedEntry);

  renderer.restoreRasterSnapshot = (layerId, snapshot, options = {}) => {
    restoreCalls.push({
      layerId,
      layerType: layer.type,
      options,
      snapshot,
    });
    return true;
  };

  assert.equal(pushedEntry.undo(), true);
  assert.equal(layer.type, "image");
  assert.equal(pushedEntry.redo(), true);
  assert.equal(layer.type, "paint");
  assert.deepEqual(
    restoreCalls.map((call) => [call.layerType, call.options.preferSparse, call.options.replaceSparse]),
    [["paint", true, true], ["paint", true, true]],
  );
});

test("getRasterAlphaAtPoint samples the matching sparse tile", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const readCalls = [];
  const tileFramebuffer = { id: "tile-fb" };

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.gl = {
    bindFramebuffer: (...args) => readCalls.push(["bindFramebuffer", ...args]),
    readPixels: (x, y, width, height, format, type, pixel) => {
      readCalls.push(["readPixels", x, y, width, height, format, type]);
      pixel[3] = 123;
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };

  const sparseTarget = {
    sparse: true,
    tileSize: 256,
    tiles: new Map([
      ["1:2", {
        framebuffer: tileFramebuffer,
        height: 256,
        texture: { id: "tile-texture" },
        width: 256,
        x: 256,
        y: 512,
      }],
    ]),
  };

  assert.equal(renderer.getRasterAlphaAtPoint(sparseTarget, 260, 520), 123);
  assert.ok(readCalls.some((call) => call[0] === "bindFramebuffer" && call[2] === tileFramebuffer));
  assert.ok(readCalls.some((call) => call[0] === "readPixels" && call[1] === 4 && call[2] === 247));
  assert.equal(renderer.getRasterAlphaAtPoint(sparseTarget, 20, 20), 0);
});

test("getRasterContentBounds fits sparse targets to painted pixels", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const readCalls = [];
  let currentFramebuffer = null;

  window.CBO.documentBounds = {
    getClampedRasterBox(rect, width, height) {
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
      const y1 = Math.min(height, Math.ceil(rect.y + rect.height));

      return x1 > x0 && y1 > y0
        ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
        : null;
    },
  };

  renderer.width = 1024;
  renderer.height = 1024;
  renderer.gl = {
    bindFramebuffer: (target, framebuffer) => {
      readCalls.push(["bindFramebuffer", target, framebuffer]);
      currentFramebuffer = framebuffer;
    },
    readPixels: (x, y, width, height, format, type, pixels) => {
      readCalls.push(["readPixels", currentFramebuffer?.id, x, y, width, height, format, type]);
      pixels.fill(0);

      if (currentFramebuffer?.id === "tile-a") {
        const paintX = 12;
        const paintY = 18;
        const webglY = height - paintY - 1;

        pixels[(webglY * width + paintX) * 4 + 3] = 255;
      } else if (currentFramebuffer?.id === "tile-b") {
        for (let localY = 7; localY < 10; localY += 1) {
          for (let localX = 5; localX < 9; localX += 1) {
            const webglY = height - localY - 1;

            pixels[(webglY * width + localX) * 4 + 3] = 255;
          }
        }
      }
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };

  renderer.rasterTargetsByLayerId = new Map([[
    "paint-1",
    {
      layerId: "paint-1",
      sparse: true,
      tileSize: 256,
      tiles: new Map([
        ["0:0", {
          framebuffer: { id: "tile-a" },
          height: 256,
          texture: { id: "texture-a" },
          width: 256,
          x: 0,
          y: 0,
        }],
        ["2:2", {
          framebuffer: { id: "tile-b" },
          height: 256,
          texture: { id: "texture-b" },
          width: 256,
          x: 512,
          y: 512,
        }],
      ]),
    },
  ]]);

  const contentBounds = renderer.getRasterContentBounds("paint-1", {
    alphaThreshold: 2,
    padding: 0,
    pixelPerfect: true,
  });

  assert.equal(contentBounds.x, 12);
  assert.equal(contentBounds.y, 18);
  assert.equal(contentBounds.width, 509);
  assert.equal(contentBounds.height, 504);
  assert.ok(readCalls.some((call) => call[0] === "readPixels" && call[1] === "tile-a"));
  assert.ok(readCalls.some((call) => call[0] === "readPixels" && call[1] === "tile-b"));
});

test("sparse restore prunes tiles that become fully transparent", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const deletedTargets = [];
  const sparseTarget = {
    layerId: "paint-1",
    sparse: true,
    tileSize: 256,
    tiles: new Map(),
    version: 0,
  };
  const tileTarget = {
    framebuffer: { id: "tile-fb" },
    height: 256,
    texture: { id: "tile-texture" },
    tileKey: "0:0",
    tx: 0,
    ty: 0,
    width: 256,
    x: 0,
    y: 0,
  };
  const readCalls = [];

  sparseTarget.tiles.set("0:0", tileTarget);
  renderer.width = 4000;
  renderer.height = 4000;
  renderer.gl = {
    bindFramebuffer: (...args) => readCalls.push(["bindFramebuffer", ...args]),
    FRAMEBUFFER: "FRAMEBUFFER",
    readPixels: (x, y, width, height, format, type, pixels) => {
      readCalls.push(["readPixels", width, height, format, type]);
      pixels.fill(0);
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deleteRasterTargetObject = (target) => {
    deletedTargets.push(target);
  };
  renderer.emitContentChange = () => {};
  renderer.requestDraw = () => {};

  assert.equal(renderer.restoreRasterSnapshotToSparseTarget("paint-1", sparseTarget, {
    framebuffer: { id: "snapshot-fb" },
    rect: { height: 20, width: 20, x: 8, y: 8 },
    texture: { id: "snapshot-texture" },
  }, {
    emit: false,
    source: "unit-restore-transparent",
  }), true);

  assert.equal(sparseTarget.tiles.size, 0);
  assert.equal(deletedTargets[0], tileTarget);
  assert.ok(readCalls.some((call) => call[0] === "readPixels" && call[1] === 256 && call[2] === 256));
});

test("sparse restore keeps tiles that still contain alpha", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const sparseTarget = {
    layerId: "paint-1",
    sparse: true,
    tileSize: 256,
    tiles: new Map(),
  };
  const tileTarget = {
    framebuffer: { id: "tile-fb" },
    height: 256,
    texture: { id: "tile-texture" },
    tileKey: "0:0",
    tx: 0,
    ty: 0,
    width: 256,
    x: 0,
    y: 0,
  };
  let deleteCount = 0;

  sparseTarget.tiles.set("0:0", tileTarget);
  renderer.width = 4000;
  renderer.height = 4000;
  renderer.gl = {
    bindFramebuffer() {},
    FRAMEBUFFER: "FRAMEBUFFER",
    readPixels: (x, y, width, height, format, type, pixels) => {
      pixels.fill(0);
      pixels[3] = 255;
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deleteRasterTargetObject = () => {
    deleteCount += 1;
  };
  renderer.emitContentChange = () => {};
  renderer.requestDraw = () => {};

  assert.equal(renderer.restoreRasterSnapshotToSparseTarget("paint-1", sparseTarget, {
    framebuffer: { id: "snapshot-fb" },
    rect: { height: 20, width: 20, x: 8, y: 8 },
    texture: { id: "snapshot-texture" },
  }, {
    emit: false,
    source: "unit-restore-nonempty",
  }), true);

  assert.equal(sparseTarget.tiles.size, 1);
  assert.equal(sparseTarget.tiles.get("0:0"), tileTarget);
  assert.equal(deleteCount, 0);
});

test("puppet Rigid MLS writes translated and rotated mesh vertices", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const translated = new Float32Array(2);
  const rotated = new Float32Array(2);

  renderer.writeRigidMlsPoint(translated, 0, 10, 20, [
    { restX: 4, restY: 8, x: 14, y: 3 },
  ]);

  assert.deepEqual(Array.from(translated), [20, 15]);

  renderer.writeRigidMlsPoint(rotated, 0, 0, 1, [
    { restX: 0, restY: 0, x: 0, y: 0 },
    { restX: 1, restY: 0, x: 0, y: 1 },
  ]);

  assert.ok(Math.abs(rotated[0] - -1) < 0.00001);
  assert.ok(Math.abs(rotated[1] - 0) < 0.00001);

  const pinRotated = new Float32Array(2);

  renderer.writeRigidMlsPoint(pinRotated, 0, 1, 0, [
    { restX: 0, restY: 0, x: 0, y: 0, rotation: Math.PI / 2 },
  ]);

  assert.ok(Math.abs(pinRotated[0] - 0) < 0.00001);
  assert.ok(Math.abs(pinRotated[1] - 1) < 0.00001);
});

test("puppet rest point resolves deformed clicks back through barycentric UVs", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.puppetMeshResourcesByLayerId = new Map([
    ["paint-main", {
      indices: new Uint32Array([0, 1, 2]),
      targetHeight: 100,
      targetWidth: 100,
      vertices: new Float32Array([
        10, 10, 0, 1,
        110, 10, 1, 1,
        10, 110, 0, 0,
      ]),
    }],
  ]);

  const point = renderer.getPuppetRestPoint("paint-main", 60, 60);

  assert.ok(Math.abs(point.x - 50) < 0.00001);
  assert.ok(Math.abs(point.y - 50) < 0.00001);
});

test("puppet mesh converts cropped layer pins between document and local coordinates", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 40,
    width: 50,
    x: 100,
    y: 200,
  };
  const layer = {
    puppet: {
      pins: [{ restX: 110, restY: 210, x: 120, y: 230 }],
    },
  };
  const resource = {
    cols: 1,
    rows: 1,
    vertices: new Float32Array(16),
  };

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.updatePuppetMeshVertices(resource, layer, target);

  assert.deepEqual(Array.from(resource.vertices.slice(0, 4)), [110, 220, 0, 1]);

  renderer.puppetMeshResourcesByLayerId = new Map([
    ["image-1", {
      indices: new Uint32Array([0, 1, 2]),
      targetHeight: 40,
      targetWidth: 50,
      targetX: 100,
      targetY: 200,
      vertices: new Float32Array([
        100, 200, 0, 1,
        150, 200, 1, 1,
        100, 240, 0, 0,
      ]),
    }],
  ]);

  const restPoint = renderer.getPuppetRestPoint("image-1", 125, 220);

  assert.ok(Math.abs(restPoint.x - 125) < 0.00001);
  assert.ok(Math.abs(restPoint.y - 220) < 0.00001);
});

test("field blur maps document pins into cropped effect target coordinates", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  let captured = null;

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.getLayerEffectWriteTarget = () => ({ framebuffer: {}, texture: "field-output" });
  renderer.runFieldBlurPass = (options) => {
    captured = options;
    return true;
  };

  const result = renderer.applyFieldBlurTexture("field-source", [
    { blur: 50, x: 1600, y: 1700 },
  ], {
    height: 408,
    originX: 1500,
    originY: 1600,
    width: 508,
  });

  assert.equal(result, "field-output");
  assert.equal(captured.pins[0].x, 100);
  assert.equal(captured.pins[0].y, 100);
});

test("radial blur expands cropped effect output and keeps its document center stable", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;

  const sourceRect = { x: 100, y: 120, width: 80, height: 60 };
  const outputRect = renderer.getLayerEffectOutputRect({
    effects: [{
      amount: 100,
      centerX: 50,
      centerY: 50,
      enabled: true,
      mode: "zoom",
      type: "radial-blur",
    }],
  }, sourceRect);

  assert.ok(outputRect.x < sourceRect.x);
  assert.ok(outputRect.y < sourceRect.y);
  assert.ok(outputRect.width > sourceRect.width);
  assert.ok(outputRect.height > sourceRect.height);

  const center = renderer.resolveRadialBlurCenter(0, 100, {
    height: outputRect.height,
    outputRect,
    sourceRect,
    width: outputRect.width,
  });

  assert.ok(center.x > 0 && center.x < 1);
  assert.ok(center.y > 0 && center.y < 1);
  assert.ok(Math.abs((outputRect.x + center.x * outputRect.width) - sourceRect.x) < 0.00001);
  assert.ok(Math.abs((outputRect.y + (1 - center.y) * outputRect.height) - (sourceRect.y + sourceRect.height)) < 0.00001);
});

test("puppet deformed bounds include pixels moved outside a cropped target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 40,
    texture: {},
    width: 50,
    x: 100,
    y: 200,
  };
  const layer = {
    id: "image-1",
    puppet: {
      pins: [{ restX: 100, restY: 200, x: 80, y: 180 }],
    },
  };
  const resource = {
    cols: 1,
    rows: 1,
    vertices: new Float32Array(16),
  };

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.getPuppetGridSize = () => ({ cols: 1, rows: 1 });
  renderer.getPuppetMeshResource = () => resource;

  const bounds = renderer.getPuppetDeformedBounds(layer, target);

  assert.deepEqual(JSON.parse(JSON.stringify(bounds)), {
    height: 44,
    width: 54,
    x: 78,
    y: 178,
  });
});

test("document renderer exposes GPU snapshot lifecycle helpers for raster history", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const documentDrawTargetBody = source.match(
    /getDocumentDrawTarget\(layerId = this\.resolvePaintLayerId\(\)\) \{([\s\S]*?)\n    ensurePaintLayerForBrush/,
  )?.[1] || "";

  assert.match(source, /createRasterSnapshot\(targetOrLayerId, rect = null, label = "raster snapshot"\)/);
  assert.match(source, /dehydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /hydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /dehydrateRasterTarget\(target, options = \{\}\)/);
  assert.match(source, /hydrateRasterTarget\(target, options = \{\}\)/);
  assert.match(source, /getHistoryColdRasterTargetBytes\(\)/);
  assert.match(source, /snapshot\.dehydrateGpu = \(\) => this\.dehydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /snapshot\.hydrateGpu = \(\) => this\.hydrateRasterSnapshot\(snapshot\)/);
  assert.match(source, /restoreRasterSnapshotAsSparseTarget\(layerId, snapshot, options = \{\}\)/);
  assert.match(source, /restoreRasterSnapshot\(layerId, snapshot, options = \{\}\)/);
  assert.match(source, /options\.replaceSparse === true/);
  assert.match(source, /const useAuthoritativeSparseHistory = Boolean\(preferSparseRestore && this\.isPaintRasterLayer\(layerId, target\)\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\)/);
  assert.match(source, /deleteRasterSnapshot\(snapshot\) \{\s*if \(!snapshot\) \{\s*return;\s*\}/);
  assert.match(source, /const RASTER_HISTORY_TILE_SIZE = 256/);
  assert.match(source, /const RASTER_HISTORY_MOBILE_TILE_SIZE = 128/);
  assert.match(source, /beginRasterTileHistory\(layerId, dirtyRect, options = \{\}\)/);
  assert.match(source, /extendRasterTileHistory\(capture, dirtyRect, options = \{\}\)/);
  assert.match(source, /commitRasterTileHistory\(capture, options = \{\}\)/);
  assert.match(source, /captureRasterTileHistoryAfterSnapshots\(entry, options = \{\}\)/);
  assert.match(source, /restoreRasterTileHistoryEntry\(entry, snapshotKey = "before", options = \{\}\)/);
  assert.match(source, /tileDeltas/);
  assert.match(source, /createRasterOperationMemoryReport\(options = \{\}\)/);
  assert.match(source, /operationType: "raster-transform"/);
  assert.match(source, /getDocumentDrawTarget\(layerId = this\.resolvePaintLayerId\(\)\)/);
  assert.match(documentDrawTargetBody, /return \{\s*cropped: false,\s*framebuffer: null,\s*height: Math\.max\(1, Math\.round\(this\.height \|\| 1\)\),/);
  assert.doesNotMatch(documentDrawTargetBody, /rasterTargetsByLayerId\.get\(layerId\)/);
  assert.match(source, /const target = this\.getDocumentDrawTarget\(\)/);
  assert.match(source, /estimatePaintTargetCropPotential\(options = \{\}\)/);
  assert.match(source, /getRasterContentBounds\(layerId,/);
  assert.match(source, /const pixelPerfect = options\.pixelPerfect === true;/);
  assert.match(source, /coarseRect = \{ x: 0, y: 0, width: targetWidth, height: targetHeight \};/);
  assert.match(source, /coarseOnly: !precise/);
  assert.match(source, /action === "crop-candidate"/);
  assert.match(source, /potentialSavingsBytes/);
  assert.match(source, /copyRasterTargetRectToTarget\(sourceTarget, docRect, destinationTarget\)/);
  assert.match(source, /compactPaintTargetToContent\(layerId, options = \{\}\)/);
  assert.match(source, /compactInactivePaintTargets\(options = \{\}\)/);
  assert.match(source, /operationType: "paint-target-compact"/);
  assert.match(source, /source: "brush-materialize"/);
  assert.match(source, /getRasterAlphaAtPoint\(targetOrLayerId, x, y\)/);
  assert.match(source, /gl\.blitFramebuffer\(/);
  assert.match(source, /gl\.deleteFramebuffer\(snapshot\.framebuffer\)/);
  assert.match(source, /gl\.deleteTexture\(snapshot\.texture\)/);
});

test("raster history tiles skip untouched cells when brush patch rects are provided", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 512;
  renderer.height = 512;

  const rects = renderer.getRasterHistoryTileRects(
    { x: 0, y: 0, width: 512, height: 512 },
    {
      tilePatchRects: [
        { x: 12, y: 12, width: 20, height: 20 },
        { x: 300, y: 300, width: 20, height: 20 },
      ],
    },
  );

  assert.deepEqual(
    Array.from(rects, (rect) => `${rect.tx}:${rect.ty}`),
    ["0:0", "1:1"],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(rects[0].patchRect)), { x: 12, y: 12, width: 20, height: 20 });
  assert.deepEqual(JSON.parse(JSON.stringify(rects[1].patchRect)), { x: 300, y: 300, width: 20, height: 20 });
});

test("lazy raster tile history captures after snapshots on first undo", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const rect = { x: 8, y: 12, width: 16, height: 18 };
  const snapshots = [];
  const restores = [];

  renderer.createRasterSnapshot = (layerId, snapshotRect, label) => {
    snapshots.push({ label, layerId, rect: snapshotRect });
    return {
      bytes: 32,
      framebuffer: {},
      label,
      rect: { ...snapshotRect },
      texture: {},
    };
  };
  renderer.deleteRasterSnapshot = () => {};
  renderer.emitContentChange = () => {};
  renderer.emitRasterHistoryTileDebug = () => {};
  renderer.requestDraw = () => {};
  renderer.restoreRasterSnapshot = (layerId, snapshot, options = {}) => {
    restores.push({ layerId, label: snapshot.label, source: options.source });
    return true;
  };

  const capture = {
    affectedNodes: ["paint-main"],
    id: "capture-1",
    label: "brush-stroke",
    layerId: "paint-main",
    projectionInvalidation: [{ ...rect }],
    rect: { ...rect },
    source: "brush",
    tileDeltas: [{
      after: null,
      before: {
        bytes: 32,
        framebuffer: {},
        label: "brush-stroke-before-tile-0-0",
        rect: { ...rect },
        texture: {},
      },
      layerId: "paint-main",
      rect: { ...rect },
      tileRect: { ...rect },
      tx: 0,
      ty: 0,
    }],
    tileSize: 128,
  };

  const entry = renderer.commitRasterTileHistory(capture, {
    label: "brush-stroke",
    lazyAfter: true,
    redoSource: "history-redo-brush",
    source: "brush",
    undoSource: "history-undo-brush",
  });

  assert.equal(entry.lazyAfter, true);
  assert.equal(entry.tileDeltas[0].after, null);
  assert.equal(snapshots.length, 0);

  assert.equal(entry.undo(), true);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].label, "brush-stroke-after-tile-0-0");
  assert.equal(entry.tileDeltas[0].after.label, "brush-stroke-after-tile-0-0");

  assert.equal(entry.redo(), true);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(
    restores.map((restore) => restore.source),
    ["history-undo-brush", "history-redo-brush"],
  );
});

test("raster history uses smaller default tiles on mobile-like devices", () => {
  const desktop = Object.create(loadDocumentRenderer().DocumentRenderer.prototype);
  const mobile = Object.create(loadDocumentRenderer({
    coarsePointer: true,
    maxTouchPoints: 5,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
  }).DocumentRenderer.prototype);

  assert.equal(desktop.getRasterHistoryTileSize(), 256);
  assert.equal(mobile.getRasterHistoryTileSize(), 128);
  assert.equal(mobile.getRasterHistoryTileSize({ tileSize: 256 }), 256);
});

test("document renderer exposes mipmapped preview cache helpers", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /const PREVIEW_CACHE_MAX_SIZE = 4000/);
  assert.match(source, /createPreviewCache\(\)/);
  assert.match(source, /getPreviewCacheDimensions\(\)/);
  assert.match(source, /previewCacheMaxSize/);
  assert.match(source, /this\.previewCacheWidth = width/);
  assert.match(source, /this\.previewCacheHeight = height/);
  assert.match(source, /this\.previewCacheScale = scale/);
  assert.match(source, /updatePreviewCacheIfNeeded\(\)/);
  assert.match(source, /drawPreviewCacheToCanvas\(options = \{\}\)/);
  assert.doesNotMatch(source, /^\s*this\.createPreviewCache\(\);$/m);
  assert.match(source, /const didCreate = this\.createPreviewCache\(\)/);
  assert.match(source, /gl\.LINEAR_MIPMAP_LINEAR/);
  assert.match(source, /const PREVIEW_CACHE_ZOOM_THRESHOLD = 8\.0/);
  assert.match(source, /const isWithinPreviewCacheZoom = \(camera\.zoom \|\| 1\) < PREVIEW_CACHE_ZOOM_THRESHOLD/);
  assert.match(source, /const allowPreviewCache = options\.allowPreviewCache === true/);
  assert.match(source, /allowPreviewCache &&\s*isWithinPreviewCacheZoom/);
  assert.match(source, /!hasActiveEraserStroke/);
  assert.match(source, /!rasterTransformPreview/);
});

test("preview cache dimensions cap large documents while preserving aspect", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = { previewCacheMaxSize: 2048 };
  renderer.width = 4000;
  renderer.height = 3000;

  let dimensions = renderer.getPreviewCacheDimensions();

  assert.equal(dimensions.width, 2048);
  assert.equal(dimensions.height, 1536);
  assert.equal(dimensions.documentWidth, 4000);
  assert.equal(dimensions.documentHeight, 3000);
  assert.equal(dimensions.scale, 2048 / 4000);

  renderer.width = 1200;
  renderer.height = 800;
  dimensions = renderer.getPreviewCacheDimensions();

  assert.equal(dimensions.width, 1200);
  assert.equal(dimensions.height, 800);
  assert.equal(dimensions.scale, 1);
});

test("document renderer uses a procedural background texture", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createProceduralBackgroundTarget\(\)/);
  assert.match(source, /new Uint8Array\(\[255, 255, 255, 255\]\)/);
  assert.match(source, /label: "procedural background texture"/);
  assert.match(source, /resourceHeight: 1/);
  assert.match(source, /resourceWidth: 1/);
  assert.match(source, /bbox: \{\s*x: 0,\s*y: 0,\s*width: this\.width,\s*height: this\.height,\s*\}/);
  assert.match(source, /createBaseLayerTarget\(\) \{\s*const backgroundTarget = this\.createProceduralBackgroundTarget\(\)/);
  assert.doesNotMatch(source, /createBaseLayerTarget\(\) \{[\s\S]*?const target = this\.createRasterTarget\(\[0, 0, 0, 0\]\)/);
  assert.doesNotMatch(source, /const backgroundTarget = this\.createRasterTarget\(\[1, 1, 1, 1\]\)/);
});

test("createPaintTarget forwards layer metadata before resource tracing", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );

  assert.match(source, /createPaintTarget\(layerId = "", options = \{\}\) \{/);
  assert.match(source, /const targetLayerId = layerId \|\| options\.layerId/);
  assert.match(source, /layerId: targetLayerId/);
  assert.match(source, /ownerId: options\.ownerId \|\| targetLayerId/);
  assert.match(source, /reason: options\.reason \|\| options\.source \|\| "create-paint-target"/);
  assert.match(source, /this\.createPaintTarget\(layerId, \{\s*source: "get-paint-target"/);
  assert.match(source, /this\.createPaintTarget\(layerId, \{\s*source: "get-raster-target"/);
  assert.doesNotMatch(source, /this\.createPaintTarget\(\)/);
});

test("live eraser mask samples document coordinates for cropped layer renders", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const documentMaskMatches = source.match(
    /vec2 local = \(globalDocPixel - u_maskRect\.xy\) \/ max\(u_maskRect\.zw, vec2\(1\.0\)\);/g,
  ) || [];

  assert.equal(documentMaskMatches.length, 2);
  assert.doesNotMatch(source, /vec2 local = \(v_documentPixel - u_maskRect\.xy\)/);
});

test("document renderer composites supported layer blend modes in shader", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const previewCacheBody = source.match(/updatePreviewCache\(\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";
  const drawToCanvasBody = source.match(/drawToCanvas\(options = \{\}\) \{([\s\S]*?)\n    dispose\(\)/)?.[1] || "";

  assert.match(source, /LAYER_BLEND_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /uniform sampler2D u_backdropTexture/);
  assert.match(source, /vec3 applyBlendMode\(vec3 baseColor, vec3 sourceColor, int blendMode\)/);
  assert.match(source, /source\.rgb \/ sourceAlpha/);
  assert.match(source, /backdrop\.rgb \/ backdropAlpha/);
  assert.match(source, /copyCurrentFramebufferToLayerBlendBackdrop\(width, height\)/);
  assert.match(source, /gl\.copyTexSubImage2D/);
  assert.match(source, /createLayerBlendProgramInfo\(\)/);
  assert.match(source, /ensureLayerBlendProgramInfo\(\)/);
  assert.match(source, /renderLayerWithActiveStrokeTexture\(layerTexture, strokeTexture, strokeRect = null\)/);
  assert.match(previewCacheBody, /drawBlendTexture\(layerTexture, opacity, this\.getLayerBlendModeId\(layer\), renderResult\.rect, clipBase\)/);
  assert.match(drawToCanvasBody, /activeStrokeNeedsFullStack/);
  assert.match(drawToCanvasBody, /drawBlendTexture\(layerTexture, opacity, layerRect, clipBase, blendModeId\)/);
});

test("document renderer exposes non-destructive gaussian blur layer effect helpers", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const previewCacheBody = source.match(/updatePreviewCache\(\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /MOTION_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /FIELD_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /RADIAL_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /GRAIN_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /THRESHOLD_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /createGaussianBlurProgramInfo\(\)/);
  assert.match(source, /createMotionBlurProgramInfo\(\)/);
  assert.match(source, /createFieldBlurProgramInfo\(\)/);
  assert.match(source, /createRadialBlurProgramInfo\(\)/);
  assert.match(source, /createGrainProgramInfo\(\)/);
  assert.match(source, /createThresholdProgramInfo\(\)/);
  assert.match(source, /ensureMotionBlurProgramInfo\(\)/);
  assert.match(source, /ensureFieldBlurProgramInfo\(\)/);
  assert.match(source, /ensureRadialBlurProgramInfo\(\)/);
  assert.match(source, /ensureGrainProgramInfo\(\)/);
  assert.match(source, /ensureThresholdProgramInfo\(\)/);
  assert.match(source, /ensureLayerEffectScratchTargets\(/);
  assert.match(source, /runGaussianBlurPass\(/);
  assert.match(source, /runMotionBlurPass\(/);
  assert.match(source, /runFieldBlurPass\(/);
  assert.match(source, /runRadialBlurPass\(/);
  assert.match(source, /runGrainPass\(/);
  assert.match(source, /runThresholdPass\(/);
  assert.match(source, /applyGaussianBlurTexture\(sourceTexture, radius, options = \{\}\)/);
  assert.match(source, /applyMotionBlurTexture\(sourceTexture, distance, angle, options = \{\}\)/);
  assert.match(source, /applyFieldBlurTexture\(sourceTexture, pins, options = \{\}\)/);
  assert.match(source, /applyRadialBlurTexture\(\s*sourceTexture,\s*amount,\s*centerX = 50,\s*centerY = 50,\s*mode = "spin",\s*options = \{\},/);
  assert.match(source, /applyGrainTexture\(sourceTexture, grain, options = \{\}\)/);
  assert.match(source, /applyThresholdTexture\(sourceTexture, threshold, options = \{\}\)/);
  assert.match(source, /getLayerEffectOutputRect\(layer, targetRect\)/);
  assert.match(source, /getRadialBlurOutputRect\(radialBlur, outputRect, targetRect\)/);
  assert.match(source, /sourceRect: targetRect/);
  assert.match(source, /getLayerMotionBlur\(layer\)/);
  assert.match(source, /getLayerFieldBlur\(layer\)/);
  assert.match(source, /getLayerRadialBlur\(layer\)/);
  assert.match(source, /getLayerGrain\(layer\)/);
  assert.match(source, /getLayerThreshold\(layer\)/);
  assert.match(source, /getLayerRenderTexture\(layer, layerTarget\)/);
  assert.match(source, /for \(const effect of layer\.effects\)/);
  assert.match(source, /u_directionTexelStep/);
  assert.match(source, /u_pins\[8\]/);
  assert.match(source, /resolveFieldBlurRadius\(v_uv\)/);
  assert.match(source, /FIELD_BLUR_SAMPLE_COUNT/);
  assert.match(source, /pinValues\[offset \+ 1\] = 1 - pin\.y \/ height/);
  assert.match(source, /u_texelSize/);
  assert.match(source, /u_center/);
  assert.match(source, /u_mode/);
  assert.match(source, /float angleRange = amount \* 0\.0062831853;/);
  assert.match(source, /float zoomRange = amount \* 0\.0025;/);
  assert.match(source, /if \(u_mode > 0\.5\)/);
  assert.match(source, /sampleA = v_uv - radialVector \* zoomOffset/);
  assert.match(source, /vec2 rotatedClockwise/);
  assert.match(source, /sampleB = center \+ rotatedCounterClockwise/);
  assert.match(source, /Math\.cos\(angleRad\) \/ width/);
  assert.match(source, /Math\.sin\(angleRad\) \/ height/);
  assert.match(source, /centerY: resolvedCenter\.y/);
  assert.match(source, /u_monochrome/);
  assert.match(source, /vec2 documentPixel = u_origin/);
  assert.match(source, /effect\.type === "grain"/);
  assert.match(source, /u_threshold/);
  assert.match(source, /thresholdLuminance\(color\) \* 255\.0 >= level/);
  assert.match(source, /effect\.type === "threshold"/);
  assert.match(source, /copyTextureToRasterTarget\(sourceTexture, target, options = \{\}\)/);
  assert.match(source, /rasterizeLayerEffects\(layer, options = \{\}\)/);
  assert.match(source, /layer-effects-rasterize-before/);
  assert.match(source, /layer-effects-rasterize-after/);
  assert.match(source, /recordRasterOperation\(report = \{\}\)/);
  assert.match(source, /evictRasterScratchCachesForPolicy\(report = \{\}, options = \{\}\)/);
  assert.match(source, /shouldEvictRasterScratchForPolicy\(report = \{\}\)/);
  assert.match(source, /policy === "large" \|\| policy === "huge"/);
  assert.match(source, /this\.deletePreviewCache\(\)/);
  assert.match(source, /this\.deleteLayerEffectScratchTargets\(\)/);
  assert.match(source, /this\.deleteActiveStrokeScratchTarget\(\)/);
  assert.match(source, /this\.evictRasterScratchCachesForPolicy\(recorded\)/);
  assert.match(source, /operationType: "layer-effects-rasterize"/);
  assert.match(source, /scratchBytes\s*=\s*\n\s*this\.estimateRasterTargetBytes\(this\.layerEffectScratchA\)/);
  assert.match(source, /sourceTexture: layerTexture/);
  assert.doesNotMatch(source, /this\.hasPuppetLayerTransform\(layer\) \? 0 : this\.getLayerEffectPadding\(layer\)/);
  assert.match(source, /this\.deleteGaussianBlurResources\(\)/);
  assert.match(source, /this\.deleteMotionBlurResources\(\)/);
  assert.match(source, /this\.deleteFieldBlurResources\(\)/);
  assert.match(source, /this\.deleteRadialBlurResources\(\)/);
  assert.match(source, /this\.deleteGrainResources\(\)/);
  assert.match(source, /this\.deleteThresholdResources\(\)/);
  assert.match(previewCacheBody, /for \(const renderResult of this\.getLayerRenderResults\(layer, layerTarget\)\)/);
  assert.match(previewCacheBody, /sourceTexture: layerTexture/);
  assert.doesNotMatch(previewCacheBody, /!hasLayerEffects/);
  assert.doesNotMatch(source, /rasterTargetsByLayerId\.set\([^)]*layerEffectScratch/);
});

test("puppet rasterize commits the deformed mesh through snapshots", () => {
  const rendererSource = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-renderer.js"),
    "utf8",
  );
  const puppetToolSource = fs.readFileSync(
    path.join(repoRoot, "js", "puppet-transform-tool.js"),
    "utf8",
  );

  assert.match(rendererSource, /rasterizePuppetLayer\(layer, options = \{\}\)/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(target, null, "puppet-rasterize-before"\)/);
  assert.match(rendererSource, /const outputRect = this\.getPuppetDeformedBounds\(layer, target\)/);
  assert.match(rendererSource, /this\.createRasterTargetForRect\(outputRect\)/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(destinationTarget, null, "puppet-rasterize-after"\)/);
  assert.match(rendererSource, /puppet-rasterize"\}\-retile/);
  assert.match(rendererSource, /beforePreferSparse: preferSparseRestore/);
  assert.match(rendererSource, /afterPreferSparse/);
  assert.match(rendererSource, /operationType: "puppet-rasterize"/);
  assert.match(rendererSource, /tool: "puppet"/);
  assert.match(rendererSource, /this\.replaceRasterTarget\(layer\.id, destinationTarget,/);
  assert.match(rendererSource, /sourceTexture: sourceSnapshot\.texture/);
  assert.match(puppetToolSource, /this\.isActive\(\) && nextTool !== PUPPET_TOOL_MODE/);
  assert.match(puppetToolSource, /this\.rasterizeActivePuppetLayer\(\)/);
  assert.match(puppetToolSource, /window\.addEventListener\("cbo:before-history-action", this\.handleBeforeHistoryAction\)/);
  assert.match(puppetToolSource, /namespace\.documentHistory\?\.flushLayerState\?\.\(this\.layerModel\)/);
  assert.match(puppetToolSource, /source: "puppet-rasterize-preview-clear"/);
  assert.match(puppetToolSource, /runAfterNextPaint\(\(\) => \{/);
  assert.match(puppetToolSource, /source: "puppet-rasterize-rollback"/);
  assert.match(puppetToolSource, /source: "history-undo-puppet-rasterize"/);
  assert.match(puppetToolSource, /source: "history-redo-puppet-rasterize"/);
  assert.match(puppetToolSource, /preferSparse: beforePreferSparse/);
  assert.match(puppetToolSource, /replaceSparse: beforePreferSparse/);
  assert.match(puppetToolSource, /preferSparse: afterPreferSparse/);
  assert.match(puppetToolSource, /replaceSparse: afterPreferSparse/);
});

test("puppet pin creation is blocked outside visible alpha", () => {
  const puppetToolSource = fs.readFileSync(
    path.join(repoRoot, "js", "puppet-transform-tool.js"),
    "utf8",
  );

  assert.match(puppetToolSource, /canCreatePinAtRestPoint\(layer, restPoint\)/);
  assert.match(puppetToolSource, /getRasterAlphaAtPoint\(\s*layer\.id,\s*restPoint\.x,\s*restPoint\.y,\s*\) > PUPPET_OVERLAY_ALPHA_THRESHOLD/);
  assert.match(puppetToolSource, /if \(!this\.canCreatePinAtRestPoint\(layer, restPoint\)\) \{\s*return;\s*\}/);
});
