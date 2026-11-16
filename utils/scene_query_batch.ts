// Query the production arena loader without a WebGL context. Only texture
// requests are removed; meshes, external references and query code are real.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { View, THREE } from '../src/renderer.ts';
import { altitudeFacetHits, segmentFacetHits } from '../src/scene-geometry.ts';
export async function queryScene(q: {
  arena: any;
  fixtures: any;
  ignoreWorldPartitions?: any;
  round?: any;
}) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (path) => {
    const name = String(path).split('?')[0];
    const data = JSON.parse(
      await readFile(new URL('../private/' + name, import.meta.url), 'utf8'),
    );
    return Response.json({
      ...data,
      worldObjects: q.ignoreWorldPartitions ? undefined : data.worldObjects,
      meshes: data.meshes.map((face: object) => ({
        ...face,
        texture: null,
        cycle: null,
      })),
    });
  };
  try {
    const view: View = Object.assign(Object.create(View.prototype), {
      scene: new THREE.Scene(),
      stage: new THREE.Group(),
      objects: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(),
    });
    view.scene.background = new THREE.Color(0x09_0b_10);
    await view.arena(q.arena);
    view.configurePortals(q.round ?? 1);
    const results = q.fixtures.map(
      (f: {
        kind: string;
        x: number;
        z: number;
        from: { [x: string]: number; x?: any; y?: any; z?: any };
        to: { [x: string]: number; x?: any; y?: any; z?: any };
      }) => {
        const hits =
          f.kind === 'ground'
            ? altitudeFacetHits(view.arenaGroup, f.x, f.z)
            : segmentFacetHits(
                view.arenaGroup,
                f.from as unknown as import('../src/game-types.ts').Vec3,
                f.to as unknown as import('../src/game-types.ts').Vec3,
              );
        return hits.map((h) => ({
          name: h.name.split('/').at(-2) ?? h.name,
          path: h.name,
          normal: h.normal,
          ...(f.kind === 'ground' ? { height: h.height } : { point: h.point }),
        }));
      },
    );
    view.clear();
    return results;
  } finally {
    globalThis.fetch = previousFetch;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  process.stdout.write(JSON.stringify(await queryScene(JSON.parse(input))));
}
