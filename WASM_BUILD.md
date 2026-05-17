# Pixel Worker WASM build

WASM is loaded only inside `js/workers/pixel-worker.js`.
The Worker tries to fetch:

```txt
../../wasm/pixel_core.wasm
```

So, from the site root, deploy it here:

```txt
wasm/pixel_core.wasm
```

## Build with clang

From the repository root:

```bash
mkdir -p wasm
clang --target=wasm32 \
  -O3 \
  -nostdlib \
  -fno-builtin \
  -Wl,--no-entry \
  -Wl,--export-memory \
  -Wl,--export=reserve_stack \
  -Wl,--export=flood_fill_dense_rgba \
  -Wl,--export=flood_fill_sparse_rgba \
  -o wasm/pixel_core.wasm \
  wasm/pixel_core.c
```

`alloc` and `free` are exported by `__attribute__((export_name(...)))`, so they do not need explicit linker `--export` flags.

## Files to copy

```txt
index.html
js/color-fill.js
js/pixel/pixel-worker-client.js
js/workers/pixel-worker.js
wasm/pixel_core.c
wasm/pixel_core.wasm
tests/pixel-worker-wasm.test.js
```

## Runtime behavior

- Dense and sparse/tiled flood fill try WASM first.
- If WASM fails to load/compile/run, the Worker falls back to JS.
- Coverage mask stays JS in this first version.
- No WASM runs on the main thread.
- No `SharedArrayBuffer` is used.
- Sparse lookup is an `Int32Array` tile lookup table; missing tiles are RGBA transparent `0,0,0,0`.

## Debug on Android, iOS, and desktop

After a fill:

```js
console.log(window.CBO.lastColorFillWorker);
console.log(window.CBO.lastColorFillTimings);
```

Expected when WASM is active:

```js
window.CBO.lastColorFillWorker.engine === "wasm"
```

Expected when WASM fails but Worker JS fallback works:

```js
window.CBO.lastColorFillWorker.engine === "js"
```

Timing fields include:

```txt
readPixelsMs
serializeMs
workerRoundTripMs
workerMs
wasmInitMs
wasmMs
jsMs
coverageMs
applyMs
totalMs
```

If `readPixelsMs` or `applyMs` dominate, the bottleneck is GPU readback/copy/apply, not the flood-fill algorithm.

## Tests

```bash
node --test tests/pixel-worker-wasm.test.js
```
