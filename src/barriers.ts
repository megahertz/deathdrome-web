import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
export const BARRIER = GAME_TABLES.secondary.barrier;
const point = (r: Pick<Runner, 'x' | 'z'> & Partial<Runner>) => ({
  x: r.x,
  y: 0,
  z: r.z,
});
export class BarrierTrails {
  declare states: {
    owner: number;
    active: boolean;
    held: boolean;
    armed: boolean;
    locked: boolean;
    generating: boolean;
    age: number;
    points: any[];
    retract: number;
  }[];

  constructor() {
    this.states = Array.from({ length: 8 }, (_, owner) => ({
      owner,
      active: false,
      held: false,
      armed: true,
      locked: false,
      generating: false,
      age: 0,
      points: [],
      retract: 0,
    }));
  }
  get active() {
    return this.states.filter((s) => s.active);
  }
  reset(id: number) {
    Object.assign(this.states[id], {
      active: false,
      held: false,
      armed: true,
      locked: false,
      generating: false,
      age: 0,
      points: [],
      retract: 0,
    });
  }
  input(
    r: Pick<Runner, 'dead' | 'disrupted' | 'id' | 'speed' | 'x' | 'y' | 'z'> &
      Partial<Runner>,
    held: boolean | undefined,
  ) {
    const s = this.states[r.id];
    s.held = !!held;
    if (!held) {
      s.generating = false;
      if (!s.active) {
        s.armed = true;
        s.locked = false;
      }
      return false;
    }
    const valid = r.y === 0 && r.speed > 0 && !r.dead && !r.disrupted;
    if (!valid) {
      s.generating = false;
      s.armed = false;
      return false;
    }
    if (!s.active) {
      if (s.locked) {
        return false;
      }
      if (!s.armed) {
        s.armed = true;
        return false;
      }
      Object.assign(s, {
        active: true,
        locked: true,
        generating: true,
        age: 0,
        retract: 0,
        points: [point(r), point(r)],
      });
      return true;
    }
    if (!s.generating) {
      return false;
    }
    s.points[s.points.length - 1] = point(r);
    const a = s.points.at(-2),
      d2 = (r.x - a.x) ** 2 + (r.z - a.z) ** 2;
    if (d2 >= BARRIER.segmentDistanceSquared) {
      if (s.points.length - 1 >= BARRIER.segments) {
        s.generating = false;
      } else {
        s.points.push(point(r));
      }
    }
    return false;
  }
  step(dt: number) {
    for (const s of this.active) {
      s.age += dt;
      if (s.age >= BARRIER.seconds) {
        s.generating = false;
        s.retract++;
        if (s.retract >= s.points.length - 1) {
          s.active = false;
          if (!s.held) {
            s.locked = false;
            s.armed = true;
          }
          continue;
        }
        // Native 436a00 collapses all earlier faces onto this endpoint.
        for (let i = 0; i < s.retract; i++) {
          s.points[i] = { ...s.points[s.retract] };
        }
      }
    }
  }
  contacts(
    trail: {
      owner: any;
      active?: boolean;
      held?: boolean;
      armed?: boolean;
      locked?: boolean;
      generating?: boolean;
      age?: number;
      points: any;
      retract?: number;
    },
    r: Pick<Runner, 'dead' | 'id' | 'x' | 'y' | 'z'> & Partial<Runner>,
  ) {
    if (
      r.id === trail.owner ||
      r.dead ||
      r.y > BARRIER.height * BARRIER.heightScale + BARRIER.verticalOffset ||
      r.y + 2 < BARRIER.verticalOffset
    ) {
      return false;
    }
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1],
        b = trail.points[i],
        dx = b.x - a.x,
        dz = b.z - a.z,
        len = dx * dx + dz * dz;
      if (len < 0.000001) {
        continue;
      }
      const t = Math.max(
        0,
        Math.min(1, ((r.x - a.x) * dx + (r.z - a.z) * dz) / len),
      );
      if (Math.hypot(r.x - a.x - t * dx, r.z - a.z - t * dz) < 2) {
        return true;
      }
    }
    return false;
  }
}
