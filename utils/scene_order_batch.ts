import { pathToFileURL } from 'node:url';
// Feed supplied node trees to production material batching and scene queries.
// No native query results are used to construct this geometry or its order.
import { makeModel } from '../src/renderer.ts';
import { altitudeFacetHits, segmentFacetHits } from '../src/scene-geometry.ts';
export function queryOrderedScene(fixture: {
  groups: any[];
  queries: {
    kind: string;
    x: number;
    z: number;
    from: { [x: string]: number; x?: any; y?: any; z?: any };
    to: { [x: string]: number; x?: any; y?: any; z?: any };
  }[];
}) {
  const data: import('../src/model-types.ts').ModelData = {
    meshes: [],
    worldObjects: {},
    markers: [],
  };
  let rank = 0;
  function points(node: { vertices: any; children: any[] }): number[][] {
    return node.vertices ?? node.children.flatMap(points);
  }
  for (const [order, node] of fixture.groups.entries()) {
    const vertices = points(node);
    data.worldObjects![node.name] = {
      order,
      min: [0, 1, 2].map((i) => Math.min(...vertices.map((p: any[]) => p[i]))),
      max: [0, 1, 2].map((i) => Math.max(...vertices.map((p: any[]) => p[i]))),
    };
    const walk = (n: { children: any }, path: string): void => {
      const contactRank = rank++;
      for (const child of n.children) {
        if (child.op !== 583) {
          walk(child, path + '/' + child.name);
          continue;
        }
        const index = data.meshes.length;
        data.meshes.push({
          name: path + '/' + child.name,
          contactObject: path,
          contactRank,
          contactOrder: index,
          worldObject: node.name,
          v: child.vertices.map((v: any) => [...v, 0, 0]),
          drawType: child.drawType ?? 0,
          altitude: true,
          intersect: true,
          // Interleaved colours deliberately split a node tree across materials.
          color: [
            (index % 3) / 2,
            ((index + 1) % 3) / 2,
            ((index + 2) % 3) / 2,
          ] as [number, number, number],
        });
      }
    };
    walk(node, node.name);
  }
  const root = makeModel(data);
  root.updateMatrixWorld(true);
  try {
    return fixture.queries.map((q) => {
      const hits =
        q.kind === 'ground'
          ? altitudeFacetHits(root, q.x, q.z)
          : segmentFacetHits(
              root,
              q.from as unknown as import('../src/game-types.ts').Vec3,
              q.to as unknown as import('../src/game-types.ts').Vec3,
            );
      return hits.map((h) => ({
        node: h.name.split('/').slice(0, -1).join('/'),
        normal: h.normal,
        ...(q.kind === 'ground' ? { height: h.height } : { point: h.point }),
      }));
    });
  } finally {
    root.traverse((n: import('../src/model-types.ts').RenderNode) => {
      n.geometry?.dispose();
      n.material?.dispose();
    });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let input = '';
  for await (const b of process.stdin) {
    input += b;
  }
  process.stdout.write(
    JSON.stringify(JSON.parse(input).map(queryOrderedScene)),
  );
}
