import './diagnostic-setup.ts';
import { View, texturesReady } from '../../src/renderer.ts';
const canvas = document.querySelector<HTMLCanvasElement>('#world')!,
  view = new View(canvas),
  graphics = document.querySelector<HTMLSelectElement>('#graphics')!,
  background = document.querySelector<HTMLSelectElement>('#background')!,
  status = document.querySelector<HTMLElement>('#status')!;
await view.arena(1);
await texturesReady();
view.hud = true;
view.camera.position.set(160, 8, 300);
view.camera.lookAt(185, 63, 184);
function render() {
  view.setEnhancedGraphics(graphics.value === 'enhanced');
  (view.scene.background as import('#three').Color).set(
    background.value === 'previous' ? 0x090b10 : 0x000000,
  );
  view.draw(0);
  status.textContent = `${graphics.value.toUpperCase()} · background #${(view.scene.background as import('#three').Color).getHexString()} · ${canvas.width} × ${canvas.height}`;
}
background.onchange = render;
graphics.onchange = background.onchange;
render();
