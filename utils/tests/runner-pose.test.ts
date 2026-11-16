import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Effects } from '../../src/effects.ts';
import { beginEscape, beginOpponentExit } from '../../src/escape.ts';
import { NANO } from '../../src/nano-shield.ts';
import {
  makeModel,
  makeRunnerModel,
  poseRunnerModel,
  runnerAttachmentMatrix,
  THREE,
} from '../../src/renderer.ts';
import { RUNNER_POSE, cockpitRollDegrees } from '../../src/runner-pose.ts';
import { RUNNERS, Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';
const RAD = Math.PI / 180,
  close = (a: number, b: number, tolerance = 1e-5) =>
    assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const data = async (name: string) => {
  const d = JSON.parse(
    (
      await readFile(
        new URL(
          '../../private/assets/models/' + name + '.json',
          import.meta.url,
        ),
      )
    ).toString(),
  );
  return { ...d, meshes: d.meshes.map((f: any) => ({ ...f, texture: null })) };
};
function dispose(root: THREE.Group<THREE.Object3DEventMap>) {
  root.traverse((o: import('../../src/model-types.ts').RenderNode) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}

test('active runner scripts disable legacy ZAN insertion and override the compiled cockpit ratio', async () => {
  const script = await readFile(
      new URL('../../private/original/game/RUN/DYNAMICS.GW', import.meta.url),
      'utf8',
    ),
    active = script.replace(/#.*$/gm, '');
  assert.equal(
    RUNNER_POSE.cockpitRollRatio,
    Math.fround(
      Number(active.match(/RunDynSetCockpitRollRatio\s+([\d.]+)/)![1]),
    ),
  );
  assert.equal(
    RUNNER_POSE.maximumCockpitRoll,
    Number(active.match(/RunDynSetMaxCockpitRot\s+([\d.]+)/)![1]),
  );
  const runner = await readFile(
    new URL('../../private/original/game/RUN/RUNNER_X.GW', import.meta.url),
    'utf8',
  );
  assert.equal(/^[^#\r\n]*LoadAnimation/m.test(runner), false);
  for (const [turn, expected] of [
    [-500, -30],
    [-250, -30],
    [-200, -24],
    [0, 0],
    [200, 24],
    [250, 30],
    [500, 30],
  ]) {
    close(cockpitRollDegrees(turn * RAD), expected);
  }
});
test('all eight neutral runner rigs reconstruct the decoded original geometry bounds and triangle counts', async () => {
  for (const name of RUNNERS) {
    // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const d = await data(name),
      flat = makeModel(
        d,
        (f: { name: string | string[] }) => !f.name.includes('/lt/'),
      ),
      rigged = makeRunnerModel(d),
      a = new THREE.Box3().setFromObject(flat),
      b = new THREE.Box3().setFromObject(rigged),
      counts = (root: THREE.Group<THREE.Object3DEventMap>) => {
        let n = 0;
        root.traverse((o: import('../../src/model-types.ts').RenderNode) => {
          if (o.geometry) {
            n += o.geometry.attributes.position.count;
          }
        });
        return n;
      };
    assert.equal(counts(flat), counts(rigged));
    for (const field of ['min', 'max'] as const) {
      for (const axis of ['x', 'y', 'z'] as const) {
        close(a[field][axis], b[field][axis]);
      }
    }
    assert.ok(
      rigged.userData.runnerRig.chassis.parent ===
        rigged.userData.runnerRig.yaw,
    );
    assert.ok(
      rigged.userData.runnerRig.cockpit.parent ===
        rigged.userData.runnerRig.chassis,
    );
    dispose(flat);
    dispose(rigged);
  }
});
test('turning rotates only the cockpit around its original pivot and folding retains the complete articulated pose', async () => {
  const d = await data('redrunr'),
    m = makeRunnerModel(d),
    r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 12,
      y: 3,
      z: 5,
      yaw: 0.4,
      turn: 0,
      dead: 0,
    }),
    rig = m.userData.runnerRig,
    point = new THREE.Vector3(2, 1, -2);
  poseRunnerModel(m, r);
  const body = point.clone().applyMatrix4(rig.chassis.matrixWorld),
    cockpit = point.clone().applyMatrix4(rig.cockpit.matrixWorld);
  r.turn = 200 * RAD;
  poseRunnerModel(m, r);
  close(rig.cockpit.rotation.z, 24 * RAD);
  close(m.rotation.z, 0);
  close(
    point.clone().applyMatrix4(rig.chassis.matrixWorld).distanceTo(body),
    0,
  );
  assert.ok(
    point.clone().applyMatrix4(rig.cockpit.matrixWorld).distanceTo(cockpit) >
      0.1,
  );
  const e = {
    runner: 0,
    phase: 'fold',
    foldDegrees: 45,
    cockpitRollDegrees: 24,
  };
  poseRunnerModel(m, r, e);
  const expected = runnerAttachmentMatrix(d, r, 'cockpit', e).elements;
  rig.cockpit.matrixWorld.elements.forEach((v: number, i: number) =>
    close(v, expected[i], 1e-9),
  );
  dispose(m);
});
test('human and opponent exit dispatch preserve cockpit lean when they clear their steering rate', () => {
  let s = new Simulation(),
    r = s.runners[0];
  r.turn = 200 * RAD;
  beginEscape(s, r);
  assert.equal(r.turn, 0);
  close(s.escape!.cockpitRollDegrees, 24);
  s = new Simulation();
  s.time = 34;
  [, r] = s.runners;
  Object.assign(r, {
    x: 0,
    y: 0,
    z: 0,
    turn: -200 * RAD,
    kills: s.requiredKills,
  });
  beginOpponentExit(s, r);
  assert.equal(r.turn, 0);
  close(r.opponentExit!.cockpitRollDegrees, -24);
});
test('NanoShield planes share the moving cockpit frame rather than an upright static attachment', async () => {
  const d = await data('redrunr'),
    r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      model: 'redrunr',
      x: 10,
      y: 2,
      z: 3,
      yaw: 0.7,
      turn: 300 * RAD,
      dead: 0,
      shield: 1,
      shieldPlanes: [{ z: -4, scale: 0.5 }],
    }),
    m = makeRunnerModel(d);
  poseRunnerModel(m, r);
  const effects = new Effects(
    {
      objects: new THREE.Group(),
    } as unknown as import('../../src/renderer.ts').View,
    new Map([
      ['redrunr', d],
      ['nano', { meshes: [] }],
    ] as const),
  );
  effects.syncShields({ runners: [r] });
  const expected = m.userData.runnerRig.cockpit.matrixWorld
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -4))
    .multiply(new THREE.Matrix4().makeScale(0.5, 0.5, NANO.depthScale));
  effects.pools.shields[0].mesh.matrix.elements.forEach((v, i) =>
    close(v, expected.elements[i], 1e-9),
  );
  dispose(m);
});
