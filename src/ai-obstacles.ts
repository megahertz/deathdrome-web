import { GAME_TABLES } from './game-tables.ts';
import type { Runner, Vec3 } from './game-types.ts';
import { type Simulation } from './simulation.ts';
export const AI_OBSTACLES = GAME_TABLES.ai.obstacles;
export const heldAIRates = (
  r: Pick<Runner, 'acceleration' | 'turn' | 'turnAcceleration'> &
    Partial<Runner>,
) => ({
  turn: r.turn,
  turnAcceleration: r.turnAcceleration,
  acceleration: r.acceleration,
});
const clock = (sim: { elapsed: number; countdown: number }) =>
  sim.elapsed + GAME_TABLES.entrance.seconds - sim.countdown;

// Barrier faces use the same connected vertical rectangles as the visual trail.
// This is a ray/face test, without the provisional runner-contact radius.
export function barrierRayContacts(
  start: Vec3,
  end: Vec3,
  trails:
    | {
        owner: number;
        active: boolean;
        held: boolean;
        armed: boolean;
        locked: boolean;
        generating: boolean;
        age: number;
        points: any[];
        retract: number;
      }[]
    | { owner: number; points: { x: number; z: number }[] }[],
) {
  const hits = [],
    dx = end.x - start.x,
    dz = end.z - start.z,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy, dz),
    { barrier } = GAME_TABLES.secondary;
  for (const trail of trails) {
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1],
        b = trail.points[i],
        ex = b.x - a.x,
        ez = b.z - a.z,
        den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) {
        continue;
      }
      const ax = a.x - start.x,
        az = a.z - start.z,
        t = (ax * ez - az * ex) / den,
        u = (ax * dz - az * dx) / den,
        y = start.y + t * dy;
      if (
        t >= 0 &&
        t <= 1 &&
        u >= 0 &&
        u <= 1 &&
        y >= barrier.verticalOffset &&
        y <= barrier.verticalOffset + barrier.height * barrier.heightScale
      ) {
        hits.push({
          kind: 'barrier',
          owner: trail.owner,
          distance: t * length,
        });
        break;
      }
    }
  }
  return hits;
}

// Native 42d20c / 42c05b probe exactly 20 units along the full runner forward
// basis at +1.5Y. Each endpoint is a native float store; the end Y adds the
// lift to the unrounded position-plus-forward result, not the stored start Y.
export function probeAIForward(
  sim: Simulation,
  r: Pick<Runner, 'forwardVector' | 'id' | 'x' | 'y' | 'yaw' | 'z'> &
    Partial<Runner>,
) {
  const f = r.forwardVector || {
      x: -Math.sin(r.yaw),
      y: 0,
      z: -Math.cos(r.yaw),
    },
    F = Math.fround,
    x = F(r.x),
    y = F(r.y),
    z = F(r.z),
    length = AI_OBSTACLES.probeLength,
    height = AI_OBSTACLES.probeHeight;
  const start = { x, y: F(y + height), z },
    end = {
      x: F(x + F(f.x) * length),
      y: F(y + F(f.y || 0) * length + height),
      z: F(z + F(f.z) * length),
    };
  let hits;
  if (sim.sceneContacts) {
    hits = sim.sceneContacts(start, end, r);
  } else if (sim.lineBlocked(start, end)) {
    hits = [{ kind: 'wall' }];
  } else {
    hits = [];
  }

  hits = [
    ...hits,
    ...barrierRayContacts(start, end, sim.barrierTrails?.active || []),
  ].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  if (hits.length) {
    sim.emit('aiProbe', {
      runner: r.id,
      hits: hits.map((h: { kind: any; owner: any; runner: any }) => ({
        kind: h.kind,
        owner: h.owner,
        runner: h.runner,
      })),
    });
  }
  return hits;
}

export function requestAIBarrierJump(
  sim: Simulation,
  r: Pick<Runner, 'aiState'> & Partial<Runner>,
  { attack = false } = {},
) {
  r.aiState.pendingJump = true;
  const random = sim.randomInt();
  // The path branch performs unsigned integer division, unlike the attack and
  // periodic jump schedules. Preserve this encoded distinction.
  const delay = attack
    ? random *
      AI_OBSTACLES.attackJumpRandomScale *
      AI_OBSTACLES.attackJumpSeconds
    : Math.floor(random / AI_OBSTACLES.pathJumpDivisor) *
      AI_OBSTACLES.pathJumpSeconds;
  r.aiState.jumpAt = Math.fround(clock(sim) + delay);
}
