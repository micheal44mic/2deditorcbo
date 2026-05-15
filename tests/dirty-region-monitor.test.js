const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("dirty region monitor stays available but is not loaded by default", () => {
  const source = readRepoFile("js", "debug", "dirty-region-monitor.js");
  const indexSource = readRepoFile("index.html");

  assert.doesNotMatch(indexSource, /<script src="\.\/js\/debug\/dirty-region-monitor\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(source, /const EVENT_NAME = "cbo:preview-dirty-region-debug"/);
  assert.match(source, /const OVERLAY_ID = "cbo-dirty-region-overlay"/);
  assert.match(source, /const MONITOR_ENABLED_STORAGE_KEY = "cbo:dirty-region-monitor-enabled"/);
  assert.match(source, /function readStoredMonitorEnabled\(defaultValue = false\)/);
  assert.match(source, /textContent = "Dirty"/);
  assert.match(source, /CBO DIRTY REGIONS/);
  assert.match(source, /collectDirtyRegionTelemetry/);
  assert.match(source, /getPendingDirtyTelemetry/);
  assert.match(source, /renderer\?\.previewCacheDirty/);
  assert.match(source, /renderer\.previewDirtyRects/);
  assert.match(source, /debug: \{/);
  assert.match(source, /previewLastDirtyMode/);
  assert.match(source, /getPreviewDirtyStats/);
  assert.match(source, /Cache \$\{telemetry\.last\.pending \? "pending" : "last"\}:/);
  assert.match(source, /Cache event:/);
  assert.match(source, /pending: true/);
  assert.match(source, /pending: false/);
  assert.match(source, /Live stroke:/);
  assert.match(source, /Bake stroke:/);
  assert.match(source, /hasRects/);
  assert.match(source, /no rects/);
  assert.match(source, /forcedFullCause/);
  assert.match(source, /incomingDirtyRectsLength/);
  assert.match(source, /Bake incoming:/);
  assert.match(source, /Bake cache est: \$\{bake\?\.hasRects \? formatPercent\(bake\.cacheCoverage\) : "no rects"\}/);
  assert.match(source, /Dirty rects:/);
  assert.match(source, /Cache redraw:/);
  assert.match(source, /Total saved:/);
  assert.match(source, /handleDirtyDebugEvent\(event\)/);
  assert.match(source, /window\.addEventListener\(EVENT_NAME, handleDirtyDebugEvent\)/);
  assert.match(source, /window\.removeEventListener\(EVENT_NAME, handleDirtyDebugEvent\)/);
  assert.match(source, /setDirtyRegionMonitorEnabled/);
  assert.match(source, /toggleDirtyRegionMonitor/);
  assert.match(source, /namespace\.DebugMonitors = \{/);
  assert.match(source, /const fallbackDirtyRegionOverlay = Object\.freeze\(\{/);
  assert.match(source, /loadDirtyRegionOverlayScript\(fallbackDirtyRegionOverlay\)/);
  assert.match(source, /namespace\.dirtyRegionOverlay = fallbackDirtyRegionOverlay/);
  assert.match(source, /namespace\.dirtyRegionsOverlay = fallbackDirtyRegionOverlay/);
  assert.match(source, /namespace\.DirtyRegions = \{/);
  assert.match(source, /startDirtyRegionMonitor\(\{\s*visible: true/);
  assert.match(source, /if \(readStoredMonitorEnabled\(false\)\)/);
});

test("dirty region overlay stays available but is not loaded by default", () => {
  const source = readRepoFile("js", "debug", "dirty-region-overlay.js");
  const rendererSource = readRepoFile("js", "document", "document-renderer.js");
  const indexSource = readRepoFile("index.html");

  assert.doesNotMatch(indexSource, /<script src="\.\/js\/debug\/dirty-region-overlay\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(source, /const EVENT_NAME = "cbo:preview-dirty-region-debug"/);
  assert.match(source, /const OVERLAY_CLASS = "cbo-dirty-region-tile-overlay"/);
  assert.match(source, /namespace\.debugPreviewDirtyRegions = true/);
  assert.match(source, /namespace\.debugPreviewDirtyRegions = false/);
  assert.match(source, /namespace\.dirtyRegionOverlay = api/);
  assert.match(source, /namespace\.dirtyRegionsOverlay = api/);
  assert.match(source, /detail\.live === true \|\| \(detail\.mode !== "partial-live" && rects\.length > 0\)/);
  assert.match(source, /item\.live !== true/);
  assert.match(source, /start,/);
  assert.match(source, /stop,/);
  assert.match(source, /toggle,/);
  assert.match(source, /getItems,/);
  assert.match(source, /window\.addEventListener\(EVENT_NAME, handleDirtyRegionDebug\)/);
  assert.match(source, /toViewportRect\(rect, camera = getCamera\(\)\)/);
  assert.match(rendererSource, /const PREVIEW_DIRTY_DEBUG_EVENT = "cbo:preview-dirty-region-debug"/);
  assert.match(rendererSource, /emitPreviewDirtyRegionDebug\(detail = \{\}\)/);
  assert.match(rendererSource, /namespace\.debugPreviewDirtyRegions !== true/);
  assert.match(rendererSource, /mode: "partial"/);
});
