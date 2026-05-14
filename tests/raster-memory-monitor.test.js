const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("raster memory recovery uses soft warning trim and hard checkpoint reset", () => {
  const source = readRepoFile("js", "debug", "raster-memory-monitor.js");
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(source, /const LAYER_GPU_WARNING_RATIO = 0\.75/);
  assert.match(source, /layerGpuBytes: criticalBytes \* 0\.65 \* LAYER_GPU_WARNING_RATIO/);
  assert.match(source, /function getRasterLayerCreationBudget\(options = \{\}\)/);
  assert.match(source, /projectedLayerBytes <= limitBytes/);
  assert.match(source, /warnings\.push\("layers over budget"\)/);
  assert.match(source, /const AUTOSAVE_OVERLAY_ID = "cbo-memory-autosave-overlay"/);
  assert.match(source, /const MONITOR_ENABLED_STORAGE_KEY = "cbo:raster-memory-monitor-enabled"/);
  assert.match(source, /function readStoredMonitorEnabled\(defaultValue = false\)/);
  assert.match(source, /Autosaving\.\.\./);
  assert.match(source, /maybeStartAutoMemoryRecovery\(telemetry\)/);
  assert.match(source, /getStatusSeverity\(telemetry\?\.status\)/);
  assert.match(source, /severity < 1/);
  assert.match(source, /severity === 1 \|\| state\.autoRecoveryCheckpointBlocked/);
  assert.match(source, /memory-warning-soft-trim/);
  assert.match(source, /cleanupBeforeWrite: true/);
  assert.match(source, /memoryFallback: true/);
  assert.match(source, /source: "memory-checkpoint"/);
  assert.match(source, /namespace\.documentHistory\?\.clear\?\.\(\)/);
  assert.match(source, /checkpointMode = saveResult === "memory" \? "memory" : "persistent"/);
  assert.match(source, /restoreMemoryCheckpoint\?\.\(restoreOptions\)/);
  assert.match(source, /restoreLatest\?\.\(\{[\s\S]*resetRenderer: true/);
  assert.match(source, /pruneRasterHistoryGpuHotBudget\?\.\(\{[\s\S]*minProtectedEntries: 0/);
  assert.match(source, /targetGpuHotBytes: normalizedLevel === "critical" \? 0 : 64 \* MIB/);
  assert.match(source, /historyGpuBytes: deviceClass === "software" \? 0 : deviceClass === "mobile" \? 64 \* MIB : 256 \* MIB/);
  assert.match(source, /function unpatchBrushDraw\(\)/);
  assert.match(source, /setRasterMemoryMonitorEnabled/);
  assert.match(source, /toggleRasterMemoryMonitor/);
  assert.match(source, /if \(readStoredMonitorEnabled\(false\)\)/);
  assert.match(source, /namespace\.DebugMonitors = \{/);
  assert.match(source, /getHistoryColdRasterTargetBytes/);
  assert.match(source, /layerTargetBytes/);
  assert.match(source, /state\.autoRecoveryCheckpointBlocked = true/);
  assert.match(source, /compactInactivePaintTargets/);
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\("cbo:raster-memory-auto-recovery"/);
  assert.match(cssSource, /body\.cbo-memory-recovery-active \.editor-stage > \.editor-webgl-canvas/);
  assert.match(cssSource, /filter: blur\(7px\) saturate\(0\.82\)/);
  assert.match(cssSource, /\.cbo-memory-autosave-overlay/);
});
