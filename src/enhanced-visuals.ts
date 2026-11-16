import type { Vec3 } from './game-types.ts';
// Visual-only policy and state: never consumes the simulation RNG or changes runners.
export class AdaptiveResolution {
  declare factor: number;
  declare elapsed: number;
  declare slow: number;
  declare fast: number;
  declare cooldown: number;
  declare average: number;

  constructor() {
    this.reset();
  }
  reset() {
    this.factor = 1;
    this.elapsed = 0;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 0;
    this.average = 1 / 60;
  }
  sample(dt: number, active = true) {
    if (!active || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
      return this.factor;
    }
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.average += (dt - this.average) * 0.08;
    if (this.elapsed < 2) {
      return this.factor;
    } // Ignore shader compilation and entry transitions.
    this.slow = this.average > 1 / 43 ? this.slow + dt : 0;
    this.fast = this.average < 1 / 57 ? this.fast + dt : 0;
    if (!this.cooldown && this.slow > 1) {
      this.factor = Math.max(0.4, this.factor - 0.15);
      this.cooldown = 2;
      this.fast = 0;
      this.slow = this.fast;
    } else if (!this.cooldown && this.fast > 6) {
      this.factor = Math.min(1, this.factor + 0.1);
      this.cooldown = 3;
      this.fast = 0;
      this.slow = this.fast;
    }
    return this.factor;
  }
}
export const FOG_PROFILES = Object.freeze([
  [0x0b1118, 0.0009],
  [0x080d18, 0.0008],
  [0x111418, 0.00085],
  [0x101118, 0.0009],
  [0x1a0e0b, 0.001],
  [0x0b1416, 0.00085],
  [0x12110d, 0.0009],
  [0x160d15, 0.0009],
]);
export function contactShadowPose(
  r: { x: any; y: any; z: any; yaw: any; dead?: any; inactive?: any },
  supports: any[],
) {
  if (r.dead || r.inactive) {
    return null;
  }
  const floor = supports
    .filter(
      (p: { height: number; normal: { y: any } }) =>
        p.height <= r.y + 0.4 && Math.abs(p.normal?.y || 0) > 0.35,
    )
    .sort(
      (a: { height: number }, b: { height: number }) => b.height - a.height,
    )[0];
  if (!floor) {
    return null;
  }
  const height = Math.max(0, r.y - floor.height);
  if (height > 55) {
    return null;
  }
  return {
    x: r.x,
    y: floor.height + 0.035,
    z: r.z,
    normal: floor.normal,
    yaw: r.yaw || 0,
    scale: 1 + Math.min(30, height) * 0.035,
    opacity: 0.28 / (1 + height * 0.11),
  };
}
export class VisualParticles {
  declare capacity: number;
  declare items: any[];
  declare seed: number;

  constructor(capacity = 384) {
    this.capacity = capacity;
    this.items = [];
    this.seed = 0x62731945;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  clear() {
    this.items.length = 0;
  }
  add(
    position: Vec3,
    {
      color = [1, 0.55, 0.12],
      life = 0.4,
      size = 0.16,
      speed = 6,
      smoke = false,
      trail = false,
    } = {},
  ) {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    const angle = this.random() * Math.PI * 2,
      horizontal = trail ? 0 : this.random() * speed;
    this.items.push({
      x: position.x,
      y: position.y,
      z: position.z,
      vx: Math.cos(angle) * horizontal,
      vy: trail ? 0 : 1 + this.random() * (smoke ? 2 : speed),
      vz: Math.sin(angle) * horizontal,
      age: 0,
      life,
      size,
      color: color.slice(),
      smoke,
      trail,
    });
  }
  burst(position: Vec3, large = false) {
    for (let i = 0; i < (large ? 30 : 9); i++) {
      this.add(position, {
        life: 0.2 + this.random() * 0.5,
        speed: large ? 14 : 7,
        size: large ? 0.2 : 0.12,
      });
    }
    if (large) {
      for (let i = 0; i < 12; i++) {
        this.add(position, {
          color: [0.22, 0.24, 0.26],
          life: 1.2 + this.random(),
          speed: 3,
          size: 1.2 + this.random() * 1.4,
          smoke: true,
        });
      }
    }
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }
    dt = Math.min(dt, 0.1);
    this.items = this.items.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) {
        return false;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.smoke && !p.trail) {
        p.vy -= 12 * dt;
      }
      return true;
    });
  }
}
