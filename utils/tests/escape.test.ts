import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ESCAPE, beginEscape } from '../../src/escape.ts';
import { Simulation } from '../../src/simulation.ts';
test('exit fold and rise constants match native source data', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x48_00_00 + 0x6_8e_00);
  assert.equal(ESCAPE.foldSeconds, f(0x48_4e_00));
  assert.equal(ESCAPE.foldDegreesPerSecond, f(0x48_4e_04));
  assert.equal(ESCAPE.riseSpeed, f(0x48_4d_eb));
});
test('escape centers the runner, folds, rises and completes only after the sequence', () => {
  const s = new Simulation(),
    r = s.runners[0];
  Object.assign(r, { x: 12, y: 0, z: 5 });
  beginEscape(s, r);
  const { time } = s;
  for (let i = 0; i < 16; i++) {
    s.step(1 / 60, { throttle: 1, fire: true });
  }
  assert.equal(s.escape!.phase, 'center');
  assert.equal(r.x, 12);
  for (let i = 0; i < 61; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.escape!.phase, 'fold');
  assert.equal(r.x, 0);
  assert.equal(r.z, 0);
  assert.equal(s.phase, 'exiting');
  for (let i = 0; i < 157; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.escape!.phase, 'rise');
  assert.ok(s.escape!.foldDegrees > 89);
  assert.equal(r.y, 0);
  for (let i = 0; i < 121; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.phase, 'roundcomplete');
  assert.ok(Math.abs(r.y - 181.50001525878906) < 0.000001);
  assert.ok(Math.abs(s.time - (time - 355 / 60)) < 0.00001);
  assert.equal(s.projectiles.length, 0);
});
test('single-player results add native kill and remaining-time bonuses as separate updates', () => {
  const s = new Simulation(),
    r = s.runners[0];
  r.kills = 3;
  s.score = 19_500;
  s.time = 70.2;
  beginEscape(s, r);
  for (let i = 0; i < 355; i++) {
    s.step(1 / 60);
  }
  assert.deepEqual(s.roundBonus, { kills: 3000, time: 640, credits: 1 });
  assert.equal(s.score, 23_140);
  assert.equal(s.lives, 4);
});
