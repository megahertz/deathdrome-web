import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { acquireAITarget } from '../../src/ai-actions.ts';
import {
  makeRunnerModel,
  poseRunnerModel,
  View,
  THREE,
} from '../../src/renderer.ts';
import { runnerQueryBounds } from '../../src/runner-query.ts';
import { segmentFacetHits } from '../../src/scene-geometry.ts';
import { fixture as stateFixture } from './fixtures.ts';
const models = new Map();
function model(name: string) {
  if (!models.has(name)) {
    const data = JSON.parse(
      readFileSync(
        new URL(
          '../../private/assets/models/' + name + '.json',
          import.meta.url,
        ),
      ).toString(),
    );
    assert.ok(
      data.attachments.chassis.collisionBounds,
      'Reimported runner must contain the original chassis bounds tree',
    );
    data.meshes = data.meshes.map((p: any) => ({
      ...p,
      texture: null,
      cycle: undefined,
    }));
    models.set(name, { data, root: makeRunnerModel(data) });
  }
  return models.get(name);
}
function runner(
  p: { yaw: number; pitch: any; roll: any; turn: number },
  id = 0,
) {
  return stateFixture<import('../../src/game-types.ts').Runner>({
    id,
    x: 100,
    y: 0,
    z: 100,
    yaw: (p.yaw * Math.PI) / 180,
    chassisPitchDegrees: p.pitch,
    chassisRollDegrees: p.roll,
    turn: (p.turn * Math.PI) / 180,
    health: 100,
    dead: 0,
    actionMode: 1,
  });
}
test('posed chassis boxes and 2,880 source-scene ray decisions match original loaded geometry', () => {
  const report = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/runner-queries-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(report.passed, true);
  assert.equal(report.poseCases, 120);
  assert.equal(report.rayCases, 2880);
  for (const f of report.fixtures) {
    const entry = model(f.name);
    poseRunnerModel(entry.root, runner(f.pose));
    const rig = entry.root.userData.runnerRig;
    assert.deepEqual(
      runnerQueryBounds(entry.data.attachments.chassis.collisionBounds, {
        pitch: rig.cockpit.rotation.x,
        roll: rig.cockpit.rotation.z,
      }),
      f.nativeBounds,
    );
    for (const ray of f.rays) {
      const actual = segmentFacetHits(entry.root, ray.from, ray.to);
      assert.equal(actual.length, ray.native.length);
      for (const [i, hit] of actual.entries()) {
        for (const k of ['point', 'normal']) {
          for (const axis of 'xyz') {
            assert.ok(
              Math.abs(hit[k][axis] - ray.native[i][k][axis]) <=
                report.numericTolerance,
            );
          }
        }
      }
    }
  }
});
test('production target scanning through real runner boxes matches 1,440 original scene decisions', () => {
  const report = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/ai-targeting-scene-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(report.passed, true);
  assert.equal(report.cases, 1440);
  assert.equal(report.originalAccepted, 720);
  for (const f of report.fixtures) {
    const entry = model(f.name),
      r = stateFixture<import('../../src/game-types.ts').Runner>({
        id: 0,
        x: f.position[0],
        y: f.position[1],
        z: f.position[2],
        dead: 0,
      }),
      target = runner(f.pose, 1),
      runners = [r, target],
      view = { arenaGroup: new THREE.Group() },
      sim = stateFixture<import('../../src/simulation.ts').Simulation>({
        runners,
        sceneContacts: (
          a: any,
          b: any,
          source?: Partial<import('../../src/game-types.ts').Runner>,
        ) =>
          View.prototype.lineContacts.call(view, a, b, {
            runners,
            models: [null, entry.root],
            ignore: source?.id,
          }),
      });
    assert.equal(acquireAITarget(sim, r, f)?.id ?? null, f.nativeTarget);
  }
});
