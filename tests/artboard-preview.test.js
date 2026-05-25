const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

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

const artboardConnectionModulePaths = [
  ["js", "artboard-connections", "core.js"],
  ["js", "artboard-connections", "core-helpers.js"],
  ["js", "artboard-connections", "ai-board-runtime-preview.js"],
  ["js", "artboard-connections", "layers-and-grid.js"],
  ["js", "artboard-connections", "ai-board-toolbar.js"],
  ["js", "artboard-connections", "ai-board-edit-preview.js"],
  ["js", "artboard-connections", "ai-board-enlarge-viewer.js"],
  ["js", "artboard-connections", "ai-board-dom.js"],
  ["js", "artboard-connections", "connection-dom.js"],
  ["js", "artboard-connections", "state-history.js"],
  ["js", "artboard-connections", "ai-board-generation.js"],
  ["js", "artboard-connections", "ai-board-media.js"],
  ["js", "artboard-connections", "ai-board-text.js"],
  ["js", "artboard-connections", "space-board-text.js"],
  ["js", "artboard-connections", "placement.js"],
  ["js", "artboard-connections", "connection-render.js"],
  ["js", "artboard-connections", "space-board-render.js"],
  ["js", "artboard-connections", "connection-actions.js"],
  ["js", "artboard-connections.js"],
];

function readArtboardConnectionSources() {
  return artboardConnectionModulePaths.map((parts) => readRepoFile(...parts)).join("\n");
}

function loadDocumentArtboardNamespace() {
  const source = readRepoFile("js", "document", "document-artboard-model.js");
  const window = {
    CBO: {},
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Event,
    EventTarget,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO;
}

function loadDocumentArtboardHistoryNamespace() {
  const eventTarget = new EventTarget();
  const window = {
    CBO: {},
    addEventListener: (...args) => eventTarget.addEventListener(...args),
    dispatchEvent: (event) => eventTarget.dispatchEvent(event),
    removeEventListener: (...args) => eventTarget.removeEventListener(...args),
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    },
    Date,
    Event,
    EventTarget,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    Uint8Array,
    WeakMap,
    console,
    queueMicrotask,
    window,
  });

  vm.runInContext(readRepoFile("js", "blend-modes.js"), context);
  vm.runInContext(readRepoFile("js", "curves-engine.js"), context);
  vm.runInContext(readRepoFile("js", "document", "document-history.js"), context);
  vm.runInContext(readRepoFile("js", "document", "document-artboard-model.js"), context);
  vm.runInContext(readRepoFile("js", "document", "document-layer-model.js"), context);

  const namespace = context.window.CBO;
  const history = new namespace.DocumentHistory({ maxEntries: 20 });
  const layerModel = new namespace.DocumentLayerModel();

  namespace.documentHistory = history;
  namespace.documentLayerModel = layerModel;

  return {
    history,
    layerModel,
    namespace,
  };
}

test("left rail exposes a visual artboard tool below layers", () => {
  const indexSource = readRepoFile("index.html");
  const layerButtonIndex = indexSource.indexOf('data-drawer-panel="layers"');
  const artboardButtonIndex = indexSource.indexOf("data-artboard-create");

  assert.notEqual(layerButtonIndex, -1);
  assert.notEqual(artboardButtonIndex, -1);
  assert.ok(artboardButtonIndex > layerButtonIndex);
  assert.match(indexSource, /data-tooltip="ARTBOARD"/);
  assert.match(indexSource, /class="[^"]*\brail-artboard-button\b[^"]*"/);
  assert.match(indexSource, /<link rel="stylesheet" href="\.\/css\/layout\.css(?:\?v=[^"]+)?" \/>/);
  assert.match(indexSource, /<script src="\.\/js\/document\/document-artboard-model\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.doesNotMatch(indexSource, /ai-board-visibility-debug-console/);
  assert.match(indexSource, /<script src="\.\/js\/artboard-connections\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(indexSource, /<script src="\.\/js\/artboard-preview\.js(?:\?v=[^"]+)?"><\/script>/);
});

test("artboard preview creates non-editable 1048 x 2048 stage frames", () => {
  const source = readRepoFile("js", "artboard-preview.js");
  const cssSource = readRepoFile("css", "layout.css");
  const appSource = readRepoFile("js", "app.js");

  assert.match(source, /const PREVIEW_ARTBOARD_WIDTH = 1048/);
  assert.match(source, /const PREVIEW_ARTBOARD_HEIGHT = 2048/);
  assert.match(source, /const DEFAULT_PREVIEW_ARTBOARD_COUNT = 0/);
  assert.match(source, /const ARTBOARD_SIZE_PRESETS = \[/);
  assert.match(source, /data-artboard-create-popover/);
  assert.match(source, /data-artboard-width-input/);
  assert.match(source, /function positionArtboardCreatePopover\(\)/);
  assert.match(source, /const toolbarRect = document\.querySelector\("\.toolbar-dock"\)\?\.getBoundingClientRect\?\.\(\)/);
  assert.match(source, /const bottomLimit = Math\.min\(window\.innerHeight - 12, toolbarTop - gap\)/);
  assert.match(source, /namespace\.getDocumentArtboards\?\.\(\)/);
  assert.match(source, /namespace\.createDocumentArtboard\?\.\(/);
  assert.match(source, /namespace\.initArtboardPreview = function initArtboardPreview\(\)/);
  assert.match(source, /button\.addEventListener\("click", handleCreateButtonClick\)/);
  assert.match(source, /openArtboardCreatePopover\(artboardCreateButton\)/);
  assert.doesNotMatch(source, /ensureDefaultPreviewArtboards\(\);\s*createPreviewArtboard\(\);/);
  assert.match(source, /layer\.replaceChildren/);
  assert.match(source, /function isArtboardBackgroundVisible\(artboardId\)/);
  assert.match(source, /paper\.classList\.toggle\("is-transparent", !isArtboardBackgroundVisible\(artboard\.id\)\)/);
  assert.match(source, /window\.addEventListener\("cbo:document-layers-change"/);
  assert.match(source, /event\.detail\?\.source === "autosave-restore"[\s\S]*fitAllPreviewArtboards\(\)/);
  assert.match(appSource, /\.artboard-create-popover/);
  assert.match(cssSource, /\.editor-artboard-preview-layer[\s\S]*pointer-events: none/);
  assert.match(cssSource, /\.editor-artboard-frame/);
  assert.match(cssSource, /\.artboard-create-popover/);
  assert.match(cssSource, /\.artboard-create-popover \{[\s\S]*z-index: 20050;/);
  assert.match(cssSource, /\.artboard-create-preset\.active/);
  assert.match(cssSource, /\.editor-artboard-paper[\s\S]*background: #f7f7f2/);
  assert.match(cssSource, /\.editor-artboard-paper\.is-transparent[\s\S]*background: transparent/);
  assert.match(cssSource, /\.editor-artboard-frame[\s\S]*background: transparent/);
  assert.match(appSource, /window\.CBO\.initArtboardPreview\?\.\(\);/);
});

test("artboard connections live in their own module", () => {
  const previewSource = readRepoFile("js", "artboard-preview.js");
  const connectionsSource = readArtboardConnectionSources();
  const cssSource = readRepoFile("css", "layout.css");
  const indexSource = readRepoFile("index.html");

  assert.match(previewSource, /namespace\.renderArtboardConnectionOverlay\?\.\(\{/);
  assert.doesNotMatch(previewSource, /function ensureArtboardConnectionLayer/);
  assert.match(connectionsSource, /function ensureConnectionLayer\(\)/);
  assert.match(connectionsSource, /function ensureSpaceBoardPane\(\)/);
  assert.match(connectionsSource, /CANVAS_DOT_GRID_BASE_WORLD_PX = 20/);
  assert.match(connectionsSource, /CANVAS_DOT_GRID_STEPS_PER_OCTAVE = 5/);
  assert.match(connectionsSource, /function ensureInfiniteCanvasDotGridOverlay\(\)/);
  assert.match(connectionsSource, /function computeInfiniteCanvasDotGrid\(scale\)/);
  assert.match(connectionsSource, /function updateInfiniteCanvasDotGrid\(viewState = (?:this\.)?getCameraState\(\)\)/);
  assert.match(connectionsSource, /patternUnits: "userSpaceOnUse"/);
  assert.match(connectionsSource, /"shape-rendering": "crispEdges"/);
  assert.match(connectionsSource, /Math\.pow\(2, step \/ CANVAS_DOT_GRID_STEPS_PER_OCTAVE\)/);
  assert.match(connectionsSource, /updateInfiniteCanvasDotGrid\(viewState\)/);
  assert.match(connectionsSource, /function renderSpaceBoardPaneTransform\(\)/);
  assert.match(connectionsSource, /`matrix\(\$\{scale\}, 0, 0, \$\{scale\}, \$\{tx\}, \$\{ty\}\)`/);
  assert.match(connectionsSource, /const desiredParent = plainArtboardMode \? stage : pane/);
  assert.match(connectionsSource, /stage\.insertBefore\(svg, paperLayer \|\| null\)/);
  assert.match(connectionsSource, /function isSpaceBoardNearViewport\(board, marginDocPx = (?:this\.)?getSpaceBoardLazyMarginDocPx\(\)\)/);
  assert.match(connectionsSource, /function shouldMountAiImageBoardHeavyContent\(board, element\)/);
  assert.match(connectionsSource, /function getConnectionGeometryKey\(\)/);
  assert.match(connectionsSource, /svg\.dataset\.connectionGeometryKey === geometryKey/);
  assert.match(connectionsSource, /namespace\.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay/);
  assert.match(connectionsSource, /CONNECTION_CLICK_DISTANCE_CSS_PX = 220/);
  assert.match(connectionsSource, /CONNECTION_DROP_TARGET_TOUCH_RADIUS_CSS_PX = 104/);
  assert.match(connectionsSource, /data-artboard-connection-dismiss/);
  assert.doesNotMatch(connectionsSource, /addEventListener\("pointerdown", handleMenuDocumentPointerDown/);
  assert.match(connectionsSource, /addEventListener\("click", handleMenuDocumentClick, true\)/);
  assert.match(connectionsSource, /ignoreNextMenuDocumentClick = true/);
  assert.match(connectionsSource, /ACTION_BUBBLE_SIZE_DOC_PX = 120/);
  assert.match(connectionsSource, /ACTION_BUBBLE_GAP_DOC_PX = 24/);
  assert.match(connectionsSource, /ACTION_BUBBLE_ICON_DOC_PX = 76/);
  assert.match(connectionsSource, /ACTION_BUBBLE_BORDER_DOC_PX = 3/);
  assert.match(connectionsSource, /namespace\.setArtboardVerticalSymmetryEnabled = function setArtboardVerticalSymmetryEnabled/);
  assert.match(connectionsSource, /namespace\.getActiveVerticalSymmetryConfig = function getActiveVerticalSymmetryConfig/);
  assert.doesNotMatch(connectionsSource, /window\.matchMedia\?\.\("\(max-width: 900px\)"\)\?\.matches/);
  assert.match(connectionsSource, /axisX: \(Number\(rect\.x\) \|\| 0\) \+ Math\.max\(1, Number\(rect\.width\) \|\| 1\) \* 0\.5/);
  assert.match(connectionsSource, /window\.dispatchEvent\(new CustomEvent\("cbo:artboard-symmetry-change"/);
  assert.match(connectionsSource, /function ensureSymmetryLine\(artboardId\)/);
  assert.match(connectionsSource, /data-artboard-symmetry-line/);
  assert.match(connectionsSource, /function ensureSymmetryButton\(artboardId\)/);
  assert.match(connectionsSource, /data-artboard-symmetry-button/);
  assert.match(connectionsSource, /lucide-git-commit-vertical/);
  assert.match(connectionsSource, /setArtboardVerticalSymmetryEnabled\?\.\(button\.dataset\.artboardId \|\| "", isActive/);
  assert.match(connectionsSource, /button\.classList\.toggle\("is-active", namespace\.isArtboardVerticalSymmetryEnabled\?\.\(button\.dataset\.artboardId \|\| ""\) === true\)/);
  assert.match(connectionsSource, /button\.setAttribute\("aria-pressed", button\.classList\.contains\("is-active"\) \? "true" : "false"\)/);
  assert.match(connectionsSource, /const symmetryLeft = view\.left - gap - size/);
  assert.match(connectionsSource, /symmetryLine\.style\.left = `\$\{view\.left \+ view\.width \* 0\.5 - symmetryLineWidth \* 0\.5\}px`/);
  assert.match(connectionsSource, /symmetryLine\.classList\.toggle\("is-visible", isSymmetryActive\)/);
  assert.match(connectionsSource, /window\.addEventListener\("cbo:artboard-symmetry-change", \(\) => \{[\s\S]*renderActions\(\)/);
  assert.match(cssSource, /\.editor-artboard-symmetry-button \{[\s\S]*border-radius: 8px/);
  assert.match(cssSource, /\.editor-artboard-symmetry-line \{[\s\S]*background: #f05023;[\s\S]*pointer-events: none/);
  assert.match(cssSource, /\.editor-artboard-symmetry-line\.is-visible \{[\s\S]*opacity: 0\.78/);
  assert.match(cssSource, /\.editor-artboard-symmetry-button\.is-visible\.is-active \{[\s\S]*border-color: #ffffff;[\s\S]*background: #f05023;[\s\S]*color: #ffffff;[\s\S]*transform: scale\(1\.08\)/);
  assert.doesNotMatch(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.editor-artboard-symmetry-line,[\s\S]*\.editor-artboard-symmetry-button \{[\s\S]*display: none/);
  assert.match(previewSource, /\[data-artboard-symmetry-button\]/);
  assert.match(connectionsSource, /AI_IMAGE_BOARD_SIZE_DOC_PX = 1024/);
  assert.match(connectionsSource, /SPACE_BOARD_DRAG_GAP_DOC_PX = 24/);
  assert.match(connectionsSource, /function getAllowedSpaceBoardMove\(startFootprint, dx, dy, blockers = \[\]\)/);
  assert.match(connectionsSource, /function getBoardLabelReferenceSideDoc\(width, height/);
  assert.match(connectionsSource, /return Math\.max\(1, Math\.max\(resolvedWidth, resolvedHeight\)\)/);
  assert.match(connectionsSource, /function getActionBubbleMetrics\([\s\S]*scale = (?:this\.)?getViewScale\(\),[\s\S]*width = (?:this\.)?AI_IMAGE_BOARD_SIZE_DOC_PX/);
  assert.match(connectionsSource, /const sizeDoc = ACTION_BUBBLE_SIZE_DOC_PX/);
  assert.match(connectionsSource, /const gapDoc = ACTION_BUBBLE_GAP_DOC_PX/);
  assert.match(connectionsSource, /const borderWidthDoc = ACTION_BUBBLE_BORDER_DOC_PX/);
  assert.match(connectionsSource, /const outsideOffsetDoc = gapDoc \+ sizeDoc \* 0\.5/);
  assert.doesNotMatch(connectionsSource, /clampNumber/);
  assert.match(connectionsSource, /SPACE_BOARD_GAP_DOC_PX = 220/);
  assert.match(connectionsSource, /function getAiImageBoardFootprintRect\(rect\)/);
  assert.match(connectionsSource, /function resolveFreeSpaceBoardPlacement\(preferredRect, options = \{\}\)/);
  assert.match(connectionsSource, /function getAiImageBoardInputAnchor\(board\)/);
  assert.match(connectionsSource, /x: \(Number\(board\.x\) \|\| 0\) -[\s\S]*metrics\.outsideOffsetDoc/);
  assert.match(connectionsSource, /boardHeight -[\s\S]*metrics\.outsideOffsetDoc/);
  assert.match(connectionsSource, /function getTextPromptBoardOutputAnchor\(board\)/);
  assert.match(connectionsSource, /boardWidth \+[\s\S]*metrics\.outsideOffsetDoc/);
  assert.match(connectionsSource, /function getConnectionStartPoint\(connection\)/);
  assert.match(connectionsSource, /sourceBoardId/);
  assert.match(connectionsSource, /sourceBoardType: "text-prompt"/);
  assert.match(connectionsSource, /editor-text-prompt-connection-arrow/);
  assert.match(connectionsSource, /is-text-prompt-source/);
  assert.match(connectionsSource, /anchor\.x \+ handleMetrics\.outsideOffsetDoc/);
  assert.match(connectionsSource, /anchor\.y - AI_IMAGE_BOARD_SIZE_DOC_PX \+ handleMetrics\.outsideOffsetDoc/);
  assert.match(connectionsSource, /function getSpaceBoardAtDocumentPoint\(point, options = \{\}\)/);
  assert.match(connectionsSource, /\[\.\.\.spaceBoards\]\.reverse\(\)\.find/);
  assert.match(connectionsSource, /function connectToExistingAiImageBoard\(connection, board\)/);
  assert.match(connectionsSource, /function isConnectionTargetBoardOccupied\(board, options = \{\}\)/);
  assert.match(connectionsSource, /sourceIsTextPrompt = isTextPromptConnection\(options\.sourceConnection\)/);
  assert.match(connectionsSource, /\(!sourceIsTextPrompt \|\| isTextPromptConnection\(connection\)\)/);
  assert.match(connectionsSource, /function setConnectionDropTargetBoard\(boardId = "", options = \{\}\)/);
  assert.match(connectionsSource, /function getConnectionDropTargetAtDocumentPoint\(point, options = \{\}\)/);
  assert.match(connectionsSource, /function getConnectionDropTargetMagnetRadius\(board, options = \{\}\)/);
  assert.match(connectionsSource, /screenRadiusCss \/ viewScale/);
  assert.match(connectionsSource, /String\(board\?\.id \|\| board \|\| ""\)\.trim\(\)/);
  assert.match(connectionsSource, /connectionDropTargetBoardId = ""/);
  assert.match(connectionsSource, /connectionBlockedTargetBoardId = ""/);
  assert.match(connectionsSource, /is-connection-drop-target/);
  assert.match(connectionsSource, /is-connection-drop-blocked/);
  assert.match(connectionsSource, /const includeOccupied = options\.includeOccupied === true/);
  assert.match(connectionsSource, /getConnectionDropTargetAtDocumentPoint\(point, \{[\s\S]*includeOccupied: true,[\s\S]*pointerType: event\.pointerType \|\| ""/);
  assert.match(connectionsSource, /sourceConnection: connectionDrag/);
  assert.match(connectionsSource, /connectionDrag\.blockedTargetBoardId = blockedBoard\?\.id \|\| ""/);
  assert.match(connectionsSource, /connectionDrag\.targetBoardId = targetBoard\?\.id \|\| ""/);
  assert.match(connectionsSource, /connectionDrag\.targetHandle = targetBoard \? "image-input" : ""/);
  assert.match(connectionsSource, /if \(connection\.blockedTargetBoardId\) \{/);
  assert.match(connectionsSource, /getSpaceBoardAtDocumentPoint\(point, \{ type: "ai-image" \}\)/);
  assert.match(connectionsSource, /space-board-connect-existing-ai-image/);
  assert.match(connectionsSource, /function startTextPromptConnectionDrag\(event\)/);
  assert.match(connectionsSource, /classList\.add\("connection-dragging"\)/);
  assert.match(connectionsSource, /classList\.remove\("connection-dragging"(?:, "text-connection-dragging")?\)/);
  assert.match(connectionsSource, /classList\.add\("connection-dragging", "text-connection-dragging"\)/);
  assert.match(connectionsSource, /classList\.remove\("connection-dragging", "text-connection-dragging"\)/);
  assert.match(connectionsSource, /getAllArtboards\(\)\.map\(getDocumentArtboardRect\)/);
  assert.match(connectionsSource, /spaceBoards[\s\S]*\.filter\(\(board\)[\s\S]*\.map\(getSpaceBoardRect\)/);
  assert.match(connectionsSource, /function materializeAiImageBoardFromMenu\(\)/);
  assert.match(connectionsSource, /connection\.targetHandle = "image-input"/);
  assert.match(connectionsSource, /data-ai-image-board-drag-handle/);
  assert.match(connectionsSource, /data-ai-image-board-footer/);
  assert.match(connectionsSource, /data-ai-image-board-prompt-input/);
  assert.match(connectionsSource, /data-ai-image-board-generate/);
  assert.match(connectionsSource, /aria-label="Generate image"/);
  assert.match(connectionsSource, /What image do you want to generate\?/);
  assert.match(connectionsSource, /AI_IMAGE_PROMPT_PLACEHOLDER = "Neon product shot"/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_PLACEHOLDER = "Write the image you want to generate"/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_INSET_DOC_PX = 32/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FONT_DOC_PX = 56/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_LINE_HEIGHT_DOC_PX = 66/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_MIN_HEIGHT_DOC_PX = 74/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_PREVIEW_LINES = 2/);
  assert.match(connectionsSource, /AI_IMAGE_BOARD_OUTLINE_DOC_PX = 5/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_PADDING_X_DOC_PX = 6/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_PADDING_Y_DOC_PX = 4/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_EDITOR_RADIUS_DOC_PX = 6/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FOCUS_RING_DOC_PX = 1/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_SHADOW_Y_DOC_PX = 1/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_SHADOW_BLUR_DOC_PX = 2/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FOCUS_TOP_GAP_CSS_PX = 16/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FOCUS_BOTTOM_GAP_CSS_PX = 18/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FOCUS_VERTICAL_RATIO = 0\.56/);
  assert.match(connectionsSource, /function getAiImagePlainControlMetrics\(scale = 1, width = (?:this\.)?AI_IMAGE_BOARD_SIZE_DOC_PX/);
  assert.match(connectionsSource, /AI_IMAGE_PROMPT_INPUT_MIN_HEIGHT_CSS_PX = 84/);
  assert.match(connectionsSource, /AI_IMAGE_BOARD_FOOTER_MIN_HEIGHT_CSS_PX = 210/);
  assert.match(connectionsSource, /AI_IMAGE_PROMPT_FOCUS_TOP_CSS_PX = 96/);
  assert.match(connectionsSource, /AI_IMAGE_PROMPT_FOCUS_BOTTOM_GAP_CSS_PX = 24/);
  assert.match(connectionsSource, /AI_IMAGE_GENERATION_PREVIEW_MIN_MS = 3000/);
  assert.match(connectionsSource, /AI_IMAGE_GENERATION_PREVIEW_MAX_MS = 5000/);
  assert.match(connectionsSource, /placeholder="\$\{AI_IMAGE_PROMPT_PLACEHOLDER\}"/);
  assert.match(connectionsSource, /input\.placeholder = ""/);
  assert.match(connectionsSource, /input\.placeholder = AI_IMAGE_PROMPT_PLACEHOLDER/);
  assert.match(connectionsSource, /function resizeAiImagePromptInput\(input\)/);
  assert.match(connectionsSource, /input\.style\.height = "auto"/);
  assert.match(connectionsSource, /footer\.scrollHeight/);
  assert.match(connectionsSource, /--ai-image-board-footer-height/);
  assert.match(connectionsSource, /function scheduleAiImagePromptFocusViewport\(boardId, options = \{\}\)/);
  assert.match(connectionsSource, /function focusAiImagePromptBoard\(boardId, options = \{\}\)/);
  assert.match(connectionsSource, /function getAiImageMobileFocusBand\(stage, stageRect, isCaptionTarget = false\)/);
  assert.match(connectionsSource, /function getAiImageMobileTargetTopCss\(targetScreenHeight, focusBand, isCaptionTarget = false\)/);
  assert.match(connectionsSource, /\(window\.innerWidth \|\| 0\) <= 900/);
  assert.match(connectionsSource, /const isCaptionTarget = options\.target === "caption"/);
  assert.match(connectionsSource, /const targetTopY = isCaptionTarget/);
  assert.match(connectionsSource, /\.top-toolbar-dock/);
  assert.match(connectionsSource, /\.toolbar-dock/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_FOCUS_VERTICAL_RATIO/);
  assert.match(connectionsSource, /brushEngine\.camera\.x = nextCameraX/);
  assert.match(connectionsSource, /brushEngine\.camera\.y = nextCameraY/);
  assert.match(connectionsSource, /brushEngine\.requestDraw\?\.\(\)/);
  assert.match(connectionsSource, /board\.addEventListener\("wheel", handleSpaceBoardWheel, \{ passive: false \}\)/);
  assert.match(connectionsSource, /function handleSpaceBoardWheel\(event\)/);
  assert.match(connectionsSource, /brushEngine\.handleWheel\.call\(brushEngine, event\)/);
  assert.match(connectionsSource, /CONNECTION_PLAIN_STROKE_CSS_PX = 1\.5/);
  assert.match(connectionsSource, /CONNECTION_PLAIN_GEOMETRY_SCALE = 0\.5/);
  assert.match(connectionsSource, /function getPlainConnectionStrokeWidth\(\)/);
  assert.match(connectionsSource, /plainArtboardMode \? getPlainConnectionStrokeWidth\(\) : getConnectionStrokeWidth\(1\)/);
  assert.match(connectionsSource, /function handleAiImageGenerateClick\(event\)/);
  assert.match(connectionsSource, /function createEmptyAiBoardMetrics\(overrides = \{\}\)/);
  assert.match(connectionsSource, /function setAiImageGenerationStatus\(boardId, status, detail = \{\}\)/);
  assert.match(connectionsSource, /function publishAiBoardMetrics\(metrics\)/);
  assert.match(connectionsSource, /namespace\.getAiBoardMetrics = function getAiBoardMetrics\(\)/);
  assert.match(connectionsSource, /function getAiImageGenerationPreviewDelayMs\(\)/);
  assert.match(connectionsSource, /function startAiImageGenerationPreview\(boardId\)/);
  assert.match(connectionsSource, /function clearAiImageGenerationPreview\(boardId = ""\)/);
  assert.match(connectionsSource, /AI_IMAGE_GENERATE_DUPLICATE_GUARD_MS = 650/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_VARIANT_SIZES = \[128, 256, 512, 1024\]/);
  assert.match(connectionsSource, /AI_IMAGE_MOBILE_CANVAS_PREVIEW_LOD = 256/);
  assert.match(connectionsSource, /AI_IMAGE_MOBILE_RUNTIME_PREVIEW_QUALITY = 0\.58/);
  assert.match(connectionsSource, /AI_IMAGE_UNSTABLE_RUNTIME_LODS = new Set\(\[512\]\)/);
  assert.match(connectionsSource, /AI_VIDEO_CANVAS_PREVIEW_LOD = 360/);
  assert.match(connectionsSource, /AI_VIDEO_PREVIEW_VARIANT_SIZES = \[240, 360, 480, 720, 1080\]/);
  assert.match(connectionsSource, /AI_VIDEO_DECODED_FRAME_BUDGET = 3/);
  assert.match(connectionsSource, /AI_BOARD_PREVIEW_DEBUG_EVENT_LIMIT = 180/);
  assert.match(connectionsSource, /AI_IMAGE_RUNTIME_PREVIEW_CACHE_MAX_ENTRIES = 80/);
  assert.match(connectionsSource, /AI_IMAGE_SAMPLE_ASSETS = \[/);
  assert.doesNotMatch(connectionsSource, /variants: createAiImageSampleVariants/);
  assert.match(connectionsSource, /assets\/ai-board-samples\/sample-01-badge\.png/);
  assert.match(connectionsSource, /assets\/ai-board-samples\/sample-08-video-2026-05-07-1\.mp4/);
  [
    "assets/ai-board-samples/sample-01-badge.png",
    "assets/ai-board-samples/sample-02-balenciaga.png",
    "assets/ai-board-samples/sample-03-hats.jpg",
    "assets/ai-board-samples/sample-04-dragon.png",
    "assets/ai-board-samples/sample-05-green-screens.jpeg",
    "assets/ai-board-samples/sample-06-video-2026-05-18-2.mp4",
    "assets/ai-board-samples/sample-07-video-2026-05-18-1.mp4",
    "assets/ai-board-samples/sample-08-video-2026-05-07-1.mp4",
  ].forEach((samplePath) => {
    assert.ok(fs.existsSync(path.join(repoRoot, samplePath)), `${samplePath} should exist`);
  });
  assert.match(connectionsSource, /function loadAiImageSampleMetadata\(sample\)/);
  assert.match(connectionsSource, /function getAiImageSampleCandidates\(currentSrc = "", preferredKind = "image"\)/);
  assert.match(connectionsSource, /function getAiImageBoardGenerationKind\(board\)/);
  assert.match(connectionsSource, /if \(board\?\.generationKind === "video"\)/);
  assert.match(connectionsSource, /if \(board\?\.generationKind === "image"\)/);
  assert.match(connectionsSource, /const generationKind = getAiImageBoardGenerationKind\(board\)/);
  assert.match(connectionsSource, /getAiImageSampleCandidates\(board\?\.generatedMedia\?\.src \|\| "", generationKind\)/);
  assert.match(connectionsSource, /materializeAiImageBoardFromMenu\(\{ generationKind: "video" \}\)/);
  assert.match(connectionsSource, /sampleKind !== boardGenerationKind/);
  assert.match(connectionsSource, /function loadFirstAvailableAiImageSampleMetadata\(samples\)/);
  assert.match(connectionsSource, /Fake AI sample failed, trying next sample/);
  assert.match(connectionsSource, /loadFirstAvailableAiImageSampleMetadata\(samples\)/);
  assert.match(connectionsSource, /video\.preload = "metadata"/);
  assert.match(connectionsSource, /function getAiImageBoardPreviewCssUrl\(src\)/);
  assert.match(connectionsSource, /function recordAiBoardPreviewDebugEvent\(eventName, detail = \{\}\)/);
  assert.doesNotMatch(connectionsSource, /AiBoardMobileDebugConsole/);
  assert.doesNotMatch(connectionsSource, /data-ai-board-debug-copy/);
  assert.match(connectionsSource, /function traceAiBoardPreviewVisibility\(metrics\)/);
  assert.match(connectionsSource, /preview-disappearance-trace/);
  assert.match(connectionsSource, /function getAiBoardPreviewDebugSnapshot\(element, mediaHost\)/);
  assert.match(connectionsSource, /function getAiBoardPreviewDiagnosis\(mediaHost, activeLayer\)/);
  assert.match(connectionsSource, /function resolveAiImageBoardPreview\(media, recommendedLod\)/);
  assert.match(connectionsSource, /function getAiVideoBoardRecommendedLod\(board, screenWidth = 0, screenHeight = 0, dpr = 1\)/);
  assert.match(connectionsSource, /return `video-\$\{AI_VIDEO_CANVAS_PREVIEW_LOD\}`/);
  assert.match(connectionsSource, /function getAiVideoBoardFixedCanvasPreviewSrc\(media\)/);
  assert.match(connectionsSource, /media\?\.previewSrc/);
  assert.match(connectionsSource, /getAiVideoBoardVariantSrc\(media, AI_VIDEO_CANVAS_PREVIEW_LOD\)/);
  assert.match(connectionsSource, /function resolveAiVideoBoardPreview\(media, recommendedLod\)/);
  assert.match(connectionsSource, /previewSource: previewSrc \? "fixed-video-preview" : "original-video-fallback"/);
  assert.match(connectionsSource, /function requestAiVideoRuntimePoster\(src, lod = AI_VIDEO_CANVAS_PREVIEW_LOD\)/);
  assert.match(connectionsSource, /function buildAiVideoRuntimePoster\(src, lod = AI_VIDEO_CANVAS_PREVIEW_LOD\)/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("video-poster-ready"/);
  assert.match(connectionsSource, /posterSource = "runtime-poster"/);
  assert.match(connectionsSource, /function createAiImageBoardVideoPosterElement\(\)/);
  assert.match(connectionsSource, /image\.dataset\.aiImageBoardVideoPoster = ""/);
  assert.match(connectionsSource, /function shouldMountAiImageBoardVideoPreviewElement\(mediaHost, board, preview\)/);
  assert.match(connectionsSource, /previewSource !== "original-video-fallback"/);
  assert.match(connectionsSource, /function getAiImageBoardVideoPreviewRenderMode\(mediaHost, board, preview\)/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaVideoRenderMode = renderMode/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("video-preview-deferred"/);
  assert.match(connectionsSource, /video\.preload = "auto"/);
  assert.match(connectionsSource, /video\.setAttribute\("webkit-playsinline", ""\)/);
  assert.match(connectionsSource, /function ensureAiImageBoardVideoMuteButton\(mediaHost\)/);
  assert.match(connectionsSource, /class="lucide lucide-volume2-icon lucide-volume-2"/);
  assert.match(connectionsSource, /class="lucide lucide-volume-off-icon lucide-volume-off"/);
  assert.match(connectionsSource, /mediaHost\.append\(button\)/);
  assert.match(connectionsSource, /mediaHost\.addEventListener\("pointerenter", handleAiImageBoardVideoPointerEnter\)/);
  assert.match(connectionsSource, /function isAiImageBoardVideoSelected\(mediaHost, board = null\)/);
  assert.match(connectionsSource, /function syncAiImageBoardVideoSelectionPlayback\(mediaHost, board = null\)/);
  assert.match(connectionsSource, /if \(isAiImageBoardVideoSelected\(mediaHost\)\) \{\s*return;/);
  assert.match(connectionsSource, /syncAiImageBoardVideoSelectionPlayback\(mediaHost, board\)/);
  assert.match(connectionsSource, /pauseAiImageBoardVideoPreview\(mediaHost\?\.querySelector\?\.\("\[data-ai-image-board-video\]"\)\)/);
  assert.match(connectionsSource, /function requestAiImageRuntimePreviewVariant\(src, lod\)/);
  assert.match(connectionsSource, /buildAiImageRuntimePreviewVariant\(normalizedSrc, normalizedLod\)/);
  assert.match(connectionsSource, /function evictAiImageRuntimePreviewVariantsForSrc\(src\)/);
  assert.match(connectionsSource, /function collectRetainedAiImageRuntimePreviewSrcs\(aiBoards, visibleViewportRect\)/);
  assert.match(connectionsSource, /function shouldEvictAiImageRuntimePreviewVariantsForSrc\(src, retainedRuntimePreviewSrcs = null\)/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_UP_HYSTERESIS = 1\.15/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_DOWN_HYSTERESIS = 0\.72/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_CROSSFADE_MS = 0/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_PAINT_FRAMES = 2/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES = 2/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS = 240/);
  assert.match(connectionsSource, /function getStableAiBoardRecommendedLod\(board, screenWidth = 0, screenHeight = 0, dpr = 1, mediaHost = null\)/);
  assert.match(connectionsSource, /function isAiImageBoardMobileLowQualityPreview\(\)/);
  assert.match(connectionsSource, /function getAiImageBoardMobilePreviewLod\(\)/);
  assert.match(connectionsSource, /function isAiImageBoardMobilePreviewLodAboveCap\(lod\)/);
  assert.match(connectionsSource, /function preloadAiImageBoardRuntimeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /function shouldHoldAiImageBoardPreviewForPendingLod\(mediaHost, src, kind, preview\)/);
  assert.match(connectionsSource, /function getAiImageBoardActivePreviewLayer\(mediaHost\)/);
  assert.match(connectionsSource, /function hasAiImageBoardPaintedImagePreview\(mediaHost, src = "", kind = "image"\)/);
  assert.match(connectionsSource, /function ensureAiImageBoardImagePreviewLayers\(mediaHost\)/);
  assert.match(connectionsSource, /function decodeAiImageBoardPreviewLayer\(image, src\)/);
  assert.match(connectionsSource, /function waitAiImageBoardPreviewPaintFrames\(frameCount = (?:this\.)?AI_IMAGE_PREVIEW_PAINT_FRAMES\)/);
  assert.match(connectionsSource, /function commitAiImageBoardPreviewLayer\(mediaHost, incomingLayer, media, preview, previewKey, previewSrcForDataset, src, kind\)/);
  assert.match(connectionsSource, /function renderAiImageBoardImagePreview\(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset\)/);
  assert.match(connectionsSource, /function noteAiBoardCameraMotion\(camera, dpr\)/);
  assert.match(connectionsSource, /function getAiBoardHeldLodDuringCameraMotion\(mediaHost, media\)/);
  assert.doesNotMatch(connectionsSource, /function getAiBoardVisibleStickyLod/);
  assert.match(connectionsSource, /function shouldUseDataUrlRuntimePreview\(\)/);
  assert.match(connectionsSource, /function isAiImageBoardIosSafariPreviewDevice\(\)/);
  assert.match(connectionsSource, /function getAiBoardRuntimeSafeLod\(media, lod\)/);
  assert.match(connectionsSource, /function normalizeAiImageBoardMobileCanvasPreviewLod\(media, lod\)/);
  assert.match(connectionsSource, /AI_IMAGE_UNSTABLE_RUNTIME_LODS\.has\(Number\(requestedLod\)\)/);
  assert.doesNotMatch(connectionsSource, /ios-safari-runtime-lod/);
  assert.match(connectionsSource, /return getAiBoardRuntimeSafeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /const safeRecommendedLod = forceLowQualityCanvasPreview\s*\?\s*normalizeAiImageBoardMobileCanvasPreviewLod\(media, recommendedLod\)\s*:\s*getAiBoardRuntimeSafeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /canvas\.toDataURL\("image\/webp", quality\)/);
  assert.match(connectionsSource, /function getAiImageRuntimePreviewQuality\(\)/);
  assert.match(connectionsSource, /function waitAiImageRuntimePreviewFrame\(frameCount = 1\)/);
  assert.match(connectionsSource, /function stageAiImageRuntimePreviewSourceForIos\(image\)/);
  assert.match(connectionsSource, /function drawAiImageRuntimePreviewCanvas\(context, canvas, image, width, height, lod, src\)/);
  assert.match(connectionsSource, /function probeAiImageRuntimePreviewCanvas\(canvas\)/);
  assert.match(connectionsSource, /function probeAiImagePreviewLayer\(image\)/);
  assert.match(connectionsSource, /error\.previewProbe = probe/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\(entry\.probe\?\.blank \? "runtime-preview-blank" : "runtime-preview-error"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-draw-blank-retry"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-draw-retry-success"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-paint-probe"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-layer-blank"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-mobile-placeholder"/);
  assert.match(connectionsSource, /previewSource: "runtime-error-original"/);
  assert.match(connectionsSource, /previewSource: "runtime-error-mobile-placeholder"/);
  assert.match(connectionsSource, /previewSource: "runtime-layer-blank-original"/);
  assert.match(connectionsSource, /sourceType: "data-url"/);
  assert.match(connectionsSource, /entry\.probe = result\.probe \|\| null/);
  assert.match(connectionsSource, /entry\.sourceType = result\.sourceType/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-ready"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-swap-start"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-swap-commit"/);
  assert.match(connectionsSource, /runtime-data-url/);
  assert.match(connectionsSource, /URL\.createObjectURL\(blobOrDataUrl\)/);
  assert.match(connectionsSource, /String\(safeRecommendedLod \|\| ""\)\.startsWith\("loading-"\) \|\| String\(safeRecommendedLod \|\| ""\)\.startsWith\("error-"\)/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("mobile-full-preview-blocked"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("mobile-full-preview-render-blocked"/);
  assert.match(connectionsSource, /preview = resolveAiImageBoardPreview\(media, getAiImageBoardMobilePreviewLod\(\)\)/);
  assert.match(connectionsSource, /if \(isAiImageBoardMobilePreviewLodAboveCap\(mediaHost\?\.dataset\?\.mediaLod \|\| ""\)\) \{\s*return false;\s*\}/);
  assert.match(connectionsSource, /if \(neededPixels < 80\) \{\s*recommendedLod = "128";\s*\}/);
  assert.match(connectionsSource, /previewMode: "placeholder"/);
  assert.match(connectionsSource, /function shouldUnloadAiBoardMedia\(board, visibilityState, element\)/);
  assert.match(connectionsSource, /if \(isAiImageBoardMobileLowQualityPreview\(\) && visibilityState === "near"\) \{/);
  assert.match(connectionsSource, /return visibilityState !== "visible"/);
  assert.match(connectionsSource, /const boardDragActive = Boolean\(spaceBoardDrag\)/);
  assert.match(connectionsSource, /const shouldDeferPreviewWork = boardDragActive\s*\?\s*!isGenerating\s*:\s*cameraMotionActive && !isGenerating && !isFocusedOrSelected/);
  assert.match(connectionsSource, /const previewDebug = boardDragActive \? null : getAiBoardPreviewDebugSnapshot\(element, mediaHost\)/);
  assert.match(connectionsSource, /function scheduleSpaceBoardDragRender\(\)/);
  assert.match(connectionsSource, /window\.requestAnimationFrame\(renderFrame\)/);
  assert.match(connectionsSource, /function renderActiveSpaceBoardDragFrame\(\)/);
  assert.match(connectionsSource, /scheduleSpaceBoardDragRender\(\)/);
  assert.match(connectionsSource, /const retainedRuntimePreviewSrcs = collectRetainedAiImageRuntimePreviewSrcs\(aiBoards, visibleViewportRect\)/);
  assert.match(connectionsSource, /const shouldUpdatePreviewLod = visibilityState === "visible" && !shouldDeferPreviewWork/);
  assert.match(connectionsSource, /const rawRecommendedLod = shouldUnloadMedia\s*\?\s*"unloaded"\s*:\s*shouldUpdatePreviewLod\s*\?\s*getAiBoardRecommendedLod/);
  assert.match(connectionsSource, /if \(shouldUpdatePreviewLod && rawRecommendedLod !== recommendedLod\) \{/);
  assert.match(connectionsSource, /const shouldAllowInitialPreviewPaint = Boolean\(board\.generatedMedia\?\.src\) &&\s*visibilityState === "visible" &&\s*!hasActivePreviewBeforeRender/);
  assert.match(connectionsSource, /!forceLowQualityCanvasPreview &&\s*!hasAiImageBoardPaintedImagePreview\(mediaHost, src, kind\)/);
  assert.match(connectionsSource, /metrics\.deferredPreviewBoards \+= 1/);
  assert.match(connectionsSource, /shouldEvictAiImageRuntimePreviewVariantsForSrc\(board\.generatedMedia\?\.src \|\| "", retainedRuntimePreviewSrcs\)/);
  assert.match(connectionsSource, /evictAiImageRuntimePreviewVariantsForSrc\(board\.generatedMedia\?\.src \|\| ""\)/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-evict-offscreen"/);
  assert.match(connectionsSource, /previewSource: safeRecommendedLod === "unloaded" \? "unloaded" : "none"/);
  assert.match(connectionsSource, /function summarizeAiBoardPreviewSrc\(src\)/);
  assert.match(connectionsSource, /function setAiImageBoardMediaDataset\(mediaHost, media, preview, previewKey, previewSrcForDataset, src, kind\)/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaLod = preview\.lod/);
  assert.match(connectionsSource, /const previewKey = String\(preview\.previewKey \|\| previewSrcForDataset \|\| previewMode\)/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaPreview = preview\.previewMode/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaPreviewKey = previewKey/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaPreviewSource = preview\.previewSource \|\| ""/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaPreviewSrc = previewSrcForDataset/);
  assert.match(connectionsSource, /image\.decode\(\)\.then\(finish\)/);
  assert.match(connectionsSource, /function decodeAiImageBoardPreviewSource\(src\)/);
  assert.match(connectionsSource, /waitAiImageBoardPreviewPaintFrames\(AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES\)/);
  assert.match(connectionsSource, /incomingLayer\.classList\.add\("is-active"\)/);
  assert.doesNotMatch(connectionsSource, /previousLayer\.classList\.remove\("is-active"\);\s*previousLayer\.style\.zIndex = "1";\s*\}\s*incomingLayer\.classList\.add\("is-active"\)/);
  assert.match(connectionsSource, /mediaHost\.dataset\.mediaActiveLayer = incomingLayerName/);
  assert.match(connectionsSource, /renderAiImageBoardImagePreview\(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset\)/);
  assert.match(connectionsSource, /preview\.lod !== "unloaded"/);
  assert.match(connectionsSource, /preview\.previewSource !== "unloaded"/);
  assert.match(connectionsSource, /previewSource: "original-first-paint"/);
  assert.match(connectionsSource, /board\.generatedMedia = \{/);
  assert.match(connectionsSource, /canvasPreviewSrc: sample\.canvasPreviewSrc/);
  assert.match(connectionsSource, /previewSrc: sample\.previewSrc \|\| sample\.preview\?\.src/);
  assert.match(connectionsSource, /previewWidth: Math\.max/);
  assert.match(connectionsSource, /variants: sample\.variants && typeof sample\.variants === "object" \? \{ \.\.\.sample\.variants \} : undefined/);
  assert.match(connectionsSource, /board\.height = board\.generatedMedia\.height/);
  assert.match(connectionsSource, /board\.width = board\.generatedMedia\.width/);
  assert.match(connectionsSource, /startAiImageGenerationPreview\(board\.id\)/);
  assert.match(connectionsSource, /addEventListener\("pointerup", handleAiImageGenerateClick\)/);
  assert.match(connectionsSource, /const isGenerating = aiImageGeneratingBoardIds\.has\(board\.id\)/);
  assert.match(connectionsSource, /element\.classList\.toggle\("is-generating", isGenerating && \(plainArtboardMode \|\| isHeavyMounted\)\)/);
  assert.match(connectionsSource, /generateButton\.setAttribute\("aria-busy", "true"\)/);
  assert.match(connectionsSource, /AI_BOARD_ARTBOARD_PLAIN_MODE = true/);
  assert.match(connectionsSource, /is-plain-artboard editor-artboard-frame/);
  assert.match(connectionsSource, /data-ai-image-board-dimensions/);
  assert.match(connectionsSource, /data-ai-image-board-selection-shadow aria-hidden="true"/);
  assert.match(connectionsSource, /AI_IMAGE_BOARD_SELECTION_SHADOW_RISE_DOC_PX/);
  assert.match(connectionsSource, /const selectionShadowMetrics = getAiImageSelectionShadowMetrics\(plainArtboardMode \? viewScale : 1\)/);
  assert.match(connectionsSource, /--ai-image-board-selection-shadow-rise", `\$\{selectionShadowMetrics\.rise\}px`/);
  assert.match(connectionsSource, /const dimensionsText = `\$\{Math\.round\(docWidth\)\} \\u00d7 \$\{Math\.round\(docHeight\)\}`/);
  assert.match(connectionsSource, /dimensions\.textContent = dimensionsText/);
  assert.match(connectionsSource, /<div class="editor-ai-image-board-media" data-ai-image-board-media><\/div>/);
  assert.match(connectionsSource, /documentPointToStagePoint\(\{ x: board\.x, y: board\.y \}, viewState\)/);
  assert.match(connectionsSource, /setStylePropertyIfChanged\(element, "transform", boardTransform\)/);
  assert.match(connectionsSource, /const boardRadius = AI_IMAGE_BOARD_RADIUS_DOC_PX \* \(plainArtboardMode \? viewScale : 1\)/);
  assert.match(connectionsSource, /const boardOutlineWidth = AI_IMAGE_BOARD_OUTLINE_DOC_PX \* \(plainArtboardMode \? viewScale : 1\)/);
  assert.match(connectionsSource, /setCssVarIfChanged\(element, "--ai-image-board-radius", `\$\{boardRadius\}px`\)/);
  assert.match(connectionsSource, /setCssVarIfChanged\(element, "--ai-image-board-outline-width", `\$\{boardOutlineWidth\}px`\)/);
  assert.match(connectionsSource, /--ai-caption-padding-x", `\$\{captionPaddingX\}px`/);
  assert.match(connectionsSource, /--ai-caption-focus-ring-width", `\$\{captionFocusRingWidth\}px`/);
  assert.match(connectionsSource, /--ai-image-input-handle-top", `\$\{docHeight - handleMetrics\.gapDoc - handleMetrics\.sizeDoc\}px`/);
  assert.match(connectionsSource, /--ai-image-generate-handle-top", `\$\{handleMetrics\.gapDoc\}px`/);
  assert.match(connectionsSource, /shouldAllowInitialPreviewPaint \|\| shouldUpdatePreviewLod \|\| shouldUnloadMedia \|\| shouldRenderEmptyPreviewState/);
  assert.match(connectionsSource, /renderAiImageBoardGeneratedMedia\(element, board, \{ recommendedLod \}\)/);
  assert.doesNotMatch(connectionsSource, /mediaHost\.dataset\.mediaPreview = previewMode/);
  assert.doesNotMatch(connectionsSource, /mediaHost\.style\.backgroundImage = nextBackgroundImage/);
  assert.match(connectionsSource, /estimateAiBoardDecodedMB\(board, currentLod, activePreview, mediaHost\)/);
  assert.match(connectionsSource, /stateBoards: aiBoards\.length/);
  assert.match(connectionsSource, /metrics\.visibleAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.nearAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.offscreenAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.activePreviewCount \+= 1/);
  assert.match(connectionsSource, /const previewDebug = boardDragActive \? null : getAiBoardPreviewDebugSnapshot\(element, mediaHost\)/);
  assert.match(connectionsSource, /metrics\.previewDebugEvents = aiBoardPreviewDebugEvents\.map/);
  assert.doesNotMatch(connectionsSource, /syncAiBoardMobileDebugConsole/);
  assert.match(connectionsSource, /generatingBoards: aiImageGeneratingBoardIds\.size/);
  assert.match(connectionsSource, /lastGenerateStatus: formatAiImageGenerationStatus\(getLastAiImageGenerationStatus\(\)\)/);
  assert.match(connectionsSource, /generationStatus: generationStatus\?\.status \|\| ""/);
  assert.match(connectionsSource, /metrics\.estimatedDecodedMB/);
  assert.match(connectionsSource, /getStableAiBoardRecommendedLod\(board, width, height, viewState\.dpr, mediaHost\)/);
  assert.match(connectionsSource, /preloadAiImageBoardRuntimeLod\(board\.generatedMedia, rawRecommendedLod\)/);
  assert.match(connectionsSource, /function handleDocumentSpaceBoardSelectionPointerDown\(event\)/);
  assert.match(connectionsSource, /document\.addEventListener\("pointerdown", handleDocumentSpaceBoardSelectionPointerDown, true\)/);
  assert.match(connectionsSource, /function shouldStartSpaceBoardDragFromEvent\(event\)/);
  assert.match(connectionsSource, /board\.addEventListener\("pointerdown", startSpaceBoardDrag\)/);
  assert.match(connectionsSource, /\[data-ai-image-board-caption\]/);
  assert.match(connectionsSource, /\[contenteditable\]/);
  assert.doesNotMatch(connectionsSource, /element\.style\.left = `\$\{point\.x\}px`/);
  assert.doesNotMatch(connectionsSource, /element\.style\.top = `\$\{point\.y\}px`/);
  assert.doesNotMatch(connectionsSource, /element\.style\.transform = `scale\(\$\{scale\}\)`/);
  assert.match(connectionsSource, /renderAiImageBoardGeneratedMedia\(element, board, \{ recommendedLod \}\)/);
  assert.doesNotMatch(connectionsSource, /document\.createElement\(kind === "video" \? "video" : "img"\)/);
  assert.doesNotMatch(connectionsSource, /replaceChildren\(node\)/);
  assert.match(connectionsSource, /cbo:ai-image-board-generate-click/);
  assert.match(connectionsSource, /--ai-image-generate-handle-left/);
  assert.match(connectionsSource, /function handleAiImagePromptInput\(event\)/);
  assert.match(connectionsSource, /function handleAiImageCaptionInput\(event\)/);
  assert.match(connectionsSource, /function moveAiImageCaptionCaretToEnd\(editor\)/);
  assert.match(connectionsSource, /range\.collapse\(false\)/);
  assert.match(connectionsSource, /keepAiImageCaptionCaretVisible\(editor\)/);
  assert.match(connectionsSource, /scheduleAiImagePromptFocusViewport\(board\.id, \{ target: "caption" \}\)/);
  assert.match(connectionsSource, /focusAiImagePromptBoard\(board\.id, \{ target: "caption" \}\)/);
  assert.match(connectionsSource, /function canEditAiImageCaption\(\)/);
  assert.match(connectionsSource, /return !isMobileLikeSpaceBoardViewport\(\)/);
  assert.match(connectionsSource, /const canEditCaption = isSelected && canEditAiImageCaption\(\)/);
  assert.match(connectionsSource, /const shouldShow = canEditCaption \|\| hasCaption/);
  assert.match(connectionsSource, /contentEditable = canEditCaption \? "plaintext-only" : "false"/);
  assert.match(connectionsSource, /data-ai-image-board-caption-editor/);
  assert.match(connectionsSource, /element\.dataset\.aiCaptionLod = "visible"/);
  assert.match(connectionsSource, /element\.dataset\.aiControlLod = "visible"/);
  assert.match(connectionsSource, /const captionScale = plainArtboardMode \? viewScale : 1/);
  assert.match(connectionsSource, /const captionMinHeight = getAiImageCaptionMinHeightDoc\(\) \* captionScale/);
  assert.match(connectionsSource, /const captionPreviewHeight = getAiImageCaptionPreviewHeightDoc\(\) \* captionScale/);
  assert.match(connectionsSource, /const captionMaxHeight = getAiImageCaptionMaxHeightDoc\(docHeight\) \* captionScale/);
  assert.match(connectionsSource, /isSelected\s*\?\s*Math\.max\(captionPreviewHeight, getAiImageCaptionStoredHeightDoc\(element\) \* captionScale\)\s*:\s*captionPreviewHeight/);
  assert.match(connectionsSource, /setCssVarIfChanged\(element, "--ai-caption-height", `\$\{captionHeight\}px`/);
  assert.doesNotMatch(connectionsSource, /captionScreenSize < AI_IMAGE_CAPTION_MIN_SCREEN_BOARD_PX/);
  assert.match(connectionsSource, /type: "space-board-caption"/);
  assert.match(connectionsSource, /function updateAiImageCaptionControls\(element, board, isSelected = false\)/);
  assert.match(connectionsSource, /type: "space-board-prompt"/);
  assert.match(connectionsSource, /function startSpaceBoardDrag\(event\)/);
  assert.match(connectionsSource, /function cancelSpaceBoardDragForTouchNavigation\(source = "space-board-touch-navigation-cancel"\)/);
  assert.match(connectionsSource, /namespace\.isTouchNavigationExclusive\?\.\(\{ includeGuard: true \}\)/);
  assert.match(connectionsSource, /window\.addEventListener\("cbo:touch-navigation-start"/);
  assert.match(connectionsSource, /function finishSpaceBoardDrag\(event\)/);
  assert.match(connectionsSource, /type: "space-board-create"/);
  assert.match(connectionsSource, /type: "space-board-move"/);
  assert.match(connectionsSource, /function captureConnectionsHistoryState\(options = \{\}\)/);
  assert.match(connectionsSource, /function restoreConnectionsHistoryState\(state, source = "history-artboard-connections"\)/);
  assert.match(previewSource, /\[data-ai-image-board\]/);
  assert.match(connectionsSource, /namespace\.getArtboardConnectionBoards = function getArtboardConnectionBoards/);
  assert.match(connectionsSource, /namespace\.getArtboardConnectionBoardCollisionRects = function getArtboardConnectionBoardCollisionRects/);
  assert.doesNotMatch(connectionsSource, /Describe the image you want to generate/);
  assert.match(connectionsSource, /const left = view\.left \+ view\.width \+ gap;/);
  assert.match(connectionsSource, /const top = view\.top \+ gap/);
  assert.match(connectionsSource, /x: left \+ size \* 0\.5/);
  assert.match(connectionsSource, /const preferredLeft = end\.x \+ CONNECTION_MENU_GAP_CSS_PX;/);
  assert.match(connectionsSource, /preferredLeft \+ width > stageWidth - 8/);
  assert.match(connectionsSource, /stageHeight - height - 8/);
  assert.doesNotMatch(connectionsSource, /CONNECTION_MENU_PADDING_CSS_PX/);
  assert.match(cssSource, /\.editor-artboard-connection-menu/);
  assert.match(cssSource, /\.editor-artboard-connection-menu-close/);
  assert.match(cssSource, /\.editor-ai-image-board-preview-layer/);
  assert.match(cssSource, /\.editor-ai-image-board-preview-layer\.is-active/);
  assert.match(cssSource, /visibility: hidden/);
  assert.match(cssSource, /visibility: visible/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board-preview-layer\s*\{[^}]*transition: opacity/);
  assert.match(indexSource, /vertical-symmetry-v3/);
  assert.match(cssSource, /\.editor-stage[\s\S]*background-color: var\(--editor-stage-bg\)/);
  assert.doesNotMatch(cssSource, /background-image: radial-gradient/);
  assert.match(cssSource, /\.editor-canvas-grid-pattern-overlay[\s\S]*contain: strict/);
  assert.match(cssSource, /\.editor-canvas-grid-pattern-surface[\s\S]*pointer-events: none/);
  assert.match(cssSource, /@keyframes editor-canvas-grid-fade-in/);
  assert.match(cssSource, /\.editor-artboard-action-bubble[\s\S]*touch-action: none/);
  assert.match(cssSource, /\.editor-artboard-action-bubble[\s\S]*box-shadow: none/);
  assert.match(cssSource, /\.editor-artboard-action-bubble[\s\S]*transform: none/);
  assert.match(cssSource, /\.editor-artboard-connection-menu-button[\s\S]*touch-action: manipulation/);
  assert.doesNotMatch(cssSource, /@media \(pointer: coarse\)[\s\S]*min-width: 44px/);
  assert.match(cssSource, /\.editor-space-board-layer/);
  assert.match(cssSource, /\.editor-space-board-layer[\s\S]*z-index: 5/);
  assert.match(cssSource, /\.editor-space-board-pane/);
  assert.match(cssSource, /\.editor-space-board-pane\.is-transforming[\s\S]*will-change: transform/);
  assert.doesNotMatch(cssSource, /\.editor-ai-board-metrics/);
  assert.doesNotMatch(connectionsSource, /AI METRICS/);
  assert.doesNotMatch(connectionsSource, /ensureAiBoardMetricsPanel/);
  assert.match(cssSource, /\.editor-webgl-canvas[\s\S]*z-index: 3/);
  assert.match(cssSource, /\.editor-artboard-paper-layer[\s\S]*z-index: 2/);
  const connectionLayerRule = cssSource.match(/\.editor-artboard-connection-layer\s*\{[^}]*\}/)?.[0] || "";
  const paneConnectionLayerRule = cssSource.match(/\.editor-space-board-pane > \.editor-artboard-connection-layer\s*\{[^}]*\}/)?.[0] || "";
  assert.match(connectionLayerRule, /z-index:\s*1;/);
  assert.match(connectionLayerRule, /width:\s*1px;/);
  assert.match(paneConnectionLayerRule, /z-index:\s*0;/);
  assert.match(cssSource, /\.editor-vector-overlay[\s\S]*z-index: 4/);
  assert.match(cssSource, /\.editor-ai-image-board[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board[\s\S]*isolation: isolate/);
  assert.doesNotMatch(cssSource.match(/\.editor-ai-image-board\s*\{[\s\S]*?\}/)?.[0] || "", /will-change:\s*transform/);
  assert.match(cssSource, /@property --editor-ai-loading-angle/);
  assert.doesNotMatch(cssSource.match(/\.editor-ai-image-board::before\s*\{[\s\S]*?\}/)?.[0] || "", /repeating-conic-gradient/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-heavy-mounted\.is-generating::before[\s\S]*repeating-conic-gradient/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-heavy-mounted\.is-generating::before[\s\S]*box-shadow/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-heavy-mounted\.is-generating::before[\s\S]*animation: editor-ai-image-board-loading-frame 1400ms linear infinite/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-generating \.editor-ai-image-board-play::before[\s\S]*content: none/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-control-lod-hidden/);
  assert.match(cssSource, /--ai-plain-control-icon-size/);
  assert.match(cssSource, /\.editor-ai-image-board-dimensions[\s\S]*right: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-dimensions[\s\S]*background: var\(--ai-board-meta-chip-bg\)/);
  assert.match(cssSource, /\.editor-ai-image-board-dimensions[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-artboard-frame-label[\s\S]*max-width: var\(--ai-board-name-max-width/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-artboard-frame-label[\s\S]*background: var\(--ai-board-meta-chip-bg\)/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard:hover \.editor-ai-image-board-dimensions/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-dimensions[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-ai-image-board-selection-shadow[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-selection-shadow[\s\S]*transform: translateY\(var\(--ai-image-board-selection-shadow-rise, 18px\)\)/);
  assert.match(cssSource, /\.editor-ai-image-board-selection-shadow[\s\S]*transition:[\s\S]*opacity 180ms ease[\s\S]*transform 220ms cubic-bezier/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-selection-shadow[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-selection-shadow[\s\S]*transform: translateY\(0\)/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-play[\s\S]*pointer-events: none/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-play[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-input[\s\S]*top: calc\(100% - var\(--ai-plain-control-outside-offset/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-input[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-target[\s\S]*outline-color: #f05023/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-target \.editor-ai-image-board-surface[\s\S]*box-shadow:/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-target \.editor-ai-image-board-input[\s\S]*background: #f05023/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-target \.editor-ai-image-board-input[\s\S]*scale\(1\.16\)/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-blocked[\s\S]*outline-color: #a8a8a8/);
  assert.match(cssSource, /\.editor-stage\.connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-blocked \.editor-ai-image-board-input[\s\S]*background: #111111/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-play[\s\S]*left: calc\(100% \+ var\(--ai-plain-control-outside-offset/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-play[\s\S]*top: var\(--ai-plain-control-outside-offset/);
  assert.doesNotMatch(cssSource, /editor-ai-image-board-loading-spin/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*isolation: isolate/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*border-radius: var\(--ai-image-board-radius, 16px\)/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*outline: var\(--ai-image-board-outline-width, 5px\) solid #dbdbdb/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*transition: outline-color 150ms ease-in-out/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \{[\s\S]*outline-color: #f05023/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface \{[\s\S]*z-index: 0/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface \{[\s\S]*box-shadow: none/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface::after[\s\S]*linear-gradient/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-surface::after[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-ai-image-board-caption[\s\S]*z-index: 9/);
  assert.match(cssSource, /\.editor-ai-image-board-caption[\s\S]*height: var\(--ai-caption-height, var\(--ai-caption-min-height, 74px\)\)/);
  assert.match(cssSource, /\.editor-ai-image-board-caption[\s\S]*transition:[\s\S]*height 120ms ease/);
  assert.match(cssSource, /\.editor-ai-image-board-caption[\s\S]*drop-shadow\(0 var\(--ai-caption-shadow-y, 1px\) var\(--ai-caption-shadow-blur, 2px\)/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board\.is-caption-lod-hidden \.editor-ai-image-board-caption/);
  assert.match(cssSource, /\.editor-ai-image-board-caption\.is-overflowing[\s\S]*mask-image/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-text,[\s\S]*\.editor-ai-image-board-caption-editor[\s\S]*padding: var\(--ai-caption-padding-y, 4px\) var\(--ai-caption-padding-x, 6px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-text[\s\S]*display: block/);
  assert.match(cssSource, /\.editor-ai-image-board:not\(\.is-selected\) \.editor-ai-image-board-caption-text[\s\S]*-webkit-line-clamp: 2/);
  assert.doesNotMatch(cssSource, /-webkit-line-clamp: 3/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-editor[\s\S]*border-radius: var\(--ai-caption-editor-radius, 6px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-editor:empty::before[\s\S]*content: attr\(data-placeholder\)/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-editor[\s\S]*white-space: pre-wrap/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-caption-editing \.editor-ai-image-board-caption-text[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-caption-editing \.editor-ai-image-board-caption-editor[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-caption-editing \.editor-ai-image-board-caption-editor:focus[\s\S]*box-shadow: 0 0 0 var\(--ai-caption-focus-ring-width, 1px\)/);
  assert.match(cssSource, /@media \(pointer: coarse\)[\s\S]*font-size: var\(--ai-caption-font-size/);
  assert.doesNotMatch(cssSource.match(/\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface\s*\{[\s\S]*?\}/)?.[0] || "", /z-index:\s*-1/);
  assert.match(cssSource, /@keyframes editor-ai-image-board-loading-frame/);
  assert.doesNotMatch(cssSource.match(/\.editor-ai-image-board::before\s*\{[\s\S]*?\}/)?.[0] || "", /filter:\s*blur/);
  assert.match(cssSource, /\.editor-ai-image-board-label[\s\S]*cursor: grab/);
  assert.match(cssSource, /\.editor-ai-image-board-label[\s\S]*touch-action: none/);
  assert.match(cssSource, /\.editor-stage\.artboard-dragging \.editor-artboard-action-bubble[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-surface[\s\S]*border: 5px solid #f05023/);
  assert.match(cssSource, /\.editor-ai-image-board-media/);
  assert.match(cssSource, /\.editor-ai-image-board-media[\s\S]*border-radius: inherit/);
  assert.match(cssSource, /\.editor-ai-image-board-media[\s\S]*background-size: contain/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-generating \.editor-ai-image-board-media::before/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-generating \.editor-ai-image-board-media::after/);
  assert.match(cssSource, /animation: editor-ai-image-board-shimmer 1350ms/);
  assert.match(cssSource, /@keyframes editor-ai-image-board-shimmer/);
  assert.match(cssSource, /\.editor-ai-image-board-media\.is-image-preview/);
  assert.match(cssSource, /\.editor-ai-image-board-media\.is-placeholder-preview/);
  assert.match(cssSource, /\.editor-ai-image-board-preview-layer \{[\s\S]*contain: layout paint style/);
  assert.match(cssSource, /\.editor-ai-image-board-preview-layer \{[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-preview-layer\.is-active \{[\s\S]*opacity: 1/);
  assert.doesNotMatch(cssSource, /\.editor-ai-board-mobile-debug-console/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board-media\.is-video-preview::before/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board-media\.is-video-preview::after/);
  assert.match(cssSource, /\.editor-ai-image-board-video[\s\S]*object-fit: contain/);
  assert.match(cssSource, /\.editor-ai-image-board-video-poster[\s\S]*object-fit: contain/);
  assert.match(cssSource, /--ai-video-mute-inset/);
  assert.match(cssSource, /\.editor-ai-image-board-media\.is-video-preview:hover > \.editor-ai-image-board-video-mute/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-selected \.editor-ai-image-board-media\.is-video-preview > \.editor-ai-image-board-video-mute/);
  assert.match(cssSource, /\.editor-ai-image-board-video-mute[\s\S]*background: rgba\(17, 17, 17, 0\.68\)/);
  assert.match(cssSource, /\.editor-ai-image-board-video-mute[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board-media-item[\s\S]*object-fit: contain/);
  assert.match(cssSource, /\.editor-ai-image-board::after[\s\S]*z-index: 4/);
  assert.match(cssSource, /\.editor-ai-image-board-footer[\s\S]*bottom: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-footer[\s\S]*left: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-footer[\s\S]*right: 0/);
  assert.match(cssSource, /--ai-image-board-footer-height: 210px/);
  assert.match(cssSource, /\.editor-ai-image-board-footer[\s\S]*min-height: var\(--ai-image-board-footer-height, 210px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-title[\s\S]*bottom: calc\(var\(--ai-image-board-footer-height, 210px\) \+ 24px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-title[\s\S]*color: #111111/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-title[\s\S]*font-size: 42px/);
  assert.match(cssSource, /\.editor-ai-image-board:hover \.editor-ai-image-board-footer/);
  assert.match(cssSource, /\.editor-ai-image-board:hover \.editor-ai-image-board-prompt-title/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-input/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-input[\s\S]*box-sizing: border-box/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-input[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-input[\s\S]*font-size: 48px/);
  assert.match(cssSource, /\.editor-ai-image-board-prompt-input::placeholder[\s\S]*rgba\(255, 255, 255, 0\.46\)/);
  assert.match(cssSource, /\.editor-ai-image-board-input/);
  assert.match(cssSource, /--ai-image-input-handle-left, -144px/);
  assert.match(cssSource, /--ai-image-input-icon-size, 76px/);
  assert.match(cssSource, /\.editor-ai-image-board-generate/);
  assert.match(cssSource, /\.editor-ai-image-board-generate[\s\S]*border: var\(--ai-image-generate-border-width, 3px\) solid #f05023/);
  assert.match(cssSource, /\.editor-ai-image-board-generate:hover::before/);
  assert.match(cssSource, /--ai-image-generate-icon-size, 76px/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-board-controls/);
});

test("selected AI image boards expose a floating toolbar shell", () => {
  const connectionsSource = readArtboardConnectionSources();
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(connectionsSource, /function ensureAiImageBoardActionToolbar\(element\)/);
  assert.match(connectionsSource, /function getAiImageBoardActionToolbarMarkup\(\)/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-action="fullscreen"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-action="edit-preview"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-action="duplicate"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-action="delete"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-action="move"/);
  assert.match(connectionsSource, /aria-label="Enlarge"/);
  assert.match(connectionsSource, /aria-label="Create with AI"/);
  assert.match(connectionsSource, /aria-label="Duplicate"/);
  assert.match(connectionsSource, /aria-label="Delete"/);
  assert.match(connectionsSource, /aria-label="Move"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-label="Enlarge"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-label="Create with AI"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-label="Duplicate"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-label="Delete"/);
  assert.match(connectionsSource, /data-ai-image-board-toolbar-label="Move"/);
  assert.match(connectionsSource, /lucide-fullscreen/);
  assert.match(connectionsSource, /lucide-astroid/);
  assert.match(connectionsSource, /lucide-copy/);
  assert.match(connectionsSource, /lucide-trash-2/);
  assert.match(connectionsSource, /lucide-move-icon lucide-move/);
  assert.match(connectionsSource, /editor-ai-image-board-action-toolbar-separator/);
  assert.match(connectionsSource, /function handleAiImageBoardActionToolbarClick\(event\)/);
  assert.match(connectionsSource, /openAiImageBoardEnlargeViewer\(boardId\)/);
  assert.match(connectionsSource, /openAiImageBoardEditPreview\(boardId\)/);
  assert.match(connectionsSource, /duplicateAiImageBoard\(boardId\)/);
  assert.match(connectionsSource, /deleteAiImageBoard\(boardId\)/);
  assert.match(connectionsSource, /namespace\.toggleMobileObjectMoveArmed\?\.\(\{[\s\S]*type: "space-board"/);
  assert.match(connectionsSource, /const requiresMobileMoveArm = \([\s\S]*board\.type === "ai-image" \|\| \(typeof isTextPromptBoard === "function" && isTextPromptBoard\(board\)\)[\s\S]*event\.pointerType === "touch"[\s\S]*isMobileLikeSpaceBoardViewport\(\)/);
  assert.match(connectionsSource, /space-board-mobile-select-clear-move/);
  assert.match(connectionsSource, /function duplicateAiImageBoard\(boardId\)/);
  assert.match(connectionsSource, /function deleteAiImageBoard\(boardId\)/);
  assert.match(connectionsSource, /function getIncomingConnectionsForSpaceBoard\(boardId\)/);
  assert.match(connectionsSource, /const nearbyGap = metrics\.gapDoc \+ metrics\.sizeDoc \+ SPACE_BOARD_DRAG_GAP_DOC_PX/);
  assert.match(connectionsSource, /resolveFreeSpaceBoardPlacement\(preferredRect, \{\s*gap: SPACE_BOARD_DRAG_GAP_DOC_PX,\s*\}\)/);
  assert.match(connectionsSource, /connections\.push\(\{[\s\S]*targetBoardId: duplicate\.id/);
  assert.match(connectionsSource, /selectedSpaceBoardId = duplicate\.id/);
  assert.match(connectionsSource, /connections = connections\.filter\(\(connection\) => connection\.targetBoardId !== normalizedBoardId\)/);
  assert.match(connectionsSource, /clearAiImageGenerationPreview\(normalizedBoardId\)/);
  assert.match(connectionsSource, /space-board-duplicate-ai-image/);
  assert.match(connectionsSource, /space-board-delete-ai-image/);
  assert.match(connectionsSource, /function ensureAiImageBoardMobileActionToolbar\(\)/);
  assert.match(connectionsSource, /function syncAiImageBoardMobileActionToolbar\(boardId = ""\)/);
  assert.match(connectionsSource, /namespace\.clearMobileObjectMoveArmed\?\.\(\{ type: "space-board" \}/);
  assert.match(connectionsSource, /source: "space-board-document-pointer-clear-selection"/);
  assert.match(connectionsSource, /data-ai-image-board-action-toolbar/);
  assert.match(connectionsSource, /data-ai-image-board-mobile-action-toolbar/);
  assert.match(connectionsSource, /data-ai-image-board-action-toolbar-items/);
  assert.match(connectionsSource, /ensureAiImageBoardActionToolbar\(board\)/);
  assert.match(connectionsSource, /syncAiImageBoardMobileActionToolbar\(/);
  assert.match(connectionsSource, /\[data-ai-image-board-action-toolbar\]/);
  assert.match(connectionsSource, /function setAiImageBoardToolbarButtonEnabled\(button, enabled\)/);
  assert.match(connectionsSource, /function updateAiImageBoardActionToolbarPlacement\(element, isSelected = false\)/);
  assert.match(connectionsSource, /function getAiImageBoardActionToolbarViewportBounds\(\)/);
  assert.match(connectionsSource, /aboveTop < bounds\.top && belowTop \+ toolbarHeight <= bounds\.bottom/);
  assert.match(connectionsSource, /element\.classList\.toggle\("is-action-toolbar-below", shouldFlipBelow\)/);
  assert.match(connectionsSource, /updateAiImageBoardActionToolbarPlacement\(element, isSelected\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar \{/);
  assert.match(cssSource, /width: max-content/);
  assert.match(cssSource, /min-width: 0/);
  assert.match(cssSource, /height: 40px/);
  assert.match(cssSource, /padding: 4px/);
  assert.match(cssSource, /border-radius: 14px/);
  assert.match(cssSource, /background: #ffffff/);
  assert.match(cssSource, /box-shadow: 0 2px 5px rgba\(55, 73, 87, 0\.1\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-items[\s\S]*gap: 4px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-items[\s\S]*width: auto/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-separator[\s\S]*width: 1px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-separator[\s\S]*height: 20px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-separator[\s\S]*background: rgba\(16, 16, 16, 0\.05\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button[\s\S]*width: 32px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button[\s\S]*height: 32px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button:hover,[\s\S]*background: rgba\(115, 115, 115, 0\.1\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button\.is-active[\s\S]*color: #d94116/);
  assert.match(cssSource, /\.editor-ai-image-board > \.editor-ai-image-board-action-toolbar \.editor-ai-image-board-mobile-move-button[\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button::after[\s\S]*content: attr\(data-ai-image-board-toolbar-label\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button:hover::after[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-action-toolbar-below \.editor-ai-image-board-action-toolbar[\s\S]*top: calc\(100% \+ 14px\)/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-action-toolbar-below \.editor-ai-image-board-action-toolbar-button::after[\s\S]*top: calc\(100% \+ 9px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button svg[\s\S]*width: 18px/);
  assert.match(cssSource, /\.editor-ai-image-board-action-toolbar-button svg[\s\S]*height: 18px/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-selected \.editor-ai-image-board-action-toolbar[\s\S]*opacity: 1/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-board > \.editor-ai-image-board-action-toolbar[\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar[\s\S]*bottom: calc\(var\(--cbo-mobile-floating-bottom\) \+ 28px\)/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar[\s\S]*z-index: 9030/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar[\s\S]*width: min\(360px/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar[\s\S]*height: 44px/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar \.editor-ai-image-board-action-toolbar-button[\s\S]*width: 36px/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar \.editor-ai-image-board-mobile-move-button[\s\S]*display: grid/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar \.editor-ai-image-board-action-toolbar-button svg[\s\S]*width: 20px/);
  assert.match(cssSource, /\.editor-ai-image-board-mobile-action-toolbar\.is-active[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-artboard-connection-menu\.is-detached-toolbar-menu \{[\s\S]*z-index: 9060/);
});

test("AI image boards can open a responsive enlarge viewer", () => {
  const connectionsSource = readArtboardConnectionSources();
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(connectionsSource, /AI_IMAGE_ENLARGE_MIN_VIEWPORT_PX = 280/);
  assert.match(connectionsSource, /AI_IMAGE_ENLARGE_MAX_SCALE = 6/);
  assert.match(connectionsSource, /AI_IMAGE_ENLARGE_EDGE_SLACK_RATIO = 0\.35/);
  assert.match(connectionsSource, /AI_IMAGE_ENLARGE_EDGE_SLACK_MAX_PX = 360/);
  assert.match(connectionsSource, /AI_IMAGE_ENLARGE_PINCH_MIN_DISTANCE_PX = 24/);
  assert.match(connectionsSource, /function ensureAiImageBoardEnlargeViewer\(\)/);
  assert.match(connectionsSource, /function openAiImageBoardEnlargeViewer\(boardId\)/);
  assert.match(connectionsSource, /function closeAiImageBoardEnlargeViewer\(\)/);
  assert.match(connectionsSource, /function isAiImageBoardAndroidVideoEnlargeDevice\(\)/);
  assert.match(connectionsSource, /\\bAndroid\\b/);
  assert.match(connectionsSource, /function getAiImageBoardEnlargeVideoSrc\(media\)/);
  assert.match(connectionsSource, /getAiVideoBoardFixedCanvasPreviewSrc\(media\)/);
  assert.match(connectionsSource, /getAiVideoBoardVariantSrc\(media, 480\)/);
  assert.match(connectionsSource, /function getAiImageBoardEnlargeMedia\(board\)/);
  assert.match(connectionsSource, /kind,/);
  assert.match(connectionsSource, /originalSrc,/);
  assert.match(connectionsSource, /data-ai-image-enlarge-viewer/);
  assert.match(connectionsSource, /data-ai-image-enlarge-title/);
  assert.match(connectionsSource, /data-ai-image-enlarge-download/);
  assert.match(connectionsSource, /data-ai-image-enlarge-close/);
  assert.match(connectionsSource, /data-ai-image-enlarge-stage/);
  assert.match(connectionsSource, /data-ai-image-enlarge-image/);
  assert.match(connectionsSource, /data-ai-image-enlarge-video/);
  assert.match(connectionsSource, /data-ai-image-enlarge-video-controls/);
  assert.match(connectionsSource, /data-ai-image-enlarge-video-progress-fill/);
  assert.match(connectionsSource, /const isVideo = media\.kind === "video"/);
  assert.match(connectionsSource, /const mediaElement = isVideo \? video : image/);
  assert.match(connectionsSource, /mediaKind: media\.kind \|\| "image"/);
  assert.match(connectionsSource, /pauseAiImageBoardVideoPreview\(boardPreviewVideo\)/);
  assert.match(connectionsSource, /video\.src = media\.src/);
  assert.match(connectionsSource, /const playResult = video\.play\?\.\(\)/);
  assert.match(connectionsSource, /function handleAiImageBoardEnlargeVideoPlayClick\(event\)/);
  assert.match(connectionsSource, /function handleAiImageBoardEnlargeVideoMuteClick\(event\)/);
  assert.match(connectionsSource, /function handleAiImageBoardEnlargeVideoLoopClick\(event\)/);
  assert.match(connectionsSource, /function handleAiImageBoardEnlargeVideoFullscreenClick\(event\)/);
  assert.match(connectionsSource, /function syncAiImageBoardEnlargeVideoControls\(\)/);
  assert.match(connectionsSource, /function seekAiImageBoardEnlargeVideoFromEvent\(event\)/);
  assert.match(connectionsSource, /video\?\.addEventListener\("timeupdate", syncAiImageBoardEnlargeVideoControls\)/);
  assert.match(connectionsSource, /state\.videoControlsIdleTimer = window\.setTimeout\(hideAiImageBoardEnlargeVideoControls, 2500\)/);
  assert.match(connectionsSource, /data-ai-image-enlarge-shell/);
  assert.match(connectionsSource, /data-ai-image-enlarge-zoom/);
  assert.match(connectionsSource, /data-ai-image-enlarge-dimensions/);
  assert.match(connectionsSource, /window\.addEventListener\("keydown", handleAiImageBoardEnlargeKeyDown, true\)/);
  assert.match(connectionsSource, /window\.removeEventListener\("keydown", handleAiImageBoardEnlargeKeyDown, true\)/);
  assert.match(connectionsSource, /window\.addEventListener\("resize", handleAiImageBoardEnlargeResize\)/);
  assert.match(connectionsSource, /window\.requestAnimationFrame\(renderAiImageBoardEnlargeTransform\)/);
  assert.match(connectionsSource, /function getAiImageBoardEnlargeWheelDelta\(event, stage\)/);
  assert.match(connectionsSource, /state\.scale \* Math\.exp\(-deltaY \* AI_IMAGE_ENLARGE_WHEEL_SPEED\)/);
  assert.match(connectionsSource, /event\.stopPropagation\(\);\s*closeAiImageBoardEnlargeViewer\(\);/);
  assert.match(connectionsSource, /activePointers: new Map\(\)/);
  assert.match(connectionsSource, /function beginAiImageBoardEnlargePinch\(\)/);
  assert.match(connectionsSource, /function updateAiImageBoardEnlargePinch\(\)/);
  assert.match(connectionsSource, /function getAiImageBoardEnlargePinchMetrics\(state\)/);
  assert.match(connectionsSource, /stage\?\.addEventListener\("auxclick", handleAiImageBoardEnlargeAuxClick\)/);
  assert.match(connectionsSource, /function isAiImageBoardEnlargePanPointer\(event\)/);
  assert.match(connectionsSource, /event\.button === 1/);
  assert.match(connectionsSource, /function getAiImageBoardEnlargeStageContentSize\(stage\)/);
  assert.match(connectionsSource, /function syncAiImageBoardEnlargeBaseSize\(\)/);
  assert.match(connectionsSource, /Number\(state\.image\.naturalWidth\) \|\| Number\(state\.mediaWidth\)/);
  assert.match(connectionsSource, /const fitScale = Math\.min\(stageSize\.width \/ naturalWidth, stageSize\.height \/ naturalHeight\)/);
  assert.match(connectionsSource, /state\.image\.style\.width = nextWidth/);
  assert.match(connectionsSource, /const edgeSlackX = overflowX/);
  assert.match(connectionsSource, /const maxOffsetX = overflowX \+ edgeSlackX/);
  assert.match(connectionsSource, /setPointerCapture/);
  assert.match(connectionsSource, /releasePointerCapture/);
  assert.match(connectionsSource, /closeAiImageBoardEnlargeViewer\(\);/);
  assert.match(connectionsSource, /\[data-ai-image-enlarge-viewer\]/);
  assert.match(connectionsSource, /closeAiImageBoardEditPreview\(\)/);
  assert.match(connectionsSource, /zoomLabel\.textContent = `\$\{Math\.round\(state\.scale \* 100\)\}%`/);
  assert.match(connectionsSource, /dimensions\.textContent = `\$\{media\.width\}x\$\{media\.height\} px`/);
  assert.match(connectionsSource, /updateAiImageBoardActionToolbarState\(element\.querySelector\("\[data-ai-image-board-action-toolbar\]"\), board\)/);
  assert.match(connectionsSource, /aiImageEnlargeState\?\.mediaKind === "video"/);
  assert.match(connectionsSource, /aiImageEnlargeState\.boardId === boardId/);

  assert.match(cssSource, /body\.editor-ai-image-enlarge-open[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer \{[\s\S]*position: fixed/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer \{[\s\S]*inset: 0/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer \{[\s\S]*place-items: center/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer\[hidden\][\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-shell[\s\S]*width: min\(1232px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-shell[\s\S]*border-radius: 14px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-header[\s\S]*height: 40px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-title[\s\S]*text-overflow: ellipsis/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-download[\s\S]*min-width: 82px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-close[\s\S]*width: 22px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-stage[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-stage[\s\S]*padding: 0/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-stage[\s\S]*background: #4b4b4b/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-stage[\s\S]*touch-action: none/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer\.is-zoomed \.editor-ai-image-enlarge-stage[\s\S]*cursor: grab/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer\.is-panning \.editor-ai-image-enlarge-stage[\s\S]*cursor: grabbing/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-stage[\s\S]*box-sizing: border-box/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-image[\s\S]*max-width: none/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-image[\s\S]*max-height: none/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-image[\s\S]*object-fit: fill/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-image[\s\S]*will-change: transform/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-controls[\s\S]*width: clamp\(270px, 30%, 370px\)/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-controls[\s\S]*transform: translateX\(-50%\)/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-controls\.is-idle[\s\S]*translateY\(16px\)/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-controls-glass[\s\S]*backdrop-filter: blur\(16px\)/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-control-button\.is-play[\s\S]*width: 36px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-progress[\s\S]*height: 4px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-video-progress-fill[\s\S]*transition: width 180ms/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-viewer\.is-video-preview \.editor-ai-image-enlarge-meta[\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-meta[\s\S]*position: absolute/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-meta[\s\S]*border-radius: 999px/);
  assert.match(cssSource, /\.editor-ai-image-enlarge-meta \[data-ai-image-enlarge-dimensions\][\s\S]*display: none/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-enlarge-header[\s\S]*env\(safe-area-inset-top/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-enlarge-image[\s\S]*max-width: 100%/);
});

test("AI menu can create editable Text Prompt boards on the infinite canvas", () => {
  const indexSource = readRepoFile("index.html");
  const connectionsSource = readArtboardConnectionSources();
  const cssSource = readRepoFile("css", "layout.css");
  const focusToolbarStart = connectionsSource.indexOf('class="editor-text-prompt-focus-toolbar"');
  const focusToolbarEnd = connectionsSource.indexOf('<div class="editor-text-prompt-focus-body">', focusToolbarStart);
  const focusToolbarMarkup = focusToolbarStart >= 0 && focusToolbarEnd > focusToolbarStart
    ? connectionsSource.slice(focusToolbarStart, focusToolbarEnd)
    : "";

  assert.match(indexSource, /<script src="\.\/js\/artboard-connections\/space-board-text\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(connectionsSource, /data-artboard-connection-action="text-prompt"/);
  assert.match(connectionsSource, />Text Prompt<\/span>/);
  assert.match(connectionsSource, /materializeTextPromptBoardFromMenu\(\)/);
  assert.match(connectionsSource, /TEXT_PROMPT_BOARD_DEFAULT_WIDTH_DOC_PX = 920/);
  assert.match(connectionsSource, /TEXT_PROMPT_BOARD_DEFAULT_HEIGHT_DOC_PX = 280/);
  assert.match(connectionsSource, /TEXT_PROMPT_BOARD_MIN_WIDTH_DOC_PX = 200/);
  assert.match(connectionsSource, /TEXT_PROMPT_BOARD_MIN_HEIGHT_DOC_PX = 120/);
  assert.match(connectionsSource, /TEXT_PROMPT_FONT_SIZE_DOC_PX = 32/);
  assert.match(connectionsSource, /headingSizeDoc = fontSizeDoc \* \(42 \/ TEXT_PROMPT_FONT_SIZE_DOC_PX\)/);
  assert.match(connectionsSource, /TEXT_PROMPT_FONT_SIZE_MAX_DOC_PX = 72/);
  assert.match(connectionsSource, /TEXT_PROMPT_TEXT_COLOR = "#15171c"/);
  assert.match(connectionsSource, /TEXT_PROMPT_BACKGROUND_COLOR = "#ffffff"/);
  assert.match(connectionsSource, /type: TEXT_PROMPT_BOARD_TYPE/);
  assert.match(connectionsSource, /fontSizeDoc: normalizeTextPromptFontSizeDoc/);
  assert.match(connectionsSource, /textColor: normalizeTextPromptColor/);
  assert.match(connectionsSource, /backgroundColor: normalizeTextPromptBackgroundColor/);
  assert.match(connectionsSource, /data-space-text-board/);
  assert.match(connectionsSource, /data-text-prompt-type-badge/);
  assert.match(connectionsSource, /data-text-prompt-type-badge\]"\)\?\.addEventListener\("pointerdown", startTextPromptConnectionDrag\)/);
  assert.match(connectionsSource, /class="lucide lucide-type-icon lucide-type"/);
  assert.match(connectionsSource, /data-text-prompt-editor/);
  assert.match(connectionsSource, /contenteditable="false"/);
  assert.match(connectionsSource, /contenteditable="true"/);
  assert.match(connectionsSource, /--ai-plain-control-size", `\$\{plainControlMetrics\.size\}px`/);
  assert.match(connectionsSource, /--ai-plain-control-outside-offset", `\$\{plainControlMetrics\.outsideOffset\}px`/);
  assert.match(connectionsSource, /--ai-plain-control-border-width", `\$\{plainControlMetrics\.borderWidth\}px`/);
  assert.match(connectionsSource, /--ai-plain-control-icon-size", `\$\{plainControlMetrics\.iconSize\}px`/);
  assert.match(connectionsSource, /data-text-prompt-color-input="text"/);
  assert.match(connectionsSource, /data-text-prompt-color-input="background"/);
  assert.match(connectionsSource, /data-text-prompt-color-input="text"[\s\S]*data-text-prompt-command="font-increase"[\s\S]*data-text-prompt-command="font-decrease"[\s\S]*data-text-prompt-color-input="background"/);
  assert.match(connectionsSource, /data-text-prompt-command="background-transparent"/);
  assert.match(connectionsSource, /applyTextPromptStyleColor/);
  assert.match(connectionsSource, /textPromptToolbar\.className = "editor-text-prompt-toolbar editor-ai-image-board-action-toolbar"/);
  assert.match(connectionsSource, /editor-ai-image-board-action-toolbar-items editor-text-prompt-toolbar-items/);
  assert.match(connectionsSource, /\(document\.body \|\| stage\)\.appendChild\(textPromptToolbar\)/);
  assert.match(connectionsSource, /class="editor-ai-image-board-action-toolbar-button" type="button" data-text-prompt-command="focus"/);
  assert.match(connectionsSource, /class="lucide lucide-copy-icon lucide-copy"/);
  assert.match(connectionsSource, /class="lucide lucide-trash2-icon lucide-trash-2"/);
  assert.match(connectionsSource, /data-text-prompt-command="font-increase"/);
  assert.match(connectionsSource, /data-text-prompt-command="font-decrease"/);
  assert.match(connectionsSource, /data-text-prompt-command="move"/);
  assert.match(connectionsSource, /TEXT_PROMPT_MOVE_ICON/);
  assert.match(connectionsSource, /text-prompt-mobile-move-toolbar/);
  assert.match(connectionsSource, /adjustTextPromptBoardFontSize/);
  assert.match(connectionsSource, /board\.addEventListener\("wheel", handleSpaceBoardWheel, \{ passive: false \}\)/);
  assert.match(connectionsSource, /data-text-prompt-resize="nw"/);
  assert.match(connectionsSource, /data-text-prompt-resize="se"/);
  assert.match(connectionsSource, /startTextPromptResize/);
  assert.match(connectionsSource, /enterTextPromptInlineEditing\(board\.id, \{ select: false \}\)/);
  assert.match(connectionsSource, /data-text-prompt-focus-overlay/);
  assert.match(connectionsSource, /removeProperty\("--text-prompt-focus-font-size"\)/);
  assert.doesNotMatch(connectionsSource, /const focusFontSize = fontSizeDoc/);
  assert.doesNotMatch(focusToolbarMarkup, /data-text-prompt-command="font-increase"/);
  assert.doesNotMatch(focusToolbarMarkup, /data-text-prompt-command="font-decrease"/);
  assert.doesNotMatch(focusToolbarMarkup, /data-text-prompt-font-size/);
  assert.match(connectionsSource, /renderTextPromptBoards\(\{ pane, viewScale, viewState \}\)/);
  assert.match(connectionsSource, /has-outgoing-connection/);
  assert.match(connectionsSource, /is-connection-source/);
  assert.match(connectionsSource, /connections = connections\.filter\(\(connection\) => connection\.sourceBoardId !== normalizedBoardId\)/);
  assert.match(connectionsSource, /source: "space-board-create-text-prompt"/);
  assert.match(connectionsSource, /source: "text-prompt-resize"/);
  assert.match(connectionsSource, /source: "text-prompt-font-size"/);
  assert.match(connectionsSource, /source: "text-prompt-style-color"/);

  assert.match(cssSource, /\.editor-space-text-board \{/);
  assert.match(cssSource, /\.editor-space-text-board \{[\s\S]*outline: var\(--text-prompt-board-outline, 5px\) solid #dbdbdb/);
  assert.match(cssSource, /\.editor-space-text-board\.is-selected[\s\S]*outline-color: #f05023/);
  assert.match(cssSource, /\.editor-space-text-board-type[\s\S]*left: calc\(100% \+ var\(--ai-plain-control-outside-offset, 17px\)\)/);
  assert.match(cssSource, /\.editor-space-text-board-type[\s\S]*top: var\(--ai-plain-control-outside-offset, 17px\)/);
  assert.match(cssSource, /\.editor-space-text-board-type[\s\S]*border: var\(--ai-plain-control-border-width, 1\.5px\) solid #346aa6/);
  assert.match(cssSource, /\.editor-space-text-board-type[\s\S]*color: #346aa6/);
  assert.match(cssSource, /\.editor-space-text-board-type::before[\s\S]*background: #346aa6/);
  assert.match(cssSource, /\.editor-space-text-board:hover \.editor-space-text-board-type,[\s\S]*\.editor-space-text-board\.is-selected \.editor-space-text-board-type,[\s\S]*\.editor-space-text-board\.has-outgoing-connection \.editor-space-text-board-type,[\s\S]*\.editor-space-text-board\.is-connection-source \.editor-space-text-board-type[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-space-text-board-type svg[\s\S]*z-index: 1;[\s\S]*width: var\(--ai-plain-control-icon-size, 58%\)/);
  assert.match(cssSource, /\.editor-artboard-connection-path\.is-text-prompt-source[\s\S]*stroke: #346aa6/);
  assert.match(cssSource, /\.editor-stage\.text-connection-dragging \.editor-ai-image-board\.is-plain-artboard\.is-connection-drop-target \.editor-ai-image-board-input[\s\S]*background: #346aa6/);
  assert.match(cssSource, /\.editor-space-text-board\.is-transparent-background \.editor-space-text-board-shell[\s\S]*background: transparent/);
  assert.match(cssSource, /\.editor-space-text-board-editor[\s\S]*caret-color: transparent/);
  assert.match(cssSource, /\.editor-space-text-board\.is-editing \.editor-space-text-board-editor[\s\S]*caret-color: auto/);
  assert.match(cssSource, /\.editor-space-text-board-scroll\.is-overflowing[\s\S]*mask-image/);
  assert.match(cssSource, /\.editor-space-text-board-resize-handle[\s\S]*width: var\(--text-prompt-resize-handle, 30px\)/);
  assert.match(cssSource, /\.editor-text-prompt-toolbar[\s\S]*position: absolute/);
  assert.match(cssSource, /\.editor-text-prompt-toolbar\.editor-ai-image-board-action-toolbar[\s\S]*z-index: 90/);
  assert.match(cssSource, /\.editor-text-prompt-toolbar:not\(\.is-mobile\) \{[\s\S]*display: none;/);
  assert.match(cssSource, /\.editor-text-prompt-toolbar\.is-mobile \{[\s\S]*position: fixed;[\s\S]*bottom: calc\(var\(--cbo-mobile-floating-bottom\) \+ 28px\);[\s\S]*z-index: 9030;/);
  assert.match(cssSource, /\.editor-text-prompt-toolbar\.is-mobile \.editor-text-prompt-mobile-move-button \{[\s\S]*display: inline-grid;/);
  assert.match(cssSource, /\.editor-text-prompt-color-control[\s\S]*grid-template-columns: 18px 14px/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay[\s\S]*position: fixed/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay[\s\S]*place-items: center/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay[\s\S]*background: rgba\(12, 12, 14, 0\.62\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-shell[\s\S]*width: min\(1232px, calc\(100vw - 80px\)\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-shell[\s\S]*border-radius: 14px/);
  assert.match(cssSource, /\.editor-text-prompt-focus-header[\s\S]*height: 40px/);
  assert.match(cssSource, /\.editor-text-prompt-focus-header[\s\S]*background: rgba\(58, 58, 58, 0\.92\)/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.editor-text-prompt-focus-header \{[\s\S]*flex-basis: calc\(104px \+ env\(safe-area-inset-top, 0px\)\)[\s\S]*height: calc\(104px \+ env\(safe-area-inset-top, 0px\)\)[\s\S]*min-height: calc\(104px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay\.is-transparent-background \.editor-text-prompt-focus-body[\s\S]*background: rgba\(255, 255, 255, 0\.22\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay\.is-transparent-background \.editor-text-prompt-focus-body[\s\S]*backdrop-filter: blur\(28px\) saturate\(1\.2\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-overlay\.is-transparent-background \.editor-text-prompt-focus-shell[\s\S]*background: rgba\(255, 255, 255, 0\.16\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-editor[\s\S]*font-size: var\(--text-prompt-focus-font-size, 24px\)/);
  assert.match(cssSource, /\.editor-text-prompt-focus-editor[\s\S]*line-height: var\(--text-prompt-focus-line-height, 37\.2px\)/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.editor-text-prompt-focus-editor \{[\s\S]*font-size: var\(--text-prompt-focus-mobile-font-size, 18px\)[\s\S]*line-height: var\(--text-prompt-focus-mobile-line-height, 27\.9px\)/);
});

test("AI image boards expose a responsive create with AI preview shell", () => {
  const connectionsSource = readArtboardConnectionSources();
  const cssSource = readRepoFile("css", "layout.css");

  assert.match(connectionsSource, /function getAiImageBoardEditPreviewMedia\(board\)/);
  assert.match(connectionsSource, /board\.type !== "ai-image" \|\| !shouldUsePlainAiBoardArtboards\(\)/);
  assert.match(connectionsSource, /const media = getAiImageBoardEnlargeMedia\(board\)/);
  assert.match(connectionsSource, /src: media\?\.src \|\| ""/);
  assert.match(connectionsSource, /function isAiImageBoardEditPreviewViewportAllowed\(\)/);
  assert.match(connectionsSource, /return viewportWidth >= AI_IMAGE_ENLARGE_MIN_VIEWPORT_PX/);
  assert.doesNotMatch(connectionsSource, /isAiImageBoardEditPreviewDesktopViewport/);
  assert.doesNotMatch(connectionsSource, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/);
  assert.match(connectionsSource, /function ensureAiImageBoardEditPreviewViewer\(\)/);
  assert.match(connectionsSource, /function openAiImageBoardEditPreview\(boardId\)/);
  assert.match(connectionsSource, /function closeAiImageBoardEditPreview\(\)/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-viewer/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-shell/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-close/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-image/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-video/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-dimensions/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-input/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-menu/);
  assert.match(connectionsSource, /editor-ai-image-edit-preview-prompt-menu-grid/);
  assert.match(connectionsSource, /editor-ai-image-edit-preview-prompt-menu-swatch/);
  assert.match(connectionsSource, /editor-ai-image-edit-preview-prompt-menu-label/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-preset="Solar Mist"/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-preset-tone="chrome"/);
  assert.match(connectionsSource, /aria-label="Use Solar Mist preset"/);
  assert.match(connectionsSource, /Solar Mist/);
  assert.match(connectionsSource, /Chrome Pop/);
  assert.match(connectionsSource, /Nova Dust/);
  assert.match(connectionsSource, /contenteditable="true"/);
  assert.match(connectionsSource, /data-placeholder="What do you want to create\?"/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-token/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-token-remove/);
  assert.match(connectionsSource, /<circle cx="12" cy="12" r="10"><\/circle>/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-prompt-menu-toggle/);
  assert.match(connectionsSource, /aria-controls="editor-ai-image-edit-preview-prompt-menu"/);
  assert.match(connectionsSource, /data-ai-image-edit-preview-send/);
  assert.match(connectionsSource, /Create with AI/);
  assert.match(connectionsSource, /Create video with AI/);
  assert.match(connectionsSource, /Generate video/);
  assert.match(connectionsSource, /What do you want to create\?/);
  assert.match(connectionsSource, /getAiVideoBoardFixedCanvasPreviewSrc\(generatedMedia\)/);
  assert.match(connectionsSource, /getAiVideoBoardPosterSrc\(generatedMedia, AI_VIDEO_CANVAS_PREVIEW_LOD\)/);
  assert.match(connectionsSource, /viewer\.classList\.toggle\("is-video-preview", isVideo\)/);
  assert.match(connectionsSource, /--editor-ai-image-edit-preview-media-aspect/);
  assert.match(connectionsSource, /video\.play\?\.\(\)/);
  assert.match(connectionsSource, /function getAiImageBoardPromptText\(board\)/);
  assert.match(connectionsSource, /function normalizeAiImagePromptParts\(parts\)/);
  assert.match(connectionsSource, /function getIncomingConnectionsForSpaceBoard\(boardId\)[\s\S]*const normalizedBoardId = String\(boardId \|\| ""\)\.trim\(\)/);
  assert.match(connectionsSource, /function closeAiImageBoardViewsForBoard\(boardId\)[\s\S]*const normalizedBoardId = String\(boardId \|\| ""\)\.trim\(\)/);
  assert.match(connectionsSource, /function serializeAiImageEditPreviewPromptEditor\(editor\)/);
  assert.match(connectionsSource, /function renderAiImageEditPreviewPromptEditor\(editor, board\)/);
  assert.match(connectionsSource, /function setAiImageBoardPromptText\(board, value, options = \{\}\)/);
  assert.match(connectionsSource, /board\.captionText = nextValue/);
  assert.match(connectionsSource, /board\.promptParts = nextParts/);
  assert.match(connectionsSource, /function syncAiImageBoardPromptTextControls\(board, options = \{\}\)/);
  assert.match(connectionsSource, /function syncAiImageEditPreviewPromptToBoard\(editor\)/);
  assert.match(connectionsSource, /setAiImageBoardPromptText\(board, serialized\.text/);
  assert.match(connectionsSource, /promptParts: serialized\.parts/);
  assert.match(connectionsSource, /promptParts: \[\]/);
  assert.match(connectionsSource, /function setAiImageEditPreviewPromptMenuOpen\(viewer, open\)/);
  assert.match(connectionsSource, /button\.setAttribute\("aria-expanded", shouldOpen \? "true" : "false"\)/);
  assert.match(connectionsSource, /viewer\.classList\.toggle\("is-prompt-menu-open", shouldOpen\)/);
  assert.match(connectionsSource, /function handleAiImageEditPreviewPromptMenuTogglePointerDown\(event\)/);
  assert.match(connectionsSource, /function handleAiImageEditPreviewPromptMenuToggleClick\(event\)/);
  assert.match(connectionsSource, /setAiImageEditPreviewPromptMenuOpen\(viewer, Boolean\(menu\?\.hidden\)\)/);
  assert.match(connectionsSource, /function insertAiImageEditPreviewPromptPreset\(editor, presetName\)/);
  assert.match(connectionsSource, /function saveAiImageEditPreviewPromptSelection\(editor\)/);
  assert.match(connectionsSource, /function handleAiImageEditPreviewPromptMenuClick\(event\)/);
  assert.match(connectionsSource, /setAiImageEditPreviewPromptMenuOpen\(viewer, false\)/);
  assert.match(connectionsSource, /function removeAiImageEditPreviewPromptToken\(removeButton\)/);
  assert.match(connectionsSource, /source: "ai-image-edit-preview-prompt-preset"/);
  assert.match(connectionsSource, /requestAiImageBoardGeneration\(board\.id, "ai-image-edit-preview"\)/);
  assert.match(connectionsSource, /viewer\.classList\.toggle\("is-generating", isGenerating\)/);
  assert.match(connectionsSource, /frame\?\.classList\.toggle\("is-generating", isGenerating\)/);
  assert.match(connectionsSource, /closeAiImageBoardEnlargeViewer\(\)/);
  assert.match(connectionsSource, /window\.addEventListener\("keydown", handleAiImageBoardEditPreviewKeyDown, true\)/);
  assert.match(connectionsSource, /window\.removeEventListener\("keydown", handleAiImageBoardEditPreviewKeyDown, true\)/);
  assert.match(connectionsSource, /\[data-ai-image-edit-preview-close\]"\)\?\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(connectionsSource, /\[data-ai-image-edit-preview-prompt-input\]"\)\?\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(connectionsSource, /closeAiImageBoardEditPreview\(\);/);
  assert.match(connectionsSource, /\[data-ai-image-edit-preview-viewer\]/);

  assert.match(cssSource, /body\.editor-ai-image-edit-preview-open[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer \{[\s\S]*position: fixed/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer \{[\s\S]*place-items: center/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\[hidden\][\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-shell[\s\S]*width: min\(1232px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-shell[\s\S]*position: relative/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-shell[\s\S]*border-radius: 14px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-header[\s\S]*height: 40px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*position: absolute/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*left: 6px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*width: min\(320px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*padding: 16px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*border: 1px solid rgba\(17, 17, 17, 0\.12\)/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu[\s\S]*box-shadow:[\s\S]*0 12px 32px rgba\(17, 17, 17, 0\.10\)/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu\[hidden\][\s\S]*display: none/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu-item[\s\S]*cursor: pointer/);
  assert.match(cssSource, /data-ai-image-edit-preview-prompt-preset-tone="chrome"/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu-swatch[\s\S]*aspect-ratio: 1 \/ 1/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-menu-label[\s\S]*text-align: center/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-body[\s\S]*background: #ffffff/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-image[\s\S]*max-width: min\(462px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-body[\s\S]*padding-top: 24px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-media-frame[\s\S]*align-self: center/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-media-frame[\s\S]*aspect-ratio: var\(--editor-ai-image-edit-preview-media-ratio/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-media-frame[\s\S]*var\(--editor-ai-image-edit-preview-media-aspect/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-video[\s\S]*background: #111111/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-video[\s\S]*width: 100%/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-video[\s\S]*height: 100%/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-video[\s\S]*object-fit: contain/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-media-frame\.is-empty::before[\s\S]*border: 1px dashed/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-media-frame\.is-empty::before[\s\S]*box-sizing: border-box/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-media-frame\.is-empty\.is-generating::before[\s\S]*animation: editor-ai-image-edit-preview-loading-sweep 1200ms/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-media-frame\.is-generating::after[\s\S]*content: "Generating\.\.\."/);
  assert.match(cssSource, /@keyframes editor-ai-image-edit-preview-loading-sweep/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt[\s\S]*width: min\(640px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-token[\s\S]*display: inline-flex/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-token[\s\S]*backdrop-filter: blur\(18px\)/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-token-remove[\s\S]*margin-left: 7px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-token-remove svg[\s\S]*width: 13px/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-input:empty::before[\s\S]*content: attr\(data-placeholder\)/);
  assert.match(cssSource, /button\.editor-ai-image-edit-preview-chip[\s\S]*cursor: pointer/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-prompt-input[\s\S]*white-space: pre-wrap/);
  assert.doesNotMatch(cssSource, /\.editor-ai-image-edit-preview-toolstrip/);
  assert.match(cssSource, /\.editor-ai-image-edit-preview-meta[\s\S]*position: absolute/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-viewer[\s\S]*padding: 10px/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-header[\s\S]*env\(safe-area-inset-top/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-prompt-menu[\s\S]*top: calc\(54px \+ env\(safe-area-inset-top/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-prompt-input[\s\S]*font-size: 16px/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-send[\s\S]*width: 38px/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-media-frame\.is-empty::before[\s\S]*width: min\(calc\(100% - 4px\)/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-image[\s\S]*max-height: min\(100%, 46vh/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-body[\s\S]*grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-media-frame[\s\S]*100dvh - 420px/);
  assert.match(cssSource, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 900px\) \{[\s\S]*\.editor-ai-image-edit-preview-viewer\.is-video-preview \.editor-ai-image-edit-preview-video[\s\S]*height: 100%/);
});

test("layers panel mirrors artboards as collapsed artboard groups", () => {
  const layersSource = readRepoFile("js", "layers-panel.js");
  const layerModelSource = readRepoFile("js", "document", "document-layer-model.js");
  const cssSource = readRepoFile("css", "layers-panel.css");

  assert.match(layersSource, /function ensureArtboardLayerGroups\(source = "layers-panel-artboards"\)/);
  assert.match(layersSource, /artboardGroup: true/);
  assert.match(layersSource, /window\.CBO\.getDocumentArtboards\?\.\(\)/);
  assert.match(layersSource, /window\.addEventListener\("cbo:document-artboards-change"/);
  assert.match(layersSource, /window\.addEventListener\("cbo:artboard-preview-change"/);
  assert.match(layersSource, /function getCurrentArtboardLayerEntry\(\)/);
  assert.match(layersSource, /activeArtboardChildren\.prepend\(entry\)/);
  assert.match(layersSource, /expandArtboardLayerEntry\(activeArtboardEntry\)/);
  assert.match(layersSource, /state\.artboardGroup === true[\s\S]*<svg\b/);
  assert.match(layersSource, /layerEntry\.classList\.toggle\("collapsed", shouldCollapse\)/);
  assert.match(cssSource, /\.layer-artboard-row/);
  assert.match(layerModelSource, /entry\.artboardGroup === true/);
  assert.match(layerModelSource, /resolveInsertionArtboardId\(activeEntry, options\)/);
  assert.match(layerModelSource, /insertAtTopOfArtboard\(targetArtboardId, paintLayer\)/);
});

test("selection tool highlights the clicked artboard and its layer group only", () => {
  const previewSource = readRepoFile("js", "artboard-preview.js");
  const layersSource = readRepoFile("js", "layers-panel.js");
  const layoutSource = readRepoFile("css", "layout.css");
  const layerCssSource = readRepoFile("css", "layers-panel.css");

  assert.match(previewSource, /const SELECTION_TOOL_MODE = "selection"/);
  assert.match(previewSource, /function handleStagePointerDown\(event\)/);
  assert.match(previewSource, /if \(!isArtboardSelectionEnabled\(\)\) \{/);
  assert.match(previewSource, /cbo:artboard-selection-change/);
  assert.match(previewSource, /frame\.classList\.toggle\("is-selected", isSelected\)/);
  assert.match(previewSource, /namespace\.selectPreviewArtboard = function selectPreviewArtboard/);
  assert.match(previewSource, /namespace\.clearPreviewArtboardSelection = function clearPreviewArtboardSelection/);
  assert.match(previewSource, /namespace\.deletePreviewArtboard = function deletePreviewArtboardFromTool/);
  assert.match(previewSource, /namespace\.movePreviewArtboard = function movePreviewArtboardFromTool/);
  assert.match(previewSource, /cbo:document-artboard-selection-change/);
  assert.match(previewSource, /source: "artboard-preview-stage-empty-pointer"/);
  assert.match(layoutSource, /\.editor-artboard-frame\.is-selected/);

  assert.match(layersSource, /let selectedArtboardGroupId = ""/);
  assert.match(layersSource, /function isArtboardSelectionEnabled\(\)/);
  assert.match(layersSource, /function applyArtboardGroupActivationById\(groupId, options = \{\}\)/);
  assert.match(layersSource, /function deleteSelectedArtboardGroup\(\)/);
  assert.match(layersSource, /row\.classList\.toggle\("artboard-active", isActiveArtboard\)/);
  assert.match(layersSource, /: getArtboardLayerGroupId\("active-document"\)/);
  assert.match(layersSource, /window\.addEventListener\("cbo:artboard-selection-change", handleArtboardSelectionChange\)/);
  assert.match(layersSource, /window\.CBO\.selectPreviewArtboard\?\.\(artboardId/);
  assert.match(layersSource, /window\.CBO\.clearPreviewArtboardSelection\?\.\(/);
  assert.match(layersSource, /window\.CBO\.deletePreviewArtboard\?\.\(artboardId/);
  assert.match(layersSource, /artboardId === "active-document"/);
  assert.match(layersSource, /!getSelectedRootEntries\(\)\.length && selectedArtboardGroupId/);
  assert.match(layerCssSource, /\.layer-artboard-row\.artboard-active/);
});

test("preview artboards can be dragged from their title labels", () => {
  const previewSource = readRepoFile("js", "artboard-preview.js");
  const connectionsSource = readArtboardConnectionSources();
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(previewSource, /let artboardDragState = null/);
  assert.match(previewSource, /function getArtboardLabelAtClientPoint\(clientX, clientY\)/);
  assert.match(previewSource, /function startArtboardDrag\(event, artboard\)/);
  assert.match(previewSource, /artboard\.isPrimary === true/);
  assert.match(previewSource, /ARTBOARD_LABEL_FONT_RATIO = 0\.036/);
  assert.match(previewSource, /ARTBOARD_LABEL_HEIGHT_RATIO = 1\.35/);
  assert.match(previewSource, /ARTBOARD_LABEL_TOP_GAP_RATIO = 0\.32/);
  assert.match(previewSource, /ARTBOARD_FRAME_BORDER_DOC_PX = 2/);
  assert.match(previewSource, /ARTBOARD_FRAME_ACTIVE_BORDER_DOC_PX = 1/);
  assert.match(previewSource, /ARTBOARD_FRAME_SELECTED_RING_DOC_PX = 2/);
  assert.match(previewSource, /const labelScale = Math\.max\(0\.0001, zoom \/ dpr\)/);
  assert.match(previewSource, /function getBoardLabelReferenceSideDoc\(width, height\)/);
  assert.match(previewSource, /const labelSide = getBoardLabelReferenceSideDoc\(width, height\)/);
  assert.match(previewSource, /function getArtboardLabelMetrics\(width, height, scale = 1\)/);
  assert.match(previewSource, /function getArtboardFrameMetrics\(scale = 1\)/);
  assert.match(previewSource, /--editor-artboard-label-font-size/);
  assert.match(previewSource, /--editor-artboard-frame-border-width/);
  assert.match(previewSource, /--editor-artboard-frame-selected-ring-width/);
  assert.match(connectionsSource, /ARTBOARD_LABEL_FONT_RATIO = 0\.036/);
  assert.match(connectionsSource, /ARTBOARD_LABEL_HEIGHT_RATIO = 1\.35/);
  assert.match(connectionsSource, /ARTBOARD_LABEL_TOP_GAP_RATIO = 0\.32/);
  assert.match(connectionsSource, /function getBoardLabelReferenceSideDoc\(width, height/);
  assert.match(connectionsSource, /const labelSide = getBoardLabelReferenceSideDoc\(width, height\)/);
  assert.match(connectionsSource, /const labelMetrics = getArtboardLabelMetrics\(AI_IMAGE_BOARD_SIZE_DOC_PX, AI_IMAGE_BOARD_SIZE_DOC_PX, labelScale\)/);
  assert.match(connectionsSource, /function getArtboardLabelMetrics\(width, height, scale = 1\)/);
  assert.match(connectionsSource, /--editor-artboard-label-font-size/);
  assert.match(layoutSource, /\.editor-artboard-frame-label[\s\S]*font-size: var\(--editor-artboard-label-font-size, 10px\)/);
  assert.match(layoutSource, /\.editor-artboard-frame-label[\s\S]*transform: none/);
  assert.match(layoutSource, /\.editor-artboard-frame \{[\s\S]*border: var\(--editor-artboard-frame-border-width, 2px\) solid/);
  assert.match(layoutSource, /\.editor-artboard-frame\.is-active \{[\s\S]*border-width: var\(--editor-artboard-frame-active-border-width, 1px\)/);
  assert.match(layoutSource, /\.editor-artboard-frame\.is-selected \{[\s\S]*var\(--editor-artboard-frame-selected-shadow-y, 10px\)/);
  assert.match(layoutSource, /\.editor-artboard-frame\.is-selected \{[\s\S]*var\(--editor-artboard-frame-selected-ring-width, 2px\)/);
  assert.match(layoutSource, /\.editor-ai-image-board-label[\s\S]*font-size: var\(--editor-space-board-label-font-size, 10px\)/);
  assert.match(layoutSource, /\.editor-ai-image-board-label[\s\S]*transform: none/);
  assert.match(previewSource, /function updateArtboardDrag\(event\)/);
  assert.match(previewSource, /renderer\?\.beginArtboardDragPreview\?\.\(/);
  assert.match(previewSource, /namespace\.vectorTextRenderer\?\.beginArtboardDragPreview\?\.\(/);
  assert.match(previewSource, /getRenderer\(\)\?\.setArtboardDragPreview\?\.\(/);
  assert.match(previewSource, /namespace\.vectorTextRenderer\?\.setArtboardDragPreview\?\.\(/);
  assert.match(previewSource, /namespace\.constrainDocumentArtboardMove\?\.\(/);
  assert.match(previewSource, /applyArtboardDragDomTransform\(artboardDragState\.artboardId, dx, dy\)/);
  assert.match(previewSource, /getRenderer\(\)\?\.clearArtboardDragPreview\?\.\(state\.artboardId\)/);
  assert.match(previewSource, /namespace\.vectorTextRenderer\?\.clearArtboardDragPreview\?\.\(state\.artboardId\)/);
  assert.match(previewSource, /namespace\.commitArtboardMoveWithContents\?\.\(state\.artboardId, dx, dy/);
  assert.doesNotMatch(previewSource, /movePreviewArtboard\(artboardDragState\.artboardId, nextX, nextY/);
  assert.match(previewSource, /emitArtboardPreviewChange\("artboard-preview-label-drag"\)/);
  assert.match(previewSource, /stage\.addEventListener\("pointermove", updateArtboardDrag, true\)/);
  assert.match(previewSource, /function renamePreviewArtboards\(\)/);
  assert.doesNotMatch(previewSource, /artboard\.x = Math\.round\(previous\.x \+ previous\.width \+ PREVIEW_ARTBOARD_GAP\)/);
  assert.match(layoutSource, /\.editor-stage\.artboard-label-hover/);
  assert.match(layoutSource, /\.editor-stage\.artboard-dragging/);
});

test("document artboard model owns artboard records and persistence hooks", () => {
  const modelSource = readRepoFile("js", "document", "document-artboard-model.js");
  const editorCanvasSource = readRepoFile("js", "editor-canvas.js");
  const autosaveSource = readRepoFile("js", "document", "document-autosave.js");
  const rendererSource = readDocumentRendererSources();

  assert.match(modelSource, /class DocumentArtboardModel extends EventTarget/);
  assert.match(modelSource, /const PRIMARY_ARTBOARD_ID = "active-document"/);
  assert.match(modelSource, /createPrimaryArtboard/);
  assert.match(modelSource, /createSecondaryArtboard/);
  assert.match(modelSource, /window\.dispatchEvent\(new CustomEvent\("cbo:document-artboards-change"/);
  assert.match(modelSource, /window\.dispatchEvent\(new CustomEvent\("cbo:document-artboard-selection-change"/);
  assert.match(modelSource, /namespace\.getDocumentArtboards = function getDocumentArtboards/);
  assert.match(modelSource, /namespace\.moveDocumentArtboard = function moveDocumentArtboard/);
  assert.match(modelSource, /namespace\.getDocumentArtboardMinimumGap = function getDocumentArtboardMinimumGap/);
  assert.match(modelSource, /namespace\.constrainDocumentArtboardMove = function constrainDocumentArtboardMove/);
  assert.match(modelSource, /namespace\.wouldDocumentArtboardOverlap = function wouldDocumentArtboardOverlap/);
  assert.match(modelSource, /namespace\.commitArtboardMoveWithContents = function commitArtboardMoveWithContents/);
  assert.match(modelSource, /namespace\.applyDocumentArtboardMoveWithContents = function applyDocumentArtboardMoveWithContents/);
  assert.match(modelSource, /namespace\.deleteDocumentArtboard = function deleteDocumentArtboard/);
  assert.match(modelSource, /namespace\.getDocumentArtboardAtPoint = function getDocumentArtboardAtPoint/);
  assert.match(modelSource, /namespace\.selectDocumentArtboardAtPoint = function selectDocumentArtboardAtPoint/);
  assert.match(modelSource, /namespace\.artboardSelectionEnabled = true/);
  assert.match(modelSource, /function isArtboardSelectionEnabled\(\)/);
  assert.match(modelSource, /namespace\.getActiveDocumentArtboardRect = function getActiveDocumentArtboardRect/);
  assert.match(modelSource, /namespace\.getDocumentArtboardUnionRect = function getDocumentArtboardUnionRect/);
  assert.match(modelSource, /namespace\.getActiveDocumentArtboardCoverageRects = function getActiveDocumentArtboardCoverageRects/);
  assert.match(modelSource, /function getExternalArtboardCollisionRects\(\)/);
  assert.match(modelSource, /namespace\.getArtboardConnectionBoardCollisionRects\?\.\(\)/);

  assert.match(editorCanvasSource, /DocumentArtboardModel non caricato/);
  assert.match(editorCanvasSource, /window\.CBO\.resetDocumentArtboards\?\.\(\{/);
  assert.match(editorCanvasSource, /artboards: options\.artboards/);
  assert.match(editorCanvasSource, /defaultSecondaryCount: 0/);
  assert.match(autosaveSource, /artboards: namespace\.getDocumentArtboards\?\.\(\) \|\| \[\]/);
  assert.match(autosaveSource, /function getSessionArtboards\(session\)/);
  assert.match(autosaveSource, /cloneValue\(session\.document\.artboards\)/);
  assert.match(autosaveSource, /restoreSessionArtboards\(session\)/);
  assert.match(autosaveSource, /namespace\.ensureDocumentLayerArtboardGroups\?\.\(\{/);
  assert.match(autosaveSource, /defaultSecondaryCount: 0/);
  assert.match(autosaveSource, /source = "autosave-restore-artboards"/);
  assert.match(rendererSource, /getDocumentBoundsRect\(\)/);
  assert.match(rendererSource, /namespace\.getDocumentArtboardUnionRect\?\.\(\)/);
  assert.match(rendererSource, /const documentRect = this\.getDocumentBoundsRect\(\)/);
  assert.match(rendererSource, /this\.artboardDragPreview = null/);
  assert.match(rendererSource, /beginArtboardDragPreview\(options = \{\}\)/);
  assert.match(rendererSource, /getArtboardDragVisualRect\(layer, rect = null, layerTarget = null\)/);
  assert.match(rendererSource, /getLayerArtboardVisualRect\(layer\)/);
  assert.match(rendererSource, /const withLayerArtboardClip = \(layer, callback\) =>/);
  assert.match(rendererSource, /const artboardScissor = getViewportScissorForDocumentRect\(artboardRect\)/);
  assert.match(rendererSource, /const hasArtboardDragPreview = this\.hasArtboardDragPreview\(\)/);
  assert.match(rendererSource, /!hasArtboardDragPreview/);
  assert.match(rendererSource, /translateRasterTargetsByLayerIds\(layerIds = \[\], dx = 0, dy = 0/);

  const layerModelSource = readRepoFile("js", "document", "document-layer-model.js");

  assert.match(layerModelSource, /getArtboardContentLayerIds\(artboardId\)/);
  assert.match(layerModelSource, /translateLayersByIds\(layerIds = \[\], dx = 0, dy = 0/);
  assert.match(layerModelSource, /translateDocumentRect\(entry\.imageBounds, dx, dy\)/);
});

test("artboard moves are constrained before they violate the minimum artboard gap", () => {
  const namespace = loadDocumentArtboardNamespace();
  const minGap = namespace.getDocumentArtboardMinimumGap();

  namespace.resetDocumentArtboards({
    artboards: [
      {
        height: 100,
        id: "active-document",
        isPrimary: true,
        name: "Artboard 1",
        width: 100,
        x: 0,
        y: 0,
      },
      {
        height: 50,
        id: "left",
        name: "Left",
        width: 50,
        x: 200,
        y: 0,
      },
      {
        height: 50,
        id: "right",
        name: "Right",
        width: 50,
        x: 300,
        y: 0,
      },
    ],
    defaultSecondaryCount: 0,
    documentHeight: 100,
    documentWidth: 100,
    source: "unit-artboard-collision",
  });

  const previewDelta = namespace.constrainDocumentArtboardMove("left", 80, 0);

  assert.equal(previewDelta.blocked, true);
  assert.ok(previewDelta.dx > 17.9);
  assert.ok(previewDelta.dx <= 18);
  assert.equal(previewDelta.dy, 0);
  assert.equal(namespace.wouldDocumentArtboardOverlap("left", 80, 0), true);

  const commitResult = namespace.commitArtboardMoveWithContents("left", 80, 0, {
    history: false,
    source: "unit-artboard-collision",
  });

  assert.notEqual(commitResult, false);
  assert.equal(commitResult.dx, 18);
  assert.equal(commitResult.dy, 0);
  assert.equal(namespace.getDocumentArtboardById("left").x, 218);
  assert.equal(
    namespace.getDocumentArtboardById("left").x + 50 + minGap,
    namespace.getDocumentArtboardById("right").x,
  );

  namespace.moveDocumentArtboard("left", 280, 0, {
    source: "unit-artboard-collision-direct-move",
  });

  assert.equal(namespace.getDocumentArtboardById("left").x, 218);
});

test("overlapped artboards can only move toward a resolved placement", () => {
  const namespace = loadDocumentArtboardNamespace();

  namespace.resetDocumentArtboards({
    artboards: [
      {
        height: 100,
        id: "active-document",
        isPrimary: true,
        name: "Artboard 1",
        width: 100,
        x: 0,
        y: 0,
      },
      {
        height: 50,
        id: "left",
        name: "Left",
        width: 100,
        x: 240,
        y: 0,
      },
      {
        height: 50,
        id: "right",
        name: "Right",
        width: 100,
        x: 300,
        y: 0,
      },
    ],
    defaultSecondaryCount: 0,
    documentHeight: 100,
    documentWidth: 100,
    source: "unit-artboard-overlap-recovery",
  });

  namespace.moveDocumentArtboard("left", 250, 0, {
    source: "unit-artboard-overlap-recovery-more-overlap",
  });

  assert.equal(namespace.getDocumentArtboardById("left").x, 240);

  const reducingDelta = namespace.constrainDocumentArtboardMove("left", -20, 0);

  assert.equal(reducingDelta.blocked, true);
  assert.equal(reducingDelta.dx, -20);

  const partialRecovery = namespace.commitArtboardMoveWithContents("left", -20, 0, {
    history: false,
    source: "unit-artboard-overlap-recovery-partial",
  });

  assert.notEqual(partialRecovery, false);
  assert.equal(namespace.getDocumentArtboardById("left").x, 220);
  assert.equal(namespace.wouldDocumentArtboardOverlap("left", -60, 0), false);

  const fullRecovery = namespace.commitArtboardMoveWithContents("left", -60, 0, {
    history: false,
    source: "unit-artboard-overlap-recovery-full",
  });

  assert.notEqual(fullRecovery, false);
  assert.equal(namespace.getDocumentArtboardById("left").x, 160);
});

test("new artboard creation uses requested size and skips occupied slots", () => {
  const namespace = loadDocumentArtboardNamespace();

  namespace.resetDocumentArtboards({
    artboards: [
      {
        height: 100,
        id: "active-document",
        isPrimary: true,
        name: "Artboard 1",
        width: 100,
        x: 0,
        y: 0,
      },
      {
        height: 180,
        id: "selected",
        name: "Selected",
        width: 240,
        x: 200,
        y: 0,
      },
      {
        height: 180,
        id: "right-blocker",
        name: "Right blocker",
        width: 240,
        x: 696,
        y: 0,
      },
    ],
    defaultSecondaryCount: 0,
    documentHeight: 100,
    documentWidth: 100,
    source: "unit-artboard-create-placement",
  });
  namespace.artboardSelectionEnabled = true;
  namespace.selectDocumentArtboard("selected", { emit: false });

  const copied = namespace.createDocumentArtboard({
    source: "unit-artboard-create-placement",
  });

  assert.equal(copied.width, 240);
  assert.equal(copied.height, 180);
  assert.equal(copied.x, 200);
  assert.equal(copied.y, 436);

  const custom = namespace.createDocumentArtboard({
    height: 654,
    source: "unit-artboard-create-custom-size",
    sourceArtboardId: "selected",
    width: 321,
  });

  assert.equal(custom.width, 321);
  assert.equal(custom.height, 654);
  assert.equal(namespace.getDocumentArtboards().length, 5);
});

test("new artboard creation avoids AI image board collision rects", () => {
  const namespace = loadDocumentArtboardNamespace();

  namespace.resetDocumentArtboards({
    artboards: [
      {
        height: 100,
        id: "active-document",
        isPrimary: true,
        name: "Artboard 1",
        width: 100,
        x: 0,
        y: 0,
      },
      {
        height: 180,
        id: "selected",
        name: "Selected",
        width: 240,
        x: 200,
        y: 0,
      },
    ],
    defaultSecondaryCount: 0,
    documentHeight: 100,
    documentWidth: 100,
    source: "unit-artboard-create-external-placement",
  });
  namespace.artboardSelectionEnabled = true;
  namespace.selectDocumentArtboard("selected", { emit: false });
  namespace.getArtboardConnectionBoardCollisionRects = () => [
    {
      height: 1024,
      width: 1024,
      x: 696,
      y: 0,
    },
  ];

  const created = namespace.createDocumentArtboard({
    source: "unit-artboard-create-external-placement",
  });

  assert.equal(created.width, 240);
  assert.equal(created.height, 180);
  assert.equal(created.x, 200);
  assert.equal(created.y, 436);
});

test("created artboards undo and redo their generated layer groups", () => {
  const { history, layerModel, namespace } = loadDocumentArtboardHistoryNamespace();

  namespace.resetDocumentArtboards({
    artboards: [
      {
        height: 100,
        id: "active-document",
        isPrimary: true,
        name: "Artboard 1",
        width: 100,
        x: 0,
        y: 0,
      },
    ],
    defaultSecondaryCount: 0,
    documentHeight: 100,
    documentWidth: 100,
    source: "unit-artboard-history-seed",
  });
  namespace.ensureDocumentLayerArtboardGroups({
    history: false,
    source: "unit-artboard-history-seed-groups",
  });

  assert.equal(history.undoStack.length, 0);
  assert.ok(layerModel.findEntryById("artboard-group-active-document"));

  const created = namespace.createDocumentArtboard({
    height: 90,
    id: "secondary",
    source: "unit-artboard-create-history",
    width: 80,
    x: 200,
    y: 0,
  });

  assert.equal(created.id, "secondary");
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].type, "artboard-create");
  assert.ok(namespace.getDocumentArtboardById("secondary"));
  assert.ok(layerModel.findEntryById("artboard-group-secondary"));
  assert.ok(layerModel.findEntryById("background-secondary"));

  assert.equal(history.undo(), true);
  assert.equal(namespace.getDocumentArtboardById("secondary"), null);
  assert.equal(layerModel.findEntryById("artboard-group-secondary"), null);
  assert.equal(layerModel.findEntryById("background-secondary"), null);

  assert.equal(history.redo(), true);
  assert.ok(namespace.getDocumentArtboardById("secondary"));
  assert.ok(layerModel.findEntryById("artboard-group-secondary"));
  assert.ok(layerModel.findEntryById("background-secondary"));
});
