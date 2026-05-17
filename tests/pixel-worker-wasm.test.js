const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts));
}

function loadPixelWorker({ wasmAvailable = true } = {}) {
  const source = readRepoFile("js", "workers", "pixel-worker.js").toString("utf8");
  const wasmBytes = readRepoFile("wasm", "pixel_core.wasm");
  const self = {
    location: {
      href: "https://example.test/js/workers/pixel-worker.js",
    },
    postMessage() {},
  };
  const context = vm.createContext({
    ArrayBuffer,
    Date,
    Error,
    Infinity,
    Int32Array,
    Math,
    Number,
    Object,
    Promise,
    String,
    Uint8Array,
    URL,
    WebAssembly,
    console,
    fetch: async () => {
      if (!wasmAvailable) {
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }

      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => wasmBytes.buffer.slice(
          wasmBytes.byteOffset,
          wasmBytes.byteOffset + wasmBytes.byteLength,
        ),
      };
    },
    performance,
    self,
  });

  vm.runInContext(source, context);

  return self.__pixelWorkerTestHooks;
}

function setTopDownPixel(pixels, width, height, x, y, rgba) {
  const rawY = height - 1 - y;
  const offset = (rawY * width + x) * 4;

  pixels.set(rgba, offset);
}

function equalMask(a, b) {
  assert.deepEqual(Array.from(new Uint8Array(a)), Array.from(new Uint8Array(b)));
}

function makeDensePayload() {
  const width = 5;
  const height = 5;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setTopDownPixel(pixels, width, height, x, y, [10, 20, 30, 255]);
    }
  }

  setTopDownPixel(pixels, width, height, 3, 2, [200, 0, 0, 255]);

  return {
    height,
    pixels,
    seedX: 0,
    seedY: 0,
    tolerance: 0,
    width,
  };
}

test("dense flood fill returns same mask and bounds in JS and WASM", async () => {
  const hooks = loadPixelWorker();
  const payload = makeDensePayload();
  const jsResult = await hooks.runColorFill({
    ...payload,
    disableWasm: true,
    pixelsBuffer: new Uint8Array(payload.pixels).buffer,
  });
  const wasmResult = await hooks.runColorFill({
    ...payload,
    pixelsBuffer: new Uint8Array(payload.pixels).buffer,
  });

  assert.equal(jsResult.engine, "js");
  assert.equal(wasmResult.engine, "wasm");
  assert.deepEqual(JSON.parse(JSON.stringify(wasmResult.bounds)), JSON.parse(JSON.stringify(jsResult.bounds)));
  assert.equal(wasmResult.filledCount, jsResult.filledCount);
  equalMask(wasmResult.maskBuffer, jsResult.maskBuffer);
});

test("sparse flood fill returns same mask and bounds in JS and WASM", async () => {
  const hooks = loadPixelWorker();
  const tileSize = 4;
  const width = 8;
  const height = 8;
  const tilePixels = new Uint8Array(tileSize * tileSize * 4);

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      setTopDownPixel(tilePixels, tileSize, tileSize, x, y, [100, 0, 0, 255]);
    }
  }

  setTopDownPixel(tilePixels, tileSize, tileSize, 2, 1, [20, 0, 0, 255]);

  const makePayload = () => ({
    height,
    originX: 0,
    originY: 0,
    seedX: 0,
    seedY: 0,
    sourceSparse: true,
    sparseTiles: [
      {
        height: tileSize,
        pixelsBuffer: new Uint8Array(tilePixels).buffer,
        tx: 0,
        ty: 0,
        width: tileSize,
        x: 0,
        y: 0,
      },
    ],
    tileSize,
    tolerance: 0,
    width,
  });

  const jsResult = await hooks.runColorFill({ ...makePayload(), disableWasm: true });
  const wasmResult = await hooks.runColorFill(makePayload());

  assert.equal(jsResult.engine, "js");
  assert.equal(wasmResult.engine, "wasm");
  assert.deepEqual(JSON.parse(JSON.stringify(wasmResult.bounds)), JSON.parse(JSON.stringify(jsResult.bounds)));
  assert.equal(wasmResult.filledCount, jsResult.filledCount);
  equalMask(wasmResult.maskBuffer, jsResult.maskBuffer);
});

test("missing sparse tile is treated as transparent RGBA", async () => {
  const hooks = loadPixelWorker();
  const tileSize = 4;
  const width = 8;
  const height = 8;
  const tilePixels = new Uint8Array(tileSize * tileSize * 4);

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      setTopDownPixel(tilePixels, tileSize, tileSize, x, y, [255, 0, 0, 255]);
    }
  }

  const result = await hooks.runColorFill({
    height,
    originX: 0,
    originY: 0,
    seedX: 5,
    seedY: 5,
    sourceSparse: true,
    sparseTiles: [
      {
        height: tileSize,
        pixelsBuffer: tilePixels.buffer,
        tx: 0,
        ty: 0,
        width: tileSize,
        x: 0,
        y: 0,
      },
    ],
    tileSize,
    tolerance: 0,
    width,
  });

  assert.equal(result.engine, "wasm");
  assert.equal(result.filledCount, width * height - tileSize * tileSize);
  assert.deepEqual(JSON.parse(JSON.stringify(result.bounds)), {
    maxX: 7,
    maxY: 7,
    minX: 0,
    minY: 0,
  });
});

test("falls back to JS when WASM does not load", async () => {
  const hooks = loadPixelWorker({ wasmAvailable: false });
  const payload = makeDensePayload();
  const result = await hooks.runColorFill({
    ...payload,
    pixelsBuffer: payload.pixels.buffer,
  });

  assert.equal(result.engine, "js");
  assert.match(result.wasmError, /Unable to fetch|WebAssembly|wasm/i);
  assert.equal(result.filledCount, 24);
});

test("color fill debug exposes worker engine and timings", () => {
  const source = readRepoFile("js", "color-fill.js").toString("utf8");

  assert.match(source, /namespace\.lastColorFillWorker/);
  assert.match(source, /engine: workerResult\.engine \|\| "js"/);
  assert.match(source, /namespace\.lastColorFillTimings/);
  assert.match(source, /readPixelsMs/);
  assert.match(source, /workerRoundTripMs/);
});
