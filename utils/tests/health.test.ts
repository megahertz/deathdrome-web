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
  a.fixtures.forEach(
    (
      f:
        | {
            health: number;
            delta: number;
            profileType?: number | undefined;
            shielded?: boolean | undefined;
            invulnerableHuman?: boolean | undefined;
          }
        | undefined,
      i: number,
    ) => assert.equal(healthAfterDelta(f!.health, f!.delta, f), a.native[i]),
  );
});
