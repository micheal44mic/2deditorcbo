const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("brush stroke history captures redo snapshots lazily on undo", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.createHistorySnapshot\(target, strokeRect, "before-stroke"\)/);
  assert.match(source, /let afterSnapshot = null/);
  assert.match(source, /let entry = null/);
  assert.match(source, /const captureRedoSnapshot = \(\) => \{/);
  assert.match(source, /afterSnapshot = this\.createHistorySnapshot\(redoTarget, beforeSnapshot\.rect, "after-stroke"\)/);
  assert.match(source, /entry\.after = afterSnapshot/);
  assert.match(source, /if \(!captureRedoSnapshot\(\)\) \{/);
  assert.doesNotMatch(source, /const afterSnapshot = this\.createHistorySnapshot\(target, beforeSnapshot\.rect, "after-stroke"\)/);
});
