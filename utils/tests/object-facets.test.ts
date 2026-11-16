import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { View, makeModel, THREE } from '../../src/renderer.ts';

test('multi-polygon source order agrees with 3444 original shape queries on all eight arenas', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/object-facets-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.cases, 3444);
  const views = audit.groups.map(
    (g: { faces: import('../../src/model-types.ts').ModelFace[] }) => {
      const root = makeModel({
        meshes: g.faces.map((f, i) => ({
          ...f,
          color: i % 2 ? [1, 0, 0] : [0, 1, 0],
          altitude: true,
          v: f.v.map((p) => [...p, 0, 0]),
        })),
      });
      root.updateMatrixWorld(true);
      return Object.assign(Object.create(View.prototype), { arenaGroup: root });
    },
  );
  audit.fixtures.forEach(
    (
      f: {
        group: string | number;
        kind: string;
        x: any;
        z: any;
        from: any;
        to: any;
      },
      i: number,
    ) => {
      const view = views[f.group],
        hits =
          f.kind === 'altitude'
            ? view.ground(f.x, f.z, 200, true)
            : view.sweepContacts(f.from, f.to),
        actual = hits[0],
        expected = audit.native[i];
      assert.ok(
        hits.length <= 1,
        `one shape returns at most one contact: ${i}`,
      );
      assert.equal(!!actual, !!expected, `hit ${i}`);
      if (actual) {
        for (const [j, k] of ['x', 'y', 'z'].entries()) {
          assert.ok(
            Math.abs(actual.normal[k] - expected.normal[j]) <= 1e-5,
            `normal ${i}`,
          );
        }
        if (f.kind === 'altitude') {
          assert.ok(
            Math.abs(actual.height - expected.height) <= 1e-5,
            `height ${i}`,
          );
        } else {
          for (const [j, k] of ['x', 'y', 'z'].entries()) {
            assert.ok(
              Math.abs(actual.point[k] - expected.point[j]) <= 1e-5,
              `point ${i}`,
            );
          }
        }
      }
    },
  );
  for (const view of views) {
    view.arenaGroup.traverse(
      (o: import('../../src/model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      },
    );
  }
});
test('instance identities remain separate when the same source model is placed twice', () => {
  const data = {
      meshes: [
        {
          name: 'object/polygon',
          contactObject: 'source object',
          contactOrder: 0,
          drawType: 1,
          v: [
            [0, 0, 0, 0, 0],
            [10, 0, 0, 0, 0],
            [10, 10, 0, 0, 0],
            [0, 10, 0, 0, 0],
          ],
        },
      ],
    },
    root = new THREE.Group(),
    a = makeModel(data),
    b = makeModel(data);
  b.position.z = 5;
  root.add(a, b);
  root.updateMatrixWorld(true);
  const view: View = Object.assign(Object.create(View.prototype), {
      arenaGroup: root,
    }),
    hits = view.sweepContacts({ x: 5, y: 5, z: 10 }, { x: 5, y: 5, z: -10 });
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((h: { point: { z: any } }) => h.point.z),
    [0, 5],
    'bare Object3D instances follow child insertion order',
  );
  root.traverse((o: import('../../src/model-types.ts').RenderNode) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
});
