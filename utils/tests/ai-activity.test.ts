import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AI_ACTIVITY, stepAIActivity } from '../../src/ai-activity.ts';
import { Simulation } from '../../src/simulation.ts';

test('activity timing constants match the original executable', () => {
  const exe = readFileSync(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    at = (v: number) => v - 0x480000 + 0x68e00;
  assert.equal(AI_ACTIVITY.sleepDelaySeconds, exe.readFloatLE(at(0x483dbb)));
  assert.equal(
    AI_ACTIVITY.keepActiveRemainingSeconds,
    exe.readFloatLE(at(0x483f66)),
  );
});
test('80 native region-activity sequences match 1520 model dispatches, including disabled controls and timer boundaries', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/ai-activity-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.sequences, 80);
  assert.equal(audit.modelActions, 1520);
  for (const [i, f] of audit.fixtures.entries()) {
    let events: string[] = [],
      mask = 0;
    const sim = new Simulation({
        maximumRunners: 2,
        ground: () => 0,
        wallContact() {
          events.push('physics');
          return null;
        },
      }),
      r = sim.runners[1];
    sim.countdown = 0;
    sim.runners.forEach((q) => (q.inactive = q.id !== 1));
    Object.assign(r, {
      x: 100,
      y: 0,
      z: 100,
      aiActivity: f.initial,
      aiActivityUntil: 10,
      navigation: {},
    });
    sim.regions = { maskAt: () => mask };
    sim.stepRunnerWeapons = () => events.push('weapons');
    sim.checkRunnerHealth = () => {
      events.push('health');
      return false;
    };
    sim.ai = () => {
      if (stepAIActivity(sim, r)) {
        events.push('action');
      }
      return {};
    };
    for (const [j, step] of f.steps.entries()) {
      events = [];
      mask = step.mask;
      sim.runners[0].zoneMask = step.playerMask;
      sim.entranceZoneMask = step.entranceMask;
      sim.time = step.remaining;
      sim.elapsed = step.clock - 7;
      r.controlsEnabled = step.enabled;
      sim.step(0);
      assert.deepEqual(
        { state: r.aiActivity, deadline: r.aiActivityUntil, events },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});
test('production controller and model loop freeze primary slots, movement and health until the remaining-time wake rule', () => {
  const sim = new Simulation({
      maximumRunners: 2,
      ground: () => 0,
      sceneContacts: () => [{ kind: 'wall' }],
    }),
    r = sim.runners[1],
    p = sim.runners[0];
  sim.countdown = 0;
  Object.assign(p, { x: -300, y: 0, z: 100, speed: 0 });
  Object.assign(r, {
    x: 300,
    y: 0,
    z: 100,
    speed: 30,
    acceleration: 0,
    aiActivity: 2,
    aiActivityUntil: 0,
    navigation: {},
    health: 0,
  });
  Object.assign(r.aiState, {
    mode: 'attack',
    target: 0,
    attackUntil: Infinity,
    shotAt: Infinity,
    jumpAt: Infinity,
    barrierAt: Infinity,
    enhancerAt: Infinity,
  });
  sim.regions = { maskAt: (x: number) => (x < 0 ? 2 : 1) };
  sim.entranceZoneMask = 0;
  sim.time = 100;
  sim.fire(r);
  const shot = sim.projectiles.find((q) => q.owner === r.id),
    position = { x: r.x, y: r.y, z: r.z };
  assert.ok(shot);
  sim.step(1 / 60);
  assert.deepEqual({ x: r.x, y: r.y, z: r.z }, position);
  assert.equal(shot.age, 0);
  assert.equal(r.dead, 0);
  assert.equal(r.aiActivity, 2);
  sim.time = 35;
  sim.step(1 / 60);
  assert.equal(r.aiActivity, 0);
  assert.notEqual(r.x + ':' + r.z, position.x + ':' + position.z);
  assert.ok(shot.age > 0);
  assert.ok(r.dead > 0, 'the deferred health check runs after waking');
});
test('native activity states reset on materialization without retiring the model', () => {
  const sim = new Simulation(),
    r = sim.runners[1];
  r.aiActivity = 2;
  r.aiActivityUntil = 50;
  sim.spawn(r);
  assert.equal(r.aiActivity, 0);
  assert.equal(r.aiActivityUntil, 0);
  assert.equal(r.inactive, false);
});
