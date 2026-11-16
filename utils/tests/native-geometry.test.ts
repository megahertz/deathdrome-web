import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  nativePolygonFacing,
  transformNativePoints,
} from '../../src/native-geometry.ts';
import { prepareProjectedTexturePolygon } from '../../src/polygon-clip.ts';
const reference = JSON.parse(
  readFileSync(
    new URL('../../private/verification/native-geometry.json', import.meta.url),
  ).toString(),
);
const canonical = (x: unknown) => {
  const serialized = JSON.stringify(x);
  return JSON.parse(serialized);
};
test('first-three-vertex facing and normals match 3,000 original front/back/threshold cases', () => {
  assert.equal(reference.passed, true);
  assert.equal(reference.facingCases, 3000);
  for (const fixture of reference.facing) {
    assert.deepEqual(
      canonical(nativePolygonFacing(fixture.vertices, fixture.twoSided)),
      canonical(fixture.native),
    );
  }
});
test('stored-float point transforms match 4,996 original points, including the identity path', () => {
  assert.equal(reference.transformCases, 1000);
  assert.equal(reference.transformedPoints, 4996);
  for (const fixture of reference.transforms) {
    assert.deepEqual(
      canonical(
        transformNativePoints(fixture.vertices, fixture.matrix, fixture),
      ),
      canonical(fixture.native),
    );
  }
});
test('software projection rejects edge-on and one-sided back faces before screen projection', () => {
  const vertices = [
      [0, 0, 2],
      [0, 1, 2],
      [1, 0, 2],
    ],
    options = {
      near: 0.75,
      far: 1200,
      bounds: [0, 0, 320, 200],
      scale: [50, 50],
      center: [160, 100],
      cullBackfaces: true,
    };
  assert.equal(prepareProjectedTexturePolygon(vertices, options).length, 3);
  assert.deepEqual(
    prepareProjectedTexturePolygon(vertices.toReversed(), options),
    [],
  );
  assert.equal(
    prepareProjectedTexturePolygon(vertices.toReversed(), {
      ...options,
      twoSided: true,
    }).length,
    3,
  );
  assert.deepEqual(
    prepareProjectedTexturePolygon(
      [
        [0, 0, 2],
        [0, 1, 2],
        [0, 2, 2],
      ],
      { ...options, twoSided: true },
    ),
    [],
  );
});
