import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Simulation } from '../../src/simulation.ts';
import { beginJump, stepSuspension } from '../../src/suspension.ts';
import { fixture as stateFixture } from './fixtures.ts';

const audit = JSON.parse(
  fs
    .readFileSync(
      new URL(
        '../../private/verification/suspension-native-audit.json',
        import.meta.url,
      ),
    )
    .toString(),
);
function compare(actual: unknown, expected: unknown, path = '') {
  if (typeof expected === 'number') {
    assert.ok(typeof actual === 'number');
    assert.ok(
      Math.abs(actual - expected) <= audit.tolerance,
      `${path}: ${actual} != ${expected}`,
    );
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object');
    const actualRecord = actual as Record<string, unknown>,
      expectedRecord = expected as Record<string, unknown>;
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
    for (const k of Object.keys(expected)) {
      compare(actualRecord[k], expectedRecord[k], `${path}.${k}`);
    }
    return;
  }
  assert.equal(actual, expected, path);
}
function terrainHits(
  t: {
    kind: any;
    base: any;
    sx: any;
    sz: any;
    layers?: any;
    edge?: any;
    height?: any;
  },
  x: number,
  z: number,
) {
  if (t.kind === 'layers') {
    return t.layers.flatMap((layer: any) =>
      terrainHits({ kind: 'plane', ...layer }, x, z),
    );
  }
  let rise = 0;
  if (t.kind === 'plane') {
    rise = t.sx * x + t.sz * z;
  } else if (x >= t.edge) {
    rise = t.height;
  }
  const height = Math.fround(t.base + rise),
    sx = t.sx ?? 0,
    sz = t.sz ?? 0,
    length = Math.sqrt(1 + sx * sx + sz * sz),
    normal = {
      x: Math.fround(-sx / length),
      y: Math.fround(1 / length),
      z: Math.fround(-sz / length),
    };
  return [{ height, normal }];
}
function terrainQuery(
  t: { kind: string; base: number; sx: number; sz: number },
  queries: {
    x: number;
    z: number;
    hits: { height: number; normal: number[] }[];
  }[] = [],
) {
  return (x: any, z: any) => {
    const hits = terrainHits(t, x, z);
    queries.push({
      x,
      z,
      hits: hits.map(
        (h: {
          height: any;
          normal: { [s: string]: unknown } | ArrayLike<unknown>;
        }) => ({
          height: h.height,
          normal: Object.values(h.normal),
        }),
      ),
    });
    return hits;
  };
}
test('three-point support action matches 312 original flat, slope, step and layered-floor fixtures', () => {
  for (const [i, f] of audit.fixtures.entries()) {
    const r = { ...f.r },
      queries: never[] | undefined = [],
      result = stepSuspension(r, f.dt, terrainQuery(f.terrain, queries), {
        x: r.lateralSpeed,
        y: r.vy,
        z: -r.localSpeed,
      });
    compare(
      {
        position: [r.x, r.y, r.z],
        pitch: r.chassisPitchDegrees,
        roll: r.chassisRollDegrees,
        frontVelocity: r.frontVelocity,
        sideVelocity: r.sideVelocity,
        worldVelocity: Object.values(result.world),
        localVelocity: Object.values(result.local),
        grounded: r.grounded,
        supportContact: r.supportContact,
        mode: r.actionMode,
        slopeImpulse: r.slopeImpulse,
        brake: r.supportBrake,
        queries,
        sounds: r.human
          ? Array.from({ length: result.landingCalls }, () => 1)
          : [],
      },
      audit.native[i],
      `fixture ${i}`,
    );
  }
});
test('jump eligibility, impulse and local projection match 312 original actions', () => {
  for (const [i, f] of audit.jumpFixtures.entries()) {
    const r = stateFixture<import('../../src/game-types.ts').Runner>({
      ...f.r,
      supportContact: f.supportContact,
      speed: f.r.localSpeed,
      lateralSpeed: f.r.lateralSpeed,
      localVerticalSpeed: f.r.vy,
      worldVelocity: { x: f.r.lateralSpeed, y: f.r.vy, z: -f.r.localSpeed },
    });
    beginJump(r);
    compare(
      {
        mode: r.actionMode,
        previous: r.previousActionMode,
        front: r.frontVelocity,
        side: r.sideVelocity,
        world: Object.values(r.worldVelocity!),
        local: [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
      },
      audit.jumpNative[i],
      `jump ${i}`,
    );
  }
});
test('production driving uses support pitch and roll for motion, emitters and jumping', () => {
  const query = terrainQuery({ kind: 'plane', base: 20, sx: 0.15, sz: -0.2 }),
    s = new Simulation({
      ground: ((x: any, z: any, _y: any, support: any) =>
        support
          ? query(x, z)
          : query(x, z)[0]
              .height) as import('../../src/game-types.ts').GroundQuery,
      blocked: () => false,
      wallContact: () => null,
    });
  s.countdown = 0;
  s.ai = () => ({});
  for (const r of s.runners) {
    r.dead = Infinity;
  }
  const r = s.runners[0];
  Object.assign(r, {
    dead: 0,
    x: 50,
    y: 17.5,
    z: 50,
    yaw: 0,
    speed: 30,
    baseHeight: 17.5,
  });
  for (let i = 0; i < 60; i++) {
    s.step(1 / 60, { throttle: 1 });
  }
  assert.ok(r.chassisPitchDegrees > 5);
  assert.ok(Math.abs(r.chassisRollDegrees) > 3);
  assert.equal(r.grounded, true);
  assert.ok(r.forwardVector!.y > 0);
  assert.ok(r.y > 17.5);
  assert.ok(Number.isFinite(r.localVerticalSpeed));
  s.fire(r);
  s.step(1 / 60);
  assert.equal(s.projectiles.length, 2);
  assert.ok(s.projectiles.every((p) => p.vy > 0));
  assert.notEqual(s.projectiles[0].y, s.projectiles[1].y);
  const base = r.y;
  s.step(1 / 60, { jump: true });
  assert.equal(
    r.actionMode,
    1,
    'native support action restores mode inside its one-unit ground band even on the first 60 Hz jump update',
  );
  assert.ok(r.y > base);
  assert.ok(s.events.some((e) => e.type === 'jump'));
  for (let i = 0; i < 10; i++) {
    s.step(1 / 60, { jump: true });
  }
  assert.ok(s.events.every((e) => e.type !== 'jump'));
  assert.ok(r.y > base + 2);
});
