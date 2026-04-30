const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("toolbar derives undo and redo enabled state from document history events", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "toolbar.js"), "utf8");

  assert.match(source, /function updateHistoryButtons\(detail = \{\}\)/);
  assert.match(source, /window\.addEventListener\("cbo:history-change"/);
  assert.match(source, /detail\.canUndo === true/);
  assert.match(source, /detail\.canRedo === true/);
  assert.match(source, /button\.disabled = !isEnabled/);
  assert.match(source, /if \(!button \|\| button\.disabled\)/);
});
