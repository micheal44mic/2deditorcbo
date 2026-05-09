const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadCurvesEngine() {
  const source = fs.readFileSync(path.join(repoRoot, "js", "curves-engine.js"), "utf8");
  const context = vm.createContext({
    Date,
    Math,
    Object,
    String,
    Uint8Array,
    window: {
      CBO: {},
    },
  });

  vm.runInContext(source, context);
  return context.window.CBO.CurvesEngine;
}

test("curves engine builds identity LUTs and packed RGB data", () => {
  const engine = loadCurvesEngine();
  const points = engine.createDefaultPointsByChannel();
  const lut = engine.buildLut(points.rgb);
  const packed = engine.buildPackedLut(points);

  assert.equal(lut[0], 0);
  assert.equal(lut[128], 128);
  assert.equal(lut[255], 255);
  assert.equal(packed.length, 1024);
  assert.deepEqual(Array.from(packed.slice(0, 8)), [0, 0, 0, 255, 1, 1, 1, 255]);
  assert.equal(engine.hasMeaningfulCurves(points), false);
});

test("curves engine clamps point motion without crossing neighbors", () => {
  const engine = loadCurvesEngine();
  const added = engine.addPoint(engine.identityPoints(), 128, 64);
  const movedLeft = engine.movePoint(added.points, added.selectedId, -40, 300);
  const selectedLeft = movedLeft.find((point) => point.id === added.selectedId);
  const movedRight = engine.movePoint(movedLeft, added.selectedId, 300, -20);
  const selectedRight = movedRight.find((point) => point.id === added.selectedId);

  assert.deepEqual(JSON.parse(JSON.stringify(movedLeft.map((point) => point.x))), [0, 1, 255]);
  assert.equal(selectedLeft.y, 255);
  assert.deepEqual(JSON.parse(JSON.stringify(movedRight.map((point) => point.x))), [0, 254, 255]);
  assert.equal(selectedRight.y, 0);
});

test("curves engine composes per-channel curves before RGB master", () => {
  const engine = loadCurvesEngine();
  const points = engine.createDefaultPointsByChannel();

  points.r = [
    { id: "black", x: 0, y: 0, endpoint: true },
    { id: "mid", x: 128, y: 64 },
    { id: "white", x: 255, y: 255, endpoint: true },
  ];
  points.rgb = [
    { id: "black", x: 0, y: 0, endpoint: true },
    { id: "mid", x: 64, y: 32 },
    { id: "white", x: 255, y: 255, endpoint: true },
  ];

  const channelLuts = engine.buildChannelLuts(points);
  const finalLuts = engine.buildFinalLuts(points);

  assert.equal(channelLuts.r[128], 64);
  assert.equal(channelLuts.rgb[64], 32);
  assert.equal(finalLuts.r[128], 32);
  assert.equal(finalLuts.g[128], channelLuts.rgb[128]);
});
