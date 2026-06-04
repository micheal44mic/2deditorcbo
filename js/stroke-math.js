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

  function getRopeStabilizationAmount(settings) {
    return clamp01(settings?.ropeStabilizationAmount);
  }

  function getStrokeSmoothingAmount(settings) {
    return clamp01(settings?.strokeSmoothingAmount);
  }

  const SMOOTHING_POINTER_PROFILES = Object.freeze({
    mouse: Object.freeze({
      cornerDamping: 0.42,
      cornerFollowBoost: 0.16,
      followBase: 0.92,
      followMin: 0.42,
      followRange: 0.34,
      followMax: 0.94,
      maxLagBase: 18,
      maxLagBrushScale: 1.35,
      recencyPower: 0.82,
      speedBrushScale: 0.95,
      speedOffset: 24,
      speedStrengthFloor: 0.7,
      speedFollowBoost: 0.16,
      startStrength: 0.42,
      strengthScale: 1.34,
      targetBlend: 0.98,
      trendBlend: 0.78,
      windowBase: 4,
      windowRange: 14,
      warmupSamples: 2,
    }),
    touch: Object.freeze({
      cornerDamping: 0.55,
      cornerFollowBoost: 0.2,
      followBase: 0.9,
      followMin: 0.4,
      followRange: 0.42,
      followMax: 0.96,
      maxLagBase: 18,
      maxLagBrushScale: 1.25,
      recencyPower: 0.82,
      speedBrushScale: 1.1,
      speedOffset: 20,
      speedStrengthFloor: 0.64,
      speedFollowBoost: 0.14,
      startStrength: 0.38,
      strengthScale: 1.18,
      targetBlend: 0.92,
      trendBlend: 0.72,
      windowBase: 4,
      windowRange: 12,
      warmupSamples: 3,
    }),
    pen: Object.freeze({
      cornerDamping: 0.68,
      cornerFollowBoost: 0.24,
      followBase: 0.94,
      followMin: 0.52,
      followRange: 0.32,
      followMax: 0.98,
      maxLagBase: 14,
      maxLagBrushScale: 0.95,
      recencyPower: 1.02,
      speedBrushScale: 0.78,
      speedOffset: 14,
      speedStrengthFloor: 0.58,
      speedFollowBoost: 0.18,
      startStrength: 0.34,
      strengthScale: 0.98,
      targetBlend: 0.82,
      trendBlend: 0.82,
      windowBase: 3,
      windowRange: 9,
      warmupSamples: 4,
    }),
    fallback: Object.freeze({
      cornerDamping: 0.52,
      cornerFollowBoost: 0.18,
      followBase: 0.88,
      followMin: 0.36,
      followRange: 0.46,
      followMax: 0.95,
      maxLagBase: 20,
      maxLagBrushScale: 1.35,
      recencyPower: 0.86,
      speedBrushScale: 1,
      speedOffset: 20,
      speedStrengthFloor: 0.64,
      speedFollowBoost: 0.12,
      startStrength: 0.38,
      strengthScale: 1.14,
      targetBlend: 0.9,
      trendBlend: 0.74,
      windowBase: 4,
      windowRange: 11,
      warmupSamples: 3,
    }),
  });

  function normalizePointerType(input = {}) {
    return String(input?.pointerType || "").toLowerCase();
  }

  function getSmoothingPointerProfile(input = {}) {
    const pointerType = normalizePointerType(input);

    return SMOOTHING_POINTER_PROFILES[pointerType] || SMOOTHING_POINTER_PROFILES.fallback;
  }

  function getRopeStabilizationLength(settings, input, amount = getRopeStabilizationAmount(settings)) {
    const brushSize = getBrushSize(settings);
    const zoom = Math.max(0.0001, Number(input?.cameraZoom) || 1);
    const dpr = Math.max(0.0001, Number(input?.dpr) || 1);
    const maxCssLength = clamp(brushSize * 2.25 + 22, 18, 112);
    const ropeCssLength = 1 + Math.pow(clamp01(amount), 1.18) * maxCssLength;

    return ropeCssLength * dpr / zoom;
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
      lastStampPoint: { ...point },
      pressure: normalizePressure(options.pressure),
      ropePoint: { ...point },
      smoothingPoint: { ...point },
      smoothingSamples: [createTimedPoint(point, options)],
      seed: (seed || 1) >>> 0,
      stabilizedPoint: { ...point },
      tool: options.tool || "",
    };
  }

  function createTimedPoint(point, input = {}) {
    const time = Number(input?.time);

    return {
      x: point.x,
      y: point.y,
      time: Number.isFinite(time) ? time : null,
    };
  }

  function distanceBetween(a, b) {
    if (!a || !b) {
      return 0;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pushSmoothingSample(point, state, input) {
    if (!Array.isArray(state.smoothingSamples)) {
      state.smoothingSamples = [];
    }

    state.smoothingSamples.push(createTimedPoint(point, input));

    if (state.smoothingSamples.length > 18) {
      state.smoothingSamples.shift();
    }
  }

  function getSmoothingSpeedFactor(samples, settings, profile) {
    if (!Array.isArray(samples) || samples.length < 2) {
      return 0;
    }

    const point = samples[samples.length - 1];
    const previousPoint = samples[samples.length - 2];
    const distance = distanceBetween(point, previousPoint);
    const time = Number(point.time);
    const previousTime = Number(previousPoint.time);
    const brushScale = getBrushSize(settings) * (profile?.speedBrushScale || 1) +
      (profile?.speedOffset || 18);
    const frameDistance = Number.isFinite(time) && Number.isFinite(previousTime) && time > previousTime
      ? distance * (16.667 / Math.max(1, time - previousTime))
      : distance;

    return clamp(frameDistance / brushScale, 0, 1);
  }

  function getSmoothingCornerFactor(samples) {
    if (!Array.isArray(samples) || samples.length < 3) {
      return 0;
    }

    const a = samples[samples.length - 3];
    const b = samples[samples.length - 2];
    const c = samples[samples.length - 1];
    const firstX = b.x - a.x;
    const firstY = b.y - a.y;
    const secondX = c.x - b.x;
    const secondY = c.y - b.y;
    const firstLength = Math.hypot(firstX, firstY);
    const secondLength = Math.hypot(secondX, secondY);

    if (firstLength <= 0.5 || secondLength <= 0.5) {
      return 0;
    }

    const dot = clamp((firstX * secondX + firstY * secondY) / (firstLength * secondLength), -1, 1);

    return clamp((1 - dot) * 0.5, 0, 1);
  }

  function getSmoothingWeight(index, lastIndex, recencyPower) {
    if (lastIndex <= 0) {
      return 1;
    }

    const recency = (index + 1) / (lastIndex + 1);

    return Math.max(0.04, Math.pow(recency, Math.max(0.2, recencyPower)));
  }

  function getWeightedSmoothingAverage(samples, windowSize, recencyPower) {
    const recentSamples = samples.slice(-windowSize);
    const lastIndex = recentSamples.length - 1;
    let weightTotal = 0;
    let x = 0;
    let y = 0;

    recentSamples.forEach((sample, index) => {
      const weight = getSmoothingWeight(index, lastIndex, recencyPower);

      weightTotal += weight;
      x += sample.x * weight;
      y += sample.y * weight;
    });

    return weightTotal > 0
      ? { x: x / weightTotal, y: y / weightTotal }
      : recentSamples[lastIndex];
  }

  function getWeightedSmoothingTrend(samples, windowSize, recencyPower) {
    const recentSamples = samples.slice(-windowSize);
    const lastIndex = recentSamples.length - 1;

    if (lastIndex <= 0) {
      return recentSamples[lastIndex];
    }

    let weightTotal = 0;
    let indexMean = 0;
    let xMean = 0;
    let yMean = 0;

    recentSamples.forEach((sample, index) => {
      const weight = getSmoothingWeight(index, lastIndex, recencyPower);

      weightTotal += weight;
      indexMean += index * weight;
      xMean += sample.x * weight;
      yMean += sample.y * weight;
    });

    if (weightTotal <= 0) {
      return recentSamples[lastIndex];
    }

    indexMean /= weightTotal;
    xMean /= weightTotal;
    yMean /= weightTotal;

    let denominator = 0;
    let xNumerator = 0;
    let yNumerator = 0;

    recentSamples.forEach((sample, index) => {
      const weight = getSmoothingWeight(index, lastIndex, recencyPower);
      const indexOffset = index - indexMean;

      denominator += weight * indexOffset * indexOffset;
      xNumerator += weight * indexOffset * (sample.x - xMean);
      yNumerator += weight * indexOffset * (sample.y - yMean);
    });

    if (denominator <= 0) {
      return recentSamples[lastIndex];
    }

    const predictOffset = lastIndex - indexMean;

    return {
      x: xMean + (xNumerator / denominator) * predictOffset,
      y: yMean + (yNumerator / denominator) * predictOffset,
    };
  }

  function mixPoints(from, to, amount) {
    const t = clamp01(amount);

    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  function getSmoothingWarmupFactor(samples, profile) {
    const processedSamples = Math.max(0, (samples?.length || 1) - 1);
    const warmupSamples = Math.max(1, Number(profile?.warmupSamples) || 1);

    return clamp(
      processedSamples / warmupSamples,
      profile?.startStrength ?? 0.35,
      1,
    );
  }

  function getSmoothingWindowSize(samples, amount, strength, profile) {
    const windowBase = Math.max(2, Math.round(Number(profile?.windowBase) || 3));
    const windowRange = Math.max(0, Math.round(Number(profile?.windowRange) || 8));
    const windowSize = windowBase + Math.round(windowRange * clamp01(amount) * clamp01(strength));

    return Math.min(samples.length, Math.max(2, windowSize));
  }

  function getSmoothingMaxLag(settings, amount, profile) {
    const brushSize = getBrushSize(settings);
    const base = Math.max(0, Number(profile?.maxLagBase) || 0);
    const brushScale = Math.max(0, Number(profile?.maxLagBrushScale) || 0);

    return (base + brushSize * brushScale) * (0.45 + clamp01(amount) * 0.55);
  }

  function getSmoothedStrokePoint(point, state, settings, input = {}) {
    const amount = getStrokeSmoothingAmount(settings);

    if (amount <= 0) {
      state.smoothingPoint = { ...point };
      state.smoothingSamples = [];
      return point;
    }

    pushSmoothingSample(point, state, input);

    if (state.smoothingSamples.length < 2) {
      state.smoothingPoint = { ...point };
      return point;
    }

    const profile = getSmoothingPointerProfile(input);
    const speedFactor = getSmoothingSpeedFactor(state.smoothingSamples, settings, profile);
    const cornerFactor = getSmoothingCornerFactor(state.smoothingSamples);
    const speedPreserve = (profile.speedStrengthFloor || 0.6) +
      (1 - speedFactor) * (1 - (profile.speedStrengthFloor || 0.6));
    const cornerPreserve = 1 - cornerFactor * (profile.cornerDamping || 0.5) * amount;
    const warmup = getSmoothingWarmupFactor(state.smoothingSamples, profile);
    const strength = clamp01(
      amount *
      (profile.strengthScale || 1) *
      speedPreserve *
      cornerPreserve *
      warmup,
    );
    const windowSize = getSmoothingWindowSize(state.smoothingSamples, amount, strength, profile);
    const recencyPower = (profile.recencyPower || 0.85) + (1 - strength) * 0.8;
    const average = getWeightedSmoothingAverage(state.smoothingSamples, windowSize, recencyPower);
    const trend = getWeightedSmoothingTrend(state.smoothingSamples, windowSize, recencyPower);
    const denoisedPoint = mixPoints(average, trend, profile.trendBlend ?? 0.75);
    const target = mixPoints(point, denoisedPoint, strength * (profile.targetBlend || 0.9));
    const previous = state.smoothingPoint || point;
    const follow = clamp(
      (profile.followBase || 0.88) -
        strength * (profile.followRange || 0.44) +
        speedFactor * (profile.speedFollowBoost || 0.12) +
        cornerFactor * (profile.cornerFollowBoost || 0.18),
      profile.followMin || 0.36,
      profile.followMax || 0.96,
    );
    let nextPoint = {
      x: previous.x + (target.x - previous.x) * follow,
      y: previous.y + (target.y - previous.y) * follow,
    };
    const lag = distanceBetween(point, nextPoint);
    const maxLag = getSmoothingMaxLag(settings, amount, profile);

    if (lag > maxLag) {
      nextPoint = {
        x: point.x + (nextPoint.x - point.x) * (maxLag / lag),
        y: point.y + (nextPoint.y - point.y) * (maxLag / lag),
      };
    }

    state.smoothingPoint = nextPoint;

    return nextPoint;
  }

  function getRopeStabilizedPoint(point, state, settings, input = {}) {
    const amount = getRopeStabilizationAmount(settings);

    if (amount <= 0) {
      state.ropePoint = { ...point };
      state.stabilizedPoint = { ...point };
      return {
        guide: null,
        point,
      };
    }

    const ropePoint = state.ropePoint || state.stabilizedPoint || point;
    const stabilizedPoint = state.stabilizedPoint || ropePoint;
    const ropeLength = getRopeStabilizationLength(settings, input, amount);
    const deltaX = point.x - ropePoint.x;
    const deltaY = point.y - ropePoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    const taut = distance > ropeLength;
    const pulledPoint = taut
      ? {
          x: point.x - (deltaX / distance) * ropeLength,
          y: point.y - (deltaY / distance) * ropeLength,
        }
      : ropePoint;
    const follow = clamp(0.62 - amount * 0.44, 0.18, 0.62);
    const outputPoint = taut
      ? {
          x: stabilizedPoint.x + (pulledPoint.x - stabilizedPoint.x) * follow,
          y: stabilizedPoint.y + (pulledPoint.y - stabilizedPoint.y) * follow,
        }
      : stabilizedPoint;
    const inputPoint = input?.rawPoint ? clonePoint(input.rawPoint) : clonePoint(point);

    state.ropePoint = { ...pulledPoint };
    state.stabilizedPoint = { ...outputPoint };

    return {
      guide: {
        active: true,
        distance,
        inputPoint,
        outputPoint: clonePoint(outputPoint),
        ropeLength,
        taut,
      },
      point: outputPoint,
    };
  }

  function processStrokeInput(point, state, settings, pressure = 1, input = {}) {
    const nextPressure = normalizePressure(pressure);

    if (!state) {
      return {
        point,
        pressure: nextPressure,
      };
    }

    state.pressure = nextPressure;
    const stabilized = getRopeStabilizedPoint(point, state, settings, input);
    const smoothedPoint = getSmoothedStrokePoint(stabilized.point, state, settings, input);
    const guide = stabilized.guide
      ? {
          ...stabilized.guide,
          outputPoint: clonePoint(smoothedPoint),
        }
      : null;
    const result = {
      point: smoothedPoint,
      pressure: nextPressure,
    };

    if (guide) {
      result.stabilizationGuide = guide;
    }

    return result;
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
    getRopeStabilizationAmount,
    getRopeStabilizationLength,
    getStrokeSmoothingAmount,
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
