const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("saved project restore shows faded artboard placeholders while input is locked", () => {
  const saveSource = readRepoFile("js", "document", "document-save-system.js");
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(saveSource, /data-document-restore-artboards/);
  assert.match(saveSource, /const RESTORE_MIN_VISIBLE_MS = 2600/);
  assert.match(saveSource, /const RESTORE_FADE_OUT_MS = 700/);
  assert.match(saveSource, /const RESTORE_VISUAL_READY_MIN_MS = 2600/);
  assert.match(saveSource, /const RESTORE_VISUAL_READY_TIMEOUT_MS = 12000/);
  assert.match(saveSource, /const RESTORE_VISUAL_READY_STABLE_FRAMES = 6/);
  assert.match(saveSource, /function getRestoreGhostStackSize\(width, height\)/);
  assert.match(saveSource, /function getRestoreVisibleArtboardGhostRects\(artboards = \[\]\)/);
  assert.match(saveSource, /function renderDocumentRestoreArtboardGhosts\(session\)/);
  assert.match(saveSource, /function updateDocumentRestoreUi\(options = \{\}\)/);
  assert.match(saveSource, /function completeDocumentRestoreUiHide\(overlay = document\.getElementById\(RESTORE_OVERLAY_ID\)\)/);
  assert.match(saveSource, /function finishDocumentRestoreUi\(\)/);
  assert.match(saveSource, /getRestoreGhostArtboards\(session\)\.slice\(0, 16\)/);
  assert.match(saveSource, /stack\.dataset\.documentRestoreArtboardStack = usesVisibleArtboardRects \? "viewport" : "session"/);
  assert.match(saveSource, /stack\.style\.position = "absolute"/);
  assert.match(saveSource, /stack\.style\.width = `\$\{stackSize\.width\}px`/);
  assert.match(saveSource, /stack\.style\.height = `\$\{stackSize\.height\}px`/);
  assert.match(saveSource, /ghost\.dataset\.documentRestoreGhost = "true"/);
  assert.match(saveSource, /overlay\.classList\.add\("is-finishing"\)/);
  assert.match(saveSource, /completeDocumentRestoreUiHide\(overlay\);[\s\S]*}, RESTORE_FADE_OUT_MS\)/);
  assert.match(saveSource, /restoreUiHideTimer = window\.setTimeout\(finishDocumentRestoreUi, remainingMs\)/);
  assert.match(saveSource, /renderDocumentRestoreArtboardGhosts\(session\);[\s\S]*const tileRecords = await getTilesForSession\(session\.id\)/);
  assert.match(saveSource, /function getRestoreVisualPendingSummary\(session\)/);
  assert.match(saveSource, /function collectPendingRestoreDomMedia\(\)/);
  assert.match(saveSource, /function waitForDocumentRestoreDrawFrame\(\)/);
  assert.match(saveSource, /function collectPendingRestoreAiMedia\(session\)/);
  assert.match(saveSource, /function waitForDocumentRestoreVisualContent\(session, options = \{\}\)/);
  assert.match(saveSource, /await waitForDocumentRestoreVisualContent\(session\);[\s\S]*new CustomEvent\("cbo:document-save-restored"/);
  assert.match(saveSource, /fitRestoreViewToArtboards\(session\);[\s\S]*await waitForDocumentRestoreFrame\(\);[\s\S]*renderDocumentRestoreArtboardGhosts\(session\);[\s\S]*await restoreRasterLayers\(session, tileRecords\)/);
  assert.match(saveSource, /RESTORE_BLOCKED_EVENTS = \[/);
  assert.match(saveSource, /document\.addEventListener\(eventName, blockDocumentRestoreInteraction, RESTORE_BLOCKED_EVENT_OPTIONS\)/);
  assert.match(layoutSource, /body\.cbo-document-restore-active \.editor-page \{[\s\S]*pointer-events: none;[\s\S]*user-select: none;/);
  assert.match(layoutSource, /body\.cbo-document-restore-active \.editor-stage > \.editor-webgl-canvas,[\s\S]*filter: blur\(12px\) saturate\(0\.74\);/);
  assert.match(layoutSource, /\.cbo-document-restore-overlay \{[\s\S]*backdrop-filter: blur\(10px\) saturate\(0\.84\);[\s\S]*opacity 700ms ease,/);
  assert.match(layoutSource, /\.cbo-document-restore-artboards \{[\s\S]*position: absolute;[\s\S]*pointer-events: none;/);
  assert.match(layoutSource, /\.cbo-document-restore-artboard-stack \{[\s\S]*filter: blur\(1\.2px\) saturate\(0\.72\);/);
  assert.match(layoutSource, /\.cbo-document-restore-artboard-ghost \{[\s\S]*animation: cbo-document-restore-artboard-pulse 1280ms ease-in-out infinite alternate;/);
  assert.match(layoutSource, /\.cbo-document-restore-overlay\.is-finishing \{[\s\S]*opacity: 0;/);
  assert.match(layoutSource, /@keyframes cbo-document-restore-artboard-pulse/);
});
