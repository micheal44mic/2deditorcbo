(function registerColorFillWorkerModule(namespace) {
  namespace.ColorFillModules = namespace.ColorFillModules || {};

  namespace.ColorFillModules.worker = function installColorFillWorkerModule(context) {
    const {
      COLOR_FILL_WORKER_TIMEOUT_MS,
      namespace,
    } = context;

  function isColorFillWorkerEnabled() {
    return namespace.colorFillWorkerEnabled !== false;
  }

  function getPixelWorkerClient() {
    if (!isColorFillWorkerEnabled()) {
      return null;
    }

    if (namespace.pixelWorkerClient?.runColorFill) {
      return namespace.pixelWorkerClient;
    }

    return namespace.createPixelWorkerClient?.() || null;
  }

  function canUseColorFillWorker(context = {}) {
    const client = getPixelWorkerClient();
    const referenceSource = context.referenceSource;
    const analysisRect = context.analysisRect;
    const sourceEmpty = referenceSource?.empty === true;
    const sourceDense = referenceSource?.pixels instanceof Uint8Array;
    const sourceSparse = referenceSource?.sparse === true &&
      Array.isArray(referenceSource.tiles) &&
      referenceSource.tiles.length > 0;

    if (!client?.runColorFill) {
      return false;
    }

    if (client.getSupported?.() === false) {
      return false;
    }

    if (!analysisRect) {
      return false;
    }

    if (context.selectionRegion || context.selectionRect) {
      return false;
    }

    if (context.clippingMaskContains) {
      return false;
    }

    if (sourceEmpty || sourceSparse) {
      return true;
    }

    if (!sourceDense) {
      return false;
    }

    const rectMatchesAnalysis =
      referenceSource.x === analysisRect.x &&
      referenceSource.y === analysisRect.y &&
      referenceSource.width === analysisRect.width &&
      referenceSource.height === analysisRect.height;

    if (!rectMatchesAnalysis) {
      return false;
    }

    return true;
  }

  function createSparseWorkerPayload(referenceSource, transferList) {
    const tileSize = Math.max(1, Math.round(referenceSource?.tileSize || 1));
    const sparseTiles = [];

    referenceSource?.tiles?.forEach?.((tileSource) => {
      if (!(tileSource?.pixels instanceof Uint8Array)) {
        return;
      }

      const pixels = new Uint8Array(tileSource.pixels);
      const x = Math.round(Number(tileSource.x) || 0);
      const y = Math.round(Number(tileSource.y) || 0);
      const width = Math.max(1, Math.round(Number(tileSource.width) || 1));
      const height = Math.max(1, Math.round(Number(tileSource.height) || 1));
      const tx = Number.isFinite(tileSource.tx) ? Math.round(tileSource.tx) : Math.floor(x / tileSize);
      const ty = Number.isFinite(tileSource.ty) ? Math.round(tileSource.ty) : Math.floor(y / tileSize);

      transferList.push(pixels.buffer);
      sparseTiles.push({
        height,
        pixelsBuffer: pixels.buffer,
        tx,
        ty,
        width,
        x,
        y,
      });
    });

    return {
      sourceSparse: true,
      sparseTiles,
      tileSize,
    };
  }

  function runColorFillWorker(referenceSource, analysisRect, seedX, seedY, tolerance) {
    const client = getPixelWorkerClient();
    const sourceEmpty = referenceSource?.empty === true;
    const sourceSparse = referenceSource?.sparse === true;
    const sourceDense = referenceSource?.pixels instanceof Uint8Array;

    if (!client?.runColorFill || (!sourceEmpty && !sourceSparse && !sourceDense)) {
      return Promise.reject(new Error("Color fill worker unavailable."));
    }

    const transferList = [];
    const payload = {
      height: analysisRect.height,
      originX: analysisRect.x,
      originY: analysisRect.y,
      pixelsBuffer: null,
      seedX,
      seedY,
      sourceEmpty,
      sourceSparse: false,
      tolerance,
      width: analysisRect.width,
    };

    if (sourceSparse) {
      Object.assign(payload, createSparseWorkerPayload(referenceSource, transferList));

      if (payload.sparseTiles.length === 0) {
        return Promise.reject(new Error("Color fill sparse worker source is empty."));
      }
    } else if (!sourceEmpty) {
      const workerPixels = new Uint8Array(referenceSource.pixels);

      payload.pixelsBuffer = workerPixels.buffer;
      transferList.push(workerPixels.buffer);
    }

    return client.runColorFill(payload, transferList, {
      timeoutMs: COLOR_FILL_WORKER_TIMEOUT_MS,
    }).then((result) => {
      if (!result?.maskBuffer || !result?.coverageMaskBuffer || !result.bounds) {
        return null;
      }

      return {
        coverageMask: new Uint8Array(result.coverageMaskBuffer),
        fillResult: {
          bounds: result.bounds,
          filledCount: Math.max(0, Math.round(Number(result.filledCount) || 0)),
          mask: new Uint8Array(result.maskBuffer),
          stackBytes: Math.max(0, Math.round(Number(result.stackBytes) || 0)),
        },
      };
    });
  }

    return {
      isColorFillWorkerEnabled,
      getPixelWorkerClient,
      canUseColorFillWorker,
      createSparseWorkerPayload,
      runColorFillWorker,
    };
  };
})(window.CBO = window.CBO || {});
