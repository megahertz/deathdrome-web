import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  classifyContacts,
  collectRunnerContacts,
  followCollisionFloor,
  rejectCollisionPosition,
} from '../../src/collision-sweep.ts';
const audit = (name: string) =>
  JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/' + name + '-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
function compare(a: unknown, b: unknown, t = 0, path = '') {
  if (typeof b === 'number') {
    assert.ok(typeof a === 'number');
    assert.ok(Math.abs(a - b) <= t, `${path}: ${a} != ${b}`);
    return;
  }
  if (b && typeof b === 'object') {
    assert.ok(a && typeof a === 'object');
    const aa = a as Record<string, unknown>,
      bb = b as Record<string, unknown>;
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
    for (const k in b) {
      compare(aa[k], bb[k], t, path + '.' + k);
    }
    return;
  }
  assert.equal(a, b, path);
}
const recordsJSON = (
  records: import('../../src/collision-types.ts').ContactRecords,
) =>
  Object.fromEntries(
    Object.entries(records).map(([k, v]) => [
      k,
      {
        normal: Object.values(v.normal),
        point: Object.values(v.point),
        source: Object.values(v.source),
        endpoint: Object.values(v.endpoint),
      },
    ]),
  );
test('contact categories and recursive node lookup match 1040 original actions', () => {
  const a = audit('collision-classification');
  assert.equal(a.passed, true);
  a.fixtures.forEach((original: any, i: number) => {
    const f = structuredClone(original);
    let count = 0;
    function ids(n: { id: string; name: string; parents: any }) {
      n.id = n.name + '#' + count++;
      for (const c of n.parents ?? []) {
        ids(c);
      }
    }
    for (const h of f.hits) {
      ids(h.node);
    }
    const records: import('../../src/collision-types.ts').ContactRecords =
      f.preexisting
        ? {
            hotSpot: {
              node: { id: 'preexisting', name: 'preexisting' },
              tag: 99,
              normal: { x: 0, y: 0, z: 0 },
              point: { x: 0, y: 0, z: 0 },
              source: { x: 0, y: 0, z: 0 },
              endpoint: { x: 0, y: 0, z: 0 },
            },
          }
        : {};
    classifyContacts(f.hits, f.source, f.endpoint, {
      records,
      scrubCollidable: f.scrubCollidable,
    });
    const row = Object.fromEntries(
      Object.entries(records).map(([k, v]) => [
        k,
        {
          node: v.node!.id,
          tag: v.tag,
          normal: Object.values(v.normal),
          point: Object.values(v.point),
          source: Object.values(v.source),
          endpoint: Object.values(v.endpoint),
        },
      ]),
    );
    compare(row, a.native[i], 0, `classification ${i}`);
  });
});
test('sweep endpoints, short circuit and retained records match 512 original actions', () => {
  const a = audit('collision-sweeps');
  assert.equal(a.passed, true);
  a.fixtures.forEach((original: any, i: number) => {
    const f = structuredClone(original),
      { r } = f;
    r.rearProbe = Object.fromEntries(
      Object.entries(r.rearProbe).map(([k, v]) => [
        k,
        Math.fround(v as number),
      ]),
    );
    let count = 0,
      floorCalls = 0;
    const result = collectRunnerContacts(
      r,
      f.dt,
      () =>
        ++count === f.hitAt
          ? [
              {
                node: { name: 'wall' },
                normal: { x: 0, y: f.floor ? 1 : 0, z: 1 },
                point: { x: 35, y: 5, z: 37 },
              },
            ]
          : [],
      {
        human: f.human,
        onFloor() {
          floorCalls++;
        },
      },
    );
    const row = {
      queries: result.queries.map((q) => ({
        from: Object.values(q.from),
        to: Object.values(q.to),
      })),
      clear: result.clear,
      flag: r.collisionClear,
      probe: Object.values(r.collisionProbe),
      oldProbe: Object.values(r.previousCollisionProbe),
      center: Object.values(r.collisionCenter),
      oldCenter: Object.values(r.previousCollisionCenter),
      rear: Object.values(r.rearProbe),
      oldRear: Object.values(r.previousRearProbe ?? { x: 0, y: 0, z: 0 }),
      floorCalls,
      records: recordsJSON(result.records),
    };
    compare(row, a.native[i], a.tolerance, `sweep ${i}`);
  });
});
test('floor following and additional query match 432 original actions', () => {
  const a = audit('collision-floor');
  assert.equal(a.passed, true);
  a.fixtures.forEach((original: any, i: number) => {
    const f = structuredClone(original),
      { r } = f,
      records = {
        floor: {
          tag: 1,
          node: { name: 'floor' },
          normal: f.normal,
          point: { x: 35, y: 5, z: 37 },
          source: { x: 10, y: 2, z: 20 },
          endpoint: { x: 50, y: 3, z: 60 },
        },
      };
    const result = followCollisionFloor(r, records, f.dt, () =>
      f.hit
        ? [
            {
              tag: 7,
              node: { name: 'wall' },
              normal: { x: 0, y: f.hit === 2 ? 1 : 0, z: 1 },
              point: { x: 35, y: 5, z: 37 },
            },
          ]
        : [],
    );
    const row = {
      queries: result.queries.map((q) => ({
        from: Object.values(q.from),
        to: Object.values(q.to),
      })),
      forward: Object.values(r.forwardVector),
      world: Object.values(r.worldVelocity),
      front: r.frontVelocity,
      side: r.sideVelocity,
      probe: Object.values(r.collisionProbe),
      records: Object.fromEntries(
        Object.entries(records).map(([k, v]) => [
          k,
          { tag: v.tag, ...recordsJSON({ contact: v }).contact },
        ]),
      ),
    };
    compare(row, a.native[i], a.tolerance, `floor ${i}`);
  });
});
test('candidate position rejection matches 192 original query/classifier actions', () => {
  const a = audit('collision-rejection');
  assert.equal(a.passed, true);
  a.fixtures.forEach((original: any, i: number) => {
    const f = structuredClone(original);
    let count = 0;
    const result = rejectCollisionPosition(
      f.r,
      f.candidate,
      f.dt,
      () =>
        ++count === f.hitAt
          ? [
              {
                node: { name: f.category === 'runner' ? 'runner_1' : 'wall' },
                normal: { x: 0, y: f.category === 'floor' ? 1 : 0, z: 1 },
                point: { x: 35, y: 5, z: 37 },
              },
            ]
          : [],
      { human: f.human },
    );
    compare(
      {
        rejected: result.rejected,
        queries: result.queries.map((q) => ({
          from: Object.values(q.from),
          to: Object.values(q.to),
        })),
      },
      a.native[i],
      a.tolerance,
      `rejection ${i}`,
    );
  });
});
