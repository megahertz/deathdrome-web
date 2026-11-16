import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RESPAWN,
  beginRespawn,
  stepRespawn,
  cancelRespawn,
  runnerBodyVisible,
} from '../../src/respawn.ts';
import { Simulation } from '../../src/simulation.ts';

test('respawn thresholds and original shroud scale/scroll match executable and script data', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    code = (va: number) => va - 0x41_00_00 + 0x4_00,
    script = await readFile(
      new URL('../../private/original/game/RUN/SHROUD.GW', import.meta.url),
      'utf8',
    );
  assert.equal(RESPAWN.delaySeconds, exe.readFloatLE(code(0x42_b3_07)));
  assert.equal(RESPAWN.energizeSeconds, exe.readFloatLE(code(0x42_b1_b6)));
  assert.equal(RESPAWN.bodyAtSeconds, exe.readFloatLE(code(0x42_b2_0b)));
  const scale = script.match(/^Object3DScale\s+([.\d]+)/m),
    scroll = script.match(/^Object3DSetScroll on\s+([.\d-]+)\s+([.\d-]+)/m);
  assert.equal(RESPAWN.shroudScale, Math.fround(Number(scale![1])));
  assert.deepEqual(
    RESPAWN.scroll,
    scroll!.slice(1).map((x) => Math.fround(Number(x))),
  );
  const model = JSON.parse(
    await readFile(
      new URL('../../private/assets/models/plas_hit.json', import.meta.url),
      'utf8',
    ),
  );
  assert.ok(model.meshes.length > 0);
  assert.ok(
    model.meshes.every((f: { name: string | string[] }) =>
      f.name.includes('/o170/'),
    ),
  );
  assert.equal(RESPAWN.model, 'plas_hit');
});
function setup() {
  const sim = new Simulation({ ground: () => 10 });
  sim.countdown = 0;
  for (const r of sim.runners) {
    r.dead = Infinity;
  }
  const r = sim.runners[0];
  r.health = 0;
  beginRespawn(sim, r);
  return { sim, r };
}
test('strict delay starts the original half-second shroud phase and clears the phase accumulator', () => {
  const { sim, r } = setup();
  stepRespawn(sim, r, 0.25);
  assert.equal(r.respawn!.phase, 'delay');
  assert.equal(r.respawn!.shroudVisible, false);
  stepRespawn(sim, r, 0.001);
  assert.equal(r.respawn!.phase, 'energize');
  assert.equal(r.respawn!.elapsed, 0);
  assert.equal(r.respawn!.shroudVisible, true);
  assert.equal(runnerBodyVisible(r), false);
});
test('float-stored energize updates reveal the body before restoring controls and health', () => {
  const { sim, r } = setup();
  stepRespawn(sim, r, 0.26);
  for (let i = 0; i < 26; i++) {
    stepRespawn(sim, r, 1 / 60);
  }
  assert.equal(runnerBodyVisible(r), false);
  stepRespawn(sim, r, 1 / 60);
  assert.equal(runnerBodyVisible(r), true);
  assert.equal(r.respawn!.shroudVisible, true);
  assert.equal(r.health, 0);
  assert.equal(r.dead, Infinity);
  assert.equal(sim.damage(r, 100, 1), false);
  for (let i = 0; i < 3; i++) {
    stepRespawn(sim, r, 1 / 60);
  }
  assert.equal(r.respawn, null);
  assert.equal(r.dead, 0);
  assert.equal(r.health, 100);
  assert.equal(r.shield, 0);
  assert.equal(runnerBodyVisible(r), true);
});
test('respawn freezes movement, weapons and jump until normal runner setup completes', () => {
  const { sim, r } = setup(),
    pose = { x: r.x, y: r.y, z: r.z, yaw: r.yaw };
  for (let i = 0; i < 45; i++) {
    sim.step(1 / 60, { throttle: 1, steer: 1, fire: true, jump: true });
  }
  assert.ok(r.respawn);
  assert.equal(sim.projectiles.length, 0);
  assert.deepEqual({ x: r.x, y: r.y, z: r.z, yaw: r.yaw }, pose);
  assert.equal(r.speed, 0);
  assert.equal(r.vy, 0);
  sim.step(1 / 60, { throttle: 1 });
  assert.equal(r.respawn, null);
  assert.equal(r.speed, 0);
  sim.step(1 / 60, { throttle: 1 });
  assert.ok(r.speed > 0);
});
test('AI replacement route reservations transfer once to the normal controller and cancellation releases them', async () => {
  const paths = JSON.parse(
    await readFile(
      new URL('../../private/assets/ai-paths.json', import.meta.url),
      'utf8',
    ),
  );
  const sim = new Simulation({ round: 3, paths: paths[0] });
  let next = sim.population.replace(sim.runners[1]);
  assert.ok(next);
  assert.equal(next.respawn!.routeIndex, 1);
  assert.deepEqual(sim.aiRouteCounts, [0, 1, 0, 1, 2]);
  for (let i = 0; i < 46; i++) {
    stepRespawn(sim, next, 1 / 60);
  }
  assert.equal(next.respawn, null);
  assert.equal(next.navigation!.routeIndex, 1);
  assert.deepEqual(sim.aiRouteCounts, [0, 1, 0, 1, 2]);
  next = sim.population.replace(sim.runners[2]);
  assert.ok(next);
  const index = next.respawn!.routeIndex!,
    before = sim.aiRouteCounts[index];
  cancelRespawn(sim, next);
  assert.equal(sim.aiRouteCounts[index], before - 1);
  assert.equal(next.respawn, null);
});
test('life loss and final game-over wait for the destruction callback rather than damage time', () => {
  const sim = new Simulation();
  sim.countdown = 0;
  sim.ai = () => ({});
  sim.lives = 1;
  const r = sim.runners[0];
  sim.damage(r, 10_000, 1);
  assert.equal(sim.phase, 'running');
  assert.equal(sim.lives, 1);
  assert.equal(r.dead, 0);
  sim.step(1 / 60);
  assert.ok(r.dead > 0);
  for (let i = 0; i < 149; i++) {
    sim.step(1 / 60);
  }
  assert.equal(sim.lives, 1);
  assert.equal(sim.phase, 'running');
  sim.step(1 / 60);
  sim.step(1 / 60);
  assert.equal(sim.lives, 0);
  assert.equal(sim.phase, 'gameover');
  assert.equal(r.respawn, null);
  assert.equal(r.dead, Infinity);
  assert.equal(sim.events.filter((e) => e.type === 'lifeLost').length, 1);
});
