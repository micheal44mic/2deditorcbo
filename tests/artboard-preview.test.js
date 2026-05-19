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
  const connectionsSource = readRepoFile("js", "artboard-connections.js");
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
  assert.match(connectionsSource, /function updateInfiniteCanvasDotGrid\(viewState = getCameraState\(\)\)/);
  assert.match(connectionsSource, /patternUnits: "userSpaceOnUse"/);
  assert.match(connectionsSource, /"shape-rendering": "crispEdges"/);
  assert.match(connectionsSource, /Math\.pow\(2, step \/ CANVAS_DOT_GRID_STEPS_PER_OCTAVE\)/);
  assert.match(connectionsSource, /updateInfiniteCanvasDotGrid\(viewState\)/);
  assert.match(connectionsSource, /function renderSpaceBoardPaneTransform\(\)/);
  assert.match(connectionsSource, /`matrix\(\$\{scale\}, 0, 0, \$\{scale\}, \$\{tx\}, \$\{ty\}\)`/);
  assert.match(connectionsSource, /const desiredParent = plainArtboardMode \? stage : pane/);
  assert.match(connectionsSource, /stage\.insertBefore\(svg, paperLayer \|\| null\)/);
  assert.match(connectionsSource, /function isSpaceBoardNearViewport\(board, marginDocPx = getSpaceBoardLazyMarginDocPx\(\)\)/);
  assert.match(connectionsSource, /function shouldMountAiImageBoardHeavyContent\(board, element\)/);
  assert.match(connectionsSource, /function getConnectionGeometryKey\(\)/);
  assert.match(connectionsSource, /svg\.dataset\.connectionGeometryKey === geometryKey/);
  assert.match(connectionsSource, /namespace\.renderArtboardConnectionOverlay = function renderArtboardConnectionOverlay/);
  assert.match(connectionsSource, /CONNECTION_CLICK_DISTANCE_CSS_PX = 220/);
  assert.match(connectionsSource, /data-artboard-connection-dismiss/);
  assert.doesNotMatch(connectionsSource, /addEventListener\("pointerdown", handleMenuDocumentPointerDown/);
  assert.match(connectionsSource, /addEventListener\("click", handleMenuDocumentClick, true\)/);
  assert.match(connectionsSource, /ignoreNextMenuDocumentClick = true/);
  assert.match(connectionsSource, /AI_IMAGE_BOARD_SIZE_DOC_PX = 1024/);
  assert.match(connectionsSource, /AI_IMAGE_INPUT_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX/);
  assert.match(connectionsSource, /AI_IMAGE_INPUT_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX/);
  assert.match(connectionsSource, /AI_IMAGE_GENERATE_HANDLE_SIZE_DOC_PX = ACTION_BUBBLE_SIZE_DOC_PX/);
  assert.match(connectionsSource, /AI_IMAGE_GENERATE_HANDLE_GAP_DOC_PX = ACTION_BUBBLE_GAP_DOC_PX/);
  assert.match(connectionsSource, /SPACE_BOARD_DRAG_GAP_DOC_PX = 24/);
  assert.match(connectionsSource, /function getAllowedSpaceBoardMove\(startFootprint, dx, dy, blockers = \[\]\)/);
  assert.match(connectionsSource, /function getActionBubbleMetrics\(scale = getViewScale\(\)\)/);
  assert.match(connectionsSource, /const rawSize = ACTION_BUBBLE_SIZE_DOC_PX \* safeScale/);
  assert.match(connectionsSource, /const size = Math\.max\(18, Math\.min\(34, Math\.round\(rawSize\)\)\)/);
  assert.match(connectionsSource, /const rawGap = ACTION_BUBBLE_GAP_DOC_PX \* safeScale/);
  assert.match(connectionsSource, /const gap = Math\.max\(6, Math\.min\(10, Math\.round\(rawGap \* 0\.25\)\)\)/);
  assert.doesNotMatch(connectionsSource, /clampNumber/);
  assert.match(connectionsSource, /SPACE_BOARD_GAP_DOC_PX = 220/);
  assert.match(connectionsSource, /function getAiImageBoardFootprintRect\(rect\)/);
  assert.match(connectionsSource, /function resolveFreeSpaceBoardPlacement\(preferredRect, options = \{\}\)/);
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
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_PLACEHOLDER = "Add text"/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_MIN_SCREEN_BOARD_PX = 140/);
  assert.match(connectionsSource, /AI_IMAGE_CAPTION_MAX_FONT_PX = 22/);
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
  assert.match(connectionsSource, /function scheduleAiImagePromptFocusViewport\(boardId\)/);
  assert.match(connectionsSource, /function focusAiImagePromptBoard\(boardId\)/);
  assert.match(connectionsSource, /\(window\.innerWidth \|\| 0\) <= 900/);
  assert.match(connectionsSource, /brushEngine\.camera\.x = nextCameraX/);
  assert.match(connectionsSource, /brushEngine\.camera\.y = nextCameraY/);
  assert.match(connectionsSource, /brushEngine\.requestDraw\?\.\(\)/);
  assert.match(connectionsSource, /board\.addEventListener\("wheel", handleSpaceBoardWheel, \{ passive: false \}\)/);
  assert.match(connectionsSource, /function handleSpaceBoardWheel\(event\)/);
  assert.match(connectionsSource, /brushEngine\.handleWheel\.call\(brushEngine, event\)/);
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
  assert.match(connectionsSource, /AI_IMAGE_UNSTABLE_RUNTIME_LODS = new Set\(\[512\]\)/);
  assert.match(connectionsSource, /AI_BOARD_PREVIEW_DEBUG_EVENT_LIMIT = 80/);
  assert.match(connectionsSource, /AI_IMAGE_RUNTIME_PREVIEW_CACHE_MAX_ENTRIES = 80/);
  assert.match(connectionsSource, /const AI_IMAGE_SAMPLE_ASSETS = \[/);
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
  assert.match(connectionsSource, /getAiImageSampleCandidates\(board\?\.generatedMedia\?\.src \|\| "", "image"\)/);
  assert.match(connectionsSource, /function loadFirstAvailableAiImageSampleMetadata\(samples\)/);
  assert.match(connectionsSource, /Fake AI sample failed, trying next sample/);
  assert.match(connectionsSource, /loadFirstAvailableAiImageSampleMetadata\(samples\)/);
  assert.match(connectionsSource, /video\.preload = "metadata"/);
  assert.match(connectionsSource, /function getAiImageBoardPreviewCssUrl\(src\)/);
  assert.match(connectionsSource, /function recordAiBoardPreviewDebugEvent\(eventName, detail = \{\}\)/);
  assert.match(connectionsSource, /function getAiBoardPreviewDebugSnapshot\(element, mediaHost\)/);
  assert.match(connectionsSource, /function getAiBoardPreviewDiagnosis\(mediaHost, activeLayer\)/);
  assert.match(connectionsSource, /function resolveAiImageBoardPreview\(media, recommendedLod\)/);
  assert.match(connectionsSource, /function requestAiImageRuntimePreviewVariant\(src, lod\)/);
  assert.match(connectionsSource, /buildAiImageRuntimePreviewVariant\(normalizedSrc, normalizedLod\)/);
  assert.match(connectionsSource, /function evictAiImageRuntimePreviewVariantsForSrc\(src\)/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_UP_HYSTERESIS = 1\.15/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_DOWN_HYSTERESIS = 0\.72/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_CROSSFADE_MS = 0/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_PAINT_FRAMES = 2/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_OLD_LAYER_RELEASE_FRAMES = 2/);
  assert.match(connectionsSource, /AI_IMAGE_PREVIEW_LOD_CAMERA_IDLE_MS = 240/);
  assert.match(connectionsSource, /function getStableAiBoardRecommendedLod\(board, screenWidth = 0, screenHeight = 0, dpr = 1, mediaHost = null\)/);
  assert.match(connectionsSource, /function preloadAiImageBoardRuntimeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /function shouldHoldAiImageBoardPreviewForPendingLod\(mediaHost, src, kind, preview\)/);
  assert.match(connectionsSource, /function getAiImageBoardActivePreviewLayer\(mediaHost\)/);
  assert.match(connectionsSource, /function hasAiImageBoardPaintedImagePreview\(mediaHost, src = "", kind = "image"\)/);
  assert.match(connectionsSource, /function ensureAiImageBoardImagePreviewLayers\(mediaHost\)/);
  assert.match(connectionsSource, /function decodeAiImageBoardPreviewLayer\(image, src\)/);
  assert.match(connectionsSource, /function waitAiImageBoardPreviewPaintFrames\(frameCount = AI_IMAGE_PREVIEW_PAINT_FRAMES\)/);
  assert.match(connectionsSource, /function commitAiImageBoardPreviewLayer\(mediaHost, incomingLayer, media, preview, previewKey, previewSrcForDataset, src, kind\)/);
  assert.match(connectionsSource, /function renderAiImageBoardImagePreview\(mediaHost, media, preview, src, kind, previewKey, previewSrcForDataset\)/);
  assert.match(connectionsSource, /function noteAiBoardCameraMotion\(camera, dpr\)/);
  assert.match(connectionsSource, /function getAiBoardHeldLodDuringCameraMotion\(mediaHost, media\)/);
  assert.doesNotMatch(connectionsSource, /function getAiBoardVisibleStickyLod/);
  assert.match(connectionsSource, /function shouldUseDataUrlRuntimePreview\(\)/);
  assert.match(connectionsSource, /function getAiBoardRuntimeSafeLod\(media, lod\)/);
  assert.match(connectionsSource, /AI_IMAGE_UNSTABLE_RUNTIME_LODS\.has\(Number\(requestedLod\)\)/);
  assert.doesNotMatch(connectionsSource, /ios-safari-runtime-lod/);
  assert.match(connectionsSource, /return getAiBoardRuntimeSafeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /const safeRecommendedLod = getAiBoardRuntimeSafeLod\(media, recommendedLod\)/);
  assert.match(connectionsSource, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(connectionsSource, /function probeAiImageRuntimePreviewCanvas\(canvas\)/);
  assert.match(connectionsSource, /function probeAiImagePreviewLayer\(image\)/);
  assert.match(connectionsSource, /error\.previewProbe = probe/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\(entry\.probe\?\.blank \? "runtime-preview-blank" : "runtime-preview-error"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-paint-probe"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-layer-blank"/);
  assert.match(connectionsSource, /previewSource: "runtime-error-original"/);
  assert.match(connectionsSource, /previewSource: "runtime-layer-blank-original"/);
  assert.match(connectionsSource, /sourceType: "data-url"/);
  assert.match(connectionsSource, /entry\.probe = result\.probe \|\| null/);
  assert.match(connectionsSource, /entry\.sourceType = result\.sourceType/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("runtime-preview-ready"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-swap-start"/);
  assert.match(connectionsSource, /recordAiBoardPreviewDebugEvent\("layer-swap-commit"/);
  assert.match(connectionsSource, /runtime-data-url/);
  assert.match(connectionsSource, /URL\.createObjectURL\(blobOrDataUrl\)/);
  assert.match(connectionsSource, /if \(neededPixels < 80\) \{\s*recommendedLod = "128";\s*\}/);
  assert.match(connectionsSource, /previewMode: "placeholder"/);
  assert.match(connectionsSource, /function shouldUnloadAiBoardMedia\(board, visibilityState, element\)/);
  assert.match(connectionsSource, /return visibilityState !== "visible" && !isSpaceBoardFocusedOrSelected\(board, element\)/);
  assert.match(connectionsSource, /const shouldUpdatePreviewLod = visibilityState === "visible"/);
  assert.match(connectionsSource, /const rawRecommendedLod = shouldUnloadMedia\s*\?\s*"unloaded"\s*:\s*shouldUpdatePreviewLod\s*\?\s*getAiBoardRecommendedLod/);
  assert.match(connectionsSource, /if \(shouldUpdatePreviewLod && rawRecommendedLod !== recommendedLod\) \{/);
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
  assert.match(connectionsSource, /<div class="editor-ai-image-board-media" data-ai-image-board-media><\/div>/);
  assert.match(connectionsSource, /documentPointToStagePoint\(\{ x: board\.x, y: board\.y \}, viewState\)/);
  assert.match(connectionsSource, /setStylePropertyIfChanged\(element, "transform", boardTransform\)/);
  assert.match(connectionsSource, /if \(\(plainArtboardMode \|\| isHeavyMounted\) && \(shouldUpdatePreviewLod \|\| shouldUnloadMedia \|\| !board\.generatedMedia\?\.src\)\) \{\s*renderAiImageBoardGeneratedMedia\(element, board, \{ recommendedLod \}\)/);
  assert.doesNotMatch(connectionsSource, /mediaHost\.dataset\.mediaPreview = previewMode/);
  assert.doesNotMatch(connectionsSource, /mediaHost\.style\.backgroundImage = nextBackgroundImage/);
  assert.match(connectionsSource, /estimateAiBoardDecodedMB\(board, currentLod, activePreview\)/);
  assert.match(connectionsSource, /stateBoards: aiBoards\.length/);
  assert.match(connectionsSource, /metrics\.visibleAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.nearAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.offscreenAiBoards \+= 1/);
  assert.match(connectionsSource, /metrics\.activePreviewCount \+= 1/);
  assert.match(connectionsSource, /previewDebug: getAiBoardPreviewDebugSnapshot|const previewDebug = getAiBoardPreviewDebugSnapshot\(element, mediaHost\)/);
  assert.match(connectionsSource, /metrics\.previewDebugEvents = aiBoardPreviewDebugEvents\.map/);
  assert.match(connectionsSource, /generatingBoards: aiImageGeneratingBoardIds\.size/);
  assert.match(connectionsSource, /lastGenerateStatus: formatAiImageGenerationStatus\(getLastAiImageGenerationStatus\(\)\)/);
  assert.match(connectionsSource, /generationStatus: generationStatus\?\.status \|\| ""/);
  assert.match(connectionsSource, /metrics\.estimatedDecodedMB/);
  assert.match(connectionsSource, /getStableAiBoardRecommendedLod\(board, width, height, viewState\.dpr, mediaHost\)/);
  assert.match(connectionsSource, /preloadAiImageBoardRuntimeLod\(board\.generatedMedia, rawRecommendedLod\)/);
  assert.match(connectionsSource, /function handleDocumentSpaceBoardSelectionPointerDown\(event\)/);
  assert.match(connectionsSource, /document\.addEventListener\("pointerdown", handleDocumentSpaceBoardSelectionPointerDown, true\)/);
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
  assert.match(connectionsSource, /contentEditable = isSelected \? "plaintext-only" : "false"/);
  assert.match(connectionsSource, /data-ai-image-board-caption-editor/);
  assert.match(connectionsSource, /element\.dataset\.aiCaptionLod = captionLod/);
  assert.match(connectionsSource, /captionScreenSize < AI_IMAGE_CAPTION_MIN_SCREEN_BOARD_PX \? "hidden" : "visible"/);
  assert.match(connectionsSource, /type: "space-board-caption"/);
  assert.match(connectionsSource, /function updateAiImageCaptionControls\(element, board, isSelected = false\)/);
  assert.match(connectionsSource, /type: "space-board-prompt"/);
  assert.match(connectionsSource, /function startSpaceBoardDrag\(event\)/);
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
  assert.match(connectionsSource, /const top = view\.top - size \* 0\.5;/);
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
  assert.match(indexSource, /artboard-bubble-outside-v24/);
  assert.match(cssSource, /\.editor-stage[\s\S]*background-color: #f7f7f4/);
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
  assert.match(cssSource, /\.editor-ai-board-metrics/);
  assert.match(cssSource, /\.editor-ai-board-metrics[\s\S]*position: fixed/);
  assert.match(cssSource, /\.editor-ai-board-metrics button[\s\S]*touch-action: manipulation/);
  assert.match(cssSource, /\.editor-webgl-canvas[\s\S]*z-index: 3/);
  assert.match(cssSource, /\.editor-artboard-paper-layer[\s\S]*z-index: 2/);
  assert.match(cssSource, /\.editor-artboard-connection-layer[\s\S]*z-index: 1/);
  assert.match(cssSource, /\.editor-artboard-connection-layer[\s\S]*width: 1px/);
  assert.match(cssSource, /\.editor-space-board-pane > \.editor-artboard-connection-layer[\s\S]*z-index: 0/);
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
  assert.doesNotMatch(cssSource, /editor-ai-image-board-loading-spin/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*isolation: isolate/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*outline: 3px solid #dbdbdb/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \{[\s\S]*transition: outline 150ms ease-in-out/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \{[\s\S]*outline-color: #f05023/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface \{[\s\S]*z-index: 0/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface \{[\s\S]*box-shadow: none/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard \.editor-ai-image-board-surface::after[\s\S]*linear-gradient/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-plain-artboard\.is-selected \.editor-ai-image-board-surface::after[\s\S]*opacity: 1/);
  assert.match(cssSource, /\.editor-ai-image-board-caption[\s\S]*z-index: 9/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-caption-lod-hidden \.editor-ai-image-board-caption[\s\S]*opacity: 0/);
  assert.match(cssSource, /\.editor-ai-image-board-caption\.is-overflowing[\s\S]*mask-image/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-editor:empty::before[\s\S]*content: attr\(data-placeholder\)/);
  assert.match(cssSource, /\.editor-ai-image-board-caption-editor[\s\S]*white-space: pre-wrap/);
  assert.match(cssSource, /\.editor-ai-image-board\.is-selected \.editor-ai-image-board-caption-editor[\s\S]*pointer-events: auto/);
  assert.match(cssSource, /@media \(pointer: coarse\)[\s\S]*font-size: max\(16px, var\(--ai-caption-font-size/);
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
  assert.match(cssSource, /\.editor-ai-image-board-media\.is-video-preview::before/);
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
  const layoutSource = readRepoFile("css", "layout.css");

  assert.match(previewSource, /let artboardDragState = null/);
  assert.match(previewSource, /function getArtboardLabelAtClientPoint\(clientX, clientY\)/);
  assert.match(previewSource, /function startArtboardDrag\(event, artboard\)/);
  assert.match(previewSource, /artboard\.isPrimary === true/);
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
