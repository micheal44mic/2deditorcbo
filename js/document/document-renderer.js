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
uniform vec4 uDestinationRect;
uniform vec4 uUvRect;
uniform vec2 uCameraPosition;
uniform float uCameraZoom;

out vec2 v_uv;
out vec2 v_docPosition;

void main() {
  // aUnitCorner contiene i quattro angoli del layer/target in spazio normalizzato [0..1].
  vec2 documentPixel = uDestinationRect.xy + aUnitCorner * uDestinationRect.zw;

  // La camera conserva l'angolo alto-sinistro del documento in pixel fisici del viewport.
  // Lo zoom scala i pixel del documento prima di proiettarli sul canvas-monitor.
  vec2 viewportPixel = uCameraPosition + documentPixel * uCameraZoom;

  // WebGL usa clip space [-1..1] con asse Y positivo verso l'alto.
  // Il DOM usa pixel con origine in alto a sinistra: per questo invertiamo l'asse Y.
  vec2 clipPosition = vec2(
    (viewportPixel.x / uViewportSize.x) * 2.0 - 1.0,
    1.0 - (viewportPixel.y / uViewportSize.y) * 2.0
  );

  v_uv = vec2(
    uUvRect.x + aUnitCorner.x * uUvRect.z,
    1.0 - (uUvRect.y + aUnitCorner.y * uUvRect.w)
  );
  v_docPosition = documentPixel;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  const ARTBOARD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;
uniform float u_opacity;
uniform vec4 u_solidColor;
uniform vec2 uDocumentSize;
uniform float uCameraZoom;
uniform float u_renderMode;
uniform float u_maskMode;

in vec2 v_uv;
in vec2 v_docPosition;

out vec4 outColor;

void main() {
  if (u_renderMode > 1.5) {
    float alpha = u_solidColor.a * u_opacity;

    outColor = vec4(u_solidColor.rgb * alpha, alpha);
  } else if (u_renderMode > 0.5) {
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

    if (u_maskMode > 0.5) {
      vec2 maskUv = vec2(
        v_docPosition.x / uDocumentSize.x,
        1.0 - v_docPosition.y / uDocumentSize.y
      );
      float eraseAlpha = clamp(texture(u_maskTexture, maskUv).a, 0.0, 1.0);

      color *= 1.0 - eraseAlpha;
    }

    outColor = color;
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
      this.rasterTargetManager = null;
      this.programInfo = null;
      this.quad = null;
      this.isDisposed = false;

      try {
        this.configureDocumentSize(options.viewportWidth, options.viewportHeight);
        this.createBaseLayerTarget();
        this.programInfo = this.createProgramInfo();
        this.quad = this.createArtboardQuad();
        namespace.debugRasterTargets = () => this.getRasterDebugSnapshot();
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
          destinationRect: gl.getUniformLocation(program, "uDestinationRect"),
          maskMode: gl.getUniformLocation(program, "u_maskMode"),
          maskTexture: gl.getUniformLocation(program, "u_maskTexture"),
          texture: gl.getUniformLocation(program, "u_texture"),
          viewportSize: gl.getUniformLocation(program, "uViewportSize"),
          opacity: gl.getUniformLocation(program, "u_opacity"),
          renderMode: gl.getUniformLocation(program, "u_renderMode"),
          solidColor: gl.getUniformLocation(program, "u_solidColor"),
          uvRect: gl.getUniformLocation(program, "uUvRect"),
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
      const target = this.createPaintTarget();

      target.layerId = this.resolvePaintLayerId();
      this.texture = target.texture;
      this.framebuffer = target.framebuffer;
      this.paintLayerId = target.layerId;
      this.rasterTargetsByLayerId.set(this.paintLayerId, target);
    }

    createRasterManager() {
      if (!this.rasterTargetManager) {
        if (!namespace.RasterTargetManager) {
          throw new Error("RasterTargetManager non caricato: impossibile gestire i raster target.");
        }

        this.rasterTargetManager = new namespace.RasterTargetManager({
          gl: this.gl,
          documentWidth: this.width,
          documentHeight: this.height,
        });
      }

      return this.rasterTargetManager;
    }

    createRasterTarget(clearColor = [0, 0, 0, 0]) {
      return this.createRasterManager().createFullDocumentTarget("", clearColor);
    }

    createPaintTarget() {
      return this.createRasterManager().createEmptyBoundedTarget("", [0, 0, 0, 0]);
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
      if (!target) {
        return;
      }

      this.createRasterManager().clearTarget(target);
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
      target.layerId = layerId;

      return target;
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

    getRasterTarget(layerId, options = {}) {
      if (!layerId) {
        throw new TypeError("DocumentRenderer richiede un layerId per il target raster.");
      }

      let target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        if (options.bounded === true || options.bounds) {
          const bounds = options.bounds || options;

          target = this.createRasterManager().createBoundedTarget(layerId, bounds, {
            exact: options.exact === true,
            clearColor: options.clearColor || [0, 0, 0, 0],
          });
        } else {
          target = this.createPaintTarget();
          target.layerId = layerId;
        }
      }

      this.rasterTargetsByLayerId.set(layerId, target);
      target.layerId = layerId;

      return target;
    }

    ensureRasterOccupancy(target) {
      if (!target) {
        return null;
      }

      if (!target.occupancy) {
        if (!namespace.RasterTileOccupancy) {
          throw new Error("RasterTileOccupancy non caricato: impossibile tracciare i tile raster.");
        }

        target.occupancy = new namespace.RasterTileOccupancy(this.width, this.height, 64);
      }

      return target.occupancy;
    }

    ensureRasterTargetAllocation(layerId, bounds, options = {}) {
      if (!layerId) {
        throw new TypeError("DocumentRenderer richiede un layerId per allocare un target raster.");
      }

      let target = this.rasterTargetsByLayerId.get(layerId);

      if (!target) {
        target = this.createPaintTarget();
        target.layerId = layerId;
        this.rasterTargetsByLayerId.set(layerId, target);
      }

      this.createRasterManager().ensureAllocation(target, bounds, options);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    markRasterTargetContentMaybe(layerId, bounds) {
      const target = this.getRasterTarget(layerId);
      const occupancy = this.ensureRasterOccupancy(target);
      const manager = this.createRasterManager();

      occupancy?.markRectMaybeOccupied(bounds);
      const contentRect = occupancy?.getBounds?.() || null;

      if (contentRect) {
        manager.ensureAllocation(target, contentRect, { padding: 0 });
      }

      manager.setContentRect(target, contentRect);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    markRasterTargetTilesMaybe(layerId, tileKeys) {
      const target = this.getRasterTarget(layerId);
      const occupancy = this.ensureRasterOccupancy(target);
      const manager = this.createRasterManager();

      occupancy?.markTilesMaybeOccupied(tileKeys);
      const contentRect = occupancy?.getBounds?.() || null;

      if (contentRect) {
        manager.ensureAllocation(target, contentRect, { padding: 0 });
      }

      manager.setContentRect(target, contentRect);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    recomputeRasterTargetContentFromOccupancy(layerId) {
      const target = this.getRasterTarget(layerId);
      const contentRect = target.occupancy?.getBounds?.() || null;

      this.createRasterManager().setContentRect(target, contentRect);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    trimRasterTargetContentSync(layerId, bounds = null, options = {}) {
      const target = this.rasterTargetsByLayerId.get(layerId);

      if (
        !target?.texture ||
        !target?.framebuffer ||
        target.isEmpty === true ||
        target.isFullDocument === true
      ) {
        return target || null;
      }

      const manager = this.createRasterManager();
      const occupancy = this.ensureRasterOccupancy(target);
      const readRect = manager.clampRect(bounds || occupancy?.getBounds?.() || {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      });

      if (!readRect) {
        occupancy?.clear?.();
        manager.setContentRect(target, null);
        return target;
      }

      const pixelCount = readRect.width * readRect.height;
      const maxPixels = Number.isFinite(options.maxPixels) ? options.maxPixels : 16 * 1024 * 1024;

      if (pixelCount > maxPixels) {
        console.warn("[RasterTarget] trim saltato: area troppo grande", {
          layerId,
          width: readRect.width,
          height: readRect.height,
          pixelCount,
        });
        return target;
      }

      const gl = this.gl;
      const allocatedX = Number.isFinite(target.allocatedX) ? target.allocatedX : target.x || 0;
      const allocatedY = Number.isFinite(target.allocatedY) ? target.allocatedY : target.y || 0;
      const localX = readRect.x - allocatedX;
      const localY = readRect.y - allocatedY;
      const framebufferY = Math.max(0, (target.allocatedHeight || target.height) - (localY + readRect.height));
      const pixels = new Uint8Array(pixelCount * 4);
      const alphaThreshold = Number.isFinite(options.alphaThreshold) ? options.alphaThreshold : 2;
      const occupiedTileKeys = new Set();

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);

      try {
        gl.readPixels(
          localX,
          framebufferY,
          readRect.width,
          readRect.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
      } catch (error) {
        console.warn("[RasterTarget] trim non riuscito", error);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return target;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      for (let py = 0; py < readRect.height; py += 1) {
        const docY = readRect.y + (readRect.height - 1 - py);

        for (let px = 0; px < readRect.width; px += 1) {
          const alpha = pixels[(py * readRect.width + px) * 4 + 3];

          if (alpha <= alphaThreshold) {
            continue;
          }

          const docX = readRect.x + px;
          const tx = Math.floor(docX / occupancy.tileSize);
          const ty = Math.floor(docY / occupancy.tileSize);

          occupiedTileKeys.add(occupancy.key(tx, ty));
        }
      }

      occupancy.clear();
      occupancy.markTilesMaybeOccupied(occupiedTileKeys);
      manager.setContentRect(target, occupancy.getBounds());
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    ensureRasterTargetBounds(layerId, bounds, options = {}) {
      const target = this.getRasterTarget(layerId, {
        bounded: true,
        bounds,
        exact: options.exact === true,
      });

      this.createRasterManager().ensureBounds(target, bounds, options);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
    }

    ensureFullDocumentRasterTarget(layerId) {
      const target = this.getRasterTarget(layerId);

      this.createRasterManager().expandToFullDocument(target);
      this.rasterTargetsByLayerId.set(layerId, target);

      return target;
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

    getRasterDebugSnapshot() {
      const manager = this.createRasterManager();

      return Array.from(this.rasterTargetsByLayerId.entries()).map(([layerId, target]) =>
        manager.getTargetDebugInfo({
          ...target,
          layerId,
        }),
      );
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
      let didDrawActiveStroke = false;
      const debugBoundsRects = [];
      const bindArtboardProgram = () => {
        gl.useProgram(program);
        gl.uniform2f(uniforms.viewportSize, viewportWidth, viewportHeight);
        gl.uniform2f(uniforms.documentSize, this.width, this.height);
        gl.uniform2f(uniforms.cameraPosition, camera.x || 0, camera.y || 0);
        gl.uniform1f(uniforms.cameraZoom, camera.zoom || 1);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.maskTexture, 1);
        gl.uniform1f(uniforms.maskMode, 0);
        gl.bindVertexArray(this.quad.vao);
        gl.activeTexture(gl.TEXTURE0);
      };
      const drawRect = (
        rect,
        opacity = 1,
        renderMode = 0,
        uvRect = [0, 0, 1, 1],
        solidColor = [1, 1, 1, 1],
        maskMode = 0,
      ) => {
        gl.uniform4f(uniforms.destinationRect, rect.x, rect.y, rect.width, rect.height);
        gl.uniform4f(uniforms.uvRect, uvRect[0], uvRect[1], uvRect[2], uvRect[3]);
        gl.uniform1f(uniforms.opacity, opacity);
        gl.uniform1f(uniforms.renderMode, renderMode);
        gl.uniform1f(uniforms.maskMode, maskMode);
        gl.uniform4f(uniforms.solidColor, solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (maskMode !== 0) {
          gl.uniform1f(uniforms.maskMode, 0);
        }
      };
      const drawFullDocumentTexture = (texture, opacity = 1) => {
        if (!texture) {
          return;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        drawRect({ x: 0, y: 0, width: this.width, height: this.height }, opacity, 0);
      };
      const drawRasterTarget = (layerTarget, opacity = 1, maskTexture = null) => {
        if (!layerTarget?.texture || layerTarget.isEmpty === true) {
          return;
        }

        const rect = {
          x: Number.isFinite(layerTarget.x) ? layerTarget.x : 0,
          y: Number.isFinite(layerTarget.y) ? layerTarget.y : 0,
          width: Number.isFinite(layerTarget.width) ? layerTarget.width : this.width,
          height: Number.isFinite(layerTarget.height) ? layerTarget.height : this.height,
        };
        const allocatedWidth = Math.max(1, layerTarget.allocatedWidth || rect.width);
        const allocatedHeight = Math.max(1, layerTarget.allocatedHeight || rect.height);
        const allocatedX = Number.isFinite(layerTarget.allocatedX) ? layerTarget.allocatedX : rect.x;
        const allocatedY = Number.isFinite(layerTarget.allocatedY) ? layerTarget.allocatedY : rect.y;
        const localX = rect.x - allocatedX;
        const localY = rect.y - allocatedY;

        if (maskTexture) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, layerTarget.texture);
        drawRect(
          rect,
          opacity,
          0,
          [
            localX / allocatedWidth,
            localY / allocatedHeight,
            rect.width / allocatedWidth,
            rect.height / allocatedHeight,
          ],
          [1, 1, 1, 1],
          maskTexture ? 1 : 0,
        );

        if (maskTexture) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
        }

        if (namespace.rasterDebugShowBounds === true && layerTarget.isBounded === true) {
          debugBoundsRects.push(rect);
        }
      };
      const drawBackground = (opacity = 1) => {
        drawRect(
          { x: 0, y: 0, width: this.width, height: this.height },
          opacity,
          2,
          [0, 0, 1, 1],
          [1, 1, 1, 1],
        );
      };
      const drawBoundsOutline = (rect) => {
        const zoom = Math.max(0.0001, camera.zoom || 1);
        const thickness = Math.max(1, 2 / zoom);
        const color = [0.05, 0.58, 1, 0.95];
        const x = rect.x;
        const y = rect.y;
        const width = Math.max(thickness, rect.width);
        const height = Math.max(thickness, rect.height);

        drawRect({ x, y, width, height: thickness }, 1, 2, [0, 0, 1, 1], color);
        drawRect({ x, y: y + height - thickness, width, height: thickness }, 1, 2, [0, 0, 1, 1], color);
        drawRect({ x, y, width: thickness, height }, 1, 2, [0, 0, 1, 1], color);
        drawRect({ x: x + width - thickness, y, width: thickness, height }, 1, 2, [0, 0, 1, 1], color);
      };

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
      gl.uniform1f(uniforms.renderMode, 0.0);

      for (const layer of this.getRenderableLayers()) {
        const layerTarget = this.rasterTargetsByLayerId.get(layer.id);
        const opacity = Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1;

        if (layer.type === "background") {
          drawBackground(opacity);
          continue;
        }

        if (layer.type === "text") {
          // I layer vettoriali non entrano nella pipeline raster/WebGL.
          // Sono disegnati da VectorOverlayRenderer finche' l'utente non chiede rasterize.
          continue;
        }

        const isActiveStrokeLayer = options.activeStrokeTexture && layer.id === activeStrokeLayerId;
        const eraserMaskTexture = isActiveStrokeLayer && activeStrokeMode === "eraser"
          ? options.activeStrokeTexture
          : null;

        drawRasterTarget(layerTarget, opacity, eraserMaskTexture);

        if (isActiveStrokeLayer && activeStrokeMode === "eraser") {
          didDrawActiveStroke = true;
        } else if (isActiveStrokeLayer) {
          drawFullDocumentTexture(options.activeStrokeTexture, opacity);
          didDrawActiveStroke = true;
        }
      }

      if (options.activeStrokeTexture && activeStrokeMode !== "eraser" && !didDrawActiveStroke) {
        const hasLayerModel = Boolean(this.layerModel);

        if (!hasLayerModel) {
          drawFullDocumentTexture(options.activeStrokeTexture, 1.0);
        }
      }

      if (debugBoundsRects.length > 0) {
        debugBoundsRects.forEach(drawBoundsOutline);
      }

      // Pass 2: griglia pixel sopra tutto. Lo shader la attiva solo a zoom alto.
      drawRect({ x: 0, y: 0, width: this.width, height: this.height }, 1.0, 1);

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
