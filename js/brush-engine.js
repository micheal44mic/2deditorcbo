window.CBO = window.CBO || {};

(function registerBrushEngine(namespace) {
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 32;
  const WHEEL_ZOOM_INTENSITY = 0.0015;
  const PINCH_ZOOM_INTENSITY = 0.01;

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

  const BRUSH_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 aInstancePos;
layout(location = 2) in float aInstancePressure;
layout(location = 3) in float aInstanceAlpha;
layout(location = 4) in float aInstanceSizeScale;
layout(location = 5) in float aInstanceRotation;
layout(location = 6) in vec3 aInstanceColor;

uniform vec2 u_docResolution;
uniform float u_brushSize;
uniform float u_minSizeRatio;
uniform vec2 u_shapeFlip;

out vec2 v_uv;
out float v_alpha;
out vec3 v_color;

void main() {
  // Min-size ratio evita che pressure=0 collassi lo stamp a 0px (problema con stylus).
  float pressure = clamp(aInstancePressure, 0.0, 1.0);
  float sizeFactor = mix(u_minSizeRatio, 1.0, pressure);
  // aInstanceSizeScale e' il moltiplicatore esterno dei dab (taper, ecc.):
  // bypassa il min-size ratio quindi puo' arrivare davvero a 0 (taper a punta).
  float scale = max(aInstanceSizeScale, 0.0);
  vec2 localPosition = a_position * u_shapeFlip;
  float angle = aInstanceRotation;
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotatedPosition = vec2(
    localPosition.x * c - localPosition.y * s,
    localPosition.x * s + localPosition.y * c
  );
  vec2 documentPosition = aInstancePos + rotatedPosition * u_brushSize * sizeFactor * scale;
  vec2 clipPosition = (documentPosition / u_docResolution) * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_uv = a_position + 0.5;
  v_alpha = clamp(aInstanceAlpha, 0.0, 1.0);
  v_color = aInstanceColor;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const BRUSH_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform float u_flow;
uniform float u_hardness;
uniform sampler2D u_shapeTexture;
uniform float u_useShapeTexture;

in vec2 v_uv;
in float v_alpha;
in vec3 v_color;

out vec4 outColor;

void main() {
  float shape = 1.0;

  if (u_useShapeTexture > 0.5) {
    shape = texture(u_shapeTexture, v_uv).a;
  } else {
    float distanceFromCenter = distance(v_uv, vec2(0.5));

    if (distanceFromCenter > 0.5) {
      discard;
    }

    // Hardness=1: bordo nitido (fade in 1 px AA). Hardness=0: gradiente radiale dal centro.
    float fw = max(fwidth(distanceFromCenter), 0.001);
    float edgeStart = mix(0.0, 0.5 - fw, clamp(u_hardness, 0.0, 1.0));
    shape = 1.0 - smoothstep(edgeStart, 0.5, distanceFromCenter);
  }

  if (shape <= 0.001) {
    discard;
  }

  float alpha = shape * v_alpha * clamp(u_flow, 0.0, 1.0);

  // Output strettamente pre-moltiplicato: necessario per MAX blending coerente.
  outColor = vec4(v_color * alpha, alpha);
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
    constructor(canvas, options = {}) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("BrushEngine richiede un HTMLCanvasElement.");
      }

      this.canvas = canvas;
      this.options = {
        getSettings: typeof options.getSettings === "function" ? options.getSettings : null,
        transparentBackground: options.transparentBackground === true,
        singleStrokeMode: options.singleStrokeMode === true,
        disableNavigation: options.disableNavigation === true,
        documentSizeCap: Number.isFinite(options.documentSizeCap) && options.documentSizeCap > 0
          ? Math.floor(options.documentSizeCap)
          : null,
      };
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
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
      this.strokeDynamicsState = null;
      this.strokeRandomState = { seed: 1 };
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
      this.strokeInitialSeed = 1;
      this.strokeShapeRotation = 0;
      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
      this.recordedStroke = [];
      this.lastRecordedStroke = [];
      this.isDrawing = false;
      this.activePointerId = null;
      this.isPanning = false;
      this.activePanPointerId = null;
      this.panLastViewportX = 0;
      this.panLastViewportY = 0;
      this.isSpaceHeld = false;
      this.userManipulatedCamera = false;
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
      this.shapeTexture = null;
      this.shapeTextureSource = "";
      this.shapeTextureReady = false;
      this.shapeTextureRequestId = 0;
      this.fullscreenQuad = null;

      this.handleResize = this.handleResize.bind(this);
      this.handleBrushSettingsChange = this.handleBrushSettingsChange.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleKeyUp = this.handleKeyUp.bind(this);
      this.renderLoop = this.renderLoop.bind(this);

      // Misuriamo prima il viewport: serve a calcolare il documento con il giusto aspect ratio.
      this.resizeViewport();
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
      this.syncShapeTextureFromState();
      this.centerCamera();
      this.observeViewportSize();
      this.bindBrushSettings();
      this.bindPointerEvents();
      this.bindNavigationEvents();
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
      const optionCap = this.options.documentSizeCap;
      const effectiveCap = optionCap ? Math.min(policyCap, optionCap) : policyCap;
      const cap = Math.max(1, Math.min(effectiveCap, hardwareCap));
      const aspect =
        this.viewportWidth > 0 && this.viewportHeight > 0
          ? this.viewportWidth / this.viewportHeight
          : 1;

      let docWidth;
      let docHeight;

      // Lato lungo al cap VRAM, lato corto derivato dall'aspect del viewport:
      // il documento riempie l'intera area visibile senza bande nere.
      if (aspect >= 1) {
        docWidth = cap;
        docHeight = Math.max(1, Math.round(cap / aspect));
      } else {
        docHeight = cap;
        docWidth = Math.max(1, Math.round(cap * aspect));
      }

      this.docWidth = docWidth;
      this.docHeight = docHeight;
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
      const zoom = Math.max(
        0.0001,
        Math.min(this.viewportWidth / this.docWidth, this.viewportHeight / this.docHeight),
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
          gridMode: gl.getUniformLocation(program, "u_gridMode"),
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
          minSizeRatio: gl.getUniformLocation(program, "u_minSizeRatio"),
          shapeFlip: gl.getUniformLocation(program, "u_shapeFlip"),
          flow: gl.getUniformLocation(program, "u_flow"),
          hardness: gl.getUniformLocation(program, "u_hardness"),
          shapeTexture: gl.getUniformLocation(program, "u_shapeTexture"),
          useShapeTexture: gl.getUniformLocation(program, "u_useShapeTexture"),
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
      // MAG = NEAREST: zoomando in si vedono i pixel quadrati come in Photoshop / Procreate.
      // MIN = LINEAR: zoom out resta liscio senza moir\u00e9.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
      // Sfondo trasparente per la modalità preview, bianco solido per il canvas principale.
      if (this.options.transparentBackground) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
      }
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
      // Stesso schema del baseFBO: pixel netti in zoom in, smooth in zoom out.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
      // Instance stride 36 byte: pos (xy) + pressure + alphaScale + sizeScale + rotation + color (rgb).
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 36, 8);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 12);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 36, 16);
      gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 36, 20);
      gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 36, 24);
      gl.vertexAttribDivisor(6, 1);

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
      if (this.resizeViewport() && !this.userManipulatedCamera) {
        this.centerCamera();
      }
    }

    bindBrushSettings() {
      // Quando un getSettings esplicito è fornito (es. preview pad), non ascoltiamo l'evento globale:
      // il chiamante usa setBrushState() per pilotare l'engine senza inquinare il brush principale.
      if (this.options.getSettings) {
        return;
      }

      window.addEventListener("cbo:brush-settings-change", this.handleBrushSettingsChange);
    }

    handleBrushSettingsChange() {
      this.brushState = { ...(this.readBrushSettingsSource() || {}) };
      this.syncShapeTextureFromState();
    }

    readBrushSettingsSource() {
      if (this.options.getSettings) {
        return this.options.getSettings();
      }

      return namespace.brushSettings;
    }

    setBrushState(settings) {
      this.brushState = { ...(settings || {}) };
      this.syncShapeTextureFromState();
    }

    getShapeTextureSource() {
      const source = this.brushState?.shapeAlphaSrc;

      return typeof source === "string" && source.trim() ? source : "";
    }

    syncShapeTextureFromState() {
      const source = this.getShapeTextureSource();

      if (source === this.shapeTextureSource) {
        return;
      }

      this.shapeTextureSource = source;
      this.shapeTextureReady = false;
      this.shapeTextureRequestId += 1;

      if (!source) {
        return;
      }

      const requestId = this.shapeTextureRequestId;
      const image = new Image();

      image.onload = () => {
        if (this.isDisposed || requestId !== this.shapeTextureRequestId) {
          return;
        }

        this.uploadShapeTexture(image);
      };
      image.onerror = () => {
        if (requestId === this.shapeTextureRequestId) {
          this.shapeTextureReady = false;
        }
      };
      image.src = source;
    }

    uploadShapeTexture(image) {
      const gl = this.gl;

      if (!this.shapeTexture) {
        this.shapeTexture = gl.createTexture();
      }

      if (!this.shapeTexture) {
        this.shapeTextureReady = false;
        return;
      }

      gl.bindTexture(gl.TEXTURE_2D, this.shapeTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.shapeTextureReady = true;

      if (this.options.singleStrokeMode && !this.isDrawing && this.lastRecordedStroke.length > 0) {
        this.replayLastStroke();
      }
    }

    bindPointerEvents() {
      this.canvas.style.touchAction = "none";
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    }

    bindNavigationEvents() {
      if (this.options.disableNavigation) {
        return;
      }

      this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("keyup", this.handleKeyUp);
    }

    handleWheel(event) {
      event.preventDefault();

      let deltaY = event.deltaY;

      if (event.deltaMode === 1) {
        deltaY *= 16;
      } else if (event.deltaMode === 2) {
        deltaY *= window.innerHeight || 800;
      }

      const intensity = event.ctrlKey ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY;
      const factor = Math.exp(-deltaY * intensity);

      this.zoomAtClient(event.clientX, event.clientY, factor);
    }

    zoomAtClient(clientX, clientY, factor) {
      if (!Number.isFinite(factor) || factor <= 0) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const cursorViewportX = (clientX - rect.left) * this.dpr;
      const cursorViewportY = (clientY - rect.top) * this.dpr;
      const oldZoom = this.camera.zoom;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

      if (newZoom === oldZoom) {
        return;
      }

      // Mantieni fermo il punto del documento sotto il cursore (anchor zoom).
      const docX = (cursorViewportX - this.camera.x) / oldZoom;
      const docY = (cursorViewportY - this.camera.y) / oldZoom;

      this.camera.zoom = newZoom;
      this.camera.x = cursorViewportX - docX * newZoom;
      this.camera.y = cursorViewportY - docY * newZoom;
      this.userManipulatedCamera = true;
    }

    beginPan(event) {
      this.isPanning = true;
      this.activePanPointerId = event.pointerId;
      this.panLastViewportX = event.clientX * this.dpr;
      this.panLastViewportY = event.clientY * this.dpr;

      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Alcuni browser rifiutano la capture su pointer non principali; il pan funziona comunque.
      }

      this.updateCursor();
    }

    updatePan(event) {
      const currentX = event.clientX * this.dpr;
      const currentY = event.clientY * this.dpr;

      this.camera.x += currentX - this.panLastViewportX;
      this.camera.y += currentY - this.panLastViewportY;
      this.panLastViewportX = currentX;
      this.panLastViewportY = currentY;
      this.userManipulatedCamera = true;
    }

    endPan(event) {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.isPanning = false;
      this.activePanPointerId = null;
      this.updateCursor();
    }

    handleKeyDown(event) {
      if (event.code !== "Space" || this.isSpaceHeld || this.isInputFocused()) {
        return;
      }

      this.isSpaceHeld = true;
      event.preventDefault();
      this.updateCursor();
    }

    handleKeyUp(event) {
      if (event.code !== "Space" || !this.isSpaceHeld) {
        return;
      }

      this.isSpaceHeld = false;
      this.updateCursor();
    }

    isInputFocused() {
      const element = document.activeElement;

      if (!element || element === document.body) {
        return false;
      }

      const tag = element.tagName;

      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
    }

    updateCursor() {
      if (this.isPanning) {
        this.canvas.style.cursor = "grabbing";
      } else if (this.isSpaceHeld) {
        this.canvas.style.cursor = "grab";
      } else {
        this.canvas.style.cursor = "";
      }
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

    createSeededUnit(seed) {
      const nextSeed = (Math.imul((seed || 1) >>> 0, 1664525) + 1013904223) >>> 0;

      return nextSeed / 4294967296;
    }

    createStrokeSeed(point) {
      return (
        Date.now() ^
        Math.round(point.x * 1000) ^
        Math.round(point.y * 1000) ^
        0x85ebca6b
      ) >>> 0;
    }

    beginStrokeDynamics(sample) {
      const StrokeMath = namespace.StrokeMath;
      const point = { x: sample.x, y: sample.y };
      const seed = (sample.strokeSeed ?? this.createStrokeSeed(point) ?? 1) >>> 0;
      const pressure = StrokeMath?.normalizePressure
        ? StrokeMath.normalizePressure(sample.pressure)
        : sample.pressure;

      sample.strokeSeed = seed;
      this.strokeRandomState = { seed };
      this.strokeInitialSeed = seed;
      this.initializeStrokeColorDynamics(seed);
      this.initializeWetMixRandom(seed);
      this.strokeShapeRotation = this.brushState.shapeRandomized === true
        ? (this.createSeededUnit(seed ^ 0x9e3779b9) * 2 - 1) * Math.PI
        : 0;
      this.strokeDynamicsState = StrokeMath?.createStrokeState
        ? StrokeMath.createStrokeState(point, {
            pressure,
            seed,
            tool: "brush",
          })
        : null;

      return {
        ...sample,
        pressure,
      };
    }

    processPointerSample(event) {
      return this.applyStabilization(this.createPointerSample(event));
    }

    applyStabilization(rawSample) {
      const StrokeMath = namespace.StrokeMath;

      if (!this.strokeDynamicsState || !StrokeMath?.processStrokeInput) {
        return rawSample;
      }

      const processed = StrokeMath.processStrokeInput(
        { x: rawSample.x, y: rawSample.y },
        this.strokeDynamicsState,
        this.brushState,
        rawSample.pressure,
      );

      return {
        ...rawSample,
        x: processed.point.x,
        y: processed.point.y,
        pressure: processed.pressure,
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

    getColorDynamicsAmount(key) {
      const value = this.brushState?.[key] ?? namespace.brushSettings?.[key] ?? 0;

      return this.clamp01(value);
    }

    getColorJitterAmounts(prefix) {
      return {
        hue: this.getColorDynamicsAmount(`${prefix}ColorHueJitter`),
        saturation: this.getColorDynamicsAmount(`${prefix}ColorSaturationJitter`),
        lightness: this.getColorDynamicsAmount(`${prefix}ColorLightnessJitter`),
        darkness: this.getColorDynamicsAmount(`${prefix}ColorDarknessJitter`),
        secondary: this.getColorDynamicsAmount(`${prefix}ColorSecondaryJitter`),
      };
    }

    hasColorJitter(amounts) {
      return (
        amounts.hue > 0 ||
        amounts.saturation > 0 ||
        amounts.lightness > 0 ||
        amounts.darkness > 0 ||
        amounts.secondary > 0
      );
    }

    getPrimaryColorRgb() {
      return this.parseColorToRgb01(this.brushState?.color ?? namespace.selectedColor ?? "#000000");
    }

    getSecondaryColorRgb() {
      return this.parseColorToRgb01(namespace.selectedColors?.secondary ?? this.brushState?.secondaryColor ?? "#000000");
    }

    nextColorRandom() {
      const state = this.strokeColorRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeColorRandomState = state;

      return state.seed / 4294967296;
    }

    initializeWetMixRandom(seed) {
      const wetSeed = ((((seed || 1) >>> 0) ^ 0xa24baed5) >>> 0) || 1;

      this.strokeWetRandomState = { seed: wetSeed };
    }

    nextWetRandom() {
      const state = this.strokeWetRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeWetRandomState = state;

      return state.seed / 4294967296;
    }

    randomColorSigned() {
      return this.nextColorRandom() * 2 - 1;
    }

    wrapHue(hue) {
      return ((hue % 360) + 360) % 360;
    }

    rgbToHsl(rgb) {
      const red = this.clamp01(rgb?.[0]);
      const green = this.clamp01(rgb?.[1]);
      const blue = this.clamp01(rgb?.[2]);
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const lightness = (max + min) * 0.5;
      const delta = max - min;
      let hue = 0;
      let saturation = 0;

      if (delta > 0) {
        saturation = lightness > 0.5
          ? delta / (2 - max - min)
          : delta / (max + min);

        if (max === red) {
          hue = (green - blue) / delta + (green < blue ? 6 : 0);
        } else if (max === green) {
          hue = (blue - red) / delta + 2;
        } else {
          hue = (red - green) / delta + 4;
        }

        hue *= 60;
      }

      return {
        h: hue,
        s: saturation,
        l: lightness,
      };
    }

    hueToRgb(p, q, t) {
      let nextT = t;

      if (nextT < 0) {
        nextT += 1;
      }

      if (nextT > 1) {
        nextT -= 1;
      }

      if (nextT < 1 / 6) {
        return p + (q - p) * 6 * nextT;
      }

      if (nextT < 1 / 2) {
        return q;
      }

      if (nextT < 2 / 3) {
        return p + (q - p) * (2 / 3 - nextT) * 6;
      }

      return p;
    }

    hslToRgb(hsl) {
      const hue = this.wrapHue(hsl?.h ?? 0) / 360;
      const saturation = this.clamp01(hsl?.s);
      const lightness = this.clamp01(hsl?.l);

      if (saturation <= 0) {
        return [lightness, lightness, lightness];
      }

      const q = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
      const p = 2 * lightness - q;

      return [
        this.hueToRgb(p, q, hue + 1 / 3),
        this.hueToRgb(p, q, hue),
        this.hueToRgb(p, q, hue - 1 / 3),
      ];
    }

    mixRgb(from, to, t) {
      const amount = this.clamp01(t);

      return [
        this.lerp(this.clamp01(from?.[0]), this.clamp01(to?.[0]), amount),
        this.lerp(this.clamp01(from?.[1]), this.clamp01(to?.[1]), amount),
        this.lerp(this.clamp01(from?.[2]), this.clamp01(to?.[2]), amount),
      ];
    }

    applyColorJitter(baseRgb, amounts, secondaryRgb) {
      const hsl = this.rgbToHsl(baseRgb);

      if (amounts.hue > 0) {
        hsl.h = this.wrapHue(hsl.h + this.randomColorSigned() * 180 * amounts.hue);
      }

      if (amounts.saturation > 0) {
        hsl.s = this.lerp(hsl.s, this.nextColorRandom(), amounts.saturation);
      }

      if (amounts.lightness > 0) {
        hsl.l = this.lerp(hsl.l, 1, this.nextColorRandom() * amounts.lightness);
      }

      if (amounts.darkness > 0) {
        hsl.l = this.lerp(hsl.l, 0, this.nextColorRandom() * amounts.darkness);
      }

      hsl.s = this.clamp01(hsl.s);
      hsl.l = this.clamp01(hsl.l);

      const rgb = this.hslToRgb(hsl);

      if (amounts.secondary <= 0) {
        return rgb;
      }

      return this.mixRgb(rgb, secondaryRgb, this.nextColorRandom() * amounts.secondary);
    }

    initializeStrokeColorDynamics(seed) {
      const colorSeed = (((seed || 1) >>> 0) ^ 0x6c8e9cf5) >>> 0;
      const primaryRgb = this.getPrimaryColorRgb();
      const secondaryRgb = this.getSecondaryColorRgb();
      const strokeAmounts = this.getColorJitterAmounts("stroke");
      const stampAmounts = this.getColorJitterAmounts("stamp");
      const hasStrokeJitter = this.hasColorJitter(strokeAmounts);
      const hasStampJitter = this.hasColorJitter(stampAmounts);

      this.strokeColorRandomState = { seed: colorSeed || 1 };
      this.strokeColorState = {
        secondaryRgb,
        stampAmounts,
        hasStampJitter,
        strokeBaseColorRgb: hasStrokeJitter
          ? this.applyColorJitter(primaryRgb, strokeAmounts, secondaryRgb)
          : primaryRgb,
      };
    }

    getCurrentStrokeColorRgb() {
      return this.strokeColorState?.strokeBaseColorRgb || this.getPrimaryColorRgb();
    }

    getNextStampColorRgb() {
      if (!this.strokeColorState) {
        return this.getPrimaryColorRgb();
      }

      if (!this.strokeColorState.hasStampJitter) {
        return this.strokeColorState.strokeBaseColorRgb;
      }

      return this.applyColorJitter(
        this.strokeColorState.strokeBaseColorRgb,
        this.strokeColorState.stampAmounts,
        this.strokeColorState.secondaryRgb,
      );
    }

    getOpacity01() {
      const value = Number(this.brushState.opacity);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    getMinSizeRatio() {
      const value = Number(this.brushState.minSizeRatio);

      if (!Number.isFinite(value)) {
        return 0.15;
      }

      return Math.max(0, Math.min(1, value));
    }

    getFlow() {
      const value = Number(this.brushState.flow);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    getHardness() {
      const value = Number(this.brushState.hardness);

      if (!Number.isFinite(value)) {
        return 1.0;
      }

      return Math.max(0, Math.min(1, value));
    }

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }

    clamp01(value) {
      return this.clamp(value, 0, 1);
    }

    nextRandom() {
      const state = this.strokeRandomState || { seed: 1 };

      state.seed = (Math.imul(state.seed || 1, 1664525) + 1013904223) >>> 0;
      this.strokeRandomState = state;

      return state.seed / 4294967296;
    }

    randomSigned() {
      return this.nextRandom() * 2 - 1;
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

    createStamp(point, alphaScale = 1) {
      return {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        alphaScale,
        sizeScale: 1,
        rotation: 0,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
      };
    }

    lerpStamp(from, to, t) {
      return {
        x: this.lerp(from.x, to.x, t),
        y: this.lerp(from.y, to.y, t),
        pressure: this.lerp(from.pressure, to.pressure, t),
        alphaScale: this.lerp(from.alphaScale ?? 1, to.alphaScale ?? 1, t),
        sizeScale: this.lerp(from.sizeScale ?? 1, to.sizeScale ?? 1, t),
        rotation: this.lerp(from.rotation ?? 0, to.rotation ?? 0, t),
        tiltX: this.lerp(from.tiltX, to.tiltX, t),
        tiltY: this.lerp(from.tiltY, to.tiltY, t),
      };
    }

    applyTaperToStamp(stamp) {
      // Il taper si applica solo nel pass di "rigenerazione" post-stroke,
      // quando la lunghezza totale del tratto e' nota. In live drawing sta a null.
      if (this.strokeTotalLength == null) {
        return;
      }

      const StrokeMath = namespace.StrokeMath;
      const factor =
        StrokeMath?.getTaperFactor != null
          ? StrokeMath.getTaperFactor(this.strokeDistance, this.strokeTotalLength, this.brushState)
          : 1;

      if (factor >= 1) {
        return;
      }

      const taperSize = this.clamp01(this.brushState.taperSize ?? 1);
      const taperOpacity = this.clamp01(this.brushState.taperOpacity ?? 0);
      const taperPressure = this.clamp01(this.brushState.taperPressure ?? 0);
      // taperSize 1 -> il taper porta il dab a sparire; 0 -> nessun effetto sulla size.
      const sizeContribution = this.lerp(1 - taperSize, 1, factor);
      const opacityContribution = this.lerp(1 - taperOpacity, 1, factor);
      const pressureContribution = this.lerp(1 - taperPressure, 1, factor);

      stamp.pressure = (stamp.pressure ?? 1) * pressureContribution;
      stamp.sizeScale = (stamp.sizeScale ?? 1) * sizeContribution;
      stamp.alphaScale = (stamp.alphaScale ?? 1) * opacityContribution;
    }

    isTaperActive() {
      const taperStart = this.clamp01(this.brushState.taperStart);
      const taperEnd = this.clamp01(this.brushState.taperEnd);
      const taperSize = this.clamp01(this.brushState.taperSize ?? 1);
      const taperOpacity = this.clamp01(this.brushState.taperOpacity ?? 0);
      const taperPressure = this.clamp01(this.brushState.taperPressure ?? 0);

      return (taperStart > 0 || taperEnd > 0) && (taperSize > 0 || taperOpacity > 0 || taperPressure > 0);
    }

    getBrushSize() {
      const radius = Number(this.brushState.radius);

      if (Number.isFinite(radius) && radius > 0) {
        return radius * 2;
      }

      const size = Number(this.brushState.size);

      if (Number.isFinite(size) && size > 0) {
        return size;
      }

      return 40;
    }

    getStampSpacing(sizeScale = 1) {
      const brushSize = this.getBrushSize();
      const spacingFraction = Number(this.brushState.spacing);
      const safeSpacing = Number.isFinite(spacingFraction)
        ? this.clamp(spacingFraction, 0, 1)
        : 0.1;
      const spacingJitter = this.clamp01(this.brushState.spacingJitter);
      const effectiveSizeScale = this.clamp(sizeScale, 0.05, 1);
      const baseSpacing = Math.max(0.5, brushSize * effectiveSizeScale * safeSpacing);
      const jitterAmount = baseSpacing * spacingJitter * 0.85;
      const spacing = Math.max(0.5, baseSpacing + this.randomSigned() * jitterAmount);

      if (this.taperSpacingCap != null) {
        return Math.min(spacing, this.taperSpacingCap);
      }

      return spacing;
    }

    getCurrentStrokePathLength() {
      return Math.max(0, this.strokeDistance + this.leftoverDistance);
    }

    getTaperMinDistance() {
      if (this.brushState.taperMinDistanceEnabled !== true) {
        return 247;
      }

      const minDistance = Number(this.brushState.taperMinDistance);

      if (!Number.isFinite(minDistance) || minDistance <= 0) {
        return 247;
      }

      return this.clamp(minDistance, 0, 1000);
    }

    getTaperSpacingCap(totalLength) {
      const safeLength = Number(totalLength);

      if (!Number.isFinite(safeLength) || safeLength <= 0) {
        return null;
      }

      // Durante la rigenerazione taper i tratti molto corti hanno bisogno di
      // abbastanza dab per descrivere la percentuale della traccia, non un solo cerchio.
      return Math.max(0.5, safeLength / 12);
    }

    getFallOffScale() {
      const fallOff = this.clamp01(this.brushState.fallOff);

      if (fallOff <= 0) {
        return 1;
      }

      const radius = Math.max(0.5, this.getBrushSize() * 0.5);
      const fadeDistance = Math.max(radius * 2, radius * (96 - fallOff * 88));

      return this.clamp(1 - this.strokeDistance / fadeDistance, 0, 1);
    }

    getWetMixAlphaScale() {
      const dilution = this.clamp01(this.brushState.wetDilution);
      const charge = this.clamp01(this.brushState.wetCharge ?? 1);
      const attack = this.clamp01(this.brushState.wetAttack ?? 1);
      const jitter = this.clamp01(this.brushState.wetnessJitter);
      const dilutionScale = this.lerp(1, 0.18, dilution);
      const attackScale = this.lerp(0.12, 1, attack);
      let chargeScale = 1;

      if (charge < 1) {
        const radius = Math.max(0.5, this.getBrushSize() * 0.5);
        const initialLoad = Math.sqrt(charge);
        const depletionDistance = radius * this.lerp(4, 96, charge);

        chargeScale = initialLoad * this.clamp01(1 - this.strokeDistance / depletionDistance);
      }

      let alpha = dilutionScale * attackScale * chargeScale;

      if (jitter > 0) {
        alpha *= this.lerp(1 - jitter * 0.55, 1 + jitter * 0.35, this.nextWetRandom());
      }

      return this.clamp01(alpha);
    }

    getStampAlphaScale() {
      return this.getFallOffScale() * this.getWetMixAlphaScale();
    }

    clampStampToDocument(stamp) {
      return {
        ...stamp,
        x: this.clamp(stamp.x, 0, this.docWidth),
        y: this.clamp(stamp.y, 0, this.docHeight),
      };
    }

    applyStampJitter(stamp, tangent) {
      const radius = Math.max(0.5, this.getBrushSize() * 0.5);
      const lateral = this.clamp(this.brushState.jitterLateral, 0, 2) * radius;
      const linear = this.clamp(this.brushState.jitterLinear, 0, 2) * radius;

      if (lateral <= 0 && linear <= 0) {
        return this.clampStampToDocument(stamp);
      }

      const lateralOffset = this.randomSigned() * lateral;
      const linearOffset = this.randomSigned() * linear;
      const perpendicular = {
        x: -tangent.y,
        y: tangent.x,
      };

      return this.clampStampToDocument({
        ...stamp,
        x: stamp.x + perpendicular.x * lateralOffset + tangent.x * linearOffset,
        y: stamp.y + perpendicular.y * lateralOffset + tangent.y * linearOffset,
      });
    }

    getShapeRotation() {
      return this.clamp(this.brushState.shapeRotation, -1, 1);
    }

    getShapeScatter() {
      return this.clamp(this.brushState.shapeScatter, 0, 2);
    }

    getShapeCount() {
      return this.clamp(Math.round(Number(this.brushState.shapeCount) || 1), 1, 16);
    }

    getShapeCountJitter() {
      return this.clamp01(this.brushState.shapeCountJitter);
    }

    getShapeFlipXSign() {
      return this.brushState.shapeFlipX === true ? -1 : 1;
    }

    getShapeFlipYSign() {
      return this.brushState.shapeFlipY === true ? -1 : 1;
    }

    getEffectiveShapeCount() {
      const count = this.getShapeCount();
      const jitter = this.getShapeCountJitter();

      if (jitter <= 0 || count <= 1) {
        return count;
      }

      const minCount = Math.max(1, Math.ceil(count * (1 - jitter)));

      if (minCount >= count) {
        return count;
      }

      return minCount + Math.floor(this.nextRandom() * (count - minCount + 1));
    }

    getShapeDirectionalRotation(tangent) {
      const rotationFollow = this.getShapeRotation();

      if (rotationFollow === 0 || !tangent || (tangent.x === 0 && tangent.y === 0)) {
        return this.strokeShapeRotation;
      }

      return this.strokeShapeRotation + Math.atan2(tangent.y, tangent.x) * rotationFollow;
    }

    getShapeScatterRotation() {
      const scatter = this.getShapeScatter();

      if (scatter <= 0) {
        return 0;
      }

      return this.randomSigned() * Math.PI * scatter;
    }

    pushShapeStamps(baseStamp, tangent) {
      const effectiveCount = this.getEffectiveShapeCount();
      const directionalRotation = this.getShapeDirectionalRotation(tangent);

      if (effectiveCount === 1) {
        baseStamp.rotation = directionalRotation + this.getShapeScatterRotation();
        baseStamp.colorRgb = this.getNextStampColorRgb();
        this.stampsBuffer.push(baseStamp);
        return;
      }

      for (let index = 0; index < effectiveCount; index += 1) {
        this.stampsBuffer.push({
          x: baseStamp.x,
          y: baseStamp.y,
          pressure: baseStamp.pressure,
          alphaScale: baseStamp.alphaScale,
          sizeScale: baseStamp.sizeScale,
          rotation: directionalRotation + this.getShapeScatterRotation(),
          tiltX: baseStamp.tiltX,
          tiltY: baseStamp.tiltY,
          colorRgb: this.getNextStampColorRgb(),
        });
      }
    }

    processStamps() {
      if (this.currentStroke.length !== 4) {
        return;
      }

      const [p0, p1, p2, p3] = this.currentStroke;
      const segmentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const sampleCount = Math.max(8, Math.min(128, Math.ceil(segmentDistance / 4)));
      let previousPoint = this.catmullRom(p0, p1, p2, p3, 0);

      for (let index = 1; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const point = this.catmullRom(p0, p1, p2, p3, t);
        const stepDistance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);

        if (stepDistance > 0) {
          this.leftoverDistance += stepDistance;

          while (this.leftoverDistance >= this.nextStampDistance) {
            const stampDistance = this.nextStampDistance;
            const overshoot = this.leftoverDistance - stampDistance;
            const distanceFromPrevious = stepDistance - overshoot;
            const stampT = Math.max(0, Math.min(1, distanceFromPrevious / stepDistance));
            const tangent = {
              x: (point.x - previousPoint.x) / stepDistance,
              y: (point.y - previousPoint.y) / stepDistance,
            };
            const stamp = this.applyStampJitter(this.lerpStamp(previousPoint, point, stampT), tangent);

            this.strokeDistance += stampDistance;
            stamp.alphaScale = this.getStampAlphaScale();
            stamp.sizeScale = 1;
            this.applyTaperToStamp(stamp);
            this.pushShapeStamps(stamp, tangent);
            this.leftoverDistance -= stampDistance;
            this.nextStampDistance = this.getStampSpacing(stamp.sizeScale);
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
      // 9 float per istanza: x, y, pressure, alphaScale, sizeScale, rotation, color rgb.
      const instanceData = new Float32Array(stampCount * 9);
      const brushSize = this.getBrushSize();
      const fallbackColor = this.getCurrentStrokeColorRgb();
      const useShapeTexture = this.shapeTextureReady && this.shapeTexture ? 1 : 0;

      for (let index = 0; index < stampCount; index += 1) {
        const stamp = this.stampsBuffer[index];
        const offset = index * 9;
        const color = stamp.colorRgb || fallbackColor;

        instanceData[offset] = stamp.x;
        instanceData[offset + 1] = stamp.y;
        instanceData[offset + 2] = stamp.pressure;
        instanceData[offset + 3] = stamp.alphaScale ?? 1;
        instanceData[offset + 4] = stamp.sizeScale ?? 1;
        instanceData[offset + 5] = stamp.rotation ?? 0;
        instanceData[offset + 6] = color[0];
        instanceData[offset + 7] = color[1];
        instanceData[offset + 8] = color[2];
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
      gl.uniform1f(this.brushProgramInfo.uniforms.minSizeRatio, this.getMinSizeRatio());
      gl.uniform2f(this.brushProgramInfo.uniforms.shapeFlip, this.getShapeFlipXSign(), this.getShapeFlipYSign());
      gl.uniform1f(this.brushProgramInfo.uniforms.flow, this.getFlow());
      gl.uniform1f(this.brushProgramInfo.uniforms.hardness, this.getHardness());
      gl.uniform1f(this.brushProgramInfo.uniforms.useShapeTexture, useShapeTexture);
      gl.uniform1i(this.brushProgramInfo.uniforms.shapeTexture, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, useShapeTexture ? this.shapeTexture : null);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(this.brush.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brush.instanceVBO);
      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stampCount);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
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

    clearAllLayers() {
      const gl = this.gl;

      // Base layer: bianco solido o trasparente in base alla modalità.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFBO);
      gl.viewport(0, 0, this.docWidth, this.docHeight);

      if (this.options.transparentBackground) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.clearStrokeLayer();
    }

    resetStrokeProgress() {
      this.currentStroke = [];
      this.stampsBuffer = [];
      this.leftoverDistance = 0;
      this.nextStampDistance = 1;
      this.strokeDistance = 0;
      this.strokeStampCount = 0;
    }

    resetStrokeRuntimeState() {
      this.resetStrokeProgress();
      this.strokeDynamicsState = null;
      this.strokeColorRandomState = null;
      this.strokeColorState = null;
      this.strokeWetRandomState = null;
    }

    replayLastStroke() {
      if (!this.lastRecordedStroke || this.lastRecordedStroke.length === 0) {
        return;
      }

      this.replayStroke(this.lastRecordedStroke);
    }

    pushForcedTaperStamp(point, distanceFromStart) {
      if (!point || this.strokeTotalLength == null) {
        return;
      }

      this.strokeDistance = this.clamp(distanceFromStart, 0, this.strokeTotalLength);

      const stamp = this.clampStampToDocument(this.createStamp(point));

      stamp.alphaScale = this.getStampAlphaScale();
      stamp.sizeScale = 1;
      this.applyTaperToStamp(stamp);
      this.pushShapeStamps(stamp, null);
    }

    regenerateStrokeWithTaper(rawSamples, totalLength) {
      // Re-emette gli stamp del tratto su strokeFBO con il taper completo (start + end).
      // NON tocca il base layer: chiamato durante pointerup PRIMA del bake.
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || totalLength <= 0) {
        return;
      }

      const StrokeMath = namespace.StrokeMath;
      const firstSample = rawSamples[0];
      const point = { x: firstSample.x, y: firstSample.y };
      const pressure = StrokeMath?.normalizePressure
        ? StrokeMath.normalizePressure(firstSample.pressure)
        : firstSample.pressure;
      const startPoint = { ...firstSample, pressure };

      // Riusiamo il seed iniziale dello stroke originale per riprodurre l'identica
      // sequenza di jitter spaziale (lateral/linear/spacing) e colore.
      this.clearStrokeLayer();
      this.strokeRandomState = { seed: this.strokeInitialSeed };
      this.initializeStrokeColorDynamics(this.strokeInitialSeed);
      this.initializeWetMixRandom(this.strokeInitialSeed);
      this.strokeDynamicsState = StrokeMath?.createStrokeState
        ? StrokeMath.createStrokeState(point, {
            pressure,
            seed: this.strokeInitialSeed,
            tool: "brush",
          })
        : null;

      this.strokeTotalLength = totalLength;
      this.taperSpacingCap = this.getTaperSpacingCap(totalLength);
      this.resetStrokeProgress();
      const startStamp = this.createStamp(startPoint);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.applyTaperToStamp(startStamp);
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing(startStamp.sizeScale);
      this.currentStroke = [startPoint, startPoint, startPoint];

      for (let index = 1; index < rawSamples.length - 1; index += 1) {
        const stableSample = this.applyStabilization(rawSamples[index]);

        this.currentStroke.push(stableSample);
        this.processStamps();
      }

      const lastRaw = rawSamples[rawSamples.length - 1];
      const lastPoint = rawSamples.length > 1 ? this.applyStabilization(lastRaw) : startPoint;

      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.pushForcedTaperStamp(lastPoint, totalLength);
      this.flushStamps();

      this.strokeTotalLength = null;
      this.taperSpacingCap = null;
    }

    replayStroke(rawSamples) {
      if (!Array.isArray(rawSamples) || rawSamples.length === 0 || this.isDrawing) {
        return;
      }

      this.clearAllLayers();

      const firstSample = rawSamples[0];
      const startPoint = this.beginStrokeDynamics(firstSample);

      this.isDrawing = true;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(startPoint);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing();
      this.currentStroke = [startPoint, startPoint, startPoint];

      // Replay degli intermedi (escluso ultimo: lo trattiamo come pointer-up).
      for (let index = 1; index < rawSamples.length - 1; index += 1) {
        const stableSample = this.applyStabilization(rawSamples[index]);

        this.currentStroke.push(stableSample);
        this.processStamps();
      }

      const lastRaw = rawSamples[rawSamples.length - 1];
      const lastPoint = rawSamples.length > 1 ? this.applyStabilization(lastRaw) : startPoint;

      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.currentStroke.push(lastPoint);
      this.processStamps();
      this.flushStamps();

      if (this.isTaperActive() && rawSamples.length > 1) {
        this.regenerateStrokeWithTaper(rawSamples, this.getCurrentStrokePathLength());
      }

      this.bakeStroke();

      this.resetStrokeRuntimeState();
      this.isDrawing = false;
    }

    handlePointerDown(event) {
      const isPanTrigger = event.button === 1 || (event.button === 0 && this.isSpaceHeld);

      if (isPanTrigger) {
        if (this.isDrawing || this.isPanning) {
          return;
        }

        event.preventDefault();
        this.beginPan(event);
        return;
      }

      if (event.button !== 0 || this.isDrawing || this.isPanning) {
        return;
      }

      event.preventDefault();

      // Modalità preview: ogni nuovo tratto resetta la canvas (utile nella drawing pad).
      if (this.options.singleStrokeMode) {
        this.clearAllLayers();
      }

      const rawSample = this.createPointerSample(event);

      this.recordedStroke = [rawSample];

      const point = this.beginStrokeDynamics(rawSample);

      this.isDrawing = true;
      this.activePointerId = event.pointerId;
      this.resetStrokeProgress();
      const startStamp = this.createStamp(point);

      startStamp.alphaScale = this.getStampAlphaScale();
      startStamp.sizeScale = 1;
      this.pushShapeStamps(startStamp, null);
      this.nextStampDistance = this.getStampSpacing();
      this.currentStroke = [point, point, point];
      this.canvas.setPointerCapture(event.pointerId);
    }

    handlePointerMove(event) {
      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.updatePan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const rawSample = this.createPointerSample(event);

      this.recordedStroke.push(rawSample);
      this.currentStroke.push(this.applyStabilization(rawSample));
      this.processStamps();
    }

    handlePointerUp(event) {
      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        event.preventDefault();
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const rawSample = this.createPointerSample(event);

      this.recordedStroke.push(rawSample);

      const point = this.applyStabilization(rawSample);

      this.currentStroke.push(point);
      this.processStamps();
      this.currentStroke.push(point);
      this.processStamps();
      this.flushStamps();

      // Taper: rifaccio l'intero tratto in strokeFBO conoscendo la lunghezza totale,
      // cosi' posso modulare size+opacity ai due estremi. Solo dopo bake.
      if (this.isTaperActive() && this.recordedStroke.length > 1) {
        this.regenerateStrokeWithTaper(this.recordedStroke, this.getCurrentStrokePathLength());
      }

      this.bakeStroke();

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.lastRecordedStroke = this.recordedStroke.slice();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
      this.isDrawing = false;
      this.activePointerId = null;
    }

    handlePointerCancel(event) {
      if (this.isPanning && this.activePanPointerId === event.pointerId) {
        this.endPan(event);
        return;
      }

      if (!this.isDrawing || this.activePointerId !== event.pointerId) {
        return;
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.clearStrokeLayer();
      this.recordedStroke = [];
      this.resetStrokeRuntimeState();
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

      if (this.resizeViewport() && !this.userManipulatedCamera) {
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
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
      gl.uniform1f(uniforms.opacity, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: livello tratto attivo (solo durante il disegno) con opacità UI.
      if (this.isDrawing) {
        gl.bindTexture(gl.TEXTURE_2D, this.strokeTexture);
        gl.uniform1f(uniforms.opacity, this.getOpacity01());
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // Pass 3: griglia pixel sopra tutto. Lo shader la attiva solo a zoom alto.
      gl.uniform1f(uniforms.gridMode, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
      this.canvas.removeEventListener("wheel", this.handleWheel);
      window.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("keyup", this.handleKeyUp);
      this.canvas.style.cursor = "";

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

      if (this.shapeTexture) {
        gl.deleteTexture(this.shapeTexture);
        this.shapeTexture = null;
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
