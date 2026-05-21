document.addEventListener(
  "contextmenu",
  (event) => {
    event.preventDefault();
  },
  { capture: true },
);

(() => {
  const namespace = window.CBO = window.CBO || {};
  const androidBuildVersion = "v4.6-android-cache-restore";
  const androidIndicator = document.getElementById("android-device-indicator");

  function isAndroidDevice() {
    const platformHints = [
      navigator.userAgentData?.platform,
      navigator.platform,
      navigator.userAgent,
      navigator.vendor,
    ];

    return platformHints.some((value) => /android/i.test(String(value || "")));
  }

  const isAndroid = isAndroidDevice();

  function isDocumentHistoryDisabled() {
    return Boolean(
      namespace.documentHistoryDisabled === true ||
      namespace.androidHistoryDisabled === true ||
      namespace.androidHistoryEnabled === false
    );
  }

  namespace.isAndroidDevice = isAndroidDevice;
  namespace.deviceIsAndroid = isAndroid;
  namespace.androidBuildVersion = androidBuildVersion;
  namespace.artboardSelectionEnabled = true;
  namespace.colorFillWorkerEnabled = true;
  namespace.isDocumentHistoryDisabled = isDocumentHistoryDisabled;

  if (isAndroid) {
    namespace.androidPerformanceMode = true;

    // Android WebGL: balanced quality. DPR 1.25 restores crispness without
    // going back to the iPhone-style 1.5 cap that was too heavy here.
    namespace.androidRenderDprCap = 1.25;
    namespace.mobileRenderDprCap = 1.25;

    // Reuse renderer-side culling and avoid GPU work at stroke start.
    namespace.viewportLayerCullingEnabled = true;
    namespace.interactiveBrushPrewarmEnabled = false;

    // Android hotfix: keep preview cache and dirty-region rendering enabled.
    // Full-render mode was too expensive during pan, zoom, and eraser strokes.
    namespace.androidFullRenderMode = false;
    namespace.androidPreviewCacheEnabled = true;
    namespace.androidDirtyRegionsEnabled = true;
    namespace.androidZoomOutPreviewCacheEnabled = true;
    namespace.androidZoomOutPreviewCacheMaxSize = 1536;
    namespace.androidPixelPerfectEnabled = false;
    namespace.pixelPerfectRenderingEnabled = false;
    namespace.androidHistoryEnabled = true;
    namespace.androidHistoryDisabled = false;
    namespace.documentHistoryDisabled = false;

    // Recovery: residency also owns hydration/cold fallback paths. Turning it
    // fully off can leave committed text/paint invisible on Android sessions
    // that already have cold or sparse artboard targets.
    namespace.androidArtboardResidencyDisabled = false;
    namespace.enableArtboardResidency = true;
    namespace.enableArtboardResidencyBudget = true;
    namespace.enableArtboardResidencyPrefetch = true;
    namespace.enableArtboardFlatPreviews = true;
    namespace.enableArtboardTileResidency = true;

    namespace.androidFastTransformCommitEnabled = true;
    namespace.androidFastResizeBoundsEnabled = true;
    namespace.androidLiveTransformPreviewEnabled = true;
  }

  document.body?.classList.toggle("cbo-device-android", isAndroid);

  if (androidIndicator) {
    androidIndicator.hidden = !isAndroid;
    androidIndicator.textContent = `android ${androidBuildVersion}`;
  }
})();

(() => {
  const guardedOptions = { capture: true, passive: false };
  const editableSelector = 'input, textarea, select, [contenteditable="true"]';
  const interactiveSelector = [
    "a[href]",
    "button",
    "[role='button']",
    "[data-tool]",
    "[data-toolset-option]",
    "[data-history-action]",
    "[data-drawer-sync]",
    "[data-rasterize-text]",
    ".side-panel",
    ".toolbar-dock",
    ".top-toolbar-dock",
    ".text-add-toolbar",
    ".mobile-text-panel",
    ".mobile-layer-effects-panel",
    ".right-vertical-toolbar-dock",
    ".brush-studio-panel",
    ".brushes-gallery-popout",
    ".artboard-create-popover",
    ".layer-effects-popover",
  ].join(", ");

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest(editableSelector));
  }

  function isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(interactiveSelector));
  }

  function preventBrowserGesture(event) {
    if (isEditableTarget(event.target) || isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
  }

  let lastTouchEndAt = 0;

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches?.length > 1 || Math.abs(event.scale || 1) !== 1) {
        preventBrowserGesture(event);
      }
    },
    guardedOptions,
  );

  document.addEventListener(
    "touchend",
    (event) => {
      if (event.touches?.length || isEditableTarget(event.target) || isInteractiveTarget(event.target)) {
        return;
      }

      const now = Date.now();
      if (now - lastTouchEndAt < 360) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    guardedOptions,
  );

  document.addEventListener("dblclick", preventBrowserGesture, guardedOptions);
  document.addEventListener("gesturestart", preventBrowserGesture, guardedOptions);
  document.addEventListener("gesturechange", preventBrowserGesture, guardedOptions);
  document.addEventListener("gestureend", preventBrowserGesture, guardedOptions);
})();

(() => {
  const namespace = window.CBO = window.CBO || {};
  const mobileObjectMoveState = {
    active: false,
    id: "",
    type: "",
  };
  const TOUCH_NAVIGATION_GHOST_TAP_GUARD_MS = 120;
  const touchNavigationInteractiveSelector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='button']",
    ".side-panel",
    ".toolbar-dock",
    ".top-toolbar-dock",
    ".right-vertical-toolbar-dock",
    ".brush-studio-panel",
    ".brushes-gallery-popout",
    ".artboard-create-popover",
    ".layer-effects-popover",
  ].join(", ");
  const mobileObjectMoveKeepArmedSelector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='button']",
    "[data-ai-image-board]",
    "[data-ai-image-board-action-toolbar]",
    "[data-ai-image-board-mobile-action-toolbar]",
    "[data-space-board]",
    "[data-space-text-board]",
    "[data-text-prompt-toolbar]",
    "[data-text-prompt-focus-overlay]",
    "[data-vector-rect-action-toolbar]",
    ".editor-vector-rect-layer",
    ".editor-vector-text-layer",
    ".toolbar-dock",
    ".top-toolbar-dock",
    ".text-add-toolbar",
    ".mobile-text-panel",
    ".side-panel",
  ].join(", ");
  const state = {
    active: false,
    blockUntil: 0,
    guardTimer: 0,
  };

  function isStageEvent(event) {
    return event.target instanceof Element && Boolean(event.target.closest(".editor-stage"));
  }

  function isTouchNavigationInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(touchNavigationInteractiveSelector));
  }

  function isTouchNavigationGuardActive() {
    return state.active || Date.now() < state.blockUntil;
  }

  function getMobileObjectMoveState() {
    return { ...mobileObjectMoveState };
  }

  function normalizeMobileObjectMoveTarget(target = {}) {
    return {
      id: String(target.id || target.boardId || target.layerId || "").trim(),
      type: String(target.type || "").trim(),
    };
  }

  function publishMobileObjectMoveState(source = "mobile-object-move") {
    window.dispatchEvent(new CustomEvent("cbo:mobile-object-move-change", {
      detail: {
        ...getMobileObjectMoveState(),
        source,
      },
    }));
  }

  function setMobileObjectMoveArmed(target = {}, options = {}) {
    const normalized = normalizeMobileObjectMoveTarget(target);
    const nextActive = options.active !== false && Boolean(normalized.type && normalized.id);
    const previousKey = `${mobileObjectMoveState.type}:${mobileObjectMoveState.id}:${mobileObjectMoveState.active}`;

    mobileObjectMoveState.active = nextActive;
    mobileObjectMoveState.type = nextActive ? normalized.type : "";
    mobileObjectMoveState.id = nextActive ? normalized.id : "";

    if (`${mobileObjectMoveState.type}:${mobileObjectMoveState.id}:${mobileObjectMoveState.active}` !== previousKey) {
      publishMobileObjectMoveState(options.source || "mobile-object-move");
    }

    return getMobileObjectMoveState();
  }

  function toggleMobileObjectMoveArmed(target = {}, options = {}) {
    const normalized = normalizeMobileObjectMoveTarget(target);
    const isAlreadyActive = Boolean(
      mobileObjectMoveState.active &&
      mobileObjectMoveState.type === normalized.type &&
      mobileObjectMoveState.id === normalized.id
    );

    return setMobileObjectMoveArmed(normalized, {
      ...options,
      active: !isAlreadyActive,
    });
  }

  function isMobileObjectMoveArmed(filter = {}) {
    const normalized = normalizeMobileObjectMoveTarget(filter);

    if (!mobileObjectMoveState.active) {
      return false;
    }

    if (normalized.type && mobileObjectMoveState.type !== normalized.type) {
      return false;
    }

    if (normalized.id && mobileObjectMoveState.id !== normalized.id) {
      return false;
    }

    return true;
  }

  function clearMobileObjectMoveArmed(filter = {}, options = {}) {
    if (!isMobileObjectMoveArmed(filter)) {
      return getMobileObjectMoveState();
    }

    return setMobileObjectMoveArmed({}, {
      active: false,
      source: options.source || "mobile-object-move-clear",
    });
  }

  function shouldKeepMobileObjectMoveArmed(event) {
    const target = event.target;

    if (target instanceof Element && target.closest(mobileObjectMoveKeepArmedSelector)) {
      return true;
    }

    return Boolean(namespace.isMobileObjectMovePointerTarget?.(event));
  }

  function handleMobileObjectMoveOutsidePointerDown(event) {
    if (event.button !== 0 || !mobileObjectMoveState.active || shouldKeepMobileObjectMoveArmed(event)) {
      return;
    }

    clearMobileObjectMoveArmed({}, {
      source: "mobile-object-move-outside-pointer-clear",
    });
  }

  function isTouchNavigationExclusive(options = {}) {
    return options.includeGuard === true
      ? isTouchNavigationGuardActive()
      : state.active;
  }

  function setTouchNavigationExclusive(active, detail = {}) {
    const nextActive = active === true;
    const wasActive = state.active;

    state.active = nextActive;
    if (state.guardTimer) {
      window.clearTimeout(state.guardTimer);
      state.guardTimer = 0;
    }

    if (nextActive) {
      state.blockUntil = 0;
      document.body?.classList.add("cbo-touch-navigation-guard");
    } else {
      state.blockUntil = Date.now() + TOUCH_NAVIGATION_GHOST_TAP_GUARD_MS;
      document.body?.classList.add("cbo-touch-navigation-guard");
      state.guardTimer = window.setTimeout(() => {
        state.guardTimer = 0;

        if (!state.active && Date.now() >= state.blockUntil) {
          document.body?.classList.remove("cbo-touch-navigation-guard");
        }
      }, TOUCH_NAVIGATION_GHOST_TAP_GUARD_MS);
    }

    document.body?.classList.toggle("cbo-touch-navigation-active", nextActive);

    if (wasActive !== nextActive) {
      window.dispatchEvent(new CustomEvent(nextActive
        ? "cbo:touch-navigation-start"
        : "cbo:touch-navigation-end", {
        detail: {
          ...detail,
          active: nextActive,
        },
      }));
    }
  }

  function suppressTouchNavigationEvent(event) {
    if (event.__cboNavigationHandled || !isTouchNavigationGuardActive()) {
      return;
    }

    const isGhostActivation = event.type === "click" ||
      event.type === "dblclick" ||
      event.type === "contextmenu" ||
      event.type === "auxclick";
    const isTouchPointerEvent = event.type.startsWith("pointer") && event.pointerType === "touch";
    const isInteractiveTarget = isTouchNavigationInteractiveTarget(event.target);
    const isInteractiveTouchPointer = isTouchPointerEvent && isInteractiveTarget;
    const isOffStageTouchPointer = event.type.startsWith("pointer") &&
      event.pointerType === "touch" &&
      !isStageEvent(event);

    if (!state.active && isInteractiveTarget) {
      return;
    }

    if (!isGhostActivation && !isOffStageTouchPointer && !(state.active && isInteractiveTouchPointer)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  namespace.isTouchNavigationExclusive = isTouchNavigationExclusive;
  namespace.isTouchNavigationGuardActive = isTouchNavigationGuardActive;
  namespace.setTouchNavigationExclusive = setTouchNavigationExclusive;
  namespace.getMobileObjectMoveState = getMobileObjectMoveState;
  namespace.setMobileObjectMoveArmed = setMobileObjectMoveArmed;
  namespace.toggleMobileObjectMoveArmed = toggleMobileObjectMoveArmed;
  namespace.clearMobileObjectMoveArmed = clearMobileObjectMoveArmed;
  namespace.isMobileObjectMoveArmed = isMobileObjectMoveArmed;

  ["pointerdown", "pointermove", "pointerup", "pointercancel", "click", "dblclick", "contextmenu", "auxclick"]
    .forEach((eventName) => {
      document.addEventListener(eventName, suppressTouchNavigationEvent, { capture: true, passive: false });
    });
  document.addEventListener("pointerdown", handleMobileObjectMoveOutsidePointerDown, true);
})();

(() => {
  const root = document.documentElement;
  let rafId = 0;

  function toCssPx(value, fallback = 0) {
    const number = Number(value);
    const safeValue = Number.isFinite(number) && number > 0 ? number : fallback;
    return `${Math.max(1, Math.round(safeValue))}px`;
  }

  function updateVisualViewportVars() {
    rafId = 0;

    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width || window.innerWidth || root.clientWidth || 1;
    const viewportHeight = visualViewport?.height || window.innerHeight || root.clientHeight || 1;
    const viewportOffsetTop = Math.max(0, Number(visualViewport?.offsetTop) || 0);
    const viewportScale = Number(visualViewport?.scale) || 1;
    const layoutHeight = window.innerHeight || viewportHeight;
    const keyboardInsetBottom = viewportScale > 1.01
      ? 0
      : Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);

    root.style.setProperty("--cbo-visual-viewport-width", toCssPx(viewportWidth, root.clientWidth || 1));
    root.style.setProperty("--cbo-visual-viewport-height", toCssPx(viewportHeight, root.clientHeight || 1));
    root.style.setProperty("--cbo-keyboard-inset-bottom", `${Math.round(keyboardInsetBottom)}px`);
    root.classList.toggle("cbo-visual-keyboard-active", keyboardInsetBottom > 80);

    if (keyboardInsetBottom > 80 && (window.scrollX || window.scrollY)) {
      window.scrollTo(0, 0);
    }
  }

  function scheduleVisualViewportUpdate() {
    if (rafId) {
      return;
    }

    rafId = window.requestAnimationFrame(updateVisualViewportVars);
  }

  updateVisualViewportVars();
  window.addEventListener("resize", scheduleVisualViewportUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleVisualViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleVisualViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleVisualViewportUpdate, { passive: true });
})();

document.addEventListener("DOMContentLoaded", () => {
  function initCanvasDependentTools() {
    window.CBO.initBrushShapeOutlinePreview?.();
    window.CBO.initAreaSelectionTool?.();
    window.CBO.initRasterTransformTool?.();
    window.CBO.initPuppetTransformTool?.();
    window.CBO.initVectorTextRenderer();
    window.CBO.initVectorRectTool?.();
  }

  window.addEventListener("cbo:editor-canvas-ready", initCanvasDependentTools);

  window.CBO.initSidebar();
  window.CBO.initDrawer();
  window.CBO.initLayersPanel();
  window.CBO.initDragScroll();
  window.CBO.initTopToolbar();
  window.CBO.initVerticalToolbar();
  window.CBO.initLayerEffectsPanel?.();
  window.CBO.initArtboardPreview?.();
  window.CBO.initColorPicker();
  window.CBO.initColorDrop();
  window.CBO.initToolbar();
  if (window.CBO.initEditorDocumentStart) {
    window.CBO.initEditorDocumentStart();
  } else {
    window.CBO.initEditorCanvas();
  }

  if (window.CBO.documentRenderer) {
    initCanvasDependentTools();
  }

  window.CBO.initRightSidebar();
  window.CBO.initBrushesPanel();
  window.CBO.initBrushStudio();
  window.CBO.initTooltips();
});
