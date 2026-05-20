const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("mobile brush controls expose Procreate-style edge handles for size and opacity", () => {
  const toolbarSource = readRepoFile("js", "top-toolbar.js");
  const toolbarCss = readRepoFile("css", "top-toolbar.css");

  assert.match(toolbarSource, /data-brush-mobile-control="radius"/);
  assert.match(toolbarSource, /data-brush-mobile-control="opacity"/);
  assert.match(toolbarSource, /role="slider"[\s\S]*aria-orientation="vertical"/);
  assert.match(toolbarSource, /function handleMobileBrushControlPointerDown\(event\)/);
  assert.match(toolbarSource, /const deltaY = startY - event\.clientY/);
  assert.match(toolbarSource, /const sideways = Math\.abs\(event\.clientX - startX\)/);
  assert.match(toolbarSource, /const precision = Math\.max\(0\.18, 1 - Math\.min\(sideways, 180\) \/ 220\)/);
  assert.match(toolbarSource, /control\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(toolbarSource, /window\.addEventListener\("pointermove", handleMobileBrushControlPointerMove, \{ passive: false \}\)/);

  assert.match(toolbarCss, /@media \(max-width: 900px\) \{[\s\S]*\.brush-quick-controls:not\(\[hidden\]\) \{[\s\S]*right: calc\(var\(--cbo-safe-right\) - 34px\);/);
  assert.match(toolbarCss, /\.brush-quick-controls:not\(\[hidden\]\) \{[\s\S]*top: 50%;[\s\S]*gap: 44px;[\s\S]*transform: translateY\(-50%\)/);
  assert.match(toolbarCss, /\.brush-quick-controls \.brush-quick-label \{[\s\S]*top: -22px;[\s\S]*background: rgba\(24, 26, 31, 0\.66\)/);
  assert.match(toolbarCss, /\.brush-mobile-control-ring \{[\s\S]*border-radius: 999px/);
  assert.match(toolbarCss, /\.brush-mobile-control-fill \{[\s\S]*background: #ffffff/);
  assert.match(toolbarCss, /transform: scale\(var\(--brush-mobile-control-fill-scale, 0\.3\)\)/);
  assert.match(toolbarCss, /\.brush-mobile-control \{[\s\S]*touch-action: none/);
});
