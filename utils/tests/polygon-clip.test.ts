import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clipCameraPolygon,
  clipScreenPolygon,
  projectTexturePolygon,
  prepareProjectedTexturePolygon,
} from '../../src/polygon-clip.ts';
import { drawIndexedTexturePolygon } from '../../src/texture-spans.ts';
const audit = JSON.parse(
  readFileSync(
    new URL(
      '../../private/verification/polygon-clipping-native.json',
      import.meta.url,
    ),
  ).toString(),
);
const canonical = (value: number[][]) => JSON.parse(JSON.stringify(value));
test('camera clipping matches original near-plane UV/color/normal interpolation and far rejection', () => {
  assert.equal(audit.passed, true);
  assert.equal(audit.clipCases, 540);
  for (const fixture of audit.fixtures) {
    assert.deepEqual(
      canonical(
        clipCameraPolygon(fixture.vertices, {
          ...fixture.options,
          flags: fixture.options.cameraFlags,
        }),
      ),
      canonical(fixture.camera),
    );
  }
  const crossing = [
    [0, 0, 1, 0, 0],
    [2, 0, 1000, 1, 0],
    [0, 2, 1000, 0, 1],
  ];
  assert.deepEqual(
    clipCameraPolygon(crossing, { near: 0.75, far: 350 }),
    crossing,
    'a polygon crossing the far distance is retained',
  );
  assert.deepEqual(
    clipCameraPolygon(
      crossing.map((p) => [p[0], p[1], 1000, ...p.slice(3)]),
      { far: 350 },
    ),
    [],
  );
});
test('window clipping matches all original plane flags and strict upper edges', () => {
  for (const fixture of audit.fixtures) {
    assert.deepEqual(
      canonical(clipScreenPolygon(fixture.vertices, fixture.options)),
      canonical(fixture.screen),
    );
  }
  const vertices = [
    [10, 10, 1, 0, 0],
    [310, 10, 1, 1, 0],
    [310, 210, 1, 1, 1],
    [10, 210, 1, 0, 1],
  ];
  const clipped = clipScreenPolygon(vertices);
  assert.ok(clipped.every((p) => p[1] <= 199));
});
test('projection matches original stored reciprocal depth, viewport offsets and weighted UVs', () => {
  for (const fixture of audit.projection) {
    assert.deepEqual(
      canonical(projectTexturePolygon(fixture.vertices, fixture.options)),
      canonical(fixture.native),
    );
  }
  const projected = prepareProjectedTexturePolygon(
    [
      [0, 0, 0.5, 0, 0],
      [1, 0, 2, 1, 0],
      [0, 1, 2, 0, 1],
    ],
    { near: 1.5, far: 350, flags: 15, scale: [20, 20], center: [30, 30] },
  );
  assert.ok(
    projected.every((p) => p[2] <= Math.fround(1 / 1.5)),
    'window plane flags do not disable camera clipping',
  );
});
test('camera-to-indexed-pixel pipeline matches 160 native polygon draws in both texture axes', () => {
  assert.equal(audit.pipelineCases, 160);
  assert.equal(audit.comparedFrameBytes, 20480000);
  for (const fixture of audit.pipeline) {
    const vertices = prepareProjectedTexturePolygon(
      fixture.vertices,
      fixture.options,
    );
    assert.deepEqual(canonical(vertices), canonical(fixture.native));
    for (const axis of [0, 1]) {
      const target = new Uint8Array(64000).fill(255),
        [width, height] = fixture.size,
        pixels = Uint8Array.from({ length: width * height }, (_, i) =>
          axis ? Math.floor(i / width) % 256 : (i % width) % 256,
        );
      if (vertices.length) {
        drawIndexedTexturePolygon(
          target,
          320,
          vertices,
          { width, height, pixels },
          { ...fixture.options, weightedUV: true },
        );
      }
      assert.equal(
        createHash('sha256').update(target).digest('hex'),
        fixture.hashes[axis],
      );
    }
  }
});
