(function registerDocumentLayerMerge(namespace) {
  const IDENTITY_UV_MATRIX = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function normalizeLayerIds(layerIds = []) {
    const sourceIds = Array.isArray(layerIds) ? layerIds : [layerIds];
    const seen = new Set();
    const ids = [];

    sourceIds.forEach((layerId) => {
      const id = String(layerId || "").trim();

      if (!id || seen.has(id)) {
        return;
      }

      seen.add(id);
      ids.push(id);
    });

    return ids;
  }

  function normalizeOpacity(value, fallback = 1) {
    const opacity = Number(value);

    return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback;
  }

  function createFailure(reason, message) {
    return {
      message,
      ok: false,
      reason,
    };
  }

  function findEntryPath(entries = [], targetId, parent = null) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];

      if (entry?.id === targetId) {
        return {
          entry,
          index,
          parent,
          siblings: entries,
        };
      }

      if (entry?.type === "group") {
        const childPath = findEntryPath(entry.children || [], targetId, entry);

        if (childPath) {
          return childPath;
        }
      }
    }

    return null;
  }

  function createLayerLookup(layerModel) {
    const lookup = new Map();
    const layers = layerModel?.flattenTopToBottom?.() || [];

    layers.forEach((layer) => {
      if (layer?.id) {
        lookup.set(layer.id, layer);
      }
    });

    return lookup;
  }

  function isMergeableContentLayer(entry) {
    return Boolean(
      entry &&
      entry.type !== "group" &&
      entry.type !== "background" &&
      entry.id !== "background"
    );
  }

  function hasRenderableContent(renderer, layer) {
    const target = renderer?.rasterTargetsByLayerId?.get?.(layer?.id);

    return Boolean(
      renderer?.hasRenderableRasterTarget?.(target) ||
      renderer?.hasLayerPendingRasterContent?.(layer)
    );
  }

  function getLayerArtboardId(layerModel, layerId) {
    const flatLayer = layerModel?.flattenTopToBottom?.().find((layer) => layer?.id === layerId);

    return String(flatLayer?.artboardId || "").trim();
  }

  function getMergeLayerName(destinationEntry, layerCount) {
    if (layerCount <= 2 && destinationEntry?.name) {
      return destinationEntry.name;
    }

    return destinationEntry?.name || "Merged Layer";
  }

  function createMergedLayerEntry(layerModel, destinationEntry, layerCount, artboardId = "") {
    return layerModel.createLayer({
      artboardId: destinationEntry.artboardId || artboardId || "",
      id: destinationEntry.id,
      locked: false,
      name: getMergeLayerName(destinationEntry, layerCount),
      opacity: 1,
      type: "paint",
      visible: true,
    });
  }

  function resolveDocumentLayerMergePlan(layerIds = [], options = {}) {
    const layerModel = options.layerModel || namespace.documentLayerModel;
    const renderer = options.renderer || namespace.documentRenderer;
    const ids = normalizeLayerIds(layerIds);

    if (!layerModel) {
      return createFailure("missing-layer-model", "Layer model non disponibile.");
    }

    if (!renderer) {
      return createFailure("missing-renderer", "Renderer non disponibile.");
    }

    if (ids.length < 2) {
      return createFailure("not-enough-layers", "Seleziona almeno due layer.");
    }

    const entries = layerModel.getEntries?.() || [];
    const flatLookup = createLayerLookup(layerModel);
    const paths = ids.map((id) => findEntryPath(entries, id));

    if (paths.some((path) => !path)) {
      return createFailure("missing-layer", "Uno dei layer selezionati non esiste piu.");
    }

    if (paths.some((path) => !isMergeableContentLayer(path.entry))) {
      return createFailure("non-content-layer", "Puoi unire solo layer contenuto, non gruppi o background.");
    }

    if (paths.some((path) => path.entry.locked === true)) {
      return createFailure("locked-layer", "Sblocca i layer prima di unirli.");
    }

    if (paths.some((path) => flatLookup.get(path.entry.id)?.visible === false || path.entry.visible === false)) {
      return createFailure("hidden-layer", "Rendi visibili i layer prima di unirli.");
    }

    const firstSiblings = paths[0].siblings;

    if (paths.some((path) => path.siblings !== firstSiblings)) {
      return createFailure("different-parents", "I layer da unire devono stare nello stesso gruppo.");
    }

    const artboardIds = new Set(paths.map((path) => String(flatLookup.get(path.entry.id)?.artboardId || "").trim()));

    if (artboardIds.size > 1) {
      return createFailure("different-artboards", "I layer da unire devono stare nello stesso artboard.");
    }

    const sortedPaths = paths.slice().sort((first, second) => first.index - second.index);
    const selectedIndexSet = new Set(sortedPaths.map((path) => path.index));
    const firstIndex = sortedPaths[0].index;
    const lastIndex = sortedPaths[sortedPaths.length - 1].index;

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      if (!selectedIndexSet.has(index)) {
        return createFailure("not-contiguous", "I layer da unire devono essere contigui.");
      }
    }

    const destinationPath = sortedPaths[sortedPaths.length - 1];

    if (destinationPath.entry.clippingMask === true) {
      return createFailure("missing-clipping-base", "Includi anche il layer base della clipping mask.");
    }

    for (const path of sortedPaths) {
      if (path.entry.clippingMask !== true) {
        continue;
      }

      const hasSelectedBaseBelow = sortedPaths.some((candidate) =>
        candidate.index > path.index &&
        candidate.entry.clippingMask !== true
      );

      if (!hasSelectedBaseBelow) {
        return createFailure("missing-clipping-base", "Includi anche il layer base della clipping mask.");
      }
    }

    const artboardId = [...artboardIds][0] || "";
    const selectedIdSet = new Set(ids);
    const destinationEntry = destinationPath.entry;
    const mergedEntry = createMergedLayerEntry(layerModel, destinationEntry, sortedPaths.length, artboardId);
    const nextSiblings = firstSiblings
      .map((entry) => {
        if (!selectedIdSet.has(entry.id)) {
          return entry;
        }

        return entry.id === destinationEntry.id ? mergedEntry : null;
      })
      .filter(Boolean);

    firstSiblings.splice(0, firstSiblings.length, ...nextSiblings);

    return {
      artboardId,
      destinationLayerId: destinationEntry.id,
      entries,
      layerIds: sortedPaths.map((path) => path.entry.id),
      layersBottomToTop: sortedPaths
        .slice()
        .sort((first, second) => second.index - first.index)
        .map((path) => ({
          ...cloneValue(flatLookup.get(path.entry.id) || path.entry),
          ...cloneValue(path.entry),
          artboardId: flatLookup.get(path.entry.id)?.artboardId || path.entry.artboardId || artboardId,
          visible: flatLookup.get(path.entry.id)?.visible !== false && path.entry.visible !== false,
        })),
      layersTopToBottom: sortedPaths.map((path) => cloneValue(path.entry)),
      mergedEntry,
      ok: true,
      parent: destinationPath.parent,
    };
  }

  function resolveDocumentLayerMergeDownPlan(layerId, options = {}) {
    const layerModel = options.layerModel || namespace.documentLayerModel;
    const id = String(layerId || layerModel?.activeLayerId || "").trim();
    const entries = layerModel?.getEntries?.() || [];
    const path = findEntryPath(entries, id);

    if (!path) {
      return createFailure("missing-layer", "Layer non trovato.");
    }

    const below = path.siblings[path.index + 1];

    if (!below || !isMergeableContentLayer(below)) {
      return createFailure("missing-layer-below", "Non c'e un layer valido sotto da unire.");
    }

    return resolveDocumentLayerMergePlan([path.entry.id, below.id], {
      ...options,
      layerModel,
    });
  }

  function unionRects(renderer, first, second) {
    if (!first) {
      return second || null;
    }

    if (!second) {
      return first || null;
    }

    if (typeof renderer?.unionRasterHistoryRects === "function") {
      return renderer.unionRasterHistoryRects(first, second);
    }

    const minX = Math.min(first.x, second.x);
    const minY = Math.min(first.y, second.y);
    const maxX = Math.max(first.x + first.width, second.x + second.width);
    const maxY = Math.max(first.y + first.height, second.y + second.height);

    return {
      height: Math.max(1, maxY - minY),
      width: Math.max(1, maxX - minX),
      x: minX,
      y: minY,
    };
  }

  function intersectRects(renderer, first, second) {
    if (!first || !second) {
      return null;
    }

    if (typeof renderer?.intersectRasterHistoryRects === "function") {
      return renderer.intersectRasterHistoryRects(first, second);
    }

    const x0 = Math.max(first.x, second.x);
    const y0 = Math.max(first.y, second.y);
    const x1 = Math.min(first.x + first.width, second.x + second.width);
    const y1 = Math.min(first.y + first.height, second.y + second.height);

    return x1 > x0 && y1 > y0
      ? {
          height: y1 - y0,
          width: x1 - x0,
          x: x0,
          y: y0,
        }
      : null;
  }

  function getLayerMergeRenderRect(renderer, layer) {
    const target = renderer?.rasterTargetsByLayerId?.get?.(layer?.id);
    let rect = target ? renderer.getRasterTargetDocumentRect?.(target) : null;

    if (!rect && layer?.type === "image" && layer.imageBounds) {
      rect = renderer.getUnclampedDocumentRect?.(layer.imageBounds) || layer.imageBounds;
    }

    if (!rect) {
      return null;
    }

    if (renderer.hasEnabledLayerEffects?.(layer)) {
      rect = renderer.getLayerEffectOutputRect?.(layer, rect) || rect;
    }

    if (renderer.hasPuppetLayerTransform?.(layer) && target?.texture) {
      rect = renderer.getPuppetDeformedBounds?.(layer, target) || rect;
    }

    const artboardRect = renderer.getLayerArtboardVisualRect?.(layer);

    if (artboardRect) {
      rect = intersectRects(renderer, rect, artboardRect);
    }

    return rect
      ? renderer.getClampedDocumentRect?.(rect) || rect
      : null;
  }

  function getDocumentLayerMergeRect(renderer, layersBottomToTop = []) {
    return layersBottomToTop.reduce((rect, layer) => {
      if (!hasRenderableContent(renderer, layer)) {
        return rect;
      }

      return unionRects(renderer, rect, getLayerMergeRenderRect(renderer, layer));
    }, null);
  }

  function getViewportScissorForDocumentRect(renderRect, docRect, viewportHeight) {
    if (!renderRect || !docRect) {
      return null;
    }

    const left = docRect.x - renderRect.x;
    const top = docRect.y - renderRect.y;
    const right = left + docRect.width;
    const bottom = top + docRect.height;
    const clippedLeft = Math.max(0, Math.floor(Math.min(left, right)));
    const clippedTop = Math.max(0, Math.floor(Math.min(top, bottom)));
    const clippedRight = Math.min(renderRect.width, Math.ceil(Math.max(left, right)));
    const clippedBottom = Math.min(renderRect.height, Math.ceil(Math.max(top, bottom)));

    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
      return null;
    }

    return {
      height: clippedBottom - clippedTop,
      width: clippedRight - clippedLeft,
      x: clippedLeft,
      y: viewportHeight - clippedBottom,
    };
  }

  function computeClipBaseLayerIds(renderer, layersBottomToTop = []) {
    const clipBaseLayerIds = new Set();
    let pendingClipBaseLayer = null;

    layersBottomToTop.forEach((layer) => {
      const isContentBase = Boolean(
        layer &&
        layer.type !== "group" &&
        layer.type !== "background" &&
        layer.id !== "background"
      );

      if (layer?.clippingMask === true) {
        if (pendingClipBaseLayer?.id && hasRenderableContent(renderer, pendingClipBaseLayer)) {
          clipBaseLayerIds.add(pendingClipBaseLayer.id);
        }
      } else {
        pendingClipBaseLayer = isContentBase ? layer : null;
      }
    });

    return clipBaseLayerIds;
  }

  function bindMergeProgram(renderer, state) {
    const gl = renderer.gl;
    const { program, uniforms } = renderer.programInfo;
    const framebuffer = state.compositeState?.read?.framebuffer || state.destinationTarget.framebuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, state.viewportWidth, state.viewportHeight);
    gl.useProgram(program);
    gl.uniform2f(uniforms.viewportSize, state.viewportWidth, state.viewportHeight);
    gl.uniform2f(uniforms.documentSize, renderer.width || state.viewportWidth, renderer.height || state.viewportHeight);
    gl.uniform2f(uniforms.cameraPosition, state.camera.x, state.camera.y);
    gl.uniform1f(uniforms.cameraZoom, 1);
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform1i(uniforms.maskTexture, 1);
    gl.uniform1i(uniforms.clipTexture, 2);
    gl.uniform1i(uniforms.selectionClipTexture, 3);
    gl.uniform1f(uniforms.maskMode, 0.0);
    gl.uniform1f(uniforms.maskRectMode, 0.0);
    gl.uniform4f(uniforms.maskRect, 0, 0, renderer.width || state.viewportWidth, renderer.height || state.viewportHeight);
    gl.uniform1f(uniforms.maskClipMode, 0.0);
    gl.uniform4f(uniforms.maskClipRect, 0, 0, 0, 0);
    gl.uniform1i?.(uniforms.maskClipRectCount, 0);
    gl.uniform1f(uniforms.clipMode, 0.0);
    gl.uniform1f(uniforms.clipOpacity, 1.0);
    gl.uniform2f(uniforms.clipOrigin, 0, 0);
    gl.uniform2f(uniforms.clipTextureSize, renderer.width || state.viewportWidth, renderer.height || state.viewportHeight);
    gl.uniformMatrix3fv?.(uniforms.clipDestToSourceUv, false, IDENTITY_UV_MATRIX);
    gl.uniform4f?.(uniforms.clipSourceUvRect, 0, 0, 1, 1);
    gl.uniform2f(uniforms.drawOrigin, 0, 0);
    gl.uniform1f(uniforms.previewCutMode, 0.0);
    gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
    gl.uniform1f(uniforms.selectionClipMode, 0.0);
    gl.uniform4f(uniforms.selectionClipRect, 0, 0, 0, 0);
    gl.uniform1f(uniforms.gridMode, 0.0);
    gl.bindVertexArray(renderer.quad.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawMergeTexture(renderer, state, texture, opacity, rect = null, clipBase = null) {
    if (!texture) {
      return false;
    }

    const gl = renderer.gl;
    const { uniforms } = renderer.programInfo;
    const textureMagFilter = renderer.getViewportTextureMagFilter?.(state.camera) || gl.LINEAR;

    if (rect) {
      gl.uniform2f(uniforms.documentSize, rect.width, rect.height);
      gl.uniform2f(uniforms.cameraPosition, state.camera.x + rect.x, state.camera.y + rect.y);
      gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
    } else {
      gl.uniform2f(uniforms.documentSize, renderer.width || state.viewportWidth, renderer.height || state.viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, state.camera.x, state.camera.y);
      gl.uniform2f(uniforms.drawOrigin, 0, 0);
    }

    const didBindClipTexture = renderer.setClipBaseUniforms?.(uniforms, clipBase, {
      fallbackHeight: renderer.height || state.viewportHeight,
      fallbackWidth: renderer.width || state.viewportWidth,
      textureMagFilter,
      textureUnit: 2,
    });

    renderer.setRasterTextureSampling?.(texture, gl.LINEAR, textureMagFilter);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(uniforms.opacity, opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    renderer.clearClipBaseTexture?.(2, didBindClipTexture);

    return true;
  }

  function drawMergeBlendTexture(renderer, state, texture, opacity, rect = null, clipBase = null, blendModeId = 0) {
    if (!texture) {
      return false;
    }

    if (blendModeId === 0 || !state.compositeState?.read?.texture || !state.compositeState?.write?.framebuffer) {
      return drawMergeTexture(renderer, state, texture, opacity, rect, clipBase);
    }

    const gl = renderer.gl;

    if (state.preserveCompositeOutsideScissor) {
      gl.disable(gl.SCISSOR_TEST);
      renderer.drawScreenTexture?.(state.compositeState.read.texture, {
        blend: false,
        framebuffer: state.compositeState.write.framebuffer,
        viewportHeight: state.viewportHeight,
        viewportWidth: state.viewportWidth,
      });
      gl.enable(gl.SCISSOR_TEST);
    }

    renderer.drawLayerCompositeTexture({
      backdropTexture: state.compositeState.read.texture,
      blendModeId,
      camera: state.camera,
      clipBase,
      documentHeight: renderer.height || state.viewportHeight,
      documentWidth: renderer.width || state.viewportWidth,
      framebuffer: state.compositeState.write.framebuffer,
      opacity,
      rect,
      texture,
      textureMagFilter: renderer.getViewportTextureMagFilter?.(state.camera) || gl.LINEAR,
      viewportHeight: state.viewportHeight,
      viewportWidth: state.viewportWidth,
    });
    state.compositeState = renderer.swapLayerComposite(state.compositeState);
    bindMergeProgram(renderer, state);

    return true;
  }

  function withMergeArtboardClip(renderer, state, layer, callback) {
    const artboardRect = renderer.getLayerArtboardVisualRect?.(layer);

    if (!artboardRect) {
      callback();
      return;
    }

    const clipRect = intersectRects(renderer, artboardRect, state.renderRect);
    const scissor = getViewportScissorForDocumentRect(state.renderRect, clipRect, state.viewportHeight);

    if (!scissor) {
      return;
    }

    const gl = renderer.gl;
    const previousPreserveCompositeOutsideScissor = state.preserveCompositeOutsideScissor;

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
    state.preserveCompositeOutsideScissor = state.preserveCompositeOutsideScissor || Boolean(state.compositeState);

    try {
      callback();
    } finally {
      state.preserveCompositeOutsideScissor = previousPreserveCompositeOutsideScissor;
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  function renderDocumentLayerMergeToTarget(renderer, plan, destinationTarget, options = {}) {
    if (!renderer?.gl || !renderer.programInfo || !renderer.quad?.vao || !destinationTarget?.framebuffer) {
      return false;
    }

    const gl = renderer.gl;
    const layersBottomToTop = plan.layersBottomToTop || [];
    const renderRect = options.renderRect || renderer.getRasterTargetDocumentRect?.(destinationTarget);
    const viewportWidth = Math.max(1, Math.round(destinationTarget.width || renderRect?.width || 1));
    const viewportHeight = Math.max(1, Math.round(destinationTarget.height || renderRect?.height || 1));
    const clipBaseLayerIds = computeClipBaseLayerIds(renderer, layersBottomToTop);
    const needsLayerComposite = layersBottomToTop.some((layer) =>
      layer?.visible !== false && renderer.hasAdvancedLayerBlendMode?.(layer)
    );
    const state = {
      camera: {
        x: -(renderRect?.x || 0),
        y: -(renderRect?.y || 0),
        zoom: 1,
      },
      compositeState: null,
      destinationTarget,
      preserveCompositeOutsideScissor: false,
      renderRect,
      viewportHeight,
      viewportWidth,
    };
    let currentClipBase = null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, destinationTarget.framebuffer);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (needsLayerComposite) {
      state.compositeState = renderer.beginLayerComposite?.(viewportWidth, viewportHeight) || null;
    }

    bindMergeProgram(renderer, state);

    for (const layer of layersBottomToTop) {
      const rawLayerTarget = renderer.rasterTargetsByLayerId.get(layer.id);
      const isClippingLayer = layer.clippingMask === true;
      let layerTarget = renderer.getRenderableLayerTarget?.(layer, rawLayerTarget, {
        forceSingleTexture: isClippingLayer,
        source: "layers-merge-render",
      }) || rawLayerTarget;
      let shouldRebindMergeAfterTargetResolve = layerTarget !== rawLayerTarget;

      if (!isClippingLayer) {
        const shouldMaterializeClipBase = clipBaseLayerIds.has(layer.id);
        const previousLayerTarget = layerTarget;
        const baseTarget = shouldMaterializeClipBase
          ? renderer.getRenderableLayerTarget?.(layer, layerTarget, {
              forceSingleTexture: true,
              source: "layers-merge-clip-base",
            }) || layerTarget
          : layerTarget;

        if (shouldMaterializeClipBase) {
          layerTarget = baseTarget;
          if (baseTarget !== previousLayerTarget || baseTarget !== rawLayerTarget) {
            shouldRebindMergeAfterTargetResolve = true;
          }
        }

        currentClipBase = isMergeableContentLayer(layer)
          ? renderer.createClipBaseForLayer?.(layer, baseTarget, layer.visible !== false) || null
          : null;
      }

      if (shouldRebindMergeAfterTargetResolve) {
        bindMergeProgram(renderer, state);
      }

      if (layer.visible === false) {
        continue;
      }

      if (isClippingLayer && (!currentClipBase?.visible || !renderer.hasClipBaseSamplingTexture?.(currentClipBase))) {
        continue;
      }

      const opacity = normalizeOpacity(layer.opacity);
      const blendModeId = renderer.getLayerBlendModeId?.(layer) || 0;
      const clipBase = isClippingLayer ? currentClipBase : null;

      for (const renderResult of renderer.getLayerRenderResults?.(layer, layerTarget, {
        cullSparseTiles: true,
        renderRect,
      }) || []) {
        const layerTexture = renderResult?.texture;
        const layerRect = renderer.getArtboardDragVisualRect?.(layer, renderResult?.rect || null, layerTarget) ||
          renderResult?.rect ||
          null;

        if (!layerTexture) {
          continue;
        }

        if (layerTexture !== layerTarget?.texture) {
          bindMergeProgram(renderer, state);
        }

        withMergeArtboardClip(renderer, state, layer, () => {
          if (renderer.hasPuppetLayerTransform?.(layer) && !isClippingLayer) {
            const visualRenderResult = layerRect
              ? { ...renderResult, rect: layerRect }
              : renderResult;
            const puppetTarget = renderer.getPuppetVisualTarget?.(layerTarget, visualRenderResult) || layerTarget;
            const didDrawPuppet = renderer.drawPuppetLayer?.(
              renderer.getArtboardDragVisualLayer?.(layer) || layer,
              puppetTarget,
              opacity,
              {
                camera: state.camera,
                sourceTexture: layerTexture,
                textureMagFilter: renderer.getViewportTextureMagFilter?.(state.camera) || gl.LINEAR,
                viewportHeight,
                viewportWidth,
              },
            );

            bindMergeProgram(renderer, state);

            if (!didDrawPuppet) {
              drawMergeBlendTexture(renderer, state, layerTexture, opacity, layerRect, null, blendModeId);
            }
          } else {
            drawMergeBlendTexture(renderer, state, layerTexture, opacity, layerRect, clipBase, blendModeId);
          }
        });
      }
    }

    if (state.compositeState?.read?.texture) {
      renderer.drawScreenTexture?.(state.compositeState.read.texture, {
        blend: false,
        framebuffer: destinationTarget.framebuffer,
        viewportHeight,
        viewportWidth,
      });
    }

    renderer.markRasterTargetDirty?.(destinationTarget);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);

    return true;
  }

  async function prepareDocumentForLayerMerge(source = "layers-merge") {
    namespace.brushEngine?.flushPendingBrushHistory?.({
      source: `${source}-flush-brush-history`,
    });

    const transformTool = namespace.rasterTransformTool;

    if (transformTool?.hasPendingTransform?.()) {
      const didCommit = await Promise.resolve(transformTool.commitTransform?.());

      if (didCommit === false) {
        throw new Error("Completa o annulla la trasformazione attiva prima di unire i layer.");
      }
    }

    if (namespace.puppetTransformTool?.isActive?.()) {
      await Promise.resolve(namespace.puppetTransformTool.rasterizeActivePuppetLayer?.());
    }

    if (typeof namespace.vectorTextRenderer?.renderContent === "function") {
      namespace.vectorTextRenderer.renderContent();
    } else {
      namespace.vectorTextRenderer?.scheduleContentRender?.();
    }

    namespace.documentHistory?.flushLayerState?.(namespace.documentLayerModel);
    namespace.documentRenderer?.syncActivePaintLayerReference?.();
    namespace.documentRenderer?.pruneOrphanRasterTargets?.();
  }

  function captureLayerRasterSnapshots(renderer, layerIds = [], label = "layers-merge-before") {
    return layerIds.map((layerId) => {
      const target = renderer.rasterTargetsByLayerId?.get?.(layerId);
      const hadTarget = Boolean(target);
      const hadRenderableTarget = Boolean(renderer.hasRenderableRasterTarget?.(target));
      const rect = target ? renderer.getRasterTargetDocumentRect?.(target) : null;
      const snapshot = hadRenderableTarget
        ? renderer.createRasterSnapshot?.(layerId, rect, label)
        : null;

      if (hadRenderableTarget && !snapshot) {
        throw new Error("Impossibile salvare gli snapshot raster per Undo/Redo.");
      }

      return {
        hadTarget,
        layerId,
        preferSparse: renderer.isSparseRasterTarget?.(target) === true,
        rect,
        snapshot,
      };
    });
  }

  function deleteSnapshot(renderer, snapshot) {
    if (snapshot) {
      renderer.deleteRasterSnapshot?.(snapshot);
    }
  }

  function restoreLayerRasterSnapshots(renderer, records = [], source = "history-layer-merge-restore") {
    let didRestoreAll = true;

    records.forEach((record) => {
      if (record.snapshot) {
        const didRestore = renderer.restoreRasterSnapshot?.(record.layerId, record.snapshot, {
          emit: false,
          invalidate: false,
          preferSparse: record.preferSparse,
          replaceSparse: record.preferSparse,
          source,
        });

        didRestoreAll = didRestoreAll && didRestore !== false;
        return;
      }

      if (record.hadTarget) {
        renderer.clearLayer?.(record.layerId, {
          emit: false,
          releaseRaster: true,
          source,
        });
      } else {
        renderer.deleteRasterTarget?.(record.layerId, {
          emit: false,
          source,
        });
      }
    });

    return didRestoreAll;
  }

  function getSnapshotDirtyRect(renderer, records = [], afterSnapshot = null, fallbackRect = null) {
    let dirtyRect = fallbackRect || afterSnapshot?.rect || null;

    records.forEach((record) => {
      dirtyRect = unionRects(renderer, dirtyRect, record.snapshot?.rect || record.rect || null);
    });

    return dirtyRect;
  }

  function emitLayerMergeVisualChange(renderer, layerId, rect, source) {
    renderer.commitVisualDirtyChange?.({
      layerId,
      rect,
      source,
      usePreviewDirtyTiles: true,
    });
    renderer.pruneOrphanRasterTargets?.();
    renderer.requestDraw?.();
  }

  function createLayerMergeHistoryEntry(options = {}) {
    const {
      afterSnapshot,
      afterState,
      beforeState,
      beforeSnapshots = [],
      destinationLayerId,
      history,
      layerIds = [],
      layerModel,
      preferSparseAfter = false,
      renderer,
      renderRect,
    } = options;

    if (!history || !layerModel || !renderer || !destinationLayerId || !beforeState || !afterState) {
      return null;
    }

    const before = cloneValue(beforeState);
    const after = cloneValue(afterState);
    const beforeRecords = beforeSnapshots.map((record) => ({ ...record }));
    const afterRecord = afterSnapshot
      ? {
          hadTarget: true,
          layerId: destinationLayerId,
          preferSparse: preferSparseAfter,
          rect: afterSnapshot.rect || renderRect || null,
          snapshot: afterSnapshot,
        }
      : {
          hadTarget: true,
          layerId: destinationLayerId,
          preferSparse: true,
          rect: renderRect || null,
          snapshot: null,
        };

    return {
      afterActiveLayerId: after.activeLayerId || null,
      afterEntries: after.entries,
      afterSnapshots: afterRecord.snapshot ? [afterRecord.snapshot] : [],
      beforeActiveLayerId: before.activeLayerId || null,
      beforeEntries: before.entries,
      beforeSnapshots: beforeRecords.map((record) => record.snapshot).filter(Boolean),
      destinationLayerId,
      layerIds: [...layerIds],
      source: "layers-merge",
      type: "custom",
      undo() {
        const didRestoreState = history.restoreLayerState(layerModel, before, {
          source: "history-undo-layers-merge",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = restoreLayerRasterSnapshots(renderer, beforeRecords, "history-undo-layers-merge");

        if (!didRestorePixels) {
          history.restoreLayerState(layerModel, after, {
            source: "history-undo-layers-merge-rollback",
          });
          restoreLayerRasterSnapshots(renderer, [afterRecord], "history-undo-layers-merge-rollback");
          emitLayerMergeVisualChange(
            renderer,
            destinationLayerId,
            getSnapshotDirtyRect(renderer, beforeRecords, afterRecord.snapshot, renderRect),
            "history-undo-layers-merge-rollback",
          );
          return false;
        }

        emitLayerMergeVisualChange(
          renderer,
          destinationLayerId,
          getSnapshotDirtyRect(renderer, beforeRecords, afterRecord.snapshot, renderRect),
          "history-undo-layers-merge",
        );

        return true;
      },
      redo() {
        const didRestoreState = history.restoreLayerState(layerModel, after, {
          source: "history-redo-layers-merge",
        });

        if (!didRestoreState) {
          return false;
        }

        const didRestorePixels = restoreLayerRasterSnapshots(renderer, [afterRecord], "history-redo-layers-merge");

        if (!didRestorePixels) {
          history.restoreLayerState(layerModel, before, {
            source: "history-redo-layers-merge-rollback",
          });
          restoreLayerRasterSnapshots(renderer, beforeRecords, "history-redo-layers-merge-rollback");
          emitLayerMergeVisualChange(renderer, destinationLayerId, renderRect, "history-redo-layers-merge-rollback");
          return false;
        }

        emitLayerMergeVisualChange(
          renderer,
          destinationLayerId,
          getSnapshotDirtyRect(renderer, beforeRecords, afterRecord.snapshot, renderRect),
          "history-redo-layers-merge",
        );
        return true;
      },
      destroy() {
        beforeRecords.forEach((record) => deleteSnapshot(renderer, record.snapshot));
        deleteSnapshot(renderer, afterRecord.snapshot);
      },
    };
  }

  function assertMergeScratchBudget(renderer, renderRect, source) {
    if (!renderRect) {
      return;
    }

    const estimatedNewBytes = typeof renderer?.getRasterRectBytes === "function"
      ? renderer.getRasterRectBytes(renderRect)
      : Math.max(1, Math.round(renderRect.width || 1)) * Math.max(1, Math.round(renderRect.height || 1)) * 4;
    const budget = namespace.getRasterLayerCreationBudget?.({
      estimatedNewBytes,
      source,
    });

    if (budget?.allowed === false) {
      throw new Error("Memoria raster insufficiente per unire questi layer.");
    }
  }

  function installMergedRasterTarget(renderer, destinationLayerId, renderRect, plan, source) {
    if (!renderRect) {
      const sparseTarget = renderer.createSparseRasterTarget?.(destinationLayerId, {
        source,
      });

      if (!sparseTarget || !renderer.installRasterTargetForLayer?.(destinationLayerId, sparseTarget, {
        emit: false,
        invalidate: false,
        source,
      })) {
        throw new Error("Impossibile creare il target raster unito.");
      }

      return sparseTarget;
    }

    const target = renderer.createRasterTargetForUnclampedRect?.(renderRect, [0, 0, 0, 0], 0, {
      layerId: destinationLayerId,
      source,
    }) || renderer.createRasterTargetForRect?.(renderRect, [0, 0, 0, 0], 0);

    if (!target?.framebuffer || !target?.texture) {
      renderer.deleteRasterTargetObject?.(target);
      throw new Error("Impossibile creare il target raster unito.");
    }

    target.layerId = destinationLayerId;

    if (!namespace.renderDocumentLayerMergeToTarget?.(renderer, plan, target, {
      renderRect,
      source,
    })) {
      renderer.deleteRasterTargetObject?.(target);
      throw new Error("Impossibile renderizzare i layer uniti.");
    }

    if (!renderer.replaceRasterTarget?.(destinationLayerId, target, {
      emit: false,
      invalidate: false,
      source,
    })) {
      renderer.deleteRasterTargetObject?.(target);
      throw new Error("Impossibile installare il target raster unito.");
    }

    return renderer.sparsifyRasterTarget?.(destinationLayerId, target, {
      clampToDocument: false,
      emit: false,
      invalidate: false,
      pruneTransparentTiles: true,
      source: `${source}-retile`,
      tileSize: target.sparseTileSize || target.tileSize,
    }) || renderer.rasterTargetsByLayerId.get(destinationLayerId);
  }

  async function mergeDocumentLayers(layerIds = [], options = {}) {
    const source = options.source || "layers-merge";
    let rollbackMerge = null;

    try {
      await prepareDocumentForLayerMerge(source);

      const layerModel = options.layerModel || namespace.documentLayerModel;
      const renderer = options.renderer || namespace.documentRenderer;
      const history = options.history || namespace.documentHistory;
      const plan = options.mode === "down"
        ? resolveDocumentLayerMergeDownPlan(layerIds[0], { layerModel, renderer })
        : resolveDocumentLayerMergePlan(layerIds, { layerModel, renderer });

      namespace.lastLayerMergePlan = plan;

      if (!plan.ok) {
        namespace.lastLayerMergeError = plan;
        return false;
      }

      const renderRect = getDocumentLayerMergeRect(renderer, plan.layersBottomToTop);
      const beforeState = history?.getLayerSnapshot?.(layerModel) || null;
      const beforeSnapshots = captureLayerRasterSnapshots(renderer, plan.layerIds, `${source}-before`);

      rollbackMerge = () => {
        if (beforeState) {
          history?.restoreLayerState?.(layerModel, beforeState, {
            source: `${source}-rollback`,
          });
        }
        restoreLayerRasterSnapshots(renderer, beforeSnapshots, `${source}-rollback`);
        emitLayerMergeVisualChange(
          renderer,
          plan.destinationLayerId,
          getSnapshotDirtyRect(renderer, beforeSnapshots, null, renderRect),
          `${source}-rollback`,
        );
      };

      assertMergeScratchBudget(renderer, renderRect, source);

      const finalTarget = installMergedRasterTarget(renderer, plan.destinationLayerId, renderRect, plan, source);
      const afterSnapshot = renderer.hasRenderableRasterTarget?.(finalTarget)
        ? renderer.createRasterSnapshot?.(plan.destinationLayerId, renderRect || renderer.getRasterTargetDocumentRect?.(finalTarget), `${source}-after`)
        : null;

      layerModel.setEntries(plan.entries, {
        activeLayerId: plan.destinationLayerId,
        history: false,
        source,
      });

      const afterState = history?.getLayerSnapshot?.(layerModel) || null;
      const historyEntry = createLayerMergeHistoryEntry({
        afterSnapshot,
        afterState,
        beforeState,
        beforeSnapshots,
        destinationLayerId: plan.destinationLayerId,
        history,
        layerIds: plan.layerIds,
        layerModel,
        preferSparseAfter: renderer.isSparseRasterTarget?.(finalTarget) === true,
        renderer,
        renderRect,
      });

      const didPushHistory = historyEntry
        ? history?.push?.(historyEntry, { source }) === true
        : false;

      if (didPushHistory) {
        emitLayerMergeVisualChange(renderer, plan.destinationLayerId, renderRect, source);
      } else {
        if (!historyEntry) {
          beforeSnapshots.forEach((record) => deleteSnapshot(renderer, record.snapshot));
          deleteSnapshot(renderer, afterSnapshot);
        }
        emitLayerMergeVisualChange(renderer, plan.destinationLayerId, renderRect, source);
      }

      window.dispatchEvent(new CustomEvent("cbo:document-layers-merged", {
        detail: {
          destinationLayerId: plan.destinationLayerId,
          layerIds: plan.layerIds,
          rect: renderRect,
          source,
        },
      }));

      namespace.lastLayerMergeError = null;
      rollbackMerge = null;
      return true;
    } catch (error) {
      rollbackMerge?.();
      namespace.lastLayerMergeError = {
        error,
        message: error?.message || "Impossibile unire i layer.",
        ok: false,
        reason: "merge-failed",
      };
      console.warn?.("[CBO layers] Merge layer fallito.", error);
      return false;
    }
  }

  namespace.getDocumentLayerMergePlan = (layerIds = [], options = {}) =>
    resolveDocumentLayerMergePlan(layerIds, options);
  namespace.getDocumentLayerMergeDownPlan = (layerId, options = {}) =>
    resolveDocumentLayerMergeDownPlan(layerId, options);
  namespace.createLayerMergeHistoryEntry = createLayerMergeHistoryEntry;
  namespace.renderDocumentLayerMergeToTarget = renderDocumentLayerMergeToTarget;
  namespace.mergeDocumentLayers = mergeDocumentLayers;
  namespace.mergeLayerDown = (layerId, options = {}) =>
    mergeDocumentLayers([layerId || namespace.documentLayerModel?.activeLayerId], {
      ...options,
      mode: "down",
    });
})(window.CBO = window.CBO || {});
