window.CBO = window.CBO || {};

(function registerSmudgeEngine(namespace) {
  const SMUDGE_RASTER_DEBUG = false;
  const CROPPED_SMUDGE_SCRATCH = true;
  const SMUDGE_EMPTY_LAYER_TOAST_MS = 800;
  const SMUDGE_EMPTY_LAYER_TOAST_THROTTLE_MS = 1600;
  const RASTER_MIB = 1024 * 1024;
  const STROKE_MEMORY_POLICY = Object.freeze({
    normalMaxBytes: 5 * RASTER_MIB,
    mediumMaxBytes: 32 * RASTER_MIB,
    largeMaxBytes: 128 * RASTER_MIB,
    largeCoverage: 0.25,
    hugeCoverage: 0.35,
  });

  function bytesToMega(bytes) {
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  function rectBytes(rect) {
    if (!rect) {
      return 0;
    }

    return Math.max(0, Math.round(rect.width * rect.height * 4));
  }

  const DAB_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;

uniform vec2 u_targetOrigin;
uniform vec2 u_targetSize;
uniform vec4 u_bounds;

out vec2 v_docPosition;

void main() {
  vec2 documentPosition = u_bounds.xy + a_corner * u_bounds.zw;
  vec2 targetPosition = (documentPosition - u_targetOrigin) / max(u_targetSize, vec2(1.0));
  vec2 clipPosition = targetPosition * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_docPosition = documentPosition;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PAINT_DAB_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_sourceTexture;
uniform vec2 u_sourceOrigin;
uniform vec2 u_sourceSize;
uniform vec2 u_center;
uniform vec2 u_direction;
uniform float u_radius;
uniform float u_opacity;
uniform float u_hardness;
uniform float u_pressure;
uniform float u_dragOffset;

in vec2 v_docPosition;

out vec4 outColor;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec4 sampleLayer(vec2 documentPosition) {
  vec2 sourceLocal = documentPosition - u_sourceOrigin;

  if (
    sourceLocal.x < 0.0 ||
    sourceLocal.y < 0.0 ||
    sourceLocal.x > u_sourceSize.x ||
    sourceLocal.y > u_sourceSize.y
  ) {
    return vec4(0.0);
  }

  vec2 uv = vec2(
    sourceLocal.x / max(u_sourceSize.x, 1.0),
    1.0 - sourceLocal.y / max(u_sourceSize.y, 1.0)
  );
  return texture(u_sourceTexture, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
  vec4 oldColor = sampleLayer(v_docPosition);
  vec2 localPosition = v_docPosition - u_center;
  float radius = max(u_radius, 0.5);
  float distanceFromCenter = length(localPosition);

  if (distanceFromCenter > radius) {
    outColor = oldColor;
    return;
  }

  float hardness = saturate(u_hardness);
  float mask = 1.0 - smoothstep(radius * hardness, radius, distanceFromCenter);
  float pressure = saturate(u_pressure);
  float strength = saturate(u_opacity * pressure);

  if (strength <= 0.0001 || u_dragOffset <= 0.0001) {
    outColor = oldColor;
    return;
  }

  // Pull color from "behind" the brush in the direction of motion.
  // Chained across stamps, this produces a true drag/smear of the canvas pixels.
  vec2 sourcePos = v_docPosition - u_direction * u_dragOffset;
  vec4 dragged = sampleLayer(sourcePos);

  // Light cross-blur perpendicular to motion for the "blur" component.
  vec2 perp = vec2(-u_direction.y, u_direction.x);
  float blurStep = max(0.5, radius * 0.07);
  vec4 blurred = dragged * 0.6;
  blurred += sampleLayer(sourcePos + perp * blurStep) * 0.2;
  blurred += sampleLayer(sourcePos - perp * blurStep) * 0.2;

  outColor = mix(oldColor, blurred, mask * strength);
}
`;

  const DEFAULT_SMUDGE_BRUSHES = Object.freeze({
    softRound: Object.freeze({
      radius: 28,
      opacity: 0.7,
      hardness: 0.2,
      spacing: 0.1,
      drag: 0.85,
      pressureAffectsStrength: true,
    }),
    wetPaint: Object.freeze({
      radius: 34,
      opacity: 0.85,
      hardness: 0.4,
      spacing: 0.1,
      drag: 1.0,
      pressureAffectsStrength: true,
    }),
    pencilSmudge: Object.freeze({
      radius: 16,
      opacity: 0.5,
      hardness: 0.05,
      spacing: 0.12,
      drag: 0.7,
      pressureAffectsStrength: true,
    }),
  });

  namespace.SmudgeBrushes = Object.freeze({
    ...DEFAULT_SMUDGE_BRUSHES,
    ...(namespace.SmudgeBrushes || {}),
  });
  namespace.smudgeSettings = {
    ...namespace.SmudgeBrushes.wetPaint,
    ...(namespace.smudgeSettings || {}),
  };

  class SmudgeEngine {
    constructor(canvas, options = {}) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("SmudgeEngine richiede un HTMLCanvasElement.");
      }

      if (!options.gl || typeof options.gl.createProgram !== "function") {
        throw new TypeError("SmudgeEngine richiede un contesto WebGL2 valido.");
      }

      if (!options.documentRenderer?.getPaintTarget) {
        throw new TypeError("SmudgeEngine richiede un DocumentRenderer inizializzato.");
      }

      this.canvas = canvas;
      this.gl = options.gl;
      this.documentRenderer = options.documentRenderer;
      this.getViewState = typeof options.getViewState === "function" ? options.getViewState : null;
      this.requestDraw = typeof options.requestDraw === "function" ? options.requestDraw : null;
      this.isDisposed = false;
      this.isSmudgeToolActive = this.getInitialSmudgeToolActive();
      this.isDragging = false;
      this.moved = false;
      this.activePointerId = null;
      this.lastStampX = 0;
      this.lastStampY = 0;
      this.lastPressure = 1;
      this.lastDirectionX = 1;
      this.lastDirectionY = 0;
      this.strokeTarget = null;
      this.scratchTarget = null;
      this.activeHistoryDabs = [];
      this.activeHistoryBeforeSnapshot = null;
      this.activeHistoryTileCapture = null;
      this.activeHistoryLayerId = null;
      this.activeSmudgeBounds = null;
      this.activeSmudgeMemoryReport = null;
      this.activeSmudgeRedoDisabled = false;
      this.historyDisabledForStroke = false;
      this.emptySmudgeLayerToastTimer = 0;
      this.lastEmptySmudgeLayerToastAt = 0;
      this.dabProgramInfo = this.createDabProgramInfo();
      this.quad = this.createQuad();

      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleSettingsChange = this.handleSettingsChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleTouchNavigationStart = this.handleTouchNavigationStart.bind(this);

      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("cbo:paint-settings-change", this.handleSettingsChange);
      window.addEventListener("cbo:touch-navigation-start", this.handleTouchNavigationStart);
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    }

    getRasterResourceManager() {
      return window.CBO?.rasterResourceManager || null;
    }

    getRasterResourceDocumentMetadata(metadata = {}) {
      const renderer = window.CBO?.documentRenderer || this.documentRenderer;

      return {
        ...metadata,
        documentHeight: metadata.documentHeight ?? renderer?.height,
        documentWidth: metadata.documentWidth ?? renderer?.width,
      };
    }

    nextSmudgeResourceOwnerId(prefix = "smudge-resource") {
      this.rasterResourceIdSequence = this.rasterResourceIdSequence || 1;

      return `${prefix}-${this.rasterResourceIdSequence++}`;
    }

    registerSmudgeTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.getRasterResourceDocumentMetadata(metadata));
    }

    registerSmudgeFramebuffer(framebuffer, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerFramebuffer || !framebuffer) {
        return null;
      }

      return manager.registerFramebuffer(framebuffer, this.getRasterResourceDocumentMetadata(metadata));
    }

    deleteSmudgeTexture(textureOrId) {
      return this.getRasterResourceManager()?.deleteTexture?.(textureOrId) || false;
    }

    deleteSmudgeFramebuffer(framebufferOrId) {
      return this.getRasterResourceManager()?.deleteFramebuffer?.(framebufferOrId) || false;
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader smudge WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione shader smudge.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    linkProgram(vertexSource, fragmentSource, label) {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error(`Impossibile creare il programma ${label}.`);
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || `Errore sconosciuto nel link del programma ${label}.`;

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return program;
    }

    createDabProgramInfo() {
      const gl = this.gl;
      const program = this.linkProgram(DAB_VERTEX_SHADER_SOURCE, PAINT_DAB_FRAGMENT_SHADER_SOURCE, "smudge dab");

      return {
        program,
        uniforms: {
          bounds: gl.getUniformLocation(program, "u_bounds"),
          center: gl.getUniformLocation(program, "u_center"),
          direction: gl.getUniformLocation(program, "u_direction"),
          dragOffset: gl.getUniformLocation(program, "u_dragOffset"),
          hardness: gl.getUniformLocation(program, "u_hardness"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          pressure: gl.getUniformLocation(program, "u_pressure"),
          radius: gl.getUniformLocation(program, "u_radius"),
          sourceOrigin: gl.getUniformLocation(program, "u_sourceOrigin"),
          sourceSize: gl.getUniformLocation(program, "u_sourceSize"),
          sourceTexture: gl.getUniformLocation(program, "u_sourceTexture"),
          targetOrigin: gl.getUniformLocation(program, "u_targetOrigin"),
          targetSize: gl.getUniformLocation(program, "u_targetSize"),
        },
      };
    }

    createQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      const vertices = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse GPU dello smudge.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, buffer };
    }

    createTarget(width, height, label, filter = this.gl.LINEAR, resourceMetadata = {}) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        throw new Error(`Impossibile creare il target ${label}.`);
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error(`Target ${label} incompleto.`);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const ownerId = resourceMetadata.ownerId || this.nextSmudgeResourceOwnerId("smudge-target");
      const target = {
        framebuffer,
        height,
        id: ownerId,
        texture,
        width,
      };
      const textureRow = this.registerSmudgeTexture(texture, {
        height,
        kind: resourceMetadata.kind || "smudgeScratch",
        label,
        ownerId,
        ownerType: "scratch",
        purgeable: resourceMetadata.purgeable === true,
        reason: resourceMetadata.reason || "smudge-engine",
        width,
        ...resourceMetadata,
      });

      this.registerSmudgeFramebuffer(framebuffer, {
        height,
        kind: `${resourceMetadata.kind || "smudgeScratch"}Framebuffer`,
        label: `${label} framebuffer`,
        linkedTextureId: textureRow?.id || "",
        ownerId,
        ownerType: "scratch",
        purgeable: resourceMetadata.purgeable === true,
        reason: resourceMetadata.reason || "smudge-engine",
        width,
        ...resourceMetadata,
      });

      return target;
    }

    getFullDocumentRect(target) {
      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(target?.width || 1)),
        height: Math.max(1, Math.round(target?.height || 1)),
      };
    }

    getDocumentRect(target = null) {
      return namespace.getActiveDocumentArtboardRect?.({
        layerId: target?.layerId || this.activeHistoryLayerId || this.documentRenderer?.layerModel?.activeLayerId || "",
      }) || {
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(this.documentRenderer?.width || target?.width || 1)),
        height: Math.max(1, Math.round(this.documentRenderer?.height || target?.height || 1)),
      };
    }

    getRasterTargetDocumentRect(target) {
      return this.documentRenderer?.getRasterTargetDocumentRect?.(target) ||
        this.getFullDocumentRect(target);
    }

    getRasterTargetLocalRect(target, docRect = null) {
      if (typeof this.documentRenderer?.getRasterTargetLocalRect === "function") {
        return this.documentRenderer.getRasterTargetLocalRect(target, docRect);
      }

      const targetRect = this.getRasterTargetDocumentRect(target);
      const requested = docRect || targetRect;

      if (!targetRect || !requested) {
        return null;
      }

      const x0 = Math.max(targetRect.x, requested.x);
      const y0 = Math.max(targetRect.y, requested.y);
      const x1 = Math.min(targetRect.x + targetRect.width, requested.x + requested.width);
      const y1 = Math.min(targetRect.y + targetRect.height, requested.y + requested.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        docRect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        localRect: { x: x0 - targetRect.x, y: y0 - targetRect.y, width: x1 - x0, height: y1 - y0 },
        targetRect,
      };
    }

    intersectDocumentRects(first, second) {
      if (!first || !second) {
        return null;
      }

      const x0 = Math.max(first.x, second.x);
      const y0 = Math.max(first.y, second.y);
      const x1 = Math.min(first.x + first.width, second.x + second.width);
      const y1 = Math.min(first.y + first.height, second.y + second.height);

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }

    getActiveAreaSelectionRect() {
      return namespace.areaSelection?.hasSelection?.()
        ? namespace.areaSelection.getRect?.()
        : null;
    }

    getActiveAreaSelectionCoverageRects(bounds) {
      if (!bounds) {
        return null;
      }

      const artboardRect = namespace.getActiveDocumentArtboardRect?.({
        layerId: this.activeHistoryLayerId || this.strokeTarget?.layerId || this.documentRenderer?.layerModel?.activeLayerId || "",
      }) || null;
      const clippedBounds = artboardRect
        ? this.intersectDocumentRects(bounds, artboardRect)
        : bounds;

      if (!clippedBounds) {
        return artboardRect ? [] : null;
      }

      if (!namespace.areaSelection?.hasSelection?.()) {
        return artboardRect ? [clippedBounds] : null;
      }

      const rects = namespace.areaSelection.getIntersectingRects?.(clippedBounds) || [];

      if (!artboardRect) {
        return rects.length > 0 ? rects : [];
      }

      const clippedRects = rects
        .map((rect) => this.intersectDocumentRects(rect, artboardRect))
        .filter(Boolean);

      return clippedRects.length > 0 ? clippedRects : [];
    }

    getBoundsForDocumentRects(rects) {
      if (!Array.isArray(rects) || rects.length === 0) {
        return null;
      }

      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;

      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        x0 = Math.min(x0, rect.x);
        y0 = Math.min(y0, rect.y);
        x1 = Math.max(x1, rect.x + rect.width);
        y1 = Math.max(y1, rect.y + rect.height);
      }

      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }

    clipBoundsToAreaSelection(bounds) {
      const selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(bounds);

      return Array.isArray(selectionCoverageRects)
        ? this.getBoundsForDocumentRects(selectionCoverageRects)
        : bounds;
    }

    createScratchTarget(target, bounds = null) {
      const rect = CROPPED_SMUDGE_SCRATCH && bounds
        ? { ...bounds }
        : this.getFullDocumentRect(target);
      const scratch = this.createTarget(
        rect.width,
        rect.height,
        "temporaneo smudge",
        this.gl.NEAREST,
        {
          bbox: rect,
          height: rect.height,
          kind: "smudgeScratch",
          label: "temporaneo smudge",
          originX: rect.x,
          originY: rect.y,
          ownerId: this.nextSmudgeResourceOwnerId("smudge-scratch"),
          ownerType: "scratch",
          purgeable: false,
          reason: "create-smudge-scratch-target",
          width: rect.width,
        },
      );

      scratch.rect = rect;

      return scratch;
    }

    hasHistorySupport() {
      return typeof namespace.documentHistory?.push === "function";
    }

    ensureScratchTarget(target, bounds = null) {
      const rect = CROPPED_SMUDGE_SCRATCH && bounds
        ? { ...bounds }
        : this.getFullDocumentRect(target);

      if (
        this.scratchTarget &&
        this.scratchTarget.width === rect.width &&
        this.scratchTarget.height === rect.height
      ) {
        this.scratchTarget.rect = rect;
        return this.scratchTarget;
      }

      this.deleteTarget(this.scratchTarget);
      this.scratchTarget = this.createScratchTarget(target, rect);

      return this.scratchTarget;
    }

    releaseScratchTarget() {
      this.deleteTarget(this.scratchTarget);
      this.scratchTarget = null;
    }

    deleteTarget(target) {
      if (!target) {
        return;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        this.deleteSmudgeFramebuffer(target.framebuffer);
        gl.deleteFramebuffer(target.framebuffer);
        target.framebuffer = null;
      }

      if (target.texture) {
        this.deleteSmudgeTexture(target.texture);
        gl.deleteTexture(target.texture);
        target.texture = null;
      }
    }

    createHistorySnapshot(target, bounds, label = "smudge history") {
      if (!this.hasHistorySupport() || !target?.framebuffer || !bounds) {
        return null;
      }

      const mappedRect = this.getRasterTargetLocalRect(target, bounds);
      const sourceRect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const width = Math.max(0, Math.floor(sourceRect?.width || 0));
      const height = Math.max(0, Math.floor(sourceRect?.height || 0));

      if (width <= 0 || height <= 0) {
        return null;
      }

      const rect = {
        x: Math.max(0, Math.floor(docRect.x)),
        y: Math.max(0, Math.floor(docRect.y)),
        width,
        height,
      };
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rect.width, rect.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn(`Snapshot ${label} incompleto.`);
        return null;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.copyTexSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        sourceRect.x,
        target.height - (sourceRect.y + sourceRect.height),
        rect.width,
        rect.height
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const snapshotId = this.nextSmudgeResourceOwnerId("smudge-history-snapshot");
      const snapshot = {
        bytes: rect.width * rect.height * 4,
        docRect,
        framebuffer,
        id: snapshotId,
        label,
        layerId: this.activeHistoryLayerId || target?.layerId || "",
        rect,
        state: "GPU_HOT",
        texture,
      };
      snapshot.dehydrateGpu = () => this.dehydrateHistorySnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateHistorySnapshot(snapshot);
      const textureRow = this.registerSmudgeTexture(texture, {
        bbox: docRect,
        height: rect.height,
        kind: "historySnapshot",
        label,
        layerId: snapshot.layerId,
        originX: docRect.x,
        originY: docRect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width: rect.width,
      });

      this.registerSmudgeFramebuffer(framebuffer, {
        height: rect.height,
        kind: "historySnapshotFramebuffer",
        label: `${label} framebuffer`,
        layerId: this.activeHistoryLayerId || target?.layerId || "",
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        width: rect.width,
      });

      return snapshot;
    }

    dehydrateHistorySnapshot(snapshot) {
      if (!snapshot?.framebuffer || snapshot.state === "CPU_COLD") {
        return snapshot?.state === "CPU_COLD";
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      if (width <= 0 || height <= 0) {
        return false;
      }

      const gl = this.gl;
      const pixels = new Uint8Array(width * height * 4);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        console.warn?.("[CBO smudge] Impossibile raffreddare snapshot smudge.", error);
        return false;
      }

      this.deleteSmudgeFramebuffer(snapshot.framebuffer);
      gl.deleteFramebuffer(snapshot.framebuffer);
      snapshot.framebuffer = null;

      if (snapshot.texture) {
        this.deleteSmudgeTexture(snapshot.texture);
        gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      const rawByteLength = pixels.byteLength;

      snapshot.bytes = snapshot.bytes || rawByteLength;
      snapshot.cpuBytes = rawByteLength;
      snapshot.cpuPixels = pixels;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = rawByteLength;
      snapshot.historyCompressionState = "raw-pending";
      snapshot.state = "CPU_COLD";
      window.CBO?.queueHistoryCompression?.(snapshot, {
        historyId: snapshot.id || "",
        kind: "smudgeHistorySnapshot",
        layerId: snapshot.layerId || "",
        source: snapshot.label || "smudge-history-snapshot",
      });

      return true;
    }

    hydrateHistorySnapshot(snapshot) {
      if (!snapshot || snapshot.texture || snapshot.framebuffer) {
        return Boolean(snapshot?.texture && snapshot?.framebuffer);
      }

      if (!(snapshot.cpuPixels instanceof Uint8Array)) {
        return false;
      }

      const rect = snapshot.rect || snapshot.docRect;
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));

      if (width <= 0 || height <= 0) {
        return false;
      }

      const compression = window.CBO?.HistoryCompression;
      let uploadPixels = snapshot.cpuPixels;

      if (snapshot.cpuPixelsEncoding) {
        if (!compression?.isCompressedEncoding?.(snapshot.cpuPixelsEncoding)) {
          return false;
        }

        try {
          uploadPixels = compression.decompressRgba(
            snapshot.cpuPixels,
            Number(snapshot.cpuRawBytes) || width * height * 4,
            snapshot.cpuPixelsEncoding,
          );
        } catch (error) {
          console.warn?.("[CBO smudge] Decompressione RLE snapshot fallita.", error);
          return false;
        }
      }

      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();

      if (!texture || !framebuffer) {
        if (texture) {
          gl.deleteTexture(texture);
        }

        if (framebuffer) {
          gl.deleteFramebuffer(framebuffer);
        }

        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadPixels);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      snapshot.framebuffer = framebuffer;
      snapshot.texture = texture;
      snapshot.state = "GPU_HOT";

      const label = snapshot.label || "smudge history";
      const layerId = snapshot.layerId || this.activeHistoryLayerId || "";
      const textureRow = this.registerSmudgeTexture(texture, {
        bbox: snapshot.docRect || snapshot.rect,
        height,
        kind: "historySnapshot",
        label,
        layerId,
        originX: snapshot.docRect?.x ?? snapshot.rect?.x,
        originY: snapshot.docRect?.y ?? snapshot.rect?.y,
        ownerId: snapshot.id || this.nextSmudgeResourceOwnerId("smudge-history-snapshot"),
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width,
      });

      this.registerSmudgeFramebuffer(framebuffer, {
        height,
        kind: "historySnapshotFramebuffer",
        label: `${label} framebuffer`,
        layerId,
        linkedTextureId: textureRow?.id || "",
        ownerId: snapshot.id || "",
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        width,
      });

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;

      return true;
    }

    deleteHistorySnapshot(snapshot) {
      if (!snapshot) {
        return;
      }

      if (snapshot?.framebuffer) {
        this.deleteSmudgeFramebuffer(snapshot.framebuffer);
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
      }

      if (snapshot?.texture) {
        this.deleteSmudgeTexture(snapshot.texture);
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }

      snapshot.cpuBytes = 0;
      snapshot.cpuPixels = null;
      snapshot.cpuPixelsEncoding = null;
      snapshot.cpuRawBytes = 0;
      snapshot.state = "DELETED";
    }

    getSnapshotBytes(snapshot) {
      return rectBytes(snapshot?.rect);
    }

    getHistoryDabsBytes(dabs) {
      if (!Array.isArray(dabs)) {
        return 0;
      }

      return dabs.reduce((total, dab) => (
        total + this.getSnapshotBytes(dab?.before) + this.getSnapshotBytes(dab?.after)
      ), 0);
    }

    getRectCoverage(rect, target = this.strokeTarget) {
      const canvasPixels = Math.max(1, Math.round(target?.width || 1)) *
        Math.max(1, Math.round(target?.height || 1));
      const rectPixels = Math.max(0, Math.round(rect?.width || 0)) *
        Math.max(0, Math.round(rect?.height || 0));

      return rectPixels / canvasPixels;
    }

    classifyStrokeMemory(estimatedPeakBytes, coverage) {
      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.largeMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (
        estimatedPeakBytes > STROKE_MEMORY_POLICY.mediumMaxBytes ||
        coverage >= STROKE_MEMORY_POLICY.largeCoverage
      ) {
        return "large";
      }

      if (estimatedPeakBytes > STROKE_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }

    createStrokeMemoryReport({
      historyRect = null,
      layerId = this.activeHistoryLayerId || "",
      phase = "smudge-stroke",
      scratchRect = null,
      target = this.strokeTarget,
    } = {}) {
      const beforeBytes = rectBytes(historyRect);
      const potentialAfterBytes = beforeBytes;
      const scratchBytes = rectBytes(scratchRect);
      const persistentBytes = beforeBytes + potentialAfterBytes;
      const estimatedPeakBytes = persistentBytes + scratchBytes;
      const coverage = this.getRectCoverage(historyRect, target);
      const policy = this.classifyStrokeMemory(estimatedPeakBytes, coverage);
      const hasTileHistory = typeof this.documentRenderer?.beginRasterTileHistory === "function";
      const historyMode = hasTileHistory
        ? "tile-before-after"
        : (
            policy === "huge"
              ? "gpu-before-no-redo"
              : "gpu-before-lazy-after"
          );

      return {
        beforeBytes,
        canvasSize: {
          height: Math.max(1, Math.round(target?.height || 1)),
          width: Math.max(1, Math.round(target?.width || 1)),
        },
        coverage,
        estimatedPeakBytes,
        historyMode,
        layerId,
        persistentBytes,
        phase,
        policy,
        potentialAfterBytes,
        reason: historyMode === "gpu-before-no-redo"
          ? "redo snapshot disabled for very large smudge stroke"
          : "smudge stroke memory estimate",
        scratchBytes,
        source: "smudge-engine",
        strokeBufferRect: scratchRect ? { ...scratchRect } : null,
        strokeRect: historyRect ? { ...historyRect } : null,
        tool: "smudge",
      };
    }

    recordStrokeMemory(report) {
      if (!report) {
        return null;
      }

      this.activeSmudgeMemoryReport = report;
      this.activeSmudgeRedoDisabled = this.activeSmudgeRedoDisabled ||
        report.historyMode === "gpu-before-no-redo";
      namespace.lastSmudgeStrokeMemoryReport = report;
      const recorded = namespace.rasterResourceManager?.recordStrokeMemory?.(report) || report;

      if (namespace.debugRasterMemoryLogs !== true && namespace.debugStrokeMemoryLogs !== true) {
        return recorded;
      }

      if (report.policy === "large" || report.policy === "huge") {
        console.warn?.("[CBO smudge] Stroke memory policy", recorded);
      } else if (report.policy === "medium") {
        console.info?.("[CBO smudge] Stroke memory estimate", recorded);
      }

      return recorded;
    }

    pruneRasterHistoryForStroke(report) {
      const history = namespace.documentHistory;

      if (!history?.pruneRasterHistoryBudget || !report || report.policy === "normal") {
        return null;
      }

      return history.pruneRasterHistoryBudget({ deferGpuHotPrune: true });
    }

    containsRect(container, rect) {
      return Boolean(
        container &&
        rect &&
        rect.x >= container.x &&
        rect.y >= container.y &&
        rect.x + rect.width <= container.x + container.width &&
        rect.y + rect.height <= container.y + container.height
      );
    }

    unionRects(first, second) {
      if (!first) {
        return second ? { ...second } : null;
      }

      if (!second) {
        return { ...first };
      }

      const x = Math.min(first.x, second.x);
      const y = Math.min(first.y, second.y);
      const x2 = Math.max(first.x + first.width, second.x + second.width);
      const y2 = Math.max(first.y + first.height, second.y + second.height);

      return {
        x,
        y,
        width: x2 - x,
        height: y2 - y,
      };
    }

    getRectDifference(outer, inner) {
      if (!outer) {
        return [];
      }

      if (!inner || !this.containsRect(outer, inner)) {
        return [{ ...outer }];
      }

      const rects = [];
      const outerRight = outer.x + outer.width;
      const outerBottom = outer.y + outer.height;
      const innerRight = inner.x + inner.width;
      const innerBottom = inner.y + inner.height;

      if (inner.y > outer.y) {
        rects.push({
          x: outer.x,
          y: outer.y,
          width: outer.width,
          height: inner.y - outer.y,
        });
      }

      if (innerBottom < outerBottom) {
        rects.push({
          x: outer.x,
          y: innerBottom,
          width: outer.width,
          height: outerBottom - innerBottom,
        });
      }

      const overlapY = Math.max(outer.y, inner.y);
      const overlapBottom = Math.min(outerBottom, innerBottom);
      const overlapHeight = overlapBottom - overlapY;

      if (overlapHeight > 0 && inner.x > outer.x) {
        rects.push({
          x: outer.x,
          y: overlapY,
          width: inner.x - outer.x,
          height: overlapHeight,
        });
      }

      if (overlapHeight > 0 && innerRight < outerRight) {
        rects.push({
          x: innerRight,
          y: overlapY,
          width: outerRight - innerRight,
          height: overlapHeight,
        });
      }

      return rects.filter((rect) => rect.width > 0 && rect.height > 0);
    }

    createEmptyHistorySnapshot(rect, label = "smudge history union") {
      if (!this.hasHistorySupport() || !rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const snapshotId = this.nextSmudgeResourceOwnerId("smudge-history-snapshot");
      const snapshot = this.createTarget(rect.width, rect.height, label, this.gl.NEAREST, {
        bbox: rect,
        height: rect.height,
        kind: "historySnapshot",
        label,
        layerId: this.activeHistoryLayerId || "",
        originX: rect.x,
        originY: rect.y,
        ownerId: snapshotId,
        ownerType: "historyGpu",
        purgeable: false,
        reason: label,
        state: "GPU_HOT",
        width: rect.width,
      });

      snapshot.bytes = rect.width * rect.height * 4;
      snapshot.docRect = { ...rect };
      snapshot.label = label;
      snapshot.layerId = this.activeHistoryLayerId || "";
      snapshot.rect = { ...rect };
      snapshot.state = "GPU_HOT";
      snapshot.dehydrateGpu = () => this.dehydrateHistorySnapshot(snapshot);
      snapshot.hydrateGpu = () => this.hydrateHistorySnapshot(snapshot);

      return snapshot;
    }

    copyTargetRectToSnapshot(target, rect, snapshot) {
      if (!target?.framebuffer || !snapshot?.framebuffer || !snapshot.rect || !rect) {
        return;
      }

      const gl = this.gl;
      const destRect = snapshot.rect;
      const mappedRect = this.getRasterTargetLocalRect(target, rect);
      const sourceRect = mappedRect?.localRect;

      if (!sourceRect) {
        return;
      }

      const sourceX0 = sourceRect.x;
      const sourceX1 = sourceRect.x + sourceRect.width;
      const sourceY0 = target.height - (sourceRect.y + sourceRect.height);
      const sourceY1 = target.height - sourceRect.y;
      const destX0 = rect.x - destRect.x;
      const destX1 = destX0 + rect.width;
      const destY0 = destRect.height - ((rect.y - destRect.y) + rect.height);
      const destY1 = destY0 + rect.height;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, snapshot.framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        destX0,
        destY0,
        destX1,
        destY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    copySnapshotToSnapshot(sourceSnapshot, destSnapshot) {
      if (!sourceSnapshot?.framebuffer || !sourceSnapshot.rect || !destSnapshot?.framebuffer || !destSnapshot.rect) {
        return;
      }

      const gl = this.gl;
      const sourceRect = sourceSnapshot.rect;
      const destRect = destSnapshot.rect;
      const destX0 = sourceRect.x - destRect.x;
      const destX1 = destX0 + sourceRect.width;
      const destY0 = destRect.height - ((sourceRect.y - destRect.y) + sourceRect.height);
      const destY1 = destY0 + sourceRect.height;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceSnapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destSnapshot.framebuffer);
      gl.blitFramebuffer(
        0,
        0,
        sourceRect.width,
        sourceRect.height,
        destX0,
        destY0,
        destX1,
        destY1,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    captureActiveHistoryBefore(target, bounds) {
      const isSparseTarget = this.documentRenderer?.isSparseRasterTarget?.(target) === true;

      if (
        this.historyDisabledForStroke ||
        !this.hasHistorySupport() ||
        !target ||
        (!isSparseTarget && !target.framebuffer) ||
        !bounds
      ) {
        return true;
      }

      try {
        const existingHistoryRect = this.activeHistoryTileCapture?.rect || this.activeHistoryBeforeSnapshot?.rect;
        const nextHistoryRect = existingHistoryRect
          ? this.unionRects(existingHistoryRect, bounds)
          : bounds;
        const scratchRect = this.scratchTarget?.rect || bounds;
        const memoryReport = this.createStrokeMemoryReport({
          historyRect: nextHistoryRect,
          layerId: this.activeHistoryLayerId || target?.layerId || "",
          phase: "smudge-capture-before",
          scratchRect,
          target,
        });

        this.recordStrokeMemory(memoryReport);

        if (this.documentRenderer?.beginRasterTileHistory && this.documentRenderer?.extendRasterTileHistory) {
          const layerId = this.activeHistoryLayerId || target?.layerId || "";

          if (!this.activeHistoryTileCapture) {
            this.activeHistoryTileCapture = this.documentRenderer.beginRasterTileHistory(layerId, bounds, {
              label: "smudge",
              source: "smudge",
            });

            return Boolean(this.activeHistoryTileCapture);
          }

          const didExtend = this.documentRenderer.extendRasterTileHistory(this.activeHistoryTileCapture, bounds, {
            label: "smudge",
            layerId,
            source: "smudge",
          });

          if (!didExtend) {
            this.documentRenderer.deleteRasterTileHistoryCapture(this.activeHistoryTileCapture);
            this.activeHistoryTileCapture = null;
          }

          return didExtend;
        }

        if (!this.activeHistoryBeforeSnapshot) {
          this.activeHistoryBeforeSnapshot = this.createHistorySnapshot(target, bounds, "smudge prima");
          return Boolean(this.activeHistoryBeforeSnapshot);
        }

        if (this.containsRect(this.activeHistoryBeforeSnapshot.rect, bounds)) {
          return true;
        }

        const previousSnapshot = this.activeHistoryBeforeSnapshot;
        const nextRect = nextHistoryRect;
        const nextSnapshot = this.createEmptyHistorySnapshot(nextRect, "smudge prima union");

        if (!nextSnapshot) {
          this.clearActiveHistoryDabs();
          this.historyDisabledForStroke = true;
          return false;
        }

        this.copySnapshotToSnapshot(previousSnapshot, nextSnapshot);

        for (const rect of this.getRectDifference(nextRect, previousSnapshot.rect)) {
          this.copyTargetRectToSnapshot(target, rect, nextSnapshot);
        }

        this.deleteHistorySnapshot(previousSnapshot);
        this.activeHistoryBeforeSnapshot = nextSnapshot;

        return true;
      } catch (error) {
        console.warn?.("[CBO smudge] History snapshot disattivato per questo tratto.", error);
        this.clearActiveHistoryDabs();
        this.historyDisabledForStroke = true;
        return false;
      }
    }

    deleteHistoryDab(dab) {
      this.deleteHistorySnapshot(dab?.before);
      this.deleteHistorySnapshot(dab?.after);
    }

    deleteHistoryDabs(dabs) {
      if (!Array.isArray(dabs)) {
        return;
      }

      for (const dab of dabs) {
        this.deleteHistoryDab(dab);
      }
    }

    clearActiveHistoryDabs() {
      this.deleteHistoryDabs(this.activeHistoryDabs);
      this.activeHistoryDabs = [];
      this.documentRenderer?.deleteRasterTileHistoryCapture?.(this.activeHistoryTileCapture);
      this.activeHistoryTileCapture = null;
      this.deleteHistorySnapshot(this.activeHistoryBeforeSnapshot);
      this.activeHistoryBeforeSnapshot = null;
      this.activeHistoryLayerId = null;
      this.activeSmudgeMemoryReport = null;
      this.activeSmudgeRedoDisabled = false;
      this.historyDisabledForStroke = false;
    }

    recordHistoryDab(before, after) {
      if (!before || !after) {
        this.deleteHistorySnapshot(before);
        this.deleteHistorySnapshot(after);
        this.clearActiveHistoryDabs();
        this.historyDisabledForStroke = true;
        return;
      }

      this.activeHistoryDabs.push({ after, before });
    }

    canRestoreHistorySnapshot(target, snapshot) {
      const mappedRect = this.getRasterTargetLocalRect(target, snapshot?.docRect || snapshot?.rect);
      const rect = mappedRect?.localRect;
      const docRect = mappedRect?.docRect;
      const snapshotRect = snapshot?.docRect || snapshot?.rect;

      return Boolean(
        target?.framebuffer &&
        snapshot?.framebuffer &&
        snapshot?.texture &&
        rect &&
        docRect &&
        snapshotRect &&
        docRect.x === snapshotRect.x &&
        docRect.y === snapshotRect.y &&
        docRect.width === snapshotRect.width &&
        docRect.height === snapshotRect.height &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= target.width &&
        rect.y + rect.height <= target.height
      );
    }

    restoreHistorySnapshot(target, snapshot) {
      if (snapshot && (!snapshot.framebuffer || !snapshot.texture) && !this.hydrateHistorySnapshot(snapshot)) {
        return false;
      }

      if (!this.canRestoreHistorySnapshot(target, snapshot)) {
        return false;
      }

      const gl = this.gl;
      const mappedRect = this.getRasterTargetLocalRect(target, snapshot.docRect || snapshot.rect);
      const rect = mappedRect?.localRect;

      if (!rect) {
        return false;
      }

      const x0 = rect.x;
      const x1 = rect.x + rect.width;
      const y0 = target.height - (rect.y + rect.height);
      const y1 = target.height - rect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(0, 0, rect.width, rect.height, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

      return true;
    }

    emitContentChange(layerId, source, rect = null) {
      const detail = rect ? { layerId, rect, source } : { layerId, source };

      if (typeof this.documentRenderer?.commitVisualDirtyChange === "function") {
        this.documentRenderer.commitVisualDirtyChange({
          ...detail,
          usePreviewDirtyTiles: Boolean(rect),
        });
        return;
      }

      if (typeof this.documentRenderer?.emitContentChange === "function") {
        this.documentRenderer.emitContentChange(detail);
        return;
      }

      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail,
      }));
    }

    restoreHistoryDabs(layerId, dabs, snapshotKey, reverse, source) {
      if (!this.documentRenderer || !Array.isArray(dabs) || dabs.length === 0) {
        return false;
      }

      const getRasterTarget = this.documentRenderer.getRasterTarget;
      const target = typeof getRasterTarget === "function"
        ? getRasterTarget.call(this.documentRenderer, layerId)
        : null;

      if (!target) {
        return false;
      }

      const orderedDabs = reverse ? [...dabs].reverse() : dabs;

      for (const dab of orderedDabs) {
        const snapshot = dab?.[snapshotKey];

        if ((!snapshot?.framebuffer || !snapshot?.texture) && !this.hydrateHistorySnapshot(snapshot)) {
          return false;
        }

        if (!this.canRestoreHistorySnapshot(target, snapshot)) {
          return false;
        }
      }

      for (const dab of orderedDabs) {
        this.restoreHistorySnapshot(target, dab[snapshotKey]);
      }

      const rect = orderedDabs.reduce((result, dab) => {
        const snapshotRect = dab?.[snapshotKey]?.rect;

        return this.documentRenderer?.unionRasterHistoryRects?.(result, snapshotRect) || result || snapshotRect || null;
      }, null);

      this.emitContentChange(layerId, source, rect);
      this.requestDraw?.();

      return true;
    }

    commitHistory() {
      const dabs = this.activeHistoryDabs;
      const before = this.activeHistoryBeforeSnapshot;
      const tileHistory = this.activeHistoryTileCapture;
      const layerId = this.activeHistoryLayerId || this.strokeTarget?.layerId || null;
      const target = this.strokeTarget;
      const memoryReport = this.activeSmudgeMemoryReport;
      const redoDisabled = this.activeSmudgeRedoDisabled ||
        memoryReport?.historyMode === "gpu-before-no-redo";

      this.activeHistoryDabs = [];
      this.activeHistoryBeforeSnapshot = null;
      this.activeHistoryTileCapture = null;
      this.activeHistoryLayerId = null;
      this.activeSmudgeMemoryReport = null;
      this.activeSmudgeRedoDisabled = false;
      this.historyDisabledForStroke = false;

      if (tileHistory) {
        if (!layerId || !this.hasHistorySupport()) {
          this.documentRenderer?.deleteRasterTileHistoryCapture?.(tileHistory);
          this.deleteHistoryDabs(dabs);
          return;
        }

        this.deleteHistoryDabs(dabs);
        const entry = this.documentRenderer?.commitRasterTileHistory?.(tileHistory, {
          label: "smudge",
          memoryPolicy: memoryReport,
          redoSource: "history-redo-smudge",
          source: "smudge",
          type: "pixel",
          undoSource: "history-undo-smudge",
        });

        if (entry && namespace.documentHistory?.push) {
          namespace.documentHistory.push(entry);
          this.pruneRasterHistoryForStroke(memoryReport);
        } else {
          this.documentRenderer?.deleteRasterTileHistoryCapture?.(tileHistory);
        }

        return;
      }

      if (before) {
        if (!layerId || !target || !this.hasHistorySupport()) {
          this.deleteHistorySnapshot(before);
          this.deleteHistoryDabs(dabs);
          return;
        }

        this.deleteHistoryDabs(dabs);
        let after = null;
        let entry = null;
        const captureRedoSnapshot = () => {
          if (redoDisabled) {
            return false;
          }

          if (after?.texture) {
            return true;
          }

          const redoTarget = this.documentRenderer?.getRasterTarget?.(layerId);

          after = this.createHistorySnapshot(redoTarget, before.rect, "smudge dopo");
          if (after?.texture && entry) {
            entry.after = after;
          }

          return Boolean(after?.texture);
        };

        entry = {
          type: "pixel",
          after: null,
          before,
          memoryPolicy: memoryReport,
          layerId,
          rect: before.rect,
          source: "smudge",
          undo: () => {
            if (redoDisabled) {
              const restoreTarget = this.documentRenderer?.getRasterTarget?.(layerId);
              const didRestore = this.restoreHistorySnapshot(restoreTarget, before);

              if (didRestore) {
                this.emitContentChange(layerId, "smudge-undo", before.rect);
                this.requestDraw?.();
              }

              return didRestore;
            }

            if (!captureRedoSnapshot()) {
              return false;
            }

            const restoreTarget = this.documentRenderer?.getRasterTarget?.(layerId);
            const didRestore = this.restoreHistorySnapshot(restoreTarget, before);

            if (didRestore) {
              this.emitContentChange(layerId, "smudge-undo", before.rect);
              this.requestDraw?.();
            }

            return didRestore;
          },
          redo: () => {
            if (!after?.texture) {
              return false;
            }

            const restoreTarget = this.documentRenderer?.getRasterTarget?.(layerId);
            const didRestore = this.restoreHistorySnapshot(restoreTarget, after);

            if (didRestore) {
              this.emitContentChange(layerId, "smudge-redo", after.rect);
              this.requestDraw?.();
            }

            return didRestore;
          },
          destroy: () => {
            this.deleteHistorySnapshot(before);
            this.deleteHistorySnapshot(after);
          },
        };

        namespace.documentHistory.push(entry);
        this.pruneRasterHistoryForStroke(memoryReport);
        return;
      }

      if (!dabs.length) {
        return;
      }

      if (!layerId || !this.hasHistorySupport()) {
        this.deleteHistoryDabs(dabs);
        return;
      }

      namespace.documentHistory.push({
        type: "custom",
        dabs,
        layerId,
        source: "smudge",
        destroy: () => {
          this.deleteHistoryDabs(dabs);
        },
        redo: () => this.restoreHistoryDabs(layerId, dabs, "after", false, "smudge-redo"),
        undo: () => this.restoreHistoryDabs(layerId, dabs, "before", true, "smudge-undo"),
      });
    }

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }

    clamp01(value) {
      return this.clamp(value, 0, 1);
    }

    normalizePressure(pressure) {
      const value = Number(pressure);

      if (!Number.isFinite(value) || value <= 0) {
        return 1;
      }

      return this.clamp01(value);
    }

    getSettings() {
      return {
        ...namespace.SmudgeBrushes.wetPaint,
        ...(namespace.smudgeSettings || {}),
      };
    }

    getRadius() {
      return this.clamp(this.getSettings().radius, 1, 512);
    }

    getOpacity() {
      return this.clamp01(this.getSettings().opacity);
    }

    getHardness() {
      return this.clamp01(this.getSettings().hardness);
    }

    getSpacing() {
      return this.clamp(this.getSettings().spacing, 0.005, 1);
    }

    getDrag() {
      return this.clamp01(this.getSettings().drag);
    }

    getPressureStrength(pressure) {
      return this.getSettings().pressureAffectsStrength === false ? 1 : this.normalizePressure(pressure);
    }

    resolveDirection(directionX, directionY) {
      const dx = Number.isFinite(directionX) ? directionX : this.lastDirectionX;
      const dy = Number.isFinite(directionY) ? directionY : this.lastDirectionY;
      const length = Math.hypot(dx, dy);

      if (length <= 0.0001) {
        return { x: 0, y: 0 };
      }

      return {
        x: dx / length,
        y: dy / length,
      };
    }

    getView() {
      const fallbackCamera = namespace.brushEngine?.camera || { x: 0, y: 0, zoom: 1 };
      const fallbackDpr = namespace.brushEngine?.dpr || Math.max(1, window.devicePixelRatio || 1);
      const viewState = this.getViewState ? this.getViewState() || {} : {};

      return {
        camera: viewState.camera || fallbackCamera,
        dpr: Number.isFinite(viewState.dpr) && viewState.dpr > 0 ? viewState.dpr : fallbackDpr,
      };
    }

    screenToDocumentSpace(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const { camera, dpr } = this.getView();
      const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
      const viewportX = (clientX - rect.left) * dpr;
      const viewportY = (clientY - rect.top) * dpr;

      return {
        docX: (viewportX - (camera.x || 0)) / zoom,
        docY: (viewportY - (camera.y || 0)) / zoom,
      };
    }

    isDocumentPointInside(point, target = null) {
      const documentRect = this.getDocumentRect(target);

      return (
        point.docX >= documentRect.x &&
        point.docY >= documentRect.y &&
        point.docX <= documentRect.x + documentRect.width &&
        point.docY <= documentRect.y + documentRect.height
      );
    }

    getInitialSmudgeToolActive() {
      const activeTool = document.querySelector("[data-tool].active");

      if (!activeTool) {
        return false;
      }

      return this.isSmudgeToolDetail({
        label: activeTool.getAttribute("aria-label") || "",
        toolMode: activeTool.dataset.toolMode || "",
      });
    }

    isSmudgeToolDetail(detail = {}) {
      const label = String(detail.label || "").toUpperCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();

      return label === "SMUDGE" || toolMode === "smudge";
    }

    handleToolChange(event) {
      this.isSmudgeToolActive = this.isSmudgeToolDetail(event.detail);

      if (!this.isSmudgeToolActive && this.isDragging) {
        this.cancelStroke();
      }
    }

    handleSettingsChange(event) {
      if (event.detail?.tool !== "smudge") {
        return;
      }

      namespace.smudgeSettings = {
        ...namespace.SmudgeBrushes.wetPaint,
        ...(event.detail.settings || {}),
      };
    }

    ensureEmptySmudgeLayerToast() {
      if (typeof document === "undefined" || !document.body) {
        return null;
      }

      let toast = document.getElementById?.("cbo-smudge-empty-layer-toast") || null;

      if (!toast && typeof document.createElement === "function") {
        toast = document.createElement("div");
        toast.id = "cbo-smudge-empty-layer-toast";
        toast.className = "cbo-layer-limit-toast";
        toast.hidden = true;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
      }

      return toast;
    }

    showEmptySmudgeLayerToast(message = "Nothing to smudge on this layer") {
      const now = Date.now();

      if (now - (this.lastEmptySmudgeLayerToastAt || 0) < SMUDGE_EMPTY_LAYER_TOAST_THROTTLE_MS) {
        return;
      }

      const toast = this.ensureEmptySmudgeLayerToast();

      if (!toast) {
        return;
      }

      this.lastEmptySmudgeLayerToastAt = now;

      if (this.emptySmudgeLayerToastTimer) {
        window.clearTimeout?.(this.emptySmudgeLayerToastTimer);
        this.emptySmudgeLayerToastTimer = 0;
      }

      toast.textContent = message;
      toast.hidden = false;
      this.emptySmudgeLayerToastTimer = window.setTimeout?.(() => {
        toast.hidden = true;
        this.emptySmudgeLayerToastTimer = 0;
      }, SMUDGE_EMPTY_LAYER_TOAST_MS) || 0;
    }

    shouldIgnorePointer(event) {
      return event.button === 1 || (event.button === 0 && namespace.brushEngine?.isSpaceHeld);
    }

    getActivePaintLayerTarget() {
      const layerModel = this.documentRenderer?.layerModel;
      const activeId = layerModel?.activeLayerId;

      if (!activeId || typeof layerModel?.findEntryById !== "function") {
        return null;
      }

      const activeLayer = layerModel.findEntryById(activeId);

      if (namespace.requestLayerVisibleForEdit?.(activeId, {
        layerModel,
        source: "smudge-stroke",
      }) === false) {
        return null;
      }

      if (activeLayer?.type !== "paint") {
        return null;
      }

      const existingTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(activeId);
      const isEmptySparseTarget =
        this.documentRenderer?.isSparseRasterTarget?.(existingTarget) &&
        existingTarget.tiles.size === 0;

      if (!existingTarget || isEmptySparseTarget) {
        this.showEmptySmudgeLayerToast();
        return null;
      }

      if (this.documentRenderer?.isSparseRasterTarget?.(existingTarget)) {
        return {
          ...existingTarget,
          layerId: activeId,
        };
      }

      if (!existingTarget?.framebuffer || !existingTarget?.texture) {
        return null;
      }

      return {
        ...existingTarget,
        layerId: activeId,
      };
    }

    beginStroke(event) {
      const target = this.getActivePaintLayerTarget();

      if (!target) {
        return false;
      }

      const point = this.screenToDocumentSpace(event.clientX, event.clientY);

      if (!this.isDocumentPointInside(point, target)) {
        return false;
      }

      this.strokeTarget = target;
      this.isDragging = true;
      this.moved = false;
      this.activePointerId = event.pointerId;
      this.activeHistoryDabs = [];
      this.activeHistoryBeforeSnapshot = null;
      this.activeHistoryTileCapture = null;
      this.activeHistoryLayerId = target.layerId || this.documentRenderer?.layerModel?.activeLayerId || null;
      this.activeSmudgeBounds = null;
      this.activeSmudgeMemoryReport = null;
      this.activeSmudgeRedoDisabled = false;
      this.historyDisabledForStroke = false;
      this.releaseScratchTarget();
      this.lastStampX = point.docX;
      this.lastStampY = point.docY;
      this.lastPressure = this.normalizePressure(event.pressure);
      this.lastDirectionX = 0;
      this.lastDirectionY = 0;

      return true;
    }

    handlePointerDown(event) {
      if (
        this.isDisposed ||
        !this.isSmudgeToolActive ||
        this.isDragging ||
        event.button !== 0 ||
        namespace.isTouchNavigationExclusive?.() ||
        this.shouldIgnorePointer(event)
      ) {
        return;
      }

      if (!this.beginStroke(event)) {
        return;
      }

      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
    }

    handlePointerMove(event) {
      if (this.isDisposed || !this.isDragging || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const point = this.screenToDocumentSpace(event.clientX, event.clientY);

      this.moveStroke(point.docX, point.docY, event.pressure);
    }

    handlePointerUp(event) {
      if (this.isDisposed || !this.isDragging || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      this.endStroke(event);
    }

    handlePointerCancel(event) {
      if (!this.isDragging || this.activePointerId !== event.pointerId) {
        return;
      }

      this.cancelStroke(event);
    }

    handleTouchNavigationStart() {
      if (this.isDragging) {
        this.cancelStroke();
      }
    }

    moveStroke(x, y, pressure = 1) {
      const nextPressure = this.normalizePressure(pressure);
      const radius = this.getRadius();
      const step = Math.max(1, radius * 2 * this.getSpacing());
      let dx = x - this.lastStampX;
      let dy = y - this.lastStampY;
      let distance = Math.hypot(dx, dy);

      while (distance >= step) {
        const ux = dx / distance;
        const uy = dy / distance;
        const stampX = this.lastStampX + ux * step;
        const stampY = this.lastStampY + uy * step;
        const mixedPressure = (this.lastPressure + nextPressure) * 0.5;

        this.renderDab(stampX, stampY, mixedPressure, ux, uy, step);

        this.lastStampX = stampX;
        this.lastStampY = stampY;
        this.lastPressure = mixedPressure;
        this.lastDirectionX = ux;
        this.lastDirectionY = uy;
        dx = x - this.lastStampX;
        dy = y - this.lastStampY;
        distance = Math.hypot(dx, dy);
        this.moved = true;
      }
    }

    getDabBounds(cx, cy, radius, target) {
      const documentRect = this.getDocumentRect(target);
      const minX = Math.max(documentRect.x, Math.floor(cx - radius - 1));
      const minY = Math.max(documentRect.y, Math.floor(cy - radius - 1));
      const maxX = Math.min(documentRect.x + documentRect.width, Math.ceil(cx + radius + 1));
      const maxY = Math.min(documentRect.y + documentRect.height, Math.ceil(cy + radius + 1));
      const width = Math.max(0, maxX - minX);
      const height = Math.max(0, maxY - minY);

      if (width <= 0 || height <= 0) {
        return null;
      }

      return { x: minX, y: minY, width, height };
    }

    clampBoundsToTarget(bounds, target) {
      return this.intersectDocumentRects(bounds, this.getRasterTargetDocumentRect(target));
    }

    prepareSmudgeTargetForBounds(bounds) {
      const layerId = this.activeHistoryLayerId || this.strokeTarget?.layerId || null;
      const target = this.strokeTarget;

      if (!layerId || !target || !bounds) {
        return target;
      }

      if (this.documentRenderer?.isSparseRasterTarget?.(target)) {
        return target;
      }

      const targetRect = this.getRasterTargetDocumentRect(target);

      if (this.containsRect(targetRect, bounds)) {
        return target;
      }

      const nextTarget = this.documentRenderer?.ensureRasterTargetForPaintRect?.(layerId, bounds, {
        retileExistingTarget: false,
        source: "smudge-stroke-target",
        sparse: false,
      });

      if (nextTarget?.framebuffer && nextTarget?.texture) {
        this.strokeTarget = {
          ...nextTarget,
          layerId,
        };
      }

      return this.strokeTarget;
    }

    includeSmudgeBounds(bounds) {
      if (!bounds) {
        return;
      }

      const x2 = bounds.x + bounds.width;
      const y2 = bounds.y + bounds.height;

      if (!this.activeSmudgeBounds) {
        this.activeSmudgeBounds = {
          x: bounds.x,
          y: bounds.y,
          x2,
          y2,
        };
        return;
      }

      this.activeSmudgeBounds.x = Math.min(this.activeSmudgeBounds.x, bounds.x);
      this.activeSmudgeBounds.y = Math.min(this.activeSmudgeBounds.y, bounds.y);
      this.activeSmudgeBounds.x2 = Math.max(this.activeSmudgeBounds.x2, x2);
      this.activeSmudgeBounds.y2 = Math.max(this.activeSmudgeBounds.y2, y2);
    }

    getActiveSmudgeRect() {
      if (!this.activeSmudgeBounds) {
        return null;
      }

      const x = Math.floor(this.activeSmudgeBounds.x);
      const y = Math.floor(this.activeSmudgeBounds.y);
      const width = Math.ceil(this.activeSmudgeBounds.x2) - x;
      const height = Math.ceil(this.activeSmudgeBounds.y2) - y;

      if (width <= 0 || height <= 0) {
        return null;
      }

      return { x, y, width, height };
    }

    getSmudgeSourceBounds(bounds, direction, dragOffset, radius, target) {
      const blurPadding = Math.ceil(Math.max(0.5, radius * 0.07) + Math.abs(dragOffset) + 2);
      const sourceX = bounds.x - direction.x * dragOffset - blurPadding;
      const sourceY = bounds.y - direction.y * dragOffset - blurPadding;
      const sourceBounds = {
        x: Math.floor(Math.min(bounds.x, sourceX)),
        y: Math.floor(Math.min(bounds.y, sourceY)),
        width: Math.ceil(Math.max(bounds.x + bounds.width, sourceX + bounds.width + blurPadding * 2)) -
          Math.floor(Math.min(bounds.x, sourceX)),
        height: Math.ceil(Math.max(bounds.y + bounds.height, sourceY + bounds.height + blurPadding * 2)) -
          Math.floor(Math.min(bounds.y, sourceY)),
      };

      return this.intersectDocumentRects(sourceBounds, this.getDocumentRect(target));
    }

    renderDabToScratch({
      bounds,
      cx,
      cy,
      direction,
      dragOffset,
      pressureStrength,
      radius,
      scratch,
      sourceTarget,
    }) {
      if (!sourceTarget?.texture || !scratch?.framebuffer || !bounds) {
        return false;
      }

      const gl = this.gl;
      const scratchRect = scratch.rect || bounds;
      const sourceRect = this.getRasterTargetDocumentRect(sourceTarget);
      const { program, uniforms } = this.dabProgramInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, scratch.width, scratch.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform2f(uniforms.sourceOrigin, sourceRect.x, sourceRect.y);
      gl.uniform2f(uniforms.sourceSize, sourceRect.width, sourceRect.height);
      gl.uniform2f(uniforms.targetOrigin, scratchRect.x, scratchRect.y);
      gl.uniform2f(uniforms.targetSize, scratchRect.width, scratchRect.height);
      gl.uniform4f(uniforms.bounds, bounds.x, bounds.y, bounds.width, bounds.height);
      gl.uniform2f(uniforms.center, cx, cy);
      gl.uniform2f(uniforms.direction, direction.x, direction.y);
      gl.uniform1f(uniforms.radius, radius);
      gl.uniform1f(uniforms.opacity, this.getOpacity());
      gl.uniform1f(uniforms.hardness, this.getHardness());
      gl.uniform1f(uniforms.pressure, pressureStrength);
      gl.uniform1f(uniforms.dragOffset, dragOffset);
      gl.uniform1i(uniforms.sourceTexture, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTarget.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindVertexArray(this.quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    renderSparseDab(sparseTarget, cx, cy, pressure, direction, radius, bounds, stepDistance, selectionCoverageRects = null) {
      const layerId = this.activeHistoryLayerId || sparseTarget?.layerId || null;

      if (!layerId || !this.documentRenderer?.ensureRasterTargetsForPaintRect) {
        return;
      }

      const safeStep = Number.isFinite(stepDistance) && stepDistance > 0 ? stepDistance : Math.max(1, radius * 2 * this.getSpacing());
      const dragOffset = safeStep * this.getDrag();
      const pressureStrength = this.getPressureStrength(pressure);
      const sourceBounds = this.getSmudgeSourceBounds(bounds, direction, dragOffset, radius, sparseTarget);

      if (!sourceBounds) {
        return;
      }

      const shouldCaptureHistory = !this.historyDisabledForStroke && this.hasHistorySupport();

      if (shouldCaptureHistory && !this.captureActiveHistoryBefore(sparseTarget, bounds)) {
        this.historyDisabledForStroke = true;
      }

      const sourceSnapshot = this.documentRenderer?.createRasterSnapshot?.(layerId, sourceBounds, "smudge source");

      if (!sourceSnapshot?.texture || !sourceSnapshot?.framebuffer) {
        this.documentRenderer?.deleteRasterSnapshot?.(sourceSnapshot);
        return;
      }

      const sourceTarget = {
        framebuffer: sourceSnapshot.framebuffer,
        height: sourceSnapshot.rect.height,
        layerId,
        texture: sourceSnapshot.texture,
        width: sourceSnapshot.rect.width,
        x: sourceSnapshot.rect.x,
        y: sourceSnapshot.rect.y,
      };
      const paintTargets = this.documentRenderer.ensureRasterTargetsForPaintRect(layerId, bounds, {
        source: "smudge-sparse-target",
      }) || [];
      const scratch = this.ensureScratchTarget(sourceTarget, bounds);
      const didRender = this.renderDabToScratch({
        bounds,
        cx,
        cy,
        direction,
        dragOffset,
        pressureStrength,
        radius,
        scratch,
        sourceTarget,
      });

      if (didRender) {
        for (const item of paintTargets) {
          const paintTarget = item?.target;
          const targetBounds = this.intersectDocumentRects(bounds, item?.tileRect || this.getRasterTargetDocumentRect(paintTarget));

          if (!paintTarget?.framebuffer || !paintTarget?.texture || !targetBounds) {
            continue;
          }

          if (Array.isArray(selectionCoverageRects)) {
            selectionCoverageRects.forEach((coverageRect) => {
              const coverageTargetBounds = this.intersectDocumentRects(targetBounds, coverageRect);

              if (coverageTargetBounds) {
                this.blitScratchToTarget(scratch, paintTarget, coverageTargetBounds);
              }
            });
          } else {
            this.blitScratchToTarget(scratch, paintTarget, targetBounds);
          }
          this.documentRenderer?.markRasterTargetDirty?.(paintTarget);
        }

        const liveTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(layerId);

        if (this.documentRenderer?.isSparseRasterTarget?.(liveTarget)) {
          liveTarget.version = (liveTarget.version || 0) + 1;
          this.strokeTarget = liveTarget;
        }
      }

      this.documentRenderer?.deleteRasterSnapshot?.(sourceSnapshot);
      this.documentRenderer?.invalidatePreviewCache?.("smudge-live");

      const gl = this.gl;
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.requestDraw?.();
    }

    renderDab(cx, cy, pressure, directionX, directionY, stepDistance) {
      let target = this.strokeTarget;

      if (!target) {
        return;
      }

      const radius = this.getRadius();
      let bounds = this.getDabBounds(cx, cy, radius, target);

      if (!bounds) {
        return;
      }

      let selectionCoverageRects = this.getActiveAreaSelectionCoverageRects(bounds);

      bounds = Array.isArray(selectionCoverageRects)
        ? this.getBoundsForDocumentRects(selectionCoverageRects)
        : bounds;

      if (!bounds) {
        return;
      }

      target = this.prepareSmudgeTargetForBounds(bounds);

      if (!target || !bounds) {
        return;
      }

      const direction = this.resolveDirection(directionX, directionY);

      if (direction.x === 0 && direction.y === 0) {
        return;
      }

      if (this.documentRenderer?.isSparseRasterTarget?.(target)) {
        this.includeSmudgeBounds(bounds);
        this.renderSparseDab(target, cx, cy, pressure, direction, radius, bounds, stepDistance, selectionCoverageRects);
        return;
      }

      bounds = this.clampBoundsToTarget(bounds, target);

      if (!bounds) {
        return;
      }

      selectionCoverageRects = Array.isArray(selectionCoverageRects)
        ? selectionCoverageRects
            .map((coverageRect) => this.intersectDocumentRects(coverageRect, bounds))
            .filter(Boolean)
        : null;

      this.includeSmudgeBounds(bounds);

      const gl = this.gl;
      const scratch = this.ensureScratchTarget(target, bounds);
      const pressureStrength = this.getPressureStrength(pressure);
      const safeStep = Number.isFinite(stepDistance) && stepDistance > 0 ? stepDistance : Math.max(1, radius * 2 * this.getSpacing());
      const dragOffset = safeStep * this.getDrag();
      const shouldCaptureHistory = !this.historyDisabledForStroke && this.hasHistorySupport();

      if (shouldCaptureHistory && !this.captureActiveHistoryBefore(target, bounds)) {
        this.historyDisabledForStroke = true;
      }

      const didRender = this.renderDabToScratch({
        bounds,
        cx,
        cy,
        direction,
        dragOffset,
        pressureStrength,
        radius,
        scratch,
        sourceTarget: target,
      });

      if (!didRender) {
        return;
      }

      if (Array.isArray(selectionCoverageRects)) {
        selectionCoverageRects.forEach((coverageRect) => {
          this.blitScratchToTarget(scratch, target, coverageRect);
        });
      } else {
        this.blitScratchToTarget(scratch, target, bounds);
      }
      this.documentRenderer?.markRasterTargetDirty?.(target);
      this.restoreDocumentTextureFiltering(target);
      this.documentRenderer?.invalidatePreviewCache?.("smudge-live");

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.requestDraw?.();
    }

    restoreDocumentTextureFiltering(target) {
      const gl = this.gl;

      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    blitScratchToTarget(scratch, target, bounds) {
      const gl = this.gl;
      const scratchRect = scratch.rect || this.getFullDocumentRect(target);
      const sourceX0 = bounds.x - scratchRect.x;
      const sourceX1 = sourceX0 + bounds.width;
      const sourceY0 = scratchRect.height - ((bounds.y - scratchRect.y) + bounds.height);
      const sourceY1 = scratchRect.height - (bounds.y - scratchRect.y);
      const targetRect = this.getRasterTargetDocumentRect(target);
      const localX = bounds.x - targetRect.x;
      const localY = bounds.y - targetRect.y;
      const x0 = localX;
      const x1 = localX + bounds.width;
      const y0 = target.height - (localY + bounds.height);
      const y1 = target.height - localY;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scratch.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(sourceX0, sourceY0, sourceX1, sourceY1, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    retileSmudgeTargetIfNeeded(layerId, target) {
      if (!layerId || !target || typeof this.documentRenderer?.sparsifyRasterTarget !== "function") {
        return target;
      }

      const currentTarget = this.documentRenderer?.rasterTargetsByLayerId?.get?.(layerId) || target;

      if (
        this.documentRenderer?.isSparseRasterTarget?.(currentTarget) ||
        (
          currentTarget.materializedFromSparse !== true &&
          !currentTarget.sparseTileSize
        )
      ) {
        return currentTarget;
      }

      return this.documentRenderer.sparsifyRasterTarget(layerId, currentTarget, {
        emit: false,
        source: "smudge-retile-target",
        tileSize: currentTarget.sparseTileSize || currentTarget.tileSize,
      }) || currentTarget;
    }

    endStroke(event) {
      if (event && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      const smudgeRect = this.getActiveSmudgeRect();
      const target = this.strokeTarget;
      const layerId = this.activeHistoryLayerId || target?.layerId || null;
      const memoryReport = this.activeSmudgeMemoryReport;

      this.isDragging = false;
      this.activePointerId = null;
      this.commitHistory();
      const finalTarget = this.retileSmudgeTargetIfNeeded(layerId, target);
      this.documentRenderer?.evictRasterScratchCachesForPolicy?.(memoryReport, {
        source: "smudge-stroke",
      });
      this.documentRenderer?.compactInactivePaintTargets?.({
        excludeLayerId: layerId,
        source: "smudge-compact-inactive",
      });
      if (typeof this.documentRenderer?.commitVisualDirtyChange === "function") {
        this.documentRenderer.commitVisualDirtyChange({
          emit: false,
          layerId,
          rect: smudgeRect,
          source: "smudge-stroke",
          usePreviewDirtyTiles: true,
        });
      } else {
        this.documentRenderer?.invalidatePreviewCache?.("smudge-stroke", {
          layerId,
          rect: smudgeRect,
        });
      }
      if (SMUDGE_RASTER_DEBUG) {
        this.debugSmudgeRaster(smudgeRect, finalTarget, layerId, {
          historyBytes: this.activeHistoryTileCapture
            ? rectBytes(this.activeHistoryTileCapture.rect) * 2
            : this.activeHistoryBeforeSnapshot
            ? this.getSnapshotBytes(this.activeHistoryBeforeSnapshot)
            : this.getHistoryDabsBytes(this.activeHistoryDabs),
        });
      }
      this.releaseScratchTarget();
      this.activeSmudgeBounds = null;
      this.strokeTarget = null;
    }

    cancelStroke(event) {
      if (event && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.isDragging = false;
      this.moved = false;
      this.activePointerId = null;
      this.clearActiveHistoryDabs();
      this.releaseScratchTarget();
      this.activeSmudgeBounds = null;
      this.strokeTarget = null;
    }

    debugSmudgeRaster(smudgeRect, target, layerId, debugInfo = {}) {
      if (!SMUDGE_RASTER_DEBUG || !smudgeRect || !target) {
        return;
      }

      const dirtyBytes = rectBytes(smudgeRect);
      const historyBytes = Number.isFinite(debugInfo.historyBytes) ? debugInfo.historyBytes : 0;

      namespace.vectorTextRenderer?.debugRasterBox?.({
        fill: "rgba(64, 156, 255, 0.08)",
        layer: {
          id: layerId,
          name: "Smudge stroke",
        },
        rasterBox: smudgeRect,
        size: {
          height: target.height,
          width: target.width,
        },
        source: "smudge-stroke",
        stroke: "#409cff",
        note: CROPPED_SMUDGE_SCRATCH
          ? "Smudge debug: blue is the whole dirty stroke."
          : "Smudge debug: blue is dirty area.",
        extraRows: {
          dirtyAreaMB: bytesToMega(dirtyBytes),
          historyBeforeAfterMB: bytesToMega(historyBytes),
        },
      });
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;
      window.removeEventListener("cbo:tool-change", this.handleToolChange);
      window.removeEventListener("cbo:paint-settings-change", this.handleSettingsChange);
      window.removeEventListener("cbo:touch-navigation-start", this.handleTouchNavigationStart);
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      this.deleteTarget(this.scratchTarget);
      this.scratchTarget = null;
      this.clearActiveHistoryDabs();

      if (this.emptySmudgeLayerToastTimer) {
        window.clearTimeout?.(this.emptySmudgeLayerToastTimer);
        this.emptySmudgeLayerToastTimer = 0;
      }

      if (this.dabProgramInfo?.program) {
        gl.deleteProgram(this.dabProgramInfo.program);
        this.dabProgramInfo = null;
      }

      this.documentRenderer = null;
    }
  }

  namespace.SmudgeEngine = SmudgeEngine;
})(window.CBO);
