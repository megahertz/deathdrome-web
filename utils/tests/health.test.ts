import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { healthAfterDelta } from '../../src/health.ts';
test('profile health math/protection matches 480 original executable cases', () => {
  const a = JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/health-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
  for (const [i, f] of a.fixtures.entries()) {
    assert.equal(healthAfterDelta(f!.health, f!.delta, f), a.native[i]);
  }
});
