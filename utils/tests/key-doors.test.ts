import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KeyDoors, stepKeyDoor } from '../../src/key-doors.ts';
import { Simulation } from '../../src/simulation.ts';
const original = JSON.parse(
  readFileSync(
    new URL(
      '../../private/verification/key-doors-native.json',
      import.meta.url,
    ),
  ).toString(),
);
test('secret door key, active and override gate matches 192 original-code cases', () => {
  assert.equal(original.passed, true);
  for (const t of original.touches) {
    const d = new KeyDoors();
    d.override = t.override;
    d.doors[t.key].touchEnabled = t.enabled;
    d.doors[t.key].remaining = 2;
    assert.equal(d.touch(t.key, { keyring: t.keyring }), t.accepted);
    assert.equal(d.doors[t.key].remaining, t.remaining);
  }
});
test('secret door timer, exact boundaries and translation writes match 1512 original actions', () => {
  for (const [i, t] of original.fixtures.entries()) {
    const door = { ...t.before };
    assert.equal(+stepKeyDoor(door, t.dt), t.writes, 'writes ' + i);
    assert.deepEqual(door, t.after, 'state ' + i);
  }
});
test('secret door callback lifecycle and contact refresh match 2740 native updates', () => {
  for (const t of original.traces) {
    let writes: unknown[] = [];
    const d = new KeyDoors((key: any, height: any) =>
      writes.push({ key, height }),
    );
    d.touch('x', { keyring: { x: true } });
    for (const [frame, sample] of t.samples.entries()) {
      if (t.refresh.includes(frame)) {
        d.touch('x', { keyring: { x: true } });
      }
      writes = [];
      d.step(sample.dt);
      const { touchEnabled, ...state } = d.doors.x;
      assert.deepEqual(state, sample.after, t.name + ' frame ' + frame);
      assert.equal(writes.length, sample.writes);
      if (writes.length > 0) {
        assert.deepEqual(writes[0], { key: 'x', height: sample.after.height });
      }
    }
  }
});
test('secret keys are distinct from recharge counts and reset on respawn', () => {
  const s = new Simulation(),
    r = s.runners[0];
  r.keys = 2;
  assert.equal(s.collect(r, { type: 'enhkeyx.gam' }), true);
  assert.equal(r.keyring.x, true);
  assert.equal(r.keyring.y, false);
  assert.equal(r.keys, 2);
  s.spawn(r);
  assert.deepEqual(r.keyring, { x: false, y: false, z: false });
});
