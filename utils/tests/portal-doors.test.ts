import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PORTAL, PortalDoors, portalLocked } from '../../src/portal-doors.ts';
test('quadrant portal locks match the original round table', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    offset = 0x48_db_3c - 0x48_00_00 + 0x6_8e_00;
  for (let region = 0; region < 5; region++) {
    for (let round = 1; round <= 3; round++) {
      assert.equal(
        portalLocked(region + '1', round),
        !!exe.readUInt32LE(offset + (region * 3 + round - 1) * 4),
      );
    }
  }
  assert.equal(portalLocked('31', 1), true);
  assert.equal(portalLocked('31', 2), false);
  assert.equal(portalLocked('41', 2), true);
  assert.equal(portalLocked('41', 3), false);
});
test('unlocked portals lift on contact and drop with native slow/fast closing phases', () => {
  const updates = [],
    doors = new PortalDoors(1, (id: any, height: any) =>
      updates.push({ id, height }),
    ),
    runner = { dead: 0 };
  assert.equal(doors.touch('31', runner, 0.1), false);
  assert.equal(doors.touch('11', runner, 0.1), true);
  assert.equal(doors.doors.get('11')!.height, 6);
  doors.touch('11', runner, 0.5);
  assert.equal(doors.doors.get('11')!.height, 15);
  doors.step(0.1);
  assert.equal(doors.doors.get('11')!.height, Math.fround(14.95));
  doors.step(0.1);
  doors.step(0.1);
  assert.ok(Math.abs(doors.doors.get('11')!.height - 12.9) < 0.0001);
  doors.step(1);
  assert.equal(doors.doors.get('11')!.height, 0);
  assert.ok(updates.length > 3);
  assert.equal(PORTAL.raiseSpeed, 60);
  assert.equal(PORTAL.lowerSpeed, 20);
});
