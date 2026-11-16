import { errorMessage } from '../../src/errors.ts';
import './diagnostic-setup.ts';
import {
  activateResourceService,
  saveResources,
  pinResources,
  openResourceDB,
} from '../../src/resource-db.ts';
const state = document.querySelector<HTMLElement>('#state')!;
let selected: string | null = null;
try {
  await activateResourceService();
  state.textContent = 'Ready';
} catch (error) {
  state.textContent = errorMessage(error);
}
async function install(name: string) {
  try {
    const installation = await saveResources(
      [
        {
          path: 'probe.json',
          data: new TextEncoder().encode(JSON.stringify({ name })).buffer,
        },
      ],
      {
        version: 1,
        kind: 'demo',
        sourceSha256: 'probe-' + name,
        arenas: [],
        musicTracks: [],
        musicExtension: 'wav',
        executableSha256: '',
        sourceFiles: 1,
      },
      'test:' + name,
    );
    await pinResources(installation.id);
    selected = name;
    state.textContent = JSON.stringify({ installed: name });
  } catch (error) {
    state.textContent = JSON.stringify({ error: errorMessage(error) });
  }
}
document
  .querySelector<HTMLButtonElement>('#install-a')!
  .addEventListener('click', () => install('A'));
document
  .querySelector<HTMLButtonElement>('#install-b')!
  .addEventListener('click', () => install('B'));
document
  .querySelector<HTMLButtonElement>('#read')!
  .addEventListener('click', async () => {
    try {
      const r = await fetch('assets/probe.json');
      state.textContent = JSON.stringify({
        expected: selected,
        actual: await r.json(),
        status: r.status,
      });
    } catch (error) {
      state.textContent = JSON.stringify({ error: errorMessage(error) });
    }
  });

document
  .querySelector<HTMLButtonElement>('#cache')!
  .addEventListener('click', async () => {
    const db = await openResourceDB();
    try {
      const keys = await new Promise((resolve, reject) => {
        const r = db.transaction('files').objectStore('files').getAllKeys();
        r.addEventListener('success', () => resolve(r.result));
        r.addEventListener('error', () => reject(r.error));
      });
      state.textContent = JSON.stringify({ keys });
    } finally {
      db.close();
    }
  });
