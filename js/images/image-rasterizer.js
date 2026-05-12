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

  const RASTER_BYTES_PER_PIXEL = 4;
  const RASTER_MIB = 1024 * 1024;
  const IMPORT_MEMORY_POLICY = Object.freeze({
    hugeCoverage: 0.35,
    largeMaxBytes: 128 * RASTER_MIB,
    maxOriginalPixels: 4096 * 4096,
    maxSourceMiB: 16,
    maxSourceSide: 4096,
    mediumMaxBytes: 64 * RASTER_MIB,
    normalMaxBytes: 16 * RASTER_MIB,
  });

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
      this.maxImportSourceMiB = this.toPositiveNumber(
        options.maxImportSourceMiB,
        IMPORT_MEMORY_POLICY.maxSourceMiB,
      );
      this.maxImportSourceSide = this.toPositiveNumber(
        options.maxImportSourceSide,
        IMPORT_MEMORY_POLICY.maxSourceSide,
      );
      this.maxImportOriginalPixels = this.toPositiveNumber(
        options.maxImportOriginalPixels,
        IMPORT_MEMORY_POLICY.maxOriginalPixels,
      );
      this.isDisposed = false;
      this.programInfo = this.createPlacedImageProgramInfo();
      this.quad = this.createPlacementQuad();
    }

    toPositiveNumber(value, fallback) {
      const number = Number(value);

      return Number.isFinite(number) && number > 0 ? number : fallback;
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

    nextImageRasterResourceOwnerId(prefix = "image-raster-resource") {
      this.rasterResourceIdSequence = this.rasterResourceIdSequence || 1;

      return `${prefix}-${this.rasterResourceIdSequence++}`;
    }

    registerImageRasterTexture(texture, metadata = {}) {
      const manager = this.getRasterResourceManager();

      if (!manager?.registerTexture || !texture) {
        return null;
      }

      return manager.registerTexture(texture, this.getRasterResourceDocumentMetadata(metadata));
    }

    getRasterBytes(width, height) {
      const safeWidth = Math.max(0, Math.round(Number(width) || 0));
      const safeHeight = Math.max(0, Math.round(Number(height) || 0));

      return safeWidth * safeHeight * RASTER_BYTES_PER_PIXEL;
    }

    getDocumentSize() {
      const renderer = window.CBO?.documentRenderer || this.documentRenderer;

      return {
        height: Math.max(0, Math.round(Number(renderer?.height) || 0)),
        width: Math.max(0, Math.round(Number(renderer?.width) || 0)),
      };
    }

    getRectCoverage(width, height) {
      const documentSize = this.getDocumentSize();
      const documentPixels = documentSize.width * documentSize.height;

      if (documentPixels <= 0) {
        return 0;
      }

      return Math.min(1, Math.max(0, (Math.max(0, width) * Math.max(0, height)) / documentPixels));
    }

    getImportMemoryCaps(options = {}) {
      const requestedMaxSide = this.toPositiveNumber(
        options.maxImportSourceSide ?? options.maxSourceSide,
        this.maxImportSourceSide,
      );
      const requestedMaxMiB = this.toPositiveNumber(
        options.maxImportSourceMiB ?? options.maxSourceMiB,
        this.maxImportSourceMiB,
      );
      const glMaxTextureSize = this.toPositiveNumber(
        this.gl?.getParameter?.(this.gl.MAX_TEXTURE_SIZE),
        requestedMaxSide,
      );

      return {
        maxOriginalPixels: this.toPositiveNumber(
          options.maxImportOriginalPixels ?? options.maxOriginalPixels,
          this.maxImportOriginalPixels,
        ),
        maxMiB: requestedMaxMiB,
        maxSide: Math.max(1, Math.floor(Math.min(requestedMaxSide, glMaxTextureSize))),
      };
    }

    fitImageSize(width, height, options = {}) {
      const sourceWidth = Math.max(1, Math.round(Number(width) || 1));
      const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
      const caps = this.getImportMemoryCaps(options);
      const maxPixelsByMemory = (caps.maxMiB * RASTER_MIB) / RASTER_BYTES_PER_PIXEL;
      const scale = Math.min(
        1,
        caps.maxSide / sourceWidth,
        caps.maxSide / sourceHeight,
        Math.sqrt(maxPixelsByMemory / (sourceWidth * sourceHeight)),
      );

      return {
        height: Math.max(1, Math.floor(sourceHeight * scale)),
        maxMiB: caps.maxMiB,
        maxSide: caps.maxSide,
        scale,
        width: Math.max(1, Math.floor(sourceWidth * scale)),
      };
    }

    classifyImportMemory(estimatedPeakBytes, coverage = 0) {
      if (
        estimatedPeakBytes > IMPORT_MEMORY_POLICY.largeMaxBytes ||
        coverage >= IMPORT_MEMORY_POLICY.hugeCoverage
      ) {
        return "huge";
      }

      if (estimatedPeakBytes > IMPORT_MEMORY_POLICY.mediumMaxBytes) {
        return "large";
      }

      if (estimatedPeakBytes > IMPORT_MEMORY_POLICY.normalMaxBytes) {
        return "medium";
      }

      return "normal";
    }

    createImportDecodeReport(originalSize, decodedSize, options = {}) {
      const originalBytes = this.getRasterBytes(originalSize.width, originalSize.height);
      const sourceBytes = this.getRasterBytes(decodedSize.width, decodedSize.height);
      const resized = decodedSize.width !== originalSize.width || decodedSize.height !== originalSize.height;

      return {
        decodedSize: {
          height: decodedSize.height,
          width: decodedSize.width,
        },
        maxMiB: decodedSize.maxMiB,
        maxSide: decodedSize.maxSide,
        operationType: "image-import",
        originalBytes,
        originalSize: {
          height: originalSize.height,
          width: originalSize.width,
        },
        policy: this.classifyImportMemory(sourceBytes),
        reason: resized ? "image-resized-before-webgl-upload" : "image-kept-within-import-budget",
        scale: decodedSize.scale,
        source: options.source || "image-rasterizer",
        sourceBytes,
        tool: "image-import",
      };
    }

    createImportRejectionReport(originalSize, options = {}) {
      const originalBytes = this.getRasterBytes(originalSize.width, originalSize.height);
      const caps = this.getImportMemoryCaps(options);

      return {
        canvasSize: this.getDocumentSize(),
        decodedSize: { height: 0, width: 0 },
        estimatedPeakBytes: originalBytes,
        maxOriginalPixels: caps.maxOriginalPixels,
        operationType: "image-import",
        originalBytes,
        originalSize: {
          height: originalSize.height,
          width: originalSize.width,
        },
        policy: "huge",
        reason: "image-original-pixels-over-budget",
        scale: 0,
        source: options.source || "image-rasterizer",
        sourceBytes: 0,
        targetBytes: 0,
        tool: "image-import",
      };
    }

    assertImportOriginalWithinBudget(originalSize, options = {}) {
      const caps = this.getImportMemoryCaps(options);
      const pixels = Math.max(0, originalSize.width || 0) * Math.max(0, originalSize.height || 0);

      if (pixels <= caps.maxOriginalPixels) {
        return;
      }

      const report = this.createImportRejectionReport(originalSize, options);

      this.recordRasterOperation(report);
      throw new Error(
        `Immagine troppo grande per l'editing live: ${originalSize.width}x${originalSize.height}px.`,
      );
    }

    finalizeImportMemoryReport(report, context = {}) {
      const targetWidth = Math.max(1, Math.round(Number(context.targetWidth) || 1));
      const targetHeight = Math.max(1, Math.round(Number(context.targetHeight) || 1));
      const targetBytes = this.getRasterBytes(targetWidth, targetHeight);
      const sourceBytes = Number(report?.sourceBytes) || this.getRasterBytes(context.sourceWidth, context.sourceHeight);
      const estimatedPeakBytes = sourceBytes + targetBytes;
      const coverage = this.getRectCoverage(targetWidth, targetHeight);

      return {
        ...report,
        canvasSize: this.getDocumentSize(),
        coverage,
        estimatedPeakBytes,
        layerId: context.layerId || report?.layerId || "",
        operationType: report?.operationType || "image-rasterizer-place",
        persistentBytes: targetBytes,
        policy: this.classifyImportMemory(estimatedPeakBytes, coverage),
        source: report?.source || context.source || "image-rasterizer",
        sourceRect: {
          height: Math.max(1, Math.round(Number(context.sourceHeight) || 1)),
          width: Math.max(1, Math.round(Number(context.sourceWidth) || 1)),
          x: Math.round(Number(context.drawX) || 0),
          y: Math.round(Number(context.drawY) || 0),
        },
        targetBytes,
        targetRect: {
          height: targetHeight,
          width: targetWidth,
          x: Math.round(Number(context.targetX) || 0),
          y: Math.round(Number(context.targetY) || 0),
        },
        tool: report?.tool || "image-rasterizer",
      };
    }

    recordRasterOperation(report) {
      const recorded = this.getRasterResourceManager()?.recordRasterOperation?.(report) || report;

      if (window.CBO) {
        if (recorded?.operationType === "image-import") {
          window.CBO.lastImageImportMemoryReport = recorded;
        }

        window.CBO.lastRasterOperationMemoryReport = recorded;
        window.CBO.documentRenderer?.evictRasterScratchCachesForPolicy?.(recorded, {
          source: "image-rasterizer",
        });
      }

      return recorded;
    }

    deleteImageRasterTexture(textureOrId) {
      return this.getRasterResourceManager()?.deleteTexture?.(textureOrId) || false;
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

      const decodedImage = await this.decodeImageBlob(blob, options);

      try {
        return this.placeRasterImage(decodedImage.source, {
          ...options,
          importMemoryReport: decodedImage.memoryReport,
        });
      } finally {
        decodedImage.close?.();
      }
    }

    async decodeImageBlob(blob, options = {}) {
      const headerSize = await this.readBlobImageSize(blob);

      if (headerSize) {
        this.assertImportOriginalWithinBudget(headerSize, options);
      }

      if (window.createImageBitmap) {
        try {
          if (headerSize) {
            const decodedSize = this.fitImageSize(headerSize.width, headerSize.height, options);
            const bitmapOptions = decodedSize.scale < 1
              ? {
                  resizeHeight: decodedSize.height,
                  resizeQuality: "high",
                  resizeWidth: decodedSize.width,
                }
              : null;
            const bitmap = bitmapOptions
              ? await window.createImageBitmap(blob, bitmapOptions)
              : await window.createImageBitmap(blob);
            const bitmapSize = this.getRasterSourceSize(bitmap);
            const report = this.createImportDecodeReport(headerSize, {
              ...decodedSize,
              height: bitmapSize.height,
              width: bitmapSize.width,
            }, options);

            return {
              close: () => bitmap.close?.(),
              memoryReport: report,
              source: bitmap,
            };
          }

          const bitmap = await window.createImageBitmap(blob);
          const originalSize = this.getRasterSourceSize(bitmap);
          this.assertImportOriginalWithinBudget(originalSize, options);
          const decodedSize = this.fitImageSize(originalSize.width, originalSize.height, options);

          if (decodedSize.scale < 1) {
            let resizedBitmap = null;

            try {
              resizedBitmap = await window.createImageBitmap(bitmap, {
                resizeHeight: decodedSize.height,
                resizeQuality: "high",
                resizeWidth: decodedSize.width,
              });
            } finally {
              bitmap.close?.();
            }

            const resizedSize = this.getRasterSourceSize(resizedBitmap);
            const report = this.createImportDecodeReport(originalSize, {
              ...decodedSize,
              height: resizedSize.height,
              width: resizedSize.width,
            }, options);

            return {
              close: () => resizedBitmap.close?.(),
              memoryReport: report,
              source: resizedBitmap,
            };
          }

          return {
            close: () => bitmap.close?.(),
            memoryReport: this.createImportDecodeReport(originalSize, decodedSize, options),
            source: bitmap,
          };
        } catch (error) {
          if (String(error?.message || "").includes("Immagine troppo grande")) {
            throw error;
          }

          console.warn("createImageBitmap non disponibile per questo upload, uso fallback HTMLImage.", error);
        }
      }

      return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();

        image.onload = () => {
          const originalSize = this.getRasterSourceSize(image);
          try {
            this.assertImportOriginalWithinBudget(originalSize, options);
          } catch (error) {
            URL.revokeObjectURL(objectUrl);
            reject(error);
            return;
          }

          const decodedSize = this.fitImageSize(originalSize.width, originalSize.height, options);

          if (decodedSize.scale < 1) {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", { alpha: true });

            canvas.width = decodedSize.width;
            canvas.height = decodedSize.height;

            if (!context) {
              URL.revokeObjectURL(objectUrl);
              reject(new Error("Impossibile ridimensionare l'immagine caricata."));
              return;
            }

            context.drawImage(image, 0, 0, decodedSize.width, decodedSize.height);
            URL.revokeObjectURL(objectUrl);

            resolve({
              close: () => {
                canvas.width = 1;
                canvas.height = 1;
              },
              memoryReport: this.createImportDecodeReport(originalSize, decodedSize, options),
              source: canvas,
            });
            return;
          }

          resolve({
            close: () => URL.revokeObjectURL(objectUrl),
            memoryReport: this.createImportDecodeReport(originalSize, decodedSize, options),
            source: image,
          });
        };

        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Impossibile decodificare l'immagine caricata."));
        };

        image.src = objectUrl;
      });
    }

    async readBlobImageSize(blob) {
      try {
        const header = new Uint8Array(await blob.slice(0, 1024 * 1024).arrayBuffer());

        return this.readPngSize(header) || this.readJpegSize(header) || this.readWebpSize(header);
      } catch (_error) {
        return null;
      }
    }

    readPngSize(header) {
      if (
        header.length < 24 ||
        header[0] !== 0x89 ||
        header[1] !== 0x50 ||
        header[2] !== 0x4E ||
        header[3] !== 0x47
      ) {
        return null;
      }

      return {
        height: this.readUint32Be(header, 20),
        width: this.readUint32Be(header, 16),
      };
    }

    readJpegSize(header) {
      if (header.length < 4 || header[0] !== 0xFF || header[1] !== 0xD8) {
        return null;
      }

      let offset = 2;

      while (offset + 9 < header.length) {
        if (header[offset] !== 0xFF) {
          offset += 1;
          continue;
        }

        const marker = header[offset + 1];
        offset += 2;

        if (marker === 0xD9 || marker === 0xDA) {
          break;
        }

        if (offset + 2 > header.length) {
          break;
        }

        const length = this.readUint16Be(header, offset);

        if (length < 2 || offset + length > header.length) {
          break;
        }

        if (
          (marker >= 0xC0 && marker <= 0xC3) ||
          (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) ||
          (marker >= 0xCD && marker <= 0xCF)
        ) {
          return {
            height: this.readUint16Be(header, offset + 3),
            width: this.readUint16Be(header, offset + 5),
          };
        }

        offset += length;
      }

      return null;
    }

    readWebpSize(header) {
      if (
        header.length < 30 ||
        header[0] !== 0x52 ||
        header[1] !== 0x49 ||
        header[2] !== 0x46 ||
        header[3] !== 0x46 ||
        header[8] !== 0x57 ||
        header[9] !== 0x45 ||
        header[10] !== 0x42 ||
        header[11] !== 0x50
      ) {
        return null;
      }

      const chunk = String.fromCharCode(header[12], header[13], header[14], header[15]);

      if (chunk === "VP8X" && header.length >= 30) {
        return {
          height: 1 + this.readUint24Le(header, 27),
          width: 1 + this.readUint24Le(header, 24),
        };
      }

      if (chunk === "VP8 " && header.length >= 30) {
        return {
          height: this.readUint16Le(header, 28) & 0x3FFF,
          width: this.readUint16Le(header, 26) & 0x3FFF,
        };
      }

      if (chunk === "VP8L" && header.length >= 25 && header[20] === 0x2F) {
        const b0 = header[21];
        const b1 = header[22];
        const b2 = header[23];
        const b3 = header[24];

        return {
          height: 1 + (((b1 & 0xC0) >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10)),
          width: 1 + (b0 | ((b1 & 0x3F) << 8)),
        };
      }

      return null;
    }

    readUint16Be(bytes, offset) {
      return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
    }

    readUint16Le(bytes, offset) {
      return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8);
    }

    readUint24Le(bytes, offset) {
      return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16);
    }

    readUint32Be(bytes, offset) {
      return (
        ((bytes[offset] || 0) * 0x1000000) +
        ((bytes[offset + 1] || 0) << 16) +
        ((bytes[offset + 2] || 0) << 8) +
        (bytes[offset + 3] || 0)
      );
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

      const size = this.getRasterSourceSize(source);

      this.registerImageRasterTexture(texture, {
        bytes: this.getRasterBytes(size.width, size.height),
        height: size.height,
        kind: "importSourceTexture",
        label: "import source texture",
        ownerId: this.nextImageRasterResourceOwnerId("import-source-texture"),
        ownerType: "scratch",
        purgeable: true,
        reason: "image-rasterizer",
        width: size.width,
      });

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
      const destinationWidth = Math.max(
        1,
        Math.round(Number.isFinite(options.drawWidth) ? options.drawWidth : target.drawWidth || width),
      );
      const destinationHeight = Math.max(
        1,
        Math.round(Number.isFinite(options.drawHeight) ? options.drawHeight : target.drawHeight || height),
      );
      const x = Number.isFinite(options.x)
        ? options.x
        : (Number.isFinite(target.drawX)
            ? target.drawX
            : (target.cropped ? 0 : Math.round((targetWidth - destinationWidth) * 0.5)));
      const y = Number.isFinite(options.y)
        ? options.y
        : (Number.isFinite(target.drawY)
            ? target.drawY
            : (target.cropped ? 0 : Math.round((targetHeight - destinationHeight) * 0.5)));
      const targetX = Math.round(Number(target.x ?? target.originX) || 0);
      const targetY = Math.round(Number(target.y ?? target.originY) || 0);
      const destinationRect = {
        x: targetX + Math.round(Number(x) || 0),
        y: targetY + Math.round(Number(y) || 0),
        width: destinationWidth,
        height: destinationHeight,
      };
      const memoryReport = this.finalizeImportMemoryReport(options.importMemoryReport, {
        drawX: x,
        drawY: y,
        drawHeight: destinationHeight,
        drawWidth: destinationWidth,
        layerId: target.layerId || options.layerId || "",
        sourceHeight: height,
        sourceWidth: width,
        source: options.source || "image-rasterizer",
        targetHeight,
        targetWidth,
        targetX,
        targetY,
      });
      const texture = this.createRasterImageTexture(source);
      const { program, uniforms } = this.programInfo;

      this.recordRasterOperation(memoryReport);

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer ?? null);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(program);
        gl.uniform2f(uniforms.docResolution, targetWidth, targetHeight);
        gl.uniform4f(uniforms.destinationRect, x, y, destinationWidth, destinationHeight);
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
        this.deleteImageRasterTexture(texture);
        gl.deleteTexture(texture);
      }

      if (options.emit !== false) {
        window.dispatchEvent(new CustomEvent("cbo:document-content-change", {
          detail: {
            destinationRect,
            layerId: target.layerId || null,
            rect: destinationRect,
            source: options.source || "image-rasterizer",
          },
        }));
      }

      return {
        destinationRect,
        layerId: target.layerId || options.layerId || "",
        memoryReport,
        sourceRect: memoryReport.sourceRect,
        targetRect: memoryReport.targetRect,
      };
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
