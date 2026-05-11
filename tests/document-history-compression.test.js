const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadCompression() {
  const context = vm.createContext({
    Uint8Array,
    window: {
      CBO: {},
    },
  });

  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "document", "document-history-compression.js"), "utf8"),
    context,
  );

  return context.window.CBO.HistoryCompression;
}

test("history compression round-trips compressible RGBA pixels", () => {
  const compression = loadCompression();
  const pixels = new Uint8Array(1024 * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0;
    pixels[i + 1] = 0;
    pixels[i + 2] = 0;
    pixels[i + 3] = 0;
  }

  const compressed = compression.compressRgba(pixels);

  assert.equal(compressed.encoding, compression.ENCODING);
  assert.ok(compressed.bytes.byteLength < pixels.byteLength);
  assert.deepEqual(
    Array.from(compression.decompressRgba(compressed.bytes, pixels.byteLength)),
    Array.from(pixels),
  );
});

test("history compression falls back to raw when RLE would expand", () => {
  const compression = loadCompression();
  const pixels = new Uint8Array(64 * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = i & 0xFF;
    pixels[i + 1] = (i * 3) & 0xFF;
    pixels[i + 2] = (i * 7) & 0xFF;
    pixels[i + 3] = 255;
  }

  const compressed = compression.compressRgba(pixels);

  assert.equal(compressed.encoding, null);
  assert.equal(compressed.bytes, pixels);
});

test("history compression exposes a debug summary helper", () => {
  const context = vm.createContext({
    ArrayBuffer,
    console: {
      log() {},
      table() {},
    },
    Uint8Array,
    window: {
      CBO: {},
    },
  });

  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "document", "document-history-compression.js"), "utf8"),
    context,
  );

  const compression = context.window.CBO.HistoryCompression;
  const rawPixels = new Uint8Array(32 * 4);
  const packed = compression.compressRgba(rawPixels);

  context.window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [
      {
        before: {
          cpuPixels: packed.bytes,
          cpuPixelsEncoding: packed.encoding,
          cpuRawBytes: rawPixels.byteLength,
        },
      },
    ],
  };

  const summary = context.window.CBO.debugHistoryCompression({ log: false });

  assert.equal(summary.undoEntries, 1);
  assert.equal(summary.compressedSnapshots, 1);
  assert.equal(summary.rawSnapshots, 0);
  assert.ok(summary.rawEquivalentMiB >= summary.compressedSnapshotsMiB);
});
