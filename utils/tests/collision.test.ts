import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  COLLISION,
  planarVelocity,
  setPlanarVelocity,
  reflectImpact,
  runnerOverlap,
} from '../../src/collision.ts';
import { updateDrive, originalDamping } from '../../src/drive.ts';
import { runnerContact } from '../../src/runner-contact.ts';
import { Simulation, DYNAMICS } from '../../src/simulation.ts';
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function setup() {
  const s = new Simulation(),
    r = s.runners[0];
  Object.assign(r, {
    yaw: 0,
    speed: 80,
    lateralSpeed: 0,
    turn: 0,
    vy: 0,
    shield: 0,
  });
  return { s, r };
}
test('planar response constants match native collision instructions and data', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    data = (va: number) => va - 0x48_00_00 + 0x6_8e_00;
  assert.equal(COLLISION.velocityFactor, exe.readFloatLE(data(0x48_42_08)));
  assert.equal(
    COLLISION.turnDegreesPerSpeed,
    exe.readFloatLE(0x43_2b_cb - 0x41_00_00 + 0x4_00),
  );
  assert.equal(COLLISION.impactDamage, -exe.readFloatLE(data(0x48_42_20)));
  assert.equal(
    COLLISION.impactDamageThreshold,
    exe.readFloatLE(data(0x48_42_14)),
  );
});
test('legacy planar contact approximation halves speed and rejects a separating impact', () => {
  const { s, r } = setup();
  reflectImpact(s, r, { x: 0, z: 1 });
  close(r.speed, -40);
  close(r.lateralSpeed, 0);
  close(r.turn, 0);
  assert.equal(reflectImpact(s, r, { x: 0, z: 1 }), false);
  Object.assign(r, { speed: 30, vy: 40 });
  reflectImpact(s, r, { x: 0, z: 1 });
  close(r.speed, -25);
  close(r.vy, 40);
});
test('glancing contact produces sideways velocity and signed angular impulse', () => {
  const { s, r } = setup();
  r.speed = 40;
  reflectImpact(s, r, { x: Math.SQRT1_2, z: Math.SQRT1_2 });
  const v = planarVelocity(r);
  close(v.x, 20);
  close(v.z, 0);
  close(r.turn, (-40 * 9 * Math.PI) / 180);
  assert.equal(r.health, 100);
  for (const yaw of [0, 0.7, Math.PI, 4.5]) {
    r.yaw = yaw;
    setPlanarVelocity(r, { x: 17, z: -28 });
    const actual = planarVelocity(r);
    close(actual.x, 17);
    close(actual.z, -28);
  }
});
test('legacy planar contact damage keeps its provisional shield and Nitro guards', () => {
  const { s, r } = setup();
  reflectImpact(s, r, { x: 0, z: 1 });
  assert.equal(r.health, 98.16000366210938);
  for (const kind of ['shield', 'nitro']) {
    const { s: state, r: actor } = setup();
    actor.shield = kind === 'shield' ? 1 : 0;
    reflectImpact(state, actor, { x: 0, z: 1 }, { nitro: kind === 'nitro' });
    assert.equal(actor.health, 100);
  }
});
test('overlapping runners moving apart separate without repeated contact damage', () => {
  const s = new Simulation(),
    a = s.runners[0],
    b = s.runners[1];
  Object.assign(a, {
    x: 0,
    y: 0,
    z: 0,
    yaw: Math.PI,
    speed: 40,
    lateralSpeed: 0,
  });
  Object.assign(b, { x: 0, y: 0, z: -3, yaw: 0, speed: 40, lateralSpeed: 0 });
  const contact = runnerOverlap(a, b);
  assert.equal(contact!.aImpact, false);
  assert.equal(contact!.bImpact, false);
  runnerContact(s, a, b, contact!);
  assert.equal(a.health, 100);
  assert.equal(b.health, 100);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 4);
  assert.equal(runnerOverlap(a, b), null);
});
test('airborne inputs cannot accelerate or steer; ground steering reversal resets the old rate', () => {
  const { r } = setup();
  Object.assign(r, {
    y: 5,
    floor: 0,
    grounded: false,
    movementEnabled: true,
    speed: 30,
    lateralSpeed: 20,
    turn: 1,
    acceleration: 0,
  });
  updateDrive(r, { throttle: 1, steer: 1 }, 1 / 60, DYNAMICS);
  close(r.speed, 30 * originalDamping(DYNAMICS.brakes[0] / 60));
  close(r.lateralSpeed, 20 * originalDamping(DYNAMICS.brakes[0] / 60));
  close(r.turn, originalDamping(DYNAMICS.turnDamping / 60));
  assert.equal(r.acceleration, 20);
  Object.assign(r, { y: 0, grounded: true, turn: -1, turnAcceleration: -1 });
  updateDrive(r, { steer: 1 }, 1 / 60, DYNAMICS);
  assert.ok(r.turn > 0);
});
