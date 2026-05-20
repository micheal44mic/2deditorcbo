const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("floating tooltips stay on a single line", () => {
  const source = fs.readFileSync(path.join(repoRoot, "css", "tooltips.css"), "utf8");

  assert.match(source, /\.floating-tooltip/);
  assert.match(source, /white-space: nowrap/);
  assert.match(source, /max-width: calc\(100vw - 24px\)/);
  assert.match(source, /text-overflow: ellipsis/);
});

test("touch tooltips require hold and hide after release", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "tooltips.js"), "utf8");

  assert.match(source, /const touchHoldDelay = 520/);
  assert.match(source, /const touchReleaseHideDelay = 1000/);
  assert.match(source, /button\.addEventListener\("pointerdown"/);
  assert.match(source, /button\.addEventListener\("pointerup"/);
  assert.match(source, /releaseTouchTooltip\(button\)/);
});

test("mobile toolbar touch does not arm tooltips", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "tooltips.js"), "utf8");

  assert.match(source, /function isMobileToolbarTooltipDisabled\(button\)/);
  assert.match(source, /\(max-width: 900px\)/);
  assert.match(source, /\.toolbar-dock, \.top-toolbar-dock, \.right-vertical-toolbar-dock/);
  assert.match(source, /classList\.contains\("open"\) \|\| isMobileToolbarTooltipDisabled\(button\)/);
  assert.match(source, /if \(isMobileToolbarTooltipDisabled\(button\)\) \{/);
});
