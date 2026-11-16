import { clearRouteNodes } from './ai-navigation.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { type Simulation } from './simulation.ts';
export const RESPAWN = GAME_TABLES.respawn;
export const runnerBodyVisible = (r: Partial<Runner>) =>
  !r.dead || !!r.respawn?.bodyVisible || !!r.opponentExit;
export function cancelRespawn(
  sim: Simulation,
  r: Pick<Runner, 'respawn'> & Partial<Runner>,
) {
  if (r.respawn?.routeIndex !== null && r.respawn?.routeIndex !== undefined) {
    sim.aiRouteCounts[r.respawn.routeIndex]--;
  }
  r.respawn = null;
}

// 433c88 positions the inactive runner, then the shroud node's actions run
// 42b2cc (delay) and 42b180 (energize). Physics/control reset occurs at the end.
export function beginRespawn(
  sim: Simulation,
  r: Pick<Runner, 'floor' | 'id' | 'navigation' | 'respawn' | 'x' | 'y' | 'z'> &
    Partial<Runner>,
  {
    routeIndex = null,
    goalColor = null,
    allocateRoute = true,
  }: {
    routeIndex?: number | null;
    goalColor?: number | null;
    allocateRoute?: boolean;
  } = {},
) {
  cancelRespawn(sim, r);
  if (
    r.navigation?.routeIndex !== null &&
    r.navigation?.routeIndex !== undefined
  ) {
    sim.aiRouteCounts[r.navigation.routeIndex]--;
  }
  clearRouteNodes(sim, r);
  r.navigation = null;
  const pose = sim.spawnPose(r.id);
  Object.assign(r, pose, {
    inactive: false,
    dead: Infinity,
    speed: 0,
    lateralSpeed: 0,
    vy: 0,
    turn: 0,
    acceleration: 0,
    turnAcceleration: 0,
  });
  r.floor = sim.ground(r.x, r.z, r.y + 8);
  r.respawn = {
    phase: 'delay',
    elapsed: 0,
    bodyVisible: false,
    shroudVisible: false,
    routeIndex,
    goalColor,
    allocateRoute,
    born: sim.elapsed,
  };
  if (routeIndex !== null && routeIndex !== undefined) {
    sim.aiRouteCounts[routeIndex]++;
  }
  sim.emit('respawnStarted', { runner: r.id });
  return r.respawn;
}

export function stepRespawn(
  sim: Simulation,
  r: Pick<
    Runner,
    | 'acceleration'
    | 'aiState'
    | 'ammo'
    | 'id'
    | 'missileLockTarget'
    | 'muzzleSide'
    | 'navigation'
    | 'nitro'
    | 'nitroTarget'
    | 'respawn'
    | 'selectedWeapon'
    | 'speed'
    | 'targetNode'
    | 'weapon'
    | 'weaponCells'
    | 'weapons'
    | 'x'
    | 'y'
    | 'z'
  > &
    Partial<Runner>,
  dt: number,
) {
  const state = r.respawn;
  if (!state) {
    return false;
  }
  state.elapsed = Math.fround(state.elapsed + Math.fround(dt));
  if (state.phase === 'delay') {
    if (state.elapsed > RESPAWN.delaySeconds) {
      state.phase = 'energize';
      state.elapsed = 0;
      state.shroudVisible = true;
      sim.emit('respawnEnergize', { runner: r.id });
    }
  } else if (state.elapsed >= RESPAWN.energizeSeconds) {
    // Release the pending reservation; native setup receives the route already
    // chosen by the death-replacement action, rather than allocating another.
    sim.spawn(r, {
      routeIndex: state.allocateRoute
        ? (state.routeIndex ?? undefined)
        : state.routeIndex,
      goalColor: state.goalColor,
    });
    sim.emit('respawnComplete', { runner: r.id });
  } else if (state.elapsed >= RESPAWN.bodyAtSeconds && !state.bodyVisible) {
    state.bodyVisible = true;
    sim.emit('respawnBody', { runner: r.id });
  }
  return true;
}
