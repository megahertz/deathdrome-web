import { MEDIA_SOURCES } from './resource-defaults.ts';
export { MEDIA_SOURCES };
export const DEFAULT_IMAGE = MEDIA_SOURCES.cd;
export function imageRequest(
  search:
    | string
    | string[][]
    | Record<string, string>
    | URLSearchParams
    | undefined,
) {
  const params = new URLSearchParams(search);
  return {
    image: params.get('image') || DEFAULT_IMAGE,
    noCache: params.has('nocache'),
    defaultImage: !params.get('image'),
  };
}
export function resolveImage(
  value: string | URL,
  base: string | URL | undefined,
) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Error('Enter an HTTP(S) URL or a relative file path');
  }
  return url.href;
}
export async function readImage(
  value: string,
  {
    base = globalThis.location.href,
    fetchImage = fetch,
    allowMissing = false,
    noCache = false,
    onProgress = () => {},
  }: {
    base?: string;
    fetchImage?: typeof fetch;
    allowMissing?: boolean;
    noCache?: boolean;
    onProgress?: (
      progress: import('./resource-types.ts').ProgressBytes,
    ) => void;
  } = {},
) {
  const url = resolveImage(value, base);
  let response;
  try {
    response = await fetchImage(
      url,
      noCache ? { cache: 'no-store' } : undefined,
    );
  } catch {
    throw Error(
      'Could not download the image. Remote servers must allow CORS; you can download the file and select it locally instead.',
    );
  }
  if (allowMissing && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw Error(
      `Could not load the file (HTTP ${response.status}). Select a file from your computer.`,
    );
  }
  const total = Number(response.headers.get('Content-Length')) || 0;
  onProgress({ loaded: 0, total });
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    onProgress({ loaded: bytes.byteLength, total: bytes.byteLength });
    return { url, bytes };
  }
  const reader = response.body.getReader(),
    chunks = [];
  let loaded = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- A ReadableStream reader must consume chunks in order.
      const { done, value: chunk } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(chunk);
      loaded += chunk.byteLength;
      onProgress({ loaded, total });
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress({ loaded, total: loaded });
  return { url, bytes: bytes.buffer };
}
