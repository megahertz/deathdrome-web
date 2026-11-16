import { clearRouteNodes } from './ai-navigation.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { hideRunnerProjectiles } from './projectiles.ts';
import { beginRespawn } from './respawn.ts';
export const POPULATION = GAME_TABLES.population;

// Native 434580 prunes from the highest model ID down, preserving the human
// selected by profile 0. Model IDs continue to determine geometry and spawn.
export function initialActiveModels(
  player: number,
  count = POPULATION.initialCount,
) {
  count = Math.max(1, Math.min(POPULATION.modelCount, count));
  const active = Array.from({ length: POPULATION.modelCount }, (_, i) => i);
  for (let i = active.length - 1; active.length > count && i >= 0; i--) {
    if (active[i] !== player) {
      active.splice(i, 1);
    }
  }
  return active;
}

export class RunnerPopulation {
  declare sim: import('./simulation.ts').Simulation;
  declare maximum: number;
  declare cursor: number;

  constructor(
    sim: import('./simulation.ts').Simulation,
    count = POPULATION.initialCount,
  ) {
    this.sim = sim;
    this.maximum = Math.max(1, Math.min(POPULATION.modelCount, count));
    this.cursor = this.maximum % POPULATION.modelCount;
  }
  initialize() {
    this.cursor = this.maximum % POPULATION.modelCount;
    const active = new Set(initialActiveModels(this.sim.player, this.maximum));
    for (const r of this.sim.runners) {
      if (!active.has(r.id)) {
        this.retire(r, { saveGoal: false });
      }
    }
    return active;
  }
  retire(
    r: Pick<
      Runner,
      | 'acceleration'
      | 'dead'
      | 'id'
      | 'inactive'
      | 'ionSeconds'
      | 'ionTarget'
      | 'lateralSpeed'
      | 'navigation'
      | 'nitro'
      | 'nitroTarget'
      | 'respawn'
      | 'savedGoalColor'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'turn'
    > &
      Partial<Runner>,
    {
      releaseRoute = true,
      saveGoal = true,
    }: { releaseRoute?: boolean | 'goal'; saveGoal?: boolean } = {},
  ) {
    const nav = r.navigation,
      index =
        releaseRoute === 'goal'
          ? Math.max(
              0,
              GAME_TABLES.ai.navigation.routeColors.indexOf(
                nav?.goalColor ?? 0,
              ),
            )
          : nav?.routeIndex;
    if (releaseRoute && index != null) {
      this.sim.aiRouteCounts[index]--;
    }
    r.savedGoalColor = saveGoal ? (nav?.goalColor ?? r.savedGoalColor ?? 0) : 0;
    if (r.respawn?.routeIndex != null) {
      this.sim.aiRouteCounts[r.respawn.routeIndex]--;
    }
    r.respawn = null;
    hideRunnerProjectiles(this.sim, r);
    clearRouteNodes(this.sim, r);
    r.navigation = null;
    r.inactive = true;
    r.dead = Infinity;
    r.speed = 0;
    r.lateralSpeed = 0;
    r.turn = 0;
    r.acceleration = 0;
    r.nitro = 0;
    r.nitroTarget = null;
    r.ionSeconds = 0;
    r.ionTarget = null;
    r.shield = 0;
    r.shieldPlanes = null;
  }
  // 433df4 starts at its saved cursor and advances only when a slot is rejected.
  // Wrecks are separate objects and remain attached to their original model ID.
  nextInactive() {
    for (let i = 0; i < POPULATION.modelCount; i++) {
      const id = (this.cursor + i) % POPULATION.modelCount,
        r = this.sim.runners[id];
      if (
        id !== this.sim.player &&
        r.inactive &&
        r.dead === Infinity &&
        !r.escaped &&
        !r.opponentExit
      ) {
        this.cursor = id;
        return r;
      }
    }
    return null;
  }
  replace(
    r: Pick<
      Runner,
      | 'acceleration'
      | 'dead'
      | 'id'
      | 'inactive'
      | 'ionSeconds'
      | 'ionTarget'
      | 'lateralSpeed'
      | 'navigation'
      | 'nitro'
      | 'nitroTarget'
      | 'respawn'
      | 'savedGoalColor'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'turn'
    > &
      Partial<Runner>,
  ) {
    const { sim } = this,
      previous = r.id;
    this.retire(r, { releaseRoute: r.navigation ? 'goal' : true });
    // Death replacement scans capacities from index zero; initial allocation
    // starts at the current round, a distinct rule in native 42d940.
    const limits = GAME_TABLES.ai.navigation.routeLimits,
      index = limits.findIndex(
        (row, i) => row[sim.round - 1] > sim.aiRouteCounts[i],
      );
    if (index < 0) {
      return null;
    }
    const next = this.nextInactive();
    if (!next) {
      return null;
    }
    beginRespawn(sim, next, { routeIndex: index >= 0 ? index : null });
    sim.emit('replacement', {
      previous,
      runner: next.id,
      routeColor:
        index >= 0 ? GAME_TABLES.ai.navigation.routeColors[index] : null,
    });
    return next;
  }
}
