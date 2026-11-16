import type { Vec3 } from './game-types.ts';
// Visual-only policy and state: never consumes the simulation RNG or changes runners.
export { AdaptiveResolution } from './adaptive-resolution.ts';
export const FOG_PROFILES = Object.freeze([
  [0x0b_11_18, 0.0009],
  [0x08_0d_18, 0.0008],
  [0x11_14_18, 0.00085],
  [0x10_11_18, 0.0009],
  [0x1a_0e_0b, 0.001],
  [0x0b_14_16, 0.00085],
  [0x12_11_0d, 0.0009],
  [0x16_0d_15, 0.0009],
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
    .toSorted(
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
    this.seed = 0x62_73_19_45;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
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
      color: [...color],
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
  step(inputDt: number) {
    let dt = inputDt;

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
