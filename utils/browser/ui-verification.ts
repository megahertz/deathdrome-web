import { projectReticle } from '../../src/hud-reticle.ts';
import './diagnostic-setup.ts';
import { drawHud, inAreaCount } from '../../src/hud.ts';
import { readControls } from '../../src/input.ts';
import { drawRoundResults, resultAdvance } from '../../src/round-results.ts';
import type { Simulation } from '../../src/simulation.ts';
import { worldRegions } from '../../src/world-regions.ts';
const canvas = document.querySelector<HTMLCanvasElement>('#ui')!,
  ctx = canvas.getContext('2d')!,
  screen = document.querySelector<HTMLSelectElement>('#screen')!,
  status = document.querySelector<HTMLElement>('#status')!,
  keys = new Set<string>(),
  images = new Map();
ctx.setTransform(2, 0, 0, 2, 0, 0);
ctx.imageSmoothingEnabled = false;
function picture(path: string) {
  if (!images.has(path)) {
    const im = new Image();
    im.src = 'assets/' + path + '.png';
    images.set(path, im);
  }
  return images.get(path);
}
const sim = {
  arena: 1,
  round: 1,
  player: 6,
  score: 0,
  lives: 3,
  time: 296.2,
  requiredKills: 2,
  countdown: 0,
  projectiles: [],
  runners: Array.from({ length: 8 }, (_, id) => ({
    id,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    kills: 0,
    health: id === 6 ? 98 : 100,
    weapons: [null],
    selectedWeapon: 0,
    inactive: id > 3 && id !== 6,
    dead: 0,
  })),
} as unknown as Simulation;
let advanced = 0,
  advance: ReturnType<typeof resultAdvance>,
  lastPress = '',
  targetEdge = false;
function reset() {
  advanced = 0;
  advance = resultAdvance(() => {
    advanced++;
    status.textContent = `Continued ${advanced} time; next round 2.`;
  });
  status.textContent = 'Ready.';
}
reset();
let otherRegion = false;
document
  .querySelector<HTMLButtonElement>('#region-target')!
  .addEventListener('click', () => {
    otherRegion = !otherRegion;
    return otherRegion;
  });
screen.addEventListener('change', () => {
  reset();
  canvas.setAttribute(
    'aria-label',
    screen.value === 'results'
      ? 'Production round results fixture, press any key to continue'
      : 'Production HUD fixture',
  );
  canvas.focus();
});
document
  .querySelector<HTMLButtonElement>('#reset')!
  .addEventListener('click', reset);
document
  .querySelector<HTMLButtonElement>('#scale')!
  .addEventListener('click', () => {
    const full = canvas.style.width !== '960px';
    canvas.style.width = full ? '960px' : '640px';
    canvas.style.height = full ? '600px' : '400px';
  });
document
  .querySelector<HTMLButtonElement>('#target')!
  .addEventListener('click', () => {
    targetEdge = !targetEdge;
    status.textContent = targetEdge
      ? 'Lock target outside viewport; reticle clamped at right edge.'
      : 'Lock target centered.';
  });
canvas.addEventListener('click', () => {
  if (screen.value === 'results') {
    advance();
  }
});
window.addEventListener('keydown', (e) => {
  if ((e.target as Element | null)?.matches('select,button')) {
    return;
  }
  if (screen.value === 'results') {
    e.preventDefault();
    advance(e);
    return;
  }
  keys.add(e.code);
  const input = readControls(keys);
  lastPress = e.code + ': ' + JSON.stringify(input);
  status.textContent = lastPress;
  if (e.code.startsWith('Arrow') || e.code === 'Space') {
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (screen.value !== 'results') {
    status.textContent =
      'Last press ' +
      lastPress +
      '; current ' +
      JSON.stringify(readControls(keys));
  }
});
window.addEventListener('blur', () => keys.clear());
function frame() {
  requestAnimationFrame(frame);
  const inventory = screen.value === 'inventory',
    warning = screen.value === 'warning';
  sim.time = warning ? 213.5 : 296.2;
  sim.score = warning ? 1000 : 0;
  for (const r of sim.runners) {
    r.dead = r.id === 6 && warning ? 2 : 0;
    if (r.id === 6) {
      if (warning) {
        r.health = 0;
      } else {
        r.health = 98;
      }
    } else if (warning && r.id === 3) {
      r.health = 70;
    } else {
      r.health = 100;
    }

    r.zoneMask = warning && r.id !== 0 && r.id !== 6 ? 2 : 1;
    r.inactive = warning ? [2, 4, 7].includes(r.id) : r.id > 3 && r.id !== 6;
    r.x = 0;
    r.z = 0;
  }
  if (screen.value === 'regions') {
    const poses = {
        6: [0, -300],
        0: [otherRegion ? -300 : 300, -300],
        1: [-300, -300],
        2: [0, -100],
      },
      regions = worldRegions(1);
    for (const r of sim.runners) {
      r.inactive = !poses[r.id as keyof typeof poses];
      if (poses[r.id as keyof typeof poses]) {
        [r.x, r.z] = poses[r.id as keyof typeof poses];
      }
      r.zoneMask = regions.maskAt(r.x, r.z);
    }
    status.textContent = `IN AREA: ${inAreaCount(sim, 6)}; selected runner mask ${sim.runners[6].zoneMask}; opponent mask ${sim.runners[0].zoneMask}. Original Alcatraz II regions, supplied poses.`;
  }
  sim.runners[6].weapons = inventory
    ? [null, 'Missile', 'Ion Sword', 'NanoShield']
    : [null];
  sim.runners[6].selectedWeapon = inventory ? 2 : 0;
  sim.runners[6].keyring = { x: inventory, y: inventory, z: inventory };
  if (screen.value === 'results') {
    drawRoundResults(
      ctx,
      {
        ...sim,
        score: 8630,
        roundBonus: { kills: 2000, time: 1330, credits: 0 },
      } as unknown as import('../../src/simulation.ts').Simulation,
      { picture },
    );
    return;
  }
  let messages: { text: string; color: string; until: number }[];
  if (warning) {
    messages = [
      { text: 'NEXUS DIED', color: 'pink', until: Infinity },
      { text: "YOU'VE BEEN LOCKED ON", color: 'red', until: Infinity },
    ];
  } else if (screen.value === 'messages') {
    messages = [
      {
        text: 'NEXUS KILLED SKORPION WITH LASER',
        color: 'pink',
        until: Infinity,
      },
      {
        text: 'RETURN TO DOMAIN ALCATRAZ II',
        color: 'whit',
        until: Infinity,
      },
    ];
  } else {
    messages = [];
  }

  drawHud(ctx, sim, 6, {
    picture,
    messages,
    warning: warning ? { active: true, shade: 'l' } : null,
    reticle:
      screen.value === 'reticle'
        ? projectReticle({ x: targetEdge ? 500 : 0, y: 0, z: 100 })
        : null,
  });
}
frame();
