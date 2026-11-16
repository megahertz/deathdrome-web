import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  worldPartition,
  groundInWorldPartition,
} from '../../src/world-partition.ts';
import { queryScene } from '../../utils/scene_query_batch.ts';

test('world cell assignment matches 2315 original-code shape and boundary cases', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/world-partition-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.fixtures.length, 2315);
  for (const [i, c] of audit.fixtures.entries()) {
    assert.deepEqual(
      worldPartition(
        c.min.map((itemValue: number) => Math.fround(itemValue)),
        c.max.map((itemValue: number) => Math.fround(itemValue)),
      ),
      audit.native[i],
      `cell ${i}`,
    );
  }
  const b = { min: [-256, 0, -576], max: [-128, 11, -512] };
  assert.equal(
    groundInWorldPartition(b, -128, -544),
    false,
    'the adjacent cell does not query this object',
  );
  assert.equal(groundInWorldPartition(b, -128.01, -544), true);
  assert.equal(
    groundInWorldPartition(b, -128 - 1e-8, -544),
    false,
    'query coordinates first round to native float',
  );
});
test('all 640 THE WALL query hit sets match the independently loaded native arena; ordering remains separate', async () => {
  const audit = JSON.parse(
      readFileSync(
        new URL(
          '../../private/verification/gamegen-queries-native.json',
          import.meta.url,
        ),
      ).toString(),
    ),
    r = audit.results.find((actor: { arena: number }) => actor.arena === 6);
  assert.equal(r.fixtures.length, 640);
  const results = await queryScene({ arena: 6, fixtures: r.fixtures });
  for (const [i, expected] of r.native.entries()) {
    const actual = [...results[i]];
    assert.equal(actual.length, expected.length, `hit count ${i}`);
    for (const hit of expected) {
      const j = actual.findIndex(
        (h) =>
          h.name === hit.name &&
          [
            'normal',
            ...(r.fixtures[i].kind === 'sweep' ? ['point'] : []),
          ].every((k) =>
            ['x', 'y', 'z'].every(
              (axis) => Math.abs(h[k][axis] - hit[k][axis]) < 1e-4,
            ),
          ) &&
          (r.fixtures[i].kind === 'sweep' ||
            Math.abs(h.height - hit.height) < 1e-4),
      );
      assert.ok(j !== -1, `native hit ${hit.name}, fixture ${i}`);
      actual.splice(j, 1);
    }
  }
});
