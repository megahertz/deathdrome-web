import type { Installation } from './resource-types.ts';
import { useResourceURLs, resourceURL } from './resource-urls.ts';
// Only data derived locally from a user's image is stored here.
export const RESOURCE_VERSION = 6;
const DB_NAME = 'deathdrome-original-resources';
export function openResourceDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('files');
      request.result.createObjectStore('meta');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function installedResources() {
  const db = await openResourceDB();
  try {
    return await new Promise<Installation | null>((resolve, reject) => {
      const r = db.transaction('meta').objectStore('meta').get('active');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveResources(
  files: import('./resource-types.ts').ResourceFile[],
  profile: import('./resource-types.ts').ResourceProfile,
  source: string,
  {
    onProgress = () => {},
  }: {
    onProgress?: (
      progress: import('./resource-types.ts').ProgressBytes,
    ) => void;
  } = {},
) {
  const db = await openResourceDB(),
    id = profile.sourceSha256 + '-v' + RESOURCE_VERSION;
  const installation = {
    ...profile,
    id,
    source,
    converterVersion: RESOURCE_VERSION,
    resourceCount: new Set(files.map((file: { path: any }) => file.path)).size,
    installedAt: new Date().toISOString(),
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['files', 'meta'], 'readwrite'),
        store = tx.objectStore('files');
      store.delete(IDBKeyRange.bound(id + '/', id + '/\uffff'));
      // One transaction: a failed install leaves the previous installation intact.
      let saved = 0;
      for (const file of files) {
        const request = store.put(
          new Blob([file.data], { type: resourceType(file.path) }),
          id + '/' + file.path,
        );
        request.onsuccess = () => {
          saved++;
          if (saved % 32 === 0 || saved === files.length) {
            onProgress({ loaded: saved, total: files.length });
          }
        };
      }
      tx.objectStore('meta').put(installation, 'active');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || Error('Could not save resources'));
      tx.onerror = () => {};
    });
    return installation;
  } finally {
    db.close();
  }
}
// Check keys/counts without loading the texture/model/audio blobs into memory.
export async function hasResourceFiles(
  profile: import('./resource-types.ts').Installation | null,
) {
  if (!profile?.id || !profile.arenas?.length) {
    return false;
  }
  const paths = [
    'installation.json',
    'region-data.json',
    'ai-paths.json',
    'recharge-paths.json',
    'training.json',
    'credits.json',
    'images/domtitle.png',
    'models/arena' + profile.arenas[0] + '.json',
  ];
  const db = await openResourceDB();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction('files'),
        store = tx.objectStore('files'),
        count = store.count(
          IDBKeyRange.bound(profile.id + '/', profile.id + '/\uffff'),
        ),
        keys = paths.map((path) => store.getKey(profile.id + '/' + path));
      tx.oncomplete = () =>
        resolve(
          count.result >= paths.length &&
            (profile.resourceCount == null ||
              count.result === profile.resourceCount) &&
            keys.every((key) => key.result !== undefined),
        );
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => {};
    });
  } finally {
    db.close();
  }
}
export async function rememberResourceSource(
  profile: import('./resource-types.ts').Installation,
  source: string,
) {
  if (profile.source === source) {
    return profile;
  }
  const updated = { ...profile, source },
    db = await openResourceDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite'),
        store = tx.objectStore('meta'),
        current = store.get('active');
      current.onsuccess = () => {
        if (current.result?.id === profile.id) {
          store.put(updated, 'active');
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => {};
    });
    return updated;
  } finally {
    db.close();
  }
}
export function resourceType(path: string) {
  if (path.endsWith('.png')) {
    return 'image/png';
  } else if (path.endsWith('.json')) {
    return 'application/json';
  } else if (path.endsWith('.wav')) {
    return 'audio/wav';
  } else if (path.endsWith('.ogg')) {
    return 'audio/ogg';
  } else {
    return 'application/octet-stream';
  }
}

export async function pinResources(installationId: string) {
  if (!globalThis.isSecureContext || !navigator.serviceWorker?.controller) {
    const db = await openResourceDB();
    let files;
    try {
      files = await new Promise<{ path: string; data: Blob }[]>(
        (resolve, reject) => {
          const values: { path: string; data: Blob }[] = [],
            request = db
              .transaction('files')
              .objectStore('files')
              .openCursor(
                IDBKeyRange.bound(
                  installationId + '/',
                  installationId + '/\uffff',
                ),
              );
          request.onsuccess = () => {
            const c = request.result;
            if (c) {
              values.push({
                path: String(c.key).slice(installationId.length + 1),
                data: c.value,
              });
              c.continue();
            } else {
              resolve(values);
            }
          };
          request.onerror = () => reject(request.error);
        },
      );
    } finally {
      db.close();
    }
    useResourceURLs(files);
    let style = document.querySelector<HTMLElement>('#resource-slider-urls')!;
    if (!style) {
      style = document.createElement('style');
      style.id = 'resource-slider-urls';
      document.head.append(style);
    }
    style.textContent = `#menu input.native-slider{background-image:url("${resourceURL('assets/images/slidebl.png')}")}#menu input.native-slider:focus,#menu .native-button:focus+input.native-slider{background-image:url("${resourceURL('assets/images/slidebh.png')}")}#menu input.native-slider::-webkit-slider-thumb{background-image:url("${resourceURL('assets/images/knobl.png')}")}#menu input.native-slider:focus::-webkit-slider-thumb,#menu .native-button:focus+input.native-slider::-webkit-slider-thumb{background-image:url("${resourceURL('assets/images/knobh.png')}")}#menu input.native-slider::-moz-range-thumb{background-image:url("${resourceURL('assets/images/knobl.png')}")}#menu input.native-slider:focus::-moz-range-thumb,#menu .native-button:focus+input.native-slider::-moz-range-thumb{background-image:url("${resourceURL('assets/images/knobh.png')}")}`;
    return;
  }

  const channel = new MessageChannel();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(Error('The resource service did not respond. Reload the page.')),
      10000,
    );
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timeout);
      channel.port1.close();
      data.ok ? resolve() : reject(Error(data.error));
    };
    navigator.serviceWorker.controller!.postMessage(
      { type: 'use-installation', installationId },
      [channel.port2],
    );
  });
}

export async function activateResourceService() {
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) {
    return;
  }
  const registration = await navigator.serviceWorker.register(
    new URL('./resource-sw.js', import.meta.url),
    { type: 'module', scope: './' },
  );
  const { installing } = registration;
  if (installing && installing.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      installing.addEventListener('statechange', () => {
        if (installing.state === 'activated') {
          resolve();
        } else if (installing.state === 'redundant') {
          reject(Error('Could not activate the resource service'));
        }
      });
    });
  }
  await navigator.serviceWorker.ready;
  if (
    !navigator.serviceWorker.controller ||
    navigator.serviceWorker.controller !== registration.active
  ) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error('Reload the page to activate the resource loader')),
        15000,
      );
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}
