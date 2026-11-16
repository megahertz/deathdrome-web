import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CreditsSequence } from '../../src/credits.ts';
const data = JSON.parse(
  await readFile(
    new URL('../../private/assets/credits.json', import.meta.url),
    'utf8',
  ),
);
test('the complete credits queue preserves original strings, fonts and row spacing', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    offset = (va: string) => Number.parseInt(va, 16) - 0x48_00_00 + 0x6_8e_00;
  assert.equal(data.rows.length, 123);
  assert.equal(data.rows.filter((r: { text: any }) => r.text).length, 69);
  let y = 240;
  for (const r of data.rows) {
    assert.equal(r.y, y);
    y += r.size + 2;
    if (r.address) {
      const start = offset(r.address),
        end = exe.indexOf(0, start);
      assert.equal(
        r.text,
        exe.subarray(start, end).toString('ascii').slice(0, 50),
      );
      assert.equal(r.size, r.font < 10 ? 10 : 7);
    }
  }
  assert.equal(data.rows[0].text, 'CREDITS');
  assert.equal(data.rows[0].x, 125);
  assert.ok(data.rows.some((r: { text: string }) => r.text === 'PRODUCERS'));
  assert.ok(
    data.rows.some(
      (r: { text: string }) => r.text === 'of Viacom International Inc.',
    ),
  );
});
test('credits scroll one pixel per two reference frames independent of presentation chunking', () => {
  const a = new CreditsSequence(data),
    b = new CreditsSequence(data);
  a.step(1 / 60);
  assert.equal(a.pixels, 0);
  a.step(1 / 60);
  assert.equal(a.pixels, 1);
  a.step(10 - 2 / 60);
  for (let i = 0; i < 600; i++) {
    b.step(1 / 60);
  }
  assert.equal(a.pixels, 300);
  assert.equal(b.pixels, 300);
  assert.equal(a.finished, false);
  a.step((data.rows.at(-1).y + 20) / 30 - 10);
  assert.equal(a.finished, true);
});
