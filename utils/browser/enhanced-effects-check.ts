import { View, THREE } from '../../src/renderer.ts';
const canvas = document.querySelector<HTMLCanvasElement>('canvas')!,
  view = new View(canvas);
view.hud = true;
view.enhancedArena = 1;
view.camera.position.set(0, 7, 17);
view.camera.lookAt(0, 1, -1);
view.ground = () => [{ height: 0, normal: { x: 0, y: 1, z: 0 } }];
function box(
  x: number,
  y: number,
  z: number | undefined,
  w: number | undefined,
  h: number | undefined,
  d: number | undefined,
  color: number,
  glow = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(x!, y!, z!);
  mesh.userData.enhancedGlow = glow;
  view.objects.add(mesh);
  return mesh;
}
box(0, -0.25, 0, 60, 0.5, 60, 0x34414a);
box(0, 4, -10, 30, 8, 0.5, 0x3d4550);
box(-10, 4, 0, 0.5, 8, 20, 0x354353);
const car = box(0, 0.8, 0, 3, 1.6, 5, 0x9e2830);
box(-5, 1, -4, 0.4, 2, 0.4, 0x00ddff, true);
box(5, 1, -4, 0.4, 2, 0.4, 0xff6418, true);
const runner = { id: 0, x: 0, y: 0, z: 0, yaw: 0, dead: 0 },
  sim = { runners: [runner], projectiles: [], player: 0 };
let fps = 60,
  last = 0,
  jump = 0,
  _frame = 0;
view.setEnhancedGraphics(true);
document.querySelector<HTMLButtonElement>('#enhanced')!.onclick = () =>
  view.setEnhancedGraphics(true);
document.querySelector<HTMLButtonElement>('#native')!.onclick = () =>
  view.setEnhancedGraphics(false);
document.querySelector<HTMLButtonElement>('#fire')!.onclick = () =>
  view.enhancements?.event({ type: 'shot', runner: 0 }, sim);
document.querySelector<HTMLButtonElement>('#explode')!.onclick = () =>
  view.enhancements?.event({ type: 'destroyed', runner: 0 }, sim);
document.querySelector<HTMLButtonElement>('#jump')!.onclick = () => (jump = 1);
document.querySelector<HTMLButtonElement>('#slow')!.onclick = () => (fps = 30);
document.querySelector<HTMLButtonElement>('#fast')!.onclick = () => (fps = 60);
function animate(now: number) {
  requestAnimationFrame(animate);
  if (last && now - last < 1000 / fps - 2) {
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000 || 1 / 60);
  last = now;
  _frame++;
  if (jump) {
    jump += dt;
    runner.y = Math.max(0, Math.sin(Math.min(1, (jump - 1) / 2) * Math.PI) * 8);
    if (jump >= 3) {
      jump = 0;
    }
  }
  car.position.y = runner.y + 0.8;
  view.enhancements?.sync(
    sim as unknown as import('../../src/simulation.ts').Simulation,
    dt,
  );
  view.enhancements?.sampleFrame(dt, true);
  view.draw(now / 1000);
  document.querySelector<HTMLElement>('#state')!.textContent =
    `${view.enhancedGraphics ? 'Enhanced' : 'Native'} · ${canvas.width}×${canvas.height} · MSAA ${canvas.dataset.msaaSamples || 0} · particles ${canvas.dataset.enhancedParticles || 0} · shadows ${canvas.dataset.enhancedShadows || 0} · flashes ${canvas.dataset.enhancedFlashTotal || 0} · requested ${fps} FPS`;
}
requestAnimationFrame(animate);
