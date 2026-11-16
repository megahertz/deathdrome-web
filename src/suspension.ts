import { originalDamping } from './drive.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner, GroundHit, Vec3 } from './game-types.ts';
import { projectileForward } from './weapon-emitters.ts';
const f = Math.fround,
  DEGREES = 180 * 0.31830988614222805,
  ROLL_SPAN = f(0.9);
export const SUPPORT = Object.freeze({
  frontDistance: 8,
  sideDistance: ROLL_SPAN,
  gravity: 98,
  springRate: f(6.1),
  flatRebound: f(-0.1),
  flatCompression: f(-0.6),
  minimumReach: 2,
  ceiling: 64,
});

function hits(
  query: (x: number, z: number, y: number) => number | GroundHit[],
  x: number,
  z: number,
  y: number,
) {
  const result = query(x, z, y);
  return Array.isArray(result)
    ? result
    : [{ height: result, normal: { x: 0, y: 1, z: 0 } }];
}
function select(point: Vec3, reach: number, contacts: any[]) {
  let height = 0,
    normal = { x: 0, y: 1, z: 0 };
  for (const hit of contacts) {
    const h = f(hit.height);
    if (h > height && (point.y >= h || h - point.y < reach)) {
      height = h;
      normal = hit.normal;
    }
  }
  return { height, normal };
}
// Real 4301ac applies a spring response at support contact. Flat surfaces
// rebound a falling point when the target differs from its previous height.
export function stepSupportPoint(
  y: number,
  inputVelocity: number,
  floor: number,
  normalY: number,
  dt: number,
) {
  let velocity = inputVelocity;

  const gravityStep = f(dt * SUPPORT.gravity),
    next = f(y + dt * velocity);
  if (next - dt * gravityStep > floor) {
    return { y: next, velocity: f(velocity - gravityStep) };
  }
  let displacement = f(floor - y);
  if (displacement === 0) {
    return { y: floor, velocity: 0 };
  }
  if (displacement < 0 && normalY === 1) {
    displacement = f(displacement * SUPPORT.flatCompression);
    velocity = f(velocity * SUPPORT.flatRebound);
  }
  const damping = originalDamping(f(dt * SUPPORT.springRate));
  return {
    y: floor,
    velocity: f(((1 - damping) * displacement) / dt + damping * velocity),
  };
}

export function chassisMatrix(r: Pick<Runner, 'yaw'> & Partial<Runner>) {
  const rad = 3.141592654 / 180,
    p = f(r.chassisPitchDegrees ?? 0) * rad,
    y = f((r.yaw * 180) / Math.PI) * rad,
    z = f(r.chassisRollDegrees ?? 0) * rad;
  const sx = f(Math.sin(p)),
    cx = f(Math.cos(p)),
    sy = f(Math.sin(y)),
    cy = f(Math.cos(y)),
    sz = f(Math.sin(z)),
    cz = f(Math.cos(z));
  return [
    f(cy * cz + sy * sx * sz),
    f(cx * sz),
    f(-sy * cz + cy * sx * sz),
    f(-cy * sz + sy * sx * cz),
    f(cx * cz),
    f(sy * sz + cy * sx * cz),
    f(sy * cx),
    -sx,
    f(cy * cx),
  ];
}
export function localToWorld(
  r: Pick<Runner, 'chassisPitchDegrees' | 'chassisRollDegrees' | 'yaw'> &
    Partial<Runner>,
  v: Vec3,
) {
  const m = chassisMatrix(r);
  return {
    x: f(v.x * m[0] + v.y * m[3] + v.z * m[6]),
    y: f(v.x * m[1] + v.y * m[4] + v.z * m[7]),
    z: f(v.x * m[2] + v.y * m[5] + v.z * m[8]),
  };
}
export function worldToLocal(
  r: Pick<Runner, 'chassisPitchDegrees' | 'chassisRollDegrees' | 'yaw'> &
    Partial<Runner>,
  v: Vec3,
) {
  const m = chassisMatrix(r);
  return {
    x: f(v.x * m[0] + v.y * m[1] + v.z * m[2]),
    y: f(v.x * m[3] + v.y * m[4] + v.z * m[5]),
    z: f(v.x * m[6] + v.y * m[7] + v.z * m[8]),
  };
}
export function beginJump(
  r: Pick<
    Runner,
    | 'actionMode'
    | 'chassisPitchDegrees'
    | 'chassisRollDegrees'
    | 'frontVelocity'
    | 'lateralSpeed'
    | 'localVerticalSpeed'
    | 'previousActionMode'
    | 'sideVelocity'
    | 'speed'
    | 'supportContact'
    | 'vy'
    | 'worldVelocity'
    | 'yaw'
  > &
    Partial<Runner>,
) {
  if (r.actionMode === 2 || !r.supportContact) {
    return false;
  }
  r.vy = f(r.vy + GAME_TABLES.vertical.jumpImpulse);
  r.frontVelocity = r.vy;
  r.sideVelocity = r.vy;
  // 430f18 transforms the changed world velocity back into the local basis.
  const world =
    r.worldVelocity ??
    localToWorld(r, {
      x: r.lateralSpeed ?? 0,
      y: r.localVerticalSpeed ?? 0,
      z: -r.speed,
    });
  r.worldVelocity = { ...world, y: r.vy };
  const local = worldToLocal(r, r.worldVelocity);
  r.lateralSpeed = local.x;
  r.localVerticalSpeed = local.y;
  r.speed = -local.z;
  r.previousActionMode = r.actionMode ?? 1;
  r.actionMode = 2;
  return true;
}

export function stepSuspension(
  r: Pick<
    Runner,
    | 'actionMode'
    | 'chassisPitchDegrees'
    | 'chassisRollDegrees'
    | 'deltaX'
    | 'deltaZ'
    | 'floor'
    | 'forwardVector'
    | 'frontVelocity'
    | 'grounded'
    | 'previousActionMode'
    | 'sideVelocity'
    | 'slopeImpulse'
    | 'supportBrake'
    | 'supportContact'
    | 'vy'
    | 'x'
    | 'y'
    | 'yaw'
    | 'z'
  > &
    Partial<Runner>,
  inputDt: number,
  query: (x: number, z: number, y: number) => number | GroundHit[],
  worldVelocity: { x: any; y: any; z: any },
  {
    onFrontContacts = () => {},
  }: { onFrontContacts?: (hits: GroundHit[]) => void } = {},
) {
  let dt = inputDt;

  const wasGrounded = r.grounded,
    wasJumping = r.actionMode === 2;
  dt = f(dt);
  const forward = projectileForward(r),
    center = { x: f(r.x), y: f(r.y), z: f(r.z) },
    front = {
      x: f(center.x + 8 * forward.x),
      y: f(center.y + 8 * forward.y),
      z: f(center.z + 8 * forward.z),
    },
    side = {
      x: f(center.x - ROLL_SPAN * forward.z),
      y: f(
        center.y +
          Math.sin((f(r.chassisRollDegrees ?? 0) * 3.141592654) / 180) *
            ROLL_SPAN,
      ),
      z: f(center.z + ROLL_SPAN * forward.x),
    };
  const points = [center, front, side],
    contacts = points.map((p) => hits(query, p.x, p.z, p.y));
  // 430606 -> 434de0 -> 435500 receives the front support list, once.
  // Center/side altitude queries and wall sweeps do not activate a portal.
  onFrontContacts(contacts[1]);
  let minimumNormal = { x: 0, y: 1, z: 0 };
  for (const list of contacts) {
    for (const h of list) {
      if (h.normal.y < minimumNormal.y) {
        minimumNormal = h.normal;
      }
    }
  }
  const steepness =
      minimumNormal.y === 1 ? 0 : Math.hypot(minimumNormal.x, minimumNormal.z),
    reach =
      steepness === 0
        ? 2
        : f(
            Math.max(
              2,
              steepness *
                1.4 *
                (Math.abs(r.deltaX ?? 0) + Math.abs(r.deltaZ ?? 0)),
            ),
          );
  const floors = points.map((p, i) => select(p, reach, contacts[i]));
  if (floors[1].height < floors[0].height) {
    const probe = {
        x: f(center.x + 2 * forward.x),
        y: f(center.y + 2 * forward.y),
        z: f(center.z + 2 * forward.z),
      },
      floor = select(probe, reach, hits(query, probe.x, probe.z, probe.y));
    if (probe.y <= floor.height) {
      floors[1].height = f(
        Math.max(
          floors[1].height,
          f(floors[0].height + f((floor.height - floors[0].height) * 4)) - 0.5,
        ),
      );
    }
  }
  const c = stepSupportPoint(
      center.y,
      worldVelocity.y,
      floors[0].height,
      floors[0].normal.y,
      dt,
    ),
    a = stepSupportPoint(
      front.y,
      r.frontVelocity ?? worldVelocity.y,
      floors[1].height,
      floors[1].normal.y,
      dt,
    ),
    b = stepSupportPoint(
      side.y,
      r.sideVelocity ?? worldVelocity.y,
      floors[2].height,
      floors[2].normal.y,
      dt,
    );
  r.supportContact = a.y === floors[1].height || c.y === floors[0].height;
  if (
    a.y === floors[1].height &&
    c.y === floors[0].height &&
    b.y > floors[2].height + ROLL_SPAN
  ) {
    b.y = c.y;
    b.velocity = c.velocity;
  }
  r.slopeImpulse = 0;
  r.grounded = Math.abs(c.y - floors[0].height) < 1;
  r.supportBrake = r.grounded ? 2 : f(0.2);
  if (r.grounded) {
    r.slopeImpulse = f(dt * 98 * forward.y);
    if (r.actionMode === 2) {
      r.actionMode = r.previousActionMode ?? 1;
      if (c.velocity < 0) {
        c.velocity = 0;
        b.velocity = 0;
      }
      if (a.velocity < 0) {
        a.velocity = 0;
      }
    }
  } else {
    if (
      (r.chassisPitchDegrees ?? 0) > 0 &&
      a.velocity > 0 &&
      a.velocity > c.velocity
    ) {
      b.velocity = a.velocity;
      c.velocity = b.velocity;
    }
    if (a.y !== floors[1].height && b.y !== floors[2].height) {
      if ((r.chassisPitchDegrees ?? 0) < -20) {
        b.velocity = a.velocity;
        c.velocity = b.velocity;
      } else if (r.actionMode !== 2) {
        a.velocity = f(c.velocity - 15);
      }
    }
  }
  r.chassisPitchDegrees = f(
    Math.asin(Math.max(-1, Math.min(1, f((a.y - c.y) * 0.125)))) * DEGREES,
  );
  r.chassisRollDegrees = Math.max(
    -50,
    Math.min(
      50,
      f(
        Math.asin(
          Math.max(-1, Math.min(1, f((b.y - c.y) * f(1 / ROLL_SPAN)))),
        ) * DEGREES,
      ),
    ),
  );
  if (c.y !== floors[0].height && b.y !== floors[2].height) {
    r.chassisRollDegrees = f(r.chassisRollDegrees * originalDamping(0.5));
    b.velocity = c.velocity;
  }
  r.y = c.y;
  if (r.y > 64) {
    r.y = 64;
    c.velocity = -Math.abs(c.velocity);
  }
  r.vy = c.velocity;
  r.frontVelocity = a.velocity;
  r.sideVelocity = b.velocity;
  r.floor = floors[0].height;
  const world = { x: worldVelocity.x, y: c.velocity, z: worldVelocity.z },
    local = worldToLocal(r, world);
  return {
    world,
    local,
    points,
    floors,
    reach,
    landingCalls: r.grounded ? Number(!wasGrounded) + Number(wasJumping) : 0,
  };
}
