import { GAME_TABLES } from './game-tables.ts';
// Profile helper 418e44 stores the caller's delta, the human multiplier result,
// and the final health as floats. It does not deactivate the scene actor.
export function healthAfterDelta(
  health: number,
  delta: number,
  { profileType = 1, shielded = false, invulnerableHuman = false } = {},
) {
  const f = Math.fround;
  if (profileType === 2) {
    return health;
  }
  let change = f(delta);
  if (profileType === 0) {
    if (change < 0) {
      change = f(change * GAME_TABLES.combat.playerDamageFactor);
    }
    if (invulnerableHuman) {
      return health;
    }
  }
  if (shielded && change < 0) {
    return health;
  }
  return Math.max(0, Math.min(100, f(health + change)));
}
export function damageDelta(amount: number, armor = 1, power = 1) {
  return Math.fround(-Math.fround(amount) * armor * power);
}
