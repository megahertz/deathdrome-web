import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  SECONDARY,
  acquireIonTarget,
  stepSecondaryProjectile,
  stepIon,
} from '../../src/secondary.ts';
import { Simulation } from '../../src/simulation.ts';
const setup = () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  for (const r of s.runners) {
    Object.assign(r, { x: 500 + r.id * 10, y: 0, z: 500, shield: 0 });
  }
  Object.assign(s.runners[0], { x: 100, z: 100, yaw: 0 });
  return s;
};
const equip = (s: Simulation, type: string) => {
  const r = s.runners[0];
  s.collect(r, { type });
  s.cycleWeapon(r);
  r.fire = 0;
  s.secondary(r);
};
test('secondary weapon constants are read from the original executable', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x48_00_00 + 0x6_8e_00);
  assert.equal(SECONDARY.shockWave.growth, f(0x48_0d_93));
  assert.equal(SECONDARY.shockWave.verticalBand, f(0x48_0d_8b));
  assert.equal(SECONDARY.disruptor.baseSpeed, f(0x48_57_74));
  assert.equal(SECONDARY.disruptor.growth, f(0x48_57_78));
  assert.equal(SECONDARY.disruptor.launchDistance, f(0x48_57_7c));
  assert.equal(SECONDARY.ionSword.damagePerSecond, -f(0x48_57_9c));
  assert.equal(SECONDARY.ionSword.verticalBand, f(0x48_57_90));
});
test('shockwave expands over time, rejects vertical separation, and preserves shield contact scoring', () => {
  const s = setup(),
    p = s.runners[0];
  Object.assign(s.runners[1], { x: 150, z: 100, shield: 8 });
  Object.assign(s.runners[2], { x: 150, z: 100 });
  Object.assign(s.runners[3], { x: 150, y: 0.251, z: 100 });
  equip(s, 'enh_shok.gam');
  const wave = s.projectiles[0];
  assert.equal(p.kills, 0);
  assert.equal(p.weapon, null);
  stepSecondaryProjectile(s, wave, 0.1);
  assert.equal(s.runners[2].health, 100);
  stepSecondaryProjectile(s, wave, 0.2);
  assert.equal(s.runners[1].health, 100);
  assert.equal(s.runners[2].health, 0);
  assert.equal(s.runners[3].health, 100);
  assert.equal(p.kills, 1);
  assert.equal(s.score, 1000);
  s.checkRunnerHealth(s.runners[2]);
  stepSecondaryProjectile(s, wave, 0.2);
  assert.equal(s.score, 1500);
  assert.equal(wave.scale, 30);
  stepSecondaryProjectile(s, wave, 0.51);
  assert.ok(wave.life <= 0);
});
test('an active Disruptor rejects another launch without consuming the second slot', () => {
  const s = setup(),
    r = s.runners[0];
  s.collect(r, { type: 'enh_disr.gam' });
  s.collect(r, { type: 'enh_disr.gam' });
  s.cycleWeapon(r);
  s.secondary(r);
  const projectile = s.projectiles[0];
  assert.equal(projectile.z, 87);
  assert.equal(projectile.speed, 50);
  assert.deepEqual(r.weapons, [null, 'Disruptor']);
  r.fire = 0;
  s.cycleWeapon(r);
  s.secondary(r);
  assert.equal(s.projectiles.length, 1);
  assert.deepEqual(r.weapons, [null, 'Disruptor']);
});
test('Disruptor grows, crosses walls and disables an unshielded runner once for eight seconds', () => {
  const s = setup();
  s.blocked = () => true;
  Object.assign(s.runners[1], { x: 100, z: 62 });
  Object.assign(s.runners[2], { x: 100, z: 62, shield: 5 });
  equip(s, 'enh_disr.gam');
  const p = s.projectiles[0];
  stepSecondaryProjectile(s, p, 0.5);
  assert.equal(p.z, 62);
  assert.equal(p.scale, 13.5);
  assert.equal(s.runners[1].disrupted, 8);
  assert.equal(s.runners[2].disrupted, 0);
  assert.equal(s.score, 500);
  stepSecondaryProjectile(s, p, 0.01);
  assert.equal(s.score, 500);
  assert.ok(p.life > 0);
});
test('Ion Sword selects a forward target, drains without armor, scores a kill and expires', () => {
  const s = setup(),
    r = s.runners[0],
    q = s.runners[1];
  Object.assign(q, { x: 100, z: 50, health: 30 });
  Object.assign(s.runners[2], { x: 100, z: 125 });
  Object.assign(s.runners[3], { x: 100, y: 11, z: 90 });
  assert.equal(acquireIonTarget(s, r), 1);
  equip(s, 'enh_ion.gam');
  stepIon(s, r, 0.5);
  assert.ok(Math.abs(q.health - 16.25) < 0.00001);
  assert.equal(r.ionTarget, 1);
  assert.equal(s.score, 0);
  stepIon(s, r, 0.6);
  assert.equal(q.health, 0);
  assert.equal(r.kills, 1);
  assert.equal(s.score, 600);
  assert.equal(r.ionTarget, null);
  stepIon(s, r, 3);
  assert.equal(r.ionSeconds, 0);
});
test('Ion Sword keeps an acquired target beyond acquisition range but releases it behind the runner', () => {
  const s = setup(),
    r = s.runners[0],
    q = s.runners[1];
  Object.assign(q, { x: 100, z: 50 });
  equip(s, 'enh_ion.gam');
  stepIon(s, r, 0.01);
  q.z = -200;
  stepIon(s, r, 0.01);
  assert.equal(r.ionTarget, 1);
  q.z = 150;
  stepIon(s, r, 0.01);
  assert.equal(r.ionTarget, null);
});
