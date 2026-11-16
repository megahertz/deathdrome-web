import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { POPULATION, initialActiveModels } from '../../src/population.ts';
import { Simulation } from '../../src/simulation.ts';

test('single-player population reset matches native default and pruning instructions', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    data = (va: number) => va - 0x480000 + 0x68e00,
    code = (va: number) => va - 0x410000 + 0x400;
  assert.equal(POPULATION.initialCount, exe.readUInt32LE(data(0x48d8ac)));
  assert.equal(POPULATION.initialCount, exe.readUInt32LE(code(0x4187d6)));
  assert.equal(POPULATION.initialCount, 5);
  assert.ok(
    exe
      .subarray(code(0x434580), code(0x4345f6))
      .includes(Buffer.from([0x8d, 0x5a, 0xff])),
    'pruning begins at the last loaded model',
  );
});
test('all human vehicle selections keep their native spawn slot while high opponents are inactive', () => {
  for (let player = 0; player < 8; player++) {
    const s = new Simulation({ player }),
      active = s.runners.filter((r) => !r.dead).map((r) => r.id),
      expected = [0, 1, 2, 3, 4];
    if (player > 4) {
      expected[4] = player;
    }
    assert.deepEqual(active, expected);
    assert.deepEqual(initialActiveModels(player), expected);
    assert.equal(s.runners[player].inactive, false);
    for (const r of s.runners) {
      if (!expected.includes(r.id)) {
        assert.equal(r.inactive, true);
        assert.equal(r.dead, Infinity);
        assert.equal(r.navigation, null);
      }
    }
    assert.equal(
      s.runners[player].model,
      [
        'redrunr',
        'blurunr',
        'ylwrunr',
        'whtrunr',
        'prprunr',
        'grnrunr',
        'pnkrunr',
        'orgrunr',
      ][player],
    );
  }
  assert.deepEqual(initialActiveModels(7, 1), [7]);
  assert.deepEqual(initialActiveModels(3, 8), [0, 1, 2, 3, 4, 5, 6, 7]);
});
test('AI destruction materializes the next inactive model after the native delay and preserves its old wreck', () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  const victim = s.runners[1];
  Object.assign(victim, { x: 100, y: 0, z: 100 });
  s.damage(victim, 10000, s.player);
  s.checkRunnerHealth(victim);
  const wreck = s.wrecks.states[1];
  for (let i = 0; i < 149; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.runners[5].inactive, true);
  s.step(1 / 60);
  s.step(1 / 60);
  assert.equal(victim.inactive, true);
  assert.equal(victim.dead, Infinity);
  assert.equal(s.runners[5].inactive, false);
  assert.ok(s.runners[5].respawn);
  assert.equal(s.wrecks.states[1], wreck);
  assert.equal(wreck.x, 100);
  assert.equal(wreck.z, 100);
  assert.equal(s.runners.filter((r) => !r.dead).length, 4);
  for (let i = 0; i < 50; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.runners[5].respawn, null);
  assert.equal(s.runners[5].health, 100);
  assert.equal(s.runners.filter((r) => !r.dead).length, 5);
  assert.ok(s.population.cursor === 5);
  assert.equal(s.runners[0].kills, 1);
});
test('replacement cursor scans cyclically, preserves the human and ignores a live diagnostic pose', () => {
  const s = new Simulation({ player: 7 });
  assert.equal(s.population.nextInactive()!.id, 5);
  s.spawn(s.runners[5]);
  assert.equal(s.population.nextInactive()!.id, 6);
  s.spawn(s.runners[6]);
  assert.equal(s.population.nextInactive()!.id, 4);
  s.spawn(s.runners[4]);
  assert.equal(s.population.nextInactive(), null);
  s.population.retire(s.runners[1]);
  s.population.retire(s.runners[2]);
  s.population.cursor = 7;
  assert.equal(s.population.nextInactive()!.id, 1);
  s.runners[1].dead = 0;
  assert.equal(s.population.nextInactive()!.id, 2);
});
test('replacement uses the first deficient route rather than initial round-priority allocation', async () => {
  const paths = JSON.parse(
      (
        await readFile(
          new URL('../../private/assets/ai-paths.json', import.meta.url),
        )
      ).toString(),
    ),
    s = new Simulation({ arena: 1, round: 3, paths: paths[0] });
  assert.deepEqual(s.aiRouteCounts, [0, 0, 0, 2, 2]);
  const r = s.runners[1],
    next = s.population.replace(r);
  assert.equal(next!.id, 5);
  assert.equal(next!.respawn!.routeIndex, 1);
  assert.equal(next!.navigation, null);
  assert.deepEqual(s.aiRouteCounts, [0, 1, 0, 1, 2]);
});
test('the selected human respawns in the same model rather than joining the AI replacement pool', () => {
  const s = new Simulation({ player: 7 });
  s.countdown = 0;
  s.ai = () => ({});
  const p = s.runners[7];
  s.damage(p, 10000, 0);
  s.checkRunnerHealth(p);
  for (let i = 0; i < 151; i++) {
    s.step(1 / 60);
  }
  assert.ok(p.respawn);
  assert.equal(p.inactive, false);
  for (let i = 0; i < 50; i++) {
    s.step(1 / 60);
  }
  assert.equal(p.dead, 0);
  assert.equal(p.health, 100);
  assert.equal(s.population.cursor, 5);
  assert.equal(s.lives, 2);
});
