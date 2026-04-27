(function registerRasterTargetManager(namespace) {
  const DEFAULT_CHUNK_SIZE = 256;
  const DEFAULT_TILE_SIZE = 64;
  const DEFAULT_MAX_TARGET_BYTES = 256 * 1024 * 1024;

  class RasterTileOccupancy {
    constructor(documentWidth, documentHeight, tileSize = DEFAULT_TILE_SIZE) {
      this.documentWidth = Math.max(1, Math.round(documentWidth || 1));
      this.documentHeight = Math.max(1, Math.round(documentHeight || 1));
      this.tileSize = Math.max(8, Math.round(tileSize || DEFAULT_TILE_SIZE));
      this.cols = Math.max(1, Math.ceil(this.documentWidth / this.tileSize));
      this.rows = Math.max(1, Math.ceil(this.documentHeight / this.tileSize));
      this.data = new Uint8Array(this.cols * this.rows);
      this.dirty = new Set();
      this.occupiedCount = 0;
    }

    index(tx, ty) {
      return ty * this.cols + tx;
    }

    key(tx, ty) {
      return `${tx},${ty}`;
    }

    parseKey(key) {
      if (typeof key !== "string") {
        return {
          tx: Number.isFinite(key?.tx) ? key.tx : 0,
          ty: Number.isFinite(key?.ty) ? key.ty : 0,
        };
      }

      const [tx, ty] = key.split(",").map(Number);

      return {
        tx: Number.isFinite(tx) ? tx : 0,
        ty: Number.isFinite(ty) ? ty : 0,
      };
    }

    rectToTileRange(rect) {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const left = Math.max(0, rect.x);
      const top = Math.max(0, rect.y);
      const right = Math.min(this.documentWidth, rect.x + rect.width);
      const bottom = Math.min(this.documentHeight, rect.y + rect.height);

      if (right <= left || bottom <= top) {
        return null;
      }

      return {
        minTx: Math.max(0, Math.floor(left / this.tileSize)),
        minTy: Math.max(0, Math.floor(top / this.tileSize)),
        maxTx: Math.min(this.cols - 1, Math.floor((right - 1) / this.tileSize)),
        maxTy: Math.min(this.rows - 1, Math.floor((bottom - 1) / this.tileSize)),
      };
    }

    tileRect(tx, ty) {
      const x = tx * this.tileSize;
      const y = ty * this.tileSize;

      return {
        x,
        y,
        width: Math.min(this.tileSize, this.documentWidth - x),
        height: Math.min(this.tileSize, this.documentHeight - y),
      };
    }

    tilesOverlapping(rect) {
      const range = this.rectToTileRange(rect);
      const tiles = [];

      if (!range) {
        return tiles;
      }

      for (let ty = range.minTy; ty <= range.maxTy; ty += 1) {
        for (let tx = range.minTx; tx <= range.maxTx; tx += 1) {
          const index = this.index(tx, ty);

          tiles.push({
            tx,
            ty,
            key: this.key(tx, ty),
            rect: this.tileRect(tx, ty),
            occupied: this.data[index] !== 0,
          });
        }
      }

      return tiles;
    }

    queryTiles(rect) {
      return this.tilesOverlapping(rect).filter((tile) => tile.occupied);
    }

    markTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) {
        return null;
      }

      const index = this.index(tx, ty);
      const key = this.key(tx, ty);

      if (this.data[index] === 0) {
        this.occupiedCount += 1;
      }

      this.data[index] = 1;
      this.dirty.add(key);

      return key;
    }

    markRectMaybeOccupied(rect) {
      const keys = new Set();

      for (const tile of this.tilesOverlapping(rect)) {
        const key = this.markTile(tile.tx, tile.ty);

        if (key) {
          keys.add(key);
        }
      }

      return keys;
    }

    markTilesMaybeOccupied(tileKeys) {
      const keys = new Set();

      for (const tileKey of tileKeys || []) {
        const { tx, ty } = this.parseKey(tileKey);
        const key = this.markTile(tx, ty);

        if (key) {
          keys.add(key);
        }
      }

      return keys;
    }

    clearTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) {
        return;
      }

      const index = this.index(tx, ty);

      if (this.data[index] !== 0) {
        this.occupiedCount = Math.max(0, this.occupiedCount - 1);
      }

      this.data[index] = 0;
      this.dirty.delete(this.key(tx, ty));
    }

    clear() {
      this.data.fill(0);
      this.dirty.clear();
      this.occupiedCount = 0;
    }

    isEmpty() {
      return this.occupiedCount <= 0;
    }

    countOccupied() {
      return this.occupiedCount;
    }

    getBounds() {
      let minTx = Infinity;
      let minTy = Infinity;
      let maxTx = -Infinity;
      let maxTy = -Infinity;

      for (let ty = 0; ty < this.rows; ty += 1) {
        for (let tx = 0; tx < this.cols; tx += 1) {
          if (this.data[this.index(tx, ty)] === 0) {
            continue;
          }

          minTx = Math.min(minTx, tx);
          minTy = Math.min(minTy, ty);
          maxTx = Math.max(maxTx, tx);
          maxTy = Math.max(maxTy, ty);
        }
      }

      if (!Number.isFinite(minTx)) {
        return null;
      }

      const x = minTx * this.tileSize;
      const y = minTy * this.tileSize;
      const right = Math.min(this.documentWidth, (maxTx + 1) * this.tileSize);
      const bottom = Math.min(this.documentHeight, (maxTy + 1) * this.tileSize);

      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
      };
    }
  }

  class RasterTargetManager {
    constructor(options = {}) {
      if (!options.gl || typeof options.gl.createTexture !== "function") {
        throw new TypeError("RasterTargetManager richiede un contesto WebGL2 valido.");
      }

      this.gl = options.gl;
      this.documentWidth = Math.max(1, Math.round(options.documentWidth || 1));
      this.documentHeight = Math.max(1, Math.round(options.documentHeight || 1));
      this.chunkSize = Math.max(32, Math.round(options.chunkSize || DEFAULT_CHUNK_SIZE));
      this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096;
      this.maxTargetBytes = Math.max(
        4 * 1024 * 1024,
        Math.round(options.maxTargetBytes || DEFAULT_MAX_TARGET_BYTES),
      );
      namespace.rasterDebugEnabled = namespace.rasterDebugEnabled ?? true;
      namespace.rasterDebugShowBounds = namespace.rasterDebugShowBounds ?? true;
    }

    setDocumentSize(width, height) {
      this.documentWidth = Math.max(1, Math.round(width || 1));
      this.documentHeight = Math.max(1, Math.round(height || 1));
    }

    debug(message, detail = {}) {
      if (namespace.rasterDebugEnabled !== true) {
        return;
      }

      console.info(`[RasterTarget] ${message}`, detail);
    }

    normalizeRect(rect = {}) {
      const x = Number.isFinite(rect.x) ? Math.floor(rect.x) : 0;
      const y = Number.isFinite(rect.y) ? Math.floor(rect.y) : 0;
      const width = Math.max(1, Math.ceil(rect.width || 1));
      const height = Math.max(1, Math.ceil(rect.height || 1));

      return { x, y, width, height };
    }

    clampRect(rect = {}) {
      const bounds = this.normalizeRect(rect);
      const x = Math.max(0, bounds.x);
      const y = Math.max(0, bounds.y);
      const right = Math.min(this.documentWidth, bounds.x + bounds.width);
      const bottom = Math.min(this.documentHeight, bounds.y + bounds.height);

      if (right <= x || bottom <= y) {
        return null;
      }

      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
      };
    }

    unionRects(...rects) {
      const validRects = rects.filter((rect) => rect && rect.width > 0 && rect.height > 0);

      if (validRects.length === 0) {
        return null;
      }

      const x = Math.min(...validRects.map((rect) => rect.x));
      const y = Math.min(...validRects.map((rect) => rect.y));
      const right = Math.max(...validRects.map((rect) => rect.x + rect.width));
      const bottom = Math.max(...validRects.map((rect) => rect.y + rect.height));

      return { x, y, width: right - x, height: bottom - y };
    }

    getChunkedSize(value) {
      return Math.max(this.chunkSize, Math.ceil(value / this.chunkSize) * this.chunkSize);
    }

    getPaddedDocumentRect(rect, padding = 0) {
      const bounds = this.clampRect(rect) || this.normalizeRect(rect);
      const safePadding = Math.max(0, Math.round(Number(padding) || 0));
      const x = Math.max(0, bounds.x - safePadding);
      const y = Math.max(0, bounds.y - safePadding);
      const right = Math.min(this.documentWidth, bounds.x + bounds.width + safePadding);
      const bottom = Math.min(this.documentHeight, bounds.y + bounds.height + safePadding);

      return {
        x,
        y,
        width: Math.max(1, right - x),
        height: Math.max(1, bottom - y),
      };
    }

    createTexture(width, height, filter = this.gl.LINEAR) {
      const gl = this.gl;
      const texture = gl.createTexture();

      if (!texture) {
        throw new Error("Impossibile creare la texture raster bounded.");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      return texture;
    }

    createFramebuffer(texture) {
      const gl = this.gl;
      const framebuffer = gl.createFramebuffer();

      if (!framebuffer) {
        throw new Error("Impossibile creare il framebuffer raster bounded.");
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        throw new Error("Framebuffer raster bounded incompleto.");
      }

      return framebuffer;
    }

    clearFramebuffer(target) {
      if (!target?.framebuffer) {
        return;
      }

      const gl = this.gl;
      const clearColor = Array.isArray(target.clearColor) ? target.clearColor : [0, 0, 0, 0];

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.allocatedWidth, target.allocatedHeight);
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    createTarget(options = {}) {
      const isFullDocument = options.fullDocument === true;
      const rawAllocationRect = this.normalizeRect(options);
      const allocationRect = isFullDocument
        ? { x: 0, y: 0, width: this.documentWidth, height: this.documentHeight }
        : this.clampRect(rawAllocationRect) || { x: 0, y: 0, width: 1, height: 1 };
      const logicalRect = isFullDocument
        ? { x: 0, y: 0, width: this.documentWidth, height: this.documentHeight }
        : this.clampRect(options.logicalRect || allocationRect) || allocationRect;
      const allocatedWidth = isFullDocument
        ? this.documentWidth
        : Math.max(allocationRect.width, options.exact === true ? allocationRect.width : this.getChunkedSize(allocationRect.width));
      const allocatedHeight = isFullDocument
        ? this.documentHeight
        : Math.max(allocationRect.height, options.exact === true ? allocationRect.height : this.getChunkedSize(allocationRect.height));
      const targetBytes = allocatedWidth * allocatedHeight * 4;

      if (allocatedWidth > this.maxTextureSize || allocatedHeight > this.maxTextureSize) {
        throw new Error(
          `Raster target ${allocatedWidth}x${allocatedHeight} supera MAX_TEXTURE_SIZE ${this.maxTextureSize}.`,
        );
      }

      if (targetBytes > this.maxTargetBytes) {
        const approxMB = Number((targetBytes / (1024 * 1024)).toFixed(2));
        const maxMB = Number((this.maxTargetBytes / (1024 * 1024)).toFixed(2));

        throw new Error(`Raster target ${allocatedWidth}x${allocatedHeight} pesa circa ${approxMB}MB, oltre il budget ${maxMB}MB.`);
      }

      const texture = this.createTexture(allocatedWidth, allocatedHeight, options.filter || this.gl.LINEAR);
      let framebuffer = null;

      try {
        framebuffer = this.createFramebuffer(texture);
      } catch (error) {
        this.gl.deleteTexture(texture);
        throw error;
      }

      const target = {
        layerId: options.layerId || "",
        texture,
        framebuffer,
        x: logicalRect.x,
        y: logicalRect.y,
        width: logicalRect.width,
        height: logicalRect.height,
        allocatedX: isFullDocument ? 0 : allocationRect.x,
        allocatedY: isFullDocument ? 0 : allocationRect.y,
        allocatedWidth,
        allocatedHeight,
        clearColor: Array.isArray(options.clearColor) ? options.clearColor.slice() : [0, 0, 0, 0],
        occupancy: options.occupancy || null,
        isBounded: !isFullDocument,
        isEmpty: options.empty === true,
        isFullDocument,
        documentWidth: this.documentWidth,
        documentHeight: this.documentHeight,
      };

      this.clearFramebuffer(target);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      this.debug(isFullDocument ? "alloc full-document target" : "alloc bounded target", this.getTargetDebugInfo(target));

      return target;
    }

    createFullDocumentTarget(layerId, clearColor = [0, 0, 0, 0]) {
      return this.createTarget({
        layerId,
        x: 0,
        y: 0,
        width: this.documentWidth,
        height: this.documentHeight,
        clearColor,
        fullDocument: true,
        empty: false,
      });
    }

    createBoundedTarget(layerId, rect, options = {}) {
      return this.createTarget({
        ...this.normalizeRect(rect),
        ...options,
        layerId,
        fullDocument: false,
        empty: options.empty === true ? true : false,
      });
    }

    createEmptyBoundedTarget(layerId, clearColor = [0, 0, 0, 0]) {
      return {
        layerId: layerId || "",
        texture: null,
        framebuffer: null,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        allocatedX: 0,
        allocatedY: 0,
        allocatedWidth: 0,
        allocatedHeight: 0,
        clearColor: Array.isArray(clearColor) ? clearColor.slice() : [0, 0, 0, 0],
        occupancy: null,
        isBounded: true,
        isEmpty: true,
        isFullDocument: false,
        documentWidth: this.documentWidth,
        documentHeight: this.documentHeight,
      };
    }

    getAllocatedRect(target) {
      if (!target?.texture || !target?.framebuffer) {
        return null;
      }

      const allocatedX = Number.isFinite(target.allocatedX) ? target.allocatedX : target.x || 0;
      const allocatedY = Number.isFinite(target.allocatedY) ? target.allocatedY : target.y || 0;

      return {
        x: allocatedX,
        y: allocatedY,
        width: Math.max(1, target.allocatedWidth || target.width || 1),
        height: Math.max(1, target.allocatedHeight || target.height || 1),
      };
    }

    setContentRect(target, rect) {
      if (!target) {
        return target;
      }

      const contentRect = rect ? this.clampRect(rect) : null;

      if (!contentRect || contentRect.width <= 0 || contentRect.height <= 0) {
        target.x = 0;
        target.y = 0;
        target.width = 0;
        target.height = 0;
        target.isEmpty = true;
        return target;
      }

      target.x = contentRect.x;
      target.y = contentRect.y;
      target.width = contentRect.width;
      target.height = contentRect.height;
      target.isEmpty = false;

      return target;
    }

    ensureAllocation(target, rect, options = {}) {
      if (!target) {
        throw new TypeError("ensureAllocation richiede un target raster.");
      }

      const requestedRect = this.clampRect(rect);

      if (!requestedRect) {
        return target;
      }

      if (target.isFullDocument) {
        return target;
      }

      const paddedRect = this.getPaddedDocumentRect(
        requestedRect,
        options.exact === true ? 0 : options.padding,
      );
      const oldContentRect = !target.isEmpty
        ? { x: target.x, y: target.y, width: target.width, height: target.height }
        : null;

      if (!target.texture || !target.framebuffer) {
        const occupancy = target.occupancy || null;
        const nextTarget = this.createBoundedTarget(target.layerId, paddedRect, {
          clearColor: target.clearColor,
          exact: options.exact === true,
          logicalRect: requestedRect,
          occupancy,
        });

        Object.assign(target, nextTarget);
        target.occupancy = occupancy;
        this.setContentRect(target, oldContentRect);
        this.debug("ensure first bounded allocation", this.getTargetDebugInfo(target));
        return target;
      }

      const allocatedRect = this.getAllocatedRect(target);
      const physicalRight = allocatedRect.x + allocatedRect.width;
      const physicalBottom = allocatedRect.y + allocatedRect.height;
      const requestedRight = requestedRect.x + requestedRect.width;
      const requestedBottom = requestedRect.y + requestedRect.height;
      const fitsAllocated =
        requestedRect.x >= allocatedRect.x &&
        requestedRect.y >= allocatedRect.y &&
        requestedRight <= physicalRight &&
        requestedBottom <= physicalBottom;

      if (fitsAllocated) {
        return target;
      }

      const nextAllocation = this.unionRects(allocatedRect, paddedRect);

      this.reallocateBoundedTarget(target, nextAllocation, {
        ...options,
        logicalRect: oldContentRect || requestedRect,
      });
      this.setContentRect(target, oldContentRect);

      return target;
    }

    ensureBounds(target, rect, options = {}) {
      const requestedRect = this.clampRect(rect);

      if (!requestedRect) {
        return target;
      }

      this.ensureAllocation(target, requestedRect, options);

      if (target?.isFullDocument) {
        target.isEmpty = false;
        return target;
      }

      const oldContentRect = !target.isEmpty
        ? { x: target.x, y: target.y, width: target.width, height: target.height }
        : null;
      const nextContentRect = this.unionRects(oldContentRect, requestedRect);

      this.setContentRect(target, nextContentRect);

      return target;
    }

    reallocateBoundedTarget(target, rect, options = {}) {
      const gl = this.gl;
      const oldTexture = target.texture;
      const oldFramebuffer = target.framebuffer;
      const oldIsEmpty = target.isEmpty === true;
      const oldContentRect = !oldIsEmpty
        ? { x: target.x, y: target.y, width: target.width, height: target.height }
        : null;
      const oldAllocatedX = Number.isFinite(target.allocatedX) ? target.allocatedX : target.x;
      const oldAllocatedY = Number.isFinite(target.allocatedY) ? target.allocatedY : target.y;
      const oldAllocatedWidth = target.allocatedWidth;
      const oldAllocatedHeight = target.allocatedHeight;
      const occupancy = target.occupancy || null;
      const next = this.createBoundedTarget(target.layerId, rect, {
        clearColor: target.clearColor,
        exact: options.exact === true,
        logicalRect: options.logicalRect || oldContentRect || rect,
        occupancy,
      });

      if (oldFramebuffer && oldTexture && oldAllocatedWidth > 0 && oldAllocatedHeight > 0) {
        const dstX = oldAllocatedX - next.allocatedX;
        const dstY = oldAllocatedY - next.allocatedY;
        const srcY0 = 0;
        const srcY1 = oldAllocatedHeight;
        const dstY0 = next.allocatedHeight - (dstY + oldAllocatedHeight);
        const dstY1 = next.allocatedHeight - dstY;

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, oldFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, next.framebuffer);
        gl.blitFramebuffer(
          0,
          srcY0,
          oldAllocatedWidth,
          srcY1,
          dstX,
          dstY0,
          dstX + oldAllocatedWidth,
          dstY1,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      }

      this.deleteTarget({ texture: oldTexture, framebuffer: oldFramebuffer });
      Object.assign(target, next);
      target.occupancy = occupancy;
      this.setContentRect(target, oldContentRect);
      this.debug("reallocate bounded target", this.getTargetDebugInfo(target));
    }

    expandToFullDocument(target) {
      if (!target || target.isFullDocument === true) {
        return target;
      }

      const gl = this.gl;
      const oldTexture = target.texture;
      const oldFramebuffer = target.framebuffer;
      const oldX = target.x;
      const oldY = target.y;
      const oldWidth = target.width;
      const oldHeight = target.height;
      const oldAllocatedX = Number.isFinite(target.allocatedX) ? target.allocatedX : target.x;
      const oldAllocatedY = Number.isFinite(target.allocatedY) ? target.allocatedY : target.y;
      const oldAllocatedWidth = target.allocatedWidth;
      const oldAllocatedHeight = target.allocatedHeight;
      const occupancy = target.occupancy || null;
      const next = this.createFullDocumentTarget(target.layerId, target.clearColor);

      if (!target.isEmpty && oldFramebuffer && oldTexture && oldWidth > 0 && oldHeight > 0) {
        const copyWidth = Math.max(0, Math.min(oldAllocatedWidth, this.documentWidth - oldAllocatedX));
        const copyHeight = Math.max(0, Math.min(oldAllocatedHeight, this.documentHeight - oldAllocatedY));
        const srcY0 = oldAllocatedHeight - copyHeight;
        const srcY1 = oldAllocatedHeight;
        const dstY0 = next.allocatedHeight - (oldAllocatedY + copyHeight);
        const dstY1 = next.allocatedHeight - oldAllocatedY;

        if (copyWidth > 0 && copyHeight > 0) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, oldFramebuffer);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, next.framebuffer);
          gl.blitFramebuffer(
            0,
            srcY0,
            copyWidth,
            srcY1,
            oldAllocatedX,
            dstY0,
            oldAllocatedX + copyWidth,
            dstY1,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
          );
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        }
      }

      this.deleteTarget({ texture: oldTexture, framebuffer: oldFramebuffer });
      Object.assign(target, next);
      target.occupancy = occupancy;
      this.setContentRect(target, { x: oldX, y: oldY, width: oldWidth, height: oldHeight });
      this.debug("expand target to full-document fallback", this.getTargetDebugInfo(target));

      return target;
    }

    clearTarget(target) {
      if (!target) {
        return;
      }

      target.occupancy?.clear?.();

      if (target.isBounded) {
        this.deleteTarget(target);
        target.texture = null;
        target.framebuffer = null;
        target.x = 0;
        target.y = 0;
        target.width = 0;
        target.height = 0;
        target.allocatedX = 0;
        target.allocatedY = 0;
        target.allocatedWidth = 0;
        target.allocatedHeight = 0;
        target.isEmpty = true;
        this.debug("clear bounded target", { layerId: target.layerId });
        return;
      }

      this.clearFramebuffer(target);
      target.isEmpty = false;
      this.debug("clear full-document target", this.getTargetDebugInfo(target));
    }

    deleteTarget(target) {
      if (!target) {
        return;
      }

      const gl = this.gl;

      if (target.framebuffer) {
        gl.deleteFramebuffer(target.framebuffer);
      }

      if (target.texture) {
        gl.deleteTexture(target.texture);
      }
    }

    getTargetDebugInfo(target) {
      return {
        layerId: target?.layerId || "",
        x: target?.x || 0,
        y: target?.y || 0,
        width: target?.width || 0,
        height: target?.height || 0,
        allocatedX: target?.allocatedX || 0,
        allocatedY: target?.allocatedY || 0,
        allocatedWidth: target?.allocatedWidth || 0,
        allocatedHeight: target?.allocatedHeight || 0,
        occupiedTiles: target?.occupancy?.countOccupied?.() || 0,
        isBounded: target?.isBounded === true,
        isEmpty: target?.isEmpty === true,
        approxMB: target?.allocatedWidth && target?.allocatedHeight
          ? Number(((target.allocatedWidth * target.allocatedHeight * 4) / (1024 * 1024)).toFixed(2))
          : 0,
      };
    }
  }

  namespace.RasterTileOccupancy = RasterTileOccupancy;
  namespace.RasterTargetManager = RasterTargetManager;
})(window.CBO = window.CBO || {});
