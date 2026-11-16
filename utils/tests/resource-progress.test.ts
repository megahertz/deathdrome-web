import assert from 'node:assert/strict';
import test from 'node:test';
import { imageReady } from '../../src/bitmap-ui.ts';
import { ResourceProgress } from '../../src/resource-progress.ts';
test('image transfer occupies exactly 70%, and complete extraction/startup stays below 100 until ready', () => {
  const p = new ResourceProgress();
  p.download({ loaded: 50, total: 100 });
  assert.equal(p.value, 35);
  p.download({ loaded: 100, total: 100 });
  assert.equal(p.value, 70);
  assert.match(p.label, /^70%/);
  for (const phase of [
    'Preparing the installer',
    'Checking the game image',
    'Extracting files',
    'Preparing textures',
    'Preparing fonts',
    'Preparing models',
    'Preparing menus',
    'Preparing credits',
    'Preparing paths',
    'Preparing animations',
    'Preparing sounds',
    'Preparing resource files',
    'Saving game resources',
    'Activating game resources',
    'Starting DeathDrome',
  ]) {
    const previous: number = p.value;
    p.stage(phase);
    assert.ok(p.value >= previous && p.value < 100);
  }
  assert.equal(p.value, 99);
  p.ready();
  assert.equal(p.value, 100);
  assert.equal(p.label, '100%');
});
test('unknown-length transfers remain indeterminate until byte completion establishes the 70% boundary', () => {
  const p = new ResourceProgress();
  p.download({ loaded: 1048576, total: 0 });
  assert.equal(p.indeterminate, true);
  assert.match(p.label, /1.0 MB received/);
  p.download({ loaded: 1048576, total: 1048576 });
  assert.equal(p.indeterminate, false);
  assert.equal(p.value, 70);
});
test('file packing and committed-resource work use the final 30%, with a separate ready boundary', () => {
  const p = new ResourceProgress();
  p.stage('Preparing resource files', { completed: 50, total: 100 });
  assert.equal(p.value, 96.5);
  p.stage('Preparing resource files', { completed: 100, total: 100 });
  assert.equal(p.value, 97);
  p.stage('Saving game resources', { completed: 50, total: 100 });
  assert.equal(p.value, 97.5);
  p.stage('Saving game resources', { completed: 100, total: 100 });
  assert.equal(p.value, 98);
  p.stage('Starting DeathDrome');
  assert.equal(p.value, 99);
});
test('cached startup skips completed work; retry resets progress and late phase reports cannot rewind it', () => {
  const p = new ResourceProgress();
  p.stage('Activating game resources');
  assert.equal(p.value, 98);
  p.stage('Extracting files');
  assert.equal(p.value, 98);
  p.ready();
  p.reset();
  assert.equal(p.value, 0);
  p.download({ loaded: 1, total: 2 });
  assert.equal(p.value, 35);
});
test('menu images must actually load; a broken cached image rejects readiness', async () => {
  await imageReady({ complete: true, naturalWidth: 20 });
  await assert.rejects(imageReady({ complete: true, naturalWidth: 0 }));
  const image = Object.assign(new EventTarget(), { complete: false });
  const ready = imageReady(image);
  let done = false;
  ready.then(() => (done = true));
  await Promise.resolve();
  assert.equal(done, false);
  image.dispatchEvent(new Event('load'));
  await ready;
  assert.equal(done, true);
});

test('extraction and model work advance within their stages and show stage percentages independently of overall completion', () => {
  const p = new ResourceProgress();
  p.download({ loaded: 100, total: 100 });
  p.stage('Extracting files', { completed: 0, total: 1000 });
  assert.equal(p.value, 73);
  assert.equal(p.phasePercent, 0);
  p.stage('Extracting files', { completed: 250, total: 1000 });
  assert.equal(p.value, 74.5);
  assert.equal(p.phasePercent, 25);
  p.stage('Extracting files', { completed: 800, total: 1000 });
  assert.equal(p.value, 77.8);
  assert.equal(p.phasePercent, 80);
  p.stage('Extracting files', { completed: 1000, total: 1000 });
  assert.equal(p.value, 79);
  p.stage('Preparing models', { completed: 100, total: 1000 });
  assert.equal(p.value, 86.6);
  assert.equal(p.phasePercent, 10);
  p.stage('Preparing models', { completed: 500, total: 1000 });
  assert.equal(p.value, 89);
  assert.equal(p.phasePercent, 50);
  p.stage('Preparing models', { completed: 1000, total: 1000 });
  assert.equal(p.value, 92);
  assert.equal(p.phasePercent, 100);
  assert.ok(p.value < 100);
  p.stage('Starting DeathDrome');
  assert.equal(p.phasePercent, null);
  assert.equal(p.value, 99);
});

test('saved-resource startup enters the final preparation range without a download stage', () => {
  const p = new ResourceProgress();
  p.stage('Loading saved game resources');
  assert.equal(p.value, 97);
  assert.equal(p.indeterminate, false);
  p.stage('Activating game resources');
  assert.equal(p.value, 98);
  p.stage('Starting DeathDrome');
  assert.equal(p.value, 99);
  p.ready();
  assert.equal(p.value, 100);
});
