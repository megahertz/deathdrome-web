// Original camera-space point transforms and polygon-facing decision.
const f = Math.fround;
export function transformNativePoints(
  vertices: number[][],
  matrix: number[],
  { identity = false } = {},
) {
  const m = matrix.map(f);
  return vertices.map((vertex: number[]) => {
    const p = vertex.map(f);
    if (identity) {
      return p.slice(0, 3);
    }
    return [0, 1, 2].map((k) =>
      f(p[0] * m[k] + p[1] * m[3 + k] + p[2] * m[6 + k] + m[9 + k]),
    );
  });
}
export function nativePolygonFacing(vertices: number[][], twoSided = false) {
  // 4585e8 uses the first three vertices after near clipping. The Y component
  // remains in an x87 register for its dot product; X and Z are reloaded floats.
  // The first X/Z cross products also retain the unrounded C-minus-B term.
  const [a, b, c] = vertices
    .slice(0, 3)
    .map((p: number[]) => p.slice(0, 3).map(f));
  const u = a.map((x: number, i: number) => f(x - b[i])),
    v = c.map((x: number, i: number) => f(x - b[i]));
  const y = v[2] * u[0] - v[0] * u[2];
  let normal = [
    f((c[1] - b[1]) * u[2] - v[2] * u[1]),
    f(y),
    f((c[0] - b[0]) * u[1] - v[1] * u[0]),
  ];
  const dot = y * a[1] + normal[0] * a[0] + normal[2] * a[2];
  if (dot < -0.005) {
    return { visible: true, front: true, normal };
  }
  if (twoSided && dot > 0.005) {
    normal = normal.map((x) => -x);
    return { visible: true, front: false, normal };
  }
  return { visible: false, front: null, normal };
}
