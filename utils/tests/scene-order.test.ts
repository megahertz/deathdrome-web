import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { View, makeModel, THREE } from '../../src/renderer.ts';
import { queryOrderedScene } from '../../utils/scene_order_batch.ts';
import { queryScene } from '../../utils/scene_query_batch.ts';

function compare(
  actual: unknown,
  expected: unknown,
  tolerance: number,
  path = '',
) {
  if (typeof expected === 'number') {
    assert.ok(typeof actual === 'number');
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${path}: ${actual} != ${expected}`,
    );
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object');
    const actualRecord = actual as Record<string, unknown>,
      expectedRecord = expected as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      path,
    );
    for (const key in expected) {
      compare(
        actualRecord[key],
        expectedRecord[key],
        tolerance,
        path + '.' + key,
      );
    }
  } else {
    assert.equal(actual, expected, path);
  }
}

test('native traversal agrees on 168 adversarial queries across all insertion permutations and both ray directions', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/scene-order-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.fixtures.length, 72);
  assert.equal(audit.queries, 168);
  for (const [i, fixture] of audit.fixtures.entries()) {
    compare(
      queryOrderedScene(fixture),
      audit.native[i],
      audit.tolerance,
      'scene ' + i,
    );
  }
});

test('all 5116 full native-initialized arena queries preserve contact order as well as geometry', async () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/gamegen-queries-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  let count = 0;
  for (const row of audit.results) {
    assert.deepEqual(row.orderMismatches, []);
    assert.deepEqual(row.geometryMismatches, []);
    // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const actual = await queryScene({
      arena: row.arena,
      fixtures: row.fixtures,
    });
    for (const [i, hits] of row.native.entries()) {
      assert.equal(
        actual[i].length,
        hits.length,
        `arena ${row.arena}, query ${i}`,
      );
      count++;
      hits.forEach(
        (
          native: {
            normal: Record<string, number>;
            point: Record<string, number>;
            name: string;
            height: number;
          },
          j: string | number,
        ) => {
          const h = actual[i][j];
          assert.equal(
            h.name,
            native.name,
            `arena ${row.arena}, query ${i}, contact ${j}`,
          );
          for (const field of [
            'normal' as const,
            ...(row.fixtures[i].kind === 'sweep' ? ['point' as const] : []),
          ]) {
            for (const axis of ['x', 'y', 'z']) {
              assert.ok(Math.abs(h[field][axis] - native[field][axis]) < 1e-4);
            }
          }
          if (row.fixtures[i].kind === 'ground') {
            assert.ok(Math.abs(h.height - native.height) < 1e-4);
          }
        },
      );
    }
  }
  assert.equal(count, 5116);
});

test('bare model placements retain separate subtree order across material batches', () => {
  const data = {
    meshes: [0, 1].map((rank) => ({
      name: 'object' + rank + '/p',
      contactObject: 'object' + rank,
      contactRank: rank,
      contactOrder: rank,
      drawType: 1,
      color: rank ? [1, 0, 0] : [0, 1, 0],
      v: [
        [0, 0, rank, 0, 0],
        [10, 0, rank, 0, 0],
        [10, 10, rank, 0, 0],
        [0, 10, rank, 0, 0],
      ],
    })),
  };
  const root = new THREE.Group(),
    a = makeModel(
      data as unknown as import('../../src/model-types.ts').ModelGeometry,
    ),
    b = makeModel(
      data as unknown as import('../../src/model-types.ts').ModelGeometry,
    );
  b.position.z = 5;
  root.add(a, b);
  root.updateMatrixWorld(true);
  const view: View = Object.assign(Object.create(View.prototype), {
      arenaGroup: root,
    }),
    hits = view.sweepContacts({ x: 5, y: 5, z: 10 }, { x: 5, y: 5, z: -10 });
  assert.deepEqual(
    hits.map((h: { point: { z: any } }) => h.point.z),
    [0, 1, 5, 6],
  );
  root.traverse((n: import('../../src/model-types.ts').RenderNode) => {
    n.geometry?.dispose();
    n.material?.dispose();
  });
});

test('scalar ground selection still chooses the highest eligible surface from unsorted contacts, including negative heights', () => {
  const data = {
    meshes: [-5, 10, 3].map((y, rank) => ({
      name: 'floor' + rank + '/p',
      contactObject: 'floor' + rank,
      contactRank: rank,
      contactOrder: rank,
      drawType: 1,
      v: [
        [0, y, 10, 0, 0],
        [10, y, 10, 0, 0],
        [10, y, 0, 0, 0],
        [0, y, 0, 0, 0],
      ],
    })),
  };
  const root = makeModel(data);
  root.updateMatrixWorld(true);
  const view: View = Object.assign(Object.create(View.prototype), {
    arenaGroup: root,
  });
  assert.deepEqual(
    view.ground(5, 5, 200, true).map((h: { height: any }) => h.height),
    [-5, 10, 3],
  );
  assert.equal(view.ground(5, 5, 200), 10);
  assert.equal(view.ground(5, 5, 5), 3);
  assert.equal(view.ground(5, 5, -1), -5);
  assert.equal(view.ground(50, 50), 0);
  root.traverse((n: import('../../src/model-types.ts').RenderNode) => {
    n.geometry?.dispose();
    n.material?.dispose();
  });
});
