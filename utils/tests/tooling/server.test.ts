import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  byteRange,
  createDevServer,
  DEV_MEDIA_SOURCES,
  resolveRoute,
  type ServeMode,
} from '../../serve.ts';

async function fixture<T>(action: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), 'dd-server-'));
  try {
    await Promise.all(
      [
        'src',
        'public/vendor',
        '.build/src',
        '.build/utils/browser',
        'utils/browser',
        'private/disc',
        'private/assets',
        'dist',
      ].map((name) => mkdir(join(root, name), { recursive: true })),
    );
    await Promise.all([
      writeFile(join(root, 'src/index.html'), '<title>Development</title>'),
      writeFile(join(root, '.build/src/game.js'), 'export const ready = true;'),
      writeFile(
        join(root, '.build/src/resource-defaults.js'),
        "export const image='assets/cd.iso';",
      ),
      writeFile(
        join(root, 'public/vendor/engine.js'),
        'export const vendor = true;',
      ),
      writeFile(
        join(root, 'public/test.wasm'),
        new Uint8Array([0, 97, 115, 109]),
      ),
      writeFile(
        join(root, '.build/utils/browser/verification.js'),
        'export const diagnostic = true;',
      ),
      writeFile(
        join(root, 'utils/browser/verification.html'),
        '<title>Diagnostic</title>',
      ),
      writeFile(
        join(root, 'private/disc/Death-Drome_Win_EN.zip'),
        '0123456789',
      ),
      writeFile(join(root, 'private/assets/cd.iso'), 'synthetic'),
      writeFile(join(root, 'dist/index.html'), '<title>Published</title>'),
    ]);
    return await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function serving<T>(
  root: string,
  mode: ServeMode,
  action: (url: string) => Promise<T>,
) {
  const server = createDevServer({ root, mode, compile: async () => {} });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      server.closeAllConnections();
    });
  }
}

test('development routes compiled modules, diagnostics and canonical private discs', async () => {
  await fixture(async (root) => {
    assert.deepEqual(await resolveRoute('/', { root }), {
      file: join(root, 'src/index.html'),
    });
    for (const [url, path] of [
      ['/game.js', '.build/src/game.js'],
      ['/verification.js', '.build/utils/browser/verification.js'],
      ['/verification.html', 'utils/browser/verification.html'],
      ['/vendor/engine.js', 'public/vendor/engine.js'],
      [DEV_MEDIA_SOURCES.cd, 'private/disc/Death-Drome_Win_EN.zip'],
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Check overlay precedence in a fixed synthetic project.
      assert.deepEqual(await resolveRoute(url, { root }), {
        file: join(root, path),
      });
    }
    assert.equal(
      await resolveRoute('/__proto__/disc/file.zip', { root }),
      undefined,
    );
    assert.equal(await resolveRoute('/constructor', { root }), undefined);
    const defaults = await resolveRoute('/resource-defaults.js?build=example', {
      root,
    });
    assert.ok(defaults?.body?.includes(DEV_MEDIA_SOURCES.cd));
  });
});

test('clean and published servers cannot expose private media, diagnostics, dotfiles or traversal paths', async () => {
  await fixture(async (root) => {
    // oxlint-disable no-await-in-loop -- Each case checks a distinct protected route.
    for (const mode of ['clean', 'preview'] as const) {
      for (const path of [
        '/private/disc/Death-Drome_Win_EN.zip',
        '/assets/cd.iso',
        '/verification.js',
        '/verification.html',
        '/.git/config',
        '/utils/serve.ts',
        '/private/%2e%2e/package.json',
        '/%2e%2e/private/video.mkv',
        '/private%5cdisc/Death-Drome_Win_EN.zip',
        '/%00bad',
        '/%XX',
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- Verify every denied route independently without sharing response state.
        assert.equal(
          await resolveRoute(path, { root, mode }),
          undefined,
          `${mode}: ${path}`,
        );
      }
    }
    // oxlint-enable no-await-in-loop
    await symlink(
      join(root, 'private/disc/Death-Drome_Win_EN.zip'),
      join(root, 'public/leak.zip'),
    );
    assert.equal(
      await resolveRoute('/leak.zip', { root, mode: 'clean' }),
      undefined,
    );
    assert.deepEqual(await resolveRoute('/', { root, mode: 'preview' }), {
      file: join(root, 'dist/index.html'),
    });
    assert.deepEqual(
      await resolveRoute('/resource-defaults.js', { root, mode: 'clean' }),
      { file: join(root, '.build/src/resource-defaults.js') },
    );
  });
});

test('HTTP server streams discs with byte ranges, HEAD, browser isolation and correct module/wasm MIME types', async () => {
  await fixture(async (root) =>
    serving(root, 'development', async (url) => {
      const module = await fetch(`${url}/game.js`);
      assert.equal(module.status, 200);
      assert.match(module.headers.get('Content-Type') ?? '', /javascript/);
      assert.equal(
        module.headers.get('Cross-Origin-Opener-Policy'),
        'same-origin',
      );
      assert.equal(
        module.headers.get('Cross-Origin-Embedder-Policy'),
        'require-corp',
      );
      assert.equal(module.headers.get('Cache-Control'), 'no-cache');
      assert.match(await module.text(), /ready/);
      const wasm = await fetch(`${url}/test.wasm`);
      assert.equal(wasm.headers.get('Content-Type'), 'application/wasm');
      await wasm.arrayBuffer();
      const part = await fetch(`${url}${DEV_MEDIA_SOURCES.cd}`, {
        headers: { Range: 'bytes=2-5' },
      });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('Content-Range'), 'bytes 2-5/10');
      assert.equal(part.headers.get('Content-Length'), '4');
      assert.equal(await part.text(), '2345');
      const suffix = await fetch(`${url}${DEV_MEDIA_SOURCES.cd}`, {
        headers: { Range: 'bytes=-3' },
      });
      assert.equal(await suffix.text(), '789');
      const invalid = await fetch(`${url}${DEV_MEDIA_SOURCES.cd}`, {
        headers: { Range: 'bytes=50-' },
      });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');
      const head = await fetch(`${url}${DEV_MEDIA_SOURCES.cd}`, {
        method: 'HEAD',
      });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('Content-Length'), '10');
      assert.equal(await head.text(), '');
      const denied = await fetch(`${url}/game.js`, { method: 'POST' });
      assert.equal(denied.status, 405);
      assert.equal(denied.headers.get('Allow'), 'GET, HEAD');
    }),
  );
});

test('range validation rejects empty, reversed, multi-range and unsafe offsets', () => {
  assert.deepEqual(byteRange('bytes=2-', 10), { start: 2, end: 9 });
  assert.deepEqual(byteRange('bytes=0-99', 10), { start: 0, end: 9 });
  for (const range of [
    'bytes=-',
    'bytes=-0',
    'bytes=5-2',
    'bytes=1-2,4-5',
    'bytes=9007199254740993-',
    'other=1-2',
  ]) {
    assert.equal(byteRange(range, 10), undefined);
  }
  assert.equal(byteRange('bytes=0-', 0), undefined);
});
