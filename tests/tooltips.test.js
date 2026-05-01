const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("floating tooltips stay on a single line", () => {
  const source = fs.readFileSync(path.join(repoRoot, "css", "tooltips.css"), "utf8");

  assert.match(source, /\.floating-tooltip/);
  assert.match(source, /white-space: nowrap/);
  assert.match(source, /max-width: calc\(100vw - 24px\)/);
  assert.match(source, /text-overflow: ellipsis/);
});
