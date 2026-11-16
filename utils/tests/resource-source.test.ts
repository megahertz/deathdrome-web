import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioDirector } from '../../src/audio-director.ts';
import {
  DEFAULT_IMAGE,
  readImage,
  resolveImage,
} from '../../src/resource-source.ts';
test('default CD is requested at the deployment-relative assets/cd.iso and a 404 opens selection', async () => {
  const calls: unknown[] = [],
    base = 'https://example.com/games/deathdrome/';
  const missing = await readImage(DEFAULT_IMAGE, {
    base,
    allowMissing: true,
    fetchImage: async (url) => {
      calls.push(url);
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(missing, null);
  assert.deepEqual(calls, [
    'https://example.com/games/deathdrome/assets/cd.iso',
  ]);
  const result = await readImage(DEFAULT_IMAGE, {
    base,
    allowMissing: true,
    fetchImage: async () => new Response(new Uint8Array([1, 2, 3])),
  });
  assert.equal(result!.url, calls[0]);
  assert.deepEqual([...new Uint8Array(result!.bytes)], [1, 2, 3]);
});
test('image overrides resolve local and remote URLs and report missing explicit files', async () => {
  const base = 'http://localhost:8080/sub/index.html?image=assets/demo.zip';
  assert.equal(
    resolveImage('assets/demo.zip', base),
    'http://localhost:8080/sub/assets/demo.zip',
  );
  assert.equal(
    resolveImage('https://example.com/files/disc.iso', base),
    'https://example.com/files/disc.iso',
  );
  // oxlint-disable no-script-url -- Verify that script URLs are rejected.
  assert.throws(() => resolveImage('javascript:alert(1)', base), /HTTP/);
  // oxlint-enable no-script-url
  await assert.rejects(
    () =>
      readImage('assets/missing.iso', {
        base,
        fetchImage: async () => new Response(null, { status: 404 }),
      }),
    /HTTP 404/,
  );
  await assert.rejects(
    () =>
      readImage(DEFAULT_IMAGE, {
        base,
        allowMissing: true,
        fetchImage: async () => new Response(null, { status: 500 }),
      }),
    /HTTP 500/,
  );
});
test('an image without CD tracks never requests music while PCM effects still play', () => {
  const sources: string[] = [],
    director = new AudioDirector({
      musicTracks: [],
      createAudio: (src) => {
        sources.push(src);
        return Object.assign(new EventTarget(), {
          cloneNode() {
            return this;
          },
          play() {
            return Promise.resolve();
          },
          pause() {},
        }) as unknown as HTMLAudioElement;
      },
    });
  director.unlock();
  director.playMusic(11);
  director.playMusic(3);
  director.sound('compopen');
  assert.deepEqual(sources, ['assets/audio/compopen.wav']);
  assert.equal(director.music, null);
});

test('nocache is a presence flag and never changes the full-CD default', async () => {
  const { imageRequest } = await import('../../src/resource-source.ts');
  assert.deepEqual(imageRequest('?nocache'), {
    image: 'assets/cd.iso',
    noCache: true,
    defaultImage: true,
  });
  assert.deepEqual(imageRequest('?image=assets/demo.zip&nocache=0'), {
    image: 'assets/demo.zip',
    noCache: true,
    defaultImage: false,
  });
  const options: (RequestInit | undefined)[] = [];
  await readImage(DEFAULT_IMAGE, {
    base: 'http://192.168.1.2:8080/',
    noCache: true,
    fetchImage: async (_url, init) => {
      options.push(init);
      return new Response(new Uint8Array([4]));
    },
  });
  assert.deepEqual(options, [{ cache: 'no-store' }]);
});
test('streamed downloads report actual bytes with and without content length', async () => {
  for (const known of [false, true]) {
    const updates: unknown[] = [],
      bytes = new Uint8Array([2, 4, 6, 8]);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 2));
        c.enqueue(bytes.slice(2));
        c.close();
      },
    });
    // oxlint-disable-next-line no-await-in-loop -- Each case installs and restores shared browser mocks before the next case.
    const result = await readImage(DEFAULT_IMAGE, {
      base: 'https://game.test/',
      fetchImage: async () =>
        new Response(stream, {
          headers: known ? { 'Content-Length': '4' } : {},
        }),
      onProgress: (info: unknown) => updates.push(info),
    });
    assert.deepEqual(new Uint8Array(result!.bytes), bytes);
    assert.deepEqual(updates[1], { loaded: 2, total: known ? 4 : 0 });
    assert.deepEqual(updates.at(-1), { loaded: 4, total: 4 });
  }
});
test('LAN resource URLs cover models, textures and recorded music without a service worker', async () => {
  const { resourceURL, useResourceURLs } =
    await import('../../src/resource-urls.ts');
  let i = 0;
  const revoked = [];
  try {
    useResourceURLs(
      [
        { path: 'models/arena1.json', data: new Blob(['{}']) },
        { path: 'audio/track11.wav', data: new Blob(['pcm']) },
      ],
      { createURL: () => `blob:test/${++i}` },
    );
    assert.equal(
      resourceURL('assets/models/arena1.json?schema=7'),
      'blob:test/1',
    );
    const sources: string[] = [],
      director = new AudioDirector({
        musicTracks: [11],
        musicExtension: 'wav',
        createAudio: (src) => {
          sources.push(src);
          return Object.assign(new EventTarget(), {
            play() {
              return Promise.resolve();
            },
            pause() {},
          }) as unknown as HTMLAudioElement;
        },
      });
    director.playMusic(11);
    assert.deepEqual(sources, ['blob:test/2']);
  } finally {
    useResourceURLs(null, { revokeURL: (url) => revoked.push(url) });
  }
  assert.equal(revoked.length, 2);
  assert.equal(resourceURL('assets/images/a.png'), 'assets/images/a.png');
});

test('extensionless image URLs are downloaded unchanged for content-based ISO detection', async () => {
  const url = 'https://media.test/download?id=42',
    calls: unknown[] = [],
    payload = new Uint8Array(17 * 2048);
  payload.set([67, 68, 48, 48, 49], 16 * 2048 + 1);
  const result = await readImage(url, {
    base: 'https://game.test/',
    fetchImage: async (request, options) => {
      calls.push({ request, options });
      return new Response(payload, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    },
  });
  assert.equal(result!.url, url);
  assert.deepEqual(calls, [{ request: url, options: undefined }]);
  assert.deepEqual(new Uint8Array(result!.bytes), payload);
});
