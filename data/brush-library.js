window.CBO = window.CBO || {};

(function registerBrushLibrary(namespace) {
  const BrushDefaults = namespace.BrushDefaults;
  const hardBlendCircleAlphaSrc = "./data/hard-blend-circle-alpha.png";
  const hardBlendCircleAlphaName = "CERCHIO DURO";
  const softCircleAlphaName = "SOFT";
  const softCircleAlphaSrc = createSoftCircleAlphaSrc();
  let brushSequence = 0;

  function createSoftCircleAlphaSrc() {
    const size = 512;
    const hardness = 3;

    if (typeof document === "undefined") {
      return hardBlendCircleAlphaSrc;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return hardBlendCircleAlphaSrc;
    }

    canvas.width = size;
    canvas.height = size;

    const imageData = context.createImageData(size, size);
    const data = imageData.data;
    const center = (size - 1) * 0.5;
    const radius = center - 1;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const isOuterFrame = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        const distance = Math.hypot(x - center, y - center);
        const r = distance / Math.max(1, radius);
        const coverage = isOuterFrame || r >= 1 ? 0 : Math.pow(Math.max(0, 1 - r * r), hardness);

        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(coverage * 255);
      }
    }

    context.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
  }

  function normalizeSettings(settings = {}) {
    return BrushDefaults?.createSettings
      ? BrushDefaults.createSettings(settings)
      : { ...(settings || {}) };
  }

  function cloneSettings(settings = {}) {
    return normalizeSettings({ ...(settings || {}) });
  }

  function notifyBrushLibraryChange(detail = {}) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("cbo:brush-library-change", {
        detail: {
          source: "brush-library",
          ...detail,
        },
      }),
    );
  }

  function createId(prefix) {
    brushSequence += 1;

    return `${prefix}-${Date.now().toString(36)}-${brushSequence.toString(36)}`;
  }

  const hardBlendSettings = normalizeSettings({
    radius: 48,
    opacity: 1,
    renderingMode: "light-glaze",
    flow: 1,
    hardness: 1,
    wetEdges: 0,
    burntEdges: 0,
    alphaThresholdEnabled: false,
    spacing: 0.08,
    spacingJitter: 0,
    jitterLateral: 0,
    jitterLinear: 0,
    fallOff: 0,
    taperStart: 0,
    taperEnd: 0,
    taperSize: 0,
    taperOpacity: 0,
    taperPressure: 0,
    shapeAlphaSrc: hardBlendCircleAlphaSrc,
    shapeAlphaName: hardBlendCircleAlphaName,
    shapeRotation: 0,
    shapeScatter: 0,
    shapeCount: 1,
    shapeCountJitter: 0,
    shapeRandomized: false,
    shapeFlipX: false,
    shapeFlipY: false,
    grainEnabled: false,
    stampColorHueJitter: 0,
    stampColorSaturationJitter: 0,
    stampColorLightnessJitter: 0,
    stampColorDarknessJitter: 0,
    stampColorSecondaryJitter: 0,
    strokeColorHueJitter: 0,
    strokeColorSaturationJitter: 0,
    strokeColorLightnessJitter: 0,
    strokeColorDarknessJitter: 0,
    strokeColorSecondaryJitter: 0,
    wetDilution: 0,
    wetCharge: 1,
    wetAttack: 1,
    wetnessJitter: 0,
  });

  const softSettings = normalizeSettings({
    ...hardBlendSettings,
    radius: 72,
    opacity: 1,
    renderingMode: "uniform-glaze",
    flow: 0.1,
    spacing: 0.04,
    shapeAlphaSrc: softCircleAlphaSrc,
    shapeAlphaName: softCircleAlphaName,
    grainEnabled: false,
  });

  const brushes = {
    "hard-blend": {
      id: "hard-blend",
      name: "FUSIONE DURO",
      settings: cloneSettings(hardBlendSettings),
    },
    soft: {
      id: "soft",
      name: "SOFT",
      settings: cloneSettings(softSettings),
    },
  };

  const packages = [
    {
      id: "essential",
      name: "ESSENTIAL PACK",
      brushIds: ["hard-blend", "soft"],
    },
  ];

  function getBrushRecordsFromPayload(payload) {
    if (Array.isArray(payload?.brushes)) {
      return payload.brushes;
    }

    if (payload?.brushes && typeof payload.brushes === "object") {
      return Object.values(payload.brushes);
    }

    return [];
  }

  function normalizeBrushRecord(record) {
    const id = String(record?.id || "").trim();

    if (!id) {
      return null;
    }

    return {
      id,
      name: String(record?.name || "BRUSH").trim() || "BRUSH",
      settings: cloneSettings(record?.settings || hardBlendSettings),
    };
  }

  function createLibrarySnapshot(options = {}) {
    const selectedBrushId = String(options.selectedBrushId || "").trim();
    const selectedPackageId = String(options.selectedPackageId || "").trim();
    const exportedBrushes = [];

    packages.forEach((brushPackage) => {
      brushPackage.brushIds.forEach((brushId) => {
        const brush = brushes[brushId];

        if (!brush) {
          return;
        }

        exportedBrushes.push({
          id: brush.id,
          name: brush.name,
          packageId: brushPackage.id,
          settings: cloneSettings(brush.settings),
        });
      });
    });

    return {
      format: "cbo-brush-presets",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      selectedBrushId: selectedBrushId || null,
      selectedPackageId: selectedPackageId || null,
      packages: packages.map((brushPackage) => ({
        id: brushPackage.id,
        name: brushPackage.name,
        brushIds: [...brushPackage.brushIds],
      })),
      brushes: exportedBrushes,
    };
  }

  function replaceLibraryState(payload, options = {}) {
    const brushRecords = getBrushRecordsFromPayload(payload);
    const nextBrushes = {};

    brushRecords.forEach((record) => {
      const brush = normalizeBrushRecord(record);

      if (brush) {
        nextBrushes[brush.id] = brush;
      }
    });

    const nextPackages = [];
    const referencedBrushIds = new Set();
    const packageRecords = Array.isArray(payload?.packages) ? payload.packages : [];

    packageRecords.forEach((record) => {
      const id = String(record?.id || "").trim();
      const brushIds = Array.isArray(record?.brushIds)
        ? record.brushIds
          .map((brushId) => String(brushId || "").trim())
          .filter((brushId, index, allIds) => brushId && nextBrushes[brushId] && allIds.indexOf(brushId) === index)
        : [];

      if (!id || brushIds.length === 0) {
        return;
      }

      brushIds.forEach((brushId) => referencedBrushIds.add(brushId));
      nextPackages.push({
        id,
        name: String(record?.name || "BRUSH SET").trim() || "BRUSH SET",
        brushIds,
      });
    });

    Object.keys(nextBrushes).forEach((brushId) => {
      if (referencedBrushIds.has(brushId)) {
        return;
      }

      const record = brushRecords.find((item) => String(item?.id || "").trim() === brushId);
      const packageId = String(record?.packageId || "").trim();
      const brushPackage = nextPackages.find((item) => item.id === packageId) || nextPackages[0];

      if (brushPackage) {
        brushPackage.brushIds.push(brushId);
        referencedBrushIds.add(brushId);
      }
    });

    if (nextPackages.length === 0 || referencedBrushIds.size === 0) {
      return {
        restored: false,
        reason: "empty-library",
      };
    }

    Object.keys(brushes).forEach((brushId) => {
      delete brushes[brushId];
    });
    Object.assign(brushes, nextBrushes);
    packages.splice(0, packages.length, ...nextPackages);

    if (options.silent !== true) {
      notifyBrushLibraryChange({
        action: "replace-library",
        brushCount: Object.keys(brushes).length,
        packageCount: packages.length,
        source: options.source || "replace-library",
      });
    }

    return {
      restored: true,
      brushCount: Object.keys(brushes).length,
      packageCount: packages.length,
    };
  }

  function getPackage(packageId) {
    return packages.find((brushPackage) => brushPackage.id === packageId) || packages[0] || null;
  }

  function findPackageByBrushId(brushId) {
    return packages.find((brushPackage) => brushPackage.brushIds.includes(brushId)) || null;
  }

  function getBrush(brushId) {
    return brushes[brushId] || null;
  }

  function getUniqueBrushName(packageId, baseName) {
    const brushPackage = getPackage(packageId);
    const names = new Set(
      (brushPackage?.brushIds || [])
        .map((brushId) => brushes[brushId]?.name)
        .filter(Boolean),
    );

    if (!names.has(baseName)) {
      return baseName;
    }

    let index = 2;
    let nextName = `${baseName} ${index}`;

    while (names.has(nextName)) {
      index += 1;
      nextName = `${baseName} ${index}`;
    }

    return nextName;
  }

  function addBrushToPackage(packageId, brush) {
    const brushPackage = getPackage(packageId);

    if (!brushPackage || !brush?.id) {
      return null;
    }

    brushes[brush.id] = brush;
    brushPackage.brushIds.push(brush.id);

    return brush;
  }

  function createBrush(packageId) {
    const brushPackage = getPackage(packageId);

    if (!brushPackage) {
      return null;
    }

    const brush = addBrushToPackage(brushPackage.id, {
      id: createId("brush"),
      name: getUniqueBrushName(brushPackage.id, "NUOVO PENNELLO"),
      settings: cloneSettings(hardBlendSettings),
    });

    if (brush) {
      notifyBrushLibraryChange({
        action: "create-brush",
        brushId: brush.id,
        packageId: brushPackage.id,
      });
    }

    return brush;
  }

  function duplicateBrush(brushId) {
    const sourceBrush = getBrush(brushId);
    const sourcePackage = findPackageByBrushId(brushId);

    if (!sourceBrush || !sourcePackage) {
      return null;
    }

    const brush = addBrushToPackage(sourcePackage.id, {
      id: createId("brush-copy"),
      name: getUniqueBrushName(sourcePackage.id, `${sourceBrush.name} COPIA`),
      settings: cloneSettings(sourceBrush.settings),
    });

    if (brush) {
      notifyBrushLibraryChange({
        action: "duplicate-brush",
        brushId: brush.id,
        packageId: sourcePackage.id,
        sourceBrushId: brushId,
      });
    }

    return brush;
  }

  function deleteBrush(brushId) {
    const sourceBrush = getBrush(brushId);
    const sourcePackage = findPackageByBrushId(brushId);
    const sourceIndex = sourcePackage?.brushIds.indexOf(brushId) ?? -1;

    if (!sourceBrush || !sourcePackage || sourceIndex < 0) {
      return null;
    }

    if (sourcePackage.brushIds.length <= 1) {
      return {
        deleted: false,
        reason: "last-brush",
        packageId: sourcePackage.id,
        brushId,
      };
    }

    sourcePackage.brushIds.splice(sourceIndex, 1);
    delete brushes[brushId];

    notifyBrushLibraryChange({
      action: "delete-brush",
      brushId,
      packageId: sourcePackage.id,
    });

    return {
      deleted: true,
      packageId: sourcePackage.id,
      nextBrushId: sourcePackage.brushIds[Math.min(sourceIndex, sourcePackage.brushIds.length - 1)] || null,
    };
  }

  function updateBrushSettings(brushId, settings) {
    const brush = getBrush(brushId);

    if (!brush) {
      return null;
    }

    brush.settings = cloneSettings(settings);

    notifyBrushLibraryChange({
      action: "update-brush-settings",
      brushId,
    });

    return brush;
  }

  namespace.BrushLibrary = {
    createBrush,
    createLibrarySnapshot,
    deleteBrush,
    duplicateBrush,
    findPackageByBrushId,
    getBrush,
    getPackage,
    getPackages: () => packages,
    getSettings: (brushId) => {
      const brush = getBrush(brushId);

      return brush ? cloneSettings(brush.settings) : null;
    },
    hardBlendSettings: cloneSettings(hardBlendSettings),
    replaceLibraryState,
    softSettings: cloneSettings(softSettings),
    updateBrushSettings,
  };
})(window.CBO);
