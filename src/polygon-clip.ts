import { nativePolygonFacing } from './native-geometry.ts';
// Original camera/screen polygon clipping (46e928 / 46f1a8).
// Vertices start with XYZ. Append only enabled per-vertex attribute channels;
// every appended channel is interpolated with the same stored float factor.
const f = Math.fround;
function clipPlane(
  vertices: number[][],
  axis: number,
  limit: number,
  upper = false,
) {
  if (vertices.length === 0) {
    return [];
  }
  const result = [];
  let previous = vertices.at(-1)!;
  const inside = (p: number[]) => (upper ? p[axis] < limit : p[axis] >= limit);
  let previousInside = inside(previous);
  for (const current of vertices) {
    const currentInside = inside(current);
    if (previousInside !== currentInside) {
      const factor = f(
        (limit - previous[axis]) / (current[axis] - previous[axis]),
      );
      const previousPoint = previous;
      const point = current.map((value: number, i: number) =>
        i === axis
          ? limit
          : f((value - previousPoint[i]) * factor + previousPoint[i]),
      );
      result.push(point);
    }
    if (currentInside) {
      result.push([...current]);
    }
    previous = current;
    previousInside = currentInside;
  }
  return result;
}
export function clipCameraPolygon(
  vertices: number[][],
  { near: inputNear = 0.75, far: inputFar = 1200, flags = 16 } = {},
) {
  let near = inputNear,
    far = inputFar;
  let points = vertices.map((p: number[]) =>
    p.map((itemValue) => f(itemValue)),
  );
  near = f(near);
  far = f(far);
  if (flags & 16) {
    // The far test is a polygon rejection, not a second clipping plane.
    if (points.every((p: number[]) => p[2] >= far)) {
      return [];
    }
    if (points.some((p: number[]) => p[2] < near)) {
      points = clipPlane(points, 2, near);
    }
  }
  return points.length >= 3 ? points : [];
}
export function clipScreenPolygon(
  vertices: number[][],
  { bounds = [0, 0, 320, 200], flags = 15 } = {},
) {
  let points = vertices.map((p: number[]) =>
    p.map((itemValue) => f(itemValue)),
  );
  const [left, top, right, bottom] = bounds.map((itemValue) => f(itemValue));
  // Screen clipping uses right/bottom minus one and strict upper predicates.
  for (const [bit, axis, limit, upper] of [
    [1, 0, left, false],
    [2, 0, f(right - 1), true],
    [4, 1, top, false],
    [8, 1, f(bottom - 1), true],
  ] as const) {
    if (flags & bit) {
      points = clipPlane(points, axis, limit, upper);
    }
  }
  return points.length >= 3 ? points : [];
}
export function projectTexturePolygon(
  vertices: number[][],
  { scale = [1, 1], center = [0, 0], offset = [0, 0] } = {},
) {
  const s = scale.map((itemValue) => f(itemValue)),
    c = center.map((itemValue) => f(itemValue)),
    o = offset.map((itemValue) => f(itemValue));
  return vertices.map((vertex: number[]) => {
    const p = vertex.map((itemValue) => f(itemValue)),
      q = p[2] === 0 ? 1 : f(1 / p[2]);
    const result = [...p];
    result[0] = f(p[0] * q * s[0] + c[0] + o[0]);
    result[1] = f(p[1] * q * s[1] + c[1] + o[1]);
    result[2] = q;
    // 454695 weights U/V before window clipping; never unweight/reweight them.
    if (p.length >= 5) {
      result[3] = f(p[3] * q);
      result[4] = f(p[4] * q);
    }
    return result;
  });
}
export function prepareProjectedTexturePolygon(
  vertices: number[][],
  options: {
    cameraFlags?: number;
    cullBackfaces?: boolean;
    twoSided?: boolean;
    near?: number;
    far?: number;
    flags?: number;
    bounds?: number[];
    scale?: number[];
    center?: number[];
    offset?: number[];
  } = {},
) {
  const camera = clipCameraPolygon(vertices, {
    ...options,
    flags: options.cameraFlags ?? 16,
  });
  if (
    camera.length === 0 ||
    (options.cullBackfaces &&
      !nativePolygonFacing(camera, options.twoSided).visible)
  ) {
    return [];
  }
  return clipScreenPolygon(projectTexturePolygon(camera, options), options);
}
