import assert from 'node:assert/strict';
import test from 'node:test';
import { transparentTouchIcon } from '../../src/touch-icon.ts';
test('dark rectangular mattes and neutral corner steel become transparent while glyph RGB stays unchanged', () => {
  for (const [name, color] of [
    ['FIRE', [240, 24, 8]],
    ['JUMP', [35, 180, 30]],
    ['BARRIER', [10, 180, 200]],
    ['WEAPON', [240, 155, 20]],
  ] as const) {
    const data = new Uint8ClampedArray([18, 20, 22, 255, ...color, 255]);
    const before = [...data];
    transparentTouchIcon(data, 2, 1, name);
    assert.equal(data[3], 0, name);
    assert.equal(data[7], 255, name);
    for (const i of [0, 1, 2, 4, 5, 6]) {
      assert.equal(data[i], before[i]);
    }
  }
});
test('the gray projectile inside WEAPON survives, and gray rectangle corners do not', () => {
  const data = new Uint8ClampedArray(180 * 174 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set([130, 130, 130, 255], i);
  }
  transparentTouchIcon(data, 180, 174, 'WEAPON');
  assert.equal(data[3], 0);
  assert.equal(data[(90 * 180 + 90) * 4 + 3], 255);
});
