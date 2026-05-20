const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("mobile brush debug console is copy-only in the UI", () => {
  const indexSource = readRepoFile("index.html");
  const debugSource = readRepoFile("js", "debug", "mobile-brush-debug-console.js");
  const previewSource = readRepoFile("js", "brush-preview.js");
  const panelSource = readRepoFile("js", "brushes-panel.js");
  const panelCss = readRepoFile("css", "brushes-panel.css");

  assert.match(indexSource, /js\/debug\/mobile-brush-debug-console\.js\?v=mobile-brush-debug-copy-v1/);
  assert.match(indexSource, /js\/brush-preview\.js\?v=mobile-brush-debug-copy-v1/);
  assert.match(debugSource, /function installConsoleCapture\(\)/);
  assert.match(debugSource, /CONSOLE_METHODS = \["log", "info", "warn", "error", "debug"\]/);
  assert.match(debugSource, /PerformanceObserver/);
  assert.match(debugSource, /navigator\.clipboard\?\.writeText/);
  assert.match(debugSource, /document\.execCommand\("copy"\)/);
  assert.match(debugSource, /namespace\.MobileBrushDebug = api/);
  assert.match(debugSource, /copyToClipboard/);
  assert.doesNotMatch(debugSource, /appendChild\(.*pre/);
  assert.match(previewSource, /brush-preview\.queued-render/);
  assert.match(previewSource, /brush-preview\.cache-draw/);

  assert.match(panelSource, /data-mobile-brush-debug-copy>Copy<\/button>/);
  assert.match(panelSource, /getMobileBrushDebug\(\)\?\.copyToClipboard\?\.\(mobileBrushDebugCopyButton\)/);
  assert.match(panelCss, /\.mobile-brush-debug-copy \{[\s\S]*display: none/);
  assert.match(panelCss, /@media \(max-width: 900px\) \{[\s\S]*\.mobile-brush-debug-copy \{[\s\S]*position: fixed/);
});

test("mobile brush library open path records timing checkpoints", () => {
  const toolbarSource = readRepoFile("js", "toolbar.js");
  const panelSource = readRepoFile("js", "brushes-panel.js");

  assert.match(toolbarSource, /toolbar\.brush-click/);
  assert.match(toolbarSource, /toolbar\.brush-reactivate-check/);
  assert.match(toolbarSource, /startCapture\?\.\("mobile-brush-library-open"/);
  assert.match(toolbarSource, /begin\?\.\("toolbar\.dispatch-brush-reactivate"/);

  assert.match(panelSource, /beginMobileBrushDebug\("mobile-brush\.open-library"/);
  assert.match(panelSource, /beginMobileBrushDebug\("mobile-brush\.render-packages"/);
  assert.match(panelSource, /beginMobileBrushDebug\("mobile-brush\.render-brushes"/);
  assert.match(panelSource, /beginMobileBrushDebug\("mobile-brush\.preview-render"/);
  assert.match(panelSource, /mobile-brush\.preview-lazy-queue/);
  assert.match(panelSource, /mobile-brush\.preview-lazy-pump/);
  assert.match(panelSource, /requestIdleCallback/);
  assert.match(panelSource, /mobile-brush\.open-library\.after-second-raf/);
  assert.match(panelSource, /window\.addEventListener\("cbo:brush-tool-reactivate", \(event\) =>/);
});
