import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareFacet } from '../../src/scene-facets.ts';
import { segmentInWorldPartition } from '../../src/world-partition.ts';
import { queryScene } from '../../utils/scene_query_batch.ts';

test('exported cleaned polygons preserve original 46247c vertex/UV output and float coordinates', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/polygon-cleanup-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.cases, 13737);
  assert.deepEqual(audit.mismatches, []);
  const models = new Map();
  let checked = 0;
  for (const c of audit.changed) {
    if (!c.arena) {
      continue;
    }
    if (!models.has(c.arena)) {
      models.set(
        c.arena,
        JSON.parse(
          readFileSync(
            new URL(
              `../../private/assets/models/arena${c.arena}.json`,
              import.meta.url,
            ),
          ).toString(),
        ),
      );
    }
    const face = models
      .get(c.arena)
      .meshes.find((f: { name: any }) => f.name === c.path);
    assert.ok(face, c.path);
    assert.deepEqual(face.v, c.world, c.path);
    assert.ok(face.v.length < c.source.length);
    checked++;
  }
  assert.equal(checked, 19);
  const floor = models
    .get(5)
    .meshes.find((f: { name: string }) => f.name.endsWith('/o1193/p6666'));
  const { normal } = prepareFacet(floor.v);
  assert.equal(normal.y, 1);
  assert.ok(normal.x === 0 && normal.z === 0);
});

test('ray cell selection rejects an adjacent-cell sliver and exact group-boundary touches', () => {
  const b = {
    min: [-384.000061, 0, -0.000183],
    max: [-255.999985, 81, 28.999802],
  };
  assert.equal(
    segmentInWorldPartition(
      b,
      { x: -379, y: 36, z: -0.0000095 },
      { x: -379, y: 36, z: -24 },
    ),
    false,
  );
  assert.equal(
    segmentInWorldPartition(
      b,
      { x: -379, y: 36, z: 1 },
      { x: -379, y: 36, z: -24 },
    ),
    true,
  );
  assert.equal(
    segmentInWorldPartition(
      b,
      { x: b.min[0], y: 36, z: 1 },
      { x: b.min[0], y: 36, z: 10 },
    ),
    false,
  );
});

test('all eight initialized arena query samples match independent native hit sets', async () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/gamegen-queries-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  // Hit sets only: native world ordering remains an explicit open difference.
  for (const arena of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = audit.results.find(
        (actor: { arena: number }) => actor.arena === arena,
      ),
      // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
      results = await queryScene({ arena, fixtures: r.fixtures });
    for (const [i, expected] of r.native.entries()) {
      const actual = [...results[i]];
      assert.equal(
        actual.length,
        expected.length,
        `arena ${arena}, count ${i}`,
      );
      for (const h of expected) {
        const j = actual.findIndex(
          (a) =>
            a.name === h.name &&
            [
              'normal',
              ...(r.fixtures[i].kind === 'sweep' ? ['point'] : []),
            ].every((k) =>
              ['x', 'y', 'z'].every(
                (axis) => Math.abs(a[k][axis] - h[k][axis]) < 1e-4,
              ),
            ) &&
            (r.fixtures[i].kind === 'sweep' ||
              Math.abs(a.height - h.height) < 1e-4),
        );
        assert.ok(j >= 0, `arena ${arena}, fixture ${i}, native ${h.name}`);
        actual.splice(j, 1);
      }
    }
  }
});
