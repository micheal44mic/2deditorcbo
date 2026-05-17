const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

const brushEngineModulePaths = [
  ["js", "brush-engine-shader-grain.js"],
  ["js", "brush-engine-target-gpu.js"],
  ["js", "brush-engine-history.js"],
  ["js", "brush-engine-sampler.js"],
  ["js", "brush-engine-stroke-input.js"],
  ["js", "brush-engine.js"],
];

function readBrushEngineSources() {
  return brushEngineModulePaths
    .map((parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8"))
    .join("\n");
}

test("brush engine keeps shape textures alpha-only without mipmaps", () => {
  const source = readBrushEngineSources();
  const uploadShapeBody = source.match(/uploadShapeTexture\(image\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(source, /float coreShape = texture\(u_shapeTexture, v_uv\)\.a;/);
  assert.match(source, /float rightShape = texture\(u_shapeTexture, v_uv \+ vec2\(offset, 0\.0\)\)\.a;/);
  assert.match(uploadShapeBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MIN_FILTER, gl\.LINEAR\);/);
  assert.match(uploadShapeBody, /mipLevels: 1/);
  assert.doesNotMatch(source, /u_shapeTextureUsesLuminance/);
  assert.doesNotMatch(source, /sampleShapeCoverage/);
  assert.doesNotMatch(uploadShapeBody, /generateMipmap/);
});
