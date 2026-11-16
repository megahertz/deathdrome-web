import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { inventoryCells } from '../../src/inventory.ts';
import { Simulation } from '../../src/simulation.ts';

test('production runner order matches 2048 native phase/inventory events across 96 cases', () => {
  const a = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/runner-schedule-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  a.fixtures.forEach(
    (f: { player: any; mask: number; pattern: number; dt: any }, i: number) => {
      const events: Record<string, unknown>[] = [];
      let sim: Simulation;
      const capture = (
        phase: string,
        r: import('../../src/game-types.ts').Runner,
      ) =>
        events.push({
          phase,
          runner: r.id,
          count: sim.projectiles.filter(
            (p: { owner: any; kind: string; life: number }) =>
              p.owner === r.id &&
              (p.kind === 'Laser' || p.kind === 'Missile') &&
              p.life > 0,
          ).length,
          inventory: [...inventoryCells(r)],
          selected: r.selectedWeapon,
          items: r.weapons.length,
        });
      sim = new Simulation({
        player: f.player,
        maximumRunners: 8,
        ground: () => 0,
        blocked: () => false,
        wallContact(r: any) {
          capture('physics', r);
          return null;
        },
      });
      sim.countdown = 0;
      sim.ai = () => ({ fire: true });
      sim.projectileContact = () => {};
      sim.runners.forEach((r: { id: number }) => {
        Object.assign(r, {
          dead: f.mask & (1 << r.id) ? 0 : Infinity,
          inactive: !(f.mask & (1 << r.id)),
          x: 100 + r.id * 30,
          y: 0,
          z: 100,
          yaw: Math.PI / 4,
          speed: 0,
          weapons: [null, 'Missile', 'Ion Sword', 'NanoShield'],
          weaponCells: [4, 1, 5, 6],
          selectedWeapon: (r.id + f.pattern) % 2,
        });
        sim.selectWeapon(
          r as unknown as import('../../src/game-types.ts').Runner,
        );
      });
      const fire = sim.fire.bind(sim),
        weapons = sim.stepRunnerWeapons.bind(sim);
      sim.fire = (r: any, m: any) => {
        capture('fire', r);
        return fire(r, m);
      };
      sim.stepRunnerWeapons = (
        r: { dead: any; inactive: any; respawn: any },
        dt: any,
      ) => {
        if (!r.dead && !r.inactive && !r.respawn) {
          capture(
            'weapons',
            r as unknown as import('../../src/game-types.ts').Runner,
          );
          weapons(r as unknown as import('../../src/game-types.ts').Runner, dt);
          capture(
            'after',
            r as unknown as import('../../src/game-types.ts').Runner,
          );
        }
      };
      sim.step(f.dt, { fire: true });
      assert.deepEqual(events, a.native[i]);
    },
  );
});
test('each owner scans and contacts targets at their model-order position in the frame', () => {
  for (let player = 0; player < 8; player++) {
    const s = new Simulation({
      player,
      ground: () => 0,
      blocked: () => false,
      wallContact: () => null,
    });
    s.countdown = 0;
    s.ai = () => ({ throttle: 1 });
    s.runners.forEach((r) => (r.dead = Infinity));
    const r = s.runners[player],
      q = s.runners[(player + 1) % 8];
    Object.assign(r, {
      dead: 0,
      inactive: false,
      x: 100,
      y: 0,
      z: 100,
      yaw: 0,
      speed: 0,
      weapons: [null, 'Missile'],
      selectedWeapon: 1,
    });
    Object.assign(q, {
      dead: 0,
      inactive: false,
      x: 110,
      y: 0,
      z: 99.5,
      yaw: Math.PI,
      speed: 75,
    });
    s.selectWeapon(r);
    let observed;
    s.projectileContact = (p) => {
      if (p.owner === player) {
        observed = q.z;
      }
    };
    s.step(1 / 60, { fire: true });
    assert.ok(q.z > 100);
    assert.equal(s.projectiles[0].target, q.id > player ? q.id : null);
    assert.equal(observed, q.id > player ? 99.5 : q.z);
  }
});
test('human Nitro input affects acceleration during the same physical update', () => {
  const s = new Simulation({
    ground: () => 0,
    blocked: () => false,
    wallContact: () => null,
  });
  s.countdown = 0;
  s.ai = () => ({});
  s.runners.forEach((r) => (r.dead = Infinity));
  const r = s.runners[0];
  Object.assign(r, {
    dead: 0,
    inactive: false,
    x: 100,
    y: 0,
    z: 100,
    floor: 0,
    yaw: 0,
    speed: 0,
    weapons: [null, 'Nitro Ram'],
    selectedWeapon: 1,
  });
  s.selectWeapon(r);
  s.step(1 / 60, { throttle: 1, fire: true });
  assert.equal(r.acceleration, 350);
  assert.ok(r.speed > 5.8);
  assert.ok(r.z < 100);
  assert.equal(r.weapon, null);
});
