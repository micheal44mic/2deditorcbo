const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("brush engine keeps shape textures alpha-only without mipmaps", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const uploadShapeBody = source.match(/uploadShapeTexture\(image\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(source, /float coreShape = texture\(u_shapeTexture, v_uv\)\.a;/);
  assert.match(source, /float rightShape = texture\(u_shapeTexture, v_uv \+ vec2\(offset, 0\.0\)\)\.a;/);
  assert.match(uploadShapeBody, /gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MIN_FILTER, gl\.LINEAR\);/);
  assert.match(uploadShapeBody, /mipLevels: 1/);
  assert.doesNotMatch(source, /u_shapeTextureUsesLuminance/);
  assert.doesNotMatch(source, /sampleShapeCoverage/);
  assert.doesNotMatch(uploadShapeBody, /generateMipmap/);
});
