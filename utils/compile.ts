import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'tsdown';
import { browserBundles, ENGINE_ENTRIES } from '../tsdown.config.ts';
import { ROOT, isWithin } from './project.ts';

export async function compileProject(root = ROOT, entries = ENGINE_ENTRIES) {
  const output = join(root, '.build');
  const staging = join(output, `staging-${process.pid}`);
  await mkdir(output, { recursive: true });
  try {
    const configs = await browserBundles(root, staging, entries);
    const results = await Promise.allSettled(
      configs.map((config) => build({ ...config, config: false })),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      throw failed.reason;
    }
    const handles = results.map((result) => {
      if (result.status === 'rejected') {
        throw result.reason;
      }
      return result.value;
    });
    const modules = handles[0].bundles.flatMap((bundle) =>
      bundle.chunks.flatMap((chunk) =>
        chunk.type === 'chunk' ? Object.keys(chunk.modules) : [],
      ),
    );
    if (modules.some((path) => isWithin(join(root, 'private'), path))) {
      throw new Error(
        'Files from private/ must be loaded at runtime, never bundled',
      );
    }
    const engine = handles[0].bundles
      .flatMap((bundle) => bundle.chunks.map((chunk) => chunk.fileName))
      .toSorted();
    // Replace the generated inventory only after every bundle succeeds. Deleted
    // entries and obsolete hashed chunks cannot remain available from the server.
    await Promise.all(
      ['src', 'utils/browser'].map(async (name) => {
        const destination = join(output, name);
        await rm(destination, { recursive: true, force: true });
        await mkdir(join(staging, name), { recursive: true });
        if (name.includes('/')) {
          await mkdir(join(output, 'utils'), { recursive: true });
        }
        await rename(join(staging, name), destination);
      }),
    );
    await writeFile(
      join(output, 'engine-files.json'),
      `${JSON.stringify(engine)}\n`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await compileProject();
}
