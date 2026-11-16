import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { updateVertical, VERTICAL } from '../../src/vertical.ts';
test('jump impulse and gravity match native data; position advances before gravity', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x48_00_00 + 0x6_8e_00);
  assert.equal(VERTICAL.jumpImpulse, f(0x48_41_6c));
  assert.equal(VERTICAL.gravity, f(0x48_f1_3c));
  const r = { y: 0, vy: 0 };
  assert.equal(updateVertical(r, 0, 0.04, true), true);
  assert.equal(r.y, VERTICAL.jumpImpulse * 0.04);
  assert.equal(r.vy, VERTICAL.jumpImpulse - VERTICAL.gravity * 0.04);
});
test('jump input is latched, landing respects a raised floor and the native ceiling reflects velocity', () => {
  const r = { y: 10, vy: 0 };
  updateVertical(r, 10, 0.04, true);
  const first = r.vy;
  assert.equal(updateVertical(r, 10, 0.04, true), false);
  assert.ok(r.vy < first);
  for (let i = 0; i < 100; i++) {
    updateVertical(r, 10, 0.04, false);
  }
  assert.equal(r.y, 10);
  assert.equal(r.vy, 0);
  r.y = 63;
  r.vy = 100;
  updateVertical(r, 0, 0.04);
  assert.equal(r.y, 64);
  assert.ok(r.vy < 0);
});
