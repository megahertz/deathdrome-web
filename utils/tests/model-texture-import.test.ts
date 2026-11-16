import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { makeModel } from '../../src/renderer.ts';
const audit = JSON.parse(
  readFileSync(
    new URL(
      '../../private/verification/model-texture-import-native.json',
      import.meta.url,
    ),
  ).toString(),
);
function signature(uv: number[][]) {
  const pairs = uv
    .map((p) => p.map((x) => (x === 0 ? 0 : x)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const bytes = Buffer.alloc(pairs.length * 8);
  pairs.forEach((p, i) => {
    bytes.writeFloatLE(p[0], i * 8);
    bytes.writeFloatLE(p[1], i * 8 + 4);
  });
  return createHash('sha256').update(bytes).digest('hex');
}
test('exported render UV sets are present in independently loaded native models', () => {
  assert.ok(audit.passed);
  assert.equal(audit.models.length, 86);
  assert.equal(audit.missingUVSets, 0);
  for (const model of audit.models) {
    const data = JSON.parse(
        readFileSync(
          new URL(
            '../../private/assets/models/' + model.model + '.json',
            import.meta.url,
          ),
        ).toString(),
      ),
      native = new Set(model.nativeUVSignatures);
    for (const face of data.meshes) {
      if (face.texture) {
        assert.ok(face.renderPolygons, face.name);
        for (const polygon of face.renderPolygons) {
          assert.ok(
            native.has(signature(polygon.uv)),
            model.model + ': ' + face.name,
          );
        }
      }
    }
  }
});
test('renderer retains independent UV origins at subdivision boundaries', () => {
  const data = {
    meshes: [
      {
        name: 'source/polygon',
        texture: null,
        color: [1, 1, 1] as [number, number, number],
        v: [
          [0, 0, 0, 0, 0],
          [4, 0, 0, 0, 0],
          [4, 4, 1, 0, 0],
          [0, 4, 0, 0, 0],
        ],
        renderPolygons: [
          {
            indices: [0, 1, 2],
            uv: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          },
          {
            indices: [0, 2, 3],
            uv: [
              [1, 0],
              [2, 1],
              [1, 1],
            ],
          },
        ],
      },
    ],
  };
  const group = makeModel(data),
    mesh = group.children[0] as import('#three').Mesh<
      import('#three').BufferGeometry,
      import('#three').MeshBasicMaterial
    >;
  assert.deepEqual(
    Array.from(mesh.geometry.attributes.uv.array),
    [0, 0, 1, 0, 1, 1, 1, 0, 2, 1, 1, 1],
  );
  assert.equal(mesh.geometry.attributes.position.count, 6);
  assert.equal(mesh.userData.facets.length, 1);
  assert.equal(mesh.userData.contactNames.length, 2);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
