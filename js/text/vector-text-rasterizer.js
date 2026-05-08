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
    const paintTarget = renderer?.getPaintTarget?.();

    return {
      height: Math.max(1, Math.round(renderer?.height || paintTarget?.height || 4000)),
      width: Math.max(1, Math.round(renderer?.width || paintTarget?.width || 4000)),
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
      x: 0,
      y: 0,
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
      x: 0,
      y: 0,
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

    const rasterBox = {
      height: size.height,
      width: size.width,
      x: 0,
      y: 0,
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

    return renderer?.getRasterTarget?.(layerId) || null;
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

  async function rasterizeVectorTextLayer(layerId) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const rasterizer = namespace.imageRasterizer;
    const history = namespace.documentHistory;
    const activeLayerId = layerId || layerModel?.activeLayerId;
    const layer = layerModel?.findEntryById?.(activeLayerId);

    if (!isVectorTextLayer(layer) || !renderer?.getRasterTarget || !rasterizer?.placeRasterImage) {
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

    const beforeState = history?.getLayerSnapshot?.(layerModel) || null;
    const rasterLayer = layerModel.createLayer({
      blendMode: layer.blendMode,
      locked: layer.locked === true,
      name: layer.name || "Text",
      opacity: normalizeLayerOpacity(layer.opacity),
      type: "paint",
      visible: layer.visible !== false,
    });
    const size = getDocumentSize();
    const rasterSource = await createRasterSource(layer, layerNode, size);
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

    layerModel.setEntries(entries, { history: false, source: "vector-text-rasterize" });
    layerModel.setActiveLayer(rasterLayer.id, { history: false, source: "vector-text-rasterize" });
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
  namespace.rasterizeVectorTextLayer = rasterizeVectorTextLayer;
  namespace.rasterizeActiveVectorTextLayer = () => rasterizeVectorTextLayer();
})(window.CBO = window.CBO || {});
