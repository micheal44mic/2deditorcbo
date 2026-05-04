(function registerRasterMemoryReport(namespace) {
  const BYTES_PER_PIXEL = 4;
  const MIB = 1024 * 1024;

  function isObject(value) {
    return Boolean(value && typeof value === "object");
  }

  function toPositiveInt(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }

    return Math.max(1, Math.round(number));
  }

  function bytesToMiB(bytes) {
    return bytes / MIB;
  }

  function formatMiB(bytes) {
    const value = bytesToMiB(bytes);

    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }

  function estimateTextureBytes(width, height, mipLevels = 1) {
    let total = 0;
    let levelWidth = toPositiveInt(width);
    let levelHeight = toPositiveInt(height);
    const levels = Math.max(1, Math.floor(Number(mipLevels) || 1));

    for (let level = 0; level < levels; level += 1) {
      total += levelWidth * levelHeight * BYTES_PER_PIXEL;
      levelWidth = Math.max(1, Math.floor(levelWidth * 0.5));
      levelHeight = Math.max(1, Math.floor(levelHeight * 0.5));
    }

    return total;
  }

  function getLayerLabel(layerModel, layerId) {
    const layer = layerModel?.findEntryById?.(layerId);

    if (!layer) {
      return layerId;
    }

    return `${layer.name || layerId} (${layer.type || "layer"})`;
  }

  function getRectSize(value) {
    const rect = value?.rect || value?.sourceRect || null;
    const width = toPositiveInt(value?.width || rect?.width);
    const height = toPositiveInt(value?.height || rect?.height);

    return { height, width };
  }

  function createSummary(rows) {
    const summary = new Map();

    rows.forEach((row) => {
      const previous = summary.get(row.category) || {
        bytes: 0,
        category: row.category,
        count: 0,
        duplicateCount: 0,
      };

      previous.bytes += row.bytes;
      previous.count += row.duplicate ? 0 : 1;
      previous.duplicateCount += row.duplicate ? 1 : 0;
      summary.set(row.category, previous);
    });

    return Array.from(summary.values())
      .map((item) => ({
        category: item.category,
        duplicateRows: item.duplicateCount,
        estimatedMiB: formatMiB(item.bytes),
        textures: item.count,
      }))
      .sort((first, second) => Number(second.estimatedMiB) - Number(first.estimatedMiB));
  }

  function collectHistorySnapshots(report, history) {
    const stacks = [
      ["undo", history?.undoStack],
      ["redo", history?.redoStack],
    ];

    const scan = (value, context, seenObjects) => {
      if (!isObject(value) || seenObjects.has(value)) {
        return;
      }

      seenObjects.add(value);

      if (value.texture) {
        const { height, width } = getRectSize(value);

        if (width > 0 && height > 0) {
          report.addTexture({
            category: "history snapshots",
            extra: {
              source: context.source,
              stack: context.stack,
            },
            height,
            label: context.path,
            texture: value.texture,
            width,
          });
        }
      }

      Object.entries(value).forEach(([key, child]) => {
        if (
          key === "texture" ||
          key === "framebuffer" ||
          typeof child === "function" ||
          !isObject(child)
        ) {
          return;
        }

        scan(child, {
          path: `${context.path}.${key}`,
          source: context.source,
          stack: context.stack,
        }, seenObjects);
      });
    };

    stacks.forEach(([stackName, stack]) => {
      if (!Array.isArray(stack)) {
        return;
      }

      stack.forEach((entry, index) => {
        const source = entry?.source || entry?.type || "history-entry";

        scan(entry, {
          path: `${stackName}[${index}] ${source}`,
          source,
          stack: stackName,
        }, new WeakSet());
      });
    });
  }

  function createReport() {
    const countedTextures = new Set();
    const rows = [];

    const report = {
      addTexture(options = {}) {
        const texture = options.texture;
        const width = toPositiveInt(options.width);
        const height = toPositiveInt(options.height);

        if (!texture || width <= 0 || height <= 0) {
          return null;
        }

        const duplicate = countedTextures.has(texture);
        const estimatedBytes = estimateTextureBytes(width, height, options.mipLevels);
        const bytes = duplicate ? 0 : estimatedBytes;

        if (!duplicate) {
          countedTextures.add(texture);
        }

        const row = {
          bytes,
          category: options.category || "other",
          duplicate,
          estimatedMiB: formatMiB(bytes),
          height,
          label: options.label || "texture",
          mipLevels: Math.max(1, Math.floor(Number(options.mipLevels) || 1)),
          rawEstimatedMiB: formatMiB(estimatedBytes),
          width,
          ...(options.extra || {}),
        };

        rows.push(row);
        return row;
      },
      countedTextures,
      rows,
    };

    return report;
  }

  function collectRasterMemory() {
    if (namespace.rasterResourceManager?.reportRasterMemory) {
      return namespace.rasterResourceManager.reportRasterMemory({ log: false });
    }

    const renderer = namespace.documentRenderer;
    const layerModel = renderer?.layerModel || namespace.documentLayerModel;
    const history = namespace.documentHistory;
    const brushEngine = namespace.brushEngine;
    const smudgeEngine = namespace.smudgeEngine;
    const report = createReport();

    if (!renderer) {
      return {
        rows: [],
        summary: [],
        totalBytes: 0,
        totalMiB: "0.00",
        warning: "DocumentRenderer non inizializzato.",
      };
    }

    renderer.rasterTargetsByLayerId?.forEach?.((target, layerId) => {
      report.addTexture({
        category: "persistent layer targets",
        extra: {
          layerId,
          targetX: toPositiveInt(target?.x || 0),
          targetY: toPositiveInt(target?.y || 0),
        },
        height: target?.height,
        label: getLayerLabel(layerModel, layerId),
        texture: target?.texture,
        width: target?.width,
      });
    });

    report.addTexture({
      category: "renderer caches",
      height: renderer.height,
      label: "main document texture",
      texture: renderer.texture,
      width: renderer.width,
    });

    report.addTexture({
      category: "renderer caches",
      height: renderer.height,
      label: "preview mip cache",
      mipLevels: renderer.previewMipLevels || 1,
      texture: renderer.previewTexture,
      width: renderer.width,
    });

    report.addTexture({
      category: "renderer caches",
      height: renderer.layerBlendBackdropHeight,
      label: "layer blend backdrop",
      texture: renderer.layerBlendBackdropTexture,
      width: renderer.layerBlendBackdropWidth,
    });

    ["layerEffectScratchA", "layerEffectScratchB", "activeStrokeScratchTarget"].forEach((key) => {
      const target = renderer[key];

      report.addTexture({
        category: "renderer scratch targets",
        height: target?.height,
        label: key,
        texture: target?.texture,
        width: target?.width,
      });
    });

    if (renderer.rasterTransformPreview?.texture) {
      const rect = renderer.rasterTransformPreview.sourceRect || {};

      report.addTexture({
        category: "active previews",
        height: rect.height,
        label: `raster transform preview (${renderer.rasterTransformPreview.layerId || "layer"})`,
        texture: renderer.rasterTransformPreview.texture,
        width: rect.width,
      });
    }

    if (brushEngine?.strokeBufferRect) {
      [
        ["strokeTexture", brushEngine.strokeTexture],
        ["strokePlateauTexture", brushEngine.strokePlateauTexture],
        ["strokeAccumTexture", brushEngine.strokeAccumTexture],
      ].forEach(([label, texture]) => {
        report.addTexture({
          category: "brush active stroke",
          height: brushEngine.strokeBufferRect.height,
          label,
          texture,
          width: brushEngine.strokeBufferRect.width,
        });
      });
    }

    ["scratchTarget", "activeHistoryBeforeSnapshot"].forEach((key) => {
      const target = smudgeEngine?.[key];
      const { height, width } = getRectSize(target);

      report.addTexture({
        category: "smudge active targets",
        height,
        label: key,
        texture: target?.texture,
        width,
      });
    });

    collectHistorySnapshots(report, history);

    const totalBytes = report.rows.reduce((sum, row) => sum + row.bytes, 0);
    const rows = report.rows
      .slice()
      .sort((first, second) => second.bytes - first.bytes);

    return {
      countedTextures: report.countedTextures.size,
      generatedAt: new Date().toISOString(),
      note: "Stima texture WebGL controllate dall'app: width * height * 4 byte. Non include overhead driver/browser o texture senza dimensioni note.",
      rows,
      summary: createSummary(rows),
      totalBytes,
      totalMiB: formatMiB(totalBytes),
    };
  }

  function logRasterMemoryReport(result) {
    const tableRows = result.rows.map((row) => ({
      category: row.category,
      duplicate: row.duplicate,
      height: row.height,
      label: row.label,
      MiB: row.estimatedMiB,
      rawMiB: row.rawEstimatedMiB,
      width: row.width,
    }));

    console.groupCollapsed?.(`[CBO memory] Raster texture estimate: ${result.totalMiB} MiB`);
    console.table?.(result.summary);
    console.table?.(tableRows);
    console.log?.(result.note);
    console.groupEnd?.();
  }

  namespace.collectRasterMemory = collectRasterMemory;
  namespace.reportRasterMemory = function reportRasterMemory(options = {}) {
    const result = collectRasterMemory();

    if (options.log !== false) {
      if (
        result?.source === "raster-resource-manager" &&
        namespace.rasterResourceManager?.logRasterMemoryReport
      ) {
        namespace.rasterResourceManager.logRasterMemoryReport(result);
      } else {
        logRasterMemoryReport(result);
      }
    }

    return result;
  };
})(window.CBO = window.CBO || {});
