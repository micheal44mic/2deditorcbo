(function registerColorFill(namespace) {
  const DEFAULT_FILL_TOLERANCE = 48;
  const MAX_FILL_TOLERANCE = 255;
  const FILL_COVERAGE_MAX = 255;
  const FILL_EDGE_AA_RADIUS = 1;
  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const THRESHOLD_HIDE_DELAY_MS = 5000;
  const COLOR_FILL_WORKER_TIMEOUT_MS = 5000;
  const FILL_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });

  let fillTolerance = clamp(
    Number.isFinite(Number(namespace.colorFillTolerance))
      ? Number(namespace.colorFillTolerance)
      : DEFAULT_FILL_TOLERANCE,
    0,
    MAX_FILL_TOLERANCE,
  );
  let thresholdToolbar = null;
  let thresholdInput = null;
  let thresholdValue = null;
  let thresholdHideTimer = null;
  let referenceLayerId = String(namespace.colorFillReferenceLayerId || "").trim();
  let fillWorkerJobSequence = 0;

  function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  function parseHexColor(hex) {
    const value = String(hex || "#FFFFFF").trim().replace("#", "");
    const normalized = value.length === 3
      ? value.split("").map((char) => char + char).join("")
      : value.padEnd(6, "F").slice(0, 6);
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);

    return {
      a: 255,
      b: Number.isFinite(blue) ? blue : 255,
      g: Number.isFinite(green) ? green : 255,
      r: Number.isFinite(red) ? red : 255,
    };
  }

  function getRasterRectBytes(rectOrWidth, height = null) {
    const width = typeof rectOrWidth === "object"
      ? rectOrWidth?.width
      : rectOrWidth;
    const resolvedHeight = typeof rectOrWidth === "object"
      ? rectOrWidth?.height
      : height;

    return Math.max(0, Math.round(Number(width) || 0)) *
      Math.max(0, Math.round(Number(resolvedHeight) || 0)) *
      RASTER_BYTES_PER_PIXEL;
  }

  function getRectCoverage(rect, width, height) {
    const documentPixels = Math.max(0, Math.round(width || 0)) * Math.max(0, Math.round(height || 0));

    if (documentPixels <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, ((rect?.width || 0) * (rect?.height || 0)) / documentPixels));
  }

  function isAndroidPerformanceMode() {
    return namespace.androidPerformanceMode === true ||
      namespace.deviceIsAndroid === true ||
      namespace.DocumentRenderer?.isAndroidLikeEnvironment?.() === true;
  }

  function setTolerance(value) {
    fillTolerance = Math.round(clamp(value, 0, MAX_FILL_TOLERANCE));
    namespace.colorFillTolerance = fillTolerance;
    updateThresholdToolbar();

    return fillTolerance;
  }

  function getTolerance() {
    return fillTolerance;
  }

  function updateThresholdToolbar() {
    if (!thresholdInput || !thresholdValue) {
      return;
    }

    const progress = (fillTolerance / MAX_FILL_TOLERANCE) * 100;

    thresholdInput.value = String(fillTolerance);
    thresholdInput.style.setProperty("--color-fill-threshold-progress", `${progress}%`);
    thresholdValue.textContent = String(fillTolerance);
  }

  function ensureThresholdToolbar() {
    if (thresholdToolbar) {
      return thresholdToolbar;
    }

    const host = document.querySelector(".editor-page") || document.body;

    thresholdToolbar = document.createElement("label");
    thresholdToolbar.className = "bottom-toolbar color-fill-threshold-toolbar";
    thresholdToolbar.hidden = true;
    thresholdToolbar.innerHTML = `
      <span class="color-fill-threshold-label">THRESHOLD</span>
      <input class="color-fill-threshold-range" type="range" min="0" max="${MAX_FILL_TOLERANCE}" step="1" aria-label="Color fill threshold" />
      <span class="color-fill-threshold-value"></span>
    `;

    thresholdInput = thresholdToolbar.querySelector(".color-fill-threshold-range");
    thresholdValue = thresholdToolbar.querySelector(".color-fill-threshold-value");

    thresholdInput?.addEventListener("input", () => {
      setTolerance(thresholdInput.value);
      showThresholdControl();
    });
    thresholdInput?.addEventListener("focus", showThresholdControl);
    thresholdInput?.addEventListener("blur", () => hideThresholdControl());

    thresholdToolbar.addEventListener("pointerenter", showThresholdControl);
    thresholdToolbar.addEventListener("pointerleave", () => hideThresholdControl());

    ["pointerdown", "pointermove", "pointerup", "click"].forEach((eventName) => {
      thresholdToolbar.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    });

    host.appendChild(thresholdToolbar);
    updateThresholdToolbar();

    return thresholdToolbar;
  }

  function showThresholdControl() {
    const toolbar = ensureThresholdToolbar();

    window.clearTimeout(thresholdHideTimer);
    toolbar.hidden = false;
    toolbar.classList.add("visible");
    updateThresholdToolbar();
  }

  function isThresholdControlInteractive() {
    return Boolean(
      thresholdToolbar &&
      (
        document.activeElement === thresholdInput ||
        (typeof thresholdToolbar.matches === "function" && thresholdToolbar.matches(":hover"))
      ),
    );
  }

  function hideThresholdControl(delay = THRESHOLD_HIDE_DELAY_MS) {
    if (!thresholdToolbar) {
      return;
    }

    window.clearTimeout(thresholdHideTimer);
    thresholdHideTimer = window.setTimeout(() => {
      if (delay > 0 && isThresholdControlInteractive()) {
        hideThresholdControl();
        return;
      }

      thresholdToolbar?.classList.remove("visible");
      if (thresholdToolbar) {
        thresholdToolbar.hidden = true;
      }
    }, Math.max(0, delay));
  }

  function beginDropDrag() {
    showThresholdControl();
  }

  function endDropDrag() {
    hideThresholdControl();
  }

  function cancelDropDrag() {
    hideThresholdControl(0);
  }

  function getReferenceLayerId() {
    return referenceLayerId;
  }

  function emitReferenceChange(source = "color-fill-reference") {
    window.dispatchEvent(new CustomEvent("cbo:color-fill-reference-change", {
      detail: {
        layerId: referenceLayerId || null,
        source,
      },
    }));
  }

  function setReferenceLayerId(layerId, options = {}) {
    const previousLayerId = referenceLayerId;
    const nextLayerId = String(layerId || "").trim();

    referenceLayerId = nextLayerId;
    namespace.colorFillReferenceLayerId = nextLayerId;

    if (previousLayerId !== nextLayerId && options.history !== false) {
      namespace.documentHistory?.recordReferenceStateChange?.(previousLayerId, nextLayerId, {
        historyGroup: options.historyGroup || "",
        source: options.source || "set-reference-layer",
      });
    }

    if (options.emit !== false) {
      emitReferenceChange(options.source || "set-reference-layer");
    }

    return referenceLayerId;
  }

  function clearReferenceLayerId(options = {}) {
    return setReferenceLayerId("", {
      ...options,
      source: options.source || "clear-reference-layer",
    });
  }

  function installColorFillModules() {
    const modules = namespace.ColorFillModules || {};
    const context = {
      COLOR_FILL_WORKER_TIMEOUT_MS,
      DEFAULT_FILL_TOLERANCE,
      FILL_COVERAGE_MAX,
      FILL_EDGE_AA_RADIUS,
      FILL_MEMORY_POLICY,
      MAX_FILL_TOLERANCE,
      RASTER_BYTES_PER_PIXEL,
      RASTER_MIB,
      THRESHOLD_HIDE_DELAY_MS,
      clamp,
      getRasterRectBytes,
      getRectCoverage,
      getReferenceLayerId,
      namespace,
      parseHexColor,
    };
    const install = (moduleName) => {
      const installer = modules[moduleName];

      if (typeof installer !== "function") {
        throw new Error("Color fill module missing: " + moduleName);
      }

      const installed = installer(context) || {};

      Object.assign(context, installed);

      return installed;
    };

    install("worker");
    install("reference");
    install("mask");
    install("history");

    return context;
  }

  const {
    applyFillToDirtyPixels,
    canUseColorFillWorker,
    combineContainsPredicates,
    compositeFillPixelPremultiplied,
    createAlphaMaskContains,
    createDirtyRect,
    createFillCoverageMask,
    createReferencePixelSource,
    finishColorFillFromMask,
    floodFillMask,
    getActiveFillArtboardRect,
    getClippingFillConstraint,
    getDilationRadius,
    getExistingRasterTarget,
    getFillAnalysisRect,
    getFillCoveragePadding,
    getFillMaskMemoryBytes,
    getReferenceClipRect,
    getReferencePixelOffset,
    getReferenceTarget,
    getWritableLayerInfo,
    intersectRects,
    isColorFillWorkerEnabled,
    isPointInsideRect,
    runColorFillWorker,
  } = installColorFillModules();

  function dropColorAt(clientX, clientY, colorHex, options = {}) {
    const brushEngine = namespace.brushEngine;
    const renderer = namespace.documentRenderer;
    const gl = renderer?.gl || renderer?.context;

    if (!brushEngine?.screenToDocumentSpace || !renderer || !gl) {
      return false;
    }

    const point = brushEngine.screenToDocumentSpace(clientX, clientY);
    const pointerArtboard = namespace.selectDocumentArtboardAtPoint?.(point, {
      source: "color-fill-pointer-artboard",
    }) || null;
    const writableLayer = getWritableLayerInfo({
      artboardId: pointerArtboard?.id,
    });

    if (!writableLayer?.layerId) {
      return false;
    }

    const seedX = Math.floor(point.docX);
    const seedY = Math.floor(point.docY);
    const activeArtboardRect = getActiveFillArtboardRect(writableLayer.layerId);
    const fillBounds = activeArtboardRect || {
      height: Math.max(1, Math.round(renderer.height || writableLayer.existingTarget?.height || 1)),
      width: Math.max(1, Math.round(renderer.width || writableLayer.existingTarget?.width || 1)),
      x: 0,
      y: 0,
    };
    const width = Math.max(1, Math.round(fillBounds.width || 1));
    const height = Math.max(1, Math.round(fillBounds.height || 1));

    if (!isPointInsideRect(seedX, seedY, fillBounds)) {
      return false;
    }

    const selectionRegion = namespace.areaSelection?.hasSelection?.()
      ? namespace.areaSelection.getRegionSnapshot?.()
      : null;
    const selectionRect = selectionRegion?.getBounds?.() || (
      namespace.areaSelection?.hasSelection?.()
        ? namespace.areaSelection.getRect?.()
        : null
    );
    const selectionContains = selectionRegion
      ? (docX, docY) => selectionRegion.containsPoint?.(docX, docY) === true
      : selectionRect
        ? (docX, docY) => namespace.areaSelection.isPointInside?.(docX, docY) !== false
        : null;
    const artboardContains = activeArtboardRect
      ? (docX, docY) => isPointInsideRect(docX, docY, activeArtboardRect)
      : null;
    const clippingConstraint = getClippingFillConstraint(gl, writableLayer, fillBounds);
    const clippingMaskContains = clippingConstraint?.containsPoint || null;
    const clipContains = combineContainsPredicates(
      selectionContains,
      artboardContains,
      clippingMaskContains,
    );

    if (clipContains && !clipContains(seedX, seedY)) {
      return false;
    }

    const tolerance = clamp(options.tolerance ?? fillTolerance, 0, MAX_FILL_TOLERANCE);
    const referenceLayerId = getReferenceLayerId();
    const referenceTarget = getReferenceTarget(writableLayer.layerId, writableLayer.existingTarget);
    const useExplicitReference = Boolean(
      referenceLayerId &&
      referenceLayerId !== writableLayer.layerId &&
      referenceTarget &&
      referenceTarget !== writableLayer.existingTarget
    );
    let referenceClipRect = getReferenceClipRect(fillBounds, selectionRect);

    if (clippingConstraint) {
      referenceClipRect = intersectRects(referenceClipRect, clippingConstraint.rect);
    }

    if (!referenceClipRect || !isPointInsideRect(seedX, seedY, referenceClipRect)) {
      return false;
    }

    const referenceSource = createReferencePixelSource(gl, referenceTarget, {
      boundAnalysis: useExplicitReference,
      clipRect: referenceClipRect,
    });
    const analysisRect = getFillAnalysisRect(referenceSource, width, height, seedX, seedY, referenceClipRect);

    if (!analysisRect) {
      return false;
    }

    const analysisSeedX = seedX - analysisRect.x;
    const analysisSeedY = seedY - analysisRect.y;
    const fillContext = {
      activeArtboardRect,
      analysisRect,
      clipContains,
      colorHex,
      fillBounds,
      gl,
      height,
      referenceClipRect,
      referenceSource,
      renderer,
      selectionRect,
      selectionRegion,
      tolerance,
      width,
      writableLayer,
    };
    const runSyncFill = () => {
      const fillResult = floodFillMask(
        referenceSource,
        analysisRect.width,
        analysisRect.height,
        analysisSeedX,
        analysisSeedY,
        tolerance,
        analysisRect.x,
        analysisRect.y,
        { selectionContains: clipContains },
      );

      if (!fillResult) {
        return false;
      }

      const coverageRadius = getDilationRadius(tolerance);
      const coverageMask = createFillCoverageMask(
        fillResult.mask,
        analysisRect.width,
        analysisRect.height,
        fillResult.bounds,
        coverageRadius,
      );

      return finishColorFillFromMask(fillContext, fillResult, coverageMask);
    };

    if (canUseColorFillWorker({
      analysisRect,
      clippingMaskContains,
      referenceSource,
      selectionRect,
      selectionRegion,
    })) {
      const jobId = fillWorkerJobSequence + 1;

      fillWorkerJobSequence = jobId;
      runColorFillWorker(referenceSource, analysisRect, analysisSeedX, analysisSeedY, tolerance)
        .then((workerResult) => {
          if (jobId !== fillWorkerJobSequence) {
            return false;
          }

          if (!workerResult) {
            return false;
          }

          return finishColorFillFromMask(
            fillContext,
            workerResult.fillResult,
            workerResult.coverageMask,
          );
        })
        .catch(() => {
          if (jobId !== fillWorkerJobSequence) {
            return false;
          }

          return runSyncFill();
        });

      return true;
    }

    return runSyncFill();
  }

  namespace.__colorFillTestHooks = Object.freeze({
    applyFillToDirtyPixels,
    createAlphaMaskContains,
    compositeFillPixelPremultiplied,
    combineContainsPredicates,
    createDirtyRect,
    createFillCoverageMask,
    floodFillMask,
    getDilationRadius,
    getFillCoveragePadding,
    getFillMaskMemoryBytes,
  });

  namespace.colorFill = {
    beginDropDrag,
    cancelDropDrag,
    clearReferenceLayerId,
    dropColorAt,
    endDropDrag,
    getReferenceLayerId,
    getTolerance,
    setReferenceLayerId,
    setTolerance,
    showThresholdControl,
  };
})(window.CBO = window.CBO || {});
