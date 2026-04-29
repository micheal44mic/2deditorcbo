(function registerVectorTextRasterizer(namespace) {
  const TEXT_LAYER_TYPE = "vector-text";

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

  function safeSelectorId(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value || "").replace(/["\\]/g, "\\$&");
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

  function createRasterSvg(layerNode, size) {
    const sourceSvg = namespace.vectorTextRenderer?.svg || document.querySelector(".editor-vector-overlay");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const defs = sourceSvg?.querySelector("defs")?.cloneNode(true);
    const clonedLayer = layerNode.cloneNode(true);

    clonedLayer.classList.remove("active");
    clonedLayer.querySelectorAll(".editor-vector-envelope-ui").forEach((node) => node.remove());

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(size.width));
    svg.setAttribute("height", String(size.height));
    svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);

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

  async function renderLayerNodeToCanvas(layerNode, size) {
    const svgMarkup = createRasterSvg(layerNode, size);
    const image = await loadSvgImage(svgMarkup);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
      throw new Error("Canvas 2D non disponibile per rasterizzare il testo.");
    }

    canvas.width = size.width;
    canvas.height = size.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
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

  async function rasterizeVectorTextLayer(layerId) {
    const layerModel = namespace.documentLayerModel;
    const renderer = namespace.documentRenderer;
    const rasterizer = namespace.imageRasterizer;
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

    const rasterLayer = layerModel.createLayer({
      locked: layer.locked === true,
      name: layer.name || "Text",
      opacity: 1,
      type: "paint",
      visible: layer.visible !== false,
    });
    const size = getDocumentSize();
    const canvas = await renderLayerNodeToCanvas(layerNode, size);
    const target = renderer.getRasterTarget(rasterLayer.id);

    renderer.clearLayer?.(rasterLayer.id);
    rasterizer.placeRasterImage(canvas, {
      layerId: rasterLayer.id,
      target,
      x: 0,
      y: 0,
    });

    const entries = layerModel.getEntries();
    const didReplace = replaceEntry(entries, layer.id, rasterLayer);

    if (!didReplace) {
      entries.unshift(rasterLayer);
    }

    layerModel.setEntries(entries, { source: "vector-text-rasterize" });
    layerModel.setActiveLayer(rasterLayer.id, { source: "vector-text-rasterize" });
    namespace.brushEngine?.requestDraw?.();

    window.dispatchEvent(new CustomEvent("cbo:vector-text-rasterized", {
      detail: {
        rasterLayer: cloneValue(rasterLayer),
        sourceLayerId: layer.id,
      },
    }));

    return cloneValue(rasterLayer);
  }

  namespace.rasterizeVectorTextLayer = rasterizeVectorTextLayer;
  namespace.rasterizeActiveVectorTextLayer = () => rasterizeVectorTextLayer();
})(window.CBO = window.CBO || {});
