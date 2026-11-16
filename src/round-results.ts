import { drawBitmapText } from './bitmap-ui.ts';
import { GAME_TABLES } from './game-tables.ts';
import { type Simulation } from './simulation.ts';
// 424b70 results screen: 449704 text calls, including the domain-specific X
// coordinates stored at 48ecf6. Keep these separate from HTML font metrics.
const domainX = [110, 115, 105, 127, 107, 120, 115, 115];
export function resultLabels(
  sim: Simulation,
  {
    win = true,
    arena = sim.arena,
    round = sim.round,
    _player = sim.player,
  } = {},
) {
  const labels: {
      value: string;
      x: number;
      y: number;
      color: string;
      size: number;
    }[] = [],
    add = (value: string | number, x: number, y: number, color = 'whit') =>
      labels.push({ value: String(value), x, y, color, size: 10 });
  add(GAME_TABLES.domains[arena - 1].name, domainX[arena - 1], 15, 'red');
  add(
    win ? `ROUND ${round} COMPLETED` : 'GAME OVER',
    win ? 70 : 115,
    27,
    'red',
  );
  if (win) {
    add('KILL BONUS', 15, 65);
    add(sim.roundBonus?.kills ?? 0, 225, 65);
    add('TIME BONUS', 15, 95);
    add(sim.roundBonus?.time ?? 0, 225, 95);
    add('EXTRA LIFE CREDITS', 15, 125);
    add(sim.roundBonus?.credits ?? 0, 225, 125);
  }
  add('TOTAL SCORE', 15, 175);
  add(sim.score, 225, 175);
  return labels;
}
export function resultContinuation({
  win,
  arena,
  round,
}: {
  win: boolean;
  arena: number;
  round: number;
}) {
  if (!win) {
    return { kind: 'menu' as const };
  }
  if (round < 3) {
    return { kind: 'round' as const, arena, round: round + 1 };
  }
  if (arena < 8) {
    return { kind: 'domain' as const, arena: arena + 1, round: 1 };
  }

  return { kind: 'freedom' as const };
}
export function visibleResultLabels(
  sim: Simulation,
  {
    rows = Infinity,
    flashingRow = 0,
    numberVisible = true,
    ...options
  }: {
    win?: boolean;
    arena?: number;
    round?: number;
    player?: number;
    rows?: number;
    flashingRow?: number;
    numberVisible?: boolean;
  } = {},
) {
  let visibleY;
  if (options.win === false) {
    visibleY = 27;
  } else if (rows < 1) {
    visibleY = 27;
  } else if (rows < 2) {
    visibleY = 65;
  } else if (rows < 3) {
    visibleY = 95;
  } else {
    visibleY = 125;
  }

  const flashY = options.win === false ? 175 : [0, 65, 95, 125][flashingRow];
  return resultLabels(sim, options)
    .filter(
      (label) =>
        (label.y <= visibleY || (label.y === 175 && rows > 0)) &&
        (numberVisible || label.x !== 225 || label.y !== flashY),
    )
    .map((label) =>
      label.y === 175 && label.x === 225 && rows === 1 && options.win !== false
        ? { ...label, value: String(sim.score - (sim.roundBonus?.time ?? 0)) }
        : label,
    );
}
export function drawRoundResults(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  {
    picture,
    rows = Infinity,
    flashingRow = 0,
    numberVisible = true,
    ...options
  }: {
    picture:
      | ((path: string) => any)
      | ((path: string) => any)
      | ((path: string) => any);
    win?: boolean;
    arena?: number;
    round?: number;
    player?: number;
    rows?: number;
    flashingRow?: number;
    numberVisible?: boolean;
  },
) {
  ctx.clearRect(0, 0, 320, 200);
  ctx.imageSmoothingEnabled = false;
  const background = picture('images/dombak4');
  if (background.complete && background.naturalWidth) {
    ctx.drawImage(background, 0, 0, 320, 200);
  }
  for (const label of visibleResultLabels(sim, {
    ...options,
    rows,
    flashingRow,
    numberVisible,
  })) {
    drawBitmapText(ctx, label.value, label.x, label.y, label);
  }
}
// Repeated keydown events from a driving/fire key held across the transition
// must not dismiss results. Each results screen advances at most once.
export function resultAdvance(action: () => unknown) {
  let consumed = false;
  return (event?: { repeat?: boolean; code?: string }) => {
    if (consumed || event?.repeat) {
      return false;
    }
    consumed = true;
    action();
    return true;
  };
}
