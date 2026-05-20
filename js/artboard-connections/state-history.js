window.CBO = window.CBO || {};



(function registerStateHistoryJs(namespace) {

  const Controller = namespace.ArtboardConnectionsController;



  if (!Controller) {

    throw new Error("ArtboardConnectionsController must be loaded before state-history.js.");

  }



  Controller.prototype.cloneConnection = function cloneConnection(connection) {
    with (this) {

    return {
      ...connection,
    };
    }
  };

  Controller.prototype.clonePlainData = function clonePlainData(value) {
    with (this) {

    if (Array.isArray(value)) {
      return value.map(clonePlainData);
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, clonePlainData(entryValue)]),
    );
    }
  };

  Controller.prototype.cloneSpaceBoard = function cloneSpaceBoard(board) {
    with (this) {

    return clonePlainData(board) || {};
    }
  };

  Controller.prototype.captureConnectionsHistoryState = function captureConnectionsHistoryState(options = {}) {
    with (this) {

    const excludeConnectionIds = new Set(
      Array.isArray(options.excludeConnectionIds)
        ? options.excludeConnectionIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    return {
      connections: connections
        .filter((connection) => !excludeConnectionIds.has(String(connection?.id || "").trim()))
        .map(cloneConnection),
      spaceBoards: spaceBoards.map(cloneSpaceBoard),
    };
    }
  };

  Controller.prototype.restoreConnectionsHistoryState = function restoreConnectionsHistoryState(state, source = "history-artboard-connections") {
    with (this) {

    removeSpaceBoardDragListeners();
    connections = Array.isArray(state?.connections)
      ? state.connections.map(cloneConnection)
      : [];
    spaceBoards = Array.isArray(state?.spaceBoards)
      ? state.spaceBoards.map(cloneSpaceBoard)
      : [];
    connectionDrag = null;
    spaceBoardDrag = null;
    selectedSpaceBoardId = "";
    lastConnectionsGeometryKey = "";
    menuState = null;
    unbindMenuDismiss();
    renderConnectionOverlay();
    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));

    return true;
    }
  };

  Controller.prototype.statesAreEqual = function statesAreEqual(first, second) {
    with (this) {

    return JSON.stringify(first) === JSON.stringify(second);
    }
  };

  Controller.prototype.pushConnectionsHistoryEntry = function pushConnectionsHistoryEntry(beforeState, afterState, options = {}) {
    with (this) {

    const history = namespace.documentHistory;

    if (
      !beforeState ||
      !afterState ||
      statesAreEqual(beforeState, afterState) ||
      history?.canRecord?.(options) !== true ||
      typeof history.push !== "function"
    ) {
      return false;
    }

    const before = {
      connections: beforeState.connections.map(cloneConnection),
      spaceBoards: beforeState.spaceBoards.map(cloneSpaceBoard),
    };
    const after = {
      connections: afterState.connections.map(cloneConnection),
      spaceBoards: afterState.spaceBoards.map(cloneSpaceBoard),
    };

    return history.push({
      after,
      before,
      historyGroup: options.historyGroup || "",
      source: options.source || "artboard-connections",
      type: options.type || "artboard-connections-state",
      undo() {
        return restoreConnectionsHistoryState(this.before, `history-undo-${this.source}`);
      },
      redo() {
        return restoreConnectionsHistoryState(this.after, `history-redo-${this.source}`);
      },
      mergeWith() {
        return false;
      },
      destroy() {},
    }, options);
    }
  };

  Controller.prototype.emitConnectionsChange = function emitConnectionsChange(source = "artboard-connections") {
    with (this) {

    window.dispatchEvent(new CustomEvent("cbo:artboard-connections-change", {
      detail: {
        connections: connections.map(cloneConnection),
        source,
        spaceBoards: spaceBoards.map(cloneSpaceBoard),
      },
    }));
    }
  };

  Controller.prototype.stopSpaceBoardControlEvent = function stopSpaceBoardControlEvent(event) {
    with (this) {

    event.stopPropagation();
    }
  };

  Controller.prototype.setAiImageGenerationStatus = function setAiImageGenerationStatus(boardId, status, detail = {}) {
    with (this) {

    const normalizedBoardId = String(boardId || "").trim();

    if (!normalizedBoardId) {
      return null;
    }

    const record = {
      at: new Date().toISOString(),
      boardId: normalizedBoardId,
      status: String(status || "unknown"),
      ...detail,
    };

    aiImageGenerationStatusByBoardId.set(normalizedBoardId, record);

    return record;
    }
  };

})(window.CBO);
