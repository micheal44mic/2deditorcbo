const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("top toolbar exposes liquify as a second smudge tool option", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const smudgeGroupStart = source.indexOf('aria-label="Smudge tools"');
  const smudgeGroupEnd = source.indexOf('aria-label="ERASER"', smudgeGroupStart);
  const smudgeGroupSource = source.slice(smudgeGroupStart, smudgeGroupEnd);

  assert.notEqual(smudgeGroupStart, -1);
  assert.notEqual(smudgeGroupEnd, -1);
  assert.match(smudgeGroupSource, /data-toolset-primary="top-smudge"/);
  assert.match(smudgeGroupSource, /data-toolset-option="top-smudge"[\s\S]*data-tool-mode="smudge"[\s\S]*data-label="SMUDGE"/);
  assert.match(smudgeGroupSource, /data-toolset-option="top-smudge"[\s\S]*data-tool-mode="liquify"[\s\S]*data-label="LIQUIFY"/);
  assert.match(smudgeGroupSource, /lucide-droplet/);
  assert.match(smudgeGroupSource, /M12 22a7 7 0 0 0 7-7/);
});
