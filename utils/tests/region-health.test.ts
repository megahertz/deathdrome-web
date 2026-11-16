import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OUTSIDE_REGION_SECONDS } from '../../src/region-health.ts';
import { Simulation } from '../../src/simulation.ts';

test('576 original region-health traces match 5184 health, timer and message observations', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/region-health-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.sequences, 576);
  assert.equal(audit.observations, 5184);
  const exe = readFileSync(
    new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
  );
  assert.deepEqual(
    [...exe.subarray(0x43364d - 0x410000 + 0x400, 0x43364f - 0x410000 + 0x400)],
    [0xd9, 0xe8],
  );
  assert.equal(OUTSIDE_REGION_SECONDS, 1);
  for (const [i, f] of audit.fixtures.entries()) {
    const sim = new Simulation({
        player: f.player,
        maximumRunners: 8,
        ground: () => 0,
      }),
      r = sim.runners[f.model];
    sim.countdown = 0;
    Object.assign(r, {
      health: f.health,
      shield: f.shielded ? 10 : 0,
      outsideRegionUntil: f.deadline,
      profileName: 'RUNNER_' + f.model,
    });
    for (const [j, step] of f.steps.entries()) {
      sim.elapsed = step.clock - 7;
      sim.events = [];
      if (!r.dead && !r.inactive) {
        r.zoneMask = step.mask;
        sim.checkRunnerHealth(r);
      }
      assert.deepEqual(
        {
          deadline: r.outsideRegionUntil,
          health: r.health,
          active: !r.dead && !r.inactive,
          events: sim.events
            .filter(
              (e) => e.type === 'returnToDomain' || e.type === 'destroyed',
            )
            .map((e) => ({
              type: e.type,
              runner: e.runner,
              ...(e.text ? { text: e.text } : {}),
            })),
        },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});
function outsidePlayer() {
  const sim = new Simulation({ player: 6, maximumRunners: 1, ground: () => 0 }),
    r = sim.runners[6];
  sim.countdown = 0;
  sim.projectileContact = () => {};
  Object.assign(r, {
    x: -800,
    y: 0,
    z: 800,
    speed: 0,
    movementEnabled: true,
    shield: 10,
  });
  assert.equal(sim.regions.maskAt(r.x, r.z), 0);
  return { sim, r };
}
test('real region sampling reaches the post-weapon health gate and spends no life until destruction delay', () => {
  const { sim, r } = outsidePlayer();
  sim.step(1 / 60, { fire: true });
  const shot = sim.projectiles.find((p) => p.owner === r.id);
  assert.ok(shot);
  const deadline = r.outsideRegionUntil;
  assert.ok(deadline > 8);
  for (let i = 0; i < 60; i++) {
    sim.step(1 / 60);
  }
  assert.equal(r.dead, 0);
  assert.equal(r.health, 100);
  sim.step(1 / 60);
  assert.equal(r.health, 0);
  assert.ok(r.dead > 0);
  assert.ok(shot.age > 0);
  assert.equal(sim.lives, 3);
  assert.equal(sim.score, 0);
  assert.equal(
    sim.runners.reduce((n, q) => n + q.kills, 0),
    0,
  );
  assert.deepEqual(
    sim.events
      .filter((e) => e.type === 'returnToDomain' || e.type === 'destroyed')
      .map((e) => e.type),
    ['returnToDomain', 'destroyed'],
  );
  assert.equal(
    sim.events.find((e) => e.type === 'destroyed').reason,
    'outsideDomain',
  );
});
test('returning inside clears the grace timer and cold/materialized actors sample their valid region', () => {
  const { sim, r } = outsidePlayer();
  assert.equal(r.outsideRegionUntil, 0);
  sim.step(1 / 60);
  const deadline = r.outsideRegionUntil;
  r.x = 0;
  r.z = 0;
  sim.step(1 / 60);
  assert.equal(r.outsideRegionUntil, 0);
  assert.equal(r.health, 100);
  r.x = -800;
  r.z = 800;
  sim.step(1 / 60);
  assert.ok(r.outsideRegionUntil > deadline);
  const pending = r.outsideRegionUntil;
  sim.spawn(r);
  assert.equal(
    r.outsideRegionUntil,
    pending,
    'materialization preserves the field until the next health sample',
  );
  sim.step(1 / 60);
  assert.equal(r.outsideRegionUntil, 0);
});
