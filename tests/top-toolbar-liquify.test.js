const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("top toolbar exposes liquify as a standalone tool in the former smudge slot", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const liquifyGroupStart = source.indexOf('aria-label="Liquify tools"');
  const liquifyGroupEnd = source.indexOf('aria-label="ERASER"', liquifyGroupStart);
  const liquifyGroupSource = source.slice(liquifyGroupStart, liquifyGroupEnd);

  assert.notEqual(liquifyGroupStart, -1);
  assert.notEqual(liquifyGroupEnd, -1);
  assert.match(liquifyGroupSource, /aria-label="LIQUIFY"/);
  assert.match(liquifyGroupSource, /data-tooltip="LIQUIFY"/);
  assert.match(liquifyGroupSource, /data-tool-mode="liquify"/);
  assert.match(liquifyGroupSource, /lucide-droplet/);
  assert.match(liquifyGroupSource, /M12 22a7 7 0 0 0 7-7/);
  assert.doesNotMatch(liquifyGroupSource, /data-tool-mode="smudge"/);
  assert.doesNotMatch(liquifyGroupSource, /data-toolset-primary="top-smudge"/);
  assert.doesNotMatch(liquifyGroupSource, /data-toolset-option="top-smudge"/);
  assert.doesNotMatch(source, /aria-label="Smudge tools"/);
  assert.doesNotMatch(source, /data-tooltip="SMUDGE"/);
});
