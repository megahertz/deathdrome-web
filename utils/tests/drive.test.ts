import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateDrive } from '../../src/drive.ts';
import { DYNAMICS } from '../../src/simulation.ts';

function runner() {
  return {
    id: 0,
    turn: 0,
    turnAcceleration: 0,
    yaw: 0,
    acceleration: 0,
    speed: 0,
    nitro: 0,
  };
}
test('held steering reaches the executable turn limit; released steering damps', () => {
  const r = runner();
  for (let i = 0; i < 60; i++) {
    updateDrive(
      r as unknown as import('../../src/game-types.ts').Runner,
      { steer: 1 },
      1 / 60,
      DYNAMICS,
    );
  }
  assert.ok(Math.abs((r.turn * 180) / Math.PI - 190) < 0.001);
  const held = r.turn;
  for (let i = 0; i < 30; i++) {
    updateDrive(
      r as unknown as import('../../src/game-types.ts').Runner,
      {},
      1 / 60,
      DYNAMICS,
    );
  }
  assert.ok(r.turn < held * 0.001);
});
test('opposite throttle brakes before reversing and uses the recovered reverse acceleration', () => {
  const r = runner();
  for (let i = 0; i < 120; i++) {
    updateDrive(
      r as unknown as import('../../src/game-types.ts').Runner,
      { throttle: 1 },
      1 / 60,
      DYNAMICS,
    );
  }
  assert.equal(r.speed, 75);
  updateDrive(
    r as unknown as import('../../src/game-types.ts').Runner,
    { throttle: -1 },
    1 / 60,
    DYNAMICS,
  );
  assert.ok(r.speed > 0 && r.speed < 75);
  assert.equal(r.acceleration, 0);
  for (let i = 0; i < 180; i++) {
    updateDrive(
      r as unknown as import('../../src/game-types.ts').Runner,
      { throttle: -1 },
      1 / 60,
      DYNAMICS,
    );
  }
  assert.equal(r.speed, -75);
  assert.ok(Math.abs(r.acceleration + 80) < 0.00001);
});
