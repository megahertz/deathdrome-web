import { errorMessage } from './errors.ts';
import { configureRegionData } from './region-data.ts';
import {
  installedResources,
  saveResources,
  pinResources,
  activateResourceService,
  hasResourceFiles,
  rememberResourceSource,
  RESOURCE_VERSION,
} from './resource-db.ts';
import { resourceDropTarget } from './resource-drop.ts';
import { ResourceProgress } from './resource-progress.ts';
import { imageRequest, readImage } from './resource-source.ts';
import { startResources } from './resource-startup.ts';
import type { Installation, WorkerResult } from './resource-types.ts';
import { resourceURL } from './resource-urls.ts';
const request = imageRequest(globalThis.location.search);
let active: Installation | null = null,
  worker: Worker | null = null,
  busy = false;
const panel = document.createElement('section');
panel.id = 'resource-setup';
panel.setAttribute('aria-label', 'Load DeathDrome');
panel.innerHTML = `<h1 class="resource-brand">DeathDrome</h1><div class="resource-card"><div class="resource-chooser"><p id="resource-instruction">Select a DeathDrome CD image or demo ZIP to play.</p><label id="pick-image" class="resource-file-button"><span>Choose file</span><input id="image-file" type="file" accept=".iso,.zip,application/octet-stream" aria-label="Choose a DeathDrome CD image or demo ZIP"></label></div><div class="resource-loading-indicator" aria-label="Loading game resources"><div class="resource-loading-title">Preparing your domain</div><progress id="resource-progress" aria-label="Loading progress"></progress><span id="resource-transfer"></span></div><p id="resource-status" role="status" aria-live="polite"></p></div>`;
const dropHint = document.createElement('div');
dropHint.className = 'resource-drop-hint';
dropHint.setAttribute('aria-hidden', 'true');
dropHint.innerHTML =
  '<span>Drop file to load<small>CD image or demo ZIP</small></span>';
panel.append(dropHint);
const clearDropHint = resourceDropTarget(panel, {
  canLoad: () => !busy,
  onFile: (file: File) => {
    fromFile(file);
  },
});
panel.dataset.state = 'loading';
document.body.append(panel);
const status = panel.querySelector<HTMLElement>('#resource-status')!,
  progress = panel.querySelector<HTMLProgressElement>('#resource-progress')!,
  transfer = panel.querySelector<HTMLElement>('#resource-transfer')!;
const loading = new ResourceProgress();
function renderProgress() {
  progress.max = 100;
  if (loading.indeterminate) {
    progress.removeAttribute('value');
  } else {
    progress.value = loading.value;
  }
  transfer.textContent = loading.label;
  progress.setAttribute(
    'aria-valuetext',
    loading.label + ' — ' + loading.phase,
  );
}
function phase(
  text: string,
  options: import('./resource-types.ts').StageProgress = {},
) {
  loading.stage(text, options);
  status.textContent =
    text +
    (loading.phasePercent === null ? '' : ` — ${loading.phasePercent}%`) +
    '…';
  renderProgress();
}
function downloadProgress(value: { loaded: any; total: any }) {
  loading.download(value);
  renderProgress();
}
function showError(error: unknown) {
  status.textContent = errorMessage(error);
  status.classList.add('resource-error');
}
function controls(disabled: boolean) {
  clearDropHint();
  if (disabled) {
    loading.reset();
    renderProgress();
  }
  panel.dataset.state = disabled ? 'loading' : 'choose';
  panel.setAttribute('aria-busy', String(disabled));
  busy = disabled;
  for (const e of panel.querySelectorAll<HTMLInputElement>('button,input')) {
    e.disabled = disabled;
  }
  if (disabled) {
    status.classList.remove('resource-error');
  }
}
async function launch(profile: import('./resource-types.ts').Installation) {
  phase('Activating game resources');
  await pinResources(profile.id);
  phase('Starting DeathDrome');
  const regions = await fetch(resourceURL('assets/region-data.json'));
  if (!regions.ok) {
    throw new Error('Could not load installed game regions');
  }
  configureRegionData(await regions.json());
  window.deathdromeInstallation = profile;
  try {
    const game = await import('./game.ts');
    await game.ready;
    loading.ready();
    renderProgress();
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    panel.remove();
    document.documentElement.classList.remove('resource-loading');
    // Hidden menu controls cannot receive focus while the loader is visible.
    // Select START GAME after revealing the menu so the first Enter activates it.
    document
      .querySelector<HTMLButtonElement>('#menu button:not(:disabled)')
      ?.focus({ preventScroll: true });
  } catch (error) {
    document.documentElement.classList.add('resource-loading');
    showError(new Error('Could not start the game: ' + errorMessage(error)));
    throw error;
  }
}
async function install(bytes: ArrayBuffer, source: string) {
  phase('Checking the game image', { value: 70 });
  if (active && !(await hasResourceFiles(active))) {
    active = null;
  }
  if (!request.noCache && active && globalThis.crypto?.subtle) {
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (v) => v.toString(16).padStart(2, '0'),
    ).join('');
    if (active.sourceSha256 === digest) {
      active = await rememberResourceSource(active, source);
      await launch(active);
      return;
    }
  }
  worker = new Worker(new URL('resource-worker.js', import.meta.url), {
    type: 'module',
  });
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    worker!.addEventListener('message', ({ data }) => {
      if (data.type === 'progress') {
        phase(data.phase, { completed: data.completed, total: data.total });
      } else if (data.type === 'error') {
        reject(new Error(data.message));
      } else if (data.type === 'complete' || data.type === 'reuse') {
        resolve(data);
      }
    });
    worker!.addEventListener('error', (e) =>
      reject(new Error(e.message || 'Resource extraction failed')),
    );
    worker!.postMessage(
      { bytes, cachedDigest: request.noCache ? null : active?.sourceSha256 },
      [bytes],
    );
  }).finally(() => {
    worker!.terminate();
    worker = null;
  });
  if (result.type === 'reuse') {
    if (!active) {
      throw new Error('The saved installation is no longer available');
    }
    active = await rememberResourceSource(active, source);
  } else {
    phase('Saving game resources');
    active = await saveResources(result.files, result.profile, source, {
      onProgress: ({ loaded, total }) =>
        phase('Saving game resources', { completed: loaded, total }),
    });
  }
  await launch(active);
}
async function fromURL(value: string) {
  if (busy) {
    return;
  }
  controls(true);
  try {
    document.documentElement.dataset.resourceStartup = 'image';
    phase('Loading game image');
    const image = await readImage(value, {
      allowMissing: request.defaultImage,
      noCache: request.noCache,
      onProgress: downloadProgress,
    });
    if (!image) {
      status.textContent = '';
      return;
    }
    await install(image.bytes, image.url);
  } catch (error) {
    showError(new Error('Could not open the image. ' + errorMessage(error)));
  } finally {
    controls(false);
  }
}
function readFile(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('progress', (e) =>
      downloadProgress({
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : 0,
      }),
    );
    reader.addEventListener('load', () =>
      resolve(reader.result as ArrayBuffer),
    );
    reader.addEventListener('error', () => reject(reader.error));
    reader.addEventListener('abort', () =>
      reject(new Error('File reading was cancelled')),
    );
    // oxlint-disable-next-line unicorn/prefer-blob-reading-methods -- Progress events update the download portion of the loader.
    reader.readAsArrayBuffer(file);
  });
}
async function fromFile(file: File) {
  if (!file || busy) {
    return;
  }
  controls(true);
  try {
    document.documentElement.dataset.resourceStartup = 'image';
    phase('Reading game image');
    await install(await readFile(file), 'file:' + file.name);
  } catch (error) {
    showError(error);
  } finally {
    controls(false);
  }
}
panel
  .querySelector<HTMLInputElement>('#image-file')!
  .addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await fromFile(file);
    }
    input.value = '';
  });
document.documentElement.classList.add('resource-loading');
phase('Looking for the game image');
try {
  await activateResourceService();
  await startResources(request, {
    version: RESOURCE_VERSION,
    base: globalThis.location.href,
    readInstalled: async () => {
      active = await installedResources();
      if (active?.converterVersion !== RESOURCE_VERSION) {
        active = null;
      }
      return active;
    },
    hasResources: async (profile: any) => {
      const ready = await hasResourceFiles(profile);
      if (!ready) {
        active = null;
      }
      return ready;
    },
    launch: async (profile: any) => {
      controls(true);
      document.documentElement.dataset.resourceStartup = 'cache';
      phase('Loading saved game resources');
      await launch(profile);
    },
    loadImage: fromURL,
    onCacheError: () => {
      active = null;
    },
  });
} catch (error) {
  controls(false);
  showError(error);
}
