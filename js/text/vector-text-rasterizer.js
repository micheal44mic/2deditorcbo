(function registerVectorTextRasterizer(namespace) {
  const TEXT_LAYER_TYPE = "vector-text";
  const TEXT_RASTER_SUPERSAMPLE_MAX_SCALE = 4;
  const TEXT_RASTER_SUPERSAMPLE_MAX_SOURCE_BYTES = 32 * 1024 * 1024;
  const TEXT_RASTER_SUPERSAMPLE_MAX_SOURCE_SIDE = 4096;

  function isVectorTextLayer(layer) {
    return layer?.type === TEXT_LAYER_TYPE || layer?.type === "text" || layer?.kind === "text";
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    }

    return value;
  }

  function normalizeLayerOpacity(value, fallback = 1) {
    const opacity = Number(value);

    return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback;
  }

  function safeSelectorId(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  function getTextRasterSupersampleScale(rasterBox) {
    const width = Math.max(1, Math.round(Number(rasterBox?.width) || 1));
    const height = Math.max(1, Math.round(Number(rasterBox?.height) || 1));
    const maxPixels = TEXT_RASTER_SUPERSAMPLE_MAX_SOURCE_BYTES / 4;
    const sideScale = TEXT_RASTER_SUPERSAMPLE_MAX_SOURCE_SIDE / Math.max(width, height);
    const pixelScale = Math.sqrt(maxPixels / Math.max(1, width * height));
    const scale = Math.floor(Math.min(TEXT_RASTER_SUPERSAMPLE_MAX_SCALE, sideScale, pixelScale));

    return Math.max(1, scale);
  }

  function findLayerNode(layerId) {
    return document.querySelector(`.editor-vector-text-layer[data-layer-id="${safeSelectorId(layerId)}"]`);
  }

  function waitForLayerNode(layerId) {
    const existingNode = findLayerNode(layerId);

    if (existingNode) {
      return Promise.resolve(existingNode);
    }

    return new Promise((resolve) => {
      let frameCount = 0;

      function tick() {
        const node = findLayerNode(layerId);

        if (node || frameCount > 60) {
          resolve(node);
          return;
        }

        frameCount += 1;
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  function getDocumentSize() {
    const renderer = namespace.documentRenderer;
    const documentRect = renderer?.getDocumentBoundsRect?.();

    if (documentRect) {
      return {
        height: Math.max(1, Math.round(Number(documentRect.height) || 1)),
        width: Math.max(1, Math.round(Number(documentRect.width) || 1)),
        x: Number.isFinite(documentRect.x) ? Math.round(documentRect.x) : 0,
        y: Number.isFinite(documentRect.y) ? Math.round(documentRect.y) : 0,
      };
    }

    return {
      height: Math.max(1, Math.round(renderer?.height || 4000)),
      width: Math.max(1, Math.round(renderer?.width || 4000)),
      x: 0,
      y: 0,
    };
  }

  function createRasterSvg(layerNode, size, rasterBox = null, rasterScale = 1) {
    const sourceSvg = namespace.vectorTextRenderer?.svg || document.querySelector(".editor-vector-overlay");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const defs = sourceSvg?.querySelector("defs")?.cloneNode(true);
    const clonedLayer = layerNode.cloneNode(true);
    const box = rasterBox || {
      height: size.height,
      width: size.width,
      x: Number.isFinite(size.x) ? size.x : 0,
      y: Number.isFinite(size.y) ? size.y : 0,
    };
    const outputWidth = Math.max(1, Math.round(box.width * Math.max(1, rasterScale)));
    const outputHeight = Math.max(1, Math.round(box.height * Math.max(1, rasterScale)));

    clonedLayer.classList.remove("active");
    clonedLayer.setAttribute("opacity", "1");
    clonedLayer.querySelectorAll(".editor-vector-envelope-ui").forEach((node) => node.remove());

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(outputWidth));
    svg.setAttribute("height", String(outputHeight));
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);

    if (defs) {
      svg.append(defs);
    }

    svg.append(clonedLayer);

    return new XMLSerializer().serializeToString(svg);
  }

  function loadSvgImage(svgMarkup) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Impossibile rasterizzare il layer testo."));
      };

      image.src = objectUrl;
    });
  }

  async function renderLayerNodeToCanvas(layerNode, size, rasterBox = null) {
    const box = rasterBox || {
      height: size.height,
      width: size.width,
      x: Number.isFinite(size.x) ? size.x : 0,
      y: Number.isFinite(size.y) ? size.y : 0,
    };
    const rasterScale = getTextRasterSupersampleScale(box);
    const outputWidth = Math.max(1, Math.round(box.width * rasterScale));
    const outputHeight = Math.max(1, Math.round(box.height * rasterScale));
    const svgMarkup = createRasterSvg(layerNode, size, box, rasterScale);
    const image = await loadSvgImage(svgMarkup);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
      throw new Error("Canvas 2D non disponibile per rasterizzare il testo.");
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  async function createRasterSource(layer, layerNode, size) {
    const vectorRenderer = namespace.vectorTextRenderer;
    let asset = vectorRenderer?.createRasterTextAsset?.(layer, { size }) || null;

    if (!asset && vectorRenderer?.createRasterTextAsset && namespace.VectorTextEngine?.loadOpenTypeFont) {
      try {
        const font = await namespace.VectorTextEngine.loadOpenTypeFont(
          layer.fontUrl || namespace.VectorTextEngine.DEFAULT_FONT_URL,
        );

        asset = vectorRenderer.createRasterTextAsset(layer, { font, size });
      } catch (error) {
        console.warn("Impossibile preparare il crop del testo rasterizzato.", error);
      }
    }

    if (asset) {
      if (!asset.rasterBox || !asset.svgMarkup) {
        return { rasterBox: null, source: null };
      }

      return {
        rasterBox: asset.rasterBox,
        source: await loadSvgImage(asset.svgMarkup),
      };
    }

    if (vectorRenderer?.createRasterTextAsset) {
      return { rasterBox: null, source: null };
    }

    const rasterBox = {
      height: size.height,
      width: size.width,
      x: Number.isFinite(size.x) ? size.x : 0,
      y: Number.isFinite(size.y) ? size.y : 0,
    };

    return {
      rasterBox,
      source: await renderLayerNodeToCanvas(layerNode, size, rasterBox),
    };
  }

  function createTextRasterizeTarget(renderer, layerId, rasterBox) {
    const target = renderer?.createRasterTargetForDocumentRect?.(layerId, rasterBox, {
      source: "vector-text-rasterize-target",
    });

    if (target?.framebuffer && target?.texture) {
      if (renderer.replaceRasterTarget?.(layerId, target, {
        emit: false,
        source: "vector-text-rasterize-target",
      })) {
        return target;
      }

      renderer.deleteRasterTargetObject?.(target);
    }

    return null;
  }

  function getRasterBoxPlacement(target, rasterBox) {
    const targetX = Number.isFinite(target?.x) ? Math.round(target.x) : 0;
    const targetY = Number.isFinite(target?.y) ? Math.round(target.y) : 0;

    return {
      x: rasterBox.x - targetX,
      y: rasterBox.y - targetY,
    };
  }

  function replaceEntry(entries, targetId, replacement) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];

      if (entry.id === targetId) {
        entries[index] = replacement;
        return true;
      }

      if (entry.type === "group" && replaceEntry(entry.children || [], targetId, replacement)) {
        return true;
      }
    }

    return false;
  }

  function createRasterizeHistoryEntry(options = {}) {
    const {
      afterState,
      beforeState,
      history,
      layerModel,
      rasterLayer,
      rasterSnapshot,
      preferSparseRestore = false,
      requiresRasterSnapshot = false,
      renderer,
    } = options;

    if (!history || !layerModel || !renderer || !rasterLayer?.id || !beforeState || !afterState) {
      return null;
    }

    const before = cloneValue(beforeState);
    const after = cloneValue(afterState);
    const rasterLayerId = rasterLayer.id;

    return {
      type: "custom",
      afterActiveLayerId: after.activeLayerId,
      afterEntries: after.entries,
      beforeActiveLayerId: before.activeLayerId,
      beforeEntries: before.entries,
      rasterLayerId,
      rasterSnapshot,
      requiresRasterSnapshot,
      source: "vector-text-rasterize",
      undo() {
        const didRestore = history.restoreLayerState(layerModel, before, {
          source: "history-undo-vector-text-rasterize",
        });

        renderer.deleteRasterTarget?.(rasterLayerId, { emit: false });
        namespace.brushEngine?.requestDraw?.();

        return didRestore;
      },
      redo() {
        const didRestore = history.restoreLayerState(layerModel, after, {
          source: "history-redo-vector-text-rasterize",
        });

        if (!didRestore) {
          return false;
        }

        if (this.requiresRasterSnapshot && !rasterSnapshot?.framebuffer) {
          history.restoreLayerState(layerModel, before, {
            source: "history-redo-vector-text-rasterize-rollback",
          });
          renderer.deleteRasterTarget?.(rasterLayerId, { emit: false });
          namespace.brushEngine?.requestDraw?.();
          return false;
        }

        if (rasterSnapshot) {
          renderer.clearLayer?.(rasterLayerId, { emit: false });

          if (!renderer.restoreRasterSnapshot?.(rasterLayerId, rasterSnapshot, {
            preferSparse: preferSparseRestore,
            replaceSparse: preferSparseRestore,
            source: "history-redo-vector-text-rasterize",
          })) {
            history.restoreLayerState(layerModel, before, {
              source: "history-redo-vector-text-rasterize-rollback",
            });
            renderer.deleteRasterTarget?.(rasterLayerId, { emit: false });
            namespace.brushEngine?.requestDraw?.();
            return false;
          }
        }

        namespace.brushEngine?.requestDraw?.();
        return true;
      },
      destroy() {
        renderer.deleteRasterSnapshot?.(rasterSnapshot);
      },
    };
  }

  function formatMiB(bytes) {
    return Math.round(((Number(bytes) || 0) / (1024 * 1024)) * 100) / 100;
  }

  function collectLayerMap(layerModel) {
    const map = new Map();

    function visit(entries = []) {
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }

        if (entry.id) {
          map.set(entry.id, entry);
        }

        if (entry.children) {
          visit(entry.children);
        }
      });
    }

    visit(layerModel?.getEntries?.() || []);

    return map;
  }

  function getTargetKind(renderer, target, rect) {
    if (renderer?.isSparseRasterTarget?.(target)) {
      return "sparse";
    }

    if (!rect) {
      return "none";
    }

    const documentWidth = Math.max(1, Math.round(renderer?.width || rect.width || 1));
    const documentHeight = Math.max(1, Math.round(renderer?.height || rect.height || 1));
    const isFullCanvas =
      rect.x === 0 &&
      rect.y === 0 &&
      rect.width === documentWidth &&
      rect.height === documentHeight;

    return isFullCanvas ? "full" : "cropped";
  }

  function summarizeRasterTarget(renderer, layerMap, layerId, target, options = {}) {
    const layer = layerMap.get(layerId) || {};
    const rect = renderer?.getRasterTargetDocumentRect?.(target) || null;
    const bytes = renderer?.estimateRasterTargetBytes?.(target) || 0;
    const kind = getTargetKind(renderer, target, rect);
    const tileCount = renderer?.isSparseRasterTarget?.(target)
      ? target.tiles?.size || 0
      : 0;

    return {
      bytes,
      height: rect?.height || 0,
      kind,
      layerId,
      MiB: formatMiB(bytes),
      name: layer.name || layerId,
      tileCount,
      transparent: options.precise === true && target?.framebuffer
        ? renderer?.isRasterTargetFullyTransparent?.(target) === true
        : null,
      type: layer.type || "",
      width: rect?.width || 0,
      x: rect?.x || 0,
      y: rect?.y || 0,
    };
  }

  function snapshotRasterTargets(renderer, layerModel, options = {}) {
    const layerMap = collectLayerMap(layerModel);
    const targets = new Map();

    renderer?.rasterTargetsByLayerId?.forEach?.((target, layerId) => {
      targets.set(layerId, summarizeRasterTarget(renderer, layerMap, layerId, target, options));
    });

    return {
      activeLayerId: layerModel?.activeLayerId || "",
      layerMap,
      targets,
    };
  }

  function diffRasterTargetSnapshots(before, after) {
    const layerIds = new Set([
      ...Array.from(before.targets.keys()),
      ...Array.from(after.targets.keys()),
    ]);

    return Array.from(layerIds).map((layerId) => {
      const beforeTarget = before.targets.get(layerId) || null;
      const afterTarget = after.targets.get(layerId) || null;
      const layer = after.layerMap.get(layerId) || before.layerMap.get(layerId) || {};
      const beforeBytes = beforeTarget?.bytes || 0;
      const afterBytes = afterTarget?.bytes || 0;

      return {
        after: afterTarget,
        afterKind: afterTarget?.kind || "none",
        afterMiB: afterTarget?.MiB || 0,
        before: beforeTarget,
        beforeKind: beforeTarget?.kind || "none",
        beforeMiB: beforeTarget?.MiB || 0,
        deltaBytes: afterBytes - beforeBytes,
        deltaMiB: formatMiB(afterBytes - beforeBytes),
        layerId,
        name: layer.name || layerId,
        type: layer.type || "",
      };
    }).filter((row) =>
      row.deltaBytes !== 0 ||
      row.beforeKind !== row.afterKind ||
      row.before?.tileCount !== row.after?.tileCount ||
      row.before?.width !== row.after?.width ||
      row.before?.height !== row.after?.height,
    );
  }

  function annotateRasterTraceEvents(events = [], layerModel) {
    const layerMap = collectLayerMap(layerModel);

    return events.map((event) => {
      const layer = layerMap.get(event.layerId) || {};

      return {
        ...event,
        layerName: layer.name || event.layerId || "",
        layerType: layer.type || "",
      };
    });
  }

  async function debugRasterizeVectorTextLayer(layerId, options = {}) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const activeLayerId = layerId || layerModel?.activeLayerId || "";
    const minMiB = Number.isFinite(Number(options.minMiB)) ? Number(options.minMiB) : 0.05;
    const shouldTrace = options.trace !== false;

    if (shouldTrace) {
      namespace.setRasterResourceTraceEnabled?.(true, {
        clear: true,
        log: options.traceLog === true,
        minMiB,
      });
    }

    const before = snapshotRasterTargets(renderer, layerModel, {
      precise: options.precise === true,
    });
    let rasterizedLayer = null;
    let error = null;

    try {
      rasterizedLayer = await rasterizeVectorTextLayer(activeLayerId);
    } catch (caughtError) {
      error = caughtError;
    }

    const after = snapshotRasterTargets(renderer, layerModel, {
      precise: options.precise === true,
    });
    const targetDeltas = diffRasterTargetSnapshots(before, after);
    const traceEvents = annotateRasterTraceEvents(
      namespace.getRasterResourceTraceEvents?.() || [],
      layerModel,
    );
    const largeTraceEvents = traceEvents.filter((event) =>
      event.action === "register-texture" ||
      Math.abs(Number(event.deltaBytes) || 0) >= minMiB * 1024 * 1024,
    );
    const fullCanvasTargetDeltas = targetDeltas.filter((row) =>
      row.afterKind === "full" && row.deltaBytes > 0,
    );
    const result = {
      activeLayerId,
      afterActiveLayerId: after.activeLayerId,
      beforeActiveLayerId: before.activeLayerId,
      error,
      fullCanvasTargetDeltas,
      largeTraceEvents,
      rasterizedLayer,
      targetDeltas,
      traceEvents,
    };

    if (options.log !== false) {
      console.groupCollapsed?.("[CBO text rasterize debug]");
      console.table?.(targetDeltas.map((row) => ({
        afterKind: row.afterKind,
        afterMiB: row.afterMiB,
        beforeKind: row.beforeKind,
        beforeMiB: row.beforeMiB,
        deltaMiB: row.deltaMiB,
        layerId: row.layerId,
        name: row.name,
        tiles: row.after?.tileCount || 0,
        type: row.type,
      })));
      console.table?.(largeTraceEvents.map((event) => ({
        action: event.action,
        category: event.category,
        deltaMiB: event.deltaMiB,
        layerId: event.layerId,
        layerName: event.layerName,
        layerType: event.layerType,
        MiB: event.MiB,
        reason: event.reason,
        size: `${event.width || 0}x${event.height || 0}`,
      })));
      if (error) {
        console.error?.(error);
      }
      console.groupEnd?.();
    }

    return result;
  }

  async function rasterizeVectorTextLayer(layerId) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const rasterizer = namespace.imageRasterizer;
    const history = namespace.documentHistory;
    const activeLayerId = layerId || layerModel?.activeLayerId;
    const layer = layerModel?.findEntryById?.(activeLayerId);

    if (!isVectorTextLayer(layer) || !renderer?.createRasterTargetForDocumentRect || !rasterizer?.placeRasterImage) {
      return null;
    }

    if (typeof namespace.vectorTextRenderer?.renderContent === "function") {
      namespace.vectorTextRenderer.renderContent();
    } else {
      namespace.vectorTextRenderer?.scheduleContentRender?.();
    }

    const layerNode = await waitForLayerNode(layer.id);

    if (!layerNode) {
      throw new Error("Layer testo non renderizzato: impossibile rasterizzare.");
    }

    const size = getDocumentSize();
    const rasterSource = await createRasterSource(layer, layerNode, size);
    if (!rasterSource.source || !rasterSource.rasterBox) {
      return null;
    }

    const beforeState = history?.getLayerSnapshot?.(layerModel) || null;
    const rasterLayer = layerModel.createLayer({
      blendMode: layer.blendMode,
      locked: layer.locked === true,
      name: layer.name || "Text",
      opacity: normalizeLayerOpacity(layer.opacity),
      type: "paint",
      visible: layer.visible !== false,
    });
    const requiresRasterSnapshot = Boolean(rasterSource.source && rasterSource.rasterBox);
    const target = requiresRasterSnapshot
      ? createTextRasterizeTarget(renderer, rasterLayer.id, rasterSource.rasterBox)
      : null;
    let finalTarget = target;

    if (requiresRasterSnapshot) {
      if (!target?.framebuffer || !target?.texture) {
        renderer.deleteRasterTarget?.(rasterLayer.id, { emit: false });
        throw new Error("Impossibile preparare il target raster del testo.");
      }

      const placement = getRasterBoxPlacement(target, rasterSource.rasterBox);

      renderer.clearLayer?.(rasterLayer.id, { emit: false });
      rasterizer.placeRasterImage(rasterSource.source, {
        drawHeight: rasterSource.rasterBox.height,
        drawWidth: rasterSource.rasterBox.width,
        emit: false,
        layerId: rasterLayer.id,
        source: "vector-text-rasterize",
        target,
        x: placement.x,
        y: placement.y,
      });
      finalTarget = renderer.sparsifyRasterTarget?.(rasterLayer.id, target, {
        emit: false,
        pruneTransparentTiles: true,
        source: "vector-text-rasterize-retile",
        tileSize: target.sparseTileSize || target.tileSize,
      }) || target;
      namespace.vectorTextRenderer?.debugTextRaster?.(
        layer,
        rasterSource.rasterBox,
        size,
        "manual-vector-text-rasterize",
      );
    }

    const rasterSnapshot = requiresRasterSnapshot
      ? renderer.createRasterSnapshot?.(finalTarget, rasterSource.rasterBox, "vector-text-rasterize")
      : null;

    if (history && requiresRasterSnapshot && !rasterSnapshot) {
      renderer.deleteRasterTarget?.(rasterLayer.id, { emit: false });
      throw new Error("Impossibile salvare lo snapshot raster del testo per Undo/Redo.");
    }

    const entries = layerModel.getEntries();
    const didReplace = replaceEntry(entries, layer.id, rasterLayer);

    if (!didReplace) {
      entries.unshift(rasterLayer);
    }

    layerModel.setEntries(entries, {
      activeLayerId: rasterLayer.id,
      history: false,
      source: "vector-text-rasterize",
    });
    const afterState = history?.getLayerSnapshot?.(layerModel) || null;
    const historyEntry = createRasterizeHistoryEntry({
      afterState,
      beforeState,
      history,
      layerModel,
      rasterLayer,
      rasterSnapshot,
      preferSparseRestore: renderer.isSparseRasterTarget?.(finalTarget) === true,
      requiresRasterSnapshot,
      renderer,
    });

    if (historyEntry) {
      history.push(historyEntry);
    } else {
      renderer.deleteRasterSnapshot?.(rasterSnapshot);
    }

    namespace.brushEngine?.requestDraw?.();

    window.dispatchEvent(new CustomEvent("cbo:vector-text-rasterized", {
      detail: {
        rasterLayer: cloneValue(rasterLayer),
        sourceLayerId: layer.id,
      },
    }));

    return cloneValue(rasterLayer);
  }

  namespace.createVectorTextRasterizeHistoryEntry = createRasterizeHistoryEntry;
  namespace.debugRasterizeVectorTextLayer = debugRasterizeVectorTextLayer;
  namespace.debugRasterizeActiveVectorTextLayer = (options = {}) => debugRasterizeVectorTextLayer(null, options);
  namespace.rasterizeVectorTextLayer = rasterizeVectorTextLayer;
  namespace.rasterizeActiveVectorTextLayer = () => rasterizeVectorTextLayer();
})(window.CBO = window.CBO || {});
