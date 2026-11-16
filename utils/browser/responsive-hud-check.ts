import { bitmapLabel } from '../../src/bitmap-ui.ts';
import { resourceURL } from '../../src/resource-urls.ts';
import { ResponsiveHud } from '../../src/responsive-hud.ts';
import { TouchControls } from '../../src/touch-controls.ts';
const hud = new ResponsiveHud(),
  stage = document.querySelector<HTMLElement>('#stage')!,
  ctx = document
    .querySelector<HTMLCanvasElement>('#overlay')!
    .getContext('2d')!,
  touch = document.querySelector<HTMLInputElement>('#touch')!,
  images = new Map();
const controls = new TouchControls({
  keys: new Set(),
  bitmapLabel,
  resourceURL,
  getPose: () => null,
});
// This diagnostic's checkbox supplies the touch-device flag on a desktop browser.
controls.media = { matches: true } as MediaQueryList;
function touchMode() {
  document.body.classList.toggle('fixture-touch', touch.checked);
  controls.setMode(touch.checked ? 'playing' : 'menu');
}
const paused = document.querySelector<HTMLInputElement>('#paused')!,
  menu = document.querySelector<HTMLElement>('#menu')!;
function pauseMode() {
  const active = paused.checked && touch.checked;
  document.body.classList.toggle('fixture-paused', active);
  stage.classList.toggle('mobile-paused', active);
  menu.classList.toggle('mobile-pause', active);
  menu.hidden = !active;
  const mode = touch.checked ? 'playing' : 'menu';
  controls.setMode(active ? 'paused' : mode);
}
for (const [label, y] of [
  ['MAIN MENU', 55],
  ['FULLSCREEN', 90],
  ['RESUME', 125],
] as const) {
  const button = document.createElement('button');
  button.className = 'native-button mobile-pause-choice';
  button.style.top = y / 2 + '%';
  button.setAttribute('aria-label', label);
  button.append(bitmapLabel(label, { color: 'gren' }));
  button.onclick = () => {
    if (label === 'FULLSCREEN') {
      document.querySelector<HTMLButtonElement>('#fullscreen')!.click();
    } else {
      paused.checked = false;
      pauseMode();
    }
  };
  menu.append(button);
}
touch.onchange = () => {
  touchMode();
  pauseMode();
};
paused.onchange = pauseMode;
touchMode();
pauseMode();
document.querySelector<HTMLSelectElement>('#cutout')!.onchange = (e) => {
  hud.probe.style.paddingLeft =
    (e.target as HTMLSelectElement).value === 'left' ? '32px' : '0px';
  hud.probe.style.paddingRight =
    (e.target as HTMLSelectElement).value === 'right' ? '32px' : '0px';
};
let fullscreenStatus = '';
document.querySelector<HTMLButtonElement>('#fullscreen')!.onclick =
  async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      fullscreenStatus = '';
    } catch {
      fullscreenStatus = 'fullscreen unavailable';
    }
  };
const player = {
  id: 0,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  health: 87,
  kills: 1,
  selectedWeapon: 0,
  weapons: [null, 'Missile', null, null],
  keyring: { x: true },
  zoneMask: 1,
};
const sim = {
  runners: [player, { id: 1, x: 12, y: 0, z: -15, health: 70, zoneMask: 1 }],
  player: 0,
  lives: 3,
  time: 186.3,
  requiredKills: 2,
  score: 123400,
  round: 1,
  countdown: 0,
};
function picture(name: string) {
  if (!images.has(name)) {
    const image = new Image();
    image.src = 'assets/' + name + '.png';
    images.set(name, image);
  }
  return images.get(name);
}
function draw() {
  requestAnimationFrame(draw);
  const layout = hud.layout(stage, touch.checked);
  hud.draw(
    ctx,
    sim as unknown as import('../../src/simulation.ts').Simulation,
    0,
    {
      picture,
      messages: [],
      now: 0,
      warning: document.querySelector<HTMLInputElement>('#warning')!.checked
        ? { active: true, shade: 'h' }
        : null,
    },
    layout,
  );
  controls.setHudLayout(layout);
  stage.dataset.hudX = String(layout.bottom.x);
  stage.dataset.hudTop = String(layout.bottom.y);
  stage.dataset.hudWidth = String(layout.bottom.width);
  stage.dataset.hudBottom = String(layout.bottom.y + layout.bottom.height);
  const fire = controls.buttons.get('FIRE')!.getBoundingClientRect(),
    dashboardTop = layout.bottom.y + 19 * layout.bottom.scale;
  stage.dataset.dashboardTop = String(dashboardTop);
  stage.dataset.fireOverlap = String(fire.bottom - dashboardTop);
  document.querySelector<HTMLElement>('#state')!.textContent =
    `${window.innerWidth}×${window.innerHeight} · HUD x${layout.bottom.x.toFixed(0)} width ${layout.bottom.width.toFixed(0)} · FIRE overlap ${(fire.bottom - dashboardTop).toFixed(0)} px · ${fullscreenStatus || (document.fullscreenElement ? 'fullscreen' : 'windowed')}`;
}
requestAnimationFrame(draw);
