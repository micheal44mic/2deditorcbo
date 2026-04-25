window.CBO = window.CBO || {};

(function registerBrushEngine(namespace) {
  const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitCorner;

uniform vec2 uViewportSize;
uniform vec2 uDocumentSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

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

  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

out vec4 outColor;

void main() {
  outColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`;

  class BrushEngine {
    constructor(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("BrushEngine richiede un HTMLCanvasElement.");
      }

      this.canvas = canvas;
      this.gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
      });

      if (!this.gl) {
        throw new Error("WebGL2 non disponibile: impossibile inizializzare BrushEngine.");
      }

      this.camera = { x: 0, y: 0, zoom: 1 };
      this.docWidth = 1;
      this.docHeight = 1;
      this.dpr = 1;
      this.viewportWidth = 1;
      this.viewportHeight = 1;
      this.frameRequest = 0;
      this.resizeObserver = null;
      this.isDisposed = false;

      this.handleResize = this.handleResize.bind(this);
      this.renderLoop = this.renderLoop.bind(this);

      this.configureDocumentSize();
      this.programInfo = this.createProgramInfo();
      this.quad = this.createArtboardQuad();
      this.configureGlState();
      this.resizeViewport();
      this.centerCamera();
      this.observeViewportSize();
      this.startRenderLoop();
    }

    configureGlState() {
      const gl = this.gl;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    configureDocumentSize() {
      const gl = this.gl;
      const policyCap = this.isMobileLikeDevice() ? 2048 : 4096;
      const hardwareCap = gl.getParameter(gl.MAX_TEXTURE_SIZE) || policyCap;
      const side = Math.max(1, Math.min(policyCap, hardwareCap));

      this.docWidth = side;
      this.docHeight = side;
    }

    isMobileLikeDevice() {
      const hasTouch = navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
      const userAgent = navigator.userAgent || "";
      const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

      return hasTouch || hasCoarsePointer || hasMobileUserAgent;
    }

    resizeViewport() {
      const gl = this.gl;
      const rect = this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, this.canvas.clientWidth || Math.round(rect.width) || 1);
      const cssHeight = Math.max(1, this.canvas.clientHeight || Math.round(rect.height) || 1);
      const nextDpr = Math.max(1, window.devicePixelRatio || 1);
      const nextWidth = Math.max(1, Math.round(cssWidth * nextDpr));
      const nextHeight = Math.max(1, Math.round(cssHeight * nextDpr));
      const didResize =
        this.canvas.width !== nextWidth ||
        this.canvas.height !== nextHeight ||
        this.dpr !== nextDpr;

      if (!didResize) {
        return false;
      }

      this.dpr = nextDpr;
      this.viewportWidth = nextWidth;
      this.viewportHeight = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      gl.viewport(0, 0, nextWidth, nextHeight);

      return true;
    }

    centerCamera() {
      const margin = Math.min(96, Math.max(16, Math.min(this.viewportWidth, this.viewportHeight) * 0.08));
      const availableWidth = Math.max(1, this.viewportWidth - margin * 2);
      const availableHeight = Math.max(1, this.viewportHeight - margin * 2);
      const zoom = Math.max(
        0.0001,
        Math.min(availableWidth / this.docWidth, availableHeight / this.docHeight),
      );
      const artboardWidth = this.docWidth * zoom;
      const artboardHeight = this.docHeight * zoom;

      this.camera.zoom = zoom;
      this.camera.x = (this.viewportWidth - artboardWidth) * 0.5;
      this.camera.y = (this.viewportHeight - artboardHeight) * 0.5;
    }

    createProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma shader WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
        },
      };
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione shader.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
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

    observeViewportSize() {
      window.addEventListener("resize", this.handleResize, { passive: true });

      if (!window.ResizeObserver) {
        return;
      }

      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas);
    }

    handleResize() {
      if (this.resizeViewport()) {
        this.centerCamera();
      }
    }

    startRenderLoop() {
      if (!this.frameRequest) {
        this.frameRequest = requestAnimationFrame(this.renderLoop);
      }
    }

    renderLoop() {
      if (this.isDisposed) {
        return;
      }

      if (this.resizeViewport()) {
        this.centerCamera();
      }

      this.draw();
      this.frameRequest = requestAnimationFrame(this.renderLoop);
    }

    draw() {
      const gl = this.gl;
      const { program, uniforms } = this.programInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.viewportWidth, this.viewportHeight);
      gl.clearColor(0.15, 0.15, 0.15, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, this.viewportWidth, this.viewportHeight);
      gl.uniform2f(uniforms.documentSize, this.docWidth, this.docHeight);
      gl.uniform2f(uniforms.cameraPosition, this.camera.x, this.camera.y);
      gl.uniform1f(uniforms.cameraZoom, this.camera.zoom);

      gl.bindVertexArray(this.quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.useProgram(null);
    }

    dispose() {
      const gl = this.gl;

      this.isDisposed = true;

      if (this.frameRequest) {
        cancelAnimationFrame(this.frameRequest);
        this.frameRequest = 0;
      }

      window.removeEventListener("resize", this.handleResize);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }
    }
  }

  namespace.BrushEngine = BrushEngine;
})(window.CBO);
