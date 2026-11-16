import { disableControls } from './drive.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { type Simulation } from './simulation.ts';
export const SECONDARY = GAME_TABLES.secondary;
const forward = (r: Pick<Runner, 'yaw'> & Partial<Runner>) => ({
  x: -Math.sin(r.yaw),
  z: -Math.cos(r.yaw),
});
const dot = (
  r: Pick<Runner, 'x' | 'yaw' | 'z'> & Partial<Runner>,
  q: { x: number; z: number },
) => {
  const f = forward(r);
  return (q.x - r.x) * f.x + (q.z - r.z) * f.z;
};

// Native per-runner objects: a second Disruptor is rejected, but attempting a
// second active ShockWave still consumes that inventory slot (4375b5/440530).
export function launchSecondary(
  sim: import('./simulation.ts').Simulation,
  r: Pick<
    Runner,
    'id' | 'ionSeconds' | 'ionTarget' | 'speed' | 'x' | 'y' | 'yaw' | 'z'
  > &
    Partial<Runner>,
  weapon: string,
) {
  const active = (kind: any) =>
    sim.projectiles.some(
      (p: { owner: any; kind: any; life: number }) =>
        p.owner === r.id && p.kind === kind && p.life > 0,
    );
  if (weapon === 'ShockWave') {
    if (!active(weapon)) {
      sim.projectiles.push({
        kind: weapon,
        owner: r.id,
        x: r.x,
        y: r.y,
        z: r.z,
        scale: 1,
        life: SECONDARY.shockWave.seconds,
      } as import('./game-types.ts').Projectile);
    }
  } else if (weapon === 'Disruptor') {
    if (active(weapon)) {
      return false;
    }
    const f = forward(r),
      c = SECONDARY.disruptor;
    sim.projectiles.push({
      kind: weapon,
      owner: r.id,
      x: r.x + f.x * c.launchDistance,
      y: r.y,
      z: r.z + f.z * c.launchDistance,
      dx: f.x,
      dz: f.z,
      speed: c.baseSpeed + Math.max(0, r.speed),
      scale: 1,
      rotation: 0,
      life: c.seconds,
    } as import('./game-types.ts').Projectile);
  } else if (weapon === 'Ion Sword') {
    r.ionSeconds = SECONDARY.ionSword.seconds;
    r.ionTarget = null;
  }
  return true;
}

export function acquireIonTarget(
  sim: Simulation,
  r: Pick<Runner, 'id' | 'x' | 'y' | 'yaw' | 'z'> & Partial<Runner>,
) {
  const c = SECONDARY.ionSword;
  let best = -1;
  let target = null;
  for (const q of sim.runners) {
    if (
      q.id === r.id ||
      q.dead ||
      q.health <= 0 ||
      Math.abs(q.y - r.y) >= c.verticalBand
    ) {
      continue;
    }
    const d2 = (q.x - r.x) ** 2 + (q.z - r.z) ** 2,
      projection = dot(r, q);
    if (projection <= c.acquireDot || d2 >= c.rangeSquared) {
      continue;
    }
    const score = projection / d2;
    if (score > best) {
      best = score;
      target = q.id;
    }
  }
  return target;
}

export function stepIon(
  sim: Simulation,
  r: Pick<
    Runner,
    'dead' | 'id' | 'ionSeconds' | 'ionTarget' | 'x' | 'y' | 'yaw' | 'z'
  > &
    Partial<Runner>,
  dt: number,
) {
  if (!r.ionSeconds || r.dead) {
    return;
  }
  r.ionSeconds = Math.max(0, r.ionSeconds - dt);
  if (!r.ionSeconds) {
    r.ionTarget = null;
    return;
  }
  if (r.ionTarget == null) {
    r.ionTarget = acquireIonTarget(sim, r);
  }
  const q = sim.runners[r.ionTarget!];
  if (!q) {
    return;
  }
  // Range and height only constrain acquisition in the original; a retained
  // target is released on death or when it passes behind the runner.
  if (q.dead || q.health <= 0 || dot(r, q) <= SECONDARY.ionSword.retainDot) {
    r.ionTarget = null;
    return;
  }
  sim.damage(q, SECONDARY.ionSword.damagePerSecond * dt, r.id, 'Ion Sword', {
    armor: false,
    continuous: true,
  });
  if (q.health === 0) {
    if (r.id === sim.player) {
      sim.addScore(SECONDARY.ionSword.killScore);
    }
    r.ionTarget = null;
  }
}

export function stepSecondaryProjectile(
  sim: Simulation,
  p: {
    owner: any;
    kind: any;
    x: any;
    y: any;
    z: any;
    life: any;
    scale: any;
    dx?: any;
    speed?: any;
    dz?: any;
    rotation?: any;
  },
  dt: number,
) {
  p.life -= dt;
  if (p.life <= 0) {
    return;
  }
  if (p.kind === 'ShockWave') {
    const c = SECONDARY.shockWave;
    p.scale = Math.min(c.maximumScale, p.scale + c.growth * dt);
    for (const q of sim.runners) {
      if (q.id === p.owner || q.dead || Math.abs(q.y - p.y) >= c.verticalBand) {
        continue;
      }
      // The mesh is a filled regular dodecagon. Runner extent remains provisional.
      const angle = Math.atan2(q.z - p.z, q.x - p.x),
        sector = Math.PI / 6;
      const edge =
        (c.radius * p.scale * Math.cos(Math.PI / 12)) /
        Math.cos(
          ((((angle + Math.PI / 12) % sector) + sector) % sector) -
            Math.PI / 12,
        );
      if (Math.hypot(q.x - p.x, q.z - p.z) > edge + 2) {
        continue;
      }
      sim.damage(q, c.damage, p.owner, p.kind, {
        armor: false,
        power: false,
        repeatLethal: true,
      });
      if (p.owner === sim.player) {
        sim.addScore(c.contactScore);
      }
    }
  } else if (p.kind === 'Disruptor') {
    const c = SECONDARY.disruptor;
    p.scale += c.growth * dt;
    p.x += p.dx * p.speed * dt;
    p.z += p.dz * p.speed * dt;
    p.rotation += (c.degreesPerUpdate * Math.PI) / 180;
    for (const q of sim.runners) {
      if (
        q.id === p.owner ||
        q.dead ||
        q.shield > 0 ||
        q.controlsEnabled === false
      ) {
        continue;
      }
      if (
        Math.hypot(q.x - p.x, q.z - p.z) > c.radius * p.scale + 2 ||
        q.y + 2 < p.y ||
        q.y > p.y + c.height * p.scale
      ) {
        continue;
      }
      disableControls(q, c.disabledSeconds);
      sim.emit('disrupted', { runner: q.id, owner: p.owner });
      if (p.owner === sim.player) {
        sim.addScore(c.contactScore);
      }
    }
  }
}
