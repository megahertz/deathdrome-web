import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
export const NANO = GAME_TABLES.secondary.nanoShield;
export function activateShield(
  r: Pick<Runner, 'shield' | 'shieldPlanes'> & Partial<Runner>,
) {
  r.shield = NANO.effectiveSeconds;
  r.shieldPlanes = [
    { z: NANO.minimumZ, velocity: NANO.speed, scale: NANO.minimumScale },
    { z: 0, velocity: -NANO.speed, scale: NANO.maximumScale },
  ];
}
export function stepShield(
  r: Pick<Runner, 'shield' | 'shieldPlanes'> & Partial<Runner>,
  dt: number,
) {
  r.shield = Math.max(0, r.shield - dt);
  if (!r.shield) {
    r.shieldPlanes = null;
    return;
  }
  for (const p of r.shieldPlanes || []) {
    p.z += p.velocity * dt;
    if (p.z > NANO.maximumZ) {
      p.z = NANO.maximumZ;
      p.velocity = -p.velocity;
      p.scale = NANO.maximumScale;
    } else if (p.z < NANO.minimumZ) {
      p.z = NANO.minimumZ;
      p.velocity = -p.velocity;
      p.scale = NANO.minimumScale;
    }
  }
}
