import { type Group, type Object3DEventMap } from '#three';
import './diagnostic-setup.ts';
import { errorMessage } from '../../src/errors.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import {
  View,
  modelData,
  makeRunnerModel,
  poseRunnerModel,
  texturesReady,
} from '../../src/renderer.ts';
import {
  makeRunnerPreview,
  stepRunnerPreview,
} from '../../src/runner-preview.ts';
import { RUNNERS } from '../../src/simulation.ts';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw Error('Missing diagnostic element: ' + selector);
    }
    return element;
  },
  canvas = $<HTMLCanvasElement>('#world'),
  view = new View(canvas);
let runner: import('../../src/game-types.ts').RunnerPose,
  root: Group<Object3DEventMap>,
  context = 'game',
  busy = false;
GAME_TABLES.runners.forEach((r, i) => {
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = r.name;
  $<HTMLSelectElement>('#runner').append(option);
});
$<HTMLSelectElement>('#runner').value = '6';
function render() {
  const yaw = (Number($<HTMLSelectElement>('#angle').value) * Math.PI) / 180;
  if (context === 'preview') {
    stepRunnerPreview(root, (yaw - root.userData.preview.rotation) * 2);
  } else {
    runner.yaw = yaw;
    poseRunnerModel(root, runner);
    view.setPlayerSpotlight(runner);
    view.playerSpotRadius.value = Number($<HTMLSelectElement>('#mask').value);
    view.camera.position.set(
      runner.x + Math.sin(yaw) * 7,
      3,
      runner.z + Math.cos(yaw) * 7,
    );
    view.camera.rotation.set(0, yaw, 0);
  }
  view.draw(0);
  $<HTMLAnchorElement>('#export').href = canvas.toDataURL('image/png');
  const floor = root?.userData.preview?.rasterFloor;
  $<HTMLAnchorElement>('#floor-export').hidden = !floor;
  if (floor) {
    $<HTMLAnchorElement>('#floor-export').href =
      floor.canvas.toDataURL('image/png');
  }
}
async function load() {
  if (busy) {
    return;
  }
  busy = true;
  $('#status').textContent = 'Loading…';
  try {
    context = $<HTMLSelectElement>('#scene').value;
    view.preview = context === 'preview';
    view.hud = false;
    const id = Number($<HTMLSelectElement>('#runner').value),
      data = await modelData(RUNNERS[id]);
    if (context === 'preview') {
      view.clear();
      root = makeRunnerPreview(data);
      (view.scene.background as import('#three').Color).set(0);
      view.camera.position.set(0, 2.3, 10);
      view.camera.rotation.set((-10 * Math.PI) / 180, 0, 0);
    } else {
      await view.arena(1);
      root = makeRunnerModel(data);
      runner = {
        id,
        x: 160,
        y: 0,
        z: 436,
        yaw: 0,
        turn: 0,
        health: 100,
        dead: 0,
      };
      poseRunnerModel(root, runner);
    }
    view.objects.add(root);
    if (context === 'game') {
      view.enablePlayerSpotlight(data);
    }
    await texturesReady();
    render();
    $('#status').textContent =
      'Ready — ' +
      context +
      '; ' +
      GAME_TABLES.runners[id].name +
      '; heading ' +
      $<HTMLSelectElement>('#angle').value;
  } catch (error) {
    $('#status').textContent = 'Failed: ' + errorMessage(error);
    console.error(error);
  } finally {
    busy = false;
  }
}
$<HTMLButtonElement>('#load').onclick = load;
$<HTMLSelectElement>('#scene').onchange = load;
$<HTMLSelectElement>('#runner').onchange = load;
for (const id of ['#angle', '#mask']) {
  $(id).onchange = () => {
    if (!busy) {
      render();
      $('#status').textContent =
        'Ready — ' +
        context +
        '; heading ' +
        $<HTMLSelectElement>('#angle').value;
    }
  };
}
load();
