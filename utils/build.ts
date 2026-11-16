import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compileSources } from './compile-project.ts';
import { packageConverter } from './package-converter.ts';
import {
  exists,
  hash,
  isWithin,
  ROOT,
  walkFiles,
  relativeURL,
} from './project.ts';

export interface BuildManifest {
  buildId: string;
  gameResourcesIncluded: false;
  sources: string[];
  files: Record<string, string>;
}

export async function engineFiles(root = ROOT) {
  const entries = await readdir(join(root, 'src'), { withFileTypes: true });
  const generated = JSON.parse(
    await readFile(join(root, '.build/engine-files.json'), 'utf8'),
  ) as string[];
  const files = new Map(
    generated.map((name) => [name, join(root, '.build/src', name)]),
  );
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Unexpected engine source: ${entry.name}`);
    }
    if (entry.name.endsWith('.d.ts')) {
      continue;
    }
    const extension = extname(entry.name);
    if (extension === '.ts') {
      continue;
    } else if (['.html', '.css'].includes(extension)) {
      files.set(entry.name, join(root, 'src', entry.name));
    } else {
      throw new Error(`Unexpected engine source: ${entry.name}`);
    }
  }
  return files;
}

export async function publicFiles(root = ROOT) {
  const sourceFiles = await walkFiles(join(root, 'public'));
  const files = sourceFiles.map((path) =>
    relativeURL(join(root, 'public'), path),
  );
  if (files.some((name) => /^(?:assets|private)\//.test(name))) {
    throw new Error(
      'Game resources cannot be published from public/assets or public/private',
    );
  }
  return files;
}

async function protectOutput(output: string, root: string) {
  const out = resolve(output);
  const protectedFolders = [
    'src',
    'public',
    'private',
    'utils',
    '.git',
    '.build',
    'node_modules',
  ];
  let parent = out;
  // oxlint-disable no-await-in-loop -- Each next ancestor depends on the previous missing path.
  while (!(await exists(parent))) {
    parent = dirname(parent);
  }
  // oxlint-enable no-await-in-loop
  const canonical = resolve(await realpath(parent), relative(parent, out));
  if (
    isWithin(canonical, root) ||
    protectedFolders.some((folder) => isWithin(join(root, folder), canonical))
  ) {
    throw new Error('Choose a separate output directory');
  }
  if (!(await exists(out))) {
    return out;
  }
  const info = await lstat(out);
  if (
    info.isSymbolicLink() ||
    !(await exists(join(out, 'build-manifest.json')))
  ) {
    throw new Error('Output exists and is not a generated distribution');
  }
  return out;
}

export async function build(output = join(ROOT, 'dist'), root = ROOT) {
  const out = await protectOutput(output, root);
  await packageConverter(root);
  await compileSources(root, true);
  const engine = await engineFiles(root);
  const assets = await publicFiles(root);
  for (const name of assets) {
    if (engine.has(name)) {
      throw new Error(`Duplicate publication file: ${name}`);
    }
  }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all([
    ...[...engine].map(async ([name, path]) => copyFile(path, join(out, name))),
    ...assets.map(async (name) => {
      const target = join(out, name);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, 'public', name), target);
    }),
    mkdir(join(out, 'assets')),
  ]);
  const files = await walkFiles(out);
  const content = await Promise.all(
    files.map(async (path) => ({ path, bytes: await readFile(path) })),
  );
  // Include publication paths as well as bytes, so renamed files invalidate URLs.
  const buildId = hash(
    Buffer.concat(
      content.flatMap(({ path, bytes }) => [
        Buffer.from(relativeURL(out, path)),
        bytes,
      ]),
    ),
  ).slice(0, 16);
  const names = new Set(files.map((path) => relativeURL(out, path)));
  const pattern =
    /(['"])((?:\.\/)?[A-Za-z0-9_./-]+\.(?:js|mjs|css|zip|png|jpg|jpeg|svg|ttf)(?:\?[^'"]*)?)\1/g;
  await Promise.all(
    content
      .filter(
        ({ path }) =>
          dirname(path) === out &&
          ['.js', '.html', '.css'].includes(extname(path)),
      )
      .map(async ({ path, bytes }) => {
        const text = bytes
          .toString()
          .replaceAll(pattern, (match: string, quote: string, url: string) => {
            if (!names.has(url.split('?')[0].replace(/^\.\//, ''))) {
              return match;
            }
            return `${quote}${url}${url.includes('?') ? '&' : '?'}build=${buildId}${quote}`;
          });
        await writeFile(path, text);
      }),
  );
  const digests = await Promise.all(
    files.map(
      async (path) =>
        [relativeURL(out, path), hash(await readFile(path))] as const,
    ),
  );
  const manifest: BuildManifest = {
    buildId,
    gameResourcesIncluded: false,
    sources: ['src', 'public'],
    files: Object.fromEntries(digests),
  };
  await writeFile(
    join(out, 'build-manifest.json'),
    `${JSON.stringify(manifest, undefined, 2)}\n`,
  );
  return manifest;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  const manifest = await build(values.out);
  process.stdout.write(
    `Static distribution: ${resolve(values.out ?? 'dist')} (${Object.keys(manifest.files).length} files, no original media)\n`,
  );
}
