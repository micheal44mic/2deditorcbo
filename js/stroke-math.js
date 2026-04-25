window.CBO = window.CBO || {};

(function registerStrokeMath(CBO) {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function normalizePressure(pressure) {
    const nextPressure = Number(pressure);

    if (!Number.isFinite(nextPressure) || nextPressure <= 0) {
      return 1;
    }

    return clamp(nextPressure, 0.2, 2);
  }

  function getEffectiveRadius(settings, pressure) {
    return Math.max(0.5, Number(settings?.radius || 0) * normalizePressure(pressure));
  }

  function getStreamLineAmount(settings) {
    return clamp01(settings?.streamLineAmount ?? settings?.smoothing);
  }

  function getToolSeedSalt(tool) {
    if (tool === "eraser") {
      return 0x9e3779b9;
    }

    return 0x85ebca6b;
  }

  function createStrokeSeed(point, tool) {
    return (
      Date.now() ^
      Math.round(point.x * 1000) ^
      Math.round(point.y * 1000) ^
      getToolSeedSalt(tool)
    ) >>> 0;
  }

  function createStrokeState(point, options = {}) {
    const seed = options.seed ?? createStrokeSeed(point, options.tool);

    return {
      distance: 0,
      inputPoints: [{ ...point }],
      lastStampPoint: { ...point },
      pressure: normalizePressure(options.pressure),
      seed: (seed || 1) >>> 0,
      smoothedPoint: { ...point },
      tool: options.tool || "",
    };
  }

  function getStabilizedPoint(point, state, settings) {
    const stabilization = clamp01(settings?.stabilizationAmount);

    state.inputPoints.push({ ...point });

    if (state.inputPoints.length > 28) {
      state.inputPoints.shift();
    }

    if (stabilization <= 0 || state.inputPoints.length < 2) {
      return point;
    }

    const previousPoint = state.inputPoints[state.inputPoints.length - 2];
    const speed = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    const speedFactor = clamp(speed / 28, 0, 1);
    const effectiveStabilization = stabilization * (0.35 + speedFactor * 0.65);
    const windowSize = Math.min(
      state.inputPoints.length,
      2 + Math.round(effectiveStabilization * 16),
    );
    const points = state.inputPoints.slice(-windowSize);
    const average = points.reduce(
      (result, nextPoint) => ({
        x: result.x + nextPoint.x / points.length,
        y: result.y + nextPoint.y / points.length,
      }),
      { x: 0, y: 0 },
    );

    return {
      x: point.x + (average.x - point.x) * effectiveStabilization,
      y: point.y + (average.y - point.y) * effectiveStabilization,
    };
  }

  function getSmoothedPressure(pressure, state, settings) {
    const streamLinePressure = clamp01(settings?.streamLinePressure);
    const nextPressure = normalizePressure(pressure);

    if (streamLinePressure <= 0) {
      state.pressure = nextPressure;
      return nextPressure;
    }

    const follow = clamp(1 - streamLinePressure * 0.92, 0.08, 1);

    state.pressure += (nextPressure - state.pressure) * follow;

    return state.pressure;
  }

  function processStrokeInput(point, state, settings, pressure = 1) {
    if (!state) {
      return {
        point,
        pressure: normalizePressure(pressure),
      };
    }

    const stabilizedPoint = getStabilizedPoint(point, state, settings);
    const streamLineAmount = getStreamLineAmount(settings);
    const nextPressure = getSmoothedPressure(pressure, state, settings);

    if (streamLineAmount <= 0) {
      state.smoothedPoint = { ...stabilizedPoint };
      return {
        point: stabilizedPoint,
        pressure: nextPressure,
      };
    }

    const follow = clamp(1 - streamLineAmount * 0.88, 0.08, 1);

    state.smoothedPoint = {
      x: state.smoothedPoint.x + (stabilizedPoint.x - state.smoothedPoint.x) * follow,
      y: state.smoothedPoint.y + (stabilizedPoint.y - state.smoothedPoint.y) * follow,
    };

    return {
      point: state.smoothedPoint,
      pressure: nextPressure,
    };
  }

  function nextRandom(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;

    return state.seed / 4294967296;
  }

  function randomSigned(state) {
    return nextRandom(state) * 2 - 1;
  }

  function getNextStampStep(settings, radius, state) {
    const spacing = clamp01(settings?.spacing);
    const spacingJitter = clamp01(settings?.spacingJitter);
    const minStep = Math.max(1, radius * 0.12);
    const maxStep = Math.max(minStep, radius * 2.6);
    const baseStep = minStep + (maxStep - minStep) * spacing;
    const jitterSpan = radius * (0.35 + spacing * 1.6) * spacingJitter;

    return Math.max(minStep, baseStep + randomSigned(state) * jitterSpan);
  }

  function getFallOffScale(settings, state, radius) {
    const fallOff = clamp01(settings?.fallOff);

    if (fallOff <= 0) {
      return 1;
    }

    const fadeDistance = Math.max(radius * 2, radius * (96 - fallOff * 88));

    return clamp(1 - state.distance / fadeDistance, 0, 1);
  }

  function applyTipCurve(t, taperTip) {
    // Curva del taper: tip=0 sharp (esponenziale ripida, recupera subito alla pienezza),
    // tip=1 chunky (curva quasi lineare, taper graduale e lungo).
    const exponent = 0.35 + clamp01(taperTip) * 2.4;
    return Math.pow(clamp01(t), exponent);
  }

  function getTaperFactor(distanceFromStart, totalLength, settings) {
    const taperStart = clamp01(settings?.taperStart);
    const taperEnd = clamp01(settings?.taperEnd);
    const taperMinDistance = Math.max(0, Number(settings?.taperMinDistance) || 0);

    if (totalLength <= 0 || (taperStart <= 0 && taperEnd <= 0)) {
      return 1;
    }

    const tip = clamp01(settings?.taperTip ?? 0.5);
    let factor = 1;

    const startLen = taperStart > 0
      ? Math.max(taperStart * totalLength, taperMinDistance)
      : 0;
    if (startLen > 0 && distanceFromStart < startLen) {
      factor = Math.min(factor, applyTipCurve(distanceFromStart / startLen, tip));
    }

    const endLen = taperEnd > 0
      ? Math.max(taperEnd * totalLength, taperMinDistance)
      : 0;
    const distanceFromEnd = totalLength - distanceFromStart;
    if (endLen > 0 && distanceFromEnd < endLen) {
      factor = Math.min(factor, applyTipCurve(distanceFromEnd / endLen, tip));
    }

    return clamp01(factor);
  }

  function clampPointToBounds(point, bounds) {
    if (!bounds) {
      return point;
    }

    return {
      x: clamp(point.x, bounds.minX ?? 0, bounds.maxX ?? bounds.width ?? point.x),
      y: clamp(point.y, bounds.minY ?? 0, bounds.maxY ?? bounds.height ?? point.y),
    };
  }

  function applyStampJitter(point, tangent, settings, radius, state, bounds) {
    const lateral = clamp(settings?.jitterLateral, 0, 2) * radius;
    const linear = clamp(settings?.jitterLinear, 0, 2) * radius;

    if (lateral <= 0 && linear <= 0) {
      return clampPointToBounds(point, bounds);
    }

    const lateralOffset = randomSigned(state) * lateral;
    const linearOffset = randomSigned(state) * linear;
    const perpendicular = {
      x: -tangent.y,
      y: tangent.x,
    };

    return clampPointToBounds(
      {
        x: point.x + perpendicular.x * lateralOffset + tangent.x * linearOffset,
        y: point.y + perpendicular.y * lateralOffset + tangent.y * linearOffset,
      },
      bounds,
    );
  }

  function drawStrokeSegment({
    to,
    state,
    settings,
    radius,
    pressure = 1,
    bounds,
    forceFinalDab = false,
    drawDab,
  }) {
    if (!state || typeof drawDab !== "function") {
      return;
    }

    let from = state.lastStampPoint;
    let deltaX = to.x - from.x;
    let deltaY = to.y - from.y;
    let distance = Math.hypot(deltaX, deltaY);

    while (distance > 0) {
      const step = getNextStampStep(settings, radius, state);

      if (distance < step) {
        break;
      }

      const tangent = {
        x: deltaX / distance,
        y: deltaY / distance,
      };
      const stampPoint = {
        x: from.x + tangent.x * step,
        y: from.y + tangent.y * step,
      };

      state.distance += step;
      drawDab(
        applyStampJitter(stampPoint, tangent, settings, radius, state, bounds),
        pressure,
        getFallOffScale(settings, state, radius),
      );
      state.lastStampPoint = stampPoint;
      from = state.lastStampPoint;
      deltaX = to.x - from.x;
      deltaY = to.y - from.y;
      distance = Math.hypot(deltaX, deltaY);
    }

    if (forceFinalDab && distance > Math.max(0.5, radius * 0.08)) {
      state.distance += distance;
      drawDab(
        clampPointToBounds(to, bounds),
        pressure,
        getFallOffScale(settings, state, radius),
      );
      state.lastStampPoint = { ...to };
    }
  }

  CBO.StrokeMath = {
    clamp,
    clamp01,
    normalizePressure,
    getEffectiveRadius,
    getStreamLineAmount,
    createStrokeState,
    processStrokeInput,
    getNextStampStep,
    getFallOffScale,
    applyStampJitter,
    drawStrokeSegment,
    getTaperFactor,
    applyTipCurve,
  };
})(window.CBO);
