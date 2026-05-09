(function registerSelectionRegion(namespace) {
  function cloneRect(rect) {
    return rect
      ? {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        }
      : null;
  }

  function normalizeRect(rect) {
    if (!rect) {
      return null;
    }

    const x = Math.floor(Number(rect.x) || 0);
    const y = Math.floor(Number(rect.y) || 0);
    const right = Math.ceil(x + Math.max(0, Number(rect.width) || 0));
    const bottom = Math.ceil(y + Math.max(0, Number(rect.height) || 0));

    if (right <= x || bottom <= y) {
      return null;
    }

    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function intersectRects(a, b) {
    if (!a || !b) {
      return null;
    }

    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.width, b.x + b.width);
    const y1 = Math.min(a.y + a.height, b.y + b.height);

    if (x1 <= x0 || y1 <= y0) {
      return null;
    }

    return {
      height: y1 - y0,
      width: x1 - x0,
      x: x0,
      y: y0,
    };
  }

  function intervalsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }

    return a.every((interval, index) => (
      interval[0] === b[index][0] &&
      interval[1] === b[index][1]
    ));
  }

  function cloneIntervals(intervals) {
    return Array.isArray(intervals)
      ? intervals.map((interval) => [interval[0], interval[1]])
      : [];
  }

  function mergeIntervals(intervals) {
    const sorted = cloneIntervals(intervals)
      .filter((interval) => interval[1] > interval[0])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];

    sorted.forEach((interval) => {
      const previous = merged[merged.length - 1];

      if (previous && interval[0] <= previous[1]) {
        previous[1] = Math.max(previous[1], interval[1]);
      } else {
        merged.push(interval);
      }
    });

    return merged;
  }

  function subtractIntervals(sourceIntervals, blockerIntervals) {
    let pieces = cloneIntervals(sourceIntervals);
    const blockers = mergeIntervals(blockerIntervals);

    blockers.forEach((blocker) => {
      const nextPieces = [];

      pieces.forEach((piece) => {
        if (blocker[1] <= piece[0] || blocker[0] >= piece[1]) {
          nextPieces.push(piece);
          return;
        }

        if (blocker[0] > piece[0]) {
          nextPieces.push([piece[0], Math.min(blocker[0], piece[1])]);
        }

        if (blocker[1] < piece[1]) {
          nextPieces.push([Math.max(blocker[1], piece[0]), piece[1]]);
        }
      });

      pieces = nextPieces;
    });

    return pieces;
  }

  class SelectionRegion {
    constructor(rows = null, version = 0) {
      this.rows = new Map();
      this.version = Number.isFinite(version) ? version : 0;

      if (rows instanceof Map) {
        rows.forEach((intervals, y) => {
          const row = mergeIntervals(intervals);

          if (row.length > 0) {
            this.rows.set(Number(y), row);
          }
        });
      }

      this.bounds = this.computeBounds();
    }

    static empty() {
      return new SelectionRegion();
    }

    static fromRect(rect) {
      const region = new SelectionRegion();

      return region.replaceRect(rect);
    }

    static deserialize(data) {
      const region = new SelectionRegion();

      if (!Array.isArray(data?.rows)) {
        return region;
      }

      data.rows.forEach((row) => {
        const y = Number(row?.y);
        const intervals = mergeIntervals(row?.intervals || []);

        if (Number.isFinite(y) && intervals.length > 0) {
          region.rows.set(y, intervals);
        }
      });

      region.version = Number.isFinite(data.version) ? data.version : 0;
      region.bounds = region.computeBounds();

      return region;
    }

    clone() {
      return new SelectionRegion(this.rows, this.version);
    }

    serialize() {
      return {
        bounds: cloneRect(this.bounds),
        rows: Array.from(this.rows.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([y, intervals]) => ({
            intervals: cloneIntervals(intervals),
            y,
          })),
        version: this.version,
      };
    }

    isEmpty() {
      return this.rows.size === 0;
    }

    getBounds() {
      return cloneRect(this.bounds);
    }

    computeBounds() {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;

      this.rows.forEach((intervals, y) => {
        intervals.forEach((interval) => {
          x0 = Math.min(x0, interval[0]);
          x1 = Math.max(x1, interval[1]);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y + 1);
        });
      });

      if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) {
        return null;
      }

      return {
        height: y1 - y0,
        width: x1 - x0,
        x: x0,
        y: y0,
      };
    }

    touch() {
      this.version += 1;
      this.bounds = this.computeBounds();
      return this;
    }

    replaceRect(rect) {
      this.rows.clear();
      return this.addRect(rect);
    }

    addRect(rect) {
      const normalized = normalizeRect(rect);

      if (!normalized) {
        return this.touch();
      }

      const x0 = normalized.x;
      const x1 = normalized.x + normalized.width;

      for (let y = normalized.y; y < normalized.y + normalized.height; y += 1) {
        const intervals = this.rows.get(y) || [];
        this.rows.set(y, mergeIntervals([...intervals, [x0, x1]]));
      }

      return this.touch();
    }

    subtractRect(rect) {
      const normalized = normalizeRect(rect);

      if (!normalized || this.isEmpty()) {
        return this.touch();
      }

      const x0 = normalized.x;
      const x1 = normalized.x + normalized.width;

      for (let y = normalized.y; y < normalized.y + normalized.height; y += 1) {
        const intervals = this.rows.get(y);

        if (!intervals) {
          continue;
        }

        const nextIntervals = [];

        intervals.forEach((interval) => {
          if (x1 <= interval[0] || x0 >= interval[1]) {
            nextIntervals.push(interval);
            return;
          }

          if (x0 > interval[0]) {
            nextIntervals.push([interval[0], Math.min(x0, interval[1])]);
          }

          if (x1 < interval[1]) {
            nextIntervals.push([Math.max(x1, interval[0]), interval[1]]);
          }
        });

        if (nextIntervals.length > 0) {
          this.rows.set(y, mergeIntervals(nextIntervals));
        } else {
          this.rows.delete(y);
        }
      }

      return this.touch();
    }

    applyRect(rect, mode = "replace") {
      const normalizedMode = mode === "add" || mode === "subtract" ? mode : "replace";

      if (normalizedMode === "add") {
        return this.addRect(rect);
      }

      if (normalizedMode === "subtract") {
        return this.subtractRect(rect);
      }

      return this.replaceRect(rect);
    }

    containsPoint(x, y) {
      const rowY = Math.floor(Number(y));
      const docX = Math.floor(Number(x));
      const intervals = this.rows.get(rowY);

      if (!Number.isFinite(docX) || !Number.isFinite(rowY) || !intervals) {
        return false;
      }

      return intervals.some((interval) => docX >= interval[0] && docX < interval[1]);
    }

    getCoverageRects(clipRect = null) {
      const clip = normalizeRect(clipRect) || this.getBounds();

      if (!clip) {
        return [];
      }

      const rects = [];
      const active = new Map();
      const clipBottom = clip.y + clip.height;
      const clipRight = clip.x + clip.width;

      for (let y = clip.y; y < clipBottom; y += 1) {
        const rowIntervals = (this.rows.get(y) || [])
          .map((interval) => [Math.max(interval[0], clip.x), Math.min(interval[1], clipRight)])
          .filter((interval) => interval[1] > interval[0]);
        const seenKeys = new Set();

        rowIntervals.forEach((interval) => {
          const key = `${interval[0]}:${interval[1]}`;
          const existing = active.get(key);

          seenKeys.add(key);

          if (existing) {
            existing.height += 1;
          } else {
            active.set(key, {
              height: 1,
              width: interval[1] - interval[0],
              x: interval[0],
              y,
            });
          }
        });

        Array.from(active.keys()).forEach((key) => {
          if (!seenKeys.has(key)) {
            rects.push(active.get(key));
            active.delete(key);
          }
        });
      }

      active.forEach((rect) => rects.push(rect));

      return rects;
    }

    forEachCoverageRect(clipRect, callback) {
      this.getCoverageRects(clipRect).forEach((rect) => callback(cloneRect(rect)));
    }

    getBoundarySegments(clipRect = null) {
      const clip = normalizeRect(clipRect) || this.getBounds();

      if (!clip) {
        return [];
      }

      const segments = [];
      const verticalActive = new Map();
      const clipBottom = clip.y + clip.height;
      const clipRight = clip.x + clip.width;
      const getClippedIntervals = (y) => (this.rows.get(y) || [])
        .map((interval) => [Math.max(interval[0], clip.x), Math.min(interval[1], clipRight)])
        .filter((interval) => interval[1] > interval[0]);

      for (let y = clip.y; y < clipBottom; y += 1) {
        const rowIntervals = getClippedIntervals(y);
        const previousIntervals = getClippedIntervals(y - 1);
        const nextIntervals = getClippedIntervals(y + 1);
        const activeVerticalKeys = new Set();

        subtractIntervals(rowIntervals, previousIntervals).forEach((interval) => {
          segments.push({
            x1: interval[0],
            x2: interval[1],
            y1: y,
            y2: y,
          });
        });

        subtractIntervals(rowIntervals, nextIntervals).forEach((interval) => {
          segments.push({
            x1: interval[0],
            x2: interval[1],
            y1: y + 1,
            y2: y + 1,
          });
        });

        rowIntervals.forEach((interval) => {
          [interval[0], interval[1]].forEach((x) => {
            const key = String(x);
            const active = verticalActive.get(key);

            activeVerticalKeys.add(key);

            if (active && active.y2 === y) {
              active.y2 = y + 1;
            } else {
              verticalActive.set(key, {
                x1: x,
                x2: x,
                y1: y,
                y2: y + 1,
              });
            }
          });
        });

        Array.from(verticalActive.keys()).forEach((key) => {
          if (!activeVerticalKeys.has(key)) {
            segments.push(verticalActive.get(key));
            verticalActive.delete(key);
          }
        });
      }

      verticalActive.forEach((segment) => segments.push(segment));

      return segments;
    }

    intersectBounds(rect) {
      return this.getCoverageRects(rect)
        .reduce((bounds, coverageRect) => {
          if (!bounds) {
            return cloneRect(coverageRect);
          }

          const x0 = Math.min(bounds.x, coverageRect.x);
          const y0 = Math.min(bounds.y, coverageRect.y);
          const x1 = Math.max(bounds.x + bounds.width, coverageRect.x + coverageRect.width);
          const y1 = Math.max(bounds.y + bounds.height, coverageRect.y + coverageRect.height);

          return {
            height: y1 - y0,
            width: x1 - x0,
            x: x0,
            y: y0,
          };
        }, null);
    }

    getTilePatchRects(rect, options = {}) {
      const tileSize = Math.max(1, Math.round(options.tileSize || 256));
      const coverageRects = this.getCoverageRects(rect);
      const baseRects = Array.isArray(options.baseTilePatchRects)
        ? options.baseTilePatchRects.map((item) => item?.patchRect || item).filter(Boolean)
        : null;
      const patches = [];

      coverageRects.forEach((coverageRect) => {
        const tx0 = Math.floor(coverageRect.x / tileSize);
        const ty0 = Math.floor(coverageRect.y / tileSize);
        const tx1 = Math.floor((coverageRect.x + coverageRect.width - 1) / tileSize);
        const ty1 = Math.floor((coverageRect.y + coverageRect.height - 1) / tileSize);

        for (let ty = ty0; ty <= ty1; ty += 1) {
          for (let tx = tx0; tx <= tx1; tx += 1) {
            const tileRect = {
              height: tileSize,
              width: tileSize,
              x: tx * tileSize,
              y: ty * tileSize,
            };
            let patchRect = intersectRects(coverageRect, tileRect);

            if (!patchRect) {
              continue;
            }

            if (baseRects) {
              baseRects.forEach((baseRect) => {
                const clippedPatch = intersectRects(patchRect, baseRect);

                if (clippedPatch) {
                  patches.push(clippedPatch);
                }
              });
            } else {
              patches.push(patchRect);
            }
          }
        }
      });

      return patches;
    }

    createMaskPixels(rect) {
      const maskRect = normalizeRect(rect) || this.getBounds();

      if (!maskRect) {
        return {
          height: 0,
          pixels: new Uint8Array(0),
          rect: null,
          width: 0,
        };
      }

      const pixels = new Uint8Array(maskRect.width * maskRect.height);

      this.forEachCoverageRect(maskRect, (coverageRect) => {
        for (let y = coverageRect.y; y < coverageRect.y + coverageRect.height; y += 1) {
          const rowOffset = (y - maskRect.y) * maskRect.width;

          for (let x = coverageRect.x; x < coverageRect.x + coverageRect.width; x += 1) {
            pixels[rowOffset + (x - maskRect.x)] = 255;
          }
        }
      });

      return {
        height: maskRect.height,
        pixels,
        rect: maskRect,
        width: maskRect.width,
      };
    }

    translate(dx = 0, dy = 0) {
      const offsetX = Math.round(Number(dx) || 0);
      const offsetY = Math.round(Number(dy) || 0);
      const translatedRows = new Map();

      this.rows.forEach((intervals, y) => {
        translatedRows.set(
          y + offsetY,
          intervals.map((interval) => [interval[0] + offsetX, interval[1] + offsetX]),
        );
      });

      return new SelectionRegion(translatedRows, this.version + 1);
    }
  }

  SelectionRegion.intersectRects = intersectRects;
  SelectionRegion.normalizeRect = normalizeRect;
  SelectionRegion.intervalsEqual = intervalsEqual;
  SelectionRegion.subtractIntervals = subtractIntervals;

  namespace.SelectionRegion = SelectionRegion;
})(window.CBO = window.CBO || {});
