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

  const report = manager.reportRasterMemory({ log: false });

  assert.equal(report.textureCount, 2);
  assert.equal(report.framebufferCount, 1);
  assert.equal(report.fullCanvasResourceCount, 2);
  assert.equal(report.fullCanvasMaterializationCount, 1);
  assert.equal(report.paintLayerBytes, 4000 * 4000 * 4);
  assert.equal(report.previewCacheBytes, manager.estimateTextureBytes(4000, 4000, 3));
  assert.equal(report.purgeableResourceCount, 1);
  assert.equal(report.topResourcesByBytes[0].ownerType, "cache");

  manager.deleteTexture(previewTexture);
  manager.deleteFramebuffer(previewFramebuffer);

  const afterDelete = manager.reportRasterMemory({ log: false });

  assert.equal(afterDelete.textureCount, 1);
  assert.equal(afterDelete.framebufferCount, 0);
  assert.equal(afterDelete.deletedTextureCount, 1);
  assert.equal(afterDelete.deletedFramebufferCount, 1);
});
