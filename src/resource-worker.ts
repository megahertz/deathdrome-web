declare const self: DedicatedWorkerGlobalScope;
import { errorMessage } from './errors.ts';
import { loadPyodide } from './vendor/pyodide/pyodide.mjs';
const reportProgress = (phase: any, completed = 0, total = 0) =>
  postMessage({ type: 'progress', phase, completed, total });
self.reportProgress = reportProgress;
self.onmessage = async (event) => {
  try {
    reportProgress('Preparing the installer');
    const py = await loadPyodide({
      indexURL: new URL('./vendor/pyodide/', import.meta.url).href,
    });
    const response = await fetch(
      new URL('./resource-code/converter.zip', import.meta.url),
    );
    if (!response.ok) {
      throw Error('Could not load the resource converter');
    }
    py.unpackArchive(new Uint8Array(await response.arrayBuffer()), 'zip', {
      extractDir: '/work',
    });
    py.FS.writeFile('/work/source.img', new Uint8Array(event.data.bytes));
    py.globals.set('cached_digest', event.data.cachedDigest || '');
    reportProgress('Checking the game image');
    await py.runPythonAsync(`
import hashlib
from pathlib import Path
media=Path('/work/source.img').read_bytes()
source_digest=hashlib.sha256(media).hexdigest()
reuse=bool(cached_digest and cached_digest==source_digest)
`);
    py.FS.unlink('/work/source.img');
    if (py.globals.get('reuse')) {
      postMessage({ type: 'reuse' });
      return;
    }
    await py.runPythonAsync(`
import sys,json
from pathlib import Path
sys.path.insert(0,'/work/utils')
from convert import convert
from js import reportProgress
profile=convert(media,Path('/work'),reportProgress,progress_detail=reportProgress)
files_json=json.dumps([str(p.relative_to('/work/private/assets')) for p in Path('/work/private/assets').rglob('*') if p.is_file()])
profile_json=json.dumps(profile)
`);
    reportProgress('Preparing resource files');
    const paths = JSON.parse(py.globals.get('files_json')),
      profile = JSON.parse(py.globals.get('profile_json'));
    const files = [];
    for (const path of paths) {
      files.push({
        path,
        data: py.FS.readFile('/work/private/assets/' + path).slice().buffer,
      });
      if (files.length % 32 === 0 || files.length === paths.length) {
        reportProgress('Preparing resource files', files.length, paths.length);
      }
    }
    postMessage(
      { type: 'complete', files, profile },
      files.map((f) => f.data),
    );
  } catch (error) {
    const lines = errorMessage(error).trim().split('\n');
    postMessage({
      type: 'error',
      message: 'Could not prepare resources: ' + lines.at(-1),
    });
  }
};
