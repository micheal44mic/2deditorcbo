window.CBO = window.CBO || {};

(function registerSmudgeEngine(namespace) {
  const DAB_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;

uniform vec2 u_docResolution;
uniform vec4 u_bounds;

out vec2 v_docPosition;
out vec2 v_docUv;

void main() {
  vec2 documentPosition = u_bounds.xy + a_corner * u_bounds.zw;
  vec2 clipPosition = (documentPosition / u_docResolution) * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_docPosition = documentPosition;
  v_docUv = vec2(
    documentPosition.x / u_docResolution.x,
    1.0 - documentPosition.y / u_docResolution.y
  );
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PAINT_DAB_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_sourceTexture;
uniform vec2 u_docResolution;
uniform vec2 u_center;
uniform vec2 u_direction;
uniform float u_radius;
uniform float u_opacity;
uniform float u_hardness;
uniform float u_pressure;
uniform float u_dragOffset;

in vec2 v_docPosition;
in vec2 v_docUv;

out vec4 outColor;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec4 sampleLayer(vec2 documentPosition) {
  vec2 uv = vec2(
    documentPosition.x / u_docResolution.x,
    1.0 - documentPosition.y / u_docResolution.y
  );
  return texture(u_sourceTexture, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
  vec4 oldColor = texture(u_sourceTexture, v_docUv);
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
      this.dabProgramInfo = this.createDabProgramInfo();
      this.quad = this.createQuad();

      this.handleToolChange = this.handleToolChange.bind(this);
      this.handleSettingsChange = this.handleSettingsChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);

      window.addEventListener("cbo:tool-change", this.handleToolChange);
      window.addEventListener("cbo:paint-settings-change", this.handleSettingsChange);
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
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
          docResolution: gl.getUniformLocation(program, "u_docResolution"),
          dragOffset: gl.getUniformLocation(program, "u_dragOffset"),
          hardness: gl.getUniformLocation(program, "u_hardness"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          pressure: gl.getUniformLocation(program, "u_pressure"),
          radius: gl.getUniformLocation(program, "u_radius"),
          sourceTexture: gl.getUniformLocation(program, "u_sourceTexture"),
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

    createTarget(width, height, label, filter = this.gl.LINEAR) {
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

      return { framebuffer, height, texture, width };
    }

    createScratchTarget(target) {
      return this.createTarget(target.width, target.height, "temporaneo smudge", this.gl.NEAREST);
    }

    ensureScratchTarget(target) {
      if (
        this.scratchTarget &&
        this.scratchTarget.width === target.width &&
        this.scratchTarget.height === target.height
      ) {
        return this.scratchTarget;
      }

      this.deleteTarget(this.scratchTarget);
      this.scratchTarget = this.createScratchTarget(target);

      return this.scratchTarget;
    }

    deleteTarget(target) {
      if (!target) {
        return;
      }

      const gl = this.gl;

      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
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

    isDocumentPointInside(point, target = this.documentRenderer.getPaintTarget()) {
      return (
        point.docX >= 0 &&
        point.docY >= 0 &&
        point.docX <= target.width &&
        point.docY <= target.height
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

    shouldIgnorePointer(event) {
      return event.button === 1 || (event.button === 0 && namespace.brushEngine?.isSpaceHeld);
    }

    beginStroke(event) {
      const target = this.documentRenderer.ensurePaintLayerForBrush?.() || this.documentRenderer.getPaintTarget();
      const point = this.screenToDocumentSpace(event.clientX, event.clientY);

      if (!this.isDocumentPointInside(point, target)) {
        return false;
      }

      this.strokeTarget = target;
      this.isDragging = true;
      this.moved = false;
      this.activePointerId = event.pointerId;
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
      const minX = Math.max(0, Math.floor(cx - radius - 1));
      const minY = Math.max(0, Math.floor(cy - radius - 1));
      const maxX = Math.min(target.width, Math.ceil(cx + radius + 1));
      const maxY = Math.min(target.height, Math.ceil(cy + radius + 1));
      const width = Math.max(0, maxX - minX);
      const height = Math.max(0, maxY - minY);

      if (width <= 0 || height <= 0) {
        return null;
      }

      return { x: minX, y: minY, width, height };
    }

    renderDab(cx, cy, pressure, directionX, directionY, stepDistance) {
      const target = this.strokeTarget || this.documentRenderer.getPaintTarget();
      const radius = this.getRadius();
      const bounds = this.getDabBounds(cx, cy, radius, target);

      if (!bounds) {
        return;
      }

      const direction = this.resolveDirection(directionX, directionY);

      if (direction.x === 0 && direction.y === 0) {
        return;
      }

      const gl = this.gl;
      const scratch = this.ensureScratchTarget(target);
      const { program, uniforms } = this.dabProgramInfo;
      const pressureStrength = this.getPressureStrength(pressure);
      const dragScale = this.getDrag();
      const safeStep = Number.isFinite(stepDistance) && stepDistance > 0 ? stepDistance : Math.max(1, radius * 2 * this.getSpacing());
      const dragOffset = safeStep * dragScale;

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform2f(uniforms.docResolution, target.width, target.height);
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
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindVertexArray(this.quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      this.blitScratchToTarget(scratch, target, bounds);
      this.restoreDocumentTextureFiltering(target);

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
      const x0 = bounds.x;
      const x1 = bounds.x + bounds.width;
      const y0 = target.height - (bounds.y + bounds.height);
      const y1 = target.height - bounds.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scratch.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(x0, y0, x1, y1, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    endStroke(event) {
      if (event && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.isDragging = false;
      this.activePointerId = null;
      this.strokeTarget = null;
    }

    cancelStroke(event) {
      if (event && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.isDragging = false;
      this.moved = false;
      this.activePointerId = null;
      this.strokeTarget = null;
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;
      window.removeEventListener("cbo:tool-change", this.handleToolChange);
      window.removeEventListener("cbo:paint-settings-change", this.handleSettingsChange);
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

      if (this.dabProgramInfo?.program) {
        gl.deleteProgram(this.dabProgramInfo.program);
        this.dabProgramInfo = null;
      }

      this.documentRenderer = null;
    }
  }

  namespace.SmudgeEngine = SmudgeEngine;
})(window.CBO);
