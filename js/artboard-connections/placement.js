window.CBO = window.CBO || {};



(function registerPlacementJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before placement.js.");

  }



  Controller.prototype.getAiImageBoardFootprintRect = function getAiImageBoardFootprintRect(rect) {
    with (this) {

    if (!rect) {
      return null;
    }

    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;

    return createRect(
      rect.x - leftExtension,
      rect.y,
      rect.width + leftExtension,
      rect.height,
    );
    }
  };

  Controller.prototype.getDocumentArtboardRect = function getDocumentArtboardRect(artboard) {
    with (this) {

    return artboard
      ? createRect(artboard.x, artboard.y, artboard.width, artboard.height)
      : null;
    }
  };

  Controller.prototype.getSpaceBoardPlacementBlockers = function getSpaceBoardPlacementBlockers(options = {}) {
    with (this) {

    const excludeBoardId = String(options.excludeBoardId || "").trim();
    const gap = Number.isFinite(Number(options.gap))
      ? Math.max(0, Number(options.gap))
      : SPACE_BOARD_GAP_DOC_PX;

    return [
      ...getAllArtboards().map(getDocumentArtboardRect),
      ...spaceBoards
        .filter((board) => !excludeBoardId || board.id !== excludeBoardId)
        .map(getSpaceBoardRect)
        .map(getAiImageBoardFootprintRect),
    ]
      .filter(Boolean)
      .map((rect) => expandRect(rect, gap));
    }
  };

  Controller.prototype.resolveFreeSpaceBoardPlacement = function resolveFreeSpaceBoardPlacement(preferredRect, options = {}) {
    with (this) {

    const blockers = getSpaceBoardPlacementBlockers(options);
    const preferredFootprint = getAiImageBoardFootprintRect(preferredRect);
    const metrics = getActionBubbleMetrics();
    const leftExtension = metrics.gapDoc + metrics.sizeDoc;
    const visibleRect = options.visibleRect || null;
    const includeSurroundingCandidates = options.includeSurroundingCandidates === true;
    const getVisibleScore = (rect) => {
      const area = Math.max(1, (Number(rect?.width) || 0) * (Number(rect?.height) || 0));

      return visibleRect ? getRectOverlapArea(rect, visibleRect) / area : 0;
    };

    if (!doesRectOverlapAny(preferredFootprint, blockers)) {
      return preferredRect;
    }

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (x, y) => {
      const rect = createRect(
        Math.round(Number(x) || 0),
        Math.round(Number(y) || 0),
        preferredRect.width,
        preferredRect.height,
      );
      const key = `${rect.x}:${rect.y}`;

      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(rect);
      }
    };

    blockers.forEach((blocker) => {
      pushCandidate(blocker.x + blocker.width + leftExtension, preferredRect.y);
      pushCandidate(preferredRect.x, blocker.y + blocker.height);
      pushCandidate(blocker.x + blocker.width + leftExtension, blocker.y);
      pushCandidate(blocker.x, blocker.y + blocker.height);

      if (includeSurroundingCandidates) {
        pushCandidate(blocker.x - preferredRect.width, preferredRect.y);
        pushCandidate(preferredRect.x, blocker.y - preferredRect.height);
        pushCandidate(blocker.x - preferredRect.width, blocker.y);
        pushCandidate(blocker.x, blocker.y - preferredRect.height);
      }
    });

    blockers.forEach((horizontalBlocker) => {
      blockers.forEach((verticalBlocker) => {
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y);
        pushCandidate(horizontalBlocker.x + horizontalBlocker.width + leftExtension, verticalBlocker.y + verticalBlocker.height);

        if (includeSurroundingCandidates) {
          pushCandidate(horizontalBlocker.x - preferredRect.width, verticalBlocker.y);
          pushCandidate(horizontalBlocker.x - preferredRect.width, verticalBlocker.y + verticalBlocker.height);
        }
      });
    });

    return candidates
      .filter((rect) => !doesRectOverlapAny(getAiImageBoardFootprintRect(rect), blockers))
      .sort((first, second) => {
        const visibleDelta = getVisibleScore(second) - getVisibleScore(first);

        if (Math.abs(visibleDelta) > 0.001) {
          return visibleDelta;
        }

        return (
          Math.hypot(first.x - preferredRect.x, first.y - preferredRect.y) -
          Math.hypot(second.x - preferredRect.x, second.y - preferredRect.y)
        );
      })[0] || preferredRect;
    }
  };

  Controller.prototype.getCurrentViewportAiImageBoardPlacement = function getCurrentViewportAiImageBoardPlacement(options = {}) {
    with (this) {

    const width = Number(options.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const height = Number(options.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const stage = getStage();
    const stageRect = stage?.getBoundingClientRect?.();
    const stageWidth = Math.max(1, Number(stageRect?.width || stage?.clientWidth || window.innerWidth) || 1);
    const stageHeight = Math.max(1, Number(stageRect?.height || stage?.clientHeight || window.innerHeight) || 1);
    const viewportTopLeft = stagePointToDocumentPoint({
      x: 0,
      y: 0,
    });
    const viewportBottomRight = stagePointToDocumentPoint({
      x: stageWidth,
      y: stageHeight,
    });
    const visibleRect = createRect(
      viewportTopLeft.x,
      viewportTopLeft.y,
      Math.max(1, viewportBottomRight.x - viewportTopLeft.x),
      Math.max(1, viewportBottomRight.y - viewportTopLeft.y),
    );
    const center = stagePointToDocumentPoint({
      x: stageWidth * 0.5,
      y: stageHeight * 0.5,
    });
    const preferredRect = createRect(
      Math.round((Number(center.x) || 0) - width * 0.5),
      Math.round((Number(center.y) || 0) - height * 0.5),
      width,
      height,
    );

    return resolveFreeSpaceBoardPlacement(preferredRect, {
      gap: SPACE_BOARD_DRAG_GAP_DOC_PX,
      includeSurroundingCandidates: true,
      visibleRect,
    });
    }
  };

  Controller.prototype.getAiImageBoardInputAnchor = function getAiImageBoardInputAnchor(board) {
    with (this) {

    if (!board) {
      return null;
    }

    const boardWidth = Number(board.width) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const boardHeight = Number(board.height) || AI_IMAGE_BOARD_SIZE_DOC_PX;
    const metrics = getActionBubbleMetrics(1, boardWidth, boardHeight);

    return {
      x: (Number(board.x) || 0) -
        metrics.outsideOffsetDoc,
      y: (Number(board.y) || 0) +
        boardHeight -
        metrics.outsideOffsetDoc,
    };
    }
  };

  Controller.prototype.getConnectionEndPoint = function getConnectionEndPoint(connection) {
    with (this) {

    const targetBoard = getSpaceBoardById(connection?.targetBoardId);
    const targetAnchor = targetBoard?.type === "ai-image"
      ? getAiImageBoardInputAnchor(targetBoard)
      : null;

    if (targetAnchor) {
      return targetAnchor;
    }

    if (
      !Number.isFinite(Number(connection?.endDocX)) ||
      !Number.isFinite(Number(connection?.endDocY))
    ) {
      return null;
    }

    return {
      x: Number(connection.endDocX),
      y: Number(connection.endDocY),
    };
    }
  };

})(window.CBO);
