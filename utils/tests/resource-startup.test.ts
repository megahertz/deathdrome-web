import assert from 'node:assert/strict';
import test from 'node:test';
import {
  startResources,
  reusableInstallation,
} from '../../src/resource-startup.ts';
const base = 'https://example.test/game/',
  version = 6;
const request = (
  image = 'assets/cd.iso',
  defaultImage = true,
  noCache = false,
) => ({ image, defaultImage, noCache });
const installation = (source = 'file:DeathDrome.iso') => ({
  id: 'digest-v6',
  converterVersion: version,
  source,
});
async function run(
  req: { image: string; defaultImage: boolean; noCache: boolean },
  saved: { id: string; converterVersion: number; source: string } | null,
  {
    healthy = true,
    readError = null,
  }: { healthy?: boolean; readError?: Error | null } = {},
) {
  const calls: {
    reads: number;
    checks: number;
    images: string[];
    launched: import('../../src/resource-types.ts').SavedSource[];
    errors: unknown[];
  } = { reads: 0, checks: 0, images: [], launched: [], errors: [] };
  const route = await startResources(req, {
    version,
    base,
    readInstalled: async () => {
      calls.reads++;
      if (readError) {
        throw readError;
      }
      return saved;
    },
    hasResources: async () => {
      calls.checks++;
      return healthy;
    },
    launch: async (profile) => calls.launched.push(profile),
    loadImage: async (url: any) => calls.images.push(url),
    onCacheError: (error) => calls.errors.push(error),
  });
  return { route, ...calls };
}
test('a normal return visit launches a local-file installation without requesting any image', async () => {
  const saved = installation(),
    result = await run(request(), saved);
  assert.equal(result.route, 'cache');
  assert.deepEqual(result.images, []);
  assert.deepEqual(result.launched, [saved]);
  assert.equal(result.checks, 1);
});
test('an explicit URL reuses only the same resolved source', async () => {
  const saved = installation(base + 'assets/demo.zip'),
    same = await run(request('./assets/demo.zip', false), saved);
  assert.equal(same.route, 'cache');
  assert.deepEqual(same.images, []);
  const other = await run(request('assets/nomusic.iso', false), saved);
  assert.equal(other.route, 'image');
  assert.deepEqual(other.images, ['assets/nomusic.iso']);
  assert.deepEqual(other.launched, []);
});
test('nocache bypasses database reads and launches no saved installation', async () => {
  const result = await run(
    request('assets/cd.iso', true, true),
    installation(),
    { readError: new Error('must not read storage') },
  );
  assert.equal(result.route, 'image');
  assert.equal(result.reads, 0);
  assert.equal(result.checks, 0);
  assert.deepEqual(result.images, ['assets/cd.iso']);
  assert.deepEqual(result.launched, []);
});
test('missing, old-converter and incomplete caches take the image import path', async () => {
  for (const [saved, healthy] of [
    [null, true],
    [{ ...installation(), converterVersion: 5 }, true],
    [installation(), false],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Each case installs and restores shared browser mocks before the next case.
    const result = await run(request(), saved, { healthy });
    assert.equal(result.route, 'image');
    assert.equal(result.images.length, 1);
    assert.deepEqual(result.launched, []);
  }
});
test('a storage read error still allows selecting or downloading the original', async () => {
  const error = new Error('storage unavailable'),
    result = await run(request(), null, { readError: error });
  assert.equal(result.route, 'image');
  assert.deepEqual(result.errors, [error]);
  assert.deepEqual(result.images, ['assets/cd.iso']);
});
test('a cached game launch error is surfaced without silently downloading a large disc', async () => {
  let images = 0;
  await assert.rejects(
    startResources(request(), {
      version,
      base,
      readInstalled: async () => installation(),
      hasResources: async () => true,
      launch: async () => {
        throw new Error('game failed');
      },
      loadImage: async () => images++,
    }),
    /game failed/,
  );
  assert.equal(images, 0);
});
test('explicit remote URLs and local-file sources are never substituted for one another', () => {
  assert.equal(
    reusableInstallation(
      installation(),
      request('https://archive.test/disc.iso', false),
      { version, base },
    ),
    false,
  );
  assert.equal(
    reusableInstallation(
      installation('https://archive.test/disc.iso'),
      request('https://archive.test/disc.iso', false),
      { version, base },
    ),
    true,
  );
  assert.equal(
    reusableInstallation(
      installation('https://archive.test/another.iso'),
      request('https://archive.test/disc.iso', false),
      { version, base },
    ),
    false,
  );
});
