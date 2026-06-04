const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("liquify push engine is initialized as the only canvas distortion tool", () => {
  const indexSource = readRepoFile("index.html");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");

  assert.ok(indexSource.indexOf("./js/liquify-engine.js") < indexSource.indexOf("./js/editor-canvas.js"));
  assert.match(editorCanvasSource, /if \(!window\.CBO\.LiquifyEngine\) \{/);
  assert.match(editorCanvasSource, /window\.CBO\.liquifyEngine\?\.dispose\?\.\(\)/);
  assert.match(editorCanvasSource, /liquifyEngine = new window\.CBO\.LiquifyEngine\(canvas, \{/);
  assert.match(editorCanvasSource, /window\.CBO\.liquifyEngine = liquifyEngine/);
  assert.doesNotMatch(editorCanvasSource, /new window\.CBO\.SmudgeEngine\(canvas/);
  assert.doesNotMatch(editorCanvasSource, /window\.CBO\.smudgeEngine =/);
  assert.doesNotMatch(editorCanvasSource, /window\.CBO\.smudgeEngine\?\.dispose/);
});

test("liquify push remaps pixels in the pointer direction instead of painting color", () => {
  const source = readRepoFile("js", "liquify-engine.js");

  assert.match(source, /class LiquifyEngine extends namespace\.SmudgeEngine/);
  assert.match(source, /const LIQUIFY_PUSH_FRAGMENT_SHADER_SOURCE = `#version 300 es/);
  assert.match(source, /float displacement = u_dragOffset \* strength \* mask/);
  assert.match(source, /vec2 sourcePos = v_docPosition - u_direction \* displacement/);
  assert.match(source, /outColor = sampleLayer\(sourcePos\)/);
  assert.match(source, /getDrag\(\) \{\s*return 1;\s*\}/);
  assert.match(source, /tool !== "liquify"/);
  assert.match(source, /label === "LIQUIFY" \|\| toolMode === "liquify"/);
  assert.match(source, /mode: "push"/);
  assert.match(source, /strength: 0\.72/);
});

test("area selection overlay pauses while liquify is dragging", () => {
  const source = readRepoFile("js", "area-selection-tool.js");

  assert.match(source, /const liquifyEngine = namespace\.liquifyEngine \|\| null/);
  assert.match(source, /liquifyEngine\?\.isDragging === true/);
});
