import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { type Simulation } from './simulation.ts';
export const NITRO = GAME_TABLES.secondary.nitroRam;

// Native 0x4365a0 rotates the runner toward its retained lock using sin(error).
export function steerNitro(
  r: Pick<Runner, 'nitro' | 'planarForwardVector' | 'x' | 'yaw' | 'z'> &
    Partial<Runner>,
  target: { x: number; z: number },
  dt: number,
  { finalTick = false } = {},
) {
  if ((r.nitro <= 0 && !finalTick) || !target) {
    return;
  }
  const f = Math.fround,
    x = f(f(target.x) - f(r.x)),
    z = f(f(target.z) - f(r.z)),
    length = f(Math.sqrt(x * x + z * z)),
    inverse = length ? f(1 / length) : 0;
  const tx = f(x * inverse),
    tz = f(z * inverse),
    forward = r.planarForwardVector ?? {
      x: f(-Math.sin(r.yaw)),
      z: f(-Math.cos(r.yaw)),
    },
    rate = f(f(dt) * NITRO.steerDegrees),
    heading = f((r.yaw * 180) / Math.PI);
  r.yaw =
    (f((-f(forward.x) * tz + f(forward.z) * tx) * rate + heading) * Math.PI) /
    180;
}

// 0x4325e4 / 0x432754 apply damage per contact, without multiplying by dt.
// Collision detection and separation are still handled by the simulation.
export function runnerContact(
  sim: Simulation,
  a: Pick<
    Runner,
    | 'dead'
    | 'health'
    | 'id'
    | 'missileLockTarget'
    | 'nitro'
    | 'nitroTarget'
    | 'pendingDeath'
    | 'shield'
    | 'speed'
  > &
    Partial<Runner>,
  b: Pick<
    Runner,
    | 'dead'
    | 'health'
    | 'id'
    | 'missileLockTarget'
    | 'nitro'
    | 'nitroTarget'
    | 'pendingDeath'
    | 'shield'
    | 'speed'
  > &
    Partial<Runner>,
  { aImpact = true, bImpact = true } = {},
) {
  const boostedA = a.nitro > 0,
    boostedB = b.nitro > 0;
  const damageA = boostedA
    ? NITRO.contactDamage
    : Math.abs(a.speed) * NITRO.normalContactFactor;
  const damageB = boostedB
    ? NITRO.contactDamage
    : Math.abs(b.speed) * NITRO.normalContactFactor;
  if (aImpact) {
    if (boostedA && a.id === sim.player) {
      sim.addScore(NITRO.contactScore);
    }
    sim.damage(b, damageA, a.id, boostedA ? 'Nitro Ram' : 'Runner contact', {
      repeatLethal: true,
    });
  }
  if (bImpact) {
    if (boostedB && b.id === sim.player) {
      sim.addScore(NITRO.contactScore);
    }
    sim.damage(a, damageB, b.id, boostedB ? 'Nitro Ram' : 'Runner contact', {
      repeatLethal: true,
    });
  }
  if (b.health === 0 && boostedA) {
    a.nitro = 0;
    a.nitroTarget = null;
    a.missileLockTarget = null;
  }
  if (a.health === 0 && boostedB) {
    b.nitro = 0;
    b.nitroTarget = null;
    b.missileLockTarget = null;
  }
}
