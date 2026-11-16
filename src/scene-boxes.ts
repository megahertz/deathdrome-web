import type { Vec3 } from './game-types.ts';
import { prepareFacet, intersectFacet } from './scene-facets.ts';
const f = Math.fround,
  axes = ['x', 'y', 'z'] as const;
// 44bbe0 stores four lower corners then four upper corners in this order.
export function boxCorners(min: number[], max: number[]) {
  return [
    [0, 0, 1],
    [1, 0, 1],
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ].map((p) => p.map((v, i) => f((v ? max : min)[i])));
}
export function prepareBox(corners: number[][]) {
  const vertices = corners.map((v: number[]) =>
    v.map((itemValue) => f(itemValue)),
  );
  return {
    vertices,
    min: axes.map((_, i) => Math.min(...vertices.map((p: any[]) => p[i]))),
    max: axes.map((_, i) => Math.max(...vertices.map((p: any[]) => p[i]))),
    facets: [
      [0, 4, 7, 3],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [0, 3, 2, 1],
      [4, 5, 6, 7],
    ].map((indices) =>
      prepareFacet(
        indices.map((i) => vertices[i]),
        false,
      ),
    ),
  };
}
// 445adc rejects touching axis intervals, then 46b8d0 returns the first
// accepted outward face. An exit from inside the box is not an entry hit.
export function intersectBox(
  box: { vertices?: any; min: any; max: any; facets: any },
  from: Vec3,
  to: Vec3,
) {
  const a = axes.map((k) => f(from[k])),
    b = axes.map((k) => f(to[k]));
  if (
    a.some(
      (v, i) =>
        Math.max(v, b[i]) <= box.min[i] || Math.min(v, b[i]) >= box.max[i],
    )
  ) {
    return null;
  }
  for (const facet of box.facets) {
    const hit = intersectFacet(facet, from, to);
    if (hit) {
      return hit;
    }
  }
  return null;
}
