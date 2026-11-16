import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  rm,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.build');

async function sources(
  directory: string,
  extension = '.ts',
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    },
  );
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return sources(path, extension);
      }
      return entry.isFile() &&
        path.endsWith(extension) &&
        !path.endsWith('.d.ts')
        ? [path]
        : [];
    }),
  );
  return groups.flat();
}

const directories = ['src', 'utils/browser'];
const expected = new Set<string>();
await Promise.all(
  directories.map(async (directory) => {
    const paths = await sources(join(root, directory));
    await Promise.all(
      paths.map(async (path) => {
        const source = await readFile(path, 'utf8');
        const result = ts.transpileModule(source, {
          fileName: path,
          reportDiagnostics: true,
          compilerOptions: {
            target: ts.ScriptTarget.ES2024,
            module: ts.ModuleKind.ESNext,
            rewriteRelativeImportExtensions: true,
          },
        });
        const errors =
          result.diagnostics?.filter(
            (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
          ) ?? [];
        if (errors.length) {
          throw new Error(
            ts.formatDiagnosticsWithColorAndContext(errors, {
              getCurrentDirectory: () => root,
              getCanonicalFileName: (name) => name,
              getNewLine: () => '\n',
            }),
          );
        }
        const target = join(
          output,
          relative(root, path).replace(/\.ts$/, '.js'),
        );
        expected.add(target);
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(
          temporary,
          directory === 'utils/browser'
            ? result.outputText.replaceAll('../../src/', './')
            : result.outputText,
        );
        await rename(temporary, target);
      }),
    );
  }),
);

// A removed source must stop being served, including after a rename. Only
// reconcile generated JS after every current source compiled successfully.
await Promise.all(
  directories.map(async (directory) => {
    const generated = await sources(join(output, directory), '.js');
    await Promise.all(
      generated.filter((path) => !expected.has(path)).map((path) => rm(path)),
    );
  }),
);
