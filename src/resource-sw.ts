import { errorMessage } from './errors.ts';
import { openResourceDB } from './resource-db.ts';
import type { Installation } from './resource-types.ts';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url),
    base = new URL(self.registration.scope),
    prefix = base.pathname + 'assets/';
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(prefix) ||
    event.request.method !== 'GET'
  ) {
    return;
  }
  const path = decodeURIComponent(url.pathname.slice(prefix.length));
  // Original media are optional static files, never generated resources.
  if (/\.(iso|zip)$/i.test(path)) {
    return;
  }
  event.respondWith(readResource(event.request, path, event.clientId));
});
async function readResource(request: Request, path: string, clientId: string) {
  const db = await openResourceDB();
  let active, blob;
  try {
    [active, blob] = await new Promise<[Installation | null, Blob | null]>(
      (resolve, reject) => {
        const tx = db.transaction(['files', 'meta']),
          meta = tx.objectStore('meta'),
          r = meta.get('client:' + clientId);
        r.addEventListener('success', () => {
          const pinned = r.result,
            a = meta.get('active');
          a.addEventListener('success', () => {
            const activeWorker = a.result,
              id = pinned || activeWorker?.id;
            if (!id) {
              resolve([null, null]);
              return;
            }
            const f = tx.objectStore('files').get(id + '/' + path);
            f.addEventListener('success', () =>
              resolve([activeWorker || { id }, f.result]),
            );
            f.addEventListener('error', () => reject(f.error));
          });
          a.addEventListener('error', () => reject(a.error));
        });
        r.addEventListener('error', () => reject(r.error));
      },
    );
  } finally {
    db.close();
  }
  if (!active) {
    return fetch(request);
  }
  if (!blob) {
    return new Response('Resource is absent from the selected image', {
      status: 404,
    });
  }
  const headers: Record<string, string> = {
    'Content-Type': blob.type,
    'Content-Length': String(blob.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  const range = request.headers.get('Range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = Number.NaN,
      end = Number.NaN;
    if (match) {
      start = match[1]
        ? Number(match[1])
        : Math.max(0, blob.size - Number(match[2]));
      end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), blob.size - 1)
          : blob.size - 1;
    }
    if (
      !match ||
      !Number.isSafeInteger(start) ||
      start > end ||
      start >= blob.size
    ) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${blob.size}` },
      });
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${blob.size}`;
    headers['Content-Length'] = String(end - start + 1);
    return new Response(blob.slice(start, end + 1), { status: 206, headers });
  }
  return new Response(blob, { headers });
}

self.addEventListener('message', (event) => {
  if (
    event.data?.type !== 'use-installation' ||
    !(event.source as Client | null)?.id
  ) {
    return;
  }
  event.waitUntil(
    (async () => {
      const db = await openResourceDB();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(
            event.data.installationId,
            'client:' + (event.source as Client).id,
          );
          tx.addEventListener('complete', () => resolve());
          tx.addEventListener('abort', () => reject(tx.error));
        });
        event.ports[0]?.postMessage({ ok: true });
        // Keep each live tab's installation, then discard caches left by closed tabs.
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        const live = new Set(clients.map((c) => 'client:' + c.id));
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['meta', 'files'], 'readwrite'),
            meta = tx.objectStore('meta'),
            keep = new Set(),
            cursor = meta.openCursor();
          cursor.addEventListener('success', () => {
            const c = cursor.result;
            if (c) {
              if (c.key === 'active') {
                keep.add(c.value.id);
              } else if (live.has(String(c.key))) {
                keep.add(c.value);
              } else {
                c.delete();
              }
              c.continue();
            } else {
              const files = tx.objectStore('files').openKeyCursor();
              files.addEventListener('success', () => {
                const f = files.result;
                if (f) {
                  if (!keep.has(String(f.key).split('/')[0])) {
                    tx.objectStore('files').delete(f.key);
                  }
                  f.continue();
                }
              });
            }
          });
          tx.addEventListener('complete', () => resolve());
          tx.addEventListener('abort', () => reject(tx.error));
        });
      } catch (error) {
        event.ports[0]?.postMessage({
          ok: false,
          error: String(errorMessage(error) || error),
        });
      } finally {
        db.close();
      }
    })(),
  );
});
