import { exitCameraPose, stepExitPose } from './exit-pose.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { hideRunnerProjectiles } from './projectiles.ts';
import { beginRespawn } from './respawn.ts';
import { cockpitRollDegrees } from './runner-pose.ts';
import { type Simulation } from './simulation.ts';
export const ESCAPE = GAME_TABLES.escape;
// 4300c6: the exit handoff replaces any health below one with float 0.9.
function protectExitHealth(r: Pick<Runner, 'health'> & Partial<Runner>) {
  if (r.health < 1) {
    r.health = Math.fround(0.9);
  }
}
export function beginEscape(
  sim: Simulation,
  r: Pick<Runner, 'health' | 'id' | 'turn'> & Partial<Runner>,
) {
  sim.phase = 'exiting';
  sim.escape = {
    phase: 'delay',
    remaining: ESCAPE.alignDelay,
    runner: r.id,
    foldDegrees: 0,
    camera: exitCameraPose(sim.captureCamera?.()),
    cockpitRollDegrees: cockpitRollDegrees(r.turn),
  };
  Object.assign(r, {
    inactive: true,
    speed: 0,
    turn: 0,
    acceleration: 0,
    turnAcceleration: 0,
    vy: 0,
    nitro: 0,
    ionSeconds: 0,
    ionTarget: null,
    shield: 0,
    shieldPlanes: null,
  });
  hideRunnerProjectiles(sim, r);
  for (const q of sim.runners) {
    if (q.id !== r.id) {
      q.controlsEnabled = false;
    }
  }
  protectExitHealth(r);
  sim.emit('escapeStarted', { runner: r.id });
}
// Native state actions consume one frame before installing the next action.
export function stepEscape(
  sim: import('./simulation.ts').Simulation,
  dt: number,
) {
  const e = sim.escape!,
    r = sim.runners[e.runner];
  if (stepExitPose(sim, r, e, dt, true)) {
    const previousLives = sim.lives;
    sim.phase = 'roundcomplete';
    sim.roundBonus = {
      kills: r.kills * GAME_TABLES.roundBonus.perKill,
      time:
        Math.max(0, Math.trunc(sim.time)) *
        GAME_TABLES.roundBonus.perRemainingSecond,
    };
    sim.addScore(sim.roundBonus.kills!);
    sim.addScore(sim.roundBonus.time!);
    sim.roundBonus.credits = Math.max(0, sim.lives - previousLives);
    sim.emit('roundcomplete');
  }
}

// 434e9c permits qualified AI at the central exit. 42fed4 additionally gates
// their single-player exit at <=35 seconds; it starts a replacement immediately
// and runs a separate model action at 25 units/s, without stopping the round.
export function canOpponentExit(
  sim: Simulation,
  r: Pick<Runner, 'dead' | 'escaped' | 'id' | 'kills' | 'x' | 'y' | 'z'> &
    Partial<Runner>,
) {
  return (
    r.id !== sim.player &&
    !r.dead &&
    !r.escaped &&
    r.kills >= sim.requiredKills &&
    sim.time <= ESCAPE.aiExitSeconds &&
    r.y <= ESCAPE.maximumHeight &&
    r.x * r.x + r.z * r.z <= ESCAPE.radiusSquared
  );
}
export function beginOpponentExit(
  sim: Simulation,
  r: Pick<
    Runner,
    | 'acceleration'
    | 'dead'
    | 'escaped'
    | 'health'
    | 'id'
    | 'inactive'
    | 'ionSeconds'
    | 'ionTarget'
    | 'kills'
    | 'lateralSpeed'
    | 'navigation'
    | 'nitro'
    | 'nitroTarget'
    | 'opponentExit'
    | 'respawn'
    | 'savedGoalColor'
    | 'shield'
    | 'shieldPlanes'
    | 'speed'
    | 'turn'
    | 'turnAcceleration'
    | 'vy'
    | 'x'
    | 'y'
    | 'z'
  > &
    Partial<Runner>,
) {
  if (!canOpponentExit(sim, r)) {
    return false;
  }
  // Unlike death's 433b2c, this live path never decrements the route counters.
  const roll = cockpitRollDegrees(r.turn);
  sim.population.retire(r, { releaseRoute: false });
  r.escaped = true;
  r.opponentExit = {
    phase: 'delay',
    remaining: ESCAPE.alignDelay,
    foldDegrees: 0,
    cockpitRollDegrees: roll,
  };
  r.vy = 0;
  r.turnAcceleration = 0;
  const next = sim.population.nextInactive();
  if (next) {
    beginRespawn(sim, next, {
      routeIndex: null,
      goalColor: next.savedGoalColor ?? 0,
      allocateRoute: false,
    });
  }
  protectExitHealth(r);
  sim.emit('opponentExitStarted', {
    runner: r.id,
    replacement: next?.id ?? null,
  });
  return true;
}
export function stepOpponentExit(
  sim: Simulation,
  r: Pick<Runner, 'id' | 'opponentExit' | 'x' | 'y' | 'z'> & Partial<Runner>,
  dt: number,
) {
  const e = r.opponentExit;
  if (!e) {
    return;
  }
  if (stepExitPose(sim, r, e, dt)) {
    r.opponentExit = null;
    sim.emit('opponentExitComplete', { runner: r.id });
  }
}
