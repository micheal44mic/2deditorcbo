(function registerCurvesEngine(namespace) {
  const CHANNELS = Object.freeze(["rgb", "r", "g", "b"]);
  const MAX_CURVE_POINTS = 19;
  const COMPOSITE_ORDER = "channelThenMaster";

  function clamp(value, min, max) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  }

  function clampByte(value) {
    return Math.round(clamp(value, 0, 255));
  }

  function sign(value) {
    return value > 0 ? 1 : value < 0 ? -1 : 0;
  }

  function createId(prefix = "curve-point") {
    const randomId = globalThis.crypto?.randomUUID?.();

    if (randomId) {
      return `${prefix}-${randomId}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function clonePoint(point) {
    return {
      id: String(point?.id || createId()),
      x: clampByte(point?.x),
      y: clampByte(point?.y),
      endpoint: point?.endpoint === true,
    };
  }

  function identityPoints() {
    return [
      { id: "black", x: 0, y: 0, endpoint: true },
      { id: "white", x: 255, y: 255, endpoint: true },
    ];
  }

  function normalizePoints(points) {
    const source = Array.isArray(points) && points.length >= 2
      ? points
      : identityPoints();
    const sorted = source
      .filter(Boolean)
      .map((point) => clonePoint(point))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const unique = [];

    for (const point of sorted) {
      const last = unique[unique.length - 1];

      if (!last || last.x !== point.x) {
        unique.push(point);
      }
    }

    if (unique.length < 2) {
      return identityPoints();
    }

    return unique.slice(0, MAX_CURVE_POINTS).map((point, index, list) => ({
      ...point,
      endpoint: index === 0 || index === list.length - 1,
      id: index === 0 && !point.id
        ? "black"
        : (index === list.length - 1 && !point.id ? "white" : point.id),
    }));
  }

  function normalizePointsByChannel(pointsByChannel = {}) {
    return Object.fromEntries(
      CHANNELS.map((channel) => [
        channel,
        normalizePoints(pointsByChannel?.[channel]),
      ]),
    );
  }

  function createDefaultPointsByChannel() {
    return normalizePointsByChannel();
  }

  function addPoint(points, x, y) {
    const current = normalizePoints(points);
    const px = clampByte(x);
    const py = clampByte(y);
    const existing = current.find((point) => point.x === px);

    if (existing) {
      return {
        points: current,
        selectedId: existing.id,
      };
    }

    if (current.length >= MAX_CURVE_POINTS) {
      const nearest = current.reduce((best, point) =>
        Math.abs(point.x - px) < Math.abs(best.x - px) ? point : best,
      current[0]);

      return {
        points: current,
        selectedId: nearest.id,
      };
    }

    const id = createId("curve");

    return {
      points: normalizePoints([...current, { id, x: px, y: py }]),
      selectedId: id,
    };
  }

  function movePoint(points, id, x, y, options = {}) {
    const next = normalizePoints(points);
    const index = next.findIndex((point) => point.id === id);

    if (index < 0) {
      return next;
    }

    const point = next[index];
    const previous = next[index - 1];
    const following = next[index + 1];
    const minX = previous ? previous.x + 1 : 0;
    const maxX = following ? following.x - 1 : 255;
    const nx = options.lockEndpointX === true && point.endpoint
      ? point.x
      : clampByte(clamp(x, minX, maxX));
    const ny = clampByte(y);

    next[index] = {
      ...point,
      x: nx,
      y: ny,
    };

    return normalizePoints(next);
  }

  function deletePoint(points, id) {
    const current = normalizePoints(points);
    const point = current.find((candidate) => candidate.id === id);

    if (!point || point.endpoint) {
      return current;
    }

    return normalizePoints(current.filter((candidate) => candidate.id !== id));
  }

  function areIdentityPoints(points) {
    const current = normalizePoints(points);

    return current.length === 2 &&
      current[0].x === 0 &&
      current[0].y === 0 &&
      current[1].x === 255 &&
      current[1].y === 255;
  }

  function hasMeaningfulCurves(pointsByChannel = {}) {
    const normalized = normalizePointsByChannel(pointsByChannel);

    return CHANNELS.some((channel) => !areIdentityPoints(normalized[channel]));
  }

  function endpointSlope(h0, h1, d0, d1) {
    let slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);

    if (sign(slope) !== sign(d0)) {
      return 0;
    }

    if (sign(d0) !== sign(d1) && Math.abs(slope) > Math.abs(3 * d0)) {
      return 3 * d0;
    }

    return slope;
  }

  function pchipSlopes(xs, ys) {
    const count = xs.length;
    const h = [];
    const d = [];

    for (let index = 0; index < count - 1; index += 1) {
      h[index] = xs[index + 1] - xs[index];
      d[index] = (ys[index + 1] - ys[index]) / h[index];
    }

    if (count === 2) {
      return [d[0], d[0]];
    }

    const slopes = new Array(count).fill(0);

    slopes[0] = endpointSlope(h[0], h[1], d[0], d[1]);

    for (let index = 1; index < count - 1; index += 1) {
      const previous = d[index - 1];
      const current = d[index];

      if (previous === 0 || current === 0 || sign(previous) !== sign(current)) {
        slopes[index] = 0;
      } else {
        const w1 = 2 * h[index] + h[index - 1];
        const w2 = h[index] + 2 * h[index - 1];

        slopes[index] = (w1 + w2) / (w1 / previous + w2 / current);
      }
    }

    slopes[count - 1] = endpointSlope(
      h[count - 2],
      h[count - 3],
      d[count - 2],
      d[count - 3],
    );

    return slopes;
  }

  function buildLut(points) {
    const normalized = normalizePoints(points);
    const xs = normalized.map((point) => point.x);
    const ys = normalized.map((point) => point.y);
    const slopes = pchipSlopes(xs, ys);
    const lut = new Uint8Array(256);
    let segment = 0;

    for (let x = 0; x < 256; x += 1) {
      let y;

      if (x <= xs[0]) {
        y = ys[0];
      } else if (x >= xs[xs.length - 1]) {
        y = ys[ys.length - 1];
      } else {
        while (segment < xs.length - 2 && x > xs[segment + 1]) {
          segment += 1;
        }

        const x0 = xs[segment];
        const x1 = xs[segment + 1];
        const y0 = ys[segment];
        const y1 = ys[segment + 1];
        const m0 = slopes[segment];
        const m1 = slopes[segment + 1];
        const h = x1 - x0;
        const t = (x - x0) / h;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        y = h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
      }

      lut[x] = clampByte(y);
    }

    return lut;
  }

  function composeLut(master, channel, order = COMPOSITE_ORDER) {
    const output = new Uint8Array(256);

    for (let index = 0; index < 256; index += 1) {
      output[index] = order === "masterThenChannel"
        ? channel[master[index]]
        : master[channel[index]];
    }

    return output;
  }

  function buildChannelLuts(pointsByChannel = {}) {
    const normalized = normalizePointsByChannel(pointsByChannel);

    return Object.fromEntries(
      CHANNELS.map((channel) => [channel, buildLut(normalized[channel])]),
    );
  }

  function buildFinalLuts(pointsByChannel = {}, order = COMPOSITE_ORDER) {
    const luts = buildChannelLuts(pointsByChannel);

    return {
      r: composeLut(luts.rgb, luts.r, order),
      g: composeLut(luts.rgb, luts.g, order),
      b: composeLut(luts.rgb, luts.b, order),
    };
  }

  function buildPackedLut(pointsByChannel = {}, order = COMPOSITE_ORDER) {
    const finalLuts = buildFinalLuts(pointsByChannel, order);
    const data = new Uint8Array(256 * 4);

    for (let index = 0; index < 256; index += 1) {
      const offset = index * 4;

      data[offset] = finalLuts.r[index];
      data[offset + 1] = finalLuts.g[index];
      data[offset + 2] = finalLuts.b[index];
      data[offset + 3] = 255;
    }

    return data;
  }

  function normalizeEffect(effect = {}) {
    return {
      type: "curves",
      enabled: effect.enabled !== false,
      points: normalizePointsByChannel(effect.points || effect.curves),
    };
  }

  function buildSvgPath(points, width = 255, height = 255) {
    const lut = buildLut(points);
    const maxX = Math.max(1, width);
    const maxY = Math.max(1, height);

    return Array.from(lut, (value, index) => {
      const x = (index / 255) * maxX;
      const y = (1 - value / 255) * maxY;

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  namespace.CurvesEngine = Object.freeze({
    CHANNELS,
    MAX_CURVE_POINTS,
    addPoint,
    areIdentityPoints,
    buildChannelLuts,
    buildFinalLuts,
    buildLut,
    buildPackedLut,
    buildSvgPath,
    clamp,
    clampByte,
    composeLut,
    createDefaultPointsByChannel,
    deletePoint,
    hasMeaningfulCurves,
    identityPoints,
    movePoint,
    normalizeEffect,
    normalizePoints,
    normalizePointsByChannel,
  });
})(window.CBO = window.CBO || {});
