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
out vec2 v_documentPixel;

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
  v_documentPixel = documentPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const ARTBOARD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_clipTexture;
uniform float u_opacity;
uniform vec2 uDocumentSize;
uniform float uCameraZoom;
uniform float u_gridMode;
uniform float u_maskMode;
uniform vec4 u_maskRect;
uniform float u_maskRectMode;
uniform float u_clipMode;
uniform float u_clipOpacity;
uniform vec2 u_clipTextureSize;
uniform vec2 u_drawOrigin;
uniform float u_previewCutMode;
uniform vec4 u_previewCutRect;

in vec2 v_uv;
in vec2 v_documentPixel;

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
    vec4 color = texture(u_texture, v_uv) * u_opacity;

    if (u_previewCutMode > 0.5) {
      bool insideCutRect =
        v_documentPixel.x >= u_previewCutRect.x &&
        v_documentPixel.y >= u_previewCutRect.y &&
        v_documentPixel.x <= u_previewCutRect.x + u_previewCutRect.z &&
        v_documentPixel.y <= u_previewCutRect.y + u_previewCutRect.w;

      if (insideCutRect) {
        color = vec4(0.0);
      }
    }

    if (u_maskMode > 0.5) {
      float eraseAlpha = 0.0;

      if (u_maskRectMode > 0.5) {
        vec2 local = (v_documentPixel - u_maskRect.xy) / max(u_maskRect.zw, vec2(1.0));

        if (!any(lessThan(local, vec2(0.0))) && !any(greaterThan(local, vec2(1.0)))) {
          eraseAlpha = clamp(texture(u_maskTexture, vec2(local.x, 1.0 - local.y)).a, 0.0, 1.0);
        }
      } else {
        eraseAlpha = clamp(texture(u_maskTexture, v_uv).a, 0.0, 1.0);
      }

      color *= 1.0 - eraseAlpha;
    }

    if (u_clipMode > 0.5) {
      vec2 globalDocPixel = u_drawOrigin + v_documentPixel;
      vec2 clipUv = vec2(
        globalDocPixel.x / max(u_clipTextureSize.x, 1.0),
        1.0 - globalDocPixel.y / max(u_clipTextureSize.y, 1.0)
      );
      float clipAlpha = 0.0;

      if (clipUv.x >= 0.0 && clipUv.x <= 1.0 && clipUv.y >= 0.0 && clipUv.y <= 1.0) {
        clipAlpha = texture(u_clipTexture, clipUv).a * clamp(u_clipOpacity, 0.0, 1.0);
      }

      color *= clipAlpha;
    }

    outColor = color;
  }
}
`;

  const PUPPET_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aDestPixel;
layout(location = 1) in vec2 aSourceUv;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;

void main() {
  vec2 viewportPixel = uCameraPosition + aDestPixel * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = aSourceUv;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PUPPET_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`;

  const PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aDestPixel;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_destPixel;

void main() {
  vec2 viewportPixel = uCameraPosition + aDestPixel * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_destPixel = aDestPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform mat3 u_destToSourceUv;
uniform float u_opacity;

in vec2 v_destPixel;

out vec4 outColor;

void main() {
  vec3 mapped = u_destToSourceUv * vec3(v_destPixel, 1.0);

  if (abs(mapped.z) < 0.000001) {
    discard;
  }

  vec2 unitUv = mapped.xy / mapped.z;

  if (unitUv.x < 0.0 || unitUv.x > 1.0 || unitUv.y < 0.0 || unitUv.y > 1.0) {
    discard;
  }

  vec2 uv = vec2(unitUv.x, 1.0 - unitUv.y);
  outColor = texture(u_texture, uv) * u_opacity;
}
`;

  const DEFAULT_PUPPET_GRID_COLS = 256;
  const DEFAULT_PUPPET_GRID_ROWS = 256;
  const PUPPET_PIN_EPSILON = 0.000001;

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
        documentWidth: Number.isFinite(options.documentWidth) && options.documentWidth > 0
          ? Math.floor(options.documentWidth)
          : null,
        documentHeight: Number.isFinite(options.documentHeight) && options.documentHeight > 0
          ? Math.floor(options.documentHeight)
          : null,
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
      this.puppetMeshResourcesByLayerId = new Map();
      this.rasterTransformPreview = null;
      this.previewTexture = null;
      this.previewFramebuffer = null;
      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";
      this.texturedQuad = null;
      this.programInfo = null;
      this.puppetProgramInfo = null;
      this.perspectiveQuadProgramInfo = null;
      this.quad = null;
      this.isDisposed = false;
      this.handleLayerModelChange = this.handleLayerModelChange.bind(this);
      this.handleDocumentContentChange = this.handleDocumentContentChange.bind(this);
      this.handleHistoryChange = this.handleHistoryChange.bind(this);

      try {
        this.configureDocumentSize(options.viewportWidth, options.viewportHeight);
        this.createBaseLayerTarget();
        this.programInfo = this.createProgramInfo();
        this.quad = this.createArtboardQuad();
        this.createPreviewCache();
      } catch (error) {
        this.dispose();
        throw error;
      }

      this.layerModel?.addEventListener?.("change", this.handleLayerModelChange);
      window.addEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.addEventListener("cbo:history-change", this.handleHistoryChange);
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
          clipMode: gl.getUniformLocation(program, "u_clipMode"),
          clipOpacity: gl.getUniformLocation(program, "u_clipOpacity"),
          clipTexture: gl.getUniformLocation(program, "u_clipTexture"),
          clipTextureSize: gl.getUniformLocation(program, "u_clipTextureSize"),
          documentSize: gl.getUniformLocation(program, "uDocumentSize"),
          drawOrigin: gl.getUniformLocation(program, "u_drawOrigin"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskRect: gl.getUniformLocation(program, "u_maskRect"),
          maskRectMode: gl.getUniformLocation(program, "u_maskRectMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          previewCutMode: gl.getUniformLocation(program, "u_previewCutMode"),
          previewCutRect: gl.getUniformLocation(program, "u_previewCutRect"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          gridMode: gl.getUniformLocation(program, "u_gridMode"),
        },
      };
    }

    createPuppetProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PUPPET_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PUPPET_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma puppet WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma puppet.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    createPerspectiveQuadProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PERSPECTIVE_QUAD_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PERSPECTIVE_QUAD_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma perspective quad WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma perspective quad.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          destToSourceUv: gl.getUniformLocation(program, "u_destToSourceUv"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
        },
      };
    }

    ensurePuppetProgramInfo() {
      if (!this.puppetProgramInfo) {
        this.puppetProgramInfo = this.createPuppetProgramInfo();
      }

      return this.puppetProgramInfo;
    }

    ensurePerspectiveQuadProgramInfo() {
      if (!this.perspectiveQuadProgramInfo) {
        this.perspectiveQuadProgramInfo = this.createPerspectiveQuadProgramInfo();
      }

      return this.perspectiveQuadProgramInfo;
    }

    createTexturedQuadResource() {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();

      if (!vao || !buffer) {
        if (buffer) {
          gl.deleteBuffer(buffer);
        }

        if (vao) {
          gl.deleteVertexArray(vao);
        }

        throw new Error("Impossibile creare le risorse per il quad raster transform.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, 6 * 4 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(
        1,
        2,
        gl.FLOAT,
        false,
        4 * Float32Array.BYTES_PER_ELEMENT,
        2 * Float32Array.BYTES_PER_ELEMENT,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { buffer, vao };
    }

    ensureTexturedQuadResource() {
      if (!this.texturedQuad) {
        this.texturedQuad = this.createTexturedQuadResource();
      }

      return this.texturedQuad;
    }

    computeDestToSourceUvHomography(destQuad) {
      if (!Array.isArray(destQuad) || destQuad.length < 4) {
        return null;
      }

      const points = destQuad.map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }));

      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        return null;
      }

      const x0 = points[0].x;
      const y0 = points[0].y;
      const x1 = points[1].x;
      const y1 = points[1].y;
      const x2 = points[2].x;
      const y2 = points[2].y;
      const x3 = points[3].x;
      const y3 = points[3].y;
      const dx1 = x1 - x2;
      const dx2 = x3 - x2;
      const dy1 = y1 - y2;
      const dy2 = y3 - y2;
      const sx = x0 - x1 + x2 - x3;
      const sy = y0 - y1 + y2 - y3;
      const epsilon = 0.000001;
      let a;
      let b;
      let c;
      let d;
      let e;
      let f;
      let g;
      let h;

      if (Math.abs(sx) < epsilon && Math.abs(sy) < epsilon) {
        a = x1 - x0;
        b = x3 - x0;
        c = x0;
        d = y1 - y0;
        e = y3 - y0;
        f = y0;
        g = 0;
        h = 0;
      } else {
        const det = dx1 * dy2 - dx2 * dy1;

        if (Math.abs(det) < epsilon) {
          return null;
        }

        g = (sx * dy2 - sy * dx2) / det;
        h = (dx1 * sy - dy1 * sx) / det;
        a = x1 - x0 + g * x1;
        b = x3 - x0 + h * x3;
        c = x0;
        d = y1 - y0 + g * y1;
        e = y3 - y0 + h * y3;
        f = y0;
      }

      const c00 = e - f * h;
      const c01 = f * g - d;
      const c02 = d * h - e * g;
      const c10 = c * h - b;
      const c11 = a - c * g;
      const c12 = b * g - a * h;
      const c20 = b * f - c * e;
      const c21 = c * d - a * f;
      const c22 = a * e - b * d;
      const detM = a * c00 + b * c01 + c * c02;

      if (Math.abs(detM) < epsilon) {
        return null;
      }

      const inverseDet = 1 / detM;

      return new Float32Array([
        c00 * inverseDet, c01 * inverseDet, c02 * inverseDet,
        c10 * inverseDet, c11 * inverseDet, c12 * inverseDet,
        c20 * inverseDet, c21 * inverseDet, c22 * inverseDet,
      ]);
    }

    drawTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const vertices = new Float32Array([
        quad[0].x, quad[0].y, 0, 1,
        quad[1].x, quad[1].y, 1, 1,
        quad[2].x, quad[2].y, 1, 0,
        quad[0].x, quad[0].y, 0, 1,
        quad[2].x, quad[2].y, 1, 0,
        quad[3].x, quad[3].y, 0, 0,
      ]);

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    drawPerspectiveTexturedQuad(texture, quad, options = {}) {
      if (!texture || !Array.isArray(quad) || quad.length < 4) {
        return false;
      }

      const matrix = this.computeDestToSourceUvHomography(quad);

      if (!matrix) {
        return this.drawTexturedQuad(texture, quad, options);
      }

      const gl = this.gl;
      const { program, uniforms } = this.ensurePerspectiveQuadProgramInfo();
      const resource = this.ensureTexturedQuadResource();
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const vertices = new Float32Array([
        quad[0].x, quad[0].y, 0, 1,
        quad[1].x, quad[1].y, 1, 1,
        quad[2].x, quad[2].y, 1, 0,
        quad[0].x, quad[0].y, 0, 1,
        quad[2].x, quad[2].y, 1, 0,
        quad[3].x, quad[3].y, 0, 0,
      ]);

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniformMatrix3fv(uniforms.destToSourceUv, false, matrix);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.bindVertexArray(resource.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
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

    createPreviewCache() {
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

        console.warn("Preview mipmap non disponibile: impossibile allocare la cache.");
        return false;
      }

      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const levels = Math.max(1, Math.floor(Math.log2(Math.max(width, height))) + 1);

      gl.bindTexture(gl.TEXTURE_2D, texture);

      if (typeof gl.texStorage2D === "function" && gl.RGBA8) {
        gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn("Preview FBO incompleto: uso il rendering full-res come fallback.");
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewTexture = texture;
      this.previewFramebuffer = framebuffer;
      this.previewMipLevels = levels;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
      this.previewCacheReason = "init";

      return true;
    }

    deletePreviewCache() {
      const gl = this.gl;

      if (this.previewFramebuffer) {
        gl.deleteFramebuffer(this.previewFramebuffer);
        this.previewFramebuffer = null;
      }

      if (this.previewTexture) {
        gl.deleteTexture(this.previewTexture);
        this.previewTexture = null;
      }

      this.previewMipLevels = 0;
      this.previewCacheDirty = true;
      this.previewCacheReady = false;
    }

    invalidatePreviewCache(reason = "unknown") {
      this.previewCacheDirty = true;
      this.previewCacheReason = reason;
    }

    getLayerOpacity(layerId, layers = this.getRenderableLayers()) {
      const layer = Array.isArray(layers)
        ? layers.find((entry) => entry?.id === layerId)
        : null;

      return Number.isFinite(layer?.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
    }

    configureDocumentSize(viewportWidth, viewportHeight) {
      const gl = this.gl;
      const policyCap = this.isMobileLikeDevice() ? 2048 : 4096;
      const hardwareCap = gl.getParameter(gl.MAX_TEXTURE_SIZE) || policyCap;
      const fixedWidth = this.options.documentWidth;
      const fixedHeight = this.options.documentHeight;

      if (fixedWidth && fixedHeight) {
        const cap = Math.max(1, hardwareCap);

        this.width = Math.max(1, Math.min(fixedWidth, cap));
        this.height = Math.max(1, Math.min(fixedHeight, cap));
        return;
      }

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
      this.emitContentChange({ source: "clear-document" });
    }

    clearLayer(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      this.clearTarget(target);
      if (options.emit !== false) {
        this.emitContentChange({ layerId, source: options.source || "clear-layer" });
      }

      return true;
    }

    getSnapshotRect(target, rect = null) {
      if (!target || !Number.isFinite(target.width) || !Number.isFinite(target.height)) {
        return null;
      }

      if (!rect) {
        return {
          height: Math.max(1, Math.round(target.height)),
          width: Math.max(1, Math.round(target.width)),
          x: 0,
          y: 0,
        };
      }

      const rawX = Number.isFinite(rect.x) ? rect.x : 0;
      const rawY = Number.isFinite(rect.y) ? rect.y : 0;
      const x = Math.max(0, Math.min(target.width - 1, Math.floor(rawX)));
      const y = Math.max(0, Math.min(target.height - 1, Math.floor(rawY)));
      const rawWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : target.width - x;
      const rawHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : target.height - y;
      const width = Math.max(1, Math.min(target.width - x, Math.ceil(rawWidth)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil(rawHeight)));

      return { x, y, width, height };
    }

    createRasterSnapshot(targetOrLayerId, rect = null, label = "raster snapshot") {
      const target = typeof targetOrLayerId === "string"
        ? this.getRasterTarget(targetOrLayerId)
        : targetOrLayerId;
      const snapshotRect = this.getSnapshotRect(target, rect);

      if (!target?.framebuffer || !snapshotRect) {
        return null;
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

        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        snapshotRect.width,
        snapshotRect.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        console.warn(`Snapshot raster ${label} incompleto.`);
        return null;
      }

      const sourceX0 = snapshotRect.x;
      const sourceX1 = snapshotRect.x + snapshotRect.width;
      const sourceY0 = target.height - (snapshotRect.y + snapshotRect.height);
      const sourceY1 = target.height - snapshotRect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
      gl.blitFramebuffer(
        sourceX0,
        sourceY0,
        sourceX1,
        sourceY1,
        0,
        0,
        snapshotRect.width,
        snapshotRect.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return {
        framebuffer,
        label,
        rect: snapshotRect,
        texture,
      };
    }

    canRestoreRasterSnapshot(target, snapshot) {
      const rect = snapshot?.rect;

      return Boolean(
        target?.framebuffer &&
        snapshot?.framebuffer &&
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= target.width &&
        rect.y + rect.height <= target.height
      );
    }

    restoreRasterSnapshot(layerId, snapshot, options = {}) {
      if (!layerId || !snapshot) {
        return false;
      }

      const target = this.getRasterTarget(layerId);

      if (!this.canRestoreRasterSnapshot(target, snapshot)) {
        return false;
      }

      const gl = this.gl;
      const rect = snapshot.rect;
      const x0 = rect.x;
      const x1 = rect.x + rect.width;
      const y0 = target.height - (rect.y + rect.height);
      const y1 = target.height - rect.y;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(0, 0, rect.width, rect.height, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

      if (options.emit !== false) {
        this.emitContentChange({
          layerId,
          source: options.source || "raster-snapshot-restore",
        });
      }

      return true;
    }

    deleteRasterSnapshot(snapshot) {
      if (snapshot?.framebuffer) {
        this.gl.deleteFramebuffer(snapshot.framebuffer);
        snapshot.framebuffer = null;
      }

      if (snapshot?.texture) {
        this.gl.deleteTexture(snapshot.texture);
        snapshot.texture = null;
      }
    }

    requestDraw() {
      if (namespace.brushEngine?.requestDraw) {
        namespace.brushEngine.requestDraw();
      } else {
        namespace.brushEngine?.draw?.();
      }
    }

    setRasterTransformPreview(preview = null) {
      if (!preview?.layerId || !preview?.texture || !Array.isArray(preview.quad)) {
        this.rasterTransformPreview = null;
      } else {
        this.rasterTransformPreview = {
          layerId: preview.layerId,
          opacity: Number.isFinite(preview.opacity) ? Math.min(1, Math.max(0, preview.opacity)) : 1,
          quad: preview.quad.map((point) => ({
            x: Number.isFinite(point?.x) ? point.x : 0,
            y: Number.isFinite(point?.y) ? point.y : 0,
          })),
          sourceRect: preview.sourceRect ? { ...preview.sourceRect } : null,
          texture: preview.texture,
          transformMode: String(preview.transformMode || "free").trim().toLowerCase() || "free",
        };
      }

      this.requestDraw();
    }

    clearRasterTransformPreview(layerId = "") {
      if (!this.rasterTransformPreview) {
        return;
      }

      if (!layerId || this.rasterTransformPreview.layerId === layerId) {
        this.rasterTransformPreview = null;
        this.requestDraw();
      }
    }

    getRasterContentBounds(layerId, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!layerId || !target?.framebuffer || !target?.texture) {
        return null;
      }

      const bounds = namespace.documentBounds;
      const targetWidth = Math.max(1, Math.round(target.width || this.width || 1));
      const targetHeight = Math.max(1, Math.round(target.height || this.height || 1));
      const sampleCols = Math.max(16, Math.min(512, Math.floor(options.sampleCols || 256)));
      const sampleRows = Math.max(16, Math.min(512, Math.floor(options.sampleRows || 256)));
      const alphaThreshold = Number.isFinite(options.alphaThreshold)
        ? Math.max(0, Math.min(255, options.alphaThreshold))
        : 2;
      const samples = this.getPuppetAlphaSamples(target, sampleCols, sampleRows);
      let minCol = sampleCols;
      let minRow = sampleRows;
      let maxCol = -1;
      let maxRow = -1;

      for (let row = 0; row < sampleRows; row += 1) {
        for (let col = 0; col < sampleCols; col += 1) {
          if (samples[row * sampleCols + col] > alphaThreshold) {
            minCol = Math.min(minCol, col);
            minRow = Math.min(minRow, row);
            maxCol = Math.max(maxCol, col);
            maxRow = Math.max(maxRow, row);
          }
        }
      }

      if (maxCol < 0 || maxRow < 0) {
        return null;
      }

      const padCells = Number.isFinite(options.padCells) ? Math.max(0, Math.floor(options.padCells)) : 2;
      const paddedMinCol = Math.max(0, minCol - padCells);
      const paddedMinRow = Math.max(0, minRow - padCells);
      const paddedMaxCol = Math.min(sampleCols - 1, maxCol + padCells);
      const paddedMaxRow = Math.min(sampleRows - 1, maxRow + padCells);
      const cellWidth = targetWidth / sampleCols;
      const cellHeight = targetHeight / sampleRows;
      const coarseRect = bounds?.getClampedRasterBox?.({
        x: paddedMinCol * cellWidth,
        y: paddedMinRow * cellHeight,
        width: (paddedMaxCol - paddedMinCol + 1) * cellWidth,
        height: (paddedMaxRow - paddedMinRow + 1) * cellHeight,
      }, targetWidth, targetHeight);

      if (!coarseRect) {
        return null;
      }

      const gl = this.gl;
      const pixels = new Uint8Array(coarseRect.width * coarseRect.height * 4);
      const readY = targetHeight - (coarseRect.y + coarseRect.height);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.readPixels(coarseRect.x, readY, coarseRect.width, coarseRect.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

      let minX = coarseRect.width;
      let minY = coarseRect.height;
      let maxX = -1;
      let maxY = -1;

      for (let row = 0; row < coarseRect.height; row += 1) {
        for (let col = 0; col < coarseRect.width; col += 1) {
          const alpha = pixels[(row * coarseRect.width + col) * 4 + 3];

          if (alpha > alphaThreshold) {
            minX = Math.min(minX, col);
            minY = Math.min(minY, row);
            maxX = Math.max(maxX, col);
            maxY = Math.max(maxY, row);
          }
        }
      }

      if (maxX < 0 || maxY < 0) {
        return null;
      }

      const topDownMinY = coarseRect.height - 1 - maxY;
      const topDownMaxY = coarseRect.height - 1 - minY;
      const padding = Number.isFinite(options.padding) ? Math.max(0, Math.floor(options.padding)) : 2;

      return bounds?.getClampedRasterBox?.({
        x: coarseRect.x + minX - padding,
        y: coarseRect.y + topDownMinY - padding,
        width: maxX - minX + 1 + padding * 2,
        height: topDownMaxY - topDownMinY + 1 + padding * 2,
      }, targetWidth, targetHeight) || null;
    }

    clearRasterRect(layerId, rect) {
      if (!layerId || !rect) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);
      const clearRect = namespace.documentBounds?.getClampedRasterBox?.(rect, target?.width, target?.height);

      if (!target?.framebuffer || !clearRect) {
        return false;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(clearRect.x, target.height - (clearRect.y + clearRect.height), clearRect.width, clearRect.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return true;
    }

    commitRasterTransform(options = {}) {
      const {
        destQuad,
        layerId,
        source = "raster-transform",
        sourceRect,
        sourceSnapshot,
        transformMode = "free",
      } = options;
      const target = this.rasterTargetsByLayerId.get(layerId);
      const bounds = namespace.documentBounds;

      if (!bounds) {
        return false;
      }

      const destBounds = bounds?.quadToBounds?.(destQuad);
      const destRect = bounds?.boundsToRect?.(destBounds);
      const dirtyRect = bounds?.getClampedRasterBox?.(
        bounds.getUnionRect(sourceRect, destRect),
        target?.width,
        target?.height,
      );

      if (!target?.framebuffer || !sourceSnapshot?.texture || !sourceRect || !dirtyRect) {
        return false;
      }

      const beforeSnapshot = this.createRasterSnapshot(layerId, dirtyRect, `${source}-before`);

      if (!beforeSnapshot?.texture) {
        return false;
      }

      this.clearRasterRect(layerId, sourceRect);

      const drawOptions = {
        camera: { x: 0, y: 0, zoom: 1 },
        framebuffer: target.framebuffer,
        opacity: 1,
        viewportHeight: target.height,
        viewportWidth: target.width,
      };
      const didDraw = String(transformMode).trim().toLowerCase() === "perspective"
        ? this.drawPerspectiveTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions)
        : this.drawTexturedQuad(sourceSnapshot.texture, destQuad, drawOptions);

      if (!didDraw) {
        this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          emit: false,
          source: `${source}-rollback`,
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const afterSnapshot = this.createRasterSnapshot(layerId, dirtyRect, `${source}-after`);

      if (!afterSnapshot?.texture) {
        this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          emit: false,
          source: `${source}-rollback`,
        });
        this.deleteRasterSnapshot(beforeSnapshot);
        return false;
      }

      const history = namespace.documentHistory;
      const entry = {
        type: "custom",
        afterSnapshot,
        beforeSnapshot,
        layerId,
        source,
        undo: () => this.restoreRasterSnapshot(layerId, beforeSnapshot, {
          source: `history-undo-${source}`,
        }),
        redo: () => this.restoreRasterSnapshot(layerId, afterSnapshot, {
          source: `history-redo-${source}`,
        }),
        destroy: () => {
          this.deleteRasterSnapshot(beforeSnapshot);
          this.deleteRasterSnapshot(afterSnapshot);
        },
      };

      if (history?.push) {
        history.push(entry);
      } else {
        entry.destroy();
      }

      this.clearRasterTransformPreview(layerId);
      this.emitContentChange({ layerId, source });
      this.requestDraw();

      return true;
    }

    deleteRasterTarget(layerId, options = {}) {
      if (!layerId) {
        return false;
      }

      const target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        return false;
      }

      if (target.texture === this.texture || layerId === this.paintLayerId || layerId === "background") {
        return false;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        gl.deleteFramebuffer(target.framebuffer);
      }

      if (target.texture) {
        gl.deleteTexture(target.texture);
      }

      this.rasterTargetsByLayerId.delete(layerId);
      this.deletePuppetMeshResource(layerId);

      if (options.emit !== false) {
        this.emitContentChange({ layerId, source: options.source || "delete-raster-target" });
      }

      return true;
    }

    emitContentChange(detail = {}) {
      window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
        detail,
      }));
    }

    handleLayerModelChange() {
      this.invalidatePreviewCache("layers-change");
      this.pruneOrphanRasterTargets();
    }

    handleDocumentContentChange(event) {
      this.invalidatePreviewCache(event?.detail?.source || "document-content-change");
    }

    handleHistoryChange() {
      this.invalidatePreviewCache("history-change");
      this.pruneOrphanRasterTargets();
    }

    collectEntryLayerIds(entries, result = new Set()) {
      if (!Array.isArray(entries)) {
        return result;
      }

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        if (entry.id) {
          result.add(entry.id);
        }

        this.collectEntryLayerIds(entry.children || [], result);
      }

      return result;
    }

    collectHistoryEntryLayerIds(entry, result = new Set()) {
      if (!entry) {
        return result;
      }

      if (entry.layerId) {
        result.add(entry.layerId);
      }

      if (Array.isArray(entry.layerIds)) {
        entry.layerIds.forEach((layerId) => {
          if (layerId) {
            result.add(layerId);
          }
        });
      }

      this.collectEntryLayerIds(entry.beforeEntries || [], result);
      this.collectEntryLayerIds(entry.afterEntries || [], result);

      return result;
    }

    collectHistoryLayerIds(result = new Set()) {
      const history = namespace.documentHistory;
      const stacks = [history?.undoStack, history?.redoStack];

      for (const stack of stacks) {
        if (!Array.isArray(stack)) {
          continue;
        }

        for (const entry of stack) {
          this.collectHistoryEntryLayerIds(entry, result);
        }
      }

      return result;
    }

    getRetainedRasterTargetLayerIds() {
      const retainedLayerIds = this.collectEntryLayerIds(this.layerModel?.getEntries?.() || []);

      this.collectHistoryLayerIds(retainedLayerIds);
      retainedLayerIds.add("background");

      if (this.paintLayerId) {
        retainedLayerIds.add(this.paintLayerId);
      }

      return retainedLayerIds;
    }

    pruneOrphanRasterTargets() {
      if (this.isDisposed || !this.rasterTargetsByLayerId?.size) {
        return 0;
      }

      const retainedLayerIds = this.getRetainedRasterTargetLayerIds();
      let prunedCount = 0;

      for (const layerId of Array.from(this.rasterTargetsByLayerId.keys())) {
        const target = this.rasterTargetsByLayerId.get(layerId);

        if (retainedLayerIds.has(layerId) || target?.texture === this.texture) {
          continue;
        }

        if (this.deleteRasterTarget(layerId, { emit: false })) {
          prunedCount += 1;
        }
      }

      return prunedCount;
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

    getOrderedLayersBottomToTop() {
      const layers = this.layerModel?.flattenTopToBottom?.();

      if (Array.isArray(layers)) {
        return layers.reverse();
      }

      return [{
        id: this.paintLayerId || "paint-main",
        type: "paint",
        visible: true,
        opacity: 1,
      }];
    }

    updatePreviewCacheIfNeeded() {
      if (!this.previewTexture || !this.previewFramebuffer) {
        return false;
      }

      if (!this.previewCacheDirty && this.previewCacheReady) {
        return true;
      }

      return this.updatePreviewCache();
    }

    updatePreviewCache() {
      if (!this.previewTexture || !this.previewFramebuffer || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const width = Math.max(1, Math.round(this.width || 1));
      const height = Math.max(1, Math.round(this.height || 1));
      const { program, uniforms } = this.programInfo;
      const flatCamera = { x: 0, y: 0, zoom: 1 };
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const bindArtboardProgram = () => {
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, width, height);
        setDocumentProjection(width, height, 0, 0);
        gl.uniform1f(uniforms.cameraZoom, 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, width, height);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipTextureSize, width, height);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
      };
      const drawTexture = (texture, opacity = 1) => {
        setDocumentProjection(width, height, 0, 0);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.previewFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      bindArtboardProgram();

      for (const layer of this.getRenderableLayers()) {
        const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
        const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;

        if (!layerTarget?.texture) {
          continue;
        }

        if (this.hasPuppetLayerTransform(layer)) {
          const didDrawPuppet = this.drawPuppetLayer(layer, layerTarget, opacity, {
            camera: flatCamera,
            viewportHeight: height,
            viewportWidth: width,
          });

          bindArtboardProgram();

          if (!didDrawPuppet) {
            drawTexture(layerTarget.texture, opacity);
          }
        } else {
          drawTexture(layerTarget.texture, opacity);
        }
      }

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.previewCacheDirty = false;
      this.previewCacheReady = true;

      return true;
    }

    drawPreviewCacheToCanvas(options = {}) {
      if (!this.previewTexture || !this.previewCacheReady || !this.programInfo || !this.quad) {
        return false;
      }

      const gl = this.gl;
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0, options.opacity)) : 1;
      const { program, uniforms } = this.programInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, options.framebuffer || null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.documentSize, this.width, this.height);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.maskTexture, 1);
      gl.uniform1i(uniforms.clipTexture, 2);
      gl.uniform1f(uniforms.maskMode, 0.0);
      gl.uniform1f(uniforms.maskRectMode, 0.0);
      gl.uniform4f(uniforms.maskRect, 0, 0, this.width, this.height);
      gl.uniform1f(uniforms.clipMode, 0.0);
      gl.uniform1f(uniforms.clipOpacity, 1.0);
      gl.uniform2f(uniforms.clipTextureSize, this.width, this.height);
      gl.uniform2f(uniforms.drawOrigin, 0, 0);
      gl.uniform1f(uniforms.previewCutMode, 0.0);
      gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.gridMode, 0.0);
      gl.uniform1f(uniforms.opacity, opacity);

      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }

    hasPuppetLayerTransform(layer) {
      return Array.isArray(layer?.puppet?.pins) && layer.puppet.pins.length > 0;
    }

    getPuppetGridSize(layer) {
      return {
        cols: DEFAULT_PUPPET_GRID_COLS,
        rows: DEFAULT_PUPPET_GRID_ROWS,
      };
    }

    writeRigidMlsPoint(vertices, offset, x, y, pins) {
      if (!pins?.length) {
        vertices[offset] = x;
        vertices[offset + 1] = y;
        return;
      }

      if (pins.length === 1) {
        const pin = pins[0];
        const rotation = Number(pin.rotation);
        const angle = Number.isFinite(rotation) ? rotation : 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = x - pin.restX;
        const dy = y - pin.restY;

        vertices[offset] = pin.x + dx * cos - dy * sin;
        vertices[offset + 1] = pin.y + dx * sin + dy * cos;
        return;
      }

      let pStarX = 0;
      let pStarY = 0;
      let qStarX = 0;
      let qStarY = 0;
      let weightSum = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const distSq = dx * dx + dy * dy;

        if (distSq < PUPPET_PIN_EPSILON) {
          vertices[offset] = pin.x;
          vertices[offset + 1] = pin.y;
          return;
        }

        const weight = 1 / distSq;

        weightSum += weight;
        pStarX += weight * pin.restX;
        pStarY += weight * pin.restY;
        qStarX += weight * pin.x;
        qStarY += weight * pin.y;
      }

      pStarX /= weightSum;
      pStarY /= weightSum;
      qStarX /= weightSum;
      qStarY /= weightSum;

      let a = 0;
      let b = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const phatX = pin.restX - pStarX;
        const phatY = pin.restY - pStarY;
        const qhatX = pin.x - qStarX;
        const qhatY = pin.y - qStarY;

        a += weight * (phatX * qhatX + phatY * qhatY);
        b += weight * (phatX * qhatY - phatY * qhatX);
      }

      const norm = Math.sqrt(a * a + b * b);
      const rotA = norm > PUPPET_PIN_EPSILON ? a / norm : 1;
      const rotB = norm > PUPPET_PIN_EPSILON ? b / norm : 0;
      const vhatX = x - pStarX;
      const vhatY = y - pStarY;

      let resultX = qStarX + vhatX * rotA - vhatY * rotB;
      let resultY = qStarY + vhatX * rotB + vhatY * rotA;
      let rotationDeltaX = 0;
      let rotationDeltaY = 0;

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];
        const angle = Number(pin.rotation);

        if (!Number.isFinite(angle) || Math.abs(angle) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const dx = x - pin.restX;
        const dy = y - pin.restY;
        const weight = 1 / (dx * dx + dy * dy);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        rotationDeltaX += weight * (dx * cos - dy * sin - dx);
        rotationDeltaY += weight * (dx * sin + dy * cos - dy);
      }

      resultX += rotationDeltaX / weightSum;
      resultY += rotationDeltaY / weightSum;

      vertices[offset] = resultX;
      vertices[offset + 1] = resultY;
    }

    deletePuppetMeshResource(layerId) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource) {
        return false;
      }

      const gl = this.gl;

      if (resource.vbo) {
        gl.deleteBuffer(resource.vbo);
      }

      if (resource.ebo) {
        gl.deleteBuffer(resource.ebo);
      }

      if (resource.vao) {
        gl.deleteVertexArray(resource.vao);
      }

      this.puppetMeshResourcesByLayerId.delete(layerId);
      return true;
    }

    getPuppetAlphaSamples(target, cols, rows) {
      const samples = new Uint8Array(cols * rows);

      samples.fill(255);

      if (!target?.texture) {
        return samples;
      }

      const gl = this.gl;
      const fboRead = gl.createFramebuffer();
      const fboWrite = gl.createFramebuffer();
      const miniTexture = gl.createTexture();

      if (!fboRead || !fboWrite || !miniTexture) {
        if (fboRead) {
          gl.deleteFramebuffer(fboRead);
        }

        if (fboWrite) {
          gl.deleteFramebuffer(fboWrite);
        }

        if (miniTexture) {
          gl.deleteTexture(miniTexture);
        }

        return samples;
      }

      gl.bindTexture(gl.TEXTURE_2D, miniTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboRead);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fboWrite);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, miniTexture, 0);

      const readReady = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const writeReady = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

      if (readReady && writeReady) {
        gl.blitFramebuffer(
          0,
          0,
          target.width,
          target.height,
          0,
          0,
          cols,
          rows,
          gl.COLOR_BUFFER_BIT,
          gl.LINEAR,
        );

        const pixels = new Uint8Array(cols * rows * 4);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fboWrite);
        gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < cols; x += 1) {
            const webglY = rows - 1 - y;
            const alpha = pixels[(webglY * cols + x) * 4 + 3];

            samples[y * cols + x] = alpha;
          }
        }
      }

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(fboRead);
      gl.deleteFramebuffer(fboWrite);
      gl.deleteTexture(miniTexture);

      return samples;
    }

    getPuppetAlphaMask(target, cols, rows, options = {}) {
      const samples = this.getPuppetAlphaSamples(target, cols, rows);
      const mask = new Uint8Array(cols * rows);
      const threshold = Number.isFinite(options.threshold)
        ? Math.max(0, Math.min(255, options.threshold))
        : 2;

      for (let index = 0; index < samples.length; index += 1) {
        mask[index] = samples[index] > threshold ? 1 : 0;
      }

      return mask;
    }

    getRasterAlphaAtPoint(targetOrLayerId, x, y) {
      const target = typeof targetOrLayerId === "string"
        ? this.rasterTargetsByLayerId.get(targetOrLayerId)
        : targetOrLayerId;

      if (!target?.framebuffer || !Number.isFinite(x) || !Number.isFinite(y)) {
        return 0;
      }

      const pixelX = Math.floor(x);
      const pixelY = Math.floor(y);

      if (
        pixelX < 0 ||
        pixelY < 0 ||
        pixelX >= target.width ||
        pixelY >= target.height
      ) {
        return 0;
      }

      const gl = this.gl;
      const pixel = new Uint8Array(4);
      const webglY = target.height - pixelY - 1;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      gl.readPixels(pixelX, webglY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

      return pixel[3];
    }

    getPuppetRestPoint(layerId, targetX, targetY) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (!resource?.indices || !resource?.vertices) {
        return { x: targetX, y: targetY };
      }

      const { vertices, indices } = resource;
      const targetWidth = Math.max(1, resource.targetWidth || 1);
      const targetHeight = Math.max(1, resource.targetHeight || 1);

      for (let index = 0; index < indices.length; index += 3) {
        const i0 = indices[index] * 4;
        const i1 = indices[index + 1] * 4;
        const i2 = indices[index + 2] * 4;
        const x1 = vertices[i0];
        const y1 = vertices[i0 + 1];
        const x2 = vertices[i1];
        const y2 = vertices[i1 + 1];
        const x3 = vertices[i2];
        const y3 = vertices[i2 + 1];
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);

        if (Math.abs(det) < PUPPET_PIN_EPSILON) {
          continue;
        }

        const w1 = ((y2 - y3) * (targetX - x3) + (x3 - x2) * (targetY - y3)) / det;
        const w2 = ((y3 - y1) * (targetX - x3) + (x1 - x3) * (targetY - y3)) / det;
        const w3 = 1 - w1 - w2;

        if (w1 >= -0.05 && w2 >= -0.05 && w3 >= -0.05) {
          const u1 = vertices[i0 + 2];
          const v1 = vertices[i0 + 3];
          const u2 = vertices[i1 + 2];
          const v2 = vertices[i1 + 3];
          const u3 = vertices[i2 + 2];
          const v3 = vertices[i2 + 3];
          const u = w1 * u1 + w2 * u2 + w3 * u3;
          const v = w1 * v1 + w2 * v2 + w3 * v3;

          return {
            x: u * targetWidth,
            y: (1 - v) * targetHeight,
          };
        }
      }

      return { x: targetX, y: targetY };
    }

    createPuppetMeshResource(layerId, target, cols, rows) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      const ebo = gl.createBuffer();
      const vertices = new Float32Array((cols + 1) * (rows + 1) * 4);
      const validIndices = [];

      if (!vao || !vbo || !ebo) {
        if (vao) {
          gl.deleteVertexArray(vao);
        }

        if (vbo) {
          gl.deleteBuffer(vbo);
        }

        if (ebo) {
          gl.deleteBuffer(ebo);
        }

        throw new Error("Impossibile creare la mesh puppet WebGL2.");
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = y * (cols + 1) + x;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;

          validIndices.push(a, c, b, b, c, d);
        }
      }

      const indices = new Uint32Array(validIndices);

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      const resource = {
        cols,
        ebo,
        indexCount: indices.length,
        indices,
        rows,
        targetHeight: target.height,
        targetWidth: target.width,
        vao,
        vbo,
        vertices,
      };

      this.puppetMeshResourcesByLayerId.set(layerId, resource);
      return resource;
    }

    getPuppetMeshResource(layerId, target, cols, rows) {
      const resource = this.puppetMeshResourcesByLayerId.get(layerId);

      if (
        resource?.cols === cols &&
        resource?.rows === rows &&
        resource?.targetWidth === target.width &&
        resource?.targetHeight === target.height
      ) {
        return resource;
      }

      this.deletePuppetMeshResource(layerId);
      return this.createPuppetMeshResource(layerId, target, cols, rows);
    }

    updatePuppetMeshVertices(resource, layer, target) {
      const pins = layer.puppet?.pins || [];
      const vertices = resource.vertices;
      const cols = resource.cols;
      const rows = resource.rows;
      let offset = 0;

      for (let gridY = 0; gridY <= rows; gridY += 1) {
        for (let gridX = 0; gridX <= cols; gridX += 1) {
          const sourceX = (gridX / cols) * target.width;
          const sourceY = (gridY / rows) * target.height;

          this.writeRigidMlsPoint(vertices, offset, sourceX, sourceY, pins);
          vertices[offset + 2] = sourceX / target.width;
          vertices[offset + 3] = 1 - sourceY / target.height;
          offset += 4;
        }
      }
    }

    getPuppetMeshSignature(layer, target) {
      const pins = layer.puppet?.pins || [];
      const { cols, rows } = this.getPuppetGridSize(layer);
      const parts = [
        target.width,
        target.height,
        cols,
        rows,
      ];

      for (let index = 0; index < pins.length; index += 1) {
        const pin = pins[index];

        parts.push(pin.id, pin.restX, pin.restY, pin.x, pin.y, pin.rotation || 0);
      }

      return parts.join("|");
    }

    drawPuppetLayer(layer, target, opacity, options = {}) {
      if (!target?.texture || !layer?.id) {
        return false;
      }

      const gl = this.gl;
      const { cols, rows } = this.getPuppetGridSize(layer);
      const resource = this.getPuppetMeshResource(layer.id, target, cols, rows);
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const sourceTexture = options.sourceTexture || target.texture;
      const { program, uniforms } = this.ensurePuppetProgramInfo();
      const signature = this.getPuppetMeshSignature(layer, target);

      if (resource.signature !== signature) {
        this.updatePuppetMeshVertices(resource, layer, target);
        gl.bindBuffer(gl.ARRAY_BUFFER, resource.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, resource.vertices);
        resource.signature = signature;
      }

      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform1f(uniforms.opacity, opacity);
      gl.uniform1i(uniforms.texture, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.bindVertexArray(resource.vao);
      gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return true;
    }

    rasterizePuppetLayer(layer, options = {}) {
      if (!this.hasPuppetLayerTransform(layer) || !layer?.id) {
        return null;
      }

      const target = this.rasterTargetsByLayerId.get(layer.id);

      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const sourceSnapshot = this.createRasterSnapshot(target, null, "puppet-rasterize-before");

      if (!sourceSnapshot?.texture) {
        return null;
      }

      const gl = this.gl;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const didDraw = this.drawPuppetLayer(layer, target, 1, {
        camera: { x: 0, y: 0, zoom: 1 },
        sourceTexture: sourceSnapshot.texture,
        viewportHeight: target.height,
        viewportWidth: target.width,
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      if (!didDraw) {
        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      const rasterizedSnapshot = this.createRasterSnapshot(target, null, "puppet-rasterize-after");

      if (!rasterizedSnapshot?.texture) {
        this.restoreRasterSnapshot(layer.id, sourceSnapshot, {
          emit: false,
          source: "puppet-rasterize-rollback",
        });
        this.deleteRasterSnapshot(sourceSnapshot);
        return null;
      }

      this.deletePuppetMeshResource(layer.id);

      if (options.emit !== false) {
        this.emitContentChange({
          layerId: layer.id,
          source: options.source || "puppet-rasterize",
        });
      }

      return {
        afterSnapshot: rasterizedSnapshot,
        beforeSnapshot: sourceSnapshot,
        layerId: layer.id,
      };
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
      const activeStrokeMode = String(options.activeStrokeMode || "paint").toLowerCase();
      const activeStrokeRect = options.activeStrokeRect || null;
      const rasterTransformPreview = this.rasterTransformPreview?.texture
        ? this.rasterTransformPreview
        : null;
      const hasActiveEraserStroke = Boolean(options.activeStrokeTexture && activeStrokeMode === "eraser");
      const orderedLayers = this.getOrderedLayersBottomToTop();
      const renderableLayers = orderedLayers.filter((layer) => layer.visible !== false);
      const hasClippingMasks = orderedLayers.some((layer) => layer?.clippingMask === true);
      const activeStrokeLayerIndex = renderableLayers.findIndex((layer) => layer?.id === activeStrokeLayerId);
      const activeStrokeCanOverlayPreview = !options.activeStrokeTexture ||
        (
          activeStrokeLayerIndex >= 0 &&
          !renderableLayers
            .slice(activeStrokeLayerIndex + 1)
            .some((layer) => this.rasterTargetsByLayerId.get(layer.id)?.texture)
        );
      const isZoomedOut = (camera.zoom || 1) < 0.99;
      const canUsePreviewCache = Boolean(
        isZoomedOut &&
        !hasClippingMasks &&
        !rasterTransformPreview &&
        !hasActiveEraserStroke &&
        activeStrokeCanOverlayPreview &&
        this.previewTexture &&
        this.previewFramebuffer
      );
      let didDrawActiveStroke = false;
      const setDocumentProjection = (documentWidth, documentHeight, cameraX, cameraY) => {
        gl.uniform2f(uniforms.documentSize, documentWidth, documentHeight);
        gl.uniform2f(uniforms.cameraPosition, cameraX, cameraY);
      };
      const drawTexture = (texture, opacity, rect = null, clipBase = null) => {
        if (rect) {
          setDocumentProjection(
            rect.width,
            rect.height,
            (camera.x || 0) + rect.x * (camera.zoom || 1),
            (camera.y || 0) + rect.y * (camera.zoom || 1),
          );
          gl.uniform2f(uniforms.drawOrigin, rect.x, rect.y);
        } else {
          setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
          gl.uniform2f(uniforms.drawOrigin, 0, 0);
        }

        if (clipBase?.target?.texture) {
          const clipOpacity = Number.isFinite(clipBase.layer?.opacity)
            ? Math.min(1, Math.max(0, clipBase.layer.opacity))
            : 1;

          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, clipBase.target.texture);
          gl.uniform1i(uniforms.clipTexture, 2);
          gl.uniform1f(uniforms.clipMode, 1.0);
          gl.uniform1f(uniforms.clipOpacity, clipOpacity);
          gl.uniform2f(
            uniforms.clipTextureSize,
            clipBase.target.width || target.width,
            clipBase.target.height || target.height,
          );
          gl.activeTexture(gl.TEXTURE0);
        } else {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.uniform1f(uniforms.clipOpacity, 1.0);
          gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (clipBase?.target?.texture) {
          gl.uniform1f(uniforms.clipMode, 0.0);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
        }
      };
      const bindArtboardProgram = () => {
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
        setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1i(uniforms.clipTexture, 2);
        gl.uniform1f(uniforms.maskMode, 0.0);
        gl.uniform1f(uniforms.maskRectMode, 0.0);
        gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
        gl.uniform1f(uniforms.clipMode, 0.0);
        gl.uniform1f(uniforms.clipOpacity, 1.0);
        gl.uniform2f(uniforms.clipTextureSize, target.width, target.height);
        gl.uniform2f(uniforms.drawOrigin, 0, 0);
        gl.uniform1f(uniforms.previewCutMode, 0.0);
        gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        gl.uniform1f(uniforms.gridMode, 0.0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
      };
      const setPreviewCut = (rect = null) => {
        if (rect) {
          gl.uniform1f(uniforms.previewCutMode, 1.0);
          gl.uniform4f(uniforms.previewCutRect, rect.x, rect.y, rect.width, rect.height);
        } else {
          gl.uniform1f(uniforms.previewCutMode, 0.0);
          gl.uniform4f(uniforms.previewCutRect, 0, 0, 0, 0);
        }
      };
      const drawRasterTransformPreview = (layerOpacity = 1) => {
        if (!rasterTransformPreview?.texture || !Array.isArray(rasterTransformPreview.quad)) {
          return;
        }

        const drawOptions = {
          camera,
          opacity: rasterTransformPreview.opacity * layerOpacity,
          viewportHeight,
          viewportWidth,
        };

        if (rasterTransformPreview.transformMode === "perspective") {
          this.drawPerspectiveTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
        } else {
          this.drawTexturedQuad(rasterTransformPreview.texture, rasterTransformPreview.quad, drawOptions);
        }

        bindArtboardProgram();
      };
      const didUpdatePreviewCache = canUsePreviewCache
        ? this.updatePreviewCacheIfNeeded()
        : false;
      const usePreviewCache = canUsePreviewCache && didUpdatePreviewCache && this.previewCacheReady;

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

      bindArtboardProgram();

      // Pass 1: layer documento, dal basso verso l'alto.
      gl.uniform1f(uniforms.gridMode, 0.0);

      if (usePreviewCache) {
        const activeStrokeOpacity = this.getLayerOpacity(activeStrokeLayerId, renderableLayers);

        drawTexture(this.previewTexture, 1);

        if (options.activeStrokeTexture && activeStrokeMode !== "eraser") {
          drawTexture(options.activeStrokeTexture, activeStrokeOpacity, activeStrokeRect);
          didDrawActiveStroke = true;
        }
      } else {
        let currentClipBase = null;
        const isValidClipBaseLayer = (layer) => Boolean(
          layer &&
          layer.type !== "group" &&
          layer.type !== "background" &&
          layer.id !== "background"
        );

        for (const layer of orderedLayers) {
          const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
          const isClippingLayer = layer.clippingMask === true;
          const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
          const isActiveStrokeLayer = options.activeStrokeTexture && layer.id === activeStrokeLayerId;
          const isRasterTransformPreviewLayer = rasterTransformPreview?.layerId === layer.id;
          const eraserMaskTexture = isActiveStrokeLayer && activeStrokeMode === "eraser"
            ? options.activeStrokeTexture
            : null;
          const clipBase = isClippingLayer ? currentClipBase : null;

          if (!isClippingLayer) {
            currentClipBase = isValidClipBaseLayer(layer)
              ? {
                  layer,
                  target: layerTarget,
                  visible: layer.visible !== false,
                }
              : null;
          }

          if (layer.visible === false) {
            continue;
          }

          if (isClippingLayer && (!clipBase?.visible || !clipBase?.target?.texture)) {
            continue;
          }

          if (layerTarget?.texture) {
            if (isRasterTransformPreviewLayer) {
              setPreviewCut(rasterTransformPreview.sourceRect);
            }

            if (eraserMaskTexture) {
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, eraserMaskTexture);
              gl.uniform1f(uniforms.maskMode, 1.0);
              if (activeStrokeRect) {
                gl.uniform1f(uniforms.maskRectMode, 1.0);
                gl.uniform4f(
                  uniforms.maskRect,
                  activeStrokeRect.x,
                  activeStrokeRect.y,
                  activeStrokeRect.width,
                  activeStrokeRect.height,
                );
              } else {
                gl.uniform1f(uniforms.maskRectMode, 0.0);
                gl.uniform4f(uniforms.maskRect, 0, 0, target.width, target.height);
              }
              gl.activeTexture(gl.TEXTURE0);
            }

            if (this.hasPuppetLayerTransform(layer) && !eraserMaskTexture) {
              if (isClippingLayer) {
                drawTexture(layerTarget.texture, opacity, null, clipBase);
              } else {
                const didDrawPuppet = this.drawPuppetLayer(layer, layerTarget, opacity, {
                  camera,
                  viewportHeight,
                  viewportWidth,
                });

                bindArtboardProgram();

                if (!didDrawPuppet) {
                  drawTexture(layerTarget.texture, opacity);
                }
              }
            } else {
              drawTexture(layerTarget.texture, opacity, null, clipBase);
            }

            if (isRasterTransformPreviewLayer) {
              setPreviewCut(null);
            }

            if (eraserMaskTexture) {
              gl.uniform1f(uniforms.maskMode, 0.0);
              gl.uniform1f(uniforms.maskRectMode, 0.0);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.activeTexture(gl.TEXTURE0);
              didDrawActiveStroke = true;
            }
          }

          if (isRasterTransformPreviewLayer) {
            drawRasterTransformPreview(opacity);
          }

          if (isActiveStrokeLayer && activeStrokeMode !== "eraser") {
            drawTexture(options.activeStrokeTexture, opacity, activeStrokeRect, clipBase);
            didDrawActiveStroke = true;
          }
        }
      }

      if (options.activeStrokeTexture && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          drawTexture(options.activeStrokeTexture, 1.0, activeStrokeRect);
        }
      }

      // Pass 2: griglia pixel sopra tutto. Lo shader la attiva solo a zoom alto.
      setDocumentProjection(target.width, target.height, camera.x || 0, camera.y || 0);
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
      this.layerModel?.removeEventListener?.("change", this.handleLayerModelChange);
      window.removeEventListener("cbo:document-content-change", this.handleDocumentContentChange);
      window.removeEventListener("cbo:history-change", this.handleHistoryChange);

      this.deletePreviewCache();

      if (this.quad) {
        gl.deleteBuffer(this.quad.buffer);
        gl.deleteVertexArray(this.quad.vao);
        this.quad = null;
      }

      if (this.texturedQuad) {
        gl.deleteBuffer(this.texturedQuad.buffer);
        gl.deleteVertexArray(this.texturedQuad.vao);
        this.texturedQuad = null;
      }

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }

      if (this.puppetProgramInfo?.program) {
        gl.deleteProgram(this.puppetProgramInfo.program);
        this.puppetProgramInfo = null;
      }

      if (this.perspectiveQuadProgramInfo?.program) {
        gl.deleteProgram(this.perspectiveQuadProgramInfo.program);
        this.perspectiveQuadProgramInfo = null;
      }

      for (const layerId of Array.from(this.puppetMeshResourcesByLayerId.keys())) {
        this.deletePuppetMeshResource(layerId);
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
