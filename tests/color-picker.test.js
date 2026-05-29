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

test("color picker eyedropper applies native or canvas sampled colors", () => {
  const colorPickerSource = readRepoFile("js", "color-picker.js");
  const colorPickerCss = readRepoFile("css", "color-picker.css");

  assert.match(colorPickerSource, /data-color-eyedropper/);
  assert.match(colorPickerSource, /const eyedropperButton = popover\.querySelector\("\[data-color-eyedropper\]"\)/);
  assert.match(colorPickerSource, /new window\.EyeDropper\(\)\.open\(\)/);
  assert.match(colorPickerSource, /function sampleCanvasColor\(clientX, clientY\)/);
  assert.match(colorPickerSource, /window\.CBO\.brushEngine\?\.draw\?\.\(\)/);
  assert.match(colorPickerSource, /gl\.readPixels\(pixelX, webglY, 1, 1, gl\.RGBA, gl\.UNSIGNED_BYTE, pixel\)/);
  assert.match(colorPickerSource, /applyEyedropperColor\(sampledColor, "canvas-eyedropper"\)/);
  assert.match(colorPickerSource, /applyEyedropperColor\(result\?\.sRGBHex, "native-eyedropper"\)/);
  assert.match(colorPickerSource, /cbo:color-picker-eyedropper-color/);
  assert.match(colorPickerSource, /document\.addEventListener\("pointerdown", handleCanvasEyedropperPointerDown, true\)/);
  assert.match(colorPickerSource, /document\.removeEventListener\("pointerdown", handleCanvasEyedropperPointerDown, true\)/);
  assert.match(colorPickerCss, /body\.color-eyedropper-active,\s*body\.color-eyedropper-active \.editor-webgl-canvas \{/);
});
