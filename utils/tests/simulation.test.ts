import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { stepRunnerProjectiles } from '../../src/projectiles.ts';
import {
  Simulation,
  DYNAMICS,
  MAX_LIVES,
  EXTRA_LIFE_SCORE,
  RUNNERS,
  AGGRESSION,
} from '../../src/simulation.ts';
test('dynamics constants match the disc scripts', async () => {
  const s = await readFile(
    new URL('../../private/original/game/RUN/DYNAMICS.GW', import.meta.url),
    'utf8',
  );
  const get = (n: string) =>
    Number(s.match(new RegExp('^' + n + String.raw`\s+([.0-9]+)`, 'm'))![1]);
  assert.equal(DYNAMICS.maxAcceleration, get('RunDynSetAccelMax'));
  assert.equal(DYNAMICS.turnDamping, get('RunDynSetTurnDamp'));
  assert.equal(DYNAMICS.nitroDuration, get('RunDynSetNitroDuration'));
  assert.equal(DYNAMICS.nitroRate, get('RunDynSetNitroMaxRate'));
});
test('simulation is deterministic for identical timed inputs and seeds', () => {
  const a = new Simulation({ seed: 42 }),
    b = new Simulation({ seed: 42 });
  for (let i = 0; i < 1200; i++) {
    const input = {
      throttle: i < 800 ? 1 : 0,
      steer: i > 400 ? 0.2 : 0,
      fire: i % 3 === 0,
      jump: i === 200,
    };
    a.step(1 / 60, input);
    b.step(1 / 60, input);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.ok(Number.isFinite(a.runners[0].x));
});
test('nanoshield prevents weapon damage then expires', () => {
  const s = new Simulation();
  s.countdown = 0;
  const r = s.runners[0];
  r.shield = 1;
  s.damage(r, 50, 1);
  assert.equal(r.health, 100);
  for (let i = 0; i < 61; i++) {
    s.step(1 / 60);
  }
  s.damage(r, 50, 1);
  assert.ok(Math.abs(r.health - 79.3) < 0.001);
});
test('extra life credits obey the documented score interval and cap', () => {
  const s = new Simulation();
  s.lives = 6;
  s.addScore(EXTRA_LIFE_SCORE);
  assert.equal(s.lives, MAX_LIVES);
  s.addScore(EXTRA_LIFE_SCORE * 10);
  assert.equal(s.lives, MAX_LIVES);
});
test('escape requires quota, ground height and the original central radius', () => {
  const s = new Simulation();
  s.countdown = 0;
  const p = s.runners[0];
  p.kills = s.requiredKills;
  p.x = 300;
  p.z = 300;
  s.step(1 / 60);
  assert.equal(s.phase, 'running');
  p.z = 0;
  p.x = p.z;
  p.y = 10;
  s.step(1 / 60);
  assert.equal(s.phase, 'running');
  p.y = 0;
  p.vy = 0;
  s.step(1 / 60);
  assert.equal(s.phase, 'exiting');
  for (let i = 0; i < 360; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.phase, 'roundcomplete');
});
test('eight domains, runners and AI path graphs decode to finite data', async () => {
  const paths = JSON.parse(
    await readFile(
      new URL('../../private/assets/ai-paths.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(paths.length, 8);
  for (let i = 1; i <= 8; i++) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const data = JSON.parse(
      await readFile(
        new URL(`../../private/assets/models/arena${i}.json`, import.meta.url),
        'utf8',
      ),
    );
    // oxlint-enable no-await-in-loop
    assert.ok(data.meshes.length > 1000);
    assert.ok(paths[i - 1].length > 50);
    const ids = new Set(paths[i - 1].map((n: { id: any }) => n.id));
    for (const n of paths[i - 1]) {
      for (const id of n.links) {
        assert.ok(id < 0 || ids.has(id));
      }
    }
    for (const m of data.meshes) {
      for (const v of m.v) {
        assert.ok(v.every((itemValue: unknown) => Number.isFinite(itemValue)));
      }
    }
  }
  assert.equal(RUNNERS.length, 8);
  assert.equal(AGGRESSION.length, 8);
});
test('runner, quota and combat values match original executable tables', async () => {
  const { GAME_TABLES } = await import('../../src/game-tables.ts');
  const exe = await readFile(
    new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
  );
  const at = (va: number) => va - 0x48_00_00 + 0x6_8e_00;
  for (let i = 0; i < 8; i++) {
    assert.equal(
      GAME_TABLES.runners[i].maxSpeed,
      exe.readFloatLE(at(0x48_dc_d8) + i * 4),
    );
    assert.equal(
      GAME_TABLES.runners[i].maxTurnDegrees,
      exe.readFloatLE(at(0x48_dc_f8) + i * 4),
    );
    for (let r = 0; r < 3; r++) {
      assert.equal(
        new Simulation({ arena: i + 1, round: r + 1 }).requiredKills,
        exe.readUInt32LE(at(0x48_db_b4) + (i * 3 + r) * 4),
      );
    }
  }
  assert.equal(GAME_TABLES.combat.laserDamage, 4);
  assert.equal(GAME_TABLES.combat.missileDamage, 140);
  const control = Object.fromEntries(
    GAME_TABLES.controls.map((c) => [c.action, c.virtualKey]),
  );
  assert.equal(control.Fire, 18);
  assert.equal(control.Barrier, 17);
  assert.equal(control['Tgl Weapon'], 16);
  assert.equal(control['View Back'], 65);
});
test('secondary weapons occupy three ordered slots and consumption returns to laser', () => {
  const s = new Simulation(),
    r = s.runners[0];
  s.collect(r, { type: 'enh_lock.gam' });
  s.collect(r, { type: 'enh_shok.gam' });
  assert.deepEqual(r.weapons, [null, 'Missile', 'ShockWave']);
  assert.equal(r.weapon, null);
  s.cycleWeapon(r);
  assert.equal(r.weapon, 'Missile');
  r.fire = 0;
  s.secondary(r);
  stepRunnerProjectiles(s, r, 1 / 60);
  assert.deepEqual(r.weapons, [null, 'ShockWave']);
  assert.equal(r.weapon, null);
  s.cycleWeapon(r);
  assert.equal(r.weapon, 'ShockWave');
});
test('three matching weapons award the original bonus and a full inventory leaves pickups', () => {
  const s = new Simulation(),
    r = s.runners[0];
  for (let i = 0; i < 3; i++) {
    assert.equal(s.collect(r, { type: 'enh_lock.gam' }), true);
  }
  assert.equal(s.score, 2000);
  assert.deepEqual(r.weapons, [null, 'Missile', 'Missile', 'Missile']);
  const pickup = { type: 'enh_ntro.gam', cooldown: 0 };
  assert.equal(s.collect(r, pickup), false);
  assert.equal(pickup.cooldown, 0);
  s.cycleWeapon(r);
  s.secondary(r);
  stepRunnerProjectiles(s, r, 1 / 60);
  assert.equal(r.weapons.length, 3);
  assert.equal(r.weapon, null);
});
test('the third death exhausts the three original runner credits', () => {
  const s = new Simulation(),
    r = s.runners[0];
  s.countdown = 0;
  s.ai = () => ({});
  for (let i = 2; i >= 0; i--) {
    r.shield = 0;
    s.damage(r, 10_000, 1);
    s.checkRunnerHealth(r);
    assert.equal(s.lives, i + 1);
    assert.equal(s.phase, 'running');
    for (let frame = 0; frame < 151; frame++) {
      s.step(1 / 60);
    }
    assert.equal(s.lives, i);
    assert.equal(s.phase, i ? 'running' : 'gameover');
    if (i) {
      s.spawn(r);
    }
  }
});
test('one score update crossing several thresholds grants only one life', () => {
  const s = new Simulation();
  s.lives = 1;
  s.addScore(60_000);
  assert.equal(s.lives, 2);
  s.addScore(-100_000);
  assert.equal(s.score, 0);
});
test('disc spawn headings drive outward from the central platform', () => {
  const s = new Simulation({ ground: () => 10 });
  s.countdown = 0;
  const p = s.runners[0],
    before = Math.hypot(p.x, p.z);
  for (let i = 0; i < 60; i++) {
    s.step(1 / 60, { throttle: 1 });
  }
  assert.ok(Math.hypot(p.x, p.z) > before + 20);
  assert.ok(p.x > 9.2 && p.z < -3.82);
});
test('native Fire and Jump inputs rearm only after release', () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  const p = s.runners[0];
  p.y = 0;
  let shots = 0,
    jumps = 0;
  for (let i = 0; i < 120; i++) {
    s.step(1 / 60, { fire: true, jump: true });
    shots += s.events.filter((e) => e.type === 'shot' && e.runner === 0).length;
    jumps += s.events.filter((e) => e.type === 'jump' && e.runner === 0).length;
  }
  assert.equal(shots, 1);
  assert.equal(jumps, 1);
  s.step(1 / 60, {});
  s.step(1 / 60, { fire: true, jump: true });
  assert.equal(
    s.events.filter((e) => e.type === 'shot' && e.runner === 0).length,
    1,
  );
  assert.equal(
    s.events.filter((e) => e.type === 'jump' && e.runner === 0).length,
    1,
  );
});
