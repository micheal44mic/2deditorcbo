window.CBO = window.CBO || {};

(function registerBrushEngine(namespace) {
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

in vec2 v_uv;

out vec4 outColor;

void main() {
  // Rispettiamo la pre-moltiplicazione: scalando l'intero vec4 manteniamo coerenti rgb e alpha.
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`;

  const BRUSH_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 aInstancePos;
layout(location = 2) in float aInstancePressure;

uniform vec2 u_docResolution;
uniform float u_brushSize;

out vec2 v_uv;

void main() {
  float pressure = max(aInstancePressure, 0.0);
  vec2 documentPosition = aInstancePos + a_position * u_brushSize * pressure;
  vec2 clipPosition = (documentPosition / u_docResolution) * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_uv = a_position + 0.5;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const BRUSH_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec3 u_color;

in vec2 v_uv;

out vec4 outColor;

void main() {
  float distanceFromCenter = distance(v_uv, vec2(0.5));

  if (distanceFromCenter > 0.5) {
    discard;
  }

  float edgeWidth = max(fwidth(distanceFromCenter), 0.001);
  float alpha = 1.0 - smoothstep(0.5 - edgeWidth, 0.5, distanceFromCenter);

  // Output strettamente pre-moltiplicato: necessario per MAX blending coerente.
  outColor = vec4(u_color * alpha, alpha);
}
`;

  const COMPOSITE_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const COMPOSITE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * u_opacity;
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
      this.brushState = { ...(namespace.brushSettings || {}) };
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.strokeStampCount = 0;
      this.isDrawing = false;
      this.activePointerId = null;
      this.frameRequest = 0;
      this.resizeObserver = null;
      this.isDisposed = false;
      this.baseTexture = null;
      this.baseFBO = null;
      this.strokeTexture = null;
      this.strokeFBO = null;
      this.brushProgramInfo = null;
      this.compositeProgramInfo = null;
      this.brush = null;
      this.fullscreenQuad = null;

      this.handleResize = this.handleResize.bind(this);
      this.handleBrushSettingsChange = this.handleBrushSettingsChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.renderLoop = this.renderLoop.bind(this);

      this.configureDocumentSize();
      this.programInfo = this.createProgramInfo();
      this.brushProgramInfo = this.createBrushProgramInfo();
      this.compositeProgramInfo = this.createCompositeProgramInfo();
      this.quad = this.createArtboardQuad();
      this.fullscreenQuad = this.createFullscreenQuad();
      this.configureGlState();
      this.createBaseLayerTarget();
      this.createStrokeLayerTarget();
      this.brush = this.createBrushResources();
      this.resizeViewport();
      this.centerCamera();
      this.observeViewportSize();
      this.bindBrushSettings();
      this.bindPointerEvents();
      this.startRenderLoop();
    }

    configureGlState() {
      const gl = this.gl;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, ARTBOARD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, ARTBOARD_FRAGMENT_SHADER_SOURCE);
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
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createBrushProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, BRUSH_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, BRUSH_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma brush WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma brush.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          brushSize: gl.getUniformLocation(program, "u_brushSize"),
          docResolution: gl.getUniformLocation(program, "u_docResolution"),
          color: gl.getUniformLocation(program, "u_color"),
        },
      };
    }

    createCompositeProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, COMPOSITE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma composite WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma composite.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          texture: gl.getUniformLocation(program, "u_texture"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
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

    createFullscreenQuad() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      // Triangle strip in clip space: copre l'intero target FBO senza scomodare la camera.
      const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]);

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare il quad fullscreen GPU.");
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

    createBaseLayerTarget() {
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.docWidth,
        this.docHeight,
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

      gl.viewport(0, 0, this.docWidth, this.docHeight);
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.baseTexture = texture;
      this.baseFBO = framebuffer;
    }

    createStrokeLayerTarget() {
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

        throw new Error("Impossibile creare lo Stroke FBO in VRAM.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.docWidth,
        this.docHeight,
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
        throw new Error("Stroke FBO incompleto: impossibile inizializzare il livello tratto.");
      }

      gl.viewport(0, 0, this.docWidth, this.docHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.strokeTexture = texture;
      this.strokeFBO = framebuffer;
    }

    createBrushResources() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const quadVBO = gl.createBuffer();
      const instanceVBO = gl.createBuffer();
      const vertices = new Float32Array([
        -0.5, -0.5,
        0.5, -0.5,
        -0.5, 0.5,
        0.5, 0.5,
      ]);

      if (!vao || !quadVBO || !instanceVBO) {
        if (instanceVBO) {
          gl.deleteBuffer(instanceVBO);
        }

        if (quadVBO) {
          gl.deleteBuffer(quadVBO);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse GPU del pennello.");
      }

      gl.bindVertexArray(vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8);
      gl.vertexAttribDivisor(2, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, quadVBO, instanceVBO };
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

    bindBrushSettings() {
      window.addEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
    }

    handleBrushSettingsChange() {
      this.brushState = { ...(namespace.brushSettings || {}) };
    }

    bindPointerEvents() {
      this.canvas.style.touchAction = "none";
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    }

    screenToDocumentSpace(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const viewportX = (clientX - rect.left) * this.dpr;
      const viewportY = (clientY - rect.top) * this.dpr;

      return {
        docX: (viewportX - this.camera.x) / this.camera.zoom,
        docY: (viewportY - this.camera.y) / this.camera.zoom,
      };
    }

    createPointerSample(event) {
      const { docX, docY } = this.screenToDocumentSpace(event.clientX, event.clientY);
      const isMouse = event.pointerType === "mouse";

      return {
        x: docX,
        y: docY,
        pressure: isMouse ? 1.0 : event.pressure,
        tiltX: isMouse ? 0 : event.tiltX,
        tiltY: isMouse ? 0 : event.tiltY,
        time: performance.now(),
      };
    }

    parseColorToRgb01(value) {
      const fallback = [0, 0, 0];

      if (typeof value !== "string") {
        return fallback;
      }

      const trimmed = value.trim();

      if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);

        if (hex.length === 3 || hex.length === 4) {
          const r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
          const g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
          const b = parseInt(hex.charAt(2) + hex.charAt(2), 16);

          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r / 255, g / 255, b / 255];
          }
        } else if (hex.length === 6 || hex.length === 8) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);

          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r / 255, g / 255, b / 255];
          }
        }

        return fallback;
      }

      const rgbMatch = trimmed.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);

      if (rgbMatch) {
        const r = Math.max(0, Math.min(255, Number(rgbMatch[1])));
        const g = Math.max(0, Math.min(255, Number(rgbMatch[2])));
        const b = Math.max(0, Math.min(255, Number(rgbMatch[3])));

        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          return [r / 255, g / 255, b / 255];
        }
      }

      return fallback;
    }

    getOpacity01() {
      const value = Number(this.brushState.opacity);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    lerp(start, end, t) {
      return start + (end - start) * t;
    }

    catmullRom(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;

      return {
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        pressure: this.lerp(p1.pressure, p2.pressure, t),
        tiltX: this.lerp(p1.tiltX, p2.tiltX, t),
        tiltY: this.lerp(p1.tiltY, p2.tiltY, t),
      };
    }

    createStamp(point) {
      return {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
      };
    }

    lerpStamp(from, to, t) {
      return {
        x: this.lerp(from.x, to.x, t),
        y: this.lerp(from.y, to.y, t),
        pressure: this.lerp(from.pressure, to.pressure, t),
        tiltX: this.lerp(from.tiltX, to.tiltX, t),
        tiltY: this.lerp(from.tiltY, to.tiltY, t),
      };
    }

    getStampSpacing() {
      const size = Number(this.brushState.size || 20);
      const spacingPercent = Number(this.brushState.spacing || 10);
      const safeSize = Number.isFinite(size) && size > 0 ? size : 20;
      const safeSpacingPercent =
        Number.isFinite(spacingPercent) && spacingPercent > 0 ? spacingPercent : 10;

      return Math.max(1, safeSize * (safeSpacingPercent / 100));
    }

    processStamps() {
      if (this.currentStroke.length !== 4) {
        return;
      }

      const [p0, p1, p2, p3] = this.currentStroke;
      const spacing = this.getStampSpacing();
      const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const sampleCount = Math.max(8, Math.min(128, Math.ceil(segmentDistance / 4)));
      let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

      for (let index = 1; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const point = this.catmullRom(p0, p1, p2, p3, t);
        const stepDistance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);

        if (stepDistance > 0) {
          this.leftoverDistance += stepDistance;

          while (this.leftoverDistance >= spacing) {
            const overshoot = this.leftoverDistance - spacing;
            const distanceFromPrevious = stepDistance - overshoot;
            const stampT = Math.max(0, Math.min(1, distanceFromPrevious / stepDistance));
            const stamp = this.lerpStamp(previousPoint, point, stampT);

            this.stampsBuffer.push(stamp);
            this.leftoverDistance -= spacing;
          }
        }

        previousPoint = point;
      }

      this.currentStroke.shift();
      this.flushStamps();
    }

    flushStamps() {
      if (this.stampsBuffer.length === 0) {
        return;
      }

      const gl = this.gl;
      const stampCount = this.stampsBuffer.length;
      const instanceData = new Float32Array(stampCount * 3);
      const size = Number(this.brushState.size || 20);
      const brushSize = Number.isFinite(size) && size > 0 ? size : 20;
      const color = this.parseColorToRgb01(this.brushState.color);

      for (let index = 0; index < stampCount; index += 1) {
        const stamp = this.stampsBuffer[index];
        const offset = index * 3;

        instanceData[offset] = stamp.x;
        instanceData[offset + 1] = stamp.y;
        instanceData[offset + 2] = stamp.pressure;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokeFBO);
      gl.viewport(0, 0, this.docWidth, this.docHeight);
      gl.enable(gl.BLEND);
      // MAX blending: l'alpha del tratto raggiunge un plateau e non si auto-accumula sui ripassi.
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);

      gl.useProgram(this.brushProgramInfo.program);
      gl.uniform2f(this.brushProgramInfo.uniforms.docResolution, this.docWidth, this.docHeight);
      gl.uniform1f(this.brushProgramInfo.uniforms.brushSize, brushSize);
      gl.uniform3f(this.brushProgramInfo.uniforms.color, color[0], color[1], color[2]);

      gl.bindVertexArray(this.brush.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brush.instanceVBO);
      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stampCount);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
      // Ripristina la pipeline al blending pre-moltiplicato standard.
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.stampsBuffer.length = 0;
      this.strokeStampCount += stampCount;
    }

    bakeStroke() {
      const gl = this.gl;
      const { program, uniforms } = this.compositeProgramInfo;
      const opacity = this.getOpacity01();

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFBO);
      gl.viewport(0, 0, this.docWidth, this.docHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.strokeTexture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      this.clearStrokeLayer();
    }

    clearStrokeLayer() {
      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.strokeFBO);
      gl.viewport(0, 0, this.docWidth, this.docHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    handlePointerDown(event) {
      if (event.button !== 0 || this.isDrawing) {
        return;
      }

      event.preventDefault();
      const point = this.createPointerSample(event);

      this.isDrawing = true;
      this.activePointerId = event.pointerId;
      this.leftoverDistance = 0;
      this.strokeStampCount = 0;
      this.stampsBuffer = [this.createStamp(point)];
      this.currentStroke = [point, point, point];
      this.canvas.setPointerCapture(event.pointerId);
    }

    handlePointerMove(event) {
      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      this.currentStroke.push(this.createPointerSample(event));
      this.processStamps();
    }

    handlePointerUp(event) {
      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const point = this.createPointerSample(event);

      this.currentStroke.push(point);
      this.processStamps();
      this.currentStroke.push(point);
      this.processStamps();
      this.flushStamps();
      this.bakeStroke();

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      console.log("Tratto chiuso. Stamps generati in totale:", this.strokeStampCount);
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.strokeStampCount = 0;
      this.isDrawing = false;
      this.activePointerId = null;
    }

    handlePointerCancel(event) {
      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.clearStrokeLayer();
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.strokeStampCount = 0;
      this.isDrawing = false;
      this.activePointerId = null;
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

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, this.viewportWidth, this.viewportHeight);
      gl.uniform2f(uniforms.documentSize, this.docWidth, this.docHeight);
      gl.uniform2f(uniforms.cameraPosition, this.camera.x, this.camera.y);
      gl.uniform1f(uniforms.cameraZoom, this.camera.zoom);
      gl.uniform1i(uniforms.texture, 0);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);

      // Pass 1: livello base consolidato a piena opacità.
      gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
      gl.uniform1f(uniforms.opacity, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: livello tratto attivo (solo durante il disegno) con opacità UI.
      if (this.isDrawing) {
        gl.bindTexture(gl.TEXTURE_2D, this.strokeTexture);
        gl.uniform1f(uniforms.opacity, this.getOpacity01());
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
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
      window.removeEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.fullscreenQuad) {
        gl.deleteBuffer(this.fullscreenQuad.buffer);
        gl.deleteVertexArray(this.fullscreenQuad.vao);
        this.fullscreenQuad = null;
      }

      if (this.brush) {
        gl.deleteBuffer(this.brush.instanceVBO);
        gl.deleteBuffer(this.brush.quadVBO);
        gl.deleteVertexArray(this.brush.vao);
        this.brush = null;
      }

      if (this.baseFBO) {
        gl.deleteFramebuffer(this.baseFBO);
        this.baseFBO = null;
      }

      if (this.baseTexture) {
        gl.deleteTexture(this.baseTexture);
        this.baseTexture = null;
      }

      if (this.strokeFBO) {
        gl.deleteFramebuffer(this.strokeFBO);
        this.strokeFBO = null;
      }

      if (this.strokeTexture) {
        gl.deleteTexture(this.strokeTexture);
        this.strokeTexture = null;
      }

      if (this.compositeProgramInfo?.program) {
        gl.deleteProgram(this.compositeProgramInfo.program);
        this.compositeProgramInfo = null;
      }

      if (this.brushProgramInfo?.program) {
        gl.deleteProgram(this.brushProgramInfo.program);
        this.brushProgramInfo = null;
      }

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }
    }
  }

  namespace.BrushEngine = BrushEngine;
})(window.CBO);
