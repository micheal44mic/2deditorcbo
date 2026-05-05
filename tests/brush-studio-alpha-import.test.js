const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("shape alpha import preserves low-alpha tails for transparent PNG brushes", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-studio.js"), "utf8");

  assert.match(source, /function srgbCoverageToLinearByte\(value\)/);
  assert.match(source, /Math\.pow\(coverage, 2\.2\) \* 255/);
  assert.match(source, /const hasSourceAlpha = maxAlpha - minAlpha > 8 && minAlpha < 247;/);
  assert.match(source, /const invert = !hasSourceAlpha && borderCount > 0/);
  assert.match(source, /const snapAlphaThreshold = hasSourceAlpha \? 1 : 9;/);
  assert.match(source, /const sourceX = 0;/);
  assert.match(source, /const sourceWidth = naturalWidth;/);
  assert.match(source, /const coverage = hasSourceAlpha \? imageData\.data\[index \+ 3\] : mask;/);
  assert.match(source, /output\.data\[index \+ 3\] = coverage < snapAlphaThreshold \? 0 : coverage;/);
  assert.doesNotMatch(source, /cropThreshold/);
});
