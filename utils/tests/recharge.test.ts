import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { RechargeOrbs } from '../../src/recharge.ts';
import { Simulation } from '../../src/simulation.ts';

const paths = JSON.parse(
  await readFile(
    new URL('../../private/assets/recharge-paths.json', import.meta.url),
    'utf8',
  ),
);
test('all 32 original recharge routes decode and their round tables match the executable', async () => {
  const exe = await readFile(
    new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
  );
  assert.equal(paths.length, 8);
  for (let a = 0; a < 8; a++) {
    assert.equal(paths[a].length, 4);
    for (const path of paths[a]) {
      assert.ok(path.length >= 4);
      for (const v of path) {
        assert.ok(v.every((itemValue: unknown) => Number.isFinite(itemValue)));
      }
    }
    for (let r = 0; r < 3; r++) {
      const offset = 0x48_f6_2c - 0x48_00_00 + 0x6_8e_00 + (a * 3 + r) * 8;
      assert.deepEqual(GAME_TABLES.recharge.rounds[a][r], {
        count: exe.readUInt32LE(offset),
        speed: exe.readFloatLE(offset + 4),
      });
    }
  }
});
test('recharge orbs move at original speed and respawn on a free route after five seconds', () => {
  const system = new RechargeOrbs({ arena: 2, round: 2, paths: paths[1] });
  assert.equal(system.orbs.length, 3);
  const orb = system.orbs[0],
    before = { ...orb };
  system.step(0.1);
  assert.ok(
    Math.abs(Math.hypot(orb.x - before.x, orb.z - before.z) - 2.4) < 1e-8,
  );
  system.collect(orb);
  system.step(4.99);
  assert.ok(orb.cooldown > 0);
  system.step(0.02);
  assert.equal(orb.cooldown, 0);
  assert.equal(new Set(system.orbs.map((o) => o.path)).size, 3);
});
test('capturing an orb restores health and awards 500 points even when already healthy', () => {
  const s = new Simulation({ rechargePaths: paths[0] }),
    r = s.runners[0];
  s.countdown = 0;
  const orb = s.recharge.orbs[0];
  Object.assign(r, { x: orb.x, y: orb.y, z: orb.z, health: 10 });
  s.step(1 / 60);
  assert.equal(r.health, 100);
  assert.equal(r.keys, 1);
  assert.equal(s.score, 500);
  assert.equal(orb.cooldown, 5);
});
