(function registerImageRasterizer(namespace) {
  const PLACE_IMAGE_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;

uniform vec2 u_docResolution;
uniform vec4 u_destinationRect;

out vec2 v_uv;

void main() {
  vec2 documentPosition = u_destinationRect.xy + a_corner * u_destinationRect.zw;
  vec2 clipPosition = (documentPosition / u_docResolution) * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_uv = a_corner;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const PLACE_IMAGE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_uv;

out vec4 outColor;

void main() {
  vec4 color = texture(u_texture, v_uv);

  outColor = vec4(color.rgb * color.a, color.a);
}
`;

  class ImageRasterizer {
    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createProgram !== "function") {
        throw new TypeError("ImageRasterizer richiede un contesto WebGL2 valido.");
      }

      if (typeof options.getTarget !== "function") {
        throw new TypeError("ImageRasterizer richiede una funzione getTarget.");
      }

      this.gl = options.gl;
      this.getTarget = options.getTarget;
      this.createTargetForPlacement = typeof options.createTargetForPlacement === "function"
        ? options.createTargetForPlacement
        : null;
      this.isDisposed = false;
      this.programInfo = this.createPlacedImageProgramInfo();
      this.quad = this.createPlacementQuad();
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Impossibile creare lo shader image rasterizer WebGL2.");
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info =
          gl.getShaderInfoLog(shader) || "Errore sconosciuto nella compilazione dello shader image rasterizer.";

        gl.deleteShader(shader);
        throw new Error(info);
      }

      return shader;
    }

    createPlacedImageProgramInfo() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, PLACE_IMAGE_VERTEX_SHADER_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, PLACE_IMAGE_FRAGMENT_SHADER_SOURCE);
      const program = gl.createProgram();

      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Impossibile creare il programma image placement WebGL2.");
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info =
          gl.getProgramInfoLog(program) || "Errore sconosciuto nel link del programma image placement.";

        gl.deleteProgram(program);
        throw new Error(info);
      }

      return {
        program,
        uniforms: {
          destinationRect: gl.getUniformLocation(program, "u_destinationRect"),
          docResolution: gl.getUniformLocation(program, "u_docResolution"),
          texture: gl.getUniformLocation(program, "u_texture"),
        },
      };
    }

    createPlacementQuad() {
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

        throw new Error("Impossibile creare le risorse GPU per l'image rasterizer.");
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

    async placeBlob(blob, options = {}) {
      if (!(blob instanceof Blob)) {
        throw new TypeError("placeBlob richiede un Blob immagine.");
      }

      const decodedImage = await this.decodeImageBlob(blob);

      try {
        this.placeRasterImage(decodedImage.source, options);
      } finally {
        decodedImage.close?.();
      }
    }

    async decodeImageBlob(blob) {
      if (window.createImageBitmap) {
        try {
          const bitmap = await window.createImageBitmap(blob);

          return {
            source: bitmap,
            close: () => bitmap.close?.(),
          };
        } catch (error) {
          console.warn("createImageBitmap non disponibile per questo upload, uso fallback HTMLImage.", error);
        }
      }

      return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();

        image.onload = () => {
          resolve({
            source: image,
            close: () => URL.revokeObjectURL(objectUrl),
          });
        };

        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Impossibile decodificare l'immagine caricata."));
        };

        image.src = objectUrl;
      });
    }

    getRasterSourceSize(source) {
      return {
        width: Math.max(1, Math.round(source.naturalWidth || source.videoWidth || source.width || 1)),
        height: Math.max(1, Math.round(source.naturalHeight || source.videoHeight || source.height || 1)),
      };
    }

    createRasterImageTexture(source) {
      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture dell'immagine caricata.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return texture;
    }

    placeRasterImage(source, options = {}) {
      if (this.isDisposed) {
        return;
      }

      const { width, height } = this.getRasterSourceSize(source);
      const target = options.target ||
        this.createTargetForPlacement?.({
          ...options,
          sourceHeight: height,
          sourceWidth: width,
        }) ||
        this.getTarget(options);

      if (!target || !Number.isFinite(target.width) || !Number.isFinite(target.height)) {
        throw new Error("ImageRasterizer richiede un target raster valido.");
      }

      const gl = this.gl;
      const targetWidth = Math.max(1, Math.round(target.width));
      const targetHeight = Math.max(1, Math.round(target.height));
      const x = Number.isFinite(options.x)
        ? options.x
        : (Number.isFinite(target.drawX)
            ? target.drawX
            : (target.cropped ? 0 : Math.round((targetWidth - width) * 0.5)));
      const y = Number.isFinite(options.y)
        ? options.y
        : (Number.isFinite(target.drawY)
            ? target.drawY
            : (target.cropped ? 0 : Math.round((targetHeight - height) * 0.5)));
      const texture = this.createRasterImageTexture(source);
      const { program, uniforms } = this.programInfo;

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer ?? null);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(program);
        gl.uniform2f(uniforms.docResolution, targetWidth, targetHeight);
        gl.uniform4f(uniforms.destinationRect, x, y, width, height);
        gl.uniform1i(uniforms.texture, 0);

        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } finally {
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(texture);
      }

      if (options.emit !== false) {
        window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
          detail: {
            layerId: target.layerId || null,
            source: options.source || "image-rasterizer",
          },
        }));
      }
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
    }
  }

  namespace.ImageRasterizer = ImageRasterizer;
})(window.CBO = window.CBO || {});
