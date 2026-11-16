import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
export const RUNNER_POSE = GAME_TABLES.runnerPose;
export function cockpitRollDegrees(turnRadians = 0) {
  const turn = Math.fround((turnRadians * 180) / Math.PI),
    roll = Math.fround(turn * RUNNER_POSE.cockpitRollRatio);
  return Math.max(
    -RUNNER_POSE.maximumCockpitRoll,
    Math.min(RUNNER_POSE.maximumCockpitRoll, roll),
  );
}
export function runnerExit(
  r: Partial<Pick<Runner, 'id' | 'opponentExit'>>,
  escape: import('./game-types.ts').ExitVisualState | null = null,
) {
  return r.opponentExit ?? (escape?.runner === r.id ? escape : null);
}
export function runnerCockpitRoll(
  r: Partial<Pick<Runner, 'id' | 'opponentExit' | 'turn'>>,
  escape: import('./game-types.ts').ExitVisualState | null = null,
) {
  return (
    runnerExit(r, escape)?.cockpitRollDegrees ?? cockpitRollDegrees(r.turn)
  );
}
