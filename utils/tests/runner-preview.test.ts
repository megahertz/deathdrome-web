import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  makeRunnerPreview,
  stepRunnerPreview,
} from '../../src/runner-preview.ts';
test('all eight previews rotate around the visible body centre while the floor stays fixed', () => {
  for (const name of [
    'redrunr',
    'blurunr',
    'ylwrunr',
    'whtrunr',
    'prprunr',
    'grnrunr',
    'pnkrunr',
    'orgrunr',
  ]) {
    const data = JSON.parse(
      readFileSync(
        new URL(
          '../../private/assets/models/' + name + '.json',
          import.meta.url,
        ),
      ).toString(),
    );
    // Geometry check in Node: texture loading/actual shader rendering are
    // exercised by the browser, not replaced with a claimed raster match.
    data.meshes = data.meshes.map((f: any) => ({
      ...f,
      texture: null,
      cycle: undefined,
    }));
    const root = makeRunnerPreview(data),
      p = root.userData.preview;
    root.updateMatrixWorld(true);
    const initial = p.model.localToWorld(p.centre.clone()),
      floor = [...p.floor.matrixWorld.elements];
    for (const dt of [0.5, 1, 2, 4, 8]) {
      stepRunnerPreview(root, dt);
      root.updateMatrixWorld(true);
      const centre = p.model.localToWorld(p.centre.clone());
      assert.ok(centre.distanceTo(initial) < 1e-6, name + ' orbit');
      assert.deepEqual(
        p.floor.matrixWorld.elements,
        floor,
        name + ' moving floor',
      );
      assert.ok(
        p.angle.value > 0 && p.angle.value < p.body.rotation.y,
        name + ' light rotates slower',
      );
    }
  }
});
test('the preview preserves the authored forward offset at its initial pose', () => {
  const data = JSON.parse(
    readFileSync(
      new URL('../../private/assets/models/redrunr.json', import.meta.url),
    ).toString(),
  );
  data.meshes = data.meshes.map((f: any) => ({
    ...f,
    texture: null,
    cycle: undefined,
  }));
  const root = makeRunnerPreview(data),
    p = root.userData.preview;
  root.updateMatrixWorld(true);
  const source = data.meshes.find((f: { name: string }) =>
    /\/lcl_lt\/lt\//i.test(f.name),
  ).v[0];
  const vertex = (p.floorModel.children[0] as import('#three').Mesh).geometry
    .attributes.position;
  const actual = p.floorModel.children[0].localToWorld(
    p.centre.clone().set(vertex.getX(0), vertex.getY(0), vertex.getZ(0)),
  );
  assert.ok(
    Math.hypot(
      actual.x - source[0],
      actual.y - source[1],
      actual.z - (source[2] + 3),
    ) < 1e-5,
  );
});
