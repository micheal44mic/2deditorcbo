const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("temporary pan is captured from the editor stage before tool overlays", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.stage = canvas\.closest\("\.editor-stage"\)/);
  assert.match(source, /navigationTarget\.addEventListener\("pointerdown", this\.handleNavigationPointerDown, true\)/);
  assert.match(source, /handleNavigationPointerDown\(event\)/);
  assert.match(source, /this\.isTemporaryPanTrigger\(event\)/);
  assert.match(source, /this\.beginPan\(event, event\.currentTarget \|\| this\.stage \|\| this\.canvas\)/);
});

test("temporary pan owns the cursor and blocks other tool handlers while active", () => {
  const brushSource = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(repoRoot, "css", "base.css"), "utf8");

  assert.match(brushSource, /event\.__cboNavigationHandled = true/);
  assert.match(brushSource, /event\.stopPropagation\(\)/);
  assert.match(brushSource, /classList\.toggle\("cbo-canvas-pan-active", this\.isPanning\)/);
  assert.match(brushSource, /classList\.toggle\("cbo-canvas-pan-ready", !this\.isPanning && this\.isSpaceHeld\)/);
  assert.match(cssSource, /body\.cbo-canvas-pan-ready[\s\S]*cursor: grab !important/);
  assert.match(cssSource, /body\.cbo-canvas-pan-active[\s\S]*cursor: grabbing !important/);
  assert.match(cssSource, /body,[\s\S]*?\.layer-effects-popover[\s\S]*?user-select: none;/);
  assert.match(cssSource, /input,[\s\S]*?\[contenteditable="true"\] \*[\s\S]*?user-select: text;/);
});

test("preview cache is enabled without waiting for explicit camera navigation", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /this\.userManipulatedCamera = false/);
  assert.match(source, /this\.userManipulatedCamera = true;\s*this\.requestDraw\(\);/);
  assert.doesNotMatch(source, /const allowPreviewCache = this\.userManipulatedCamera && !namespace\.smudgeEngine\?\.isDragging/);
  assert.match(source, /const allowPreviewCache = !namespace\.smudgeEngine\?\.isDragging/);
  assert.match(source, /this\.documentRenderer\.shouldUsePreviewCacheForCamera\(this\.camera\)/);
  assert.match(source, /allowPreviewCache,/);
});

test("spacebar navigation cancels native browser button and toolbar behavior", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "brush-engine.js"), "utf8");

  assert.match(source, /window\.addEventListener\("keydown", this\.handleKeyDown, true\)/);
  assert.match(source, /window\.addEventListener\("keyup", this\.handleKeyUp, true\)/);
  assert.match(source, /window\.removeEventListener\("keydown", this\.handleKeyDown, true\)/);
  assert.match(source, /window\.removeEventListener\("keyup", this\.handleKeyUp, true\)/);
  assert.match(source, /markSpacebarEvent\(event\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /if \(event\.code !== "Space" \|\| this\.isInputFocused\(\)\)/);
  assert.match(source, /if \(event\.code !== "Space" \|\| \(!this\.isSpaceHeld && this\.isInputFocused\(\)\)\)/);
});
