import { GAME_TABLES } from '../../src/game-tables.ts';
import type { Runner, Projectile, Vec3 } from '../../src/game-types.ts';
import type { ContactNode } from '../../src/scene-nodes.ts';
import { findContactNode } from '../../src/scene-nodes.ts';
import type { Simulation } from '../../src/simulation.ts';
import { mapVec3 } from '../../src/vector.ts';
const f = Math.fround;
export function primarySegment(previous: Vec3, current: Vec3) {
  return {
    from: { x: f(previous.x), y: f(f(previous.y) + 1), z: f(previous.z) },
    to: { x: f(current.x), y: f(f(current.y) + 1), z: f(current.z) },
  };
}
function normalized(v: Vec3) {
  const length = f(Math.sqrt(v.y * v.y + v.x * v.x + v.z * v.z)),
    inverse = length ? f(1 / length) : 0;
  return { x: f(v.x * inverse), y: f(v.y * inverse), z: f(v.z * inverse) };
}
function impactPoint(previous: Vec3, point: Vec3) {
  const d = normalized(mapVec3((k) => f(f(previous[k]) - f(point[k]))));
  return mapVec3((k) => f(f(point[k]) + f(d[k] * 3)));
}
export function primaryRecoil(target: Runner, velocity: Vec3) {
  const d = normalized({
      x: f(velocity.x),
      y: f(velocity.y),
      z: f(velocity.z),
    }),
    world = { x: f(d.x * 30), y: f(d.y * 30), z: f(d.z * 30) },
    angle = (-f((target.yaw * 180) / Math.PI) * 3.141592654) / 180,
    c = f(Math.cos(angle)),
    s = f(Math.sin(angle));
  target.lateralSpeed = f(world.z * s + world.x * c);
  target.localVerticalSpeed = world.y;
  target.speed = -f(world.z * c - world.x * s);
}
export function applyPrimaryHit(
  sim: Simulation,
  p: Projectile,
  target: Runner | undefined,
) {
  if (!target || target.id === p.owner || target.health === 0) {
    return false;
  }
  const owner = sim.runners[p.owner],
    previous = target.health;
  if (p.owner === sim.player) {
    sim.addScore(
      p.kind === 'Missile'
        ? GAME_TABLES.combat.missileHitScore
        : GAME_TABLES.combat.laserHitScore,
    );
  }
  sim.damage(target, p.damage, p.owner, p.kind);
  if (previous > 0 && target.health === 0) {
    owner.lastHitWeaponCode = p.kind === 'Missile' ? 1 : 4;
    target.killedByRunner = p.owner;
  }
  primaryRecoil(target, {
    x: p.vx ?? f(p.dx * p.speed),
    y: p.vy ?? f((p.dy || 0) * p.speed),
    z: p.vz ?? f(p.dz * p.speed),
  });
  if (target.id === sim.player) {
    sim.emit('paletteFlash', { runner: target.id, frames: 2 });
  }
  return true;
}
// 435d68 handles EVERY returned node in source traversal order. An ordinary
// wall does not short-circuit later records; there is no nearest-hit sort.
export function dispatchPrimaryContacts(
  sim: Simulation,
  p: Projectile,
  previous: Vec3,
  hits: { node: ContactNode; point: Vec3; wreck: number }[],
) {
  const impact = (point: Vec3, sound = true) => {
    let soundId = null;
    if (sound) {
      const state = sim.keepMovingState;
      soundId = 11 + state.impactVoice;
      state.impactVoice = (state.impactVoice + 1) % 8;
    }
    sim.emit('primaryImpact', {
      owner: p.owner,
      point: { x: f(point.x), y: f(point.y), z: f(point.z) },
      sound,
      soundId,
    });
  };
  if (p.y < 0 || p.y > 64) {
    impact(p);
    p.life = 0;
    return true;
  }
  if (!hits.length) {
    return false;
  }
  for (const hit of hits) {
    const { node } = hit,
      point = impactPoint(previous, hit.point),
      hot = findContactNode(node, 'HotSpot_parent');
    if (hot) {
      const id = Number(hot.name.slice(15)),
        spot = sim.hotSpots.spots[id];
      if (spot) {
        const action = sim.hotSpots.trigger(spot, p.owner);
        if (action) {
          sim.emit('hotSpot', { spot: id, runner: p.owner, action });
        }
      }
      impact(point, false);
    }
    const runner = findContactNode(node, 'runner_');
    if (runner) {
      impact(point);
      const id = runner.name.charCodeAt(7) - 48;
      if (id >= 0 && id < sim.runners.length) {
        applyPrimaryHit(sim, p, sim.runners[id]);
      }
      continue;
    }
    if (findContactNode(node, 'barrier_')) {
      impact(point);
      continue;
    }
    const body = findContactNode(node, 'dedbody');
    if (body) {
      sim.emit('bodyHit', { runner: hit.wreck, owner: p.owner, soundId: 3 });
      if (p.owner === sim.player) {
        sim.addScore(GAME_TABLES.wreck.bodyHitScore);
      }
      const wreck = sim.wrecks.states[hit.wreck];
      if (wreck) {
        sim.wrecks.hitBody(wreck);
      }
      impact(point);
      continue;
    }
    // Native strncmp checks the hit node itself before parent lookup. A child
    // under door_x does not acquire keys or activate a secret lift by itself.
    if (node?.name.startsWith('door_')) {
      sim.doors.touch(node.name.charAt(5), sim.runners[p.owner]);
    }
    impact(point);
  }
  p.life = 0;
  return true;
}
