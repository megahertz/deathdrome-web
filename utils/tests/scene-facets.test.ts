import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { View, makeModel } from '../../src/renderer.ts';
import {
  prepareFacet,
  intersectFacet,
  altitudeFacet,
} from '../../src/scene-facets.ts';
test('facet sides, endpoints, edges and vertices agree with 21780 original segment actions', async () => {
  const audit = JSON.parse(
      await readFile(
        new URL(
          '../../private/verification/surface-facets-native.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
    facets = audit.polygons.map((p: { vertices: number[][] }) => [
      prepareFacet(p.vertices, false),
      prepareFacet(p.vertices, true),
    ]);
  assert.equal(audit.passed, true);
  for (const sample of audit.sideFlags) {
    assert.equal(!!(sample.drawType & 1), sample.twoSided);
  }
  for (const [i, sample] of audit.fixtures.entries()) {
    const actual = intersectFacet(
        facets[sample.polygon][+sample.twoSided],
        sample.from as unknown as import('../../src/game-types.ts').Vec3,
        sample.to as unknown as import('../../src/game-types.ts').Vec3,
      ),
      expected = audit.native[i];
    assert.equal(!!actual, !!expected, `hit ${i}`);
    if (expected) {
      for (const key of ['normal', 'point'] as const) {
        for (const axis of ['x', 'y', 'z'] as const) {
          assert.ok(
            actual![key][axis] === expected[key][axis],
            `${key}.${axis} ${i}`,
          );
        }
      }
    }
  }
});
test('whole-polygon altitude normals and heights agree with original threshold and ceiling actions', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/ground-facets-native.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const [i, sample] of audit.fixtures.entries()) {
    const actual = altitudeFacet(prepareFacet(sample.v), sample.x, sample.z),
      expected = sample.native;
    assert.equal(!!actual, expected.hit, `hit ${i}`);
    if (actual) {
      assert.equal(actual.height, expected.height);
      for (const [j, axis] of (['x', 'y', 'z'] as const).entries()) {
        assert.ok(
          actual.normal[axis as keyof typeof actual.normal] ===
            expected.normal[j],
          `normal ${i}`,
        );
      }
    }
  }
});
test('production polygon queries preserve one-sided hits and invalidate moved geometry', () => {
  const group = makeModel({
      meshes: [
        {
          name: 'door/panel',
          v: [
            [0, 0, 0, 0, 0],
            [10, 0, 0, 0, 0],
            [10, 10, 0, 0, 0],
            [0, 10, 0, 0, 0],
          ],
          drawType: 0,
        },
      ],
    }),
    view: View = Object.assign(Object.create(View.prototype), {
      arenaGroup: group,
    });
  group.updateMatrixWorld(true);
  const point = (z: number) => ({ x: 5, y: 5, z });
  assert.equal(view.sweepContacts(point(1), point(-1)).length, 1);
  assert.equal(view.sweepContacts(point(-1), point(1)).length, 0);
  assert.equal(view.sweepContacts(point(1), point(0)).length, 0);
  assert.equal(view.sweepContacts(point(0), point(-1)).length, 1);
  group.position.z = 5;
  group.updateMatrixWorld(true);
  assert.equal(view.sweepContacts(point(1), point(-1)).length, 0);
  assert.equal(view.sweepContacts(point(6), point(4))[0].point.z, 5);
  group.visible = false;
  assert.equal(view.sweepContacts(point(6), point(4)).length, 0);
  group.traverse((o: import('../../src/model-types.ts').RenderNode) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
});
