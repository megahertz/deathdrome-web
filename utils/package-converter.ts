import { zipSync, type Zippable } from 'fflate';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './project.ts';

export async function packageConverter(root = ROOT) {
  const output = join(root, 'public/resource-code');
  const scripts = [
    'extract_assets.py',
    'export_models.py',
    'export_support.py',
    'export_training.py',
    'export_credits.py',
    'export_recharge_paths.py',
    'export_scene_effects.py',
    'extract_regions.py',
  ];
  const converter = join(root, 'utils/browser_converter');
  const names = await readdir(converter);
  const extra = names.filter((name) => name.endsWith('.py'));
  const entries = await Promise.all([
    ...scripts.map(
      async (name) =>
        [`utils/${name}`, await readFile(join(root, 'utils', name))] as const,
    ),
    ...extra.map(
      async (name) =>
        [`utils/${name}`, await readFile(join(converter, name))] as const,
    ),
    (async () =>
      [
        'utils/case-catalog.json',
        await readFile(join(converter, 'case-catalog.json')),
      ] as const)(),
  ]);
  const archive: Zippable = {};
  for (const [name, bytes] of entries.toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    archive[name] = [bytes, { mtime: new Date(1980, 0, 1) }];
  }
  const bytes = zipSync(archive, { level: 9 });
  const blast = await readFile(
    join(root, 'utils/unshieldv3-master/blast.h'),
    'utf8',
  );
  const license = await readFile(join(root, 'utils/unshieldv3-master/LICENSE'));
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(join(output, 'converter.zip'), bytes),
    writeFile(
      join(output, 'BLAST-LICENSE.txt'),
      blast.replaceAll('\r\n', '\n').split('/*\n * blast()')[0],
    ),
    writeFile(join(output, 'UNSHIELD-LICENSE.txt'), license),
  ]);
  return bytes.byteLength;
}

if (import.meta.main) {
  process.stdout.write(
    `Code archive: ${await packageConverter()} bytes; no game files\n`,
  );
}
