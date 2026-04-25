window.CBO = window.CBO || {};

(function registerSmudgeTool(CBO) {
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const lerp = (a, b, t) => a + (b - a) * t;

  const Brushes = {
    softRound: {
      radius: 28,
      opacity: 0.42,
      hardness: 0.16,
      spacing: 0.04,
      drag: 0.18,
      pressureAffectsStrength: true,
    },
    wetPaint: {
      radius: 34,
      opacity: 0.78,
      hardness: 0.35,
      spacing: 0.03,
      drag: 0.92,
      pressureAffectsStrength: true,
    },
    pencilSmudge: {
      radius: 16,
      opacity: 0.36,
      hardness: 0.08,
      spacing: 0.045,
      drag: 0.16,
      pressureAffectsStrength: true,
    },
  };

  class SmudgeTool {
    constructor(pixels, width, height, brush, renderer) {
      this.pixels = pixels;
      this.width = width;
      this.height = height;
      this.brush = brush;
      this.renderer = renderer;
      this.reservoir = new Float32Array(0);
      this.brushMask = new Float32Array(0);
      this.bufferSize = 0;
      this.bufferRadius = 0;
      this.dragging = false;
      this.lastStampX = 0;
      this.lastStampY = 0;
      this.lastPressure = 1;
      this.raf = 0;
    }

    setBrush(brush) {
      const previousRadius = Math.ceil(this.brush?.radius || 0);
      const previousHardness = this.brush?.hardness;

      this.brush = brush;

      if (
        Math.ceil(this.brush.radius || 0) !== previousRadius ||
        this.brush.hardness !== previousHardness
      ) {
        this.bufferSize = 0;
      }
    }

    setPixels(pixels) {
      if (pixels.length !== this.width * this.height * 4) {
        throw new Error("Il buffer RGBA non corrisponde alle dimensioni della tela.");
      }

      this.pixels = pixels;
    }

    ensureBuffers() {
      const radius = Math.ceil(this.brush.radius);
      const size = radius * 2 + 1;

      if (this.bufferSize === size) {
        return;
      }

      this.bufferSize = size;
      this.bufferRadius = radius;
      this.reservoir = new Float32Array(size * size * 4);
      this.brushMask = new Float32Array(size * size);

      const hardness = clamp01(this.brush.hardness || 0.5);

      for (let yy = -radius; yy <= radius; yy += 1) {
        for (let xx = -radius; xx <= radius; xx += 1) {
          const distance = radius > 0 ? Math.hypot(xx, yy) / radius : 1;
          let alpha = 0;

          if (distance <= 1) {
            if (distance < hardness) {
              alpha = 1;
            } else {
              const t = (distance - hardness) / Math.max(0.0001, 1 - hardness);

              alpha = 1 - t * t * (3 - 2 * t);
            }
          }

          this.brushMask[(yy + radius) * size + (xx + radius)] = alpha;
        }
      }
    }

    pointerDown(x, y, pressure = 1) {
      this.dragging = true;
      this.lastStampX = x;
      this.lastStampY = y;
      this.lastPressure = this.normalizePressure(pressure);

      this.ensureBuffers();
      this.pickupInitialCanvas(x, y);
    }

    pointerMove(x, y, pressure = 1) {
      if (!this.dragging) {
        return;
      }

      const nextPressure = this.normalizePressure(pressure);
      const step = Math.max(0.5, this.brush.radius * 2 * Math.max(0.01, this.brush.spacing));

      let deltaX = x - this.lastStampX;
      let deltaY = y - this.lastStampY;
      let distance = Math.hypot(deltaX, deltaY);

      while (distance >= step) {
        const tangentX = deltaX / distance;
        const tangentY = deltaY / distance;
        const stampX = this.lastStampX + tangentX * step;
        const stampY = this.lastStampY + tangentY * step;
        const mixedPressure = (this.lastPressure + nextPressure) * 0.5;

        this.dab(stampX, stampY, mixedPressure);

        this.lastStampX = stampX;
        this.lastStampY = stampY;
        this.lastPressure = mixedPressure;

        deltaX = x - this.lastStampX;
        deltaY = y - this.lastStampY;
        distance = Math.hypot(deltaX, deltaY);
      }

      this.requestRender();
    }

    pointerUp(x, y, pressure = 1) {
      if (!this.dragging) {
        return;
      }

      this.pointerMove(x, y, pressure);
      this.dragging = false;
      this.requestRender();
    }

    pickupInitialCanvas(cx, cy) {
      const radius = this.bufferRadius;
      const size = this.bufferSize;

      for (let yy = -radius; yy <= radius; yy += 1) {
        const py = Math.round(cy + yy);

        for (let xx = -radius; xx <= radius; xx += 1) {
          const px = Math.round(cx + xx);
          const reservoirIndex = ((yy + radius) * size + (xx + radius)) * 4;

          if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
            this.reservoir[reservoirIndex + 0] = 0;
            this.reservoir[reservoirIndex + 1] = 0;
            this.reservoir[reservoirIndex + 2] = 0;
            this.reservoir[reservoirIndex + 3] = 0;
            continue;
          }

          const canvasIndex = (py * this.width + px) * 4;
          const alpha = this.pixels[canvasIndex + 3];
          const alphaScale = alpha / 255;

          this.reservoir[reservoirIndex + 0] = this.pixels[canvasIndex + 0] * alphaScale;
          this.reservoir[reservoirIndex + 1] = this.pixels[canvasIndex + 1] * alphaScale;
          this.reservoir[reservoirIndex + 2] = this.pixels[canvasIndex + 2] * alphaScale;
          this.reservoir[reservoirIndex + 3] = alpha;
        }
      }
    }

    dab(cx, cy, pressure) {
      const radius = this.bufferRadius;
      const size = this.bufferSize;
      const pressureStrength = this.brush.pressureAffectsStrength === false ? 1 : pressure;
      const laydownRate = clamp01(this.brush.opacity) * pressureStrength;
      const pickupRate = 1 - clamp01(this.brush.drag);

      for (let yy = -radius; yy <= radius; yy += 1) {
        const py = Math.round(cy + yy);

        if (py < 0 || py >= this.height) {
          continue;
        }

        for (let xx = -radius; xx <= radius; xx += 1) {
          const px = Math.round(cx + xx);

          if (px < 0 || px >= this.width) {
            continue;
          }

          const maskIndex = (yy + radius) * size + (xx + radius);
          const maskAlpha = this.brushMask[maskIndex];

          if (maskAlpha <= 0) {
            continue;
          }

          const canvasIndex = (py * this.width + px) * 4;
          const reservoirIndex = maskIndex * 4;
          const canvasA = this.pixels[canvasIndex + 3];
          const canvasAn = canvasA / 255;
          const canvasPR = this.pixels[canvasIndex + 0] * canvasAn;
          const canvasPG = this.pixels[canvasIndex + 1] * canvasAn;
          const canvasPB = this.pixels[canvasIndex + 2] * canvasAn;
          const reservoirPR = this.reservoir[reservoirIndex + 0];
          const reservoirPG = this.reservoir[reservoirIndex + 1];
          const reservoirPB = this.reservoir[reservoirIndex + 2];
          const reservoirA = this.reservoir[reservoirIndex + 3];
          const laydownMix = maskAlpha * laydownRate;
          const outputPR = lerp(canvasPR, reservoirPR, laydownMix);
          const outputPG = lerp(canvasPG, reservoirPG, laydownMix);
          const outputPB = lerp(canvasPB, reservoirPB, laydownMix);
          const outputA = lerp(canvasA, reservoirA, laydownMix);

          if (outputA > 0) {
            const inv = 255 / outputA;

            this.pixels[canvasIndex + 0] = Math.min(255, outputPR * inv);
            this.pixels[canvasIndex + 1] = Math.min(255, outputPG * inv);
            this.pixels[canvasIndex + 2] = Math.min(255, outputPB * inv);
            this.pixels[canvasIndex + 3] = outputA;
          } else {
            this.pixels[canvasIndex + 0] = 0;
            this.pixels[canvasIndex + 1] = 0;
            this.pixels[canvasIndex + 2] = 0;
            this.pixels[canvasIndex + 3] = 0;
          }

          const pickupMix = maskAlpha * pickupRate;

          if (pickupMix > 0) {
            this.reservoir[reservoirIndex + 0] = lerp(reservoirPR, outputPR, pickupMix);
            this.reservoir[reservoirIndex + 1] = lerp(reservoirPG, outputPG, pickupMix);
            this.reservoir[reservoirIndex + 2] = lerp(reservoirPB, outputPB, pickupMix);
            this.reservoir[reservoirIndex + 3] = lerp(reservoirA, outputA, pickupMix);
          }
        }
      }
    }

    normalizePressure(pressure) {
      return !Number.isFinite(pressure) || pressure <= 0 ? 1 : clamp01(pressure);
    }

    render() {
      if (typeof this.renderer === "function") {
        this.renderer();
        return;
      }

      if (this.renderer?.renderPixels) {
        this.renderer.renderPixels(this.pixels);
      }
    }

    requestRender() {
      if (this.raf) {
        return;
      }

      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.render();
      });
    }
  }

  CBO.SmudgeBrushes = Brushes;
  CBO.SmudgeTool = SmudgeTool;
})(window.CBO);
