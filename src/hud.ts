import { drawBitmapText, bitmapWidth } from './bitmap-ui.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { projectRadar } from './hud-radar.ts';
import { type Simulation } from './simulation.ts';
const HUD_FRAME_IMAGES = new Set([
  'hud_bot',
  'hud_top',
  'hud_t_l',
  'hud_b_l',
  'hud_t_r',
  'hud_b_r',
  'hud_rdr',
]);
const icons = {
  'Missile': 'sm',
  'Nitro Ram': 'nr',
  'ShockWave': 'sw',
  'Disruptor': 'ds',
  'Ion Sword': 'is',
  'NanoShield': 'ns',
};
export const RUNNER_SHADES = [
  'red',
  'blue',
  'yelo',
  'whit',
  'purp',
  'gren',
  'pink',
  'orng',
];
// 417534 palette entries from RUN/domain.act.
const radarColors = [
  '#e6191c',
  '#1d42e6',
  '#c29202',
  '#fdfdfd',
  '#a219e6',
  '#14e626',
  '#e619cb',
  '#e65d19',
];
export const runnerName = (
  r: Pick<Runner, 'id'> & Partial<Runner>,
  tables: { runners: { name: string }[] } = GAME_TABLES,
) => tables.runners[r.id].name.split(' ')[0];
export function notificationLayout(
  messages: import('./hud-types.ts').HudMessage[],
  now = 0,
) {
  const active = messages
    .filter((m: { until: number }) => m.until > now)
    .slice(-3);
  return active.map((m: import('./hud-types.ts').HudMessage, i: number) => ({
    ...m,
    x: 160 - Math.floor((m.text.length * 10) / 4),
    y: m.y ?? 60 - (active.length - 1 - i) * 11,
  }));
}
// 416854 shows barrier capacity and subsequent retraction, not runner health
// or primary projectile slots (454/458/488/48c belong to the barrier trail).
export function barrierGauge(state: {
  owner?: number;
  active: any;
  held?: boolean;
  armed?: boolean;
  locked?: boolean;
  generating?: boolean;
  age: any;
  points: any;
  retract: any;
}) {
  if (!state?.active) {
    return 74;
  }
  const count = Math.max(0, state.points.length - 1),
    fraction =
      state.age >= 4.5
        ? Math.min(1, state.retract / count)
        : Math.max(
            0,
            Math.min(1, Math.fround((20 - count) * Math.fround(0.05))),
          );
  return Math.trunc(Math.fround(Math.fround(fraction) * 74));
}
// 41557d keeps the extended product on the x87 stack through conversion.
// Rounding it to float32 first incorrectly makes full health two pixels wider.
export function opponentHealthBar(health: number) {
  const half = Math.max(1, Math.trunc(health * Math.fround(0.01) * 22) >> 1);
  return health > 0 ? { x: 198 - half, width: half * 2 } : { x: 198, width: 0 };
}
function radarLine(
  ctx: {
    fillRect: (arg0: number, arg1: number, arg2: number, arg3: number) => void;
  },
  x: number,
  y: number,
  x2: number,
  y2: number,
) {
  let a = x * 2;
  let b = y * 2;
  const c = x2 * 2;
  const d = y2 * 2;
  const dx = Math.abs(c - a);
  const sx = a < c ? 1 : -1;
  const dy = -Math.abs(d - b);
  const sy = b < d ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    ctx.fillRect(a / 2, b / 2, 0.5, 0.5);
    if (a === c && b === d) {
      break;
    }
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      a += sx;
    }
    if (twice <= dx) {
      error += dx;
      b += sy;
    }
  }
}
// 416380/416420, 415c20/415d40/415004/415124/415300/4156d0.
// Positions use the original logical 320x200 coordinate system. The in-game
// 640x400 mode uses the BIG HUD assets and unscaled 10-pixel atlas glyphs.
export function hudCommands(sim: Simulation, player: number) {
  const r = sim.runners[player],
    commands: import('./hud-types.ts').HudCommand[] = [],
    image = (name: string, x: number, y: number) =>
      commands.push({ kind: 'image', name, x, y }),
    text = (value: string | number, x: number, y: number) =>
      commands.push({
        kind: 'text',
        value: String(value),
        x,
        y,
        color: 'gren',
      });
  image('hud_bot', 0, 156);
  image('hud_top', 0, 0);
  image('hud_t_l', 0, 17);
  image('hud_b_l', 0, 144);
  image('hud_t_r', 244, 17);
  image('hud_b_r', 180, 137);
  for (let i = 0; i < 6; i++) {
    image('hudlcr_' + (i < sim.lives - 1 ? 'h' : 'l'), 140 + i * 7, 192);
  }
  const time = Math.fround(Math.max(0, sim.time)),
    seconds = Math.trunc(time % 60),
    remaining = Math.max(0, sim.requiredKills - r.kills);
  text(
    `${String(Math.trunc(time / 60)).padStart(2, ' ')}:${String(seconds).padStart(2, ' ')}:${Math.trunc((time % 1) * 10)}`,
    97,
    5,
  );
  let requirement = 'ADVANCE';
  if (remaining) {
    if (sim.scrubbing) {
      requirement = 'SCRUB';
    } else {
      requirement = remaining === 1 ? '1 KILL LEFT' : `${remaining} KILLS LEFT`;
    }
  }
  text(requirement, 159, 5);
  text(sim.score, 259, 5);
  text(r.kills === 1 ? '1 KILL' : `${r.kills} KILLS`, 266, 19);
  const health = String(Math.max(0, Math.trunc(r.health)));
  text(health, 148, 169);
  text('%', 150 + bitmapWidth(health, 10) * 0.5, 169);
  image('hud_pl_' + (r.selectedWeapon === 0 ? 'h' : 'l'), 46, 157);
  for (let i = 0; i < 3; i++) {
    const weapon = r.weapons[i + 1];
    image(
      weapon
        ? 'hud_' +
            icons[weapon] +
            '_' +
            (r.selectedWeapon === i + 1 ? 'h' : 'l')
        : 'hud_wec',
      61 + i * 23,
      157,
    );
  }
  image('hud_rdr', 220, 157);
  text(inAreaCount(sim, player), 212, 165);
  const keyColors = [
    ['#220809', '#b61416'],
    ['#08220a', '#10b51f'],
    ['#060e25', '#1835b6'],
  ];
  for (const [i, key] of (['x', 'y', 'z'] as const).entries()) {
    commands.push({
      kind: 'rect',
      x: 50 + i * 6,
      y: 4,
      width: 6,
      height: 7,
      color: keyColors[i][r.keyring?.[key] ? 1 : 0],
    });
  }
  return commands;
}
export function inAreaCount(sim: Simulation, player: number) {
  const r = sim.runners[player];
  return sim.runners.filter(
    (q: {
      id: any;
      dead: any;
      inactive: any;
      respawn: any;
      escaped: any;
      opponentExit: any;
      zoneMask: any;
    }) =>
      q.id !== player &&
      !q.dead &&
      !q.inactive &&
      !q.respawn &&
      !q.escaped &&
      !q.opponentExit &&
      (q.zoneMask ?? -1) & (r.zoneMask ?? -1),
  ).length;
}
export function drawHud(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  player: number,
  {
    picture,
    messages = [],
    now = 0,
    warning = null,
    reticle = null,
    frameOnly = false,
    layer = 'all',
  }: import('./hud-types.ts').HudOptions,
) {
  ctx.clearRect(0, 0, 320, 200);
  ctx.imageSmoothingEnabled = false;
  for (const c of hudCommands(sim, player)) {
    const frame = c.kind === 'image' && HUD_FRAME_IMAGES.has(c.name);
    if ((layer === 'art' && !frame) || (layer === 'widgets' && frame)) {
      continue;
    }
    if (c.kind === 'image') {
      const im = picture('hud/big/' + c.name);
      if (im.complete && im.naturalWidth) {
        ctx.drawImage(im, c.x, c.y, im.naturalWidth / 2, im.naturalHeight / 2);
        if (c.name === 'hud_bot') {
          ctx.fillStyle = '#000';
          ctx.fillRect(164, 168, 8, 8);
        }
      }
    } else if (c.kind === 'rect') {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.width, c.height);
    } else {
      drawBitmapText(ctx, c.value, c.x, c.y, { color: c.color, scale: 0.5 });
    }
  }
  if (layer === 'art') {
    return;
  }
  const r = sim.runners[player];
  if (reticle) {
    const im = picture('hud/big/reticle');
    if (im.complete && im.naturalWidth) {
      ctx.drawImage(im, reticle.x, reticle.y, reticle.width, reticle.height);
    }
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(51, 188, 74, 2);
  ctx.fillStyle = radarColors[player];
  ctx.fillRect(51, 188, barrierGauge(sim.barrierTrails?.states[player]), 2);
  for (const [i, q] of sim.runners
    .filter((candidate) => candidate.id !== player)
    .entries()) {
    if (q.dead || q.inactive || q.respawn || q.escaped || q.opponentExit) {
      continue;
    }
    const bar = opponentHealthBar(q.health);
    ctx.fillStyle = radarColors[q.id];
    ctx.fillRect(bar.x, 171 + i * 2, bar.width, 1);
  }
  if (warning?.active) {
    const im = picture('hud/big/hudwrn_' + warning.shade);
    if (im.complete && im.naturalWidth) {
      ctx.drawImage(im, 144, 182, 33, 7);
    }
  }
  const forward = r.planarForwardVector ?? {
    x: Math.fround(-Math.sin(r.yaw)),
    z: Math.fround(-Math.cos(r.yaw)),
  };
  for (const q of [
    r,
    ...sim.runners.filter((candidate) => candidate.id !== player),
  ]) {
    if (
      q.id !== player &&
      (q.dead || q.inactive || q.respawn || q.escaped || q.opponentExit)
    ) {
      continue;
    }
    const { x, y, edge } =
      q.id === player
        ? { x: 251, y: 176, edge: -1 }
        : projectRadar(r, q, forward);
    ctx.fillStyle = radarColors[q.id];
    if (edge < 0) {
      ctx.fillRect(x, y, 0.5, 0.5);
    } else {
      for (const [dx, dy] of [
        [
          [-1, -1],
          [-1, 1],
        ],
        [
          [1, -1],
          [1, 1],
        ],
        [
          [-1, -1],
          [1, -1],
        ],
      ][edge] ?? [
        [-1, 1],
        [1, 1],
      ]) {
        radarLine(ctx, x, y, x + dx, y + dy);
      }
    }
  }
  if (!frameOnly) {
    for (const c of hudScreenCommands(sim, player, { messages, now })) {
      drawBitmapText(ctx, c.value, c.x, c.y, {
        size: c.size,
        color: c.color,
        scale: c.scale,
      });
    }
  }
}
export function hudScreenCommands(
  sim: Simulation,
  player: number,
  {
    messages = [],
    now = 0,
  }: Pick<import('./hud-types.ts').HudOptions, 'messages' | 'now'> = {},
) {
  const r = sim.runners[player],
    commands = notificationLayout(messages, now).map(
      (m: { text: string; x: number; y: number; color?: string }) => ({
        value: m.text,
        x: m.x,
        y: m.y,
        color: m.color || 'whit',
        size: 10,
        scale: 0.5,
      }),
    );
  const centered = (
    value: string,
    y: number,
    color = 'whit',
    size = 10,
    scale = 0.5,
  ) =>
    commands.push({
      value,
      x: 160 - (bitmapWidth(value, size) * scale) / 2,
      y,
      color,
      size,
      scale,
    });
  if (sim.entrance?.active && sim.entrance.elapsed < 4) {
    centered(`ROUND ${sim.round}`, 60);
    centered(`${sim.requiredKills} KILLS REQUIRED TO ESCAPE`, 84);
  }
  if (sim.countdown > 0 && sim.countdown <= 3) {
    centered(String(Math.ceil(sim.countdown)), 90, 'yelo', 10, 1);
  }
  if (r.disrupted > 0) {
    centered('SYSTEM DISRUPTED', 80, 'red');
  }
  return commands;
}
