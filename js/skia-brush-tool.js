window.CBO = window.CBO || {};

(function registerSkiaBrushTool(CBO) {
  const StrokeMath = CBO.StrokeMath;

  function parseHexColor(hexColor) {
    const fallback = [1, 1, 1];
    const normalized = String(hexColor || "").replace("#", "");

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return fallback;
    }

    return [
      parseInt(normalized.slice(0, 2), 16) / 255,
      parseInt(normalized.slice(2, 4), 16) / 255,
      parseInt(normalized.slice(4, 6), 16) / 255,
    ];
  }

  class SkiaBrushTool {
    constructor({ canvasKit, skCanvas, surface, width, height, getSettings, getColor }) {
      this.CanvasKit = canvasKit;
      this.skCanvas = skCanvas;
      this.surface = surface;
      this.width = width;
      this.height = height;
      this.getSettings = getSettings;
      this.getColor = getColor;
      this.tool = "brush";
      this.strokeState = null;
      this.syncPixelsOnEnd = true;
      this.bounds = {
        minX: 0,
        minY: 0,
        maxX: width - 1,
        maxY: height - 1,
      };
      this.brushPaint = new canvasKit.Paint();
      this.eraserPaint = new canvasKit.Paint();

      this.configureFillPaint(this.brushPaint);
      this.configureFillPaint(this.eraserPaint);
      this.eraserPaint.setBlendMode(canvasKit.BlendMode.Clear);
    }

    configureFillPaint(paint) {
      paint.setAntiAlias(true);
      paint.setStyle(this.CanvasKit.PaintStyle.Fill);
    }

    setTool(tool) {
      this.tool = tool === "eraser" ? "eraser" : "brush";
    }

    pointerDown(x, y, pressure = 1) {
      const point = { x, y };

      this.strokeState = StrokeMath.createStrokeState(point, {
        pressure,
        tool: this.tool,
      });
      this.drawDab(point, pressure);
      this.surface.flush();
    }

    pointerMove(x, y, pressure = 1) {
      if (!this.strokeState) {
        return;
      }

      const strokeInput = this.processInput({ x, y }, pressure);

      this.drawSegment(strokeInput.point, strokeInput.pressure);
    }

    pointerUp(x, y, pressure = 1) {
      if (!this.strokeState) {
        return;
      }

      const strokeInput = this.processInput({ x, y }, pressure);

      this.drawSegment(strokeInput.point, strokeInput.pressure, true);
      this.strokeState = null;
    }

    processInput(point, pressure) {
      if (this.tool !== "brush") {
        return {
          point,
          pressure: StrokeMath.normalizePressure(pressure),
        };
      }

      return StrokeMath.processStrokeInput(
        point,
        this.strokeState,
        this.getSettings(this.tool),
        pressure,
      );
    }

    drawSegment(to, pressure = 1, forceFinalDab = false) {
      const settings = this.getSettings(this.tool);
      const radius = StrokeMath.getEffectiveRadius(settings, pressure);

      StrokeMath.drawStrokeSegment({
        to,
        state: this.strokeState,
        settings,
        radius,
        pressure,
        bounds: this.bounds,
        forceFinalDab,
        drawDab: (point, dabPressure, opacityScale) => {
          this.drawDab(point, dabPressure, opacityScale);
        },
      });
      this.surface.flush();
    }

    drawDab(point, pressure = 1, opacityScale = 1) {
      const settings = this.getSettings(this.tool);
      const radius = StrokeMath.getEffectiveRadius(settings, pressure);
      const opacity = StrokeMath.clamp01(settings.opacity) * StrokeMath.clamp01(opacityScale);
      const paint = this.tool === "eraser" ? this.eraserPaint : this.brushPaint;

      if (opacity <= 0) {
        return;
      }

      if (this.tool === "brush") {
        const [red, green, blue] = parseHexColor(this.getColor());
        paint.setColor(this.CanvasKit.Color4f(red, green, blue, opacity));
      } else {
        paint.setColor(this.CanvasKit.Color4f(0, 0, 0, opacity));
      }

      this.skCanvas.drawCircle(point.x, point.y, radius, paint);
    }
  }

  CBO.SkiaBrushTool = SkiaBrushTool;
})(window.CBO);
