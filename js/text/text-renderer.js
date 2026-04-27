(function registerTextRenderer(namespace) {
  const TEXT_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;

uniform vec2 uViewportSize;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;

void main() {
  vec2 viewportPixel = uCameraPosition + a_position * uCameraZoom;
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = a_uv;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const TEXT_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform vec4 uFillColor;

in vec2 v_uv;

out vec4 outColor;

void main() {
  float coverage = texture(uAtlas, v_uv).a;
  float alpha = coverage * uFillColor.a;

  outColor = vec4(uFillColor.rgb * alpha, alpha);
}
`;

  const DEFAULT_CHARACTERS =
    " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
    ".,;:!?\"'`´()[]{}<>+-*/=_%#@&$€£°^~|\\àèéìòùÀÈÉÌÒÙáíóúÁÍÓÚñÑçÇ";

  class TextRenderer {
    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createProgram !== "function") {
        throw new TypeError("TextRenderer richiede un contesto WebGL2 valido.");
      }

      this.gl = options.gl;
      this.atlasCache = new Map();
      this.isDisposed = false;
      this.programInfo = this.createProgramInfo();
      this.geometry = this.createGeometry();
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader testo WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || "Errore sconosciuto nello shader testo.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    createProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, TEXT_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, TEXT_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma testo WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || "Errore sconosciuto nel link programma testo.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          atlas: gl.getUniformLocation(program, "uAtlas"),
          cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          cameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          fillColor: gl.getUniformLocation(program, "uFillColor"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
        },
      };
    }

    createGeometry() {
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

        throw new Error("Impossibile creare la geometria testo WebGL2.");
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);

      return { vao, buffer, vertexCount: 0 };
    }

    getFontKey(font = {}) {
      return [
        font.style || "normal",
        font.weight || 700,
        Math.round(Number(font.size) || 72),
        font.family || "Inter, Arial, sans-serif",
      ].join("|");
    }

    getCanvasFont(font = {}) {
      const style = font.style || "normal";
      const weight = font.weight || 700;
      const size = Math.round(Number(font.size) || 72);
      const family = font.family || "Inter, Arial, sans-serif";

      return `${style} ${weight} ${size}px ${family}`;
    }

    getCharacterSet(text) {
      return Array.from(new Set(`${DEFAULT_CHARACTERS}${text || ""}`)).sort().join("");
    }

    getAtlas(font, text) {
      const characters = this.getCharacterSet(text);
      const cacheKey = `${this.getFontKey(font)}|${characters}`;
      const cachedAtlas = this.atlasCache.get(cacheKey);

      if (cachedAtlas) {
        return cachedAtlas;
      }

      const atlas = this.createAtlas(font, characters);

      this.atlasCache.set(cacheKey, atlas);

      return atlas;
    }

    createCanvas(width, height) {
      if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
      }

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      return canvas;
    }

    createAtlas(font, characters) {
      const gl = this.gl;
      const fontSize = Math.round(Number(font.size) || 72);
      const padding = Math.max(6, Math.ceil(fontSize * 0.12));
      const measureCanvas = this.createCanvas(1, 1);
      const measureContext = measureCanvas.getContext("2d");
      const glyphMetrics = new Map();
      let maxWidth = 1;
      let maxAscent = fontSize * 0.8;
      let maxDescent = fontSize * 0.25;

      measureContext.font = this.getCanvasFont(font);
      measureContext.textBaseline = "alphabetic";

      Array.from(characters).forEach((character) => {
        const metrics = measureContext.measureText(character);
        const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
        const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25;
        const left = metrics.actualBoundingBoxLeft || 0;
        const right = metrics.actualBoundingBoxRight || metrics.width;
        const inkWidth = Math.max(1, Math.ceil(right - left));
        const inkHeight = Math.max(1, Math.ceil(ascent + descent));

        glyphMetrics.set(character, {
          advance: Math.max(metrics.width, inkWidth),
          ascent,
          descent,
          left,
          inkWidth,
          inkHeight,
        });
        maxWidth = Math.max(maxWidth, Math.ceil(inkWidth + Math.abs(left)));
        maxAscent = Math.max(maxAscent, ascent);
        maxDescent = Math.max(maxDescent, descent);
      });

      const cellWidth = Math.ceil(maxWidth + padding * 2);
      const cellHeight = Math.ceil(maxAscent + maxDescent + padding * 2);
      const maxTextureSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, 4096);
      const columns = Math.max(1, Math.floor(maxTextureSize / cellWidth));
      const rows = Math.max(1, Math.ceil(characters.length / columns));
      const width = Math.min(maxTextureSize, Math.max(cellWidth, columns * cellWidth));
      const height = Math.min(maxTextureSize, Math.max(cellHeight, rows * cellHeight));
      const canvas = this.createCanvas(width, height);
      const context = canvas.getContext("2d");
      const texture = gl.createTexture();
      const glyphs = new Map();

      if (!texture) {
        throw new Error("Impossibile creare la texture atlas del testo.");
      }

      context.clearRect(0, 0, width, height);
      context.font = this.getCanvasFont(font);
      context.textBaseline = "alphabetic";
      context.fillStyle = "#ffffff";

      Array.from(characters).forEach((character, index) => {
        const metrics = glyphMetrics.get(character);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const cellX = column * cellWidth;
        const cellY = row * cellHeight;
        const baseline = cellY + padding + maxAscent;
        const inkX = cellX + padding;
        const inkY = baseline - metrics.ascent;
        const drawX = inkX - metrics.left;

        context.fillText(character, drawX, baseline);
        glyphs.set(character, {
          advance: metrics.advance,
          offsetX: metrics.left,
          offsetY: -metrics.ascent,
          width: metrics.inkWidth,
          height: metrics.inkHeight,
          u0: inkX / width,
          v0: inkY / height,
          u1: (inkX + metrics.inkWidth) / width,
          v1: (inkY + metrics.inkHeight) / height,
        });
      });

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return {
        texture,
        glyphs,
        ascent: maxAscent,
        fontSize,
      };
    }

    normalizeColor(color, opacity) {
      if (!Array.isArray(color)) {
        return [1, 1, 1, opacity];
      }

      return [
        Number.isFinite(color[0]) ? Math.min(1, Math.max(0, color[0])) : 1,
        Number.isFinite(color[1]) ? Math.min(1, Math.max(0, color[1])) : 1,
        Number.isFinite(color[2]) ? Math.min(1, Math.max(0, color[2])) : 1,
        (Number.isFinite(color[3]) ? Math.min(1, Math.max(0, color[3])) : 1) * opacity,
      ];
    }

    getLayerBox(layer = {}) {
      const box = layer.box || {};

      return {
        x: Number.isFinite(box.x) ? box.x : 0,
        y: Number.isFinite(box.y) ? box.y : 0,
        width: Number.isFinite(box.width) ? Math.max(1, box.width) : 640,
        height: Number.isFinite(box.height) ? Math.max(1, box.height) : 180,
      };
    }

    getLayerTransform(layer = {}, box) {
      const transform = layer.transform || {};

      return {
        x: Number.isFinite(transform.x) ? transform.x : box.x,
        y: Number.isFinite(transform.y) ? transform.y : box.y,
        rotation: Number.isFinite(transform.rotation) ? transform.rotation : 0,
        scaleX: Number.isFinite(transform.scaleX) ? transform.scaleX : 1,
        scaleY: Number.isFinite(transform.scaleY) ? transform.scaleY : 1,
        skewX: Number.isFinite(transform.skewX) ? transform.skewX : 0,
        skewY: Number.isFinite(transform.skewY) ? transform.skewY : 0,
        anchorX: Number.isFinite(transform.anchorX) ? transform.anchorX : 0,
        anchorY: Number.isFinite(transform.anchorY) ? transform.anchorY : 0,
      };
    }

    applyTransform(pointX, pointY, box, transform) {
      let x = pointX - box.width * transform.anchorX;
      let y = pointY - box.height * transform.anchorY;
      const skewX = Math.tan((transform.skewX * Math.PI) / 180);
      const skewY = Math.tan((transform.skewY * Math.PI) / 180);
      const skewedX = x + y * skewX;
      const skewedY = y + x * skewY;

      x = skewedX * transform.scaleX;
      y = skewedY * transform.scaleY;

      const radians = (transform.rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      return {
        x: transform.x + x * cos - y * sin,
        y: transform.y + x * sin + y * cos,
      };
    }

    measureLineWidth(line, atlas, letterSpacing) {
      let width = 0;
      const characters = Array.from(line);

      characters.forEach((character, index) => {
        const glyph = atlas.glyphs.get(character) || atlas.glyphs.get(" ");

        if (!glyph) {
          return;
        }

        width += glyph.advance;

        if (index < characters.length - 1) {
          width += letterSpacing;
        }
      });

      return width;
    }

    wrapText(text, atlas, boxWidth, letterSpacing) {
      const paragraphs = String(text || "").split(/\r?\n/);
      const lines = [];

      paragraphs.forEach((paragraph) => {
        const tokens = paragraph.split(/(\s+)/).filter((token) => token.length);
        let currentLine = "";

        tokens.forEach((token) => {
          const candidate = `${currentLine}${token}`;
          const candidateWidth = this.measureLineWidth(candidate.trimEnd(), atlas, letterSpacing);

          if (currentLine && candidateWidth > boxWidth) {
            lines.push(currentLine.trimEnd());
            currentLine = token.trimStart();
            return;
          }

          currentLine = candidate;
        });

        lines.push(currentLine.trimEnd());
      });

      return lines.length ? lines : [""];
    }

    buildVertices(layer, atlas) {
      const style = layer.style || {};
      const font = layer.font || {};
      const box = this.getLayerBox(layer);
      const transform = this.getLayerTransform(layer, box);
      const letterSpacing = Number.isFinite(style.letterSpacing) ? style.letterSpacing : 0;
      const lineHeight = (Number.isFinite(style.lineHeight) ? style.lineHeight : 1.15) * atlas.fontSize;
      const align = ["center", "right"].includes(style.align) ? style.align : "left";
      const lines = this.wrapText(layer.text || "", atlas, box.width, letterSpacing);
      const vertices = [];

      lines.forEach((line, lineIndex) => {
        const lineWidth = this.measureLineWidth(line, atlas, letterSpacing);
        let penX = 0;

        if (align === "center") {
          penX = (box.width - lineWidth) * 0.5;
        } else if (align === "right") {
          penX = box.width - lineWidth;
        }

        const baselineY = atlas.ascent + lineIndex * lineHeight;

        const characters = Array.from(line);

        characters.forEach((character, characterIndex) => {
          const glyph = atlas.glyphs.get(character) || atlas.glyphs.get(" ");

          if (!glyph) {
            return;
          }

          if (character !== " ") {
            const x0 = penX + glyph.offsetX;
            const y0 = baselineY + glyph.offsetY;
            const x1 = x0 + glyph.width;
            const y1 = y0 + glyph.height;
            const topLeft = this.applyTransform(x0, y0, box, transform);
            const topRight = this.applyTransform(x1, y0, box, transform);
            const bottomLeft = this.applyTransform(x0, y1, box, transform);
            const bottomRight = this.applyTransform(x1, y1, box, transform);

            vertices.push(
              topLeft.x, topLeft.y, glyph.u0, glyph.v0,
              bottomLeft.x, bottomLeft.y, glyph.u0, glyph.v1,
              topRight.x, topRight.y, glyph.u1, glyph.v0,
              topRight.x, topRight.y, glyph.u1, glyph.v0,
              bottomLeft.x, bottomLeft.y, glyph.u0, glyph.v1,
              bottomRight.x, bottomRight.y, glyph.u1, glyph.v1,
            );
          }

          penX += glyph.advance;

          if (characterIndex < characters.length - 1) {
            penX += letterSpacing;
          }
        });
      });

      return new Float32Array(vertices);
    }

    drawLayer(layer, options = {}) {
      if (this.isDisposed || !layer || layer.visible === false) {
        return;
      }

      const text = String(layer.text || "");

      if (!text.trim()) {
        return;
      }

      const gl = this.gl;
      const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;
      const atlas = this.getAtlas(layer.font || {}, text);
      const vertices = this.buildVertices(layer, atlas);

      if (!vertices.length) {
        return;
      }

      const { program, uniforms } = this.programInfo;
      const camera = options.camera || { x: 0, y: 0, zoom: 1 };
      const viewportWidth = Math.max(1, Math.round(options.viewportWidth || gl.canvas?.width || 1));
      const viewportHeight = Math.max(1, Math.round(options.viewportHeight || gl.canvas?.height || 1));
      const fillColor = this.normalizeColor(layer.style?.fillColor, opacity);

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
      gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
      gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
      gl.uniform4f(uniforms.fillColor, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      gl.uniform1i(uniforms.atlas, 0);

      gl.bindVertexArray(this.geometry.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.geometry.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
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

      if (this.geometry) {
        gl.deleteBuffer(this.geometry.buffer);
        gl.deleteVertexArray(this.geometry.vao);
        this.geometry = null;
      }

      if (this.programInfo?.program) {
        gl.deleteProgram(this.programInfo.program);
        this.programInfo = null;
      }

      this.atlasCache.forEach((atlas) => {
        if (atlas.texture) {
          gl.deleteTexture(atlas.texture);
        }
      });
      this.atlasCache.clear();
    }
  }

  namespace.TextRenderer = TextRenderer;
})(window.CBO = window.CBO || {});
