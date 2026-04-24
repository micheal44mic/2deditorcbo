window.CBO = window.CBO || {};

(function registerSmudgeTool(CBO) {
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const clampByte = (value) => Math.max(0, Math.min(255, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));

    return t * t * (3 - 2 * t);
  }

  function defaultBrushMask(brush, dx, dy, radius, cx, cy) {
    const distance = Math.hypot(dx, dy);

    if (distance > radius) {
      return 0;
    }

    const normalized = distance / radius;
    const hardness = clamp01(brush.hardness);
    let mask = 1 - smoothstep(hardness, 1, normalized);

    if (brush.grain) {
      mask *= clamp01(brush.grain(dx / radius, dy / radius, cx, cy));
    }

    return clamp01(mask);
  }

  function mixUnpremul(
    fromR,
    fromG,
    fromB,
    fromA,
    toR,
    toG,
    toB,
    toA,
    amount,
    out,
  ) {
    if (amount <= 0) {
      out[0] = fromR;
      out[1] = fromG;
      out[2] = fromB;
      out[3] = fromA;
      return;
    }

    if (amount >= 1) {
      out[0] = toA > 0 ? toR : 0;
      out[1] = toA > 0 ? toG : 0;
      out[2] = toA > 0 ? toB : 0;
      out[3] = toA;
      return;
    }

    const fromAlpha = fromA / 255;
    const toAlpha = toA / 255;
    const premulR = lerp(fromR * fromAlpha, toR * toAlpha, amount);
    const premulG = lerp(fromG * fromAlpha, toG * toAlpha, amount);
    const premulB = lerp(fromB * fromAlpha, toB * toAlpha, amount);
    const alpha = lerp(fromA, toA, amount);

    if (alpha <= 0.001) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      return;
    }

    const alphaScale = 255 / alpha;
    out[0] = clampByte(premulR * alphaScale);
    out[1] = clampByte(premulG * alphaScale);
    out[2] = clampByte(premulB * alphaScale);
    out[3] = clampByte(alpha);
  }

  const Brushes = {
    softRound: {
      radius: 28,
      opacity: 0.45,
      hardness: 0.15,
      spacing: 0.18,
      drag: 0.32,
      pressureAffectsStrength: true,
    },
    wetPaint: {
      radius: 34,
      opacity: 0.85,
      hardness: 0.35,
      spacing: 0.12,
      drag: 0.58,
      pressureAffectsStrength: true,
    },
    pencilSmudge: {
      radius: 16,
      opacity: 0.25,
      hardness: 0.05,
      spacing: 0.22,
      drag: 0.22,
      pressureAffectsStrength: true,
      grain: (x, y, cx, cy) => {
        const noise =
          Math.sin(
            Math.floor((x * 35 + cx) * 2.1) * 12.9898 +
              Math.floor((y * 35 + cy) * 2.1) * 78.233,
          ) * 43758.5453;

        return 0.45 + 0.55 * (noise - Math.floor(noise));
      },
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
      this.reservoirSize = 0;
      this.reservoirRadius = 0;
      this.dragging = false;
      this.moved = false;
      this.lastStampX = 0;
      this.lastStampY = 0;
      this.lastPressure = 1;
      this.lastDirectionX = 1;
      this.lastDirectionY = 0;
      this.dragSample = new Float32Array(4);
      this.mixedColor = new Float32Array(4);
      this.raf = 0;
    }

    setBrush(brush) {
      this.brush = brush;
      this.reservoir = new Float32Array(0);
      this.reservoirSize = 0;
    }

    setPixels(pixels) {
      if (pixels.length !== this.width * this.height * 4) {
        throw new Error("Il buffer RGBA non corrisponde alle dimensioni della tela.");
      }

      this.pixels = pixels;
      this.reservoir = new Float32Array(0);
      this.reservoirSize = 0;
    }

    pointerDown(x, y, pressure = 1) {
      this.dragging = true;
      this.moved = false;
      this.lastStampX = x;
      this.lastStampY = y;
      this.lastPressure = this.normalizePressure(pressure);

      this.ensureReservoir();
      this.pickupPigment(x, y);
    }

    pointerMove(x, y, pressure = 1) {
      if (!this.dragging) {
        return;
      }

      const nextPressure = this.normalizePressure(pressure);
      const step = Math.max(1, this.brush.radius * 2 * this.brush.spacing);

      let dx = x - this.lastStampX;
      let dy = y - this.lastStampY;
      let distance = Math.hypot(dx, dy);
      let stamped = false;

      while (distance >= step) {
        const ux = dx / distance;
        const uy = dy / distance;
        const stampX = this.lastStampX + ux * step;
        const stampY = this.lastStampY + uy * step;
        const mixedPressure = (this.lastPressure + nextPressure) * 0.5;

        this.dab(stampX, stampY, mixedPressure, ux, uy);

        this.lastStampX = stampX;
        this.lastStampY = stampY;
        this.lastPressure = mixedPressure;
        this.lastDirectionX = ux;
        this.lastDirectionY = uy;

        dx = x - this.lastStampX;
        dy = y - this.lastStampY;
        distance = Math.hypot(dx, dy);
        stamped = true;
        this.moved = true;
      }

      if (!stamped && distance > 0.5) {
        const ux = dx / distance;
        const uy = dy / distance;

        this.dab(x, y, nextPressure, ux, uy);
        this.lastStampX = x;
        this.lastStampY = y;
        this.lastPressure = nextPressure;
        this.lastDirectionX = ux;
        this.lastDirectionY = uy;
        this.moved = true;
      }

      this.requestRender();
    }

    pointerUp(x, y, pressure = 1) {
      if (!this.dragging) {
        return;
      }

      if (!this.moved && x !== undefined && y !== undefined) {
        this.tapSoften(x, y, this.normalizePressure(pressure));
        this.requestRender();
      }

      this.dragging = false;
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

    normalizePressure(pressure) {
      if (!Number.isFinite(pressure) || pressure <= 0) {
        return 1;
      }

      return clamp01(pressure);
    }

    ensureReservoir() {
      const radius = Math.ceil(this.brush.radius);
      const size = radius * 2 + 1;

      if (size === this.reservoirSize) {
        return;
      }

      this.reservoirSize = size;
      this.reservoirRadius = radius;
      this.reservoir = new Float32Array(size * size * 4);
    }

    pickupPigment(cx, cy) {
      const radius = this.reservoirRadius;
      const size = this.reservoirSize;

      for (let yy = -radius; yy <= radius; yy += 1) {
        for (let xx = -radius; xx <= radius; xx += 1) {
          const px = Math.round(cx + xx);
          const py = Math.round(cy + yy);
          const sourceIndex = ((yy + radius) * size + (xx + radius)) * 4;

          if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
            this.reservoir[sourceIndex + 0] = 0;
            this.reservoir[sourceIndex + 1] = 0;
            this.reservoir[sourceIndex + 2] = 0;
            this.reservoir[sourceIndex + 3] = 0;
            continue;
          }

          const destinationIndex = (py * this.width + px) * 4;
          this.reservoir[sourceIndex + 0] = this.pixels[destinationIndex + 0];
          this.reservoir[sourceIndex + 1] = this.pixels[destinationIndex + 1];
          this.reservoir[sourceIndex + 2] = this.pixels[destinationIndex + 2];
          this.reservoir[sourceIndex + 3] = this.pixels[destinationIndex + 3];
        }
      }
    }

    dab(cx, cy, pressure, directionX = this.lastDirectionX, directionY = this.lastDirectionY) {
      const { brush } = this;
      const radius = brush.radius;
      this.ensureReservoir();

      const reservoirRadius = this.reservoirRadius;
      const size = this.reservoirSize;
      const pressureStrength = brush.pressureAffectsStrength === false ? 1 : pressure;
      const strength = clamp01(brush.opacity * pressureStrength);
      const laydownBase = strength;
      const pickupBase = 0.06 + 0.64 * strength;
      const directionLength = Math.hypot(directionX, directionY);
      const hasDirection = directionLength > 0.0001;
      const unitX = hasDirection ? directionX / directionLength : 0;
      const unitY = hasDirection ? directionY / directionLength : 0;
      const dragBase = hasDirection ? clamp01(brush.drag * pressureStrength) : 0;
      const dragDistance = radius * dragBase * (0.2 + 0.8 * strength);
      const dragSnapshot =
        dragDistance > 0.01 ? this.createSnapshot(cx, cy, reservoirRadius, dragDistance) : null;

      for (let yy = -reservoirRadius; yy <= reservoirRadius; yy += 1) {
        const py = Math.round(cy + yy);

        if (py < 0 || py >= this.height) {
          continue;
        }

        for (let xx = -reservoirRadius; xx <= reservoirRadius; xx += 1) {
          const px = Math.round(cx + xx);

          if (px < 0 || px >= this.width) {
            continue;
          }

          const mask = defaultBrushMask(brush, xx, yy, radius, cx, cy);

          if (mask <= 0) {
            continue;
          }

          const pixelIndex = (py * this.width + px) * 4;
          const reservoirIndex = ((yy + reservoirRadius) * size + (xx + reservoirRadius)) * 4;

          const oldR = this.pixels[pixelIndex + 0];
          const oldG = this.pixels[pixelIndex + 1];
          const oldB = this.pixels[pixelIndex + 2];
          const oldA = this.pixels[pixelIndex + 3];

          const smudgeR = this.reservoir[reservoirIndex + 0];
          const smudgeG = this.reservoir[reservoirIndex + 1];
          const smudgeB = this.reservoir[reservoirIndex + 2];
          const smudgeA = this.reservoir[reservoirIndex + 3];
          const oldCoverage = oldA / 255;
          const smudgeCoverage = smudgeA / 255;

          let baseR = oldR;
          let baseG = oldG;
          let baseB = oldB;
          let baseA = oldA;

          if (dragSnapshot) {
            const localDrag = dragDistance * (0.35 + 0.65 * mask);
            const sourceX = px - unitX * localDrag;
            const sourceY = py - unitY * localDrag;

            this.sampleSnapshot(dragSnapshot, sourceX, sourceY, this.dragSample);

            const sampleCoverage = this.dragSample[3] / 255;
            const directionalMix = clamp01(
              mask * dragBase * 0.9 * Math.max(oldCoverage, sampleCoverage),
            );

            mixUnpremul(
              oldR,
              oldG,
              oldB,
              oldA,
              this.dragSample[0],
              this.dragSample[1],
              this.dragSample[2],
              this.dragSample[3],
              directionalMix,
              this.mixedColor,
            );

            baseR = this.mixedColor[0];
            baseG = this.mixedColor[1];
            baseB = this.mixedColor[2];
            baseA = this.mixedColor[3];
          }

          const baseCoverage = baseA / 255;
          const paintOrEraseGate = Math.max(baseCoverage, smudgeCoverage);
          const laydown = clamp01(mask * laydownBase * paintOrEraseGate);

          mixUnpremul(
            baseR,
            baseG,
            baseB,
            baseA,
            smudgeR,
            smudgeG,
            smudgeB,
            smudgeA,
            laydown,
            this.mixedColor,
          );

          this.pixels[pixelIndex + 0] = this.mixedColor[0];
          this.pixels[pixelIndex + 1] = this.mixedColor[1];
          this.pixels[pixelIndex + 2] = this.mixedColor[2];
          this.pixels[pixelIndex + 3] = this.mixedColor[3];

          const transparentCleanup = (1 - oldCoverage) * (0.18 + 0.22 * strength);
          const pickup = clamp01(mask * (pickupBase + transparentCleanup));

          mixUnpremul(
            smudgeR,
            smudgeG,
            smudgeB,
            smudgeA,
            oldR,
            oldG,
            oldB,
            oldA,
            pickup,
            this.mixedColor,
          );

          this.reservoir[reservoirIndex + 0] = this.mixedColor[0];
          this.reservoir[reservoirIndex + 1] = this.mixedColor[1];
          this.reservoir[reservoirIndex + 2] = this.mixedColor[2];
          this.reservoir[reservoirIndex + 3] = this.mixedColor[3];
        }
      }
    }

    createSnapshot(cx, cy, radius, dragDistance) {
      const padding = Math.ceil(dragDistance) + 2;
      const x = Math.max(0, Math.floor(cx - radius - padding));
      const y = Math.max(0, Math.floor(cy - radius - padding));
      const maxX = Math.min(this.width - 1, Math.ceil(cx + radius + padding));
      const maxY = Math.min(this.height - 1, Math.ceil(cy + radius + padding));
      const width = maxX - x + 1;
      const height = maxY - y + 1;
      const data = new Uint8ClampedArray(width * height * 4);

      for (let yy = 0; yy < height; yy += 1) {
        const sourceStart = ((y + yy) * this.width + x) * 4;
        const sourceEnd = sourceStart + width * 4;
        data.set(this.pixels.subarray(sourceStart, sourceEnd), yy * width * 4);
      }

      return { data, x, y, width, height };
    }

    sampleSnapshot(snapshot, x, y, out) {
      const px = Math.round(x);
      const py = Math.round(y);

      if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        return;
      }

      const localX = px - snapshot.x;
      const localY = py - snapshot.y;

      if (localX < 0 || localY < 0 || localX >= snapshot.width || localY >= snapshot.height) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        return;
      }

      const index = (localY * snapshot.width + localX) * 4;
      out[0] = snapshot.data[index + 0];
      out[1] = snapshot.data[index + 1];
      out[2] = snapshot.data[index + 2];
      out[3] = snapshot.data[index + 3];
    }

    tapSoften(cx, cy, pressure) {
      const { brush } = this;
      const radius = Math.ceil(brush.radius);
      const strength = clamp01(brush.opacity * pressure) * 0.35;
      let averageR = 0;
      let averageG = 0;
      let averageB = 0;
      let averageA = 0;
      let averageWeight = 0;

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

          const mask = defaultBrushMask(brush, xx, yy, brush.radius, cx, cy);

          if (mask <= 0) {
            continue;
          }

          const index = (py * this.width + px) * 4;
          averageR += this.pixels[index + 0] * mask;
          averageG += this.pixels[index + 1] * mask;
          averageB += this.pixels[index + 2] * mask;
          averageA += this.pixels[index + 3] * mask;
          averageWeight += mask;
        }
      }

      if (averageWeight <= 0) {
        return;
      }

      averageR /= averageWeight;
      averageG /= averageWeight;
      averageB /= averageWeight;
      averageA /= averageWeight;

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

          const mask = defaultBrushMask(brush, xx, yy, brush.radius, cx, cy);

          if (mask <= 0) {
            continue;
          }

          const index = (py * this.width + px) * 4;
          const t = clamp01(mask * strength);
          this.pixels[index + 0] = lerp(this.pixels[index + 0], averageR, t);
          this.pixels[index + 1] = lerp(this.pixels[index + 1], averageG, t);
          this.pixels[index + 2] = lerp(this.pixels[index + 2], averageB, t);
          this.pixels[index + 3] = lerp(this.pixels[index + 3], averageA, t);
        }
      }

      this.pickupPigment(cx, cy);
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
