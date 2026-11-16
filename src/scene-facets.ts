import type { Vec3 } from './game-types.ts';
import { mapVec3 } from './vector.ts';
const f = Math.fround,
  axes = ['x', 'y', 'z'] as const;
export function facetNormal(vertices: number[][] | [any, any, any]) {
  const [a, b, c] = vertices,
    u = a.map((x: number, i: number) => f(x - b[i])),
    v = c.map((x: number, i: number) => f(x - b[i]));
  // 458551 stores A.x-B.x without popping it. The Y cross-product keeps that
  // extended difference; the Z product reloads its rounded float store.
  const n = [
    f(v[1] * u[2] - v[2] * u[1]),
    f(v[2] * (a[0] - b[0]) - v[0] * u[2]),
    f(v[0] * u[1] - v[1] * u[0]),
  ];
  const length = f(Math.sqrt(n[1] * n[1] + n[0] * n[0] + n[2] * n[2])),
    inverse = length ? f(1 / length) : 0;
  return mapVec3((_key, i) => f(n[i] * inverse));
}
export function prepareFacet(vertices: number[][], twoSided = false) {
  const v = vertices.map((p: number[]) => p.slice(0, 3).map(f));
  return {
    vertices: v,
    normal: facetNormal(v),
    twoSided,
    min: axes.map((_, i) => Math.min(...v.map((p: any[]) => p[i]))),
    max: axes.map((_, i) => Math.max(...v.map((p: any[]) => p[i]))),
  };
}
// 46bb8c tests one projected convex polygon, not its display fan triangles.
// Edge arithmetic retains float differences and the original -0.0001 band.
function inside(
  facet: ReturnType<typeof prepareFacet>,
  point: Vec3,
  axis: number,
  fixedSign: number | null = null,
) {
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3,
    sign = fixedSign ?? (facet.normal[axes[axis]] > 0 ? 1 : -1),
    p = axes.map((k) => point[k]);
  for (let i = 0; i < facet.vertices.length; i++) {
    const a = facet.vertices[i],
      b = facet.vertices[(i + 1) % facet.vertices.length],
      du = f(sign * (b[u] - a[u])),
      dv = f(sign * (a[v] - b[v]));
    if ((p[v] - a[v]) * du + (p[u] - a[u]) * dv <= -0.0001) {
      return false;
    }
  }
  return true;
}
export function intersectFacet(
  facet: ReturnType<typeof prepareFacet>,
  from: Vec3,
  to: Vec3,
) {
  const a = axes.map((k) => f(from[k])),
    b = axes.map((k) => f(to[k])),
    p = facet.vertices[0],
    n = facet.normal;
  const distance = (q: number[]) => {
    const d = q.map((x: number, i: number) => f(x - p[i]));
    return f(d[1] * n.y + d[0] * n.x + d[2] * n.z);
  };
  let start = distance(a),
    end = distance(b);
  if (
    (!facet.twoSided && end >= 0) ||
    (start >= 0 && end >= 0) ||
    (start < 0 && end < 0)
  ) {
    return null;
  }
  start = Math.abs(start);
  end = Math.abs(end);
  const t = start / (start + end);
  const point = mapVec3((_key, i) => f(a[i] + (b[i] - a[i]) * t));
  let axis = 0,
    largest = Math.abs(n.x);
  if (Math.abs(n.y) >= largest) {
    axis = 1;
    largest = Math.abs(n.y);
  }
  if (Math.abs(n.z) >= largest) {
    axis = 2;
  }
  return inside(facet, point, axis) ? { normal: { ...n }, point } : null;
}
// 46b688 tests X/Z winding directly, independent of draw sides. Its tolerance
// also accepts vertical footprints exactly on the edge and very small faces.
export function altitudeFacet(
  facet: ReturnType<typeof prepareFacet>,
  x: number,
  z: number,
) {
  const n = facet.normal,
    point = { x: f(x), y: 0, z: f(z) };
  if (!inside(facet, point, 1, 1)) {
    return null;
  }
  const p = facet.vertices[0];
  return {
    height: n.y
      ? f(
          p[1] -
            (n.x / n.y) * (point.x - p[0]) -
            (n.z / n.y) * (point.z - p[2]),
        )
      : p[1],
    normal: { ...n },
  };
}
