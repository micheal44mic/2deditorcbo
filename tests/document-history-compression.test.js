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

  assert.equal(compression.isCompressedEncoding(compressed.encoding), true);
  assert.ok(compressed.bytes.byteLength < pixels.byteLength);
  assert.deepEqual(
    Array.from(compression.decompressRgba(compressed.bytes, pixels.byteLength, compressed.encoding)),
    Array.from(pixels),
  );
});

test("history compression trims retained RLE backing buffers", () => {
  const compression = loadCompression();
  const pixels = new Uint8Array(1024 * 1024 * 4);

  const compressed = compression.compressRgba(pixels);

  assert.equal(compression.isCompressedEncoding(compressed.encoding), true);
  assert.equal(compressed.bytes.buffer.byteLength, compressed.bytes.byteLength);
  assert.ok(compressed.bytes.byteLength < pixels.byteLength);
});

test("history compression packetizes mixed literal and repeated RGBA pixels", () => {
  const compression = loadCompression();
  const pixels = new Uint8Array(250 * 4);

  for (let i = 0; i < 100; i += 1) {
    const offset = i * 4;

    pixels[offset] = i & 0xFF;
    pixels[offset + 1] = (i * 3) & 0xFF;
    pixels[offset + 2] = (i * 7) & 0xFF;
    pixels[offset + 3] = 255;
  }

  for (let i = 150; i < 250; i += 1) {
    const offset = i * 4;

    pixels[offset] = i & 0xFF;
    pixels[offset + 1] = (i * 5) & 0xFF;
    pixels[offset + 2] = (i * 11) & 0xFF;
    pixels[offset + 3] = 255;
  }

  const compressed = compression.compressRgba(pixels);

  assert.equal(compressed.encoding, compression.ENCODING);
  assert.ok(compressed.bytes.byteLength < pixels.byteLength);
  assert.deepEqual(
    Array.from(compression.decompressRgba(compressed.bytes, pixels.byteLength, compressed.encoding)),
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

test("history compression debug summary counts retained backing buffers", () => {
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

  const retainedBytes = 2 * 1024 * 1024;
  const rawBytes = 4 * 1024 * 1024;
  const retainedView = new Uint8Array(retainedBytes).subarray(0, 16);

  context.window.CBO.documentHistory = {
    redoStack: [],
    undoStack: [
      {
        before: {
          cpuPixels: retainedView,
          cpuPixelsEncoding: context.window.CBO.HistoryCompression.ENCODING,
          cpuRawBytes: rawBytes,
        },
      },
    ],
  };

  const summary = context.window.CBO.debugHistoryCompression({ log: false });

  assert.equal(summary.compressedSnapshotsMiB, 2);
  assert.equal(summary.compressedRawEquivalentMiB, 4);
  assert.equal(summary.compressionRatio, 2);
});
