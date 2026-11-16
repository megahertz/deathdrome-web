import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { CAMERA, ChaseCamera, updateLook } from '../../src/chase-camera.ts';
import { fixture as stateFixture } from './fixtures.ts';
test('chase camera source constants match native data', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x480000 + 0x68e00);
  assert.equal(CAMERA.restDistance, f(0x483fd0));
  assert.equal(CAMERA.distanceDamping, f(0x483fd4));
  assert.equal(CAMERA.lookStep, f(0x484069));
  assert.equal(CAMERA.lookHeight, f(0x484004));
});
test('look controls saturate at 120 degrees and return through native 14-degree steps', () => {
  const r = stateFixture<import('../../src/game-types.ts').Runner>({});
  for (let i = 0; i < 20; i++) {
    updateLook(r, true, false);
  }
  assert.equal(r.lookDegrees, 120);
  updateLook(r);
  assert.equal(r.lookDegrees, 106);
  for (let i = 0; i < 20; i++) {
    updateLook(r);
  }
  assert.equal(r.lookDegrees, 0);
  for (let i = 0; i < 20; i++) {
    updateLook(r, false, true);
  }
  assert.equal(r.lookDegrees, -120);
  updateLook(r, true, true);
  assert.equal(r.lookDegrees, 0);
});
test('native chase distance responds to speed and barrier generation; rear view uses cockpit offset', () => {
  const c = new ChaseCamera(),
    r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      turn: 0,
      vy: 0,
      floor: 0,
    });
  let p = c.follow(r, 1 / 60);
  assert.equal(p.z, 7);
  assert.equal(p.y, 3);
  r.speed = 75;
  for (let i = 0; i < 300; i++) {
    p = c.follow(r, 1 / 60);
  }
  assert.ok(Math.abs(p.z - 8.5) < 0.0001);
  for (let i = 0; i < 300; i++) {
    p = c.follow(r, 1 / 60, false, true);
  }
  assert.ok(Math.hypot(p.x, p.z) > 44.99);
  assert.ok(p.y > 7.99);
  p = c.follow(r, 1 / 60, true);
  assert.ok(Math.abs(p.z + 7.2) < 0.00001);
  assert.equal(p.y, 2.5);
  assert.equal(p.yaw, Math.PI);
});
test('render-only camera sampling does not advance native banking', () => {
  const c = new ChaseCamera(),
    r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 75,
      turn: 1,
      vy: 0,
      floor: 0,
    });
  const pose = c.follow(r, 1 / 60),
    { bank } = c;
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(c.follow(r, 0), pose);
  }
  assert.equal(c.bank, bank);
});
