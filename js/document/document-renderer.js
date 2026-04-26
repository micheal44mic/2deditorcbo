(function registerDocumentRenderer(namespace) {
  const WEBGL2_CONTEXT_ATTRIBUTES = Object.freeze({
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
  });

  const ARTBOARD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

uniform vec2 uViewportSize;
uniform vec2 uDocumentSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;

void main() {
  // aUnitCorner contiene i quattro angoli del documento in spazio normalizzato [0..1].
  // Moltiplicando per uDocumentSize otteniamo coordinate in pixel reali del documento.
  vec2 documentPixel = aUnitCorner * uDocumentSize;

  // La camera conserva l'angolo alto-sinistro del documento in pixel fisici del viewport.
  // Lo zoom scala i pixel del documento prima di proiettarli sul canvas-monitor.
  vec2 viewportPixel = uCameraPosition + documentPixel * uCameraZoom;

  // WebGL usa clip space [-1..1] con asse Y positivo verso l'alto.
  // Il DOM usa pixel con origine in alto a sinistra: per questo invertiamo l'asse Y.
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = vec2(aUnitCorner.x, 1.0 - aUnitCorner.y);
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const ARTBOARD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;
uniform vec2 uDocumentSize;
uniform float uCameraZoom;
uniform float u_gridMode;

in vec2 v_uv;

out vec4 outColor;

void main() {
  if (u_gridMode > 0.5) {
    // Griglia pixel: una linea bianca sottile su ogni bordo di pixel del documento.
    vec2 docPx = v_uv * uDocumentSize;
    vec2 boundaryDistance = abs(fract(docPx - 0.5) - 0.5) / fwidth(docPx);
    float line = 1.0 - clamp(min(boundaryDistance.x, boundaryDistance.y), 0.0, 1.0);
    // Fade in tra zoom 6x e 12x: sotto invisibile, sopra piena visibilita'.
    float zoomFade = smoothstep(6.0, 12.0, uCameraZoom);
    float alpha = line * zoomFade * 0.35;
    // Output pre-moltiplicato bianco.
    outColor = vec4(alpha, alpha, alpha, alpha);
  } else {
    outColor = texture(u_texture, v_uv) * u_opacity;
  }
}
`;

  class DocumentRenderer {
    static createContext(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per creare WebGL2.");
      }

      return canvas.getContext("webgl2", WEBGL2_CONTEXT_ATTRIBUTES);
    }

    static resizeCanvasViewport(canvas, gl) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("DocumentRenderer richiede un HTMLCanvasElement per misurare il viewport.");
      }

      if (!gl || typeof gl.viewport !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido per il viewport.");
      }

      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, canvas.clientHeight || Math.round(rect.height) || 1);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      const didResize = canvas.width !== width || canvas.height !== height;

      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);

      return { dpr, width, height, didResize };
    }

    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createTexture !== "function") {
        throw new TypeError("DocumentRenderer richiede un contesto WebGL2 valido.");
      }

      this.gl = options.gl;
      this.options = {
        transparentBackground: options.transparentBackground === true,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
      };
      this.layerModel = options.layerModel ||
        (namespace.DocumentLayerModel ? new namespace.DocumentLayerModel() : null);
      this.width = 1;
      this.height = 1;
      this.texture = null;
      this.framebuffer = null;
      this.paintLayerId = "";
      this.rasterTargetsByLayerId = new Map();
      this.programInfo = null;
      this.quad = null;
      this.isDisposed = false;

      try {
        this.configureDocumentSize(options.viewportWidth, options.viewportHeight);
        this.createBaseLayerTarget();
        this.programInfo = this.createProgramInfo();
        this.quad = this.createArtboardQuad();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader document renderer WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info =
          gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione dello shader document renderer.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    createProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, ARTBOARD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, ARTBOARD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma document renderer WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma document renderer.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          gridMode: gl.getUniformLocation(program, "u_gridMode"),
        },
      };
    }

    createArtboardQuad() {
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

        throw new Error("Impossibile creare le risorse GPU per l'artboard.");
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

    configureDocumentSize(viewportWidth, viewportHeight) {
      const gl = this.gl;
      const policyCap = this.isMobileLikeDevice() ? 2048 : 4096;
      const hardwareCap = gl.getParameter(gl.MAX_TEXTURE_SIZE) || policyCap;
      const optionCap = this.options.documentSizeCap;
      const effectiveCap = optionCap ? Math.min(policyCap, optionCap) : policyCap;
      const cap = Math.max(1, Math.min(effectiveCap, hardwareCap));
      const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
      const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
      const aspect = safeViewportWidth / safeViewportHeight;

      if (aspect >= 1) {
        this.width = cap;
        this.height = Math.max(1, Math.round(cap / aspect));
      } else {
        this.height = cap;
        this.width = Math.max(1, Math.round(cap * aspect));
      }
    }

    isMobileLikeDevice() {
      const hasTouch = navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
      const userAgent = navigator.userAgent || "";
      const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

      return hasTouch || hasCoarsePointer || hasMobileUserAgent;
    }

    createBaseLayerTarget() {
      const backgroundTarget = this.createRasterTarget([1, 1, 1, 1]);
      const target = this.createRasterTarget([0, 0, 0, 0]);

      this.texture = target.texture;
      this.framebuffer = target.framebuffer;
      this.rasterTargetsByLayerId.set("background", backgroundTarget);
      this.paintLayerId = this.resolvePaintLayerId();
      this.rasterTargetsByLayerId.set(this.paintLayerId, target);
    }

    createRasterTarget(clearColor = [0, 0, 0, 0]) {
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

        throw new Error("Impossibile creare il documento FBO in VRAM.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // MAG = NEAREST: zoomando in si vedono i pixel quadrati come in Photoshop / Procreate.
      // MIN = LINEAR: zoom out resta liscio senza moire.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error("Documento FBO incompleto: impossibile inizializzare la tela.");
      }

      const target = {
        framebuffer,
        texture,
        width: this.width,
        height: this.height,
        clearColor,
      };

      this.clearTarget(target);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return target;
    }

    createPaintTarget() {
      return this.createRasterTarget([0, 0, 0, 0]);
    }

    resolvePaintLayerId() {
      const activeLayer = this.layerModel?.findEntryById?.(this.layerModel.activeLayerId);

      if (activeLayer?.type === "paint") {
        return activeLayer.id;
      }

      const renderablePaintLayer = this.layerModel
        ?.flattenTopToBottom?.()
        .find((layer) => layer.type === "paint");

      return renderablePaintLayer?.id || "paint-main";
    }

    clearTarget(target) {
      if (!target?.framebuffer) {
        return;
      }

      const gl = this.gl;
      const clearColor = Array.isArray(target.clearColor) ? target.clearColor : [0, 0, 0, 0];

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    clear() {
      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => this.clearTarget(target));
    }

    clearLayer(layerId) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      this.clearTarget(target);

      return true;
    }

    getPaintTarget() {
      const layerId = this.resolvePaintLayerId();
      const target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget();

      this.paintLayerId = layerId;
      this.rasterTargetsByLayerId.set(layerId, target);

      return {
        ...target,
        layerId,
      };
    }

    ensurePaintLayerForBrush() {
      const paintLayer = this.layerModel?.ensureActivePaintLayer?.({ source: "brush-stroke" });

      if (paintLayer?.id) {
        return this.getRasterTarget(paintLayer.id);
      }

      return this.getPaintTarget();
    }

    clearActiveLayer(options = {}) {
      this.layerModel?.setActiveLayer?.(null, {
        source: options.source || "clear-active-layer",
      });
    }

    getRasterTarget(layerId) {
      if (!layerId) {
        throw new TypeError("DocumentRenderer richiede un layerId per il target raster.");
      }

      const target = this.rasterTargetsByLayerId.get(layerId) || this.createPaintTarget();

      this.rasterTargetsByLayerId.set(layerId, target);

      return {
        ...target,
        layerId,
      };
    }

    getRenderableLayers() {
      const layers = this.layerModel?.getRenderableLayers?.();

      if (Array.isArray(layers)) {
        return layers;
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    drawToCanvas(options = {}) {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;
      const target = this.getPaintTarget();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const { program, uniforms } = this.programInfo;
      const activeStrokeLayerId = options.activeStrokeLayerId || target.layerId;
      let didDrawActiveStroke = false;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      if (this.options.transparentBackground) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(0.15, 0.15, 0.15, 1.0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, target.width, target.height);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);

      // Pass 1: layer documento, dal basso verso l'alto.
      gl.uniform1f(uniforms.gridMode, 0.0);

      for (const layer of this.getRenderableLayers()) {
        const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
        const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;

        if (layerTarget?.texture) {
          gl.bindTexture(gl.TEXTURE_2D, layerTarget.texture);
          gl.uniform1f(uniforms.opacity, opacity);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        if (options.activeStrokeTexture && layer.id === activeStrokeLayerId) {
          gl.bindTexture(gl.TEXTURE_2D, options.activeStrokeTexture);
          gl.uniform1f(uniforms.opacity, opacity);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          didDrawActiveStroke = true;
        }
      }

      if (options.activeStrokeTexture && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          gl.bindTexture(gl.TEXTURE_2D, options.activeStrokeTexture);
          gl.uniform1f(uniforms.opacity, 1.0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }

      // Pass 2: griglia pixel sopra tutto. Lo shader la attiva solo a zoom alto.
      gl.uniform1f(uniforms.gridMode, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      const gl = this.gl;

      this.isDisposed = true;

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }

      new Set(this.rasterTargetsByLayerId.values()).forEach((target) => {
        if (target.framebuffer) {
          gl.deleteFramebuffer(target.framebuffer);
        }

        if (target.texture) {
          gl.deleteTexture(target.texture);
        }
      });

      this.rasterTargetsByLayerId.clear();
      this.framebuffer = null;
      this.texture = null;
    }
  }

  namespace.DocumentRenderer = DocumentRenderer;
})(window.CBO = window.CBO || {});
