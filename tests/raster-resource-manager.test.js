const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadManager() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "debug", "raster-resource-manager.js"),
    "utf8",
  );
  const context = {
    console,
    window: {
      CBO: {
        documentRenderer: {
          estimatePaintTargetCropPotential: (options = {}) => ({
            candidateCount: 1,
            mode: options.precise === true ? "precise" : "sampled",
            paintTargetCount: 1,
            potentialSavingsBytes: 8 * 1024 * 1024,
            potentialSavingsMiB: "8.00",
            rows: [{
              action: "crop-candidate",
              contentCoverage: 0.1,
              contentRect: { height: 1000, width: 1000, x: 0, y: 0 },
              currentMiB: "61.04",
              estimatedCroppedMiB: "3.81",
              isFullCanvas: true,
              layerId: "paint-1",
              mode: options.precise === true ? "precise" : "sampled",
              savingsMiB: "57.23",
            }],
          }),
          height: 4000,
          width: 4000,
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  return context.window.CBO.rasterResourceManager;
}

function loadDebugMemoryScripts() {
  const context = {
    console,
    window: {
      CBO: {
        documentRenderer: {
          estimatePaintTargetCropPotential: (options = {}) => ({
            candidateCount: 1,
            mode: options.precise === true ? "precise" : "sampled",
            paintTargetCount: 1,
            potentialSavingsBytes: 8 * 1024 * 1024,
            potentialSavingsMiB: "8.00",
            rows: [],
          }),
          height: 4000,
          width: 4000,
        },
      },
    },
  };

  vm.createContext(context);

  for (const file of [
    path.join(__dirname, "..", "js", "debug", "raster-resource-manager.js"),
    path.join(__dirname, "..", "js", "debug", "raster-memory-report.js"),
  ]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context);
  }

  return context.window.CBO;
}

test("raster resource manager reports owner buckets and full-canvas events", () => {
  const manager = loadManager();
  const liveTexture = {};
  const previewTexture = {};
  const previewFramebuffer = {};

  manager.registerTexture(liveTexture, {
    height: 4000,
    kind: "paintTarget",
    layerId: "paint-1",
    ownerId: "paint-1",
    ownerType: "live",
    width: 4000,
  });
  const preview = manager.registerTexture(previewTexture, {
    height: 4000,
    kind: "previewMip",
    mipLevels: 3,
    ownerId: "preview-cache",
    ownerType: "cache",
    purgeable: true,
    width: 4000,
  });

  manager.registerFramebuffer(previewFramebuffer, {
    kind: "previewMipFramebuffer",
    linkedTextureId: preview.id,
    ownerId: "preview-cache",
    ownerType: "cache",
  });
  manager.recordFullCanvasMaterialization({
    bytesAdded: 16,
    layerId: "paint-1",
    newSize: { height: 4000, width: 4000 },
    oldBBox: { height: 64, width: 64, x: 10, y: 20 },
    reason: "test",
    tool: "unit-test",
  });
  manager.recordStrokeMemory({
    beforeBytes: 4 * 1024 * 1024,
    canvasSize: { height: 4000, width: 4000 },
    coverage: 0.1,
    estimatedPeakBytes: 12 * 1024 * 1024,
    historyMode: "gpu-before-lazy-after",
    layerId: "paint-1",
    phase: "unit-test",
    policy: "medium",
    potentialAfterBytes: 4 * 1024 * 1024,
    scratchBytes: 4 * 1024 * 1024,
    strokeBufferRect: { height: 1024, width: 1024, x: 0, y: 0 },
    strokeRect: { height: 1024, width: 1024, x: 0, y: 0 },
    tool: "brush",
  });
  manager.recordRasterOperation({
    canvasSize: { height: 4000, width: 4000 },
    decodedSize: { height: 3000, width: 4000 },
    estimatedPeakBytes: 94 * 1024 * 1024,
    layerId: "image-1",
    maxMiB: 64,
    maxSide: 4096,
    operationType: "image-import",
    originalBytes: 432 * 1024 * 1024,
    originalSize: { height: 9000, width: 12000 },
    policy: "large",
    scale: 1 / 3,
    sourceBytes: 48 * 1024 * 1024,
    targetBytes: 46 * 1024 * 1024,
    targetRect: { height: 3000, width: 4000, x: 0, y: 500 },
    tool: "image-import",
  });

  const report = manager.reportRasterMemory({ log: false });

  assert.equal(report.textureCount, 2);
  assert.equal(report.framebufferCount, 1);
  assert.equal(report.fullCanvasResourceCount, 2);
  assert.equal(report.fullCanvasMaterializationCount, 1);
  assert.equal(report.rasterOperationEventCount, 1);
  assert.equal(report.rasterOperationEvents[0].operationType, "image-import");
  assert.equal(report.rasterOperationEvents[0].policy, "large");
  assert.equal(report.rasterOperationEvents[0].estimatedPeakMiB, "94.00");
  assert.equal(report.rasterOperationEvents[0].originalMiB, "432.00");
  assert.equal(report.strokeMemoryEventCount, 1);
  assert.equal(report.strokeMemoryEvents[0].policy, "medium");
  assert.equal(report.strokeMemoryEvents[0].estimatedPeakMiB, "12.00");
  assert.equal(report.paintLayerBytes, 4000 * 4000 * 4);
  assert.equal(report.paintTargetCropPotential, null);
  assert.equal(report.paintTargetPotentialSavingsBytes, 0);
  assert.equal(report.previewCacheBytes, manager.estimateTextureBytes(4000, 4000, 3));
  assert.equal(report.purgeableResourceCount, 1);
  assert.equal(report.topResourcesByBytes[0].ownerType, "cache");

  const paintTargetReport = manager.reportRasterMemory({
    analyzePaintTargets: true,
    log: false,
    paintTargetAnalysis: { precise: true },
  });

  assert.equal(paintTargetReport.paintTargetPotentialSavingsBytes, 8 * 1024 * 1024);
  assert.equal(paintTargetReport.paintTargetPotentialSavingsMiB, "8.00");
  assert.equal(paintTargetReport.paintTargetCropPotential.mode, "precise");
  assert.equal(paintTargetReport.paintTargetCropPotential.rows[0].action, "crop-candidate");

  manager.deleteTexture(previewTexture);
  manager.deleteFramebuffer(previewFramebuffer);

  const afterDelete = manager.reportRasterMemory({ log: false });

  assert.equal(afterDelete.textureCount, 1);
  assert.equal(afterDelete.framebufferCount, 0);
  assert.equal(afterDelete.deletedTextureCount, 1);
  assert.equal(afterDelete.deletedFramebufferCount, 1);
});

test("global raster memory report forwards paint target analysis options", () => {
  const namespace = loadDebugMemoryScripts();
  const report = namespace.reportRasterMemory({
    analyzePaintTargets: true,
    log: false,
    paintTargetAnalysis: { precise: true },
  });

  assert.equal(report.paintTargetPotentialSavingsBytes, 8 * 1024 * 1024);
  assert.equal(report.paintTargetCropPotential.mode, "precise");
});

test("raster resource manager can trace large texture allocations", () => {
  const manager = loadManager();

  manager.setResourceTraceEnabled(true, { clear: true, log: false, minMiB: 1 });

  manager.registerTexture({}, {
    height: 4000,
    kind: "paintTarget",
    layerId: "paint-debug",
    ownerId: "paint-debug",
    ownerType: "live",
    reason: "debug-test",
    width: 4000,
  });
  manager.registerTexture({}, {
    height: 16,
    kind: "tinyScratch",
    ownerType: "scratch",
    width: 16,
  });

  const trace = manager.getResourceTraceEvents();

  assert.equal(trace.length, 1);
  assert.equal(trace[0].action, "register-texture");
  assert.equal(trace[0].category, "live/paintTarget");
  assert.equal(trace[0].layerId, "paint-debug");
  assert.equal(trace[0].MiB, "61.04");

  const report = manager.reportRasterMemory({ log: false });

  assert.equal(report.resourceTraceEventCount, 1);
  assert.equal(report.resourceTraceEvents[0].reason, "debug-test");
});
