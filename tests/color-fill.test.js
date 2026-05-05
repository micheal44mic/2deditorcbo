const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

function loadColorFillModule() {
  const source = readRepoFile("js", "color-fill.js");
  const window = {
    CBO: {},
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Event,
    Int32Array,
    Math,
    Number,
    Object,
    String,
    Uint8Array,
    console,
    window,
  });

  vm.runInContext(source, context);

  return window.CBO;
}

function createFramebuffer(width, height) {
  return {
    height,
    pixels: new Uint8Array(width * height * 4),
    width,
  };
}

function setTopDownPixel(framebuffer, x, y, rgba) {
  const rawY = framebuffer.height - 1 - y;
  const offset = (rawY * framebuffer.width + x) * 4;

  framebuffer.pixels[offset] = rgba[0];
  framebuffer.pixels[offset + 1] = rgba[1];
  framebuffer.pixels[offset + 2] = rgba[2];
  framebuffer.pixels[offset + 3] = rgba[3];
}

function createFakeGl() {
  const gl = {
    FRAMEBUFFER: "FRAMEBUFFER",
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    RGBA: "RGBA",
    TEXTURE_2D: "TEXTURE_2D",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
    boundReadFramebuffer: null,
    boundTexture: null,
    uploads: [],
    bindFramebuffer(target, framebuffer) {
      if (target === this.READ_FRAMEBUFFER) {
        this.boundReadFramebuffer = framebuffer;
      }
    },
    bindTexture(_target, texture) {
      this.boundTexture = texture;
    },
    pixelStorei() {},
    readPixels(x, y, width, height, _format, _type, output) {
      const source = this.boundReadFramebuffer;

      output.fill(0);

      if (!source) {
        return;
      }

      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const sourceX = x + col;
          const sourceY = y + row;

          if (sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height) {
            continue;
          }

          const sourceOffset = (sourceY * source.width + sourceX) * 4;
          const outputOffset = (row * width + col) * 4;

          output[outputOffset] = source.pixels[sourceOffset];
          output[outputOffset + 1] = source.pixels[sourceOffset + 1];
          output[outputOffset + 2] = source.pixels[sourceOffset + 2];
          output[outputOffset + 3] = source.pixels[sourceOffset + 3];
        }
      }
    },
    texSubImage2D(_target, _level, x, y, width, height, _format, _type, pixels) {
      this.uploads.push({
        height,
        pixels: new Uint8Array(pixels),
        width,
        x,
        y,
      });
    },
  };

  return gl;
}

test("color drop is wired to the Procreate-style fill module", () => {
  const indexSource = readRepoFile("index.html");
  const colorDropSource = readRepoFile("js", "color-drop.js");
  const imageRasterizerIndex = indexSource.indexOf("./js/images/image-rasterizer.js");
  const colorFillIndex = indexSource.indexOf("./js/color-fill.js");
  const editorCanvasIndex = indexSource.indexOf("./js/editor-canvas.js");
  const appIndex = indexSource.indexOf("./js/app.js");

  assert.ok(imageRasterizerIndex > 0);
  assert.ok(colorFillIndex > imageRasterizerIndex);
  assert.ok(editorCanvasIndex > colorFillIndex);
  assert.ok(appIndex > editorCanvasIndex);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.beginDropDrag\?\.\(\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.dropColorAt\?\.\(dropX, dropY, color\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.endDropDrag\?\.\(\)/);
  assert.match(colorDropSource, /window\.CBO\.colorFill\?\.cancelDropDrag\?\.\(\)/);
});

test("color fill uses active layer pixels unless a reference layer is set", () => {
  const source = readRepoFile("js", "color-fill.js");

  assert.match(source, /function setReferenceLayerId\(layerId, options = \{\}\)/);
  assert.match(source, /recordReferenceStateChange\?\.\(previousLayerId, nextLayerId,/);
  assert.match(source, /function clearReferenceLayerId\(options = \{\}\)/);
  assert.match(source, /function getExistingRasterTarget\(layerId\)/);
  assert.match(source, /function getReferenceTarget\(writeTarget\)/);
  assert.match(source, /function createReferencePixelSource\(gl, referenceTarget\)/);
  assert.match(source, /function getReferencePixelOffset\(referenceSource, documentX, documentY\)/);
  assert.match(source, /const referenceTarget = getReferenceTarget\(target\)/);
  assert.match(source, /const referenceFramebuffer = referenceTarget\.framebuffer/);
  assert.match(source, /return null;/);
  assert.doesNotMatch(source, /updatePreviewCacheIfNeeded/);
  assert.doesNotMatch(source, /previewFramebuffer/);
  assert.doesNotMatch(source, /ensureActivePaintLayer\?\.\(\{ source: "color-fill" \}\)/);
  assert.match(source, /let stack = new Int32Array\(Math\.max\(1, Math\.min\(4096, pixelCount\)\)\)/);
  assert.match(source, /maxStackCapacity \* Int32Array\.BYTES_PER_ELEMENT/);
  assert.match(source, /function getDilationRadius\(tolerance\)/);
  assert.match(source, /if \(normalizedTolerance < 16\) \{/);
  assert.match(source, /function dilateMask\(mask, width, height, bounds, radius = 1\)/);
  assert.match(source, /getDilationRadius\(tolerance\)/);
  assert.match(source, /renderer\.beginRasterTileHistory\?\.\(layerId, dirtyRect/);
  assert.match(source, /renderer\.commitRasterTileHistory\?\.\(tileHistory,/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(layerId, dirtyRect, "color-fill-before"\)/);
  assert.match(source, /recordColorFillMemory\(renderer,/);
  assert.match(source, /operationType: "color-fill"/);
  assert.match(source, /let afterSnapshot = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /afterSnapshot = renderer\.createRasterSnapshot\?\.\(layerId, dirtyRect, "color-fill-after"\)/);
  assert.match(source, /entry\.after = afterSnapshot/);
  assert.doesNotMatch(source, /const afterSnapshot = renderer\.createRasterSnapshot\?\.\(layerId, dirtyRect, "color-fill-after"\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\(layerId, beforeSnapshot/);
  assert.match(source, /gl\.texSubImage2D\(/);
  assert.match(source, /brushEngine\.screenToDocumentSpace\(clientX, clientY\)/);
});

test("color fill reference changes are recorded in document history", () => {
  const CBO = loadColorFillModule();
  const calls = [];

  CBO.documentHistory = {
    recordReferenceStateChange(beforeLayerId, afterLayerId, options = {}) {
      calls.push({ afterLayerId, beforeLayerId, source: options.source });
      return true;
    },
  };

  CBO.colorFill.setReferenceLayerId("ref", {
    emit: false,
    source: "unit-reference",
  });
  CBO.colorFill.clearReferenceLayerId({
    emit: false,
    source: "unit-clear-reference",
  });

  assert.deepEqual(calls, [
    { afterLayerId: "ref", beforeLayerId: "", source: "unit-reference" },
    { afterLayerId: "", beforeLayerId: "ref", source: "unit-clear-reference" },
  ]);
});

test("color fill maps cropped reference layers into document coordinates", () => {
  const CBO = loadColorFillModule();
  const gl = createFakeGl();
  const activeFramebuffer = createFramebuffer(20, 20);
  const referenceFramebuffer = createFramebuffer(4, 4);
  const activeTarget = {
    cropped: false,
    framebuffer: activeFramebuffer,
    height: 20,
    layerId: "paint",
    texture: {},
    width: 20,
    x: 0,
    y: 0,
  };
  const referenceTarget = {
    cropped: true,
    framebuffer: referenceFramebuffer,
    height: 4,
    texture: {},
    width: 4,
    x: 10,
    y: 10,
  };
  const snapshots = [];

  setTopDownPixel(referenceFramebuffer, 1, 1, [255, 255, 255, 255]);

  CBO.brushEngine = {
    screenToDocumentSpace: () => ({
      docX: 11,
      docY: 11,
    }),
  };
  CBO.documentLayerModel = {
    activeLayerId: "paint",
    findEntryById(layerId) {
      if (layerId === "paint") {
        return { id: "paint", type: "paint" };
      }

      if (layerId === "ref") {
        return { id: "ref", type: "image" };
      }

      return null;
    },
  };
  CBO.documentRenderer = {
    gl,
    rasterTargetsByLayerId: new Map([
      ["paint", activeTarget],
      ["ref", referenceTarget],
    ]),
    createRasterSnapshot(layerId, dirtyRect, source) {
      snapshots.push({
        dirtyRect: { ...dirtyRect },
        layerId,
        source,
      });

      return { texture: {} };
    },
    deleteRasterSnapshot() {},
    emitContentChange() {},
    getRasterTarget(layerId) {
      return {
        ...activeTarget,
        layerId,
      };
    },
    getRasterTargetDocumentRect(target) {
      return {
        height: target.height,
        width: target.width,
        x: target.x,
        y: target.y,
      };
    },
    invalidatePreviewCache() {},
    isCroppedRasterTarget(target) {
      return Boolean(target?.cropped);
    },
    requestDraw() {},
  };

  CBO.colorFill.setReferenceLayerId("ref", { emit: false });

  assert.equal(CBO.colorFill.dropColorAt(0, 0, "#112233", { tolerance: 0 }), true);
  assert.deepEqual(snapshots[0].dirtyRect, {
    height: 3,
    width: 3,
    x: 10,
    y: 10,
  });

  assert.equal(gl.uploads.length, 1);
  assert.equal(gl.uploads[0].x, 10);
  assert.equal(gl.uploads[0].width, 3);
  assert.equal(gl.uploads[0].height, 3);

  const centerOffset = (1 * 3 + 1) * 4;

  assert.deepEqual(Array.from(gl.uploads[0].pixels.slice(centerOffset, centerOffset + 4)), [
    17,
    34,
    51,
    255,
  ]);
});

test("color fill exposes route-1 anti-aliased coverage helpers", () => {
  const source = readRepoFile("js", "color-fill.js");

  assert.match(source, /FILL_EDGE_AA_RADIUS = 1/);
  assert.match(source, /function createFillCoverageMask\(mask, width, height, bounds, radius = 0\)/);
  assert.match(source, /function compositeFillPixelPremultiplied\(targetPixels, offset, fillColor, coverageByte\)/);
  assert.match(source, /sourceAlpha = \(fillColor\.a \/ 255\) \* coverage/);
  assert.match(source, /fillCoverageMaskBytes: coverageMaskBytes/);
  assert.match(source, /namespace\.__colorFillTestHooks = Object\.freeze/);
});

test("fill coverage mask keeps interiors solid and creates partial outside edges", () => {
  const CBO = loadColorFillModule();
  const { createFillCoverageMask } = CBO.__colorFillTestHooks;
  const width = 5;
  const height = 5;
  const mask = new Uint8Array(width * height);

  mask[2 * width + 2] = 1;

  const coverageMask = createFillCoverageMask(
    mask,
    width,
    height,
    { minX: 2, minY: 2, maxX: 2, maxY: 2 },
    0,
  );

  assert.equal(coverageMask[2 * width + 2], 255);
  assert.ok(coverageMask[2 * width + 3] > 0);
  assert.ok(coverageMask[2 * width + 3] < 255);
  assert.equal(coverageMask[0], 0);
});

test("fill coverage tolerance widens a partial band without full binary dilation", () => {
  const CBO = loadColorFillModule();
  const { createFillCoverageMask } = CBO.__colorFillTestHooks;
  const width = 7;
  const height = 7;
  const mask = new Uint8Array(width * height);

  mask[3 * width + 3] = 1;

  const coverageMask = createFillCoverageMask(
    mask,
    width,
    height,
    { minX: 3, minY: 3, maxX: 3, maxY: 3 },
    1,
  );
  const adjacentCoverage = coverageMask[3 * width + 4];
  const fartherCoverage = coverageMask[3 * width + 5];

  assert.equal(coverageMask[3 * width + 3], 255);
  assert.ok(adjacentCoverage > 0 && adjacentCoverage < 255);
  assert.ok(fartherCoverage > 0 && fartherCoverage < adjacentCoverage);
});

test("color fill composites premultiplied source-over instead of overwriting", () => {
  const CBO = loadColorFillModule();
  const { compositeFillPixelPremultiplied } = CBO.__colorFillTestHooks;
  const pixels = new Uint8Array([64, 64, 64, 128]);

  compositeFillPixelPremultiplied(
    pixels,
    0,
    { r: 255, g: 0, b: 0, a: 255 },
    128,
  );

  assert.notDeepEqual(Array.from(pixels), [255, 0, 0, 255]);

  const sourceAlpha = 128 / 255;
  const inverseSourceAlpha = 1 - sourceAlpha;
  const expectedR = Math.round(((1 * sourceAlpha) + ((64 / 255) * inverseSourceAlpha)) * 255);
  const expectedG = Math.round(((64 / 255) * inverseSourceAlpha) * 255);
  const expectedB = Math.round(((64 / 255) * inverseSourceAlpha) * 255);
  const expectedA = Math.round((sourceAlpha + (128 / 255) * inverseSourceAlpha) * 255);

  assert.deepEqual(Array.from(pixels), [expectedR, expectedG, expectedB, expectedA]);
});

test("applyFillToDirtyPixels writes solid interiors and partial boundary pixels", () => {
  const CBO = loadColorFillModule();
  const { applyFillToDirtyPixels } = CBO.__colorFillTestHooks;
  const width = 3;
  const height = 3;
  const dirtyRect = { height, width, x: 0, y: 0 };
  const coverageMask = new Uint8Array(width * height);
  const targetPixels = new Uint8Array(width * height * 4);

  coverageMask[1 * width + 1] = 255;
  coverageMask[1 * width + 2] = 128;

  applyFillToDirtyPixels(
    targetPixels,
    coverageMask,
    dirtyRect,
    width,
    { r: 255, g: 0, b: 0, a: 255 },
  );

  const interiorOffset = (1 * width + 1) * 4;
  const boundaryOffset = (1 * width + 2) * 4;

  assert.deepEqual(Array.from(targetPixels.slice(interiorOffset, interiorOffset + 4)), [
    255,
    0,
    0,
    255,
  ]);
  assert.ok(targetPixels[boundaryOffset + 3] > 0);
  assert.ok(targetPixels[boundaryOffset + 3] < 255);
});

test("fill mask memory accounting includes coverage mask bytes", () => {
  const CBO = loadColorFillModule();
  const { getFillMaskMemoryBytes } = CBO.__colorFillTestHooks;
  const fillResult = {
    mask: new Uint8Array(16),
    stackBytes: 64,
  };
  const coverageMask = new Uint8Array(16);

  assert.equal(getFillMaskMemoryBytes(fillResult, coverageMask), 96);
});

test("color fill exposes a top-center threshold range styled like quick brush controls", () => {
  const source = readRepoFile("js", "color-fill.js");
  const cssSource = readRepoFile("css", "color-drop.css");

  assert.match(source, /DEFAULT_FILL_TOLERANCE = 48/);
  assert.match(source, /className = "bottom-toolbar color-fill-threshold-toolbar"/);
  assert.match(source, /type="range" min="0" max="\$\{MAX_FILL_TOLERANCE\}" step="1"/);
  assert.match(source, /setTolerance\(thresholdInput\.value\)/);
  assert.match(cssSource, /\.color-fill-threshold-toolbar/);
  assert.match(cssSource, /left: calc\(var\(--left-panel-width\) \+ \(\(100vw - var\(--left-panel-width\) - var\(--right-panel-width\)\) \/ 2\)\)/);
  assert.match(cssSource, /--color-fill-threshold-progress/);
});

test("layers panel exposes a right-click reference layer action", () => {
  const source = readRepoFile("js", "layers-panel.js");
  const cssSource = readRepoFile("css", "layers-panel.css");

  assert.match(source, /panel\.addEventListener\("contextmenu"/);
  assert.match(source, /data-layer-context-action="reference"/);
  assert.match(source, /SET AS REFERENCE/);
  assert.match(source, /REMOVE REFERENCE/);
  assert.match(source, /window\.CBO\.colorFill\.setReferenceLayerId\(layerId, \{ \.\.\.options, source \}\)/);
  assert.match(source, /window\.CBO\.colorFill\.clearReferenceLayerId\(\{ \.\.\.options, source \}\)/);
  assert.match(source, /clearReferenceLayerId\("layers-panel-prune-reference", \{ history: false \}\)/);
  assert.match(source, /classList\.toggle\("reference-layer"/);
  assert.match(source, /cbo:color-fill-reference-change/);
  assert.match(cssSource, /\.layer-row\.reference-layer \.layer-info::after/);
  assert.match(cssSource, /\.layer-context-menu/);
});
