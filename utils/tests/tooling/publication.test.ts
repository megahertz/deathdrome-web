import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { build, publicFiles } from '../../build.ts';
import { checkDist } from '../../check-dist.ts';
import { compileProject } from '../../compile.ts';
import { packageConverter } from '../../package-converter.ts';
import { exists, ROOT } from '../../project.ts';

async function temporary<T>(action: (folder: string) => Promise<T>) {
  const folder = await mkdtemp(join(tmpdir(), 'dd-tooling-'));
  try {
    return await action(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test('publication inventory contains only authored code, static art and converter code', async () => {
  const files = await publicFiles();
  assert.ok(files.includes('resource-code/converter.zip'));
  assert.ok(!files.some((name) => /^(?:assets|private)\//.test(name)));
  const ignored = await readFile(join(ROOT, '.gitignore'), 'utf8');
  assert.ok(ignored.split('\n').includes('/private/'));
});

test('converter packaging is deterministic and contains only the intended Python implementation', async () => {
  await packageConverter();
  const path = join(ROOT, 'public/resource-code/converter.zip');
  const first = await readFile(path);
  await packageConverter();
  assert.deepEqual(await readFile(path), first);
  const entries = unzipSync(first);
  assert.ok(Object.hasOwn(entries, 'utils/extract_regions.py'));
  assert.ok(
    Object.keys(entries).every(
      (name) => name.startsWith('utils/') && /\.(?:py|json)$/.test(name),
    ),
  );
});

test('build inventory and hashes reject extra files and modified contents', async () => {
  await temporary(async (folder) => {
    const output = join(folder, 'site');
    await build(output);
    const result = await checkDist(output);
    assert.equal(result.passed, true);
    assert.equal(await exists(join(output, 'region-data.json')), false);
    await writeFile(join(output, 'unapproved.iso'), 'synthetic');
    await assert.rejects(checkDist(output), /Unexpected\/missing/);
    await rm(join(output, 'unapproved.iso'));
    await writeFile(join(output, 'game.js'), 'tampered');
    await assert.rejects(checkDist(output), /Hash mismatch/);
  });
});

test('build cannot replace sources, private media, tooling, ancestor folders or unmarked output', async () => {
  for (const folder of [
    'src',
    'public',
    'private',
    'utils',
    '.git',
    '.build',
    'node_modules',
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Each rejected destination must leave the shared project untouched.
    await assert.rejects(
      build(join(ROOT, folder, 'nested-output')),
      /separate output/,
    );
  }
  await assert.rejects(build(ROOT), /separate output/);
  await temporary(async (folder) => {
    await writeFile(join(folder, 'keep.txt'), 'preserve');
    await assert.rejects(build(folder), /not a generated distribution/);
    assert.equal(await readFile(join(folder, 'keep.txt'), 'utf8'), 'preserve');
    const link = join(folder, 'source-link');
    await symlink(join(ROOT, 'src'), link, 'dir');
    await assert.rejects(build(join(link, 'nested-output')), /separate output/);
  });
});

test('tsdown bundles browser entries, erases types and removes obsolete outputs', async () => {
  await temporary(async (folder) => {
    await Promise.all(
      ['src', 'utils/browser'].map((name) =>
        mkdir(join(folder, name), { recursive: true }),
      ),
    );
    await Promise.all([
      writeFile(join(folder, 'src/kept.ts'), 'export const value:number=42;'),
      writeFile(
        join(folder, 'src/removed.ts'),
        "import {value} from './kept.ts';export {value};",
      ),
      writeFile(
        join(folder, 'utils/browser/check.ts'),
        "import {value} from '../../src/kept.ts';export {value};",
      ),
    ]);
    await compileProject(folder, ['kept', 'removed']);
    assert.ok(await exists(join(folder, '.build/src/removed.js')));
    const bundled = await readFile(join(folder, '.build/src/kept.js'), 'utf8');
    assert.equal(bundled.includes(':number'), false);
    assert.match(
      await readFile(join(folder, '.build/utils/browser/check.js'), 'utf8'),
      /42/,
    );
    await Promise.all([
      rm(join(folder, 'src/removed.ts')),
      rm(join(folder, 'utils/browser/check.ts')),
    ]);
    await writeFile(join(folder, '.build/src/obsolete-hash.js'), 'old chunk');
    await compileProject(folder, ['kept']);
    assert.equal(
      await exists(join(folder, '.build/src/obsolete-hash.js')),
      false,
    );
    assert.equal(await exists(join(folder, '.build/src/kept.js')), true);
    assert.equal(await exists(join(folder, '.build/src/removed.js')), false);
    const valid = await readFile(join(folder, '.build/src/kept.js'), 'utf8');
    await mkdir(join(folder, 'private'));
    await writeFile(
      join(folder, 'private/fixture.json'),
      '{"sentinel":"not-for-publication"}',
    );
    await writeFile(
      join(folder, 'src/kept.ts'),
      "import data from '../private/fixture.json';export const value=data.sentinel;",
    );
    await assert.rejects(compileProject(folder, ['kept']), /never bundled/);
    assert.equal(
      await readFile(join(folder, '.build/src/kept.js'), 'utf8'),
      valid,
    );

    assert.equal(
      await exists(join(folder, '.build/utils/browser/check.js')),
      false,
    );
  });
});

test('shared helpers share one runtime chunk and preserve mutable state across entries', async () => {
  await temporary(async (folder) => {
    await Promise.all(
      ['src', 'utils/browser'].map((name) =>
        mkdir(join(folder, name), { recursive: true }),
      ),
    );
    await Promise.all([
      writeFile(join(folder, 'package.json'), '{"type":"module"}'),
      writeFile(
        join(folder, 'src/counter.ts'),
        'export let count = 0; export function increment() { count += 1; return count; }',
      ),
      writeFile(
        join(folder, 'src/double.ts'),
        'export function double(value: number) { return value * 2; }',
      ),
      writeFile(
        join(folder, 'src/first.ts'),
        "import {increment} from './counter.ts'; import {double} from './double.ts'; export function advance() { return double(increment()); }",
      ),
      writeFile(
        join(folder, 'src/second.ts'),
        "import {count} from './counter.ts'; import {double} from './double.ts'; export function current() { return double(count); }",
      ),
    ]);
    await compileProject(folder, ['first', 'second']);
    const output = join(folder, '.build/src');
    const files = await readdir(output);
    const chunks = files.filter((name) => name.startsWith('shared-'));
    assert.equal(chunks.length, 1);
    assert.match(chunks[0], /^shared-runtime-/);
    const first = await import(pathToFileURL(join(output, 'first.js')).href);
    const second = await import(pathToFileURL(join(output, 'second.js')).href);
    assert.equal(second.current(), 0);
    assert.equal(first.advance(), 2);
    assert.equal(second.current(), 2);
  });
});
