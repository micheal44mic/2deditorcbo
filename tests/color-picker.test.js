const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("color picker popover raises the top toolbar while it is open", () => {
  const colorPickerSource = readRepoFile("js", "color-picker.js");
  const colorDropSource = readRepoFile("js", "color-drop.js");
  const topToolbarCss = readRepoFile("css", "top-toolbar.css");
  const colorPickerCss = readRepoFile("css", "color-picker.css");

  assert.match(colorPickerSource, /dock\.classList\.toggle\("color-picker-open", isOpen\)/);
  assert.match(colorDropSource, /classList\.remove\("color-picker-open"\)/);
  assert.match(topToolbarCss, /\.top-toolbar-dock\.color-picker-open \{\s*z-index: 10020;\s*\}/);
  assert.match(colorPickerCss, /\.color-picker-popover \{[\s\S]*z-index: 10021;/);
});
