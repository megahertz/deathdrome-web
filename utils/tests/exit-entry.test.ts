import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { inventoryCells } from '../../src/inventory.ts';
import { Simulation } from '../../src/simulation.ts';

// Historical native fixture supplies no-op physics; its timer branch is excluded.
function fixture(f: {
  dt: any;
  human?: any;
  health?: any;
  variant?: any;
  time?: any;
  kills?: any;
}) {
  const sim = new Simulation({
      ground: () => 0,
      blocked: () => false,
      wallContact: () => null,
    }),
    subject = f.human ? 0 : 1,
    r = sim.runners[subject];
  sim.stepRunnerControlDisable = () => {};
  sim.countdown = 0;
  sim.ai = () => ({});
  sim.projectileContact = () => {};
  sim.population.nextInactive = () => null;
  sim.runners.forEach((actor) => (actor.dead = Infinity));
  for (let i = 0; i < 2; i++) {
    Object.assign(sim.runners[i], {
      dead: 0,
      inactive: false,
      x: i === subject ? 0 : 200,
      y: 0,
      z: i === subject ? 0 : 200,
      yaw: 0,
      speed: 0,
      kills: i === subject ? f.kills : 0,
      health: 100,
    });
  }
  sim.time = f.time + f.dt;
  sim.requiredKills = 2;
  if (f.variant !== 'none') {
    const missile = f.variant.includes('Missile');
    if (missile) {
      r.weapons = [null, 'Missile'];
      r.selectedWeapon = 1;
      sim.selectWeapon(r);
      sim.secondary(r);
    } else {
      sim.fire(r);
    }
    if (f.variant.startsWith('initialized') || f.variant === 'expiringLaser') {
      sim.stepRunnerWeapons(r, f.dt);
    }
    if (f.variant === 'expiringLaser') {
      for (const p of sim.projectiles) {
        p.age = Math.fround(0.999);
        p.life = 1 - p.age;
      }
    }
  }
  r.health = f.health;
  const sounds: any[] = [],
    emit = sim.emit.bind(sim);
  sim.emit = (type, data) => {
    if (type === 'shot') {
      sounds.push((data as { soundId: number }).soundId);
    }
    emit(type, data);
  };
  sim.events = [];
  const snapshot = () => ({
    health: r.health,
    active: sim.runners.slice(0, 2).map((q) => !q.dead && !q.inactive),
    controls: sim.runners.slice(0, 2).map((q) => q.controlsEnabled !== false),
    mode: sim.escape?.runner === subject || r.opponentExit ? 4 : 1,
    cells: [...inventoryCells(r)],
    items: r.weapons.length,
    selected: r.selectedWeapon,
    count: sim.projectiles.filter((p) => p.owner === subject && p.life > 0)
      .length,
    slots: sim.projectiles
      .filter((p) => p.owner === subject && p.life > 0)
      .sort((a, b) => a.slot! - b.slot!)
      .map((p) => ({
        slot: p.slot,
        kind: p.weaponId,
        age: p.age,
        visible: !p.pending && !p.hidden,
      })),
    sounds: [...sounds],
    entered: !!sim.escape || !!r.opponentExit,
    deaths: sim.events.filter(
      (e) => e.type === 'destroyed' && e.runner === subject,
    ).length,
  });
  return { sim, r, snapshot };
}
test('exit eligibility/entry and final primary pass match 288 original actor callbacks', () => {
  const a = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/exit-entry-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  a.fixtures.forEach((f: { dt: number }, i: number) => {
    const { sim, snapshot } = fixture(f),
      before = snapshot();
    sim.step(f.dt);
    assert.deepEqual({ before, after: snapshot() }, a.native[i]);
  });
});
test('the exit actor can consume and initialize a last missile, which then remains frozen', () => {
  const f = {
      human: true,
      health: 0,
      variant: 'pendingMissile',
      time: 35,
      kills: 2,
      dt: 1 / 60,
    },
    { sim, r } = fixture(f);
  sim.step(f.dt);
  assert.equal(sim.phase, 'exiting');
  assert.equal(r.health, Math.fround(0.9));
  assert.equal(r.pendingDeath, null);
  assert.equal(r.inactive, true);
  assert.deepEqual(r.weapons, [null]);
  assert.equal(sim.projectiles.length, 1);
  const p = sim.projectiles[0],
    pose = { x: p.x, y: p.y, z: p.z, age: p.age };
  assert.equal(p.pending, false);
  assert.equal(p.hidden, false);
  for (let i = 0; i < 120; i++) {
    sim.step(f.dt);
  }
  assert.deepEqual({ x: p.x, y: p.y, z: p.z, age: p.age }, pose);
  assert.equal(sim.lives, 3);
});
test('disabled AI controls damp stored motion and block new weapons until restoration', () => {
  const s = new Simulation({
    ground: () => 0,
    blocked: () => false,
    wallContact: () => null,
  });
  s.countdown = 0;
  s.runners.forEach((r) => (r.dead = Infinity));
  const r = s.runners[1];
  Object.assign(r, {
    dead: 0,
    inactive: false,
    controlsEnabled: false,
    disableTimer: 2,
    movementEnabled: true,
    x: 100,
    y: 0,
    z: 100,
    floor: 0,
    yaw: 0,
    speed: 30,
    acceleration: 20,
  });
  let called = 0;
  s.ai = () => {
    called++;
    return { throttle: -1 };
  };
  assert.equal(s.fire(r), false);
  s.step(1 / 60);
  assert.equal(called, 0);
  assert.ok(r.z < 100);
  assert.equal(r.speed, 30);
  s.spawn(r);
  assert.equal(r.controlsEnabled, true);
});
