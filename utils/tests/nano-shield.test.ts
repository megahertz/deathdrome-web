import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { NANO, activateShield, stepShield } from '../../src/nano-shield.ts';
import { Simulation, RUNNERS } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';
test('NanoShield timer and oscillator speed match the executable activation routine', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    code = (va: number) => va - 0x41_00_00 + 0x4_00;
  assert.equal(NANO.timer, exe.readFloatLE(code(0x44_06_43)));
  assert.equal(NANO.speed, exe.readFloatLE(code(0x44_05_a8)));
  assert.equal(NANO.minimumZ, exe.readFloatLE(code(0x44_05_d5)));
  assert.equal(exe.readUInt32LE(code(0x42_f9_2a)), 0x1_58);
  assert.equal(exe.readUInt32LE(code(0x44_07_3d)), 0x1_58);
});
test('NanoShield oscillates between native bounds and its two timer updates give 7.5 seconds', () => {
  const r = stateFixture<import('../../src/game-types.ts').Runner>({});
  activateShield(r);
  assert.equal(r.shield, NANO.timer / NANO.timerUpdatesPerFrame);
  assert.deepEqual(
    r.shieldPlanes!.map((p) => p.z),
    [-8, 0],
  );
  for (let i = 0; i < 60; i++) {
    stepShield(r, 1 / 60);
  }
  assert.ok(Math.abs(r.shield - 6.5) < 0.000001);
  for (const p of r.shieldPlanes!) {
    assert.ok(p.z >= -8 && p.z <= 1);
  }
  stepShield(r, 6.51);
  assert.equal(r.shield, 0);
  assert.equal(r.shieldPlanes, null);
});
test('NanoShield mounts use exported cockpit transforms for all original runners', async () => {
  for (const name of RUNNERS) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const model = JSON.parse(
      await readFile(
        new URL(
          '../../private/assets/models/' + name + '.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    // oxlint-enable no-await-in-loop
    assert.equal(model.attachments.cockpit.matrix.length, 16);
    assert.ok(
      model.attachments.cockpit.matrix.every((itemValue: unknown) =>
        Number.isFinite(itemValue),
      ),
    );
  }
});
test('runners spawn without an invented shield; a shield pickup blocks damage until expiry', () => {
  const s = new Simulation(),
    r = s.runners[0];
  s.countdown = 0;
  assert.equal(r.shield, 0);
  s.collect(r, { type: 'enh_nano.gam' });
  s.cycleWeapon(r);
  s.secondary(r);
  s.damage(r, 100, 1);
  assert.equal(r.health, 100);
  assert.ok(r.shieldPlanes);
  stepShield(r, 7.6);
  s.damage(r, 100, 1);
  assert.ok(r.health < 100);
});
