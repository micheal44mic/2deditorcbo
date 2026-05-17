const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

const documentRendererModulePaths = [
  ["js", "document", "document-renderer-shaders.js"],
  ["js", "document", "document-renderer-raster-targets.js"],
  ["js", "document", "document-renderer-history-snapshots.js"],
  ["js", "document", "document-renderer-webgl-programs.js"],
  ["js", "document", "document-renderer-viewport-culling.js"],
  ["js", "document", "document-renderer-layer-effects.js"],
  ["js", "document", "document-renderer-compositing.js"],
  ["js", "document", "document-renderer.js"],
];

function readDocumentRendererSources() {
  return documentRendererModulePaths.map((parts) => readRepoFile(...parts)).join("\n");
}

test("performance trace stays available but is not loaded by default", () => {
  const source = readRepoFile("js", "debug", "performance-trace.js");
  const governorSource = readRepoFile("js", "debug", "engine-governor.js");
  const indexSource = readRepoFile("index.html");

  assert.doesNotMatch(indexSource, /<script src="\.\/js\/debug\/performance-trace\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.doesNotMatch(indexSource, /<script src="\.\/js\/debug\/engine-governor\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(source, /const OVERLAY_ID = "cbo-performance-trace-overlay"/);
  assert.match(source, /textContent = "Trace"/);
  assert.match(source, /CBO PERF TRACE/);
  assert.match(source, /beginTrace\(name, detail = \{\}\)/);
  assert.match(source, /measureTrace\(name, callback, detail = \{\}\)/);
  assert.match(source, /markTrace\(name, detail = \{\}\)/);
  assert.match(source, /performance\.mark/);
  assert.match(source, /performance\.measure/);
  assert.match(source, /performance\.clearMeasures/);
  assert.match(source, /window\.requestAnimationFrame \|\|/);
  assert.match(source, /window\.dispatchEvent\?\.\(new CustomEvent\("cbo:performance-trace"/);
  assert.match(source, /namespace\.PerfTrace = api/);
  assert.match(source, /get enabled\(\) \{/);
  assert.match(source, /namespace\.collectPerformanceTrace = collectTraceTelemetry/);
  assert.match(source, /start: startTrace/);
  assert.match(source, /stop: stopTrace/);
  assert.match(source, /reset: resetTrace/);
  assert.match(governorSource, /const OVERLAY_ID = "cbo-engine-governor-overlay"/);
  assert.match(governorSource, /MODE_INTERACTIVE = "interactive"/);
  assert.match(governorSource, /beginFrame\(detail = \{\}\)/);
  assert.match(governorSource, /beginRenderSubmit\(detail = \{\}\)/);
  assert.match(governorSource, /instrumentWebGlContext\(gl\)/);
  assert.match(governorSource, /recordTextureUpload/);
  assert.match(governorSource, /recordBufferUpload/);
  assert.match(governorSource, /wrapContextMethod\(gl, "bufferSubData"/);
  assert.match(governorSource, /queueUpload\(callback, options = \{\}\)/);
  assert.match(governorSource, /scheduleUploadPump\(delayMs = 0\)/);
  assert.match(governorSource, /namespace\.EngineGovernor = api/);
  assert.match(governorSource, /namespace\.toggleEngineGovernor = toggle/);
});

test("performance trace marks the expensive editor paths", () => {
  const rendererSource = readDocumentRendererSources();
  const brushSource = readRepoFile("js", "brush-engine.js");
  const historySource = readRepoFile("js", "document", "document-history.js");
  const textSource = readRepoFile("js", "text", "vector-text-renderer.js");

  assert.match(rendererSource, /namespace\.PerfTrace\?\.enabled/);
  assert.match(rendererSource, /namespace\.EngineGovernor\?\.instrumentWebGlContext\?\.\(gl\)/);
  assert.match(rendererSource, /namespace\.PerfTrace\.mark\("dirty\.commit"/);
  assert.match(rendererSource, /namespace\.PerfTrace\.mark\("preview\.invalidate"/);
  assert.match(rendererSource, /namespace\.PerfTrace\.begin\("preview-cache\.update"/);
  assert.match(rendererSource, /namespace\.PerfTrace\.begin\("canvas\.draw"/);
  assert.match(rendererSource, /namespace\.PerfTrace\.begin\("effects\.rasterize"/);
  assert.match(rendererSource, /namespace\.PerfTrace\.begin\("transform\.commit"/);
  assert.match(brushSource, /namespace\.PerfTrace\?\.enabled/);
  assert.match(brushSource, /namespace\.EngineGovernor\?\.markActivity\?\.\(\{ source: "brush-pointermove" \}\)/);
  assert.match(brushSource, /namespace\.EngineGovernor/);
  assert.match(brushSource, /beginFrame\?\.\(\{/);
  assert.match(brushSource, /beginRenderSubmit\?\.\(\{/);
  assert.match(brushSource, /runOrQueueTextureUpload\("brush-shape-upload"/);
  assert.match(brushSource, /runOrQueueTextureUpload\("brush-grain-upload"/);
  assert.match(brushSource, /namespace\.PerfTrace\.begin\("brush\.process-stamps"/);
  assert.match(brushSource, /namespace\.PerfTrace\.begin\("brush\.flush-stamps"/);
  assert.match(brushSource, /brush\.flush-stamps\.\$\{name\}/);
  assert.match(brushSource, /namespace\.PerfTrace\.begin\("brush\.stroke-target\.replace"/);
  assert.match(brushSource, /namespace\.PerfTrace\.begin\("brush\.targets\.prewarm"/);
  assert.match(brushSource, /namespace\.PerfTrace\.begin\("brush\.bake"/);
  assert.match(brushSource, /brush\.bake\.\$\{name\}/);
  assert.match(brushSource, /beginBakeTrace\("targets"/);
  assert.match(brushSource, /beginBakeTrace\("draw-targets"/);
  assert.match(brushSource, /beginBakeTrace\("history-commit"/);
  assert.match(historySource, /namespace\.PerfTrace\.begin\("history\.push"/);
  assert.match(historySource, /namespace\.PerfTrace\.begin\("history\.undo"/);
  assert.match(historySource, /namespace\.PerfTrace\.begin\("history\.redo"/);
  assert.match(historySource, /beginTrace\("history\.normalize"/);
  assert.match(historySource, /beginTrace\("history\.prune-budget"/);
  assert.match(historySource, /beginTrace\("history\.prune-gpu-hot"/);
  assert.match(historySource, /beginTrace\("history\.prune-gpu-hot\.async"/);
  assert.match(historySource, /beginTrace\("history\.emit\.detail"/);
  assert.match(historySource, /beginTrace\("history\.destroy-entry"/);
  assert.match(textSource, /namespace\.PerfTrace\.begin\("text\.raster-cache"/);
});
