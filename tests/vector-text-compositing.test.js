const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentLayerModel() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-layer-model.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    EventTarget,
    Number,
    Object,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO.DocumentLayerModel;
}

function loadVectorTextEngineNamespace() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-engine.js"),
    "utf8",
  );
  const window = {
    CBO: {},
  };
  const context = vm.createContext({
    Array,
    Error,
    Map,
    Math,
    Number,
    Object,
    Promise,
    String,
    Uint8Array,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO;
}

function loadVectorTextRasterizerNamespace() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );
  const window = {
    CBO: {},
    CSS: {
      escape(value) {
        return String(value);
      },
    },
  };
  const context = vm.createContext({
    Error,
    Object,
    String,
    console,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO;
}

function layerIds(layers) {
  return Array.from(layers, (layer) => layer.id);
}

test("vector text participates in the same bottom-to-top render order as raster layers", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      { id: "image-top", name: "Image Top", type: "image" },
      { id: "text-middle", name: "Text Middle", type: "vector-text", text: "Behind image" },
      { id: "paint-bottom", name: "Paint Bottom", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  assert.deepEqual(
    layerIds(model.getRenderableLayers()),
    ["background", "paint-bottom", "text-middle", "image-top"],
  );
});

test("moving vector text above an image changes only ordering, not layer type", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      { id: "text-top", name: "Text Top", type: "vector-text", text: "Above image" },
      { id: "image-middle", name: "Image Middle", type: "image" },
      { id: "paint-bottom", name: "Paint Bottom", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });
  const renderable = model.getRenderableLayers();

  assert.deepEqual(
    layerIds(renderable),
    ["background", "paint-bottom", "image-middle", "text-top"],
  );
  assert.equal(renderable.at(-1).type, "vector-text");
});

test("hidden parent groups remove cached vector text from the renderable stack", () => {
  const DocumentLayerModel = loadDocumentLayerModel();
  const model = new DocumentLayerModel({
    entries: [
      {
        id: "hidden-group",
        name: "Hidden Group",
        type: "group",
        visible: false,
        children: [
          { id: "hidden-text", name: "Hidden Text", type: "vector-text", text: "Hidden" },
        ],
      },
      { id: "paint-main", name: "Paint", type: "paint" },
      { id: "background", name: "Background", type: "background", locked: true },
    ],
  });

  assert.deepEqual(
    layerIds(model.getRenderableLayers()),
    ["background", "paint-main"],
  );
});

test("vector text renderer caches visual text into the matching WebGL layer target", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /syncTextLayerRaster\(layer, pathData, pathBounds\)/);
  assert.match(source, /createTextRasterTarget\(layerId, rasterBox, source = "vector-text-cache-target"\)/);
  assert.match(source, /this\.createTextRasterTarget\(layer\.id, rasterBox, "vector-text-cache-target"\)/);
  assert.match(source, /rasterizer\.placeRasterImage\(image,/);
  assert.match(source, /layerId: layer\.id/);
  assert.match(source, /drawWidth: rasterBox\.width/);
  assert.match(source, /drawHeight: rasterBox\.height/);
  assert.match(source, /function shouldSparsifyTextRasterTarget\(layer, rasterBox\)/);
  assert.match(source, /hasVisibleTextShadow\(layer\) \|\| getRasterBoxBytes\(rasterBox\) >= 4 \* 1024 \* 1024/);
  assert.match(source, /renderer\.sparsifyRasterTarget\?\.\(layer\.id, target, \{/);
  assert.match(source, /source:\s*"vector-text-cache-retile"/);
  assert.match(source, /getTextLayerRasterBox\(layer, pathBounds, size\)/);
  assert.match(source, /getTextLayerContentRect\(layerOrId\)/);
  assert.match(source, /transformLayerBounds\(layer, localBounds\)/);
  assert.match(source, /renderer\.rasterTargetsByLayerId\?\.get\?\.?\(layer\.id\)/);
  assert.match(source, /renderer\.isSparseRasterTarget\?\.\(existingTarget\) === true/);
  assert.match(source, /cached\?\.signature === signature && \(!rasterBox \|\| hasRasterTarget\)/);
  assert.match(source, /const placement = this\.getRasterBoxPlacement\(target, rasterBox\)/);
  assert.match(source, /x: placement\.x/);
  assert.match(source, /y: placement\.y/);
  assert.match(source, /renderer\.invalidatePreviewCache\?\.\("vector-text-cache"\)/);
  assert.doesNotMatch(source, /type:\s*"paint"[\s\S]{0,120}vector-text-cache/);
});

test("the SVG overlay no longer paints text above the composited document", () => {
  const css = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(
    css,
    /\.editor-vector-overlay \.editor-vector-solid-shadow,\s*\.editor-vector-overlay \.editor-vector-text-paint\s*\{[\s\S]*?opacity:\s*0;/,
  );
});

test("active text rasterization is debounced so drag and sliders stay responsive", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const dragMoveBody = source.match(/handleDragMove\(event\) \{([\s\S]*?)\n    handleDragEnd\(event\)/)?.[1] || "";

  assert.match(source, /ACTIVE_TEXT_RASTER_DEBOUNCE_MS/);
  assert.match(source, /queueTextLayerRasterSync\(layer, pathData, pathBounds, size, rasterBox, signature, delay\)/);
  assert.match(source, /runTextLayerRasterSync\(layer, pathData, pathBounds, size, rasterBox, signature\)/);
  assert.doesNotMatch(dragMoveBody, /scheduleContentRender\(\)/);
});

test("vector text drag coalesces live SVG transforms with requestAnimationFrame", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const dragMoveBody = source.match(/handleDragMove\(event\) \{([\s\S]*?)\n    handleDragEnd\(event\)/)?.[1] || "";

  assert.match(source, /dragFrameRequest/);
  assert.match(source, /scheduleDragPreview\(\) \{/);
  assert.match(source, /applyPendingDragPreview\(\) \{/);
  assert.match(source, /flushPendingDragPreview\(\);/);
  assert.match(dragMoveBody, /this\.dragState\.pendingClientX = event\.clientX;/);
  assert.match(dragMoveBody, /this\.dragState\.pendingClientY = event\.clientY;/);
  assert.match(dragMoveBody, /this\.scheduleDragPreview\(\);/);
  assert.doesNotMatch(dragMoveBody, /setAttribute\("transform"/);
  assert.doesNotMatch(dragMoveBody, /beginInteraction\(\)/);
});

test("vector text drag hides the stale raster cache while SVG preview is active", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /namespace\.documentRenderer\?\.setVectorTextTransformPreviewLayer\?\.\(layerId\)/);
  assert.match(source, /const keepPreviewUntilRaster = Boolean\([\s\S]*nextLayer &&[\s\S]*renderer\?\.isVectorTextTransformPreviewLayer\?\.\(layerId\)[\s\S]*namespace\.imageRasterizer\?\.placeRasterImage/);
  assert.match(source, /renderer\?\.clearVectorTextTransformPreviewLayer\?\.\(layerId\)/);
  assert.match(source, /if \(!keepPreviewUntilRaster\) \{[\s\S]*this\.endTextEditPreview\(\);/);
});

test("continuous text sidebar controls pass stable history groups", () => {
  const source = fs.readFileSync(path.join(repoRoot, "js", "right-sidebar.js"), "utf8");

  assert.match(source, /function getTextHistoryOptions\(suffix\)/);
  assert.match(source, /function patchActiveTextLayer\(patch, source = "text-sidebar", historyOptions = \{\}\)/);
  assert.match(source, /bindTextHistoryGroup\(textContentInput, "content"\)/);
  assert.match(source, /bindTextHistoryGroup\(textFontSizeInput, "font-size"\)/);
  assert.match(source, /getTextHistoryOptions\("content"\)/);
  assert.match(source, /getTextHistoryOptions\("transform-amount"\)/);
});

test("selected live text layer stays editable outside the text toolbar tool", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const css = fs.readFileSync(path.join(repoRoot, "css", "layout.css"), "utf8");

  assert.match(source, /syncOverlayInteractivity\(\)/);
  assert.match(source, /active-text-layer-selected/);
  assert.doesNotMatch(source, /this\.isTextToolActive\(\) && !this\.getActiveTextLayer\(\)/);
  assert.match(
    css,
    /\.editor-vector-overlay\.text-tool-active,\s*\.editor-vector-overlay\.active-text-layer-selected\s*\{[\s\S]*?pointer-events:\s*auto;/,
  );
});

test("desktop text tool creates text when the tool is activated", () => {
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(topToolbarSource, /function isMobileTextToolbarViewport\(\) \{[\s\S]*"\(max-width: 900px\)"/);
  assert.match(topToolbarSource, /function getTextCreationCenter\(\)/);
  assert.match(topToolbarSource, /const renderer = window\.CBO\.documentRenderer;[\s\S]*x: Math\.max\(1, renderer\.width\) \/ 2,[\s\S]*y: Math\.max\(1, renderer\.height\) \/ 2,/);
  assert.doesNotMatch(topToolbarSource, /getTextCreationCenter\(\) \{[\s\S]*getBoundingClientRect/);
  assert.match(topToolbarSource, /if \(isText && !isMobileTextToolbarViewport\(\)\) \{[\s\S]*window\.CBO\.createVectorTextLayer\?\.\(/);
  assert.doesNotMatch(source, /centerAt: this\.clientToDocumentPoint\(event\.clientX, event\.clientY\)/);
});

test("mobile text tool exposes ADD TEXT as the layer creation action", () => {
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const topToolbarCss = fs.readFileSync(path.join(repoRoot, "css", "top-toolbar.css"), "utf8");
  const toolbarSource = fs.readFileSync(path.join(repoRoot, "js", "toolbar.js"), "utf8");
  const vectorRendererSource = fs.readFileSync(path.join(repoRoot, "js", "text", "vector-text-renderer.js"), "utf8");
  const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

  assert.match(topToolbarSource, /data-text-add-toolbar/);
  assert.match(topToolbarSource, />ADD TEXT<\/button>/);
  assert.match(topToolbarSource, /const isText = label === "TYPE" \|\| toolMode === "text"/);
  assert.match(topToolbarSource, /showTextAddToolbar\(currentToolIsText && !hasTextLayer\)/);
  assert.match(topToolbarSource, /syncMobileTextState\(\)/);
  assert.match(topToolbarSource, /function getTextCreationCenter\(\)/);
  assert.match(topToolbarSource, /window\.CBO\.createVectorTextLayer\?\.\(\s*centerAt \? \{ centerAt \} : undefined,\s*\)/);
  assert.match(topToolbarSource, /editorPage\.appendChild\(textAddToolbar\)/);
  assert.match(topToolbarSource, /textAddToolbar\?\.querySelector\("\[data-text-add-button\]"\)/);
  assert.match(topToolbarCss, /\.text-add-toolbar:not\(\[hidden\]\) \{[\s\S]*bottom: 88px;/);
  assert.match(topToolbarCss, /\.text-add-toolbar \{[\s\S]*min-width: 156px;/);
  assert.match(topToolbarCss, /\.text-add-button \{[\s\S]*color: #dfe3ea;[\s\S]*font-size: 16px;[\s\S]*font-weight: 900;/);
  assert.match(toolbarSource, /function isTextToolButton\(button\)/);
  assert.match(toolbarSource, /if \(isTextToolButton\(button\)\) \{\s*setMobileTransformToolsOpen\(false\);/);
  assert.match(vectorRendererSource, /const \{ centerAt, \.\.\.layerSeed \} = options;/);
  assert.match(vectorRendererSource, /getFinitePoint\(centerAt\) \|\| getCenteredDocumentPoint\(\)/);
  assert.match(appSource, /"\.text-add-toolbar"/);
  assert.match(appSource, /"\.mobile-text-panel"/);
});

test("mobile text layer switches the bottom dock to icon settings panels", () => {
  const topToolbarSource = fs.readFileSync(path.join(repoRoot, "js", "top-toolbar.js"), "utf8");
  const topToolbarCss = fs.readFileSync(path.join(repoRoot, "css", "top-toolbar.css"), "utf8");

  assert.match(topToolbarSource, /data-mobile-text-settings-toolbar/);
  assert.ok((topToolbarSource.match(/data-mobile-text-panel-trigger/g) || []).length >= 2);
  assert.match(topToolbarSource, /key: "color", label: "TEXT COLOR"/);
  assert.match(topToolbarSource, /key: "border", label: "BORDER"/);
  assert.match(topToolbarSource, /key: "style", label: "TEXT STYLE"/);
  assert.match(topToolbarSource, /key: "transform", label: "TRANSFORMATION"/);
  assert.match(topToolbarSource, /key: "shadow", label: "SHADOW"/);
  assert.match(topToolbarSource, /data-mobile-text-panel-section="color"/);
  assert.match(topToolbarSource, /data-mobile-text-panel-section="border"/);
  assert.match(topToolbarSource, /data-mobile-text-panel-section="style"/);
  assert.match(topToolbarSource, /data-mobile-text-content/);
  assert.match(topToolbarSource, /data-mobile-text-panel-section="transform"/);
  assert.match(topToolbarSource, /data-mobile-text-panel-section="shadow"/);
  assert.match(topToolbarSource, /showMobileTextToolbar\(currentToolIsText && hasTextLayer\)/);
  assert.match(topToolbarSource, /toolbarDock\.classList\.toggle\("mobile-text-settings-active", shouldShow\)/);
  assert.match(topToolbarSource, /patchActiveTextLayer\(\s*\{ style: \{ fill: mobileTextFillInput\.value \} \}/);
  assert.match(topToolbarSource, /enableMobileTextBorderEffect\(\)/);
  assert.match(topToolbarSource, /patchMobileTextFontFromControls/);
  assert.match(topToolbarSource, /initMobileEnvelopeForActiveTextLayer/);
  assert.match(topToolbarSource, /function ensureActiveTextLayerForTransform\(source = "mobile-text-transform-select"\)/);
  assert.match(topToolbarSource, /layerModel\.setActiveLayer\?\.\(fallbackLayer\.id, \{ source \}\)/);
  assert.match(topToolbarSource, /const layer = ensureActiveTextLayerForTransform\(\);[\s\S]*if \(!layer\) \{[\s\S]*setMobileTextTransformMode\("none"\);[\s\S]*return;/);
  assert.match(topToolbarSource, /new CustomEvent\("cbo:text-transform-edit-request", \{[\s\S]*layerId: layer\.id,/);
  assert.match(topToolbarSource, /data-mobile-text-transform-actions hidden/);
  assert.match(topToolbarSource, /data-mobile-text-transform-modify>Modify<\/button>/);
  assert.match(topToolbarSource, /mobileTextTransformRangeField\.hidden = isDistort/);
  assert.match(topToolbarSource, /if \(layer\.envelopeGrid\) \{[\s\S]*return layer;/);
  assert.match(topToolbarSource, /if \(mode === "distort"\) \{[\s\S]*editMobileTextDistort\(layer\);/);
  assert.match(topToolbarSource, /mobileTextTransformModify\?\.addEventListener\("click"/);
  assert.match(topToolbarSource, /enableMobileTextShadowEffect\(\)/);
  assert.match(topToolbarSource, /editorPage\.appendChild\(mobileTextPanel\)/);
  assert.match(topToolbarSource, /mobileTextPanel\?\.querySelector\("\[data-mobile-text-fill\]"\)/);
  assert.match(topToolbarSource, /mobileTextContentInput\.value = layer\.text \|\| ""/);
  assert.match(topToolbarSource, /\[mobileTextContentInput, "content"\]/);
  assert.match(topToolbarSource, /patchActiveTextLayer\(\s*\{ text: mobileTextContentInput\.value \}/);
  assert.match(topToolbarCss, /\.toolbar-dock\.mobile-text-settings-active \.main-tools-toolbar \{\s*display: none;/);
  assert.match(topToolbarCss, /\.toolbar-dock \.mobile-text-settings-toolbar:not\(\[hidden\]\) \{\s*display: flex;/);
  assert.doesNotMatch(topToolbarCss, /\.top-toolbar-dock \{\s*z-index: 9050;/);
  assert.match(topToolbarCss, /\.mobile-text-panel:not\(\[hidden\]\) \{[\s\S]*bottom: 88px;/);
  assert.match(topToolbarCss, /\.mobile-text-content-input \{[\s\S]*background: #242832;[\s\S]*color: #ffffff;/);
  assert.match(topToolbarCss, /\.mobile-text-select \{[\s\S]*color-scheme: dark;/);
  assert.match(topToolbarCss, /\.mobile-text-select option \{[\s\S]*background: #242832;[\s\S]*color: #ffffff;/);
});

test("distort uses hidden corner handles derived from center handles", () => {
  const namespace = loadVectorTextEngineNamespace();
  const rendererSource = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const grid = {
    TL: { x: 0, y: 0 },
    TR: { x: 300, y: 0 },
    BL: { x: 0, y: 100 },
    BR: { x: 300, y: 100 },
    TC: { x: 150, y: 30 },
    BC: { x: 150, y: 130 },
    TC_HandleL: { x: 90, y: 60 },
    TC_HandleR: { x: 210, y: -40 },
    BC_HandleL: { x: 80, y: 170 },
    BC_HandleR: { x: 220, y: 80 },
  };

  const handles = JSON.parse(JSON.stringify(namespace.VectorTextEngine.getImplicitEnvelopeCornerHandles(grid)));

  assert.deepEqual(handles, {
    TL_Handle: { x: 45, y: 30 },
    TR_Handle: { x: 255, y: -20 },
    BL_Handle: { x: 40, y: 135 },
    BR_Handle: { x: 260, y: 90 },
  });
  assert.equal(grid.TL_Handle, undefined);
  assert.match(rendererSource, /const HANDLE_ENVELOPE_NODES = \["TC_HandleL", "TC_HandleR", "BC_HandleL", "BC_HandleR"\]/);
  assert.match(rendererSource, /namespace\.VectorTextEngine\?\.getImplicitEnvelopeCornerHandles\?\.?\(grid\)/);
});

test("mobile text distort handles use touch-sized viewport controls", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /MOBILE_ENVELOPE_HANDLE_SIZES = Object\.freeze\(\{[\s\S]*anchor: 24,[\s\S]*control: 22,[\s\S]*corner: 24,/);
  assert.match(source, /MOBILE_ENVELOPE_HIT_STROKE_WIDTH = 36/);
  assert.match(source, /MOBILE_ENVELOPE_HIT_RADIUS = 30/);
  assert.match(source, /window\.matchMedia\?\.\("\(pointer: coarse\), \(max-width: 900px\)"\)/);
  assert.match(source, /function getEnvelopeHandleViewportScale\(layer\)/);
  assert.match(source, /return 1 \/ \(zoom \* layerScale\)/);
  assert.match(source, /const size = getEnvelopeHandleSize\(roleClass, desktopSize\)/);
  assert.match(source, /const viewportScale = getEnvelopeHandleViewportScale\(layer\)/);
  assert.match(source, /"stroke-width": getEnvelopeHitStrokeWidth\(\)/);
  assert.match(source, /const hitRadius = getEnvelopePointerHitRadius\(pointerType\)/);
});

test("vector text drag and envelope edits use document history groups", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );

  assert.match(source, /vector-text-create-\$\{layer\.id\}/);
  assert.match(source, /namespace\.documentHistory\?\.beginGroup\?\.?\(historyGroup\)/);
  assert.match(source, /text-drag-\$\{layerId\}/);
  assert.match(source, /text-envelope-\$\{layerId\}-\$\{nodeId\}/);
  assert.match(source, /historyGroup: this\.envelopeDragState\.historyGroup/);
});

test("manual vector text rasterization uses the cropped renderer asset when available", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );
  const createTargetBody = source.match(
    /function createTextRasterizeTarget\(renderer, layerId, rasterBox\) \{([\s\S]*?)\n  \}/,
  )?.[1] || "";

  assert.match(source, /createRasterTextAsset\?\.\(layer, \{ size \}\)/);
  assert.match(source, /if \(vectorRenderer\?\.createRasterTextAsset\) \{\s*return \{ rasterBox: null, source: null \};\s*\}/);
  assert.match(source, /if \(!rasterSource\.source \|\| !rasterSource\.rasterBox\) \{\s*return null;\s*\}/);
  assert.match(source, /createTextRasterizeTarget\(renderer, rasterLayer\.id, rasterSource\.rasterBox\)/);
  assert.match(source, /renderer\.replaceRasterTarget\?\.\(layerId, target,/);
  assert.doesNotMatch(createTargetBody, /getRasterTarget(?:\?\.)?\(/);
  assert.match(createTargetBody, /return null;/);
  assert.doesNotMatch(source, /return \{\s*\.\.\.target,\s*layerId,\s*\};/);
  assert.match(source, /drawWidth: rasterSource\.rasterBox\.width/);
  assert.match(source, /drawHeight: rasterSource\.rasterBox\.height/);
  assert.match(source, /const placement = getRasterBoxPlacement\(target, rasterSource\.rasterBox\)/);
  assert.match(source, /renderer\.sparsifyRasterTarget\?\.\(rasterLayer\.id, target, \{/);
  assert.match(source, /pruneTransparentTiles:\s*true/);
  assert.match(source, /source:\s*"vector-text-rasterize-retile"/);
  assert.match(source, /x: placement\.x/);
  assert.match(source, /y: placement\.y/);
  assert.doesNotMatch(source, /rasterizer\.placeRasterImage\(canvas,[\s\S]{0,120}x:\s*0,[\s\S]{0,80}y:\s*0/);
});

test("manual vector text rasterization reads document size without materializing paint target", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );
  const getDocumentSizeBody = source.match(/function getDocumentSize\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";

  assert.match(getDocumentSizeBody, /renderer\?\.height \|\| 4000/);
  assert.match(getDocumentSizeBody, /renderer\?\.width \|\| 4000/);
  assert.doesNotMatch(getDocumentSizeBody, /getPaintTarget/);
  assert.doesNotMatch(getDocumentSizeBody, /paintTarget/);
});

test("vector text cache target creation does not fall back to full raster targets", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const createTargetBody = source.match(
    /createTextRasterTarget\(layerId, rasterBox, source = "vector-text-cache-target"\) \{([\s\S]*?)\n    \}/,
  )?.[1] || "";

  assert.doesNotMatch(createTargetBody, /getRasterTarget(?:\?\.)?\(/);
  assert.match(createTargetBody, /return null;/);
});

test("text rasterization supersamples small text before downscaling into the layer", () => {
  const rendererSource = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const rasterizerSource = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(rendererSource, /TEXT_RASTER_SUPERSAMPLE_MAX_SCALE = 4/);
  assert.match(rendererSource, /function getTextRasterSupersampleScale\(rasterBox\)/);
  assert.match(rendererSource, /height: Math\.max\(1, Math\.round\(box\.height \* rasterScale\)\)/);
  assert.match(rendererSource, /width: Math\.max\(1, Math\.round\(box\.width \* rasterScale\)\)/);
  assert.match(rendererSource, /viewBox: `\$\{box\.x\} \$\{box\.y\} \$\{box\.width\} \$\{box\.height\}`/);
  assert.match(rasterizerSource, /TEXT_RASTER_SUPERSAMPLE_MAX_SCALE = 4/);
  assert.match(rasterizerSource, /canvas\.width = outputWidth/);
  assert.match(rasterizerSource, /canvas\.height = outputHeight/);
});

test("text rasterization bounds drop shadow filters to the raster crop", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const filterBody = source.match(/createDropShadowFilter\(layer, options = \{\}\) \{([\s\S]*?)\n    createTextLayerNode/)?.[1] || "";

  assert.match(filterBody, /options\.ignoreInteraction === true/);
  assert.match(source, /const filterBounds = options\.pathBounds[\s\S]*getTextLocalRasterBounds\(layer, options\.pathBounds\)/);
  assert.match(source, /this\.createDropShadowFilter\(layer, \{[\s\S]*filterBounds,[\s\S]*ignoreInteraction: true,/);
  assert.match(source, /pathBounds: metrics\.bounds/);
  assert.match(source, /pathBounds,/);
  assert.match(filterBody, /filterUnits: "userSpaceOnUse"/);
  assert.match(filterBody, /const filterBounds = hasFiniteBounds\(options\.filterBounds\) \? options\.filterBounds : null/);
  assert.match(filterBody, /const filterX = filterBounds \? filterBounds\.x1 - pad : -pad/);
  assert.match(filterBody, /Math\.ceil\(filterBounds\.x2 - filterBounds\.x1\) \+ pad \* 2/);
  assert.doesNotMatch(filterBody, /size\.width \* 3 \+ pad \* 2/);
  assert.doesNotMatch(filterBody, /size\.height \* 3 \+ pad \* 2/);
});

test("manual vector text rasterization records one custom entry for layer and pixel state", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(source, /function createRasterizeHistoryEntry\(options = \{\}\)/);
  assert.match(source, /type:\s*"custom"/);
  assert.match(source, /beforeEntries:\s*before\.entries/);
  assert.match(source, /afterEntries:\s*after\.entries/);
  assert.match(source, /renderer\.createRasterSnapshot\?\.\(finalTarget, rasterSource\.rasterBox, "vector-text-rasterize"\)/);
  assert.match(source, /renderer\.restoreRasterSnapshot\?\.\(rasterLayerId, rasterSnapshot,/);
  assert.match(source, /preferSparseRestore = false/);
  assert.match(source, /preferSparse:\s*preferSparseRestore/);
  assert.match(source, /replaceSparse:\s*preferSparseRestore/);
  assert.match(source, /preferSparseRestore:\s*renderer\.isSparseRasterTarget\?\.\(finalTarget\) === true/);
  assert.match(source, /renderer\.deleteRasterSnapshot\?\.\(rasterSnapshot\)/);
  assert.match(source, /layerModel\.setEntries\(entries, \{\s*activeLayerId:\s*rasterLayer\.id,\s*history:\s*false,\s*source:\s*"vector-text-rasterize",\s*\}\)/);
  assert.doesNotMatch(source, /layerModel\.setActiveLayer\(rasterLayer\.id, \{ history: false, source: "vector-text-rasterize" \}\)/);
});

test("manual vector text rasterization exposes a targeted memory debug helper", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(source, /async function debugRasterizeVectorTextLayer\(layerId, options = \{\}\)/);
  assert.match(source, /snapshotRasterTargets\(renderer, layerModel/);
  assert.match(source, /diffRasterTargetSnapshots\(before, after\)/);
  assert.match(source, /namespace\.setRasterResourceTraceEnabled\?\.\(true,/);
  assert.match(source, /namespace\.debugRasterizeActiveVectorTextLayer = \(options = \{\}\) => debugRasterizeVectorTextLayer\(null, options\)/);
});

test("manual vector text rasterization preserves layer opacity on the paint replacement", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-rasterizer.js"),
    "utf8",
  );

  assert.match(source, /function normalizeLayerOpacity\(value, fallback = 1\)/);
  assert.match(source, /clonedLayer\.setAttribute\("opacity", "1"\)/);
  assert.match(source, /opacity: normalizeLayerOpacity\(layer\.opacity\)/);
});

test("vector text rasterize history entry restores pixels and releases GPU snapshots", () => {
  const namespace = loadVectorTextRasterizerNamespace();
  const calls = [];
  const layerModel = {};
  const beforeState = {
    activeLayerId: "text-1",
    entries: [{ id: "text-1", type: "vector-text" }],
  };
  const afterState = {
    activeLayerId: "raster-1",
    entries: [{ id: "raster-1", type: "paint" }],
  };
  const rasterSnapshot = { framebuffer: {}, texture: {} };
  const history = {
    restoreLayerState(_layerModel, state, options = {}) {
      calls.push(`restore:${state.activeLayerId}:${options.source}`);
      return true;
    },
  };
  const renderer = {
    clearLayer(layerId, options = {}) {
      calls.push(`clear:${layerId}:${options.emit}`);
      return true;
    },
    deleteRasterSnapshot(snapshot) {
      calls.push(`deleteSnapshot:${snapshot === rasterSnapshot}`);
    },
    deleteRasterTarget(layerId, options = {}) {
      calls.push(`deleteTarget:${layerId}:${options.emit}`);
      return true;
    },
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(`restorePixels:${layerId}:${snapshot === rasterSnapshot}:${options.source}`);
      return true;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createVectorTextRasterizeHistoryEntry({
    afterState,
    beforeState,
    history,
    layerModel,
    rasterLayer: { id: "raster-1" },
    rasterSnapshot,
    requiresRasterSnapshot: true,
    renderer,
  });

  assert.equal(entry.undo(), true);
  assert.equal(entry.redo(), true);
  entry.destroy();

  assert.deepEqual(calls, [
    "restore:text-1:history-undo-vector-text-rasterize",
    "deleteTarget:raster-1:false",
    "draw",
    "restore:raster-1:history-redo-vector-text-rasterize",
    "clear:raster-1:false",
    "restorePixels:raster-1:true:history-redo-vector-text-rasterize",
    "draw",
    "deleteSnapshot:true",
  ]);
});

test("vector text rasterize redo restores sparse snapshots as sparse targets", () => {
  const namespace = loadVectorTextRasterizerNamespace();
  const calls = [];
  const layerModel = {};
  const beforeState = {
    activeLayerId: "text-sparse",
    entries: [{ id: "text-sparse", type: "vector-text" }],
  };
  const afterState = {
    activeLayerId: "raster-sparse",
    entries: [{ id: "raster-sparse", type: "paint" }],
  };
  const rasterSnapshot = { framebuffer: {}, texture: {} };
  const history = {
    restoreLayerState(_layerModel, state, options = {}) {
      calls.push(`restore:${state.activeLayerId}:${options.source}`);
      return true;
    },
  };
  const renderer = {
    clearLayer(layerId, options = {}) {
      calls.push(`clear:${layerId}:${options.emit}`);
      return true;
    },
    deleteRasterSnapshot() {},
    deleteRasterTarget() {},
    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      calls.push(
        `restorePixels:${layerId}:${snapshot === rasterSnapshot}:${options.preferSparse}:${options.replaceSparse}:${options.source}`,
      );
      return true;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createVectorTextRasterizeHistoryEntry({
    afterState,
    beforeState,
    history,
    layerModel,
    preferSparseRestore: true,
    rasterLayer: { id: "raster-sparse" },
    rasterSnapshot,
    requiresRasterSnapshot: true,
    renderer,
  });

  assert.equal(entry.redo(), true);
  assert.deepEqual(calls, [
    "restore:raster-sparse:history-redo-vector-text-rasterize",
    "clear:raster-sparse:false",
    "restorePixels:raster-sparse:true:true:true:history-redo-vector-text-rasterize",
    "draw",
  ]);
});

test("vector text rasterize redo rolls back the layer model if pixel restore fails", () => {
  const namespace = loadVectorTextRasterizerNamespace();
  const calls = [];
  const layerModel = {};
  const beforeState = {
    activeLayerId: "text-rollback",
    entries: [{ id: "text-rollback", type: "vector-text" }],
  };
  const afterState = {
    activeLayerId: "raster-rollback",
    entries: [{ id: "raster-rollback", type: "paint" }],
  };
  const history = {
    restoreLayerState(_layerModel, state, options = {}) {
      calls.push(`restore:${state.activeLayerId}:${options.source}`);
      return true;
    },
  };
  const renderer = {
    clearLayer(layerId, options = {}) {
      calls.push(`clear:${layerId}:${options.emit}`);
      return true;
    },
    deleteRasterSnapshot() {},
    deleteRasterTarget(layerId, options = {}) {
      calls.push(`deleteTarget:${layerId}:${options.emit}`);
      return true;
    },
    restoreRasterSnapshot(layerId) {
      calls.push(`restorePixels:${layerId}:false`);
      return false;
    },
  };

  namespace.brushEngine = {
    requestDraw() {
      calls.push("draw");
    },
  };

  const entry = namespace.createVectorTextRasterizeHistoryEntry({
    afterState,
    beforeState,
    history,
    layerModel,
    rasterLayer: { id: "raster-rollback" },
    rasterSnapshot: { framebuffer: {}, texture: {} },
    requiresRasterSnapshot: true,
    renderer,
  });

  assert.equal(entry.redo(), false);
  assert.deepEqual(calls, [
    "restore:raster-rollback:history-redo-vector-text-rasterize",
    "clear:raster-rollback:false",
    "restorePixels:raster-rollback:false",
    "restore:text-rollback:history-redo-vector-text-rasterize-rollback",
    "deleteTarget:raster-rollback:false",
    "draw",
  ]);
});

test("solid 3D text shadow uses a continuous extrusion instead of stamped copies", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "text", "vector-text-renderer.js"),
    "utf8",
  );
  const solidShadowBody = source.match(/appendSolidShadow\(group, layer, pathData, options = \{\}\) \{([\s\S]*?)\n    handlePointerDown\(event\)/)?.[1] || "";

  assert.match(source, /let solidShadowCacheKey = "";/);
  assert.match(source, /createSolidShadowExtrusionPathData\(pathData, offsetX, offsetY\)/);
  assert.match(source, /addCubicPatch\(current, controlA, controlB, next\)/);
  assert.match(source, /addQuadraticPatch\(current, control, next\)/);
  assert.match(source, /editor-vector-solid-shadow-extrusion/);
  assert.match(source, /editor-vector-solid-shadow-backface/);
  assert.match(solidShadowBody, /opacity: String\(opacity\)/);
  assert.match(solidShadowBody, /colorWithOpacity\(shadow\.color \|\| "#000000", 1\)/);
  assert.match(solidShadowBody, /"stroke-linecap": "round"/);
  assert.match(solidShadowBody, /"stroke-width": 1/);
  assert.doesNotMatch(solidShadowBody, /for \(let index = steps/);
  assert.doesNotMatch(source, /createContoursFromPathData/);
  assert.doesNotMatch(source, /tokenizePathData/);
});
