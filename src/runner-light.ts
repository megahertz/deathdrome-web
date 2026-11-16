// The contour is read from the user's runner model, never bundled with code.
export const LIGHT_VERTEX_LIMIT = 24;
export function runnerLightContour(
  data: Pick<import('./model-types.ts').ModelData, 'meshes'>,
) {
  const faces = data.meshes.filter((f) => /\/lcl_lt\/lt\//i.test(f.name));
  if (faces.length !== 1) {
    throw new Error('Expected one original runner light polygon');
  }
  const vertices = faces[0].v.map((v) => [v[0], v[2]]);
  if (vertices.length !== LIGHT_VERTEX_LIMIT) {
    throw new Error('Unexpected runner light contour');
  }
  const centre = [0, 0];
  for (const v of vertices) {
    centre[0] += v[0] / vertices.length;
    centre[1] += v[1] / vertices.length;
  }
  const edges = vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    let nx = -dz / length,
      nz = dx / length,
      c = -nx * a[0] - nz * a[1];
    if (nx * centre[0] + nz * centre[1] + c < 0) {
      nx = -nx;
      nz = -nz;
      c = -c;
    }
    return [nx, nz, c];
  });
  return { vertices, edges };
}
export function lightLocalPoint(
  x: number,
  z: number,
  { x: originX = 0, z: originZ = 0, yaw = 0 } = {},
) {
  const dx = x - originX,
    dz = z - originZ,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [c * dx - s * dz, s * dx + c * dz];
}
export function insideRunnerLight(
  contour: { edges: number[][] },
  x: number,
  z: number,
  pose = {},
) {
  const p = lightLocalPoint(x, z, pose);
  return contour.edges.every(
    ([nx, nz, c]) => nx * p[0] + nz * p[1] + c >= -1e-7,
  );
}
export const LIGHT_MASK_GLSL = `
uniform vec3 runnerLightEdges[24];
float runnerLightMask(vec2 p){
 float inside=1.0;
 for(int i=0;i<24;i++)inside*=step(0.0,dot(runnerLightEdges[i],vec3(p,1.0)));
 return inside;
}
`;
