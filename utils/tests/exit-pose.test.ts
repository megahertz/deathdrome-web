import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { beginEscape, ESCAPE } from '../../src/escape.ts';
import { stepExitPose } from '../../src/exit-pose.ts';
import { View, poseRunnerModel, makeModel } from '../../src/renderer.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';

test('cinematic camera constants match original exit action operands', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x480000 + 0x68e00);
  for (const [key, va] of [
    ['lookHeight', 0x484e3b],
    ['distance', 0x484e08],
    ['depth', 0x484e10],
    ['reverseDegrees', 0x484e14],
    ['riseFactor', 0x484def],
  ] as const) {
    assert.equal(ESCAPE.camera[key], f(va));
  }
});
test('human exit captures the existing camera once, holds it through delay and drives it through fold and rise', () => {
  const copied = {
    x: 18,
    y: 3,
    z: 10,
    pitchDegrees: -4,
    yawDegrees: 35,
    rollDegrees: 0,
  };
  let calls = 0;
  const s = new Simulation({
    captureCamera: () => {
      calls++;
      return copied;
    },
  });
  const r = s.runners[0];
  Object.assign(r, { x: 12, y: 0, z: 5 });
  beginEscape(s, r);
  const initial = { ...s.escape!.camera };
  copied.x = 999;
  for (let i = 0; i < 16; i++) {
    s.step(1 / 60, { throttle: 1 });
  }
  assert.equal(calls, 1);
  assert.deepEqual(s.escape!.camera, initial);
  for (let i = 0; i < 61; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.escape!.phase, 'fold');
  assert.equal(s.escape!.camera.x, 18);
  assert.equal(r.x, 0);
  for (let i = 0; i < 157; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.escape!.phase, 'rise');
  const c = s.escape!.camera;
  assert.ok(Math.abs(Math.hypot(c.x, c.z) - 2) < 1e-6);
  assert.ok(Math.abs(c.y + 16) < 1e-5);
  assert.equal(c.pitchDegrees, s.escape!.foldDegrees);
  const { y } = c;
  s.step(1 / 60);
  assert.equal(r.y, 1.5000001192092896);
  assert.ok(Math.abs(c.y - y - 1.725) < 1e-6);
  for (let i = 0; i < 120; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.phase, 'roundcomplete');
  assert.equal(r.y, 181.50001525878906);
  assert.ok(c.y > 192);
  assert.equal(calls, 1);
});
test('fold retains angles between 89.8 and 90 rather than clamping them prematurely', () => {
  const e = { phase: 'fold', remaining: 0.005, foldDegrees: 0 },
    r = { x: 0, y: 0, z: 0 };
  stepExitPose(
    stateFixture<import('../../src/simulation.ts').Simulation>({
      exitHangar: {},
    }),
    r,
    e as import('../../src/game-types.ts').ExitState,
    0,
  );
  assert.ok(e.foldDegrees > 89.8 && e.foldDegrees < 90);
});
test('cinematic camera sampling is read-only and overrides chase/rear controls during an exit', () => {
  const c = {
      x: 1,
      y: -16,
      z: 1,
      pitchDegrees: 89.8,
      yawDegrees: 45,
      rollDegrees: 0,
    },
    e = { camera: c },
    calls: unknown[] = [],
    view = {
      camera: {
        position: {
          set(...args: any[]) {
            calls.push(args);
          },
        },
        rotation: {
          set(...args: any[]) {
            calls.push(args);
          },
        },
      },
    };
  for (let i = 0; i < 10; i++) {
    View.prototype.follow.call(
      view,
      stateFixture<import('../../src/game-types.ts').Runner>({ id: 0 }),
      1 / 60,
      true,
      true,
      e,
    );
  }
  assert.deepEqual(c, {
    x: 1,
    y: -16,
    z: 1,
    pitchDegrees: 89.8,
    yawDegrees: 45,
    rollDegrees: 0,
  });
  assert.equal(calls.length, 20);
  assert.deepEqual(calls[0], [1, -16, 1]);
  assert.deepEqual(calls[1], [
    (89.8 * Math.PI) / 180,
    (45 * Math.PI) / 180,
    0,
    'YXZ',
  ]);
});

test('local runner light is a separate batch and disappears when centering installs the fold action', () => {
  const face = (name: string) => ({
      name,
      v: [
        [0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
      ],
      color: [1, 1, 1] as [number, number, number],
    }),
    m = makeModel({
      meshes: [face('runner/yaw/chassis/face'), face('runner/yaw/lcl_lt/face')],
    });
  assert.equal(m.children.length, 2);
  const r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      dead: 0,
    }),
    e = { runner: 0, phase: 'center', foldDegrees: 0 };
  poseRunnerModel(m, r, e);
  assert.ok(m.children.every((n) => n.visible));
  e.phase = 'fold';
  e.foldDegrees = 45;
  poseRunnerModel(m, r, e);
  assert.equal(m.children.find((n) => n.userData.runnerLight)!.visible, false);
  assert.equal(m.children.find((n) => !n.userData.runnerLight)!.visible, true);
  poseRunnerModel(m, r);
  assert.ok(m.children.every((n) => n.visible));
});
