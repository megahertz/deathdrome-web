import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type UserConfig } from 'tsdown';
import { ROOT } from './utils/project.ts';

export const ENGINE_ENTRIES = [
  'bootstrap',
  'game',
  'native-mode',
  'resource-worker',
  'resource-sw',
  'resource-defaults',
];

export async function browserBundles(
  root = ROOT,
  destination = join(root, '.build'),
  entries = ENGINE_ENTRIES,
): Promise<UserConfig[]> {
  const browserDirectory = join(root, 'utils/browser');
  const diagnosticNames = await readdir(browserDirectory);
  const diagnosticEntries = diagnosticNames.filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.d.ts'),
  );
  const common: UserConfig = {
    cwd: root,
    tsconfig: false,
    platform: 'browser',
    target: 'es2024',
    format: 'esm',
    dts: false,
    sourcemap: false,
    clean: true,
    minify: false,
    report: false,
    logLevel: 'error',
    deps: { onlyBundle: [] },
    plugins: [
      {
        name: 'browser-runtime-externals',
        resolveId(source, importer) {
          if (source === '#three') {
            return { id: source, external: true };
          }
          if (importer && source.endsWith('resource-defaults.ts')) {
            return { id: './resource-defaults.js', external: true };
          }
          if (source.endsWith('vendor/pyodide/pyodide.mjs')) {
            return { id: './vendor/pyodide/pyodide.mjs', external: true };
          }
          return undefined;
        },
      },
    ],
  };
  const configs: UserConfig[] = [
    {
      ...common,
      name: 'game',
      entry: Object.fromEntries(
        entries.map((name) => [name, join(root, 'src', `${name}.ts`)]),
      ),
      outDir: join(destination, 'src'),
      // import.meta.url resolves workers, WASM and converter data beside these files.
      outputOptions: {
        entryFileNames: '[name].js',
        chunkFileNames: 'shared-[name]-[hash].js',
        codeSplitting: {
          groups: [
            {
              // Keep shared state in one module without separate tiny helper chunks.
              name: 'runtime',
              minShareCount: 2,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  ];
  if (diagnosticEntries.length > 0) {
    configs.push({
      ...common,
      name: 'diagnostics',
      entry: Object.fromEntries(
        diagnosticEntries.map((name) => [
          name.replace(/\.ts$/, ''),
          join(browserDirectory, name),
        ]),
      ),
      outDir: join(destination, 'utils/browser'),
      outputOptions: {
        entryFileNames: '[name].js',
        chunkFileNames: 'diagnostic-[name]-[hash].js',
      },
    });
  }
  return configs;
}

export default defineConfig(() => browserBundles());
