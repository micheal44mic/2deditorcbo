const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("essential brush pack includes the Soft brush preset", () => {
  const source = fs.readFileSync(path.join(repoRoot, "data", "brush-library.js"), "utf8");

  assert.match(source, /function createSoftCircleAlphaSrc\(\)/);
  assert.match(source, /const size = 512;/);
  assert.match(source, /const hardness = 3;/);
  assert.match(source, /Math\.pow\(Math\.max\(0, 1 - r \* r\), hardness\)/);
  assert.match(source, /const softCircleAlphaName = "SOFT";/);
  assert.match(source, /flow: 0\.1/);
  assert.match(source, /spacing: 0\.04/);
  assert.match(source, /name: "SOFT"/);
  assert.match(source, /brushIds: \["hard-blend", "soft"\]/);
  assert.match(source, /softSettings: cloneSettings\(softSettings\)/);
});
