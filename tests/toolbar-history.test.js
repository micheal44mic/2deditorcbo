const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("toolbar derives undo and redo enabled state from document history events", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "toolbar.js"), "utf8");

  assert.match(source, /function updateHistoryButtons\(detail = \{\}\)/);
  assert.match(source, /function isDocumentHistoryDisabled\(\)/);
  assert.match(source, /function syncHistoryControlsDisabled\(\)/);
  assert.match(source, /window\.addEventListener\("cbo:history-change"/);
  assert.match(source, /window\.addEventListener\("cbo:history-disabled"/);
  assert.match(source, /detail\.canUndo === true/);
  assert.match(source, /detail\.canRedo === true/);
  assert.match(source, /button\.disabled = !isEnabled/);
  assert.match(source, /button\.hidden = historyDisabled/);
  assert.match(source, /new CustomEvent\("cbo:before-history-action"/);
  assert.match(source, /if \(isDocumentHistoryDisabled\(\)\) \{/);
  assert.match(source, /if \(!button \|\| button\.disabled\)/);
  assert.match(source, /function ensureHistoryBusyOverlay\(\)/);
  assert.match(source, /function clearHistoryBusy\(action\)/);
  assert.match(source, /const busyOverlaySources = new Map\(\)/);
  assert.match(source, /window\.addEventListener\("cbo:artboard-residency-busy"/);
  assert.match(source, /setBusyOverlaySource\(\s*"artboard-residency"/);
  assert.match(source, /cbo-history-busy-overlay/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /beforeDispatched: true/);
  assert.match(source, /setHistoryBusy\(normalizedAction, true\)/);
  assert.match(source, /if \(!syncHistoryControlsDisabled\(\)\) \{\s*updateHistoryButtons\(\{/);

  const triggerStart = source.indexOf("function triggerHistoryAction(action)");
  const triggerEnd = source.indexOf("function setHistoryButtonState", triggerStart);
  const triggerSource = source.slice(triggerStart, triggerEnd);

  assert.ok(triggerSource.indexOf('new CustomEvent("cbo:before-history-action"') < triggerSource.indexOf("if (!button || button.disabled)"));
  assert.ok(triggerSource.indexOf("if (!button || button.disabled)") < triggerSource.indexOf("flashHistoryButton(button)"));
  assert.ok(triggerSource.indexOf("if (!button || button.disabled)") < triggerSource.indexOf("setHistoryBusy(normalizedAction, true)"));
  assert.match(triggerSource, /clearHistoryBusy\(normalizedAction\)/);
});

test("toolbar menu arrows open popovers without activating their paired tool", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "toolbar.js"), "utf8");
  const toolbarBindingStart = source.indexOf("toolsetOptions.forEach");
  const menuStart = source.indexOf("menuButtons.forEach", toolbarBindingStart);
  const menuEnd = source.indexOf('document.addEventListener("click"', menuStart);
  const menuHandlerSource = source.slice(menuStart, menuEnd);

  assert.notEqual(toolbarBindingStart, -1);
  assert.notEqual(menuStart, -1);
  assert.notEqual(menuEnd, -1);
  assert.match(menuHandlerSource, /closeMenus\(button\)/);
  assert.match(menuHandlerSource, /classList\.toggle\("open"\)/);
  assert.doesNotMatch(menuHandlerSource, /activateTool\(/);
});

test("history busy overlay styles blur the stage while undo or redo restores", () => {
  const source = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");
  const toolbarSource = fs.readFileSync(path.join(repoRoot, "css", "toolbar.css"), "utf8");

  assert.match(source, /body\.cbo-history-busy-active \.editor-stage > \.editor-webgl-canvas/);
  assert.match(source, /\.cbo-history-busy-overlay/);
  assert.match(source, /\.cbo-history-busy-spinner/);
  assert.match(source, /@keyframes cbo-history-busy-spin/);
  assert.match(toolbarSource, /\.tool-button:disabled/);
  assert.match(toolbarSource, /\.tool-button\.disabled/);
  assert.match(toolbarSource, /background: transparent/);
});
