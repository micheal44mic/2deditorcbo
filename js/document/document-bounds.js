(function registerDocumentBounds(namespace) {
  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function hasFiniteBounds(bounds) {
    return Boolean(
      bounds &&
        Number.isFinite(bounds.x1) &&
        Number.isFinite(bounds.y1) &&
        Number.isFinite(bounds.x2) &&
        Number.isFinite(bounds.y2) &&
        bounds.x2 > bounds.x1 &&
        bounds.y2 > bounds.y1
    );
  }

  function cloneBounds(bounds) {
    if (!hasFiniteBounds(bounds)) {
      return null;
    }

    return {
      x1: bounds.x1,
      y1: bounds.y1,
      x2: bounds.x2,
      y2: bounds.y2,
    };
  }

  function expandBounds(bounds, amount = 0) {
    if (!hasFiniteBounds(bounds)) {
      return null;
    }

    const padding = Math.max(0, toFiniteNumber(amount, 0));

    return {
      x1: bounds.x1 - padding,
      y1: bounds.y1 - padding,
      x2: bounds.x2 + padding,
      y2: bounds.y2 + padding,
    };
  }

  function offsetBounds(bounds, dx = 0, dy = 0) {
    if (!hasFiniteBounds(bounds)) {
      return null;
    }

    return {
      x1: bounds.x1 + toFiniteNumber(dx, 0),
      y1: bounds.y1 + toFiniteNumber(dy, 0),
      x2: bounds.x2 + toFiniteNumber(dx, 0),
      y2: bounds.y2 + toFiniteNumber(dy, 0),
    };
  }

  function includeBounds(target, bounds) {
    if (!hasFiniteBounds(bounds)) {
      return cloneBounds(target);
    }

    if (!hasFiniteBounds(target)) {
      return cloneBounds(bounds);
    }

    return {
      x1: Math.min(target.x1, bounds.x1),
      y1: Math.min(target.y1, bounds.y1),
      x2: Math.max(target.x2, bounds.x2),
      y2: Math.max(target.y2, bounds.y2),
    };
  }

  function rectToBounds(rect) {
    if (
      !rect ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    return {
      x1: rect.x,
      y1: rect.y,
      x2: rect.x + rect.width,
      y2: rect.y + rect.height,
    };
  }

  function boundsToRect(bounds) {
    if (!hasFiniteBounds(bounds)) {
      return null;
    }

    return {
      x: bounds.x1,
      y: bounds.y1,
      width: bounds.x2 - bounds.x1,
      height: bounds.y2 - bounds.y1,
    };
  }

  function getMatrixValue(matrix, key, index, fallback) {
    if (Array.isArray(matrix)) {
      return toFiniteNumber(matrix[index], fallback);
    }

    return toFiniteNumber(matrix?.[key], fallback);
  }

  function transformPoint(point, matrix = null) {
    if (!point) {
      return { x: 0, y: 0 };
    }

    if (!matrix) {
      return {
        x: toFiniteNumber(point.x, 0),
        y: toFiniteNumber(point.y, 0),
      };
    }

    const a = getMatrixValue(matrix, "a", 0, 1);
    const b = getMatrixValue(matrix, "b", 1, 0);
    const c = getMatrixValue(matrix, "c", 2, 0);
    const d = getMatrixValue(matrix, "d", 3, 1);
    const e = getMatrixValue(matrix, "e", 4, 0);
    const f = getMatrixValue(matrix, "f", 5, 0);
    const x = toFiniteNumber(point.x, 0);
    const y = toFiniteNumber(point.y, 0);

    return {
      x: a * x + c * y + e,
      y: b * x + d * y + f,
    };
  }

  function transformBounds(bounds, matrix = null) {
    if (!hasFiniteBounds(bounds)) {
      return null;
    }

    if (!matrix) {
      return cloneBounds(bounds);
    }

    const points = [
      transformPoint({ x: bounds.x1, y: bounds.y1 }, matrix),
      transformPoint({ x: bounds.x2, y: bounds.y1 }, matrix),
      transformPoint({ x: bounds.x2, y: bounds.y2 }, matrix),
      transformPoint({ x: bounds.x1, y: bounds.y2 }, matrix),
    ];

    return points.reduce(
      (next, point) => ({
        x1: Math.min(next.x1, point.x),
        y1: Math.min(next.y1, point.y),
        x2: Math.max(next.x2, point.x),
        y2: Math.max(next.y2, point.y),
      }),
      { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
    );
  }

  function getClampedRasterBox(rectOrBounds, width, height) {
    const bounds = rectOrBounds?.width != null
      ? rectToBounds(rectOrBounds)
      : cloneBounds(rectOrBounds);

    if (!bounds || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    const x1 = Math.max(0, Math.min(width, Math.floor(bounds.x1)));
    const y1 = Math.max(0, Math.min(height, Math.floor(bounds.y1)));
    const x2 = Math.max(0, Math.min(width, Math.ceil(bounds.x2)));
    const y2 = Math.max(0, Math.min(height, Math.ceil(bounds.y2)));

    if (x2 <= x1 || y2 <= y1) {
      return null;
    }

    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  }

  function getUnionRect(firstRect, secondRect) {
    const unionBounds = includeBounds(rectToBounds(firstRect), rectToBounds(secondRect));

    return boundsToRect(unionBounds);
  }

  function quadToBounds(quad = []) {
    if (!Array.isArray(quad) || quad.length === 0) {
      return null;
    }

    const bounds = quad.reduce(
      (next, point) => ({
        x1: Math.min(next.x1, toFiniteNumber(point?.x, 0)),
        y1: Math.min(next.y1, toFiniteNumber(point?.y, 0)),
        x2: Math.max(next.x2, toFiniteNumber(point?.x, 0)),
        y2: Math.max(next.y2, toFiniteNumber(point?.y, 0)),
      }),
      { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
    );

    return hasFiniteBounds(bounds) ? bounds : null;
  }

  namespace.documentBounds = {
    boundsToRect,
    cloneBounds,
    expandBounds,
    getClampedRasterBox,
    getUnionRect,
    hasFiniteBounds,
    includeBounds,
    offsetBounds,
    quadToBounds,
    rectToBounds,
    transformBounds,
    transformPoint,
  };
})(window.CBO = window.CBO || {});
