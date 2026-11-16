import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { engineFiles, publicFiles, type BuildManifest } from './build.ts';
import { exists, hash, ROOT, walkFiles, relativeURL } from './project.ts';

export async function checkDist(directory = join(ROOT, 'dist'), root = ROOT) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'build-manifest.json'), 'utf8'),
  ) as BuildManifest;
  const [engine, staticFiles] = await Promise.all([
    engineFiles(root),
    publicFiles(root),
  ]);
  const expected = new Set([...engine.keys(), ...staticFiles]);
  const files = await walkFiles(directory);
  const actual = new Set(files.map((path) => relativeURL(directory, path)));
  assert.deepEqual(
    actual,
    new Set([...expected, 'build-manifest.json']),
    'Unexpected/missing distribution files',
  );
  assert.deepEqual(
    new Set(Object.keys(manifest.files)),
    expected,
    'Build manifest inventory differs',
  );
  assert.equal(manifest.gameResourcesIncluded, false);
  const gameAssets = await walkFiles(join(directory, 'assets'));
  assert.equal(
    gameAssets.length,
    0,
    'Original media cannot be included in assets/',
  );
  await Promise.all(
    Object.entries(manifest.files).map(async ([name, digest]) => {
      assert.equal(
        hash(await readFile(join(directory, name))),
        digest,
        `Hash mismatch: ${name}`,
      );
    }),
  );
  const entries = Object.keys(
    unzipSync(await readFile(join(directory, 'resource-code/converter.zip'))),
  );
  assert.ok(
    entries.length > 0 &&
      entries.every(
        (name) =>
          name.startsWith('utils/') &&
          !name.split('/').includes('..') &&
          /\.(?:py|json)$/.test(name),
      ),
  );
  assert.ok(entries.includes('utils/extract_regions.py'));
  await Promise.all(
    files
      .filter(
        (path) =>
          path.endsWith('.js') &&
          relativeURL(directory, path) === basename(path),
      )
      .map(async (path) => {
        const source = await readFile(path, 'utf8');
        const imports = [
          ...source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.\/[^'"]+)['"]/g),
        ];
        await Promise.all(
          imports.map(async ([, target]) => {
            assert.ok(
              await exists(join(directory, target.split('?')[0])),
              `Broken module import in ${basename(path)}: ${target}`,
            );
          }),
        );
      }),
  );
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  assert.ok(
    html.includes('"#three"') && html.includes('vendor/three.module.js'),
  );
  await Promise.all(
    ['THREE-LICENSE.txt', 'pyodide/LICENSE', 'pyodide/Python-LICENSE.txt'].map(
      async (name) => {
        assert.ok(await exists(join(directory, 'vendor', name)));
      },
    ),
  );
  return {
    buildId: manifest.buildId,
    files: expected.size,
    gameResourcesIncluded: false,
    privateFilesIncluded: false,
    passed: true,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { dir: { type: 'string' } } });
  process.stdout.write(
    `${JSON.stringify(await checkDist(values.dir), undefined, 2)}\n`,
  );
}
