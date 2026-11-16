import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { compileSources } from './compile-project.ts';
import { packageConverter } from './package-converter.ts';
import { containedFile, ROOT } from './project.ts';

export const DEV_MEDIA_SOURCES = Object.freeze({
  cd: '/private/disc/Death-Drome_Win_EN.zip',
  demo: '/private/disc/DDROME.zip',
  nomusic: '/private/disc/Deathdrome.iso',
});
export type ServeMode = 'development' | 'clean' | 'preview';
interface ServerOptions {
  root?: string;
  mode?: ServeMode;
  compile?: () => Promise<void>;
}
type Route = { file: string; body?: never } | { body: string; file?: never };
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export async function resolveRoute(
  rawPath: string,
  {
    root = ROOT,
    mode = 'development',
  }: Pick<ServerOptions, 'root' | 'mode'> = {},
): Promise<Route | undefined> {
  let path: string;
  try {
    path = decodeURIComponent(rawPath.split('?')[0]);
  } catch {
    return undefined;
  }
  const parts = path.replaceAll(/^\/+|\/+$/g, '').split('/');
  if (
    !path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    parts.some((part) => part.startsWith('.'))
  ) {
    return undefined;
  }
  const name = parts.join('/') || 'index.html';
  if (mode === 'preview') {
    const file = await containedFile(join(root, 'dist'), name);
    return file ? { file } : undefined;
  }
  if (mode === 'development' && name === 'resource-defaults.js') {
    return {
      body: `export const MEDIA_SOURCES=Object.freeze(${JSON.stringify(DEV_MEDIA_SOURCES)});\n`,
    };
  }
  for (const folder of ['.build/src', 'src', 'public']) {
    // oxlint-disable-next-line no-await-in-loop -- Overlay precedence determines which file is served.
    const file = await containedFile(join(root, folder), name);
    if (file) {
      return { file };
    }
  }
  if (mode !== 'development') {
    return undefined;
  }
  const aliases: Record<string, string> = {
    private: 'private',
    assets: 'private/assets',
    reference: 'private/reference',
    evidence: 'private/verification',
  };
  const alias = Object.hasOwn(aliases, parts[0])
    ? aliases[parts[0]]
    : undefined;
  if (alias) {
    const file = await containedFile(
      join(root, alias),
      parts.slice(1).join('/') || 'index.html',
    );
    return file ? { file } : undefined;
  }
  const browser = name.endsWith('.js')
    ? '.build/utils/browser'
    : 'utils/browser';
  const diagnostic = await containedFile(join(root, browser), name);
  if (diagnostic) {
    return { file: diagnostic };
  }
  if (parts.length === 1 && name.endsWith('-fixtures.json')) {
    const file = await containedFile(join(root, 'private'), name);
    return file ? { file } : undefined;
  }
  return undefined;
}

export function byteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) {
    return undefined;
  }
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end &&
    start < size
    ? { start, end }
    : undefined;
}

function headers(response: ServerResponse, path: string) {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (
    ['.js', '.mjs', '.json', '.html', '.css'].includes(extname(path)) ||
    path.endsWith('/')
  ) {
    response.setHeader('Cache-Control', 'no-cache');
  }
}

async function send(
  request: IncomingMessage,
  response: ServerResponse,
  {
    root = ROOT,
    mode = 'development',
    compile = () => compileSources(root),
  }: ServerOptions,
) {
  const path = request.url ?? '/';
  headers(response, path.split('?')[0]);
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  if (
    mode !== 'preview' &&
    (/\.js(?:\?|$)/.test(path) || /^\/(?:\?|$)/.test(path))
  ) {
    await compile();
  }
  const route = await resolveRoute(path, { root, mode });
  if (!route) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
    return;
  }
  if (route.body !== undefined) {
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(route.body),
    });
    response.end(request.method === 'HEAD' ? undefined : route.body);
    return;
  }
  const info = await stat(route.file);
  response.setHeader(
    'Content-Type',
    mime[extname(route.file).toLowerCase()] ?? 'application/octet-stream',
  );
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Last-Modified', info.mtime.toUTCString());
  const range = request.headers.range
    ? byteRange(request.headers.range, info.size)
    : undefined;
  if (request.headers.range && !range) {
    response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
    response.end();
    return;
  }
  const length = range ? range.end - range.start + 1 : info.size;
  response.setHeader('Content-Length', length);
  if (range) {
    response.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${info.size}`,
    );
  }
  response.writeHead(range ? 206 : 200);
  if (request.method === 'HEAD') {
    response.end();
  } else {
    await pipeline(createReadStream(route.file, range), response);
  }
}

export function createDevServer(options: ServerOptions = {}) {
  return createServer((request, response) => {
    send(request, response, options).catch((error: unknown) => {
      if (response.destroyed) {
        return;
      }
      if (response.headersSent) {
        response.destroy();
      } else {
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end('Could not serve the project');
      }
      process.stderr.write(`${String(error)}\n`);
    });
  });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      host: { type: 'string', default: '0.0.0.0' },
      port: { type: 'string', default: '8080' },
      private: { type: 'boolean' },
      clean: { type: 'boolean' },
      dist: { type: 'boolean' },
    },
  });
  if ([values.private, values.clean, values.dist].filter(Boolean).length > 1) {
    throw new Error('Choose only one of --private, --clean, --dist');
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Port must be an integer from 0 to 65535');
  }
  let mode: ServeMode = 'development';
  if (values.dist) {
    mode = 'preview';
  } else if (values.clean) {
    mode = 'clean';
  }
  if (mode !== 'preview') {
    await packageConverter();
    await compileSources();
  }
  const server = createDevServer({ mode });
  server.on('error', (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(port, values.host, () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      return;
    }
    process.stdout.write(
      `DeathDrome: http://localhost:${address.port}/\nServing ${mode === 'preview' ? 'dist only' : mode}\n`,
    );
    if (values.host === '0.0.0.0') {
      const interfaces = Object.values(networkInterfaces())
        .flat()
        .filter((entry) => entry?.family === 'IPv4' && !entry.internal);
      for (const entry of interfaces) {
        process.stdout.write(
          `Phone / LAN: http://${entry!.address}:${address.port}/ (same Wi-Fi)\n`,
        );
      }
    }
  });
  const close = () => server.close();
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}
