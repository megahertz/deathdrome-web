import { GAME_TABLES } from './game-tables.ts';
export const EXIT_HANGAR = GAME_TABLES.escape.hangar;
export function resetExitHangar(sim: import('./simulation.ts').Simulation) {
  sim.exitHangar = { door: 0, sign: 0, moving: false };
  sim.updateExitHangar?.(sim.exitHangar);
}
// 43b170 installs 43b060 on the door during centering. The shared door
// remains raised until every concurrent exit action has finished.
export function stepExitHangar(
  sim: import('./simulation.ts').Simulation,
  inputDt: number,
) {
  let dt = inputDt;

  const h = sim.exitHangar;
  if (!h?.moving) {
    return;
  }
  const active =
    (sim.escape && sim.escape.phase !== 'complete' ? 1 : 0) +
    sim.runners.filter((r: { opponentExit: any }) => r.opponentExit).length;
  dt = Math.fround(dt);
  if (active) {
    if (h.door < EXIT_HANGAR.height) {
      h.door = Math.fround(h.door + Math.fround(dt * EXIT_HANGAR.doorSpeed));
      h.sign = Math.fround(h.sign + Math.fround(dt * EXIT_HANGAR.signSpeed));
    }
  } else if (dt * EXIT_HANGAR.closeThresholdSpeed < h.door) {
    h.door = Math.fround(h.door + Math.fround(dt * -EXIT_HANGAR.doorSpeed));
    h.sign = Math.fround(h.sign + Math.fround(dt * -EXIT_HANGAR.signSpeed));
  } else {
    h.door = 0;
    h.sign = 0;
    h.moving = false;
  }
  sim.updateExitHangar?.(h);
}
