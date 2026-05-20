window.CBO = window.CBO || {};



(function registerSpaceBoardRenderJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before space-board-render.js.");

  }



  Controller.prototype.renderSpaceBoards = function renderSpaceBoards() {
    with (this) {

    const renderStartedAt = performance.now?.() || Date.now();
    const aiBoards = spaceBoards.filter((board) => board.type === "ai-image");
    const layer = ensureSpaceBoardLayer();
    const pane = renderSpaceBoardPaneTransform();
    const viewState = getCameraState();
    const viewScale = getViewScale();
    const visibleViewportRect = getSpaceBoardVisibleDocumentRect(0);
    const nearViewportRect = getSpaceBoardVisibleDocumentRect(getSpaceBoardLazyMarginDocPx());
    const runtimePreviewCacheStats = getAiImageRuntimePreviewCacheStats();
    const cameraMotionActive = isAiBoardCameraMotionActive();
    const metrics = createEmptyAiBoardMetrics({
      cameraMoving: cameraMotionActive,
      dpr: roundMetricValue(viewState.dpr, 2),
      generatingBoards: aiImageGeneratingBoardIds.size,
      lastGenerateStatus: formatAiImageGenerationStatus(getLastAiImageGenerationStatus()),
      runtimePreviewCacheCount: runtimePreviewCacheStats.readyCount,
      runtimePreviewCacheMB: runtimePreviewCacheStats.decodedMB,
      runtimePreviewLoadingCount: runtimePreviewCacheStats.loadingCount,
      stateBoards: aiBoards.length,
      zoom: roundMetricValue(viewState.camera.zoom, 5),
    });

    if (!layer || !pane) {
      syncAiImageBoardMobileActionToolbar("");
      metrics.frameMs = roundMetricValue((performance.now?.() || Date.now()) - renderStartedAt, 2);
      publishAiBoardMetrics(metrics);
      return;
    }

    const renderedIds = new Set();

    aiBoards.forEach((board) => {
      const boardRect = getSpaceBoardRect(board);
      const visibilityState = getAiBoardVisibilityState(boardRect, visibleViewportRect, nearViewportRect);
      const element = ensureAiImageBoardElement(board.id);

      if (visibilityState === "visible") {
        metrics.visibleAiBoards += 1;
      } else if (visibilityState === "near") {
        metrics.nearAiBoards += 1;
      } else {
        metrics.offscreenAiBoards += 1;
      }

      if (!element) {
        return;
      }

      renderedIds.add(board.id);

      const docWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const docHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
      const plainArtboardMode = shouldUsePlainAiBoardArtboards();
      const point = plainArtboardMode
        ? documentPointToStagePoint({ x: board.x, y: board.y }, viewState)
        : { x: 0, y: 0 };
      const width = plainArtboardMode
        ? Math.max(1, docWidth * viewScale)
        : docWidth;
      const height = plainArtboardMode
        ? Math.max(1, docHeight * viewScale)
        : docHeight;
      const label = element.querySelector("[data-ai-image-board-drag-handle]");
      const dimensions = element.querySelector("[data-ai-image-board-dimensions]");
      const shouldMountHeavy = !plainArtboardMode && shouldMountAiImageBoardHeavyContent(board, element);
      const isNearViewport = visibilityState !== "offscreen";
      const isMobileLean = isMobileLikeSpaceBoardViewport() &&
        getSpaceBoardMinScreenSize(board) < SPACE_BOARD_MOBILE_HEAVY_MIN_SCREEN_PX;

      if (shouldMountHeavy) {
        ensureAiImageBoardHeavyContent(element);
      } else {
        unmountAiImageBoardHeavyContent(element);
      }

      const promptInput = element.querySelector("[data-ai-image-board-prompt-input]");
      const isHeavyMounted = element.dataset.aiImageBoardHeavyMounted === "true";
      const isGenerating = aiImageGeneratingBoardIds.has(board.id);
      const generationStatus = getAiImageGenerationStatus(board.id);
      const generateButton = element.querySelector("[data-ai-image-board-generate]");
      const mediaHost = element.querySelector("[data-ai-image-board-media]");
      const isSelected = selectedSpaceBoardId === board.id;
      const generationKind = getAiImageBoardGenerationKind(board);
      const isFocusedOrSelected = isSelected || isSpaceBoardFocusedOrSelected(board, element);
      const shouldDeferPreviewWork = cameraMotionActive && !isGenerating && !isFocusedOrSelected;
      const shouldUnloadMedia = !shouldDeferPreviewWork && shouldUnloadAiBoardMedia(board, visibilityState, element);
      const shouldUpdatePreviewLod = visibilityState === "visible" && !shouldDeferPreviewWork;
      const handleMetrics = getActionBubbleMetrics(1, docWidth, docHeight);
      const plainControlMetrics = getAiImagePlainControlMetrics(plainArtboardMode ? viewScale : 1, docWidth, docHeight);
      const selectionShadowMetrics = getAiImageSelectionShadowMetrics(plainArtboardMode ? viewScale : 1);
      const boardRadius = AI_IMAGE_BOARD_RADIUS_DOC_PX * (plainArtboardMode ? viewScale : 1);
      const boardOutlineWidth = AI_IMAGE_BOARD_OUTLINE_DOC_PX * (plainArtboardMode ? viewScale : 1);
      const captionScale = plainArtboardMode ? viewScale : 1;
      const captionInset = AI_IMAGE_CAPTION_INSET_DOC_PX * captionScale;
      const captionFontSize = AI_IMAGE_CAPTION_FONT_DOC_PX * captionScale;
      const captionLineHeight = AI_IMAGE_CAPTION_LINE_HEIGHT_DOC_PX * captionScale;
      const captionMinHeight = getAiImageCaptionMinHeightDoc() * captionScale;
      const captionPreviewHeight = getAiImageCaptionPreviewHeightDoc() * captionScale;
      const captionMaxHeight = getAiImageCaptionMaxHeightDoc(docHeight) * captionScale;
      const captionHeight = Math.min(
        captionMaxHeight,
        isSelected
          ? Math.max(captionPreviewHeight, getAiImageCaptionStoredHeightDoc(element) * captionScale)
          : captionPreviewHeight,
      );
      const captionPaddingX = AI_IMAGE_CAPTION_PADDING_X_DOC_PX * captionScale;
      const captionPaddingY = AI_IMAGE_CAPTION_PADDING_Y_DOC_PX * captionScale;
      const captionEditorRadius = AI_IMAGE_CAPTION_EDITOR_RADIUS_DOC_PX * captionScale;
      const captionFocusRingWidth = AI_IMAGE_CAPTION_FOCUS_RING_DOC_PX * captionScale;
      const captionShadowY = AI_IMAGE_CAPTION_SHADOW_Y_DOC_PX * captionScale;
      const captionShadowBlur = AI_IMAGE_CAPTION_SHADOW_BLUR_DOC_PX * captionScale;
      const labelScale = plainArtboardMode ? viewScale : 1;
      const labelMetrics = getArtboardLabelMetrics(AI_IMAGE_BOARD_SIZE_DOC_PX, AI_IMAGE_BOARD_SIZE_DOC_PX, labelScale);
      const videoMuteMetrics = plainArtboardMode ? plainControlMetrics : handleMetrics;
      const dimensionsText = `${Math.round(docWidth)} \u00d7 ${Math.round(docHeight)}`;
      const dimensionsReservedWidth = Math.max(
        labelMetrics.height * 4.8,
        labelMetrics.fontSize * dimensionsText.length * 0.62 + labelMetrics.paddingX * 2,
      );
      const labelGap = Math.max(6, labelMetrics.paddingX * 1.2);
      const boardNameMaxWidth = Math.max(24, width - dimensionsReservedWidth - labelGap);
      const videoMuteSize = videoMuteMetrics.size;
      const videoMuteInset = videoMuteMetrics.gap;
      const videoMuteIconSize = videoMuteMetrics.iconSize;

      setStylePropertyIfChanged(element, "left", `${point.x}px`);
      setStylePropertyIfChanged(element, "top", `${point.y}px`);
      setStylePropertyIfChanged(element, "width", `${width}px`);
      setStylePropertyIfChanged(element, "height", `${height}px`);
      setCssVarIfChanged(element, "--ai-plain-control-size", `${plainControlMetrics.size}px`);
      setCssVarIfChanged(element, "--ai-plain-control-outside-offset", `${plainControlMetrics.outsideOffset}px`);
      setCssVarIfChanged(element, "--ai-plain-control-border-width", `${plainControlMetrics.borderWidth}px`);
      setCssVarIfChanged(element, "--ai-plain-control-icon-size", `${plainControlMetrics.iconSize}px`);
      setCssVarIfChanged(element, "--ai-image-board-selection-shadow-y", `${selectionShadowMetrics.y}px`);
      setCssVarIfChanged(element, "--ai-image-board-selection-shadow-blur", `${selectionShadowMetrics.blur}px`);
      setCssVarIfChanged(element, "--ai-image-board-selection-shadow-secondary-y", `${selectionShadowMetrics.secondaryY}px`);
      setCssVarIfChanged(element, "--ai-image-board-selection-shadow-secondary-blur", `${selectionShadowMetrics.secondaryBlur}px`);
      setCssVarIfChanged(element, "--ai-image-board-selection-shadow-rise", `${selectionShadowMetrics.rise}px`);
      setCssVarIfChanged(element, "--ai-caption-inset", `${captionInset}px`);
      setCssVarIfChanged(element, "--ai-caption-font-size", `${captionFontSize}px`);
      setCssVarIfChanged(element, "--ai-caption-line-height", `${captionLineHeight}px`);
      setCssVarIfChanged(element, "--ai-caption-min-height", `${captionMinHeight}px`);
      setCssVarIfChanged(element, "--ai-caption-preview-height", `${captionPreviewHeight}px`);
      setCssVarIfChanged(element, "--ai-caption-max-height", `${captionMaxHeight}px`);
      setCssVarIfChanged(element, "--ai-caption-height", `${captionHeight}px`);
      setCssVarIfChanged(element, "--ai-caption-padding-x", `${captionPaddingX}px`);
      setCssVarIfChanged(element, "--ai-caption-padding-y", `${captionPaddingY}px`);
      setCssVarIfChanged(element, "--ai-caption-editor-radius", `${captionEditorRadius}px`);
      setCssVarIfChanged(element, "--ai-caption-focus-ring-width", `${captionFocusRingWidth}px`);
      setCssVarIfChanged(element, "--ai-caption-shadow-y", `${captionShadowY}px`);
      setCssVarIfChanged(element, "--ai-caption-shadow-blur", `${captionShadowBlur}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-height", `${labelMetrics.height}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-padding-x", `${labelMetrics.paddingX}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-radius", `${labelMetrics.radius}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-font-size", `${labelMetrics.fontSize}px`);
      setCssVarIfChanged(element, "--editor-artboard-label-top", `${labelMetrics.top}px`);
      setCssVarIfChanged(element, "--ai-board-name-max-width", `${boardNameMaxWidth}px`);
      element.dataset.aiCaptionLod = "visible";
      element.dataset.aiControlLod = "visible";
      const boardTransform = plainArtboardMode
        ? "none"
        : `translate3d(${Number(board.x) || 0}px, ${Number(board.y) || 0}px, 0)`;

      setStylePropertyIfChanged(element, "transform", boardTransform);
      setCssVarIfChanged(element, "--ai-image-board-radius", `${boardRadius}px`);
      setCssVarIfChanged(element, "--ai-image-board-outline-width", `${boardOutlineWidth}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-size", `${handleMetrics.sizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-left", `${(handleMetrics.sizeDoc + handleMetrics.gapDoc) * -1}px`);
      setCssVarIfChanged(element, "--ai-image-input-handle-top", `${docHeight - handleMetrics.gapDoc - handleMetrics.sizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-border-width", `${handleMetrics.borderWidthDoc}px`);
      setCssVarIfChanged(element, "--ai-image-input-icon-size", `${handleMetrics.iconSizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-size", `${handleMetrics.sizeDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-left", `${docWidth + handleMetrics.gapDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-handle-top", `${handleMetrics.gapDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-border-width", `${handleMetrics.borderWidthDoc}px`);
      setCssVarIfChanged(element, "--ai-image-generate-icon-size", `${handleMetrics.iconSizeDoc}px`);
      setCssVarIfChanged(element, "--ai-video-mute-handle-size", `${videoMuteSize}px`);
      setCssVarIfChanged(element, "--ai-video-mute-inset", `${videoMuteInset}px`);
      setCssVarIfChanged(element, "--ai-video-mute-icon-size", `${videoMuteIconSize}px`);
      element.classList.toggle("is-generating", isGenerating && (plainArtboardMode || isHeavyMounted));
      element.classList.toggle("is-heavy-mounted", isHeavyMounted);
      element.classList.toggle("is-near-viewport", isNearViewport);
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-video-generation", generationKind === "video");
      element.classList.toggle("is-mobile-lean", isMobileLean);
      element.classList.remove("is-control-lod-hidden", "is-control-lod-compact");
      element.classList.toggle("has-generated-media", Boolean(board.generatedMedia?.src));
      element.classList.toggle("is-preview-work-deferred", shouldDeferPreviewWork);
      updateAiImageBoardActionToolbarState(element.querySelector("[data-ai-image-board-action-toolbar]"), board);
      updateAiImageBoardActionToolbarPlacement(element, isSelected);
      updateAiImageCaptionControls(element, board, isSelected);
      if (generateButton) {
        generateButton.disabled = isGenerating;
        generateButton.classList.toggle("is-loading", isGenerating);
        generateButton.setAttribute("aria-label", generationKind === "video" ? "Generate video" : "Generate image");
        if (isGenerating) {
          generateButton.setAttribute("aria-busy", "true");
        } else {
          generateButton.removeAttribute("aria-busy");
        }
      }

      const currentMediaLod = getAiBoardCurrentLod(board, mediaHost);
      const hasActivePreviewBeforeRender = isAiBoardPreviewActive(mediaHost);
      const shouldAllowInitialPreviewPaint = Boolean(board.generatedMedia?.src) &&
        visibilityState === "visible" &&
        !hasActivePreviewBeforeRender;
      const shouldRenderEmptyPreviewState = !board.generatedMedia?.src && (isGenerating || !shouldDeferPreviewWork);
      const rawRecommendedLod = shouldUnloadMedia
        ? "unloaded"
        : shouldUpdatePreviewLod
          ? getAiBoardRecommendedLod(board, width, height, viewState.dpr)
          : currentMediaLod || "deferred";
      const stableRecommendedLod = shouldUnloadMedia || !shouldUpdatePreviewLod
        ? rawRecommendedLod
        : getStableAiBoardRecommendedLod(board, width, height, viewState.dpr, mediaHost);
      const heldLodForCameraMotion = shouldUnloadMedia || !shouldUpdatePreviewLod
        ? ""
        : getAiBoardHeldLodDuringCameraMotion(mediaHost, board.generatedMedia);
      const recommendedLod = heldLodForCameraMotion || stableRecommendedLod;

      if (shouldUpdatePreviewLod && rawRecommendedLod !== recommendedLod) {
        preloadAiImageBoardRuntimeLod(board.generatedMedia, rawRecommendedLod);
      }

      if (shouldDeferPreviewWork) {
        metrics.deferredPreviewBoards += 1;
      }

      if (
        (plainArtboardMode || isHeavyMounted) &&
        (shouldAllowInitialPreviewPaint || shouldUpdatePreviewLod || shouldUnloadMedia || shouldRenderEmptyPreviewState)
      ) {
        renderAiImageBoardGeneratedMedia(element, board, { recommendedLod });
      }
      syncAiImageBoardVideoSelectionPlayback(mediaHost, board);

      if (shouldUnloadMedia) {
        const evictedCount = evictAiImageRuntimePreviewVariantsForSrc(board.generatedMedia?.src || "");

        if (evictedCount > 0) {
          recordAiBoardPreviewDebugEvent("runtime-preview-evict-offscreen", {
            boardId: board.id,
            count: evictedCount,
            src: board.generatedMedia?.src || "",
            visibility: visibilityState,
          });
        }
      }

      const activePreview = isAiBoardPreviewActive(mediaHost);
      const currentLod = getAiBoardCurrentLod(board, mediaHost);
      const decodedMB = roundMetricValue(estimateAiBoardDecodedMB(board, currentLod, activePreview), 2);
      const previewDebug = getAiBoardPreviewDebugSnapshot(element, mediaHost);

      if (activePreview) {
        metrics.activePreviewCount += 1;
      }

      metrics.estimatedDecodedMB += decodedMB;
      metrics.boards.push({
        activePreview,
        currentLod,
        estimatedDecodedMB: decodedMB,
        generationMessage: generationStatus?.message || "",
        generationSampleKind: generationStatus?.sampleKind || "",
        generationSampleName: generationStatus?.sampleName || "",
        generationStatus: generationStatus?.status || "",
        generated: Boolean(board.generatedMedia?.src),
        id: board.id,
        isGenerating,
        mediaKind: board.generatedMedia?.kind || "",
        name: board.name || "AI Image board",
        controlLod: plainControlMetrics.lod,
        previewDeferred: shouldDeferPreviewWork,
        previewDebug,
        previewSource: mediaHost?.dataset?.mediaPreviewSource || "",
        previewSrc: summarizeAiBoardPreviewSrc(mediaHost?.dataset?.mediaPreviewSrc || ""),
        recommendedLod,
        screenHeight: roundMetricValue(height, 2),
        screenWidth: roundMetricValue(width, 2),
        visibility: visibilityState,
      });

      if (label) {
        label.textContent = board.name || "AI Image board";
      }

      if (dimensions) {
        dimensions.textContent = dimensionsText;
      }

      if (promptInput && document.activeElement !== promptInput) {
        promptInput.value = getAiImageBoardPromptText(board);
      }

      resizeAiImagePromptInput(promptInput);
    });

    layer.querySelectorAll("[data-ai-image-board]").forEach((element) => {
      const boardId = element.dataset.boardId || "";

      if (!renderedIds.has(boardId)) {
        clearAiImageGenerationPreview(boardId);
        if (selectedSpaceBoardId === boardId) {
          selectedSpaceBoardId = "";
        }
        element.remove();
      }
    });

    syncAiImageBoardMobileActionToolbar(
      !spaceBoardDrag && renderedIds.has(selectedSpaceBoardId) ? selectedSpaceBoardId : "",
    );
    syncAiImageEditPreviewViewerFromBoard();

    const finalRuntimePreviewCacheStats = getAiImageRuntimePreviewCacheStats();

    metrics.renderedAiBoards = renderedIds.size;
    metrics.runtimePreviewCacheCount = finalRuntimePreviewCacheStats.readyCount;
    metrics.runtimePreviewCacheMB = finalRuntimePreviewCacheStats.decodedMB;
    metrics.runtimePreviewLoadingCount = finalRuntimePreviewCacheStats.loadingCount;
    metrics.previewDebugEvents = aiBoardPreviewDebugEvents.map((event) => ({ ...event }));
    metrics.estimatedDecodedMB = roundMetricValue(metrics.estimatedDecodedMB, 2);
    metrics.frameMs = roundMetricValue((performance.now?.() || Date.now()) - renderStartedAt, 2);
    publishAiBoardMetrics(metrics);
    }
  };

  Controller.prototype.getConnectionById = function getConnectionById(connectionId) {
    with (this) {

    const normalizedId = String(connectionId || "").trim();

    if (!normalizedId) {
      return null;
    }

    return connections.find((connection) => connection.id === normalizedId) || null;
    }
  };

})(window.CBO);
