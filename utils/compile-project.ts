import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileProject } from './compile.ts';
import { exists, hash, ROOT, walkFiles } from './project.ts';

const pending = new Map<string, Promise<void>>();

async function prepare(root: string, force: boolean) {
  const [engine, browser] = await Promise.all([
    walkFiles(join(root, 'src')),
    walkFiles(join(root, 'utils/browser')),
  ]);
  const sources = [
    ...engine.filter((path) => path.endsWith('.ts')),
    ...browser.filter((path) => path.endsWith('.ts')),
    join(root, 'utils/compile.ts'),
    join(root, 'tsdown.config.ts'),
    join(root, 'package-lock.json'),
  ];
  const details = await Promise.all(
    sources.toSorted().map(async (path) => {
      const info = await stat(path, { bigint: true });
      return `${path}:${info.mtimeNs}:${info.size}`;
    }),
  );
  const fingerprint = hash(details.join('\n'));
  const stamp = join(root, '.build/source-fingerprint');
  if (
    !force &&
    (await exists(stamp)) &&
    (await readFile(stamp, 'utf8')) === fingerprint
  ) {
    return;
  }
  await compileProject(root);
  await writeFile(stamp, fingerprint);
}

export async function compileSources(root = ROOT, force = false) {
  const existing = pending.get(root);
  if (existing) {
    await existing;
    if (force) {
      await compileSources(root, true);
    }
    return;
  }
  const work = prepare(root, force);
  pending.set(root, work);
  try {
    await work;
  } finally {
    pending.delete(root);
  }
}
