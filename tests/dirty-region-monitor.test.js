const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("dirty region monitor exposes a separate debug menu and telemetry", () => {
  const source = readRepoFile("js", "debug", "dirty-region-monitor.js");
  const indexSource = readRepoFile("index.html");

  assert.match(indexSource, /<script src="\.\/js\/debug\/dirty-region-monitor\.js"><\/script>/);
  assert.match(source, /const OVERLAY_ID = "cbo-dirty-region-overlay"/);
  assert.match(source, /textContent = "Dirty"/);
  assert.match(source, /CBO DIRTY REGIONS/);
  assert.match(source, /collectDirtyRegionTelemetry/);
  assert.match(source, /previewLastDirtyMode/);
  assert.match(source, /getPreviewDirtyStats/);
  assert.match(source, /Dirty rects:/);
  assert.match(source, /Cache redraw:/);
  assert.match(source, /Total saved:/);
  assert.match(source, /namespace\.DirtyRegions = \{/);
  assert.match(source, /startDirtyRegionMonitor\(\{\s*visible: true/);
});
