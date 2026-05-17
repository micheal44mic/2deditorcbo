const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

const documentRendererModulePaths = [
  ["js", "document", "document-renderer-shaders.js"],
  ["js", "document", "document-renderer-raster-targets.js"],
  ["js", "document", "document-renderer-history-snapshots.js"],
  ["js", "document", "document-renderer-webgl-programs.js"],
  ["js", "document", "document-renderer-viewport-culling.js"],
  ["js", "document", "document-renderer-layer-effects.js"],
  ["js", "document", "document-renderer-compositing.js"],
  ["js", "document", "document-renderer.js"],
];

function readDocumentRendererSources() {
  return documentRendererModulePaths
    .map((parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8"))
    .join("\n");
}

function loadDocumentRenderer(options = {}) {
  const matchCoarsePointer = options.coarsePointer === true;
  const window = {
    CBO: {},
    addEventListener() {},
    devicePixelRatio: Number.isFinite(options.devicePixelRatio) ? options.devicePixelRatio : 1,
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
      deviceMemory: Number.isFinite(options.deviceMemory) ? options.deviceMemory : undefined,
      maxTouchPoints: Number.isFinite(options.maxTouchPoints) ? options.maxTouchPoints : 0,
      platform: options.platform || "",
      userAgent: options.userAgent || "",
    },
    window,
  });

  if (options.historyCompression === true) {
    vm.runInContext(
      fs.readFileSync(path.join(repoRoot, "js", "document", "document-history-compression.js"), "utf8"),
      context,
    );
  }

  for (const modulePath of documentRendererModulePaths) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, ...modulePath), "utf8"), context);
  }

  return {
    context,
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

test("dehydrateRasterTarget queues async compression after saving raw CPU pixels", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer({ historyCompression: true });
  const renderer = Object.create(DocumentRenderer.prototype);
  const glCalls = [];
  const queued = [];
  const rawBytes = 16 * 16 * 4;
  const target = {
    framebuffer: {},
    height: 16,
    id: "target-1",
    layerId: "paint-1",
    texture: {},
    width: 16,
  };

  renderer.gl = {
    bindFramebuffer: (...args) => glCalls.push(["bindFramebuffer", ...args]),
    deleteFramebuffer: (framebuffer) => glCalls.push(["deleteFramebuffer", framebuffer]),
    deleteTexture: (texture) => glCalls.push(["deleteTexture", texture]),
    FRAMEBUFFER: "FRAMEBUFFER",
    readPixels: (x, y, width, height, format, type, pixels) => {
      pixels.fill(0);
    },
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };
  renderer.deleteRasterFramebuffer = () => {};
  renderer.deleteRasterTexture = () => {};
  window.CBO.queueHistoryCompression = (queuedTarget, options) => {
    queued.push({ options, target: queuedTarget });
    return true;
  };

  assert.equal(renderer.dehydrateRasterTarget(target), true);
  assert.equal(target.state, "CPU_COLD");
  assert.equal(target.cpuPixelsEncoding, null);
  assert.equal(target.cpuRawBytes, rawBytes);
  assert.equal(target.cpuBytes, rawBytes);
  assert.equal(target.historyCompressionState, "raw-pending");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].target, target);
  assert.equal(queued[0].options.historyId, "target-1");
  assert.equal(queued[0].options.layerId, "paint-1");
  assert.equal(queued[0].options.timings, undefined);

  const pixels = renderer.getRasterTargetCpuPixels(target);

  assert.equal(pixels.byteLength, rawBytes);
  assert.equal(pixels.every((value) => value === 0), true);
});

test("restoreRasterSnapshot can transiently hydrate compressed CPU history snapshots", () => {
  const { context, DocumentRenderer, window } = loadDocumentRenderer({ historyCompression: true });
  const renderer = Object.create(DocumentRenderer.prototype);
  const calls = [];
  const VmUint8Array = vm.runInContext("Uint8Array", context);
  const rawPixels = new VmUint8Array(2 * 2 * 4);

  rawPixels.fill(0);
  const packed = window.CBO.HistoryCompression.compressRgba(rawPixels);
  const target = {
    framebuffer: { id: "target-fb" },
    height: 2,
    texture: { id: "target-texture" },
    width: 2,
    x: 0,
    y: 0,
  };
  const snapshot = {
    bytes: rawPixels.byteLength,
    cpuBytes: packed.bytes.byteLength,
    cpuPixels: packed.bytes,
    cpuPixelsEncoding: packed.encoding,
    cpuRawBytes: rawPixels.byteLength,
    label: "transform-before",
    rect: { x: 0, y: 0, width: 2, height: 2 },
    state: "CPU_COLD",
  };

  renderer.gl = {
    bindFramebuffer: (...args) => calls.push(["bindFramebuffer", ...args]),
    bindTexture: (...args) => calls.push(["bindTexture", ...args]),
    blitFramebuffer: (...args) => calls.push(["blitFramebuffer", ...args]),
    checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE",
    COLOR_ATTACHMENT0: "COLOR_ATTACHMENT0",
    COLOR_BUFFER_BIT: "COLOR_BUFFER_BIT",
    createFramebuffer: () => ({ id: "snapshot-fb" }),
    createTexture: () => ({ id: "snapshot-texture" }),
    deleteFramebuffer: (framebuffer) => calls.push(["deleteFramebuffer", framebuffer?.id || framebuffer]),
    deleteTexture: (texture) => calls.push(["deleteTexture", texture?.id || texture]),
    DRAW_FRAMEBUFFER: "DRAW_FRAMEBUFFER",
    FRAMEBUFFER: "FRAMEBUFFER",
    FRAMEBUFFER_COMPLETE: "FRAMEBUFFER_COMPLETE",
    framebufferTexture2D: (...args) => calls.push(["framebufferTexture2D", ...args]),
    NEAREST: "NEAREST",
    readPixels: () => {
      throw new Error("transient restore should not re-read snapshot pixels");
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    texImage2D: (...args) => calls.push(["texImage2D", ...args]),
    texParameteri: (...args) => calls.push(["texParameteri", ...args]),
    TEXTURE_2D: "TEXTURE_2D",
    TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
    TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
    TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
    TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };
  renderer.rasterTargetsByLayerId = new Map([["paint-1", target]]);
  renderer.deleteRasterFramebuffer = (framebuffer) => calls.push(["unregisterFramebuffer", framebuffer?.id || framebuffer]);
  renderer.deleteRasterTexture = (texture) => calls.push(["unregisterTexture", texture?.id || texture]);
  renderer.registerRasterFramebuffer = () => {};
  renderer.registerRasterTexture = () => ({ id: "registered-texture" });
  renderer.needsCopyOnWriteDetach = () => false;
  renderer.isSparseRasterTarget = () => false;
  renderer.isPaintRasterLayer = () => false;
  renderer.getRasterTarget = () => target;
  renderer.getRasterTargetDocumentRect = (item) => ({
    x: item.x || 0,
    y: item.y || 0,
    width: item.width,
    height: item.height,
  });
  renderer.getRasterTargetLocalRect = () => ({
    docRect: { x: 0, y: 0, width: 2, height: 2 },
    localRect: { x: 0, y: 0, width: 2, height: 2 },
    targetRect: { x: 0, y: 0, width: 2, height: 2 },
  });
  renderer.canRestoreRasterSnapshot = () => true;
  renderer.markRasterTargetDirty = () => {};
  renderer.commitVisualDirtyChange = () => {};

  assert.equal(renderer.restoreRasterSnapshot("paint-1", snapshot, {
    emit: false,
    releaseSnapshotGpuAfterRestore: true,
  }), true);
  assert.equal(snapshot.state, "CPU_COLD");
  assert.equal(snapshot.texture, null);
  assert.equal(snapshot.framebuffer, null);
  assert.equal(snapshot.cpuPixels, packed.bytes);
  assert.equal(snapshot.cpuPixelsEncoding, "rle-rgba-v1");
  assert.equal(snapshot.cpuRawBytes, rawPixels.byteLength);
  assert.equal(snapshot.cpuBytes, packed.bytes.byteLength);
  assert.ok(calls.some((call) => call[0] === "texImage2D" && call.at(-1)?.byteLength === rawPixels.byteLength));
  assert.ok(calls.some((call) => call[0] === "blitFramebuffer"));
  assert.ok(calls.some((call) => call[0] === "deleteTexture" && call[1] === "snapshot-texture"));
  assert.ok(calls.some((call) => call[0] === "deleteFramebuffer" && call[1] === "snapshot-fb"));
});

test("copy-on-write raster targets stay shared during memory cleanup", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const sourceTarget = {
    copyOnWriteRefCount: 1,
    framebuffer: { id: "source-framebuffer" },
    height: 40,
    texture: { id: "source-texture" },
    width: 30,
    x: 8,
    y: 12,
  };
  const sharedTarget = {
    copyOnWrite: true,
    copyOnWriteSource: sourceTarget,
    framebuffer: sourceTarget.framebuffer,
    height: 40,
    texture: sourceTarget.texture,
    width: 30,
    x: 8,
    y: 12,
  };

  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-copy", type: "paint" }),
  };
  renderer.paintLayerId = "paint-main";
  renderer.rasterTargetsByLayerId = new Map([["paint-copy", sharedTarget]]);

  assert.equal(renderer.dehydrateRasterTarget(sharedTarget), false);
  assert.equal(renderer.dehydrateRasterTarget(sourceTarget), false);
  assert.equal(sharedTarget.texture, sourceTarget.texture);
  assert.equal(sharedTarget.framebuffer, sourceTarget.framebuffer);

  assert.deepEqual(JSON.parse(JSON.stringify(renderer.compactPaintTargetToContent("paint-copy"))), {
    action: "copy-on-write-kept",
    bytesAfter: 0,
    bytesBefore: 0,
    layerId: "paint-copy",
    savingsBytes: 0,
  });
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

test("clearLayer can release an active empty paint target as sparse", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const texture = {};
  const framebuffer = {};
  const deletedTargets = [];
  const invalidations = [];
  const emitted = [];

  renderer.width = 4096;
  renderer.height = 4096;
  renderer.rasterTargetIdSequence = 1;
  renderer.paintLayerId = "paint-1";
  renderer.texture = texture;
  renderer.framebuffer = framebuffer;
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.rasterTargetsByLayerId = new Map([
    ["paint-1", {
      clearColor: [0, 0, 0, 0],
      framebuffer,
      height: 4096,
      layerId: "paint-1",
      texture,
      width: 4096,
    }],
  ]);
  renderer.ensureWritableRasterTarget = () => null;
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.deletePuppetMeshResource = () => {};
  renderer.invalidatePreviewCache = (source, detail) => invalidations.push({ detail, source });
  renderer.emitContentChange = (detail) => emitted.push(detail);

  assert.equal(renderer.clearLayer("paint-1", {
    releaseRaster: true,
    source: "unit-clear-empty-layer",
  }), true);

  const nextTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(renderer.isSparseRasterTarget(nextTarget), true);
  assert.equal(nextTarget.tiles.size, 0);
  assert.equal(renderer.estimateRasterTargetBytes(nextTarget), 0);
  assert.equal(renderer.texture, null);
  assert.equal(renderer.framebuffer, null);
  assert.equal(deletedTargets.length, 1);
  assert.equal(deletedTargets[0].texture, texture);
  assert.equal(invalidations.length, 0);
  assert.equal(emitted[0].layerId, "paint-1");
  assert.equal(emitted[0].source, "unit-clear-empty-layer");
  assert.equal(emitted[0].preserveDirtyRects, true);
  assert.equal(Array.isArray(emitted[0].rects), true);
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

test("raster snapshots and transform bounds preserve off-artboard pixels", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  let currentFramebuffer = null;
  const target = {
    framebuffer: { id: "off-artboard-target" },
    height: 4,
    texture: { id: "off-artboard-texture" },
    width: 4,
    x: 120,
    y: 10,
  };

  renderer.width = 100;
  renderer.height = 100;
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
  renderer.gl = {
    bindFramebuffer: (targetName, framebuffer) => {
      if (targetName === "READ_FRAMEBUFFER") {
        currentFramebuffer = framebuffer;
      }
    },
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    readPixels: (x, y, width, height, format, type, pixels) => {
      if (currentFramebuffer?.id === "off-artboard-target") {
        for (let index = 3; index < pixels.length; index += 4) {
          pixels[index] = 255;
        }
      }
    },
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
  };

  const mappedRect = renderer.getRasterTargetLocalRect(target, {
    height: 4,
    width: 4,
    x: 120,
    y: 10,
  });
  const visibleBounds = renderer.getRasterTargetPixelContentBounds(target, {
    alphaThreshold: 2,
    padding: 0,
    pixelPerfect: true,
  });
  const preservedBounds = renderer.getRasterTargetPixelContentBounds(target, {
    alphaThreshold: 2,
    clampToDocument: false,
    padding: 0,
    pixelPerfect: true,
  });
  const unclampedTiles = renderer.getRasterHistoryTileRects({
    height: 10,
    width: 10,
    x: 130,
    y: 10,
  }, {
    clampToDocument: false,
    tileSize: 64,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(mappedRect.docRect)), {
    height: 4,
    width: 4,
    x: 120,
    y: 10,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mappedRect.localRect)), {
    height: 4,
    width: 4,
    x: 0,
    y: 0,
  });
  assert.equal(visibleBounds, null);
  assert.deepEqual(JSON.parse(JSON.stringify(preservedBounds)), {
    height: 4,
    width: 4,
    x: 120,
    y: 10,
  });
  assert.equal(unclampedTiles.length, 1);
  assert.equal(unclampedTiles[0].tx, 2);
});

test("duplicateRasterTarget shares source pixels until copy-on-write detach", () => {
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
    height: 40,
    texture: { id: "destination-texture" },
    width: 30,
    x: 8,
    y: 12,
  };
  const copyCalls = [];
  const contentChanges = [];
  const invalidations = [];

  renderer.width = 100;
  renderer.height = 100;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map([["source-layer", sourceTarget]]);
  renderer.deletePuppetMeshResource = () => {};
  renderer.emitContentChange = (detail) => contentChanges.push(detail);
  renderer.invalidatePreviewCache = (source) => invalidations.push(source);
  renderer.updateRasterTargetResourceMetadata = () => {};
  renderer.createRasterTarget = (clearColor, options = {}) => {
    assert.deepEqual(JSON.parse(JSON.stringify(clearColor)), sourceTarget.clearColor);
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      cropped: true,
      height: 40,
      layerId: "copy-layer",
      reason: "copy-on-write-detach",
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
  renderer.deleteRasterTargetObject = () => {
    throw new Error("copy-on-write duplicate should not delete resources");
  };

  assert.equal(renderer.duplicateRasterTarget("source-layer", "copy-layer", {
    emit: false,
    source: "unit-duplicate",
  }), true);

  const sharedTarget = renderer.rasterTargetsByLayerId.get("copy-layer");

  assert.equal(renderer.isCopyOnWriteRasterTarget(sharedTarget), true);
  assert.equal(sharedTarget.texture, sourceTarget.texture);
  assert.equal(sharedTarget.framebuffer, sourceTarget.framebuffer);
  assert.equal(renderer.estimateRasterTargetBytes(sharedTarget), 0);
  assert.equal(sourceTarget.copyOnWriteRefCount, 1);
  assert.equal(copyCalls.length, 0);
  assert.deepEqual(invalidations, ["unit-duplicate"]);
  assert.equal(contentChanges.length, 0);

  renderer.deleteRasterTargetObject = (target) => DocumentRenderer.prototype.deleteRasterTargetObject.call(renderer, target);

  const writableTarget = renderer.ensureWritableRasterTarget("copy-layer", {
    source: "copy-on-write-detach",
  });

  assert.equal(writableTarget, destinationTarget);
  assert.equal(renderer.rasterTargetsByLayerId.get("copy-layer"), destinationTarget);
  assert.equal(sourceTarget.copyOnWriteRefCount, 0);
  assert.equal(copyCalls.length, 1);
  assert.equal(copyCalls[0].destination, destinationTarget);
  assert.equal(copyCalls[0].source, sourceTarget);
  assert.deepEqual(JSON.parse(JSON.stringify(copyCalls[0].rect)), {
    height: 40,
    width: 30,
    x: 8,
    y: 12,
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
  assert.equal(renderer.isCopyOnWriteRasterTarget(destinationTarget), true);
  assert.equal(destinationTarget.texture, null);
  assert.equal(destinationTarget.framebuffer, null);
  assert.equal(destinationTarget.tiles.size, 1);
  assert.equal(destinationTarget.tiles, sourceTarget.tiles);
  assert.equal(copyCalls.length, 0);
  assert.equal(sourceTarget.copyOnWriteRefCount, 1);
  assert.equal(renderer.estimateRasterTargetBytes(destinationTarget), 0);
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

test("paint rect routing rejects primary-canvas targets for offset artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const primaryTarget = {
    cropped: false,
    framebuffer: { id: "primary-fb" },
    height: 2048,
    layerId: "paint-1",
    texture: { id: "primary-texture" },
    width: 1048,
    x: 0,
    y: 0,
  };

  window.CBO.getDocumentArtboardUnionRect = () => ({
    height: 2048,
    width: 4096,
    x: 0,
    y: 0,
  });
  renderer.width = 1048;
  renderer.height = 2048;
  renderer.paintLayerId = "paint-1";
  renderer.rasterTargetsByLayerId = new Map([["paint-1", primaryTarget]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };

  assert.equal(renderer.shouldSparsifyRasterTargetForPaintRect("paint-1", primaryTarget, {
    height: 20,
    width: 20,
    x: 1200,
    y: 20,
  }), true);
  assert.equal(renderer.shouldSparsifyRasterTargetForPaintRect("paint-1", primaryTarget, {
    height: 20,
    width: 20,
    x: 20,
    y: 20,
  }), false);
  assert.equal(renderer.getRasterTargetsForPaintRect("paint-1", {
    height: 20,
    width: 20,
    x: 1200,
    y: 20,
  }, {
    sparse: false,
    source: "unit-offset-artboard-eraser",
  }).length, 0);
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

test("prewarmRasterTargetsForPaintRect limits new sparse tile creation", () => {
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

  const firstPass = renderer.prewarmRasterTargetsForPaintRect("paint-1", {
    height: 4000,
    width: 4000,
    x: 0,
    y: 0,
  }, {
    maxNewTiles: 2,
    tilePatchRects: [
      { patchRect: { height: 20, width: 20, x: 16, y: 16 }, tx: 0, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 900, y: 16 }, tx: 3, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 1800, y: 16 }, tx: 7, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 2700, y: 16 }, tx: 10, ty: 0 },
    ],
  });
  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");

  assert.equal(firstPass.length, 2);
  assert.equal(sparseTarget.tiles.size, 2);

  const secondPass = renderer.prewarmRasterTargetsForPaintRect("paint-1", {
    height: 4000,
    width: 4000,
    x: 0,
    y: 0,
  }, {
    maxNewTiles: 2,
    tilePatchRects: [
      { patchRect: { height: 20, width: 20, x: 16, y: 16 }, tx: 0, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 900, y: 16 }, tx: 3, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 1800, y: 16 }, tx: 7, ty: 0 },
      { patchRect: { height: 20, width: 20, x: 2700, y: 16 }, tx: 10, ty: 0 },
    ],
  });

  assert.equal(secondPass.length, 4);
  assert.equal(sparseTarget.tiles.size, 4);
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

test("restoreRasterSnapshot invalidates previous dense bounds when restoring a smaller target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const dirtyChanges = [];
  const existingTarget = {
    framebuffer: { id: "target-fb" },
    height: 512,
    layerId: "paint-1",
    texture: { id: "target-texture" },
    width: 512,
    x: 0,
    y: 0,
  };
  const snapshot = {
    framebuffer: { id: "snapshot-fb" },
    rect: { height: 128, width: 128, x: 64, y: 64 },
    texture: { id: "snapshot-texture" },
  };

  renderer.width = 512;
  renderer.height = 512;
  renderer.gl = {
    COLOR_BUFFER_BIT: 0x4000,
    DRAW_FRAMEBUFFER: 0x8CA9,
    NEAREST: 0x2600,
    READ_FRAMEBUFFER: 0x8CA8,
    bindFramebuffer() {},
    blitFramebuffer() {},
  };
  renderer.rasterTargetsByLayerId = new Map([["paint-1", existingTarget]]);
  renderer.getRasterTarget = () => existingTarget;
  renderer.needsCopyOnWriteDetach = () => false;
  renderer.commitVisualDirtyChange = (detail) => dirtyChanges.push(detail);

  assert.equal(renderer.restoreRasterSnapshot("paint-1", snapshot, {
    source: "unit-restore-dense-dirty",
  }), true);

  assert.deepEqual(dirtyChanges.map((detail) => ({ ...detail.rect })), [
    { height: 512, width: 512, x: 0, y: 0 },
  ]);
});

test("restoreRasterSnapshot invalidates previous dense bounds when rebuilding sparse target", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const dirtyChanges = [];
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
    rect: { height: 128, width: 128, x: 64, y: 64 },
    texture: { id: "snapshot-texture" },
  };

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
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deleteRasterTargetObject = () => {};
  renderer.deletePuppetMeshResource = () => {};
  renderer.isRasterTargetFullyTransparent = () => false;
  renderer.requestDraw = () => {};
  renderer.commitVisualDirtyChange = (detail) => dirtyChanges.push(detail);

  assert.equal(renderer.restoreRasterSnapshot("paint-1", snapshot, {
    preferSparse: true,
    source: "unit-restore-sparse-dirty",
  }), true);

  assert.deepEqual(dirtyChanges.map((detail) => ({ ...detail.rect })), [
    { height: 512, width: 512, x: 0, y: 0 },
  ]);
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
  const snapshotLabels = [];
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
  renderer.createRasterSnapshot = (target, rect, label) => {
    snapshotLabels.push(label);
    return {
      framebuffer: { id: `${label}-fb` },
      label,
      rect: rect || renderer.getRasterTargetDocumentRect(target),
      texture: { id: `${label}-texture` },
    };
  };

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
  assert.deepEqual(snapshotLabels, ["unit-transform-before-target"]);
  assert.equal(pushedEntry.snapshots.after, null);

  renderer.restoreRasterSnapshot = (layerId, snapshot, options = {}) => {
    restoreCalls.push({ layerId, options, snapshot });
    return true;
  };

  assert.equal(pushedEntry.undo(), true);
  assert.deepEqual(snapshotLabels, ["unit-transform-before-target", "unit-transform-after-target"]);
  assert.equal(pushedEntry.snapshots.after.label, "unit-transform-after-target");
  assert.equal(pushedEntry.redo(), true);
  assert.deepEqual(
    restoreCalls.map((call) => [call.options.preferSparse, call.options.replaceSparse]),
    [[true, true], [true, true]],
  );
  assert.deepEqual(
    restoreCalls.map((call) => call.options.releaseSnapshotGpuAfterRestore),
    [true, true],
  );
});

test("commitRasterTransform records pure moves as placement history without pixel snapshots", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    framebuffer: { id: "target-fb" },
    height: 40,
    layerId: "paint-1",
    texture: { id: "target-texture" },
    width: 50,
    x: 10,
    y: 20,
  };
  const dirtyChanges = [];
  let pushedEntry = null;
  let snapshotCount = 0;

  window.CBO.documentBounds = {
    boundsToRect: (bounds) => ({ ...bounds }),
    getClampedRasterBox: (rect) => ({ ...rect }),
    getUnionRect: (first, second) => ({
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      width: Math.max(first.x + first.width, second.x + second.width) - Math.min(first.x, second.x),
      height: Math.max(first.y + first.height, second.y + second.height) - Math.min(first.y, second.y),
    }),
    quadToBounds: (quad) => ({
      x: Math.min(...quad.map((point) => point.x)),
      y: Math.min(...quad.map((point) => point.y)),
      width: Math.max(...quad.map((point) => point.x)) - Math.min(...quad.map((point) => point.x)),
      height: Math.max(...quad.map((point) => point.y)) - Math.min(...quad.map((point) => point.y)),
    }),
    rectToBounds: (rect) => ({ ...rect }),
  };
  window.CBO.documentHistory = {
    push(entry) {
      pushedEntry = entry;
      return true;
    },
  };
  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", target]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.clearRasterTransformPreview = () => {};
  renderer.commitVisualDirtyChange = (detail) => dirtyChanges.push(detail);
  renderer.createRasterSnapshot = () => {
    snapshotCount += 1;
    throw new Error("pure move should not create history snapshots");
  };
  renderer.deletePuppetMeshResource = () => {};
  renderer.drawTexturedQuad = () => {
    throw new Error("pure move should not redraw pixels");
  };
  renderer.getTileBasedPreviewDirtyRects = (rects) => rects.filter(Boolean).map((rect) => ({ ...rect }));
  renderer.markRasterTargetDirty = () => {};
  renderer.recordRasterOperation = (report) => report;
  renderer.requestDraw = () => {};
  renderer.updateRasterTargetResourceMetadata = () => {};

  const sourceRect = { x: 10, y: 20, width: 50, height: 40 };
  const destQuad = [
    { x: 17, y: 29 },
    { x: 67, y: 29 },
    { x: 67, y: 69 },
    { x: 17, y: 69 },
  ];
  const didCommit = renderer.commitRasterTransform({
    destQuad,
    layerId: "paint-1",
    source: "unit-move",
    sourceRect,
    sourceSnapshot: { texture: { id: "preview-texture" } },
  });

  assert.equal(didCommit, true);
  assert.equal(snapshotCount, 0);
  assert.equal(target.x, 17);
  assert.equal(target.y, 29);
  assert.ok(pushedEntry);
  assert.equal(pushedEntry.beforeSnapshot, undefined);
  assert.equal(pushedEntry.afterSnapshot, undefined);
  assert.equal(pushedEntry.memoryPolicy.persistentBytes, 0);

  assert.equal(pushedEntry.undo(), true);
  assert.equal(target.x, 10);
  assert.equal(target.y, 20);
  assert.equal(pushedEntry.redo(), true);
  assert.equal(target.x, 17);
  assert.equal(target.y, 29);
  assert.ok(dirtyChanges.some((detail) => detail.source === "history-undo-unit-move"));
  assert.ok(dirtyChanges.some((detail) => detail.source === "history-redo-unit-move"));
});

test("commitRasterTransform fast-paths sparse pure moves before materialization", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    height: 512,
    layerId: "paint-1",
    sparse: true,
    tileSize: 256,
    tiles: new Map(),
    version: 0,
    width: 512,
  };
  let pushedEntry = null;
  let materializeCount = 0;

  window.CBO.documentBounds = {
    boundsToRect: (bounds) => ({ ...bounds }),
    getClampedRasterBox: (rect) => ({ ...rect }),
    getUnionRect: (first, second) => ({
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      width: Math.max(first.x + first.width, second.x + second.width) - Math.min(first.x, second.x),
      height: Math.max(first.y + first.height, second.y + second.height) - Math.min(first.y, second.y),
    }),
    quadToBounds: (quad) => ({
      x: Math.min(...quad.map((point) => point.x)),
      y: Math.min(...quad.map((point) => point.y)),
      width: Math.max(...quad.map((point) => point.x)) - Math.min(...quad.map((point) => point.x)),
      height: Math.max(...quad.map((point) => point.y)) - Math.min(...quad.map((point) => point.y)),
    }),
    rectToBounds: (rect) => ({ ...rect }),
  };
  window.CBO.documentHistory = {
    push(entry) {
      pushedEntry = entry;
      return true;
    },
  };
  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", target]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.clearRasterTransformPreview = () => {};
  renderer.commitVisualDirtyChange = () => {};
  renderer.deletePuppetMeshResource = () => {};
  renderer.getTileBasedPreviewDirtyRects = (rects) => rects.filter(Boolean).map((rect) => ({ ...rect }));
  renderer.materializeRasterTarget = () => {
    materializeCount += 1;
    throw new Error("pure sparse move should not materialize before placement");
  };
  renderer.recordRasterOperation = (report) => report;
  renderer.requestDraw = () => {};
  renderer.updateRasterTargetResourceMetadata = () => {};

  const didCommit = renderer.commitRasterTransform({
    destQuad: [
      { x: 8, y: 12 },
      { x: 520, y: 12 },
      { x: 520, y: 524 },
      { x: 8, y: 524 },
    ],
    layerId: "paint-1",
    source: "unit-sparse-move",
    sourceRect: { x: 0, y: 0, width: 512, height: 512 },
  });

  assert.equal(didCommit, true);
  assert.equal(materializeCount, 0);
  assert.equal(target.version, 1);
  assert.ok(pushedEntry);
  assert.equal(pushedEntry.memoryPolicy.scratchBytes, 0);
});

test("commitRasterTransform treats fractional drags as rounded placement history", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const target = {
    framebuffer: { id: "target-fb" },
    height: 40,
    layerId: "paint-1",
    texture: { id: "target-texture" },
    width: 50,
    x: 10,
    y: 20,
  };
  let pushedEntry = null;
  let snapshotCount = 0;

  window.CBO.documentBounds = {
    boundsToRect: (bounds) => ({ ...bounds }),
    getClampedRasterBox: (rect) => ({ ...rect }),
    getUnionRect: (first, second) => ({
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      width: Math.max(first.x + first.width, second.x + second.width) - Math.min(first.x, second.x),
      height: Math.max(first.y + first.height, second.y + second.height) - Math.min(first.y, second.y),
    }),
    quadToBounds: (quad) => ({
      x: Math.min(...quad.map((point) => point.x)),
      y: Math.min(...quad.map((point) => point.y)),
      width: Math.max(...quad.map((point) => point.x)) - Math.min(...quad.map((point) => point.x)),
      height: Math.max(...quad.map((point) => point.y)) - Math.min(...quad.map((point) => point.y)),
    }),
    rectToBounds: (rect) => ({ ...rect }),
  };
  window.CBO.documentHistory = {
    push(entry) {
      pushedEntry = entry;
      return true;
    },
  };
  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", target]]);
  renderer.layerModel = {
    findEntryById: () => ({ id: "paint-1", type: "paint" }),
  };
  renderer.clearRasterTransformPreview = () => {};
  renderer.commitVisualDirtyChange = () => {};
  renderer.createRasterSnapshot = () => {
    snapshotCount += 1;
    throw new Error("fractional move should not create history snapshots");
  };
  renderer.deletePuppetMeshResource = () => {};
  renderer.drawTexturedQuad = () => {
    throw new Error("fractional move should not redraw pixels");
  };
  renderer.getTileBasedPreviewDirtyRects = (rects) => rects.filter(Boolean).map((rect) => ({ ...rect }));
  renderer.markRasterTargetDirty = () => {};
  renderer.recordRasterOperation = (report) => report;
  renderer.requestDraw = () => {};
  renderer.updateRasterTargetResourceMetadata = () => {};

  const sourceRect = { x: 10, y: 20, width: 50, height: 40 };
  const didCommit = renderer.commitRasterTransform({
    destQuad: [
      { x: 17.42, y: 28.67 },
      { x: 67.42, y: 28.67 },
      { x: 67.42, y: 68.67 },
      { x: 17.42, y: 68.67 },
    ],
    layerId: "paint-1",
    source: "unit-fractional-move",
    sourceRect,
    sourceSnapshot: { texture: { id: "preview-texture" } },
  });

  assert.equal(didCommit, true);
  assert.equal(snapshotCount, 0);
  assert.equal(target.x, 17);
  assert.equal(target.y, 29);
  assert.ok(pushedEntry);
  assert.equal(pushedEntry.beforeSnapshot, undefined);
  assert.equal(pushedEntry.afterSnapshot, undefined);
  assert.equal(pushedEntry.memoryPolicy.persistentBytes, 0);

  assert.equal(pushedEntry.undo(), true);
  assert.equal(target.x, 10);
  assert.equal(target.y, 20);
  assert.equal(pushedEntry.redo(), true);
  assert.equal(target.x, 17);
  assert.equal(target.y, 29);
});

test("partial sparse raster transform undo restores into sparse target instead of replacing it", () => {
  const source = readDocumentRendererSources();
  const start = source.indexOf("const useAuthoritativeSparseHistory = Boolean");
  const end = source.indexOf(
    "const afterSnapshot = this.createRasterSnapshot(layerId, dirtyRect",
    start,
  );
  const nonCroppedTransformBody = start >= 0 && end > start
    ? source.slice(start, end)
    : "";
  const entryStart = source.indexOf(
    "const entry = this.finalizeRasterEditHistoryEntry(layerId, {",
    end,
  );
  const entryEnd = source.indexOf("destroy: () => {", entryStart);
  const nonCroppedHistoryEntry = entryStart >= 0 && entryEnd > entryStart
    ? source.slice(entryStart, entryEnd)
    : "";

  assert.ok(nonCroppedTransformBody);
  assert.match(nonCroppedTransformBody, /const sparseSnapshotCoversWholeTarget = Boolean/);
  assert.match(nonCroppedTransformBody, /this\.containsRasterHistoryRect\(dirtyRect, targetRect\)/);
  assert.ok(nonCroppedHistoryEntry);
  assert.match(nonCroppedHistoryEntry, /replaceSparse: sparseSnapshotCoversWholeTarget/);
  assert.doesNotMatch(nonCroppedHistoryEntry, /replaceSparse: preferSparseRestore/);
  assert.doesNotMatch(nonCroppedHistoryEntry, /replaceSparse: afterPreferSparse/);
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

test("transform artboard transfer chooses the artboard with dominant overlap", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  window.CBO.getDocumentArtboards = () => [
    {
      height: 100,
      id: "active-document",
      width: 100,
      x: 0,
      y: 0,
    },
    {
      height: 100,
      id: "secondary",
      width: 100,
      x: 100,
      y: 0,
    },
  ];
  renderer.layerModel = {
    findEntryArtboardId: () => "active-document",
    findEntryById: () => ({
      artboardId: "active-document",
      id: "paint-1",
      type: "paint",
    }),
  };

  const transfer = renderer.resolveTransformArtboardTransfer("paint-1", {
    destQuad: [
      { x: 80, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 100 },
      { x: 80, y: 100 },
    ],
    transformMode: "free",
  });

  assert.equal(transfer.toArtboardId, "secondary");
  assert.equal(transfer.fromArtboardId, "active-document");
  assert.equal(Math.round(transfer.overlapRatio * 100), 80);

  const shallowTransfer = renderer.resolveTransformArtboardTransfer("paint-1", {
    destQuad: [
      { x: 75, y: 0 },
      { x: 105, y: 0 },
      { x: 105, y: 100 },
      { x: 75, y: 100 },
    ],
    transformMode: "free",
  });

  assert.equal(shallowTransfer, null);
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
  const source = readDocumentRendererSources();
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

test("raster tile history uses empty snapshots for freshly created sparse paint tiles", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  let realSnapshotCount = 0;

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
    layerId: options.layerId,
    texture: { id: `tex-${options.x}-${options.y}` },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.createRasterSnapshot = () => {
    realSnapshotCount += 1;
    return null;
  };
  renderer.emitRasterHistoryTileDebug = () => {};

  renderer.ensureRasterTargetsForPaintRect("paint-1", {
    height: 160,
    width: 160,
    x: 16,
    y: 16,
  }, {
    source: "unit-fresh-tile",
  });

  const sparseTarget = renderer.rasterTargetsByLayerId.get("paint-1");
  const firstTile = sparseTarget.tiles.get("0:0");

  assert.equal(firstTile.freshEmptyPaintTile, true);

  const capture = renderer.beginRasterTileHistory("paint-1", {
    height: 160,
    width: 160,
    x: 16,
    y: 16,
  }, {
    label: "brush-stroke",
    source: "brush",
  });

  assert.equal(realSnapshotCount, 0);
  assert.equal(capture.tileDeltas.length, 1);
  assert.equal(capture.tileDeltas[0].before.empty, true);
  assert.equal(capture.tileDeltas[0].before.bytes, 0);
  assert.equal(firstTile.freshEmptyPaintTile, false);

  assert.equal(renderer.extendRasterTileHistory(capture, {
    height: 220,
    width: 220,
    x: 16,
    y: 16,
  }, {
    label: "brush-stroke",
    source: "brush",
  }), true);
  assert.equal(realSnapshotCount, 0);
  assert.equal(capture.tileDeltas[0].before.empty, true);
  assert.deepEqual(JSON.parse(JSON.stringify(capture.tileDeltas[0].before.rect)), {
    height: 220,
    width: 220,
    x: 16,
    y: 16,
  });
});

test("markRasterTargetDirty clears fresh empty state on sparse paint wrappers", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const tileTarget = {
    freshEmptyPaintTile: true,
    version: 0,
  };
  const paintTarget = {
    target: tileTarget,
    version: 0,
  };

  renderer.markRasterTargetDirty(paintTarget);

  assert.equal(tileTarget.freshEmptyPaintTile, false);
  assert.equal(tileTarget.version, 1);
  assert.equal(paintTarget.version, 1);
});

test("empty raster snapshots restore sparse paint tiles by clearing the covered tile", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const deletedTargets = [];

  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.isMobileLikeDevice = () => false;
  renderer.gl = {};
  renderer.deleteRasterTargetObject = (target) => deletedTargets.push(target);
  renderer.commitVisualDirtyChange = () => {};
  renderer.requestDraw = () => {};

  const sparseTarget = renderer.createSparseRasterTarget("paint-1");
  const tileTarget = {
    framebuffer: { id: "tile-fb" },
    height: 256,
    texture: { id: "tile-texture" },
    tileKey: "0:0",
    width: 256,
    x: 0,
    y: 0,
  };

  sparseTarget.tiles.set("0:0", tileTarget);
  renderer.rasterTargetsByLayerId.set("paint-1", sparseTarget);

  const didRestore = renderer.restoreRasterSnapshot("paint-1", {
    empty: true,
    rect: { x: 0, y: 0, width: 256, height: 256 },
    state: "EMPTY",
  }, {
    emit: false,
  });

  assert.equal(didRestore, true);
  assert.equal(sparseTarget.tiles.has("0:0"), false);
  assert.deepEqual(deletedTargets, [tileTarget]);
});

test("empty raster snapshots restore sparse paint tiles with partial scissor clears", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const calls = [];

  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetIdSequence = 1;
  renderer.rasterTargetsByLayerId = new Map();
  renderer.isMobileLikeDevice = () => false;
  renderer.gl = {
    COLOR_BUFFER_BIT: 0x4000,
    FRAMEBUFFER: 0x8D40,
    SCISSOR_TEST: 0x0C11,
    bindFramebuffer(target, framebuffer) {
      calls.push(["bindFramebuffer", target, framebuffer?.id || null]);
    },
    clear(mask) {
      calls.push(["clear", mask]);
    },
    clearColor(r, g, b, a) {
      calls.push(["clearColor", r, g, b, a]);
    },
    disable(flag) {
      calls.push(["disable", flag]);
    },
    enable(flag) {
      calls.push(["enable", flag]);
    },
    scissor(x, y, width, height) {
      calls.push(["scissor", x, y, width, height]);
    },
  };
  renderer.deleteRasterTargetObject = () => {
    throw new Error("partial empty restore should not delete the whole tile");
  };
  renderer.commitVisualDirtyChange = () => {};
  renderer.pruneTransparentSparseRasterTiles = () => {};
  renderer.requestDraw = () => {};

  const sparseTarget = renderer.createSparseRasterTarget("paint-1");
  const tileTarget = {
    framebuffer: { id: "tile-fb" },
    height: 256,
    texture: { id: "tile-texture" },
    tileKey: "0:0",
    width: 256,
    x: 0,
    y: 0,
  };

  sparseTarget.tiles.set("0:0", tileTarget);
  renderer.rasterTargetsByLayerId.set("paint-1", sparseTarget);

  const didRestore = renderer.restoreRasterSnapshot("paint-1", {
    empty: true,
    rect: { x: 20, y: 30, width: 50, height: 40 },
    state: "EMPTY",
  }, {
    emit: false,
  });

  assert.equal(didRestore, true);
  assert.equal(sparseTarget.tiles.has("0:0"), true);
  assert.equal(tileTarget.version, 1);
  assert.deepEqual(calls.find((call) => call[0] === "scissor"), [
    "scissor",
    20,
    186,
    50,
    40,
  ]);
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

test("renderer caps DPR and cache size for mobile-like and Android devices", () => {
  const desktopLoad = loadDocumentRenderer({ devicePixelRatio: 3 });
  const mobileLoad = loadDocumentRenderer({
    coarsePointer: true,
    deviceMemory: 6,
    devicePixelRatio: 3,
    maxTouchPoints: 5,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
  });
  const lowMemoryMobileLoad = loadDocumentRenderer({
    coarsePointer: true,
    deviceMemory: 4,
    devicePixelRatio: 3,
    maxTouchPoints: 5,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile",
  });
  const androidLoad = loadDocumentRenderer({
    coarsePointer: true,
    deviceMemory: 6,
    devicePixelRatio: 3,
    maxTouchPoints: 5,
    platform: "Linux armv8l",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile",
  });
  const lowMemoryAndroidLoad = loadDocumentRenderer({
    coarsePointer: true,
    deviceMemory: 4,
    devicePixelRatio: 3,
    maxTouchPoints: 5,
    platform: "Linux armv8l",
    userAgent: "Mozilla/5.0 (Linux; Android 12) Mobile",
  });
  const androidRenderer = Object.create(androidLoad.DocumentRenderer.prototype);
  const mobileRenderer = Object.create(mobileLoad.DocumentRenderer.prototype);

  mobileRenderer.options = {};
  androidRenderer.options = {};

  assert.equal(desktopLoad.DocumentRenderer.getPerformanceDpr(), 2);
  assert.equal(mobileLoad.DocumentRenderer.getPerformanceDpr(), 1.5);
  assert.equal(lowMemoryMobileLoad.DocumentRenderer.getPerformanceDpr(), 1.25);
  assert.equal(androidLoad.DocumentRenderer.getPerformanceDpr(), 1.25);
  assert.equal(lowMemoryAndroidLoad.DocumentRenderer.getPerformanceDpr(), 1.15);
  assert.equal(mobileRenderer.getPreviewCacheMaxSize(), 1536);
  assert.equal(mobileRenderer.getPreviewCacheOverscanCssPx(), 128);
  assert.equal(mobileRenderer.getViewportRenderOverscanCssPx(), 128);
  assert.equal(androidRenderer.getPreviewCacheMaxSize(), 1024);
  assert.equal(androidRenderer.getPreviewCacheOverscanCssPx(), 64);
  assert.equal(androidRenderer.getViewportRenderOverscanCssPx(), 64);
});

test("document renderer exposes mipmapped preview cache helpers", () => {
  const source = readDocumentRendererSources();

  assert.match(source, /const PREVIEW_CACHE_MAX_SIZE = 2048/);
  assert.match(source, /const MOBILE_PREVIEW_CACHE_MAX_SIZE = 1536/);
  assert.match(source, /const PREVIEW_CACHE_SCOPE_DEFAULT = "visible-artboards"/);
  assert.match(source, /const PREVIEW_CACHE_VIEWPORT_OVERSCAN_CSS_PX = 256/);
  assert.match(source, /const MOBILE_PREVIEW_CACHE_OVERSCAN_CSS_PX = 128/);
  assert.match(source, /const MOBILE_VIEWPORT_RENDER_OVERSCAN_CSS_PX = 128/);
  assert.match(source, /const MOBILE_RENDER_DPR_CAP = 1\.5/);
  assert.match(source, /const ANDROID_RENDER_DPR_CAP = 1\.25/);
  assert.match(source, /const LOW_MEMORY_ANDROID_RENDER_DPR_CAP = 1\.15/);
  assert.match(source, /const ARTBOARD_RESIDENCY_IDLE_DELAY_MS = 7000/);
  assert.match(source, /const ARTBOARD_RESIDENCY_WARM_HOLD_MS = 7000/);
  assert.match(source, /const ANDROID_PREVIEW_CACHE_MAX_SIZE = 1024/);
  assert.match(source, /const ANDROID_PREVIEW_CACHE_OVERSCAN_CSS_PX = 64/);
  assert.match(source, /const ANDROID_VIEWPORT_RENDER_OVERSCAN_CSS_PX = 64/);
  assert.match(source, /function isAndroidZoomOutPreviewCacheAllowed\(options = \{\}\)/);
  assert.match(source, /function isAndroidPreviewCacheDisabled\(options = \{\}\)/);
  assert.match(source, /function isAndroidDirtyRegionsDisabled\(\)/);
  assert.match(source, /antialias: false/);
  assert.match(source, /static getPerformanceDpr\(options = \{\}\)/);
  assert.match(source, /static isAndroidLikeEnvironment\(\)/);
  assert.match(source, /createPreviewCache\(options = \{\}\)/);
  assert.match(source, /getPreviewCacheDimensions\(options = \{\}\)/);
  assert.match(source, /getPreviewCacheMaxSize\(options = \{\}\)/);
  assert.match(source, /getPreviewCacheOverscanCssPx\(\)/);
  assert.match(source, /getViewportRenderOverscanCssPx\(options = \{\}\)/);
  assert.match(source, /previewCacheMaxSize/);
  assert.match(source, /previewCacheScope/);
  assert.match(source, /previewCacheOverscanCssPx/);
  assert.match(source, /this\.previewCacheWidth = width/);
  assert.match(source, /this\.previewCacheHeight = height/);
  assert.match(source, /this\.previewCacheScale = scale/);
  assert.match(source, /this\.previewCacheDocumentRect = \{ \.\.\.dimensions\.documentRect \}/);
  assert.match(source, /publishPreviewCacheScopeInfo\(dimensions\.scopeInfo\)/);
  assert.match(source, /getPreviewCacheDocumentRect\(options = \{\}\)/);
  assert.match(source, /updatePreviewCacheIfNeeded\(options = \{\}\)/);
  assert.match(source, /getPreviewCacheExactDocumentRect\(fallbackRect = null\)/);
  assert.match(source, /drawPreviewCacheToCanvas\(options = \{\}\)/);
  assert.doesNotMatch(source, /^\s*this\.createPreviewCache\(\);$/m);
  assert.match(source, /const didCreate = this\.createPreviewCache\(options\)/);
  assert.match(source, /gl\.LINEAR_MIPMAP_LINEAR/);
  assert.match(source, /const PREVIEW_CACHE_ZOOM_THRESHOLD = 1\.0/);
  assert.match(source, /const PIXEL_PREVIEW_NEAREST_ZOOM_THRESHOLD = 10\.01/);
  assert.match(source, /if \(safeZoom < 10\.01\) \{\s*discard;/);
  assert.match(source, /smoothstep\(10\.01, 12\.0, safeZoom\)/);
  assert.match(source, /getViewportTextureMagFilter\(camera = \{\}\)/);
  assert.match(source, /shouldDrawPixelGrid\(camera = \{\}\)/);
  assert.match(source, /function isPixelPerfectRenderingEnabled\(\)/);
  assert.match(source, /namespace\.androidPixelPerfectEnabled !== true/);
  assert.match(source, /shouldUsePreviewCacheForCamera\(camera = \{\}, previewCacheDimensions = null\)/);
  assert.match(source, /const previewCacheOptions = \{/);
  assert.match(source, /const previewCacheDimensions = this\.getPreviewCacheDimensions\(previewCacheOptions\)/);
  assert.match(source, /const canUsePreviewCacheAtCurrentZoom = this\.shouldUsePreviewCacheForCamera\(camera, previewCacheDimensions\)/);
  assert.match(source, /const androidZoomOutPreviewCacheAllowed = isAndroidZoomOutPreviewCacheAllowed\(previewCacheOptions\)/);
  assert.match(source, /const allowPreviewCache = options\.allowPreviewCache === true && !isAndroidPreviewCacheDisabled\(previewCacheOptions\)/);
  assert.match(source, /const deferPreviewCacheUpdate = Boolean\(/);
  assert.match(source, /options\.deferPreviewCacheUpdate === true/);
  assert.match(source, /const activeStrokeDefersLayerEffects = Boolean\(/);
  assert.match(source, /const activeStrokeDefersLayerBlend = Boolean\(/);
  assert.match(source, /const deferInteractiveResidencyHydration = Boolean\(/);
  assert.match(source, /deferInteractiveResidencyHydration\s*\?\s*0\s*:\s*this\.hydrateHotArtboardTargets/);
  assert.match(source, /const delay = Math\.max\(idleDelay, warmHold\)/);
  assert.match(source, /skipLayerEffectsForInteractiveStroke/);
  assert.match(source, /skipLayerBlendForInteractiveStroke/);
  assert.match(source, /skipLayerEffects: skipLayerEffectsForInteractiveStroke/);
  assert.match(source, /skipLayerBlendForInteractiveStroke \? 0 : this\.getLayerBlendModeId\(layer\)/);
  assert.match(source, /!options\.skipLayerEffects && this\.hasEnabledLayerEffects\(layer\)/);
  assert.match(source, /!hasColdOrWarm \|\| options\.activeStrokeTexture \|\| options\.deferPreviewCacheUpdate === true/);
  assert.match(source, /const previewCacheDocumentRect = previewCacheDimensions\.documentRect/);
  assert.match(source, /const exactCacheDocRect = this\.getPreviewCacheExactDocumentRect\(cacheDocRect\)/);
  assert.doesNotMatch(source, /previewCacheCoversDocumentBounds/);
  assert.match(source, /allowPreviewCache &&\s*canUsePreviewCacheAtCurrentZoom/);
  assert.match(source, /this\.previewCacheReady && !this\.previewCacheDirty && this\.previewTexture/);
  assert.match(source, /!hasActiveEraserStroke/);
  assert.match(source, /!rasterTransformPreview/);
});

test("document raster targets sample linearly at zoom intermediates", () => {
  const source = readDocumentRendererSources();
  const createRasterTargetBody = source.match(
    /createRasterTarget\(clearColor = \[0, 0, 0, 0\], options = \{\}\) \{([\s\S]*?)\n    createPaintTarget/,
  )?.[1] || "";

  assert.match(createRasterTargetBody, /Sampling lineare/);
  assert.match(createRasterTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MIN_FILTER, gl\.LINEAR\)/);
  assert.match(createRasterTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.LINEAR\)/);
  assert.doesNotMatch(createRasterTargetBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.NEAREST\)/);
});

test("document renderer switches raster magnification to nearest only at high zoom", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.gl = {
    LINEAR: "linear",
    NEAREST: "nearest",
  };

  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 1 }), "linear");
  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 10 }), "linear");
  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 10.01 }), "nearest");
  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 16 }), "nearest");
});

test("document renderer disables pixel-perfect preview on Android performance mode", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.gl = {
    LINEAR: "linear",
    NEAREST: "nearest",
  };
  window.CBO.androidPerformanceMode = true;
  window.CBO.androidPixelPerfectEnabled = false;

  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 16 }), "linear");
  assert.equal(renderer.shouldDrawPixelGrid({ zoom: 16 }), false);

  window.CBO.androidPixelPerfectEnabled = true;

  assert.equal(renderer.getViewportTextureMagFilter({ zoom: 16 }), "nearest");
  assert.equal(renderer.shouldDrawPixelGrid({ zoom: 16 }), true);
});

test("document renderer uses preview cache only when downsampling zoom-out", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.getPreviewCacheDimensions = () => ({ scale: 0.5 });

  assert.equal(renderer.shouldUsePreviewCacheForCamera({ zoom: 0.25 }), true);
  assert.equal(renderer.shouldUsePreviewCacheForCamera({ zoom: 0.75 }), false);
  assert.equal(renderer.shouldUsePreviewCacheForCamera({ zoom: 1 }), false);
  assert.equal(renderer.shouldUsePreviewCacheForCamera({ zoom: 10 }), false);
  assert.equal(renderer.shouldDrawPixelGrid({ zoom: 10 }), false);
  assert.equal(renderer.shouldDrawPixelGrid({ zoom: 10.01 }), true);
});

test("document renderer allows Android mipmapped preview cache only for idle zoom-out", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer({
    maxTouchPoints: 5,
    platform: "Linux armv8l",
    userAgent: "Mozilla/5.0 (Linux; Android 12) Mobile",
  });
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {};
  window.CBO.androidPerformanceMode = true;
  window.CBO.androidFullRenderMode = true;
  window.CBO.androidPreviewCacheEnabled = false;
  window.CBO.androidZoomOutPreviewCacheEnabled = true;
  window.CBO.androidZoomOutPreviewCacheMaxSize = 1536;

  assert.equal(DocumentRenderer.isAndroidPreviewCacheDisabled({
    camera: { zoom: 0.5 },
  }), false);
  assert.equal(DocumentRenderer.isAndroidPreviewCacheDisabled({
    camera: { zoom: 1 },
  }), true);
  assert.equal(DocumentRenderer.isAndroidPreviewCacheDisabled({
    camera: { zoom: 0.5 },
    deferPreviewCacheUpdate: true,
  }), true);
  assert.equal(DocumentRenderer.isAndroidPreviewCacheDisabled({
    activeStrokeTexture: {},
    camera: { zoom: 0.5 },
  }), true);
  assert.equal(renderer.getPreviewCacheMaxSize({
    androidZoomOutPreviewCache: true,
  }), 1536);

  window.CBO.androidZoomOutPreviewCacheEnabled = false;

  assert.equal(DocumentRenderer.isAndroidPreviewCacheDisabled({
    camera: { zoom: 0.5 },
  }), true);
});

test("preview cache supports dirty-region compositing", () => {
  const source = readDocumentRendererSources();
  const previewCacheBody = source.match(/updatePreviewCache\(options = \{\}\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /previewDirtyRects/);
  assert.match(source, /previewLastDirtyMode/);
  assert.match(source, /createPreviewDirtyStats\(\)/);
  assert.match(source, /recordPreviewDirtyFrame\(options = \{\}\)/);
  assert.match(source, /getPreviewDirtyStats\(\)/);
  assert.match(source, /getDirtyRegionRectsFromOptions\(options = \{\}\)/);
  assert.match(source, /getPreviewDirtyTileSize\(options = \{\}\)/);
  assert.match(source, /getTileBasedPreviewDirtyRects\(rects = \[\], options = \{\}\)/);
  assert.match(source, /createVisualDirtyChange\(options = \{\}\)/);
  assert.match(source, /commitVisualDirtyChange\(options = \{\}\)/);
  assert.match(source, /androidDirtyRegionsDisabled: true/);
  assert.match(source, /android-preview-cache-disabled/);
  assert.match(source, /compactDirtyRegionRects\(rects = \[\], options = \{\}\)/);
  assert.match(source, /getPreviewDirtyRegionScissor\(rect, cacheWidth, cacheHeight, cacheScale, options = \{\}\)/);
  assert.match(source, /getPreviewDirtyRegionScissors\(rects, cacheWidth, cacheHeight, cacheScale, options = \{\}\)/);
  assert.match(source, /invalidatePreviewCache\(reason = "unknown", options = \{\}\)/);
  assert.match(source, /forcedFullCause/);
  assert.match(source, /preview-cache-not-ready/);
  assert.match(source, /namespace\.debugPreviewDirtyRegions === true/);
  assert.match(source, /rects: forcedFullCause === "preview-cache-not-ready"/);
  assert.match(source, /no-dirty-rects/);
  assert.match(source, /incomingDirtyRectsLength: dirtyRects\.length/);
  assert.match(source, /preserveDirtyRects === true/);
  assert.match(source, /mergeAdjacent: options\.mergeAdjacent/);
  assert.match(source, /this\.previewDirtyCompactOptions/);
  assert.match(source, /this\.invalidatePreviewCache\(detail\.source \|\| "document-content-change", detail\)/);
  assert.match(source, /stackOnlySources/);
  assert.match(previewCacheBody, /const dirtyRects = this\.previewCacheReady && Array\.isArray\(this\.previewDirtyRects\)/);
  assert.match(previewCacheBody, /const dirtyScissors = dirtyRects/);
  assert.match(previewCacheBody, /const drawPreviewCachePass = \(dirtyScissor = null\) =>/);
  assert.match(previewCacheBody, /const previewPassScissors = Array\.isArray\(dirtyScissors\) && dirtyScissors\.length > 0/);
  assert.match(previewCacheBody, /const restorePreviewScissor = \(scissor\) =>/);
  assert.match(previewCacheBody, /const withLayerPreviewArtboardClip = \(layer, callback\) =>/);
  assert.match(previewCacheBody, /const artboardScissor = getPreviewScissorForDocumentRect\(artboardRect\)/);
  assert.match(previewCacheBody, /if \(!artboardScissor\) \{\s*return;\s*\}/);
  assert.match(previewCacheBody, /gl\.enable\(gl\.SCISSOR_TEST\)/);
  assert.match(previewCacheBody, /gl\.scissor\(scissor\.x, scissor\.y, scissor\.width, scissor\.height\)/);
  assert.match(previewCacheBody, /restorePreviewScissor\(dirtyScissor \|\| null\)/);
  assert.match(previewCacheBody, /withLayerPreviewArtboardClip\(layer, \(\) =>/);
  assert.match(previewCacheBody, /this\.previewDirtyRects = \[\]/);
  assert.match(previewCacheBody, /this\.recordPreviewDirtyFrame\(\{/);
});

test("preview dirty regions can preserve adjacent tile rectangles", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const rects = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 100, y: 0, width: 100, height: 100 },
  ];

  renderer.width = 1000;
  renderer.height = 1000;
  renderer.layerModel = { findEntryById: () => null };
  renderer.previewCacheReady = true;
  renderer.previewCacheDirty = false;
  renderer.previewDirtyRects = [];
  renderer.previewDirtyCompactOptions = null;

  assert.equal(renderer.compactDirtyRegionRects(rects).length, 1);
  assert.equal(renderer.compactDirtyRegionRects(rects, { mergeAdjacent: false }).length, 2);

  renderer.invalidatePreviewCache("unit-tile-dirty", {
    preserveDirtyRects: true,
    rects,
  });

  assert.equal(renderer.previewDirtyRects.length, 2);
  assert.equal(renderer.previewDirtyCompactOptions.mergeAdjacent, false);
});

test("preview dirty tiles split separated transform bounds without unioning empty space", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 2000;
  renderer.height = 2000;

  const rects = renderer.getTileBasedPreviewDirtyRects([
    { x: 10, y: 10, width: 1500, height: 40 },
    { x: 10, y: 600, width: 1500, height: 40 },
  ], { previewDirtyTileSize: 512 });

  assert.equal(rects.length, 6);
  assert.equal(rects.some((rect) => rect.height > 512), false);
  assert.equal(rects.some((rect) => rect.width >= 1500), false);
});

test("preview dirty regions clip spanning rects to document artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {};
  renderer.width = 1400;
  renderer.height = 400;
  renderer.layerModel = { findEntryById: () => null };
  renderer.previewCacheReady = true;
  renderer.previewCacheDirty = false;
  renderer.previewDirtyRects = [];
  renderer.previewDirtyCompactOptions = null;
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 400, height: 400 },
    { id: "right", x: 1000, y: 0, width: 400, height: 400 },
  ];

  renderer.invalidatePreviewCache("unit-artboard-dirty", {
    preserveDirtyRects: true,
    rect: { x: 100, y: 100, width: 1100, height: 40 },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(renderer.previewDirtyRects)), [
    { x: 100, y: 100, width: 300, height: 40 },
    { x: 1000, y: 100, width: 200, height: 40 },
  ]);
  assert.equal(renderer.previewDirtyRects.some((rect) => rect.x > 400 && rect.x < 1000), false);
});

test("preview dirty tiles skip gaps between document artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {};
  renderer.width = 1400;
  renderer.height = 400;
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 400, height: 400 },
    { id: "right", x: 1000, y: 0, width: 400, height: 400 },
  ];

  const rects = renderer.getTileBasedPreviewDirtyRects([
    { x: 100, y: 100, width: 1100, height: 40 },
  ], { previewDirtyTileSize: 256 });

  assert.deepEqual(JSON.parse(JSON.stringify(rects)), [
    { x: 100, y: 100, width: 156, height: 40 },
    { x: 256, y: 100, width: 144, height: 40 },
    { x: 1000, y: 100, width: 24, height: 40 },
    { x: 1024, y: 100, width: 176, height: 40 },
  ]);
  assert.equal(rects.some((rect) => rect.x >= 400 && rect.x < 1000), false);
});

test("preview dirty regions skip rects fully outside document artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {};
  renderer.width = 1400;
  renderer.height = 400;
  renderer.layerModel = { findEntryById: () => null };
  renderer.previewCacheReady = true;
  renderer.previewCacheDirty = false;
  renderer.previewDirtyRects = [];
  renderer.previewDirtyCompactOptions = null;
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 400, height: 400 },
    { id: "right", x: 1000, y: 0, width: 400, height: 400 },
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(renderer.getTileBasedPreviewDirtyRects([
    { x: 500, y: 100, width: 100, height: 40 },
  ], { previewDirtyTileSize: 256 }))), []);

  renderer.commitVisualDirtyChange({
    emit: false,
    preserveDirtyRects: true,
    rect: { x: 500, y: 100, width: 100, height: 40 },
    source: "unit-gap-dirty",
  });

  assert.equal(renderer.previewCacheDirty, false);
  assert.deepEqual(JSON.parse(JSON.stringify(renderer.previewDirtyRects)), []);
});

test("visual dirty changes normalize operations into one dirty payload", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const emitted = [];
  const invalidated = [];

  renderer.width = 2000;
  renderer.height = 2000;
  renderer.emitContentChange = (detail) => emitted.push(detail);
  renderer.invalidatePreviewCache = (source, detail) => invalidated.push({ detail, source });

  const detail = renderer.createVisualDirtyChange({
    layerId: "paint-main",
    source: "unit-visual-change",
    sourceRect: { x: 10, y: 10, width: 1500, height: 40 },
    targetRect: { x: 10, y: 600, width: 1500, height: 40 },
    usePreviewDirtyTiles: true,
  });

  assert.equal(detail.source, "unit-visual-change");
  assert.equal(detail.layerId, "paint-main");
  assert.equal(detail.preserveDirtyRects, true);
  assert.equal(detail.rect, null);
  assert.equal(detail.rects.length, 6);

  renderer.commitVisualDirtyChange({
    emit: false,
    layerId: "paint-main",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    source: "unit-invalidate-only",
  });
  renderer.commitVisualDirtyChange({
    layerId: "paint-main",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    source: "unit-emit",
  });

  assert.equal(invalidated[0].source, "unit-invalidate-only");
  assert.equal(emitted[0].source, "unit-emit");
});

test("raster transform artboard transfer does not force a full layer invalidation", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const invalidated = [];

  renderer.pruneOrphanRasterTargets = () => {};
  renderer.invalidatePreviewCache = (source) => invalidated.push(source);

  renderer.handleLayerModelChange({
    detail: {
      source: "raster-transform-artboard-transfer",
    },
  });
  renderer.handleLayerModelChange({
    detail: {
      source: "history-redo-raster-transform-artboard-transfer",
    },
  });

  assert.deepEqual(invalidated, []);

  renderer.handleLayerModelChange({
    detail: {
      source: "unit-layer-artboard-transfer",
    },
  });

  assert.deepEqual(invalidated, ["layers-change"]);
});

test("history memory maintenance does not force a preview cache redraw", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const invalidated = [];

  renderer.previewCacheDirty = false;
  renderer.pruneOrphanRasterTargets = () => {};
  renderer.invalidatePreviewCache = (source) => invalidated.push(source);

  renderer.handleHistoryChange({
    detail: {
      source: "history-gpu-hot-prune",
    },
  });
  renderer.handleHistoryChange({
    detail: {
      source: "clear",
    },
  });
  renderer.handleHistoryChange({
    detail: {
      source: "dispose",
    },
  });

  assert.deepEqual(invalidated, []);

  renderer.handleHistoryChange({
    detail: {
      source: "undo",
    },
  });

  assert.deepEqual(invalidated, ["history-change"]);
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
  assert.equal(dimensions.documentRect.x, 0);
  assert.equal(dimensions.documentRect.y, 0);
  assert.equal(dimensions.documentRect.width, 4000);
  assert.equal(dimensions.documentRect.height, 3000);
  assert.equal(dimensions.scale, 2048 / 4000);

  renderer.width = 1200;
  renderer.height = 800;
  dimensions = renderer.getPreviewCacheDimensions();

  assert.equal(dimensions.width, 1200);
  assert.equal(dimensions.height, 800);
  assert.equal(dimensions.scale, 1);
});

test("preview cache spans artboard bounds and offsets dirty scissors", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = { previewCacheMaxSize: 2048 };
  renderer.width = 1048;
  renderer.height = 2048;
  window.CBO.getDocumentArtboardUnionRect = () => ({
    height: 2500,
    width: 4000,
    x: -200,
    y: 50,
  });

  const dimensions = renderer.getPreviewCacheDimensions();

  assert.equal(dimensions.width, 2048);
  assert.equal(dimensions.height, 1280);
  assert.equal(dimensions.documentWidth, 4000);
  assert.equal(dimensions.documentHeight, 2500);
  assert.equal(dimensions.documentX, -200);
  assert.equal(dimensions.documentY, 50);
  assert.equal(dimensions.documentRect.x, -200);
  assert.equal(dimensions.documentRect.y, 50);
  assert.equal(dimensions.documentRect.width, 4000);
  assert.equal(dimensions.documentRect.height, 2500);
  assert.equal(dimensions.scale, 2048 / 4000);

  const scissor = renderer.getPreviewDirtyRegionScissor(
    { x: -100, y: 150, width: 200, height: 100 },
    dimensions.width,
    dimensions.height,
    dimensions.scale,
    { documentRect: dimensions.documentRect },
  );

  assert.equal(scissor.x, 51);
  assert.equal(scissor.y, 1177);
  assert.equal(scissor.width, 103);
  assert.equal(scissor.height, 52);
});

test("preview cache scopes to the single visible artboard when zoomed out", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {
    previewCacheMaxSize: 2048,
    previewCacheOverscanCssPx: 256,
    previewCacheScope: "visible-artboards",
  };
  renderer.width = 8256;
  renderer.height = 4000;
  window.CBO.getDocumentArtboards = () => [
    { x: 0, y: 0, width: 4000, height: 4000 },
    { x: 4256, y: 0, width: 4000, height: 4000 },
  ];
  window.CBO.getDocumentArtboardUnionRect = () => ({
    height: 4000,
    width: 8256,
    x: 0,
    y: 0,
  });

  const dimensions = renderer.getPreviewCacheDimensions({
    camera: { x: -2500, y: 0, zoom: 0.5 },
    dpr: 1,
    viewportHeight: 800,
    viewportWidth: 1000,
  });

  assert.equal(dimensions.scopeInfo.mode, "visible-artboard");
  assert.equal(dimensions.documentRect.x, 4256);
  assert.equal(dimensions.documentRect.y, 0);
  assert.equal(dimensions.documentRect.width, 4000);
  assert.equal(dimensions.documentRect.height, 4000);
  assert.equal(dimensions.width, 2048);
  assert.equal(dimensions.height, 2048);
});

test("preview cache scopes multiple visible artboards as whole artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {
    previewCacheMaxSize: 4096,
    previewCacheOverscanCssPx: 256,
    previewCacheScope: "visible-artboards",
  };
  renderer.width = 2200;
  renderer.height = 1000;
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 1000, height: 1000 },
    { id: "right", x: 1200, y: 0, width: 1000, height: 1000 },
  ];
  window.CBO.getDocumentArtboardUnionRect = () => ({
    height: 1000,
    width: 2200,
    x: 0,
    y: 0,
  });

  const dimensions = renderer.getPreviewCacheDimensions({
    camera: { x: -900, y: 0, zoom: 1 },
    dpr: 1,
    viewportHeight: 500,
    viewportWidth: 500,
  });

  assert.equal(dimensions.scopeInfo.mode, "visible-artboards");
  assert.deepEqual(Array.from(dimensions.scopeInfo.visibleArtboardIds), ["left", "right"]);
  assert.deepEqual(JSON.parse(JSON.stringify(dimensions.documentRect)), {
    height: 1000,
    width: 2200,
    x: 0,
    y: 0,
  });
});

test("artboard residency cools cold artboards and hydrates them when visible", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const layers = {
    "left-paint": { artboardId: "left", id: "left-paint", type: "paint", visible: true },
    "right-paint": { artboardId: "right", id: "right-paint", type: "paint", visible: true },
  };
  const rightTarget = {
    clearColor: [0, 0, 0, 0],
    framebuffer: { id: "right-fb" },
    height: 4,
    id: "right-target",
    layerId: "right-paint",
    state: "GPU_HOT",
    texture: { id: "right-texture" },
    width: 4,
    x: 1200,
    y: 0,
  };

  renderer.options = {
    enableArtboardResidency: true,
    artboardResidencyWarmHoldMs: 0,
  };
  renderer.width = 2200;
  renderer.height = 1000;
  renderer.rasterTargetsByLayerId = new Map([
    ["right-paint", rightTarget],
  ]);
  renderer.layerModel = {
    activeLayerId: "left-paint",
    findEntryArtboardId: (layerId) => layers[layerId]?.artboardId || "",
    findEntryById: (layerId) => layers[layerId] || null,
    flattenTopToBottom: () => [layers["right-paint"], layers["left-paint"]],
  };
  renderer.gl = {
    FRAMEBUFFER: "framebuffer",
    RGBA: "rgba",
    TEXTURE_2D: "texture-2d",
    UNSIGNED_BYTE: "unsigned-byte",
    bindFramebuffer() {},
    bindTexture() {},
    deleteFramebuffer() {},
    deleteTexture() {},
    readPixels(_x, _y, width, height, _format, _type, pixels) {
      assert.equal(width, 4);
      assert.equal(height, 4);
      pixels.fill(128);
    },
    texImage2D() {},
  };
  renderer.deleteRasterFramebuffer = () => {};
  renderer.deleteRasterTexture = () => {};
  renderer.markRasterTargetDirty = () => {};
  renderer.createRasterTarget = (_clearColor, options = {}) => ({
    clearColor: [0, 0, 0, 0],
    framebuffer: { id: "hydrated-fb" },
    height: options.height,
    id: "hydrated-right-target",
    layerId: options.layerId,
    texture: { id: "hydrated-texture" },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 1000, height: 1000 },
    { id: "right", x: 1200, y: 0, width: 1000, height: 1000 },
  ];
  window.CBO.getSelectedDocumentArtboardId = () => "left";
  window.CBO.getActiveDocumentArtboardId = () => "left";

  const leftResidency = renderer.resolveAndPublishArtboardResidency({
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    now: 0,
    viewportHeight: 500,
    viewportWidth: 500,
  });
  const cooled = renderer.applyArtboardColdStorage(leftResidency, {
    orderedLayers: [layers["right-paint"], layers["left-paint"]],
    reason: "test-artboard-residency",
  });

  assert.equal(cooled.cooledLayerCount, 1);
  assert.equal(rightTarget.state, "CPU_COLD");
  assert.equal(rightTarget.texture, null);
  assert.equal(rightTarget.cpuPixels?.byteLength, 4 * 4 * 4);

  const rightResidency = renderer.resolveAndPublishArtboardResidency({
    camera: { x: -1200, y: 0, zoom: 1 },
    dpr: 1,
    now: 5000,
    viewportHeight: 500,
    viewportWidth: 500,
  });
  const hydratedCount = renderer.hydrateHotArtboardTargets(rightResidency, [layers["right-paint"], layers["left-paint"]]);

  assert.equal(hydratedCount, 1);
  assert.equal(rightTarget.state, "GPU_HOT");
  assert.ok(rightTarget.texture);
  assert.equal(rightTarget.cpuPixels, null);
});

test("artboard residency uses budget pressure to cool warm LRU artboards", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const layers = {
    "left-paint": { artboardId: "left", id: "left-paint", type: "paint", visible: true },
    "middle-paint": { artboardId: "middle", id: "middle-paint", type: "paint", visible: true },
    "right-paint": { artboardId: "right", id: "right-paint", type: "paint", visible: true },
  };
  const createTarget = (layerId, x) => ({
    clearColor: [0, 0, 0, 0],
    framebuffer: { id: `${layerId}-fb` },
    height: 16,
    id: `${layerId}-target`,
    layerId,
    state: "GPU_HOT",
    texture: { id: `${layerId}-texture` },
    width: 16,
    x,
    y: 0,
  });
  const leftTarget = createTarget("left-paint", 0);
  const middleTarget = createTarget("middle-paint", 1200);
  const rightTarget = createTarget("right-paint", 2400);

  renderer.options = {
    enableArtboardResidency: true,
    enableArtboardResidencyBudget: true,
    artboardResidencyHardBudgetBytes: 4096,
    artboardResidencySoftBudgetBytes: 512,
    artboardResidencyWarmHoldMs: 10000,
  };
  renderer.width = 3400;
  renderer.height = 1000;
  renderer.rasterTargetsByLayerId = new Map([
    ["left-paint", leftTarget],
    ["middle-paint", middleTarget],
    ["right-paint", rightTarget],
  ]);
  renderer.layerModel = {
    activeLayerId: "middle-paint",
    findEntryArtboardId: (layerId) => layers[layerId]?.artboardId || "",
    findEntryById: (layerId) => layers[layerId] || null,
    flattenTopToBottom: () => [layers["right-paint"], layers["middle-paint"], layers["left-paint"]],
  };
  renderer.gl = {
    FRAMEBUFFER: "framebuffer",
    RGBA: "rgba",
    UNSIGNED_BYTE: "unsigned-byte",
    bindFramebuffer() {},
    deleteFramebuffer() {},
    deleteTexture() {},
    readPixels(_x, _y, width, height, _format, _type, pixels) {
      assert.equal(width, 16);
      assert.equal(height, 16);
      pixels.fill(21);
    },
  };
  renderer.deleteRasterFramebuffer = () => {};
  renderer.deleteRasterTexture = () => {};
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 1000, height: 1000 },
    { id: "middle", x: 1200, y: 0, width: 1000, height: 1000 },
    { id: "right", x: 2400, y: 0, width: 1000, height: 1000 },
  ];

  renderer.resolveAndPublishArtboardResidency({
    activeArtboardId: "left",
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    now: 0,
    viewportHeight: 500,
    viewportWidth: 500,
  });
  const middleResidency = renderer.resolveAndPublishArtboardResidency({
    activeArtboardId: "middle",
    camera: { x: -1300, y: 0, zoom: 1 },
    dpr: 1,
    now: 100,
    viewportHeight: 500,
    viewportWidth: 500,
  });
  const report = renderer.applyArtboardColdStorage(middleResidency, {
    orderedLayers: [layers["left-paint"], layers["middle-paint"], layers["right-paint"]],
    reason: "test-budget-cold",
  });

  assert.equal(report.coolingPlan.pressure, "soft");
  assert.ok(report.coolingPlan.candidateArtboardIds.includes("left"));
  assert.ok(report.coolingPlan.candidateArtboardIds.includes("right"));
  assert.equal(leftTarget.state, "CPU_COLD");
  assert.equal(rightTarget.state, "CPU_COLD");
  assert.equal(middleTarget.state, "GPU_HOT");
});

test("artboard residency predicts prefetch artboards from pan direction", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {
    enableArtboardResidency: true,
    enableArtboardResidencyPrefetch: true,
    artboardResidencyPrefetchCssPx: 900,
    artboardResidencyWarmHoldMs: 0,
  };
  renderer.width = 3400;
  renderer.height = 1000;
  renderer.layerModel = {
    activeLayerId: "left-paint",
    findEntryArtboardId: () => "left",
    findEntryById: () => ({ artboardId: "left", id: "left-paint", type: "paint" }),
  };
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 1000, height: 1000 },
    { id: "middle", x: 1200, y: 0, width: 1000, height: 1000 },
    { id: "right", x: 2400, y: 0, width: 1000, height: 1000 },
  ];

  renderer.resolveAndPublishArtboardResidency({
    activeArtboardId: "left",
    camera: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    now: 0,
    viewportHeight: 500,
    viewportWidth: 500,
  });
  const residency = renderer.resolveAndPublishArtboardResidency({
    activeArtboardId: "left",
    camera: { x: -300, y: 0, zoom: 1 },
    dpr: 1,
    now: 16,
    viewportHeight: 500,
    viewportWidth: 500,
  });

  assert.ok(residency.prefetchArtboardIds.includes("middle"));
  assert.ok(residency.warmArtboardIds.includes("middle"));
  assert.ok(residency.prefetchRect.width > residency.visibleRect.width);
});

test("artboard residency shows a busy loading state before MiB cooling", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const busyEvents = [];
  const timeouts = [];
  let cooledAtEventCount = null;
  let clearedTimer = null;

  window.setTimeout = (callback, delay) => {
    timeouts.push({ callback, delay });
    return timeouts.length;
  };
  window.clearTimeout = (timerId) => {
    clearedTimer = timerId;
  };
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.dispatchEvent = (event) => {
    if (event.type === "cbo:artboard-residency-busy") {
      busyEvents.push(event.detail);
    }
  };
  renderer.options = {
    enableArtboardResidency: true,
    enableArtboardResidencyBudget: true,
    artboardResidencyIdleDelayMs: 100,
    artboardResidencyWarmHoldMs: 500,
  };
  renderer.artboardResidencyLastViewOptions = null;
  renderer.artboardResidencyIdleTimer = 0;
  renderer.artboardResidencyWarmUntilById = new Map();
  renderer.artboardResidencyAccessById = new Map();
  renderer.resolveAndPublishArtboardResidency = () => ({
    coldArtboardIds: ["right"],
  });
  renderer.applyArtboardColdStorage = () => {
    cooledAtEventCount = busyEvents.length;
    return { releasedRawBytes: 2 * 1024 * 1024 };
  };

  const didSchedule = renderer.scheduleArtboardResidencyMaintenance({
    activeArtboardId: "left",
    coldArtboardIds: ["right"],
    renderArtboardIds: ["left"],
    visibleArtboardIds: ["left"],
    warmArtboardIds: [],
  }, {
    metrics: {
      artboards: [
        { artboardId: "left", gpuBytes: 1024 },
        { artboardId: "right", gpuBytes: 2 * 1024 * 1024 },
      ],
      budget: { pressure: "ok" },
      residentGpuBytes: 2 * 1024 * 1024,
    },
    orderedLayers: [],
  });

  assert.equal(didSchedule, true);
  assert.equal(timeouts[0].delay, 500);

  timeouts[0].callback();

  assert.equal(busyEvents[0].active, true);
  assert.equal(busyEvents[0].label, "OPTIMIZING");
  assert.equal(cooledAtEventCount, 1);

  timeouts[1].callback();

  assert.equal(busyEvents.at(-1).active, false);

  renderer.artboardResidencyIdleTimer = 42;
  renderer.cancelArtboardResidencyIdleTimer("test-cancel");
  assert.equal(clearedTimer, 42);
});

test("artboard flat previews are captured from preview cache and used as cold fallback", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const calls = [];
  const layers = {
    "left-paint": { artboardId: "left", id: "left-paint", type: "paint", visible: true },
    "right-paint": { artboardId: "right", id: "right-paint", type: "paint", visible: true },
  };

  renderer.options = {
    enableArtboardResidency: true,
    enableArtboardFlatPreviews: true,
    artboardFlatPreviewMaxSize: 2048,
  };
  renderer.width = 2200;
  renderer.height = 1000;
  renderer.previewTexture = { id: "preview-texture" };
  renderer.previewFramebuffer = { id: "preview-framebuffer" };
  renderer.previewCacheDocumentRect = { x: 0, y: 0, width: 2200, height: 1000 };
  renderer.previewCacheWidth = 1100;
  renderer.previewCacheHeight = 500;
  renderer.previewCacheScale = 0.5;
  renderer.previewCacheScopeInfo = {
    cacheArtboardIds: ["left", "right"],
    visibleArtboardIds: ["left", "right"],
  };
  renderer.artboardFlatPreviewsById = new Map();
  renderer.rasterTargetsByLayerId = new Map([
    ["left-paint", { framebuffer: {}, height: 4, layerId: "left-paint", state: "GPU_HOT", texture: {}, width: 4 }],
    ["right-paint", { cpuPixels: new Uint8Array(4 * 4 * 4), height: 4, layerId: "right-paint", state: "CPU_COLD", width: 4 }],
  ]);
  renderer.layerModel = {
    activeLayerId: "left-paint",
    findEntryArtboardId: (layerId) => layers[layerId]?.artboardId || "",
    findEntryById: (layerId) => layers[layerId] || null,
  };
  renderer.gl = {
    CLAMP_TO_EDGE: "clamp",
    FRAMEBUFFER: "framebuffer",
    LINEAR: "linear",
    RGBA: "rgba",
    TEXTURE_2D: "texture-2d",
    TEXTURE_MAG_FILTER: "mag",
    TEXTURE_MIN_FILTER: "min",
    TEXTURE_WRAP_S: "wrap-s",
    TEXTURE_WRAP_T: "wrap-t",
    UNSIGNED_BYTE: "unsigned-byte",
    bindFramebuffer: (...args) => calls.push(["bindFramebuffer", ...args]),
    bindTexture: (...args) => calls.push(["bindTexture", ...args]),
    copyTexSubImage2D: (...args) => calls.push(["copyTexSubImage2D", ...args]),
    createTexture: () => ({ id: `flat-${calls.length}` }),
    deleteTexture: () => {},
    texImage2D: (...args) => calls.push(["texImage2D", ...args]),
    texParameteri: () => {},
  };
  renderer.registerRasterTexture = () => ({ id: "flat-resource" });
  renderer.deleteRasterTexture = () => {};
  window.CBO.getDocumentArtboards = () => [
    { id: "left", x: 0, y: 0, width: 1000, height: 1000 },
    { id: "right", x: 1200, y: 0, width: 1000, height: 1000 },
  ];

  const capture = renderer.captureArtboardFlatPreviewsFromPreviewCache({ reason: "test" });
  const residency = {
    activeArtboardId: "left",
    visibleArtboardIds: ["left", "right"],
  };
  const fallbackIds = renderer.getArtboardFlatPreviewFallbackIds(
    residency,
    [layers["left-paint"], layers["right-paint"]],
  );

  assert.deepEqual(Array.from(capture.capturedIds), ["left", "right"]);
  assert.ok(calls.some((call) => call[0] === "copyTexSubImage2D"));
  assert.equal(renderer.getArtboardFlatPreview("right").width, 500);
  assert.deepEqual(Array.from(fallbackIds), ["right"]);
});

test("artboard tile residency cools sparse tiles outside render rect and rehydrates them on demand", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const readCalls = [];
  const sparseTarget = {
    clearColor: [0, 0, 0, 0],
    height: 512,
    layerId: "paint",
    sparse: true,
    state: "GPU_HOT",
    tiles: new Map(),
    tileSize: 256,
    width: 512,
    x: 0,
    y: 0,
  };
  const insideTile = {
    framebuffer: { id: "inside-fb" },
    height: 256,
    layerId: "paint",
    state: "GPU_HOT",
    texture: { id: "inside-texture" },
    width: 256,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  };
  const outsideTile = {
    framebuffer: { id: "outside-fb" },
    height: 256,
    layerId: "paint",
    state: "GPU_HOT",
    texture: { id: "outside-texture" },
    width: 256,
    x: 256,
    y: 0,
    tx: 1,
    ty: 0,
  };

  sparseTarget.tiles.set("0:0", insideTile);
  sparseTarget.tiles.set("1:0", outsideTile);
  renderer.gl = {
    FRAMEBUFFER: "framebuffer",
    RGBA: "rgba",
    TEXTURE_2D: "texture-2d",
    UNSIGNED_BYTE: "unsigned-byte",
    bindFramebuffer() {},
    bindTexture() {},
    deleteFramebuffer() {},
    deleteTexture() {},
    readPixels(_x, _y, width, height, _format, _type, pixels) {
      readCalls.push([width, height]);
      pixels.fill(9);
    },
    texImage2D() {},
  };
  renderer.deleteRasterFramebuffer = () => {};
  renderer.deleteRasterTexture = () => {};
  renderer.markRasterTargetDirty = () => {};
  renderer.createRasterTarget = (_clearColor, options = {}) => ({
    framebuffer: { id: "hydrated-fb" },
    height: options.height,
    layerId: options.layerId,
    texture: { id: "hydrated-texture" },
    width: options.width,
    x: options.x,
    y: options.y,
  });

  const cooled = renderer.dehydrateSparseRasterTargetOutsideRect(
    "paint",
    sparseTarget,
    { x: 0, y: 0, width: 256, height: 256 },
    { reason: "test-tile-residency" },
  );

  assert.equal(cooled.cooledTileCount, 1);
  assert.equal(insideTile.state, "GPU_HOT");
  assert.equal(outsideTile.state, "CPU_COLD");
  assert.equal(sparseTarget.state, "GPU_PARTIAL");
  assert.deepEqual(readCalls, [[256, 256]]);

  const hydrated = renderer.hydrateSparseRasterTargetForRect(
    "paint",
    sparseTarget,
    { x: 256, y: 0, width: 256, height: 256 },
    { reason: "test-tile-hydrate" },
  );

  assert.equal(hydrated, 1);
  assert.equal(outsideTile.state, "GPU_HOT");
  assert.ok(outsideTile.texture);
});

test("preview cache exact rect follows the allocated texture scale", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = { previewCacheMaxSize: 2048 };
  renderer.width = 10000;
  renderer.height = 3000;
  renderer.previewCacheDocumentRect = { x: 10, y: 20, width: 10000, height: 3000 };
  renderer.previewCacheWidth = 2048;
  renderer.previewCacheHeight = 614;
  renderer.previewCacheScale = 614 / 3000;

  const exactRect = renderer.getPreviewCacheExactDocumentRect();

  assert.equal(exactRect.x, 10);
  assert.equal(exactRect.y, 20);
  assert.equal(exactRect.height, 3000);
  assert.equal(exactRect.width, 2048 / (614 / 3000));
});

test("document renderer uses a procedural background texture", () => {
  const source = readDocumentRendererSources();

  assert.match(source, /createProceduralBackgroundTarget\(\)/);
  assert.match(source, /new Uint8Array\(\[247, 247, 242, 255\]\)/);
  assert.match(source, /label: "procedural background texture"/);
  assert.match(source, /resourceHeight: 1/);
  assert.match(source, /resourceWidth: 1/);
  assert.match(source, /bbox: \{\s*x: 0,\s*y: 0,\s*width: this\.width,\s*height: this\.height,\s*\}/);
  assert.match(source, /getArtboardBackgroundRenderRects\(\)/);
  assert.match(source, /namespace\.getDocumentArtboards\?\.\(\)/);
  assert.match(source, /getProceduralBackgroundRenderResults\(layer, layerTarget, options = \{\}\)/);
  assert.match(source, /const layerArtboardId = String\(layer\?\.artboardId \|\| ""\)\.trim\(\)/);
  assert.match(source, /const visibleRects = \[\]/);
  assert.match(source, /cullingStats\.artboardBackgrounds\.skippedOutsideRenderRect/);
  assert.match(source, /this\.isProceduralBackgroundLayerTarget\(layer, layerTarget\)/);
  assert.match(source, /return this\.rasterTargetsByLayerId\.get\("background"\) \|\| layerTarget/);
  assert.match(source, /getPreviewCacheDocumentRect\(\)/);
  assert.match(source, /this\.getDocumentBoundsRect\?\.\(\)/);
  assert.match(source, /for \(const renderResult of this\.getLayerRenderResults\(layer, renderTarget, viewportLayerRenderOptions\)\)/);
  assert.match(source, /createBaseLayerTarget\(\) \{\s*const backgroundTarget = this\.createProceduralBackgroundTarget\(\)/);
  assert.doesNotMatch(source, /createBaseLayerTarget\(\) \{[\s\S]*?const target = this\.createRasterTarget\(\[0, 0, 0, 0\]\)/);
  assert.doesNotMatch(source, /const backgroundTarget = this\.createRasterTarget\(\[1, 1, 1, 1\]\)/);
});

test("document renderer resolves viewport render rects from camera and overscan", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  window.devicePixelRatio = 2;

  const visibleRect = renderer.resolveCanvasVisibleDocRect(
    { x: -200, y: -100, zoom: 2 },
    1000,
    800,
  );

  assert.equal(visibleRect.x, 100);
  assert.equal(visibleRect.y, 50);
  assert.equal(visibleRect.width, 500);
  assert.equal(visibleRect.height, 400);

  const renderRect = renderer.getViewportRenderRect(
    { x: -200, y: -100, zoom: 2 },
    1000,
    800,
    64,
  );

  assert.equal(renderRect.x, 36);
  assert.equal(renderRect.y, -14);
  assert.equal(renderRect.width, 628);
  assert.equal(renderRect.height, 528);
});

test("document renderer culls sparse tiles outside the viewport render rect", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.getLayerRenderResult = (_layer, target) => ({
    height: target.height,
    rect: renderer.getRasterTargetDocumentRect(target),
    texture: target.texture,
    width: target.width,
  });

  const sparseTarget = {
    sparse: true,
    tiles: new Map([
      ["0:0", { texture: {}, x: 0, y: 0, width: 256, height: 256, tx: 0, ty: 0 }],
      ["1:0", { texture: {}, x: 256, y: 0, width: 256, height: 256, tx: 1, ty: 0 }],
      ["10:0", { texture: {}, x: 2560, y: 0, width: 256, height: 256, tx: 10, ty: 0 }],
    ]),
  };

  const culledResults = renderer.getLayerRenderResults(
    { id: "paint-1", visible: true },
    sparseTarget,
    {
      cullSparseTiles: true,
      renderRect: { x: -32, y: -32, width: 640, height: 640 },
    },
  );

  assert.equal(culledResults.length, 2);
  assert.equal(culledResults[0].rect.x, 0);
  assert.equal(culledResults[1].rect.x, 256);

  const unculledResults = renderer.getLayerRenderResults(
    { id: "paint-1", visible: true },
    sparseTarget,
    {
      cullSparseTiles: false,
      renderRect: { x: -32, y: -32, width: 640, height: 640 },
    },
  );

  assert.equal(unculledResults.length, 3);
});

test("document renderer culls procedural artboard backgrounds outside the viewport render rect", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 6000;
  renderer.height = 1000;
  renderer.options = { cssArtboardPaper: false };
  renderer.getArtboardBackgroundRenderRects = () => [
    { x: 0, y: 0, width: 500, height: 500 },
    { x: 5000, y: 0, width: 500, height: 500 },
  ];

  const results = renderer.getLayerRenderResults(
    { id: "background", type: "background", visible: true },
    { texture: {}, procedural: true, layerId: "background" },
    { renderRect: { x: -100, y: -100, width: 900, height: 900 } },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].rect.x, 0);
});

test("document renderer keeps viewport culling conservative for risky layer states", () => {
  const source = readDocumentRendererSources();
  const drawToCanvasBody = source.match(/drawToCanvas\(options = \{\}\) \{([\s\S]*?)\n    dispose\(\)/)?.[1] || "";
  const previewCacheBody = source.match(/updatePreviewCache\(options = \{\}\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /const VIEWPORT_RENDER_OVERSCAN_CSS_PX = 256/);
  assert.match(source, /resolveCanvasVisibleDocRect\(camera = \{\}, viewportWidth = 1, viewportHeight = 1\)/);
  assert.match(source, /getViewportRenderRect\(camera = \{\}, viewportWidth = 1, viewportHeight = 1, overscanCssPx = VIEWPORT_RENDER_OVERSCAN_CSS_PX\)/);
  assert.match(drawToCanvasBody, /const staticViewportRenderRect = hasArtboardDragPreview \? null : viewportRenderRect/);
  assert.match(drawToCanvasBody, /const canCullSparseTilesForViewport = Boolean\([\s\S]*?!isClippingLayer[\s\S]*?!isActiveStrokeLayer[\s\S]*?!isRasterTransformPreviewLayer[\s\S]*?!isVectorTextTransformPreviewLayer[\s\S]*?!eraserMaskTexture[\s\S]*?!rasterTransformPreview[\s\S]*?!vectorTextTransformPreviewLayerId[\s\S]*?!this\.hasAdvancedLayerBlendMode\(layer\)[\s\S]*?!this\.hasEnabledLayerEffects\(layer\)[\s\S]*?!this\.hasPuppetLayerTransform\(layer\)/);
  assert.match(drawToCanvasBody, /getLayerRenderResults\(layer, renderTarget, viewportLayerRenderOptions\)/);
  assert.match(drawToCanvasBody, /getLayerRenderResults\(layer, layerTarget, viewportLayerRenderOptions\)/);
  assert.match(previewCacheBody, /getLayerRenderResults\(layer, layerTarget\)/);
  assert.doesNotMatch(previewCacheBody, /viewportLayerRenderOptions/);
});

test("document renderer records viewport culling metrics and exposes last stats", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.options = {};
  renderer.getArtboardDragOffsetForLayer = () => null;
  renderer.getLayerRenderResult = (_layer, target) => ({
    rect: renderer.getRasterTargetDocumentRect(target),
    texture: target.texture,
  });

  const stats = renderer.createViewportCullingStats({
    camera: { x: -100, y: -50, zoom: 2 },
    debug: true,
    layerCullingEnabled: false,
    layerCullingMeasured: true,
    overscanCssPx: 256,
    renderRect: { x: 0, y: 0, width: 640, height: 640 },
    viewportHeight: 800,
    viewportWidth: 1000,
    visibleRect: { x: 50, y: 25, width: 500, height: 400 },
  });

  const sparseTarget = {
    sparse: true,
    tiles: new Map([
      ["0:0", { texture: {}, x: 0, y: 0, width: 256, height: 256, tx: 0, ty: 0 }],
      ["1:0", { texture: {}, x: 256, y: 0, width: 256, height: 256, tx: 1, ty: 0 }],
      ["10:0", { texture: {}, x: 2560, y: 0, width: 256, height: 256, tx: 10, ty: 0 }],
      ["11:0", { texture: null, x: 2816, y: 0, width: 256, height: 256, tx: 11, ty: 0 }],
    ]),
  };

  const sparseResults = renderer.getLayerRenderResults(
    { id: "paint-1", type: "paint", visible: true },
    sparseTarget,
    {
      cullSparseTiles: true,
      cullingStats: stats,
      renderRect: { x: -32, y: -32, width: 640, height: 640 },
    },
  );

  assert.equal(sparseResults.length, 2);
  assert.equal(stats.sparseTiles.tested, 4);
  assert.equal(stats.sparseTiles.drawn, 2);
  assert.equal(stats.sparseTiles.skippedOutsideRenderRect, 1);
  assert.equal(stats.sparseTiles.missingTexture, 1);
  assert.equal(stats.renderResults.returned, 2);

  let debugEventDetail = null;
  window.dispatchEvent = (event) => {
    if (event?.type === "cbo:viewport-culling-debug") {
      debugEventDetail = event.detail;
    }
  };

  const finalized = renderer.finalizeViewportCullingStats(stats);

  assert.ok(finalized.durationMs >= 0);
  assert.equal(renderer.getLastViewportCullingStats().frameId, finalized.frameId);
  assert.equal(window.CBO.lastViewportCullingStats.frameId, finalized.frameId);
  assert.equal(debugEventDetail.frameId, finalized.frameId);

  renderer.setViewportCullingDebug(true);
  renderer.setViewportLayerCulling(true);

  assert.equal(renderer.options.debugViewportCulling, true);
  assert.equal(renderer.options.enableViewportLayerCulling, true);
});

test("document renderer audits conservative viewport layer culling decisions", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.width = 4000;
  renderer.height = 4000;
  renderer.options = {};
  renderer.getArtboardDragOffsetForLayer = () => null;
  renderer.hasAdvancedLayerBlendMode = (layer) => Boolean(layer?.blendMode && layer.blendMode !== "normal");
  renderer.hasEnabledLayerEffects = (layer) => Array.isArray(layer?.effects) && layer.effects.length > 0;
  renderer.hasPuppetLayerTransform = (layer) => Boolean(layer?.puppet);

  const cullContext = {
    clipBaseLayerIds: new Set(),
    renderRect: { x: 0, y: 0, width: 500, height: 500 },
  };
  const outsideDecision = renderer.getViewportLayerCullDecision(
    { id: "paint-out", type: "paint", visible: true },
    { texture: {}, x: 2000, y: 0, width: 100, height: 100, cropped: true },
    cullContext,
  );
  const insideDecision = renderer.getViewportLayerCullDecision(
    { id: "image-in", type: "image", visible: true },
    { texture: {}, x: 100, y: 100, width: 100, height: 100, cropped: true },
    cullContext,
  );
  const effectDecision = renderer.getViewportLayerCullDecision(
    { id: "paint-effect", type: "paint", visible: true, effects: [{ type: "gaussian-blur" }] },
    { texture: {}, x: 2000, y: 0, width: 100, height: 100, cropped: true },
    cullContext,
  );
  const clippingDecision = renderer.getViewportLayerCullDecision(
    { id: "paint-clip", type: "paint", visible: true, clippingMask: true },
    { texture: {}, x: 2000, y: 0, width: 100, height: 100, cropped: true },
    cullContext,
  );
  const backgroundDecision = renderer.getViewportLayerCullDecision(
    { id: "background", type: "background", visible: true },
    { texture: {}, x: 2000, y: 0, width: 100, height: 100, cropped: true },
    cullContext,
  );
  const stats = renderer.createViewportCullingStats({
    layerCullingEnabled: true,
    layerCullingMeasured: true,
    renderRect: cullContext.renderRect,
  });

  assert.equal(outsideDecision.canCull, true);
  assert.equal(outsideDecision.shouldCull, true);
  assert.equal(insideDecision.canCull, true);
  assert.equal(insideDecision.shouldCull, false);
  assert.equal(effectDecision.reason, "effects");
  assert.equal(clippingDecision.reason, "clippingMask");
  assert.equal(backgroundDecision.reason, "background");

  renderer.recordViewportLayerCullDecision(stats, outsideDecision, true);
  renderer.recordViewportLayerCullDecision(stats, insideDecision, false);
  renderer.recordViewportLayerCullDecision(stats, effectDecision, false);
  renderer.recordViewportLayerCullDecision(stats, clippingDecision, false);

  assert.equal(stats.layers.safeCullCandidates, 2);
  assert.equal(stats.layers.wouldCullSafely, 1);
  assert.equal(stats.layers.safelyCulled, 1);
  assert.equal(stats.layers.blocked.effects, 1);
  assert.equal(stats.layers.blocked.clippingMask, 1);
});

test("document renderer wires viewport culling stats without touching preview cache", () => {
  const source = readDocumentRendererSources();
  const drawToCanvasBody = source.match(/drawToCanvas\(options = \{\}\) \{([\s\S]*?)\n    dispose\(\)/)?.[1] || "";
  const previewCacheBody = source.match(/updatePreviewCache\(options = \{\}\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /const VIEWPORT_CULLING_DEBUG_EVENT = "cbo:viewport-culling-debug"/);
  assert.match(source, /const VIEWPORT_LAYER_CULL_SAFE_TYPES = new Set\(\["paint", "image", "raster", "bitmap"\]\)/);
  assert.match(source, /createViewportCullingStats\(options = \{\}\)/);
  assert.match(source, /finalizeViewportCullingStats\(stats\)/);
  assert.match(source, /getViewportLayerCullDecision\(layer, layerTarget, context = \{\}\)/);
  assert.match(source, /setViewportCullingDebug\(enabled = true\)/);
  assert.match(source, /setViewportLayerCulling\(enabled = true\)/);
  assert.match(drawToCanvasBody, /const viewportLayerCullingEnabled = this\.isViewportLayerCullingEnabled\(options\)/);
  assert.match(drawToCanvasBody, /const viewportLayerCullingMeasured = this\.isViewportLayerCullingAuditEnabled\(options\)/);
  assert.match(drawToCanvasBody, /this\.recordViewportLayerCullDecision\(viewportCullingStats, layerCullDecision, shouldCullLayer\)/);
  assert.match(drawToCanvasBody, /if \(shouldCullLayer\) \{\s*continue;\s*\}/);
  assert.match(drawToCanvasBody, /this\.finalizeViewportCullingStats\(viewportCullingStats\)/);
  assert.doesNotMatch(previewCacheBody, /viewportCullingStats/);
  assert.doesNotMatch(previewCacheBody, /enableViewportLayerCulling/);
});

test("document renderer infers artboard clipping from layer model group membership", () => {
  const { DocumentRenderer, window } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);

  renderer.options = {};
  renderer.layerModel = {
    findEntryArtboardId: (layerId) => (layerId === "paint-nested" ? "artboard-3" : null),
  };
  window.CBO.getDocumentArtboardRect = (artboardId) => (
    artboardId === "artboard-3"
      ? { x: 1200, y: 400, width: 3400, height: 4000 }
      : null
  );

  const inferredRect = renderer.getLayerArtboardRect({ id: "paint-nested", type: "paint" });

  assert.equal(inferredRect.x, 1200);
  assert.equal(inferredRect.y, 400);
  assert.equal(inferredRect.width, 3400);
  assert.equal(inferredRect.height, 4000);
  assert.equal(renderer.getLayerArtboardRect({ id: "paint-loose", type: "paint" }), null);
});

test("createPaintTarget forwards layer metadata before resource tracing", () => {
  const source = readDocumentRendererSources();

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
  const source = readDocumentRendererSources();
  const documentMaskMatches = source.match(
    /vec2 local = \(globalDocPixel - u_maskRect\.xy\) \/ max\(u_maskRect\.zw, vec2\(1\.0\)\);/g,
  ) || [];

  assert.ok(documentMaskMatches.length >= 2);
  assert.doesNotMatch(source, /vec2 local = \(v_documentPixel - u_maskRect\.xy\)/);
});

test("document renderer composites supported layer blend modes in shader", () => {
  const source = readDocumentRendererSources();
  const previewCacheBody = source.match(/updatePreviewCache\(options = \{\}\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";
  const drawToCanvasBody = source.match(/drawToCanvas\(options = \{\}\) \{([\s\S]*?)\n    dispose\(\)/)?.[1] || "";

  assert.match(source, /LAYER_COMPOSITE_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /LAYER_COMPOSITE_VERTEX_SHADER_SOURCE/);
  assert.match(source, /uniform sampler2D u_backdropTexture/);
  assert.match(source, /vec3 applyBlendMode\(vec3 baseColor, vec3 sourceColor, int blendMode\)/);
  assert.match(source, /source\.rgb \/ sourceAlpha/);
  assert.match(source, /backdrop\.rgb \/ backdropAlpha/);
  assert.match(source, /createLayerCompositeProgramInfo\(\)/);
  assert.match(source, /ensureLayerCompositeProgramInfo\(\)/);
  assert.match(source, /beginLayerComposite\(width, height\)/);
  assert.match(source, /swapLayerComposite\(compositeState\)/);
  assert.match(source, /drawLayerCompositeTexture\(options = \{\}\)/);
  assert.match(source, /drawScreenTexture\(previewCompositeState\.read\.texture/);
  assert.doesNotMatch(previewCacheBody, /copyCurrentFramebufferToLayerBlendBackdrop/);
  assert.doesNotMatch(drawToCanvasBody, /copyCurrentFramebufferToLayerBlendBackdrop/);
  assert.match(source, /renderLayerWithActiveStrokeTexture\(layerTexture, strokeTexture, strokeRect = null, options = \{\}\)/);
  assert.match(previewCacheBody, /drawBlendTexture\(layerTexture, opacity, this\.getLayerBlendModeId\(layer\), renderResult\.rect, clipBase\)/);
  assert.match(drawToCanvasBody, /activeStrokeNeedsFullStack/);
  assert.match(drawToCanvasBody, /drawBlendTexture\(layerTexture, opacity, layerRect, clipBase, blendModeId\)/);
});

test("document renderer exposes non-destructive gaussian blur layer effect helpers", () => {
  const source = readDocumentRendererSources();
  const previewCacheBody = source.match(/updatePreviewCache\(options = \{\}\) \{([\s\S]*?)\n    drawPreviewCacheToCanvas/)?.[1] || "";

  assert.match(source, /GAUSSIAN_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /MOTION_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /FIELD_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /RADIAL_BLUR_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /GRAIN_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /NOISE_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /THRESHOLD_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /CURVES_FRAGMENT_SHADER_SOURCE/);
  assert.match(source, /createGaussianBlurProgramInfo\(\)/);
  assert.match(source, /createMotionBlurProgramInfo\(\)/);
  assert.match(source, /createFieldBlurProgramInfo\(\)/);
  assert.match(source, /createRadialBlurProgramInfo\(\)/);
  assert.match(source, /createGrainProgramInfo\(\)/);
  assert.match(source, /createNoiseProgramInfo\(\)/);
  assert.match(source, /createThresholdProgramInfo\(\)/);
  assert.match(source, /createCurvesProgramInfo\(\)/);
  assert.match(source, /ensureMotionBlurProgramInfo\(\)/);
  assert.match(source, /ensureFieldBlurProgramInfo\(\)/);
  assert.match(source, /ensureRadialBlurProgramInfo\(\)/);
  assert.match(source, /ensureGrainProgramInfo\(\)/);
  assert.match(source, /ensureNoiseProgramInfo\(\)/);
  assert.match(source, /ensureThresholdProgramInfo\(\)/);
  assert.match(source, /ensureCurvesProgramInfo\(\)/);
  assert.match(source, /ensureLayerEffectScratchTargets\(/);
  assert.match(source, /runGaussianBlurPass\(/);
  assert.match(source, /runMotionBlurPass\(/);
  assert.match(source, /runFieldBlurPass\(/);
  assert.match(source, /runRadialBlurPass\(/);
  assert.match(source, /runGrainPass\(/);
  assert.match(source, /runNoisePass\(/);
  assert.match(source, /runThresholdPass\(/);
  assert.match(source, /runCurvesPass\(/);
  assert.match(source, /applyGaussianBlurTexture\(sourceTexture, radius, options = \{\}\)/);
  assert.match(source, /applyMotionBlurTexture\(sourceTexture, distance, angle, options = \{\}\)/);
  assert.match(source, /applyFieldBlurTexture\(sourceTexture, pins, options = \{\}\)/);
  assert.match(source, /applyRadialBlurTexture\(\s*sourceTexture,\s*amount,\s*centerX = 50,\s*centerY = 50,\s*mode = "spin",\s*options = \{\},/);
  assert.match(source, /applyGrainTexture\(sourceTexture, grain, options = \{\}\)/);
  assert.match(source, /applyNoiseTexture\(sourceTexture, noise, options = \{\}\)/);
  assert.match(source, /applyThresholdTexture\(sourceTexture, threshold, options = \{\}\)/);
  assert.match(source, /applyCurvesTexture\(sourceTexture, curves, options = \{\}\)/);
  assert.match(source, /getLayerEffectOutputRect\(layer, targetRect\)/);
  assert.match(source, /getRadialBlurOutputRect\(radialBlur, outputRect, targetRect\)/);
  assert.match(source, /sourceRect: targetRect/);
  assert.match(source, /getLayerMotionBlur\(layer\)/);
  assert.match(source, /getLayerFieldBlur\(layer\)/);
  assert.match(source, /getLayerRadialBlur\(layer\)/);
  assert.match(source, /getLayerGrain\(layer\)/);
  assert.match(source, /getLayerNoise\(layer\)/);
  assert.match(source, /getLayerThreshold\(layer\)/);
  assert.match(source, /getLayerCurves\(layer\)/);
  assert.match(source, /getLayerRenderTexture\(layer, layerTarget, options = \{\}\)/);
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
  assert.match(source, /float noiseSize = mix\(1\.0, 8\.0/);
  assert.match(source, /effect\.type === "noise"/);
  assert.match(source, /u_threshold/);
  assert.match(source, /thresholdLuminance\(color\) \* 255\.0 >= level/);
  assert.match(source, /effect\.type === "threshold"/);
  assert.match(source, /effect\.type === "curves"/);
  assert.match(source, /copyTextureToRasterTarget\(sourceTexture, target, options = \{\}\)/);
  assert.match(source, /rasterizeLayerEffects\(layer, options = \{\}\)/);
  assert.match(source, /layer-effects-rasterize-before/);
  assert.match(source, /layer-effects-rasterize-after/);
  assert.match(source, /recordRasterOperation\(report = \{\}\)/);
  assert.match(source, /evictRasterScratchCachesForPolicy\(report = \{\}, options = \{\}\)/);
  assert.match(source, /shouldEvictRasterScratchForPolicy\(report = \{\}\)/);
  assert.match(source, /policy === "large"\s*\|\|\s*policy === "huge"/);
  assert.match(source, /this\.deletePreviewCache\(\)/);
  assert.match(source, /this\.deleteLayerEffectScratchTargets\(\)/);
  assert.match(source, /this\.deleteActiveStrokeScratchTarget\(\)/);
  assert.match(source, /this\.evictRasterScratchCachesForPolicy\(recorded\)/);
  assert.match(source, /operationType: "layer-effects-rasterize"/);
  assert.match(source, /const previewDirtyRects = this\.getTileBasedPreviewDirtyRects\(/);
  assert.match(source, /\[targetRect, renderRect\]/);
  assert.match(source, /rects: previewDirtyRects/);
  assert.match(source, /previewDirtyRects: previewDirtyRects\.map\(\(rect\) => \(\{ \.\.\.rect \}\)\)/);
  assert.match(source, /targetRect: finalTargetRect \? \{ \.\.\.finalTargetRect \} : null/);
  assert.match(source, /scratchBytes\s*=\s*\n\s*this\.estimateRasterTargetBytes\(this\.layerEffectScratchA\)/);
  assert.match(source, /sourceTexture: layerTexture/);
  assert.doesNotMatch(source, /this\.hasPuppetLayerTransform\(layer\) \? 0 : this\.getLayerEffectPadding\(layer\)/);
  assert.match(source, /this\.deleteGaussianBlurResources\(\)/);
  assert.match(source, /this\.deleteMotionBlurResources\(\)/);
  assert.match(source, /this\.deleteFieldBlurResources\(\)/);
  assert.match(source, /this\.deleteRadialBlurResources\(\)/);
  assert.match(source, /this\.deleteGrainResources\(\)/);
  assert.match(source, /this\.deleteNoiseResources\(\)/);
  assert.match(source, /this\.deleteThresholdResources\(\)/);
  assert.match(source, /this\.deleteCurvesResources\(\)/);
  assert.match(previewCacheBody, /for \(const renderResult of this\.getLayerRenderResults\(layer, layerTarget\)\)/);
  assert.match(previewCacheBody, /sourceTexture: layerTexture/);
  assert.doesNotMatch(previewCacheBody, /!hasLayerEffects/);
  assert.doesNotMatch(source, /rasterTargetsByLayerId\.set\([^)]*layerEffectScratch/);
});

test("puppet rasterize commits the deformed mesh through snapshots", () => {
  const rendererSource = readDocumentRendererSources();
  const puppetToolSource = fs.readFileSync(
    path.join(repoRoot, "js", "puppet-transform-tool.js"),
    "utf8",
  );

  assert.match(rendererSource, /rasterizePuppetLayer\(layer, options = \{\}\)/);
  assert.match(rendererSource, /const captureAfterSnapshot = options\.captureAfterSnapshot !== false/);
  assert.match(rendererSource, /this\.createRasterSnapshot\(target, null, "puppet-rasterize-before"\)/);
  assert.match(rendererSource, /const outputRect = this\.getPuppetDeformedBounds\(layer, target\)/);
  assert.match(rendererSource, /this\.createRasterTargetForRect\(outputRect\)/);
  assert.match(rendererSource, /captureAfterSnapshot[\s\S]*this\.createRasterSnapshot\(destinationTarget, null, "puppet-rasterize-after"\)/);
  assert.match(rendererSource, /puppet-rasterize"\}\-retile/);
  assert.match(rendererSource, /beforePreferSparse: preferSparseRestore/);
  assert.match(rendererSource, /afterPreferSparse/);
  assert.match(rendererSource, /operationType: "puppet-rasterize"/);
  assert.match(rendererSource, /tool: "puppet"/);
  assert.match(rendererSource, /this\.replaceRasterTarget\(layer\.id, destinationTarget,/);
  assert.match(rendererSource, /rect: destinationRect,/);
  assert.match(rendererSource, /targetRect: destinationRect \? \{ \.\.\.destinationRect \} : null/);
  assert.match(rendererSource, /sourceTexture: sourceSnapshot\.texture/);
  assert.match(puppetToolSource, /this\.isActive\(\) && nextTool !== PUPPET_TOOL_MODE/);
  assert.match(puppetToolSource, /this\.rasterizeActivePuppetLayer\(\)/);
  assert.match(puppetToolSource, /window\.addEventListener\("cbo:before-history-action", this\.handleBeforeHistoryAction\)/);
  assert.match(puppetToolSource, /namespace\.documentHistory\?\.flushLayerState\?\.\(this\.layerModel\)/);
  assert.match(puppetToolSource, /source: "puppet-rasterize-preview-clear"/);
  assert.match(puppetToolSource, /runAfterNextPaint\(\(\) => \{/);
  assert.match(puppetToolSource, /captureAfterSnapshot: false/);
  assert.match(puppetToolSource, /history-redo-puppet-rasterize-prepare/);
  assert.match(puppetToolSource, /renderer\.rasterizePuppetLayer\?\.?\(layerForRedo,/);
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

test("replaceRasterTarget can preserve preview cache and forward dirty bounds", () => {
  const rendererSource = readDocumentRendererSources();

  assert.match(rendererSource, /if \(options\.invalidate !== false \|\| options\.emit !== false\) \{/);
  assert.match(rendererSource, /this\.commitVisualDirtyChange\(\{/);
  assert.match(rendererSource, /rect: options\.rect \|\| null/);
  assert.match(rendererSource, /rects: options\.rects \|\| null/);
  assert.match(rendererSource, /source: options\.source \|\| "replace-raster-target"/);
});

test("silent raster materialization preserves preview cache", () => {
  const { DocumentRenderer } = loadDocumentRenderer();
  const renderer = Object.create(DocumentRenderer.prototype);
  const replaceCalls = [];
  const sparseTile = {
    framebuffer: { id: "tile-fb" },
    height: 128,
    texture: { id: "tile-texture" },
    width: 128,
    x: 64,
    y: 80,
  };
  const sparseTarget = {
    clearColor: [0, 0, 0, 0],
    sparse: true,
    tileSize: 256,
    tiles: new Map([["0:0", sparseTile]]),
  };
  const croppedTarget = {
    clearColor: [0, 0, 0, 0],
    cropped: true,
    framebuffer: { id: "cropped-fb" },
    height: 128,
    texture: { id: "cropped-texture" },
    width: 128,
    x: 64,
    y: 80,
  };

  renderer.width = 512;
  renderer.height = 512;
  renderer.rasterTargetsByLayerId = new Map([["paint-1", croppedTarget]]);
  renderer.createRasterTargetForDocumentRect = (layerId, rect) => ({
    cropped: true,
    framebuffer: { id: `full-from-sparse-${rect.x}-${rect.y}` },
    height: rect.height,
    texture: { id: `full-from-sparse-texture-${rect.x}-${rect.y}` },
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
  renderer.createRasterTarget = (clearColor, options = {}) => ({
    clearColor,
    cropped: options.cropped === true,
    framebuffer: { id: "full-fb" },
    height: options.height,
    texture: { id: "full-texture" },
    width: options.width,
    x: options.x,
    y: options.y,
  });
  renderer.copyRasterTargetRectIntoTarget = () => true;
  renderer.deleteRasterTargetObject = () => {};
  renderer.drawTexturedQuad = () => true;
  renderer.getRasterResourceManager = () => null;
  renderer.markRasterTargetDirty = () => {};
  renderer.replaceRasterTarget = (layerId, target, options = {}) => {
    replaceCalls.push({ layerId, options, target });
    return true;
  };

  assert.ok(renderer.materializeSparseRasterTarget("paint-1", sparseTarget, {
    emit: false,
    source: "unit-sparse-materialize",
  }));
  assert.equal(replaceCalls.at(-1).options.invalidate, false);

  assert.ok(renderer.materializeRasterTarget("paint-1", {
    emit: false,
    source: "unit-cropped-materialize",
  }));
  assert.equal(replaceCalls.at(-1).options.invalidate, false);

  assert.ok(renderer.materializeRasterTarget("paint-1", {
    emit: false,
    invalidate: true,
    source: "unit-cropped-materialize-force",
  }));
  assert.equal(replaceCalls.at(-1).options.invalidate, true);
});
