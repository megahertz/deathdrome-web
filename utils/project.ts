import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, stat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { env as processEnv } from 'node:process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

export function isWithin(directory: string, path: string) {
  const part = relative(resolve(directory), resolve(path));
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

export function relativeURL(directory: string, path: string) {
  return relative(directory, path).split(sep).join('/');
}

export async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Unexpected symlink: ${path}`);
      }
      if (entry.isDirectory()) {
        return walkFiles(path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return groups.flat().toSorted();
}

export async function containedFile(directory: string, name: string) {
  const candidate = resolve(directory, name);
  if (!isWithin(directory, candidate)) {
    return undefined;
  }
  try {
    const actual = await realpath(candidate);
    const base = await realpath(directory);
    if (!isWithin(base, actual)) {
      return undefined;
    }
    const info = await stat(actual);
    return info.isFile() ? actual : undefined;
  } catch (error) {
    if (
      ['ENOENT', 'ENOTDIR'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      )
    ) {
      return undefined;
    }
    throw error;
  }
}

export function run(
  command: string,
  args: string[],
  {
    cwd = ROOT,
    env = processEnv,
  }: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} failed (${signal ?? code})`));
      }
    });
  });
}
