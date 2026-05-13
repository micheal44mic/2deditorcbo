#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const url = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DEBUG_PORT = 9222;
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = {
    debugPort: Number(process.env.CBO_DEBUG_PORT) || DEFAULT_DEBUG_PORT,
    jsonPath: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json" && argv[index + 1]) {
      options.jsonPath = argv[index + 1];
      index += 1;
    } else if (arg === "--debug-port" && argv[index + 1]) {
      options.debugPort = Number(argv[index + 1]) || options.debugPort;
      index += 1;
    }
  }

  return options;
}

function findBrowserPath() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    throw new Error("Nessun browser Chromium trovato. Imposta BROWSER_PATH.");
  }

  return found;
}

function contentTypeFor(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const parsed = url.parse(request.url || "/");
    const rawPath = decodeURIComponent(parsed.pathname || "/");
    const relativePath = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relativePath);

    if (!filePath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      response.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function startBrowser(browserPath, debugPort, appUrl) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cbo-edge-profile-"));
  const args = [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=swiftshader",
    "--window-size=1440,1000",
    appUrl,
  ];
  const browser = childProcess.spawn(browserPath, args, {
    stdio: "ignore",
    windowsHide: true,
  });

  return { browser, profileDir };
}

function stopBrowser(browser, profileDir) {
  if (browser?.pid) {
    try {
      if (process.platform === "win32") {
        childProcess.execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        browser.kill("SIGKILL");
      }
    } catch {}
  }

  try {
    fs.rmSync(profileDir, { force: true, recursive: true });
  } catch {}
}

async function fetchJson(targetUrl, options) {
  const response = await fetch(targetUrl, options);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${targetUrl}`);
  }

  return response.json();
}

async function waitForTarget(debugPort) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json`);
      const target = targets.find((item) => item.type === "page" && /index\.html/.test(item.url)) ||
        targets.find((item) => item.type === "page");

      if (target?.webSocketDebuggerUrl) {
        return target;
      }
    } catch {}

    await sleep(250);
  }

  throw new Error("Impossibile trovare il target CDP del browser.");
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { reject, resolve } = pending.get(message.id);

      pending.delete(message.id);

      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    }
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        close() {
          ws.close();
        },
        send(method, params = {}) {
          const messageId = ++id;

          ws.send(JSON.stringify({ id: messageId, method, params }));

          return new Promise((resolve, reject) => {
            pending.set(messageId, { reject, resolve });
          });
        },
      });
    });
    ws.addEventListener("error", () => reject(new Error("Errore WebSocket CDP.")));
  });
}

const BENCHMARK_EXPRESSION = `
(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (
        window.CBO?.documentRenderer ||
        (
          window.CBO?.initEditorCanvas &&
          window.CBO?.rasterResourceManager &&
          window.CBO?.reportRasterMemory
        )
      ) {
        resolve(true);
      } else if (performance.now() - start > 10000) {
        resolve(false);
      } else {
        setTimeout(tick, 100);
      }
    };

    tick();
  });

  if (!window.CBO?.documentRenderer && window.CBO?.initEditorCanvas) {
    window.CBO.initEditorCanvas({ presetId: "square-4000" });
  }

  await new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (window.CBO?.documentRenderer && window.CBO?.reportRasterMemory && window.CBO?.placeUploadedImageOnCanvas) {
        resolve(true);
      } else if (performance.now() - start > 10000) {
        resolve(false);
      } else {
        setTimeout(tick, 100);
      }
    };

    tick();
  });

  if (!window.CBO?.documentRenderer) {
    throw new Error("DocumentRenderer non inizializzato.");
  }

  const renderer = window.CBO.documentRenderer;
  const layerModel = window.CBO.documentLayerModel || renderer.layerModel;
  const history = window.CBO.documentHistory;
  const take = (name) => {
    const report = window.CBO.reportRasterMemory({ log: false });

    return {
      name,
      activeStrokeScratchMiB: report.activeStrokeScratchMiB || "0.00",
      activeStrokeScratchTargetPresent: Boolean(report.activeStrokeScratchTargetPresent),
      brushStrokeScratchMiB: report.brushStrokeScratchMiB || "0.00",
      countedTextures: report.countedTextures,
      effectScratchMiB: report.effectScratchMiB || "0.00",
      incrementalBrushBakeDecision: window.CBO.lastBrushIncrementalStrokeBakeDecision || window.CBO.lastIncrementalBrushBakeDecision || null,
      incrementalBrushBakeReport: window.CBO.lastBrushIncrementalStrokeBake || window.CBO.lastIncrementalBrushBakeReport || null,
      layerEffectScratchAPresent: Boolean(report.layerEffectScratchAPresent),
      layerEffectScratchBPresent: Boolean(report.layerEffectScratchBPresent),
      scratchMiB: report.scratchMiB || "0.00",
      scratchDiagnostics: report.scratchDiagnostics || null,
      strokeMemoryEvents: (report.strokeMemoryEvents || []).slice(0, 3).map((event) => ({
        activeStrokeScratchTargetPresent: Boolean(event.activeStrokeScratchTargetPresent),
        layerEffectScratchAPresent: Boolean(event.layerEffectScratchAPresent),
        layerEffectScratchBPresent: Boolean(event.layerEffectScratchBPresent),
        scratchMiB: event.scratchMiB,
        incrementalBake: Boolean(event.incrementalBake),
        incrementalBakeCount: event.incrementalBakeCount || 0,
        incrementalBakeIndex: event.incrementalBakeIndex || 0,
        incrementalBakeLastReason: event.incrementalBakeLastReason || "",
        incrementalBakeReason: event.incrementalBakeReason || "",
        incrementalBakeSkippedReason: event.incrementalBakeSkippedReason || "",
        incrementalStrokeBakeCount: event.incrementalStrokeBakeCount || 0,
        incrementalStrokeBakeLastReason: event.incrementalStrokeBakeLastReason || "",
        strokeBufferCoverage: event.strokeBufferCoverage,
        strokeBufferRect: event.strokeBufferRect,
        strokeTargetReallocationCount: event.strokeTargetReallocationCount,
        strokeTargetReplaceCount: event.strokeTargetReplaceCount,
      })),
      summary: report.summary,
      topRows: report.rows.slice(0, 8).map((row) => ({
        category: row.category,
        duplicate: row.duplicate,
        height: row.height,
        label: row.label,
        MiB: row.estimatedMiB,
        ownerId: row.ownerId,
        ownerType: row.ownerType,
        kind: row.kind,
        width: row.width,
      })),
      topScratchRows: (report.topScratchResourcesByBytes || []).slice(0, 8).map((row) => ({
        height: row.height,
        kind: row.kind,
        label: row.label,
        MiB: row.estimatedMiB || row.MiB,
        ownerId: row.ownerId,
        ownerType: row.ownerType,
        width: row.width,
      })),
      totalMiB: report.totalMiB,
    };
  };
  const resetEditorCanvas = async (presetId) => {
    if (!window.CBO?.initEditorCanvas) {
      return;
    }

    const stage = document.querySelector(".editor-stage");

    if (stage) {
      stage.dataset.canvasReady = "false";
    }

    window.CBO.documentLayerModel = null;
    window.CBO.initEditorCanvas({ presetId });
    await delay(300);
  };
  const makeSourceCanvas = (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(20, 140, 220, 0.85)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 220, 40, 0.95)";
    ctx.fillRect(Math.round(width * 0.15), Math.round(height * 0.18), Math.round(width * 0.55), Math.round(height * 0.42));
    ctx.fillStyle = "rgba(240, 40, 80, 0.9)";
    ctx.beginPath();
    ctx.arc(Math.round(width * 0.68), Math.round(height * 0.62), Math.round(Math.min(width, height) * 0.18), 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  };
  const results = [];

  await delay(300);
  results.push(take("fresh-load"));

  const sourceCanvas = makeSourceCanvas(800, 600);
  const imageLayer = layerModel.createLayer({
    name: "benchmark-800x600.png",
    type: "image",
  });

  layerModel.setEntries([imageLayer, ...layerModel.getEntries()], { source: "benchmark-image" });
  layerModel.setActiveLayer(imageLayer.id, { source: "benchmark-image" });
  window.CBO.imageRasterizer.placeRasterImage(sourceCanvas, {
    layerId: imageLayer.id,
    source: "benchmark-image",
  });
  await delay(300);
  history?.clear?.();
  results.push(take("after-import-800x600-history-cleared"));

  const layerId = layerModel.activeLayerId;
  const sourceRect = renderer.getRasterContentBounds(layerId);
  const snapshot = renderer.createRasterSnapshot(layerId, sourceRect, "benchmark-resize-source");
  const destRect = { x: 1800, y: 1850, width: 400, height: 300 };
  const destQuad = [
    { x: destRect.x, y: destRect.y },
    { x: destRect.x + destRect.width, y: destRect.y },
    { x: destRect.x + destRect.width, y: destRect.y + destRect.height },
    { x: destRect.x, y: destRect.y + destRect.height },
  ];
  const didTransform = renderer.commitRasterTransform({
    destQuad,
    layerId,
    source: "benchmark-resize",
    sourceRect,
    sourceSnapshot: snapshot,
    transformMode: "free",
  });

  renderer.deleteRasterSnapshot(snapshot);
  history?.clear?.();
  await delay(200);
  results.push({
    ...take("after-resize-to-400x300-history-cleared"),
    didTransform,
    sourceRect,
  });

  layerModel.updateLayer(layerId, {
    effects: [{ type: "gaussian-blur", enabled: true, radius: 50 }],
  }, { history: false, source: "benchmark-blur" });

  let blurError = null;

  try {
    renderer.getLayerRenderTexture(
      layerModel.findEntryById(layerId),
      renderer.rasterTargetsByLayerId.get(layerId),
    );
  } catch (error) {
    blurError = error?.message || String(error);
  }
  await delay(100);
  results.push({
    ...take("after-gaussian-blur-radius-50-scratch"),
    blurError,
  });

  await resetEditorCanvas("square-4000");

  const strokeRenderer = window.CBO.documentRenderer;
  const strokeLayerModel = window.CBO.documentLayerModel || strokeRenderer?.layerModel;
  const strokeHistory = window.CBO.documentHistory;
  const strokeEngine = window.CBO.brushEngine;

  if (strokeRenderer && strokeLayerModel && strokeHistory && strokeEngine) {
    strokeHistory.clear?.();
    strokeEngine.options.historyBatchIdleMs = 250;
    strokeEngine.activeStrokeTool = "brush";
    strokeEngine.currentStrokeTool = "brush";
    strokeEngine.isBrushToolActive = true;
    strokeEngine.camera = { x: 0, y: 0, zoom: 1 };
    strokeEngine.dpr = 1;
    strokeEngine.canvas.getBoundingClientRect = () => ({
      bottom: 4000,
      height: 4000,
      left: 0,
      right: 4000,
      top: 0,
      width: 4000,
      x: 0,
      y: 0,
    });
    strokeEngine.canvas.setPointerCapture = () => {};
    strokeEngine.canvas.hasPointerCapture = () => false;
    strokeEngine.canvas.releasePointerCapture = () => {};
    window.CBO.enableBrushIncrementalBake = true;
    window.CBO.incrementalBrushBakeEnabled = true;
    window.CBO.experimentalBrushIncrementalBakeUnsafe = false;
    window.CBO.experimentalIncrementalBrushBakeUnsafe = false;

    const brushSettings = window.CBO.BrushDefaults?.createSettings
      ? window.CBO.BrushDefaults.createSettings({
          alphaThresholdEnabled: false,
          flow: 1,
          grainEnabled: false,
          opacity: 1,
          radius: 160,
          renderingMode: "intense-blending",
          shapeAlphaSrc: "",
          spacing: 0.16,
          spacingJitter: 0,
          stabilizationAmount: 0,
          taperEnd: 0,
          taperStart: 0,
          velocityPressureEnabled: false,
        })
      : {
          flow: 1,
          grainEnabled: false,
          opacity: 1,
          radius: 160,
          renderingMode: "intense-blending",
          shapeAlphaSrc: "",
          spacing: 0.16,
          taperEnd: 0,
          taperStart: 0,
        };

    window.CBO.brushSettings = brushSettings;
    strokeEngine.setBrushState?.(brushSettings);
    window.dispatchEvent(new CustomEvent("cbo:brush-settings-change", {
      detail: { settings: brushSettings },
    }));

    const makePointerEvent = (point, pointerId) => ({
      button: 0,
      clientX: point.x,
      clientY: point.y,
      pointerId,
      pointerType: "mouse",
      pressure: 1,
      preventDefault() {},
      stopImmediatePropagation() {},
      stopPropagation() {},
      tiltX: 0,
      tiltY: 0,
    });
    const drawStroke = (points, pointerId) => {
      strokeEngine.camera = { x: 0, y: 0, zoom: 1 };
      strokeEngine.dpr = 1;
      strokeEngine.handlePointerDown(makePointerEvent(points[0], pointerId));
      for (let index = 1; index < points.length - 1; index += 1) {
        strokeEngine.handlePointerMove(makePointerEvent(points[index], pointerId));
      }
      strokeEngine.handlePointerUp(makePointerEvent(points[points.length - 1], pointerId));
    };
    const makeStroke = (startX, startY, dx, dy, count = 18) => {
      const points = [];

      for (let index = 0; index < count; index += 1) {
        const t = index / (count - 1);

        points.push({
          x: startX + dx * t,
          y: startY + dy * t + Math.sin(t * Math.PI * 2) * 18,
        });
      }

      return points;
    };
    const strokeSets = [
      makeStroke(320, 420, 2920, 220),
      makeStroke(360, 920, 2820, 520),
      makeStroke(420, 1520, 2640, -340),
      makeStroke(820, 2220, 2200, 520),
      makeStroke(640, 3060, 2740, -560),
      makeStroke(1160, 700, 1760, 2520),
    ];

    await delay(100);
    results.push(take("stroke-fresh-4000-history-cleared"));

    const liveStroke = makeStroke(180, 220, 3600, 3440, 48);
    const livePointerId = 4900;

    try {
      strokeEngine.handlePointerDown(makePointerEvent(liveStroke[0], livePointerId));
      for (let index = 1; index < liveStroke.length - 1; index += 1) {
        strokeEngine.handlePointerMove(makePointerEvent(liveStroke[index], livePointerId));
      }
      await delay(80);
      results.push(take("stroke-live-long-before-pointerup"));
    } finally {
      if (strokeEngine.isDrawing && strokeEngine.activePointerId === livePointerId) {
        strokeEngine.handlePointerUp(makePointerEvent(liveStroke[liveStroke.length - 1], livePointerId));
      }
    }
    await delay(120);
    results.push(take("stroke-live-long-after-pointerup"));

    strokeSets.forEach((points, index) => {
      drawStroke(points, 5000 + index);
    });
    await delay(100);
    results.push(take("stroke-after-6-strokes-before-idle-commit"));

    await delay(500);
    results.push({
      ...take("stroke-after-idle-batch-cooldown"),
      lastRasterGpuHotPrune: strokeHistory.lastRasterGpuHotPrune,
    });

    const didUndo = strokeHistory.undo?.() === true;
    await delay(150);
    results.push({
      ...take("stroke-after-undo-lazy-after-captured"),
      didUndo,
      lastRasterGpuHotPrune: strokeHistory.lastRasterGpuHotPrune,
    });

    const didRedo = strokeHistory.redo?.() === true;
    await delay(150);
    results.push({
      ...take("stroke-after-redo-rehydrated"),
      didRedo,
      lastRasterGpuHotPrune: strokeHistory.lastRasterGpuHotPrune,
    });
  }

  return {
    activeLayerId: window.CBO.documentLayerModel?.activeLayerId || layerId,
    rendererSize: {
      height: window.CBO.documentRenderer?.height || renderer.height,
      width: window.CBO.documentRenderer?.width || renderer.width,
    },
    results,
  };
})()
`;

async function runBenchmark(options) {
  const server = await startStaticServer();
  const address = server.address();
  const appUrl = `http://127.0.0.1:${address.port}/index.html`;
  const browserPath = findBrowserPath();
  const { browser, profileDir } = startBrowser(browserPath, options.debugPort, appUrl);
  let cdp = null;

  try {
    const target = await waitForTarget(options.debugPort);

    cdp = await createCdpClient(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");

    const evaluated = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: BENCHMARK_EXPRESSION,
      returnByValue: true,
    });

    if (evaluated.exceptionDetails) {
      throw new Error(JSON.stringify(evaluated.exceptionDetails, null, 2));
    }

    return evaluated.result.value;
  } finally {
    cdp?.close?.();
    stopBrowser(browser, profileDir);
    await new Promise((resolve) => server.close(resolve));
  }
}

function printHumanSummary(result) {
  console.log(`Renderer: ${result.rendererSize.width}x${result.rendererSize.height}`);

  result.results.forEach((item) => {
    console.log(`${item.name}: ${item.totalMiB} MiB`);
    const inc = item.incrementalBrushBakeReport?.memoryReport?.incrementalBakeCount ||
      item.incrementalBrushBakeReport?.incrementalStrokeBakeCount ||
      item.incrementalBrushBakeReport?.incrementalBakeCount ||
      item.strokeMemoryEvents?.[0]?.incrementalBakeCount ||
      item.strokeMemoryEvents?.[0]?.incrementalStrokeBakeCount ||
      item.strokeMemoryEvents?.[0]?.incrementalBakeIndex ||
      0;
    console.log(`  scratch: total ${item.scratchMiB || "0.00"} MiB, brush ${item.brushStrokeScratchMiB || "0.00"}, active ${item.activeStrokeScratchMiB || "0.00"}, fx ${item.effectScratchMiB || "0.00"}, inc ${inc}`);
    if (item.topScratchRows?.length) {
      item.topScratchRows.forEach((row) => {
        console.log(`    scratch top: ${row.label || row.kind} ${row.MiB} MiB ${row.width}x${row.height} (${row.ownerType}/${row.kind})`);
      });
    }
    if (item.strokeMemoryEvents?.length) {
      item.strokeMemoryEvents.forEach((event) => {
        const rect = event.strokeBufferRect || {};
        console.log(`    stroke event: scratch ${event.scratchMiB} MiB, rect ${rect.width || 0}x${rect.height || 0}, replace ${event.strokeTargetReplaceCount || 0}, realloc ${event.strokeTargetReallocationCount || 0}`);
      });
    }
    if (item.blurError) {
      console.log(`  ! blur allocation error: ${item.blurError}`);
    }
    item.summary.forEach((summary) => {
      const textureCount = summary.textures ?? summary.count ?? 0;
      console.log(`  - ${summary.category}: ${summary.estimatedMiB} MiB (${textureCount} texture)`);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await runBenchmark(options);

  printHumanSummary(result);

  if (options.jsonPath) {
    const outputPath = path.resolve(process.cwd(), options.jsonPath);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`JSON written: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
