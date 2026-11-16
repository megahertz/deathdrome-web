import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { stepCollisionSweep } from '../../src/collision-sweep.ts';
import { HOT_SPOT, HotSpots } from '../../src/hot-spots.ts';
import { intersectBox } from '../../src/scene-boxes.ts';
import { Simulation } from '../../src/simulation.ts';
import { queryScene } from '../../utils/scene_query_batch.ts';
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const marker = (active = false) => ({
  name: active ? 'activ_hs.gam' : 'dormt_hs.gam',
  position: [0, 0, 0],
  matrix: identity,
});
test('hot spot constants and marker counts match the supplied source', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    f = (va: number) => exe.readFloatLE(va - 0x48_00_00 + 0x6_8e_00);
  assert.equal(HOT_SPOT.damage, -f(0x48_44_2c));
  assert.equal(HOT_SPOT.maximumScale, f(0x48_4b_16));
  assert.equal(HOT_SPOT.growthDistance, f(0x48_4b_1a));
  const counts = [];
  for (let i = 1; i <= 8; i++) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const model = JSON.parse(
      await readFile(
        new URL(`../../private/assets/models/arena${i}.json`, import.meta.url),
        'utf8',
      ),
    );
    // oxlint-enable no-await-in-loop
    counts.push(new HotSpots(model.markers).spots.length);
  }
  assert.deepEqual(counts, [19, 18, 20, 15, 21, 16, 12, 10]);
});
test('hot spots arm on first hit, erupt on the next, and reset after flash/growth', () => {
  const h = new HotSpots([marker(), marker(true)]);
  let s = h.spots[0];
  assert.equal(h.trigger(s, 0), 'armed');
  h.step(10);
  assert.equal(s.phase, 1);
  assert.equal(h.trigger(s, 1), 'erupting');
  h.step(0.5);
  assert.equal(s.phase, 2);
  assert.ok(s.color[1] > 0.6);
  h.step(0.26);
  assert.equal(s.phase, 3);
  h.step(0.25);
  assert.equal(s.scale, 49);
  h.step(0.26);
  assert.equal(s.phase, 4);
  h.step(0.01);
  assert.equal(s.phase, 0);
  assert.equal(s.scale, 1);
  [, s] = h.spots;
  h.trigger(s, 0);
  h.step(0.76);
  h.step(0.51);
  h.step(0.01);
  assert.equal(s.phase, 1);
});
test('six shared eruption slots bound simultaneous activation', () => {
  const h = new HotSpots(Array.from({ length: 7 }, () => marker(true)));
  for (let i = 0; i < 6; i++) {
    assert.equal(h.trigger(h.spots[i], i), 'erupting');
  }
  assert.equal(h.trigger(h.spots[6], 6), null);
  assert.equal(h.spots[6].phase, 1);
});
test('hot spot force obeys its ground-height band, shields and owner kill scoring', () => {
  const sim: Simulation = new Simulation({ markers: [marker(true)] });
  sim.countdown = 0;
  sim.ai = () => ({});
  for (const r of sim.runners) {
    Object.assign(r, { x: 300 + r.id * 20, y: 0, z: 300, shield: 0 });
  }
  const s = sim.hotSpots.spots[0];
  Object.assign(s, { phase: 3, seconds: 0.5, scale: 60, owner: 0 });
  Object.assign(sim.runners[1], { x: 10, y: 0, z: 0 });
  Object.assign(sim.runners[2], { x: 10, y: 0, z: 0, shield: 5 });
  Object.assign(sim.runners[3], { x: 10, y: 1, z: 0 });
  sim.step(1 / 60);
  assert.equal(sim.runners[1].health, 0);
  assert.equal(sim.runners[2].health, 100);
  assert.equal(sim.runners[3].health, 100);
  assert.equal(sim.runners[0].kills, 1);
  assert.equal(sim.score, 500);
});

test('all 131 native hot-spot startup boxes, IDs, timers and 100 trigger/pool actions agree', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/hot-spots-native.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.mismatches, []);
  let count = 0,
    actions = 0;
  for (const row of audit.results) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const data = JSON.parse(
        await readFile(
          new URL(
            `../../private/assets/models/arena${row.arena}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ),
      h = new HotSpots(data.markers);
    // oxlint-enable no-await-in-loop
    assert.equal(h.spots.length, row.initial.length);
    count += h.spots.length;
    for (const [i, s] of h.spots.entries()) {
      const n = row.initial[i];
      assert.equal(n.name, 'HotSpot_parent_' + i);
      assert.equal(s.phase, n.phase);
      assert.equal(s.seconds, n.seconds);
      assert.equal(s.alwaysArmed, n.alwaysArmed);
      assert.deepEqual(s.box.vertices, n.corners);
      assert.equal(n.bbox, 1);
    }
    for (const a of row.actions) {
      const s = h.spots[a.index],
        action = h.trigger(s, a.owner);
      actions++;
      assert.deepEqual(
        {
          phase: s.phase,
          seconds: s.seconds,
          owner: s.owner,
          bbox: s.phase < 2,
        },
        a.state,
      );
      assert.deepEqual(
        { armed: [33], erupting: [6] }[action as 'armed' | 'erupting'] ?? [],
        a.sounds,
      );
    }
  }
  assert.equal(count, 131);
  assert.equal(actions, 100);
});

test('1834 native marker rays include one-sided entries, inside exits and grid-boundary eligibility', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/hot-spots-native.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  let count = 0;
  for (const row of audit.results) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const data = JSON.parse(
        await readFile(
          new URL(
            `../../private/assets/models/arena${row.arena}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ),
      h = new HotSpots(data.markers),
      results = await queryScene({ arena: row.arena, fixtures: row.fixtures });
    // oxlint-enable no-await-in-loop
    for (const [i, f] of row.fixtures.entries()) {
      const expected = row.native[i],
        actual = results[i].filter((hit: { name: string }) =>
          hit.name.startsWith('HotSpot_parent_'),
        );
      count++;
      assert.equal(
        actual.length,
        expected.length,
        `arena ${row.arena}, ray ${i}`,
      );
      for (const hit of expected) {
        const other = actual.find(
          (candidate: { name: string }) => candidate.name === hit.name,
        );
        assert.ok(other);
        for (const key of ['point', 'normal']) {
          for (const axis of ['x', 'y', 'z']) {
            assert.ok(
              Math.abs(hit[key][axis] - other[key][axis]) <= audit.tolerance,
            );
          }
        }
      }
      for (const s of h.spots) {
        assert.equal(
          h.projectileContact(s, f.from, f.to),
          expected.some(
            (hit: { name: string }) => hit.name === 'HotSpot_parent_' + s.id,
          ),
          `projectile arena ${row.arena}, ray ${i}, spot ${s.id}`,
        );
      }
    }
  }
  assert.equal(count, 1834);
});

test('896 native dispatches retain hot-spot trigger, response and subsequent wall response order', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/hot-spot-dispatch-native.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.fixtures.length, 896);
  for (const [i, f] of audit.fixtures.entries()) {
    const r = structuredClone(f.r),
      trace: {
        kind: any;
        position?: any[];
        world?: unknown[];
        local?: any[];
        turn?: number;
        minimum?: any;
        probe?: unknown[];
      }[] = [];
    let count = 0;
    const snapshot = () => ({
      position: [r.x, r.y, r.z],
      world: Object.values(r.worldVelocity),
      local: [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
      turn: (r.turn * 180) / Math.PI,
      minimum: r.collisionMinimumSpeed,
      probe: Object.values(r.collisionProbe),
    });
    const result = stepCollisionSweep(
      r,
      f.dt,
      () =>
        ++count === 1
          ? ['HotSpot_parent_0', ...(f.withWall ? ['wall'] : [])].map(
              (name) => ({ ...f.contact, node: { name } }),
            )
          : [],
      {
        onContact: (kind: any) => trace.push({ kind }),
        onResponse: (_response: any, kind: string) =>
          trace.push({ kind: kind + 'Response', ...snapshot() }),
      },
    );
    assert.equal(result.responses.length, f.withWall ? 2 : 1);
    assert.equal(trace.length, audit.native[i].length);
    for (const [j, event] of trace.entries()) {
      const n = audit.native[i][j];
      assert.equal(event.kind, n.kind);
      for (const key of Object.keys(n).filter((k) => k !== 'kind')) {
        const a = Array.isArray(event[key as keyof typeof event])
            ? event[key as keyof typeof event]
            : [event[key as keyof typeof event]],
          b = Array.isArray(n[key]) ? n[key] : [n[key]];
        for (const [k, v] of a.entries()) {
          assert.ok(
            Math.abs(v - b[k]) <= audit.tolerance,
            `fixture ${i}, response ${j}, ${key}[${k}]`,
          );
        }
      }
    }
  }
});

test('the front probe arms a hot spot outside the centre radius, then eruption disables its collider immediately', () => {
  let collidable = true;
  const changes: unknown[] = [];
  const sim: Simulation = new Simulation({
    markers: [{ name: 'dormt_hs.gam', position: [10, 0, 10] }],
    updateHotSpot: (s: { phase: number }) => {
      changes.push(s.phase);
      collidable = s.phase < 2;
    },
    sceneSweep: (a, b) => {
      const hit =
        collidable &&
        intersectBox(
          sim.hotSpots.spots[0].box,
          a as unknown as import('../../src/game-types.ts').Vec3,
          b,
        );
      return hit ? [{ ...hit, node: { name: 'HotSpot_parent_0' } }] : [];
    },
  });
  sim.countdown = 0;
  sim.ai = () => ({});
  for (const r of sim.runners) {
    r.dead = Infinity;
  }
  const r = sim.runners[sim.player],
    spot = sim.hotSpots.spots[0];
  function approach() {
    Object.assign(r, {
      dead: 0,
      inactive: false,
      x: 10,
      y: 0,
      z: 18,
      yaw: 0,
      speed: 0,
      lateralSpeed: 0,
      localVerticalSpeed: 0,
      turn: 0,
      acceleration: 0,
      turnAcceleration: 0,
      frontVelocity: 0,
      sideVelocity: 0,
      chassisPitchDegrees: 0,
      chassisRollDegrees: 0,
      collisionProbe: { x: 10, y: 0, z: 18 },
      rearProbe: { x: 10, y: 0, z: 18 },
    });
    sim.step(1 / 60);
  }
  approach();
  assert.equal(spot.phase, 1);
  assert.deepEqual(changes, [1]);
  assert.equal(
    sim.events.filter((e: { type: string }) => e.type === 'hotSpot').length,
    1,
  );
  assert.ok(r.collisionContacts!.hotSpot);
  assert.ok(r.z > 18);
  approach();
  assert.equal(spot.phase, 2);
  assert.equal(collidable, false);
  assert.deepEqual(changes, [1, 2]);
  assert.equal(
    sim.events.filter((e: { type: string }) => e.type === 'hotSpot').length,
    1,
  );
});
