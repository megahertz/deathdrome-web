import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { TypewriterSequence } from '../../src/typewriter.ts';
test('all five training pages retain original strings at their executable addresses', async () => {
  const data = JSON.parse(
      await readFile(
        new URL('../../private/assets/training.json', import.meta.url),
        'utf8',
      ),
    ),
    exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    );
  assert.equal(data.pages.length, 5);
  for (const page of data.pages) {
    for (const p of page.paragraphs) {
      const offset = Number(p.address) - 0x48_00_00 + 0x6_8e_00,
        end = exe.indexOf(0, offset);
      assert.equal(p.text, exe.subarray(offset, end).toString('ascii'));
      assert.ok(p.x >= 0 && p.y < 180);
    }
  }
  assert.equal(data.pages[1].background, 'runnerc');
  assert.equal(data.pages[3].icons.length, 5);
});
test('typewriter delays and cadence are independent of requestAnimationFrame chunk size', () => {
  const paragraphs = [
      { text: 'ONE\nTWO', intervalFrames: 1, delayFrames: 10, pauseFrames: 5 },
      { text: 'THREE', intervalFrames: 2, delayFrames: 10, pauseFrames: 5 },
    ],
    a = new TypewriterSequence(paragraphs),
    b = new TypewriterSequence(paragraphs);
  a.step(10 / 60);
  assert.equal(a.visible[0], 0);
  a.step(1 / 60);
  assert.equal(a.visible[0], 1);
  b.step(11 / 60);
  assert.deepEqual(a.visible, b.visible);
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60);
  }
  for (let i = 0; i < 24; i++) {
    b.step(5 / 60);
  }
  assert.deepEqual(a.visible, b.visible);
  assert.equal(a.done, true);
  assert.equal(b.done, true);
});
