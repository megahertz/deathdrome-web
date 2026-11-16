import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  launchProjectiles,
  stepProjectileMotion,
} from '../../src/projectiles.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';
test('unsteered projectile trajectories and expiry match original x86 action samples', () => {
  const a = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/projectile-motion-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  a.fixtures.forEach(({ r, missile, dt }: any, i: number) => {
    r = { ...r };
    const sim = stateFixture<import('../../src/simulation.ts').Simulation>({
      player: 0,
      runners: [r],
      projectiles: Array.from({ length: 11 }, () =>
        stateFixture<import('../../src/game-types.ts').Projectile>({
          owner: 0,
          kind: 'Laser',
          life: 1,
        }),
      ),
      emit() {},
    });
    launchProjectiles(sim, r, missile);
    const p = sim.projectiles.at(-1);
    for (const sample of a.native[i]) {
      stepProjectileMotion(
        p as unknown as import('../../src/game-types.ts').Projectile,
        dt,
      );
      assert.deepEqual([p!.x, p!.y, p!.z], sample.position);
      assert.deepEqual([p!.vx, p!.vy, p!.vz], sample.velocity);
      assert.equal(p!.life > 0, sample.active);
      if (sample.active) {
        assert.equal(p!.age, sample.age);
      }
    }
  });
});
test('native float age keeps a 60 Hz laser alive for sixty updates and expires on update sixty-one', () => {
  const p = stateFixture<import('../../src/game-types.ts').Projectile>({
    kind: 'Laser',
    x: 0,
    y: 10,
    z: 0,
    dx: 0,
    dy: 0,
    dz: -1,
    speed: 150,
    age: 0,
    life: 1,
  });
  for (let i = 0; i < 60; i++) {
    stepProjectileMotion(p, 1 / 60);
  }
  assert.ok(p.life > 0);
  assert.equal(p.z, -150.00001525878906);
  stepProjectileMotion(p, 1 / 60);
  assert.equal(p.life, 0);
  assert.equal(p.z, -152.50001525878906);
});
test('projectiles terminate outside the native zero-to-sixty-four vertical band', () => {
  for (const [y, dy] of [
    [0, -1],
    [64, 1],
  ]) {
    const p = stateFixture<import('../../src/game-types.ts').Projectile>({
      kind: 'Laser',
      x: 0,
      y,
      z: 0,
      dx: 0,
      dy,
      dz: 0,
      speed: 150,
      life: 1,
    });
    stepProjectileMotion(p, 1 / 60);
    assert.equal(p.life, 0);
  }
  for (const y of [0, 64]) {
    const p = stateFixture<import('../../src/game-types.ts').Projectile>({
      kind: 'Laser',
      x: 0,
      y,
      z: 0,
      dx: 0,
      dy: 0,
      dz: -1,
      speed: 150,
      life: 1,
    });
    stepProjectileMotion(p, 1 / 60);
    assert.ok(p.life > 0);
  }
});
test('the launch update preserves missile direction and later updates begin steering', () => {
  const s = new Simulation({
    ground: () => 0,
    blocked: () => false,
    wallContact: () => null,
  });
  s.countdown = 0;
  s.ai = () => ({});
  s.runners.forEach((r) => (r.dead = Infinity));
  const r = s.runners[s.player],
    q = s.runners[(s.player + 1) % 8];
  Object.assign(r, {
    dead: 0,
    x: 100,
    y: 10,
    z: 100,
    yaw: 0,
    speed: 0,
    weapon: 'Missile',
  });
  Object.assign(q, { dead: 0, x: 100, y: 30, z: -100 });
  launchProjectiles(s, r, true);
  const p = s.projectiles[0];
  assert.equal(p.target, q.id);
  s.step(1 / 60);
  assert.equal(p.dy, 0);
  assert.equal(p.y, 10);
  s.step(1 / 60);
  assert.ok(p.dy > 0);
  assert.ok(p.y > 10);
});
