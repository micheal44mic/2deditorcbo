const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("right sidebar exposes push controls for the liquify tool", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");

  assert.match(source, /data-liquify-sidebar/);
  assert.match(source, /LIQUIFY PUSH/);
  assert.match(source, /data-liquify-controls/);
  assert.match(source, /data-liquify-pressure/);
  assert.match(source, /const fallbackLiquifySettings = \{[\s\S]*mode: "push"[\s\S]*radius: 48[\s\S]*strength: 0\.72/);
  assert.match(source, /const liquifyControlDefs = \[[\s\S]*key: "radius"[\s\S]*label: "SIZE"[\s\S]*key: "strength"[\s\S]*label: "STRENGTH"/);
  assert.match(source, /new CustomEvent\("cbo:paint-settings-change", \{[\s\S]*tool: "liquify"/);
  assert.match(source, /showLiquifySettings\(activeTool === "liquify"\)/);
  assert.match(source, /if \(normalized === "liquify"\) \{[\s\S]*return "liquify"/);
  assert.match(source, /liquifyControls\?\.append\(createLiquifyControl\(definition\)\)/);
  assert.doesNotMatch(source, /data-smudge-sidebar/);
  assert.doesNotMatch(source, /data-smudge-controls/);
  assert.doesNotMatch(source, /data-smudge-pressure/);
  assert.doesNotMatch(source, /tool: "smudge"/);
  assert.doesNotMatch(source, /showSmudgeSettings/);
  assert.doesNotMatch(source, /dispatchSmudgeSettings/);
});
