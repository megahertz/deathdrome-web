import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readOptions } from '../../src/audio-director.ts';
import {
  paletteBrightness,
  brightnessOffset,
  DEFAULT_BRIGHTNESS,
} from '../../src/palette-brightness.ts';
test('palette brightness matches original DirectDraw upload arithmetic for every byte and slider level', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/palette-brightness-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.initialBrightness, DEFAULT_BRIGHTNESS);
  assert.equal(readOptions({}).brightness, 4);
  for (let i = 0; i < audit.fixtures.length; i++) {
    const f = audit.fixtures[i];
    assert.deepEqual(
      paletteBrightness(f.color, f.level),
      audit.native[i],
      `native palette entry ${i}`,
    );
  }
});
test('brightness offsets clamp opaque RGB and retain alpha/flags independently', () => {
  assert.deepEqual(paletteBrightness([0, 8, 255, 0], 0), [0, 0, 223, 0]);
  assert.deepEqual(paletteBrightness([0, 8, 255, 127], 9), [40, 48, 255, 127]);
  assert.equal(brightnessOffset(4), 0);
  assert.equal(brightnessOffset(9), 40);
  assert.equal(brightnessOffset(0), -32);
  assert.deepEqual(readOptions({ brightness: 9 }).brightness, 9);
});
