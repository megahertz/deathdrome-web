import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { exists, ROOT, run, walkFiles } from './project.ts';

const { values } = parseArgs({
  options: { portable: { type: 'boolean' }, reference: { type: 'boolean' } },
});
if (values.portable && values.reference) {
  throw new Error('Choose --portable or --reference');
}
const referenceFiles = [
  'private/original/game/RUN/ddrome.exe',
  'private/assets/region-data.json',
  'private/verification/world-regions-native.json',
];
const referenceStates = await Promise.all(
  referenceFiles.map((path) => exists(join(ROOT, path))),
);
const reference = referenceStates.every(Boolean);
if (values.reference && !reference) {
  throw new Error(
    'Reference tests require the local private/ installation and audit fixtures. No original media is bundled.',
  );
}
// These fixtures exercise the real Python converter and its binary archive parsers.
await run(env.PYTHON ?? 'python3', ['utils/test_browser_media.py']);
const folder = join(ROOT, 'utils/tests');
const names = await readdir(folder);
let files = names
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => join(folder, name));
const portable = values.portable || !reference;
if (portable) {
  const candidates = await Promise.all(
    files.map(async (path) => ({ path, source: await readFile(path, 'utf8') })),
  );
  files = candidates
    .filter(
      ({ source }) =>
        !['private/', 'readFile', 'readFileSync'].some((term) =>
          source.includes(term),
        ),
    )
    .map(({ path }) => path);
}
// Tooling tests always use synthetic temporary projects; they run in public checkouts too.
const toolingFiles = await walkFiles(join(folder, 'tooling'));
const tooling = toolingFiles.filter((path) => path.endsWith('.test.ts'));
files = [...files, ...tooling].toSorted();
process.stdout.write(
  `${portable ? 'Portable' : 'Full local'} suite: ${files.length} test files.\n`,
);
await run(
  process.execPath,
  [
    '--import',
    './utils/tests/setup.ts',
    '--test',
    '--test-isolation=none',
    ...files.map((path) => relative(ROOT, path)),
  ],
  { env: { ...env, ...(portable ? { DD_PORTABLE_TESTS: '1' } : {}) } },
);
