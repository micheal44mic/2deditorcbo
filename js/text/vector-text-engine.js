(function registerVectorTextEngine(namespace) {
  const DEFAULT_FONT_URL = "./vendor/fonts/UnifrakturCook-Bold.ttf";
  const DEFAULT_FONT_LABEL = "UnifrakturCook";
  const HANDLE_PAIRS = {
    TC_HandleL: "TC_HandleR",
    TC_HandleR: "TC_HandleL",
    BC_HandleL: "BC_HandleR",
    BC_HandleR: "BC_HandleL",
  };
  const HANDLE_ANCHORS = {
    TC_HandleL: "TC",
    TC_HandleR: "TC",
    BC_HandleL: "BC",
    BC_HandleR: "BC",
  };
  const CENTER_ANCHOR_HANDLES = {
    TC: ["TC_HandleL", "TC_HandleR"],
    BC: ["BC_HandleL", "BC_HandleR"],
  };
  const fontCache = new Map();

  function safeTextValue(text) {
    return String(text || "").trim().length > 0 ? String(text) : " ";
  }

  function getFontRecord(url) {
    return (namespace.VECTOR_TEXT_FONTS || []).find((font) => font.url === url) || null;
  }

  function finiteDimension(value) {
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function clonePoint(point = {}) {
    return {
      x: Number.isFinite(point.x) ? point.x : 0,
      y: Number.isFinite(point.y) ? point.y : 0,
    };
  }

  function cloneEnvelopeGrid(grid) {
    return {
      TL: clonePoint(grid?.TL),
      TR: clonePoint(grid?.TR),
      BL: clonePoint(grid?.BL),
      BR: clonePoint(grid?.BR),
      TC: clonePoint(grid?.TC),
      BC: clonePoint(grid?.BC),
      TC_HandleL: clonePoint(grid?.TC_HandleL),
      TC_HandleR: clonePoint(grid?.TC_HandleR),
      BC_HandleL: clonePoint(grid?.BC_HandleL),
      BC_HandleR: clonePoint(grid?.BC_HandleR),
    };
  }

  function createImplicitCornerHandle(corner, centerHandle) {
    return {
      x: corner.x + (centerHandle.x - corner.x) / 2,
      y: corner.y + (centerHandle.y - corner.y) / 2,
    };
  }

  function getImplicitEnvelopeCornerHandles(grid) {
    const safeGrid = cloneEnvelopeGrid(grid);

    return {
      TL_Handle: createImplicitCornerHandle(safeGrid.TL, safeGrid.TC_HandleL),
      TR_Handle: createImplicitCornerHandle(safeGrid.TR, safeGrid.TC_HandleR),
      BL_Handle: createImplicitCornerHandle(safeGrid.BL, safeGrid.BC_HandleL),
      BR_Handle: createImplicitCornerHandle(safeGrid.BR, safeGrid.BC_HandleR),
    };
  }

  function mapCommandPoint(command, keyX, keyY, warpPoint) {
    const x = command[keyX];
    const y = command[keyY];

    if (typeof x !== "number" || typeof y !== "number") {
      return;
    }

    const point = warpPoint(x, y);

    command[keyX] = point.x;
    command[keyY] = point.y;
  }

  function createWarpPoint(bounds, warp = {}) {
    const width = Math.max(1, bounds.x2 - bounds.x1);
    const centerX = bounds.x1 + width / 2;
    const type = warp.type || "none";
    const amount = Number.isFinite(warp.amount) ? warp.amount : 0;

    return (x, y) => {
      if (type === "none" || amount === 0) {
        return { x, y };
      }

      if (type === "flag") {
        const progress = (x - bounds.x1) / width;
        const wave = Math.sin(progress * Math.PI * 3);

        return { x, y: y + wave * amount };
      }

      const normalized = (x - centerX) / (width / 2);

      return { x, y: y + normalized * normalized * amount };
    };
  }

  function translateCommand(command, dx, dy) {
    ["x", "x1", "x2"].forEach((key) => {
      if (typeof command[key] === "number") {
        command[key] += dx;
      }
    });
    ["y", "y1", "y2"].forEach((key) => {
      if (typeof command[key] === "number") {
        command[key] += dy;
      }
    });

    return command;
  }

  function createTextPath(font, text, fontSize, options = {}) {
    const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 300;
    const lineHeight = Number.isFinite(options.lineHeight) && options.lineHeight > 0
      ? options.lineHeight
      : size * 1.2;
    const letterSpacing = Number.isFinite(options.letterSpacing) ? options.letterSpacing : 0;
    const textAlign = ["left", "center", "right"].includes(options.textAlign) ? options.textAlign : "left";
    const textValue = options.uppercase === true ? safeTextValue(text).toUpperCase() : safeTextValue(text);
    const lines = textValue.split(/\r?\n/);
    const pathOptions = {
      letterSpacing: letterSpacing / size,
    };

    if (options.ligatures === false) {
      pathOptions.features = {
        liga: false,
        rlig: false,
      };
    }

    if (lines.length <= 1 && textAlign === "left") {
      return font.getPath(textValue, 0, size, size, pathOptions);
    }

    const path = new window.opentype.Path();

    lines.forEach((line, index) => {
      const linePath = font.getPath(line.trim().length ? line : " ", 0, size + index * lineHeight, size, pathOptions);
      const bounds = linePath.getBoundingBox();
      const width = finiteDimension(bounds.x2 - bounds.x1);
      const dx = textAlign === "right" ? -width : textAlign === "center" ? -width / 2 : 0;

      path.extend(linePath.commands.map((command) => translateCommand({ ...command }, dx, 0)));
    });

    return path;
  }

  function createEnvelopeGridFromBounds(bounds) {
    const width = finiteDimension(bounds.x2 - bounds.x1);
    const height = finiteDimension(bounds.y2 - bounds.y1);

    return {
      TL: { x: 0, y: 0 },
      TR: { x: width, y: 0 },
      BL: { x: 0, y: height },
      BR: { x: width, y: height },
      TC: { x: width / 2, y: 0 },
      BC: { x: width / 2, y: height },
      TC_HandleL: { x: width / 3, y: 0 },
      TC_HandleR: { x: (width * 2) / 3, y: 0 },
      BC_HandleL: { x: width / 3, y: height },
      BC_HandleR: { x: (width * 2) / 3, y: height },
    };
  }

  function updateEnvelopeGridNode(grid, nodeId, position) {
    const nextGrid = cloneEnvelopeGrid(grid);
    const previous = grid?.[nodeId];

    if (!previous) {
      return nextGrid;
    }

    nextGrid[nodeId] = clonePoint(position);

    const anchorHandles = CENTER_ANCHOR_HANDLES[nodeId];

    if (anchorHandles) {
      const dx = nextGrid[nodeId].x - previous.x;
      const dy = nextGrid[nodeId].y - previous.y;

      anchorHandles.forEach((handleId) => {
        nextGrid[handleId] = {
          x: grid[handleId].x + dx,
          y: grid[handleId].y + dy,
        };
      });

      return nextGrid;
    }

    const oppositeHandle = HANDLE_PAIRS[nodeId];
    const anchorId = HANDLE_ANCHORS[nodeId];

    if (oppositeHandle && anchorId) {
      const anchor = nextGrid[anchorId];

      nextGrid[oppositeHandle] = {
        x: anchor.x - (nextGrid[nodeId].x - anchor.x),
        y: anchor.y - (nextGrid[nodeId].y - anchor.y),
      };
    }

    return nextGrid;
  }

  function bezier(t, p0, p1, p2, p3) {
    const mt = 1 - t;

    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  function createEnvelopeWarpPoint(bounds, envelopeGrid) {
    const rawW = Number.isFinite(bounds.x2 - bounds.x1) ? bounds.x2 - bounds.x1 : 0;
    const rawH = Number.isFinite(bounds.y2 - bounds.y1) ? bounds.y2 - bounds.y1 : 0;
    const grid = cloneEnvelopeGrid(envelopeGrid);
    const cornerHandles = getImplicitEnvelopeCornerHandles(grid);

    return (x, y) => {
      const u = rawW === 0 ? 0 : (x - bounds.x1) / rawW;
      const v = rawH === 0 ? 0 : (y - bounds.y1) / rawH;
      let topX;
      let topY;

      if (u <= 0.5) {
        const t = u * 2;
        const p1 = cornerHandles.TL_Handle;

        topX = bezier(t, grid.TL.x, p1.x, grid.TC_HandleL.x, grid.TC.x);
        topY = bezier(t, grid.TL.y, p1.y, grid.TC_HandleL.y, grid.TC.y);
      } else {
        const t = (u - 0.5) * 2;
        const p2 = cornerHandles.TR_Handle;

        topX = bezier(t, grid.TC.x, grid.TC_HandleR.x, p2.x, grid.TR.x);
        topY = bezier(t, grid.TC.y, grid.TC_HandleR.y, p2.y, grid.TR.y);
      }

      let botX;
      let botY;

      if (u <= 0.5) {
        const t = u * 2;
        const p1 = cornerHandles.BL_Handle;

        botX = bezier(t, grid.BL.x, p1.x, grid.BC_HandleL.x, grid.BC.x);
        botY = bezier(t, grid.BL.y, p1.y, grid.BC_HandleL.y, grid.BC.y);
      } else {
        const t = (u - 0.5) * 2;
        const p2 = cornerHandles.BR_Handle;

        botX = bezier(t, grid.BC.x, grid.BC_HandleR.x, p2.x, grid.BR.x);
        botY = bezier(t, grid.BC.y, grid.BC_HandleR.y, p2.y, grid.BR.y);
      }

      return {
        x: topX * (1 - v) + botX * v,
        y: topY * (1 - v) + botY * v,
      };
    };
  }

  function applyEnvelopeWarp(path, envelopeGrid) {
    const bounds = path.getBoundingBox();
    const warpPoint = createEnvelopeWarpPoint(bounds, envelopeGrid);

    path.commands.forEach((command) => {
      mapCommandPoint(command, "x", "y", warpPoint);
      mapCommandPoint(command, "x1", "y1", warpPoint);
      mapCommandPoint(command, "x2", "y2", warpPoint);
    });

    return path;
  }

  function warpPathCommands(commands, bounds, warp) {
    const warpPoint = createWarpPoint(bounds, warp);

    return commands.map((command) => {
      const nextCommand = { ...command };

      mapCommandPoint(nextCommand, "x", "y", warpPoint);
      mapCommandPoint(nextCommand, "x1", "y1", warpPoint);
      mapCommandPoint(nextCommand, "x2", "y2", warpPoint);

      return nextCommand;
    });
  }

  function getWarpedPathData(options = {}) {
    const font = options.font;

    if (!font) {
      return "";
    }

    const path = createTextPath(font, options.text, options.fontSize, {
      letterSpacing: options.letterSpacing,
      ligatures: options.ligatures,
      lineHeight: options.lineHeight,
      textAlign: options.textAlign,
      uppercase: options.uppercase,
    });
    const bounds = path.getBoundingBox();

    if (options.envelopeGrid) {
      applyEnvelopeWarp(path, options.envelopeGrid);
    } else {
      path.commands = warpPathCommands(path.commands, bounds, options.warp);
    }

    return path.toPathData(Number.isFinite(options.decimals) ? options.decimals : 2);
  }

  function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }

  function loadOpenTypeFont(url = DEFAULT_FONT_URL) {
    if (fontCache.has(url)) {
      return fontCache.get(url);
    }

    const request = Promise.resolve().then(async () => {
      if (!window.opentype?.parse) {
        throw new Error("opentype.js non caricato: impossibile leggere i font vettoriali.");
      }

      const fontRecord = getFontRecord(url);

      if (fontRecord?.base64) {
        return window.opentype.parse(base64ToArrayBuffer(fontRecord.base64));
      }

      if (url === "./vendor/fonts/LibreBaskerville-wght.ttf" && namespace.LIBRE_BASKERVILLE_FONT_BASE64) {
        return window.opentype.parse(base64ToArrayBuffer(namespace.LIBRE_BASKERVILLE_FONT_BASE64));
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Impossibile caricare il font ${url}: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();

      return window.opentype.parse(buffer);
    });

    fontCache.set(url, request);

    return request;
  }

  namespace.VectorTextEngine = {
    DEFAULT_FONT_LABEL,
    DEFAULT_FONT_URL,
    applyEnvelopeWarp,
    bezier,
    clearFontCache: () => fontCache.clear(),
    createEnvelopeGridFromBounds,
    createEnvelopeWarpPoint,
    createTextPath,
    getFontRecord,
    createWarpPoint,
    getImplicitEnvelopeCornerHandles,
    getWarpedPathData,
    loadOpenTypeFont,
    updateEnvelopeGridNode,
    warpPathCommands,
  };
})(window.CBO = window.CBO || {});
