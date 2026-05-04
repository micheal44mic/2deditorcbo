(function registerRasterResourceManager(namespace) {
  "use strict";

  const BYTES_PER_PIXEL = 4;
  const MIB = 1024 * 1024;
  const MAX_MATERIALIZATION_EVENTS = 200;
  const MAX_RASTER_OPERATION_EVENTS = 200;
  const MAX_STROKE_MEMORY_EVENTS = 200;
  const MAX_SUSPECT_EVENTS = 200;
  const VALID_OWNER_TYPES = new Set([
    "live",
    "cache",
    "scratch",
    "historyGpu",
    "historyCpuRaw",
    "historyCompressed",
    "orphan",
    "suspect",
  ]);

  const textureIds = new WeakMap();
  const framebufferIds = new WeakMap();
  const renderbufferIds = new WeakMap();
  const textures = new Map();
  const framebuffers = new Map();
  const renderbuffers = new Map();
  const fullCanvasMaterializations = [];
  const rasterOperationEvents = [];
  const strokeMemoryEvents = [];
  const suspectEvents = [];

  let nextTextureId = 1;
  let nextFramebufferId = 1;
  let nextRenderbufferId = 1;

  const stats = {
    createdFramebufferCount: 0,
    createdRenderbufferCount: 0,
    createdTextureCount: 0,
    deletedFramebufferCount: 0,
    deletedRenderbufferCount: 0,
    deletedTextureCount: 0,
    fullCanvasMaterializationCount: 0,
    rasterOperationEventCount: 0,
    strokeMemoryEventCount: 0,
    unknownDeletedFramebufferCount: 0,
    unknownDeletedRenderbufferCount: 0,
    unknownDeletedTextureCount: 0,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function toInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  function toPositiveInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
  }

  function toNonNegativeInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
  }

  function toFiniteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatMiB(bytes) {
    return (Number(bytes || 0) / MIB).toFixed(2);
  }

  function estimateTextureBytes(width, height, mipLevels = 1, bytesPerPixel = BYTES_PER_PIXEL) {
    let levelWidth = toPositiveInt(width, 0);
    let levelHeight = toPositiveInt(height, 0);

    if (levelWidth <= 0 || levelHeight <= 0) {
      return 0;
    }

    const levels = Math.max(1, Math.floor(Number(mipLevels) || 1));
    const bpp = Math.max(1, Math.floor(Number(bytesPerPixel) || BYTES_PER_PIXEL));
    let total = 0;

    for (let level = 0; level < levels; level += 1) {
      total += levelWidth * levelHeight * bpp;
      levelWidth = Math.max(1, Math.floor(levelWidth * 0.5));
      levelHeight = Math.max(1, Math.floor(levelHeight * 0.5));
    }

    return total;
  }

  function normalizeOwnerType(ownerType) {
    const value = typeof ownerType === "string" ? ownerType.trim() : "";
    return VALID_OWNER_TYPES.has(value) ? value : "";
  }

  function normalizeKind(kind) {
    const value = typeof kind === "string" ? kind.trim() : "";
    return value || "other";
  }

  function getDocumentSize(metadata = {}) {
    const renderer = namespace.documentRenderer;

    return {
      height: toPositiveInt(metadata.documentHeight ?? metadata.canvasHeight ?? renderer?.height, 0),
      width: toPositiveInt(metadata.documentWidth ?? metadata.canvasWidth ?? renderer?.width, 0),
    };
  }

  function cloneRect(rect) {
    if (!rect) {
      return null;
    }

    return {
      height: toPositiveInt(rect.height, 0),
      width: toPositiveInt(rect.width, 0),
      x: toInteger(rect.x, 0),
      y: toInteger(rect.y, 0),
    };
  }

  function normalizeBBox(metadata = {}, existing = null, width = 0, height = 0) {
    const sourceRect = metadata.bbox || metadata.docRect || metadata.rect || existing?.bbox || null;
    const originX = toInteger(metadata.originX ?? metadata.x ?? sourceRect?.x ?? existing?.originX, 0);
    const originY = toInteger(metadata.originY ?? metadata.y ?? sourceRect?.y ?? existing?.originY, 0);
    const bbox = {
      height: toPositiveInt(sourceRect?.height ?? height, height),
      width: toPositiveInt(sourceRect?.width ?? width, width),
      x: toInteger(sourceRect?.x ?? originX, originX),
      y: toInteger(sourceRect?.y ?? originY, originY),
    };

    return { bbox, originX, originY };
  }

  function makeTextureId() {
    return `texture-${nextTextureId++}`;
  }

  function makeFramebufferId() {
    return `framebuffer-${nextFramebufferId++}`;
  }

  function makeRenderbufferId() {
    return `renderbuffer-${nextRenderbufferId++}`;
  }

  function normalizeTextureRecord(id, texture, metadata = {}, existing = null) {
    const width = toPositiveInt(
      metadata.width ?? metadata.bbox?.width ?? metadata.rect?.width ?? existing?.width,
      0,
    );
    const height = toPositiveInt(
      metadata.height ?? metadata.bbox?.height ?? metadata.rect?.height ?? existing?.height,
      0,
    );
    const mipLevels = Math.max(1, Math.floor(Number(metadata.mipLevels ?? existing?.mipLevels ?? 1) || 1));
    const bytes = toNonNegativeInt(metadata.bytes, estimateTextureBytes(width, height, mipLevels, metadata.bytesPerPixel));
    const ownerType =
      normalizeOwnerType(metadata.ownerType) ||
      normalizeOwnerType(existing?.ownerType) ||
      (metadata.ownerId || metadata.layerId || existing?.ownerId || existing?.layerId ? "live" : "suspect");
    const kind = normalizeKind(metadata.kind ?? existing?.kind);
    const { bbox, originX, originY } = normalizeBBox(metadata, existing, width, height);
    const documentSize = getDocumentSize(metadata);
    const documentArea = documentSize.width * documentSize.height;
    const bboxArea = bbox.width * bbox.height;
    const inferredIsFullCanvas =
      documentSize.width > 0 &&
      documentSize.height > 0 &&
      bbox.x === 0 &&
      bbox.y === 0 &&
      bbox.width === documentSize.width &&
      bbox.height === documentSize.height;

    return {
      bbox,
      bboxCoverage: toFiniteNumber(metadata.bboxCoverage, documentArea > 0 ? bboxArea / documentArea : null),
      bytes,
      createdAt: metadata.createdAt ?? existing?.createdAt ?? nowIso(),
      format: metadata.format || existing?.format || "RGBA8",
      height,
      id,
      isFullCanvas: typeof metadata.isFullCanvas === "boolean" ? metadata.isFullCanvas : inferredIsFullCanvas,
      kind,
      label: metadata.label ?? existing?.label ?? kind,
      lastUsed: metadata.lastUsed ?? nowIso(),
      layerId: metadata.layerId ?? existing?.layerId ?? "",
      mipLevels,
      object: texture || existing?.object || null,
      originX,
      originY,
      ownerId: metadata.ownerId ?? existing?.ownerId ?? metadata.layerId ?? "",
      ownerType,
      purgeable: metadata.purgeable !== undefined ? Boolean(metadata.purgeable) : Boolean(existing?.purgeable),
      reason: metadata.reason ?? existing?.reason ?? "",
      resourceType: "texture",
      stackTag: metadata.stackTag ?? existing?.stackTag ?? "",
      state: metadata.state ?? existing?.state ?? (ownerType === "historyGpu" ? "GPU_HOT" : ""),
      updatedAt: nowIso(),
      width,
    };
  }

  function normalizeFramebufferRecord(id, framebuffer, metadata = {}, existing = null) {
    const ownerType =
      normalizeOwnerType(metadata.ownerType) ||
      normalizeOwnerType(existing?.ownerType) ||
      (metadata.ownerId || metadata.layerId || existing?.ownerId || existing?.layerId ? "live" : "suspect");

    return {
      createdAt: metadata.createdAt ?? existing?.createdAt ?? nowIso(),
      height: toPositiveInt(metadata.height ?? existing?.height, 0),
      id,
      kind: normalizeKind(metadata.kind ?? existing?.kind ?? "framebuffer"),
      label: metadata.label ?? existing?.label ?? "framebuffer",
      lastUsed: metadata.lastUsed ?? nowIso(),
      layerId: metadata.layerId ?? existing?.layerId ?? "",
      linkedTextureId: metadata.linkedTextureId ?? existing?.linkedTextureId ?? "",
      object: framebuffer || existing?.object || null,
      ownerId: metadata.ownerId ?? existing?.ownerId ?? metadata.layerId ?? "",
      ownerType,
      purgeable: metadata.purgeable !== undefined ? Boolean(metadata.purgeable) : Boolean(existing?.purgeable),
      reason: metadata.reason ?? existing?.reason ?? "",
      resourceType: "framebuffer",
      stackTag: metadata.stackTag ?? existing?.stackTag ?? "",
      updatedAt: nowIso(),
      width: toPositiveInt(metadata.width ?? existing?.width, 0),
    };
  }

  function toPublicTextureRow(record) {
    return {
      MiB: formatMiB(record.bytes),
      bbox: record.bbox ? { ...record.bbox } : null,
      bboxCoverage: typeof record.bboxCoverage === "number" ? Number(record.bboxCoverage.toFixed(6)) : null,
      bytes: record.bytes,
      category: `${record.ownerType}/${record.kind}`,
      createdAt: record.createdAt,
      estimatedMiB: formatMiB(record.bytes),
      format: record.format,
      height: record.height,
      id: record.id,
      isFullCanvas: Boolean(record.isFullCanvas),
      kind: record.kind,
      label: record.label,
      lastUsed: record.lastUsed,
      layerId: record.layerId,
      mipLevels: record.mipLevels,
      originX: record.originX,
      originY: record.originY,
      ownerId: record.ownerId,
      ownerType: record.ownerType,
      purgeable: Boolean(record.purgeable),
      rawEstimatedMiB: formatMiB(record.bytes),
      reason: record.reason,
      resourceType: "texture",
      stackTag: record.stackTag,
      state: record.state,
      updatedAt: record.updatedAt,
      width: record.width,
    };
  }

  function pushSuspectEvent(event) {
    suspectEvents.push({
      createdAt: nowIso(),
      ...event,
    });

    while (suspectEvents.length > MAX_SUSPECT_EVENTS) {
      suspectEvents.shift();
    }
  }

  function lookupTextureId(textureOrId) {
    if (!textureOrId) {
      return "";
    }

    if (typeof textureOrId === "string") {
      return textures.has(textureOrId) ? textureOrId : "";
    }

    return textureIds.get(textureOrId) || "";
  }

  function lookupFramebufferId(framebufferOrId) {
    if (!framebufferOrId) {
      return "";
    }

    if (typeof framebufferOrId === "string") {
      return framebuffers.has(framebufferOrId) ? framebufferOrId : "";
    }

    return framebufferIds.get(framebufferOrId) || "";
  }

  function lookupRenderbufferId(renderbufferOrId) {
    if (!renderbufferOrId) {
      return "";
    }

    if (typeof renderbufferOrId === "string") {
      return renderbuffers.has(renderbufferOrId) ? renderbufferOrId : "";
    }

    return renderbufferIds.get(renderbufferOrId) || "";
  }

  function registerTexture(texture, metadata = {}) {
    if (!texture) {
      return null;
    }

    let id = textureIds.get(texture);
    const existing = id ? textures.get(id) : null;

    if (!id) {
      const requestedId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : "";

      id = requestedId && !textures.has(requestedId) ? requestedId : makeTextureId();
      textureIds.set(texture, id);
      stats.createdTextureCount += 1;
    }

    const record = normalizeTextureRecord(id, texture, metadata, existing);
    textures.set(id, record);

    return toPublicTextureRow(record);
  }

  function updateTexture(textureOrId, metadataPatch = {}) {
    const id = lookupTextureId(textureOrId);

    if (!id) {
      pushSuspectEvent({
        action: "update-unregistered-texture",
        label: metadataPatch.label || "",
        reason: metadataPatch.reason || "",
        resourceType: "texture",
      });
      return null;
    }

    const existing = textures.get(id);
    const texture = existing?.object || (typeof textureOrId === "object" ? textureOrId : null);
    const record = normalizeTextureRecord(id, texture, metadataPatch, existing);

    textures.set(id, record);
    return toPublicTextureRow(record);
  }

  function deleteTexture(textureOrId) {
    const id = lookupTextureId(textureOrId);

    if (!id) {
      stats.deletedTextureCount += 1;
      stats.unknownDeletedTextureCount += 1;
      pushSuspectEvent({
        action: "delete-unregistered-texture",
        resourceType: "texture",
      });
      return false;
    }

    const record = textures.get(id);

    if (record?.object) {
      textureIds.delete(record.object);
    }

    textures.delete(id);
    stats.deletedTextureCount += 1;
    return true;
  }

  function registerFramebuffer(framebuffer, metadata = {}) {
    if (!framebuffer) {
      return null;
    }

    let id = framebufferIds.get(framebuffer);
    const existing = id ? framebuffers.get(id) : null;

    if (!id) {
      const requestedId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : "";

      id = requestedId && !framebuffers.has(requestedId) ? requestedId : makeFramebufferId();
      framebufferIds.set(framebuffer, id);
      stats.createdFramebufferCount += 1;
    }

    const record = normalizeFramebufferRecord(id, framebuffer, metadata, existing);
    framebuffers.set(id, record);

    return { ...record, object: undefined };
  }

  function updateFramebuffer(framebufferOrId, metadataPatch = {}) {
    const id = lookupFramebufferId(framebufferOrId);

    if (!id) {
      pushSuspectEvent({
        action: "update-unregistered-framebuffer",
        label: metadataPatch.label || "",
        reason: metadataPatch.reason || "",
        resourceType: "framebuffer",
      });
      return null;
    }

    const existing = framebuffers.get(id);
    const framebuffer = existing?.object || (typeof framebufferOrId === "object" ? framebufferOrId : null);
    const record = normalizeFramebufferRecord(id, framebuffer, metadataPatch, existing);

    framebuffers.set(id, record);
    return { ...record, object: undefined };
  }

  function deleteFramebuffer(framebufferOrId) {
    const id = lookupFramebufferId(framebufferOrId);

    if (!id) {
      stats.deletedFramebufferCount += 1;
      stats.unknownDeletedFramebufferCount += 1;
      pushSuspectEvent({
        action: "delete-unregistered-framebuffer",
        resourceType: "framebuffer",
      });
      return false;
    }

    const record = framebuffers.get(id);

    if (record?.object) {
      framebufferIds.delete(record.object);
    }

    framebuffers.delete(id);
    stats.deletedFramebufferCount += 1;
    return true;
  }

  function registerRenderbuffer(renderbuffer, metadata = {}) {
    if (!renderbuffer) {
      return null;
    }

    let id = renderbufferIds.get(renderbuffer);
    const existing = id ? renderbuffers.get(id) : null;

    if (!id) {
      const requestedId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : "";

      id = requestedId && !renderbuffers.has(requestedId) ? requestedId : makeRenderbufferId();
      renderbufferIds.set(renderbuffer, id);
      stats.createdRenderbufferCount += 1;
    }

    const record = {
      createdAt: metadata.createdAt ?? existing?.createdAt ?? nowIso(),
      height: toPositiveInt(metadata.height ?? existing?.height, 0),
      id,
      kind: normalizeKind(metadata.kind ?? existing?.kind ?? "renderbuffer"),
      label: metadata.label ?? existing?.label ?? "renderbuffer",
      lastUsed: metadata.lastUsed ?? nowIso(),
      object: renderbuffer,
      ownerId: metadata.ownerId ?? existing?.ownerId ?? "",
      ownerType: normalizeOwnerType(metadata.ownerType) || normalizeOwnerType(existing?.ownerType) || "suspect",
      reason: metadata.reason ?? existing?.reason ?? "",
      resourceType: "renderbuffer",
      updatedAt: nowIso(),
      width: toPositiveInt(metadata.width ?? existing?.width, 0),
    };

    renderbuffers.set(id, record);
    return { ...record, object: undefined };
  }

  function deleteRenderbuffer(renderbufferOrId) {
    const id = lookupRenderbufferId(renderbufferOrId);

    if (!id) {
      stats.deletedRenderbufferCount += 1;
      stats.unknownDeletedRenderbufferCount += 1;
      pushSuspectEvent({
        action: "delete-unregistered-renderbuffer",
        resourceType: "renderbuffer",
      });
      return false;
    }

    const record = renderbuffers.get(id);

    if (record?.object) {
      renderbufferIds.delete(record.object);
    }

    renderbuffers.delete(id);
    stats.deletedRenderbufferCount += 1;
    return true;
  }

  function markUsed(textureOrId) {
    const timestamp = nowIso();
    const textureId = lookupTextureId(textureOrId);

    if (textureId) {
      const record = textures.get(textureId);

      if (record) {
        record.lastUsed = timestamp;
        record.updatedAt = timestamp;
        textures.set(textureId, record);
        return toPublicTextureRow(record);
      }
    }

    const framebufferId = lookupFramebufferId(textureOrId);

    if (framebufferId) {
      const record = framebuffers.get(framebufferId);

      if (record) {
        record.lastUsed = timestamp;
        record.updatedAt = timestamp;
        framebuffers.set(framebufferId, record);
        return { ...record, object: undefined };
      }
    }

    return null;
  }

  function recordFullCanvasMaterialization(event = {}) {
    const newSize = event.newSize || {};
    const normalized = {
      bytesAdded: toNonNegativeInt(event.bytesAdded, 0),
      createdAt: event.createdAt || nowIso(),
      layerId: event.layerId || "",
      newSize: {
        height: toPositiveInt(newSize.height ?? event.height, 0),
        width: toPositiveInt(newSize.width ?? event.width, 0),
      },
      oldBBox: cloneRect(event.oldBBox),
      reason: event.reason || event.source || "",
      stackTag: event.stackTag || "",
      tool: event.tool || event.source || "unknown",
    };

    stats.fullCanvasMaterializationCount += 1;
    fullCanvasMaterializations.push(normalized);

    while (fullCanvasMaterializations.length > MAX_MATERIALIZATION_EVENTS) {
      fullCanvasMaterializations.shift();
    }

    return normalized;
  }

  function cloneSize(size) {
    return {
      height: toPositiveInt(size?.height, 0),
      width: toPositiveInt(size?.width, 0),
    };
  }

  function normalizeStrokeMemoryEvent(event = {}) {
    const beforeBytes = toNonNegativeInt(event.beforeBytes, 0);
    const potentialAfterBytes = toNonNegativeInt(event.potentialAfterBytes, 0);
    const scratchBytes = toNonNegativeInt(event.scratchBytes, 0);
    const persistentBytes = toNonNegativeInt(
      event.persistentBytes,
      beforeBytes + potentialAfterBytes,
    );
    const estimatedPeakBytes = toNonNegativeInt(
      event.estimatedPeakBytes,
      persistentBytes + scratchBytes,
    );

    return {
      beforeBytes,
      beforeMiB: formatMiB(beforeBytes),
      canvasSize: cloneSize(event.canvasSize),
      coverage: toFiniteNumber(event.coverage, 0),
      createdAt: event.createdAt || nowIso(),
      estimatedPeakBytes,
      estimatedPeakMiB: formatMiB(estimatedPeakBytes),
      historyMode: event.historyMode || "",
      layerId: event.layerId || "",
      persistentBytes,
      persistentMiB: formatMiB(persistentBytes),
      phase: event.phase || "",
      policy: event.policy || event.severity || "normal",
      potentialAfterBytes,
      potentialAfterMiB: formatMiB(potentialAfterBytes),
      reason: event.reason || "",
      scratchBytes,
      scratchMiB: formatMiB(scratchBytes),
      source: event.source || "",
      strokeBufferRect: cloneRect(event.strokeBufferRect),
      strokeRect: cloneRect(event.strokeRect),
      tool: event.tool || "stroke",
    };
  }

  function normalizeRasterOperationEvent(event = {}) {
    const beforeBytes = toNonNegativeInt(event.beforeBytes, 0);
    const afterBytes = toNonNegativeInt(event.afterBytes ?? event.potentialAfterBytes, 0);
    const originalBytes = toNonNegativeInt(event.originalBytes, 0);
    const sourceBytes = toNonNegativeInt(event.sourceBytes, 0);
    const targetBytes = toNonNegativeInt(event.targetBytes, 0);
    const scratchBytes = toNonNegativeInt(event.scratchBytes, 0);
    const historyBytes = toNonNegativeInt(event.historyBytes, beforeBytes + afterBytes);
    const persistentBytes = toNonNegativeInt(event.persistentBytes, targetBytes);
    const estimatedPeakBytes = toNonNegativeInt(
      event.estimatedPeakBytes,
      sourceBytes + targetBytes + scratchBytes,
    );

    return {
      afterBytes,
      afterMiB: formatMiB(afterBytes),
      beforeBytes,
      beforeMiB: formatMiB(beforeBytes),
      canvasSize: cloneSize(event.canvasSize),
      coverage: toFiniteNumber(event.coverage, 0),
      createdAt: event.createdAt || nowIso(),
      decodedSize: cloneSize(event.decodedSize),
      estimatedPeakBytes,
      estimatedPeakMiB: formatMiB(estimatedPeakBytes),
      historyBytes,
      historyMiB: formatMiB(historyBytes),
      layerId: event.layerId || "",
      maxMiB: toFiniteNumber(event.maxMiB, null),
      maxSide: toPositiveInt(event.maxSide, 0),
      mode: event.mode || event.transformMode || "",
      operationType: event.operationType || event.type || "raster-operation",
      originalBytes,
      originalMiB: formatMiB(originalBytes),
      originalSize: cloneSize(event.originalSize),
      persistentBytes,
      persistentMiB: formatMiB(persistentBytes),
      policy: event.policy || event.severity || "normal",
      reason: event.reason || "",
      scale: toFiniteNumber(event.scale, null),
      scratchBytes,
      scratchMiB: formatMiB(scratchBytes),
      source: event.source || "",
      sourceBytes,
      sourceMiB: formatMiB(sourceBytes),
      sourceRect: cloneRect(event.sourceRect),
      targetBytes,
      targetMiB: formatMiB(targetBytes),
      targetRect: cloneRect(event.targetRect),
      tool: event.tool || event.source || "raster-operation",
    };
  }

  function recordRasterOperation(event = {}) {
    const normalized = normalizeRasterOperationEvent(event);

    stats.rasterOperationEventCount += 1;
    rasterOperationEvents.push(normalized);

    while (rasterOperationEvents.length > MAX_RASTER_OPERATION_EVENTS) {
      rasterOperationEvents.shift();
    }

    return normalized;
  }

  function recordStrokeMemory(event = {}) {
    const normalized = normalizeStrokeMemoryEvent(event);

    stats.strokeMemoryEventCount += 1;
    strokeMemoryEvents.push(normalized);

    while (strokeMemoryEvents.length > MAX_STROKE_MEMORY_EVENTS) {
      strokeMemoryEvents.shift();
    }

    return normalized;
  }

  function sumRows(rows, predicate) {
    return rows.reduce((sum, row) => (predicate(row) ? sum + row.bytes : sum), 0);
  }

  function createSummary(rows) {
    const groups = new Map();

    rows.forEach((row) => {
      const key = `${row.ownerType}/${row.kind}`;
      const current = groups.get(key) || {
        bytes: 0,
        category: key,
        count: 0,
        kind: row.kind,
        ownerType: row.ownerType,
      };

      current.bytes += row.bytes;
      current.count += 1;
      groups.set(key, current);
    });

    return Array.from(groups.values())
      .map((entry) => ({
        ...entry,
        MiB: formatMiB(entry.bytes),
        estimatedMiB: formatMiB(entry.bytes),
      }))
      .sort((first, second) => second.bytes - first.bytes);
  }

  function getRowsSortedByBytes() {
    return Array.from(textures.values())
      .map(toPublicTextureRow)
      .sort((first, second) => second.bytes - first.bytes);
  }

  function getTopResourcesByBytes(limit = 20) {
    return getRowsSortedByBytes().slice(0, Math.max(1, Math.floor(Number(limit) || 20)));
  }

  function reportRasterMemory(options = {}) {
    const rows = getRowsSortedByBytes();
    const totalEstimatedGpuBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
    const orphanSuspectRows = rows.filter((row) => row.ownerType === "orphan" || row.ownerType === "suspect");
    const topLimit = Math.max(1, Math.floor(Number(options.limit) || 20));
    const history = namespace.documentHistory;
    const historyRasterBudgetBytes = Number(history?.getRasterHistoryBudgetBytes?.()) || 0;
    const historyRasterEstimatedBytes = Number(history?.getRasterHistoryBytes?.()) || 0;
    const historyRasterGpuHotBudgetBytes = Number(history?.getRasterHistoryGpuHotBudgetBytes?.()) || 0;
    const historyRasterGpuHotBytes = Number(history?.getRasterHistoryGpuHotBytes?.()) || 0;
    const historyRasterCpuColdBytes = Number(history?.getRasterHistoryCpuColdBytes?.()) || 0;
    const paintTargetCropPotential = options.analyzePaintTargets === true ||
      options.includePaintTargetCropPotential === true
      ? namespace.documentRenderer?.estimatePaintTargetCropPotential?.(options.paintTargetAnalysis || {}) || null
      : null;
    const result = {
      backgroundBytes: sumRows(rows, (row) => row.kind === "background"),
      blendBackdropBytes: sumRows(rows, (row) => row.kind === "backdrop"),
      countedTextures: textures.size,
      createdFramebufferCount: stats.createdFramebufferCount,
      createdRenderbufferCount: stats.createdRenderbufferCount,
      createdTextureCount: stats.createdTextureCount,
      deletedFramebufferCount: stats.deletedFramebufferCount,
      deletedRenderbufferCount: stats.deletedRenderbufferCount,
      deletedTextureCount: stats.deletedTextureCount,
      effectScratchBytes: sumRows(rows, (row) => row.kind === "effectScratch"),
      framebufferCount: framebuffers.size,
      fullCanvasMaterializationCount: stats.fullCanvasMaterializationCount,
      fullCanvasMaterializations: fullCanvasMaterializations.slice().reverse(),
      fullCanvasResourceCount: rows.filter((row) => row.isFullCanvas).length,
      generatedAt: nowIso(),
      historyCompressedBytes: sumRows(rows, (row) => row.ownerType === "historyCompressed"),
      historyCpuRawBytes: sumRows(rows, (row) => row.ownerType === "historyCpuRaw") + historyRasterCpuColdBytes,
      historyGpuBytes: sumRows(rows, (row) => row.ownerType === "historyGpu"),
      historyRasterBudgetBytes,
      historyRasterBudgetMiB: formatMiB(historyRasterBudgetBytes),
      historyRasterCpuColdBytes,
      historyRasterCpuColdMiB: formatMiB(historyRasterCpuColdBytes),
      historyRasterEstimatedBytes,
      historyRasterEstimatedMiB: formatMiB(historyRasterEstimatedBytes),
      historyRasterGpuHotBudgetBytes,
      historyRasterGpuHotBudgetMiB: formatMiB(historyRasterGpuHotBudgetBytes),
      historyRasterGpuHotBytes,
      historyRasterGpuHotMiB: formatMiB(historyRasterGpuHotBytes),
      historyRedoEntryCount: Array.isArray(history?.redoStack) ? history.redoStack.length : 0,
      historyUndoEntryCount: Array.isArray(history?.undoStack) ? history.undoStack.length : 0,
      liveLayerBytes: sumRows(rows, (row) => row.ownerType === "live"),
      note:
        "Stima risorse raster/WebGL registrate dall'app. Non include overhead driver/browser o risorse WebGL non ancora instrumentate.",
      orphanSuspectBytes: orphanSuspectRows.reduce((sum, row) => sum + row.bytes, 0),
      orphanSuspectCount:
        orphanSuspectRows.length +
        stats.unknownDeletedTextureCount +
        stats.unknownDeletedFramebufferCount +
        stats.unknownDeletedRenderbufferCount,
      paintLayerBytes: sumRows(rows, (row) => row.kind === "paintTarget"),
      paintTargetCropPotential,
      paintTargetPotentialSavingsBytes: Number(paintTargetCropPotential?.potentialSavingsBytes) || 0,
      paintTargetPotentialSavingsMiB: formatMiB(paintTargetCropPotential?.potentialSavingsBytes || 0),
      previewCacheBytes: sumRows(rows, (row) => row.ownerType === "cache" && row.kind === "previewMip"),
      purgeableResourceCount: rows.filter((row) => row.purgeable).length,
      rasterOperationEventCount: stats.rasterOperationEventCount,
      rasterOperationEvents: rasterOperationEvents.slice().reverse(),
      renderbufferCount: renderbuffers.size,
      rows,
      scratchBytes: sumRows(rows, (row) => row.ownerType === "scratch"),
      source: "raster-resource-manager",
      strokeScratchBytes: sumRows(rows, (row) => row.kind === "strokeScratch"),
      strokeMemoryEventCount: stats.strokeMemoryEventCount,
      strokeMemoryEvents: strokeMemoryEvents.slice().reverse(),
      summary: createSummary(rows),
      suspectEvents: suspectEvents.slice().reverse(),
      textureCount: textures.size,
      topResourcesByBytes: rows.slice(0, topLimit),
      totalBytes: totalEstimatedGpuBytes,
      totalEstimatedGpuBytes,
      totalMiB: formatMiB(totalEstimatedGpuBytes),
      transformPreviewBytes: sumRows(rows, (row) => row.kind === "transformPreview"),
      unknownDeletedFramebufferCount: stats.unknownDeletedFramebufferCount,
      unknownDeletedRenderbufferCount: stats.unknownDeletedRenderbufferCount,
      unknownDeletedTextureCount: stats.unknownDeletedTextureCount,
    };

    if (options.log === true) {
      logRasterMemoryReport(result);
    }

    return result;
  }

  function logRasterMemoryReport(result = reportRasterMemory({ log: false })) {
    console.group?.(
      `[RasterMemory] ${result.totalMiB} MiB GPU stimati, ${result.textureCount} texture, ${result.framebufferCount} framebuffer`,
    );
    console.table?.(result.summary);
    console.table?.(
      result.topResourcesByBytes.map((row) => ({
        MiB: row.MiB,
        bboxCoverage: row.bboxCoverage,
        height: row.height,
        isFullCanvas: row.isFullCanvas,
        kind: row.kind,
        label: row.label,
        layerId: row.layerId,
        ownerId: row.ownerId,
        ownerType: row.ownerType,
        purgeable: row.purgeable,
        reason: row.reason,
        width: row.width,
      })),
    );

    if (result.paintTargetCropPotential?.rows?.length > 0) {
      console.table?.(
        result.paintTargetCropPotential.rows.slice(0, 20).map((row) => ({
          action: row.action,
          contentCoverage: row.contentCoverage,
          contentHeight: row.contentRect?.height || 0,
          contentWidth: row.contentRect?.width || 0,
          currentMiB: row.currentMiB,
          estimatedCroppedMiB: row.estimatedCroppedMiB,
          isFullCanvas: row.isFullCanvas,
          layerId: row.layerId,
          mode: row.mode,
          savingsMiB: row.savingsMiB,
        })),
      );
    }

    if (result.fullCanvasMaterializations.length > 0) {
      console.table?.(result.fullCanvasMaterializations.slice(0, 20));
    }

    if (result.rasterOperationEvents.length > 0) {
      console.table?.(result.rasterOperationEvents.slice(0, 20));
    }

    if (result.strokeMemoryEvents.length > 0) {
      console.table?.(result.strokeMemoryEvents.slice(0, 20));
    }

    if (result.suspectEvents.length > 0) {
      console.warn?.("[RasterMemory] Risorse sospette / delete non registrati:", result.suspectEvents);
    }

    console.groupEnd?.();
  }

  const manager = {
    BYTES_PER_PIXEL,
    MIB,
    _debugState() {
      return {
        framebuffers,
        fullCanvasMaterializations,
        rasterOperationEvents,
        renderbuffers,
        stats,
        strokeMemoryEvents,
        suspectEvents,
        textures,
      };
    },
    deleteFramebuffer,
    deleteRenderbuffer,
    deleteTexture,
    estimateTextureBytes,
    formatMiB,
    getTopResourcesByBytes,
    logRasterMemoryReport,
    markUsed,
    recordFullCanvasMaterialization,
    recordRasterOperation,
    recordStrokeMemory,
    registerFramebuffer,
    registerRenderbuffer,
    registerTexture,
    reportRasterMemory,
    updateFramebuffer,
    updateTexture,
  };

  namespace.rasterResourceManager = manager;

  if (typeof namespace.collectRasterMemory !== "function") {
    namespace.collectRasterMemory = function collectRasterMemoryFromManager(options = {}) {
      return manager.reportRasterMemory({
        ...options,
        log: false,
      });
    };
  }

  if (typeof namespace.reportRasterMemory !== "function") {
    namespace.reportRasterMemory = function reportRasterMemoryFromManager(options = {}) {
      const result = manager.reportRasterMemory({
        ...options,
        log: false,
      });

      if (options.log !== false) {
        manager.logRasterMemoryReport(result);
      }

      return result;
    };
  }
})(window.CBO = window.CBO || {});
