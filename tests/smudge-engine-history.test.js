const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("smudge stroke history captures redo snapshots lazily on undo", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "smudge-engine.js"), "utf8");

  assert.match(source, /this\.activeHistoryBeforeSnapshot = this\.createHistorySnapshot\(target, bounds, "smudge prima"\)/);
  assert.match(source, /let after = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /after = this\.createHistorySnapshot\(redoTarget, before\.rect, "smudge dopo"\)/);
  assert.match(source, /entry\.after = after/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.match(source, /historyBytes: this\.activeHistoryBeforeSnapshot\s*\?\s*this\.getSnapshotBytes\(this\.activeHistoryBeforeSnapshot\)/);
  assert.doesNotMatch(source, /const after = this\.createHistorySnapshot\(target, before\.rect, "smudge dopo"\)/);
});
