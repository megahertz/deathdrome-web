import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { launchProjectiles } from '../../src/projectiles.ts';
import { Simulation } from '../../src/simulation.ts';
import {
  emitterMatrix,
  emitterOrigins,
  projectileForward,
} from '../../src/weapon-emitters.ts';
import { fixture as stateFixture } from './fixtures.ts';
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.00003, `${a} != ${b}`);
test('emitter matrices and endpoints match original x86 human/AI pose fixtures', () => {
  const audit = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/weapon-emitters-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  for (const [i, { r, human }] of audit.fixtures.entries()) {
    for (const [j, v] of emitterMatrix(r, human).entries()) {
      close(v, audit.native[i].matrix[j]);
    }
    for (const [j, p] of emitterOrigins(r, human).entries()) {
      for (const k of ['x', 'y', 'z']) {
        close(p[k as keyof typeof p], audit.native[i].origins[j][k]);
      }
    }
  }
});
test('human cockpit lean moves the paired emitters while AI uses its reduced chassis frame', () => {
  const r = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      turn: (200 * Math.PI) / 180,
    }),
    human = emitterOrigins(r, true),
    ai = emitterOrigins(r, false);
  close(ai[0].y, 0.974);
  close(ai[0].z, -6.607);
  assert.ok(human[0].y < ai[0].y);
  assert.ok(human[1].y > ai[1].y);
  assert.deepEqual(emitterOrigins({ ...r, turn: -r.turn }, false), ai);
});
test('missiles launch along the physical forward vector without changing the next laser side', () => {
  const s = new Simulation(),
    r = s.runners[s.player];
  Object.assign(r, {
    x: 100,
    y: 20,
    z: 100,
    yaw: 0,
    speed: -40,
    muzzleSide: 1,
    forwardVector: { x: 0.6, y: 0.8, z: 0 },
  });
  launchProjectiles(s, r, true);
  const p = s.projectiles[0];
  close(p.x, 107.02);
  close(p.y, 29.36);
  close(p.z, 100);
  assert.equal(p.speed, 110);
  assert.equal(r.muzzleSide, 1);
  assert.equal(p.dy, Math.fround(0.8));
  launchProjectiles(s, r);
  close(s.projectiles[1].x, 98.991);
  assert.equal(s.projectiles[1].speed, 150);
  assert.equal(r.muzzleSide, 1);
});
test('projectile forward follows chassis pitch independently of cockpit lean', () => {
  const a = projectileForward(
      stateFixture<import('../../src/game-types.ts').Runner>({
        yaw: Math.PI / 2,
        chassisPitchDegrees: 30,
        turn: 5,
      }),
    ),
    b = projectileForward(
      stateFixture<import('../../src/game-types.ts').Runner>({
        yaw: Math.PI / 2,
        chassisPitchDegrees: 30,
        turn: -5,
      }),
    );
  assert.deepEqual(a, b);
  close(a.x, -Math.sqrt(3) / 2);
  close(a.y, 0.5);
  close(a.z, 0);
});
