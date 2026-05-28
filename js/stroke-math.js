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

    if (!Number.isFinite(nextPressure)) {
      return 1;
    }

    return clamp(nextPressure, 0, 2);
  }

  function getEffectiveRadius(settings, pressure) {
    return Math.max(0.5, Number(settings?.radius || 0) * 0.5 * normalizePressure(pressure));
  }

  function clonePoint(point) {
    return {
      x: Number(point?.x) || 0,
      y: Number(point?.y) || 0,
    };
  }

  function getBrushSize(settings) {
    const size = Number(settings?.radius ?? settings?.size);

    return Number.isFinite(size) && size > 0 ? size : 18;
  }

  function getStabilizationRopeLength(settings, input, amount) {
    const brushSize = getBrushSize(settings);
    const zoom = Math.max(0.0001, Number(input?.cameraZoom) || 1);
    const dpr = Math.max(0.0001, Number(input?.dpr) || 1);
    const maxCssLength = clamp(brushSize * 2.4 + 18, 14, 96);
    const ropeCssLength = 2 + Math.pow(clamp01(amount), 1.15) * maxCssLength;

    return ropeCssLength * dpr / zoom;
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
      inputPoints: [createInputPoint(point, options)],
      lastStampPoint: { ...point },
      pressure: normalizePressure(options.pressure),
      pulledStringPoint: { ...point },
      seed: (seed || 1) >>> 0,
      smoothedPoint: { ...point },
      stabilizationGuide: null,
      tool: options.tool || "",
    };
  }

  function normalizePointerType(input) {
    return String(input?.pointerType || "").toLowerCase();
  }

  function getInputProfile(input = {}) {
    const pointerType = normalizePointerType(input);

    if (pointerType === "pen") {
      return {
        motionScale: 0.82,
        stabilizationScale: 0.72,
        streamLineScale: 0.86,
        tipAttachmentSamples: 5,
      };
    }

    if (pointerType === "touch") {
      return {
        motionScale: 1.28,
        stabilizationScale: 1.12,
        streamLineScale: 1.05,
        tipAttachmentSamples: 8,
      };
    }

    if (pointerType === "mouse") {
      return {
        motionScale: 1.08,
        stabilizationScale: 0.96,
        streamLineScale: 1,
        tipAttachmentSamples: 6,
      };
    }

    return {
      motionScale: 1,
      stabilizationScale: 1,
      streamLineScale: 1,
      tipAttachmentSamples: 6,
    };
  }

  function createInputPoint(point, input = {}) {
    const time = Number(input?.time);

    return {
      x: point.x,
      y: point.y,
      time: Number.isFinite(time) ? time : null,
    };
  }

  function pushInputPoint(point, state, input) {
    state.inputPoints.push(createInputPoint(point, input));

    if (state.inputPoints.length > 28) {
      state.inputPoints.shift();
    }
  }

  function distanceBetween(a, b) {
    if (!a || !b) {
      return 0;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getPathDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return 0;
    }

    return points.reduce((total, nextPoint, index) => {
      if (index === 0) {
        return 0;
      }

      return total + distanceBetween(nextPoint, points[index - 1]);
    }, 0);
  }

  function getPathDirectness(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return 0;
    }

    const start = points[0];
    const end = points[points.length - 1];
    const pathLength = getPathDistance(points);

    return pathLength > 0 ? clamp(distanceBetween(start, end) / pathLength, 0, 1) : 0;
  }

  function getTipAttachmentFactor(state, profile) {
    const samples = Math.max(1, Number(profile?.tipAttachmentSamples) || 1);
    const count = Math.max(0, (state?.inputPoints?.length || 1) - 1);

    return clamp(count / samples, 0.18, 1);
  }

  function getSampleSpeedFactor(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return 0;
    }

    const point = points[points.length - 1];
    const previousPoint = points[points.length - 2];
    const distance = distanceBetween(point, previousPoint);
    const time = Number(point.time);
    const previousTime = Number(previousPoint.time);

    if (Number.isFinite(time) && Number.isFinite(previousTime) && time > previousTime) {
      const frameDistance = distance * (16.667 / Math.max(1, time - previousTime));

      return clamp(frameDistance / 26, 0, 1);
    }

    return clamp(distance / 28, 0, 1);
  }

  function getWeightedAverage(points, amount) {
    const lastIndex = points.length - 1;
    const recencyPower = 1.15 + (1 - amount) * 1.65;
    let weightTotal = 0;
    let x = 0;
    let y = 0;

    points.forEach((nextPoint, index) => {
      const recency = lastIndex <= 0 ? 1 : index / lastIndex;
      const weight = Math.max(0.05, Math.pow(recency, recencyPower));

      weightTotal += weight;
      x += nextPoint.x * weight;
      y += nextPoint.y * weight;
    });

    return weightTotal > 0
      ? { x: x / weightTotal, y: y / weightTotal }
      : points[lastIndex];
  }

  function getStabilizedPoint(point, state, settings, input = {}) {
    const profile = getInputProfile(input);
    const stabilization = clamp01(settings?.stabilizationAmount) * profile.stabilizationScale;

    if (stabilization <= 0 || state.inputPoints.length < 2) {
      state.stabilizationGuide = null;
      state.pulledStringPoint = { ...point };
      return point;
    }

    const anchor = state.pulledStringPoint || state.smoothedPoint || point;
    const ropeLength = getStabilizationRopeLength(settings, input, stabilization);
    const deltaX = point.x - anchor.x;
    const deltaY = point.y - anchor.y;
    const distance = Math.hypot(deltaX, deltaY);
    const isTaut = distance > ropeLength;
    const nextPoint = isTaut
      ? {
          x: point.x - (deltaX / distance) * ropeLength,
          y: point.y - (deltaY / distance) * ropeLength,
        }
      : { ...anchor };
    const guideInputPoint = input?.rawPoint ? clonePoint(input.rawPoint) : clonePoint(point);

    state.pulledStringPoint = nextPoint;
    state.stabilizationGuide = {
      active: true,
      distance,
      inputPoint: guideInputPoint,
      outputPoint: clonePoint(nextPoint),
      ropeLength,
      taut: isTaut,
    };

    return nextPoint;
  }

  function getMotionCornerPreserve(points) {
    if (!Array.isArray(points) || points.length < 5) {
      return 0;
    }

    const start = points[0];
    const middle = points[Math.floor(points.length * 0.5)];
    const end = points[points.length - 1];
    const firstX = middle.x - start.x;
    const firstY = middle.y - start.y;
    const secondX = end.x - middle.x;
    const secondY = end.y - middle.y;
    const firstLength = Math.hypot(firstX, firstY);
    const secondLength = Math.hypot(secondX, secondY);
    const directness = getPathDirectness(points);

    if (firstLength <= 0.5 || secondLength <= 0.5) {
      return 0;
    }

    const dot = clamp((firstX * secondX + firstY * secondY) / (firstLength * secondLength), -1, 1);

    return clamp((1 - dot) * 0.68 * directness, 0, 0.85);
  }

  function getMotionFilteredPoint(point, state, settings, input = {}) {
    const profile = getInputProfile(input);
    const amount = clamp01(settings?.motionFilteringAmount) * profile.motionScale;

    if (amount <= 0 || !state?.inputPoints || state.inputPoints.length < 4) {
      return point;
    }

    const expression = clamp01(settings?.motionFilteringExpression);
    const tipAttachment = getTipAttachmentFactor(state, profile);
    const windowSize = Math.min(state.inputPoints.length, 4 + Math.round(amount * 20));
    const points = state.inputPoints.slice(-windowSize);
    const lastIndex = points.length - 1;
    const meanIndex = lastIndex * 0.5;
    const mean = points.reduce(
      (result, nextPoint) => ({
        x: result.x + nextPoint.x / points.length,
        y: result.y + nextPoint.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    const trend = points.reduce(
      (result, nextPoint, index) => {
        const indexOffset = index - meanIndex;

        result.denominator += indexOffset * indexOffset;
        result.x += indexOffset * (nextPoint.x - mean.x);
        result.y += indexOffset * (nextPoint.y - mean.y);
        return result;
      },
      { denominator: 0, x: 0, y: 0 },
    );

    if (trend.denominator <= 0) {
      return point;
    }

    const slopeX = trend.x / trend.denominator;
    const slopeY = trend.y / trend.denominator;
    const slopeLength = Math.hypot(slopeX, slopeY);

    if (slopeLength <= 0.0001) {
      return point;
    }

    const tangent = {
      x: slopeX / slopeLength,
      y: slopeY / slopeLength,
    };
    const normal = {
      x: -tangent.y,
      y: tangent.x,
    };
    const linePointAt = (index) => ({
      x: mean.x + slopeX * (index - meanIndex),
      y: mean.y + slopeY * (index - meanIndex),
    });
    const projected = {
      x: mean.x + slopeX * (lastIndex - meanIndex),
      y: mean.y + slopeY * (lastIndex - meanIndex),
    };
    const lateralX = point.x - projected.x;
    const lateralY = point.y - projected.y;
    const lateralDistance = lateralX * normal.x + lateralY * normal.y;
    const deviationSamples = points
      .map((nextPoint, index) => {
        const linePoint = linePointAt(index);

        return Math.abs((nextPoint.x - linePoint.x) * normal.x + (nextPoint.y - linePoint.y) * normal.y);
      })
      .sort((a, b) => a - b);
    const medianDeviation = deviationSamples[Math.floor(deviationSamples.length * 0.5)] || 0;
    const cornerPreserve = getMotionCornerPreserve(points);
    const directness = getPathDirectness(points);
    const effectiveAmount = clamp01(
      amount *
      tipAttachment *
      (0.78 + directness * 0.22) *
      (1 - expression * 0.55) *
      (1 - cornerPreserve * 0.92),
    );
    const rawDeviation = Math.abs(lateralDistance);
    const expressiveBand = medianDeviation * (0.12 + expression * 0.9);
    const allowedDeviation = rawDeviation * (1 - effectiveAmount) + expressiveBand * effectiveAmount;
    const clippedDistance = Math.sign(lateralDistance) * Math.min(rawDeviation, allowedDeviation);
    const clipped = {
      x: projected.x + normal.x * clippedDistance,
      y: projected.y + normal.y * clippedDistance,
    };

    return {
      x: point.x + (clipped.x - point.x) * effectiveAmount,
      y: point.y + (clipped.y - point.y) * effectiveAmount,
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

  function processStrokeInput(point, state, settings, pressure = 1, input = {}) {
    if (!state) {
      return {
        point,
        pressure: normalizePressure(pressure),
      };
    }

    const profile = getInputProfile(input);
    pushInputPoint(point, state, input);

    const motionFilteredPoint = getMotionFilteredPoint(point, state, settings, input);
    const stabilizedPoint = getStabilizedPoint(motionFilteredPoint, state, settings, {
      ...input,
      rawPoint: point,
    });
    const streamLineAmount = clamp01(getStreamLineAmount(settings) * profile.streamLineScale);
    const nextPressure = getSmoothedPressure(pressure, state, settings);

    if (streamLineAmount <= 0) {
      state.smoothedPoint = { ...stabilizedPoint };
      return {
        point: stabilizedPoint,
        pressure: nextPressure,
        stabilizationGuide: state.stabilizationGuide
          ? {
              ...state.stabilizationGuide,
              inputPoint: { ...state.stabilizationGuide.inputPoint },
              outputPoint: { ...state.stabilizationGuide.outputPoint },
            }
          : null,
      };
    }

    const follow = clamp(1 - streamLineAmount * 0.88, 0.08, 1);

    state.smoothedPoint = {
      x: state.smoothedPoint.x + (stabilizedPoint.x - state.smoothedPoint.x) * follow,
      y: state.smoothedPoint.y + (stabilizedPoint.y - state.smoothedPoint.y) * follow,
    };

    if (state.stabilizationGuide) {
      state.stabilizationGuide.outputPoint = { ...state.smoothedPoint };
    }

    return {
      point: state.smoothedPoint,
      pressure: nextPressure,
      stabilizationGuide: state.stabilizationGuide
        ? {
            ...state.stabilizationGuide,
            inputPoint: { ...state.stabilizationGuide.inputPoint },
            outputPoint: { ...state.stabilizationGuide.outputPoint },
          }
        : null,
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
    const nextTip = Number(taperTip);
    const safeTip = Number.isFinite(nextTip) ? clamp(nextTip, 0.15, 1) : 0.5;
    const exponent = 0.35 + safeTip * 2.4;
    return Math.pow(clamp01(t), exponent);
  }

  function getTaperFactor(distanceFromStart, totalLength, settings) {
    const taperStart = clamp01(settings?.taperStart);
    const taperEnd = clamp01(settings?.taperEnd);
    const rawMinDistance = Number(settings?.taperMinDistance);
    const taperMinDistance = settings?.taperMinDistanceEnabled === true
      ? Math.max(0, Number.isFinite(rawMinDistance) ? rawMinDistance : 247)
      : 247;

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
    getStabilizationRopeLength,
    getMotionFilteredPoint,
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
