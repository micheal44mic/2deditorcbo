const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadSelectionRegion() {
  const context = {
    Uint8Array,
    window: {
      CBO: {},
    },
  };

  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "selection-region.js"), "utf8"),
    context,
  );

  return context.window.CBO.SelectionRegion;
}

test("SelectionRegion adds and subtracts rectangular coverage with holes", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromRect({ x: 10, y: 10, width: 10, height: 10 });

  region.subtractRect({ x: 13, y: 13, width: 3, height: 3 });

  assert.equal(region.containsPoint(12, 12), true);
  assert.equal(region.containsPoint(14, 14), false);
  assert.equal(region.containsPoint(18, 18), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(region.getBounds())),
    { x: 10, y: 10, width: 10, height: 10 },
  );
});

test("SelectionRegion serializes, restores, translates, and emits mask pixels", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromRect({ x: 0, y: 0, width: 4, height: 4 });

  region.subtractRect({ x: 1, y: 1, width: 2, height: 2 });

  const restored = SelectionRegion.deserialize(region.serialize());
  const translated = restored.translate(10, 20);
  const mask = restored.createMaskPixels({ x: 0, y: 0, width: 4, height: 4 });

  assert.equal(restored.containsPoint(0, 0), true);
  assert.equal(restored.containsPoint(1, 1), false);
  assert.equal(translated.containsPoint(10, 20), true);
  assert.equal(translated.containsPoint(11, 21), false);
  assert.equal(mask.width, 4);
  assert.equal(mask.height, 4);
  assert.equal(mask.pixels[0], 255);
  assert.equal(mask.pixels[1 * 4 + 1], 0);
});

test("SelectionRegion produces compact coverage rects and tile patch rects", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.empty()
    .addRect({ x: 0, y: 0, width: 4, height: 4 })
    .addRect({ x: 20, y: 20, width: 2, height: 2 });
  const coverageRects = region.getCoverageRects();
  const patches = region.getTilePatchRects(region.getBounds(), { tileSize: 16 });

  assert.ok(coverageRects.some((rect) => rect.x === 0 && rect.y === 0 && rect.width === 4 && rect.height === 4));
  assert.ok(coverageRects.some((rect) => rect.x === 20 && rect.y === 20 && rect.width === 2 && rect.height === 2));
  assert.ok(patches.every((rect) => rect.width <= 16 && rect.height <= 16));
  assert.ok(patches.some((rect) => rect.x === 20 && rect.y === 20));
});

test("SelectionRegion boundary segments skip internal coverage seams", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromRect({ x: 0, y: 0, width: 10, height: 10 });

  region.subtractRect({ x: 6, y: 0, width: 4, height: 3 });

  const segments = region.getBoundarySegments();

  assert.ok(segments.some((segment) =>
    segment.x1 === 0 && segment.x2 === 6 && segment.y1 === 0 && segment.y2 === 0
  ));
  assert.ok(segments.some((segment) =>
    segment.x1 === 6 && segment.x2 === 10 && segment.y1 === 3 && segment.y2 === 3
  ));
  assert.ok(!segments.some((segment) =>
    segment.x1 === 0 && segment.x2 === 6 && segment.y1 === 3 && segment.y2 === 3
  ));
});

test("SelectionRegion adds and subtracts lasso polygon coverage", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromPolygon([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);

  assert.equal(region.containsPoint(5, 5), true);
  assert.equal(region.containsPoint(12, 5), false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(region.getBounds())),
    { x: 0, y: 0, width: 10, height: 10 },
  );

  region.subtractPolygon([
    { x: 3, y: 3 },
    { x: 7, y: 3 },
    { x: 7, y: 7 },
    { x: 3, y: 7 },
  ]);

  assert.equal(region.containsPoint(5, 5), false);
  assert.equal(region.containsPoint(1, 1), true);
});

test("SelectionRegion adds and subtracts elliptical coverage", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromEllipse({ x: 10, y: 10, width: 20, height: 20 });

  assert.equal(region.containsPoint(20, 20), true);
  assert.equal(region.containsPoint(10, 10), false);
  assert.equal(region.containsPoint(20, 10), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(region.getBounds())),
    { x: 10, y: 10, width: 20, height: 20 },
  );

  region.subtractEllipse({ x: 15, y: 15, width: 10, height: 10 });

  assert.equal(region.containsPoint(20, 20), false);
  assert.equal(region.containsPoint(20, 12), true);
  assert.equal(region.getCoverageRects().length > 1, true);
});

test("SelectionRegion lasso polygon uses non-zero union filling for self overlaps", () => {
  const SelectionRegion = loadSelectionRegion();
  const region = SelectionRegion.fromPolygon([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
  ]);

  assert.equal(region.containsPoint(5, 5), true);
  assert.equal(region.containsPoint(15, 5), true);
});
