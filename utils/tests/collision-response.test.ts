import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { collisionResponse } from '../../src/collision-response.ts';

test('supplied contact responses match 896 real native callbacks', () => {
  const audit = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/collision-response-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  assert.equal(audit.passed, true);
  for (let i = 0; i < audit.fixtures.length; i++) {
    const fixture = structuredClone(audit.fixtures[i]),
      { r } = fixture;
    r.collisionProbe = { x: 31, y: 8, z: 32 };
    r.deltaX = 0;
    r.deltaZ = 0;
    const effects = collisionResponse(r, fixture.contact, fixture),
      expected = audit.native[i];
    const actual = {
      position: [r.x, r.y, r.z],
      world: Object.values(r.worldVelocity),
      local: [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
      turn: (r.turn * 180) / Math.PI,
      minimum: r.collisionMinimumSpeed,
      front: r.frontVelocity,
      side: r.sideVelocity,
      mode: r.actionMode,
      probe: Object.values(r.collisionProbe),
      delta: [r.deltaX, r.deltaZ],
      sounds: effects.landingCalls ? [1] : [],
      damage: effects.damage ? [-Math.fround(effects.damage)] : [],
    };
    for (const key of Object.keys(expected)) {
      const a = Array.isArray(actual[key as keyof typeof actual])
          ? actual[key as keyof typeof actual]
          : [actual[key as keyof typeof actual]],
        b = Array.isArray(expected[key]) ? expected[key] : [expected[key]];
      assert.equal(a.length, b.length, `${i} ${key} length`);
      for (let j = 0; j < b.length; j++) {
        assert.ok(
          Math.abs(a[j] - b[j]) <= audit.tolerance,
          `${i} ${key}[${j}]: ${a[j]} != ${b[j]}`,
        );
      }
    }
  }
});
