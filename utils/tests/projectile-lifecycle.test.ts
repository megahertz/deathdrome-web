import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { resetInventory } from '../../src/inventory.ts';
import {
  stepRunnerProjectiles,
  hideRunnerProjectiles,
  resetRunnerProjectiles,
} from '../../src/projectiles.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';

test('active actor, deactivation and pool reset match 234 original lifecycle samples', () => {
  const a = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/projectile-lifecycle-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  for (const [i, { slots, dt }] of a.fixtures.entries()) {
    const r = stateFixture<import('../../src/game-types.ts').Runner>({
        id: 1,
        dead: 0,
        weapon: null,
        weapons: [null],
      }),
      sim = stateFixture<import('../../src/simulation.ts').Simulation>({
        runners: [{}, r],
        projectiles: slots.map((p: { kind: string; age: number }) => ({
          ...p,
          owner: 1,
          x: 100,
          y: 10,
          z: 100,
          vx: -90,
          vy: 0,
          vz: -120,
          life: (p.kind === 'Missile' ? 4 : 1) - p.age,
          lifetime: p.kind === 'Missile' ? 4 : 1,
        })),
      });
    const snapshot = () => ({
      count: sim.projectiles.filter((p) => p.life > 0).length,
      slots: sim.projectiles
        .filter((p) => p.life > 0)
        .toSorted((start, b) => start.slot! - b.slot!)
        .map((p) => ({
          slot: p.slot,
          position: [p.x, p.y, p.z],
          age: p.age,
          visible: !p.hidden,
        })),
    });
    stepRunnerProjectiles(sim, r, dt);
    const samples = [snapshot()];
    r.dead = 2.5;
    hideRunnerProjectiles(sim, r);
    samples.push(snapshot());
    for (let j = 0; j < 10; j++) {
      stepRunnerProjectiles(sim, r, dt);
      samples.push(snapshot());
    }
    resetInventory(r);
    resetRunnerProjectiles(sim, r);
    samples.push(snapshot());
    assert.deepEqual(samples, a.native[i]);
  }
});
function controlled() {
  const s = new Simulation({
    ground: () => 0,
    blocked: () => false,
    wallContact: () => null,
  });
  s.countdown = 0;
  s.ai = () => ({});
  for (const r of s.runners) {
    r.dead = Infinity;
  }
  const r = s.runners[0];
  Object.assign(r, { dead: 0, x: 100, y: 10, z: 100, yaw: 0, speed: 0 });
  return { s, r };
}
test('destruction hides and freezes live shots until respawn setup releases the slots', () => {
  const { s, r } = controlled();
  r.weapons = [null, 'Missile'];
  r.selectedWeapon = 1;
  s.selectWeapon(r);
  s.secondary(r);
  s.step(1 / 60);
  const p = s.projectiles[0],
    pose = { x: p.x, y: p.y, z: p.z, age: p.age };
  assert.equal(p.hidden, false);
  s.damage(r, 10_000, 1);
  s.checkRunnerHealth(r);
  assert.equal(p.hidden, true);
  for (let i = 0; i < 100; i++) {
    s.step(1 / 60);
  }
  assert.deepEqual({ x: p.x, y: p.y, z: p.z, age: p.age }, pose);
  assert.ok(s.projectiles.includes(p));
  for (let i = 0; i < 110; i++) {
    s.step(1 / 60);
  }
  assert.equal(r.respawn, null);
  assert.equal(r.dead, 0);
  assert.equal(r.health, 100);
  assert.equal(s.lives, 2);
  assert.equal(s.projectiles.length, 0);
});
test('deactivation before the first slot action freezes pending shots without launch sounds', () => {
  const { s, r } = controlled();
  s.events = [];
  s.fire(r);
  s.damage(r, 10_000, 1);
  s.checkRunnerHealth(r);
  const shots = [...s.projectiles];
  let sounds = 0;
  for (let i = 0; i < 10; i++) {
    s.step(1 / 60);
    sounds += s.events.filter((e) => e.type === 'shot').length;
  }
  assert.equal(sounds, 0);
  assert.ok(
    shots.every(
      (p) => p.pending && p.hidden && p.x === undefined && p.age === 0,
    ),
  );
  s.spawn(r);
  assert.equal(s.projectiles.length, 0);
});
