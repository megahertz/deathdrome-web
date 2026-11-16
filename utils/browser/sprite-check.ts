import './diagnostic-setup.ts';
import { pickupYaw } from '../../src/presentation-sequences.ts';
import {
  View,
  THREE,
  makeModel,
  modelData,
  texturesReady,
} from '../../src/renderer.ts';
const view = new View(document.querySelector<HTMLCanvasElement>('#view')!);
view.scene.background = new THREE.Color(0x38_59_6b);
let lit = true,
  rear = false;
for (let x = -20; x < 20; x += 4) {
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 20),
    new THREE.MeshBasicMaterial({
      color: (x / 4) % 2 ? 0x34_2e_4d : 0x3e_4d_35,
      side: THREE.DoubleSide,
    }),
  );
  p.rotation.x = -Math.PI / 2;
  p.position.set(x + 2, -0.1, 0);
  view.objects.add(p);
}
const names = [
    'enh_lock',
    'enh_ntro',
    'enh_shok',
    'enh_disr',
    'enh_ion',
    'enh_nano',
  ],
  models: THREE.Group<THREE.Object3DEventMap>[] = [];
for (let i = 0; i < names.length; i++) {
  // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
  const mesh = makeModel(await modelData(names[i]));
  mesh.position.set((i - 2.5) * 4, 0, 0);
  view.objects.add(mesh);
  models.push(mesh);
}
view.enablePlayerSpotlight(await modelData('redrunr'));
view.playerSpot!.set(0, 0, 0);
document
  .querySelector<HTMLButtonElement>('#light')!
  .addEventListener('click', () => {
    lit = !lit;
    view.playerSpot!.set(0, lit ? 0 : -10_000, 0);
    document.querySelector<HTMLButtonElement>('#light')!.textContent =
      'Light: ' + (lit ? 'on' : 'off');
    render(0, true);
  });
document
  .querySelector<HTMLButtonElement>('#rear')!
  .addEventListener('click', () => {
    rear = !rear;
    render(0, true);
  });
function render(seconds: number | undefined, capture = false) {
  view.camera.position.set(rear ? 6 : 0, 6, rear ? -25 : 25);
  view.camera.lookAt(0, 1.5, 0);
  for (const mesh of models) {
    mesh.rotation.y = pickupYaw(view.camera.position, mesh.position);
  }
  view.draw(seconds);
  document.querySelector<HTMLElement>('#state')!.textContent =
    '6 source models; palette-zero transparency; native UV addressing; ' +
    (rear ? 'rear' : 'front') +
    ' view; light ' +
    (lit ? 'on' : 'off') +
    '.';
  if (capture) {
    document.querySelector<HTMLAnchorElement>('#export')!.href = document
      .querySelector<HTMLCanvasElement>('#view')!
      .toDataURL('image/png');
  }
}
await texturesReady();
render(0, true);
function frame(now: number) {
  requestAnimationFrame(frame);
  render(now / 1000);
}
requestAnimationFrame(frame);
